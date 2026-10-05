import type { CSSProperties } from 'react'

export function voicePlaybackTrackStyle(position: number, duration: number): CSSProperties {
  const percentage = Number.isFinite(position) && Number.isFinite(duration) && duration > 0
    ? Math.max(0, Math.min(100, position / duration * 100)) : 0
  return { '--playback-progress': `${percentage}%` } as CSSProperties
}
