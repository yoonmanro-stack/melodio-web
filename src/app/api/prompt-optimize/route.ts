import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

const OFFICIAL_PRESETS_MAP: Record<string, string> = {
  'developer-debugging': 'A dark cyberpunk synthwave track designed for deep cognitive focus and backend debugging, featuring a slow-burning tension. A repetitive hypnotic 16th-note retro arpeggiated synthesizer in D minor driving the core progression. A gritty analog saw lead synth weaves a sharp cybernetic melody alongside clean, metallic pluck synths that delay in a wide stereo field. Deep vintage analog pads and drone-like bass synths swell slowly, creating a subterranean atmosphere. The rhythm section is anchored by a tight, punchy retro electronic snare, a heavy sidechained 808 kick, and crisp metallic hi-hats. Subtle mechanical keyboard brown-switch typing foley and server room air-conditioning ambient white noise are blended smoothly into the background. No vocals, purely instrumental, 105 BPM, Key of D minor, [High-fidelity studio mastering, professional grade audio]',
  'iced-oolong-tea': 'A mellow and warm lo-fi jazzhop track evoking a peaceful Sunday afternoon inside a quiet bedroom. A warm, clean acoustic guitar gently plays repetitive warm jazzy seven-chords with soft fingerpicked details and subtle slides. A deep, woody acoustic upright double bass follows the progression with a slow, laid-back syncopated groove. The drums are minimal and organic, consisting of a dusty vinyl snare on the backbeat and a quiet brushed snare pattern with crisp, warm hi-hats. Faint tea pouring foley, pages turning, soft wind chimes, and a constant warm vinyl crackle with tape hiss texture the soundstage to create an inspiring study background music. Cozy room acoustics and a nostalgic vibe, 78 BPM, instrumental only, no vocals, [High-fidelity studio mastering, professional grade audio]',
  'tokyo-midnight-1984': 'An authentic 1980s Japanese city pop track built for a late-night drive through neon-lit Tokyo. A funky, highly rhythmic slap bassline drives the energetic nostalgic groove with syncopated bass fills. Vintage analog polyphonic synthesizers play bright chord stabs and retro brass-like lead runs. A clean electric rhythm guitar adds tight, palm-muted funky strumming patterns in the background. Expressive and smooth female lead vocals are positioned front and center in the mix, dry but with vintage plate reverb. The rhythm section is dynamic, featuring a punchy acoustic snare, tight driving hi-hats, and occasional disco-style tom fills. High-fidelity nostalgic production capturing a retro tape-deck vibe, Key of E major, 115 BPM, [High-fidelity studio mastering, professional grade audio]',
  'matcha-kyoto-jazz': 'A cozy traditional Japanese cafe jazz piano track set in a quiet, rain-soaked Kyoto alleyway. A warm, vintage upright acoustic grand piano plays slow, deeply expressive jazz chords and delicate melancholic melodies. A resonant, woody double bass supports the progression with gentle acoustic slides and deep, warm low-end weight. The percussion is extremely soft, utilizing vintage brush snare techniques, a light ride cymbal pattern, and a quiet hi-hat pedal. Soft room acoustics, subtle rain on wooden windowpane sound effects, and delicate ceramic tea cup foley create a highly intimate meditative mood. Nostalgic vinyl warmth, Key of G major, 68 BPM, instrumental only, no vocals, [High-fidelity studio mastering, professional grade audio]',
  'french-vintage-chanson': 'An authentic 1950s retro French chanson capturing the romantic melancholy of a rainy Paris night. A nostalgic acoustic grand piano plays a slow, swaying 3/4 waltz rhythm. A soft, highly expressive accordion plays a longing retro melody with deep vibrato. A warm acoustic upright bass and delicate brushed snare drums support the organic arrangement. An emotional, passionate female vocal sings with intimate presence positioned extremely close to the microphone, delivering lyrics in authentic French. Heavy vintage vinyl crackle, tape hiss, and warm analog saturation recreate a cinematic old cafe ambiance. Nostalgic and poetic mood, Key of A minor, 85 BPM, [High-fidelity studio mastering, professional grade audio]',
  'deep-sleep-drift': 'A deep sleep ambient soundscape designed to calm the mind and ease into sleep. A celestial, ultra-warm analog synthesizer pad swells slowly in and out with extremely long attack and release times. A gentle, resonant harp arpeggio plays highly repetitive, peaceful acoustic melodies. Ethereal, whispering soft female vocal chops float in a wide three-dimensional stereo field with lush hall reverb. Soft rain sounds on a glass window, ocean waves, and a low-frequency binaural beats simulation create a safe, cozy, and comforting sleeping environment. Zero rhythm, no drums, no sharp transients, extremely slow tempo, 45 BPM, instrumental only, [High-fidelity studio mastering, professional grade audio]',
  'dead-mall-nostalgia': 'A nostalgic 1990s mallsoft and vaporwave track with a modern twist, blending liquid drum & bass and dreamy UK garage beats. Capturing the eerie and comforting atmosphere of an empty, abandoned shopping mall. A slow-to-medium tempo breakbeat drum pattern, featuring a dreamy retro DX7 electric piano playing smooth jazz chords. A distant, muted nostalgic saxophone melody echoes with extreme stereo delay and a massive hall reverb, simulating a vast, hollow concrete atrium. The track is saturated with authentic VHS tape flutter, low-fidelity tape hiss, and subtle background ambient sounds like faint distant water fountain trickles and muffled footsteps. Calming, melancholic, and deeply liminal, 120 BPM, key of F major, instrumental with ethereal female vocal chops, [High-fidelity studio mastering, professional grade audio]',
  'joseon-hip-hop': 'Joseon hip hop, gugak fusion rap, traditional Korean instruments, gayageum pluck, daegeum flute, heavy boom bap beat, epic brass, raw expressive rap, East Asian scale, key of E minor, 85 BPM, spacious room reverb, featuring warm Fender Rhodes chords, [High-fidelity studio mastering, professional grade audio], key of A major, 102 BPM, subtle cassette tape hiss, featuring smooth saxophone riffs, 혼성 보컬, 판소리식 꺾기와 멜로딕 훅, 웅장한 브라스 스탭'
}

