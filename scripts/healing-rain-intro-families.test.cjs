/* eslint-disable @typescript-eslint/no-require-imports -- Offline shared catalog checks. */
'use strict';
const assert = require('node:assert/strict');
const { SCENE_IDS } = require('../shared/healing-rain/direction');
const { INTRO_FAMILY_VERSION, INTRO_FAMILIES, getIntroFamily } = require('../shared/healing-rain/intro-families');

const expectedIds = ['cloud-bed', 'lotus-bed', 'underwater-suite', 'flower-meadow', 'ancient-tree', 'lake-dome', 'aurora-conservatory', 'waterfall-garden', 'space-garden', 'pearl-shell'];
assert.equal(INTRO_FAMILY_VERSION, 'healing-rain-intro-families-v1');
assert.deepEqual(INTRO_FAMILIES.map(family => family.id), expectedIds);
assert.equal(new Set(INTRO_FAMILIES.map(family => family.worldPrompt)).size, expectedIds.length);

function assertDeepFrozen(value) {
  if (value && typeof value === 'object') {
    assert.ok(Object.isFrozen(value));
    Object.values(value).forEach(assertDeepFrozen);
  }
}
assertDeepFrozen(INTRO_FAMILIES);

let maximumPromptChars = 0;
for (const family of INTRO_FAMILIES) {
  for (const key of ['id', 'name', 'description', 'worldPrompt', 'comfortPrompt', 'motionPrompt']) {
    assert.equal(typeof family[key], 'string');
    assert.ok(family[key].trim().length > 0 && family[key].length <= 320, `${family.id}.${key} stays bounded`);
  }
  assert.ok(family.compatibleScenes.length > 0 && family.compatibleScenes.length < SCENE_IDS.length);
  assert.equal(new Set(family.compatibleScenes).size, family.compatibleScenes.length);
  assert.ok(family.compatibleScenes.every(scene => SCENE_IDS.includes(scene)));
  assert.ok(family.exclusions.length > 0 && family.exclusions.every(value => typeof value === 'string' && value.length > 0 && value.length <= 100));
  assert.ok(family.variants.length >= 3);
  assert.equal(new Set(family.variants.map(variant => variant.id)).size, family.variants.length);
  assert.equal(new Set(family.variants.map(variant => variant.compositionPrompt)).size, family.variants.length);
  assert.match(family.comfortPrompt, /adult woman sleeps comfortably/);
  assert.match(family.comfortPrompt, /eyes closed/);
  assert.match(family.comfortPrompt, /fully covered/);
  assert.match(family.comfortPrompt, /secure supported bed/);
  assert.match(family.comfortPrompt, /Warm, softly luminous low-contrast/);
  assert.match(family.motionPrompt, /15-second locked shot/);
  assert.match(family.motionPrompt, /9-second soft dissolve at 6-15s is added in editing/);
  assert.match(family.motionPrompt, /do not generate a transition or force cloud occlusion/);
  for (const variant of family.variants) {
    for (const value of Object.values(variant)) assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 150);
    const promptLength = [family.worldPrompt, family.comfortPrompt, family.motionPrompt, variant.compositionPrompt, variant.atmospherePrompt].join(' ').length;
    maximumPromptChars = Math.max(maximumPromptChars, promptLength);
    assert.ok(promptLength < 1000, `${family.id}/${variant.id} leaves room for compiler instructions`);
  }

  const original = JSON.stringify(family);
  const first = getIntroFamily(family.id);
  const second = getIntroFamily(family.id);
  assert.deepEqual(first, family);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.variants, second.variants);
  assert.notStrictEqual(first.variants[0], second.variants[0]);
  assert.notStrictEqual(first.compatibleScenes, second.compatibleScenes);
  assert.notStrictEqual(first.exclusions, second.exclusions);
  first.name = 'Changed locally';
  first.variants[0].compositionPrompt = 'Changed locally';
  first.compatibleScenes.pop();
  first.exclusions.push('Local rule');
  assert.equal(JSON.stringify(family), original);
  assert.deepEqual(second, family);
  assert.deepEqual(getIntroFamily(family.id), family);
}

assert.throws(() => { INTRO_FAMILIES.push({}); }, TypeError);
assert.throws(() => { INTRO_FAMILIES[0].variants[0].name = 'Changed'; }, TypeError);
for (const invalidId of [undefined, null, 0, {}, [], true, '', 'cloud', 'CLOUD-BED', ' cloud-bed ', '__proto__', 'constructor']) {
  assert.throws(() => getIntroFamily(invalidId), error => error instanceof Error && error.code === 'episode_invalid');
}
assert.match(getIntroFamily('underwater-suite').worldPrompt, /sealed, dry, warm/);
assert.match(getIntroFamily('underwater-suite').motionPrompt, /two or three distant fish drift slowly/);
assert.match(getIntroFamily('space-garden').worldPrompt, /normal gravity and a solid floor/);
assert.equal(new Set(INTRO_FAMILIES.flatMap(family => family.compatibleScenes)).size, SCENE_IDS.length);

console.log(`healing-rain intro families: 10 themes, 30 variants; checks passed; maximum source prompt ${maximumPromptChars} chars`);
