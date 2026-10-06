// Narrow frontend sample release. No generation, persona registration, or DB writes.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const run = promisify(require('node:child_process').execFile);
const root = path.resolve(__dirname, '..');
const release = '/Users/yoonmanro/.codex/worktrees/vocal-studio-release/Melodio';
const baselineId = 'dpl_3wwyi14rgJJERS6jAhdotGTBnzbq';
const baselineCommit = 'eab755680dbc7a93bc4863372efb64bfe6e45e04';
const projectId = 'prj_UafJDBSpuhIY42w0AeoWw2ZLawW9';
const orgId = 'team_8SjF7VezPKFYeMOoISCe7tDi';
const receiptPath = path.join(root, 'docs/releases/missing-samples-20261006.receipt.json');
const checksPath = path.join(root, 'docs/releases/missing-samples-20261006.checks.json');
const manifestPath = '/private/tmp/melodio-missing-singing-samples-20261006/manifest.json';
const proofPath = path.join(root, 'docs/releases/missing-samples-20261006.audio-verification.json');
const IDS = ['voice-anna-kim', 'voice-kaelen-soul', 'voice-yeontaek-rock', 'voice-aria-soprano', 'voice-noa-indigo', 'voice-leon-silk', 'voice-rin-edge'];
const moePath = '/assets/voices/approved-20261006/voice-moe-jpop-A.mp3';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
function requireCondition(value, category) { if (!value) throw Error(category); }
function deployment(stdout) {
  const raw = JSON.parse(stdout); const value = raw.deployment || raw.result || raw;
  const id = value.id || value.uid; const host = String(value.url || '').replace(/^https:\/\//, '');
  requireCondition(/^dpl_[A-Za-z0-9]+$/.test(id || '') && /^melodio-[a-z0-9]+-whaleloops-projects\.vercel\.app$/.test(host), 'deployment_scope');
  requireCondition(!value.projectId || value.projectId === projectId, 'deployment_project_scope');
  return { deploymentId: id, url: `https://${host}`, readyState: value.readyState || value.state };
}
function verifyChecks(checks, sourceCommit) {
  requireCondition(checks.sourceCommit === sourceCommit && ['build', 'typecheck', 'tests', 'dataSampleVerification'].every(key => checks[key] === 'passed')
    && checks.structureAdjustedWithoutTiming === true && checks.verseLineCount === 6, 'checks_not_verified');
}
function verifyReceipt(receipt, sourceCommit) {
  requireCondition(receipt.sourceCommit === sourceCommit, 'source_changed');
  const scoped = deployment(JSON.stringify({ id: receipt.deploymentId, url: receipt.url, readyState: receipt.readyState }));
  requireCondition(receipt.previousProductionId === baselineId && receipt.alias === 'https://melodio.app', 'receipt_scope');
  return scoped;
}
async function cli(args) {
  return (await run('vercel', args, { cwd: release, timeout: 55000, maxBuffer: 4 * 1024 * 1024 })).stdout;
}
async function sourceState({ clean = false } = {}) {
  const project = await readJson(path.join(release, '.vercel/project.json'));
  requireCondition(project.projectId === projectId && project.orgId === orgId, 'project_scope');
  const sourceCommit = (await run('git', ['rev-parse', 'HEAD'], { cwd: release, maxBuffer: 1000 })).stdout.trim();
  await run('git', ['merge-base', '--is-ancestor', baselineCommit, sourceCommit], { cwd: release, maxBuffer: 1000 });
  if (clean) requireCondition(!(await run('git', ['status', '--porcelain'], { cwd: release, maxBuffer: 64 * 1024 })).stdout.trim(), 'source_dirty');
  return sourceCommit;
}
async function catalogRows(releaseRoot, source) {
  const ts = require('typescript'); const loaded = {};
  source ||= await fs.readFile(path.join(releaseRoot, 'src/data/vocalStyles.ts'), 'utf8');
  const imports = {};
  for (const filename of ['officialVocalCatalog.json', 'legacyVocalSamples.json']) {
    try { imports[`./${filename}`] = await readJson(path.join(releaseRoot, 'src/data', filename)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', compiled)(name => {
    requireCondition(Object.hasOwn(imports, name), 'catalog_import_scope'); return imports[name];
  }, loaded);
  requireCondition(Array.isArray(loaded.INITIAL_SYSTEM_VOICES), 'catalog_export');
  return loaded.INITIAL_SYSTEM_VOICES;
}
async function verifyDataSamples({ releaseRoot = release, sourceCommit, privateManifestPath = manifestPath, verificationPath = proofPath } = {}) {
  const mapping = await readJson(path.join(releaseRoot, 'src/data/legacyVocalSamples.json'));
  const manifest = await readJson(privateManifestPath); const proof = await readJson(verificationPath);
  requireCondition(manifest.version === 1 && manifest.batch === 'missing-singing-samples-20261006' && manifest.requestCap === 7 && manifest.estimatedCreditCap === 84
    && manifest.selectedVersion === 'A' && manifest.registrationCalls === 0 && manifest.databaseWrites === 0, 'manifest_scope');
  requireCondition(JSON.stringify(Object.keys(mapping).sort()) === JSON.stringify([...IDS].sort())
    && manifest.jobs?.length === 7 && new Set(manifest.jobs.map(job => job.id)).size === 7
    && manifest.jobs.every(job => IDS.includes(job.id)), 'sample_id_scope');
  requireCondition(proof.state === 'passed' && (!proof.sourceCommit || proof.sourceCommit === sourceCommit)
    && proof.records?.length === 7 && new Set(proof.records.map(record => record.id)).size === 7, 'audio_verification_not_passed');
  const rows = await catalogRows(releaseRoot); const records = [];
  for (const id of IDS) {
    const metadata = mapping[id]; const job = manifest.jobs.find(value => value.id === id); const sample = job.sample;
    const record = proof.records.find(value => value.id === id); const matchingRows = rows.filter(row => row.id === id);
    const audioUrl = `/assets/voices/missing-20261006/${id}-A.mp3`;
    requireCondition(job.state === 'complete' && sample?.version === 'A' && sample.clipId === job.clips?.[0]?.id
      && /^[a-f0-9]{64}$/.test(sample.sha256 || '') && /^[a-f0-9]{64}$/.test(sample.originalSha256 || '') && sample.seconds >= 30 && sample.seconds <= 30.15
      && record?.sha256 === sample.sha256 && record.seconds === sample.seconds && record.originalSha256 === sample.originalSha256, 'sample_provenance');
    requireCondition(metadata.audioUrl === audioUrl && metadata.language === ({ ko: 'Korean', en: 'English' })[job.language]
      && metadata.previewStartSeconds === 0 && metadata.sampleDurationSeconds === 30 && metadata.previewStatus === 'ready', 'sample_metadata');
    requireCondition(matchingRows.length === 1 && Object.entries(metadata).every(([key, value]) => matchingRows[0][key] === value)
      && matchingRows[0].sourceType === 'default' && matchingRows[0].category === 'Singing/Music'
      && matchingRows[0].stylePrompt === job.stylePrompt && matchingRows[0].gender === job.gender, 'catalog_sample_binding');
    const data = await fs.readFile(path.join(releaseRoot, 'public', audioUrl));
    requireCondition(data.length >= 10000 && data.length <= 2 * 1024 * 1024 && sha(data) === sample.sha256, 'sample_hash');
    records.push({ id, audioUrl, sha256: sample.sha256, seconds: sample.seconds, bytes: data.length });
  }
  return { records, rows };
}
async function verifyPreservation(rows) {
  const oldSource = (await run('git', ['show', `${baselineCommit}:src/data/vocalStyles.ts`], { cwd: release, maxBuffer: 1024 * 1024 })).stdout;
  const oldRows = await catalogRows(release, oldSource);
  const before = oldRows.find(row => row.id === 'voice-moe-jpop'); const after = rows.find(row => row.id === 'voice-moe-jpop');
  requireCondition(before && after && JSON.stringify(before) === JSON.stringify(after) && after.audioUrl === moePath, 'moe_catalog_changed');
  const beforeAudio = (await run('git', ['show', `${baselineCommit}:public${moePath}`], { cwd: release, encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 })).stdout;
  requireCondition(sha(beforeAudio) === sha(await fs.readFile(path.join(release, 'public', moePath))), 'moe_sample_changed');
  const protectedPaths = ['worker', 'src/app/api/generate', 'src/lib/lyrics', 'src/data/officialVocalCatalog.json', 'src/lib/voice/official-voice-personas.json', 'src/data/discoveryVoices.json', 'src/lib/voice/discovery-voice-personas.json'];
  requireCondition(!(await run('git', ['diff', '--name-only', baselineCommit, '--', ...protectedPaths], { cwd: release, maxBuffer: 64 * 1024 })).stdout.trim(), 'protected_backend_or_catalog_changed');
  return { moeSha256: sha(beforeAudio) };
}
async function verifiedSource(sourceCommit) {
  verifyChecks(await readJson(checksPath), sourceCommit);
  const samples = await verifyDataSamples({ sourceCommit }); await verifyPreservation(samples.rows);
  return samples;
}
async function main() {
  const mode = process.argv[2];
  requireCondition(['inspect', 'deploy', 'status', 'promote'].includes(mode) && process.argv.length === 3, 'invalid_mode');
  const sourceCommit = await sourceState({ clean: mode !== 'inspect' }); let receipt;
  if (mode === 'inspect') {
    const live = deployment(await cli(['inspect', 'https://melodio.app', '--format=json', '--non-interactive']));
    console.log(JSON.stringify({ ...live, sourceCommit, expectedProductionId: baselineId })); return;
  }
  if (mode === 'deploy') {
    const samples = await verifiedSource(sourceCommit);
    const live = deployment(await cli(['inspect', 'https://melodio.app', '--format=json', '--non-interactive']));
    requireCondition(live.deploymentId === baselineId && live.readyState === 'READY', 'production_changed');
    const reserve = await fs.open(receiptPath, 'wx');
    await reserve.writeFile(JSON.stringify({ state: 'candidate_submission_reserved', sourceCommit, previousProductionId: baselineId, alias: 'https://melodio.app', domainPromoted: false, reservedAt: new Date().toISOString() }) + '\n'); await reserve.close();
    const candidate = deployment(await cli(['deploy', '--prod', '--skip-domain', '--yes', '--format=json', '--no-wait', '--non-interactive']));
    receipt = { state: 'candidate_submitted', ...candidate, sourceCommit, previousProductionId: live.deploymentId, alias: 'https://melodio.app', domainPromoted: false,
      submittedAt: new Date().toISOString(), sampleCount: samples.records.length, structureAdjustedWithoutTiming: true, verseLineCount: 6,
      generationProviderCalls: 0, personaRegistrationCalls: 0, databaseWrites: 0, userDataDeleted: 0 };
  } else {
    receipt = await readJson(receiptPath); verifyReceipt(receipt, sourceCommit);
    const candidate = deployment(await cli(['inspect', receipt.url, '--format=json', '--non-interactive']));
    requireCondition(candidate.deploymentId === receipt.deploymentId, 'candidate_changed'); Object.assign(receipt, candidate, { inspectedAt: new Date().toISOString() });
    if (mode === 'promote') {
      await verifiedSource(sourceCommit); requireCondition(receipt.readyState === 'READY', 'candidate_not_ready');
      const smoke = await readJson(path.join(root, 'docs/releases/missing-samples-candidate-20261006.smoke.json'));
      requireCondition(smoke.state === 'passed' && smoke.mode === 'candidate' && smoke.deploymentId === receipt.deploymentId && smoke.sourceCommit === sourceCommit
        && smoke.sampleCount === 7 && smoke.providerCalls === 0 && smoke.userDataMutated === 0 && smoke.checks?.every(check => check.passed), 'candidate_smoke_not_verified');
      const live = deployment(await cli(['inspect', 'https://melodio.app', '--format=json', '--non-interactive']));
      requireCondition([baselineId, receipt.deploymentId].includes(live.deploymentId) && live.readyState === 'READY', 'production_changed');
      if (live.deploymentId !== receipt.deploymentId) await cli(['promote', receipt.url, '--yes', '--non-interactive']);
      const verified = deployment(await cli(['inspect', 'https://melodio.app', '--format=json', '--non-interactive']));
      requireCondition(verified.deploymentId === receipt.deploymentId && verified.readyState === 'READY', 'production_verify');
      Object.assign(receipt, { state: 'production_applied_verified', domainPromoted: true, verifiedAt: new Date().toISOString() });
    }
  }
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ mode, state: receipt.state, deploymentId: receipt.deploymentId, readyState: receipt.readyState, domainPromoted: receipt.domainPromoted, sourceCommit }));
}
module.exports = { root, release, baselineId, baselineCommit, receiptPath, IDS, moePath, sha, readJson, requireCondition, deployment, verifyChecks, verifyReceipt, cli, sourceState, catalogRows, verifyDataSamples, verifyPreservation };
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ category: /^[a-z_]+$/.test(error.message || '') ? error.message : 'release_command_failed' })); process.exitCode = 1; });
