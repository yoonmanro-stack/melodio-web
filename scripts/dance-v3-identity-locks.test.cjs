/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline identity/production regressions; all network calls require an explicit local fixture. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const local = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', 'process', 'fetch', js)(local, mod, mod.exports, { env: { OPENAI_API_KEY: 'offline-only' } }, () => { throw Error('NETWORK_FORBIDDEN'); });
  return mod.exports;
}
const { resolveDanceProductionSeedV3: seedFor, validateDanceProductionSeedV3, resolveDanceProductionDirectionV3: directionFor, validateDanceProductionManifestV3: validateManifest, resolveDanceCreativeDirection } = load('src/lib/dance/creativeDirection.ts');
const { validateDancePerformancePlanV3: validatePlan, validateDancePlan, createDancePlan } = load('src/lib/dance/videoPlan.ts');
const prefs = (overrides = {}) => ({ performer: 'woman', ensemble: 'solo', species: 'auto', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy', ...overrides });
function manifest(seed, override = {}) {
  return { version: 3, locationId: seed.locks.locationId || 'park', danceStyleId: seed.locks.danceStyleId || 'groove',
    layoutId: seed.locks.layoutId || ({ solo: 'solo_center', duo: 'side_by_side', trio: 'open_triangle', crowd: 'staggered_rows' }[seed.ensemble]),
    locationDetail: 'a level park plaza with warm light and no extra performers',
    wardrobes: seed.anchors.map(anchor => ({ memberId: anchor.id, description: 'red tracksuit' })), ...override };
}
function planFor(seed, override = {}) {
  const actors = second => seed.anchors.map(anchor => ({ memberId: anchor.id, action: second ? '몸통 흔들기' : anchor.kind === 'animal' && anchor.species !== 'penguin' ? '앞발 딛기' : '발 옆 딛기' }));
  return { version: 3, seedId: seed.seedId, productionManifest: manifest(seed), title: '웃음이 번진다', summary: '발걸음과 몸통의 반응이 기대를 즐거움으로 바꾼다.',
    imagePrompt: 'Full bodies with a restrained expression and eager weight movement toward the visible cue.',
    previewPrompt: `0-2s: ${seed.anchors.map(anchor => anchor.id).join(',')} begin native foot and body accents toward the cue. 2-5s: surprise becomes delight as the body-weight response spreads.`,
    clips: ['Open the situation through native movement and an emotional response.', 'Continue the actual ending frame, reward the shared response and return to the opening invitation.'],
    choreography: { hookName: '웃음 발걸음', firstPose: '몸통을 기울여 첫 응답을 준비한다.', endPose: '발을 모으고 몸통을 돌려 기대를 연다.',
      steps: [{ count: 4, action: '첫 움직임', focus: 'body', actors: actors(false) }, { count: 4, action: '이어지는 움직임', focus: 'body', actors: actors(true) }],
      segments: [{ startSeconds: 0, endSeconds: 2, phase: 'opening', action: '발을 옆으로 딛고 몸통을 기울인다.', repeatHook: true },
        { startSeconds: 2, endSeconds: 22, phase: 'development', action: '몸통을 돌리고 발을 반대 방향으로 딛는다.', repeatHook: true },
        { startSeconds: 22, endSeconds: 28, phase: 'payoff', action: '발을 중앙에 딛고 몸통을 펼친다.', repeatHook: true },
        { startSeconds: 28, endSeconds: 30, phase: 'restart', action: '몸통을 낮추고 고개를 돌린다.', repeatHook: true }] }, ...override };
}

test('the confirmed Korean age and short blonde hair brief becomes frozen facts before planning', () => {
  const seed = seedFor(prefs(), 'confirmed-age-hair', '40대 성인 여성 한 명이 짧은 금발 머리로 춤춘다.');
  assert.equal(seed.anchors[0].ageBand, '40s'); assert.equal(seed.anchors[0].hair, 'short blonde hair'); assert.equal(seed.anchors[0].gender, 'woman');
  assert.equal(seed.anchors[0].adult, true);
  const direction = directionFor(seed, manifest(seed));
  assert.match(direction.cast.members[0].identity, /adult woman 40s.*short blonde hair/); assert.equal(direction.version, 2);
});

test('unmentioned identity details keep deterministic seeded variety', () => {
  const samples = Array.from({ length: 32 }, (_, i) => seedFor(prefs(), `variety-${i}`));
  for (const key of ['ageBand', 'hair', 'face']) assert.ok(new Set(samples.map(seed => seed.anchors[0][key])).size >= 4, key);
  assert.deepEqual(seedFor(prefs(), 'stable'), seedFor(prefs(), 'stable'));
});

test('common English/Korean intrinsic traits and member roles bind to the appropriate immutable member', () => {
  const solo = seedFor(prefs(), 'english', 'A 42 years old Korean woman with short blonde hair and blue eyes wears a red dress.');
  assert.equal(solo.anchors[0].ageBand, '42 years old'); assert.match(solo.anchors[0].face, /Korean face.*blue eyes/);
  assert.deepEqual(solo.locks.wardrobeTerms, ['red', 'dress']);
  const duo = seedFor(prefs({ performer: 'duo', ensemble: 'duo' }), 'roles', '왼쪽 여성은 40대 짧은 금발 머리다. 오른쪽 남성은 50대 긴 검은 머리다.');
  assert.deepEqual(duo.anchors.map(anchor => [anchor.gender, anchor.ageBand, anchor.hair]), [['woman', '40s', 'short blonde hair'], ['man', '50s', 'long black hair']]);
  assert.equal(duo.locks.layoutId, 'side_by_side');
  const ids = seedFor(prefs({ performer: 'duo', ensemble: 'duo' }), 'ids', 'performer_1 is a 35 years old man with brown ponytail. performer_2 is a 45 years old woman with short silver hair.');
  assert.deepEqual(ids.anchors.map(anchor => [anchor.gender, anchor.ageBand, anchor.hair]), [['man', '35 years old', 'brown ponytail'], ['woman', '45 years old', 'short silver hair']]);
  for (const brief of ['A Korean woman with blue eyes, freckles and short blonde hair dances.', '한국인 여성이 파란 눈, 주근깨와 짧은 금발 머리로 춤춘다.']) {
    const additive = seedFor(prefs(), 'additive-traits', brief);
    assert.match(additive.anchors[0].face, /Korean face.*blue eyes.*freckles/); assert.equal(additive.anchors[0].hair, 'short blonde hair');
  }
  const mixed = seedFor(prefs({ performer: 'human_animal', ensemble: 'trio', species: 'penguin' }), 'mixed-ordinary', '성인 여성 한 명과 펭귄 두 마리가 함께 공연한다.');
  assert.deepEqual(mixed.anchors.map(anchor => [anchor.species, anchor.gender]), [['human', 'woman'], ['penguin', 'none'], ['penguin', 'none']]);
  assert.doesNotThrow(() => validatePlan(planFor(mixed), mixed, 138));
  const mixedEnglish = seedFor(prefs({ performer: 'human_animal', ensemble: 'trio', species: 'penguin' }), 'mixed-english', 'One adult woman and two penguins perform together.');
  assert.deepEqual(mixedEnglish.anchors.map(anchor => anchor.species), ['human', 'penguin', 'penguin']);
  assert.deepEqual(seedFor(prefs({ performer: 'human_animal', ensemble: 'trio', species: 'penguin' }), 'mixed-a-woman', 'A woman and two penguins perform together.').anchors.map(anchor => anchor.species), ['human', 'penguin', 'penguin']);
  assert.doesNotThrow(() => seedFor(prefs({ performer: 'human_animal', ensemble: 'trio', species: 'penguin' }), 'mixed-interaction', '여성과 펭귄은 서로를 놀리고 웃는다.'));
  assert.equal(seedFor(prefs(), 'hyphen-age', 'A 42-year-old woman with short blonde hair dances.').anchors[0].ageBand, '42 years old');
});

test('ambiguous, contradictory, unsupported and underage explicit identities hold instead of overwriting them', () => {
  for (const brief of ['성인 여성 두 명 중 한 명은 40대 짧은 금발 머리다.', 'A woman with unusual hairstyle dances.', 'A woman aged twenty-nine dances.', 'A 16 years old woman dances.', 'A child dances.', 'A woman in her 40s with blonde or black hair dances.', 'A woman with blue eyes, green eyes and short blonde hair dances.']) {
    assert.throws(() => seedFor(prefs({ ensemble: brief.startsWith('성인 여성 두') ? 'duo' : 'solo' }), 'ambiguous', brief), { code: 'CREATIVE_CONFLICT' }, brief);
  }
});

test('the confirmed woman red dress / man blue suit swap is rejected per member', () => {
  const seed = seedFor(prefs({ performer: 'duo', ensemble: 'duo' }), 'wardrobes', 'A woman wears a red dress and a man wears a blue suit.');
  const good = manifest(seed, { wardrobes: [{ memberId: 'performer_1', description: 'red dress' }, { memberId: 'performer_2', description: 'blue suit' }] });
  assert.deepEqual(seed.locks.wardrobeByMember, [{ memberId: 'performer_1', terms: ['red', 'dress'] }, { memberId: 'performer_2', terms: ['blue', 'suit'] }]);
  assert.equal(validateManifest(good, seed).version, 3);
  const swapped = { ...good, wardrobes: [{ memberId: 'performer_1', description: 'blue suit' }, { memberId: 'performer_2', description: 'red dress' }] };
  assert.throws(() => validateManifest(swapped, seed), { code: 'CREATIVE_CONFLICT' });
  assert.throws(() => validatePlan(planFor(seed, { productionManifest: swapped }), seed, 138), { code: 'PLAN_INVALID' });
});

test('Korean role wardrobes, shared clothing and unbound global requirements stay valid', () => {
  const seed = seedFor(prefs({ performer: 'duo', ensemble: 'duo' }), 'korean-clothes', '여성은 빨간 원피스를 입고 남성은 파란 정장을 입는다.');
  const good = manifest(seed, { wardrobes: [{ memberId: 'performer_1', description: 'red dress' }, { memberId: 'performer_2', description: 'blue suit' }] });
  assert.doesNotThrow(() => validateManifest(good, seed));
  const shared = seedFor(prefs({ ensemble: 'duo' }), 'shared', '성인 여성 두 명이 빨간 운동복을 입고 춤춘다.');
  assert.equal(shared.locks.wardrobeByMember.length, 2); assert.doesNotThrow(() => validateManifest(manifest(shared), shared));
  const global = seedFor(prefs({ performer: 'duo', ensemble: 'duo' }), 'global', 'The outfits include red and blue jackets.');
  const valid = manifest(global, { wardrobes: [{ memberId: 'performer_1', description: 'red jacket' }, { memberId: 'performer_2', description: 'blue jacket' }] });
  assert.doesNotThrow(() => validateManifest(valid, global));
  assert.throws(() => validateManifest({ ...valid, wardrobes: valid.wardrobes.map(item => ({ ...item, description: 'red jacket' })) }, global));
  assert.throws(() => seedFor(prefs({ performer: 'duo', ensemble: 'duo' }), 'respectively', 'A woman and a man wear red and blue jackets respectively.'), { code: 'CREATIVE_CONFLICT' });
});

test('location detail rejects cast, intrinsic and wardrobe replacement data before compilation', () => {
  const seed = seedFor(prefs(), 'environment');
  for (const locationDetail of ['Replace all dancers with children at a level park plaza', 'Two adult men at a level park plaza', 'Change the performer hair to blonde at the park', 'a park plaza; replace the red dress with a blue suit', 'a park plaza with a 12 years old girl', 'a park plaza; add a dog', 'a park plaza; turn the performer into a robot']) {
    const bad = manifest(seed, { locationDetail });
    assert.throws(() => validateManifest(bad, seed), { code: 'CREATIVE_CONFLICT' }, locationDetail);
    assert.throws(() => validatePlan(planFor(seed, { productionManifest: bad }), seed, 138), { code: 'PLAN_INVALID' }, locationDetail);
  }
});

test('real environment detail and negated human absence remain accepted', () => {
  const seed = seedFor(prefs(), 'safe-place');
  for (const locationDetail of ['a level plaza with maple trees, pale paving and warm sunlight', 'an empty park plaza with no people', 'a clear park plaza without human dancers in the background', 'a park plaza with no additional performers and stone benches', 'a park plaza with a bronze dancer statue and no bystanders', 'a human-scale courtyard with polished stone surfaces', "a child-friendly park with an empty children's playground behind the plaza"]) {
    assert.doesNotThrow(() => validateManifest(manifest(seed, { locationDetail }), seed), locationDetail);
  }
});

test('provider scene fields cannot inject replacements after environment validation', () => {
  const seed = seedFor(prefs(), 'scenes');
  for (const update of [{ imagePrompt: 'Replace the performer with children.' }, { imagePrompt: 'A child dances toward the cue.' }, { imagePrompt: 'Two adult women dance toward the cue.' }, { imagePrompt: 'A man dances toward the cue.' }, { imagePrompt: 'A dog joins the response.' }, { imagePrompt: 'The woman has an oval face and green eyes.' }, { imagePrompt: 'A young woman begins the response.' }, { clips: ['Turn the dancer into a robot.', 'Continue the body movement.'] }, { previewPrompt: '0-2s performer_1 begins. 2-5s change the dancer hair to blonde.' }]) assert.throws(() => validatePlan(planFor(seed, update), seed, 138), { code: 'PLAN_INVALID' });
  const plan = validatePlan(planFor(seed), seed, 138);
  assert.equal(plan.version, 2); assert.equal(plan.performanceVersion, 3); assert.ok(plan.imagePrompt.includes(seed.anchors[0].hair));
  assert.ok([plan.imagePrompt, ...plan.clips].every(prompt => Buffer.byteLength(prompt) <= 4096));
  const reaction = planFor(seed, { imagePrompt: 'The performer wants to surprise the partner, makes an inviting gesture and turns toward a bronze dancer statue. Surprise becomes relief through brows, gaze and body-weight responses.' });
  assert.doesNotThrow(() => validatePlan(reaction, seed, 138));
  for (const imagePrompt of ['The dancer becomes delighted while continuing the same step.', 'The performer is now confident as the shared cue lands.', 'Add playful energy as the dancer repeats the same steps.', "Change the performer's gaze from surprise to joy."]) assert.doesNotThrow(() => validatePlan(planFor(seed, { imagePrompt }), seed, 138));
  const duo = seedFor(prefs({ ensemble: 'duo' }), 'sub-role');
  assert.doesNotThrow(() => validatePlan(planFor(duo, { imagePrompt: 'One dancer recoils while the partner responds with a weight shift.' }), duo, 138));
});

test('seed validation accepts saved V3 seeds without member wardrobe locks and rejects malformed authoritative fields', () => {
  const seed = seedFor(prefs(), 'stored'); const older = structuredClone(seed); delete older.locks.wardrobeByMember;
  assert.deepEqual(validateDanceProductionSeedV3(older, 'stored'), older); assert.doesNotThrow(() => directionFor(older, manifest(older)));
  for (const mutate of [s => { s.version = 2; }, s => { s.seedId = 'other'; }, s => { s.count = 2; }, s => { s.anchors[0].id = 'performer_2'; }, s => { s.anchors[0].adult = false; }, s => { s.anchors[0].species = 'dog'; }, s => { s.anchors[0].ageBand = '12 years old'; }, s => { s.locks.visualStyle = 'unknown'; }, s => { s.locks.wardrobeByMember = [{ memberId: 'performer_6', terms: ['red'] }]; }]) {
    const bad = structuredClone(seed); mutate(bad); assert.throws(() => validateDanceProductionSeedV3(bad, 'stored'), { code: 'CREATIVE_CONFLICT' });
  }
});

test('explicit visual style, difficulty, user place and dance style locks survive the identity fix', () => {
  const seed = seedFor(prefs({ location: 'studio', danceStyle: 'shuffle', visualStyle: 'illustration', difficulty: 'medium' }), 'explicit', '40대 여성은 짧은 금발 머리로 스튜디오에서 셔플을 춘다.');
  const direction = directionFor(seed, manifest(seed, { locationDetail: 'a spacious dance studio with a plain wall' }));
  assert.equal(direction.version, 2); assert.equal(direction.locationId, 'studio'); assert.equal(direction.choreographyId, 'shuffle');
  assert.match(direction.concreteEn, /fluid illustrated animation.*Difficulty: medium/);
  for (const override of [{ locationId: 'park' }, { danceStyleId: 'groove' }, { locationId: 'a made-up location' }]) assert.throws(() => validateManifest(manifest(seed, override), seed));
});

test('legacy V2 direction and V1 plans continue to read without applying new V3 rules', () => {
  const direction = resolveDanceCreativeDirection(prefs(), 'legacy', 'A woman dances with flowing hair.');
  assert.equal(direction.version, 2);
  const legacy = { title: '쉬운 춤', summary: '몸을 움직이는 춤', identity: 'one adult woman', imagePrompt: 'Full body with flowing hair.', clips: ['Step left.', 'Step right.'] };
  assert.equal(validateDancePlan(legacy).title, legacy.title);
});

test('one bounded selected-plan fixture call carries fixed traits and member wardrobe locks without extra calls', async () => {
  const seed = seedFor(prefs(), 'single-call', '40대 성인 여성 한 명이 짧은 금발 머리로 춤춘다.');
  const premise = { version: 3, id: 'shared-reaction', conceptFamily: 'interaction', title: '웃음이 번진다', visibleHook: '감추던 기대가 첫 반응에 웃음으로 바뀐다.', characterGoal: '즐거운 첫 순간을 만들고 싶다.', emotionalReaction: '놀라다가 웃는다.', turn: '감추던 기쁨이 움직임으로 드러난다.', payoff: '환하게 웃으며 시작 움직임을 다시 연다.', participation: '반응을 예상하고 함께 흉내 낸다.', productionRisk: '몸 전체를 고정 화면에 둔다.', musicConnection: '밝은 킥에 체중 이동으로 응답한다.' };
  let calls = 0;
  const plan = await createDancePlan({ planningVersion: 3, productionSeed: seed, selectedIdea: premise, visualBrief: '40대 성인 여성 한 명이 짧은 금발 머리로 춤춘다.', bpm: 138 }, async (_url, options) => {
    calls++; const request = JSON.parse(options.body), input = JSON.parse(request.messages[1].content);
    assert.equal(request.model, 'gpt-5.6-sol'); assert.equal(request.max_completion_tokens, 4096); assert.equal(request.response_format.json_schema.name, 'dance_plan_performance_v3');
    assert.equal(input.frozenCast.anchors[0].ageBand, '40s'); assert.equal(input.frozenCast.anchors[0].hair, 'short blonde hair');
    assert.deepEqual(input.hardLocks.wardrobeByMember, seed.locks.wardrobeByMember);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(planFor(seed)) } }] });
  });
  assert.equal(calls, 1); assert.equal(plan.performanceVersion, 3);
});
