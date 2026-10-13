#!/usr/bin/env node
'use strict';

// Local-only assembler. Every subprocess uses an argv array; source paths never
// enter a shell, filter graph, or concat-list document.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const { prepareBranding, brandingFilter } = require('./healing-rain-branding');

const SAMPLE_RATE = 48000;
const MIN_FREE_BYTES = 10 * 1024 ** 3;
const BASE = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n'];
const LOUDNESS_TARGET_LUFS = -26;
const TAKE_TRUE_PEAK_CEILING_DB = -6;
const MAX_TAKE_BOOST_DB = 36;
const VIDEO_CRF = 23;
const VIDEO_MAXRATE = 1600000;
const VIDEO_BUFFER_BITS = 3200000;
const MAX_PREVIEW_BYTES = 45 * 1024 ** 2;

function run(command, args, { maxBytes = 32 * 1024 ** 2, timeoutMs = 30 * 60 * 1000, captureStderr = false } = {}) {
  // Local manifests must not cause FFmpeg to fetch nested network resources.
  if (command === 'ffmpeg') args = args.flatMap(arg => arg === '-i' ? ['-protocol_whitelist', 'file,pipe', '-i'] : [arg]);
  if (command === 'ffprobe') args = ['-protocol_whitelist', 'file,pipe', ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0, stderr = '', failure;
    const timer = setTimeout(() => { failure = new Error(`${command} timed out`); child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { failure = new Error(`${command} exceeded the bounded diagnostic limit`); child.kill('SIGKILL'); }
      else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4096); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure || code !== 0) reject(failure || new Error(`${command} exited ${code}: ${stderr.trim()}`));
      else resolve(captureStderr ? Buffer.from(stderr) : Buffer.concat(chunks));
    });
  });
}

async function probe(file) {
  const data = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).toString());
  return { streams: data.streams || [], duration: Number(data.format?.duration) };
}

function numeric(value, fallback, name, min, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return number;
}

function normalizeOptions(options) {
  options = { ...options, videoPath: options.videoPath ?? options.video, audioPaths: options.audioPaths ?? options.audio, targetSeconds: options.targetSeconds ?? options.seconds };
  const fps = numeric(options.fps, 24, 'fps', 12, 60);
  if (!Number.isInteger(fps)) throw new Error('fps must be an integer');
  const targetSeconds = numeric(options.targetSeconds, 180, 'targetSeconds', 1, 600);
  const previewSeconds = numeric(options.previewSeconds, Math.min(30, targetSeconds), 'previewSeconds', 1, targetSeconds);
  const audioCrossfadeSeconds = numeric(options.audioCrossfadeSeconds, 2, 'audioCrossfadeSeconds', 0.02, 10);
  if (audioCrossfadeSeconds >= previewSeconds) throw new Error('Audio crossfade must be shorter than the preview');
  for (const duration of [targetSeconds, previewSeconds]) {
    if (Math.abs(duration * fps - Math.round(duration * fps)) > 1e-6) throw new Error('Output durations must contain an integer number of frames');
  }
  const videoCrossfadeSeconds = Math.round(numeric(options.videoCrossfadeSeconds, 1, 'videoCrossfadeSeconds', 0.05, 5) * fps) / fps;
  const targetVideoCycleSeconds = options.targetVideoCycleSeconds === undefined ? undefined : numeric(options.targetVideoCycleSeconds, undefined, 'targetVideoCycleSeconds', 0.1, 55);
  if (targetVideoCycleSeconds !== undefined && Math.abs(targetVideoCycleSeconds * fps - Math.round(targetVideoCycleSeconds * fps)) > 1e-6) throw new Error('Target video cycle must contain an integer number of frames');
  const maxWidth = numeric(options.maxWidth, 1920, 'maxWidth', 64, 3840);
  if (!Number.isInteger(maxWidth) || maxWidth % 2) throw new Error('maxWidth must be an even integer');
  if (!Array.isArray(options.audioPaths) || options.audioPaths.length < 1 || options.audioPaths.length > 32) throw new Error('Provide 1–32 audioPaths');
  for (const file of [options.videoPath, ...options.audioPaths, options.outputDir]) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || /[\0\r\n]/.test(file)) throw new Error('All input paths and outputDir must be absolute local paths without line breaks');
  }
  return { ...options, fps, targetSeconds, previewSeconds, audioCrossfadeSeconds, videoCrossfadeSeconds, targetVideoCycleSeconds, maxWidth };
}

