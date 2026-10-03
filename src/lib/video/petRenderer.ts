import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { getPetProductionShots, hasPetTwoClipProduction, PetEpisode } from '../vle/petEpisode';
import { assertPetAudioDuration, PetJobRecord, PetPipelineError } from './petPipeline';
import { downloadPetMedia } from './petMedia';
import { analyzePetAudioRhythm, AudioRhythmAnalysis } from './audioRhythm';

const execFileAsync = promisify(execFile);
export type PetAssetUploader = (job: PetJobRecord, filename: string, buffer: Buffer, contentType: string) => Promise<string>;
export function petFfmpegPath() {
  const candidates = [process.env.PET_VIDEO_FFMPEG, ffmpegStatic, '/opt/homebrew/bin/ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
  const binary = candidates.find((candidate): candidate is string => !!candidate && existsSync(candidate));
  if (!binary) throw new PetPipelineError('영상 합성 도구 설정이 필요합니다.', 'FFMPEG_CONFIG', 503);
  return binary;
}
export async function preflightPetRenderer() {
  const binary = petFfmpegPath();
  const disk = await statfs(os.tmpdir());
  // Bounded server scratch space: 6 x 20 MiB clips + 40 MiB audio + 60 MiB final.
  if (disk.bavail * disk.bsize < 300 * 1024 ** 2) throw new PetPipelineError('영상 합성 서버의 여유 공간이 부족합니다.', 'DISK_SPACE', 503);
  await execFileAsync(binary, ['-hide_banner', '-version'], { timeout: 10_000, maxBuffer: 256 * 1024 });
  return { binary };
}
/** Decode the selected stream, measuring actual media rather than trusting provider or container metadata. */
export async function probePetMediaSeconds(binary: string, filename: string, kind: 'audio' | 'video'): Promise<number> {
  try {
    // null-muxer progress is the last frame's PTS on some FFmpeg builds, undercounting
    // by one frame. framecrc reports each decoded frame's PTS AND duration explicitly.
    const { stdout } = await execFileAsync(binary, ['-hide_banner', '-v', 'error', '-i', filename, '-map', kind === 'audio' ? '0:a:0' : '0:v:0', '-f', 'framecrc', '-'], { timeout: 30_000, maxBuffer: 512 * 1024 });
    const timebase = stdout.match(/^#tb 0:\s*(\d+)\/(\d+)/m);
    const frames = [...stdout.matchAll(/^0,\s*(-?\d+),\s*(-?\d+),\s*(\d+),/gm)];
    const starts = frames.map(frame => Number(frame[2]));
    const ends = frames.map(frame => Number(frame[2]) + Number(frame[3]));
    const seconds = timebase ? (Math.max(...ends) - Math.min(...starts)) * Number(timebase[1]) / Number(timebase[2]) : NaN;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('empty stream');
    return seconds;
  } catch { throw new PetPipelineError('실제 미디어 길이 또는 스트림을 확인하지 못했습니다.', 'MEDIA_PROBE'); }
}
function assertRendererAudioDuration(episode: PetEpisode, seconds: number): void {
  if (hasPetTwoClipProduction(episode)) {
    if (!Number.isFinite(seconds) || seconds < 20 || seconds > 30.15) throw new PetPipelineError('음원은 실제 길이가 20~30초여야 합니다. 가사를 줄여 다시 녹음·생성해 주세요. 가창을 자르거나 반복하지 않습니다.', 'AUDIO_DURATION');
    return;
  }
  assertPetAudioDuration(seconds);
}
function assTime(seconds: number) { return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2,'0')}:${(seconds % 60).toFixed(2).padStart(5,'0')}`; }
const captionCharWidth = (char: string) => /[MW@%&]/.test(char) ? 1 : /[\u0020-\u007e]/.test(char) ? 0.55 : 1;
export function escapePetCaption(value: string, requestedWidth = 13): string {
  // Remove ASS control syntax. These are editorial scene captions, not a lyric transcription/alignment.
  const clean = value.replace(/[{}\\\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const maxWidth = Number.isFinite(requestedWidth) ? Math.max(4, Math.min(13, requestedWidth)) : 13;
  const tokens: { text: string; width: number; word: number }[] = [];
  // Keep words intact unless a single word exceeds the available width.
  for (const [word, text] of clean.split(' ').entries()) {
    let part = ''; let width = 0;
    for (const char of text) {
      const next = captionCharWidth(char);
      if (width + next > maxWidth && part) { tokens.push({ text: part, width, word }); part = ''; width = 0; }
      part += char; width += next;
    }
    if (part) tokens.push({ text: part, width, word });
  }
  type Layout = { lines: string[]; cost: number };
  const best: Layout[] = Array(tokens.length + 1);
  best[tokens.length] = { lines: [], cost: 0 };
  // Prefer the fewest lines, then similar line widths. Penalize a lone final
  // word so a short Korean ending does not hang below the rest of the caption.
  for (let start = tokens.length - 1; start >= 0; start--) {
    let line = ''; let width = 0;
    for (let end = start; end < tokens.length; end++) {
      const space = end > start && tokens[end].word !== tokens[end - 1].word ? ' ' : '';
      width += (space ? 0.55 : 0) + tokens[end].width;
      if (width > maxWidth + 1e-9) break;
      line += space + tokens[end].text;
      const tail = best[end + 1];
      const orphanPenalty = end === tokens.length - 1 && start > 0 && end === start ? 169 : 0;
      const candidate = { lines: [line, ...tail.lines], cost: width * width + tail.cost + orphanPenalty };
      if (!best[start] || candidate.lines.length < best[start].lines.length || (candidate.lines.length === best[start].lines.length && candidate.cost < best[start].cost)) best[start] = candidate;
    }
  }
  return best[0].lines.join('\\N');
}
export interface PetCaptionCue {
  id: string;
  caption: string;
  startSeconds: number;
  endSeconds: number;
  timing: 'editorial' | 'detected-onset';
}

const CAPTION_SNAP_SECONDS = 0.3;
const MIN_CAPTION_SECONDS = 1.25;

interface PetCaptionStyle {
  name: string;
  fontSize: number;
  primaryColour: string;
  outline: number;
  shadow: number;
  marginV: number;
  wrapUnits: number;
}

// 480x854 Shorts canvas. The 104 px right margin avoids the primary action
// rail, and every style remains above the lower title/channel overlays.
const PET_CAPTION_STYLES: readonly PetCaptionStyle[] = [
  { name: 'Hook', fontSize: 52, primaryColour: '&H006DE3FF', outline: 4.5, shadow: 1.5, marginV: 108, wrapUnits: 6.3 },
  { name: 'Upper', fontSize: 46, primaryColour: '&H00FFFFFF', outline: 4, shadow: 1, marginV: 126, wrapUnits: 7.2 },
  { name: 'Middle', fontSize: 46, primaryColour: '&H00FFFFFF', outline: 4, shadow: 1, marginV: 222, wrapUnits: 7.2 },
  { name: 'Turn', fontSize: 48, primaryColour: '&H00E6F3BA', outline: 4.25, shadow: 1, marginV: 144, wrapUnits: 6.8 },
  { name: 'Payoff', fontSize: 52, primaryColour: '&H006DE3FF', outline: 4.5, shadow: 1.5, marginV: 166, wrapUnits: 6.3 },
  { name: 'Long', fontSize: 42, primaryColour: '&H00FFFFFF', outline: 3.75, shadow: 1, marginV: 88, wrapUnits: 7.8 },
] as const;
const PET_CAPTION_SEQUENCE = ['Hook', 'Middle', 'Upper', 'Turn', 'Middle', 'Payoff'] as const;

function petCaptionStyle(caption: string, index: number): PetCaptionStyle {
  const clean = caption.replace(/[{}\\\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  const displayUnits = [...clean].reduce((width, char) => width + captionCharWidth(char), 0);
  const name = displayUnits > 32 ? 'Long' : PET_CAPTION_SEQUENCE[index % PET_CAPTION_SEQUENCE.length];
  return PET_CAPTION_STYLES.find(style => style.name === name)!;
}

/** Keep six editorial story beats, optionally moving internal boundaries to nearby measured onsets. */
export function buildPetCaptionTimeline(episode: PetEpisode, rhythm?: AudioRhythmAnalysis): PetCaptionCue[] {
  const original = episode.shots.map(shot => shot.startSeconds).concat(30);
  const boundaries = [...original];
  const snapped = new Set<number>();
  if (episode.version === 'pet-v4' && hasPetTwoClipProduction(episode) && rhythm?.method === 'energy-autocorrelation' && rhythm.confidence >= 0.42) {
    for (let index = 1; index < boundaries.length - 1; index++) {
      const planned = original[index];
      // The 15-second production seam is structural and cannot move with the music.
      if (Math.abs(planned - 15) < 1e-6) continue;
      const clipStart = planned < 15 ? 0 : 15;
      const clipEnd = planned < 15 ? 15 : 30;
      const candidate = rhythm.onsetSeconds
        .filter(second => second > clipStart && second < clipEnd && Math.abs(second - planned) <= CAPTION_SNAP_SECONDS + 1e-9)
        .sort((a, b) => Math.abs(a - planned) - Math.abs(b - planned))[0];
      if (candidate === undefined) continue;
      const minimum = boundaries[index - 1] + MIN_CAPTION_SECONDS;
      const maximum = original[index + 1] - MIN_CAPTION_SECONDS;
      if (candidate >= minimum && candidate <= maximum) { boundaries[index] = candidate; snapped.add(index); }
    }
  }
  boundaries[0] = 0; boundaries[boundaries.length - 1] = 30;
  const seam = episode.shots.findIndex(shot => shot.startSeconds === 15);
  if (seam >= 0) boundaries[seam] = 15;
  return episode.shots.map((shot, index) => ({
    id: shot.id,
    caption: shot.caption,
    startSeconds: boundaries[index],
    endSeconds: boundaries[index + 1],
    timing: snapped.has(index) || snapped.has(index + 1) ? 'detected-onset' : 'editorial',
  }));
}

export function buildPetAss(episode: PetEpisode, fontName = 'Noto Sans KR', rhythm?: AudioRhythmAnalysis): string {
  const safeFontName = fontName.replace(/[,\r\n{}\\]/g, '').slice(0,80);
  const styles = PET_CAPTION_STYLES.map(style =>
    `Style: ${style.name},${safeFontName},${style.fontSize},${style.primaryColour},&H00FFFFFF,&H00101018,&H70000000,-1,0,0,0,100,100,0,0,1,${style.outline},${style.shadow},8,30,104,${style.marginV},1`
  ).join('\n');
  const dialogues = buildPetCaptionTimeline(episode, rhythm).map((cue, index) => {
    const style = petCaptionStyle(cue.caption, index);
    return `Dialogue: 0,${assTime(cue.startSeconds)},${assTime(cue.endSeconds)},${style.name},,0,0,0,,${escapePetCaption(cue.caption, style.wrapUnits)}`;
  }).join('\n');
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 480\nPlayResY: 854\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${styles}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${dialogues}\n`;
}
export async function snapshotPetAudio(job: PetJobRecord, upload: PetAssetUploader) {
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pet-audio-'));
  try {
    const audio = await downloadPetMedia(job.state.audio.sourceUrl, 'audio');
    const audioFile = path.join(temp, 'source.audio'); await writeFile(audioFile, audio.buffer);
    const durationSeconds = await probePetMediaSeconds(binary, audioFile, 'audio'); assertRendererAudioDuration(job.episode, durationSeconds);
    let rhythm: AudioRhythmAnalysis;
    try { rhythm = await analyzePetAudioRhythm(binary, audioFile, durationSeconds); }
    catch {
      rhythm = {
        onsetSeconds: [], beatSeconds: [], confidence: 0, method: 'editorial-fallback', fallbackReason: 'analysis-failed',
        ending: { status: 'uncertain', reasons: ['ending-analysis-unavailable'], tailRmsRatio: 0, terminalRms: 0 },
      };
    }
    const url = await upload(job, 'audio-source', audio.buffer, audio.contentType);
    return { url, durationSeconds, rhythm };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

function archivedAsset(job: PetJobRecord, index: number, kind: 'image' | 'video'): string {
  const production = getPetProductionShots(job.episode);
  if (!Number.isInteger(index) || index < 0 || index >= production.length || job.state.shots.length !== production.length) {
    throw new PetPipelineError('검토할 제작 장면을 찾을 수 없습니다.', 'MISSING_SHOT');
  }
  const state = job.state.shots[index];
  const url = kind === 'image' ? state.keyframeUrl : state.videoUrl;
  const ready = kind === 'image' ? state.imageStatus === 'ready' : state.videoStatus === 'ready';
  if (!ready || !url) throw new PetPipelineError('보관된 제작 장면을 먼저 준비해 주세요.', 'MISSING_SHOT');
  return url;
}

async function extractJpeg(binary: string, sourceFile: string, outputFile: string, second?: number) {
  const seek = second === undefined ? [] : ['-ss', second.toFixed(3)];
  try {
    await execFileAsync(binary, [
      '-hide_banner', '-v', 'error', '-y', '-i', sourceFile, ...seek, '-frames:v', '1',
      '-vf', 'scale=480:854:force_original_aspect_ratio=decrease,pad=480:854:(ow-iw)/2:(oh-ih)/2:black,setsar=1',
      '-q:v', '3', outputFile,
    ], { timeout: 30_000, maxBuffer: 256 * 1024 });
  } catch { throw new PetPipelineError('보관된 장면의 검토 프레임을 만들지 못했습니다.', 'REVIEW_FRAME'); }
}

/** Local extraction only: one archived image or at most three frames from an archived clip. */
export async function extractPetReviewFrames(job: PetJobRecord, index: number, kind: 'image' | 'video', upload: PetAssetUploader): Promise<{ urls: string[] }> {
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pet-review-'));
  try {
    const source = await downloadPetMedia(archivedAsset(job, index, kind), kind);
    const sourceFile = path.join(temp, `source.${kind === 'video' ? 'mp4' : 'image'}`); await writeFile(sourceFile, source.buffer);
    let seconds: Array<number | undefined> = [undefined];
    if (kind === 'video') {
      const duration = await probePetMediaSeconds(binary, sourceFile, 'video');
      const expected = getPetProductionShots(job.episode)[index].durationSeconds;
      if (duration + 0.001 < expected || duration > expected + 1) {
        throw new PetPipelineError(`${job.state.shots[index].id} 영상 길이가 ${expected}초 제작 명세와 다릅니다.`, 'SHOT_DURATION');
      }
      const requested = [0.2, Math.min(7.5, duration / 2), Math.min(14.8, Math.max(0, duration - 0.1))]
        .map(value => Math.max(0, Math.min(value, Math.max(0, duration - 0.05))));
      seconds = requested.filter((value, position) => requested.findIndex(other => Math.abs(other - value) < 0.04) === position);
    }
    const urls: string[] = [];
    const production = getPetProductionShots(job.episode);
    for (let frame = 0; frame < seconds.length; frame++) {
      const output = path.join(temp, `review-${frame}.jpg`);
      await extractJpeg(binary, sourceFile, output, seconds[frame]);
      urls.push(await upload(job, `${production[index].id}-${kind}-review-${frame + 1}.jpg`, await readFile(output), 'image/jpeg'));
    }
    return { urls };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

/** Extract C1's real terminal frame for C2 continuity; this never calls a generation provider. */
export async function extractPetBridgeFrame(job: PetJobRecord, index: number, upload: PetAssetUploader): Promise<{ url: string }> {
  const production = getPetProductionShots(job.episode);
  if (!hasPetTwoClipProduction(job.episode) || index < 0 || index + 1 >= production.length) {
    throw new PetPipelineError('연속 제작용 이전 클립을 찾을 수 없습니다.', 'MISSING_SHOT');
  }
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pet-bridge-'));
  try {
    const media = await downloadPetMedia(archivedAsset(job, index, 'video'), 'video');
    const source = path.join(temp, 'source.mp4'); await writeFile(source, media.buffer);
    const duration = await probePetMediaSeconds(binary, source, 'video');
    const expected = production[index].durationSeconds;
    if (duration + 0.001 < expected || duration > expected + 1) {
      throw new PetPipelineError(`${job.state.shots[index].id} 영상 길이가 ${expected}초 제작 명세와 다릅니다.`, 'SHOT_DURATION');
    }
    const second = Math.max(0, Math.min(14.8, duration - 0.1));
    const output = path.join(temp, 'bridge.jpg'); await extractJpeg(binary, source, output, second);
    return { url: await upload(job, `${production[index + 1].id}-image.jpg`, await readFile(output), 'image/jpeg') };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

/** Render new captionless exports. Full source audio is preserved; a quiet tail fills to 30 sec. */
export async function renderPetVideo(job: PetJobRecord, upload: PetAssetUploader): Promise<{ url: string; durationSeconds: number }> {
  const production = getPetProductionShots(job.episode);
  const expectedCount = hasPetTwoClipProduction(job.episode) ? 2 : 6;
  if (production.length !== expectedCount || job.state.shots.length !== expectedCount || job.state.shots.some(s => s.videoStatus !== 'ready' || !s.videoUrl) || !job.state.audio.stableUrl) throw new PetPipelineError(`완성된 ${expectedCount}개 제작 클립과 승인 음원이 필요합니다.`, 'MISSING_SHOT');
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pet-render-'));
  try {
    const audio = await downloadPetMedia(job.state.audio.stableUrl, 'audio');
    const audioFile = path.join(temp, 'audio.source'); await writeFile(audioFile, audio.buffer);
    const audioSeconds = await probePetMediaSeconds(binary, audioFile, 'audio'); assertRendererAudioDuration(job.episode, audioSeconds);
    const inputs: string[] = []; const filters: string[] = [];
    for (let i = 0; i < expectedCount; i++) {
      const clip = await downloadPetMedia(job.state.shots[i].videoUrl!, 'video');
      const filename = path.join(temp, `shot-${i}.mp4`); await writeFile(filename, clip.buffer);
      const seconds = await probePetMediaSeconds(binary, filename, 'video');
      const expected = production[i].durationSeconds;
      if (seconds + 0.001 < expected || seconds > expected + 1) throw new PetPipelineError(`${job.state.shots[i].id} 영상 길이가 ${expected}초 콘티와 다릅니다. 이 장면을 확인해 주세요.`, 'SHOT_DURATION');
      inputs.push('-i', filename);
      filters.push(`[${i}:v:0]trim=duration=${expected},setpts=PTS-STARTPTS,scale=480:854:force_original_aspect_ratio=increase,crop=480:854,setsar=1,fps=30,format=yuv420p[v${i}]`);
    }
    filters.push(`${Array.from({ length: expectedCount }, (_, index) => `[v${index}]`).join('')}concat=n=${expectedCount}:v=1:a=0[outv]`);
    // Keep original audio samples. Silence-pad short sources and remove only the
    // accepted encoder/container overhang at an exact 48 kHz, 30-second boundary.
    filters.push(`[${expectedCount}:a:0]aresample=48000:async=0:first_pts=0,apad=whole_dur=30,atrim=end_sample=1440000,asetpts=PTS-STARTPTS[outa]`);
    const output = path.join(temp, 'final.mp4');
    try {
      await execFileAsync(binary, ['-hide_banner', '-v', 'error', '-y', ...inputs, '-i', audioFile, '-filter_complex', filters.join(';'), '-map', '[outv]', '-map', '[outa]', '-t', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-threads', '2', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output], { cwd: temp, timeout: 90_000, maxBuffer: 512 * 1024 });
    } catch { throw new PetPipelineError('영상·음원 합성에 실패했습니다. 원본 제작 클립은 보존됩니다.', 'RENDER_FAILED'); }
    const durationSeconds = await probePetMediaSeconds(binary, output, 'video');
    const finalAudioSeconds = await probePetMediaSeconds(binary, output, 'audio');
    if (Math.abs(durationSeconds - 30) > 0.05 || finalAudioSeconds < 29.95 || finalAudioSeconds > 30.1) throw new PetPipelineError('완성본 영상·음원 길이 검증에 실패했습니다.', 'FINAL_DURATION');
    const buffer = await readFile(output);
    if (buffer.length > 60 * 1024 * 1024) throw new PetPipelineError('완성 영상의 크기가 너무 큽니다.', 'FINAL_SIZE');
    // Public object URLs can remain cached after an upsert. A content-addressed
    // name makes each changed render immutable while identical retries converge.
    const fingerprint = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    return { url: await upload(job, `final-captionless-v1-${fingerprint}.mp4`, buffer, 'video/mp4'), durationSeconds };
  } finally { await rm(temp, { recursive: true, force: true }); }
}
