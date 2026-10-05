import type { ArtistInput } from '@/lib/artists/types'
import { archiveArtist, readArtist, updateArtist } from '@/lib/artists/repository'
import { artistApiContext, artistJsonError, artistJsonResponse, artistReadJson, limitArtistRequests } from '@/lib/artists/api'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60
type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Context) {
  try {
    const { admin, userId } = await artistApiContext()
    limitArtistRequests(userId, 'read')
    const { id } = await context.params
    const artist = await readArtist(admin, userId, id)
    if (!artist) throw new Error('artist_not_found')
    return artistJsonResponse({ artist })
  } catch (error) { return artistJsonError(error) }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { admin, userId } = await artistApiContext()
    limitArtistRequests(userId, 'write')
    const { id } = await context.params
    const input = await artistReadJson(request)
    return artistJsonResponse({ artist: await updateArtist(admin, userId, id, input.expectedRevision as number, input as ArtistInput) })
  } catch (error) { return artistJsonError(error) }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { admin, userId } = await artistApiContext()
    limitArtistRequests(userId, 'write')
    const { id } = await context.params
    const input = await artistReadJson(request)
    return artistJsonResponse({ artist: await archiveArtist(admin, userId, id, input.expectedRevision as number) })
  } catch (error) { return artistJsonError(error) }
}
