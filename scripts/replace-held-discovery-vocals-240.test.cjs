const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { planReplacement, IDS, DESCRIPTIONS } = require('./replace-held-discovery-vocals-240.cjs');
const { validateManifest, canSubmit, canRegister } = require('./discovery-vocal-rollout-240.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'melodio-replacement-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'artifacts/discovery-vocals-v2-20261005');
  fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'samples'));
  const jobs = Array.from({ length: 240 }, (_, index) => {
    const gender = index < 120 ? 'female' : 'male', number = index % 120 + 1;
    const id = `discovery-v2-${gender === 'female' ? 'f' : 'm'}-${String(number).padStart(3, '0')}`;
    const profile = { id, gender, provisionalName: `Fixture ${index}`, stylePrompt: `Original acoustic design ${index}`,
      verificationStatus: 'design_only', audibleAnchors: ['stable register', 'dry grain'], signatureBehavior: 'straight voiced sustain' };
    const original = Buffer.from(`synthetic original ${id}`), sample = Buffer.from(`synthetic sample ${id}`);
    const job = { id, profile, gender, language: ['en', 'ko', 'ja', 'fr'][Math.floor((number - 1) / 30)],
      options: { model: 'V6', durationSeconds: 45, instrumental: false, vocalGender: gender === 'female' ? 'f' : 'm',
        style: profile.stylePrompt, lyrics: 'Complete fixture lyric', exclude: 'doubled lead' },
      state: 'complete', taskId: `old-task-${id}`, creditsConsumed: 12,
      clips: [{ id: `old-a-${id}`, url: 'https://cdn1.suno.ai/a.mp3' }, { id: `old-b-${id}`, url: 'https://cdn1.suno.ai/b.mp3' }],
      sample: { version: 'A', clipId: `old-a-${id}`, originalSha256: hash(original), sha256: hash(sample) },
      personaState: IDS.includes(id) ? 'held' : 'ready', personaAttemptId: `old-attempt-${id}`,
      personaFailureHistory: [{ sourceTaskId: `old-task-${id}`, providerCode: 500, category: 'provider_error' }],
      personaTaskId: `old-task-${id}`, personaAudioId: `old-a-${id}`, submittedAt: '2026-10-05T00:00:00Z' };
    if (!IDS.includes(id)) job.personaId = `old-persona-${id}`;
    if (IDS.includes(id)) for (const [relative, bytes] of [
      [`original/${id}-A.mp3`, original], [`samples/${id}-A.mp3`, sample], [`samples/${id}-A-hook.mp3`, Buffer.from(`synthetic hook ${id}`)],
    ]) fs.writeFileSync(path.join(dir, relative), bytes);
    return job;
  });
  const manifest = { requestCap: 240, selectedVersion: 'A', authorization: 'user-20261005-first-output-all240', estimatedTotalCredits: 2880, jobs };
  validateManifest(manifest);
  const manifestPath = path.join(dir, 'rollout-240.json'), before = JSON.stringify(manifest, null, 2) + '\n';
  fs.writeFileSync(manifestPath, before);
  return { root, dir, manifestPath, manifest, before, archive: path.join(dir, 'replacements-20261005') };
}

