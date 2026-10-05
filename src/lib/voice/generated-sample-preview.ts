import { generatedAudioGenerationId } from './generated-sample-selection'

export const isGenerationId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export interface GeneratedPreview {
  sampleGenerationId: string
  audioUrl: string
}

/** Resolve only completed server records, never a cached/provider/source upload URL. */
export async function fetchGeneratedSamplePreview(
  generationId: string,
  expectedAudioUrl: string | undefined,
  options: { fetcher: typeof fetch; signal: AbortSignal; supabaseUrl: string },
): Promise<GeneratedPreview | null> {
  if (!isGenerationId(generationId)) return null
  const response = await options.fetcher(`/api/generations?id=${encodeURIComponent(generationId)}`, {
    cache: 'no-store', signal: options.signal,
  })
  if (!response.ok) return null
  const data = await response.json()
  if (options.signal.aborted || !data || typeof data !== 'object') return null
  const primary = data.generation
  if (primary?.id !== generationId) return null
  const candidates = expectedAudioUrl ? [primary, data.sibling] : [primary]
  // The API strips user_id for non-owners, including public tracks.
  const matches = candidates.filter(row => row && isGenerationId(row.id) && isGenerationId(row.user_id) && row.status === 'completed'
    && typeof row.audio_url === 'string'
    && generatedAudioGenerationId(row.audio_url, options.supabaseUrl)
    && (!expectedAudioUrl || row.audio_url === expectedAudioUrl))
  if (matches.length !== 1) return null
  return { sampleGenerationId: matches[0].id, audioUrl: matches[0].audio_url }
}
