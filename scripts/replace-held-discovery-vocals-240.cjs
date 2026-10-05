// Local, reversible preparation only. Never submits generation or registration.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateManifest, firstClip } = require('./discovery-vocal-rollout-240.cjs');
const ROOT = path.resolve(__dirname, '..');
const IDS = ['discovery-v2-f-062', 'discovery-v2-f-065', 'discovery-v2-f-066', 'discovery-v2-f-067'];
const DESCRIPTIONS = {
  'discovery-v2-f-062': 'Female low contralto, slender dense tone, muted matte texture, long narrow hollow resonance, stable sung pitch.',
  'discovery-v2-f-065': 'Female low alto, full woody tone, soft dry grain, muted hollow resonance, stable sung pitch.',
  'discovery-v2-f-066': 'Female low register, compact dark tone, fine matte grain, hollow resonance with a light nasal edge, stable sung pitch.',
  'discovery-v2-f-067': 'Female low alto, broad soft tone, light soft grain, wide rounded resonance, stable sung pitch.',
};
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function proof(file) {
  const bytes = fs.statSync(file).size;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('EMPTY_BACKUP_SOURCE');
  return { bytes, sha256: digest(fs.readFileSync(file)) };
}
function verify(file, expected) {
  const actual = proof(file);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw new Error('BACKUP_PROOF_MISMATCH');
}
function atomicWrite(file, value) {
  const temporary = `${file}.stage-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, value, { flag: 'wx' });
  fs.renameSync(temporary, file);
}
function planReplacement({ root = ROOT, authorization } = {}) {
  if (typeof authorization !== 'string' || !authorization.trim() || authorization.length > 2000) throw new Error('USER_AUTHORIZATION_TEXT_REQUIRED');
  const dir = path.join(root, 'artifacts/discovery-vocals-v2-20261005');
  const manifestPath = path.join(dir, 'rollout-240.json');
  const archive = path.join(dir, 'replacements-20261005');
  if (fs.existsSync(archive)) throw new Error('REPLACEMENT_ARCHIVE_EXISTS');
  if (fs.existsSync(path.join(dir, 'rollout.lock')) || fs.existsSync(path.join(dir, 'operation.lock'))) throw new Error('WORKER_ACTIVE');
  const before = fs.readFileSync(manifestPath), m = JSON.parse(before);
  validateManifest(m);
  if (m.jobs.some(j => j.state === 'submitting' || j.state === 'processing' || j.personaState === 'submitting')) throw new Error('WORKER_STATE_ACTIVE');
  const oldJobs = IDS.map(id => {
    const j = m.jobs.find(job => job.id === id);
    if (!j || j.personaState !== 'held' || j.replacementRevision !== undefined || j.personaId
      || j.sample?.version !== 'A' || j.sample.clipId !== firstClip(j).id) throw new Error('HELD_REPLACEMENT_SCOPE');
    return j;
  });
  const history = m.replacementHistory || [];
  if (!Array.isArray(history) || history.some(item => IDS.includes(item.id || item.profileId))) throw new Error('REPLACEMENT_HISTORY_EXISTS');
  const unchanged = new Map(m.jobs.filter(j => !IDS.includes(j.id)).map(j => [j.id, JSON.stringify(j)]));
  const records = oldJobs.map(oldJob => ({ id: oldJob.id, profileId: oldJob.id, revision: 1, oldJob,
    backups: ['original', 'sample', 'hook'].map(kind => {
      const relative = kind === 'original' ? `original/${oldJob.id}-A.mp3`
        : `samples/${oldJob.id}-A${kind === 'hook' ? '-hook' : ''}.mp3`;
      const sourcePath = path.join(dir, relative), backupPath = path.join(archive, relative);
      const measured = proof(sourcePath);
      const expected = kind === 'original' ? oldJob.sample.originalSha256 : kind === 'sample' ? oldJob.sample.sha256 : measured.sha256;
      if (measured.sha256 !== expected) throw new Error('SOURCE_AUDIO_PROVENANCE');
      return { kind, sourcePath, backupPath, ...measured };
    }) }));
  m.jobs = m.jobs.map(j => IDS.includes(j.id) ? { id: j.id, profile: j.profile, options: j.options, gender: j.gender,
    language: j.language, state: 'planned', replacementRevision: 1, personaDescription: DESCRIPTIONS[j.id] } : j);
  m.replacementHistory = [...history, ...records];
  m.replacementAuthorization = { userText: authorization.trim(), recordedAt: new Date().toISOString(), ids: IDS,
    additionalGenerationRequests: 4, estimatedAdditionalCredits: 48, priceNotGuaranteed: true };
  m.estimatedTotalCredits = (Number.isFinite(m.estimatedTotalCredits) ? m.estimatedTotalCredits : 2880) + 48;
  validateManifest(m);
  for (const j of m.jobs) {
    if (unchanged.has(j.id) && JSON.stringify(j) !== unchanged.get(j.id)) throw new Error('UNCHANGED_JOB_MUTATED');
    if (IDS.includes(j.id) && (!j.personaDescription || j.personaDescription.length > 160)) throw new Error('REPLACEMENT_DESCRIPTION');
  }
  const lock = path.join(dir, 'rollout.lock');
  fs.mkdirSync(lock);
  let committed = false;
  const receipt = { state: 'prepared', ids: IDS, revision: 1, manifestBeforeSha256: digest(before),
    archivedGenerationRequests: oldJobs.filter(j => j.taskId).length,
    archivedKnownCredits: oldJobs.reduce((sum, j) => sum + (Number.isFinite(j.creditsConsumed) ? j.creditsConsumed : 0), 0), records };
  try {
    fs.mkdirSync(archive);
    fs.writeFileSync(path.join(archive, 'rollout-240.before.json'), before, { flag: 'wx' });
    verify(path.join(archive, 'rollout-240.before.json'), { bytes: before.length, sha256: digest(before) });
    for (const record of records) {
      fs.writeFileSync(path.join(archive, `${record.id}.before.json`), JSON.stringify(record.oldJob, null, 2) + '\n', { flag: 'wx' });
      for (const backup of record.backups) {
        fs.mkdirSync(path.dirname(backup.backupPath), { recursive: true });
        fs.copyFileSync(backup.sourcePath, backup.backupPath, fs.constants.COPYFILE_EXCL);
        verify(backup.backupPath, backup);
      }
    }
    atomicWrite(path.join(archive, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    for (const record of records) for (const backup of record.backups) {
      verify(backup.sourcePath, backup);
      fs.unlinkSync(backup.sourcePath);
    }
    const after = JSON.stringify(m, null, 2) + '\n';
    atomicWrite(manifestPath, after); committed = true;
    receipt.state = 'complete'; receipt.manifestAfterSha256 = digest(after);
    atomicWrite(path.join(archive, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    return { resetJobs: 4, unchangedJobs: unchanged.size, activeCap: m.requestCap, archivedFiles: 12,
      archivedKnownCredits: receipt.archivedKnownCredits, additionalEstimatedCredits: 48, archive };
  } catch {
    let restored = !committed;
    if (!committed) for (const record of records) for (const backup of record.backups) {
      try {
        if (!fs.existsSync(backup.sourcePath) && fs.existsSync(backup.backupPath)) {
          verify(backup.backupPath, backup);
          fs.copyFileSync(backup.backupPath, backup.sourcePath, fs.constants.COPYFILE_EXCL);
          verify(backup.sourcePath, backup);
        }
      } catch { restored = false; }
    }
    receipt.state = committed ? 'manifest-committed-receipt-held' : restored ? 'failed-restored' : 'rollback-held';
    try { atomicWrite(path.join(archive, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); } catch {}
    throw new Error(committed ? 'REPLACEMENT_RECEIPT_HELD' : restored ? 'REPLACEMENT_FAILED_RESTORED' : 'REPLACEMENT_ROLLBACK_HELD');
  } finally { fs.rmdirSync(lock); }
}
module.exports = { planReplacement, IDS, DESCRIPTIONS };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), authorizationIndex = args.indexOf('--authorization');
    if (args[0] !== 'plan' || authorizationIndex < 0) throw new Error('USAGE_PLAN_AUTHORIZATION');
    console.log(JSON.stringify(planReplacement({ authorization: args[authorizationIndex + 1] })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
