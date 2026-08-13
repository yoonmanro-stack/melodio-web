import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';

const execAsync = promisify(exec);

/**
 * 숏폼 음원 길이 보장 트리머.
 *
 * 왜 필요한가:
 *   Suno 제출 payload(/suno/submit/music)에는 duration 파라미터가 없다.
 *   길이는 통제 대상이 아니라 부산물이며, 텍스트로 지시해도 지켜지지 않는다.
 *
 *   실측 (스타일 프롬프트에 "target duration 0:28" 이 매번 들어간 상태):
 *     가사 ~30자  + [End]  → 14초
 *     가사 103음절 (End 없음) → 32초
 *     가사  86음절 (End 없음) → 43초   ← 음절을 줄였는데 더 길어졌다
 *
 *   음절 수와 길이는 선형 관계가 아니다. 프롬프트 튜닝만으로는 25~30초를
 *   보장할 수 없으므로, 생성 후 결정적으로 자르는 안전망을 둔다.
 *
 * 동작:
 *   길이 ≤ maxSeconds → 아무것도 하지 않는다 (재인코딩조차 안 함).
 *   길이 > maxSeconds → targetSeconds 지점에서 페이드아웃 후 종료.
 */

export interface TrimResult {
  /** 트림이 실제로 수행됐는가 */
  trimmed: boolean;
  originalSeconds: number | null;
  finalSeconds: number | null;
  /** 트림된 경우 새 파일 버퍼, 아니면 null */
  buffer: Buffer | null;
  /** 실패 사유 (실패해도 원본을 그대로 쓰도록 throw 하지 않는다) */
  error?: string;
}

function resolveFfmpeg(): string {
  const candidates = [
    ffmpegStatic as string | null,
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ];
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch {
      /* 무시하고 다음 후보 */
    }
  }
  return 'ffmpeg';
}

export async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const ffprobe = resolveFfmpeg().replace(/ffmpeg$/i, 'ffprobe');
    const { stdout } = await execAsync(
      `"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    const sec = parseFloat(stdout.trim());
    return Number.isFinite(sec) && sec > 0 ? sec : null;
  } catch {
    return null;
  }
}

/**
 * 오디오 URL을 받아 규격을 넘으면 잘라서 버퍼로 돌려준다.
 *
 * @param audioUrl      Suno가 반환한 음원 URL
 * @param maxSeconds    이 값을 넘으면 트림 (기본 29초 — 30초는 과금 경계)
 * @param targetSeconds 트림 시 최종 길이 (기본 28.5초)
 * @param fadeSeconds   끝부분 페이드아웃 길이 (기본 0.4초)
 */
export async function trimAudioToSpec(
  audioUrl: string,
  maxSeconds = 29,
  targetSeconds = 28.5,
  fadeSeconds = 0.4
): Promise<TrimResult> {
  const tmpDir = os.tmpdir();
  const stamp = Date.now();
  const srcPath = path.join(tmpDir, `viral_src_${stamp}.mp3`);
  const outPath = path.join(tmpDir, `viral_trim_${stamp}.mp3`);
  const cleanup = async () => {
    for (const f of [srcPath, outPath]) {
      await fs.promises.unlink(f).catch(() => {});
    }
  };

  try {
    const res = await fetch(audioUrl);
    if (!res.ok) {
      return { trimmed: false, originalSeconds: null, finalSeconds: null, buffer: null, error: `음원 다운로드 실패 (${res.status})` };
    }
    await fs.promises.writeFile(srcPath, Buffer.from(await res.arrayBuffer()));

    const original = await probeDurationSeconds(srcPath);
    if (original === null) {
      await cleanup();
      return { trimmed: false, originalSeconds: null, finalSeconds: null, buffer: null, error: '길이 측정 실패' };
    }

    // 규격 안이면 손대지 않는다. 재인코딩은 그 자체로 음질 손실이다.
    if (original <= maxSeconds) {
      await cleanup();
      return { trimmed: false, originalSeconds: original, finalSeconds: original, buffer: null };
    }

    const fadeStart = Math.max(0, targetSeconds - fadeSeconds);
    const ffmpeg = resolveFfmpeg();
    await execAsync(
      `"${ffmpeg}" -y -i "${srcPath}" -t ${targetSeconds} -af "afade=t=out:st=${fadeStart}:d=${fadeSeconds}" -c:a libmp3lame -q:a 2 "${outPath}"`
    );

    if (!fs.existsSync(outPath)) {
      await cleanup();
      return { trimmed: false, originalSeconds: original, finalSeconds: original, buffer: null, error: 'ffmpeg 출력 없음' };
    }

    const buffer = await fs.promises.readFile(outPath);
    const finalSeconds = await probeDurationSeconds(outPath);
    await cleanup();

    return { trimmed: true, originalSeconds: original, finalSeconds: finalSeconds ?? targetSeconds, buffer };
  } catch (err: any) {
    await cleanup();
    // 트림 실패는 치명적이지 않다. 호출부가 원본을 그대로 쓰면 된다.
    return { trimmed: false, originalSeconds: null, finalSeconds: null, buffer: null, error: err?.message || String(err) };
  }
}
