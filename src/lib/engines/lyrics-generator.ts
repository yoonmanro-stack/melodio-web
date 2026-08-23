/**
 * Melodio — GPT-5.5-pro 기반 가사, 제목, 태그 및 10곡 플레이리스트 생성 엔진
 */

import type { LyricsSection, LyricsSectionType } from '@/types'
import type { PlaylistGeneratorResult, PlaylistTrack } from '@/types/playlist'
import { matchPlaybooksByPrompt } from '@/lib/db/knowledge'
import { generateBoundlessCreativeVector } from '@/lib/engines/infinite-story-matrix'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

import { loadVLEMasterPrompt } from '@/lib/vle/vleEngine';
import { buildStructureDirective, VIRAL_SONG_SPEC } from '@/lib/vle/viralSongSpec';

export interface GenerateLyricsParams {
  stylePrompt: string
  topic?: string
  language?: 'ko' | 'en' | 'ja' | 'ko-en' | 'ja-en' | 'fr' | 'zh' | 'es' | 'pt' | 'de' | 'it' | 'hi' | 'ru' | 'ar'
  isPlaylistMode?: boolean
  trackCount?: number
  vocalGender?: 'mixed' | 'female' | 'male' | 'duet'
  presetId?: string
  /** 목표 음원 길이 (초). Suno는 가사 분량으로 곡 길이를 제어하므로 필수. */
  durationSeconds?: number
  /** 풍자곡/숏폼 모드 여부 */
  viralMode?: boolean
}

export interface LyricsGeneratorResult {
  title: string
  youtubeTags: string
  snsHashtags: string
  sections: LyricsSection[]
  lyricsPrompt?: string
}

interface GPTLyricsSection {
  type: LyricsSectionType
  content: string
}

/**
 * GPT를 활용하여 단일 곡 또는 플레이리스트를 일괄 생성
 * 모델 폴백 체인: gpt-5 → gpt-4o → gpt-4o-mini
 */
interface GenreThematicProfile {
  genre: 'trot' | 'citypop' | 'joseon' | 'lofi' | 'acoustic' | 'kpop' | 'rock' | 'chanson' | 'general'
  nameKo: string
  thematicPillars: {
    title: string
    subThemes: string[]
    sampleTitles: string[]
    lyricsGuidance: string
  }[]
  personaTitleFormula: string
  bannedCliches: string
  randomBpm: () => number
  instruments: string[]
}

