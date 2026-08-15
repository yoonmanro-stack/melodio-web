import type { ChannelBuilderErrorPayload } from './channel-builder-errors'
import { ChannelBuilderApiError } from './channel-builder-client'
import type {
  GenerationQueueContext,
  GenerationQueueItem,
} from './generation-queue-service'

interface Success<T> { success: true; data: T }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json() as Success<T> | ChannelBuilderErrorPayload
  if (!response.ok || !('success' in body)) {
    const details = 'error' in body
      ? body
      : { error: 'Generation Queue 요청에 실패했습니다.', code: 'PERSISTENCE_ERROR' as const }
    throw new ChannelBuilderApiError(response.status, details)
  }
  return body.data
}

function baseUrl(channelId: string, episodeId: string) {
  return `/api/channel-builder/${encodeURIComponent(channelId)}/episodes/${encodeURIComponent(episodeId)}/generation-queue`
}

export function getGenerationQueue(channelId: string, episodeId: string, signal?: AbortSignal) {
  return request<GenerationQueueContext>(baseUrl(channelId, episodeId), { signal })
}

export function prepareGenerationQueue(channelId: string, episodeId: string) {
  return request<GenerationQueueContext>(baseUrl(channelId, episodeId), { method: 'POST' })
}

export function compileGenerationQueueLyrics(
  channelId: string,
  episodeId: string,
  itemId: string,
) {
  return request<GenerationQueueItem>(
    `${baseUrl(channelId, episodeId)}/items/${encodeURIComponent(itemId)}/compile-lyrics`,
    { method: 'POST' },
  )
}

export async function submitGenerationQueueItem(item: GenerationQueueItem) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queueItemId: item.id,
      title: item.title,
      stylePrompt: item.stylePrompt,
      excludePrompt: item.excludePrompt,
      lyricsPrompt: item.lyricsPrompt,
      lyricsSections: item.lyricsSections,
      engine: 'suno_v5',
      sunoVersion: item.model,
      isInstrumental: item.isInstrumental,
      sourceMenu: 'channel-builder',
      isPublic: false,
      metadata: { primaryGenre: '', subGenre: '', bpm: '', mood: '' },
    }),
  })
  const body = await response.json() as { error?: string }
  if (!response.ok) throw new Error(body.error || 'Suno 제출에 실패했습니다.')
}

export function selectGenerationQueueMaster(
  channelId: string,
  episodeId: string,
  itemId: string,
  candidateId: string,
) {
  return request<GenerationQueueItem>(
    `${baseUrl(channelId, episodeId)}/items/${encodeURIComponent(itemId)}/select-master`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    },
  )
}
