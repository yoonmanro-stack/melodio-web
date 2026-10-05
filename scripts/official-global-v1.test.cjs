const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildProfiles } = require('./official-global-v1-profiles.cjs');
const batch = require('./official-global-v1.cjs');
const publisher = require('./publish-official-global-v1.cjs');
const CONFIG = { apiKey: 'offline-test', apiBaseUrl: 'https://api.kie.ai' };

function fixture(t, ready = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'official-global-v1-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (relative, value) => {
    const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  const catalog = Array.from({ length: 27 }, (_, index) => ({ id: `existing-${index}`, officialVoiceId: `existing-${index}`,
    name: `Existing ${index}`, sourceType: 'default', language: 'ko', gender: index % 2 ? 'male' : 'female',
    audioUrl: `/assets/voices/existing-${index}.mp3`, exactNestedField: { keep: true, index } }));
  const registry = Object.fromEntries(catalog.map((row, index) => [row.id, `existing_persona_${index}`]));
  put(batch.PROTECTED[0], catalog); put(batch.PROTECTED[1], registry);
  put(batch.PROTECTED[2], []); put(batch.PROTECTED[3], {});
  for (const row of catalog) put(`public${row.audioUrl}`, `Existing sample ${row.id}`);
  const m = batch.plan(root), p = batch.locations(root);
  if (ready) for (const [index, j] of m.jobs.entries()) {
    const sample = Buffer.from(`new distinct sample ${index}`), original = Buffer.from(`new source audio ${index}`);
    const clipId = `new_clip_${index}_A`;
    Object.assign(j, { state: 'complete', taskId: `new_task_${index}`, creditsConsumed: 12,
      clips: [{ id: clipId, url: `https://cdn1.suno.ai/new-${index}.mp3`, duration: 45 }],
      sample: { version: 'A', clipId, seconds: 30.04, sha256: batch.sha(sample), originalSha256: batch.sha(original) },
      personaState: 'ready', personaId: `new_persona_${index}`, personaModel: 'style_persona',
      personaSourceVersion: 'A', personaAudioId: clipId, personaTaskId: `new_task_${index}` });
    put(`artifacts/official-global-v1-20261005/samples/${j.id}-A.mp3`, sample);
    put(`artifacts/official-global-v1-20261005/original/${j.id}-A.mp3`, original);
  }
  batch.save(p.manifest, m);
  return { root, m, p, put, catalog, registry, persist: value => batch.save(p.manifest, value) };
}
const fakeInspect = () => 30.04;
function repairFixture(f, ready = false) {
  const old = structuredClone(f.m.jobs[0]);
  delete old.personaId;
  Object.assign(old, { personaState: 'uncertain', personaHttpStatus: 200, personaProviderCode: 400, personaErrorCategory: 'provider_error' });
  f.m.repairRequestCap = 1;
  f.m.repairHistory = [{ id: old.id, revision: 1, reason: 'persona-provider-rejected', archivedAt: '2026-10-05T10:00:00Z', oldJob: old }];
  const j = { id: old.id, profile: old.profile, gender: old.gender, language: old.language, options: old.options,
    personaDescription: old.personaDescription, repairRevision: 1, state: 'planned' };
  if (ready) {
    const source = Buffer.from('fresh repair original'), sample = Buffer.from('fresh repair sample');
    Object.assign(j, { state: 'complete', taskId: 'repair_new_task', creditsConsumed: 12,
      clips: [{ id: 'repair_new_clip_A', url: 'https://cdn1.suno.ai/repair-new.mp3', duration: 45 }],
      sample: { version: 'A', clipId: 'repair_new_clip_A', seconds: 30.04, sha256: batch.sha(sample), originalSha256: batch.sha(source) },
      personaState: 'ready', personaId: 'repair_new_persona', personaModel: 'style_persona',
      personaSourceVersion: 'A', personaAudioId: 'repair_new_clip_A', personaTaskId: 'repair_new_task' });
    f.put(`artifacts/official-global-v1-20261005/samples/${old.id}-A-r1.mp3`, sample);
    f.put(`artifacts/official-global-v1-20261005/original/${old.id}-A-r1.mp3`, source);
  }
  f.m.jobs[0] = j; batch.save(f.p.manifest, f.m); return j;
}

