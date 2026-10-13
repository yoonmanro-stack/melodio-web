/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner exercises the CommonJS local compositor. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { normalizeOptions, planTimeline, framePlan, parseCli, audioMetrics, requireAudioIntegrity, renderHealingRainIntro } = require('../worker/healing-rain-intro-render');

const basic = { introPath: '/tmp/intro.mp4', bodyPath: '/tmp/body.mp4', audioPath: '/tmp/bed.wav', outputDir: '/tmp/new-output' };

test('default timeline contains exactly one 15s intro and resumes body at 2.5s', () => {
  const options = normalizeOptions(basic), timeline = planTimeline(options);
  assert.deepEqual(options.durations, [30, 180]);
  assert.equal(options.transitionCurve, 'linear'); assert.equal(timeline.transitionCurve, 'linear');
  assert.equal(options.initialGain, 10 ** (-6 / 20)); assert.equal(options.onsetSeconds, 1.5);
  assert.deepEqual(framePlan(timeline, 299), { introFrame: 299, bodyFrame: null, bodyAlpha: 0 });
  assert.deepEqual(framePlan(timeline, 300), { introFrame: 300, bodyFrame: 0, bodyAlpha: 0 });
  assert.deepEqual(framePlan(timeline, 330), { introFrame: 330, bodyFrame: 30, bodyAlpha: 0.5 });
  assert.deepEqual(framePlan(timeline, 360), { introFrame: null, bodyFrame: 60, bodyAlpha: 1 });
  assert.deepEqual(framePlan(timeline, 540), { introFrame: null, bodyFrame: 0, bodyAlpha: 1 });
  for (let frame = 360; frame < 180 * 24; frame++) {
    assert.equal(framePlan(timeline, frame).introFrame, null);
    assert.equal(framePlan(timeline, frame).bodyFrame, (frame - 300) % 240);
  }
});

test('smoothstep dissolve eases both ends without changing the forward body timeline', () => {
  const options = normalizeOptions({ ...basic, fadeSeconds: 9, transitionCurve: 'smoothstep' });
  const timeline = planTimeline(options);
  assert.equal(timeline.transitionCurve, 'smoothstep');
  assert.equal(timeline.bodyStartsAtSeconds, 6);
  for (const [position, alpha] of [[0, 0], [0.25, 0.15625], [0.5, 0.5], [0.75, 0.84375], [1, 1]]) {
    const frame = timeline.bodyStartsAtFrame + timeline.fadeFrames * position;
    assert.equal(framePlan(timeline, frame).bodyAlpha, alpha);
    assert.equal(framePlan(timeline, frame).bodyFrame, timeline.fadeFrames * position);
  }
  assert.equal(framePlan(timeline, 0).bodyAlpha, 0);
  assert.deepEqual(framePlan(timeline, 384), { introFrame: null, bodyFrame: 0, bodyAlpha: 1 });
});

test('bounded CLI rejects network paths, fractional frames and exposed alignment edges', () => {
  assert.deepEqual(parseCli(['--intro', '/tmp/a.mp4', '--durations', '30,180', '--anchor-alignment', '{"scale":1.12,"translateY":0.04}']), { introPath: '/tmp/a.mp4', durations: ['30', '180'], anchorAlignment: { scale: 1.12, translateY: 0.04 } });
  for (const invalid of [{ introPath: 'https://example.com/intro.mp4' }, { fps: 30 }, { width: 1283 }, { fadeSeconds: 0.111 }, { durations: [181] }, { anchorAlignment: { translateY: 0.1 } }]) assert.throws(() => normalizeOptions({ ...basic, ...invalid }));
  assert.deepEqual(parseCli(['--transition-curve', 'smoothstep']), { transitionCurve: 'smoothstep' });
  assert.throws(() => normalizeOptions({ ...basic, ...parseCli(['--transition-curve', 'ease-in']) }), /transitionCurve must be linear or smoothstep/);
  assert.throws(() => parseCli(['--unexpected', 'value']), /Unknown option/);
});

test('output dimensions preserve existing defaults and allow exact 720p', () => {
  const defaults = normalizeOptions(basic);
  assert.equal(defaults.width, 1284);
  assert.equal(defaults.height, 716);
  const hd = normalizeOptions({ ...basic, width: 1280, height: 720 });
  assert.equal(hd.width, 1280);
  assert.equal(hd.height, 720);
  assert.throws(() => normalizeOptions({ ...basic, height: 722 }), /height must be between 16 and 720/);
});

