const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { canSubmit, canRegister, firstClip, validateManifest, normalizePersonaDescription, registerPersonas, CAP } = require('./discovery-vocal-rollout-240.cjs');

function manifestFixture() {
  const languages = ['en', 'ko', 'ja', 'fr'];
  const jobs = Array.from({ length: CAP }, (_, index) => {
    const gender = index < 120 ? 'female' : 'male';
    const number = index % 120 + 1;
    const id = `discovery-v2-${gender === 'female' ? 'f' : 'm'}-${String(number).padStart(3, '0')}`;
    const profile = { id, gender, provisionalName: `Fixture ${index}`, stylePrompt: `Original acoustic fixture design ${index}`,
      verificationStatus: 'design_only', audibleAnchors: ['stable register', 'dry grain'], signatureBehavior: 'straight voiced sustain' };
    return { id, profile, gender, language: languages[Math.floor((number - 1) / 30)], state: 'planned', options: {
      model: 'V6', durationSeconds: 45, instrumental: false, vocalGender: gender === 'female' ? 'f' : 'm',
      style: profile.stylePrompt, lyrics: 'A complete fixture lyric', exclude: 'doubled lead',
    } };
  });
  return { requestCap: CAP, selectedVersion: 'A', authorization: 'user-20261005-first-output-all240', jobs };
}

function completedA() {
  return { state: 'complete', taskId: 'charged-task', clips: [{ id: 'first-output', url: 'https://cdn1.suno.ai/a.mp3' },
    { id: 'second-output', url: 'https://cdn1.suno.ai/b.mp3' }], sample: { version: 'A', clipId: 'first-output' } };
}

test('the reference is always the first output and an unavailable A never falls back to B', () => {
  const job = completedA();
  assert.equal(firstClip(job), job.clips[0]);
  for (const first of [undefined, { id: 'first-output' }, { url: 'https://cdn1.suno.ai/a.mp3' }]) {
    assert.throws(() => firstClip({ ...job, clips: [first, job.clips[1]] }), /FIRST_A_NOT_READY/);
  }
  assert.throws(() => firstClip({ ...job, state: 'processing' }), /FIRST_A_NOT_READY/);
});

test('registration accepts only an A sample belonging to the first output', () => {
  const job = completedA();
  assert.equal(canRegister(job), true);
  assert.equal(canRegister({ ...job, sample: { version: 'B', clipId: job.clips[1].id } }), false);
  assert.equal(canRegister({ ...job, sample: { version: 'A', clipId: job.clips[1].id } }), false);
  assert.equal(canRegister({ ...job, sample: undefined }), false);
  assert.equal(canRegister({ ...job, state: 'processing' }), false);
});

test('uncertain, submitting, held and completed registrations are never automatically resent', () => {
  const job = completedA();
  for (const personaState of ['uncertain', 'submitting', 'held', 'ready']) {
    assert.equal(canRegister({ ...job, personaState }), false, personaState);
  }
});

test('charged generation jobs remain ineligible regardless of their saved generation state', () => {
  for (const state of ['planned', 'throttled', 'submitting', 'submission-uncertain', 'processing', 'complete', 'failed']) {
    assert.equal(canSubmit({ state, taskId: 'already-charged-task' }), false, state);
  }
  assert.equal(canSubmit({ state: 'planned' }), true);
  assert.equal(canSubmit({ state: 'throttled' }), true);
  for (const state of ['submitting', 'submission-uncertain', 'processing', 'complete', 'failed']) {
    assert.equal(canSubmit({ state }), false, state);
  }
});