export function detectGenreThematicProfile(stylePrompt: string, topic?: string, presetId?: string): GenreThematicProfile {
  const combined = `${stylePrompt} ${topic || ''} ${presetId || ''}`.toLowerCase()

  if (combined.includes('trot') || combined.includes('트로트') || combined.includes('트롯') || combined.includes('뽕짝') || combined.includes('7080') || combined.includes('성인가요')) {
    return {
      genre: 'trot',
      nameKo: '정통 & 현대 트로트 / 성인가요 / 7080',
      thematicPillars: [
        {
          title: '인생의 애환 & 세월의 잔',
          subThemes: ['선술집 막걸리 한 잔', '굽이굽이 인생길과 세월의 무게', '흘러간 청춘의 아쉬움', '부모님 은혜와 주름진 손', '인생 2막의 새로운 다짐'],
          sampleTitles: ['인생 2막 브루스', '막걸리 한 잔의 세월', '굽이진 인생 고갯길', '청춘아 어디 가니', '아버지의 지게'],
          lyricsGuidance: '가슴을 울리는 진한 인생사, 세월의 덧없음과 다시 일어서는 중장년의 결기, 진솔하고 가슴 찡한 한국적 서정.'
        },
        {
          title: '신나는 고속도로 & 축제 & 댄스 디스코',
          subThemes: ['고속도로 휴게소 통기타 낭만', '관광버스 신바람 디스코', '전국 팔도 5일장 축제', '동창회 만남과 흥', '대박 터진 내 인생'],
          sampleTitles: ['신바람 고속도로', '관광버스 디스코 파티', '대박 터진 내 인생', '오라버니 신바람', '팔도 유랑가'],
          lyricsGuidance: '어깨춤이 절로 나는 경쾌한 4/4박자 뽕짝 디스코, 중독성 있는 후렴구 떼창, 흥겨운 추임새(얼쑤, 좋다, 아싸).'
        },
        {
          title: '항구의 이별 & 진한 순정 & 첫사랑',
          subThemes: ['목포/부산/여수 밤바다의 이별', '안개 낀 간이역 정거장', '못 잊을 첫사랑의 그림자', '떠나간 님을 향한 일편단심', '사나이 순정의 눈물'],
          sampleTitles: ['목포항 밤안개', '여수 밤바다의 순정', '간이역 마지막 기차', '영영 못 잊을 사람', '사나이 눈물 한 잔'],
          lyricsGuidance: '남진/나훈아/이미자 감성의 꺾기와 짙은 바이브레이션, 비에 젖은 부두와 기적 소리 등 시각적이고 절절한 비장미.'
        },
        {
          title: '고향집 & 어머니의 손맛 & 사계절',
          subThemes: ['고향역 완행열차', '찔레꽃 피는 시골길', '어머니의 된장찌개', '장독대에 내리는 함박눈', '추억 속의 초가집'],
          sampleTitles: ['고향역 찔레꽃', '어머니의 된장찌개', '달빛 내리는 고향마을', '귀향길 완행열차', '가을 들녘 바람소리'],
          lyricsGuidance: '아련한 노스탤지어, 흙냄새와 부모님의 따스한 품, 고향의 사계절 풍경을 그린 서정시 같은 가사.'
        },
        {
          title: '희망찬 사이다 파이팅 & 인생 역전',
          subThemes: ['쨍하고 해뜰날', '내 나이가 어때서 청춘이다', '세상아 덤벼라 내가 간다', '오늘 밤의 주인공', '힘내라 친구야'],
          sampleTitles: ['쨍하고 해뜰날', '청춘은 지금부터', '세상아 덤벼라', '오늘 밤 주인공은 나야 나', '사이다 인생'],
          lyricsGuidance: '답답한 속을 뻥 뚫어주는 사이다 같은 당당함과 에너지, 유쾌하고 호쾌한 긍정의 메시지.'
        }
      ],
      personaTitleFormula: "Front-load with rich Trot situations/imagery in the FIRST 15 CHARACTERS: Dynamically blend [인생/정취 e.g. 인생 2막, 고향역, 목포항, 쨍하고 해뜰날, 선술집, 고속도로] + [감정/오브제 e.g. 막걸리 한 잔, 밤안개, 찔레꽃, 신바람 디스코, 사나이 눈물] + [장르 훅 e.g. 정통 트로트, 신나는 트롯가요, 감성 성인가요]. Examples: '🎤 인생 2막 막걸리 한 잔 | 정통 트로트', '💃 고속도로 휴게소 신바람 디스코 메들리', '🌊 목포항 밤안개 속 애절한 순정', '☀️ 쨍하고 해뜰날! 인생 역전 사이다 트롯', '🏡 고향역 어머니 생각에 눈물 짓는 밤'.",
      bannedCliches: "🚨 CRITICAL BAN: ABSOLUTELY DO NOT write about modern office cubicles, IT developers, debugging, coding, keyboard typing, or tiny one-room studio apartments! Trot lyrics must breathe with authentic Korean life pathos, regional romance (ports, rivers, hometown stations), festive disco excitement, filial warmth, and hearty humor.",
      randomBpm: () => (Math.random() > 0.5 ? Math.floor(Math.random() * 14) + 128 : Math.floor(Math.random() * 12) + 72),
      instruments: [
        'authentic Korean trot brass section and live trumpet stabs',
        'nostalgic accordion melody and lively rhythm guitar',
        'mournful saxophone solos and weeping electric guitar',
        'bouncy trot bassline and punchy disco drums',
        'traditional acoustic guitar strumming and electronic organ'
      ]
    }
  }

  if (combined.includes('joseon') || combined.includes('조선') || combined.includes('gugak') || combined.includes('국악')) {
    return {
      genre: 'joseon',
      nameKo: '조선 힙합 & 국악 퓨전 붐뱁',
      thematicPillars: [
        {
          title: '달빛 아래 검무 & 호걸의 기개',
          subThemes: ['흑도포 나그네의 여정', '달빛 아래 칼춤', '호걸의 당당한 풍모', '백성의 한과 흥을 담은 랩'],
          sampleTitles: ['먹빛 깃발', '달빛 아래 칼춤', '한과 흥의 소리', '새벽 안개속 나그네'],
          lyricsGuidance: '판소리식 꺾기 보컬과 묵직한 붐뱁 비트, 고전 설화와 무협적 호연지기를 담은 압도적 카리스마.'
        }
      ],
      personaTitleFormula: "Blend [조선/국악 세계관 e.g. 먹빛 나그네, 달빛 검무, 태평소 울리는 밤] + [비트/장단] + [호걸의 기개]. Examples: '⚔️ 달빛 아래 칼춤 | 조선 퓨전 붐뱁', '📜 먹빛 깃발을 든 나그네의 랩'.",
      bannedCliches: "DO NOT use modern tech/office jargon. Use historical poetic Korean imagery and energetic gugak chants.",
      randomBpm: () => Math.floor(Math.random() * 15) + 82,
      instruments: ['gayageum pluck and daegeum flute', 'heavy boom bap drums and epic brass stabs', 'pansori vocal chops and traditional percussion kkwaenggwari']
    }
  }

  if (combined.includes('city') || combined.includes('시티팝') || combined.includes('synthwave') || combined.includes('1984') || combined.includes('retro')) {
    return {
      genre: 'citypop',
      nameKo: '80년대 레트로 시티팝 / 신스웨이브',
      thematicPillars: [
        {
          title: '네온 하이웨이 드라이브 & 미드나잇 로맨스',
          subThemes: ['80년대 도쿄 야경 고속도로', '한밤의 공중전화와 빗속 약속', '해변 선셋 드라이브', '카세트 테이프와 플라스틱 러브'],
          sampleTitles: ['Midnight Highway 1986', 'Neon Sunset Drive', 'Tokyo Rain Romance', 'Plastic Heartbeat'],
          lyricsGuidance: '세련된 신디사이저와 펑키한 슬랩 베이스, 80년대 아날로그 감성의 낭만과 도시의 세련된 고독.'
        }
      ],
      personaTitleFormula: "Blend [도시/시간 e.g. 1986 도쿄, 미드나잇 하이웨이] + [오브제 e.g. 네온사인, 카세트] + [무드 e.g. 낭만 드라이브, 시티팝]. Examples: '🌃 1986 도쿄 미드나잇 시티팝 드라이브', '📼 네온 불빛 아래 카세트 낭만'.",
      bannedCliches: "Avoid contemporary smartphone/IT slang; evoke 80s analog nostalgia, neon boulevards, and tape cassettes.",
      randomBpm: () => Math.floor(Math.random() * 18) + 110,
      instruments: ['funky slap bassline and DX7 synth chords', 'palm-muted funky electric guitar', 'punchy 80s disco drums and shimmering reverb']
    }
  }

  if (combined.includes('lo-fi') || combined.includes('lofi') || combined.includes('focus') || combined.includes('study') || combined.includes('chill') || combined.includes('healing')) {
    return {
      genre: 'lofi',
      nameKo: '로파이 칠 & 딥 포커스 & 힐링',
      thematicPillars: [
        {
          title: '비 오는 날 창가 서재 & 아늑한 몰입',
          subThemes: ['창가에 맺힌 빗방울', '따뜻한 차 한 잔과 책장 넘기는 소리', '고요한 새벽의 사색', '골목길 고양이와 나른한 오후'],
          sampleTitles: ['비 내리는 서재의 오후', '찻잔에 담긴 고요', '새벽 3시의 몽상', '아이스 우롱티의 여유'],
          lyricsGuidance: '따뜻한 어쿠스틱/일렉트릭 피아노 선율, 마음을 편안하게 녹여주는 감미롭고 부드러운 노랫말.'
        }
      ],
      personaTitleFormula: "Blend [시간/공간 e.g. 비 내리는 창가, 새벽 3시, 나른한 오후] + [몰입/휴식 e.g. 깊은 생각, 마음의 쉼표, 힐링 로파이]. Examples: '🍵 비 내리는 서재에서 듣는 힐링 Lofi', '🌙 생각의 스위치를 끄고 깊은 잠으로'.",
      bannedCliches: "Do not overuse abrasive jargon; keep the mood tranquil, cozy, and poetic.",
      randomBpm: () => Math.floor(Math.random() * 15) + 70,
      instruments: ['warm Fender Rhodes chords', 'plucky acoustic guitar accents', 'soft vinyl crackle and mellow double bass']
    }
  }

  // General / Default
  return {
    genre: 'general',
    nameKo: '프리미엄 팝 & 인디 감성',
    thematicPillars: [
      {
        title: '계절과 일상의 낭만적인 고백',
        subThemes: ['마음 속 진솔한 이야기', '소소한 일상의 행복', '새로운 여정을 향한 설렘', '노을빛 아래 따뜻한 약속'],
        sampleTitles: ['노을빛 언덕에서', '너에게 전하는 작은 멜로디', '바람이 불어오는 곳', '빛나는 우리들의 계절'],
        lyricsGuidance: '듣는 이의 마음을 감싸주는 서정적이고 감미로운 멜로디와 이야기.'
      }
    ],
    personaTitleFormula: "Target the core emotional context: [감성/상황] + [공간/시간] + [음악적 무드]. Examples: '🎸 노을빛 언덕에서 듣는 따스한 어쿠스틱', '✨ 마음을 어루만지는 힐링 팝 멜로디'.",
    bannedCliches: "Avoid robotic clichés or forced corporate/office tropes unless explicitly requested.",
    randomBpm: () => Math.floor(Math.random() * 25) + 85,
    instruments: ['warm acoustic piano chords', 'clean electric guitar accents', 'smooth string quartet swells', 'warm bass and ambient reverb']
  }
}

