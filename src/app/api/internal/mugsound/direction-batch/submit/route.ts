import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getMugSoundAccess } from '@/lib/mugsound/access'
import { MUGSOUND_DIRECTION_BATCH_IDS, MUGSOUND_DIRECTION_BATCH_ID, MUGSOUND_PLAYLIST_TARGET_SECONDS } from '@/lib/mugsound/direction-batch'
import { MUGSOUND_DIRECTION_APPROVAL_BLUEPRINTS } from '@/data/mugsound-direction-approval-blueprints'

export async function POST(request: Request) {
  const access = await getMugSoundAccess()
  if (!access || !access.roles.some((role) => role === 'producer' || role === 'approver')) {
    return NextResponse.json({ error: 'MugSound 제작 권한이 필요합니다.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as {
    batchId?: unknown
    blueprintId?: unknown
    mode?: unknown
    lyrics?: unknown
  } | null
  const batchId = typeof body?.batchId === 'string' ? body.batchId : ''
  const blueprintId = typeof body?.blueprintId === 'string' ? body.blueprintId : ''
  const mode = body?.mode === 'lyrics' ? 'lyrics' : 'instrumental'
  const lyrics = typeof body?.lyrics === 'string' ? body.lyrics.trim() : ''
  if (batchId !== MUGSOUND_DIRECTION_BATCH_ID || !MUGSOUND_DIRECTION_BATCH_IDS.some((allowed) => allowed === batchId)) {
    return NextResponse.json({ error: '현재 MugSound Batch가 아닙니다.' }, { status: 400 })
  }
  const blueprint = MUGSOUND_DIRECTION_APPROVAL_BLUEPRINTS.find((item) => item.blueprintId === blueprintId)
  if (!blueprint) return NextResponse.json({ error: 'Blueprint를 찾을 수 없습니다.' }, { status: 400 })
  if (mode === 'lyrics' && !lyrics) return NextResponse.json({ error: '가사곡은 확정 가사가 필요합니다.' }, { status: 400 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: '서버 설정이 누락되었습니다.' }, { status: 500 })
  const client = createSupabaseClient(supabaseUrl, serviceRoleKey)
  const { data: existing } = await client.from('generations').select('id,status')
    .eq('user_id', access.userId)
    .like('license_hash', `%\"mugsoundBatchId\":\"${batchId}\"%`)
    .like('license_hash', `%\"mugsoundBlueprintId\":\"${blueprintId}\"%`)
    .neq('status', 'failed').limit(1)
  if (existing?.length) return NextResponse.json({ error: '이미 제출된 MugSound Blueprint입니다.' }, { status: 409 })

  const metadata = {
    stylePrompt: blueprint.stylePrompt,
    lyricsPrompt: mode === 'lyrics' ? lyrics : '',
    excludePrompt: blueprint.excludePrompt,
    engine: 'suno_v5',
    isInstrumental: mode === 'instrumental',
    sunoVersion: 'v5.5',
    genre: 'warm minimal cafe',
    subGenre: blueprint.phase,
    bpm: String(blueprint.targetBpm),
    mood: blueprint.episodeId,
    durationSeconds: MUGSOUND_PLAYLIST_TARGET_SECONDS,
    sourceMenu: 'mugsound-supply',
    isPublic: false,
    mugsoundBatchId: batchId,
    mugsoundBlueprintId: blueprint.blueprintId,
    mugsoundEpisodeId: blueprint.episodeId,
    mugsoundPhase: blueprint.phase,
    mugsoundTargetEnergy: blueprint.targetEnergy,
    mugsoundTargetWarmth: blueprint.targetWarmth,
    mugsoundBridgeDirection: blueprint.bridgeDirection || null,
    mugsoundVocalType: mode,
  }
  const { data, error } = await client.from('generations').insert({
    user_id: access.userId,
    title: blueprint.workingTitle,
    status: 'pending',
    duration_mode: 'clip',
    license_hash: JSON.stringify(metadata),
    is_stem_extracted: false,
  }).select('id,status').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
