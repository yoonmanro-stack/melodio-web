/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌌 Melodio Boundless Creative Divergence & Unconstrained Lyrical Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 * 고정된 목록이나 뻔한 클리셰(특정 직업, 특정 장소 등)의 한계를 완전히 깨부수고,
 * 인간의 모든 삶, 상상력, 유머, 페이소스, 첨단 현대 사회, 역사, 미시적 일상,
 * 기상천외한 소재까지 무제한으로 발산하는 진정한 무한 창작 엔진.
 */

export interface CreativeVector {
  perspectiveType: string;       // 시점 및 시선 (예: 엉뚱한 관찰자, 절절한 주인공, 유쾌한 풍자가, 철학적 방랑자 등)
  thematicDimension: string;     // 무한 테마 차원 (현대 일상, 가족의 온기, 코믹 해학, 판타지/미래, 계절의 낭만, 인생 역전 등)
  sensoryFocus: string;          // 오감 묘사 포커스 (시각적 색채, 미각/후각, 소리와 리듬, 촉각적 질감)
  creativeDirective: string;     // 발산적 창작 지침
  uniqueEntropySeed: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🌟 8대 무한 발산 크리에이티브 스펙트럼 (Boundless Creative Spectrums)
// ─────────────────────────────────────────────────────────────────────────────
const CREATIVE_SPECTRUMS = [
  {
    type: '유쾌한 일상 해학과 반전의 미학 (Humor & Playful Irony)',
    guidance: '생활 밀착형 유머, 예상치 못한 반전, 어깨춤 절로 나는 능청스러움, 사람 냄새 나는 솔직하고 재치 넘치는 이야기.',
    sensory: '웃음소리, 왁자지껄한 대화, 활기찬 몸짓, 눈앞에 그려지는 생생한 슬랩스틱과 해학적 묘사'
  },
  {
    type: '가슴을 파고드는 진한 페이소스와 순정 (Deep Pathos & Sincere Soul)',
    guidance: '세월의 무게를 견뎌낸 이들의 묵직한 고백, 잊을 수 없는 사람에 대한 그리움, 굽이진 인생길에서 피어나는 눈물과 희망.',
    sensory: '떨리는 숨소리, 비에 젖은 거리의 냄새, 가슴 밑바닥에서 울려 퍼지는 진한 공명'
  },
  {
    type: '자유로운 낭만과 일탈의 방랑 (Wanderlust & Bohemian Freedom)',
    guidance: '답답한 일상을 벗어나 탁 트인 세상으로 떠나는 낭만, 바람 따라 구름 따라 흘러가는 호방한 기개와 로드 무비 감성.',
    sensory: '시원한 바람의 감촉, 지평선 너머 타오르는 노을, 귓가를 스치는 바퀴 굴러가는 소리'
  },
  {
    type: '따스한 가족애와 소소한 연대의 온기 (Warm Family & Community Heart)',
    guidance: '부모와 자식, 늙은 부부, 오랜 친구, 이웃 간의 말하지 않아도 통하는 진심과 서로를 보듬는 뭉클한 위로.',
    sensory: '김이 모락모락 나는 따뜻한 밥상, 거친 손을 마주 잡았을 때 전해지는 온기, 정겨운 목소리'
  },
  {
    type: '당당한 사이다 에너지와 인생 역전 (Triumphant Grit & Victory)',
    guidance: '세상의 시련 앞에 기죽지 않고 껄껄 웃으며 내 길을 가는 당당함, 쨍하고 해뜰날을 향한 폭발적인 에너지.',
    sensory: '가슴을 뻥 뚫어주는 시원한 샤우팅, 주먹을 불끈 쥐는 결기, 쏟아지는 찬란한 햇살'
  },
  {
    type: '현대 도시의 세련된 고독과 밤의 감성 (Urban Solitude & Midnight Glow)',
    guidance: '화려한 불빛 아래 혼자만의 시간을 음미하는 고요함, 레트로한 감수성, 도시인들의 비밀스러운 감정선.',
    sensory: '네온 불빛의 번짐, 차가운 유리잔의 얼음 소리, 밤공기의 차분한 냄새'
  },
  {
    type: '서정적 시심(詩心)과 사계절의 풍경 (Poetic Nature & Seasons)',
    guidance: '봄꽃의 설렘, 여름 소나기의 청량함, 가을 낙엽의 쓸쓸함, 겨울 눈꽃의 순수함을 한 편의 수채화처럼 담아낸 노랫말.',
    sensory: '흙냄새, 풀벌레 소리, 꽃잎이 흩날리는 시각적 잔상, 계절이 바뀌는 서늘한 공기'
  },
  {
    type: '기상천외하고 독창적인 세계관 (Avant-Garde & Unique Imagination)',
    guidance: '틀에 박힌 상식을 뒤흔드는 신선한 비유, 독특한 취미나 낯선 공간, 상상력을 자극하는 파격적인 스토리텔링.',
    sensory: '예측 불가능한 리듬감, 감각의 공감각적 전이, 뇌리에 꽂히는 강렬한 이미지'
  }
];

/**
 * 🎲 무한 발산 창작 벡터 생성기
 */
export function generateBoundlessCreativeVector(
  genreKey: string,
  trackIndex: number = 0,
  customSeed?: string
): CreativeVector {
  const seedString = `${customSeed || Date.now()}-${trackIndex}-${Math.random()}`;
  
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = (hash << 5) - hash + seedString.charCodeAt(i);
    hash |= 0;
  }
  const posHash = Math.abs(hash);

  const spectrum = CREATIVE_SPECTRUMS[(posHash + trackIndex * 3) % CREATIVE_SPECTRUMS.length];

  return {
    perspectiveType: spectrum.type,
    thematicDimension: spectrum.guidance,
    sensoryFocus: spectrum.sensory,
    creativeDirective: `🚀 RADICAL ORIGINALITY MANDATE (NO BOXES, NO CLICHÉS):
- DO NOT restrict yourself to predictable tropes or generic formulaic scenarios.
- Freely explore UNLIMITED human experiences: quirky daily adventures, eccentric hobbies, tender family memories, comic neighborhood sagas, grand philosophical metaphors, or unexpected moments of beauty.
- Every single song must be a freshly imagined standalone cinematic world with its own vivid rhythm, authentic voice, and unrepeatable punchline.`,
    uniqueEntropySeed: `ENTROPY-${posHash.toString(36)}-#${trackIndex + 1}`
  };
}
