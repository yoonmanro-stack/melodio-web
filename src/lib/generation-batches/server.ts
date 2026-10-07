import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  buildGenerationBatchTracklist, GenerationBatchError, parseGenerationBatchInput,
  type GenerationBatchInput, type GenerationBatchOutputRow, type GenerationBatchRow,
} from './model'

// channel-builder is admitted only from the API's authenticated queue lookup;
// the generate route rejects a client-supplied batch for that menu.
const BATCH_SOURCE_MENUS = new Set(['style-library', 'preset-studio', 'audio-forge', 'audio', 'japan', 'channel-builder'])
const BATCH_COLUMNS = 'id,user_id,input_count,source_menu,created_at,selection_revision,selected_generation_ids'

function databaseError(error: { code?: string }): never {
  if (error.code === '23505' || error.code === '40001') {
    throw new GenerationBatchError('batch_conflict', '이미 접수되었거나 다른 화면에서 변경된 생성 묶음입니다. 새로고침 후 확인해 주세요.', 409)
  }
  if (error.code === '22023') throw new GenerationBatchError('invalid_batch', '생성 묶음 또는 선택한 곡을 확인해 주세요.', 400)
  if (error.code === 'P0002') throw new GenerationBatchError('batch_not_found', '생성 묶음을 찾을 수 없습니다.', 404)
  if (error.code === '42501') throw new GenerationBatchError('batch_forbidden', '생성 묶음에 접근할 수 없습니다.', 403)
  throw new GenerationBatchError('batch_unavailable', '생성 묶음 저장소를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', 503)
}

/** Call with the authenticated user ID and service client, before ANY paid call.
 * Admission is durable and one-shot. A failed/ambiguous provider call does not
 * release its claim: retrying must never silently charge for a duplicate input.
 */
export async function ensureGenerationBatch(
  admin: SupabaseClient,
  userId: string,
  input: GenerationBatchInput,
  sourceMenu: string,
): Promise<{ generation_batch_id: string; generation_batch_index: number; generation_candidate_slot: 'A' }> {
  const parsed = parseGenerationBatchInput(input)
  if (!userId) throw new GenerationBatchError('authentication_required', '로그인이 필요합니다.', 401)
  if (!parsed || !BATCH_SOURCE_MENUS.has(sourceMenu)) {
    throw new GenerationBatchError('invalid_batch', '일반 음악 생성에서만 생성 묶음을 사용할 수 있습니다.', 400)
  }
  const { error } = await admin.rpc('claim_generation_batch_track', {
    p_batch_id: parsed.id, p_user_id: userId, p_input_count: parsed.inputCount,
    p_source_menu: sourceMenu, p_track_index: parsed.trackIndex,
  })
  if (error) databaseError(error)
  return { generation_batch_id: parsed.id, generation_batch_index: parsed.trackIndex, generation_candidate_slot: 'A' }
}

async function authenticatedClient() {
  const client = await createClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new GenerationBatchError('authentication_required', '로그인이 필요합니다.', 401)
  // The migration is versioned independently of the hand-maintained Database type.
  return { client: client as unknown as SupabaseClient, userId: data.user.id }
}

async function readTracklist(client: SupabaseClient, userId: string, batchId: string) {
  const { data: batch, error } = await client.from('generation_batches')
    .select(BATCH_COLUMNS).eq('id', batchId).eq('user_id', userId).maybeSingle()
  if (error) databaseError(error)
  if (!batch) throw new GenerationBatchError('batch_not_found', '생성 묶음을 찾을 수 없습니다.', 404)
  const { data: rows, error: outputError } = await client.rpc('read_generation_batch_outputs', { p_batch_id: batchId })
  if (outputError) databaseError(outputError)
  return buildGenerationBatchTracklist(batch as GenerationBatchRow, (rows ?? []) as GenerationBatchOutputRow[])
}

export async function getGenerationBatchTracklist(batchId: string) {
  const { client, userId } = await authenticatedClient()
  return readTracklist(client, userId, batchId)
}

export async function saveGenerationBatchSelection(batchId: string, input: { expectedRevision: number; selectedGenerationIds: string[] }) {
  const { client, userId } = await authenticatedClient()
  const current = await readTracklist(client, userId, batchId)
  if (!current.eligible) throw new GenerationBatchError('batch_not_ready', '완료된 A/B 음원이 모두 준비된 뒤 선택할 수 있습니다.', 409)
  const { error } = await client.rpc('save_generation_batch_selection', {
    p_batch_id: batchId, p_expected_revision: input.expectedRevision, p_selected_generation_ids: input.selectedGenerationIds,
  })
  if (error) databaseError(error)
  return readTracklist(client, userId, batchId)
}

export function generationBatchErrorResponse(error: unknown): { status: number; payload: { success: false; error: string; code: string } } {
  if (error instanceof GenerationBatchError) {
    return { status: error.status, payload: { success: false, error: error.message, code: error.code } }
  }
  if (error instanceof SyntaxError) {
    return { status: 400, payload: { success: false, error: '요청 형식을 확인해 주세요.', code: 'invalid_json' } }
  }
  return { status: 503, payload: { success: false, error: '생성 묶음을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', code: 'batch_unavailable' } }
}
