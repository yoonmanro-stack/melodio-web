/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline signal tests. Synthetic PCM/FFmpeg fixtures only; no network, provider, or storage calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const ts = require('typescript');
const ffmpeg = require('ffmpeg-static');
const run = promisify(execFile);
const root = path.resolve(__dirname, '..');

function load(relative) {
  const file = path.resolve(root, relative);
  const mod = { exports: {} };
  const source = ts.transpileModule(syncFs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(name => require(name), mod, mod.exports);
  return mod.exports;
}

const { analyzePetPcm, analyzePetAudioRhythm } = load('src/lib/video/audioRhythm.ts');
const sampleRate = 16_000;
function signal(seconds, sample) {
  const values = new Float32Array(seconds * sampleRate);
  for (let index = 0; index < values.length; index++) values[index] = sample(index / sampleRate);
  return values;
}

test('ending QC flags an abruptly cut continuous tone for review', () => {
  const result = analyzePetPcm(signal(6, second => 0.7 * Math.sin(2 * Math.PI * 440 * second)), sampleRate);
  assert.equal(result.ending.status, 'review');
  assert.ok(result.ending.reasons.includes('sustained-energy-at-end'));
  assert.ok(result.ending.terminalRms > 0.4);
});

test('ending QC accepts a resolved decay without claiming semantic lyric completion', () => {
  const result = analyzePetPcm(signal(6, second => {
    const envelope = second < 3.5 ? 0.7 : 0.7 * Math.max(0, ((6 - second) / 2.5) ** 3);
    return envelope * Math.sin(2 * Math.PI * 440 * second);
  }), sampleRate);
  assert.equal(result.ending.status, 'clean');
  assert.deepEqual(result.ending.reasons, ['decaying-ending']);
  assert.ok(result.ending.tailRmsRatio < 0.45);
});

test('ending QC treats a silent recording as a clean signal ending', () => {
  const result = analyzePetPcm(new Float32Array(6 * sampleRate), sampleRate);
  assert.equal(result.ending.status, 'clean');
  assert.deepEqual(result.ending.reasons, ['silent-ending']);
  assert.equal(result.method, 'editorial-fallback');
  assert.equal(result.fallbackReason, 'silent-or-near-silent-audio');
});

test('ending QC reports a measured energy onset close to the terminal boundary', () => {
  const result = analyzePetPcm(signal(6, second => second >= 5.75 ? 0.7 * Math.sin(2 * Math.PI * 880 * second) : 0), sampleRate);
  assert.equal(result.ending.status, 'review');
  assert.ok(result.ending.reasons.includes('energy-onset-near-end'));
});

test('periodic transients produce measured onsets and tempo without inventing a full grid', () => {
  const clicks = signal(8, second => {
    const phase = second % 0.5;
    return phase < 0.02 ? 0.8 * Math.sin(2 * Math.PI * 1000 * phase) : 0;
  });
  const result = analyzePetPcm(clicks, sampleRate);
  assert.equal(result.method, 'energy-autocorrelation');
  assert.ok(result.bpm >= 118 && result.bpm <= 122, String(result.bpm));
  assert.ok(result.confidence >= 0.42);
  assert.ok(result.beatSeconds.length >= 12);
  assert.ok(result.beatSeconds.every(second => result.onsetSeconds.includes(second)));
});

test('FFmpeg decode path analyzes a bounded real audio fixture', async () => {
  assert.ok(ffmpeg, 'ffmpeg-static is required');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-rhythm-test-'));
  const audio = path.join(folder, 'clicks.wav');
  try {
    await run(ffmpeg, [
      '-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i',
      'aevalsrc=if(lt(mod(t\\,0.5)\\,0.02)\\,0.8*sin(2*PI*1000*t)\\,0):s=16000:d=6',
      '-c:a', 'pcm_s16le', audio,
    ], { timeout: 20_000, maxBuffer: 128 * 1024 });
    const result = await analyzePetAudioRhythm(ffmpeg, audio, 6);
    assert.equal(result.method, 'energy-autocorrelation');
    assert.ok(result.onsetSeconds.length >= 10);
    assert.ok(result.bpm >= 118 && result.bpm <= 122, String(result.bpm));
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
