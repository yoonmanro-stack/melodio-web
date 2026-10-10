/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loader(overrides = {}, env = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name]
      : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`)
      : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', js)(localRequire, mod, mod.exports, { env }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}
const lib = loader()('src/lib/video/viralStoryPipeline.ts');
const { createViralStoryPipeline, compileViralStoryPrompts, validateViralStoryInput, VIRAL_STORY_CATEGORIES, VIRAL_STORY_LEASE_MS, completedViralStoryResponse, readViralStoryJob } = lib;
const USER = 'a0000000-0000-4000-8000-000000000001', TRACK = 'a0000000-0000-4000-8000-000000000002';
const JOB = 'a0000000-0000-4000-8000-000000000003', OTHER = 'a0000000-0000-4000-8000-000000000004';
const input = { prompt: 'An adult closes her bag. The familiar key is caught inside; she returns with an honest smile.', category: 'drama', allowDance: false, cutCadenceSeconds: 1.5 };
const asset = (name, durationSeconds) => ({ url: `https://assets.x.ai/${name}`, hash: 'a'.repeat(64), durationSeconds });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(overrides = {}) {
  let clock = 1_000_000, record = { id: TRACK, userId: USER, status: 'completed', audioUrl: 'https://assets.x.ai/original.mp3',
    licenseHash: JSON.stringify({ genCategory: 'drama', unrelated: { keep: true } }), metadata: { genCategory: 'drama', unrelated: { keep: true } } };
  const calls = []; let submits = 0, failSave = false;
  const store = {
    async load(user, track) { return user === record.userId && track === record.id ? structuredClone(record) : null; },
    async compareAndSwap(previous, job) {
      if (failSave) throw Error('database unavailable');
      if (previous.userId !== record.userId || previous.status !== 'completed' || previous.licenseHash !== record.licenseHash) return null;
      record.metadata = { ...record.metadata, viralVideoJob: structuredClone(job) };
      record.licenseHash = JSON.stringify(record.metadata); return structuredClone(record);
    },
  };
  const deps = { store, now: () => clock,
    snapshotAudio: async () => { calls.push('audio'); return asset('original.audio', 29.8); },
    startVideo: async (prompt, reference) => { calls.push({ submit: ++submits, reference, prompt }); return { requestId: `request-${submits}` }; },
    pollVideo: async id => { calls.push(`poll:${id}`); return { status: 'done', url: `https://assets.x.ai/${id}.mp4` }; },
    archiveClip: async (_job, index) => { calls.push(`archive:${index}`); return asset(`clip${index + 1}.mp4`, 15); },
    extractBridge: async () => { calls.push('bridge'); return { url: 'https://assets.x.ai/last-decoded-frame.jpg', hash: 'b'.repeat(64) }; },
    render: async job => { calls.push('render'); assert.equal(job.clips.every(clip => clip.asset), true); return asset('final.mp4', 30); },
    ...overrides };
  const service = createViralStoryPipeline(deps);
  return { service, store, calls, get record() { return record; }, get submits() { return submits; },
    failSave(value) { failSave = value; }, tick(ms = 6000) { clock += ms; },
    mutate(callback) { callback(record); record.licenseHash = JSON.stringify(record.metadata); },
    create: (value = input, request = JOB) => service.create(USER, TRACK, request, value),
    step: () => { clock += 11000; return service.advance(USER, TRACK, JOB); },
  };
}
async function until(c, status, limit = 15) {
  let job = await c.service.get(USER, TRACK, JOB);
  for (let index = 0; job.status !== status && index < limit; index++) job = await c.step();
  assert.equal(job.status, status); return job;
}
test('ten generic categories compile both bounded prompts before any reservation or paid POST', async () => {
  assert.equal(VIRAL_STORY_CATEGORIES.length, 10);
  for (const category of VIRAL_STORY_CATEGORIES) {
    const prompts = compileViralStoryPrompts(validateViralStoryInput({ ...input, category }));
    assert.equal(prompts.length, 2); assert.ok(prompts.every(prompt => Buffer.byteLength(prompt) <= 4096));
    assert.match(prompts[1], /supplied final frame/); assert.match(prompts[1], /do not restart or repeat the hook/);
    assert.doesNotMatch(prompts[1], /Hook Repeat|new story/);
  }
  const c = fixture(); await assert.rejects(c.create({ ...input, prompt: '한'.repeat(1500) }), { code: 'PROMPT_LENGTH' });
  assert.equal(c.record.metadata.viralVideoJob, undefined); assert.deepEqual(c.calls, []);
  for (const category of ['pet', 'dance', 'dance_challenge', 'ai_future']) await assert.rejects(c.create({ ...input, category }), { code: 'INPUT' });
  await assert.rejects(c.create({ ...input, prompt: 'inline data: disallowed' }), { code: 'INPUT' });
});
test('creation UUID plus pinned audio/input fingerprint resolves duplicates and rejects changed inputs', async () => {
  const c = fixture(); const [first, second] = await Promise.all([c.create(), c.create()]);
  assert.equal(first.id, JOB); assert.equal(second.id, JOB); assert.equal(first.inputFingerprint, second.inputFingerprint);
  assert.deepEqual(c.calls, []); assert.equal(first.prompt, input.prompt); assert.equal(first.inFlight, false);
  await assert.rejects(c.create({ ...input, prompt: 'changed input' }), { code: 'INPUT_CHANGED' });
  await assert.rejects(c.create(input, OTHER), { code: 'JOB_EXISTS' });
  await assert.rejects(c.service.create(USER, TRACK, JOB, input, 'https://assets.x.ai/different.mp3'), { code: 'AUDIO_MISMATCH' });
  assert.equal((await c.service.get(USER, TRACK, JOB)).id, JOB);
  await assert.rejects(c.service.get(USER, TRACK, OTHER), { code: 'JOB_NOT_FOUND' });
});
test('ordered two-clip completion checkpoints audio, IDs, archives and actual frame before clip2', async () => {
  const c = fixture(); await c.create(); const final = await until(c, 'completed');
  assert.deepEqual(c.calls.map(value => typeof value === 'string' ? value : `submit:${value.submit}`),
    ['audio', 'submit:1', 'poll:request-1', 'archive:0', 'bridge', 'submit:2', 'poll:request-2', 'archive:1', 'render']);
  const submissions = c.calls.filter(value => typeof value === 'object');
  assert.equal(submissions[0].reference, undefined); assert.equal(submissions[1].reference, 'https://assets.x.ai/last-decoded-frame.jpg');
  assert.equal(final.progress, 100); assert.equal(final.durationSeconds, 30); assert.equal(final.is30SecFull, true);
  assert.deepEqual(final.clips, ['https://assets.x.ai/clip1.mp4', 'https://assets.x.ai/clip2.mp4']);
  assert.equal(completedViralStoryResponse(final).videoUrl, 'https://assets.x.ai/final.mp4');
  assert.equal(c.record.metadata.unrelated.keep, true);
  await c.step(); await assert.rejects(c.create(input, OTHER), { code: 'JOB_EXISTS' }); assert.equal(c.submits, 2);
});
test('parallel advances see the persisted lease and cannot duplicate a paid POST', async () => {
  const gate = deferred(); let calls = 0;
  const c = fixture({ startVideo: async () => { calls++; await gate.promise; return { requestId: 'one' }; } });
  await c.create(); await c.step(); const pending = c.step(); await new Promise(setImmediate);
  assert.equal(c.record.metadata.viralVideoJob.clips[0].status, 'submitting');
  assert.equal(c.record.metadata.viralVideoJob.lease.operation, 'clip1_submit');
  const repeated = await c.step(); assert.equal(repeated.inFlight, true); assert.equal(calls, 1);
  gate.resolve(); await pending; assert.equal(c.record.metadata.viralVideoJob.clips[0].requestId, 'one'); assert.equal(calls, 1);
});
test('unknown POST response is held, sanitized and never resumed or resubmitted', async () => {
  let calls = 0; const c = fixture({ startVideo: async () => { calls++; throw Error('secret provider body with prompt'); } });
  await c.create(); await c.step(); const held = await c.step();
  assert.equal(held.status, 'held'); assert.equal(held.failureCode, 'UNKNOWN_SUBMISSION'); assert.equal(held.canResume, false);
  assert.doesNotMatch(JSON.stringify(c.record.metadata), /secret provider body/);
  assert.doesNotMatch(held.failureMessage, /secret/);
  await c.step(); await assert.rejects(c.service.resume(USER, TRACK, JOB), { code: 'RESUME_UNSAFE' });
  assert.equal(calls, 1);
});
test('abandoned paid marker becomes held after lease expiry without another POST', async () => {
  const c = fixture(); await c.create(); await c.step();
  c.mutate(record => { const job = record.metadata.viralVideoJob; job.clips[0] = { status: 'submitting', submittedAt: job.updatedAt };
    job.lease = { token: OTHER, until: 0, operation: 'clip1_submit' }; });
  const held = await c.step(); assert.equal(held.failureCode, 'UNKNOWN_SUBMISSION'); assert.equal(c.submits, 0);
});
test('known-ID polling transport failures retry GET against same ID without another POST', async () => {
  let polls = 0; const c = fixture({ pollVideo: async requestId => { assert.equal(requestId, 'request-1'); polls++;
    if (polls === 1) throw Error('temporary timeout'); return { status: 'done', url: 'https://assets.x.ai/one.mp4' }; } });
  await c.create(); await c.step(); await c.step(); const delayed = await c.step();
  assert.equal(delayed.status, 'clip1'); assert.equal(c.record.metadata.viralVideoJob.clips[0].requestId, 'request-1');
  await c.step(); assert.equal(c.submits, 1); assert.equal(polls, 2);
});
test('archive and render retries reuse saved source and clip IDs without re-submission', async () => {
  let archives = 0, renders = 0;
  const c = fixture({ archiveClip: async (_job, index) => { if (++archives === 1) throw Error('upload failed'); return asset(`clip${index + 1}.mp4`, 15); },
    render: async () => { if (++renders === 1) throw Error('local ffmpeg error'); return asset('final.mp4', 30); } });
  await c.create(); const held = await until(c, 'held'); assert.equal(held.canResume, true); assert.equal(c.submits, 1);
  assert.equal(c.record.metadata.viralVideoJob.clips[0].sourceUrl, 'https://assets.x.ai/request-1.mp4');
  await c.service.resume(USER, TRACK, JOB); const renderHeld = await until(c, 'held'); assert.equal(c.submits, 2); assert.equal(renderHeld.canResume, true);
  await c.service.resume(USER, TRACK, JOB); await until(c, 'completed'); assert.equal(c.submits, 2); assert.equal(renders, 2);
});
test('provider terminal result never re-submits a known request', async () => {
  const c = fixture({ pollVideo: async () => ({ status: 'expired' }) }); await c.create(); await c.step(); await c.step();
  const held = await c.step(); assert.equal(held.failureCode, 'PROVIDER_RESULT'); assert.equal(held.canResume, false);
  await c.step(); assert.equal(c.submits, 1); await assert.rejects(c.service.resume(USER, TRACK, JOB), { code: 'RESUME_UNSAFE' });
});
test('checkpoint failure retains paid marker and blocks duplicate billing after expiry', async () => {
  const gate = deferred(); const c = fixture({ startVideo: async () => { await gate.promise; return { requestId: 'provider-id' }; } });
  await c.create(); await c.step(); const pending = c.step(); await new Promise(setImmediate);
  c.failSave(true); gate.resolve(); await assert.rejects(pending, /database unavailable/); c.failSave(false);
  assert.equal(c.record.metadata.viralVideoJob.clips[0].status, 'submitting');
  assert.equal((await c.step()).inFlight, true);
  c.tick(VIRAL_STORY_LEASE_MS); assert.equal((await c.step()).failureCode, 'UNKNOWN_SUBMISSION');
});
test('checkpoint merges latest unrelated metadata and stale local results cannot overwrite a newer lease', async () => {
  const gate = deferred(); let snapshots = 0;
  const c = fixture({ snapshotAudio: async () => { if (++snapshots === 1) await gate.promise; return asset('original.audio', 29.8); } });
  await c.create(); const first = c.step(); await new Promise(setImmediate);
  c.tick(VIRAL_STORY_LEASE_MS); await c.step(); gate.resolve(); await assert.rejects(first, { code: 'JOB_CONFLICT' });
  assert.equal(c.record.metadata.viralVideoJob.status, 'clip1');
  const paidGate = deferred(); const d = fixture({ startVideo: async () => { await paidGate.promise; return { requestId: 'known' }; } });
  await d.create(); await d.step(); const submit = d.step(); await new Promise(setImmediate);
  d.mutate(record => { record.metadata.externalUpdate = 'preserve'; }); paidGate.resolve(); await submit;
  assert.equal(d.record.metadata.externalUpdate, 'preserve'); assert.equal(d.record.metadata.viralVideoJob.clips[0].requestId, 'known');
});
test('owner/category and corrupted saved-input checks fail before any provider calls', async () => {
  const c = fixture(); await assert.rejects(c.service.create(OTHER, TRACK, JOB, input), { code: 'NOT_FOUND' });
  c.mutate(record => { record.metadata.presetId = 'pet'; }); await assert.rejects(c.create(), { code: 'TRACK_CATEGORY' });
  assert.deepEqual(c.calls, []);
  const d = fixture(); await d.create(); d.mutate(record => { record.metadata.viralVideoJob.prompts[1] = 'corrupt'; });
  assert.throws(() => readViralStoryJob(d.record), { code: 'JOB_INVALID' }); await assert.rejects(d.step(), { code: 'JOB_INVALID' }); assert.deepEqual(d.calls, []);
});
test('direct-url submission is checkpointed and archived without polling or a second C1 POST', async () => {
  let posts = 0; const c = fixture({ startVideo: async () => ({ url: `https://assets.x.ai/direct-${++posts}.mp4` }) });
  await c.create(); await until(c, 'completed'); assert.equal(posts, 2); assert.equal(c.calls.some(call => typeof call === 'string' && call.startsWith('poll:')), false);
});
test('local operation deadline holds safely and a late result cannot checkpoint itself', async () => {
  const gate = deferred(); const c = fixture({ operationTimeoutMs: 10, snapshotAudio: async () => { await gate.promise; return asset('late.audio', 29.8); } });
  await c.create(); const held = await c.step(); assert.equal(held.status, 'held'); assert.equal(held.failureCode, 'OPERATION_TIMEOUT');
  assert.equal(held.canResume, true); gate.resolve(); await new Promise(setImmediate);
  assert.equal(c.record.metadata.viralVideoJob.audio, undefined); assert.equal(c.record.metadata.viralVideoJob.status, 'held'); assert.equal(c.submits, 0);
});
test('expired provider download URL recovery polls its original ID and never re-submits', async () => {
  let archives = 0;
  const c = fixture({ archiveClip: async () => { if (++archives === 1) throw new lib.ViralStoryError('expired URL', 'MEDIA_FETCH'); return asset('clip1.mp4', 15); } });
  await c.create(); await until(c, 'held'); assert.equal(c.submits, 1);
  await c.service.resume(USER, TRACK, JOB); await c.step(); await c.step();
  assert.equal(c.submits, 1); assert.equal(c.calls.filter(value => value === 'poll:request-1').length, 2); assert.equal(archives, 2);
});
