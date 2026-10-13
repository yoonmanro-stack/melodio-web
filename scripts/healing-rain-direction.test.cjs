/* eslint-disable @typescript-eslint/no-require-imports -- This script verifies the shared CommonJS/browser compiler. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DIRECTION_VERSION, SCENE_IDS, buildDirection, validateDirection, compileDirection } = require('../shared/healing-rain/direction');
const defaults = { sceneId: 'train', intensity: 'downpour', thunder: 'none', camera: 'bedside', palette: 'midnight', variation: 0, title: '비 내리는 침대 열차', hours: 10, takes: 6, notes: '' };
const copy = object => JSON.parse(JSON.stringify(object));
function invalid(mutator, code, input = defaults) {
  const direction = buildDirection(input);
  mutator(direction);
  const validation = validateDirection(direction);
  assert.equal(validation.valid, false, code);
  assert.ok(validation.issues.some(item => item.code === code), `${code}: ${validation.issues.map(item => item.code)}`);
  assert.throws(() => compileDirection(direction, input), error => error.code === 'HEALING_RAIN_DIRECTION_INVALID' && Array.isArray(error.issues));
}
let maxVideo = 0;
let maxSnapshot = 0;
let combinations = 0;
for (const sceneId of SCENE_IDS) for (const intensity of ['gentle', 'moderate', 'heavy', 'downpour']) for (const camera of ['wide', 'window', 'bedside']) for (const palette of ['amber', 'linen', 'midnight']) for (const variation of [0, 1, 2, 3]) {
  const input = { ...defaults, sceneId, intensity, camera, palette, variation };
  const direction = buildDirection(input);
  assert.equal(direction.version, DIRECTION_VERSION);
  assert.deepEqual(direction, buildDirection(input), 'deterministic source');
  assert.deepEqual(copy(direction), direction, 'serializable source');
  assert.equal(validateDirection(direction).valid, true);
  const compiled = compileDirection(copy(direction), input);
  assert.deepEqual(compiled, compileDirection(direction, input));
  assert.equal(direction.loop.sourceSeconds - direction.loop.overlapSeconds, direction.loop.cycleSeconds);
  assert.deepEqual([compiled.render.sourceVideoSeconds, compiled.render.targetVideoCycleSeconds, compiled.render.videoCrossfadeSeconds, compiled.render.fps], [11, 10, 1, 24]);
  assert.deepEqual([compiled.render.previewSeconds, compiled.render.seconds], [30, 180]);
  assert.equal(direction.longEvents.enabled, false);
  assert.equal(direction.verification.status, 'review-required');
  assert.equal(direction.verification.unknownRegions, 'review-required');
  assert.equal(direction.verification.coverage.representativePassCoversOtherProfiles, false);
  assert.equal(direction.verification.coverage.automaticChecksGuaranteeNaturalness, false);
  assert.equal(direction.lighting.regions.length, 5);
  assert.ok(direction.motion.every(motion => compiled.video.includes(motion.instruction)), 'all motion must reach provider prompt');
  assert.ok(compiled.image.includes(direction.fixed.camera.composition));
  assert.ok(compiled.image.includes(direction.fixed.palette));
  assert.ok(compiled.image.includes(direction.fixed.variation));
  assert.ok(compiled.video.length <= 1500);
  assert.ok(!compiled.video.includes('10-second source'));
  const hasSubject = ['train', 'tent', 'cabin'].includes(sceneId);
  assert.equal(direction.fixed.people !== 'none', hasSubject);
  assert.equal(direction.motion.some(item => item.type === 'blanket-breathing'), hasSubject);
  assert.equal(direction.lighting.regions.find(region => region.id === 'subject').applicable, hasSubject);
  if (hasSubject) {
    assert.ok(compiled.image.includes('beautiful adult woman'));
    assert.ok(compiled.video.includes('stable face, head and hands'));
    assert.ok(compiled.video.includes('about 5s'));
    assert.ok(!compiled.video.includes('blanket remains still'));
    assert.equal(direction.fixed.subject.bodyMotion, 'blanket-breathing-only');
  } else assert.equal(direction.fixed.subject, null);
  if (sceneId === 'train') {
    const travel = direction.motion.find(item => item.type === 'background-translation');
    assert.equal(travel.direction, 'right-to-left');
    assert.deepEqual(travel.speed.nearCrossingSeconds, [1, 2]);
    assert.equal(travel.speed.targetStatus, 'initial-descriptive-target');
    assert.ok(compiled.video.includes('No slowing, stops or reversal'));
  }
  if (sceneId === 'pond') assert.ok(compiled.video.includes('no stream or waterfall'));
  if (sceneId === 'lake') assert.ok(compiled.video.includes('no ocean surf or large waves'));
  if (['hanok', 'mountain-temple', 'highland-village'].includes(sceneId)) assert.ok(compiled.video.includes('never frozen icicles'));
  maxVideo = Math.max(maxVideo, compiled.video.length);
  combinations += 1;
}
for (const sceneId of SCENE_IDS) {
  const input = { ...defaults, sceneId, title: '한'.repeat(100), notes: '한'.repeat(600), variation: 999999, thunder: 'distant' };
  const direction = buildDirection(input);
  const compiled = compileDirection(direction, input);
  const snapshotBytes = Buffer.byteLength(JSON.stringify({ input, direction, prompts: { image: compiled.image, video: compiled.video, audio: 'a'.repeat(450) } }));
  assert.ok(snapshotBytes < 22000, `${sceneId} snapshot budget reserves 2000 bytes for outer plan metadata`);
  maxSnapshot = Math.max(maxSnapshot, snapshotBytes);
  assert.equal(direction.longEvents.requestedThunder, 'distant');
  assert.equal(direction.longEvents.thunder.enabled, false);
  assert.equal(direction.longEvents.thunder.placement, 'separate-long-edit-only');
}
invalid(direction => { direction.fixed.people = 'none'; }, 'people-breathing-conflict');
invalid(direction => { direction.fixed.subject.bodyMotion = 'completely-still'; }, 'frozen-subject-conflict');
invalid(direction => { direction.fixed.subject.face = 'moving'; }, 'subject-stability');
invalid(direction => { direction.fixed.camera.mode = 'tracking'; }, 'camera-stability');
invalid(direction => { direction.lighting.sky = 'bright-twilight'; }, 'night-lighting-conflict');
invalid(direction => { direction.lighting.globalVariation = 'flicker'; }, 'exposure-conflict');
invalid(direction => { direction.loop.sourceSeconds = 10; }, 'loop-contract');
invalid(direction => { direction.loop.reversePlayback = true; }, 'loop-contract');
invalid(direction => { direction.longEvents.thunder.enabled = true; }, 'long-events-disabled');
invalid(direction => { direction.motion.find(item => item.id === 'breathing').periodSeconds = 1; }, 'breathing-bounds');
invalid(direction => { direction.motion.find(item => item.id === 'travel').direction = 'left-to-right'; }, 'train-travel');
invalid(direction => { direction.motion.push({ id: 'stream', type: 'stream', region: 'water' }); }, 'pond-stream-conflict', { ...defaults, sceneId: 'pond' });
invalid(direction => { direction.fixed.scene = 'Untracked image direction'; }, 'direction-provenance');
invalid(direction => { direction.verification.status = 'passed'; }, 'verification-provenance');
for (const malformed of [null, [], {}, 1, 'direction', { version: DIRECTION_VERSION, fixed: null, motion: [null], lighting: null, loop: null }]) {
  assert.doesNotThrow(() => validateDirection(malformed));
  assert.equal(validateDirection(malformed).valid, false);
}
for (const patch of [{ sceneId: '__proto__' }, { intensity: 'toString' }, { camera: 'constructor' }, { palette: 'unknown' }, { thunder: 'flash' }, { variation: -1 }, { variation: 1.1 }, { variation: 1000000 }, { hours: 0 }, { takes: 20 }, { title: '' }, { notes: 'x'.repeat(601) }]) assert.throws(() => buildDirection({ ...defaults, ...patch }));
for (const [sceneId, notes] of [['train', 'Add a bright sky.'], ['train', 'Camera pan.'], ['train', 'The woman rolls over.'], ['train', 'No breathing. Keep blanket motionless.'], ['train', 'Keep the blanket completely motionless.'], ['train', 'The train slows down.'], ['pond', 'Add a sleeping woman.'], ['pond', 'Add a waterfall.'], ['lake', 'Add ocean surf.']]) assert.throws(() => buildDirection({ ...defaults, sceneId, notes }), /메모|추가/);
for (const notes of ['No bright sky. Avoid camera pan. No turning over.', 'Avoid no breathing. Keep the normal tiny blanket movement.', '밝은 하늘 없이. 뒤척임 금지.', 'Use a blue ceramic mug.', '비를 바라보는 구도가 편안하게 느껴지도록.']) assert.equal(validateDirection(buildDirection({ ...defaults, notes })).valid, true);
assert.notEqual(compileDirection(buildDirection(defaults), defaults).image, compileDirection(buildDirection({ ...defaults, variation: 1 }), { ...defaults, variation: 1 }).image);
assert.throws(() => compileDirection(buildDirection(defaults), { ...defaults, palette: 'amber' }), error => error.issues.some(item => item.code === 'input-provenance'));
const source = fs.readFileSync(path.join(__dirname, '../shared/healing-rain/direction.js'), 'utf8');
assert.ok(!/require\s*\(|\bprocess\.|\bBuffer\b/.test(source), 'shared compiler has no Node runtime dependencies');
const context = { module: { exports: {} } };
vm.runInNewContext(source, context);
assert.equal(context.module.exports.compileDirection(context.module.exports.buildDirection(defaults), defaults).video, compileDirection(buildDirection(defaults), defaults).video);
console.log(`PASS: ${combinations} deterministic scene/intensity/camera/palette/variation combinations, structured conflicts, browser compatibility, ${maxVideo}-character maximum video prompt, ${maxSnapshot}-byte maximum partial snapshot.`);
