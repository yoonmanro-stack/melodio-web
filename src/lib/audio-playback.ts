type TrackDurationMetadata = {
  license_hash?: string | null;
  duration_mode?: string | null;
};

export function getStoredTrackDuration(track: TrackDurationMetadata): number {
  const metadata = track.license_hash || track.duration_mode;
  if (!metadata) return 0;
  try {
    const parsed = JSON.parse(metadata);
    for (const value of [parsed?.duration, parsed?.durationSeconds]) {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
    }
  } catch {
    // Legacy values such as "clip" and "full" have no measured duration.
  }
  return 0;
}

export function getExpiredAudioPlaybackError(
  audioUrl: string,
  now = Date.now(),
): string | null {
  try {
    const url = new URL(audioUrl);
    const expires = Number(url.searchParams.get('Expires'));
    if (url.searchParams.has('Signature') && Number.isFinite(expires) && expires > 0 && expires * 1000 <= now) {
      return '재생 주소의 유효기간이 지났습니다. 음원 주소 복구가 필요합니다.';
    }
  } catch {
    // Relative and legacy references have no known expiry.
  }
  return null;
}

export function getAudioPlaybackError(
  audioUrl: string,
  error?: { name?: string } | null,
  now = Date.now(),
): string | null {
  if (error?.name === 'AbortError' || error?.name === 'NotAllowedError') return null;
  const expired = getExpiredAudioPlaybackError(audioUrl, now);
  if (expired) return expired;
  return '음원 파일을 불러오지 못했습니다. 잠시 후 다시 재생해 주세요.';
}
