/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline V3 staging compatibility, actor continuity, and pre-spend corruption guards. */
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
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const local = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', 'process', 'fetch', compiled)(local, mod, mod.exports,
    { env: { OPENAI_API_KEY: 'offline-staging-only' } }, () => { throw Error('NETWORK_FORBIDDEN'); });
  return mod.exports;
}
const { buildDanceCastPrompt } = load('src/lib/dance/cast.ts');
const { compactDanceCastPrompt, danceCastRoster } = load('src/lib/dance/ideas.ts');
const { resolveDanceProductionSeedV3, resolveDanceProductionDirectionV3 } = load('src/lib/dance/creativeDirection.ts');
const { validateDancePerformancePlanV3, validateDancePlan, createDancePlan } = load('src/lib/dance/videoPlan.ts');
const { createDanceVideoService, buildDancePreviewPrompt, buildDancePacedClipPrompt } = load('src/lib/dance/videoService.ts');
const music = load('src/lib/dance/musicProfiles.ts').resolveDanceMusicSpec('hook-pop', 'on', 'staging');
const USER = 'a0000000-0000-4000-8000-000000000001', TRACK = 'a0000000-0000-4000-8000-000000000002', JOB = 'a0000000-0000-4000-8000-000000000003';
const PREFERENCES = { performer: 'human_animal', ensemble: 'trio', species: 'penguin', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' };
const PREMISE = { version: 3, id: 'closing-gate', conceptFamily: 'interaction', title: '닫히는 펭귄 문',
  visibleHook: '여성이 두 펭귄 사이를 빠져나가려 몸을 비튼 순간, 양쪽 펭귄이 안쪽으로 미끄러져 통로를 닫으려 한다.', characterGoal: '여성은 좁아지는 틈을 통과해 반대편에 닿으려 한다.',
  emotionalReaction: '펭귄들이 발을 구르며 압박하고 여성은 빈틈을 탐색한다.', turn: '여성이 후퇴하자 따라 닫히던 펭귄들의 동선이 교차해 진행을 막는다.',
  payoff: '여성이 바깥길로 돌아 목표에 닿고 펭귄들이 뒤늦게 방향을 튼다.', participation: '여성이 어느 틈으로 탈출할지 먼저 고른다.',
  productionRisk: '이동 거리를 줄이고 한 번의 후퇴와 교차만 남긴다.', musicConnection: '베이스의 좌우 당김이 접근과 후퇴의 체중 이동을 받친다.' };
function jobFor(preferences = PREFERENCES, brief = '성인 여성 한 명과 펭귄 두 마리가 함께 공연한다.') {
  return { id: JOB, trackId: TRACK, planningVersion: 3, visualBrief: brief, creativePreferences: preferences, musicSpec: music, bpm: 138,
    productionSeed: resolveDanceProductionSeedV3(preferences, JOB, brief, [], music), selectedIdea: PREMISE,
    ideas: [PREMISE, { ...PREMISE, id: 'other-one', title: '숨은 작은 응원' }, { ...PREMISE, id: 'other-two', title: '반대로 열린 순간' }],
    startSeconds: 0, durationSeconds: 30, audioUrl: 'https://storage.test/approved.wav', audioHash: 'a'.repeat(64), sourceAudioHash: 'b'.repeat(64), sourceDurationSeconds: 180,
    createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' };
}
function rawPlan(job) {
  const seed = job.productionSeed;
  const productionManifest = { version: 3, locationId: 'park', danceStyleId: 'groove', layoutId: seed.locks.layoutId || (seed.count === 2 ? 'side_by_side' : seed.count === 3 ? 'open_triangle' : 'staggered_rows'),
    locationDetail: 'a level park plaza with warm light and open floor space', wardrobes: seed.anchors.map(anchor => ({ memberId: anchor.id, description: 'red tracksuit' })) };
  return { version: 3, seedId: seed.seedId, productionManifest, title: '닫히는 통로의 반전', summary: '후퇴와 방향 전환으로 막혔던 통로를 돌아 나간다.',
    imagePrompt: 'Full bodies; an ongoing attempt at a clear route creates physical tension, with planted feet and gaze toward the relevant partner.',
    previewPrompt: `0-2s: ${seed.anchors.map(anchor => anchor.id).join(',')} use native steps to narrow a route. 2-5s: a continuous retreat and inward footwork cause a visible obstruction; weight shifts reveal the next route.`,
    clips: ['Continuous short native approaches narrow the route and cause a retreat, with clearly planted steps and readable body direction.',
      'Continue the actual prior ending frame, follow the newly open outer route and clear the obstruction before a motivated restart.'],
    choreography: { hookName: '닫히는 길의 발걸음', firstPose: '몸통을 기울여 틈을 향해 발을 딛는다.', endPose: '발을 모으고 몸통을 돌려 시작을 잇는다.',
      steps: [{ count: 4, action: '첫 움직임', focus: 'feet', actors: seed.anchors.map(anchor => ({ memberId: anchor.id, action: '발 옆 딛기' })) },
        { count: 4, action: '이어지는 움직임', focus: 'body', actors: seed.anchors.map(anchor => ({ memberId: anchor.id, action: '몸통 흔들기' })) }],
      segments: [{ startSeconds: 0, endSeconds: 2, phase: 'opening', action: '발을 옆으로 딛고 몸통을 기울인다.', repeatHook: true },
        { startSeconds: 2, endSeconds: 22, phase: 'development', action: '발을 뒤로 딛고 몸통을 돌린다.', repeatHook: true },
        { startSeconds: 22, endSeconds: 28, phase: 'payoff', action: '발을 바깥으로 딛고 몸통을 펼친다.', repeatHook: true },
        { startSeconds: 28, endSeconds: 30, phase: 'restart', action: '몸통을 낮추고 고개를 돌린다.', repeatHook: true }] } };
}
function lock(job, plan) {
  return { ...job, status: 'ready', plan, direction: resolveDanceProductionDirectionV3(job.productionSeed, plan.productionManifest), productionManifest: plan.productionManifest,
    productionLockedAt: '2026-10-10T00:00:00Z', imageReviewRequired: true, qualityPreviewRequired: true };
}
function fixture(saved) {
  let row = { id: TRACK, userId: USER, title: '원곡', isPublic: false, createdAt: saved.createdAt, status: 'completed', audioUrl: 'https://storage.test/original.mp3',
    metadata: { workflow: 'dance-music-first-v1', presetId: 'dance_challenge', danceMusic: music, danceVideo: structuredClone(saved) } };
  row.licenseHash = JSON.stringify(row.metadata);
  let paid = 0, writes = 0;
  const forbidden = async () => { paid++; throw Error('PAID_OR_MEDIA_FORBIDDEN'); };
  const service = createDanceVideoService({ store: { load: async (user, track) => user === USER && track === TRACK ? structuredClone(row) : null,
    compareAndSwap: async (previous, job) => { if (previous.licenseHash !== row.licenseHash) return null; writes++; const metadata = { ...row.metadata, danceVideo: structuredClone(job) };
      row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; return structuredClone(row); } },
    snapshot: forbidden, reuseSnapshot: forbidden, ideas: forbidden, plan: forbidden, generateImage: forbidden, startVideo: forbidden, pollVideo: forbidden, copyAsset: forbidden,
    bridge: forbidden, render: forbidden, preview: forbidden });
  return { service, paid: () => paid, writes: () => writes, row: () => structuredClone(row) };
}

test('default full and compact cast helper bytes remain exactly compatible', () => {
  const job = jobFor(), cast = resolveDanceProductionDirectionV3(job.productionSeed, rawPlan(job).productionManifest).cast;
  const roster = cast.members.map(member => `${member.id}=${member.identity}@${member.position}`).join('; ');
  const anatomy = 'human_biped: two feet, knees, hips, torso and arms; penguin_biped: two short feet, waddling weight shifts and flippers; no human hands, knees or arms';
  assert.equal(buildDanceCastPrompt(cast), `CAST CONTRACT: exactly 3 human_animal performers; trio; open triangle. ${roster}. Stable IDs, species, appearance and slots; no added, merged or missing bodies. Anatomy: ${anatomy}.`);
  assert.equal(compactDanceCastPrompt(cast), 'CAST CONTRACT: exactly 3 human_animal performers; open triangle. performer_1=human/lead/front-center; performer_2=penguin/partner/rear-left; performer_3=penguin/ensemble/rear-right. All remain visible; no extra, missing, merged or replaced actors. Each follows its own role and native anatomy, never identical forced human steps.');
  assert.equal(buildDanceCastPrompt(cast, undefined), buildDanceCastPrompt(cast)); assert.equal(compactDanceCastPrompt(cast, undefined), compactDanceCastPrompt(cast));
});
test('fresh actual mixed V3 compiler, preview and clip2 preserve continuous approved travel', () => {
  const job = jobFor(), raw = rawPlan(job), plan = validateDancePerformancePlanV3(raw, job.productionSeed, 138), saved = lock(job, plan);
  assert.equal(plan.performanceStaging, 'initial'); assert.match(plan.imagePrompt, /Initial staging:/); assert.doesNotMatch(plan.imagePrompt, /Stable IDs, species, appearance and slots/);
  for (const prompt of [...plan.clips, buildDancePreviewPrompt(saved)]) { assert.match(prompt, /opening stage anchors/i); assert.match(prompt, /approved continuous native paths/);
    assert.match(prompt, /Continue clip2 from actual ending poses and positions; never reapply opening anchors/); assert.doesNotMatch(prompt, /Stable IDs, species, appearance and slots/); }
  assert.match(plan.clips[1], /actual final frame of clip 1; continue exact pose\/camera\/positions/); assert.match(plan.clips[1], /no early reset/);
  assert.deepEqual(plan.cast, saved.direction.cast); assert.deepEqual(saved.direction, resolveDanceProductionDirectionV3(job.productionSeed, raw.productionManifest));
  assert.equal(plan.choreography.steps.reduce((sum, step) => sum + step.count, 0), 8);
  assert.deepEqual(plan.choreography.steps[0].actors.map(actor => actor.memberId), ['performer_1', 'performer_2', 'performer_3']);
});
test('server derives flag while provider schema and one selected-plan request stay unchanged', async () => {
  const job = jobFor(); let calls = 0;
  const plan = await createDancePlan(job, async (_url, options) => { calls++; const request = JSON.parse(options.body);
    assert.equal(request.response_format.json_schema.name, 'dance_plan_performance_v3'); assert.equal(request.max_completion_tokens, 4096);
    assert.equal(request.response_format.json_schema.schema.properties.performanceStaging, undefined);
    assert.match(request.messages[0].content, /continuous.*native paths/); return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(rawPlan(job)) } }] }); });
  assert.equal(calls, 1); assert.equal(plan.performanceStaging, 'initial');
  assert.throws(() => validateDancePerformancePlanV3({ ...rawPlan(job), performanceStaging: 'initial' }, job.productionSeed, 138), { code: 'PLAN_INVALID' });
});
test('explicit layout lock preserves required relative formation without making bodies static', () => {
  const job = jobFor(PREFERENCES, '성인 여성 한 명과 펭귄 두 마리가 삼각 대형으로 함께 공연한다.');
  assert.equal(job.productionSeed.locks.layoutId, 'open_triangle'); const plan = validateDancePerformancePlanV3(rawPlan(job), job.productionSeed, 138), saved = lock(job, plan);
  assert.equal(plan.performanceStaging, 'layout-locked'); assert.equal(plan.productionManifest.layoutId, 'open_triangle');
  for (const prompt of [plan.imagePrompt, ...plan.clips, buildDancePreviewPrompt(saved)]) { assert.match(prompt, /Explicit required relative formation: open triangle/); assert.match(prompt, /bodies are not static/); }
  assert.match(plan.clips[1], /never reapply opening anchors/);
});
test('older V3 plans without staging flag retain original preview bytes and continue saved production', async () => {
  const job = jobFor(), raw = rawPlan(job), direction = resolveDanceProductionDirectionV3(job.productionSeed, raw.productionManifest);
  const old = { ...validateDancePlan({ ...raw, version: 2, identity: '3 original human_animal performers with frozen identities', castRoster: danceCastRoster(direction.cast) }, direction, job.musicSpec.bpm),
    performanceVersion: 3, productionManifest: raw.productionManifest };
  assert.equal(old.performanceStaging, undefined); const saved = lock(job, old), preview = buildDancePreviewPrompt(saved);
  assert.match(old.imagePrompt, /Stable IDs, species, appearance and slots/); assert.match(preview, /CAST CONTRACT: exactly 3 human_animal performers; open triangle/);
  assert.doesNotMatch(preview, /opening stage anchors|never reapply opening anchors|bodies are not static/);
  // Compared independently against deployed 546443f before recording this old-V3 preview snapshot.
  assert.equal(createHash('sha256').update(preview).digest('hex'), 'a57e655264d4ae37486fc4be1d6ef6171b1d1ae253179945d9a7654db3488f4e');
  assert.equal(buildDancePacedClipPrompt(saved, old.clips[1]), old.clips[1]);
  const c = fixture(saved), started = await c.service.start(USER, TRACK, JOB);
  assert.equal(started.status, 'image'); assert.deepEqual(started.plan, old); assert.equal(started.plan.performanceStaging, undefined);
  assert.equal(c.paid(), 0); assert.equal(c.writes(), 1);
});
test('new staging keeps actor counts/native validation and all final prompts within 4096 UTF8 bytes', () => {
  for (const [preferences, brief] of [[{ ...PREFERENCES, performer: 'woman', ensemble: 'duo', species: 'auto' }, '성인 여성 두 명'],
    [PREFERENCES, '성인 여성 한 명과 펭귄 두 마리가 함께 공연한다.'], [{ ...PREFERENCES, performer: 'animal', ensemble: 'crowd' }, '펭귄 네 마리'],
    [{ ...PREFERENCES, performer: 'animal', ensemble: 'crowd' }, '펭귄 여섯 마리']]) {
    const job = jobFor(preferences, brief), plan = validateDancePerformancePlanV3(rawPlan(job), job.productionSeed, 138), saved = lock(job, plan);
    for (const prompt of [plan.imagePrompt, ...plan.clips, buildDancePreviewPrompt(saved), buildDancePacedClipPrompt(saved, plan.clips[1])]) assert.ok(Buffer.byteLength(prompt, 'utf8') <= 4096);
    assert.equal(plan.cast.count, job.productionSeed.count); assert.ok(plan.choreography.steps.every(step => step.actors.length === plan.cast.count));
    const bad = rawPlan(job); bad.choreography.steps[0].actors.pop(); assert.throws(() => validateDancePerformancePlanV3(bad, job.productionSeed, 138), { code: 'PLAN_INVALID' });
  }
});
test('malformed or seed-inconsistent staging flags refuse saved production before writes or paid calls', async () => {
  const job = jobFor(), plan = validateDancePerformancePlanV3(rawPlan(job), job.productionSeed, 138);
  for (const flag of [null, {}, '', 'unknown', 'layout-locked']) {
    const saved = lock(job, { ...plan, performanceStaging: flag }), c = fixture(saved);
    await assert.rejects(c.service.start(USER, TRACK, JOB), { code: 'PLAN_INVALID' });
    await assert.rejects(c.service.advance(USER, TRACK, JOB), { code: 'PLAN_INVALID' });
    assert.equal(c.paid(), 0); assert.equal(c.writes(), 0);
  }
  const locked = jobFor(PREFERENCES, '성인 여성 한 명과 펭귄 두 마리가 삼각 대형으로 함께 공연한다.'), lockedPlan = validateDancePerformancePlanV3(rawPlan(locked), locked.productionSeed, 138);
  const c = fixture(lock(locked, { ...lockedPlan, performanceStaging: 'initial' }));
  await assert.rejects(c.service.start(USER, TRACK, JOB), { code: 'PLAN_INVALID' }); assert.equal(c.paid(), 0);
});
test('staging field alone remains V3 evidence when other discriminators are stripped', async () => {
  const job = jobFor(), plan = validateDancePerformancePlanV3(rawPlan(job), job.productionSeed, 138);
  delete plan.performanceVersion; delete plan.productionManifest;
  const legacy = { id: JOB, trackId: TRACK, status: 'ready', startSeconds: 0, durationSeconds: 30, visualBrief: '', createdAt: job.createdAt, updatedAt: job.updatedAt,
    audioUrl: job.audioUrl, audioHash: job.audioHash, plan };
  const c = fixture(legacy); await assert.rejects(c.service.start(USER, TRACK, JOB), { code: 'PLAN_INVALID' }); assert.equal(c.paid(), 0); assert.equal(c.writes(), 0);
});
