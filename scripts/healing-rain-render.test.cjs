'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { normalizeOptions, planVideoLoop, planAudioSequence, parseCli, renderHealingRain } = require('../worker/healing-rain-render');

test('265-frame provider source trims to an exact 10s forward cycle and rejects short sources', () => {
  const plan = planVideoLoop(265, 24, 1, 10);
  assert.deepEqual(plan, { sourceFrames: 264, cycleFrames: 240, fadeFrames: 24, cycleSeconds: 10, trimmedFrames: 1 });
  for (const seconds of [30, 180]) assert.equal(seconds * 24 % plan.cycleFrames, 0, 'both preview endpoints close the exact video cycle');
  assert.throws(() => planVideoLoop(263, 24, 1, 10), /264 frames are required.*No padding or slowdown/);
  assert.equal(planVideoLoop(265, 24, 1).cycleFrames, 241, 'unconstrained callers still derive the available cycle');
});

test('audio plan tops up six 30s takes after crossfades, retaining independent take order', () => {
  const plan = planAudioSequence([30, 30, 30, 30, 30, 30], 180, 2);
  assert.deepEqual(plan.sequence.map(take => take.sourceIndex), [0, 1, 2, 3, 4, 5, 0]);
  assert.equal(plan.availableSeconds, 198);
  assert.equal(plan.requiredSeconds, 182);
  assert.deepEqual(plan.sequence.map(take => take.startsAt), [0, 28, 56, 84, 112, 140, 168]);
  assert.throws(() => planAudioSequence([4], 180, 2), /longer than twice/);
});

test('CLI and worker integration accept only bounded local media inputs', () => {
  const options = normalizeOptions({ video: '/tmp/video.mp4', audio: ['/tmp/a.wav'], outputDir: '/tmp/new', seconds: 180 });
  assert.equal(options.videoPath, '/tmp/video.mp4');
  assert.equal(options.targetSeconds, 180);
  assert.deepEqual(parseCli(['--video', '/tmp/video.mp4', '--audio', '/tmp/a.wav', '--audio', '/tmp/b.mp3']), { videoPath: '/tmp/video.mp4', audioPaths: ['/tmp/a.wav', '/tmp/b.mp3'] });
  assert.equal(parseCli(['--video-cycle', '10']).targetVideoCycleSeconds, '10');
  for (const invalid of [{ video: 'https://example.com/video.mp4' }, { seconds: Infinity }, { fps: 23.976 }, { maxWidth: 1919 }, { video: '/tmp/a\nb.mp4' }, { targetVideoCycleSeconds: 10.01 }]) {
    assert.throws(() => normalizeOptions({ video: '/tmp/v.mp4', audio: ['/tmp/a.wav'], outputDir: '/tmp/new', ...invalid }));
  }
});

test('short real FFmpeg assembly preserves sources, duration, forward cache, PCM and AAC continuity', { timeout: 120000 }, async t => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
  catch { t.skip('FFmpeg is not installed'); return; }
  const directory = await fs.mkdtemp('/private/tmp/healing-rain-render-test-');
  const video = path.join(directory, "forward clip; ' $(ignored).mp4");
  const audio = [path.join(directory, 'rain one.wav'), path.join(directory, 'rain two.mp3')];
  const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args], { timeout: 30000, maxBuffer: 8192 });
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=24', '-frames:v', '73', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  ffmpeg(['-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.2:sample_rate=48000:duration=2:seed=17', '-c:a', 'pcm_s16le', audio[0]]);
  ffmpeg(['-f', 'lavfi', '-i', 'anoisesrc=color=brown:amplitude=0.2:sample_rate=48000:duration=2:seed=41', '-c:a', 'libmp3lame', '-b:a', '128k', audio[1]]);
  const hashes = await Promise.all([video, ...audio].map(async file => createHash('sha256').update(await fs.readFile(file)).digest('hex')));
  const outputDir = path.join(directory, 'render');
  const report = await renderHealingRain({ video, audio, outputDir, seconds: 4, previewSeconds: 2, videoCrossfadeSeconds: 1, targetVideoCycleSeconds: 2, audioCrossfadeSeconds: 0.2, maxWidth: 160 });
  assert.equal(report.status, 'complete');
  assert.equal(report.effectiveVideoCycleSeconds, 2);
  assert.equal(report.sourceDecodedVideoFrames, 73); assert.equal(report.usedSourceVideoFrames, 72);
  assert.equal(report.trimmedSourceVideoFrames, 1);
  assert.equal(report.videoEncoding.maxrateBitsPerSecond, 1600000);
  assert.equal(report.videoSeamMetrics.decodedFrames, 48);
  assert.ok(report.videoSeamMetrics.interiorMedianDifference > 0, 'fixture has moving images');
  assert.equal(report.outputs.length, 2);
  const frameHashes = file => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-'], { maxBuffer: 32768 }).toString().split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
  const cycleHashes = frameHashes(report.videoLoop);
  for (const output of report.outputs) {
    assert.equal(output.videoEndpointClosesCycle, true);
    assert.equal(output.bytes, (await fs.stat(output.video)).size);
    assert.equal(output.withinUploadBudget, true);
    assert.ok(output.bytes < 45 * 1024 ** 2);
    assert.equal(output.pcmMetrics.samples, output.seconds * 48000);
    assert.equal(output.pcmMetrics.silent100msWindows, 0);
    assert.equal(output.aacMetrics.silent100msWindows, 0);
    assert.ok(output.pcmMetrics.peak < 1, 'crossfades do not clip the rain fixture');
    assert.ok(output.pcmMetrics.wrapSampleStep < output.pcmMetrics.maxAdjacentSampleStep, 'audio wrap remains within ordinary sample variation');
    assert.equal(output.media.duration, output.seconds);
    for (const stream of Object.values(output.packetMetrics)) {
      assert.equal(stream.nonMonotonicDts, 0);
      assert.ok(stream.maxTimestampGapSeconds < 0.0001);
    }
    const outputHashes = frameHashes(output.video);
    assert.equal(outputHashes.length, output.seconds * 24);
    assert.deepEqual(outputHashes, Array.from({ length: outputHashes.length }, (_, index) => cycleHashes[index % cycleHashes.length]), 'all forward cycle frames repeat unchanged through stream-copy joins');
  }
  assert.deepEqual(await Promise.all([video, ...audio].map(async file => createHash('sha256').update(await fs.readFile(file)).digest('hex'))), hashes);
  await assert.rejects(renderHealingRain({ video, audio, outputDir, seconds: 4, previewSeconds: 2, audioCrossfadeSeconds: 0.2 }), /EEXIST/);
  const shortOutput = path.join(directory, 'too-short');
  await assert.rejects(renderHealingRain({ video, audio, outputDir: shortOutput, seconds: 4, previewSeconds: 2, targetVideoCycleSeconds: 3, audioCrossfadeSeconds: 0.2 }), /96 frames are required/);
  await assert.rejects(fs.stat(shortOutput), { code: 'ENOENT' });
  assert.equal(JSON.parse(await fs.readFile(report.reportPath, 'utf8')).status, 'complete');
  t.diagnostic(`Synthetic artifacts retained at ${directory}`);
});

