// Original singing auditions only. No persona registration or production catalog writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const provider = require('../worker/suno-provider');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'artifacts/discovery-vocals-v2-20261005');
const MANIFEST = path.join(DIR, 'manifest.json');
const DESIGN = path.join(ROOT, 'docs/research/voice-discovery-v2');
const CAP = 12;
const EXCLUDE = 'speech, spoken introduction, choir, duet, backing vocals, doubled lead, long intro, long instrumental break, heavy reverb, autotune effects, screaming, sound effects, loud instruments';
const CONDITION = 'Korean solo singing audition, 88 BPM, voice starts immediately, extremely quiet piano and bass only, dry intimate foreground lead, short melody centered on the specified vocal register, ordinary intensity, steady pitched core, no high-note climax, no instrumental intro, complete sung phrase ending.';
function write(file, value) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}
function validateProfiles(profiles) {
  if (!Array.isArray(profiles) || profiles.length !== 240) throw new Error('DESIGN_COUNT');
  if (new Set(profiles.map(p => p.id)).size !== 240 || new Set(profiles.map(p => p.stylePrompt?.trim())).size !== 240) throw new Error('DUPLICATE_DESIGN');
  for (const p of profiles) {
    if (!/^discovery-v2-[fm]-\d{3}$/.test(p.id) || !['female', 'male'].includes(p.gender)
      || p.verificationStatus !== 'design_only' || typeof p.stylePrompt !== 'string' || !p.stylePrompt.trim() || p.stylePrompt.length > 650
      || !Array.isArray(p.audibleAnchors) || new Set(p.audibleAnchors).size < 2 || !p.signatureBehavior) throw new Error('INVALID_DESIGN');
  }
}
function eligible(job) { return job.state === 'planned' || job.state === 'throttled'; }
function validateSubmission(manifest, job) {
  if (manifest.requestCap !== CAP || manifest.jobs.length !== CAP || !manifest.jobs.includes(job) || !eligible(job)
    || manifest.jobs.filter(j => j.taskId || ['submitting', 'submission-uncertain'].includes(j.state)).length >= CAP) throw new Error('REQUEST_HELD_OR_CAP');
  const o = job.options;
  if (o.model !== 'V6' || o.instrumental !== false || o.durationSeconds !== 45 || o.personaId || o.personaModel
    || !['f', 'm'].includes(o.vocalGender) || o.style.length >= 1000 || o.exclude !== EXCLUDE) throw new Error('INVALID_REQUEST');
}
function report(m) {
  console.log(JSON.stringify({ jobs: m.jobs.length, states: m.jobs.reduce((a, j) => (a[j.state] = (a[j.state] || 0) + 1, a), {}),
    accepted: m.jobs.filter(j => j.taskId).length, creditsConsumed: m.jobs.reduce((a, j) => a + (j.creditsConsumed || 0), 0),
    samples: m.jobs.reduce((a, j) => a + (j.samples?.length || 0), 0), registeredPersonas: 0 }));
}
async function boundedJson(response) {
  if (!response.ok) throw new Error('STATUS_HTTP');
  const chunks = []; let size = 0;
  for await (const part of response.body) { size += part.length; if (size > 512 * 1024) throw new Error('STATUS_SIZE'); chunks.push(part); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function mediaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !['tempfile.aiquickdraw.com', 'cdn1.suno.ai', 'cdn2.suno.ai'].includes(url.hostname)) throw new Error('MEDIA_HOST');
  return url;
}
function probe(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8', maxBuffer: 1000 });
  const seconds = Number(result.stdout.trim());
  if (result.status !== 0 || !Number.isFinite(seconds)) throw new Error('AUDIO_PROBE');
  return seconds;
}
function ffmpeg(args) {
  const result = spawnSync(require('ffmpeg-static'), ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', maxBuffer: 100_000 });
  if (result.status !== 0) throw new Error('AUDIO_DECODE');
}
function stagedAudioPath(file) {
  return path.join(path.dirname(file), `.${path.basename(file)}.stage-${crypto.randomUUID()}.mp3`);
}
function publishNewFile(staged, file) {
  // A same-directory hard link publishes the complete file atomically and refuses
  // to replace a final artifact. Only this run's new staging link is removed.
  fs.linkSync(staged, file);
  fs.unlinkSync(staged);
}
function ensureAuditionOutputs(clip, files, { probeFile = probe, encode = ffmpeg } = {}) {
  if (!clip?.url) throw new Error('MISSING_AUDIO_URL');
  const sourceSeconds = probeFile(files.original);
  if (!Number.isFinite(sourceSeconds) || sourceSeconds < 30) throw new Error('ORIGINAL_TOO_SHORT');
  function duration(file, min, max) {
    const seconds = probeFile(file);
    if (!Number.isFinite(seconds) || seconds < min || seconds > max) throw new Error('SAMPLE_DURATION');
    return seconds;
  }
  // Inspect every existing final artifact before making anything new. A valid
  // orphan from an interrupted run is reused; an invalid one remains untouched.
  let seconds = fs.existsSync(files.sample) ? duration(files.sample, 30, 30.15) : null;
  let hookSeconds = fs.existsSync(files.hook) ? duration(files.hook, 8, 8.15) : null;
  if (seconds === null) {
    const staged = stagedAudioPath(files.sample);
    encode(['-i', files.original, '-t', '30', '-af', 'loudnorm=I=-18:TP=-1.5:LRA=9,afade=t=out:st=29.8:d=0.2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '160k', staged]);
    seconds = duration(staged, 30, 30.15);
    publishNewFile(staged, files.sample);
  }
  if (hookSeconds === null) {
    const staged = stagedAudioPath(files.hook);
    encode(['-i', files.sample, '-t', '8', '-af', 'afade=t=out:st=7.8:d=0.2', '-codec:a', 'libmp3lame', '-b:a', '160k', staged]);
    hookSeconds = duration(staged, 8, 8.15);
    publishNewFile(staged, files.hook);
  }
  return { seconds, hookSeconds, sha256: crypto.createHash('sha256').update(fs.readFileSync(files.sample)).digest('hex') };
}
async function main() {
  require('@next/env').loadEnvConfig(ROOT, true, { info() {}, error() {} });
  fs.mkdirSync(DIR, { recursive: true });
  const lock = path.join(DIR, 'operation.lock'); fs.mkdirSync(lock);
  try {
    const mode = process.argv[2] || 'plan';
    if (mode === 'plan') {
      if (fs.existsSync(MANIFEST)) throw new Error('PLAN_EXISTS');
      const profiles = ['female', 'male'].flatMap(g => JSON.parse(fs.readFileSync(path.join(DESIGN, `${g}-profiles.json`))));
      validateProfiles(profiles);
      const choices = ['female', 'male'].flatMap(g => JSON.parse(fs.readFileSync(path.join(DESIGN, `first-round-${g}.json`))).selected);
      if (choices.length !== CAP || new Set(choices.map(c => c.id)).size !== CAP) throw new Error('ROUND_COUNT');
      const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/discoveryVoices.json')));
      const selected = choices.map(c => { const p = profiles.find(p => p.id === c.id); if (!p) throw new Error('MISSING_DESIGN'); return p; });
      if (selected.filter(p => p.gender === 'female').length !== 6 || selected.filter(p => p.gender === 'male').length !== 6) throw new Error('ROUND_GENDER');
      const jobs = selected.map(p => {
        const options = { title: `${p.id} audition`, model: 'V6', instrumental: false, vocalGender: p.gender === 'female' ? 'f' : 'm', durationSeconds: 45,
          style: `${p.stylePrompt} ${CONDITION}`, lyrics: catalog.find(v => v.language === 'ko' && v.gender === p.gender).lyricsPrompt, exclude: EXCLUDE };
        if (options.style.length >= 1000) throw new Error('STYLE_LIMIT');
        return { profile: p, id: p.id, gender: p.gender, state: 'planned', options };
      });
      write(MANIFEST, { version: 2, createdAt: new Date().toISOString(), requestCap: CAP, purpose: 'original-singing-audition-not-registration',
        estimate: { previousVerifiedCreditsPerRequest: 12, estimatedMaxCredits: 144, priceNotGuaranteed: true },
        controls: { language: 'ko', bpm: 88, accompaniment: 'quiet piano and bass', lyricsMatchedToSameGenderBaseline: true, melodyMatched: false },
        subjectiveQuality: 'not_reviewed', jobs });
    } else {
      const m = JSON.parse(fs.readFileSync(MANIFEST));
      if (mode === 'submit') {
        const limit = Number(process.argv[3] || 2);
        if (!Number.isInteger(limit) || limit < 1 || limit > CAP) throw new Error('INVALID_LIMIT');
        const config = provider.getKieConfig();
        for (const j of m.jobs.filter(eligible).slice(0, limit)) {
          validateSubmission(m, j); j.state = 'submitting'; j.submittedAt = new Date().toISOString(); write(MANIFEST, m);
          try { const r = await provider.submitKieSunoJob(j.options, config); j.taskId = r.taskId; j.state = 'processing'; }
          catch (e) {
            j.errorCategory = e instanceof provider.SunoProviderError ? `provider-${e.code}` : 'transport-or-config';
            j.state = e instanceof provider.SunoProviderError && e.code === 429 ? 'throttled' : 'submission-uncertain';
            write(MANIFEST, m); throw new Error('SUBMISSION_HELD');
          }
          write(MANIFEST, m); console.log(`${j.id}: accepted`);
        }
      } else if (mode === 'status') {
        const config = provider.getKieConfig();
        for (const j of m.jobs.filter(j => j.taskId && j.state === 'processing')) {
          try {
            const raw = await boundedJson(await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(j.taskId)}`, {
              headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(20_000) }));
            if (Number(raw.code) !== 200) throw new Error('STATUS_CODE');
            const result = provider.normalizeKieSunoStatus(raw, j.taskId);
            j.state = result.state; j.checkedAt = new Date().toISOString();
            j.creditsConsumed = typeof raw.data?.creditsConsumed === 'number' ? raw.data.creditsConsumed : null;
            if (result.state === 'complete') j.clips = result.clips.slice(0, 2).map(c => ({ id: c.id, url: c.audio_url, duration: c.duration }));
            delete j.lastCheck;
          } catch { j.lastCheck = 'read-error'; }
          write(MANIFEST, m);
        }
      } else if (mode === 'collect') {
        const originals = path.join(DIR, 'original'); const samples = path.join(DIR, 'samples');
        fs.mkdirSync(originals, { recursive: true }); fs.mkdirSync(samples, { recursive: true });
        for (const j of m.jobs.filter(j => j.state === 'complete')) {
          j.samples ||= [];
          for (const [index, clip] of (j.clips || []).entries()) {
            const version = index === 0 ? 'A' : 'B';
            if (j.samples.some(s => s.version === version)) continue;
            if (!clip.url) { j.sampleError = 'missing-audio-url'; write(MANIFEST, m); continue; }
            const name = `${j.id}-${version}`; const original = path.join(originals, `${name}.mp3`);
            if (!fs.existsSync(original)) {
              const response = await fetch(mediaUrl(clip.url), { signal: AbortSignal.timeout(60_000) });
              if (!response.ok) throw new Error('DOWNLOAD_HTTP');
              const size = Number(response.headers.get('content-length')); if (size > 30_000_000) throw new Error('DOWNLOAD_SIZE');
              const parts = []; let total = 0;
              for await (const part of response.body) { total += part.length; if (total > 30_000_000) throw new Error('DOWNLOAD_SIZE'); parts.push(part); }
              if (total < 10_000) throw new Error('DOWNLOAD_SIZE');
              const staged = stagedAudioPath(original);
              fs.writeFileSync(staged, Buffer.concat(parts), { flag: 'wx' });
              publishNewFile(staged, original);
            }
            const sample = path.join(samples, `${name}.mp3`); const hook = path.join(samples, `${name}-hook.mp3`);
            const { seconds, hookSeconds, sha256 } = ensureAuditionOutputs(clip, { original, sample, hook });
            j.samples.push({ version, clipId: clip.id, seconds, hookSeconds, sampleUrl: `/samples/${name}.mp3`, hookUrl: `/samples/${name}-hook.mp3`,
              sha256, qualityReview: 'pending' });
            write(MANIFEST, m); console.log(`${name}: decoded 30s/8s audition`);
          }
        }
      } else if (mode !== 'report') throw new Error('UNKNOWN_MODE');
    }
    report(JSON.parse(fs.readFileSync(MANIFEST)));
  } finally { fs.rmdirSync(lock); }
}
module.exports = { validateProfiles, validateSubmission, eligible, mediaUrl, ensureAuditionOutputs, CAP };
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
