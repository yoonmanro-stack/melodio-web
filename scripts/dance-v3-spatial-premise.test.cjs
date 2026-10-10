/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline actual requests: causal opening geometry, salient identity, and unchanged schema/legacy transport. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative); if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const local = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', 'process', 'fetch', js)(local, mod, mod.exports, { env: { OPENAI_API_KEY: 'offline-spatial-only' } }, () => { throw Error('NETWORK_FORBIDDEN'); });
  return mod.exports;
}
const { createDancePlan, validateDancePerformancePlanV3 } = load('src/lib/dance/videoPlan.ts');
const { resolveDanceProductionSeedV3, resolveDanceProductionDirectionV3, DANCE_PRODUCTION_LAYOUTS } = load('src/lib/dance/creativeDirection.ts');
const { danceCastRoster, DANCE_ACTOR_ANATOMY_PATTERN } = load('src/lib/dance/ideas.ts');
const { buildDancePreviewPrompt } = load('src/lib/dance/videoService.ts');
const MUSIC = { id: 'fixture-music', label: '리듬', style: 'Original upbeat rhythm', rhythmPurpose: '짧은 발 스텝을 받치는 리듬', bpm: 128 };
const PREFS = { performer: 'human_animal', ensemble: 'trio', species: 'penguin', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' };
const PREMISE = { version: 3, id: 'route-conflict', conceptFamily: 'interaction', title: '좁아지는 통로', visibleHook: '지나가려는 출연자가 통로를 향해 발을 딛자 양쪽 출연자가 안쪽으로 다가온다.',
  characterGoal: '막히기 전에 반대편에 닿으려 한다.', emotionalReaction: '좁아지는 길을 보며 놀라 상대의 움직임을 살핀다.', turn: '후퇴에 반응한 상대들의 동선이 교차해 서로를 막는다.',
  payoff: '열린 바깥길을 따라 목적지에 닿는다.', participation: '열릴 길의 방향을 먼저 고른다.', productionRisk: '이동 폭을 줄여 교차의 원인과 결과를 읽게 한다.', musicConnection: '짧은 킥이 접근과 후퇴의 발 움직임을 받친다.' };
function jobFor() { return { id: 'spatial-v3-fixture', planningVersion: 3, visualBrief: '성인 여성 한 명과 펭귄 두 마리가 함께 공연한다.', creativePreferences: PREFS, musicSpec: MUSIC, bpm: 128,
  selectedIdea: PREMISE, productionSeed: resolveDanceProductionSeedV3(PREFS, 'spatial-v3-fixture', '성인 여성 한 명과 펭귄 두 마리가 함께 공연한다.', [], MUSIC) }; }
function choreography(anchors) {
  return { hookName: '길을 여는 발걸음', firstPose: '발을 딛고 몸통을 통로 쪽으로 기울인다.', endPose: '발을 모으고 몸통을 돌려 시작을 잇는다.',
    steps: [{ count: 4, action: '접근하는 움직임', focus: 'feet', actors: anchors.map(a => ({ memberId: a.id, action: '발 옆 딛기' })) },
      { count: 4, action: '반응하는 움직임', focus: 'body', actors: anchors.map(a => ({ memberId: a.id, action: '몸통 흔들기' })) }],
    segments: [{ startSeconds: 0, endSeconds: 2, phase: 'opening', action: '발을 옆으로 딛고 몸통을 기울인다.', repeatHook: true },
      { startSeconds: 2, endSeconds: 22, phase: 'development', action: '발을 뒤로 딛고 몸통을 돌린다.', repeatHook: true },
      { startSeconds: 22, endSeconds: 28, phase: 'payoff', action: '발을 바깥으로 딛고 몸통을 펼친다.', repeatHook: true },
      { startSeconds: 28, endSeconds: 30, phase: 'restart', action: '몸통을 낮추고 고개를 돌린다.', repeatHook: true }] };
}
function rawV3(job, layoutId = 'reverse_triangle') { const seed = job.productionSeed; return { version: 3, seedId: seed.seedId,
  productionManifest: { version: 3, locationId: 'park', danceStyleId: 'groove', layoutId, locationDetail: 'a level plaza with the intended passage and far destination visible', wardrobes: seed.anchors.map(a => ({ memberId: a.id, description: 'no added styling' })) },
  title: '열린 길의 반응', summary: '통로의 접근과 후퇴가 눈에 보이는 반응을 만든다.', imagePrompt: 'Full bodies; the protagonist begins on the approach side before the narrowing route, with the intended far destination visible and gaze on the relevant partner.',
  previewPrompt: '0-2s: performer_1 plants steps toward the visible route as performer_2 and performer_3 waddle inward. 2-5s: the closure causes a continuous retreat and partner-directed gaze, revealing the outer path.',
  clips: ['The route visibly narrows through native planted movement and causes a continuous retreat; gazes track the relevant partner and event.',
    'Continue actual ending positions, reach the intended destination through the newly open path, then restore the motivated opening condition after the visible reward.'], choreography: choreography(seed.anchors) }; }
function fixedDirection() { const cast = { version: 1, kind: 'human', ensemble: 'duo', count: 2, formation: 'separated pair', members: ['left', 'right'].map((position, index) => ({ id: `performer_${index + 1}`, kind: 'human', species: 'human', role: index ? 'partner' : 'lead', position, identity: 'original adult dancer with stable appearance', movementAnatomy: 'human_biped' })) };
  return { version: 2, castId: 'duo', appearanceId: 'streetwear', outfitId: 'sporty', paletteId: 'coral_teal', locationId: 'studio', choreographyId: 'groove', castLabel: '성인 듀오', locationLabel: '스튜디오', danceStyleLabel: '그루브',
    sources: { cast: 'explicit', location: 'explicit', choreography: 'explicit' }, lockedAxes: ['castId', 'locationId', 'choreographyId', 'visualStyle'], signature: 'dance-v2-fixed', concreteEn: 'two original adult dancers, stable separated pair' , cast }; }
function legacyJob(version) { return { visualBrief: '발과 몸통으로 리듬에 응답한다.', musicSpec: MUSIC, bpm: 128, ...(version === 2 ? { direction: fixedDirection() } : {}) }; }
function rawLegacy(job) { const base = { title: '리듬의 응답', summary: '발과 몸통의 움직임을 반복한다.', identity: job.direction ? 'two original adult dancers' : 'one original adult woman', imagePrompt: 'Full body opening with visible weight movement.', previewPrompt: '0-2s: begin native foot movement. 2-5s: continue a grounded body-weight response.', clips: ['Begin continuous native foot and body movement.', 'Continue the actual ending frame and finish with a motivated pose.'] };
  return job.direction ? { ...base, version: 2, castRoster: danceCastRoster(job.direction.cast), choreography: choreography(job.direction.cast.members) } : base; }
async function capture(job, payload) { let body, calls = 0; const plan = await createDancePlan(job, async (_url, options) => { calls++; body = options.body; return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }] }); }); return { body, request: JSON.parse(body), plan, calls }; }
const sha = value => createHash('sha256').update(value).digest('hex');
function structuralSchema(value) { if (Array.isArray(value)) return value.map(structuralSchema); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, item]) => [key, structuralSchema(item)])); }

