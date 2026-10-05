// New official vocal references only. Never reads designs from Discovery.
// Commands are explicit; importing this module performs no I/O or provider calls.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const provider = require('../worker/suno-provider');
const { mediaUrl, ensureAuditionOutputs } = require('./discovery-vocal-audition-v2.cjs');
const { registerPersonas } = require('./discovery-vocal-rollout-240.cjs');
const { buildProfiles } = require('./official-global-v1-profiles.cjs');

const ROOT = path.resolve(__dirname, '..');
const CAP = 64;
const UNIT_CREDITS = 12;
const BALANCE = { 'en/female': 8, 'en/male': 8, 'ja/female': 12, 'ja/male': 12, 'fr/female': 12, 'fr/male': 12 };
const LANGUAGES = { en: 'English', ja: 'Japanese', fr: 'French' };
const EXCLUDE = 'speech, spoken introduction, choir, duet, backing vocals, doubled lead, long intro, long instrumental break, heavy reverb, autotune effects, screaming, sound effects, loud instruments';
const PROTECTED = ['src/data/officialVocalCatalog.json', 'src/lib/voice/official-voice-personas.json',
  'src/data/discoveryVoices.json', 'src/lib/voice/discovery-voice-personas.json'];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = file => sha(fs.readFileSync(file));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{6,160}$/.test(value);
