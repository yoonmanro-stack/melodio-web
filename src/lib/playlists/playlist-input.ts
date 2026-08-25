export class PlaylistInputError extends Error {
  readonly field?: string

  constructor(message: string, field?: string) {
    super(message)
    this.name = 'PlaylistInputError'
    this.field = field
  }
}

type UnknownRecord = Record<string, unknown>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function record(value: unknown, field = 'body'): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlaylistInputError('객체 형식의 요청이 필요합니다.', field)
  }
  return value as UnknownRecord
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PlaylistInputError('값이 필요합니다.', field)
  }
  const text = value.trim()
  if (text.length > max) {
    throw new PlaylistInputError(`${max}자 이하여야 합니다.`, field)
  }
  return text
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') {
    throw new PlaylistInputError('문자열이어야 합니다.', field)
  }
  const text = value.trim()
  if (text.length > max) {
    throw new PlaylistInputError(`${max}자 이하여야 합니다.`, field)
  }
  return text
}

function requiredTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw new PlaylistInputError('올바른 ISO 날짜가 필요합니다.', field)
  }
  return value
}

export function parsePlaylistUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new PlaylistInputError('올바른 UUID가 필요합니다.', field)
  }
  return value
}

export function parseCreatePlaylist(value: unknown): {
  name: string
  description: string
} {
  const input = record(value)
  return {
    name: requiredText(input.name, 'name', 80),
    description: optionalText(input.description, 'description', 500),
  }
}

export function parseUpdatePlaylist(value: unknown): {
  name?: string
  description?: string
} {
  const input = record(value)
  const result: { name?: string; description?: string } = {}

  if (input.name !== undefined) {
    result.name = requiredText(input.name, 'name', 80)
  }
  if (input.description !== undefined) {
    result.description = optionalText(input.description, 'description', 500)
  }
  if (result.name === undefined && result.description === undefined) {
    throw new PlaylistInputError('변경할 이름 또는 설명이 필요합니다.', 'body')
  }
  return result
}

export function parseAddPlaylistTrack(value: unknown): { generationId: string } {
  const input = record(value)
  return {
    generationId: parsePlaylistUuid(input.generationId, 'generationId'),
  }
}

export function parseRemovePlaylistTrack(value: unknown): { itemId: string } {
  const input = record(value)
  return {
    itemId: parsePlaylistUuid(input.itemId, 'itemId'),
  }
}

export function parseReorderPlaylistTracks(value: unknown): {
  itemIds: string[]
  expectedUpdatedAt: string
} {
  const input = record(value)
  if (!Array.isArray(input.itemIds) || input.itemIds.length === 0 || input.itemIds.length > 500) {
    throw new PlaylistInputError('1~500개의 곡 ID 배열이 필요합니다.', 'itemIds')
  }

  const itemIds = input.itemIds.map((item, index) =>
    parsePlaylistUuid(item, `itemIds.${index}`),
  )
  if (new Set(itemIds).size !== itemIds.length) {
    throw new PlaylistInputError('중복되지 않은 곡 ID가 필요합니다.', 'itemIds')
  }
  return {
    itemIds,
    expectedUpdatedAt: requiredTimestamp(input.expectedUpdatedAt, 'expectedUpdatedAt'),
  }
}
