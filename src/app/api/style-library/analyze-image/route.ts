import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { images, conceptName, locale } = await request.json()
    const apiKey = process.env.OPENAI_API_KEY
    const backupKey = process.env.SUNO_API_KEY
    const apiBase = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '')

    const targetLocale = (locale || 'ko').toLowerCase()

    // 10-language error responses mapping
    const errorMessages: Record<string, { missingInput: string; apiFailed: string }> = {
      ko: { missingInput: '분석할 레퍼런스 이미지 또는 컨셉명이 필요합니다.', apiFailed: '모든 비전 API 호출에 실패했습니다.' },
      en: { missingInput: 'Reference image(s) or concept name required.', apiFailed: 'All vision API calls failed.' },
      ja: { missingInput: '分析用の参照画像またはコンセプト名が必要です。', apiFailed: 'すべてのビジョンAPI呼び出しに失敗しました。' },
      es: { missingInput: 'Se requieren imágenes de referencia o el nombre del concepto.', apiFailed: 'Fallaron todas las llamadas a la API de visión.' },
      fr: { missingInput: 'Image(s) de referência ou nom de concept requis.', apiFailed: "Échec de tous les appels à l'API de vision." },
      de: { missingInput: 'Referenzbilder oder Konzeptname erforderlich.', apiFailed: 'Alle Vision-API-Aufrufe sind fehlgeschlagen.' },
      pt: { missingInput: 'Imagem(ns) de referência ou nome do conceito obrigatório(s).', apiFailed: 'Falha em todas as chamadas da API de visão.' },
      zh: { missingInput: '需要参考图片或概念名称。', apiFailed: '所有视觉 API 调用均失败。' },
      it: { missingInput: 'Immagine/i di riferimento o nome del concetto richiesto.', apiFailed: "Tutte le chiamate all'API di visione sono fallite." },
      hi: { missingInput: 'संदर्भ छवि (छवियां) या अवधारणा नाम आवश्यक है।', apiFailed: 'सभी विज़न एपीआई कॉल विफल रहे।' }
    }

    const messages = errorMessages[targetLocale] || errorMessages.ko

    if ((!images || images.length === 0) && (!conceptName || conceptName.trim().length === 0)) {
      return NextResponse.json({ error: messages.missingInput }, { status: 400 })
    }
    
    // Choose instructions language
    let primaryLanguageName = 'Korean'
    let namePlaceholderExample = "'어스름한 기차 창밖으로 푸른 설산과 잔잔한 바다가 교차하는 낮잠의 순간', '주황빛 노을빛이 창틀에 번지고 홍차에서 온기가 피어오르는 아늑한 다락방'"
    let descPlaceholderExample = "'비스듬히 내리쬐는 주황빛 노을빛이 창틀에 스며들고, 오래된 나무 책상 위에 놓인 따뜻한 홍차에서 피어오르는 온기가 아늑한 실내를 감싸 안습니다. 낡은 LP 턴테이블이 만드는 미세한 먼지 노이즈와 은은한 일렉트릭 피아노의 리버브 선율이 조화롭게 섞여 들어가며, 일상에 지쳐있던 마음을 어루만져 주는 편안하고 노스탤지어 가득한 로파이 BGM입니다.'"
    let genrePlaceholderExample = "'디스토피아 신스웨이브', '새벽의 어쿠스틱 발라드', '어쿠스틱 포크'"
    let ambiencePlaceholderExample = "'창밖의 빗소리', '해변의 파도 소리'"

    if (targetLocale === 'ja') {
      primaryLanguageName = 'Japanese'
      namePlaceholderExample = "'薄暗い列車の窓の外に青い雪山と穏やかな海が交差する昼寝の瞬間', 'オレンジ色の夕暮れの光が窓枠に広がり紅茶から湯気が立ち上る心地よい屋根裏部屋'"
      descPlaceholderExample = "'窓枠から差し込むオレンジ色の夕暮れが静かに部屋を照らし、古い木製デスクの上に置かれた温かい紅茶から立ち上る湯気が心地よい空間を包み込みます。古いレコードプレーヤーが奏でるかすかなノイズと、エレクトリックピアノのリバーブの効いた旋旋律が調和し、日々の疲れを癒してくれる懐かしく穏やかなローファイBGMです。'"
      genrePlaceholderExample = "'ディストピア・シンセウェーブ', '夜明けのアコースティックバラード'"
      ambiencePlaceholderExample = "'窓の外の雨音', 'ビーチの波の音'"
    } else if (targetLocale === 'en') {
      primaryLanguageName = 'English'
      namePlaceholderExample = "'A nap moment where green snow-capped mountains and calm sea cross outside a dim train window', 'A cozy attic where orange sunset light spreads on the window frame and warmth rises from black tea'"
      descPlaceholderExample = "'The orange sunset light slanting through the window frame seeps in, and the warmth rising from the hot tea on the old wooden desk wraps the cozy room. The subtle surface noise of the vintage record turntable and the soft reverb of the electric piano blend harmoniously, comforting a weary soul with a nostalgic lo-fi background track.'"
      genrePlaceholderExample = "'Dystopian Synthwave', 'Dawn Acoustic Ballad'"
      ambiencePlaceholderExample = "'Rain outside the window', 'Waves on the beach'"
    } else if (targetLocale === 'es') {
      primaryLanguageName = 'Spanish'
      namePlaceholderExample = "'El momento de la siesta donde las montañas verdes cubiertas de nieve y el mar tranquilo se cruzan fuera de la ventana del tren'"
      descPlaceholderExample = "'La luz naranja del atardecer que se filtra a través del marco de la ventana se cuela, y el calor que sube del té caliente en el viejo escritorio de madera envuelve la acogedora habitación.'"
      genrePlaceholderExample = "'Synthwave Distópico', 'Balada Acústica del Amanecer'"
      ambiencePlaceholderExample = "'Lluvia fuera de la ventana', 'Olas en la playa'"
    } else if (targetLocale === 'fr') {
      primaryLanguageName = 'French'
      namePlaceholderExample = "'Un moment de sieste où les montagnes enneigées et la mer calme se croisent devant la fenêtre du train'"
      descPlaceholderExample = "'La lumière orange du coucher de soleil traversant le cadre de la fenêtre s\\\\'infiltre, et la chaleur s\\\\'élevant du té chaud sur le vieux bureau en bois enveloppe la pièce chaleureuse.'"
      genrePlaceholderExample = "'Synthwave Dystopique', 'Ballade Acoustique de l\\\\'Aube'"
      ambiencePlaceholderExample = "'Pluie à la fenêtre', 'Vagues sur la plage'"
    } else if (targetLocale === 'de') {
      primaryLanguageName = 'German'
      namePlaceholderExample = "'Ein Nickerchen-Moment, in dem sich grüne schneebedeckte Berge und das ruhige Meer vor dem Zugfenster kreuzen'"
      descPlaceholderExample = "'Das orangefarbene Abendlicht, das durch den Fensterrahmen fällt, dringt herein und die Wärme, die aus dem heißen Tee auf dem alten Holztisch aufsteigt, umhüllt den gemütlichen Raum.'"
      genrePlaceholderExample = "'Dystopian Synthwave', 'Akustische Ballade der Dämmerung'"
      ambiencePlaceholderExample = "'Regen vor dem Fenster', 'Wellen am Strand'"
    } else if (targetLocale === 'pt') {
      primaryLanguageName = 'Portuguese'
      namePlaceholderExample = "'Um momento de sesta onde montanhas nevadas e o mar calmo se cruzam fora da janela do trem'"
      descPlaceholderExample = "'A luz laranja do entardecer que entra pela moldura da janela se infiltra, e o calor que sobe do chá quente sobre a velha mesa de madeira envolve o quarto aconchegante.'"
      genrePlaceholderExample = "'Synthwave Distópico', 'Balada Acústica do Amanhecer'"
      ambiencePlaceholderExample = "'Chuva do lado de fora da janela', 'Ondas na praia'"
    } else if (targetLocale === 'zh') {
      primaryLanguageName = 'Chinese'
      namePlaceholderExample = "'车窗外青山白雪与静谧大海交织的午后小憩', '夕阳橘光洒在窗框上，温热红茶升起袅袅暖意的小阁楼'"
      descPlaceholderExample = "'斜照的橘色夕阳透过窗框洒入，旧木桌上热气腾腾的红茶散发出温暖，笼罩着温馨的房间。复古唱片机的微弱噪音与电子琴温柔的混响和谐融合，治愈疲惫的灵魂。'"
      genrePlaceholderExample = "'反乌托邦合成器波', '黎明民谣'"
      ambiencePlaceholderExample = "'窗外雨声', '沙滩波涛声'"
    } else if (targetLocale === 'it') {
      primaryLanguageName = 'Italian'
      namePlaceholderExample = "'Un momento di pisolino in cui le montagne innevate e il mare calmo si incrociano fuori dal finestrino del treno'"
      descPlaceholderExample = "'La luce arancione del tramonto filtra attraverso il telaio della finestra, e il calore che sale dal tè caldo sul vecchio tavolo di legno avvolge la stanza accogliente.'"
      genrePlaceholderExample = "'Synthwave Distopica', 'Ballata Acustica dell\\\\'Alba'"
      ambiencePlaceholderExample = "'Pioggia fuori dalla finestra', 'Onde sulla spiaggia'"
    } else if (targetLocale === 'hi') {
      primaryLanguageName = 'Hindi'
      namePlaceholderExample = "'ट्रेन की खिड़की के बाहर हरी बर्फ से ढकी पहाड़ियों और शांत समुद्र को देखने का एक सुहाना दोपहर'"
      descPlaceholderExample = "'खिड़की से आती ढलती शाम की नारंगी रोशनी कमरे को रोशन करती है, और पुरानी लकड़ी की मेज पर रखी गर्म चाय से उठता धुआं माहौल को सुकूनदायक बनाता है।'"
      genrePlaceholderExample = "'डिटोपियन सिंथवेव', 'भोर का संगीत'"
      ambiencePlaceholderExample = "'खिड़की के बाहर बारिश', 'समुद्र की लहरें'"
    }

    const systemPrompt = `You are a world-class AI music producer, cinematic director, and synesthetic artist.
Your job is to analyze the style reference image(s) or the provided text concept name, and translate them into a high-fidelity, 3-Layer audio-visual preset package (Dynamic Mood Copy, Music Prompt, and Optional ASMR Ambience).

You MUST return your response ONLY as a valid JSON object. Do not wrap it in markdown code blocks.
The JSON must follow this exact TypeScript interface:
interface ImageToMusicPresetResult {
  name: string; // A highly poetic, detailed, and evocative preset name in ${primaryLanguageName} (MUST be between 25 and 50 characters). It must read like a highly descriptive, emotional scene description (e.g. ${namePlaceholderExample}). Never write a short title (under 25 characters) or simple names. Force it to be rich and 25-50 characters long.
  desc: string; // A masterpiece of curatorial commentary or a scene from a high-end cinematic novel in ${primaryLanguageName} (3-4 sentences, MUST be between 200 and 300 characters) that paints a vivid, high-fidelity picture of the visual setting, the emotional state, and the auditory space. It must feel extremely premium, comforting, and atmospheric. Describe the exact lighting, tactile textures, and soundscapes. Do NOT write generic promotional text. Write like a novelist (e.g. ${descPlaceholderExample}). Force it to be at least 200 characters long, up to 300 characters.
  emoji: string; // A single representative emoji matching the visual or textual concept.
  color: string; // One of our active premium theme colors: "#ffc800", "#ccfa29", or "#1cfd54".
  category: "healing" | "focus" | "retro"; // Categorize this concept into one of three values: "healing" (마음의 위로와 힐링), "focus" (몰입과 생산성), or "retro" (아날로그 & 노스탤지어).
  inferred_genre: string; // Dynamic genre name in ${primaryLanguageName} matching the vibe (e.g. ${genrePlaceholderExample}).
  customPrompt: string; // A comma-separated list of 8-15 specific style tags in English (under 250 characters) representing key instruments, tempo, mood, and genre for Suno (e.g. 'retro synthwave, neon noir, warm synthesizer chords, driving arpeggiated bassline, tight punchy 80s drums, 110 BPM'). Avoid full sentences. Do NOT generate long prose here.
  dynamic_elements: {
    visual_tags: string[]; // 5-8 descriptive spatial or mood tags extracted from the image or text.
    audio_system: {
      music_layer: {
        genre_label: string; // Dynamic genre name in ${primaryLanguageName} (same as inferred_genre).
        base_prompt: string; // Suno v5.5 optimized music style prompt in English (up to 1,000 characters). Describe rich instrumentation, tempo, key, spatial acoustics (e.g., 'recorded in a small wooden room with natural decay'), microphones used (e.g., 'captured on vintage ribbon microphone'), tube preamp warmth, tape hiss, and master bus saturation effects. Focus ONLY on gender-neutral vocal texture if vocals are mentioned.
      };
      // ONLY populate this if background/ambient/ASMR environmental noise is appropriate for the concept mood (e.g., rain, cafe chatter, wind, waves). If not appropriate (e.g. clean studio pop, high-energy rock), set to null.
      ambience_layer: {
        ambience_label: string; // Dynamic ambient sound name in ${primaryLanguageName} (e.g. ${ambiencePlaceholderExample}).
        base_prompt: string; // ASMR/ambience prompt in English (e.g. 'gentle rain tapping on window glass, distant rolling thunder, outdoor vinyl crackle').
        default_mix_ratio: number; // Suggested mixing ratio (ALWAYS set to 0.2).
      } | null;
    };
    visual_system: {
      base_video_prompt: string; // Cinematic prompt in English (800-1000 characters) describing scene setting, lighting, motion, and camera movements. You MUST write this prompt to generate a 100% text-free visual asset.
    };
  };
  // Localized Fields (MUST generate these translations to support 10-language UI):
  name_ko: string; // The preset name written/translated in Korean (poetic, 25-50 characters)
  name_en: string; // The preset name written/translated in English (poetic, 25-50 characters)
  name_ja: string; // The preset name written/translated in Japanese (poetic, 25-50 characters)
  name_es: string; // The preset name written/translated in Spanish (poetic, 25-50 characters)
  name_fr: string; // The preset name written/translated in French (poetic, 25-50 characters)
  name_de: string; // The preset name written/translated in German (poetic, 25-50 characters)
  name_pt: string; // The preset name written/translated in Portuguese (poetic, 25-50 characters)
  name_zh: string; // The preset name written/translated in Chinese (poetic, 25-50 characters)
  name_it: string; // The preset name written/translated in Italian (poetic, 25-50 characters)
  name_hi: string; // The preset name written/translated in Hindi (poetic, 25-50 characters)
  desc_ko: string; // The preset description written/translated in Korean (3-4 sentences, 200-300 characters)
  desc_en: string; // The preset description written/translated in English (3-4 sentences, 200-300 characters)
  desc_ja: string; // The preset description written/translated in Japanese (3-4 sentences, 200-300 characters)
  desc_es: string; // The preset description written/translated in Spanish (3-4 sentences, 200-300 characters)
  desc_fr: string; // The preset description written/translated in French (3-4 sentences, 200-300 characters)
  desc_de: string; // The preset description written/translated in German (3-4 sentences, 200-300 characters)
  desc_pt: string; // The preset description written/translated in Portuguese (3-4 sentences, 200-300 characters)
  desc_zh: string; // The preset description written/translated in Chinese (3-4 sentences, 200-300 characters)
  desc_it: string; // The preset description written/translated in Italian (3-4 sentences, 200-300 characters)
  desc_hi: string; // The preset description written/translated in Hindi (3-4 sentences, 200-300 characters)
}

CRITICAL DIRECTIVES:
1. GENDER & SUBJECT PRESERVATION: You MUST carefully analyze the reference images to determine the primary subject's characteristics. If the subject is a young woman (e.g. wearing headphones, sitting alone, long hair, cap, leaning on a train/monorail window), you MUST preserve her identity exactly as a "young woman" or "a beautiful young woman with long hair" in the Korean, Japanese, and English fields. NEVER generalise or swap her gender to a man.
2. ART STYLE CONVERGENCE: Match the visual style of the reference images (e.g. cozy anime art style, retro 90s anime aesthetic, soft warm digital painting, cinematic Ghibli watercolor texture, vintage film photography). Include these style keywords inside 'base_video_prompt'.
3. STRICTOR TEXT & TYPOGRAPHY PROHIBITION: To prevent the image generator from producing messy text, letters, subtitles, watermarks, or signatures, the 'base_video_prompt' MUST NOT contain any words that imply text overlays (e.g. 'text', 'writing', 'signboard', 'typography', 'subtitle', 'logo') and MUST end with the strong negative constraint: '--no text, watermark, signature, typography, subtitles, writing, letters, words, logo'.
`;

    const userContent: any[] = []
    if (images && images.length > 0) {
      console.log(`[API/style-library/analyze-image] 이미지 ${images.length}장 비전 분석 시작...`)
      userContent.push({
        type: 'text',
        text: 'Analyze the attached image(s) and generate a music style preset matching their artistic style and emotional mood.'
      })
      images.forEach((img: string) => {
        userContent.push({
          type: 'image_url',
          image_url: { url: img }
        })
      })
    } else {
      console.log(`[API/style-library/analyze-image] 텍스트 컨셉명 "${conceptName}" 기반 분석 시작...`)
      userContent.push({
        type: 'text',
        text: `Analyze the user's music concept title: "${conceptName}" and generate a music style preset matching this style and emotional mood.`
      })
    }

    const MODEL_CHAIN = ['gpt-4o', 'gpt-4o-mini']
    let parsed: any = null
    let responseOk = false

    async function attemptVision(keyStr: string, apiUrlStr: string): Promise<any | null> {
      for (const model of MODEL_CHAIN) {
        try {
          console.log(`[API/style-library/analyze-image] Trying model ${model} at ${apiUrlStr}...`)
          const response = await fetch(apiUrlStr, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${keyStr}`
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.7
            })
          })

          if (response.ok) {
            const data = await response.json()
            const contentText = data.choices?.[0]?.message?.content?.trim() || '{}'
            return JSON.parse(contentText)
          } else {
            const errText = await response.text()
            console.warn(`[API/style-library/analyze-image] Model ${model} failed at ${apiUrlStr}:`, errText)
          }
        } catch (err: any) {
          console.error(`[API/style-library/analyze-image] Exception with model ${model} at ${apiUrlStr}:`, err.message)
        }
      }
      return null
    }

    // 1순위: 302.ai API 시도
    if (backupKey) {
      console.log('[API/style-library/analyze-image] Attempting 302.ai Proxy API call...')
      const backupUrl = `${apiBase}/v1/chat/completions`
      parsed = await attemptVision(backupKey, backupUrl)
      if (parsed) responseOk = true
    }

    // 2순위: 공식 OpenAI API 시도
    if (!responseOk && apiKey) {
      console.log('[API/style-library/analyze-image] 302.ai failed/missing, falling back to official OpenAI...')
      parsed = await attemptVision(apiKey, 'https://api.openai.com/v1/chat/completions')
      if (parsed) responseOk = true
    }

    if (parsed) {
      console.log('[API/style-library/analyze-image] 분석 성공:', parsed)
      return NextResponse.json({ success: true, preset: parsed })
    }

    return NextResponse.json({ error: messages.apiFailed }, { status: 500 })
  } catch (error: any) {
    console.error('[API/style-library/analyze-image] 에러 발생:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
