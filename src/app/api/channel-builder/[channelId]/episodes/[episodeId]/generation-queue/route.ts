import { NextResponse } from 'next/server'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'
import { parseUuid } from '@/lib/channel-system/channel-builder-input'
import { getGenerationQueueService } from '@/lib/channel-system/generation-queue-service'

async function identifiers(params: Promise<{ channelId: string; episodeId: string }>) {
  const { channelId, episodeId } = await params
  return {
    channelId: parseUuid(channelId, 'channelId'),
    episodeId: parseUuid(episodeId, 'episodeId'),
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string; episodeId: string }> },
) {
  try {
    const ids = await identifiers(params)
    const service = await getGenerationQueueService()
    return NextResponse.json({ success: true, data: await service.getContext(ids.channelId, ids.episodeId) })
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
    const ids = await identifiers(params)
    const service = await getGenerationQueueService()
    return NextResponse.json({ success: true, data: await service.prepare(ids.channelId, ids.episodeId) })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
