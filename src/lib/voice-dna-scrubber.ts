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

// 노이즈 필터링 지터 단어 풀
const JITTER_POOL = ['velvety', 'breathy', 'airy', 'crisp', 'pure', 'warm', 'smooth', 'intimate', 'focused', 'clear']

/**
 * Voice DNA 속성을 기반으로 Suno AI 음색 프롬프트를 빌드합니다.
 */
export function buildVoicePromptFromAttributes(dna: VoiceDnaRecord, customNoiseRatio?: number): { tags: string; gender: 'female' | 'male' | 'duet' } {
  const phys = dna.physical_layers || {}
  const textures = dna.textures || []
  const emotions = dna.emotions || []
  const perf = dna.performance || {}
  const gender = phys.gender || 'female'

  // 1. 핵심 음색 빌드
  const voiceTags: string[] = []

  // 성별 및 음색 기본
  if (gender === 'female') {
    if (phys.pitch && phys.pitch > 75) {
      voiceTags.push(phys.age === 'childish' ? 'sweet high-pitched anime female voice' : 'clear high soprano female voice')
    } else {
      voiceTags.push('warm emotional female vocals')
    }
  } else if (gender === 'male') {
    if (phys.chest && phys.chest > 75) {
      voiceTags.push('deep warm chest-resonant baritone male vocals')
    } else {
      voiceTags.push('expressive melodic male voice')
    }
  } else {
    voiceTags.push('duet vocals, male and female harmonies')
  }

  // 2. 질감(Textures) & 감정(Emotions) 결합
  if (textures.length > 0) {
    voiceTags.push(`${textures.map(t => t.toLowerCase()).join(' and ')} vocal texture`)
  }
  if (emotions.length > 0) {
    voiceTags.push(`${emotions.map(e => e.toLowerCase()).join(' and ')} emotion`)
  }

  // 3. 다이내믹스 속성 가중 반영
  if (perf.power && perf.power > 75) {
    voiceTags.push('powerful vocal delivery')
  }
  if (perf.vibrato && perf.vibrato > 70) {
    voiceTags.push('rich vibrato')
  }

  // 4. 노이즈 지터(Entropy) 결합으로 수노 복제 방지 및 톤 다변화
  const entropy = typeof customNoiseRatio === 'number' ? customNoiseRatio : (dna.noise_entropy ?? 15)
  if (entropy > 5) {
    // 0~100 entropy 수치를 기반으로 무작위 단어 주입 (시드 기반 결정성 보장을 위해 vd_code 문자열 코드를 시드로 활용)
    const seedStr = dna.vd_code || 'VD-DEFAULT'
    let seed = 0
    for (let i = 0; i < seedStr.length; i++) {
      seed += seedStr.charCodeAt(i)
    }

    const jitterCount = Math.min(3, Math.ceil(entropy / 30))
    const selectedJitters: string[] = []
    for (let j = 0; j < jitterCount; j++) {
      const idx = (seed + j * 7) % JITTER_POOL.length
      const word = JITTER_POOL[idx]
      if (!selectedJitters.includes(word)) {
        selectedJitters.push(word)
      }
    }
    if (selectedJitters.length > 0) {
      voiceTags.push(`${selectedJitters.join(', ')} details`)
    }
  }

  // 5. 스튜디오 급 마이크 및 드라이 믹싱 결합 (가사 명료화)
  voiceTags.push('vocal-centric mix, dry close-up vocals, crystal clear vocal delivery')

  return {
    tags: voiceTags.join(', '),
    gender
  }
}

/**
 * 성별 상충 태그 정화 유틸리티
 */
export function scrubConflictingVocalTags(stylePrompt: string, targetGender: 'female' | 'male' | 'duet'): string {
  let cleaned = stylePrompt

  if (targetGender === 'female') {
    // 남성 보컬 관련 지시어 제거
    cleaned = cleaned
      .replace(/\b(male|man|men|boy|baritone|tenor|gentleman)\b\s*(voice|vocals|vocal)?/gi, '')
      .replace(/,\s*,/g, ',')
  } else if (targetGender === 'male') {
    // 여성 보컬 관련 지시어 제거
    cleaned = cleaned
      .replace(/\b(female|woman|women|lady|girl|soprano|alto)\b\s*(voice|vocals|vocal)?/gi, '')
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
