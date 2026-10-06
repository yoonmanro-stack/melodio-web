import 'server-only'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ArtistChecks, ArtistInput, ArtistPortrait, ArtistProfile } from './types'
import { resolveArtistVoice } from './voice-reference'
import { prepareArtistPortrait } from './portrait-preparation'
import { MAX_ARTIST_PORTRAIT_BYTES, MAX_ARTIST_PORTRAIT_TRANSFER_BYTES } from './portrait-policy'
export { MAX_ARTIST_PORTRAIT_BYTES } from './portrait-policy'

export type ArtistStorageClient = Pick<SupabaseClient, 'storage'>
type ArtistRecord = ArtistProfile & { signature: string }
type PortraitRecord = ArtistPortrait & {
  schemaVersion: 1; userId: string; byteLength: number; sha256: string; createdAt: string; signature: string
}
const BUCKET = 'melodio-private'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX = /^[a-f0-9]{64}$/
const MAX_REVISIONS = 10_000
const MAX_CHAIN_READ = 128
const MAX_ACTIVE_ARTISTS = 30
const MAX_LIST_RECORDS = 100
const MAX_RECORD_BYTES = 32 * 1024
const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const
const TEXT_LIMITS = { name: 80, tagline: 160, description: 1200, personality: 2000, backstory: 2000, speakingStyle: 800, visualDirection: 2000 } as const

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function uuid(value: string) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('invalid_request')
  return value.toLowerCase()
}
function prefix(userId: string, id?: string) {
  return `artist-profiles/${uuid(userId)}${id === undefined ? '' : `/${uuid(id)}`}`
}
function portraitPrefix(userId: string, assetId: string) {
  return `artist-portraits/${uuid(userId)}/${uuid(assetId)}`
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
function sign(value: object, domain: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('artist_storage_unavailable')
  const unsigned = { ...value } as Record<string, unknown>
  delete unsigned.signature
  return createHmac('sha256', secret).update(`${domain}\n`).update(canonical(unsigned)).digest('hex')
}
function trusted(value: { signature: string }, domain: string) {
  if (typeof value.signature !== 'string' || !HEX.test(value.signature)
    || !timingSafeEqual(Buffer.from(value.signature, 'hex'), Buffer.from(sign(value, domain), 'hex'))) {
    throw new Error('invalid_artist_record')
  }
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) throw new Error('invalid_request')
  return value.trim()
}
function parseInput(input: unknown): Omit<ArtistInput, 'voice' | 'portrait'> & { voice: unknown; portrait: unknown } {
  const value = object(input)
  const fields = Object.fromEntries(Object.entries(TEXT_LIMITS).map(([key, limit]) => [key, text(value[key], limit)])) as Pick<ArtistInput, keyof typeof TEXT_LIMITS>
  if (!fields.name || !Array.isArray(value.genres) || value.genres.length > 8
    || !['draft', 'ready', 'archived'].includes(String(value.status))) throw new Error('invalid_request')
  const genres = [...new Set(value.genres.map(genre => text(genre, 60)))]
  if (genres.some(genre => !genre)) throw new Error('invalid_request')
  const checks = object(value.checks)
  for (const key of ['voiceAuditioned', 'portraitReviewed', 'identityReviewed']) {
    if (typeof checks[key] !== 'boolean') throw new Error('invalid_request')
  }
  if (value.voice !== null && !Object.keys(object(value.voice)).length) throw new Error('invalid_request')
  if (value.portrait !== null && !Object.keys(object(value.portrait)).length) throw new Error('invalid_request')
  return { ...fields, genres, status: value.status as ArtistInput['status'], checks: {
    voiceAuditioned: checks.voiceAuditioned as boolean, portraitReviewed: checks.portraitReviewed as boolean, identityReviewed: checks.identityReviewed as boolean,
  }, voice: value.voice, portrait: value.portrait }
}
function ready(profile: Pick<ArtistProfile, 'voice' | 'portrait' | 'personality' | 'visualDirection' | 'checks'>) {
  return !!profile.voice && !!profile.portrait && !!profile.personality.trim() && !!profile.visualDirection.trim()
    && profile.checks.voiceAuditioned && profile.checks.portraitReviewed && profile.checks.identityReviewed
}
function validate(row: ArtistRecord, userId: string, id: string): ArtistRecord {
  try {
    if (!row || row.schemaVersion !== 1 || row.id !== id || row.userId !== userId
      || !Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision > MAX_REVISIONS
      || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))
      || typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) throw new Error('invalid_artist_record')
    const input = parseInput(row)
    if (Object.entries(TEXT_LIMITS).some(([key]) => input[key as keyof typeof TEXT_LIMITS] !== row[key as keyof typeof TEXT_LIMITS])) throw new Error('invalid_artist_record')
    if (row.voice !== null) {
      const voice = object(row.voice)
      if (!['official', 'discovery', 'designed', 'custom'].includes(String(voice.kind))
        || typeof voice.referenceId !== 'string' || !voice.referenceId || voice.referenceId.length > 160
        || typeof voice.name !== 'string' || !voice.name || voice.name.length > 80
        || !['female', 'male'].includes(String(voice.gender)) || !['ko', 'en', 'ja', 'fr'].includes(String(voice.language))) throw new Error('invalid_artist_record')
    }
    if (row.portrait !== null) {
      const portrait = object(row.portrait)
      if (typeof portrait.assetId !== 'string' || !UUID.test(portrait.assetId)
        || !Object.hasOwn(EXTENSIONS, String(portrait.mimeType))
        || typeof portrait.fileName !== 'string' || !portrait.fileName || portrait.fileName.length > 120) throw new Error('invalid_artist_record')
    }
    if (row.status === 'ready' && !ready(row)) throw new Error('invalid_artist_record')
    trusted(row, 'melodio-artist-profile-v1')
    return row
  } catch (error) {
    if (error instanceof Error && error.message === 'artist_storage_unavailable') throw error
    throw new Error('invalid_artist_record')
  }
}
function safe(row: ArtistRecord): ArtistProfile {
  return { schemaVersion: row.schemaVersion, id: row.id, userId: row.userId, name: row.name, tagline: row.tagline,
    description: row.description, genres: [...row.genres], personality: row.personality, backstory: row.backstory,
    speakingStyle: row.speakingStyle, visualDirection: row.visualDirection, status: row.status,
    revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, checks: { ...row.checks },
    voice: row.voice ? { ...row.voice } : null, portrait: row.portrait ? { ...row.portrait } : null }
}
function missing(error: unknown) {
  const value = error as { statusCode?: string | number; status?: number; message?: string }
  return Number(value?.statusCode ?? value?.status) === 404 || value?.message === 'Object not found'
}
async function downloadJson<T>(admin: ArtistStorageClient, path: string): Promise<T | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(path, { cacheNonce: randomUUID() }, { cache: 'no-store' })
  if (error) {
    if (missing(error)) return null
    throw new Error('artist_storage_unavailable')
  }
  if (!data || data.size > MAX_RECORD_BYTES) throw new Error('invalid_artist_record')
  try { return JSON.parse(await data.text()) as T } catch { throw new Error('invalid_artist_record') }
}
async function immutableUpload(admin: ArtistStorageClient, path: string, body: string | Buffer, contentType: string) {
  if (contentType === 'application/json' && Buffer.byteLength(body) > MAX_RECORD_BYTES) throw new Error('artist_request_too_large')
  const { error } = await admin.storage.from(BUCKET).upload(path, body, { contentType, cacheControl: '0', upsert: false })
  if (error) {
    const value = error as { statusCode?: string | number; status?: number; message?: string }
    if ([400, 409].includes(Number(value.statusCode ?? value.status)) && /exist|duplicate|conflict/i.test(value.message || '')) throw new Error('artist_conflict')
    throw new Error('artist_storage_unavailable')
  }
}
async function publishHead(admin: ArtistStorageClient, row: ArtistRecord) {
  // This signed hint accelerates reads. Only the immutable transition commits
  // state; a failed or raced hint write cannot reverse an acknowledged save.
  try {
    await admin.storage.from(BUCKET).upload(`${prefix(row.userId, row.id)}/latest.json`, JSON.stringify(row), {
      contentType: 'application/json', cacheControl: '0', upsert: true,
    })
  } catch { /* The next read follows the prior hint's immutable successors. */ }
}
async function readRecord(admin: ArtistStorageClient, userId: string, id: string): Promise<ArtistRecord | null> {
  const path = prefix(userId, id)
  const initial = await downloadJson<ArtistRecord>(admin, `${path}/record.json`)
  if (!initial) return null
  let current = validate(initial, uuid(userId), uuid(id))
  if (current.revision !== 0) throw new Error('invalid_artist_record')
  const hint = await downloadJson<ArtistRecord>(admin, `${path}/latest.json`)
  if (hint) {
    validate(hint, uuid(userId), uuid(id))
    if (hint.createdAt !== initial.createdAt || (hint.revision === 0 && hint.signature !== initial.signature)) throw new Error('invalid_artist_record')
    current = hint
  }
  for (let step = 0; step <= MAX_CHAIN_READ; step++) {
    const next = await downloadJson<ArtistRecord>(admin, `${path}/versions/${current.signature}.json`)
    if (!next) return current
    if (step === MAX_CHAIN_READ) throw new Error('artist_chain_read_limit')
    validate(next, uuid(userId), uuid(id))
    if (current.status === 'archived' || next.revision !== current.revision + 1 || next.createdAt !== current.createdAt) throw new Error('invalid_artist_record')
    current = next
  }
  throw new Error('invalid_artist_record')
}

