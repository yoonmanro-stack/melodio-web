/**
 * 바이럴 & 트렌드 존 12개 카테고리 매트릭스 (레거시 / 이관 대기).
 *
 * ⚠️ 이 파일은 viralCategorySpec.ts (CategorySpecV2) 로 이관 중이다.
 * 이관 완료된 카테고리는 그쪽 스펙을 쓰고, 아직 안 된 카테고리만 여기를 쓴다.
 * 이관 순서: pet(완료) → 나머지 11개.
 *
 * 여기 남아 있는 구조는 VLE 6섹션(Spoken→Verse→Build-Up→Chorus→Echo→Tag)이며,
 * 후렴이 12초에 도착해 3초 룰을 위반한다. 이관 시 훅 선행 4파트로 전환된다.
 *
 * 카테고리 하나는 세 개의 축을 전부 가져야 한다:
 *   1) lyricDirective  — 무엇을 말할까 (가사 톤)
 *   2) audioDirective  — 어떻게 들릴까 (사운드 정체성)   ← 기존에 없던 축
 *   3) videoDirective  — 어떻게 보일까 (영상 연출)
 *
 * 기존에는 (2)가 없어서, 사운드가 전역 드롭다운 기본값 + 하드코딩된
 * "B-grade meme energy / diss / cyberpunk" 접미사로 결정됐다. 그 결과
 * '댕냥이 집사 속마음'처럼 귀여워야 하는 카테고리가 분노한 사이버펑크
 * 디스곡으로 렌더링됐다. audioDirective.forbiddenEn 이 그 재발을 막는다.
 */

/** 사운드 정체성. 카테고리마다 반드시 달라야 한다. */
export interface AudioDirective {
  labelKo: string;
  /** 장르·편성 (영문, Suno 스타일 프롬프트용) */
  genreEn: string;
  bpm: number;
  /** 보컬 캐릭터 (영문) */
  vocalEn: string;
  /** 무드 (영문) */
  moodEn: string;
  /**
   * 이 카테고리에 절대 들어가면 안 되는 사운드. 스타일 프롬프트에
   * negative 지시로 주입되어 톤 붕괴를 차단한다.
   */
  forbiddenEn: string;
}

export interface VideoDirective {
  /**
   * 주인공 후보. 매 생성 시 회전시켜 같은 캐릭터가 반복되지 않게 한다.
   * (기존에는 카테고리당 주인공이 1명 고정이라 pet 영상은 언제나
   *  동일한 '빨간 보타이 오렌지 태비 고양이'였다 → 채널이 봇처럼 보인다.)
   */
  protagonistVariants: string[];
  supporting: string;
  coreObject: string;
  action: string;
  cameraLighting: string;
  /** 카테고리별 연출 에너지. grok-video 라우트가 이 값을 쓴다. */
  energyEn: string;
  /** 이 카테고리에서 춤/안무가 자연스러운가 (challenge, trend 등은 true) */
  allowDance: boolean;
}

/**
 * 레거시 6섹션 가사 구조 (VLE LYRICS_SCHEMA 기반).
 * 이관 완료된 카테고리는 viralSongSpec 의 훅 선행 4파트를 쓴다.
 */
export interface LegacyLyricsStructure {
  spokenIntro: string;
  visualVerse: string[];
  buildUp: string[];
  killerChorus: {
    memoryAnchor: string;
    hookMain: string[];
  };
  echoChorus: string[];
  tagOutro: string;
}

export interface CategoryMatrixEntry {
  id: string;
  name: string;
  description: string;
  lyricDirective: string;
  /** 카테고리 성격에 맞는 밈 토큰. 전역 랜덤 풀을 대체한다. */
  memeTokens: string[];
  audioDirective: AudioDirective;
  videoDirective: VideoDirective;
  fewShotBrief: {
    title: string;
    hook: string;
    memeToken: string;
    lyricsStructure: LegacyLyricsStructure;
  };
}

/** 화면 노출 순서 = 정식 카테고리 목록. 다른 곳에서 키를 다시 나열하지 말 것. */
export const VIRAL_CATEGORY_ORDER = [
  'drama',
  'pet',
  'relationship',
  'human',
  'trend',
  'challenge',
  'brand',
  'history',
  'parenting',
  'food_diet',
  'horror_mystery',
  'ai_future',
] as const;

export type ViralCategoryId = (typeof VIRAL_CATEGORY_ORDER)[number];

