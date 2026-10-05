export type VoiceDesignInput = {
  gender: 'female' | 'male'
  age: '20s' | '30s' | '40s' | '50plus'
  language: 'en' | 'ko' | 'ja' | 'fr'
  traits: readonly string[]
}

export type CompiledVoiceDesign = VoiceDesignInput & {
  stylePrompt: string
  sampleStylePrompt: string
  lyricsPrompt: string
  title: string
  designCode: string
  bpm: number
}

export const VOICE_DESIGN_TRAITS = [
  { id: 'register-low', label: '낮은 음역', group: 'register', prompt: 'low-register melodic center' },
  { id: 'register-middle', label: '중간 음역', group: 'register', prompt: 'comfortable middle-register center' },
  { id: 'register-high', label: '높은 음역', group: 'register', prompt: 'upper-register melodic center' },
  { id: 'register-wide', label: '넓은 음역', group: 'register', prompt: 'connected low-to-high register movement' },
  { id: 'body-light', label: '가벼운 울림', group: 'body', prompt: 'lightweight vocal body' },
  { id: 'body-rounded', label: '둥근 울림', group: 'body', prompt: 'rounded medium-weight vocal body' },
  { id: 'body-dense', label: '두터운 울림', group: 'body', prompt: 'dense weighty vocal core' },
  { id: 'body-chest', label: '깊은 흉성', group: 'body', prompt: 'chest-dominant grounded vocal body' },
  { id: 'texture-smooth', label: '매끈한 결', group: 'texture', prompt: 'smooth sustained vocal texture' },
  { id: 'texture-breathy', label: '숨결 섞인', group: 'texture', prompt: 'audible breath mixed with a voiced core' },
  { id: 'texture-husky', label: '허스키한', group: 'texture', prompt: 'smoky husky texture with soft grain' },
  { id: 'texture-raspy', label: '거친 결', group: 'texture', prompt: 'raspy grain on note attacks' },
  { id: 'texture-crackle', label: '지속되는 갈라진 결', group: 'texture', prompt: 'fine irregular vocal crackle throughout ordinary-volume sustained vowels' },
  { id: 'texture-gravel', label: '굵은 모래 같은 결', group: 'texture', prompt: 'dense coarse gravel around a firmly pitched core, present at ordinary intensity' },
  { id: 'texture-frayed', label: '갈라지는 시작음', group: 'texture', prompt: 'frayed voiced onsets that settle into a dry grainy sustained core' },
  { id: 'texture-creak', label: '갈라지는 끝음', group: 'texture', prompt: 'light creaking grain at phrase endings while retaining a melodic pitched core' },
  { id: 'texture-wiry', label: '가는 쇳결', group: 'texture', prompt: 'thin wiry scratch around a focused reedy pitched center' },
  { id: 'texture-matte', label: '마르고 매트한 결', group: 'texture', prompt: 'dry matte vocal grain with a stable voiced core and little breath leakage' },
  { id: 'resonance-dark', label: '어두운 공명', group: 'resonance', prompt: 'dark covered vowel resonance' },
  { id: 'resonance-open', label: '열린 공명', group: 'resonance', prompt: 'open spacious vowel resonance' },
  { id: 'resonance-forward', label: '앞으로 모이는', group: 'resonance', prompt: 'focused forward nasal resonance' },
  { id: 'resonance-warm', label: '따뜻한 공명', group: 'resonance', prompt: 'warm rounded vowel resonance' },
  { id: 'delivery-spoken', label: '말하듯 부르는', group: 'delivery', prompt: 'conversational speech-like singing' },
  { id: 'delivery-legato', label: '길게 이어 부르는', group: 'delivery', prompt: 'connected flowing legato phrasing' },
  { id: 'delivery-rhythmic', label: '리듬을 타는', group: 'delivery', prompt: 'short rhythmically accented phrases' },
  { id: 'delivery-relaxed', label: '느긋하게 부르는', group: 'delivery', prompt: 'relaxed slightly behind-beat phrasing' },
  { id: 'emotion-calm', label: '차분한', group: 'emotion', prompt: 'calm restrained emotional delivery' },
  { id: 'emotion-intimate', label: '친밀한', group: 'emotion', prompt: 'intimate personal emotional delivery' },
  { id: 'emotion-yearning', label: '애틋한', group: 'emotion', prompt: 'yearning emotionally weighted delivery' },
  { id: 'emotion-confident', label: '당당한', group: 'emotion', prompt: 'confident assured emotional delivery' },
  { id: 'articulation-soft', label: '부드러운 발음', group: 'articulation', prompt: 'soft consonant transitions' },
  { id: 'articulation-crisp', label: '또렷한 발음', group: 'articulation', prompt: 'precise crisp consonant articulation' },
  { id: 'articulation-rounded', label: '둥근 모음', group: 'articulation', prompt: 'rounded sustained vowel shapes' },
  { id: 'articulation-clipped', label: '짧게 끊는 발음', group: 'articulation', prompt: 'clipped percussive consonant endings' },
  { id: 'vibrato-straight', label: '곧은 음', group: 'vibrato', prompt: 'mostly straight sustained notes' },
  { id: 'vibrato-subtle', label: '미세한 떨림', group: 'vibrato', prompt: 'subtle narrow vibrato' },
  { id: 'vibrato-tail', label: '끝음의 떨림', group: 'vibrato', prompt: 'vibrato only at phrase endings' },
  { id: 'vibrato-broad', label: '넓은 떨림', group: 'vibrato', prompt: 'broad unhurried vibrato' },
] as const

