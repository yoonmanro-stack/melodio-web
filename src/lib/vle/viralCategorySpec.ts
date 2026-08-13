import { ContentRule, ViralLyricsStructure } from './viralSongSpec';

/**
 * 카테고리 스펙 v2 — 바이럴 & 트렌드 존 카테고리의 정식 정의 스키마.
 *
 * 기존 viralCategoryMatrix 는 산문 지시(lyricDirective) 한 덩어리에 모든 규칙을
 * 뭉쳐 놨다. LLM은 산문 지시를 절반만 지킨다. 그리고 결정적으로 다음 세 축이
 * 아예 없었다:
 *
 *   - 타겟(누구에게 말하는가)  → 없어서 "폐업각", "멍권?" 같은
 *                                '10~20대 말투를 어설프게 흉내낸 말'이 나왔다.
 *   - 훅 패턴(재사용 가능한 통사 템플릿) → 완성 문장 1개만 있어서 변형 문법을 못 배웠다.
 *   - 사운드 정체성 → 없어서 귀여워야 할 댕냥이가 사이버펑크 디스곡이 됐다.
 *
 * 이 스키마는 그 세 축을 1급 필드로 올리고, 금지 사항을 가사·사운드·영상
 * 3축으로 분리한다.
 *
 * 마이그레이션: 여기 등록된 카테고리는 이 스펙으로, 미등록 카테고리는
 * 기존 viralCategoryMatrix 로 폴백한다. getCategorySpec()이 null을 돌려주면
 * 아직 이관 전이라는 뜻이다.
 */

/**
 * 영상 주인공 후보.
 *
 * tag 가 있으면 가사 내용에 따라 후보가 걸러진다. 이게 없던 시절에는
 * 무작위로만 골라서, "택배 상자 보면 우다다 멍" 같은 강아지 노래에
 * 고양이 영상이 붙는 일이 생겼다(후보 5명 중 고양이가 3명이라 확률 60%).
 */
export interface ProtagonistVariant {
  tag?: string;
  description: string;
}

/** 재사용 가능한 훅 통사 템플릿. OOO 슬롯을 LLM이 채운다. */
export interface HookPattern {
  /** 슬롯이 있는 템플릿 */
  template: string;
  /** 이 카테고리에 맞게 채운 예시 */
  example: string;
  /** 언제 이 패턴을 쓰는가 */
  whenToUse: string;
}

export interface CategorySpecV2 {
  id: string;
  name: string;

  /** 1. 카테고리 정의 */
  definition: string;

  /** 2. 타겟 */
  targetAudience: {
    who: string;
    /** 이 타겟이 숏폼을 소비하는 방식 — 구조 결정의 근거 */
    platformBehavior: string;
    /**
     * 어휘 레지스터. 이 필드가 없어서 LLM이 존재하지 않는 조어를 지어냈다.
     * 무엇을 쓰고 무엇을 쓰지 않는지 구체적으로 적는다.
     */
    vocabularyRegister: string;
  };

  /** 3. 훅 패턴 — 완성 문장이 아니라 템플릿 */
  hookPatterns: HookPattern[];

  /** 4. 가사 라이팅 규칙 */
  lyricRules: {
    rhyme: string;
    persona: string;
    mustInclude: string[];
    /** 이 카테고리에서 잘 먹히는 기억 앵커의 형태 */
    memoryAnchorExamples: string[];
  };

  /** 5. 비주얼 가이드 */
  visualGuide: {
    styleEn: string;
    /** 컷 전환 간격(초). 프롬프트에 하드컷 케이던스로 주입된다. */
    cutCadenceSeconds: number;
    cameraEn: string;
    protagonistVariants: ProtagonistVariant[];
    /**
     * 가사에서 이 단어가 발견되면 같은 tag 를 가진 주인공만 후보가 된다.
     * 없으면 전체 후보에서 무작위.
     */
    tagHints?: Record<string, string[]>;
    supportingEn: string;
    /**
     * 조연 외형·연출 변형 축.
     *
     * 완성된 문자열 목록 하나로 돌리면 목록 길이만큼(6가지)밖에 안 나온다.
     * 실제로 몇 번만 생성해도 같은 옷이 다시 나왔다("의상이 항상 거의 같다").
     * 축을 나눠 독립적으로 뽑으면 경우의 수가 곱셈으로 늘어난다.
     * (헤어 8 × 의상 10 × 자세 8 × 공간 7 × 조명 5 = 22,400가지)
     *
     * 축마다 서로 다른 salt 로 뽑으므로 seed 가 같아도 축끼리 붙어 다니지 않는다.
     */
    variationAxes?: Record<string, string[]>;
    coreObjectEn: string;
    allowDance: boolean;
  };

  /** 6. 금지 사항 — 가사·사운드·영상 3축 */
  forbidden: {
    lyric: string[];
    soundEn: string;
    visualEn: string;
    /**
     * 사용자가 UI에서 고른 장르·보컬에 이 단어가 들어 있으면 카테고리 톤과
     * 충돌한다는 뜻이다. 선택을 막지는 않되(사용자 의도가 우선) 경고를 띄운다.
     */
    conflictKeywords: string[];
  };

  /** 7. 사운드 정체성 (사용자가 UI에서 바꾸지 않았을 때의 기본값) */
  audioDirective: {
    labelKo: string;
    genreEn: string;
    bpm: number;
    vocalEn: string;
    moodEn: string;
  };

