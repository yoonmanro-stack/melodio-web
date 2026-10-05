import { readArtistPortrait, storeArtistPortrait } from '@/lib/artists/repository'
import { artistApiContext, artistJsonError, artistJsonResponse, artistReadPortraitForm, limitArtistRequests } from '@/lib/artists/api'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { admin, userId } = await artistApiContext()
    limitArtistRequests(userId, 'portrait')
    const form = await artistReadPortraitForm(request)
    const file = form.get('file')
    if (!file || typeof file === 'string' || form.getAll('file').length !== 1) throw new Error('invalid_portrait_file')
    return artistJsonResponse({ portrait: await storeArtistPortrait(admin, userId, file) }, 201)
  } catch (error) { return artistJsonError(error) }
}

export async function GET(request: Request) {
  try {
    const { admin, userId } = await artistApiContext()
    limitArtistRequests(userId, 'read')
    const assetId = new URL(request.url).searchParams.get('assetId')
    if (!assetId) throw new Error('invalid_request')
    const result = await readArtistPortrait(admin, userId, assetId)
    if (!result) throw new Error('artist_portrait_not_found')
    return new Response(result.bytes as BodyInit, { headers: {
      'Content-Type': result.portrait.mimeType,
      'Content-Length': String(result.bytes.byteLength),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(result.portrait.fileName)}`,
      'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    } })
  } catch (error) { return artistJsonError(error) }
}
