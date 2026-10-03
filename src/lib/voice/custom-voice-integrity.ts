import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Database, Json } from '@/types/database'

type VoiceRow = Pick<Database['public']['Tables']['voice_dnas']['Row'], 'id' | 'user_id' | 'vd_code' | 'name' | 'style' | 'physical_layers'>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function object(value: Json | undefined): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const fields = value as Record<string, unknown>
    return `{${Object.keys(fields).filter(key => fields[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonical(fields[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function signature(row: VoiceRow, layers: Record<string, Json | undefined>) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('voice_storage_unavailable')
  const unsignedLayers = { ...layers }
  delete unsignedLayers.registrationSignature
  return createHmac('sha256', secret).update('melodio-custom-voice-v1\n').update(canonical({
    id: row.id, userId: row.user_id, code: row.vd_code, name: row.name, style: row.style,
    layers: unsignedLayers,
  })).digest('hex')
}

export function signedCustomVoiceLayers(row: VoiceRow, layers: Json): Json {
  const fields = object(layers)
  return { ...fields, registrationSignature: signature(row, fields) }
}

export function assertCustomVoiceAudioPath(row: Pick<VoiceRow, 'id' | 'user_id'>, path: string, kind: 'source' | 'verification') {
  if (!UUID.test(row.id) || !row.user_id || !UUID.test(row.user_id)) throw new Error('invalid_voice_registration')
  const prefix = `uploads/${row.user_id}/voice/${row.id}/${kind}.`
  if (!path.startsWith(prefix) || !/^(mp3|wav|m4a|aac|ogg|webm)$/.test(path.slice(prefix.length))) {
    throw new Error('invalid_voice_registration')
  }
  return path
}

export function isTrustedCustomVoice(row: VoiceRow): boolean {
  const layers = object(row.physical_layers)
  const actual = layers.registrationSignature
  if (typeof actual !== 'string' || !/^[a-f0-9]{64}$/.test(actual) || !row.vd_code.startsWith('SV-')) return false
  const expected = signature(row, layers)
  if (!timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))) return false
  const registration = object(layers.registration)
  try {
    for (const kind of ['source', 'verification'] as const) {
      const path = registration[`${kind}ObjectPath`]
      if (path !== null && path !== undefined) {
        if (typeof path !== 'string') return false
        assertCustomVoiceAudioPath(row, path, kind)
      }
    }
  } catch { return false }
  return true
}

export function assertTrustedCustomVoice(row: VoiceRow) {
  if (!isTrustedCustomVoice(row)) throw new Error('invalid_voice_registration')
}

export function registeredVoicePersona(row: VoiceRow, userId: string): string {
  assertTrustedCustomVoice(row)
  if (row.user_id !== userId) throw new Error('invalid_voice_registration')
  const registration = object(object(row.physical_layers).registration)
  if (registration.status !== 'ready' || typeof registration.providerVoiceId !== 'string'
    || !/^[A-Za-z0-9_-]{6,160}$/.test(registration.providerVoiceId)) {
    throw new Error('voice_not_ready')
  }
  return registration.providerVoiceId
}
