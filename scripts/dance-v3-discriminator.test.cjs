/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline stored-state regressions: rejected jobs never call planning, audio or media dependencies. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..'), cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const local = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', 'process', 'fetch', compiled)(local, mod, mod.exports, { env: {} }, () => { throw Error('NETWORK_FORBIDDEN'); });
  return mod.exports;
}
const { createDanceVideoService, buildDancePreviewPrompt, buildDancePacedClipPrompt } = load('src/lib/dance/videoService.ts');
const { resolveDanceProductionSeedV3, resolveDanceProductionDirectionV3 } = load('src/lib/dance/creativeDirection.ts');
const { validateDancePerformancePlanV3 } = load('src/lib/dance/videoPlan.ts');
const { resolveDanceMusicSpec } = load('src/lib/dance/musicProfiles.ts');
const USER = 'a0000000-0000-4000-8000-000000000001', TRACK = 'b0000000-0000-4000-8000-000000000001';
const JOB = 'c0000000-0000-4000-8000-000000000001';
const preferences = { performer: 'woman', ensemble: 'duo', species: 'auto', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' };
const music = resolveDanceMusicSpec('hook-pop', 'on', TRACK);
const stamp = new Date(10000).toISOString();
function premises() {
  return ['첫 응답', '함께 웃음', '작은 반전'].map((title, index) => ({ version: 3, id: `premise_${index}`, title, conceptFamily: 'interaction',
    visibleHook: '서로를 바라보며 발을 옆으로 딛는다.', characterGoal: '함께 즐거운 순간을 만들고 싶다.', emotionalReaction: '상대의 반응에 미소를 짓는다.',
    turn: '작은 발걸음이 상대에게 전해진다.', payoff: '함께 웃으며 처음의 발걸음을 다시 시작한다.', participation: '첫 응답을 예상하며 함께 따라 한다.',
    productionRisk: '몸이 겹치지 않도록 움직임을 작게 한다.', musicConnection: '킥과 신스의 응답이 활기찬 발걸음을 이끈다.' }));
}
function rawPlan(seed) {
  const actors = action => seed.anchors.map(anchor => ({ memberId: anchor.id, action }));
  return { version: 3, seedId: seed.seedId,
    productionManifest: { version: 3, locationId: 'park', danceStyleId: 'groove', layoutId: 'side_by_side',
      locationDetail: 'a level park plaza with warm light', wardrobes: seed.anchors.map(anchor => ({ memberId: anchor.id, description: 'red tracksuit' })) },
    title: '작은 응답', summary: '서로의 발걸음에 반응하며 함께 웃는다.', imagePrompt: 'Full bodies; eager foot movement and motivated gaze toward the shared cue.',
    previewPrompt: '0-2s: performer_1 and performer_2 begin native foot accents toward the shared cue. 2-5s: their body-weight responses spread with delight.',
    clips: ['Open the situation with native foot accents and an emotional response.', 'Continue the actual ending frame and reward the shared emotion.'],
    choreography: { hookName: '함께 웃는 발걸음', firstPose: '몸통을 서로에게 기울여 발을 옆으로 딛는다.', endPose: '발을 모으고 몸통을 돌려 처음의 기대를 연다.',
      steps: [{ count: 4, action: '첫 움직임', focus: 'feet', actors: actors('발 옆 딛기') }, { count: 4, action: '다음 움직임', focus: 'body', actors: actors('몸통 흔들기') }],
      segments: [{ startSeconds: 0, endSeconds: 2, phase: 'opening', action: '발을 옆으로 딛고 몸통을 기울인다.', repeatHook: true },
        { startSeconds: 2, endSeconds: 22, phase: 'development', action: '몸통을 돌리고 발을 반대로 딛는다.', repeatHook: true },
        { startSeconds: 22, endSeconds: 28, phase: 'payoff', action: '발을 중앙에 딛고 몸통을 펼친다.', repeatHook: true },
        { startSeconds: 28, endSeconds: 30, phase: 'restart', action: '몸통을 낮추고 고개를 돌린다.', repeatHook: true }] } };
}
function readyJob() {
  const productionSeed = resolveDanceProductionSeedV3(preferences, JOB, '', [], music);
  const plan = validateDancePerformancePlanV3(rawPlan(productionSeed), productionSeed, 138);
  return { id: JOB, trackId: TRACK, durationSeconds: 30, startSeconds: 10, status: 'ready', visualBrief: '', creativePreferences: preferences,
    audioUrl: 'https://storage.test/selected.wav', audioHash: 'a'.repeat(64), sourceAudioHash: 'b'.repeat(64), sourceDurationSeconds: 180,
    musicSpec: music, bpm: 138, createdAt: stamp, updatedAt: stamp, planningVersion: 3, productionSeed, ideas: premises(), selectedIdea: premises()[0],
    plan, direction: resolveDanceProductionDirectionV3(productionSeed, plan.productionManifest), productionManifest: plan.productionManifest,
    productionLockedAt: stamp, ideaReviewRequired: true, imageReviewRequired: true, qualityPreviewRequired: true };
}
function legacyJob(version) {
  const job = readyJob();
  for (const key of ['planningVersion', 'productionSeed', 'productionManifest', 'productionLockedAt', 'ideas', 'selectedIdea']) delete job[key];
  delete job.plan.performanceVersion; delete job.plan.productionManifest; delete job.plan.performanceStaging;
  job.ideaReviewRequired = false; job.qualityPreviewRequired = false;
  if (version === 1) { delete job.plan.version; delete job.plan.choreography; delete job.plan.cast; delete job.direction; }
  return job;
}
function fixture(job) {
  let writes = 0, row = { id: TRACK, userId: USER, status: 'completed', audioUrl: 'https://storage.test/original.mp3', licenseHash: 'initial',
    metadata: { workflow: 'dance-music-first-v1', presetId: 'dance_challenge', danceMusic: music, danceVideo: structuredClone(job) } };
  const calls = [];
  const store = { load: async (user, track) => user === USER && track === TRACK ? structuredClone(row) : null,
    compareAndSwap: async (previous, next) => { if (previous.licenseHash !== row.licenseHash) return null; writes++; row = { ...row, licenseHash: `write-${writes}`,
      metadata: { ...row.metadata, danceVideo: structuredClone(next) } }; return structuredClone(row); } };
  const service = createDanceVideoService({ store, now: () => 10000,
    snapshot: async () => { calls.push('audio'); throw Error('UNEXPECTED_AUDIO'); }, reuseSnapshot: async () => { calls.push('reuse'); },
    ideas: async () => { calls.push('ideas'); return premises(); }, plan: async next => { calls.push('plan'); return validateDancePerformancePlanV3(rawPlan(next.productionSeed), next.productionSeed, 138); },
    generateImage: async () => { calls.push('image'); return { url: 'https://storage.test/frame.png' }; },
    startVideo: async () => { calls.push('video'); return { requestId: 'native-test' }; }, pollVideo: async () => { calls.push('poll'); return { status: 'pending' }; },
    copyAsset: async () => { calls.push('copy'); return 'https://storage.test/copied'; }, bridge: async () => { calls.push('bridge'); return ''; },
    render: async () => { calls.push('render'); return ''; }, preview: async () => { calls.push('preview'); return ''; } });
  return { service, calls, row: () => structuredClone(row), writes: () => writes };
}
const operations = {
  prepare: c => c.service.prepare(USER, TRACK, 10, '', preferences, 3),
  select: c => c.service.selectIdea(USER, TRACK, JOB, 'premise_0'),
  start: c => c.service.start(USER, TRACK, JOB), advance: c => c.service.advance(USER, TRACK, JOB),
  approveFrame: c => c.service.approveFrame(USER, TRACK, JOB), approvePreview: c => c.service.approvePreview(USER, TRACK, JOB),
  resume: c => c.service.resume(USER, TRACK, JOB),
};
async function rejectsWithoutWork(job, names = Object.keys(operations)) {
  for (const name of names) {
    const c = fixture(job), before = c.row();
    await assert.rejects(operations[name](c), error => error.code === 'PLAN_INVALID', name);
    assert.deepEqual(c.calls, [], `${name} must not call any audio/planning/media dependency`);
    assert.equal(c.writes(), 0, `${name} must preserve the malformed stored job`);
    assert.deepEqual(c.row(), before);
  }
}

test('missing V3 job discriminator never falls through to legacy at any service mutation', async () => {
  for (const status of ['ready', 'image', 'preview', 'clip1', 'image-review', 'preview-review', 'attention']) {
    const job = readyJob(); job.status = status; delete job.planningVersion;
    job.imageUrl = 'https://storage.test/frame'; job.previewUrl = 'https://storage.test/preview'; job.previewSeconds = 5;
    job.failedStage = 'preview'; job.previewRequestId = 'existing-test';
    await rejectsWithoutWork(job);
  }
});
test('every residual V3 marker independently prevents a damaged discriminator from masquerading as legacy', async () => {
  const v3 = readyJob();
  const markers = [job => { job.productionSeed = v3.productionSeed; }, job => { job.productionManifest = v3.productionManifest; },
    job => { job.productionLockedAt = stamp; }, job => { job.plan.performanceVersion = 3; }, job => { job.plan.productionManifest = v3.productionManifest; },
    job => { job.ideas = premises(); }, job => { job.selectedIdea = premises()[0]; }];
  for (const marker of markers) { const job = legacyJob(2); job.status = 'image'; marker(job); await rejectsWithoutWork(job); }
  const reproduced = readyJob(); reproduced.status = 'image';
  delete reproduced.planningVersion; delete reproduced.plan.performanceVersion; delete reproduced.plan.productionManifest; delete reproduced.plan.previewPrompt; delete reproduced.productionLockedAt;
  await rejectsWithoutWork(reproduced);
});
test('missing or inconsistent locked V3 plan fields stop transitions before media or paid planning', async () => {
  const mutations = [job => { delete job.plan.performanceVersion; }, job => { delete job.plan.productionManifest; },
    job => { delete job.plan.previewPrompt; }, job => { delete job.productionLockedAt; }, job => { delete job.productionManifest; },
    job => { delete job.productionSeed; }, job => { job.productionSeed.seedId = TRACK; }, job => { job.productionSeed.version = 2; },
    job => { job.productionSeed.anchors.reverse(); }, job => { job.productionManifest.locationId = 'beach'; },
    job => { job.plan.clips = []; }, job => { job.plan.imagePrompt = ''; }, job => { job.plan.cast.members[0].species = 'robot'; }];
  for (const mutation of mutations) {
    const job = readyJob(); job.status = 'attention'; job.failedStage = 'preview'; job.previewRequestId = 'existing-test'; mutation(job);
    await rejectsWithoutWork(job);
  }
});
test('unsupported stored planning versions reject before any work, including pending selection', async () => {
  for (const version of [null, 0, 1, 2, 4, '3']) { const job = legacyJob(2); job.planningVersion = version; await rejectsWithoutWork(job); }
  const pending = readyJob(); pending.status = 'ideas';
  for (const key of ['plan', 'direction', 'productionManifest', 'productionLockedAt', 'selectedIdea']) delete pending[key];
  delete pending.planningVersion;
  await rejectsWithoutWork(pending);
});
test('intact pending V3 selection locks production once and valid locked V3 still starts media', async () => {
  const pending = readyJob(); pending.status = 'ideas';
  for (const key of ['plan', 'direction', 'productionManifest', 'productionLockedAt', 'selectedIdea']) delete pending[key];
  const c = fixture(pending), prepared = await c.service.prepare(USER, TRACK, 10, '', preferences, 3);
  assert.equal(prepared.id, JOB); assert.deepEqual(c.calls, []);
  const selected = await c.service.selectIdea(USER, TRACK, JOB, 'premise_0');
  assert.equal(selected.status, 'ready'); assert.equal(selected.plan.performanceVersion, 3); assert.ok(selected.productionLockedAt);
  assert.deepEqual(c.calls, ['plan']);
  await c.service.start(USER, TRACK, JOB);
  assert.equal((await c.service.advance(USER, TRACK, JOB)).status, 'image-review');
  await c.service.approveFrame(USER, TRACK, JOB); await c.service.advance(USER, TRACK, JOB);
  assert.deepEqual(c.calls, ['plan', 'image', 'copy', 'video']);
});
test('genuine V1 and V2 plans, including saved previewPrompt and V2 direction, retain their media transitions', async () => {
  for (const version of [1, 2]) {
    const job = legacyJob(version), c = fixture(job);
    assert.equal((await c.service.start(USER, TRACK, JOB)).status, 'image');
    assert.equal((await c.service.advance(USER, TRACK, JOB)).status, 'image-review');
    assert.equal((await c.service.approveFrame(USER, TRACK, JOB)).status, 'clip1');
    await c.service.advance(USER, TRACK, JOB);
    assert.deepEqual(c.calls, ['image', 'copy', 'video']);
  }
});
test('preview and paced clip compilers also reject residual V3 markers without a valid discriminator', () => {
  const job = readyJob(); delete job.planningVersion;
  assert.throws(() => buildDancePreviewPrompt(job), error => error.code === 'PLAN_INVALID');
  assert.throws(() => buildDancePacedClipPrompt(job, job.plan.clips[0]), error => error.code === 'PLAN_INVALID');
});
