import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { assertTrustedCustomVoice, signedCustomVoiceLayers } from './custom-voice-integrity'

// Production has no voice_dnas table. Registration records live only in the
// existing private bucket; no SQL migration or browser database access is used.
export type CustomVoiceRow = Database['public']['Tables']['voice_dnas']['Row']
type StorageClient = Pick<SupabaseClient, 'storage'>
const BUCKET = 'melodio-private'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_REVISIONS = 64

function object(value: Json): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function prefix(userId: string, id?: string) {
  if (!UUID.test(userId) || (id !== undefined && !UUID.test(id))) throw new Error('invalid_request')
  return `voice-registration-state/${userId}${id ? `/${id}` : ''}`
}

function signature(row: CustomVoiceRow) {
  return String(object(row.physical_layers).registrationSignature)
}

function revision(row: CustomVoiceRow) {
  const value = object(row.physical_layers).registrationRevision
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > MAX_REVISIONS) {
    throw new Error('invalid_voice_registration')
  }
  return Number(value)
}

function validate(row: CustomVoiceRow, userId: string, id: string) {
  if (!row || row.id !== id || row.user_id !== userId || typeof row.vd_code !== 'string'
    || typeof row.name !== 'string' || typeof row.style !== 'string' || typeof row.created_at !== 'string') {
    throw new Error('invalid_voice_registration')
  }
  assertTrustedCustomVoice(row)
  revision(row)
  return row
}

function missing(error: unknown) {
  const value = error as { statusCode?: string | number; status?: number; message?: string }
  return Number(value?.statusCode ?? value?.status) === 404 || value?.message === 'Object not found'
}

async function download(admin: StorageClient, path: string): Promise<CustomVoiceRow | null> {
  // A previously missing transition must never remain cached after a CAS write.
  const { data, error } = await admin.storage.from(BUCKET).download(path, { cacheNonce: randomUUID() }, { cache: 'no-store' })
  if (error) {
    if (missing(error)) return null
    throw new Error('voice_storage_unavailable')
  }
  if (!data || data.size > 64 * 1024) throw new Error('invalid_voice_registration')
  try { return JSON.parse(await data.text()) as CustomVoiceRow } catch { throw new Error('invalid_voice_registration') }
}

async function immutableUpload(admin: StorageClient, path: string, row: CustomVoiceRow) {
  const { error } = await admin.storage.from(BUCKET).upload(path, JSON.stringify(row), {
    contentType: 'application/json', cacheControl: '0', upsert: false,
  })
  if (error) {
    const value = error as { statusCode?: string | number; status?: number; message?: string }
    if ([400, 409].includes(Number(value.statusCode ?? value.status)) && /exist|duplicate|conflict/i.test(value.message || '')) {
      throw new Error('registration_conflict')
    }
    throw new Error('voice_storage_unavailable')
  }
}

export async function readCustomVoice(admin: StorageClient, userId: string, id: string): Promise<CustomVoiceRow | null> {
  const path = prefix(userId, id)
  const initial = await download(admin, `${path}/record.json`)
  if (!initial) return null
  let current = validate(initial, userId, id)
  if (revision(current) !== 0) throw new Error('invalid_voice_registration')
  for (let step = 0; step <= MAX_REVISIONS; step++) {
    const next = await download(admin, `${path}/versions/${signature(current)}.json`)
    if (!next) return object(current.physical_layers).registrationDeleted === true ? null : current
    validate(next, userId, id)
    if (revision(next) !== revision(current) + 1 || object(current.physical_layers).registrationDeleted === true) {
      throw new Error('invalid_voice_registration')
    }
    current = next
  }
  throw new Error('invalid_voice_registration')
}

export async function listCustomVoices(admin: StorageClient, userId: string): Promise<CustomVoiceRow[]> {
  const path = prefix(userId)
  const rows: CustomVoiceRow[] = []
  // Deletions retain immutable history, so scan past tombstone folders. Four
  // concurrent chains keep ordinary lists within the route's request budget.
  for (let offset = 0; offset < 1000; offset += 100) {
    const { data, error } = await admin.storage.from(BUCKET).list(path, {
      limit: 100, offset, sortBy: { column: 'name', order: 'asc' },
    })
    if (error || !data) throw new Error('voice_storage_unavailable')
    const folders = data.filter(item => UUID.test(item.name))
    for (let start = 0; start < folders.length && rows.length < 20; start += 4) {
      const found = await Promise.all(folders.slice(start, start + 4).map(async item => {
        try { return await readCustomVoice(admin, userId, item.name) } catch (error) {
          if (error instanceof Error && error.message === 'invalid_voice_registration') return null
          throw error
        }
      }))
      rows.push(...found.filter((row): row is CustomVoiceRow => row !== null))
    }
    if (rows.length >= 20 || data.length < 100) {
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20)
    }
  }
  throw new Error('voice_storage_list_limit')
}

export async function createCustomVoice(admin: StorageClient, row: CustomVoiceRow): Promise<CustomVoiceRow> {
  const path = prefix(row.user_id || '', row.id)
  const created = { ...row, physical_layers: signedCustomVoiceLayers(row, {
    ...object(row.physical_layers), registrationRevision: 0,
  }) }
  validate(created, row.user_id || '', row.id)
  await immutableUpload(admin, `${path}/record.json`, created)
  return created
}

export async function updateCustomVoice(admin: StorageClient, expected: CustomVoiceRow, next: CustomVoiceRow): Promise<CustomVoiceRow> {
  const path = prefix(expected.user_id || '', expected.id)
  validate(expected, expected.user_id || '', expected.id)
  if (revision(expected) >= MAX_REVISIONS || object(expected.physical_layers).registrationDeleted === true) {
    throw new Error('registration_conflict')
  }
  const updated = { ...next, physical_layers: signedCustomVoiceLayers(next, {
    ...object(next.physical_layers), registrationRevision: revision(expected) + 1,
  }) }
  validate(updated, expected.user_id || '', expected.id)
  // The immutable predecessor key is the compare-and-swap. Only one request can
  // create it. The transition itself is authoritative, even if the caller dies
  // before receiving its response; record.json is never overwritten.
  await immutableUpload(admin, `${path}/versions/${signature(expected)}.json`, updated)
  return updated
}

export async function deleteCustomVoice(admin: StorageClient, row: CustomVoiceRow): Promise<void> {
  await updateCustomVoice(admin, row, { ...row, physical_layers: {
    ...object(row.physical_layers), registrationDeleted: true,
  } })
}
