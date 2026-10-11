/** Offline UI behavior checks. No browser, database, network, or provider credentials. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const componentFile = path.join(root, 'src/components/viral/PetVideoStudio.tsx');
const pageFile = path.join(root, 'src/app/(app)/viral/page.tsx');
const generateRouteFile = path.join(root, 'src/app/api/generate/route.ts');
const sourceCache = new Map();
function compile(source, filename) {
  return ts.transpileModule(source, { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
}
function load(file, globals = {}, react = React) {
  if (!sourceCache.has(file)) sourceCache.set(file, compile(fs.readFileSync(file, 'utf8'), file));
  const module = { exports: {} };
  const context = {
    module, exports: module.exports,
    require(name) {
      if (name === '@/lib/globalAudio') return { registerActiveAudio() {} };
      if (name === 'react') return react;
      if (name === '@/lib/vle/petEpisode') return contract;
      if (name === '@/lib/video/petContentReadiness') return load(path.join(root, 'src/lib/video/petContentReadiness.ts'));
      return require(name);
    },
    setTimeout, clearTimeout, console,
    fetch() { throw new Error('Unexpected network request in offline UI test'); },
    ...globals,
  };
  vm.runInNewContext(sourceCache.get(file), context, { filename: file });
  return module.exports;
}
const contract = load(path.join(root, 'src/lib/vle/petEpisode.ts'));
const editor = load(componentFile);
const fixture = {
  version: 'pet-v3', id: 'fixture-episode', title: '검토용 콘티', sourceTopic: '사용자가 직접 작성한 상황',
  story: '집사와 반려동물의 작은 오해가 풀린다.', pov: 'owner_inner_voice',
  fingerprint: { prop: 'keyboard', conflict: 'shared_space', twist: 'owner_misreads' }, candidates: [],
  character: { species: 'cat', appearance: 'An adult grey cat', owner: 'One adult', setting: 'One desk', continuity: [] },
  lyrics: '검토한 가사 그대로', stylePrompt: 'quiet acoustic talk-sung pop', models: [], createdAt: '2026-09-14T00:00:00Z',
  shots: [4, 5, 5, 6, 6, 4].map((durationSeconds, index, lengths) => ({
    id: `S${index + 1}`, startSeconds: lengths.slice(0, index).reduce((a, b) => a + b, 0), durationSeconds,
    beat: '관찰', caption: `장면 ${index + 1}`, action: 'Cat looks at the owner', camera: 'fixed medium shot',
    keyframePrompt: 'Adult cat beside a desk, one starting frame', videoPrompt: 'One small head turn, fixed camera',
  })),
};
test('planning cautions are visible in both public planner and two-clip editors before generation', () => {
  for (const episode of [fixture, v4Fixture()]) {
    const html = renderToStaticMarkup(editor.PetEpisodeEditor({ episode: { ...episode, planningWarnings: ['원문과 장면의 행동 연결을 확인해 주세요.'] }, onChange() {} }));
    assert.match(html, /생성 전에 이야기 흐름을 확인해 주세요/);
    assert.match(html, /원문과 장면의 행동 연결을 확인해 주세요/);
  }
});
function v4Fixture() {
  const sourceTopic = '강아지가 슬리퍼를 사람에게 배달하고 사람이 웃으며 받는다';
  let start = 0;
  const positions = ['현관', '복도 입구', '복도', '거실 입구', '소파 앞', '사람 옆'];
  const props = ['현관 바닥', '강아지 입', '복도', '거실 입구', '사람 앞', '사람 손'];
  const shots = [3, 5, 7, 5, 6, 4].map((durationSeconds, index) => {
    const previous = Math.max(0, index - 1);
    const shot = {
      id: `S${index + 1}`, startSeconds: start, durationSeconds, beat: `행동 ${index + 1}`, caption: `편집 장면 ${index + 1}`,
      action: `강아지가 슬리퍼를 옮기는 행동 ${index + 1}`, camera: ['wide', 'close-up', 'tracking'][index % 3],
      keyframePrompt: `Editorial image ${index + 1}`, videoPrompt: `Editorial motion ${index + 1}`,
      state: { actorId: 'A1', actionType: index === 5 ? 'reveal' : 'move', affectedPropIds: ['P1'],
        before: { actors: [{ actorId: 'A1', position: positions[previous] }, { actorId: 'A2', position: '소파' }], props: [{ propId: 'P1', count: 1, position: props[previous] }] },
        after: { actors: [{ actorId: 'A1', position: positions[index] }, { actorId: 'A2', position: '소파' }], props: [{ propId: 'P1', count: 1, position: props[index] }] } },
    };
    start += durationSeconds; return shot;
  });
  return { ...fixture, version: 'pet-v4', id: 'fixture-v4', title: '슬리퍼 배달 작전', sourceTopic, shots,
    production: { mode: 'two-clips', actors: [{ id: 'A1', kind: 'pet', visibility: 'on_screen', description: '작은 베이지색 강아지' }, { id: 'A2', kind: 'human', visibility: 'on_screen', description: '회색 옷을 입은 한 사람' }], actorId: 'A1', actor: '강아지와 사람이 실제 화면에 등장', coreAction: '강아지가 슬리퍼를 사람에게 배달한다', payoff: '사람이 슬리퍼를 받고 웃는다', payoffCauseBeatIds: ['S2', 'S3'], inventory: [{ id: 'P1', description: '갈색 슬리퍼 한 짝', count: 1 }], format: '9:16 photorealistic continuous film', sourceConstraints: [{ quote: sourceTopic, kind: 'situation', beatIds: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] }], audioPlan: { targetBpm: 120, turnSeconds: 15, vocalsEndBySeconds: 27, cadenceSeconds: 3, alignmentStatus: 'planned' }, clips: [
      { id: 'C1', startSeconds: 0, durationSeconds: 15, beat: '상황과 시도', caption: '첫 구간', action: '슬리퍼를 옮긴다', camera: 'vertical', keyframePrompt: 'Master image with dog and human', videoPrompt: 'First continuous 15 second action', beatIds: ['S1', 'S2', 'S3'] },
      { id: 'C2', startSeconds: 15, durationSeconds: 15, beat: '반전과 결말', caption: '둘째 구간', action: '슬리퍼를 건넨다', camera: 'vertical', keyframePrompt: 'Bridge frame', videoPrompt: 'Second continuous 15 second payoff', beatIds: ['S4', 'S5', 'S6'] },
    ] } };
}
function job(status, extra = {}) {
  return { id: 'fixture-job', episodeId: fixture.id, status, progress: 40, message: '장면 확인', estimatedCostUsd: 0,
    shots: fixture.shots.map(shot => ({ id: shot.id, status: 'ready', keyframeUrl: `https://example.invalid/${shot.id}.png` })), ...extra };
}
function v4Job(status, extra = {}) {
  const episode = v4Fixture();
  return { id: 'fixture-v4-job', episodeId: episode.id, productionMode: 'two-clips', status, progress: 40, message: '두 클립 제작', estimatedCostUsd: 1.524,
    shots: episode.production.clips.map(clip => ({ id: clip.id, status: 'video_ready', keyframeUrl: `https://example.invalid/${clip.id}.jpg`, videoUrl: `https://example.invalid/${clip.id}.mp4`, motionPrompt: clip.videoPrompt })), ...extra };
}
function walk(node, predicate, found = []) {
  if (Array.isArray(node)) { node.forEach(item => walk(item, predicate, found)); return found; }
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  walk(node.props?.children, predicate, found);
  return found;
}
function label(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(label).join('');
  return typeof node === 'object' ? label(node.props?.children) : String(node);
}
const findButton = (tree, text) => walk(tree, node => node.type === 'button' && label(node).includes(text))[0];

/** Execute real handlers/effects with a tiny hook host; every I/O surface is a stub. */
function studioHarness(initialJob = null, overrides = {}) {
  const states = [], refs = [], effects = [], requests = [], delays = [], storageReads = [], storageWrites = [], completed = [], busy = [];
  const effectRecords = [], cleanups = [];
  let stateCursor = 0, refCursor = 0, effectCursor = 0;
  const react = { ...React,
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = index === 0 ? initialJob : typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) { const index = refCursor++; return refs[index] || (refs[index] = { current: initial }); },
    useEffect(callback, dependencies) {
      const index = effectCursor++, previous = effectRecords[index];
      if (!previous || !dependencies || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
        effectRecords[index] = dependencies;
        effects.push(() => { cleanups[index]?.(); const cleanup = callback(); cleanups[index] = typeof cleanup === 'function' ? cleanup : null; });
      }
    },
  };
  const props = { userId: 'owner-A', episode: fixture, trackId: 'matching-track', onBusyChange: value => busy.push(value), onLockedChange() {}, onCompleted: value => completed.push(value), ...overrides.props };
  const component = load(componentFile, {
    localStorage: { getItem(key) { storageReads.push(key); return overrides.savedJobId || null; }, setItem(key, value) { storageWrites.push({ key, value }); } },
    setTimeout(callback, delay) { delays.push(delay); queueMicrotask(callback); return 1; },
    async fetch(url, options) {
      requests.push({ url, body: options?.body ? JSON.parse(options.body) : null });
      const next = overrides.reply ? await overrides.reply(requests.at(-1), requests.length) : initialJob;
      if (!next) throw new Error('No offline reply configured');
      return { ok: true, json: async () => ({ success: true, job: next }) };
    },
  }, react).default;
  function render(nextProps = {}) { Object.assign(props, nextProps); stateCursor = 0; refCursor = 0; effectCursor = 0; return component(props); }
  function flushEffects() { effects.splice(0).forEach(effect => effect()); }
  return { render, flushEffects, effects, requests, delays, storageReads, storageWrites, completed, busy, states,
    unmount() { cleanups.forEach(cleanup => cleanup?.()); },
  };
}
async function settle(check) {
  for (let i = 0; i < 30; i++) { if (check()) return; await new Promise(resolve => setImmediate(resolve)); }
  assert.fail('Offline handler did not settle');
}

