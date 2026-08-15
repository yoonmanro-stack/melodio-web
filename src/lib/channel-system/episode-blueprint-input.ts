import type {
  ChannelEpisode,
  EnergyCurve,
  TrackBlueprint,
  TrackRole,
} from '../../types'
import { ChannelBuilderInputError, parseUuid } from './channel-builder-input'

export type EpisodeBlueprintDraft = Omit<
  ChannelEpisode,
  'id' | 'channelId' | 'dnaVersionId' | 'listenerIntentProfileId' | 'status' | 'createdAt' | 'updatedAt'
>
export type EpisodeTrackDraft = Omit<
  TrackBlueprint,
  'id' | 'episodeId' | 'actualDurationSeconds' | 'status' | 'createdAt' | 'updatedAt'
>

export interface EpisodeBlueprintInput {
  dnaVersionId: string
  listenerIntentProfileId: string
  energyCurve: EnergyCurve
  episode: EpisodeBlueprintDraft
  tracks: EpisodeTrackDraft[]
}

const ROLES = new Set<TrackRole>([
  'opening', 'immersion', 'steady', 'rise', 'peak', 'release', 'reprise', 'closing',
])
const CURVES = new Set<EnergyCurve>(['flat', 'rise', 'fall', 'arc', 'multi_arc'])
const SUPPORTED_TRACK_COUNTS = new Set([2, 10, 20, 30, 40])

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChannelBuilderInputError('객체 형식이어야 합니다.', field)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, field: string, max = 500, optional = false): string {
  if ((value === undefined || value === null || value === '') && optional) return ''
  if (typeof value !== 'string' || !value.trim()) {
    throw new ChannelBuilderInputError('값이 필요합니다.', field)
  }
  const result = value.trim()
  if (result.length > max) throw new ChannelBuilderInputError(`${max}자 이하여야 합니다.`, field)
  return result
}

function number(value: unknown, field: string, min: number, max: number): number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < min
    || value > max
  ) {
    throw new ChannelBuilderInputError(`${min}~${max} 범위의 정수여야 합니다.`, field)
  }
  return value
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ChannelBuilderInputError('참 또는 거짓 값이어야 합니다.', field)
  }
  return value
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 30) {
    throw new ChannelBuilderInputError('30개 이하의 배열이어야 합니다.', field)
  }
  return value.map((item, index) => text(item, `${field}.${index}`, 200))
}

function enumValue<T extends string>(value: unknown, field: string, allowed: Set<T>): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new ChannelBuilderInputError('지원하지 않는 값입니다.', field)
  }
  return value as T
}

export function parseEpisodeBlueprintInput(value: unknown): EpisodeBlueprintInput {
  const root = record(value, 'body')
  const episode = record(root.episode, 'episode')
  const energyCurve = enumValue(root.energyCurve, 'energyCurve', CURVES)
  if (!Array.isArray(root.tracks)) throw new ChannelBuilderInputError('곡 배열이 필요합니다.', 'tracks')

  const plannedTrackCount = number(episode.plannedTrackCount, 'episode.plannedTrackCount', 1, 200)
  if (!SUPPORTED_TRACK_COUNTS.has(plannedTrackCount)) {
    throw new ChannelBuilderInputError('곡 수는 2·10·20·30·40 중 하나여야 합니다.', 'episode.plannedTrackCount')
  }
  if (root.tracks.length !== plannedTrackCount) {
    throw new ChannelBuilderInputError('계획한 곡 수와 Track Blueprint 수가 일치해야 합니다.', 'tracks')
  }

  const tracks = root.tracks.map((item, index): EpisodeTrackDraft => {
    const track = record(item, `tracks.${index}`)
    return {
      trackNumber: number(track.trackNumber, `tracks.${index}.trackNumber`, 1, 200),
      songTitle: text(track.songTitle, `tracks.${index}.songTitle`, 200),
      role: enumValue(track.role, `tracks.${index}.role`, ROLES),
      energy: number(track.energy, `tracks.${index}.energy`, 0, 100),
      bpm: number(track.bpm, `tracks.${index}.bpm`, 20, 300),
      musicalKey: text(track.musicalKey, `tracks.${index}.musicalKey`, 50, true),
      leadInstrument: text(track.leadInstrument, `tracks.${index}.leadInstrument`, 120, true),
      supportInstruments: stringArray(track.supportInstruments, `tracks.${index}.supportInstruments`),
      isInstrumental: boolean(track.isInstrumental, `tracks.${index}.isInstrumental`),
      vocalGender: text(track.vocalGender, `tracks.${index}.vocalGender`, 50, true) || undefined,
      lyricLanguage: text(track.lyricLanguage, `tracks.${index}.lyricLanguage`, 50, true) || undefined,
      lyricTheme: text(track.lyricTheme, `tracks.${index}.lyricTheme`, 300, true) || undefined,
      narrativeBeat: text(track.narrativeBeat, `tracks.${index}.narrativeBeat`, 300, true) || undefined,
      arrangementVariation: text(track.arrangementVariation, `tracks.${index}.arrangementVariation`, 300),
      targetDurationSeconds: number(track.targetDurationSeconds, `tracks.${index}.targetDurationSeconds`, 15, 3600),
      stylePrompt: text(track.stylePrompt, `tracks.${index}.stylePrompt`, 1000, true) || undefined,
      excludePrompt: text(track.excludePrompt, `tracks.${index}.excludePrompt`, 200, true) || undefined,
    }
  })

  const targetDurationSeconds = number(
    episode.targetDurationSeconds, 'episode.targetDurationSeconds', 60, 86400,
  )
  const trackDuration = tracks.reduce((sum, track) => sum + track.targetDurationSeconds, 0)
  if (trackDuration !== targetDurationSeconds) {
    throw new ChannelBuilderInputError('곡별 목표 길이의 합이 에피소드 전체 길이와 일치해야 합니다.', 'tracks')
  }

  if (tracks.some((track, index) => track.trackNumber !== index + 1)) {
    throw new ChannelBuilderInputError('트랙 번호는 1부터 순서대로 이어져야 합니다.', 'tracks')
  }

  return {
    dnaVersionId: parseUuid(root.dnaVersionId, 'dnaVersionId'),
    listenerIntentProfileId: parseUuid(root.listenerIntentProfileId, 'listenerIntentProfileId'),
    energyCurve,
    episode: {
      episodeTitle: text(episode.episodeTitle, 'episode.episodeTitle', 200),
      situation: text(episode.situation, 'episode.situation', 300),
      location: text(episode.location, 'episode.location', 300),
      daypart: text(episode.daypart, 'episode.daypart', 120),
      season: text(episode.season, 'episode.season', 120, true) || undefined,
      weather: text(episode.weather, 'episode.weather', 120, true) || undefined,
      emotionalArc: text(episode.emotionalArc, 'episode.emotionalArc', 500),
      listenerIntentOverrides: { targetEnergyCurve: energyCurve },
      accentPresets: [],
      targetDurationSeconds,
      plannedTrackCount,
      vocalTrackPercent: number(episode.vocalTrackPercent, 'episode.vocalTrackPercent', 0, 100),
    },
    tracks,
  }
}
