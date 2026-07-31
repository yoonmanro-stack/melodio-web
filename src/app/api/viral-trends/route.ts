import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Spotify & TikTok 실시간 음악 바이럴 핫 키워드 데이터셋 (주간 단위 주기적 업데이트)
const VIRAL_TRENDS_DATA = {
  spotify: [
    {
      id: 'sp-1',
      name: 'Cozy Rainy Attic lofi',
      genre: 'Lofi Hip-Hop',
      tags: 'tranquil lofi hip-hop, soft electric piano loop, mellow round bassline, laid-back swingy rhythm, muted snare, atmospheric rain sounds, key of D minor, 74 BPM, professional studio mix',
      emoji: '🌧️',
      description: '비오는 다락방의 감성이 느껴지는 차분하고 평온한 재즈 lofi 스타일'
    },
    {
      id: 'sp-2',
      name: 'Late Night Neon Highway',
      genre: 'Synthwave / Retro',
      tags: 'retro synthwave, neon noir, analog warm synthesizer chords, driving arpeggiated bassline, tight punchy 80s drums, spatial reverb, tape saturation, 110 BPM, master quality',
      emoji: '🚗',
      description: '도시의 네온사인 아래를 달리는 듯한 레트로 감각의 80년대 일렉트로'
    },
    {
      id: 'sp-3',
      name: 'Ethereal Cloud Ambient',
      genre: 'Ambient / Chillout',
      tags: 'ethereal cinematic ambient, lush floating synth pads, warm acoustic guitar plucks, slow swelling textures, spacious reverb, peaceful organic sounds, 68 BPM, high-fidelity mix',
      emoji: '☁️',
      description: '구름 위를 떠다니는 듯한 몽환적이고 평화로운 힐링 사운드스케이프'
    }
  ],
  tiktok: [
    {
      id: 'tt-1',
      name: 'Nostalgic Tape Whisper',
      genre: 'Chillhop / Bedroom Pop',
      tags: 'nostalgic bedroom pop, fuzzy tape hiss, warm acoustic guitar strumming, lazy vinyl beat, soft melodic keys, vintage character, 78 BPM, radio ready mastering',
      emoji: '📼',
      description: '따뜻한 카세트테이프 질감의 복고풍 침실 팝 감성'
    },
    {
      id: 'tt-2',
      name: 'Vibrant Sunshine Pop',
      genre: 'Indie Pop / Upbeat',
      tags: 'vibrant indie pop, bright acoustic guitar strumming, catchy whistle hook, bouncing bassline, cheerful handclaps, warm vocals tone, 116 BPM, professional grade audio',
      emoji: '☀️',
      description: '햇살 가득한 여름날의 설렘을 노래하는 밝고 에너지 넘치는 인디팝'
    },
    {
      id: 'tt-3',
      name: 'Cyberpunk Cyber-Underground',
      genre: 'Phonk / Dark Trap',
      tags: 'dark phonk, distorted cowbell melody, heavy sliding 808 bass, punchy trap beat, gritty underground atmosphere, high energy, 130 BPM, ultra loud master',
      emoji: '🔥',
      description: '어두운 사이버 세계관을 묵직한 베이스로 담아낸 힙한 숏폼 대세 퐁크(Phonk)'
    }
  ]
}

export async function GET() {
  try {
    return NextResponse.json({ success: true, trends: VIRAL_TRENDS_DATA })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
