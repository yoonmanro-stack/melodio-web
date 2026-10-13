'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { buildGenerationSpec, DIRECTION_VERSION } = require('../worker/healing-rain-plan');
const legacy = require('../worker/healing-rain-plan-v1');
const { createRequire } = require('node:module');
const { evaluatePreviewQuality } = require('../shared/healing-rain/quality.js');
const { RAIN_AUDIO_POLICY_VERSION, RAIN_AUDIO_POLICY } = require('../shared/healing-rain/audio-policy.js');
const ts = require('typescript');

const owner = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const claim = '44444444-4444-4444-8444-444444444444';
const snapshot = { input: { sceneId: 'train', thunder: 'none', takes: 6 }, prompts: { image: 'Private sleeper train cabin.', video: 'A 10-second fixed camera train shot.', audio: 'Gentle steady train-window rain. No music, voices or thunder.' } };
const plain = value => JSON.parse(JSON.stringify(value));

function v2Snapshot(overrides = {}) {
  const filename = path.resolve(__dirname, '../src/lib/healing-rain/recipes.ts');
  const compiled = ts.transpileModule(syncFs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: createRequire(filename) };
  vm.runInNewContext(compiled, context, { filename });
  const { compileRecipe, defaults } = context.exports;
  return plain(compileRecipe({ ...defaults, ...overrides }, jobId, '2026-10-13T00:00:00Z'));
}

