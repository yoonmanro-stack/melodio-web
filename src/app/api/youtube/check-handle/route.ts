import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const handle = searchParams.get('handle')
    if (!handle) {
      return NextResponse.json({ error: '핸들이 제공되지 않았습니다.' }, { status: 400 })
    }

    // 앞의 @ 제거 및 안전한 @포맷 확보
    let cleanHandle = handle.trim()
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = `@${cleanHandle}`
    }
    
    // 영문, 숫자, 마침표, 언더바, 대시만 허용
    const handleName = cleanHandle.substring(1)
    if (!/^[a-zA-Z0-9._-]+$/.test(handleName)) {
      return NextResponse.json({ 
        available: false, 
        error: '핸들에는 영문, 숫자, 마침표(.), 언더바(_), 하이픈(-)만 사용할 수 있습니다.' 
      })
    }

    const checkUrl = `https://www.youtube.com/${cleanHandle}`

    console.log(`[YouTubeHandleCheck] Checking: ${checkUrl}`)
    
    const response = await fetch(checkUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 0 } // 캐시 방지
    })

    // 404이면 미가입 상태이므로 등록 가능(available)
    if (response.status === 404) {
      return NextResponse.json({ available: true, handle: cleanHandle })
    }

    // 200 등 기타 응답이면 가입된 상태이므로 등록 불가능(taken)
    return NextResponse.json({ available: false, handle: cleanHandle })
  } catch (error) {
    console.error('핸들 조회 실패:', error)
    return NextResponse.json({ error: '핸들 상태 조회 중 오류 발생' }, { status: 500 })
  }
}
