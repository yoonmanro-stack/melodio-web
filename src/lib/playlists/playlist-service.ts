import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import type {
  LibraryPlaylist,
  LibraryPlaylistTrack,
  PlaylistMutationResult,
} from '@/types/library-playlist'
import { createClient } from '@/lib/supabase/server'
import {
  PlaylistAuthenticationError,
  PlaylistConflictError,
  PlaylistNotFoundError,
  PlaylistPersistenceError,
} from './playlist-errors'

type PlaylistClient = SupabaseClient<Database>
type PlaylistRow = Database['public']['Tables']['user_playlists']['Row']
type PlaylistItemRow = Database['public']['Tables']['user_playlist_items']['Row']
type GenerationRow = Database['public']['Tables']['generations']['Row']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseDurationSeconds(licenseHash: string | null): number | null {
  if (!licenseHash) return null
  try {
    const metadata = JSON.parse(licenseHash) as unknown
    if (!isRecord(metadata)) return null
    const raw = metadata.duration ?? metadata.durationSeconds
    const parsed = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
  } catch {
    return null
  }
}

function playableAudioUrl(generation: Pick<GenerationRow, 'audio_url' | 'source_audio_url'>): string | null {
  const url = generation.audio_url || generation.source_audio_url
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null
}

function parseMutationResult(value: Json): PlaylistMutationResult {
  if (!isRecord(value)) {
    throw new PlaylistPersistenceError('플레이리스트 변경 응답 형식이 올바르지 않습니다.')
  }
  return {
    added: typeof value.added === 'boolean' ? value.added : undefined,
    removed: typeof value.removed === 'boolean' ? value.removed : undefined,
    reordered: typeof value.reordered === 'boolean' ? value.reordered : undefined,
    itemId: typeof value.itemId === 'string' ? value.itemId : undefined,
    position: typeof value.position === 'number' ? value.position : undefined,
    count: typeof value.count === 'number' ? value.count : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  }
}

function mapDatabaseMutationError(error: { code?: string; message: string }): never {
  if (error.code === '42501') throw new PlaylistAuthenticationError()
  if (error.code === 'P0002') throw new PlaylistNotFoundError()
  if (error.code === '23505') throw new PlaylistConflictError('같은 이름 또는 곡이 이미 존재합니다.')
  if (error.code === '22023') throw new PlaylistConflictError('플레이리스트 곡 순서가 최신 상태와 다릅니다.')
  if (error.code === '40001') throw new PlaylistConflictError('다른 화면에서 플레이리스트가 변경되었습니다. 새로고침 후 다시 시도해주세요.')
  if (error.code === '54000') throw new PlaylistConflictError('플레이리스트에는 최대 500곡까지 담을 수 있습니다.')
  throw new PlaylistPersistenceError(error.message, error.code)
}

async function requireAuthenticatedUser(client: PlaylistClient): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new PlaylistAuthenticationError()
  return data.user.id
}

function mapPlaylist(
  playlist: PlaylistRow,
  items: PlaylistItemRow[],
  generations: Map<string, GenerationRow>,
): LibraryPlaylist {
  const tracks: LibraryPlaylistTrack[] = []

  for (const item of items) {
    const generation = generations.get(item.generation_id)
    if (!generation) continue
    const audioUrl = playableAudioUrl(generation)
    const isPlayable = generation.status === 'completed' && audioUrl !== null

    tracks.push({
      itemId: item.id,
      generationId: generation.id,
      title: generation.title || 'Untitled Track',
      audioUrl: audioUrl || '',
      isPlayable,
      coverArtUrl: generation.cover_art_url,
      durationSeconds: parseDurationSeconds(generation.license_hash),
      audioGrade: generation.audio_grade,
      position: item.position,
      addedAt: item.added_at,
      createdAt: generation.created_at,
    })
  }

  tracks.sort((a, b) => a.position - b.position || a.addedAt.localeCompare(b.addedAt))
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    createdAt: playlist.created_at,
    updatedAt: playlist.updated_at,
    tracks,
  }
}

