import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ChannelDna,
  ChannelDnaVersion,
  ListenerIntentProfile,
} from '../../types'
import type { Database, Json } from '../../types/database'
import { createClient } from '../supabase/server'
import type { LegacyPresetChannelDraft } from './legacy-adapters'
import {
  validateChannelDnaMutation,
  type DnaValidationIssue,
} from './validators'

type ChannelSystemClient = SupabaseClient<Database>
type ChannelBlueprintRow = Database['public']['Tables']['channel_blueprints']['Row']
type DnaVersionRow = Database['public']['Tables']['channel_dna_versions']['Row']
type ListenerIntentRow = Database['public']['Tables']['listener_intent_profiles']['Row']

export interface ChannelDashboardSummary {
  id: string
  channelName: string
  promise: string
  conceptPresetId: string | null
  status: ChannelBlueprintRow['status']
  latestDnaVersion: number
  listenerIntent: {
    id: string
    name: string
    primaryPurpose: ListenerIntentRow['primary_purpose']
    activity: string
    environment: string
  } | null
  createdAt: string
  updatedAt: string
}

export interface SavedChannelDraft {
  channelId: string
  dnaVersionId: string
  dnaVersion: number
  listenerIntentProfileId: string
}

export interface CreatedDnaVersion {
  channelId: string
  dnaVersionId: string
  dnaVersion: number
}

export class ChannelSystemAuthenticationError extends Error {
  constructor() {
    super('로그인이 필요합니다.')
    this.name = 'ChannelSystemAuthenticationError'
  }
}

export class ChannelSystemPersistenceError extends Error {
  constructor(message: string, public readonly causeCode?: string) {
    super(message)
    this.name = 'ChannelSystemPersistenceError'
  }
}

export class ChannelDnaMutationError extends Error {
  constructor(public readonly issues: DnaValidationIssue[]) {
    super(issues[0]?.message || 'Channel DNA 변경이 잠금 정책을 위반했습니다.')
    this.name = 'ChannelDnaMutationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function serializeJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

function requiredString(value: unknown, key: string): string {
  if (typeof value !== 'string' || !value) {
    throw new ChannelSystemPersistenceError(`${key} 응답값이 누락되었습니다.`)
  }
  return value
}

function requiredNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ChannelSystemPersistenceError(`${key} 응답값이 누락되었습니다.`)
  }
  return value
}

function parseSavedChannelDraft(value: Json): SavedChannelDraft {
  if (!isRecord(value)) {
    throw new ChannelSystemPersistenceError('채널 저장 응답 형식이 올바르지 않습니다.')
  }
  return {
    channelId: requiredString(value.channelId, 'channelId'),
    dnaVersionId: requiredString(value.dnaVersionId, 'dnaVersionId'),
    dnaVersion: requiredNumber(value.dnaVersion, 'dnaVersion'),
    listenerIntentProfileId: requiredString(
      value.listenerIntentProfileId,
      'listenerIntentProfileId',
    ),
  }
}

function parseCreatedDnaVersion(value: Json): CreatedDnaVersion {
  if (!isRecord(value)) {
    throw new ChannelSystemPersistenceError('DNA 버전 저장 응답 형식이 올바르지 않습니다.')
  }
  return {
    channelId: requiredString(value.channelId, 'channelId'),
    dnaVersionId: requiredString(value.dnaVersionId, 'dnaVersionId'),
    dnaVersion: requiredNumber(value.dnaVersion, 'dnaVersion'),
  }
}

