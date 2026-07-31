'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { presets } from '@/data/presets'
import type { Preset } from '@/types'
import { 
  Radio, 
  Settings2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Link2, 
  Sparkles, 
  Trash2,
  Calendar,
  Layers,
  FileText,
  Copy,
  Upload,
  Image as ImageIcon,
  Download,
  Maximize2,
  Check,
  Pin
} from 'lucide-react'

const YoutubeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={props.className} 
    width={props.width || "24"} 
    height={props.height || "24"}
  >
    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.524 3.545 12 3.545 12 3.545s-7.525 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.029 0 12 0 12s0 3.971.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.863.508 9.388.508 9.388.508s7.524 0 9.388-.508a3.002 3.002 0 0 0 2.11-2.11C24 15.971 24 12 24 12s0-3.971-.502-5.837z" />
    <polygon points="9.545 15.568 15.818 12 9.545 8.432" fill="black" />
  </svg>
)

interface YoutubeChannel {
  channel_id: string
  channel_title: string
  created_at: string
}

interface AutomationSettings {
  id: string
  channel_id: string
  audio_preset_id: string
  upload_days: string[]
  upload_time: string
  longform_active: boolean
  shorts_active: boolean
  monetization_links: string[]
  branding_metadata?: any
  target_region?: string
  variation_strength?: string
}

interface AutomationLog {
  id: string
  status: string
  youtube_video_id: string
  error_message: string
  started_at: string
  completed_at: string
}

const DAYS_OF_WEEK = [
  { label: '월', value: 'MON' },
  { label: '화', value: 'TUE' },
  { label: '수', value: 'WED' },
  { label: '목', value: 'THU' },
  { label: '금', value: 'FRI' },
  { label: '토', value: 'SAT' },
  { label: '일', value: 'SUN' },
]

const BANNER_FORMATS = [
  { value: 'image-title', label: '이미지 + 채널명(로고)', prompt: 'centered channel logo and clean text branding, typography overlay of the channel name in the center' },
  { value: 'image-only', label: '이미지만 사용', prompt: 'scenic art focus, clean composition without any text or typography overlay' },
  { value: 'image-copy', label: '이미지 + 카피라이트', prompt: 'centered typography of the channel name along with a sub-slogan copywriting, clean title overlay' },
]

const BANNER_STYLES = [
  { value: 'scenic-photo', label: '감성 실사 (풍경/자연)', prompt: 'cinematic photography of relaxing scenic nature or landscape, warm lighting, deep atmosphere snap' },
  { value: 'minimal-typo', label: '미니멀/타이포그래피', prompt: 'minimalist clean design, simple solid background, focus on premium clean typography layout' },
  { value: 'illustration', label: '2D 일러스트 (애니메이션/시티팝 감성)', prompt: 'charming 2D illustration in Ghibli or neon retro citypop anime style, cozy hand-drawn aesthetics' },
  { value: '3d-player', label: '3D/플레이어 그래픽', prompt: 'vintage 3D player interface graphic, retro LP record, cassette tape, or nostalgic audio cockpit elements' },
]

const PROFILE_FORMATS = [
  { value: 'logo-symbol', label: '로고/심볼형', prompt: 'minimalist vector emblem, iconic symbol centered' },
  { value: 'character', label: '일러스트 캐릭터형', prompt: 'charming illustrative character face, detailed mascot avatar' },
  { value: 'object-photo', label: '풍경/오브제 이미지', prompt: 'cinematic close-up of a thematic object like LP, headphone, or aesthetic prop' },
]

const PROFILE_STYLES = [
  { value: 'minimal-simple', label: '미니멀/심플', prompt: 'clean flat vector lines, single-color background, highly recognizable avatar shape' },
  { value: 'illustration-char', label: '2D 일러스트 캐릭터', prompt: 'cute 2D anime illustration character portrait, soft shading' },
  { value: 'neon-retro', label: '네온/레트로 그래픽', prompt: 'vibrant neon color scheme, cyber-retro glowing graphics, retrofuturism' },
]

const THUMBNAIL_FORMATS = [
  { value: 'title-text', label: '이미지 + 플레이리스트 제목(텍스트)', prompt: 'large high-impact bold typography title text overlayed clearly in the center or left side' },
  { value: 'tracklist', label: '이미지 + 트랙리스트(곡 목록)', prompt: 'clean tracklist song titles preview text rendered nicely on the side of the composition' },
  { value: 'image-only', label: '이미지만 사용', prompt: 'scenic aesthetic imagery only, no text labels, atmospheric click-bait visual' },
]

const THUMBNAIL_STYLES = [
  { value: 'aesthetic-photo', label: '감성 실사 (인물/스냅 사진)', prompt: 'aesthetic snap photo of model or room interior, cinematic movie frame grain' },
  { value: 'anime-loop', label: '애니메이션/일러스트 (루프물 스타일)', prompt: 'cozy anime illustration background reminiscent of lo-fi study loops' },
  { value: 'vintage-retro', label: 'Y2K/빈티지 레트로', prompt: '90s camcorder quality, nostalgic Y2K album art vibe, low-fi scanline textures' },
  { value: 'dark-mood', label: '다크/무드', prompt: 'moody midnight city vibes, dark rainy window, low-key lighting, calming shadows' },
]

function parsePlaybookBrandingLocal(content: string) {
  const lines = (content || '').split('\n')
  const names: { name: string; handle: string; concept: string }[] = []

  let inBrandingSection = false
  let currentItem: any = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    if (line.includes('## 🏷️ 추천 브랜드명') || line.includes('추천 브랜드명 & 핸들')) {
      inBrandingSection = true
      continue
    }
    
    if (inBrandingSection && line.startsWith('## ') && !line.includes('추천 브랜드명')) {
      inBrandingSection = false
      break
    }

    if (inBrandingSection) {
      const nameMatch = line.match(/^\d+\.\s*\*\*(.*?)\*\*/)
      if (nameMatch) {
        if (currentItem) {
          names.push(currentItem)
        }
        currentItem = {
          name: nameMatch[1].trim(),
          handle: '',
          concept: ''
        }
        continue
      }

      if (currentItem) {
        const handleMatch = line.match(/추천\s*핸들.*`@(.*?)`/) || line.match(/@([a-zA-Z0-9_]+)/)
        if (handleMatch) {
          currentItem.handle = '@' + handleMatch[1].trim()
          continue
        }

        const conceptMatch = line.match(/컨셉\s*:\s*(.*)/)
        if (conceptMatch) {
          currentItem.concept = conceptMatch[1].trim()
        }
      }
    }
  }

  if (currentItem) {
    names.push(currentItem)
  }

  return names
}

function splitNameLocal(fullName: string) {
  const match = fullName.match(/^(.*?)\s*\((.*?)\)$/)
  if (match) {
    return {
      eng: match[1].trim(),
      loc: match[2].trim()
    }
  }
  return {
    eng: fullName,
    loc: fullName
  }
}

function compressNameLocal(name: string, region: string) {
  const clean = name.replace(/[^a-zA-Z0-9가-힣ぁ-んァ-ヶ亜-熙]/g, ' ').trim()
  const words = clean.split(/\s+/)
  const firstWord = words[0] || name
  
  if (region === 'KR' || region === 'JP') {
    if (firstWord.length > 3) {
      return firstWord.slice(0, 3)
    }
    if (firstWord.length < 2) {
      return (name.replace(/\s+/g, '').slice(0, 3)) || '쉼'
    }
    return firstWord
  } else {
    if (firstWord.length > 6) {
      return firstWord.slice(0, 6)
    }
    if (firstWord.length < 3) {
      return 'Vibe'
    }
    return firstWord
  }
}

