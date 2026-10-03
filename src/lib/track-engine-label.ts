type TrackVersionRecord = {
  license_hash?: string | null
  duration_mode?: string | null
  audio_url?: string | null
  source_audio_url?: string | null
}

/** Show the recorded version without upgrading the labels of older tracks. */
export function trackEngineLabel(track: TrackVersionRecord): string {
  let metadata: Record<string, unknown> = {}
  for (const source of [track.license_hash, track.duration_mode]) {
    if (!source) continue
    try {
      const parsed = JSON.parse(source)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed
        break
      }
    } catch {
      // Older duration modes are plain strings rather than metadata.
    }
  }

  if (metadata.engine === 'lyria3' || (track.source_audio_url || track.audio_url || '').includes('lyria')) {
    return 'Lyria v3.0'
  }

  const version = String(metadata.sunoVersion || metadata.sunoModel || '').trim()
    .match(/^v?(\d+(?:\.\d+)?)(?:[ _-](mini|wild|all|pro))?$/i)
  return version ? `Suno v${version[1]}${version[2] ? `-${version[2].toLowerCase()}` : ''}` : 'Suno'
}
