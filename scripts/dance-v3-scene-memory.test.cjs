/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline provider contracts, owner-scoped history and persisted preparation; no external calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '..');
function loader(base = root, overrides = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(base, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const local = name => Object.hasOwn(overrides, name) ? overrides[name]
      : name.startsWith('.') ? load(path.relative(base, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', compiled)(local, mod, mod.exports,
      { env: { OPENAI_API_KEY: 'offline-contract-only' } }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}
const load = loader();
const premiseModule = load('src/lib/dance/premises.ts');
const { DANCE_SCENE_CONTEXT_LIMITS, DANCE_RECENT_PREMISE_BYTES, DANCE_RECENT_PREMISE_METADATA_BYTES,
  isDancePerformancePremiseV3, validateDancePerformancePremisesV3, validateFreshDancePerformancePremisesV3,
  projectDanceRecentPremiseV3, boundDanceRecentPremisesV3 } = premiseModule;
const { createDanceIdeas } = load('src/lib/dance/ideas.ts');
const { createDancePlan } = load('src/lib/dance/videoPlan.ts');
const { createDanceVideoService, DanceVideoError } = load('src/lib/dance/videoService.ts');
const { resolveDanceProductionSeedV3, resolveDanceCreativeDirection } = load('src/lib/dance/creativeDirection.ts');
const { resolveDanceMusicSpec } = load('src/lib/dance/musicProfiles.ts');
const serverLoad = loader(root, { './renderVideo': {}, '../video/petProvider': {}, '../video/petMedia': {} });
const { createDanceVideoStore } = serverLoad('src/lib/dance/videoServer.ts');
const USER = 'a0000000-0000-4000-8000-000000000001', OTHER = 'a0000000-0000-4000-8000-000000000002';
const TRACK = 'b0000000-0000-4000-8000-000000000001';
const preferences = { performer: 'woman', ensemble: 'duo', species: 'auto', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' };
const music = resolveDanceMusicSpec('hook-pop', 'on', TRACK);
function premise(index = 0, context = true) {
  return { version: 3, id: `scene_${index}`, title: `긴장 속의 반전 ${index}`, conceptFamily: 'interaction',
    visibleHook: '진행하던 활동이 상대의 뜻밖의 움직임 때문에 곧 달라지려는 순간이다.',
    characterGoal: '진행하던 활동을 끝내며 상대와 기쁨을 나누려 한다.', emotionalReaction: '놀란 몸이 상대를 향했다가 안도와 웃음으로 바뀐다.',
    turn: '상대의 행동 때문에 첫 시도의 목적과 가능한 행동이 달라진다.', payoff: '처음의 긴장이 풀리며 성공을 확인한 몸이 환하게 반응한다.',
    participation: '어떤 반응이 먼저 나타날지 예상하고 몸으로 따라 한다.', productionRisk: '몸이 겹칠 수 있으니 같은 활동을 짧은 이동과 또렷한 접촉으로 보여 준다.',
    musicConnection: '밝은 킥과 신스의 응답이 시도와 몸의 반응을 재촉한다.',
    ...(context ? { sceneContext: { place: '그 활동의 흔적이 눈에 보이는 열린 장소', ongoingActivity: '함께 맡은 활동을 마무리하려는 몸의 시도가 이미 진행 중이다.', immediateTrigger: '바로 앞에서 상대의 예상 밖의 몸 반응이 첫 시도를 바꾼다.' } } : {}) };
}
const premises = context => [0, 1, 2].map(index => premise(index, context));
const response = payload => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }] });
function job() {
  const visualBrief = '성인 여성 두 명이 나란히 빨간 운동복을 입고 스튜디오에서 셔플을 춘다. 이전의 상황을 다시 사용해도 좋다.';
  return { planningVersion: 3, visualBrief, creativePreferences: preferences, musicSpec: music, bpm: 138,
    productionSeed: resolveDanceProductionSeedV3(preferences, 'scene-memory', visualBrief, [], music),
    recentPremises: [projectDanceRecentPremiseV3(premise(8))] };
}