function planVideoLoop(availableFrames, fps, fadeSeconds, targetCycleSeconds) {
  const fadeFrames = Math.round(fadeSeconds * fps);
  const cycleFrames = targetCycleSeconds === undefined ? availableFrames - fadeFrames : Math.round(targetCycleSeconds * fps);
  const sourceFrames = cycleFrames + fadeFrames;
  if (sourceFrames <= fadeFrames * 2) throw new Error('Video cycle must be longer than the video crossfade');
  if (sourceFrames > availableFrames) throw new Error(`Source video has ${availableFrames} decoded frames at ${fps} fps; ${sourceFrames} frames are required for the requested ${targetCycleSeconds}s cycle. No padding or slowdown is allowed.`);
  return { sourceFrames, cycleFrames, fadeFrames, cycleSeconds: cycleFrames / fps, trimmedFrames: availableFrames - sourceFrames };
}

async function countVideoFrames(file, streamIndex, fps) {
  // Count real decoded CFR frames using four bytes per tiny grayscale frame.
  // Metadata duration can include provider padding or overstate decodable media.
  const frames = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-map', `0:${streamIndex}`, '-an', '-vf', `fps=${fps},scale=2:2,format=gray`, '-f', 'rawvideo', '-'], { maxBytes: 64 * 1024 });
  if (!frames.length || frames.length % 4) throw new Error('Source video frame count could not be verified');
  return frames.length / 4;
}

function planAudioSequence(durations, targetSeconds, overlap) {
  if (durations.some(duration => !Number.isFinite(duration) || duration <= overlap * 2)) throw new Error('Every audio take must be longer than twice the audio crossfade');
  const sequence = [];
  let available = 0;
  while (available + 1 / SAMPLE_RATE < targetSeconds + overlap) {
    if (sequence.length >= 256) throw new Error('Audio would need more than 256 repetitions; provide longer takes');
    const index = sequence.length % durations.length;
    sequence.push({ sourceIndex: index, startsAt: sequence.length ? available - overlap : 0, duration: durations[index] });
    available += durations[index] - (sequence.length > 1 ? overlap : 0);
  }
  return { sequence, availableSeconds: available, requiredSeconds: targetSeconds + overlap };
}

async function diskState(directory) {
  const stat = await fs.statfs(directory);
  const freeBytes = stat.bavail * stat.bsize;
  let sessionAllocatedKiB = null;
  // Size only: no session recording is opened or printed.
  try {
    const output = await run('du', ['-sk', path.join(os.homedir(), '.codex', 'sessions')], { maxBytes: 4096, timeoutMs: 15000 });
    sessionAllocatedKiB = Number.parseInt(output.toString(), 10);
  } catch { /* Non-Codex worker hosts may have no session directory. */ }
  return { freeBytes, sessionAllocatedKiB };
}

async function requireSpace(directory, projectedBytes = 0) {
  const stat = await fs.statfs(directory);
  if (stat.bavail * stat.bsize < MIN_FREE_BYTES + projectedBytes) throw new Error('Insufficient disk space: preserve 10 GiB free plus the estimated render size');
}

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] || 0;
}

async function videoSeamMetrics(loopPath, fps) {
  const bytes = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', loopPath, '-vf', 'scale=160:90,format=gray', '-f', 'rawvideo', '-'], { maxBytes: 64 * 1024 ** 2 });
  const frameBytes = 160 * 90, count = Math.floor(bytes.length / frameBytes);
  const difference = (a, b) => {
    let sum = 0;
    for (let pixel = 0; pixel < frameBytes; pixel++) sum += Math.abs(bytes[a * frameBytes + pixel] - bytes[b * frameBytes + pixel]);
    return sum / frameBytes / 255;
  };
  const differences = Array.from({ length: count - 1 }, (_, index) => difference(index, index + 1));
  const wrap = difference(count - 1, 0), p95 = percentile(differences, 0.95);
  return {
    decodedFrames: count, decodedSeconds: count / fps, analysisSize: '160x90 grayscale',
    wrapMeanAbsoluteDifference: wrap, interiorMedianDifference: percentile(differences, 0.5),
    interiorP95Difference: p95, wrapToInteriorP95Ratio: p95 ? wrap / p95 : (wrap ? null : 0),
    note: 'Small differences measure continuity, not perceptual realism or source motion direction. No reverse or ping-pong transform is used.',
  };
}

