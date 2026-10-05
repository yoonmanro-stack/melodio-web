// Bounded, resumable source jobs. Never retry a submission whose result is uncertain.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
require('@next/env').loadEnvConfig(root, true, { info() {}, error() {} });
const provider = require('../worker/suno-provider');
const ffmpeg = require('ffmpeg-static');
const dir = path.join(root, 'artifacts/discovery-vocals-20261005');
const file = path.join(dir, 'manifest.json');
const catalogPath = path.join(root, 'src/data/discoveryVoices.json');
const personaPath = path.join(root, 'src/lib/voice/discovery-voice-personas.json');
let ownsLock = false;
const write = (file, value) => { fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n'); fs.renameSync(file + '.tmp', file); };
const languages = { en: 'English', ko: 'Korean', ja: 'Japanese', fr: 'French' };
function report(m) {
  console.log(JSON.stringify({ states: m.jobs.reduce((a, j) => (a[j.state] = (a[j.state] || 0) + 1, a), {}),
    submitted: m.jobs.filter(j => j.submittedAt).length, creditsConsumed: m.jobs.reduce((a, j) => a + (j.creditsConsumed || 0), 0),
    samples: m.jobs.filter(j => j.sample).length, personas: m.jobs.filter(j => j.personaState === 'ready').length }));
}
async function main() {
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'operation.lock')); ownsLock = true;
  const mode = process.argv[2] || 'plan';
  if (mode === 'plan') {
    if (fs.existsSync(file)) throw new Error('PLAN_EXISTS');
    const catalog = JSON.parse(fs.readFileSync(catalogPath));
    if (catalog.length !== 32 || new Set(catalog.map(v => v.stylePrompt)).size !== 32) throw new Error('CATALOG_INVALID');
    const jobs = catalog.map(v => ({ id: v.id, name: v.name, gender: v.gender, language: v.language,
      stylePrompt: v.stylePrompt, description: v.shortDescription, state: 'planned',
      options: { title: `${v.name} vocal audition`, model: 'V6', instrumental: false, vocalGender: v.gender === 'female' ? 'f' : 'm', durationSeconds: 45,
        style: `${v.stylePrompt} ${languages[v.language]} solo vocal audition, 88 BPM, voice begins immediately, dry intimate foreground singing, extremely quiet piano and bass only, natural pitch and unpolished vocal grain, a complete sung verse and chorus, no instrumental introduction or interlude, finish the last sung phrase.`,
        lyrics: v.lyricsPrompt, exclude: 'spoken greeting, spoken introduction, narration, speech, choir, duet, backing vocals, doubled lead, heavy reverb, loud instruments, long intro' } }));
    write(file, { version: 1, createdAt: new Date().toISOString(), maxRequests: 32,
      historicalPrice: { creditsPerRequest: 12, estimatedUsdPerRequest: 0.06, checkedAt: '2026-10-03', source: 'https://kie.ai/suno-api' }, jobs });
  } else {
    const m = JSON.parse(fs.readFileSync(file));
    if (mode === 'submit') {
      const limit = Number(process.argv[3] || 1);
      if (!Number.isInteger(limit) || limit < 1 || limit > 32) throw new Error('INVALID_LIMIT');
      // First cover every language and gender; then fill the remaining distinct profiles.
      const planned = m.jobs.filter(j => j.state === 'planned' || j.state === 'throttled').sort((a, b) => Number(!a.id.endsWith('1')) - Number(!b.id.endsWith('1')));
      for (const j of planned.slice(0, limit)) {
        if (m.jobs.filter(j => j.submittedAt).length >= m.maxRequests) throw new Error('REQUEST_CAP');
        j.state = 'submitting'; j.submittedAt = new Date().toISOString(); write(file, m);
        try { const r = await provider.submitKieSunoJob(j.options); j.taskId = r.taskId; j.state = 'processing'; }
        catch (e) {
          j.errorCategory = e instanceof provider.SunoProviderError ? `provider-${e.code}` : 'transport-or-config';
          if (e instanceof provider.SunoProviderError && e.code === 429) {
            j.state = 'throttled'; j.rejectedAt = j.submittedAt; delete j.submittedAt;
          } else j.state = 'submission-uncertain';
          write(file, m); throw new Error('SUBMISSION_HELD');
        }
        write(file, m); console.log(`${j.id}: accepted`);
      }
    } else if (mode === 'status') {
      for (const j of m.jobs.filter(j => j.taskId && j.state === 'processing')) {
        try {
          const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(j.taskId)}`, { headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}` }, signal: AbortSignal.timeout(20_000) });
          if (!res.ok) throw new Error('STATUS_HTTP');
          const raw = await res.json(); if (Number(raw.code) !== 200) throw new Error('STATUS_CODE');
          const r = provider.normalizeKieSunoStatus(raw, j.taskId);
          j.state = r.state; j.creditsConsumed = typeof raw.data?.creditsConsumed === 'number' ? raw.data.creditsConsumed : null;
          j.checkedAt = new Date().toISOString();
          if (r.state === 'complete') j.clips = r.clips.map(c => ({ id: c.id, url: c.audio_url, duration: c.duration }));
        } catch { j.lastCheck = 'read-error'; }
        write(file, m);
      }
    } else if (mode === 'collect') {
      fs.mkdirSync(path.join(dir, 'original'), { recursive: true });
      const publicDir = path.join(root, 'public/assets/voices/discovery-20261005'); fs.mkdirSync(publicDir, { recursive: true });
      for (const j of m.jobs.filter(j => j.state === 'complete' && !j.sample)) {
        const clip = j.clips.find(c => c.duration >= 30.2 && c.url);
        if (!clip) { j.sampleError = 'no-complete-30s-window'; write(file, m); continue; }
        const original = path.join(dir, 'original', j.id + '.mp3');
        if (!fs.existsSync(original)) {
          const res = await fetch(clip.url, { signal: AbortSignal.timeout(60_000) });
          if (!res.ok) throw new Error('AUDIO_DOWNLOAD_HTTP');
          const data = Buffer.from(await res.arrayBuffer()); if (data.length < 10_000 || data.length > 30_000_000) throw new Error('AUDIO_SIZE');
          fs.writeFileSync(original, data, { flag: 'wx' });
        }
        const target = path.join(publicDir, j.id + '.mp3');
        if (fs.existsSync(target)) throw new Error('SAMPLE_ALREADY_EXISTS_WITHOUT_RECEIPT');
        const result = spawnSync(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', original, '-t', '30', '-af', 'loudnorm=I=-18:TP=-1.5:LRA=9,afade=t=out:st=29.8:d=0.2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '160k', target], { encoding: 'utf8', maxBuffer: 100_000 });
        if (result.status !== 0) throw new Error('AUDIO_DECODE_OR_TRIM');
        const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', target], { encoding: 'utf8' });
        const seconds = Number(probe.stdout.trim()); if (probe.status !== 0 || seconds < 30 || seconds > 30.15) throw new Error('SAMPLE_DURATION');
        j.sample = { clipId: clip.id, vocalStart: 0, vocalEnd: 30, seconds, sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'), asset: `/assets/voices/discovery-20261005/${j.id}.mp3` };
        write(file, m); console.log(`${j.id}: 30s sample verified`);
      }
    } else if (mode === 'persona') {
      for (const j of m.jobs.filter(j => j.sample && !j.personaState)) {
        j.personaState = 'submitting'; write(file, m);
        try {
          const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', { method: 'POST', headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'ai-music-api/generate-persona', input: { task_id: j.taskId, audio_id: j.sample.clipId, name: j.name, description: j.description,
              vocal_start: j.sample.vocalStart, vocal_end: j.sample.vocalEnd, style: j.stylePrompt.slice(0, 200) } }), signal: AbortSignal.timeout(30_000) });
          const raw = await res.json(), id = raw.data?.persona_id || raw.data?.personaId;
          if (!res.ok || Number(raw.code) !== 200 || typeof id !== 'string' || !/^[A-Za-z0-9_-]{6,160}$/.test(id)) throw new Error('PERSONA_RESULT');
          j.personaId = id; j.personaState = 'ready';
        } catch { j.personaState = 'uncertain'; write(file, m); throw new Error('PERSONA_HELD'); }
        write(file, m); console.log(`${j.id}: persona ready`);
      }
    } else if (mode === 'publish-samples') {
      if (m.jobs.filter(j => j.sample).length !== 32) throw new Error('SAMPLES_NOT_READY');
      const catalog = JSON.parse(fs.readFileSync(catalogPath));
      write(catalogPath, catalog.map(v => ({ ...v, previewStatus: 'ready', reuseStatus: 'pending', audioUrl: m.jobs.find(j => j.id === v.id).sample.asset })));
    } else if (mode === 'publish') {
      if (m.jobs.filter(j => j.sample && j.personaState === 'ready').length !== 32) throw new Error('CATALOG_NOT_READY');
      if (new Set(m.jobs.map(j => j.sample.sha256)).size !== 32) throw new Error('DUPLICATE_SAMPLE');
      const catalog = JSON.parse(fs.readFileSync(catalogPath));
      write(catalogPath, catalog.map(v => ({ ...v, previewStatus: 'ready', reuseStatus: 'ready', audioUrl: m.jobs.find(j => j.id === v.id).sample.asset })));
      write(personaPath, Object.fromEntries(m.jobs.map(j => [j.id, j.personaId])));
    } else throw new Error('UNKNOWN_MODE');
  }
  report(JSON.parse(fs.readFileSync(file)));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => {
  if (ownsLock) fs.rmdirSync(path.join(dir, 'operation.lock'));
});
