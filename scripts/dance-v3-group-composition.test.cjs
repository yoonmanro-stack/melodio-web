/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline compiled image/preview composition and captured production legacy-byte baselines. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { load, jobFor, rawV3, legacyJob, rawLegacy } = require('./dance-v3-spatial-premise.test.cjs');
const { resolveDanceProductionSeedV3, resolveDanceProductionDirectionV3, DANCE_PRODUCTION_LAYOUTS } = load('src/lib/dance/creativeDirection.ts');
const { validateDancePerformancePlanV3, validateDancePlan } = load('src/lib/dance/videoPlan.ts');
const { buildDancePreviewPrompt } = load('src/lib/dance/videoService.ts');
const { buildDanceCastPrompt, danceGroupRelativePosition, DANCE_V3_ENSEMBLE_COMPOSITION } = load('src/lib/dance/cast.ts');
const hash = value => createHash('sha256').update(value).digest('hex');

function compiled(job, layoutId = 'diagonal') {
  const raw = rawV3(job, layoutId);
  raw.previewPrompt = `0-2s: ${job.productionSeed.anchors.map(anchor => anchor.id).join(',')} make short native steps inside the shared floor area. 2-5s: continuous weight and partner responses.`;
  const plan = validateDancePerformancePlanV3(raw, job.productionSeed, job.musicSpec.bpm);
  const direction = resolveDanceProductionDirectionV3(job.productionSeed, plan.productionManifest);
  return { ...job, plan, direction, productionManifest: plan.productionManifest, productionLockedAt: '2026-10-10T00:00:00Z' };
}

test('compiled V3 diagonal image and preview use ensemble coordinates without mutating stored identity or positions', () => {
  const saved = compiled(jobFor()), before = structuredClone(saved), preview = buildDancePreviewPrompt(saved);
  for (const prompt of [saved.plan.imagePrompt, preview]) {
    assert.ok(prompt.includes(DANCE_V3_ENSEMBLE_COMPOSITION));
    assert.match(prompt, /not frame edges/); assert.match(prompt, /never camera proximity/);
    assert.match(prompt, /From0s, frame every whole body and floor contact/);
    assert.match(prompt, /room for the authored first movement/);
    assert.match(prompt, /no opening camera pullback or isolated actor close-up/);
    assert.doesNotMatch(prompt, /@near-left|\/near-left/);
  }
  assert.match(saved.plan.imagePrompt, /@group-front-left/); assert.match(preview, /\/group-front-left/);
  for (const member of saved.plan.cast.members) {
    assert.ok(saved.plan.imagePrompt.includes(`${member.id}=${member.identity}@${danceGroupRelativePosition(member.position)}`));
    assert.ok(preview.includes(`${member.id}=${member.species}/${member.role}/${danceGroupRelativePosition(member.position)}`));
  }
  assert.deepEqual(saved.plan.cast.members.map(member => member.position), DANCE_PRODUCTION_LAYOUTS.diagonal.positions.slice(0, 3));
  assert.deepEqual(saved, before);
});

test('explicit relative layout locks remain authoritative while framing clarifies the group footprint', () => {
  const job = jobFor();
  job.productionSeed = { ...job.productionSeed, locks: { ...job.productionSeed.locks, layoutId: 'diagonal' } };
  const saved = compiled(job), before = structuredClone(saved), preview = buildDancePreviewPrompt(saved);
  assert.equal(saved.plan.performanceStaging, 'layout-locked');
  assert.equal(saved.plan.productionManifest.layoutId, 'diagonal');
  assert.match(saved.plan.imagePrompt, /Explicit required relative formation: spaced diagonal/);
  assert.match(saved.plan.imagePrompt, /Preserve that relative formation/);
  assert.match(preview, /Explicit required relative formation: spaced diagonal/);
  assert.match(preview, /Preserve it while moving natively within its constraint/);
  assert.deepEqual(saved, before);
  assert.throws(() => validateDancePerformancePlanV3(rawV3(job, 'reverse_triangle'), job.productionSeed, job.musicSpec.bpm), { code: 'PLAN_INVALID' });
});