test('scope remains exactly 240 designs with 120 per gender and 30 in every gender-language cell', () => {
  const valid = manifestFixture();
  validateManifest(valid);
  const cells = valid.jobs.reduce((counts, job) => {
    const key = `${job.gender}:${job.language}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  assert.equal(Object.keys(cells).length, 8);
  assert.ok(Object.values(cells).every(count => count === 30));
  for (const patch of [{ requestCap: 241 }, { selectedVersion: 'B' }, { authorization: 'other-scope' },
    { jobs: valid.jobs.slice(0, 239) }, { jobs: [...valid.jobs, valid.jobs[0]] }]) {
    assert.throws(() => validateManifest({ ...valid, ...patch }), /ROLLOUT_SCOPE/);
  }
  const unbalanced = manifestFixture();
  unbalanced.jobs[0].language = 'ko';
  assert.throws(() => validateManifest(unbalanced), /ROLLOUT_BALANCE/);
  const wrongGender = manifestFixture();
  wrongGender.jobs[0].gender = 'male';
  assert.throws(() => validateManifest(wrongGender), /ROLLOUT_REQUEST/);
});

test('new generation options cannot switch models, add persona reuse or exceed the style limit', () => {
  for (const patch of [{ model: 'V6_WILD' }, { durationSeconds: 46 }, { instrumental: true },
    { vocalGender: 'm' }, { personaId: 'existing_persona' }, { personaModel: 'style_persona' }, { style: 'x'.repeat(1000) }]) {
    const fixture = manifestFixture();
    Object.assign(fixture.jobs[0].options, patch);
    assert.throws(() => validateManifest(fixture), /ROLLOUT_REQUEST/);
  }
});

test('the actual planner imports 12 charged tasks and A receipts without resubmission or real I/O', async () => {
  const fixture = manifestFixture();
  const imported = [...fixture.jobs.slice(0, 6), ...fixture.jobs.slice(120, 126)].map((job, index) => ({ ...job,
    state: index % 2 ? 'complete' : 'processing', taskId: `charged-initial-${index}`, creditsConsumed: 12,
    clips: [{ id: `initial-${index}-first`, url: 'https://cdn1.suno.ai/a.mp3' }, { id: `initial-${index}-second`, url: 'https://cdn1.suno.ai/b.mp3' }],
    samples: [{ version: 'B', clipId: `initial-${index}-second` }, { version: 'A', clipId: `initial-${index}-first` }],
  }));
  const scriptPath = path.join(__dirname, 'discovery-vocal-rollout-240.cjs');
  const root = path.resolve(__dirname, '..');
  const artifactDir = path.join(root, 'artifacts/discovery-vocals-v2-20261005');
  const rolloutPath = path.join(artifactDir, 'rollout-240.json');
  const files = new Map([
    [path.join(artifactDir, 'manifest.json'), JSON.stringify({ jobs: imported })],
    ...['female', 'male'].map(gender => [path.join(root, `docs/research/voice-discovery-v2/${gender}-profiles.json`),
      JSON.stringify(fixture.jobs.filter(job => job.gender === gender).map(job => job.profile))]),
    [path.join(root, 'src/data/discoveryVoices.json'), JSON.stringify(['female', 'male'].flatMap(gender =>
      ['en', 'ko', 'ja', 'fr'].map(language => ({ gender, language, lyricsPrompt: `${language} fixture lyrics` }))))],
  ]);
  let networkCalls = 0;
  const moduleFixture = { exports: {} };
  const processFixture = { argv: ['node', scriptPath, 'plan'], exitCode: 0 };
  const errors = [];
  const virtualFs = {
    mkdirSync() {}, rmdirSync() {},
    existsSync(file) { return files.has(file); },
    readFileSync(file) { if (!files.has(file)) throw new Error('Unexpected virtual read'); return files.get(file); },
    writeFileSync(file, value) { files.set(file, String(value)); },
    renameSync(from, to) { if (!files.has(from)) throw new Error('Missing virtual temporary file'); files.set(to, files.get(from)); files.delete(from); },
  };
  const requireFixture = name => {
    if (name === 'node:fs') return virtualFs;
    if (name === '@next/env') return { loadEnvConfig() {} };
    if (name === '../worker/suno-provider') return new Proxy({}, { get() { networkCalls++; throw new Error('Planner must not invoke provider'); } });
    return require(name);
  };
  requireFixture.main = moduleFixture;
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), { __dirname, module: moduleFixture,
    require: requireFixture, process: processFixture, console: { log() {}, error(message) { errors.push(message); } },
    fetch() { networkCalls++; throw new Error('Planner must not invoke fetch'); }, setTimeout });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
  assert.equal(processFixture.exitCode, 0);
  assert.equal(networkCalls, 0);
  const planned = JSON.parse(files.get(rolloutPath));
  validateManifest(planned);
  assert.equal(planned.importedRequests, 12);
  assert.equal(planned.jobs.filter(canSubmit).length, 228);
  assert.equal(planned.jobs.filter(job => job.taskId).length, 12);
  for (const original of imported) {
    const job = planned.jobs.find(candidate => candidate.id === original.id);
    assert.equal(job.taskId, original.taskId);
    assert.equal(job.state, original.state);
    assert.equal(job.creditsConsumed, 12);
    assert.equal(job.language, 'ko');
    assert.equal(job.sample.version, 'A');
    assert.equal(job.sample.clipId, original.clips[0].id);
    assert.equal(canSubmit(job), false);
  }
});

function registrationFixture(count) {
  const m = manifestFixture();
  for (const [index, job] of m.jobs.slice(0, count).entries()) {
    job.state = 'complete';
    job.taskId = `charged-source-${index}`;
    job.clips = [{ id: `first-audio-${index}`, url: 'https://cdn1.suno.ai/a.mp3' },
      { id: `second-audio-${index}`, url: 'https://cdn1.suno.ai/b.mp3' }];
    job.sample = { version: 'A', clipId: job.clips[0].id };
  }
  return m;
}
function registrationRecorder() {
  const snapshots = [];
  return { snapshots, persist(m) {
    snapshots.push(m.jobs.filter(job => job.taskId).map(job => ({ id: job.id, taskId: job.taskId,
      personaState: job.personaState, personaId: job.personaId, personaModel: job.personaModel,
      personaSubmittedAt: job.personaSubmittedAt, personaAudioId: job.personaAudioId,
      personaTaskId: job.personaTaskId, personaSourceVersion: job.personaSourceVersion,
      personaAttemptId: job.personaAttemptId, personaRequestSha256: job.personaRequestSha256, personaTimeoutMs: job.personaTimeoutMs,
      personaHttpStatus: job.personaHttpStatus, personaProviderCode: job.personaProviderCode, personaErrorCategory: job.personaErrorCategory,
      personaFinishedAt: job.personaFinishedAt, personaElapsedMs: job.personaElapsedMs })));
  } };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const personaResponse = taskId => new Response(JSON.stringify({ code: 200, data: { persona_id: `registered_${taskId}` } }));
const registrationConfig = { apiKey: 'offline-fixture-only' };

test('parallel registration caps in-flight requests at eight and spaces complete groups before continuing', async () => {
  const m = registrationFixture(17), recorder = registrationRecorder();
  const pending = [], pauses = [], groupStarts = [];
  let active = 0, maximum = 0;
  const operation = registerPersonas(m, registrationConfig, {
    persist: recorder.persist,
    fetchImpl(url, init) {
      const input = JSON.parse(init.body).input;
      if (pending.length % 8 === 0) groupStarts.push(Date.now());
      const receipt = recorder.snapshots.at(-1).find(job => job.taskId === input.task_id);
      assert.equal(receipt.personaState, 'submitting');
      assert.ok(receipt.personaSubmittedAt);
      const response = deferred();
      pending.push({ ...response, taskId: input.task_id });
      maximum = Math.max(maximum, ++active);
      return response.promise.finally(() => { active--; });
    },
    pause(ms) { pauses.push({ ms, elapsed: Date.now() - groupStarts.at(-1) }); return Promise.resolve(); },
  });
  assert.equal(pending.length, 8);
  assert.equal(active, 8);
  for (const request of pending.slice(0, 7)) request.resolve(personaResponse(request.taskId));
  await tick();
  assert.equal(pending.length, 8, 'the next group waits for the eighth result');
  pending[7].resolve(personaResponse(pending[7].taskId));
  await tick();
  assert.equal(pending.length, 16);
  assert.equal(active, 8);
  for (const request of pending.slice(8, 16)) request.resolve(personaResponse(request.taskId));
  await tick();
  assert.equal(pending.length, 17);
  pending[16].resolve(personaResponse(pending[16].taskId));
  await operation;
  assert.equal(maximum, 8);
  assert.equal(active, 0);
  assert.equal(pauses.length, 2);
  for (const pause of pauses) {
    assert.ok(pause.ms >= 0 && pause.ms <= 11000);
    assert.ok(pause.ms + pause.elapsed >= 10950, 'the requested pause covers the remaining eleven-second batch interval');
  }
  for (const job of m.jobs.slice(0, 17)) {
    const durable = recorder.snapshots.at(-1).find(record => record.id === job.id);
    assert.equal(durable.personaState, 'ready');
    assert.equal(durable.personaId, `registered_${job.taskId}`);
    assert.equal(durable.personaModel, 'style_persona');
    assert.equal(durable.personaAudioId, job.clips[0].id);
    assert.equal(durable.personaTaskId, job.taskId);
    assert.equal(durable.personaSourceVersion, 'A');
  }
});

test('registration skips ready, uncertain, submitting, held and B sources and posts only the first A payload', async () => {
  const m = registrationFixture(7), recorder = registrationRecorder();
  ['ready', 'uncertain', 'submitting', 'held'].forEach((state, index) => { m.jobs[index].personaState = state; });
  m.jobs[0].personaId = 'existing_ready_persona';
  m.jobs[4].sample = { version: 'B', clipId: m.jobs[4].clips[1].id };
  m.jobs[5].state = 'processing';
  const selected = m.jobs[6];
  selected.profile.stylePrompt = `Distinct original design ${'x'.repeat(220)}`;
  selected.options.style = `${selected.profile.stylePrompt} controlled audition`;
  const payloads = [];
  await registerPersonas(m, registrationConfig, { persist: recorder.persist, pause: async () => {}, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.kie.ai/api/v1/jobs/createTask');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer offline-fixture-only');
    const payload = JSON.parse(init.body); payloads.push(payload);
    assert.equal(recorder.snapshots.at(-1).find(job => job.id === selected.id).personaState, 'submitting');
    assert.equal(payload.model, 'ai-music-api/generate-persona');
    assert.deepEqual(payload.input, { task_id: selected.taskId, audio_id: selected.clips[0].id,
      name: selected.profile.provisionalName, description: selected.profile.stylePrompt, vocal_start: 0, vocal_end: 30,
      style: selected.profile.stylePrompt.slice(0, 200) });
    assert.notEqual(payload.input.audio_id, selected.clips[1].id);
    return personaResponse(selected.taskId);
  } });
  assert.equal(payloads.length, 1);
  assert.equal(selected.personaState, 'ready');
  assert.deepEqual(m.jobs.slice(0, 4).map(job => job.personaState), ['ready', 'uncertain', 'submitting', 'held']);
  assert.equal(m.jobs[0].personaId, 'existing_ready_persona');
  assert.equal(m.jobs[4].personaState, undefined);
});

test('a failed registration group settles every sibling, persists all results and never starts the next group', async () => {
  const m = registrationFixture(16), recorder = registrationRecorder();
  const requests = [], pauses = [];
  let outcomeSettled = false;
  const operation = registerPersonas(m, registrationConfig, { persist: recorder.persist,
    pause: async ms => { pauses.push(ms); }, fetchImpl(url, init) {
      const input = JSON.parse(init.body).input, response = deferred();
      requests.push({ ...response, taskId: input.task_id });
      return response.promise;
    } });
  const outcome = operation.then(() => ({ ok: true }), error => ({ error })).then(result => { outcomeSettled = true; return result; });
  assert.equal(requests.length, 8);
  requests[0].reject(new Error('SIMULATED_TRANSPORT_UNCERTAINTY'));
  for (const request of requests.slice(1, 7)) request.resolve(personaResponse(request.taskId));
  await tick();
  assert.equal(m.jobs[0].personaState, 'uncertain');
  assert.equal(outcomeSettled, false, 'the failed group still waits for its final sibling');
  assert.equal(requests.length, 8);
  requests[7].resolve(personaResponse(requests[7].taskId));
  const result = await outcome;
  assert.match(result.error.message, /ROLLOUT_PERSONA_HELD/);
  assert.equal(requests.length, 8);
  assert.deepEqual(pauses, []);
  const durable = recorder.snapshots.at(-1);
  assert.equal(durable[0].personaState, 'uncertain');
  assert.equal(durable.slice(1, 8).filter(job => job.personaState === 'ready').length, 7);
  assert.ok(m.jobs.slice(8, 16).every(job => !job.personaState));
  const resumedTasks = [];
  await registerPersonas(m, registrationConfig, { limit: 1, persist: recorder.persist, pause: async () => {}, fetchImpl: async (url, init) => {
    const taskId = JSON.parse(init.body).input.task_id; resumedTasks.push(taskId); return personaResponse(taskId);
  } });
  assert.deepEqual(resumedTasks, [m.jobs[8].taskId]);
  assert.equal(m.jobs[0].personaState, 'uncertain', 'a later explicit run does not resend the uncertain request');
});

test('unsupported registration concurrency fails before persistence or any request', async () => {
  for (const concurrency of [0, 9, 1.5]) {
    let calls = 0;
    await assert.rejects(registerPersonas(registrationFixture(1), registrationConfig, { concurrency,
      persist() { calls++; }, fetchImpl() { calls++; throw new Error('Unexpected request'); }, pause: async () => {} }), /PERSONA_CONCURRENCY/);
    assert.equal(calls, 0);
  }
});

test('registration persists an immutable first A request receipt before POST and enforces bounded timeouts', async () => {
  for (const timeoutMs of [undefined, 30000, 120000]) {
    const m = registrationFixture(1), recorder = registrationRecorder();
    const expected = timeoutMs ?? 90000;
    await registerPersonas(m, registrationConfig, { ...(timeoutMs === undefined ? {} : { timeoutMs }), persist: recorder.persist,
      pause: async () => {}, fetchImpl: async (url, init) => {
        const input = JSON.parse(init.body).input, receipt = recorder.snapshots.at(-1)[0];
        assert.equal(receipt.personaState, 'submitting');
        assert.match(receipt.personaAttemptId, /^[a-f0-9-]{36}$/);
        assert.equal(receipt.personaTimeoutMs, expected);
        assert.equal(receipt.personaTaskId, input.task_id);
        assert.equal(receipt.personaAudioId, input.audio_id);
        assert.equal(receipt.personaSourceVersion, 'A');
        assert.equal(receipt.personaRequestSha256, crypto.createHash('sha256').update(init.body).digest('hex'));
        assert.equal(receipt.personaHttpStatus, null);
        assert.equal(receipt.personaProviderCode, null);
        assert.equal(init.signal.aborted, false);
        return personaResponse(input.task_id);
      } });
    const ready = recorder.snapshots.at(-1)[0];
    assert.equal(ready.personaState, 'ready');
    assert.equal(ready.personaHttpStatus, 200);
    assert.equal(ready.personaProviderCode, 200);
    assert.equal(ready.personaErrorCategory, null);
    assert.ok(Number.isFinite(Date.parse(ready.personaFinishedAt)));
    assert.ok(Number.isInteger(ready.personaElapsedMs) && ready.personaElapsedMs >= 0);
    assert.equal(ready.personaAttemptId, recorder.snapshots[0][0].personaAttemptId);
  }
  for (const timeoutMs of [29999, 120001, 90000.5, Infinity, '90000']) {
    let sideEffects = 0;
    await assert.rejects(registerPersonas(registrationFixture(1), registrationConfig, { timeoutMs,
      persist() { sideEffects++; }, fetchImpl() { sideEffects++; throw new Error('Unexpected call'); }, pause: async () => {} }), /PERSONA_TIMEOUT/);
    assert.equal(sideEffects, 0);
  }
});

test('registration failures persist compact categories and numeric codes, remain uncertain and preserve recovery evidence', async () => {
  const cases = [
    { category: 'timeout', status: null, code: null, response: async () => { const error = new Error('PRIVATE_TIMEOUT_MESSAGE'); error.name = 'TimeoutError'; throw error; } },
    { category: 'transport', status: null, code: null, response: async () => { throw new Error('PRIVATE_TRANSPORT_MESSAGE'); } },
    { category: 'http_error', status: 503, code: 503, response: async () => new Response(JSON.stringify({ code: 503, msg: 'PRIVATE_PROVIDER_MESSAGE' }), { status: 503 }) },
    { category: 'provider_error', status: 200, code: 500, response: async () => new Response(JSON.stringify({ code: 500, msg: 'PRIVATE_PROVIDER_MESSAGE' })) },
    { category: 'invalid_json', status: 200, code: null, response: async () => new Response('PRIVATE_INVALID_RESPONSE') },
  ];
  for (const example of cases) {
    const m = registrationFixture(1), recorder = registrationRecorder();
    const history = [{ result: 'previous confirmed terminal failure', sourceTaskId: m.jobs[0].taskId }];
    m.jobs[0].personaFailureHistory = history;
    let calls = 0;
    const options = { persist: recorder.persist, pause: async () => {}, fetchImpl: async () => { calls++; return example.response(); } };
    await assert.rejects(registerPersonas(m, registrationConfig, options), /ROLLOUT_PERSONA_HELD/);
    const receipt = recorder.snapshots.at(-1)[0];
    assert.equal(receipt.personaState, 'uncertain');
    assert.equal(receipt.personaErrorCategory, example.category);
    assert.equal(receipt.personaHttpStatus, example.status);
    assert.equal(receipt.personaProviderCode, example.code);
    assert.ok(Number.isFinite(Date.parse(receipt.personaFinishedAt)));
    assert.ok(Number.isInteger(receipt.personaElapsedMs) && receipt.personaElapsedMs >= 0);
    assert.match(receipt.personaRequestSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(m.jobs[0].personaFailureHistory, history);
    assert.equal(JSON.stringify(recorder.snapshots).includes('PRIVATE_'), false);
    await registerPersonas(m, registrationConfig, options);
    assert.equal(calls, 1, 'the uncertain registration is never sent again');
  }
});

test('explicit continuation drains a failed group then processes only the other original pending sources', async () => {
  const m = registrationFixture(20), recorder = registrationRecorder();
  ['held', 'uncertain', 'submitting', 'ready'].forEach((state, index) => { m.jobs[16 + index].personaState = state; });
  const requests = [], pauses = [];
  const operation = registerPersonas(m, registrationConfig, { continueOnHeld: true, persist: recorder.persist,
    pause: async ms => { pauses.push(ms); }, fetchImpl(url, init) {
      const taskId = JSON.parse(init.body).input.task_id, response = deferred();
      requests.push({ ...response, taskId });
      return response.promise;
    } });
  assert.equal(requests.length, 8);
  requests[0].reject(new Error('SIMULATED_HELD_RESULT'));
  for (const request of requests.slice(1, 7)) request.resolve(personaResponse(request.taskId));
  await tick();
  assert.equal(requests.length, 8, 'continuation still waits for every sibling in the failed group');
  assert.equal(m.jobs[0].personaState, 'uncertain');
  requests[7].resolve(personaResponse(requests[7].taskId));
  await tick();
  assert.equal(requests.length, 16);
  const persisted = recorder.snapshots.find(snapshot => snapshot.slice(0, 8).filter(job => job.personaState === 'ready').length === 7);
  assert.ok(persisted, 'all seven successes are durable before continuing');
  assert.equal(persisted[0].personaState, 'uncertain');
  for (const request of requests.slice(8)) request.resolve(personaResponse(request.taskId));
  await operation;
  assert.equal(pauses.length, 1);
  assert.equal(m.jobs.slice(0, 16).filter(job => job.personaState === 'ready').length, 15);
  assert.equal(m.jobs[0].personaState, 'uncertain');
  assert.deepEqual(m.jobs.slice(16, 20).map(job => job.personaState), ['held', 'uncertain', 'submitting', 'ready']);
  assert.equal(new Set(requests.map(request => request.taskId)).size, 16);
  assert.equal(requests.filter(request => request.taskId === m.jobs[0].taskId).length, 1);
  let resubmissions = 0;
  await registerPersonas(m, registrationConfig, { continueOnHeld: true, persist: recorder.persist, pause: async () => {}, fetchImpl() {
    resubmissions++;
    throw new Error('Completed and uncertain sources must never be resent');
  } });
  assert.equal(resubmissions, 0);
  assert.equal(m.jobs[0].personaState, 'uncertain');
});

test('explicit continuation still stops on a failed durable receipt write', async () => {
  const m = registrationFixture(16), recorder = registrationRecorder();
  let failedWrite = false, calls = 0;
  await assert.rejects(registerPersonas(m, registrationConfig, { continueOnHeld: true,
    persist(manifest) {
      if (manifest.jobs[0].personaState === 'uncertain' && !failedWrite) { failedWrite = true; throw new Error('SIMULATED_RECEIPT_WRITE_FAILURE'); }
      recorder.persist(manifest);
    }, pause: async () => { throw new Error('The next group must not start'); }, fetchImpl: async (url, init) => {
      calls++;
      const taskId = JSON.parse(init.body).input.task_id;
      return taskId === m.jobs[0].taskId ? new Response(JSON.stringify({ code: 500 })) : personaResponse(taskId);
    } }), /ROLLOUT_PERSONA_HELD/);
  assert.equal(failedWrite, true);
  assert.equal(calls, 8);
  assert.equal(m.jobs[0].personaState, 'uncertain');
  assert.ok(m.jobs.slice(8, 16).every(job => !job.personaState));
});

test('generic persona wording is normalized before truncation and hashing without changing the acoustic design', async () => {
  const m = registrationFixture(2), recorder = registrationRecorder();
  const source = 'Adult female low alto, compact dry woody body and narrow neutral oral resonance. Keep the voice woody and matte at ordinary intensity with a stable pitched center. THE VOICE has short straight endings, restrained breath leakage and no imitation of any singer.';
  const normalized = 'Adult female low alto, compact dry woody body and narrow neutral oral resonance. Keep the vocal timbre woody and matte at ordinary intensity with a stable pitched center. the vocal timbre has short straight endings, restrained breath leakage and no imitation of any singer.';
  m.jobs[0].profile.stylePrompt = source;
  m.jobs[0].options.style = `${source} Korean solo audition`;
  const beforeOptions = { ...m.jobs[0].options }, otherDescription = m.jobs[1].profile.stylePrompt;
  assert.equal(normalizePersonaDescription(source), normalized);
  assert.equal(normalizePersonaDescription('Keep the voices clear and use voice-leading.'), 'Keep the voices clear and use voice-leading.');
  assert.equal(normalizePersonaDescription(otherDescription), otherDescription);
  const posted = [];
  await registerPersonas(m, registrationConfig, { persist: recorder.persist, pause: async () => {}, fetchImpl: async (url, init) => {
    const payload = JSON.parse(init.body), index = posted.length;
    posted.push(payload);
    const expectedDescription = index === 0 ? normalized : otherDescription;
    assert.equal(payload.input.description, expectedDescription);
    assert.equal(payload.input.style, expectedDescription.slice(0, 200));
    assert.equal(payload.input.name, m.jobs[index].profile.provisionalName);
    assert.equal(payload.input.task_id, m.jobs[index].taskId);
    assert.equal(payload.input.audio_id, m.jobs[index].clips[0].id);
    const durable = recorder.snapshots.at(-1).find(job => job.taskId === payload.input.task_id);
    assert.equal(durable.personaRequestSha256, crypto.createHash('sha256').update(init.body).digest('hex'));
    if (index === 0) assert.equal(/\bthe voice\b/i.test(payload.input.description), false);
    return personaResponse(payload.input.task_id);
  } });
  assert.equal(posted.length, 2);
  assert.equal(m.jobs[0].profile.stylePrompt, source);
  assert.deepEqual(m.jobs[0].options, beforeOptions);
  assert.equal(m.jobs[1].profile.stylePrompt, otherDescription);
  assert.equal(posted[0].input.vocal_start, 0);
  assert.equal(posted[0].input.vocal_end, 30);
});

test('a replacement metadata override changes only persona description and style, with the exact request hash preserved', async () => {
  const m = registrationFixture(1), job = m.jobs[0], recorder = registrationRecorder();
  const design = JSON.stringify(job.profile), generation = JSON.stringify(job.options);
  job.personaDescription = ' Female low alto, woody body and dry grain. Keep the voice matte with stable sung pitch. ';
  const expected = 'Female low alto, woody body and dry grain. Keep the vocal timbre matte with stable sung pitch.';
  let calls = 0;
  await registerPersonas(m, registrationConfig, { persist: recorder.persist, pause: async () => {}, fetchImpl: async (url, init) => {
    calls++;
    const payload = JSON.parse(init.body);
    assert.equal(payload.input.description, expected);
    assert.equal(payload.input.style, expected.slice(0, 200));
    assert.equal(payload.input.task_id, job.taskId);
    assert.equal(payload.input.audio_id, job.clips[0].id);
    assert.equal(recorder.snapshots.at(-1)[0].personaRequestSha256, crypto.createHash('sha256').update(init.body).digest('hex'));
    return personaResponse(job.taskId);
  } });
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(job.profile), design);
  assert.equal(JSON.stringify(job.options), generation);
  for (const invalid of ['', '   ', 42, 'x'.repeat(201), `${'x'.repeat(190)} the voice`]) {
    const bad = registrationFixture(1);
    bad.jobs[0].personaDescription = invalid;
    let sideEffects = 0;
    await assert.rejects(registerPersonas(bad, registrationConfig, { persist() { sideEffects++; }, pause: async () => {},
      fetchImpl() { sideEffects++; throw new Error('Unexpected network'); } }), /ROLLOUT_PERSONA_HELD/);
    assert.equal(sideEffects, 0);
    assert.equal(bad.jobs[0].personaState, undefined);
  }
});

test('persona name overrides affect only provider names and preserve public profiles, IDs and request receipts', async () => {
  const m = registrationFixture(4), recorder = registrationRecorder();
  m.jobs[0].profile.provisionalName = 'Zoé Rivage';
  m.jobs[0].personaName = ` ${m.jobs[0].id} `;
  m.jobs[1].personaName = 'x';
  m.jobs[2].personaName = 'é'.repeat(80);
  const originals = m.jobs.slice(0, 4).map(job => ({ id: job.id, profile: structuredClone(job.profile),
    options: structuredClone(job.options), taskId: job.taskId, clips: structuredClone(job.clips), sample: structuredClone(job.sample) }));
  const expectedNames = [m.jobs[0].id, 'x', 'é'.repeat(80), m.jobs[3].profile.provisionalName];
  const posted = [];
  await registerPersonas(m, registrationConfig, { persist: recorder.persist, pause: async () => {}, fetchImpl: async (_url, init) => {
    const payload = JSON.parse(init.body), index = posted.length;
    posted.push(payload);
    assert.equal(payload.input.name, expectedNames[index]);
    assert.equal(payload.input.description, normalizePersonaDescription(originals[index].profile.stylePrompt));
    assert.equal(payload.input.task_id, originals[index].taskId);
    assert.equal(payload.input.audio_id, originals[index].clips[0].id);
    const receipt = recorder.snapshots.at(-1).find(job => job.id === originals[index].id);
    assert.equal(receipt.personaState, 'submitting');
    assert.equal(receipt.personaRequestSha256, crypto.createHash('sha256').update(init.body).digest('hex'));
    assert.ok(receipt.personaAttemptId);
    return personaResponse(payload.input.task_id);
  } });
  assert.equal(posted.length, 4);
  for (const [index, original] of originals.entries()) {
    const job = m.jobs[index];
    for (const field of ['id', 'profile', 'options', 'taskId', 'clips', 'sample']) assert.deepEqual(job[field], original[field]);
    assert.equal(job.personaState, 'ready');
    assert.equal(job.personaAudioId, original.clips[0].id);
    assert.equal(job.personaTaskId, original.taskId);
    assert.equal(job.personaSourceVersion, 'A');
  }
  assert.equal(m.jobs[0].profile.provisionalName, 'Zoé Rivage');
  assert.equal(m.jobs[0].personaName, ` ${m.jobs[0].id} `);
  assert.equal(Object.hasOwn(m.jobs[3], 'personaName'), false);
});

test('invalid persona names anywhere in the selected jobs prevent every persistence and provider dispatch', async () => {
  for (const invalid of [undefined, null, 42, {}, '', '   ', 'x'.repeat(81), 'bad\u0000name', 'bad\nname',
    '\ttrimmed control', 'bad\u007fname', 'bad\u0085name']) {
    const m = registrationFixture(9);
    m.jobs[8].personaName = invalid;
    const before = structuredClone(m);
    let effects = 0;
    await assert.rejects(registerPersonas(m, registrationConfig, { continueOnHeld: true,
      persist() { effects++; }, pause: async () => {}, fetchImpl() { effects++; throw new Error('Unexpected network'); } }), /PERSONA_NAME/);
    assert.equal(effects, 0);
    assert.deepEqual(m, before);
  }
});

test('name override validation preserves selection limits and skips existing held attempt receipts', async () => {
  const m = registrationFixture(3), recorder = registrationRecorder();
  Object.assign(m.jobs[0], { personaState: 'held', personaName: '', personaAttemptId: 'existing_held_attempt',
    personaRequestSha256: 'existing_request_hash', personaHttpStatus: 200, personaProviderCode: 400,
    personaErrorCategory: 'provider_error' });
  m.jobs[2].personaName = '';
  const heldBefore = structuredClone(m.jobs[0]), untouchedBefore = structuredClone(m.jobs[2]);
  let calls = 0;
  await registerPersonas(m, registrationConfig, { limit: 1, continueOnHeld: true, persist: recorder.persist,
    pause: async () => {}, fetchImpl: async (_url, init) => {
      calls++;
      const input = JSON.parse(init.body).input;
      assert.equal(input.task_id, m.jobs[1].taskId);
      assert.equal(input.name, m.jobs[1].profile.provisionalName);
      return personaResponse(input.task_id);
    } });
  assert.equal(calls, 1);
  assert.deepEqual(m.jobs[0], heldBefore);
  assert.deepEqual(m.jobs[2], untouchedBefore);
});
