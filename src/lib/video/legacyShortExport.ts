import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
export const LEGACY_SHORT_SECONDS = 30;
// Same bounded encoder/container tolerance as the deployed pet renderer.
export const LEGACY_SHORT_AUDIO_MAX_SECONDS = 30.15;
export const LEGACY_NO_TEXT_RULE = 'STRICT DIRECTIVE: ABSOLUTELY NO TEXT ON SCREEN, NO KOREAN OR ENGLISH SUBTITLES, NO TYPOGRAPHY, NO LABELS. PURE CLEAN VISUAL MOTION ONLY.';

export class LegacyShortExportError extends Error {
  constructor(message: string, public code = 'SHORT_EXPORT', public status = 400) { super(message); }
}

/** Measure each decoded stream independently; container duration cannot prove an audio track exists. */
export async function probeLegacyShortStream(binary: string, filename: string, kind: 'audio' | 'video'): Promise<number> {
  try {
    const { stdout } = await run(binary, ['-hide_banner', '-v', 'error', '-i', filename, '-map', kind === 'audio' ? '0:a:0' : '0:v:0', '-f', 'framecrc', '-'], { timeout: 30_000, maxBuffer: 512 * 1024 });
    const timebase = stdout.match(/^#tb 0:\s*(\d+)\/(\d+)/m);
    const frames = [...stdout.matchAll(/^0,\s*(-?\d+),\s*(-?\d+),\s*(\d+),/gm)];
    const seconds = timebase && frames.length
      ? (Math.max(...frames.map(frame => Number(frame[2]) + Number(frame[3]))) - Math.min(...frames.map(frame => Number(frame[2])))) * Number(timebase[1]) / Number(timebase[2])
      : NaN;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('empty stream');
    return seconds;
  } catch {
    throw new LegacyShortExportError(kind === 'audio' ? '음원 스트림의 실제 길이를 확인하지 못했습니다. 음원을 다시 확인해 주세요.' : '영상 스트림의 실제 길이를 확인하지 못했습니다.', 'MEDIA_PROBE');
  }
}

export async function validateLegacyShortAudio(binary: string, filename: string): Promise<number> {
  const seconds = await probeLegacyShortStream(binary, filename, 'audio');
  if (seconds > LEGACY_SHORT_AUDIO_MAX_SECONDS) {
    throw new LegacyShortExportError('음원이 30초보다 깁니다. 가창을 임의로 자르지 않습니다. 30초 안에 마무리되는 음원을 생성해 주세요.', 'AUDIO_DURATION');
  }
  if (seconds > LEGACY_SHORT_SECONDS) {
    // A small overhang is accepted only when it is actual silence, rather than
    // assuming any final syllable within the timing tolerance is encoder padding.
    const { stdout } = await run(binary, ['-hide_banner', '-v', 'error', '-i', filename, '-map', '0:a:0', '-af', 'atrim=start=30,aresample=48000', '-ac', '1', '-f', 'f32le', 'pipe:1'], { timeout: 30_000, encoding: 'buffer', maxBuffer: 128 * 1024 });
    let peak = 0;
    for (let offset = 0; offset + 4 <= stdout.length; offset += 4) peak = Math.max(peak, Math.abs(stdout.readFloatLE(offset)));
    if (!Number.isFinite(peak) || peak > 0.001) {
      throw new LegacyShortExportError('30초 이후에도 음원 신호가 남아 있습니다. 가창을 자르지 않고 중단합니다. 30초 안에 마무리되는 음원을 생성해 주세요.', 'AUDIO_DURATION');
    }
  }
  return seconds;
}

export async function validateLegacyShortOutput(binary: string, filename: string): Promise<number> {
  const video = await probeLegacyShortStream(binary, filename, 'video');
  const audio = await probeLegacyShortStream(binary, filename, 'audio');
  if (Math.abs(video - LEGACY_SHORT_SECONDS) > 0.05 || audio < 29.95 || audio > 30.1) {
    throw new LegacyShortExportError('완성본 영상과 음원이 모두 30초인지 확인하지 못했습니다. 원본 클립과 음원을 보존하고 중단합니다.', 'FINAL_DURATION', 500);
  }
  return video;
}

export async function muxLegacyShortVideo(binary: string, videoFile: string, audioFile: string, outputFile: string): Promise<number> {
  await validateLegacyShortAudio(binary, audioFile);
  await run(binary, ['-hide_banner', '-v', 'error', '-y', '-i', videoFile, '-i', audioFile, '-map', '0:v:0', '-map', '1:a:0', '-af', 'aresample=48000:async=0:first_pts=0,apad=whole_dur=30,atrim=end_sample=1440000,asetpts=PTS-STARTPTS', '-t', '30', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputFile], { timeout: 90_000, maxBuffer: 512 * 1024 });
  return validateLegacyShortOutput(binary, outputFile);
}

/** Older proxy deployments may ignore the requested duration, so verify their actual artifact. */
export async function validateLegacyShortProxyOutput(binary: string, url: string, declaredSeconds: unknown): Promise<number> {
  if (typeof declaredSeconds !== 'number' || Math.abs(declaredSeconds - LEGACY_SHORT_SECONDS) > 0.05) {
    throw new LegacyShortExportError('영상 합성 서버가 30초 완성본을 반환하지 않았습니다.', 'FINAL_DURATION', 502);
  }
  const temp = await mkdtemp(path.join(os.tmpdir(), 'grok-proxy-check-'));
  try {
    const response = await fetch(url);
    if (!response.ok) throw new LegacyShortExportError('합성 서버의 완성본을 확인하지 못했습니다.', 'MEDIA_FETCH', 502);
    const filename = path.join(temp, 'final.mp4');
    await writeFile(filename, Buffer.from(await response.arrayBuffer()));
    return await validateLegacyShortOutput(binary, filename);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
