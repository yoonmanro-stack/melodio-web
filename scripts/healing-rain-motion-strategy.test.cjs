/* eslint-disable @typescript-eslint/no-require-imports -- Offline verification of the shared candidate adapter. */
'use strict';
const assert = require('node:assert/strict');
const { SCENE_IDS, buildDirection } = require('../shared/healing-rain/direction');
const { MOTION_STRATEGY_VERSION, buildMotionCandidate, materializeVideoInput } = require('../shared/healing-rain/motion-strategy');
const defaults = { sceneId: 'train', intensity: 'downpour', thunder: 'none', camera: 'bedside', palette: 'midnight', variation: 0, title: '비 내리는 침대 열차', hours: 10, takes: 6, notes: '' };
const copy = value => JSON.parse(JSON.stringify(value));
const imageUrl = 'https://example.test/approved-source.png';
let cases = 0;
let maxPrompt = 0;
for (const sceneId of SCENE_IDS) for (const intensity of ['gentle', 'moderate', 'heavy', 'downpour']) {
  const input = { ...defaults, sceneId, intensity };
  const direction = buildDirection(input);
  const original = copy(direction);
  const candidate = buildMotionCandidate(direction, input);
  const { video, strategy, qa, render } = candidate;
  const prompt = video.input.prompt;
  assert.deepEqual(direction, original, 'candidate must not mutate approved direction');
  assert.deepEqual(candidate, buildMotionCandidate(copy(direction), copy(input)), 'deterministic after serialization');
  assert.equal(strategy.version, MOTION_STRATEGY_VERSION);
  assert.equal(strategy.sourceDirectionVersion, direction.version);
  assert.deepEqual(strategy.sourceInput, input);
  assert.deepEqual(strategy.sourceMotionIds, direction.motion.map(item => item.id));
  assert.equal(strategy.status, 'candidate');
  assert.equal(strategy.generatedEndpointMatch, false);
  assert.equal(strategy.breathingPhaseMatch, false);
  assert.equal(strategy.loopAssembly, 'postproduction-crossfade');
  assert.equal(video.conditioning, 'start-frame-only');
  assert.deepEqual([render.sourceVideoSeconds, render.targetVideoCycleSeconds, render.videoCrossfadeSeconds, render.fps], [11, 10, 1, 24]);
  assert.ok(prompt.includes(direction.lighting.instruction));
  assert.ok(prompt.includes('source photograph’s lighting'));
  assert.ok(!/ending image|end.?frame|match.*phase|0[–-]1s|10[–-]11s|return to|reset|seamless loop/i.test(prompt), 'generation has no endpoint/phase reset instruction');
  for (const motion of direction.motion.filter(item => item.type !== 'background-translation')) assert.ok(prompt.includes(motion.instruction), `preserve ${sceneId}/${motion.id}`);
  assert.ok(prompt.indexOf(direction.motion.find(item => item.id === 'rain').instruction) < prompt.indexOf('Camera'), 'motion precedes camera constraints');
  if (sceneId === 'train') {
    assert.ok(prompt.startsWith('The train is already traveling'));
    assert.match(prompt, /RIGHT TO LEFT.*1–2s; distant landscape.*more slowly/);
    assert.match(prompt, /Camera is attached to the carriage/);
    assert.ok(prompt.indexOf('RIGHT TO LEFT') < prompt.indexOf('Camera'));
  } else {
    assert.doesNotMatch(prompt, /train|carriage|RIGHT TO LEFT|depth parallax/);
  }
  const hasSubject = ['train', 'tent', 'cabin'].includes(sceneId);
  assert.equal(prompt.includes('about 5s per cycle'), hasSubject);
  assert.equal(qa.checks.some(check => check.id === 'blanket-breathing'), hasSubject);
  if (!hasSubject) assert.ok(prompt.includes('do not add people or breathing'));
  assert.equal(qa.status, 'review-required');
  assert.equal(qa.naturalness, 'review-required');
  assert.equal(qa.automaticChecksGuaranteeNaturalness, false);
  assert.equal(qa.representativePassCoversOtherScenes, false);
  assert.ok(qa.checks.every(check => check.status === 'review-required'));
  const before = copy(video);
  const providerInput = materializeVideoInput(video, imageUrl);
  assert.deepEqual(video, before);
  assert.deepEqual(providerInput.image_urls, [imageUrl]);
  assert.deepEqual(Object.keys(providerInput).sort(), ['prompt', 'sound', 'duration', 'aspect_ratio', 'mode', 'multi_shots', 'image_urls'].sort());
  assert.deepEqual([providerInput.sound, providerInput.duration, providerInput.aspect_ratio, providerInput.mode, providerInput.multi_shots], [false, '11', '16:9', 'std', false]);
  assert.ok(!Object.hasOwn(providerInput, 'conditioning'));
  assert.ok(!Object.hasOwn(providerInput, 'strategyVersion'));
  assert.ok(prompt.length <= 1500);
  maxPrompt = Math.max(maxPrompt, prompt.length);
  cases += 1;
}
const direction = buildDirection(defaults);
assert.throws(() => buildMotionCandidate(direction, { ...defaults, palette: 'amber' }), error => error.issues.some(issue => issue.code === 'input-provenance'));
for (const mutate of [d => { d.motion.find(m => m.id === 'travel').direction = 'left-to-right'; }, d => { d.lighting.instruction = 'Bright daytime'; }, d => { d.verification.status = 'passed'; }]) {
  const tampered = copy(direction);
  mutate(tampered);
  assert.throws(() => buildMotionCandidate(tampered, defaults), error => error.code === 'HEALING_RAIN_DIRECTION_INVALID');
}
for (const invalid of [null, {}, [], 'direction']) assert.throws(() => buildMotionCandidate(invalid, defaults));
const video = buildMotionCandidate(direction, defaults).video;
for (const patch of [{ conditioning: undefined }, { conditioning: 'start-and-end' }, { strategyVersion: undefined }, { model: 'different-model' }, { input: { ...video.input, image_urls: [imageUrl, imageUrl] } }, { input: { ...video.input, end_image_url: imageUrl } }, { input: { ...video.input, sound: true } }, { input: { ...video.input, duration: 11 } }]) {
  assert.throws(() => materializeVideoInput({ ...video, ...patch }, imageUrl), error => error.code === 'HEALING_RAIN_MOTION_CANDIDATE_INVALID');
}
for (const invalidUrl of [null, [], [imageUrl], [imageUrl, imageUrl], '', 'relative.png', 'file:///tmp/source.png', 'https://user:password@example.test/image.png', imageUrl + ' ', imageUrl + '\n' + imageUrl]) {
  assert.throws(() => materializeVideoInput(video, invalidUrl), error => error.code === 'HEALING_RAIN_MOTION_CANDIDATE_INVALID');
}
assert.equal(materializeVideoInput(video, imageUrl + '?signed=offline').image_urls[0], imageUrl + '?signed=offline');
console.log(`PASS: ${cases} cases across all 10 scenes; provenance rejection, single-image conditioning, motion order, preserved scene rules, review-only QA; maximum ${maxPrompt} characters.`);
