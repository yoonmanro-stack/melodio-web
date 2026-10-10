/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline schema/parser alignment. Negative phrases are synthetic, not recovered provider text. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, jobFor, rawV3, capture } = require('./dance-v3-spatial-premise.test.cjs');
const { resolveDanceProductionSeedV3, resolveDanceProductionDirectionV3 } = load('src/lib/dance/creativeDirection.ts');
const { validateDancePerformancePlanV3 } = load('src/lib/dance/videoPlan.ts');
const { validateDanceActorActions, getDanceValidationDetails, DANCE_ACTOR_ANATOMY_PATTERN } = load('src/lib/dance/ideas.ts');
const { buildDancePreviewPrompt } = load('src/lib/dance/videoService.ts');
function actorSchema(request) {
  return request.response_format.json_schema.schema.properties.choreography.properties.steps.items.properties.actors.items.properties.action;
}
function nativeAction(cast, index, action, limit = 24) {
  const actors = cast.members.map(member => ({ memberId: member.id, action: '발 딛기' }));
  actors[index].action = action;
  return validateDanceActorActions(actors, cast, limit, { stepIndex: 1 });
}

test('actual V3 request uses anchored physical syntax while retaining transport and actor limits', async () => {
  const job = jobFor(), result = await capture(job, rawV3(job)), schema = actorSchema(result.request);
  assert.equal(result.calls, 1);
  assert.equal(result.request.model, 'gpt-5.6-sol');
  assert.equal(result.request.reasoning_effort, 'low');
  assert.equal(result.request.max_completion_tokens, 4096);
  assert.equal(result.request.response_format.json_schema.name, 'dance_plan_performance_v3');
  assert.equal(schema.minLength, 1); assert.equal(schema.maxLength, 16);
  assert.deepEqual(Object.keys(schema).sort(), ['type', 'minLength', 'maxLength', 'description', 'pattern'].sort());
  assert.notEqual(schema.pattern, DANCE_ACTOR_ANATOMY_PATTERN);
  assert.ok(schema.pattern.startsWith('^') && schema.pattern.endsWith('$'));
  assert.doesNotMatch(schema.pattern, /\(\?[=!<]/, 'plain groups/alternation without lookaround');
  assert.match(schema.description, /own native body part/);
  assert.match(schema.description, /deliberate hold/);
  assert.ok(result.request.messages[0].content.includes(`V3 ACTOR ACTION SYNTAX: ${schema.description}`));
  assert.match(result.request.messages[0].content, /SUM EXACTLY8/);
  assert.match(result.request.messages[0].content, /species-native anatomy/);
});

test('every emitted canonical verb and human/penguin format example passes the unchanged native parser', async () => {
  const job = jobFor(), raw = rawV3(job), result = await capture(job, raw), schema = actorSchema(result.request);
  const pattern = new RegExp(schema.pattern), cast = resolveDanceProductionDirectionV3(job.productionSeed, raw.productionManifest).cast;
  const examples = [
    [0, '발 옆 딛기'], [0, '몸통 돌리기'], [0, '오른 발을 앞 딛기'], [0, '발꿈치 짧게 올리기'],
    [0, '손목 돌리기'], [0, '팔 고정하기'], [0, '몸통 유지하기'], [0, '몸통 정지하기'],
    [1, '지느러미 펴기'], [1, '지느러미 고정하기'], [1, '발 뒤뚱걷기'], [1, '몸통 옆 기울이기'],
  ];
  for (const [index, action] of examples) {
    assert.ok(action.length <= schema.maxLength, action); assert.ok(pattern.test(action), action);
    assert.equal(nativeAction(cast, index, action, schema.maxLength)[index].action, action);
  }
  // Check the actual emitted verb alternatives against independent server classification.
  const ending = schema.pattern.match(/\[ \]\(\?:([^()]+)\)\$$/);
  assert.ok(ending, 'canonical verb alternatives are explicit');
  for (const verb of ending[1].split('|')) {
    const action = `몸통 ${verb}`;
    assert.ok(pattern.test(action), action);
    assert.equal(nativeAction(cast, 1, action, schema.maxLength)[1].action, action);
  }
});

test('synthetic anatomy-only, abstract, perception and object phrases cannot satisfy the new schema', async () => {
  const job = jobFor(), raw = rawV3(job), result = await capture(job, raw), pattern = new RegExp(actorSchema(result.request).pattern);
  const cast = resolveDanceProductionDirectionV3(job.productionSeed, raw.productionManifest).cast;
  for (const action of ['지느러미', '지느러미 옆', '지느러미로 응답', '몸통의 존재감', '발을 바라보기',
    '셔플', '리드', '공만 회전하기', '손을 고정한 채 공만 회전하기', '발 딛기\n응답', '발 딛기; 몸통 돌리기']) {
    assert.equal(pattern.test(action), false, action);
  }
  assert.ok(new RegExp(DANCE_ACTOR_ANATOMY_PATTERN).test('지느러미 옆'), 'old schema admits this synthetic gap');
  assert.throws(() => nativeAction(cast, 1, '지느러미 옆'), error => {
    assert.equal(error.code, 'PLAN_INVALID');
    assert.deepEqual(getDanceValidationDetails(error).actorFailure, { stepIndex: 1, memberId: 'performer_2', category: 'unrecognized_motion' });
    return true;
  });
  // The schema is a generation subset; unfamiliar reviewable legacy verbs remain accepted by the parser.
  assert.equal(nativeAction(cast, 1, '지느러미로 응답')[1].action, '지느러미로 응답');
});

test('real V3 plans retain holds, native anatomy guards, actor ordering and eight-count motion requirements', () => {
  const job = jobFor(), raw = rawV3(job);
  raw.choreography.steps[0].actors[1].action = '지느러미 고정하기';
  raw.choreography.steps[1].actors[1].action = '발 옆 딛기';
  const plan = validateDancePerformancePlanV3(raw, job.productionSeed, job.musicSpec.bpm);
  assert.equal(plan.choreography.steps[0].actors[1].action, '지느러미 고정하기');
  assert.equal(plan.choreography.steps.reduce((sum, step) => sum + step.count, 0), 8);
  assert.deepEqual(plan.choreography.steps[0].actors.map(actor => actor.memberId), job.productionSeed.anchors.map(anchor => anchor.id));
  for (const change of [
    value => { value.choreography.steps[0].actors[1].action = '양손 펼치기'; },
    value => { for (const step of value.choreography.steps) step.actors[1].action = '지느러미 고정하기'; },
    value => { value.choreography.steps[0].count = 3; },
    value => { value.choreography.steps[0].actors.reverse(); },
    value => { value.choreography.steps[0].actors.pop(); },
  ]) {
    const damaged = structuredClone(raw); change(damaged);
    assert.throws(() => validateDancePerformancePlanV3(damaged, job.productionSeed, job.musicSpec.bpm), { code: 'PLAN_INVALID' });
  }
});

test('actual schemas and compiled real plans retain 2/3/4/6-member caps and concise native syntax', async () => {
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
    raw.previewPrompt = `0-2s: ${job.productionSeed.anchors.map(anchor => anchor.id).join(',')} begin native foot steps. 2-5s: continuous body and partner responses.`;
    const result = await capture(job, raw), schema = actorSchema(result.request), pattern = new RegExp(schema.pattern);
    const actors = result.request.response_format.json_schema.schema.properties.choreography.properties.steps.items.properties.actors;
    assert.deepEqual([actors.minItems, actors.maxItems], [count, count]);
    assert.equal(schema.maxLength, Math.max(8, Math.floor(48 / count)));
    assert.deepEqual(actors.items.properties.memberId.enum, job.productionSeed.anchors.map(anchor => anchor.id));
    assert.ok(raw.choreography.steps.every(step => step.actors.every(actor => pattern.test(actor.action) && actor.action.length <= schema.maxLength)));
    assert.equal(result.plan.choreography.steps.reduce((sum, step) => sum + step.count, 0), 8);
    const direction = resolveDanceProductionDirectionV3(job.productionSeed, result.plan.productionManifest);
    const saved = { ...job, plan: result.plan, direction, productionManifest: result.plan.productionManifest, productionLockedAt: '2026-10-10T00:00:00Z' };
    for (const prompt of [result.plan.imagePrompt, ...result.plan.clips, buildDancePreviewPrompt(saved)]) assert.ok(Buffer.byteLength(prompt, 'utf8') <= 4096);
  }
});
