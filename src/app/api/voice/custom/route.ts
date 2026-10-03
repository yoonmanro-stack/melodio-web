import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/types/database'
import { assertCustomVoiceAudioPath, assertTrustedCustomVoice, signedCustomVoiceLayers } from '@/lib/voice/custom-voice-integrity'
import { createCustomVoiceAudioLink } from '@/lib/voice/custom-voice-audio-link'
import { createCustomVoice, deleteCustomVoice, listCustomVoices, readCustomVoice, updateCustomVoice } from '@/lib/voice/custom-voice-repository'
import {
  assertCustomVoiceProviderConfigured,
  checkVoiceAvailability,
  customVoiceFailureCode,
  fetchCustomVoiceTask,
  startVoiceCreation,
  startVoiceValidation,
} from '@/lib/voice/custom-voice-provider'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'melodio-private'
const MAX_SOURCE_FILE_BYTES = 40 * 1024 * 1024
const MAX_VERIFICATION_FILE_BYTES = MAX_SOURCE_FILE_BYTES
const CONSENT_VERSION = 'custom-voice-v1-20260927'
const CONTENT_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
}

type AdminClient = ReturnType<typeof createSupabaseClient<Database>>
type VoiceDnaRow = Database['public']['Tables']['voice_dnas']['Row']
type VoiceStatus = 'draft' | 'validation_submitting' | 'validation_pending' | 'phrase_ready' | 'voice_submitting' | 'voice_pending' | 'availability_pending' | 'ready' | 'failed'
type RegistrationData = {
  description: string
  gender: 'female' | 'male'
  language: string
  singerSkillLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional'
  sourceType: 'recorded' | 'uploaded'
  status: VoiceStatus
  sourceObjectPath: string | null
  verificationObjectPath: string | null
  validationClaimId: string | null
  validationTaskId: string | null
  validationPhrase: string | null
  voiceTaskId: string | null
  providerVoiceId: string | null
  errorCode: string | null
  consentVersion: string
  consentedAt: string
  updatedAt: string
  readyAt: string | null
}

function adminClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('voice_storage_unavailable')
  return createSupabaseClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('authentication_required')
  return user
}

