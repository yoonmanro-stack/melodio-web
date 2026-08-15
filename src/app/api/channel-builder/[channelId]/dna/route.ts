import { NextResponse } from 'next/server'
import { createDnaVersionCommand } from '@/lib/channel-system/channel-builder-commands'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const { channelId } = await params
    const created = await createDnaVersionCommand(channelId, await request.json())
    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
