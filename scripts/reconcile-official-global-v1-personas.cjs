'use strict';

// No provider calls. Reconcile GET-verified receipts or prepare one corrected
// persona retry after a confirmed terminal failure; never regenerate audio.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const batch = require('./official-global-v1.cjs');
const MODEL = 'ai-music-api/generate-persona';
const RETRY_CAP = 8;
const HASH = /^[a-f0-9]{64}$/;
function object(value) {
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > 64 * 1024) throw new Error('RECORD_FIELD_SIZE');
    try { value = JSON.parse(value); } catch { throw new Error('RECORD_JSON'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('RECORD_OBJECT');
  return value;
}
function alias(row, a, b) {
  if (row[a] != null && row[b] != null && row[a] !== row[b]) throw new Error('RECORD_ALIAS_CONFLICT');
  return row[a] ?? row[b];
}
function resultPersonaId(data) {
  const candidates = new Set();
  function visit(value, depth) {
    if (value == null || value === '') return;
    if (depth > 4) throw new Error('RECORD_RESULT_DEPTH');
    const row = object(value);
    for (const key of ['persona_id', 'personaId']) if (row[key] != null) {
      if (!batch.validId(row[key])) throw new Error('RECORD_PERSONA_ID');
      candidates.add(row[key]);
    }
    for (const key of ['resultJson', 'resultObject', 'data', 'response']) if (row[key] != null) visit(row[key], depth + 1);
  }
  visit(data, 0);
  if (candidates.size > 1) throw new Error('RECORD_PERSONA_CONFLICT');
  return [...candidates][0] || null;
}
function firstABinding(job) {
  const clip = batch.firstA(job);
  if (job.sample?.version !== 'A' || job.sample.clipId !== clip.id || job.personaTaskId !== job.taskId
    || job.personaAudioId !== clip.id || job.personaSourceVersion !== 'A') throw new Error('RECOVERY_FIRST_A_BINDING');
  return clip;
}
/** Parse a transient raw recordInfo response into the compact receipt schema. */
function inspectRecordInfo(job, logRow, raw, { http = 200, checkedAt = new Date().toISOString(), responseSha256 } = {}) {
  const clip = firstABinding(job), root = object(raw), data = object(root.data);
  if (http !== 200 || Number(root.code) !== 200 || !batch.validId(logRow?.requestTaskId)
    || logRow.sourceTaskId !== job.taskId || logRow.audioId !== clip.id) throw new Error('RECORD_LOG_BINDING');
  const requestTaskId = alias(data, 'taskId', 'task_id');
  if (requestTaskId !== logRow.requestTaskId) throw new Error('RECORD_REQUEST_TASK_MISMATCH');
  const param = object(data.param), input = object(param.input);
  if ((data.model != null && data.model !== MODEL) || (param.model != null && param.model !== MODEL)
    || (data.model ?? param.model) !== MODEL) throw new Error('RECORD_MODEL');
  if (alias(input, 'task_id', 'taskId') !== job.taskId || alias(input, 'audio_id', 'audioId') !== clip.id) throw new Error('RECORD_SOURCE_MISMATCH');
  const rawState = String(data.state ?? data.status ?? '').toLowerCase();
  const state = rawState === 'success' ? 'success' : ['fail', 'failed', 'failure', 'error'].includes(rawState) ? 'fail' : rawState;
  const id = resultPersonaId(data);
  let resultCode = null;
  if (data.resultJson != null && data.resultJson !== '') { const output = object(data.resultJson); resultCode = output.code == null ? null : Number(output.code); }
  const receipt = { id: job.id, attemptId: job.personaAttemptId, requestTaskId, returnedTaskId: requestTaskId,
    sourceTaskId: job.taskId, audioId: clip.id, http, code: Number(root.code), state, model: MODEL, sourceMatches: true,
    failCode: data.failCode == null ? null : String(data.failCode), reason: typeof data.failMsg === 'string' ? data.failMsg.slice(0, 200) : '',
    personaId: id, resultCode, creditsConsumed: Number.isFinite(data.creditsConsumed) ? data.creditsConsumed : null,
    responseSha256: responseSha256 || batch.sha(JSON.stringify(raw)), checkedAt };
  validateReceipt(job, receipt); return receipt;
}
function validateReceipt(job, row) {
  const clip = firstABinding(job);
  if (row?.id !== job.id || !batch.validId(row.attemptId) || row.attemptId !== job.personaAttemptId
    || !batch.validId(row.requestTaskId) || row.returnedTaskId !== row.requestTaskId || row.sourceTaskId !== job.taskId
    || row.audioId !== clip.id || row.sourceMatches !== true || row.model !== MODEL || row.http !== 200 || Number(row.code) !== 200
    || !HASH.test(row.responseSha256 || '') || !Number.isFinite(Date.parse(row.checkedAt))
    || (typeof row.reason !== 'string' && row.reason != null) || (row.reason?.length || 0) > 200) throw new Error('VERIFIED_RECEIPT_BINDING');
  if (!['success', 'fail'].includes(row.state)) throw new Error('RECORD_NOT_TERMINAL');
  if (row.state === 'success') {
    if (!batch.validId(row.personaId) || (row.resultCode != null && Number(row.resultCode) !== 200)) throw new Error('RECORD_SUCCESS_UNCONFIRMED');
  } else if (row.personaId != null) throw new Error('RECORD_FAILURE_HAS_PERSONA');
  return row;
}
function verifiedRows(m, rows) {
  batch.validateManifest(m);
  if (!Array.isArray(rows) || !rows.length || rows.length > 64) throw new Error('RECEIPTS_REQUIRED');
  const ids = new Set(), requests = new Set(), pairs = new Set();
  for (const row of rows) {
    const job = m.jobs.find(j => j.id === row?.id); if (!job) throw new Error('RECEIPT_JOB_UNKNOWN');
    validateReceipt(job, row);
    const pair = `${row.sourceTaskId}/${row.audioId}`;
    if (ids.has(row.id) || requests.has(row.requestTaskId) || pairs.has(pair)) throw new Error('RECEIPT_DUPLICATE_BINDING');
    ids.add(row.id); requests.add(row.requestTaskId); pairs.add(pair);
  }
  return rows;
}
function correctedFields(job, row) {
  validateReceipt(job, row);
  if (row.state !== 'fail' || row.personaId != null || Object.hasOwn(job, 'personaId')
    || !['uncertain', 'held'].includes(job.personaState) || job.personaCorrectiveRetry || job.personaAttemptHistory?.length) throw new Error('PERSONA_RETRY_INELIGIBLE');
  const reason = row.reason || '', code = String(row.failCode ?? '');
  if (code === '400' && /Description cannot contain artist name:\s*soprano\b/i.test(reason)) {
    const current = job.personaDescription ?? job.profile.stylePrompt;
    if (!/\bsoprano\b/i.test(current)) throw new Error('PERSONA_CORRECTION_MISMATCH');
    let description = current.replace(/\bsoprano\b/gi, 'upper-register singer');
    if (description.length > 200) description = description.slice(0, 201).replace(/\s+\S*$/, '').slice(0, 200);
    return { personaDescription: description, correction: 'description-register-word' };
  }
  if (code === '400' && /Name cannot contain artist name:\s*zo[eé](?:\s|$|[.,;:])/i.test(reason)) {
    if (!/zoe/i.test((job.personaName ?? job.profile.name).normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))) throw new Error('PERSONA_CORRECTION_MISMATCH');
    return { personaName: job.id, correction: 'provider-name-stable-id' };
  }
  if (code === '500' && /internal error/i.test(reason)) return { correction: 'confirmed-internal-failure' };
  throw new Error('PERSONA_FAILURE_NOT_APPROVED_FOR_CORRECTION');
}
function occupied(root, m) {
  const entries = new Map();
  for (const j of m.jobs) if (j.personaId) entries.set(j.personaId, j.id);
  for (const relative of [batch.PROTECTED[1], batch.PROTECTED[3]]) {
    for (const [id, persona] of Object.entries(batch.read(path.join(root, relative)))) {
      if (entries.has(persona) && entries.get(persona) !== id) throw new Error('EXISTING_PERSONA_CONFLICT');
      entries.set(persona, `catalog:${id}`);
    }
  }
  return entries;
}
function plan(m, rows) {
  verifiedRows(m, rows);
  const successes = rows.filter(row => row.state === 'success').map(row => row.id), failures = [];
  for (const row of rows.filter(r => r.state === 'fail')) {
    const job = m.jobs.find(j => j.id === row.id);
    failures.push({ id: row.id, correction: correctedFields(job, row).correction });
  }
  return { recoverableSuccesses: successes, confirmedFailures: failures, additionalGenerationRequests: 0,
    generationCreditsKnown: batch.report(m).generationCreditsKnown, maximumCorrectivePersonaRetries: RETRY_CAP };
}
function reconciliation(m, rows, occupiedIds = new Map()) {
  verifiedRows(m, rows); const next = structuredClone(m), changes = [];
  const taken = new Map(occupiedIds);
  for (const job of m.jobs) if (job.personaId) taken.set(job.personaId, job.id);
  for (const row of rows.filter(r => r.state === 'success')) {
    const job = next.jobs.find(j => j.id === row.id);
    if (taken.has(row.personaId) && taken.get(row.personaId) !== job.id) throw new Error('RECOVERED_PERSONA_NOT_UNIQUE');
    if (job.personaState === 'ready') { if (job.personaId !== row.personaId) throw new Error('READY_PERSONA_MISMATCH'); continue; }
    if (!['uncertain', 'held', 'submitting'].includes(job.personaState) || Object.hasOwn(job, 'personaId')) throw new Error('RECOVERY_STATE_CHANGED');
    job.personaId = row.personaId; job.personaModel = 'style_persona'; job.personaState = 'ready';
    // personaTaskId remains the generation task. The request ID is separate.
    job.personaRecovery = { ...row }; job.personaRequestTaskId = row.requestTaskId;
    taken.set(row.personaId, job.id); changes.push(job.id);
  }
  batch.validateManifest(next); return { next, changes };
}
const ATTEMPT_FIELDS = ['personaState', 'personaId', 'personaModel', 'personaSubmittedAt', 'personaAttemptId', 'personaTaskId',
  'personaAudioId', 'personaSourceVersion', 'personaTimeoutMs', 'personaRequestSha256', 'personaHttpStatus', 'personaProviderCode',
  'personaErrorCategory', 'personaFinishedAt', 'personaElapsedMs', 'personaRequestTaskId'];
