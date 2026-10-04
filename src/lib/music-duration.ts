type DurationRequest = {
  isViral?: unknown
  isViralTrack?: unknown
  sourceMenu?: unknown
  metadata?: unknown
}

function validSeconds(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  const clock = text.match(/^(\d+):([0-5]\d)$/)
  const seconds = clock ? Number(clock[1]) * 60 + Number(clock[2]) : Number(text)
  return Number.isFinite(seconds) && seconds >= 10 && seconds <= 360 ? seconds : null
}

/** Musical descriptions such as "short hook" must never select a video format. */
export function resolveMusicDuration(request: DurationRequest) {
  const metadata = request.metadata && typeof request.metadata === 'object'
    ? request.metadata as { durationSeconds?: unknown; duration?: unknown } : null
  const explicit = validSeconds(metadata?.durationSeconds) ?? validSeconds(metadata?.duration)
  const shortRequest = request.isViral === true || request.isViralTrack === true
    || request.sourceMenu === 'viral' || request.sourceMenu === 'viral-cf'
  const seconds = explicit ?? (shortRequest ? 28 : 195)
  return {
    seconds,
    mode: shortRequest || seconds <= 60 ? 'short-form' as const : 'full-song' as const,
    source: explicit !== null ? 'explicit-duration' as const
      : shortRequest ? 'short-form-request' as const : 'studio-default' as const,
  }
}
