import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadVLEMasterPrompt } from '@/lib/vle/vleEngine';
import {
  getCategoryMatrix,
  pickMemeToken,
  buildAudioStylePrompt,
  getAudioSummaryKo,
} from '@/lib/vle/viralCategoryMatrix';
import {
  CategorySpecV2,
  StyleOverrides,
  getCategorySpec,
  pickMemeTokenV2,
  buildStylePromptV2,
  detectStyleConflicts,
} from '@/lib/vle/viralCategorySpec';
import { buildTrendDirective } from '@/lib/vle/trendFeed';
import {
  ViralLyricsStructure,
  VIRAL_PART_SPECS,
  VIRAL_SONG_SPEC,
  buildStructureDirective,
  countSyllables,
  enforceStructureBudget,
  formatLyricsToSuno,
  stripLeakedMetaTags,
  validateStructure,
} from '@/lib/vle/viralSongSpec';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL_CHAIN = ['gpt-5.6-sol', 'gpt-5.5', 'gpt-4o', 'gpt-4o-mini'];

/**
 * v2 스펙 기반 시스템 프롬프트.
 *
 * 배치 순서가 중요하다. 참고 자료(VLE) → 카테고리 정의 → 트렌드 신호 →
 * 구조 계약(최우선). 구조 계약을 마지막에 두고 "위 문서를 덮어쓴다"고
 * 명시해야 /VLE 6섹션 구조와 충돌하지 않는다.
 */
function buildSystemPromptV2(
  spec: CategorySpecV2,
  memeToken: string,
  vleMasterMarkdown: string,
  trendDirective: string
): string {
  const a = spec.audioDirective;
  const hookPatterns = spec.hookPatterns
    .map((p, i) => `${i + 1}. 「${p.template}」\n   예: ${p.example}\n   용도: ${p.whenToUse}`)
    .join('\n');

  return `${vleMasterMarkdown}

=================================================================
카테고리 정의 — "${spec.name}" (${spec.id})
=================================================================
${spec.definition}

■ 타겟
누구: ${spec.targetAudience.who}
소비 방식: ${spec.targetAudience.platformBehavior}
어휘 레지스터 (반드시 준수): ${spec.targetAudience.vocabularyRegister}

■ 훅 패턴 — 아래 중 하나를 골라 슬롯을 채워라. 새 패턴을 발명하지 마라.
${hookPatterns}

■ 가사 라이팅 규칙
라임: ${spec.lyricRules.rhyme}
화자: ${spec.lyricRules.persona}
반드시 포함: ${spec.lyricRules.mustInclude.map((m) => `\n  - ${m}`).join('')}
이 카테고리에서 잘 먹히는 기억 앵커 형태: ${spec.lyricRules.memoryAnchorExamples.join(' / ')}

■ 사운드 정체성 (가사의 리듬과 어투가 여기에 맞아야 한다)
${a.labelKo} · ${a.bpm} BPM · ${a.vocalEn} · ${a.moodEn}

■ 금지 사항 (하나라도 어기면 실패다)
${spec.forbidden.lyric.map((f) => `  - ${f}`).join('\n')}

${trendDirective}

■ 골든 예시 — 이 길이·리듬·품질을 그대로 따르되, 소재는 반드시 새로 지어내라.
${JSON.stringify(spec.goldenExample, null, 2)}

${buildStructureDirective()}

=================================================================
OUTPUT — JSON 하나만 출력한다
=================================================================
{
  "title": "훅 패턴을 적용한 유튜브 쇼츠 제목. Memory Anchor가 제목 안에 그대로 들어가야 한다 (30자 이내)",
  "hookPatternUsed": "사용한 훅 패턴 템플릿",
  "lyricsStructure": {
    "memoryAnchor": "훅을 지배하는 2~5음절 앵커",
    "twist": "집사가 어떻게 당했는지를 한 문장으로. 가사보다 먼저 정한다. '댕냥이가 집사의 무엇을 미리 알았고, 그래서 집사의 무엇이 무산됐는가'가 반드시 들어가야 한다. 단순 변명('바람 때문이야')이나 상황 묘사는 반전이 아니다.",
    "hook": ["앵커 반복", "앵커 반복", "여기가 반전 — twist를 실제 대사로", "앵커 폭발"],
    "verse": ["1줄", "2줄", "3줄"],
    "finalPunch": "2회차 후렴의 마지막 줄을 갈아끼울 한 줄. 훅 마지막 줄과 같은 음절·리듬이되 결말이 달라야 한다. (예: 훅 '다 알고 있다 냥' → 펀치 '이미 늦었다 냥')",
    "tagOutro": "1줄"
  }
}

밈 토큰 "${memeToken}" 은 필요하면 tagOutro에 자연스럽게 녹여라. 억지로 붙이지 마라.`;
}

