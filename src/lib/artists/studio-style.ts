/** Artist defaults seed an empty studio; the song's explicit style stays editable. */
export function buildArtistMusicStyle(genres: readonly string[]): string {
  const seen = new Set<string>()
  return genres.map(genre => genre.trim()).filter(genre => {
    if (!genre || seen.has(genre.toLowerCase())) return false
    seen.add(genre.toLowerCase())
    return true
  }).join(', ')
}

export function resolveArtistMusicStyle(
  currentStyle: string,
  artistDefault: string,
): string {
  return currentStyle.trim() ? currentStyle : artistDefault
}
