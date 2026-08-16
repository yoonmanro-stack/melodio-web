export type QaDecision = 'pass' | 'fail' | 'needs_review'

export const MUGSOUND_QA_POLICY = {
  technical: [
    'file_integrity', 'actual_duration', 'clipping', 'integrated_lufs',
    'true_peak_dbtp', 'sample_rate', 'bit_depth', 'leading_trailing_silence', 'checksum',
  ],
  listeningStage1: [
    'musical_coherence', 'artifact_free', 'intended_vocal_policy',
    'emotional_fit', 'energy_fit', 'conversation_intrusion', 'similarity_concern',
  ],
  listeningStage2: [
    'phase_fit', 'transition_fit', 'episode_energy_curve',
    'long_session_fatigue', 'cafe_speaker_translation', 'alternate_candidate_safety',
  ],
} as const

export interface QaFinding {
  gate: 'technical' | 'listening_stage_1' | 'listening_stage_2' | 'rights' | 'supply'
  criterion: string
  decision: QaDecision
  reviewerId: string
  reviewedAt: string
  notes: string
}

export function canFinalizeMaster(findings: QaFinding[]) {
  const requiredGates = {
    technical: MUGSOUND_QA_POLICY.technical,
    listening_stage_1: MUGSOUND_QA_POLICY.listeningStage1,
    listening_stage_2: MUGSOUND_QA_POLICY.listeningStage2,
  } as const
  return Object.entries(requiredGates).every(([gate, requiredCriteria]) => {
    const gateFindings = findings.filter((finding) => finding.gate === gate)
    return requiredCriteria.every((criterion) => gateFindings.some((finding) => (
      finding.criterion === criterion && finding.decision === 'pass'
    )))
  })
}
