import { NextResponse } from 'next/server'
import {
  listChannelSummariesCommand,
  saveChannelDraftCommand,
} from '@/lib/channel-system/channel-builder-commands'
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

export async function GET() {
  try {
    const channels = await listChannelSummariesCommand()
    return NextResponse.json({ success: true, data: channels })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