// Pull production handlers structurally, without maintaining duplicate implementations.
const pageSource = ts.createSourceFile(pageFile, fs.readFileSync(pageFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let ownedLoaderNode;
function findOwnedLoader(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'loadOwnedPetTracks') ownedLoaderNode = node;
  ts.forEachChild(node, findOwnedLoader);
}
findOwnedLoader(pageSource);
assert.ok(ownedLoaderNode && ts.isArrowFunction(ownedLoaderNode.parent.parent), 'Use the complete production owned-list effect');
const ownedLoaderCode = compile(`module.exports = (${ownedLoaderNode.parent.parent.getText(pageSource)});`, 'owned-track-effect.ts');
function ownedTracksHarness(overrides = {}) {
  const state = { tracks: ['previous-account-track'], pending: ['previous-account-pending'], owner: 'previous-account', status: 'ready' }, requests = [], changes = [];
  const bindings = {
    petUserId: 'owner-A', genCategory: 'pet', petAccountRef: { current: 'owner-A' }, readPetEpisode: editor.readPetEpisode,
    setPetOwnedTracks(value) { state.tracks = value; changes.push(['tracks', value]); },
    setPetPendingTracks(value) { state.pending = value; changes.push(['pending', value]); },
    setPetOwnedTracksOwner(value) { state.owner = value; changes.push(['owner', value]); },
    setPetOwnedTracksStatus(value) { state.status = value; changes.push(['status', value]); },
    ...overrides,
  };
  const module = { exports: {} };
  vm.runInNewContext(ownedLoaderCode, { ...bindings, module, exports: module.exports,
    async fetch(url, options) {
      requests.push({ url, options });
      return overrides.reply ? overrides.reply() : { ok: true, json: async () => ({ generations: [] }) };
    },
  });
  return { run: module.exports, state, requests, changes, bindings };
}

test('pet owned loader separates completed audio from owned generating and failed pet work', async () => {
  const valid = { user_id: 'owner-A', status: 'completed', title: '키보드 하나 더 사면 끝인 줄', is_public: false, license_hash: JSON.stringify({ isPublic: false, petEpisode: fixture }) };
  const rows = [
    { ...valid, id: 'private-pet' },
    { ...valid, id: 'foreign', user_id: 'owner-B' },
    { ...valid, id: 'pending', status: 'processing' },
    { ...valid, id: 'generating-pet', status: 'generating' },
    { ...valid, id: 'failed-pet', status: 'failed' },
    { ...valid, id: 'foreign-pending', user_id: 'owner-B', status: 'generating' },
    { ...valid, id: 'invalid-pending', status: 'generating', license_hash: JSON.stringify({ petEpisode: { ...fixture, shots: [] } }) },
    { ...valid, id: 'invalid', license_hash: JSON.stringify({ petEpisode: { ...fixture, shots: [] } }) },
    { id: 'ordinary', user_id: 'owner-A', status: 'completed', title: '일반 음원' },
  ];
  const harness = ownedTracksHarness({ reply: () => ({ ok: true, json: async () => ({ generations: rows }) }) });
  harness.run();
  assert.equal(harness.state.status, 'loading');
  assert.equal(harness.state.tracks.length, 0);
  assert.equal(harness.state.pending.length, 0);
  await settle(() => harness.state.status === 'ready');
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, '/api/generations?scope=dashboard&limit=50');
  assert.equal(harness.requests[0].options.cache, 'no-store');
  assert.deepEqual(Array.from(harness.state.tracks, row => row.id), ['private-pet']);
  assert.deepEqual(Array.from(harness.state.pending, row => row.id), ['generating-pet', 'failed-pet']);
  assert.equal(harness.state.owner, 'owner-A');
});

test('pet owned loader clears on logout and rejects stale account responses', async () => {
  for (const context of [{ petUserId: null }]) {
    const harness = ownedTracksHarness(context);
    harness.run();
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.state.tracks.length, 0);
    assert.equal(harness.state.pending.length, 0);
    assert.equal(harness.state.status, 'idle');
    assert.equal(harness.state.owner, context.petUserId === null ? null : 'owner-A');
  }
  const otherCategory = ownedTracksHarness({ genCategory: 'drama' });
  otherCategory.run();
  await settle(() => otherCategory.state.status === 'ready');
  assert.equal(otherCategory.requests.length, 1);
  for (const staleMode of ['account', 'cleanup']) {
    let resolveReply;
    const harness = ownedTracksHarness({ reply: () => new Promise(resolve => { resolveReply = resolve; }) });
    const cleanup = harness.run();
    const before = harness.changes.length;
    if (staleMode === 'account') harness.bindings.petAccountRef.current = 'owner-B';
    else cleanup();
    resolveReply({ ok: true, json: async () => ({ generations: ['completed', 'generating', 'failed'].map(status => ({ id: `stale-${status}`, user_id: 'owner-A', status, metadata: { petEpisode: fixture } })) }) });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.changes.length, before);
    assert.equal(harness.state.tracks.length, 0);
    assert.equal(harness.state.pending.length, 0);
  }
});

test('pet owned loader distinguishes empty success from request and malformed-list failures', async () => {
  const empty = ownedTracksHarness();
  empty.run();
  await settle(() => empty.state.status === 'ready');
  assert.equal(empty.state.tracks.length, 0);
  for (const reply of [
    () => ({ ok: false, json: async () => ({ error: 'Unavailable' }) }),
    () => ({ ok: true, json: async () => ({ generations: null }) }),
    () => { throw new Error('Offline request failure'); },
  ]) {
    const harness = ownedTracksHarness({ reply });
    harness.run();
    await settle(() => harness.state.status === 'error');
    assert.equal(harness.state.tracks.length, 0);
    assert.equal(harness.state.pending.length, 0);
  }
});

