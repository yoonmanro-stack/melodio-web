import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildPublicViralVideoRows } from '@/lib/video/publicViralVideos'

// Visibility changes and deleted generations must apply on the next read.
export const dynamic = 'force-dynamic'
const GENERATION_FIELDS = 'id,user_id,title,status,is_public,license_hash,created_at,cover_art_url'
const JOB_FIELDS = 'user_id,status,updated_at,track_id:state->audio->>trackId,video_url:state->>videoUrl,poster_url:state->shots->0->>keyframeUrl'
const PAGE_SIZE = 500

type Row = Record<string, unknown>
async function readPages(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1)
    if (error || !Array.isArray(data)) throw new Error('PUBLIC_VIDEO_READ_FAILED')
    rows.push(...data as Row[])
    if (data.length < PAGE_SIZE) return rows
  }
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('PUBLIC_VIDEO_CONFIGURATION')
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    // Prefilter viral metadata before pagination; unrelated music cannot evict videos.
    const [generations, jobs] = await Promise.all([
      readPages((from, to) => supabase.from('generations').select(GENERATION_FIELDS)
        .eq('status', 'completed').ilike('license_hash', '%viral%')
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)),
      readPages((from, to) => supabase.from('viral_pet_jobs').select(JOB_FIELDS)
        .eq('status', 'completed').order('updated_at', { ascending: false })
        .order('id', { ascending: false }).range(from, to)),
    ])
    const known = new Set(generations.map(row => row.id))
    const trackIds = [...new Set(jobs.map(job => job.track_id)
      .filter((id): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) && !known.has(id)))]
    // Existing audio rows are authoritative for ownership, deletion and publication.
    for (let offset = 0; offset < trackIds.length; offset += 100) {
      const { data, error } = await supabase.from('generations').select(GENERATION_FIELDS)
        .eq('status', 'completed').in('id', trackIds.slice(offset, offset + 100))
      if (error) throw new Error('PUBLIC_VIDEO_READ_FAILED')
      generations.push(...(data || []) as Row[])
    }
    return NextResponse.json({ generations: buildPublicViralVideoRows(generations, jobs) }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    console.error('[api/viral-videos] PUBLIC_VIDEO_READ_FAILED')
    return NextResponse.json({ error: 'Failed to load viral videos' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
}
