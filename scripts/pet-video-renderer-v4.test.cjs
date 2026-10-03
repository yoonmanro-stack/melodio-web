/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline v4/legacy renderer integration. Synthetic media only; no network, model, paid, or production calls. */
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
const run = promisify(execFile);
const root = path.resolve(__dirname, '..');
const cache = new Map();

function load(relative, overrides = {}, modules = cache) {
  const file = path.resolve(root, relative);
  if (modules.has(file)) return modules.get(file).exports;
  const mod = { exports: {} }; modules.set(file, mod);
  const source = ts.transpileModule(syncFs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(name => name in overrides ? overrides[name] : name.startsWith('.')
    ? load(path.resolve(path.dirname(file), `${name}.ts`), overrides, modules) : require(name), mod, mod.exports);
  return mod.exports;
}

function episode() {
  const durations = [3, 5, 7, 5, 6, 4]; let start = 0;
  const captions = [
    '목욕하자 했더니 뒤로 쓱 숨네',
    '그래 오늘은 내가 먼저 씻을게',
    '문을 닫자 톡톡톡 왜 다시 돌아와',
    '걱정했나 싶어 문을 열었더니',
    '가'.repeat(56),
    '내 목욕은 왜 네 참관 수업이야',
  ];
  const shots = durations.map((durationSeconds, index) => {
    const shot = { id: `S${index + 1}`, startSeconds: start, durationSeconds, beat: 'story', caption: captions[index], action: 'one action', camera: 'fixed', keyframePrompt: 'frame', videoPrompt: 'motion' };
    start += durationSeconds; return shot;
  });
  const clips = [0, 1].map(index => ({
    id: `C${index + 1}`, startSeconds: index * 15, durationSeconds: 15, beat: 'production', caption: `clip ${index + 1}`,
    action: 'continuous action', camera: 'fixed', keyframePrompt: 'production frame', videoPrompt: 'restrained motion',
    beatIds: index ? ['S4', 'S5', 'S6'] : ['S1', 'S2', 'S3'],
  }));
  return { version: 'pet-v4', shots, production: { mode: 'two-clips', clips } };
}

function legacyEpisode() {
  const e = episode();
  e.version = 'pet-v3'; delete e.production;
  e.id = 'offline-legacy-source'; e.lyrics = '기존 녹음 가사를 그대로 사용해';
  e.character = {
    species: 'dog', appearance: 'One adult tan dog.', owner: 'One owner stays off screen.',
    setting: 'One living room.', continuity: ['Exactly one blue slipper remains in this room.'],
  };
  let start = 0;
  e.shots.forEach((shot, index) => {
    shot.startSeconds = start; shot.durationSeconds = [4, 5, 5, 6, 6, 4][index]; start += shot.durationSeconds;
  });
  return e;
}

async function assertSilentTail(binary, filename) {
  const measured = await run(binary, ['-hide_banner', '-ss', '27', '-i', filename, '-t', '3', '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { timeout: 20_000, maxBuffer: 128 * 1024 });
  const match = measured.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  assert.ok(match && Number(match[1]) < -70, 'Source audio is silence-padded once, never looped');
}

async function assertSameAudioTimeline(binary, original, rendered) {
  const decode = async filename => (await run(binary, [
    '-v', 'error', '-i', filename, '-map', '0:a:0', '-t', '26', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 's16le', '-',
  ], { timeout: 20_000, encoding: 'buffer', maxBuffer: 3 * 1024 * 1024 })).stdout;
  const [source, output] = await Promise.all([decode(original), decode(rendered)]);
  assert.equal(source.length, 26 * 48000 * 2);
  assert.equal(output.length, source.length, 'All 26 original seconds remain at their original sample positions');
  let signalEnergy = 0; let errorEnergy = 0;
  for (let offset = 0; offset < source.length; offset += 2) {
    const sample = source.readInt16LE(offset);
    const difference = output.readInt16LE(offset) - sample;
    signalEnergy += sample * sample; errorEnergy += difference * difference;
  }
  const relativeError = Math.sqrt(errorEnergy / signalEnergy);
  assert.ok(relativeError < 0.03, `Only AAC encoding error is allowed; no audio shifts, repeats or edits (relative RMS error ${relativeError.toFixed(4)})`);
}

async function assertFinalAudioSampleBoundary(binary, filename) {
  const { stdout } = await run(binary, [
    '-v', 'error', '-i', filename, '-map', '0:a:0', '-t', '30', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-f', 's16le', '-',
  ], { timeout: 20_000, encoding: 'buffer', maxBuffer: 3 * 1024 * 1024 });
  assert.equal(stdout.length / 2, 1_440_000, 'The 30-second audio boundary contains exactly 1,440,000 samples at 48 kHz');
}

async function inspectSolidFrame(binary, filename, second) {
  const { stdout } = await run(binary, [
    '-v', 'error', '-ss', String(second), '-i', filename, '-frames:v', '1', '-vf', 'format=rgb24', '-f', 'rawvideo', '-',
  ], { timeout: 20_000, encoding: 'buffer', maxBuffer: 2 * 1024 * 1024 });
  assert.equal(stdout.length, 480 * 854 * 3, 'Decoded one complete 480x854 RGB frame');
  const background = [stdout[0], stdout[1], stdout[2]];
  let left = 480; let top = 854; let right = -1; let bottom = -1; let pixels = 0;
  for (let y = 0; y < 854; y++) {
    for (let x = 0; x < 480; x++) {
      const offset = (y * 480 + x) * 3;
      const delta = Math.max(...background.map((channel, index) => Math.abs(stdout[offset + index] - channel)));
      if (delta < 28) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); pixels++;
    }
  }
  return { background, left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, pixels };
}

test('historical ASS helpers preserve six editorial cues and 0/15/30 seams', () => {
  const renderer = load('src/lib/video/petRenderer.ts');
  const rhythm = {
    onsetSeconds: [3.22, 7.76, 14.86, 15.14, 20.25, 26.29], beatSeconds: [3.22, 7.76, 20.25, 26.29],
    bpm: 120, confidence: 0.8, method: 'energy-autocorrelation', ending: { status: 'clean', reasons: [], tailRmsRatio: 0, terminalRms: 0 },
  };
  const timeline = renderer.buildPetCaptionTimeline(episode(), rhythm);
  assert.deepEqual(timeline.map(cue => cue.startSeconds), [0, 3.22, 7.76, 15, 20.25, 26.29]);
  assert.equal(timeline.at(-1).endSeconds, 30);
  assert.ok(timeline.every(cue => cue.endSeconds - cue.startSeconds >= 1.25));
  const fallback = renderer.buildPetCaptionTimeline(episode(), { ...rhythm, confidence: 0.1, method: 'editorial-fallback' });
  assert.deepEqual(fallback.map(cue => cue.startSeconds), [0, 3, 8, 15, 20, 26]);
  const legacy = episode(); legacy.version = 'pet-v3'; delete legacy.production;
  const legacyDurations = [4, 5, 5, 6, 6, 4]; let legacyStart = 0;
  legacy.shots.forEach((shot, index) => { shot.startSeconds = legacyStart; shot.durationSeconds = legacyDurations[index]; legacyStart += legacyDurations[index]; });
  assert.deepEqual(renderer.buildPetCaptionTimeline(legacy, rhythm).map(cue => cue.startSeconds), [0, 4, 9, 14, 20, 26]);
  const ass = renderer.buildPetAss(episode(), 'Noto Sans KR', rhythm);
  assert.equal((ass.match(/^Dialogue:/gm) || []).length, 6);
  const styles = ass.split('\n').filter(line => line.startsWith('Style:'));
  assert.ok(styles.length >= 6);
  assert.ok(styles.every(line => Number(line.split(',')[2]) >= 42), 'Every caption style is materially larger than the former 25 px type');
  assert.ok(styles.every(line => Number(line.split(',')[20]) >= 104), 'Every caption leaves the Shorts action rail clear');
  const dialogues = ass.split('\n').filter(line => line.startsWith('Dialogue:'));
  assert.deepEqual(dialogues.map(line => line.split(',')[3]), ['Hook', 'Middle', 'Upper', 'Turn', 'Long', 'Payoff']);
  assert.ok(dialogues.every(line => !/\\k|karaoke/i.test(line)));
});

test('new captionless v4 and adapted legacy exports preserve the 15-second seam, original audio and archived review frames without fonts or ASS', async () => {
  const checkedRun = async (binary, args, options) => {
    assert.ok(!args.includes('-filters'), 'Renderer preflight must not require an ASS filter');
    const filter = args[args.indexOf('-filter_complex') + 1];
    if (args.includes('-filter_complex')) assert.doesNotMatch(filter, /\b(?:ass|subtitles|drawtext)=/i, 'New exports cannot burn in text');
    return run(binary, args, options);
  };
  const checkedExecFile = (...args) => execFile(...args);
  checkedExecFile[promisify.custom] = checkedRun;
  const modules = new Map();
  const overrides = {
    'node:child_process': { execFile: checkedExecFile },
    'node:fs': { ...syncFs, existsSync: filename => {
      assert.doesNotMatch(filename, /(?:fonts|\.tt[fc]$)/i, 'No Korean font discovery is needed');
      return syncFs.existsSync(filename);
    } },
    'node:fs/promises': { ...fs, writeFile: (filename, ...args) => {
      assert.doesNotMatch(filename, /\.ass$/i, 'No subtitle artifact is created');
      return fs.writeFile(filename, ...args);
    } },
  };
  const media = load('src/lib/video/petMedia.ts', overrides, modules);
  const renderer = load('src/lib/video/petRenderer.ts', overrides, modules);
  const readiness = await renderer.preflightPetRenderer();
  assert.deepEqual(Object.keys(readiness), ['binary'], 'Captionless readiness has no font prerequisite');
  const { binary } = readiness;
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-v4-render-test-'));
  const files = { c1: path.join(folder, 'c1.mp4'), c2: path.join(folder, 'c2.mp4'), short: path.join(folder, 'short.mp4'), image: path.join(folder, 'master.jpg'), audio: path.join(folder, 'audio.wav') };
  try {
    await run(binary, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=coral:s=240x426:r=30', '-t', '15', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', files.c1], { timeout: 30_000, maxBuffer: 128 * 1024 });
    await run(binary, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=steelblue:s=240x426:r=30', '-t', '15', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', files.c2], { timeout: 30_000, maxBuffer: 128 * 1024 });
    await run(binary, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=240x426:r=30', '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', files.short], { timeout: 20_000, maxBuffer: 128 * 1024 });
    await run(binary, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=coral:s=480x854', '-frames:v', '1', files.image], { timeout: 20_000, maxBuffer: 128 * 1024 });
    // A changing frequency makes replayed or shifted audio detectable, unlike a repeating tone.
    await run(binary, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'aevalsrc=0.08*sin(2*PI*(220*t+8*t*t)):s=48000', '-t', '26', '-c:a', 'pcm_s16le', files.audio], { timeout: 20_000, maxBuffer: 128 * 1024 });
    const source = { 'fixture://c1': files.c1, 'fixture://c2': files.c2, 'fixture://short': files.short, 'fixture://image': files.image, 'fixture://audio': files.audio };
    media.downloadPetMedia = async (url, kind) => ({ buffer: await fs.readFile(source[url]), contentType: kind === 'audio' ? 'audio/wav' : kind === 'image' ? 'image/jpeg' : 'video/mp4' });
    const e = episode();
    const job = {
      id: 'offline-v4', episode: e,
      state: { audio: { sourceUrl: 'fixture://audio', stableUrl: 'fixture://audio' }, shots: [0, 1].map(index => ({ id: `C${index + 1}`, imageStatus: 'ready', keyframeUrl: 'fixture://image', videoStatus: 'ready', videoUrl: `fixture://c${index + 1}` })) },
    };
    const uploads = [];
    const upload = async (_job, filename, bytes, contentType) => {
      uploads.push({ filename, bytes, contentType });
      if (/^final-captionless-v1-[a-f0-9]{16}\.mp4$/.test(filename)) { const output = path.join(folder, filename); await fs.writeFile(output, bytes); return output; }
      return `uploaded://${filename}`;
    };
    const snapshot = await renderer.snapshotPetAudio(job, upload);
    assert.ok(snapshot.durationSeconds >= 25.99 && snapshot.durationSeconds <= 26.02);
    assert.equal(snapshot.rhythm.ending.status, 'review', 'An abruptly stopped continuous signal is retained but flagged before paid video');
    const shortJob = structuredClone(job); shortJob.state.shots[0].videoUrl = 'fixture://short';
    await assert.rejects(renderer.extractPetReviewFrames(shortJob, 0, 'video', upload), error => error.code === 'SHOT_DURATION');
    await assert.rejects(renderer.renderPetVideo(shortJob, upload), error => error.code === 'SHOT_DURATION');
    const imageReview = await renderer.extractPetReviewFrames(job, 0, 'image', upload);
    const videoReview = await renderer.extractPetReviewFrames(job, 0, 'video', upload);
    const bridge = await renderer.extractPetBridgeFrame(job, 0, upload);
    assert.equal(imageReview.urls.length, 1); assert.equal(videoReview.urls.length, 3);
    assert.equal(bridge.url, 'uploaded://C2-image.jpg');
    assert.ok(uploads.filter(item => item.contentType === 'image/jpeg').every(item => item.bytes[0] === 0xff && item.bytes[1] === 0xd8));
    const result = await renderer.renderPetVideo(job, upload);
    assert.equal(result.durationSeconds, 30);
    const audioSeconds = await renderer.probePetMediaSeconds(binary, result.url, 'audio');
    assert.ok(audioSeconds >= 29.95 && audioSeconds <= 30.1);
    await assertFinalAudioSampleBoundary(binary, result.url);
    await assertSameAudioTimeline(binary, files.audio, result.url);
    await assertSilentTail(binary, result.url);
    const frameSeconds = [0, 1, 3.22, 8, 14 + 29 / 30, 15, 16, 20.25, 26.29, 29 + 29 / 30];
    for (const second of frameSeconds) {
      const frame = await inspectSolidFrame(binary, result.url, second);
      assert.equal(frame.pixels, 0, `At ${second.toFixed(3)} seconds the synthetic solid frame has zero caption pixels`);
      const [red, , blue] = frame.background;
      assert.ok(second < 15 ? red > blue : blue > red, 'The first coral clip changes to the second blue clip at exactly 15 seconds');
    }
    const finalUpload = uploads.find(item => item.contentType === 'video/mp4');
    assert.match(finalUpload.filename, /^final-captionless-v1-[a-f0-9]{16}\.mp4$/, 'New exports receive immutable public object URLs distinct from historical captioned assets');
    assert.equal(finalUpload.filename, `final-captionless-v1-${createHash('sha256').update(finalUpload.bytes).digest('hex').slice(0, 16)}.mp4`);

    const originalLegacy = legacyEpisode();
    const sourceBefore = structuredClone(originalLegacy);
    const legacy = {
      ...originalLegacy,
      legacyProduction: { mode: 'two-clips', version: 'legacy-adapter-v1', clips: load('src/lib/vle/petLegacyTwoClip.ts').compileLegacyPetClips(originalLegacy) },
    };
    const legacyJob = structuredClone(job);
    legacyJob.id = 'offline-legacy'; legacyJob.episode = legacy;
    legacyJob.state.audio.rhythm = {
      onsetSeconds: [4.18, 8.8, 14.12, 20.2, 26.1], beatSeconds: [], bpm: 120, confidence: 0.9,
      method: 'energy-autocorrelation', ending: { status: 'clean', reasons: [], tailRmsRatio: 0, terminalRms: 0 },
    };
    assert.deepEqual(legacy.legacyProduction.clips.map(clip => [clip.startSeconds, clip.durationSeconds]), [[0, 15], [15, 15]]);
    const timeline = renderer.buildPetCaptionTimeline(legacy, legacyJob.state.audio.rhythm);
    assert.deepEqual(timeline.map(cue => [cue.startSeconds, cue.endSeconds]), [[0, 4], [4, 9], [9, 14], [14, 20], [20, 26], [26, 30]]);
    assert.ok(timeline.every(cue => cue.timing === 'editorial'), 'Measured onsets must not move recorded legacy cues');
    const ass = renderer.buildPetAss(legacy, 'Noto Sans KR', legacyJob.state.audio.rhythm);
    const dialogues = ass.split('\n').filter(line => line.startsWith('Dialogue:'));
    assert.equal(dialogues.length, 6);
    assert.deepEqual(dialogues.map(line => line.split(',').slice(1, 3)), [
      ['0:00:00.00', '0:00:04.00'], ['0:00:04.00', '0:00:09.00'], ['0:00:09.00', '0:00:14.00'],
      ['0:00:14.00', '0:00:20.00'], ['0:00:20.00', '0:00:26.00'], ['0:00:26.00', '0:00:30.00'],
    ]);
    const legacyUploads = [];
    const legacyUpload = async (_job, filename, bytes, contentType) => {
      legacyUploads.push({ filename, bytes, contentType });
      if (/^final-captionless-v1-[a-f0-9]{16}\.mp4$/.test(filename)) { const output = path.join(folder, 'legacy-final.mp4'); await fs.writeFile(output, bytes); return output; }
      return `uploaded://legacy-${filename}`;
    };
    const originalAudio = await fs.readFile(files.audio);
    const legacySnapshot = await renderer.snapshotPetAudio(legacyJob, legacyUpload);
    assert.equal(legacySnapshot.durationSeconds, snapshot.durationSeconds);
    assert.deepEqual(legacyUploads.find(item => item.filename === 'audio-source').bytes, originalAudio, 'Archiving keeps every original audio byte');
    assert.equal((await renderer.extractPetBridgeFrame(legacyJob, 0, legacyUpload)).url, 'uploaded://legacy-C2-image.jpg');
    assert.equal((await renderer.extractPetReviewFrames(legacyJob, 1, 'video', legacyUpload)).urls.length, 3);
    const legacyResult = await renderer.renderPetVideo(legacyJob, legacyUpload);
    assert.equal(legacyResult.durationSeconds, 30);
    const legacyAudioSeconds = await renderer.probePetMediaSeconds(binary, legacyResult.url, 'audio');
    assert.ok(legacyAudioSeconds >= 29.95 && legacyAudioSeconds <= 30.1);
    await assertFinalAudioSampleBoundary(binary, legacyResult.url);
    await assertSameAudioTimeline(binary, files.audio, legacyResult.url);
    await assertSilentTail(binary, legacyResult.url);
    for (const second of [1, 10, 14 + 29 / 30, 15, 22, 29 + 29 / 30]) {
      assert.equal((await inspectSolidFrame(binary, legacyResult.url, second)).pixels, 0, 'New adapted legacy exports contain no captions');
    }
    assert.deepEqual(await fs.readFile(files.audio), originalAudio);
    assert.deepEqual(originalLegacy, sourceBefore, 'Adapter and renderer leave original identity, lyrics and shot timing untouched');
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