test('actual V3 request ties initial geometry, gaze, identity and temporal reward to saved premise', async () => {
  const job = jobFor(), c = await capture(job, rawV3(job)), system = c.request.messages[0].content, schema = c.request.response_format.json_schema.schema;
  assert.equal(c.calls, 1); assert.equal(c.request.model, 'gpt-5.6-sol'); assert.equal(c.request.reasoning_effort, 'low'); assert.equal(c.request.max_completion_tokens, 4096);
  assert.deepEqual(Object.keys(c.request).sort(), ['model', 'reasoning_effort', 'max_completion_tokens', 'response_format', 'messages'].sort());
  for (const pattern of [/attempted goal and unresolved condition/, /approach side before the blocker/, /not already through or beyond it/, /intended destination\/path visible/,
    /each actor's continuous cause-to-response path/, /never default camera eye contact unless/, /major silhouettes/, /coat patterns and garment color facets through turns/,
    /tiny interchangeable accessory must not be the sole identity/, /natural unadorned styling is allowed/, /do not force human clothes/, /payoff must visibly resolve the opening goal/,
    /only after that reward/, /Do not label the actual goal resolution as restart/, /static stall/]) assert.match(system, pattern);
  assert.match(schema.properties.imagePrompt.description, /approach side before the blocker/); assert.match(schema.properties.productionManifest.properties.layoutId.description, /initial geometry serving the selected goal/);
  assert.match(schema.properties.productionManifest.properties.wardrobes.items.properties.description.description, /optional/); assert.match(schema.properties.choreography.properties.segments.description, /Payoff actually resolves/);
  assert.match(schema.properties.choreography.properties.segments.items.properties.phase.description, /restart restores.*after reward/);
  const input = JSON.parse(c.request.messages[1].content); assert.deepEqual(input.selectedPremise, PREMISE); assert.deepEqual(input.frozenCast.anchors, job.productionSeed.anchors);
  assert.ok(input.layoutOptions.reverse_triangle); assert.ok(input.layoutOptions.centered_trio); assert.equal(c.plan.performanceStaging, 'initial');
});
test('both new initial geometries preserve every frozen identity and native actor through compiler and preview', () => {
  const job = jobFor(); for (const [layoutId, positions] of [['reverse_triangle', ['rear-center', 'front-left', 'front-right']], ['centered_trio', ['center', 'left', 'right']]]) {
    assert.deepEqual(DANCE_PRODUCTION_LAYOUTS[layoutId].counts, [3]); const raw = rawV3(job, layoutId), plan = validateDancePerformancePlanV3(raw, job.productionSeed, 128), direction = resolveDanceProductionDirectionV3(job.productionSeed, raw.productionManifest);
    assert.deepEqual(plan.cast.members.map(m => m.position), positions); assert.deepEqual(plan.cast, direction.cast); assert.deepEqual(plan.cast.members.map(m => m.id), job.productionSeed.anchors.map(a => a.id));
    for (const anchor of job.productionSeed.anchors.filter(a => a.kind === 'animal')) assert.ok(plan.cast.members.find(m => m.id === anchor.id).identity.includes(anchor.coat));
    const saved = { ...job, plan, direction, productionManifest: plan.productionManifest, productionLockedAt: '2026-10-10T00:00:00Z' }, preview = buildDancePreviewPrompt(saved);
    for (const prompt of [plan.imagePrompt, ...plan.clips, preview]) assert.ok(Buffer.byteLength(prompt) <= 4096); assert.match(preview, /never reapply opening anchors/);
    assert.equal(plan.choreography.steps.reduce((sum, step) => sum + step.count, 0), 8); assert.ok(plan.choreography.steps.every(step => step.actors.length === 3));
  }
});
test('explicit new relative layout remains hard locked and provider description changes do not add semantic rejection', async () => {
  const job = jobFor(); job.productionSeed = { ...job.productionSeed, locks: { ...job.productionSeed.locks, layoutId: 'reverse_triangle' } };
  const c = await capture(job, rawV3(job)); assert.deepEqual(c.request.response_format.json_schema.schema.properties.productionManifest.properties.layoutId.enum, ['reverse_triangle']); assert.equal(c.plan.performanceStaging, 'layout-locked');
  assert.throws(() => validateDancePerformancePlanV3(rawV3(job, 'centered_trio'), job.productionSeed, 128), { code: 'PLAN_INVALID' });
  const generic = rawV3(job); generic.imagePrompt = 'Full bodies with generic visible foot and body movement.'; assert.doesNotThrow(() => validateDancePerformancePlanV3(generic, job.productionSeed, 128));
});
test('schema constraints stay fixed and legacy requests do not inherit V3 descriptions', async () => {
  const job = jobFor(), c = await capture(job, rawV3(job)), p = c.request.response_format.json_schema.schema.properties;
  assert.deepEqual(Object.keys(p).sort(), ['version', 'seedId', 'productionManifest', 'title', 'summary', 'imagePrompt', 'previewPrompt', 'clips', 'choreography'].sort());
  assert.equal(p.imagePrompt.maxLength, 1000); assert.equal(p.previewPrompt.maxLength, 650); assert.deepEqual([p.clips.minItems, p.clips.maxItems, p.clips.items.maxLength], [2, 2, 300]);
  assert.deepEqual([p.productionManifest.properties.wardrobes.minItems, p.productionManifest.properties.wardrobes.maxItems, p.productionManifest.properties.wardrobes.items.properties.description.maxLength], [3, 3, 60]);
  assert.deepEqual(p.choreography.properties.segments.items.properties.phase.enum, ['opening', 'development', 'payoff', 'restart']);
  const signature = structuralSchema(c.request.response_format.json_schema.schema); signature.properties.productionManifest.properties.layoutId.enum = [];
  // Normalize only the intentional V3 generation pattern; action-schema tests verify it directly.
  signature.properties.choreography.properties.steps.items.properties.actors.items.properties.action.pattern = DANCE_ACTOR_ANATOMY_PATTERN;
  // Independently captured from deployed 8c9b9615; the remaining structural baseline stays fixed.
  assert.equal(sha(JSON.stringify(signature)), '285a04c072ba04f0e6464272907ee950b8d1da259fea1510ab4e95ba07c42196');
  for (const [version, expected] of [[1, 'ef8f3e8d4b47cbc04ea6537b32e1f7a8591a099526695c7be27490c1f35d4ce8'], [2, 'd6f7ce79f9490cc2f694bbba9af3436dcb3f8cd2846fb1c0707e92470726cce0']]) { const legacy = legacyJob(version), first = await capture(legacy, rawLegacy(legacy));
    await capture(job, rawV3(job)); const after = await capture(legacy, rawLegacy(legacy)); assert.equal(sha(first.body), sha(after.body)); assert.equal(sha(first.body), expected);
    assert.doesNotMatch(first.request.messages[0].content, /FIRST-FRAME CAUSAL GEOMETRY|PAYOFF BEFORE RESTART/);
  }
});
module.exports = { load, jobFor, rawV3, legacyJob, rawLegacy, capture, structuralSchema };
