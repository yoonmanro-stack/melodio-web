import { createClient } from '@supabase/supabase-js'

export interface VoiceDnaRecord {
  vd_code: string
  name: string
  audio_url?: string
  audio_url_b?: string
  physical_layers: {
    gender?: 'female' | 'male' | 'duet'
    age?: 'young' | 'mature' | 'childish'
    pitch?: number
    brightness?: number
    chest?: number
    head?: number
    weight?: number
    audio_url?: string
    audio_url_b?: string
  }
  textures?: string[]
  emotions?: string[]
  performance?: {
    power?: number
    dynamics?: number
    vibrato?: number
    groove?: number
  }
  style?: string
  /** Vocal space; legacy records use style for this setting. */
  reverb?: string
  /** Musical phrasing instructions, independent of song genre and language. */
  delivery?: string
  /** Save/restore metadata; reusable timbre does not impose song language. */
  language?: string
  preview_genre?: string
  sample_version?: 'A' | 'B'
  noise_entropy?: number
}

// 6대 시그니처 기본 보이스 사전 정의
export const defaultSystemVoices: Record<string, VoiceDnaRecord> = {
  'VD-1004': {
    vd_code: 'VD-1004',
    name: 'Aria',
    physical_layers: { gender: 'female', age: 'young', pitch: 80, brightness: 85, chest: 40, head: 80 },
    textures: ['Crystal', 'Breathy'],
    emotions: ['Dreamy', 'Hopeful'],
    performance: { power: 65, dynamics: 70, vibrato: 60 },
    style: 'Pop',
    noise_entropy: 15
  },
  'VD-3802': {
    vd_code: 'VD-3802',
    name: 'Kaelen',
    physical_layers: { gender: 'male', age: 'mature', pitch: 35, brightness: 45, chest: 85, head: 30 },
    textures: ['Smoky', 'Velvet'],
    emotions: ['Lonely', 'Dark'],
    performance: { power: 80, dynamics: 85, vibrato: 75 },
    style: 'Soul',
    noise_entropy: 10
  },
  'VD-7705': {
    vd_code: 'VD-7705',
    name: 'Moe',
    physical_layers: { gender: 'female', age: 'childish', pitch: 90, brightness: 95, chest: 20, head: 90 },
    textures: ['Silky', 'Clean'],
    emotions: ['Passionate', 'Happy'],
    performance: { power: 60, dynamics: 65, vibrato: 50 },
    style: 'EDM',
    noise_entropy: 20
  }
}

const TEXTURE_PROMPTS: Record<string, string> = {
  velvet: 'velvety rounded texture',
  silky: 'silky connected texture',
  breathy: 'audible breath around a voiced core',
  smoky: 'smoky vocal grain',
  metallic: 'focused metallic edge',
  crystal: 'crystalline ringing edge',
  glass: 'transparent glassy resonance',
  wood: 'woody warm resonance',
  cotton: 'soft diffuse vocal edges',
  rough: 'raspy grain on note attacks',
  clean: 'clean controlled texture',
  husky: 'husky textured core',
  smooth: 'smooth sustained texture',
  airy: 'airy voiced texture',
}

const EMOTION_PROMPTS: Record<string, string> = {
  hopeful: 'hopeful', lonely: 'introspective lonely', broken: 'vulnerable aching',
  romantic: 'tender romantic', dark: 'somber', powerful: 'confident',
  dreamy: 'dreamy', calm: 'calm restrained', passionate: 'impassioned', happy: 'joyful',
}

const REVERB_PROMPTS: Record<string, string> = {
  studio: 'close studio vocal with minimal room reverb',
  'rain cafe': 'intimate small-room vocal ambience',
  'concert hall': 'moderate hall reverb behind the foreground vocal',
  arena: 'wide controlled vocal reverb with a focused lead',
  'sunset beach': 'gentle spacious vocal ambience',
}

function dialValue(value?: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : undefined
}

function dialPrompt(value: number | undefined, low: string, middle: string, high: string, lowEnd = 35, middleEnd = 70): string | undefined {
  const dial = dialValue(value)
  if (dial === undefined) return undefined
  return dial <= lowEnd ? low : dial <= middleEnd ? middle : high
}

