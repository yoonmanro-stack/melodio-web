import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    // 현재 세션의 user_id 파악
    let loggedInUserId: string | null = null
    try {
      const supabase = await createServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        loggedInUserId = user.id
      }
    } catch {
      // ignore
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('[API/generations] Supabase 환경 변수 누락')
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 })
    }

    // Service Role 클라이언트를 사용하여 RLS 정책 우회
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    if (id) {
      const { data, error } = await serviceSupabase
        .from('generations')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('[API/generations] SELECT 단건 에러:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // 소유자가 아니면 user_id, email, user_email 마스킹
      if (data && (!loggedInUserId || data.user_id !== loggedInUserId)) {
        delete data.user_id
        delete data.email
        delete data.user_email
      }

      // Sibling (서브 보컬 버전 2) 자동 검색
      let sibling = null
      try {
        const primaryTitle = data.title;
        if (primaryTitle && !primaryTitle.endsWith(' (2)')) {
          const siblingTitle = `${primaryTitle} (2)`
          const createdTime = new Date(data.created_at)
          const minTime = new Date(createdTime.getTime() - 3 * 60 * 1000).toISOString()
          const maxTime = new Date(createdTime.getTime() + 3 * 60 * 1000).toISOString()
          
          let query = serviceSupabase
            .from('generations')
            .select('*')
            .eq('title', siblingTitle)
            .gte('created_at', minTime)
            .lte('created_at', maxTime)

          // 기존 RLS 우회 데이터의 소유자 매핑 유지
          const checkUserId = data.user_id || loggedInUserId
          if (checkUserId) {
            query = query.eq('user_id', checkUserId)
          } else {
            query = query.is('user_id', null)
          }
          
          const { data: siblings } = await query.limit(1)
          if (siblings && siblings.length > 0) {
            sibling = siblings[0]
            if (sibling && (!loggedInUserId || sibling.user_id !== loggedInUserId)) {
              delete sibling.user_id
              delete sibling.email
              delete sibling.user_email
            }
          }
        }
      } catch (sibErr: any) {
        console.warn('[API/generations] Sibling search warning:', sibErr.message)
      }

      return NextResponse.json({ generation: data, sibling })
    }

    const { data, error } = await serviceSupabase
      .from('generations')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API/generations] SELECT 에러:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const filtered = (data || [])
      .filter(item => !item.title?.includes('VoiceDNA Demo'))
      .filter(item => {
        // 비공개(is_public === false 또는 metadata.isPublic === false 또는 license_hash.isPublic === false) 처리:
        // 본인(loggedInUserId === item.user_id)인 경우 본인 대시보드 조회를 위해 노출 허용.
        // 타인이나 비로그인 방문자에게는 비공개 음원 원천 노출 차단.
        let metaPublic = true
        if (item.license_hash) {
          try { metaPublic = JSON.parse(item.license_hash).isPublic !== false } catch {}
        }
        const isPrivate = item.is_public === false || item.metadata?.isPublic === false || !metaPublic;
        if (isPrivate) {
          return loggedInUserId && item.user_id === loggedInUserId;
        }
        return true;
      })
      .map(item => {
        if (!loggedInUserId || item.user_id !== loggedInUserId) {
          const { user_id, email, user_email, ...rest } = item
          return rest
        }
        return item
      })
    return NextResponse.json({ generations: filtered })
  } catch (err) {
    console.error('[API/generations] 예외 발생:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 })
    }

    // 1. 사용자 인증 확인
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('[API/generations] Supabase 환경 변수 누락')
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 })
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // 2. 음원 소유권 확인
    const { data: existing } = await serviceSupabase
      .from('generations')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: '권한이 없습니다 (소유자가 아님)' }, { status: 403 })
    }

    const { error } = await serviceSupabase
      .from('generations')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[API/generations] DELETE 에러:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API/generations] DELETE 예외 발생:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { id, is_liked, cover_art_url, is_public, video_url } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 })
    }

    // 1. 사용자 인증 확인
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('[API/generations] Supabase 환경 변수 누락')
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 })
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // 2. 음원 소유권 확인
    const { data: existing } = await serviceSupabase
      .from('generations')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: '권한이 없습니다 (소유자가 아님)' }, { status: 403 })
    }

    const updatePayload: any = {}
    if (is_liked !== undefined) updatePayload.is_liked = is_liked
    if (cover_art_url !== undefined) updatePayload.cover_art_url = cover_art_url

    if (is_public !== undefined || video_url !== undefined) {
      const { data: currentGen } = await serviceSupabase
        .from('generations')
        .select('license_hash')
        .eq('id', id)
        .single();
      
      let meta: any = {};
      if (currentGen?.license_hash) {
        try {
          meta = JSON.parse(currentGen.license_hash);
        } catch {
          // ignore
        }
      }
      if (is_public !== undefined) meta.isPublic = is_public;
      if (video_url !== undefined) meta.video_url = video_url;
      updatePayload.license_hash = JSON.stringify(meta);
    }

    const { error } = await serviceSupabase
      .from('generations')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      console.error('[API/generations] PATCH 에러:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API/generations] PATCH 예외 발생:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
