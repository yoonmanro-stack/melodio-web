import { NextResponse } from 'next/server'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'
import { parseUuid } from '@/lib/channel-system/channel-builder-input'
import { getEpisodeAssemblyService } from '@/lib/channel-system/episode-assembly-service'

async function ids(params: Promise<{ channelId: string; episodeId: string }>) {
  const value = await params
  return {
    channelId: parseUuid(value.channelId, 'channelId'),
    episodeId: parseUuid(value.episodeId, 'episodeId'),
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; episodeId: string }> },
) {
  try {
    const value = await ids(params)
    const service = await getEpisodeAssemblyService()
    return NextResponse.json({ success: true, data: await service.getContext(value.channelId, value.episodeId) })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; episodeId: string }> },
) {
  try {
    const value = await ids(params)
    const service = await getEpisodeAssemblyService()
    return NextResponse.json({ success: true, data: await service.create(value.channelId, value.episodeId) })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
