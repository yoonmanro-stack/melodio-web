import type { EnergyCurve } from '../../types'

/** Channel System 기반 Autopilot이 매 실행마다 새 Episode를 만드는 규칙. */
export interface AutopilotEpisodeStrategy {
  enabled: boolean
  targetDurationSeconds: number
  plannedTrackCount: number
  vocalTrackPercent: number
  energyCurve: EnergyCurve
  /** 최근 몇 개 Episode와 제목·상황·비주얼 중복을 비교할지 지정한다. */
  recentEpisodeLookback: number
  /** 계절·날씨·시간대 Accent를 자동 선택할 수 있는 최대 합계 비율. */
  maxAccentBlendPercent: number
  requirePlanApproval: boolean
  requireSampleApproval: boolean
}
/** 기존 audio_preset_id 자동화와 병행하는 점진적 연결 계약. */
export interface AutopilotChannelBinding {
  youtubeAutomationId: string
  /** 없으면 기존 audio_preset_id 플로우를 사용한다. */
  channelBlueprintId?: string
  legacyAudioPresetId: string
  episodeStrategy?: AutopilotEpisodeStrategy
}

export const DEFAULT_AUTOPILOT_EPISODE_STRATEGY: AutopilotEpisodeStrategy = {
  enabled: true,
  targetDurationSeconds: 7200,
  plannedTrackCount: 20,
  vocalTrackPercent: 0,
  energyCurve: 'arc',
  recentEpisodeLookback: 12,
  maxAccentBlendPercent: 30,
  requirePlanApproval: true,
  requireSampleApproval: true,
}

export type AutopilotExecutionMode = 'legacy_preset' | 'channel_episode'

export function resolveAutopilotExecutionMode(
  binding: Pick<AutopilotChannelBinding, 'channelBlueprintId' | 'episodeStrategy'>,
): AutopilotExecutionMode {
  return binding.channelBlueprintId && binding.episodeStrategy?.enabled
    ? 'channel_episode'
    : 'legacy_preset'
}
