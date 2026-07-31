import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const { prompt } = await request.json()

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: '비주얼 프롬프트를 입력해 주세요.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('video_assets')
      .insert({
        user_id: user.id,
        prompt: prompt.trim(),
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('[API/studio/veo] Insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, asset: data })
  } catch (err: any) {
    console.error('[API/studio/veo] POST Exception:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id 파라미터가 필요합니다.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('video_assets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('[API/studio/veo] GET Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, asset: data })
  } catch (err: any) {
    console.error('[API/studio/veo] GET Exception:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
