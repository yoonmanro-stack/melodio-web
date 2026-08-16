import type { EpisodePhase } from '../lib/mugsound'

export interface DirectionApprovalBlueprint {
  blueprintId: string
  episodeId: 'ms-ep-001' | 'ms-ep-002' | 'ms-ep-003'
  workingTitle: string
  phase: EpisodePhase
  targetEnergy: number
  targetWarmth: number
  targetBpm: number
  targetDurationSeconds: number
  bridgeDirection?: string
  stylePrompt: string
  excludePrompt: string
}

const exclude = [
  'vocals, spoken words, applause, audience noise, count-in, watermark',
  'dramatic intro, sudden ending, cinematic build, climax, drop',
  'catchy foreground melody, long silence, sound effects',
  'aggressive drums, trap hi-hats, club kick, oversized sub bass',
  'famous-song resemblance, unstable pitch, AI artifacts',
].join(', ')

export const MUGSOUND_DIRECTION_APPROVAL_BLUEPRINTS: DirectionApprovalBlueprint[] = [
  {
    blueprintId: 'ms-bp-wa-settle-01', episodeId: 'ms-ep-001', workingTitle: 'WA Settle Direction 01',
    phase: 'settle', targetEnergy: 34, targetWarmth: 62, targetBpm: 72, targetDurationSeconds: 240,
    stylePrompt: 'Instrumental warm minimal cafe music, 72 BPM, soft electric piano, muted nylon guitar, restrained acoustic bass, barely-there brushed percussion, cream-toned analog warmth, low melodic foreground, calm but awake, gentle forward motion, stable energy, natural 8-second intro and outro for crossfading, intimate small wooden room, clean midrange, no environmental sounds.',
    excludePrompt: exclude,
  },
  {
    blueprintId: 'ms-bp-wa-engage-01', episodeId: 'ms-ep-001', workingTitle: 'WA Engage Direction 01',
    phase: 'engage', targetEnergy: 43, targetWarmth: 70, targetBpm: 82, targetDurationSeconds: 240,
    bridgeDirection: 'ms-ep-001->ms-ep-003',
    stylePrompt: 'Instrumental warm restrained cafe groove, 82 BPM, soft electric piano chords, muted guitar responses, brushed percussion, rounded acoustic bass, welcoming and lightly active without sentimentality, low-density arrangement, melody stays behind conversation, consistent dynamics, transition-ready 8-second opening and ending, warm tape texture, clean non-muddy midrange.',
    excludePrompt: exclude,
  },
  {
    blueprintId: 'ms-bp-cg-settle-01', episodeId: 'ms-ep-003', workingTitle: 'CG Settle Direction 01',
    phase: 'settle', targetEnergy: 44, targetWarmth: 68, targetBpm: 84, targetDurationSeconds: 240,
    bridgeDirection: 'ms-ep-001->ms-ep-003',
    stylePrompt: 'Instrumental conversation-safe cafe music, 84 BPM, warm electric piano, muted guitar, restrained upright bass, soft brushes, open spaces between phrases, sociable warmth without a lead hook, voice-friendly midrange, steady understated pulse, no dramatic development, smooth 5-to-8-second crossfade handles, polished organic texture.',
    excludePrompt: exclude,
  },
  {
    blueprintId: 'ms-bp-cg-engage-01', episodeId: 'ms-ep-003', workingTitle: 'CG Engage Direction 01',
    phase: 'engage', targetEnergy: 53, targetWarmth: 72, targetBpm: 92, targetDurationSeconds: 240,
    bridgeDirection: 'ms-ep-003->ms-ep-002',
    stylePrompt: 'Instrumental-first warm cafe conversation groove, 92 BPM, soft electric piano comping, muted guitar texture, rounded bass, light brushed drums, an extremely subtle wordless vocal texture used only as distant color, never a lead, comfortable social rhythm, low attention capture, stable medium-low energy, smooth intro and outro for 5-to-8-second crossfades.',
    excludePrompt: `${exclude}, lyrics, lead vocal, vocal hook, drum fills`,
  },
  {
    blueprintId: 'ms-bp-gf-settle-01', episodeId: 'ms-ep-002', workingTitle: 'GF Settle Direction 01',
    phase: 'settle', targetEnergy: 35, targetWarmth: 58, targetBpm: 76, targetDurationSeconds: 240,
    bridgeDirection: 'ms-ep-003->ms-ep-002',
    stylePrompt: 'Instrumental warm focus music, 76 BPM, soft electric piano ostinato, muted guitar harmonics, restrained organic bass, minimal brushed pulse, gently organizing without sleepiness, subtle evolving detail, no obvious loop, low melodic foreground, stable dynamics, clean midrange, natural 8-second transition-ready opening and ending.',
    excludePrompt: `${exclude}, sleepy ambient drift, static repetitive loop`,
  },
  {
    blueprintId: 'ms-bp-gf-engage-01', episodeId: 'ms-ep-002', workingTitle: 'GF Engage Direction 01',
    phase: 'engage', targetEnergy: 46, targetWarmth: 64, targetBpm: 88, targetDurationSeconds: 240,
    bridgeDirection: 'ms-ep-002->closing_or_ms-ep-001',
    stylePrompt: 'Instrumental warm concentration groove, 88 BPM, soft electric piano pattern, muted guitar texture, subtle organic percussion, rounded controlled bass, focused and awake, gradual micro-variation without attention-grabbing solos, consistent medium-low energy, no cinematic arc, low fatigue over long listening, clean transition-ready 5-to-8-second intro and outro.',
    excludePrompt: `${exclude}, sleepy ambient drift, obvious short loop, foreground solo`,
  },
]
