export interface AssemblyTimelineSource {
  trackNumber: number
  title: string
  durationSeconds: number
}

export interface AssemblyTimelineItem extends AssemblyTimelineSource {
  startSeconds: number
  endSeconds: number
  timestamp: string
}

export function formatPlaylistTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function compileAssemblyTimeline(sources: AssemblyTimelineSource[]) {
  let cursor = 0
  const items: AssemblyTimelineItem[] = sources.map((source) => {
    if (!Number.isFinite(source.durationSeconds) || source.durationSeconds <= 0) {
      throw new Error(`Track ${source.trackNumber}의 실제 재생시간이 필요합니다.`)
    }
    const startSeconds = cursor
    cursor += source.durationSeconds
    return {
      ...source,
      startSeconds,
      endSeconds: cursor,
      timestamp: formatPlaylistTimestamp(startSeconds),
    }
  })
  return {
    items,
    totalDurationSeconds: cursor,
    tracklistText: items.map((item) => `${item.timestamp} ${item.title}`).join('\n'),
  }
}
