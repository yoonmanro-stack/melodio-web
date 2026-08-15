import type { ChannelDna, ListenerIntentProfile } from '../../types'
import type { LegacyPresetChannelDraft } from './legacy-adapters'
import type { ChannelBuilderErrorPayload } from './channel-builder-errors'

export interface SavedChannelDraftResponse {
  channelId: string
  dnaVersionId: string
  dnaVersion: number
  listenerIntentProfileId: string
}

export interface CreatedDnaVersionResponse {
  channelId: string
  dnaVersionId: string
  dnaVersion: number
}

export type ListenerIntentUpdateInput = Omit<
  ListenerIntentProfile,
  'id' | 'channelId' | 'createdAt' | 'updatedAt'
>

export class ChannelBuilderApiError extends Error {
  readonly status: number
  readonly details: ChannelBuilderErrorPayload

  constructor(status: number, details: ChannelBuilderErrorPayload) {
    super(details.error)
    this.name = 'ChannelBuilderApiError'
    this.status = status
    this.details = details
  }
}

interface SuccessResponse<T> {
  success: true
  data: T
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const body = await response.json() as SuccessResponse<T> | ChannelBuilderErrorPayload
  if (!response.ok || !('success' in body)) {
    const details = 'error' in body
      ? body
      : { error: 'Channel Builder 요청에 실패했습니다.', code: 'PERSISTENCE_ERROR' as const }
    throw new ChannelBuilderApiError(response.status, details)
  }
  return body.data
}

export function saveChannelDraft(
  draft: LegacyPresetChannelDraft,
  signal?: AbortSignal,
): Promise<SavedChannelDraftResponse> {
  return request('/api/channel-builder', {
    method: 'POST',
    body: JSON.stringify(draft),
    signal,
  })
}

export function createDnaVersion(
  channelId: string,
  dna: ChannelDna,
  changeSummary: string,
  signal?: AbortSignal,
): Promise<CreatedDnaVersionResponse> {
  return request(`/api/channel-builder/${encodeURIComponent(channelId)}/dna`, {
    method: 'POST',
    body: JSON.stringify({ dna, changeSummary }),
    signal,
  })
}

export function updateListenerIntent(
  channelId: string,
  profileId: string,
  listenerIntent: ListenerIntentUpdateInput,
  signal?: AbortSignal,
): Promise<ListenerIntentProfile> {
  return request(
    `/api/channel-builder/${encodeURIComponent(channelId)}/listener-intents/${encodeURIComponent(profileId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(listenerIntent),
      signal,
    },
  )
}
