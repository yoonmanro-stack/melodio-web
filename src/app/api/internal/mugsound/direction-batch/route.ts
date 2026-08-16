import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMugSoundAccess } from '@/lib/mugsound/access'

const BATCH_ID = 'mugsound-direction-20260816-v1'

interface SupplyMetadata {
  mugsoundBatchId?: string
  mugsoundBlueprintId?: string
  mugsoundEpisodeId?: string
  mugsoundPhase?: string
  mugsoundTargetEnergy?: number
  mugsoundTargetWarmth?: number
  mugsoundBridgeDirection?: string | null
  duration?: number
  mugsoundReview?: {
    verdict: 'pass' | 'review' | 'reject'
    notes: string
    isPreferred: boolean
    reviewedAt: string
    reviewedBy: string
  }
}

const verdicts = new Set(['pass', 'review', 'reject'])

export async function GET() {
  const access = await getMugSoundAccess()
  if (!access) return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })

  const client = await createClient()
  const { data, error } = await client.from('generations')
    .select('id,title,status,audio_url,audio_grade,clipping_count,dissonance_score,license_hash,created_at')
    .eq('user_id', access.userId)
    .like('license_hash', `%\"mugsoundBatchId\":\"${BATCH_ID}\"%`)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const candidates = (data || []).flatMap((row) => {
    try {
      const metadata = JSON.parse(row.license_hash || '{}') as SupplyMetadata
      return [{
        id: row.id,
        blueprintId: metadata.mugsoundBlueprintId || '',
        episodeId: metadata.mugsoundEpisodeId || '',
        phase: metadata.mugsoundPhase || '',
        title: row.title,
        status: row.status,
        audioUrl: row.audio_url,
        audioGrade: row.audio_grade,
        clippingCount: row.clipping_count,
        dissonanceScore: row.dissonance_score,
        durationSeconds: metadata.duration || null,
        review: metadata.mugsoundReview || null,
        createdAt: row.created_at,
      }]
    } catch {
      return []
    }
  })
  return NextResponse.json({ success: true, data: { batchId: BATCH_ID, candidates } })
}

export async function PATCH(request: Request) {
  const access = await getMugSoundAccess()
  if (!access || !access.roles.some((role) => role === 'qa' || role === 'approver')) {
    return NextResponse.json({ error: '검수 권한이 없습니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as {
    candidateId?: unknown
    verdict?: unknown
    notes?: unknown
    isPreferred?: unknown
  } | null
  if (!body || typeof body.candidateId !== 'string' || !verdicts.has(String(body.verdict))) {
    return NextResponse.json({ error: '올바른 후보와 판정을 선택해 주세요.' }, { status: 400 })
  }
  if (typeof body.notes !== 'string' || body.notes.length > 1000 || typeof body.isPreferred !== 'boolean') {
    return NextResponse.json({ error: '검수 메모 또는 대표 후보 값이 올바르지 않습니다.' }, { status: 400 })
  }
  if (body.isPreferred && body.verdict !== 'pass') {
    return NextResponse.json({ error: 'Pass 후보만 대표로 선택할 수 있습니다.' }, { status: 400 })
  }

  const client = await createClient()
  const { data: target, error: targetError } = await client.from('generations')
    .select('id,license_hash')
    .eq('id', body.candidateId)
    .eq('user_id', access.userId)
    .single()
  if (targetError || !target) return NextResponse.json({ error: '후보를 찾을 수 없습니다.' }, { status: 404 })

  let targetMetadata: SupplyMetadata
  try {
    targetMetadata = JSON.parse(target.license_hash || '{}') as SupplyMetadata
  } catch {
    return NextResponse.json({ error: '후보 메타데이터가 손상되었습니다.' }, { status: 409 })
  }
  if (targetMetadata.mugsoundBatchId !== BATCH_ID || !targetMetadata.mugsoundBlueprintId) {
    return NextResponse.json({ error: 'MugSound 방향성 후보가 아닙니다.' }, { status: 400 })
  }

  if (body.isPreferred) {
    const { data: siblings, error: siblingsError } = await client.from('generations')
      .select('id,license_hash')
      .eq('user_id', access.userId)
      .like('license_hash', `%\"mugsoundBatchId\":\"${BATCH_ID}\"%`)
      .like('license_hash', `%\"mugsoundBlueprintId\":\"${targetMetadata.mugsoundBlueprintId}\"%`)
    if (siblingsError) return NextResponse.json({ error: siblingsError.message }, { status: 500 })

    const resets = (siblings || []).filter((row) => row.id !== target.id).flatMap((row) => {
      try {
        const metadata = JSON.parse(row.license_hash || '{}') as SupplyMetadata
        if (!metadata.mugsoundReview?.isPreferred) return []
        return [client.from('generations').update({
          license_hash: JSON.stringify({
            ...metadata,
            mugsoundReview: { ...metadata.mugsoundReview, isPreferred: false },
          }),
        }).eq('id', row.id).eq('user_id', access.userId)]
      } catch {
        return []
      }
    })
    const resetResults = await Promise.all(resets)
    const resetError = resetResults.find((result) => result.error)?.error
    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 })
  }

  const review = {
    verdict: body.verdict as 'pass' | 'review' | 'reject',
    notes: body.notes.trim(),
    isPreferred: body.isPreferred,
    reviewedAt: new Date().toISOString(),
    reviewedBy: access.userId,
  }
  const { error: updateError } = await client.from('generations')
    .update({ license_hash: JSON.stringify({ ...targetMetadata, mugsoundReview: review }) })
    .eq('id', target.id)
    .eq('user_id', access.userId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, data: { candidateId: target.id, review } })
}
