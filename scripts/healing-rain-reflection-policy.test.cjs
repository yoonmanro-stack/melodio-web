/* eslint-disable @typescript-eslint/no-require-imports -- Offline candidate compiler checks. */
'use strict';
const assert = require('node:assert/strict');
const { SCENE_IDS, buildDirection, compileDirection } = require('../shared/healing-rain/direction');
const { buildMotionCandidate } = require('../shared/healing-rain/motion-strategy');
const { buildReflectionCandidate } = require('../shared/healing-rain/reflection-policy');
const base = { sceneId:'train', intensity:'downpour', thunder:'none', camera:'bedside', palette:'amber', variation:0, title:'유리 반사광 검수', hours:10, takes:6, notes:'' };
let cases = 0, maxLength = 0;
for (const sceneId of SCENE_IDS) for (const intensity of ['gentle','moderate','heavy','downpour']) {
  const input = { ...base, sceneId, intensity };
  const direction = buildDirection(input), snapshot = JSON.stringify(direction);
  const result = buildReflectionCandidate(direction, input);
  const hasGlass = ['train','cabin'].includes(sceneId);
  assert.equal(result.lightingRoles.applicable, hasGlass);
  assert.equal(result.sourceImageReview.beforeVideoSubmission, hasGlass);
  assert.equal(JSON.stringify(direction), snapshot);
  assert.equal(result.review.automaticApproval, false);
  assert.ok(result.prompts.video.length <= 1500);
  if (hasGlass) {
    assert.equal(result.lightingRoles.glassReflection.referenceFrame, 'interior');
    assert.equal(result.lightingRoles.exteriorLights.referenceFrame, 'exterior');
    assert.match(result.prompts.image, /barely visible, diffuse and low contrast/);
    assert.doesNotMatch(result.prompts.video, /Preserve the source photograph’s lighting|light sources stay steady/);
    assert.ok(result.review.checks.length > 0);
  } else {
    assert.deepEqual(result.prompts, { image:compileDirection(direction,input).image, video:buildMotionCandidate(direction,input).video.input.prompt });
  }
  if (sceneId === 'train') {
    assert.ok(result.prompts.video.startsWith('The train is already traveling'));
    assert.match(result.prompts.video, /RIGHT TO LEFT.*1–2s/);
    assert.equal(result.lightingRoles.exteriorLights.presence, 'few-faint-distant');
  }
  maxLength = Math.max(maxLength, result.prompts.video.length); cases++;
}
const direction = buildDirection(base);
assert.throws(() => buildReflectionCandidate(direction,{...base,palette:'linen'}));
assert.throws(() => buildReflectionCandidate({...direction,profiles:['glass-rain']},base));
console.log(`PASS: ${cases} scene/intensity cases; source review gate, lighting frames, unchanged non-glass scenes, retained travel, provenance; max video ${maxLength} chars.`);