export const VIRAL_CATEGORY_MATRIX: Record<string, CategoryMatrixEntry> = {
  drama: {
    id: 'drama',
    name: 'K-드라마 명대사',
    description: '막장 드라마, 복수극, 멜로 명대사를 현실 상황으로 끌어내린 패러디 숏폼',
    lyricDirective:
      '드라마 명대사의 비장한 어조를 그대로 가져오되, 내용은 연차·카드값·야근처럼 사소한 현실로 떨어뜨려 낙차를 만든다. 대사체 반말, 상대 이름을 부르는 호칭형 훅이 잘 먹힌다.',
    memeTokens: ['인정?', '실화냐?'],
    audioDirective: {
      labelKo: '웅장한 오케스트라 힙합',
      genreEn: 'epic orchestral hip-hop, dramatic staccato strings, cinematic timpani hits, choir stabs',
      bpm: 132,
      vocalEn: 'theatrical spoken-word delivery building into rap, dramatic Korean diction',
      moodEn: 'grandiose, vengeful-but-comedic, high-stakes parody',
      forbiddenEn: 'cute vocals, chiptune, bubblegum pop, childish melody',
    },
    videoDirective: {
      protagonistVariants: [
        '20s KOREAN WOMAN WITH SLEEK BLACK BOB HAIR IN SHARP GREY POWER SUIT',
        '30s KOREAN MAN WITH SLICKED-BACK HAIR IN BLACK DOUBLE-BREASTED SUIT',
        '40s KOREAN WOMAN IN DEEP RED SILK BLOUSE WITH PEARL EARRINGS',
      ],
      supporting: 'SHOCKED DRAMATIC EXECUTIVE IN NAVY SUIT',
      coreObject: 'SIGNED LEAVE REQUEST PAPER FORM FIRMLY HELD IN HAND',
      action: 'THROWING PAPERWORK DRAMATICALLY IN SLOW MOTION WITH FIERCE VICTORIOUS SMILE',
      cameraLighting: '0.5X FISHEYE SNAP-ZOOM TO EYES, HIGH-CONTRAST CINEMATIC DRAMA LIGHTING',
      energyEn: 'slow-motion dramatic confrontation, makjang soap-opera intensity, sudden freeze-frame reveal',
      allowDance: false,
    },
    fewShotBrief: {
      title: '연진아 나 지금 되게 신나 내 연차 결재됐대',
      hook: '연진아 나 지금 되게 신나',
      memeToken: '인정?',
      lyricsStructure: {
        spokenIntro: '연진아, 나 오늘 연차 냈다.',
        visualVerse: [
          '결재 완료 도장 찍힌 종이를 흔들며 웃어',
          '부장님 얼굴이 하얗게 굳어 버린 회의실',
        ],
        buildUp: [
          '십이 개월 만에 처음 쓰는 사흘짜리 휴가다',
          '비행기표 좌석 번호까지 이미 골라 놨다',
        ],
        killerChorus: {
          memoryAnchor: '되게 신나',
          hookMain: [
            '연진아 나 지금 되게 신나',
            '연진아 나 지금 되게 신나',
            '회의실 불 끄고 나가는 이 기분 알아?',
            '연진아 나 되게 신나 진짜 신나!',
          ],
        },
        echoChorus: ['되게 신나 되게 신나', '신나 신나 신나!'],
        tagOutro: '너도 연차 결재 기다려? 인정?',
      },
    },
  },

  pet: {
    id: 'pet',
    name: '댕냥이 집사속마음',
    description: '강아지·고양이 1인칭 시점으로 번역한 집사 조종기와 밥투정 숏폼',
    lyricDirective:
      '반려동물 1인칭. 사랑스럽고 뻔뻔한 어리광 톤이 기본이며 절대 분노·디스·욕설로 가지 않는다. 의성어(야옹, 멍, 톡톡, 쨍그랑)와 반복 어미(~냥, ~멍)로 리듬을 만들고, 집사를 귀엽게 부려먹는 상황을 구체적 사물로 묘사한다.',
    memeTokens: ['인정?', '또 샀다!'],
    audioDirective: {
      labelKo: '귀여운 통통 하이퍼팝',
      genreEn: 'cute bouncy hyperpop, playful marimba and pizzicato plucks, bright bubbly synth, light kick',
      bpm: 128,
      vocalEn: 'high-pitched cute Korean vocal, playful sing-song delivery, tiny ad-lib giggles',
      moodEn: 'adorable, mischievous, warm and heart-melting',
      // 사용자 제보 샘플이 정확히 이 금지 목록을 위반했다.
      forbiddenEn:
        'aggressive rap, diss track tone, angry shouting, cyberpunk dark synth, distorted guitar, gritty bass, horror atmosphere',
    },
    videoDirective: {
      protagonistVariants: [
        'CUTE FLUFFY ORANGE TABBY CAT WEARING A TINY RED BOWTIE',
        'CHUBBY WHITE SHORT-HAIRED CAT WITH ONE BLACK EAR PATCH',
        'SMALL BROWN AND WHITE CORGI WITH A BLUE COLLAR BELL',
        'CREAM COLOURED POMERANIAN WITH A FLUFFY TAIL AND PINK BANDANA',
      ],
      supporting: 'SLEEPY HUMAN OWNER IN GREEN PAJAMAS ON THE FLOOR',
      coreObject: 'EMPTY STAINLESS STEEL FOOD BOWL RESTING SOLIDLY ON KITCHEN FLOOR',
      action:
        'LOW ANGLE PET POV TAPPING THE FOOD BOWL WITH A PAW AND STARING WITH HUGE DEMANDING EYES',
      cameraLighting: 'LOW-ANGLE GROUND POV, SNAP-ZOOM 0.5X FISHEYE, WARM COSY HOME INTERIOR LIGHTING',
      energyEn:
        'adorable mischievous pet antics, soft slapstick timing, wholesome comedic reaction from the sleepy owner',
      allowDance: false,
    },
    fewShotBrief: {
      title: '새벽 네 시에 내 얼굴 밟고 간 고양이 실화',
      hook: '밥 줘라 냥 지금 당장 냥',
      memeToken: '인정?',
      lyricsStructure: {
        spokenIntro: '집사야, 지금 네 시다.',
        visualVerse: [
          '이불 밖으로 나온 발가락을 톡톡 건드린다',
          '텅 빈 밥그릇을 발로 밀어 쨍그랑 소리',
        ],
        buildUp: [
          '비싼 캣타워는 안 보고 택배 상자에 앉았다',
          '츄르 봉지 뜯는 소리에 귀가 먼저 돌아간다',
        ],
        killerChorus: {
          memoryAnchor: '밥 줘라 냥',
          hookMain: [
            '밥 줘라 냥 밥 줘라 냥',
            '밥 줘라 냥 밥 줘라 냥',
            '아침에 줬다고? 그건 아침이고',
            '지금 당장 츄르 바쳐라 냥!',
          ],
        },
        echoChorus: ['밥 줘라 냥 밥 줘라 냥', '츄르 바쳐라 냥!'],
        tagOutro: '너네 집 고양이도 이러니? 인정?',
      },
    },
  },

  relationship: {
    id: 'relationship',
    name: '연애·남녀심리',
    description: '썸, 읽씹, 새벽 카톡, 이별 흑역사까지 남녀 심리 공감 숏폼',
    lyricDirective:
      '카톡 읽씹, 새벽 감성 전송 후 후회, 밀당 심리를 대화체로 쓴다. 감정 형용사(슬프다, 외롭다) 대신 화면 속 숫자 1, 액정 불빛 같은 사물로 감정을 보여준다.',
    memeTokens: ['실화냐?', '인정?'],
    audioDirective: {
      labelKo: '새벽 시티팝 R&B',
      genreEn: 'late-night city pop R&B, glossy electric piano, mellow slap bass, soft gated drums',
      bpm: 118,
      vocalEn: 'breathy narrative Korean vocal, confessional half-sung delivery, close intimate mic',
      moodEn: 'bittersweet, self-deprecating, neon-night melancholy with a comedic wink',
      forbiddenEn: 'metal, death growl, aggressive shouting, marching band brass, horror strings',
    },
    videoDirective: {
      protagonistVariants: [
        'PANICKED 20s KOREAN MAN WITH MESSY BLACK HAIR IN GREY HOODIE',
        '20s KOREAN WOMAN WITH LONG WAVY HAIR IN OVERSIZED WHITE TEE',
        '20s KOREAN MAN WITH ROUND GLASSES IN NAVY STRIPED PAJAMAS',
      ],
      supporting: 'GLOWING SMARTPHONE SCREEN SHOWING ONE UNREAD MESSAGE MARK',
      coreObject: "SMARTPHONE SHOWING A SENT MESSAGE, HELD WITH TREMBLING HANDS",
      action: 'COMEDIC DESPAIR REACTION BURYING FACE INTO A PILLOW IN SLOW MOTION',
      cameraLighting: 'TOP-DOWN BEDROOM SHOT, BLUE NEON NIGHT LIGHTING, SNAP-ZOOM TO SCREEN',
      energyEn: 'quiet late-night tension escalating into comedic overreaction, phone-screen glow on face',
      allowDance: false,
    },
    fewShotBrief: {
      title: '새벽 두 시에 자니 보낸 손가락 자진 신고합니다',
      hook: '자니 보내고 폰을 던졌다',
      memeToken: '실화냐?',
      lyricsStructure: {
        spokenIntro: '전송 버튼을 눌러 버렸다.',
        visualVerse: [
          '카톡 창에 숫자 일이 아직 안 지워진다',
          '새벽 두 시 화면 불빛만 이불 속에서 밝다',
        ],
        buildUp: [
          '술기운에 넘쳤던 용기는 벌써 다 식었고',
          '내일 아침 마주칠 얼굴이 벌써 떠오른다',
        ],
        killerChorus: {
          memoryAnchor: '자니 보냈다',
          hookMain: [
            '자니 보냈다 자니 보냈다',
            '자니 보냈다 자니 보냈다',
            '읽지 마 제발 읽지 말아 줘',
            '자니 보냈다 폰을 던졌다!',
          ],
        },
        echoChorus: ['자니 보냈다 자니 보냈다', '폰을 창밖에 던졌다!'],
        tagOutro: '너도 자니 보낸 적 있어? 실화냐?',
      },
    },
  },

  human: {
    id: 'human',
    name: '현대인·직장인',
    description: '월급 스쳐감, 카드값, 칼퇴 실패 등 직장인 짠내 공감 숏폼',
    lyricDirective:
      '월급 통장, 카드 명세서, 지옥철, 부장님 눈치를 숫자와 사물로 구체화한다. 자기 비하 유머는 유쾌하게, 절대 우울하게 끝내지 않는다.',
    memeTokens: ['인정?', '또 샀다!'],
    audioDirective: {
      labelKo: '펑키 디스코 그루브',
      genreEn: 'funky disco groove, slap bass riff, wah-wah guitar, bright horn section, four-on-the-floor',
      bpm: 120,
      vocalEn: 'sarcastic talk-sung Korean vocal, wry deadpan delivery with group backing shouts',
      moodEn: 'wry, self-deprecating, danceable resignation',
      forbiddenEn: 'chipmunk sped-up vocals, childish nursery melody, horror atmosphere, epic war drums',
    },
    videoDirective: {
      protagonistVariants: [
        'EXHAUSTED KOREAN OFFICE WORKER IN WHITE SHIRT AND LOOSENED BLACK TIE',
        '30s KOREAN WOMAN IN BEIGE OFFICE CARDIGAN WITH LANYARD ID BADGE',
        '20s KOREAN INTERN IN SLIGHTLY OVERSIZED CHARCOAL SUIT',
      ],
      supporting: 'STRICT BOSS IN DARK SUIT GESTURING IN THE BACKGROUND',
      coreObject: 'SMARTPHONE SHOWING A NEAR-ZERO BANK BALANCE HELD TIGHTLY IN BOTH HANDS',
      action: 'COMEDIC JAW-DROP DESPAIR AT AN OFFICE DESK SURROUNDED BY PAPER STACKS',
      cameraLighting: '0.5X FISHEYE SNAP-ZOOM TO FACE, FLAT FLUORESCENT OFFICE LIGHTING',
      energyEn: 'deadpan office absurdity, synchronized coworker reactions, sudden zoom on the balance screen',
      allowDance: false,
    },
    fewShotBrief: {
      title: '월급 이틀 만에 잔고 만 원 된 사람 손',
      hook: '월급은 스쳐 갈 뿐이다',
      memeToken: '인정?',
      lyricsStructure: {
        spokenIntro: '월급날인데 잔고가 없다.',
        visualVerse: [
          '입금 알림 뜬 지 십 분 만에 카드값이 나갔다',
          '통장 잔액 화면을 세 번이나 다시 켜 봤다',
        ],
        buildUp: [
          '냉장고에 남은 건 계란 두 개와 김치뿐이고',
          '월세 날짜는 이미 달력에 빨갛게 칠해져 있다',
        ],
        killerChorus: {
          memoryAnchor: '스쳐 간다',
          hookMain: [
            '월급은 스쳐 간다 스쳐 간다',
            '월급은 스쳐 간다 스쳐 간다',
            '손에 쥐어 본 적도 없는데',
            '월급은 스쳐 간다 또 스쳐 간다!',
          ],
        },
        echoChorus: ['스쳐 간다 스쳐 간다', '또 스쳐 간다!'],
        tagOutro: '너도 잔고 만 원이야? 인정?',
      },
    },
  },

  trend: {
    id: 'trend',
    name: '트렌드·이슈',
    description: '요아정, 오픈런, 최신 밈과 도파민 이슈를 즉각 낚아채는 숏폼',
    lyricDirective:
      '지금 유행하는 디저트·앱·유행어를 실제 숫자(토핑 세 번, 만 이천 원)와 함께 박아 넣는다. 템포가 빠르고 유행어가 연속으로 터지는 구성.',
    memeTokens: ['결제 완료!', '인정?'],
    audioDirective: {
      labelKo: '하이퍼팝 K-댄스',
      genreEn: 'hyperpop K-pop dance, supersaw synth stabs, pitched vocal chops, punchy sidechained kick',
      bpm: 138,
      vocalEn: 'bright energetic Korean vocal with crowd chant hooks and pitched-up ad-libs',
      moodEn: 'euphoric, dopamine-spiking, ultra trendy',
      forbiddenEn: 'slow ballad, sad piano, funeral organ, lo-fi sleepy beat',
    },
    videoDirective: {
      protagonistVariants: [
        'TRENDY 20s KOREAN YOUTH IN OVERSIZED PINK HOODIE AND BUCKET HAT',
        '20s KOREAN WOMAN WITH BLEACHED SHORT HAIR IN NEON GREEN CROP JACKET',
        '20s KOREAN MAN IN BAGGY WHITE STREETWEAR SET WITH CHUNKY SNEAKERS',
      ],
      supporting: 'DELIVERY RIDER HANDING OVER A HUGE DESSERT CUP',
      coreObject: 'GIANT YOGURT ICE CREAM CUP LOADED WITH TOPPINGS RESTING SOLIDLY ON A TABLE',
      action: 'EXAGGERATED DELICIOUS SHOCK EXPRESSION WHILE TAKING A HUGE SPOONFUL',
      cameraLighting: 'DYNAMIC 9:16 VERTICAL SHORT-FORM, BRIGHT VIBRANT NEON LIGHTING',
      energyEn: 'rapid trend-montage cuts, hyper-saturated colours, crowd-reaction energy',
      allowDance: true,
    },
    fewShotBrief: {
      title: '요아정 토핑 세 번 추가하고 잔고 확인한 결과',
      hook: '맛있으면 그건 영 칼로리',
      memeToken: '결제 완료!',
      lyricsStructure: {
        spokenIntro: '이건 살 안 찌는 거다.',
        visualVerse: [
          '요거트 위에 토핑을 세 번이나 더 얹었다',
          '영수증 숫자가 만 이천 원을 넘어간다',
        ],
        buildUp: [
          '달콤함은 삼 초인데 당류는 백 프로였고',
          '내일 아침 체중계는 그냥 안 보기로 했다',
        ],
        killerChorus: {
          memoryAnchor: '영 칼로리',
          hookMain: [
            '맛있으면 그건 영 칼로리',
            '맛있으면 그건 영 칼로리',
            '숟가락이 멈추지를 않아',
            '맛있으면 영 칼로리 영 칼로리!',
          ],
        },
        echoChorus: ['영 칼로리 영 칼로리', '오늘은 영 칼로리!'],
        tagOutro: '너도 토핑 추가했어? 결제 완료!',
      },
    },
  },

  challenge: {
    id: 'challenge',
    name: '도파민 응원',
    description: '갓생, 오운완, 시험기간까지 기 살려주는 초긍정 떼창 응원 숏폼',
    lyricDirective:
      '조건 없이 듣는 사람을 인정해 주는 응원. "새벽 다섯 시 기상" 같은 압박 대신 오늘 이미 해낸 사소한 것을 구체적으로 칭찬한다. 떼창 가능한 짧은 구호가 핵심.',
    memeTokens: ['인정?', '클릭 금지!'],
    audioDirective: {
      labelKo: '떼창 펑크 락 앤썸',
      genreEn: 'anthemic punk rock, driving power chords, live drum fills, stadium gang-chant chorus',
      bpm: 150,
      vocalEn: 'raw energetic Korean shout-sung lead with large group chant backing',
      moodEn: 'uplifting, defiant, pure adrenaline encouragement',
      forbiddenEn: 'sad ballad, sleepy lo-fi, whisper ASMR, melancholic strings',
    },
    videoDirective: {
      protagonistVariants: [
        'ATHLETIC 20s KOREAN MAN IN BLACK TANK TOP AND RED HEADBAND',
        '20s KOREAN WOMAN IN PURPLE GYM SET WITH HIGH PONYTAIL',
        'CHUBBY 30s KOREAN MAN IN FADED GREY HOODIE AND SWEATBAND',
      ],
      supporting: 'CHEERING GYM CROWD RAISING BOTH FISTS',
      coreObject: 'HEAVY BLACK DUMBBELL GRIPPED FIRMLY IN ONE HAND',
      action: 'INTENSE SWEATING SQUAT FINISHED WITH A VICTORIOUS ROAR TO CAMERA',
      cameraLighting: 'HIGH CONTRAST HARD GYM LIGHTING, RAPID SNAP-ZOOMS ON THE ROAR',
      energyEn: 'explosive triumphant motion, crowd fist-pumping, confetti-burst climax',
      allowDance: true,
    },
    fewShotBrief: {
      title: '오늘 하루 버틴 당신 사실 우주 최강입니다',
      hook: '너 오늘 진짜 잘했어',
      memeToken: '인정?',
      lyricsStructure: {
        spokenIntro: '야, 너 오늘 잘했다.',
        visualVerse: [
          '알람 다섯 번 끄고도 결국 일어나 앉았고',
          '식은 커피 한 잔으로 오전을 통째로 버텼다',
        ],
        buildUp: [
          '누가 안 봐줘도 네가 해낸 건 남아 있고',
          '오늘 넘긴 하루가 그대로 실력이 된다',
        ],
        killerChorus: {
          memoryAnchor: '잘했어',
          hookMain: [
            '너 오늘 진짜 잘했어 잘했어',
            '너 오늘 진짜 잘했어 잘했어',
            '대충 산 것 같아도 아니야',
            '너 오늘 잘했어 엄청 잘했어!',
          ],
        },
        echoChorus: ['잘했어 진짜 잘했어', '오늘도 잘했어!'],
        tagOutro: '오늘 버틴 사람 손! 인정?',
      },
    },
  },

  brand: {
    id: 'brand',
    name: 'B급 광고',
    description: '쌈마이 홈쇼핑 톤으로 약 파는 B급 커머셜 패러디 숏폼',
    lyricDirective:
      '홈쇼핑 쇼호스트 화법을 극단으로 밀어붙인다. 할인율, 재고 수량, 남은 시간 같은 숫자를 계속 외치고, 마감 임박 압박을 코믹하게 과장한다.',
    memeTokens: ['결제 완료!', '클릭 금지!'],
    audioDirective: {
      labelKo: '레트로 CM송 브라스',
      genreEn: 'retro TV commercial jingle, oompah brass band, cheerful glockenspiel, snappy snare march',
      bpm: 130,
      vocalEn: 'over-the-top Korean announcer voice, shouty infomercial host delivery, jingle chorus',
      moodEn: 'shameless, hyperactive, tacky-cheerful hard sell',
      forbiddenEn: 'dark atmosphere, melancholic pad, horror strings, sad ballad, sleepy lo-fi',
    },
    videoDirective: {
      protagonistVariants: [
        'ENERGETIC KOREAN HOMESHOPPING HOST IN BRIGHT YELLOW SUIT AND BOWTIE',
        'MIDDLE-AGED KOREAN MAN IN SHINY PURPLE BLAZER WITH SLICKED HAIR',
        'KOREAN WOMAN HOST IN HOT PINK SKIRT SUIT WITH GIANT EARRINGS',
      ],
      supporting: 'GIANT DISCOUNT STICKER SHOWING 99 PERCENT OFF IN THE BACKGROUND',
      coreObject: 'MEGAPHONE HELD TIGHTLY IN THE RIGHT HAND POINTING AT CAMERA',
      action: 'EXAGGERATED INFOMERCIAL HAND GESTURES WITH A WIDE SHOCKED OPEN MOUTH',
      cameraLighting: 'BRIGHT BLOWN-OUT COMMERCIAL STUDIO LIGHTING, 0.5X SNAP-ZOOM TO MEGAPHONE',
      energyEn: 'frantic hard-sell showmanship, price-tag graphics popping in, rapid product hand-offs',
      allowDance: false,
    },
    fewShotBrief: {
      title: '사장님이 미쳤어요 이 가격 오늘 밤에 끝납니다',
      hook: '고민하면 품절이다',
      memeToken: '결제 완료!',
      lyricsStructure: {
        spokenIntro: '잠깐, 아직 안 샀어요?',
        visualVerse: [
          '화면에 구십구 프로 할인 도장이 찍힌다',
          '재고 숫자가 실시간으로 줄어들고 있다',
        ],
        buildUp: [
          '상담 전화는 벌써 폭주해서 통화 중이고',
          '장바구니에 담아 둔 사람이 육천 명이다',
        ],
        killerChorus: {
          memoryAnchor: '품절이다',
          hookMain: [
            '고민하면 품절이다 품절이다',
            '고민하면 품절이다 품절이다',
            '생각은 결제하고 나서 해',
            '고민하면 품절이다 지르고 봐!',
          ],
        },
        echoChorus: ['품절이다 품절이다', '일단 지르고 봐!'],
        tagOutro: '너도 벌써 담았지? 결제 완료!',
      },
    },
  },

  history: {
    id: 'history',
    name: '역사 부캐',
    description: '전 세계 위인들이 2026년 현대 문물을 만난 타임슬립 B급 패러디 숏폼',
    lyricDirective: `위인이 현대 문물(스마트폰, 배달앱, 줄임말, 숏폼, 주식 차트)을 처음 보고 받는 충격과 훈수. 위인의 사극체 어미(~하더냐, ~이니라, 짐이)를 유지하면서 소재만 현대로 가져오는 낙차가 핵심이다.

[위인 페르소나 필수 다양화 — 매 생성 시 랜덤 교체]:
- 세종대왕 (한글 창제자가 본 줄임말·신조어)
- 이순신 장군 (내비게이션 앱과 왜군 핀)
- 나폴레옹 (키높이 신발과 숏폼 챌린지)
- 아인슈타인 (상대성 이론과 숏폼 도파민 중독)
- 신사임당 (오만원권과 스마트스토어 쇼핑)
- 클레오파트라 (뷰티 인플루언서 올리브영 털기)
- 칭기즈칸 (배달 라이더 전국 통일)
- 율곡 이이 (십만 양병설과 그래픽카드 수집)
- 찰리 채플린 (무성영화와 릴스)
- 알렉산더 대왕 (세계 정복과 지도 앱)

어색한 설명조 문장을 금지하고, 밈 펀치라인으로만 쓸 것.`,
    memeTokens: ['실화냐?', '인정?'],
    audioDirective: {
      labelKo: '국악 퓨전 트랩',
      genreEn: 'gugak fusion trap, taepyeongso and daegeum lead, buk drum hits, heavy 808 sub bass',
      bpm: 135,
      vocalEn: 'commanding Korean pansori-tinged delivery alternating with modern rap flow',
      moodEn: 'majestic, scolding, comedically anachronistic',
      forbiddenEn: 'cute chipmunk vocals, bubblegum pop, nursery melody, disco brass',
    },
    videoDirective: {
      protagonistVariants: [
        'KING SEJONG IN RED ROYAL DRAGON ROBE WEARING MODERN BLACK SUNGLASSES',
        'ADMIRAL YI SUN-SIN IN TRADITIONAL ARMOUR HOLDING A GLOWING SMARTPHONE',
        'NAPOLEON IN BICORNE HAT AND MILITARY COAT WITH MODERN WHITE SNEAKERS',
        'SHIN SAIMDANG IN ELEGANT HANBOK WEARING NEON SUNGLASSES',
      ],
      supporting: 'MODERN KOREAN HIGH SCHOOL STUDENT IN UNIFORM HOLDING A PHONE',
      coreObject: 'GLOWING TABLET HELD FIRMLY IN BOTH HANDS WITH AN INTENSE STARE',
      action: 'STERN ROYAL FACIAL EXPRESSION COMBINED WITH A COMEDIC MODERN HAND GESTURE',
      cameraLighting: 'PALACE BACKGROUND WITH MODERN NEON ACCENTS, DRAMATIC CINEMATIC LIGHTING',
      energyEn: 'regal slow push-in colliding with modern-object shock, anachronistic prop reveals',
      allowDance: false,
    },
    fewShotBrief: {
      title: '세종대왕이 요즘 애들 줄임말 보고 하신 말씀',
      hook: '그 줄임말은 짐이 안 만들었다',
      memeToken: '실화냐?',
      lyricsStructure: {
        spokenIntro: '이게 과연 한글이더냐.',
        visualVerse: [
          '용포 자락 걷어붙이고 태블릿을 켜 보았다',
          '화면에 뜬 다섯 글자를 세 번이나 읽었다',
        ],
        buildUp: [
          '스물여덟 자를 만들 적엔 이런 뜻이 아니었고',
          '백성이 편하라 했더니 짐이 편치가 않다',
        ],
        killerChorus: {
          memoryAnchor: '내가 만든 게 아니다',
          hookMain: [
            '내가 만든 게 아니다 아니다',
            '내가 만든 게 아니다 아니다',
            '그 줄임말은 짐이 안 만들었어',
            '내가 만든 게 아니다 절대 아니다!',
          ],
        },
        echoChorus: ['아니다 내가 아니다', '짐이 만든 게 아니다!'],
        tagOutro: '너도 줄임말 쓰지? 실화냐?',
      },
    },
  },

  parenting: {
    id: 'parenting',
    name: '육아·잼민이 월드',
    description: '육아 전쟁과 예측 불가 잼민이 행동을 담은 부모 격공 숏폼',
    lyricDirective:
      '부모의 영혼이 탈곡되는 순간을 구체적 장면으로. 마트 바닥, 레고 밟기, 방학 첫날처럼 모든 부모가 아는 상황을 쓰고, 아이를 미워하는 톤이 아니라 지쳤지만 사랑하는 톤을 유지한다.',
    memeTokens: ['실화냐?', '인정?'],
    audioDirective: {
      labelKo: '밝은 동요풍 행진곡',
      genreEn: 'bright nursery-style march, toy piano and xylophone, tuba oompah, handclap percussion',
      bpm: 132,
      vocalEn: 'exhausted deadpan Korean parent vocal answered by a cheerful kids chorus',
      moodEn: 'chaotic, warm, comedically drained',
      forbiddenEn: 'dark cyberpunk synth, aggressive diss rap, horror atmosphere, sultry R&B',
    },
    videoDirective: {
      protagonistVariants: [
        'EXHAUSTED 30s KOREAN PARENT IN A CASUAL BEIGE CARDIGAN',
        '30s KOREAN FATHER IN WRINKLED WHITE TEE WITH A BABY CARRIER',
        '40s KOREAN MOTHER WITH HAIR IN A MESSY BUN AND TOTE BAG',
      ],
      supporting: 'CUTE KOREAN TODDLER LYING FLAT ON THE SUPERMARKET FLOOR',
      coreObject: 'PLASTIC TOY ROBOT BOX GRIPPED FIRMLY IN ONE HAND',
      action: 'PALM TO FACE DESPAIR GESTURE WITH SOUL-DRAINED EYES IN A SUPERMARKET AISLE',
      cameraLighting: 'BRIGHT SUPERMARKET LIGHTING, 0.5X FISHEYE SNAP-ZOOM TO THE PARENT FACE',
      energyEn: 'escalating domestic chaos, toddler tantrum slapstick, parent freeze-frame surrender',
      allowDance: false,
    },
    fewShotBrief: {
      title: '마트 장난감 코너에서 드러누운 아이 실시간 중계',
      hook: '엄마 영혼 지금 가출했다',
      memeToken: '실화냐?',
      lyricsStructure: {
        spokenIntro: '안 사준다고 한 번 했다.',
        visualVerse: [
          '마트 바닥에 등을 딱 붙이고 누워 버렸다',
          '지나가는 사람들 눈이 전부 이쪽을 본다',
        ],
        buildUp: [
          '집에 똑같은 로봇이 세 개나 있는데도',
          '오늘은 저것만 된다고 발을 구르고 있다',
        ],
        killerChorus: {
          memoryAnchor: '영혼 가출',
          hookMain: [
            '엄마 영혼 가출 영혼 가출',
            '엄마 영혼 가출 영혼 가출',
            '육천 원에 평화를 사기로 했어',
            '엄마 영혼 가출 그냥 가출!',
          ],
        },
        echoChorus: ['영혼 가출 영혼 가출', '엄마 영혼 가출!'],
        tagOutro: '너네 애도 누워? 실화냐?',
      },
    },
  },

  food_diet: {
    id: 'food_diet',
    name: '야식·다이어트',
    description: '새벽 배달 앱과 다이어트 결심 사이 내적 갈등 폭발 숏폼',
    lyricDirective:
      '새벽 배달 앱 장바구니, 체중계 회피, 내일부터 다이어트 선언을 쓴다. 유혹에 지는 과정을 죄책감 섞인 코믹 톤으로, 음식은 침이 고이게 구체적으로 묘사한다.',
    memeTokens: ['결제 완료!', '또 샀다!'],
    audioDirective: {
      labelKo: '심야 로파이 트랩',
      genreEn: 'late-night lo-fi trap, dusty vinyl keys, warm sub bass, crisp trap hats with a mid drop',
      bpm: 128,
      vocalEn: 'tempting whispered Korean verses opening into a guilty belted chorus',
      moodEn: 'guilty, indulgent, midnight-craving',
      forbiddenEn: 'epic orchestral war drums, marching brass, nursery melody, punk distortion',
    },
    videoDirective: {
      protagonistVariants: [
        'GUILTY 20s KOREAN WOMAN IN A COZY OVERSIZED GREY SWEATSHIRT',
        '20s KOREAN MAN IN A STRETCHED WHITE TEE AND SHORTS',
        '30s KOREAN WOMAN IN SILK PYJAMAS WITH A HAIR CLIP',
      ],
      supporting: 'GLOWING PHONE SHOWING A FOOD DELIVERY SUCCESS NOTIFICATION',
      coreObject: 'STEAMING SPICY CHICKEN BOX RESTING SOLIDLY ON A LOW COFFEE TABLE',
      action: 'EXAGGERATED DELICIOUS GUILTY EXPRESSION WHILE TAKING A HUGE BITE IN A DARK ROOM',
      cameraLighting: 'DARK ROOM LIT ONLY BY TV GLOW, SLOW SNAP-ZOOM TO THE STEAMING FOOD',
      energyEn: 'intimate midnight temptation, steam and close-up food macro shots, guilty glance to camera',
      allowDance: false,
    },
    fewShotBrief: {
      title: '새벽 한 시에 배달 앱 결제 누른 사람 여기 모여',
      hook: '다이어트는 내일부터다',
      memeToken: '결제 완료!',
      lyricsStructure: {
        spokenIntro: '오늘까지만 먹기로 했다.',
        visualVerse: [
          '장바구니에 닭발하고 계란찜을 더 담았다',
          '라이더 위치가 지도에서 점점 가까워진다',
        ],
        buildUp: [
          '체중계는 어제부터 화장실 구석에 세워 뒀고',
          '젓가락은 이미 손에 쥐어져 있는 상태다',
        ],
        killerChorus: {
          memoryAnchor: '내일부터',
          hookMain: [
            '다이어트는 내일부터 내일부터',
            '다이어트는 내일부터 내일부터',
            '오늘 먹은 건 계산에 안 넣어',
            '다이어트는 내일부터 무조건 내일!',
          ],
        },
        echoChorus: ['내일부터 내일부터', '무조건 내일부터!'],
        tagOutro: '너도 지금 앱 열었지? 결제 완료!',
      },
    },
  },

  horror_mystery: {
    id: 'horror_mystery',
    name: '이불킥·흑역사',
    description: '새벽에 되살아나는 흑역사 기억을 공포 문법으로 비튼 코믹 스릴러 숏폼',
    lyricDirective:
      '공포 영화 문법(어둠, 정적, 갑작스러운 소리)을 쓰지만 정체는 십 년 전 내 고백이라는 반전. 무서운 척하다가 웃기게 무너지는 낙차가 핵심.',
    memeTokens: ['실화냐?', '클릭 금지!'],
    audioDirective: {
      labelKo: '호러 왈츠 뮤직박스',
      genreEn: 'creepy music-box waltz intro dropping into horror trap, detuned bells, sudden orchestral stab',
      bpm: 120,
      vocalEn: 'hushed trembling Korean whisper escalating into a comedic scream chorus',
      moodEn: 'suspenseful, cringing, comedically terrified',
      forbiddenEn: 'bright cheerful jingle, disco brass, nursery melody, uplifting anthem chorus',
    },
    videoDirective: {
      protagonistVariants: [
        'TERRIFIED 20s KOREAN MAN WITH MESSY HAIR IN NAVY PAJAMAS',
        '20s KOREAN WOMAN IN A GREY HOODIE CLUTCHING A BLANKET',
        '30s KOREAN MAN IN A WHITE TEE SITTING BOLT UPRIGHT IN BED',
      ],
      supporting: 'CREEPY SHADOW OF AN OLD EMBARRASSING SOCIAL MEDIA POST ON THE WALL',
      coreObject: 'BLANKET GRIPPED TIGHTLY IN BOTH HANDS DURING A BEDTIME PANIC',
      action: 'COMEDIC HORROR MID-AIR BLANKET KICK WITH WIDE OPEN EYES AND MOUTH',
      cameraLighting: 'DARK BEDROOM HORROR LIGHTING WITH A BLUE NEON ACCENT, HARD SNAP-ZOOM',
      energyEn: 'horror-movie pacing subverted by comedic payoff, sudden silence then blanket-kick burst',
      allowDance: false,
    },
    fewShotBrief: {
      title: '새벽 세 시에 십 년 전 고백이 갑자기 떠오른 사람',
      hook: '그 기억이 또 재생됐다',
      memeToken: '실화냐?',
      lyricsStructure: {
        spokenIntro: '갑자기 그게 떠올랐다.',
        visualVerse: [
          '어두운 방 천장을 보고 눈만 크게 떠 있다',
          '십 년 전 그 문장이 귀에서 다시 들린다',
        ],
        buildUp: [
          '그때 왜 그렇게 말했는지 아직도 모르겠고',
          '이불을 걷어차 봐도 장면은 안 지워진다',
        ],
        killerChorus: {
          memoryAnchor: '또 재생됐다',
          hookMain: [
            '또 재생됐다 또 재생됐다',
            '또 재생됐다 또 재생됐다',
            '머릿속에서 삭제가 안 돼',
            '또 재생됐다 이불킥 팍!',
          ],
        },
        echoChorus: ['또 재생됐다 재생됐다', '오늘도 이불킥 팍!'],
        tagOutro: '너도 방금 떠올랐어? 실화냐?',
      },
    },
  },

  ai_future: {
    id: 'ai_future',
    name: 'AI·미래 판타지',
    description: '2088년 AI가 상전이 된 역전 세계관을 그린 사이버펑크 풍자 숏폼',
    lyricDirective:
      'AI·로봇이 인간에게 명령하는 역전 상황. 인간이 로봇에게 존댓말과 충성을 바치는 대비가 웃음 포인트다. 관리번호, 수치, 검사 결과 같은 기계적 표현을 섞는다.',
    memeTokens: ['클릭 금지!', '실화냐?'],
    audioDirective: {
      labelKo: '사이버펑크 신스웨이브',
      genreEn: 'cyberpunk synthwave, dark analog arpeggios, industrial metallic percussion, neon bass lead',
      bpm: 130,
      vocalEn: 'vocoded robotic Korean announcements answered by a meek obedient human voice',
      moodEn: 'dystopian, deadpan, coldly comedic',
      forbiddenEn: 'acoustic folk guitar, traditional gugak instruments, nursery melody, disco brass',
    },
    videoDirective: {
      protagonistVariants: [
        'FUTURISTIC HUMAN WORKER IN A METALLIC GREY JUMPSUIT WITH A GLOWING NECK BARCODE',
        'TIRED HUMAN IN A WHITE UTILITY UNIFORM WITH A WRIST DATA SCREEN',
        'HUMAN CLEANER IN A SILVER HAZMAT-STYLE SUIT WITH A VISOR HELMET',
      ],
      supporting: 'GLOWING RED ROBOT VACUUM HOVERING SLIGHTLY ABOVE THE FLOOR',
      coreObject: 'HIGH-TECH METALLIC MOP HELD FIRMLY IN BOTH HANDS',
      action: 'COMEDIC OBEDIENT DEEP BOW TOWARDS THE ROBOT VACUUM IN A NEON ROOM',
      cameraLighting: 'CYBERPUNK NEON BLUE AND PURPLE LIGHTING, HIGH TECH 0.5X SNAP-ZOOM',
      energyEn: 'cold mechanical precision contrasted with human panic, scanning-beam sweeps, HUD-style reveals',
      allowDance: false,
    },
    fewShotBrief: {
      title: '이천팔십팔년 로봇 청소기한테 청소 검사받는 사람',
      hook: '상전님 충성 다하겠습니다',
      memeToken: '클릭 금지!',
      lyricsStructure: {
        spokenIntro: '인간 사백팔십칠호, 대기.',
        visualVerse: [
          '로봇 청소기 센서에 빨간 불이 켜져 있다',
          '구석 먼지 영점 영일 그램이 검출되었다',
        ],
        buildUp: [
          '충전기를 꽂아 주던 시절은 이미 지나갔고',
          '이제는 전기 요금까지 내가 설명해야 한다',
        ],
        killerChorus: {
          memoryAnchor: '충성 올립니다',
          hookMain: [
            '상전님 충성 올립니다 올립니다',
            '상전님 충성 올립니다 올립니다',
            '전원 버튼은 안 누르겠습니다',
            '상전님 충성 올립니다 충성!',
          ],
        },
        echoChorus: ['충성 올립니다 올립니다', '상전님 충성!'],
        tagOutro: '너도 청소기한테 인사해? 클릭 금지!',
      },
    },
  },
};

