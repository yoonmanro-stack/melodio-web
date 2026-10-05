'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const batch = require('./official-global-v1.cjs');
const repair = require('./repair-official-global-v1.cjs');
const recovery = require('./reconcile-official-global-v1-personas.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'official-global-v1-repair-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (relative, value) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  };
  const catalog = Array.from({ length: 27 }, (_, index) => ({ id: `existing-${index}`, officialVoiceId: `existing-${index}`,
    sourceType: 'default', audioUrl: `/assets/voices/existing-${index}.mp3` }));
  put(batch.PROTECTED[0], catalog);
  put(batch.PROTECTED[1], Object.fromEntries(catalog.map((row, index) => [row.id, `existing_persona_${index}`])));
  put(batch.PROTECTED[2], []);
  put(batch.PROTECTED[3], {});
  for (const row of catalog) put(`public${row.audioUrl}`, `Existing audio ${row.id}`);
  const m = batch.plan(root);
  const p = batch.locations(root);
  for (const [index, job] of m.jobs.entries()) {
    const original = Buffer.from(`Original generation A ${index}`);
    const sample = Buffer.from(`First A sample ${index}`);
    const clipId = `original_clip_${index}_A`;
    Object.assign(job, {
      state: 'complete', taskId: `original_task_${index}`, submittedAt: '2026-10-05T00:00:00Z',
      attemptId: `original_attempt_${index}`, requestSha256: batch.sha(`original request ${index}`), creditsConsumed: 12,
      clips: [{ id: clipId, url: `https://cdn1.suno.ai/original-${index}-A.mp3`, duration: 45 },
        { id: `original_clip_${index}_B`, url: `https://cdn1.suno.ai/original-${index}-B.mp3`, duration: 45 }],
      sample: { version: 'A', clipId, seconds: 30.04, sha256: batch.sha(sample), originalSha256: batch.sha(original) },
      personaState: index % 2 ? 'held' : 'uncertain', personaHttpStatus: 200, personaProviderCode: 400,
      personaErrorCategory: 'provider_error', personaAttemptId: `persona_attempt_${index}`,
      personaSubmittedAt: '2026-10-05T01:00:00Z', personaElapsedMs: 13000,
      personaSourceVersion: 'A', personaAudioId: clipId, personaTaskId: `original_task_${index}`,
    });
    put(`artifacts/official-global-v1-20261005/original/${job.id}-A.mp3`, original);
    put(`artifacts/official-global-v1-20261005/samples/${job.id}-A.mp3`, sample);
  }
  batch.save(p.manifest, m);
  return { root, m, p, put, ids: m.jobs.map(job => job.id) };
}

function verified500Fixture(t) {
  const f = fixture(t), id = 'melodio-global-v1-ja-f04';
  const original = f.m.jobs.find(job => job.id === id);
  original.personaProviderCode = 500;
  const receiptFor = (job, hash = 'a') => ({
    id: job.id, attemptId: job.personaAttemptId,
    requestTaskId: `request_${job.personaAttemptId}`, returnedTaskId: `request_${job.personaAttemptId}`,
    sourceTaskId: job.taskId, audioId: job.sample.clipId, http: 200, code: 200, state: 'fail',
    model: 'ai-music-api/generate-persona', sourceMatches: true, failCode: '500',
    reason: 'Internal Error, Please try again later.', personaId: null,
    responseSha256: hash.repeat(64), checkedAt: '2026-10-05T12:00:00Z',
  });
  const originalReceipt = receiptFor(original);
  f.m = recovery.retryPreparation(f.m, [originalReceipt], { ids: [id], retryCap: 1 }).next;
  const job = f.m.jobs.find(row => row.id === id);
  Object.assign(job, { personaState: 'uncertain', personaAttemptId: `corrective_attempt_${id}`,
    personaSubmittedAt: '2026-10-05T12:01:00Z', personaFinishedAt: '2026-10-05T12:01:13Z',
    personaTaskId: job.taskId, personaAudioId: job.sample.clipId, personaSourceVersion: 'A',
    personaHttpStatus: 200, personaProviderCode: 500, personaErrorCategory: 'provider_error',
    personaElapsedMs: 13000, personaRequestSha256: batch.sha('corrective request fixture') });
  const verifiedFailure = receiptFor(job, 'b');
  verifiedFailure.checkedAt = '2026-10-05T12:02:00Z';
  batch.save(f.p.manifest, f.m);
  return { ...f, id, job, verifiedFailure, originalReceipt };
}

