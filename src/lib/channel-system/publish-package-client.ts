import type { ChannelBuilderErrorPayload } from './channel-builder-errors'
import { ChannelBuilderApiError } from './channel-builder-client'
import type { EpisodeCoverAsset, PublishPackageContext } from './publish-package-service'

interface Success<T> { success: true; data: T }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json() as Success<T> | ChannelBuilderErrorPayload
  if (!response.ok || !('success' in body)) {
    const details = 'error' in body ? body : { error: 'Publish Package 요청에 실패했습니다.', code: 'PERSISTENCE_ERROR' as const }
    throw new ChannelBuilderApiError(response.status, details)
  }
  return body.data
}

function url(channelId: string, episodeId: string) {
  return `/api/channel-builder/${encodeURIComponent(channelId)}/episodes/${encodeURIComponent(episodeId)}/publish-package`
}

export function getPublishPackage(channelId: string, episodeId: string, signal?: AbortSignal) {
  return request<PublishPackageContext>(url(channelId, episodeId), { signal })
}

export function createPublishPackage(channelId: string, episodeId: string) {
  return request<PublishPackageContext>(url(channelId, episodeId), { method: 'POST' })
}

export function updatePublishPackage(channelId: string, episodeId: string, body: {
  uploadTitle: string; description: string; tags: string[]; hashtags: string[]; coverPrompt: string
}) {
  return request<PublishPackageContext>(url(channelId, episodeId), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

export function generateEpisodeCover(channelId: string, episodeId: string) {
  return request<EpisodeCoverAsset>(`${url(channelId, episodeId)}/cover/generate`, { method: 'POST' })
}

export function selectEpisodeCover(channelId: string, episodeId: string, coverId: string) {
  return request<PublishPackageContext>(`${url(channelId, episodeId)}/cover/${encodeURIComponent(coverId)}/select`, { method: 'POST' })
}
