import 'server-only'
import { signArtistIdentity as sign } from '../../../worker/artist-identity'
import type { ArtistGenerationSnapshot } from './types'

export function signArtistIdentity(snapshot: ArtistGenerationSnapshot, userId: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('artist_storage_unavailable')
  return sign(snapshot, userId, secret)
}
