export const MUGSOUND_GENERATION_POLICY = {
  engine: 'suno_v5',
  model: 'v5.5',
  initialCandidateCount: 2,
  maximumRetryCandidateCount: 2,
  maximumCandidateCountPerBlueprint: 4,
  retryMode: 'new_attempt',
  technicalPostProcessing: 'selected_candidate_only',
  listeningQaStages: 2,
  finalizeAfterQa: ['title', 'measured_metadata', 'asset_version'],
} as const

export type GenerationAttemptKind = 'initial' | 'retry'
export type ListeningQaStage = 'music_and_emotional_fit' | 'episode_and_space_fit'

/**
 * 한 Blueprint의 생성 이력. retry는 초기 A/B를 덮어쓰지 않는 별도 attempt다.
 */
export interface MugSoundGenerationAttempt {
  attemptNumber: 1 | 2
  kind: GenerationAttemptKind
  candidateLimit: 2
  engine: typeof MUGSOUND_GENERATION_POLICY.engine
  model: typeof MUGSOUND_GENERATION_POLICY.model
}
