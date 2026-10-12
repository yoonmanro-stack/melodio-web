'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { buildGenerationSpec } = require('./healing-rain-plan');
const provider = require('./healing-rain-provider');
const { renderHealingRain } = require('./healing-rain-render');

const BUCKET = 'healing-rain';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function settings(env = process.env) {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'KIE_API_KEY', 'ELEVENLABS_API_KEY', 'HEALING_RAIN_OUTPUT_ROOT'];
  for (const name of required) if (!env[name]) throw new Error(`Missing worker setting: ${name}`);
  if (!path.isAbsolute(env.HEALING_RAIN_OUTPUT_ROOT)) throw new Error('Output root must be absolute.');
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, service: env.SUPABASE_SERVICE_ROLE_KEY,
    kie: env.KIE_API_KEY, eleven: env.ELEVENLABS_API_KEY, root: env.HEALING_RAIN_OUTPUT_ROOT };
}

async function atomicJson(filename, value) {
  await fs.writeFile(`${filename}.partial`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(`${filename}.partial`, filename);
}

async function runJob(client, initial, config) {
  if (!UUID.test(initial.id) || !UUID.test(initial.user_id)) throw new Error('Invalid claimed identity.');
  let job = initial;
  let lostLease = false;
  let heartbeatBusy = false;
  const dir = path.join(config.root, job.id);
  let spec;

  async function patch(update) {
    if (lostLease) throw Object.assign(new Error('Worker lease was lost.'), { code: 'lease_lost' });
    const { data, error } = await client.rpc('update_healing_rain_generation', {
      p_job_id: job.id, p_claim_token: job.claim_token, p_patch: update, p_lease_seconds: 180,
    });
    if (error || !data?.length) {
      lostLease = true;
      throw Object.assign(new Error('Worker state could not be confirmed.'), { code: 'lease_lost' });
    }
    job = data[0];
    await atomicJson(path.join(dir, 'checkpoint.json'), { jobId: job.id, status: job.status, stage: job.stage, checkpoints: job.checkpoints, assets: job.assets, actualUsage: job.actual_usage });
  }

  const heartbeat = setInterval(async () => {
    if (heartbeatBusy || lostLease) return;
    heartbeatBusy = true;
    try {
      const { data, error } = await client.rpc('update_healing_rain_generation', {
        p_job_id: job.id, p_claim_token: job.claim_token, p_patch: {}, p_lease_seconds: 180,
      });
      if (error || !data?.length) lostLease = true;
    } catch { lostLease = true; }
    finally { heartbeatBusy = false; }
  }, 30000);

  async function checkpoint(key, item, extra = {}) {
    await patch({ ...extra, checkpoints: { ...job.checkpoints, [key]: item } });
  }

  async function storeAsset(key, filename, mimeType, durationSeconds) {
    const bytes = await fs.readFile(filename);
    if (!bytes.length || bytes.length > 200 * 1024 ** 2) throw new Error('Invalid generated asset size.');
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const objectName = key === 'preview30' || key === 'preview180'
      ? `${path.basename(path.dirname(filename))}-${path.basename(filename)}` : path.basename(filename);
    const objectPath = `${job.user_id}/${job.id}/${objectName}`;
    const { error } = await client.storage.from(BUCKET).upload(objectPath, bytes, { contentType: mimeType, upsert: false });
    if (error) {
      // An interrupted upload may already have completed. Verify before reusing.
      const { data: existing, error: readError } = await client.storage.from(BUCKET).download(objectPath);
      if (readError || !existing) throw new Error('Private asset upload failed.');
      const old = Buffer.from(await existing.arrayBuffer());
      if (crypto.createHash('sha256').update(old).digest('hex') !== sha256) throw new Error('Private asset content conflict.');
    }
    const asset = { path: objectPath, mimeType, bytes: bytes.length, ...(durationSeconds ? { durationSeconds } : {}) };
    await patch({ assets: { ...job.assets, [key]: asset } });
    return { asset, sha256 };
  }

  async function restoreAsset(key, filename) {
    const asset = job.assets?.[key];
    if (!asset || asset.path !== `${job.user_id}/${job.id}/${path.basename(filename)}`) throw new Error('Completed source asset is missing.');
    try {
      const bytes = await fs.readFile(filename);
      const expected = job.checkpoints?.[key]?.sha256;
      if (bytes.length === asset.bytes && (!expected || crypto.createHash('sha256').update(bytes).digest('hex') === expected)) return filename;
      throw new Error('Local source artifact conflicts with the saved asset.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const { data, error } = await client.storage.from(BUCKET).download(asset.path);
    if (error || !data) throw new Error('Private source download failed.');
    const bytes = Buffer.from(await data.arrayBuffer());
    if (!bytes.length || bytes.length !== asset.bytes) throw new Error('Private source size mismatch.');
    const expected = job.checkpoints?.[key]?.sha256;
    if (expected && crypto.createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Private source hash mismatch.');
    await fs.writeFile(filename, bytes, { flag: 'wx', mode: 0o600 });
    return filename;
  }

  function usage(kind, cost) {
    const previous = job.actual_usage || {};
    const credits = kind === 'kie' ? 'kieCredits' : 'elevenLabsCredits';
    const calls = kind === 'kie' ? 'kieCalls' : 'elevenLabsCalls';
    return { ...previous, [credits]: (previous[credits] || 0) + (Number.isFinite(cost) ? cost : 0),
      [calls]: (previous[calls] || 0) + 1, unreportedCost: Boolean(previous.unreportedCost || !Number.isFinite(cost)) };
  }

  async function kieStage(key, model, input, filename, mimeType, progress, durationSeconds) {
    let saved = job.checkpoints?.[key];
    if (saved?.state === 'ready') return restoreAsset(key, filename);
    if (saved?.state === 'intent' || saved?.state === 'needs_attention') {
      throw Object.assign(new Error('Previous paid submission is held. No automatic resubmission.'), { ambiguous: true, code: saved.outcome === 'failed' ? 'provider_task_failed' : 'submission_unknown' });
    }
    if (!saved?.taskId) {
      saved = { state: 'intent', provider: 'kie', model, intentAt: new Date().toISOString() };
      await checkpoint(key, saved, { stage: `${key}_submitting`, progress });
      const submitted = await provider.createKieTask({ model, input, apiKey: config.kie });
      saved = { ...saved, state: 'submitted', taskId: submitted.taskId };
      await atomicJson(path.join(dir, `${key}-submission-${submitted.taskId}.json`), saved);
      await checkpoint(key, saved, { stage: `${key}_generating` });
    }
    const deadline = Date.now() + 35 * 60 * 1000;
    while (Date.now() < deadline) {
      if (lostLease) throw Object.assign(new Error('Worker lease lost.'), { code: 'lease_lost' });
      const result = await provider.pollKieTask({ taskId: saved.taskId, apiKey: config.kie });
      if (result.state === 'failed') {
        await checkpoint(key, { ...saved, state: 'needs_attention', outcome: 'failed', creditsConsumed: result.creditsConsumed, completedAt: new Date().toISOString() }, { actual_usage: usage('kie', result.creditsConsumed) });
        throw Object.assign(new Error('Generation provider reported a failure.'), { code: 'provider_task_failed', ambiguous: true });
      }
      if (result.state === 'ready') {
        // Same known provider task may be polled/downloaded again; never reposted.
        try { await fs.access(filename); }
        catch { await provider.downloadAsset({ url: result.urls[0], outputPath: filename, maxBytes: key === 'image' ? 10 * 1024 ** 2 : 100 * 1024 ** 2 }); }
        const stored = await storeAsset(key, filename, mimeType, durationSeconds);
        await checkpoint(key, { ...saved, state: 'ready', completedAt: new Date().toISOString(), sha256: stored.sha256, creditsConsumed: result.creditsConsumed }, { actual_usage: usage('kie', result.creditsConsumed) });
        return filename;
      }
      await delay(12000);
    }
    throw Object.assign(new Error('Provider task is still pending. Task ID retained for inspection.'), { ambiguous: true, code: 'provider_pending' });
  }

  try {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const stat = await fs.statfs(dir);
    if (Number(stat.bavail) * Number(stat.bsize) < 10 * 1024 ** 3) throw new Error('Insufficient storage for preview rendering.');
    spec = buildGenerationSpec(job.request_snapshot, job.id);
    await atomicJson(path.join(dir, 'generation-spec.json'), spec);
    const imageFile = await kieStage('image', spec.image.model, spec.image.input, path.join(dir, 'scene.png'), 'image/png', 5);
    const imageAsset = job.assets.image;
    await patch({ assets: { ...job.assets, poster: imageAsset } });
    // Reuse the provider-hosted original for its own video service. Private
    // storage stays the durable copy; a signed storage URL is the fallback.
    const hostedImage = await provider.pollKieTask({ taskId: job.checkpoints.image.taskId, apiKey: config.kie });
    let imageUrl = hostedImage.state === 'ready' ? hostedImage.urls[0] : null;
    if (!imageUrl) {
      const { data: imageLink, error: linkError } = await client.storage.from(BUCKET).createSignedUrl(imageAsset.path, 21600);
      if (linkError || !imageLink) throw new Error('Image handoff failed.');
      imageUrl = imageLink.signedUrl;
    }
    const videoFile = await kieStage('video', spec.video.model, { ...spec.video.input, image_urls: [imageUrl, imageUrl] }, path.join(dir, 'source-11s.mp4'), 'video/mp4', 20, 11);
    const audioFiles = [];
    for (let index = 0; index < 6; index++) {
      const key = `audio${index + 1}`;
      const filename = path.join(dir, `${key}.mp3`);
      const saved = job.checkpoints?.[key];
      if (saved?.state === 'ready') { audioFiles.push(await restoreAsset(key, filename)); continue; }
      if (saved) throw Object.assign(new Error('Previous sound request has an unknown result. No automatic resubmission.'), { ambiguous: true, code: 'audio_submission_unknown' });
      const intent = { state: 'intent', provider: 'elevenlabs', model: 'eleven_text_to_sound_v2', intentAt: new Date().toISOString() };
      await checkpoint(key, intent, { stage: `${key}_generating`, progress: 40 + index * 6 });
      const audio = await provider.generateRainAudio({ prompt: spec.audio[index], apiKey: config.eleven, outputPath: filename });
      await atomicJson(path.join(dir, `${key}-receipt.json`), audio);
      const stored = await storeAsset(key, filename, 'audio/mpeg', 30);
      await checkpoint(key, { ...intent, state: 'ready', taskId: audio.requestId, completedAt: new Date().toISOString(), sha256: stored.sha256, creditsConsumed: audio.creditsConsumed }, { actual_usage: usage('eleven', audio.creditsConsumed) });
      audioFiles.push(filename);
    }
    await patch({ stage: 'rendering_previews', progress: 82 });
    const outputDir = path.join(dir, `render-${Date.now()}`);
    const report = await renderHealingRain({ video: videoFile, audio: audioFiles, outputDir, ...spec.render });
    // Renderer filenames are stable; never accept caller-controlled remote paths.
    await storeAsset('preview30', path.join(outputDir, 'healing-rain-30s.mp4'), 'video/mp4', 30);
    await storeAsset('preview180', path.join(outputDir, 'healing-rain-180s.mp4'), 'video/mp4', 180);
    await atomicJson(path.join(dir, 'review.json'), { ...spec.review, report });
    await checkpoint('render', { state: 'ready', completedAt: new Date().toISOString(), loopVersion: spec.version, reviewStatus: 'pending' }, { status: 'ready', stage: 'preview_ready', progress: 100 });
    console.log(JSON.stringify({ jobId: job.id, status: 'ready', review: 'pending', outputDir, actualUsage: job.actual_usage }));
    return { jobId: job.id, outputDir, imageFile };
  } catch (error) {
    if (!lostLease) {
      const uncertain = error.ambiguous || Object.values(job.checkpoints || {}).some(item => item.state === 'intent');
      await patch({ status: uncertain ? 'needs_attention' : 'failed', stage: uncertain ? 'operator_review_required' : 'failed',
        ...(uncertain && error.code !== 'provider_task_failed' ? { actual_usage: { ...job.actual_usage, unreportedCost: true } } : {}),
        error_code: /^[a-z0-9_]{1,60}$/.test(error.code || '') ? error.code : 'worker_failed',
        error_message: uncertain ? '생성 요청의 완료 여부를 확인해야 합니다. 중복 과금을 피하기 위해 자동 재요청하지 않습니다.' : '미리보기 제작을 완료하지 못했습니다. 저장된 원본과 작업 상태를 확인해 주세요.' }).catch(() => {});
    }
    console.error(JSON.stringify({ jobId: job.id, status: lostLease ? 'lease_lost' : job.status, code: error.code || 'worker_failed' }));
    throw error;
  } finally { clearInterval(heartbeat); }
}

async function main() {
  const config = settings();
  const client = createClient(config.url, config.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const once = process.argv.includes('--once');
  do {
    const { data, error } = await client.rpc('claim_healing_rain_generation', { p_lease_seconds: 180 });
    if (error) throw new Error('Generation queue unavailable.');
    if (data?.[0]) await runJob(client, data[0], config).catch(() => { process.exitCode = 1; });
    else if (once) console.log(JSON.stringify({ status: 'no_queued_jobs' }));
    if (!once) await delay(15000);
  } while (!once);
}

if (require.main === module) main().catch(error => { console.error(error.message?.startsWith('Missing worker setting:') ? error.message : 'Healing Rain worker stopped. Check its durable job state.'); process.exitCode = 1; });
module.exports = { settings, runJob };
