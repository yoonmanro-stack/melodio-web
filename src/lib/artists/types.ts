export type ArtistLanguage = 'ko' | 'en' | 'ja' | 'fr'
export type ArtistVoiceKind = 'official' | 'discovery' | 'designed' | 'custom'
export type ArtistVoiceReference = {
  kind: ArtistVoiceKind
  referenceId: string
  name: string
  gender: 'female' | 'male'
  language: ArtistLanguage
}
export type ArtistPortrait = {
  assetId: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  fileName: string
}
export type ArtistChecks = {
  voiceAuditioned: boolean
  portraitReviewed: boolean
  identityReviewed: boolean
}
export type ArtistProfile = {
  schemaVersion: 1
  id: string
  userId: string
  name: string
  tagline: string
  description: string
  genres: string[]
  personality: string
  backstory: string
  speakingStyle: string
  visualDirection: string
  voice: ArtistVoiceReference | null
  portrait: ArtistPortrait | null
  checks: ArtistChecks
  status: 'draft' | 'ready' | 'archived'
  revision: number
  createdAt: string
  updatedAt: string
}
export type ArtistInput = Pick<ArtistProfile, 'name' | 'tagline' | 'description' | 'genres' | 'personality' | 'backstory' | 'speakingStyle' | 'visualDirection' | 'checks' | 'status'> & {
  voice: Pick<ArtistVoiceReference, 'kind' | 'referenceId'> | null
  portrait: ArtistPortrait | null
}
export type ArtistGenerationSnapshot = {
  id: string
  name: string
  revision: number
  voice: ArtistVoiceReference
  portrait: ArtistPortrait
  tagline: string
  personality: string
  visualDirection: string
}
export const ARTIST_LANGUAGE_LABELS: Record<ArtistLanguage, string> = {
  ko: '한국어', en: '영어', ja: '일본어', fr: '프랑스어',
}