function pageDeclaration(name) {
  let found;
  function visit(node) {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText(pageSource) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(pageSource);
  assert.ok(found, `The production ${name} declaration must exist`);
  return found;
}
function completionHarness(overrides = {}) {
  const changes = [], preview = [];
  let refreshKey = null;
  const bindings = {
    petUserId: 'owner-A', petAccountRef: { current: 'owner-A' },
    setGrokVideoResult(value) { preview.push(value); }, setGrokVideoDuration() {}, setGrokVideoClips() {}, setGrokVideoProgress() {},
    setPetCompletedRefreshKey(value) { if (!Object.is(value, refreshKey)) { refreshKey = value; changes.push(value); } },
    ...overrides,
  };
  const callback = pageDeclaration('handlePetCompleted').initializer.arguments[0];
  const module = { exports: {} };
  vm.runInNewContext(compile(`module.exports = (${callback.getText(pageSource)});`, 'completed-handler.ts'), { ...bindings, module, exports: module.exports });
  return { run: module.exports, changes, preview, bindings };
}

test('video completion reloads the owned list once per job and URL without paid requests', async () => {
  const dependencies = ownedLoaderNode.parent.parent.parent.arguments[1].elements.map(node => node.getText(pageSource));
  assert.ok(dependencies.includes('petCompletedRefreshKey'));
  assert.ok(dependencies.includes('petTrackId'));
  assert.ok(dependencies.includes('petOwnedTracksRefreshVersion'));
  let videoUrl;
  const harness = ownedTracksHarness({ reply: () => ({ ok: true, json: async () => ({ generations: [{ id: 'matching-track', user_id: 'owner-A', status: 'completed', metadata: { petEpisode: fixture }, video_url: videoUrl }] }) }) });
  let cleanup = harness.run();
  await settle(() => harness.state.status === 'ready');
  assert.equal(harness.state.tracks[0].video_url, undefined);
  const completion = completionHarness();
  const result = job('completed', { videoUrl: 'https://example.invalid/final.mp4', progress: 100 });
  completion.run(result); completion.run(result);
  assert.equal(completion.changes.length, 1, 'Repeated restore callbacks keep an identical dependency key');
  videoUrl = result.videoUrl; cleanup(); cleanup = harness.run();
  await settle(() => harness.state.status === 'ready');
  assert.equal(harness.state.tracks[0].video_url, result.videoUrl);
  completion.run({ ...result, videoUrl: 'https://example.invalid/revised.mp4' });
  assert.equal(completion.changes.length, 2);
  completion.run({ ...result, id: 'another-job' });
  assert.equal(completion.changes.length, 3);
  assert.ok(harness.requests.every(request => request.options.method === undefined && request.options.body === undefined));
  cleanup();
});

test('missing results and stale account completion callbacks cannot refresh or replace previews', () => {
  for (const context of [{ petUserId: null }, { petAccountRef: { current: 'owner-B' } }]) {
    const harness = completionHarness(context);
    harness.run(job('completed', { videoUrl: 'https://example.invalid/final.mp4' }));
    assert.equal(harness.changes.length, 0); assert.equal(harness.preview.length, 0);
  }
  const missing = completionHarness(); missing.run(job('completed'));
  assert.equal(missing.changes.length, 0);
});

test('pending work shows only audio states and marks the matching account draft without action controls', () => {
  const module = { exports: {} };
  vm.runInNewContext(compile(`${pageDeclaration('PetPendingTrackList').getText(pageSource)}\nmodule.exports = PetPendingTrackList;`, 'pending-list.tsx'), {
    module, exports: module.exports, require, readPetEpisode: editor.readPetEpisode,
  });
  const props = { tracks: [{ id: 'matching-track', status: 'generating', petEpisode: fixture }, { id: 'failed-track', status: 'failed', petEpisode: fixture }], owner: 'owner-A', userId: 'owner-A', draftOwner: 'owner-A', episodeId: fixture.id, trackId: 'matching-track' };
  const tree = module.exports(props);
  assert.ok(label(tree).includes('음원 생성 중')); assert.ok(label(tree).includes('음원 생성 실패'));
  assert.equal(walk(tree, node => node.type === 'li' && label(node).includes('현재 콘티')).length, 1);
  assert.equal(walk(tree, node => ['button', 'video', 'audio', 'a'].includes(node.type)).length, 0);
  for (const mismatch of [{ draftOwner: 'owner-B' }, { trackId: 'different-track' }, { episodeId: 'different-episode' }]) {
    assert.equal(label(module.exports({ ...props, ...mismatch })).includes('현재 콘티'), false);
  }
  assert.equal(module.exports({ ...props, userId: null }), null);
  assert.equal(module.exports({ ...props, userId: 'owner-B' }), null);
  assert.equal(module.exports({ ...props, tracks: [] }), null);
});

function petGenerationHarness(overrides = {}) {
  const requests = [], trackIds = [], polls = [], cleared = [], calls = {}, alerts = [];
  let refreshVersion = 0;
  const module = { exports: {} };
  const bindings = {
    genCategory: 'pet', petEpisode: fixture, customLyrics: fixture.lyrics, optimizedPrompt: fixture.stylePrompt, planIsCurrent: true,
    petPlanLocked: false, generatedResult: null, selectedVocal: 'Talk-Sung', selectedGenre: 'fixture', selectedMood: 'Quiet',
    petUserId: 'owner-A', petAccountRef: { current: 'owner-A' }, petCategoryRef: { current: 'pet' },
    petPlanningRequest: { current: 0 }, audioGenerationRef: { current: null }, pendingAudioRef: { current: null },
    readCategoryBriefExtras() { return {}; },
    VIRAL_GENRE_PROMPT_MAP: {}, CATEGORY_TITLES: { pet: '댕냥이' }, CATEGORY_THUMBNAIL_MAP: { pet: 'https://example.invalid/poster.png' }, brandName: '', producerBrief: null, customTopic: fixture.sourceTopic,
    effectiveIsPublic: false, validatePetEpisode: contract.validatePetEpisode, isPetInstrumental: contract.isPetInstrumental,
    setPetTrackId(value) { trackIds.push(value); },
    setPetOwnedTracksRefreshVersion(value) { refreshVersion = typeof value === 'function' ? value(refreshVersion) : value; },
    setInterval(callback) { polls.push(callback); return 1; }, clearInterval(id) { cleared.push(id); },
    async fetch(url, options) {
      requests.push({ url, options });
      return overrides.reply ? overrides.reply(url, options) : { ok: true, json: async () => ({ success: true, track: { id: 'new-pet-track' } }) };
    },
    console, alert(value) { alerts.push(value); },
    ...overrides,
  };
  for (const name of ['setPetPlanError', 'setIsGenerating', 'setGenProgress', 'setSelectedGrokTrackId', 'setIsPlaying', 'setGeneratedResult', 'setPetEpisode', 'setPetLinkedTrack']) {
    bindings[name] = value => { (calls[name] ||= []).push(value); };
  }
  vm.runInNewContext(compile(`module.exports = (${pageDeclaration('handleGenerate').initializer.getText(pageSource)});`, 'generate-handler.ts'), { ...bindings, module, exports: module.exports });
  return { run: module.exports, requests, trackIds, polls, cleared, calls, alerts, bindings, refreshVersion: () => refreshVersion };
}

test('an explicitly submitted pet audio ID is retained for draft restoration before polling completes', async () => {
  const harness = petGenerationHarness(); await harness.run();
  assert.deepEqual(harness.trackIds, ['new-pet-track']);
  assert.equal(harness.polls.length, 1);
  assert.deepEqual(harness.requests.map(request => request.url), ['/api/generate']);
  assert.equal(JSON.parse(harness.requests[0].options.body).metadata.petEpisode.id, fixture.id);
});

test('instrumental Pet audio submits its planned mode and empty lyrics despite a stale vocal selector', async () => {
  const episode = { ...fixture, audioMode: 'instrumental', lyrics: '' };
  const harness = petGenerationHarness({ petEpisode: episode, customLyrics: '', selectedVocal: 'Talk-Sung' });
  await harness.run();
  assert.equal(harness.alerts.length, 0); assert.equal(harness.requests.length, 1);
  const payload = JSON.parse(harness.requests[0].options.body);
  assert.equal(payload.isInstrumental, true); assert.equal(payload.lyricsPrompt, '');
  assert.deepEqual(payload.selections.vocal, ['Instrumental']);
  assert.deepEqual(payload.metadata.petEpisode, episode);
  assert.equal(payload.metadata.petEpisode.shots.filter(shot => shot.caption).length, 6);
});

test('legacy Pet vocal audio preserves its identity and lyrics despite a stale instrumental selector', async () => {
  const harness = petGenerationHarness({ selectedVocal: 'Instrumental' });
  await harness.run();
  const payload = JSON.parse(harness.requests[0].options.body);
  assert.equal(payload.isInstrumental, false); assert.equal(payload.lyricsPrompt, fixture.lyrics);
  assert.deepEqual(payload.selections.vocal, ['Vocal']); assert.deepEqual(payload.metadata.petEpisode, fixture);
  assert.equal(Object.hasOwn(payload.metadata.petEpisode, 'audioMode'), false);
});

test('empty lyrics cannot submit stale instrumental plans, empty vocal plans or contradictory instrumental lyrics', async () => {
  for (const change of [
    { petEpisode: { ...fixture, audioMode: 'instrumental', lyrics: '' }, customLyrics: '', planIsCurrent: false },
    { customLyrics: '' },
    { petEpisode: { ...fixture, audioMode: 'instrumental', lyrics: '' }, customLyrics: '숨겨진 보컬 가사' },
  ]) {
    const harness = petGenerationHarness(change); await harness.run();
    assert.equal(harness.requests.length, 0); assert.equal(harness.polls.length, 0);
    assert.ok(harness.calls.setPetPlanError?.length);
  }
});

test('late pet audio completion cannot overwrite another account or a newer draft', async () => {
  for (const staleMode of ['account', 'new-draft']) {
    let resolveReply;
    const harness = petGenerationHarness({ reply(url) {
      return url === '/api/generate'
        ? { ok: true, json: async () => ({ success: true, track: { id: 'new-pet-track' } }) }
        : new Promise(resolve => { resolveReply = resolve; });
    } });
    await harness.run();
    const polling = harness.polls[0]();
    if (staleMode === 'account') harness.bindings.petAccountRef.current = 'owner-B';
    else harness.bindings.petPlanningRequest.current += 1;
    resolveReply({ ok: true, json: async () => ({ generation: { id: 'new-pet-track', status: 'completed', audio_url: 'https://example.invalid/audio.mp3' } }) });
    await polling;
    assert.equal(harness.calls.setGeneratedResult, undefined);
    assert.equal(harness.calls.setPetEpisode, undefined);
    assert.equal(harness.calls.setPetLinkedTrack, undefined);
    assert.deepEqual(harness.trackIds, ['new-pet-track']);
    assert.equal(harness.cleared.length, 1); assert.equal(harness.alerts.length, 0);
  }
});

test('failed audio polling refreshes pending status once and never resubmits generation', async () => {
  const harness = petGenerationHarness({ reply(url) {
    return { ok: true, json: async () => url === '/api/generate'
      ? { success: true, track: { id: 'new-pet-track' } }
      : { generation: { id: 'new-pet-track', status: 'failed' } } };
  } });
  await harness.run(); await harness.polls[0](); await harness.polls[0]();
  assert.equal(harness.refreshVersion(), 1); assert.equal(harness.alerts.length, 1);
  assert.equal(harness.calls.setIsGenerating.at(-1), false);
  assert.deepEqual(harness.requests.map(request => request.url), ['/api/generate', '/api/generations?id=new-pet-track']);
  assert.equal(harness.requests.filter(request => request.options?.method === 'POST').length, 1, 'Only the original explicit submission runs');
});

test('dashboard shows owned pet audio work awaiting video with accurate states and safe links', () => {
  const dashboardFile = path.join(root, 'src/app/(app)/dashboard/page.tsx');
  const source = ts.createSourceFile(dashboardFile, fs.readFileSync(dashboardFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let component;
  function find(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'DashboardPetProductionList') component = node; ts.forEachChild(node, find); }
  find(source); assert.ok(component);
  const module = { exports: {} };
  vm.runInNewContext(compile(`${component.getText(source)}\nmodule.exports = DashboardPetProductionList;`, 'dashboard-pet-list.tsx'), {
    module, exports: module.exports, require, Link: 'a', readPetEpisode: editor.readPetEpisode,
  });
  const row = { user_id: 'owner-A', status: 'completed', license_hash: JSON.stringify({ sourceMenu: 'viral', petEpisode: fixture }) };
  const distinctEpisode = { ...fixture, id: 'distinct-episode' };
  const ownerScopedEpisode = { ...fixture, id: 'owner-scoped-episode' };
  const metadataVideoEpisode = { ...fixture, id: 'metadata-video-episode' };
  const malformedVideoEpisode = { ...fixture, id: 'malformed-video-episode' };
  const history = [
    ...['completed', 'generating', 'failed'].map(status => ({ ...row, id: status, status })),
    { ...row, id: 'video', video_url: 'https://example.invalid/video.mp4' },
    { ...row, id: 'distinct', license_hash: JSON.stringify({ sourceMenu: 'viral', petEpisode: distinctEpisode }) },
    { ...row, id: 'owner-scoped', license_hash: JSON.stringify({ sourceMenu: 'viral', petEpisode: ownerScopedEpisode }) },
    { ...row, id: 'foreign-video', user_id: 'owner-B', video_url: 'https://example.invalid/foreign.mp4', license_hash: JSON.stringify({ sourceMenu: 'viral', petEpisode: ownerScopedEpisode }) },
    { ...row, id: 'metadata-waiting', license_hash: JSON.stringify({ sourceMenu: 'viral', petEpisode: metadataVideoEpisode }) },
    { ...row, id: 'metadata-video', license_hash: JSON.stringify({ sourceMenu: 'viral', petEpisode: metadataVideoEpisode, video_url: 'https://example.invalid/video.mp4' }) },
    { ...row, id: 'malformed-video', license_hash: JSON.stringify({ sourceMenu: 'viral', petEpisode: malformedVideoEpisode, video_url: { href: 'https://example.invalid/not-a-url-value.mp4' } }) },
    { ...row, id: 'invalid', license_hash: JSON.stringify({ sourceMenu: 'viral', petEpisode: { ...fixture, shots: [] } }) },
    { ...row, id: 'ordinary', license_hash: JSON.stringify({ sourceMenu: 'audio-forge', petEpisode: fixture }) },
  ];
  const tree = module.exports({ history, userId: 'owner-A' });
  assert.equal(walk(tree, node => node.type === 'li').length, 5);
  for (const status of ['음원 완료 · 영상 제작 대기', '음원 생성 중', '음원 생성 실패']) assert.ok(label(tree).includes(status));
  assert.deepEqual(walk(tree, node => node.type === 'a').map(node => node.props.href), [
    '/viral',
    '/viral',
    '/viral?petTrack=distinct',
    '/viral?petTrack=owner-scoped',
    '/viral?petTrack=malformed-video',
  ]);
  assert.equal(walk(tree, node => ['img', 'video', 'audio', 'button'].includes(node.type)).length, 0);
  assert.equal(module.exports({ history, userId: null }), null);
  assert.equal(module.exports({ history: [row], userId: 'owner-B' }), null);
});

function requestedTrackHarness(overrides = {}) {
  const opened = [], categories = [];
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(pageSource) === 'useEffect'
      && node.arguments[0]?.getText(pageSource).includes('petOpeningTrackRequest.current = requestKey')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(pageSource); assert.ok(effect, 'Use the actual requested-track effect');
  const module = { exports: {} };
  const bindings = {
    requestedPetTrackId: 'owned-track', petUserId: 'owner-A', petOwnedTracksOwner: 'owner-A', petOwnedTracksStatus: 'ready',
    petAccountRef: { current: 'owner-A' }, isGenerating: false, isGeneratingGrokVideo: false, isOptimizing: false, genCategory: 'pet',
    petOwnedTracks: [{ id: 'owned-track', user_id: 'owner-A', status: 'completed', audio_url: 'https://example.invalid/owned.mp3', petEpisode: fixture }],
    explicitCategorySelection: { current: null }, petOpeningTrackRequest: { current: null }, petTrackId: null, generatedResult: null,
    readPetEpisode: editor.readPetEpisode,
    setGenCategory(value) { categories.push(value); }, async handleLoadPetTrack(id) { opened.push(id); bindings.petTrackId = id; bindings.generatedResult = { id }; }, ...overrides,
  };
  Object.assign(bindings, { module, exports: module.exports });
  vm.runInNewContext(compile(`module.exports = (${effect.getText(pageSource)});`, 'requested-track-effect.ts'), bindings);
  return { run: module.exports, opened, categories, bindings };
}

test('dashboard link loads a completed owned pet track once after the list is ready without generating', () => {
  const harness = requestedTrackHarness(); harness.run(); harness.run();
  assert.deepEqual(harness.opened, ['owned-track']);
  const category = requestedTrackHarness({ genCategory: 'challenge' }); category.run();
  assert.deepEqual(category.categories, ['pet']); assert.equal(category.opened.length, 0);
  for (const context of [
    { petOwnedTracksStatus: 'loading' }, { petOwnedTracksOwner: 'owner-B' }, { petAccountRef: { current: 'owner-B' } },
    { isGenerating: true }, { isGeneratingGrokVideo: true }, { isOptimizing: true },
    { petOwnedTracks: [{ id: 'owned-track', user_id: 'owner-B', status: 'completed', petEpisode: fixture }] },
    { petOwnedTracks: [{ id: 'owned-track', user_id: 'owner-A', status: 'generating', petEpisode: fixture }] },
  ]) { const blocked = requestedTrackHarness(context); blocked.run(); assert.equal(blocked.opened.length, 0); }
});

function petTrackLoadHarness(overrides = {}) {
  const calls = {}, requests = [];
  const module = { exports: {} };
  const bindings = {
    petUserId: 'owner-A', petAccountRef: { current: 'owner-A' }, petPlanningRequest: { current: 0 }, petCategoryRef: { current: 'pet' },
    petTopicDraft: { current: '' }, isGenerating: false, isGeneratingGrokVideo: false, isOptimizing: false, readPetEpisode: editor.readPetEpisode,
    ...overrides,
  };
  for (const name of ['setPetPlanError', 'setPetEpisode', 'setPetTrackId', 'setPetLinkedTrack', 'setCustomTopic', 'setCustomLyrics', 'setOptimizedPrompt', 'setProducerBrief', 'setGeneratedResult', 'setGrokVideoResult', 'setGrokVideoClips', 'setGrokVideoDuration']) bindings[name] = value => { (calls[name] ||= []).push(value); };
  const declaration = pageDeclaration('handleLoadPetTrack');
  const callback = ts.isFunctionDeclaration(declaration) ? declaration : declaration.initializer.arguments[0];
  vm.runInNewContext(compile(`module.exports = (${callback.getText(pageSource)});`, 'owned-pet-track-load.ts'), {
    ...bindings, module, exports: module.exports,
    async fetch(url, options) { requests.push({ url, options }); return overrides.reply(); },
  });
  return { run: module.exports, calls, requests, bindings };
}

/** Render the production card JSX after executing the real generation/load handlers. */
function completedAudioCardHarness(overrides = {}) {
  let card;
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.left.getText(pageSource).includes('generatedResult ||')
      && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && node.right.getText(pageSource).includes('<PetVideoStudio')) card = node;
    ts.forEachChild(node, visit);
  }
  visit(pageSource); assert.ok(card, 'Use the actual completed-audio card');
  const declarations = ['petCurrentEpisode', 'petLinkedEpisode', 'petMatchingTrackId', 'completedOwnedPetAudio']
    .map(name => `const ${pageDeclaration(name).getText(pageSource)};`).join('\n');
  const scrolls = [], module = { exports: {} };
  vm.runInNewContext(compile(`${declarations}\nmodule.exports = ${card.getText(pageSource)};`, 'completed-audio-card.tsx'), {
    ...require('lucide-react'), module, exports: module.exports, require,
    petUserId: 'owner-A', petDraftOwner: 'owner-A', petOwnedTracksOwner: 'owner-A', petOwnedTracksStatus: 'loading', petOwnedTracks: [],
    petEpisode: fixture, customLyrics: fixture.lyrics, optimizedPrompt: fixture.stylePrompt, genCategory: 'pet',
    generatedResult: null, petLinkedTrack: null, audioDuration: 27.7, isGenerating: false, isGeneratingGrokVideo: false,
    petTrackId: null, petStartRequest: null, PetVideoStudio: editor.default,
    handlePetVideoState() {}, handlePetRequestSettled() {}, setIsGeneratingGrokVideo() {}, setPetPlanLocked() {}, handlePetCompleted() {},
    isPlaying: false, currentPlayingTrack: null, readPetEpisode: editor.readPetEpisode, togglePlay() {},
    step4CardRef: { current: { scrollIntoView(value) { scrolls.push(value); } } }, ...overrides,
  });
  return { tree: module.exports, scrolls };
}

