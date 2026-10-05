import 'server-only'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { compileVoiceDesign, type VoiceDesignInput, VOICE_DESIGN_TRAITS } from './voice-design-prompt'

type StorageClient = Pick<SupabaseClient, 'storage'>
export type DesignedVoiceStatus = 'submitting' | 'ready' | 'held'
export type DesignedVoiceRecord = {
  schemaVersion: 1
  id: string
  userId: string
  name: string
  profile: VoiceDesignInput
  gender: 'female' | 'male'
  language: 'en' | 'ko' | 'ja' | 'fr'
  voicePrompt: string
  designCode: string
  sampleGenerationId: string
  sampleVersion: 'A' | 'B'
  durationSeconds: number
  providerOriginalTaskId: string
  providerAudioId: string
  providerPersonaId: string | null
  providerTaskId: string | null
  status: DesignedVoiceStatus
  errorCode: string | null
  createdAt: string
  updatedAt: string
  revision: number
  signature: string
}
export type DesignedVoiceSeed = Omit<DesignedVoiceRecord,
  'schemaVersion' | 'id' | 'status' | 'providerPersonaId' | 'providerTaskId' | 'errorCode' | 'createdAt' | 'updatedAt' | 'revision' | 'signature'>
const BUCKET = 'melodio-private'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROVIDER_ID = /^[A-Za-z0-9_-]{6,160}$/
const MAX_REVISIONS = 8
const LIMIT = 200

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const fields = value as Record<string, unknown>
    return `{${Object.keys(fields).filter(key => fields[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonical(fields[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}
function sign(row: Omit<DesignedVoiceRecord, 'signature'> | DesignedVoiceRecord) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('designed_voice_storage_unavailable')
  const unsigned = { ...row } as Partial<DesignedVoiceRecord>
  delete unsigned.signature
  return createHmac('sha256', secret).update('melodio-designed-voice-v1\n').update(canonical(unsigned)).digest('hex')
}
export function designedVoiceId(userId: string, generationId: string, version: 'A' | 'B') {
  if (!UUID.test(userId) || !UUID.test(generationId) || !['A', 'B'].includes(version)) throw new Error('invalid_request')
  const hash = createHash('sha256').update(`melodio-designed-voice-v1:${userId.toLowerCase()}:${generationId.toLowerCase()}:${version}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
