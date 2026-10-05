const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const batch = require('./official-global-v1.cjs');
const recovery = require('./reconcile-official-global-v1-personas.cjs');
const { buildProfiles } = require('./official-global-v1-profiles.cjs');
const MODEL = 'ai-music-api/generate-persona';
const IDS = ['melodio-global-v1-en-f07', 'melodio-global-v1-ja-f04', 'melodio-global-v1-ja-f10', 'melodio-global-v1-ja-f11',
  'melodio-global-v1-fr-f10', 'melodio-global-v1-fr-f11', 'melodio-global-v1-fr-f12', 'melodio-global-v1-fr-m07'];
function fixture() {
  const profiles = buildProfiles();
  const m = { batch: 'official-global-v1-20261005', requestCap: 64, estimatedCreditCap: 768, selectedVersion: 'A',
    profileSpecSha256: batch.sha(JSON.stringify(profiles)), baseline: { catalog: Array.from({ length: 27 }, (_, i) => ({ id: `old_${i}` })) },
    jobs: profiles.map((profile, i) => ({ id: profile.id, profile, gender: profile.gender, language: profile.language,
      options: batch.optionsFor(profile), personaDescription: profile.stylePrompt.slice(0, 195), state: 'complete',
      taskId: `generation_${i}`, creditsConsumed: 12, clips: [{ id: `audio_${i}_A`, url: `https://cdn1.suno.ai/${i}.mp3` }],
      sample: { version: 'A', clipId: `audio_${i}_A`, seconds: 30.04 }, personaTaskId: `generation_${i}`, personaAudioId: `audio_${i}_A`,
      personaSourceVersion: 'A', personaAttemptId: `attempt_${i}`, personaState: 'ready', personaId: `persona_${i}`, personaModel: 'style_persona',
      personaHttpStatus: 200, personaProviderCode: 200, personaErrorCategory: null, personaElapsedMs: 12000 })) };
  const uncertain = id => { const j = m.jobs.find(job => job.id === id); delete j.personaId; j.personaState = 'uncertain'; return j; };
  return { m, uncertain };
}
function receipt(j, { success = false, code = '400', reason = 'Description cannot contain artist name: soprano', persona = 'recovered_persona' } = {}) {
  return { id: j.id, attemptId: j.personaAttemptId, requestTaskId: `request_${j.personaAttemptId}`, returnedTaskId: `request_${j.personaAttemptId}`,
    sourceTaskId: j.taskId, audioId: j.sample.clipId, http: 200, code: 200, state: success ? 'success' : 'fail', model: MODEL,
    sourceMatches: true, failCode: success ? null : code, reason: success ? null : reason, personaId: success ? persona : null,
    resultCode: success ? 200 : undefined, creditsConsumed: 0, responseSha256: 'a'.repeat(64), checkedAt: '2026-10-05T12:00:00Z' };
}
function failureFixture() {
  const f = fixture();
  const rows = IDS.map(id => {
    const j = f.uncertain(id);
    if (id.endsWith('fr-f12')) return receipt(j, { reason: 'Name cannot contain artist name: zoe' });
    if (id.endsWith('ja-f04') || id.endsWith('fr-m07')) return receipt(j, { code: '500', reason: 'Internal Error, Please try again later.' });
    return receipt(j);
  });
  return { ...f, rows };
}
test('recordInfo parses JSON param.input and resultJson.data persona with exact first-A binding', () => {
  const f = fixture(), j = f.uncertain('melodio-global-v1-en-m01');
  const log = { requestTaskId: 'logged_request_1', sourceTaskId: j.taskId, audioId: j.sample.clipId };
  const raw = { code: 200, data: { taskId: log.requestTaskId, state: 'success', model: MODEL,
    param: JSON.stringify({ model: MODEL, input: JSON.stringify({ task_id: j.taskId, audio_id: j.sample.clipId }) }),
    resultJson: JSON.stringify({ code: 200, data: { persona_id: 'recovered_persona_1' } }) } };
  const row = recovery.inspectRecordInfo(j, log, raw);
  assert.equal(row.personaId, 'recovered_persona_1'); assert.equal(row.sourceMatches, true);
  const nested = structuredClone(raw); nested.data.resultJson = undefined; nested.data.response = JSON.stringify({ data: { personaId: 'recovered_persona_1' } });
  assert.equal(recovery.inspectRecordInfo(j, log, nested).personaId, 'recovered_persona_1');
  for (const change of [
    value => { value.data.taskId = 'another_request'; },
    value => { value.data.model = 'ai-music-api/generate'; },
    value => { value.data.param = JSON.stringify({ model: MODEL, input: JSON.stringify({ task_id: j.taskId, audio_id: 'second_audio_B' }) }); },
    value => { value.data.personaId = 'conflicting_persona'; },
    value => { value.data.state = 'fail'; },
  ]) { const bad = structuredClone(raw); change(bad); assert.throws(() => recovery.inspectRecordInfo(j, log, bad)); }
});
test('recovery requires matched terminal evidence and never infers a persona from task or voice IDs', () => {
  const f = fixture(), j = f.uncertain('melodio-global-v1-en-m01'), good = receipt(j, { success: true });
  for (const patch of [{ sourceMatches: false }, { attemptId: 'different_attempt' }, { state: 'processing' },
    { audioId: 'audio_wrong_B' }, { returnedTaskId: 'wrong_request' }, { personaId: null }, { resultCode: 400 }]) {
    assert.throws(() => recovery.validateReceipt(j, { ...good, ...patch }));
  }
  assert.equal(recovery.resultPersonaId({ taskId: 'request_123', voiceId: 'voice_123' }), null);
  assert.throws(() => recovery.verifiedRows(f.m, [good, good]), /DUPLICATE/);
});
test('reconcile restores only confirmed successes, preserves original attempt error and rejects duplicate personas', () => {
  const f = fixture(), j = f.uncertain('melodio-global-v1-en-m01');
  Object.assign(j, { personaHttpStatus: null, personaProviderCode: null, personaErrorCategory: 'transport' });
  const row = receipt(j, { success: true }), before = structuredClone(j);
  const result = recovery.reconciliation(f.m, [row]);
  const changed = result.next.jobs.find(job => job.id === j.id);
  assert.equal(changed.personaState, 'ready'); assert.equal(changed.personaTaskId, before.taskId);
  assert.equal(changed.personaRequestTaskId, row.requestTaskId); assert.equal(changed.personaErrorCategory, 'transport');
  assert.deepEqual(j, before); assert.deepEqual(changed.personaRecovery, row);
  assert.deepEqual(recovery.reconciliation(result.next, [row]).changes, []);
  assert.throws(() => recovery.reconciliation(f.m, [row], new Map([[row.personaId, 'other_catalog_voice']])), /NOT_UNIQUE/);
  assert.throws(() => recovery.reconciliation(f.m, [{ ...row, personaId: f.m.jobs[0].personaId }]), /NOT_UNIQUE/);
});
test('eight confirmed failures prepare one provider-only correction without new generation or public recipe changes', () => {
  const f = failureFixture(), before = structuredClone(f.m);
  const prepared = recovery.retryPreparation(f.m, f.rows, { ids: IDS, retryCap: 8 });
  assert.equal(prepared.changes.length, 8); assert.equal(prepared.additionalGenerationRequests, 0);
  assert.deepEqual(f.m, before); assert.equal(batch.report(prepared.next).generationCreditsKnown, 768);
  for (const id of IDS) {
    const old = before.jobs.find(j => j.id === id), j = prepared.next.jobs.find(j => j.id === id);
    assert.deepEqual(j.profile, old.profile); assert.deepEqual(j.options, old.options);
    assert.deepEqual(j.sample, old.sample); assert.deepEqual(j.clips, old.clips); assert.equal(j.taskId, old.taskId);
    assert.equal(j.personaState, undefined); assert.equal(j.personaCorrectiveRetry, 1);
    assert.equal(j.personaAttemptHistory[0].originalAttempt.personaAttemptId, old.personaAttemptId);
    if (id === 'melodio-global-v1-fr-f12') assert.equal(j.personaName, id);
    else assert.equal(j.personaName, undefined);
    if (prepared.changes.find(c => c.id === id).correction === 'description-register-word') {
      assert.ok(j.personaDescription.length <= 200); assert.ok(!/soprano/i.test(j.personaDescription)); assert.match(j.personaDescription, /upper-register singer/);
    }
  }
});
test('one corrected persona attempt uses the original A and provider overrides with no generation request', async () => {
  const f = failureFixture(), prepared = recovery.retryPreparation(f.m, f.rows, { ids: IDS, retryCap: 8 });
  const calls = [];
  await batch.personas(prepared.next, { apiKey: 'offline', apiBaseUrl: 'https://api.kie.ai' }, { limit: 8, pause: async () => {}, persist() {},
    fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); calls.push(body); assert.equal(body.model, MODEL);
      return new Response(JSON.stringify({ code: 200, data: { persona_id: `new_${body.input.audio_id}` } })); } });
  assert.equal(calls.length, 8);
  for (const body of calls) {
    const original = f.m.jobs.find(j => j.taskId === body.input.task_id);
    assert.equal(body.input.audio_id, original.sample.clipId); assert.ok(body.input.description.length <= 200);
    assert.equal(body.input.name, original.id === 'melodio-global-v1-fr-f12' ? original.id : original.profile.name);
  }
  assert.equal(prepared.next.jobs.filter(j => j.personaState === 'ready').length, 64);
});
test('unknown outcomes, unsupported errors, success records and repeated corrective attempts cannot be retried', () => {
  const f = failureFixture(), j = f.m.jobs.find(job => job.id === IDS[0]), row = f.rows[0];
  for (const bad of [{ ...row, state: 'processing' }, { ...row, sourceMatches: false },
    { ...row, state: 'success', personaId: 'existing_persona', resultCode: 200 },
    { ...row, reason: 'Unknown validation issue' }, { ...row, personaId: 'possibly_created_persona' }]) {
    assert.throws(() => recovery.correctedFields(j, bad));
  }
  assert.throws(() => recovery.retryPreparation(f.m, f.rows, { ids: IDS, retryCap: 7 }), /CAP/);
  assert.throws(() => recovery.retryPreparation(f.m, f.rows, { ids: IDS, retryCap: 9 }), /CAP/);
  assert.throws(() => recovery.correctedFields({ ...j, personaCorrectiveRetry: 1 }, row), /INELIGIBLE/);
});
test('mutation saves exact prior manifest and receipt bytes, respects lock and never edits audio', t => {
  const f = failureFixture(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-recovery-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const p = batch.locations(root), put = (relative, value) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
  put(batch.PROTECTED[0], f.m.baseline.catalog); put(batch.PROTECTED[1], {}); put(batch.PROTECTED[2], []); put(batch.PROTECTED[3], {});
  f.m.baseline.hashes = Object.fromEntries(batch.PROTECTED.map(file => [file, batch.hashFile(path.join(root, file))]));
  fs.mkdirSync(p.dir, { recursive: true }); batch.save(p.manifest, f.m);
  const evidence = path.join(p.dir, 'persona-record-verified.json'); batch.save(evidence, f.rows);
  const before = fs.readFileSync(p.manifest), records = fs.readFileSync(evidence);
  const lock = path.join(p.dir, 'operation.lock'); fs.mkdirSync(lock);
  assert.throws(() => recovery.prepareRetry(root, { ids: IDS, retryCap: 8 }), /EEXIST/); assert.ok(fs.existsSync(lock)); fs.rmdirSync(lock);
  const result = recovery.prepareRetry(root, { ids: IDS, retryCap: 8 });
  assert.equal(result.changed, 8); assert.equal(result.additionalGenerationRequests, 0);
  assert.deepEqual(fs.readFileSync(path.join(result.backupDirectory, 'manifest.before.json')), before);
  assert.deepEqual(fs.readFileSync(path.join(result.backupDirectory, 'verified-receipts.json')), records);
  assert.equal(fs.existsSync(path.join(p.dir, 'samples')), false);
});
test('CLI mutations require explicit retry IDs and bounded cap', () => {
  assert.equal(recovery.parseArgs([]).mode, 'plan');
  assert.equal(recovery.parseArgs(['reconcile']).mode, 'reconcile');
  assert.throws(() => recovery.parseArgs(['prepare-retry']), /EXPLICIT/);
  assert.throws(() => recovery.parseArgs(['prepare-retry', '--ids', IDS.join(','), '--retry-cap', '9']), /EXPLICIT/);
  assert.deepEqual(recovery.parseArgs(['prepare-retry', '--ids', IDS.join(','), '--retry-cap', '8']).options.ids, IDS);
});
