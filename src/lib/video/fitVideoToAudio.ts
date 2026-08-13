/**
 * 영상 길이를 음원 길이에 맞추는 ffmpeg 명령을 만든다.
 *
 * ── 왜 공용 모듈인가 ──────────────────────────────────────────────
 * 이 로직은 원래 grok-video/route.ts 와 grok-video/merge/route.ts 에 복제돼
 * 있었고, 두 파일 모두 "한쪽만 고치면 반영이 안 된다"는 경고 주석을 달고
 * 있었다. 실제로 route.ts 만 고쳤을 때 "영상 30초 / 음원 34초, 마지막 소절
 * 잘림" 이 그대로 재현됐다. 실제 병합은 대개 프록시(merge)에서 돌기 때문이다.
 * 그래서 한 곳에만 둔다.
 *
 * ── 왜 마지막 프레임 정지인가 ─────────────────────────────────────
 * 과금 구조:
 *   - Suno 음원은 2분 이내 정액이다. 곡이 25초든 34초든 음원 비용은 같다.
 *   - Grok 영상은 15초 단위다. 2클립 = 30초. 30초를 1초라도 넘기면
 *     3번째 클립이 통째로 과금된다. 비용 절벽은 여기 하나뿐이다.
 *
 * 즉 음원이 34초로 나와도 클립을 하나 더 사는 것은 손해다. 남는 4초를
 * 무엇으로 채울 것인가의 문제인데, 기존 구현은 -stream_loop 로 영상을
 * 처음부터 다시 틀었다. 30초짜리 스킷 뒤에 도입부 4초가 또 나오니
 * 훅 장면이 두 번 등장해 편집 실수처럼 보였다.
 *
 * 마지막 프레임을 고정하면 마지막 소절이 정지 화면 위로 흐르는 마무리가
 * 되어 의도된 연출로 읽힌다.
 *
 * 다만 정지에는 한도가 있다. 4초 정지는 마무리지만 15초 정지는 그냥
 * 멈춘 영상이다. 그 구간을 넘으면 차라리 루프가 덜 나쁘다.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

/** 이 시간까지는 마지막 프레임을 고정한다. 넘으면 루프로 되돌아간다. */
export const MAX_FREEZE_SECONDS = 8;

/**
 * 미디어 길이(초)를 잰다. 실패하면 null.
 *
 * ⚠️ 이 함수가 존재하는 이유 — ffprobe 는 없을 수 있다.
 *
 * 기존 코드는 어디서나 `ffmpegCmd.replace(/ffmpeg$/i, 'ffprobe')` 로 경로를
 * 만들어 썼는데, 배포에 쓰는 ffmpeg-static 패키지는 ffmpeg 바이너리만
 * 배포한다. ffprobe 는 형제 파일로 존재하지 않는다. 그래서 만들어진 경로가
 * 실재하지 않아 execAsync 가 던지고, 호출부의 catch 가 그것을 삼킨 뒤
 * 기본값(30초 / 28.5초)으로 조용히 넘어갔다.
 *
 * 그 결과가 "영상 30초 / 음원 34초 / 마지막 소절 잘림" 이다.
 * 음원이 34초인 걸 알아채지 못했으니 영상을 30초로 만들고
 * -t 30 -shortest 로 묶어 음원 뒤 4초를 버린 것이다.
 *
 * 그래서 ffprobe 가 실제로 있을 때만 쓰고, 없으면 ffmpeg 로 잰다.
 * `ffmpeg -i <파일>` 은 출력 대상이 없어 exit 1 로 끝나지만, 그 전에
 * 헤더를 읽어 "Duration: 00:00:34.02" 를 stderr 에 남긴다. 그걸 파싱한다.
 */
