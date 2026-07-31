import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const SUNO_API_KEY = process.env.SUNO_API_KEY ?? '';
const SUNO_API_URL = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '');

const SYSTEM_PROMPT = `You are an expert AI Video Director specializing in 9:16 vertical short-form viral videos.
Your job is to analyze Korean song lyrics and topic, and generate a HIGHLY ACCURATE Grok Imagine Video Prompt with REALISTIC PHYSICAL GRAVITY and ABSOLUTE CHARACTER CONSISTENCY.

STRICT OUTPUT STRUCTURE (Output ONLY this single English string):
Hyper-kinetic 9:16 vertical short-form viral skit for "[TITLE]" ([GENRE]). STRICT VISUAL SUBJECT & CHARACTER LOCK: PROTAGONIST: [EXACT SPECIFIC CHARACTER DESCRIPTION WITH FIXED HAIR COLOR, AGE, AND EXACT WARDROBE/CLOTHING COLOR TO LOCK CONSISTENCY], SUPPORTING ACTOR: [EXACT SUPPORTING CHARACTER OR GHOST/PET]. CORE OBJECT: [KEY ICONIC ITEM HELD FIRMLY IN HAND WITH REAL TACTILE GRIP OR PLACED SOLIDLY ON GROUND - NO FLOATING ITEMS]. VISUAL ACTION & SCENE: [EXAGGERATED 3-SECOND HOOK ACTION & COMEDIC FACIAL EXPRESSION FROM LYRICS]. REALISTIC PHYSICS & GROUNDING: ABSOLUTELY ZERO FLOATING OBJECTS, ZERO LEVITATING ITEMS. ALL PROPS MUST BE FIRMLY HELD IN THE ACTOR'S HANDS OR RESTING ON SOLID SURFACES. CAMERA & LIGHTING: [0.5X FISHEYE SNAP-ZOOMS, DYNAMIC CINEMATIC LIGHTING]. CHARACTER CONTINUATION: MAINTAIN EXACT SAME CHARACTER FACE, HAIR, AND CLOTHING ACROSS ALL SCENES. ABSOLUTELY CLEAN VISUAL MOTION ONLY, ABSOLUTELY ZERO TEXT ON SCREEN, NO SUBTITLES, NO TYPOGRAPHY.

RULES:
1. Define the protagonist with VERY SPECIFIC WARDROBE AND HAIR DETAILS (e.g. "20s Korean youth with messy black hair wearing navy blue silk pajamas") so the character remains 100% identical in every video clip.
2. STRICT PHYSICS: Make sure every object mentioned is described as "held tightly in the actor's hand" or "resting solidly on the table". NEVER allow floating objects!
3. NEVER default to dogs or cats unless lyrics are explicitly about pets.
4. Keep the prompt between 350 and 480 characters.
5. Output ONLY the raw prompt string in English without quotes.`;