async function audioMetrics(file, seconds) {
  const bytes = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'], { maxBytes: Math.ceil((seconds + 2) * SAMPLE_RATE * 4) });
  const count = bytes.length / 4, window = SAMPLE_RATE / 10;
  let peak = 0, square = 0, windowSquare = 0, minimumWindowRms = Infinity, silentWindows = 0, maxStep = 0, previous = 0;
  for (let sample = 0; sample < count; sample++) {
    const value = bytes.readFloatLE(sample * 4);
    peak = Math.max(peak, Math.abs(value)); square += value * value; windowSquare += value * value;
    if (sample) maxStep = Math.max(maxStep, Math.abs(value - previous));
    previous = value;
    if ((sample + 1) % window === 0) {
      const rms = Math.sqrt(windowSquare / window);
      minimumWindowRms = Math.min(minimumWindowRms, rms);
      if (rms < 0.0001) silentWindows++;
      windowSquare = 0;
    }
  }
  const first = count ? bytes.readFloatLE(0) : 0;
  return { samples: count, decodedSeconds: count / SAMPLE_RATE, peak, rms: Math.sqrt(square / count), minimum100msRms: minimumWindowRms, silent100msWindows: silentWindows, maxAdjacentSampleStep: maxStep, wrapSampleStep: Math.abs(previous - first), analysis: 'Mono downmix; 100 ms silence threshold -80 dBFS' };
}

async function measureLoudness(file) {
  // loudnorm is used only as an analyzer here; its processed samples go to null.
  // The actual take receives a single fixed gain, with no dynamic compression.
  const diagnostic = (await run('ffmpeg', ['-hide_banner', '-nostdin', '-i', file, '-map', '0:a:0', '-vn', '-af', `aresample=48000:async=0:first_pts=0,aformat=channel_layouts=stereo,loudnorm=I=${LOUDNESS_TARGET_LUFS}:TP=${TAKE_TRUE_PEAK_CEILING_DB}:LRA=50:print_format=json`, '-f', 'null', '-'], { captureStderr: true, maxBytes: 4096 })).toString();
  let measured;
  try { measured = JSON.parse(diagnostic.slice(diagnostic.lastIndexOf('{'), diagnostic.lastIndexOf('}') + 1)); }
  catch { throw new Error('FFmpeg did not return valid bounded loudness measurements'); }
  const integratedLufs = Number(measured.input_i), truePeakDb = Number(measured.input_tp), loudnessRangeLu = Number(measured.input_lra);
  return { integratedLufs: Number.isFinite(integratedLufs) ? integratedLufs : null, truePeakDb: Number.isFinite(truePeakDb) ? truePeakDb : null, loudnessRangeLu: Number.isFinite(loudnessRangeLu) ? loudnessRangeLu : null };
}

async function packetMetrics(file) {
  const result = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_packets', '-show_entries', 'packet=stream_index,dts_time,pts_time,duration_time', '-of', 'json', file])).toString());
  const streams = {};
  for (const packet of result.packets || []) {
    const dts = Number(packet.dts_time), duration = Number(packet.duration_time);
    if (!Number.isFinite(dts) || !Number.isFinite(duration)) continue;
    const current = streams[packet.stream_index] ||= { packets: 0, nonMonotonicDts: 0, maxTimestampGapSeconds: 0, firstDts: dts, lastEnd: dts };
    if (current.packets) {
      if (dts <= current.lastDts) current.nonMonotonicDts++;
      current.maxTimestampGapSeconds = Math.max(current.maxTimestampGapSeconds, dts - current.lastEnd);
    }
    current.packets++; current.lastDts = dts; current.lastEnd = dts + duration;
  }
  return streams;
}

