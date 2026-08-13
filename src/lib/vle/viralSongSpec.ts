/**
 * VIRAL SONG SPEC — 25~30초 바이럴 숏폼 음원의 유일한 길이·구조 기준.
 *
 * 설계 근거 (이전 설계가 왜 실패했는가):
 *
 * 1) 길이 규격이 4개나 있었고 서로 충돌했다.
 *    - /VLE 마크다운: 26~30초 6섹션
 *    - lyrics-generator durationStructureInstruction: 8줄 / 220~255자
 *    - viralMode 룰: 40자 / 20초 / 2줄
 *    - JSON 스키마 예시: "[Ultra Short 20s, Fast Tempo 140BPM]" 하드코딩
 *    LLM은 가장 구체적이고 마지막에 오는 규격을 따르므로 40자가 이겼고,
 *    곡은 8초 분량으로 붕괴하며 메타 태그가 가사로 유출됐다.
 *
 * 2) 두 숫자 다 틀렸다. 240자 / 27초 = 초당 8.9음절이다. 랩도 그렇게 안 빠르다.
 *    한국어 노래의 알아들을 수 있는 발화 속도는 초당 3~4음절이고,
 *    쉼·호흡을 감안하면 25초 곡의 적정 총량은 80~105음절이다.
 *
 * 3) 진짜 문제는 "25초를 무엇으로 채우는가"였다. 정답은 글자 수가 아니라 반복이다.
 *    훅을 두 번 부르면 신규 작성 65음절로 100음절 분량을 만든다.
 *    → 전달력(느린 발음)과 기억률(훅 2회 노출)을 동시에 얻는다.
 *
 * 4) 구조가 플랫폼 3초 룰을 위반했다. VLE 6섹션 순서는 후렴이 4번째라
 *    25초 곡에서 훅이 12초에 도착한다. 10~20대 헤비유저는 그 전에 넘긴다.
 *    → 훅 선행 4파트로 전환한다.
 *
 * 길이·구조에 관한 숫자는 오직 이 파일에만 존재한다.
 */

export type ViralPartKey = 'hook' | 'verse' | 'hookRepeat' | 'tagOutro';

export interface ViralPartSpec {
  key: ViralPartKey;
  /** Suno 가사에 실제로 출력되는 섹션 태그 */
  sunoTag: string;
  labelKo: string;
  /** 이 파트가 차지하는 대략적 구간 (초) */
  window: [number, number];
  lines: number;
  /** 한 줄당 한글 음절 수 */
  syllablesPerLine: [number, number];
  /** 이 파트 전체의 목표 음절 합계. 줄당 범위보다 이 값이 우선한다. */
  syllableBudget: number;
  /** 새로 작성해야 하는 파트인가 (hookRepeat는 hook을 그대로 재사용) */
  isNewText: boolean;
  purposeKo: string;
}

/**
 * 훅 선행 4파트. 곡의 40%가 훅이고, 첫 프레임부터 훅이 나온다.
 */
