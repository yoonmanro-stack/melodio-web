/* eslint-disable @typescript-eslint/no-require-imports -- Offline shared candidate compiler checks. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const directionModule = require('../shared/healing-rain/direction');
const { buildDirection, compileDirection, SCENE_IDS } = directionModule;
const { INTRO_VERSION, INTRO_RECIPE_ID, TEMPLE_INTRO_RECIPE_ID, INTRO_CATALOG, buildIntroSpec } = require('../shared/healing-rain/intro');
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
function verifyTimelineAndAudio(spec, main) {
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
}
verifyTimelineAndAudio(spec, main);

const templeInput = freeze({ ...defaults, sceneId: 'mountain-temple', variation: 2, title: '고요한 산사' });
const templeMain = freeze(buildDirection(templeInput));
const templeOriginal = JSON.stringify(templeMain);
const temple = buildIntroSpec(templeMain, templeInput);
const templeCanonical = compileDirection(templeMain, templeInput);
assert.equal(temple.recipeId, TEMPLE_INTRO_RECIPE_ID);
assert.equal(temple.recipeId, 'cloud-temple-to-rain');
assert.equal(temple.status, 'candidate');
assert.equal(temple.productionEligible, false);
assert.equal(temple.qa.productionReady, false);
assert.equal(temple.qa.automaticChecksGuaranteeNaturalness, false);
assert.equal(temple.qa.representativePassCoversOtherScenes, false);
assert.ok(temple.qa.checks.every(check => check.status === 'unreviewed'));
assert.deepEqual(temple, buildIntroSpec(templeMain, templeInput));
assert.deepEqual(copy(temple), temple);
assert.equal(temple.introRecipe.people, 'none');
assert.equal(templeMain.fixed.people, 'none');
assert.equal(templeMain.fixed.subject, null);
assert.equal('referenceEyeState' in temple.introRecipe, false);
assert.equal('eyeStateRule' in temple.introRecipe.referenceContract, false);
assert.doesNotMatch(JSON.stringify([temple.introRecipe, temple.transitionContract, temple.qa]), /\b(woman|face|eyes|eyelids|asleep|awake|breathing|blanket|pillow|train)\b|RIGHT TO LEFT/i, 'temple contracts do not inherit human or train constraints');
assert.equal(temple.introRecipe.referenceContract.required, true);
assert.equal(temple.introRecipe.referenceContract.generationBlockedWithoutReference, true);
assert.equal(temple.introRecipe.referenceContract.sameReferenceAsMain, true);
assert.equal(temple.introRecipe.referenceContract.role, 'main-body-source-image');
assert.equal(temple.introRecipe.referenceContract.sourceImageIsGeometryAuthority, true);
assert.equal(temple.introRecipe.referenceContract.generationBlockedWithoutVisibleAnchors, true);
assert.equal(temple.introRecipe.referenceContract.addingMissingAnchorsAllowed, false);
assert.deepEqual(temple.introRecipe.referenceContract.requiredVisibleAnchors, ['eaves', 'wooden pillars', 'stone stairway', 'single lantern']);
for (const anchor of ['eaves', 'pillars', 'stone stairway', 'lantern']) {
  assert.ok(temple.introRecipe.imagePrompt.includes(anchor));
  assert.ok(temple.introRecipe.videoPrompt.includes(anchor));
  assert.ok(temple.transitionContract.fixedAnchors.some(value => value.includes(anchor)));
}
assert.match(temple.introRecipe.imagePrompt, /supplied rainy main-body source image as the mandatory visual reference/);
assert.match(temple.introRecipe.imagePrompt, /Deep dark night/);
assert.match(temple.introRecipe.imagePrompt, /soft amber light/);
assert.match(temple.introRecipe.imagePrompt, /No people/);
assert.match(temple.introRecipe.videoPrompt, /Locked camera/);
assert.match(temple.introRecipe.videoPrompt, /do not generate a location change, morph, cut or transition/);
assert.equal(temple.introRecipe.reversePlayback, false);
assert.equal(temple.transitionContract.generatedMorph, false);
assert.equal(temple.transitionContract.method, 'postproduction-dissolve');
assert.deepEqual(temple.transitionContract.fixedAnchors, temple.introRecipe.referenceContract.preserve);
assert.match(temple.transitionContract.acceptance, /Reject doubled or drifting architecture/);
assert.match(temple.transitionContract.mainMotion, /continue forward/);
assert.equal(temple.mainRecipe.imagePrompt, templeCanonical.image);
assert.equal(temple.mainRecipe.videoPrompt, templeCanonical.video);
assert.deepEqual(temple.mainRecipe.direction, templeMain);
assert.deepEqual(temple.mainRecipe.loop, templeMain.loop);
assert.equal(temple.mainRecipe.loop.sourceSeconds, 11);
assert.equal(temple.mainRecipe.loop.cycleSeconds, 10);
assert.equal(temple.mainRecipe.loop.reversePlayback, false);
assert.equal(temple.mainRecipe.introIncludedInLoop, false);
verifyTimelineAndAudio(temple, templeMain);
const templeSample = buildIntroSpec(templeMain, { ...templeInput, introRecipeId: TEMPLE_INTRO_RECIPE_ID, outputSeconds: [30] });
assert.deepEqual(templeSample.outputs.map(output => output.totalSeconds), [30]);
assert.deepEqual(buildIntroSpec(templeMain, { ...templeInput, outputSeconds: [180, 30] }).outputs.map(output => output.totalSeconds), [180, 30]);
for (const patch of [{ introRecipeId: INTRO_RECIPE_ID }, { introRecipeId: 'unknown' }, ...['asleep', 'awake', null, 'unknown'].map(referenceEyeState => ({ referenceEyeState })), ...[null, 30, [], [10], [30, 30], [30, 180, 180], ['30'], [Infinity], [30.5]].map(outputSeconds => ({ outputSeconds }))]) {
  assert.throws(() => buildIntroSpec(templeMain, { ...templeInput, ...patch }), error => error.code === 'HEALING_RAIN_INTRO_INVALID');
}
assert.throws(() => buildIntroSpec(templeMain, { ...templeInput, palette: 'amber' }), error => error.issues.some(issue => issue.code === 'input-provenance'));
const alteredTemple = copy(templeMain);
alteredTemple.fixed.people = 'one-sleeping-adult-woman';
assert.throws(() => buildIntroSpec(alteredTemple, templeInput), error => error.code === 'HEALING_RAIN_DIRECTION_INVALID');

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
assert.equal(INTRO_CATALOG.filter(item => item.status === 'candidate').length, 2);
assert.equal(INTRO_CATALOG.filter(item => item.status === 'idea-only').length, 8);
assert.equal(INTRO_CATALOG.find(item => item.sceneId === 'train').recipeId, INTRO_RECIPE_ID);
assert.equal(INTRO_CATALOG.find(item => item.sceneId === 'mountain-temple').recipeId, TEMPLE_INTRO_RECIPE_ID);
for (const sceneId of SCENE_IDS.filter(id => !['train', 'mountain-temple'].includes(id))) {
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
temple.mainRecipe.direction.fixed.camera.mode = 'changed';
temple.mainRecipe.loop.cycleSeconds = 1;
temple.provenance.mainInput.palette = 'changed';
temple.introRecipe.referenceContract.preserve[0] = 'changed';
temple.qa.status = 'passed';
assert.equal(JSON.stringify(templeMain), templeOriginal);
const freshTemple = buildIntroSpec(templeMain, templeInput);
assert.equal(freshTemple.qa.status, 'unreviewed');
assert.notEqual(freshTemple.introRecipe.referenceContract.preserve[0], 'changed');

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
let templeCombinations = 0;
for (const intensity of ['gentle', 'moderate', 'heavy', 'downpour']) for (const camera of ['wide', 'window', 'bedside']) for (const palette of ['amber', 'linen', 'midnight']) for (const variation of [0, 1, 2, 3]) {
  const variedInput = { ...templeInput, intensity, camera, palette, variation };
  const variedMain = buildDirection(variedInput);
  const varied = buildIntroSpec(variedMain, variedInput);
  assert.ok(varied.introRecipe.imagePrompt.length < 1500);
  assert.ok(varied.introRecipe.videoPrompt.length < 1500);
  assert.equal(varied.qa.status, 'unreviewed');
  assert.equal(varied.introRecipe.people, 'none');
  assert.equal('referenceEyeState' in varied.introRecipe, false);
  assert.deepEqual(varied.mainRecipe.direction, variedMain);
  assert.equal(varied.mainRecipe.introIncludedInLoop, false);
  maxImage = Math.max(maxImage, varied.introRecipe.imagePrompt.length);
  maxVideo = Math.max(maxVideo, varied.introRecipe.videoPrompt.length);
  templeCombinations += 1;
}
assert.equal(templeCombinations, 144);
const source = fs.readFileSync(path.join(__dirname, '../shared/healing-rain/intro.js'), 'utf8');
assert.ok(!/\bprocess\.|\bBuffer\b|Date\.|Math\.random|fetch\(/.test(source), 'candidate is deterministic and has no network or environment access');
const context = { module: { exports: {} }, require(name) { assert.equal(name, './direction'); return directionModule; } };
vm.runInNewContext(source, context);
assert.equal(context.module.exports.buildIntroSpec(main, input).introRecipe.videoPrompt, buildIntroSpec(main, input).introRecipe.videoPrompt);
assert.equal(context.module.exports.buildIntroSpec(templeMain, templeInput).introRecipe.videoPrompt, freshTemple.introRecipe.videoPrompt);
console.log(`PASS: ${combinations} train and ${templeCombinations} temple candidates; exact frame coverage for 30s/180s; source provenance, single intro, forward main loop, continuous audio, scene-specific reference contracts, 8 idea-only scenes, immutable main and unreviewed QA; prompts at most ${maxImage}/${maxVideo} characters.`);