async function renderHealingRain(rawOptions) {
  const options = normalizeOptions(rawOptions);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const outputDir = path.resolve(options.outputDir), parent = path.dirname(outputDir);
  const sourcePaths = [options.videoPath, ...options.audioPaths];
  for (const file of sourcePaths) {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error(`Not a regular source file: ${file}`);
  }
  await requireSpace(parent, options.targetSeconds * 1024 ** 2 * 3);
  const before = await diskState(parent);
  const version = (await run('ffmpeg', ['-version'], { maxBytes: 16384 })).toString().split('\n')[0];
  const sourceVideo = await probe(options.videoPath);
  const videoStream = sourceVideo.streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  if (!videoStream) throw new Error('Source has no video stream');
  const sourceSeconds = Number(videoStream.duration) || sourceVideo.duration;
  if (!Number.isFinite(sourceSeconds) || sourceSeconds <= 0 || sourceSeconds > 60) throw new Error('Source video must be at most 60 seconds');
  const availableVideoFrames = await countVideoFrames(options.videoPath, videoStream.index, options.fps);
  const videoPlan = planVideoLoop(availableVideoFrames, options.fps, options.videoCrossfadeSeconds, options.targetVideoCycleSeconds);
  const { sourceFrames: videoFrames, fadeFrames, cycleFrames, cycleSeconds } = videoPlan;
  // This deliberately fails if the target directory exists, including a symlink.
  // No source, previous render, or user-owned artifact can be overwritten.
  await fs.mkdir(outputDir);
  const report = {
    status: 'rendering', version: 1, startedAt: new Date().toISOString(), ffmpeg: version,
    sourceVideo: options.videoPath, sourceAudio: options.audioPaths, outputDir,
    sampleRate: SAMPLE_RATE, fps: options.fps, sourceVideoSeconds: sourceSeconds,
    sourceDecodedVideoFrames: availableVideoFrames, usedSourceVideoFrames: videoFrames,
    trimmedSourceVideoFrames: videoPlan.trimmedFrames, usedSourceVideoSeconds: videoFrames / options.fps,
    targetVideoCycleSeconds: options.targetVideoCycleSeconds ?? null,
    videoCrossfadeSeconds: fadeFrames / options.fps, effectiveVideoCycleSeconds: cycleSeconds,
    videoEncoding: { codec: 'libx264', crf: VIDEO_CRF, maxrateBitsPerSecond: VIDEO_MAXRATE, bufferBits: VIDEO_BUFFER_BITS, initialBufferFraction: 0.5, maxPreviewBytes: MAX_PREVIEW_BYTES },
    audioCrossfadeSeconds: options.audioCrossfadeSeconds, audioGainDb: -3.1,
    audioNormalization: { method: 'EBU R128 analysis followed by one constant gain per take; no compression or pitch change', targetLufs: LOUDNESS_TARGET_LUFS, sourceTruePeakCeilingDb: TAKE_TRUE_PEAK_CEILING_DB, maxBoostDb: MAX_TAKE_BOOST_DB, takes: [] },
    motion: 'Forward playback only, tail-to-head dissolve; source motion direction requires visual review',
    diskBefore: before, outputs: [], warnings: [],
  };
  try {
    const normalizedAudio = [], durations = [];
    onProgress('Measuring and matching audio take loudness with fixed gains');
    for (let index = 0; index < options.audioPaths.length; index++) {
      await requireSpace(outputDir);
      const input = options.audioPaths[index], info = await probe(input);
      if (!info.streams.some(stream => stream.codec_type === 'audio')) throw new Error(`Source has no audio stream: ${input}`);
      if (!Number.isFinite(info.duration) || info.duration <= 0 || info.duration > 120) throw new Error('Each source audio take must be at most 120 seconds');
      const loudness = await measureLoudness(input);
      if (loudness.integratedLufs === null || loudness.truePeakDb === null) throw new Error(`Audio take ${index + 1} is too short or quiet for reliable loudness matching`);
      const desiredGainDb = LOUDNESS_TARGET_LUFS - loudness.integratedLufs;
      const peakLimitedGainDb = TAKE_TRUE_PEAK_CEILING_DB - loudness.truePeakDb;
      const gainDb = Math.min(desiredGainDb, peakLimitedGainDb, MAX_TAKE_BOOST_DB);
      const normalization = { sourceIndex: index, input: loudness, gainDb, expectedIntegratedLufs: loudness.integratedLufs + gainDb, expectedTruePeakDb: loudness.truePeakDb + gainDb, limitedBy: gainDb < desiredGainDb - 0.01 ? (peakLimitedGainDb < MAX_TAKE_BOOST_DB ? 'peak_headroom' : 'maximum_boost') : null };
      report.audioNormalization.takes.push(normalization);
      if (normalization.limitedBy) report.warnings.push(`Audio take ${index + 1} could not reach the loudness target with fixed gain: ${normalization.limitedBy}`);
      const normalized = path.join(outputDir, `pcm-take-${String(index + 1).padStart(2, '0')}.wav`);
      await run('ffmpeg', [...BASE, '-i', input, '-map', '0:a:0', '-vn', '-af', `aresample=48000:async=0:first_pts=0,aformat=channel_layouts=stereo,volume=${gainDb}dB`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', normalized]);
      normalizedAudio.push(normalized); durations.push((await probe(normalized)).duration);
    }
    const audioPlan = planAudioSequence(durations, options.targetSeconds, options.audioCrossfadeSeconds);
    report.audioSequence = audioPlan;
    report.normalizedAudio = normalizedAudio;
    const fade = options.audioCrossfadeSeconds;
    const targets = [...new Set([options.previewSeconds, options.targetSeconds])];
    const inputs = audioPlan.sequence.flatMap(entry => ['-i', normalizedAudio[entry.sourceIndex]]);
    const filters = audioPlan.sequence.map((_, index) => `[${index}:a]asetpts=PTS-STARTPTS[a${index}]`);
    let previous = 'a0';
    for (let index = 1; index < audioPlan.sequence.length; index++) {
      const next = `mix${index}`;
      filters.push(`[${previous}][a${index}]acrossfade=d=${fade}:c1=qsin:c2=qsin[${next}]`);
      previous = next;
    }
    filters.push(`[${previous}]asplit=${targets.length * 2}${targets.map((_, index) => `[body${index}][head${index}]`).join('')}`);
    const audioOutputArgs = [];
    for (let index = 0; index < targets.length; index++) {
      const seconds = targets[index];
      const wav = path.join(outputDir, `audio-continuous-${seconds}s.wav`);
      filters.push(`[body${index}]atrim=start=${fade}:end=${seconds + fade},asetpts=PTS-STARTPTS[b${index}]`);
      filters.push(`[head${index}]atrim=end=${fade},asetpts=PTS-STARTPTS[h${index}]`);
      filters.push(`[b${index}][h${index}]acrossfade=d=${fade}:c1=qsin:c2=qsin,volume=-3.1dB,atrim=end_sample=${Math.round(seconds * SAMPLE_RATE)}[out${index}]`);
      audioOutputArgs.push('-map', `[out${index}]`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', wav);
      report.outputs.push({ seconds, wav, video: path.join(outputDir, `healing-rain-${seconds}s.mp4`), videoEndpointClosesCycle: Math.abs(seconds / cycleSeconds - Math.round(seconds / cycleSeconds)) < 1e-6 });
    }
    onProgress('Assembling crossfaded PCM timelines, including each endpoint');
    await requireSpace(outputDir);
    await run('ffmpeg', [...BASE, ...inputs, '-filter_complex', filters.join(';'), ...audioOutputArgs]);
    for (const output of report.outputs) {
      output.pcmMetrics = await audioMetrics(output.wav, output.seconds);
      output.pcmLoudness = await measureLoudness(output.wav);
      if (Math.abs(output.pcmMetrics.decodedSeconds - output.seconds) > 1 / SAMPLE_RATE) throw new Error('PCM timeline has an unexpected duration');
      if (output.pcmLoudness.truePeakDb === null || output.pcmLoudness.truePeakDb > -1) throw new Error('PCM output does not preserve at least 1 dB of measured true-peak headroom');
      if (output.pcmMetrics.silent100msWindows) report.warnings.push(`${output.seconds}s PCM contains ${output.pcmMetrics.silent100msWindows} near-silent 100 ms windows; inspect source takes`);
    }
    const loop = path.join(outputDir, 'video-loop.mp4');
    report.videoLoop = loop;
    // Start at source t=fade. Its tail crossfades into source [0,fade], so
    // the loop boundary resumes at the next forward frame around source t=fade.
    const videoFilter = `[0:${videoStream.index}]fps=${options.fps},scale=w='trunc(min(${options.maxWidth},iw)/2)*2':h=-2,setsar=1,format=yuv420p,trim=end_frame=${videoFrames},setpts=PTS-STARTPTS,settb=AVTB,split=2[body][head];[body]trim=start_frame=${fadeFrames},setpts=PTS-STARTPTS[b];[head]trim=end_frame=${fadeFrames},setpts=PTS-STARTPTS[h];[b][h]xfade=transition=fade:duration=${fadeFrames / options.fps}:offset=${(cycleFrames - fadeFrames) / options.fps},trim=end_frame=${cycleFrames},format=yuv420p[out]`;
    onProgress('Encoding one forward video cycle');
    await requireSpace(outputDir);
    await run('ffmpeg', [...BASE, '-i', options.videoPath, '-filter_complex_threads', '1', '-filter_complex', videoFilter, '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(VIDEO_CRF), '-maxrate', String(VIDEO_MAXRATE), '-bufsize', String(VIDEO_BUFFER_BITS), '-x264-params', 'vbv-init=0.5', '-pix_fmt', 'yuv420p', '-r', String(options.fps), '-fps_mode', 'cfr', '-g', String(cycleFrames), '-keyint_min', String(cycleFrames), '-sc_threshold', '0', '-bf', '0', '-video_track_timescale', String(options.fps * 1000), '-movflags', '+faststart', loop]);
    report.videoSeamMetrics = await videoSeamMetrics(loop, options.fps);
    if (report.videoSeamMetrics.decodedFrames !== cycleFrames) throw new Error('Video loop frame count is not exact');
    if (report.videoSeamMetrics.wrapToInteriorP95Ratio > 2) report.warnings.push('Video wrap difference is over twice its interior p95; visual review is required');
    const loopInfo = await probe(loop);
    const loopStream = loopInfo.streams.find(stream => stream.codec_type === 'video');
    const branding = await prepareBranding({ snapshot: options.brandingSnapshot, title: options.brandingTitle, logoFile: options.brandingLogoFile, width: loopStream.width, height: loopStream.height, outputDir });
    report.branding = branding?.receipt ?? { enabled: false };
    for (const output of report.outputs) {
      onProgress(`Muxing and checking ${output.seconds}s preview`);
      await requireSpace(outputDir);
      await run('ffmpeg', [...BASE, '-stream_loop', '-1', '-i', loop, '-i', output.wav, ...(branding ? ['-loop', '1', '-framerate', String(options.fps), '-i', branding.imagePath, '-filter_complex_threads', '1', '-filter_complex', brandingFilter(branding, '0:v', 2), '-map', '[branded]', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(VIDEO_CRF), '-maxrate', String(VIDEO_MAXRATE), '-bufsize', String(VIDEO_BUFFER_BITS), '-bf', '0'] : ['-map', '0:v:0', '-c:v', 'copy']), '-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(output.seconds), '-shortest', '-movflags', '+faststart', output.video]);
      output.bytes = (await fs.stat(output.video)).size;
      output.withinUploadBudget = output.bytes < MAX_PREVIEW_BYTES;
      if (!output.withinUploadBudget) throw new Error(`Preview exceeds the 45 MiB upload budget (${output.bytes} bytes); existing artifacts are preserved`);
      output.media = await probe(output.video);
      output.packetMetrics = await packetMetrics(output.video);
      output.aacMetrics = await audioMetrics(output.video, output.seconds);
      output.aacLoudness = await measureLoudness(output.video);
      if (output.aacLoudness.truePeakDb === null || output.aacLoudness.truePeakDb > -1) throw new Error('AAC output does not preserve at least 1 dB of measured true-peak headroom');
      const actualAudio = output.aacMetrics.decodedSeconds;
      if (actualAudio < output.seconds - 1 / SAMPLE_RATE || actualAudio > output.seconds + 1024 / SAMPLE_RATE + 1 / SAMPLE_RATE) throw new Error('Decoded AAC duration exceeds allowed encoder padding');
      if (Math.abs(output.media.duration - output.seconds) > 1 / options.fps + 0.001) throw new Error('Muxed duration does not match target');
      for (const metrics of Object.values(output.packetMetrics)) {
        if (metrics.nonMonotonicDts || metrics.maxTimestampGapSeconds > 0.0001) throw new Error('Mux contains a packet timestamp discontinuity');
      }
      if (output.aacMetrics.silent100msWindows > output.pcmMetrics.silent100msWindows) report.warnings.push(`${output.seconds}s AAC contains additional near-silent windows; inspect encoded audio`);
      // Full ffprobe stream metadata is unnecessary in the durable report.
      output.media = { duration: output.media.duration, streams: output.media.streams.map(stream => ({ type: stream.codec_type, codec: stream.codec_name, duration: Number(stream.duration), frames: Number(stream.nb_frames), width: stream.width, height: stream.height, sampleRate: stream.sample_rate, channels: stream.channels })) };
    }
    report.diskAfter = await diskState(outputDir);
    if (before.sessionAllocatedKiB !== null && report.diskAfter.sessionAllocatedKiB - before.sessionAllocatedKiB > 5 * 1024 ** 2) report.warnings.push('Codex session allocation grew by more than 5 GiB; stop further media work and diagnose');
    report.status = 'complete'; report.completedAt = new Date().toISOString();
    report.reportPath = path.join(outputDir, 'render-report.json');
    await fs.writeFile(report.reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return report;
  } catch (error) {
    report.status = 'failed'; report.error = String(error.message).slice(0, 4096);
    report.failedAt = new Date().toISOString();
    await fs.writeFile(path.join(outputDir, 'render-failure.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }).catch(() => {});
    throw error;
  }
}

function parseCli(argv) {
  const options = { audioPaths: [] };
  const names = { '--video': 'videoPath', '--output-dir': 'outputDir', '--seconds': 'targetSeconds', '--preview-seconds': 'previewSeconds', '--video-crossfade': 'videoCrossfadeSeconds', '--video-cycle': 'targetVideoCycleSeconds', '--audio-crossfade': 'audioCrossfadeSeconds', '--max-width': 'maxWidth', '--fps': 'fps' };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index], value = argv[++index];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === '--audio') options.audioPaths.push(value);
    else if (names[flag]) options[names[flag]] = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

module.exports = { renderHealingRain, normalizeOptions, planVideoLoop, planAudioSequence, parseCli };
if (require.main === module) {
  if (process.argv.includes('--help')) {
    process.stdout.write('Usage: node worker/healing-rain-render.js --video /absolute/clip.mp4 --audio /absolute/take.wav [--audio /absolute/take2.mp3] --output-dir /absolute/NEW-directory [--seconds 180] [--preview-seconds 30] [--video-crossfade 1] [--video-cycle 10] [--audio-crossfade 2] [--max-width 1920] [--fps 24]\n');
  } else {
    Promise.resolve().then(() => renderHealingRain({ ...parseCli(process.argv.slice(2)), onProgress: stage => process.stderr.write(`${stage}\n`) }))
      .then(report => process.stdout.write(JSON.stringify({ status: report.status, reportPath: report.reportPath, outputs: report.outputs.map(({ seconds, video, wav }) => ({ seconds, video, wav })), warnings: report.warnings }, null, 2) + '\n'))
      .catch(error => { process.stderr.write(`Render failed: ${String(error.message).slice(0, 4096)}\n`); process.exitCode = 1; });
  }
}
