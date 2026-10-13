'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { buildGenerationSpec } = require('./healing-rain-plan');
const provider = require('./healing-rain-provider');
const { renderHealingRain } = require('./healing-rain-render');
const { overlayForSnapshot } = require('./healing-rain-branding');
const { evaluatePreviewQuality } = require('../shared/healing-rain/quality.js');
const { RAIN_AUDIO_POLICY_VERSION, RAIN_AUDIO_POLICY } = require('../shared/healing-rain/audio-policy.js');

const BUCKET = 'healing-rain';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function settings(env = process.env) {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'KIE_API_KEY', 'ELEVENLABS_API_KEY', 'HEALING_RAIN_OUTPUT_ROOT'];
  for (const name of required) if (!env[name]) throw new Error(`Missing worker setting: ${name}`);
  if (!path.isAbsolute(env.HEALING_RAIN_OUTPUT_ROOT)) throw new Error('Output root must be absolute.');
  if (env.HEALING_RAIN_REVIEW_REGISTRY && !path.isAbsolute(env.HEALING_RAIN_REVIEW_REGISTRY)) throw new Error('Review registry path must be absolute.');
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, service: env.SUPABASE_SERVICE_ROLE_KEY,
    kie: env.KIE_API_KEY, eleven: env.ELEVENLABS_API_KEY, root: env.HEALING_RAIN_OUTPUT_ROOT, reviewRegistry: env.HEALING_RAIN_REVIEW_REGISTRY };
}

async function loadReviewApprovals(config) {
  if (!config.reviewRegistry) return [];
  try {
    if (!path.isAbsolute(config.reviewRegistry)) throw new Error('Invalid path');
    const filename = await fs.realpath(config.reviewRegistry);
    const relative = path.relative(path.resolve(__dirname, '..'), filename);
    if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw new Error('Registry is inside checkout');
    const handle = await fs.open(filename, 'r');
    let registry;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 64 * 1024 || (stat.mode & 0o077)) throw new Error('Invalid private registry');
      const bytes = Buffer.alloc(64 * 1024 + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 64 * 1024) throw new Error('Registry too large');
      registry = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
    } finally { await handle.close(); }
    const boundedText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
    if (registry?.version !== 1 || !Array.isArray(registry.records) || registry.records.length > 500) throw new Error('Invalid registry format');
    return registry.records.map(record => {
      if (!record || !boundedText(record.profile, 100) || !boundedText(record.directionVersion, 100)
        || record.verdict !== 'approved' || !boundedText(record.evidenceId, 200)
        || !boundedText(record.reviewedAt, 40) || !Number.isFinite(Date.parse(record.reviewedAt))
        || !['image', 'video', 'audio'].every(key => boundedText(record.models?.[key], 100))) throw new Error('Incomplete review record');
      return { profile: record.profile, directionVersion: record.directionVersion, verdict: record.verdict,
        evidenceId: record.evidenceId, reviewedAt: record.reviewedAt,
        models: { image: record.models.image, video: record.models.video, audio: record.models.audio } };
    });
  } catch {
    throw Object.assign(new Error('Trusted review registry cannot be verified.'), { code: 'review_registry_invalid', requiresReview: true });
  }
}

