/**
 * Melodio — GPT-5.6-sol 기반 가사, 제목, 태그 및 10곡 플레이리스트 생성 엔진
 */

import type { LyricsSection, LyricsSectionType } from '@/types'
import type { PlaylistGeneratorResult, PlaylistTrack } from '@/types/playlist'
import type { CurationPlaybook } from '@/lib/db/knowledge'
import { generateBoundlessCreativeVector } from '@/lib/engines/infinite-story-matrix'
import { compileLyricsSections, assertSafeVocalLyrics } from '@/lib/lyrics/compile-sections'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
export const LYRICS_MODEL = 'gpt-5.6-sol' as const
export const LYRICS_PROVIDER_TIMEOUT_MS = 180_000

const LYRICS_SECTION_TYPES = ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro'] as const

export class LyricsGenerationError extends Error {
  constructor(public code: 'lyrics_response_structure' | 'lyrics_response_incomplete', message: string) {
    super(message)
    this.name = 'LyricsGenerationError'
  }
}

/** Enforce the application shape at generation time instead of requesting JSON syntax alone. */
export function lyricsResponseFormat(isPlaylist: boolean, trackCount: number) {
  const section = { type: 'object', additionalProperties: false, required: ['type', 'content', 'description'],
    properties: {
      type: { type: 'string', enum: LYRICS_SECTION_TYPES },
      content: { type: 'string', description: 'Only sung lyric words. Empty for instrumental sections; never production directions.' },
      description: { type: 'string', description: 'Plain unbracketed English musical directions, separate from sung content.' },
    } }
  const songProperties = {
    title: { type: 'string', minLength: 1 },
    youtubeTags: { type: 'string' },
    snsHashtags: { type: 'string' },
    sections: { type: 'array', minItems: 1, items: section },
  }
  const schema = isPlaylist
    ? { type: 'object', additionalProperties: false,
      required: ['playlistTitle', 'youtubeDescription', 'youtubeTags', 'snsHashtags', 'tracks'],
      properties: {
        playlistTitle: { type: 'string', minLength: 1 }, youtubeDescription: { type: 'string' },
        youtubeTags: { type: 'string' }, snsHashtags: { type: 'string' },
        tracks: { type: 'array', minItems: trackCount, maxItems: trackCount,
          items: { type: 'object', additionalProperties: false,
            required: ['trackNumber', 'title', 'youtubeTags', 'snsHashtags', 'sections'],
            properties: { trackNumber: { type: 'integer' }, ...songProperties } } },
      } }
    : { type: 'object', additionalProperties: false,
      required: ['title', 'youtubeTags', 'snsHashtags', 'sections'], properties: songProperties }
  return { type: 'json_schema', json_schema: { name: isPlaylist ? 'melodio_lyrics_playlist' : 'melodio_lyrics_single', strict: true, schema } }
}

const LYRICS_FIELD_CONTRACT = `
## LYRICS AND MUSIC DIRECTION FIELD CONTRACT
- sections[].content contains only the words to be sung. Brief structural or performance tags are allowed only when required by the song's structure contract. Never put instrument, vocal-gender, microphone, arrangement, or mixing instructions in content.
- sections[].description is separate music-production context: write concise, plain English musical directions with NO square brackets, section tags, outer wrappers, or nested brackets. Example: male vocal, gentle acoustic strumming, brushed drums, warm double bass.
- Never copy stylePrompt or a section description into sung content. An instrumental section with no sung words must have empty content; keep its directions in description.
- Write titles, sung lyrics, tags, and listener-facing summaries in the requested language. Section description fields must always stay in unbracketed English, even when the lyrics are Korean, Japanese, or another language.
- If lyricsPrompt is included, compose it from structural section tags and the sung content only. Section descriptions must never appear in lyricsPrompt.
`

