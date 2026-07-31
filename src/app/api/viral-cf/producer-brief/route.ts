import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadVLEMasterPrompt } from '@/lib/vle/vleEngine';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// 🏷️ 채널 오디오 브랜딩: 밈 토큰 (Meme Token)
const MEME_TOKENS = ["딩동!", "결제 완료!", "실화냐?", "클릭 금지!", "또 샀다!", "인정?"];

interface LyricsStructureVLE5 {
  spokenIntro: string;       // 01. Spoken Intro (1~2초): 질문 대신 충격·호기심·금기 제시 (6~14음절)
  visualVerse: string[];    // 02. Visual Verse (6~8초): 머릿속 시각 사물 묘사 2줄 (카메라 촬영 가능, 정상 띄어쓰기 한글 문장)
  buildUp: string[];        // 03. Build-Up (3~4초): 갈등/긴장 고조 2줄 (문제 해결 금지)
  killerChorus: {           // 04 & 05. Killer Chorus & Echo Chorus (10~12초)
    memoryAnchor: string;   // 2~6음절 기억 앵커 (예: "또 샀다", "실화냐")
    hookMain: string[];     // 메인 킬링 훅 (Memory Anchor 중심 A A / B A)
    echoRepeat: string[];   // Echo Chorus (Memory Anchor 1~2회 집중 재반복)
  };
  tagOutro: string;         // 06. Tag Outro (2~3초): 질문/도전/댓글 유도 1줄 + Meme Token
}

interface ProducerBriefData {
  title: string;
  hook: string;
  memeToken: string;
  lyricsStructure: LyricsStructureVLE5;
}

// 🎯 VLE 5.0 사전 검증 백업 데이터
const RESEARCHED_VIRAL_BRIEFS_VLE5: Record<string, Array<{ title: string; hook: string; memeToken: string; lyricsStructure: LyricsStructureVLE5 }>> = {
  trend: [
    {
      title: "탕후루 가고 요아정 3kg 빠졌다는 내 통장 잔고 팩폭",
      hook: "요아정 토핑 세 번에 통장 눈물 팡팡!",
      memeToken: "결제 완료!",
      lyricsStructure: {
        spokenIntro: "이거 안 먹으면 요아정 세대 손해다.",
        visualVerse: [
          "탕후루 가고 디저트 천국 도착 (쿵!)",
          "토핑 추가 세 번에 잔고 눈물 팡팡"
        ],
        buildUp: [
          "달콤함은 삼 초인데 당류 백 프로",
          "내 신용카드 손가락이 떨려온다"
        ],
        killerChorus: {
          memoryAnchor: "영 칼로리",
          hookMain: [
            "맛있으면 영 칼로리~ 맛있으면 영 칼로리~",
            "내일 아침 체중계는 외면할 거다~ 맛있으면 영 칼로리~"
          ],
          echoRepeat: [
            "영 칼로리~ 영 칼로리~"
          ]
        },
        tagOutro: "너도 그래? 인정? 결제 완료! 내일 또 온다."
      }
    }
  ],
  human: [
    {
      title: "월급 250 들어왔다 1초 만에 카드값 249만원 퍼가요~♡",
      hook: "월급 250 들어왔다 1초 만에 카드값 퍼가요~♡",
      memeToken: "또 샀다!",
      lyricsStructure: {
        spokenIntro: "월급 250 입금... 1초 후 249 퍼가요~♡",
        visualVerse: [
          "택배 산이 문을 막고 카드값 웃네 (철컥!)",
          "월요일 아침 잔액 보고 지각 탑승해"
        ],
        buildUp: [
          "지하철 안에서 멍하니 명세서 열어",
          "남은 돈 만 원으로 한 달 버텨낸다"
        ],
        killerChorus: {
          memoryAnchor: "스쳐 가고",
          hookMain: [
            "월급은 스쳐 가고~ 월급은 스쳐 가고~",
            "내일도 사장님께 충성 올린다~ 월급은 스쳐 가고~"
          ],
          echoRepeat: [
            "스쳐 가고~ 스쳐 가고~"
          ]
        },
        tagOutro: "너도 남은 돈 만 원? 인정? 또 샀다! 내일도 출근이다."
      }
    }
  ]
};

function formatLyricsVLE5ToSunoPrompt(ls: LyricsStructureVLE5): string {
  const intro = `[Spoken Intro]\n"${ls.spokenIntro.replace(/"/g, '')}"`;
  const verse = `[Visual Verse]\n${ls.visualVerse.join('\n')}`;
  const buildUp = `[Build-Up]\n${ls.buildUp.join('\n')}`;
  const chorusMain = `[Killer Chorus]\n${ls.killerChorus.hookMain.join('\n')}`;
  const echoRepeat = `[Echo Chorus]\n${ls.killerChorus.echoRepeat.join('\n')}`;
  const outro = `[Tag Outro]\n"${ls.tagOutro.replace(/"/g, '')}"`;

  return `${intro}\n\n${verse}\n\n${buildUp}\n\n${chorusMain}\n\n${echoRepeat}\n\n${outro}`;
}

