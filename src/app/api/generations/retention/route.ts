import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest) {
  try {
    const { id, action } = await request.json()

    if (typeof id !== 'string' || !['play', 'skip', 'complete'].includes(action)) {
      return NextResponse.json({ error: 'id와 action이 필요합니다' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('[API/retention] Supabase 환경 변수 누락')
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 })
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // 1. 기존 데이터 조회
    const { data: row, error: fetchError } = await serviceSupabase
      .from('generations')
      .select('play_count, retention_score')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !row) {
      console.error('[API/retention] SELECT 에러:', fetchError?.message)
      return NextResponse.json({ error: fetchError?.message || 'Row not found' }, { status: 404 })
    }

    let nextPlayCount = row.play_count || 0
    let nextRetentionScore = row.retention_score || 0

    // 2. 행동별 점수 계산
    if (action === 'play') {
      nextPlayCount += 1
    } else if (action === 'skip') {
      nextRetentionScore -= 15
    } else if (action === 'complete') {
      nextRetentionScore += 10
    }

    // 3. 업데이트 수행
    const { error: updateError } = await serviceSupabase
      .from('generations')
      .update({
        play_count: nextPlayCount,
        retention_score: nextRetentionScore
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[API/retention] UPDATE 에러:', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      play_count: nextPlayCount,
      retention_score: nextRetentionScore
    })
  } catch (err) {
    console.error('[API/retention] 예외 발생:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