function selectedPrompts(values: string[], dictionary: Record<string, string>): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.flatMap(value => {
    if (typeof value !== 'string') return []
    const key = value.trim().toLowerCase()
    return Object.hasOwn(dictionary, key) ? [dictionary[key]] : []
  }))]
}

/**
 * Voice DNA 속성을 기반으로 Suno AI 음색 프롬프트를 빌드합니다.
 */
export function buildVoicePromptFromAttributes(dna: VoiceDnaRecord, customNoiseRatio?: number): { tags: string; gender: 'female' | 'male' | 'duet' } {
  const phys = dna.physical_layers || {}
  const textures = dna.textures || []
  const emotions = dna.emotions || []
  const perf = dna.performance || {}
  const gender = phys.gender === 'male' || phys.gender === 'duet' ? phys.gender : 'female'
  const register = gender === 'male'
    ? dialPrompt(phys.pitch, 'low baritone register', 'middle male register', 'upper tenor register', 35, 69)
    : gender === 'female'
      ? dialPrompt(phys.pitch, 'low alto register', 'middle mezzo register', 'upper soprano register', 45, 74)
      : dialPrompt(phys.pitch, 'low-register center', 'middle-register center', 'upper-register center', 35, 74)
  const age = phys.age === 'young' ? 'youthful adult character'
    : phys.age === 'mature' ? 'mature vocal character'
      : phys.age === 'childish' ? 'playful youthful character' : undefined

  // Keep register, resonance, body and delivery independent. A strong chest
  // setting does not turn every male voice into a low baritone.
  const voiceTags = [
    gender === 'duet' ? 'male and female duet vocals' : `${gender} solo vocals`,
    register, age,
    dialPrompt(phys.brightness, 'dark covered tone', 'balanced warm tone', 'bright open tone', 35, 65),
    dialPrompt(phys.chest, 'light chest resonance', 'balanced chest resonance', 'grounded chest resonance'),
    dialPrompt(phys.head, 'restrained head resonance', 'blended head resonance', 'ringing head resonance'),
    dialPrompt(phys.weight, 'light vocal body', 'medium vocal body', 'dense weighty vocal body'),
    ...selectedPrompts(textures, TEXTURE_PROMPTS),
  ].filter((tag): tag is string => Boolean(tag))

  const emotionTags = selectedPrompts(emotions, EMOTION_PROMPTS)
  if (emotionTags.length) voiceTags.push(`${emotionTags.join(' / ')} phrasing`)
  for (const tag of [
    dialPrompt(perf.power, 'soft supported delivery', 'measured vocal projection', 'strong supported projection'),
    dialPrompt(perf.dynamics, 'even restrained dynamics', 'controlled phrase swells', 'expressive soft-to-strong dynamics'),
    dialPrompt(perf.vibrato, 'mostly straight sustained notes', 'subtle phrase-tail vibrato', 'broad controlled vibrato', 30, 65),
    dialPrompt(perf.groove, 'steady straight phrasing', 'gently syncopated phrasing', 'strong syncopated rhythmic pocket'),
  ]) {
    if (tag) voiceTags.push(tag)
  }

  if (typeof dna.delivery === 'string' && dna.delivery.trim()) {
    voiceTags.push(dna.delivery.trim().replace(/\s+/g, ' ').slice(0, 160))
  }
  const selectedSpace = dna.reverb ?? dna.style
  const space = typeof selectedSpace === 'string' ? selectedSpace.trim().toLowerCase() : undefined
  if (space && Object.hasOwn(REVERB_PROMPTS, space)) voiceTags.push(REVERB_PROMPTS[space])

  // Entropy varies natural expression, not timbre by an arbitrary saved ID.
  // It is a prompt instruction, not an audio noise-removal operation.
  const entropy = dialValue(customNoiseRatio) ?? dialValue(dna.noise_entropy) ?? 15
  voiceTags.push(entropy <= 5 ? 'restrained phrasing variation'
    : entropy <= 35 ? 'subtle human phrasing variation'
      : entropy <= 70 ? 'natural breath and onset variation'
        : 'expressive human breath and phrasing variation')

  // Production clarity must not overwrite an intentionally grainy texture.
  voiceTags.push('foreground lead vocal, balanced backing, intelligible lyrics')

  return {
    tags: voiceTags.join(', '),
    gender
  }
}

