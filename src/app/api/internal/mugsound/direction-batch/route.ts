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
}

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
        createdAt: row.created_at,
      }]
    } catch {
      return []
    }
  })
  return NextResponse.json({ success: true, data: { batchId: BATCH_ID, candidates } })
}
