import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelDna, LyricsSection } from '../../types'
import type { Database, Json } from '../../types/database'
import { generateLyrics, type LyricsGeneratorResult } from '../engines/lyrics-generator'
import { createClient } from '../supabase/server'
import {
  ChannelSystemAuthenticationError,
  ChannelSystemPersistenceError,
} from './channel-builder-service'
import { createEpisodeReviewService, type EpisodeReviewContext } from './episode-review-service'
import {
  compileTrackPrompt,
  type GenerationPromptTier,
} from './generation-prompt-compiler'

type Client = SupabaseClient<Database>
type BatchRow = Database['public']['Tables']['episode_generation_batches']['Row']
type ItemRow = Database['public']['Tables']['generation_queue_items']['Row']
type CandidateRow = Database['public']['Tables']['generation_queue_candidates']['Row']

export interface GenerationCandidate {
  id: string
  generationId: string
  slot: 'A' | 'B'
  audioUrl: string
  durationSeconds?: number
  audioGrade?: string
  clippingCount?: number
  dissonanceScore?: number
  isRecommended: boolean
}

export interface GenerationQueueItem {
  id: string
  trackBlueprintId: string
  trackNumber: number
  title: string
  promptTier: GenerationPromptTier
  stylePrompt: string
  excludePrompt: string
  lyricsPrompt: string
  lyricsSections: LyricsSection[]
  isInstrumental: boolean
  candidateCount: 2
  engine: 'suno_v5'
  model: string
  status: ItemRow['status']
  errorMessage?: string
  compiledAt?: string
  generationId?: string
  selectedCandidateId?: string
  submittedAt?: string
  selectedAt?: string
  candidates: GenerationCandidate[]
}

export interface GenerationQueueBatch {
  id: string
  promptTier: GenerationPromptTier
  status: BatchRow['status']
  totalBlueprints: number
  rawCandidateCount: number
  readyItems: number
  createdAt: string
  updatedAt: string
}

export interface GenerationQueueContext {
  review: EpisodeReviewContext
  plan: Database['public']['Tables']['profiles']['Row']['plan']
  entitledPromptTier: GenerationPromptTier
  batch: GenerationQueueBatch | null
  items: GenerationQueueItem[]
}

