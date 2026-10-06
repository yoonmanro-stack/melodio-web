// One explicitly requested Moe audition. Importing this module never reads credentials or calls a provider.
// No apply/deploy mode: publication is staged privately for the release owner to review.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const provider = require('../worker/suno-provider');
const { compileLyricsSections, assertSafeVocalLyrics } = require('../worker/lyrics-policy');
const { mediaUrl, ensureAuditionOutputs } = require('./discovery-vocal-audition-v2.cjs');
const { registerPersonas } = require('./discovery-vocal-rollout-240.cjs');
const { sha, hashFile, read, save, validId, checkStorage } = require('./official-global-v1.cjs');
const { inspectSample } = require('./publish-official-global-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const ID = 'voice-moe-jpop';
const BATCH = 'approved-voice-moe-20261006';
const PRIVATE_DIR = '/private/tmp/melodio-approved-voice-moe-20261006';
const ENV_LOCATOR = '/private/tmp/melodio-artist-signing-env-path-20261006.txt';
const PUBLIC_AUDIO = `/assets/voices/approved-20261006/${ID}-A.mp3`;
const PERSONA_DESCRIPTION = 'Bright agile female singing timbre, focused forward resonance, springy crisp consonants, playful rhythmic phrasing, clear upper-register lift and brief expressive note tails.';
const PROTECTED = ['src/data/vocalStyles.ts', 'src/data/officialVocalCatalog.json',
  'src/lib/voice/official-voice-personas.json', 'src/data/discoveryVoices.json',
  'src/lib/voice/discovery-voice-personas.json'];
const SECTIONS = [
  { type: 'verse', content: '朝の窓辺に　ひかりがはねる\n白いスニーカー　今日を急かす\n小さな迷いは　風にほどいて\nまっすぐな空へ　笑顔を投げる' },
  { type: 'chorus', content: 'きらり　きらり　胸が弾む\nふわり　ふわり　夢が近づく\n君と見つけた　明日の色を\n声にのせたら　世界がひらく' },
];
function profile() {
  const { lyricsPrompt } = compileLyricsSections(SECTIONS);
  assertSafeVocalLyrics(lyricsPrompt);
  return { id: ID, name: 'Moe', provisionalName: 'Moe', gender: 'female', language: 'ja',
    shortDescription: '밝고 탄력 있는 발음의 선명한 J-Pop 보컬',
    description: '밝고 탄력 있는 발음, 가볍게 치고 올라가는 선명한 J-Pop 보컬',
    tags: ['J-Pop', 'Kawaii', 'High-Pitch', 'Energetic'],
    stylePrompt: 'female vocals, bright agile upper-middle register, focused forward resonance, springy crisp consonants, playful rhythmic phrasing, clear head-voice lift, mostly straight notes with brief expressive tails',
    lyricsPrompt };
}
function optionsFor(p = profile()) {
  return { title: 'Moe Japanese singing audition 20261006', model: 'V6', instrumental: false,
    vocalGender: 'f', durationSeconds: 45, lyrics: p.lyricsPrompt,
    style: `${p.stylePrompt}, Japanese J-Pop solo singing audition, 104 BPM, light buoyant melody, voice starts immediately, extremely quiet piano and bass only, dry foreground lead, complete sung ending.`,
    exclude: 'speech, spoken introduction, rap, choir, duet, backing vocals, doubled lead, long intro, long instrumental break, heavy reverb, screaming, sound effects, loud instruments' };
}
function locations(root = ROOT, dir = PRIVATE_DIR) {
  return { root, dir, manifest: path.join(dir, 'manifest.json'), publication: path.join(dir, 'publication'),
    original: path.join(dir, 'originals', `${ID}-A.mp3`), sample: path.join(dir, 'samples', `${ID}-A.mp3`),
    hook: path.join(dir, 'samples', `${ID}-A-hook.mp3`) };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function makeManifest(root = ROOT) {
  const p = profile();
  const catalog = read(path.join(root, PROTECTED[1])), registry = read(path.join(root, PROTECTED[2]));
  if (catalog.some(row => row.id === ID || row.officialVoiceId === ID) || Object.hasOwn(registry, ID)) throw new Error('MOE_ALREADY_REGISTERED');
  return { version: 1, batch: BATCH, createdAt: new Date().toISOString(), requestCap: 1,
    expectedCandidates: 2, selectedVersion: 'A', qualityReview: 'unreviewed', sameSingerGuarantee: false,
    baseline: Object.fromEntries(PROTECTED.map(file => [file, hashFile(path.join(root, file))])),
    jobs: [{ id: ID, profile: p, gender: 'female', language: 'ja', options: optionsFor(p), state: 'planned',
      personaDescription: PERSONA_DESCRIPTION }] };
}
function validateManifest(m) {
  const j = m?.jobs?.[0];
  if (m?.version !== 1 || m.batch !== BATCH || m.requestCap !== 1 || m.expectedCandidates !== 2
    || m.selectedVersion !== 'A' || m.qualityReview !== 'unreviewed' || m.sameSingerGuarantee !== false
    || m.jobs.length !== 1 || j.id !== ID || j.gender !== 'female' || j.language !== 'ja'
    || !same(j.profile, profile()) || !same(j.options, optionsFor())
    || j.personaDescription !== PERSONA_DESCRIPTION || Object.hasOwn(j, 'personaName')
    || !['planned', 'submitting', 'processing', 'complete', 'failed', 'submission-uncertain'].includes(j.state)
    || (j.taskId !== undefined && !validId(j.taskId))
    || PROTECTED.some(file => !/^[a-f0-9]{64}$/.test(m.baseline?.[file] || ''))) throw new Error('MOE_SCOPE_CHANGED');
  assertSafeVocalLyrics(j.options.lyrics);
  if (j.options.style.length > 1000) throw new Error('STYLE_TOO_LONG');
  if (j.requestSha256 && j.requestSha256 !== sha(JSON.stringify(provider.buildKieSunoRequest(j.options)))) throw new Error('REQUEST_PROVENANCE');
}
function assertProtected(m, root = ROOT) {
  for (const file of PROTECTED) if (hashFile(path.join(root, file)) !== m.baseline[file]) throw new Error('BASELINE_CHANGED');
}
function report(m) {
  validateManifest(m); const j = m.jobs[0];
  return { id: ID, state: j.state, acceptedRequests: Number(Boolean(j.taskId)), requestCap: 1,
    observedCandidates: j.clips?.length || 0, sampleReady: Boolean(j.sample), sampleError: j.sampleError || null,
    personaState: j.personaState || 'unsubmitted', qualityReview: 'unreviewed', sameSingerGuarantee: false,
    knownGenerationCredits: Number.isFinite(j.creditsConsumed) ? j.creditsConsumed : null,
    registrationCost: 'unverified', statusError: j.statusError || null };
}
async function boundedJson(response) {
  const parts = []; let bytes = 0;
  for await (const part of response.body) { bytes += part.length; if (bytes > 512 * 1024) throw new Error('PROVIDER_SIZE'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function submit(m, config, { persist, fetchImpl = fetch } = {}) {
  validateManifest(m); const j = m.jobs[0];
  if (typeof persist !== 'function') throw new Error('PERSIST_REQUIRED');
  // An interrupted/unknown response reserves the only request, even if no task ID was received.
  if (j.state !== 'planned' || j.taskId || j.submittedAt) throw new Error('REQUEST_ALREADY_RESERVED');
  const checkedConfig = provider.normalizeKieConfig(config);
  j.state = 'submitting'; j.submittedAt = new Date().toISOString(); j.attemptId = crypto.randomUUID();
  j.requestSha256 = sha(JSON.stringify(provider.buildKieSunoRequest(j.options))); persist(m);
  try {
    const result = await provider.submitKieSunoJob(j.options, checkedConfig, fetchImpl);
    if (!validId(result.taskId)) throw new Error('TASK_ID_INVALID');
    j.taskId = result.taskId; j.state = 'processing';
  } catch (error) {
    j.state = 'submission-uncertain';
    j.errorCategory = error instanceof provider.SunoProviderError ? `provider-${error.code}` : 'transport-or-response';
    persist(m); throw new Error('SUBMISSION_HELD_NO_AUTOMATIC_RETRY');
  }
  persist(m);
}
async function status(m, config, { persist, fetchImpl = fetch } = {}) {
  validateManifest(m); const j = m.jobs[0];
  if (typeof persist !== 'function') throw new Error('PERSIST_REQUIRED');
  if (j.state !== 'processing' || !j.taskId) return;
  try {
    const response = await fetchImpl(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(j.taskId)}`,
      { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(20000) });
    const raw = await boundedJson(response);
    if (!response.ok || Number(raw.code) !== 200) throw new Error('STATUS_HTTP');
    const result = provider.normalizeKieSunoStatus(raw, j.taskId);
    if (result.state === 'complete') {
      if (result.clips.length !== 2) throw new Error('EXPECTED_TWO_CANDIDATES');
      const clips = result.clips.map(clip => {
        if (!validId(clip.id) || clip.id === `${j.taskId}-1` || clip.id === `${j.taskId}-2`) throw new Error('CLIP_ID_REQUIRED');
        mediaUrl(clip.audio_url); return { id: clip.id, url: clip.audio_url, duration: clip.duration };
      });
      if (clips[0].id === clips[1].id || clips[0].url === clips[1].url) throw new Error('CANDIDATES_NOT_DISTINCT');
      j.clips = clips;
    }
    j.state = result.state; j.checkedAt = new Date().toISOString();
    j.creditsConsumed = Number.isFinite(raw.data?.creditsConsumed) ? raw.data.creditsConsumed : null;
    delete j.statusError;
  } catch { j.statusError = 'read-or-response'; }
  persist(m);
}
function firstA(m) {
  validateManifest(m); const j = m.jobs[0], clip = j.clips?.[0];
  if (j.state !== 'complete' || !validId(j.taskId) || j.clips?.length !== 2 || !validId(clip?.id)
    || clip.id === `${j.taskId}-1` || clip.id === j.clips[1]?.id || clip.url === j.clips[1]?.url) throw new Error('FIRST_A_NOT_READY');
  mediaUrl(clip.url); return clip;
}
async function collect(m, p, { persist, fetchImpl = fetch, encode = ensureAuditionOutputs } = {}) {
  const clip = firstA(m), j = m.jobs[0];
  if (typeof persist !== 'function') throw new Error('PERSIST_REQUIRED');
  if (j.sample || j.sampleError) return;
  fs.mkdirSync(path.dirname(p.original), { recursive: true }); fs.mkdirSync(path.dirname(p.sample), { recursive: true });
  try {
    if (!fs.existsSync(p.original)) {
      // Do not follow an unexpected redirect to an unapproved host.
      const response = await fetchImpl(mediaUrl(clip.url), { signal: AbortSignal.timeout(60000), redirect: 'error' });
      mediaUrl(response.url);
      if (!response.ok || Number(response.headers.get('content-length')) > 30_000_000) throw new Error('MEDIA_HTTP');
      const parts = []; let bytes = 0;
      for await (const part of response.body) { bytes += part.length; if (bytes > 30_000_000) throw new Error('MEDIA_SIZE'); parts.push(part); }
      if (bytes < 10000) throw new Error('MEDIA_SIZE');
      const staged = `${p.original}.stage-${crypto.randomUUID()}`;
      fs.writeFileSync(staged, Buffer.concat(parts), { flag: 'wx', mode: 0o600 });
      fs.linkSync(staged, p.original); fs.unlinkSync(staged);
    }
    const output = encode(clip, p);
    j.sample = { version: 'A', clipId: clip.id, ...output, originalSha256: hashFile(p.original), qualityReview: 'unreviewed' };
  } catch (error) { j.sampleError = ['ORIGINAL_TOO_SHORT', 'SAMPLE_DURATION'].includes(error.message) ? error.message : 'media-read-or-decode'; }
  persist(m);
}
function assertSample(m, p, inspect = inspectSample) {
  const clip = firstA(m), j = m.jobs[0], sample = j.sample;
  if (sample?.version !== 'A' || sample.clipId !== clip.id || sample.seconds < 30 || sample.seconds > 30.15
    || !Number.isFinite(sample.seconds) || sample.qualityReview !== 'unreviewed') throw new Error('FIRST_A_SAMPLE_REQUIRED');
  if (hashFile(p.original) !== sample.originalSha256 || hashFile(p.sample) !== sample.sha256) throw new Error('AUDIO_PROVENANCE');
  inspect(p.sample); return clip;
}
async function persona(m, p, config, { persist, fetchImpl = fetch, inspect = inspectSample } = {}) {
  assertSample(m, p, inspect);
  if (typeof persist !== 'function') throw new Error('PERSIST_REQUIRED');
  if (m.jobs[0].personaState || m.jobs[0].personaId || m.jobs[0].personaSubmittedAt) throw new Error('REGISTRATION_ALREADY_RESERVED');
  await registerPersonas(m, provider.normalizeKieConfig(config), { limit: 1, concurrency: 1, timeoutMs: 90000, persist, fetchImpl });
}
function buildPublication(m, p, { inspect = inspectSample } = {}) {
  assertProtected(m, p.root); const clip = assertSample(m, p, inspect), j = m.jobs[0];
  if (j.personaState !== 'ready' || j.personaModel !== 'style_persona' || !validId(j.personaId)
    || j.personaSourceVersion !== 'A' || j.personaTaskId !== j.taskId || j.personaAudioId !== clip.id) throw new Error('REFERENCE_NOT_READY');
  const catalog = read(path.join(p.root, PROTECTED[1])), registry = read(path.join(p.root, PROTECTED[2]));
  const discovery = read(path.join(p.root, PROTECTED[3])), discoveryRegistry = read(path.join(p.root, PROTECTED[4]));
  if (catalog.some(row => row.id === ID || row.officialVoiceId === ID) || Object.hasOwn(registry, ID)
    || [...Object.values(registry), ...Object.values(discoveryRegistry)].includes(j.personaId)) throw new Error('REFERENCE_ALREADY_USED');
  for (const row of [...catalog, ...discovery]) if (row.audioUrl?.startsWith('/assets/voices/')) {
    const file = path.resolve(p.root, 'public', `.${row.audioUrl}`);
    if (!file.startsWith(path.join(p.root, 'public/assets/voices') + path.sep)) throw new Error('CATALOG_AUDIO_PATH');
    if (fs.existsSync(file) && hashFile(file) === j.sample.sha256) throw new Error('REFERENCE_ALREADY_USED');
  }
  const row = { id: ID, officialVoiceId: ID, name: 'Moe', shortDescription: j.profile.shortDescription,
    desc: j.profile.description, gender: 'female', language: 'ja', category: 'Singing/Music',
    tags: [...j.profile.tags], sourceType: 'default', stylePrompt: j.profile.stylePrompt, audioUrl: PUBLIC_AUDIO,
    reviewStatus: 'trial', isFavorite: false, createdAt: m.createdAt, previewStartSeconds: 0, sampleDurationSeconds: 30,
    avatarGradient: 'linear-gradient(135deg, #ec4899, #f43f5e)' };
  return { row, registryAddition: { [ID]: j.personaId }, receipt: { version: 1, id: ID, selectedVersion: 'A',
    sourceTaskSha256: sha(j.taskId), sourceClipSha256: sha(clip.id), personaSha256: sha(j.personaId),
    manifestSha256: sha(JSON.stringify(m)), originalSha256: j.sample.originalSha256, sampleSha256: j.sample.sha256,
    baseline: m.baseline, publicAudioUrl: PUBLIC_AUDIO, referenceReady: true, qualityReview: 'unreviewed', sameSingerGuarantee: false } };
}
function stage(m, p, options) {
  const result = buildPublication(m, p, options);
  fs.mkdirSync(p.publication, { mode: 0o700 });
  save(path.join(p.publication, 'official-row.json'), result.row);
  save(path.join(p.publication, 'server-registry-addition.json'), result.registryAddition);
  save(path.join(p.publication, 'receipt.json'), result.receipt);
  fs.copyFileSync(p.sample, path.join(p.publication, `${ID}-A.mp3`), fs.constants.COPYFILE_EXCL);
}
function selectConfig(production, local = {}) {
  const present = value => typeof value === 'string' && value.trim().length > 0;
  // Only these two existing music-provider fields may fall back. No Supabase or other settings are merged.
  return provider.normalizeKieConfig({
    apiKey: present(production.KIE_API_KEY) ? production.KIE_API_KEY : local.KIE_API_KEY,
    apiBaseUrl: present(production.KIE_API_URL) ? production.KIE_API_URL : local.KIE_API_URL,
  });
}
function loadConfig() {
  const envPath = fs.readFileSync(ENV_LOCATOR, 'utf8').trim();
  if (!path.isAbsolute(envPath) || !fs.statSync(envPath).isFile()) throw new Error('ENV_LOCATOR_UNAVAILABLE');
  const environment = require('dotenv').parse(fs.readFileSync(envPath));
  const missingMusicField = !environment.KIE_API_KEY?.trim() || !environment.KIE_API_URL?.trim();
  const local = missingMusicField ? require('dotenv').parse(fs.readFileSync(path.join(ROOT, '.env.local'))) : {};
  return selectConfig(environment, local);
}
async function main() {
  const mode = process.argv[2] || 'report', p = locations();
  if (process.argv.length > 3 || !['plan', 'report', 'submit', 'status', 'collect', 'persona', 'stage'].includes(mode)) throw new Error('MODE');
  if (mode === 'report') { console.log(JSON.stringify(report(read(p.manifest)))); return; }
  if (mode === 'plan') fs.mkdirSync(p.dir, { recursive: true, mode: 0o700 });
  const lock = path.join(p.dir, 'operation.lock'); fs.mkdirSync(lock);
  try {
    if (mode === 'plan') {
      if (fs.existsSync(p.manifest)) throw new Error('PLAN_EXISTS');
      const m = makeManifest(); m.storageBefore = checkStorage(m); save(p.manifest, m);
      console.log(JSON.stringify(report(m))); return;
    }
    const m = read(p.manifest); validateManifest(m); assertProtected(m);
    const persist = value => save(p.manifest, value);
    m.storageLast = checkStorage(m); persist(m);
    if (mode === 'collect') await collect(m, p, { persist });
    else if (mode === 'stage') stage(m, p);
    else {
      const config = loadConfig();
      if (mode === 'submit') await submit(m, config, { persist });
      else if (mode === 'status') await status(m, config, { persist });
      else await persona(m, p, config, { persist });
    }
    // A staged receipt hashes the manifest. Do not mutate it after creating that receipt.
    if (mode !== 'stage') { m.storageLast = checkStorage(m); persist(m); }
    console.log(JSON.stringify(report(m)));
  } finally { fs.rmdirSync(lock); }
}
module.exports = { ID, BATCH, PRIVATE_DIR, PUBLIC_AUDIO, PROTECTED, SECTIONS, profile, optionsFor, locations, makeManifest,
  validateManifest, assertProtected, report, submit, status, firstA, collect, assertSample, persona, buildPublication, stage, selectConfig };
if (require.main === module) main().catch(error => {
  console.error(/^[A-Z][A-Z0-9_]{2,80}$/.test(error.message) ? error.message : 'MOE_OPERATION_FAILED'); process.exitCode = 1;
});