test('saved V3 reader accepts legacy absence while fresh output requires exact bounded Korean scene context', () => {
  const legacy = premises(false);
  assert.ok(legacy.every(isDancePerformancePremiseV3)); assert.equal(validateDancePerformancePremisesV3(legacy).length, 3);
  assert.throws(() => validateFreshDancePerformancePremisesV3(legacy));
  assert.equal(validateFreshDancePerformancePremisesV3(premises(true)).length, 3);
  for (const field of Object.keys(DANCE_SCENE_CONTEXT_LIMITS)) {
    for (const bad of ['', 'English only', '한글\n줄바꿈', '<b>한글</b>', '`한글`', 'data:한글', 'base64한글', ' 앞뒤 공백 ', '가'.repeat(DANCE_SCENE_CONTEXT_LIMITS[field] + 1)]) {
      const item = premise(); item.sceneContext[field] = bad;
      assert.equal(isDancePerformancePremiseV3(item), false, field);
    }
  }
  for (const context of [null, [], { place: '장소' }, { ...premise().sceneContext, identity: '새 인물' }]) assert.equal(isDancePerformancePremiseV3({ ...premise(), sceneContext: context }), false);
  assert.equal(isDancePerformancePremiseV3({ ...premise(), choreography: '새 안무' }), false);
});

test('one actual V3 request requires context, uses semantic history and preserves full brief/cast/music', async () => {
  const current = job(); let calls = 0;
  const actual = await createDanceIdeas(current, async (_url, options) => {
    calls++; const request = JSON.parse(options.body), input = JSON.parse(request.messages[1].content), system = request.messages[0].content;
    const ideaSchema = request.response_format.json_schema.schema.properties.ideas.items;
    assert.equal(request.model, 'gpt-5.6-sol'); assert.equal(request.reasoning_effort, 'low'); assert.equal(request.max_completion_tokens, 6144);
    assert.equal(request.response_format.json_schema.strict, true); assert.equal(ideaSchema.additionalProperties, false);
    assert.ok(ideaSchema.required.includes('sceneContext'));
    const contextSchema = ideaSchema.properties.sceneContext;
    assert.equal(contextSchema.additionalProperties, false); assert.deepEqual(contextSchema.required, ['place', 'ongoingActivity', 'immediateTrigger']);
    for (const [field, maxLength] of Object.entries(DANCE_SCENE_CONTEXT_LIMITS)) {
      assert.equal(contextSchema.properties[field].maxLength, maxLength); assert.equal(contextSchema.properties[field].pattern, '[가-힣]');
    }
    assert.deepEqual(input.recentPremises, current.recentPremises); assert.equal(input.visualBrief, current.visualBrief);
    assert.deepEqual(input.selectedMusic, Object.fromEntries(['id', 'label', 'style', 'rhythmPurpose'].map(key => [key, music[key]])));
    assert.deepEqual(input.selectionFacts.anchors, current.productionSeed.anchors); assert.deepEqual(input.selectionFacts.locks, current.productionSeed.locks);
    assert.match(system, /ongoingActivity gives the action a purpose/); assert.match(system, /immediateTrigger is its observable cause/);
    assert.match(system, /Compare goals.*semantically/); assert.match(system, /explicit user request to reuse.*takes precedence/);
    assert.match(system, /never a hard novelty rejection/);
    return response({ version: 3, selection: input.selectionFacts, ideas: premises(true) });
  });
  assert.equal(calls, 1); assert.deepEqual(actual, premises(true));
  for (const fresh of [premises(false), premises(true).map((item, index) => index === 0 ? { ...item, sceneContext: { ...item.sceneContext, extra: '추가' } } : item)]) {
    let rejectedCalls = 0;
    await assert.rejects(createDanceIdeas(current, async (_url, options) => {
      rejectedCalls++; return response({ version: 3, selection: JSON.parse(JSON.parse(options.body).messages[1].content).selectionFacts, ideas: fresh });
    }), error => error.code === 'PLAN_INVALID');
    assert.equal(rejectedCalls, 1, 'invalid fresh schema never triggers automatic retries');
  }
});