function mapDnaVersion(row: DnaVersionRow): ChannelDnaVersion {
  return {
    id: row.id,
    channelId: row.channel_id,
    version: row.version,
    dna: {
      identity: row.identity_dna as unknown as ChannelDna['identity'],
      music: row.music_dna as unknown as ChannelDna['music'],
      visual: row.visual_dna as unknown as ChannelDna['visual'],
      editorial: row.editorial_dna as unknown as ChannelDna['editorial'],
      fieldLocks: row.field_locks as unknown as ChannelDna['fieldLocks'],
    },
    changeSummary: row.change_summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function mapListenerIntent(row: ListenerIntentRow): ListenerIntentProfile {
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

async function requireAuthenticatedUser(client: ChannelSystemClient): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new ChannelSystemAuthenticationError()
  return data.user.id
}

export function createChannelBuilderService(client: ChannelSystemClient) {
  const getLatestDnaVersion = async (channelId: string): Promise<ChannelDnaVersion | null> => {
    await requireAuthenticatedUser(client)
    const { data, error } = await client
      .from('channel_dna_versions')
      .select('*')
      .eq('channel_id', channelId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new ChannelSystemPersistenceError(
        `최신 Channel DNA 조회에 실패했습니다: ${error.message}`,
        error.code,
      )
    }
    return data ? mapDnaVersion(data) : null
  }

  return {
    /** 로그인 사용자가 저장한 Channel DNA 프로젝트를 최신순으로 요약한다. */
    async listChannelSummaries(): Promise<ChannelDashboardSummary[]> {
      const userId = await requireAuthenticatedUser(client)
      const { data: channels, error: channelError } = await client
        .from('channel_blueprints')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (channelError) {
        throw new ChannelSystemPersistenceError(
          `Channel DNA 목록 조회에 실패했습니다: ${channelError.message}`,
          channelError.code,
        )
      }
      if (!channels.length) return []

      const channelIds = channels.map((channel) => channel.id)
      const [dnaResult, intentResult] = await Promise.all([
        client
          .from('channel_dna_versions')
          .select('channel_id, version')
          .in('channel_id', channelIds)
          .order('version', { ascending: false }),
        client
          .from('listener_intent_profiles')
          .select('id, channel_id, name, primary_purpose, activity, environment, updated_at')
          .in('channel_id', channelIds)
          .order('updated_at', { ascending: false }),
      ])

      if (dnaResult.error) {
        throw new ChannelSystemPersistenceError(
          `Channel DNA 버전 조회에 실패했습니다: ${dnaResult.error.message}`,
          dnaResult.error.code,
        )
      }
      if (intentResult.error) {
        throw new ChannelSystemPersistenceError(
          `Listener Intent 조회에 실패했습니다: ${intentResult.error.message}`,
          intentResult.error.code,
        )
      }

      const latestVersionByChannel = new Map<string, number>()
      for (const version of dnaResult.data) {
        if (!latestVersionByChannel.has(version.channel_id)) {
          latestVersionByChannel.set(version.channel_id, version.version)
        }
      }

      const intentByChannel = new Map<string, (typeof intentResult.data)[number]>()
      for (const intent of intentResult.data) {
        if (!intentByChannel.has(intent.channel_id)) {
          intentByChannel.set(intent.channel_id, intent)
        }
      }

      return channels.map((channel) => {
        const intent = intentByChannel.get(channel.id)
        return {
          id: channel.id,
          channelName: channel.channel_name,
          promise: channel.promise,
          conceptPresetId: channel.concept_preset_id,
          status: channel.status,
          latestDnaVersion: latestVersionByChannel.get(channel.id) ?? 1,
          listenerIntent: intent
            ? {
                id: intent.id,
                name: intent.name,
                primaryPurpose: intent.primary_purpose,
                activity: intent.activity,
                environment: intent.environment,
              }
            : null,
          createdAt: channel.created_at,
          updatedAt: channel.updated_at,
        }
      })
    },

    /** 채널, DNA v1, Listener Intent를 하나의 DB 트랜잭션으로 생성한다. */
    async saveChannelDraft(draft: LegacyPresetChannelDraft): Promise<SavedChannelDraft> {
      await requireAuthenticatedUser(client)

      if (!draft.channel.channelName.trim()) {
        throw new ChannelSystemPersistenceError('채널 이름이 필요합니다.')
      }
      if (!draft.listenerIntent.name.trim()) {
        throw new ChannelSystemPersistenceError('Listener Intent 이름이 필요합니다.')
      }

      const initialDnaCheck = validateChannelDnaMutation(draft.dna, draft.dna, {
        unlistedMode: 'free',
      })
      if (!initialDnaCheck.valid) {
        throw new ChannelDnaMutationError(initialDnaCheck.issues)
      }

      const { data, error } = await client.rpc('create_channel_system_draft', {
        p_channel: serializeJson(draft.channel),
        p_dna: serializeJson(draft.dna),
        p_listener: serializeJson(draft.listenerIntent),
      })

      if (error || !data) {
        throw new ChannelSystemPersistenceError(
          `채널 프로젝트 저장에 실패했습니다: ${error?.message || '응답 없음'}`,
          error?.code,
        )
      }
      return parseSavedChannelDraft(data)
    },

    /** RLS가 소유권을 검증한 채널의 최신 불변 DNA 버전을 조회한다. */
    getLatestDnaVersion,

    /** 최신 DNA 잠금 정책을 통과한 경우에만 다음 불변 버전을 원자적으로 만든다. */
    async createDnaVersion(
      channelId: string,
      candidateDna: ChannelDna,
      changeSummary: string,
    ): Promise<CreatedDnaVersion> {
      await requireAuthenticatedUser(client)
      const latest = await getLatestDnaVersion(channelId)
      if (!latest) {
        throw new ChannelSystemPersistenceError('기존 Channel DNA 버전을 찾을 수 없습니다.')
      }

      const validation = validateChannelDnaMutation(latest.dna, candidateDna)
      if (!validation.valid) throw new ChannelDnaMutationError(validation.issues)

      const { data, error } = await client.rpc('create_channel_dna_version', {
        p_channel_id: channelId,
        p_dna: serializeJson(candidateDna),
        p_change_summary: changeSummary.trim(),
      })

      if (error || !data) {
        throw new ChannelSystemPersistenceError(
          `Channel DNA 버전 생성에 실패했습니다: ${error?.message || '응답 없음'}`,
          error?.code,
        )
      }
      return parseCreatedDnaVersion(data)
    },

    /** 기존 Listener Intent를 저장하고 DB 트리거가 갱신한 결과를 반환한다. */
    async updateListenerIntent(profile: ListenerIntentProfile): Promise<ListenerIntentProfile> {
      await requireAuthenticatedUser(client)
      const { data, error } = await client
        .from('listener_intent_profiles')
        .update({
          name: profile.name,
          primary_purpose: profile.primaryPurpose,
          secondary_purposes: profile.secondaryPurposes,
          discovery_concepts: profile.discoveryConcepts,
          listener_persona: profile.listenerPersona,
          activity: profile.activity,
          environment: profile.environment,
          dayparts: profile.dayparts,
          current_state: profile.currentState,
          desired_state: profile.desiredState,
          desired_behavior: profile.desiredBehavior,
          session_minutes: profile.sessionMinutes,
          attention_mode: profile.attentionMode,
          vocal_tolerance: profile.vocalTolerance,
          interruption_tolerance: profile.interruptionTolerance,
          target_energy: profile.targetEnergy,
          target_energy_curve: profile.targetEnergyCurve,
        })
        .eq('id', profile.id)
        .eq('channel_id', profile.channelId)
        .select('*')
        .single()

      if (error || !data) {
        throw new ChannelSystemPersistenceError(
          `Listener Intent 저장에 실패했습니다: ${error?.message || '응답 없음'}`,
          error?.code,
        )
      }
      return mapListenerIntent(data)
    },
  }
}

/** Route Handler 또는 Server Action에서 사용하는 요청별 서비스 팩토리. */
export async function getChannelBuilderService() {
  const client = await createClient()
  return createChannelBuilderService(client)
}