export async function readArtist(admin: ArtistStorageClient, userId: string, id: string): Promise<ArtistProfile | null> {
  const row = await readRecord(admin, userId, id)
  return row ? safe(row) : null
}

/** Includes retained archives; a bounded scan never acknowledges an incomplete list. */
export async function listArtists(admin: ArtistStorageClient, userId: string): Promise<ArtistProfile[]> {
  const rows: ArtistProfile[] = []
  let folderCount = 0
  for (let offset = 0; offset < 1000; offset += 100) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix(userId), { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error || !data) throw new Error('artist_storage_unavailable')
    const folders = data.filter(item => UUID.test(item.name))
    folderCount += folders.length
    if (folderCount > MAX_LIST_RECORDS) throw new Error('artist_list_limit')
    for (let start = 0; start < folders.length; start += 4) {
      const found = await Promise.all(folders.slice(start, start + 4).map(async item => {
        try { return await readArtist(admin, userId, item.name) } catch (error) {
          if (error instanceof Error && error.message === 'invalid_artist_record') return null
          throw error
        }
      }))
      rows.push(...found.filter((row): row is ArtistProfile => row !== null))
    }
    if (data.length < 100) return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  throw new Error('artist_list_limit')
}

async function storedArtistFolderCount(admin: ArtistStorageClient, userId: string) {
  let count = 0
  for (let offset = 0; offset < 1000; offset += 100) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix(userId), { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error || !data) throw new Error('artist_storage_unavailable')
    // Archives and untrusted/incomplete records still occupy retained folders.
    count += data.filter(item => UUID.test(item.name)).length
    if (count >= MAX_LIST_RECORDS || data.length < 100) return count
  }
  throw new Error('artist_list_limit')
}