test('six very different rain levels are matched with constant gain and measured peak headroom', { timeout: 120000 }, async t => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
  catch { t.skip('FFmpeg is not installed'); return; }
  const directory = await fs.mkdtemp('/private/tmp/healing-rain-level-test-');
  const video = path.join(directory, 'forward.mp4'), audio = [];
  const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args], { timeout: 30000, maxBuffer: 8192 });
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=24:duration=3', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
  for (const [index, amplitude] of [0.005, 0.015, 0.04, 0.1, 0.3, 0.8].entries()) {
    const file = path.join(directory, `rain-${index + 1}.wav`); audio.push(file);
    ffmpeg(['-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=${amplitude}:sample_rate=48000:duration=1.2:seed=${100 + index}`, '-c:a', 'pcm_s16le', file]);
  }
  const report = await renderHealingRain({ video, audio, outputDir: path.join(directory, 'render'), seconds: 6, previewSeconds: 2, videoCrossfadeSeconds: 1, audioCrossfadeSeconds: 0.1, maxWidth: 160 });
  const normalized = report.audioNormalization.takes;
  const originalLevels = normalized.map(take => take.input.integratedLufs);
  assert.ok(Math.max(...originalLevels) - Math.min(...originalLevels) > 40, 'fixture covers more than 40 LU of source variation');
  assert.ok(normalized.every(take => Math.abs(take.expectedIntegratedLufs + 26) < 0.01 && take.limitedBy === null));
  assert.ok(normalized.every(take => take.expectedTruePeakDb <= -6));
  const decodedStereo = file => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-af', 'aresample=48000:async=0:first_pts=0,aformat=channel_layouts=stereo', '-f', 'f32le', '-'], { maxBuffer: 4 * 1024 ** 2 });
  // A compressor could match average levels while changing rain dynamics.
  // Verify that actual normalized samples equal original samples * one gain.
  for (let index = 0; index < audio.length; index++) {
    const original = decodedStereo(audio[index]), matched = decodedStereo(report.normalizedAudio[index]);
    assert.equal(matched.length, original.length);
    const gain = 10 ** (normalized[index].gainDb / 20);
    let maxDifference = 0;
    for (let offset = 0; offset < original.length; offset += 4) maxDifference = Math.max(maxDifference, Math.abs(original.readFloatLE(offset) * gain - matched.readFloatLE(offset)));
    assert.ok(maxDifference < 0.000002, `take ${index + 1} uses constant gain without pumping`);
  }
  const output = report.outputs.find(item => item.seconds === 6), samples = decodedStereo(output.wav);
  const levels = [0.5, 1.6, 2.7, 3.8, 4.9, 5.7].map(center => {
    let square = 0, count = 0;
    for (let frame = Math.round((center - 0.12) * 48000); frame < Math.round((center + 0.12) * 48000); frame++) {
      const value = samples.readFloatLE(frame * 8); square += value * value; count++;
    }
    return 20 * Math.log10(Math.sqrt(square / count));
  });
  const spread = Math.max(...levels) - Math.min(...levels);
  assert.ok(spread < 3, `steady portions remain within 3 dB after matching, measured ${spread}`);
  assert.equal(output.pcmMetrics.silent100msWindows, 0); assert.equal(output.aacMetrics.silent100msWindows, 0);
  assert.ok(output.pcmLoudness.truePeakDb <= -3); assert.ok(output.aacLoudness.truePeakDb <= -3);
  assert.ok(output.pcmLoudness.integratedLufs < -27 && output.pcmLoudness.integratedLufs > -31);
  t.diagnostic(`Six-level rain fixture: source spread ${(Math.max(...originalLevels) - Math.min(...originalLevels)).toFixed(1)} LU, output steady-window spread ${spread.toFixed(2)} dB, PCM ${output.pcmLoudness.integratedLufs} LUFS / ${output.pcmLoudness.truePeakDb} dBTP, AAC ${output.aacLoudness.truePeakDb} dBTP. Artifacts: ${directory}`);
});
