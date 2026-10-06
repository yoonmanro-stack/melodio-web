import { canonicalPresetId, PUBLIC_PRESET_ALIASES } from './preset-catalog'

export type PresetSampleSourceMenu = 'japan' | 'preset-studio'
/** true requires an instrumental; false permits either mode for an ordinary preset. */
export type PresetSampleRequest = { id: string; isInstrumental: boolean }
export type PresetSample = {
  id: string
  title: string
  audioUrl: string
  duration: number | null
  createdAt: string
  isInstrumental: boolean
}
export type PresetSampleResponse = {
  samples: Record<string, PresetSample | null>
  errors: Record<string, 'query_failed' | 'scan_limit'>
}
export type PresetSampleRow = {
  id?: unknown
  title?: unknown
  status?: unknown
  is_public?: unknown
  is_stem_extracted?: unknown
  audio_url?: unknown
  source_audio_url?: unknown
  license_hash?: unknown
  created_at?: unknown
}

export const MAX_PRESET_SAMPLE_REQUESTS = 24
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
// These are the media hosts already allowed by worker/generated-audio-storage.js.
const MEDIA_HOSTS = ['file.302.ai', 'suno.ai', '*.suno.ai', 'suno.com', '*.suno.com',
  'kie.ai', '*.kie.ai', 'd22p6zz7asihrw.cloudfront.net', 'cdn2.suno.show', 'tempfile.aiquickdraw.com']
const NON_SONG_FLAGS = ['isViral', 'isViralTrack', 'isPreview', 'previewOnly', 'isSample', 'sampleOnly',
  'isTest', 'is_test', 'testOnly', 'test_only', 'testMode', 'isStem', 'stemOnly', 'externalStemUpload']

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

export function parsePresetSampleRequests(value: string | null): PresetSampleRequest[] | null {
  if (!value || value.length > 8_192) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_PRESET_SAMPLE_REQUESTS) return null
    const seen = new Set<string>()
    const requests: PresetSampleRequest[] = []
    for (const entry of parsed) {
      const request = object(entry)
      if (!request || typeof request.id !== 'string' || !SAFE_ID.test(request.id)
        || typeof request.isInstrumental !== 'boolean' || seen.has(request.id)) return null
      seen.add(request.id)
      requests.push({ id: request.id, isInstrumental: request.isInstrumental })
    }
    return requests
  } catch { return null }
}

export function presetSampleAliases(id: string): string[] {
  const canonical = canonicalPresetId(id)
  return [canonical, ...Object.keys(PUBLIC_PRESET_ALIASES).filter(alias => canonicalPresetId(alias) === canonical)]
}

export function presetSampleSourceMenus(sourceMenu: PresetSampleSourceMenu): readonly string[] {
  return sourceMenu === 'japan' ? ['japan'] : ['preset-studio', 'audio-forge', 'audio-forge-pro']
}

function quotedLike(pattern: string): string {
  // PostgREST quoted values preserve embedded JSON quotes and LIKE escapes.
  return `"${pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Broad text candidates only; parsed metadata is the authority for every row. */
export function presetSampleCandidateFilter(id: string, sourceMenu?: PresetSampleSourceMenu): string {
  const presets = presetSampleAliases(id).map(alias => {
    const literal = alias.replace(/_/g, '\\_')
    const pattern = `%"presetId"%"${literal}"%`
    return `license_hash.like.${quotedLike(pattern)}`
  }).join(',')
  if (!sourceMenu) return presets
  const sources = presetSampleSourceMenus(sourceMenu)
    .map(menu => `license_hash.like.${quotedLike(`%"sourceMenu"%"${menu}"%`)}`).join(',')
  return `and(or(${presets}),or(${sources}))`
}

function metadata(row: PresetSampleRow): Record<string, unknown> | null {
  if (typeof row.license_hash !== 'string' || row.license_hash.length > 65_536) return null
  try { return object(JSON.parse(row.license_hash)) } catch { return null }
}

function seconds(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function measuredDuration(meta: Record<string, unknown>): number | null {
  const policy = object(meta.naturalSongPolicy)
  if (policy && Array.isArray(policy.candidates)) {
    const selected = policy.candidates.map(object).find(candidate => candidate?.index === policy.selectedCandidateIndex)
    const measured = seconds(selected?.durationSeconds)
    if (measured !== null) return measured
  }
  return seconds(meta.duration) ?? seconds(meta.durationSeconds)
}

function hasExpiredSignature(url: URL, now: number): boolean {
  for (const name of ['Expires', 'expires', 'exp']) {
    const value = url.searchParams.get(name)
    if (value !== null) {
      const expiry = Number(value)
      if (!Number.isFinite(expiry) || expiry <= 0 || expiry * 1_000 <= now) return true
    }
  }
  for (const prefix of ['X-Amz', 'X-Goog']) {
    const rawDate = url.searchParams.get(`${prefix}-Date`)
    const rawSeconds = url.searchParams.get(`${prefix}-Expires`)
    if (rawDate !== null || rawSeconds !== null) {
      const match = rawDate?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
      const lifetime = Number(rawSeconds)
      if (!match || !Number.isFinite(lifetime) || lifetime <= 0) return true
      const start = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`)
      if (!Number.isFinite(start) || start + lifetime * 1_000 <= now) return true
    }
  }
  return false
}