function randomizeStylePrompt(baseStyle: string, genreProfile?: GenreThematicProfile): string {
  const profile = genreProfile || detectGenreThematicProfile(baseStyle)
  const keys = ['A minor', 'C major', 'E minor', 'G major', 'D minor', 'F major', 'B minor', 'A major', 'E major', 'D major', 'G# minor', 'F# minor']
  const randomKey = keys[Math.floor(Math.random() * keys.length)]

  const bpm = profile.randomBpm()

  const textures = [
    'warm studio master mix',
    'rich analog warmth',
    'valve preamp saturation',
    'spacious hall reverb',
    'subtle vintage tape warmth',
    'crystal clear acoustic separation',
    'dynamic punchy stereo mix'
  ]
  const randomTexture = textures[Math.floor(Math.random() * textures.length)]

  const randomInstrument = profile.instruments[Math.floor(Math.random() * profile.instruments.length)]

  const suffix = `key of ${randomKey}, ${bpm} BPM, ${randomTexture}, featuring ${randomInstrument}`
  return `${baseStyle}, ${suffix}`.trim()
}

export async function generateLyrics(
  params: GenerateLyricsParams
): Promise<(LyricsGeneratorResult | PlaylistGeneratorResult) & { stylePrompt?: string }> {
  const isPlaylist = !!params.isPlaylistMode
  const trackCount = params.trackCount ?? 10
  
  // Detect genre thematic profile
  const genreProfile = detectGenreThematicProfile(params.stylePrompt, params.topic, params.presetId)

  // Randomize style tags to ensure different production results
  const randomizedStylePrompt = randomizeStylePrompt(params.stylePrompt, genreProfile)
  // Unique seed to force the LLM to write distinct lyrics and titles
  const seed = Math.random().toString(36).substring(2, 10)

  if (!OPENAI_API_KEY) {
    console.log(`[Lyrics Generator] API Key 미검출로 Mock ${isPlaylist ? '플레이리스트' : '단일 가사'}를 생성합니다.`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const mockResult = isPlaylist
      ? getMockPlaylistResult(randomizedStylePrompt, params.topic, trackCount)
      : getMockLyricsResult(randomizedStylePrompt, params.topic)
    return {
      ...mockResult,
      stylePrompt: randomizedStylePrompt
    }
  }

  let languageInstruction = 'Korean'
  if (params.language === 'en') {
    languageInstruction = 'English'
  } else if (params.language === 'ja') {
    languageInstruction = 'Japanese'
  } else if (params.language === 'fr') {
    languageInstruction = 'French'
  } else if (params.language === 'zh') {
    languageInstruction = 'Chinese'
  } else if (params.language === 'es') {
    languageInstruction = 'Spanish'
  } else if (params.language === 'pt') {
    languageInstruction = 'Portuguese'
  } else if (params.language === 'de') {
    languageInstruction = 'German'
  } else if (params.language === 'it') {
    languageInstruction = 'Italian'
  } else if (params.language === 'hi') {
    languageInstruction = 'Hindi'
  } else if (params.language === 'ru') {
    languageInstruction = 'Russian'
  } else if (params.language === 'ar') {
    languageInstruction = 'Arabic'
  } else if (params.language === 'ja-en') {
    languageInstruction = 'a mix of Japanese and English'
  } else if (params.language === 'ko-en') {
    languageInstruction = 'a mix of Korean and English'
  }

  // Match playbooks from DB (Obsidian synced)
  let playbookInstructions = ''
  try {
    let matchedPlaybook: any = null
    if (params.presetId) {
      const { getPlaybookByKey } = await import('@/lib/db/knowledge')
      matchedPlaybook = await getPlaybookByKey(params.presetId)
    }

    let playbooks: any[] = []
    if (matchedPlaybook) {
      playbooks = [matchedPlaybook]
    } else {
      const { matchPlaybooksByPrompt } = await import('@/lib/db/knowledge')
      const playbooksRes = await matchPlaybooksByPrompt(randomizedStylePrompt)
      if (playbooksRes) playbooks = playbooksRes
    }

    if (playbooks && playbooks.length > 0) {
      playbookInstructions = '\n\n## Playbook Curation Rules (OBSIDIAN SYNCED):\nYou MUST strictly adhere to these expert-curated formulas and style guidelines:\n' + 
        playbooks.map(pb => `### Playbook: ${pb.title}\n${pb.content}`).join('\n\n')
    }

    // Match Obsidian Story Episodes DB Nodes
    const { matchEpisodesByCategoryAndTopic } = await import('@/lib/db/knowledge')
    const matchedEpisodes = await matchEpisodesByCategoryAndTopic(params.presetId || params.topic, params.topic)
    if (matchedEpisodes && matchedEpisodes.length > 0) {
      playbookInstructions += '\n\n## 🎭 OBSIDIAN STORY EPISODES DB (RECURRING DRAMATIC ROLES & EXPRESSIONS):\nYou MUST craft dynamic multi-character dynamics, vivid facial expressions, and narrative tension inspired by these real community episodes:\n' +
        matchedEpisodes.map(ep => 
          `### Episode Reference: ${ep.title} (${ep.category})\n` +
          `- Protagonist vs Antagonist: ${ep.protagonist} vs ${ep.antagonist}\n` +
          `- Emotional Arc: ${ep.emotionalArc}\n` +
          `- Real Episode Plot: ${ep.summary}\n` +
          `- Punchline Seed: "${ep.punchline}"\n` +
          `- Visual Scene Prompt: ${ep.visualPrompt}`
        ).join('\n\n')
    }
  } catch (err) {
    console.error('[Lyrics Generator] Error retrieving playbooks or story episodes:', err)
  }

  const systemPrompt = isPlaylist
    ? getPlaylistSystemPrompt(randomizedStylePrompt, params.topic, trackCount, languageInstruction, params.vocalGender, playbookInstructions, genreProfile)
    : getSingleSystemPrompt(randomizedStylePrompt, params.topic, languageInstruction, params.vocalGender, playbookInstructions, params.durationSeconds, params.viralMode, genreProfile)

  // 🎲 무한 발산 창작 벡터 생성 (고정된 틀과 클리셰를 완전히 초월하는 자유 발산 지침)
  const singleVector = generateBoundlessCreativeVector(genreProfile.genre, 0, seed)
  const playlistVectors = Array.from({ length: trackCount }, (_, idx) => 
    generateBoundlessCreativeVector(genreProfile.genre, idx, seed)
  )

  const narrativeDirective = isPlaylist
    ? `\n\n## 🌌 1,000-SONG ABSOLUTE DIVERSITY DIRECTIVE (EVERY TRACK MUST BE A COMPLETELY UNIQUE UNIVERSE):\n` +
      playlistVectors.map((v, idx) => 
        `### Track ${idx + 1} Creative Vector (Entropy: ${v.uniqueEntropySeed}):\n` +
        `- Creative Angle & Mood: ${v.perspectiveType}\n` +
        `- Thematic Dimension: ${v.thematicDimension}\n` +
        `- Sensory & Emotional Focus: ${v.sensoryFocus}\n` +
        `-> INVENT an entirely new, unpredictable, and authentic human story for Track ${idx + 1}. Absolutely DO NOT repeat personas, locations, or lyric patterns across tracks!`
      ).join('\n\n')
    : `\n\n## 🌌 1,000-SONG RADICAL ORIGINALITY DIRECTIVE (STANDALONE MASTERPIECE):\n` +
      `### Creative Vector (Entropy: ${singleVector.uniqueEntropySeed}):\n` +
      `- Creative Angle & Mood: ${singleVector.perspectiveType}\n` +
      `- Thematic Dimension: ${singleVector.thematicDimension}\n` +
      `- Sensory Focus: ${singleVector.sensoryFocus}\n` +
      `🚨 BOUNDLESS IMAGINATION RULE:\n` +
      `- You have the entire universe of human life, humor, romance, struggles, philosophy, and imagination at your disposal.\n` +
      `- INVENT a totally fresh, specific, vivid narrative with concrete tangible details and original poetic wordplay. NEVER write generic or templated lyrics!`

  const userPrompt = isPlaylist
    ? `Generate a full ${trackCount}-track playlist curation and song details for the style: ${randomizedStylePrompt}.
${params.topic ? `Playlist Theme: ${params.topic}` : `Target Genre: ${genreProfile.nameKo}`}
Language: ${languageInstruction}
Vocal Target: ${params.vocalGender || 'mixed'}
Random seed token: ${seed}.
${narrativeDirective}`
    : `Generate title, tags, hashtags, and structured lyrics for a single song with style: ${randomizedStylePrompt}.
Target Genre: ${genreProfile.nameKo}
Language: ${languageInstruction}
Vocal Target: ${params.vocalGender || 'mixed'}
Random seed token: ${seed}.
${narrativeDirective}`

  // 모델 폴백 체인 (공식 OpenAI 최신 플래그십 gpt-5.6-sol 1순위)
  const MODEL_CHAIN = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-4o', 'gpt-4o-mini']
  let parsed: any = null

  async function attemptGeneration(apiKeyStr: string, apiUrlStr: string, modelChain: string[]): Promise<any> {
    for (const model of modelChain) {
      try {
        console.log(`[Lyrics Generator] Trying model ${model} with endpoint ${apiUrlStr}...`)
        const response = await fetch(apiUrlStr, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKeyStr}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.92,
            presence_penalty: 0.6,
            frequency_penalty: 0.4,
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          console.warn(`[Lyrics Generator] ${model} failed: HTTP ${response.status} - ${errText}`)
          continue
        }

        const data = await response.json()
        const resultText = data.choices[0]?.message?.content ?? '{}'
        return JSON.parse(resultText)
      } catch (err: any) {
        console.warn(`[Lyrics Generator] Exception with model ${model}: ${err.message}`)
      }
    }
    return null
  }

  // 1단계: 302.ai 프록시 API 시도 (302.AI 전용 모델 gpt-5.5 / gpt-5.4 / gpt-5-mini)
  if (process.env.SUNO_API_KEY) {
    console.log('[Lyrics Generator] Attempting 302.ai Proxy API call...')
    const backupKey = process.env.SUNO_API_KEY
    const apiBase = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '')
    const backupUrl = `${apiBase}/v1/chat/completions`
    const BACKUP_MODEL_CHAIN = ['gpt-5.5', 'gpt-5.4', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini']
    parsed = await attemptGeneration(backupKey, backupUrl, BACKUP_MODEL_CHAIN)
  }

  // 2단계: 실패 시 공식 OpenAI API 시도 (백업)
  if (!parsed && OPENAI_API_KEY) {
    console.log('[Lyrics Generator] 302.ai failed or not set, falling back to official OpenAI...')
    parsed = await attemptGeneration(OPENAI_API_KEY, OPENAI_API_URL, MODEL_CHAIN)
  }

  if (!parsed) {
    console.warn('[Lyrics Generator] All OpenAI and 302.ai attempts failed, falling back to mock data.')
    return isPlaylist
      ? getMockPlaylistResult(params.stylePrompt, params.topic, trackCount)
      : getMockLyricsResult(params.stylePrompt, params.topic)
  }

  if (isPlaylist) {
    if (!parsed.playlistTitle || !parsed.tracks || !Array.isArray(parsed.tracks)) {
      throw new Error('Invalid playlist response structure from OpenAI')
    }
    
    const tracks: PlaylistTrack[] = parsed.tracks.map((t: any, tIdx: number) => {
      let sCounter = 0
      const sections: LyricsSection[] = (t.sections || []).map((s: any) => {
        let resolvedType = (s.type || 'verse').toLowerCase().trim() as LyricsSectionType
        if (!['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro'].includes(resolvedType)) {
          resolvedType = 'verse'
        }
        return {
          id: `gpt-t${tIdx}-${Date.now()}-${sCounter++}`,
          type: resolvedType,
          content: s.content.trim(),
          description: s.description ? s.description.trim() : undefined,
        }
      })
      return {
        trackNumber: t.trackNumber || (tIdx + 1),
        title: t.title || `Track ${tIdx + 1}`,
        youtubeTags: t.youtubeTags || '',
        snsHashtags: t.snsHashtags || '',
        sections,
      }
    })

    console.log(`[Lyrics Generator] Playlist success, ${tracks.length} tracks`)
    return {
      playlistTitle: parsed.playlistTitle,
      youtubeDescription: parsed.youtubeDescription || '',
      youtubeTags: parsed.youtubeTags || '',
      snsHashtags: parsed.snsHashtags || '',
      tracks,
      stylePrompt: randomizedStylePrompt,
    }
  } else {
    if (!parsed.title || !parsed.sections || !Array.isArray(parsed.sections)) {
      throw new Error('Invalid single track response structure from OpenAI')
    }

    let counter = 0
    const sections = parsed.sections.map((s: any) => {
      let resolvedType = (s.type || 'verse').toLowerCase().trim() as LyricsSectionType
      if (!['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro'].includes(resolvedType)) {
        resolvedType = 'verse'
      }
      return {
        id: `gpt-${Date.now()}-${counter++}`,
        type: resolvedType,
        content: s.content.trim(),
        description: s.description ? s.description.trim() : undefined,
      }
    })

    console.log(`[Lyrics Generator] Single track success, ${sections.length} sections`)
    
    let lyricsPrompt = parsed.lyricsPrompt;
    if (!lyricsPrompt) {
      lyricsPrompt = sections.map((s: any) => `[${s.type.toUpperCase()}]\n${s.content}`).join('\n\n');
    }

    return {
      title: parsed.title,
      youtubeTags: parsed.youtubeTags || '',
      snsHashtags: parsed.snsHashtags || '',
      sections,
      stylePrompt: randomizedStylePrompt,
      lyricsPrompt,
    }
  }
}