function retryPreparation(m, rows, { ids, retryCap } = {}) {
  verifiedRows(m, rows);
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('RETRY_IDS_REQUIRED');
  if (!Number.isInteger(retryCap) || retryCap < 1 || retryCap > RETRY_CAP || retryCap < (m.personaCorrectiveRetryCap || 0)) throw new Error('PERSONA_RETRY_CAP');
  const prior = m.jobs.filter(j => j.personaCorrectiveRetry).length;
  if (prior + ids.length > retryCap) throw new Error('PERSONA_RETRY_CAP');
  const next = structuredClone(m), changes = [];
  for (const id of ids) {
    const job = next.jobs.find(j => j.id === id), row = rows.find(r => r.id === id);
    if (!job || !row) throw new Error('RETRY_RECEIPT_MISSING');
    const { correction, ...fields } = correctedFields(job, row);
    const originalAttempt = Object.fromEntries(Object.entries(job).filter(([key]) => key.startsWith('persona')));
    job.personaAttemptHistory = [{ originalAttempt, verifiedFailure: { ...row }, correction }];
    for (const key of ATTEMPT_FIELDS) delete job[key];
    Object.assign(job, fields, { personaCorrectiveRetry: 1, personaRetrySourceAttemptId: row.attemptId });
    changes.push({ id, correction });
  }
  next.personaCorrectiveRetryCap = retryCap;
  batch.validateManifest(next); return { next, changes, additionalGenerationRequests: 0 };
}
function evidencePath(p, option) { return option ? path.resolve(option) : path.join(p.dir, 'persona-record-verified.json'); }
function writeMutation(root, mode, options, transform) {
  const p = batch.locations(root), lock = path.join(p.dir, 'operation.lock'); fs.mkdirSync(lock);
  try {
    const before = fs.readFileSync(p.manifest), m = JSON.parse(before.toString('utf8'));
    batch.assertProtected(m, root);
    const evidence = evidencePath(p, options.receiptPath), evidenceBytes = fs.readFileSync(evidence), rows = JSON.parse(evidenceBytes.toString('utf8'));
    const result = transform(m, rows, occupied(root, m));
    if (!result.changes.length) return { mode, changed: 0, additionalGenerationRequests: 0 };
    const directory = path.join(p.dir, 'persona-recovery', `${mode}-${Date.now()}-${crypto.randomUUID()}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'manifest.before.json'), before, { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'verified-receipts.json'), evidenceBytes, { flag: 'wx' });
    if (batch.hashFile(p.manifest) !== batch.sha(before) || batch.hashFile(evidence) !== batch.sha(evidenceBytes)) throw new Error('RECOVERY_INPUT_CHANGED');
    const targetSha256 = batch.sha(JSON.stringify(result.next, null, 2) + '\n');
    const receipt = { mode, changes: result.changes, beforeSha256: batch.sha(before), evidenceSha256: batch.sha(evidenceBytes),
      targetManifestSha256: targetSha256, checkedAt: new Date().toISOString(), additionalGenerationRequests: 0 };
    fs.writeFileSync(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    batch.save(p.manifest, result.next);
    if (batch.hashFile(p.manifest) !== targetSha256) throw new Error('RECOVERY_SAVE_UNVERIFIED');
    return { mode, changed: result.changes.length, changes: result.changes, backupDirectory: directory, additionalGenerationRequests: 0 };
  } finally { fs.rmdirSync(lock); }
}
function reconcile(root = batch.ROOT, options = {}) { return writeMutation(root, 'reconcile', options, reconciliation); }
function prepareRetry(root = batch.ROOT, options = {}) {
  return writeMutation(root, 'prepare-retry', options, (m, rows) => retryPreparation(m, rows, options));
}
function parseArgs(argv) {
  const args = [...argv], mode = args[0] && !args[0].startsWith('--') ? args.shift() : 'plan', values = {};
  if (!['plan', 'reconcile', 'prepare-retry'].includes(mode)) throw new Error('RECOVERY_MODE');
  while (args.length) {
    const key = args.shift(), value = args.shift();
    if (!['--receipt', '--ids', '--retry-cap'].includes(key) || Object.hasOwn(values, key) || !value || value.startsWith('--')) throw new Error('RECOVERY_ARGS');
    values[key] = value;
  }
  if (mode !== 'prepare-retry' && (values['--ids'] || values['--retry-cap'])) throw new Error('RECOVERY_ARGS');
  const options = { receiptPath: values['--receipt'] };
  if (mode === 'prepare-retry') {
    if (!values['--ids'] || !/^[1-8]$/.test(values['--retry-cap'] || '')) throw new Error('RETRY_EXPLICIT_IDS_AND_CAP');
    options.ids = values['--ids'].split(',').map(value => value.trim()); options.retryCap = Number(values['--retry-cap']);
    if (options.ids.some(id => !batch.validId(id)) || new Set(options.ids).size !== options.ids.length) throw new Error('RETRY_IDS_REQUIRED');
  }
  return { mode, options };
}
function main() {
  const { mode, options } = parseArgs(process.argv.slice(2)), p = batch.locations();
  const result = mode === 'plan' ? plan(batch.read(p.manifest), batch.read(evidencePath(p, options.receiptPath)))
    : mode === 'reconcile' ? reconcile(batch.ROOT, options) : prepareRetry(batch.ROOT, options);
  console.log(JSON.stringify(result));
}
module.exports = { inspectRecordInfo, validateReceipt, verifiedRows, correctedFields, plan, reconciliation,
  retryPreparation, reconcile, prepareRetry, parseArgs, resultPersonaId };
if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
