import 'server-only'

import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ChannelDna, DiscoveryConcept } from '../../types'
import type { Database, Json } from '../../types/database'
import { createClient } from '../supabase/server'
import {
  ChannelSystemAuthenticationError,
  ChannelSystemPersistenceError,
} from './channel-builder-service'
import { createEpisodeAssemblyService, type EpisodeAssemblyContext } from './episode-assembly-service'
import { compilePublishPackage } from './publish-package-compiler'

type Client = SupabaseClient<Database>
type PackageRow = Database['public']['Tables']['episode_publish_packages']['Row']
type CoverRow = Database['public']['Tables']['episode_cover_assets']['Row']

export interface EpisodeCoverAsset {
  id: string
  status: CoverRow['status']
  source: CoverRow['source']
  prompt: string
  imageUrl?: string
  errorMessage?: string
}

export interface EpisodePublishPackage {
  id: string
  status: PackageRow['status']
  uploadTitle: string
  description: string
  tracklistText: string
  tags: string[]
  hashtags: string[]
  audioUrl: string
  coverPrompt: string
  selectedCoverAssetId?: string
}

export interface PublishPackageContext {
  assembly: EpisodeAssemblyContext
  publishPackage: EpisodePublishPackage | null
  covers: EpisodeCoverAsset[]
}

function strings(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function mapPackage(row: PackageRow): EpisodePublishPackage {
  return {
    id: row.id,
    status: row.status,
    uploadTitle: row.upload_title,
    description: row.description,
    tracklistText: row.tracklist_text,
    tags: strings(row.tags),
    hashtags: strings(row.hashtags),
    audioUrl: row.audio_url,
    coverPrompt: row.cover_prompt,
    selectedCoverAssetId: row.selected_cover_asset_id || undefined,
  }
}

function mapCover(row: CoverRow): EpisodeCoverAsset {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    prompt: row.prompt,
    imageUrl: row.image_url || undefined,
    errorMessage: row.error_message || undefined,
  }
}

async function requireUser(client: Client) {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new ChannelSystemAuthenticationError()
  return data.user
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new ChannelSystemPersistenceError('Supabase 관리자 환경 변수가 없습니다.')
  return createAdminClient<Database>(url, key, { auth: { persistSession: false } })
}