test('2-6 performers retain every identity/native action and compiled UTF8 caps across diagonal and row layouts', () => {
  const base = jobFor();
  for (const [performer, ensemble, species, brief, count] of [
    ['woman', 'duo', 'auto', '성인 여성 두 명이 함께 공연한다.', 2],
    ['human_animal', 'trio', 'penguin', '성인 여성 한 명과 펭귄 두 마리가 함께 공연한다.', 3],
    ['animal', 'crowd', 'penguin', '펭귄 네 마리가 함께 공연한다.', 4],
    ['animal', 'crowd', 'penguin', '펭귄 다섯 마리가 함께 공연한다.', 5],
    ['animal', 'crowd', 'penguin', '펭귄 여섯 마리가 함께 공연한다.', 6],
  ]) {
    const preferences = { ...base.creativePreferences, performer, ensemble, species };
    const job = { ...base, visualBrief: brief, creativePreferences: preferences,
      productionSeed: resolveDanceProductionSeedV3(preferences, base.id, brief, [], base.musicSpec) };
    for (const layoutId of count >= 4 ? ['diagonal', 'staggered_rows'] : ['diagonal']) {
      const saved = compiled(job, layoutId), original = structuredClone(saved.plan.cast);
      const raw = rawV3(job, layoutId);
      raw.previewPrompt = saved.plan.previewPrompt;
      raw.imagePrompt = 'Full bodies with planted feet and ample visible lateral floor for the bounded ensemble action. '.repeat(10).trim();
      const maxImagePlan = validateDancePerformancePlanV3(raw, job.productionSeed, job.musicSpec.bpm);
      const preview = buildDancePreviewPrompt(saved);
      assert.equal(saved.plan.cast.count, count);
      assert.equal(saved.plan.choreography.steps.reduce((sum, step) => sum + step.count, 0), 8);
      assert.ok(saved.plan.choreography.steps.every(step => step.actors.length === count));
      for (const member of saved.plan.cast.members) {
        assert.ok(maxImagePlan.imagePrompt.includes(member.identity));
        assert.ok(preview.includes(`${member.id}:${saved.plan.choreography.steps[0].actors.find(actor => actor.memberId === member.id).action}`));
      }
      for (const prompt of [maxImagePlan.imagePrompt, ...saved.plan.clips, preview]) assert.ok(Buffer.byteLength(prompt, 'utf8') <= 4096, `${count}/${layoutId}`);
      assert.deepEqual(saved.plan.cast, original);
    }
  }
});

test('captured production V1/V2 compiled image and preview bytes remain exact', () => {
  // Captured independently from committed production 6caf2335 before this change.
  const baselines = [
    [1, '076725c619ceeaadf473d0146286cf1012d9e97e96b1a0bc68ca96bdc6e3d79d', 'd42e2a29e8dba7666e10927ffe1f418192d18009f79e44a07264c6fd2692b177'],
    [2, 'abd2f4cf15d5391decd80a72951fb3bffb56d928d37c8397f96eb02fc9e90dea', '6e267c65f6a5e497894c823de74d3cb539d5d8c511f1e07dc9a21b2c70734d71'],
  ];
  for (const [version, imageSha, previewSha] of baselines) {
    const job = legacyJob(version), plan = validateDancePlan(rawLegacy(job), job.direction, job.musicSpec.bpm);
    const saved = { ...job, plan, selectedIdea: { id: 'legacy-idea', signatureMove: '발 옆 딛기' } };
    assert.equal(hash(plan.imagePrompt), imageSha); assert.equal(hash(buildDancePreviewPrompt(saved)), previewSha);
    assert.doesNotMatch(plan.imagePrompt, /Ensemble coordinates|group-front-left/);
  }
  const cast = compiled(jobFor()).plan.cast;
  assert.doesNotMatch(buildDanceCastPrompt(cast), /Ensemble coordinates|group-front-left/);
});