test('completed pet audio delegates to the scoped studio and has no duplicate Step 5 CTA', async () => {
  const generated = petGenerationHarness({ reply(url) {
    return { ok: true, json: async () => url === '/api/generate'
      ? { success: true, track: { id: 'new-pet-track' } }
      : { generation: { id: 'new-pet-track', user_id: 'owner-A', status: 'completed', audio_url: 'https://example.invalid/ready.mp3' } } };
  } });
  await generated.run(); await generated.polls[0]();
  const completed = { generatedResult: generated.calls.setGeneratedResult.at(-1), petLinkedTrack: generated.calls.setPetLinkedTrack.at(-1) };
  assert.equal(generated.calls.setIsGenerating.at(-1), false);
  for (const petOwnedTracksStatus of ['loading', 'error']) {
    const card = completedAudioCardHarness({ ...completed, petOwnedTracksStatus });
    const studio = walk(card.tree, node => node.type === editor.default);
    assert.equal(studio.length, 1);
    assert.equal(studio[0].props.externalControl, true); assert.equal(studio[0].props.compact, true);
    assert.equal(studio[0].props.trackId, 'new-pet-track'); assert.equal(studio[0].props.userId, 'owner-A');
    assert.equal(typeof studio[0].props.onStateChange, 'function'); assert.equal(typeof studio[0].props.onRequestSettled, 'function');
    assert.equal(studio[0].props.startRequest, null);
    assert.equal(findButton(card.tree, 'Step 5 영상 생성하기'), undefined);
    const html = renderToStaticMarkup(card.tree);
    assert.equal(html.includes('Step 5 영상 생성하기'), false);
    assert.deepEqual(card.scrolls, []);
  }
  for (const context of [
    { petUserId: 'owner-B' }, { petDraftOwner: 'owner-B' },
    { petLinkedTrack: { ...completed.petLinkedTrack, user_id: 'owner-B' } },
    { petLinkedTrack: { ...completed.petLinkedTrack, status: 'generating' } },
    { petLinkedTrack: { ...completed.petLinkedTrack, id: 'other-track' } }, { generatedResult: null },
  ]) {
    const card = completedAudioCardHarness({ ...completed, ...context });
    assert.equal(findButton(card.tree, 'Step 5 영상 생성하기'), undefined);
    const studio = walk(card.tree, node => node.type === editor.default)[0];
    if (studio) assert.equal(studio.props.trackId, null, 'Only matching completed owned audio can enter video creation');
  }
});

test('loading an owned legacy 27.7-second track connects the externally controlled studio when the list omits it', async () => {
  const track = { id: 'legacy-27.7s', user_id: 'owner-A', status: 'completed', audio_url: 'https://example.invalid/legacy.mp3', title: '기존 완료 음원', petEpisode: fixture };
  const loaded = petTrackLoadHarness({ reply: () => ({ ok: true, json: async () => ({ generation: track }) }) });
  await loaded.run(track.id);
  const card = completedAudioCardHarness({ generatedResult: loaded.calls.setGeneratedResult.at(-1), petLinkedTrack: loaded.calls.setPetLinkedTrack.at(-1), petOwnedTracksStatus: 'ready', petOwnedTracks: [] });
  const studio = walk(card.tree, node => node.type === editor.default)[0];
  assert.equal(studio.props.externalControl, true); assert.equal(studio.props.trackId, track.id);
  assert.equal(findButton(card.tree, 'Step 5 영상 생성하기'), undefined);
  assert.ok(renderToStaticMarkup(card.tree).includes('27.7초'));
});

