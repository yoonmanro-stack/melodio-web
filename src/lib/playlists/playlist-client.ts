import type {
  LibraryPlaylist,
  PlaylistApiResponse,
  PlaylistMutationResult,
} from '@/types/library-playlist'

export class PlaylistClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'PlaylistClientError'
  }
}

async function playlistRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  })

  let payload: PlaylistApiResponse<T> | null = null
  try {
    payload = await response.json() as PlaylistApiResponse<T>
  } catch {
    // Non-JSON proxy or platform errors are mapped below.
  }

  if (!response.ok || !payload?.success || payload.data === undefined) {
    throw new PlaylistClientError(
      payload?.error || '플레이리스트 요청을 완료하지 못했습니다.',
      response.status,
      payload?.code,
    )
  }
  return payload.data
}

export function fetchPlaylistLibrary(): Promise<LibraryPlaylist[]> {
  return playlistRequest<LibraryPlaylist[]>('/api/playlists', { cache: 'no-store' })
}

export function createLibraryPlaylist(input: {
  name: string
  description?: string
}): Promise<LibraryPlaylist> {
  return playlistRequest<LibraryPlaylist>('/api/playlists', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateLibraryPlaylist(
  playlistId: string,
  input: { name?: string; description?: string },
): Promise<LibraryPlaylist> {
  return playlistRequest<LibraryPlaylist>(`/api/playlists/${playlistId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteLibraryPlaylist(playlistId: string): Promise<void> {
  const response = await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' })
  const payload = await response.json().catch(() => null) as PlaylistApiResponse<never> | null
  if (!response.ok || !payload?.success) {
    throw new PlaylistClientError(
      payload?.error || '플레이리스트를 삭제하지 못했습니다.',
      response.status,
      payload?.code,
    )
  }
}

export function addTrackToLibraryPlaylist(
  playlistId: string,
  generationId: string,
): Promise<PlaylistMutationResult> {
  return playlistRequest<PlaylistMutationResult>(`/api/playlists/${playlistId}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ generationId }),
  })
}

export function removeTrackFromLibraryPlaylist(
  playlistId: string,
  itemId: string,
): Promise<PlaylistMutationResult> {
  return playlistRequest<PlaylistMutationResult>(`/api/playlists/${playlistId}/tracks`, {
    method: 'DELETE',
    body: JSON.stringify({ itemId }),
  })
}

export function reorderLibraryPlaylistTracks(
  playlistId: string,
  itemIds: string[],
  expectedUpdatedAt: string,
): Promise<PlaylistMutationResult> {
  return playlistRequest<PlaylistMutationResult>(`/api/playlists/${playlistId}/tracks`, {
    method: 'PATCH',
    body: JSON.stringify({ itemIds, expectedUpdatedAt }),
  })
}