test('tiny actual compositor verifies single intro, exact phase, durations, gain and shared audio prefix', { timeout: 120000 }, async t => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { t.skip('FFmpeg not installed'); return; }
  const directory = await fs.mkdtemp('/private/tmp/healing-rain-intro-test-');
  const intro = path.join(directory, "intro; ' $(literal).mp4"), body = path.join(directory, 'body.mp4'), audio = path.join(directory, 'bed.wav');
  const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args], { timeout: 30000, maxBuffer: 8 * 1024 ** 2 });
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=64x48:r=24:d=3', '-an', '-c:v', 'libx264', '-crf', '0', '-pix_fmt', 'yuv420p', intro]);
  ffmpeg(['-f', 'lavfi', '-i', "nullsrc=s=64x48:r=24:d=2,geq=lum='32+N*3':cb=128:cr=128", '-an', '-c:v', 'libx264', '-crf', '0', '-pix_fmt', 'yuv420p', body]);
  ffmpeg(['-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.2:sample_rate=48000:duration=8:seed=83', '-ac', '2', '-c:a', 'pcm_s24le', audio]);
  const hotOppositeChannels = path.join(directory, 'hot-opposite-channels.wav');
  ffmpeg(['-f', 'lavfi', '-i', 'aevalsrc=1|-1:s=48000:d=0.3', '-c:a', 'pcm_f32le', hotOppositeChannels]);
  const hotMetrics = await audioMetrics(hotOppositeChannels, 0.3);
  assert.deepEqual(hotMetrics.channelPeaks, [1, 1], 'opposite channels cannot hide clipping by cancelling in a mono downmix');
  assert.throws(() => requireAudioIntegrity(hotMetrics), /clipped samples/);
  const silentBed = path.join(directory, 'silent-bed.wav');
  ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo:d=0.3', '-c:a', 'pcm_s24le', silentBed]);
  const silentMetrics = await audioMetrics(silentBed, 0.3);
  assert.throws(() => requireAudioIntegrity(silentMetrics), /near-silent/);
  assert.throws(() => requireAudioIntegrity({ peak: NaN, nonfiniteSamples: 1 }), /nonfinite/);
  const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
  const initialHashes = await Promise.all([intro, body, audio].map(hash));
  const outputDir = path.join(directory, 'render');
  const report = await renderHealingRainIntro({ introPath: intro, bodyPath: body, audioPath: audio, outputDir, introSeconds: 3, bodySeconds: 2, fadeSeconds: 0.5, onsetSeconds: 0.25, width: 64, height: 48, durations: [5, 8] });
  const smoothReport = await renderHealingRainIntro({ introPath: intro, bodyPath: body, audioPath: audio, outputDir: path.join(directory, 'smoothstep-render'), introSeconds: 3, bodySeconds: 2, fadeSeconds: 0.5, transitionCurve: 'smoothstep', onsetSeconds: 0.25, width: 64, height: 48, durations: [5, 8] });
  assert.equal(report.status, 'complete'); assert.equal(report.timeline.introOccurrences, 1);
  assert.equal(smoothReport.status, 'complete'); assert.equal(smoothReport.timeline.transitionCurve, 'smoothstep');
  assert.equal(report.audio.pcmMetrics.samples, 8 * 48000);
  assert.equal(report.audio.pcmMetrics.silent100msWindows, 0);
  const frames = file => ffmpeg(['-i', file, '-map', '0:v:0', '-an', '-vf', 'scale=1:1,format=rgb24', '-f', 'rawvideo', '-']);
  const masterFrames = frames(report.outputs[1].video), smoothFrames = frames(smoothReport.outputs[1].video), bodyFrames = frames(body);
  assert.equal(masterFrames.length / 3, 8 * 24);
  assert.equal(smoothFrames.length / 3, 8 * 24);
  assert.ok(masterFrames[0] > 200 && masterFrames[1] < 5, 'intro begins once in red');
  assert.ok(smoothFrames[0] > 200 && smoothFrames[1] < 5, 'eased render begins with the same intro');
  const planes = file => ffmpeg(['-i', file, '-map', '0:v:0', '-an', '-vf', 'scale=2:2,format=yuv444p', '-f', 'rawvideo', '-']);
  const introPlanes = planes(intro), bodyPlanes = planes(body);
  for (const rendered of [report, smoothReport]) {
    const outputPlanes = planes(rendered.outputs[1].video);
    for (const position of [0.25, 0.5, 0.75]) {
      const outputFrame = rendered.timeline.bodyStartsAtFrame + rendered.timeline.fadeFrames * position;
      const plan = framePlan(rendered.timeline, outputFrame);
      for (let plane = 0; plane < 3; plane++) {
        const expected = introPlanes[plan.introFrame * 12 + plane * 4] * (1 - plan.bodyAlpha) + bodyPlanes[plan.bodyFrame * 12 + plane * 4] * plan.bodyAlpha;
        const actual = outputPlanes[outputFrame * 12 + plane * 4];
        assert.ok(Math.abs(actual - expected) <= 3, `${rendered.timeline.transitionCurve} blend at ${position} on plane ${plane}: actual ${actual}, expected ${expected}`);
      }
    }
  }
  for (let index = 3 * 24; index < 8 * 24; index++) {
    const bodyIndex = (index - 60) % 48;
    for (const renderedFrames of [masterFrames, smoothFrames]) {
      for (let color = 0; color < 3; color++) assert.ok(Math.abs(renderedFrames[index * 3 + color] - bodyFrames[bodyIndex * 3 + color]) <= 4, `output frame ${index} must continue forward from body frame ${bodyIndex}`);
    }
  }
  assert.deepEqual(frames(report.outputs[0].video), masterFrames.subarray(0, 5 * 24 * 3));
  assert.deepEqual(frames(smoothReport.outputs[0].video), smoothFrames.subarray(0, 5 * 24 * 3));
  const stereo = file => ffmpeg(['-i', file, '-map', '0:a:0', '-ar', '48000', '-ac', '2', '-f', 'f32le', '-']);
  const masterAudio = stereo(report.outputs[1].video), previewAudio = stereo(report.outputs[0].video);
  assert.equal(await hash(report.audio.wav), await hash(smoothReport.audio.wav), 'transition curve leaves the continuous PCM bed unchanged');
  assert.deepEqual(stereo(smoothReport.outputs[1].video), masterAudio, 'transition curve leaves encoded master audio unchanged');
  assert.deepEqual(stereo(smoothReport.outputs[0].video), previewAudio, 'transition curve leaves encoded preview audio unchanged');
  let prefixError = 0, prefixEnergy = 0;
  for (let offset = 0; offset < (5 * 48000 - 2048) * 8; offset += 4) {
    const sample = masterAudio.readFloatLE(offset), difference = previewAudio.readFloatLE(offset) - sample;
    prefixError += difference * difference; prefixEnergy += sample * sample;
  }
  assert.ok(Math.sqrt(prefixError / prefixEnergy) < 0.08, `both AAC prefixes stay aligned to the same PCM bed; relative encoder difference ${Math.sqrt(prefixError / prefixEnergy)}`);
  const original = stereo(audio), ramped = stereo(report.audio.wav);
  for (const seconds of [0.5, 1.5, 3.5, 7]) {
    const sample = Math.round(seconds * 48000);
    for (let offset = sample * 8; offset < sample * 8 + 1000; offset += 8) {
      const source = original.readFloatLE(offset), actual = ramped.readFloatLE(offset);
      const position = Math.min(offset / 8 / 48000 / 3, 1);
      const expectedGain = 10 ** ((-6 * (1 - position * position * (3 - 2 * position))) / 20);
      assert.ok(Math.abs(actual - source * expectedGain) < 0.00002, 'audio gain changes smoothly then remains exactly unity');
    }
  }
  for (const output of [...report.outputs, ...smoothReport.outputs]) {
    assert.equal(output.media.duration, output.seconds);
    assert.equal(Number(output.media.streams.find(stream => stream.codec_type === 'video').nb_read_frames), output.seconds * 24);
    assert.equal(output.audioMetrics.silent100msWindows, 0);
    for (const metrics of Object.values(output.packetMetrics)) { assert.equal(metrics.nonMonotonicDts, 0); assert.ok(metrics.maxGapSeconds < 0.0001); }
    assert.ok(output.bytes < 45 * 1024 ** 2);
  }
  assert.deepEqual(await Promise.all([intro, body, audio].map(hash)), initialHashes);
  const longAudioBody = path.join(directory, 'body-with-longer-audio.mp4');
  ffmpeg(['-i', body, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-t', '3', longAudioBody]);
  const rejectedOutput = path.join(directory, 'reject-container-drift');
  await assert.rejects(renderHealingRainIntro({ introPath: intro, bodyPath: longAudioBody, audioPath: audio, outputDir: rejectedOutput, introSeconds: 3, bodySeconds: 2, fadeSeconds: 0.5, width: 64, height: 48, durations: [5, 8] }), /video and container timelines must both match/);
  await assert.rejects(fs.stat(rejectedOutput), { code: 'ENOENT' });
  await assert.rejects(renderHealingRainIntro({ introPath: intro, bodyPath: body, audioPath: audio, outputDir, introSeconds: 3, bodySeconds: 2, fadeSeconds: 0.5, width: 64, height: 48, durations: [5, 8] }), /EEXIST/);
  t.diagnostic(`Synthetic artifacts retained: ${directory}`);
});
