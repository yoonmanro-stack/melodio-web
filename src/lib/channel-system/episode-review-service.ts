import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelEpisode, TrackBlueprint, VocalTolerance } from '../../types'
import type { Database, Json } from '../../types/database'
import { createClient } from '../supabase/server'
import {
  ChannelSystemAuthenticationError,
  ChannelSystemPersistenceError,
} from './channel-builder-service'
import { ChannelBuilderInputError } from './channel-builder-input'
import { EpisodeTitleConflictError } from './episode-blueprint-service'
import type { TrackReviewUpdate } from './episode-review-input'
import { validateTitleUniqueness } from './validators'

type Client = SupabaseClient<Database>
type EpisodeRow = Database['public']['Tables']['channel_episodes']['Row']
type TrackRow = Database['public']['Tables']['track_blueprints']['Row']

export interface EpisodeReviewContext {
  channel: { id: string; name: string; promise: string }
  dnaVersion: {
    id: string
    version: number
    primaryGenre: string
    bpmRange: [number, number]
    vocalPolicy: VocalTolerance
  }
  episode: ChannelEpisode
  tracks: TrackBlueprint[]
}

export interface ApprovedEpisodeBlueprint {
  channelId: string
  episodeId: string
  approvedTrackCount: number
  status: 'approved'
}

const ROLE_WORDS: Record<TrackBlueprint['role'], string[]> = {
  opening: ['첫 빛', '문을 여는 바람', '시작의 온도'],
  immersion: ['깊어진 풍경', '천천히 스민 장면', '고요한 몰입'],
  steady: ['이어지는 호흡', '머무는 리듬', '잔잔한 균형'],
  rise: ['높아지는 마음', '빛을 향한 걸음', '깨어나는 거리'],
  peak: ['가장 선명한 순간', '빛의 정점', '마음이 닿은 곳'],
  release: ['풀려나는 시간', '부드러운 귀환', '내려놓은 마음'],
  reprise: ['다시 만난 장면', '돌아온 기억', '익숙한 잔향'],
  closing: ['마지막 불빛', '집으로 가는 길', '남겨진 여운'],
}
const CONNECTORS = ['에 번진', '에서 만난', '을 닮은', '에 머문', '을 지나']

async function requireUser(client: Client) {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new ChannelSystemAuthenticationError()
}