function getSingleSystemPrompt(
  stylePrompt: string, 
  topic?: string, 
  languageInstruction: string = 'Korean',
  vocalGender: string = 'mixed',
  playbookInstructions?: string,
  durationSeconds?: number,
  viralMode?: boolean,
  genreProfile?: GenreThematicProfile
): string {
  const profile = genreProfile || detectGenreThematicProfile(stylePrompt, topic)
  const targetDuration = durationSeconds || 180 // 기본 3분 (3분 ~ 3분 30초 최적화)
  const isShortForm = targetDuration <= 60

  let genderInstruction = ''
  if (vocalGender === 'female') {
    genderInstruction = '\n- VOCAL GENDER RULE: You MUST write the song for a female vocalist. In the section "description" fields, strictly write "female vocal" or "intimate female vocal close to mic" and avoid any male descriptors.'
  } else if (vocalGender === 'male') {
    genderInstruction = '\n- VOCAL GENDER RULE: You MUST write the song for a male vocalist. In the section "description" fields, strictly write "male vocal" or "dry male vocal close-up" and avoid any female descriptors.'
  } else if (vocalGender === 'duet') {
    genderInstruction = '\n- VOCAL GENDER RULE: You MUST write the song as a male and female duet. Assign duet parts in the lyrics and specify "beautiful male and female duet harmonies" or "interplay of male and female vocals" in the section "description" fields.'
  }

  // Duration에 따른 가사 구조 및 분량 지시
  let durationStructureInstruction = ''
  if (targetDuration <= 15) {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION RULE — TARGET: ${targetDuration} SECONDS (Ultra Short-form)
Suno AI determines song length by the amount of lyrics. You MUST generate EXACTLY this structure:
1. Intro (type: "intro") - 1 line (vocal starts immediately)
2. Hook/Chorus (type: "chorus") - 2 lines MAX
3. Outro (type: "outro") - 1 line MAX`
  } else if (targetDuration <= 30) {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION & COST RULE — TARGET: 26 TO 29.5 SECONDS (STRICT 30.0s MAXIMUM LIMIT)
Suno AI determines song length by lyrics length. To land strictly inside the 26.0s to 29.5s sweet spot, generate this exact structure:
1. Intro (type: "intro") - 1 short line
2. Verse 1 (type: "verse") - 3 lines
3. Chorus (type: "chorus") - 3 lines
4. Outro (type: "outro") - 1 line (short fade out)

Total lyrics: 8 lines. Keep total character count strictly between 220 and 255 characters.`
  } else if (targetDuration <= 60) {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION RULE — TARGET: ${targetDuration} SECONDS (Mid-form / TikTok Song)
1. Intro (type: "intro") - 1-2 lines
2. Verse 1 (type: "verse") - 4 lines
3. Chorus (type: "chorus") - 4 lines
4. Verse 2 (type: "verse") - 2-3 lines
5. Chorus repeat (type: "chorus") - 4 lines
6. Outro (type: "outro") - 1-2 lines

Total lyrics: 15-18 lines.`
  } else if (targetDuration <= 120) {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION RULE — TARGET: ${targetDuration} SECONDS (Compact 2 Minutes)
1. Intro (type: "intro") - 1-2 lines
2. Verse 1 (type: "verse") - 4 lines
3. Chorus (type: "chorus") - 4 lines
4. Verse 2 (type: "verse") - 4 lines
5. Chorus (type: "chorus") - 4 lines
6. Outro (type: "outro") - 1-2 lines

Total lyrics: 14-16 lines. Do NOT add Pre-chorus or Bridge.`
  } else if (targetDuration <= 180) {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION RULE — TARGET: ${targetDuration} SECONDS (Optimal 3:00 - 3:30 Minutes)
You MUST generate EXACTLY this structure to target 3:00 to 3:30 minutes of final audio and PREVENT costly 4+ minute overruns:
1. Intro (type: "intro") - 1-2 lines
2. Verse 1 (type: "verse") - 4 lines
3. Chorus (type: "chorus") - 4 lines (main hook)
4. Verse 2 (type: "verse") - 4 lines
5. Chorus (type: "chorus") - 4 lines
6. Outro (type: "outro") - 1-2 lines ([Outro] [Fade out at 3:15])

Total lyrics: 16-18 lines MAX. Do NOT add Bridge or 3rd Chorus. Keep it tight and rhythmic so Suno strictly finishes between 3:00 and 3:30.`
  } else {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION RULE — TARGET: ${targetDuration} SECONDS (Long-form 3:30+ Minutes)
1. Intro (type: "intro") - 2 lines
2. Verse 1 (type: "verse") - 4 lines
3. Pre-Chorus (type: "pre-chorus") - 3 lines
4. Chorus (type: "chorus") - 4 lines
5. Verse 2 (type: "verse") - 4 lines
6. Pre-Chorus (type: "pre-chorus") - 3 lines
7. Chorus (type: "chorus") - 4 lines
8. Bridge/Solo (type: "bridge") - 4 lines
9. Chorus (type: "chorus") - 4 lines
10. Final Chorus (type: "chorus") - 4 lines
11. Outro (type: "outro") - 2 lines (long fade out)

Total lyrics: 34-40 lines.`
  }

  // 가사 문학성 및 고도화 지침
  const lyricsQualityRules = `
## 📝 LYRICS WRITING QUALITY RULES (AUTHENTIC GENRE POETRY & CONTRAST):
1. **GENRE AUTHENTICITY**: Write with rich lyrical imagery and vocabulary authentic to ${profile.nameKo}.
${profile.thematicPillars.map(p => `   - **${p.title}**: ${p.subThemes.join(', ')} → *${p.lyricsGuidance}*`).join('\n')}
2. **${profile.bannedCliches}**
3. **RHYTHM & MELODY SHIFT**:
   - **Verses** should have narrative sentences that paint the emotional backstory.
   - **Choruses** MUST feature highly rhythmic, punchy, syncopated repetitive hooks that immediately capture the ear.
4. **AI STRUCTURAL CUES**: In section "description" fields, include dynamic musical cues (e.g. '[Upbeat Brass Stabs]', '[Mournful Accordion Solo]', '[Saxophone Climax]', '[Gentle Acoustic Strumming]', '[Fade Out]').`

  const vleMasterMarkdown = loadVLEMasterPrompt()

  let viralModeInstruction = ''
  if (viralMode) {
    viralModeInstruction = `
${vleMasterMarkdown}

${buildStructureDirective()}

## ⚡ VIRAL SHORT-FORM COMEDY GOLDEN RULES:
1. 웃음은 100% 가사에서 나온다. 한국인이 소리 내어 읽고 즉시 이해할 수 있는 문장만 쓴다.
2. 감정 형용사 대신 카메라로 찍을 수 있는 사물과 숫자로 상황을 보여준다.
3. 후렴은 Memory Anchor 하나가 지배해야 하며, 그 앵커는 곡이 끝난 뒤에도 입에 남아야 한다.`
  }

  const customUserDirectives = `
## 🎯 CUSTOM USER DIRECTIVES & PRECISE INCLUSION RULES:
If the theme/topic contains specific user instructions, custom lyrics, phrases in quotes, or musical preferences:
1. **Verbatim Phrase Inclusion**: If the user has requested to include a specific phrase or sentence (especially if enclosed in quotes like "내가 널 버릴거야~"), you MUST strictly include this exact phrase inside the generated lyrics.
2. **Style & Vocal Adjustment**: Reflect musical or vocal performance requests inside the section "description" fields.`

  if (viralMode) {
    return `You are a legendary viral content creator and CM-song director specializing in addictive short-form songs.
${genderInstruction}
${viralModeInstruction}
${lyricsQualityRules}
${customUserDirectives}

Your task: Generate an incredibly catchy viral parody/CF song for style: "${stylePrompt}".
${topic ? `Theme/Topic: "${topic}"` : ''}
Language: ${languageInstruction}

## JSON Schema (Strict)
{
  "title": "🔥 HIGH-CTR YOUTUBE SHORTS TITLE under 30 characters",
  "youtubeTags": "comma, separated, SEO, keywords",
  "lyricsPrompt": "STRUCTURE CONTRACT lyrics with [Spoken] [Verse] [Chorus] [Outro]",
  "sections": [
    {
      "type": "intro or verse or chorus or outro",
      "content": "lyrics text",
      "description": "Suno musical instruction"
    }
  ]
}
${playbookInstructions || ''}`
  }

  return `You are a world-class, chart-topping songwriter and music producer specializing in ${profile.nameKo} and global playlist curation. You have deep expertise in Suno AI music generation.
${genderInstruction}
${durationStructureInstruction}
${lyricsQualityRules}
${customUserDirectives}

Your task: Generate a professional-grade song package (title, SEO tags, hashtags, and structured lyrics) for the style: "${stylePrompt}".
${topic ? `The theme/topic is: "${topic}".` : ''}

You MUST write all titles, lyrics, tags, and descriptions strictly in the requested language style: "${languageInstruction}".

## JSON Schema (Strict)
{
  "title": "🎵 ${profile.personaTitleFormula}",
  "youtubeTags": "comma, separated, SEO, keywords, 15-20 tags",
  "snsHashtags": "#hashtag1 #hashtag2 ... (10-15 hashtags for TikTok/Instagram/Shorts)",
  "sections": [
    {
      "type": "intro or verse or pre-chorus or chorus or bridge or outro",
      "content": "Pure lyrics text (newline separated). NO section tags inside.",
      "description": "REQUIRED: Suno-optimized musical instruction (e.g., 'Passionate male vocal, mournful saxophone intro', 'Dynamic female vocal, upbeat brass rhythm')"
    }
  ]
}
${playbookInstructions || ''}
`
}

