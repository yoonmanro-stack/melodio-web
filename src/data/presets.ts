import type { Preset } from '@/types'

// 명도와 채도를 통일한 6대 프리미엄 시그니처 그라데이션
const GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #a855f7)', // Indigo Purple
  'linear-gradient(135deg, #4f46e5, #ec4899)', // Deep Pink
  'linear-gradient(135deg, #3b82f6, #8b5cf6)', // Royal Violet
  'linear-gradient(135deg, #a855f7, #ec4899)', // Purple Rose
  'linear-gradient(135deg, #38bdf8, #6366f1)', // Sky Indigo
  'linear-gradient(135deg, #6366f1, #fb7185)', // Indigo Coral
  'linear-gradient(135deg, #ff79c6, #8be9fd)'  // Vaporwave Pink Teal
]

export const presets: Preset[] = [
  {
    id: 'developer-debugging',
    category: 'focus',
    emoji: '💻',
    name: '시니어 개발자의 백엔드 디버깅 룸',
    name_ko: '시니어 개발자의 백엔드 디버깅 룸',
    name_en: "Senior Developer's Midnight Debugging Room",
    name_ja: 'シニア開発者の深夜デバッグルーム',
    desc: '새벽녘 쌓인 에러를 지워내는 개발자를 위한 차갑고 몰입감 높은 사이버펑크 앰비언트',
    desc_ko: '새벽녘 쌓인 에러를 지워내는 개발자를 위한 차갑고 몰입감 높은 사이버펑크 앰비언트',
    desc_en: 'A cold, immersive cyberpunk ambient soundtrack tailored for focus and solving complex bugs at dawn.',
    desc_ja: '夜明けに複雑なバグと格闘する開発者のための、冷たくて没入感の高いサイバーパンク・アンビエント。',
    gradient: GRADIENTS[0],
    selections: {},
    customPrompt: 'dark cyberpunk synthwave, deep focus, slow arpeggiated D minor synthesizer, gritty analog saw lead, wide metallic delay plucks, deep sub-bass drone, sidechained kick, crisp electronic hats, mechanical keyboard typing foley, instrumental, 105 BPM'
  },
  {
    id: 'iced-oolong-tea',
    category: 'healing',
    emoji: '🍵',
    name: '아이스 우롱티, 나른한 오후의 여유',
    name_ko: '아이스 우롱티, 나른한 오후의 여유',
    name_en: 'Iced Oolong Tea: Lazy Afternoon Breeze',
    name_ja: 'アイス烏龍茶、のどかな午後のひととき',
    desc: '나른한 주말 오후, 창가로 스며드는 미풍을 닮은 맑고 포근한 멜로우 로파이 비트',
    desc_ko: '나른한 주말 오후, 창가로 스며드는 미풍을 닮은 맑고 포근한 멜로우 로파이 비트',
    desc_en: 'A warm, mellow lofi beat that captures the quiet comfort of a lazy Sunday afternoon by the window.',
    desc_ja: 'うららかな週末の午後、窓から差し込むそよ風のような、澄んでいて心地よいメロウ・ローファイ。',
    gradient: GRADIENTS[1],
    selections: {},
    customPrompt: 'mellow lofi jazzhop, warm acoustic guitar, seven-chords fingerpicking, woody double bass slide, syncopated organic groove, vinyl crackle snare, brushed cymbals, tea pouring foley, rain drops, nostalgic lounge, instrumental, 78 BPM'
  },
  {
    id: 'tokyo-midnight-1984',
    category: 'drive',
    emoji: '🌃',
    name: '1984 도쿄, 미드나잇 시티팝 드라이브',
    name_ko: '1984 도쿄, 미드나잇 시티팝 드라이브',
    name_en: 'Tokyo 1984: Midnight City Pop Drive',
    name_ja: '1984년東京、ミッドナイト・シティポップ・ドライブ',
    desc: '네온 빛 도로 위를 흘러가는 세련된 80년대 아날로그 시티팝의 펑키한 슬랩 베이스',
    desc_ko: '네온 빛 도로 위를 흘러가는 세련된 80년대 아날로그 시티팝의 펑키한 슬랩 베이스',
    desc_en: 'A groovy, nostalgic 80s city pop drive soundtrack featuring funky slap bass and analog synthesizer stabs.',
    desc_ja: 'ネオン光る夜のハイウェイを駆け抜ける、80年代の洗練されたファンキーなスラップベース・シティポップ。',
    gradient: GRADIENTS[2],
    selections: {},
    customPrompt: '1980s city pop, nostalgic synthpop, funk slap bassline, retro polyphonic synthesizer stabs, palm-muted funky electric guitar, smooth female lead vocals, punchy disco drums, vintage plate reverb, Tokyo midnight drive vibe, 115 BPM'
  },
  {
    id: 'matcha-kyoto-jazz',
    category: 'cafe',
    emoji: '🍵',
    name: '비 내리는 교토 카페, 말차와 아날로그 재즈',
    name_ko: '비 내리는 교토 카페, 말차와 아날로그 재즈',
    name_en: 'Rainy Kyoto Cafe: Matcha & Warm Piano Jazz',
    name_ja: '雨の京都カフェ、抹茶と温かいピアノジャズ',
    desc: '비 오는 날, 쌉싸름한 말차 한 잔과 함께 가만히 흘려듣는 아늑한 아날로그 재즈 피아노',
    desc_ko: '비 오는 날, 쌉싸름한 말차 한 잔과 함께 가만히 흘려듣는 아늑한 아날로그 재즈 피아노',
    desc_en: 'A cozy analog piano jazz session, perfect for listening on a rainy day with a cup of warm, bitter matcha.',
    desc_ja: '雨の日の京都で、ほろ苦い抹茶を片手に静かに耳を傾ける、居心地の良いアナログ・ジャ즈ピアノ。',
    gradient: GRADIENTS[3],
    selections: {},
    customPrompt: 'kyoto cafe jazz piano, vintage acoustic grand, slow jazzy chords, melancholic upright double bass, soft brush snare drums, ride cymbal, quiet hi-hat, wooden room acoustics, light rain on windowpane, instrumental, 68 BPM'
  },
  {
    id: 'french-vintage-chanson',
    category: 'cafe',
    emoji: '🇫🇷',
    name: '촉촉한 파리 밤거리, 빈티지 아코디언 샹송',
    name_ko: '촉촉한 파리 밤거리, 빈티지 아코디언 샹송',
    name_en: 'Rain-Slicked Paris Streets: Vintage Chanson',
    name_ja: '雨に濡れたパリの街角、ヴィンテージ・シャンソン',
    desc: '빛 바랜 턴테이블에서 흘러나오는 듯 애절하고 낭만적인 1950년대 감성 샹송',
    desc_ko: '빛 바랜 턴테이블에서 흘러나오는 듯 애절하고 낭만적인 1950년대 감성 샹송',
    desc_en: 'A romantic and melancholic 1950s waltz chanson, drifting from a dusty, warm vinyl record.',
    desc_ja: '色あせたターンテーブルから静かに流れるような、哀愁を帯びたロマンチックな1950年代シャンソン。',
    gradient: GRADIENTS[4],
    selections: {},
    customPrompt: '1950s French chanson, romantic cafe waltz rhythm, nostalgic acoustic piano, longing accordion melody, warm double bass, soft brushed snare, passionate emotional female vocals, vintage vinyl crackle, tape saturation, Paris night, 85 BPM'
  },
  {
    id: 'deep-sleep-drift',
    category: 'healing',
    emoji: '🌙',
    name: '깊은 수면 속으로의 표류, 12시간 숙면 앰비언트',
    name_ko: '깊은 수면 속으로의 표류, 12시간 숙면 앰비언트',
    name_en: 'Drifting into Deep Sleep: Ultra-Warm Ambient',
    name_ja: '深き眠りへの漂流、12時間極上の安眠アンビエント',
    desc: '잡념을 지우고 포근한 꿈의 나라로 안내하는 초침묵 명상 수면 유도 사운드',
    desc_ko: '잡념을 지우고 포근한 꿈의 나라로 안내하는 초침묵 명상 수면 유도 사운드',
    desc_en: 'A cocoon of ultra-warm analog pads and gentle harp arpeggios designed to quiet the mind and guide you to rest.',
    desc_ja: '余計な雑念を消し去り、温かみのある音の波で心地よい夢の国へと誘う、睡眠導入サウンド。',
    gradient: GRADIENTS[5],
    selections: {},
    customPrompt: 'deep sleep ambient soundscape, ultra-warm analog synthesizer pad, slow attack and release, gentle acoustic harp arpeggio, ethereal female vocal chops, lush hall reverb, ocean waves, binaural beats, no drums, extremely slow, 45 BPM'
  },
  {
    id: 'dead-mall-nostalgia',
    category: 'retro',
    emoji: '🛒',
    name: '1992년 버려진 쇼핑몰, 아득한 멜랑콜리',
    name_ko: '1992년 버려진 쇼핑몰, 아득한 멜랑콜리',
    name_en: '1992 Abandoned Mall: Liminal Dream Garage',
    name_ja: '1992년廃墟モール、遥かなるメランコリー',
    desc: '텅 빈 에스컬레이터와 네온 아래 울려 퍼지는 트렌디 멜로우 리퀴드 DnB & 드림 가라지 BGM',
    desc_ko: '텅 빈 에스컬레이터와 네온 아래 울려 퍼지는 트렌디 멜로우 리퀴드 DnB & 드림 가라지 BGM',
    desc_en: 'A dreamy, melancholic blend of mellow liquid drum & bass and garage echoing through a nostalgic liminal space.',
    desc_ja: '誰もいないエスカレーターとネオンの下で響き渡る、ドリーミーで洗練されたリキッドDnB＆ガレージ。',
    gradient: GRADIENTS[6],
    selections: {},
    customPrompt: 'liquid drum and bass, dreamy UK garage, vaporwave mallsoft, retro DX7 electric piano, smooth jazz chords, distant echoing saxophone melody, massive hall reverb, VHS tape flutter, low-fidelity tape hiss, liminal space, instrumental, 120 BPM'
  },
  {
    id: 'joseon-hip-hop',
    category: 'cinematic',
    emoji: '🇰🇷',
    name: '조선 힙합 & 국악 퓨전 붐뱁',
    name_ko: '조선 힙합 & 국악 퓨전 붐뱁',
    name_en: 'Joseon Hip Hop: Gugak Boom Bap Fusion',
    name_ja: '朝鮮ヒップホップ＆国楽フュージョン・ブームバップ',
    desc: '가야금·대금과 웅장한 브라스, 판소리식 꺾기 보컬 및 고강도 붐뱁 비트가 만난 압도적 조선 힙합 퓨전 사운드',
    desc_ko: '가야금·대금과 웅장한 브라스, 판소리식 꺾기 보컬 및 고강도 붐뱁 비트가 만난 압도적 조선 힙합 퓨전 사운드',
    desc_en: 'A powerful fusion of Joseon hip hop and traditional Korean sounds, featuring dynamic rap, gayageum, daegeum, epic brass, and heavy boom bap beats.',
    desc_ja: '伽耶琴・大琴の音色と壮大なブラス、パンソリ風ボーカルと重厚なブームバップ・ビートが 融合した圧倒的ヒップホップ。',
    gradient: 'linear-gradient(135deg, #ef4444, #8b5cf6)',
    selections: {},
    customPrompt: 'Joseon hip hop, gugak fusion rap, traditional Korean instruments, gayageum pluck, daegeum flute, heavy boom bap beat, epic brass, raw expressive rap, East Asian scale, key of E minor, 85 BPM, spacious room reverb, featuring warm Fender Rhodes chords, [High-fidelity studio mastering, professional grade audio], key of A major, 102 BPM, subtle cassette tape hiss, featuring smooth saxophone riffs, 혼성 보컬, 판소리식 꺾기와 멜로딕 훅, 웅장한 브라스 스탭'
  },
  {
    id: 'traditional-trot-master',
    category: 'retro',
    emoji: '🎤',
    name: '인생 2막, 막걸리 한 잔과 정통 트로트',
    name_ko: '인생 2막, 막걸리 한 잔과 정통 트로트',
    name_en: 'Life Chapter 2: Traditional Korean Trot & Pathos',
    name_ja: '人生第2幕、マッコリ一杯と正統派トロット',
    desc: '굽이진 인생길과 세월의 애환을 노래하는 구슬픈 색소폰과 아코디언, 가슴을 울리는 진한 정통 트로트',
    desc_ko: '굽이진 인생길과 세월의 애환을 노래하는 구슬픈 색소폰과 아코디언, 가슴을 울리는 진한 정통 트로트',
    desc_en: 'Soulful traditional Korean trot evoking life pathos and nostalgia, featuring weeping saxophone and accordion.',
    desc_ja: '人生の哀歓を歌い上げる、哀愁漂うサックスとアコーディオンが響く正統派トロット。',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    selections: {},
    customPrompt: 'Traditional Korean Trot, passionate emotional male or female vocal, deep trot vibrato and vocal ornamentation, mournful saxophone solo, nostalgic accordion melody, weeping electric guitar, warm acoustic rhythm guitar, orchestral strings, 72 BPM, slow 4/4 time signature, authentic studio master mix'
  },
  {
    id: 'highway-disco-trot',
    category: 'dance',
    emoji: '💃',
    name: '고속도로 휴게소, 신바람 디스코 트롯 메들리',
    name_ko: '고속도로 휴게소, 신바람 디스코 트롯 메들리',
    name_en: 'Highway Disco Trot: High-Energy Nonstop Party',
    name_ja: '高速道路ディスコ・トロット・メドレー',
    desc: '관광버스와 고속도로를 들썩이게 만드는 화려한 브라스와 팡파르, 어깨춤이 절로 나는 신바람 디스코 뽕짝',
    desc_ko: '관광버스와 고속도로를 들썩이게 만드는 화려한 브라스와 팡파르, 어깨춤이 절로 나는 신바람 디스코 뽕짝',
    desc_en: 'High-energy highway disco trot medley with punchy brass fanfares, bouncy synth bass, and infectious dance grooves.',
    desc_ja: '華やかなブラスとシンセベースが躍動する、ノリノリの高速道路ディスコ・トロット。',
    gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)',
    selections: {},
    customPrompt: 'Modern Korean Dance Trot, high-energy highway disco medley, upbeat brass section fanfares, punchy disco drums, bouncy electronic synth bass, catchy singalong hook, lively rhythm guitar, bright charismatic vocal, 136 BPM, celebratory party energy'
  },
  {
    id: 'acoustic-folk-trot',
    category: 'healing',
    emoji: '🍂',
    name: '고향역 밤안개, 감성 포크 성인가요',
    name_ko: '고향역 밤안개, 감성 포크 성인가요',
    name_en: 'Hometown Station: Acoustic Folk Trot & Nostalgia',
    name_ja: '故郷の駅の夜霧、感性フォーク・トロット',
    desc: '고향집 어머니와 밤안개 낀 간이역의 추억을 그리는 따스한 통기타와 하모니카 선율의 감성 트롯',
    desc_ko: '고향집 어머니와 밤안개 낀 간이역의 추억을 그리는 따스한 통기타와 하모니카 선율의 감성 트롯',
    desc_en: 'Warm acoustic folk trot with intimate nylon guitar arpeggios, nostalgic harmonica, and heartfelt adult contemporary vocals.',
    desc_ja: '温かなアコースティックギターとハーモニカが紡ぐ、故郷の哀愁と母への想いを描いた感性トロット。',
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    selections: {},
    customPrompt: 'Acoustic Folk Trot, warm adult contemporary, gentle nylon acoustic guitar fingerpicking, nostalgic harmonica fills, mellow upright bass, soft grand piano, warm intimate vocal, reflective and heartfelt, 78 BPM, pristine studio clarity'
  }
]