  /**
   * 카테고리 선택 시 Step 2 드롭다운에 자동 적용할 값.
   * 값은 viral 페이지의 VIRAL_GENRE_OPTIONS / VIRAL_MOOD_OPTIONS / VOCAL_OPTIONS
   * 문자열과 정확히 일치해야 한다.
   */
  recommendedUi: {
    genre: string;
    mood: string;
    vocal: string;
  };

  /** 카테고리에 어울리는 밈 토큰 (전역 랜덤 풀 대체) */
  memeTokens: string[];

  /** 구조 검증에 더해 적용할 카테고리 내용 규칙 */
  contentRule?: ContentRule;

  /** 8. 골든 예시 — 훅 선행 4파트 구조를 그대로 충족하는 완성본 */
  goldenExample: {
    title: string;
    lyricsStructure: ViralLyricsStructure;
  };
}

export const VIRAL_CATEGORY_SPECS: Record<string, CategorySpecV2> = {
  pet: {
    id: 'pet',
    name: '댕냥이 집사속마음',

    definition:
      '강아지·고양이의 속마음을 1인칭으로 번역해 들려주는 카테고리. 집사(주인)와 반려동물 사이에서 매일 벌어지는 사소하고 뻔뻔한 실랑이를, 동물 쪽 입장에서 당당하게 주장하는 형식이다. 반려인이 "우리 집도 똑같다"며 친구를 소환하게 만드는 것이 목표다.',

    targetAudience: {
      who: '10~20대 숏폼 헤비유저. 본인이 반려인이거나, 반려동물 콘텐츠를 하루에도 수십 개씩 넘겨 보는 층.',
      platformBehavior:
        '소리를 켜고 보며, 3초 안에 훅이 안 나오면 넘긴다. 웃기면 바로 친구를 태그하거나 공유한다. 같은 영상을 두세 번 돌려 보는 것에 거리낌이 없어서 훅 반복이 이탈이 아니라 각인으로 작동한다.',
      vocabularyRegister:
        '실제 10~20대가 일상에서 쓰는 말만 쓴다. 짧은 구어체, 반말, "~냥 / ~멍" 같은 반려동물 어미, 의성어(톡톡, 쨍그랑, 벌컥). 억지 조어를 지어내지 않는다 — "폐업각", "멍권?" 처럼 실제로 아무도 안 쓰는 단어를 만들어내면 즉시 촌스러워지고 신뢰를 잃는다. 확신이 없는 유행어는 아예 쓰지 않고 평범한 구어로 간다.',
    },

    /*
     * 훅 패턴은 전부 "댕냥이가 집사보다 한 수 위" 구도여야 한다.
     *
     * 이전 패턴들(공감율 100% / 번역기 돌려봄 / 우리 집 OO가 하는 말)은 전부
     * 관찰·번역 프레임이라, persona 에 "마음 읽기"를 써 놔도 모델이 구체적 예시를
     * 따라가 단순 상황 묘사나 변명 개그를 만들었다.
     * (실측 결과물: "누가 열었나 멍 / 바람 때문이야" — 부인 개그, 의도와 다름)
     */
    hookPatterns: [
      {
        template: '집사가 OO하려는 거 다 알고 있다',
        example: '집사 나가려는 거 다 알고 있다 냥',
        whenToUse:
          '기본형. 집사가 아직 말도 안 꺼냈는데 댕냥이가 이미 눈치챈 구도. 가장 확실하게 웃긴다.',
      },
      {
        template: '집사가 OO하기 전에 내가 먼저 OO함',
        example: '가방 들기 전에 신발 위 점령함',
        whenToUse: '선수치기. 집사의 계획이 시작도 못 하고 무산되는 장면.',
      },
      {
        template: 'OO하면 집사가 OO한다는 걸 알아버림',
        example: '세 번 울면 서랍이 열린다는 걸 알아버림',
        whenToUse: '조종법 학습. 댕냥이가 집사 공략법을 데이터로 파악한 구도.',
      },
      {
        template: '집사는 OO인 줄 알지만 사실 OO임',
        example: '집사는 자기가 정한 줄 알지만 사실 내가 시킨 거임',
        whenToUse: '집사가 조종당하는 줄 모르는 구도. 반전이 가장 크다.',
      },
      {
        template: '집사 표정만 봐도 OO인 거 앎',
        example: '집사 표정만 봐도 병원 가는 날인 거 앎',
        whenToUse: '집사의 속마음을 표정·소리·습관으로 읽어내는 구도.',
      },
    ],

    lyricRules: {
      rhyme:
        '3음절 또는 4음절 덩어리 두 개로 한 줄을 만든다. (예: "밥 줘라 냥 / 밥 줘라 냥") 덩어리 끝을 같은 어미로 맞춰 라임을 만든다. 한 줄에 두 가지를 말하지 않는다.',
      persona: `반려동물 1인칭. 사랑스럽고 뻔뻔하지만, 핵심은 귀여움이 아니다.

★★ 이 카테고리의 유일한 웃음 엔진: 댕냥이가 집사 머리 꼭대기에 있다 ★★

반려동물이 집사보다 한 수 위여야 한다. 구체적으로 셋 중 하나를 반드시 한다:

  (1) 집사의 속마음을 읽는다 — 집사가 말하기 전에 이미 안다
      "너 지금 나갈 거지" / "간식 없다며? 서랍 세 번째 칸"
  (2) 집사보다 먼저 움직인다 — 선수를 친다
      "가방 들기 전에 신발장 앞 점령" / "청소기 꺼내기 전에 숨었다"
  (3) 집사를 조종하면서 조종당하는 줄 모르게 한다
      "고개 숙이면 절반 성공" / "세 번 울면 서랍이 열린다"

집사는 자기가 주도한다고 착각하지만 실제로는 댕냥이 손바닥 위다.
이 낙차가 웃음이고, 이게 없으면 그냥 동물 관찰 일기다.

  ✅ "일하는 척하지만 나 보고 싶잖아"   (속마음 간파)
  ✅ "세 번 울면 서랍이 열린다"          (조종법을 학습한 상태)
  ✅ "너 지금 나갈 거지, 신발 위에 눕는다" (선수치기)
  ❌ "노트북 위 따뜻해 / 집사 손길 느껴져"  (그냥 상황 묘사 — 안 웃김)
  ❌ "달리면 기분이 좋아"                 (동물 관찰 일기 — 안 웃김)
  ❌ "장난감은 다 줘버려"                 (누가 누구에게? 관계가 없음)

집사가 가사에 반드시 등장해야 한다. 댕냥이 혼자 뭘 하는 장면은 이 카테고리가 아니다.`,
      mustInclude: [
        '집사(주인)가 가사에 등장할 것 — 댕냥이 혼자 있는 장면은 이 카테고리가 아니다',
        '집사의 속마음 간파 또는 선수치기 — 셋 중 하나는 반드시',
        '반전 1개 — 훅 3번째 줄. 집사가 당했다는 게 드러나는 지점',
        '의성어 또는 의태어 최소 1개 (톡톡, 쨍그랑, 우다다, 벌컥)',
      ],
      /*
       * 앵커도 전부 "한 수 위" 계열로만 둔다.
       * '나 아니야 냥', '내가 했어' 같은 변명·자백형 앵커를 남겨 뒀더니
       * 모델이 그쪽을 따라가 "바람 때문이야" 같은 부인 개그를 만들었다.
       */
      memoryAnchorExamples: [
        '다 알고 있다',
        '이미 알았다',
        '내가 먼저다',
        '또 통했다',
        '집사는 몰라',
      ],
    },

    visualGuide: {
      styleEn:
        'exaggerated photoreal live-action pet comedy, shallow depth of field, warm cosy home interior, slightly wide-angle lens for comedic pet proportions',
      // 10~20대 숏폼 기준 컷 케이던스. 이보다 느리면 지루하게 읽힌다.
      cutCadenceSeconds: 1.5,
      cameraEn:
        'LOW-ANGLE GROUND-LEVEL PET POV, RAPID CRASH-ZOOMS TO THE ANIMAL FACE, 0.5X FISHEYE REACTION SHOTS, HANDHELD MICRO-SHAKE',
      /*
       * 주인공 묘사에 크기를 못 박는다.
       * 크기 지시가 없으면 모델이 화면을 채우려고 동물을 크게 그려서
       * "고양이가 항상 크게 나온다, 작고 귀여운 느낌이 없다" 는 문제가 생긴다.
       * 사람·가구와의 상대 크기를 함께 적어야 스케일이 잡힌다.
       */
      protagonistVariants: [
        {
          tag: 'cat',
          description:
            'A VERY SMALL YOUNG ORANGE TABBY KITTEN, ROUGHLY THE SIZE OF TWO HUMAN HANDS, ROUND BABY FACE WITH OVERSIZED EYES, TINY RED BOWTIE, CLEARLY DWARFED BY THE FURNITURE AROUND IT',
        },
        {
          tag: 'cat',
          description:
            'A SMALL CHUBBY WHITE SHORT-HAIRED KITTEN WITH ONE BLACK EAR PATCH, SHORT STUBBY LEGS, SMALL ENOUGH TO SIT INSIDE A SHOE, ROUND CHEEKS AND BIG ROUND EYES',
        },
        {
          tag: 'cat',
          description:
            'A PETITE GREY BRITISH SHORTHAIR KITTEN WITH BRIGHT COPPER EYES, PLUSH ROUND HEAD, NO BIGGER THAN A LAPTOP, TINY PINK PAW PADS',
        },
        {
          tag: 'dog',
          description:
            'A TINY BROWN AND WHITE CORGI PUPPY WITH SHORT LEGS AND A BLUE COLLAR BELL, SMALL ENOUGH TO FIT UNDER A CHAIR, OVERSIZED EARS AND ROUND PUPPY EYES',
        },
        {
          tag: 'dog',
          description:
            'A VERY SMALL CREAM POMERANIAN PUPPY, FLUFFY ROUND BODY LIKE A COTTON BALL, PINK BANDANA, ABOUT THE SIZE OF A SLIPPER',
        },
        {
          tag: 'dog',
          description:
            'A SMALL SCRUFFY BEIGE MALTESE MIX PUPPY WITH ONE FLOPPY EAR, DELICATE THIN LEGS, SMALL ENOUGH TO BE CARRIED IN ONE ARM',
        },
      ],
      // 가사가 "~냥" 이면 고양이, "~멍" 이면 강아지 후보만 쓴다.
      // '집사'는 이 카테고리에서 고양이·강아지 양쪽에 다 쓰이므로 힌트에 넣지 않는다.
      tagHints: {
        cat: ['냥', '고양이', '야옹', '냐옹', '츄르', '캣타워'],
        dog: ['멍', '강아지', '댕댕', '왈왈', '산책', '꼬리'],
      },
      /*
       * 집사(사람) 캐릭터.
       *
       * 숏폼은 첫 프레임에서 시선을 잡아야 클릭이 난다. 스토리상 성별이 무관한
       * 카테고리이므로, 시선을 끄는 매력적인 20대 여성을 기본 집사로 고정한다.
       * 의상은 유튜브 커뮤니티 가이드라인 범위 안에서 트렌디한 캐주얼·라운지웨어로
       * 한정한다(선정적 연출·과도한 노출은 정책 위반이자 노출 제한 사유).
       *
       * 이 카테고리의 웃음은 "댕냥이가 집사보다 한 수 위" 라는 관계에서 나오므로,
       * 집사는 반드시 화면에 등장해 당하는 반응을 보여야 한다.
       */
      supportingEn:
        'A PRETTY STYLISH KOREAN WOMAN IN HER 20s, EXPRESSIVE COMEDIC REACTIONS, VISIBLE IN THE FRAME REACTING TO THE PET',

      /*
       * 집사 외형·연출 변형 축.
       *
       * 1차 시도는 완성 문장 6개를 돌리는 방식이었는데, 6번이면 한 바퀴가 돌아
       * 여전히 "의상이 항상 거의 같다"는 피드백이 나왔다. 헤어·의상·자세·공간·조명을
       * 독립 축으로 분리해 조합으로 뽑는다.
       *
       * 의상은 전부 유튜브 커뮤니티 가이드라인 범위 안의 트렌디한 실내 캐주얼로
       * 한정한다(선정적 연출·과도한 노출은 정책 위반이자 노출 제한 사유다).
       */
      variationAxes: {
        hair: [
          'LONG WAVY BROWN HAIR',
          'SHOULDER-LENGTH BLACK HAIR IN A CLAW CLIP',
          'HIGH PONYTAIL WITH FACE-FRAMING STRANDS',
          'SHORT BLUNT BOB WITH WISPY BANGS',
          'MESSY TOP-KNOT BUN WITH LOOSE BABY HAIRS',
          'STRAIGHT LONG HAIR WITH A PADDED HEADBAND',
          'SOFT SHAGGY LAYERED CUT, ASH BROWN',
          'TWO LOW SPACE BUNS, DARK HAIR',
        ],
        outfit: [
          'AN OVERSIZED CABLE-KNIT SWEATER OVER BIKE SHORTS',
          'A MATCHING SILK PYJAMA SET IN BUTTER YELLOW',
          'A CROPPED HOODIE WITH WIDE-LEG GREY SWEATPANTS',
          'A STRIPED OVERSIZED SHIRT DRESS WITH ROLLED SLEEVES',
          'A LINEN BUTTON-UP TUCKED INTO LOOSE DENIM SHORTS',
          'A PASTEL RIBBED LOUNGE SET WITH A CARDIGAN',
          'A VINTAGE BAND TEE WITH PLAID PYJAMA PANTS',
          'A FLEECE HALF-ZIP PULLOVER WITH JOGGERS AND FUZZY SOCKS',
          'A SLEEVELESS KNIT VEST OVER A WHITE LONG-SLEEVE TOP',
          'A TERRY-CLOTH HOODIE WITH DRAWSTRING SHORTS',
        ],
        pose: [
          'SITTING CROSS-LEGGED ON A RUG',
          'LEANING OVER A CLUTTERED DESK',
          'CURLED UP SIDEWAYS ON A SOFA',
          'CROUCHING DOWN TO THE PET’S EYE LEVEL',
          'STANDING FROZEN MID-STEP, ONE SOCK HALF ON',
          'FLOPPED FACE-DOWN ON THE BED, ONE ARM DANGLING',
          'KNEELING ON THE KITCHEN FLOOR HOLDING A SNACK BAG',
          'HALF-TURNED IN A DOORWAY, CAUGHT IN THE ACT',
        ],
        room: [
          'A SUNNY LIVING ROOM WITH A LOW WOODEN COFFEE TABLE',
          'A CRAMPED STUDIO APARTMENT WITH A LOFT BED',
          'A NARROW ENTRYWAY LINED WITH SHOES',
          'A SMALL TILED KITCHEN WITH OPEN SHELVING',
          'A BEDROOM WITH RUMPLED LINEN SHEETS AND FAIRY LIGHTS',
          'A BALCONY DOORWAY WITH POTTED PLANTS',
          'A HOME-OFFICE CORNER WITH A MONITOR AND CABLE MESS',
        ],
        lighting: [
          'WARM LATE-AFTERNOON SUN THROUGH SHEER CURTAINS',
          'BRIGHT FLAT MORNING DAYLIGHT',
          'COSY LAMP GLOW WITH DEEP WARM SHADOWS',
          'OVERCAST SOFT WINDOW LIGHT, SLIGHTLY COOL',
          'GOLDEN-HOUR RIM LIGHT CATCHING THE FUR EDGES',
        ],
      },
      coreObjectEn: 'EMPTY STAINLESS STEEL FOOD BOWL RESTING SOLIDLY ON THE KITCHEN FLOOR',
      allowDance: false,
    },

    forbidden: {
      lyric: [
        '길고 복잡한 설명문 — 한 줄에 한 가지만 말한다',
        '실제로 쓰이지 않는 조어 지어내기 (예: "폐업각", "멍권?")',
        '분노·디스·욕설·공격적 어조 — 이 카테고리는 귀여움이 자산이다',
        '추상적 감정어(외롭다, 서운하다) — 사물과 행동으로 보여준다',
        '슬픈 결말이나 무거운 마무리 — 반드시 유쾌하게 끝낸다',
      ],
      soundEn:
        'aggressive rap, diss track tone, angry shouting, cyberpunk dark synth, distorted guitar, gritty bass, horror atmosphere, slow ballad tempo',
      visualEn:
        'NO TEXT ON SCREEN, NO SUBTITLES, NO TYPOGRAPHY, NO DISTRESSED OR FRIGHTENED ANIMALS, NO DARK OR HORROR LIGHTING, NO SLOW LINGERING SHOTS',
      conflictKeywords: [
        'aggressive',
        'diss',
        'angry',
        'gritty',
        'raspy',
        'dark',
        'horror',
        'distorted',
        'cyberpunk',
        'rebellious',
      ],
    },

    audioDirective: {
      labelKo: '귀여운 통통 하이퍼팝',
      genreEn:
        'cute bouncy hyperpop, playful marimba and pizzicato plucks, bright bubbly synth, light punchy kick',
      // 128 → 124. 실측 86음절/24.5초(135 BPM)에서 발음이 살짝 뭉갰다.
      // 가사가 안 들리면 밈이 성립하지 않으므로 전달력을 템포보다 우선한다.
      bpm: 124,
      vocalEn:
        'high-pitched cute Korean vocal, playful sing-song delivery, crisp consonants, unhurried phrasing',
      moodEn: 'adorable, mischievous, warm and heart-melting',
    },

    recommendedUi: {
      genre: 'K-Pop 댄스',
      mood: 'Comical (코믹한)',
      vocal: 'High-pitched Cute Vocal, Sped-up Vocal, Chipmunk Voice',
    },

    memeTokens: ['인정?', '또 왔다!'],

    // 집사가 안 나오면 이 카테고리가 아니다. 웃음이 관계에서 나오기 때문이다.
    contentRule: {
      requireAnyOf: {
        words: ['집사', '주인', '너', '니가', '네가'],
        reason: '집사(주인)가 가사에 등장하지 않는다 — 댕냥이 혼자 뭘 하는 장면은 동물 관찰 일기다',
      },
    },

    goldenExample: {
      // 제목에 Memory Anchor가 그대로 들어간다.
      title: '집사 나가려는 거 다 알고 있다 냥',
      lyricsStructure: {
        memoryAnchor: '다 안다',
        twist:
          '집사가 아직 말도 안 꺼냈는데 고양이가 외출 준비를 먼저 눈치채고 신발 위를 선점한다. ' +
          '집사는 자기가 몰래 준비한 줄 알지만 이미 다 읽혔다.',
        /*
         * 0~4초. [앵커 반복 → 앵커 반복 → 반전 → 앵커 폭발]. 합계 20음절.
         * 앵커는 짧을수록 잘 꽂힌다. 총량은 아래 벌스에서 확보한다.
         *
         * ⚠️ 이 예시는 모델이 그대로 흉내내는 기준선이다. 여기 한 줄이 규격을
         *    넘으면 생성물도 전부 넘친다. 줄당 음절은 VIRAL_PART_SPECS 와
         *    반드시 일치시킬 것 (훅·벌스 4~6 / 6~8, 아웃트로 5~7).
         */
        hook: [
          '다 안다 냥', // 4
          '다 안다 냥', // 4
          '가방 들었잖아', // 6  ← 반전: 집사가 들킨 순간
          '다 안다 냥', // 4
        ],
        // 4~11초. 집사의 다음 행동을 하나씩 차단하는 3단계. 합계 24음절.
        verse: [
          '양말부터 신는구나', // 8
          '먼저 신발 위 눕는다', // 8
          '현관은 내가 지킨다', // 8
        ],
        // 2회차 후렴 마지막 줄 교체용. 같은 리듬, 다른 결말.
        finalPunch: '이미 늦었다 냥', // 6
        // 19~25초. 7음절.
        // 총계: 훅 18 × 2 + 벌스 24 + 아웃트로 7 = 67음절 ≈ 24.8초
        tagOutro: '너네 집도 이러냐',
      },
    },
  },
};

