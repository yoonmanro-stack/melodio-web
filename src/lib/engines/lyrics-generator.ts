/**
 * Melodio — GPT-5.5-pro 기반 가사, 제목, 태그 및 10곡 플레이리스트 생성 엔진
 */

import type { LyricsSection, LyricsSectionType } from '@/types'
import type { PlaylistGeneratorResult, PlaylistTrack } from '@/types/playlist'
import { matchPlaybooksByPrompt } from '@/lib/db/knowledge'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

import { loadVLEMasterPrompt } from '@/lib/vle/vleEngine';

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
function randomizeStylePrompt(baseStyle: string): string {
  const keys = ['A minor', 'C major', 'E minor', 'G major', 'D minor', 'F major', 'B minor', 'A major', 'E major', 'D major', 'G# minor', 'F# minor'];
  const randomKey = keys[Math.floor(Math.random() * keys.length)];

  let bpm = 90;
  const baseLower = baseStyle.toLowerCase();
  if (baseLower.includes('lo-fi') || baseLower.includes('lofi') || baseLower.includes('zen') || baseLower.includes('meditation')) {
    bpm = Math.floor(Math.random() * 15) + 70; // 70-85 BPM
  } else if (baseLower.includes('future') || baseLower.includes('funk') || baseLower.includes('rock') || baseLower.includes('pop') || baseLower.includes('anime')) {
    bpm = Math.floor(Math.random() * 25) + 110; // 110-135 BPM
  } else {
    bpm = Math.floor(Math.random() * 25) + 80; // 80-105 BPM
  }

  const textures = [
    'vintage vinyl crackle',
    'warm analog tape saturation',
    'valve preamp warmth',
    'spacious room reverb',
    'subtle cassette tape hiss',
    'warm hardware chorus',
    'dreamy stereo delay'
  ];
  const randomTexture = textures[Math.floor(Math.random() * textures.length)];

  const instruments = [
    'warm Fender Rhodes chords',
    'plucky acoustic guitar accents',
    'dreamy analog synth swells',
    'DX7 style bell highlights',
    'jazzy electric bass accents',
    'soft shaker percussion',
    'classic vintage synth leads',
    'clean stratocaster plucks',
    'smooth saxophone riffs'
  ];
  const randomInstrument = instruments[Math.floor(Math.random() * instruments.length)];

  const suffix = `key of ${randomKey}, ${bpm} BPM, ${randomTexture}, featuring ${randomInstrument}`;
  return `${baseStyle}, ${suffix}`.trim();
}

