type CoverTrack = {
  cover_art_url?: string | null
  image_url?: string | null
  license_hash?: unknown
  metadata?: unknown
}

export const TRACK_COVER_PENDING = '/track-cover-pending.svg'

function readCoverPolicy(track: CoverTrack) {
  let metadata = track.metadata
  if (typeof track.license_hash === 'string') {
    try { metadata = JSON.parse(track.license_hash) } catch { /* Legacy rows may have no JSON metadata. */ }
  }
  if (!metadata || typeof metadata !== 'object') return null
  const policy = (metadata as { coverArt?: Record<string, unknown> }).coverArt
  return policy?.requestedStyle === 'photoreal' ? policy : null
}

function validCoverUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) &&
      url.hostname !== 'unsplash.com' && !url.hostname.endsWith('.unsplash.com')
  } catch { return false }
}

/** A failed photo request must not silently display unrelated genre artwork. */
export function getTrackCoverFallback(track: CoverTrack, legacyFallback: string): string {
  return readCoverPolicy(track) ? TRACK_COVER_PENDING : legacyFallback
}

export function resolveTrackCoverUrl(track: CoverTrack, legacyFallback: string): string {
  const policy = readCoverPolicy(track)
  if (policy) {
    const cover = track.cover_art_url
    return policy.status === 'ready' && policy.assetUrl === cover && validCoverUrl(cover)
      ? cover : TRACK_COVER_PENDING
  }
  const cover = track.cover_art_url || track.image_url
  return validCoverUrl(cover) ? cover : legacyFallback
}