function mapBatch(row: BatchRow): GenerationQueueBatch {
  return {
    id: row.id,
    promptTier: row.prompt_tier,
    status: row.status,
    totalBlueprints: row.total_blueprints,
    rawCandidateCount: row.raw_candidate_count,
    readyItems: row.ready_items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCandidate(row: CandidateRow): GenerationCandidate {
  return {
    id: row.id,
    generationId: row.generation_id,
    slot: row.candidate_slot,
    audioUrl: row.audio_url,
    durationSeconds: row.duration_seconds ?? undefined,
    audioGrade: row.audio_grade ?? undefined,
    clippingCount: row.clipping_count ?? undefined,
    dissonanceScore: row.dissonance_score ?? undefined,
    isRecommended: row.is_recommended,
  }
}

function mapItem(row: ItemRow, candidates: CandidateRow[] = []): GenerationQueueItem {
  return {
    id: row.id,
    trackBlueprintId: row.track_blueprint_id,
    trackNumber: row.track_number,
    title: row.title,
    promptTier: row.prompt_tier,
    stylePrompt: row.style_prompt,
    excludePrompt: row.exclude_prompt,
    lyricsPrompt: row.lyrics_prompt,
    lyricsSections: row.lyrics_sections as unknown as LyricsSection[],
    isInstrumental: row.is_instrumental,
    candidateCount: row.candidate_count,
    engine: row.engine,
    model: row.model,
    status: row.status,
    errorMessage: row.error_message || undefined,
    compiledAt: row.compiled_at || undefined,
    generationId: row.generation_id || undefined,
    selectedCandidateId: row.selected_candidate_id || undefined,
    submittedAt: row.submitted_at || undefined,
    selectedAt: row.selected_at || undefined,
    candidates: candidates.map(mapCandidate),
  }
}

async function authenticatedUser(client: Client) {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new ChannelSystemAuthenticationError()
  return data.user
}

async function loadDna(client: Client, dnaVersionId: string): Promise<ChannelDna> {
  const { data, error } = await client.from('channel_dna_versions').select('*').eq('id', dnaVersionId).single()
  if (error || !data) throw new ChannelSystemPersistenceError(`Channel DNA 조회 실패: ${error?.message || '데이터 없음'}`)
  return {
    identity: data.identity_dna as unknown as ChannelDna['identity'],
    music: data.music_dna as unknown as ChannelDna['music'],
    visual: data.visual_dna as unknown as ChannelDna['visual'],
    editorial: data.editorial_dna as unknown as ChannelDna['editorial'],
    fieldLocks: data.field_locks as unknown as ChannelDna['fieldLocks'],
  }
}

function renderSections(sections: LyricsSection[]) {
  return sections.map((section) => {
    const cue = section.description ? `\n[${section.description}]` : ''
    return `[${section.type}]${cue}\n${section.content}`
  }).join('\n\n')
}

function language(value?: string): Parameters<typeof generateLyrics>[0]['language'] {
  const normalized = value?.toLowerCase()
  const supported = new Set(['ko', 'en', 'ja', 'ko-en', 'ja-en', 'fr', 'zh', 'es', 'pt', 'de', 'it', 'hi', 'ru', 'ar'])
  return supported.has(normalized || '')
    ? normalized as Parameters<typeof generateLyrics>[0]['language']
    : 'ko'
}

function vocalGender(value?: string): 'mixed' | 'female' | 'male' | 'duet' {
  const normalized = value?.toLowerCase()
  if (normalized === 'female' || normalized === 'male' || normalized === 'duet') return normalized
  return 'mixed'
}

function hashLyrics(value: string) {
  return createHash('sha256').update(value.normalize('NFKC').replace(/\s+/g, ' ').trim()).digest('hex')
}

export function createGenerationQueueService(client: Client) {
  const reviewService = createEpisodeReviewService(client)

  const getContext = async (channelId: string, episodeId: string): Promise<GenerationQueueContext> => {
    const user = await authenticatedUser(client)
    const [review, profileResult, batchResult] = await Promise.all([
      reviewService.getContext(channelId, episodeId),
      client.from('profiles').select('plan').eq('id', user.id).maybeSingle(),
      client.from('episode_generation_batches').select('*').eq('episode_id', episodeId).maybeSingle(),
    ])
    if (profileResult.error) throw new ChannelSystemPersistenceError(`요금제 조회 실패: ${profileResult.error.message}`)
    if (batchResult.error) throw new ChannelSystemPersistenceError(`Queue 조회 실패: ${batchResult.error.message}`)
    const plan = profileResult.data?.plan || 'free'
    const batch = batchResult.data
    let items: ItemRow[] = []
    let candidates: CandidateRow[] = []
    if (batch) {
      const result = await client.from('generation_queue_items').select('*')
        .eq('batch_id', batch.id).order('track_number')
      if (result.error) throw new ChannelSystemPersistenceError(`Queue Item 조회 실패: ${result.error.message}`)
      items = result.data || []
      if (items.length > 0) {
        const candidateResult = await client.from('generation_queue_candidates').select('*')
          .in('queue_item_id', items.map((item) => item.id)).order('candidate_slot')
        if (candidateResult.error) throw new ChannelSystemPersistenceError(`A/B 후보 조회 실패: ${candidateResult.error.message}`)
        candidates = candidateResult.data || []
      }
    }
    return {
      review,
      plan,
      entitledPromptTier: plan === 'free' ? 'compact' : 'studio',
      batch: batch ? mapBatch(batch) : null,
      items: items.map((item) => mapItem(
        item,
        candidates.filter((candidate) => candidate.queue_item_id === item.id),
      )),
    }
  }

  return {
    getContext,

    async prepare(channelId: string, episodeId: string) {
      const context = await getContext(channelId, episodeId)
      if (context.review.episode.status !== 'approved') {
        throw new ChannelSystemPersistenceError('승인된 Episode만 Generation Queue를 준비할 수 있습니다.')
      }
      if (context.batch) return context
      const dna = await loadDna(client, context.review.dnaVersion.id)
      const items = context.review.tracks.map((track) => {
        const prompt = compileTrackPrompt(dna, context.review.episode, track, context.entitledPromptTier)
        return {
          trackBlueprintId: track.id,
          stylePrompt: prompt.stylePrompt,
          excludePrompt: prompt.excludePrompt,
        }
      })
      const { error } = await client.rpc('create_episode_generation_queue', {
        p_channel_id: channelId,
        p_episode_id: episodeId,
        p_prompt_tier: context.entitledPromptTier,
        p_items: JSON.parse(JSON.stringify(items)) as Json,
      })
      if (error) throw new ChannelSystemPersistenceError(`Generation Queue 준비 실패: ${error.message}`, error.code)
      return getContext(channelId, episodeId)
    },

    async compileLyrics(channelId: string, episodeId: string, itemId: string) {
      const context = await getContext(channelId, episodeId)
      if (!context.batch) throw new ChannelSystemPersistenceError('Generation Queue를 먼저 준비해야 합니다.')
      const item = context.items.find((candidate) => candidate.id === itemId)
      if (!item) throw new ChannelSystemPersistenceError('Queue Item을 찾을 수 없습니다.')
      if (item.isInstrumental) return item
      if (!['awaiting_lyrics', 'failed'].includes(item.status)) return item
      const track = context.review.tracks.find((candidate) => candidate.id === item.trackBlueprintId)
      if (!track) throw new ChannelSystemPersistenceError('Track Blueprint를 찾을 수 없습니다.')

      const { data: claimed, error: claimError } = await client.from('generation_queue_items').update({
        status: 'compiling_lyrics', error_message: null,
      }).eq('id', itemId).eq('batch_id', context.batch.id)
        .in('status', ['awaiting_lyrics', 'failed']).select('id').maybeSingle()
      if (claimError) throw new ChannelSystemPersistenceError(`가사 작업 시작 실패: ${claimError.message}`)
      if (!claimed) {
        const refreshed = await getContext(channelId, episodeId)
        return refreshed.items.find((candidate) => candidate.id === itemId) || item
      }

      try {
        const { data: siblingRows, error: siblingError } = await client
          .from('generation_queue_items').select('content_hash')
          .eq('batch_id', context.batch.id).neq('id', itemId).neq('content_hash', '')
        if (siblingError) throw new Error(siblingError.message)
        const siblingHashes = new Set((siblingRows || []).map((row) => row.content_hash))
        let compiled: { sections: LyricsSection[]; lyricsPrompt: string; hash: string } | null = null

        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const topic = [
            `Use the approved song title "${track.songTitle}" exactly; do not replace it.`,
            `Episode scene: ${context.review.episode.situation}, ${context.review.episode.location}, ${context.review.episode.daypart}.`,
            `Unique lyrical theme: ${track.lyricTheme || track.narrativeBeat || track.arrangementVariation}.`,
            `This is Track ${track.trackNumber}; avoid phrases or hooks used by any other song in this episode.`,
            attempt > 1 ? `Rewrite with a completely different central object and hook. Retry ${attempt}.` : '',
          ].filter(Boolean).join(' ')
          const result = await generateLyrics({
            stylePrompt: item.stylePrompt,
            topic,
            language: language(track.lyricLanguage),
            vocalGender: vocalGender(track.vocalGender),
            durationSeconds: track.targetDurationSeconds,
            isPlaylistMode: false,
          })
          if (!('sections' in result)) throw new Error('단일 곡 가사 응답이 아닙니다.')
          const single = result as LyricsGeneratorResult
          const sections = single.sections
          const lyricsPrompt = single.lyricsPrompt || renderSections(sections)
          const hash = hashLyrics(lyricsPrompt)
          if (!siblingHashes.has(hash)) {
            compiled = { sections, lyricsPrompt, hash }
            break
          }
        }
        if (!compiled) throw new Error('다른 곡과 중복되지 않는 가사를 만들지 못했습니다.')

        const { data, error } = await client.from('generation_queue_items').update({
          lyrics_prompt: compiled.lyricsPrompt,
          lyrics_sections: JSON.parse(JSON.stringify(compiled.sections)) as Json,
          content_hash: compiled.hash,
          status: 'ready',
          error_message: null,
          compiled_at: new Date().toISOString(),
        }).eq('id', itemId).eq('batch_id', context.batch.id).select('*').single()
        if (error || !data) throw new Error(error?.message || '가사 저장 응답 없음')
        return mapItem(data)
      } catch (error) {
        const message = error instanceof Error ? error.message : '가사 컴파일 실패'
        await client.from('generation_queue_items').update({
          status: 'failed', error_message: message,
        }).eq('id', itemId).eq('batch_id', context.batch.id)
        throw new ChannelSystemPersistenceError(message)
      }
    },

    async selectMaster(channelId: string, episodeId: string, itemId: string, candidateId: string) {
      const context = await getContext(channelId, episodeId)
      const item = context.items.find((candidate) => candidate.id === itemId)
      if (!item) throw new ChannelSystemPersistenceError('Queue Item을 찾을 수 없습니다.')
      if (!item.candidates.some((candidate) => candidate.id === candidateId)) {
        throw new ChannelSystemPersistenceError('이 곡에 속하지 않은 A/B 후보입니다.')
      }
      const { error } = await client.rpc('select_generation_queue_master', {
        p_queue_item_id: itemId,
        p_candidate_id: candidateId,
      })
      if (error) throw new ChannelSystemPersistenceError(`Master 선택 실패: ${error.message}`, error.code)
      const refreshed = await getContext(channelId, episodeId)
      return refreshed.items.find((candidate) => candidate.id === itemId) || item
    },
  }
}

export async function getGenerationQueueService() {
  return createGenerationQueueService(await createClient())
}
