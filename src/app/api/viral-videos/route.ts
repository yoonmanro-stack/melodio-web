import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function readString(...values: unknown[]): string {
  const value = values.find((item) => typeof item === 'string' && item.trim().length > 0)
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return 0
}

const getCachedViralVideoRows = unstable_cache(
  async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase environment variables are missing')
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data, error } = await supabase
      .from('generations')
      .select('id,title,status,license_hash,created_at,cover_art_url')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(240)

    if (error) throw error

    return ((data || []) as Array<Record<string, unknown>>).flatMap((row) => {
      const metadata = parseMetadata(row.license_hash)
      const source = readString(metadata.sourceMenu).toLowerCase()
      const videoUrl = readString(metadata.video_url, metadata.grok_video_url, metadata.videoUrl)
      const isViral = metadata.viralMode === true || source === 'viral' || source === 'viral-cf'

      if (metadata.isPublic === false || !isViral || !videoUrl) return []

      return [{
        id: row.id,
        title: row.title,
        status: row.status,
        is_public: true,
        created_at: row.created_at,
        play_count: readNumber(metadata.play_count, metadata.viewCount, metadata.view_count),
        cover_art_url: row.cover_art_url,
        license_hash: JSON.stringify({
          sourceMenu: source,
          viralMode: true,
          video_url: videoUrl,
          presetId: metadata.presetId,
          tab_type: metadata.tab_type,
          genCategory: metadata.genCategory,
          genre: metadata.genre,
          styleName: metadata.styleName,
          brand_name: metadata.brand_name,
        }),
      }]
    })
  },
  ['viral-video-library-v1'],
  { revalidate: 30, tags: ['viral-video-library'] }
)

export async function GET() {
  try {
    const generations = await getCachedViralVideoRows()
    return NextResponse.json(
      { generations },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
        },
      }
    )
  } catch (error) {
    console.error('[api/viral-videos]', error)
    return NextResponse.json({ error: 'Failed to load viral videos' }, { status: 500 })
  }
}