function objectValue(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function registration(row: VoiceDnaRow): RegistrationData {
  const layers = objectValue(row.physical_layers)
  const data = objectValue(layers.registration)
  const gender = layers.gender === 'male' ? 'male' : 'female'
  const skill = ['beginner', 'intermediate', 'advanced', 'professional'].includes(String(data.singerSkillLevel))
    ? String(data.singerSkillLevel) as RegistrationData['singerSkillLevel'] : 'intermediate'
  const status = ['draft', 'validation_submitting', 'validation_pending', 'phrase_ready', 'voice_submitting', 'voice_pending', 'availability_pending', 'ready', 'failed'].includes(String(data.status))
    ? String(data.status) as VoiceStatus : 'failed'
  const text = (key: string) => typeof data[key] === 'string' ? data[key] as string : null
  return {
    description: text('description') || '', gender,
    language: text('language') || 'ko', singerSkillLevel: skill,
    sourceType: data.sourceType === 'recorded' ? 'recorded' : 'uploaded', status,
    sourceObjectPath: text('sourceObjectPath'), verificationObjectPath: text('verificationObjectPath'),
    validationClaimId: text('validationClaimId'),
    validationTaskId: text('validationTaskId'), validationPhrase: text('validationPhrase'),
    voiceTaskId: text('voiceTaskId'), providerVoiceId: text('providerVoiceId'),
    errorCode: text('errorCode'), consentVersion: text('consentVersion') || CONSENT_VERSION,
    consentedAt: text('consentedAt') || row.created_at, updatedAt: text('updatedAt') || row.created_at,
    readyAt: text('readyAt'),
  }
}

function layersWith(row: VoiceDnaRow, patch: Partial<RegistrationData>): Json {
  const layers = objectValue(row.physical_layers)
  return signedCustomVoiceLayers(row, { ...layers, gender: registration(row).gender, registration: { ...registration(row), ...patch } } as Json)
}

function safeRow(row: VoiceDnaRow) {
  const data = registration(row)
  return {
    id: row.id, name: row.name, description: data.description, style: row.style || '',
    gender: data.gender, language: data.language, singerSkillLevel: data.singerSkillLevel,
    sourceType: data.sourceType, status: data.status,
    validationPhrase: data.validationPhrase || undefined, errorCode: data.errorCode || undefined,
    createdAt: row.created_at, readyAt: data.readyAt || undefined,
  }
}

function jsonError(error: unknown) {
  const providerFailure = customVoiceFailureCode(error)
  if (providerFailure) return NextResponse.json({ error: '목소리 검증 서비스 응답을 확인하지 못했습니다. 기존 등록 상태를 확인해 주세요.', code: providerFailure }, { status: 503 })
  const code = error instanceof Error ? error.message : 'unknown_error'
  if (code === 'authentication_required') return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  if (code === 'invalid_request') return NextResponse.json({ error: '요청 내용을 확인해 주세요.' }, { status: 400 })
  if (code === 'not_found') return NextResponse.json({ error: '목소리 등록 작업을 찾을 수 없습니다.' }, { status: 404 })
  if (code === 'invalid_voice_registration') return NextResponse.json({ error: '목소리 등록 정보의 무결성을 확인할 수 없습니다.' }, { status: 409 })
  if (code === 'registration_conflict') return NextResponse.json({ error: '목소리 등록 상태가 변경되었습니다. 상태를 다시 확인해 주세요.' }, { status: 409 })
  if (code === 'too_many_voices') return NextResponse.json({ error: '저장 가능한 등록 목소리는 최대 20개입니다.' }, { status: 429 })
  if (code === 'voice_provider_unavailable') return NextResponse.json({ error: '목소리 검증 서비스 설정을 확인할 수 없습니다. 잠시 후 다시 확인해 주세요.', code }, { status: 503 })
  if (code === 'voice_storage_unavailable') return NextResponse.json({ error: '목소리 등록 저장소에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요.', code }, { status: 503 })
  if (code === 'validation_submission_held') return NextResponse.json({ error: '검증 문구 요청이 보류되었습니다. 등록 상태를 확인해 주세요.', code }, { status: 409 })
  if (code === 'validation_submission_unconfirmed') return NextResponse.json({ error: '검증 문구 요청 결과를 확인할 수 없습니다. 같은 녹음을 다시 제출하지 말고 등록 상태를 확인해 주세요.', code }, { status: 503 })
  console.error('[API/custom-voice] request failed:', code)
  return NextResponse.json({ error: '목소리 등록 작업을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
}

function logSubmissionFailure(action: 'validation' | 'creation', stage: string, error: unknown) {
  const known = new Set(['voice_storage_unavailable', 'registration_conflict', 'provider_submission_held'])
  const providerCode = error instanceof Error && error.name === 'CustomVoiceProviderError'
    ? (error as Error & { providerCode?: unknown }).providerCode : null
  const category = error instanceof Error && known.has(error.message) ? error.message
    : error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name) ? 'timeout'
    : error instanceof Error && error.name === 'CustomVoiceProviderError'
      ? `provider_response_${Number.isSafeInteger(providerCode) && Number(providerCode) >= 0 && Number(providerCode) <= 999999 ? providerCode : 'invalid'}`
    : 'unexpected_error'
  // Never log a signed audio URL, provider response body, key, or raw error.
  console.error('[API/custom-voice] submission failed:', action, stage, category)
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function ownedRow(admin: AdminClient, userId: string, id: unknown): Promise<VoiceDnaRow> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('invalid_request')
  const data = await readCustomVoice(admin, userId, id)
  if (!data) throw new Error('not_found')
  assertTrustedCustomVoice(data)
  return data
}

async function updateRegistration(admin: AdminClient, row: VoiceDnaRow, patch: Partial<RegistrationData>) {
  assertTrustedCustomVoice(row)
  return updateCustomVoice(admin, row, {
    ...row, physical_layers: layersWith(row, { ...patch, updatedAt: new Date().toISOString() }),
  })
}

async function removeStoredAudio(admin: AdminClient, row: VoiceDnaRow) {
  assertTrustedCustomVoice(row)
  const data = registration(row)
  const paths = [
    data.sourceObjectPath && assertCustomVoiceAudioPath(row, data.sourceObjectPath, 'source'),
    data.verificationObjectPath && assertCustomVoiceAudioPath(row, data.verificationObjectPath, 'verification'),
  ].filter((path): path is string => !!path)
  if (paths.length) {
    const { error } = await admin.storage.from(BUCKET).remove(paths)
    if (error) {
      console.error('[API/custom-voice] private audio cleanup failed')
      return false
    }
  }
  return true
}

function signRead(row: VoiceDnaRow, path: string, kind: 'source' | 'verification') {
  assertTrustedCustomVoice(row)
  assertCustomVoiceAudioPath(row, path, kind)
  return createCustomVoiceAudioLink(row.user_id || '', row.id, kind)
}

async function claimProviderSubmission(admin: AdminClient, row: VoiceDnaRow, action: 'validation' | 'creation') {
  assertTrustedCustomVoice(row)
  // This additional immutable receipt guards provider acceptance across state
  // recovery. Never delete receipts when a registration is removed.
  const { error } = await admin.storage.from(BUCKET).upload(
    `voice-registration-state/${row.id}/${action}.json`,
    JSON.stringify({ registrationId: row.id, action, claimedAt: new Date().toISOString() }),
    { contentType: 'application/json', upsert: false },
  )
  if (error) throw new Error('provider_submission_held')
}

async function claimValidationState(admin: AdminClient, row: VoiceDnaRow): Promise<VoiceDnaRow> {
  const validationClaimId = randomUUID()
  try {
    return await updateRegistration(admin, row, { status: 'validation_submitting', validationClaimId, errorCode: null })
  } catch (error) {
    if (error instanceof Error && error.message === 'registration_conflict') throw error
    // A successful immutable write may have lost its HTTP response. This is
    // still before the provider receipt and can be recovered without replay.
    const latest = await readCustomVoice(admin, row.user_id || '', row.id).catch(() => null)
    if (latest && registration(latest).status === 'validation_submitting'
      && registration(latest).validationClaimId === validationClaimId) return latest
    throw error
  }
}

async function failValidationState(admin: AdminClient, row: VoiceDnaRow, errorCode: string): Promise<VoiceDnaRow> {
  try {
    return await updateRegistration(admin, row, { status: 'failed', errorCode })
  } catch (error) {
    const latest = await readCustomVoice(admin, row.user_id || '', row.id).catch(() => null)
    if (latest && registration(latest).status === 'failed' && registration(latest).errorCode === errorCode) return latest
    throw error
  }
}

async function saveValidationTask(admin: AdminClient, row: VoiceDnaRow, taskId: string): Promise<VoiceDnaRow> {
  const patch: Partial<RegistrationData> = { validationTaskId: taskId, status: 'validation_pending' }
  const isSaved = (candidate: VoiceDnaRow) => {
    const data = registration(candidate)
    return data.status === 'validation_pending' && data.validationTaskId === taskId
  }
  try {
    return await updateRegistration(admin, row, patch)
  } catch (error) {
    // An object upload can commit and then lose its response. Read the
    // authoritative chain before doing anything else; retry only this local
    // state write when it definitely has not committed.
    let latest = await readCustomVoice(admin, row.user_id || '', row.id).catch(() => null)
    if (latest && isSaved(latest)) return latest
    if (latest && registration(latest).status === 'validation_submitting') {
      try { return await updateRegistration(admin, latest, patch) } catch {
        latest = await readCustomVoice(admin, row.user_id || '', row.id).catch(() => null)
        if (latest && isSaved(latest)) return latest
      }
    }
    throw error
  }
}

export async function GET() {
  try {
    const user = await requireUser()
    const admin = adminClient()
    const rows = await listCustomVoices(admin, user.id)
    return NextResponse.json({ voices: rows.map(safeRow) })
  } catch (error) { return jsonError(error) }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()
    const admin = adminClient()
    const body = await request.json() as Record<string, unknown>
    const action = body.action

    if (action === 'prepare-source-upload') {
      if (body.consent !== true) throw new Error('invalid_request')
      const name = cleanText(body.name, 80)
      const description = cleanText(body.description, 300)
      const style = cleanText(body.style, 100)
      const gender = body.gender === 'male' ? 'male' : 'female'
      const language = ['ko', 'en', 'ja'].includes(String(body.language)) ? String(body.language) : 'ko'
      const singerSkillLevel = ['beginner', 'intermediate', 'advanced', 'professional'].includes(String(body.singerSkillLevel))
        ? String(body.singerSkillLevel) as RegistrationData['singerSkillLevel'] : 'intermediate'
      const sourceType = body.sourceType === 'recorded' ? 'recorded' : 'uploaded'
      const contentType = cleanText(body.contentType, 80)
      const fileSize = Number(body.fileSize)
      const extension = CONTENT_TYPES[contentType]
      if (!name || !extension || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_SOURCE_FILE_BYTES) throw new Error('invalid_request')
      if ((await listCustomVoices(admin, user.id)).length >= 20) throw new Error('too_many_voices')
      const id = randomUUID()
      const path = `uploads/${user.id}/voice/${id}/source.${extension}`
      const now = new Date().toISOString()
      const registrationData: RegistrationData = {
        description, gender, language, singerSkillLevel, sourceType, status: 'draft',
        sourceObjectPath: path, verificationObjectPath: null, validationClaimId: null, validationTaskId: null,
        validationPhrase: null, voiceTaskId: null, providerVoiceId: null, errorCode: null,
        consentVersion: CONSENT_VERSION, consentedAt: now, updatedAt: now, readyAt: null,
      }
      let newRow: VoiceDnaRow = {
        id, user_id: user.id, vd_code: `SV-${id.replaceAll('-', '').slice(0, 24)}`, name,
        style: style || 'Custom Vocal', physical_layers: { gender, registration: registrationData } as Json,
        textures: ['Suno Voice'], emotions: [], performance: {}, noise_entropy: 0, created_at: now,
      }
      newRow.physical_layers = signedCustomVoiceLayers(newRow, newRow.physical_layers)
      newRow = await createCustomVoice(admin, newRow)
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) {
        await deleteCustomVoice(admin, newRow)
        throw error || new Error('voice_storage_unavailable')
      }
      return NextResponse.json({ id, bucket: BUCKET, path, token: data.token, signedUrl: data.signedUrl })
    }

    if (action === 'start-validation') {
      let row = await ownedRow(admin, user.id, body.id)
      const data = registration(row)
      if (data.status !== 'draft' || !data.sourceObjectPath) throw new Error('invalid_request')
      let voiceUrl: string
      try {
        voiceUrl = signRead(row, data.sourceObjectPath, 'source')
      } catch (error) {
        logSubmissionFailure('validation', 'source_signing', error)
        throw error
      }
      try {
        assertCustomVoiceProviderConfigured()
      } catch (error) {
        logSubmissionFailure('validation', 'provider_configuration', error)
        throw new Error('voice_provider_unavailable')
      }
      try {
        row = await claimValidationState(admin, row)
      } catch (error) {
        logSubmissionFailure('validation', 'state_claim', error)
        throw error
      }
      try {
        await claimProviderSubmission(admin, row, 'validation')
      } catch (error) {
        // This request has not called Kie. A prior receipt or an uncertain
        // receipt upload still holds the registration against a paid replay.
        logSubmissionFailure('validation', 'receipt_claim', error)
        try { row = await failValidationState(admin, row, 'validation_submission_held') }
        catch (saveError) {
          logSubmissionFailure('validation', 'failure_state_save', saveError)
          throw new Error('validation_submission_held')
        }
        return NextResponse.json({ voice: safeRow(row) })
      }
      let taskId: string
      try {
        taskId = await startVoiceValidation({ voiceUrl,
          startSeconds: 0, endSeconds: Math.min(120, Math.max(6, Math.floor(Number(body.durationSeconds) || 30))), language: data.language })
      } catch (error) {
        // Distinguish explicit service responses while retaining the receipt;
        // transport uncertainty must never create an automatic replay path.
        logSubmissionFailure('validation', 'provider_request', error)
        try { row = await failValidationState(admin, row, customVoiceFailureCode(error) || 'validation_submission_unconfirmed') }
        catch (saveError) {
          logSubmissionFailure('validation', 'failure_state_save', saveError)
          throw new Error('validation_submission_unconfirmed')
        }
        return NextResponse.json({ voice: safeRow(row) })
      }
      try {
        row = await saveValidationTask(admin, row, taskId)
      } catch (error) {
        logSubmissionFailure('validation', 'task_state_save', error)
        // The task ID was returned, but no durable copy could be confirmed.
        // No provider request is repeated; a later status check can inspect
        // the submitting registration without creating another job.
        throw new Error('validation_submission_unconfirmed')
      }
      return NextResponse.json({ voice: safeRow(row) })
    }

    if (action === 'prepare-verification-upload') {
      let row = await ownedRow(admin, user.id, body.id)
      const current = registration(row)
      if (current.status !== 'phrase_ready') throw new Error('invalid_request')
      const contentType = cleanText(body.contentType, 80)
      const fileSize = Number(body.fileSize)
      const extension = CONTENT_TYPES[contentType]
      if (!extension || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_VERIFICATION_FILE_BYTES) throw new Error('invalid_request')
      const path = `uploads/${user.id}/voice/${row.id}/verification.${extension}`
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
      if (error || !data) throw error || new Error('voice_storage_unavailable')
      if (current.verificationObjectPath !== path) row = await updateRegistration(admin, row, { verificationObjectPath: path })
      return NextResponse.json({ id: row.id, bucket: BUCKET, path, token: data.token, signedUrl: data.signedUrl })
    }

    if (action === 'start-creation') {
      let row = await ownedRow(admin, user.id, body.id)
      const current = registration(row)
      if (current.status !== 'phrase_ready' || !current.validationTaskId || !current.verificationObjectPath) throw new Error('invalid_request')
      const verificationUrl = signRead(row, current.verificationObjectPath, 'verification')
      row = await updateRegistration(admin, row, { status: 'voice_submitting', errorCode: null })
      try {
        await claimProviderSubmission(admin, row, 'creation')
        const taskId = await startVoiceCreation({ validationTaskId: current.validationTaskId,
          verificationUrl, name: row.name, description: current.description || undefined,
          style: row.style || undefined, singerSkillLevel: current.singerSkillLevel })
        row = await updateRegistration(admin, row, { voiceTaskId: taskId, status: 'voice_pending' })
      } catch (error) {
        row = await updateRegistration(admin, row, { status: 'failed', errorCode: customVoiceFailureCode(error) || 'voice_submission_unconfirmed' })
      }
      return NextResponse.json({ voice: safeRow(row) })
    }

    if (action === 'poll') {
      let row = await ownedRow(admin, user.id, body.id)
      let current = registration(row)
      if (current.status === 'validation_pending' && current.validationTaskId) {
        const result = await fetchCustomVoiceTask(current.validationTaskId)
        if (result.state === 'failed') row = await updateRegistration(admin, row, { status: 'failed', errorCode: result.errorCode || 'validation_failed' })
        else if (result.validationPhrase) row = await updateRegistration(admin, row, { status: 'phrase_ready', validationPhrase: result.validationPhrase, errorCode: null })
        else if (['complete', 'unrecognized'].includes(result.state) && current.errorCode !== 'provider_result_unrecognized') {
          row = await updateRegistration(admin, row, { errorCode: 'provider_result_unrecognized' })
        }
      } else if (current.status === 'voice_pending' && current.voiceTaskId) {
        const result = await fetchCustomVoiceTask(current.voiceTaskId)
        if (result.state === 'failed') row = await updateRegistration(admin, row, { status: 'failed', errorCode: result.errorCode || 'voice_creation_failed' })
        else if (result.voiceId) {
          row = await updateRegistration(admin, row, { status: 'availability_pending', errorCode: null })
          try {
            const available = await checkVoiceAvailability(current.voiceTaskId)
            row = await updateRegistration(admin, row, available
              ? { providerVoiceId: result.voiceId, status: 'ready', readyAt: new Date().toISOString() }
              : { status: 'failed', errorCode: 'voice_unavailable' })
          } catch (error) {
            row = await updateRegistration(admin, row, { status: 'failed', errorCode: customVoiceFailureCode(error) || 'availability_check_unconfirmed' })
          }
        } else if (['complete', 'unrecognized'].includes(result.state) && current.errorCode !== 'provider_result_unrecognized') {
          row = await updateRegistration(admin, row, { errorCode: 'provider_result_unrecognized' })
        }
      }
      current = registration(row)
      if (['validation_submitting', 'voice_submitting', 'availability_pending'].includes(current.status)
        && Date.now() - Date.parse(current.updatedAt) > 120_000) {
        row = await updateRegistration(admin, row, { status: 'failed', errorCode: 'submission_unconfirmed' })
      }
      if (registration(row).status === 'ready' && (current.sourceObjectPath || current.verificationObjectPath)) {
        // Ready is durable before any source bytes are deleted. Failed cleanup
        // retains the paths so a later poll can retry the idempotent deletion.
        if (await removeStoredAudio(admin, row)) row = await updateRegistration(admin, row, { sourceObjectPath: null, verificationObjectPath: null })
      }
      current = registration(row)
      return NextResponse.json({ voice: safeRow(row), complete: ['phrase_ready', 'ready', 'failed'].includes(current.status) })
    }

    throw new Error('invalid_request')
  } catch (error) { return jsonError(error) }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser()
    const admin = adminClient()
    const body = await request.json() as Record<string, unknown>
    const row = await ownedRow(admin, user.id, body.id)
    if (['validation_submitting', 'validation_pending', 'voice_submitting', 'voice_pending', 'availability_pending'].includes(registration(row).status)) {
      throw new Error('registration_conflict')
    }
    await deleteCustomVoice(admin, row)
    await removeStoredAudio(admin, row)
    return NextResponse.json({ success: true })
  } catch (error) { return jsonError(error) }
}
