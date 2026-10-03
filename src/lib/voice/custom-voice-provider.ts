const KIE_API_ORIGIN = 'https://api.kie.ai'

type JsonObject = Record<string, unknown>

type ProviderFailureCode = 'provider_auth_error' | 'provider_billing_error' | 'provider_internal_error' | 'provider_result_unrecognized'

export type CustomVoiceTaskResult = {
  state: 'processing' | 'failed' | 'complete' | 'unrecognized'
  errorCode?: ProviderFailureCode
  validationPhrase?: string
  voiceId?: string
  isAvailable?: boolean
}

function providerFailureCode(code: unknown): ProviderFailureCode | undefined {
  const numeric = Number(code)
  if (numeric === 401 || numeric === 403) return 'provider_auth_error'
  if (numeric === 402) return 'provider_billing_error'
  if (numeric >= 500 && numeric <= 599) return 'provider_internal_error'
  return undefined
}

// Persist only this bounded category, never a provider message or response body.
export function customVoiceFailureCode(error: unknown): ProviderFailureCode | undefined {
  if (!(error instanceof Error) || error.name !== 'CustomVoiceProviderError') return undefined
  const code = (error as Error & { providerCode?: unknown }).providerCode
  return code === 0 ? 'provider_result_unrecognized' : providerFailureCode(code)
}

class CustomVoiceProviderError extends Error {
  readonly providerCode: number | null

  constructor(operation: string, code: unknown) {
    const numeric = Number(code)
    const providerCode = Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 999999 ? numeric : null
    super(`목소리 ${operation} 요청에 실패했습니다. (code: ${providerCode ?? 'invalid_response'})`)
    this.name = 'CustomVoiceProviderError'
    this.providerCode = providerCode
  }
}

function providerConfig() {
  const apiKey = String(process.env.KIE_API_KEY || '').trim()
  if (!apiKey) throw new Error('Kie 목소리 등록 설정이 없습니다.')
  const configured = String(process.env.KIE_API_URL || KIE_API_ORIGIN).trim()
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error('Kie API 주소 설정이 올바르지 않습니다.')
  }
  if (url.origin !== KIE_API_ORIGIN || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Kie 공식 API 주소만 사용할 수 있습니다.')
  }
  return { apiKey, origin: KIE_API_ORIGIN }
}

// Check local configuration before a submission receipt is claimed. A failed
// check cannot have reached Kie and must not be reported as an uncertain job.
export function assertCustomVoiceProviderConfigured(): void {
  providerConfig()
}

async function readProviderJson(response: Response, operation: string): Promise<JsonObject> {
  if (!response.ok) throw new CustomVoiceProviderError(operation, response.status)
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new CustomVoiceProviderError(operation, 0)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CustomVoiceProviderError(operation, 0)
  const result = value as JsonObject
  if (Number(result.code) !== 200) throw new CustomVoiceProviderError(operation, result.code)
  return result
}

function stringField(value: unknown, maxLength = 500): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= maxLength ? value.trim() : undefined
}

function taskIdFrom(result: JsonObject): string {
  const data = result.data as JsonObject | undefined
  const taskId = stringField(data?.task_id ?? data?.taskId, 200)
  if (!taskId || !/^[^\s:]+$/.test(taskId)) throw new CustomVoiceProviderError('작업 ID 확인', 0)
  return taskId
}

async function createTask(model: string, input: JsonObject, operation: string): Promise<string> {
  const config = providerConfig()
  const response = await fetch(`${config.origin}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(30_000),
  })
  return taskIdFrom(await readProviderJson(response, operation))
}

export async function startVoiceValidation(input: {
  voiceUrl: string
  startSeconds: number
  endSeconds: number
  language: string
}) {
  return createTask('ai-music-api/validation-phrase', {
    voice_url: input.voiceUrl,
    vocal_start_s: input.startSeconds,
    vocal_end_s: input.endSeconds,
    language: input.language,
  }, '검증 문구 생성')
}

export async function startVoiceCreation(input: {
  validationTaskId: string
  verificationUrl: string
  name: string
  description?: string
  style?: string
  singerSkillLevel?: string
}) {
  return createTask('ai-music-api/create-voice', {
    task_id: input.validationTaskId,
    verify_url: input.verificationUrl,
    voice_name: input.name,
    description: input.description || undefined,
    style: input.style || undefined,
    singer_skill_level: input.singerSkillLevel || 'intermediate',
  }, '등록')
}

export async function checkVoiceAvailability(voiceTaskId: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const config = providerConfig()
  const response = await fetchImpl(`${config.origin}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'ai-music-api/check-voice', input: { task_id: voiceTaskId } }),
    signal: AbortSignal.timeout(30_000),
  })
  const result = await readProviderJson(response, '사용 가능 확인')
  const data = result.data as JsonObject | undefined
  if (typeof data?.isAvailable !== 'boolean') throw new CustomVoiceProviderError('사용 가능 확인', 0)
  return data.isAvailable
}

function parseNestedResult(data: JsonObject): JsonObject {
  let value: unknown = data.resultJson ?? data.response ?? data.result ?? data
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return {} }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const object = value as JsonObject
  const resultObject = object.resultObject
  if (resultObject && typeof resultObject === 'object' && !Array.isArray(resultObject)) {
    return { ...object, ...(resultObject as JsonObject) }
  }
  return object
}

function firstDefined(root: JsonObject, keys: string[]): unknown {
  for (const key of keys) {
    if (root[key] !== undefined) return root[key]
  }
  for (const value of Object.values(root)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const found = firstDefined(value as JsonObject, keys)
      if (found !== undefined) return found
    }
  }
  return undefined
}

export async function fetchCustomVoiceTask(taskId: string, fetchImpl: typeof fetch = fetch): Promise<CustomVoiceTaskResult> {
  if (!/^[^\s:]+$/.test(taskId)) throw new Error('목소리 작업 ID가 올바르지 않습니다.')
  const config = providerConfig()
  const response = await fetchImpl(`${config.origin}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  })
  const result = await readProviderJson(response, '상태 확인')
  const data = (result.data && typeof result.data === 'object' ? result.data : {}) as JsonObject
  const status = String(data.state ?? data.status ?? '').toLowerCase()
  if (['fail', 'failed', 'error', 'create_task_failed', 'callback_exception'].includes(status)) {
    const message = typeof data.failMsg === 'string' ? data.failMsg.slice(0, 8192) : ''
    const errorCode = providerFailureCode(data.failCode)
      ?? (/original_voice_info|data too long|database|sql exception|sqlsyntax|internal (?:server )?error/i.test(message)
        ? 'provider_internal_error' : undefined)
    return errorCode ? { state: 'failed', errorCode } : { state: 'failed' }
  }
  const output = parseNestedResult(data)
  const validationPhrase = stringField(firstDefined(output, ['validateInfo', 'validationPhrase', 'validation_phrase', 'verify_phrase_text']), 1000)
  const voiceId = stringField(firstDefined(output, ['voiceId', 'voice_id']), 200)
  const availableValue = firstDefined(output, ['isAvailable', 'is_available', 'available'])
  const isAvailable = typeof availableValue === 'boolean' ? availableValue : undefined
  if (validationPhrase || voiceId || isAvailable !== undefined) {
    return { state: 'complete', validationPhrase, voiceId, isAvailable }
  }
  return status === 'success'
    ? { state: 'unrecognized', errorCode: 'provider_result_unrecognized' }
    : { state: 'processing' }
}
