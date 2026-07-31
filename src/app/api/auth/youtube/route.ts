import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // 쿼리 파라미터 등에 로그인 체크를 위한 처리 혹은 리다이렉트
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const clientId = process.env.YOUTUBE_CLIENT_ID
    const requestUrl = new URL(request.url)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin
    const redirectUri = `${siteUrl}/api/auth/youtube/callback`

    if (!clientId) {
      return NextResponse.json({ error: 'YOUTUBE_CLIENT_ID 환경 변수가 설정되지 않았습니다.' }, { status: 500 })
    }

    const scope = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ].join(' ')

    const targetChannelId = request.nextUrl.searchParams.get('target_channel_id') || ''
    const statePayload = { userId: user.id, targetChannelId }
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url')

    const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
      state
    }).toString()

    return NextResponse.redirect(oauthUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth 리다이렉트 에러'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