test('selected plan request receives exact chosen context with ongoing activity/visible cause; saved legacy V3 still plans', async () => {
  for (const context of [true, false]) {
    const current = { ...job(), ideas: premises(context), selectedIdea: premise(1, context) }; let calls = 0;
    await assert.rejects(createDancePlan(current, async (_url, options) => {
      calls++; const request = JSON.parse(options.body), input = JSON.parse(request.messages[1].content), system = request.messages[0].content;
      assert.deepEqual(input.selectedPremise, current.selectedIdea); assert.equal(input.ideas, undefined); assert.equal(input.recentPremises, undefined);
      assert.equal(input.visualBrief, current.visualBrief); assert.deepEqual(input.selectedMusic, current.musicSpec); assert.deepEqual(input.hardLocks, current.productionSeed.locks);
      assert.match(system, /preserve its exact place, ongoingActivity and immediateTrigger/); assert.match(system, /Show that cause on screen/);
      assert.equal(request.model, 'gpt-5.6-sol'); assert.equal(request.max_completion_tokens, 4096);
      return Response.json({}, { status: 503 });
    }), error => error.code === 'PLAN_HTTP');
    assert.equal(calls, 1);
  }
});

test('history projections omit identity/media/full metadata, skip malformed entries and enforce complete-array UTF-8 bound', () => {
  const long = { ...premise(), characterGoal: '가'.repeat(120), visibleHook: '나'.repeat(180), turn: '다'.repeat(160), payoff: '라'.repeat(160),
    sceneContext: Object.fromEntries(Object.entries(DANCE_SCENE_CONTEXT_LIMITS).map(([key, length]) => [key, '마'.repeat(length)])) };
  const projected = projectDanceRecentPremiseV3(long);
  const bounded = boundDanceRecentPremisesV3(Array.from({ length: 12 }, () => projected));
  assert.ok(bounded.length > 0 && bounded.length < 6); assert.ok(Buffer.byteLength(JSON.stringify(bounded)) <= DANCE_RECENT_PREMISE_BYTES);
  assert.deepEqual(Object.keys(projected).sort(), ['goal', 'opening', 'turn', 'payoff', 'sceneContext'].sort());
  assert.equal(projectDanceRecentPremiseV3({ ...premise(), imageUrl: 'https://media.test/a.jpg' }), null);
  const legacy = projectDanceRecentPremiseV3(premise(0, false)); assert.equal(legacy.sceneContext, undefined);
  assert.deepEqual(boundDanceRecentPremisesV3([null, [], { ...legacy, goal: 'English only' }, { ...legacy, identity: 'new identity' }, legacy]), [legacy]);
  assert.equal(boundDanceRecentPremisesV3(Array.from({ length: 13 }, () => legacy)).length, 6);
  const copy = boundDanceRecentPremisesV3([projected]); copy[0].sceneContext.place = '바뀐 장소'; assert.equal(projected.sceneContext.place, long.sceneContext.place);
});

