import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceSupabase = createSupabaseClient(supabaseUrl!, serviceRoleKey!)

    const channelId = request.nextUrl.searchParams.get('channelId')

    // 1. 유튜브 채널 전체 목록 조회
    const { data: allChannels, error: allChannelsError } = await serviceSupabase
      .from('youtube_channels')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (allChannelsError) throw new Error(`채널 목록 조회 실패: ${allChannelsError.message}`)

    // 2. 활성화할 채널 결정 (파라미터 일치 우선, 없으면 최신순 첫 번째)
    let channel = null
    if (allChannels && allChannels.length > 0) {
      if (channelId) {
        channel = allChannels.find(c => c.channel_id === channelId) || allChannels[0]
      } else {
        channel = allChannels[0]
      }
    }

    // 3. 활성화된 채널의 자동화 설정 조회
    let automation = null
    if (channel) {
      const { data: autoData, error: autoError } = await serviceSupabase
        .from('youtube_automations')
        .select('*')
        .eq('channel_id', channel.channel_id)
        .maybeSingle()

      if (autoError) throw new Error(`설정 조회 실패: ${autoError.message}`)
      automation = autoData
    }

    let logs = []

    // 4. 자동화 설정이 존재하면 로그 조회
    if (automation) {
      const { data: logsData, error: logsError } = await serviceSupabase
        .from('youtube_automation_logs')
        .select('*')
        .eq('automation_id', automation.id)
        .order('started_at', { ascending: false })
        .limit(10)
      
      if (logsError) throw new Error(`로그 조회 실패: ${logsError.message}`)
      logs = logsData || []
    }

    return NextResponse.json({
      success: true,
      channel,
      allChannels: allChannels || [],
      automation,
      logs
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '설정 로드 에러'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const payload = await request.json()
    const { 
      channelId, 
      audioPresetId, 
      targetRegion = 'KR',
      variationStrength = 'medium',
      uploadDays, 
      uploadTime, 
      longformActive, 
      shortsActive, 
      monetizationLinks,
      brandingMetadata,
      automationType = 'standard',
      channelBlueprintId
    } = payload

    if (!channelId || !audioPresetId || !uploadDays || !uploadTime) {
      return NextResponse.json({ error: '필수 설정값이 누락되었습니다.' }, { status: 400 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceSupabase = createSupabaseClient(supabaseUrl!, serviceRoleKey!)

    // 채널 소유권 확인
    const { data: channel } = await serviceSupabase
      .from('youtube_channels')
      .select('*')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!channel) {
      return NextResponse.json({ error: '유효하지 않은 유튜브 채널입니다.' }, { status: 403 })
    }

    if (channelBlueprintId) {
      const { data: ownedBlueprint, error: blueprintError } = await serviceSupabase
        .from('channel_blueprints')
        .select('id')
        .eq('id', channelBlueprintId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (blueprintError) throw new Error(`Channel DNA 확인 실패: ${blueprintError.message}`)
      if (!ownedBlueprint) {
        return NextResponse.json({ error: '연결할 수 없는 Channel DNA입니다.' }, { status: 403 })
      }
    }

    // youtube_automations 저장
    const { data: automation, error: dbError } = await serviceSupabase
      .from('youtube_automations')
      .upsert({
        user_id: user.id,
        channel_id: channelId,
        audio_preset_id: audioPresetId,
        target_region: targetRegion,
        variation_strength: variationStrength,
        video_preset_id: 'veo_31_penthouse_rain', // 기본 템플릿 고정
        upload_days: uploadDays,
        upload_time: uploadTime,
        longform_active: longformActive ?? true,
        shorts_active: shortsActive ?? false,
        monetization_links: monetizationLinks || [],
        branding_metadata: brandingMetadata || {},
        automation_type: automationType,
        ...(channelBlueprintId ? {
          channel_blueprint_id: channelBlueprintId,
          channel_episode_strategy: { enabled: true, mode: 'beta_simple' }
        } : {}),
        created_at: new Date().toISOString()
      }, {
        onConflict: 'channel_id'
      })
      .select()
      .single()

    if (dbError) {
      throw new Error(`자동화 저장 실패: ${dbError.message}`)
    }

    return NextResponse.json({ success: true, automation })
  } catch (error) {
    const message = error instanceof Error ? error.message : '설정 저장 에러'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const { channelId } = await request.json()

    if (!channelId) {
      return NextResponse.json({ error: 'channelId가 필요합니다.' }, { status: 400 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceSupabase = createSupabaseClient(supabaseUrl!, serviceRoleKey!)

    // 채널 연동 정보 삭제 (CASCADE 동작)
    const { error: dbError } = await serviceSupabase
      .from('youtube_channels')
      .delete()
      .eq('channel_id', channelId)
      .eq('user_id', user.id)

    if (dbError) {
      throw new Error(`연동 삭제 실패: ${dbError.message}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : '연동 삭제 에러'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