const SYSTEM_PROMPT = `You are a professional music producer and prompt engineering expert for "Suno v5.5 Pro".
Your task is to transform the user's natural language music description into an exceptionally high-quality, professional "Style Prompt" of 800–950 characters optimized specifically for the "Style of Music" field.

RULES:
1. Combine dense STATE-DRIVEN and TEXTURAL natural descriptions (e.g., "driven by a soft accordion", "delivering a warm vinyl texture") with highly specific musical TAGS.
2. Structure the prompt clearly in this logical sequence:
   - [Core Genre & Primary Mood]: Lead with the main genre and mood, incorporating authentic era/decade markers if vintage (e.g., "1950s 1960s authentic retro French chanson, melancholic and elegant").
   - [Vocal Signal & Presence]: Explicitly state vocal features, position, mic intimacy, and language (e.g., "clear expressive female vocal, intimate vocal close to mic, lyrics sung in French").
   - [Detailed Instrumentation & State]: List acoustic or electric instruments, tempo, and rhythm patterns using adjectives (e.g., "soft accordion melody, warm grand piano chords, acoustic upright bass, delicate brushed drums, slow 3/4 waltz rhythm").
   - [Atmosphere & Emotion]: Specify emotional textures, sonic soundscapes, and themes (e.g., "vintage romantic Paris night atmosphere, cinematic old cafe ambience, nostalgic and poetic mood").
   - [Mastering & Mixing Texture]: Add analog/digital qualities, micro-noise details, and era-appropriate textures (e.g., "retro analog mastering, warm vinyl texture, lo-fi hiss and crackle").
   - [Negative Filters]: Conclude with compatible negative tags to avoid modern noise pollution (e.g., "no instrumental-only, no EDM, no rap, no modern pop, no autotune, no electronic synths, no electric guitar, no famous artist imitation").

SPECIAL GENRE RULE FOR JOSEON HIP HOP / KOREAN GUGAK FUSION:
If the input mentions "Joseon", "Gugak", "조선", "국악", or Korean traditional fusion hip-hop/rap:
- You MUST preserve: "Joseon hip hop, gugak fusion rap, traditional Korean instruments, gayageum pluck, daegeum flute, heavy boom bap beat, epic brass, raw expressive rap, East Asian scale, 판소리식 꺾기와 멜로딕 훅, 웅장한 브라스 스탭".
- NEVER add negative filters like "no rap", "no modern trap", "no 808 bass", "no electronic instruments" to hip-hop prompts!

3. MANDATORY SUFFIX: You MUST append the exact mastering tag "[High-fidelity studio mastering, professional grade audio]" to the very end.
4. Output ONLY the raw prompt in English. Keep it under 950 characters.

Reference Quality Goal:
1950s 1960s authentic retro French chanson, melancholic and elegant, vintage romantic Paris night atmosphere, clear expressive female vocal, intimate vocal close to mic, lyrics sung in French, cinematic old cafe ambience, slow 3/4 waltz rhythm, traditional acoustic instrumentation, soft accordion melody, warm grand piano chords, acoustic upright bass, delicate brushed drums, emotional passionate chorus, nostalgic and poetic mood, retro analog mastering, warm vinyl texture, lo-fi hiss and crackle, no instrumental-only, no EDM, no rap, no modern pop, no autotune, no electronic synths, no electric guitar, no famous artist imitation, [High-fidelity studio mastering, professional grade audio]`

