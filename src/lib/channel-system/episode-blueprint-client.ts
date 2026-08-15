import type { ChannelBuilderErrorPayload } from './channel-builder-errors'
import { ChannelBuilderApiError } from './channel-builder-client'
import type { EpisodeBlueprintInput } from './episode-blueprint-input'
import type {
  EpisodeBuilderContext,
  SavedEpisodeBlueprint,
} from './episode-blueprint-service'

interface Success<T> { success: true; data: T }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })
  const body = await response.json() as Success<T> | ChannelBuilderErrorPayload
  if (!response.ok || !('success' in body)) {
    const details = 'error' in body
      ? body
      : { error: 'Episode Builder 요청에 실패했습니다.', code: 'PERSISTENCE_ERROR' as const }
    throw new ChannelBuilderApiError(response.status, details)
  }
  return body.data
}

export function getEpisodeBuilderContext(channelId: string, signal?: AbortSignal) {
  return request<EpisodeBuilderContext>(
    `/api/channel-builder/${encodeURIComponent(channelId)}/episode-context`,
    { signal },
  )
}

export function saveEpisodeBlueprint(
  channelId: string,
  input: EpisodeBlueprintInput,
  signal?: AbortSignal,
) {
  return request<SavedEpisodeBlueprint>(
    `/api/channel-builder/${encodeURIComponent(channelId)}/episodes`,
    { method: 'POST', body: JSON.stringify(input), signal },
  )
}
