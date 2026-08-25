import { PlaylistInputError } from './playlist-input'

export class PlaylistAuthenticationError extends Error {
  constructor() {
    super('로그인이 필요합니다.')
    this.name = 'PlaylistAuthenticationError'
  }
}

export class PlaylistNotFoundError extends Error {
  constructor(message = '플레이리스트 또는 곡을 찾을 수 없습니다.') {
    super(message)
    this.name = 'PlaylistNotFoundError'
  }
}

export class PlaylistConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaylistConflictError'
  }
}

export class PlaylistPersistenceError extends Error {
  constructor(message: string, readonly causeCode?: string) {
    super(message)
    this.name = 'PlaylistPersistenceError'
  }
}

export interface PlaylistErrorPayload {
  error: string
  code: 'AUTH_REQUIRED' | 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'PERSISTENCE_ERROR'
  field?: string
}

export function mapPlaylistError(error: unknown): {
  status: number
  payload: PlaylistErrorPayload
} {
  if (error instanceof SyntaxError) {
    return {
      status: 400,
      payload: { error: '올바른 JSON 요청 본문이 필요합니다.', code: 'INVALID_INPUT' },
    }
  }
  if (error instanceof PlaylistAuthenticationError) {
    return { status: 401, payload: { error: error.message, code: 'AUTH_REQUIRED' } }
  }
  if (error instanceof PlaylistInputError) {
    return {
      status: 400,
      payload: { error: error.message, code: 'INVALID_INPUT', field: error.field },
    }
  }
  if (error instanceof PlaylistNotFoundError) {
    return { status: 404, payload: { error: error.message, code: 'NOT_FOUND' } }
  }
  if (error instanceof PlaylistConflictError) {
    return { status: 409, payload: { error: error.message, code: 'CONFLICT' } }
  }
  if (error instanceof PlaylistPersistenceError) {
    console.error('[Playlists] Persistence error', {
      code: error.causeCode,
      message: error.message,
    })
    return {
      status: 500,
      payload: {
        error: '플레이리스트를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
        code: 'PERSISTENCE_ERROR',
      },
    }
  }
  console.error('[Playlists] Unexpected error', error)
  return {
    status: 500,
    payload: { error: '플레이리스트 처리 중 오류가 발생했습니다.', code: 'PERSISTENCE_ERROR' },
  }
}
