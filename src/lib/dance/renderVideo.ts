import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { analyzePetAudioRhythm } from '../video/audioRhythm';
import { assertPetMediaUrl, downloadPetMedia, type PetMediaKind } from '../video/petMedia';
import { preflightPetRenderer, probePetMediaSeconds } from '../video/petRenderer';
import { muxLegacyShortVideo } from '../video/legacyShortExport';
import { DANCE_CLIP_SECONDS, isDanceAudioSelection, type DanceAudioSelection, type DanceVideoJob } from './preset';
import { DanceVideoError } from './videoService';

const run = promisify(execFile);
const SAMPLE_RATE = 48_000;
const CLIP_SAMPLES = SAMPLE_RATE * DANCE_CLIP_SECONDS;
const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
export type DanceUpload = (job: DanceVideoJob, filename: string, buffer: Buffer, contentType: string) => Promise<string>;
export class DanceRenderError extends DanceVideoError {
  constructor(message: string, code = 'DANCE_RENDER', status = 400) { super(message, code, status); }
}

export function assertDanceAudioRange(start: number, sourceDuration: number): void {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(sourceDuration)
    || sourceDuration < DANCE_CLIP_SECONDS || start + DANCE_CLIP_SECONDS > sourceDuration + 1e-7) {
    throw new DanceRenderError('실제 음원 안에서 30초 구간을 선택해 주세요.', 'AUDIO_RANGE');
  }
}

export function assertDanceClipDuration(seconds: number): void {
  // Allow container/frame overhang, but never repeat a short clip to fill time.
  if (!Number.isFinite(seconds) || seconds + 1e-6 < 15 || seconds > 15.1) {
    throw new DanceRenderError('각 제작 영상은 실제 재생 길이가 15초여야 합니다.', 'CLIP_DURATION');
  }
}

export function assertDanceStoredMedia(value: string | undefined, kind: PetMediaKind): string {
  if (!value) throw new DanceRenderError('보관된 음원과 제작 영상을 먼저 준비해 주세요.', 'MISSING_MEDIA');
  const url = assertPetMediaUrl(value, kind);
  const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageOrigin || url.origin !== new URL(storageOrigin).origin
    || !url.pathname.startsWith('/storage/v1/object/public/melodio-assets/dance_challenge/')) {
    throw new DanceRenderError('댄스 작업에 보관된 미디어만 사용할 수 있습니다.', 'MEDIA_STORAGE');
  }
  return value;
}

