import 'server-only'
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ARTIST_PORTRAIT_FILE_ERROR, MAX_ARTIST_PORTRAIT_TRANSFER_BYTES } from './portrait-policy'

const NO_STORE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const MAX_JSON_BYTES = 32 * 1024
const REQUEST_WINDOW_MS = 60_000
const requestWindows = new Map<string, { since: number; count: number }>()

export async function artistApiContext(): Promise<{ admin: SupabaseClient; userId: string }> {
  const session = await createClient()
  const { data: { user }, error } = await session.auth.getUser()
  if (error || !user) throw new Error('authentication_required')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('artist_storage_unavailable')
  const admin = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return { admin, userId: user.id }
}

/** Bound bursts per authenticated owner without retaining request contents. */
export function limitArtistRequests(userId: string, kind: 'read' | 'write' | 'portrait') {
  const now = Date.now()
  const key = `${userId}:${kind}`
  for (const [savedKey, value] of requestWindows) {
    if (now - value.since >= REQUEST_WINDOW_MS) requestWindows.delete(savedKey)
  }
  if (requestWindows.size >= 3000 && !requestWindows.has(key)) throw new Error('artist_rate_limited')
  const current = requestWindows.get(key) ?? { since: now, count: 0 }
  const limit = kind === 'portrait' ? 6 : kind === 'write' ? 30 : 120
  if (current.count >= limit) throw new Error('artist_rate_limited')
  requestWindows.set(key, { since: current.since, count: current.count + 1 })
}

async function boundedBody(request: Request, max: number): Promise<Uint8Array> {
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) throw new Error('artist_request_too_large')
  if (!request.body) throw new Error('invalid_request')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > max) {
        await reader.cancel()
        throw new Error('artist_request_too_large')
      }
      chunks.push(result.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export async function artistReadJson(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new Error('invalid_request')
  const bytes = await boundedBody(request, MAX_JSON_BYTES)
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_request')
    return value as Record<string, unknown>
  } catch { throw new Error('invalid_request') }
}

export async function artistReadPortraitForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get('content-type') || ''
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new Error('invalid_request')
  const bytes = await boundedBody(request, MAX_ARTIST_PORTRAIT_TRANSFER_BYTES + 64 * 1024)
  try { return await new Response(bytes as BodyInit, { headers: { 'Content-Type': contentType } }).formData() }
  catch { throw new Error('invalid_portrait_file') }
}

export function artistJsonResponse(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: NO_STORE })
}

export function artistJsonError(error: unknown) {
  const code = error instanceof Error ? error.message : 'unknown_error'
  const known: Record<string, { status: number; error: string }> = {
    authentication_required: { status: 401, error: '로그인이 필요합니다.' },
    invalid_request: { status: 400, error: '아티스트 입력 내용을 확인해 주세요.' },
    artist_request_too_large: { status: 413, error: '요청 크기가 저장 한도를 초과했습니다.' },
    invalid_portrait_file: { status: 400, error: ARTIST_PORTRAIT_FILE_ERROR },
    artist_portrait_dimensions: { status: 400, error: '가로·세로가 각각 512px 이상인 사진을 선택해 주세요. 1024px 이상의 선명한 사진을 권장합니다.' },
    artist_portrait_framing: { status: 400, error: '액자나 검은 띠가 없는 인물 사진을 선택해 주세요. 사진 자체가 곡 커버로 사용됩니다.' },
    artist_not_found: { status: 404, error: '아티스트를 찾을 수 없습니다.' },
    artist_portrait_not_found: { status: 404, error: '저장한 인물 이미지를 찾을 수 없습니다. 다시 업로드해 주세요.' },
    artist_voice_not_found: { status: 409, error: '연결한 목소리를 찾을 수 없습니다. 사용 가능한 목소리를 다시 선택해 주세요.' },
    artist_voice_not_ready: { status: 409, error: '아직 사용할 수 없는 목소리입니다. 준비된 목소리를 선택해 주세요.' },
    artist_not_ready: { status: 409, error: '목소리, 인물 이미지, 페르소나, 비주얼 방향과 검토 항목을 확인해 주세요.' },
    artist_conflict: { status: 409, error: '아티스트 정보가 변경되었습니다. 최신 정보를 불러온 뒤 다시 저장해 주세요.' },
    invalid_artist_record: { status: 409, error: '저장된 아티스트 정보의 무결성을 확인할 수 없습니다.' },
    too_many_artists: { status: 429, error: '활성 아티스트는 최대 30명까지 저장할 수 있습니다.' },
    too_many_artist_records: { status: 429, error: '보관 기록을 포함해 아티스트는 최대 100명까지 저장할 수 있습니다. 기존 가수를 계속 편집해 주세요.' },
    artist_rate_limited: { status: 429, error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' },
    artist_storage_unavailable: { status: 503, error: '아티스트 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' },
    artist_list_limit: { status: 503, error: '저장된 아티스트 목록의 한도를 초과했습니다.' },
    artist_chain_read_limit: { status: 503, error: '아티스트 변경 내역을 확인하는 데 시간이 필요합니다. 잠시 후 다시 시도해 주세요.' },
  }
  const value = known[code]
  if (value) return artistJsonResponse({ error: value.error, code }, value.status)
  console.error('[API/artists] request failed: unexpected_error')
  return artistJsonResponse({ error: '아티스트 작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 500)
}
