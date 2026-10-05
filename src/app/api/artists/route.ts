import type { ArtistInput } from '@/lib/artists/types'
import { createArtist, listArtists } from '@/lib/artists/repository'
import { artistApiContext, artistJsonError, artistJsonResponse, artistReadJson, limitArtistRequests } from '@/lib/artists/api'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  try {
    const { admin, userId } = await artistApiContext()
    limitArtistRequests(userId, 'read')
    return artistJsonResponse({ artists: await listArtists(admin, userId) })
  } catch (error) { return artistJsonError(error) }
}

export async function POST(request: Request) {
  try {
    const { admin, userId } = await artistApiContext()
    limitArtistRequests(userId, 'write')
    const input = await artistReadJson(request)
    return artistJsonResponse({ artist: await createArtist(admin, userId, input as ArtistInput) }, 201)
  } catch (error) { return artistJsonError(error) }
}
