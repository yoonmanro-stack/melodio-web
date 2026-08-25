export interface LibraryPlaylistTrack {
  itemId: string
  generationId: string
  title: string
  audioUrl: string
  isPlayable: boolean
  coverArtUrl: string | null
  durationSeconds: number | null
  audioGrade: string | null
  position: number
  addedAt: string
  createdAt: string
}

export interface LibraryPlaylist {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  tracks: LibraryPlaylistTrack[]
}

export interface PlaylistMutationResult {
  added?: boolean
  removed?: boolean
  reordered?: boolean
  itemId?: string
  position?: number
  count?: number
  updatedAt?: string
}

export interface PlaylistApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
  field?: string
}
