import { NextRequest } from 'next/server'
import { artistApiContext, artistJsonError, artistJsonResponse, limitArtistRequests } from '@/lib/artists/api'
import { readArtist } from '@/lib/artists/repository'
import { artistWorks } from '@/lib/artists/works'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const { admin, userId } = await artistApiContext()
    limitArtistRequests(userId, 'read')
    const artist = await readArtist(admin, userId, id)
    if (!artist) throw new Error('artist_not_found')
    const client = await createClient()
    // The generated metadata uses this exact canonical JSON field. Ownership is
    // constrained in SQL before any metadata is returned or interpreted.
    const { data, error } = await client.from('generations')
      .select('id,title,status,audio_url,cover_art_url,created_at,license_hash')
      .eq('user_id', userId).like('license_hash', `%"artistId":"${artist.id}"%`)
      .order('created_at', { ascending: false }).limit(51)
    if (error) throw new Error('artist_storage_unavailable')
    return artistJsonResponse({ works: artistWorks(data || [], artist.id), limit: 50, hasMore: (data?.length || 0) > 50 })
  } catch (error) { return artistJsonError(error) }
}
