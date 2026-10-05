import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'
import { compileVoiceDesign } from '@/lib/voice/voice-design-prompt'
import {
  claimDesignedVoice, listDesignedVoices, readDesignedVoice, readDesignedVoiceForSample,
  safeDesignedVoice, updateDesignedVoice,
  type DesignedVoiceRecord, type DesignedVoiceSeed,
} from '@/lib/voice/designed-voice-repository'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type AdminClient = ReturnType<typeof createSupabaseClient<Database>>
type JsonObject = Record<string, unknown>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROVIDER_ID = /^[A-Za-z0-9_-]{6,160}$/
const ORIGIN = 'https://api.kie.ai'
const STALE_SUBMISSION_MS = 90_000

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}
function identifier(value: unknown): string | null {
  return typeof value === 'string' && PROVIDER_ID.test(value) ? value : null
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('invalid_request')
  return value.toLowerCase()
}
function sampleVersion(value: unknown): 'A' | 'B' {
  if (value !== 'A' && value !== 'B') throw new Error('invalid_request')
  return value
}
function adminClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('designed_voice_storage_unavailable')
  return createSupabaseClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
async function requireUser() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('authentication_required')
  return { id: uuid(user.id) }
}
function providerKey() {
  const key = process.env.KIE_API_KEY?.trim()
  if (!key) throw new Error('designed_voice_provider_unavailable')
  return key
}
function jsonError(error: unknown) {
  const code = error instanceof Error ? error.message : 'unknown_error'
  const errors: Record<string, [number, string]> = {
    authentication_required: [401, '로그인한 뒤 음색을 저장해 주세요.'],
    invalid_request: [400, '샘플과 음색 이름을 확인해 주세요. 이름은 1~80자까지 입력할 수 있습니다.'],
    not_found: [404, '이 계정의 음색 저장 작업 또는 샘플을 찾을 수 없습니다.'],
    invalid_sample: [409, '완료된 음색 디자인 샘플에서 저장해 주세요. 원본 가창 구간이 30초 이상이어야 합니다.'],
    invalid_designed_voice: [409, '저장된 음색 정보를 확인할 수 없습니다. 음색 ID와 함께 고객 지원에 문의해 주세요.'],
    designed_voice_conflict: [409, '음색 저장 상태가 변경되었습니다. 저장 상태를 다시 확인해 주세요.'],
    designed_voice_list_limit: [429, '저장된 음색이 너무 많습니다. 고객 지원에 문의해 주세요.'],
    designed_voice_storage_unavailable: [503, '음색 저장소에 연결하지 못했습니다. 같은 샘플을 다시 저장하지 말고 저장 상태를 확인해 주세요.'],
    designed_voice_provider_unavailable: [503, '음색 저장 서비스에 연결할 수 없습니다. 잠시 후 저장 상태를 확인해 주세요.'],
  }
  const known = errors[code]
  return NextResponse.json({ error: known?.[1] || '음색 저장 상태를 확인하지 못했습니다. 같은 샘플을 다시 저장하지 말고 상태를 확인해 주세요.', code: known ? code : 'designed_voice_unavailable' }, { status: known?.[0] || 503 })
}
function response(row: DesignedVoiceRecord, newlyCreated = false) {
  const message = row.status === 'ready'
    ? '음색을 저장했습니다. 이 음색 ID로 다음 곡에 적용할 수 있습니다.'
    : row.status === 'held'
      ? '음색 저장 요청이 보류되었습니다. 다시 저장하면 중복 처리될 수 있으므로 이 음색 ID로 고객 지원에 문의해 주세요.'
      : '음색 저장을 확인하고 있습니다. 잠시 후 저장 상태를 확인해 주세요.'
  return NextResponse.json({ voice: safeDesignedVoice(row), status: row.status, message }, {
    status: row.status === 'submitting' ? 202 : newlyCreated && row.status === 'ready' ? 201 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function seedFromGeneration(admin: AdminClient, userId: string, generationId: string, version: 'A' | 'B', name: string): Promise<DesignedVoiceSeed> {
  // generationId is the actual selected row, including the separate row for B.
  const { data: row, error } = await admin.from('generations').select('id,user_id,status,audio_url,license_hash')
    .eq('id', generationId).eq('user_id', userId).maybeSingle()
  if (error) throw new Error('designed_voice_storage_unavailable')
  if (!row || row.user_id !== userId || row.id !== generationId) throw new Error('not_found')
  if (row.status !== 'completed' || !row.audio_url || !row.license_hash || row.license_hash.length > 64 * 1024) throw new Error('invalid_sample')
  let meta: JsonObject
  try { meta = object(JSON.parse(row.license_hash)) } catch { throw new Error('invalid_sample') }
  if (meta.sourceMenu !== 'voice-discovery-design' || typeof meta.duration !== 'number'
    || !Number.isFinite(meta.duration) || meta.duration < 30 || meta.duration > 360) throw new Error('invalid_sample')
  let compiled
  try { compiled = compileVoiceDesign(meta.voiceDesign) } catch { throw new Error('invalid_sample') }
  if (compiled.designCode !== meta.voiceDesignCode || compiled.designCode !== object(meta.voiceDesign).designCode) throw new Error('invalid_sample')
  const persistence = object(meta.audioPersistence)
  const taskId = identifier(persistence.taskId)
  const selected = Array.isArray(persistence.clips)
    ? persistence.clips.map(object).find(clip => clip.clipKey === persistence.selectedClipKey) : undefined
  const audioId = identifier(selected?.clipId)
  if (persistence.provider !== 'kie' || persistence.status !== 'ready' || !taskId || !audioId
    || typeof persistence.generationId !== 'string' || !UUID.test(persistence.generationId)
    || version !== (persistence.generationId.toLowerCase() === generationId ? 'A' : 'B')
    || persistence.taskReference !== `suno:kie:${taskId}` || typeof persistence.selectedClipKey !== 'string'
    || selected?.status !== 'ready' || selected.audioUrl !== row.audio_url) throw new Error('invalid_sample')
  return {
    userId, name, profile: { gender: compiled.gender, age: compiled.age, language: compiled.language, traits: compiled.traits },
    gender: compiled.gender, language: compiled.language, voicePrompt: compiled.stylePrompt, designCode: compiled.designCode,
    sampleGenerationId: generationId, sampleVersion: version, durationSeconds: meta.duration,
    providerOriginalTaskId: taskId, providerAudioId: audioId,
  }
}

async function providerJson(response: Response) {
  if (!response.ok) throw new Error('provider_rejected')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('submission_unconfirmed')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 64 * 1024) throw new Error('submission_unconfirmed')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const result = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  if (Number(result.code) !== 200) throw new Error('provider_rejected')
  return object(result.data)
}
function personaId(data: JsonObject) {
  const direct = identifier(data.persona_id) || identifier(data.personaId)
  if (direct) return direct
  let output = object(data.resultJson ?? data.resultObject)
  if (typeof data.resultJson === 'string') {
    try { output = object(JSON.parse(data.resultJson)) } catch { return null }
  }
  const nested = object(output.resultObject)
  return identifier(output.persona_id) || identifier(output.personaId) || identifier(nested.persona_id) || identifier(nested.personaId)
}
async function submit(admin: AdminClient, row: DesignedVoiceRecord, apiKey: string) {
  let patch: Parameters<typeof updateDesignedVoice>[2]
  try {
    const result = await fetch(`${ORIGIN}/api/v1/jobs/createTask`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'ai-music-api/generate-persona', input: {
        task_id: row.providerOriginalTaskId, audio_id: row.providerAudioId, name: row.name,
        description: `Original designed singing voice ${row.designCode}`,
        vocal_start: 0, vocal_end: 30, style: row.voicePrompt.slice(0, 200),
      } }), signal: AbortSignal.timeout(30_000), cache: 'no-store',
    })
    const data = await providerJson(result)
    const id = personaId(data)
    const taskId = identifier(data.taskId) || identifier(data.task_id)
    patch = id ? { status: 'ready', providerPersonaId: id, providerTaskId: taskId, errorCode: null }
      : taskId ? { status: 'submitting', providerPersonaId: null, providerTaskId: taskId, errorCode: null }
        : { status: 'held', providerPersonaId: null, providerTaskId: null, errorCode: 'submission_unconfirmed' }
  } catch (error) {
    patch = { status: 'held', providerPersonaId: null, providerTaskId: null,
      errorCode: error instanceof Error && error.message === 'provider_rejected' ? 'provider_rejected' : 'submission_unconfirmed' }
  }
  // If this write is uncertain, the immutable intent still prevents re-submission.
  return updateDesignedVoice(admin, row, patch)
}
async function refresh(admin: AdminClient, row: DesignedVoiceRecord) {
  if (row.status !== 'submitting') return row
  if (!row.providerTaskId) {
    if (Date.now() - Date.parse(row.updatedAt) <= STALE_SUBMISSION_MS) return row
    return updateDesignedVoice(admin, row, { status: 'held', providerPersonaId: null, providerTaskId: null, errorCode: 'submission_unconfirmed' })
  }
  const key = providerKey()
  let data: JsonObject
  try {
    data = await providerJson(await fetch(`${ORIGIN}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(row.providerTaskId)}`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000), cache: 'no-store',
    }))
  } catch { throw new Error('designed_voice_provider_unavailable') }
  const returnedTaskId = identifier(data.taskId) || identifier(data.task_id)
  if (returnedTaskId && returnedTaskId !== row.providerTaskId) throw new Error('designed_voice_provider_unavailable')
  const state = String(data.state ?? data.status ?? '').toLowerCase()
  if (['fail', 'failed', 'error', 'create_task_failed', 'callback_exception'].includes(state)) {
    return updateDesignedVoice(admin, row, { status: 'held', providerPersonaId: null, providerTaskId: row.providerTaskId, errorCode: 'provider_failed' })
  }
  const id = personaId(data)
  if (id) return updateDesignedVoice(admin, row, { status: 'ready', providerPersonaId: id, providerTaskId: row.providerTaskId, errorCode: null })
  if (state === 'success') return updateDesignedVoice(admin, row, { status: 'held', providerPersonaId: null, providerTaskId: row.providerTaskId, errorCode: 'submission_unconfirmed' })
  return row
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()
    const bodyText = await request.text()
    if (bodyText.length > 4096) throw new Error('invalid_request')
    let body: JsonObject
    try { body = object(JSON.parse(bodyText)) } catch { throw new Error('invalid_request') }
    if (Object.keys(body).some(key => !['generationId', 'sampleVersion', 'name'].includes(key))) throw new Error('invalid_request')
    const generationId = uuid(body.generationId)
    const version = sampleVersion(body.sampleVersion)
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('invalid_request')
    const admin = adminClient()
    const existing = await readDesignedVoiceForSample(admin, user.id, generationId, version)
    if (existing) return response(existing)
    const seed = await seedFromGeneration(admin, user.id, generationId, version, name)
    const key = providerKey()
    const claim = await claimDesignedVoice(admin, seed)
    if (!claim.claimed) return response(claim.record)
    return response(await submit(admin, claim.record, key), true)
  } catch (error) { return jsonError(error) }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser()
    const admin = adminClient()
    const params = request.nextUrl.searchParams
    const id = params.get('id')
    const generationId = params.get('generationId')
    if (id && generationId) throw new Error('invalid_request')
    if (id || generationId) {
      const row = id ? await readDesignedVoice(admin, user.id, uuid(id))
        : await readDesignedVoiceForSample(admin, user.id, uuid(generationId), sampleVersion(params.get('sampleVersion')))
      if (!row) throw new Error('not_found')
      return response(await refresh(admin, row))
    }
    return NextResponse.json({ voices: (await listDesignedVoices(admin, user.id)).map(safeDesignedVoice) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return jsonError(error) }
}
