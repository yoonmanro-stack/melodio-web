/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline V3 contracts and persistence: no provider, database, audio or media requests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const local = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', 'process', 'fetch', js)(local, mod, mod.exports,
    { env: { OPENAI_API_KEY: 'offline-contract-only' } }, () => { throw Error('NETWORK_FORBIDDEN'); });
  return mod.exports;
}
const { isDancePerformancePremiseV3, validateDancePerformancePremisesV3, dancePerformanceSelectionFacts, matchesDanceExactFacts } = load('src/lib/dance/premises.ts');
const { resolveDanceProductionSeedV3, resolveDanceProductionDirectionV3, validateDanceProductionManifestV3 } = load('src/lib/dance/creativeDirection.ts');
const { createDanceIdeas } = load('src/lib/dance/ideas.ts');
const { createDancePlan, validateDancePerformancePlanV3 } = load('src/lib/dance/videoPlan.ts');
const { createDanceVideoService, buildDancePreviewPrompt, buildDancePacedClipPrompt } = load('src/lib/dance/videoService.ts');
const { resolveDanceMusicSpec } = load('src/lib/dance/musicProfiles.ts');
const USER = 'a0000000-0000-4000-8000-000000000001', TRACK = 'b0000000-0000-4000-8000-000000000001';
const prefs = (performer = 'woman', ensemble = 'duo', species = 'auto') => ({ performer, ensemble, species, location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' });
const music = resolveDanceMusicSpec('hook-pop', 'on', TRACK);
function premises() {
  return ['interaction', 'interaction', 'rhythm_reveal'].map((conceptFamily, index) => ({ version: 3, id: `performance_${index}`, title: ['숨기지 못한 신나는 마음', '나만 아는 깜짝 응원', '조용한 주인공의 반전'][index], conceptFamily,
    visibleHook: ['엄숙한 표정 옆으로 신난 발끝이 먼저 반응한다.', '기운 없는 주인공 뒤에서 작은 응원이 시작된다.', '수줍은 주인공이 화려한 무대의 중심에 선다.'][index],
    characterGoal: '상대와 함께 즐거운 순간을 만들고 싶다.', emotionalReaction: '뜻밖의 반응에 놀랐다가 웃음을 터뜨린다.',
    turn: '감추던 즐거움이 상대에게 전해져 함께 리듬을 탄다.', payoff: '서로를 보며 환하게 웃고 함께 첫 움직임을 다시 시작한다.',
    participation: '숨은 반응이 시작되는 순간을 예상하고 함께 흉내 낸다.', productionRisk: '표정 변화와 몸이 섞일 수 있어 몸 전체를 고정 화면에 둔다.',
    musicConnection: '짧은 킥과 밝은 신스의 응답이 감정의 변화와 활기찬 체중 이동을 이끈다.' }));
}
function jobFor(preferences = prefs(), brief = '') {
  return { planningVersion: 3, visualBrief: brief, creativePreferences: preferences, musicSpec: music, bpm: 138,
    productionSeed: resolveDanceProductionSeedV3(preferences, 'v3-contract', brief, [], music) };
}
function manifest(seed, override = {}) {
  return { version: 3, locationId: seed.locks.locationId || 'park', danceStyleId: seed.locks.danceStyleId || 'groove',
    layoutId: seed.locks.layoutId || (seed.count === 1 ? 'solo_center' : seed.count === 2 ? 'side_by_side' : seed.count === 3 ? 'open_triangle' : 'staggered_rows'),
    locationDetail: 'a level park plaza with warm light and no extra performers',
    wardrobes: seed.anchors.map(anchor => ({ memberId: anchor.id, description: 'red tracksuit' })), ...override };
}
function rawPlan(job, override = {}) {
  const seed = job.productionSeed;
  const actors = second => seed.anchors.map(anchor => ({ memberId: anchor.id, action: second ? '몸통 흔들기' : anchor.kind === 'animal' ? anchor.species === 'penguin' ? '발 옆 딛기' : '앞발 딛기' : '발 옆 딛기' }));
  return { version: 3, seedId: seed.seedId, productionManifest: manifest(seed), title: '함께 터진 웃음', summary: '감추던 기쁨이 전해져 모두가 함께 움직인다.',
    imagePrompt: 'Full bodies; a restrained expression contrasts with eager weight movement. Gaze follows the saved premise cue.',
    previewPrompt: `0-2s: ${seed.anchors.map(anchor => anchor.id).join(',')} begin native foot and body accents toward the premise cue. 2-5s: surprise becomes delight as their body-weight responses spread.`,
    clips: ['Open the selected situation and spread its emotional response through native movement.', 'Continue the actual ending frame, reward the shared emotion and return to the opening invitation.'],
    choreography: { hookName: '웃음이 번지는 발걸음', firstPose: '몸통을 기울여 서로를 향해 첫 응답을 준비한다.', endPose: '발을 모으고 몸통을 돌려 처음의 기대를 연다.',
      steps: [{ count: 4, action: '첫 움직임', focus: 'body', actors: actors(false) }, { count: 4, action: '이어지는 움직임', focus: 'body', actors: actors(true) }],
      segments: [{ startSeconds: 0, endSeconds: 2, phase: 'opening', action: '발을 옆으로 딛고 몸통을 기울인다.', repeatHook: true },
        { startSeconds: 2, endSeconds: 22, phase: 'development', action: '몸통을 돌리고 발을 반대 방향으로 딛는다.', repeatHook: true },
        { startSeconds: 22, endSeconds: 28, phase: 'payoff', action: '발을 중앙에 딛고 몸통을 펼친다.', repeatHook: true },
        { startSeconds: 28, endSeconds: 30, phase: 'restart', action: '몸통을 낮추고 고개를 돌린다.', repeatHook: true }] }, ...override };
}
const response = payload => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }] });