test('replacement archives exact old jobs and twelve verified sources, resets only the four held rows and refuses repetition', t => {
  const f = fixture(t), authorization = '미해결 4개를 삭제하고 재생성해서 적용. 크레딧 승인';
  const outcome = planReplacement({ root: f.root, authorization });
  assert.deepEqual({ ...outcome, archive: undefined }, { resetJobs: 4, unchangedJobs: 236, activeCap: 240,
    archivedFiles: 12, archivedKnownCredits: 48, additionalEstimatedCredits: 48, archive: undefined });
  const after = JSON.parse(fs.readFileSync(f.manifestPath, 'utf8'));
  validateManifest(after);
  assert.equal(after.jobs.length, 240);
  assert.equal(after.estimatedTotalCredits, 2928);
  assert.equal(after.jobs.filter(canSubmit).length, 4);
  assert.equal(after.jobs.filter(canRegister).length, 0);
  assert.equal(after.replacementAuthorization.userText, authorization);
  assert.deepEqual(after.replacementAuthorization.ids, IDS);
  assert.equal(after.replacementAuthorization.additionalGenerationRequests, 4);
  assert.equal(after.replacementAuthorization.estimatedAdditionalCredits, 48);
  assert.equal(fs.readFileSync(path.join(f.archive, 'rollout-240.before.json'), 'utf8'), f.before);
  const receipt = JSON.parse(fs.readFileSync(path.join(f.archive, 'receipt.json'), 'utf8'));
  assert.equal(receipt.state, 'complete');
  assert.equal(receipt.manifestBeforeSha256, hash(f.before));
  assert.equal(receipt.manifestAfterSha256, hash(fs.readFileSync(f.manifestPath)));
  assert.equal(receipt.archivedGenerationRequests, 4);
  assert.equal(receipt.archivedKnownCredits, 48);
  assert.equal(after.replacementHistory.length, 4);
  for (const old of f.manifest.jobs) {
    const current = after.jobs.find(job => job.id === old.id);
    if (!IDS.includes(old.id)) { assert.equal(JSON.stringify(current), JSON.stringify(old)); continue; }
    assert.deepEqual(current, { id: old.id, profile: old.profile, options: old.options, gender: old.gender,
      language: old.language, state: 'planned', replacementRevision: 1, personaDescription: DESCRIPTIONS[old.id] });
    assert.ok(current.personaDescription.length <= 160);
    const record = after.replacementHistory.find(item => item.id === old.id);
    assert.equal(record.profileId, old.id); assert.equal(record.revision, 1); assert.deepEqual(record.oldJob, old);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.archive, `${old.id}.before.json`), 'utf8')), old);
    assert.equal(record.backups.length, 3);
    for (const backup of record.backups) {
      assert.equal(fs.existsSync(backup.sourcePath), false);
      assert.equal(fs.statSync(backup.backupPath).size, backup.bytes);
      assert.equal(hash(fs.readFileSync(backup.backupPath)), backup.sha256);
    }
  }
  assert.equal(fs.existsSync(path.join(f.dir, 'rollout.lock')), false);
  const committed = fs.readFileSync(f.manifestPath, 'utf8');
  assert.throws(() => planReplacement({ root: f.root, authorization }), /REPLACEMENT_ARCHIVE_EXISTS/);
  assert.equal(fs.readFileSync(f.manifestPath, 'utf8'), committed);
});

test('replacement rejects absent authorization, active workers and changed A provenance before any archive or manifest mutation', t => {
  const f = fixture(t);
  assert.throws(() => planReplacement({ root: f.root }), /USER_AUTHORIZATION_TEXT_REQUIRED/);
  fs.mkdirSync(path.join(f.dir, 'rollout.lock'));
  assert.throws(() => planReplacement({ root: f.root, authorization: 'fixture approval' }), /WORKER_ACTIVE/);
  fs.rmdirSync(path.join(f.dir, 'rollout.lock'));
  const changed = path.join(f.dir, 'original', `${IDS[0]}-A.mp3`);
  fs.writeFileSync(changed, 'changed fixture A source');
  assert.throws(() => planReplacement({ root: f.root, authorization: 'fixture approval' }), /SOURCE_AUDIO_PROVENANCE/);
  assert.equal(fs.readFileSync(f.manifestPath, 'utf8'), f.before);
  assert.equal(fs.existsSync(f.archive), false);
  for (const id of IDS) for (const relative of [`original/${id}-A.mp3`, `samples/${id}-A.mp3`, `samples/${id}-A-hook.mp3`]) {
    assert.equal(fs.existsSync(path.join(f.dir, relative)), true);
  }
});
