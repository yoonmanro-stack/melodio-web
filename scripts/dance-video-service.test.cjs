/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loader(overrides = {}, env = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name]
      : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`)
      : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', js)(localRequire, mod, mod.exports,
      { env }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}
const load = loader();
const { createDanceVideoService, DanceVideoError, DANCE_VIDEO_LEASE_MS, buildDancePacedClipPrompt, buildDancePreviewPrompt } = load('src/lib/dance/videoService.ts');
const { DANCE_CATEGORY_ID, DANCE_WORKFLOW } = load('src/lib/dance/preset.ts');
const { resolveDanceMusicSpec } = load('src/lib/dance/musicProfiles.ts');
const USER = 'a0000000-0000-4000-8000-000000000001';
const TRACK = 'a0000000-0000-4000-8000-000000000002';
const OTHER = 'a0000000-0000-4000-8000-000000000003';
const PLAN = { title: '리듬의 작은 인사', summary: '반복 손동작과 발걸음', identity: 'one original adult dancer', imagePrompt: 'opening frame', clips: ['first motion', 'second motion'] };
test('stored clips and preview use saved138BPM cadence without changing the approved cast or audio', () => {
  const job = { bpm: 139.5, musicSpec: { bpm: 138 }, audioUrl: 'stored-master.wav', audioHash: 'same-master', plan: PLAN,
    selectedIdea: { firstTwoSeconds: '첫 훅 안에서 발을 옆으로 딛는다.', signatureMove: '발을 번갈아 딛는다.', visualPayoff: '같은 훅을 반복한다.' } };
  const before = structuredClone(job), approved = 'same approved cast and scene '.padEnd(3096, 'x');
  const paced = buildDancePacedClipPrompt(job, approved);
  assert.ok(paced.endsWith(approved)); assert.ok(paced.length <= 4096);
  assert.match(paced, /one count per quarter-note beat, 0\.435s per count/);
  assert.match(paced, /eight-count cycle 3\.478s/); assert.match(paced, /4 complete eight-count cycles/);
  assert.equal(buildDancePacedClipPrompt(job, paced), paced, 'reopening does not duplicate the guide');
  const preview = buildDancePreviewPrompt(job);
  assert.match(preview, /one count per quarter-note beat, 0\.435s per count/);
  assert.match(preview, /1 complete eight-count cycle/); assert.match(preview, /no separate intro/);
  assert.match(preview, /same moving hook/); assert.doesNotMatch(preview, /Then demonstrate/);
  assert.deepEqual(job, before);
  assert.throws(() => buildDancePacedClipPrompt(job, 'x'.repeat(4096)), { code: 'PLAN_LENGTH' });
});
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture(overrides = {}) {
  let time = 10_000;
  let metadata = { workflow: DANCE_WORKFLOW, presetId: DANCE_CATEGORY_ID, isPublic: false, isInstrumental: true,
    dancePreset: { id: 'dance-hook-instrumental-v1', bpm: 138 } };
  let row = { id: TRACK, userId: USER, status: 'completed', audioUrl: 'https://cdn.suno.ai/original.mp3', metadata, licenseHash: JSON.stringify(metadata) };
  let writes = 0;
  const calls = [];
  const store = {
    load: async (user, id) => user === row.userId && id === row.id ? structuredClone(row) : null,
    compareAndSwap: async (previous, job) => {
      if (previous.licenseHash !== row.licenseHash) return null;
      metadata = { ...row.metadata, danceVideo: structuredClone(job) };
      row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; writes++;
      return structuredClone(row);
    },
  };
  const deps = {
    store, now: () => time,
    snapshot: async (job, url) => { calls.push(['snapshot', job.startSeconds, url]); return { audioUrl: 'https://storage.test/snapshot.wav', sourceAudioHash: 'source-hash', audioHash: 'clip-hash', sourceDurationSeconds: 180, bpm: 138, onsetSeconds: [0.4, 0.8] }; },
    plan: async () => { calls.push(['plan']); return structuredClone(PLAN); },
    generateImage: async prompt => { calls.push(['image', prompt]); return { url: 'https://imgen.x.ai/start.png' }; },
    startVideo: async (prompt, duration, frame) => { calls.push(['video', prompt, duration, frame]); return { requestId: `request-${calls.filter(c => c[0] === 'video').length}` }; },
    pollVideo: async id => { calls.push(['poll', id]); return { status: 'done', url: `https://vidgen.x.ai/${id}.mp4` }; },
    copyAsset: async (_job, kind, url, name) => { calls.push(['copy', kind, url, name]); return `https://storage.test/${name}`; },
    bridge: async job => { calls.push(['bridge', job.clip1Url]); return 'https://storage.test/real-final-frame.jpg'; },
    render: async job => { calls.push(['render', job.audioUrl, job.clip1Url, job.clip2Url]); return 'https://storage.test/final.mp4'; },
    ...overrides,
  };
  const service = createDanceVideoService(deps);
  return { service, deps, store, calls, row: () => structuredClone(row), writes: () => writes,
    tick: (ms = 5000) => { time += ms; },
    metadata: values => { metadata = { ...row.metadata, ...values }; row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; },
    setJob: job => { metadata = { ...row.metadata, danceVideo: structuredClone(job) }; row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; },
    setRow: values => { row = { ...row, ...values }; },
  };
}
async function ready(ctx) { return ctx.service.prepare(USER, TRACK, 40, '따뜻한 표정의 밝은 댄스'); }
async function started(ctx) { const job = await ready(ctx); return ctx.service.start(USER, TRACK, job.id); }
async function advance(ctx, job) { ctx.tick(); return ctx.service.advance(USER, TRACK, job.id); }
async function imageApproved(ctx) {
  const startedJob = await started(ctx);
  const review = await advance(ctx, startedJob);
  assert.equal(review.status, 'image-review');
  return ctx.service.approveFrame(USER, TRACK, review.id);
}