/** LLM 응답을 훅 선행 4파트 구조로 정규화한다. */
function normalizeStructureV2(raw: unknown): ViralLyricsStructure | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;

  const asLines = (v: unknown, max: number): string[] =>
    (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
      .map((s) => (typeof s === 'string' ? stripLeakedMetaTags(s).trim() : ''))
      .filter(Boolean)
      .slice(0, max);

  const structure: ViralLyricsStructure = {
    memoryAnchor: typeof r.memoryAnchor === 'string' ? r.memoryAnchor.trim() : '',
    twist: typeof r.twist === 'string' ? r.twist.trim() : '',
    finalPunch: typeof r.finalPunch === 'string' ? stripLeakedMetaTags(r.finalPunch).trim() : '',
    /*
     * 줄 수 상한은 스펙에서 가져온다.
     * 벌스를 4로 하드코딩해 뒀더니 3줄 규격인데도 4줄이 통과했고,
     * 그 한 줄이 곡을 6~8초 늘렸다(실측 91음절 → 34.0초).
     */
    hook: asLines(r.hook, VIRAL_PART_SPECS[0].lines),
    verse: asLines(r.verse, VIRAL_PART_SPECS[1].lines),
    tagOutro: typeof r.tagOutro === 'string' ? stripLeakedMetaTags(r.tagOutro).trim() : '',
  };

  if (!structure.hook.length) return null;
  return structure;
}

interface BriefV2 {
  title: string;
  lyricsStructure: ViralLyricsStructure;
}

async function callModelV2(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<BriefV2 | null> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) return null;
  const resJson = await response.json();
  const content = resJson.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content);
  const structure = normalizeStructureV2(parsed.lyricsStructure);
  if (!structure) return null;

  return {
    title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
    lyricsStructure: structure,
  };
}

