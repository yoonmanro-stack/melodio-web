export const SUNO_VERSIONS = ['v6', 'v6-mini', 'v6-wild'] as const

/** Restore old saved presets using the current supported model. */
export function currentSunoVersion(version?: string): string {
  const normalized = String(version || '').toLowerCase().replace(/[ _]+/g, '-')
  return normalized === 'v6-mini' || normalized === 'v6-wild' ? normalized : 'v6'
}