/**
 * 성별 상충 태그 정화 유틸리티 (한국어/영어 완전 정화)
 */
export function scrubConflictingVocalTags(stylePrompt: string, targetGender: 'female' | 'male' | 'duet'): string {
  let cleaned = stylePrompt

  if (targetGender === 'female') {
    // 남성 및 혼성 보컬 관련 지시어 완전 제거
    cleaned = cleaned
      .replace(/\b(male|man|men|boy|baritone|tenor|gentleman)\b\s*(voice|vocals|vocal)?/gi, '')
      .replace(/\b(duet|duo|mixed vocal|mixed vocals)\b/gi, '')
      .replace(/(남성\s*보컬|남성|바리톤|테너|혼성\s*보컬|혼성|듀엣)/g, '')
      .replace(/,\s*,/g, ',')
  } else if (targetGender === 'male') {
    // 여성 및 혼성 보컬 관련 지시어 완전 제거
    cleaned = cleaned
      .replace(/\b(female|woman|women|lady|girl|soprano|alto|contralto)\b\s*(voice|vocals|vocal)?/gi, '')
      .replace(/\b(duet|duo|mixed vocal|mixed vocals)\b/gi, '')
      .replace(/(여성\s*보컬|여성|소프라노|알토|혼성\s*보컬|혼성|듀엣)/g, '')
      .replace(/,\s*,/g, ',')
  }

  // 다중 공백 및 미관상 좋지 않은 쉼표 제거
  return cleaned
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .join(', ')
}

/**
 * 최종 스타일 프롬프트를 Voice DNA 조합에 맞추어 변환 및 합성합니다.
 */
export async function scrubAndComposeVoiceDna(
  stylePrompt: string,
  vdCode: string,
  customNoiseRatio?: number
): Promise<string> {
  let dna = defaultSystemVoices[vdCode]

  // 데이터베이스에서 custom DNA 조회 시도 (RLS 정책 적용)
  if (!dna && vdCode.startsWith('VD-')) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data, error } = await supabase
          .from('voice_dnas')
          .select('*')
          .eq('vd_code', vdCode)
          .single()
        
        if (!error && data) {
          dna = {
            vd_code: data.vd_code,
            name: data.name,
            physical_layers: data.physical_layers || {},
            textures: data.textures || [],
            emotions: data.emotions || [],
            performance: data.performance || {},
            style: data.style,
            reverb: data.reverb,
            delivery: data.delivery ?? data.physical_layers?.delivery,
            noise_entropy: data.noise_entropy
          }
          console.log(`[DNA Scrubber] Custom Voice DNA Loaded successfully: ${vdCode}`)
        }
      }
    } catch (e) {
      console.warn(`[DNA Scrubber] Failed to query custom Voice DNA from DB for ${vdCode}:`, e)
    }
  }

  // DNA가 존재하지 않을 경우 기본 프롬프트 반환
  if (!dna) {
    return stylePrompt
  }

  // 1. DNA 기반 음색 태그 추출
  const { tags: voiceTags, gender } = buildVoicePromptFromAttributes(dna, customNoiseRatio)

  // 2. 상충되는 성별 태그 제거
  const scrubbedPrompt = scrubConflictingVocalTags(stylePrompt, gender)

  // 3. Top-Loading 방식으로 장르 뒤에 이식
  // 장르 태그 뒤(첫번째 콤마 뒤)에 배치하여 Suno AI의 가중치를 최대화
  const parts = scrubbedPrompt.split(',')
  const genre = parts[0]?.trim() || ''
  const remainder = parts.slice(1).map(p => p.trim()).filter(p => p.length > 0).join(', ')

  let finalPrompt = ''
  if (genre) {
    finalPrompt = genre
    if (voiceTags) finalPrompt += `, ${voiceTags}`
    if (remainder) finalPrompt += `, ${remainder}`
  } else {
    finalPrompt = voiceTags || scrubbedPrompt
  }

  return finalPrompt
}