function prefix(userId: string) {
  if (!UUID.test(userId)) throw new Error('invalid_request')
  return `designed-voices/${userId.toLowerCase()}`
}
function sourcePath(userId: string, generationId: string, version: 'A' | 'B') {
  designedVoiceId(userId, generationId, version)
  return `${prefix(userId)}/${generationId.toLowerCase()}-${version}.json`
}
function versionPath(row: DesignedVoiceRecord) {
  return `${prefix(row.userId)}/versions/${row.id}/${row.signature}.json`
}
function validate(row: DesignedVoiceRecord, userId: string, generationId: string, version: 'A' | 'B') {
  if (!row || row.schemaVersion !== 1 || row.userId !== userId || row.sampleGenerationId !== generationId
    || row.sampleVersion !== version || row.id !== designedVoiceId(userId, generationId, version)
    || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 80
    || !Number.isInteger(row.revision) || row.revision < 0 || row.revision > MAX_REVISIONS
    || !['submitting', 'ready', 'held'].includes(row.status)
    || !Number.isFinite(row.durationSeconds) || row.durationSeconds < 30 || row.durationSeconds > 360
    || typeof row.providerOriginalTaskId !== 'string' || !PROVIDER_ID.test(row.providerOriginalTaskId)
    || typeof row.providerAudioId !== 'string' || !PROVIDER_ID.test(row.providerAudioId)
    || typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(row.createdAt)) || !Number.isFinite(Date.parse(row.updatedAt))
    || (row.providerTaskId !== null && (typeof row.providerTaskId !== 'string' || !PROVIDER_ID.test(row.providerTaskId)))
    || (row.providerPersonaId !== null && (typeof row.providerPersonaId !== 'string' || !PROVIDER_ID.test(row.providerPersonaId)))
    || (row.errorCode !== null && !['submission_unconfirmed', 'provider_rejected', 'provider_failed'].includes(row.errorCode))
    || (row.status === 'ready' && !row.providerPersonaId)
    || (row.status !== 'ready' && row.providerPersonaId !== null)
    || typeof row.signature !== 'string' || !/^[a-f0-9]{64}$/.test(row.signature)) {
    throw new Error('invalid_designed_voice')
  }
  const expected = sign(row)
  if (!timingSafeEqual(Buffer.from(row.signature, 'hex'), Buffer.from(expected, 'hex'))) throw new Error('invalid_designed_voice')
  let design
  try { design = compileVoiceDesign(row.profile) } catch { throw new Error('invalid_designed_voice') }
  if (design.designCode !== row.designCode || design.stylePrompt !== row.voicePrompt
    || design.gender !== row.gender || design.language !== row.language) throw new Error('invalid_designed_voice')
  return row
}
function missing(error: unknown) {
  const value = error as { statusCode?: string | number; status?: number; message?: string }
  return Number(value?.statusCode ?? value?.status) === 404 || value?.message === 'Object not found'
}
async function download(admin: StorageClient, path: string): Promise<DesignedVoiceRecord | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(path, { cacheNonce: randomUUID() }, { cache: 'no-store' })
  if (error) {
    if (missing(error)) return null
    throw new Error('designed_voice_storage_unavailable')
  }
  if (!data || data.size > 64 * 1024) throw new Error('invalid_designed_voice')
  try { return JSON.parse(await data.text()) as DesignedVoiceRecord } catch { throw new Error('invalid_designed_voice') }
}
async function upload(admin: StorageClient, path: string, row: DesignedVoiceRecord) {
  const { error } = await admin.storage.from(BUCKET).upload(path, JSON.stringify(row), {
    contentType: 'application/json', cacheControl: '0', upsert: false,
  })
  if (error) throw new Error('designed_voice_storage_unavailable')
}
export async function readDesignedVoiceForSample(admin: StorageClient, userId: string, generationId: string, version: 'A' | 'B') {
  const initial = await download(admin, sourcePath(userId, generationId, version))
  if (!initial) return null
  let row = validate(initial, userId, generationId, version)
  if (row.revision !== 0) throw new Error('invalid_designed_voice')
  for (let index = 0; index <= MAX_REVISIONS; index++) {
    const next = await download(admin, versionPath(row))
    if (!next) return row
    validate(next, userId, generationId, version)
    if (row.status !== 'submitting' || next.revision !== row.revision + 1
      || next.createdAt !== row.createdAt || next.name !== row.name
      || next.providerOriginalTaskId !== row.providerOriginalTaskId || next.providerAudioId !== row.providerAudioId
      || next.designCode !== row.designCode) throw new Error('invalid_designed_voice')
    row = next
  }
  throw new Error('invalid_designed_voice')
}
async function sampleKeys(admin: StorageClient, userId: string) {
  const keys: { generationId: string; version: 'A' | 'B' }[] = []
  for (let offset = 0; offset < 1000; offset += 100) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix(userId), {
      limit: 100, offset, sortBy: { column: 'name', order: 'asc' },
    })
    if (error || !data) throw new Error('designed_voice_storage_unavailable')
    for (const item of data) {
      const match = item.name.match(/^([0-9a-f-]{36})-([AB])\.json$/i)
      if (match && UUID.test(match[1])) keys.push({ generationId: match[1].toLowerCase(), version: match[2].toUpperCase() as 'A' | 'B' })
    }
    if (keys.length > LIMIT) throw new Error('designed_voice_list_limit')
    if (data.length < 100) return keys
  }
  throw new Error('designed_voice_list_limit')
}
export async function readDesignedVoice(admin: StorageClient, userId: string, id: string): Promise<DesignedVoiceRecord | null> {
  if (!UUID.test(id)) throw new Error('invalid_request')
  const keys = await sampleKeys(admin, userId)
  const key = keys.find(key => designedVoiceId(userId, key.generationId, key.version) === id.toLowerCase())
  return key ? readDesignedVoiceForSample(admin, userId, key.generationId, key.version) : null
}
export async function listDesignedVoices(admin: StorageClient, userId: string) {
  const keys = await sampleKeys(admin, userId)
  const rows: DesignedVoiceRecord[] = []
  for (let start = 0; start < keys.length; start += 4) {
    const found = await Promise.all(keys.slice(start, start + 4).map(key => readDesignedVoiceForSample(admin, userId, key.generationId, key.version)))
    rows.push(...found.filter((row): row is DesignedVoiceRecord => row !== null))
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
/** An uncertain initial write is never permission to dispatch the provider. */
export async function claimDesignedVoice(admin: StorageClient, seed: DesignedVoiceSeed) {
  const now = new Date().toISOString()
  const unsigned = { ...seed, schemaVersion: 1 as const,
    id: designedVoiceId(seed.userId, seed.sampleGenerationId, seed.sampleVersion),
    status: 'submitting' as const, providerPersonaId: null, providerTaskId: null, errorCode: null,
    createdAt: now, updatedAt: now, revision: 0,
  }
  const row = { ...unsigned, signature: sign(unsigned) }
  validate(row, seed.userId, seed.sampleGenerationId, seed.sampleVersion)
  try { await upload(admin, sourcePath(seed.userId, seed.sampleGenerationId, seed.sampleVersion), row) }
  catch {
    const existing = await readDesignedVoiceForSample(admin, seed.userId, seed.sampleGenerationId, seed.sampleVersion)
    if (existing) return { record: existing, claimed: false }
    throw new Error('designed_voice_storage_unavailable')
  }
  return { record: row, claimed: true }
}
export async function updateDesignedVoice(admin: StorageClient, expected: DesignedVoiceRecord, patch: Pick<DesignedVoiceRecord, 'status' | 'providerPersonaId' | 'providerTaskId' | 'errorCode'>) {
  validate(expected, expected.userId, expected.sampleGenerationId, expected.sampleVersion)
  if (expected.status !== 'submitting' || expected.revision >= MAX_REVISIONS) throw new Error('designed_voice_conflict')
  const updated = { ...expected, ...patch, revision: expected.revision + 1, updatedAt: new Date().toISOString() }
  updated.signature = sign(updated)
  validate(updated, expected.userId, expected.sampleGenerationId, expected.sampleVersion)
  try { await upload(admin, versionPath(expected), updated) }
  catch {
    const current = await readDesignedVoiceForSample(admin, expected.userId, expected.sampleGenerationId, expected.sampleVersion)
    if (current && current.revision > expected.revision) return current
    throw new Error('designed_voice_storage_unavailable')
  }
  return updated
}
export function safeDesignedVoice(row: DesignedVoiceRecord) {
  const labels = row.profile.traits.map(id => VOICE_DESIGN_TRAITS.find(trait => trait.id === id)?.label).filter((label): label is NonNullable<typeof label> => !!label)
  return {
    id: `designed-voice-${row.id}`, designedVoiceId: row.id, name: row.name,
    desc: labels.join(' · '), gender: row.gender, language: row.language, category: 'Singing/Music',
    stylePrompt: row.voicePrompt, sourceType: 'dna_designed' as const, tags: labels,
    sampleGenerationId: row.sampleGenerationId, sampleVersion: row.sampleVersion,
    createdAt: row.createdAt, status: row.status, errorCode: row.errorCode,
  }
}