const ages = {
  '20s': 'youthful adult vocal character',
  '30s': 'settled adult vocal character',
  '40s': 'mature adult vocal character',
  '50plus': 'seasoned mature adult vocal character',
} as const
const languages = { en: 'English', ko: 'Korean', ja: 'Japanese', fr: 'French' } as const
const lyrics = {
  en: '[Verse]\nA little light across the floor\nI hear the morning at my door\n[Chorus]\nWe take our time and let it grow\nA quiet song to carry home\n[Outro]\nA quiet song to carry home',
  ko: '[Verse]\n창가에 내려온 작은 빛 하나\n천천히 오늘의 문을 열어요\n[Chorus]\n서두르지 않아도 괜찮아요\n우리의 노래가 길을 비춰요\n[Outro]\n우리의 노래가 길을 비춰요',
  ja: '[Verse]\n窓辺に小さな光が落ちて\n静かな朝へと扉を開く\n[Chorus]\n急がなくても歩いてゆこう\n二人の歌が道を照らすよ\n[Outro]\n二人の歌が道を照らすよ',
  fr: '[Verse]\nUn peu de lumière au bord du matin\nJe laisse le jour retrouver son chemin\n[Chorus]\nOn prend notre temps sans courir plus loin\nUne chanson douce accompagne nos mains\n[Outro]\nUne chanson douce au creux du matin',
} as const

/** A deterministic timbre description, never a claim to reproduce a particular speaker. */
export function compileVoiceDesign(input: unknown): CompiledVoiceDesign {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('음색 디자인 설정을 확인해 주세요.')
  const value = input as Record<string, unknown>
  if (value.gender !== 'female' && value.gender !== 'male') throw new Error('여성 또는 남성 보컬을 선택해 주세요.')
  if (typeof value.age !== 'string' || !Object.hasOwn(ages, value.age)) throw new Error('연령감을 선택해 주세요.')
  if (typeof value.language !== 'string' || !Object.hasOwn(languages, value.language)) throw new Error('지원하는 가창 언어를 선택해 주세요.')
  if (!Array.isArray(value.traits) || value.traits.length < 1 || value.traits.length > 8) throw new Error('음색 특성을 1개부터 8개까지 선택해 주세요.')
  const selected = value.traits.map(id => {
    const trait = VOICE_DESIGN_TRAITS.find(item => item.id === id)
    if (!trait) throw new Error('지원하지 않는 음색 특성이 있습니다.')
    return trait
  })
  if (new Set(selected.map(trait => trait.group)).size !== selected.length) throw new Error('같은 분류의 음색 특성은 하나만 선택해 주세요.')
  // Catalog order makes the code and acoustic priorities stable across UI click order.
  const ordered = VOICE_DESIGN_TRAITS.filter(trait => selected.includes(trait))
  const gender = value.gender
  const age = value.age as VoiceDesignInput['age']
  const language = value.language as VoiceDesignInput['language']
  const traits = ordered.map(trait => trait.id)
  const stylePrompt = [`${gender} solo vocals`, ages[age], ...ordered.map(trait => trait.prompt)].join(', ')
  const sampleStylePrompt = [
    `${languages[language]} singing`, stylePrompt,
    '88 BPM, sparse minimal piano and bass, dry close foreground solo vocal',
    'sing immediately, no instrumental intro, no choir, no doubled lead, natural sung ending',
  ].join(', ')
  if (sampleStylePrompt.length >= 1000) throw new Error('음색 설명이 너무 깁니다.')
  const identity = JSON.stringify([1, gender, age, language, traits])
  let hash = 2166136261
  for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619) >>> 0
  return {
    stylePrompt, sampleStylePrompt, lyricsPrompt: lyrics[language], title: `${languages[language]} ${gender === 'female' ? '여성' : '남성'} 음색 디자인`,
    gender, age, language, traits, designCode: `VDES1-${hash.toString(16).padStart(8, '0')}`, bpm: 88,
  }
}
