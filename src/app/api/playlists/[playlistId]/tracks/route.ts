import { NextResponse } from 'next/server'
import { mapPlaylistError } from '@/lib/playlists/playlist-errors'
import {
  parseAddPlaylistTrack,
  parsePlaylistUuid,
  parseRemovePlaylistTrack,
  parseReorderPlaylistTracks,
} from '@/lib/playlists/playlist-input'
import { getPlaylistService } from '@/lib/playlists/playlist-service'

export const dynamic = 'force-dynamic'

async function playlistIdFrom(params: Promise<{ playlistId: string }>) {
  const { playlistId } = await params
  return parsePlaylistUuid(playlistId, 'playlistId')
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ playlistId: string }> },
) {
  try {
    const playlistId = await playlistIdFrom(params)
    const { generationId } = parseAddPlaylistTrack(await request.json())
    const service = await getPlaylistService()
    const data = await service.addTrack(playlistId, generationId)
    return NextResponse.json({ success: true, data }, { status: data.added ? 201 : 200 })
  } catch (error) {
    const mapped = mapPlaylistError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ playlistId: string }> },
) {
  try {
    const playlistId = await playlistIdFrom(params)
    const { itemIds, expectedUpdatedAt } = parseReorderPlaylistTracks(await request.json())
    const service = await getPlaylistService()
    const data = await service.reorderTracks(playlistId, itemIds, expectedUpdatedAt)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const mapped = mapPlaylistError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ playlistId: string }> },
) {
  try {
    const playlistId = await playlistIdFrom(params)
    const { itemId } = parseRemovePlaylistTrack(await request.json())
    const service = await getPlaylistService()
    const data = await service.removeTrack(playlistId, itemId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const mapped = mapPlaylistError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
