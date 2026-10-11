/* Offline public v3 pipeline tests: mocked media operations, no network or database writes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(name => name.startsWith('.')
    ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name), mod, mod.exports);
  return mod.exports;
}
const { createPetVideoService, PetPipelineError, PET_VIDEO_POLL_MAX_ATTEMPTS, PET_VIDEO_POLL_MAX_WAIT_MS } = load('src/lib/video/petPipeline.ts');
const { measurePetAudioAlignment } = load('src/lib/video/petAudioAlignment.ts');
const { createPetXaiProvider } = load('src/lib/video/petProvider.ts');
const { compileLegacyPetClips } = load('src/lib/vle/petLegacyTwoClip.ts');
const USER = 'a0000000-0000-4000-8000-000000000001';
const TRACK = 'a0000000-0000-4000-8000-000000000002';
function episode() {
  let start = 0;
  return { version: 'pet-v3', id: 'timing-fixture', title: '고양이와 집사', sourceTopic: '고양이가 집사를 깨우고 다시 눕는다',
    story: '고양이가 집사를 깨우고 다시 눕는다', pov: 'pet_inner_voice', fingerprint: { prop: '담요', conflict: '늦잠', twist: '고양이가 잠듦' },
    candidates: [], character: { species: 'cat', appearance: 'One adult brown tabby cat.', owner: 'One adult owner in grey pajamas.',
      setting: 'One bedroom.', continuity: [] }, lyrics: '일어나 집사야 이제 나는 잘게', stylePrompt: 'Acoustic comedy, resolved ending.', models: [], createdAt: new Date(0).toISOString(),
    shots: [4, 5, 5, 6, 6, 4].map((durationSeconds, index) => {
      const shot = { id: `S${index + 1}`, startSeconds: start, durationSeconds, beat: `beat ${index + 1}`, caption: `장면 ${index + 1}`,
        action: `Authored action ${index + 1}, with a natural reaction.`, camera: 'Steady medium shot.', keyframePrompt: `Original image ${index + 1}`, videoPrompt: `Original motion ${index + 1}` };
      start += durationSeconds; return shot;
    }),
  };
}
function rhythm(duration = 28) {
  const events = Array.from({ length: Math.floor(duration * 2) }, (_, index) => Number((index * 0.5 + 0.12).toFixed(3))).filter(value => value < duration);
  return { onsetSeconds: events, beatSeconds: [...events], bpm: 120, confidence: 0.8, method: 'energy-autocorrelation',
    ending: { status: 'clean', reasons: ['decaying-ending'], tailRmsRatio: 0.1, terminalRms: 0.001 } };
}
function setup(overrides = {}) {
  let time = 100_000;
  const rows = new Map(), calls = [];
  const store = {
    get: async (user, id) => rows.get(id)?.user_id === user ? structuredClone(rows.get(id)) : null,
    findEpisode: async (user, id) => structuredClone([...rows.values()].find(row => row.user_id === user && row.episode.id === id) || null),
    insert: async row => { rows.set(row.id, structuredClone(row)); return structuredClone(row); },
    compareAndSwap: async (row, revision) => { if (rows.get(row.id)?.revision !== revision) return null; rows.set(row.id, structuredClone(row)); return structuredClone(row); },
    ownedAudio: async (_user, _track, source) => ({ sourceUrl: 'https://cdn.suno.ai/owned.mp3', episode: structuredClone(source) }),
  };
  const deps = { store, now: () => time,
    snapshotAudio: async () => ({ url: 'https://storage.test/audio', durationSeconds: 28, rhythm: rhythm() }),
    generateImage: async prompt => { calls.push(['image', prompt]); return { url: 'https://imgen.x.ai/first.jpg' }; },
    startVideo: async (prompt, duration) => { calls.push(['video', prompt, duration]); return { requestId: `saved-${calls.length}` }; },
    pollVideo: async id => { calls.push(['poll', id]); return { status: 'done', url: 'https://vidgen.x.ai/result.mp4' }; },
    copyAsset: async (_job, index, kind) => { calls.push(['copy', index, kind]); return `https://storage.test/${index}-${kind}`; },
    extractBridgeFrame: async () => { calls.push(['bridge']); return { url: 'https://storage.test/bridge' }; },
    reviewAsset: async () => ({ status: 'passed', issues: [] }),
    render: async job => { calls.push(['render', structuredClone(job)]); return { url: 'https://storage.test/final.mp4', durationSeconds: 30 }; },
    ...overrides,
  };
  return { rows, calls, deps, service: createPetVideoService(deps), tick: () => { time += 20_000; }, setTime: next => { time = next; } };
}
async function pending(ctx) {
  const view = await ctx.service.create(USER, episode(), TRACK);
  for (let index = 0; index < 10; index++) {
    await ctx.service.advance(USER, view.id); ctx.tick();
    if (ctx.rows.get(view.id).state.shots[0].requestId) return view.id;
  }
  throw new Error('fixture did not submit video');
}

test('measured action starts use detected events, readable spans, the fixed seam and a safe ending', () => {
  const source = episode(), before = structuredClone(source), signal = rhythm();
  const plan = measurePetAudioAlignment(source, 28, signal);
  assert.deepEqual(source, before); assert.equal(plan.status, 'measured'); assert.equal(plan.appliedToMotionPrompts, true);
  assert.equal(plan.fixedClipSeamSeconds, 15); assert.equal(plan.endingHoldSeconds, 2);
  for (const [index, action] of plan.actionStarts.entries()) {
    if (action.source === 'measured-onset') assert.ok(signal.onsetSeconds.includes(action.seconds));
    if (index) assert.ok(action.seconds - plan.actionStarts[index - 1].seconds >= 3);
  }
  assert.ok(plan.actionStarts[3].seconds <= 14.25); assert.ok(plan.actionStarts[4].seconds > 15);
  assert.ok(plan.actionStarts[5].seconds <= 26); assert.match(plan.reason, /not-verified-motion-sync/);
  const shorter = measurePetAudioAlignment(source, 26, rhythm(26));
  assert.ok(shorter.actionStarts[5].seconds <= 24); assert.ok(shorter.actionStarts[5].seconds - shorter.actionStarts[4].seconds >= 3);
});

test('weak or invented beat grids fall back; short audio never rushes the authored ending', () => {
  for (const signal of [undefined, { ...rhythm(), confidence: 0.1 }, { ...rhythm(), onsetSeconds: [0.12] }]) {
    const result = measurePetAudioAlignment(episode(), 28, signal);
    assert.equal(result.status, 'fallback'); assert.equal(result.appliedToMotionPrompts, false);
    assert.deepEqual(result.actionStarts.map(action => action.seconds), [0, 4, 9, 14, 20, 26]);
  }
  const short = measurePetAudioAlignment(episode(), 20, rhythm(20));
  assert.equal(short.actionStarts[5].seconds, 26); assert.equal(short.actionStarts[5].source, 'planned');
  assert.match(short.reason, /partial-alignment/);
});

test('public v3 persists measured timing outside the canonical episode and submits two normal-speed 15s clips', async () => {
  const ctx = setup(), source = episode(), original = structuredClone(source);
  let view = await ctx.service.create(USER, source, TRACK);
  const frozen = structuredClone(ctx.rows.get(view.id).episode);
  assert.equal(view.audioQuality.alignment.status, 'planned');
  view = await ctx.service.advance(USER, view.id);
  assert.equal(view.audioQuality.alignment.status, 'measured');
  assert.deepEqual(ctx.rows.get(view.id).episode, frozen); assert.deepEqual(source, original);
  for (let index = 0; index < 25 && view.status !== 'completed'; index++) { ctx.tick(); view = await ctx.service.advance(USER, view.id); }
  assert.equal(view.status, 'completed'); assert.equal(view.durationSeconds, 30);
  const requests = ctx.calls.filter(call => call[0] === 'video');
  assert.equal(requests.length, 2); assert.ok(requests.every(call => call[2] === 15 && call[1].includes('AUDIO TIMING INTENT:')));
  assert.match(requests[0][1], /\[4\.12-9\.12s\]/);
  assert.deepEqual(requests.map(call => call[1]), ctx.rows.get(view.id).state.productionMotionPrompts);
  assert.deepEqual(ctx.rows.get(view.id).episode, frozen);
  const rendered = ctx.calls.find(call => call[0] === 'render')[1];
  assert.deepEqual(rendered.state.audio.alignment, view.audioQuality.alignment);
});

test('unavailable rhythm and already-saved prompts are preserved without claiming measured motion timing', async () => {
  const ctx = setup({ snapshotAudio: async () => ({ url: 'https://storage.test/audio', durationSeconds: 28 }) });
  const view = await ctx.service.create(USER, episode(), TRACK), frozen = structuredClone(ctx.rows.get(view.id).episode);
  const result = await ctx.service.advance(USER, view.id);
  assert.equal(result.audioQuality.alignment.status, 'fallback');
  assert.equal(ctx.rows.get(view.id).state.productionMotionPrompts, undefined); assert.deepEqual(ctx.rows.get(view.id).episode, frozen);
  const saved = setup(); const old = await saved.service.create(USER, episode(), TRACK);
  delete saved.rows.get(old.id).state.audio.alignment; // pre-change durable job
  const oldEpisode = structuredClone(saved.rows.get(old.id).episode);
  const oldResult = await saved.service.advance(USER, old.id);
  assert.equal(oldResult.audioQuality.alignment.appliedToMotionPrompts, false);
  assert.equal(oldResult.audioQuality.alignment.reason, 'saved-motion-prompts-preserved');
  assert.equal(saved.rows.get(old.id).state.productionMotionPrompts, undefined); assert.deepEqual(saved.rows.get(old.id).episode, oldEpisode);
});

test('alignment that would exceed the classic prompt limit falls back without trimming authored instructions', async () => {
  const source = episode(), clips = compileLegacyPetClips(source);
  source.shots[0].action += 'x'.repeat(4096 - clips[0].videoPrompt.length);
  assert.equal(compileLegacyPetClips(source)[0].videoPrompt.length, 4096);
  const ctx = setup(), view = await ctx.service.create(USER, source, TRACK), frozen = structuredClone(ctx.rows.get(view.id).episode);
  const result = await ctx.service.advance(USER, view.id);
  assert.equal(result.audioQuality.alignment.status, 'fallback'); assert.equal(result.audioQuality.alignment.reason, 'motion-timing-or-prompt-limit');
  assert.equal(ctx.rows.get(view.id).state.productionMotionPrompts, undefined); assert.deepEqual(ctx.rows.get(view.id).episode, frozen);
  assert.equal(ctx.calls.filter(call => ['image', 'video'].includes(call[0])).length, 0);
});

test('permanent GET exceptions hold once and preserve the original paid request', async () => {
  const errors = [new PetPipelineError('HTTP 401', 'PROVIDER_HTTP', 400, 401), new PetPipelineError('HTTP 404', 'PROVIDER_HTTP', 400, 404),
    ...['PROVIDER_CONFIG', 'REQUEST_ID', 'PROVIDER_RESPONSE', 'PROVIDER_STATUS', 'MEDIA_URL', 'MEDIA_HOST'].map(code => new PetPipelineError('Safe failure', code))];
  for (const error of errors) {
    const ctx = setup({ pollVideo: async id => { ctx.calls.push(['poll', id]); throw error; } });
    const id = await pending(ctx), request = ctx.rows.get(id).state.shots[0].requestId;
    const view = await ctx.service.advance(USER, id), held = ctx.rows.get(id);
    assert.equal(view.status, 'held', error.code); assert.equal(view.canResume, false); assert.equal(held.state.failureCode, error.code);
    assert.equal(held.state.shots[0].requestId, request); assert.equal(held.state.shots[0].retrieval.attempts, 1); assert.equal(held.state.lease, undefined);
    await ctx.service.advance(USER, id);
    await assert.rejects(ctx.service.resume(USER, id), problem => problem.code === 'RECOVERY_NOT_SAFE');
    assert.equal(ctx.calls.filter(call => call[0] === 'video').length, 1); assert.equal(ctx.calls.filter(call => call[0] === 'poll').length, 1);
  }
});

test('timeouts, rate limits and provider outages retry the same request within a persisted count', async () => {
  for (const error of [new Error('timeout'), new PetPipelineError('HTTP 429', 'PROVIDER_HTTP', 400, 429), new PetPipelineError('HTTP 503', 'PROVIDER_HTTP', 400, 503)]) {
    let attempts = 0;
    const ctx = setup({ pollVideo: async id => { ctx.calls.push(['poll', id]); if (++attempts === 1) throw error; return { status: 'done', url: 'https://vidgen.x.ai/saved.mp4' }; } });
    const id = await pending(ctx), request = ctx.rows.get(id).state.shots[0].requestId;
    const delayed = await ctx.service.advance(USER, id); assert.equal(delayed.status, 'generating');
    const stored = structuredClone(ctx.rows.get(id).state.shots[0].retrieval); assert.equal(stored.attempts, 1);
    const reloaded = createPetVideoService(ctx.deps); ctx.tick(); await reloaded.advance(USER, id);
    assert.equal(ctx.rows.get(id).state.shots[0].retrieval.attempts, 2); assert.equal(ctx.rows.get(id).state.shots[0].retrieval.deadlineAt, stored.deadlineAt);
    assert.deepEqual(ctx.calls.filter(call => call[0] === 'poll').map(call => call[1]), [request, request]);
    assert.equal(ctx.calls.filter(call => call[0] === 'video').length, 1);
  }
});

test('count/deadline exhaustion holds without GET; explicit recovery is GET-only with the same request ID', async () => {
  for (const exhausted of ['count', 'deadline']) {
    const ctx = setup(); const id = await pending(ctx), shot = ctx.rows.get(id).state.shots[0], request = shot.requestId;
    if (exhausted === 'count') { shot.retrieval.attempts = PET_VIDEO_POLL_MAX_ATTEMPTS; shot.retrieval.totalAttempts = PET_VIDEO_POLL_MAX_ATTEMPTS; }
    else ctx.setTime(shot.retrieval.startedAt + PET_VIDEO_POLL_MAX_WAIT_MS + 1);
    const exhaustedView = await createPetVideoService(ctx.deps).advance(USER, id);
    assert.equal(exhaustedView.status, 'held'); assert.equal(exhaustedView.canResume, true);
    assert.equal(ctx.rows.get(id).state.failureCode, 'PROVIDER_POLL_TIMEOUT'); assert.equal(ctx.calls.filter(call => call[0] === 'poll').length, 0);
    await ctx.service.resume(USER, id); assert.equal(ctx.calls.filter(call => call[0] === 'poll').length, 0);
    assert.equal(ctx.rows.get(id).state.shots[0].requestId, request); assert.equal(ctx.rows.get(id).state.shots[0].retrieval.resumeCount, 1);
    await ctx.service.advance(USER, id);
    assert.equal(ctx.rows.get(id).state.shots[0].videoStatus, 'generated'); assert.equal(ctx.calls.filter(call => call[0] === 'video').length, 1);
    assert.deepEqual(ctx.calls.filter(call => call[0] === 'poll').map(call => call[1]), [request]);
  }
});

test('last pending or transient GET exhausts its persisted budget and an expired poll lease cannot reset it', async () => {
  for (const mode of ['pending', 'timeout', 'lost-response']) {
    const ctx = setup({ pollVideo: async id => { ctx.calls.push(['poll', id]); if (mode === 'timeout') throw new Error('timeout'); return { status: 'pending' }; } });
    const id = await pending(ctx), row = ctx.rows.get(id);
    row.state.shots[0].retrieval.attempts = mode === 'lost-response' ? PET_VIDEO_POLL_MAX_ATTEMPTS : PET_VIDEO_POLL_MAX_ATTEMPTS - 1;
    if (mode === 'lost-response') row.state.lease = { token: 'lost-poll', operation: 'video_poll', shotIndex: 0, until: 1 };
    const view = await ctx.service.advance(USER, id);
    assert.equal(view.status, 'held'); assert.equal(view.canResume, true); assert.equal(ctx.rows.get(id).state.shots[0].retrieval.attempts, PET_VIDEO_POLL_MAX_ATTEMPTS);
    assert.equal(ctx.calls.filter(call => call[0] === 'poll').length, mode === 'lost-response' ? 0 : 1);
    assert.equal(ctx.calls.filter(call => call[0] === 'video').length, 1);
  }
});

test('concurrent GET advances consume one durable attempt under the existing CAS lease', async () => {
  let finishPoll, enterPoll;
  const entered = new Promise(resolve => { enterPoll = resolve; });
  const ctx = setup({ pollVideo: async id => { ctx.calls.push(['poll', id]); enterPoll(); await new Promise(resolve => { finishPoll = resolve; }); return { status: 'pending' }; } });
  const id = await pending(ctx), first = ctx.service.advance(USER, id);
  await entered;
  await ctx.service.advance(USER, id);
  assert.equal(ctx.rows.get(id).state.shots[0].retrieval.attempts, 1); assert.equal(ctx.calls.filter(call => call[0] === 'poll').length, 1);
  finishPoll(); await first;
  assert.equal(ctx.rows.get(id).state.lease, undefined); assert.equal(ctx.calls.filter(call => call[0] === 'video').length, 1);
});

test('provider GET supplies structured HTTP status and rejects malformed or untrusted results', async () => {
  const oldKey = process.env.XAI_API_KEY, oldBase = process.env.XAI_API_BASE;
  process.env.XAI_API_KEY = 'offline-stub'; process.env.XAI_API_BASE = 'https://api.x.ai/v1';
  try {
    for (const status of [401, 404, 429, 503]) {
      const provider = createPetXaiProvider(async () => new Response('bounded error', { status }));
      await assert.rejects(provider.pollVideo('saved-request'), error => error.code === 'PROVIDER_HTTP' && error.providerHttpStatus === status);
    }
    for (const [response, code] of [[{}, 'PROVIDER_STATUS'], [{ status: 'surprise' }, 'PROVIDER_STATUS'],
      [{ status: 'done', video: { url: 'broken URL' } }, 'MEDIA_URL'], [{ status: 'done', video: { url: 'https://untrusted.example/a.mp4' } }, 'MEDIA_HOST']]) {
      const provider = createPetXaiProvider(async () => Response.json(response));
      await assert.rejects(provider.pollVideo('saved-request'), error => error.code === code);
    }
    const rejected = createPetXaiProvider(async () => Response.json({ status: 'done', video: { url: 'https://vidgen.x.ai/a.mp4', respect_moderation: false } }));
    assert.deepEqual(await rejected.pollVideo('saved-request'), { status: 'failed' });
  } finally {
    if (oldKey === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = oldKey;
    if (oldBase === undefined) delete process.env.XAI_API_BASE; else process.env.XAI_API_BASE = oldBase;
  }
});
