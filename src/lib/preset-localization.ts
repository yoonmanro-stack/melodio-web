import type { Preset } from '@/types'
import type { Language } from '@/contexts/LanguageContext'
import presetDisplayNames from '@/data/presetDisplayNames.json'
import { canonicalPresetId } from './preset-catalog'

type LocalizationOptions = { isCustom?: boolean }
const reviewedNames = presetDisplayNames as Record<string, Partial<Record<Language, string>>>

function populated(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function personalPreset(preset: Preset, options: LocalizationOptions): boolean {
  return options.isCustom ?? (preset.isCustom === true || preset.id.startsWith('custom-'))
}

/** Display text only. Explicit locale edits win over the reviewed public catalog. */
export function getPresetDisplayName(preset: Preset, language: string, options: LocalizationOptions = {}): string {
  const meta = preset.metadata ?? {}
  const explicit = [meta[`name_${language}`], preset[`name_${language}`]].find(populated)
  if (explicit) return explicit
  // Personal names must never inherit a public alias or an unrelated English field.
  if (personalPreset(preset, options)) return preset.name
  const reviewed = reviewedNames[canonicalPresetId(preset.id)]?.[language as Language]
  return [reviewed, preset.name, meta.name_en, preset.name_en].find(populated) ?? preset.name
}

/** Return a presentation copy while preserving identity, recipe and metadata. */
export function localizePresetForDisplay(preset: Preset, language: string, options: LocalizationOptions = {}): Preset {
  const meta = preset.metadata ?? {}
  const descriptions = [meta[`desc_${language}`], preset[`desc_${language}`]]
  if (!personalPreset(preset, options)) descriptions.push(meta.desc_en, preset.desc_en)
  descriptions.push(preset.desc)
  return { ...preset, name: getPresetDisplayName(preset, language, options), desc: descriptions.find(populated) ?? preset.desc }
}
