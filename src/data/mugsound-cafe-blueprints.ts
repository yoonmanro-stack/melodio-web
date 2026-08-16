import type { EpisodePhaseBlueprint, MugSoundEpisodeBlueprint } from '../lib/mugsound'

const phase = (
  name: EpisodePhaseBlueprint['phase'], startMinute: number, endMinute: number,
  targetEnergy: number, role: string, minimumAlternateTracks: number,
): EpisodePhaseBlueprint => ({ phase: name, startMinute, endMinute, targetEnergy, role, minimumAlternateTracks })

const phases = (energy: number[], roles: string[]): EpisodePhaseBlueprint[] => [
  phase('arrival', 0, 15, energy[0], roles[0], 2),
  phase('settle', 15, 35, energy[1], roles[1], 3),
  phase('engage', 35, 95, energy[2], roles[2], 6),
  phase('release', 95, 120, energy[3], roles[3], 2),
]

export const MUGSOUND_CAFE_CONCEPT = {
  id: 'ms-cafe-001',
  name: 'A Café That Slowly Warms',
  spaceType: 'cafe',
  emotionalDna: '낯섦을 낮추고 온기를 만들며 활동을 방해하지 않는다.',
  musicDna: '낮은 침범도, 부드러운 음색, 점진적인 에너지 변화, 장시간 피로 최소화',
  visualDna: ['steam', 'ripple', 'temperature'],
} as const

export const MUGSOUND_CAFE_EPISODE_BLUEPRINTS: MugSoundEpisodeBlueprint[] = [
  {
    episodeId: 'ms-ep-001', title: 'Warm Arrival', priority: 'required', recommendedDurationMinutes: 90, approvedTrackTarget: { min: 12, max: 15 },
    daypartOrSituation: '오전·오픈 직후', currentState: 'tension', targetState: 'settled_warmth', primaryIntent: 'dwell',
    emotionalArc: ['차가운 여백', '온기', '편안한 안착', '잔잔한 유지'], energyCurve: [25, 40, 45, 38], vocalPolicy: 'none',
    visualDirection: { temperatureStart: 32, temperatureEnd: 68, motif: 'steam_and_ripple', colorChipCandidates: ['#D5D8D6', '#CBBDA8', '#B7804E', '#6E4934'] },
    phases: phases([25, 40, 45, 38], ['외부 상태 완화', '온기 형성', '편안한 체류', '다음 편성 연결']),
  },
  {
    episodeId: 'ms-ep-002', title: 'Gentle Focus', priority: 'required', recommendedDurationMinutes: 120, approvedTrackTarget: { min: 16, max: 18 },
    daypartOrSituation: '업무·독서 시간', currentState: 'distracted', targetState: 'warm_focus', primaryIntent: 'focus',
    emotionalArc: ['분산', '정돈', '몰입', '피로 없는 유지'], energyCurve: [30, 38, 48, 42], vocalPolicy: 'none',
    visualDirection: { temperatureStart: 38, temperatureEnd: 64, motif: 'ripple', colorChipCandidates: ['#AEB8BE', '#8E9A9D', '#C49A68', '#8A6448'] },
    phases: phases([30, 38, 48, 42], ['주의 분산 완화', '리듬 정돈', '따뜻한 몰입', '피로 없는 유지']),
  },
  {
    episodeId: 'ms-ep-003', title: 'Conversation Glow', priority: 'required', recommendedDurationMinutes: 90, approvedTrackTarget: { min: 14, max: 17 },
    daypartOrSituation: '점심·오후 대화', currentState: 'social_awkwardness', targetState: 'comfortable_conversation', primaryIntent: 'conversation',
    emotionalArc: ['낯섦 완화', '온기 형성', '대화 리듬', '여운'], energyCurve: [35, 48, 55, 45], vocalPolicy: 'limited_texture',
    visualDirection: { temperatureStart: 45, temperatureEnd: 72, motif: 'steam_and_ripple', colorChipCandidates: ['#B9AAA0', '#D1AA7D', '#B9784E', '#745044'] },
    phases: phases([35, 48, 55, 45], ['낯섦 완화', '교류 온도 형성', '대화 리듬 지지', '부드러운 여운']),
  },
  {
    episodeId: 'ms-ep-004', title: 'Afternoon Lift', priority: 'optional', recommendedDurationMinutes: 90, approvedTrackTarget: { min: 0, max: 0 },
    daypartOrSituation: '오후 3~5시', currentState: 'sluggish', targetState: 'gentle_energy', primaryIntent: 'dwell',
    emotionalArc: ['무게 덜기', '리듬 깨우기', '밝은 에너지', '부드러운 지속'], energyCurve: [35, 52, 65, 52], vocalPolicy: 'limited_texture',
    visualDirection: { temperatureStart: 48, temperatureEnd: 78, motif: 'ripple', colorChipCandidates: ['#C8B89E', '#E2BA72', '#D58A42', '#95633E'] },
    phases: phases([35, 52, 65, 52], ['정체 완화', '리듬 활성화', '가벼운 활력', '과열 없는 지속']),
  },
  {
    episodeId: 'ms-ep-005', title: 'Rainy Shelter', priority: 'optional', recommendedDurationMinutes: 90, approvedTrackTarget: { min: 0, max: 0 },
    daypartOrSituation: '비 오는 날', currentState: 'tired_tense', targetState: 'sheltered_rest', primaryIntent: 'rest',
    emotionalArc: ['외부 자극 차단', '호흡 완화', '안정', '깊은 여운'], energyCurve: [28, 32, 38, 25], vocalPolicy: 'none',
    visualDirection: { temperatureStart: 30, temperatureEnd: 55, motif: 'temperature', colorChipCandidates: ['#7F8D96', '#A7B0B2', '#B39A7A', '#66574D'] },
    phases: phases([28, 32, 38, 25], ['외부 자극 차단', '호흡 완화', '안정 유지', '깊은 여운']),
  },
  {
    episodeId: 'ms-ep-006', title: 'Golden Close', priority: 'optional', recommendedDurationMinutes: 90, approvedTrackTarget: { min: 0, max: 0 },
    daypartOrSituation: '저녁·마감 전', currentState: 'busy_or_energized', targetState: 'satisfied_close', primaryIntent: 'dwell',
    emotionalArc: ['활력 정돈', '속도 완화', '여운', '종료 준비'], energyCurve: [55, 48, 38, 25], vocalPolicy: 'none',
    visualDirection: { temperatureStart: 76, temperatureEnd: 40, motif: 'temperature', colorChipCandidates: ['#D99A52', '#B87543', '#76503C', '#3F332E'] },
    phases: phases([55, 48, 38, 25], ['활력 정돈', '속도 완화', '여운 형성', '종료 준비']),
  },
]
