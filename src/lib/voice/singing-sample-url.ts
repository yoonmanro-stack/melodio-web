/**
 * Legacy VD assets contain spoken TTS introductions, not singing auditions.
 * Having a URL does not establish vocal provenance; reject those known clips
 * even when old saved entries contain absolute or encoded copies of the path.
 */
export function getSingingSampleUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const sample = value.trim()
  if (!sample || (!sample.startsWith('/') && !/^https?:\/\//i.test(sample))) return null
  try {
    const url = new URL(sample, 'https://melodio.app')
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    const pathname = decodeURIComponent(url.pathname).replace(/\\/g, '/')
    if (/\/assets\/voices\/vd[^/]*\.mp3$/i.test(pathname)) return null
    return sample
  } catch {
    return null
  }
}
