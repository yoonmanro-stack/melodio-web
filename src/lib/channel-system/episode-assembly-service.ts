import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/database'
import { createClient } from '../supabase/server'
import { ChannelSystemPersistenceError } from './channel-builder-service'
import { createGenerationQueueService, type GenerationQueueContext } from './generation-queue-service'

type Client = SupabaseClient<Database>
type AssemblyRow = Database['public']['Tables']['episode_assemblies']['Row']
type ItemRow = Database['public']['Tables']['episode_assembly_items']['Row']

export interface EpisodeAssemblyItem {
  id: string
  queueItemId: string
  candidateId: string
  generationId: string
  trackNumber: number
  title: string
  audioUrl: string
  durationSeconds: number
  startSeconds: number
  endSeconds: number
}

export interface EpisodeAssembly {
  id: string
  status: AssemblyRow['status']
  assemblyMode: 'gapless'
  trackCount: number
  totalDurationSeconds: number
  tracklistText: string
  outputAudioUrl?: string
  errorMessage?: string
  queuedAt?: string
  completedAt?: string
}

export interface EpisodeAssemblyContext {
  queue: GenerationQueueContext
  assembly: EpisodeAssembly | null
  items: EpisodeAssemblyItem[]
}

function mapAssembly(row: AssemblyRow): EpisodeAssembly {
  return {
    id: row.id,
    status: row.status,
    assemblyMode: row.assembly_mode,
    trackCount: row.track_count,
    totalDurationSeconds: row.total_duration_seconds,
    tracklistText: row.tracklist_text,
    outputAudioUrl: row.output_audio_url || undefined,
    errorMessage: row.error_message || undefined,
    queuedAt: row.queued_at || undefined,
    completedAt: row.completed_at || undefined,
  }
}

function mapItem(row: ItemRow): EpisodeAssemblyItem {
  return {
    id: row.id,
    queueItemId: row.queue_item_id,
    candidateId: row.candidate_id,
    generationId: row.generation_id,
    trackNumber: row.track_number,
    title: row.title,
    audioUrl: row.audio_url,
    durationSeconds: row.duration_seconds,
    startSeconds: row.start_seconds,
    endSeconds: row.end_seconds,
  }
}

export function createEpisodeAssemblyService(client: Client) {
  const queueService = createGenerationQueueService(client)

  const getContext = async (channelId: string, episodeId: string): Promise<EpisodeAssemblyContext> => {
    const queue = await queueService.getContext(channelId, episodeId)
    const assemblyResult = await client.from('episode_assemblies').select('*').eq('episode_id', episodeId).maybeSingle()
    if (assemblyResult.error) throw new ChannelSystemPersistenceError(`Episode Assembly 조회 실패: ${assemblyResult.error.message}`)
    let items: ItemRow[] = []
    if (assemblyResult.data) {
      const itemResult = await client.from('episode_assembly_items').select('*')
        .eq('assembly_id', assemblyResult.data.id).order('track_number')
      if (itemResult.error) throw new ChannelSystemPersistenceError(`Assembly Track 조회 실패: ${itemResult.error.message}`)
      items = itemResult.data || []
    }
    return {
      queue,
      assembly: assemblyResult.data ? mapAssembly(assemblyResult.data) : null,
      items: items.map(mapItem),
    }
  }

  return {
    getContext,

    async create(channelId: string, episodeId: string) {
      const context = await getContext(channelId, episodeId)
      if (context.assembly) return context
      if (context.queue.batch?.status !== 'completed') {
        throw new ChannelSystemPersistenceError('모든 Track의 Master를 먼저 선택해야 합니다.')
      }
      const { error } = await client.rpc('create_episode_assembly', {
        p_channel_id: channelId,
        p_episode_id: episodeId,
      })
      if (error) throw new ChannelSystemPersistenceError(`Episode Assembly 생성 실패: ${error.message}`, error.code)
      return getContext(channelId, episodeId)
    },

    async queue(channelId: string, episodeId: string) {
      const context = await getContext(channelId, episodeId)
      if (!context.assembly) throw new ChannelSystemPersistenceError('Assembly Plan을 먼저 생성해야 합니다.')
      const { error } = await client.rpc('queue_episode_assembly', { p_assembly_id: context.assembly.id })
      if (error) throw new ChannelSystemPersistenceError(`Assembly 작업 등록 실패: ${error.message}`, error.code)
      return getContext(channelId, episodeId)
    },
  }
}

export async function getEpisodeAssemblyService() {
  return createEpisodeAssemblyService(await createClient())
}
