#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS worker, matching the existing local render pipeline. */
'use strict';

// Local, additive compositor: one intro, one forward body loop, one continuous
// audio bed. No provider calls, source edits, nested network inputs or overwrites.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const SAMPLE_RATE = 48000;
const MAX_BYTES = 45 * 1024 ** 2;
const BASE = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n'];

function run(command, args, { maxBytes = 1024 * 1024, timeoutMs = 30 * 60 * 1000 } = {}) {
  if (command === 'ffmpeg') args = args.flatMap(value => value === '-i' ? ['-protocol_whitelist', 'file,pipe', '-i'] : [value]);
  if (command === 'ffprobe') args = ['-protocol_whitelist', 'file,pipe', ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let size = 0, stderr = '', failure;
    const chunks = [];
    const timer = setTimeout(() => { failure = new Error(`${command} timed out`); child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { failure = new Error(`${command} exceeded bounded output`); child.kill('SIGKILL'); }
      else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4096); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure || code !== 0) reject(failure || new Error(`${command} exited ${code}: ${stderr.trim()}`));
      else resolve(Buffer.concat(chunks));
    });
  });
}

function number(value, fallback, label, min, max) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return result;
}

function normalizeOptions(input) {
  const options = { ...input };
  for (const name of ['introPath', 'bodyPath', 'audioPath', 'outputDir']) {
    if (typeof options[name] !== 'string' || !path.isAbsolute(options[name]) || /[\0\r\n]/.test(options[name])) throw new Error(`${name} must be an absolute local path without line breaks`);
  }
  options.fps = number(input.fps, 24, 'fps', 12, 24);
  options.width = number(input.width, 1284, 'width', 16, 1284);
  options.height = number(input.height, 716, 'height', 16, 720);
  if (!Number.isInteger(options.fps) || !Number.isInteger(options.width) || !Number.isInteger(options.height) || options.width % 2 || options.height % 2) throw new Error('fps must be integer and dimensions must be even integers');
  options.introSeconds = number(input.introSeconds, 15, 'introSeconds', 0.1, 60);
  options.bodySeconds = number(input.bodySeconds, 10, 'bodySeconds', 0.1, 60);
  options.fadeSeconds = number(input.fadeSeconds, 2.5, 'fadeSeconds', 1 / options.fps, options.introSeconds);
  if (options.fadeSeconds >= Math.min(options.introSeconds, options.bodySeconds)) throw new Error('fadeSeconds must be shorter than both intro and body');
  options.transitionCurve = input.transitionCurve ?? 'linear';
  if (!['linear', 'smoothstep'].includes(options.transitionCurve)) throw new Error('transitionCurve must be linear or smoothstep');
  options.initialGain = number(input.initialGain, 10 ** (-6 / 20), 'initialGain', 0.01, 1);
  options.onsetSeconds = number(input.onsetSeconds, Math.min(1.5, options.introSeconds), 'onsetSeconds', 0, options.introSeconds);
  const alignment = input.anchorAlignment ?? {};
  options.anchorAlignment = {
    scale: number(alignment.scale, 1, 'anchorAlignment.scale', 1, 1.5),
    translateX: number(alignment.translateX, 0, 'anchorAlignment.translateX', -0.25, 0.25),
    translateY: number(alignment.translateY, 0, 'anchorAlignment.translateY', -0.25, 0.25),
  };
  const safeOffset = (options.anchorAlignment.scale - 1) / 2;
  if (Math.abs(options.anchorAlignment.translateX) > safeOffset || Math.abs(options.anchorAlignment.translateY) > safeOffset) throw new Error('Anchor translation would expose an image edge; increase alignment scale');
  options.durations = [...new Set((input.durations ?? [30, 180]).map(value => number(value, undefined, 'duration', options.introSeconds, 180)))].sort((a, b) => a - b);
  if (!options.durations.length || options.durations.length > 8) throw new Error('Provide one to eight output durations');
  for (const seconds of [options.introSeconds, options.bodySeconds, options.fadeSeconds, ...options.durations]) {
    if (Math.abs(seconds * options.fps - Math.round(seconds * options.fps)) > 1e-6) throw new Error('All durations must contain an integer number of video frames');
  }
  return options;
}

