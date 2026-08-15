import type { TrackBlueprint, TrackRole } from '../../types'
import { ChannelBuilderInputError } from './channel-builder-input'

export type TrackReviewUpdate = Pick<
  TrackBlueprint,
  | 'songTitle'
  | 'role'
  | 'energy'
  | 'bpm'
  | 'musicalKey'
  | 'leadInstrument'
  | 'isInstrumental'
  | 'arrangementVariation'
>

const ROLES = new Set<TrackRole>([
  'opening', 'immersion', 'steady', 'rise', 'peak', 'release', 'reprise', 'closing',
])

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChannelBuilderInputError('객체 형식이어야 합니다.', 'body')
  }
  return value as Record<string, unknown>
}

function text(value: unknown, field: string, max: number, optional = false): string {
  if (optional && (value === '' || value === undefined || value === null)) return ''
  if (typeof value !== 'string' || !value.trim()) throw new ChannelBuilderInputError('값이 필요합니다.', field)
  const result = value.trim()
  if (result.length > max) throw new ChannelBuilderInputError(`${max}자 이하여야 합니다.`, field)
  return result
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ChannelBuilderInputError(`${min}~${max} 범위의 정수여야 합니다.`, field)
  }
  return value
}

export function parseTrackReviewUpdate(value: unknown): TrackReviewUpdate {
  const input = record(value)
  if (typeof input.role !== 'string' || !ROLES.has(input.role as TrackRole)) {
    throw new ChannelBuilderInputError('지원하지 않는 곡 역할입니다.', 'role')
  }
  if (typeof input.isInstrumental !== 'boolean') {
    throw new ChannelBuilderInputError('참 또는 거짓 값이어야 합니다.', 'isInstrumental')
  }
  return {
    songTitle: text(input.songTitle, 'songTitle', 200),
    role: input.role as TrackRole,
    energy: integer(input.energy, 'energy', 0, 100),
    bpm: integer(input.bpm, 'bpm', 20, 300),
    musicalKey: text(input.musicalKey, 'musicalKey', 50, true),
    leadInstrument: text(input.leadInstrument, 'leadInstrument', 120, true),
    isInstrumental: input.isInstrumental,
    arrangementVariation: text(input.arrangementVariation, 'arrangementVariation', 300),
  }
}