test('64 fresh designs have the exact target balance, unique names/prompts and target-language lyrics', () => {
  const profiles = buildProfiles(); batch.validateProfiles(profiles);
  const counts = {};
  for (const p of profiles) counts[`${p.language}/${p.gender}`] = (counts[`${p.language}/${p.gender}`] || 0) + 1;
  assert.deepEqual(counts, batch.BALANCE);
  assert.equal(new Set(profiles.map(p => p.stylePrompt)).size, 64);
  assert.equal(new Set(profiles.map(p => p.name)).size, 64);
  assert.equal(profiles.some(p => /discovery|bonnie tyler|taylor swift|moon joo/i.test(p.stylePrompt + p.name)), false);
  assert.equal(profiles.some(p => /guitar|piano|bass accompaniment|\bBPM\b/i.test(p.stylePrompt)), false);
});

test('plan is unpaid, immutable, isolated and capped at 64 requests / 768 estimated credits', t => {
  const f = fixture(t);
  assert.equal(batch.report(f.m).accepted, 0);
  assert.equal(f.m.estimatedCreditCap, 768);
  assert.equal(f.m.jobs.every(j => j.state === 'planned' && !j.taskId && !j.personaId), true);
  assert.deepEqual(batch.read(path.join(f.root, batch.PROTECTED[0])), f.catalog);
  assert.throws(() => batch.plan(f.root), /PLAN_EXISTS/);
  f.m.jobs[0].options.lyrics = 'different';
  assert.throws(() => batch.validateManifest(f.m), /REQUEST_CHANGED/);
});

test('submission saves intent before the provider and never repeats accepted requests', async t => {
  const f = fixture(t); let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls++; const recorded = batch.read(f.p.manifest);
    assert.equal(recorded.jobs[calls - 1].state, 'submitting');
    const body = JSON.parse(options.body);
    assert.equal(body.input.model, 'V6'); assert.equal(body.input.duration, 45);
    assert.equal(body.input.persona_id, undefined);
    return { ok: true, json: async () => ({ code: 200, data: { taskId: `submitted_${calls}` } }) };
  };
  await batch.submit(f.m, CONFIG, { limit: 2, persist: f.persist, fetchImpl, pause: async () => {} });
  await batch.submit(f.m, CONFIG, { limit: 1, persist: f.persist, fetchImpl, pause: async () => {} });
  assert.equal(calls, 3); assert.equal(batch.report(f.m).accepted, 3);
  assert.equal(f.m.jobs[0].taskId, 'submitted_1');
});

test('unknown submission outcome blocks further paid submissions with no automatic retry', async t => {
  const f = fixture(t); let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('offline simulated timeout'); };
  await assert.rejects(batch.submit(f.m, CONFIG, { limit: 6, persist: f.persist, fetchImpl, pause: async () => {} }), /SUBMISSION_HELD/);
  assert.equal(f.m.jobs[0].state, 'submission-uncertain');
  assert.equal(batch.report(f.m).unknownGenerationCosts, 1);
  assert.equal(batch.reservedCredits(f.m), 12);
  await assert.rejects(batch.submit(f.m, CONFIG, { persist: f.persist, fetchImpl }), /UNCERTAIN_SUBMISSION_HELD/);
  assert.equal(calls, 1);
});

test('request budget reserves unknown/in-flight attempts, rejects exact cap and unit-cost drift', async t => {
  const f = fixture(t);
  for (const [index, j] of f.m.jobs.entries()) { j.state = 'processing'; j.taskId = `reserved_${index}`; j.submittedAt = '2026-10-05T00:00:00Z'; }
  assert.equal(batch.reservedCredits(f.m), 768);
  assert.throws(() => batch.assertNextRequestBudget(f.m), /CREDIT_RESERVATION_CAP/);
  let calls = 0;
  await batch.submit(f.m, CONFIG, { persist: f.persist, fetchImpl: async () => { calls++; }, pause: async () => {} });
  assert.equal(calls, 0);
  const g = fixture(t);
  g.m.jobs[0].state = 'complete'; g.m.jobs[0].taskId = 'price_drift_task'; g.m.jobs[0].creditsConsumed = 13;
  await assert.rejects(batch.submit(g.m, CONFIG, { persist: g.persist, fetchImpl: async () => { calls++; } }), /CREDIT_UNIT_COST_DRIFT/);
  assert.equal(batch.reservedCredits(g.m), 13); assert.equal(calls, 0);
});

