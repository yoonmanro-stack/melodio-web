import type { LyricsSection } from './index'

/** 플레이리스트 내의 개별 트랙 구조 */
export interface PlaylistTrack {
  trackNumber: number
  title: string
  youtubeTags: string
  snsHashtags: string
  sections: LyricsSection[]
}

/** 10곡 플레이리스트 일괄 생성 최종 결과 구조 */
export interface PlaylistGeneratorResult {
  playlistTitle: string
  youtubeDescription: string
  youtubeTags: string
  snsHashtags: string
  tracks: PlaylistTrack[]
}
