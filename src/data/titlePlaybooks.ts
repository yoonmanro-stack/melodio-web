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
    genre: "Trot / 트로트",
    emojiOptions: ["🎤", "💃", "🔥", "✨", "🎵", "🥳"],
    vibeWords: ["사나이 눈물", "인생 부르스", "아리랑 고개", "황혼의 사랑", "청춘 메들리", "신바람 인생", "사랑의 가락"],
    subtitles: ["인기 트로트 메들리", "신나는 트롯가요", "감성 성인가요", "추억의 트로트"],
    descriptionTemplate: "신나고 애절한 정통 트로트와 최신 트롯가요 메들리. 흥겨운 리듬과 깊은 감성을 담았습니다."
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