/** v2 스펙으로 이관된 카테고리 처리 */
async function handleV2(spec: CategorySpecV2, seed?: number, overrides?: StyleOverrides) {
  const memeToken = pickMemeTokenV2(spec, seed);
  // 사용자가 Step 2에서 고른 장르·무드·보컬이 카테고리 기본값을 덮어쓴다.
  const stylePrompt = buildStylePromptV2(spec, overrides);
  const styleWarnings = detectStyleConflicts(spec, overrides);
  if (styleWarnings.length) {
    console.warn(`[producer-brief:v2] ${spec.id} 사운드 선택 충돌:`, styleWarnings.join(' | '));
  }

  const respond = (rawBrief: BriefV2, source: string) => {
    /*
     * 마지막 관문은 LLM 이 아니라 코드다.
     *
     * 이전에는 여기서 검증 결과를 로그로만 남기고 초과 가사를 그대로 내려보냈다.
     * 그래서 91음절(34.0초)짜리가 화면까지 도달했다. 이제는 내려보내기 직전에
     * 결정론적으로 잘라낸다.
     */
    const { structure, actions } = enforceStructureBudget(rawBrief.lyricsStructure);
    const brief: BriefV2 = { ...rawBrief, lyricsStructure: structure };
    if (actions.length) {
      console.warn(`[producer-brief:v2] ${spec.id} 예산 강제 적용:`, actions.join(' | '));
    }

    const validation = validateStructure(brief.lyricsStructure, spec.contentRule);
    if (!validation.ok) {
      console.warn(
        `[producer-brief:v2] ${spec.id} 구조 경고 (${source}, 노래 ${validation.sungSyllables}음절 ≈ ${validation.estimatedSeconds}초):`,
        validation.issues.join(' | ')
      );
    }
    return NextResponse.json({
      success: true,
      brief: {
        title: brief.title || spec.goldenExample.title,
        hook: brief.lyricsStructure.hook[0] || '',
        memoryAnchor: brief.lyricsStructure.memoryAnchor,
        memeToken,
        lyrics: formatLyricsToSuno(brief.lyricsStructure),
        lyricsStructure: brief.lyricsStructure,
        // 화면이 스타일 프롬프트를 직접 조립하지 않도록 서버가 내려준다.
        stylePrompt,
        styleWarnings,
        recommendedUi: spec.recommendedUi,
        audioSummary: `${spec.audioDirective.labelKo} · ${spec.audioDirective.bpm} BPM`,
        categoryId: spec.id,
        categoryName: spec.name,
        targetSeconds: `${VIRAL_SONG_SPEC.targetSecondsMin}~${VIRAL_SONG_SPEC.targetSecondsMax}`,
        // 화면이 "생성 전 예상 길이"를 보여줄 수 있도록 서버가 계산해 내려준다.
        estimatedSeconds: validation.estimatedSeconds,
        syllableBudget: {
          sung: validation.sungSyllables,
          min: VIRAL_SONG_SPEC.sungSyllablesMin,
          max: VIRAL_SONG_SPEC.sungSyllablesMax,
        },
        specVersion: 'v2',
        validation,
      },
    });
  };

  if (!OPENAI_API_KEY) {
    return respond(spec.goldenExample, 'golden example (no API key)');
  }

  const systemPrompt = buildSystemPromptV2(
    spec,
    memeToken,
    loadVLEMasterPrompt(),
    buildTrendDirective(spec.id)
  );
  const userPrompt = `카테고리 "${spec.name}" 의 새 바이럴송을 하나 만들어라. 골든 예시와 같은 소재(밥투정)를 재사용하지 말고 완전히 다른 상황을 골라라.`;

  let brief: BriefV2 | null = null;
  let usedModel = '';
  for (const model of MODEL_CHAIN) {
    try {
      const result = await callModelV2(model, systemPrompt, userPrompt);
      if (result) {
        brief = result;
        usedModel = model;
        break;
      }
    } catch {
      console.warn(`[producer-brief:v2] ${model} 실패, 다음 모델 시도`);
    }
  }

  if (!brief) return respond(spec.goldenExample, 'golden example (all models failed)');

  /*
   * 교정 재요청.
   *
   * 1회로는 부족했다. 실측: 앵커가 "다 안다냥"(4음절)이면 훅 4줄이 전부 4~6음절이 되어
   * 총 66음절로 떨어지는데(목표 80~93), 1회 교정으로 못 고치면 그대로 통과했다.
   * 분량 미달은 Suno 가 남는 자리를 반주로 메워 곡이 40초대로 늘어나는 원인이 되므로
   * 그냥 넘길 수 없다. 통과할 때까지 최대 REPAIR_ATTEMPTS 회 시도한다.
   */
  const REPAIR_ATTEMPTS = 4;

  /*
   * 후보 점수.
   *
   * 기존에는 "issues 개수가 줄었으면 채택" 이었는데, 개수는 심각도를 구분하지 못한다.
   * 총량 초과(= 곡이 30초를 넘어 과금) 1건과 어미 단조로움 3건은 같은 무게가 아니다.
   * 목표 음절에서 벗어난 거리를 주된 비용으로 두고, 나머지 문제는 부수 비용으로 센다.
   */
  const score = (v: ReturnType<typeof validateStructure>) => {
    const overflow = Math.max(0, v.sungSyllables - VIRAL_SONG_SPEC.sungSyllablesMax);
    const shortage = Math.max(0, VIRAL_SONG_SPEC.sungSyllablesMin - v.sungSyllables);
    // 초과는 과금으로 직결되므로 미달보다 3배 비싸게 매긴다.
    return overflow * 3 + shortage + v.issues.length;
  };

  let current = brief;
  let currentIssues = validateStructure(current.lyricsStructure, spec.contentRule);

  for (let attempt = 1; attempt <= REPAIR_ATTEMPTS && !currentIssues.ok && usedModel; attempt++) {
    try {
      const repaired = await callModelV2(
        usedModel,
        systemPrompt,
        `${userPrompt}

직전 결과가 구조 계약을 위반했다 (교정 ${attempt}/${REPAIR_ATTEMPTS}회차).

${buildSyllableReport(currentIssues, current.lyricsStructure)}

아래 문제를 모두 고쳐서 다시 출력하라:
${currentIssues.issues.map((i) => `- ${i}`).join('\n')}`
      );
      if (!repaired) break;
      const check = validateStructure(repaired.lyricsStructure, spec.contentRule);
      if (score(check) < score(currentIssues)) {
        current = repaired;
        currentIssues = check;
      }
      if (check.ok) {
        return respond(current, `${usedModel} (repaired x${attempt})`);
      }
    } catch {
      console.warn(`[producer-brief:v2] 교정 ${attempt}회차 실패`);
      break;
    }
  }

  // 여기까지 왔으면 LLM 교정이 실패한 것이다. respond() 안의
  // enforceStructureBudget 이 결정론적으로 잘라서 상한을 지킨다.
  return respond(current, usedModel);
}

/**
 * 줄별 실측 음절표.
 *
 * "총 91음절 — 76음절 초과" 같은 총량 지적만으로는 모델이 어느 줄을 줄여야
 * 할지 몰라 훅과 벌스를 동시에 건드리다 다른 규칙을 깬다. 어느 줄이 몇 음절
 * 넘쳤는지 표로 보여주면 그 줄만 고친다.
 */
