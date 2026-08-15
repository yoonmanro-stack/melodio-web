import { NextResponse } from 'next/server'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'
import { parseUuid } from '@/lib/channel-system/channel-builder-input'
import { parseEpisodeBlueprintInput } from '@/lib/channel-system/episode-blueprint-input'
import { getEpisodeBlueprintService } from '@/lib/channel-system/episode-blueprint-service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const { channelId } = await params
    const validChannelId = parseUuid(channelId, 'channelId')
    const input = parseEpisodeBlueprintInput(await request.json())
    const service = await getEpisodeBlueprintService()
    const data = await service.save(validChannelId, input)
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