export const VIRAL_PART_SPECS: ViralPartSpec[] = [
  {
    key: 'hook',
    sunoTag: 'Chorus',
    labelKo: '훅',
    window: [0, 4],
    lines: 4,
    /*
     * 하한을 6 → 4 로 내린다.
     * "다 안다냥"(4음절) 처럼 짧은 앵커가 오히려 잘 꽂히는데, 하한 6을 두면
     * 앵커에 군더더기를 붙이게 되어 오히려 나빠진다. 짧은 훅은 허용하고,
     * 총량은 벌스에서 채운다(아래 verse 예산 참조).
     */
    /*
     * 상한을 7 → 6 으로 내린다.
     * 훅은 두 번 불리므로 훅 1음절이 곡에서는 2음절이다. 실측 실패 사례에서
     * 훅 3번째 줄이 8~9음절로 나오며 곡 전체를 6~8음절 밀어 올렸다.
     */
    syllablesPerLine: [4, 6],
    // 훅은 두 번 불리므로 여기서 1음절 아끼면 곡에서는 2음절이 준다.
    syllableBudget: 19,
    isNewText: true,
    purposeKo:
      '첫 프레임부터 터진다. 4줄 구성은 [앵커 반복 → 앵커 반복 → 반전 → 앵커 폭발].\n   3번째 줄이 이 곡의 웃음 포인트다. 여기서 반전이 안 터지면 곡 전체가 밋밋해진다.',
  },
  {
    key: 'verse',
    sunoTag: 'Verse',
    labelKo: '상황 벌스',
    window: [4, 11],
    /*
     * 목표를 23~28초로 낮추면서 다시 3줄. 4줄로는 총량이 상한(76음절)을 넘는다.
     * 훅은 짧게(앵커 4~7음절) 두고, 부족분은 벌스 줄당 길이로 조절한다.
     */
    lines: 3,
    syllablesPerLine: [6, 8],
    syllableBudget: 23,
    isNewText: true,
    purposeKo:
      '훅이 왜 나왔는지 보여준다. 사물은 넣되 "무엇이 있다"가 아니라 "무엇을 하고 있다 + 왜"를 쓴다.\n   ❌ "거실에 쌓인 택배 상자" (그냥 재고 나열)\n   ✅ "휴지? 내가. 슬리퍼? 내가." (자백 + 리듬)\n   3줄이 같은 자리에 머물지 말고 조금씩 커져야 한다.',
  },
  {
    key: 'hookRepeat',
    sunoTag: 'Chorus',
    labelKo: '훅 반복',
    window: [11, 19],
    lines: 4,
    syllablesPerLine: [4, 6],
    syllableBudget: 19,
    isNewText: false,
    purposeKo:
      'hook과 완전히 동일한 텍스트를 다시 부른다. 새로 쓰지 않는다. 이 반복이 25초를 채우면서 동시에 기억률을 만든다.',
  },
  {
    key: 'tagOutro',
    // 별도 [Outro] 섹션을 만들지 않고 마지막 [Chorus] 끝에 붙인다.
    // 섹션 하나를 아끼는 것이 음절 몇 개 줄이는 것보다 길이에 훨씬 큰 영향을 준다.
    sunoTag: 'Chorus (마지막 줄)',
    labelKo: '태그 아웃트로',
    window: [19, 27],
    lines: 1,
    syllablesPerLine: [5, 7],
    syllableBudget: 7,
    isNewText: true,
    purposeKo: '댓글을 유발한다. 질문 또는 도전 한 줄. 마지막 후렴 끝에 덧붙는다.',
  },
];

/**
 * Suno 실측 발화 속도 (음절/초).
 *
 * 측정: 2026-08-08, pet 카테고리, 128 BPM 하이퍼팝, 하이피치 보컬
 *   [Chorus] 32 + [Verse] 31 + [Chorus 반복] 32 + [Outro] 8 = 103음절 → 32.0초
 *   103 / 32.0 = 3.22
 *
 * 이 숫자가 모든 분량 계산의 근거다. 다른 카테고리/BPM에서 실측이 나오면
 * 여기만 고치면 아래 밴드가 전부 따라온다.
 *
 * 이전 추정치(초당 3~4음절, 상한 108음절)는 108/3.22 = 33.5초로,
 * 규격 상한 30초를 애초에 넘기도록 설계돼 있었다.
 */
export const OBSERVED_SYLLABLES_PER_SECOND = 2.7;

/**
 * 실측 누적 (음절 → 초). 편차가 커서 단일 상수로는 예측이 안 된다.
 *   103 → 32.0 (3.22)   86 → 43.0 (2.00)   80 → 45.0 (1.78)
 *    75 → 25.0 (3.00)   85 → 34.6 (2.46)   91 → 34.0 (2.68)
 * 중앙값 약 2.7. 낙관적인 3.22 를 쓰던 동안 계속 초과가 났으므로
 * 보수적으로 2.7 을 기준으로 삼는다. 그래도 편차는 남으므로 최종 보장은
 * 워커의 후보 선택 + 재발행이 담당한다.
 */

/**
 * Memory Anchor 음절 상한.
 * 앵커는 훅 4줄 중 최소 2~3줄에 반복되므로, 앵커 1음절이 곡 전체로는 6~8음절이 된다.
 * 실측: 앵커 "창문 열어라 냥"(7음절) → 훅 전 줄이 9음절 → 총 104음절(예산 93 초과).
 */
export const ANCHOR_MAX_SYLLABLES = 5;

