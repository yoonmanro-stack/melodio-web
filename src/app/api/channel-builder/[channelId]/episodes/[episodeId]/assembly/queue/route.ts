import { NextResponse } from 'next/server'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'
import { parseUuid } from '@/lib/channel-system/channel-builder-input'
import { getEpisodeAssemblyService } from '@/lib/channel-system/episode-assembly-service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; episodeId: string }> },
) {
  try {
    const { channelId, episodeId } = await params
    const service = await getEpisodeAssemblyService()
    const data = await service.queue(
      parseUuid(channelId, 'channelId'),
      parseUuid(episodeId, 'episodeId'),
    )
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
