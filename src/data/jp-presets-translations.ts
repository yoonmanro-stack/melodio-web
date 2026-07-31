export interface PresetTranslation {
  name_ko: string;
  name_en: string;
  name_ja: string;
  name_es?: string;
  name_fr?: string;
  name_de?: string;
  name_pt?: string;
  name_zh?: string;
  name_it?: string;
  name_hi?: string;
  desc_ko: string;
  desc_en: string;
  desc_ja: string;
  desc_es?: string;
  desc_fr?: string;
  desc_de?: string;
  desc_pt?: string;
  desc_zh?: string;
  desc_it?: string;
  desc_hi?: string;
  [key: string]: string | undefined;
}

export const jpPresetTranslations: Record<string, PresetTranslation> = {
  "romance-pop": {
    name_ko: "80s 도쿄 시티팝",
    name_en: "80s Tokyo City Pop",
    name_ja: "80s 東京シティポップ",
    desc_ko: "80년대 레트로 감성의 도쿄 밤거리 분위기. 아날로그 신디사이저와 그루비한 베이스.",
    desc_en: "Retro Tokyo nights with upbeat analog synthesizers, groovy basslines, and smooth nostalgic vocals.",
    desc_ja: "80年代レトロな東京の夜。アナログシンセサイザーとグルーヴィーなベースライン。"
  },
  "lofi-study": {
    name_ko: "J-로파이 포커스 (공부/집중)",
    name_en: "J-Lofi Focus: Rainy Midnight",
    name_ja: "J-Lofi フォーカス (読書・勉強用)",
    desc_ko: "도쿄 거리에 내리는 빗소리 폴리 사운드와 테이프 히스가 믹스된 고요한 새벽 비트.",
    desc_en: "A serene lo-fi beat blended with the gentle sound of Tokyo rain and cozy tape hiss.",
    desc_ja: "東京の街に降る rain sound と、温かみのあるテープヒスが混ざり合う、静かな深夜のローファイ。"
  },
  "cozy-jazz-cafe": {
    name_ko: "시부야 미드나잇 재즈 카페",
    name_en: "Shibuya Midnight Jazz Cafe",
    name_ja: "渋谷ミッドナイト・ジャズカフェ",
    desc_ko: "시부야 골목 카페에서 흘러나오는 듯한 감미로운 피아노와 색소폰 선율의 재즈 BGM.",
    desc_en: "A warm, soothing piano and saxophone jazz session reminiscent of a hidden cafe in Shibuya.",
    desc_ja: "渋谷の隠れ家カフェから流れるような, 甘美で落ち着いたピアノとサックスのジャズBGM。"
  },
  "acoustic-healing": {
    name_ko: "시부야 어쿠스틱 아침 산책",
    name_en: "Shibuya Acoustic Morning Walk",
    name_ja: "渋谷アコースティック・朝の散歩",
    desc_ko: "지친 일상에 청량함을 선사하는 밝고 상쾌한 어쿠스틱 기타와 숲 속 새소리.",
    desc_en: "A refreshing acoustic guitar breeze accompanied by peaceful forest birds chirping.",
    desc_ja: "疲れた日常に癒しを届ける、爽やかなアコースティックギターと小鳥のさえずり。"
  },
  "kawaii-future": {
    name_ko: "하라주쿠 카와이 베이스",
    name_en: "Harajuku Kawaii Future Bass",
    name_ja: "原宿カワイイ・フューチャーベース",
    desc_ko: "하라주쿠의 통통 튀는 네온 감성. 귀여운 피치 보컬과 에너제틱한 퓨처 베이스.",
    desc_en: "Bright, bouncy Harajuku vibes featuring sweet high-pitched vocals and energetic synths.",
    desc_ja: "原宿のポップなネオン感。キュートなピッチドボーカルと弾むフューチャーベース。"
  },
  "okinawa-sanshin": {
    name_ko: "오키나와 에메랄드 파도 치유",
    name_en: "Okinawa Emerald Wave Healing",
    name_ja: "沖縄エメラルド・波の音ヒーリング",
    desc_ko: "오키나와 전통 현악기 삼신(Sanshin)과 맑고 청명한 해변 파도 소리.",
    desc_en: "Peaceful ocean waves harmonized with the traditional Okinawa Sanshin string instrument.",
    desc_ja: "沖縄の伝統弦楽器「三線（さんしん）」と, 澄み渡る波の音が織りなす癒し。"
  },
  "kyoto-ambient": {
    name_ko: "교토 대나무 숲 명상",
    name_en: "Kyoto Arashiyama Bamboo Rest",
    name_ja: "京都嵐山・竹林の瞑想アンビエント",
    desc_ko: "아라시야마 대나무 숲의 사각거리는 바람 소리와 물소리가 조화로운 미니멀 앰비언트.",
    desc_en: "A calming minimal ambient soundscape of wind rustling through Arashiyama bamboo forest.",
    desc_ja: "嵐山の竹林をそよぐ風의 소리, 잔잔한 물소리가 마음을 정화하는 젠 스타일 앰비언트。"
  },
  "anime-rock": {
    name_ko: "도쿄 청춘 애니 OST J-Rock",
    name_en: "Tokyo Youth Anime J-Rock",
    name_ja: "東京青春アニメOST風 J-Rock",
    desc_ko: "스포츠 애니메이션 오프닝을 연상시키는 질주감 있고 파워풀한 청춘 밴드 사운드.",
    desc_en: "High-energy, driving band rock reminiscent of a sports anime opening theme.",
    desc_ja: "スポーツアニメのオープニングを彷彿とさせる、疾走感あふれるパワフルな青春ロック。"
  },
  "tokyo-future-funk": {
    name_ko: "도쿄 퓨처 펑크",
    name_en: "Tokyo Future Funk",
    name_ja: "東京フューチャーファンク",
    desc_ko: "시티팝 소스를 샘플링하여 펑키한 하우스 비트로 재해석한 신나고 레트로한 댄스 음악.",
    desc_en: "Upbeat disco house and dance music reconstructing retro city pop samples with modern sidechain compression.",
    desc_ja: "シティポップの音源をサンプリングし、現代のファンキーなハウスビートに再構築したダンスミュージック。"
  },
  "sapporo-snow": {
    name_ko: "삿포로 겨울 로파이",
    name_en: "Sapporo fireplace Winter Lofi",
    name_ja: "札幌しんしん雪のLofi",
    desc_ko: "눈 내리는 삿포로 거리의 벽난로 타는 소리와 잔잔한 건반 선율이 믹스된 겨울 감성 로파이.",
    desc_en: "A warm winter lofi beat featuring fireplace crackles, soft piano chords, and snowy Sapporo cabin vibes.",
    desc_ja: "雪降る札幌の夜、暖炉의 따스한 타오르는 소리와 아늑한 건반 선율이 어우러진 수면 유도 로파이。"
  },
  "shibuya-neon-rock": {
    name_ko: "시부야 인디 얼터너티브 록",
    name_en: "Shibuya Indie Alternative Rock",
    name_ja: "渋谷インディーズ・オルタナロック",
    desc_ko: "도쿄 지하 라이브하우스의 거칠고 매력적인 인디 얼터너티브 밴드 사운드.",
    desc_en: "Raw, energetic alternative rock reminiscent of underground live venues in Tokyo.",
    desc_ja: "東京의 지하 라이브하우스에서 울려 퍼지는, 거칠고 에너제틱한 청춘 밴드 사운드。"
  },
  "kamakura-surf": {
    name_ko: "가마쿠라 해변 서프 포크",
    name_en: "Kamakura Beach Surf Folk",
    name_ja: "鎌倉海岸サーフフォーク",
    desc_ko: "가마쿠라 바다 건너 에노시마를 바라보며 연주하는 싱그럽고 청량한 어쿠스틱 서프 팝.",
    desc_en: "Fresh, breezy acoustic surf pop played while gazing at Enoshima across Kamakura bay.",
    desc_ja: "鎌倉의 바다 건너 에노시마를 보며 연주하는, 청량하고 싱그러운 어쿠스틱 기타 선율。"
  },
  "osaka-street-food": {
    name_ko: "오사카 타코야끼 축제 펑크",
    name_en: "Osaka Dotonbori Festive Funk",
    name_ja: "大阪道頓堀お祭りファンク",
    desc_ko: "축제날 도톤보리의 활기찬 상인 목소리와 타악기 리듬이 합쳐진 유쾌하고 경쾌한 펑키 브라스 BGM.",
    desc_en: "Upbeat brass funk blending clapping rhythms with the lively chatter of Osaka's Dotonbori street festival.",
    desc_ja: "도톤보리 축제의 활기찬 웃음소리와 유쾌하고 신나는 펑키 브라스 BGM。"
  },
  "fuji-meditation": {
    name_ko: "후지산 새벽선율 명상 BGM",
    name_en: "Mount Fuji Dawn Meditation",
    name_ja: "富士山日の出の瞑想コト",
    desc_ko: "후지산 호숫가에 피어오르는 새벽안개. 거문고 스타일의 고토 현 선율과 깊은 명상 패드 사운드.",
    desc_en: "Ethereal traditional koto strings drifting through Mount Fuji dawn mist, paired with deep zen meditation pads.",
    desc_ja: "후지산 새벽안개 속 울리는 일본 가야금 스타일 고토 선율과 아득한 수면 앰비언트 패드。"
  },
  "ghibli-fantasy": {
    name_ko: "지브리 감성 숲속 오케스트라 왈츠",
    name_en: "Ghibli Forest Orchestral Waltz",
    name_ja: "ジブリ風・森의 왈츠",
    desc_ko: "동화 속 미지의 숲을 거니는 듯 서정적이고 아련한 피아노와 스트링스 오케스트라 왈츠 BGM.",
    desc_en: "A lyrical and nostalgic orchestral waltz featuring beautiful woodwinds and piano, like walking in a fantasy forest.",
    desc_ja: "마치 동화 속 지브리 숲을 걷는 듯 아련한 선율의 피아노 오케스트라 왈츠 BGM。"
  },
  "akiba-chiptune": {
    name_ko: "아키하바라 8비트 레트로 칩튠",
    name_en: "Akihabara 8-Bit Retro Chiptune",
    name_ja: "秋葉原8bitレトロチップチューン",
    desc_ko: "레트로 전자 게임기 감성의 통통 튀는 신디사이저 사운드. 밝고 귀여운 칩튠 댄스 BGM.",
    desc_en: "Playful, energetic 8-bit chiptune dance music filled with retro arcade nostalgia and synthesizer melodies.",
    desc_ja: "아키하바라 아케이드 게임기의 뿅뿅거리는 사운드를 재해석한 유쾌한 레트로 8비트 BGM。"
  },
  "okinawa-sunset": {
    name_ko: "오키나와 해변 발라드",
    name_en: "Okinawa Beach Sunset Ballad",
    name_ja: "沖縄海岸サンセットバラード",
    desc_ko: "저물어가는 에메랄드 해변을 보며 노래하는 가슴 시린 오키나와 감성 발라드.",
    desc_en: "A touching and emotional slow ballad with warm guitar chords, set against the sunset over Okinawa sea.",
    desc_ja: "오키나와 노을 지는 해변을 보며 연주하는, 가슴 시리도록 아름다운 남성 포크 발라드。"
  },
  "citypop-midnight": {
    name_ko: "도쿄 심야 고속도로 시티팝",
    name_en: "Midnight Tokyo Expressway City Pop",
    name_ja: "東京深夜ハイウェイ・シティポップ",
    desc_ko: "신디사이저 리듬과 청량한 기타 연주가 흐르는 도시적이고 세련된 드라이브용 시티팝.",
    desc_en: "Urban and sophisticated drive music driven by synthesizers, retro guitars, and late night highway vibes.",
    desc_ja: "도쿄 야간 수도고속도로를 달리며 카오디오에서 흘러나오는 듯한 세련되고 시원한 시티팝。"
  },
  "cozy-rainy-cafe": {
    name_ko: "비 오는 날 잔잔한 피아노 카페 BGM",
    name_en: "Rainy Day Mellow Piano Cafe",
    name_ja: "雨の日のカフェ・ピアノBGM",
    desc_ko: "차분히 떨어지는 빗소리를 배경으로 흐르는 감미롭고 평온한 피아노 솔로 연주 BGM.",
    desc_en: "Soothing solo piano melodies recorded inside a cozy room with the calm texture of rainfall outside.",
    desc_ja: "창가에 흐르는 빗소리를 반주 삼아 조용히 연주하는 아늑한 독주 재즈 피아노 BGM。"
  },
  "lofi-dreamy-moon": {
    name_ko: "달빛 아래 꿈결 수면 로파이",
    name_en: "Dreamy Moonlight Sleep Lofi",
    name_ja: "月明かりの安眠ドリームLofi",
    desc_ko: "레트로 턴테이블 바이닐 잡음과 몽환적인 코러스 패드가 합쳐진 힐링 수면 로파이 비트.",
    desc_en: "A cozy sleep-inducing lofi beat combining warm Rhodes chords, vinyl crackles, and ethereal chorus pads.",
    desc_ja: "턴테이블의 빈티지한 잡음과 은은한 달빛의 아득한 Rhodes 피아노 선율의 수면 BGM。"
  },
  "spring-sakura": {
    name_ko: "벚꽃 흩날리는 아침 산책 포크",
    name_en: "Sakura Spring Breeze Folk",
    name_ja: "桜舞い散る朝のフォークソング",
    desc_ko: "싱그러운 어쿠스틱 기타와 아침 이슬 속 지저귀는 새소리가 전하는 따뜻한 봄날의 힐링 사운드.",
    desc_en: "Warm acoustic guitar fingerpicking layered with morning dew birdsong, capturing the essence of spring.",
    desc_ja: "흩날리는 벚꽃길을 걸으며 듣는, 청량하고 상쾌한 포크 기타와 지저귀는 새소리 BGM。"
  },
  "akihabara-cyber": {
    name_ko: "사이버 시부야 그리드 신스웨이브",
    name_en: "Cyber Shibuya Grid Synthwave",
    name_ja: "電脳渋谷グリッド・シンセウェーブ",
    desc_ko: "신비롭고 웅장한 사이버 펑크 스타일 신스웨이브 테마와 네온 감성의 하우스 리듬.",
    desc_en: "A mysterious, futuristic synthwave track with heavy analog synth leads and fast-tempo cyberpunk rhythms.",
    desc_ja: "시부야 뒷골목 네온사인을 테마로 한 아날로그 쏘 신디사이저와 웅장한 하우스 비트 BGM。"
  },
  "harajuku-pop-rock": {
    name_ko: "하라주쿠 청춘 팝 록",
    name_en: "Harajuku Youth Pop Rock",
    name_ja: "原宿青春ポップロック",
    desc_ko: "하라주쿠 소년 소녀들의 활기차고 경쾌한 얼터너티브 청춘 파워 팝 락.",
    desc_en: "An energetic alternative power pop rock anthem full of youthful spirit and driving guitar tones.",
    desc_ja: "방과 후 거리를 뛰어다니는 청춘들의 에너지 넘치는 신나고 경쾌한 팝록 밴드 사운드。"
  },
  "enoshima-surf": {
    name_ko: "에노시마 여름 파도 서프 록",
    name_en: "Enoshima Summer Surf Rock",
    name_ja: "江の島サマー・サーフロック",
    desc_ko: "여름 태양 아래 시원한 파도를 타며 듣는 리드미컬하고 밝은 캘리포니아 서프 록.",
    desc_en: "Bright, sun-drenched California style surf rock with twangy electric guitars and beach drum grooves.",
    desc_ja: "뜨거운 태양 아래 에노시마 전차를 보며 시원하게 파도를 가르는 일렉 기타 서프 록 BGM。"
  },
  "asakusa-traditional": {
    name_ko: "아사쿠사 신사 힐링 전통 국악",
    name_en: "Asakusa Temple Peace Traditional",
    name_ja: "浅草寺の静寂・和風アンビエント",
    desc_ko: "아사쿠사 신사의 고요한 분위기. 샤쿠하치와 고토 연음이 조화를 이루는 차분한 전통 국악 힐링 BGM.",
    desc_en: "Peaceful zen ambient music combining traditional shakuhachi flute, koto strings, and quiet temple bells.",
    desc_ja: "아사쿠사 신사의 붉은 단청 위로 흩날리는 벚꽃과 정적인 거문고 소리 같은 동양 힐링 BGM。"
  },
  "ginza-neon-jazz": {
    name_ko: "긴자 럭셔리 네온 재즈",
    name_en: "Ginza Neon Swing City Jazz",
    name_ja: "銀座ネオン・スウィングジャズ",
    desc_ko: "긴자의 화려한 네온사인 아래 흘러나오는 업비트하고 세련된 시티 재즈 BGM. 트럼펫과 피아노 반주.",
    desc_en: "Sophisticated and upbeat Ginza night-life city jazz featuring brilliant trumpets and jazzy piano chords.",
    desc_ja: "긴자 쇼핑가의 화려한 야경을 테마로 한 업템포의 세련된 트럼펫 스윙 재즈 BGM。"
  },
  "yokohama-port-acoustic": {
    name_ko: "요코하마 항구 어쿠스틱 포크",
    name_en: "Yokohama Port Acoustic Folk",
    name_ja: "横浜港アコースティックフォーク",
    desc_ko: "요코하마 항구에서 부는 바닷바람과 잔잔한 파도 소리를 닮은 어쿠스틱 포크 기타 선율.",
    desc_en: "Warm acoustic guitar chords blended with gentle ocean waves and refreshing bay harbor breezes.",
    desc_ja: "요코하마 대관람차 불빛을 조명 삼아 부르는 잔잔한 어쿠스틱 기타 감성 포크 BGM。"
  },
  "tokyo-subway-commute": {
    name_ko: "도쿄 지하철 퇴근길 시티팝",
    name_en: "Tokyo Subway Commute City Pop",
    name_ja: "東京メトロ帰路のシティポップ",
    desc_ko: "하루를 마치는 도쿄 지하철역의 소음과 피로를 달래주는 차분하고 세련된 시티 팝/R&B BGM.",
    desc_en: "A smooth city pop / R&B track designed to soothe commuters with warm Rhodes keys and saxophone melodies.",
    desc_ja: "만원 지하철 창밖 노을을 바라보며 헤드폰을 통해 피로를 식히는 감미로운 시티 팝 R&B BGM。"
  }
};