async function atomicJson(filename, value) {
  await fs.writeFile(`${filename}.partial`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(`${filename}.partial`, filename);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function specHash(spec) { return crypto.createHash('sha256').update(canonicalJson(spec)).digest('hex'); }
function provenanceError(message, code = 'generation_spec_drift') {
  return Object.assign(new Error(message), { code, requiresReview: true });
}

// Exclusive creation protects an earlier version's receipt. fsync completes
// before the database checkpoint and any paid submission intent are written.
async function freezeJson(filename, value) {
  const handle = await fs.open(filename, 'wx', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync(); }
  finally { await handle.close(); }
}

async function runJob(client, initial, config) {
  if (!UUID.test(initial.id) || !UUID.test(initial.user_id)) throw new Error('Invalid claimed identity.');
  let job = initial;
  let lostLease = false;
  let heartbeatBusy = false;
  const dir = path.join(config.root, job.id);
  let spec;
  let generationSpecSha256;
  let reviewApprovals = [];

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

  function audioOrigin(index) {
    return { policyVersion: RAIN_AUDIO_POLICY_VERSION, jobId: job.id, userId: job.user_id,
      takeIndex: index + 1, seconds: RAIN_AUDIO_POLICY.secondsPerTake };
  }

  function verifyAudioProvenance(requireOrigin) {
    const keys = new Set([...Object.keys(job.checkpoints || {}), ...Object.keys(job.assets || {})].filter(key => /^audio\d+$/.test(key)));
    for (const key of keys) {
      const index = Number(key.slice(5)) - 1;
      const stage = job.checkpoints?.[key];
      const asset = job.assets?.[key];
      const expectedOrigin = audioOrigin(index);
      const marked = requireOrigin || stage?.audioOrigin !== undefined || asset?.audioOrigin !== undefined;
      if (!Number.isInteger(index) || index < 0 || index >= spec.audio.length || key !== `audio${index + 1}` || !stage
        || (marked && (canonicalJson(stage.audioOrigin) !== canonicalJson(expectedOrigin)
          || stage.provider !== 'elevenlabs' || stage.model !== 'eleven_text_to_sound_v2'))
        || (stage.state === 'ready' && (!asset || (marked && !/^[a-f0-9]{64}$/.test(stage.sha256 || ''))))
        || (asset && (asset.path !== `${job.user_id}/${job.id}/${key}.mp3`
          || (asset.durationSeconds !== undefined && asset.durationSeconds !== RAIN_AUDIO_POLICY.secondsPerTake)
          || (marked && (asset.durationSeconds !== RAIN_AUDIO_POLICY.secondsPerTake
            || canonicalJson(asset.audioOrigin) !== canonicalJson(expectedOrigin)))))) {
        throw provenanceError('Saved rain audio does not belong to this production and take.', 'audio_provenance_mismatch');
      }
    }
  }

  async function freezeGenerationSpec() {
    generationSpecSha256 = specHash(spec);
    const frozen = job.checkpoints?.generationSpec;
    const stages = Object.entries(job.checkpoints || {}).filter(([key]) => key !== 'generationSpec');
    const activity = stages.length > 0 || Object.keys(job.assets || {}).length > 0 || (job.actual_usage?.kieCalls || 0) > 0 || (job.actual_usage?.elevenLabsCalls || 0) > 0;
    if (frozen && ((frozen.jobId !== undefined && frozen.jobId !== job.id)
      || (frozen.userId !== undefined && frozen.userId !== job.user_id)
      || (frozen.audioPolicyVersion !== undefined && (frozen.audioPolicyVersion !== RAIN_AUDIO_POLICY_VERSION
        || frozen.jobId !== job.id || frozen.userId !== job.user_id)))) {
      throw provenanceError('Saved production identity or audio policy differs from this job.', 'audio_provenance_mismatch');
    }
    // Older jobs retain their exact specification and can recover their own
    // original takes. Every newly started job requires production-bound audio.
    const requireAudioOrigin = Boolean(frozen?.audioPolicyVersion) || (!frozen && !activity);
    verifyAudioProvenance(requireAudioOrigin);
    if (frozen && (frozen.state !== 'frozen' || frozen.sha256 !== generationSpecSha256 || frozen.version !== spec.version)) {
      throw provenanceError('Saved generation checkpoint differs from this specification.');
    }
    for (const [key, stage] of stages) {
      const expectedModel = key === 'image' ? spec.image.model : key === 'video' ? spec.video.model : /^audio[1-6]$/.test(key) ? 'eleven_text_to_sound_v2' : null;
      if ((job.request_snapshot.direction && expectedModel && (!stage.generationSpecSha256 || !stage.ruleVersion))
        || (stage.generationSpecSha256 && stage.generationSpecSha256 !== generationSpecSha256)
        || (stage.ruleVersion && stage.ruleVersion !== spec.version)
        || (stage.loopVersion && stage.loopVersion !== spec.version)
        || (expectedModel && stage.model && stage.model !== expectedModel)) {
        throw provenanceError('Saved stage provenance differs from this specification.');
      }
    }
    const sourceSeconds = Number(spec.video.input.duration);
    if (!Number.isInteger(sourceSeconds) || sourceSeconds <= 0 || sourceSeconds > 60
      || (spec.render.sourceVideoSeconds !== undefined && spec.render.sourceVideoSeconds !== sourceSeconds)
      || sourceSeconds !== spec.render.targetVideoCycleSeconds + spec.render.videoCrossfadeSeconds
      || spec.review.sourceVideoSeconds !== sourceSeconds) throw provenanceError('Generation and render durations conflict.');
    const savedVideo = job.assets?.video;
    if (savedVideo && (savedVideo.path !== `${job.user_id}/${job.id}/source-${sourceSeconds}s.mp4`
      || (savedVideo.durationSeconds !== undefined && savedVideo.durationSeconds !== sourceSeconds))) {
      throw provenanceError('Saved video does not match the source duration.');
    }
    const filename = path.join(dir, 'generation-spec.json');
    let savedSpec;
    try {
      const stat = await fs.stat(filename);
      if (stat.size > 1024 * 1024) throw provenanceError('Saved specification is invalid.');
      try { savedSpec = JSON.parse(await fs.readFile(filename, 'utf8')); }
      catch { throw provenanceError('Saved specification cannot be verified.'); }
      if (specHash(savedSpec) !== generationSpecSha256) throw provenanceError('Saved generation receipt differs from this specification.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // Historical v1 jobs predate provenance checkpoints; their exact legacy
    // compiler remains available. V2 assets always require a durable receipt.
    if (activity && !frozen && !savedSpec && job.request_snapshot.direction) {
      throw provenanceError('Resumed direction job has no generation provenance.', 'generation_spec_missing');
    }
    if (!savedSpec) {
      try { await freezeJson(filename, spec); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        throw provenanceError('Generation receipt appeared concurrently.');
      }
    }
    if (!frozen) await checkpoint('generationSpec', { state: 'frozen', version: spec.version, sha256: generationSpecSha256,
      ...(activity ? { adoptedLegacy: !job.request_snapshot.direction } : { jobId: job.id, userId: job.user_id, audioPolicyVersion: RAIN_AUDIO_POLICY_VERSION }) });
  }

  async function storeAsset(key, filename, mimeType, durationSeconds, sourceOrigin) {
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
    const asset = { path: objectPath, mimeType, sha256, bytes: bytes.length, ...(durationSeconds ? { durationSeconds } : {}), ...(sourceOrigin ? { audioOrigin: sourceOrigin } : {}) };
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

  function verifiedAudioApproval() {
    const record = job.review_records?.audio;
    if (!record) return false;
    if (record.decision !== 'approve' || record.userId !== job.user_id || record.jobId !== job.id
      || record.generationSpecSha256 !== generationSpecSha256 || !Number.isFinite(Date.parse(record.reviewedAt))
      || Object.keys(record.assetHashes || {}).length !== spec.audio.length) {
      throw provenanceError('Audio review is not bound to this production.', 'audio_review_mismatch');
    }
    verifyAudioProvenance(true);
    for (let index = 0; index < spec.audio.length; index++) {
      const key = `audio${index + 1}`;
      const stage = job.checkpoints?.[key], asset = job.assets?.[key];
      if (stage?.state !== 'ready' || !/^[a-f0-9]{64}$/.test(asset?.sha256 || '')
        || stage.sha256 !== asset.sha256 || stage.generationSpecSha256 !== generationSpecSha256
        || record.assetHashes[key] !== asset.sha256 || asset.mimeType !== 'audio/mpeg') {
        throw provenanceError('Approved audio original changed or is missing.', 'audio_review_mismatch');
      }
    }
    return true;
  }

  async function kieStage(key, model, input, filename, mimeType, progress, durationSeconds) {
    if (!verifiedAudioApproval()) throw provenanceError('Audio review is required before image or video work.', 'audio_review_required');
    let saved = job.checkpoints?.[key];
    if (saved?.state === 'ready') return restoreAsset(key, filename);
    if (saved && (saved.state !== 'submitted' || typeof saved.taskId !== 'string' || !saved.taskId)) {
      throw Object.assign(new Error('Previous paid submission is held. No automatic resubmission.'), { ambiguous: true, code: saved.outcome === 'failed' || saved.state === 'failed' ? 'provider_task_failed' : 'submission_unknown' });
    }
    if (!saved?.taskId) {
      saved = { state: 'intent', provider: 'kie', model, generationSpecSha256, ruleVersion: spec.version, intentAt: new Date().toISOString() };
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
    reviewApprovals = await loadReviewApprovals(config);
    try { spec = buildGenerationSpec(job.request_snapshot, job.id); }
    catch (error) {
      if (Object.keys(job.checkpoints || {}).length || Object.keys(job.assets || {}).length) throw provenanceError('Saved plan can no longer reproduce its generation specification.');
      throw error;
    }
    await freezeGenerationSpec();
    if ((job.checkpoints?.image || job.checkpoints?.video) && !job.review_records?.audio) {
      throw provenanceError('Legacy visual work requires an operator to reconcile original audio before any new paid request.', 'legacy_audio_review_required');
    }
    if (job.review_records?.audio) verifiedAudioApproval();
    const audioFiles = [];
    for (let index = 0; index < spec.audio.length; index++) {
      const key = `audio${index + 1}`;
      const filename = path.join(dir, `${key}.mp3`);
      const saved = job.checkpoints?.[key];
      if (saved?.state === 'ready') { audioFiles.push(await restoreAsset(key, filename)); continue; }
      if (saved) throw Object.assign(new Error('Previous sound request has an unknown result. No automatic resubmission.'), { ambiguous: true, code: 'audio_submission_unknown' });
      const origin = audioOrigin(index);
      const intent = { state: 'intent', provider: 'elevenlabs', model: 'eleven_text_to_sound_v2', generationSpecSha256, ruleVersion: spec.version, audioOrigin: origin, intentAt: new Date().toISOString() };
      await checkpoint(key, intent, { stage: `${key}_generating`, progress: 5 + index * 5 });
      const audio = await provider.generateRainAudio({ prompt: spec.audio[index], apiKey: config.eleven, outputPath: filename });
      await atomicJson(path.join(dir, `${key}-receipt.json`), { ...audio, audioOrigin: origin });
      const stored = await storeAsset(key, filename, 'audio/mpeg', RAIN_AUDIO_POLICY.secondsPerTake, origin);
      await checkpoint(key, { ...intent, state: 'ready', taskId: audio.requestId, completedAt: new Date().toISOString(), sha256: stored.sha256, creditsConsumed: audio.creditsConsumed }, { actual_usage: usage('eleven', audio.creditsConsumed) });
      audioFiles.push(filename);
    }
    // Persist a lease-free hold. Only the authenticated, hash-bound review RPC can queue the next paid stage.
    if (!verifiedAudioApproval()) {
      await patch({ status: 'needs_attention', stage: 'audio_review_required', progress: 40, error_code: null, error_message: null });
      return { jobId: job.id, status: 'needs_attention', stage: 'audio_review_required' };
    }
    let brandingLogoFile;
    const brandingOverlay = overlayForSnapshot(job.branding_snapshot, job.request_snapshot.input?.title);
    if (brandingOverlay?.logoPath) {
      if (!brandingOverlay.logoPath.startsWith(`${job.user_id}/branding/`)) throw new Error('Frozen branding logo owner mismatch');
      const { data, error } = await client.storage.from(BUCKET).download(brandingOverlay.logoPath);
      if (error || !data || data.size > 2 * 1024 ** 2) throw new Error('Frozen branding logo unavailable');
      const bytes = Buffer.from(await data.arrayBuffer());
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      brandingLogoFile = path.join(dir, `branding-${sha256}.webp`);
      try { await fs.writeFile(brandingLogoFile, bytes, { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST' || crypto.createHash('sha256').update(await fs.readFile(brandingLogoFile)).digest('hex') !== sha256) throw error; }
    }
    const imageFile = await kieStage('image', spec.image.model, spec.image.input, path.join(dir, 'scene.png'), 'image/png', 45);
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
    const sourceSeconds = Number(spec.video.input.duration);
    const videoFile = await kieStage('video', spec.video.model, { ...spec.video.input, image_urls: [imageUrl, imageUrl] }, path.join(dir, `source-${sourceSeconds}s.mp4`), 'video/mp4', 60, sourceSeconds);
    await patch({ stage: 'rendering_previews', progress: 82 });
    const outputDir = path.join(dir, `render-${Date.now()}`);
    const report = await renderHealingRain({ video: videoFile, audio: audioFiles, outputDir, ...spec.render, brandingSnapshot: job.branding_snapshot, brandingTitle: job.request_snapshot.input?.title, brandingLogoFile });
    // Renderer filenames are stable; never accept caller-controlled remote paths.
    await storeAsset('preview30', path.join(outputDir, `healing-rain-${spec.render.previewSeconds}s.mp4`), 'video/mp4', spec.render.previewSeconds);
    await storeAsset('preview180', path.join(outputDir, `healing-rain-${spec.render.seconds}s.mp4`), 'video/mp4', spec.render.seconds);
    const quality = job.request_snapshot.direction ? evaluatePreviewQuality({ direction: job.request_snapshot.direction, report, jobId: job.id,
      models: { image: spec.image.model, video: spec.video.model, audio: 'eleven_text_to_sound_v2' }, approvals: reviewApprovals }) : null;
    await atomicJson(path.join(dir, 'review.json'), { ...spec.review, report, ...(quality ? { quality } : {}) });
    await checkpoint('render', { state: 'ready', completedAt: new Date().toISOString(), loopVersion: spec.version, ruleVersion: spec.version,
      generationSpecSha256, reviewStatus: 'pending', ...(quality ? { quality } : {}) }, { status: 'ready', stage: 'preview_ready', progress: 100 });
    console.log(JSON.stringify({ jobId: job.id, status: 'ready', review: 'pending', outputDir, actualUsage: job.actual_usage }));
    return { jobId: job.id, outputDir, imageFile };
  } catch (error) {
    if (!lostLease) {
      const uncertain = error.ambiguous || (!error.requiresReview && Object.values(job.checkpoints || {}).some(item => item.state === 'intent'));
      const held = uncertain || error.requiresReview;
      await patch({ status: held ? 'needs_attention' : 'failed', stage: held ? 'operator_review_required' : 'failed',
        ...(uncertain && error.code !== 'provider_task_failed' ? { actual_usage: { ...job.actual_usage, unreportedCost: true } } : {}),
        error_code: /^[a-z0-9_]{1,60}$/.test(error.code || '') ? error.code : 'worker_failed',
        error_message: error.code === 'review_registry_invalid' ? '검수 승인 기록을 확인할 수 없습니다. 비용을 발생시키기 전에 운영자 확인이 필요합니다.' : error.requiresReview ? '저장된 생성 명세와 체크포인트가 일치하지 않습니다. 원본 기록을 보존하고 검수 전 재요청하지 않습니다.' : uncertain ? '생성 요청의 완료 여부를 확인해야 합니다. 중복 과금을 피하기 위해 자동 재요청하지 않습니다.' : '미리보기 제작을 완료하지 못했습니다. 저장된 원본과 작업 상태를 확인해 주세요.' }).catch(() => {});
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
module.exports = { settings, runJob, loadReviewApprovals };
