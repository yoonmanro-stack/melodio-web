import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

const APP_ORIGIN = 'https://melodio.app'
const LINK_LIFETIME_SECONDS = 60 * 60
const CLOCK_SKEW_SECONDS = 30
const TOKEN = /^([a-f0-9]{32})\.([a-f0-9]{32})\.([sv])\.([0-9a-z]{1,9})\.([A-Za-z0-9_-]{22})$/

type AudioKind = 'source' | 'verification'

function secret() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!value) throw new Error('voice_storage_unavailable')
  return value
}

function signature(payload: string) {
  return createHmac('sha256', secret())
    .update('melodio-custom-voice-audio-v1\n')
    .update(payload)
    .digest()
    .subarray(0, 16)
    .toString('base64url')
}

function dashed(value: string) {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function createCustomVoiceAudioLink(userId: string, registrationId: string, kind: AudioKind, now = Date.now()) {
  const user = userId.replaceAll('-', '').toLowerCase()
  const registration = registrationId.replaceAll('-', '').toLowerCase()
  if (!/^[a-f0-9]{32}$/.test(user) || !/^[a-f0-9]{32}$/.test(registration)) throw new Error('invalid_voice_registration')
  const expires = Math.floor(now / 1000 + LINK_LIFETIME_SECONDS).toString(36)
  const payload = `${user}.${registration}.${kind === 'source' ? 's' : 'v'}.${expires}`
  return `${APP_ORIGIN}/api/voice/audio/${payload}.${signature(payload)}`
}

export function parseCustomVoiceAudioLink(token: string, now = Date.now()): {
  userId: string; registrationId: string; kind: AudioKind
} | null {
  const match = TOKEN.exec(token)
  if (!match) return null
  const [, user, registration, code, expiry, actual] = match
  const expires = Number.parseInt(expiry, 36)
  const current = Math.floor(now / 1000)
  if (!Number.isSafeInteger(expires) || expires < current || expires > current + LINK_LIFETIME_SECONDS + CLOCK_SKEW_SECONDS) return null
  const payload = `${user}.${registration}.${code}.${expiry}`
  const expected = signature(payload)
  if (!timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return null
  return { userId: dashed(user), registrationId: dashed(registration), kind: code === 's' ? 'source' : 'verification' }
}
