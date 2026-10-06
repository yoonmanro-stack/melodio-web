import { createClient } from '@supabase/supabase-js'
import {
  parsePresetSampleRequests, presetSampleCandidateFilter, selectPresetSample,
  type PresetSampleRequest, type PresetSampleResponse, type PresetSampleSourceMenu,
} from '@/lib/preset-samples'
import { canonicalPresetId } from '@/lib/preset-catalog'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const MAX_PAGES = 4
const MAX_CONCURRENT_LOOKUPS = 4
const FIELDS = 'id,title,status,is_public,is_stem_extracted,audio_url,source_audio_url,license_hash,created_at'
const HEADERS = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const sourceMenu = params.get('sourceMenu')
  const requests = parsePresetSampleRequests(params.get('presets'))
  if ((sourceMenu !== 'japan' && sourceMenu !== 'preset-studio') || !requests) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: HEADERS })
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'samples_unavailable' }, { status: 503, headers: HEADERS })
  }
  const result: PresetSampleResponse = { samples: {}, errors: {} }
  const groups = new Map<string, { request: PresetSampleRequest; ids: string[] }>()
  for (const item of requests) {
    result.samples[item.id] = null
    const key = `${canonicalPresetId(item.id)}:${item.isInstrumental}`
    const existing = groups.get(key)
    if (existing) existing.ids.push(item.id)
    else groups.set(key, { request: item, ids: [item.id] })
  }
  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const jobs = [...groups.values()]
    const signal = AbortSignal.timeout(15_000)
    let nextJob = 0
    async function worker() {
      while (nextJob < jobs.length) {
        const job = jobs[nextJob++]
        try {
          for (let page = 0; page < MAX_PAGES; page++) {
            const { data, error } = await supabase.from('generations').select(FIELDS)
              .eq('status', 'completed').eq('is_public', true)
              .or(presetSampleCandidateFilter(job.request.id, sourceMenu as PresetSampleSourceMenu))
              .order('created_at', { ascending: false }).order('id', { ascending: false })
              .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1).abortSignal(signal)
            if (error || !Array.isArray(data)) throw new Error('query_failed')
            const sample = selectPresetSample(data, job.request, sourceMenu as PresetSampleSourceMenu, supabaseUrl!)
            if (sample) {
              for (const id of job.ids) result.samples[id] = sample
              break
            }
            if (data.length < PAGE_SIZE) break
            if (page === MAX_PAGES - 1) for (const id of job.ids) result.errors[id] = 'scan_limit'
          }
        } catch {
          for (const id of job.ids) result.errors[id] = 'query_failed'
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_LOOKUPS, jobs.length) }, () => worker()))
    return Response.json(result, { headers: HEADERS })
  } catch {
    return Response.json({ error: 'samples_unavailable' }, { status: 503, headers: HEADERS })
  }
}