function historyRow(id, owner, index, overrides = {}) {
  return { id, user_id: owner, created_at: `2026-10-${String(28 - index).padStart(2, '0')}T00:00:00Z`,
    license_hash: JSON.stringify({ workflow: 'dance-music-first-v1', presetId: 'dance_challenge',
      imageUrl: 'https://media.test/identity.jpg', privateIdentity: 'never project', danceVideo: { planningVersion: 3, selectedIdea: premise(index, index % 2 === 0) } }), ...overrides };
}
test('real store history query is owner scoped, excludes current track, takes latest12 and returns at most6 selected validated V3 projections', async () => {
  const rows = [historyRow(TRACK, USER, 0), historyRow('other-owner', OTHER, 0),
    historyRow('malformed', USER, 1, { license_hash: '{bad json' }),
    historyRow('array-meta', USER, 2, { license_hash: '[]' }),
    historyRow('legacy-version', USER, 3, { license_hash: JSON.stringify({ workflow: 'dance-music-first-v1', presetId: 'dance_challenge', danceVideo: { planningVersion: 2, selectedIdea: premise(3) } }) }),
    historyRow('invalid-context', USER, 4, { license_hash: JSON.stringify({ workflow: 'dance-music-first-v1', presetId: 'dance_challenge', danceVideo: { planningVersion: 3, selectedIdea: { ...premise(4), sceneContext: { place: '장소' } } } }) }),
    historyRow('oversized', USER, 5, { license_hash: ' '.repeat(DANCE_RECENT_PREMISE_METADATA_BYTES + 1) }),
    ...Array.from({ length: 8 }, (_, index) => historyRow(`valid-${index}`, USER, index + 6))];
  const requests = [];
  const admin = createClient('https://scene-memory.test', 'offline-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async input => {
    const url = new URL(String(input)); assert.equal(url.origin, 'https://scene-memory.test'); requests.push(url);
    assert.equal(url.pathname, '/rest/v1/generations'); assert.equal(url.searchParams.get('select'), 'license_hash');
    assert.equal(url.searchParams.get('user_id'), `eq.${USER}`); assert.equal(url.searchParams.get('id'), `neq.${TRACK}`);
    assert.equal(url.searchParams.get('order'), 'created_at.desc'); assert.equal(url.searchParams.get('limit'), '12');
    const selected = rows.filter(row => row.user_id === USER && row.id !== TRACK).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12);
    return Response.json(selected.map(row => ({ license_hash: row.license_hash })));
  } } });
  const actual = await createDanceVideoStore(admin).recentPremises(USER, TRACK);
  assert.equal(requests.length, 1); assert.equal(actual.length, 6);
  assert.deepEqual(actual, Array.from({ length: 6 }, (_, index) => projectDanceRecentPremiseV3(premise(index + 6, (index + 6) % 2 === 0))));
  assert.ok(Buffer.byteLength(JSON.stringify(actual)) <= DANCE_RECENT_PREMISE_BYTES);
  assert.doesNotMatch(JSON.stringify(actual), /identity|https:|imageUrl|planningVersion|title|memberId/);
});

test('fresh V3 snapshots history before reservation; recovered preparation and selected-plan retry keep it without new reads', async () => {
  let history = [projectDanceRecentPremiseV3(premise(8))], historyCalls = 0, ideaCalls = 0;
  const metadata = { workflow: 'dance-music-first-v1', presetId: 'dance_challenge', danceMusic: music };
  let row = { id: TRACK, userId: USER, status: 'completed', audioUrl: 'https://storage.test/original.mp3', title: '원곡', isPublic: false,
    createdAt: '2026-10-10T00:00:00Z', metadata, licenseHash: JSON.stringify(metadata) };
  const writes = [], plannedSnapshots = [];
  const store = { load: async (user, track) => user === USER && track === TRACK ? structuredClone(row) : null,
    recentDirections: async () => [], recentPremises: async (user, excluded) => { historyCalls++; assert.equal(user, USER); assert.equal(excluded, TRACK); return history; },
    compareAndSwap: async (previous, next) => {
      if (previous.licenseHash !== row.licenseHash) return null;
      writes.push(structuredClone(next)); const metadata = { ...row.metadata, danceVideo: structuredClone(next) };
      row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; return structuredClone(row);
    } };
  const forbidden = async () => { throw Error('UNEXPECTED_MEDIA_CALL'); };
  const deps = { store, snapshot: async current => {
    assert.deepEqual(row.metadata.danceVideo.recentPremises, current.recentPremises);
    history[0].goal = '그 뒤의 기록은 바뀌었다.';
    return { audioUrl: 'https://storage.test/selected.wav', audioHash: 'a'.repeat(64), sourceAudioHash: 'b'.repeat(64), sourceDurationSeconds: 180 };
  }, reuseSnapshot: forbidden, ideas: async current => { ideaCalls++; assert.deepEqual(current.recentPremises, writes[0].recentPremises); return premises(true); },
    plan: async current => { plannedSnapshots.push(structuredClone(current.recentPremises)); throw new DanceVideoError('오프라인 계획 중단', 'PLAN_INVALID'); },
    generateImage: forbidden, startVideo: forbidden, pollVideo: forbidden, copyAsset: forbidden, bridge: forbidden, render: forbidden };
  const prepared = await createDanceVideoService(deps).prepare(USER, TRACK, 10, '', preferences, 3);
  assert.equal(prepared.status, 'ideas'); assert.equal(historyCalls, 1); assert.equal(ideaCalls, 1);
  assert.equal(writes[0].recentPremises[0].goal, premise(8).characterGoal);
  history = [projectDanceRecentPremiseV3(premise(9))];
  const recovered = createDanceVideoService(deps);
  const same = await recovered.prepare(USER, TRACK, 10, '', preferences, 3); assert.equal(same.id, prepared.id);
  assert.deepEqual((await recovered.get(USER, TRACK)).recentPremises, prepared.recentPremises);
  const held = await recovered.selectIdea(USER, TRACK, prepared.id, prepared.ideas[0].id); assert.equal(held.status, 'attention');
  const repeated = await createDanceVideoService(deps).selectIdea(USER, TRACK, prepared.id, prepared.ideas[0].id); assert.equal(repeated.status, 'attention');
  assert.equal(historyCalls, 1); assert.equal(ideaCalls, 1); assert.deepEqual(plannedSnapshots, [prepared.recentPremises, prepared.recentPremises]);
});

