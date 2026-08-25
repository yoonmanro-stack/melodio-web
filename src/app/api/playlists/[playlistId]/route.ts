import { NextResponse } from 'next/server'
import { mapPlaylistError } from '@/lib/playlists/playlist-errors'
import { parsePlaylistUuid, parseUpdatePlaylist } from '@/lib/playlists/playlist-input'
import { getPlaylistService } from '@/lib/playlists/playlist-service'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ playlistId: string }> },
) {
  try {
    const { playlistId } = await params
    const validPlaylistId = parsePlaylistUuid(playlistId, 'playlistId')
    const input = parseUpdatePlaylist(await request.json())
    const service = await getPlaylistService()
    const data = await service.update(validPlaylistId, input)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const mapped = mapPlaylistError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ playlistId: string }> },
) {
  try {
    const { playlistId } = await params
    const validPlaylistId = parsePlaylistUuid(playlistId, 'playlistId')
    const service = await getPlaylistService()
    await service.delete(validPlaylistId)
    return NextResponse.json({ success: true })
  } catch (error) {
    const mapped = mapPlaylistError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