test('dry repair plan is pure, defaults to read-only and counts old plus new estimated credits', t => {
  const f = fixture(t);
  const before = structuredClone(f.m);
  const bytes = fs.readFileSync(f.p.manifest);
  const options = { ids: f.ids.slice(0, 2), repairCap: 2 };
  const plan = repair.buildRepairPlan(f.m, options);
  assert.deepEqual(f.m, before);
  assert.deepEqual(plan.ids, options.ids);
  assert.equal(plan.plannedCount, 2);
  assert.equal(plan.historyCount, 0);
  assert.equal(plan.generationJobsBefore, 64);
  assert.equal(plan.generationJobsAfter, 66);
  assert.deepEqual(plan.estimatedCredits, { old: 768, new: 24, total: 792, cap: 792 });
  assert.equal(repair.dryPlan(f.root, options).mode, 'dry-plan');
  assert.deepEqual(fs.readFileSync(f.p.manifest), bytes);
  assert.equal(fs.existsSync(path.join(f.p.dir, 'repairs')), false);
  assert.equal(fs.existsSync(path.join(f.p.dir, 'operation.lock')), false);
  plan.ids.push('result_mutation');
  assert.equal(options.ids.length, 2);
});

test('eligibility requires the exact complete first-A provider rejection receipt', t => {
  const f = fixture(t);
  for (const state of ['uncertain', 'held']) {
    const m = structuredClone(f.m); m.jobs[0].personaState = state;
    assert.equal(repair.buildRepairPlan(m, { ids: [f.ids[0]], repairCap: 1 }).plannedCount, 1);
  }
  const mutations = [
    job => { job.state = 'processing'; },
    job => { delete job.taskId; },
    job => { job.personaState = 'submitting'; },
    job => { job.personaState = 'ready'; },
    job => { delete job.sample; },
    job => { job.sample.version = 'B'; },
    job => { job.sample.clipId = job.clips[1].id; },
    job => { job.clips[0].id = `${job.taskId}-1`; job.sample.clipId = job.clips[0].id; },
    job => { job.personaHttpStatus = 500; },
    job => { job.personaHttpStatus = '200'; },
    job => { job.personaProviderCode = 429; },
    job => { job.personaProviderCode = '400'; },
    job => { job.personaErrorCategory = 'timeout'; },
    job => { job.personaErrorCategory = 'transport-or-response'; },
    job => { job.personaId = 'accepted_despite_400'; },
    job => { job.personaId = ''; },
  ];
  for (const mutate of mutations) {
    const m = structuredClone(f.m); mutate(m.jobs[0]);
    assert.throws(() => repair.buildRepairPlan(m, { ids: [f.ids[0]], repairCap: 1 }), /REPAIR_NOT_ELIGIBLE/);
  }
});

test('unknown IDs, duplicates and absent, invalid or insufficient explicit caps are rejected', t => {
  const f = fixture(t);
  assert.throws(() => repair.buildRepairPlan(f.m), /REPAIR_IDS_REQUIRED/);
  assert.throws(() => repair.buildRepairPlan(f.m, { ids: [], repairCap: 1 }), /REPAIR_IDS_REQUIRED/);
  assert.throws(() => repair.buildRepairPlan(f.m, { ids: ['unknown_profile'], repairCap: 1 }), /REPAIR_ID_NOT_FOUND/);
  assert.throws(() => repair.buildRepairPlan(f.m, { ids: [f.ids[0], f.ids[0]], repairCap: 2 }), /REPAIR_IDS_INVALID/);
  for (const repairCap of [undefined, 0, 5, -1, 1.5, '2']) {
    assert.throws(() => repair.buildRepairPlan(f.m, { ids: [f.ids[0]], repairCap }), /REPAIR_CAP_REQUIRED_1_TO_4/);
  }
  assert.throws(() => repair.buildRepairPlan(f.m, { ids: f.ids.slice(0, 2), repairCap: 1 }), /REPAIR_CAP_EXCEEDED/);
  assert.throws(() => repair.buildRepairPlan(f.m, { ids: f.ids.slice(0, 5), repairCap: 4 }), /REPAIR_CAP_EXCEEDED/);
});