/** 파트 예산에서 총량을 유도한다. 숫자를 두 군데 적으면 반드시 어긋난다. */
const HOOK_BUDGET = VIRAL_PART_SPECS[0].syllableBudget; // 19
const VERSE_BUDGET = VIRAL_PART_SPECS[1].syllableBudget; // 23
const OUTRO_BUDGET = VIRAL_PART_SPECS[3].syllableBudget; // 7
/** 훅은 두 번 불린다: 19×2 + 23 + 7 = 68음절 ≈ 25.2초 */
const SUNG_TARGET = HOOK_BUDGET * 2 + VERSE_BUDGET + OUTRO_BUDGET;

export const VIRAL_SONG_SPEC = {
  /**
   * 목표 23~28초.
   *
   * ── 왜 이 범위인가 (과금 구조를 정확히 알고 정해야 한다) ──
   *
   * 음원(Suno)은 2분 이내 정액이다. 곡이 23초든 34초든 음원 비용은 같다.
   * 즉 길이를 줄이는 이유는 음원 과금이 아니다. 이 파일의 이전 주석이
   * "30초 과금 경계"를 음원 이야기처럼 써 놨는데 그건 틀렸다.
   *
   * 진짜 비용 절벽은 영상이다. Grok 은 15초 단위로 과금하고 기본 2클립 = 30초다.
   * 음원이 30초를 넘으면 3번째 클립이 통째로 과금된다.
   * (넘겼을 때의 완충 장치로 lib/video/fitVideoToAudio 가 마지막 프레임을
   *  최대 8초까지 고정해 클립 추가 없이 채우지만, 그 구간은 정지 화면이라
   *  품질 손해다. 애초에 안 넘기는 것이 낫다.)
   *
   * 상한 28초는 30초 절벽에서 2초의 여유를 둔 값이고,
   * 하한 23초는 그 아래로 가면 Suno 가 남는 자리를 반주로 메워
   * 오히려 곡이 늘어지기 때문이다(실측: 80음절인데 45초).
   */
  targetSecondsMin: 23,
  targetSecondsMax: 28,
  /**
   * 실제로 노래되는 총 음절 수(훅 반복 포함).
   *
   * 산술적으로는 28초 × 2.7 = 76음절까지 허용되지만, 상한을 76으로 두면
   * 상한을 꽉 채운 가사가 통과하고 실제로 28초를 넘긴다.
   * (실측 2026-08-09: 91음절 → 34.0초. 91/34.0 = 2.68 로 예측식은 맞았고,
   *  틀린 것은 91음절이 통과했다는 사실 자체였다.)
   * 그래서 상한을 72(≈26.7초)로 내려 28초까지 1.3초의 여유를 남긴다.
   */
  sungSyllablesMin: 62,
  sungSyllablesMax: 72,
  /** 목표 중앙값 — 파트 예산 합계에서 유도된다 (25.2초) */
  sungSyllablesTarget: SUNG_TARGET,
  /** 새로 작성해야 하는 음절 수 (훅 반복 제외) = 훅 19 + 벌스 23 + 아웃트로 7 */
  newSyllablesTarget: HOOK_BUDGET + VERSE_BUDGET + OUTRO_BUDGET,
  parts: VIRAL_PART_SPECS,
} as const;

/** 음절 수로 재생 시간을 추정한다. 표시·검증용이며 보장값이 아니다. */
export function estimateSeconds(sungSyllables: number): number {
  return Math.round((sungSyllables / OBSERVED_SYLLABLES_PER_SECOND) * 10) / 10;
}

/** 한글 음절만 센다. 공백·문장부호·라틴문자는 제외. */
export function countSyllables(text: string): number {
  const matched = text.match(/[가-힣]/g);
  return matched ? matched.length : 0;
}

/**
 * LLM이 가사 본문에 흘려 넣는 길이·템포 메타 태그를 제거한다.
 * (기존 버그: "[Ultra Short 20s, Fast Tempo 140BPM, Instant Vocal, End Song]" 이
 *  가사 첫 줄로 출력되어 Suno가 그것을 가사로 노래하려 했다.)
 */
