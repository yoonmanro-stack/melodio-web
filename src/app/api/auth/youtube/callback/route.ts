import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const ENCRYPTION_KEY = (process.env.YOUTUBE_CLIENT_SECRET || 'fallback-secret-key-32-chars-long-!!').slice(0, 32).padEnd(32, '0')
const IV_LENGTH = 16

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin

  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !stateParam) {
    console.error('[YouTube Auth Callback] 파라미터 누락 혹은 OAuth 인증 에러:', { error, code, stateParam })
    return NextResponse.redirect(`${siteUrl}/autopilot?error=oauth_failed`)
  }

  let userId = ''
  let targetChannelId = ''
  try {
    const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString('utf8'))
    userId = decoded.userId
    targetChannelId = decoded.targetChannelId
  } catch (e) {
    // Backward compatibility for plain text user.id in state
    userId = stateParam
  }

  if (!userId) {
    console.error('[YouTube Auth Callback] 유효하지 않은 state 값입니다.')
    return NextResponse.redirect(`${siteUrl}/autopilot?error=invalid_state`)
  }

  try {
    const clientId = process.env.YOUTUBE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
    const redirectUri = `${siteUrl}/api/auth/youtube/callback`

    // 1. Authorization Code ➡️ Access/Refresh Token 교환
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      throw new Error(`구글 토큰 교환 실패: ${errText}`)
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token } = tokenData

    if (!refresh_token) {
      throw new Error('Refresh Token이 반환되지 않았습니다. 구글 계정 보안 설정에서 앱 권한을 끊고 다시 연동해 주십시오.')
    }

    // 2. 유튜브 채널 정보 조회
    const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    })

    if (!channelRes.ok) {
      const errText = await channelRes.text()
      throw new Error(`유튜브 채널 조회 API 실패: ${errText}`)
    }

    const channelData = await channelRes.json()
    const channelItem = channelData.items?.[0]

    if (!channelItem) {
      throw new Error('조회할 수 있는 유튜브 채널이 존재하지 않습니다.')
    }

    const channelId = channelItem.id
    const channelTitle = channelItem.snippet.title

    if (targetChannelId && channelId !== targetChannelId) {
      throw new Error(`선택된 유튜브 채널(${channelTitle})이 입력하신 대상 채널과 일치하지 않습니다. 구글 로그인 시 해당 채널을 올바르게 선택했는지 확인해 주십시오.`);
    }

    // 3. refresh_token 암호화
    const encryptedRefreshToken = encrypt(refresh_token)

    // 4. Supabase DB 저장 (서비스 롤 인증 우회 사용)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Supabase 서비스 환경변수 누락')
    }
    const serviceSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    const { error: dbError } = await serviceSupabase
      .from('youtube_channels')
      .upsert({
        user_id: userId,
        channel_id: channelId,
        channel_title: channelTitle,
        refresh_token: encryptedRefreshToken,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'channel_id'
      })

    if (dbError) {
      throw new Error(`유튜브 채널 DB 저장 실패: ${dbError.message}`)
    }

    // 5. 성공 시 오토파일럿 대시보드로 이동
    return NextResponse.redirect(`${siteUrl}/autopilot?success=true`)
  } catch (err) {
    console.error('[YouTube Auth Callback] 처리 중 예외 발생:', err)
    const errMsg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.redirect(
      `${siteUrl}/autopilot?error=${encodeURIComponent(errMsg)}`
    )
  }
}
