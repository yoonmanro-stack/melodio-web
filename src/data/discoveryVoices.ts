import type { VoiceItem } from '@/contexts/VoiceContext'
import catalog from './discoveryVoices.json'

/** Discovery candidates are separate from the authored Melodio vocal catalog. */
export type DiscoveryVoice = VoiceItem & {
  discoveryVoiceId: string
  gender: 'female' | 'male'
  language: 'en' | 'ko' | 'ja' | 'fr'
  previewStatus: 'pending' | 'ready'
  reuseStatus: 'pending' | 'ready'
  previewStartSeconds: number
  sampleDurationSeconds: number
  lyricsPrompt: string
  bpm: number
}

export const DISCOVERY_VOICES: readonly DiscoveryVoice[] = catalog.map(row => ({
  ...row,
  createdAt: row.createdAtISO,
  sourceType: 'discovered',
  isFavorite: false,
  is100PercentSync: false,
})) as DiscoveryVoice[]

export function discoveryVoiceItem(id: string): DiscoveryVoice | null {
  const voice = DISCOVERY_VOICES.find(row => row.id === id || row.discoveryVoiceId === id)
  return voice ? { ...voice, tags: [...voice.tags] } : null
}
