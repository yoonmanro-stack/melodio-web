import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const DEFAULT_COVER = 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xkhujzszvhnxzmxrmnzn.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const SHOWCASE_STATIC_MAP: Record<string, { title: string; cover: string }> = {
  'viral-omg': {
    title: '여친의 "화 안 났어" 번역기 (연애 행동학 밈)',
    cover: 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png',
  },
  'showcase-classical': {
    title: '안읽씹/읽씹 뇌절 방지송 (연애 심리학 밈)',
    cover: 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png',
  },
  'VD-1004': {
    title: '자존감 떡상 성공 확언송 (초긍정 부자 밈)',
    cover: 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png',
  },
  'VD-1001': {
    title: '도파민 충전 응원 챌린지송 (2)',
    cover: 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png',
  },
}

async function fetchImageAsBase64(url: string): Promise<string> {
  if (!url || !url.startsWith('http')) {
    return DEFAULT_COVER
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 500)

    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)

    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer()
      const contentType = res.headers.get('content-type') || 'image/jpeg'
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      return `data:${contentType};base64,${base64}`
    }
  } catch (err: any) {
    console.warn('[API/og] Cover fetch timeout or error, using DEFAULT_COVER:', err?.message)
  }
  return DEFAULT_COVER
}

function buildOgImageResponse(title: string, coverDataUri: string) {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#09090b',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 1. 어둡게 깔리는 백그라운드 앨범 아트 이미지 */}
        <img
          src={coverDataUri}
          alt="background-artwork"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.15,
          }}
        />

        {/* 2. 중앙에 배치된 프리미엄 글래스모피즘 플레이어 카드 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            backgroundColor: 'rgba(30, 30, 35, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '32px',
            padding: '24px',
            width: '380px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          }}
        >
          {/* 앨범 커버 이미지 */}
          <img
            src={coverDataUri}
            alt="cover"
            style={{
              width: '332px',
              height: '332px',
              borderRadius: '16px',
              objectFit: 'cover',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
            }}
          />

          {/* 곡 정보 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: '20px',
              width: '100%',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                color: '#ffffff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                width: '332px',
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: '14px',
                color: '#a1a1aa',
                marginTop: '4px',
                fontWeight: '600',
              }}
            >
              Melodio Creator
            </div>
          </div>

          {/* 프로그레스 바 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              marginTop: '16px',
            }}
          >
            <div
              style={{
                height: '4px',
                width: '100%',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                display: 'flex',
              }}
            >
              <div
                style={{
                  height: '4px',
                  width: '35%',
                  backgroundColor: '#d946ef',
                  borderRadius: '2px',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                marginTop: '6px',
              }}
            >
              <span style={{ fontSize: '10px', color: '#71717a', fontWeight: 'bold', fontFamily: 'monospace' }}>0:15</span>
              <span style={{ fontSize: '10px', color: '#71717a', fontWeight: 'bold', fontFamily: 'monospace' }}>0:45</span>
            </div>
          </div>

          {/* 플레이어 컨트롤러 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              marginTop: '16px',
              paddingLeft: '16px',
              paddingRight: '16px',
            }}
          >
            {/* Skip Back Icon */}
            <div style={{ display: 'flex', width: '20px', height: '20px', position: 'relative' }}>
              <div style={{ width: '0', height: '0', borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderRight: '10px solid #71717a', position: 'absolute', right: '0' }} />
              <div style={{ width: '0', height: '0', borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderRight: '10px solid #71717a', position: 'absolute', right: '8px' }} />
              <div style={{ width: '2px', height: '12px', backgroundColor: '#71717a', position: 'absolute', left: '0', top: '0' }} />
            </div>

            {/* Play Button */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '56px',
                height: '56px',
                borderRadius: '28px',
                backgroundColor: '#ffffff',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
            >
              <div
                style={{
                  width: '0',
                  height: '0',
                  borderTop: '7px solid transparent',
                  borderBottom: '7px solid transparent',
                  borderLeft: '12px solid #000000',
                  marginLeft: '4px',
                }}
              />
            </div>

            {/* Skip Forward Icon */}
            <div style={{ display: 'flex', width: '20px', height: '20px', position: 'relative' }}>
              <div style={{ width: '0', height: '0', borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #71717a', position: 'absolute', left: '0' }} />
              <div style={{ width: '0', height: '0', borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '10px solid #71717a', position: 'absolute', left: '8px' }} />
              <div style={{ width: '2px', height: '12px', backgroundColor: '#71717a', position: 'absolute', right: '0', top: '0' }} />
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  )
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id') || ''
    let title = searchParams.get('t') || searchParams.get('title') || ''
    let rawCover = searchParams.get('c') || searchParams.get('cover') || ''

    if (id && (!title || !rawCover)) {
      const cleanId = id.replace(/^share-/, '')
      if (SHOWCASE_STATIC_MAP[cleanId]) {
        title = title || SHOWCASE_STATIC_MAP[cleanId].title
        rawCover = rawCover || SHOWCASE_STATIC_MAP[cleanId].cover
      } else {
        try {
          const supabasePromise = supabase
            .from('generations')
            .select('title, cover_art_url')
            .eq('id', cleanId)
            .single()

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Supabase timeout')), 600)
          )

          const { data }: any = await Promise.race([supabasePromise, timeoutPromise])
          if (data) {
            title = title || data.title || 'Melodio AI Music'
            rawCover = rawCover || data.cover_art_url || ''
          }
        } catch {
          // Supabase timeout or error fallback
        }
      }
    }

    if (!title) title = 'Melodio AI Track'

    let coverUrl = DEFAULT_COVER
    if (rawCover && rawCover !== 'undefined' && rawCover !== 'null') {
      if (rawCover.startsWith('/')) {
        coverUrl = `https://melodio.app${rawCover}`
      } else if (rawCover.startsWith('http://') || rawCover.startsWith('https://')) {
        coverUrl = rawCover
      }
    }

    return buildOgImageResponse(title, coverUrl)
  } catch (fallbackErr: any) {
    console.error('[API/og] Ultimate fallback render:', fallbackErr?.message)
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b', color: '#ffffff', fontSize: '32px', fontWeight: 'bold' }}>
          Melodio AI Music
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }
}