/** Coalesce decoded samples into one-second frames to bound probe output even for a full song. */
async function measureSourceAudio(binary: string, filename: string): Promise<number> {
  try {
    const { stdout } = await run(binary, ['-hide_banner', '-v', 'error', '-i', filename, '-map', '0:a:0',
      '-af', 'aresample=48000:async=0,asetpts=N/SR/TB,asetnsamples=n=48000:p=0', '-f', 'framecrc', '-'],
    { timeout: 60_000, maxBuffer: 256 * 1024 });
    const timebase = stdout.match(/^#tb 0:\s*(\d+)\/(\d+)/m);
    const frames = [...stdout.matchAll(/^0,\s*(-?\d+),\s*(-?\d+),\s*(\d+),/gm)];
    const samples = frames.reduce((sum, frame) => sum + Number(frame[3]), 0);
    const seconds = timebase ? samples * Number(timebase[1]) / Number(timebase[2]) : NaN;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('empty audio');
    return seconds;
  } catch { throw new DanceRenderError('음원 스트림의 실제 길이를 확인하지 못했습니다.', 'MEDIA_PROBE'); }
}

/** Sample-accurate local extraction; invalid selections fail before an output file is written. */
export async function trimDanceAudio(binary: string, inputFile: string, outputFile: string, start: number): Promise<number> {
  if (!Number.isFinite(start) || start < 0) throw new DanceRenderError('시작 시간을 확인해 주세요.', 'AUDIO_RANGE');
  const sourceDuration = await measureSourceAudio(binary, inputFile);
  assertDanceAudioRange(start, sourceDuration);
  const startSample = Math.round(start * SAMPLE_RATE);
  const filter = `aresample=48000:async=0,atrim=start_sample=${startSample}:end_sample=${startSample + CLIP_SAMPLES},asetpts=PTS-STARTPTS,afade=t=in:ss=0:ns=3840,afade=t=out:ss=1430400:ns=9600`;
  try {
    await run(binary, ['-hide_banner', '-v', 'error', '-y', '-i', inputFile, '-map', '0:a:0', '-vn',
      '-af', filter, '-ar', String(SAMPLE_RATE), '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', outputFile],
    { timeout: 60_000, maxBuffer: 256 * 1024 });
    const duration = await probePetMediaSeconds(binary, outputFile, 'audio');
    if (Math.abs(duration - DANCE_CLIP_SECONDS) > 1 / SAMPLE_RATE) {
      throw new DanceRenderError('선택 음원을 정확한 30초로 추출하지 못했습니다.', 'AUDIO_DURATION');
    }
    return sourceDuration;
  } catch (error) {
    await rm(outputFile, { force: true });
    if (error instanceof DanceRenderError) throw error;
    throw new DanceRenderError('선택 음원 구간을 추출하지 못했습니다.', 'AUDIO_TRIM');
  }
}

export async function snapshotDanceAudio(job: DanceVideoJob, sourceUrl: string, upload: DanceUpload): Promise<{
  audioUrl: string; sourceAudioHash: string; audioHash: string; sourceDurationSeconds: number; bpm?: number; onsetSeconds?: number[]; rhythm?: DanceVideoJob['rhythm'];
}> {
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dance-audio-'));
  try {
    const source = await downloadPetMedia(sourceUrl, 'audio');
    const inputFile = path.join(temp, 'source.audio');
    const outputFile = path.join(temp, 'selected.wav');
    await writeFile(inputFile, source.buffer);
    const sourceDurationSeconds = await trimDanceAudio(binary, inputFile, outputFile, job.startSeconds);
    const selected = await readFile(outputFile);
    const audioHash = sha256(selected);
    let bpm: number | undefined; let onsetSeconds: number[] = []; let rhythmSummary: DanceVideoJob['rhythm'];
    try {
      const rhythm = await analyzePetAudioRhythm(binary, outputFile, DANCE_CLIP_SECONDS);
      if (rhythm.method === 'energy-autocorrelation' && Number.isFinite(rhythm.bpm)) bpm = rhythm.bpm;
      onsetSeconds = rhythm.onsetSeconds.filter(second => Number.isFinite(second) && second >= 0 && second < DANCE_CLIP_SECONDS);
      rhythmSummary = { beatSeconds: rhythm.beatSeconds.filter(t => Number.isFinite(t) && t >= 0 && t < DANCE_CLIP_SECONDS).slice(0, 500),
        confidence: rhythm.confidence, method: rhythm.method, endingStatus: rhythm.ending.status };
    } catch { /* A rhythm estimate is optional; the selected audio remains authoritative. */ }
    const audioUrl = assertDanceStoredMedia(await upload(job, `audio-30s-${audioHash.slice(0, 16)}.wav`, selected, 'audio/wav'), 'audio');
    return { audioUrl, sourceAudioHash: sha256(source.buffer), audioHash, sourceDurationSeconds, bpm, onsetSeconds, ...(rhythmSummary ? { rhythm: rhythmSummary } : {}) };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

/** Verify the existing file in place. Never decode/re-encode, trim, upload or regenerate it. */
export async function reuseDanceAudio(selection: DanceAudioSelection): Promise<void> {
  if (!isDanceAudioSelection(selection)) throw new DanceRenderError('재사용할 음원 정보를 확인해 주세요.', 'AUDIO_SELECTION');
  const audioUrl = assertDanceStoredMedia(selection.audioUrl, 'audio');
  const audio = await downloadPetMedia(audioUrl, 'audio');
  if (sha256(audio.buffer) !== selection.audioHash) throw new DanceRenderError('저장된 음원이 원래 선택한 구간과 다릅니다.', 'AUDIO_HASH');
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dance-reuse-'));
  try {
    const filename = path.join(temp, 'selected.wav');
    await writeFile(filename, audio.buffer);
    if (Math.abs(await probePetMediaSeconds(binary, filename, 'audio') - DANCE_CLIP_SECONDS) > 1 / SAMPLE_RATE) {
      throw new DanceRenderError('저장된 재사용 음원은 정확히 30초여야 합니다.', 'AUDIO_DURATION');
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
}

/** Decode the terminal interval and keep its last actual frame, including non-30-fps inputs. */
export async function extractDanceFinalFrame(binary: string, inputFile: string, outputFile: string): Promise<void> {
  const duration = await probePetMediaSeconds(binary, inputFile, 'video');
  assertDanceClipDuration(duration);
  try {
    await run(binary, ['-hide_banner', '-v', 'error', '-y', '-i', inputFile, '-ss', String(Math.max(0, duration - 0.5)),
      '-map', '0:v:0', '-an', '-vf', 'scale=480:854:force_original_aspect_ratio=decrease,pad=480:854:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
      '-fps_mode', 'passthrough', '-q:v', '2', '-update', '1', outputFile], { timeout: 30_000, maxBuffer: 256 * 1024 });
    if (!(await readFile(outputFile)).length) throw new Error('empty frame');
  } catch { throw new DanceRenderError('첫 영상의 마지막 프레임을 추출하지 못했습니다.', 'BRIDGE_FRAME'); }
}

export async function extractDanceBridge(job: DanceVideoJob, upload: DanceUpload): Promise<string> {
  const url = assertDanceStoredMedia(job.clip1Url, 'video');
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dance-bridge-'));
  try {
    const clip = await downloadPetMedia(url, 'video');
    const source = path.join(temp, 'clip1.mp4'); const output = path.join(temp, 'bridge.jpg');
    await writeFile(source, clip.buffer);
    await extractDanceFinalFrame(binary, source, output);
    const buffer = await readFile(output);
    return assertDanceStoredMedia(await upload(job, `bridge-${sha256(buffer).slice(0, 16)}.jpg`, buffer, 'image/jpeg'), 'image');
  } finally { await rm(temp, { recursive: true, force: true }); }
}

export async function concatDanceClips(binary: string, clips: [string, string], outputFile: string, dimensions: { width: number; height: number } = { width: 480, height: 854 }): Promise<void> {
  if (!((dimensions.width === 480 && dimensions.height === 854) || (dimensions.width === 720 && dimensions.height === 1280))) throw new DanceRenderError('지원하지 않는 댄스 영상 크기입니다.', 'VIDEO_DIMENSIONS');
  for (const clip of clips) assertDanceClipDuration(await probePetMediaSeconds(binary, clip, 'video'));
  const filters = clips.map((_, index) => `[${index}:v:0]trim=duration=15,setpts=PTS-STARTPTS,scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease,pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p[v${index}]`);
  filters.push('[v0][v1]concat=n=2:v=1:a=0[outv]');
  try {
    await run(binary, ['-hide_banner', '-v', 'error', '-y', '-i', clips[0], '-i', clips[1], '-filter_complex', filters.join(';'),
      '-map', '[outv]', '-an', '-frames:v', '900', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-threads', '2',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputFile], { timeout: 90_000, maxBuffer: 256 * 1024 });
    const duration = await probePetMediaSeconds(binary, outputFile, 'video');
    if (Math.abs(duration - DANCE_CLIP_SECONDS) > 1e-6) throw new Error('wrong output duration');
  } catch { throw new DanceRenderError('두 제작 영상을 30초로 연결하지 못했습니다.', 'VIDEO_CONCAT'); }
}

export async function renderDanceVideo(job: DanceVideoJob, upload: DanceUpload): Promise<string> {
  const audioUrl = assertDanceStoredMedia(job.audioUrl, 'audio');
  const clipUrls = [assertDanceStoredMedia(job.clip1Url, 'video'), assertDanceStoredMedia(job.clip2Url, 'video')];
  if (!job.audioHash || !/^[a-f0-9]{64}$/.test(job.audioHash)) throw new DanceRenderError('승인된 음원 스냅샷을 확인해 주세요.', 'AUDIO_HASH');
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dance-render-'));
  try {
    const audio = await downloadPetMedia(audioUrl, 'audio');
    if (sha256(audio.buffer) !== job.audioHash) throw new DanceRenderError('보관 음원이 승인된 선택 구간과 다릅니다.', 'AUDIO_HASH');
    const audioFile = path.join(temp, 'selected.wav'); await writeFile(audioFile, audio.buffer);
    if (Math.abs(await probePetMediaSeconds(binary, audioFile, 'audio') - DANCE_CLIP_SECONDS) > 1 / SAMPLE_RATE) {
      throw new DanceRenderError('보관 음원은 정확히 30초여야 합니다.', 'AUDIO_DURATION');
    }
    const clips: [string, string] = [path.join(temp, 'clip1.mp4'), path.join(temp, 'clip2.mp4')];
    for (let index = 0; index < clips.length; index++) {
      const clip = await downloadPetMedia(clipUrls[index], 'video'); await writeFile(clips[index], clip.buffer);
    }
    const videoFile = path.join(temp, 'video.mp4'); const outputFile = path.join(temp, 'final.mp4');
    await concatDanceClips(binary, clips, videoFile, job.videoSpec ? { width: job.videoSpec.width, height: job.videoSpec.height } : undefined);
    try { await muxLegacyShortVideo(binary, videoFile, audioFile, outputFile); }
    catch { throw new DanceRenderError('선택 음원과 영상의 최종 합성에 실패했습니다.', 'VIDEO_MUX'); }
    const buffer = await readFile(outputFile);
    if (buffer.length > 60 * 1024 ** 2) throw new DanceRenderError('완성 영상의 크기가 너무 큽니다.', 'FINAL_SIZE');
    return assertDanceStoredMedia(await upload(job, `final-captionless-${sha256(buffer).slice(0, 16)}.mp4`, buffer, 'video/mp4'), 'video');
  } finally { await rm(temp, { recursive: true, force: true }); }
}

/** A five-second paid-motion review, keeping the authoritative thirty-second WAV untouched. */
export async function renderDancePreview(job: DanceVideoJob, upload: DanceUpload): Promise<string> {
  const audioUrl = assertDanceStoredMedia(job.audioUrl, 'audio');
  const clipUrl = assertDanceStoredMedia(job.previewClipUrl, 'video');
  if (!job.audioHash || !/^[a-f0-9]{64}$/.test(job.audioHash)) throw new DanceRenderError('저장된 음원을 확인해 주세요.', 'AUDIO_HASH');
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dance-preview-'));
  try {
    const audio = await downloadPetMedia(audioUrl, 'audio');
    if (sha256(audio.buffer) !== job.audioHash) throw new DanceRenderError('저장된 음원이 선택한 음원과 다릅니다.', 'AUDIO_HASH');
    const audioFile = path.join(temp, 'master.wav'), clipFile = path.join(temp, 'native.mp4'), outputFile = path.join(temp, 'preview.mp4');
    await writeFile(audioFile, audio.buffer);
    if (Math.abs(await probePetMediaSeconds(binary, audioFile, 'audio') - 30) > 1 / SAMPLE_RATE) throw new DanceRenderError('저장된 원본 구간은 정확히 30초여야 합니다.', 'AUDIO_DURATION');
    const clip = await downloadPetMedia(clipUrl, 'video'); await writeFile(clipFile, clip.buffer);
    if (Math.abs(await probePetMediaSeconds(binary, clipFile, 'video') - 5) > 1e-6) throw new DanceRenderError('동작 테스트 영상은 정확히 5초여야 합니다.', 'PREVIEW_DURATION');
    await run(binary, ['-hide_banner', '-v', 'error', '-y', '-i', clipFile, '-i', audioFile,
      '-filter_complex', '[0:v:0]trim=duration=5,setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p[v];[1:a:0]atrim=duration=5,asetpts=PTS-STARTPTS[a]',
      '-map', '[v]', '-map', '[a]', '-t', '5', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-threads', '2', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputFile], { timeout: 90000, maxBuffer: 256 * 1024 });
    if (Math.abs(await probePetMediaSeconds(binary, outputFile, 'video') - 5) > 1e-6) throw new DanceRenderError('동작 테스트 합성 길이를 확인하지 못했습니다.', 'PREVIEW_DURATION');
    const buffer = await readFile(outputFile);
    if (buffer.length > 60 * 1024 ** 2) throw new DanceRenderError('테스트 영상 파일이 너무 큽니다.', 'FINAL_SIZE');
    return assertDanceStoredMedia(await upload(job, `preview-5s-${sha256(buffer).slice(0, 16)}.mp4`, buffer, 'video/mp4'), 'video');
  } catch (error) {
    if (error instanceof DanceRenderError) throw error;
    throw new DanceRenderError('저장된 음악과 동작 테스트를 합치지 못했습니다.', 'VIDEO_PREVIEW');
  } finally { await rm(temp, { recursive: true, force: true }); }
}