async function harness(options = {}) {
  const currentJobId = options.row?.id || jobId;
  const root = await fs.mkdtemp('/private/tmp/healing-rain-worker-test-');
  let row = { id: currentJobId, user_id: owner, claim_token: claim, status: 'running', stage: 'claimed', progress: 0, request_snapshot: snapshot, checkpoints: {}, assets: {}, actual_usage: {}, ...plain(options.row || {}) };
  const calls = { rpc: [], uploads: [], downloads: [], signed: [], create: [], poll: [], audio: [], render: [] };
  const objects = new Map();
  let heartbeat, updatesBlocked = false;
  const config = { root, kie: 'offline-kie', eleven: 'offline-eleven', reviewRegistry: options.reviewRegistry };
  const client = {
    async rpc(name, args) {
      assert.equal(name, 'update_healing_rain_generation');
      assert.equal(args.p_job_id, currentJobId); assert.equal(args.p_claim_token, claim);
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
      const key = request.model === 'nano-banana-pro' ? 'image' : 'video';
      assert.equal(row.checkpoints[key]?.state, 'intent', 'paid provider POST requires an already persisted intent');
      assert.equal(row.checkpoints.generationSpec?.state, 'frozen');
      assert.equal(row.checkpoints[key].generationSpecSha256, row.checkpoints.generationSpec.sha256);
      const receipt = JSON.parse(await fs.readFile(path.join(root, currentJobId, 'generation-spec.json'), 'utf8'));
      assert.equal(receipt[key].input.prompt, request.input.prompt, 'paid prompt must match the frozen receipt');
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
      assert.equal(row.checkpoints.generationSpec?.state, 'frozen');
      assert.equal(row.checkpoints[path.basename(request.outputPath, '.mp3')].generationSpecSha256, row.checkpoints.generationSpec.sha256);
      calls.audio.push(plain(request));
      if (options.audioUnknown) throw Object.assign(new Error('AUDIO_TRANSFER_FAILED'), { code: 'AUDIO_TRANSFER_FAILED', ambiguous: true });
      await fs.writeFile(request.outputPath, `fixture ${path.basename(request.outputPath)}`, { flag: 'wx' });
      return { requestId: `audio_${calls.audio.length}`, creditsConsumed: 300, durationSeconds: 30, bytes: 18 };
    },
  };
  const renderer = { async renderHealingRain(request) {
    calls.render.push(plain(request));
    assert.equal(request.seconds, options.renderSeconds || 180); assert.equal(request.previewSeconds, options.previewSeconds || 30);
    assert.equal(request.videoCrossfadeSeconds, 1); assert.equal(request.audioCrossfadeSeconds, 2);
    assert.equal(request.audio.length, 6);
    await fs.mkdir(request.outputDir);
    for (const seconds of [request.previewSeconds, request.seconds]) await fs.writeFile(path.join(request.outputDir, `healing-rain-${seconds}s.mp4`), `fixture preview ${seconds}`);
    return { status: 'complete', effectiveVideoCycleSeconds: 10, outputs: [] };
  } };
  const loadedModule = { exports: {} };
  const dependencies = { 'node:fs/promises': fs, 'node:path': path, 'node:crypto': crypto, '@supabase/supabase-js': { createClient() { throw new Error('Production client creation is forbidden in tests'); } }, './healing-rain-plan': { buildGenerationSpec: options.buildSpec || buildGenerationSpec }, './healing-rain-provider': provider, './healing-rain-render': renderer, '../shared/healing-rain/quality.js': { evaluatePreviewQuality }, '../shared/healing-rain/audio-policy.js': { RAIN_AUDIO_POLICY_VERSION, RAIN_AUDIO_POLICY } };
  vm.runInNewContext(syncFs.readFileSync(path.join(__dirname, '../worker/healing-rain-worker.js'), 'utf8'), {
    module: loadedModule, exports: loadedModule.exports, Buffer, __dirname: path.resolve(__dirname, '../worker'), process: { env: {}, argv: [] },
    console: { log() {}, error() {} },
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
    setInterval(callback) { heartbeat = callback; return 1; }, clearInterval() {},
    setTimeout() { throw new Error('Unexpected provider polling delay in deterministic test'); },
  }, { filename: 'worker/healing-rain-worker.js' });
  async function readySource(key, filename, overrides = {}) {
    const bytes = Buffer.from(`saved ${filename}`), objectPath = `${owner}/${currentJobId}/${filename}`;
    objects.set(objectPath, bytes);
    row.assets[key] = { path: objectPath, bytes: bytes.length, mimeType: filename.endsWith('.png') ? 'image/png' : 'video/mp4', ...overrides };
    row.checkpoints[key] = { state: 'ready', taskId: `saved_${key}`, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  return { calls, objects, root, readySource, replaceState(update) { row = { ...row, ...plain(update) }; }, row: () => plain(row), run: () => loadedModule.exports.runJob(client, plain(row), config), resetRunning() { row.status = 'running'; }, replaceSnapshot(value) { row.request_snapshot = plain(value); }, settings: loadedModule.exports.settings, loadReviewApprovals: loadedModule.exports.loadReviewApprovals };
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

test('two productions with the same specification each generate six fresh audio takes; resuming uses only its own takes', async () => {
  const plan = v2Snapshot();
  const first = await harness({ row: { request_snapshot: plan } });
  const second = await harness({ row: { id: foreign, request_snapshot: plan } });
  await first.run(); await second.run();
  assert.equal(first.row().checkpoints.generationSpec.sha256, second.row().checkpoints.generationSpec.sha256, 'identical specifications cannot act as an audio cache key');
  assert.equal(first.calls.audio.length, 6); assert.equal(second.calls.audio.length, 6);
  for (const h of [first, second]) {
    const current = h.row();
    assert.equal(current.checkpoints.generationSpec.audioPolicyVersion, RAIN_AUDIO_POLICY_VERSION);
    assert.equal(current.checkpoints.generationSpec.jobId, current.id);
    for (let index = 0; index < 6; index++) {
      const key = `audio${index + 1}`;
      const expected = { policyVersion: RAIN_AUDIO_POLICY_VERSION, jobId: current.id, userId: owner, takeIndex: index + 1, seconds: 30 };
      assert.deepEqual(current.checkpoints[key].audioOrigin, expected);
      assert.deepEqual(current.assets[key].audioOrigin, expected);
      const receipt = JSON.parse(await fs.readFile(path.join(h.root, current.id, `${key}-receipt.json`), 'utf8'));
      assert.deepEqual(receipt.audioOrigin, expected);
      assert.equal(h.calls.render[0].audio[index], path.join(h.root, current.id, `${key}.mp3`));
    }
    h.resetRunning(); await h.run();
    assert.equal(h.calls.audio.length, 6, 'same-production recovery cannot charge for replacement takes');
    assert.equal(h.calls.create.length, 2);
    assert.equal(h.row().actual_usage.elevenLabsCalls, 6);
    assert.equal(h.calls.render.length, 2, 'the same production may edit and loop its own generated takes');
  }
});

test('cross-production audio checkpoints or assets are held before any provider call or render', async () => {
  const source = await harness({ row: { request_snapshot: v2Snapshot() } });
  await source.run();
  const saved = source.row();
  for (const variant of ['production-checkpoint', 'stage', 'asset', 'missing-origin', 'wrong-take', 'wrong-duration', 'unknown-policy']) {
    const frozen = { ...saved.checkpoints.generationSpec, jobId: foreign };
    const stage = plain(saved.checkpoints.audio1);
    const asset = plain(saved.assets.audio1);
    stage.audioOrigin.jobId = foreign;
    asset.audioOrigin.jobId = foreign;
    asset.path = `${owner}/${foreign}/audio1.mp3`;
    if (variant === 'production-checkpoint') frozen.jobId = jobId;
    if (variant === 'stage') stage.audioOrigin.jobId = jobId;
    if (variant === 'asset') asset.path = saved.assets.audio1.path;
    if (variant === 'missing-origin') delete stage.audioOrigin;
    if (variant === 'wrong-take') stage.audioOrigin.takeIndex = 2;
    if (variant === 'wrong-duration') asset.durationSeconds = 60;
    if (variant === 'unknown-policy') frozen.audioPolicyVersion = 'unknown-audio-policy';
    const target = await harness({ row: { id: foreign, request_snapshot: saved.request_snapshot,
      checkpoints: { generationSpec: frozen, audio1: stage }, assets: { audio1: asset } } });
    await assert.rejects(target.run(), error => error.code === 'audio_provenance_mismatch', variant);
    assert.equal(target.row().status, 'needs_attention');
    assert.equal(target.calls.create.length, 0); assert.equal(target.calls.poll.length, 0);
    assert.equal(target.calls.audio.length, 0); assert.equal(target.calls.downloads.length, 0);
    assert.equal(target.calls.render.length, 0);
  }
});

test('unmarked historical jobs recover their own saved audio without regeneration or receipt changes', async () => {
  const h = await harness({ row: { request_snapshot: v2Snapshot() } });
  await h.run();
  const saved = h.row();
  const receiptPath = path.join(h.root, jobId, 'generation-spec.json');
  const receipt = await fs.readFile(receiptPath, 'utf8');
  delete saved.checkpoints.generationSpec.jobId;
  delete saved.checkpoints.generationSpec.userId;
  delete saved.checkpoints.generationSpec.audioPolicyVersion;
  for (let index = 1; index <= 6; index++) {
    delete saved.checkpoints[`audio${index}`].audioOrigin;
    delete saved.assets[`audio${index}`].audioOrigin;
  }
  h.replaceState(saved); h.resetRunning(); await h.run();
  assert.equal(h.calls.audio.length, 6);
  assert.equal(h.calls.create.length, 2);
  assert.equal(await fs.readFile(receiptPath, 'utf8'), receipt);
  assert.equal(h.row().checkpoints.generationSpec.audioPolicyVersion, undefined);
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


test('direction v2 worker submits exactly the prompts compiled for the UI and records review provenance', async () => {
  const plan = v2Snapshot();
  const spec = buildGenerationSpec(plan, jobId);
  assert.equal(spec.version, DIRECTION_VERSION);
  assert.equal(spec.image.input.prompt, plan.prompts.image);
  assert.equal(spec.video.input.prompt, plan.prompts.video);
  assert.equal(buildGenerationSpec(plan, foreign).image.input.prompt, spec.image.input.prompt, 'v2 has no hidden worker-only job variation');
  assert.equal(plan.generation.videoSeconds, 10);
  assert.equal(plan.generation.sourceVideoSeconds, 11);
  const h = await harness({ row: { request_snapshot: plan } });
  await h.run();
  assert.equal(h.calls.create[0].input.prompt, plan.prompts.image);
  assert.equal(h.calls.create[1].input.prompt, plan.prompts.video);
  assert.equal(h.calls.create[1].input.duration, String(plan.generation.sourceVideoSeconds));
  assert.equal(h.calls.render[0].sourceVideoSeconds, plan.generation.sourceVideoSeconds);
  assert.equal(h.row().assets.video.durationSeconds, plan.generation.sourceVideoSeconds);
  assert.equal(h.row().checkpoints.render.ruleVersion, DIRECTION_VERSION);
  assert.equal(h.row().checkpoints.render.reviewStatus, 'pending');
  assert.equal(h.row().checkpoints.render.quality.directionVersion, DIRECTION_VERSION);
  const saved = JSON.parse(await fs.readFile(path.join(h.root, jobId, 'review.json'), 'utf8'));
  assert.deepEqual(saved.quality, h.row().checkpoints.render.quality);
  assert.equal(h.row().checkpoints.render.generationSpecSha256, h.row().checkpoints.generationSpec.sha256);
});

test('direction prompt, version and duration tampering fails before provider calls', async () => {
  for (const alter of [
    plan => { plan.prompts.image += ' Different scene.'; },
    plan => { plan.prompts.video += ' Keep the blanket still.'; },
    plan => { plan.direction.version = 'unknown-future-version'; },
    plan => { plan.generation.sourceVideoSeconds = 10; },
    plan => { plan.generation.videoSeconds = 11; },
    plan => { plan.generation.videoCrossfadeSeconds = 2; },
  ]) {
    const plan = v2Snapshot(); alter(plan);
    const h = await harness({ row: { request_snapshot: plan } });
    await assert.rejects(h.run());
    assert.equal(h.calls.create.length, 0); assert.equal(h.calls.poll.length, 0); assert.equal(h.calls.audio.length, 0);
    assert.equal(h.calls.render.length, 0);
    await assert.rejects(fs.access(path.join(h.root, jobId, 'generation-spec.json')));
  }
});

test('v2 compilation for other scene families does not expand the generation gate', () => {
  for (const overrides of [{ sceneId: 'cabin' }, { sceneId: 'tent' }, { takes: 3 }, { thunder: 'distant' }]) {
    assert.throws(() => buildGenerationSpec(v2Snapshot(overrides), jobId), /sleeper train, no thunder, and six/);
  }
});

test('saved v1 plan retains its exact legacy prompts and job variation', () => {
  const spec = buildGenerationSpec(snapshot, jobId);
  assert.deepEqual(spec, legacy.buildGenerationSpec(snapshot, jobId));
  assert.equal(spec.version, 'sleeper-train-forward-v1');
  assert.ok(spec.image.input.prompt.endsWith('Unique scene variation 33333333.'));
  assert.ok(spec.video.input.prompt.includes('The sleeping adult, blanket, furniture and window frame remain still and unchanged.'));
  assert.notEqual(buildGenerationSpec(snapshot, foreign).image.input.prompt, spec.image.input.prompt);
});

test('a resumed changed v2 plan stops before any provider call and preserves the frozen receipt', async () => {
  const h = await harness({ row: { request_snapshot: v2Snapshot() }, audioUnknown: true });
  await assert.rejects(h.run());
  const receiptPath = path.join(h.root, jobId, 'generation-spec.json');
  const before = await fs.readFile(receiptPath, 'utf8');
  const frozen = h.row().checkpoints.generationSpec;
  h.resetRunning();
  await assert.rejects(h.run(), error => error.code === 'audio_submission_unknown');
  assert.equal(h.calls.create.length, 2); assert.equal(h.calls.audio.length, 1, 'unchanged v2 resume retains the paid-audio hold');
  const callCounts = { create: h.calls.create.length, poll: h.calls.poll.length, audio: h.calls.audio.length };
  h.replaceSnapshot(v2Snapshot({ variation: 1 })); h.resetRunning();
  await assert.rejects(h.run(), error => error.code === 'generation_spec_drift');
  assert.equal(h.row().status, 'needs_attention');
  assert.deepEqual(h.row().checkpoints.generationSpec, frozen);
  assert.equal(await fs.readFile(receiptPath, 'utf8'), before);
  assert.deepEqual({ create: h.calls.create.length, poll: h.calls.poll.length, audio: h.calls.audio.length }, callCounts);
});

test('an existing receipt is never replaced by the new direction version', async () => {
  const h = await harness({ row: { request_snapshot: v2Snapshot() } });
  await fs.mkdir(path.join(h.root, jobId));
  const receiptPath = path.join(h.root, jobId, 'generation-spec.json');
  const oldReceipt = JSON.stringify(legacy.buildGenerationSpec(snapshot, jobId));
  await fs.writeFile(receiptPath, oldReceipt, { flag: 'wx' });
  await assert.rejects(h.run(), error => error.code === 'generation_spec_drift');
  assert.equal(await fs.readFile(receiptPath, 'utf8'), oldReceipt);
  assert.equal(h.row().status, 'needs_attention');
  assert.equal(h.calls.create.length, 0); assert.equal(h.calls.poll.length, 0); assert.equal(h.calls.audio.length, 0);
});

test('resumed v2 assets require matching provenance and duration before polling or downloads', async () => {
  for (const wrongDuration of [false, true]) {
    const plan = v2Snapshot();
    const h = await harness({ row: { request_snapshot: plan } });
    await h.readySource('image', 'scene.png');
    if (wrongDuration) await h.readySource('video', 'source-11s.mp4', { durationSeconds: 10 });
    await assert.rejects(h.run(), error => ['generation_spec_drift', 'generation_spec_missing'].includes(error.code));
    assert.equal(h.calls.create.length, 0); assert.equal(h.calls.poll.length, 0); assert.equal(h.calls.audio.length, 0);
    assert.equal(h.calls.downloads.length, 0);
  }
});

test('explicit failed checkpoints without task references never cause a paid retry', async () => {
  const h = await harness({ row: { checkpoints: { image: { state: 'failed', outcome: 'failed' } } } });
  await assert.rejects(h.run(), error => error.code === 'provider_task_failed');
  assert.equal(h.calls.create.length, 0); assert.equal(h.calls.poll.length, 0);
  assert.equal(h.row().status, 'needs_attention');
});

test('worker derives source filenames, metadata and render targets from the frozen spec', async () => {
  const h = await harness({ renderSeconds: 90, previewSeconds: 20, buildSpec(plan, id) {
    const spec = plain(buildGenerationSpec(plan, id));
    spec.video.input.duration = '12';
    spec.render.sourceVideoSeconds = 12;
    spec.render.targetVideoCycleSeconds = 11;
    spec.render.seconds = 90; spec.render.previewSeconds = 20;
    spec.review.sourceVideoSeconds = 12;
    spec.review.effectiveVideoLoopSeconds = 11;
    return spec;
  } });
  await h.run();
  assert.equal(h.calls.create[1].input.duration, '12');
  assert.ok(h.calls.render[0].video.endsWith('/source-12s.mp4'));
  assert.equal(h.row().assets.video.durationSeconds, 12);
  assert.equal(h.row().assets.preview30.durationSeconds, 20);
  assert.equal(h.row().assets.preview180.durationSeconds, 90);
  assert.ok(h.row().assets.preview30.path.endsWith('healing-rain-20s.mp4'));
  assert.ok(h.row().assets.preview180.path.endsWith('healing-rain-90s.mp4'));
});


test('trusted review registry accepts only bounded private evidence records and fails before spend', async () => {
  const dir = await fs.mkdtemp('/private/tmp/healing-rain-review-registry-test-');
  const filename = path.join(dir, 'reviews.json');
  const record = { profile: 'sleeping-subject', directionVersion: DIRECTION_VERSION, verdict: 'approved',
    evidenceId: 'review-record-1', reviewedAt: '2026-10-13T00:00:00Z',
    models: { image: 'nano-banana-pro', video: 'kling-3.0/video', audio: 'eleven_text_to_sound_v2' } };
  await fs.writeFile(filename, JSON.stringify({ version: 1, records: [record] }), { mode: 0o600, flag: 'wx' });
  const h = await harness({ reviewRegistry: filename });
  assert.deepEqual(plain(await h.loadReviewApprovals({ reviewRegistry: filename })), [record]);
  assert.deepEqual(plain(await h.loadReviewApprovals({})), []);
  for (const value of [
    { version: 2, records: [record] },
    { version: 1, records: [{ ...record, evidenceId: '' }] },
    { version: 1, records: [{ ...record, models: { image: record.models.image } }] },
    { version: 1, records: Array(501).fill(record) },
  ]) {
    await fs.writeFile(filename, JSON.stringify(value));
    const invalid = await harness({ reviewRegistry: filename });
    await assert.rejects(invalid.run(), error => error.code === 'review_registry_invalid');
    assert.equal(invalid.calls.create.length, 0); assert.equal(invalid.calls.poll.length, 0); assert.equal(invalid.calls.audio.length, 0);
    assert.equal(invalid.row().status, 'needs_attention');
  }
  await fs.writeFile(filename, 'x'.repeat(64 * 1024 + 1));
  await assert.rejects(h.loadReviewApprovals({ reviewRegistry: filename }), error => error.code === 'review_registry_invalid');
  await fs.writeFile(filename, JSON.stringify({ version: 1, records: [record] }));
  await fs.chmod(filename, 0o644);
  await assert.rejects(h.loadReviewApprovals({ reviewRegistry: filename }), error => error.code === 'review_registry_invalid');
  await assert.rejects(h.loadReviewApprovals({ reviewRegistry: path.resolve(__dirname, '../package.json') }), error => error.code === 'review_registry_invalid');
});


test('only the trusted registry supplies completed profile reviews to the worker summary', async () => {
  const plan = v2Snapshot();
  const records = plan.direction.profiles.map(profile => ({ profile, directionVersion: DIRECTION_VERSION, verdict: 'approved',
    evidenceId: `review-${profile}`, reviewedAt: '2026-10-13T00:00:00Z',
    models: { image: 'nano-banana-pro', video: 'kling-3.0/video', audio: 'eleven_text_to_sound_v2' } }));
  const dir = await fs.mkdtemp('/private/tmp/healing-rain-review-evidence-test-');
  const filename = path.join(dir, 'reviews.json');
  await fs.writeFile(filename, JSON.stringify({ version: 1, records }), { mode: 0o600, flag: 'wx' });
  const trusted = await harness({ reviewRegistry: filename, row: { request_snapshot: plan } });
  await trusted.run();
  assert.deepEqual(trusted.row().checkpoints.render.quality.unreviewedProfiles, []);
  assert.equal(trusted.row().checkpoints.render.reviewStatus, 'pending');
  assert.ok(Buffer.byteLength(JSON.stringify(trusted.row().checkpoints)) < 32000, 'bounded summary fits the database checkpoint limit');
  plan.approvals = records;
  const untrusted = await harness({ row: { request_snapshot: plan } });
  await untrusted.run();
  assert.ok(untrusted.row().checkpoints.render.quality.unreviewedProfiles.length > 0, 'snapshot-provided approvals are not trusted operator evidence');
});