function validatePortrait(record: PortraitRecord, userId: string, assetId: string) {
  if (!record || record.schemaVersion !== 1 || record.userId !== uuid(userId) || record.assetId !== uuid(assetId)
    || !Object.hasOwn(EXTENSIONS, record.mimeType) || typeof record.fileName !== 'string' || !record.fileName || record.fileName.length > 120
    || /[\\/\u0000-\u001f]/.test(record.fileName) || !Number.isSafeInteger(record.byteLength) || record.byteLength <= 0 || record.byteLength > MAX_ARTIST_PORTRAIT_BYTES
    || typeof record.sha256 !== 'string' || !HEX.test(record.sha256)
    || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) throw new Error('invalid_artist_record')
  trusted(record, 'melodio-artist-portrait-v1')
  return record
}
async function readPortraitRecord(admin: ArtistStorageClient, userId: string, assetId: string) {
  const record = await downloadJson<PortraitRecord>(admin, `${portraitPrefix(userId, assetId)}/record.json`)
  return record ? validatePortrait(record, userId, assetId) : null
}
function safePortrait(record: PortraitRecord): ArtistPortrait {
  return { assetId: record.assetId, mimeType: record.mimeType, fileName: record.fileName }
}
async function resolvePortrait(admin: ArtistStorageClient, userId: string, value: unknown): Promise<ArtistPortrait | null> {
  if (value === null) return null
  const fields = object(value)
  if (typeof fields.assetId !== 'string') throw new Error('invalid_request')
  const record = await readPortraitRecord(admin, userId, fields.assetId)
  if (!record) throw new Error('artist_portrait_not_found')
  return safePortrait(record)
}
async function resolveInput(admin: ArtistStorageClient, userId: string, input: unknown) {
  const parsed = parseInput(input)
  const voice = parsed.voice === null ? null : await resolveArtistVoice(admin, uuid(userId), parsed.voice)
  const portrait = await resolvePortrait(admin, userId, parsed.portrait)
  return { ...parsed, voice, portrait }
}