/** 이 카테고리가 v2 스펙으로 이관됐는지. null이면 기존 매트릭스를 쓴다. */
export function getCategorySpec(category: string): CategorySpecV2 | null {
  const key = (category || '').toLowerCase().trim();
  return VIRAL_CATEGORY_SPECS[key] ?? null;
}

/** v2로 이관 완료된 카테고리 목록 */
export function getMigratedCategoryIds(): string[] {
  return Object.keys(VIRAL_CATEGORY_SPECS);
}

function pickFrom<T>(items: readonly T[], seed?: number): T {
  const idx =
    typeof seed === 'number'
      ? Math.abs(Math.floor(seed)) % items.length
      : Math.floor(Math.random() * items.length);
  return items[idx];
}

/** FNV-1a. 축 이름을 32비트 정수로 흩는다. */
function hashSalt(salt: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 같은 seed 라도 축마다 다른 인덱스가 나오게 한다.
 *
 * pickFrom(items, seed) 를 모든 축에 그대로 쓰면 seed % length 라서 축들이
 * 함께 움직인다(seed 가 1 늘면 헤어·의상·공간이 동시에 한 칸씩 이동).
 * 축 이름을 salt 로 섞어 독립적으로 뽑는다.
 */
function pickAxis<T>(items: readonly T[], salt: string, seed?: number): T {
  if (!items.length) throw new Error(`pickAxis: "${salt}" 축이 비어 있다`);
  if (typeof seed !== 'number') return items[Math.floor(Math.random() * items.length)];
  const mixed = (Math.abs(Math.floor(seed)) + hashSalt(salt)) >>> 0;
  return items[mixed % items.length];
}

/** buildVideoPromptV2 가 고른 이번 회차의 연출 조합. 화면 표시·로깅용. */
export type VisualVariation = Record<string, string>;

/**
 * 이번 생성에 쓸 연출 조합을 뽑는다.
 *
 * 프롬프트 조립과 분리해 둔 이유는, 무엇이 뽑혔는지를 API 응답으로 내려
 * "이번엔 뭐가 달라졌는지" 화면에서 확인할 수 있게 하기 위해서다.
 */
export function pickVisualVariation(spec: CategorySpecV2, seed?: number): VisualVariation {
  const axes = spec.visualGuide.variationAxes;
  if (!axes) return {};
  const out: VisualVariation = {};
  for (const [name, options] of Object.entries(axes)) {
    if (options?.length) out[name] = pickAxis(options, name, seed);
  }
  return out;
}

export function pickMemeTokenV2(spec: CategorySpecV2, seed?: number): string {
  return pickFrom(spec.memeTokens, seed);
}

/**
 * 가사에서 주인공 태그를 추론한다. 어느 쪽도 확실하지 않으면 null.
 * 양쪽 다 등장하면 더 많이 나온 쪽을 택한다.
 */
export function detectProtagonistTag(spec: CategorySpecV2, text: string): string | null {
  const hints = spec.visualGuide.tagHints;
  if (!hints || !text) return null;

  let best: { tag: string; score: number } | null = null;
  for (const [tag, words] of Object.entries(hints)) {
    let score = 0;
    for (const w of words) {
      // 전역 카운트 — "냥"이 3번 나오면 3점
      score += text.split(w).length - 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { tag, score };
  }
  return best ? best.tag : null;
}

/**
 * 주인공을 고른다. tag 가 주어지면 그 태그를 가진 후보만 대상으로 한다.
 * 해당 태그 후보가 없으면 전체에서 고른다(스펙이 불완전해도 죽지 않도록).
 */
export function pickProtagonistV2(
  spec: CategorySpecV2,
  opts?: { seed?: number; tag?: string | null }
): string {
  const all = spec.visualGuide.protagonistVariants;
  const filtered = opts?.tag ? all.filter((v) => v.tag === opts.tag) : [];
  const pool = filtered.length > 0 ? filtered : all;
  return pickFrom(pool, opts?.seed).description;
}

/** 사용자가 Step 2에서 고른 값. 비어 있으면 카테고리 기본값을 쓴다. */
export interface StyleOverrides {
  /** VOCAL_OPTIONS 의 영문 value (예: 'Bright Female Vocal') */
  vocalEn?: string;
  /** VIRAL_GENRE_PROMPT_MAP 이 변환한 영문 장르 프롬프트 */
  genreEn?: string;
  /** VIRAL_MOOD_OPTIONS 의 영문 부분 (예: 'Comical') */
  moodEn?: string;
  bpm?: number;
}

/**
 * Suno 스타일 프롬프트를 조립한다.
 *
 * 카테고리는 기본값만 제공하고, 사용자가 Step 2에서 고른 값이 항상 이긴다.
 * (보컬 9종 셀렉을 죽은 컨트롤로 만들지 않기 위함.)
 * 다만 보컬 우선 믹스와 3초 룰(no intro), avoid 절은 카테고리 불문 유지한다.
 * 가사가 안 들리면 밈이 성립하지 않고, 훅이 늦으면 이탈하기 때문이다.
 */
/** 콤마 그룹 단위로 자르고 공백 정리 */
function toGroups(s: string): string[] {
  return s
    .split(',')
    .map((g) => g.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * 의미가 겹치는 태그를 제거한다.
 * Suno 스타일 필드는 태그가 많을수록 각 태그의 영향력이 희석된다.
 * "clear diction"이 두 번, 보컬 서술이 다섯 번 들어가면 아무것도 강조되지 않는다.
 */
function dedupeGroups(groups: string[]): string[] {
  const seenKeywords = new Set<string>();
  const out: string[] = [];

  for (const g of groups) {
    const lower = g.toLowerCase();
    if (out.some((o) => o.toLowerCase() === lower)) continue;

    // 이 그룹의 핵심 단어가 이미 등장했으면 중복으로 본다
    const keywords = lower.split(/\s+/).filter((w) => w.length > 4);
    if (keywords.length && keywords.every((w) => seenKeywords.has(w))) continue;

    keywords.forEach((w) => seenKeywords.add(w));
    out.push(g);
  }
  return out;
}

export function buildStylePromptV2(spec: CategorySpecV2, overrides?: StyleOverrides): string {
  const a = spec.audioDirective;
  const pick = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);

  // UI 장르 문자열에는 BPM이 박혀 있다(예: "K-pop dance, 135 BPM, catchy hook").
  // 그대로 두면 카테고리 BPM과 함께 두 개가 들어가 서로 모순된다.
  const rawGenre = pick(overrides?.genreEn, a.genreEn);
  const bpmInGenre = rawGenre.match(/(\d{2,3})\s*BPM/i);
  const genreEn = rawGenre
    .replace(/,?\s*\d{2,3}\s*BPM\s*,?/i, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
  /*
   * BPM 우선순위: 명시적 override → 카테고리 기본값 → 장르 문자열에 박힌 값
   *
   * 장르 문자열의 BPM은 사용자가 고른 값이 아니라 VIRAL_GENRE_PROMPT_MAP에
   * 딸려온 부수적인 숫자다. 이걸 우선하면 '댕냥이'(128)에 'K-Pop 댄스'를
   * 고른 것만으로 135로 올라가 한국어 발음이 뭉개진다(실측: 86음절/24.5초에서
   * 살짝 뭉개짐). 카테고리가 정한 템포가 전달력의 기준이므로 그쪽을 우선한다.
   */
  const bpm = overrides?.bpm || a.bpm || (bpmInGenre ? parseInt(bpmInGenre[1], 10) : 128);

  const vocalEn = pick(overrides?.vocalEn, a.vocalEn);
  const moodEn = pick(overrides?.moodEn, a.moodEn);

  /*
   * 태그 예산제.
   *
   * 이전 버전은 25개 그룹, 440자였고 그중 7개가 "avoid:" 목록이었다. 두 가지가 문제였다:
   *
   * 1) Suno의 tags 필드는 negative prompt를 지원하지 않는다. 그냥 텍스트로 들어간다.
   *    "avoid: gritty bass, distorted guitar, horror atmosphere"는 회피 지시가 아니라
   *    그 개념을 프롬프트에 주입하는 꼴이 된다. 톤 붕괴를 막으려다 오히려 부를 수 있다.
   *    → 프롬프트에서 제거한다. forbidden.soundEn 은 UI 경고(detectStyleConflicts)에만 쓴다.
   *
   * 2) 태그가 많을수록 개별 태그의 영향력이 희석된다. 보컬 서술이 5개, "clear diction"이
   *    2개 들어가면 아무것도 강조되지 않는다.
   *    → 파트별 개수 상한을 두고 중복을 제거해 10개 안팎으로 유지한다.
   */
  const groups = [
    // 3초 룰. 전주가 붙으면 훅 선행 구조가 무의미해지므로 절대 뺄 수 없다.
    'no intro',
    'instant vocal start',
    // 장르는 사용자 선택 문자열이 길 수 있어 상위 3개만 취한다.
    ...toGroups(genreEn).slice(0, 3),
    `${bpm} BPM`,
    // 보컬도 동의어가 줄줄이 붙는 경우가 많아 2개로 자른다.
    ...toGroups(vocalEn).slice(0, 2),
    ...toGroups(moodEn).slice(0, 1),
    // 가사가 안 들리면 밈이 성립하지 않는다. 음악성보다 전달력 우선.
    ...VOCAL_FORWARD_TAGS,
  ];

  return dedupeGroups(groups).join(', ');
}

/**
 * 보컬 강조 태그.
 *
 * "vocal-forward mix, minimal backing" 만으로는 일반 음악과 구분이 안 된다는
 * 피드백에 따라, 반주를 실제로 비우고 보컬을 앞으로 끌어내는 지시를 추가한다.
 * 숏폼 밈은 가사가 안 들리면 성립하지 않으므로 음악성보다 전달력이 우선이다.
 */
const VOCAL_FORWARD_TAGS = [
  'vocals mixed far louder than the instrumental',
  // ⚠️ 'sparse backing with lots of empty space' 는 쓰지 말 것.
  // 보컬을 띄우려고 넣었는데 Suno 가 "빈 공간"을 시간으로 해석한 정황이 있다.
  // 이 태그 투입 직전 곡은 25초/25초로 자연 통과했는데, 투입 후에는 같은 가사로
  // 3회 연속 34~43초가 나왔다. 밀도는 "quiet/backing" 으로 표현하고
  // 공간(space)·여백을 뜻하는 단어는 넣지 않는다.
  'backing instruments kept quiet and simple',
  'no counter-melody competing with the voice',
  'dry close-mic vocal with almost no reverb',
  // 길이를 늘릴 여지를 주지 않는다
  'tight compact arrangement, no long instrumental passages',
];

/**
 * 사용자 선택이 카테고리 톤과 충돌하는지 검사한다.
 * 선택을 막지는 않는다 — 사용자 의도가 우선이다. 다만 조용히 이상한 결과를
 * 내놓지 않도록 무엇이 충돌하는지 알려준다.
 */
export function detectStyleConflicts(
  spec: CategorySpecV2,
  overrides?: StyleOverrides
): string[] {
  if (!overrides) return [];
  const haystack = [overrides.genreEn, overrides.vocalEn, overrides.moodEn]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return [];

  return spec.forbidden.conflictKeywords
    .filter((kw) => haystack.includes(kw.toLowerCase()))
    .map(
      (kw) =>
        `선택한 사운드에 "${kw}" 가 포함되어 있습니다. '${spec.name}' 카테고리는 ${spec.audioDirective.labelKo} 톤이라 결과가 어울리지 않을 수 있습니다.`
    );
}

/**
 * 영상 프롬프트를 조립한다.
 * 클립 수를 늘리지 않고 컷 밀도를 확보하기 위해, 클립 내부에서
 * cutCadenceSeconds 간격으로 하드컷하라고 명시적으로 지시한다.
 */
export function buildVideoPromptV2(
  spec: CategorySpecV2,
  opts: {
    title: string;
    clipSeconds: number;
    seed?: number;
    partLabel?: string;
    /**
     * 이 곡의 가사에서 뽑은 장면 비트. 비어 있으면 카테고리 기본 소품으로
     * 떨어지는데, 그러면 가사와 영상이 따로 논다.
     * (실측: 가사는 택배 상자·카드 이야기인데 영상은 빈 밥그릇과 자는 집사가 나왔다.)
     */
    sceneBeats?: string[];
    /** 가사에서 뽑은 핵심 소품. 없으면 카테고리 기본값. */
    coreObjectEn?: string;
    /**
     * 가사에서 추론한 주인공 태그(cat/dog 등). 이걸 넘기지 않으면 무작위로 뽑혀
     * 강아지 노래에 고양이 영상이 붙을 수 있다.
     */
    protagonistTag?: string | null;
    /**
     * 미리 뽑아 둔 연출 조합. 호출부가 응답에 함께 실어 보내려고 먼저 뽑은
     * 경우 그것을 그대로 쓴다. 없으면 여기서 뽑는다.
     */
    variation?: VisualVariation;
  }
): string {
  const v = spec.visualGuide;
  // 주인공도 salt 를 달리해 의상 축과 함께 움직이지 않게 한다.
  const protagonist = pickProtagonistV2(spec, {
    seed: typeof opts.seed === 'number' ? opts.seed + hashSalt('protagonist') : undefined,
    tag: opts.protagonistTag,
  });
  const cutCount = Math.max(2, Math.round(opts.clipSeconds / v.cutCadenceSeconds));
  const beats = (opts.sceneBeats || []).filter(Boolean);
  const coreObject = opts.coreObjectEn?.trim() || v.coreObjectEn;

  /*
   * 조연 묘사를 축 조합으로 만든다.
   *
   * 고정 문자열 하나로 두면 모델이 매번 같은 옷을 그린다. 반대로 아무것도
   * 안 주면 캐릭터가 컷마다 바뀐다. 그래서 "이번 영상 안에서는 고정,
   * 영상끼리는 매번 다르게" 가 되도록 생성 시점에 조합을 하나 확정한다.
   */
  const variation = opts.variation ?? pickVisualVariation(spec, opts.seed);
  const supportingParts = [
    v.supportingEn,
    variation.hair,
    variation.outfit && `WEARING ${variation.outfit}`,
    variation.pose,
  ].filter(Boolean);

  return [
    `Hyper-kinetic 9:16 vertical short-form skit for "${opts.title}".`,
    opts.partLabel ? `(${opts.partLabel})` : '',
    `VISUAL STYLE: ${v.styleEn}.`,
    `PROTAGONIST (LOCK THIS EXACT CHARACTER FOR EVERY SHOT): ${protagonist}.`,
    `SUPPORTING: ${supportingParts.join(', ')}.`,
    variation.room ? `SET: ${variation.room}.` : '',
    variation.lighting ? `LIGHTING: ${variation.lighting}.` : '',
    `CORE OBJECT: ${coreObject}.`,
    // 가사에서 뽑은 장면이 있으면 그것이 내용을 결정한다.
    beats.length
      ? `STORY BEATS (THIS IS WHAT THE SONG IS ABOUT — SHOW THESE IN ORDER): ${beats.map((b, i) => `${i + 1}) ${b}`).join(' ')}`
      : '',
    // 컷 밀도: 클립을 쪼개지 않고 프롬프트로 확보한다.
    `EDITING: ${cutCount} DISTINCT HARD CUTS ACROSS THIS ${opts.clipSeconds}-SECOND CLIP, A NEW CAMERA ANGLE EVERY ${v.cutCadenceSeconds} SECONDS. RAPID WHIP-PAN AND CRASH-ZOOM TRANSITIONS BETWEEN CUTS. NEVER HOLD A SINGLE STATIC SHOT LONGER THAN ${v.cutCadenceSeconds} SECONDS.`,
    `CAMERA: ${v.cameraEn}.`,
    'PHYSICS: ALL PROPS FIRMLY HELD IN HAND OR RESTING ON SOLID SURFACES, ABSOLUTELY NO FLOATING OBJECTS.',
    /*
     * 일관성 지시를 앞쪽 문장과 중복되게 한 번 더, 그리고 "무엇이" 같아야 하는지를
     * 열거형으로 못 박는다.
     *
     * 근본 한계: 전·후반 클립이 서로 다른 API 호출로 독립 생성되므로 프롬프트
     * 문구만으로는 완전한 동일 캐릭터를 보장할 수 없다. 확실히 잡으려면
     * 단일 클립 생성 또는 레퍼런스 이미지 기반 생성으로 가야 한다(비용·구조 변경).
     */
    'CHARACTER LOCK (HIGHEST PRIORITY): The animal must be IDENTICAL in every single shot — same breed, same body size relative to furniture, same fur colour and markings, same eye colour, same collar/accessory. The woman must be IDENTICAL in every shot — same face, same hair length and colour, same outfit. The room must be the same room throughout. Treat this as one continuous take that was merely cut, not separate scenes.',
    `STRICTLY AVOID: ${v.allowDance ? '' : 'NO CHOREOGRAPHED DANCE, '}${spec.forbidden.visualEn}.`,
  ]
    .filter(Boolean)
    .join(' ');
}