test('prepare preserves exact previous bytes, archived receipts and audio while resetting only selected jobs', t => {
  const f = fixture(t);
  const selected = [f.ids[0], f.ids[1]];
  const previousBytes = Buffer.from(`\n${JSON.stringify(f.m, null, 4)}\n\n`);
  fs.writeFileSync(f.p.manifest, previousBytes);
  const oldJobs = structuredClone(f.m.jobs);
  const audioFiles = selected.flatMap(id => ['original', 'samples'].map(folder => path.join(f.p.dir, folder, `${id}-A.mp3`)));
  const hashes = audioFiles.map(batch.hashFile);
  const beforeProtected = batch.PROTECTED.map(file => batch.hashFile(path.join(f.root, file)));
  const result = repair.prepare(f.root, { ids: selected, repairCap: 2 });
  const revised = batch.read(f.p.manifest);
  const receipt = batch.read(result.receipt);
  assert.equal(result.prepared, true);
  assert.deepEqual(fs.readFileSync(result.backup), previousBytes);
  assert.equal(receipt.beforeSha256, batch.sha(previousBytes));
  assert.equal(receipt.targetManifestSha256, batch.hashFile(f.p.manifest));
  assert.deepEqual(receipt.ids, selected);
  assert.equal(revised.estimatedCreditCap, 768);
  assert.equal(revised.repairRequestCap, 2);
  assert.equal(revised.repairHistory.length, 2);
  for (const [index, id] of selected.entries()) {
    const archived = revised.repairHistory[index];
    assert.equal(archived.id, id);
    assert.equal(archived.revision, 1);
    assert.equal(archived.reason, 'persona-provider-rejected');
    assert.ok(Number.isFinite(Date.parse(archived.archivedAt)));
    assert.deepEqual(archived.oldJob, oldJobs[index]);
    assert.deepEqual(Object.keys(revised.jobs[index]).sort(), [
      'gender', 'id', 'language', 'options', 'personaDescription', 'profile', 'repairRevision', 'state',
    ]);
    assert.equal(revised.jobs[index].state, 'planned');
    assert.equal(revised.jobs[index].repairRevision, 1);
    for (const field of ['id', 'profile', 'gender', 'language', 'options', 'personaDescription']) {
      assert.deepEqual(revised.jobs[index][field], oldJobs[index][field]);
    }
  }
  assert.deepEqual(revised.jobs.slice(2), oldJobs.slice(2));
  assert.deepEqual(audioFiles.map(batch.hashFile), hashes);
  assert.deepEqual(batch.PROTECTED.map(file => batch.hashFile(path.join(f.root, file))), beforeProtected);
  assert.equal(batch.reservedCredits(revised), 768);
  assert.equal(batch.generationJobs(revised).length, 66);
  assert.equal(fs.existsSync(path.join(f.p.dir, 'operation.lock')), false);
  batch.validateManifest(revised);
});

test('each ID gets only one repair and existing backups survive subsequent preparations', t => {
  const f = fixture(t);
  const first = repair.prepare(f.root, { ids: [f.ids[0]], repairCap: 4 });
  const firstBackup = fs.readFileSync(first.backup);
  const firstReceipt = fs.readFileSync(first.receipt);
  const afterFirst = batch.read(f.p.manifest);
  assert.throws(() => repair.buildRepairPlan(afterFirst, { ids: [f.ids[0]], repairCap: 4 }), /REPAIR_ALREADY_USED/);
  assert.throws(() => repair.buildRepairPlan(afterFirst, { ids: [f.ids[1]], repairCap: 3 }), /REPAIR_CAP_CANNOT_SHRINK/);
  const second = repair.prepare(f.root, { ids: f.ids.slice(1, 4), repairCap: 4 });
  const afterSecond = batch.read(f.p.manifest);
  assert.notEqual(first.backup, second.backup);
  assert.deepEqual(fs.readFileSync(first.backup), firstBackup);
  assert.deepEqual(fs.readFileSync(first.receipt), firstReceipt);
  assert.deepEqual(batch.read(second.backup), afterFirst);
  assert.deepEqual(afterSecond.repairHistory.slice(0, 1), afterFirst.repairHistory);
  assert.equal(afterSecond.repairHistory.length, 4);
  assert.throws(() => repair.buildRepairPlan(afterSecond, { ids: [f.ids[4]], repairCap: 4 }), /REPAIR_CAP_EXCEEDED/);
  assert.throws(() => repair.prepare(f.root, { ids: [f.ids[4]], repairCap: 4 }), /REPAIR_CAP_EXCEEDED/);
  assert.deepEqual(batch.read(f.p.manifest), afterSecond);
});