function getBrandingNamesFallback(region: string, namingLength: string, pr: any) {
  const name = pr?.name || 'Melodio'
  const id = pr?.id || 'melodio'
  
  if (namingLength === 'type-1') {
    // Short-Form (한글 2~3자, 영문 3~6자)
    if (region === 'JP') {
      return [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: '和風・伝統의 감성을 직관적이고 임팩트 있게 2~3자로 줄인 네이밍',
          korean: [
            { name: '和風', desc: '와풍: 일본 풍류의 고즈넉한 선율 [디자인가이드] 모노그램 추천' },
            { name: '響き', desc: '히비키: 울림이 있는 은은한 분위기 [디자인가이드] 워드마크 적용' },
            { name: '和Fi', desc: '와파이: 전통과 로파이 비트의 합성어 [디자인가이드] 텍스트 중심' }
          ],
          english: [
            { name: 'Wafu', desc: 'Japanese traditional aesthetic style [디자인가이드] centered text' },
            { name: 'Hibiki', desc: 'Gentle, resonant lofi soundscape [디자인가이드] minimal symbol' },
            { name: 'WaFi', desc: 'Traditional roots combined with chill lofi [디자인가이드] bold modern' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: '글로벌 범용성을 강조한 3~6글자 영문 네이밍',
          korean: [
            { name: 'Shinya', desc: 'Midnight quiet and tranquil vibe [디자인가이드] clean text' },
            { name: 'Sakura', desc: 'Cherry blossom emotional lofi [디자인가이드] pastel symbol' },
            { name: 'Miyabi', desc: 'Elegant traditional garden soundscape [디자인가이드] modern layout' }
          ],
          english: [
            { name: 'Shinya', desc: 'Midnight quiet and tranquil vibe [디자인가이드] clean text' },
            { name: 'Sakura', desc: 'Cherry blossom emotional lofi [디자인가이드] pastel symbol' },
            { name: 'Miyabi', desc: 'Elegant traditional garden soundscape [디자인가이드] modern layout' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: '한자/가나와 영문을 혼합한 초간결 조합형 브랜드',
          korean: [
            { name: '風', desc: '카제: 바람처럼 자유롭게 스며드는 사운드 [디자인가이드] 1글자 심볼형' },
            { name: '禅', desc: '젠: 마음의 평온을 주는 미니멀 비트 [디자인가이드] 동양풍 폰트' },
            { name: '紬', desc: '츠무기: 감성을 자아내는 실타래 음악 [디자인가이드] 워드마크' }
          ],
          english: [
            { name: 'Kaze', desc: 'Free wind lofi wave [디자인가이드] minimal line-art logo' },
            { name: 'Zen', desc: 'Calming and meditative minimal beats [디자인가이드] empty space focus' },
            { name: 'Tsumugi', desc: 'Weaving emotional traditional melodies [디자인가이드] thin serif text' }
          ]
        }
      ]
    } else if (region === 'EN') {
      return [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: 'English native branding centered around short, impactful words',
          korean: [
            { name: 'Vibe', desc: 'Vibe: The distinct emotional frequency [디자인가이드] bold typography' },
            { name: 'Beat', desc: 'Beat: Simple, grounding rhythm [디자인가이드] centered emblem' },
            { name: 'Flow', desc: 'Flow: Uninterrupted mental workspace [디자인가이드] minimal branding' }
          ],
          english: [
            { name: 'Vibe', desc: 'Vibe: The distinct emotional frequency [디자인가이드] bold typography' },
            { name: 'Beat', desc: 'Beat: Simple, grounding rhythm [디자인가이드] centered emblem' },
            { name: 'Flow', desc: 'Flow: Uninterrupted mental workspace [디자인가이드] minimal branding' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: 'Globally optimized English names matching the selected length',
          korean: [
            { name: 'Echo', desc: 'Echo: Subtle late-night reflection [디자인가이드] outline text' },
            { name: 'Aura', desc: 'Aura: Ambient, moody space [디자인가이드] soft gradient logo' },
            { name: 'Pace', desc: 'Pace: Slow, relaxed lifestyle [디자인가이드] minimal layout' }
          ],
          english: [
            { name: 'Echo', desc: 'Echo: Subtle late-night reflection [디자인가이드] outline text' },
            { name: 'Aura', desc: 'Aura: Ambient, moody space [디자인가이드] soft gradient logo' },
            { name: 'Pace', desc: 'Pace: Slow, relaxed lifestyle [디자인가이드] minimal layout' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: 'Compact modifier + keyword dual-word combination',
          korean: [
            { name: 'Zest', desc: 'Zest: Refreshing, clean aesthetic [디자인가이드] modern serif' },
            { name: 'Lush', desc: 'Lush: Deep, rich background textures [디자인가이드] organic badge' },
            { name: 'Melt', desc: 'Melt: Dissolving everyday fatigue [디자인가이드] rounded typography' }
          ],
          english: [
            { name: 'Zest', desc: 'Zest: Refreshing, clean aesthetic [디자인가이드] modern serif' },
            { name: 'Lush', desc: 'Lush: Deep, rich background textures [디자인가이드] organic badge' },
            { name: 'Melt', desc: 'Melt: Dissolving everyday fatigue [디자인가이드] rounded typography' }
          ]
        }
      ]
    } else {
      // KR / default
      return [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: '한국적 정서의 아름다운 2~3글자 한글 브랜드 네이밍',
          korean: [
            { name: '늘봄', desc: '언제나 따뜻한 봄날 같은 감성 [디자인가이드] 미니멀형 텍스트' },
            { name: '여울', desc: '잔잔히 스며드는 여울목 소리 [디자인가이드] 워드마크형 로고' },
            { name: '가락', desc: '한국 고유의 운치 있는 음악 선율 [디자인가이드] 모노그램 심볼' }
          ],
          english: [
            { name: 'Neulbom', desc: 'Warm spring emotions [디자인가이드] cozy colors' },
            { name: 'Yeoul', desc: 'Gentle, flowing stream sound [디자인가이드] fluid logo mark' },
            { name: 'Garak', desc: 'Elegant traditional Korean melody [디자인가이드] serif typography' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: '글로벌 확장이 용이한 3~6자 영어 브랜드 작명',
          korean: [
            { name: 'Beat', desc: 'Beat: 리듬감 중심의 직관적 네이밍 [디자인가이드] 원형 로고' },
            { name: 'Calm', desc: 'Calm: 명상적이고 차분한 무드 [디자인가이드] 파스텔톤 플랫 배경' },
            { name: 'Tune', desc: 'Tune: 조화롭게 조율된 공간 BGM [디자인가이드] 이니셜 워드마크' }
          ],
          english: [
            { name: 'Beat', desc: 'Beat: Rhythm-focused intuitive name [디자인가이드] circular logo' },
            { name: 'Calm', desc: 'Calm: Meditative and peaceful mood [디자인가이드] pastel background' },
            { name: 'Tune', desc: 'Tune: Harmoniously adjusted space BGM [디자인가이드] initial wordmark' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: '한글과 영어의 음절을 콤팩트하게 교차한 트렌디한 네이밍',
          korean: [
            { name: '쉼Fi', desc: '휴식(쉼)과 로파이(Lofi) 리듬의 트렌디한 조합 [디자인가이드] 2줄 구성' },
            { name: '봄Wave', desc: '따뜻한 봄 감성과 파동 사운드 [디자인가이드] 폰트 크기 조절' },
            { name: '온Beat', desc: '온전한 소리와 리듬이 채워지는 공간 [디자인가이드] 자간 축소' }
          ],
          english: [
            { name: 'RestFi', desc: 'Trendy combination of Rest and Lofi [디자인가이드] compact text' },
            { name: 'SpringWave', desc: 'Warm spring mood with sound waves [디자인가이드] font size contrast' },
            { name: 'OnBeat', desc: 'Full sound and rhythm filling the space [디자인가이드] tight letter spacing' }
          ]
        }
      ]
    }
  } else if (namingLength === 'type-2') {
    // Compound (한글 4~5자, 영문 7~12자)
    if (region === 'JP') {
      return [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: '和風・伝統의 감성을 직관적이고 현대적으로 합성한 4~5자 브랜드 네이밍',
          korean: [
            { name: `和風の${name}`, desc: '전통적인 미와 현대적 비트의 조합 [디자인가이드] 모노그램' },
            { name: '和風リズム', desc: '정교하고 리드미컬한 일본 고유의 선율 [디자인가이드] 워드마크' },
            { name: '古民家風音', desc: '전통 가옥의 처마 밑 빗소리 같은 감성 [디자인가이드] 다락방 아바타' }
          ],
          english: [
            { name: `Neo${name}`, desc: 'Japanese traditional roots modernized [디자인가이드] clean outline' },
            { name: 'WafuGroove', desc: 'Japanese ancient groove styled modernly [디자인가이드] bold badge' },
            { name: 'KominkaBeats', desc: 'Lofi beats for traditional tea house vibe [디자인가이드] warm colors' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: '글로벌 확장이 용이한 7~12자 영문 브랜드 합성 작명',
          korean: [
            { name: 'MoonlightWa', desc: '달빛 아래 전통 선율 [디자인가이드] 정중앙 대형 타이포' },
            { name: 'MidnightTea', desc: '깊은 밤 따뜻한 차와 함께하는 차분함 [디자인가이드] 찻잔 아이콘' },
            { name: 'KyotoGarden', desc: '교토 정원의 평온함 [디자인가이드] 미니멀 배경 레이아웃' }
          ],
          english: [
            { name: 'MoonlightWa', desc: 'Traditional Wa melody under the moon [디자인가이드] bold headline' },
            { name: 'MidnightTea', desc: 'Warm green tea lofi relaxation [디자인가이드] cup icon emblem' },
            { name: 'KyotoGarden', desc: 'Scenic calm walk down Kyoto path [디자인가이드] empty space focus' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: '가나/한자와 영어의 합성 콤팩트 브랜드',
          korean: [
            { name: '도쿄웨이브', desc: '도쿄 시티의 감성과 아날로그 사운드 [디자인가이드] 네온 레트로' },
            { name: '쇼군프로젝', desc: '웅장하고 격조 높은 문화 콘텐츠 프로젝트 [디자인가이드] 묵직한 서체' },
            { name: '아우라코어', desc: '동양적 감성이 깃든 글로벌 음향 중심 [디자인가이드] 기하학 로고' }
          ],
          english: [
            { name: 'TokyoWave', desc: 'Modernized eastern sound waves [디자인가이드] retro anime visual' },
            { name: 'ShogunPro', desc: 'Dignified cultural playlist venture [디자인가이드] sharp serif' },
            { name: 'AuraCore', desc: 'Central hub of unique atmospheric vibes [디자인가이드] minimal circle' }
          ]
        }
      ]
    } else if (region === 'EN') {
      return [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: 'English native compound names optimized for clear brand recognition',
          korean: [
            { name: `Fusion${name}`, desc: 'Direct blend of traditional concepts [디자인가이드] fusion badge' },
            { name: 'TradGroove', desc: 'Traditional rhythm with a modern twist [디자인가이드] bold lettering' },
            { name: 'CozyHeritage', desc: 'Warm traditional heritage space [디자인가이드] cozy anime' }
          ],
          english: [
            { name: `Fusion${name}`, desc: 'Direct blend of traditional concepts [디자인가이드] fusion badge' },
            { name: 'TradGroove', desc: 'Traditional rhythm with a modern twist [디자인가이드] bold lettering' },
            { name: 'CozyHeritage', desc: 'Warm traditional heritage space [디자인가이드] cozy anime' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: 'Globally optimized English names matching the selected length',
          korean: [
            { name: 'SoundNest', desc: 'Safe harbor for quiet listeners [디자인가이드] rounded typography' },
            { name: 'DreamFlow', desc: 'Dreamy audio streams for deep focus [디자인가이드] wave vector icon' },
            { name: 'NightLofi', desc: 'Moody lo-fi tunes for night thinkers [디자인가이드] dark ambient colors' }
          ],
          english: [
            { name: 'SoundNest', desc: 'Safe harbor for quiet listeners [디자인가이드] rounded typography' },
            { name: 'DreamFlow', desc: 'Dreamy audio streams for deep focus [디자인가이드] wave vector icon' },
            { name: 'NightLofi', desc: 'Moody lo-fi tunes for night thinkers [디자인가이드] dark ambient colors' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: 'Modifier + keyword dual-word combination (7~12 letters)',
          korean: [
            { name: 'MovieTrip', desc: 'Cinematic journey through sounds [디자인가이드] camera retro badge' },
            { name: 'TechVibe', desc: 'Sleek, futuristic minimal beats [디자인가이드] clean geometry' },
            { name: 'VibeSpace', desc: 'Limitless digital audio lounge [디자인가이드] dark fluid layout' }
          ],
          english: [
            { name: 'MovieTrip', desc: 'Cinematic journey through sounds [디자인가이드] camera retro badge' },
            { name: 'TechVibe', desc: 'Sleek, futuristic minimal beats [디자인가이드] clean geometry' },
            { name: 'VibeSpace', desc: 'Limitless digital audio lounge [디자인가이드] dark fluid layout' }
          ]
        }
      ]
    } else {
      // KR / default
      return [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: '프리셋 고유의 정체성과 현대 리듬을 직관적으로 매칭한 4~5자 한글 작명',
          korean: [
            { name: `${name}비트`, desc: '프리셋 감성과 비트의 직관적 결합 [디자인가이드] 타이포 로고' },
            { name: '풍류비트', desc: '풍류 감성을 현대적인 비트로 재현 [디자인가이드] 수묵화 감성 심볼' },
            { name: '한옥라운지', desc: '고즈넉한 한옥의 평온함을 닮은 라운지 [디자인가이드] 라인 일러스트' }
          ],
          english: [
            { name: `Neo${id}`, desc: 'Modernized traditional sound blueprint [디자인가이드] clean logo' },
            { name: 'PungryuBeat', desc: 'Authentic Korean traditional lofi beats [디자인가이드] vintage emblem' },
            { name: 'HanokLounge', desc: 'Comfortable acoustic space inspired by Hanok [디자인가이드] cozy layout' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: '글로벌 확장이 용이한 7~12자 영어 브랜드 합성 작명',
          korean: [
            { name: '새벽선율', desc: '고요한 새벽하늘을 적시는 선율 [디자인가이드] 음표와 새벽안개' },
            { name: '소리창고', desc: '추억과 아날로그 감성을 아카이빙하는 보관소 [디자인가이드] 창고 심볼' },
            { name: '가을카페', desc: '낙엽 지는 가을날 창가에서 듣는 커피 감성 [디자인가이드] 커피잔 로고' }
          ],
          english: [
            { name: 'SaebyeokLine', desc: 'Poetic melodies for early morning thinkers [디자인가이드] thin text' },
            { name: 'SoundVault', desc: 'Cozy library of warm acoustic memories [디자인가이드] key icon' },
            { name: 'AutumnCafe', desc: 'Serene soundtrack for rainy autumn afternoon [디자인가이드] warm pastel' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: '한글과 영어의 음절을 조화롭게 직조한 합성형 네이밍',
          korean: [
            { name: '지식Tech', desc: '인문학적 깊이와 세련된 과학의 만남 [디자인가이드] 지식 아이콘' },
            { name: '토크Vibe', desc: '따뜻한 대화와 아늑한 라디오 감성 [디자인가이드] 말풍선 로고' },
            { name: '조선Groove', desc: '국악 세션과 글로벌 그루브의 하이브리드 [디자인가이드] 태극 그라데이션' }
          ],
          english: [
            { name: 'JisikTech', desc: 'Deep knowledge meets tech-oriented soundscapes [디자인가이드] modern' },
            { name: 'TalkVibe', desc: 'Warm conversation and radio room atmosphere [디자인가이드] speech bubble' },
            { name: 'JoseonGroove', desc: 'Korean heritage meets global groove beats [디자인가이드] wave design' }
          ]
        }
      ]
    }
  } else {
    // Narrative (한글 6자 이상, 영문 13자 이상)
    if (region === 'JP') {
      return [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: '和風・伝統의 감성을 깊고 고즈넉한 한 문장으로 풀어낸 서사적 네이밍',
          korean: [
            { name: `和風の調べ${name}`, desc: '전통 현악기 선율과 현대 리듬의 낭만적 조화 [디자인가이드] 낙관 스타일 로고' },
            { name: '古民家カフェの雨', desc: '한적한 시골 찻집 처마 밑에서 듣는 차분한 음악 [디자인가이드] 빗줄기 심볼' },
            { name: '京都の古い裏通り', desc: '비 내리는 교토 골목길을 걷는 아날로그 산책 [디자인가이드] 클래식 폰트' }
          ],
          english: [
            { name: `WaMelody${name}`, desc: 'Serene blend of Japanese koto and lofi drums [디자인가이드] stamp style' },
            { name: 'KominkaRainyCafe', desc: 'Cozy rain soundscape with green tea aesthetic [디자인가이드] tea room logo' },
            { name: 'KyotoRainyAlley', desc: 'Slow analog walk down traditional stone paths [디자인가이드] retro photo background' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: '스토리텔링과 문장의 여운을 극대화한 영문 서사형 브랜드',
          korean: [
            { name: '深夜の東京コーヒー', desc: '도쿄 밤거리의 네온사인 아래 고독한 커피 한 잔 [디자인가이드] 네온 텍스트' },
            { name: '雨の日の畳の部屋', desc: '다다미 방에 누워 듣는 잔잔한 빗소리 같은 선율 [디자인가이드] 힐링 일러스트' },
            { name: '竹林を吹き抜ける風', desc: '맑고 고요한 대나무 숲의 피리 소리와 잔잔한 비트 [디자인가이드] 미니멀 선' }
          ],
          english: [
            { name: 'TokyoMidnightCoffee', desc: 'Neon lights and retro lofi soundscape for city sleepers [디자인가이드] typography' },
            { name: 'TatamiRoomRainyDay', desc: 'Tatami floor afternoon relaxation soundtrack [디자인가이드] warm illustration' },
            { name: 'BambooForestWhisper', desc: 'Calming wind passing through green bamboo branches [디자인가이드] leaf badge' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: '현지 언어와 영어 구문을 자연스럽게 이은 문장형 하이브리드 네이밍',
          korean: [
            { name: 'お化け屋敷音楽倶楽부', desc: '변환자유롭고 신비로운 감성을 모으는 음악 살롱 [디자인가이드] 도깨비 불 아이콘' },
            { name: '義賊のオーディオ日記', desc: '경계를 넘나드는 퓨전 음악 탐험대의 다이어리 [디자인가이드] 일기장 심볼' },
            { name: 'アウラコアミュージック', desc: '아늑하고 고품격 감성이 모이는 차세대 오디오 브랜드 [디자인가이드] 고급 엠블럼' }
          ],
          english: [
            { name: 'ObakeMusicSociety', desc: 'Mysterious, boundary-pushing audio lab [디자인가이드] ghost symbol' },
            { name: 'GizuAudioChronicles', desc: 'Unveiling unique traditional-fusion records [디자인가이드] book badge' },
            { name: 'AuraCoreSoundLabel', desc: 'High-quality ambient and lofi sound collective [디자인가이드] geometry design' }
          ]
        }
      ]
    } else if (region === 'EN') {
      return [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: 'English native narrative branding capturing deep storytelling themes',
          korean: [
            { name: 'Under the Starry Night', desc: 'Calm ambient tracks under clear night skies [디자인가이드] constellation symbol' },
            { name: 'Whispering Willow Leaves', desc: 'Gentle wind soundscapes with acoustic guitar [디자인가이드] organic foliage badge' },
            { name: 'Echoes of the Old Dynasty', desc: 'Grand traditional instruments blended with slow lofi [디자인가이드] classic shield logo' }
          ],
          english: [
            { name: 'Under the Starry Night', desc: 'Calm ambient tracks under clear night skies [디자인가이드] constellation symbol' },
            { name: 'Whispering Willow Leaves', desc: 'Gentle wind soundscapes with acoustic guitar [디자인가이드] organic foliage badge' },
            { name: 'Echoes of the Old Dynasty', desc: 'Grand traditional instruments blended with slow lofi [디자인가이드] classic shield logo' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: 'Descriptive narrative names evoking calm, focused mental states',
          korean: [
            { name: 'Midnight Scholar Club', desc: 'Lofi playlist for late-night book readers [디자인가이드] spectacles & book logo' },
            { name: 'Late Night Coffee Beans', desc: 'Warm coffee brewing in a quiet city corner [디자인가이드] cozy steam badge' },
            { name: 'Sound of Soft Raindrops', desc: 'Delicate rain rhythm calming your anxious thoughts [디자인가이드] umbrella illustration' }
          ],
          english: [
            { name: 'Midnight Scholar Club', desc: 'Lofi playlist for late-night book readers [디자인가이드] spectacles & book logo' },
            { name: 'Late Night Coffee Beans', desc: 'Warm coffee brewing in a quiet city corner [디자인가이드] cozy steam badge' },
            { name: 'Sound of Soft Raindrops', desc: 'Delicate rain rhythm calming your anxious thoughts [디자인가이드] umbrella illustration' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: 'Multi-word modifier + keyword combinations with modern startup styling',
          korean: [
            { name: 'Daily Science Laboratory', desc: 'Deep concentration sounds mimicking laboratory hum [디자인가이드] sleek tube emblem' },
            { name: 'Alpha Tech Audio Studio', desc: 'Highly polished minimal beats for developer productivity [디자인가이드] modern code font' },
            { name: 'Velvet Lofi Music Lounge', desc: 'Smooth, luxury lofi playlist for high-end boutique hotels [디자인가이드] golden stamp' }
          ],
          english: [
            { name: 'Daily Science Laboratory', desc: 'Deep concentration sounds mimicking laboratory hum [디자인가이드] sleek tube emblem' },
            { name: 'Alpha Tech Audio Studio', desc: 'Highly polished minimal beats for developer productivity [디자인가이드] modern code font' },
            { name: 'Velvet Lofi Music Lounge', desc: 'Smooth, luxury lofi playlist for high-end boutique hotels [디자인가이드] golden stamp' }
          ]
        }
      ]
    } else {
      // KR / default
      return [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: '한국적 낭만과 서사적 분위기를 한 문장으로 담아낸 브랜드 네이밍',
          korean: [
            { name: '비오는날의한옥라운지', desc: '비 오는 날 한옥 대청마루에 앉아 느끼는 평온함 [디자인가이드] 빗방울과 기와 심볼' },
            { name: '구름속의은은한가락', desc: '구름이 낮게 깔린 산사에서 울려 퍼지는 맑은 풍경 소리 [디자인가이드] 풍경 흔들림 심볼' },
            { name: '조선그루브음악창고', desc: '한국 전통 국악 가락을 힙한 힙합 리듬과 합친 소리창고 [디자인가이드] 전통 상자 로고' }
          ],
          english: [
            { name: 'RainyDayHanokLounge', desc: 'Cozy traditional Hanok stay on a rainy afternoon [디자인가이드] tiled roof line-art' },
            { name: 'MysticalCloudMelody', desc: 'Serene and deep instrumental tracks floating in clouds [디자인가이드] clouds & note logo' },
            { name: 'JoseonGrooveArchive', desc: 'Archiving high-energy fusion traditional beats [디자인가이드] dynamic waves badge' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: '글로벌 확장에 알맞은 아름다운 한 문장의 영어 네이밍',
          korean: [
            { name: '달빛아래우리둘만의쉼', desc: '은은한 달빛 아래 지친 마음을 위로받는 오붓한 공간 [디자인가이드] 초승달과 두 인물' },
            { name: '취화선이머무는정원', desc: '동양의 선율과 차 한 잔에 마음을 빼앗기는 낭만적 화원의 소리 [디자인가이드] 붓터치 원' },
            { name: '심야서당의로파이공부방', desc: '조용한 서당 책방에서 은은하게 울리는 집중력 향상용 비트 [디자인가이드] 미니멀 촛불' }
          ],
          english: [
            { name: 'MoonlightSerenadeForUs', desc: 'Empathetic late-night lofi soundtrack for quiet rooms [디자인가이드] crescent moon' },
            { name: 'TheDrunkenArtistGarden', desc: 'Traditional zither tones mixed with warm aesthetic beats [디자인가이드] ink-wash circle' },
            { name: 'LateNightSeodangLofi', desc: 'Deep focus study lofi capturing Joseon scholar workspace [디자인가이드] candle emblem' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: '영문 단어와 현지 고유 명사를 결합한 장편 스토리텔링 브랜드',
          korean: [
            { name: '암행어사오리지널사운드', desc: '마패를 들이밀듯 리스너의 마음에 소유권을 낙인하는 오리지널 레이블 [디자인가이드] 마패 심볼' },
            { name: '도깨비하우스플레이리스트', desc: '상상하는 모든 장르를 매일 새롭게 뚝딱 빚어내는 신비한 선곡집 [디자인가이드] 도깨비 방망이' },
            { name: '홍길동의사운드프로젝트', desc: '규범을 벗어나 동서양의 모든 소리를 자유자재로 믹싱하는 크리에이티브팀 [디자인가이드] 번개 로고' }
          ],
          english: [
            { name: 'SecretAgentAudioLabels', desc: 'High-impact original audio blueprint with absolute authority [디자인가이드] inspect seal' },
            { name: 'DokkaebiHousePlaylists', desc: 'Mystical playground generating daily audio variations [디자인가이드] magic mallet' },
            { name: 'HongGildongAudioVenture', desc: 'Uncharted territory mixing diverse cultural instrumentals [디자인가이드] dynamic wings logo' }
          ]
        }
      ]
    }
  }
}

function AutopilotContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // 상태 관리
  const [channel, setChannel] = useState<YoutubeChannel | null>(null)
  const [allChannels, setAllChannels] = useState<YoutubeChannel[]>([])
  const [channelUrlInput, setChannelUrlInput] = useState('')
  const [resolvedChannel, setResolvedChannel] = useState<{ channelId: string, title: string, thumbnail: string, handle?: string | null } | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')
  const [showAddChannelForm, setShowAddChannelForm] = useState(false)
  const [automation, setAutomation] = useState<AutomationSettings | null>(null)
  const [logs, setLogs] = useState<AutomationLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // AI 브랜딩 상태
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const [isBrandingLoading, setIsBrandingLoading] = useState(false)
  const [brandingResult, setBrandingResult] = useState<{
    channelConcept: string
    names: { style: string; candidates?: any[]; korean?: { name: string; desc: string }[]; english?: { name: string; desc: string }[]; desc: string }[]
    handles: string[]
    aboutText: string
    channelTags: string
    brandColors: string
    logoPrompt: string
    bannerPrompt: string
    watermarkPrompt: string
    thumbnailPrompt: string
    thumbnailTypography: string
    videoTitleTemplate: string
    videoDescriptionTemplate: string
    videoTags: string
    pinnedComment: string
  } | null>(null)

  const [customPresets, setCustomPresets] = useState<any[]>([])
  const [dbPresets, setDbPresets] = useState<any[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('melodio_custom_presets')
    if (saved) {
      try {
        setCustomPresets(JSON.parse(saved))
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  useEffect(() => {
    async function loadDbPresets() {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data, error } = await supabase
          .from('curation_playbooks')
          .select('*')
          .in('category', ['genre', 'curation'])
          .order('updated_at', { ascending: false })
        if (data) {
          const formatted = data.map((pb: any) => ({
            id: pb.key_name,
            emoji: pb.metadata?.emoji || '🎵',
            name: pb.title,
            desc: pb.metadata?.description || pb.content.split('\n')[0] || pb.title,
            gradient: pb.metadata?.gradient || 'linear-gradient(135deg, #10b981, #059669)',
            selections: {},
            customPrompt: pb.metadata?.suno_tags || pb.metadata?.moods || 'lofi, relaxing, chill',
            isDb: true,
            // Extract visual prompts from Obsidian metadata
            logoPrompt: pb.metadata?.logo_prompt || '',
            bannerPrompt: pb.metadata?.banner_prompt || '',
            thumbnailPrompt: pb.metadata?.thumbnail_prompt || '',
          }))
          setDbPresets(formatted)
        }
      } catch (err) {
        console.error('Error loading DB playbooks as presets:', err)
      }
    }
    loadDbPresets()
  }, [])

  // 세팅 폼 상태
  const [targetRegion, setTargetRegion] = useState<'KR' | 'JP' | 'EN'>('KR')
  const [variationStrength, setVariationStrength] = useState<'low' | 'medium' | 'high'>('medium')
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [uploadTime, setUploadTime] = useState('21:00')
  const [longformActive, setLongformActive] = useState(true)
  const [shortsActive, setShortsActive] = useState(false)
  const [monetizationLink, setMonetizationLink] = useState('')
  const [monetizationLinks, setMonetizationLinks] = useState<string[]>([])

  // 브랜드 커스텀 취향 상태
  const [namingStyle, setNamingStyle] = useState<'type-a' | 'type-b' | 'type-c'>('type-a')
  const [visualStyle, setVisualStyle] = useState<'retro-anime' | 'cozy-diorama' | 'pixel-art' | 'cinematic-real' | 'minimal-abstract' | 'image-to-image'>('retro-anime')
  const [customVibe, setCustomVibe] = useState('')
  const [namingLength, setNamingLength] = useState<'type-1' | 'type-2' | 'type-3'>('type-1')
  const [brandKeywords, setBrandKeywords] = useState('')
  const [checkedHandles, setCheckedHandles] = useState<Record<string, 'idle' | 'loading' | 'available' | 'taken' | 'error'>>({})
  const [customHandleToCheck, setCustomHandleToCheck] = useState('')

  // 프리셋 검색/페이지네이션/필터
  const [presetSearch, setPresetSearch] = useState('')
  const [presetPage, setPresetPage] = useState(1)
  const [presetFilter, setPresetFilter] = useState<'all' | 'custom' | 'default'>('all')
  const presetsPerPage = 10

  // 글로벌 메인 탭 상태 ('builder': 채널 자동화 빌더, 'thumbnail': 상시 썸네일 메이커, 'logs': 최근 가동 로그, 'channels': 유튜브 연동 관리)
  const [activeMainTab, setActiveMainTab] = useState<'builder' | 'thumbnail' | 'logs' | 'channels'>('builder')

  // 채널 자동화 빌더 단계별 프로세스 스텝 (1 ~ 6)
  const [currentWizardStep, setCurrentWizardStep] = useState<number>(1)
  const [isChannelSkipped, setIsChannelSkipped] = useState<boolean>(false)
  const [isEditingSettings, setIsEditingSettings] = useState<boolean>(false)

  // AI 브랜딩 단계별 프로세스 스텝 (1 ~ 4)
  const [brandingStep, setBrandingStep] = useState<number>(1)

  // AI 비주얼 크리에이터 브랜드 서브 탭 상태 ('banner': 배너, 'profile': 프로필)
  const [activeBrandSubTab, setActiveBrandSubTab] = useState<'banner' | 'profile'>('banner')

  // Banner States
  const [bannerPrompt, setBannerPrompt] = useState('')
  const [bannerFormat, setBannerFormat] = useState('image-title')
  const [bannerStyle, setBannerStyle] = useState('illustration')
  const [bannerRefImages, setBannerRefImages] = useState<string[]>([])
  const [bannerUrls, setBannerUrls] = useState<string[]>([])
  const [bannerBlended, setBannerBlended] = useState('')
  const [isGeneratingBanner, setIsGeneratingBanner] = useState(false)
  const [isBannerCopied, setIsBannerCopied] = useState(false)

  // Profile States
  const [profilePrompt, setProfilePrompt] = useState('')
  const [profileFormat, setProfileFormat] = useState('logo-symbol')
  const [profileStyle, setProfileStyle] = useState('minimal-simple')
  const [profileRefImages, setProfileRefImages] = useState<string[]>([])
  const [profileUrls, setProfileUrls] = useState<string[]>([])
  const [profileBlended, setProfileBlended] = useState('')
  const [isGeneratingProfile, setIsGeneratingProfile] = useState(false)
  const [isProfileCopied, setIsProfileCopied] = useState(false)

  // Thumbnail States
  const [thumbnailPresetId, setThumbnailPresetId] = useState('')
  const [thumbnailPrompt, setThumbnailPrompt] = useState('')
  const [thumbnailFormat, setThumbnailFormat] = useState('title-text')
  const [thumbnailStyle, setThumbnailStyle] = useState('aesthetic-photo')
  const [thumbnailRefImages, setThumbnailRefImages] = useState<string[]>([])
  const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([])
  const [thumbnailBlended, setThumbnailBlended] = useState('')
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false)
  const [isThumbnailCopied, setIsThumbnailCopied] = useState(false)

  const [activeZoomImage, setActiveZoomImage] = useState<string | null>(null)

  // AI 브랜딩 채널명 선택 상태 (10선택 1)
  const [selectedChannelName, setSelectedChannelName] = useState<string>('')
  const [customChannelName, setCustomChannelName] = useState<string>('')
  const [isCustomNameSelected, setIsCustomNameSelected] = useState<boolean>(false)

  useEffect(() => {
    if (channel?.channel_title && !selectedChannelName) {
      setCustomChannelName(channel.channel_title)
      setSelectedChannelName(channel.channel_title)
      setIsCustomNameSelected(true)
    }
  }, [channel, selectedChannelName])

  const recommendedNames = useMemo(() => {
    if (!brandingResult?.names) return []
    const list: string[] = []
    brandingResult.names.forEach((item) => {
      if (item.korean && Array.isArray(item.korean)) {
        item.korean.forEach((c) => {
          const name = typeof c === 'string' ? c : c.name
          if (name) list.push(name)
        })
      }
      if (item.english && Array.isArray(item.english)) {
        item.english.forEach((c) => {
          const name = typeof c === 'string' ? c : c.name
          if (name) list.push(name)
        })
      }
      if (item.candidates && Array.isArray(item.candidates)) {
        item.candidates.forEach((name) => {
          if (name) list.push(name)
        })
      }
    })
    return list
  }, [brandingResult])

  const isChannelNameSelectedValid = useMemo(() => {
    if (!selectedChannelName) return false
    if (isCustomNameSelected) {
      return !!customChannelName.trim()
    }
    return recommendedNames.includes(selectedChannelName)
  }, [selectedChannelName, isCustomNameSelected, customChannelName, recommendedNames])

  const handleFileChangeForType = async (type: 'banner' | 'profile' | 'thumbnail', e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    
    let currentRefs: string[] = []
    let setRefs: React.Dispatch<React.SetStateAction<string[]>>
    let setPrompt: React.Dispatch<React.SetStateAction<string>>
    
    if (type === 'banner') {
      currentRefs = bannerRefImages
      setRefs = setBannerRefImages
      setPrompt = setBannerPrompt
    } else if (type === 'profile') {
      currentRefs = profileRefImages
      setRefs = setProfileRefImages
      setPrompt = setProfilePrompt
    } else {
      currentRefs = thumbnailRefImages
      setRefs = setThumbnailRefImages
      setPrompt = setThumbnailPrompt
    }

    const fileList = Array.from(files).slice(0, 3 - currentRefs.length)
    if (fileList.length === 0) return
    
    const originalPrompt = type === 'banner' ? bannerPrompt : (type === 'profile' ? profilePrompt : thumbnailPrompt)
    setPrompt('레퍼런스 이미지 분석 중... 🎨')
    
    const loadedImages: string[] = []
    let processedCount = 0

    fileList.forEach(file => {
      const reader = new FileReader()
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const base64Str = reader.result
          loadedImages.push(base64Str)
          setRefs(prev => [...prev, base64Str])
        }
        processedCount++
        
        if (processedCount === fileList.length) {
          try {
            const res = await fetch('/api/autopilot/analyze-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                images: [...currentRefs, ...loadedImages],
                channelTitle: selectedChannelName || channel?.channel_title || brandingResult?.names?.[0]?.candidates?.[0]?.name || brandingResult?.names?.[0]?.korean?.[0]?.name || '',
                logoConcept: brandingResult?.logoPrompt || 'clean circular logo symbol'
              })
            })
            if (res.ok) {
              const data = await res.json()
              if (data.prompt) {
                setPrompt(data.prompt)
              }
            } else {
              setPrompt(originalPrompt)
              alert('이미지 분석 실패: OpenAI API 연결 상태 또는 크레딧 할당량을 확인해 주십시오.')
            }
          } catch (err) {
            console.error(err)
            setPrompt(originalPrompt)
          }
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleRemoveReferenceImageForType = async (type: 'banner' | 'profile' | 'thumbnail', idx: number) => {
    let currentRefs: string[] = []
    let setRefs: React.Dispatch<React.SetStateAction<string[]>>
    let setPrompt: React.Dispatch<React.SetStateAction<string>>
    
    if (type === 'banner') {
      currentRefs = bannerRefImages
      setRefs = setBannerRefImages
      setPrompt = setBannerPrompt
    } else if (type === 'profile') {
      currentRefs = profileRefImages
      setRefs = setProfileRefImages
      setPrompt = setProfilePrompt
    } else {
      currentRefs = thumbnailRefImages
      setRefs = setThumbnailRefImages
      setPrompt = setThumbnailPrompt
    }

    const updatedImages = currentRefs.filter((_, i) => i !== idx)
    setRefs(updatedImages)
    
    if (updatedImages.length === 0) {
      setPrompt('')
      return
    }

    const originalPrompt = type === 'banner' ? bannerPrompt : (type === 'profile' ? profilePrompt : thumbnailPrompt)
    setPrompt('레퍼런스 이미지 분석 중... 🎨')
    try {
      const res = await fetch('/api/autopilot/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          images: updatedImages,
          channelTitle: selectedChannelName || channel?.channel_title || brandingResult?.names?.[0]?.candidates?.[0]?.name || brandingResult?.names?.[0]?.korean?.[0]?.name || '',
          logoConcept: brandingResult?.logoPrompt || 'clean circular logo symbol'
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.prompt) {
          setPrompt(data.prompt)
        }
      } else {
        setPrompt(originalPrompt)
      }
    } catch (err) {
      console.error(err)
      setPrompt(originalPrompt)
    }
  }

  const downloadImage = async (url: string, filename: string) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (e) {
      window.open(url, '_blank')
    }
  }

  const handleDownloadAll = async (type: 'banner' | 'profile' | 'thumbnail') => {
    let urls: string[] = []
    if (type === 'banner') urls = bannerUrls
    else if (type === 'profile') urls = profileUrls
    else urls = thumbnailUrls

    urls.forEach((url, i) => {
      downloadImage(url, `melodio_generated_${type}_${i + 1}.png`)
    })
  }

  const handleCopyPrompt = async (type: 'banner' | 'profile' | 'thumbnail') => {
    let blended = ''
    let setCopied: React.Dispatch<React.SetStateAction<boolean>>

    if (type === 'banner') {
      blended = bannerBlended
      setCopied = setIsBannerCopied
    } else if (type === 'profile') {
      blended = profileBlended
      setCopied = setIsProfileCopied
    } else {
      blended = thumbnailBlended
      setCopied = setIsThumbnailCopied
    }

    try {
      await navigator.clipboard.writeText(blended)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error(e)
    }
  }

  const handleGenerateImageForType = async (type: 'banner' | 'profile' | 'thumbnail') => {
    let rawPrompt = ''
    let setGenerating: React.Dispatch<React.SetStateAction<boolean>>
    let setUrls: React.Dispatch<React.SetStateAction<string[]>>
    let setBlended: React.Dispatch<React.SetStateAction<string>>
    let formatVal = ''
    let styleVal = ''

    if (type === 'banner') {
      rawPrompt = bannerPrompt
      setGenerating = setIsGeneratingBanner
      setUrls = setBannerUrls
      setBlended = setBannerBlended
      formatVal = bannerFormat
      styleVal = bannerStyle
    } else if (type === 'profile') {
      rawPrompt = profilePrompt
      setGenerating = setIsGeneratingProfile
      setUrls = setProfileUrls
      setBlended = setProfileBlended
      formatVal = profileFormat
      styleVal = profileStyle
    } else {
      rawPrompt = thumbnailPrompt
      setGenerating = setIsGeneratingThumbnail
      setUrls = setThumbnailUrls
      setBlended = setThumbnailBlended
      formatVal = thumbnailFormat
      styleVal = thumbnailStyle
    }

    if (!rawPrompt.trim()) {
      alert('프롬프트를 입력해 주세요.')
      return
    }

    if (rawPrompt.includes('레퍼런스 이미지 분석 중')) {
      alert('참조 이미지 분석이 완료될 때까지 기다리거나, 분석 실패 시 참조 이미지를 삭제한 후 직접 프롬프트를 기재해 주십시오.')
      return
    }

    setGenerating(true)
    setUrls([])
    setBlended('')

    let formatDesc = ''
    let styleDesc = ''

    // Only apply hardcoded format/style dropdowns if there are no reference images analyzed
    const hasRefImages = type === 'banner' ? bannerRefImages.length > 0 : (type === 'profile' ? profileRefImages.length > 0 : thumbnailRefImages.length > 0)
    const isReferenceAnalyzed = rawPrompt.includes('레퍼런스 이미지 분석 중') || rawPrompt.includes('분석') || hasRefImages

    if (!isReferenceAnalyzed) {
      if (type === 'banner') {
        formatDesc = BANNER_FORMATS.find(f => f.value === formatVal)?.prompt || ''
        styleDesc = BANNER_STYLES.find(s => s.value === styleVal)?.prompt || ''
      } else if (type === 'profile') {
        formatDesc = PROFILE_FORMATS.find(f => f.value === formatVal)?.prompt || ''
        styleDesc = PROFILE_STYLES.find(s => s.value === styleVal)?.prompt || ''
      } else {
        formatDesc = THUMBNAIL_FORMATS.find(f => f.value === formatVal)?.prompt || ''
        styleDesc = THUMBNAIL_STYLES.find(s => s.value === styleVal)?.prompt || ''
      }
    }

    const blended = [rawPrompt, formatDesc, styleDesc].filter(Boolean).join(', ')

    try {
      const res = await fetch('/api/autopilot/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: blended,
          size: type === 'profile' ? '1:1' : '16:9',
          imageType: type === 'profile' ? 'logo' : type,
          channelTitle: selectedChannelName || channel?.channel_title || brandingResult?.names?.[0]?.candidates?.[0]?.name || brandingResult?.names?.[0]?.korean?.[0]?.name || ''
        })
      })
      const data = await res.json()
      if (data.success) {
        setUrls(data.imageUrls || [data.imageUrl])
        if (data.blendedPrompt) {
          setBlended(data.blendedPrompt)
        }
      } else {
        alert(`이미지 생성 실패: ${data.error || '알 수 없는 오류'}`)
      }
    } catch (e) {
      console.error(e)
      alert('이미지 생성 도중 오류가 발생했습니다.')
    } finally {
      setGenerating(false)
    }
  }

  const handleSendToCreator = (prompt: string, type: 'logo' | 'banner' | 'thumbnail') => {
    if (!isChannelNameSelectedValid) {
      alert('채널 브랜드명 선택이 완료되지 않았습니다. 1단계 [채널 기획]에서 AI 추천 채널명 중 하나를 선택하거나 직접 채널명을 입력해 주세요.');
      setBrandingStep(1);
      return;
    }

    const finalTitle = selectedChannelName || channel?.channel_title || brandingResult?.names?.[0]?.candidates?.[0]?.name || brandingResult?.names?.[0]?.korean?.[0]?.name || ''
    const processedPrompt = (prompt || '')
      .replace(/\[CHANNEL_NAME\]/g, finalTitle)
      .replace(/\{CHANNEL_NAME\}/g, finalTitle)

    if (type === 'banner') {
      setBannerPrompt(processedPrompt)
      setActiveMainTab('builder')
      setCurrentWizardStep(5)
      setActiveBrandSubTab('banner')
    } else if (type === 'logo') {
      setProfilePrompt(processedPrompt)
      setActiveMainTab('builder')
      setCurrentWizardStep(5)
      setActiveBrandSubTab('profile')
    } else if (type === 'thumbnail') {
      setThumbnailPrompt(processedPrompt)
      setActiveMainTab('thumbnail')
    }
    const creatorEl = document.getElementById('visual-creator')
    if (creatorEl) {
      creatorEl.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // 마운트 시 데이터 로드
  const fetchSettings = async (channelId?: string) => {
    setIsLoading(true)
    try {
      const query = channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''
      const res = await fetch(`/api/autopilot/settings${query}`)
      const data = await res.json()
      if (data.success) {
        setChannel(data.channel)
        setAllChannels(data.allChannels || [])
        setAutomation(data.automation)
        setLogs(data.logs || [])

        if (data.automation) {
          setSelectedPresetId(data.automation.audio_preset_id)
          setThumbnailPresetId(data.automation.audio_preset_id)
          setTargetRegion(data.automation.target_region || 'KR')
          setVariationStrength(data.automation.variation_strength || 'medium')
          setSelectedDays(data.automation.upload_days || [])
          setUploadTime(data.automation.upload_time?.slice(0, 5) || '21:00')
          setLongformActive(data.automation.longform_active)
          setShortsActive(data.automation.shorts_active)
          setMonetizationLinks(data.automation.monetization_links || [])

          if (data.automation.branding_metadata && Object.keys(data.automation.branding_metadata).length > 0) {
            setBrandingResult(data.automation.branding_metadata)
            if (data.automation.branding_metadata.selectedChannelName) {
              setSelectedChannelName(data.automation.branding_metadata.selectedChannelName)
            }
            if (data.automation.branding_metadata.bannerUrls) {
              setBannerUrls(data.automation.branding_metadata.bannerUrls)
            }
            if (data.automation.branding_metadata.profileUrls) {
              setProfileUrls(data.automation.branding_metadata.profileUrls)
            }
          }
        } else {
          try {
            const draftStep = localStorage.getItem('autopilot_draft_step')
            const draftPresetId = localStorage.getItem('autopilot_draft_preset_id')
            const draftBrandingResult = localStorage.getItem('autopilot_draft_branding_result')
            const draftChannelName = localStorage.getItem('autopilot_draft_channel_name')
            const draftBannerUrls = localStorage.getItem('autopilot_draft_banner_urls')
            const draftProfileUrls = localStorage.getItem('autopilot_draft_profile_urls')
            const draftRegion = localStorage.getItem('autopilot_draft_region')
            const draftVariation = localStorage.getItem('autopilot_draft_variation')
            const draftDays = localStorage.getItem('autopilot_draft_days')
            const draftTime = localStorage.getItem('autopilot_draft_time')

            if (draftStep) setCurrentWizardStep(parseInt(draftStep, 10))
            if (draftPresetId) setSelectedPresetId(draftPresetId)
            if (draftBrandingResult) setBrandingResult(JSON.parse(draftBrandingResult))
            if (draftChannelName) setSelectedChannelName(draftChannelName)
            if (draftBannerUrls) setBannerUrls(JSON.parse(draftBannerUrls))
            if (draftProfileUrls) setProfileUrls(JSON.parse(draftProfileUrls))
            if (draftRegion) setTargetRegion(draftRegion as any)
            if (draftVariation) setVariationStrength(draftVariation as any)
            if (draftDays) setSelectedDays(JSON.parse(draftDays))
            if (draftTime) setUploadTime(draftTime)
          } catch (err) {
            console.error('Failed to load draft settings from localStorage', err)
          }
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
    
    // URL 파라미터 처리 (성공/실패 토스트 대신 간단한 얼럿 얼라인)
    const success = searchParams.get('success')
    const errorMsg = searchParams.get('error')
    const tabParam = searchParams.get('tab')

    if (tabParam === 'channels') {
      setActiveMainTab('channels')
    } else if (tabParam === 'logs') {
      setActiveMainTab('logs')
    } else if (tabParam === 'thumbnail') {
      setActiveMainTab('thumbnail')
    }

    if (success) {
      alert('유튜브 채널 연동에 성공하였습니다!')
      router.replace('/autopilot')
    } else if (errorMsg) {
      alert(`연동 실패: ${errorMsg}`)
      router.replace('/autopilot')
    }
  }, [searchParams])

  // Active channel preset change hook to pre-populate prompts dynamically
  useEffect(() => {
    if (!selectedPresetId) return
    const allPrs = [...customPresets, ...dbPresets, ...presets]
    const activePr = allPrs.find(p => p.id === selectedPresetId)
    if (activePr) {


      if (!bannerPrompt && activePr.bannerPrompt) setBannerPrompt(activePr.bannerPrompt)
      if (!profilePrompt && activePr.logoPrompt) setProfilePrompt(activePr.logoPrompt)
      if (!thumbnailPrompt && activePr.thumbnailPrompt) setThumbnailPrompt(activePr.thumbnailPrompt)
    }
  }, [selectedPresetId, dbPresets, customPresets])

  // 썸네일 전용 프리셋 선택 감지 및 로드 (프롬프트 & 고정 스타일 레퍼런스 이미지 자동 리콜)
  useEffect(() => {
    if (!thumbnailPresetId) return
    const allPrs = [...customPresets, ...dbPresets, ...presets]
    const found = allPrs.find(p => p.id === thumbnailPresetId)
    if (found) {
      setThumbnailPrompt(found.thumbnailPrompt || '')
      // 고정된 스타일 참조 이미지 자동 리콜
      const savedRefs = localStorage.getItem(`melodio_preset_style_refs_${thumbnailPresetId}`)
      if (savedRefs) {
        try {
          setThumbnailRefImages(JSON.parse(savedRefs))
        } catch (e) {
          console.error('Failed to load pinned reference images:', e)
        }
      } else {
        setThumbnailRefImages([])
      }
    }
  }, [thumbnailPresetId, dbPresets, customPresets])

  // Save draft progress to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!automation || isEditingSettings) {
      try {
        localStorage.setItem('autopilot_draft_step', currentWizardStep.toString())
        localStorage.setItem('autopilot_draft_preset_id', selectedPresetId)
        if (brandingResult) {
          localStorage.setItem('autopilot_draft_branding_result', JSON.stringify(brandingResult))
        } else {
          localStorage.removeItem('autopilot_draft_branding_result')
        }
        localStorage.setItem('autopilot_draft_channel_name', selectedChannelName)
        localStorage.setItem('autopilot_draft_banner_urls', JSON.stringify(bannerUrls))
        localStorage.setItem('autopilot_draft_profile_urls', JSON.stringify(profileUrls))
        localStorage.setItem('autopilot_draft_region', targetRegion)
        localStorage.setItem('autopilot_draft_variation', variationStrength)
        localStorage.setItem('autopilot_draft_days', JSON.stringify(selectedDays))
        localStorage.setItem('autopilot_draft_time', uploadTime)
      } catch (err) {
        console.error('Failed to save draft settings to localStorage', err)
      }
    }
  }, [
    currentWizardStep,
    selectedPresetId,
    brandingResult,
    selectedChannelName,
    bannerUrls,
    profileUrls,
    targetRegion,
    variationStrength,
    selectedDays,
    uploadTime,
    automation,
    isEditingSettings
  ])

  // 스타일 레퍼런스 이미지 고정 함수
  const handlePinAsStyleReference = (imageUrl: string) => {
    if (!thumbnailPresetId) {
      alert('스타일을 고정할 컨셉 프리셋을 먼저 선택해 주십시오.')
      return
    }
    const key = `melodio_preset_style_refs_${thumbnailPresetId}`
    const existing = localStorage.getItem(key)
    let updated: string[] = []
    if (existing) {
      try {
        const parsed = JSON.parse(existing)
        if (parsed.includes(imageUrl)) {
          alert('이미 등록된 레퍼런스 이미지입니다.')
          return
        }
        updated = [...parsed, imageUrl].slice(-3) // 최대 3장 유지
      } catch (e) {
        updated = [imageUrl]
      }
    } else {
      updated = [imageUrl]
    }
    localStorage.setItem(key, JSON.stringify(updated))
    setThumbnailRefImages(updated)
    alert('이 이미지가 현재 프리셋의 스타일 참조 이미지로 고정되었습니다! 앞으로 이 프리셋을 선택하면 자동으로 불러와 일관된 썸네일 화풍을 유지합니다.')
  }


  const fetchBranding = async (presetId: string, region: string, forceRefresh = false) => {
    if (!presetId) return

    const cacheKey = `melodio_branding_cache_v7_${presetId}_${region}_${namingStyle}_${visualStyle}_${namingLength}_${brandKeywords}_${customVibe}`
    
    if (!forceRefresh) {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          setBrandingResult(parsed)
          return
        } catch (e) {
          console.error('브랜딩 캐시 파싱 에러:', e)
        }
      }
    }

    setIsBrandingLoading(true)
    const customPr = customPresets.find(p => p.id === presetId)

    try {
      const res = await fetch('/api/autopilot/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          presetId, 
          targetRegion: region,
          customName: customPr?.name,
          customDesc: customPr?.desc,
          namingStyle,
          namingLength,
          brandKeywords,
          visualStyle,
          customVibe
        })
      })
      const data = await res.json()
      if (data.success) {
        const result = {
          channelConcept: data.channelConcept || '',
          names: data.names || [],
          handles: data.handles || [],
          aboutText: data.aboutText || '',
          channelTags: data.channelTags || '',
          brandColors: data.brandColors || '',
          logoPrompt: data.logoPrompt || '',
          bannerPrompt: data.bannerPrompt || '',
          watermarkPrompt: data.watermarkPrompt || '',
          thumbnailPrompt: data.thumbnailPrompt || '',
          thumbnailTypography: data.thumbnailTypography || '',
          videoTitleTemplate: data.videoTitleTemplate || '',
          videoDescriptionTemplate: data.videoDescriptionTemplate || '',
          videoTags: data.videoTags || '',
          pinnedComment: data.pinnedComment || ''
        }
        setBrandingResult(result)
        localStorage.setItem(cacheKey, JSON.stringify(result))
      } else {
        alert(`AI 기획 재생성에 실패했습니다: ${data.error || 'OpenAI API 한도 초과 또는 302.ai 모델 권한 부족'}`)
      }
    } catch (e) {
      console.error(e)
      alert('AI 기획 생성 통신 중 오류가 발생했습니다.')
    } finally {
      setIsBrandingLoading(false)
    }
  }

  // 캐시에서 브랜딩 정보 로드 시도
  const loadBrandingFromCache = (presetId: string, region: string) => {
    const cacheKey = `melodio_branding_cache_v7_${presetId}_${region}_${namingStyle}_${visualStyle}_${namingLength}_${brandKeywords}_${customVibe}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setBrandingResult(parsed)
        return true
      } catch (e) {
        console.error('브랜딩 캐시 파싱 에러:', e)
      }
    }
    return false
  }

  // 유튜브 핸들 중복 여부 확인 API 호출
  const checkHandleAvailability = async (handle: string) => {
    if (!handle || !handle.trim()) return
    const clean = handle.trim()
    
    setCheckedHandles(prev => ({ ...prev, [clean]: 'loading' }))
    try {
      const res = await fetch(`/api/youtube/check-handle?handle=${encodeURIComponent(clean)}`)
      const data = await res.json()
      if (data.error) {
        alert(data.error)
        setCheckedHandles(prev => ({ ...prev, [clean]: 'error' }))
        return
      }
      if (data.available) {
        setCheckedHandles(prev => ({ ...prev, [clean]: 'available' }))
      } else {
        setCheckedHandles(prev => ({ ...prev, [clean]: 'taken' }))
      }
    } catch (e) {
      console.error(e)
      setCheckedHandles(prev => ({ ...prev, [clean]: 'error' }))
    }
  }
 
  // 기본 프리셋용 0ms 로컬 템플릿 생성 헬퍼
  const generateDefaultBranding = (presetId: string, region: string) => {
    const pr = allPresets.find(p => p.id === presetId)
    if (!pr) return

    // 만약 DB 프리셋(Obsidian 연동)이라면 기획서 데이터 직접 파싱
    if (pr.isDb && pr.customPrompt) {
      const parsedBrands = parsePlaybookBrandingLocal(pr.customPrompt)
      if (parsedBrands.length > 0) {
        const engNames = parsedBrands.map(b => splitNameLocal(b.name).eng)
        const locNames = parsedBrands.map(b => splitNameLocal(b.name).loc)
        const playbookHandles = parsedBrands.map(b => b.handle).filter(Boolean)

        const styleANames = namingLength === 'type-1' ? locNames.map(n => compressNameLocal(n, region)) : locNames
        const styleBNames = namingLength === 'type-1' ? engNames.map(n => compressNameLocal(n, 'EN')) : engNames.map(n => `Midnight ${n}`)
        const styleCNames = namingLength === 'type-1' ? locNames.map(n => compressNameLocal(n, region) + 'Fi') : locNames.map(n => `${n} 프로젝트`)

        const defaultResult = {
          channelConcept: pr.desc,
          names: [
            {
              style: 'Type A (해당 국가 언어 100%)',
              desc: '플레이북의 정체성을 100% 로컬 언어로 매칭제안',
              korean: styleANames.map((name, i) => ({ name, desc: `플레이북 로컬 네이밍 시안 ${i + 1}. [디자인가이드] 모노그램/워드마크 로고 추천.` })),
              english: styleBNames.map((name, i) => ({ name, desc: `Playbook English suggestion ${i + 1}. [디자인가이드] 정중앙 대형 타이포 레이아웃 추천.` }))
            },
            {
              style: 'Type B (영어 100%)',
              desc: '글로벌 범용성을 강조한 100% 영문 매칭제안',
              korean: styleBNames.map((name, i) => ({ name, desc: `영문 글로벌 네이밍 시안 ${i + 1}. [디자인가이드] 텍스트 중심 미니멀형 적용.` })),
              english: styleBNames.map((name, i) => ({ name, desc: `Playbook English suggestion ${i + 1}` }))
            },
            {
              style: 'Type C (국가 언어 + 영어 조합)',
              desc: '언어 간 시너지를 내는 트렌디한 하이브리드 조합',
              korean: styleCNames.map((name, i) => ({ name, desc: `하이브리드 합성 시안 ${i + 1}. [디자인가이드] 자간 축소 및 2줄 구성 추천.` })),
              english: styleCNames.map((name, i) => ({ name, desc: `Scalable conceptual suggestion ${i + 1}` }))
            }
          ],
          handles: playbookHandles.length > 0 ? playbookHandles : [`@${pr.id}_space`, `@cozy_${pr.id}_bgm`],
          aboutText: `Melodio AI가 제작한 편안한 BGM 채널입니다. 컨셉: ${pr.desc}`,
          channelTags: '로파이, BGM, 플레이리스트, 매장음악',
          brandColors: '#0F0F12 (Soft Charcoal), #E2D4C9 (Warm Cream), #5D5D7A (Dusty Slate)',
          logoPrompt: (pr as any).logoPrompt || `Minimalist flat vector logo of ${pr.name}, solid dark background --no photorealistic`,
          bannerPrompt: (pr as any).bannerPrompt || `Widescreen banner art matching ${pr.name} --ar 16:9`,
          watermarkPrompt: `Minimalist play icon watermark with rounded corners, semi-transparent`,
          thumbnailPrompt: (pr as any).thumbnailPrompt || `Scenic background for a playlist thumbnail related to ${pr.name} --ar 16:9`,
          thumbnailTypography: `Title: "일할 때 듣는 차분한 음악" / Sub: "${pr.name} Playlist"`,
          videoTitleTemplate: `[BGM] ${pr.name} ｜ 차분한 음악 플레이리스트 vol.[Num]`,
          videoDescriptionTemplate: `🎧 Tracklist:\n00:00 Track 01\n03:15 Track 02\n06:30 Track 03\n\n[🎁 Affiliate Links]\n[수익화 링크 들어갈 자리]`,
          videoTags: pr.name + ', BGM, 플레이리스트',
          pinnedComment: '오늘 하루도 정말 고생 많으셨습니다. 🥃'
        }
 
        setBrandingResult(defaultResult)
        return
      }
    }

    let namesCandidates = getBrandingNamesFallback(region, namingLength, pr)
    let aboutBio = ''
    let defaultTags = ''
    let comment = ''
 
    if (region === 'JP') {
      aboutBio = `Melodio AI가 제작한心地よいBGMをお届け하는 채널입니다. 컨셉: ${pr.desc}`
      defaultTags = '作業用BGM, 勉強用BGM, Melodio AI'
      comment = '今日も一日お疲れ様でした。🍵'
    } else if (region === 'EN') {
      aboutBio = `Official ${pr.name} channel powered by Melodio AI music generation. Concept: ${pr.desc}`
      defaultTags = 'lofi bgm, study beats, Melodio AI'
      comment = 'Thank you for listening! 🎧'
    } else {
      aboutBio = `Melodio AI의 지능형 음악 생성 기술로 빚어낸 프리미엄 BGM 채널입니다. 컨셉: ${pr.desc}`
      defaultTags = '매장음악, 공부할때듣는음악, 로파이, Melodio AI'
      comment = '오늘 하루도 수고 많으셨습니다. 🥃'
    }
 
    const defaultResult = {
      channelConcept: `[기본 컨셉] ${pr.name} BGM 채널`,
      names: namesCandidates,
      handles: [
        `@${pr.id}_space`,
        `@cozy_${pr.id}_bgm`,
        `@${pr.id}_melodio`
      ],
      aboutText: aboutBio,
      channelTags: defaultTags,
      brandColors: '#0F0F12 (Soft Charcoal), #E2D4C9 (Warm Cream), #5D5D7A (Dusty Slate)',
      logoPrompt: pr.metadata?.logo_prompt || `Minimalist flat vector logo of ${pr.name}, solid dark background, pastel accent color --no photorealistic`,
      bannerPrompt: pr.metadata?.banner_prompt || `Widescreen banner art depicting cozy scenery matching ${pr.name}, clean design, calming colors --ar 16:9`,
      watermarkPrompt: pr.metadata?.watermark_prompt || `Minimalist play icon watermark with rounded corners, semi-transparent`,
      thumbnailPrompt: pr.metadata?.thumbnail_prompt || `Scenic background for a playlist thumbnail related to ${pr.name}, beautiful aesthetic atmosphere --ar 16:9`,
      thumbnailTypography: `Title: "일할 때 듣는 차분한 음악" / Sub: "${pr.name} Playlist"`,
      videoTitleTemplate: `[BGM] ${pr.name} ｜ 차분한 음악 플레이리스트 vol.[Num]`,
      videoDescriptionTemplate: `🎧 Tracklist:\n00:00 Track 01\n03:15 Track 02\n06:30 Track 03\n\n[🎁 Affiliate Links]\n[수익화 링크 들어갈 자리]`,
      videoTags: pr.name + ', BGM, 플레이리스트',
      pinnedComment: comment
    }
    setBrandingResult(defaultResult)
  }

  // selectedPresetId, targetRegion, namingStyle, visualStyle, customVibe가 바뀔 때
  // 캐시에 저장된 결과가 존재한다면 즉시 0ms로 렌더링하고,
  // 캐시가 없다면 API를 자동 호출하지 않고 기획 대기 화면이나 기본 템플릿(기본 프리셋의 경우)을 로드합니다.
  useEffect(() => {
    if (!selectedPresetId) return

    const hasCache = loadBrandingFromCache(selectedPresetId, targetRegion)
    if (!hasCache) {
      const isDefault = presets.some(p => p.id === selectedPresetId)
      const isDb = dbPresets.some(p => p.id === selectedPresetId)
      if (isDefault || isDb) {
        generateDefaultBranding(selectedPresetId, targetRegion)
      } else {
        setBrandingResult(null)
      }
    }
  }, [selectedPresetId, targetRegion, namingStyle, visualStyle, namingLength, brandKeywords, customVibe, dbPresets])

  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId)
    setCustomVibe('')
    setBrandKeywords('')
  }

  // 유튜브 채널 URL/핸들 해석
  const handleResolveChannel = async () => {
    if (!channelUrlInput) return
    setIsResolving(true)
    setResolveError('')
    setResolvedChannel(null)
    try {
      const res = await fetch(`/api/youtube?action=resolve_channel&query=${encodeURIComponent(channelUrlInput)}`)
      const data = await res.json()
      if (data.success && data.channel) {
        setResolvedChannel(data.channel)
      } else {
        setResolveError(data.error || '채널 정보를 조회할 수 없습니다. 주소나 핸들을 확인해 주십시오.')
      }
    } catch (e) {
      console.error(e)
      setResolveError('채널 조회 중 오류가 발생했습니다.')
    } finally {
      setIsResolving(false)
    }
  }

  // 유튜브 OAuth 연동 실행
  const handleConnectYoutube = () => {
    if (resolvedChannel) {
      router.push(`/api/auth/youtube?target_channel_id=${encodeURIComponent(resolvedChannel.channelId)}`)
    } else {
      router.push('/api/auth/youtube')
    }
  }

  // 유튜브 기본설정 즉시 연동 완료 (단축 경로)
  const handleSaveDefaultSettings = async () => {
    if (!channel) {
      alert('먼저 유튜브 채널을 연동해 주십시오.')
      return
    }
    
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/autopilot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: channel.channel_id,
          audioPresetId: 'lofi', // 기본 장르 프리셋
          targetRegion: 'KR',
          variationStrength: 'medium',
          uploadDays: ['MON', 'WED', 'FRI'], // 월/수/금 기본 스케줄
          uploadTime: '21:00:00', // 21:00 기본 시간
          longformActive: true,
          shortsActive: false,
          monetizationLinks: [],
          brandingMetadata: {
            selectedChannelName: channel.channel_title
          }
        })
      })
      const data = await res.json()
      if (data.success) {
        setAutomation(data.automation)
        setShowAddChannelForm(false)
        alert('기본 설정으로 유튜브 자동화가 성공적으로 가동되었습니다!')
        setIsEditingSettings(false)
        fetchSettings()
      } else {
        alert(data.error || '저장에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 유튜브 연동 해제
  const handleDisconnectYoutube = async () => {
    if (!channel) return
    if (!confirm('정말로 유튜브 연동을 해제하시겠습니까? 관련 자율운영 스케줄 설정도 함께 삭제됩니다.')) return
    
    try {
      const res = await fetch('/api/autopilot/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.channel_id })
      })
      const data = await res.json()
      if (data.success) {
        setChannel(null)
        setAutomation(null)
        setBrandingResult(null)
        setSelectedPresetId('')
        setSelectedDays([])
        setLogs([])
        alert('연동이 해제되었습니다.')
        fetchSettings()
      }
    } catch (e) {
      console.error(e)
    }
  }

  // 자동화 스케줄 저장
  const handleSaveSettings = async () => {
    if (!channel) {
      alert('먼저 유튜브 채널을 연동해 주십시오.')
      return
    }
    if (!selectedPresetId) {
      alert('자동화에 가동할 컨셉 프리셋을 선택해 주십시오.')
      return
    }
    if (selectedDays.length === 0) {
      alert('최소 하루 이상의 업로드 요일을 선택해 주십시오.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/autopilot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: channel.channel_id,
          audioPresetId: selectedPresetId,
          targetRegion,
          variationStrength,
          uploadDays: selectedDays,
          uploadTime: `${uploadTime}:00`,
          longformActive,
          shortsActive,
          monetizationLinks,
          brandingMetadata: {
            ...brandingResult,
            selectedChannelName,
            bannerUrls,
            profileUrls
          }
        })
      })
      const data = await res.json()
      if (data.success) {
        setAutomation(data.automation)
        alert('자율주행 자동화 설정이 성공적으로 저장되었습니다!')
        setIsEditingSettings(false)
        fetchSettings()
      } else {
        alert(data.error || '저장에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 클립보드 복사 헬퍼
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    alert(`[${label}] 클립보드에 복사되었습니다!`)
  }

  // 요일 토글
  const toggleDay = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  // 링크 추가
  const addLink = () => {
    if (!monetizationLink.trim()) return
    setMonetizationLinks(prev => [...prev, monetizationLink.trim()])
    setMonetizationLink('')
  }

  const removeLink = (idx: number) => {
    setMonetizationLinks(prev => prev.filter((_, i) => i !== idx))
  }

  const allPresets = [...customPresets, ...dbPresets, ...presets]

  // 검색 및 카테고리 필터링된 프리셋 목록
  const filteredPresets = allPresets.filter(p => {
    // 1. 카테고리 필터링
    if (presetFilter === 'custom') {
      if (!customPresets.some(cp => cp.id === p.id)) return false
    } else if (presetFilter === 'default') {
      if (!presets.some(dp => dp.id === p.id) && !dbPresets.some(db => db.id === p.id)) return false
    }
    
    // 2. 검색어 필터링
    return (
      (p.name || '').toLowerCase().includes(presetSearch.toLowerCase()) ||
      (p.desc || '').toLowerCase().includes(presetSearch.toLowerCase())
    )
  })

  const totalPages = Math.ceil(filteredPresets.length / presetsPerPage)
  const paginatedPresets = filteredPresets.slice(
    (presetPage - 1) * presetsPerPage,
    presetPage * presetsPerPage
  )

  return (
    <div className="space-y-6 text-white w-full font-sans">
      
      {/* ─── 대시보드 헤더 (통일된 표준 브랜드 헤더) ─── */}
      <header className="mb-8 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-bold text-white mb-2">YouTube Auto-Pilot</h1>
        <p className="text-zinc-400">채널의 고유 브랜딩 기획부터 정기 음악/영상 생성 및 유튜브 자동 포스팅까지 올스톱 자율 운영 컨트롤 보드.</p>
      </header>

      {/* ─── 로딩 진행 인디케이터 (상단 미세 진행바) ─── */}
      {isLoading && (
        <div className="w-full h-1 bg-zinc-900 overflow-hidden rounded-full">
          <div className="h-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 rounded-full animate-pulse w-full"></div>
        </div>
      )}

      <div className={`space-y-6 transition-all duration-300 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
        
        {/* ─── 글로벌 메인 탭 네비게이터 ─── */}
        <div className="flex bg-zinc-950/60 p-1.5 rounded-2xl border border-white/10 gap-1.5 max-w-2xl w-full">
          <button
            type="button"
            onClick={() => setActiveMainTab('builder')}
            className={`flex-1 text-xs py-3 rounded-xl font-bold text-center transition-all flex items-center justify-center gap-1.5 ${
              activeMainTab === 'builder'
                ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <Radio className="w-4 h-4" />
            채널 자동화 빌더
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab('thumbnail')}
            className={`flex-1 text-xs py-3 rounded-xl font-bold text-center transition-all flex items-center justify-center gap-1.5 ${
              activeMainTab === 'thumbnail'
                ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            상시 썸네일 메이커
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab('logs')}
            className={`flex-1 text-xs py-3 rounded-xl font-bold text-center transition-all flex items-center justify-center gap-1.5 ${
              activeMainTab === 'logs'
                ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <FileText className="w-4 h-4" />
            최근 가동 로그
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab('channels')}
            className={`flex-1 text-xs py-3 rounded-xl font-bold text-center transition-all flex items-center justify-center gap-1.5 ${
              activeMainTab === 'channels'
                ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <YoutubeIcon className="w-4 h-4 text-red-500" />
            유튜브 연동 관리
          </button>
        </div>

        {activeMainTab === 'builder' && (
          <div className="space-y-6">
            {automation && isEditingSettings && (
              <div className="w-full bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 text-amber-400 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  <span>현재 설정을 변경하는 중입니다. 저장하거나 취소할 수 있습니다.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingSettings(false)
                    fetchSettings()
                  }}
                  className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold rounded-lg text-zinc-300 transition-all"
                >
                  변경 취소
                </button>
              </div>
            )}

            {automation && !isEditingSettings ? (
              <div className="w-full space-y-6 animate-fadeIn">
                {/* 1. 자동화 가동 상태 카드 */}
                <div className="relative overflow-hidden bg-gradient-to-br from-zinc-950/80 to-zinc-900/60 backdrop-blur-2xl border border-emerald-500/20 rounded-3xl p-6 shadow-2xl">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
                  
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <Radio className="w-7 h-7 text-emerald-400 animate-pulse" />
                        </div>
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-zinc-900 rounded-full animate-ping"></span>
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-zinc-900 rounded-full"></span>
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white">유튜브 자율주행 활성화 상태</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                            Active
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">
                          설정된 스케줄 및 브랜드 기획서에 따라 AI가 음악/영상을 주기적으로 자동 업로드하고 있습니다.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsEditingSettings(true)}
                        className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold rounded-xl text-white transition-all flex items-center gap-1.5"
                      >
                        <Settings2 className="w-3.5 h-3.5 text-zinc-400" />
                        설정 및 기획서 수정
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnectYoutube}
                        className="px-4 py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-xs font-bold rounded-xl text-red-400 transition-all flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        연동 해제
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-6 pt-5 border-t border-white/5 text-[11px]">
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-zinc-500 block font-semibold">선택된 프리셋</span>
                      <span className="font-bold text-white text-xs block truncate">
                        {allPresets.find(p => p.id === automation.audio_preset_id)?.emoji || '🎵'}{' '}
                        {allPresets.find(p => p.id === automation.audio_preset_id)?.name || automation.audio_preset_id}
                      </span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-zinc-500 block font-semibold">업로드 요일</span>
                      <span className="font-bold text-indigo-400 text-xs block truncate">
                        {automation.upload_days?.join(', ') || '없음'}
                      </span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-zinc-500 block font-semibold">정기 업로드 시간</span>
                      <span className="font-bold text-yellow-500 text-xs block">
                        {automation.upload_time?.slice(0, 5) || '21:00'}
                      </span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-zinc-500 block font-semibold">타겟 국가</span>
                      <span className="font-bold text-amber-500 text-xs block uppercase">
                        {automation.target_region || 'KR'}
                      </span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-zinc-500 block font-semibold">BGM 롱폼 자동화</span>
                      <span className={`font-bold text-xs block ${automation.longform_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {automation.longform_active ? '활성화 (Active)' : '비활성화'}
                      </span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
                      <span className="text-zinc-500 block font-semibold">쇼츠(Viral/CF) 자동화</span>
                      <span className={`font-bold text-xs block ${automation.shorts_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {automation.shorts_active ? '활성화 (Active)' : '비활성화'}
                      </span>
                    </div>
                  </div>
                </div>

                {brandingResult && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* 왼쪽: 브랜드 기획 메타 */}
                    <div className="lg:col-span-7 bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
                      <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                        <FileText className="w-5 h-5 text-indigo-400" />
                        <h3 className="font-bold text-sm">보관된 브랜드 기획서 (Brand Identity)</h3>
                      </div>
                      
                      <div className="space-y-4">
                        {/* 채널명 */}
                        <div className="space-y-1">
                          <span className="text-[11px] text-zinc-500 font-bold block">확정 채널명</span>
                          <div className="bg-white/5 px-3 py-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-400">{selectedChannelName || '지정되지 않음'}</span>
                            <button
                              onClick={() => handleCopy(selectedChannelName, '채널명')}
                              className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1"
                            >
                              <Copy className="w-3.5 h-3.5" /> 복사
                            </button>
                          </div>
                        </div>

                        {/* 채널 컨셉 */}
                        <div className="space-y-1">
                          <span className="text-[11px] text-zinc-500 font-bold block">채널 포지셔닝 & 컨셉</span>
                          <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {brandingResult.channelConcept}
                          </div>
                        </div>

                        {/* 채널 소개글 */}
                        <div className="space-y-1">
                          <span className="text-[11px] text-zinc-500 font-bold block">채널 정보 소개글 (About Bio)</span>
                          <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-[11px] text-zinc-300 leading-relaxed font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">
                            {brandingResult.aboutText}
                          </div>
                        </div>

                        {/* 고정 댓글 템플릿 */}
                        <div className="space-y-1">
                          <span className="text-[11px] text-zinc-500 font-bold block">영상 고정 댓글 (Pinned Comment)</span>
                          <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap">
                            {brandingResult.pinnedComment}
                          </div>
                        </div>

                        {/* 컬러 & 태그 */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-[11px] text-zinc-500 font-bold block">브랜드 컬러 키트</span>
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-[10px] text-zinc-300 font-mono truncate">
                              {brandingResult.brandColors}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[11px] text-zinc-500 font-bold block">검색 최적화 태그</span>
                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-[10px] text-zinc-300 truncate">
                              {brandingResult.channelTags}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 오른쪽: 디자인 자산 */}
                    <div className="lg:col-span-5 bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
                      <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                        <ImageIcon className="w-5 h-5 text-indigo-400" />
                        <h3 className="font-bold text-sm">보관된 비주얼 에셋 (Visual Assets)</h3>
                      </div>

                      <div className="space-y-4">
                        {/* 채널 배너 프리뷰 */}
                        {bannerUrls && bannerUrls.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] text-zinc-500 font-bold block">채널 아트 배너 (16:9)</span>
                            <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-white/10 shadow-lg group">
                              <img src={bannerUrls[0]} alt="Saved Banner" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-all">
                                <button
                                  onClick={() => downloadImage(bannerUrls[0], `${selectedChannelName}_banner.png`)}
                                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-[10px] font-bold transition-all"
                                >
                                  다운로드
                                </button>
                                <button
                                  onClick={() => setActiveZoomImage(bannerUrls[0])}
                                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-[10px] font-bold transition-all"
                                >
                                  확대보기
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 프로필 로고 프리뷰 */}
                        {profileUrls && profileUrls.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] text-zinc-500 font-bold block">프로필 아바타 로고 (1:1)</span>
                            <div className="relative w-28 h-28 mx-auto rounded-full overflow-hidden border-2 border-indigo-500/40 shadow-lg group">
                              <img src={profileUrls[0]} alt="Saved Profile" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-all">
                                <button
                                  onClick={() => downloadImage(profileUrls[0], `${selectedChannelName}_logo.png`)}
                                  className="p-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white transition-all"
                                  title="다운로드"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 비주얼 프롬프트 리스트 */}
                        <div className="space-y-2.5 pt-2 border-t border-white/5 text-[10px]">
                          <div className="space-y-1">
                            <span className="text-zinc-500 font-bold block">배너 제작 프롬프트</span>
                            <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 text-[9px] text-zinc-400 max-h-16 overflow-y-auto font-mono leading-tight whitespace-pre-wrap">
                              {brandingResult.bannerPrompt}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-zinc-500 font-bold block">로고 제작 프롬프트</span>
                            <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 text-[9px] text-zinc-400 max-h-16 overflow-y-auto font-mono leading-tight whitespace-pre-wrap">
                              {brandingResult.logoPrompt}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* ─── 위저드 스텝 인디케이터 ─── */}
            <div className="w-full bg-zinc-950/40 border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 w-full justify-between">
                {[
                  { step: 1, label: '1. 국가 선택' },
                  { step: 2, label: '2. 채널 연동' },
                  { step: 3, label: '3. 컨셉/스타일' },
                  { step: 4, label: '4. 브랜드 기획' },
                  { step: 5, label: '5. 디자인 제작' },
                  { step: 6, label: '6. 스케줄 설정' },
                ].map((s) => {
                  const isActive = currentWizardStep === s.step
                  const isCompleted = currentWizardStep > s.step
                  return (
                    <div key={s.step} className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.4)]'
                          : isCompleted
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                            : 'border-zinc-800 bg-zinc-900/40 text-zinc-500'
                      }`}>
                        {isCompleted ? '✓' : s.step}
                      </div>
                      <span className={`text-[11px] font-bold transition-colors ${
                        isActive 
                          ? 'text-white' 
                          : isCompleted 
                            ? 'text-emerald-400' 
                            : 'text-zinc-500'
                      }`}>
                        {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="w-full space-y-6">
              {/* Step 1: 글로벌 타겟 국가 선택 */}
              {currentWizardStep === 1 && (
                <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
                  <div>
                    <h3 className="text-base font-bold text-white">글로벌 타겟 국가 선택 (알고리즘 최적화)</h3>
                    <p className="text-[11px] text-zinc-400 mt-1">선택한 국가에 따라 AI 작명 규칙, 메타 카피라이팅, 고정 댓글 및 비주얼 DNA가 완전 현지화됩니다.</p>
                  </div>
                  <div className="flex gap-2.5">
                    {(['KR', 'JP', 'EN'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setTargetRegion(r)}
                        className={`flex-1 text-xs py-3.5 rounded-xl font-bold transition-all border ${
                          targetRegion === r
                            ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white border-transparent shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                            : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                        }`}
                      >
                        {r === 'KR' ? '대한민국 (KR)' : r === 'JP' ? '일본 (JP)' : '글로벌 (EN)'}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setCurrentWizardStep(2)}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-xl text-white shadow-[0_0_10px_rgba(79,70,229,0.3)] transition-all"
                    >
                      다음 단계 (채널 연동)
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: 유튜브 채널 연동 */}
              {currentWizardStep === 2 && (
                <div className="space-y-4">
                  <div className="section-card bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <YoutubeIcon className="w-5 h-5 text-red-500" />
                        <h3 className="font-bold text-sm">YouTube 연동 상태</h3>
                      </div>
                      {channel ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> 연동됨
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-400 bg-zinc-500/10 border border-zinc-500/20 px-2 py-0.5 rounded-full">
                          연동 대기
                        </span>
                      )}
                    </div>

                    {channel && !showAddChannelForm ? (
                      <div className="space-y-4">
                        {allChannels.length > 1 && (
                          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4">
                            <span className="text-xs text-zinc-400 font-medium">채널 선택 (전환)</span>
                            <select 
                              value={channel.channel_id}
                              onChange={(e) => fetchSettings(e.target.value)}
                              className="bg-black border border-white/10 rounded-lg text-xs text-white py-2 px-3 outline-none focus:border-red-500 cursor-pointer"
                            >
                              {allChannels.map((ch) => (
                                <option key={ch.channel_id} value={ch.channel_id}>
                                  {ch.channel_title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4">
                          <div>
                            <p className="text-xs text-zinc-400">연동된 채널 명</p>
                            <p className="text-sm font-bold text-white mt-0.5">{channel.channel_title}</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">ID: {channel.channel_id}</p>
                          </div>
                          <button 
                            onClick={handleDisconnectYoutube}
                            className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 연동 끊기
                          </button>
                        </div>

                        <div className="pt-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setResolvedChannel(null)
                              setChannelUrlInput('')
                              setResolveError('')
                              setShowAddChannelForm(true)
                            }}
                            className="text-xs font-semibold text-zinc-400 hover:text-white transition-all underline decoration-dotted"
                          >
                            + 다른 유튜브 채널 추가 연동하기
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-6 bg-white/5 border border-dashed border-zinc-800 rounded-xl space-y-4">
                        <p className="text-xs text-zinc-400">
                          연동하고자 하는 유튜브 채널의 주소(또는 핸들)를 입력하여 먼저 검증해 주십시오.
                        </p>
                        
                        <div className="space-y-3 max-w-md mx-auto">
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={channelUrlInput}
                              onChange={(e) => setChannelUrlInput(e.target.value)}
                              placeholder="채널 주소 (예: https://youtube.com/@channel 또는 @handle)" 
                              className="flex-1 bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-xs text-white focus:border-red-500 outline-none transition-colors"
                              disabled={isResolving}
                            />
                            <button 
                              type="button"
                              onClick={handleResolveChannel}
                              disabled={!channelUrlInput || isResolving}
                              className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-all"
                            >
                              {isResolving ? "조회 중..." : "채널 조회"}
                            </button>
                          </div>
                          {resolveError && <p className="text-[11px] text-red-400 text-left">{resolveError}</p>}
                        </div>

                        {resolvedChannel && (
                          <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-xl space-y-4 max-w-md mx-auto">
                            <div className="flex items-center gap-3">
                              {resolvedChannel.thumbnail && (
                                <img 
                                  src={resolvedChannel.thumbnail} 
                                  alt={resolvedChannel.title} 
                                  className="w-10 h-10 rounded-full border border-white/10"
                                />
                              )}
                              <div className="text-left">
                                <p className="text-xs font-bold text-white">{resolvedChannel.title}</p>
                                <p className="text-[10px] text-zinc-400">ID: {resolvedChannel.channelId}</p>
                              </div>
                            </div>
                            
                            <button 
                              type="button"
                              onClick={handleConnectYoutube}
                              className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-red-600 hover:bg-red-500 shadow-[0_0_15px_rgba(220,38,38,0.3)] py-3 rounded-xl transition-all"
                            >
                              <YoutubeIcon className="w-4 h-4 fill-white" /> Connect YouTube
                            </button>
                          </div>
                        )}

                        {channel && (
                          <div className="pt-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setShowAddChannelForm(false)
                                setResolvedChannel(null)
                                setChannelUrlInput('')
                                setResolveError('')
                              }}
                              className="text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-all underline"
                            >
                              돌아가기
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <button
                      type="button"
                      onClick={() => setCurrentWizardStep(1)}
                      className="px-5 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold rounded-xl text-zinc-300 transition-all"
                    >
                      이전 단계
                    </button>
                    {channel ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveDefaultSettings}
                          disabled={isSubmitting}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold rounded-xl text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all"
                        >
                          {isSubmitting ? "설정 중..." : "기본 설정으로 즉시 완료"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsChannelSkipped(false)
                            setCurrentWizardStep(3)
                          }}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-xl text-white shadow-[0_0_10px_rgba(79,70,229,0.3)] transition-all"
                        >
                          다음 단계 (컨셉 선택)
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsChannelSkipped(true)
                          setCurrentWizardStep(3)
                        }}
                        className="px-6 py-2.5 bg-zinc-800 border border-zinc-700/80 hover:bg-zinc-700 text-xs font-bold rounded-xl text-white transition-all"
                      >
                        다음에 연동하고 계속하기
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: 자율운영 컨셉 프리셋 & 스타일 선택 */}
              {currentWizardStep === 3 && (
                <div className="space-y-6">
                  {/* 1.5. 채널 브랜드 및 작명 스타일 커스텀 설정 */}
                  <div className="section-card bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
                    <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                      <Settings2 className="w-5 h-5 text-indigo-400" />
                      <h3 className="font-bold text-[14px]">채널 브랜드 및 작명 스타일 커스텀</h3>
                    </div>



                    {/* Naming Length */}
                    <div className="space-y-3">
                      <label className="text-[12px] text-zinc-400 font-bold">작명 글자 수 선호도 (2차 선택)</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {([
                          { value: 'type-1', label: '초간결 직관형 (Short-Form)', desc: '모바일 가독성 극대화, 심플/임팩트 (한글 2~3자, 영문 3~6자 이내)' },
                          { value: 'type-2', label: '의미 합성형 (Compound)', desc: '카테고리 명확성 및 검색 최적화(SEO) (한글 4~5자, 영문 7~12자 이내)' },
                          { value: 'type-3', label: '문장/슬로건형 (Narrative)', desc: '독특한 톤앤매너 및 팬덤 형성 (한글 6자 이상, 영문 13자 이상 혹은 3단어 이상)' }
                        ] as const).map((l) => (
                          <button
                            key={l.value}
                            type="button"
                            onClick={() => setNamingLength(l.value)}
                            className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                              namingLength === l.value
                                ? 'border-indigo-600 bg-indigo-600/10 text-indigo-400'
                                : 'border-zinc-800 bg-zinc-900/30 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                            }`}
                          >
                            <span className="text-[11px] font-bold text-white mb-1">{l.label}</span>
                            <span className="text-[9px] text-zinc-500 leading-relaxed">{l.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Naming Keywords */}
                    <div className="space-y-2">
                      <label className="text-[12px] text-zinc-400 font-bold">채널명 필수 포함 키워드 (선택)</label>
                      <input
                        type="text"
                        value={brandKeywords}
                        onChange={(e) => setBrandKeywords(e.target.value)}
                        placeholder="예: lofi, cafe, jazz, sleep (쉼표로 구분하여 입력)"
                        className="w-full bg-white/5 border border-white/10 rounded-xl text-[12px] px-3 py-2 text-white focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
                      />
                    </div>

                    {/* Custom Directives / Custom Vibe */}
                    <div className="space-y-2">
                      <label className="text-[12px] text-zinc-400 font-bold flex items-center justify-between">
                        <span>추가 컨셉 요구사항 (선택)</span>
                        <span className="text-[10px] text-zinc-500">실시간 프롬프트 자동 믹싱</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customVibe}
                          onChange={(e) => setCustomVibe(e.target.value)}
                          placeholder="예: 서울의 가을 밤 비 오는 카페, 갈색 리트리버..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl text-[12px] px-3 py-2 text-white focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
                        />
                        {selectedPresetId && (
                          <button
                            type="button"
                            onClick={() => fetchBranding(selectedPresetId, targetRegion, true)}
                            className="px-4 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-[11px] font-bold rounded-xl text-white transition-all whitespace-nowrap"
                          >
                            다시 기획하기
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. 컨셉 프리셋 피커 */}
                  <div className="section-card bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <div className="flex items-center gap-3">
                        <Layers className="w-5 h-5 text-indigo-400" />
                        <h3 className="font-bold text-sm">자율운영 컨셉 프리셋 선택 ({filteredPresets.length})</h3>
                      </div>
                    </div>

                    {/* 프리셋 그룹 검색 필터 및 검색창 통합 행 */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <div className="flex items-center justify-start gap-2 w-fit">
                        {([
                          { value: 'all', label: '전체' },
                          { value: 'custom', label: '나만의 프리셋' },
                          { value: 'default', label: '기본 제공' }
                        ] as const).map((tab) => (
                          <button
                            key={tab.value}
                            type="button"
                            onClick={() => { setPresetFilter(tab.value); setPresetPage(1); }}
                            className={`text-[10px] px-3.5 py-2 rounded-xl font-bold transition-all border ${
                              presetFilter === tab.value
                                ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                                : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <input 
                        type="text"
                        placeholder="컨셉명 검색..."
                        value={presetSearch}
                        onChange={(e) => { setPresetSearch(e.target.value); setPresetPage(1); }}
                        className="bg-white/5 border border-white/10 text-xs px-3 py-1.5 rounded-xl focus:outline-none focus:border-indigo-500 w-full sm:w-44 placeholder-zinc-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {paginatedPresets.map((preset) => {
                        const isSelected = selectedPresetId === preset.id
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handlePresetSelect(preset.id)}
                            className={`relative text-left p-3.5 rounded-xl border transition-all duration-200 hover:scale-[1.01] flex flex-col justify-between min-h-[96px] ${
                              isSelected 
                                ? 'border-fuchsia-500 bg-fuchsia-500/10 shadow-[0_0_15px_rgba(217,70,239,0.2)]'
                                : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className="text-xl">{preset.emoji || '🎵'}</span>
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold truncate text-white">{preset.name}</h4>
                                <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2 leading-snug">{preset.desc}</p>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="absolute bottom-2 right-2 text-fuchsia-400">
                                <CheckCircle2 className="w-4 h-4 fill-fuchsia-500/10" />
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* 프리셋 페이지네이션 */}
                    {totalPages > 1 && (
                      <div className="flex justify-center gap-1.5 pt-3 border-t border-white/5">
                        {Array.from({ length: totalPages }).map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setPresetPage(idx + 1)}
                            className={`w-6 h-6 rounded-lg text-[11px] font-bold flex items-center justify-center transition-all ${
                              presetPage === idx + 1
                                ? 'bg-indigo-600 text-white shadow-sm border border-indigo-500'
                                : 'bg-white/5 text-zinc-400 hover:text-white border border-white/5'
                            }`}
                          >
                            {idx + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 네비게이션 버튼 */}
                  <div className="flex justify-between items-center pt-2">
                    <button
                      type="button"
                      onClick={() => setCurrentWizardStep(2)}
                      className="px-5 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold rounded-xl text-zinc-300 transition-all"
                    >
                      이전 단계
                    </button>
                    <button
                      type="button"
                      disabled={!selectedPresetId}
                      onClick={() => {
                        fetchBranding(selectedPresetId, targetRegion, false)
                        setCurrentWizardStep(4)
                      }}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-xl text-white disabled:opacity-30 disabled:pointer-events-none shadow-[0_0_10px_rgba(79,70,229,0.3)] transition-all"
                    >
                      다음 단계 (AI 브랜드 기획)
                    </button>
                  </div>
                </div>
              )}
            {/* Step 4: AI 브랜드 컨설팅 기획 및 작명 확정 */}
            {currentWizardStep === 4 && selectedPresetId && (
              <div className="space-y-4">
                <div className="section-card bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <Sparkles className="w-5 h-5 text-amber-400 animate-spin-slow" />
                  <h3 className="font-bold text-sm">AI 브랜드 컨설팅 (A to Z 패키지)</h3>
                </div>

                {isBrandingLoading ? (
                  <div className="text-center py-12 text-xs text-zinc-500 flex flex-col items-center justify-center gap-3">
                    <Sparkles className="w-6 h-6 text-amber-400 animate-spin" />
                    <span>프리셋 템플릿의 문장을 시적 은유와 핵심 유즈케이스로 재배합해 작명하고 있습니다...</span>
                  </div>
                ) : brandingResult ? (
                  <div className="space-y-5 text-[13px]">
                    {/* 최신 설정과 동기화하기 위한 갱신 안내 & 재생성 버튼 */}
                    <div className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl p-3">
                      <div>
                        <p className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 기획안 로드 완료
                        </p>
                        <p className="text-[9px] text-zinc-400 mt-0.5">스타일 설정을 변경하셨다면 다시 생성해 보세요.</p>
                      </div>
                      <button
                        onClick={() => fetchBranding(selectedPresetId, targetRegion, true)}
                        className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-[11px] font-bold rounded-lg text-white transition-all whitespace-nowrap flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" /> AI 기획 재생성
                      </button>
                    </div>
                    {/* 단계별 프로세스 탭 네비게이터 */}
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 gap-1">
                      {([
                        { step: 1, label: '1. 채널 기획' },
                        { step: 2, label: '2. 프로필 & 소개' },
                        { step: 3, label: '3. 그래픽 비주얼' },
                        { step: 4, label: '4. 업로드 SEO' }
                      ]).map((s) => {
                        const isTabDisabled = s.step > 1 && !isChannelNameSelectedValid;
                        return (
                          <button
                            key={s.step}
                            type="button"
                            disabled={isTabDisabled}
                            onClick={() => setBrandingStep(s.step)}
                            className={`flex-1 text-[11px] py-2 rounded-lg font-bold text-center transition-all ${
                              brandingStep === s.step
                                ? 'bg-indigo-600 text-white shadow-sm border border-indigo-500'
                                : isTabDisabled
                                  ? 'text-zinc-700 cursor-not-allowed opacity-40'
                                  : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Step 1: 채널 기획 */}
                    {brandingStep === 1 && (
                      <div className="space-y-4">
                        {/* 0. 채널 컨셉 및 방향성 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[14px] text-zinc-300 font-bold">0. 채널 타겟 및 감성 컨셉</p>
                            <button
                              onClick={() => handleCopy(brandingResult.channelConcept, '채널 컨셉')}
                              className="flex items-center gap-1 text-[12px] text-indigo-400 hover:text-indigo-300"
                            >
                              <Copy className="w-3.5 h-3.5" /> 복사
                            </button>
                          </div>
                          <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                            <p className="text-[15px] font-semibold text-zinc-100 leading-relaxed">
                              {brandingResult.channelConcept}
                            </p>
                          </div>
                        </div>

                        {/* A. 추천 채널명 */}
                        <div className="space-y-2">
                          <p className="text-[14px] text-zinc-300 font-bold">1. 추천 채널명 (스타일 분리 매칭)</p>
                          <div className="space-y-3">
                            {brandingResult.names.map((item: any, idx: number) => (
                              <div key={idx} className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                                  {(() => {
                                    const header = (() => {
                                      const s = (item.style || '').toLowerCase()
                                      if (s.includes('type a') || s.includes('국가 언어 100%') || s.includes('국가언어')) {
                                        return {
                                          title: '해당 국가 언어 100%',
                                          desc: '로컬라이징 극대화. 현지 시청자에게 가장 자연스러운 정서적 네이밍 (예: 조선 그루브, 和風ビート)'
                                        }
                                      }
                                      if (s.includes('type b') || s.includes('영어 100%') || s.includes('영어100%')) {
                                        return {
                                          title: '영어 100%',
                                          desc: '글로벌 확장성 및 범용성 최적화. 전 세계 시청자를 타겟으로 하는 영어 네이밍 (예: Midnight Scholar, Shogun Beats)'
                                        }
                                      }
                                      return {
                                        title: '국가 언어 + 영어 조합',
                                        desc: '두 언어 간 시너지를 내는 트렌디한 하이브리드 조합 (예: K-Tech, 지식로그, Daily Science)'
                                      }
                                    })()

                                    return (
                                      <div>
                                        <span className="text-[13px] text-indigo-400 font-bold block mb-0.5">{header.title}</span>
                                        <p className="text-[11px] text-zinc-400 leading-relaxed mb-2">{header.desc}</p>
                                        {item.desc && <p className="text-[13px] text-zinc-300 leading-relaxed border-t border-white/5 pt-1.5 mt-1.5">{item.desc}</p>}
                                      </div>
                                    )
                                  })()}

                                {/* PWA 고해상도 작명 후보 리스트 */}
                                {item.candidates && Array.isArray(item.candidates) && item.candidates.length > 0 ? (
                                  <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                    {item.candidates.map((c: any, cIdx: number) => {
                                      const candidateName = typeof c === 'string' ? c : c.name
                                      const candidateDesc = typeof c === 'string' ? '' : c.desc
                                      const isSelected = selectedChannelName === candidateName && !isCustomNameSelected
                                      return (
                                        <div 
                                          key={`cand-${cIdx}`} 
                                          className={`bg-black/30 px-3 py-2.5 rounded-lg flex items-center justify-between gap-2 border transition-all cursor-pointer ${
                                            isSelected ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/5'
                                          }`}
                                          onClick={() => {
                                            setSelectedChannelName(candidateName)
                                            setIsCustomNameSelected(false)
                                          }}
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <input
                                              type="radio"
                                              name="channel-name-candidate"
                                              checked={isSelected}
                                              onChange={() => {
                                                setSelectedChannelName(candidateName)
                                                setIsCustomNameSelected(false)
                                              }}
                                              className="w-3.5 h-3.5 text-indigo-500 bg-zinc-900 border-zinc-700 focus:ring-indigo-500/40 flex-shrink-0"
                                            />
                                            <div className="min-w-0">
                                              <span className="text-[14px] font-bold text-amber-300 block truncate">{candidateName}</span>
                                              {candidateDesc && <p className="text-[12px] text-zinc-300 leading-snug mt-0.5">{candidateDesc}</p>}
                                            </div>
                                          </div>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleCopy(candidateName, '채널명')
                                            }}
                                            className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-all flex-shrink-0"
                                            title="복사하기"
                                          >
                                            <Copy className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <>
                                    {/* 한글 후보 (이전 캐시 대비 하위 호환) */}
                                    {item.korean && Array.isArray(item.korean) && item.korean.length > 0 && (
                                      <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                        <span className="text-[13px] text-yellow-400 font-extrabold">한글</span>
                                        {item.korean.map((c: any, cIdx: number) => {
                                          const candidateName = typeof c === 'string' ? c : c.name
                                          const candidateDesc = typeof c === 'string' ? '' : c.desc
                                          const isSelected = selectedChannelName === candidateName && !isCustomNameSelected
                                          return (
                                            <div 
                                              key={`kr-${cIdx}`} 
                                              className={`bg-black/30 px-3 py-2.5 rounded-lg flex items-center justify-between gap-2 border transition-all cursor-pointer ${
                                                isSelected ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/5'
                                              }`}
                                              onClick={() => {
                                                setSelectedChannelName(candidateName)
                                                setIsCustomNameSelected(false)
                                              }}
                                            >
                                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <input
                                                  type="radio"
                                                  name="channel-name-candidate"
                                                  checked={isSelected}
                                                  onChange={() => {
                                                    setSelectedChannelName(candidateName)
                                                    setIsCustomNameSelected(false)
                                                  }}
                                                  className="w-3.5 h-3.5 text-indigo-500 bg-zinc-900 border-zinc-700 focus:ring-indigo-500/40 flex-shrink-0"
                                                />
                                                <div className="min-w-0">
                                                  <span className="text-[14px] font-bold text-amber-300 block truncate">{candidateName}</span>
                                                  {candidateDesc && <p className="text-[12px] text-zinc-300 leading-snug mt-0.5">{candidateDesc}</p>}
                                                </div>
                                              </div>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleCopy(candidateName, '채널명')
                                                }}
                                                className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-all flex-shrink-0"
                                                title="복사하기"
                                              >
                                                <Copy className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}

                                    {/* 영문 후보 (이전 캐시 대비 하위 호환) */}
                                    {item.english && Array.isArray(item.english) && item.english.length > 0 && (
                                      <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                        <span className="text-[13px] text-blue-300 font-extrabold">English</span>
                                        {item.english.map((c: any, cIdx: number) => {
                                          const candidateName = typeof c === 'string' ? c : c.name
                                          const candidateDesc = typeof c === 'string' ? '' : c.desc
                                          const isSelected = selectedChannelName === candidateName && !isCustomNameSelected
                                          return (
                                            <div 
                                              key={`en-${cIdx}`} 
                                              className={`bg-black/30 px-3 py-2.5 rounded-lg flex items-center justify-between gap-2 border transition-all cursor-pointer ${
                                                isSelected ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/5'
                                              }`}
                                              onClick={() => {
                                                setSelectedChannelName(candidateName)
                                                setIsCustomNameSelected(false)
                                              }}
                                            >
                                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <input
                                                  type="radio"
                                                  name="channel-name-candidate"
                                                  checked={isSelected}
                                                  onChange={() => {
                                                    setSelectedChannelName(candidateName)
                                                    setIsCustomNameSelected(false)
                                                  }}
                                                  className="w-3.5 h-3.5 text-indigo-500 bg-zinc-900 border-zinc-700 focus:ring-indigo-500/40 flex-shrink-0"
                                                />
                                                <div className="min-w-0">
                                                  <span className="text-[14px] font-bold text-amber-300 block truncate">{candidateName}</span>
                                                  {candidateDesc && <p className="text-[12px] text-zinc-300 leading-snug mt-0.5">{candidateDesc}</p>}
                                                </div>
                                              </div>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleCopy(candidateName, '채널명')
                                                }}
                                                className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-all flex-shrink-0"
                                                title="복사하기"
                                              >
                                                <Copy className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </>
                                )}


                                {/* Fallback: 기존 candidates 형식 호환 */}
                                {!item.korean && !item.english && item.candidates && (
                                  <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                                    {(item.candidates || []).map((name: string, cIdx: number) => {
                                      const isSelected = selectedChannelName === name && !isCustomNameSelected
                                      return (
                                        <div 
                                          key={cIdx} 
                                          className={`bg-black/30 px-3 py-2 rounded-lg flex items-center justify-between gap-2 border transition-all cursor-pointer ${
                                            isSelected ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/5'
                                          }`}
                                          onClick={() => {
                                            setSelectedChannelName(name)
                                            setIsCustomNameSelected(false)
                                          }}
                                        >
                                          <div className="flex items-center gap-2.5 truncate">
                                            <input
                                              type="radio"
                                              name="channel-name-candidate"
                                              checked={isSelected}
                                              onChange={() => {
                                                setSelectedChannelName(name)
                                                setIsCustomNameSelected(false)
                                              }}
                                              className="w-3.5 h-3.5 text-indigo-500 bg-zinc-900 border-zinc-700 focus:ring-indigo-500/40"
                                            />
                                            <span className="text-[14px] font-bold text-amber-300 truncate">{name}</span>
                                          </div>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleCopy(name, '채널명')
                                            }}
                                            className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-all flex-shrink-0"
                                            title="복사하기"
                                          >
                                            <Copy className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* 사용자 직접 입력 (10번째 후보) */}
                            <div className={`bg-white/5 p-3.5 rounded-xl border transition-all ${
                              isCustomNameSelected ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/5'
                            } space-y-2.5`}>
                              <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => {
                                setIsCustomNameSelected(true)
                                setSelectedChannelName(customChannelName)
                              }}>
                                <input
                                  type="radio"
                                  id="custom-channel-name-radio"
                                  name="channel-name-candidate"
                                  checked={isCustomNameSelected}
                                  onChange={() => {
                                    setIsCustomNameSelected(true)
                                    setSelectedChannelName(customChannelName)
                                  }}
                                  className="w-3.5 h-3.5 text-indigo-500 bg-zinc-900 border-zinc-700 focus:ring-indigo-500/40"
                                />
                                <label htmlFor="custom-channel-name-radio" className="text-[13px] text-zinc-200 font-bold cursor-pointer">
                                  직접 채널명 입력 (10번째 시안)
                                </label>
                              </div>
                              <input
                                type="text"
                                placeholder="사용할 채널명을 여기에 직접 입력하세요..."
                                value={customChannelName}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setCustomChannelName(val)
                                  if (isCustomNameSelected) {
                                    setSelectedChannelName(val)
                                  }
                                }}
                                className="w-full bg-black/40 border border-zinc-700/50 rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-indigo-500/80 transition-colors"
                              />
                            </div>
                          </div>
                        </div>

                        {/* B. 추천 핸들 ID */}
                        <div className="space-y-3">
                          <p className="text-[12px] text-zinc-400 font-bold">2. 추천 채널 핸들 ID (중복 확인 지원)</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {brandingResult.handles.map((handle, idx) => {
                              const status = checkedHandles[handle]
                              return (
                                <div key={idx} className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col justify-between gap-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-mono text-indigo-400 font-bold">{handle}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(handle, '핸들 ID')}
                                      className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-all"
                                      title="핸들 복사"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  
                                  <div className="flex items-center justify-between">
                                    {/* 상태 인디케이터 */}
                                    {status === 'loading' ? (
                                      <span className="text-[12px] text-zinc-300 flex items-center gap-1">
                                        <span className="w-2.5 h-2.5 border-2 border-zinc-350 border-t-transparent rounded-full animate-spin"></span>
                                        조회 중...
                                      </span>
                                    ) : status === 'available' ? (
                                      <span className="text-[12px] text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded">
                                        ✓ 사용 가능
                                      </span>
                                    ) : status === 'taken' ? (
                                      <span className="text-[12px] text-rose-350 font-bold bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded">
                                        ✗ 사용 중 (중복)
                                      </span>
                                    ) : status === 'error' ? (
                                      <span className="text-[12px] text-amber-300 font-bold bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded">
                                        ! 조회 실패
                                      </span>
                                    ) : (
                                      <span className="text-[12px] text-zinc-400">등록 여부 미확인</span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => checkHandleAvailability(handle)}
                                      disabled={status === 'loading'}
                                      className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-[12px] font-bold rounded-lg transition-all"
                                    >
                                      중복 확인
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* 커스텀 핸들 중복 검사기 */}
                          <div className="bg-zinc-900/40 p-3 rounded-xl border border-white/5 space-y-2 mt-1">
                            <label className="text-[13px] text-zinc-300 font-bold flex items-center justify-between">
                              <span>커스텀 핸들 직접 중복 확인</span>
                              <span className="text-[11px] text-zinc-400 font-mono">영문, 숫자, 마침표(.), 언더바(_), 하이픈(-)</span>
                            </label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-3 top-2 text-zinc-400 text-[14px] font-mono">@</span>
                                <input
                                  type="text"
                                  placeholder="custom_handle"
                                  value={customHandleToCheck}
                                  onChange={(e) => setCustomHandleToCheck(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                                  className="w-full bg-black/60 border border-zinc-700/50 rounded-lg pl-7 pr-3 py-2 text-[14px] text-white focus:outline-none focus:border-indigo-500/80 transition-colors font-mono"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => checkHandleAvailability(`@${customHandleToCheck}`)}
                                disabled={!customHandleToCheck.trim() || checkedHandles[`@${customHandleToCheck}`] === 'loading'}
                                className="px-4 bg-indigo-600 hover:bg-indigo-500 text-[13px] font-bold rounded-lg text-white transition-all whitespace-nowrap"
                              >
                                중복 확인
                              </button>
                            </div>
                            
                            {customHandleToCheck && checkedHandles[`@${customHandleToCheck}`] && (
                              <div className="flex items-center gap-2 pt-1">
                                <span className="text-[13px] text-zinc-400">@{customHandleToCheck} 결과:</span>
                                {checkedHandles[`@${customHandleToCheck}`] === 'loading' && (
                                  <span className="text-[12px] text-zinc-300 flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 border-2 border-zinc-350 border-t-transparent rounded-full animate-spin"></span>
                                    조회 중...
                                  </span>
                                )}
                                {checkedHandles[`@${customHandleToCheck}`] === 'available' && (
                                  <span className="text-[12px] text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded">
                                    ✓ 사용 가능한 핸들입니다!
                                  </span>
                                )}
                                {checkedHandles[`@${customHandleToCheck}`] === 'taken' && (
                                  <span className="text-[12px] text-rose-350 font-bold bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded">
                                    ✗ 이미 사용 중인 핸들입니다.
                                  </span>
                                )}
                                {checkedHandles[`@${customHandleToCheck}`] === 'error' && (
                                  <span className="text-[12px] text-amber-300 font-bold bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded">
                                    조회 에러가 발생했습니다.
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* C. 브랜드 컬러 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] text-zinc-400 font-bold">3. 브랜드 대표 컬러 팔레트</p>
                            <button
                              onClick={() => handleCopy(brandingResult.brandColors, '브랜드 컬러')}
                              className="flex items-center gap-1 text-[12px] text-zinc-300 hover:text-white"
                            >
                              <Copy className="w-3.5 h-3.5" /> 복사
                            </button>
                          </div>
                          <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-[11px] text-zinc-300 font-mono">
                            {brandingResult.brandColors}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 2: 프로필 & 소개 */}
                    {brandingStep === 2 && (
                      <div className="space-y-4">
                        {/* 소개글 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[14px] text-zinc-300 font-bold">1. 검색 최적화(SEO) 채널 소개글 (Bio)</p>
                            <button
                              onClick={() => handleCopy(brandingResult.aboutText, '채널 소개글')}
                              className="flex items-center gap-1 text-[12px] text-zinc-300 hover:text-white"
                            >
                              <Copy className="w-3.5 h-3.5" /> 복사
                            </button>
                          </div>
                          <div className="bg-white/5 p-3.5 rounded-xl border border-white/5">
                            <p className="text-[14px] text-zinc-200 whitespace-pre-wrap leading-relaxed font-sans">
                              {brandingResult.aboutText}
                            </p>
                          </div>
                        </div>

                        {/* 채널 태그 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[14px] text-zinc-300 font-bold">2. 채널 검색 키워드 / 태그</p>
                            <button
                              onClick={() => handleCopy(brandingResult.channelTags, '채널 태그')}
                              className="flex items-center gap-1 text-[12px] text-zinc-300 hover:text-white"
                            >
                              <Copy className="w-3.5 h-3.5" /> 복사
                            </button>
                          </div>
                          <div className="bg-white/5 p-3 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-200 font-sans">
                            {brandingResult.channelTags}
                          </div>
                        </div>

                        {/* 프로필 로고 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] gap-2">
                            <span className="text-[14px] text-zinc-300 font-bold">3. 📷 프로필 로고 제작 프롬프트</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSendToCreator(brandingResult.logoPrompt, 'logo')}
                                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 hover:underline text-[12px]"
                              >
                                🎨 크리에이터로 전송
                              </button>
                              <span className="text-zinc-700">|</span>
                              <button
                                onClick={() => handleCopy(brandingResult.logoPrompt, '로고 프롬프트')}
                                className="text-zinc-400 hover:underline flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> 복사
                              </button>
                            </div>
                          </div>
                          <div className="bg-black/30 p-4 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-300 select-all leading-relaxed">
                            {brandingResult.logoPrompt}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 3: 그래픽 비주얼 */}
                    {brandingStep === 3 && (
                      <div className="space-y-4">
                        {/* 채널 아트 배너 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] gap-2">
                            <span className="text-[14px] text-zinc-300 font-bold">1. 🎨 채널 아트 배너 프롬프트</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSendToCreator(brandingResult.bannerPrompt, 'banner')}
                                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 hover:underline text-[12px]"
                              >
                                🎨 크리에이터로 전송
                              </button>
                              <span className="text-zinc-700">|</span>
                              <button
                                onClick={() => handleCopy(brandingResult.bannerPrompt, '배너 프롬프트')}
                                className="text-zinc-400 hover:underline flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> 복사
                              </button>
                            </div>
                          </div>
                          <div className="bg-black/30 p-4 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-300 select-all leading-relaxed">
                            {brandingResult.bannerPrompt}
                          </div>
                        </div>

                        {/* 동영상 워터마크 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[14px] text-zinc-300 font-bold">2. 🏷️ 동영상 워터마크 프롬프트</span>
                            <button
                              onClick={() => handleCopy(brandingResult.watermarkPrompt, '워터마크 프롬프트')}
                              className="text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> 복사
                            </button>
                          </div>
                          <div className="bg-black/30 p-4 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-300 select-all leading-relaxed">
                            {brandingResult.watermarkPrompt}
                          </div>
                        </div>

                        {/* 썸네일 디자인 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] gap-2">
                            <span className="text-[14px] text-zinc-300 font-bold">3. 🖼️ 썸네일 배경 디자인 프롬프트</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSendToCreator(brandingResult.thumbnailPrompt, 'thumbnail')}
                                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 hover:underline text-[12px]"
                              >
                                🎨 크리에이터로 전송
                              </button>
                              <span className="text-zinc-700">|</span>
                              <button
                                onClick={() => handleCopy(brandingResult.thumbnailPrompt, '썸네일 프롬프트')}
                                className="text-zinc-400 hover:underline flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> 복사
                              </button>
                            </div>
                          </div>
                          <div className="bg-black/30 p-4 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-300 select-all leading-relaxed">
                            {brandingResult.thumbnailPrompt}
                          </div>
                        </div>

                        {/* 썸네일 타이포 가이드 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[14px] text-zinc-300 font-bold">4. ✍️ 썸네일 타이포그래피 가이드</span>
                            <button
                              onClick={() => handleCopy(brandingResult.thumbnailTypography, '타이포 가이드')}
                              className="text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> 복사
                            </button>
                          </div>
                          <div className="bg-black/30 p-4 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-300 select-all leading-relaxed">
                            {brandingResult.thumbnailTypography}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step 4: 업로드 SEO */}
                    {brandingStep === 4 && (
                      <div className="space-y-4">
                        {/* 영상 제목 포맷 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[14px] text-zinc-300 font-bold">1. 🎨 추천 영상 제목 포맷</span>
                            <button
                              onClick={() => handleCopy(brandingResult.videoTitleTemplate, '영상 제목 템플릿')}
                              className="text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> 복사
                            </button>
                          </div>
                          <div className="bg-black/30 p-4 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-300 select-all leading-relaxed">
                            {brandingResult.videoTitleTemplate}
                          </div>
                        </div>

                        {/* 영상 설명글 템플릿 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[14px] text-zinc-300 font-bold">2. 📝 추천 영상 설명글 템플릿</span>
                            <button
                              onClick={() => handleCopy(brandingResult.videoDescriptionTemplate, '설명글 템플릿')}
                              className="text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              <Copy className="w-3.5 h-3.5" /> 복사
                            </button>
                          </div>
                          <div className="bg-black/30 p-4 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-300 select-all leading-relaxed whitespace-pre-wrap">
                            {brandingResult.videoDescriptionTemplate}
                          </div>
                        </div>

                        {/* 영상 태그 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[14px] text-zinc-300 font-bold">3. 🏷️ 추천 영상 태그 키워드</span>
                            <button
                              onClick={() => handleCopy(brandingResult.videoTags, '영상 태그')}
                              className="text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> 복사
                            </button>
                          </div>
                          <div className="bg-black/30 p-4 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-300 select-all leading-relaxed">
                            {brandingResult.videoTags}
                          </div>
                        </div>

                        {/* 고정 댓글 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[14px] text-zinc-300 font-bold">4. 💬 참여 유도용 고정 댓글</span>
                            <button
                              onClick={() => handleCopy(brandingResult.pinnedComment, '고정 댓글')}
                              className="text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" /> 복사
                            </button>
                          </div>
                          <div className="bg-black/30 p-4 rounded-xl border border-white/5 font-mono text-[13px] text-zinc-300 select-all leading-relaxed">
                            {brandingResult.pinnedComment}
                          </div>
                        </div>
                      </div>
                    )}

                     {/* 이전/다음 단계 네비게이션 버튼 */}
                    <div className="flex justify-between items-center pt-4 border-t border-white/5 mt-4">
                      <button
                        type="button"
                        disabled={brandingStep === 1}
                        onClick={() => setBrandingStep(prev => Math.max(1, prev - 1))}
                        className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-[13px] font-bold rounded-xl text-zinc-300 disabled:opacity-30 disabled:pointer-events-none transition-all"
                      >
                        이전 단계
                      </button>
                      <span className="text-[14px] text-zinc-300 font-extrabold">Step {brandingStep} / 4</span>
                      <button
                        type="button"
                        disabled={brandingStep === 4 || !isChannelNameSelectedValid}
                        onClick={() => setBrandingStep(prev => Math.min(4, prev + 1))}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[13px] font-bold rounded-xl text-white disabled:opacity-30 disabled:pointer-events-none transition-all shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                      >
                        다음 단계
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 px-4 bg-white/5 border border-dashed border-zinc-800 rounded-xl space-y-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center mx-auto text-indigo-400">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-zinc-200">커스텀 AI 브랜딩 기획이 준비되었습니다.</p>
                      <p className="text-[13px] text-zinc-300 mt-1">지정한 작명/비주얼 스타일을 기반으로 채널 기획 패키지를 생성해 보세요.</p>
                    </div>
                    <button
                      onClick={() => fetchBranding(selectedPresetId, targetRegion, true)}
                      className="w-full max-w-xs mx-auto flex items-center justify-center gap-1.5 text-[14px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_12px_rgba(79,70,229,0.3)] py-3 rounded-xl transition-all"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-200" /> AI 브랜드 컨설팅 기획 시작
                    </button>
                  </div>
                )}
              </div>
              {brandingResult && !isChannelNameSelectedValid && (
                <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[14px] p-4 rounded-xl flex items-center gap-2.5 mb-3">
                  <AlertCircle className="w-5 h-5 text-amber-300 flex-shrink-0 animate-pulse" />
                  <span className="leading-relaxed">
                    <strong>[안내]</strong> 채널 브랜드 기획을 진행하려면 AI가 추천한 <strong>9가지 채널명 후보 중 하나를 선택</strong>하거나, 최하단의 <strong>&quot;직접 채널명 입력&quot;</strong>을 선택하고 원하는 이름을 입력해주셔야 다음 단계로 이동할 수 있습니다.
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentWizardStep(3)}
                  className="px-5 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold rounded-xl text-zinc-300 transition-all"
                >
                  이전 단계
                </button>
                <button
                  type="button"
                  disabled={!brandingResult || !isChannelNameSelectedValid}
                  onClick={() => setCurrentWizardStep(5)}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-xl text-white disabled:opacity-30 disabled:pointer-events-none shadow-[0_0_10px_rgba(79,70,229,0.3)] transition-all"
                >
                  다음 단계 (디자인 제작)
                </button>
              </div>
            </div>
          )}
            {/* Step 6: 자동화 스케줄러 설정 */}
            {currentWizardStep === 6 && (
              <div className="space-y-4">
                <div className="section-card bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
                  <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                    <Settings2 className="w-5 h-5 text-fuchsia-400" />
                    <h3 className="font-bold text-sm">자동 업로드 스케줄러</h3>
                  </div>

                  {!channel && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 space-y-1.5">
                      <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" /> 채널 미연동 상태로 계속하는 중
                      </p>
                      <p className="text-[10px] text-zinc-400 leading-relaxed">
                        유튜브 채널이 아직 연결되지 않았습니다. 현재 채널 연동 없이도 왼쪽의 AI 브랜드 컨설팅과 아래의 AI 비주얼 크리에이터를 자유롭게 사용해 보실 수 있습니다. 자동 업로드 스케줄러는 추후 채널을 연결한 뒤 저장하실 수 있습니다.
                      </p>
                    </div>
                  )}

                  {/* 요일 선택 */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> 업로드 요일 지정 (중복 선택)
                    </label>
                    <div className="flex justify-between gap-2">
                      {DAYS_OF_WEEK.map((day) => {
                        const isActive = selectedDays.includes(day.value)
                        return (
                          <button
                            key={day.value}
                            onClick={() => toggleDay(day.value)}
                            className={`flex-1 text-xs font-bold h-9 rounded-xl border transition-all ${
                              isActive
                                ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                                : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                            }`}
                          >
                            {day.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* 시간 지정 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> 업로드 시간
                      </label>
                      <input
                        type="time"
                        value={uploadTime}
                        onChange={(e) => setUploadTime(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg text-xs p-2 text-white focus:outline-none focus:border-fuchsia-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" /> 연동 포맷
                      </label>
                      <div className="flex flex-col gap-2 pt-1">
                        <label className="flex items-center gap-2 text-[10px] text-zinc-300 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={longformActive} 
                            onChange={(e) => setLongformActive(e.target.checked)}
                            className="rounded border-zinc-800 text-fuchsia-600 focus:ring-0 w-3.5 h-3.5 bg-zinc-900"
                          />
                          15곡 롱폼 비디오 (자동)
                        </label>
                        <label className="flex items-center gap-2 text-[10px] text-zinc-300 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={shortsActive} 
                            onChange={(e) => setShortsActive(e.target.checked)}
                            className="rounded border-zinc-800 text-fuchsia-600 focus:ring-0 w-3.5 h-3.5 bg-zinc-900"
                          />
                          숏폼 영상 동시 업로드
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 음원 구성 변동성 강도 선택 */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 flex items-center justify-between">
                      <span>음원 구성 변동성 강도 (자가복제 방지)</span>
                      <span className="text-indigo-400 font-bold uppercase">{variationStrength}</span>
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['low', 'medium', 'high'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setVariationStrength(v)}
                          className={`text-[10px] py-2 rounded-xl font-bold uppercase transition-all border text-center ${
                            variationStrength === v
                              ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                              : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 제휴 마케팅 링크 추가 */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" /> 설명글 고정 수익화 링크
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://link.coupang.com/... (파트너스 링크 등)"
                        value={monetizationLink}
                        onChange={(e) => setMonetizationLink(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg text-xs p-2 text-white focus:outline-none focus:border-fuchsia-500 placeholder-zinc-600"
                      />
                      <button
                        onClick={addLink}
                        className="px-3 bg-white/10 hover:bg-white/20 border border-white/10 text-xs rounded-lg transition-all"
                      >
                        추가
                      </button>
                    </div>
                    {monetizationLinks.length > 0 && (
                      <div className="bg-black/30 border border-white/5 rounded-lg p-2 max-h-24 overflow-y-auto space-y-1">
                        {monetizationLinks.map((link, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[9px] text-zinc-400 border-b border-white/5 last:border-0 pb-1">
                            <span className="truncate pr-4 font-mono">{link}</span>
                            <button onClick={() => removeLink(idx)} className="text-red-400 hover:text-red-300">삭제</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 저장 단추 */}
                  {!channel ? (
                    <button
                      disabled
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-zinc-500 bg-zinc-850 border border-zinc-700/80 py-3 rounded-xl cursor-not-allowed transition-all"
                    >
                      유튜브 채널 연동 후 스케줄 저장 가능 (다음에 저장)
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveSettings}
                      disabled={isSubmitting}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:scale-[1.01] py-3 rounded-xl transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? '스케줄 설정을 동기화하고 있습니다...' : '자율주행 자동화 설정 저장'}
                    </button>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentWizardStep(5)}
                    className="px-5 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold rounded-xl text-zinc-300 transition-all"
                  >
                    이전 단계
                  </button>
                  {!channel ? (
                    <button
                      disabled
                      className="px-6 py-2.5 bg-zinc-800 border border-zinc-700/80 text-xs font-bold rounded-xl text-zinc-500 cursor-not-allowed transition-all"
                    >
                      유튜브 연동 후 완료 가능
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSaveSettings}
                      disabled={isSubmitting}
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-bold rounded-xl text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? '동기화 중...' : '🎉 자율주행 활성화 및 저장'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 5: 채널 브랜드 비주얼 키트 (배너 & 프로필) */}
            {currentWizardStep === 5 && (
              <div className="space-y-4">
                <div id="visual-creator" className="section-card bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                  <ImageIcon className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-sm">채널 브랜드 비주얼 키트</h3>
                </div>
                <span className="text-[10px] text-indigo-400 font-bold border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                  채널 브랜드 구축
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                채널 홈을 장식할 아트 배너(16:9)와 프로필 로고(1:1)를 제작합니다. 왼쪽에서 추천한 프롬프트를 전송받거나 직접 변경하여 연출할 수 있습니다.
              </p>

              {/* 배너 / 프로필 탭 전환 */}
              <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveBrandSubTab('banner')}
                  className={`flex-1 text-[11px] py-2 rounded-lg font-bold text-center transition-all ${
                    activeBrandSubTab === 'banner'
                      ? 'bg-indigo-600 text-white shadow-sm border border-indigo-500'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  채널 배너 (16:9)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveBrandSubTab('profile')}
                  className={`flex-1 text-[11px] py-2 rounded-lg font-bold text-center transition-all ${
                    activeBrandSubTab === 'profile'
                      ? 'bg-indigo-600 text-white shadow-sm border border-indigo-500'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  프로필 로고 (1:1)
                </button>
              </div>

              {activeBrandSubTab === 'banner' ? (
                // ─── 배너 생성기 ───
                <div className="space-y-4">
                  {/* 배너 형식 선택 */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 font-bold">배너 형식 선택</label>
                    <div className="grid grid-cols-3 gap-2">
                      {BANNER_FORMATS.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setBannerFormat(f.value)}
                          className={`text-[10px] py-2 rounded-lg font-semibold border transition-all text-center ${
                            bannerFormat === f.value
                              ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                              : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 배너 스타일 선택 */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 font-bold">배너 스타일 선택</label>
                    <div className="grid grid-cols-2 gap-2">
                      {BANNER_STYLES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setBannerStyle(s.value)}
                          className={`text-[10px] py-2 rounded-lg font-semibold border transition-all text-center ${
                            bannerStyle === s.value
                              ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                              : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 배너 프롬프트 입력 */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 font-bold">배너 묘사 프롬프트</label>
                    <textarea
                      rows={3}
                      value={bannerPrompt}
                      onChange={(e) => setBannerPrompt(e.target.value)}
                      placeholder="채널 배너 배경 묘사..."
                      className="w-full bg-black/50 border border-white/10 rounded-xl py-2 px-3 text-white text-xs focus:border-fuchsia-500 outline-none transition-colors resize-none font-sans"
                    />
                  </div>

                  {/* 스타일 참조 이미지 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-zinc-400 font-bold">스타일 참조 이미지 (선택, 최대 3장)</label>
                      <span className="text-[10px] text-zinc-500">{bannerRefImages.length}/3장</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {Array.from({ length: 3 }).map((_, index) => {
                        const hasImage = index < bannerRefImages.length;
                        return hasImage ? (
                          <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-inner group">
                            <img src={bannerRefImages[index]} alt={`Banner Ref ${index + 1}`} className="w-full h-full object-cover" />
                            <button
                              onClick={() => handleRemoveReferenceImageForType('banner', index)}
                              className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-black/90 text-red-400 hover:text-red-300 rounded-full p-1 text-xs w-5 h-5 flex items-center justify-center font-bold transition-all shadow"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label key={index} className="aspect-square rounded-xl border border-dashed border-zinc-700 bg-white/5 hover:bg-white/10 hover:border-zinc-500 flex flex-col items-center justify-center cursor-pointer transition-all shadow-sm">
                            <Upload className="w-4 h-4 text-zinc-400" />
                            <span className="text-[8px] text-zinc-500 mt-1 font-bold">업로드</span>
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              onChange={(e) => handleFileChangeForType('banner', e)}
                              className="hidden"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* 생성 버튼 */}
                  <button
                    onClick={() => handleGenerateImageForType('banner')}
                    disabled={isGeneratingBanner}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:scale-[1.01] py-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    {isGeneratingBanner ? (
                      <>
                        <Sparkles className="w-4 h-4 text-indigo-300 animate-spin" />
                        <span>배너 이미지 생성 중...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-indigo-300" />
                        <span>AI 배너 생성하기</span>
                      </>
                    )}
                  </button>

                  {/* 배너 생성 결과 */}
                  {bannerUrls.length > 0 && (
                    <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1.5">
                            <span>✨ 배너 생성 완료!</span>
                          </span>
                          <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[8px] px-1.5 py-0.5 rounded font-mono font-semibold w-fit">
                            유튜브 배너 최적화: 1792x1024 (16:9)
                          </span>
                        </div>
                        <button
                          onClick={() => handleDownloadAll('banner')}
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[10px] bg-blue-600/10 hover:bg-blue-600/20 px-2.5 py-1.5 rounded-lg border border-blue-500/20 transition-all font-medium"
                        >
                          <Download className="w-3 h-3" />
                          전체 다운로드
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {bannerUrls.map((url, idx) => (
                          <div 
                            key={idx} 
                            className="group relative aspect-video w-full rounded-xl overflow-hidden border border-white/5 bg-black/60 flex items-center justify-center cursor-zoom-in"
                            onClick={() => setActiveZoomImage(url)}
                          >
                            <img src={url} alt={`Generated Banner ${idx + 1}`} className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
                              <button
                                onClick={(e) => { e.stopPropagation(); setActiveZoomImage(url); }}
                                className="bg-zinc-900/95 hover:bg-zinc-800 text-white rounded-full p-2 border border-white/10 shadow-lg"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadImage(url, `melodio_banner_${idx + 1}.png`); }}
                                className="bg-zinc-900/95 hover:bg-zinc-800 text-blue-400 rounded-full p-2 border border-white/10 shadow-lg"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {bannerBlended && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-zinc-500 font-medium">🧬 적용된 블렌딩 프롬프트</span>
                            <button
                              onClick={() => handleCopyPrompt('banner')}
                              className="text-zinc-400 hover:text-white flex items-center gap-1 text-[9px] bg-zinc-800/40 hover:bg-zinc-800/80 px-2 py-1 rounded transition-colors border border-zinc-700/50"
                            >
                              {isBannerCopied ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400 font-semibold">복사 완료!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>프롬프트 복사</span>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="bg-black/40 p-2.5 rounded-lg text-[9px] text-zinc-400 font-mono select-all leading-normal border border-white/5">
                            {bannerBlended}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                // ─── 프로필 로고 생성기 ───
                <div className="space-y-4">
                  {/* 프로필 형식 선택 */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 font-bold">프로필 형식 선택</label>
                    <div className="grid grid-cols-3 gap-2">
                      {PROFILE_FORMATS.map((f) => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setProfileFormat(f.value)}
                          className={`text-[10px] py-2 rounded-lg font-semibold border transition-all text-center ${
                            profileFormat === f.value
                              ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                              : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 프로필 스타일 선택 */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 font-bold">프로필 스타일 선택</label>
                    <div className="grid grid-cols-3 gap-2">
                      {PROFILE_STYLES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setProfileStyle(s.value)}
                          className={`text-[10px] py-2 rounded-lg font-semibold border transition-all text-center ${
                            profileStyle === s.value
                              ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                              : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 프로필 프롬프트 입력 */}
                  <div className="space-y-2">
                    <label className="text-[11px] text-zinc-400 font-bold">프로필 묘사 프롬프트</label>
                    <textarea
                      rows={3}
                      value={profilePrompt}
                      onChange={(e) => setProfilePrompt(e.target.value)}
                      placeholder="프로필 로고 디자인 묘사..."
                      className="w-full bg-black/50 border border-white/10 rounded-xl py-2 px-3 text-white text-xs focus:border-fuchsia-500 outline-none transition-colors resize-none font-sans"
                    />
                  </div>

                  {/* 스타일 참조 이미지 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-zinc-400 font-bold">스타일 참조 이미지 (선택, 최대 3장)</label>
                      <span className="text-[10px] text-zinc-500">{profileRefImages.length}/3장</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {Array.from({ length: 3 }).map((_, index) => {
                        const hasImage = index < profileRefImages.length;
                        return hasImage ? (
                          <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-inner group">
                            <img src={profileRefImages[index]} alt={`Profile Ref ${index + 1}`} className="w-full h-full object-cover" />
                            <button
                              onClick={() => handleRemoveReferenceImageForType('profile', index)}
                              className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-black/90 text-red-400 hover:text-red-300 rounded-full p-1 text-xs w-5 h-5 flex items-center justify-center font-bold transition-all shadow"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label key={index} className="aspect-square rounded-xl border border-dashed border-zinc-700 bg-white/5 hover:bg-white/10 hover:border-zinc-500 flex flex-col items-center justify-center cursor-pointer transition-all shadow-sm">
                            <Upload className="w-4 h-4 text-zinc-400" />
                            <span className="text-[8px] text-zinc-500 mt-1 font-bold">업로드</span>
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              onChange={(e) => handleFileChangeForType('profile', e)}
                              className="hidden"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* 생성 버튼 */}
                  <button
                    onClick={() => handleGenerateImageForType('profile')}
                    disabled={isGeneratingProfile}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:scale-[1.01] py-3 rounded-xl transition-all disabled:opacity-50"
                  >
                    {isGeneratingProfile ? (
                      <>
                        <Sparkles className="w-4 h-4 text-indigo-300 animate-spin" />
                        <span>프로필 이미지 생성 중...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-indigo-300" />
                        <span>AI 프로필 생성하기</span>
                      </>
                    )}
                  </button>

                  {/* 프로필 생성 결과 */}
                  {profileUrls.length > 0 && (
                    <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1.5">
                            <span>✨ 프로필 생성 완료!</span>
                          </span>
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] px-1.5 py-0.5 rounded font-mono font-semibold w-fit">
                            채널 프로필 최적화: 1024x1024 (1:1)
                          </span>
                        </div>
                        <button
                          onClick={() => handleDownloadAll('profile')}
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[10px] bg-blue-600/10 hover:bg-blue-600/20 px-2.5 py-1.5 rounded-lg border border-blue-500/20 transition-all font-medium"
                        >
                          <Download className="w-3 h-3" />
                          전체 다운로드
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {profileUrls.map((url, idx) => (
                          <div 
                            key={idx} 
                            className="group relative aspect-square w-full rounded-xl overflow-hidden border border-white/5 bg-black/60 flex items-center justify-center cursor-zoom-in"
                            onClick={() => setActiveZoomImage(url)}
                          >
                            <img src={url} alt={`Generated Profile ${idx + 1}`} className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
                              <button
                                onClick={(e) => { e.stopPropagation(); setActiveZoomImage(url); }}
                                className="bg-zinc-900/95 hover:bg-zinc-800 text-white rounded-full p-2 border border-white/10 shadow-lg"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadImage(url, `melodio_profile_${idx + 1}.png`); }}
                                className="bg-zinc-900/95 hover:bg-zinc-800 text-blue-400 rounded-full p-2 border border-white/10 shadow-lg"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {profileBlended && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-zinc-500 font-medium">🧬 적용된 블렌딩 프롬프트</span>
                            <button
                              onClick={() => handleCopyPrompt('profile')}
                              className="text-zinc-400 hover:text-white flex items-center gap-1 text-[9px] bg-zinc-800/40 hover:bg-zinc-800/80 px-2 py-1 rounded transition-colors border border-zinc-700/50"
                            >
                              {isProfileCopied ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400 font-semibold">복사 완료!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>프롬프트 복사</span>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="bg-black/40 p-2.5 rounded-lg text-[9px] text-zinc-400 font-mono select-all leading-normal border border-white/5">
                            {profileBlended}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                )}
              </div>
              
              {(bannerUrls.length === 0 || profileUrls.length === 0) && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs p-3.5 rounded-xl flex flex-col gap-1.5 mb-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
                    <span className="font-bold">채널 디자인 비주얼 키트 필수 제작 안내</span>
                  </div>
                  <span className="leading-relaxed text-[11px] text-zinc-400">
                    채널 비주얼 구축을 위해 배너와 프로필을 각각 최소 1개 이상 생성하거나 업로드하셔야 다음 스케줄 설정 단계로 이동할 수 있습니다.
                    {bannerUrls.length === 0 && <span className="block text-[10px] text-rose-400 mt-1">• 채널 배너(16:9)가 생성되거나 업로드되지 않았습니다.</span>}
                    {profileUrls.length === 0 && <span className="block text-[10px] text-rose-400 mt-1">• 프로필 로고(1:1)가 생성되거나 업로드되지 않았습니다.</span>}
                  </span>
                </div>
              )}
              
              <div className="flex justify-between items-center pt-2">
                {activeBrandSubTab === 'banner' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCurrentWizardStep(4)}
                      className="px-5 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold rounded-xl text-zinc-300 transition-all"
                    >
                      이전 단계 (브랜드 기획)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveBrandSubTab('profile')}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-xl text-white shadow-[0_0_10px_rgba(79,70,229,0.3)] transition-all"
                    >
                      다음 단계 (프로필 로고 제작)
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveBrandSubTab('banner')}
                      className="px-5 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold rounded-xl text-zinc-300 transition-all"
                    >
                      이전 단계 (채널 배너 제작)
                    </button>
                    <button
                      type="button"
                      disabled={bannerUrls.length === 0 || profileUrls.length === 0}
                      onClick={() => setCurrentWizardStep(6)}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-xl text-white disabled:opacity-30 disabled:pointer-events-none shadow-[0_0_10px_rgba(79,70,229,0.3)] transition-all"
                    >
                      다음 단계 (스케줄 설정)
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </>
    )}
  </div>
)}

        {/* ─── 상시 썸네일 메이커 탭 ─── */}
        {activeMainTab === 'thumbnail' && (
          <div className="w-full">
            {/* AI 비주얼 크리에이터 2: 상시 썸네일 메이커 (수시 생성) */}
            <div className="section-card bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-sm">상시 썸네일 메이커 (개별 생성)</h3>
                </div>
                <span className="text-[10px] text-fuchsia-400 font-bold border border-fuchsia-400/30 bg-fuchsia-400/10 px-1.5 py-0.5 rounded animate-pulse">
                  상시 이용 가능
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed">
                업로드용 동영상 썸네일(16:9)을 수시로 개별 제작합니다. 플레이리스트별 감성에 맞춰 텍스트 레이아웃과 빈티지/실사 필터를 손쉽게 조합해 보세요.
              </p>

              {/* 작업할 채널 컨셉 프리셋 선택 */}
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-400 font-bold flex items-center gap-1.5">
                  <Pin className="w-3.5 h-3.5 text-indigo-400 animate-pulse" /> 작업할 채널 컨셉 프리셋 선택
                </label>
                
                {(() => {
                  const allPresetsList = [...customPresets, ...dbPresets, ...presets];
                  const connectedPreset = selectedPresetId ? allPresetsList.find(p => p.id === selectedPresetId) : null;
                  
                  const isConnectedActive = connectedPreset && thumbnailPresetId === connectedPreset.id;
                  const isGeneralActive = [...dbPresets, ...presets].some(p => p.id === thumbnailPresetId);
                  const isCustomActive = customPresets.some(p => p.id === thumbnailPresetId);

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* 1. 연동 채널 프리셋 */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-zinc-500 font-bold flex items-center gap-1">
                          🔗 연동 채널 프리셋
                        </span>
                        <select
                          value={isConnectedActive ? thumbnailPresetId : ""}
                          onChange={(e) => setThumbnailPresetId(e.target.value)}
                          disabled={!connectedPreset}
                          className="w-full bg-black/50 border border-white/10 rounded-xl py-2 px-3 text-white text-xs focus:border-fuchsia-500 outline-none transition-colors font-sans disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="">-- 선택 안 함 --</option>
                          {connectedPreset && (
                            <option value={connectedPreset.id}>
                              {connectedPreset.emoji} {connectedPreset.name} (연동 중)
                            </option>
                          )}
                        </select>
                      </div>

                      {/* 2. 일반 프리셋 */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-zinc-500 font-bold flex items-center gap-1">
                          🎵 일반 프리셋 (DB 동기화)
                        </span>
                        <select
                          value={isGeneralActive ? thumbnailPresetId : ""}
                          onChange={(e) => setThumbnailPresetId(e.target.value)}
                          className="w-full bg-black/50 border border-white/10 rounded-xl py-2 px-3 text-white text-xs focus:border-fuchsia-500 outline-none transition-colors font-sans"
                        >
                          <option value="">-- 선택 안 함 --</option>
                          {[...dbPresets, ...presets].map((pr) => (
                            <option key={pr.id} value={pr.id}>
                              {pr.emoji} {pr.name} {pr.isDb ? '(일반)' : '(기본)'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 3. 나만의 프리셋 */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-zinc-500 font-bold flex items-center gap-1">
                          ⭐ 나만의 프리셋 (개별 저장)
                        </span>
                        <select
                          value={isCustomActive ? thumbnailPresetId : ""}
                          onChange={(e) => setThumbnailPresetId(e.target.value)}
                          className="w-full bg-black/50 border border-white/10 rounded-xl py-2 px-3 text-white text-xs focus:border-fuchsia-500 outline-none transition-colors font-sans"
                        >
                          <option value="">-- 선택 안 함 --</option>
                          {customPresets.map((pr) => (
                            <option key={pr.id} value={pr.id}>
                              {pr.emoji} {pr.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 썸네일 형식 선택 */}
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-400 font-bold">썸네일 형식 선택</label>
                <div className="grid grid-cols-3 gap-2">
                  {THUMBNAIL_FORMATS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setThumbnailFormat(f.value)}
                      className={`text-[10px] py-2 rounded-lg font-semibold border transition-all text-center ${
                        thumbnailFormat === f.value
                          ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                          : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 썸네일 스타일 선택 */}
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-400 font-bold">썸네일 스타일 선택</label>
                <div className="grid grid-cols-2 gap-2">
                  {THUMBNAIL_STYLES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setThumbnailStyle(s.value)}
                      className={`text-[10px] py-2 rounded-lg font-semibold border transition-all text-center ${
                        thumbnailStyle === s.value
                          ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                          : 'border-zinc-700/80 bg-zinc-800/40 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 썸네일 프롬프트 입력 */}
              <div className="space-y-2">
                <label className="text-[11px] text-zinc-400 font-bold">썸네일 묘사 프롬프트</label>
                <textarea
                  rows={3}
                  value={thumbnailPrompt}
                  onChange={(e) => setThumbnailPrompt(e.target.value)}
                  placeholder="예: A quiet room with a window showing soft rain at night, warm lamp glowing on desk..."
                  className="w-full bg-black/50 border border-white/10 rounded-xl py-2 px-3 text-white text-xs focus:border-fuchsia-500 outline-none transition-colors resize-none font-sans"
                />
              </div>

              {/* 스타일 참조 이미지 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-zinc-400 font-bold">스타일 참조 이미지 (선택, 최대 3장)</label>
                  <span className="text-[10px] text-zinc-500">{thumbnailRefImages.length}/3장</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, index) => {
                    const hasImage = index < thumbnailRefImages.length;
                    return hasImage ? (
                      <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-inner group">
                        <img src={thumbnailRefImages[index]} alt={`Thumbnail Ref ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleRemoveReferenceImageForType('thumbnail', index)}
                          className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-black/90 text-red-400 hover:text-red-300 rounded-full p-1 text-xs w-5 h-5 flex items-center justify-center font-bold transition-all shadow"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label key={index} className="aspect-square rounded-xl border border-dashed border-zinc-700 bg-white/5 hover:bg-white/10 hover:border-zinc-500 flex flex-col items-center justify-center cursor-pointer transition-all shadow-sm">
                        <Upload className="w-4 h-4 text-zinc-400" />
                        <span className="text-[8px] text-zinc-500 mt-1 font-bold">업로드</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={(e) => handleFileChangeForType('thumbnail', e)}
                          className="hidden"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 생성 버튼 */}
              <button
                onClick={() => handleGenerateImageForType('thumbnail')}
                disabled={isGeneratingThumbnail}
                className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:scale-[1.01] py-3 rounded-xl transition-all disabled:opacity-50"
              >
                {isGeneratingThumbnail ? (
                  <>
                    <Sparkles className="w-4 h-4 text-indigo-300 animate-spin" />
                    <span>썸네일 이미지 생성 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-indigo-300" />
                    <span>AI 썸네일 생성하기</span>
                  </>
                )}
              </button>

              {/* 썸네일 생성 결과 */}
              {thumbnailUrls.length > 0 && (
                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1.5">
                        <span>✨ 썸네일 생성 완료!</span>
                      </span>
                      <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[8px] px-1.5 py-0.5 rounded font-mono font-semibold w-fit">
                        동영상 썸네일 최적화: 1792x1024 (16:9)
                      </span>
                    </div>
                    <button
                      onClick={() => handleDownloadAll('thumbnail')}
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[10px] bg-blue-600/10 hover:bg-blue-600/20 px-2.5 py-1.5 rounded-lg border border-blue-500/20 transition-all font-medium"
                    >
                      <Download className="w-3 h-3" />
                      전체 다운로드
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {thumbnailUrls.map((url, idx) => (
                      <div 
                        key={idx} 
                        className="group relative aspect-video w-full rounded-xl overflow-hidden border border-white/5 bg-black/60 flex items-center justify-center cursor-zoom-in"
                        onClick={() => setActiveZoomImage(url)}
                      >
                        <img src={url} alt={`Generated Thumbnail ${idx + 1}`} className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveZoomImage(url); }}
                            className="bg-zinc-900/95 hover:bg-zinc-800 text-white rounded-full p-2 border border-white/10 shadow-lg"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadImage(url, `melodio_thumbnail_${idx + 1}.png`); }}
                            className="bg-zinc-900/95 hover:bg-zinc-800 text-blue-400 rounded-full p-2 border border-white/10 shadow-lg"
                            title="다운로드"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePinAsStyleReference(url); }}
                            className="bg-zinc-900/95 hover:bg-zinc-800 text-fuchsia-400 hover:text-fuchsia-300 rounded-full p-2 border border-white/10 shadow-lg"
                            title="이 이미지를 현재 프리셋의 스타일 참조 이미지로 고정하기"
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {thumbnailBlended && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-zinc-500 font-medium">🧬 적용된 블렌딩 프롬프트</span>
                        <button
                          onClick={() => handleCopyPrompt('thumbnail')}
                          className="text-zinc-400 hover:text-white flex items-center gap-1 text-[9px] bg-zinc-800/40 hover:bg-zinc-800/80 px-2 py-1 rounded transition-colors border border-zinc-700/50"
                        >
                          {isThumbnailCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400 font-semibold">복사 완료!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>프롬프트 복사</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="bg-black/40 p-2.5 rounded-lg text-[9px] text-zinc-400 font-mono select-all leading-normal border border-white/5">
                        {thumbnailBlended}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── 최근 오토파일럿 가동 로그 탭 ─── */}
        {activeMainTab === 'logs' && (
          <div className="w-full">
            {/* 2. 자동화 히스토리 로그 */}
            <div className="section-card bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                <FileText className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">최근 오토파일럿 가동 로그</h3>
              </div>

              {logs.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-600">
                  아직 자동화 업로드 가동 이력이 존재하지 않습니다.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {logs.map((log) => {
                    const isSuccess = log.status === 'success'
                    const isFailed = log.status === 'failed'
                    return (
                      <div key={log.id} className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col justify-between gap-1 text-[10px]">
                        <div className="flex items-center justify-between">
                          <span className={`font-bold px-1.5 py-0.5 rounded text-[8px] uppercase ${
                            isSuccess 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : isFailed 
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                          }`}>
                            {log.status}
                          </span>
                          <span className="text-zinc-500 font-mono">
                            {new Date(log.started_at).toLocaleString()}
                          </span>
                        </div>
                        {isSuccess && log.youtube_video_id && (
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-zinc-400">유튜브 업로드 완료:</span>
                            <a 
                              href={`https://youtu.be/${log.youtube_video_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:underline font-mono"
                            >
                              youtu.be/{log.youtube_video_id}
                            </a>
                          </div>
                        )}
                        {isFailed && log.error_message && (
                          <div className="mt-1 text-red-400/90 leading-tight">
                            에러: {log.error_message}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── 유튜브 연동 관리 탭 ─── */}
        {activeMainTab === 'channels' && (
          <div className="space-y-6 animate-fadeIn w-full">
            <div className="section-card bg-zinc-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <YoutubeIcon className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">유튜브 연동 채널 관리</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">멜로디오와 연동된 내 유튜브 채널 목록입니다.</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainTab('builder')
                    setShowAddChannelForm(true)
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-xs font-bold rounded-xl text-white shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all flex items-center gap-1.5 self-start sm:self-auto"
                >
                  ➕ 신규 채널 연동하기
                </button>
              </div>

              {allChannels.length === 0 ? (
                <div className="text-center py-12 bg-white/5 border border-dashed border-zinc-800 rounded-2xl space-y-4">
                  <p className="text-sm text-zinc-400">현재 연동된 유튜브 채널이 없습니다.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMainTab('builder')
                      setShowAddChannelForm(true)
                    }}
                    className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-bold rounded-xl text-white transition-all"
                  >
                    첫 번째 유튜브 채널 연동하러 가기
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allChannels.map((ch) => {
                    const isActive = channel?.channel_id === ch.channel_id
                    return (
                      <div 
                        key={ch.channel_id}
                        className={`p-5 rounded-2xl border transition-all flex flex-col justify-between h-40 ${
                          isActive 
                            ? 'bg-gradient-to-br from-indigo-950/20 to-zinc-900/60 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.05)]' 
                            : 'bg-zinc-950/20 border-white/5 hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-10 h-10 rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center shrink-0">
                              <YoutubeIcon className="w-5 h-5 text-red-500" />
                            </div>
                            <div className="text-left overflow-hidden">
                              <h4 className="font-bold text-sm text-white truncate max-w-[160px]">{ch.channel_title}</h4>
                              <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">ID: {ch.channel_id}</p>
                            </div>
                          </div>

                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            isActive 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700/50'
                          }`}>
                            {isActive ? '관리 중' : '대기'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
                          <button
                            type="button"
                            onClick={() => {
                              fetchSettings(ch.channel_id)
                              setActiveMainTab('builder')
                            }}
                            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all text-center"
                          >
                            이 채널 관리하기
                          </button>
                          
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`정말로 '${ch.channel_title}' 채널 연동을 해제하시겠습니까? 관련 자율운영 설정도 함께 삭제됩니다.`)) return
                              try {
                                const res = await fetch('/api/autopilot/settings', {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ channelId: ch.channel_id })
                                })
                                const data = await res.json()
                                if (data.success) {
                                  alert('성공적으로 연동이 해제되었습니다.')
                                  fetchSettings() // Reload channels & settings
                                } else {
                                  alert(data.error || '연동 해제 실패')
                                }
                              } catch (e) {
                                console.error(e)
                              }
                            }}
                            className="px-3 py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/40 text-red-400 rounded-xl text-xs font-bold transition-all flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox 확대 모달 */}
      {activeZoomImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm transition-all duration-200 cursor-zoom-out"
          onClick={() => setActiveZoomImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img 
              src={activeZoomImage} 
              alt="Zoomed Reference" 
              className="rounded-xl max-w-full max-h-[90vh] object-contain shadow-2xl border border-white/10" 
            />
            <button 
              className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 border border-white/10 transition-colors"
              onClick={() => setActiveZoomImage(null)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

export default function AutopilotPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6 text-white w-full font-sans animate-pulse">
        {/* ─── 대시보드 헤더 ─── */}
        <div className="flex items-center gap-4 border-b border-white/5 pb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-600 to-indigo-600 flex items-center justify-center">
            <Radio className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">YouTube Auto-Pilot</h2>
            <p className="text-sm text-zinc-400 mt-1">설정 및 자산을 로드하고 있습니다...</p>
          </div>
        </div>
        <div className="text-center py-20 text-zinc-500 text-sm">
          설정 및 자산을 로드하고 있습니다...
        </div>
      </div>
    }>
      <AutopilotContent />
    </Suspense>
  )
}