const NATURAL_SONG_STRUCTURE = `
## COMPLETE SONG STRUCTURE AND NATURAL DEVELOPMENT
Compose a complete song using the established six-section backend structure in this order:
1. Intro (type: "intro") - brief instrumental opening or 1-2 short sung lines
2. Verse 1 (type: "verse") - 5 coherent sung lines of distinctive scene-setting lyrics
3. Chorus (type: "chorus") - 4 lines with the main singable hook
4. Verse 2 (type: "verse") - 5 coherent sung lines that develop a distinct second scene or perspective
5. Chorus (type: "chorus") - 4 lines returning to the main hook
6. Outro (type: "outro") - brief instrumental resolution or 1-2 short sung lines

- Use two distinct verses and two chorus appearances. Do NOT add a Pre-chorus, Bridge, third Chorus, or extra ending cycle.
- Give each verse a beginning and development that advances the song's story; use the verse lines for meaningful detail rather than repeating the chorus or padding phrases.
- Preserve the emotional progression, concrete imagery, memorable hook, and comfortable vocal phrasing; use concise complete lyric thoughts rather than rushed delivery, generic filler, or omitted story development.
- Keep Intro and Outro short. Finish the final sung phrase and resolve the music with a natural cadence; instrumental sections with no sung words have empty content.
- The per-section line guidance shapes composition, not a reason to truncate requested lyric phrases or returned lyrics. Preserve complete thoughts and the requested musical and vocal expression.
- Let the complete song finish naturally. Do not impose a clock duration, forced cutoff, or timed fade-out.
`

const BRAZILIAN_FUNK_PERFORMANCE_PRESET = 'brazilian-funk-kpop-performance'
const HARAJUKU_FUTURE_BASS_PRESET = 'kawaii-future'
const HARAJUKU_DESCRIPTION_INSTRUCTIONS = `
## HARAJUKU FUTURE BASS VOCAL AND ARRANGEMENT DIRECTIONS
- Keep section descriptions in plain, unbracketed English, at most two short clauses and 60 characters total. Name only a key instrument and the section-specific change; do not repeat the full recipe.
- Preserve the requested singer or singers, gender, language, register and individual vocal color. Use expressive lead singing with natural, unshifted phonation; do not default to childish, chipmunk or artificially pitch-shifted lead vocals. A naturally high register is welcome when chosen.
- Keep chops, candy textures, pitch modulation and sidechain on synths only. Lead phrases stay coherent and intelligible; use melodic verses leading into synth-led choruses and drops without rushing or flattening the song into quiet study music.
- All instrument and vocal-production directions belong in description, never sung content. The existing complete six-section song form and natural ending remain in place.
`
const BRAZILIAN_FUNK_PERFORMANCE_STRUCTURE = `
## COMPLETE SONG STRUCTURE AND NATURAL DEVELOPMENT
Compose a complete Brazilian Funk and K-pop performance song in this eight-section order:
1. Intro (type: "intro") - brief instrumental opening or 1-2 short sung lines
2. Verse 1 (type: "verse") - 8 coherent sung lines establishing a vivid scene and developing rhythmic flow
3. Pre-Chorus 1 (type: "pre-chorus") - 4 sung lines with melodic lift and growing emotional tension
4. Chorus 1 (type: "chorus") - 4 lines with the main memorable, singable hook
5. Verse 2 (type: "verse") - 8 coherent sung lines developing a distinct second scene and perspective
6. Pre-Chorus 2 (type: "pre-chorus") - 4 sung lines building toward the final hook with meaningful variation
7. Chorus 2 (type: "chorus") - 4 lines returning to the main hook with a resolved final expression
8. Outro (type: "outro") - brief instrumental resolution or 1-2 short sung lines

- Use two distinct verses, two pre-choruses and two chorus appearances. Do NOT add a Bridge, third Chorus, extended dance break, or extra ending cycle.
- Develop complete thoughts, concrete imagery and emotional progression across both verses. Contrast rhythmic verses with melodic pre-choruses and a strong hook; do not replace development with repeated slogans, filler, or rushed delivery.
- Preserve the selected style recipe, tempo, instruments and requested vocal identity. Keep any dance transition brief and inside the existing section arrangement rather than adding an empty section or technical words to sing.
- Each section description must be plain, unbracketed English, at most two short clauses and 60 characters total. Reuse concise vocal identity cues and state only the section-specific change; do not repeat the full style recipe. All production directions belong in description, never content.
- Keep Intro and Outro short; instrumental sections with no sung words have empty content. Finish the final sung phrase and resolve the music with a natural cadence.
- The per-section line guidance shapes composition, not a reason to truncate requested lyric phrases or returned lyrics. Preserve complete thoughts and comfortable vocal phrasing.
- Let the complete song finish naturally. Do not impose a clock duration, forced cutoff, or timed fade-out.
`