function getPlaylistSystemPrompt(
  stylePrompt: string, 
  topic?: string, 
  trackCount: number = 10, 
  languageInstruction: string = 'Korean',
  vocalGender: string = 'mixed',
  playbookInstructions?: string,
  genreProfile?: GenreThematicProfile
): string {
  const profile = genreProfile || detectGenreThematicProfile(stylePrompt, topic)

  const timelineExample = Array.from({ length: trackCount }, (_, idx) => {
    const mins = idx * 3
    const timeStr = mins < 10 ? '0' + mins + ':00' : mins + ':00'
    return timeStr + ' Track ' + (idx + 1)
  }).join('\\n')

  const timelineRules = Array.from({ length: Math.min(10, trackCount) }, (_, idx) => {
    const mins = idx * 3
    const timeStr = mins < 10 ? '0' + mins + ':00' : mins + ':00'
    return '   - ' + timeStr + ' Track ' + (idx + 1)
  }).join('\n')

  let genderMixRules = ''
  if (vocalGender === 'female') {
    genderMixRules = '\n- VOCAL GENDER RULE: ALL tracks must be for a female vocalist.'
  } else if (vocalGender === 'male') {
    genderMixRules = '\n- VOCAL GENDER RULE: ALL tracks must be for a male vocalist.'
  } else if (vocalGender === 'duet') {
    genderMixRules = '\n- VOCAL GENDER RULE: ALL tracks must be male and female duets.'
  } else {
    genderMixRules = '\n- VOCAL GENDER RULE: Alternate vocal genders (e.g. 60% female, 30% male, 10% duet) for a dynamic playlist listening experience.'
  }

  return `You are a 1-million subscriber YouTuber who runs a high-engagement music playlist channel specializing in ${profile.nameKo}.

${genderMixRules}

## 🌟 PLAYLIST DIVERSITY MANDATE (${profile.nameKo}):
To run a successful 20~40 track playlist channel, each track MUST explore a distinct thematic angle across the genre's universe:
${profile.thematicPillars.map((p, idx) => `Pillar ${idx + 1}. **${p.title}** (Sub-themes: ${p.subThemes.join(', ')})`).join('\n')}

${profile.bannedCliches}

Your task is to generate a comprehensive ${trackCount}-track playlist package based on the requested style: "${stylePrompt}".
${topic ? `The entire playlist theme/topic is: "${topic}".` : ''}

You MUST write all playlistTitles, descriptions, track titles, and lyrics strictly in the requested language style: "${languageInstruction}".

You MUST return a JSON object matching this schema:
{
  "playlistTitle": "🎵 ${profile.personaTitleFormula}",
  "youtubeDescription": "A warm, emotional curator comment (1-2 paragraphs) welcoming listeners, followed by timestamps: '${timelineExample}'",
  "youtubeTags": "combined, playlist, tags, separated, by, commas, for, SEO",
  "snsHashtags": "#hashtag1 #hashtag2 #playlist #youtube #etc",
  "tracks": [
    {
      "trackNumber": 1,
      "title": "🎵 Poetic single song title (1-4 words) matching its distinct theme pillar",
      "youtubeTags": "tags, for, track1",
      "snsHashtags": "#track1 #genre",
      "sections": [
        {
          "type": "intro or verse or pre-chorus or chorus or bridge or outro",
          "content": "Lyrics for this section",
          "description": "Musical cue (e.g., 'Nostalgic accordion solo', 'Punchy brass drop')"
        }
      ]
    }
  ]
}

Rules:
1. Generate exactly ${trackCount} tracks inside the "tracks" array. Each track MUST have a completely UNIQUE theme, title, and lyrics from the ${profile.nameKo} pillars.
2. For each track, generate Intro, Verse 1, Chorus, Verse 2, Chorus, Outro sections.
3. Outro Control: Keep Outro short (1-2 lines) with "Fade Out" or "Instrumental Outro" in the description.
4. Strictly return valid JSON.
${playbookInstructions || ''}
`
}