export function stripLeakedMetaTags(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      // [Verse] 같은 정상 섹션 태그는 보존하고, 길이/템포 지시만 제거한다.
      return !/^\[[^\]]*(?:\d+\s*s\b|BPM|Ultra Short|Instant Vocal|End Song|Fast Tempo)[^\]]*\]$/i.test(t);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ViralLyricsStructure {
  /** 4줄. 곡의 시작이자 12초 지점에서 그대로 재사용된다. */
  hook: string[];
  /** 훅을 지배하는 2~5음절 기억 앵커. 제목·훅·후렴에 같은 문장이 들어가야 한다. */
  memoryAnchor: string;
  /**
   * 이 곡의 웃음이 터지는 지점. 한 문장으로 먼저 정하고 시작한다.
   *
   * 이 필드가 없었을 때 생성된 가사는 전부 장면 묘사로 끝났다:
   *   "거실에 쌓인 택배 상자 / 새로운 장난감 냄새 맡아" — 웃기지 않다.
   * 반면 프로토타입의 잘 된 샘플은 전부 반전이 있었다:
   *   "휴지? 내가. 슬리퍼? 내가. ... 하지만 혼내지 마, 외로웠어"
   *   "고개 숙이면 절반 성공" (강아지가 자기가 조종 중인 걸 안다)
   */
  twist: string;
  /** 3줄 */
  verse: string[];
  /**
   * 2회차 후렴의 마지막 줄을 갈아끼울 한 줄. 훅과 같은 길이·리듬이되 결말이 달라야 한다.
   * 훅을 완전히 똑같이 두 번 부르면 지루하다는 피드백에서 나온 필드.
   * (예: 훅 마지막 "다 알고 있다 냥" → 펀치 "이미 늦었다 냥")
   */
  finalPunch: string;
  /** 1줄 */
  tagOutro: string;
}

/**
 * 구조를 Suno 가사 블록으로 렌더링한다. 훅이 맨 앞에 오고, 12초 지점에서
 * 동일 텍스트가 반복된다.
 *
 * 기존 formatLyricsVLE5ToSunoPrompt 는 생성된 12줄 중 visualVerse[0] 과
 * hookMain[0] 단 2줄만 사용하고 나머지를 전부 버렸다. 그래서 화면의 [상황]
 * 블록과 실제 [가사] 블록이 서로 달랐다. 이 함수는 아무것도 버리지 않는다.
 */
