import { NextResponse } from 'next/server'
import { parseGenerationBatchId, parseGenerationBatchSelection } from '@/lib/generation-batches/model'
import { generationBatchErrorResponse, getGenerationBatchTracklist, saveGenerationBatchSelection } from '@/lib/generation-batches/server'

export const dynamic = 'force-dynamic'
const privateHeaders = { 'Cache-Control': 'private, no-store' }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseGenerationBatchId((await params).id)
    const data = await getGenerationBatchTracklist(id)
    return NextResponse.json({ success: true, data }, { headers: privateHeaders })
  } catch (error) {
    const mapped = generationBatchErrorResponse(error)
    return NextResponse.json(mapped.payload, { status: mapped.status, headers: privateHeaders })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = parseGenerationBatchId((await params).id)
    const input = parseGenerationBatchSelection(await request.json())
    const data = await saveGenerationBatchSelection(id, input)
    return NextResponse.json({ success: true, data }, { headers: privateHeaders })
  } catch (error) {
    const mapped = generationBatchErrorResponse(error)
    return NextResponse.json(mapped.payload, { status: mapped.status, headers: privateHeaders })
  }
}
