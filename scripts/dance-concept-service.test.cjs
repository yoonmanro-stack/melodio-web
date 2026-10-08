/* eslint-disable @typescript-eslint/no-require-imports */
/** Owner-scoped concept selection and preview gates; memory storage and synthetic media only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
function loader() {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(ROOT, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`)
      : name.startsWith('.') ? load(path.relative(ROOT, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', compiled)(localRequire, mod, mod.exports, { env: {} }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}
const load = loader();
const { createDanceVideoService, DanceVideoError, DANCE_VIDEO_LEASE_MS } = load('src/lib/dance/videoService.ts');
const { validateDanceIdeas } = load('src/lib/dance/ideas.ts');
const { resolveDanceMusicSpec } = load('src/lib/dance/musicProfiles.ts');
const USER = 'a0000000-0000-4000-8000-000000000001';
const TRACK = 'b0000000-0000-4000-8000-000000000001';
const OTHER = 'a0000000-0000-4000-8000-000000000002';
const PREFERENCES = { performer: 'woman', location: 'street', danceStyle: 'shuffle', visualStyle: 'realistic', difficulty: 'easy' };
const BRIEF = '성인 여성이 거리 광장에서 하우스의 발 스텝으로 짧은 훅을 반복한다.';
const IDEAS = [
  { id: 'ball-reply', title: '발끝으로 보낸 답장', conceptFamily: 'interaction',
    firstTwoSeconds: '0~2초: 성인 여성은 거리 광장에서 발로 작은 공을 살짝 밀고 공을 향해 몸통을 기울여 응답한다.',
    signatureMove: '2카운트: 오른발로 공을 작게 밀기 / 2카운트: 왼발을 옆으로 딛기 / 4카운트: 몸통을 공 쪽으로 기울이기',
    musicConnection: '풋워크 · 하우스의 킥을 따라 발 교차·스텝 터치·방향 전환을 짧게 반복하고 열린 하이햇에 몸통을 기울인다.',
    visualPayoff: '발을 원래 자리로 딛고 돌아오는 공에 몸통을 기울여 작은 응답을 이어 간다.',
    seriesPotential: '같은 밀기 훅을 유지하고 다음 편에서는 공의 색과 응답 방향을 바꾼다.',
    productionRisk: '발과 공의 접촉이 흔들릴 수 있어 공의 이동 거리를 줄이고 접촉 장면을 확인한다.' },
  { id: 'opposed-body', title: '위아래 다른 대답', conceptFamily: 'contrast',
    firstTwoSeconds: '0~2초: 성인 여성은 거리 광장에서 상체를 왼쪽으로 돌리고 무릎은 오른쪽으로 튕겨 반대 방향의 대비를 만든다.',
    signatureMove: '2카운트: 상체를 왼쪽으로 돌리기 / 2카운트: 무릎을 오른쪽으로 튕기기 / 4카운트: 발을 작게 교차해 딛기',
    musicConnection: '풋워크 · 하우스의 킥을 따라 발 교차·스텝 터치·방향 전환을 짧게 반복하고 열린 하이햇에 몸통을 기울인다.',
    visualPayoff: '상체와 무릎의 반대 방향을 뒤집어 한 번 더 튕긴 뒤 발을 중앙에 딛는다.',
    seriesPotential: '같은 위아래 대비 훅을 반복하고 다음 편에서는 큰 동작과 작은 동작의 배치를 바꾼다.',
    productionRisk: '상체와 하체 방향이 섞일 수 있어 회전 폭을 작게 제한하고 몸통 전체를 프레임에 유지한다.' },
  { id: 'fold-open', title: '접었다 펼치는 첫 박자', conceptFamily: 'rhythm_reveal',
    firstTwoSeconds: '0~2초: 성인 여성은 거리 광장에서 발을 모아 팔을 접었다가 옆으로 딛는 순간 양팔을 펼쳐 열린 모양을 드러낸다.',
    signatureMove: '2카운트: 몸통 앞에서 양팔을 접기 / 2카운트: 오른발을 옆으로 딛기 / 4카운트: 양팔을 천천히 펼치기',
    musicConnection: '풋워크 · 하우스의 킥을 따라 발 교차·스텝 터치·방향 전환을 짧게 반복하고 열린 하이햇에 몸통을 기울인다.',
    visualPayoff: '발을 모으며 양팔을 다시 접고 옆으로 딛어 같은 열린 모양을 한 번 더 펼친다.',
    seriesPotential: '같은 접고 펼치는 훅을 그대로 유지하고 다음 편에서는 펼치는 높이를 바꿔 변주한다.',
    productionRisk: '펼치는 손 모양이 흐트러질 수 있어 손가락 동작을 단순하게 하고 팔의 이동 속도를 줄인다.' },
];
validateDanceIdeas(IDEAS);
const PLAN = { version: 2, title: IDEAS[0].title, summary: '발 스텝과 몸통 응답을 반복한다.', identity: 'one original adult woman', imagePrompt: 'opening full-body pose in a street plaza', clips: ['clip one: step and body response', 'clip two: continue the same step and body response'],
  choreography: { hookName: '발끝 응답', firstPose: '두 발을 바닥에 딛고 공을 향해 몸통을 기울인다.', endPose: '발을 중앙에 딛고 몸통을 세워 멈춘다.',
    steps: [{ count: 2, action: '오른발로 공을 작게 민다.', focus: 'feet' }, { count: 2, action: '왼발을 옆으로 딛는다.', focus: 'feet' }, { count: 4, action: '공 쪽으로 몸통을 기울인다.', focus: 'body' }],
    segments: [{ startSeconds: 0, endSeconds: 10, action: '발과 몸통 응답 훅을 반복한다.', repeatHook: true }, { startSeconds: 10, endSeconds: 20, action: '발과 몸통 응답 훅의 방향을 바꾸어 반복한다.', repeatHook: true }, { startSeconds: 20, endSeconds: 30, action: '같은 발과 몸통 훅을 반복하고 마지막에 멈춘다.', repeatHook: true }] } };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture(overrides = {}, { withIdeas = true, withPreview = true } = {}) {
  let time = 10000, writes = 0;
  const music = resolveDanceMusicSpec('house-footwork', 'on', TRACK);
  const metadata = { workflow: 'dance-music-first-v1', presetId: 'dance_challenge', sourceMenu: 'dance', isPublic: false, isInstrumental: false, instrumental: false, danceMusic: music };
  let row = { id: TRACK, userId: USER, title: '원곡', isPublic: false, createdAt: new Date(time).toISOString(), status: 'completed', audioUrl: 'https://storage.test/original.mp3', metadata, licenseHash: JSON.stringify(metadata) };
  const calls = [];
  const store = {
    load: async (owner, track) => owner === USER && track === TRACK ? structuredClone(row) : null,
    compareAndSwap: async (previous, job) => {
      if (previous.userId !== USER || previous.id !== TRACK || previous.licenseHash !== row.licenseHash) return null;
      const metadata = { ...row.metadata, danceVideo: structuredClone(job) };
      row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; writes++;
      return structuredClone(row);
    },
  };
  const deps = {
    store, now: () => time,
    snapshot: async job => { calls.push(['snapshot', job.startSeconds]); return { audioUrl: 'https://storage.test/selected.wav', audioHash: 'a'.repeat(64), sourceAudioHash: 'b'.repeat(64), sourceDurationSeconds: 180, bpm: 128, onsetSeconds: [0.48, 0.96] }; },
    reuseSnapshot: async () => { calls.push(['reuse-snapshot']); },
    ...(withIdeas ? { ideas: async job => { calls.push(['ideas', structuredClone(job)]); return structuredClone(IDEAS); } } : {}),
    plan: async job => { calls.push(['plan', structuredClone(job)]); return structuredClone(PLAN); },
    generateImage: async prompt => { calls.push(['image', prompt]); return { url: 'https://imgen.x.ai/first-frame.png' }; },
    startVideo: async (prompt, duration, frame, options) => { calls.push(['video', prompt, duration, frame, options]); return { requestId: `native-${calls.filter(call => call[0] === 'video').length}` }; },
    pollVideo: async id => { calls.push(['poll', id]); return { status: 'done', url: `https://vidgen.x.ai/${id}.mp4` }; },
    copyAsset: async (_job, kind, url, filename) => { calls.push(['copy', kind, url, filename]); return `https://storage.test/${filename}`; },
    ...(withPreview ? { preview: async job => { calls.push(['preview-render', structuredClone(job)]); return 'https://storage.test/preview-5s.mp4'; } } : {}),
    bridge: async job => { calls.push(['bridge', job.clip1Url]); return 'https://storage.test/bridge.jpg'; },
    render: async job => { calls.push(['render', structuredClone(job)]); return 'https://storage.test/final.mp4'; },
    ...overrides,
  };
  return { service: createDanceVideoService(deps), deps, calls, row: () => structuredClone(row), writes: () => writes, tick: (ms = 5000) => { time += ms; },
    setJob: job => { const metadata = { ...row.metadata, danceVideo: structuredClone(job) }; row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; } };
}
const count = (ctx, kind) => ctx.calls.filter(call => call[0] === kind).length;
const prepare = ctx => ctx.service.prepare(USER, TRACK, 20, BRIEF, PREFERENCES);
async function advance(ctx, job) { ctx.tick(); return ctx.service.advance(USER, TRACK, job.id); }
async function planSelected(ctx, ideaId = IDEAS[0].id) { const ideas = await prepare(ctx); return ctx.service.selectIdea(USER, TRACK, ideas.id, ideaId); }
async function firstFrame(ctx) { let job = await planSelected(ctx); job = await ctx.service.start(USER, TRACK, job.id); return advance(ctx, job); }
async function previewReview(ctx) {
  const frame = await firstFrame(ctx); assert.equal(frame.status, 'image-review');
  let job = await ctx.service.approveFrame(USER, TRACK, frame.id); assert.equal(job.status, 'preview');
  for (let attempt = 0; attempt < 8 && !['preview-review', 'attention'].includes(job.status); attempt++) job = await advance(ctx, job);
  return job;
}

test('prepare persists exactly three validated ideas without selecting or spending a full plan/image/video call', async () => {
  const c = fixture(); const job = await prepare(c);
  assert.equal(job.status, 'ideas'); assert.deepEqual(job.ideas, IDEAS); assert.equal(job.ideaReviewRequired, true);
  assert.equal(job.selectedIdea, undefined); assert.equal(job.plan, undefined); assert.equal(job.imageUrl, undefined);
  assert.deepEqual(c.row().metadata.danceVideo.ideas, IDEAS);
  assert.equal(count(c, 'snapshot'), 1); assert.equal(count(c, 'ideas'), 1); assert.equal(count(c, 'plan'), 0); assert.equal(count(c, 'image'), 0); assert.equal(count(c, 'video'), 0);
  const unchanged = await c.service.start(USER, TRACK, job.id); assert.equal(unchanged.status, 'ideas');
  const advanced = await advance(c, job); assert.equal(advanced.status, 'ideas');
  const repeated = await prepare(c); assert.equal(repeated.id, job.id); assert.equal(count(c, 'ideas'), 1); assert.equal(count(c, 'plan'), 0);
});
test('invalid provider ideas hold the saved audio and never auto-plan or auto-request replacement ideas', async () => {
  let ideasCalls = 0;
  const c = fixture({ ideas: async () => { ideasCalls++; return structuredClone(IDEAS.slice(0, 2)); } });
  const job = await prepare(c);
  assert.equal(job.status, 'attention'); assert.equal(job.failureCode, 'PLAN_INVALID'); assert.equal(job.audioHash, 'a'.repeat(64));
  assert.equal(job.ideas, undefined); assert.equal(job.selectedIdea, undefined); assert.equal(count(c, 'plan'), 0);
  await prepare(c); await advance(c, job); assert.equal(ideasCalls, 1); assert.equal(count(c, 'image'), 0); assert.equal(count(c, 'video'), 0);
});
test('selected own-array idea is checkpointed before planning and concurrent selection has one paid plan', async () => {
  const gate = deferred(); let plans = 0, observed;
  const c = fixture({ plan: async job => {
    plans++; observed = structuredClone(job);
    assert.deepEqual(c.row().metadata.danceVideo.selectedIdea, IDEAS[1]);
    assert.equal(c.row().metadata.danceVideo.conceptPlanAttempts, 1); assert.equal(c.row().metadata.danceVideo.inFlight.action, 'select-idea');
    await gate.promise; return structuredClone(PLAN);
  } });
  const ideas = await prepare(c);
  const selecting = c.service.selectIdea(USER, TRACK, ideas.id, IDEAS[1].id); await new Promise(setImmediate);
  const duplicate = await c.service.selectIdea(USER, TRACK, ideas.id, IDEAS[1].id);
  assert.equal(duplicate.status, 'preparing'); assert.equal(plans, 1);
  gate.resolve(); const ready = await selecting;
  assert.equal(ready.status, 'ready'); assert.deepEqual(ready.selectedIdea, IDEAS[1]); assert.deepEqual(observed.selectedIdea, IDEAS[1]);
  assert.deepEqual(observed.direction, ideas.direction); assert.deepEqual(observed.musicSpec, ideas.musicSpec); assert.equal(ready.conceptPlanAttempts, 1);
  const writes = c.writes(); await c.service.selectIdea(USER, TRACK, ideas.id, IDEAS[0].id);
  assert.equal(c.writes(), writes); assert.equal(plans, 1); assert.deepEqual(c.row().metadata.danceVideo.selectedIdea, IDEAS[1]);
  assert.equal(count(c, 'image'), 0); assert.equal(count(c, 'video'), 0);
});
test('selection rejects another owner/job and arbitrary idea payloads before plan writes or spending', async () => {
  const c = fixture(); const job = await prepare(c), writes = c.writes();
  await assert.rejects(c.service.selectIdea(OTHER, TRACK, job.id, IDEAS[0].id), { code: 'TRACK_NOT_FOUND' });
  await assert.rejects(c.service.selectIdea(USER, TRACK, OTHER, IDEAS[0].id), { code: 'JOB_NOT_FOUND' });
  for (const ideaId of [null, { ...IDEAS[0] }, 'not-owned', 'bad id']) await assert.rejects(c.service.selectIdea(USER, TRACK, job.id, ideaId), { code: 'IDEA_SELECTION' });
  assert.equal(c.writes(), writes); assert.equal(count(c, 'plan'), 0);
  job.ideas[0].title = '외부 변경';
  assert.equal(c.row().metadata.danceVideo.ideas[0].title, IDEAS[0].title);
});
test('concept planning gets at most two explicit attempts and never retries itself after failure', async () => {
  let plans = 0;
  const c = fixture({ plan: async () => { plans++; throw new DanceVideoError('기획 연결 확인이 필요합니다.', 'PLAN_CONNECTION', 502); } });
  const ideas = await prepare(c);
  let job = await c.service.selectIdea(USER, TRACK, ideas.id, IDEAS[0].id);
  assert.equal(job.status, 'attention'); assert.equal(job.conceptPlanAttempts, 1); assert.equal(job.selectedIdea.id, IDEAS[0].id);
  await advance(c, job); await prepare(c); assert.equal(plans, 1);
  job = await c.service.selectIdea(USER, TRACK, job.id, IDEAS[0].id);
  assert.equal(job.status, 'attention'); assert.equal(job.conceptPlanAttempts, 2); assert.equal(plans, 2);
  const writes = c.writes();
  await assert.rejects(c.service.selectIdea(USER, TRACK, job.id, IDEAS[0].id), { code: 'IDEA_ATTEMPTS', status: 409 });
  assert.equal(plans, 2); assert.equal(c.writes(), writes); assert.equal(count(c, 'image'), 0); assert.equal(count(c, 'video'), 0);
});
test('a required quality preview submits one native 5-second clip and waits for approval before 2x15s production', async () => {
  const c = fixture(); let job = await firstFrame(c);
  assert.equal(job.status, 'image-review'); assert.equal(job.qualityPreviewRequired, true); assert.equal(count(c, 'video'), 0);
  job = await c.service.approveFrame(USER, TRACK, job.id);
  assert.equal(job.status, 'preview'); assert.equal(count(c, 'video'), 0);
  for (let attempt = 0; attempt < 8 && job.status !== 'preview-review'; attempt++) job = await advance(c, job);
  assert.equal(job.status, 'preview-review'); assert.equal(job.previewRequestId, 'native-1'); assert.equal(job.previewSeconds, 5);
  assert.equal(job.previewSourceUrl, 'https://vidgen.x.ai/native-1.mp4'); assert.ok(job.previewClipUrl);
  assert.equal(job.previewUrl, 'https://storage.test/preview-5s.mp4'); assert.equal(job.clip1RequestId, undefined); assert.equal(job.clip2RequestId, undefined);
  const requests = c.calls.filter(call => call[0] === 'video');
  assert.deepEqual(requests.map(call => call[2]), [5]); assert.equal(requests[0][3], job.imageUrl); assert.equal(requests[0][4].resolution, '720p');
  const renderedPreview = c.calls.find(call => call[0] === 'preview-render')[1];
  assert.equal(renderedPreview.previewClipUrl, job.previewClipUrl); assert.equal(renderedPreview.audioHash, job.audioHash);
  const calls = c.calls.length, writes = c.writes();
  for (let attempt = 0; attempt < 3; attempt++) job = await advance(c, job);
  assert.equal(job.status, 'preview-review'); assert.equal(c.calls.length, calls); assert.equal(c.writes(), writes);
  const approvals = await Promise.all([c.service.approvePreview(USER, TRACK, job.id), c.service.approvePreview(USER, TRACK, job.id)]);
  assert.ok(approvals.every(result => result.status === 'clip1')); assert.equal(c.writes(), writes + 1);
  assert.ok(approvals[0].previewApprovedAt); assert.equal(count(c, 'video'), 1);
  const repeated = await c.service.approvePreview(USER, TRACK, job.id);
  assert.equal(repeated.previewApprovedAt, approvals[0].previewApprovedAt); assert.equal(c.writes(), writes + 1);
  job = repeated;
  for (let attempt = 0; attempt < 9 && job.status !== 'completed'; attempt++) job = await advance(c, job);
  assert.equal(job.status, 'completed'); assert.deepEqual(c.calls.filter(call => call[0] === 'video').map(call => call[2]), [5, 15, 15]);
  assert.equal(job.previewRequestId, 'native-1'); assert.equal(job.clip1RequestId, 'native-2'); assert.equal(job.clip2RequestId, 'native-3');
  assert.equal(count(c, 'ideas'), 1); assert.equal(count(c, 'plan'), 1); assert.equal(count(c, 'image'), 1);
});
test('preview approval is owner and job scoped and cannot skip the image or unfinished preview gates', async () => {
  const c = fixture(); let frame = await firstFrame(c);
  const before = c.writes();
  const premature = await c.service.approvePreview(USER, TRACK, frame.id);
  assert.equal(premature.status, 'image-review'); assert.equal(c.writes(), before); assert.equal(count(c, 'video'), 0);
  let job = await c.service.approveFrame(USER, TRACK, frame.id);
  const unfinished = await c.service.approvePreview(USER, TRACK, job.id);
  assert.equal(unfinished.status, 'preview'); assert.equal(count(c, 'video'), 0);
  for (let attempt = 0; attempt < 8 && job.status !== 'preview-review'; attempt++) job = await advance(c, job);
  const writes = c.writes(), paid = count(c, 'video');
  await assert.rejects(c.service.approvePreview(OTHER, TRACK, job.id), { code: 'TRACK_NOT_FOUND' });
  await assert.rejects(c.service.approvePreview(USER, TRACK, OTHER), { code: 'JOB_NOT_FOUND' });
  await assert.rejects(c.service.approvePreview(USER, TRACK, 'bad'), { code: 'ID' });
  assert.equal(c.writes(), writes); assert.equal(count(c, 'video'), paid);
  c.setJob({ ...job, previewUrl: undefined });
  await assert.rejects(c.service.approvePreview(USER, TRACK, job.id), { code: 'NOT_READY', status: 409 });
  assert.equal(count(c, 'video'), paid);
});
test('concurrent preview advances reserve one native provider request before any polling or review', async () => {
  const gate = deferred(); let submissions = 0;
  const c = fixture({ startVideo: async (_prompt, duration) => { submissions++; assert.equal(duration, 5); await gate.promise; return { requestId: 'known-preview-1' }; } });
  const frame = await firstFrame(c); const preview = await c.service.approveFrame(USER, TRACK, frame.id);
  const first = advance(c, preview); await new Promise(setImmediate);
  const duplicate = await advance(c, preview); assert.ok(duplicate.inFlight); assert.equal(submissions, 1);
  gate.resolve(); const job = await first;
  assert.equal(job.previewRequestId, 'known-preview-1'); assert.equal(job.status, 'preview'); assert.equal(submissions, 1);
  assert.equal(count(c, 'poll'), 0); assert.equal(count(c, 'preview-render'), 0);
});
test('known preview request or copied result resumes through polling/copy/mux without a second paid request', async () => {
  for (const failureAt of ['poll', 'copy', 'render']) {
    let polls = 0, copies = 0, renders = 0;
    const c = fixture({
      pollVideo: async requestId => {
        polls++; assert.equal(requestId, 'native-1');
        if (failureAt === 'poll' && polls === 1) throw new Error('temporary preview polling failure');
        return { status: 'done', url: 'https://vidgen.x.ai/native-1.mp4' };
      },
      copyAsset: async (_job, kind, url, name) => {
        if (kind === 'video') { copies++; assert.equal(url, 'https://vidgen.x.ai/native-1.mp4'); if (failureAt === 'copy' && copies === 1) throw new Error('temporary preview copy failure'); }
        return `https://storage.test/${name}`;
      },
      preview: async job => { renders++; assert.ok(job.previewClipUrl); if (failureAt === 'render' && renders === 1) throw new Error('temporary preview mux failure'); return 'https://storage.test/recovered-preview.mp4'; },
    });
    let job = await previewReview(c);
    assert.equal(job.status, 'attention'); assert.equal(job.failedStage, 'preview'); assert.equal(job.previewRequestId, 'native-1'); assert.equal(job.canResume, true);
    if (failureAt !== 'poll') assert.equal(job.previewSourceUrl, 'https://vidgen.x.ai/native-1.mp4');
    if (failureAt === 'render') assert.ok(job.previewClipUrl);
    const paid = count(c, 'video');
    job = await c.service.resume(USER, TRACK, job.id); assert.equal(job.status, 'preview');
    for (let attempt = 0; attempt < 8 && job.status !== 'preview-review'; attempt++) job = await advance(c, job);
    assert.equal(job.status, 'preview-review'); assert.equal(job.previewUrl, 'https://storage.test/recovered-preview.mp4');
    assert.equal(job.previewRequestId, 'native-1'); assert.equal(count(c, 'video'), paid); assert.equal(paid, 1);
    assert.equal(polls, failureAt === 'poll' ? 2 : 1); assert.equal(copies, failureAt === 'copy' ? 2 : 1); assert.equal(renders, failureAt === 'render' ? 2 : 1);
    assert.equal(job.clip1RequestId, undefined); assert.equal(job.clip2RequestId, undefined);
  }
});
test('an uncertain preview submission with no provider ID is held and cannot be resumed or approved into full generation', async () => {
  let submissions = 0;
  const c = fixture({ startVideo: async (_prompt, duration) => { submissions++; assert.equal(duration, 5); throw new Error('unknown preview submission'); } });
  const frame = await firstFrame(c); let job = await c.service.approveFrame(USER, TRACK, frame.id); job = await advance(c, job);
  assert.equal(job.status, 'attention'); assert.equal(job.failedStage, 'preview'); assert.equal(job.previewRequestId, undefined); assert.equal(job.canResume, false);
  const writes = c.writes(); await assert.rejects(c.service.resume(USER, TRACK, job.id), { code: 'RESUME_UNSAFE' });
  await c.service.approvePreview(USER, TRACK, job.id); await advance(c, job);
  assert.equal(submissions, 1); assert.equal(c.writes(), writes); assert.equal(job.clip1RequestId, undefined); assert.equal(job.clip2RequestId, undefined);
});
test('preview hooks remain optional for legacy preparation without concept-review dependencies', async () => {
  const c = fixture({}, { withIdeas: false, withPreview: true });
  let job = await prepare(c); assert.equal(job.status, 'ready'); assert.equal(Boolean(job.qualityPreviewRequired), false);
  assert.equal(count(c, 'ideas'), 0); assert.equal(count(c, 'plan'), 1);
  job = await c.service.start(USER, TRACK, job.id); job = await advance(c, job); assert.equal(job.status, 'image-review');
  job = await c.service.approveFrame(USER, TRACK, job.id); assert.equal(job.status, 'clip1');
  job = await advance(c, job); assert.deepEqual(c.calls.filter(call => call[0] === 'video').map(call => call[2]), [15]);
  assert.equal(count(c, 'preview-render'), 0);
});
