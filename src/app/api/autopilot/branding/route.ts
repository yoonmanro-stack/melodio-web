import { NextRequest, NextResponse } from 'next/server'
import { presets } from '@/data/presets'

export const dynamic = 'force-dynamic'

function parsePlaybookBranding(content: string) {
  const lines = content.split('\n')
  const names: { name: string; handle: string; concept: string }[] = []

  let inBrandingSection = false
  let currentItem: any = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Check if we entered the branding section
    if (line.includes('## 🏷️ 추천 브랜드명') || line.includes('추천 브랜드명 & 핸들')) {
      inBrandingSection = true
      continue
    }
    
    // If we hit another heading, we exit the branding section
    if (inBrandingSection && line.startsWith('## ') && !line.includes('추천 브랜드명')) {
      inBrandingSection = false
      break
    }

    if (inBrandingSection) {
      // Look for list items: e.g. "1. **Golden Trot Train (골든 트로트 익스프레스)**"
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
        // Look for handle: e.g. "- *추천 핸들*: `@golden_trot_express`" or just "@golden_trot_express"
        const handleMatch = line.match(/추천\s*핸들.*`@(.*?)`/) || line.match(/@([a-zA-Z0-9_]+)/)
        if (handleMatch) {
          currentItem.handle = '@' + handleMatch[1].trim()
          continue
        }

        // Look for concept: e.g. "- *컨셉*: 일상의 피로를 한 방에 날려버리는..."
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

function splitName(fullName: string) {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      presetId, 
      targetRegion = 'KR', 
      customName, 
      customDesc,
      namingLength = 'type-1',
      brandKeywords = '',
      visualStyle = 'cozy-anime',
      customVibe = ''
    } = body
    
    console.log('[BrandingAPI] Incoming parameters:', {
      presetId,
      targetRegion,
      customName,
      namingLength,
      brandKeywords,
      visualStyle,
      customVibeLength: customVibe.length,
      customVibe
    })
    
    let dbPlaybook: any = null
    try {
      const { getPlaybookByKey } = await import('@/lib/db/knowledge')
      dbPlaybook = await getPlaybookByKey(presetId)
    } catch (err) {
      console.error('Error fetching DB preset in branding API:', err)
    }

    let preset: any = null
    if (dbPlaybook) {
      const firstParagraph = dbPlaybook.content
        .split('\n')
        .find((l: string) => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
        ?.trim()

      preset = {
        id: dbPlaybook.key_name,
        name: dbPlaybook.title,
        desc: dbPlaybook.metadata?.description || firstParagraph || dbPlaybook.title,
        emoji: dbPlaybook.metadata?.emoji || '🎵',
        gradient: dbPlaybook.metadata?.gradient || 'linear-gradient(135deg, #10b981, #059669)',
        selections: {},
        customPrompt: dbPlaybook.metadata?.suno_tags || dbPlaybook.content
      }
    } else {
      preset = presets.find(p => p.id === presetId)
    }

    if (!preset && customName) {
      preset = { 
        id: presetId, 
        name: customName, 
        desc: customDesc || '',
        emoji: '🎵',
        gradient: 'from-zinc-900 to-zinc-950',
        selections: {}
      }
    }

    if (!preset) {
      return NextResponse.json({ error: '유효한 프리셋을 찾을 수 없습니다.' }, { status: 400 })
    }

    // Naming Style 및 Length 지시문 생성
    let lengthRulesAndExamples = '';
    if (namingLength === 'type-1') {
      lengthRulesAndExamples = `
## CRITICAL RULE FOR SHORT-FORM (Type 1)
- The user has requested "Type 1: 초간결 직관형 (Short-Form)" naming.
- **Strict Character/Letter Count Constraints**:
  - **Type A (해당 국가 언어 100%)**:
    - For Korean (KR): All candidates MUST be EXACTLY 2 to 3 Korean characters (한글 2~3글자). (e.g. "늘봄", "여울", "단비", "온음", "새벽", "쉼", "가락", "늘", "봄", "온"). Absolutely NO names longer than 3 characters.
    - For Japanese (JP): All candidates MUST be EXACTLY 2 to 3 characters in Japanese (Kanji/Kana). (e.g. "和風", "響き", "深夜", "桜", "風"). Absolutely NO names longer than 3 characters.
    - For English (EN): All candidates MUST be EXACTLY 3 to 6 letters in English (e.g. "Vibe", "Echo", "Aura", "Flow", "Zest", "Tone").
  - **Type B (영어 100%)**:
    - For all regions: All candidates MUST be EXACTLY 3 to 6 letters in English (e.g. "Vibe", "Echo", "Aura", "Flow", "Zest", "Lush", "Beat", "Pace"). Absolutely NO names longer than 6 letters.
  - **Type C (국가 언어 + 영어 조합)**:
    - For all regions: A tight, compact blend of max 6 characters total. (e.g. "쉼Fi", "봄Wave", "온Beat", "K-쉼", "정Beat").
- **Style and Impact Guideline**:
  - Focus on abstract, poetic, memorable, or modern startup-like brand words.
  - Absolutely NO generic descriptions, NO multi-word phrases, NO spaces.
  - Examples of poor (DO NOT GENERATE): "달빛 아래서 공부", "조선 퓨전 국악 라운지", "Tokyo City Beat", "Lofi Study Session", "조선그루브".
  - Examples of good (MUST GENERATE): "늘봄", "여울", "온음", "단비", "쉼", "Vibe", "Echo", "Aura", "Flow", "K-Vibe".
`;
    } else if (namingLength === 'type-2') {
      lengthRulesAndExamples = `
## CRITICAL RULE FOR COMPOUND (Type 2)
- The user has requested "Type 2: 의미 합성형 (Compound)" naming.
- **Strict Character/Letter Count Constraints**:
  - **Type A (해당 국가 언어 100%)**:
    - For Korean (KR): All candidates MUST be EXACTLY 4 to 5 Korean characters (한글 4~5글자). (e.g. "무비트립", "지식코너", "새벽선율", "소리창고", "가을카페").
    - For Japanese (JP): All candidates MUST be EXACTLY 4 to 5 characters in Japanese (e.g. "深夜温泉", "桜のメロ").
    - For English (EN): All candidates MUST be EXACTLY 7 to 12 letters in English (e.g. "MovieTrip", "TechVibe", "SoundNest").
  - **Type B (영어 100%)**:
    - For all regions: All candidates MUST be EXACTLY 7 to 12 letters in English (e.g. "MovieTrip", "TechVibe", "SoundNest", "DreamFlow", "NightLofi").
  - **Type C (국가 언어 + 영어 조합)**:
    - For all regions: A combination of max 8 characters total. (e.g. "지식Tech", "토크Vibe", "조선Groove", "K-Lofi").
`;
    } else {
      lengthRulesAndExamples = `
## CRITICAL RULE FOR NARRATIVE (Type 3)
- The user has requested "Type 3: 문장/슬로건형 (Narrative)" naming.
- **Strict Character/Letter Count Constraints**:
  - **Type A (해당 국가 언어 100%)**:
    - For Korean (KR): All candidates MUST be 6+ Korean characters (한글 6글자 이상). (e.g. "읽어주는남자", "은하수정거장", "비오는날의커피", "달빛아래우리").
    - For Japanese (JP): All candidates MUST be 6+ characters in Japanese (e.g. "深夜の東京カフェ", "雨の日のメロディ").
    - For English (EN): All candidates MUST be 13+ letters or a phrase of 3+ words. (e.g. "What We Know", "Sound of Silence").
  - **Type B (영어 100%)**:
    - For all regions: All candidates MUST be 13+ letters or a phrase of 3+ words (e.g. "What We Know", "Sound of Silence", "Under the Moonlight").
  - **Type C (국가 언어 + 영어 조합)**:
    - For all regions: A phrase of 13+ letters or 3+ words (e.g. "Daily Science Lab", "Alpha Tech Studio", "Velvet Lofi Lounge").
`;
    }

    if (targetRegion === 'EN') {
      lengthRulesAndExamples += `
## SPECIAL RULE FOR ENGLISH TARGET REGIONS (EN/US/UK etc.)
- Since the target region is English, Type A (National 100%) and Type B (English 100%) will both be in English.
- For Type C (Combination): Instead of combining Native with English, combine a Modifier and a Keyword (e.g. Daily + Science = Daily Science, Alpha + Tech = Alpha Tech) to create a dual-word brand name.
`;
    }

    let namingDirective = `
## BRANDING NAMING ENGINE SPECIFICATION
You MUST generate candidate names for the following 3 distinct Naming Styles:
1. **Type A (해당 국가 언어 100%)**:
   - Localized branding.
   - For South Korea (KR): 100% Korean (한글).
   - For Japan (JP): 100% Japanese (日本語 / 漢字 / カタカナ / ひらがな).
   - For English regions (EN): 100% English (영어).
2. **Type B (영어 100%)**:
   - Maximized global accessibility and scalability.
   - For all target regions: 100% English (영어) using standard ASCII characters only.
3. **Type C (국가 언어 + 영어 조합)**:
   - For KR: Korean + English combination.
   - For JP: Japanese + English combination.
   - **CRITICAL EXCEPTION FOR ENGLISH REGIONS (Target Region Language is EN)**:
     To prevent duplicate word bugs, use Modifier + Keyword combination structure (e.g., Daily Science, Alpha Tech).

${lengthRulesAndExamples}

## UI/UX & DESIGN INTEGRATION GUIDELINE
In the name's candidate description, include specific layout tips based on the selected length type:
- **For Type 1 (Short-Form)**:
  - CI (Profile): Text typography can be used directly. Bold, minimalist, high contrast.
  - BI (Banner): Centered large text layout.
- **For Type 2 (Compound)**:
  - CI (Profile): Scale down font size or use 2-line rendering.
  - BI (Banner): Extract core noun to map to the visual concept background.
- **For Type 3 (Narrative)**:
  - CI (Profile): Do not use full text. Suggest initials (e.g. YN / 읽남) or illustrative avatar only.
  - BI (Banner): Separate into main title and small sub-slogan layout.
`

    if (brandKeywords.trim()) {
      namingDirective += `
## MANDATORY KEYWORDS
You MUST integrate the following keywords: "${brandKeywords.trim()}" into candidates where linguistically natural.
`
    }

    // Visual Art Style 지시문 생성
    let visualDirective = ''
    if (visualStyle === 'cinematic-real') {
      visualDirective = `
- Visual Art Style: Cinematic Real / High Realism photography, natural lighting, deep depth of field, real-world cozy aesthetics.
`
    } else if (visualStyle === 'image-to-image') {
      visualDirective = `
- Visual Art Style: Blended image styling matching user-uploaded references. Analyze reference layout and colors, replicate and transform them into customized layout.
`
    } else if (visualStyle === 'retro-anime') {
      visualDirective = `
- Visual Art Style: 90s Retro Anime Illustration, lofi playlist style, hand-drawn cozy feel, warm nostalgia, analog vibes.
`
    } else if (visualStyle === 'cozy-diorama') {
      visualDirective = `
- Visual Art Style: 3D Cozy Miniature Diorama, cute toy-like isometric room rendering, warm soft ambient lighting, clean and premium interior feel.
`
    } else if (visualStyle === 'pixel-art') {
      visualDirective = `
- Visual Art Style: 16-Bit Classic Pixel Art / Retro game aesthetic, cozy low-fidelity digital details, pixelated warm cozy vibe.
`
    } else {
      visualDirective = `
- Visual Art Style: Minimal Abstract fluid gradient art, smooth dreamy flowing colors, low visual noise, deeply calming, meditative colors.
`
    }

    // 다국어 타겟 설정
    let regionPromptDetails = ''
    if (targetRegion === 'JP') {
      regionPromptDetails = `
- Language: Output all titles, descriptions, comments, and name explanations in natural, polite Japanese (Keigo).
- CRITICAL REGIONAL LOCALIZATION: This is a Japanese channel targeting Japanese listeners. You MUST strictly use Japanese locations (e.g., Tokyo, Kyoto, Shibuya, Sumida River), Japanese cultural concepts, and Japanese aesthetics (e.g., retro J-pop, City Pop, Showa). Absolutely DO NOT use or mix Korean locations/terms (such as Seoul, Han River, Joseon, Hanok, Korea) under any circumstances, even if they are in the playbook or preset description. Re-brand or translate them to Tokyo/Japan equivalents.
- Pinned Comment: Write a polite, engaging Japanese comment welcoming students and workers.
`
    } else if (targetRegion === 'EN') {
      regionPromptDetails = `
- Language: Output all titles, descriptions, comments, and name explanations in smooth, natural English.
- CRITICAL REGIONAL LOCALIZATION: This is a global English channel. You MUST strictly use global or Western concepts, cultural terms, and aesthetics. Absolutely DO NOT include or refer to Korean locations/terms (such as Seoul, Han River, Joseon, Hanok) or Japanese terms unless explicitly requested by the vibe.
- Pinned Comment: Write a welcoming, globally accessible English comment.
`
    } else {
      regionPromptDetails = `
- Language: Output all titles, descriptions, comments, and name explanations in poetic, emotional Korean (한국어).
- CRITICAL REGIONAL LOCALIZATION: This is a Korean channel. You MUST strictly use Korean locations (e.g., Seoul, Han River), Korean cultural terms, and aesthetics.
- Pinned Comment: Write a deeply comforting, empathetic Korean comment asking listeners to share their day or stories.
`
    }

    let playbookInstructions = ''
    if (dbPlaybook) {
      playbookInstructions = `
## PREDEFINED BRANDING METADATA FROM OBSIDIAN PLAYBOOK:
- Predefined Logo Prompt: ${dbPlaybook.metadata?.logo_prompt || 'None'}
- Predefined Banner Prompt: ${dbPlaybook.metadata?.banner_prompt || 'None'}
- Predefined Thumbnail Prompt: ${dbPlaybook.metadata?.thumbnail_prompt || 'None'}

## OBSIDIAN PLAYBOOK DETAILED CONTENT:
You MUST review the entire playbook content below. Pay close attention to:
1. Recommended Brand Names ("## 🏷️ 추천 브랜드명 & 핸들 (Brand Recommendations)"):
   - If naming length selected is Short-Form (Type 1), you MUST compress/shorten these recommended names to exactly 2-3 characters (Korean) or 3-6 characters (English) as the core keyword. Do NOT output long names even if the playbook lists them.
   - If target region is JP, you MUST translate/adapt the recommended names into Japanese equivalents.
2. Conceptual Direction and Visual Prompts: If predefined visual prompts (Logo, Banner, Thumbnail) are provided in the metadata, you MUST use them as the primary basis.

Playbook Document:
${dbPlaybook.content}
`
    }

    const systemPrompt = `You are a world-class YouTube branding and SEO optimization specialist.
Your task is to generate complete A-to-Z branding and uploading assets for a new YouTube playlist channel localized for the selected region, strictly customized to the user's styling choices.

Branding Customization Rules:
${namingDirective}
${visualDirective}
- User Custom Vibe Preference: ${customVibe ? `"${customVibe}" - make sure to strongly integrate this concept/mood/theme into all names, descriptions, and visual prompts.` : 'None (follow preset description)'}
${playbookInstructions}

CRITICAL RULES FOR PLAYBOOK INTEGRATION:
1. If the playbook content defines recommended brand names under "## 🏷️ 추천 브랜드명 & 핸들 (Brand Recommendations)", you MUST prioritize and use these recommended names (or translate/adapt them slightly for the target region). 
   - However, if the selected Naming Length is Short-Form (Type 1), you MUST compress, shorten, or extract a 2-3 character (Korean) or 3-6 letter (English) core keyword from those recommendations to create a short, high-impact brand name. Never output names longer than the selected length policy.
2. If predefined visual prompts (Logo, Banner, Thumbnail) are provided in the metadata, you MUST use them as the primary basis for your output prompts.

CRITICAL TYPOGRAPHY & VISUAL RULES FOR BANNER AND LOGO:
2. Absolutely DO NOT include, list, or mention music genres (e.g. "Lofi Hip Hop", "Chill Phonk", "Trot"), description copy, year numbers, or playbooks metadata as visible text or typography in "bannerPrompt" or "logoPrompt".
3. For "bannerPrompt", if any additional typography/copywriting other than '[CHANNEL_NAME]' is added, it MUST be a single, short, one-line conceptual copywriting under 5 words (e.g., "Deep focus lo-fi beats") placed subtly underneath '[CHANNEL_NAME]'. Do NOT generate multi-line text or cluttered text blocks.
4. For "bannerPrompt", explicitly instruct that:
   - The composition must be strictly centered. The title '[CHANNEL_NAME]', key visual motifs, and copywriting must be tightly grouped together in the absolute center.
   - The top 35% and bottom 35% of the canvas (TV area) must remain completely blank, simple, and clean with a solid light-toned background.
   - The far-left and far-right margins must smoothly fade out, blur, or bleed into the light-toned background.
   - Absolutely NO vertical calligraphic boxes, NO vertical text stripes, NO border framing lines, and NO complex details are allowed on the left/right margins.
   - The background must be clean, light-toned (white, off-white, light gray, or very light pastel), and simple.
5. In "logoPrompt" and "bannerPrompt", you MUST strictly use the exact placeholder '[CHANNEL_NAME]' where the channel title text should be rendered. Do NOT hardcode any recommended brand names, preset names (like 'Mallsoft'), or other text inside these prompts.

Channel Description (aboutText) Constraint:
- Must be a highly appealing, emotional, and poetic description UNDER 1000 characters.
- MUST explicitly mention state-of-the-art AI music technology (specifically "Melodio AI") and how this artificial intelligence produces perfect background sounds for study, deep focus, or relaxation.

Target Region Specifications:
${regionPromptDetails}

Format your output STRICTLY as a JSON object:
{
  "channelConcept": "Concise target positioning statement in the target language (1 sentence).",
  "names": [
    {
      "style": "Type A (해당 국가 언어 100%)",
      "desc": "이 언어 스타일의 네이밍 방향성 설명 (1~2문장)",
      "candidates": [
        { "name": "후보명 1", "desc": "이름의 의미/디자인가이드" },
        { "name": "후보명 2", "desc": "이름의 의미/디자인가이드" },
        { "name": "후보명 3", "desc": "이름의 의미/디자인가이드" }
      ]
    },
    {
      "style": "Type B (영어 100%)",
      "desc": "이 언어 스타일의 네이밍 방향성 설명 (1~2문장)",
      "candidates": [
        { "name": "후보명 1", "desc": "이름의 의미/디자인가이드" },
        { "name": "후보명 2", "desc": "이름의 의미/디자인가이드" },
        { "name": "후보명 3", "desc": "이름의 의미/디자인가이드" }
      ]
    },
    {
      "style": "Type C (국가 언어 + 영어 조합)",
      "desc": "이 언어 스타일의 네이밍 방향성 설명 (1~2문장)",
      "candidates": [
        { "name": "후보명 1", "desc": "이름의 의미/디자인가이드" },
        { "name": "후보명 2", "desc": "이름의 의미/디자인가이드" },
        { "name": "후보명 3", "desc": "이름의 의미/디자인가이드" }
      ]
    }
  ],
  "handles": [
    "@handle1",
    "@handle2",
    "@handle3"
  ],
  "aboutText": "Detailed, emotional, SEO-optimized channel bio description in the target language under 1000 chars, explicitly mentioning Melodio AI music generation.",
  "channelTags": "Comma-separated list of 10+ channel-level keywords/tags.",
  "brandColors": "A palette description including 3 hex color codes and their names/usages (e.g. '#000 (Black), #FFF (White)').",
  "logoPrompt": "Midjourney prompt for the profile picture (logo) matching the visual style and vibe.",
  "bannerPrompt": "Midjourney prompt for the channel banner matching the visual style and vibe (--ar 16:9 included).",
  "watermarkPrompt": "Midjourney prompt for the video watermark / subscribe overlay icon.",
  "thumbnailPrompt": "Midjourney prompt for the video thumbnail background matching the visual style and vibe (--ar 16:9 included).",
  "thumbnailTypography": "Guidance on what text to place on the thumbnail, font mood, styling, and text positioning.",
  "videoTitleTemplate": "A recommended title layout template for daily video uploads.",
  "videoDescriptionTemplate": "A pre-formatted template for daily video upload descriptions, including timeline and link placeholders.",
  "videoTags": "Comma-separated list of 10-15 video-level tags/keywords.",
  "pinnedComment": "An engaging, localized pinned comment template to pin at the top of the comment section."
}`

    let userPrompt = `Preset Name: ${preset.name}
Preset Description: ${preset.desc}
Target Region: ${targetRegion}
Selected Naming Length Policy: ${namingLength}
Required Brand Keywords (if any): ${brandKeywords}

CRITICAL LANGUAGE INSTRUCTION:
- Since Target Region is "${targetRegion}", you MUST write:
  1. The "channelConcept" in ${targetRegion === 'KR' ? 'Korean (한국어)' : targetRegion === 'JP' ? 'Japanese (日本語)' : 'English'}.
  2. The candidates, aboutText, pinnedComment, style desc, and each candidate desc MUST be written in natural, fluent ${targetRegion === 'KR' ? 'Korean (한국어)' : targetRegion === 'JP' ? 'Japanese (日本語)' : 'English'}.
  3. Ensure Type A, Type B, Type C are generated matching the selected Naming Length Policy constraint: ${namingLength}.
  4. Ensure English regions (Target Region EN) use the [Modifier + Keyword] combination structure for Type C to prevent duplicates.

CRITICAL QUALITY RULE:
- Each candidate name MUST have a rich, cultural, and meaningful explanation (1~2 sentences) that describes its origin, cultural reference, and a clear design layout tip for CI/BI.
- NEVER generate generic placeholder names like "[Preset] Studio" or "[Preset] Lounge".

CRITICAL REGENERATION & VARIETY RULE:
- 무작위성 시드 (Random Seed): ${Date.now()}-${Math.random()}
- You MUST generate 100% brand new, unique, and fresh candidate names. Be deeply creative, culturally rich, and think out of the box.`

    const apiKey = process.env.OPENAI_API_KEY
    const backupKey = process.env.SUNO_API_KEY
    const apiBase = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '')
    let parsed: any = null
    let responseOk = false

    const OFFICIAL_MODEL_CHAIN = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-4o', 'gpt-4o-mini']
    const BACKUP_MODEL_CHAIN = ['gpt-5.5', 'gpt-5.4', 'gpt-5-mini', 'gpt-4o', 'gpt-4o-mini']

    async function attemptBranding(apiKeyStr: string, apiUrlStr: string, modelChain: string[]): Promise<any> {
      for (const model of modelChain) {
        try {
          console.log(`[BrandingAPI] Trying model ${model} at ${apiUrlStr}...`)
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
            }),
          })

          if (response.ok) {
            const data = await response.json()
            const content = data.choices[0]?.message?.content ?? '{}'
            return JSON.parse(content)
          } else {
            const errText = await response.text()
            console.warn(`[BrandingAPI] Model ${model} failed at ${apiUrlStr}:`, errText)
          }
        } catch (err: any) {
          console.error(`[BrandingAPI] Exception with model ${model}:`, err.message)
        }
      }
      return null
    }

    // 1순위: 302.ai 프록시 API 시도 (메인 호출)
    if (backupKey) {
      console.log('[BrandingAPI] Attempting 302.ai Proxy API call...')
      const backupUrl = `${apiBase}/v1/chat/completions`
      parsed = await attemptBranding(backupKey, backupUrl, BACKUP_MODEL_CHAIN)
      if (parsed) responseOk = true
    }

    // 2순위: 공식 OpenAI API 시도 (백업)
    if (!responseOk && apiKey) {
      console.log('[BrandingAPI] 302.ai failed or not set, falling back to official OpenAI...')
      parsed = await attemptBranding(apiKey, 'https://api.openai.com/v1/chat/completions', OFFICIAL_MODEL_CHAIN)
    }

    if (parsed && parsed.names && parsed.names.length > 0) {
      // Add backward compatibility fields in names
      parsed.names = parsed.names.map((item: any) => {
        if (item.candidates && !item.korean && !item.english) {
          return {
            ...item,
            korean: item.candidates,
            english: item.candidates
          }
        }
        return item
      })
      return NextResponse.json({ success: true, ...parsed })
    }

    // ─── HIGH FIDELITY FALLBACK / MOCK DATA ───
    if (dbPlaybook) {
      const parsedBrands = parsePlaybookBranding(dbPlaybook.content)
      const engNames = parsedBrands.map(b => splitName(b.name).eng)
      const locNames = parsedBrands.map(b => splitName(b.name).loc)
      const playbookHandles = parsedBrands.map(b => b.handle).filter(Boolean)

      return NextResponse.json({
        success: true,
        channelConcept: dbPlaybook.metadata?.description || dbPlaybook.title,
        names: [
          {
            style: 'Type A (해당 국가 언어 100%)',
            desc: '플레이북의 정체성을 100% 로컬 언어로 매칭제안',
            candidates: locNames.map((name, i) => ({ name, desc: `플레이북 한글 네이밍 시안 ${i + 1}. [디자인가이드] 모노그램/워드마크 로고 추천.` })),
            korean: locNames.map((name, i) => ({ name, desc: `플레이북 한글 네이밍 시안 ${i + 1}` })),
            english: engNames.map((name, i) => ({ name, desc: `Playbook English suggestion ${i + 1}` }))
          },
          {
            style: 'Type B (영어 100%)',
            desc: '글로벌 범용성을 강조한 100% 영문 매칭제안',
            candidates: engNames.map((name, i) => ({ name, desc: `Playbook English suggestion ${i + 1}. [디자인가이드] 정중앙 대형 타이포 레이아웃 추천.` })),
            korean: locNames.map((name, i) => ({ name: `${name}의 달빛`, desc: `서사적 변주 ${i + 1}` })),
            english: engNames.map((name, i) => ({ name: `Midnight ${name}`, desc: `Narrative vibe variation ${i + 1}` }))
          },
          {
            style: 'Type C (국가 언어 + 영어 조합)',
            desc: '언어 간 시너지를 내는 트렌디한 하이브리드 조합',
            candidates: locNames.map((name, i) => ({ name: `${name} Project`, desc: `하이브리드 합성 시안 ${i + 1}. [디자인가이드] 자간 축소 및 2줄 구성 추천.` })),
            korean: locNames.map((name, i) => ({ name: `${name} 프로젝트`, desc: `확장형 변주 ${i + 1}` })),
            english: engNames.map((name, i) => ({ name: `Neo ${name}`, desc: `Scalable conceptual suggestion ${i + 1}` }))
          }
        ],
        handles: playbookHandles.length > 0 ? playbookHandles : [`@${preset.id}_official`, `@${preset.id}_music`],
        aboutText: `Melodio AI 가 직접 편곡한 차분한 BGM 채널입니다. 컨셉: ${preset.desc}`,
        channelTags: '로파이, BGM, 플레이리스트, 매장음악',
        brandColors: '#0A0A0E (Midnight Black), #C5A880 (Warm Champagne), #4A4A6A (Soft Slate)',
        logoPrompt: dbPlaybook.metadata?.logo_prompt ? `${dbPlaybook.metadata.logo_prompt}, featuring a centered emblem for '[CHANNEL_NAME]'` : `Visual Style: ${visualStyle}. cozy flat anime logo featuring '[CHANNEL_NAME]' emblem, warm amber tone --no photorealistic`,
        bannerPrompt: dbPlaybook.metadata?.banner_prompt ? `${dbPlaybook.metadata.banner_prompt}, centered typography of '[CHANNEL_NAME]'` : `Visual Style: ${visualStyle}. Widescreen banner art featuring '[CHANNEL_NAME]' in the center on a clean light-toned background --ar 16:9`,
        watermarkPrompt: `Flat vector watermark icon, minimalist play icon with rounded corners`,
        thumbnailPrompt: dbPlaybook.metadata?.thumbnail_prompt || `Visual Style: ${visualStyle}. YouTube thumbnail background matching ${preset.name} --ar 16:9`,
        thumbnailTypography: 'Title: "하루의 끝, 따뜻한 BGM" / Font: Rounded Gothic',
        videoTitleTemplate: `[BGM] ${preset.name} ｜ [비디오 일련번호]`,
        videoDescriptionTemplate: `🎧 Tracklist:\n[트랙리스트 타임코드 들어갈 자리]\n\n[🎁 Affiliate Links]\n[수익화 링크 들어갈 자리]`,
        videoTags: '감성 BGM, 로파이, 집중음악',
        pinnedComment: `오늘 하루도 수고 많으셨습니다. 🥃`
      })
    }

    // Generic fallback if there is no dbPlaybook
    return NextResponse.json({
      success: true,
      names: [
        {
          style: 'Type A (해당 국가 언어 100%)',
          desc: '로컬라이징 극대화. 현지 시청자에게 가장 자연스러운 정서적 네이밍',
          candidates: [
            { name: `단비`, desc: '지친 일상에 내리는 단비 같은 선율. [디자인가이드] 모노그램/워드마크 로고 추천.' },
            { name: `늘봄`, desc: '언제나 따뜻한 봄날 같은 감성 플레이리스트. [디자인가이드] 텍스트 중심 미니멀형 적용.' },
            { name: `여울`, desc: '잔잔하게 흐르는 물살처럼 스며드는 잔향. [디자인가이드] 1줄 가로 정렬 적용.' }
          ]
        },
        {
          style: 'Type B (영어 100%)',
          desc: '글로벌 확장성 및 범용성 최적화. 전 세계 시청자 타겟',
          candidates: [
            { name: `Vibe`, desc: '음악이 흐르는 공간 전체의 감성과 맥박. [디자인가이드] 정중앙 대형 타이포 레이아웃 추천.' },
            { name: `Echo`, desc: '깊은 밤 사색에 어울리는 잔잔한 울림. [디자인가이드] 워드마크형 로고 매칭.' },
            { name: `Aura`, desc: '고유의 은은하고 고급스러운 분위기 Core. [디자인가이드] 심플 텍스트 스타일 추천.' }
          ]
        },
        {
          style: 'Type C (국가 언어 + 영어 조합)',
          desc: '두 언어 간 시너지를 내는 트렌디한 하이브리드 네이밍',
          candidates: [
            { name: `쉼Fi`, desc: '휴식(쉼)과 로파이(Lofi) 리듬의 트렌디한 조합. [디자인가이드] 자간 축소 및 2줄 구성 추천.' },
            { name: `늘봄Wave`, desc: '따뜻한 감성과 세련된 파동 사운드. [디자인가이드] 폰트 크기 자동 축소 적용.' },
            { name: `온Beat`, desc: '온전한 소리와 리듬이 채워지는 공간. [디자인가이드] 이니셜 추출 로고화 적용.' }
          ]
        }
      ],
      handles: [
        `@danbi_beats`,
        `@neulbom_vibe`
      ],
      aboutText: `Melodio AI 가 직접 편곡한 차분한 인공지능 BGM 채널입니다. 컨셉: ${preset.desc}. 요구감성: ${customVibe || '없음'}`,
      channelTags: '로파이, 재즈, 플레이리스트, 매장음악',
      brandColors: '#0A0A0E (Midnight Black), #C5A880 (Warm Champagne), #4A4A6A (Soft Slate)',
      logoPrompt: `Visual Style: ${visualStyle}. cozy flat anime logo featuring '[CHANNEL_NAME]' emblem, warm amber tone --no photorealistic`,
      bannerPrompt: `Visual Style: ${visualStyle}. Widescreen banner art featuring '[CHANNEL_NAME]' in the center on a clean light-toned background --ar 16:9`,
      watermarkPrompt: `Flat vector watermark icon, minimalist bell icon with "구독" text`,
      thumbnailPrompt: `Visual Style: ${visualStyle}. YouTube thumbnail background, warm cozy bedroom scenery at night --ar 16:9`,
      thumbnailTypography: 'Title: "하루의 끝, 따뜻한 BGM" / Font: Rounded Gothic',
      videoTitleTemplate: `[BGM] ${preset.name} ｜ [비디오 일련번호]`,
      videoDescriptionTemplate: `🎧 Tracklist:\n[트랙리스트 타임코드 들어갈 자리]\n\n[🎁 Affiliate Links]\n[수익화 링크 들어갈 자리]`,
      videoTags: '감성 BGM, 로파이, 재즈',
      pinnedComment: `오늘 하루도 수고 많으셨습니다. 🥃`
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Branding generate error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
