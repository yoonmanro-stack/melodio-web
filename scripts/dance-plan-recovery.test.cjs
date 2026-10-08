/* eslint-disable @typescript-eslint/no-require-imports */
/** Instant transport failures and deterministic clocks; no external requests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(env = { OPENAI_API_KEY: 'offline-fixture-key' }) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', code)(localRequire, mod, mod.exports, { env }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}
const load = loader();
const { createDancePlan } = load('src/lib/dance/videoPlan.ts');
const { createDanceVideoService, DanceVideoError, DANCE_PLAN_TIMEOUT_MS, DANCE_PREPARE_BUDGET_MS, DANCE_VIDEO_LEASE_MS } = load('src/lib/dance/videoService.ts');
const { DANCE_CATEGORY_ID, DANCE_WORKFLOW } = load('src/lib/dance/preset.ts');
const USER = 'a0000000-0000-4000-8000-000000000001';
const TRACK = 'a0000000-0000-4000-8000-000000000002';
const JOB = 'a0000000-0000-4000-8000-000000000003';
const PLAN = { title: '새 춤', summary: '새 무대', identity: 'original performer', imagePrompt: 'opening pose', clips: ['first motion', 'second motion'] };
const snapshot = { audioUrl: 'https://storage.test/storage/v1/object/public/melodio-assets/dance_challenge/saved.wav', audioHash: 'a'.repeat(64), sourceAudioHash: 'b'.repeat(64), sourceDurationSeconds: 180, bpm: 138, onsetSeconds: [0.5] };
const input = { visualBrief: 'private creative brief', bpm: 138, onsetSeconds: [0.5] };
const badError = name => Object.assign(new Error('private provider transport detail'), { name });
function clean(error) {
  assert.doesNotMatch(JSON.stringify({ message: error.message, diagnostics: error.planFailure }), /offline-fixture-key|private creative brief|private provider|secret-payload/);
  return true;
}
test('planner allows at most 180s and distinguishes timeout from connection without retry', async () => {
  assert.equal(DANCE_PLAN_TIMEOUT_MS, 180000);
  for (const [name, code, kind] of [['TimeoutError', 'PLAN_TIMEOUT', 'timeout'], ['AbortError', 'PLAN_TIMEOUT', 'timeout'], ['TypeError', 'PLAN_CONNECTION', 'connection'], ['Error', 'PLAN_CONNECTION', 'connection']]) {
    let calls = 0; let time = 100;
    await assert.rejects(createDancePlan(input, async (_url, options) => {
      calls++; assert.ok(options.signal); time += 75123; throw badError(name);
    }, { clock: () => time }), error => {
      assert.equal(error.code, code); assert.deepEqual(error.planFailure, { code, kind, phase: 'request', elapsedMs: 75123, timeoutMs: 180000 }); return clean(error);
    });
    assert.equal(calls, 1);
  }
  await assert.rejects(createDancePlan(input, async () => { throw badError('TimeoutError'); }, { timeoutMs: 999999 }), error => error.planFailure.timeoutMs === 180000);
  await assert.rejects(createDancePlan(input, async () => { throw badError('TimeoutError'); }, { timeoutMs: 54000 }), error => error.planFailure.timeoutMs === 54000);
});
test('expired or invalid budget spends zero calls', async () => {
  for (const timeoutMs of [0, -1, NaN, Infinity]) {
    let calls = 0;
    await assert.rejects(createDancePlan(input, async () => { calls++; throw Error('unexpected'); }, { timeoutMs }), { code: 'PLAN_TIMEOUT' });
    assert.equal(calls, 0);
  }
});
test('HTTP diagnostics retain only numeric status and allowlisted request ID, never body', async () => {
  for (const requestId of ['req_safe-123', 'req secret-payload', 'x'.repeat(129)]) {
    let bodyRead = false; let cancelled = false;
    const response = { ok: false, status: 429, headers: new Headers({ 'x-request-id': requestId }),
      body: { cancel: async () => { cancelled = true; throw Error('private provider cancel detail'); } },
      json: async () => { bodyRead = true; return { error: 'secret-payload' }; } };
    await assert.rejects(createDancePlan(input, async () => response), error => {
      assert.equal(error.code, 'PLAN_HTTP'); assert.equal(error.planFailure.kind, 'http'); assert.equal(error.planFailure.httpStatus, 429);
      assert.equal(error.planFailure.providerRequestId, requestId === 'req_safe-123' ? requestId : undefined); return clean(error);
    });
    assert.equal(bodyRead, false); assert.equal(cancelled, true);
  }
});
test('body timeout and connection failures are separated from malformed output', async () => {
  for (const [name, code] of [['TimeoutError', 'PLAN_TIMEOUT'], ['TypeError', 'PLAN_CONNECTION']]) {
    const body = new ReadableStream({ start(controller) { controller.error(badError(name)); } });
    await assert.rejects(createDancePlan(input, async () => new Response(body, { headers: { 'x-request-id': 'req_body' } })), error => {
      assert.equal(error.code, code); assert.equal(error.planFailure.phase, 'response'); assert.equal(error.planFailure.providerRequestId, 'req_body'); return clean(error);
    });
  }
  for (const body of ['{secret-payload', 'null', '{}', JSON.stringify({ choices: [{ message: { content: 'secret-payload' } }] })]) {
    await assert.rejects(createDancePlan(input, async () => new Response(body)), error => {
      assert.equal(error.code, 'PLAN_RESPONSE'); assert.equal(error.planFailure.kind, 'response'); return clean(error);
    });
  }
  await assert.rejects(createDancePlan(input, async () => Response.json({ choices: [{ message: { content: '{}' } }] })), error => {
    assert.equal(error.code, 'PLAN_INVALID'); assert.equal(error.planFailure.kind, 'response'); return clean(error);
  });
});
test('valid plan succeeds in one request without changing model or creative input', async () => {
  let calls = 0;
  const plan = await createDancePlan(input, async (_url, options) => {
    calls++; const request = JSON.parse(options.body);
    assert.equal(request.model, 'gpt-5.6-sol'); assert.equal(request.reasoning_effort, 'low');
    assert.equal(JSON.parse(request.messages[1].content).visualBrief, input.visualBrief);
    return Response.json({ choices: [{ message: { content: JSON.stringify(PLAN) } }] });
  });
  assert.equal(calls, 1); assert.equal(plan.title, PLAN.title);
});
function fixture(options = {}) {
  let time = 1000; let planCalls = 0; let snapshotCalls = 0; let reuseCalls = 0;
  const meta = { workflow: DANCE_WORKFLOW, presetId: DANCE_CATEGORY_ID, isPublic: false, isInstrumental: true,
    dancePreset: { id: 'dance-hook-instrumental-v1', bpm: 138 } };
  let row = { id: TRACK, userId: USER, title: '원곡', isPublic: false, createdAt: new Date(time).toISOString(), status: 'completed', audioUrl: 'https://storage.test/full.mp3', metadata: meta, licenseHash: JSON.stringify(meta) };
  const writes = [];
  const store = {
    load: async () => structuredClone(row),
    compareAndSwap: async (previous, job) => {
      if (previous.licenseHash !== row.licenseHash) return null;
      const metadata = { ...row.metadata, danceVideo: structuredClone(job) };
      row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; writes.push(structuredClone(job)); return structuredClone(row);
    },
  };
  const service = createDanceVideoService({ store, now: () => time,
    snapshot: async () => { snapshotCalls++; time += options.audioMs || 0; return snapshot; },
    reuseSnapshot: async () => { reuseCalls++; time += options.audioMs || 0; },
    plan: async (job, budget) => {
      planCalls++; assert.equal(Date.parse(job.inFlight.at), time, 'lease renewed immediately before planning');
      assert.equal(job.audioHash, snapshot.audioHash); assert.equal(job.audioUrl, snapshot.audioUrl);
      assert.equal(budget.timeoutMs, Math.min(180000, DANCE_PREPARE_BUDGET_MS - (options.audioMs || 0)));
      time += options.planMs || 0;
      assert.ok(time - Date.parse(job.inFlight.at) < DANCE_VIDEO_LEASE_MS, 'active planning stays within lease');
      if (options.planError) throw options.planError;
      return structuredClone(PLAN);
    },
  });
  return { service, writes, counts: () => ({ planCalls, snapshotCalls, reuseCalls }), row: () => structuredClone(row),
    setReady: () => { const metadata = { ...row.metadata, danceVideo: { ...snapshot, id: JOB, trackId: TRACK, status: 'ready', startSeconds: 22, durationSeconds: 30, visualBrief: 'old brief', createdAt: new Date(time).toISOString(), updatedAt: new Date(time).toISOString() } }; row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; } };
}
test('long audio preparation reduces planner deadline and renews lease without changing selected WAV', async () => {
  const c = fixture({ audioMs: 120000, planMs: 149000 });
  const job = await c.service.prepare(USER, TRACK, 22, '');
  assert.equal(job.status, 'ready'); assert.equal(job.audioHash, snapshot.audioHash); assert.equal(job.startSeconds, 22);
  assert.deepEqual(c.counts(), { planCalls: 1, snapshotCalls: 1, reuseCalls: 0 });
  assert.equal(c.writes[0].inFlight.at, new Date(1000).toISOString());
  assert.equal(c.writes[1].inFlight.at, new Date(121000).toISOString());
});
test('exhausted preparation budget preserves verified snapshot and submits zero paid plans', async () => {
  const c = fixture({ audioMs: DANCE_PREPARE_BUDGET_MS });
  const job = await c.service.prepare(USER, TRACK, 22, '');
  assert.equal(job.status, 'attention'); assert.equal(job.planningSubmitted, undefined); assert.equal(job.inFlight, undefined);
  assert.equal(job.audioHash, snapshot.audioHash); assert.equal(job.audioUrl, snapshot.audioUrl);
  assert.deepEqual(job.planFailure, { code: 'PLAN_TIMEOUT', kind: 'timeout', phase: 'preparation', elapsedMs: 270000, timeoutMs: 270000 });
  assert.equal(c.counts().planCalls, 0);
});
test('failed plan persists only compact diagnostics, protects original audio, and never automatically retries', async () => {
  const diagnostics = { code: 'PLAN_TIMEOUT', kind: 'timeout', phase: 'request', elapsedMs: 180000, timeoutMs: 180000 };
  const c = fixture({ planError: new DanceVideoError('대기 시간이 초과되었습니다.', 'PLAN_TIMEOUT', 504, diagnostics) });
  const job = await c.service.prepare(USER, TRACK, 22, '');
  assert.equal(job.status, 'attention'); assert.equal(job.planningSubmitted, true); assert.deepEqual(job.planFailure, diagnostics);
  assert.equal(job.audioHash, snapshot.audioHash); assert.equal(job.audioUrl, snapshot.audioUrl); assert.equal(c.row().audioUrl, 'https://storage.test/full.mp3');
  assert.equal((await c.service.prepare(USER, TRACK, 22, '')).id, job.id);
  await assert.rejects(c.service.prepare(USER, TRACK, 22, 'changed brief'), { code: 'JOB_EXISTS' });
  await c.service.advance(USER, TRACK, job.id); assert.equal(c.counts().planCalls, 1);
});
test('visual-only replan still reuses the original exact clip under the new budget', async () => {
  const c = fixture({ audioMs: 5000 }); c.setReady();
  const job = await c.service.prepare(USER, TRACK, 22, 'new brief');
  assert.equal(job.status, 'ready'); assert.equal(job.audioHash, snapshot.audioHash); assert.equal(job.audioUrl, snapshot.audioUrl);
  assert.deepEqual(c.counts(), { planCalls: 1, snapshotCalls: 0, reuseCalls: 1 });
});
