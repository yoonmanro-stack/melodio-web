import { NextResponse } from 'next/server'
import { mapPlaylistError } from '@/lib/playlists/playlist-errors'
import { parseCreatePlaylist } from '@/lib/playlists/playlist-input'
import { getPlaylistService } from '@/lib/playlists/playlist-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const service = await getPlaylistService()
    const data = await service.listLibrary()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const mapped = mapPlaylistError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

export async function POST(request: Request) {
  try {
    const input = parseCreatePlaylist(await request.json())
    const service = await getPlaylistService()
    const data = await service.create(input)
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    const mapped = mapPlaylistError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