export async function probeDurationSeconds(
  ffmpegCmd: string,
  file: string
): Promise<number | null> {
  const ffprobeCmd = ffmpegCmd.replace(/ffmpeg$/i, 'ffprobe');

  // ffprobe 가 진짜로 있을 때만 쓴다. 경로를 만들었다고 존재하는 게 아니다.
  if (ffprobeCmd !== ffmpegCmd && fs.existsSync(ffprobeCmd)) {
    try {
      const { stdout } = await execAsync(
        `"${ffprobeCmd}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`
      );
      const s = parseFloat(stdout.trim());
      if (Number.isFinite(s) && s > 0) return s;
    } catch {
      // ffprobe 가 있어도 실패할 수 있다. 아래 ffmpeg 경로로 넘어간다.
    }
  }

  const parseDuration = (text: string): number | null => {
    const m = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(text || '');
    if (!m) return null;
    const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + parseFloat(m[3]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  };

  try {
    const { stderr } = await execAsync(`"${ffmpegCmd}" -hide_banner -i "${file}"`);
    return parseDuration(stderr);
  } catch (err: unknown) {
    // 정상 경로다. 출력 대상이 없으면 ffmpeg 는 exit 1 을 내면서도
    // stderr 에 스트림 정보를 이미 다 찍어 놓는다.
    const stderr = (err as { stderr?: string })?.stderr ?? '';
    return parseDuration(stderr);
  }
}

export type FitStrategy = 'trim' | 'freeze' | 'loop';

export interface FitPlan {
  strategy: FitStrategy;
  /** 마지막 프레임을 고정할 시간(초). freeze 일 때만 0보다 크다. */
  freezeSeconds: number;
  /** 사람이 읽을 로그 한 줄 */
  reason: string;
}

/**
 * 영상 길이와 목표 길이를 비교해 무엇을 할지 정한다.
 *
 * @param videoSeconds  현재 영상 길이. 측정 실패 시 null 을 넘긴다.
 * @param targetSeconds 맞춰야 할 음원 길이.
 */
export function planFit(videoSeconds: number | null, targetSeconds: number): FitPlan {
  // 길이를 못 쟀으면 손대지 않는다. 잘못된 추정으로 늘리는 것보다 낫다.
  if (videoSeconds === null || !Number.isFinite(videoSeconds) || videoSeconds <= 0) {
    return { strategy: 'trim', freezeSeconds: 0, reason: '영상 길이 측정 실패 — 보정 없이 트림만 적용' };
  }

  const gap = targetSeconds - videoSeconds;

  // 0.3초 이내 차이는 인코딩 오차다. 건드리면 오히려 프레임이 튄다.
  if (gap <= 0.3) {
    return {
      strategy: 'trim',
      freezeSeconds: 0,
      reason: `영상 ${videoSeconds.toFixed(1)}s ≥ 음원 ${targetSeconds.toFixed(1)}s — 트림만 적용`,
    };
  }

  if (gap <= MAX_FREEZE_SECONDS) {
    return {
      strategy: 'freeze',
      freezeSeconds: gap,
      // 여유를 조금 더 붙여 자르는 편이 안전하다. 정확한 마감은 -t 가 한다.
      reason: `영상 ${videoSeconds.toFixed(1)}s < 음원 ${targetSeconds.toFixed(1)}s — 마지막 프레임을 ${gap.toFixed(1)}s 고정해 채움 (3번째 클립 과금 회피)`,
    };
  }

  return {
    strategy: 'loop',
    freezeSeconds: 0,
    reason: `영상 ${videoSeconds.toFixed(1)}s 가 음원 ${targetSeconds.toFixed(1)}s 보다 ${gap.toFixed(1)}s 짧다 — 정지 한도(${MAX_FREEZE_SECONDS}s) 초과라 루프로 채움`,
  };
}

/**
 * planFit 결과를 ffmpeg 명령 문자열로 만든다.
 *
 * tpad=stop_mode=clone 은 마지막 프레임을 복제해 뒤에 붙인다.
 * stop_duration 에 여유를 조금 더 주고 -t 로 정확히 끊는 편이,
 * 반올림 때문에 몇 프레임 모자라 검은 화면이 스치는 것보다 낫다.
 */
export function buildFitCommand(args: {
  ffmpegCmd: string;
  inputFile: string;
  outputFile: string;
  targetSeconds: number;
  plan: FitPlan;
}): string {
  const { ffmpegCmd, inputFile, outputFile, targetSeconds, plan } = args;

  const loopFlag = plan.strategy === 'loop' ? '-stream_loop -1 ' : '';
  const padFilter =
    plan.strategy === 'freeze'
      ? `-vf "tpad=stop_mode=clone:stop_duration=${(plan.freezeSeconds + 1).toFixed(2)}" `
      : '';

  return `${ffmpegCmd} -y ${loopFlag}-i "${inputFile}" -an ${padFilter}-t ${targetSeconds} -c:v libx264 -preset fast -crf 22 "${outputFile}"`;
}