test('repair cap includes history and can increase only within the total limit of four', t => {
  const f = fixture(t);
  repair.prepare(f.root, { ids: [f.ids[0]], repairCap: 1 });
  const afterFirst = batch.read(f.p.manifest);
  assert.throws(() => repair.buildRepairPlan(afterFirst, { ids: [f.ids[1]], repairCap: 1 }), /REPAIR_CAP_EXCEEDED/);
  const plan = repair.buildRepairPlan(afterFirst, { ids: [f.ids[1]], repairCap: 2 });
  assert.equal(plan.historyCount, 1);
  assert.equal(plan.repairRequestCap, 2);
  repair.prepare(f.root, { ids: [f.ids[1]], repairCap: 2 });
  assert.equal(batch.read(f.p.manifest).repairRequestCap, 2);
});

test('prepare acquires the operation lock before reading and leaves an existing lock intact', t => {
  const f = fixture(t);
  const lock = path.join(f.p.dir, 'operation.lock');
  fs.mkdirSync(lock);
  fs.writeFileSync(f.p.manifest, 'invalid JSON that must not be read');
  assert.throws(() => repair.prepare(f.root, { ids: [f.ids[0]], repairCap: 1 }), { code: 'EEXIST' });
  assert.equal(fs.existsSync(lock), true);
  assert.equal(fs.existsSync(path.join(f.p.dir, 'repairs')), false);
  assert.equal(fs.readFileSync(f.p.manifest, 'utf8'), 'invalid JSON that must not be read');
});

test('backup uses exclusive copying and remains recoverable when the atomic manifest save fails', t => {
  const f = fixture(t);
  const previous = fs.readFileSync(f.p.manifest);
  const originalCopy = fs.copyFileSync;
  let exclusiveCopies = 0;
  t.mock.method(fs, 'copyFileSync', (source, destination, flags) => {
    assert.equal(flags, fs.constants.COPYFILE_EXCL);
    exclusiveCopies++;
    return originalCopy(source, destination, flags);
  });
  t.mock.method(batch, 'save', () => { throw new Error('SIMULATED_SAVE_FAILURE'); });
  assert.throws(() => repair.prepare(f.root, { ids: [f.ids[0]], repairCap: 1 }), /SIMULATED_SAVE_FAILURE/);
  assert.equal(exclusiveCopies, 1);
  assert.deepEqual(fs.readFileSync(f.p.manifest), previous);
  const directories = fs.readdirSync(path.join(f.p.dir, 'repairs'));
  assert.equal(directories.length, 1);
  const backupDirectory = path.join(f.p.dir, 'repairs', directories[0]);
  assert.deepEqual(fs.readFileSync(path.join(backupDirectory, 'manifest.before.json')), previous);
  const receipt = batch.read(path.join(backupDirectory, 'receipt.json'));
  assert.equal(receipt.beforeSha256, batch.sha(previous));
  assert.notEqual(receipt.targetManifestSha256, batch.hashFile(f.p.manifest));
  assert.equal(fs.existsSync(path.join(f.p.dir, 'operation.lock')), false);
});