export async function createArtist(admin: ArtistStorageClient, userId: string, input: ArtistInput): Promise<ArtistProfile> {
  const owner = uuid(userId)
  if (await storedArtistFolderCount(admin, owner) >= MAX_LIST_RECORDS) throw new Error('too_many_artist_records')
  if ((await listArtists(admin, owner)).filter(row => row.status !== 'archived').length >= MAX_ACTIVE_ARTISTS) throw new Error('too_many_artists')
  const resolved = await resolveInput(admin, owner, input)
  if (resolved.status === 'archived') throw new Error('invalid_request')
  if (resolved.status === 'ready' && !ready(resolved)) throw new Error('artist_not_ready')
  const now = new Date().toISOString()
  const profile: ArtistProfile = { ...resolved, schemaVersion: 1, id: randomUUID(), userId: owner, revision: 0, createdAt: now, updatedAt: now }
  const row: ArtistRecord = { ...profile, signature: sign(profile, 'melodio-artist-profile-v1') }
  validate(row, owner, row.id)
  await immutableUpload(admin, `${prefix(owner, row.id)}/record.json`, JSON.stringify(row), 'application/json')
  await publishHead(admin, row)
  return safe(row)
}

export async function updateArtist(admin: ArtistStorageClient, userId: string, id: string, expectedRevision: number, input: ArtistInput): Promise<ArtistProfile> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= MAX_REVISIONS) throw new Error('invalid_request')
  const current = await readRecord(admin, userId, id)
  if (!current) throw new Error('artist_not_found')
  if (current.revision !== expectedRevision || current.status === 'archived') throw new Error('artist_conflict')
  const resolved = await resolveInput(admin, userId, input)
  const voiceChanged = canonical(current.voice) !== canonical(resolved.voice)
  const portraitChanged = canonical(current.portrait) !== canonical(resolved.portrait)
  const identityChanged = Object.keys(TEXT_LIMITS).some(key => current[key as keyof typeof TEXT_LIMITS] !== resolved[key as keyof typeof TEXT_LIMITS])
    || canonical(current.genres) !== canonical(resolved.genres) || voiceChanged || portraitChanged
  const checks: ArtistChecks = { ...resolved.checks,
    ...(voiceChanged ? { voiceAuditioned: false } : {}),
    ...(portraitChanged || current.visualDirection !== resolved.visualDirection ? { portraitReviewed: false } : {}),
    ...(identityChanged ? { identityReviewed: false } : {}),
  }
  const status = resolved.status === 'ready' && (voiceChanged || portraitChanged || identityChanged) ? 'draft' : resolved.status
  const profile: ArtistProfile = { ...resolved, checks, status, schemaVersion: 1, id: current.id, userId: current.userId,
    revision: current.revision + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString() }
  if (profile.status === 'ready' && !ready(profile)) throw new Error('artist_not_ready')
  const row: ArtistRecord = { ...profile, signature: sign(profile, 'melodio-artist-profile-v1') }
  validate(row, current.userId, current.id)
  // The immutable predecessor key is the compare-and-swap and durable head.
  await immutableUpload(admin, `${prefix(current.userId, current.id)}/versions/${current.signature}.json`, JSON.stringify(row), 'application/json')
  await publishHead(admin, row)
  return safe(row)
}