interface SongStructureInstructions {
  composition: string
  playlistOrder: string
}

const NATURAL_SONG_INSTRUCTIONS: SongStructureInstructions = {
  composition: NATURAL_SONG_STRUCTURE,
  playlistOrder: 'Intro, Verse 1, Chorus, Verse 2, Chorus, Outro',
}
const BRAZILIAN_FUNK_PERFORMANCE_INSTRUCTIONS: SongStructureInstructions = {
  composition: BRAZILIAN_FUNK_PERFORMANCE_STRUCTURE,
  playlistOrder: 'Intro, Verse 1, Pre-Chorus 1, Chorus 1, Verse 2, Pre-Chorus 2, Chorus 2, Outro',
}

export interface LyricsModelUsage {
  requestedModel: typeof LYRICS_MODEL
  actualModel: string
  reasoningEffort: 'high'
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
}

interface LyricsGeneratorDependencies {
  apiKey?: string
  fetch?: typeof fetch
}

import { loadVLEMasterPrompt } from '@/lib/vle/vleEngine';
import { buildStructureDirective } from '@/lib/vle/viralSongSpec';

export interface GenerateLyricsParams {
  stylePrompt: string
  topic?: string
  language?: 'ko' | 'en' | 'ja' | 'ko-en' | 'ja-en' | 'fr' | 'zh' | 'es' | 'pt' | 'de' | 'it' | 'hi' | 'ru' | 'ar'
  isPlaylistMode?: boolean
  trackCount?: number
  vocalGender?: 'mixed' | 'female' | 'male' | 'duet'
  presetId?: string
  /** 전용 숏폼의 목표 길이 (60초 이하). 일반 곡은 자연스러운 구성과 길이를 사용한다. */
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
  description?: string | null
}

interface GPTLyricsPayload {
  title?: string
  playlistTitle?: string
  youtubeDescription?: string
  youtubeTags?: string
  snsHashtags?: string
  lyricsPrompt?: string
  sections?: GPTLyricsSection[]
  tracks?: Array<{ trackNumber?: number; title?: string; youtubeTags?: string; snsHashtags?: string; sections?: GPTLyricsSection[] }>
}

function hasLyricsSections(value: unknown): value is GPTLyricsSection[] {
  return Array.isArray(value) && value.length > 0 && value.every(section => section
    && typeof section.content === 'string' && (section.type === undefined || typeof section.type === 'string')
    && (section.description == null || typeof section.description === 'string'))
    && value.some(section => section.content.trim())
}

/**
 * GPT를 활용하여 단일 곡 또는 플레이리스트를 일괄 생성
 * 단일 GPT-5.6-sol 요청. 모델 오류를 샘플 가사나 다른 모델로 대체하지 않는다.
 */
type GenreThematicProfile = {
  genre: 'trot' | 'citypop' | 'joseon' | 'lofi' | 'acoustic' | 'kpop' | 'rock' | 'chanson' | 'general' | 'futurebass'
  nameKo: string
  thematicPillars: {
    title: string
    subThemes: string[]
    sampleTitles: string[]
    lyricsGuidance: string
  }[]
  personaTitleFormula: string
  bannedCliches: string
  descriptionInstructions?: string
} & ({ preserveStyle: true; randomBpm?: () => number; instruments?: string[] }
  | { preserveStyle?: false; randomBpm: () => number; instruments: string[] })

