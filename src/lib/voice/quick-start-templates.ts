/** Musical starting points, not prerecorded singers or fixed voice identities. */
export interface QuickStartTemplate {
  name: string
  displayName: string
  genre: 'ballad' | 'rock' | 'pop' | 'jazz' | 'rnb' | 'acoustic' | 'hiphop' | 'dance'
  description: string
  physical_layers: {
    gender: 'female' | 'male'
    age: 'young' | 'mature'
    pitch: number
    brightness: number
    chest: number
    head: number
    weight: number
  }
  textures: string[]
  emotions: string[]
  performance: { power: number; dynamics: number; vibrato: number; groove: number }
  reverb: string
  noise_entropy: number
  delivery: string
}

export const QUICK_START_TEMPLATES = {
  whisperer: {
    name: 'Warm Lofi Whisperer', displayName: '감성 발라드 (Warm Whisperer)', genre: 'ballad',
    description: '숨결과 낮은 벨벳 울림, 절제된 떨림으로 가까이 속삭이는 여성 보컬',
    physical_layers: { gender: 'female', age: 'mature', pitch: 42, brightness: 32, chest: 72, head: 35, weight: 58 },
    textures: ['Velvet', 'Breathy', 'Smoky'], emotions: ['Calm', 'Lonely'],
    performance: { power: 32, dynamics: 64, vibrato: 28, groove: 42 },
    reverb: 'Studio', noise_entropy: 8,
    delivery: 'Soft breath-led onsets over supported low notes; intimate phrasing, restrained phrase-tail vibrato.',
  },
  belter: {
    name: 'Steel Heavy Belter', displayName: '파워풀 락 보컬 (Steel Belter)', genre: 'rock',
    description: '두꺼운 흉성과 거친 금속성 배음, 후렴에서 힘 있게 터지는 남성 보컬',
    physical_layers: { gender: 'male', age: 'mature', pitch: 48, brightness: 72, chest: 90, head: 56, weight: 88 },
    textures: ['Rough', 'Metallic', 'Wood'], emotions: ['Powerful', 'Passionate'],
    performance: { power: 92, dynamics: 88, vibrato: 58, groove: 62 },
    reverb: 'Arena', noise_entropy: 12,
    delivery: 'Grainy chest-led belt; controlled rasp on peaks, grounded verses and decisive consonants.',
  },
  diva: {
    name: 'Crystal Pop Diva', displayName: '청아한 소프라노 (Crystal Diva)', genre: 'pop',
    description: '맑은 소프라노의 두성 울림과 길게 이어지는 고음, 정교한 여성 팝 보컬',
    physical_layers: { gender: 'female', age: 'young', pitch: 85, brightness: 86, chest: 36, head: 90, weight: 42 },
    textures: ['Crystal', 'Silky', 'Clean'], emotions: ['Hopeful', 'Romantic'],
    performance: { power: 72, dynamics: 76, vibrato: 64, groove: 58 },
    reverb: 'Concert Hall', noise_entropy: 6,
    delivery: 'Connected soprano legato; ringing sustained highs with even support and precise phrase endings.',
  },
  baritone: {
    name: 'Midnight Velvet Baritone', displayName: '재즈 벨벳 바리톤 (Midnight Baritone)', genre: 'jazz',
    description: '깊고 어두운 중저음과 스모키한 결, 박자 뒤에 여유 있게 놓이는 남성 보컬',
    physical_layers: { gender: 'male', age: 'mature', pitch: 22, brightness: 28, chest: 92, head: 24, weight: 86 },
    textures: ['Velvet', 'Smoky', 'Wood'], emotions: ['Romantic', 'Calm'],
    performance: { power: 46, dynamics: 62, vibrato: 54, groove: 72 },
    reverb: 'Studio', noise_entropy: 10,
    delivery: 'Rounded low-register resonance; conversational crooning slightly behind the beat, unhurried releases.',
  },
  soul: {
    name: 'Golden Retro Soul', displayName: '레트로 R&B 소울 (Golden Retro Soul)', genre: 'rnb',
    description: '굵은 중음에 거친 숨결과 유연한 꺾임, 리듬을 타는 성숙한 여성 소울 보컬',
    physical_layers: { gender: 'female', age: 'mature', pitch: 52, brightness: 54, chest: 80, head: 58, weight: 74 },
    textures: ['Smoky', 'Rough', 'Velvet'], emotions: ['Passionate', 'Lonely'],
    performance: { power: 76, dynamics: 88, vibrato: 74, groove: 88 },
    reverb: 'Studio', noise_entropy: 14,
    delivery: 'Gravel-edged soulful midrange; elastic syncopation, selective melisma and a chest-to-head lift.',
  },
  indie: {
    name: 'Indie Acoustic Breeze', displayName: '인디 어쿠스틱 브리즈 (Acoustic Breeze)', genre: 'acoustic',
    description: '가벼운 면 같은 질감과 자연스러운 숨결, 말하듯 담백한 여성 포크 보컬',
    physical_layers: { gender: 'female', age: 'young', pitch: 62, brightness: 62, chest: 44, head: 54, weight: 35 },
    textures: ['Cotton', 'Breathy', 'Wood'], emotions: ['Calm', 'Dreamy'],
    performance: { power: 42, dynamics: 62, vibrato: 22, groove: 54 },
    reverb: 'Rain Cafe', noise_entropy: 12,
    delivery: 'Speech-like folk phrasing, light unforced attacks and natural breaths; mostly straight sustained notes.',
  },
  hiphop: {
    name: 'Street Lyricist Rap', displayName: '트렌디 힙합 래퍼 (Street Lyricist)', genre: 'hiphop',
    description: '거친 중저음, 선명한 자음과 리듬을 밀고 당기는 타이트한 남성 랩 보컬',
    physical_layers: { gender: 'male', age: 'young', pitch: 35, brightness: 60, chest: 80, head: 38, weight: 72 },
    textures: ['Rough', 'Metallic'], emotions: ['Powerful', 'Dark'],
    performance: { power: 82, dynamics: 82, vibrato: 8, groove: 94 },
    reverb: 'Studio', noise_entropy: 10,
    delivery: 'Percussive rap consonants and controlled low-mid grit; varied rhythmic flow, tight ends, minimal vibrato.',
  },
  dance: {
    name: 'Neon Electro Diva', displayName: '일렉트릭 댄스 디바 (Neon Electro Diva)', genre: 'dance',
    description: '밝고 단단한 금속성 울림, 짧고 탄력 있는 어택의 에너지 넘치는 여성 보컬',
    physical_layers: { gender: 'female', age: 'young', pitch: 74, brightness: 88, chest: 58, head: 78, weight: 60 },
    textures: ['Metallic', 'Crystal'], emotions: ['Hopeful', 'Powerful'],
    performance: { power: 88, dynamics: 68, vibrato: 34, groove: 90 },
    reverb: 'Arena', noise_entropy: 6,
    delivery: 'Bright forward mixed-register hook; punchy short attacks, repeatable rhythmic accents and firm sustain.',
  },
} satisfies Record<string, QuickStartTemplate>

export type QuickStartTemplateId = keyof typeof QUICK_START_TEMPLATES