export async function archiveArtist(admin: ArtistStorageClient, userId: string, id: string, expectedRevision: number): Promise<ArtistProfile> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= MAX_REVISIONS) throw new Error('invalid_request')
  const current = await readRecord(admin, userId, id)
  if (!current) throw new Error('artist_not_found')
  if (current.revision !== expectedRevision || current.status === 'archived') throw new Error('artist_conflict')
  // Archiving remains available when a referenced owned voice has been removed.
  const row: ArtistRecord = { ...current, status: 'archived', revision: current.revision + 1, updatedAt: new Date().toISOString() }
  row.signature = sign(row, 'melodio-artist-profile-v1')
  validate(row, current.userId, current.id)
  await immutableUpload(admin, `${prefix(current.userId, current.id)}/versions/${current.signature}.json`, JSON.stringify(row), 'application/json')
  await publishHead(admin, row)
  return safe(row)
}

export function artistPortraitMime(bytes: Uint8Array): ArtistPortrait['mimeType'] {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp'
  throw new Error('invalid_portrait_file')
}

export async function storeArtistPortrait(admin: ArtistStorageClient, userId: string, file: { size: number; type: string; name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<ArtistPortrait> {
  const owner = uuid(userId)
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_ARTIST_PORTRAIT_TRANSFER_BYTES) throw new Error('invalid_portrait_file')
  const uploaded = Buffer.from(await file.arrayBuffer())
  if (uploaded.length !== file.size) throw new Error('invalid_portrait_file')
  if (file.type !== artistPortraitMime(uploaded)) throw new Error('invalid_portrait_file')
  const bytes = await prepareArtistPortrait(uploaded)
  const mimeType = artistPortraitMime(bytes)
  const assetId = randomUUID()
  const original = file.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 110) || 'portrait'
  const fileName = `${original.replace(/\.[^.]*$/, '') || 'portrait'}.${EXTENSIONS[mimeType]}`
  const unsigned = { schemaVersion: 1 as const, assetId, userId: owner, mimeType, fileName, byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), createdAt: new Date().toISOString() }
  const record: PortraitRecord = { ...unsigned, signature: sign(unsigned, 'melodio-artist-portrait-v1') }
  validatePortrait(record, owner, assetId)
  const path = portraitPrefix(owner, assetId)
  await immutableUpload(admin, `${path}/portrait.${EXTENSIONS[mimeType]}`, bytes, mimeType)
  await immutableUpload(admin, `${path}/record.json`, JSON.stringify(record), 'application/json')
  return safePortrait(record)
}

export async function readArtistPortrait(admin: ArtistStorageClient, userId: string, assetId: string): Promise<{ bytes: Uint8Array; portrait: ArtistPortrait } | null> {
  const record = await readPortraitRecord(admin, userId, assetId)
  if (!record) return null
  const path = `${portraitPrefix(userId, assetId)}/portrait.${EXTENSIONS[record.mimeType]}`
  const { data, error } = await admin.storage.from(BUCKET).download(path, { cacheNonce: randomUUID() }, { cache: 'no-store' })
  if (error || !data) throw new Error('artist_storage_unavailable')
  if (data.size !== record.byteLength || data.size > MAX_ARTIST_PORTRAIT_BYTES) throw new Error('invalid_artist_record')
  const bytes = new Uint8Array(await data.arrayBuffer())
  if (artistPortraitMime(bytes) !== record.mimeType || createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new Error('invalid_artist_record')
  return { bytes, portrait: safePortrait(record) }
}