/** 알 수 없는 카테고리는 조용히 trend로 바꾸지 않고 로그를 남긴다. */
export function getCategoryMatrix(category: string): CategoryMatrixEntry {
  const cleanKey = (category || '').toLowerCase().trim();
  const found = VIRAL_CATEGORY_MATRIX[cleanKey];
  if (found) return found;
  console.warn(
    `[viralCategoryMatrix] 알 수 없는 카테고리 "${category}" → trend로 폴백. 정식 키: ${VIRAL_CATEGORY_ORDER.join(', ')}`
  );
  return VIRAL_CATEGORY_MATRIX.trend;
}

/** UI 라벨의 유일한 출처. 화면마다 ternary로 다시 적지 말 것. */
export function getCategoryLabel(category: string): string {
  return getCategoryMatrix(category).name;
}

/**
 * 인덱스로 배열에서 하나를 고른다. seed를 주면 결정적으로 동작하고,
 * 없으면 무작위로 고른다(주인공·밈 토큰 회전용).
 */
function pickFrom<T>(items: readonly T[], seed?: number): T {
  if (items.length === 0) throw new Error('pickFrom: 빈 배열');
  const idx =
    typeof seed === 'number'
      ? Math.abs(Math.floor(seed)) % items.length
      : Math.floor(Math.random() * items.length);
  return items[idx];
}

