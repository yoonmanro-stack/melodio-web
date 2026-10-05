import { restoreDesignAttributes } from './restore-design-attributes'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const UUID_PATTERN = new RegExp(`^${UUID}$`, 'i')
const GENERATED_AUDIO_PATH = new RegExp(
  `^/storage/v1/object/public/melodio-assets/generated_audio/v1/(${UUID})/[0-9a-f]{24}/[1-9][0-9]*-[0-9a-f]{20}/[0-9a-f]{64}\\.(?:mp3|aac|wav|m4a|ogg|flac)$`,
)

export type LegacyGeneratedSampleHint = {
  /** Original generation; the selected B row must still be resolved by the authenticated API. */
  generationId: string
  sampleVersion: 'A' | 'B'
  expectedAudioUrl: string
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function recipe(value: unknown): string | null {
  const restored = restoreDesignAttributes(value)
  if (!restored) return null
  const { name, vd_code, ...attributes } = restored
  void name
  void vd_code
  return JSON.stringify(attributes)
}

/** Validate a durable generated-audio URL without fetching it or establishing ownership. */
export function generatedAudioGenerationId(value: unknown, supabaseUrl: string): string | null {
  if (typeof value !== 'string' || value.length > 2048 || value.includes('?') || value.includes('#')) return null
  try {
    const configured = new URL(supabaseUrl)
    const audio = new URL(value)
    if (configured.protocol !== 'https:' || configured.username || configured.password || configured.search || configured.hash
      || configured.href !== `${configured.origin}/` || audio.protocol !== 'https:' || audio.origin !== configured.origin
      || audio.username || audio.password || audio.search || audio.hash || audio.href !== value) return null
    return GENERATED_AUDIO_PATH.exec(audio.pathname)?.[1] || null
  } catch {
    return null
  }
}

/** A local migration hint only. Never play or trust it until an owned completed generation matches it. */
export function resolveLegacyGeneratedSample(
  voice: unknown,
  records: unknown,
  supabaseUrl: unknown,
): LegacyGeneratedSampleHint | null {
  const saved = object(voice)
  if (!saved || !Array.isArray(records) || typeof supabaseUrl !== 'string') return null
  if (typeof saved.sampleGenerationId === 'string' && UUID_PATTERN.test(saved.sampleGenerationId)) return null

  const attributes = object(saved.designAttributes)
  const code = attributes?.vd_code
  if (typeof code !== 'string' || !code || code.length > 80 || code.trim() !== code || code === 'VD-SAVED') return null
  const matches = records.map(object).filter(record => record?.vd_code === code)
  if (matches.length !== 1) return null
  const record = matches[0]!
  const savedRecipe = recipe(attributes)
  if (!savedRecipe || savedRecipe !== recipe(record)) return null

  if (record.sample_version !== undefined && record.sample_version !== 'A' && record.sample_version !== 'B') return null
  const sampleVersion = record.sample_version === 'B' ? 'B' : 'A'
  for (const selected of [saved.sampleVersion, saved.selectedVersion]) {
    if (selected !== undefined && selected !== sampleVersion) return null
  }
  const expectedAudioUrl = sampleVersion === 'B' ? record.audio_url_b : record.audio_url
  if (typeof expectedAudioUrl !== 'string') return null
  const generationId = generatedAudioGenerationId(expectedAudioUrl, supabaseUrl)
  return generationId ? { generationId, sampleVersion, expectedAudioUrl } : null
}