/** Mock 단일 곡 데이터 Fallback */
function getMockLyricsResult(stylePrompt: string, topic?: string): LyricsGeneratorResult {
  const resolvedTopic = topic || '새로운 시작'
  
  let title = '눈부신 내일의 노래'
  if (stylePrompt.toLowerCase().includes('lo-fi') || stylePrompt.toLowerCase().includes('jazz')) {
    title = `비 내리는 가을 밤의 ${resolvedTopic}`
  } else if (stylePrompt.toLowerCase().includes('k-pop') || stylePrompt.toLowerCase().includes('pop')) {
    title = `Love Signal (${resolvedTopic})`
  }

  const sections: LyricsSection[] = [
    {
      id: `mock-intro-${Date.now()}`,
      type: 'intro',
      content: '(감미로운 인트로 선율 흐름)\n어둠 속을 헤매이던 시간들\n이제 빛을 향해 걸어가려 해',
    },
    {
      id: `mock-verse-1-${Date.now()}`,
      type: 'verse',
      content: `차가운 바람이 불어오던 날들\n내 마음에 남은 작은 속삭임\n${resolvedTopic}의 순간이 다가와\n조용히 눈을 떠 바라보네`,
    },
    {
      id: `mock-chorus-${Date.now()}`,
      type: 'chorus',
      content: `우리는 날아올라 저 하늘 높이\n다시 꿈을 향해 노래할 거야\n포기하지 마, 너와 나 함께라면\n눈부신 아침이 우리를 반겨줄 테니`,
    },
    {
      id: `mock-bridge-${Date.now()}`,
      type: 'bridge',
      content: '힘들고 지칠 때도 있겠지만\n약속할게, 네 곁에 언제나\n서로의 손을 꼭 잡고 걸어가',
    },
    {
      id: `mock-outro-${Date.now()}`,
      type: 'outro',
      content: '(점점 멀어지는 비트와 함께)\n우리만의 멜로디가 널 울릴 때\n끝나지 않을 노래를 불러',
    },
  ]

  return {
    title,
    youtubeTags: `${resolvedTopic}, lofi, chill beat, study bgm, relaxing music, focus piano, sleep song`,
    snsHashtags: `#${resolvedTopic.replace(/\s+/g, '')} #lofi #chillhop #playlist #studybgm #youtubeplaylist`,
    sections,
    lyricsPrompt: sections.map((s: any) => `[${s.type.toUpperCase()}]\n${s.content}`).join('\n\n'),
  }
}

