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
const creativeDirection = load('src/lib/dance/creativeDirection.ts');
const musicProfiles = load('src/lib/dance/musicProfiles.ts', { './preset': preset });
const service = load('src/lib/dance/videoService.ts', { './preset': preset, './creativeDirection': creativeDirection, './musicProfiles': musicProfiles,
  './ideas': { validateDanceIdeas: () => { throw Error('IDEAS_FORBIDDEN_IN_MEDIA_TEST'); } },
});
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

test('unsupported output dimensions are rejected before probing clips or launching FFmpeg', async () => {
  const helper = renderer();
  for (const dimensions of [{ width: 720, height: 854 }, { width: 480, height: 1280 }, { width: 1080, height: 1920 }, { width: 0, height: 0 }, { width: NaN, height: 1280 }]) {
    await assert.rejects(helper.concatDanceClips('FFMPEG_FORBIDDEN', ['missing-c1.mp4', 'missing-c2.mp4'], 'missing-output.mp4', dimensions), { code: 'VIDEO_DIMENSIONS' });
  }
});

test('preview rejects missing stored native clips and invalid master hashes before downloads', async () => {
  const helper = renderer();
  const job = { audioUrl: prefix + 'master.wav', audioHash: 'a'.repeat(64), previewClipUrl: prefix + 'native-preview.mp4' };
  await assert.rejects(helper.renderDancePreview({ ...job, previewClipUrl: undefined, previewSourceUrl: 'https://files.x.ai/provider.mp4' }, async () => { throw Error('UPLOAD_FORBIDDEN'); }), { code: 'MISSING_MEDIA' });
  await assert.rejects(helper.renderDancePreview({ ...job, previewClipUrl: 'https://files.x.ai/provider.mp4' }, async () => { throw Error('UPLOAD_FORBIDDEN'); }), { code: 'MEDIA_STORAGE' });
  for (const audioHash of [undefined, '', 'bad-hash', 'A'.repeat(64)]) {
    await assert.rejects(helper.renderDancePreview({ ...job, audioHash }, async () => { throw Error('UPLOAD_FORBIDDEN'); }), { code: 'AUDIO_HASH' });
  }
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

test('real 720p dance output has a 720x1280 canvas, 900 frames and a 30s selected audio track', realMedia, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dance-720p-test-'));
  const file = name => path.join(temp, name);
  try {
    for (const [name, color, size, fps] of [['c1.mp4', 'red', '96x170', 24], ['c2.mp4', 'green', '160x284', 30]]) {
      await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:r=${fps}:d=15`, '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file(name)], { timeout: 20_000, maxBuffer: 128 * 1024 });
    }
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=30', '-ac', '2', '-c:a', 'pcm_s16le', file('audio.wav')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    const assets = new Map(await Promise.all(['c1.mp4', 'c2.mp4', 'audio.wav'].map(async name => [prefix + name, await fs.readFile(file(name))])));
    const helper = renderer(async url => {
      assert.ok(assets.has(url), 'only injected stored fixtures may be downloaded');
      return { buffer: assets.get(url), contentType: url.endsWith('.wav') ? 'audio/wav' : 'video/mp4' };
    });
    const job = { id: 'job', startSeconds: 0, audioUrl: prefix + 'audio.wav', audioHash: hash(assets.get(prefix + 'audio.wav')),
      clip1Url: prefix + 'c1.mp4', clip2Url: prefix + 'c2.mp4', videoSpec: { model: 'grok-imagine-video', resolution: '720p', width: 720, height: 1280 } };
    let uploaded;
    const finalUrl = await helper.renderDanceVideo(job, async (_job, name, buffer, contentType) => {
      assert.equal(contentType, 'video/mp4'); uploaded = buffer; return prefix + name;
    });
    assert.match(finalUrl, /final-captionless-[a-f0-9]{16}\.mp4$/);
    await fs.writeFile(file('final.mp4'), uploaded);
    assert.equal(await legacy.validateLegacyShortOutput(ffmpeg, file('final.mp4')), 30);
    const checksums = (await run(ffmpeg, ['-v', 'error', '-i', file('final.mp4'), '-map', '0:v:0', '-f', 'framecrc', '-'], { timeout: 30_000, maxBuffer: 128 * 1024 })).stdout;
    assert.match(checksums, /#dimensions 0: 720x1280/);
    assert.match(checksums, /#tb 0: 1\/30/);
    const frames = [...checksums.matchAll(/^0,\s*(-?\d+),\s*(-?\d+),\s*(\d+),/gm)];
    assert.equal(frames.length, 900);
    assert.equal(Number(frames[0][2]), 0);
    assert.equal(Number(frames.at(-1)[2]) + Number(frames.at(-1)[3]), 900, 'decoded frame timestamps cover exactly 30s');
    for (const [second, color] of [[1, 'red'], [16, 'green']]) {
      const rgb = (await run(ffmpeg, ['-v', 'error', '-i', file('final.mp4'), '-ss', String(second), '-vf', 'crop=2:2:358:638', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: 'buffer', timeout: 20_000, maxBuffer: 1024 })).stdout;
      assert.ok(color === 'red' ? rgb[0] > 180 && rgb[1] < 50 : rgb[1] > 90 && rgb[0] < 50, `720p clip order at ${second}s`);
    }
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});

test('real preview is 5s at 720x1280 with the first master audio seconds and no native clip audio', realMedia, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dance-preview-test-'));
  const file = name => path.join(temp, name);
  try {
    // A chirp distinguishes the first five seconds from any later master segment.
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.3*sin(2*PI*(200+10*t)*t):s=48000:d=30', '-ac', '2', '-c:a', 'pcm_s16le', file('master.wav')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=96x170:r=24:d=5', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file('native-preview.mp4')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    const master = await fs.readFile(file('master.wav')), native = await fs.readFile(file('native-preview.mp4'));
    const masterHash = hash(master);
    const masterUrl = prefix + 'master.wav', nativeUrl = prefix + 'native-preview.mp4';
    const assets = new Map([[masterUrl, master], [nativeUrl, native]]), downloads = [], uploads = [];
    const helper = renderer(async url => {
      assert.ok(assets.has(url), 'preview rendering uses only stored master and native clip fixtures');
      downloads.push(url); return { buffer: assets.get(url), contentType: url.endsWith('.wav') ? 'audio/wav' : 'video/mp4' };
    });
    const job = { id: 'job', startSeconds: 0, audioUrl: masterUrl, audioHash: masterHash,
      previewSourceUrl: 'https://files.x.ai/offline-provider-preview.mp4', previewClipUrl: nativeUrl,
      videoSpec: { model: 'grok-imagine-video', resolution: '720p', width: 720, height: 1280 } };
    const savedJob = structuredClone(job);
    const previewUrl = await helper.renderDancePreview(job, async (_job, name, buffer, contentType) => {
      assert.equal(contentType, 'video/mp4'); uploads.push(name); await fs.writeFile(file('preview.mp4'), buffer); return prefix + name;
    });
    assert.match(previewUrl, /preview-5s-[a-f0-9]{16}\.mp4$/);
    assert.equal(uploads.length, 1);
    assert.equal(previewUrl, prefix + uploads[0]);
    assert.deepEqual(downloads.sort(), [masterUrl, nativeUrl].sort());
    assert.equal(hash(master), masterHash, 'in-memory 30s master bytes remain unchanged');
    assert.equal(hash(await fs.readFile(file('master.wav'))), masterHash, 'saved 30s master bytes remain unchanged');
    assert.equal(await legacy.probeLegacyShortStream(ffmpeg, file('master.wav'), 'audio'), 30);
    assert.deepEqual(job, savedJob, 'rendering does not alter the master selection or job fields');
    assert.equal(await legacy.probeLegacyShortStream(ffmpeg, file('preview.mp4'), 'video'), 5);
    const streams = (await run(ffmpeg, ['-hide_banner', '-i', file('preview.mp4'), '-t', '0', '-f', 'null', '-'], { timeout: 20_000, maxBuffer: 16 * 1024 })).stderr;
    assert.match(streams, /Video: h264\b/);
    assert.match(streams, /Audio: aac\b[^\n]*48000 Hz, stereo/);
    const checksums = (await run(ffmpeg, ['-v', 'error', '-i', file('preview.mp4'), '-map', '0:v:0', '-f', 'framecrc', '-'], { timeout: 30_000, maxBuffer: 128 * 1024 })).stdout;
    assert.match(checksums, /#dimensions 0: 720x1280/);
    assert.match(checksums, /#tb 0: 1\/30/);
    const frames = [...checksums.matchAll(/^0,\s*(-?\d+),\s*(-?\d+),\s*(\d+),/gm)];
    assert.equal(frames.length, 150);
    assert.equal(Number(frames[0][2]), 0);
    assert.equal(Number(frames.at(-1)[2]) + Number(frames.at(-1)[3]), 150, 'decoded preview frames cover exactly five seconds');
    const source = await decode(file('master.wav')), output = await decode(file('preview.mp4'));
    const expectedBytes = 5 * 48000 * 4;
    assert.ok(output.length >= expectedBytes && output.length <= 5.05 * 48000 * 4, 'preview audio contains only five seconds plus bounded AAC frame padding');
    let error = 0, energy = 0;
    for (let offset = 0; offset < expectedBytes; offset += 4) {
      const expected = source.readFloatLE(offset), actual = output.readFloatLE(offset);
      error += (expected - actual) ** 2; energy += expected ** 2;
    }
    assert.ok(error / energy < 0.005, 'AAC preview matches the first five master seconds and excludes the distinct native clip audio');

    const forbiddenUpload = async () => { throw Error('INVALID_PREVIEW_UPLOAD_FORBIDDEN'); };
    const alteredMaster = Buffer.from(master); alteredMaster[alteredMaster.length - 1] ^= 1;
    assets.set(masterUrl, alteredMaster);
    const hashGuardDownloads = downloads.length;
    await assert.rejects(helper.renderDancePreview(job, forbiddenUpload), { code: 'AUDIO_HASH' });
    assert.deepEqual(downloads.slice(hashGuardDownloads), [masterUrl], 'changed master is rejected before downloading native motion');
    assets.set(masterUrl, master);

    await run(ffmpeg, ['-v', 'error', '-y', '-i', file('master.wav'), '-t', '29', '-c:a', 'pcm_s16le', file('short-master.wav')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    const shortMaster = await fs.readFile(file('short-master.wav')); assets.set(masterUrl, shortMaster);
    const durationGuardDownloads = downloads.length;
    await assert.rejects(helper.renderDancePreview({ ...job, audioHash: hash(shortMaster) }, forbiddenUpload), { code: 'AUDIO_DURATION' });
    assert.deepEqual(downloads.slice(durationGuardDownloads), [masterUrl], 'short master is rejected before downloading native motion');
    assets.set(masterUrl, master);

    await run(ffmpeg, ['-v', 'error', '-y', '-i', file('native-preview.mp4'), '-t', '4', '-an', '-c:v', 'copy', file('short-native.mp4')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    assets.set(nativeUrl, await fs.readFile(file('short-native.mp4')));
    await assert.rejects(helper.renderDancePreview(job, forbiddenUpload), { code: 'PREVIEW_DURATION' });
    assert.equal(uploads.length, 1, 'only the valid five-second preview was uploaded');
    assert.equal(hash(master), masterHash);
    assert.equal(hash(await fs.readFile(file('master.wav'))), masterHash);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
