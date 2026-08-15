import { NextResponse } from 'next/server'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'
import { parseUuid } from '@/lib/channel-system/channel-builder-input'
import { getEpisodeReviewService } from '@/lib/channel-system/episode-review-service'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; episodeId: string; trackId: string }> },
) {
  try {
    const { channelId, episodeId, trackId } = await params
    const service = await getEpisodeReviewService()
    const data = await service.regenerateTitle(
      parseUuid(channelId, 'channelId'),
      parseUuid(episodeId, 'episodeId'),
      parseUuid(trackId, 'trackId'),
    )
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
