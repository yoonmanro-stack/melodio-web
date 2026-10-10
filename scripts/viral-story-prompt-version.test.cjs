/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', 'process', 'fetch', js)(localRequire, mod, mod.exports, { env: {} }, () => { throw Error('NETWORK_FORBIDDEN'); });
  return mod.exports;
}
const { compileViralStoryPrompts, viralStoryInputFingerprint, readViralStoryJob, createViralStoryPipeline, VIRAL_STORY_CATEGORIES } = load('src/lib/video/viralStoryPipeline.ts');
const USER = 'a0000000-0000-4000-8000-000000000001', TRACK = 'a0000000-0000-4000-8000-000000000002', JOB = 'a0000000-0000-4000-8000-000000000003';
const AUDIO = 'https://assets.x.ai/original.mp3';
const INPUT = { prompt: 'An adult protects a small daily goal; her own action makes the practical cost visible, and both actors perform their authored rhythmic payoff.', category: 'food_diet', allowDance: true, cutCadenceSeconds: 1.5 };
const V1_HASHES = {
  drama: '0e2e075403f0e721056036a9e0e2bbb17319162405ce5d17f541aaa5e6e11c7f',
  relationship: 'b495d34ef40365581ea5c7ae62ea48a551c637abfe0cfa41c1ade3631c8a4c59',
  human: '39a2b9bdf3b55e9bdb247ecb42606cb8d3dede1e85b4c39915aa550c744214f6',
  trend: 'a8bfa40cca892764724cbef778f1613964baea602bae5cec706aab2551d5a394',
  challenge: 'f9e7415d2323523c8ff377ea32a6955d354ea06a12838a8c081946a89b410c08',
  brand: '249164b17311227720887861f0c6436ea4ed464adb10dc854ff63bd0b56fa30b',
  history: 'eb875b3220f104e0a1c284ab89621cbf41c0446419b8daec273f47d2017ab6b9',
  parenting: '45c97e653d223fb8de12a2080a9cb61bb14cfa50f5e87541f6b51ad17a32d4fd',
  food_diet: 'cbd185f6f0f4a945a6492e764d1976d7fa6a89335f433031b0c2e2b575b3a501',
  horror_mystery: '9b91c0a4ba847ffd10959629148c260d61b8ba7baf46c0956aa4ada20da31ca0',
};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(input = INPUT, savedV1 = false) {
  let clock = 1_000_000;
  const record = { id: TRACK, userId: USER, status: 'completed', audioUrl: AUDIO, licenseHash: null, metadata: { genCategory: input.category, unrelated: 'preserve' } };
  const calls = [];
  if (savedV1) record.metadata.viralVideoJob = { version: 1, id: JOB, trackId: TRACK, input,
    inputFingerprint: viralStoryInputFingerprint(TRACK, AUDIO, input), prompts: compileViralStoryPrompts(input, 1), sourceAudioUrl: AUDIO,
    status: 'audio', clips: [{ status: 'empty' }, { status: 'empty' }], createdAt: new Date(clock).toISOString(), updatedAt: new Date(clock).toISOString() };
  record.licenseHash = JSON.stringify(record.metadata);
  const store = {
    load: async (user, track) => user === USER && track === TRACK ? structuredClone(record) : null,
    async compareAndSwap(previous, job) {
      if (previous.licenseHash !== record.licenseHash) return null;
      calls.push('CAS'); record.metadata = { ...record.metadata, viralVideoJob: structuredClone(job) }; record.licenseHash = JSON.stringify(record.metadata);
      return structuredClone(record);
    },
  };
  const service = createViralStoryPipeline({ store, now: () => clock,
    snapshotAudio: async () => { calls.push('audio'); return { url: 'https://assets.x.ai/audio.snapshot', hash: 'a'.repeat(64), durationSeconds: 29.8 }; },
    startVideo: async (prompt, referenceImageUrl) => { calls.push({ prompt, referenceImageUrl }); return { requestId: 'same-classic-provider-id' }; },
    pollVideo: async () => { throw Error('unexpected poll'); }, archiveClip: async () => { throw Error('unexpected archive'); },
    extractBridge: async () => { throw Error('unexpected bridge'); }, render: async () => { throw Error('unexpected render'); },
  });
  return { service, record, calls, create: () => service.create(USER, TRACK, JOB, input), step: () => { clock += 6000; return service.advance(USER, TRACK, JOB); },
    mutate(callback) { callback(record.metadata.viralVideoJob); record.licenseHash = JSON.stringify(record.metadata); } };
}
test('all ten V1 prompt pairs and original fingerprint retain exact pre-revision bytes', () => {
  for (const category of VIRAL_STORY_CATEGORIES) assert.equal(digest(compileViralStoryPrompts({ ...INPUT, category }, 1)), V1_HASHES[category]);
  assert.equal(viralStoryInputFingerprint(TRACK, AUDIO, INPUT), '09cfab8707f3c05bcdcd12ae96eb38afcab87764250a3debaaedf13c9123836a');
});
test('fresh V2 applies movement choices and informational cadence to both clips', () => {
  const yes = compileViralStoryPrompts(INPUT), no = compileViralStoryPrompts({ ...INPUT, allowDance: false, cutCadenceSeconds: 3 });
  for (const prompt of yes) {
    assert.match(prompt, /allowDance=true/); assert.match(prompt, /rhythmic movement and dance-like gestures are allowed/);
    assert.match(prompt, /nominal 1\.5 seconds per shot/); assert.match(prompt, /not a mandatory cut schedule/);
    assert.match(prompt, /Hold longer for readable action and payoff/); assert.match(prompt, /examples only, not action selection/);
    assert.match(prompt, /authored prompt controls each actor's cause, movement and payoff/);
    assert.match(prompt, /supporting actors.*their own authored action and payoff/);
    assert.match(prompt, /evolve continuously through motivated authored movement/); assert.match(prompt, /Do not freeze actors/);
    assert.doesNotMatch(prompt, /positions across both clips|DISTINCT HARD CUTS|A NEW CAMERA ANGLE EVERY/);
  }
  for (const prompt of no) { assert.match(prompt, /allowDance=false/); assert.match(prompt, /Do not add dancing or choreography/); assert.match(prompt, /nominal 3 seconds per shot/); }
  assert.notDeepEqual(yes, no);
  assert.match(yes[1], /supplied final frame.*authoritative starting state/);
  assert.match(yes[1], /initial positions, prop state, contacts and eye lines/);
  assert.match(yes[1], /each actor continue the authored movement and cause into their own payoff/);
});
test('the actual-QA sized 2807-byte old C2 still fits V2 within the same 4096-byte cap', () => {
  const before = compileViralStoryPrompts(INPUT, 1)[1];
  const input = { ...INPUT, prompt: INPUT.prompt + 'x'.repeat(2807 - Buffer.byteLength(before)) };
  assert.equal(Buffer.byteLength(compileViralStoryPrompts(input, 1)[1]), 2807);
  for (const prompt of compileViralStoryPrompts(input, 2)) assert.ok(Buffer.byteLength(prompt) <= 4096);
});
test('fresh creation checkpoints V2 and binds its fingerprint before sending the saved prompt', async () => {
  const c = fixture(); const [first, duplicate] = await Promise.all([c.create(), c.create()]);
  assert.equal(first.promptVersion, 2); assert.equal(duplicate.id, first.id);
  const saved = readViralStoryJob(c.record); assert.equal(saved.promptVersion, 2);
  assert.equal(saved.inputFingerprint, viralStoryInputFingerprint(TRACK, AUDIO, INPUT, 2));
  assert.notEqual(saved.inputFingerprint, viralStoryInputFingerprint(TRACK, AUDIO, INPUT));
  assert.deepEqual(c.calls, ['CAS']); assert.equal((await c.service.get(USER, TRACK, JOB)).promptVersion, 2);
  await c.step(); await c.step(); const paid = c.calls.find(value => typeof value === 'object');
  assert.equal(paid.prompt, saved.prompts[0]); assert.match(paid.prompt, /allowDance=true/); assert.match(paid.prompt, /nominal 1\.5 seconds/);
});
test('unmarked saved V1 reads, create retries and provider inputs remain stable after the revision', async () => {
  const c = fixture(INPUT, true), before = c.record.licenseHash;
  const saved = readViralStoryJob(c.record); assert.equal(saved.promptVersion, undefined);
  assert.equal(JSON.stringify(c.record.metadata.viralVideoJob), JSON.stringify(saved));
  assert.equal((await c.create()).promptVersion, undefined); assert.equal(c.record.licenseHash, before); assert.deepEqual(c.calls, []);
  await c.step(); await c.step(); const paid = c.calls.find(value => typeof value === 'object');
  assert.equal(paid.prompt, compileViralStoryPrompts(INPUT, 1)[0]); assert.equal(c.record.metadata.viralVideoJob.promptVersion, undefined);
});
test('a long saved V1 remains idempotent even when fresh V2 compilation would exceed its limit', async () => {
  const input = { ...INPUT, prompt: 'x'.repeat(2400) }; assert.ok(compileViralStoryPrompts(input, 1).every(prompt => Buffer.byteLength(prompt) <= 4096));
  assert.throws(() => compileViralStoryPrompts(input, 2), { code: 'PROMPT_LENGTH' });
  const c = fixture(input, true); const before = c.record.licenseHash;
  assert.equal((await c.create()).id, JOB); assert.equal(c.record.licenseHash, before); assert.deepEqual(c.calls, []);
});
test('V2 version/fingerprint tampering is rejected rather than silently recompiled as V1', async () => {
  const c = fixture(); await c.create(); c.mutate(job => { delete job.promptVersion; });
  assert.throws(() => readViralStoryJob(c.record), { code: 'JOB_INVALID' });
  const d = fixture(INPUT, true); d.mutate(job => { job.promptVersion = 2; });
  assert.throws(() => readViralStoryJob(d.record), { code: 'JOB_INVALID' });
});
test('unsupported stored prompt revisions are held without changing prompts, IDs or durable bytes', async () => {
  for (const promptVersion of [1, 3, null, '2']) {
    const c = fixture(); await c.create(); c.mutate(job => { job.promptVersion = promptVersion; });
    const before = c.record.licenseHash; c.calls.length = 0;
    const view = await c.service.get(USER, TRACK, JOB); assert.equal(view.status, 'held'); assert.equal(view.failureCode, 'PROMPT_VERSION'); assert.equal(view.canResume, false);
    assert.equal((await c.step()).status, 'held'); await assert.rejects(c.service.resume(USER, TRACK, JOB), { code: 'RESUME_UNSAFE' });
    await assert.rejects(c.create(), { code: 'PROMPT_VERSION' }); assert.equal(c.record.licenseHash, before); assert.deepEqual(c.calls, []);
  }
  assert.throws(() => compileViralStoryPrompts(INPUT, 3), { code: 'PROMPT_VERSION' });
});
test('both fresh V2 prompt limits are checked before CAS or any provider operation', async () => {
  const c = fixture({ ...INPUT, prompt: '한'.repeat(1500) }); await assert.rejects(c.create(), { code: 'PROMPT_LENGTH' });
  assert.equal(c.record.metadata.viralVideoJob, undefined); assert.deepEqual(c.calls, []);
});
