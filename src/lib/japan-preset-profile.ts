import profiles from '../../worker/japan-preset-profiles.json'

export interface JapanPresetProfile {
  genreLabel: string
  genreKey: string
  recipe: string
  instrumentalRecipe: string
  defaultVocal: string
  lyricTheme: string
  descriptionKo: string
  descriptionEn: string
  descriptionJa: string
  defaultMode?: string
}

const catalog = profiles as Record<string, JapanPresetProfile>

export function getJapanPresetProfile(id?: string): JapanPresetProfile | undefined {
  return id && Object.hasOwn(catalog, id) ? catalog[id] : undefined
}

/** Switch only a catalog-owned recipe; keep every user edit verbatim. */
export function resolveJapanPresetStyle(style: string, id: string | undefined, instrumental: boolean): string {
  const profile = getJapanPresetProfile(id)
  if (!profile || ![profile.recipe, profile.instrumentalRecipe].includes(style.trim())) return style
  return instrumental ? profile.instrumentalRecipe : profile.recipe
}

/** First item with a given durable ID wins: custom, then DB, then built-in. */
export function uniqueJapanPresets<T extends { id: string }>(presets: T[]): T[] {
  const seen = new Set<string>()
  return presets.filter(preset => {
    if (seen.has(preset.id)) return false
    seen.add(preset.id)
    return true
  })
}