test('only the verified second terminal500 for ja-f04 receives one bounded generation repair', t => {
  const f = verified500Fixture(t), before = structuredClone(f.m), receiptBefore = structuredClone(f.verifiedFailure);
  const plan = repair.buildRepairPlan(f.m, { ids: [f.id], repairCap: 1, verifiedFailure: f.verifiedFailure });
  assert.equal(plan.plannedCount, 1);
  assert.deepEqual(plan.ids, [f.id]);
  assert.equal(plan.historyCount, 0);
  assert.equal(plan.repairRequestCap, 1);
  assert.deepEqual(plan.estimatedCredits, { old: 768, new: 12, total: 780, cap: 780 });
  assert.deepEqual(f.m, before);
  assert.deepEqual(f.verifiedFailure, receiptBefore);
  assert.equal(Object.hasOwn(f.job, 'personaTerminalFailureVerified'), false);
  assert.throws(() => repair.buildRepairPlan(f.m, { ids: [f.id], repairCap: 1 }));
  assert.throws(() => repair.buildRepairPlan(f.m, { ids: [f.id], repairCap: 2, verifiedFailure: f.verifiedFailure }));
  assert.throws(() => repair.buildRepairPlan(f.m, { ids: [f.id, f.ids[0]], repairCap: 2, verifiedFailure: f.verifiedFailure }));
});

test('verified500 repair rejects transport, existing personas, missing corrective history and mismatched evidence', t => {
  const f = verified500Fixture(t);
  for (const mutate of [
    job => { job.personaErrorCategory = 'transport'; },
    job => { job.personaHttpStatus = null; job.personaProviderCode = null; },
    job => { job.personaId = 'possibly_created_persona'; },
    job => { job.personaCorrectiveRetry = 0; },
    job => { delete job.personaCorrectiveRetry; },
    job => { job.personaAttemptHistory = []; },
    job => { job.personaAttemptHistory.push(structuredClone(job.personaAttemptHistory[0])); },
    job => { job.state = 'processing'; },
    job => { job.sample.clipId = job.clips[1].id; },
  ]) {
    const m = structuredClone(f.m); mutate(m.jobs.find(job => job.id === f.id));
    assert.throws(() => repair.buildRepairPlan(m, { ids: [f.id], repairCap: 1, verifiedFailure: f.verifiedFailure }));
  }
  for (const patch of [
    { id: 'melodio-global-v1-ja-f10' }, { attemptId: f.originalReceipt.attemptId },
    { requestTaskId: 'mismatched_request' }, { returnedTaskId: 'mismatched_return' },
    { sourceTaskId: 'other_generation_task' }, { audioId: f.job.clips[1].id },
    { http: 500 }, { code: 500 }, { state: 'processing' }, { model: 'ai-music-api/generate' },
    { sourceMatches: false }, { failCode: '400' }, { reason: 'Unrecognized failure' },
    { personaId: 'possibly_created_persona' }, { responseSha256: 'invalid-hash' }, { checkedAt: 'invalid-date' },
  ]) {
    assert.throws(() => repair.buildRepairPlan(f.m, { ids: [f.id], repairCap: 1,
      verifiedFailure: { ...f.verifiedFailure, ...patch } }));
  }
  const other = structuredClone(f.m), otherId = 'melodio-global-v1-ja-f10';
  const otherJob = other.jobs.find(job => job.id === otherId);
  Object.assign(otherJob, { personaCorrectiveRetry: 1, personaAttemptHistory: structuredClone(f.job.personaAttemptHistory),
    personaProviderCode: 500 });
  const otherReceipt = { ...f.verifiedFailure, id: otherId, attemptId: otherJob.personaAttemptId,
    sourceTaskId: otherJob.taskId, audioId: otherJob.sample.clipId };
  assert.throws(() => repair.buildRepairPlan(other, { ids: [otherId], repairCap: 1, verifiedFailure: otherReceipt }));
});

