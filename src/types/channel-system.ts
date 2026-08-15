/**
 * Melodio Channel System v1 도메인 타입
 *
 * 프리셋에서 바로 곡을 생성하던 기존 구조 위에
 * Channel DNA -> Listener Intent -> Episode -> Track Blueprint 계층을 추가한다.
 * 이 파일은 DB Row 타입이 아니라 제품 도메인의 단일 기준이다.
 */

/** 0~100 범위의 점수. 범위 검증은 런타임 validator가 담당한다. */
export type NormalizedScore = number

/** ISO 8601 형식의 날짜/시간 문자열. */
export type IsoDateTime = string

/** Channel DNA 필드의 변경 허용 수준. */
export type DnaLockMode = 'locked' | 'bounded' | 'free'

/** 청취자가 음악에 주의를 기울이는 정도. */
export type AttentionMode =
  | 'background'
  | 'semi_background'
  | 'listening'
  | 'immersive'

/** 채널 또는 에피소드가 허용하는 보컬 사용 수준. */
export type VocalTolerance = 'none' | 'minimal' | 'allowed' | 'preferred'

/** 플레이리스트 전체에서 의도한 에너지 변화 형태. */
export type EnergyCurve = 'flat' | 'rise' | 'fall' | 'arc' | 'multi_arc'

/** 청취자가 플리를 방문하는 최우선 목적. */
export type ListenerPrimaryPurpose =
  | 'recovery'
  | 'focus'
  | 'space_atmosphere'
  | 'movement'
  | 'memory_emotion'
  | 'story_immersion'

/** 기존 6대 카테고리. 탐색용 진열대이며 단일 제작 분류로 사용하지 않는다. */
export type DiscoveryConcept =
  | 'healing'
  | 'focus'
  | 'retro'
  | 'cafe'
  | 'drive'
  | 'story'

/**
 * 청취 목적 프로필.
 * 장르보다 먼저 결정되며 음악적 제약과 편성 규칙의 입력으로 사용한다.
 */
export interface ListenerIntentProfile {
  id: string
  channelId: string
  name: string
  primaryPurpose: ListenerPrimaryPurpose
  secondaryPurposes: string[]
  discoveryConcepts: DiscoveryConcept[]
  listenerPersona: string
  activity: string
  environment: string
  dayparts: string[]
  currentState: string
  desiredState: string
  desiredBehavior: string
  sessionMinutes: number
  attentionMode: AttentionMode
  vocalTolerance: VocalTolerance
  /** 낮을수록 급격한 전환·솔로·돌발음을 더 엄격히 금지한다. */
  interruptionTolerance: NormalizedScore
  targetEnergy: NormalizedScore
  targetEnergyCurve: EnergyCurve
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}
/** Channel DNA의 장기 브랜드 정체성. */
export interface ChannelIdentityDna {
  channelName: string
  promise: string
  audience: string[]
  signature: string
}

/** Channel DNA의 음악 제작 규칙. */
export interface ChannelMusicDna {
  primaryGenre: string
  allowedGenres: string[]
  forbiddenGenres: string[]
  bpmRange: [min: number, max: number]
  preferredKeys: string[]
  signatureInstruments: string[]
  optionalInstruments: string[]
  forbiddenInstruments: string[]
  vocalPolicy: VocalTolerance
  vocalGenders: string[]
  lyricLanguages: string[]
  era: string
  productionTextures: string[]
  forbiddenProductionTraits: string[]
  /** 유료 Studio Brief 컴파일러의 검수된 고정 블록. */
  baseStylePrompt: string
  /** 무료 사용자에게 제공되는 200자 이내의 태그 기반 프롬프트. */
  compactTagPrompt: string
}

/** Channel DNA의 비주얼 제작 규칙. */
export interface ChannelVisualDna {
  world: string
  recurringSubjects: string[]
  locations: string[]
  palette: string[]
  lighting: string[]
  cameraLanguage: string[]
  eras: string[]
  allowedWeather: string[]
  forbiddenElements: string[]
}

/** 제목·설명·언어 등 채널의 편집 문법. */
export interface ChannelEditorialDna {
  titleVoice: string
  descriptionVoice: string
  languages: string[]
  emojiPolicy: 'none' | 'limited' | 'allowed'
  signaturePhrases: string[]
  forbiddenClaims: string[]
}

/**
 * 수년간 유지되는 채널 제작 헌장.
 * fieldLocks의 키는 `music.primaryGenre` 같은 점 표기 필드 경로다.
 */
export interface ChannelDna {
  identity: ChannelIdentityDna
  music: ChannelMusicDna
  visual: ChannelVisualDna
  editorial: ChannelEditorialDna
  fieldLocks: Record<string, DnaLockMode>
}

/** 승인된 변경마다 생성되는 불변 Channel DNA 버전. */
export interface ChannelDnaVersion {
  id: string
  channelId: string
  version: number
  dna: ChannelDna
  changeSummary: string
  createdBy: string
  createdAt: IsoDateTime
}

/** 에피소드에 적용된 Accent Preset과 혼합 비율. */
export interface EpisodeAccentBlend {
  presetId: string
  /** 0~100. 모든 Accent 합계는 Channel DNA 허용 범위를 넘어서는 안 된다. */
  blendPercent: number
}

export type EpisodeStatus =
  | 'draft'
  | 'planned'
  | 'approved'
  | 'generating'
  | 'assembling'
  | 'completed'
  | 'archived'

/** 한 번의 장시간 플레이리스트 업로드를 위한 기획 단위. */
export interface ChannelEpisode {
  id: string
  channelId: string
  dnaVersionId: string
  listenerIntentProfileId: string
  episodeTitle: string
  situation: string
  location: string
  daypart: string
  season?: string
  weather?: string
  emotionalArc: string
  /** 기본 Listener Intent에서 이번 에피소드만 변경하는 값. */
  listenerIntentOverrides: Partial<
    Omit<
      ListenerIntentProfile,
      'id' | 'channelId' | 'name' | 'createdAt' | 'updatedAt'
    >
  >
  accentPresets: EpisodeAccentBlend[]
  targetDurationSeconds: number
  plannedTrackCount: number
  vocalTrackPercent: number
  status: EpisodeStatus
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** 플레이리스트 안에서 한 곡이 담당하는 기능적 역할. */
export type TrackRole =
  | 'opening'
  | 'immersion'
  | 'steady'
  | 'rise'
  | 'peak'
  | 'release'
  | 'reprise'
  | 'closing'

export type TrackBlueprintStatus =
  | 'draft'
  | 'approved'
  | 'generating'
  | 'generated'
  | 'rejected'

/** 실제 음악·가사 생성 전에 확정하는 곡별 제작 계획. */
export interface TrackBlueprint {
  id: string
  episodeId: string
  trackNumber: number
  songTitle: string
  role: TrackRole
  energy: NormalizedScore
  bpm: number
  musicalKey: string
  leadInstrument: string
  supportInstruments: string[]
  isInstrumental: boolean
  vocalGender?: string
  lyricLanguage?: string
  lyricTheme?: string
  narrativeBeat?: string
  arrangementVariation: string
  targetDurationSeconds: number
  /** 생성 완료 후 측정된 실제 길이. 기획 단계에서는 비어 있다. */
  actualDurationSeconds?: number
  stylePrompt?: string
  excludePrompt?: string
  status: TrackBlueprintStatus
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}