export async function POST(request: NextRequest) {
  let targetCategory = 'trend';
  try {
    const { category } = await request.json() as { category: string };
    targetCategory = category || 'trend';
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const randomMemeToken = MEME_TOKENS[Math.floor(Math.random() * MEME_TOKENS.length)];

    if (!OPENAI_API_KEY) {
      const list = RESEARCHED_VIRAL_BRIEFS_VLE5[targetCategory] || RESEARCHED_VIRAL_BRIEFS_VLE5.trend;
      const rawBrief = list[Math.floor(Math.random() * list.length)];
      return NextResponse.json({
        success: true,
        brief: {
          title: rawBrief.title,
          hook: rawBrief.hook,
          memeToken: rawBrief.memeToken,
          lyrics: formatLyricsVLE5ToSunoPrompt(rawBrief.lyricsStructure),
          lyricsStructure: rawBrief.lyricsStructure
        }
      });
    }

    // 📁 옵시디언 /VLE 6대 마스터 문서 파싱 주입
    const vleMasterMarkdown = loadVLEMasterPrompt();

    const systemPrompt = `${vleMasterMarkdown}

=================================================================
STRICT OUTPUT GENERATION DIRECTIVE
=================================================================
You MUST execute the VLE 5.0 pipeline defined above to generate a 26-30 SECOND viral song brief for category: "${targetCategory}".

STRICT FORMATTING & KOREAN GRAMMAR RULES:
1. Every line in visualVerse, buildUp, and killerChorus MUST be natural Korean sentences with PROPER SPACING (절대 띄어쓰기 없이 단어를 뭉쳐 쓰지 말 것!).
2. spokenIntro MUST be a 1-sentence shock/curiosity statement (6-14 syllables). NO generic intro statements!
3. tagOutro MUST include a comment trigger question + Meme Token ("${randomMemeToken}") + next video tease. NEVER use cliché lines like "다음엔 더 놀라운 상황이!".

Return ONLY a valid JSON object matching this schema:
{
  "title": "High-CTR Korean YouTube Shorts title (under 30 chars using Syntactic Pattern)",
  "hook": "3-second viral punchline hook (under 25 chars)",
  "memeToken": "${randomMemeToken}",
  "lyricsStructure": {
    "spokenIntro": "Shock intro quote line (6-14 syllables)",
    "visualVerse": [
      "Visual Scene Line 1 with proper Korean spacing (e.g. 책상 위에 텅 빈 컵만 굴러가 (쿵!))",
      "Visual Scene Line 2 with proper Korean spacing"
    ],
    "buildUp": [
      "Tension Line 1",
      "Tension Line 2"
    ],
    "killerChorus": {
      "memoryAnchor": "2-6 syllable anchor phrase",
      "hookMain": [
        "Hook Line 1 (AA/BA pattern with memoryAnchor)",
        "Hook Line 2 (Punchline)"
      ],
      "echoRepeat": [
        "Memory Anchor repeat line"
      ]
    },
    "tagOutro": "Comment trigger question + ${randomMemeToken} + Next tease"
  }
}`;

    const MODEL_CHAIN = ['gpt-5.6-sol', 'gpt-5.5', 'gpt-4o', 'gpt-4o-mini'];
    let briefData: ProducerBriefData | null = null;

    for (const model of MODEL_CHAIN) {
      try {
        const response = await fetch(OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Execute VLE 5.0 pipeline directly using VLE Obsidian Specs for category: ${targetCategory}` },
            ],
            temperature: 0.85,
            response_format: { type: "json_object" }
          }),
        });

        if (response.ok) {
          const resJson = await response.json();
          const content = resJson.choices?.[0]?.message?.content;
          if (content) {
            briefData = JSON.parse(content);
            break;
          }
        }
      } catch (e) {
        console.warn(`[Producer Brief VLE 5.0 Direct Injection] Model ${model} failed, trying next...`);
      }
    }

    if (!briefData || !briefData.lyricsStructure) {
      const list = RESEARCHED_VIRAL_BRIEFS_VLE5[targetCategory] || RESEARCHED_VIRAL_BRIEFS_VLE5.trend;
      briefData = list[Math.floor(Math.random() * list.length)];
    }

    const formattedLyrics = formatLyricsVLE5ToSunoPrompt(briefData.lyricsStructure);

    return NextResponse.json({
      success: true,
      brief: {
        title: briefData.title,
        hook: briefData.hook,
        memeToken: briefData.memeToken || randomMemeToken,
        lyrics: formattedLyrics,
        lyricsStructure: briefData.lyricsStructure
      }
    });

  } catch (err: any) {
    console.error('[API/viral-cf/producer-brief VLE 5.0] Exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
