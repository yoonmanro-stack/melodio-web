import { NextResponse } from 'next/server'
import { saveChannelDraftCommand } from '@/lib/channel-system/channel-builder-commands'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'

export async function POST(request: Request) {
  try {
    const saved = await saveChannelDraftCommand(await request.json())
    return NextResponse.json({ success: true, data: saved }, { status: 201 })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
