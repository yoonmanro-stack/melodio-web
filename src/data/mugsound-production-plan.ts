import type { EpisodePhase } from '../lib/mugsound'

export interface PhaseProductionQuota {
  phase: EpisodePhase
  targetUniqueMasters: number
  targetEnergyRange: [number, number]
  bpmRange: [number, number]
  allowedLeadMaterials: string[]
  forbiddenTraits: string[]
}

export interface EpisodeProductionPlan {
  episodeId: 'ms-ep-001' | 'ms-ep-002' | 'ms-ep-003'
  targetUniqueMasters: number
  initialCandidateCount: number
  maximumRetryCandidateCount: number
  phaseQuotas: PhaseProductionQuota[]
}

const sharedForbidden = [
  'abrupt intro or ending',
  'dramatic drop or cinematic climax',
  'aggressive snare or trap hi-hat',
  'club kick or oversized sub bass',
  'recognizable melody resembling an existing song',
  'watermark, count-in, applause, speech, or broadcast sound',
]

export const MUGSOUND_REQUIRED_EPISODE_PRODUCTION: EpisodeProductionPlan[] = [
  {
    episodeId: 'ms-ep-001',
    targetUniqueMasters: 14,
    initialCandidateCount: 28,
    maximumRetryCandidateCount: 28,
    phaseQuotas: [
      { phase: 'arrival', targetUniqueMasters: 2, targetEnergyRange: [22, 30], bpmRange: [62, 76], allowedLeadMaterials: ['soft electric piano', 'felt piano', 'muted guitar'], forbiddenTraits: sharedForbidden },
      { phase: 'settle', targetUniqueMasters: 3, targetEnergyRange: [32, 42], bpmRange: [68, 82], allowedLeadMaterials: ['soft electric piano', 'nylon guitar', 'restrained acoustic texture'], forbiddenTraits: sharedForbidden },
      { phase: 'engage', targetUniqueMasters: 7, targetEnergyRange: [40, 48], bpmRange: [74, 90], allowedLeadMaterials: ['electric piano', 'muted guitar', 'brushed percussion'], forbiddenTraits: sharedForbidden },
      { phase: 'release', targetUniqueMasters: 2, targetEnergyRange: [32, 40], bpmRange: [64, 78], allowedLeadMaterials: ['felt piano', 'soft guitar harmonics', 'low organic ambience'], forbiddenTraits: sharedForbidden },
    ],
  },
  {
    episodeId: 'ms-ep-002',
    targetUniqueMasters: 18,
    initialCandidateCount: 36,
    maximumRetryCandidateCount: 36,
    phaseQuotas: [
      { phase: 'arrival', targetUniqueMasters: 3, targetEnergyRange: [27, 33], bpmRange: [66, 78], allowedLeadMaterials: ['soft electric piano', 'muted guitar', 'low-density pulse'], forbiddenTraits: [...sharedForbidden, 'foreground solo melody'] },
      { phase: 'settle', targetUniqueMasters: 3, targetEnergyRange: [34, 41], bpmRange: [72, 84], allowedLeadMaterials: ['electric piano ostinato', 'restrained acoustic texture', 'brushed percussion'], forbiddenTraits: [...sharedForbidden, 'foreground solo melody'] },
      { phase: 'engage', targetUniqueMasters: 9, targetEnergyRange: [43, 51], bpmRange: [78, 94], allowedLeadMaterials: ['soft electric piano', 'muted guitar pattern', 'subtle organic rhythm'], forbiddenTraits: [...sharedForbidden, 'foreground solo melody', 'high rhythmic complexity'] },
      { phase: 'release', targetUniqueMasters: 3, targetEnergyRange: [37, 44], bpmRange: [70, 84], allowedLeadMaterials: ['warm keys', 'soft guitar', 'minimal brushed rhythm'], forbiddenTraits: [...sharedForbidden, 'foreground solo melody'] },
    ],
  },
  {
    episodeId: 'ms-ep-003',
    targetUniqueMasters: 16,
    initialCandidateCount: 32,
    maximumRetryCandidateCount: 32,
    phaseQuotas: [
      { phase: 'arrival', targetUniqueMasters: 2, targetEnergyRange: [32, 39], bpmRange: [72, 84], allowedLeadMaterials: ['muted guitar', 'warm electric piano', 'soft brushed percussion'], forbiddenTraits: sharedForbidden },
      { phase: 'settle', targetUniqueMasters: 3, targetEnergyRange: [43, 51], bpmRange: [78, 92], allowedLeadMaterials: ['electric piano', 'muted guitar', 'restrained acoustic bass'], forbiddenTraits: sharedForbidden },
      { phase: 'engage', targetUniqueMasters: 8, targetEnergyRange: [50, 58], bpmRange: [84, 100], allowedLeadMaterials: ['warm keys', 'brushed rhythm', 'muted guitar', 'wordless vocal texture'], forbiddenTraits: [...sharedForbidden, 'lyrical or narrative vocal'] },
      { phase: 'release', targetUniqueMasters: 3, targetEnergyRange: [40, 47], bpmRange: [72, 86], allowedLeadMaterials: ['soft electric piano', 'muted guitar', 'wordless vocal texture'], forbiddenTraits: [...sharedForbidden, 'lyrical or narrative vocal'] },
    ],
  },
]

export const MUGSOUND_PRODUCTION_TOTALS = {
  targetUniqueMasters: 48,
  initialBlueprints: 48,
  initialCandidates: 96,
  maximumAdditionalCandidates: 96,
} as const