test('legacy prepare never reads semantic history or persists a V3 comparison field', async () => {
  const metadata = { workflow: 'dance-music-first-v1', presetId: 'dance_challenge', danceMusic: music };
  let row = { id: TRACK, userId: USER, status: 'completed', audioUrl: 'https://storage.test/original.mp3', title: '원곡', isPublic: false,
    createdAt: '2026-10-10T00:00:00Z', metadata, licenseHash: JSON.stringify(metadata) };
  const store = { load: async () => structuredClone(row), recentDirections: async () => [], recentPremises: async () => { throw Error('LEGACY_HISTORY_READ'); },
    compareAndSwap: async (_previous, next) => { const metadata = { ...row.metadata, danceVideo: next }; row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; return structuredClone(row); } };
  const forbidden = async () => { throw Error('UNEXPECTED_MEDIA_CALL'); };
  const prepared = await createDanceVideoService({ store, snapshot: async () => ({ audioUrl: 'https://storage.test/selected.wav', audioHash: 'a'.repeat(64), sourceAudioHash: 'b'.repeat(64), sourceDurationSeconds: 180 }),
    plan: async current => { assert.equal(Object.hasOwn(current, 'recentPremises'), false); return { title: '원래 계획', summary: '원래 동작', identity: 'same cast', imagePrompt: 'opening', clips: ['first', 'second'] }; },
    reuseSnapshot: forbidden, generateImage: forbidden, startVideo: forbidden, pollVideo: forbidden, copyAsset: forbidden, bridge: forbidden, render: forbidden }).prepare(USER, TRACK, 10, '', preferences);
  assert.equal(prepared.status, 'ready'); assert.equal(Object.hasOwn(prepared, 'recentPremises'), false);
});

test('V1 and V2 idea requests stay byte-identical to the verified production source', async t => {
  const production = '/Users/yoonmanro/.codex/worktrees/vocal-studio-release/Melodio';
  if (!fs.existsSync(path.join(production, 'src/lib/dance/ideas.ts'))) return t.skip('production checkout unavailable; deployed legacy hash is also checked in dance-performance-v3');
  const original = loader(production)('src/lib/dance/ideas.ts').createDanceIdeas;
  const v1 = { visualBrief: '리듬을 따라 춤을 춘다.', musicSpec: music, bpm: 138 };
  const v2 = { ...v1, creativePreferences: preferences, direction: resolveDanceCreativeDirection(preferences, 'legacy-exact', v1.visualBrief, [], music) };
  for (const current of [v1, v2]) {
    const bodies = [];
    for (const generate of [original, createDanceIdeas]) await assert.rejects(generate(current, async (_url, options) => { bodies.push(options.body); return Response.json({}, { status: 503 }); }), error => error.code === 'PLAN_HTTP');
    assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
  }
});
