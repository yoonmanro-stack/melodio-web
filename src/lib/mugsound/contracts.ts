export const MUGSOUND_MANIFEST_VERSION = '1.0' as const

export type SupplyStatus = 'draft' | 'qa' | 'approved' | 'suspended' | 'withdrawn'
export type RightsStatus = 'pending' | 'cleared' | 'restricted' | 'expired'
export type EpisodePhase = 'arrival' | 'settle' | 'engage' | 'release'
export type VocalType = 'instrumental' | 'texture' | 'vocal'

export interface PlaybackAccess {
  type: 'asset_reference' | 'signed_url'
  reference: string
  expiresAt?: string
}

export interface MugSoundManifestTrack {
  assetId: string
  assetVersion: number
  title: string
  /** 기본 편성의 전체 순서. 대체 후보는 null이다. */
  position: number | null
  phase: EpisodePhase
  /** Phase 안의 기본 순서 또는 후보 우선순위. */
  phasePosition: number
  placement: 'default' | 'alternate'
  durationSeconds: number
  bpm: number
  energy: number
  warmth: number
  emotionalStart: string
  emotionalEnd: string
  vocalType: VocalType
  timbreProfile: string[]
  recommendedPreviousPhase: EpisodePhase[]
  recommendedNextPhase: EpisodePhase[]
  bridgeEligible: boolean
  bridgeDirections: string[]
  similarityRisk: 'low' | 'review' | 'high'
  technicalQa: 'pending' | 'passed' | 'failed'
  emotionalQa: 'pending' | 'passed' | 'failed'
  explicitContent: boolean
  supplyStatus: SupplyStatus
  rightsStatus: RightsStatus
  transitionInSeconds: number
  transitionOutSeconds: number
  recommendedCrossfadeSeconds: number
  playbackAccess: PlaybackAccess
}

export interface MugSoundVisualDirection {
  temperatureStart: number
  temperatureEnd: number
  motif: 'steam' | 'ripple' | 'temperature' | 'steam_and_ripple'
  colorChipCandidates: string[]
  textureProfile?: string
  motionCurve?: string
}

export interface MugSoundReleaseManifest {
  manifestVersion: typeof MUGSOUND_MANIFEST_VERSION
  releaseId: string
  releaseVersion: number
  title: string
  durationSeconds: number
  currentState: string
  targetState: string
  primaryIntent: 'conversation' | 'focus' | 'rest' | 'dwell'
  supplyStatus: SupplyStatus
  rightsStatus: RightsStatus
  allowedTerritories: string[]
  validFrom: string
  validUntil: string | null
  visualDirection: MugSoundVisualDirection
  tracks: MugSoundManifestTrack[]
}

export interface EpisodeTrackPlacement {
  assetId: string
  assetVersion: number
  phase: EpisodePhase
  phasePosition: number
  placement: 'default' | 'alternate'
}

export interface EpisodePhaseBlueprint {
  phase: EpisodePhase
  startMinute: number
  endMinute: number
  targetEnergy: number
  role: string
  minimumAlternateTracks: number
}

export interface MugSoundEpisodeBlueprint {
  episodeId: string
  title: string
  priority: 'required' | 'optional'
  daypartOrSituation: string
  currentState: string
  targetState: string
  primaryIntent: MugSoundReleaseManifest['primaryIntent']
  emotionalArc: string[]
  energyCurve: number[]
  vocalPolicy: 'none' | 'limited_texture'
  /** Day Program에서 이 감정 장면을 운용하는 권장 시간. 승인 풀의 단순 합계가 아니다. */
  recommendedDurationMinutes: number
  approvedTrackTarget: { min: number; max: number }
  visualDirection: MugSoundVisualDirection
  phases: EpisodePhaseBlueprint[]
}