function mapEpisode(row: EpisodeRow): ChannelEpisode {
  return {
    id: row.id,
    channelId: row.channel_id,
    dnaVersionId: row.dna_version_id,
    listenerIntentProfileId: row.listener_intent_profile_id,
    episodeTitle: row.episode_title,
    situation: row.situation,
    location: row.location,
    daypart: row.daypart,
    season: row.season || undefined,
    weather: row.weather || undefined,
    emotionalArc: row.emotional_arc,
    listenerIntentOverrides: row.listener_intent_overrides as ChannelEpisode['listenerIntentOverrides'],
    accentPresets: row.accent_presets as unknown as ChannelEpisode['accentPresets'],
    targetDurationSeconds: row.target_duration_seconds,
    plannedTrackCount: row.planned_track_count,
    vocalTrackPercent: row.vocal_track_percent,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTrack(row: TrackRow): TrackBlueprint {
  return {
    id: row.id,
    episodeId: row.episode_id,
    trackNumber: row.track_number,
    songTitle: row.song_title,
    role: row.role,
    energy: row.energy,
    bpm: row.bpm,
    musicalKey: row.musical_key,
    leadInstrument: row.lead_instrument,
    supportInstruments: row.support_instruments,
    isInstrumental: row.is_instrumental,
    vocalGender: row.vocal_gender || undefined,
    lyricLanguage: row.lyric_language || undefined,
    lyricTheme: row.lyric_theme || undefined,
    narrativeBeat: row.narrative_beat || undefined,
    arrangementVariation: row.arrangement_variation,
    targetDurationSeconds: row.target_duration_seconds,
    actualDurationSeconds: row.actual_duration_seconds || undefined,
    stylePrompt: row.style_prompt || undefined,
    excludePrompt: row.exclude_prompt || undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getTitleLedger(client: Client, channelId: string, excludeTrackId?: string) {
  const { data: episodes, error: episodeError } = await client
    .from('channel_episodes').select('id').eq('channel_id', channelId)
    .order('created_at', { ascending: false }).limit(12)
  if (episodeError) throw new ChannelSystemPersistenceError(`제목 원장 조회 실패: ${episodeError.message}`)
  const ids = (episodes || []).map((episode) => episode.id)
  if (ids.length === 0) return []
  const { data, error } = await client.from('track_blueprints').select('id, song_title').in('episode_id', ids)
  if (error) throw new ChannelSystemPersistenceError(`곡 제목 조회 실패: ${error.message}`)
  return (data || []).filter((track) => track.id !== excludeTrackId).map((track) => ({
    id: track.id,
    title: track.song_title,
  }))
}

function parseApproval(value: Json): ApprovedEpisodeBlueprint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChannelSystemPersistenceError('승인 응답 형식이 올바르지 않습니다.')
  }
  if (
    typeof value.channelId !== 'string'
    || typeof value.episodeId !== 'string'
    || typeof value.approvedTrackCount !== 'number'
  ) throw new ChannelSystemPersistenceError('승인 응답값이 누락되었습니다.')
  return {
    channelId: value.channelId,
    episodeId: value.episodeId,
    approvedTrackCount: value.approvedTrackCount,
    status: 'approved',
  }
}

export function createEpisodeReviewService(client: Client) {
  const getContext = async (channelId: string, episodeId: string): Promise<EpisodeReviewContext> => {
    await requireUser(client)
    const [channelResult, episodeResult, tracksResult] = await Promise.all([
      client.from('channel_blueprints').select('id, channel_name, promise').eq('id', channelId).single(),
      client.from('channel_episodes').select('*').eq('id', episodeId).eq('channel_id', channelId).single(),
      client.from('track_blueprints').select('*').eq('episode_id', episodeId).order('track_number'),
    ])
    const firstError = channelResult.error || episodeResult.error || tracksResult.error
    if (firstError || !channelResult.data || !episodeResult.data) {
      throw new ChannelSystemPersistenceError(`Episode Review 조회 실패: ${firstError?.message || '데이터 없음'}`)
    }

    const { data: dna, error: dnaError } = await client.from('channel_dna_versions')
      .select('id, version, music_dna').eq('id', episodeResult.data.dna_version_id)
      .eq('channel_id', channelId).single()
    if (dnaError || !dna) throw new ChannelSystemPersistenceError(`DNA 조회 실패: ${dnaError?.message || '데이터 없음'}`)
    const music = dna.music_dna as unknown as {
      primaryGenre: string
      bpmRange: [number, number]
      vocalPolicy: VocalTolerance
    }

    return {
      channel: { id: channelResult.data.id, name: channelResult.data.channel_name, promise: channelResult.data.promise },
      dnaVersion: {
        id: dna.id,
        version: dna.version,
        primaryGenre: music.primaryGenre,
        bpmRange: music.bpmRange,
        vocalPolicy: music.vocalPolicy,
      },
      episode: mapEpisode(episodeResult.data),
      tracks: (tracksResult.data || []).map(mapTrack),
    }
  }

  return {
    getContext,

    async updateTrack(channelId: string, episodeId: string, trackId: string, update: TrackReviewUpdate) {
      const [context, ledger] = await Promise.all([
        getContext(channelId, episodeId),
        getTitleLedger(client, channelId, trackId),
      ])
      if (context.episode.status !== 'planned') {
        throw new ChannelSystemPersistenceError('승인 전 Episode만 수정할 수 있습니다.')
      }
      if (!context.tracks.some((track) => track.id === trackId)) {
        throw new ChannelSystemPersistenceError('이 Episode에 속한 Track Blueprint가 아닙니다.')
      }
      const [minBpm, maxBpm] = context.dnaVersion.bpmRange
      if (update.bpm < minBpm || update.bpm > maxBpm) {
        throw new ChannelBuilderInputError(`BPM은 Channel DNA 범위 ${minBpm}–${maxBpm} 안에 있어야 합니다.`, 'bpm')
      }
      if (context.dnaVersion.vocalPolicy === 'none' && !update.isInstrumental) {
        throw new ChannelBuilderInputError('이 Channel DNA는 보컬 트랙을 허용하지 않습니다.', 'isInstrumental')
      }
      const titleCheck = validateTitleUniqueness([{ id: trackId, title: update.songTitle }], { existingTitles: ledger })
      if (!titleCheck.valid) throw new EpisodeTitleConflictError(titleCheck.issues)

      const { data, error } = await client.from('track_blueprints').update({
        song_title: update.songTitle,
        role: update.role,
        energy: update.energy,
        bpm: update.bpm,
        musical_key: update.musicalKey,
        lead_instrument: update.leadInstrument,
        is_instrumental: update.isInstrumental,
        arrangement_variation: update.arrangementVariation,
      }).eq('id', trackId).eq('episode_id', episodeId).select('*').single()
      if (error || !data) throw new ChannelSystemPersistenceError(`Track 저장 실패: ${error?.message || '데이터 없음'}`)
      return mapTrack(data)
    },

    async regenerateTitle(channelId: string, episodeId: string, trackId: string) {
      const context = await getContext(channelId, episodeId)
      const track = context.tracks.find((item) => item.id === trackId)
      if (!track) throw new ChannelSystemPersistenceError('Track Blueprint를 찾을 수 없습니다.')
      if (context.episode.status !== 'planned') throw new ChannelSystemPersistenceError('승인 전 Episode만 제목을 변경할 수 있습니다.')

      const ledger = await getTitleLedger(client, channelId, trackId)
      const sceneWords = [context.episode.weather, context.episode.daypart, context.episode.location]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim().slice(0, 40))
      const roleWords = ROLE_WORDS[track.role]
      const candidates: string[] = []
      for (const scene of sceneWords) {
        for (const connector of CONNECTORS) {
          for (const ending of roleWords) candidates.push(`${scene}${connector} ${ending}`)
        }
      }
      const situation = context.episode.situation.trim().slice(0, 80)
      candidates.push(...roleWords.map((ending) => `${situation}, ${ending}`))

      const start = track.trackNumber % Math.max(candidates.length, 1)
      const ordered = [...candidates.slice(start), ...candidates.slice(0, start)]
      const title = ordered.find((candidate, index) => validateTitleUniqueness(
        [{ id: `candidate-${index}`, title: candidate }],
        { existingTitles: ledger },
      ).valid)
      if (!title) throw new EpisodeTitleConflictError([{ code: 'SIMILAR_TITLE', titleId: trackId, title: track.songTitle, similarity: 1, message: '고유한 제목 후보를 만들지 못했습니다.' }])

      const { data, error } = await client.from('track_blueprints').update({ song_title: title })
        .eq('id', trackId).eq('episode_id', episodeId).select('*').single()
      if (error || !data) throw new ChannelSystemPersistenceError(`제목 저장 실패: ${error?.message || '데이터 없음'}`)
      return mapTrack(data)
    },

    async approve(channelId: string, episodeId: string) {
      const context = await getContext(channelId, episodeId)
      if (context.episode.status !== 'planned') throw new ChannelSystemPersistenceError('Planned 상태의 Episode만 승인할 수 있습니다.')
      const [minBpm, maxBpm] = context.dnaVersion.bpmRange
      if (context.tracks.some((track) => track.bpm < minBpm || track.bpm > maxBpm)) {
        throw new ChannelBuilderInputError(`모든 BPM은 Channel DNA 범위 ${minBpm}–${maxBpm} 안에 있어야 합니다.`, 'tracks')
      }
      if (
        context.dnaVersion.vocalPolicy === 'none'
        && context.tracks.some((track) => !track.isInstrumental)
      ) {
        throw new ChannelBuilderInputError('이 Channel DNA는 보컬 트랙을 허용하지 않습니다.', 'tracks')
      }
      const ledger = await getTitleLedger(client, channelId)
      const currentIds = new Set(context.tracks.map((track) => track.id))
      const titleCheck = validateTitleUniqueness(
        context.tracks.map((track) => ({ id: track.id, title: track.songTitle })),
        { existingTitles: ledger.filter((title) => !currentIds.has(title.id)) },
      )
      if (!titleCheck.valid) throw new EpisodeTitleConflictError(titleCheck.issues)

      const { data, error } = await client.rpc('approve_channel_episode_blueprint', {
        p_channel_id: channelId,
        p_episode_id: episodeId,
      })
      if (error || !data) throw new ChannelSystemPersistenceError(`Episode 승인 실패: ${error?.message || '응답 없음'}`, error?.code)
      return parseApproval(data)
    },
  }
}

export async function getEpisodeReviewService() {
  return createEpisodeReviewService(await createClient())
}
