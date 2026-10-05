'use strict';

// Read-only by default. An explicit prepare archives the rejected generation
// receipt and plans a fresh A generation; it never calls a provider or edits audio.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const batch = require('./official-global-v1.cjs');
const { validateReceipt } = require('./reconcile-official-global-v1-personas.cjs');

const MAX_REPAIRS = 4;
const UNIT_CREDITS = 12;
const REASON = 'persona-provider-rejected';
const RETAINED_FIELDS = ['id', 'profile', 'gender', 'language', 'options', 'personaDescription'];

function verifiedJob(job, { ids, repairCap, verifiedFailure }, history) {
  if (job.personaProviderCode !== 500 && !verifiedFailure) return job;
  if (ids.length !== 1 || ids[0] !== 'melodio-global-v1-ja-f04' || repairCap !== 1 || history.length
    || job.id !== ids[0] || job.personaProviderCode !== 500 || job.personaCorrectiveRetry !== 1
    || job.personaAttemptHistory?.length !== 1 || !verifiedFailure) throw new Error('VERIFIED_FINAL_FAILURE_SCOPE');
  validateReceipt(job, verifiedFailure);
  if (verifiedFailure.state !== 'fail' || String(verifiedFailure.failCode) !== '500' || verifiedFailure.personaId != null
    || !/internal error/i.test(verifiedFailure.reason || '')) throw new Error('VERIFIED_FINAL_FAILURE_REQUIRED');
  return { ...job, personaTerminalFailureVerified: structuredClone(verifiedFailure) };
}
function failureOptions(options) {
  if (!options.verifiedFailurePath) return options;
  if (options.verifiedFailure) throw new Error('DUPLICATE_FAILURE_EVIDENCE');
  const value = JSON.parse(fs.readFileSync(path.resolve(options.verifiedFailurePath), 'utf8'));
  if (Array.isArray(value) && value.length !== 1) throw new Error('SINGLE_VERIFIED_FAILURE_REQUIRED');
  return { ...options, verifiedFailure: Array.isArray(value) ? value[0] : value };
}
function buildRepairPlan(manifest, { ids, repairCap, verifiedFailure } = {}) {
  batch.validateManifest(manifest);
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('REPAIR_IDS_REQUIRED');
  if (ids.some(id => !batch.validId(id)) || new Set(ids).size !== ids.length) throw new Error('REPAIR_IDS_INVALID');
  if (!Number.isInteger(repairCap) || repairCap < 1 || repairCap > MAX_REPAIRS) throw new Error('REPAIR_CAP_REQUIRED_1_TO_4');
  const history = manifest.repairHistory || [];
  if (repairCap < (manifest.repairRequestCap || 0)) throw new Error('REPAIR_CAP_CANNOT_SHRINK');
  if (history.length + ids.length > MAX_REPAIRS || history.length + ids.length > repairCap) throw new Error('REPAIR_CAP_EXCEEDED');
  for (const id of ids) {
    const job = manifest.jobs.find(row => row.id === id);
    if (!job) throw new Error('REPAIR_ID_NOT_FOUND');
    if (history.some(entry => entry.id === id) || Object.hasOwn(job, 'repairRevision')) throw new Error('REPAIR_ALREADY_USED');
    if (!batch.repairEligible(verifiedJob(job, { ids, repairCap, verifiedFailure }, history))) throw new Error('REPAIR_NOT_ELIGIBLE');
  }
  const oldCredits = batch.reservedCredits(manifest);
  const newCredits = ids.length * UNIT_CREDITS;
  const creditCap = manifest.estimatedCreditCap + repairCap * UNIT_CREDITS;
  if (oldCredits + newCredits > creditCap) throw new Error('REPAIR_CREDIT_CAP_EXCEEDED');
  return {
    ids: [...ids],
    plannedCount: ids.length,
    historyCount: history.length,
    repairRequestCap: repairCap,
    generationJobsBefore: batch.generationJobs(manifest).length,
    generationJobsAfter: batch.generationJobs(manifest).length + ids.length,
    estimatedCredits: { old: oldCredits, new: newCredits, total: oldCredits + newCredits, cap: creditCap },
    priceNotGuaranteed: true,
  };
}

function dryPlan(root = batch.ROOT, options = {}) {
  return { mode: 'dry-plan', ...buildRepairPlan(batch.read(batch.locations(root).manifest), failureOptions(options)) };
}

