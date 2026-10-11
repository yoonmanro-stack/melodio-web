/* eslint-disable @typescript-eslint/no-require-imports */
/* Offline checks execute the actual production page handlers and payloads. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/app/(app)/viral/page.tsx');
const page = ts.createSourceFile(pagePath, fs.readFileSync(pagePath, 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
function find(predicate) {
  let found;
  function visit(node) { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); }
  visit(page); assert.ok(found, 'Actual production handler exists'); return found;
}
function variable(name) { return find(node => ts.isVariableDeclaration(node) && node.name.getText(page) === name).initializer; }
function runNode(node, bindings = {}) {
  const expression = node.getText(page);
  const code = ts.transpileModule(`const result = (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(bindings), `${code}\nreturn result;`)(...Object.values(bindings));
}
const creativeModule = { exports: {} };
const creativeCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/vle/categoryCreativePlan.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const actionModule = { exports: {} };
const actionCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/vle/categoryObservableAction.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('module', 'exports', actionCode)(actionModule, actionModule.exports);
new Function('require', 'module', 'exports', creativeCode)(name => { assert.equal(name, './categoryObservableAction'); return actionModule.exports; }, creativeModule, creativeModule.exports);
const extras = creativeModule.exports.readCategoryBriefExtras;
const genreMap = runNode(variable('VIRAL_GENRE_PROMPT_MAP'));
const topic = '  야근 중인 디자이너가 젖은 운동화를 벗고 실내화를 신는다.\n실내 복도에서 동료와 마주친다.  ';
function brief(instrumental = false) {
  return { sourceTopic: topic, categoryId: 'human', title: '퇴근 전 한 걸음', hook: '젖은 신발을 벗는다',
    lyrics: '[Chorus]\n퇴근 전 한 걸음', stylePrompt: instrumental ? 'original instrumental groove, no vocals' : 'original playful soul, clear Korean vocals',
    isInstrumental: instrumental, lyricsPurpose: instrumental ? 'story-guide' : 'sung' };
}
function freshPlan(instrumental) {
  return { opening2s: { startSeconds: 0, endSeconds: 2, action: '성인 디자이너가 젖은 운동화를 벗고 실내화를 신는다.' },
    watchReason: '퇴근 준비를 마친 디자이너가 바로 나갈 수 있을까?', development: ['디자이너가 가방을 메고 복도 문을 연다.'],
    payoff: '동료가 수건을 건네자 디자이너가 웃으며 운동화를 감싼다.',
    roles: [{ id: 'R1', role: '야근을 마친 디자이너', appearance: '짧은 검은 머리의 성인 여성', count: 1, visibility: 'on_screen' },
      { id: 'R2', role: '복도에서 만난 동료', appearance: '짧은 갈색 머리의 성인 남성', count: 1, visibility: 'off_screen' }],
    sceneContext: { place: '늦은 밤 사무실 복도', ongoingActivity: '퇴근하려고 가방과 신발을 챙기고 있다.', immediateTrigger: '젖은 운동화에서 물방울이 떨어진다.', settingEvidence: '공용 복도 양쪽으로 업무 공간의 문이 이어진다.' },
    wardrobes: [{ roleId: 'R1', clothing: '회색 셔츠와 검은 바지', footwear: '젖은 운동화를 벗고 파란 실내화를 신는다.' },
      { roleId: 'R2', clothing: '갈색 재킷과 청바지', footwear: '갈색 운동화' }],
    music: { genreEn: 'playful soul', vocalEn: instrumental ? 'Instrumental, No Vocals' : 'clear Korean vocal', moodEn: 'playful', styleEn: 'dry bass and light handclaps',
      rationale: '지친 퇴근 준비에 가벼운 리듬을 더해 작은 도움의 웃음을 살린다.', targetBpm: 104, isInstrumental: instrumental } };
}
function planningHarness(overrides = {}) {
  const requests = [], changes = {};
  const account = { userId: 'owner' };
  const bindings = { genCategory: 'human', customTopic: topic, selectedGenre: '', selectedMood: '', selectedVocal: '',
    planningAccount: account, planningAccountRef: { current: account }, planningAccountReady: true, petUserId: 'owner',
    isOptimizing: false, isGenerating: false, isGeneratingGrokVideo: false,
    petPlanningRequest: { current: 0 }, petCategoryRef: { current: 'human' }, VIRAL_GENRE_PROMPT_MAP: genreMap,
    async fetch(url, options) { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ success: true, brief: overrides.reply || brief() }) }; },
    async handlePlanPetEpisode() { changes.petDelegated = true; }, ...overrides };
  for (const name of ['setIsOptimizing', 'setPetPlanError', 'setCustomTopic', 'setProducerBrief', 'setCustomLyrics', 'setOptimizedPrompt', 'setStyleWarnings',
    'setGeneratedResult', 'setSelectedGrokTrackId', 'setGrokVideoPrompt', 'setGrokVideoResult', 'setGrokVideoClips', 'setGrokVideoDuration']) bindings[name] = value => { (changes[name] ||= []).push(value); };
  return { requests, changes, run: runNode(variable('handleOptimizePrompt'), bindings) };
}

test('fresh music controls are automatic and category changes preserve user choices', () => {
  for (const name of ['selectedGenre', 'selectedMood', 'selectedVocal']) {
    const state = find(node => ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
      && node.name.elements.some(element => element.name?.getText(page) === name));
    assert.equal(runNode(state.initializer, { useState: value => [value] })[0], '');
  }
  const call = find(node => ts.isCallExpression(node) && node.expression.getText(page) === 'useEffect'
    && node.arguments[1]?.getText(page) === '[genCategory]' && node.arguments[0]?.getText(page).includes('setStyleWarnings'));
  const writes = [];
  runNode(call.arguments[0], { setStyleWarnings: value => writes.push(value) })();
  assert.deepEqual(writes, [[]], 'Category change has no music setter dependency');
});

test('AI music action clears overrides for the next coherent plan without choosing a matrix or making a request', () => {
  for (const selected of ['', 'User choice']) {
    const changes = [], invalidations = [];
    runNode(variable('handleAutoTuneShortsSound'), { isOptimizing: false, isGenerating: false, isGeneratingGrokVideo: false,
      selectedGenre: selected, selectedMood: selected, selectedVocal: selected,
      setSelectedGenre: value => changes.push(['genre', value]), setSelectedMood: value => changes.push(['mood', value]), setSelectedVocal: value => changes.push(['vocal', value]),
      invalidatePlanningOutput: () => invalidations.push(true), setStyleWarnings() {}, setAutoTuneFlash() {}, setTimeout() {},
      fetch() { throw Error('UNEXPECTED_NETWORK'); },
    })();
    assert.deepEqual(changes, [['genre', ''], ['mood', ''], ['vocal', '']]);
    assert.equal(invalidations.length, selected ? 1 : 0);
  }
});

test('manual music edits preserve the other settings and invalidate the old plan', () => {
  const changes = [];
  runNode(variable('handlePlanningStyleChange'), { isOptimizing: false, isGenerating: false, isGeneratingGrokVideo: false,
    selectedGenre: 'Jazz', selectedMood: 'Raw (날것의)', selectedVocal: '',
    setSelectedGenre: value => changes.push(['genre', value]), setSelectedMood: value => changes.push(['mood', value]), setSelectedVocal: value => changes.push(['vocal', value]),
    invalidatePlanningOutput: () => changes.push(['invalidate']),
  })('vocal', 'Smooth Male Vocal, Baritone');
  assert.deepEqual(changes, [['vocal', 'Smooth Male Vocal, Baritone'], ['invalidate']]);
});

test('actual planning payload requests AI inference by default and preserves exact topic and explicit music locks', async () => {
  const auto = planningHarness(); await auto.run();
  assert.deepEqual(auto.requests, [{ url: '/api/viral-cf/producer-brief', body: { category: 'human', topic, genreEn: '', vocalEn: '', moodEn: '' } }]);
  assert.equal(auto.changes.setProducerBrief[0].sourceTopic, topic); assert.equal(auto.changes.setCustomTopic, undefined);
  const manual = planningHarness({ selectedGenre: '펑크/디스코', selectedMood: 'Raw (날것의)', selectedVocal: 'Instrumental, No Vocals' }); await manual.run();
  assert.equal(manual.requests[0].body.genreEn, genreMap['펑크/디스코']);
  assert.equal(manual.requests[0].body.vocalEn, 'Instrumental, No Vocals'); assert.equal(manual.requests[0].body.moodEn, 'Raw');
});

test('a mismatched source topic cannot replace the plan, while pet keeps its dedicated planner', async () => {
  const mismatch = planningHarness({ reply: { ...brief(), sourceTopic: topic.trim() } }); await mismatch.run();
  assert.equal(mismatch.changes.setProducerBrief, undefined); assert.ok(mismatch.changes.setPetPlanError.some(value => value));
  const pet = planningHarness({ genCategory: 'pet' }); await pet.run(); assert.equal(pet.changes.petDelegated, true); assert.deepEqual(pet.requests, []);
});

const authCallback = find(node => ts.isCallExpression(node) && node.expression.getText(page) === 'client.auth.onAuthStateChange').arguments[0];
const accountReset = find(node => ts.isCallExpression(node) && node.expression.getText(page) === 'useEffect'
  && node.arguments[0]?.getText(page).includes('const previousOwner = petAccountRef.current')).arguments[0];
const planningButton = find(node => ts.isCallExpression(node) && ts.isParenthesizedExpression(node.expression)
  && node.expression.getText(page).includes('const isStep3Enabled'));
const planningError = find(node => ts.isConditionalExpression(node) && node.condition.getText(page) === 'petPlanError');
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };

function authPlanningHarness(reply) {
  const state = { planningAccount: null, planningAccountReady: false, isOptimizing: false, error: '', brief: null };
  const changes = {}, requests = [];
  const bindings = { genCategory: 'history', customTopic: topic, selectedGenre: '', selectedMood: '', selectedVocal: '',
    isGenerating: false, isGeneratingGrokVideo: false, petAccountRef: { current: null }, planningAccountRef: { current: null },
    petPlanningRequest: { current: 0 }, petCategoryRef: { current: 'history' }, petTopicDraft: { current: '' }, VIRAL_GENRE_PROMPT_MAP: genreMap,
    readPetEpisode: () => null,
    async fetch(url, options) {
      requests.push({ url, body: JSON.parse(options.body) });
      return reply ? reply(requests.length) : { ok: true, json: async () => ({ success: true, brief: brief() }) };
    },
    async handlePlanPetEpisode() { changes.petDelegated = true; },
  };
  for (const name of ['setPlanningAccount', 'setPlanningAccountReady', 'setIsOptimizing', 'setPetPlanError', 'setProducerBrief',
    'setPetCompletedRefreshKey', 'setIsGenerating', 'setGenProgress', 'setPetEpisode', 'setPetTrackId', 'setPetPlanLocked', 'setPetDraftOwner',
    'setCustomTopic', 'setCustomLyrics', 'setOptimizedPrompt', 'setStyleWarnings', 'setGeneratedResult', 'setSelectedGrokTrackId',
    'setGrokVideoPrompt', 'setGrokVideoResult', 'setGrokVideoClips', 'setGrokVideoDuration']) {
    bindings[name] = value => {
      (changes[name] ||= []).push(value);
      const key = { setPlanningAccount: 'planningAccount', setPlanningAccountReady: 'planningAccountReady', setIsOptimizing: 'isOptimizing',
        setPetPlanError: 'error', setProducerBrief: 'brief' }[name];
      if (key) state[key] = value;
    };
  }
  const snapshot = () => ({ ...bindings, ...state, petUserId: state.planningAccount?.userId || null });
  const auth = runNode(authCallback, { ...bindings, disposed: false });
  const handler = () => runNode(variable('handleOptimizePrompt'), snapshot());
  const button = () => {
    const tree = runNode(planningButton, { ...snapshot(), React, planIsCurrent: !!state.brief,
      handleOptimizePrompt: handler(), RefreshCw: 'RefreshCw', RotateCcw: 'RotateCcw', Wand2: 'Wand2' });
    return tree.children.find(child => child?.type === 'button');
  };
  return { state, changes, requests, bindings, handler, button,
    auth: (event, owner) => auth(event, owner ? { user: { id: owner } } : null),
    reset: () => runNode(accountReset, snapshot())(),
    error: () => runNode(planningError, { petPlanError: state.error, React }),
  };
}

test('history planning stays disabled through initial auth hydration and account reset, then allows AI music defaults', async () => {
  const host = authPlanningHarness();
  host.reset();
  assert.equal(host.button().props.disabled, true);
  await host.handler()();
  host.auth('INITIAL_SESSION', 'owner-A');
  assert.equal(host.button().props.disabled, true);
  await host.handler()();
  assert.equal(host.requests.length, 0);
  host.reset();
  assert.equal(host.button().props.disabled, false);
  await host.handler()();
  assert.deepEqual(host.requests, [{ url: '/api/viral-cf/producer-brief', body: { category: 'history', topic, genreEn: '', vocalEn: '', moodEn: '' } }]);
  assert.equal(host.state.brief.categoryId, 'history');
  assert.equal(host.state.brief.sourceTopic, topic);

  const loggedOut = authPlanningHarness();
  loggedOut.auth('INITIAL_SESSION', null); loggedOut.reset();
  assert.equal(loggedOut.button().props.disabled, true);
  await loggedOut.handler()();
  assert.equal(loggedOut.requests.length, 0);
});

test('same-owner auth events preserve the active history plan request and enabled account', async () => {
  let resolve;
  const host = authPlanningHarness(() => new Promise(done => { resolve = done; }));
  host.auth('INITIAL_SESSION', 'owner-A'); host.reset();
  const pending = host.handler()();
  const revision = host.bindings.petPlanningRequest.current;
  const account = host.state.planningAccount;
  for (const event of ['TOKEN_REFRESHED', 'SIGNED_IN', 'USER_UPDATED']) host.auth(event, 'owner-A');
  assert.equal(host.bindings.petPlanningRequest.current, revision);
  assert.equal(host.state.planningAccount, account);
  assert.equal(host.state.planningAccountReady, true);
  resolve({ ok: true, json: async () => ({ success: true, brief: brief() }) });
  await pending;
  assert.equal(host.state.brief.categoryId, 'history');
  assert.equal(host.button().props.disabled, false);
});

test('real owner transitions reject old replies before reset and cannot unlock a new planning request', async () => {
  for (const failed of [false, true]) {
    const replies = [];
    const host = authPlanningHarness(() => new Promise(resolve => { replies.push(resolve); }));
    host.auth('INITIAL_SESSION', 'owner-A'); host.reset();
    const previousClick = host.handler();
    const oldPending = previousClick();
    host.auth('SIGNED_IN', 'owner-B');
    assert.equal(host.button().props.disabled, true);
    await previousClick(); await host.handler()();
    assert.equal(host.requests.length, 1, 'Even a pre-transition click handler is blocked until reset');
    host.reset();
    const newPending = host.handler()();
    replies[0]({ ok: !failed, json: async () => failed ? { success: false, error: 'Old owner failure' }
      : { success: true, brief: { ...brief(), title: 'Old owner plan' } } });
    await oldPending;
    assert.equal(host.state.brief, null);
    assert.equal(host.state.error, '');
    assert.equal(host.state.isOptimizing, true, 'Old finally cannot release the new request lock');
    replies[1]({ ok: true, json: async () => ({ success: true, brief: { ...brief(), title: 'Current owner plan' } }) });
    await newPending;
    assert.equal(host.state.brief.title, 'Current owner plan');
    assert.equal(host.state.isOptimizing, false);
  }
});

test('logout rejects an old history reply before the account reset effect runs', async () => {
  let resolve;
  const host = authPlanningHarness(() => new Promise(done => { resolve = done; }));
  host.auth('INITIAL_SESSION', 'owner-A'); host.reset();
  const pending = host.handler()();
  host.auth('SIGNED_OUT', null);
  resolve({ ok: true, json: async () => ({ success: true, brief: brief() }) });
  await pending;
  assert.equal(host.state.brief, null);
  assert.equal(host.state.error, '');
  assert.equal(host.button().props.disabled, true);
  host.reset();
  assert.equal(host.state.isOptimizing, false);
  assert.equal(host.state.planningAccountReady, false);
});

test('a history JSON planning failure remains visible in the production alert', async () => {
  const host = authPlanningHarness(() => ({ ok: false, json: async () => ({ success: false, error: '기획 형식을 확인하지 못했습니다.', code: 'CATEGORY_BRIEF_CONTRACT' }) }));
  host.auth('INITIAL_SESSION', 'owner-A'); host.reset();
  await host.handler()();
  assert.equal(host.state.brief, null);
  assert.equal(host.state.isOptimizing, false);
  assert.equal(host.error().props.role, 'alert');
  assert.deepEqual(host.error().children, ['기획 형식을 확인하지 못했습니다.']);
});

function generationHarness(savedBrief, overrides = {}) {
  const requests = [], alerts = [], changes = {};
  const bindings = { genCategory: 'human', petEpisode: null, producerBrief: savedBrief, customLyrics: savedBrief.lyrics, optimizedPrompt: savedBrief.stylePrompt,
    planIsCurrent: true, petPlanLocked: false, generatedResult: null, selectedGenre: '', selectedMood: '', selectedVocal: '',
    petUserId: 'owner', petPlanningRequest: { current: 1 }, petCategoryRef: { current: 'human' }, petAccountRef: { current: 'owner' },
    readCategoryBriefExtras: extras, VIRAL_GENRE_PROMPT_MAP: genreMap, CATEGORY_TITLES: { human: '현대인·직장인' },
    brandName: '', customTopic: savedBrief.sourceTopic, effectiveIsPublic: false, duration: '30s', durationSeconds: 30,
    async fetch(url, options) { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ success: true, track: { id: 'planned-audio' } }) }; },
    setInterval() { return 1; }, console, alert: value => alerts.push(value), ...overrides };
  for (const name of ['setPetPlanError', 'setIsGenerating', 'setGenProgress', 'setSelectedGrokTrackId', 'setIsPlaying', 'setGeneratedResult']) bindings[name] = value => { (changes[name] ||= []).push(value); };
  return { requests, alerts, run: runNode(variable('handleGenerate'), bindings) };
}

test('actual generation honors inferred instrumental mode, saves guide lyrics, and emits no false selection locks', async () => {
  for (const instrumental of [false, true]) {
    const saved = { ...brief(instrumental), creativePlan: freshPlan(instrumental) }, host = generationHarness(saved); await host.run();
    assert.deepEqual(host.alerts, []); assert.equal(host.requests.length, 1);
    const request = host.requests[0]; assert.equal(request.url, '/api/generate');
    assert.equal(request.body.isInstrumental, instrumental); assert.equal(request.body.lyricsPrompt, instrumental ? '' : saved.lyrics);
    assert.equal(request.body.metadata.viralBrief.lyrics, saved.lyrics); assert.equal(request.body.metadata.viralBrief.sourceTopic, topic);
    assert.equal(request.body.metadata.viralBrief.lyricsPurpose, instrumental ? 'story-guide' : 'sung');
    assert.deepEqual(request.body.metadata.viralBrief.creativePlan, saved.creativePlan);
    assert.equal(request.body.stylePrompt, saved.stylePrompt); assert.deepEqual(request.body.selections, { genre: [], mood: [], vocal: [] });
  }
});

test('legacy snapshots still recover without defaults and use explicit instrumental fallback when generating', async () => {
  const legacy = brief(); delete legacy.isInstrumental; delete legacy.lyricsPurpose;
  const reader = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'readViralBrief');
  const read = runNode(reader, { readCategoryBriefExtras: extras });
  for (const track of [{ viralBrief: legacy }, { metadata: { viralBrief: legacy } }, { license_hash: JSON.stringify({ viralBrief: legacy }) }]) {
    assert.deepEqual(read(track), legacy);
  }
  const fresh = { ...brief(true), creativePlan: freshPlan(true) };
  assert.deepEqual(read({ license_hash: JSON.stringify({ viralBrief: fresh }) }), fresh);
  const host = generationHarness(legacy, { selectedVocal: 'Instrumental, No Vocals' }); await host.run();
  assert.equal(host.requests[0].body.isInstrumental, true); assert.equal(host.requests[0].body.lyricsPrompt, '');
  assert.deepEqual(host.requests[0].body.selections.vocal, ['Instrumental, No Vocals']);
});