test('persona engine persists matching first-A receipts without changing the original spec', async t => {
  const f = fixture(t, true), job = f.m.jobs[0];
  for (const field of ['personaState', 'personaId', 'personaModel', 'personaSourceVersion', 'personaAudioId', 'personaTaskId']) delete job[field];
  let calls = 0;
  await batch.personas(f.m, CONFIG, { limit: 1, persist: f.persist, pause: async () => {}, fetchImpl: async (_url, options) => {
    calls++; assert.equal(batch.read(f.p.manifest).jobs[0].personaState, 'submitting');
    const input = JSON.parse(options.body).input;
    assert.equal(input.audio_id, job.clips[0].id); assert.equal(input.task_id, job.taskId);
    return new Response(JSON.stringify({ code: 200, data: { persona_id: 'offline_new_persona' } }));
  } });
  assert.equal(calls, 1); assert.equal(f.m.jobs[0].personaState, 'ready');
  assert.equal(f.m.jobs[0].personaAudioId, job.clips[0].id); batch.validateManifest(f.m);
  f.m.jobs[0].personaState = 'uncertain';
  await assert.rejects(batch.personas(f.m, CONFIG, { persist: f.persist, fetchImpl: async () => { calls++; } }), /UNCERTAIN_PERSONA_HELD/);
  assert.equal(calls, 1);
});

test('persona continuation is explicit, preserves held receipts and submits only untouched registrations', async t => {
  const f = fixture(t, true);
  for (const [index, state] of ['uncertain', 'submitting', 'held'].entries()) Object.assign(f.m.jobs[index], {
    personaState: state, personaAttemptId: `previous_attempt_${index}`, personaSubmittedAt: '2026-10-05T01:00:00Z',
    personaHttpStatus: index ? null : 200, personaProviderCode: index ? null : 400,
    personaErrorCategory: index ? 'timeout' : 'provider_error', personaElapsedMs: 13000,
  });
  const originals = structuredClone(f.m.jobs.slice(0, 3));
  const pending = f.m.jobs.slice(3, 8);
  for (const job of pending) for (const field of ['personaState', 'personaId', 'personaModel', 'personaSourceVersion', 'personaAudioId', 'personaTaskId']) delete job[field];
  const called = [];
  const fetchImpl = async (_url, options) => {
    const input = JSON.parse(options.body).input; called.push(input.audio_id);
    const firstNewFailure = input.audio_id === pending[0].clips[0].id;
    return new Response(JSON.stringify(firstNewFailure ? { code: 400 } : { code: 200, data: { persona_id: `continued_${input.audio_id}` } }));
  };
  await assert.rejects(batch.personas(f.m, CONFIG, { limit: 64, persist: f.persist, fetchImpl }), /UNCERTAIN_PERSONA_HELD/);
  assert.equal(called.length, 0);
  await batch.personas(f.m, CONFIG, { limit: 64, persist: f.persist, fetchImpl, continueOnHeld: true, pause: async () => {} });
  assert.deepEqual(f.m.jobs.slice(0, 3), originals);
  assert.deepEqual(batch.read(f.p.manifest).jobs.slice(0, 3), originals);
  assert.deepEqual(new Set(called), new Set(pending.map(j => j.clips[0].id)));
  assert.equal(called.length, 5);
  assert.equal(f.m.jobs[3].personaState, 'uncertain');
  assert.equal(f.m.jobs[7].personaState, 'ready');
  const after = structuredClone(f.m.jobs);
  await batch.personas(f.m, CONFIG, { limit: 64, persist: f.persist, fetchImpl, continueOnHeld: true, pause: async () => {} });
  assert.equal(called.length, 5); assert.deepEqual(f.m.jobs, after);
  batch.validateManifest(f.m);
});

test('continue-held CLI flag is accepted only for an explicit persona command', () => {
  assert.equal(batch.personaContinuation('persona', []), false);
  assert.equal(batch.personaContinuation('persona', ['--continue-held']), true);
  for (const [mode, flags] of [['submit', ['--continue-held']], ['persona', ['--retry']], ['persona', ['--continue-held', '--continue-held']]]) {
    assert.throws(() => batch.personaContinuation(mode, flags), /CONTINUATION_FLAG/);
  }
});

test('mutating CLI reads manifest only inside its exclusive lock', () => {
  const source = fs.readFileSync(path.join(__dirname, 'official-global-v1.cjs'), 'utf8');
  const main = source.slice(source.indexOf('async function main()'));
  const locked = main.slice(main.indexOf('const lock ='));
  assert.ok(locked.indexOf('fs.mkdirSync(lock)') < locked.indexOf('const m = read(p.manifest)'));
});

