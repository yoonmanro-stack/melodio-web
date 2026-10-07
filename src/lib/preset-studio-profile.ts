import profiles from '../../worker/preset-studio-profiles.json'

export interface PresetStudioProfile {
  genreLabel: string
  family: string
  isInstrumental: boolean
  defaultVocal: string
  sourceRecipe: string
  /** Original DB recipe before the previous twelve catalog corrections. */
  catalogSourceRecipe?: string
  bundledSourceRecipe?: string
  recipe: string
  selectedVoiceRecipe: string
  instrumentalRecipe: string
  lyricTheme: string
  recommendedSampleGender?: 'male' | 'female' | 'duet'
  performanceSectionCount?: 8
  provenance: { recipeHash: string; sourceCommit: string }
}

const aliases: Record<string, string> = { grime: 'uk_grime', grunge: 'grunge_seattle', 'joseon-hip-hop': 'joseon-hiphop' }
export function getPresetStudioProfile(id?: unknown): PresetStudioProfile | undefined {
  if (typeof id !== 'string') return undefined
  const key = aliases[id] || id
  return Object.hasOwn(profiles, key) ? (profiles as Record<string, PresetStudioProfile>)[key] : undefined
}

export function isPresetStudioSource(source: unknown): boolean {
  return ['preset-studio', 'audio-forge', 'audio-forge-pro', 'audio'].includes(String(source || ''))
}

/** Gender terms inside a reviewed genre or instrument name are musical data, not vocal instructions. */
export function preservePresetStudioMusicWhileScrubbing(style: string, id: unknown,
  gender: 'male' | 'female' | 'duet', scrub: (value: string, target: 'male' | 'female' | 'duet') => string): string {
  const profile = getPresetStudioProfile(id)
  if (!profile) return scrub(style, gender)
  const protectedMusic: string[] = []
  let masked = style
  for (const recipe of [...new Set([profile.recipe, profile.selectedVoiceRecipe])].sort((a, b) => b.length - a.length)) {
    if (masked.includes(recipe)) {
      const token = `MELODIOMUSICCORE${protectedMusic.length}TOKEN`
      protectedMusic.push(recipe)
      masked = masked.split(recipe).join(token)
    }
  }
  let cleaned = scrub(masked, gender)
  protectedMusic.forEach((recipe, index) => { cleaned = cleaned.split(`MELODIOMUSICCORE${index}TOKEN`).join(recipe) })
  return cleaned
}

/** Replace only a reviewed catalog recipe. User edits and future DB recipes retain authority. */
export function resolvePresetStudioStyle(style: string, id: unknown, instrumental: boolean, selectedVoice = false): string {
  const profile = getPresetStudioProfile(id)
  if (!profile) return style
  const recipe = instrumental ? profile.instrumentalRecipe : selectedVoice ? profile.selectedVoiceRecipe : profile.recipe
  const owned = [...new Set([profile.sourceRecipe, profile.recipe, profile.selectedVoiceRecipe, profile.instrumentalRecipe])]
    .filter(Boolean).sort((a, b) => b.length - a.length)
  for (const original of owned) {
    const index = style.indexOf(original)
    if (index !== -1) return style.slice(0, index) + recipe + style.slice(index + original.length)
  }
  return style
}

/** End at complete clauses or words, without cutting genre/instrument names in half. */
export function fitPresetStudioStyleBudget(value: string, limit = 1000): string {
  const text = value.trim()
  if (text.length <= limit) return text
  const prefix = text.slice(0, limit + 1)
  const clauseEnd = Math.max(...[',', ';', '\n', '。', '、'].map(mark => prefix.lastIndexOf(mark)))
  if (clauseEnd >= limit * 0.65) return text.slice(0, clauseEnd).trim()
  const wordEnd = prefix.search(/\s\S*$/u)
  if (wordEnd > 0) return text.slice(0, wordEnd).trim()
  throw new Error('음악 스타일 설명을 문장이나 태그로 나누어 줄여 주세요.')
}
