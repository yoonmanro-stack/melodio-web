type WorkRow = {
  id: string
  title: string | null
  status: string
  audio_url: string | null
  cover_art_url: string | null
  created_at: string
  license_hash: string | null
}

function assetUrl(value: string | null) {
  if (!value || value.length > 2048) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? value : null
  } catch { return null }
}

/** Never expose raw generation metadata or provider identities in the artist gallery. */
export function artistWorks(rows: WorkRow[], artistId: string) {
  return rows.slice(0, 51).flatMap(row => {
    if (!row.license_hash || row.license_hash.length > 256 * 1024) return []
    let metadata: Record<string, unknown>
    try { metadata = JSON.parse(row.license_hash) } catch { return [] }
    if (!metadata || metadata.artistId !== artistId || !Number.isSafeInteger(metadata.artistRevision)
      || Number(metadata.artistRevision) < 0) return []
    return [{
      id: row.id, title: (row.title || '제목 없는 곡').slice(0, 200), status: row.status,
      audioUrl: row.status === 'completed' ? assetUrl(row.audio_url) : null,
      coverArtUrl: assetUrl(row.cover_art_url), createdAt: row.created_at,
      artistRevision: Number(metadata.artistRevision),
    }]
  }).slice(0, 50)
}
