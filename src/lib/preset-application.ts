import type { Preset } from '@/types'

/** Decide from the original recipe, before display or provider formatting can truncate it. */
export function resolvePresetInstrumental(preset: Preset, recipe: string): boolean {
  const explicit = preset.instrumentalOnly ?? preset.metadata?.instrumentalOnly ?? preset.metadata?.isInstrumental
  if (typeof explicit === 'boolean') return explicit
  if (preset.lyricsTemplate?.trim()) return false
  if (/\b(instrumental\s+only|no\s+(?:lead\s+)?vocals|without\s+vocals)\b/i.test(recipe)
    || /연주곡|연주/.test(`${preset.name} ${preset.desc}`)) return true
  // "Rich instrumental palette" does not make a vocal song an instrumental.
  if (/\b(vocals?|singing|sung|rapping|rap|spoken.word)\b/i.test(recipe)) return false
  return /\binstrumental\b/i.test(recipe)
}

/** Membership never silently changes a selected preset's musical identity. */
export function resolvePresetApplication(preset: Preset, composedFallback = '') {
  const stylePrompt = (preset.customPrompt || preset.metadata?.studio_grade_prompt || preset.metadata?.suno_tags
    || composedFallback || preset.desc || preset.name || 'lofi relaxing study music').trim()
  const exclusions = preset.excludePrompt || preset.metadata?.exclude_tags
  const excludePrompt = typeof exclusions === 'string' ? exclusions.trim()
    : Array.isArray(exclusions) ? exclusions.filter(value => typeof value === 'string').join(', ') : ''
  return {
    stylePrompt,
    isInstrumental: resolvePresetInstrumental(preset, stylePrompt),
    excludePrompt,
    lyricsTemplate: preset.lyricsTemplate || '',
  }
}

/** Auto lyrics may supply a title and words; the selected musical recipe stays intact. */
export function resolveGeneratedPresetStyle(originalStyle: string, generatedStyle: unknown, hasPreset: boolean): string {
  return !hasPreset && typeof generatedStyle === 'string' && generatedStyle.trim()
    ? generatedStyle.trim() : originalStyle
}

export function parsePresetLyrics(template: string) {
  if (!template.trim()) return []
  const matches = [...template.matchAll(/\[(Intro|Verse(?:\s+\d+)?|Pre-Chorus|Chorus(?:\s+\d+)?|Bridge|Outro)(?::\s*([^\]]+))?\]\s*([\s\S]*?)(?=\[(?:Intro|Verse|Pre-Chorus|Chorus|Bridge|Outro)|$)/gi)]
  if (!matches.length) return [{ id: 'preset-verse-1', type: 'verse' as const, content: template.trim() }]
  return matches.map((match, index) => ({
    id: `preset-section-${index}`,
    type: match[1].toLowerCase().replace(/\s+\d+$/, '') as 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro',
    content: match[3].trim(),
    ...(match[2] ? { description: match[2].trim() } : {}),
  }))
}