test('verified500 preparation preserves both persona attempts, evidence and exact backup then plans fresh A-r1', t => {
  const f = verified500Fixture(t), evidencePath = path.join(f.p.dir, 'verified-second-terminal500.json');
  batch.save(evidencePath, [f.verifiedFailure]);
  const evidenceBytes = fs.readFileSync(evidencePath), previousBytes = fs.readFileSync(f.p.manifest);
  const beforeJob = structuredClone(f.job);
  const files = ['original', 'samples'].map(folder => path.join(f.p.dir, folder, `${f.id}-A.mp3`));
  const audioHashes = files.map(batch.hashFile);
  const options = { ids: [f.id], repairCap: 1, verifiedFailurePath: evidencePath };
  const dry = repair.dryPlan(f.root, options);
  assert.deepEqual(dry.estimatedCredits, { old: 768, new: 12, total: 780, cap: 780 });
  assert.deepEqual(fs.readFileSync(f.p.manifest), previousBytes);
  assert.equal(fs.existsSync(path.join(f.p.dir, 'repairs')), false);
  const result = repair.prepare(f.root, options), revised = batch.read(f.p.manifest);
  const current = revised.jobs.find(job => job.id === f.id), archived = revised.repairHistory[0].oldJob;
  assert.deepEqual(fs.readFileSync(result.backup), previousBytes);
  assert.deepEqual(fs.readFileSync(evidencePath), evidenceBytes);
  assert.deepEqual(archived, { ...beforeJob, personaTerminalFailureVerified: f.verifiedFailure });
  assert.equal(archived.personaAttemptId, f.verifiedFailure.attemptId);
  assert.equal(archived.personaAttemptHistory.length, 1);
  assert.equal(archived.personaAttemptHistory[0].originalAttempt.personaAttemptId, f.originalReceipt.attemptId);
  assert.deepEqual(archived.personaAttemptHistory[0].verifiedFailure, f.originalReceipt);
  assert.equal(current.state, 'planned');
  assert.equal(current.repairRevision, 1);
  assert.deepEqual(current.profile, beforeJob.profile);
  assert.deepEqual(current.options, beforeJob.options);
  for (const field of ['taskId', 'sample', 'clips', 'personaAttemptId', 'personaAttemptHistory', 'personaId']) {
    assert.equal(Object.hasOwn(current, field), false);
  }
  assert.equal(batch.sampleStem(current), `${f.id}-A-r1`);
  assert.deepEqual(files.map(batch.hashFile), audioHashes);
  assert.equal(batch.reservedCredits(revised), 768);
  assert.equal(batch.totalCreditCap(revised), 780);
  batch.validateManifest(revised);
  assert.throws(() => repair.buildRepairPlan(revised, { ids: [f.id], repairCap: 1, verifiedFailure: f.verifiedFailure }));
});

test('verified500 repair is unavailable after any prior generation repair', t => {
  const f = verified500Fixture(t);
  repair.prepare(f.root, { ids: [f.ids[0]], repairCap: 1 });
  const prior = batch.read(f.p.manifest);
  assert.equal(prior.repairHistory.length, 1);
  assert.throws(() => repair.buildRepairPlan(prior, { ids: [f.id], repairCap: 2, verifiedFailure: f.verifiedFailure }));
});

test('CLI requires explicit IDs and cap; only an explicit prepare selects mutation', () => {
  const flags = ['--ids', 'melodio-global-v1-en-f01,melodio-global-v1-ja-m01', '--repair-cap', '2'];
  assert.deepEqual(repair.parseArgs(flags), {
    mode: 'dry-plan', ids: ['melodio-global-v1-en-f01', 'melodio-global-v1-ja-m01'], repairCap: 2,
  });
  assert.equal(repair.parseArgs(['dry-plan', ...flags]).mode, 'dry-plan');
  assert.equal(repair.parseArgs(['prepare', ...flags]).mode, 'prepare');
  const verifiedFlags = ['--ids', 'melodio-global-v1-ja-f04', '--repair-cap', '1', '--verified-failure', '/tmp/verified-terminal500.json'];
  assert.deepEqual(repair.parseArgs(verifiedFlags), { mode: 'dry-plan', ids: ['melodio-global-v1-ja-f04'],
    repairCap: 1, verifiedFailurePath: '/tmp/verified-terminal500.json' });
  assert.equal(repair.parseArgs(['prepare', ...verifiedFlags]).verifiedFailurePath, '/tmp/verified-terminal500.json');
  for (const args of [[], ['prepare'], ['submit', ...flags], flags.slice(0, 2), [...flags, '--repair-cap', '3'],
    [...flags, '--retry'], ['--ids', 'melodio-global-v1-en-f01,', '--repair-cap', '1'],
    ['--ids', 'melodio-global-v1-en-f01', '--repair-cap', '5'], [...flags, '--verified-failure'],
    [...verifiedFlags, '--verified-failure', '/tmp/duplicate.json']]) {
    assert.throws(() => repair.parseArgs(args), /REPAIR_/);
  }
});