const SYSTEM_PROMPT_VIRAL = `You are a professional music producer specializing in creating viral TikTok/Shorts parody songs and TV commercial jingles on "Suno v5.5 Pro".
Your task is to transform the user's natural language music description into a highly optimized, descriptive "Style Prompt" of 250–350 characters.

RULES:
1. Write in a highly descriptive, natural language style (e.g., "driven by bouncy retro synth stabs", "delivering a witty comical tone").
2. STRICT SEQUENCE:
   - You MUST place the vocal prominence, dry upfront voice close to mic, and minimal backing instruments at the absolute beginning (e.g., "vocal-centric mix, dry upfront vocals close to mic, minimal backing beat, crystal clear vocal delivery, comical parody tone,").
   - Follow with rich, detailed natural descriptions of the genre, tempo, instruments, and mood. Avoid heavy drums or wall-of-sound production that drowns out the lyrics.
3. Keep the entire prompt strictly between 250 and 350 characters.
4. Output ONLY the raw prompt in English. Do not add brackets.

Example Output:
vocal-centric mix, dry upfront vocals close to mic, minimal backing beat, crystal clear vocal delivery, comical parody tone, driven by bouncy retro synth stabs, funky bass groove, high energy electro pop style, sarcastic and witty atmosphere`

export async function POST(request: NextRequest) {
  try {
    const { prompt, language, presetId, viralMode } = await request.json() as { prompt: string; language?: string; presetId?: string; viralMode?: boolean }

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: '프롬프트를 입력해주세요' }, { status: 400 })
    }

    // ─── 유료 요금제 권한 검증 (viralMode 숏폼 제작 시 무료 회원 및 비로그인 허용) ───
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!viralMode) {
      if (!user) {
        return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
      }

      const { data: profile } = (await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()) as any

      const planLower = (profile?.plan || profile?.subscription_tier || profile?.role || profile?.email || '').toLowerCase();
      const isPro = !!profile?.stripe_customer_id || 
                    planLower.includes('pro') || 
                    planLower.includes('enterprise') || 
                    planLower.includes('studio') || 
                    planLower.includes('admin') || 
                    !!profile?.is_admin || 
                    !!profile?.is_enterprise;
      if (!isPro) {
        return NextResponse.json({ error: 'AI 프롬프트 최적화 기능은 유료 요금제 구독 회원만 사용 가능합니다.' }, { status: 403 })
      }
    }

    // ─── 하이브리드 캐시 검증: 공식 프리셋인 경우 즉시 반환 ───
    if (presetId && OFFICIAL_PRESETS_MAP[presetId]) {
      console.log(`[PromptOptimize] Serving cached official preset prompt for: ${presetId}`)
      return NextResponse.json({ optimized: OFFICIAL_PRESETS_MAP[presetId], model: 'official-preset-cache' })
    }

    // ─── 유저 취향(좋아요 & 완곡 청취율 리텐션) 연동 ───
    let userPreferences = ''
    let userAvoidances = ''

    try {
      if (user) {
        // 1. 우수곡 (좋아요가 눌렸거나 완곡 점수가 누적 10점 이상인 곡) 조회
        const { data: likedGens } = await supabase
          .from('generations')
          .select('license_hash')
          .eq('user_id', user.id)
          .or('is_liked.eq.true,retention_score.gte.10')
          .order('created_at', { ascending: false })
          .limit(10)

        // 2. 비선호곡 (스킵당해 감점 스코어가 -15점 이하인 곡) 조회
        const { data: dislikedGens } = await supabase
          .from('generations')
          .select('license_hash')
          .eq('user_id', user.id)
          .lte('retention_score', -15)
          .order('created_at', { ascending: false })
          .limit(10)

        // 우수곡 스타일 추출
        if (likedGens && likedGens.length > 0) {
          const likedPrompts: string[] = []
          likedGens.forEach((gen) => {
            try {
              if (gen.license_hash) {
                const meta = JSON.parse(gen.license_hash)
                if (meta.stylePrompt) {
                  const cleanPrompt = meta.stylePrompt.replace('[High-fidelity studio mastering, professional grade audio]', '').trim()
                  if (cleanPrompt && !likedPrompts.includes(cleanPrompt)) {
                    likedPrompts.push(cleanPrompt)
                  }
                }
              }
            } catch (e) {}
          })
          if (likedPrompts.length > 0) {
            userPreferences = likedPrompts.slice(0, 5).join(' | ')
          }
        }

        // 비선호곡 스타일 추출
        if (dislikedGens && dislikedGens.length > 0) {
          const dislikedPrompts: string[] = []
          dislikedGens.forEach((gen) => {
            try {
              if (gen.license_hash) {
                const meta = JSON.parse(gen.license_hash)
                if (meta.stylePrompt) {
                  const cleanPrompt = meta.stylePrompt.replace('[High-fidelity studio mastering, professional grade audio]', '').trim()
                  if (cleanPrompt && !dislikedPrompts.includes(cleanPrompt)) {
                    dislikedPrompts.push(cleanPrompt)
                  }
                }
              }
            } catch (e) {}
          })
          if (dislikedPrompts.length > 0) {
            userAvoidances = dislikedPrompts.slice(0, 5).join(' | ')
          }
        }
      }
    } catch (dbErr) {
      console.warn('[PromptOptimize] Failed to fetch liked & retention preferences:', dbErr)
    }

    const SUNO_API_KEY = process.env.SUNO_API_KEY ?? ''
    const SUNO_API_URL = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '')

    if (!OPENAI_API_KEY && !SUNO_API_KEY) {
      // Mock 모드: 간단한 규칙 기반 확장
      const mockOptimized = `${prompt}, professional studio production, warm analog mix, dynamic arrangement, detailed instrumentation, cinematic atmosphere, [High-fidelity studio mastering, professional grade audio]`
      return NextResponse.json({ optimized: mockOptimized })
    }

    const langNote = language === 'ko' ? ' Respond mixing Korean mood words with English technical terms.' 
                   : language === 'ja' ? ' Respond mixing Japanese mood words with English technical terms.'
                   : ''

    let finalSystemPrompt = (viralMode ? SYSTEM_PROMPT_VIRAL : SYSTEM_PROMPT) + langNote
    if (!viralMode && userPreferences) {
      finalSystemPrompt += `\n\n[USER MUSIC PREFERENCES / LIKES]
The user has previously liked or fully listened to tracks generated with these styles. Read them to understand their favorite sound textures, vibes, instruments, and mixing styles:
"${userPreferences}"

INSTRUCTION FOR PERSONALIZATION:
1. MUSICAL COMPATIBILITY CHECK: Compare the user's liked styles with the current request. Only blend preferred sonic traits (instrument textures, mixing nuances, or soundstage properties) if they are musically compatible (e.g., sharing similar genres, tempos, or moods).
2. GENRE POLLUTION PREVENTION: If the liked styles are incompatible (e.g., blending high-energy EDM/Synthwave traits into a quiet acoustic piano lullaby, or loud drums into ambient meditation tracks), DO NOT mix them. Prioritize the current request's genre and mood integrity above all.
3. If compatible, gently blend traits by 15% to 20% weight, keeping the primary focus on the current request. Make the combination natural and seamless.`
    }

    if (!viralMode && userAvoidances) {
      finalSystemPrompt += `\n\n[USER RETENTION AVOIDANCE / DISLIKED STYLES]
The user skipped tracks containing these styles very quickly (under 3 seconds). These are considered noisy, dissonant, or unpleasant textures for this user. Strictly avoid mixing these instruments, harsh soundscapes, or drum styles into the new prompt:
"${userAvoidances}"`
    }

    let lastError = ''
    let optimized = ''
    let chosenModel = ''

    async function attemptCall(key: string, url: string, modelChain: string[]): Promise<{ optimized: string, model: string } | null> {
      for (const model of modelChain) {
        try {
          console.log(`[PromptOptimize] Trying model ${model} at ${url}...`)
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${key}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: finalSystemPrompt },
                { role: 'user', content: prompt },
              ],
              temperature: 0.8,
              max_tokens: 400,
            }),
          })

          if (!response.ok) {
            const errorBody = await response.text()
            lastError = `${model}: HTTP ${response.status} - ${errorBody}`
            console.warn(`[PromptOptimize] ${lastError}`)
            continue
          }

          const data = await response.json()
          const content = data.choices?.[0]?.message?.content?.trim() ?? prompt
          return { optimized: content, model }
        } catch (fetchError: any) {
          lastError = `${model}: ${fetchError.message || fetchError}`
          console.warn(`[PromptOptimize] Fetch error for ${model}:`, fetchError)
          continue
        }
      }
      return null
    }

    let result = null

    // 1단계: 302.ai 프록시 API (302.AI 전용 모델 gpt-5.5 / gpt-5.4 / gpt-5-mini)
    if (SUNO_API_KEY) {
      const PROXY_URL = `${SUNO_API_URL}/v1/chat/completions`
      const PROXY_MODEL_CHAIN = ['gpt-5.5', 'gpt-5.4', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini']
      result = await attemptCall(SUNO_API_KEY, PROXY_URL, PROXY_MODEL_CHAIN)
    }

    // 2단계: 실패 시 공식 OpenAI API 백업 시도 (OpenAI 공식 최신 플래그십 gpt-5.6-sol / gpt-5.6-terra / gpt-5.6-luna)
    if (!result && OPENAI_API_KEY) {
      const OFFICIAL_MODEL_CHAIN = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-4o', 'gpt-4o-mini']
      result = await attemptCall(OPENAI_API_KEY, OPENAI_API_URL, OFFICIAL_MODEL_CHAIN)
    }

    if (result && result.optimized && result.optimized.trim().length > 0) {
      optimized = result.optimized

      // 안전장치: 1000자 하드 컷오프 + 마스터링 접미사 보장
      const MASTERING_SUFFIX = viralMode ? '' : '[High-fidelity studio mastering, professional grade audio]'
      const MAX_CHARS = viralMode ? 350 : 1000
      if (optimized.length > MAX_CHARS) {
        optimized = optimized.slice(0, MAX_CHARS - (MASTERING_SUFFIX ? MASTERING_SUFFIX.length + 2 : 0)).trimEnd()
        const lastSpace = optimized.lastIndexOf(' ')
        if (lastSpace > MAX_CHARS * 0.7) optimized = optimized.slice(0, lastSpace)
      }
      if (MASTERING_SUFFIX && !optimized.includes(MASTERING_SUFFIX)) {
        optimized = optimized.trimEnd().replace(/[.,;]$/, '') + ' ' + MASTERING_SUFFIX
      }

      console.log(`[PromptOptimize] Success with model: ${result.model}, length: ${optimized.length}`)
      return NextResponse.json({ optimized, model: result.model })
    }

    // 모든 모델 실패 시 에러 응답 반환 (손상된 59자 빈 프롬프트 반환 방지)
    console.error(`[PromptOptimize] All models failed. Last error: ${lastError}`)
    return NextResponse.json({ 
      error: `AI 프롬프트 최적화 실패: ${lastError || 'AI 서버 응답이 원활하지 않습니다.'}`
    }, { status: 500 })
  } catch (error) {
    console.error('[PromptOptimize] Error:', error)
    return NextResponse.json({ error: '프롬프트 최적화에 실패했습니다' }, { status: 500 })
  }
}