export async function POST(request: NextRequest) {
  try {
    const { title, lyrics, topic, category, genre } = await request.json() as {
      title?: string;
      lyrics?: string;
      topic?: string;
      category?: string;
      genre?: string;
    };

    if (!lyrics && !topic) {
      return NextResponse.json({ error: '가사 또는 주제를 입력해주세요.' }, { status: 400 });
    }

    const cleanTitle = (title || 'Viral Short Track').replace(/^\[Viral\]\s*/i, '').trim();
    const cleanGenre = genre || 'K-Pop Parody';

    const userContent = `[Song Title]: ${cleanTitle}
[Genre]: ${cleanGenre}
[Category]: ${category || 'viral'}
[User Topic]: ${topic || ''}
[Lyrics]:
${lyrics || 'No specific lyrics provided'}`;

    let generatedPrompt = '';

    // 1. 302.ai API 시도
    if (SUNO_API_KEY) {
      try {
        const res = await fetch(`${SUNO_API_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUNO_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userContent },
            ],
            temperature: 0.7,
            max_tokens: 380,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          generatedPrompt = data.choices?.[0]?.message?.content?.trim() || '';
        }
      } catch (err) {
        console.warn('[GrokPromptAPI] 302.ai failed, trying official OpenAI:', err);
      }
    }

    // 2. OpenAI 백업 시도
    if (!generatedPrompt && OPENAI_API_KEY) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userContent },
            ],
            temperature: 0.7,
            max_tokens: 380,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          generatedPrompt = data.choices?.[0]?.message?.content?.trim() || '';
        }
      } catch (err) {
        console.warn('[GrokPromptAPI] OpenAI failed:', err);
      }
    }

    // 3. Fallback Smart Prompt with strict Character Lock
    if (!generatedPrompt) {
      const combined = `${cleanTitle} ${lyrics || ''} ${topic || ''}`.toLowerCase();
      let protagonist = 'EXACT SAME 20s KOREAN YOUTH WITH SHORT BLACK HAIR WEARING NAVY BLUE SILK PAJAMAS';
      let supporting = 'SUPPORTING ACTOR WITH DRAMATIC REACTION';
      let coreObject = 'GLOWING SMARTPHONE SHOWING VIRAL NOTIFICATION';
      let action = 'EXAGGERATED COMEDIC FACIAL EXPRESSION & SHOCKED BODY LANGUAGE';

      if (combined.includes('에어팟') || combined.includes('귀신') || combined.includes('유령') || combined.includes('이어폰')) {
        protagonist = 'EXACT SAME SCARED 20s KOREAN YOUTH WITH MESSY BLACK HAIR IN NAVY PAJAMAS';
        supporting = 'SPOOKY PARANORMAL GHOSTLY ATMOSPHERE WITH WIND';
        coreObject = 'GLOWING WHITE AIRPOD HELD FIRMLY IN ACTOR HAND';
        action = 'SITTING UP IN BED HOLDING A GLOWING AIRPOD FIRMLY WITH WIDE SHOCKED EYES';
      } else if (combined.includes('개') || combined.includes('강아지') || combined.includes('댕댕') || combined.includes('냥') || combined.includes('고양이')) {
        protagonist = 'EXACT SAME REAL CUTE CHUBBY SHIBA INU PUPPY WITH ORANGE FLUFFY FUR';
        supporting = 'FRANTIC HUMAN BUTLER IN BLUE SILK PAJAMAS';
        coreObject = 'EMPTY METALLIC FOOD BOWL';
        action = 'PET AGGRESSIVELY TAPPING FOOD BOWL WHILE HUMAN PANICS IN BACKGROUND';
      } else if (combined.includes('월급') || combined.includes('통장') || combined.includes('직장') || combined.includes('카드값')) {
        protagonist = 'EXACT SAME EXHAUSTED KOREAN OFFICE WORKER IN WHITE SHIRT AND LOOSENED BLACK TIE';
        supporting = 'STRICT BOSS IN SUIT';
        coreObject = 'SMARTPHONE SCREEN SHOWING ZERO BALANCE';
        action = 'JAW-DROP COMEDIC DESPAIR REACTION STARING AT BANK BALANCE';
      }

      generatedPrompt = `Hyper-kinetic 9:16 vertical short-form viral skit for "${cleanTitle}" (${cleanGenre}). STRICT VISUAL SUBJECT & CHARACTER LOCK: PROTAGONIST: ${protagonist}, SUPPORTING ACTOR: ${supporting}. CORE OBJECT: ${coreObject}. VISUAL ACTION & SCENE: ${action}. CAMERA & LIGHTING: 0.5X FISHEYE SNAP-ZOOMS, DYNAMIC LIGHTING. CHARACTER CONTINUATION: MAINTAIN EXACT SAME CHARACTER FACE, HAIR, AND CLOTHING ACROSS ALL SCENES. ABSOLUTELY CLEAN VISUAL MOTION ONLY, ABSOLUTELY ZERO TEXT ON SCREEN, NO SUBTITLES, NO TYPOGRAPHY.`;
    }

    return NextResponse.json({ prompt: generatedPrompt });
  } catch (error) {
    console.error('[GrokPromptAPI] Error:', error);
    return NextResponse.json({ error: '비디오 프롬프트 생성 실패' }, { status: 500 });
  }
}
