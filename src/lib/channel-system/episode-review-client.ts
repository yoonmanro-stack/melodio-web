import type { TrackBlueprint } from '../../types'
import type { ChannelBuilderErrorPayload } from './channel-builder-errors'
import { ChannelBuilderApiError } from './channel-builder-client'
import type { TrackReviewUpdate } from './episode-review-input'
import type {
  ApprovedEpisodeBlueprint,
  EpisodeReviewContext,
} from './episode-review-service'

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
      : { error: 'Episode Review 요청에 실패했습니다.', code: 'PERSISTENCE_ERROR' as const }
    throw new ChannelBuilderApiError(response.status, details)
  }
  return body.data
}

function baseUrl(channelId: string, episodeId: string) {
  return `/api/channel-builder/${encodeURIComponent(channelId)}/episodes/${encodeURIComponent(episodeId)}`
}

export function getEpisodeReview(channelId: string, episodeId: string, signal?: AbortSignal) {
  return request<EpisodeReviewContext>(`${baseUrl(channelId, episodeId)}/review`, { signal })
}

export function updateReviewedTrack(
  channelId: string,
  episodeId: string,
  trackId: string,
  update: TrackReviewUpdate,
) {
  return request<TrackBlueprint>(
    `${baseUrl(channelId, episodeId)}/tracks/${encodeURIComponent(trackId)}`,
    { method: 'PATCH', body: JSON.stringify(update) },
  )
}

export function regenerateReviewedTrackTitle(channelId: string, episodeId: string, trackId: string) {
  return request<TrackBlueprint>(
    `${baseUrl(channelId, episodeId)}/tracks/${encodeURIComponent(trackId)}/regenerate-title`,
    { method: 'POST' },
  )
}

export function approveEpisodeBlueprint(channelId: string, episodeId: string) {
  return request<ApprovedEpisodeBlueprint>(`${baseUrl(channelId, episodeId)}/approve`, { method: 'POST' })
}
