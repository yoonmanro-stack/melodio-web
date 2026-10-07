/** Ordinary music batch identity; never inferred from titles or creation times. */
export type GenerationBatchInput = { id: string; trackIndex: number; inputCount: number }
export type GenerationCandidateSlot = 'A' | 'B'
export type GenerationBatchCandidate = {
  id: string
  trackIndex: number
  slot: GenerationCandidateSlot
  title: string
  audioUrl: string
  coverArtUrl: string | null
  durationSeconds: number | null
}
export type GenerationBatchPreview = {
  rows: { generationId: string; title: string; startSeconds: number | null; timestamp: string | null; durationSeconds: number | null }[]
  durationSeconds: number | null
  timelineComplete: boolean
  tracklistText: string
  renderVerified: false
}
export type GenerationBatchTracklist = {
  id: string
  inputCount: number
  sourceMenu: string
  createdAt: string
  selectionRevision: number
  completedOutputCount: number
  expectedOutputCount: number
  eligible: boolean
  ineligibilityReason: 'waiting_for_outputs' | 'invalid_pairing' | 'insufficient_outputs' | null
  pairs: { trackIndex: number; a: GenerationBatchCandidate | null; b: GenerationBatchCandidate | null }[]
  selectedGenerationIds: string[]
  selectionSource: 'default_a' | 'saved'
  preview: GenerationBatchPreview
}
export type GenerationBatchRow = {
  id: string
  user_id: string
  input_count: number
  source_menu: string
  created_at: string
  selection_revision: number
  selected_generation_ids: string[] | null
}
/** Scalar projection only: license_hash and other provider metadata stay in SQL. */
export type GenerationBatchOutputRow = {
  id: string
  generation_batch_index: number
  generation_candidate_slot: string
  title: string
  status: string
  audio_url: string | null
  cover_art_url: string | null
  actual_duration_seconds: number | string | null
  provider_clip_key: string | null
}

export class GenerationBatchError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message)
    this.name = 'GenerationBatchError'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function parseGenerationBatchId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new GenerationBatchError('invalid_batch', '생성 묶음 식별자가 올바르지 않습니다.', 400)
  }
  return value.toLowerCase()
}

export function parseGenerationBatchInput(value: unknown): GenerationBatchInput | null {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GenerationBatchError('invalid_batch', '생성 묶음 정보가 올바르지 않습니다.', 400)
  }
  const input = value as Record<string, unknown>
  const id = parseGenerationBatchId(input.id)
  if (!Number.isInteger(input.inputCount) || (input.inputCount as number) < 1 || (input.inputCount as number) > 40
      || !Number.isInteger(input.trackIndex) || (input.trackIndex as number) < 0 || (input.trackIndex as number) >= (input.inputCount as number)) {
    throw new GenerationBatchError('invalid_batch', '생성 묶음의 곡 수 또는 순서가 올바르지 않습니다.', 400)
  }
  return { id, inputCount: input.inputCount as number, trackIndex: input.trackIndex as number }
}

export function parseGenerationBatchSelection(value: unknown): { expectedRevision: number; selectedGenerationIds: string[] } {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  if (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 0
      || !Array.isArray(input.selectedGenerationIds) || input.selectedGenerationIds.length < 1 || input.selectedGenerationIds.length > 40) {
    throw new GenerationBatchError('invalid_selection', '곡 선택 정보가 올바르지 않습니다.', 400)
  }
  const selectedGenerationIds = input.selectedGenerationIds.map(parseGenerationBatchId)
  if (new Set(selectedGenerationIds).size !== selectedGenerationIds.length) {
    throw new GenerationBatchError('invalid_selection', '같은 곡을 중복으로 선택할 수 없습니다.', 400)
  }
  return { expectedRevision: input.expectedRevision as number, selectedGenerationIds }
}

function playableUrl(value: string | null): string | null {
  if (!value || value.length > 8192) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : null
  } catch { return null }
}

function audioIdentity(value: string): string {
  const url = new URL(value)
  // Signed URL rotation cannot make the same stored/provider audio a new output.
  return `${url.origin}${url.pathname}`
}