/** Mock 플레이리스트 데이터 Fallback */
function getMockPlaylistResult(stylePrompt: string, topic?: string, trackCount: number = 10): PlaylistGeneratorResult {
  const resolvedTopic = topic || '따뜻한 감성 카페'
  const playlistTitle = `[Playlist] ${resolvedTopic}에서 듣는 차분한 음악`
  
  const baseTitles = [
    '첫 커피의 온도',
    '창가에 부딪치는 빗방울',
    '오후 3시의 나른함',
    '작은 전등 불빛 아래',
    '시간이 멈춘 공간',
    '당신과의 조용한 대화',
    '오래된 책장 냄새',
    '어스름해지는 거리',
    '식어가는 컵을 쥐고',
    '조용히 문을 닫으며'
  ]

  const trackTitles: string[] = []
  for (let i = 0; i < trackCount; i++) {
    if (i < baseTitles.length) {
      trackTitles.push(baseTitles[i])
    } else {
      trackTitles.push(`${resolvedTopic}의 순간 #${i + 1}`)
    }
  }

  const tracks: PlaylistTrack[] = trackTitles.map((title, idx) => {
    const trackNum = idx + 1
    const sections: LyricsSection[] = [
      {
        id: `mock-pl-intro-${idx}-${Date.now()}`,
        type: 'intro',
        content: `(Track ${trackNum} - 어쿠스틱 악기 인트로 선율)`,
      },
      {
        id: `mock-pl-verse-${idx}-${Date.now()}`,
        type: 'verse',
        content: `소박하게 흘러가는 오늘 하루의 끝자락\n마음 한구석에 쌓아둔 사소한 기억들\n${title}의 떨림처럼 조용히 스며드네\n우리는 이곳에서 가만히 숨을 고르네`,
      },
      {
        id: `mock-pl-chorus-${idx}-${Date.now()}`,
        type: 'chorus',
        content: `이 따스한 멜로디 속에 내 모든 걸 기대어 봐\n시간은 천천히 흐르고 우린 자유로워질 거야\n어두운 밤이 찾아와도 우리만의 작은 쉼터\n이 노래와 함께 영원히 머물러 줄게`,
      },
      {
        id: `mock-pl-outro-${idx}-${Date.now()}`,
        type: 'outro',
        content: `(잔잔하게 페이드 아웃 되는 엠비언트)\n끝나가는 소절마다 남겨진 그대의 미소\n편안한 밤이 되기를`,
      },
    ]

    return {
      trackNumber: trackNum,
      title,
      youtubeTags: `${title}, ${resolvedTopic}, lofi BGM, curating, chill music`,
      snsHashtags: `#track${trackNum} #lofi #chillhop #studybgm #${resolvedTopic.replace(/\s+/g, '')}`,
      sections,
    }
  })

  // 유튜브 설명 조립
  const timeLines = trackTitles.map((t, idx) => {
    const mins = idx * 3
    const timeStr = mins < 10 ? `0${mins}:00` : `${mins}:00`
    return `${timeStr} 트랙 ${idx + 1}. ${t}`
  }).join('\n')

  const youtubeDescription = `안녕하세요. 멜로디오 AI 큐레이터입니다.\n${resolvedTopic}을 테마로 기획된 감성 플레이리스트입니다. 지치고 바쁜 일상 속에서 잠시나마 편안한 휴식과 몰입의 시간이 되시길 바랍니다.\n구독과 좋아요는 다음 플레이리스트 제작에 큰 힘이 됩니다. ☕✨\n\n[Timeline]\n${timeLines}`

  return {
    playlistTitle,
    youtubeDescription,
    youtubeTags: `${resolvedTopic}, 플레이리스트, 공부 BGM, 카페 음악, 힐링 사운드, lofi playlist, youtube bgm`,
    snsHashtags: `#${resolvedTopic.replace(/\s+/g, '')} #플레이리스트 #lofi #playlist #유튜브 #감성음악`,
    tracks,
  }
}
