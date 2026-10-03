/* eslint-disable @typescript-eslint/no-require-imports */
/** Synthetic local media and injected storage only; no provider, database or network calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const { promisify } = require('node:util');
const ts = require('typescript');
const ffmpeg = require('ffmpeg-static');
const run = promisify(execFile);
const root = path.resolve(__dirname, '..');
const storage = 'https://dance-fixture.supabase.co';
const prefix = `${storage}/storage/v1/object/public/melodio-assets/dance_challenge/user/track/job/`;
const hash = buffer => createHash('sha256').update(buffer).digest('hex');

function load(relative, overrides = {}) {
  const source = ts.transpileModule(syncFs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'fetch', source)(
    name => name in overrides ? overrides[name] : require(name), mod, mod.exports,
    { env: { NEXT_PUBLIC_SUPABASE_URL: storage } }, () => { throw Error('NETWORK_FORBIDDEN'); },
  );
  return mod.exports;
}

class FixtureMediaError extends Error { constructor(message, code) { super(message); this.code = code; } }
const legacy = load('src/lib/video/legacyShortExport.ts');
const media = load('src/lib/video/petMedia.ts', { './petPipeline': { PetPipelineError: FixtureMediaError } });
const rhythm = load('src/lib/video/audioRhythm.ts');
const preset = load('src/lib/dance/preset.ts');
const service = load('src/lib/dance/videoService.ts', { './preset': preset });
function renderer(download = async () => { throw Error('NETWORK_FORBIDDEN'); }) {
  return load('src/lib/dance/renderVideo.ts', {
    '../video/petMedia': { ...media, downloadPetMedia: download },
    '../video/petRenderer': { preflightPetRenderer: async () => ({ binary: ffmpeg }), probePetMediaSeconds: legacy.probeLegacyShortStream },
    '../video/audioRhythm': rhythm,
    '../video/legacyShortExport': legacy,
    './preset': preset,
    './videoService': service,
  });
}

test('range, duration and stored-media guards reject unsafe or incomplete inputs', () => {
  const helper = renderer();
  helper.assertDanceAudioRange(10, 40);
  helper.assertDanceClipDuration(15);
  for (const start of [-1, NaN, Infinity, 10.001]) assert.throws(() => helper.assertDanceAudioRange(start, 40), { code: 'AUDIO_RANGE' });
  for (const duration of [29.999, NaN, Infinity]) assert.throws(() => helper.assertDanceAudioRange(0, duration), { code: 'AUDIO_RANGE' });
  for (const duration of [14.9, 14.999, 15.2, NaN]) assert.throws(() => helper.assertDanceClipDuration(duration), { code: 'CLIP_DURATION' });
  assert.equal(helper.assertDanceStoredMedia(`${prefix}audio.wav`, 'audio'), `${prefix}audio.wav`);
  for (const url of ['https://files.x.ai/clip.mp4', `${storage}/storage/v1/object/public/melodio-assets/pet/clip.mp4`]) {
    assert.throws(() => helper.assertDanceStoredMedia(url, 'video'), { code: 'MEDIA_STORAGE' });
  }
  assert.throws(() => helper.assertDanceStoredMedia(undefined, 'audio'), { code: 'MISSING_MEDIA' });
});

const realMedia = { skip: !ffmpeg || !syncFs.existsSync(ffmpeg) };
test('reuse checks the same stored file hash and exact duration without changing or uploading bytes', realMedia, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dance-reuse-test-'));
  try {
    const filename = path.join(temp, 'saved.wav');
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=30', '-ac', '2', '-c:a', 'pcm_s16le', filename], { timeout: 20_000, maxBuffer: 128 * 1024 });
    const saved = await fs.readFile(filename); const before = hash(saved); const downloads = [];
    let supplied = saved;
    const helper = renderer(async url => { downloads.push(url); return { buffer: supplied, contentType: 'audio/wav' }; });
    const selection = { audioUrl: prefix + 'saved.wav', audioHash: before, sourceAudioHash: 'a'.repeat(64), sourceDurationSeconds: 195, startSeconds: 45, durationSeconds: 30 };
    await helper.reuseDanceAudio(selection);
    assert.deepEqual(downloads, [selection.audioUrl]); assert.equal(hash(saved), before);
    supplied = Buffer.from(saved); supplied[supplied.length - 1] ^= 1;
    await assert.rejects(helper.reuseDanceAudio(selection), { code: 'AUDIO_HASH' });
    const count = downloads.length;
    await assert.rejects(helper.reuseDanceAudio({ ...selection, audioUrl: 'https://files.x.ai/audio.wav' }), { code: 'MEDIA_STORAGE' });
    assert.equal(downloads.length, count, 'unsafe storage URL is rejected before a download');
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=29', '-ac', '2', '-c:a', 'pcm_s16le', filename], { timeout: 20_000, maxBuffer: 128 * 1024 });
    supplied = await fs.readFile(filename);
    await assert.rejects(helper.reuseDanceAudio({ ...selection, audioHash: hash(supplied) }), { code: 'AUDIO_DURATION' });
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
const decode = async filename => (await run(ffmpeg, ['-v', 'error', '-i', filename, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { encoding: 'buffer', timeout: 30_000, maxBuffer: 12 * 1024 * 1024 })).stdout;
test('real 30s extraction preserves selected offset, 48k stereo, exact samples and specified fades; bad range creates no output', realMedia, async () => {
  const helper = renderer();
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dance-audio-test-'));
  const file = name => path.join(temp, name);
  try {
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.3+0.2*sin(2*PI*(200+10*t)*t):s=48000:d=40', '-c:a', 'pcm_s16le', file('source.wav')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    assert.equal(await helper.trimDanceAudio(ffmpeg, file('source.wav'), file('selected.wav'), 7.125), 40);
    const source = await decode(file('source.wav')); const selected = await decode(file('selected.wav'));
    assert.equal(selected.length, 30 * 48000 * 4);
    const startSample = 7.125 * 48000;
    // A changing-frequency signal distinguishes this exact offset from another repeated phrase.
    for (let frame = 4800; frame < 29.7 * 48000; frame += 997) {
      assert.ok(Math.abs(selected.readFloatLE(frame * 4) - source.readFloatLE((startSample + frame) * 4)) < 0.00004);
    }
    for (const frame of [0, 960, 1920, 2880, 1430400, 1432800, 1435200, 1437600, 1439999]) {
      const gain = Math.min(1, frame / 3840, (1440000 - frame) / 9600);
      const expected = source.readFloatLE((startSample + frame) * 4) * gain;
      assert.ok(Math.abs(selected.readFloatLE(frame * 4) - expected) < 0.00004, `fade sample ${frame}`);
    }
    const wav = await fs.readFile(file('selected.wav'));
    assert.equal(wav.readUInt16LE(22), 2, 'stereo'); assert.equal(wav.readUInt32LE(24), 48000);
    for (const start of [-0.1, NaN, Infinity, 10.001, 40]) {
      await assert.rejects(helper.trimDanceAudio(ffmpeg, file('source.wav'), file('invalid.wav'), start), { code: 'AUDIO_RANGE' });
      assert.equal(syncFs.existsSync(file('invalid.wav')), false);
    }
    await run(ffmpeg, ['-v', 'error', '-y', '-i', file('source.wav'), '-t', '29.9', file('short.wav')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    await assert.rejects(helper.trimDanceAudio(ffmpeg, file('short.wav'), file('invalid.wav'), 0), { code: 'AUDIO_RANGE' });
    assert.equal(syncFs.existsSync(file('invalid.wav')), false);
    const sourceBytes = await fs.readFile(file('source.wav'));
    let saved;
    const snapshotter = renderer(async () => ({ buffer: sourceBytes, contentType: 'audio/wav' }));
    const snapshot = await snapshotter.snapshotDanceAudio({ id: 'job', startSeconds: 7.125 }, 'https://fixture.suno.ai/source.wav', async (_job, name, buffer, contentType) => {
      assert.match(name, /^audio-30s-[a-f0-9]{16}\.wav$/); assert.equal(contentType, 'audio/wav'); saved = buffer; return prefix + name;
    });
    assert.equal(snapshot.sourceAudioHash, hash(sourceBytes)); assert.equal(snapshot.audioHash, hash(saved));
    assert.equal(snapshot.sourceDurationSeconds, 40); assert.ok(Array.isArray(snapshot.onsetSeconds));
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '195', '-c:a', 'pcm_s16le', file('full-song.wav')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    assert.equal(await helper.trimDanceAudio(ffmpeg, file('full-song.wav'), file('song-tail.wav'), 165), 195, 'full-song probe stays bounded and permits the exact final range');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test('real final frame and 2x15s render preserve ordered visuals and snapshot audio without source clip audio', realMedia, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dance-video-test-'));
  const file = name => path.join(temp, name);
  try {
    // C1 changes color on its final frame at 24 fps, proving the bridge is the actual final frame.
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=96x170:r=24:d=15', '-vf', "drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='gte(n,359)'", '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file('c1.mp4')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=160x284:r=30:d=15', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=15', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file('c2.mp4')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=30', '-ac', '2', '-c:a', 'pcm_s16le', file('audio.wav')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    const assets = new Map(await Promise.all(['c1.mp4', 'c2.mp4', 'audio.wav'].map(async name => [prefix + name, await fs.readFile(file(name))])));
    const helper = renderer(async url => ({ buffer: assets.get(url) || (() => { throw Error('UNEXPECTED_DOWNLOAD'); })(), contentType: url.endsWith('.wav') ? 'audio/wav' : 'video/mp4' }));
    const job = { id: 'job', startSeconds: 0, audioUrl: prefix + 'audio.wav', audioHash: hash(assets.get(prefix + 'audio.wav')), clip1Url: prefix + 'c1.mp4', clip2Url: prefix + 'c2.mp4' };
    const uploads = new Map();
    const upload = async (_job, name, buffer) => { uploads.set(name, buffer); return prefix + name; };
    const bridgeUrl = await helper.extractDanceBridge(job, upload);
    const bridgeName = bridgeUrl.slice(prefix.length); await fs.writeFile(file('bridge.jpg'), uploads.get(bridgeName));
    const pixel = (await run(ffmpeg, ['-v', 'error', '-i', file('bridge.jpg'), '-vf', 'crop=2:2:238:426', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: 'buffer', timeout: 20_000, maxBuffer: 1024 })).stdout;
    assert.ok(pixel[2] > 180 && pixel[0] < 60, 'bridge is blue final frame, not earlier red frame');
    const finalUrl = await helper.renderDanceVideo(job, upload);
    assert.match(finalUrl, /final-captionless-[a-f0-9]{16}\.mp4$/);
    await fs.writeFile(file('final.mp4'), uploads.get(finalUrl.slice(prefix.length)));
    assert.equal(await legacy.validateLegacyShortOutput(ffmpeg, file('final.mp4')), 30);
    const checksums = (await run(ffmpeg, ['-v', 'error', '-i', file('final.mp4'), '-map', '0:v:0', '-f', 'framecrc', '-'], { timeout: 20_000, maxBuffer: 128 * 1024 })).stdout;
    assert.match(checksums, /#dimensions 0: 480x854/); assert.match(checksums, /#tb 0: 1\/30/);
    assert.equal(checksums.split('\n').filter(line => /^0,/.test(line)).length, 900);
    for (const [second, color] of [[1, 'red'], [16, 'green']]) {
      const rgb = (await run(ffmpeg, ['-v', 'error', '-i', file('final.mp4'), '-ss', String(second), '-vf', 'crop=2:2:238:426', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: 'buffer', timeout: 20_000, maxBuffer: 1024 })).stdout;
      assert.ok(color === 'red' ? rgb[0] > 180 && rgb[1] < 50 : rgb[1] > 90 && rgb[0] < 50, `clip order at ${second}s`);
    }
    const original = await decode(file('audio.wav')); const output = await decode(file('final.mp4'));
    let error = 0; let energy = 0;
    for (let offset = 0; offset < original.length; offset += 4) { const a = original.readFloatLE(offset); const b = output.readFloatLE(offset); error += (a-b)**2; energy += a*a; }
    assert.ok(error / energy < 0.005, 'AAC output matches selected audio; provider clip audio is excluded');
    await assert.rejects(helper.renderDanceVideo({ ...job, audioHash: '0'.repeat(64) }, upload), { code: 'AUDIO_HASH' });
    await run(ffmpeg, ['-v', 'error', '-y', '-i', file('c1.mp4'), '-t', '14', '-an', '-c:v', 'copy', file('short.mp4')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    await assert.rejects(helper.concatDanceClips(ffmpeg, [file('short.mp4'), file('c2.mp4')], file('invalid.mp4')), { code: 'CLIP_DURATION' });
    assert.equal(syncFs.existsSync(file('invalid.mp4')), false);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
