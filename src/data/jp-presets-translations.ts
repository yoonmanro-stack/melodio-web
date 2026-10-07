import { getJapanPresetProfile } from '@/lib/japan-preset-profile'

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
    desc_ko: getJapanPresetProfile("romance-pop")!.descriptionKo,
    desc_en: getJapanPresetProfile("romance-pop")!.descriptionEn,
    desc_ja: getJapanPresetProfile("romance-pop")!.descriptionJa
  },
  "lofi-study": {
    name_ko: "J-로파이 포커스 (공부/집중)",
    name_en: "J-Lofi Focus: Rainy Midnight",
    name_ja: "J-Lofi フォーカス (読書・勉強用)",
    desc_ko: getJapanPresetProfile("lofi-study")!.descriptionKo,
    desc_en: getJapanPresetProfile("lofi-study")!.descriptionEn,
    desc_ja: getJapanPresetProfile("lofi-study")!.descriptionJa
  },
  "cozy-jazz-cafe": {
    name_ko: "시부야 미드나잇 재즈 카페",
    name_en: "Shibuya Midnight Jazz Cafe",
    name_ja: "渋谷ミッドナイト・ジャズカフェ",
    desc_ko: getJapanPresetProfile("cozy-jazz-cafe")!.descriptionKo,
    desc_en: getJapanPresetProfile("cozy-jazz-cafe")!.descriptionEn,
    desc_ja: getJapanPresetProfile("cozy-jazz-cafe")!.descriptionJa
  },
  "acoustic-healing": {
    name_ko: "시부야 어쿠스틱 아침 산책",
    name_en: "Shibuya Acoustic Morning Walk",
    name_ja: "渋谷アコースティック・朝の散歩",
    desc_ko: getJapanPresetProfile("acoustic-healing")!.descriptionKo,
    desc_en: getJapanPresetProfile("acoustic-healing")!.descriptionEn,
    desc_ja: getJapanPresetProfile("acoustic-healing")!.descriptionJa
  },
  "kawaii-future": {
    name_ko: "하라주쿠 카와이 베이스",
    name_en: "Harajuku Kawaii Future Bass",
    name_ja: "原宿カワイイ・フューチャーベース",
    desc_ko: getJapanPresetProfile("kawaii-future")!.descriptionKo,
    desc_en: getJapanPresetProfile("kawaii-future")!.descriptionEn,
    desc_ja: getJapanPresetProfile("kawaii-future")!.descriptionJa
  },
  "okinawa-sanshin": {
    name_ko: "오키나와 에메랄드 파도 치유",
    name_en: "Okinawa Emerald Wave Healing",
    name_ja: "沖縄エメラルド・波の音ヒーリング",
    desc_ko: getJapanPresetProfile("okinawa-sanshin")!.descriptionKo,
    desc_en: getJapanPresetProfile("okinawa-sanshin")!.descriptionEn,
    desc_ja: getJapanPresetProfile("okinawa-sanshin")!.descriptionJa
  },
  "kyoto-ambient": {
    name_ko: "교토 대나무 숲 명상",
    name_en: "Kyoto Arashiyama Bamboo Rest",
    name_ja: "京都嵐山・竹林の瞑想アンビエント",
    desc_ko: getJapanPresetProfile("kyoto-ambient")!.descriptionKo,
    desc_en: getJapanPresetProfile("kyoto-ambient")!.descriptionEn,
    desc_ja: getJapanPresetProfile("kyoto-ambient")!.descriptionJa
  },
  "anime-rock": {
    name_ko: "도쿄 청춘 애니 OST J-Rock",
    name_en: "Tokyo Youth Anime J-Rock",
    name_ja: "東京青春アニメOST風 J-Rock",
    desc_ko: getJapanPresetProfile("anime-rock")!.descriptionKo,
    desc_en: getJapanPresetProfile("anime-rock")!.descriptionEn,
    desc_ja: getJapanPresetProfile("anime-rock")!.descriptionJa
  },
  "tokyo-future-funk": {
    name_ko: "도쿄 퓨처 펑크",
    name_en: "Tokyo Future Funk",
    name_ja: "東京フューチャーファンク",
    desc_ko: getJapanPresetProfile("tokyo-future-funk")!.descriptionKo,
    desc_en: getJapanPresetProfile("tokyo-future-funk")!.descriptionEn,
    desc_ja: getJapanPresetProfile("tokyo-future-funk")!.descriptionJa
  },
  "sapporo-snow": {
    name_ko: "삿포로 겨울 로파이",
    name_en: "Sapporo fireplace Winter Lofi",
    name_ja: "札幌しんしん雪のLofi",
    desc_ko: getJapanPresetProfile("sapporo-snow")!.descriptionKo,
    desc_en: getJapanPresetProfile("sapporo-snow")!.descriptionEn,
    desc_ja: getJapanPresetProfile("sapporo-snow")!.descriptionJa
  },
  "shibuya-neon-rock": {
    name_ko: "시부야 인디 얼터너티브 록",
    name_en: "Shibuya Indie Alternative Rock",
    name_ja: "渋谷インディーズ・オルタナロック",
    desc_ko: getJapanPresetProfile("shibuya-neon-rock")!.descriptionKo,
    desc_en: getJapanPresetProfile("shibuya-neon-rock")!.descriptionEn,
    desc_ja: getJapanPresetProfile("shibuya-neon-rock")!.descriptionJa
  },
  "kamakura-surf": {
    name_ko: "가마쿠라 해변 서프 포크",
    name_en: "Kamakura Beach Surf Folk",
    name_ja: "鎌倉海岸サーフフォーク",
    desc_ko: getJapanPresetProfile("kamakura-surf")!.descriptionKo,
    desc_en: getJapanPresetProfile("kamakura-surf")!.descriptionEn,
    desc_ja: getJapanPresetProfile("kamakura-surf")!.descriptionJa
  },
  "osaka-street-food": {
    name_ko: "오사카 타코야끼 축제 펑크",
    name_en: "Osaka Dotonbori Festive Funk",
    name_ja: "大阪道頓堀お祭りファンク",
    desc_ko: getJapanPresetProfile("osaka-street-food")!.descriptionKo,
    desc_en: getJapanPresetProfile("osaka-street-food")!.descriptionEn,
    desc_ja: getJapanPresetProfile("osaka-street-food")!.descriptionJa
  },
  "fuji-meditation": {
    name_ko: "후지산 새벽선율 명상 BGM",
    name_en: "Mount Fuji Dawn Meditation",
    name_ja: "富士山日の出の瞑想コト",
    desc_ko: getJapanPresetProfile("fuji-meditation")!.descriptionKo,
    desc_en: getJapanPresetProfile("fuji-meditation")!.descriptionEn,
    desc_ja: getJapanPresetProfile("fuji-meditation")!.descriptionJa
  },
  "ghibli-fantasy": {
    name_ko: "동화 숲 오케스트라 왈츠",
    name_en: "Forest Storybook Orchestral Waltz",
    name_ja: "森の物語・オーケストラワルツ",
    desc_ko: getJapanPresetProfile("ghibli-fantasy")!.descriptionKo,
    desc_en: getJapanPresetProfile("ghibli-fantasy")!.descriptionEn,
    desc_ja: getJapanPresetProfile("ghibli-fantasy")!.descriptionJa
  },
  "akiba-chiptune": {
    name_ko: "아키하바라 8비트 레트로 칩튠",
    name_en: "Akihabara 8-Bit Retro Chiptune",
    name_ja: "秋葉原8bitレトロチップチューン",
    desc_ko: getJapanPresetProfile("akiba-chiptune")!.descriptionKo,
    desc_en: getJapanPresetProfile("akiba-chiptune")!.descriptionEn,
    desc_ja: getJapanPresetProfile("akiba-chiptune")!.descriptionJa
  },
  "okinawa-sunset": {
    name_ko: "오키나와 해변 발라드",
    name_en: "Okinawa Beach Sunset Ballad",
    name_ja: "沖縄海岸サンセットバラード",
    desc_ko: getJapanPresetProfile("okinawa-sunset")!.descriptionKo,
    desc_en: getJapanPresetProfile("okinawa-sunset")!.descriptionEn,
    desc_ja: getJapanPresetProfile("okinawa-sunset")!.descriptionJa
  },
  "citypop-midnight": {
    name_ko: "도쿄 심야 고속도로 시티팝",
    name_en: "Midnight Tokyo Expressway City Pop",
    name_ja: "東京深夜ハイウェイ・シティポップ",
    desc_ko: getJapanPresetProfile("citypop-midnight")!.descriptionKo,
    desc_en: getJapanPresetProfile("citypop-midnight")!.descriptionEn,
    desc_ja: getJapanPresetProfile("citypop-midnight")!.descriptionJa
  },
  "cozy-rainy-cafe": {
    name_ko: "비 오는 날 잔잔한 피아노 카페 BGM",
    name_en: "Rainy Day Mellow Piano Cafe",
    name_ja: "雨の日のカフェ・ピアノBGM",
    desc_ko: getJapanPresetProfile("cozy-rainy-cafe")!.descriptionKo,
    desc_en: getJapanPresetProfile("cozy-rainy-cafe")!.descriptionEn,
    desc_ja: getJapanPresetProfile("cozy-rainy-cafe")!.descriptionJa
  },
  "lofi-dreamy-moon": {
    name_ko: "달빛 아래 꿈결 수면 로파이",
    name_en: "Dreamy Moonlight Sleep Lofi",
    name_ja: "月明かりの安眠ドリームLofi",
    desc_ko: getJapanPresetProfile("lofi-dreamy-moon")!.descriptionKo,
    desc_en: getJapanPresetProfile("lofi-dreamy-moon")!.descriptionEn,
    desc_ja: getJapanPresetProfile("lofi-dreamy-moon")!.descriptionJa
  },
  "spring-sakura": {
    name_ko: "벚꽃 흩날리는 아침 산책 포크",
    name_en: "Sakura Spring Breeze Folk",
    name_ja: "桜舞い散る朝のフォークソング",
    desc_ko: getJapanPresetProfile("spring-sakura")!.descriptionKo,
    desc_en: getJapanPresetProfile("spring-sakura")!.descriptionEn,
    desc_ja: getJapanPresetProfile("spring-sakura")!.descriptionJa
  },
  "akihabara-cyber": {
    name_ko: "사이버 시부야 그리드 신스웨이브",
    name_en: "Cyber Shibuya Grid Synthwave",
    name_ja: "電脳渋谷グリッド・シンセウェーブ",
    desc_ko: getJapanPresetProfile("akihabara-cyber")!.descriptionKo,
    desc_en: getJapanPresetProfile("akihabara-cyber")!.descriptionEn,
    desc_ja: getJapanPresetProfile("akihabara-cyber")!.descriptionJa
  },
  "harajuku-pop-rock": {
    name_ko: "하라주쿠 청춘 팝 록",
    name_en: "Harajuku Youth Pop Rock",
    name_ja: "原宿青春ポップロック",
    desc_ko: getJapanPresetProfile("harajuku-pop-rock")!.descriptionKo,
    desc_en: getJapanPresetProfile("harajuku-pop-rock")!.descriptionEn,
    desc_ja: getJapanPresetProfile("harajuku-pop-rock")!.descriptionJa
  },
  "enoshima-surf": {
    name_ko: "에노시마 여름 파도 서프 록",
    name_en: "Enoshima Summer Surf Rock",
    name_ja: "江の島サマー・サーフロック",
    desc_ko: getJapanPresetProfile("enoshima-surf")!.descriptionKo,
    desc_en: getJapanPresetProfile("enoshima-surf")!.descriptionEn,
    desc_ja: getJapanPresetProfile("enoshima-surf")!.descriptionJa
  },
  "asakusa-traditional": {
    name_ko: "아사쿠사 전통 앰비언트",
    name_en: "Asakusa Traditional Ambient",
    name_ja: "浅草・和楽器アンビエント",
    desc_ko: getJapanPresetProfile("asakusa-traditional")!.descriptionKo,
    desc_en: getJapanPresetProfile("asakusa-traditional")!.descriptionEn,
    desc_ja: getJapanPresetProfile("asakusa-traditional")!.descriptionJa
  },
  "ginza-neon-jazz": {
    name_ko: "긴자 럭셔리 네온 재즈",
    name_en: "Ginza Neon Swing City Jazz",
    name_ja: "銀座ネオン・スウィングジャズ",
    desc_ko: getJapanPresetProfile("ginza-neon-jazz")!.descriptionKo,
    desc_en: getJapanPresetProfile("ginza-neon-jazz")!.descriptionEn,
    desc_ja: getJapanPresetProfile("ginza-neon-jazz")!.descriptionJa
  },
  "yokohama-port-acoustic": {
    name_ko: "요코하마 항구 어쿠스틱 포크",
    name_en: "Yokohama Port Acoustic Folk",
    name_ja: "横浜港アコースティックフォーク",
    desc_ko: getJapanPresetProfile("yokohama-port-acoustic")!.descriptionKo,
    desc_en: getJapanPresetProfile("yokohama-port-acoustic")!.descriptionEn,
    desc_ja: getJapanPresetProfile("yokohama-port-acoustic")!.descriptionJa
  },
  "tokyo-subway-commute": {
    name_ko: "도쿄 지하철 퇴근길 시티팝",
    name_en: "Tokyo Subway Commute City Pop",
    name_ja: "東京メトロ帰路のシティポップ",
    desc_ko: getJapanPresetProfile("tokyo-subway-commute")!.descriptionKo,
    desc_en: getJapanPresetProfile("tokyo-subway-commute")!.descriptionEn,
    desc_ja: getJapanPresetProfile("tokyo-subway-commute")!.descriptionJa
  }
};
