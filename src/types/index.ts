// ============================================================
// Melodio — 핵심 TypeScript 타입 정의
// ============================================================

/** 장르 태그 단일 항목 */
export interface Tag {
  label: string
  value: string
  level: 1 | 2 | 3  // 1: 핵심 가이드, 2: 사운드 구성, 3: 디테일 톤
}

/** Sub-genre 구조 (2단계 장르 지원) */
export interface SubGenre {
  id: string
  label: string
  tags: Tag[]
}

/** 프롬프트 빌더 카테고리 */
export interface Category {
  id: string
  number: number
  icon: string
  title: string
  desc: string
  placeholder: string
  tags: Tag[]
}

/** 2단계 장르 카테고리 (Primary → Sub-genre) */
export interface GenreCategory {
  id: string
  number: number
  icon: string
  title: string
  desc: string
  placeholder: string
  subGenres: SubGenre[]
}

/** 프리셋 */
export interface Preset {
  id: string
  emoji: string
  name: string
  desc: string
  gradient: string
  selections: Record<string, string[]>
  lyricsTemplate?: string
  customPrompt?: string
  excludePrompt?: string
  isDb?: boolean
  updated_at?: string
  metadata?: Record<string, any>
  name_ko?: string
  name_en?: string
  name_ja?: string
  name_es?: string
  name_fr?: string
  name_de?: string
  name_pt?: string
  name_zh?: string
  name_it?: string
  name_hi?: string
  desc_ko?: string
  desc_en?: string
  desc_ja?: string
  desc_es?: string
  desc_fr?: string
  desc_de?: string
  desc_pt?: string
  desc_zh?: string
  desc_it?: string
  desc_hi?: string
  [key: string]: any
}

/** 선택된 태그 상태 (카테고리ID → 선택된 value 배열) */
export type TagSelections = Record<string, string[]>

/** 가사 빌더 섹션 타입 */
export type LyricsSectionType = 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro' | 'intro'

/** 가사 섹션 */
export interface LyricsSection {
  id: string
  type: LyricsSectionType
  content: string
  /** 섹션별 연주 지시어 (예: "soft felt piano, vinyl crackle") → [Intro: soft felt piano, vinyl crackle] */
  description?: string
}

/** 음악 생성 엔진 */
export type MusicEngine = 'lyria3' | 'suno_v5' | 'auto'

/** 완성된 프롬프트 페이로드 */
export interface PromptPayload {
  title?: string
  stylePrompt: string
  lyricsPrompt: string
  /** 제외할 요소 (예: "no autotune, no heavy compression") */
  excludePrompt?: string
  engine: MusicEngine
  isInstrumental: boolean
  sunoVersion?: string
  tags?: {
    youtubeTags: string
    snsHashtags: string
  }
  metadata: {
    primaryGenre: string
    subGenre: string
    bpm: string
    mood: string
    ambienceVolume?: number
    dynamicElements?: any
  }
}

/** Suno V5 API 요청 (Mock 포함) */
export interface SunoGenerateRequest {
  prompt: string
  lyrics?: string
  tags?: string
  title?: string
  instrumental?: boolean
  model?: string
}

/** Lyria 3 API 요청 (Mock 포함) */
export interface LyriaGenerateRequest {
  prompt: string
  durationSeconds?: number
  sampleRate?: 48000
}

/** 생성된 트랙 결과 */
export interface GeneratedTrack {
  id: string
  title: string
  audioUrl: string
  duration: number
  engine: MusicEngine
  stylePrompt: string
  coverArtUrl?: string
  createdAt: string
}