export function pickMemeToken(entry: CategoryMatrixEntry, seed?: number): string {
  return pickFrom(entry.memeTokens, seed);
}

export function pickProtagonist(entry: CategoryMatrixEntry, seed?: number): string {
  return pickFrom(entry.videoDirective.protagonistVariants, seed);
}

/**
 * Suno 스타일 프롬프트를 조립한다. 가사 전달이 곧 웃음이므로 보컬 우선 믹스를
 * 맨 앞에 두고, 카테고리 사운드 → 금지 사운드 순으로 붙인다.
 *
 * 이 함수가 유일한 스타일 프롬프트 출처다. 화면 쪽에서 "B-grade meme energy"
 * 같은 전역 접미사를 다시 붙이면 카테고리 정체성이 다시 무너진다.
 */
export function buildAudioStylePrompt(
  entry: CategoryMatrixEntry,
  overrides?: { genreEn?: string; vocalEn?: string; moodEn?: string; bpm?: number }
): string {
  const a = entry.audioDirective;
  const genre = overrides?.genreEn?.trim() || a.genreEn;
  const vocal = overrides?.vocalEn?.trim() || a.vocalEn;
  const mood = overrides?.moodEn?.trim() || a.moodEn;
  const bpm = overrides?.bpm || a.bpm;

  return [
    // 3초 룰: 전주 없이 보컬부터 시작
    'no intro, instant vocal start',
    // 가사가 안 들리면 밈이 성립하지 않는다
    'vocal-centric mix, dry upfront vocals close to mic, crystal clear Korean diction, minimal backing',
    genre,
    `${bpm} BPM`,
    vocal,
    mood,
    'short-form viral hook, high replay value',
    `avoid: ${a.forbiddenEn}`,
  ]
    .filter(Boolean)
    .join(', ');
}

/** 카테고리 사운드 요약(한국어) — UI 표시용 */
export function getAudioSummaryKo(entry: CategoryMatrixEntry): string {
  const a = entry.audioDirective;
  return `${a.labelKo} · ${a.bpm} BPM`;
}