export function formatLyricsToSuno(structure: ViralLyricsStructure): string {
  const clean = (s: unknown): string =>
    typeof s === 'string' ? s.replace(/["\[\]]/g, '').trim() : '';
  const cleanList = (arr: unknown, max: number): string[] =>
    (Array.isArray(arr) ? arr : []).map(clean).filter(Boolean).slice(0, max);

  const hook = cleanList(structure.hook, 4);
  const verse = cleanList(structure.verse, 3);
  const outro = clean(structure.tagOutro);
  const punch = clean(structure.finalPunch);

  const blocks: string[] = [];
  if (hook.length) blocks.push(`[Chorus]\n${hook.join('\n')}`);
  if (verse.length) blocks.push(`[Verse]\n${verse.join('\n')}`);

  /*
   * 2회차 후렴.
   *
   * 처음에는 1회차와 완전히 동일한 텍스트를 그대로 반복했는데, 사용자 피드백은
   * "훅 2회 반복이 지루하다, 매 곡이 다 그러니 더 그렇다" 였다.
   * 앵커(1·2행)는 기억을 위해 유지하고, 마지막 행만 finalPunch 로 갈아끼워
   * 같은 훅이지만 결말이 달라지게 한다.
   *
   * 태그 아웃트로는 별도 [Outro] 섹션으로 분리하지 않고 여기 붙인다.
   * Suno는 라벨링된 섹션마다 관습적 길이를 배정하므로 섹션 하나가 곧 시간이다.
   * (실측: 4섹션 86음절 → 43초. 가사가 적으면 그만큼 반주로 늘린다.)
   */
  if (hook.length) {
    const reprise = punch ? [...hook.slice(0, -1), punch] : [...hook];
    if (outro) reprise.push(outro);
    blocks.push(`[Chorus]\n${reprise.join('\n')}`);
  } else if (outro) {
    blocks.push(`[Outro]\n${outro}`);
  }

  // [End] 는 Suno에게 곡을 여기서 끝내라고 알리는 종결 마커다.
  // 이걸 뺐더니 Suno가 반주 아웃트로를 덧붙여 곡이 늘어졌다.
  blocks.push('[End]');

  return blocks.join('\n\n');
}

/**
 * 카테고리별 추가 검증 규칙.
 *
 * 구조(길이·줄 수)만 맞고 내용이 카테고리 컨셉을 벗어나는 경우를 잡는다.
 * 예: '댕냥이 집사속마음'은 집사와의 관계가 웃음의 근원인데, 집사가 가사에
 * 아예 등장하지 않으면 그냥 동물 관찰 일기가 된다.
 */
export interface ContentRule {
  /** 가사 전체에 이 중 하나는 반드시 등장해야 한다 */
  requireAnyOf?: { words: string[]; reason: string };
}

export interface StructureValidation {
  ok: boolean;
  /** 실제 노래되는 총 음절 (훅 반복 포함) */
  sungSyllables: number;
  /** 새로 작성된 음절 (훅 반복 제외) */
  newSyllables: number;
  /** sungSyllables 로 추정한 재생 시간(초). 보장값이 아니라 표시용이다. */
  estimatedSeconds: number;
  issues: string[];
}

/** 25~30초 규격 준수 여부를 검사한다. 위반 시 producer-brief가 1회 교정 재요청한다. */
export function validateStructure(
  structure: ViralLyricsStructure,
  contentRule?: ContentRule
): StructureValidation {
  const issues: string[] = [];
  const hook = (structure.hook || []).filter((l) => l && l.trim());
  const verse = (structure.verse || []).filter((l) => l && l.trim());
  const outro = (structure.tagOutro || '').trim();

  const hookSyl = countSyllables(hook.join(''));
  const verseSyl = countSyllables(verse.join(''));
  const outroSyl = countSyllables(outro);

  const newSyllables = hookSyl + verseSyl + outroSyl;
  const sungSyllables = hookSyl * 2 + verseSyl + outroSyl;

  const hookSpec = VIRAL_PART_SPECS[0];
  const verseSpec = VIRAL_PART_SPECS[1];
  const outroSpec = VIRAL_PART_SPECS[3];

  if (hook.length !== hookSpec.lines) {
    issues.push(`훅: 정확히 ${hookSpec.lines}줄 필요, ${hook.length}줄 생성됨`);
  }
  if (verse.length !== verseSpec.lines) {
    issues.push(`상황 벌스: 정확히 ${verseSpec.lines}줄 필요, ${verse.length}줄 생성됨`);
  }
  if (!outro) {
    issues.push('태그 아웃트로 누락 — 댓글 유발 문장이 없다');
  }

  if (!(structure.twist || '').trim()) {
    issues.push('twist 누락 — 반전이 없으면 장면 묘사로 끝나고 아무도 안 웃는다');
  }

  // 카테고리 컨셉 이탈 검사
  if (contentRule?.requireAnyOf) {
    const { words, reason } = contentRule.requireAnyOf;
    const body = [...hook, ...verse, outro, structure.finalPunch || ''].join(' ');
    if (!words.some((w) => body.includes(w))) {
      issues.push(`${reason} (${words.join(' / ')} 중 하나가 가사에 없다)`);
    }
  }

  /*
   * 음절 때우기 검출.
   *
   * 1차 버전은 "한 줄에 필러 토큰 2개 이상"만 잡아서 실제 사례를 거의 놓쳤다.
   *   "여기 눕자 냥"        → 냥 1개라 통과 (하지만 모든 줄이 냥으로 끝나 단조로움)
   *   "올라가다 멍 올라가다" → 멍이 문장 한가운데 박힌 순수 음절 때우기인데 통과
   *
   * 그래서 두 가지를 본다:
   *   (a) 동물 어미가 줄 중간에 있는가 → 무조건 음절 때우기다
   *   (b) 훅 4줄 중 3줄 이상이 같은 어미로 끝나는가 → 단조로움
   */
  const ANIMAL_SUFFIXES = ['냥', '멍', '옹'];
  const FILLER_TOKENS = ['또', '야', '음', '아', '어'];

  [...hook, ...verse].forEach((line) => {
    const tokens = line.replace(/[?!.,~]/g, '').split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return;

    // (a) 동물 어미가 마지막 토큰이 아닌 위치에 단독으로 있으면 음절 때우기
    const midFiller = tokens
      .slice(0, -1)
      .filter((t) => ANIMAL_SUFFIXES.includes(t));
    if (midFiller.length > 0) {
      issues.push(
        `"${line}" — "${midFiller[0]}"이(가) 문장 중간에 박혀 있다. 음절을 채우려고 넣은 말이라 뜻이 없다. 줄을 짧게 두거나 실제 의미가 있는 단어를 써라`
      );
    }

    const genericFiller = tokens.filter((t) => FILLER_TOKENS.includes(t));
    if (genericFiller.length >= 2) {
      issues.push(`"${line}" — 의미 없는 음절 때우기(${genericFiller.join(', ')})가 반복된다`);
    }
  });

  // (b) 훅 4줄이 전부 같은 어미로 끝나면 리듬이 단조로워진다
  if (hook.length >= 3) {
    const endings = hook.map((l) => {
      const t = l.replace(/[?!.,~]/g, '').trim().split(/\s+/);
      return t[t.length - 1] || '';
    });
    for (const suffix of ANIMAL_SUFFIXES) {
      const count = endings.filter((e) => e === suffix || e.endsWith(suffix)).length;
      if (count >= hook.length) {
        issues.push(
          `훅 ${hook.length}줄이 전부 "${suffix}"(으)로 끝난다 — 최소 한 줄은 다른 어미로 끝내 리듬에 변화를 줘라`
        );
      }
    }
  }

  const anchor = (structure.memoryAnchor || '').trim();
  if (!anchor) {
    issues.push('memoryAnchor 누락 — 훅을 지배하는 기억 앵커가 없으면 리플레이가 안 생긴다');
  } else {
    if (hook.length && !hook.some((l) => l.includes(anchor))) {
      issues.push(`memoryAnchor "${anchor}" 가 훅 4줄 어디에도 없다 — 훅과 앵커가 따로 논다`);
    }
    // 앵커가 길면 훅 한 줄이 통째로 넘친다.
    // (실측: 앵커 "창문 열어라 냥"(7음절) → 훅 전 줄이 9음절 → 총 104음절)
    // 앵커는 훅에서 두 번 이상 반복되므로 5음절이 상한이다.
    const anchorSyl = countSyllables(anchor);
    if (anchorSyl > ANCHOR_MAX_SYLLABLES) {
      issues.push(
        `memoryAnchor "${anchor}" 가 ${anchorSyl}음절 — ${ANCHOR_MAX_SYLLABLES}음절 이하로 줄여라. 앵커가 길면 훅 4줄이 전부 넘쳐 총량을 초과한다`
      );
    }
  }

  // 줄별 음절 초과는 전달력 문제다. 발음이 뭉개지면 밈이 성립하지 않는다.
  const checkLines = (lines: string[], spec: ViralPartSpec) => {
    lines.forEach((line, i) => {
      const n = countSyllables(line);
      const [lo, hi] = spec.syllablesPerLine;
      if (n > hi) {
        issues.push(`${spec.labelKo} ${i + 1}번째 줄이 ${n}음절 — ${hi}음절 초과 시 발음이 빨라져 전달력이 떨어진다`);
      } else if (n < lo) {
        issues.push(`${spec.labelKo} ${i + 1}번째 줄이 ${n}음절 — ${lo}음절 미만이면 리듬이 비어 늘어진다`);
      }
    });
  };
  checkLines(hook, hookSpec);
  checkLines(verse, verseSpec);
  if (outro) checkLines([outro], outroSpec);

  if (sungSyllables < VIRAL_SONG_SPEC.sungSyllablesMin) {
    issues.push(
      `총 ${sungSyllables}음절 — ${VIRAL_SONG_SPEC.sungSyllablesMin}음절 미만이면 Suno가 ${VIRAL_SONG_SPEC.targetSecondsMin}초를 못 채우고 무반주로 늘어진다`
    );
  }
  if (sungSyllables > VIRAL_SONG_SPEC.sungSyllablesMax) {
    issues.push(
      `총 ${sungSyllables}음절 — ${VIRAL_SONG_SPEC.sungSyllablesMax}음절 초과 시 발음이 빨라지고, 곡이 30초를 넘으면 영상 클립이 2개에서 3개로 늘어 과금된다`
    );
  }

  return {
    ok: issues.length === 0,
    sungSyllables,
    newSyllables,
    estimatedSeconds: estimateSeconds(sungSyllables),
    issues,
  };
}

/**
 * 결정론적 예산 강제.
 *
 * LLM 교정(producer-brief 의 repair 루프)은 확률적이라 통과를 보장하지 못한다.
 * 실측 2026-08-09: 4줄짜리 벌스와 9음절 훅이 그대로 통과해 91음절 → 34.0초가 나왔다.
 * 그래서 마지막에 코드가 확정적으로 자른다.
 *
 * 자를 때는 줄 단위로만 버린다. 한 줄 안에서 글자를 잘라내면 조사가 끊겨
 * 한국어 문장이 깨지기 때문이다. 그래서 이 함수가 할 수 있는 일은
 *   (1) 규격 초과 줄 수를 버리고
 *   (2) 그래도 넘치면 벌스를 최소 2줄까지 줄이는 것
 * 두 가지뿐이다. 훅 줄이 통째로 길어서 넘치는 경우는 여기서 못 고치므로
 * 호출부가 재생성/후보 선택으로 처리해야 한다.
 */
export function enforceStructureBudget(structure: ViralLyricsStructure): {
  structure: ViralLyricsStructure;
  actions: string[];
} {
  const actions: string[] = [];
  const hookSpec = VIRAL_PART_SPECS[0];
  const verseSpec = VIRAL_PART_SPECS[1];

  const hook = (structure.hook || []).filter((l) => l && l.trim());
  let verse = (structure.verse || []).filter((l) => l && l.trim());

  const trimmedHook = hook.slice(0, hookSpec.lines);
  if (hook.length > hookSpec.lines) {
    actions.push(`훅 ${hook.length}줄 → ${hookSpec.lines}줄로 잘랐다`);
  }
  if (verse.length > verseSpec.lines) {
    actions.push(`벌스 ${verse.length}줄 → ${verseSpec.lines}줄로 잘랐다`);
    verse = verse.slice(0, verseSpec.lines);
  }

  const outro = (structure.tagOutro || '').trim();
  const sung = () =>
    countSyllables(trimmedHook.join('')) * 2 +
    countSyllables(verse.join('')) +
    countSyllables(outro);

  // 벌스는 최소 2줄까지만 줄인다. 1줄이 되면 상황 설명이 성립하지 않는다.
  while (sung() > VIRAL_SONG_SPEC.sungSyllablesMax && verse.length > 2) {
    const dropped = verse.pop();
    actions.push(`총량 초과로 벌스 마지막 줄("${dropped}")을 버렸다`);
  }

  return {
    structure: { ...structure, hook: trimmedHook, verse },
    actions,
  };
}

/**
 * LLM 프롬프트에 주입할 구조 계약문.
 * VLE 마크다운 뒤에 배치하고 "이 계약이 위 문서를 덮어쓴다"고 명시해야
 * /VLE 6섹션 구조와 충돌하지 않는다.
 */
export function buildStructureDirective(): string {
  const rows = VIRAL_PART_SPECS.map((p, i) => {
    const [lo, hi] = p.syllablesPerLine;
    const newTag = p.isNewText
      ? `  → 이 파트 합계 ${p.syllableBudget}음절`
      : '  ※ 새로 쓰지 말 것 — 훅과 완전히 동일한 텍스트를 그대로 재사용';
    return `${i + 1}. ${p.labelKo} [${p.sunoTag}] — ${p.window[0]}~${p.window[1]}초 · ${p.lines}줄 · 줄당 ${lo}~${hi}음절${newTag}
   ${p.purposeKo}`;
  }).join('\n\n');

  const hook = VIRAL_PART_SPECS[0].syllableBudget;
  const verse = VIRAL_PART_SPECS[1].syllableBudget;
  const outro = VIRAL_PART_SPECS[3].syllableBudget;

  return `=================================================================
STRUCTURE CONTRACT (최우선 — 위 문서의 길이·순서 규정을 모두 덮어쓴다)
=================================================================
목표 재생 시간: ${VIRAL_SONG_SPEC.targetSecondsMin}~${VIRAL_SONG_SPEC.targetSecondsMax}초

■ 분량 계산 (실측 기준: Suno는 한국어를 초당 ${OBSERVED_SYLLABLES_PER_SECOND}음절로 부른다)

    훅 ${hook}음절 × 2회(반복) + 벌스 ${verse}음절 + 아웃트로 ${outro}음절
      = 노래되는 총 ${hook * 2 + verse + outro}음절
      ÷ ${OBSERVED_SYLLABLES_PER_SECOND}음절/초
      = 약 ${Math.round((hook * 2 + verse + outro) / OBSERVED_SYLLABLES_PER_SECOND)}초  ✅

  허용 범위: 총 ${VIRAL_SONG_SPEC.sungSyllablesMin}~${VIRAL_SONG_SPEC.sungSyllablesMax}음절.
  ${VIRAL_SONG_SPEC.sungSyllablesMax}음절을 넘기면 ${VIRAL_SONG_SPEC.targetSecondsMax}초를 초과한다.
  (실측: 91음절이 통과했더니 정확히 34.0초가 나왔다. 이 계산식은 빗나가지 않는다.)
  각 파트의 "합계" 예산을 지켜라. 줄당 범위의 최대값을 모든 줄에 쓰면 총량이 초과된다.
  새로 작성하는 음절은 ${VIRAL_SONG_SPEC.newSyllablesTarget}음절뿐이다(훅 반복은 공짜다).

■ 3초 룰: 곡은 전주 없이 훅부터 시작한다. 첫 프레임에 이미 후렴이 터져 있어야 한다.
  인트로·빌드업으로 시간을 쓰지 않는다. 10~20대 숏폼 유저는 훅이 늦으면 넘긴다.

■ 25초는 글자를 늘려서 채우는 게 아니라 훅을 반복해서 채운다.
  음절이 위 범위를 넘으면 Suno가 발음을 밀어붙여 가사가 안 들리고, 밈이 성립하지 않는다.

${rows}

절대 규칙:
1. Memory Anchor는 최대 ${ANCHOR_MAX_SYLLABLES}음절이다. 이게 가장 자주 어기는 규칙이다.
   앵커는 훅에서 2~3번 반복되므로 앵커 1음절이 곡 전체로는 6~8음절로 불어난다.
   ✅ "밥 줘라 냥"(4) "또 샀다"(3) "내일부터"(4)
   ❌ "창문 열어라 냥"(7) → 훅 네 줄이 전부 9음절이 되어 총량을 초과한다
   앵커가 길어질 것 같으면 소재를 바꿔서라도 짧은 앵커를 만들어라.

2. 훅 4줄은 그 Memory Anchor가 지배한다: 반복 → 반복 → 변형 → 폭발.
   (예: "또 샀다 / 또 샀다 / 안 산다며? / 또 샀다!!")
2-1. 음절을 채우려고 의미 없는 말을 덧붙이지 마라. 이게 재미를 죽이는 주범이다.
   ❌ "또 샀다 냥 또 냥"  — 뒤의 "또 냥"은 음절 때우기다. 아무 뜻이 없다.
   ✅ "또 샀다 냥 또 샀다"  또는  "또 샀다 냥 세 번째"
   한 줄이 목표 음절에 못 미치면 필러를 넣지 말고 줄 자체를 짧게 둬라.

3. Memory Anchor는 제목·훅·후렴에 같은 문장으로 들어간다. 미묘하게 다르게 쓰지 않는다.
   ("간식 내놔라 멍멍!" 과 "간식 줘라 멍! 멍!" 처럼 어긋나면 기억에 안 남는다.)
4. 가사 본문에 [Ultra Short 20s], [Fast Tempo 140BPM], [Instant Vocal], [End Song] 같은
   길이·템포 메타 태그를 절대 쓰지 않는다. Suno가 그것을 가사로 읽어 노래해 버린다.
   템포 지시는 오직 스타일 프롬프트에만 존재한다.
5. 모든 줄은 소리 내어 읽어서 한국인이 즉시 이해하고 웃을 수 있어야 한다.
   존재하지 않는 조어("폐업각", "멍권?"), 번역투, 조사 없는 명사 나열은 금지한다.
6. 길고 복잡한 설명문 금지. 3음절·4음절 덩어리 두 개로 한 줄을 만든다.`;
}
