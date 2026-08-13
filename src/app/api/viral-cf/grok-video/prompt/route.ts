import { NextRequest, NextResponse } from 'next/server';
import { getCategoryMatrix, pickProtagonist } from '@/lib/vle/viralCategoryMatrix';
import {
  CategorySpecV2,
  getCategorySpec,
  buildVideoPromptV2,
  detectProtagonistTag,
  pickVisualVariation,
} from '@/lib/vle/viralCategorySpec';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const SUNO_API_KEY = process.env.SUNO_API_KEY ?? '';
const SUNO_API_URL = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '');

/**
 * 가사에서 영상 장면 비트를 뽑는다.
 *
 * 카테고리는 룩(스타일·카메라·주인공)만 고정하고, 무엇을 보여줄지는
 * 이 곡의 가사가 결정해야 한다. 그래야 "영상이 뭘 표현하려는지 모르겠다"는
 * 문제가 사라진다.
 *
 * LLM이 실패하면 빈 배열을 돌려 카테고리 기본 소품으로 안전하게 떨어진다.
 */
async function extractSceneBeats(
  spec: CategorySpecV2,
  lyrics: string,
  topic: string
): Promise<{ sceneBeats: string[]; coreObjectEn?: string }> {
  const source = `${topic}\n${lyrics}`.trim();
  if (!source) return { sceneBeats: [] };

  const systemPrompt = `You turn Korean short-form song lyrics into concrete visual beats for an AI video generator.

The video's LOOK is already locked by the category and must not be restated:
- Style: ${spec.visualGuide.styleEn}
- Protagonist type: ${spec.name} (${spec.definition})

Your ONLY job is to decide WHAT HAPPENS ON SCREEN, taken literally from these lyrics.

RULES:
1. Output exactly 3 beats. Each beat is ONE short English sentence describing a filmable action.
2. Every beat must come from something actually named or implied in the lyrics. Do not invent unrelated props.
3. Beat 2 must depict the song's punchline / twist moment — the funniest beat.
4. Describe physical action and facial expression, not emotions or abstractions.
5. Also pick the single most important physical prop in the lyrics as "coreObject" (English, with how it is held or placed).

Return ONLY JSON: {"beats": ["...","...","..."], "coreObject": "..."}`;

  const body = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: source },
    ],
    temperature: 0.6,
    response_format: { type: 'json_object' },
  });

  const endpoints: [string, string][] = [];
  if (SUNO_API_KEY) endpoints.push([`${SUNO_API_URL}/v1/chat/completions`, SUNO_API_KEY]);
  if (OPENAI_API_KEY) endpoints.push(['https://api.openai.com/v1/chat/completions', OPENAI_API_KEY]);

  for (const [url, key] of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) continue;
      const parsed = JSON.parse(content);
      const beats = (Array.isArray(parsed.beats) ? parsed.beats : [])
        .map((b: unknown) => (typeof b === 'string' ? b.trim() : ''))
        .filter(Boolean)
        .slice(0, 3);
      if (beats.length) {
        return {
          sceneBeats: beats,
          coreObjectEn: typeof parsed.coreObject === 'string' ? parsed.coreObject.trim() : undefined,
        };
      }
    } catch {
      console.warn('[GrokPromptAPI] 장면 비트 추출 실패, 다음 엔드포인트 시도');
    }
  }

  console.warn('[GrokPromptAPI] 장면 비트 추출 불가 — 카테고리 기본 소품으로 폴백');
  return { sceneBeats: [] };
}

/**
 * 레거시 카테고리용 연출 흔들기.
 *
 * v2 스펙(variationAxes)이 없는 카테고리는 LLM 이 의상을 지어내는데,
 * 같은 시스템 프롬프트에 temperature 0.7 이면 결과가 몇 가지로 수렴한다.
 * 매 요청마다 다른 축을 지정해 강제로 흩는다.
 */