test('the single main video action owns creation while lyrics and account state control availability', () => {
  const buttons = [];
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(pageSource) === 'button'
      && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
        && attribute.name.getText(pageSource) === 'onClick' && ts.isJsxExpression(attribute.initializer)
        && attribute.initializer.expression?.getText(pageSource) === 'handleCreateVideo')) buttons.push(node);
    ts.forEachChild(node, visit);
  }
  visit(pageSource); assert.equal(buttons.length, 1, 'Use one shared creation action across categories');
  function render(overrides = {}) {
    const clicks = [], module = { exports: {} };
    const declarations = ['primaryVideoJob', 'primaryVideoError'].map(name => `const ${pageDeclaration(name).getText(pageSource)};`).join('\n');
    vm.runInNewContext(compile(`${declarations}\nmodule.exports = ${buttons[0].parent.getText(pageSource)};`, 'single-main-action.tsx'), {
      ...require('lucide-react'), module, exports: module.exports, require,
      studioBusy: false, isOptimizing: false, planningAccountReady: true, planIsCurrent: true,
      storyTrackId: null, petMatchingTrackId: null, singleVideoPhase: null, isGenerating: false, genProgress: 0,
      isGeneratingGrokVideo: false, genCategory: 'pet', storyVideoJob: null, grokVideoProgress: 0, grokVideoResult: null,
      storyClientState: { uncertain: false, error: null }, singleVideoError: '', grokVideoError: null, petVideoStateRef: { current: null }, hasPreparedCurrentAudio: false,
      handleCreateVideo() { clicks.push('create-video'); }, ...overrides,
    });
    return { tree: walk(module.exports, node => node.type === 'button')[0], container: module.exports, clicks };
  }
  const main = render(); assert.equal(label(main.tree), '영상 생성하기'); assert.equal(main.tree.props.disabled, false);
  main.tree.props.onClick(); assert.deepEqual(main.clicks, ['create-video']);
  for (const context of [{ studioBusy: true }, { isOptimizing: true }, { planningAccountReady: false }, { planIsCurrent: false }]) {
    assert.equal(render(context).tree.props.disabled, true);
  }
  const audio = render({ singleVideoPhase: 'audio', isGenerating: true, studioBusy: true, genProgress: 20 });
  assert.equal(label(audio.tree), '음원 준비 중… (20%)'); assert.equal(audio.tree.props['aria-busy'], true);
  const recovery = render({ planIsCurrent: false, petMatchingTrackId: 'saved-track', singleVideoError: 'Saved work needs checking' });
  assert.equal(recovery.tree.props.disabled, false); assert.equal(label(recovery.tree), '영상 연결 다시 확인');
  assert.equal(walk(recovery.container, node => node.props.role === 'alert').length, 1);
  assert.ok(label(recovery.container).includes('위의 영상 연결 다시 확인 버튼을 눌러 주세요.'));
  const prepared = render({ hasPreparedCurrentAudio: true });
  assert.ok(label(prepared.container).includes('준비된 음원으로 30초 영상을 만듭니다.'));
  assert.equal(label(prepared.container).includes('음원을 준비한 뒤'), false);
  const fresh = render();
  assert.ok(label(fresh.container).includes('가사에 맞는 음원을 준비한 뒤 30초 영상까지 이어서 만듭니다.'));
  const transport = render({ genCategory: 'history', grokVideoError: '연결 상태를 확인하지 못했습니다.', storyClientState: { uncertain: true } });
  assert.equal(label(transport.tree), '영상 연결 다시 확인');
  assert.equal(walk(transport.container, node => node.props.role === 'alert').length, 1);
  const saved = render({ genCategory: 'history', storyVideoJob: { status: 'held' } });
  assert.equal(label(saved.tree), '영상 제작 이어가기');
  assert.equal(walk(saved.container, node => node.props.role === 'status').length, 1);
  const completed = render({ grokVideoResult: 'https://example.invalid/completed.mp4' });
  assert.equal(label(completed.tree), '완성 영상 보기');
  assert.equal(label(completed.container).includes('생성 비용'), false);
  const video = render({ genCategory: 'history', singleVideoPhase: 'video', isGeneratingGrokVideo: true, studioBusy: true, grokVideoProgress: 42 });
  assert.equal(label(video.tree), '영상 제작 중… (42%)');
});

test('audio readiness badge accepts the actual 30-second container and preserves the pet minimum', () => {
  let badge;
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(pageSource) === 'span'
      && node.children.filter(child => ts.isJsxExpression(child)).length === 1
      && node.children.some(child => ts.isJsxExpression(child) && child.getText(pageSource).includes("'음원 준비 완료'"))) badge = node;
    ts.forEachChild(node, visit);
  }
  visit(pageSource); assert.ok(badge);
  function render(audioDuration, genCategory = 'history') {
    const module = { exports: {} };
    vm.runInNewContext(compile(`module.exports = ${badge.getText(pageSource)};`, 'audio-ready-badge.tsx'), {
      module, exports: module.exports, require, audioDuration, genCategory,
    });
    return module.exports;
  }
  for (const duration of [28.8, 30, 30.15]) {
    const tree = render(duration); assert.equal(label(tree), '음원 준비 완료'); assert.ok(tree.props.className.includes('text-emerald-300'));
  }
  const long = render(30.16); assert.equal(label(long), '30초보다 긴 음원 · 확인 필요'); assert.ok(long.props.className.includes('text-amber-200'));
  assert.equal(label(render(19.9, 'pet')), '20초보다 짧은 음원 · 확인 필요');
  assert.equal(label(render(20, 'pet')), '음원 준비 완료');
  assert.equal(label(render(28.8, 'pet')), '음원 준비 완료');
  assert.equal(label(render(30.15, 'pet')), '음원 준비 완료');
  assert.equal(label(render(30.16, 'pet')), '30초보다 긴 음원 · 확인 필요');
});

test('opening pet audio verifies ownership and ignores responses after account or draft changes', async () => {
  const track = { id: 'owned-track', user_id: 'owner-A', status: 'completed', audio_url: 'https://example.invalid/audio.mp3', petEpisode: fixture };
  const valid = petTrackLoadHarness({ reply: () => ({ ok: true, json: async () => ({ generation: track }) }) }); await valid.run(track.id);
  assert.equal(valid.calls.setPetEpisode[0].id, fixture.id); assert.equal(valid.calls.setGeneratedResult[0].audioUrl, track.audio_url);
  assert.ok(valid.requests.every(request => !request.options.method && !request.options.body));
  const foreign = petTrackLoadHarness({ reply: () => ({ ok: true, json: async () => ({ generation: { ...track, user_id: 'owner-B' } }) }) }); await foreign.run(track.id);
  assert.equal(foreign.calls.setPetEpisode, undefined);
  for (const staleMode of ['account', 'draft']) {
    let resolveReply;
    const stale = petTrackLoadHarness({ reply: () => new Promise(resolve => { resolveReply = resolve; }) });
    const loading = stale.run(track.id);
    if (staleMode === 'account') stale.bindings.petAccountRef.current = 'owner-B'; else stale.bindings.petPlanningRequest.current += 1;
    resolveReply({ ok: true, json: async () => ({ generation: track }) }); await loading;
    assert.equal(stale.calls.setPetEpisode, undefined); assert.equal(stale.calls.setGeneratedResult, undefined);
  }
});

test('saved episode readers accept metadata and license snapshots, reject malformed content', () => {
  assert.equal(contract.validatePetEpisode(fixture).length, 0);
  assert.equal(editor.readPetEpisode({ metadata: { petEpisode: fixture } }), fixture);
  assert.equal(editor.readPetEpisode({ license_hash: JSON.stringify({ petEpisode: fixture }) }).id, fixture.id);
  assert.equal(editor.readPetEpisode({ license_hash: '{broken' }), null);
  assert.equal(editor.readPetEpisode({ petEpisode: { ...fixture, shots: [] } }), null);
  assert.equal(editor.readPetEpisode({ license_hash: ' '.repeat(150_001) }), null);
});

test('actual track loader filter includes valid pet snapshots without keywords and preserves legacy criteria', () => {
  let loaderNode;
  function findLoader(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'loadGrokTracks') loaderNode = node;
    ts.forEachChild(node, findLoader);
  }
  findLoader(pageSource);
  assert.ok(loaderNode, 'The production track loader must exist');
  const predicates = [];
  function findPredicate(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'filter') {
      const predicate = node.arguments[0];
      if (predicate && ts.isArrowFunction(predicate) && ts.isBlock(predicate.body)) predicates.push(predicate);
    }
    ts.forEachChild(node, findPredicate);
  }
  findPredicate(loaderNode);
  assert.equal(predicates.length, 1, 'Use the loader API-list predicate, not the separate local cache filter');
  const module = { exports: {} };
  vm.runInNewContext(compile(`module.exports = (${predicates[0].getText(pageSource)});`, 'track-filter.ts'), {
    module, exports: module.exports, readPetEpisode: editor.readPetEpisode,
  });
  const tracks = [
    { id: 'pet', title: '키보드 하나 더 사면 끝인 줄', license_hash: JSON.stringify({ petEpisode: fixture }) },
    { id: 'invalid', title: '별다른 표시 없는 음원', license_hash: JSON.stringify({ petEpisode: { ...fixture, shots: [] } }) },
    { id: 'unrelated', title: '일반 음원' },
    { id: 'legacy-source', title: '기존 곡', source_menu: 'viral' },
    { id: 'legacy-flag', title: '기존 곡', is_viral: true },
    { id: 'legacy-title', title: '오늘의 챌린지' },
    { id: 'legacy-tags', title: '기존 곡', tags: ['Viral'] },
  ];
  assert.deepEqual(tracks.filter(module.exports).map(track => track.id), ['pet', 'legacy-source', 'legacy-flag', 'legacy-title', 'legacy-tags']);
});

test('editor renders six reviewed shots, read-only action summaries and editable actual prompts', () => {
  const tree = editor.PetEpisodeEditor({ episode: fixture, onChange() {} });
  assert.equal(walk(tree, node => node.type === 'article').length, 6);
  const fields = walk(tree, node => node.type === 'textarea');
  assert.equal(fields.filter(node => node.props.readOnly).length, 6);
  assert.equal(fields.filter(node => node.props.value === fixture.shots[0].videoPrompt && !node.props.disabled).length, 6);
  const html = renderToStaticMarkup(React.createElement(editor.PetEpisodeEditor, { episode: fixture, onChange() {} }));
  assert.ok(html.includes('총 30초'));
});