function planTimeline(options) {
  const introFrames = Math.round(options.introSeconds * options.fps);
  const bodyFrames = Math.round(options.bodySeconds * options.fps);
  const fadeFrames = Math.round(options.fadeSeconds * options.fps);
  return { introFrames, bodyFrames, fadeFrames, transitionCurve: options.transitionCurve ?? 'linear', bodyStartsAtFrame: introFrames - fadeFrames,
    bodyStartsAtSeconds: options.introSeconds - options.fadeSeconds, introOccurrences: 1,
    firstBodyOnlyFrame: introFrames, bodyPhaseAtFirstBodyOnlyFrame: fadeFrames % bodyFrames };
}

function framePlan(timeline, outputFrame) {
  if (!Number.isInteger(outputFrame) || outputFrame < 0) throw new Error('outputFrame must be a nonnegative integer');
  const { introFrames, bodyFrames, fadeFrames, bodyStartsAtFrame } = timeline;
  const inIntro = outputFrame < introFrames;
  const position = Math.min(1, Math.max(0, (outputFrame - bodyStartsAtFrame) / fadeFrames));
  const bodyAlpha = timeline.transitionCurve === 'smoothstep' ? position * position * (3 - 2 * position) : position;
  return { introFrame: inIntro ? outputFrame : null,
    bodyFrame: outputFrame >= bodyStartsAtFrame ? (outputFrame - bodyStartsAtFrame) % bodyFrames : null,
    bodyAlpha };
}

function videoFilter(options, timeline, seconds) {
  const fit = `fps=${options.fps},scale=${options.width}:${options.height}:force_original_aspect_ratio=increase,crop=${options.width}:${options.height},setsar=1,format=yuv420p`;
  const alignment = options.anchorAlignment;
  const alignedWidth = Math.ceil(options.width * alignment.scale / 2) * 2;
  const alignedHeight = Math.ceil(options.height * alignment.scale / 2) * 2;
  const align = `scale=${alignedWidth}:${alignedHeight},crop=${options.width}:${options.height}:${Math.round((alignedWidth - options.width) / 2 - alignment.translateX * options.width)}:${Math.round((alignedHeight - options.height) / 2 - alignment.translateY * options.height)}`;
  // xfade's P is the intro weight (1 -> 0). Ease that weight uniformly on
  // every plane, preserving forward body playback throughout the dissolve.
  const transition = options.transitionCurve === 'smoothstep'
    ? "transition=custom:expr='A*(P*P*(3-2*P))+B*(1-P*P*(3-2*P))'"
    : 'transition=fade';
  return `[0:v:0]${fit},${align},trim=end_frame=${timeline.introFrames},setpts=PTS-STARTPTS,settb=AVTB[intro];` +
    `[1:v:0]${fit},setpts=PTS-STARTPTS,settb=AVTB[body];` +
    `[intro][body]xfade=${transition}:duration=${options.fadeSeconds}:offset=${timeline.bodyStartsAtSeconds},trim=end_frame=${Math.round(seconds * options.fps)},setpts=PTS-STARTPTS,format=yuv420p[out]`;
}

async function probe(file, countFrames = false) {
  const result = JSON.parse((await run('ffprobe', ['-v', 'error', ...(countFrames ? ['-count_frames'] : []), '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,duration,nb_read_frames,nb_frames,sample_rate,channels', '-of', 'json', file])).toString());
  return { duration: Number(result.format?.duration), streams: result.streams || [] };
}

async function decodedFrameCount(file, fps) {
  const raw = await run('ffmpeg', [...BASE, '-i', file, '-map', '0:v:0', '-an', '-vf', `fps=${fps},scale=2:2,format=gray`, '-f', 'rawvideo', '-'], { maxBytes: 64 * 1024 });
  if (!raw.length || raw.length % 4) throw new Error('Cannot verify input video frame count');
  return raw.length / 4;
}

