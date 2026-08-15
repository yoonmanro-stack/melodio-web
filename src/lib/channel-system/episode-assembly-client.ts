import type { ChannelBuilderErrorPayload } from './channel-builder-errors'
import { ChannelBuilderApiError } from './channel-builder-client'
import type { EpisodeAssemblyContext } from './episode-assembly-service'

interface Success<T> { success: true; data: T }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json() as Success<T> | ChannelBuilderErrorPayload
  if (!response.ok || !('success' in body)) {
    const details = 'error' in body
      ? body
      : { error: 'Episode Assembly 요청에 실패했습니다.', code: 'PERSISTENCE_ERROR' as const }
    throw new ChannelBuilderApiError(response.status, details)
  }
  return body.data
}

function url(channelId: string, episodeId: string) {
  return `/api/channel-builder/${encodeURIComponent(channelId)}/episodes/${encodeURIComponent(episodeId)}/assembly`
}

export function getEpisodeAssembly(channelId: string, episodeId: string, signal?: AbortSignal) {
  return request<EpisodeAssemblyContext>(url(channelId, episodeId), { signal })
}

export function createEpisodeAssembly(channelId: string, episodeId: string) {
  return request<EpisodeAssemblyContext>(url(channelId, episodeId), { method: 'POST' })
}

export function queueEpisodeAssembly(channelId: string, episodeId: string) {
  return request<EpisodeAssemblyContext>(`${url(channelId, episodeId)}/queue`, { method: 'POST' })
}