test('instrumental Pet editor identifies music mode and retains all six narrative captions', () => {
  const episode = { ...fixture, audioMode: 'instrumental', lyrics: '' };
  const tree = editor.PetEpisodeEditor({ episode, onChange() {} });
  assert.match(label(tree), /인스트루멘탈 · 보컬·가사 없음/);
  assert.equal(walk(tree, node => node.type === 'article').length, 6);
  assert.doesNotMatch(label(tree), /보컬 콘티에는 가사가 필요/);
});

test('instrumental Step 4 shows an explicit music status instead of an empty lyrics editor', () => {
  let expression;
  function visit(node) {
    if (ts.isConditionalExpression(node) && node.condition.getText(pageSource) === 'petInstrumentalMode'
      && ts.isJsxElement(node.whenTrue) && node.whenFalse.getText(pageSource).startsWith('<textarea')) expression = node;
    ts.forEachChild(node, visit);
  }
  visit(pageSource); assert.ok(expression, 'Exercise the actual instrumental/editor branch');
  const module = { exports: {} };
  vm.runInNewContext(compile(`module.exports = (${expression.getText(pageSource)});`, 'instrumental-status.tsx'), {
    module, exports: module.exports, require, petInstrumentalMode: true,
  });
  assert.match(label(module.exports), /인스트루멘탈 음악으로 제작합니다/);
  assert.equal(walk(module.exports, node => node.type === 'textarea').length, 0);
});

test('v4 story review is read-only, shares one candidate list and separates production details', () => {
  const episode = v4Fixture();
  const candidateTitle = '슬리퍼 한 짝 후보';
  episode.candidates = [{ ...episode.fingerprint, title: candidateTitle, premise: '강아지가 슬리퍼를 배달한다.', relatableMoment: '집사의 심부름 기대', behavioralContradiction: '강아지가 집사를 훈련한다.', storyBeats: { setup: '슬리퍼 발견', escalation: '복도를 달림', reversal: '집사가 기다림', punchline: '훈련받은 건 집사' }, review: { reason: '행동이 선명하다.', risk: '결말 표정 확인' } }];
  episode.editorialReview = { provenance: 'ai_hypothesis', scoreMeaning: 'model_estimate', selectedCandidateIndex: 0, selectedReason: '행동과 결말이 이어진다.', evidenceNote: '실제 반응은 게시 후 확인한다.' };
  assert.equal(contract.validatePetEpisode(episode).length, 0);
  let changes = 0; const tree = editor.PetEpisodeEditor({ episode, onChange() { changes++; } });
  const html = renderToStaticMarkup(tree);
  assert.ok(label(tree).includes('15초 + 15초')); assert.ok(html.includes(episode.title));
  assert.equal(html.split(candidateTitle).length - 1, 1, 'The shared story review renders each candidate once');
  assert.ok(html.includes('공감 순간: 집사의 심부름 기대'));
  assert.ok(label(tree).includes('연출 설계 보기'));
  assert.equal(label(tree).includes('소재 후보와 연출 설계 보기'), false);
  for (const shot of episode.shots) assert.ok(label(tree).includes(shot.caption));
  assert.equal(walk(tree, node => ['input', 'textarea', 'select', 'button'].includes(node.type)).length, 0);
  assert.equal(changes, 0);
});

test('one explicit v4 start creates and advances two clips without an approval request', async () => {
  const episode = v4Fixture();
  const harness = studioHarness(null, { props: { episode, trackId: 'matching-v4-track' }, reply(_request, count) {
    return count === 1 ? v4Job('generating') : v4Job('completed', { progress: 100, videoUrl: 'https://example.invalid/final-v4.mp4', durationSeconds: 30 });
  } });
  const start = findButton(harness.render(), '30초 영상 만들기'); assert.equal(start.props.disabled, false);
  start.props.onClick(); await settle(() => harness.completed.length === 1);
  assert.deepEqual(harness.requests.map(request => request.body.action), ['create', 'advance']);
  assert.equal(harness.requests.some(request => request.body.action === 'approve'), false);
  assert.equal(harness.requests[0].body.episode.production.clips.length, 2);
  assert.equal(harness.requests[0].body.episode.production.clips.every(clip => clip.durationSeconds === 15), true);
  assert.ok(harness.storageWrites.every(entry => entry.key === `melodio:pet-video:v4:owner-A:${episode.id}`));
});

test('v4 render and completed restore never start work or autoplay media', async () => {
  const episode = v4Fixture();
  const idle = studioHarness(null, { props: { episode, trackId: 'matching-v4-track' } }); idle.render(); idle.flushEffects();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(idle.requests.length, 0);
  const complete = studioHarness(v4Job('completed', { videoUrl: 'https://example.invalid/final-v4.mp4', durationSeconds: 30 }), { props: { episode, trackId: 'matching-v4-track' } });
  const tree = complete.render(); const videos = walk(tree, node => node.type === 'video');
  assert.equal(videos.length, 1); assert.equal(videos[0].props.controls, true); assert.notEqual(videos[0].props.autoPlay, true);
  assert.equal(findButton(tree, '영상 생성 승인'), undefined);
  assert.ok(label(tree).includes('30초 영상 만들기'));
});

test('external start waits for restoration and consumes one matching request only once', async () => {
  const episode = v4Fixture(), states = [], settled = [];
  const startRequest = { id: 'one-click', ownerId: 'owner-A', episodeId: episode.id, trackId: 'matching-v4-track' };
  const harness = studioHarness(null, { props: { episode, trackId: startRequest.trackId, compact: true, externalControl: true,
    startRequest, onStateChange: state => states.push(state), onRequestSettled: id => settled.push(id) },
    reply(_request, count) { return count === 1 ? v4Job('generating') : v4Job('completed', { progress: 100, videoUrl: 'https://example.invalid/final-v4.mp4' }); },
  });
  assert.equal(findButton(harness.render(), 'Step 5 영상 생성하기'), undefined);
  harness.flushEffects();
  assert.equal(harness.requests.length, 0, 'Restoration must commit before the explicit request can start');
  assert.equal(states.at(-1).loading, true);
  harness.render(); harness.flushEffects();
  harness.render({ startRequest: { ...startRequest } }); harness.flushEffects();
  await settle(() => settled.length === 1);
  harness.render({ onStateChange: state => states.push(state) }); harness.flushEffects();
  const before = states.length;
  harness.render({ onStateChange: state => states.push(state) }); harness.flushEffects();
  assert.equal(states.length, before, 'Changing only parent callbacks must not publish duplicate state');
  assert.deepEqual(settled, ['one-click']);
  assert.deepEqual(harness.requests.map(request => request.body.action), ['create', 'advance']);
  assert.equal(harness.completed.length, 1);
  assert.equal(states.at(-1).canStart, false);
});

test('external requests reject foreign or stale owner, episode and track scopes without POST', () => {
  const episode = v4Fixture(), settled = [];
  const harness = studioHarness(null, { props: { episode, trackId: 'matching-v4-track', externalControl: true, onRequestSettled: id => settled.push(id) } });
  harness.render(); harness.flushEffects(); harness.render(); harness.flushEffects();
  for (const [index, mismatch] of [{ ownerId: 'owner-B' }, { episodeId: 'stale-episode' }, { trackId: 'stale-track' }].entries()) {
    harness.render({ startRequest: { id: `stale-${index}`, ownerId: 'owner-A', episodeId: episode.id, trackId: 'matching-v4-track', ...mismatch } });
    harness.flushEffects();
  }
  assert.deepEqual(settled, ['stale-0', 'stale-1', 'stale-2']);
  assert.equal(harness.requests.length, 0);
});

test('pending external start waits for saved job GET and never recreates a completed job', async () => {
  const episode = v4Fixture(), settled = []; let resolveRestore;
  const harness = studioHarness(null, { savedJobId: 'fixture-v4-job', props: { episode, trackId: 'matching-v4-track', externalControl: true,
    startRequest: { id: 'restore-click', ownerId: 'owner-A', episodeId: episode.id, trackId: 'matching-v4-track' }, onRequestSettled: id => settled.push(id) },
    reply() { return new Promise(resolve => { resolveRestore = resolve; }); },
  });
  harness.render(); harness.flushEffects(); harness.render(); harness.flushEffects();
  assert.equal(harness.requests.length, 1); assert.equal(harness.requests[0].body, null);
  assert.equal(settled.length, 0);
  resolveRestore(v4Job('completed', { videoUrl: 'https://example.invalid/saved.mp4' }));
  await settle(() => harness.states[0]?.status === 'completed' && harness.states[2] === false);
  harness.render(); harness.flushEffects();
  assert.deepEqual(settled, ['restore-click']); assert.equal(harness.requests.length, 1);
});

test('pending external start continues a restored active job without a new create', async () => {
  const episode = v4Fixture(), settled = []; let resolveRestore;
  const harness = studioHarness(null, { savedJobId: 'fixture-v4-job', props: { episode, trackId: 'matching-v4-track', externalControl: true,
    startRequest: { id: 'active-click', ownerId: 'owner-A', episodeId: episode.id, trackId: 'matching-v4-track' }, onRequestSettled: id => settled.push(id) },
    reply(request) { return request.body ? v4Job('completed', { videoUrl: 'https://example.invalid/continued.mp4' }) : new Promise(resolve => { resolveRestore = resolve; }); },
  });
  harness.render(); harness.flushEffects(); harness.render(); harness.flushEffects();
  assert.equal(harness.requests.length, 1); assert.equal(harness.requests[0].body, null);
  resolveRestore(v4Job('generating')); await settle(() => harness.states[0]?.status === 'generating' && harness.states[2] === false);
  harness.render(); harness.flushEffects(); await settle(() => settled.length === 1);
  assert.deepEqual(harness.requests.map(request => request.body?.action ?? 'get'), ['get', 'advance']);
  assert.equal(harness.completed.length, 1);
});