export function createPlaylistService(client: PlaylistClient) {
  return {
    async listLibrary(): Promise<LibraryPlaylist[]> {
      const userId = await requireAuthenticatedUser(client)
      const { data: playlists, error: playlistError } = await client
        .from('user_playlists')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (playlistError) {
        throw new PlaylistPersistenceError(
          `플레이리스트 목록을 불러오지 못했습니다: ${playlistError.message}`,
          playlistError.code,
        )
      }
      if (!playlists.length) return []

      const playlistIds = playlists.map((playlist) => playlist.id)
      const { data: items, error: itemError } = await client
        .from('user_playlist_items')
        .select('*')
        .in('playlist_id', playlistIds)
        .order('position', { ascending: true })

      if (itemError) {
        throw new PlaylistPersistenceError(
          `플레이리스트 곡을 불러오지 못했습니다: ${itemError.message}`,
          itemError.code,
        )
      }

      const generationIds = [...new Set(items.map((item) => item.generation_id))]
      let generationRows: GenerationRow[] = []
      if (generationIds.length > 0) {
        const { data: generations, error: generationError } = await client
          .from('generations')
          .select('*')
          .eq('user_id', userId)
          .in('id', generationIds)

        if (generationError) {
          throw new PlaylistPersistenceError(
            `플레이리스트 원곡을 불러오지 못했습니다: ${generationError.message}`,
            generationError.code,
          )
        }
        generationRows = generations
      }

      const generations = new Map(generationRows.map((generation) => [generation.id, generation]))
      const itemsByPlaylist = new Map<string, PlaylistItemRow[]>()
      for (const item of items) {
        const bucket = itemsByPlaylist.get(item.playlist_id)
        if (bucket) bucket.push(item)
        else itemsByPlaylist.set(item.playlist_id, [item])
      }

      return playlists.map((playlist) =>
        mapPlaylist(playlist, itemsByPlaylist.get(playlist.id) || [], generations),
      )
    },

    async create(input: { name: string; description: string }): Promise<LibraryPlaylist> {
      const userId = await requireAuthenticatedUser(client)
      const { data, error } = await client
        .from('user_playlists')
        .insert({ user_id: userId, name: input.name, description: input.description })
        .select('*')
        .single()

      if (error) mapDatabaseMutationError(error)
      return mapPlaylist(data, [], new Map())
    },

    async update(
      playlistId: string,
      input: { name?: string; description?: string },
    ): Promise<LibraryPlaylist> {
      const userId = await requireAuthenticatedUser(client)
      const { data, error } = await client
        .from('user_playlists')
        .update(input)
        .eq('id', playlistId)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle()

      if (error) mapDatabaseMutationError(error)
      if (!data) throw new PlaylistNotFoundError('플레이리스트를 찾을 수 없습니다.')
      return mapPlaylist(data, [], new Map())
    },

    async delete(playlistId: string): Promise<void> {
      const userId = await requireAuthenticatedUser(client)
      const { data, error } = await client
        .from('user_playlists')
        .delete()
        .eq('id', playlistId)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle()

      if (error) mapDatabaseMutationError(error)
      if (!data) throw new PlaylistNotFoundError('플레이리스트를 찾을 수 없습니다.')
    },

    async addTrack(playlistId: string, generationId: string): Promise<PlaylistMutationResult> {
      await requireAuthenticatedUser(client)
      const { data, error } = await client.rpc('add_generation_to_user_playlist', {
        p_playlist_id: playlistId,
        p_generation_id: generationId,
      })
      if (error) mapDatabaseMutationError(error)
      return parseMutationResult(data)
    },

    async removeTrack(playlistId: string, itemId: string): Promise<PlaylistMutationResult> {
      await requireAuthenticatedUser(client)
      const { data, error } = await client.rpc('remove_user_playlist_item', {
        p_playlist_id: playlistId,
        p_item_id: itemId,
      })
      if (error) mapDatabaseMutationError(error)
      return parseMutationResult(data)
    },

    async reorderTracks(
      playlistId: string,
      itemIds: string[],
      expectedUpdatedAt: string,
    ): Promise<PlaylistMutationResult> {
      await requireAuthenticatedUser(client)
      const { data, error } = await client.rpc('reorder_user_playlist_items', {
        p_playlist_id: playlistId,
        p_item_ids: itemIds,
        p_expected_updated_at: expectedUpdatedAt,
      })
      if (error) mapDatabaseMutationError(error)
      return parseMutationResult(data)
    },
  }
}

export async function getPlaylistService() {
  return createPlaylistService(await createClient())
}