test('public V3 premises are exact, bounded and client-safe; shared goals/payoffs and family labels remain valid', () => {
  const valid = premises(); assert.equal(validateDancePerformancePremisesV3(valid).length, 3); assert.ok(valid.every(isDancePerformancePremiseV3));
  for (const bad of [{ ...valid[0], signatureMove: '4카운트' }, { ...valid[0], visibleHook: '가'.repeat(181) }, { ...valid[0], version: 2 }]) assert.equal(isDancePerformancePremiseV3(bad), false);
  assert.throws(() => validateDancePerformancePremisesV3([valid[0], valid[0], valid[2]]));
  assert.throws(() => validateDancePerformancePremisesV3(valid.slice(0, 2)));
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/dance/premises.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  assert.doesNotMatch(compiled, /require\(/);
});
test('seed contains directly frozen identity anchors, with automatic production as hints and default realistic as a lock', () => {
  for (const p of [prefs(), prefs('human_animal', 'trio', 'dog'), prefs('animal', 'crowd', 'penguin')]) {
    const job = jobFor(p), seed = job.productionSeed;
    assert.equal(job.direction, undefined); assert.equal(seed.locks.locationId, null); assert.equal(seed.locks.danceStyleId, null); assert.equal(seed.locks.visualStyle, 'realistic');
    assert.equal(seed.anchors.length, seed.count); assert.ok(seed.anchors.every(anchor => !Object.hasOwn(anchor, 'identity') && !Object.hasOwn(anchor, 'position')));
    assert.ok(seed.anchors.filter(anchor => anchor.kind === 'human').every(anchor => anchor.adult && anchor.hair && anchor.face));
    const final = resolveDanceProductionDirectionV3(seed, manifest(seed, { locationId: 'beach', locationDetail: 'a clear beach boardwalk' }));
    assert.equal(final.version, 2); assert.equal(final.locationId, 'beach'); assert.deepEqual(final.cast.members.map(member => member.id), seed.anchors.map(anchor => anchor.id));
    assert.deepEqual(final.cast.members.map(member => member.species), seed.anchors.map(anchor => anchor.species));
  }
});
test('manifest validates explicit/brief location, style, layout, wardrobe and original anchor order before deriving a final cast', () => {
  const job = jobFor({ ...prefs(), location: 'studio', danceStyle: 'shuffle' }, '성인 여성 두 명이 나란히 빨간 운동복을 입고 스튜디오에서 셔플을 춘다.'), seed = job.productionSeed;
  assert.equal(seed.locks.locationId, 'studio'); assert.equal(seed.locks.danceStyleId, 'shuffle'); assert.equal(seed.locks.layoutId, 'side_by_side');
  const valid = manifest(seed, { locationDetail: 'a bright unobstructed dance studio' });
  assert.equal(validateDanceProductionManifestV3(valid, seed).version, 3);
  for (const bad of [{ ...valid, locationId: 'beach' }, { ...valid, danceStyleId: 'disco' }, { ...valid, layoutId: 'loose_arc' },
    { ...valid, wardrobes: [...valid.wardrobes].reverse() }, { ...valid, wardrobes: valid.wardrobes.map(item => ({ ...item, description: 'blue suit' })) },
    { ...valid, wardrobes: valid.wardrobes.map(item => ({ ...item, description: 'red tracksuit, blonde hair' })) }]) assert.throws(() => validateDanceProductionManifestV3(bad, seed));
  assert.throws(() => jobFor({ ...prefs(), location: 'studio' }, '해변에서 춤을 춘다.'));
});
test('the same single ideas request uses a new discriminator, immutable selection facts and no choreography schema', async () => {
  const job = jobFor(); let calls = 0;
  const result = await createDanceIdeas(job, async (_url, options) => {
    calls++; const request = JSON.parse(options.body), input = JSON.parse(request.messages[1].content), schema = request.response_format.json_schema;
    assert.equal(request.model, 'gpt-5.6-sol'); assert.equal(request.reasoning_effort, 'low'); assert.equal(schema.name, 'dance_performance_ideas_v3');
    const keys = Object.keys(schema.schema.properties.ideas.items.properties);
    assert.equal(keys.length, 12); assert.ok(!keys.includes('signatureSteps')); assert.equal(input.selectedDirection, undefined); assert.equal(input.visualBrief, job.visualBrief);
    assert.ok(matchesDanceExactFacts(input.selectionFacts, dancePerformanceSelectionFacts(job.productionSeed, job.musicSpec.id)));
    return response({ version: 3, selection: input.selectionFacts, ideas: premises() });
  });
  assert.equal(calls, 1); assert.deepEqual(result, premises());
});
test('V3 request directs an immediate consequential performance while the deployed legacy request stays byte-identical', async () => {
  const job = jobFor(); let v3Calls = 0;
  const result = await createDanceIdeas(job, async (_url, options) => {
    v3Calls++; const request = JSON.parse(options.body), system = request.messages[0].content, input = JSON.parse(request.messages[1].content);
    assert.match(system, /Internally compare a broad range of varied premises before choosing three distinct performances/);
    assert.match(system, /visibleHook is an action-still captured INSIDE an arresting ongoing action or an imminent physical event/);
    assert.match(system, /not a standing, waiting or lineup introduction/);
    assert.match(system, /characterGoal, emotionalReaction, turn and payoff form an observable causal chain through consequential body, partner or place action/);
    assert.match(system, /meaningful status reversal, comic physical event or earned skill achievement/);
    assert.match(system, /musical groove or instrument cue drives the attempt, reaction and turn/);
    assert.match(system, /productionRisk.*simplification that preserves the premise's cause and effect/);
    assert.match(system, /do not delete the interaction or impose fixed zones that contradict the premise/);
    assert.match(system, /without fixed named characters, props, story templates or examples/);
    assert.match(system, /no named celebrity, recognizable artist imitation or replicated existing choreography/);
    assert.match(system, /Do NOT write signature moves, count sequences, actor action matrices/);
    assert.match(system, /Creative appeal is reviewed by a human/);
    assert.equal(request.model, 'gpt-5.6-sol'); assert.equal(request.reasoning_effort, 'low'); assert.equal(request.max_completion_tokens, 6144);
    assert.equal(request.response_format.json_schema.name, 'dance_performance_ideas_v3');
    const fields = request.response_format.json_schema.schema.properties.ideas.items.properties;
    assert.match(fields.visibleHook.description, /frozen instant INSIDE consequential ongoing action or an imminent physical event/);
    assert.match(fields.payoff.description, /specific observable physical consequence resolving the same goal or uncertainty/);
    assert.equal(fields.visibleHook.type, 'string'); assert.equal(fields.visibleHook.maxLength, 180);
    assert.equal(fields.payoff.type, 'string'); assert.equal(fields.payoff.maxLength, 160);
    assert.deepEqual(input.selectionFacts, dancePerformanceSelectionFacts(job.productionSeed, job.musicSpec.id));
    assert.deepEqual(input.selectedMusic, Object.fromEntries(['id', 'label', 'style', 'rhythmPurpose'].map(key => [key, job.musicSpec[key]])));
    return response({ version: 3, selection: input.selectionFacts, ideas: premises() });
  });
  assert.equal(v3Calls, 1); assert.deepEqual(result, premises(), 'creative quality remains human-reviewed rather than a new semantic rejection gate');
  const legacy = { ...job }; delete legacy.planningVersion; delete legacy.productionSeed; let legacyCalls = 0;
  await assert.rejects(createDanceIdeas(legacy, async (_url, options) => {
    legacyCalls++; const request = JSON.parse(options.body);
    assert.equal(request.response_format.json_schema.name, 'dance_ideas_v2'); assert.equal(request.max_completion_tokens, 3072);
    // Captured from the same fixture against deployed commit 516b824 before this V3-only prompt edit.
    assert.equal(createHash('sha256').update(options.body).digest('hex'), '398b73d001a3ad196fc26c35e52fdb587a58f0a142f655c87abbcbf7120a37df');
    return Response.json({}, { status: 503 });
  }), error => error.code === 'PLAN_HTTP');
  assert.equal(legacyCalls, 1);
});
test('wrong V3 response discriminator, cast facts or locks reject without novelty retries', async () => {
  const job = jobFor();
  for (const change of [payload => { payload.version = 2; }, payload => { payload.selection.anchors[0].gender = 'man'; }, payload => { payload.selection.locks.visualStyle = 'illustration'; }]) {
    let calls = 0;
    await assert.rejects(createDanceIdeas(job, async (_url, options) => { calls++; const payload = { version: 3, selection: JSON.parse(JSON.parse(options.body).messages[1].content).selectionFacts, ideas: premises() }; change(payload); return response(payload); }), error => error.code === 'PLAN_INVALID');
    assert.equal(calls, 1);
  }
});
test('selected plan has one fresh bounded request and only the selected premise, frozen facts and hard locks', async () => {
  const job = { ...jobFor(), ideas: premises(), selectedIdea: premises()[1] }; let calls = 0;
  const plan = await createDancePlan(job, async (_url, options) => {
    calls++; const request = JSON.parse(options.body), input = JSON.parse(request.messages[1].content);
    assert.equal(request.response_format.json_schema.name, 'dance_plan_performance_v3'); assert.equal(request.max_completion_tokens, 4096);
    assert.deepEqual(input.selectedPremise, job.selectedIdea); assert.equal(input.ideas, undefined); assert.equal(input.productionHints, undefined); assert.equal(input.selectedDirection, undefined);
    assert.ok(!request.messages[0].content.includes(job.ideas[0].title));
    return response(rawPlan(job));
  });
  assert.equal(calls, 1); assert.equal(plan.version, 2); assert.equal(plan.performanceVersion, 3); assert.equal(plan.productionManifest.version, 3);
  assert.ok(plan.imagePrompt.includes('photorealistic live action')); assert.ok([plan.imagePrompt, ...plan.clips].every(prompt => Buffer.byteLength(prompt) <= 4096));
});
test('V3 plan rejects legacy fallback, missing preview, incomplete actors, invalid phases and replaced identity', () => {
  const job = jobFor(), valid = rawPlan(job);
  for (const bad of [{ ...valid, version: 2 }, { ...valid, previewPrompt: undefined }, { ...valid, previewPrompt: '0-2s performer_1 moves. 2-5s response.' },
    { ...valid, imagePrompt: 'Change the dancer to blonde hair.' }, { ...valid, identity: 'a different performer' }]) assert.throws(() => validateDancePerformancePlanV3(bad, job.productionSeed, 138));
  const missing = structuredClone(valid); missing.choreography.steps[0].actors.pop(); assert.throws(() => validateDancePerformancePlanV3(missing, job.productionSeed, 138));
  const phases = structuredClone(valid); phases.choreography.segments[1].phase = 'payoff'; assert.throws(() => validateDancePerformancePlanV3(phases, job.productionSeed, 138));
});
test('strict native actor matrices and final prompt budgets support woman duo, mixed trio and six penguins', () => {
  const jobs = [jobFor(prefs()), jobFor(prefs('human_animal', 'trio', 'dog')), jobFor(prefs('animal', 'crowd', 'penguin'), '펭귄 여섯 마리')];
  for (const job of jobs) {
    const plan = validateDancePerformancePlanV3(rawPlan(job), job.productionSeed, 138), direction = resolveDanceProductionDirectionV3(job.productionSeed, plan.productionManifest);
    const saved = { ...job, plan, selectedIdea: premises()[0], direction, productionManifest: plan.productionManifest, productionLockedAt: new Date().toISOString() };
    assert.equal(plan.cast.count, job.productionSeed.count); assert.equal(plan.choreography.steps[0].actors.length, plan.cast.count);
    assert.ok(Buffer.byteLength(buildDancePreviewPrompt(saved)) <= 4096); assert.ok(Buffer.byteLength(buildDancePacedClipPrompt(saved, plan.clips[1])) <= 4096);
    assert.throws(() => buildDancePreviewPrompt({ ...saved, plan: { ...plan, previewPrompt: undefined } }), error => error.code === 'PLAN_INVALID');
  }
  assert.equal(jobs[2].productionSeed.count, 6);
});

function fixture({ failure, gate } = {}) {
  let now = 10000, row = { id: TRACK, userId: USER, status: 'completed', audioUrl: 'https://storage.test/original.mp3', title: '원곡', isPublic: false, createdAt: new Date(now).toISOString(), licenseHash: 'initial',
    metadata: { workflow: 'dance-music-first-v1', presetId: 'dance_challenge', danceMusic: music } };
  const calls = [], states = [];
  const store = { load: async (user, track) => user === USER && track === TRACK ? structuredClone(row) : null,
    compareAndSwap: async (previous, job) => { if (previous.licenseHash !== row.licenseHash) return null; row = { ...row, metadata: { ...row.metadata, danceVideo: structuredClone(job) }, licenseHash: `write-${states.length}` }; states.push(structuredClone(job)); return structuredClone(row); } };
  const service = createDanceVideoService({ store, now: () => now,
    snapshot: async () => { calls.push('audio'); return { audioUrl: 'https://storage.test/selected.wav', audioHash: 'a'.repeat(64), sourceAudioHash: 'b'.repeat(64), sourceDurationSeconds: 180, bpm: 138 }; },
    reuseSnapshot: async () => { calls.push('reuse'); }, ideas: async () => { calls.push('ideas'); return premises(); },
    plan: async job => { calls.push('plan'); if (gate) await gate; const raw = rawPlan(job); if (failure) raw.productionManifest.wardrobes.reverse(); return validateDancePerformancePlanV3(raw, job.productionSeed, 138); },
    generateImage: async () => { calls.push('image'); return { url: 'https://storage.test/frame.png' }; }, startVideo: async () => { calls.push('video'); return { requestId: 'native-test' }; }, pollVideo: async () => ({ status: 'pending' }),
    copyAsset: async () => 'https://storage.test/asset', bridge: async () => '', render: async () => '', preview: async () => '' });
  return { service, calls, states, row: () => structuredClone(row), tick: () => { now += 5000; }, setJob: job => { row.metadata.danceVideo = structuredClone(job); row.licenseHash = `manual-${states.length}`; } };
}
test('prepare leaves production unresolved; selection commits plan, manifest, V2 direction and lock atomically', async () => {
  const c = fixture(), prepared = await c.service.prepare(USER, TRACK, 10, '', prefs(), 3);
  assert.equal(prepared.status, 'ideas'); assert.equal(prepared.direction, undefined); assert.equal(prepared.productionManifest, undefined); assert.equal(prepared.productionLockedAt, undefined);
  const planned = await c.service.selectIdea(USER, TRACK, prepared.id, prepared.ideas[1].id);
  assert.equal(planned.status, 'ready'); assert.equal(planned.direction.version, 2); assert.ok(planned.productionLockedAt); assert.deepEqual(planned.productionManifest, planned.plan.productionManifest);
  for (const state of c.states) assert.equal(Boolean(state.plan), Boolean(state.direction && state.productionManifest && state.productionLockedAt));
  assert.deepEqual(c.calls, ['audio', 'ideas', 'plan']);
  assert.deepEqual(planned.productionSeed, prepared.productionSeed); assert.equal(planned.audioHash, prepared.audioHash);
  const same = await c.service.prepare(USER, TRACK, 10, '', prefs(), 3); assert.equal(same.id, planned.id); assert.deepEqual(c.calls, ['audio', 'ideas', 'plan']);
  await assert.rejects(c.service.prepare(USER, TRACK, 10, '다른 이야기', prefs(), 3), error => error.code === 'PRODUCTION_LOCKED');
  await assert.rejects(c.service.selectIdea(USER, TRACK, planned.id, prepared.ideas[0].id), error => error.code === 'PRODUCTION_LOCKED');
});
test('invalid selected production preserves seed, premises, selected audio and holds with no partial production or automatic retry', async () => {
  const c = fixture({ failure: true }), before = await c.service.prepare(USER, TRACK, 10, '', prefs(), 3), failed = await c.service.selectIdea(USER, TRACK, before.id, before.ideas[0].id);
  assert.equal(failed.status, 'attention'); assert.equal(failed.failureCode, 'PLAN_INVALID'); assert.equal(failed.plan, undefined); assert.equal(failed.direction, undefined); assert.equal(failed.productionManifest, undefined); assert.equal(failed.productionLockedAt, undefined);
  assert.equal(failed.audioHash, before.audioHash); assert.deepEqual(failed.productionSeed, before.productionSeed); assert.deepEqual(failed.ideas, before.ideas); assert.equal(failed.selectedIdea.id, before.ideas[0].id);
  await c.service.advance(USER, TRACK, failed.id); assert.equal(c.calls.filter(call => call === 'plan').length, 1); assert.equal(c.calls.includes('image'), false);
});
test('planning version changes prepare idempotency and invalid version rejects before any preparation', async () => {
  const c = fixture(); await assert.rejects(c.service.prepare(USER, TRACK, 10, '', prefs(), 2), error => error.code === 'PREPARE_INPUT'); assert.deepEqual(c.calls, []);
  const v3 = await c.service.prepare(USER, TRACK, 10, '', prefs(), 3);
  const legacy = { ...v3 }; delete legacy.planningVersion; delete legacy.productionSeed; delete legacy.ideas; delete legacy.selectedIdea; c.setJob(legacy);
  const fresh = await c.service.prepare(USER, TRACK, 10, '', prefs(), 3); assert.notEqual(fresh.id, v3.id); assert.equal(fresh.planningVersion, 3);
  assert.equal(c.calls.filter(call => call === 'ideas').length, 2); assert.equal(c.calls.filter(call => call === 'audio').length, 1);
});
test('a stored V3 plan with missing production lock or malformed preview cannot start or resume media', async () => {
  const c = fixture(), prepared = await c.service.prepare(USER, TRACK, 10, '', prefs(), 3), planned = await c.service.selectIdea(USER, TRACK, prepared.id, prepared.ideas[0].id);
  const unlocked = { ...planned }; delete unlocked.productionLockedAt; c.setJob(unlocked);
  await assert.rejects(c.service.start(USER, TRACK, planned.id), error => error.code === 'PLAN_INVALID');
  const malformed = { ...planned, status: 'attention', failedStage: 'preview', previewRequestId: 'existing', plan: { ...planned.plan, previewPrompt: '한글 연출' } }; c.setJob(malformed);
  await assert.rejects(c.service.resume(USER, TRACK, planned.id), error => error.code === 'PLAN_INVALID');
  assert.equal(c.calls.includes('image'), false); assert.equal(c.calls.includes('video'), false);
});