test('external resume requires an explicit new token and server-safe recovery', async () => {
  const episode = v4Fixture();
  for (const [status, canResume] of [['held', false], ['failed', false], ['held', true], ['review', false]]) {
    const saved = v4Job(status, { canResume }), settled = [], states = [];
    const harness = studioHarness(null, { savedJobId: saved.id, props: { episode, trackId: 'matching-v4-track', compact: true, externalControl: true,
      onStateChange: state => states.push(state), onRequestSettled: id => settled.push(id) },
      reply(request) { return request.body ? v4Job('completed', { videoUrl: 'https://example.invalid/resumed.mp4' }) : saved; },
    });
    harness.render(); harness.flushEffects(); await settle(() => harness.states[0]?.status === status && harness.states[2] === false);
    const tree = harness.render(); harness.flushEffects();
    assert.equal(harness.requests.length, 1, 'Mount may only read durable state');
    assert.equal(states.at(-1).canStart, canResume);
    assert.equal(findButton(tree, '저장된 결과로 제작 이어가기'), undefined);
    assert.equal(findButton(tree, '상태 다시 확인')?.type, 'button');
    harness.render({ startRequest: { id: `${status}-${canResume}`, ownerId: 'owner-A', episodeId: episode.id, trackId: 'matching-v4-track' } }); harness.flushEffects();
    await settle(() => settled.length === 1);
    assert.deepEqual(harness.requests.map(request => request.body?.action ?? 'get'), canResume ? ['get', 'resume'] : ['get']);
  }
  const legacy = studioHarness(job('review'), { props: { externalControl: true } });
  assert.ok(findButton(legacy.render(), '6장면 확인 완료 · 영상 생성 승인'), 'Legacy six-clip approval remains explicit');
});

test('failed saved-job restore blocks external create and offers a read-only status retry', async () => {
  const episode = v4Fixture(), settled = [], states = []; let reads = 0;
  const harness = studioHarness(null, { savedJobId: 'fixture-v4-job', props: { episode, trackId: 'matching-v4-track', externalControl: true,
    onStateChange: state => states.push(state), onRequestSettled: id => settled.push(id) },
    reply() { if (++reads === 1) throw new Error('Offline restore failure'); return v4Job('held', { canResume: false }); },
  });
  harness.render(); harness.flushEffects(); await settle(() => harness.states[2] === false && harness.states[3] !== '');
  const tree = harness.render(); harness.flushEffects();
  assert.equal(states.at(-1).canStart, false);
  harness.render({ startRequest: { id: 'blocked-create', ownerId: 'owner-A', episodeId: episode.id, trackId: 'matching-v4-track' } }); harness.flushEffects();
  assert.deepEqual(settled, ['blocked-create']); assert.equal(harness.requests.length, 1);
  findButton(tree, '상태 다시 확인').props.onClick(); harness.render(); harness.flushEffects();
  await settle(() => harness.states[0]?.status === 'held');
  assert.ok(harness.requests.every(request => request.body === null));
});

test('uncertain external response is not retried by parent rerenders or the same token', async () => {
  const episode = v4Fixture(), settled = [];
  const startRequest = { id: 'uncertain-click', ownerId: 'owner-A', episodeId: episode.id, trackId: 'matching-v4-track' };
  const harness = studioHarness(null, { props: { episode, trackId: startRequest.trackId, externalControl: true, startRequest, onRequestSettled: id => settled.push(id) },
    reply() { throw new Error('Submission response unavailable'); },
  });
  harness.render(); harness.flushEffects(); harness.render(); harness.flushEffects();
  await settle(() => settled.length === 1);
  for (let i = 0; i < 3; i++) { harness.render({ startRequest: { ...startRequest } }); harness.flushEffects(); }
  assert.equal(harness.requests.length, 1); assert.equal(harness.requests[0].body.action, 'create');
  assert.equal(harness.states[1], false);
});

test('owner change and unmount cancel in-flight external progression and stale callbacks', async () => {
  const episode = v4Fixture();
  for (const change of ['owner', 'unmount']) {
    const settled = []; let resolveCreate;
    const harness = studioHarness(null, { props: { episode, trackId: 'matching-v4-track', externalControl: true,
      startRequest: { id: 'cancel-click', ownerId: 'owner-A', episodeId: episode.id, trackId: 'matching-v4-track' }, onRequestSettled: id => settled.push(id) },
      reply() { return new Promise(resolve => { resolveCreate = resolve; }); },
    });
    harness.render(); harness.flushEffects(); harness.render(); harness.flushEffects();
    assert.equal(harness.requests.length, 1);
    if (change === 'owner') { harness.render({ userId: 'owner-B', startRequest: null }); harness.flushEffects(); }
    else harness.unmount();
    resolveCreate(v4Job('generating')); await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.requests.length, 1); assert.equal(harness.storageWrites.length, 0); assert.equal(harness.completed.length, 0); assert.equal(settled.length, 0);
  }
});

test('new v3 work uses the 30-second CTA while saved six-image jobs retain explicit approval', () => {
  const initial = studioHarness(null); assert.ok(findButton(initial.render(), '30초 영상 만들기'));
  const review = studioHarness(job('review')); const tree = review.render();
  assert.equal(walk(tree, node => node.type === 'textarea').length, 6);
  assert.ok(findButton(tree, '6장면 확인 완료 · 영상 생성 승인'));
  assert.equal(findButton(tree, '30초 영상 만들기'), undefined);
});

test('a v3 draft restores a server two-clip job with two cards and no duplicate requests', async () => {
  const restored = job('completed', { productionMode: 'two-clips', videoUrl: 'https://example.invalid/restored-two-clips.mp4', durationSeconds: 30,
    shots: ['C1', 'C2'].map(id => ({ id, status: 'completed', keyframeUrl: `https://example.invalid/${id}.png` })) });
  const harness = studioHarness(null, { savedJobId: restored.id, reply: () => restored });
  harness.render(); harness.flushEffects();
  await settle(() => harness.states[0]?.status === 'completed' && harness.states[2] === false);
  const tree = harness.render(); harness.flushEffects();
  harness.render(); harness.flushEffects();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(walk(tree, node => node.type === 'img').length, 2);
  assert.deepEqual(walk(tree, node => node.type === 'img').map(node => node.props.alt.split(' ')[0]), ['C1', 'C2']);
  assert.equal(walk(tree, node => node.type === 'video').length, 1);
  assert.equal(findButton(tree, '영상 생성 승인'), undefined);
  assert.equal(findButton(tree, '30초 영상 만들기'), undefined);
  assert.ok(label(tree).includes('15초 영상 두 편'));
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].body, null);
  assert.ok(harness.requests[0].url.endsWith(`?jobId=${restored.id}`));
  assert.equal(harness.completed.length, 1);
  assert.equal(harness.storageWrites.length, 0);
  assert.equal(harness.storageReads[0], `melodio:pet-video:v3:owner-A:${fixture.id}`);
});

test('server render never fetches or starts work and missing matching audio disables create', () => {
  let requests = 0;
  const component = load(componentFile, { fetch() { requests++; throw new Error('Unexpected fetch'); } }).default;
  const html = renderToStaticMarkup(React.createElement(component, { userId: 'owner-A', episode: fixture, trackId: null, onBusyChange() {}, onLockedChange() {}, onCompleted() {} }));
  assert.equal(requests, 0);
  assert.ok(html.includes('30초 영상 만들기'));
  const harness = studioHarness(null, { props: { trackId: null } });
  assert.equal(findButton(harness.render(), '30초 영상 만들기').props.disabled, true);
});

test('mount with no saved job performs no API calls', async () => {
  const harness = studioHarness(); harness.render(); harness.effects.forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.storageReads[0], `melodio:pet-video:v3:owner-A:${fixture.id}`);
});

test('reload reads a saved review job without advancing or approving it', async () => {
  const harness = studioHarness(job('review'), { savedJobId: 'fixture-job' });
  harness.render(); harness.effects.forEach(effect => effect());
  await settle(() => harness.states[0]?.status === 'review');
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].body, null);
  assert.ok(harness.requests[0].url.endsWith('?jobId=fixture-job'));
});

test('review approval requires six usable keyframe URLs', () => {
  const missing = studioHarness(job('review', { shots: job('review').shots.slice(0, 5) }));
  assert.equal(findButton(missing.render(), '영상 생성 승인').props.disabled, true);
  const complete = studioHarness(job('review'));
  assert.equal(findButton(complete.render(), '영상 생성 승인').props.disabled, false);
});

test('held recovery is offered only when the server allows it', () => {
  assert.equal(findButton(studioHarness(job('held')).render(), '다시 합성/보관'), undefined);
  assert.equal(findButton(studioHarness(job('held', { canResume: false })).render(), '다시 합성/보관'), undefined);
  assert.equal(findButton(studioHarness(job('held', { canResume: true })).render(), '다시 합성/보관').props.disabled, false);
});

for (const action of ['approve', 'resume']) {
  test(`explicit ${action} advances serially to completion with no duplicate submission`, async () => {
    const harness = studioHarness(job(action === 'approve' ? 'review' : 'held', { canResume: action === 'resume' }), {
      reply(request, count) { return count === 1 ? job('generating') : job('completed', { progress: 100, durationSeconds: 30, videoUrl: 'https://example.invalid/final.mp4' }); },
    });
    const button = findButton(harness.render(), action === 'approve' ? '영상 생성 승인' : '다시 합성/보관');
    button.props.onClick(); button.props.onClick();
    await settle(() => harness.completed.length === 1);
    assert.deepEqual(harness.requests.map(request => request.body.action), [action, 'advance']);
    if (action === 'approve') assert.deepEqual(harness.requests[0].body.motionPrompts, fixture.shots.map(shot => shot.videoPrompt));
    else assert.equal(harness.requests[0].body.motionPrompts, undefined);
    assert.ok(harness.delays.every(delay => delay >= 5000));
    assert.ok(harness.storageWrites.every(entry => entry.key === `melodio:pet-video:v3:owner-A:${fixture.id}` && entry.value === 'fixture-job'));
  });
}

test('explicit create passes the reviewed snapshot and stops at image review', async () => {
  const harness = studioHarness(null, { reply(request, count) { return job(count === 1 ? 'keyframes' : 'review'); } });
  findButton(harness.render(), '30초 영상 만들기').props.onClick();
  await settle(() => harness.states[0]?.status === 'review');
  assert.deepEqual(harness.requests.map(request => request.body.action), ['create', 'advance']);
  assert.equal(harness.requests[0].body.episode.lyrics, fixture.lyrics);
  assert.equal(harness.requests[0].body.trackId, 'matching-track');
});

