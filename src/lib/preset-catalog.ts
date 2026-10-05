import type { Preset } from '@/types'
import { presetCatalogCategories, type PresetPurpose } from '@/data/presetCatalogCategories'
import { presetCatalogCorrections } from '@/data/presetCatalogCorrections'

/** Historical public keys continue to resolve, while one representative is listed. */
export const PUBLIC_PRESET_ALIASES: Readonly<Record<string, string>> = {
  grime: 'uk_grime',
  grunge: 'grunge_seattle',
  'joseon-hip-hop': 'joseon-hiphop',
}

export function canonicalPresetId(id: string): string {
  return PUBLIC_PRESET_ALIASES[id] || id
}

const purposes = new Set<PresetPurpose>(['healing', 'focus', 'retro', 'cafe', 'drive', 'cinematic'])
const purposeAliases: Record<string, PresetPurpose> = { dance: 'drive', party: 'drive', sleep: 'healing', study: 'focus' }

export function getPresetCategory(preset: Preset): PresetPurpose {
  const reviewed = presetCatalogCategories[canonicalPresetId(preset.id)]
  if (reviewed) return reviewed
  const selected = preset.metadata?.category || preset.category
  if (purposes.has(selected)) return selected
  if (purposeAliases[selected]) return purposeAliases[selected]
  // New or personal styles use their own content, instead of always becoming healing.
  const text = `${preset.customPrompt || ''} ${preset.name || ''} ${preset.desc || ''}`.toLowerCase()
  if (/sleep|meditation|healing|수면|명상|힐링/.test(text)) return 'healing'
  if (/focus|study|coding|공부|집중|작업/.test(text)) return 'focus'
  if (/jazz|bossa|cafe|카페|재즈/.test(text)) return 'cafe'
  if (/cinematic|orchestr|epic|metal|시네마|국악/.test(text)) return 'cinematic'
  if (/retro|vintage|nostalgi|1980|1990|트로트|레트로/.test(text)) return 'retro'
  if (/dance|rock|hip.?hop|funk|pop|drum|club|댄스|드라이브/.test(text)) return 'drive'
  return 'healing'
}

export function getPresetGenreLabel(preset: Preset): string {
  const declared = preset.metadata?.inferred_genre || preset.metadata?.parent_genre
  if (typeof declared === 'string' && declared.trim()) return declared.trim()
  if (typeof preset.metadata?.genre_label === 'string') return preset.metadata.genre_label
  // Public catalog names already declare the genre; do not mislabel them as generic lofi.
  if (preset.isDb) return preset.name.split(/\s*[（(]/)[0].trim()
  const firstTag = preset.customPrompt?.split(/[,;\n]/)[0]?.trim()
  return firstTag || '사용자 스타일'
}

export function applyPublicPresetCorrections(preset: Preset): Preset {
  const correction = (presetCatalogCorrections as Record<string, Partial<Preset>>)[preset.id]
  const category = getPresetCategory(preset)
  if (!correction) return { ...preset, category, metadata: { ...preset.metadata, category } }
  const metadata: NonNullable<Preset['metadata']> = { ...preset.metadata, ...correction.metadata, category: correction.category || category }
  if (correction.customPrompt) metadata.studio_grade_prompt = correction.customPrompt
  if (typeof correction.instrumentalOnly === 'boolean') metadata.instrumentalOnly = correction.instrumentalOnly
  for (const language of ['ko', 'en', 'ja']) {
    if (correction[`name_${language}`]) metadata[`name_${language}`] = correction[`name_${language}`]
    if (correction[`desc_${language}`]) metadata[`desc_${language}`] = correction[`desc_${language}`]
  }
  return { ...preset, ...correction, metadata }
}

export function isPublicPresetVisible(preset: Preset): boolean {
  const status = preset.metadata?.publication_status
  const quality = preset.metadata?.quality_status
  const recipe = preset.customPrompt || preset.metadata?.studio_grade_prompt || preset.metadata?.suno_tags
  return !['draft', 'held', 'archived', 'hidden'].includes(status)
    && !['failed', 'rejected', 'held'].includes(quality)
    && typeof preset.name === 'string' && Boolean(preset.name.trim())
    && typeof recipe === 'string' && Boolean(recipe.trim())
}

/** A hidden DB row suppresses its bundled version too; database data takes precedence. */
export function mergePublicPresetCatalog(database: Preset[], bundled: Preset[]): Preset[] {
  const occupied = new Set(database.map(preset => canonicalPresetId(preset.id)))
  const candidates = [...database, ...bundled.filter(preset => !occupied.has(canonicalPresetId(preset.id)))]
  const representatives = new Map<string, Preset>()
  for (const preset of candidates) {
    if (!preset?.id) continue
    const id = canonicalPresetId(preset.id)
    const previous = representatives.get(id)
    if (!previous || preset.id === id) representatives.set(id, preset)
  }
  return [...representatives].filter(([, preset]) => isPublicPresetVisible(preset))
    .map(([id, preset]) => applyPublicPresetCorrections({ ...preset, id }))
}

export function findStudioPreset(id: string, personal: Preset[], publicCatalog: Preset[]): Preset | undefined {
  return personal.find(preset => preset.id === id)
    || publicCatalog.find(preset => preset.id === canonicalPresetId(id))
}