function pickLegacyStyleSeed(): string {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const wardrobe = [
    'oversized knitwear and shorts',
    'a matching lounge set',
    'a cropped hoodie and wide sweatpants',
    'a long shirt dress',
    'a linen button-up with denim',
    'a vintage band tee with pyjama pants',
    'a half-zip fleece with joggers',
    'a knit vest over a long-sleeve top',
  ] as const;
  const hair = [
    'long wavy hair',
    'a claw-clipped half-up',
    'a high ponytail',
    'a blunt bob with bangs',
    'a messy top-knot',
    'straight hair with a headband',
  ] as const;
  const palette = [
    'warm late-afternoon sun',
    'bright flat morning daylight',
    'cosy lamp glow with deep shadows',
    'cool overcast window light',
    'golden-hour rim light',
  ] as const;

  return `THIS RENDER'S MANDATORY VARIATION (do not reuse a generic default look): wardrobe based on ${pick(wardrobe)}, hair as ${pick(hair)}, lit by ${pick(palette)}. Invent the exact colours yourself — but they must match this brief, not a stock outfit.`;
}

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

    const targetCategory = category || 'trend';
    const cleanTitle = (title || 'Viral Short Track').replace(/^\[Viral\]\s*/i, '').trim();
    const cleanGenre = genre || 'K-Pop Parody';

    // v2 스펙: 카테고리는 "어떻게 보일까"(스타일·카메라·주인공)를 고정하고,
    // "무엇을 보여줄까"(장면)는 반드시 이 곡의 가사에서 뽑는다.
    //
    // 이전 버전은 가사를 아예 읽지 않고 카테고리 고정 소품만 썼다. 그래서
    // 택배 상자와 카드값을 노래하는 곡에 빈 밥그릇과 자는 집사가 나왔다.
    const specV2 = getCategorySpec(targetCategory);
    if (specV2) {
      const { sceneBeats, coreObjectEn } = await extractSceneBeats(specV2, lyrics || '', topic || '');
      // 가사가 "~멍"이면 강아지, "~냥"이면 고양이 주인공만 후보로 삼는다.
      const protagonistTag = detectProtagonistTag(specV2, `${cleanTitle}\n${topic || ''}\n${lyrics || ''}`);
      /*
       * 연출 조합은 여기서 한 번만 뽑는다.
       *
       * 프롬프트 안에서 뽑게 두면 무엇이 선택됐는지 밖에서 알 수 없어,
       * "매번 같은 옷이 나온다"는 제보가 들어와도 실제로 축이 도는지
       * 확인할 방법이 없었다. 응답에 실어 화면에서 보이게 한다.
       */
      const variation = pickVisualVariation(specV2);
      return NextResponse.json({
        prompt: buildVideoPromptV2(specV2, {
          title: cleanTitle,
          clipSeconds: 15,
          sceneBeats,
          coreObjectEn,
          protagonistTag,
          variation,
        }),
        sceneBeats,
        protagonistTag,
        variation,
        allowDance: specV2.visualGuide.allowDance,
        cutCadenceSeconds: specV2.visualGuide.cutCadenceSeconds,
        specVersion: 'v2',
      });
    }

    const categoryMatrix = getCategoryMatrix(targetCategory);
    // 주인공 고정을 회전으로 바꿔 같은 캐릭터가 매번 나오지 않게 한다.
    const protagonist = pickProtagonist(categoryMatrix);
    /*
     * 레거시 카테고리에는 v2 의 variationAxes 가 없다. 그래서 LLM 이 매번
     * 비슷한 옷을 지어냈다("의상이 항상 거의 같다"). 이번 회차에 피할 방향과
     * 잡을 방향을 무작위로 지정해 결과를 흩어 놓는다.
     */
    const styleSeed = pickLegacyStyleSeed();

    const systemPrompt = `You are an expert AI Video Director specializing in 9:16 vertical short-form viral videos.
Your job is to analyze Korean song lyrics and topic for category "${categoryMatrix.name}" (${categoryMatrix.id}), and generate a HIGHLY ACCURATE Grok Imagine Video Prompt with REALISTIC PHYSICAL GRAVITY and ABSOLUTE CHARACTER CONSISTENCY.

CATEGORY SPECIFIC VISUAL ANCHORS FOR "${categoryMatrix.name}":
- Recommended Protagonist Anchor: ${protagonist}
- Recommended Supporting Anchor: ${categoryMatrix.videoDirective.supporting}
- Recommended Core Object Anchor: ${categoryMatrix.videoDirective.coreObject}
- Recommended Action Anchor: ${categoryMatrix.videoDirective.action}
- Recommended Camera & Lighting: ${categoryMatrix.videoDirective.cameraLighting}

${styleSeed}

STRICT OUTPUT STRUCTURE (Output ONLY this single English string):
Hyper-kinetic 9:16 vertical short-form viral skit for "[TITLE]" ([GENRE]). STRICT VISUAL SUBJECT & CHARACTER LOCK: PROTAGONIST: [EXACT SPECIFIC CHARACTER DESCRIPTION WITH FIXED HAIR COLOR, AGE, AND EXACT WARDROBE/CLOTHING COLOR TO LOCK CONSISTENCY], SUPPORTING ACTOR: [EXACT SUPPORTING CHARACTER OR GHOST/PET]. CORE OBJECT: [KEY ICONIC ITEM HELD FIRMLY IN HAND WITH REAL TACTILE GRIP OR PLACED SOLIDLY ON GROUND - NO FLOATING ITEMS]. VISUAL ACTION & SCENE: [EXAGGERATED 3-SECOND HOOK ACTION & COMEDIC FACIAL EXPRESSION FROM LYRICS]. REALISTIC PHYSICS & GROUNDING: ABSOLUTELY ZERO FLOATING OBJECTS, ZERO LEVITATING ITEMS. ALL PROPS MUST BE FIRMLY HELD IN THE ACTOR'S HANDS OR RESTING ON SOLID SURFACES. CAMERA & LIGHTING: [0.5X FISHEYE SNAP-ZOOMS, DYNAMIC CINEMATIC LIGHTING]. CHARACTER CONTINUATION: MAINTAIN EXACT SAME CHARACTER FACE, HAIR, AND CLOTHING ACROSS ALL SCENES. ABSOLUTELY CLEAN VISUAL MOTION ONLY, ABSOLUTELY ZERO TEXT ON SCREEN, NO SUBTITLES, NO TYPOGRAPHY.

RULES:
1. Define the protagonist with VERY SPECIFIC WARDROBE AND HAIR DETAILS so the character remains 100% identical across scenes. Emulate category anchors where appropriate.
   The wardrobe must follow THIS RENDER'S MANDATORY VARIATION above. Consistency means "identical within this one video", NOT "the same outfit as every other video".
2. STRICT PHYSICS: Make sure every object mentioned is described as "held tightly in the actor's hand" or "resting solidly on the table". NEVER allow floating objects!
3. Keep the prompt between 350 and 480 characters.
4. Output ONLY the raw prompt string in English without quotes.`;

    const userContent = `[Song Title]: ${cleanTitle}
[Genre]: ${cleanGenre}
[Category]: ${categoryMatrix.name} (${categoryMatrix.id})
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
              { role: 'system', content: systemPrompt },
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
              { role: 'system', content: systemPrompt },
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

    // 3. Fallback Smart Prompt using Category Matrix Visual Anchors
    if (!generatedPrompt) {
      const vDir = categoryMatrix.videoDirective;
      // 폴백 프롬프트에도 이번 회차 변형을 넣는다. 넣지 않으면 LLM 실패 시마다
      // 완전히 동일한 문자열이 나가 결과가 한 가지로 굳는다.
      generatedPrompt = `Hyper-kinetic 9:16 vertical short-form viral skit for "${cleanTitle}" (${cleanGenre}). STRICT VISUAL SUBJECT & CHARACTER LOCK: PROTAGONIST: ${protagonist}, SUPPORTING ACTOR: ${vDir.supporting}. ${styleSeed} CORE OBJECT: ${vDir.coreObject}. VISUAL ACTION & SCENE: ${vDir.action}. CAMERA & LIGHTING: ${vDir.cameraLighting}. CHARACTER CONTINUATION: MAINTAIN EXACT SAME CHARACTER FACE, HAIR, AND CLOTHING ACROSS ALL SCENES. ABSOLUTELY CLEAN VISUAL MOTION ONLY, ABSOLUTELY ZERO TEXT ON SCREEN, NO SUBTITLES, NO TYPOGRAPHY.`;
    }

    return NextResponse.json({ prompt: generatedPrompt });
  } catch (error) {
    console.error('[GrokPromptAPI] Error:', error);
    return NextResponse.json({ error: '비디오 프롬프트 생성 실패' }, { status: 500 });
  }
}
