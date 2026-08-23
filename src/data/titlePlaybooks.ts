export interface TitlePlaybook {
  genre: string;
  emojiOptions: string[];
  vibeWords: string[];
  subtitles: string[];
  descriptionTemplate: string;
}

export const titlePlaybooks: Record<string, TitlePlaybook> = {
  lofi: {
    genre: "Lofi BGM / Chillhop",
    emojiOptions: ["📚", "🌌", "☕️", "☔️", "😌", "🌤️", "💤", "🍃", "🌃"],
    vibeWords: ["Study Session", "Cozy Rain", "Midnight Chill", "Lazy Sunday", "Quiet Focus", "Morning Brew", "Soft Light", "Slow Days"],
    subtitles: ["lofi hip hop", "beats to relax/study to", "calm lofi beats", "focus coding bgm"],
    descriptionTemplate: "A calm lofi hip-hop playlist featuring soft keys and relaxing drums, perfect for study and focus."
  },
  trot: {
    genre: "Trot / 트로트 / 성인가요",
    emojiOptions: ["🎤", "💃", "🔥", "✨", "🎵", "🥳", "🌊", "🍶", "☀️"],
    vibeWords: [
      "인생 2막", "막걸리 한 잔", "굽이진 인생길", "고향역 밤안개", "목포항의 순정",
      "사나이 눈물", "인생 부르스", "황혼의 사랑", "청춘 메들리", "신바람 인생",
      "고속도로 디스코", "관광버스 파티", "대박 터진 날", "오라버니", "쨍하고 해뜰날",
      "어머니의 된장찌개", "찔레꽃 피는 언덕", "간이역 완행열차", "여수 밤바다", "사랑의 밧줄"
    ],
    subtitles: [
      "인기 트로트 메들리", "신나는 고속도로 디스코", "가슴 찡한 정통 트로트", 
      "감성 성인가요", "추억의 7080 트롯가요", "인생 2막 힐링 트롯"
    ],
    descriptionTemplate: "가슴을 울리는 정통 트로트의 애절한 감성과 어깨춤이 절로 나는 신바람 고속도로 디스코 메들리. 세월의 애환과 인생의 희망을 함께 담았습니다."
  },
  synthwave: {
    genre: "Synthwave / Chillwave / Cyberpunk",
    emojiOptions: ["🌌", "👾", "🏎️", "🌆", "⚡️"],
    vibeWords: ["Neon Highway", "Silicon Vengeance", "Space Trip", "Grid Runner", "Retro Dreaming", "Sunset Drive", "Tokyo Drift"],
    subtitles: ["Chillwave - Synthwave Mix", "cyberpunk gaming beats", "retro electro music"],
    descriptionTemplate: "Futuristic synthwave and retro chillwave beats. Perfect for driving, late-night coding, or retro gaming."
  },
  acoustic: {
    genre: "Acoustic / Indie Pop",
    emojiOptions: ["🎸", "☕️", "🍃", "🧣", "🏡"],
    vibeWords: ["Cozy Covers", "Peaceful Day", "Sunset Boulevard", "Warm Mug", "Silent Window", "Cozy Hearth", "Whispering Winds"],
    subtitles: ["cozy acoustic pop", "relaxing background music", "indie pop mix"],
    descriptionTemplate: "Soft acoustic guitars and gentle melodies. Creating a warm, peaceful background for your daily life."
  }
};
