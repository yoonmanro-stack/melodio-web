import { NextResponse } from 'next/server'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'
import { parseUuid } from '@/lib/channel-system/channel-builder-input'
import { getGenerationQueueService } from '@/lib/channel-system/generation-queue-service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string; episodeId: string; itemId: string }> },
) {
  try {
    const { candidateId } = await request.json() as { candidateId?: string }
    const { channelId, episodeId, itemId } = await params
    const service = await getGenerationQueueService()
    const data = await service.selectMaster(
      parseUuid(channelId, 'channelId'),
      parseUuid(episodeId, 'episodeId'),
      parseUuid(itemId, 'itemId'),
      parseUuid(candidateId || '', 'candidateId'),
    )
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
