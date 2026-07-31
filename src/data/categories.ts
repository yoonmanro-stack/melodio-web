/**
 * Melodio — 프롬프트 빌더 카테고리 (장르 제외 11개)
 * 장르는 genres.ts (2단계 구조) 에서 별도 관리
 *
 * Tag level 컬러 시스템:
 *   1 = 핵심 가이드 (AI 매핑율 높음) → 밝은 퓨셔/골드 텍스트
 *   2 = 사운드 구성 (일반)           → 화이트/라이트 그레이 텍스트
 *   3 = 디테일 톤 (실험적/서브)       → 뮤티드 그레이 텍스트
 */

import type { Category } from '@/types'

export const categories: Category[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. 분위기 & 감성 (mood)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'mood',
    number: 2,
    icon: '✨',
    title: '분위기 & 감성',
    desc: '감정의 깊이',
    placeholder: '원하는 분위기를 직접 입력하세요',
    tags: [
      // Level 1 — 핵심 가이드
      { label: '잔잔한', value: 'Calm, Serene', level: 1 },
      { label: '몽환적인', value: 'Dreamy, Ethereal', level: 1 },
      { label: '밝고 경쾌한', value: 'Bright, Upbeat', level: 1 },
      { label: '에너제틱', value: 'Energetic, Euphoric', level: 1 },
      { label: '야간 감성', value: 'Nighttime, Late Night Vibes', level: 1 },
      // Level 2 — 사운드 구성
      { label: '깊은 슬픔', value: 'Deep Sadness, Melancholic', level: 2 },
      { label: '우울한', value: 'Gloomy, Somber', level: 2 },
      { label: '설레는 (로맨틱)', value: 'Romantic, Fluttering', level: 2 },
      { label: '열정적인', value: 'Passionate, Intense', level: 2 },
      { label: '노스탤지어', value: 'Nostalgic, Retro', level: 2 },
      { label: '평화로운', value: 'Peaceful, Tranquil', level: 2 },
      { label: '시네마틱', value: 'Cinematic, Epic', level: 2 },
      { label: '파워풀한', value: 'Powerful, Aggressive', level: 2 },
      { label: '행복한', value: 'Happy, Joyful', level: 2 },
      { label: '희망적인', value: 'Hopeful, Inspiring', level: 2 },
      { label: '가슴 아픈', value: 'Heartbreaking, Bittersweet', level: 2 },
      { label: '내성적인', value: 'Introspective, Reflective', level: 2 },
      // Level 3 — 디테일 톤
      { label: '힙한 (쿨한)', value: 'Hip, Cool', level: 3 },
      { label: '신비로운', value: 'Mysterious, Enigmatic', level: 3 },
      { label: '명상적인', value: 'Meditative, Zen', level: 3 },
      { label: '파티 분위기', value: 'Party, Festive', level: 3 },
      { label: '다크한', value: 'Dark, Sinister', level: 3 },
      { label: '그루비한', value: 'Groovy, Funky', level: 3 },
      { label: '절박한', value: 'Desperate, Urgent', level: 3 },
      { label: '나른한', value: 'Lazy, Laid-Back', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. 보컬 스타일 (vocal)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'vocal',
    number: 3,
    icon: '🎤',
    title: '보컬 스타일',
    desc: '목소리의 질감',
    placeholder: '원하는 보컬 스타일을 직접 입력하세요',
    tags: [
      // Level 1 — 핵심 가이드
      { label: '인스트루멘탈', value: 'Instrumental, No Vocals', level: 1 },
      { label: '판소리 꺾기 & 멜로딕 훅', value: '판소리식 꺾기와 멜로딕 훅', level: 1 },
      { label: '국악 퓨전 랩', value: 'gugak fusion rap', level: 1 },
      { label: '밝은 여성 보컬', value: 'Bright Female Vocal', level: 1 },
      { label: '부드러운 남성 보컬', value: 'Smooth Male Vocal, Baritone', level: 1 },
      { label: '부드러운 여성 보컬', value: 'Soft, Gentle Female Vocal', level: 1 },
      { label: '친밀한 보컬', value: 'Intimate, Close-Miked Vocal', level: 1 },
      // Level 2 — 사운드 구성
      { label: '거친 표현형 랩', value: 'raw expressive rap', level: 2 },
      { label: '혼성 보컬', value: '혼성 보컬', level: 2 },
      { label: '파워풀 여성 보컬', value: 'Powerful Female Vocal, Diva', level: 2 },
      { label: '열정적 남성 보컬', value: 'Passionate Male Vocal', level: 2 },
      { label: '거친 남성 보컬', value: 'Raspy Male Vocal, Gritty', level: 2 },
      { label: '래퍼 (남)', value: 'Male Rapper', level: 2 },
      { label: '래퍼 (여)', value: 'Female Rapper', level: 2 },
      { label: '속삭이는 보컬', value: 'Whisper Vocal, ASMR Voice', level: 2 },
      { label: '팔세토', value: 'Falsetto', level: 2 },
      { label: '오토튠', value: 'Auto-Tune Vocal', level: 2 },
      { label: '남녀 듀엣', value: 'Male-Female Duet', level: 2 },
      { label: '소울풀 보컬', value: 'Soulful Vocal', level: 2 },
      { label: '토크-싱', value: 'Talk-Sung, Spoken Word', level: 2 },
      // Level 3 — 디테일 톤
      { label: '허밍', value: 'Humming', level: 3 },
      { label: '어린이 합창단', value: "Children's Choir", level: 3 },
      { label: '어른 합창단', value: 'Adult Choir, Gospel Choir', level: 3 },
      { label: '애니메 보컬', value: 'Anime Voice, Cute Vocal', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. 악기 (instruments)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'instruments',
    number: 4,
    icon: '🎹',
    title: '악기',
    desc: '사운드의 질감',
    placeholder: '원하는 악기를 직접 입력하세요',
    tags: [
      // Level 1 — 핵심 가이드
      { label: '피아노', value: 'Piano', level: 1 },
      { label: '어쿠스틱 기타', value: 'Acoustic Guitar', level: 1 },
      { label: '신디사이저', value: 'Synthesizer', level: 1 },
      { label: '드럼 머신', value: 'Drum Machine', level: 1 },
      { label: '아날로그 신스', value: 'Analog Synths', level: 1 },
      { label: '가야금', value: 'gayageum pluck', level: 1 },
      { label: '대금', value: 'daegeum flute', level: 1 },
      { label: '웅장한 브라스 스탭', value: 'epic brass', level: 1 },
      { label: '국악 전통 악기', value: 'traditional Korean instruments', level: 1 },
      // Level 2 — 사운드 구성
      { label: '일렉 기타', value: 'Electric Guitar', level: 2 },
      { label: '디스토션 기타', value: 'Distorted Guitar', level: 2 },
      { label: '해금', value: 'weeping haegeum', level: 2 },
      { label: '태평소', value: 'piercing taepyeongso', level: 2 },
      { label: '북 & 장구 (전통 타악)', value: 'buk and janggu pulse', level: 2 },
      { label: '바이올린', value: 'Violin', level: 2 },
      { label: '첼로', value: 'Cello', level: 2 },
      { label: '스트링 앙상블', value: 'Strings Ensemble', level: 2 },
      { label: '색소폰', value: 'Saxophone', level: 2 },
      { label: '트럼펫 / 브라스', value: 'Trumpet, Brass', level: 2 },
      { label: '신스 패드', value: 'Synth Pad', level: 2 },
      { label: '어쿠스틱 드럼', value: 'Acoustic Drums', level: 2 },
      { label: '베이스 기타', value: 'Bass Guitar', level: 2 },
      { label: '808 베이스', value: '808 Bass', level: 2 },
      { label: '로즈 피아노', value: 'Rhodes Piano', level: 2 },
      // Level 3 — 디테일 톤
      { label: '오르간', value: 'Organ', level: 3 },
      { label: '칼림바', value: 'Kalimba', level: 3 },
      { label: '하프', value: 'Harp', level: 3 },
      { label: '우쿨렐레', value: 'Ukulele', level: 3 },
      { label: '아코디언', value: 'Accordion', level: 3 },
      { label: '퍼커션', value: 'Percussion, Congas', level: 3 },
      { label: '플루트', value: 'Flute', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. BPM / 템포 (tempo) — 단일 선택 강제
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'tempo',
    number: 5,
    icon: '⚡',
    title: 'BPM / 템포',
    desc: '리듬의 맥박',
    placeholder: '원하는 BPM을 직접 입력하세요',
    tags: [
      { label: '보통 (90-110)', value: '90-110 BPM, Moderate', level: 1 },
      { label: '85-102 BPM (붐뱁)', value: '85-102 BPM', level: 1 },
      { label: '느림 (70-85)', value: '70-85 BPM, Slow', level: 1 },
      { label: '약간 빠름 (115-125)', value: '115-125 BPM, Moderately Fast', level: 1 },
      { label: '빠름 (130-150)', value: '130-150 BPM, Fast', level: 2 },
      { label: '매우 느림 (60-70)', value: '60-70 BPM, Very Slow', level: 2 },
      { label: '초저속 (40-50)', value: '40-50 BPM, Very Slow', level: 3 },
      { label: '매우 빠름 (150-170)', value: '150-170 BPM, Very Fast', level: 3 },
      { label: '초고속 (170+)', value: '170+ BPM, Ultra Fast', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. 키 / 스케일 (key) — 🆕 신규, 단일 선택 강제
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'key',
    number: 6,
    icon: '🎵',
    title: '키 / 스케일 (선택)',
    desc: '곡의 조성과 음계',
    placeholder: '원하는 키를 직접 입력하세요 (예: Eb Major)',
    tags: [
      { label: '동양 음계 (East Asian Scale)', value: 'East Asian scale', level: 1 },
      { label: 'A 마이너', value: 'A Minor', level: 1 },
      { label: 'C 메이저', value: 'C Major', level: 1 },
      { label: 'E 마이너', value: 'E Minor', level: 1 },
      { label: 'G 메이저', value: 'G Major', level: 2 },
      { label: 'D 마이너', value: 'D Minor', level: 2 },
      { label: 'F 메이저', value: 'F Major', level: 2 },
      { label: 'B♭ 메이저', value: 'Bb Major', level: 3 },
      { label: 'F# 마이너', value: 'F# Minor', level: 3 },
      { label: '펜타토닉 스케일', value: 'Pentatonic Scale', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 7. 믹스 스타일 (production)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'production',
    number: 7,
    icon: '🎚️',
    title: '믹스 스타일',
    desc: '사운드의 마감',
    placeholder: '원하는 믹스 스타일을 직접 입력하세요',
    tags: [
      // Level 1 — 핵심 가이드
      { label: '스튜디오 퀄리티', value: 'Studio Quality, Clean Mix', level: 1 },
      { label: '로파이 믹스', value: 'Lo-fi Mix, Warm Analog', level: 1 },
      { label: '깨끗한 믹스', value: 'Clean Mix, Polished', level: 1 },
      { label: '하이파이', value: 'High Fidelity, Hyper-Realistic', level: 1 },
      // Level 2 — 사운드 구성
      { label: '라이브 레코딩', value: 'Live Recording, Concert Feel', level: 2 },
      { label: '빈티지 사운드', value: 'Vintage Sound, Retro Production', level: 2 },
      { label: '리버브 많은', value: 'Reverb Heavy, Spacious', level: 2 },
      { label: '공간감 있는', value: 'Spatial Audio, Immersive', level: 2 },
      { label: '베이스 부스트', value: 'Bass Boosted, Heavy Bass', level: 2 },
      { label: '미니멀한', value: 'Minimal, Stripped Back', level: 2 },
      { label: '오케스트라 편곡', value: 'Orchestral Arrangement', level: 2 },
      { label: '프리미엄 마스터링', value: 'Premium Mix, Clean Master', level: 2 },
      // Level 3 — 디테일 톤
      { label: '디스토션', value: 'Distorted, Raw', level: 3 },
      { label: '와이드 다이나믹', value: 'Wide Dynamic Range', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 8. 시대적 스타일 (era) — 🆕 신규
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'era',
    number: 8,
    icon: '📼',
    title: '시대적 스타일 (선택)',
    desc: '사운드의 연대감',
    placeholder: '원하는 시대 느낌을 직접 입력하세요',
    tags: [
      { label: '1980s 레트로 신스', value: '1980s Retro Synth', level: 1 },
      { label: '1990s 골든 에라', value: '90s Golden Era', level: 1 },
      { label: '1970s 빈티지', value: '1970s Vinyl Warmth, Analog', level: 2 },
      { label: '2000s Y2K', value: '2000s Y2K Pop, Early Digital', level: 2 },
      { label: '1960s 클래식', value: '1960s Classic, Motown', level: 3 },
      { label: '퓨처리스틱', value: 'Futuristic, Cyberpunk Digital', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 9. 보컬 이펙트 (vocalFx) — 🆕 신규
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'vocalFx',
    number: 9,
    icon: '🎛️',
    title: '보컬 이펙트 (선택)',
    desc: '목소리 가공 방식',
    placeholder: '원하는 보컬 이펙트를 직접 입력하세요',
    tags: [
      { label: '리버브 보컬', value: 'Reverb-Drenched Vocals', level: 1 },
      { label: '보컬 하모니', value: 'Layered Backing Vocals, Harmonies', level: 1 },
      { label: '보컬 찹스', value: 'Vocal Chops, Chopped Vocal Samples', level: 2 },
      { label: '보코더', value: 'Vocoder Harmonies', level: 2 },
      { label: '드라이 마이킹', value: 'Dry, Close-Miked Vocals', level: 2 },
      { label: '디스토션 보컬', value: 'Distorted Vocals, Lo-fi Vocal', level: 3 },
      { label: '에코 딜레이', value: 'Echo, Delay Effect', level: 3 },
      { label: '애드리브', value: 'Ad-lib, Vocal Adlibs', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 10. 환경 소음 / ASMR (foley) — 🆕 신규
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'foley',
    number: 10,
    icon: '🌧️',
    title: '환경 소음 / ASMR (선택)',
    desc: '공간감의 질감',
    placeholder: '원하는 환경 소리를 직접 입력하세요',
    tags: [
      { label: '빗소리', value: 'Rain Sounds, Rain on Window', level: 1 },
      { label: '테이프 노이즈', value: 'Tape Hiss, Vinyl Crackle', level: 1 },
      { label: '모닥불', value: 'Crackling Fireplace', level: 2 },
      { label: '카페 소음', value: 'Coffee Shop Chatter, Ambient Noise', level: 2 },
      { label: '새소리', value: 'Birds Chirping, Nature Sounds', level: 2 },
      { label: '파도 소리', value: 'Ocean Waves, Beach Ambience', level: 2 },
      { label: '바람 소리', value: 'Wind Blowing, Atmospheric Noise', level: 3 },
      { label: '천둥', value: 'Thunder, Storm Ambience', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 11. 곡 구조 힌트 (structure) — 🆕 신규
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'structure',
    number: 11,
    icon: '🏗️',
    title: '곡 구조 힌트 (선택)',
    desc: '편곡의 흐름',
    placeholder: '원하는 곡 구조를 직접 입력하세요',
    tags: [
      { label: '짧은 인트로', value: 'Short Instrumental Intro', level: 1 },
      { label: '비트 드롭', value: 'Sudden Beat Drop', level: 1 },
      { label: '느린 빌드업', value: 'Slow Build-up, Crescendo', level: 2 },
      { label: '미니멀 인트로', value: 'Minimalist Intro', level: 2 },
      { label: '루프형 아웃트로', value: 'Seamless Looping Outro, Fade Out', level: 2 },
      { label: '솔로 섹션', value: 'Solo Section, Instrumental Break', level: 3 },
      { label: '브레이크다운', value: 'Breakdown, Stripped Back', level: 3 },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 12. 채널 컨셉 / 용도 (theme)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'theme',
    number: 12,
    icon: '🎬',
    title: '채널 컨셉 / 용도 (선택)',
    desc: '음악의 목적',
    placeholder: '원하는 용도나 테마를 직접 입력하세요',
    tags: [
      // Level 1 — 핵심 가이드
      { label: '공부 BGM', value: 'Study BGM, Focus Music', level: 1 },
      { label: '카페 음악', value: 'Café Music, Coffee Shop Vibes', level: 1 },
      { label: '수면 / ASMR', value: 'Sleep Music, ASMR, Lullaby', level: 1 },
      // Level 2 — 사운드 구성
      { label: '브이로그 BGM', value: 'Vlog BGM, Background Music', level: 2 },
      { label: '운동 음악', value: 'Running Music, Workout Music', level: 2 },
      { label: '비 오는 날', value: 'Rainy Day Music', level: 2 },
      { label: '드라이브 음악', value: 'Driving Music, Road Trip', level: 2 },
      { label: '야간 감성', value: 'Late Night Vibes, Midnight', level: 2 },
      { label: '아침 모닝 루틴', value: 'Morning Routine Music', level: 2 },
      { label: '시네마틱 트레일러', value: 'Cinematic Trailer Music', level: 2 },
      { label: '명상 / 요가', value: 'Meditation Music, Yoga', level: 2 },
      { label: '유튜브 플리 BGM', value: 'YouTube Playlist BGM, Focus Music', level: 2 },
      // Level 3 — 디테일 톤
      { label: '게임 음악', value: 'Gaming Music, 8-bit', level: 3 },
      { label: '바다 / 해변', value: 'Ocean Breeze, Beach Music', level: 3 },
      { label: '우주 / SF', value: 'Space Journey, Sci-Fi', level: 3 },
      { label: '유튜브 인트로', value: 'YouTube Intro Music', level: 3 },
      { label: '팟캐스트 BGM', value: 'Podcast Background Music', level: 3 },
    ],
  },
]

/** 단일 선택 강제 카테고리 ID 목록 */
export const SINGLE_SELECT_CATEGORIES = ['tempo', 'key'] as const