function buildSyllableReport(
  validation: ReturnType<typeof validateStructure>,
  structure: ViralLyricsStructure
): string {
  const rows = (lines: string[], specIndex: number) => {
    const part = VIRAL_PART_SPECS[specIndex];
    const [lo, hi] = part.syllablesPerLine;
    return lines
      .map((line, i) => {
        const n = countSyllables(line);
        const mark = n > hi ? ` ← ${n - hi}음절 초과, 줄여라` : n < lo ? ` ← ${lo - n}음절 부족` : ' ✅';
        return `  ${part.labelKo}${i + 1}: "${line}" = ${n}음절 (허용 ${lo}~${hi})${mark}`;
      })
      .join('\n');
  };

  const delta = validation.sungSyllables - VIRAL_SONG_SPEC.sungSyllablesMax;
  const verdict =
    delta > 0
      ? `총 ${delta}음절을 반드시 줄여야 한다. 훅 1음절은 곡에서 2음절이므로 훅부터 줄이는 것이 가장 효율적이다.`
      : validation.sungSyllables < VIRAL_SONG_SPEC.sungSyllablesMin
        ? `총 ${VIRAL_SONG_SPEC.sungSyllablesMin - validation.sungSyllables}음절이 모자란다. 훅(앵커)은 짧게 유지하고 상황 벌스를 더 구체적으로 늘려서 채워라. 앵커를 길게 늘이지 마라.`
        : '총량은 범위 안에 있다. 줄별 문제만 고쳐라.';

  return `■ 직전 결과 실측 (노래되는 총 ${validation.sungSyllables}음절 = 훅×2 + 벌스 + 아웃트로, 추정 ${validation.estimatedSeconds}초 / 목표 ${VIRAL_SONG_SPEC.targetSecondsMin}~${VIRAL_SONG_SPEC.targetSecondsMax}초)
${rows(structure.hook || [], 0)}
${rows(structure.verse || [], 1)}
${rows(structure.tagOutro ? [structure.tagOutro] : [], 3)}

${verdict}`;
}

/**
 * 아직 v2로 이관되지 않은 11개 카테고리.
 * 40자 규칙과 구조 폐기 버그는 제거됐지만 구조는 여전히 VLE 6섹션이다.
 */
async function handleLegacy(category: string, seed?: number) {
  const matrix = getCategoryMatrix(category);
  const memeToken = pickMemeToken(matrix, seed);
  const brief = matrix.fewShotBrief;
  const ls = brief.lyricsStructure;

  const blocks: string[] = [];
  if (ls.spokenIntro) blocks.push(`[Spoken]\n${ls.spokenIntro}`);
  if (ls.visualVerse?.length) blocks.push(`[Verse]\n${ls.visualVerse.join('\n')}`);
  if (ls.buildUp?.length) blocks.push(`[Pre-Chorus]\n${ls.buildUp.join('\n')}`);
  if (ls.killerChorus?.hookMain?.length) blocks.push(`[Chorus]\n${ls.killerChorus.hookMain.join('\n')}`);
  if (ls.echoChorus?.length) blocks.push(`[Chorus]\n${ls.echoChorus.join('\n')}`);
  if (ls.tagOutro) blocks.push(`[Outro]\n${ls.tagOutro}`);

  return NextResponse.json({
    success: true,
    brief: {
      title: brief.title,
      hook: brief.hook,
      memeToken: brief.memeToken || memeToken,
      lyrics: blocks.join('\n\n'),
      lyricsStructure: ls,
      stylePrompt: buildAudioStylePrompt(matrix),
      audioSummary: getAudioSummaryKo(matrix),
      categoryId: matrix.id,
      categoryName: matrix.name,
      specVersion: 'legacy',
      note: '이 카테고리는 아직 v2 스펙으로 이관되지 않았습니다.',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      category?: string;
      seed?: number;
      // Step 2 사용자 선택. 없으면 카테고리 기본 사운드를 쓴다.
      vocalEn?: string;
      genreEn?: string;
      moodEn?: string;
    };
    const category = body.category || 'trend';
    const overrides: StyleOverrides = {
      vocalEn: body.vocalEn,
      genreEn: body.genreEn,
      moodEn: body.moodEn,
    };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const spec = getCategorySpec(category);
    return spec
      ? await handleV2(spec, body.seed, overrides)
      : await handleLegacy(category, body.seed);
  } catch (err: any) {
    console.error('[API/viral-cf/producer-brief] Exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