test('explicit throttle rejection stays held and does not recycle the request automatically', async t => {
  const f = fixture(t); let calls = 0;
  await assert.rejects(batch.submit(f.m, CONFIG, { limit: 6, persist: f.persist,
    fetchImpl: async () => { calls++; return { ok: false, status: 429 }; }, pause: async () => {} }), /SUBMISSION_HELD/);
  assert.equal(f.m.jobs[0].state, 'rejected-throttled'); assert.equal(calls, 1);
  await batch.submit(f.m, CONFIG, { limit: 1, persist: f.persist, pause: async () => {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ code: 200, data: { taskId: 'after_throttle_other_job' } }) }) });
  assert.equal(f.m.jobs[0].taskId, undefined); assert.equal(f.m.jobs[1].state, 'processing');
});

test('first A is mandatory; no synthesized id or fallback B becomes an official reference', t => {
  const f = fixture(t, true), j = f.m.jobs[0];
  j.sample.clipId = 'second_clip_B';
  assert.throws(() => publisher.buildPublication(f.m, f.p, { inspect: fakeInspect }), /REFERENCE_NOT_READY/);
  j.sample.clipId = j.clips[0].id; j.clips[0].id = `${j.taskId}-1`;
  assert.throws(() => publisher.buildPublication(f.m, f.p, { inspect: fakeInspect }), /FIRST_A_NOT_READY/);
});

test('publisher refuses pending persona, mismatched binding, duplicate persona and changed audio', t => {
  for (const mutate of [
    m => { m.jobs[0].personaState = 'uncertain'; },
    m => { m.jobs[0].personaTaskId = 'different_task'; },
    m => { m.jobs[0].personaId = m.baseline.registry['existing-0']; },
    m => { m.jobs[1].personaId = m.jobs[0].personaId; },
    m => { m.jobs[0].sample.sha256 = 'bad-hash'; },
  ]) {
    const f = fixture(t, true); mutate(f.m);
    assert.throws(() => publisher.buildPublication(f.m, f.p, { inspect: fakeInspect }), /REFERENCE_NOT_READY|NON_DISTINCT_REFERENCE|AUDIO_PROVENANCE/);
  }
});

test('publisher detects changed protected catalogs and leaves original objects intact', t => {
  const f = fixture(t, true);
  f.put(batch.PROTECTED[2], [{ id: 'external-discovery-change' }]);
  assert.throws(() => publisher.buildPublication(f.m, f.p, { inspect: fakeInspect }), /PROTECTED_CATALOG_CHANGED/);
  assert.deepEqual(batch.read(path.join(f.root, batch.PROTECTED[0])), f.catalog);
});

test('stage and apply append exactly64 without changing original27 or Discovery; apply is idempotent', t => {
  const f = fixture(t, true);
  const receipt = publisher.stage(f.m, f.p, { inspect: fakeInspect });
  assert.equal(receipt.newReferences, 64); assert.equal(receipt.generationCreditsKnown, 768);
  assert.deepEqual(batch.read(path.join(f.root, batch.PROTECTED[0])), f.catalog);
  const result = publisher.apply(f.m, f.p);
  const catalog = batch.read(path.join(f.root, batch.PROTECTED[0]));
  const registry = batch.read(path.join(f.root, batch.PROTECTED[1]));
  assert.equal(result.catalog, 91); assert.deepEqual(catalog.slice(0, 27), f.catalog);
  for (const [id, value] of Object.entries(f.registry)) assert.equal(registry[id], value);
  for (const row of catalog.slice(27)) {
    assert.equal(row.sourceType, 'default'); assert.equal(row.reviewStatus, 'trial');
    assert.equal(row.discoveryVoiceId, undefined); assert.equal(row.personaId, undefined);
    assert.ok(fs.existsSync(path.join(f.root, `public${row.audioUrl}`)));
  }
  assert.equal(publisher.apply(f.m, f.p).catalogSha256, result.catalogSha256);
  batch.assertProtected(f.m, f.root, { official: false });
});

test('apply refuses modified staged data and recovers a partially applied registry', t => {
  const f = fixture(t, true); publisher.stage(f.m, f.p, { inspect: fakeInspect });
  fs.copyFileSync(path.join(f.p.publication, 'official-voice-personas.json'), path.join(f.root, batch.PROTECTED[1]));
  assert.equal(publisher.apply(f.m, f.p).catalog, 91);
  const g = fixture(t, true); publisher.stage(g.m, g.p, { inspect: fakeInspect });
  fs.appendFileSync(path.join(g.p.publication, 'officialVocalCatalog.json'), ' ');
  assert.throws(() => publisher.apply(g.m, g.p), /STAGED_BUNDLE_CHANGED/);
  assert.deepEqual(batch.read(path.join(g.root, batch.PROTECTED[0])), g.catalog);
});

