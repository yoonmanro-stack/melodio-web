import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelDna, DiscoveryConcept, ListenerIntentProfile } from '../../types'
import type { Database, Json } from '../../types/database'
import { createClient } from '../supabase/server'
import {
  ChannelSystemAuthenticationError,
  ChannelSystemPersistenceError,
} from './channel-builder-service'
import type { EpisodeBlueprintInput } from './episode-blueprint-input'
import {
  validateTitleUniqueness,
  type TitleValidationIssue,
} from './validators'

type Client = SupabaseClient<Database>
type DnaRow = Database['public']['Tables']['channel_dna_versions']['Row']
type IntentRow = Database['public']['Tables']['listener_intent_profiles']['Row']

export interface EpisodeBuilderContext {
  channel: {
    id: string
    name: string
    promise: string
    discoveryConcepts: DiscoveryConcept[]
  }
  dnaVersion: {
    id: string
    version: number
    dna: ChannelDna
  }
  listenerIntent: ListenerIntentProfile
}

export interface SavedEpisodeBlueprint {
  channelId: string
  episodeId: string
  trackBlueprintIds: string[]
  status: 'planned'
}

export class EpisodeTitleConflictError extends Error {
  constructor(public readonly issues: TitleValidationIssue[]) {
    super(issues[0]?.message || '곡 제목이 기존 제목과 중복됩니다.')
    this.name = 'EpisodeTitleConflictError'
  }
}

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

function mapDna(row: DnaRow): ChannelDna {
  return {
    identity: row.identity_dna as unknown as ChannelDna['identity'],
    music: row.music_dna as unknown as ChannelDna['music'],
    visual: row.visual_dna as unknown as ChannelDna['visual'],
    editorial: row.editorial_dna as unknown as ChannelDna['editorial'],
    fieldLocks: row.field_locks as unknown as ChannelDna['fieldLocks'],
  }
}

function mapIntent(row: IntentRow): ListenerIntentProfile {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    primaryPurpose: row.primary_purpose,
    secondaryPurposes: row.secondary_purposes,
    discoveryConcepts: row.discovery_concepts,
    listenerPersona: row.listener_persona,
    activity: row.activity,
    environment: row.environment,
    dayparts: row.dayparts,
    currentState: row.current_state,
    desiredState: row.desired_state,
    desiredBehavior: row.desired_behavior,
    sessionMinutes: row.session_minutes,
    attentionMode: row.attention_mode,
    vocalTolerance: row.vocal_tolerance,
    interruptionTolerance: row.interruption_tolerance,
    targetEnergy: row.target_energy,
    targetEnergyCurve: row.target_energy_curve,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function requireUser(client: Client) {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new ChannelSystemAuthenticationError()
}

function parseSaved(value: Json): SavedEpisodeBlueprint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChannelSystemPersistenceError('Episode 저장 응답 형식이 올바르지 않습니다.')
  }
  const channelId = value.channelId
  const episodeId = value.episodeId
  const ids = value.trackBlueprintIds
  if (typeof channelId !== 'string' || typeof episodeId !== 'string' || !Array.isArray(ids)) {
    throw new ChannelSystemPersistenceError('Episode 저장 응답값이 누락되었습니다.')
  }
  return {
    channelId,
    episodeId,
    trackBlueprintIds: ids.filter((id): id is string => typeof id === 'string'),
    status: 'planned',
  }
}

export function createEpisodeBlueprintService(client: Client) {
  return {
    async getContext(channelId: string): Promise<EpisodeBuilderContext> {
      await requireUser(client)
      const [channelResult, dnaResult, intentResult] = await Promise.all([
        client.from('channel_blueprints').select('*').eq('id', channelId).single(),
        client.from('channel_dna_versions').select('*').eq('channel_id', channelId)
          .order('version', { ascending: false }).limit(1).single(),
        client.from('listener_intent_profiles').select('*').eq('channel_id', channelId)
          .order('updated_at', { ascending: false }).limit(1).single(),
      ])

      const firstError = channelResult.error || dnaResult.error || intentResult.error
      if (firstError || !channelResult.data || !dnaResult.data || !intentResult.data) {
        throw new ChannelSystemPersistenceError(
          `Episode Builder 정보를 불러오지 못했습니다: ${firstError?.message || '데이터 없음'}`,
          firstError?.code,
        )
      }

      return {
        channel: {
          id: channelResult.data.id,
          name: channelResult.data.channel_name,
          promise: channelResult.data.promise,
          discoveryConcepts: channelResult.data.discovery_concepts,
        },
        dnaVersion: {
          id: dnaResult.data.id,
          version: dnaResult.data.version,
          dna: mapDna(dnaResult.data),
        },
        listenerIntent: mapIntent(intentResult.data),
      }
    },

    async save(channelId: string, input: EpisodeBlueprintInput): Promise<SavedEpisodeBlueprint> {
      await requireUser(client)

      const { data: recentEpisodes, error: episodeError } = await client
        .from('channel_episodes')
        .select('id')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(12)
      if (episodeError) {
        throw new ChannelSystemPersistenceError(`제목 원장 조회에 실패했습니다: ${episodeError.message}`)
      }

      const episodeIds = (recentEpisodes || []).map((episode) => episode.id)
      const existingTitles = episodeIds.length > 0
        ? await client.from('track_blueprints').select('id, song_title').in('episode_id', episodeIds)
        : { data: [], error: null }
      if (existingTitles.error) {
        throw new ChannelSystemPersistenceError(`기존 곡 제목 조회에 실패했습니다: ${existingTitles.error.message}`)
      }

      const titleCheck = validateTitleUniqueness(
        input.tracks.map((track) => ({ id: `new-${track.trackNumber}`, title: track.songTitle })),
        {
          existingTitles: (existingTitles.data || []).map((track) => ({
            id: track.id,
            title: track.song_title,
          })),
        },
      )
      if (!titleCheck.valid) throw new EpisodeTitleConflictError(titleCheck.issues)

      const { data, error } = await client.rpc('create_channel_episode_blueprint', {
        p_channel_id: channelId,
        p_dna_version_id: input.dnaVersionId,
        p_listener_intent_profile_id: input.listenerIntentProfileId,
        p_episode: json(input.episode),
        p_tracks: json(input.tracks),
      })
      if (error || !data) {
        throw new ChannelSystemPersistenceError(
          `Episode Blueprint 저장에 실패했습니다: ${error?.message || '응답 없음'}`,
          error?.code,
        )
      }
      return parseSaved(data)
    },
  }
}

export async function getEpisodeBlueprintService() {
  return createEpisodeBlueprintService(await createClient())
}