export function detectGenreThematicProfile(stylePrompt: string, topic?: string, presetId?: string, options?: { ordinarySong?: boolean }): GenreThematicProfile {
  if (presetId === HARAJUKU_FUTURE_BASS_PRESET && options?.ordinarySong) {
    return {
      genre: 'futurebass',
      nameKo: '하라주쿠 카와이 Future Bass',
      thematicPillars: [
        {
          title: '네온 거리의 발견과 자기표현',
          subThemes: ['색과 움직임으로 발견하는 나만의 취향', '친구와 주고받는 장난스러운 신호', '익숙한 거리를 새롭게 바라보는 순간'],
          sampleTitles: ['네온의 다음 색', '우리만의 신호', '골목 끝의 반짝임'],
          lyricsGuidance: '구체적인 장면과 재치 있는 감정 변화로 성숙한 화자의 개성을 드러낸다. 선율이 이어지는 Verse와 기억에 남는 Chorus를 대비시키며 귀여운 색감을 유아적 말투나 단순한 구호로 대신하지 않는다.'
        },
        {
          title: '설렘과 새로운 움직임',
          subThemes: ['머뭇거림을 넘어 내딛는 발걸음', '두 번째 장면에서 달라지는 시선과 관계', '반짝이는 밤에 남기는 작은 약속'],
          sampleTitles: ['한 걸음의 리듬', '반짝임의 이유', '다음 모퉁이'],
          lyricsGuidance: '첫 장면을 의미 있게 발전시키고 자연스럽게 부를 수 있는 완성된 문장과 선명한 훅을 사용한다. 퓨처 베이스의 리듬과 생동감을 살리며 조용한 공부용 로파이, 어쿠스틱 힐링곡이나 억지로 높은 피치의 캐릭터송으로 바꾸지 않는다.'
        }
      ],
      personaTitleFormula: 'Use an original title rooted in a vivid Harajuku scene, playful discovery or emotional turn; keep the requested language and avoid generic study or healing labels.',
      bannedCliches: 'Avoid childish slogans, repetitive filler and unrelated acoustic-study imagery. Preserve energetic Future Bass identity, meaningful melodic lyrics and the user\'s chosen vocal character.',
      descriptionInstructions: HARAJUKU_DESCRIPTION_INSTRUCTIONS,
      preserveStyle: true,
    }
  }
  if (presetId === BRAZILIAN_FUNK_PERFORMANCE_PRESET && options?.ordinarySong) {
    return {
      genre: 'kpop',
      nameKo: 'Brazilian Funk & K-pop 퍼포먼스',
      thematicPillars: [
        {
          title: '자신감과 무대 위의 변화',
          subThemes: ['망설임을 넘어서는 첫걸음', '서로의 움직임에 응답하는 순간', '함께 만드는 무대의 에너지'],
          sampleTitles: ['우리의 박자', '선을 넘어', '발끝의 신호'],
          lyricsGuidance: '구체적인 장면과 선택으로 자신감의 변화를 전개한다. 리듬감 있는 Verse, 감정이 상승하는 melodic Pre-Chorus, 기억에 남는 Chorus를 대비시키되 구호만 반복하지 않는다.'
        },
        {
          title: '긴장과 연결의 리듬',
          subThemes: ['시선과 발걸음으로 주고받는 대화', '각자의 리듬이 만나는 순간', '두 번째 장면에서 달라지는 관계'],
          sampleTitles: ['같은 바닥 위에서', '눈빛의 대답', '다음 걸음'],
          lyricsGuidance: '첫 Verse와 다른 사건이나 시점으로 두 번째 Verse를 발전시킨다. 자연스럽게 노래할 수 있는 완성된 문장과 명확한 훅을 사용하고 가창을 서두르거나 이야기를 생략하지 않는다.'
        }
      ],
      personaTitleFormula: 'Use a concise, original title rooted in the song\'s concrete performance scene, emotional change or memorable hook.',
      bannedCliches: 'Avoid generic empowerment slogans, repeated filler and unrelated acoustic-pop scenery; honor the requested theme and the selected Brazilian Funk and K-pop performance recipe.',
      randomBpm: () => 130,
      instruments: ['syncopated tamborzao percussion', 'punchy electronic bass', 'rhythmic synth accents'],
      preserveStyle: true,
    }
  }
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
  if (profile.preserveStyle) return baseStyle
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
  params: GenerateLyricsParams,
  dependencies: LyricsGeneratorDependencies = {}
): Promise<(LyricsGeneratorResult | PlaylistGeneratorResult) & { stylePrompt?: string; modelUsage?: LyricsModelUsage }> {
  const apiKey = dependencies.apiKey ?? process.env.OPENAI_API_KEY ?? ''
  if (!apiKey) throw new Error('가사 생성에 필요한 OpenAI API 설정이 없습니다.')
  const isPlaylist = params.isPlaylistMode === true
  const trackCount = params.trackCount ?? 10
  
  // Only this selected preset's ordinary vocal lyrics use the performance form.
  // Instrumental callers bypass this engine; dedicated short-form behavior stays intact.
  const isExplicitShortForm = typeof params.durationSeconds === 'number' && Number.isFinite(params.durationSeconds)
    && params.durationSeconds > 0 && params.durationSeconds <= 60
  const isOrdinarySong = !params.viralMode && !isExplicitShortForm
  const usePerformanceStructure = params.presetId === BRAZILIAN_FUNK_PERFORMANCE_PRESET && isOrdinarySong
  const songStructure = usePerformanceStructure ? BRAZILIAN_FUNK_PERFORMANCE_INSTRUCTIONS : NATURAL_SONG_INSTRUCTIONS
  const genreProfile = detectGenreThematicProfile(params.stylePrompt, params.topic, params.presetId, { ordinarySong: isOrdinarySong })

  // Randomize style tags to ensure different production results
  const randomizedStylePrompt = randomizeStylePrompt(params.stylePrompt, genreProfile)
  // Unique seed to force the LLM to write distinct lyrics and titles
  const seed = Math.random().toString(36).substring(2, 10)

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
    let matchedPlaybook: CurationPlaybook | null = null
    if (params.presetId) {
      const { getPlaybookByKey } = await import('@/lib/db/knowledge')
      matchedPlaybook = await getPlaybookByKey(params.presetId)
    }

    let playbooks: CurationPlaybook[] = []
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
    ? getPlaylistSystemPrompt(randomizedStylePrompt, params.topic, trackCount, languageInstruction, params.vocalGender, playbookInstructions, genreProfile, songStructure)
    : getSingleSystemPrompt(randomizedStylePrompt, params.topic, languageInstruction, params.vocalGender, playbookInstructions, params.durationSeconds, params.viralMode, genreProfile, songStructure)

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

  // Preserve the Chat Completions endpoint; strict schemas fix response-shape drift.
  // High effort needs
  // a completion budget for reasoning as well as a complete playlist response.
  let response: Response
  try {
    response = await (dependencies.fetch || fetch)(OPENAI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: LYRICS_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        response_format: lyricsResponseFormat(isPlaylist, trackCount),
        reasoning_effort: 'high',
        max_completion_tokens: 32_000,
      }),
      signal: AbortSignal.timeout(LYRICS_PROVIDER_TIMEOUT_MS),
    })
  } catch { throw new Error('GPT-5.6-sol 가사 생성 연결이 중단되었습니다. 다시 시도해 주세요.') }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`GPT-5.6-sol 가사 생성 요청이 실패했습니다 (HTTP ${response.status}).`)
  }
  let parsed: GPTLyricsPayload
  let modelUsage: LyricsModelUsage
  try {
    const data = await response.json()
    if (typeof data.model !== 'string' || (data.model !== LYRICS_MODEL && !data.model.startsWith(`${LYRICS_MODEL}-`))) throw new Error('Model mismatch')
    const usage = data.usage
    if (!Number.isInteger(usage?.prompt_tokens) || usage.prompt_tokens < 0
        || !Number.isInteger(usage?.completion_tokens) || usage.completion_tokens < 0) throw new Error('Missing token usage')
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens
    if (reasoningTokens !== undefined && (!Number.isInteger(reasoningTokens) || reasoningTokens < 0)) throw new Error('Invalid reasoning usage')
    modelUsage = { requestedModel: LYRICS_MODEL, actualModel: data.model, reasoningEffort: 'high',
      inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens,
      ...(reasoningTokens !== undefined ? { reasoningTokens } : {}) }
    const choice = data.choices?.[0]
    const content = choice?.message?.content
    if (choice?.message?.refusal || (choice?.finish_reason && choice.finish_reason !== 'stop')
        || typeof content !== 'string' || !content.trim() || content.length > 200_000) throw new Error('Incomplete lyrics')
    parsed = JSON.parse(content) as GPTLyricsPayload
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid lyrics')
  } catch { throw new LyricsGenerationError('lyrics_response_incomplete', 'GPT-5.6-sol 가사 생성 응답을 확인하지 못했습니다. 다시 시도해 주세요.') }

  if (isPlaylist) {
    if (typeof parsed.playlistTitle !== 'string' || !parsed.playlistTitle.trim()
        || !Array.isArray(parsed.tracks) || parsed.tracks.length !== trackCount
        || parsed.tracks.some(track => !track || !hasLyricsSections(track.sections))) {
      throw new LyricsGenerationError('lyrics_response_structure', `요청한 ${trackCount}곡의 가사 형식을 완성하지 못했습니다. 다시 생성해 주세요.`)
    }
    
    const tracks: PlaylistTrack[] = parsed.tracks.map((t, tIdx: number) => {
      let sCounter = 0
      const sections: LyricsSection[] = (t.sections || []).map(s => {
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
      assertSafeVocalLyrics(compileLyricsSections(sections).lyricsPrompt)
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
      modelUsage,
    }
  } else {
    if (typeof parsed.title !== 'string' || !parsed.title.trim() || !hasLyricsSections(parsed.sections)) {
      throw new LyricsGenerationError('lyrics_response_structure', '가사 생성 응답에 곡 제목이나 가사 파트가 빠졌습니다. 다시 생성해 주세요.')
    }

    let counter = 0
    const sections = parsed.sections.map(s => {
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

    const lyricsPrompt = compileLyricsSections(sections).lyricsPrompt
      || (typeof parsed.lyricsPrompt === 'string' ? parsed.lyricsPrompt : '')
    assertSafeVocalLyrics(lyricsPrompt)
    console.log(`[Lyrics Generator] Single track success, ${sections.length} sections`)

    return {
      title: parsed.title,
      youtubeTags: parsed.youtubeTags || '',
      snsHashtags: parsed.snsHashtags || '',
      sections,
      stylePrompt: randomizedStylePrompt,
      lyricsPrompt,
      modelUsage,
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
  genreProfile?: GenreThematicProfile,
  songStructure: SongStructureInstructions = NATURAL_SONG_INSTRUCTIONS
): string {
  const profile = genreProfile || detectGenreThematicProfile(stylePrompt, topic)
  const targetDuration = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)
    && durationSeconds > 0 && durationSeconds <= 60 ? durationSeconds : undefined

  let genderInstruction = ''
  if (vocalGender === 'female') {
    genderInstruction = '\n- VOCAL GENDER RULE: You MUST write the song for a female vocalist. In the section "description" fields, strictly write "female vocal" or "intimate female vocal close to mic" and avoid any male descriptors.'
  } else if (vocalGender === 'male') {
    genderInstruction = '\n- VOCAL GENDER RULE: You MUST write the song for a male vocalist. In the section "description" fields, strictly write "male vocal" or "dry male vocal close-up" and avoid any female descriptors.'
  } else if (vocalGender === 'duet') {
    genderInstruction = '\n- VOCAL GENDER RULE: You MUST write the song as a male and female duet. Assign duet parts in the lyrics and specify "beautiful male and female duet harmonies" or "interplay of male and female vocals" in the section "description" fields.'
  }

  // 명시적인 숏폼만 길이를 제한하고, 일반 곡은 완결된 음악적 전개를 사용한다.
  let durationStructureInstruction = ''
  if (targetDuration === undefined) {
    durationStructureInstruction = songStructure.composition
  } else if (targetDuration <= 15) {
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
4. **MUSIC DIRECTIONS**: Keep arrangement and vocal-performance cues only in section "description" fields as plain, unbracketed English (e.g. upbeat brass stabs, mournful accordion solo, saxophone climax, gentle acoustic strumming, fade out). They are production context, never words to be sung.`

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
1. **Verbatim Phrase Inclusion**: If the user explicitly requests words to be sung (for example "내가 널 버릴거야~"), preserve that exact lyric phrase. Quoted musical, instrument, or vocal-performance instructions are production directions and must not become sung words.
2. **Style & Vocal Adjustment**: Reflect musical or vocal performance requests only inside the section "description" fields as plain, unbracketed English.`

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
  "sections": [
    {
      "type": "intro or verse or chorus or outro",
      "content": "Only sung lyric words and any structural tags required by the structure contract; no production descriptions",
      "description": "Plain English music-production directions, no square brackets"
    }
  ]
}
${playbookInstructions || ''}
${LYRICS_FIELD_CONTRACT}`
  }

  return `You are a world-class, chart-topping songwriter and music producer specializing in ${profile.nameKo} and global playlist curation. You have deep expertise in Suno AI music generation.
${genderInstruction}
${durationStructureInstruction}
${lyricsQualityRules}${profile.descriptionInstructions || ''}
${customUserDirectives}

Your task: Generate a professional-grade song package (title, SEO tags, hashtags, and structured lyrics) for the style: "${stylePrompt}".
${topic ? `The theme/topic is: "${topic}".` : ''}

You MUST write all titles, sung lyrics, and tags strictly in the requested language style: "${languageInstruction}". Section description fields must be plain, unbracketed English.

## JSON Schema (Strict)
{
  "title": "🎵 ${profile.personaTitleFormula}",
  "youtubeTags": "comma, separated, SEO, keywords, 15-20 tags",
  "snsHashtags": "#hashtag1 #hashtag2 ... (10-15 hashtags for TikTok/Instagram/Shorts)",
  "sections": [
    {
      "type": "intro or verse or pre-chorus or chorus or bridge or outro",
      "content": "Only sung lyric words (newline separated). NO section headers or music-production directions inside.",
      "description": "Plain, unbracketed English musical directions (e.g., passionate male vocal, mournful saxophone intro)"
    }
  ]
}
${playbookInstructions || ''}
${LYRICS_FIELD_CONTRACT}
`
}

function getPlaylistSystemPrompt(
  stylePrompt: string, 
  topic?: string, 
  trackCount: number = 10, 
  languageInstruction: string = 'Korean',
  vocalGender: string = 'mixed',
  playbookInstructions?: string,
  genreProfile?: GenreThematicProfile,
  songStructure: SongStructureInstructions = NATURAL_SONG_INSTRUCTIONS
): string {
  const profile = genreProfile || detectGenreThematicProfile(stylePrompt, topic)

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
${songStructure.composition}

## 🌟 PLAYLIST DIVERSITY MANDATE (${profile.nameKo}):
To run a successful 20~40 track playlist channel, each track MUST explore a distinct thematic angle across the genre's universe:
${profile.thematicPillars.map((p, idx) => `Pillar ${idx + 1}. **${p.title}** (Sub-themes: ${p.subThemes.join(', ')})`).join('\n')}

${profile.bannedCliches}${profile.descriptionInstructions || ''}

Your task is to generate a comprehensive ${trackCount}-track playlist package based on the requested style: "${stylePrompt}".
${topic ? `The entire playlist theme/topic is: "${topic}".` : ''}

You MUST write playlist titles, YouTube descriptions, track titles, tags, and sung lyrics strictly in the requested language style: "${languageInstruction}". Section description fields must be plain, unbracketed English.

You MUST return a JSON object matching this schema:
{
  "playlistTitle": "🎵 ${profile.personaTitleFormula}",
  "youtubeDescription": "A warm, emotional curator comment (1-2 paragraphs) welcoming listeners, followed by an ordered track list using the generated titles. Audio timestamps will be added after the rendered track lengths are known; do not invent timestamps.",
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
          "content": "Only sung lyric words for this section; no music-production directions",
          "description": "Plain, unbracketed English musical directions (e.g., nostalgic accordion solo, punchy brass drop)"
        }
      ]
    }
  ]
}

Rules:
1. Generate exactly ${trackCount} tracks inside the "tracks" array. Each track MUST have a completely UNIQUE theme, title, and lyrics from the ${profile.nameKo} pillars.
2. For each track, generate ${songStructure.playlistOrder} sections.
3. Outro Control: Keep Outro short (1-2 lines) with a natural resolved ending or Instrumental Outro in the description. Keep arrangement directions separate from sung words.
4. Strictly return valid JSON.
${playbookInstructions || ''}
${LYRICS_FIELD_CONTRACT}
`
}