test('one bounded repair keeps archived charges and reservations and submits only the new revision', async t => {
  const f = fixture(t, true); const j = repairFixture(f);
  batch.validateManifest(f.m);
  assert.equal(batch.report(f.m).generationCreditsKnown, 768);
  assert.equal(batch.report(f.m).generatedRequests, 64);
  assert.equal(batch.reservedCredits(f.m), 768); assert.equal(batch.totalCreditCap(f.m), 780);
  assert.equal(batch.sampleStem(j), `${j.id}-A-r1`);
  let calls = 0;
  await batch.submit(f.m, CONFIG, { limit: 4, persist: f.persist, pause: async () => {}, fetchImpl: async () => {
    calls++; return { ok: true, json: async () => ({ code: 200, data: { taskId: 'one_explicit_repair_task' } }) };
  } });
  assert.equal(calls, 1); assert.equal(batch.reservedCredits(f.m), 780);
  assert.equal(batch.report(f.m).unknownGenerationCosts, 1);
  assert.throws(() => batch.assertNextRequestBudget(f.m), /CREDIT_RESERVATION_CAP/);
  const archived = f.m.repairHistory[0].oldJob;
  assert.equal(archived.taskId, 'new_task_0'); assert.equal(archived.creditsConsumed, 12);
});

test('repair scope rejects unknown outcomes, fabricated archives, duplicate tasks and second revisions', t => {
  for (const mutate of [
    m => { m.repairRequestCap = 5; },
    m => { m.repairHistory[0].oldJob.personaProviderCode = 500; },
    m => { m.repairHistory[0].oldJob.personaErrorCategory = 'transport'; },
    m => { m.repairHistory[0].oldJob.personaId = 'possibly_created_persona'; },
    m => { m.jobs[0].repairRevision = 2; },
    m => { m.jobs[0].taskId = m.repairHistory[0].oldJob.taskId; },
    m => { m.repairHistory.push(structuredClone(m.repairHistory[0])); m.repairRequestCap = 2; },
  ]) {
    const f = fixture(t, true); repairFixture(f); mutate(f.m);
    assert.throws(() => batch.validateManifest(f.m), /REPAIR_SCOPE|REPAIR_HISTORY|REPAIR_REVISION|TASK_ID_INVALID_OR_DUPLICATE/);
  }
});

test('repair publication uses only r1 audio, retains archived originals and counts both generations', t => {
  const f = fixture(t, true), j = repairFixture(f, true);
  const oldFile = path.join(f.p.dir, 'samples', `${j.id}-A.mp3`), oldHash = batch.hashFile(oldFile);
  const receipt = publisher.stage(f.m, f.p, { inspect: fakeInspect });
  assert.equal(receipt.generatedRequests, 65); assert.equal(receipt.repairRequests, 1);
  assert.equal(receipt.generationCreditsKnown, 780); assert.equal(receipt.estimatedCreditCap, 780);
  const rows = batch.read(path.join(f.p.publication, 'officialVocalCatalog.json'));
  assert.equal(rows[27].audioUrl, `/assets/voices/official-global-v1-20261005/${j.id}-A-r1.mp3`);
  publisher.apply(f.m, f.p);
  assert.equal(batch.hashFile(oldFile), oldHash);
  assert.equal(batch.hashFile(path.join(f.root, `public${rows[27].audioUrl}`)), j.sample.sha256);
});

test('repair publication rejects reused old audio and changed archived evidence', t => {
  const f = fixture(t, true), j = repairFixture(f, true);
  j.sample.sha256 = f.m.repairHistory[0].oldJob.sample.sha256;
  assert.throws(() => publisher.buildPublication(f.m, f.p, { inspect: fakeInspect }), /NON_DISTINCT_REFERENCE/);
  const g = fixture(t, true), second = repairFixture(g, true);
  g.put(`artifacts/official-global-v1-20261005/samples/${second.id}-A.mp3`, 'changed archived sample');
  assert.throws(() => publisher.buildPublication(g.m, g.p, { inspect: fakeInspect }), /ARCHIVED_AUDIO_PROVENANCE/);
});
