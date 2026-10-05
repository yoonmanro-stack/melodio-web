// Stage first; apply only after all 64 first-A samples and personas are ready.
// This publisher appends to the original 27 and never writes Discovery files.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const batch = require('./official-global-v1.cjs');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function inspectSample(file) {
  const duration = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8', maxBuffer: 1000 });
  const seconds = Number(duration.stdout.trim());
  const decode = spawnSync(require('ffmpeg-static'), ['-nostdin', '-hide_banner', '-v', 'error', '-i', file, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 2000 });
  if (duration.status !== 0 || decode.status !== 0 || !Number.isFinite(seconds) || seconds < 30 || seconds > 30.15) throw new Error('SAMPLE_DECODE_OR_DURATION');
  return seconds;
}
function assertOriginalObjects(m, root) {
  const original = batch.read(path.join(root, batch.PROTECTED[0]));
  const registry = batch.read(path.join(root, batch.PROTECTED[1]));
  if (!same(original, m.baseline.catalog) || !same(registry, m.baseline.registry)) throw new Error('ORIGINAL_OBJECTS_CHANGED');
}
function occupiedBindings(m, p) {
  const personas = new Set(Object.values(m.baseline.registry));
  for (const value of Object.values(batch.read(path.join(p.root, batch.PROTECTED[3])))) personas.add(value);
  const hashes = new Set(m.baseline.audioHashes);
  const discovery = batch.read(path.join(p.root, batch.PROTECTED[2]));
  for (const row of discovery) if (row.audioUrl?.startsWith('/assets/voices/')) {
    const file = path.join(p.root, 'public', row.audioUrl.slice(1));
    if (fs.existsSync(file)) hashes.add(batch.hashFile(file));
  }
  const tasks = new Set(), clips = new Set();
  for (const relative of ['docs/diagnostics/official-vocals-20261004/catalog-registration.json',
    'artifacts/discovery-vocals-v2-20261005/rollout-240.json', 'artifacts/discovery-vocals-20261005/manifest.json']) {
    const file = path.join(p.root, relative); if (!fs.existsSync(file)) continue;
    const data = batch.read(file);
    for (const row of data.records || data.jobs || []) {
      if (row.taskId) tasks.add(row.taskId);
      if (row.clipId) clips.add(row.clipId);
      for (const clip of row.clips || []) if (clip.id) clips.add(clip.id);
    }
  }
  for (const { oldJob: old } of m.repairHistory || []) {
    tasks.add(old.taskId); hashes.add(old.sample.sha256);
    for (const clip of old.clips || []) clips.add(clip.id);
    // Preserve every original artifact and verify its archived provenance.
    const stem = batch.sampleStem(old);
    if (batch.hashFile(path.join(p.dir, 'samples', `${stem}.mp3`)) !== old.sample.sha256
      || batch.hashFile(path.join(p.dir, 'original', `${stem}.mp3`)) !== old.sample.originalSha256) throw new Error('ARCHIVED_AUDIO_PROVENANCE');
  }
  return { personas, hashes, tasks, clips };
}
function buildPublication(m, p, { inspect = inspectSample } = {}) {
  batch.validateManifest(m); batch.assertProtected(m, p.root); assertOriginalObjects(m, p.root);
  const occupied = occupiedBindings(m, p), assets = [], rows = [], registry = { ...m.baseline.registry };
  for (const j of m.jobs) {
    const clip = batch.firstA(j), sample = j.sample;
    if (sample?.version !== 'A' || sample.clipId !== clip.id || sample.seconds < 30 || sample.seconds > 30.15
      || j.personaState !== 'ready' || j.personaModel !== 'style_persona' || !batch.validId(j.personaId)
      || j.personaSourceVersion !== 'A' || j.personaAudioId !== clip.id || j.personaTaskId !== j.taskId) throw new Error('REFERENCE_NOT_READY');
    if (occupied.personas.has(j.personaId) || occupied.tasks.has(j.taskId) || occupied.clips.has(clip.id)
      || occupied.hashes.has(sample.sha256) || Object.hasOwn(registry, j.id)) throw new Error('NON_DISTINCT_REFERENCE');
    const stem = batch.sampleStem(j), sampleFile = path.join(p.dir, 'samples', `${stem}.mp3`), original = path.join(p.dir, 'original', `${stem}.mp3`);
    if (batch.hashFile(sampleFile) !== sample.sha256 || batch.hashFile(original) !== sample.originalSha256) throw new Error('AUDIO_PROVENANCE');
    const seconds = inspect(sampleFile);
    occupied.personas.add(j.personaId); occupied.tasks.add(j.taskId); occupied.clips.add(clip.id); occupied.hashes.add(sample.sha256);
    const audioUrl = `/assets/voices/official-global-v1-20261005/${stem}.mp3`;
    assets.push({ id: j.id, source: path.relative(p.root, sampleFile), destination: `public${audioUrl}`, sha256: sample.sha256, seconds });
    const profile = j.profile;
    rows.push({ id: j.id, officialVoiceId: j.id, name: profile.name, shortDescription: profile.shortDescription,
      desc: profile.shortDescription, gender: j.gender, language: j.language, category: 'Singing/Music',
      tags: ['시험 공개', ...profile.tags], audioUrl, sourceType: 'default', stylePrompt: profile.stylePrompt,
      reviewStatus: 'trial', isFavorite: false, createdAt: m.createdAt, previewStartSeconds: 0, sampleDurationSeconds: 30 });
    registry[j.id] = j.personaId;
  }
  const catalog = [...m.baseline.catalog, ...rows];
  if (catalog.length !== 91 || Object.keys(registry).length !== 91 || !same(catalog.slice(0, 27), m.baseline.catalog)
    || Object.entries(m.baseline.registry).some(([key, value]) => registry[key] !== value)) throw new Error('APPEND_INVARIANT');
  return { catalog, registry, assets, receipt: { batch: m.batch, createdAt: new Date().toISOString(),
    originalPreserved: 27, newReferences: 64, catalogTotal: 91, languageGenderAdded: batch.BALANCE,
    selectedVersion: 'A', qualityReview: 'unreviewed', sameSingerGuarantee: false,
    generationCreditsKnown: batch.report(m).generationCreditsKnown, unknownGenerationCosts: batch.report(m).unknownGenerationCosts,
    generatedRequests: batch.report(m).generatedRequests, repairRequests: m.repairHistory?.length || 0,
    estimatedCreditCap: batch.totalCreditCap(m), discoveryUnchanged: true } };
}
function stage(m, p, options) {
  const publication = buildPublication(m, p, options);
  fs.mkdirSync(p.publication, { recursive: true });
  const catalog = path.join(p.publication, 'officialVocalCatalog.json'), registry = path.join(p.publication, 'official-voice-personas.json');
  batch.save(catalog, publication.catalog); batch.save(registry, publication.registry);
  batch.save(path.join(p.publication, 'assets.json'), publication.assets);
  const receipt = { ...publication.receipt, manifestSha256: batch.hashFile(p.manifest),
    catalogSha256: batch.hashFile(catalog), registrySha256: batch.hashFile(registry),
    assetsSha256: batch.hashFile(path.join(p.publication, 'assets.json')) };
  batch.save(path.join(p.publication, 'receipt.json'), receipt);
  return receipt;
}
function apply(m, p) {
  batch.validateManifest(m); batch.assertProtected(m, p.root, { official: false });
  const receipt = batch.read(path.join(p.publication, 'receipt.json'));
  const stagedCatalog = path.join(p.publication, 'officialVocalCatalog.json'), stagedRegistry = path.join(p.publication, 'official-voice-personas.json');
  const assetsFile = path.join(p.publication, 'assets.json');
  if (receipt.manifestSha256 !== batch.hashFile(p.manifest) || receipt.catalogSha256 !== batch.hashFile(stagedCatalog)
    || receipt.registrySha256 !== batch.hashFile(stagedRegistry) || receipt.assetsSha256 !== batch.hashFile(assetsFile)) throw new Error('STAGED_BUNDLE_CHANGED');
  const catalog = batch.read(stagedCatalog), registry = batch.read(stagedRegistry), assets = batch.read(assetsFile);
  if (catalog.length !== 91 || Object.keys(registry).length !== 91 || assets.length !== 64
    || !same(catalog.slice(0, 27), m.baseline.catalog) || Object.entries(m.baseline.registry).some(([id, value]) => registry[id] !== value)) throw new Error('APPEND_INVARIANT');
  const targetCatalog = path.join(p.root, batch.PROTECTED[0]), targetRegistry = path.join(p.root, batch.PROTECTED[1]);
  const catalogAlready = batch.hashFile(targetCatalog) === receipt.catalogSha256;
  const registryAlready = batch.hashFile(targetRegistry) === receipt.registrySha256;
  if ((!catalogAlready && batch.hashFile(targetCatalog) !== m.baseline.hashes[batch.PROTECTED[0]])
    || (!registryAlready && batch.hashFile(targetRegistry) !== m.baseline.hashes[batch.PROTECTED[1]])) throw new Error('TARGET_CHANGED');
  // Exact staged hashes allow recovery after interruption between the two files.
  for (const asset of assets) {
    const job = m.jobs.find(j => j.id === asset.id), stem = job ? batch.sampleStem(job) : null;
    if (!stem || asset.destination !== `public/assets/voices/official-global-v1-20261005/${stem}.mp3`
      || asset.source !== `artifacts/official-global-v1-20261005/samples/${stem}.mp3`) throw new Error('ASSET_PATH');
    const source = path.join(p.root, asset.source), target = path.join(p.root, asset.destination);
    if (batch.hashFile(source) !== asset.sha256) throw new Error('SOURCE_CHANGED');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) { if (batch.hashFile(target) !== asset.sha256) throw new Error('EXISTING_ASSET_CHANGED'); }
    else fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
  const copyExact = (source, target) => {
    const temp = `${target}.official-global-v1.tmp`;
    if (fs.existsSync(temp)) { if (batch.hashFile(temp) !== batch.hashFile(source)) throw new Error('STAGING_FILE_CONFLICT'); }
    else fs.copyFileSync(source, temp, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temp, target);
  };
  if (!registryAlready) copyExact(stagedRegistry, targetRegistry);
  if (!catalogAlready) copyExact(stagedCatalog, targetCatalog);
  batch.assertProtected(m, p.root, { official: false });
  const result = { catalog: 91, originalPreserved: 27, newReferences: 64, discoveryUnchanged: true,
    appliedAt: new Date().toISOString(), catalogSha256: batch.hashFile(targetCatalog), registrySha256: batch.hashFile(targetRegistry) };
  batch.save(path.join(p.publication, 'applied.json'), result); return result;
}
function main() {
  const p = batch.locations(), mode = process.argv[2] || 'stage';
  const lock = path.join(p.dir, 'operation.lock'); fs.mkdirSync(lock);
  try {
    const m = batch.read(p.manifest);
    if (mode === 'stage') console.log(JSON.stringify(stage(m, p)));
    else if (mode === 'apply') console.log(JSON.stringify(apply(m, p)));
    else throw new Error('PUBLISH_MODE');
  } finally { fs.rmdirSync(lock); }
}
module.exports = { buildPublication, stage, apply, inspectSample };
if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
