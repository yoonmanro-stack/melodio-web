import { NextResponse } from 'next/server'
import { updateListenerIntentCommand } from '@/lib/channel-system/channel-builder-commands'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channelId: string; profileId: string }> },
) {
  try {
    const { channelId, profileId } = await params
    const updated = await updateListenerIntentCommand(
      channelId,
      profileId,
      await request.json(),
    )
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
