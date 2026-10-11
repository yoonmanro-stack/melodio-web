/* eslint-disable @typescript-eslint/no-require-imports -- Node's existing test runner uses CommonJS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ts = require('typescript');

const file = path.resolve(__dirname, '../src/lib/vle/viral-story-client.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleHost = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleHost, exports: moduleHost.exports, crypto: webcrypto, TextEncoder,
  AbortController, URL, setTimeout, clearTimeout,
  fetch() { throw new Error('Live fetch is forbidden in client recovery tests'); },
});
const { ViralStoryVideoClient, readViralStoryRecovery, viralStoryProgressLabel, VIRAL_STORY_VIDEO_CATEGORIES } = moduleHost.exports;
const ownerId = '11111111-1111-4111-8111-111111111111';
const trackId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const input = { trackId, prompt: 'A continuous authored scene.', category: 'drama', allowDance: false, cutCadenceSeconds: 1.5, audioUrl: 'https://media.example/song.mp3' };
const job = (status = 'clip1', overrides = {}) => ({
  id: jobId, trackId, version: 1, category: 'drama', status,
  progress: { audio: 5, clip1: 20, bridge: 45, clip2: 60, render: 90, completed: 100, held: 20 }[status],
  inFlight: false, canResume: false, updatedAt: '2026-10-10T00:00:00Z', inputFingerprint: 'a'.repeat(64),
  prompt: input.prompt, allowDance: false, cutCadenceSeconds: 1.5,
  ...(status === 'completed' ? { videoUrl: 'https://media.example/final.mp4', clips: ['https://media.example/c1.mp4', 'https://media.example/c2.mp4'], durationSeconds: 30, is30SecFull: true } : {}),
  ...overrides,
});
function storage(initial = new Map()) {
  return { values: initial, getItem(key) { return initial.get(key) || null; }, setItem(key, value) { initial.set(key, value); } };
}
function harness(replies, options = {}) {
  const calls = [], states = [], store = options.storage || storage();
  const client = new ViralStoryVideoClient({ ownerId, trackId, storage: store, wait: async () => {},
    onState(state) { states.push(JSON.parse(JSON.stringify(state))); },
    fetch: async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url, body, method: init.method || 'GET' });
      assert.ok(String(url).startsWith('/api/viral-cf/grok-video/jobs'), 'No legacy/provider/cover/PATCH endpoint is allowed');
      assert.equal(init.cache, 'no-store');
      const reply = replies.shift();
      assert.notEqual(reply, undefined, `Unexpected request ${body?.action || 'read'}`);
      if (reply instanceof Error) throw reply;
      if (typeof reply === 'function') return reply(body);
      return { ok: true, json: async () => ({ success: true, job: reply }) };
    }, ...options,
  });
  return { client, calls, states, store, last: () => states.at(-1) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('ten generic categories opt in while pet, dance and legacy categories stay outside the new flow', () => {
  assert.equal(VIRAL_STORY_VIDEO_CATEGORIES.size, 10);
  for (const category of ['pet', 'dance', 'dance_challenge', 'ai_future', 'unknown']) assert.equal(VIRAL_STORY_VIDEO_CATEGORIES.has(category), false);
});

test('reload restores an owned existing job with GET only, including the frozen prompt', async () => {
  const host = harness([job('clip2')]);
  await host.client.restore();
  assert.deepEqual(host.calls.map(call => call.method), ['GET']);
  assert.equal(host.last().job.status, 'clip2');
  assert.equal(host.last().job.prompt, input.prompt);
  const token = readViralStoryRecovery(host.store, ownerId);
  assert.equal(token.trackId, trackId);
  assert.equal(token.jobId, jobId);
  assert.equal(readViralStoryRecovery(host.store, 'other-account'), null);
});

test('completed restore preserves every existing result field and does not trigger extra work', async () => {
  const host = harness([job('completed'), job('completed')]);
  await host.client.restore();
  await host.client.start({ ...input, prompt: 'A changed draft cannot replace the frozen job.' });
  assert.deepEqual(host.calls.map(call => call.method), ['GET', 'GET']);
  const result = host.last().job;
  assert.equal(result.videoUrl, 'https://media.example/final.mp4');
  assert.equal(result.durationSeconds, 30);
  assert.equal(result.clips.length, 2);
  assert.equal(result.is30SecFull, true);
  assert.equal(result.inputFingerprint, 'a'.repeat(64));
});

test('two immediate clicks create one UUID and one job, with a stored fingerprint before POST', async () => {
  let release;
  const firstRead = new Promise(resolve => { release = resolve; });
  const host = harness([async () => firstRead, body => {
    const token = readViralStoryRecovery(host.store, ownerId, trackId);
    assert.equal(token.jobId, body.requestId);
    assert.equal(token.uncertain, true);
    assert.match(token.inputFingerprint, /^[0-9a-f]{64}$/);
    return { ok: true, json: async () => ({ success: true, job: job('completed', { id: body.requestId }) }) };
  }]);
  const pending = host.client.start(input);
  await host.client.start(input);
  release({ ok: true, json: async () => ({ success: true, job: null }) });
  await pending;
  assert.deepEqual(host.calls.map(call => call.body?.action || 'read'), ['read', 'create']);
  assert.match(host.calls[1].body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(host.last().busy, false);
});

test('creation snapshots manually authored text and parameters before an asynchronous read', async () => {
  let release;
  const host = harness([() => new Promise(resolve => { release = resolve; }), body => ({
    ok: true, json: async () => ({ success: true, job: job('completed', { id: body.requestId }) }),
  })]);
  const draft = { ...input };
  const pending = host.client.start(draft);
  draft.prompt = 'Late replacement'; draft.allowDance = true; draft.cutCadenceSeconds = 3;
  release({ ok: true, json: async () => ({ success: true, job: null }) });
  await pending;
  assert.equal(host.calls[1].body.prompt, input.prompt);
  assert.equal(host.calls[1].body.allowDance, false);
  assert.equal(host.calls[1].body.cutCadenceSeconds, 1.5);
});

test('durable stage progression uses one saved identity and reaches the complete two-clip result', async () => {
  const host = harness([job('audio'), job('clip1'), job('bridge'), job('clip2'), job('render'), job('completed')]);
  await host.client.start(input);
  assert.deepEqual(host.calls.map(call => call.body?.action || 'read'), ['read', 'advance', 'advance', 'advance', 'advance', 'advance']);
  for (const call of host.calls.slice(1)) assert.equal(call.body.jobId, jobId);
  assert.deepEqual([...new Set(host.states.filter(state => state.job).map(state => state.job.status))], ['audio', 'clip1', 'bridge', 'clip2', 'render', 'completed']);
  assert.match(viralStoryProgressLabel(job('clip1')), /첫 번째 15초/);
  assert.match(viralStoryProgressLabel(job('clip2')), /두 번째 15초/);
  assert.equal(host.last().job.progress, 100);
});

test('an in-flight server lease is read until released before another advance', async () => {
  const host = harness([job('clip1', { inFlight: true }), job('clip1'), job('completed')]);
  await host.client.start(input);
  assert.deepEqual(host.calls.map(call => call.body?.action || 'read'), ['read', 'read', 'advance']);
});

for (const failureCode of ['UNKNOWN_SUBMISSION', 'PROVIDER_RESULT', 'PROVIDER_FAILED', 'PROVIDER_TERMINAL_FAILURE', 'MEDIA_HASH']) {
  test(`held ${failureCode} cannot resubmit even with misleading canResume`, async () => {
    const host = harness([job('held', { failureCode, canResume: true, failureMessage: '요청 상태 확인 필요' })]);
    await host.client.start(input);
    assert.deepEqual(host.calls.map(call => call.method), ['GET']);
    assert.equal(host.last().job.status, 'held');
  });
}

test('a retryable held local stage requires explicit resume and keeps its identity', async () => {
  const held = job('held', { failureCode: 'RENDER_FAILED', canResume: true });
  const host = harness([held, held, job('render'), job('completed')]);
  await host.client.restore();
  assert.deepEqual(host.calls.map(call => call.method), ['GET']);
  await host.client.start();
  assert.deepEqual(host.calls.map(call => call.body?.action || 'read'), ['read', 'read', 'resume', 'advance']);
  assert.ok(host.calls.filter(call => call.body).every(call => call.body.jobId === jobId));
});

test('unknown create response retains pending UUID across reload and never sends another create', async () => {
  const store = storage();
  const first = harness([null, new Error('transport lost'), null], { storage: store });
  await first.client.start(input);
  const token = readViralStoryRecovery(store, ownerId, trackId);
  assert.equal(token.uncertain, true);
  assert.equal(first.last().uncertain, true);
  const reloaded = harness([null, null], { storage: store });
  await reloaded.client.restore();
  await reloaded.client.start(input);
  assert.deepEqual(reloaded.calls.map(call => call.method), ['GET', 'GET']);
  assert.equal(readViralStoryRecovery(store, ownerId, trackId).jobId, token.jobId);
  assert.match(reloaded.last().error, /새 요청을 보내지 않고/);
});

test('a lost advance response does GET-only recovery and requires a new explicit action', async () => {
  const host = harness([job('clip1'), new Error('response lost after acceptance'), job('clip2')]);
  await host.client.start(input);
  assert.deepEqual(host.calls.map(call => call.body?.action || 'read'), ['read', 'advance', 'read']);
  assert.equal(host.last().job.status, 'clip2');
  assert.ok(host.last().error);
  assert.equal(host.last().busy, false);
});

test('a duplicate/create conflict recovers the existing server job without a fresh ID', async () => {
  const host = harness([null, () => ({ ok: false, json: async () => ({ success: false, code: 'JOB_EXISTS' }) }), job('clip1')]);
  await host.client.start(input);
  assert.deepEqual(host.calls.map(call => call.body?.action || 'read'), ['read', 'create', 'read']);
  assert.equal(host.last().job.id, jobId);
});

test('an explicit pre-creation validation rejection allows a corrected draft after another authoritative read', async () => {
  const host = harness([null, () => ({ ok: false, json: async () => ({ success: false, code: 'PROMPT_LENGTH', error: '기획을 간결하게 수정해 주세요.' }) }),
    null, body => ({ ok: true, json: async () => ({ success: true, job: job('completed', { id: body.requestId }) }) })]);
  await host.client.start(input);
  assert.equal(host.last().uncertain, false);
  assert.match(host.last().error, /간결하게/);
  const firstId = host.calls[1].body.requestId;
  await host.client.start({ ...input, prompt: 'Short corrected scene.' });
  assert.deepEqual(host.calls.map(call => call.body?.action || 'read'), ['read', 'create', 'read', 'create']);
  assert.notEqual(host.calls[3].body.requestId, firstId);
  assert.equal(host.calls[3].body.prompt, 'Short corrected scene.');
  assert.equal(host.last().job.status, 'completed');
});

test('malformed POST responses are held and recovered by reading, without an old-endpoint fallback', async () => {
  const host = harness([job('clip1'), () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } }), job('held', { failureCode: 'UNKNOWN_SUBMISSION' })]);
  await host.client.start(input);
  assert.deepEqual(host.calls.map(call => call.body?.action || 'read'), ['read', 'advance', 'read']);
  assert.equal(host.last().job.failureCode, 'UNKNOWN_SUBMISSION');
});

test('wrong-track or unsupported-version recovery data never advances', async () => {
  for (const invalid of [job('clip1', { trackId: ownerId }), job('clip1', { version: 9 }), job('completed', { videoUrl: 'invalid-media-url' })]) {
    const host = harness([invalid, invalid]);
    await host.client.start(input);
    assert.ok(host.calls.every(call => call.method === 'GET'));
    assert.equal(host.last().job, null);
    assert.equal(host.last().uncertain, true);
  }
});

test('incomplete or unverified completed responses stay uncertain and never advance', async () => {
  const malformed = [
    { durationSeconds: undefined }, { durationSeconds: 29.8 }, { durationSeconds: 30.2 }, { durationSeconds: NaN },
    { clips: undefined }, { clips: ['https://media.example/c1.mp4'] },
    { clips: ['https://media.example/c1.mp4', 'invalid-clip-url'] },
    { clips: ['https://media.example/c1.mp4', 'http://media.example/c2.mp4'] },
    { clips: ['https://media.example/c1.mp4', 'https://user:password@media.example/c2.mp4'] },
    { is30SecFull: undefined }, { is30SecFull: false },
    { videoUrl: 'http://media.example/final.mp4' }, { videoUrl: 'https://user:password@media.example/final.mp4' },
  ];
  for (const invalid of malformed) {
    const host = harness([job('completed', invalid), job('completed', invalid)]);
    await host.client.start(input);
    assert.ok(host.calls.every(call => call.method === 'GET'), `Malformed completion must be read-only: ${Object.keys(invalid)}`);
    assert.equal(host.last().job, null, `Do not fabricate completion from missing/invalid ${Object.keys(invalid)}`);
    assert.equal(host.last().uncertain, true);
  }
});

test('verified complete responses retain server-measured duration within the decoder tolerance', async () => {
  for (const durationSeconds of [29.96, 30, 30.04]) {
    const host = harness([job('completed', { durationSeconds })]);
    await host.client.restore();
    assert.equal(host.last().job.durationSeconds, durationSeconds);
    assert.equal(host.last().job.clips.length, 2);
    assert.equal(host.last().job.is30SecFull, true);
  }
});

test('storage unavailable and read failure cannot unlock creation', async () => {
  const unavailable = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } };
  const host = harness([new Error('read failed'), new Error('read failed')], { storage: unavailable });
  await host.client.start(input);
  assert.ok(host.calls.every(call => call.method === 'GET'));
  assert.equal(host.last().uncertain, true);
});

test('disposing an old owner/track client rejects late state writes and paid continuation', async () => {
  let release;
  const host = harness([() => new Promise(resolve => { release = resolve; })]);
  const pending = host.client.start(input);
  const writeCount = host.states.length;
  host.client.dispose();
  release({ ok: true, json: async () => ({ success: true, job: job('clip1') }) });
  await pending; await tick();
  assert.equal(host.states.length, writeCount);
  assert.deepEqual(host.calls.map(call => call.method), ['GET']);
});

// The page is initially staged separately to preserve MAIN's unrelated WIP. These
// tests also run once its reviewed patch is merged, or with the candidate preload.
const pageFile = path.resolve(__dirname, '../src/app/(app)/viral/page.tsx');
const pageText = fs.readFileSync(pageFile, 'utf8');
const hasPageIntegration = pageText.includes("from '@/lib/vle/viral-story-client'");
function pageFunction(name, bindings) {
  const ast = ts.createSourceFile(pageFile, pageText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node;
    if (!declaration) ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(declaration, `Missing page handler ${name}`);
  const output = ts.transpileModule(`module.exports = (${declaration.initializer.getText(ast)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const runtime = { exports: {} };
  vm.runInNewContext(output, { module: runtime, exports: runtime.exports, console,
    useCallback: callback => callback,
    VIRAL_STORY_VIDEO_CATEGORIES, isViralStoryTrackId: moduleHost.exports.isViralStoryTrackId,
    setInterval: () => 1, clearInterval: () => {}, ...bindings });
  return runtime.exports;
}
function pageEffect(dependencies, bindings) {
  const ast = ts.createSourceFile(pageFile, pageText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let call;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && ts.isArrayLiteralExpression(node.arguments[1])
      && node.arguments[1].elements.length === dependencies.length
      && node.arguments[1].elements.every((value, index) => value.getText(ast) === dependencies[index])) call = node;
    if (!call) ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(call, `Missing page effect ${dependencies}`);
  const output = ts.transpileModule(`module.exports = (${call.arguments[0].getText(ast)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const runtime = { exports: {} };
  vm.runInNewContext(output, { module: runtime, exports: runtime.exports, console, ...bindings });
  return runtime.exports;
}
function pageBindings(overrides = {}) {
  return {
    genCategory: 'drama', DANCE_CATEGORY_ID: 'dance_challenge', customLyrics: '', readPetEpisode: () => null, readViralBrief: () => null,
    selectedGrokTrack: { id: trackId, category: 'drama', audio_url: input.audioUrl }, generatedResult: null, currentPlayingTrack: null,
    storyVideoJob: null, storyTrackId: trackId, petUserId: ownerId,
    grokVideoPrompt: input.prompt, grokAllowDance: false, grokCutCadence: 1.5,
    storyClientRef: { current: { start: async () => {} } }, setGrokVideoError: () => {},
    setIsGeneratingGrokVideo() { throw new Error('Durable branch must return before the legacy handler'); },
    fetch() { throw new Error('Unexpected legacy/provider request'); }, ...overrides,
  };
}

test('page routes the authored snapshot through the durable helper without a legacy fallback', { skip: !hasPageIntegration }, async () => {
  const submissions = [];
  await pageFunction('handleGenerateGrokVideo', pageBindings({ storyClientRef: { current: { start: async draft => { submissions.push(draft); } } } }))();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].prompt, input.prompt);
  assert.equal(submissions[0].audioUrl, input.audioUrl);
  assert.equal(submissions[0].trackId, trackId);
});

test('page resumes the recovered job while an unrelated library song is playing', { skip: !hasPageIntegration }, async () => {
  const submissions = [];
  await pageFunction('handleGenerateGrokVideo', pageBindings({
    selectedGrokTrack: null, currentPlayingTrack: { id: ownerId, category: 'ai_future' }, storyVideoJob: job('clip2'),
    storyClientRef: { current: { start: async draft => { submissions.push(draft); } } },
  }))();
  assert.deepEqual(submissions, [undefined]);
});

test('page leaves pet generation with its existing studio', { skip: !hasPageIntegration }, async () => {
  await pageFunction('handleGenerateGrokVideo', pageBindings({ genCategory: 'pet',
    storyClientRef: { current: { start() { throw new Error('Pet must not enter generic jobs'); } } },
  }))();
});

test('page preserves the old endpoint for a category outside the ten opt-in categories', { skip: !hasPageIntegration }, async () => {
  const calls = [];
  await pageFunction('handleGenerateGrokVideo', pageBindings({
    genCategory: 'ai_future', selectedGrokTrack: { id: trackId, category: 'ai_future', audio_url: input.audioUrl },
    setIsGeneratingGrokVideo() {}, setGrokVideoProgress() {}, fetchDynamicGrokPrompt: async () => input.prompt,
    fetch: async url => { calls.push(url); return { text: async () => JSON.stringify({ success: false, error: 'Legacy fixture' }) }; },
    console: { log() {}, error() {} },
  }))();
  assert.deepEqual(calls, ['/api/viral-cf/grok-video']);
});

test('page reuses a recovered frozen prompt without another planning call', { skip: !hasPageIntegration }, async () => {
  const prompt = await pageFunction('fetchDynamicGrokPrompt', pageBindings({
    grokPromptRequest: { current: 1, frozenJob: { trackId, prompt: 'Saved exact prompt' } },
  }))({ id: trackId });
  assert.equal(prompt, 'Saved exact prompt');
});

test('a deferred fresh-track prompt survives the later scope reset on the same render', { skip: !hasPageIntegration }, async () => {
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const writes = [], calls = [];
  const request = { current: 0 };
  const bindings = pageBindings({
    grokPromptRequest: request, setIsTuningPrompt() {}, setGrokVideoPrompt(value) { writes.push(value); },
    setGrokAllowDance() {}, setGrokCutCadence() {},
    fetch: async url => { calls.push(url); return deferred; },
  });
  bindings.fetchDynamicGrokPrompt = pageFunction('fetchDynamicGrokPrompt', bindings);
  // Selection and restore are read-only; explicit planning follows the restore boundary.
  const promptCleanup = pageEffect(['selectedGrokTrack?.id', 'genCategory'], bindings)();
  let restores = 0;
  class ReadOnlyClient {
    constructor() {}
    async restore() { restores += 1; }
    dispose() {}
  }
  const scopeCleanup = pageEffect(['petUserId', 'storyTrackId'], {
    ...bindings, window: { localStorage: storage() }, ViralStoryVideoClient: ReadOnlyClient,
    storyScopeRef: { current: '' }, storyCompletedResultRef: { current: '' }, storyClientRef: { current: null }, storyReadyRef: { current: null },
    setStoryClientState() {}, setIsGeneratingGrokVideo() {}, setGrokVideoProgress() {},
    setGrokVideoResult() {}, setGrokVideoClips() {}, setGrokVideoDuration() {},
  })();
  assert.deepEqual(calls, []);
  const pending = bindings.fetchDynamicGrokPrompt(bindings.selectedGrokTrack).then(value => bindings.setGrokVideoPrompt(value));
  release({ ok: true, json: async () => ({ prompt: 'Fresh selected-track prompt', allowDance: false, cutCadenceSeconds: 1.5 }) });
  await pending;
  await tick();
  assert.deepEqual(calls, ['/api/viral-cf/grok-video/prompt']);
  assert.equal(restores, 1);
  assert.deepEqual(writes, ['', 'Fresh selected-track prompt']);
  promptCleanup(); scopeCleanup();
});
