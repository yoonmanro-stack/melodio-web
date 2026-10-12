'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { buildGenerationSpec } = require('../worker/healing-rain-plan');

const owner = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const claim = '44444444-4444-4444-8444-444444444444';
const snapshot = { input: { sceneId: 'train', thunder: 'none', takes: 6 }, prompts: { image: 'Private sleeper train cabin.', video: 'A 10-second fixed camera train shot.', audio: 'Gentle steady train-window rain. No music, voices or thunder.' } };
const plain = value => JSON.parse(JSON.stringify(value));

async function harness(options = {}) {
  const root = await fs.mkdtemp('/private/tmp/healing-rain-worker-test-');
  let row = { id: jobId, user_id: owner, claim_token: claim, status: 'running', stage: 'claimed', progress: 0, request_snapshot: snapshot, checkpoints: {}, assets: {}, actual_usage: {}, ...plain(options.row || {}) };
  const calls = { rpc: [], uploads: [], downloads: [], signed: [], create: [], poll: [], audio: [], render: [] };
  const objects = new Map();
  let heartbeat, updatesBlocked = false;
  const config = { root, kie: 'offline-kie', eleven: 'offline-eleven' };
  const client = {
    async rpc(name, args) {
      assert.equal(name, 'update_healing_rain_generation');
      assert.equal(args.p_job_id, jobId); assert.equal(args.p_claim_token, claim);
      assert.equal(args.p_lease_seconds, 180);
      calls.rpc.push(plain(args));
      if (updatesBlocked || options.rejectPatch?.(args.p_patch)) return { data: [], error: null };
      row = { ...row, ...plain(args.p_patch) };
      return { data: [plain(row)], error: null };
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'healing-rain');
      return {
        async upload(key, bytes, uploadOptions) {
          calls.uploads.push({ key, ...uploadOptions });
          assert.equal(uploadOptions.upsert, false);
          if (objects.has(key)) return { error: { message: 'already stored' } };
          objects.set(key, Buffer.from(bytes)); return { error: null };
        },
        async download(key) {
          calls.downloads.push(key);
          return objects.has(key) ? { data: new Blob([objects.get(key)]), error: null } : { data: null, error: { message: 'missing' } };
        },
        async createSignedUrl(key, seconds) {
          calls.signed.push({ key, seconds });
          return { data: { signedUrl: `https://offline.test/signed/${key}` }, error: null };
        },
      };
    } },
  };
  const provider = {
    async createKieTask(request) {
      const key = calls.create.length ? 'video' : 'image';
      assert.equal(row.checkpoints[key]?.state, 'intent', 'paid provider POST requires an already persisted intent');
      calls.create.push(plain(request));
      if (options.loseLeaseDuringCreate) { updatesBlocked = true; await heartbeat(); }
      return { taskId: `task_${calls.create.length}` };
    },
    async pollKieTask(request) {
      calls.poll.push(plain(request));
      if (options.hostedImageUnavailable && row.checkpoints.image?.state === 'ready' && request.taskId === row.checkpoints.image.taskId) return { state: 'failed', urls: [], creditsConsumed: 10 };
      if (options.pollResults?.[request.taskId]) return plain(options.pollResults[request.taskId]);
      return { state: 'ready', urls: ['https://tempfile.aiquickdraw.com/offline.mp4'], creditsConsumed: 10 };
    },
    async downloadAsset({ outputPath, maxBytes }) {
      assert.ok(maxBytes <= 100 * 1024 ** 2, 'provider permits at most 100 MiB per video');
      await fs.writeFile(outputPath, `fixture ${path.basename(outputPath)}`, { flag: 'wx' });
    },
    async generateRainAudio(request) {
      assert.equal(row.checkpoints[path.basename(request.outputPath, '.mp3')]?.state, 'intent', 'paid audio POST requires an already persisted intent');
      calls.audio.push(plain(request));
      if (options.audioUnknown) throw Object.assign(new Error('AUDIO_TRANSFER_FAILED'), { code: 'AUDIO_TRANSFER_FAILED', ambiguous: true });
      await fs.writeFile(request.outputPath, `fixture ${path.basename(request.outputPath)}`, { flag: 'wx' });
      return { requestId: `audio_${calls.audio.length}`, creditsConsumed: 300, durationSeconds: 30, bytes: 18 };
    },
  };
  const renderer = { async renderHealingRain(request) {
    calls.render.push(plain(request));
    assert.equal(request.seconds, 180); assert.equal(request.previewSeconds, 30);
    assert.equal(request.videoCrossfadeSeconds, 1); assert.equal(request.audioCrossfadeSeconds, 2);
    assert.equal(request.audio.length, 6);
    await fs.mkdir(request.outputDir);
    for (const seconds of [30, 180]) await fs.writeFile(path.join(request.outputDir, `healing-rain-${seconds}s.mp4`), `fixture preview ${seconds}`);
    return { status: 'complete', effectiveVideoCycleSeconds: 10, outputs: [] };
  } };
  const loadedModule = { exports: {} };
  const dependencies = { 'node:fs/promises': fs, 'node:path': path, 'node:crypto': crypto, '@supabase/supabase-js': { createClient() { throw new Error('Production client creation is forbidden in tests'); } }, './healing-rain-plan': { buildGenerationSpec }, './healing-rain-provider': provider, './healing-rain-render': renderer };
  vm.runInNewContext(syncFs.readFileSync(path.join(__dirname, '../worker/healing-rain-worker.js'), 'utf8'), {
    module: loadedModule, exports: loadedModule.exports, Buffer, process: { env: {}, argv: [] },
    console: { log() {}, error() {} },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
    setInterval(callback) { heartbeat = callback; return 1; }, clearInterval() {},
    setTimeout() { throw new Error('Unexpected provider polling delay in deterministic test'); },
  }, { filename: 'worker/healing-rain-worker.js' });
  async function readySource(key, filename, overrides = {}) {
    const bytes = Buffer.from(`saved ${filename}`), objectPath = `${owner}/${jobId}/${filename}`;
    objects.set(objectPath, bytes);
    row.assets[key] = { path: objectPath, bytes: bytes.length, mimeType: filename.endsWith('.png') ? 'image/png' : 'video/mp4', ...overrides };
    row.checkpoints[key] = { state: 'ready', taskId: `saved_${key}`, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  return { calls, objects, root, readySource, row: () => plain(row), run: () => loadedModule.exports.runJob(client, plain(row), config), resetRunning() { row.status = 'running'; }, settings: loadedModule.exports.settings };
}

test('submitted KIE task is polled after restart and never submitted again', async () => {
  const h = await harness({ row: { checkpoints: { image: { state: 'submitted', taskId: 'saved-image-task' }, video: { state: 'intent' } } } });
  await assert.rejects(h.run(), error => error.code === 'submission_unknown');
  assert.deepEqual(h.calls.poll.map(call => call.taskId), ['saved-image-task', 'saved-image-task']);
  assert.equal(h.calls.create.length, 0); assert.equal(h.calls.audio.length, 0);
  assert.equal(h.row().checkpoints.image.state, 'ready');
  assert.equal(h.row().status, 'needs_attention');
  assert.equal(h.row().actual_usage.kieCredits, 10);
  assert.equal(h.row().actual_usage.kieCalls, 1);
  h.resetRunning();
  await assert.rejects(h.run(), error => error.code === 'submission_unknown');
  assert.equal(h.calls.poll.length, 3, 'completed source only refreshes its existing provider URL for the video handoff');
  assert.equal(h.calls.create.length, 0);
});

test('durable submission intent blocks automatic duplicate paid POST', async () => {
  const h = await harness({ row: { checkpoints: { image: { state: 'intent', provider: 'kie' } } } });
  for (let attempt = 0; attempt < 2; attempt++) {
    h.resetRunning();
    await assert.rejects(h.run(), error => error.code === 'submission_unknown');
  }
  assert.equal(h.calls.create.length, 0); assert.equal(h.calls.poll.length, 0); assert.equal(h.calls.audio.length, 0);
  assert.equal(h.row().status, 'needs_attention');
});

test('failed live-lease compare-and-set prevents any paid submission', async () => {
  const h = await harness({ rejectPatch: () => true });
  await assert.rejects(h.run(), error => error.code === 'lease_lost');
  assert.equal(h.calls.rpc.length, 1);
  assert.equal(h.calls.create.length, 0); assert.equal(h.calls.audio.length, 0);
  assert.equal(h.calls.uploads.length, 0); assert.equal(h.calls.render.length, 0);
});

test('lease loss while one POST is in flight prevents polling and later paid calls', async () => {
  const h = await harness({ loseLeaseDuringCreate: true });
  await assert.rejects(h.run(), error => error.code === 'lease_lost');
  assert.equal(h.calls.create.length, 1); assert.equal(h.calls.poll.length, 0); assert.equal(h.calls.audio.length, 0);
  assert.equal(h.row().checkpoints.image.state, 'intent');
  const receipt = JSON.parse(await fs.readFile(path.join(h.root, jobId, 'image-submission-task_1.json'), 'utf8'));
  assert.equal(receipt.taskId, 'task_1', 'operator has the known provider reference even if lease CAS cannot persist it');
});

test('known zero-credit provider failure is held with its task outcome and never resubmitted automatically', async () => {
  const h = await harness({ pollResults: {
    task_1: { state: 'ready', urls: ['https://tempfile.aiquickdraw.com/offline.png'], creditsConsumed: 18 },
    task_2: { state: 'failed', urls: [], errorCode: '500', creditsConsumed: 0 },
  } });
  const earlierReceipt = { state: 'submitted', taskId: 'earlier-reviewed-task' };
  const priorPath = path.join(h.root, jobId, 'video-submission-earlier-reviewed-task.json');
  await fs.mkdir(path.dirname(priorPath));
  await fs.writeFile(priorPath, JSON.stringify(earlierReceipt), { flag: 'wx' });
  await assert.rejects(h.run(), error => error.code === 'provider_task_failed' && error.ambiguous === true);
  const held = h.row();
  assert.equal(held.status, 'needs_attention'); assert.equal(held.stage, 'operator_review_required');
  assert.equal(held.error_code, 'provider_task_failed');
  assert.equal(held.checkpoints.image.state, 'ready'); assert.equal(held.checkpoints.image.creditsConsumed, 18);
  assert.equal(held.checkpoints.video.state, 'needs_attention'); assert.equal(held.checkpoints.video.outcome, 'failed');
  assert.equal(held.checkpoints.video.taskId, 'task_2'); assert.equal(held.checkpoints.video.creditsConsumed, 0);
  assert.equal(held.actual_usage.kieCredits, 18); assert.equal(held.actual_usage.kieCalls, 2);
  assert.equal(held.actual_usage.unreportedCost, false, 'an explicit zero-credit failure is verified billing');
  assert.equal(h.calls.create.length, 2); assert.equal(h.calls.poll.length, 3);
  assert.deepEqual(h.calls.create[1].input.image_urls, ['https://tempfile.aiquickdraw.com/offline.png', 'https://tempfile.aiquickdraw.com/offline.png']);
  assert.equal(h.calls.signed.length, 0, 'KIE-hosted original avoids a signed-storage handoff when available');
  assert.equal(h.calls.audio.length, 0); assert.equal(h.calls.render.length, 0);
  assert.deepEqual(JSON.parse(await fs.readFile(priorPath, 'utf8')), earlierReceipt, 'new submissions retain older retry receipts');
  const currentReceipt = JSON.parse(await fs.readFile(path.join(h.root, jobId, 'video-submission-task_2.json'), 'utf8'));
  assert.equal(currentReceipt.taskId, 'task_2');
  h.resetRunning();
  await assert.rejects(h.run(), error => error.code === 'provider_task_failed');
  assert.equal(h.row().status, 'needs_attention');
  assert.equal(h.row().actual_usage.unreportedCost, false, 'restarting a known failure preserves verified billing');
  assert.equal(h.calls.create.length, 2); assert.equal(h.calls.poll.length, 4);
  assert.equal(h.calls.poll.filter(call => call.taskId === 'task_2').length, 1, 'failed video remains held rather than repolled or resubmitted');
  assert.equal(h.row().actual_usage.kieCredits, 18); assert.equal(h.row().actual_usage.kieCalls, 2, 'restarting a held failure cannot count its cost twice');
});

test('unknown first audio response stops all later audio calls and persists restart guard', async () => {
  const h = await harness({ audioUnknown: true });
  await h.readySource('image', 'scene.png'); await h.readySource('video', 'source-11s.mp4');
  await assert.rejects(h.run(), error => error.code === 'AUDIO_TRANSFER_FAILED');
  assert.equal(h.calls.audio.length, 1); assert.equal(h.calls.create.length, 0); assert.equal(h.calls.render.length, 0);
  assert.equal(h.row().checkpoints.audio1.state, 'intent');
  assert.equal(h.row().checkpoints.audio2, undefined); assert.equal(h.row().status, 'needs_attention');
  h.resetRunning();
  await assert.rejects(h.run(), error => error.code === 'audio_submission_unknown');
  assert.equal(h.calls.audio.length, 1);
});

test('restored assets reject foreign-owner and traversal object paths before privileged reads', async () => {
  for (const badPath of [`${foreign}/${jobId}/scene.png`, `${owner}/${jobId}/../scene.png`]) {
    const h = await harness(); await h.readySource('image', 'scene.png', { path: badPath });
    await assert.rejects(h.run());
    assert.equal(h.calls.downloads.length, 0, 'unsafe object keys never reach service-role storage');
    assert.equal(h.calls.create.length, 0); assert.equal(h.calls.signed.length, 0);
  }
});

test('fresh job persists paid intents before calls, owner-scopes every asset and completes exact render contract', async () => {
  const h = await harness();
  await h.run();
  assert.equal(h.row().status, 'ready'); assert.equal(h.row().progress, 100);
  assert.equal(h.row().checkpoints.render.reviewStatus, 'pending');
  assert.equal(h.calls.create.length, 2); assert.equal(h.calls.audio.length, 6); assert.equal(h.calls.render.length, 1);
  assert.equal(h.calls.create[1].input.duration, '11');
  assert.deepEqual(h.calls.create[1].input.image_urls, ['https://tempfile.aiquickdraw.com/offline.mp4', 'https://tempfile.aiquickdraw.com/offline.mp4']);
  assert.equal(h.calls.signed.length, 0);
  assert.equal(h.calls.uploads.length, 10);
  assert.ok(h.calls.uploads.every(call => call.key.startsWith(`${owner}/${jobId}/`) && call.key.split('/').length === 3 && call.upsert === false));
  assert.equal(h.row().actual_usage.kieCalls, 2); assert.equal(h.row().actual_usage.elevenLabsCalls, 6);
  assert.equal(h.row().actual_usage.kieCredits, 20); assert.equal(h.row().actual_usage.elevenLabsCredits, 1800);
  for (const key of ['image', 'video', 'audio1', 'audio2', 'audio3', 'audio4', 'audio5', 'audio6']) {
    const states = h.calls.rpc.map(call => call.p_patch.checkpoints?.[key]?.state).filter(Boolean);
    assert.equal(states[0], 'intent'); assert.equal(states.at(-1), 'ready');
  }
});

test('unavailable provider-hosted image uses the private signed original without regenerating the image', async () => {
  const h = await harness({ hostedImageUnavailable: true });
  await h.run();
  const expectedUrl = `https://offline.test/signed/${owner}/${jobId}/scene.png`;
  assert.deepEqual(h.calls.create[1].input.image_urls, [expectedUrl, expectedUrl]);
  assert.equal(h.calls.signed.length, 1);
  assert.equal(h.calls.signed[0].key, `${owner}/${jobId}/scene.png`);
  assert.equal(h.calls.create.filter(call => call.model === 'nano-banana-pro').length, 1);
  assert.equal(h.calls.create.length, 2); assert.equal(h.row().actual_usage.kieCalls, 2);
  assert.equal(h.row().status, 'ready');
});
