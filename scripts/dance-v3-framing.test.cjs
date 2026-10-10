/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline camera/action-envelope guidance; shared spatial fixtures also verify legacy request bytes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { load, jobFor, rawV3, legacyJob, rawLegacy, capture, structuralSchema } = require('./dance-v3-spatial-premise.test.cjs');
const { resolveDanceProductionSeedV3, resolveDanceProductionDirectionV3 } = load('src/lib/dance/creativeDirection.ts');
const { validateDancePerformancePlanV3 } = load('src/lib/dance/videoPlan.ts');
const { buildDancePreviewPrompt } = load('src/lib/dance/videoService.ts');
const { DANCE_ACTOR_ANATOMY_PATTERN } = load('src/lib/dance/ideas.ts');
const hash = value => createHash('sha256').update(value).digest('hex');

test('actual V3 request reserves the ensemble action envelope without mandating one camera setup', async () => {
  const job = jobFor(), result = await capture(job, rawV3(job)), system = result.request.messages[0].content;
  assert.equal(result.calls, 1);
  for (const pattern of [/VISIBLE ACTION ENVELOPE/, /reserves visible lateral space for the whole group's planned action/,
    /wide full-ensemble shot and no edge-hugging actors/, /all saved performers rather than tightly tracking one performer or a subgroup/,
    /opening and first-reaction travel short and bounded inside that visible action area/, /whole bodies and floor contact readable throughout/,
    /Camera movement may serve the premise only while preserving full-ensemble coverage/, /no camera cut, crop or zoom may drop another actor/,
    /selected style and hard layout\/identity locks/, /without imposing one mandatory camera setup/, /not a guarantee that a provider will obey/,
    /inspect the actual frame and motion test/]) assert.match(system, pattern);
  const properties = result.request.response_format.json_schema.schema.properties;
  assert.match(properties.imagePrompt.description, /Reserve visible lateral space.*wide full-ensemble shot/);
  assert.match(properties.imagePrompt.description, /no actor hugs a frame edge/);
  assert.match(properties.imagePrompt.description, /every saved performer rather than track one tightly/);
  assert.match(properties.previewPrompt.description, /short and bounded inside the visible action area/);
  assert.match(properties.previewPrompt.description, /no cut, crop or zoom drops another actor/);
  assert.match(properties.choreography.properties.firstPose.description, /every actor comfortably inside the frame with visible lateral room/);
  assert.equal(result.request.model, 'gpt-5.6-sol'); assert.equal(result.request.reasoning_effort, 'low'); assert.equal(result.request.max_completion_tokens, 4096);
});

test('framing instructions leave schema contracts and V1/V2 request bytes unchanged', async () => {
  const job = jobFor(), result = await capture(job, rawV3(job)), schema = structuralSchema(result.request.response_format.json_schema.schema);
  schema.properties.productionManifest.properties.layoutId.enum = [];
  // Normalize only the intentional V3 generation pattern; retain the deployed structural SHA.
  schema.properties.choreography.properties.steps.items.properties.actors.items.properties.action.pattern = DANCE_ACTOR_ANATOMY_PATTERN;
  assert.equal(hash(JSON.stringify(schema)), '285a04c072ba04f0e6464272907ee950b8d1da259fea1510ab4e95ba07c42196');
  for (const [version, expected] of [[1, 'ef8f3e8d4b47cbc04ea6537b32e1f7a8591a099526695c7be27490c1f35d4ce8'],
    [2, 'd6f7ce79f9490cc2f694bbba9af3436dcb3f8cd2846fb1c0707e92470726cce0']]) {
    const legacy = legacyJob(version), before = await capture(legacy, rawLegacy(legacy));
    await capture(job, rawV3(job)); const after = await capture(legacy, rawLegacy(legacy));
    assert.equal(hash(before.body), expected); assert.equal(hash(after.body), expected);
    assert.doesNotMatch(before.request.messages[0].content, /VISIBLE ACTION ENVELOPE/);
    assert.doesNotMatch(before.request.response_format.json_schema.schema.properties.imagePrompt.description, /whole group's planned action/);
  }
});

test('compiled real V3 prompts retain native actors, identities and 4096-byte caps for 2/3/4/6 performers', () => {
  const base = jobFor();
  for (const [performer, ensemble, species, brief, count, layoutId] of [
    ['woman', 'duo', 'auto', '성인 여성 두 명이 함께 공연한다.', 2, 'side_by_side'],
    ['human_animal', 'trio', 'penguin', '성인 여성 한 명과 펭귄 두 마리가 함께 공연한다.', 3, 'reverse_triangle'],
    ['animal', 'crowd', 'penguin', '펭귄 네 마리가 함께 공연한다.', 4, 'staggered_rows'],
    ['animal', 'crowd', 'penguin', '펭귄 여섯 마리가 함께 공연한다.', 6, 'staggered_rows'],
  ]) {
    const preferences = { ...base.creativePreferences, performer, ensemble, species };
    const job = { ...base, visualBrief: brief, creativePreferences: preferences,
      productionSeed: resolveDanceProductionSeedV3(preferences, base.id, brief, [], base.musicSpec) };
    const raw = rawV3(job, layoutId);
    raw.imagePrompt = 'Full bodies with planted feet and ample visible lateral floor for the bounded ensemble action. '.repeat(10).trim();
    assert.ok(raw.imagePrompt.length <= 1000);
    raw.previewPrompt = `0-2s: ${job.productionSeed.anchors.map(a => a.id).join(',')} make short native foot steps inside ample visible floor. 2-5s: continuous weight reactions remain inside the ensemble action area, with every body covered.`;
    const plan = validateDancePerformancePlanV3(raw, job.productionSeed, base.musicSpec.bpm), direction = resolveDanceProductionDirectionV3(job.productionSeed, plan.productionManifest);
    const saved = { ...job, plan, direction, productionManifest: plan.productionManifest, productionLockedAt: '2026-10-10T00:00:00Z' };
    assert.equal(plan.cast.count, count); assert.deepEqual(plan.cast, direction.cast);
    assert.ok(plan.choreography.steps.every(step => step.actors.length === count)); assert.equal(plan.choreography.steps.reduce((sum, step) => sum + step.count, 0), 8);
    for (const prompt of [plan.imagePrompt, ...plan.clips, buildDancePreviewPrompt(saved)]) assert.ok(Buffer.byteLength(prompt, 'utf8') <= 4096);
  }
});

test('framing remains guidance without a new semantic reject or layout/identity rewrite', () => {
  const job = jobFor(); job.productionSeed = { ...job.productionSeed, locks: { ...job.productionSeed.locks, layoutId: 'centered_trio' } };
  const raw = rawV3(job, 'centered_trio'); raw.imagePrompt = 'Full bodies begin generic grounded movement.';
  const plan = validateDancePerformancePlanV3(raw, job.productionSeed, job.musicSpec.bpm);
  assert.equal(plan.productionManifest.layoutId, 'centered_trio'); assert.equal(plan.performanceStaging, 'layout-locked');
  assert.deepEqual(plan.cast, resolveDanceProductionDirectionV3(job.productionSeed, raw.productionManifest).cast);
  const damaged = structuredClone(raw); damaged.choreography.steps[0].actors.pop();
  assert.throws(() => validateDancePerformancePlanV3(damaged, job.productionSeed, job.musicSpec.bpm), { code: 'PLAN_INVALID' });
});
