export const DISCOVERY_PREVIEW_SECONDS = 30

/** Reject short or unreadable media instead of presenting it as a 30-second sample. */
export function discoveryPreviewWindow(durationSeconds: number, startSeconds = 0) {
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(startSeconds) || startSeconds < 0) return null
  const end = startSeconds + DISCOVERY_PREVIEW_SECONDS
  if (durationSeconds < end) return null
  return { start: startSeconds, end }
}

export function discoveryPreviewPosition(seconds: number) {
  return Number.isFinite(seconds) ? Math.min(DISCOVERY_PREVIEW_SECONDS, Math.max(0, seconds)) : 0
}