function prepare(root = batch.ROOT, options = {}) {
  const p = batch.locations(root);
  const lock = path.join(p.dir, 'operation.lock');
  // Acquire the same lock as generation/persona commands before reading any
  // manifest bytes. A lock acquisition failure must not remove another lock.
  fs.mkdirSync(lock);
  try {
    const previousBytes = fs.readFileSync(p.manifest);
    const manifest = JSON.parse(previousBytes.toString('utf8'));
    const checkedOptions = failureOptions(options);
    const plan = buildRepairPlan(manifest, checkedOptions);
    const archivedAt = new Date().toISOString();
    const revised = structuredClone(manifest);
    revised.repairRequestCap = plan.repairRequestCap;
    revised.repairHistory ||= [];
    for (const id of plan.ids) {
      const index = revised.jobs.findIndex(job => job.id === id);
      const oldJob = verifiedJob(revised.jobs[index], checkedOptions, manifest.repairHistory || []);
      revised.repairHistory.push({ id, revision: 1, reason: REASON, archivedAt, oldJob });
      revised.jobs[index] = {
        ...Object.fromEntries(RETAINED_FIELDS.filter(field => Object.hasOwn(oldJob, field)).map(field => [field, structuredClone(oldJob[field])])),
        repairRevision: 1,
        state: 'planned',
      };
    }
    batch.validateManifest(revised);

    const repairs = path.join(p.dir, 'repairs');
    fs.mkdirSync(repairs, { recursive: true });
    const directory = path.join(repairs, `${archivedAt.replace(/[:.]/g, '-')}-${crypto.randomUUID()}`);
    fs.mkdirSync(directory);
    const backup = path.join(directory, 'manifest.before.json');
    const receipt = path.join(directory, 'receipt.json');
    if (checkedOptions.verifiedFailure) fs.writeFileSync(path.join(directory, 'verified-terminal-failure.json'), JSON.stringify(checkedOptions.verifiedFailure, null, 2) + '\n', { flag: 'wx' });
    fs.copyFileSync(p.manifest, backup, fs.constants.COPYFILE_EXCL);
    const beforeSha256 = batch.sha(previousBytes);
    if (batch.hashFile(backup) !== beforeSha256 || batch.hashFile(p.manifest) !== beforeSha256) {
      throw new Error('MANIFEST_CHANGED_BEFORE_REPAIR');
    }
    const targetSha256 = batch.sha(JSON.stringify(revised, null, 2) + '\n');
    // This immutable receipt records intent, not a claim that the manifest save
    // succeeded. Its target hash allows a later reader to verify durable state.
    fs.writeFileSync(receipt, JSON.stringify({
      version: 1,
      operation: 'official-global-v1-repair-prepare',
      batch: manifest.batch,
      reason: REASON,
      archivedAt,
      beforeSha256,
      targetManifestSha256: targetSha256,
      backup: 'manifest.before.json',
      ...plan,
    }, null, 2) + '\n', { flag: 'wx' });
    batch.save(p.manifest, revised);
    if (batch.hashFile(p.manifest) !== targetSha256) throw new Error('REPAIR_MANIFEST_SAVE_UNVERIFIED');
    return { mode: 'prepare', prepared: true, ...plan, manifestSha256: targetSha256, backup, receipt };
  } finally {
    fs.rmdirSync(lock);
  }
}

function parseArgs(argv) {
  const args = [...argv];
  const mode = args[0] && !args[0].startsWith('--') ? args.shift() : 'dry-plan';
  if (!['dry-plan', 'prepare'].includes(mode)) throw new Error('REPAIR_MODE');
  const values = {};
  while (args.length) {
    const flag = args.shift();
    if (!['--ids', '--repair-cap', '--verified-failure'].includes(flag) || Object.hasOwn(values, flag)) throw new Error('REPAIR_FLAG');
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error('REPAIR_FLAG_VALUE');
    values[flag] = value;
  }
  if (!values['--ids']) throw new Error('REPAIR_IDS_REQUIRED');
  if (!/^[1-4]$/.test(values['--repair-cap'] || '')) throw new Error('REPAIR_CAP_REQUIRED_1_TO_4');
  const ids = values['--ids'].split(',').map(id => id.trim());
  if (ids.some(id => !batch.validId(id)) || new Set(ids).size !== ids.length) throw new Error('REPAIR_IDS_INVALID');
  return { mode, ids, repairCap: Number(values['--repair-cap']), ...(values['--verified-failure'] ? { verifiedFailurePath: values['--verified-failure'] } : {}) };
}

function main(argv = process.argv.slice(2)) {
  const { mode, ...options } = parseArgs(argv);
  const result = mode === 'prepare' ? prepare(batch.ROOT, options) : dryPlan(batch.ROOT, options);
  console.log(JSON.stringify(result));
}

module.exports = { MAX_REPAIRS, buildRepairPlan, dryPlan, prepare, parseArgs };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