function locations(root = ROOT) {
  const dir = path.join(root, 'artifacts/official-global-v1-20261005');
  return { root, dir, manifest: path.join(dir, 'manifest.json'), publication: path.join(dir, 'publication') };
}
function save(file, value) {
  const staged = `${file}.tmp-${crypto.randomUUID()}`;
  fs.writeFileSync(staged, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(staged, file);
}
function optionsFor(profile) {
  return { title: `${profile.name} vocal audition`, model: 'V6', instrumental: false,
    vocalGender: profile.gender === 'female' ? 'f' : 'm', durationSeconds: 45,
    style: `${profile.stylePrompt} ${LANGUAGES[profile.language]} solo singing audition, ${profile.bpm || 88} BPM, voice starts immediately, extremely quiet piano and bass only, dry foreground lead, comfortable register, ordinary intensity, no high-note climax, complete sung ending.`,
    lyrics: profile.lyricsPrompt, exclude: EXCLUDE };
}
function validateProfiles(profiles) {
  if (!Array.isArray(profiles) || profiles.length !== CAP) throw new Error('PROFILE_COUNT');
  const ids = new Set(), names = new Set(), prompts = new Set(), counts = {};
  for (const p of profiles) {
    const key = `${p.language}/${p.gender}`;
    if (!BALANCE[key] || !new RegExp(`^melodio-global-v1-${p.language}-${p.gender === 'female' ? 'f' : 'm'}\\d{2}$`).test(p.id)
      || typeof p.name !== 'string' || !p.name.trim() || typeof p.shortDescription !== 'string' || !p.shortDescription.trim()
      || typeof p.stylePrompt !== 'string' || p.stylePrompt.length < 80 || p.stylePrompt.length > 650
      || typeof p.lyricsPrompt !== 'string' || p.lyricsPrompt.length < 100 || p.lyricsPrompt.length > 5000
      || !p.lyricsPrompt.includes('[Verse]') || !p.lyricsPrompt.includes('[Chorus]')
      || /[\uac00-\ud7a3]/.test(p.lyricsPrompt) || !Array.isArray(p.tags) || p.tags.length < 2
      || optionsFor(p).style.length >= 1000) throw new Error('PROFILE_INVALID');
    if (p.language === 'ja' && !/[\u3040-\u30ff]/.test(p.lyricsPrompt)) throw new Error('JAPANESE_LYRICS_REQUIRED');
    if (p.language !== 'ja' && /[\u3040-\u30ff\u4e00-\u9fff]/.test(p.lyricsPrompt)) throw new Error('LYRICS_LANGUAGE');
    if (ids.has(p.id) || names.has(p.name) || prompts.has(p.stylePrompt)) throw new Error('PROFILE_DUPLICATE');
    ids.add(p.id); names.add(p.name); prompts.add(p.stylePrompt); counts[key] = (counts[key] || 0) + 1;
  }
  for (const [key, expected] of Object.entries(BALANCE)) if (counts[key] !== expected) throw new Error('PROFILE_BALANCE');
}
function baseline(root) {
  const catalog = read(path.join(root, PROTECTED[0])), registry = read(path.join(root, PROTECTED[1]));
  if (catalog.length !== 27 || Object.keys(registry).length !== 27 || new Set(catalog.map(row => row.id)).size !== 27
    || catalog.some(row => !validId(registry[row.id]) || row.officialVoiceId !== row.id || row.sourceType !== 'default')) throw new Error('ORIGINAL_27_REQUIRED');
  return { catalog, registry, hashes: Object.fromEntries(PROTECTED.map(file => [file, hashFile(path.join(root, file))])),
    audioHashes: catalog.map(row => hashFile(path.join(root, 'public', row.audioUrl.replace(/^\//, '')))) };
}
function plan(root = ROOT) {
  const p = locations(root);
  if (fs.existsSync(p.manifest)) throw new Error('PLAN_EXISTS');
  const profiles = buildProfiles(); validateProfiles(profiles);
  const original = baseline(root);
  const jobs = profiles.map(profile => ({ id: profile.id, profile, gender: profile.gender, language: profile.language,
    options: optionsFor(profile), state: 'planned', personaDescription: profile.stylePrompt.slice(0, 195) }));
  const m = { version: 1, batch: 'official-global-v1-20261005', createdAt: new Date().toISOString(),
    scope: '64 new official sampled voices; original 27 and Discovery remain unchanged', requestCap: CAP,
    estimatedCreditCap: CAP * UNIT_CREDITS, estimatedCreditsPerRequest: UNIT_CREDITS, estimatedUsd: 3.84,
    pricingEvidence: 'docs/research/voice-discovery-v2/cost-verification.json', priceNotGuaranteed: true,
    selectedVersion: 'A', qualityReview: 'unreviewed', sameSingerGuarantee: false,
    profileSpecSha256: sha(JSON.stringify(profiles)), baseline: original, jobs };
  fs.mkdirSync(p.dir, { recursive: true }); save(p.manifest, m); return m;
}
function validateManifest(m) {
  if (m?.batch !== 'official-global-v1-20261005' || m.requestCap !== CAP || m.estimatedCreditCap !== 768
    || m.selectedVersion !== 'A' || m.jobs?.length !== CAP || m.baseline?.catalog?.length !== 27) throw new Error('BATCH_SCOPE');
  validateProfiles(m.jobs.map(j => j.profile));
  if (sha(JSON.stringify(m.jobs.map(j => j.profile))) !== m.profileSpecSha256) throw new Error('PROFILE_SPEC_CHANGED');
  const history = m.repairHistory || [];
  if (!Array.isArray(history) || history.length > 4 || (m.repairRequestCap !== undefined
    && (!Number.isInteger(m.repairRequestCap) || m.repairRequestCap < 1 || m.repairRequestCap > 4))
    || history.length > (m.repairRequestCap || 0) || (m.repairRequestCap !== undefined && history.length === 0)) throw new Error('REPAIR_SCOPE');
  const repaired = new Set();
  for (const entry of history) {
    const current = m.jobs.find(j => j.id === entry?.id), old = entry?.oldJob;
    if (!current || !old || entry.id !== old.id || entry.revision !== 1 || entry.reason !== 'persona-provider-rejected'
      || repaired.has(entry.id) || !repairEligible(old) || current.repairRevision !== 1
      || JSON.stringify(current.profile) !== JSON.stringify(old.profile)
      || JSON.stringify(current.options) !== JSON.stringify(old.options)) throw new Error('REPAIR_HISTORY');
    repaired.add(entry.id);
  }
  for (const j of m.jobs) if (Object.hasOwn(j, 'repairRevision') && (j.repairRevision !== 1 || !repaired.has(j.id))) throw new Error('REPAIR_REVISION');
  const tasks = new Set();
  for (const j of generationJobs(m)) {
    if (j.id !== j.profile.id || j.gender !== j.profile.gender || j.language !== j.profile.language
      || JSON.stringify(j.options) !== JSON.stringify(optionsFor(j.profile))) throw new Error('REQUEST_CHANGED');
    if (j.taskId && (!validId(j.taskId) || tasks.has(j.taskId))) throw new Error('TASK_ID_INVALID_OR_DUPLICATE');
    if (j.taskId) tasks.add(j.taskId);
  }
}
function generationJobs(m) { return [...m.jobs, ...(m.repairHistory || []).map(entry => entry.oldJob)]; }
function repairEligible(job) {
  const proof = job?.personaTerminalFailureVerified;
  const verifiedFinal500 = job?.id === 'melodio-global-v1-ja-f04' && job.personaProviderCode === 500
    && job.personaCorrectiveRetry === 1 && job.personaAttemptHistory?.length === 1
    && proof?.id === job.id && proof.attemptId === job.personaAttemptId && validId(proof.requestTaskId)
    && proof.returnedTaskId === proof.requestTaskId && proof.sourceTaskId === job.taskId && proof.audioId === job.sample?.clipId
    && proof.http === 200 && Number(proof.code) === 200 && proof.state === 'fail' && String(proof.failCode) === '500'
    && proof.model === 'ai-music-api/generate-persona' && proof.sourceMatches === true && proof.personaId == null
    && /internal error/i.test(proof.reason || '') && /^[a-f0-9]{64}$/.test(proof.responseSha256 || '')
    && Number.isFinite(Date.parse(proof.checkedAt));
  return job?.state === 'complete' && validId(job.taskId) && !Object.hasOwn(job, 'repairRevision')
    && ['uncertain', 'held'].includes(job.personaState) && job.personaHttpStatus === 200 && (job.personaProviderCode === 400 || verifiedFinal500)
    && job.personaErrorCategory === 'provider_error' && !Object.hasOwn(job, 'personaId')
    && job.sample?.version === 'A' && validId(job.clips?.[0]?.id) && job.clips[0].id !== `${job.taskId}-1`
    && job.sample.clipId === job.clips[0].id;
}
function sampleStem(job) {
  if (Object.hasOwn(job, 'repairRevision') && job.repairRevision !== 1) throw new Error('REPAIR_REVISION');
  return `${job.id}-A${job.repairRevision === 1 ? '-r1' : ''}`;
}
function totalCreditCap(m) { return m.estimatedCreditCap + (m.repairRequestCap || 0) * UNIT_CREDITS; }
function assertProtected(m, root = ROOT, { official = true } = {}) {
  for (const file of PROTECTED.filter((_, index) => official || index >= 2)) {
    if (m.baseline.hashes[file] !== hashFile(path.join(root, file))) throw new Error('PROTECTED_CATALOG_CHANGED');
  }
}
function report(m) {
  const states = {}, personas = {};
  const accounting = generationJobs(m);
  for (const j of m.jobs) { states[j.state] = (states[j.state] || 0) + 1; personas[j.personaState || 'unsubmitted'] = (personas[j.personaState || 'unsubmitted'] || 0) + 1; }
  return { total: m.jobs.length, states, personas, accepted: m.jobs.filter(j => j.taskId).length,
    samples: m.jobs.filter(j => j.sample?.version === 'A').length,
    generatedRequests: accounting.filter(j => j.taskId).length, repairRequests: m.repairHistory?.length || 0,
    generationCreditsKnown: accounting.reduce((sum, j) => sum + (Number.isFinite(j.creditsConsumed) ? j.creditsConsumed : 0), 0),
    unknownGenerationCosts: accounting.filter(j => (j.taskId || (j.submittedAt && j.state !== 'rejected-throttled')) && !Number.isFinite(j.creditsConsumed)).length,
    reservedGenerationCredits: reservedCredits(m), estimatedCreditCap: totalCreditCap(m), qualityReview: m.qualityReview };
}
function reservedCredits(m) {
  return generationJobs(m).reduce((total, j) => total + (j.submittedAt || j.taskId || ['submitting', 'submission-uncertain', 'rejected-throttled'].includes(j.state)
    ? Math.max(UNIT_CREDITS, Number.isFinite(j.creditsConsumed) ? j.creditsConsumed : 0) : 0), 0);
}
function assertNextRequestBudget(m) {
  if (generationJobs(m).some(j => Number.isFinite(j.creditsConsumed) && j.creditsConsumed > UNIT_CREDITS)) throw new Error('CREDIT_UNIT_COST_DRIFT');
  if (reservedCredits(m) + UNIT_CREDITS > totalCreditCap(m)) throw new Error('CREDIT_RESERVATION_CAP');
}
function storageSnapshot(root = ROOT) {
  const stats = fs.statfsSync(root);
  const result = spawnSync('du', ['-sk', path.join(os.homedir(), '.codex/sessions')], { encoding: 'utf8', maxBuffer: 1000 });
  const kilobytes = Number((result.stdout || '').trim().split(/\s+/)[0]);
  if (result.status !== 0 || !Number.isFinite(kilobytes)) throw new Error('SESSION_STORAGE_CHECK');
  return { checkedAt: new Date().toISOString(), freeBytes: Number(stats.bavail) * Number(stats.bsize), sessionAllocatedBytes: kilobytes * 1024 };
}
function checkStorage(m, root = ROOT) {
  const current = storageSnapshot(root), first = m.storageBefore;
  if (current.freeBytes < 30 * 1024 ** 3) throw new Error('MEDIA_STORAGE_BELOW_30_GIB');
  if (first && current.sessionAllocatedBytes - first.sessionAllocatedBytes > 5 * 1024 ** 3) throw new Error('SESSION_GROWTH_ABOVE_5_GIB');
  return current;
}
async function boundedJson(response) {
  const parts = []; let bytes = 0;
  for await (const part of response.body) { bytes += part.length; if (bytes > 512 * 1024) throw new Error('PROVIDER_SIZE'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function submit(m, config, { limit = 6, persist, fetchImpl = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  validateManifest(m);
  if (!Number.isInteger(limit) || limit < 1 || limit > CAP || typeof persist !== 'function') throw new Error('SUBMIT_OPTIONS');
  if (m.jobs.some(j => ['submitting', 'submission-uncertain'].includes(j.state))) throw new Error('UNCERTAIN_SUBMISSION_HELD');
  for (const j of m.jobs.filter(j => j.state === 'planned' && !j.taskId && !j.submittedAt).slice(0, limit)) {
    if (generationJobs(m).filter(job => job.submittedAt || job.taskId).length >= CAP + (m.repairRequestCap || 0)) throw new Error('REQUEST_CAP');
    assertNextRequestBudget(m);
    j.state = 'submitting'; j.submittedAt = new Date().toISOString(); j.attemptId = crypto.randomUUID();
    j.requestSha256 = sha(JSON.stringify(provider.buildKieSunoRequest(j.options))); persist(m);
    try {
      const result = await provider.submitKieSunoJob(j.options, config, fetchImpl);
      if (!validId(result.taskId) || generationJobs(m).some(other => other !== j && other.taskId === result.taskId)) throw new Error('TASK_ID_INVALID');
      j.taskId = result.taskId; j.state = 'processing';
    } catch (error) {
      j.state = error instanceof provider.SunoProviderError && error.code === 429 ? 'rejected-throttled' : 'submission-uncertain';
      j.errorCategory = error instanceof provider.SunoProviderError ? `provider-${error.code}` : 'transport-or-response';
      persist(m); throw new Error('SUBMISSION_HELD_NO_AUTOMATIC_RETRY');
    }
    persist(m); await pause(550);
  }
}
async function status(m, config, { persist, fetchImpl = fetch } = {}) {
  validateManifest(m);
  for (const j of m.jobs.filter(j => j.taskId && j.state === 'processing')) {
    try {
      const response = await fetchImpl(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(j.taskId)}`,
        { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(20000) });
      const raw = await boundedJson(response); if (!response.ok || Number(raw.code) !== 200) throw new Error('STATUS_HTTP');
      const result = provider.normalizeKieSunoStatus(raw, j.taskId);
      j.state = result.state; j.checkedAt = new Date().toISOString();
      j.creditsConsumed = Number.isFinite(raw.data?.creditsConsumed) ? raw.data.creditsConsumed : null;
      if (result.state === 'complete') j.clips = result.clips.slice(0, 2).map(clip => ({ id: clip.id, url: clip.audio_url, duration: clip.duration }));
      delete j.statusError;
    } catch { j.statusError = 'read-or-response'; }
    persist(m);
  }
}
function firstA(job) {
  const clip = job.clips?.[0];
  if (job.state !== 'complete' || !validId(clip?.id) || clip.id === `${job.taskId}-1` || !clip.url) throw new Error('FIRST_A_NOT_READY');
  mediaUrl(clip.url); return clip;
}
async function collect(m, p, { limit = CAP, persist, fetchImpl = fetch } = {}) {
  validateManifest(m);
  for (const folder of ['original', 'samples']) fs.mkdirSync(path.join(p.dir, folder), { recursive: true });
  for (const j of m.jobs.filter(j => j.state === 'complete' && !j.sample && !j.sampleError).slice(0, limit)) {
    try {
      const clip = firstA(j), filename = `${sampleStem(j)}.mp3`, original = path.join(p.dir, 'original', filename);
      if (!fs.existsSync(original)) {
        const response = await fetchImpl(mediaUrl(clip.url), { signal: AbortSignal.timeout(60000) }); mediaUrl(response.url);
        if (!response.ok || Number(response.headers.get('content-length')) > 30_000_000) throw new Error('MEDIA_HTTP');
        const parts = []; let bytes = 0;
        for await (const part of response.body) { bytes += part.length; if (bytes > 30_000_000) throw new Error('MEDIA_SIZE'); parts.push(part); }
        if (bytes < 10000) throw new Error('MEDIA_SIZE');
        const staged = `${original}.stage-${crypto.randomUUID()}`;
        fs.writeFileSync(staged, Buffer.concat(parts), { flag: 'wx' }); fs.linkSync(staged, original); fs.unlinkSync(staged);
      }
      const output = ensureAuditionOutputs(clip, { original, sample: path.join(p.dir, 'samples', filename), hook: path.join(p.dir, 'samples', `${sampleStem(j)}-hook.mp3`) });
      j.sample = { version: 'A', clipId: clip.id, ...output, originalSha256: hashFile(original), qualityReview: 'unreviewed' };
    } catch (error) { j.sampleError = ['ORIGINAL_TOO_SHORT', 'SAMPLE_DURATION', 'FIRST_A_NOT_READY'].includes(error.message) ? error.message : 'media-read-or-decode'; }
    persist(m);
  }
}
async function personas(m, config, { limit = 6, persist, fetchImpl = fetch, pause, continueOnHeld = false } = {}) {
  validateManifest(m);
  if (typeof continueOnHeld !== 'boolean') throw new Error('PERSONA_CONTINUATION');
  if (!continueOnHeld && m.jobs.some(j => ['uncertain', 'submitting', 'held'].includes(j.personaState))) throw new Error('UNCERTAIN_PERSONA_HELD');
  // Reuse the receipt/timeout implementation only, never the Discovery manifest.
  // Held states stay intact; the engine selects only jobs with no personaState.
  const adapted = { ...m, ...(m.repairHistory ? { replacementHistory: m.repairHistory } : {}),
    jobs: m.jobs.map(j => ({ ...j, profile: { ...j.profile, provisionalName: j.profile.name } })) };
  const persistAdapted = value => { m.jobs = value.jobs.map(j => { const profile = { ...j.profile }; delete profile.provisionalName; return { ...j, profile }; }); persist(m); };
  await registerPersonas(adapted, config, { limit, concurrency: 4, timeoutMs: 90000, continueOnHeld, fetchImpl, persist: persistAdapted, ...(pause ? { pause } : {}) });
}
function personaContinuation(mode, flags) {
  if (flags.length === 0) return false;
  if (mode !== 'persona' || flags.length !== 1 || flags[0] !== '--continue-held') throw new Error('CONTINUATION_FLAG');
  return true;
}
async function main() {
  const mode = process.argv[2] || 'report', p = locations();
  const continueOnHeld = personaContinuation(mode, process.argv.slice(4));
  if (mode === 'report') { const m = read(p.manifest); validateManifest(m); console.log(JSON.stringify(report(m))); return; }
  if (!['plan', 'submit', 'status', 'collect', 'persona'].includes(mode)) throw new Error('MODE');
  const limit = Number(process.argv[3] || (mode === 'collect' ? CAP : 6));
  if (!Number.isInteger(limit) || limit < 1 || limit > CAP) throw new Error('LIMIT');
  if (mode === 'plan') fs.mkdirSync(p.dir, { recursive: true });
  const lock = path.join(p.dir, 'operation.lock'); fs.mkdirSync(lock);
  try {
    if (mode === 'plan') { const m = plan(); m.storageBefore = checkStorage(m); save(p.manifest, m); console.log(JSON.stringify(report(m))); return; }
    // Read only after acquiring the lock: another completed command may have
    // already charged requests which looked planned before lock acquisition.
    const m = read(p.manifest); validateManifest(m); assertProtected(m);
    const persist = value => save(p.manifest, value);
    m.storageBefore ||= checkStorage(m); m.storageLast = checkStorage(m); persist(m);
    if (mode === 'collect') await collect(m, p, { limit, persist });
    else {
      require('@next/env').loadEnvConfig(ROOT, true, { info() {}, error() {} });
      const config = provider.getKieConfig();
      if (mode === 'submit') await submit(m, config, { limit, persist });
      else if (mode === 'status') await status(m, config, { persist });
      else await personas(m, config, { limit, persist, continueOnHeld });
    }
    m.storageLast = checkStorage(m); persist(m);
    console.log(JSON.stringify(report(m)));
  } finally { fs.rmdirSync(lock); }
}
module.exports = { ROOT, CAP, BALANCE, PROTECTED, locations, sha, hashFile, read, save, validId, optionsFor,
  validateProfiles, plan, validateManifest, assertProtected, report, reservedCredits, assertNextRequestBudget,
  generationJobs, repairEligible, sampleStem, totalCreditCap, storageSnapshot, checkStorage,
  submit, status, firstA, collect, personas, personaContinuation };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
