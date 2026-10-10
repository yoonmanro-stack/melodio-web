/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline V3 opening geometry and natural animal identities; no provider, audio or media requests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const local = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', 'process', 'fetch', code)(local, mod, mod.exports, { env: {} }, () => { throw Error('NETWORK_FORBIDDEN'); });
  return mod.exports;
}
const { DANCE_PRODUCTION_LAYOUTS: layouts, resolveDanceProductionSeedV3: seedFor, validateDanceProductionSeedV3: validateSeed,
  resolveDanceProductionDirectionV3: directionFor, validateDanceProductionManifestV3: validateManifest, resolveDanceCreativeDirection } = load('src/lib/dance/creativeDirection.ts');
const { validateDancePerformancePlanV3: validatePlan } = load('src/lib/dance/videoPlan.ts');
const { DANCE_SPECIES_ANATOMY } = load('src/lib/dance/cast.ts');
const baseCoats = { cat: 'grey cat, white paws', dog: 'black-white dog', penguin: 'penguin, yellow cheeks', otter: 'brown otter, cream muzzle',
  bear: 'brown bear, cream muzzle', rabbit: 'cream rabbit, short ears', fox: 'orange fox, white muzzle' };
const preferences = (overrides = {}) => ({ performer: 'human_animal', ensemble: 'trio', species: 'penguin', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy', ...overrides });
const mixedBrief = '성인 여성 한 명과 펭귄 두 마리가 함께 공연한다.';
function manifest(seed, layoutId = seed.hints.layoutId, description = 'plain neutral styling') {
  return { version: 3, locationId: seed.locks.locationId || 'park', danceStyleId: seed.locks.danceStyleId || 'groove', layoutId,
    locationDetail: 'a level park plaza with warm light and no bystanders', wardrobes: seed.anchors.map(anchor => ({ memberId: anchor.id, description })) };
}
function rawPlan(seed, layoutId) {
  const actors = second => seed.anchors.map(anchor => ({ memberId: anchor.id, action: second ? '몸통 흔들기' : anchor.species === 'penguin' || anchor.kind === 'human' ? '발 옆 딛기' : '앞발 딛기' }));
  return { version: 3, seedId: seed.seedId, productionManifest: manifest(seed, layoutId), title: '닫히는 길', summary: '좁아지는 길에서 발걸음과 몸통의 반응이 이어진다.',
    imagePrompt: 'The lead approaches the separated pair with clear space to react and continuous native movement.',
    previewPrompt: `0-2s: ${seed.anchors.map(anchor => anchor.id).join(',')} begin native steps. 2-5s: the lead yields as the pair moves closer, keeping every body visible.`,
    clips: ['0s-15s: the pair narrows the gap and the lead steps around them.', '15s-30s: continue the actual ending positions and develop the same response.'],
    choreography: { hookName: '길을 찾는 발걸음', firstPose: '발을 옆으로 딛고 몸통을 기울인다.', endPose: '몸통을 돌리고 발을 모은다.',
      steps: [{ count: 4, action: '첫 동작', focus: 'feet', actors: actors(false) }, { count: 4, action: '다음 동작', focus: 'body', actors: actors(true) }],
      segments: [{ startSeconds: 0, endSeconds: 2, phase: 'opening', action: '발을 옆으로 딛고 몸통을 기울인다.', repeatHook: true },
        { startSeconds: 2, endSeconds: 22, phase: 'development', action: '몸통을 돌리고 발을 반대로 딛는다.', repeatHook: true },
        { startSeconds: 22, endSeconds: 28, phase: 'payoff', action: '발을 중앙에 딛고 몸통을 펼친다.', repeatHook: true },
        { startSeconds: 28, endSeconds: 30, phase: 'restart', action: '몸통을 낮추고 고개를 돌린다.', repeatHook: true }] } };
}

test('new trio layouts establish the requested opening slots while existing layouts and default stay unchanged', () => {
  assert.deepEqual(layouts.reverse_triangle.counts, [3]); assert.deepEqual(layouts.reverse_triangle.positions, ['rear-center', 'front-left', 'front-right']);
  assert.deepEqual(layouts.centered_trio.counts, [3]); assert.deepEqual(layouts.centered_trio.positions, ['center', 'left', 'right']);
  assert.deepEqual(layouts.open_triangle, { counts: [3], formation: 'open triangle', positions: ['front-center', 'rear-left', 'rear-right'] });
  assert.deepEqual(layouts.side_by_side, { counts: [2], formation: 'separated left/right pair', positions: ['left', 'right'] });
  const seed = seedFor(preferences(), 'new-layouts', mixedBrief); assert.equal(seed.hints.layoutId, 'open_triangle'); assert.equal(seed.locks.layoutId, null);
  for (const layoutId of ['reverse_triangle', 'centered_trio']) {
    const plan = validatePlan(rawPlan(seed, layoutId), seed, 138);
    assert.deepEqual(plan.cast.members.map(member => member.position), layouts[layoutId].positions);
    assert.deepEqual(plan.cast.members.map(member => [member.id, member.species]), [['performer_1', 'human'], ['performer_2', 'penguin'], ['performer_3', 'penguin']]);
    assert.equal(plan.performanceStaging, 'initial'); assert.ok(plan.imagePrompt.includes(seed.anchors[1].coat));
    assert.ok([plan.imagePrompt, ...plan.clips].every(prompt => Buffer.byteLength(prompt) <= 4096));
  }
  for (const count of [2, 4, 6]) {
    const seed = seedFor(preferences({ performer: 'animal', ensemble: count === 2 ? 'duo' : 'crowd' }), `wrong-count-${count}`, `펭귄 ${count}마리`);
    for (const layoutId of ['reverse_triangle', 'centered_trio']) assert.throws(() => validateManifest(manifest(seed, layoutId), seed), { code: 'CREATIVE_CONFLICT' });
  }
});

test('same-species animals get distinct major natural adult body and coat cues rather than accessory-only identities', () => {
  for (const species of Object.keys(baseCoats)) {
    const seed = seedFor(preferences({ performer: 'animal', ensemble: 'crowd', species }), `natural-${species}`, '동물 여섯 마리가 함께 공연한다.');
    assert.equal(seed.count, 6); assert.equal(new Set(seed.anchors.map(anchor => anchor.coat)).size, 6);
    for (const [index, anchor] of seed.anchors.entries()) {
      assert.equal(anchor.id, `performer_${index + 1}`); assert.equal(anchor.species, species); assert.equal(anchor.kind, 'animal');
      assert.equal(anchor.gender, 'none'); assert.equal(anchor.adult, false); assert.equal(anchor.movementAnatomy, DANCE_SPECIES_ANATOMY[species]);
      assert.match(anchor.coat, /^adult /); assert.match(anchor.coat, /(?:tall|short|large|small|long|medium).*(?:body)/);
      assert.doesNotMatch(anchor.coat, /collar|band|hat|jacket|plush|toy|human|arms|hands|knees|pelvis/);
      assert.ok(anchor.coat.length <= 78, `${species} marker must leave room for full wardrobe`);
    }
    const direction = directionFor(seed, manifest(seed, 'staggered_rows', 'neutral unobstructing styling'.padEnd(60, 'x')));
    assert.ok(direction.cast.members.every(member => member.identity.length <= 140));
    assert.deepEqual(validateSeed(seed), seed);
  }
});

test('mixed cast keeps human identity and native roles while the two penguins have persistent major distinctions', () => {
  const seed = seedFor(preferences(), 'mixed-natural', mixedBrief);
  assert.equal(seed.anchors[0].kind, 'human'); assert.equal(seed.anchors[0].gender, 'woman'); assert.equal(seed.anchors[0].adult, true);
  assert.ok(seed.anchors[0].face && seed.anchors[0].hair); assert.equal(seed.anchors[0].coat, null);
  assert.notEqual(seed.anchors[1].coat, seed.anchors[2].coat);
  assert.ok(seed.anchors.slice(1).every(anchor => anchor.movementAnatomy === 'penguin_biped' && anchor.coat.length <= 78));
  assert.deepEqual(seedFor(preferences(), 'mixed-natural', mixedBrief), seed, 'new appearance facts remain deterministic and immutable');
});

test('single animal default coats and explicitly identical or twin animal requests do not gain forced variation', () => {
  for (const species of Object.keys(baseCoats)) {
    const solo = seedFor(preferences({ performer: 'animal', ensemble: 'solo', species }), `solo-${species}`);
    assert.equal(solo.anchors[0].coat, baseCoats[species]);
  }
  for (const brief of ['Two identical penguins perform together.', 'Two twin penguins perform together.', 'Two penguins are twins.', 'Penguin twins perform together.',
    'Two penguins, identical in appearance, perform together.', 'Two penguins with identical appearances perform together.',
    '두 마리의 쌍둥이 펭귄이 함께 공연한다.', '똑같이 생긴 펭귄 두 마리가 함께 공연한다.', '동일하게 생긴 펭귄 두 마리가 함께 공연한다.']) {
    const seed = seedFor(preferences({ performer: 'animal', ensemble: 'duo' }), 'identical', brief);
    assert.deepEqual(seed.anchors.map(anchor => anchor.coat), [baseCoats.penguin, baseCoats.penguin], brief);
  }
  const matchingClothes = seedFor(preferences({ performer: 'animal', ensemble: 'duo' }), 'matching-clothes', 'Both penguins wear identical jackets.');
  assert.notEqual(matchingClothes.anchors[0].coat, matchingClothes.anchors[1].coat, 'identical clothes do not imply identical bodies');
});

test('recognized explicit intrinsic and wardrobe locks override new defaults before a production manifest exists', () => {
  const intrinsic = seedFor(preferences({ performer: 'animal', ensemble: 'duo', species: 'dog' }), 'explicit-coats', 'Two dogs perform together. Both dogs have brown fur. Both dogs wear red jackets.');
  assert.deepEqual(intrinsic.anchors.map(anchor => anchor.coat), ['brown dog', 'brown dog']);
  assert.deepEqual(intrinsic.locks.wardrobeByMember.map(lock => lock.terms), [['red', 'jacket'], ['red', 'jacket']]);
  assert.doesNotThrow(() => validateManifest(manifest(intrinsic, 'side_by_side', 'red jacket'), intrinsic));
  assert.equal(intrinsic.count, 2);
});

test('actual four/six animal V3 plans retain strict native matrices and all prompt byte caps with larger markers', () => {
  for (const count of [4, 6]) {
    const seed = seedFor(preferences({ performer: 'animal', ensemble: 'crowd' }), `crowd-${count}`, `펭귄 ${count}마리가 함께 공연한다.`);
    const plan = validatePlan(rawPlan(seed, 'staggered_rows'), seed, 138);
    assert.equal(plan.cast.count, count); assert.equal(new Set(seed.anchors.map(anchor => anchor.coat)).size, count);
    assert.ok(plan.choreography.steps.every(step => step.actors.length === count));
    assert.ok([plan.imagePrompt, ...plan.clips].every(prompt => Buffer.byteLength(prompt) <= 4096));
  }
});

test('saved old base-coat seeds round-trip without new-marker adaptation and legacy direction bytes stay identical', () => {
  const saved = seedFor(preferences(), 'saved-old-seed', mixedBrief);
  saved.anchors.filter(anchor => anchor.kind === 'animal').forEach(anchor => { anchor.coat = baseCoats[anchor.species]; });
  const before = structuredClone(saved), direction = directionFor(saved, manifest(saved));
  assert.deepEqual(saved, before); assert.deepEqual(validateSeed(saved), before);
  assert.deepEqual(direction.cast.members.filter(member => member.kind === 'animal').map(member => member.identity), ['penguin, yellow cheeks; plain neutral styling', 'penguin, yellow cheeks; plain neutral styling']);
  // Captured from deployed commit 8c9b9615 with these same arguments.
  const legacy = resolveDanceCreativeDirection(preferences(), 'legacy-opening-compatibility', mixedBrief);
  assert.equal(createHash('sha256').update(JSON.stringify(legacy)).digest('hex'), '6689028cf06800fe71ed679d424949f690af1e4c54862d22b59101ce2d9abc01');
});