test('owner/workflow/input validation precedes snapshot and paid calls', async () => {
  const c = fixture();
  await assert.rejects(c.service.prepare(OTHER, TRACK, 0, '춤'), e => e.status === 404);
  for (const start of [-1, NaN, Infinity, '1']) await assert.rejects(c.service.prepare(USER, TRACK, start, '춤'));
  for (const brief of [undefined, null, 123, {}, 'bad\u0000brief', 'x'.repeat(1001)]) {
    await assert.rejects(c.service.prepare(USER, TRACK, 0, brief), e => e.code === 'VISUAL_BRIEF');
  }
  c.metadata({ workflow: 'another-workflow' });
  await assert.rejects(c.service.prepare(USER, TRACK, 0, '춤'), e => e.code === 'TRACK_NOT_READY');
  assert.equal(c.calls.length, 0); assert.equal(c.writes(), 0);
});
test('GET can read an owned generating dance row and returns null without providers or mutation', async () => {
  const c = fixture(); c.setRow({ status: 'pending', audioUrl: null });
  assert.equal(await c.service.get(USER, TRACK), null);
  assert.equal(c.calls.length, 0); assert.equal(c.writes(), 0);
  await assert.rejects(ready(c), e => e.code === 'TRACK_NOT_READY');
});
test('invalid real source range spends zero planning/video calls and permits a corrected unspent selection', async () => {
  const c = fixture({ snapshot: async job => { if (job.startSeconds === 40) throw new DanceVideoError('구간 초과', 'AUDIO_RANGE'); return { audioUrl: 'snapshot', audioHash: 'clip', sourceAudioHash: 'source', sourceDurationSeconds: 45 }; } });
  const failed = await ready(c); assert.equal(failed.status, 'attention'); assert.equal(failed.error, '구간 초과');
  assert.equal(c.calls.length, 0);
  const corrected = await c.service.prepare(USER, TRACK, 0, '춤');
  assert.equal(corrected.status, 'ready'); assert.equal(c.calls.filter(v => v[0] === 'plan').length, 1);
});
test('parallel prepare and repeat ready prepare spend only once; exact snapshot is persisted before planning', async () => {
  for (const brief of [' \n ', '  비 오는 광장에서 춤추는 작은 구리 로봇  ']) {
    const gate = deferred(); let snapshots = 0; let plans = 0;
    const c = fixture({ snapshot: async () => { snapshots++; await gate.promise; return { audioUrl: 'snapshot', audioHash: 'clip', sourceAudioHash: 'source', sourceDurationSeconds: 180 }; },
      plan: async job => { plans++; assert.equal(job.visualBrief, brief.trim()); assert.equal(c.row().metadata.danceVideo.audioUrl, 'snapshot'); assert.equal(c.row().metadata.danceVideo.planningSubmitted, true); return structuredClone(PLAN); } });
    const first = c.service.prepare(USER, TRACK, 40, brief); await new Promise(setImmediate);
    const concurrent = await c.service.prepare(USER, TRACK, 40, brief.trim()); assert.equal(concurrent.status, 'preparing');
    gate.resolve(); const job = await first;
    const repeated = await c.service.prepare(USER, TRACK, 40, brief.trim()); assert.equal(repeated.id, job.id); assert.equal(snapshots, 1); assert.equal(plans, 1);
    assert.equal(job.visualBrief, brief.trim()); assert.equal(c.row().metadata.danceVideo.visualBrief, brief.trim());
    assert.equal(c.row().audioUrl, 'https://cdn.suno.ai/original.mp3'); assert.equal(c.row().metadata.isPublic, false);
  }
});
test('uncertain AI planning retains blank selection and is never automatically resubmitted', async () => {
  let plans = 0;
  const c = fixture({ plan: async () => { plans++; throw new Error('uncertain provider response'); } });
  const failed = await c.service.prepare(USER, TRACK, 0, '');
  assert.equal(failed.status, 'attention'); assert.equal(failed.visualBrief, ''); assert.equal(failed.planningSubmitted, true);
  assert.equal((await c.service.prepare(USER, TRACK, 0, ' \n ')).id, failed.id);
  await assert.rejects(c.service.prepare(USER, TRACK, 0, 'new situation'), e => e.code === 'JOB_EXISTS');
  assert.equal(plans, 1); assert.equal(c.calls.filter(v => v[0] === 'snapshot').length, 1);
});
test('planner accepts AI selection and preserves a custom situation with selected rhythm cues', async () => {
  const { createDancePlan } = loader({}, { OPENAI_API_KEY: 'offline-planner-fixture' })('src/lib/dance/videoPlan.ts');
  for (const brief of ['', '비 오는 광장에서 춤추는 작은 구리 로봇']) {
    let calls = 0;
    const result = await createDancePlan({ visualBrief: brief, bpm: 138, onsetSeconds: [0.4, 0.8] }, async (_url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.deepEqual(JSON.parse(body.messages[1].content), { visualBrief: brief, selectedDurationSeconds: 30, estimatedBpm: 138, onsetSeconds: [0.4, 0.8] });
      assert.match(body.messages[0].content, /If visualBrief is empty, invent a concrete original situation/);
      assert.match(body.messages[0].content, /preserve the user's requested situation, performer, place, actions and visual style/);
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(PLAN) } }] }));
    });
    assert.equal(calls, 1); assert.equal(result.summary, PLAN.summary); assert.equal(result.clips.length, 2);
  }
});
test('parallel image advances and repeated start cannot duplicate a paid image', async () => {
  const gate = deferred(); let images = 0;
  const c = fixture({ generateImage: async () => { images++; await gate.promise; return { url: 'https://imgen.x.ai/one.png' }; } });
  const job = await started(c); assert.equal((await c.service.start(USER, TRACK, job.id)).status, 'image');
  const first = advance(c, job); await new Promise(setImmediate);
  const concurrent = await advance(c, job); assert.ok(concurrent.inFlight);
  gate.resolve(); const done = await first; assert.equal(done.status, 'image-review'); assert.equal(images, 1);
});
test('a generated first frame stays in review and repeated advance spends zero video calls', async () => {
  const c = fixture(); let job = await started(c); job = await advance(c, job);
  assert.equal(job.status, 'image-review'); assert.equal(job.imageReviewRequired, true); assert.ok(job.imageUrl);
  const calls = c.calls.length, writes = c.writes();
  for (let attempt = 0; attempt < 3; attempt++) job = await advance(c, job);
  assert.equal(job.status, 'image-review'); assert.equal(c.calls.length, calls); assert.equal(c.writes(), writes);
  assert.equal(c.calls.filter(call => call[0] === 'video').length, 0);
});
test('frame approval rejects another owner or job, and duplicate approvals spend no video calls', async () => {
  const c = fixture(); let job = await started(c); job = await advance(c, job);
  const writes = c.writes();
  await assert.rejects(c.service.approveFrame(OTHER, TRACK, job.id), { code: 'TRACK_NOT_FOUND' });
  await assert.rejects(c.service.approveFrame(USER, TRACK, OTHER), { code: 'JOB_NOT_FOUND' });
  await assert.rejects(c.service.approveFrame(USER, TRACK, 'bad'), { code: 'ID' });
  assert.equal(c.writes(), writes);
  const approvals = await Promise.all([c.service.approveFrame(USER, TRACK, job.id), c.service.approveFrame(USER, TRACK, job.id)]);
  assert.ok(approvals.every(result => result.status === 'clip1'));
  assert.equal(c.writes(), writes + 1); assert.ok(approvals[0].imageApprovedAt);
  const approved = await c.service.approveFrame(USER, TRACK, job.id);
  assert.equal(approved.imageApprovedAt, approvals[0].imageApprovedAt); assert.equal(c.writes(), writes + 1);
  assert.equal(c.calls.filter(call => call[0] === 'video').length, 0);
  job = await advance(c, approved); assert.equal(job.clip1RequestId, 'request-1');
  assert.equal(c.calls.filter(call => call[0] === 'video').length, 1);
});
test('a legacy ready plan gains review on start, while an already-running legacy image continues unchanged', async () => {
  for (const previousStatus of ['ready', 'image']) {
    const c = fixture(); let job = await ready(c);
    const legacy = { ...job, status: previousStatus }; delete legacy.imageReviewRequired; delete legacy.direction; delete legacy.creativePreferences;
    c.setJob(legacy);
    if (previousStatus === 'ready') job = await c.service.start(USER, TRACK, job.id);
    else job = legacy;
    job = await advance(c, job);
    assert.equal(job.status, previousStatus === 'ready' ? 'image-review' : 'clip1');
    assert.equal(c.calls.filter(call => call[0] === 'image').length, 1);
    assert.equal(c.calls.filter(call => call[0] === 'video').length, 0);
  }
});
test('selected creative preferences, source decisions and original music are persisted before planning', async () => {
  const preferences = { performer: 'duo', location: 'rooftop', danceStyle: 'shuffle', visualStyle: 'stylized3d', difficulty: 'medium' };
  const music = resolveDanceMusicSpec('latin-step', 'on', TRACK);
  let plannedJob;
  const c = fixture({ plan: async job => { plannedJob = structuredClone(job); return structuredClone(PLAN); } });
  c.metadata({ danceMusic: music, instrumental: false, isInstrumental: false });
  const job = await c.service.prepare(USER, TRACK, 40, '두 명이 옥상에서 셔플 춤을 춘다', preferences);
  assert.equal(job.status, 'ready'); assert.deepEqual(job.creativePreferences, preferences); assert.deepEqual(job.musicSpec, music);
  assert.deepEqual(job.direction.sources, { cast: 'explicit', location: 'explicit', choreography: 'explicit' });
  assert.equal(job.direction.castId, 'duo'); assert.equal(job.direction.locationId, 'rooftop'); assert.equal(job.direction.choreographyId, 'shuffle');
  assert.deepEqual(c.row().metadata.danceVideo.direction, job.direction);
  assert.deepEqual(plannedJob.direction, job.direction); assert.deepEqual(plannedJob.musicSpec, music);
  const repeated = await c.service.prepare(USER, TRACK, 40, '두 명이 옥상에서 셔플 춤을 춘다', preferences);
  assert.equal(repeated.id, job.id);
  assert.equal(c.calls.filter(call => call[0] === 'snapshot').length, 1);
});
test('image provider result survives asset-copy failure and is never auto-generated again', async () => {
  const c = fixture({ copyAsset: async () => { throw new Error('storage error with secret raw payload'); } });
  let job = await started(c); job = await advance(c, job);
  assert.equal(job.status, 'attention'); assert.equal(job.imageSourceUrl, 'https://imgen.x.ai/start.png');
  assert.doesNotMatch(job.error, /secret raw/);
  await advance(c, job); assert.equal(c.calls.filter(v => v[0] === 'image').length, 1);
});
test('resume copies the checkpointed image result without another paid image or video', async () => {
  let copies = 0;
  const c = fixture({ copyAsset: async (_job, kind, url, name) => {
    assert.equal(kind, 'image'); assert.equal(url, 'https://imgen.x.ai/start.png'); assert.equal(name, 'first-frame');
    if (++copies === 1) throw new Error('temporary storage failure');
    return 'https://storage.test/recovered-first-frame.jpg';
  } });
  let job = await started(c); job = await advance(c, job);
  assert.equal(job.status, 'attention'); assert.equal(job.failedStage, 'image');
  assert.equal(job.imageSourceUrl, 'https://imgen.x.ai/start.png');
  job = await c.service.get(USER, TRACK); assert.equal(job.canResume, true);
  const calls = c.calls.length;
  job = await c.service.resume(USER, TRACK, job.id); assert.equal(job.status, 'image'); assert.equal(c.calls.length, calls);
  job = await advance(c, job);
  assert.equal(job.status, 'image-review'); assert.equal(job.imageUrl, 'https://storage.test/recovered-first-frame.jpg');
  assert.equal(job.imageApprovedAt, undefined); assert.equal(copies, 2);
  assert.equal(c.calls.filter(call => call[0] === 'image').length, 1);
  assert.equal(c.calls.filter(call => call[0] === 'video').length, 0);
});
test('resume of clip1 only polls its saved request or copies its saved source, without resubmission', async () => {
  for (const failureAt of ['poll', 'copy']) {
    let polls = 0, copies = 0;
    const c = fixture({
      pollVideo: async requestId => {
        assert.equal(requestId, 'request-1'); polls++;
        if (failureAt === 'poll' && polls === 1) throw new Error('temporary polling failure');
        return { status: 'done', url: 'https://vidgen.x.ai/saved-clip1.mp4' };
      },
      copyAsset: async (_job, kind, url, name) => {
        if (kind === 'video') {
          assert.equal(name, 'clip1'); assert.equal(url, 'https://vidgen.x.ai/saved-clip1.mp4'); copies++;
          if (failureAt === 'copy' && copies === 1) throw new Error('temporary clip storage failure');
        }
        return `https://storage.test/${name}`;
      },
    });
    let job = await imageApproved(c); job = await advance(c, job); job = await advance(c, job);
    assert.equal(job.status, 'attention'); assert.equal(job.failedStage, 'clip1'); assert.equal(job.clip1RequestId, 'request-1');
    assert.equal(job.clip1SourceUrl, failureAt === 'copy' ? 'https://vidgen.x.ai/saved-clip1.mp4' : undefined);
    job = await c.service.get(USER, TRACK); assert.equal(job.canResume, true);
    const paidCalls = c.calls.filter(call => ['image', 'video'].includes(call[0])).length;
    job = await c.service.resume(USER, TRACK, job.id); assert.equal(job.status, 'clip1');
    job = await advance(c, job);
    assert.equal(job.status, 'bridge'); assert.equal(job.clip1Url, 'https://storage.test/clip1');
    assert.equal(job.clip1RequestId, 'request-1'); assert.equal(job.clip1SourceUrl, 'https://vidgen.x.ai/saved-clip1.mp4');
    assert.equal(polls, failureAt === 'poll' ? 2 : 1); assert.equal(copies, failureAt === 'copy' ? 2 : 1);
    assert.equal(c.calls.filter(call => ['image', 'video'].includes(call[0])).length, paidCalls);
    assert.equal(c.calls.filter(call => call[0] === 'video').length, 1);
  }
});
test('resume is owner and job scoped, and a live lease cannot be cleared or rewritten', async () => {
  const c = fixture(); let job = await started(c); job = await advance(c, job);
  const held = { ...job, status: 'attention', failedStage: 'image', inFlight: { action: 'image', token: OTHER, at: job.updatedAt } };
  c.setJob(held); const writes = c.writes(), calls = c.calls.length;
  assert.equal((await c.service.get(USER, TRACK)).canResume, false);
  await assert.rejects(c.service.resume(OTHER, TRACK, job.id), { code: 'TRACK_NOT_FOUND' });
  await assert.rejects(c.service.resume(USER, TRACK, OTHER), { code: 'JOB_NOT_FOUND' });
  await assert.rejects(c.service.resume(USER, TRACK, 'bad'), { code: 'ID' });
  const active = await c.service.resume(USER, TRACK, job.id);
  assert.equal(active.status, 'attention'); assert.deepEqual(active.inFlight, held.inFlight);
  assert.equal(c.writes(), writes); assert.equal(c.calls.length, calls);
  c.tick(DANCE_VIDEO_LEASE_MS + 1);
  assert.equal((await c.service.get(USER, TRACK)).canResume, true);
  const resumed = await c.service.resume(USER, TRACK, job.id);
  assert.equal(resumed.status, 'image'); assert.equal(resumed.inFlight, undefined); assert.equal(c.calls.length, calls);
});
test('ambiguous video submission is held; neither advance nor prepare resubmits it', async () => {
  let submissions = 0;
  const c = fixture({ startVideo: async () => { submissions++; throw new Error('timeout after provider accepted'); } });
  let job = await imageApproved(c); job = await advance(c, job);
  assert.equal(job.status, 'attention'); await advance(c, job); await ready(c);
  await assert.rejects(c.service.prepare(USER, TRACK, 50, 'different'), e => e.code === 'JOB_EXISTS');
  assert.equal(submissions, 1); assert.equal(job.audioUrl, 'https://storage.test/snapshot.wav');
  const held = await c.service.get(USER, TRACK), writes = c.writes();
  assert.equal(held.canResume, false); assert.equal(held.clip1RequestId, undefined); assert.equal(held.clip1SourceUrl, undefined);
  await assert.rejects(c.service.resume(USER, TRACK, job.id), { code: 'RESUME_UNSAFE', status: 409 });
  assert.equal(c.writes(), writes); assert.equal(submissions, 1);
});
test('successful restartable pipeline has exactly two 15s submissions and C2 uses real C1 final frame', async () => {
  const c = fixture(); let job = await imageApproved(c);
  for (let i = 0; i < 9 && job.status !== 'completed'; i++) job = await advance(c, job);
  assert.equal(job.status, 'completed');
  const submissions = c.calls.filter(v => v[0] === 'video');
  assert.equal(submissions.length, 2); assert.deepEqual(submissions.map(v => v[2]), [15, 15]);
  assert.equal(submissions[1][3], 'https://storage.test/real-final-frame.jpg');
  assert.deepEqual(c.calls.find(v => v[0] === 'render').slice(1), ['https://storage.test/snapshot.wav', 'https://storage.test/clip1', 'https://storage.test/clip2']);
  const calls = c.calls.length; const writes = c.writes();
  await c.service.get(USER, TRACK); await advance(c, job);
  assert.equal(c.calls.length, calls); assert.equal(c.writes(), writes);
});
test('persisted provider ID is polled once in parallel, is rate bounded, and never re-submitted', async () => {
  const gate = deferred(); let polls = 0;
  const c = fixture({ pollVideo: async () => { polls++; await gate.promise; return { status: 'pending' }; } });
  let job = await imageApproved(c); job = await advance(c, job);
  assert.equal(job.clip1RequestId, 'request-1');
  const first = advance(c, job); await new Promise(setImmediate);
  await c.service.advance(USER, TRACK, job.id); gate.resolve(); job = await first;
  await c.service.advance(USER, TRACK, job.id);
  assert.equal(polls, 1); assert.equal(c.calls.filter(v => v[0] === 'video').length, 1);
});
test('stale lease is visible on read without mutation, then persists attention on advance without spending', async () => {
  const c = fixture(); const job = await started(c);
  c.setJob({ ...job, inFlight: { action: 'image', token: 'saved-token', at: new Date(10000).toISOString() } });
  c.tick(DANCE_VIDEO_LEASE_MS + 1);
  const writes = c.writes(); const observed = await c.service.get(USER, TRACK);
  assert.equal(observed.status, 'attention'); assert.equal(c.writes(), writes);
  await advance(c, job); assert.equal(c.row().metadata.danceVideo.status, 'attention');
  assert.equal(c.calls.filter(v => v[0] === 'image').length, 0);
});
test('an expired advance keeps the known request stage and exposes immediate safe resume without a paid resubmission', async () => {
  const c = fixture(); let job = await started(c); job = await advance(c, job);
  job = await c.service.approveFrame(USER, TRACK, job.id); job = await advance(c, job);
  assert.ok(job.clip1RequestId);
  c.setJob({ ...job, inFlight: { action: 'clip1-poll', token: OTHER, at: job.updatedAt } });
  c.tick(DANCE_VIDEO_LEASE_MS + 1);
  const calls = c.calls.length; job = await advance(c, job);
  assert.equal(job.status, 'attention'); assert.equal(job.failedStage, 'clip1'); assert.equal(job.canResume, true);
  job = await c.service.resume(USER, TRACK, job.id);
  assert.equal(job.status, 'clip1'); assert.equal(job.inFlight, undefined); assert.equal(c.calls.length, calls);
  assert.equal(c.calls.filter(call => call[0] === 'video').length, 1);
});
test('unrelated metadata CAS conflict is merged without repeating an expensive call', async () => {
  const c = fixture(); const original = c.store.compareAndSwap; let conflict = true;
  c.store.compareAndSwap = async (row, job) => {
    if (conflict && job.imageSourceUrl) { conflict = false; c.metadata({ isPublic: true, unrelated: 'preserved' }); return null; }
    return original(row, job);
  };
  let job = await started(c); job = await advance(c, job);
  assert.equal(job.status, 'image-review'); assert.equal(c.calls.filter(v => v[0] === 'image').length, 1);
  assert.equal(c.row().metadata.unrelated, 'preserved'); assert.equal(c.row().metadata.isPublic, true);
});
test('C2 failure retains C1 and selected audio; no render or single-clip loop fallback', async () => {
  const c = fixture({ pollVideo: async id => id === 'request-2' ? { status: 'failed' } : { status: 'done', url: 'https://vidgen.x.ai/first.mp4' } });
  let job = await imageApproved(c);
  for (let i = 0; i < 9 && job.status !== 'attention'; i++) job = await advance(c, job);
  assert.equal(job.status, 'attention'); assert.ok(job.clip1Url); assert.ok(job.clip2RequestId); assert.ok(job.audioUrl);
  assert.equal(c.calls.filter(v => v[0] === 'render').length, 0);
});
test('render failure retains both finished clips and mismatched job IDs are rejected', async () => {
  const c = fixture({ render: async () => { throw new Error('ffmpeg failed'); } }); let job = await imageApproved(c);
  await assert.rejects(c.service.advance(USER, TRACK, OTHER), e => e.code === 'JOB_NOT_FOUND');
  for (let i = 0; i < 9 && job.status !== 'attention'; i++) job = await advance(c, job);
  assert.equal(job.status, 'attention'); assert.ok(job.clip1Url); assert.ok(job.clip2Url); assert.ok(job.audioHash);
});
test('resume renders the two stored clips without paying for another image or video', async () => {
  let renders = 0;
  const c = fixture({ render: async job => {
    assert.equal(job.clip1Url, 'https://storage.test/clip1'); assert.equal(job.clip2Url, 'https://storage.test/clip2');
    if (++renders === 1) throw new Error('temporary mux failure');
    return 'https://storage.test/recovered-final.mp4';
  } });
  let job = await imageApproved(c);
  for (let attempt = 0; attempt < 9 && job.status !== 'attention'; attempt++) job = await advance(c, job);
  assert.equal(job.status, 'attention'); assert.equal(job.failedStage, 'render');
  assert.ok(job.clip1Url); assert.ok(job.clip2Url); assert.ok(job.clip1RequestId); assert.ok(job.clip2RequestId);
  job = await c.service.get(USER, TRACK); assert.equal(job.canResume, true);
  const prior = structuredClone(job), paidCalls = c.calls.filter(call => ['image', 'video'].includes(call[0])).length;
  job = await c.service.resume(USER, TRACK, job.id); assert.equal(job.status, 'render');
  job = await advance(c, job);
  assert.equal(job.status, 'completed'); assert.equal(job.videoUrl, 'https://storage.test/recovered-final.mp4'); assert.equal(renders, 2);
  for (const key of ['audioUrl', 'audioHash', 'clip1Url', 'clip2Url', 'clip1RequestId', 'clip2RequestId']) assert.equal(job[key], prior[key]);
  assert.equal(c.calls.filter(call => ['image', 'video'].includes(call[0])).length, paidCalls);
  assert.equal(c.calls.filter(call => call[0] === 'video').length, 2);
});
test('plan compiler fixes exact identity, continuation, silence and no text within provider length', () => {
  const { validateDancePlan } = load('src/lib/dance/videoPlan.ts');
  const plan = validateDancePlan(PLAN);
  assert.equal(plan.clips.length, 2);
  assert.ok(plan.clips.every(v => v.length <= 4096 && /No sound/.test(v) && /captions/.test(v) && v.includes(PLAN.identity)));
  assert.match(plan.clips[1], /actual final frame/);
  assert.throws(() => validateDancePlan({ ...PLAN, clips: ['x'.repeat(2401), 'second'] }));
  assert.throws(() => validateDancePlan({ ...PLAN, clips: ['only one'] }));
  const robot = validateDancePlan({ ...PLAN, identity: 'original small copper robot with hinged arms' });
  assert.ok(robot.clips.every(v => v.includes('copper robot') && !v.includes('adult dancer')));
});
test('real store adapter final CAS preserves originals/privacy and unrelated metadata', async () => {
  const { createDanceVideoStore } = loader({ './renderVideo': {}, './videoPlan': {}, '../video/petProvider': {}, '../video/petMedia': {} })('src/lib/dance/videoServer.ts');
  let row = { id: TRACK, user_id: USER, status: 'completed', audio_url: 'https://storage.test/original.mp3', source_audio_url: 'original-source', is_public: false,
    title: 'old music title', cover_art_url: 'music-cover', license_hash: JSON.stringify({ workflow: DANCE_WORKFLOW, presetId: DANCE_CATEGORY_ID, isPublic: false,
      isInstrumental: true, dancePreset: { id: 'dance-hook-instrumental-v1', bpm: 138 }, unrelated: 'keep' }) };
  let lastPayload;
  const admin = { from: table => {
    assert.equal(table, 'generations');
    const filters = []; let payload;
    const q = { select: () => q, update: value => { payload = value; lastPayload = value; return q; }, eq: (key, value) => { filters.push([key, value]); return q; }, is: (key, value) => { filters.push([key, value]); return q; },
      maybeSingle: async () => {
        if (!filters.every(([key, value]) => row[key] === value)) return { data: null, error: null };
        if (payload) row = { ...row, ...payload };
        return { data: structuredClone(row), error: null };
      } };
    return q;
  }, rpc: (name, args) => {
    assert.equal(name, 'compare_and_swap_dance_generation');
    lastPayload = args;
    return { maybeSingle: async () => {
      if (row.id !== args.p_track_id || row.user_id !== args.p_user_id || row.status !== 'completed'
        || row.license_hash !== args.p_expected_license_hash) return { data: null, error: null };
      row = { ...row, license_hash: args.p_next_license_hash,
        title: args.p_final_title ?? row.title, cover_art_url: args.p_final_cover_art_url ?? row.cover_art_url };
      return { data: structuredClone(row), error: null };
    } };
  } };
  const store = createDanceVideoStore(admin);
  assert.equal(await store.load(OTHER, TRACK), null);
  const old = await store.load(USER, TRACK);
  const job = { id: OTHER, trackId: TRACK, status: 'completed', startSeconds: 40, durationSeconds: 30, visualBrief: '춤', createdAt: 'time', updatedAt: 'time',
    videoUrl: 'https://storage.test/final.mp4', imageUrl: 'https://storage.test/image.jpg', plan: PLAN };
  const final = await store.compareAndSwap(old, job);
  assert.equal(final.metadata.video_url, job.videoUrl); assert.equal(final.metadata.sourceMenu, 'viral');
  assert.equal(final.metadata.presetId, DANCE_CATEGORY_ID); assert.equal(final.metadata.workflow, DANCE_WORKFLOW);
  assert.equal(final.metadata.unrelated, 'keep'); assert.equal(final.metadata.isPublic, false);
  assert.equal(final.metadata.originalMusicTitle, 'old music title');
  assert.equal(row.audio_url, 'https://storage.test/original.mp3'); assert.equal(row.source_audio_url, 'original-source'); assert.equal(row.is_public, false);
  assert.equal(row.title, PLAN.title); assert.equal(row.cover_art_url, job.imageUrl);
  assert.equal(Object.hasOwn(lastPayload, 'audio_url'), false); assert.equal(Object.hasOwn(lastPayload, 'is_public'), false); assert.equal(Object.hasOwn(lastPayload, 'video_url'), false);
  assert.equal(await store.compareAndSwap(old, job), null, 'stale metadata cannot overwrite a newer CAS');
});
