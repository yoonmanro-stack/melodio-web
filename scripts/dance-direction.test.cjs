const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loader() {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`) : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', js)(localRequire, mod, mod.exports, { env: { OPENAI_API_KEY: 'offline-fixture' } }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}
const load = loader();
const { DANCE_CREATIVE_OPTIONS, validateDanceCreativePreferences, resolveDanceCreativeDirection } = load('src/lib/dance/creativeDirection.ts');
const { validateDancePlan, createDancePlan } = load('src/lib/dance/videoPlan.ts');
const axes = ['castId', 'appearanceId', 'outfitId', 'paletteId', 'locationId', 'choreographyId'];
const preferences = validateDanceCreativePreferences();
const direction = resolveDanceCreativeDirection(preferences, 'plan-fixture');
const legacy = { title: '사이드 바운스', summary: '발과 몸통이 함께 움직이는 쉬운 춤', identity: 'one original adult dancer', imagePrompt: 'full-body first pose with feet planted', clips: ['Side step with knee bounce and torso transfer.', 'Continue the side step and finish.'] };
const current = () => ({ ...legacy, version: 2, choreography: {
  hookName: '좌우 바운스 훅', steps: [{ count: 4, action: '오른발 왼발을 번갈아 옆으로 딛기', focus: 'feet' }, { count: 4, action: '무릎을 굽히고 골반을 이동하며 손을 뻗기', focus: 'combined' }],
  segments: [{ startSeconds: 0, endSeconds: 10, action: '좌우 바운스 훅을 반복하기', repeatHook: true }, { startSeconds: 10, endSeconds: 20, action: '몸통을 기울이며 같은 훅 반복하기', repeatHook: true }, { startSeconds: 20, endSeconds: 30, action: '같은 훅을 반복하고 마지막 자세로 마무리', repeatHook: true }],
  firstPose: '양발을 바닥에 딛고 무릎을 살짝 굽힌 자세', endPose: '왼발을 딛고 오른손을 뻗은 마무리 자세',
} });

test('shared options validate defaults and reject malformed or unsupported preferences', () => {
  for (const [key, options] of Object.entries(DANCE_CREATIVE_OPTIONS)) {
    assert.ok(options.every(option => typeof option.id === 'string' && typeof option.label === 'string'));
    for (const { id } of options) assert.equal(validateDanceCreativePreferences({ [key]: id })[key], id);
  }
  for (const value of [[], 'robot', { performer: 'celebrity' }, { location: 3 }, { unknown: 'auto' }, { performer: undefined }]) assert.throws(() => validateDanceCreativePreferences(value), { code: 'CREATIVE_PREFERENCES' });
  assert.deepEqual(validateDanceCreativePreferences({}), preferences);
});
test('salted axes are deterministic and a single explicit choice does not drag unrelated axes', () => {
  assert.deepEqual(resolveDanceCreativeDirection(preferences, 'same'), resolveDanceCreativeDirection(preferences, 'same'));
  const base = resolveDanceCreativeDirection(preferences, 'same');
  const chosen = resolveDanceCreativeDirection({ ...preferences, location: 'beach' }, 'same');
  assert.equal(chosen.locationId, 'beach'); assert.equal(chosen.sources.location, 'explicit'); assert.ok(chosen.lockedAxes.includes('locationId'));
  for (const key of axes.filter(key => key !== 'locationId')) assert.equal(base[key], chosen[key]);
  const sample = Array.from({ length: 32 }, (_, i) => resolveDanceCreativeDirection(preferences, `seed-${i}`));
  for (const key of axes) assert.ok(new Set(sample.map(value => value[key])).size >= 4, key);
});
test('last twelve owner directions are avoided by signature and at least two changed axes', () => {
  const history = [];
  for (let i = 0; i < 24; i++) {
    const next = resolveDanceCreativeDirection(preferences, 'repeatable-seed', '', history);
    assert.ok(history.slice(0, 12).every(old => old.signature !== next.signature && axes.filter(key => old[key] !== next[key]).length >= 2));
    history.unshift(next);
  }
  const manual = { ...preferences, performer: 'robot', location: 'studio', danceStyle: 'robot' };
  const old = resolveDanceCreativeDirection(manual, 'fixed');
  const next = resolveDanceCreativeDirection(manual, 'fixed', '', [old]);
  assert.equal(next.castId, 'robot'); assert.equal(next.locationId, 'studio'); assert.equal(next.choreographyId, 'robot');
  assert.ok(axes.filter(key => old[key] !== next[key]).length >= 2);
});
test('free brief preserves requested actors and places while explicit and mixed descriptions remain reviewable', () => {
  const supplied = resolveDanceCreativeDirection(preferences, 'brief', '공원에서 춤추는 작은 구리 로봇의 셔플');
  assert.equal(supplied.castId, 'robot'); assert.equal(supplied.locationId, 'park'); assert.equal(supplied.choreographyId, 'shuffle');
  assert.equal(supplied.sources.cast, 'brief'); assert.ok(supplied.lockedAxes.includes('castId'));
  const mixed = resolveDanceCreativeDirection({ ...preferences, performer: 'duo' }, 'mixed', '여성·남성의 동작을 섞은 듀오');
  assert.equal(mixed.castId, 'duo'); assert.match(mixed.concreteEn, /Explicit selected cast/);
  assert.throws(() => resolveDanceCreativeDirection({ ...preferences, performer: 'man' }, 'conflict', '여성 솔로가 춤춘다'), { code: 'CREATIVE_CONFLICT' });
  assert.doesNotThrow(() => resolveDanceCreativeDirection({ ...preferences, performer: 'man' }, 'ambiguous', '여성 솔로처럼 남성도 춤춘다'));
});
test('v2 plan compiles exactly eight counts and both timelines with grounded motion and actual-frame continuity', () => {
  const result = validateDancePlan(current(), direction);
  assert.equal(result.version, 2); assert.equal(result.choreography.steps.reduce((sum, step) => sum + step.count, 0), 8);
  assert.ok(result.clips.every(clip => clip.length <= 4096 && /CHOREOGRAPHY CONTRACT/.test(clip) && /grounded alternating foot/.test(clip)));
  assert.match(result.clips[1], /actual final frame/); assert.match(result.clips[1], /0-5s/); assert.match(result.imagePrompt, /양발/);
  assert.equal(validateDancePlan(legacy).title, legacy.title);
  assert.throws(() => validateDancePlan(legacy, direction), { code: 'PLAN_INVALID' });
});
test('hand-only hooks, wrong counts, timeline gaps, missing repeats and oversized compiled prompts are rejected', () => {
  const mutate = update => { const plan = current(); update(plan); return plan; };
  const invalid = [
    mutate(p => p.choreography.steps.forEach(step => { step.focus = 'arms'; step.action = '손을 좌우로 흔들기'; })),
    mutate(p => p.choreography.steps[0].count = 3),
    mutate(p => { p.choreography.steps[0].focus = 'feet'; p.choreography.steps[0].action = '손을 들어 인사하기'; }),
    mutate(p => p.choreography.segments[1].startSeconds = 11),
    mutate(p => p.choreography.segments[2].endSeconds = 29),
    mutate(p => p.choreography.segments.forEach(segment => segment.repeatHook = false)),
    mutate(p => p.choreography.segments[1].endSeconds = 9),
    mutate(p => p.choreography.steps.push(...p.choreography.steps, ...p.choreography.steps)),
  ];
  for (const plan of invalid) assert.throws(() => validateDancePlan(plan, direction), { code: 'PLAN_INVALID' });
  const large = current(); large.identity = 'x'.repeat(600); large.clips = ['x'.repeat(2400), 'x'.repeat(2400)];
  large.choreography.steps.forEach((step, index) => step.action = `발을 움직이고${index === 0 ? '왼쪽' : '오른쪽'}${'가'.repeat(148)}`);
  large.choreography.segments.forEach(segment => segment.action = '가'.repeat(180));
  assert.throws(() => validateDancePlan(large, direction), { code: 'PLAN_LENGTH' });
});
test('planner uses actual selected music and persisted creative direction in a single bounded call', async () => {
  let calls = 0;
  const job = { direction, visualBrief: '구리 로봇의 밝은 춤', musicSpec: { style: 'funk with Korean chant vocals', rhythmPurpose: 'a syncopated bass hook with clean count accents' }, bpm: 112, onsetSeconds: [0.3, 0.9] };
  const result = await createDancePlan(job, async (_url, options) => {
    calls++;
    const request = JSON.parse(options.body); const system = request.messages[0].content;
    assert.match(system, /funk with Korean chant vocals/); assert.match(system, /syncopated bass hook/);
    assert.match(system, /approximate energy-analysis cues/); assert.match(system, /SUM TO EXACTLY8/);
    assert.ok(system.includes(direction.concreteEn)); assert.doesNotMatch(system, /The fixed music style/);
    assert.equal(JSON.parse(request.messages[1].content).visualBrief, job.visualBrief);
    return Response.json({ choices: [{ message: { content: JSON.stringify(current()) } }] });
  });
  assert.equal(calls, 1); assert.equal(result.version, 2);
});
test('invalid v2 planning is held after one call with no replacement choreography', async () => {
  let calls = 0;
  await assert.rejects(createDancePlan({ direction, visualBrief: '' }, async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify(legacy) } }] }); }), { code: 'PLAN_INVALID' });
  assert.equal(calls, 1);
});

test('music recipes influence automatic dance recommendations without restricting explicit or brief styles', () => {
  const footwork = { id: 'house-footwork', bpm: 128, rhythmPurpose: '발 교차·스텝 터치·방향 전환' };
  const groove = { id: 'afro-groove', bpm: 106, rhythmPurpose: '골반·어깨 그루브와 체중 이동' };
  const sample = Array.from({ length: 100 }, (_, i) => resolveDanceCreativeDirection(preferences, `music-${i}`, '', [], footwork));
  assert.ok(sample.filter(value => value.musicMatch.selection === 'preferred').length >= 60);
  assert.ok(sample.some(value => value.musicMatch.selection === 'adapted'), 'styles outside the recommendation stay eligible');
  assert.ok(sample.some((value, i) => value.choreographyId !== resolveDanceCreativeDirection(preferences, `music-${i}`, '', [], groove).choreographyId));
  const explicit = resolveDanceCreativeDirection({ ...preferences, danceStyle: 'robot' }, 'selected', '', [], footwork);
  assert.equal(explicit.choreographyId, 'robot'); assert.equal(explicit.musicMatch.selection, 'user');
  assert.match(explicit.concreteEn, /two beats per count/); assert.match(explicit.concreteEn, /not a measured downbeat/); assert.match(explicit.concreteEn, /no exact sync claim/);
  const supplied = resolveDanceCreativeDirection(preferences, 'brief', '그루브 웨이브로 춤추는 로봇', [], footwork);
  assert.equal(supplied.choreographyId, 'groove'); assert.equal(supplied.sources.choreography, 'brief');
  const unknown = resolveDanceCreativeDirection(preferences, 'unknown', '', [], { id: 'custom-recipe', bpm: 112, rhythmPurpose: '골반 체중 이동' });
  assert.ok(unknown.musicMatch.preferredStyles.includes('groove')); assert.ok(unknown.musicMatch.recommendationTags.includes('weight-transfer'));
});
test('music matching stays within the planner direction budget and preserves the other independently selected axes', () => {
  const plain = resolveDanceCreativeDirection(preferences, 'same');
  for (const id of ['hook-pop', 'afro-groove', 'house-footwork', 'hiphop-bounce', 'latin-step', 'brazil-funk', 'custom']) {
    for (const performer of ['auto', 'woman', 'man', 'duo', 'group', 'robot', 'animal']) {
      const result = resolveDanceCreativeDirection({ ...preferences, performer }, 'same', '', [], { id, bpm: 138, rhythmPurpose: '골반 어깨 체중 이동 발 교차 무릎 바운스 반복 훅'.repeat(7) });
      assert.ok(result.concreteEn.length <= 1600, `${id}/${performer}: ${result.concreteEn.length}`);
      if (performer === 'auto') for (const key of axes.filter(key => key !== 'choreographyId')) assert.equal(result[key], plain[key]);
    }
  }
});

test('rhythm confidence and ending review travel in compact planner data with an honest fallback contract', async () => {
  let calls = 0;
  const rhythm = { beatSeconds: [0, 0.5, 1, 1.5], confidence: 0.2, method: 'editorial-fallback', endingStatus: 'review' };
  await createDancePlan({ direction, visualBrief: '', rhythm }, async (_url, options) => {
    calls++; const request = JSON.parse(options.body); const user = JSON.parse(request.messages[1].content);
    assert.deepEqual(user.rhythm, rhythm); assert.match(request.messages[0].content, /confidence is below0.55/);
    assert.match(request.messages[0].content, /never verified downbeats/); assert.match(request.messages[0].content, /leave the audio ending for creator review/);
    return Response.json({ choices: [{ message: { content: JSON.stringify(current()) } }] });
  });
  assert.equal(calls, 1);
});
