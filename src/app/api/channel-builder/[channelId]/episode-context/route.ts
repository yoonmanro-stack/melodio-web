import { NextResponse } from 'next/server'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'
import { parseUuid } from '@/lib/channel-system/channel-builder-input'
import { getEpisodeBlueprintService } from '@/lib/channel-system/episode-blueprint-service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const { channelId } = await params
    const service = await getEpisodeBlueprintService()
    const data = await service.getContext(parseUuid(channelId, 'channelId'))
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
