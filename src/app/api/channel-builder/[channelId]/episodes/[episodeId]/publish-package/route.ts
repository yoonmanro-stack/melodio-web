import { NextResponse } from 'next/server'
import { mapChannelBuilderError } from '@/lib/channel-system/channel-builder-errors'
import { parseUuid } from '@/lib/channel-system/channel-builder-input'
import { getPublishPackageService } from '@/lib/channel-system/publish-package-service'

async function ids(params: Promise<{ channelId: string; episodeId: string }>) {
  const value = await params
  return { channelId: parseUuid(value.channelId, 'channelId'), episodeId: parseUuid(value.episodeId, 'episodeId') }
}

export async function GET(_request: Request, { params }: { params: Promise<{ channelId: string; episodeId: string }> }) {
  try {
    const value = await ids(params)
    const service = await getPublishPackageService()
    return NextResponse.json({ success: true, data: await service.getContext(value.channelId, value.episodeId) })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ channelId: string; episodeId: string }> }) {
  try {
    const value = await ids(params)
    const service = await getPublishPackageService()
    return NextResponse.json({ success: true, data: await service.create(value.channelId, value.episodeId) })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ channelId: string; episodeId: string }> }) {
  try {
    const value = await ids(params)
    const body = await request.json() as Record<string, unknown>
    const string = (key: string, max: number) => typeof body[key] === 'string' ? String(body[key]).trim().slice(0, max) : ''
    const list = (key: string, max: number) => Array.isArray(body[key])
      ? body[key].filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, max)
      : []
    const service = await getPublishPackageService()
    const data = await service.update(value.channelId, value.episodeId, {
      uploadTitle: string('uploadTitle', 200), description: string('description', 20_000),
      coverPrompt: string('coverPrompt', 2000), tags: list('tags', 30), hashtags: list('hashtags', 15),
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const mapped = mapChannelBuilderError(error)
    return NextResponse.json(mapped.payload, { status: mapped.status })
  }
}