/** No fetches: accept known public audio storage or existing provider media hosts. */
export function safePresetSampleAudioUrl(value: unknown, supabaseUrl: string, now = Date.now()): string | null {
  if (typeof value !== 'string' || value.length > 2_048 || value.trim() !== value) return null
  try {
    const own = new URL(supabaseUrl)
    const url = new URL(value)
    if (url.protocol !== 'https:' || own.protocol !== 'https:' || url.username || url.password || url.hash
      || (url.port && url.port !== '443') || hasExpiredSignature(url, now)) return null
    const path = decodeURIComponent(url.pathname)
    if (/(?:^|\/)(?:stems?|previews?|voices?|voice[-_]samples?|test)(?:\/|$)/i.test(path)) return null
    if (url.origin === own.origin) {
      return path.startsWith('/storage/v1/object/public/melodio-assets/')
        && /\.(?:mp3|aac|wav|m4a|ogg|flac)$/i.test(path) ? url.href : null
    }
    const host = url.hostname.toLowerCase()
    return MEDIA_HOSTS.some(rule => rule.startsWith('*.') ? host.endsWith(`.${rule.slice(2)}`) : host === rule)
      ? url.href : null
  } catch { return null }
}

function sampleAudioUrl(row: PresetSampleRow, meta: Record<string, unknown>, supabaseUrl: string, now: number): string | null {
  const persistence = object(meta.audioPersistence)
  const selected = persistence?.status === 'ready' && persistence.generationId === row.id
    && Array.isArray(persistence.clips)
    ? persistence.clips.map(object).find(clip => clip?.clipKey === persistence.selectedClipKey && clip?.status === 'ready') : null
  const candidates = [row.audio_url, row.source_audio_url, selected?.audioUrl]
    .map(value => safePresetSampleAudioUrl(value, supabaseUrl, now)).filter((value): value is string => value !== null)
  const ownOrigin = new URL(supabaseUrl).origin
  return candidates.find(value => {
    const url = new URL(value)
    return url.origin === ownOrigin && !url.search
  }) ?? candidates[0] ?? null
}

export function selectPresetSample(
  rows: readonly PresetSampleRow[], request: PresetSampleRequest, sourceMenu: PresetSampleSourceMenu,
  supabaseUrl: string, now = Date.now(),
): PresetSample | null {
  const exactPresetId = canonicalPresetId(request.id)
  let newest: PresetSample | null = null
  for (const row of rows) {
    if (row.status !== 'completed' || row.is_public !== true
      || typeof row.id !== 'string' || !SAFE_ID.test(row.id)
      || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) continue
    const meta = metadata(row)
    if (!meta || meta.isPublic === false || !presetSampleSourceMenus(sourceMenu).includes(String(meta.sourceMenu))
      || typeof meta.presetId !== 'string' || canonicalPresetId(meta.presetId) !== exactPresetId
      || typeof meta.isInstrumental !== 'boolean' || (request.isInstrumental && !meta.isInstrumental)
      || NON_SONG_FLAGS.some(flag => meta[flag] === true)
      || meta.requestedDurationSource === 'short-form-request' || meta.requestedDurationMode === 'short-form'
      || meta.petEpisode != null || meta.storyPlan != null
      || ['preview', 'sample', 'stem', 'test', 'viral', 'short-form'].includes(String(meta.kind ?? meta.type ?? ''))) continue
    const duration = measuredDuration(meta)
    if (duration !== null && duration < 120) continue
    const audioUrl = sampleAudioUrl(row, meta, supabaseUrl, now)
    if (!audioUrl) continue
    const sample: PresetSample = {
      id: row.id,
      title: typeof row.title === 'string' && row.title.trim() ? row.title.trim().slice(0, 200) : '제목 없는 곡',
      audioUrl, duration, createdAt: row.created_at, isInstrumental: meta.isInstrumental,
    }
    if (!newest || Date.parse(sample.createdAt) > Date.parse(newest.createdAt)
      || (Date.parse(sample.createdAt) === Date.parse(newest.createdAt) && sample.id > newest.id)) newest = sample
  }
  return newest
}