async function audioMetrics(file, seconds, onsetSeconds = 0) {
  const raw = await run('ffmpeg', [...BASE, '-i', file, '-map', '0:a:0', '-ac', '2', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'], { maxBytes: Math.ceil((seconds + 1) * SAMPLE_RATE * 8) });
  const samples = raw.length / 8, window = SAMPLE_RATE / 10;
  const channelPeaks = [0, 0];
  let peak = 0, square = 0, nonfiniteSamples = 0, silent100msWindows = 0, silent100msWindowsAfterOnset = 0, minimum100msRms = Infinity;
  for (let index = 0; index < samples; index++) {
    for (let channel = 0; channel < 2; channel++) {
      const value = raw.readFloatLE(index * 8 + channel * 4);
      if (!Number.isFinite(value)) { nonfiniteSamples++; continue; }
      channelPeaks[channel] = Math.max(channelPeaks[channel], Math.abs(value));
      peak = Math.max(peak, Math.abs(value)); square += value * value;
    }
    if ((index + 1) % window === 0) {
      const rms = Math.sqrt(square / (window * 2)); minimum100msRms = Math.min(minimum100msRms, rms);
      if (rms < 0.0001) {
        silent100msWindows++;
        if ((index + 1 - window) / SAMPLE_RATE >= onsetSeconds) silent100msWindowsAfterOnset++;
      }
      square = 0;
    }
  }
  return { samples, decodedSeconds: samples / SAMPLE_RATE, channels: 2, peak, channelPeaks, nonfiniteSamples, silent100msWindows, silent100msWindowsAfterOnset, minimum100msRms };
}

function requireAudioIntegrity(metrics) {
  if (metrics.nonfiniteSamples || !Number.isFinite(metrics.peak) || metrics.peak >= 1) throw new Error('Audio contains nonfinite or clipped samples in one or more channels');
  if (metrics.silent100msWindowsAfterOnset) throw new Error('Audio contains near-silent 100ms windows after the intended onset');
}

async function packetMetrics(file) {
  const packets = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_packets', '-show_entries', 'packet=stream_index,dts_time,duration_time', '-of', 'json', file], { maxBytes: 8 * 1024 ** 2 })).toString()).packets || [];
  const streams = {};
  for (const packet of packets) {
    const dts = Number(packet.dts_time), duration = Number(packet.duration_time);
    if (!Number.isFinite(dts) || !Number.isFinite(duration)) continue;
    const state = streams[packet.stream_index] ||= { packets: 0, nonMonotonicDts: 0, maxGapSeconds: 0 };
    if (state.packets) { if (dts <= state.lastDts) state.nonMonotonicDts++; state.maxGapSeconds = Math.max(state.maxGapSeconds, dts - state.lastEnd); }
    state.packets++; state.lastDts = dts; state.lastEnd = dts + duration;
  }
  return streams;
}

async function renderHealingRainIntro(input) {
  const options = normalizeOptions(input), timeline = planTimeline(options);
  const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const parent = path.dirname(options.outputDir), disk = await fs.statfs(parent);
  if (disk.bavail * disk.bsize < 10 * 1024 ** 3 + 200 * 1024 ** 2) throw new Error('Preserve at least 10 GiB free disk plus render headroom');
  for (const file of [options.introPath, options.bodyPath, options.audioPath]) if (!(await fs.stat(file)).isFile()) throw new Error(`Not a regular media file: ${file}`);
  const introCount = await decodedFrameCount(options.introPath, options.fps);
  const bodyCount = await decodedFrameCount(options.bodyPath, options.fps);
  if (introCount < timeline.introFrames) throw new Error(`Intro needs ${timeline.introFrames} decoded frames; got ${introCount}. No padding or slowdown is allowed.`);
  if (bodyCount !== timeline.bodyFrames) throw new Error(`Body loop must contain exactly ${timeline.bodyFrames} decoded frames; got ${bodyCount}`);
  const bodyInfo = await probe(options.bodyPath), bodyVideo = bodyInfo.streams.find(stream => stream.codec_type === 'video');
  if (!bodyVideo || !Number.isFinite(Number(bodyVideo.duration)) || !Number.isFinite(bodyInfo.duration) || Math.abs(Number(bodyVideo.duration) - options.bodySeconds) > 0.001 || Math.abs(bodyInfo.duration - options.bodySeconds) > 0.001) throw new Error('Body video and container timelines must both match the exact loop duration');
  const maxSeconds = options.durations.at(-1), audioInfo = await probe(options.audioPath);
  if (!audioInfo.streams.some(stream => stream.codec_type === 'audio') || audioInfo.duration < maxSeconds - 1 / SAMPLE_RATE) throw new Error('Continuous source audio must cover the longest output');
  // mkdir is intentionally exclusive; prior renders and every source are safe.
  await fs.mkdir(options.outputDir);
  const report = { version: 1, status: 'rendering', startedAt: new Date().toISOString(),
    sourceIntro: options.introPath, sourceBody: options.bodyPath, sourceAudio: options.audioPath,
    introDecodedFrames: introCount, introTrimmedFrames: introCount - timeline.introFrames, bodyDecodedFrames: bodyCount,
    fps: options.fps, width: options.width, height: options.height, timeline, anchorAlignment: options.anchorAlignment,
    audio: { sourceStartsAtSeconds: 0, initialGain: options.initialGain, initialGainDb: 20 * Math.log10(options.initialGain), onsetSeconds: options.onsetSeconds, onsetCurve: 'half sine', rampSeconds: options.introSeconds, rampCurve: 'smoothstep in dB', gainAfterRamp: 1, sampleRate: SAMPLE_RATE, noEndFade: true },
    videoEncoding: { codec: 'libx264', crf: 23, maxrate: 1600000, bufferBits: 3200000, maxBytes: MAX_BYTES },
    outputs: [], warnings: [] };
  try {
    const wav = path.join(options.outputDir, `audio-intro-ramp-${maxSeconds}s.wav`);
    report.audio.wav = wav;
    progress('Rendering one continuous audio bed with a gentle intro gain ramp');
    const rampPosition = `min(t/${options.introSeconds},1)`;
    const smoothRamp = `(${rampPosition}*${rampPosition}*(3-2*${rampPosition}))`;
    const gain = `pow(10,(${20 * Math.log10(options.initialGain)}*(1-${smoothRamp}))/20)`;
    const onset = options.onsetSeconds ? `,afade=t=in:ss=0:ns=${Math.round(options.onsetSeconds * SAMPLE_RATE)}:curve=hsin` : '';
    await run('ffmpeg', [...BASE, '-i', options.audioPath, '-map', '0:a:0', '-vn', '-af', `aresample=${SAMPLE_RATE}:async=0:first_pts=0,aformat=channel_layouts=stereo,atrim=end_sample=${Math.round(maxSeconds * SAMPLE_RATE)},asetpts=PTS-STARTPTS,aeval='val(0)*${gain}|val(1)*${gain}'${onset}`, '-c:a', 'pcm_s24le', wav]);
    report.audio.pcmMetrics = await audioMetrics(wav, maxSeconds, options.onsetSeconds);
    if (report.audio.pcmMetrics.samples !== Math.round(maxSeconds * SAMPLE_RATE)) throw new Error('Audio source decoded shorter than required duration');
    requireAudioIntegrity(report.audio.pcmMetrics);
    const master = path.join(options.outputDir, `healing-rain-intro-${maxSeconds}s.mp4`);
    progress(`Rendering ${maxSeconds}s with the intro once and a forward body loop`);
    await run('ffmpeg', [...BASE, '-i', options.introPath, '-stream_loop', '-1', '-i', options.bodyPath, '-i', wav, '-filter_complex_threads', '1', '-filter_complex', videoFilter(options, timeline, maxSeconds), '-map', '[out]', '-map', '2:a:0', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-maxrate', '1600000', '-bufsize', '3200000', '-x264-params', 'vbv-init=0.5', '-pix_fmt', 'yuv420p', '-r', String(options.fps), '-fps_mode', 'cfr', '-g', String(options.fps), '-keyint_min', String(options.fps), '-sc_threshold', '0', '-bf', '0', '-video_track_timescale', String(options.fps * 1000), '-c:a', 'aac', '-b:a', '192k', '-ar', String(SAMPLE_RATE), '-t', String(maxSeconds), '-movflags', '+faststart', master]);
    for (const seconds of options.durations) {
      const video = path.join(options.outputDir, `healing-rain-intro-${seconds}s.mp4`);
      if (seconds !== maxSeconds) {
        // Copy the same video prefix and encode the same PCM-bed prefix. AAC
        // packets cannot be cut at arbitrary samples by stream copy without
        // extending the MP4 duration; this encode trims exactly at the endpoint.
        await run('ffmpeg', [...BASE, '-i', master, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', String(SAMPLE_RATE), '-t', String(seconds), '-movflags', '+faststart', video]);
      }
      progress(`Verifying ${seconds}s duration, decoded frames and audio continuity`);
      const media = await probe(video, true), packets = await packetMetrics(video), audio = await audioMetrics(video, seconds, options.onsetSeconds);
      const bytes = (await fs.stat(video)).size, stream = media.streams.find(item => item.codec_type === 'video');
      if (Number(stream?.nb_read_frames) !== Math.round(seconds * options.fps)) throw new Error('Output decoded video frame count is not exact');
      if (Math.abs(media.duration - seconds) > 0.001) throw new Error(`Output container duration is ${media.duration}, expected ${seconds}`);
      if (audio.samples < Math.round(seconds * SAMPLE_RATE) || audio.samples > Math.round(seconds * SAMPLE_RATE) + 1024) throw new Error('Unexpected AAC duration or gap');
      if (bytes >= MAX_BYTES) throw new Error('Output exceeds 45 MiB budget');
      for (const metrics of Object.values(packets)) if (metrics.nonMonotonicDts || metrics.maxGapSeconds > 0.0001) throw new Error('Output packet timestamps contain a gap or reversal');
      requireAudioIntegrity(audio);
      report.outputs.push({ seconds, video, bytes, withinUploadBudget: true, media, audioMetrics: audio, packetMetrics: packets, sameMasterVideoPrefix: true, samePcmBedPrefix: true });
    }
    report.status = 'complete'; report.completedAt = new Date().toISOString();
    report.reportPath = path.join(options.outputDir, 'intro-render-report.json');
    await fs.writeFile(report.reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return report;
  } catch (error) {
    report.status = 'failed'; report.error = String(error.message).slice(0, 4096);
    await fs.writeFile(path.join(options.outputDir, 'intro-render-failure.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }).catch(() => {});
    throw error;
  }
}

function parseCli(argv) {
  const names = { '--intro': 'introPath', '--body': 'bodyPath', '--audio': 'audioPath', '--output-dir': 'outputDir', '--intro-seconds': 'introSeconds', '--body-seconds': 'bodySeconds', '--fade-seconds': 'fadeSeconds', '--transition-curve': 'transitionCurve', '--initial-gain': 'initialGain', '--onset-seconds': 'onsetSeconds', '--fps': 'fps', '--width': 'width', '--height': 'height' };
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index], value = argv[++index];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === '--anchor-alignment') options.anchorAlignment = JSON.parse(value);
    else if (flag === '--durations') options.durations = value.split(',');
    else if (names[flag]) options[names[flag]] = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

module.exports = { normalizeOptions, planTimeline, framePlan, videoFilter, parseCli, audioMetrics, requireAudioIntegrity, renderHealingRainIntro };
if (require.main === module) {
  if (process.argv.includes('--help')) process.stdout.write('Usage: node worker/healing-rain-intro-render.js --intro /absolute/intro.mp4 --body /absolute/body-loop.mp4 --audio /absolute/continuous-bed.wav --output-dir /absolute/NEW-directory [--durations 30,180] [--intro-seconds 15] [--body-seconds 10] [--fade-seconds 2.5] [--transition-curve linear|smoothstep] [--initial-gain 0.501187] [--onset-seconds 1.5] [--anchor-alignment JSON]\n');
  else Promise.resolve().then(() => renderHealingRainIntro({ ...parseCli(process.argv.slice(2)), onProgress: stage => process.stderr.write(`${stage}\n`) }))
    .then(report => process.stdout.write(JSON.stringify({ status: report.status, reportPath: report.reportPath, outputs: report.outputs.map(({ seconds, video, bytes }) => ({ seconds, video, bytes })), warnings: report.warnings }, null, 2) + '\n'))
    .catch(error => { process.stderr.write(`Intro render failed: ${String(error.message).slice(0, 4096)}\n`); process.exitCode = 1; });
}