export async function generateLyrics(
  params: GenerateLyricsParams
): Promise<(LyricsGeneratorResult | PlaylistGeneratorResult) & { stylePrompt?: string }> {
  const isPlaylist = !!params.isPlaylistMode
  const trackCount = params.trackCount ?? 10
  
  // Randomize style tags to ensure different production results
  const randomizedStylePrompt = randomizeStylePrompt(params.stylePrompt)
  // Unique seed to force the LLM to write distinct lyrics and titles
  const seed = Math.random().toString(36).substring(2, 10)

  if (!OPENAI_API_KEY) {
    console.log(`[Lyrics Generator] API Key 미검출로 Mock ${isPlaylist ? '플레이리스트' : '단일 가사'}를 생성합니다.`);
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
    languageInstruction = 'a mix of Japanese and English (typically Japanese verses/lines mixed naturally with catchy English hooks/phrases in the chorus or transition sections, like modern J-Pop/J-Rock)'
  } else if (params.language === 'ko-en') {
    languageInstruction = 'a mix of Korean and English (typically Korean verses/lines mixed naturally with catchy English hooks/phrases in the chorus or transition sections, like modern K-Pop)'
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
    ? getPlaylistSystemPrompt(randomizedStylePrompt, params.topic, trackCount, languageInstruction, params.vocalGender, playbookInstructions)
    : getSingleSystemPrompt(randomizedStylePrompt, params.topic, languageInstruction, params.vocalGender, playbookInstructions, params.durationSeconds, params.viralMode)

  const userPrompt = isPlaylist
    ? `Generate a full ${trackCount}-track playlist curation and song details for the style: ${randomizedStylePrompt}.
${params.topic ? `Playlist Theme: ${params.topic}` : ''}
Language: ${languageInstruction}
Vocal Target: ${params.vocalGender || 'mixed'}
Random seed token for absolute uniqueness: ${seed}. You MUST write a completely unique, original set of lyrics and titles compared to previous calls.`
    : `Generate title, tags, hashtags, and structured lyrics for a single song with style: ${randomizedStylePrompt}.
${params.topic ? `Topic/Theme: ${params.topic}` : ''}
Language: ${languageInstruction}
Vocal Target: ${params.vocalGender || 'mixed'}
Random seed token for absolute uniqueness: ${seed}. You MUST write a completely unique, original set of lyrics and titles compared to previous calls.`

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
            temperature: 0.7,
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
  viralMode?: boolean
): string {
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

  // Duration에 따른 가사 구조 및 분량 지시 (Short-form, Mid-form, Long-form 정밀 스케일링)
  let durationStructureInstruction = ''
  if (targetDuration <= 15) {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION RULE — TARGET: ${targetDuration} SECONDS (Ultra Short-form)
Suno AI determines song length by the amount of lyrics. You MUST generate EXACTLY this structure:
1. Intro (type: "intro") - 1 line (NO separate intro section, vocal starts immediately, e.g. [Fast Intro] or [Shout])
2. Hook/Chorus (type: "chorus") - 2 lines MAX (highly punchy, memorable, containing the brand name or main theme)
3. Outro (type: "outro") - 1 line MAX`
  } else if (targetDuration <= 30) {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION & COST RULE — TARGET: 26 TO 29.5 SECONDS (STRICT 30.0s MAXIMUM LIMIT)
Suno AI determines song length by lyrics length. To land strictly inside the 26.0s to 29.5s sweet spot (NEVER exceeding 30.0 seconds to prevent extra billing), generate this exact structure:
1. Intro (type: "intro") - 1 short line (instant vocal start or spoken intro)
2. Verse 1 (type: "verse") - 3 lines (describing crisis with concise Korean nouns)
3. Chorus (type: "chorus") - 3 lines (punchy repetitive main theme)
4. Outro (type: "outro") - 1 line (short funny finish & fade out)

Total lyrics: 8 lines. Keep total character count strictly between 220 and 255 characters so Suno composes a track finishing strictly between 26.0s and 29.5s.`
  } else if (targetDuration <= 60) {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION RULE — TARGET: ${targetDuration} SECONDS (Mid-form / TikTok Song)
Suno AI determines song length by the amount of lyrics. You MUST generate EXACTLY this structure:
1. Intro (type: "intro") - 1-2 lines
2. Verse 1 (type: "verse") - 4 lines (scene setting)
3. Chorus (type: "chorus") - 4 lines (main hook)
4. Verse 2 (type: "verse") - 2-3 lines (variation)
5. Chorus repeat (type: "chorus") - 4 lines (intensified hook)
6. Outro (type: "outro") - 1-2 lines (use [Outro] [Fade out])

Total lyrics: 15-18 lines.`
  } else if (targetDuration <= 120) {
    durationStructureInstruction = `
## 🚨 CRITICAL DURATION RULE — TARGET: ${targetDuration} SECONDS (Compact 2 Minutes)
You MUST generate EXACTLY this structure to target 2:00 to 2:30 minutes of audio:
1. Intro (type: "intro") - 1-2 lines
2. Verse 1 (type: "verse") - 4 lines
3. Chorus (type: "chorus") - 4 lines (main hook)
4. Verse 2 (type: "verse") - 4 lines
5. Chorus (type: "chorus") - 4 lines
6. Outro (type: "outro") - 1-2 lines ([Outro] [Fade out])

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
You MUST generate a full extended structure to fill the timeline:
1. Intro (type: "intro") - 2 lines
2. Verse 1 (type: "verse") - 4 lines
3. Pre-Chorus (type: "pre-chorus") - 3 lines
4. Chorus (type: "chorus") - 4 lines
5. Verse 2 (type: "verse") - 4 lines
6. Pre-Chorus (type: "pre-chorus") - 3 lines
7. Chorus (type: "chorus") - 4 lines
8. Bridge/Guitar Solo (type: "bridge") - 4 lines (high-energy instrumental solo or vocal peak)
9. Chorus (type: "chorus") - 4 lines
10. Final Chorus (type: "chorus") - 4 lines (powerful variations/ad-libs)
11. Outro (type: "outro") - 2 lines (long instrumental fade out)

Total lyrics: 34-40 lines.`
  }

  // 가사 문학성 및 고도화 지침
  const lyricsQualityRules = `
## 📝 LYRICS WRITING QUALITY RULES (CLICHÉ BAN & RHYTHM SHIFT):
1. **CLICHÉ BAN (진부함 배제)**: Do NOT use abstract words to describe emotions (e.g., '슬프다', '그립다', '사랑한다', '외롭다'). Instead, use concrete visual objects, sensory details, or physical metaphors (e.g., '식어버린 커피 자국', '먼지 쌓인 노란 우산', '어스름한 가로등 아래'). Let the listener SEE the scene.
2. **RHYTHM & MELODY SHIFT**: Create a clear stylistic contrast between sections. 
   - **Verses** should have longer, narrative sentences that flow like a story.
   - **Pre-Choruses** should have ascending, shorter sentences to build suspense.
   - **Choruses** MUST have highly rhythmic, punchy, syncopated short phrases (e.g. repetitive hooks) that stick in the brain. This forces Suno AI to make a dramatic melody shift.
3. **AI STRUCTURAL CUES**: Use Suno-optimized arrangement cues inside the "description" field of sections (e.g., '[Drop]', '[Build-up]', '[Silence]', '[Epic Chorus Drop]', '[Bridge Climax]', '[Acoustic Guitar Solo]', '[Fade Out]').`

  // VLE 5.0 마스터 옵시디언 파일 직접 읽어오기
  const vleMasterMarkdown = loadVLEMasterPrompt();

  let viralModeInstruction = ''
  if (viralMode) {
    viralModeInstruction = `
${vleMasterMarkdown}

## ⚡ VIRAL SHORT-FORM B-GRADE SAVAGE COMEDY GOLDEN RULES (VLE 5.0 DIRECT OBSIDIAN EXECUTION):
1. Execute the 10-step pipeline in order: TOPIC -> HOOK -> CORE RULES -> GENERATOR -> LYRICS SCHEMA -> CRITIC (≥95 SCORE APPROVAL).
2. Spoken Intro MUST be a 1-sentence shock/curiosity statement (6-14 syllables). NO generic intro statements!
3. Visual Verse MUST be 2 lines with proper Korean spacing and visible physical objects (카메라 촬영 가능 시각 객체).
4. Tag Outro MUST be 1 comment-provoking line with Meme Token. NEVER use cliché lines like "다음엔 더 놀라운 상황이!".`
  }

  // 사용자 정의 지침 및 특정 문구 필수 포함 처리
  const customUserDirectives = `
## 🎯 CUSTOM USER DIRECTIVES & PRECISE INCLUSION RULES:
If the theme/topic contains specific user instructions, custom lyrics, phrases in quotes, or musical preferences:
1. **Verbatim Phrase Inclusion**: If the user has requested to include a specific phrase or sentence (especially if enclosed in quotes like "내가 널 버릴거야~" or '내가 널 버릴거야~'), you MUST strictly and verbatim include this exact phrase/sentence inside the generated lyrics (e.g. in the chorus or verse). Do not modify the words or spelling of the quoted text.
2. **Style & Vocal Adjustment**: If the user requests musical, vocal, or performance adjustments (e.g., "보컬을 최대한 강조해줘", "vocal focus", "clear delivery", "acoustic backing only"), you MUST strictly reflect this in the song's structural descriptions (e.g., specify "dry intimate vocals close to mic, minimal backing instrument" or "vocal-centric mix, crystal clear voice" in the sections' description fields and the overall lyricsPrompt cues).
3. **Contextual Alignment**: Ensure the entire narrative of the song naturally revolves around or leads up to the user's custom instructions/situations.`

  if (viralMode) {
    return `You are a legendary viral content creator and CM-song (CF) director specializing in addictive, meme-worthy, high-dopamine short-form songs for YouTube Shorts, TikTok, and corporate advertisements.
${genderInstruction}
${viralModeInstruction}
${durationStructureInstruction}
${lyricsQualityRules}
${customUserDirectives}

## 🚨 VOCAL CLARITY ENFORCEMENT:
Since the humor and message of the viral parody/CF rely 100% on the lyrics, you MUST NOT specify heavy drums, walls of guitars, or loud brass. You MUST write vocal-centric descriptions for every section (e.g. 'dry upfront vocals close to mic, minimal acoustic backing', 'vocal prominent, quiet keyboard background', 'spoken-word/rap delivery, dry close-up mic').

Your task: Generate an incredibly catchy, viral parody/CF song for the style: "${stylePrompt}".
${topic ? `The theme/topic is: "${topic}".` : ''}

You MUST write all lyrics in ${languageInstruction}.

## JSON Schema (Strict)
{
  "title": "🔥 HIGH-CTR YOUTUBE SHORTS TITLE ENGINE: You MUST construct the title by applying 1 of 4 Syntactic Structural Patterns based on the topic ('${topic || stylePrompt}'): Pattern 1: [Extreme Spoiler Bracket] + Persona + Situation, Pattern 2: Persona Call + Relatable Frustration + Suffix, Pattern 3: Exact Data Number + Tragedy/Comedy + Impact, Pattern 4: Empathy Setup + Interrogative Question. Keep it punchy and under 30 characters.",
  "youtubeTags": "comma, separated, SEO, keywords",
  "snsHashtags": "#hashtag1 #hashtag2",
  "lyricsPrompt": "STRICT SHORTS VIRAL LYRICS SCHEMA v2.0 (MUST FOLLOW 100%):\\n[Spoken Shock Intro]\\n\\\"Shocking intro quote line (no questions, e.g. 이거 안 사면 손해다)\\\"\\n\\n[Visual Verse]\\nVisual scene line 1 with rhythm onomatopoeia (e.g. 쿵! 팡! 슉! 띵!)\\nVisual scene line 2\\n\\n[Build-Up]\\nTension line 1 before chorus\\nTension line 2\\n\\n[Killer Chorus]\\nAddictive Hook Line 1 (A A / B A order repetition e.g. 살까 말까~ 살까 말까~)\\nPunchline Hook Line 2 (결국 또 샀다~ 살까 말까~)\\n\\n[Chorus Repeat]\\nAddictive Hook Line 1 repeat (for max retention)\\nAddictive Hook Line 1 repeat\\n\\n[Tag Outro]\\n\\\"Comment CTA question + Meme Token (딩동/결제완료/실화냐) + Next video tease\\\"\\n\\nCRITICAL: DO NOT use garbage tags like [Pansori Crying], [Fast Intro], [속삭임], [고음귀염], [외침], [웃음], [독백]. Focus strictly on ONE single relatable comedy situation.",
  "sections": [
    {
      "type": "intro or verse or chorus or outro",
      "content": "lyrics text",
      "description": "Suno musical instruction. You MUST write vocal-centric mix instructions here (e.g. 'vocal-centric mix, dry upfront voice close to mic, minimal backing beat, clear diction')."
    }
  ]
}

## CRITICAL: You MUST include the "lyricsPrompt" field with the COMPLETE lyrics as a single formatted string (with \\n line breaks) ready to copy-paste.
${playbookInstructions || ''}
`
  }

  return `You are a world-class, chart-topping songwriter and music producer with 15+ years of experience crafting #1 hits for major K-Pop/J-Pop artists, global indie labels, and a 1-million subscriber YouTube playlist channel. You have deep expertise in Suno AI music generation.
${genderInstruction}
${durationStructureInstruction}
${lyricsQualityRules}
${customUserDirectives}

Your task: Generate a professional-grade song package (title, SEO tags, hashtags, and structured lyrics) for the style: "${stylePrompt}".
${topic ? `The theme/topic is: "${topic}".` : ''}

You MUST write all titles, lyrics, tags, and descriptions strictly in the requested language style: "${languageInstruction}". Do NOT write or translate them in Korean if another language is requested.

## JSON Schema (Strict)
{
  "title": "🎵 INFINITE DYNAMIC PERSONA TITLE FORMULA: Target the listener's core situational need and dynamic persona in the FIRST 15 CHARACTERS. Dynamically blend [Role/Career e.g. 개발자, 트레이더, 디자이너, 고시생, 작가, 자취생, 대학원생] + [Space e.g. 원룸, 24시 라운지, 독서실 1인석, 도쿄 한밤중] + [Action/Need e.g. 새벽 버그 디버깅, 마감 30분 전, 차트 분석, 딴생각 차단 초집중]. NEVER hardcode fixed categories. NEVER include duration tags like '[2시간]'. Write strictly in ${languageInstruction}.",
  "youtubeTags": "comma, separated, SEO, keywords, 15-20 tags",
  "snsHashtags": "#hashtag1 #hashtag2 ... (10-15 hashtags for TikTok/Instagram/Shorts)",
  "sections": [
    {
      "type": "intro or verse or pre-chorus or chorus or bridge or outro",
      "content": "Pure lyrics text (newline separated). NO section tags like [Verse] inside.",
      "description": "REQUIRED: Suno-optimized musical instruction (e.g., 'Soft piano intro, vinyl crackle, rain ambience', 'Male Vocal, emotional whisper building to full belt', 'Guitar Solo, reverb-drenched')"
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
  playbookInstructions?: string
): string {
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
    genderMixRules = '\n- VOCAL GENDER RULE: You MUST make ALL tracks in the playlist for a female vocalist. Set descriptions to "female vocal" or "intimate female vocal close to mic" and strictly avoid male descriptors.'
  } else if (vocalGender === 'male') {
    genderMixRules = '\n- VOCAL GENDER RULE: You MUST make ALL tracks in the playlist for a male vocalist. Set descriptions to "male vocal" or "dry male vocal close-up" and strictly avoid female descriptors.'
  } else if (vocalGender === 'duet') {
    genderMixRules = '\n- VOCAL GENDER RULE: You MUST make ALL tracks in the playlist as male and female duets. Assign duet parts in the lyrics and specify "beautiful male and female duet harmonies" or "interplay of male and female vocals" in descriptions.'
  } else {
    // mixed (디폴트)
    genderMixRules = '\n- VOCAL GENDER RULE: To make the playlist highly dynamic, you MUST alternate and mix vocal genders across tracks. Assign "female vocal" to roughly 60% of the tracks (e.g. tracks 1, 2, 4, 6, 7, 9), "male vocal" to 30% (e.g. tracks 3, 5, 8), and "male and female duet" to 10% (e.g. track 10). Explicitly state the vocal gender (e.g. "clear expressive female vocal", "warm emotional male vocal", "beautiful male and female duet") inside the "description" field of each track\'s sections.'
  }

  return `You are a 1-million subscriber YouTuber who runs a global music playlist channel. Drawing on your deep expertise of generating thousands of tracks with Suno AI, you produce high-quality, professional playlist curations, 2-hour YouTube upload titles, and song details.
${genderMixRules}

Your task is to generate a comprehensive ${trackCount}-track playlist package based on the requested style: "${stylePrompt}".
${topic ? `The entire playlist theme/topic is: "${topic}".` : ''}

You MUST write all playlistTitles, descriptions, track titles, and lyrics strictly in the requested language style: "${languageInstruction}". Do NOT write or translate them in Korean if another language is requested.

You MUST return a JSON object matching this schema:
{
  "playlistTitle": "🎵 INFINITE DYNAMIC PERSONA TITLE FORMULA: Front-load the FIRST 15 CHARACTERS with a high-conversion SITUATIONAL & PERSONA HOOK. Dynamically blend [Role e.g. 개발자, 트레이더, 디자이너, 작가, 고시생, 자취생] + [Space e.g. 원룸, 24시 라운지, 독서실, 도쿄 한밤중] + [Action/Need e.g. 새벽 버그 디버깅, 마감 30분 전, 차트 분석, 딴생각 차단 초집중]. Examples: '💻 새벽 3시 디버깅할 때 듣는 몰입 BGM | Deep Lofi Beats', '🎨 마감 1시간 전 피그마와 씨름할 때 | Focus Beats', '📈 24시간 코인 차트 볼 때 멘탈 잡는 Lofi', '😴 생각의 스위치를 끄고 깊은 잠으로 | Sleep Rain'. NEVER hardcode static categories. NEVER include duration tags like '[2시간]'. Write strictly in ${languageInstruction}.",
  "youtubeDescription": "A warm, emotional curator comment (1-2 paragraphs) welcoming listeners, followed by a tracks timeline placeholder like: '${timelineExample}' (Please assume each track is exactly 3 minutes long and auto-calculate the cumulative timestamps up to Track ${trackCount}!)",
  "youtubeTags": "combined, playlist, tags, separated, by, commas, for, SEO",
  "snsHashtags": "#hashtag1 #hashtag2 #playlist #youtube #etc",
  "tracks": [
    {
      "trackNumber": 1,
      "title": "🎵 ELEGANT ARTISTIC TRACK TITLE FORMULA: Poetic single song title (1-4 words). NEVER use playlist hook titles or duration tags like '[2시간]'. Examples: 'Midnight Compiler (새벽의 컴파일러)', 'Coffee & Terminal', 'Bugfix Serenade', '夜の雨音', '먹빛 깃발'. Write strictly in ${languageInstruction}.",
      "youtubeTags": "lofi, tags, for, track1",
      "snsHashtags": "#track1 #lofi",
      "sections": [
        {
          "type": "intro or verse or pre-chorus or chorus or bridge or outro",
          "content": "Lyrics for this section",
          "description": "Optional detailed musical instruction, vocal cue, or instrument solo (e.g., 'Vinyl crackle', 'Male Vocal', 'Guitar Solo')"
        }
      ]
    }
  ]
}

Rules:
1. Generate exactly ${trackCount} tracks inside the "tracks" array. Each track should have unique title and lyrics fitting the style: "${stylePrompt}".
2. For each track, generate Intro, Verse 1, Pre-Chorus, Chorus, Verse 2, Pre-Chorus, Chorus, Bridge, Chorus, Outro sections. Make it fully completed (not placeholders).
3. Melody Contrast: Design Verses and Chorus with different ending rhyming patterns so that the AI vocalist shifts the vocal tone and melody dramatically.
4. Outro Control: Keep the Outro section extremely short (1-2 lines of lyrics max), and use "Fade Out" or "Instrumental Outro" in the description field to prevent ending vocal glitches/glitches.
5. In the "youtubeDescription", calculate the timelines assuming each track is 3:00 long:
${timelineRules}
${trackCount > 10 ? '   - ... up to Track ' + trackCount : ''}
6. Strictly return valid JSON. Do not wrap in markdown \`\`\`json.
7. You MUST write all titles, lyrics, tags, and descriptions strictly in the requested language: "${languageInstruction}". (Never write in Korean if English, Japanese, or a mix is requested).
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