function timestamp(seconds: number): string {
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const remainder = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function buildGenerationBatchPreview(tracks: GenerationBatchCandidate[]): GenerationBatchPreview {
  let elapsed: number | null = 0
  const rows = tracks.map(track => {
    const startSeconds = elapsed
    const row = { generationId: track.id, title: track.title, durationSeconds: track.durationSeconds,
      startSeconds, timestamp: startSeconds === null ? null : timestamp(startSeconds) }
    // The SQL scalar projection preserves up to nine fractional digits. Retain
    // those digits while avoiding binary addition making 2002 become 2001.999….
    elapsed = elapsed === null || track.durationSeconds === null ? null : Number((elapsed + track.durationSeconds).toFixed(9))
    return row
  })
  return {
    rows, durationSeconds: elapsed, timelineComplete: elapsed !== null,
    tracklistText: rows.map(row => `${row.timestamp ?? '--:--'} ${row.title}`).join('\n'),
    renderVerified: false,
  }
}

export function buildGenerationBatchTracklist(batch: GenerationBatchRow, rows: GenerationBatchOutputRow[]): GenerationBatchTracklist {
  const pairs: GenerationBatchTracklist['pairs'] = Array.from({ length: batch.input_count }, (_, trackIndex) => ({ trackIndex, a: null, b: null }))
  const ids = new Set<string>(), audioIds = new Set<string>(), clipIds = new Set<string>()
  let invalidPairing = rows.length > batch.input_count * 2
  let completedOutputCount = 0
  for (const row of rows) {
    const index = row.generation_batch_index
    const slot = row.generation_candidate_slot
    if (!Number.isInteger(index) || index < 0 || index >= batch.input_count || (slot !== 'A' && slot !== 'B')) {
      invalidPairing = true
      continue
    }
    const key = slot === 'A' ? 'a' : 'b'
    const audioUrl = playableUrl(row.audio_url)
    if (row.status !== 'completed' || !audioUrl) continue
    const audioId = audioIdentity(audioUrl)
    const clipId = row.provider_clip_key?.trim() || null
    if (ids.has(row.id) || audioIds.has(audioId) || (clipId !== null && clipIds.has(clipId)) || pairs[index][key]) {
      invalidPairing = true
      continue
    }
    ids.add(row.id); audioIds.add(audioId)
    if (clipId) clipIds.add(clipId)
    const actualDuration = row.actual_duration_seconds === null ? NaN : Number(row.actual_duration_seconds)
    pairs[index][key] = {
      id: row.id, trackIndex: index, slot, title: row.title || 'Untitled Track', audioUrl,
      coverArtUrl: playableUrl(row.cover_art_url),
      durationSeconds: Number.isFinite(actualDuration) && actualDuration > 0 ? actualDuration : null,
    }
    completedOutputCount++
  }
  const allPairsComplete = pairs.every(pair => pair.a && pair.b)
  const ineligibilityReason = invalidPairing ? 'invalid_pairing' : !allPairsComplete ? 'waiting_for_outputs'
    : completedOutputCount < 20 ? 'insufficient_outputs' : null
  const eligible = ineligibilityReason === null
  const byId = new Map(pairs.flatMap(pair => [pair.a, pair.b]).filter((candidate): candidate is GenerationBatchCandidate => candidate !== null).map(candidate => [candidate.id, candidate]))
  const saved = batch.selected_generation_ids?.map(id => byId.get(id))
  const savedValid = saved?.length === batch.input_count && saved.every(Boolean)
    && new Set(saved.map(candidate => candidate!.trackIndex)).size === batch.input_count
  const selected = !eligible ? [] : savedValid ? saved as GenerationBatchCandidate[] : pairs.map(pair => pair.a!)
  return {
    id: batch.id, inputCount: batch.input_count, sourceMenu: batch.source_menu, createdAt: batch.created_at,
    selectionRevision: batch.selection_revision, completedOutputCount, expectedOutputCount: batch.input_count * 2,
    eligible, ineligibilityReason, pairs,
    selectedGenerationIds: selected.map(candidate => candidate.id), selectionSource: savedValid ? 'saved' : 'default_a',
    preview: buildGenerationBatchPreview(selected),
  }
}