test('motion review uses server prompts with episode fallbacks and edits only before approval', () => {
  const reviewed = job('review'); reviewed.shots[0].motionPrompt = 'Server proposed head turn';
  const harness = studioHarness(reviewed);
  const fields = walk(harness.render(), node => node.type === 'textarea');
  assert.equal(fields.length, 6);
  assert.equal(fields[0].props.value, 'Server proposed head turn');
  assert.equal(fields[1].props.value, fixture.shots[1].videoPrompt);
  assert.ok(fields.every(field => field.props.readOnly === false));
  fields[0].props.onChange({ target: { value: '' } });
  assert.equal(findButton(harness.render(), '영상 생성 승인').props.disabled, true);
  for (const status of ['keyframes', 'generating', 'assembling', 'completed', 'held']) {
    const readonlyFields = walk(studioHarness(job(status)).render(), node => node.type === 'textarea');
    assert.ok(readonlyFields.every(field => field.props.readOnly === true), status);
  }
});

test('approval freezes the six reviewed motion texts without changing the episode', async () => {
  const originalEpisode = JSON.stringify(fixture);
  let approved;
  const harness = studioHarness(job('review'), {
    reply(request) {
      if (request.body.action === 'approve') approved = request.body.motionPrompts;
      return job(request.body.action === 'approve' ? 'generating' : 'completed', {
        shots: job('review').shots.map((shot, i) => ({ ...shot, motionPrompt: approved[i] })),
        videoUrl: 'https://example.invalid/final.mp4', durationSeconds: 30,
      });
    },
  });
  const replacement = '  Cat slowly turns its head toward the wrist.  ';
  walk(harness.render(), node => node.type === 'textarea')[2].props.onChange({ target: { value: replacement } });
  findButton(harness.render(), '영상 생성 승인').props.onClick();
  assert.ok(walk(harness.render(), node => node.type === 'textarea').every(field => field.props.readOnly));
  await settle(() => harness.completed.length === 1);
  assert.equal(approved.length, 6); assert.equal(approved[2], replacement.trim());
  assert.deepEqual(approved.filter((_, i) => i !== 2), fixture.shots.filter((_, i) => i !== 2).map(shot => shot.videoPrompt));
  const savedFields = walk(harness.render(), node => node.type === 'textarea');
  assert.equal(savedFields[2].props.value, replacement.trim());
  assert.ok(savedFields.every(field => field.props.readOnly));
  assert.equal(JSON.stringify(fixture), originalEpisode);
  assert.deepEqual(harness.requests.map(request => request.body.action), ['approve', 'advance']);
});

test('refreshing a review job preserves motion edits; another job or account resets them', async () => {
  let currentJob = job('review');
  const harness = studioHarness(null, { savedJobId: 'fixture-job', reply() { return currentJob; } });
  harness.render(); harness.flushEffects(); await settle(() => harness.states[0]?.status === 'review');
  harness.render(); harness.flushEffects();
  walk(harness.render(), node => node.type === 'textarea')[0].props.onChange({ target: { value: 'User-reviewed small head movement' } });
  currentJob = job('review', { shots: job('review').shots.map(shot => ({ ...shot, motionPrompt: 'Server refreshed original' })) });
  findButton(harness.render(), '상태 다시 확인').props.onClick();
  await settle(() => harness.requests.length === 2 && harness.states[2] === false);
  assert.equal(walk(harness.render(), node => node.type === 'textarea')[0].props.value, 'User-reviewed small head movement');
  currentJob = job('review', { id: 'another-job' });
  findButton(harness.render(), '상태 다시 확인').props.onClick();
  await settle(() => harness.states[0]?.id === 'another-job');
  harness.render(); harness.flushEffects();
  assert.equal(walk(harness.render(), node => node.type === 'textarea')[0].props.value, fixture.shots[0].videoPrompt);
  walk(harness.render(), node => node.type === 'textarea')[0].props.onChange({ target: { value: 'Second job local draft' } });
  harness.render({ userId: 'owner-B' }); harness.flushEffects();
  await settle(() => harness.states[0]?.id === 'another-job' && harness.states[2] === false);
  harness.render(); harness.flushEffects();
  assert.equal(walk(harness.render(), node => node.type === 'textarea')[0].props.value, fixture.shots[0].videoPrompt);
  assert.ok(harness.storageReads.includes(`melodio:pet-video:v3:owner-B:${fixture.id}`));
  assert.ok(harness.requests.every(request => request.body === null), 'Only state reads were performed');
});

test('Step 3 keeps one input path and clear one-icon actions', () => {
  const source = fs.readFileSync(pageFile, 'utf8');
  assert.doesNotMatch(source, /검토한 콘티 불러오기|저장한 콘티 불러오기|handleImportPetEpisode/);
  assert.doesNotMatch(source, /draft\.topic/, 'A restored episode keeps its canonical sourceTopic');
  assert.match(source, /onChange=\{\(e\) => handleSituationChange\(e\.target\.value\)\}/);
  assert.match(source, /const planIsCurrent =/);
  assert.match(source, /const step3Done = planIsCurrent/);
  assert.match(source, /const generationCategory = genCategory/);
  assert.match(source, /petCategoryRef\.current === generationCategory/);
  assert.doesNotMatch(source, /const isCurrentPetGeneration =/);
  assert.match(source, /singleVideoGateRef\.current\?\.cancel\(\); audioGenerationRef\.current\?\.\(\);/);
  assert.match(source, /setIsGenerating\(false\); setGenProgress\(0\);/);
  assert.match(source, /onChange=\{\(e\) => handleLyricsChange\(e\.target\.value\)\}/);
  assert.match(source, /onChange=\{\(e\) => handleOptimizedPromptChange\(e\.target\.value\)\}/);
  assert.match(source, /다시 기획하기/);
  assert.match(source, /AI 기획하기/);
  assert.doesNotMatch(source, /✅ AI 기획 완료 \(재기획은 클릭\)|▶ AI 기획 시작/);
});

test('a legacy non-pet brief cannot claim it used typed situation text without an exact source echo', () => {
  const source = fs.readFileSync(pageFile, 'utf8');
  assert.match(source, /const hasPlanningTopic = planningTopic\.trim\(\)\.length > 0/);
  assert.match(source, /hasPlanningTopic && returnedSourceTopic !== planningTopic/);
  assert.match(source, /if \(!hasPlanningTopic\) setCustomTopic\(sourceTopic\)/);
  assert.match(source, /입력 상황을 가사에 반영하는 맞춤 기획 연결이 준비되지 않았습니다/);
  assert.doesNotMatch(source, /: planningTopic \|\| `\[컨셉\]/);
});

test('saved non-pet audio restores its own source brief for video planning', () => {
  const source = fs.readFileSync(pageFile, 'utf8');
  assert.match(source, /const savedBrief = readViralBrief\(track\)/);
  assert.match(source, /const sourceTopic = savedBrief\?\.sourceTopic \|\| rawTitle/);
  assert.match(source, /topic: sourceTopic/);
  assert.doesNotMatch(source, /topic: customTopic \|\| rawTitle/);
});

test('generation validates the saved brief against canonical structured lyrics', () => {
  const source = fs.readFileSync(generateRouteFile, 'utf8');
  const canonicalizedAt = source.indexOf('payload.lyricsPrompt = canonicalLyricsPrompt');
  const briefComparedAt = source.indexOf("if (viralBrief && (rawBody.sourceMenu !== 'viral'");
  assert.ok(canonicalizedAt >= 0 && briefComparedAt > canonicalizedAt);
});

test('pet pilot advisory concerns are displayed as suggestions without a blocked-work banner',()=>{
  const view=job('generating',{productionMode:'two-clips',shots:[{id:'C1',status:'video_ready',videoUrl:'https://example.invalid/c1.mp4',quality:{video:{status:'advisory',analysisStatus:'complete',issues:['스토리 핵심: 고양이의 행동과 집사의 반응을 이어 주세요.']}}},{id:'C2',status:'image_empty'}]});
  const harness=studioHarness(view);const html=renderToStaticMarkup(harness.render());
  assert.match(html,/콘텐츠 핵심 분석 · 참고 의견/);assert.match(html,/전체 움직임이나 재미를 검증한 결과는 아닙니다/);
  assert.match(html,/고양이의 행동과 집사의 반응/);assert.doesNotMatch(html,/작업이 멈췄습니다/);assert.deepEqual(harness.requests,[]);
});
test('completed pet preview exposes one explicit free confirmation and binds the render URL', async () => {
  const view = job('completed', { videoUrl: 'https://example.invalid/final.mp4', contentReview: { status: 'preview_required', analyzedClips: 2, totalClips: 2, concerns: ['C2 · 반응을 확인하세요.'] } });
  let resolve;
  const harness = studioHarness(view, { reply: () => new Promise(r => { resolve = r; }) });
  const tree = harness.render(), html = renderToStaticMarkup(tree), button = findButton(tree, '영상 확인 완료');
  assert.match(html, /영상 제작 완료 · 내용 확인 필요/); assert.match(html, /반응을 확인하세요/);
  button.props.onClick(); button.props.onClick();
  assert.equal(harness.requests.length, 1);
  assert.deepEqual(harness.requests[0].body, { action: 'confirm', jobId: view.id, videoUrl: view.videoUrl });
  resolve({ ...view, contentReview: { ...view.contentReview, status: 'owner_confirmed', approvedAt: '2026-10-11T10:00:00.000Z' } });
  await settle(() => harness.states[2] === false);
  assert.equal(findButton(harness.render(), '영상 확인 완료'), undefined);
  assert.match(renderToStaticMarkup(harness.render()), /직접 확인 완료/);
  assert.ok(harness.requests.every(request => request.body.action === 'confirm'));
});
test('known opening hold shows a manual saved-image continuation and labels old detail findings as history',()=>{
  const view=job('held',{productionMode:'two-clips',canResume:true,shots:[{id:'C1',status:'image_ready',keyframeUrl:'https://example.invalid/saved.jpg',error:'필기구가 안 보입니다.',quality:{image:{status:'review'}}},{id:'C2',status:'image_empty'}]});
  const harness=studioHarness(view);const tree=harness.render();const html=renderToStaticMarkup(tree);
  assert.equal(findButton(tree,'저장된 이미지로 영상 제작 이어가기').props.disabled,false);
  assert.match(html,/이전 검수 기록/);assert.match(html,/이전 세부 검수로 중단된 작업/);assert.deepEqual(harness.requests,[]);
});
