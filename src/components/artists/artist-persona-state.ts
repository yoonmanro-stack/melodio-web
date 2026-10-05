import type { ArtistInput, ArtistProfile } from '@/lib/artists/types'
import { artistInput, artistToDraft, type ArtistDraft } from './artist-form'

export type PersonaIdentity = Pick<ArtistDraft, 'name' | 'tagline' | 'description' | 'genresText' | 'personality' | 'backstory' | 'speakingStyle'>
export type PersonaMutation = { kind: 'save'; artistId: string; expectedRevision: number; input: ArtistInput } | { kind: 'archive'; artistId: string; expectedRevision: number }

export function personaIdentity(artist: ArtistProfile): PersonaIdentity {
  return { name: artist.name, tagline: artist.tagline, description: artist.description, genresText: artist.genres.join(', '), personality: artist.personality, backstory: artist.backstory, speakingStyle: artist.speakingStyle }
}

/** Identity editing cannot replace the reviewed face or vocal reference. */
export function personaSaveInput(artist: ArtistProfile, identity: PersonaIdentity): ArtistInput {
  return artistInput({ ...artistToDraft(artist), ...identity, status: 'draft', checks: { ...artist.checks, identityReviewed: false } })
}

export function orderedPersonaArtists(artists: ArtistProfile[]): ArtistProfile[] {
  const rank = { ready: 0, draft: 1, archived: 2 }
  return [...artists].sort((a, b) => rank[a.status] - rank[b.status] || b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, 'ko'))
}

function identityValue(input: Pick<ArtistInput, 'name' | 'tagline' | 'description' | 'genres' | 'personality' | 'backstory' | 'speakingStyle'>) {
  return JSON.stringify([input.name.trim(), input.tagline.trim(), input.description.trim(), [...new Set(input.genres.map(genre => genre.trim()).filter(Boolean))], input.personality.trim(), input.backstory.trim(), input.speakingStyle.trim()])
}

/** GET plus revision checks resolves a lost PATCH/DELETE reply before another write. */
export function reconcilePersonaMutation(receipt: PersonaMutation, current: ArtistProfile): 'applied' | 'not-applied' | 'changed' {
  if (current.id !== receipt.artistId || current.revision < receipt.expectedRevision) return 'changed'
  if (receipt.kind === 'archive' && current.status === 'archived' && current.revision > receipt.expectedRevision) return 'applied'
  if (receipt.kind === 'save' && current.revision > receipt.expectedRevision && current.status === receipt.input.status && identityValue(current) === identityValue(receipt.input)) {
    const sameVoice = current.voice?.kind === receipt.input.voice?.kind && current.voice?.referenceId === receipt.input.voice?.referenceId
    const samePortrait = current.portrait?.assetId === receipt.input.portrait?.assetId && current.portrait?.mimeType === receipt.input.portrait?.mimeType && current.portrait?.fileName === receipt.input.portrait?.fileName
    const sameReview = current.checks.voiceAuditioned === receipt.input.checks.voiceAuditioned && current.checks.portraitReviewed === receipt.input.checks.portraitReviewed && current.checks.identityReviewed === receipt.input.checks.identityReviewed
    if (sameVoice && samePortrait && sameReview && current.visualDirection.trim() === receipt.input.visualDirection.trim()) return 'applied'
  }
  return current.revision === receipt.expectedRevision ? 'not-applied' : 'changed'
}
