import {
  ChannelDnaMutationError,
  ChannelSystemAuthenticationError,
  ChannelSystemPersistenceError,
} from './channel-builder-service'
import { ChannelBuilderInputError } from './channel-builder-input'
import { EpisodeTitleConflictError } from './episode-blueprint-service'

export interface ChannelBuilderErrorPayload {
  error: string
  code: 'AUTH_REQUIRED' | 'INVALID_INPUT' | 'DNA_LOCK_VIOLATION' | 'TITLE_CONFLICT' | 'PERSISTENCE_ERROR'
  field?: string
  issues?: ChannelDnaMutationError['issues']
  titleIssues?: EpisodeTitleConflictError['issues']
}

export function mapChannelBuilderError(error: unknown): {
  status: number
  payload: ChannelBuilderErrorPayload
} {
  if (error instanceof SyntaxError) {
    return {
      status: 400,
      payload: { error: '올바른 JSON 요청 본문이 필요합니다.', code: 'INVALID_INPUT' },
    }
  }
  if (error instanceof ChannelSystemAuthenticationError) {
    return { status: 401, payload: { error: error.message, code: 'AUTH_REQUIRED' } }
  }
  if (error instanceof ChannelBuilderInputError) {
    return {
      status: 400,
      payload: { error: error.message, code: 'INVALID_INPUT', field: error.field },
    }
  }
  if (error instanceof ChannelDnaMutationError) {
    return {
      status: 409,
      payload: { error: error.message, code: 'DNA_LOCK_VIOLATION', issues: error.issues },
    }
  }
  if (error instanceof EpisodeTitleConflictError) {
    return {
      status: 409,
      payload: { error: error.message, code: 'TITLE_CONFLICT', titleIssues: error.issues },
    }
  }
  if (error instanceof ChannelSystemPersistenceError) {
    return { status: 500, payload: { error: error.message, code: 'PERSISTENCE_ERROR' } }
  }
  return {
    status: 500,
    payload: { error: 'Channel Builder 처리 중 오류가 발생했습니다.', code: 'PERSISTENCE_ERROR' },
  }
}