async function generateSquareCover(prompt: string): Promise<Buffer> {
  const apiKey = process.env.SUNO_API_KEY
  const apiUrl = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '')
  if (!apiKey) throw new ChannelSystemPersistenceError('이미지 생성 API 키가 설정되지 않았습니다.')
  const response = await fetch(`${apiUrl}/v1/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-2', prompt, n: 1, size: '1024x1024', output_format: 'png',
    }),
  })
  if (!response.ok) throw new ChannelSystemPersistenceError(`커버 이미지 생성 실패: ${await response.text()}`)
  const data = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const result = data.data?.[0]
  if (result?.b64_json) return Buffer.from(result.b64_json, 'base64')
  if (result?.url) {
    const download = await fetch(result.url)
    if (!download.ok) throw new ChannelSystemPersistenceError('생성된 커버 다운로드에 실패했습니다.')
    return Buffer.from(await download.arrayBuffer())
  }
  throw new ChannelSystemPersistenceError('이미지 생성 응답에 파일이 없습니다.')
}

export function createPublishPackageService(client: Client) {
  const assemblyService = createEpisodeAssemblyService(client)

  const getContext = async (channelId: string, episodeId: string): Promise<PublishPackageContext> => {
    await requireUser(client)
    const assembly = await assemblyService.getContext(channelId, episodeId)
    const packageResult = await client.from('episode_publish_packages').select('*').eq('episode_id', episodeId).maybeSingle()
    if (packageResult.error) throw new ChannelSystemPersistenceError(`Publish Package 조회 실패: ${packageResult.error.message}`)
    let covers: CoverRow[] = []
    if (packageResult.data) {
      const coverResult = await client.from('episode_cover_assets').select('*')
        .eq('package_id', packageResult.data.id).order('created_at', { ascending: false })
      if (coverResult.error) throw new ChannelSystemPersistenceError(`스틸 커버 조회 실패: ${coverResult.error.message}`)
      covers = coverResult.data || []
    }
    return {
      assembly,
      publishPackage: packageResult.data ? mapPackage(packageResult.data) : null,
      covers: covers.map(mapCover),
    }
  }

  return {
    getContext,

    async create(channelId: string, episodeId: string) {
      const user = await requireUser(client)
      const context = await getContext(channelId, episodeId)
      if (context.publishPackage) return context
      const assembly = context.assembly.assembly
      if (!assembly || assembly.status !== 'completed' || !assembly.outputAudioUrl) {
        throw new ChannelSystemPersistenceError('완료된 Episode Assembly가 필요합니다.')
      }
      const episode = context.assembly.queue.review.episode
      const [dnaResult, listenerResult] = await Promise.all([
        client.from('channel_dna_versions').select('identity_dna,music_dna,visual_dna,editorial_dna,field_locks')
          .eq('id', episode.dnaVersionId).single(),
        client.from('listener_intent_profiles').select('discovery_concepts')
          .eq('id', episode.listenerIntentProfileId).single(),
      ])
      if (dnaResult.error || !dnaResult.data) throw new ChannelSystemPersistenceError('Publish Package용 DNA를 불러오지 못했습니다.')
      const row = dnaResult.data
      const dna: ChannelDna = {
        identity: row.identity_dna as unknown as ChannelDna['identity'],
        music: row.music_dna as unknown as ChannelDna['music'],
        visual: row.visual_dna as unknown as ChannelDna['visual'],
        editorial: row.editorial_dna as unknown as ChannelDna['editorial'],
        fieldLocks: row.field_locks as unknown as ChannelDna['fieldLocks'],
      }
      const draft = compilePublishPackage(dna, episode, {
        channelName: context.assembly.queue.review.channel.name,
        channelPromise: context.assembly.queue.review.channel.promise,
        actualDurationSeconds: assembly.totalDurationSeconds,
        tracklistText: assembly.tracklistText,
        discoveryConcepts: (listenerResult.data?.discovery_concepts || []) as DiscoveryConcept[],
      })
      const { error } = await client.from('episode_publish_packages').insert({
        episode_id: episodeId,
        assembly_id: assembly.id,
        user_id: user.id,
        upload_title: draft.uploadTitle,
        description: draft.description,
        tracklist_text: assembly.tracklistText,
        tags: draft.tags as Json,
        hashtags: draft.hashtags as Json,
        audio_url: assembly.outputAudioUrl,
        cover_prompt: draft.coverPrompt,
      })
      if (error) throw new ChannelSystemPersistenceError(`Publish Package 생성 실패: ${error.message}`, error.code)
      return getContext(channelId, episodeId)
    },

    async update(channelId: string, episodeId: string, values: {
      uploadTitle: string; description: string; tags: string[]; hashtags: string[]; coverPrompt: string
    }) {
      const context = await getContext(channelId, episodeId)
      if (!context.publishPackage) throw new ChannelSystemPersistenceError('Publish Package가 없습니다.')
      const { error } = await client.from('episode_publish_packages').update({
        upload_title: values.uploadTitle.trim().slice(0, 200),
        description: values.description.trim(),
        tags: values.tags.slice(0, 30) as Json,
        hashtags: values.hashtags.slice(0, 15) as Json,
        cover_prompt: values.coverPrompt.trim().slice(0, 2000),
      }).eq('id', context.publishPackage.id)
      if (error) throw new ChannelSystemPersistenceError(`Publish Package 저장 실패: ${error.message}`)
      return getContext(channelId, episodeId)
    },

    async generateCover(channelId: string, episodeId: string) {
      const user = await requireUser(client)
      const context = await getContext(channelId, episodeId)
      const pack = context.publishPackage
      if (!pack) throw new ChannelSystemPersistenceError('Publish Package가 없습니다.')
      const { data: asset, error } = await client.from('episode_cover_assets').insert({
        package_id: pack.id, user_id: user.id, source: 'ai', status: 'generating', prompt: pack.coverPrompt,
      }).select('*').single()
      if (error || !asset) throw new ChannelSystemPersistenceError(`커버 작업 생성 실패: ${error?.message || '응답 없음'}`)
      try {
        const image = await generateSquareCover(pack.coverPrompt)
        const admin = adminClient()
        const filePath = `channel-episodes/${user.id}/${episodeId}/covers/${asset.id}.png`
        const upload = await admin.storage.from('melodio-assets').upload(filePath, image, { contentType: 'image/png', upsert: false })
        if (upload.error) throw new Error(upload.error.message)
        const imageUrl = admin.storage.from('melodio-assets').getPublicUrl(filePath).data.publicUrl
        const saved = await client.from('episode_cover_assets').update({ status: 'ready', image_url: imageUrl })
          .eq('id', asset.id).select('*').single()
        if (saved.error || !saved.data) throw new Error(saved.error?.message || '커버 저장 실패')
        return mapCover(saved.data)
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : '커버 생성 실패'
        await client.from('episode_cover_assets').update({ status: 'failed', error_message: message }).eq('id', asset.id)
        throw new ChannelSystemPersistenceError(message)
      }
    },

    async selectCover(channelId: string, episodeId: string, coverId: string) {
      const context = await getContext(channelId, episodeId)
      const pack = context.publishPackage
      const cover = context.covers.find((item) => item.id === coverId && item.status === 'ready')
      if (!pack || !cover) throw new ChannelSystemPersistenceError('선택할 수 있는 스틸 커버가 아닙니다.')
      const { error } = await client.from('episode_publish_packages').update({
        selected_cover_asset_id: coverId, status: 'ready',
      }).eq('id', pack.id)
      if (error) throw new ChannelSystemPersistenceError(`스틸 커버 선택 실패: ${error.message}`)
      return getContext(channelId, episodeId)
    },
  }
}

export async function getPublishPackageService() {
  return createPublishPackageService(await createClient())
}
