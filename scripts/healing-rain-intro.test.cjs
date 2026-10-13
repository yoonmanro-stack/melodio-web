/* eslint-disable @typescript-eslint/no-require-imports -- Offline shared candidate compiler checks. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const directionModule = require('../shared/healing-rain/direction');
const { buildDirection, compileDirection, SCENE_IDS } = directionModule;
const { INTRO_VERSION, INTRO_RECIPE_ID, INTRO_CATALOG, buildIntroSpec } = require('../shared/healing-rain/intro');
const defaults = { sceneId: 'train', intensity: 'downpour', thunder: 'none', camera: 'bedside', palette: 'midnight', variation: 0, title: '비 내리는 침대 열차', hours: 10, takes: 6, notes: '' };
const copy = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const input = freeze(copy(defaults));
const main = freeze(buildDirection(input));
const original = JSON.stringify(main);
const spec = buildIntroSpec(main, input);
assert.equal(JSON.stringify(main), original, 'building an intro never edits the canonical main direction');
assert.deepEqual(spec, buildIntroSpec(main, input), 'same inputs produce the same serializable candidate');
assert.deepEqual(copy(spec), spec);
assert.equal(spec.version, INTRO_VERSION);
assert.equal(spec.recipeId, INTRO_RECIPE_ID);
assert.equal(spec.productionEligible, false);
assert.equal(spec.status, 'candidate');
assert.equal(spec.qa.status, 'unreviewed');
assert.equal(spec.qa.productionReady, false);
assert.equal(spec.qa.automaticChecksGuaranteeNaturalness, false);
assert.ok(spec.qa.checks.every(check => check.status === 'unreviewed'));
assert.equal(spec.introRecipe.referenceContract.required, true);
assert.equal(spec.introRecipe.referenceContract.generationBlockedWithoutReference, true);
assert.equal(spec.introRecipe.referenceContract.sameReferenceAsMain, true);
assert.equal(spec.introRecipe.referenceContract.role, 'main-body-source-image');
assert.equal(spec.introRecipe.referenceEyeState, 'asleep');
assert.match(spec.introRecipe.videoPrompt, /eyes remain closed throughout/);
assert.doesNotMatch(spec.introRecipe.videoPrompt, /eyelids gently close once/);
assert.match(spec.introRecipe.videoPrompt, /do not generate the train/);
assert.match(spec.introRecipe.imagePrompt, /same adult woman/);
assert.match(spec.introRecipe.imagePrompt, /bed and resting woman anchored on the left/);
assert.match(spec.introRecipe.imagePrompt, /right-side background/);
assert.match(spec.introRecipe.imagePrompt, /Low shielded warm light/);
assert.equal(spec.transitionContract.generatedMorph, false);
assert.equal(spec.transitionContract.method, 'postproduction-dissolve');
assert.deepEqual(spec.transitionContract.fixedAnchors, spec.introRecipe.referenceContract.preserve);
assert.match(spec.transitionContract.acceptance, /Reject double faces/);
const canonical = compileDirection(main, input);
assert.equal(spec.mainRecipe.imagePrompt, canonical.image);
assert.equal(spec.mainRecipe.videoPrompt, canonical.video);
assert.deepEqual(spec.mainRecipe.direction, main);
assert.deepEqual(spec.mainRecipe.loop, main.loop);
assert.equal(spec.mainRecipe.loop.cycleSeconds, 10);
assert.equal(spec.mainRecipe.loop.reversePlayback, false);
assert.equal(spec.mainRecipe.introIncludedInLoop, false);

// Check actual frame coverage, overlap and source repetition independently of the duration metadata.
for (const output of spec.outputs) {
  const fps = main.loop.fps;
  let introFrames = 0;
  let mainFrames = 0;
  let overlapFrames = 0;
  let introEntries = 0;
  let wasIntro = false;
  for (let frame = 0; frame < output.totalFrames; frame += 1) {
    const seconds = frame / fps;
    const inIntro = seconds >= output.intro.startSeconds && seconds < output.intro.endSeconds;
    const inMain = seconds >= output.main.startSeconds && seconds < output.main.endSeconds;
    assert.ok(inIntro || inMain, `no uncovered frame at ${frame}`);
    if (inIntro && !wasIntro) introEntries += 1;
    if (inIntro) introFrames += 1;
    if (inMain) mainFrames += 1;
    if (inIntro && inMain) overlapFrames += 1;
    wasIntro = inIntro;
  }
  assert.equal(introEntries, 1, 'intro has exactly one continuous appearance');
  assert.equal(introFrames, spec.introRecipe.sourceSeconds * fps);
  assert.equal(overlapFrames, spec.transitionContract.durationSeconds * fps);
  assert.equal(mainFrames, output.main.playbackFrames);
  assert.equal(introFrames + mainFrames - overlapFrames, output.totalFrames);
  assert.equal(output.totalFrames / fps, output.totalSeconds);
  assert.equal(output.main.endSeconds, output.totalSeconds);
  assert.equal(output.main.startSeconds, spec.transitionContract.startSeconds);
  assert.equal(output.transition.endSeconds, spec.introRecipe.sourceSeconds);
  assert.equal(output.intro.occurrences, 1);
  assert.equal(output.intro.loop, false);
  assert.equal(output.main.sourceStartSeconds, 0);
  assert.equal(output.main.reversePlayback, false);
  assert.ok(output.main.repeatCount * output.main.cycleSeconds >= output.main.playbackSeconds, 'enough main cycles exist to cover output');
  assert.ok((output.main.repeatCount - 1) * output.main.cycleSeconds < output.main.playbackSeconds, 'do not budget an extra main cycle');
  const equation = output.durationEquation;
  assert.equal(equation.introSeconds + equation.mainSeconds - equation.overlapSeconds, output.totalSeconds);
}
assert.deepEqual(spec.outputs.map(output => output.totalSeconds), [30, 180]);
assert.deepEqual(spec.outputs.map(output => output.main.playbackSeconds), [17.5, 167.5]);
assert.deepEqual(spec.outputs.map(output => output.main.repeatCount), [2, 17]);
let previousEnd = 0;
for (const shot of spec.introRecipe.shots) {
  assert.equal(shot.startSeconds, previousEnd, 'shot timeline has no gap or accidental overlap');
  assert.ok(shot.endSeconds > shot.startSeconds);
  previousEnd = shot.endSeconds;
}
assert.equal(previousEnd, spec.introRecipe.sourceSeconds);
assert.equal(spec.audio.startSeconds, 0);
assert.equal(spec.audio.silentGapSeconds, 0);
assert.equal(spec.audio.restartAtTransition, false);
assert.equal(spec.audio.continuousThroughTransition, true);
assert.equal(spec.audio.introGeneratedAudio, false);
assert.equal(spec.audio.fadeIn.startSeconds, 0);
assert.ok(spec.audio.fadeIn.endSeconds > 0 && spec.audio.fadeIn.endSeconds < spec.transitionContract.startSeconds);
assert.equal(spec.audio.levelRamp.startSeconds, 0);
assert.equal(spec.audio.levelRamp.endSeconds, spec.transitionContract.endSeconds);
assert.ok(spec.audio.levelRamp.startGainDb < spec.audio.levelRamp.endGainDb);
assert.equal(spec.audio.abruptLevelStepAllowed, false);

const awake = buildIntroSpec(main, { ...input, referenceEyeState: 'awake', outputSeconds: [30] });
assert.match(awake.introRecipe.videoPrompt, /eyelids gently close once during seconds 2-5/);
assert.match(awake.introRecipe.imagePrompt, /already reclining comfortably/);
assert.doesNotMatch(awake.introRecipe.videoPrompt, /eyes remain closed throughout/);
assert.deepEqual(awake.outputs.map(output => output.totalSeconds), [30]);
const reverseOrder = freeze({ ...input, outputSeconds: [180, 30] });
assert.deepEqual(buildIntroSpec(main, reverseOrder).outputs.map(output => output.totalSeconds), [180, 30]);
for (const patch of [{ introRecipeId: 'unknown' }, { referenceEyeState: 'unknown' }, ...[null, 30, [], [10], [30, 30], [30, 180, 180], ['30'], [Infinity], [30.5]].map(outputSeconds => ({ outputSeconds }))]) {
  assert.throws(() => buildIntroSpec(main, { ...input, ...patch }), error => error.code === 'HEALING_RAIN_INTRO_INVALID');
}
assert.throws(() => buildIntroSpec(main, { ...input, palette: 'amber' }), error => error.issues.some(issue => issue.code === 'input-provenance'));
for (const mutate of [value => { value.fixed.subject.face = 'moving'; }, value => { value.verification.status = 'passed'; }, value => { value.loop.reversePlayback = true; }]) {
  const changed = copy(main);
  mutate(changed);
  assert.throws(() => buildIntroSpec(changed, input), error => error.code === 'HEALING_RAIN_DIRECTION_INVALID');
}
for (const bad of [null, {}, [], 'main']) assert.throws(() => buildIntroSpec(bad, input), error => error.code === 'HEALING_RAIN_DIRECTION_INVALID');
for (const bad of [null, {}, [], 'input']) assert.throws(() => buildIntroSpec(main, bad), error => error.code === 'HEALING_RAIN_DIRECTION_INVALID');
assert.deepEqual(INTRO_CATALOG.map(item => item.sceneId), SCENE_IDS);
assert.equal(INTRO_CATALOG.filter(item => item.status === 'candidate').length, 1);
assert.equal(INTRO_CATALOG.filter(item => item.status === 'idea-only').length, 9);
for (const sceneId of SCENE_IDS.filter(id => id !== 'train')) {
  const otherInput = { ...input, sceneId };
  assert.throws(() => buildIntroSpec(buildDirection(otherInput), otherInput), error => error.code === 'HEALING_RAIN_INTRO_INVALID');
  assert.equal(INTRO_CATALOG.find(item => item.sceneId === sceneId).recipeId, null);
}
// Mutating a candidate cannot change its source direction or a future candidate.
spec.mainRecipe.direction.fixed.camera.mode = 'changed';
spec.mainRecipe.loop.cycleSeconds = 1;
spec.provenance.mainInput.palette = 'changed';
spec.qa.status = 'passed';
assert.equal(JSON.stringify(main), original);
assert.equal(buildIntroSpec(main, input).qa.status, 'unreviewed');

let maxImage = 0;
let maxVideo = 0;
let combinations = 0;
for (const intensity of ['gentle', 'moderate', 'heavy', 'downpour']) for (const camera of ['wide', 'window', 'bedside']) for (const palette of ['amber', 'linen', 'midnight']) for (const variation of [0, 3]) for (const referenceEyeState of ['asleep', 'awake']) {
  const variedInput = { ...input, intensity, camera, palette, variation, referenceEyeState };
  const variedMain = buildDirection(variedInput);
  const varied = buildIntroSpec(variedMain, variedInput);
  assert.ok(varied.introRecipe.imagePrompt.length < 1500);
  assert.ok(varied.introRecipe.videoPrompt.length < 1500);
  assert.equal(varied.qa.status, 'unreviewed');
  assert.deepEqual(varied.mainRecipe.direction, variedMain);
  maxImage = Math.max(maxImage, varied.introRecipe.imagePrompt.length);
  maxVideo = Math.max(maxVideo, varied.introRecipe.videoPrompt.length);
  combinations += 1;
}
const source = fs.readFileSync(path.join(__dirname, '../shared/healing-rain/intro.js'), 'utf8');
assert.ok(!/\bprocess\.|\bBuffer\b|Date\.|Math\.random|fetch\(/.test(source), 'candidate is deterministic and has no network or environment access');
const context = { module: { exports: {} }, require(name) { assert.equal(name, './direction'); return directionModule; } };
vm.runInNewContext(source, context);
assert.equal(context.module.exports.buildIntroSpec(main, input).introRecipe.videoPrompt, buildIntroSpec(main, input).introRecipe.videoPrompt);
console.log(`PASS: ${combinations} train candidates; exact frame coverage for 30s/180s; source provenance, single intro, forward main loop, continuous audio, reference eye states, idea-only restrictions, immutable main and unreviewed QA; prompts ${maxImage}/${maxVideo} characters.`);
