"use client";
import { useVoice } from "@/contexts/VoiceContext";
import { studioVoiceFields as resolveStudioVoiceFields } from "@/lib/voice/studio-selection";
import { StudioArtistPicker, useStudioArtist } from "@/components/artists/StudioArtistPicker";
import { resolveArtistMusicStyle } from "@/lib/artists/studio-style";
import { SUNO_VERSIONS } from '@/lib/suno-models';

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Globe,
  Target,
  Coins,
  Music,
  Bot,
  Video,
  Radio,
  Check,
  X,
  Sparkles,
  Clock,
  Zap,
  Play,
  Pause,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Heart,
  Download,
  RefreshCw,
  Music4,
  MoreVertical,
  Trash2,
  Edit3,
  Share2,
  AlertCircle,
  Maximize2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useHistory } from "@/hooks/useHistory";
import { useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import CreatePresetModal from "./prompt-builder/CreatePresetModal";
import PublicTrackGrid from "./prompt-builder/PublicTrackGrid";
import { Search } from "lucide-react";
import PromptOutput from "./prompt-builder/PromptOutput";
import LyricsBuilder from "./prompt-builder/LyricsBuilder";
import { Wand2, Tag, PenTool, ListMusic, Music2, Copy } from "lucide-react";
import type { MusicEngine, PromptPayload, LyricsSection, Preset } from "@/types";
import { composeStylePrompt, resolveRotationPrompt } from "@/lib/prompt-compositor";
import { fitJapanStyleBudget } from "@/lib/japan-style-budget";
import { getJapanPresetProfile, resolveJapanPresetStyle, uniqueJapanPresets } from "@/lib/japan-preset-profile";
import { compileLyricsSections } from "@/lib/lyrics/compile-sections";
import { useLanguage } from "@/contexts/LanguageContext";
import { jpPresetTranslations } from "@/data/jp-presets-translations";
import { getAudioPlaybackError, getExpiredAudioPlaybackError, getStoredTrackDuration } from "@/lib/audio-playback";
import { registerActiveAudio } from '@/lib/globalAudio';
import { PresetSampleButton, PresetSamplePlayer, usePresetSamples } from '@/components/presets/PresetSamples';

// ─── 음원 앨범 커버 페이드인 이미지 컴포넌트 ───
const FadeInImage = ({ src, alt, className = "" }: { src: string; alt: string; className?: string }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
      {!isLoaded && (
        <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      )}
      <img 
        src={src} 
        alt={alt} 
        onLoad={() => setIsLoaded(true)}
        className={`${className} transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`} 
      />
    </div>
  );
};

// ─── 과거 이미지 미등록 음원용 컨셉 매핑 썸네일 헬퍼 ───
const getFallbackCoverArt = (item: any): string => {
  if (item?.cover_art_url && !item.cover_art_url.includes('unsplash.com')) {
    return item.cover_art_url;
  }
  let styleText = "";
  if (item.license_hash) {
    try {
      const parsed = JSON.parse(item.license_hash);
      styleText = (parsed.stylePrompt || "").toLowerCase();
    } catch { /* ignore */ }
  }
  
  if (styleText.includes("city") || styleText.includes("japan") || styleText.includes("시티팝")) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png";
  }
  if (styleText.includes("jazz") || styleText.includes("matcha")) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png";
  }
  if (styleText.includes("lo-fi") || styleText.includes("lofi") || styleText.includes("tea")) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png";
  }
  if (styleText.includes("chanson") || styleText.includes("vintage")) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png";
  }
  
  return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png";
};

// ─── 음원 실시간 길이(Duration) 획득용 컴포넌트 ───
const TrackDuration = ({ audioUrl, initialDuration, track }: { audioUrl?: string; initialDuration?: number; track?: { license_hash?: string | null; duration_mode?: string | null } }) => {
  const storedDuration = Number.isFinite(initialDuration) && Number(initialDuration) > 0
    ? Number(initialDuration) : getStoredTrackDuration(track || {});
  const [duration, setDuration] = useState<number | null>(storedDuration || null);

  useEffect(() => {
    if (storedDuration > 0) {
      setDuration(storedDuration);
      return;
    }
    setDuration(null);
    if (!audioUrl) return;

    const audio = new Audio();
    audio.src = audioUrl;
    audio.preload = 'metadata'; // 오직 헤더 정보만 로드

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeAttribute('src');
    };
  }, [audioUrl, storedDuration]);

  if (duration === null || duration <= 0) {
    return <span>--:--</span>;
  }

  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60);
  return <span>{mins}:{secs < 10 ? '0' : ''}{secs}</span>;
};

type Variant = "A" | "B" | "C";

const JP_PRESET_IMAGES = [
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png"
];

const JAPAN_PRESETS_PER_PAGE = 18;

export const jpPresets = [
  {
    id: "romance-pop",
    name: "80s City Pop (80s 시티팝)",
    desc: getJapanPresetProfile("romance-pop")!.descriptionKo,
    tags: getJapanPresetProfile("romance-pop")!.recipe,
    emoji: "💗",
    gradient: "from-[#ff9a9e] to-[#fecfef]",
    category: "retro",
    cardImage: JP_PRESET_IMAGES[0],
    defaultTitle: "Tokyo Neon Romance",
    defaultTopic: "비 내리는 도쿄의 밤거리, 흘러간 사랑",
    lyricsTemplate: ''
  },
  {
    id: "lofi-study",
    name: "J-Lofi Focus (독서/공부용 J-로파이)",
    desc: getJapanPresetProfile("lofi-study")!.descriptionKo,
    tags: getJapanPresetProfile("lofi-study")!.recipe,
    emoji: "📚",
    gradient: "from-[#667eea] to-[#764ba2]",
    category: "focus",
    cardImage: JP_PRESET_IMAGES[1],
    defaultTitle: "Midnight Rain Study",
    defaultTopic: "조용히 창문을 두드리는 빗소리, 새벽의 다이어리",
    lyricsTemplate: ''
  },
  {
    id: "cozy-jazz-cafe",
    name: "Tokyo Midnight Jazz (도쿄 밤거리 재즈 카페)",
    desc: getJapanPresetProfile("cozy-jazz-cafe")!.descriptionKo,
    tags: getJapanPresetProfile("cozy-jazz-cafe")!.recipe,
    emoji: "🍷",
    gradient: "from-[#a18cd1] to-[#fbc2eb]",
    category: "healing",
    cardImage: JP_PRESET_IMAGES[2],
    defaultTitle: "Shibuya Jazz Espresso",
    defaultTopic: "은은한 에스프레소 향기, 어두운 조명, 밤하늘의 색소폰",
    lyricsTemplate: ''
  },
  {
    id: "acoustic-healing",
    name: "Shibuya Acoustic Journey (시부야 어쿠스틱 여행)",
    desc: getJapanPresetProfile("acoustic-healing")!.descriptionKo,
    tags: getJapanPresetProfile("acoustic-healing")!.recipe,
    emoji: "🌿",
    gradient: "from-[#56ab2f] to-[#a8e063]",
    category: "healing",
    cardImage: JP_PRESET_IMAGES[3],
    defaultTitle: "Shibuya Morning Breeze",
    defaultTopic: "상쾌한 아침 이슬, 언덕 위에 부는 바람, 새들의 지저귐",
    lyricsTemplate: ''
  },
  {
    id: "kawaii-future",
    name: "Harajuku Kawaii (하라주쿠 카와이 베이스)",
    desc: getJapanPresetProfile("kawaii-future")!.descriptionKo,
    tags: getJapanPresetProfile("kawaii-future")!.recipe,
    emoji: "🦄",
    gradient: "from-[#fbc2eb] to-[#a6c1ee]",
    category: "focus",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    defaultTitle: "Harajuku Pink Heart",
    defaultTopic: "핑크빛 하라주쿠 네온, 젤리 팝 스위트 하트",
    lyricsTemplate: ''
  },
  {
    id: "okinawa-sanshin",
    name: "Okinawa Ocean Breeze (오키나와 삼신 치유)",
    desc: getJapanPresetProfile("okinawa-sanshin")!.descriptionKo,
    tags: getJapanPresetProfile("okinawa-sanshin")!.recipe,
    emoji: "🌺",
    gradient: "from-[#84fab0] to-[#8fd3f4]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    defaultTitle: "Okinawa Emerald Wave",
    defaultTopic: "오키나와의 에메랄드 해변, 산들바람에 들리는 삼신",
    lyricsTemplate: ''
  },
  {
    id: "kyoto-ambient",
    name: "Kyoto Bamboo Rest (교토 대나무 숲 명상)",
    desc: getJapanPresetProfile("kyoto-ambient")!.descriptionKo,
    tags: getJapanPresetProfile("kyoto-ambient")!.recipe,
    emoji: "🎋",
    gradient: "from-[#a8ff78] to-[#78ffd6]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    defaultTitle: "Kyoto Bamboo Silence",
    defaultTopic: "고요한 아라시야마, 마음을 정화하는 빗방울",
    lyricsTemplate: ''
  },
  {
    id: "anime-rock",
    name: "Tokyo J-Rock Energy (청춘 애니메이션 OST 락)",
    desc: getJapanPresetProfile("anime-rock")!.descriptionKo,
    tags: getJapanPresetProfile("anime-rock")!.recipe,
    emoji: "⚡",
    gradient: "from-[#ff9966] to-[#ff5e62]",
    category: "focus",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    defaultTitle: "Tokyo Youth Runway",
    defaultTopic: "방과 후 노을 지는 운동장, 한계 없는 질주",
    lyricsTemplate: ''
  },
  {
    id: "tokyo-future-funk",
    name: "Tokyo Future Funk (도쿄 퓨처 펑크)",
    desc: getJapanPresetProfile("tokyo-future-funk")!.descriptionKo,
    tags: getJapanPresetProfile("tokyo-future-funk")!.recipe,
    emoji: "🕺",
    gradient: "from-[#f093fb] to-[#f5576c]",
    category: "retro",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    defaultTitle: "Neon Night Disco",
    defaultTopic: "화려한 네온사인 댄스 플로어, 레트로 비트의 유혹",
    lyricsTemplate: ''
  },
  {
    id: "sapporo-snow",
    name: "Sapporo Snow Lofi (삿포로 겨울 로파이)",
    desc: getJapanPresetProfile("sapporo-snow")!.descriptionKo,
    tags: getJapanPresetProfile("sapporo-snow")!.recipe,
    emoji: "❄️",
    gradient: "from-[#e6e9f0] to-[#eef1f5]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    defaultTitle: "Sapporo Snow Cabin",
    defaultTopic: "창밖에 내리는 흰 눈, 따뜻한 핫초코 한 잔",
    lyricsTemplate: ''
  },
  {
    id: "shibuya-neon-rock",
    name: "Shibuya Indie Alternative (시부야 인디 록)",
    desc: getJapanPresetProfile("shibuya-neon-rock")!.descriptionKo,
    tags: getJapanPresetProfile("shibuya-neon-rock")!.recipe,
    emoji: "🎸",
    gradient: "from-[#434343] to-[#000000]",
    category: "focus",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    defaultTitle: "Shibuya Underground Live",
    defaultTopic: "땀방울 맺힌 무대, 기타 피드백 노이즈",
    lyricsTemplate: ''
  },
  {
    id: "kamakura-surf",
    name: "Kamakura Surf Folk (가마쿠라 해변 서프 포크)",
    desc: getJapanPresetProfile("kamakura-surf")!.descriptionKo,
    tags: getJapanPresetProfile("kamakura-surf")!.recipe,
    emoji: "🌊",
    gradient: "from-[#4facfe] to-[#00f2fe]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    defaultTitle: "Kamakura Train Sunset",
    defaultTopic: "노을빛 건널목, 저멀리 밀려오는 에메랄드 파도",
    lyricsTemplate: ''
  },
  {
    id: "osaka-street-food",
    name: "Osaka Festive Beats (오사카 타코야끼 펑크)",
    desc: getJapanPresetProfile("osaka-street-food")!.descriptionKo,
    tags: getJapanPresetProfile("osaka-street-food")!.recipe,
    emoji: "🐙",
    gradient: "from-[#ff0844] to-[#ffb199]",
    category: "retro",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    defaultTitle: "Dotonbori Street Carnival",
    defaultTopic: "갓 구운 타코야끼 향기, 유쾌한 웃음 가득한 오사카의 밤",
    lyricsTemplate: ''
  },
  {
    id: "fuji-meditation",
    name: "Fuji Dawn Meditation (후지산 새벽 명상)",
    desc: getJapanPresetProfile("fuji-meditation")!.descriptionKo,
    tags: getJapanPresetProfile("fuji-meditation")!.recipe,
    emoji: "🗻",
    gradient: "from-[#30cfd0] to-[#330867]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    defaultTitle: "Dawn Over Mount Fuji",
    defaultTopic: "호수 위에 어리는 아침 안개, 산새들의 깊은 기도",
    lyricsTemplate: ''
  },
  {
    id: "ghibli-fantasy",
    name: "Ghibli Forest Waltz (지브리 감성 오케스트라)",
    desc: getJapanPresetProfile("ghibli-fantasy")!.descriptionKo,
    tags: getJapanPresetProfile("ghibli-fantasy")!.recipe,
    emoji: "✨",
    gradient: "from-[#e2d1c3] to-[#fdfcfb]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    defaultTitle: "Fantasy Forest Path",
    defaultTopic: "햇살 비치는 나뭇잎 터널, 마음 깊이 남겨진 소망",
    lyricsTemplate: ''
  },
  {
    id: "akiba-chiptune",
    name: "Akiba Retro Arcade (아키하바라 8비트)",
    desc: getJapanPresetProfile("akiba-chiptune")!.descriptionKo,
    tags: getJapanPresetProfile("akiba-chiptune")!.recipe,
    emoji: "👾",
    gradient: "from-[#f5d130] to-[#f472b6]",
    category: "retro",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    defaultTitle: "8Bit Akiba Quest",
    defaultTopic: "고전 아케이드 모험, 레트로 픽셀 아트",
    lyricsTemplate: ''
  },
  {
    id: "okinawa-sunset",
    name: "Okinawa Sunset Ballad (오키나와 해변 발라드)",
    desc: getJapanPresetProfile("okinawa-sunset")!.descriptionKo,
    tags: getJapanPresetProfile("okinawa-sunset")!.recipe,
    emoji: "🌅",
    gradient: "from-[#ff7e5f] to-[#feb47b]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    defaultTitle: "Sunset Okinawa Beach",
    defaultTopic: "해변의 마지막 햇살, 파도에 쓰는 편지",
    lyricsTemplate: ''
  },
  {
    id: "citypop-midnight",
    name: "Midnight Tokyo Drive (도쿄 심야 드라이브)",
    desc: getJapanPresetProfile("citypop-midnight")!.descriptionKo,
    tags: getJapanPresetProfile("citypop-midnight")!.recipe,
    emoji: "🚗",
    gradient: "from-[#2b5876] to-[#4e4376]",
    category: "retro",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    defaultTitle: "Shibuya Expressway Neon",
    defaultTopic: "도쿄 야간 고속도로, 네온사인의 잔상, 음악의 리듬",
    lyricsTemplate: ''
  },
  {
    id: "cozy-rainy-cafe",
    name: "Rainy Day Piano Cafe (비 오는 날 피아노 카페)",
    desc: getJapanPresetProfile("cozy-rainy-cafe")!.descriptionKo,
    tags: getJapanPresetProfile("cozy-rainy-cafe")!.recipe,
    emoji: "🌧️",
    gradient: "from-[#37ecba] to-[#72afd3]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    defaultTitle: "Raindrops On The window",
    defaultTopic: "창가에 스미는 빗소리, 차분히 정리되는 생각",
    lyricsTemplate: ''
  },
  {
    id: "lofi-dreamy-moon",
    name: "Lofi Dreamy Moonlight (달빛 아래 꿈결 로파이)",
    desc: getJapanPresetProfile("lofi-dreamy-moon")!.descriptionKo,
    tags: getJapanPresetProfile("lofi-dreamy-moon")!.recipe,
    emoji: "🌙",
    gradient: "from-[#09203f] to-[#537895]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    defaultTitle: "Midnight Pillow Lofi",
    defaultTopic: "은은한 달빛 아래 방 안 가득 찬 평온함, 잠드는 새벽",
    lyricsTemplate: ''
  },
  {
    id: "spring-sakura",
    name: "Sakura Spring Breeze (벚꽃 흩날리는 아침)",
    desc: getJapanPresetProfile("spring-sakura")!.descriptionKo,
    tags: getJapanPresetProfile("spring-sakura")!.recipe,
    emoji: "🌸",
    gradient: "from-[#fbc2eb] to-[#a6c1ee]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    defaultTitle: "Kyoto Sakura Morning",
    defaultTopic: "벚꽃 터널을 지나는 노면전차, 설레는 아침 햇살",
    lyricsTemplate: ''
  },
  {
    id: "akihabara-cyber",
    name: "Cyber Shibuya Grid (사이버 시부야 그리드)",
    desc: getJapanPresetProfile("akihabara-cyber")!.descriptionKo,
    tags: getJapanPresetProfile("akihabara-cyber")!.recipe,
    emoji: "🤖",
    gradient: "from-[#29323c] to-[#485563]",
    category: "focus",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    defaultTitle: "Cyber Shibuya Grid",
    defaultTopic: "네온사인 골목, 가상현실 댄스",
    lyricsTemplate: ''
  },
  {
    id: "harajuku-pop-rock",
    name: "Harajuku Pop Rock (하라주쿠 청춘 팝 락)",
    desc: getJapanPresetProfile("harajuku-pop-rock")!.descriptionKo,
    tags: getJapanPresetProfile("harajuku-pop-rock")!.recipe,
    emoji: "🎸",
    gradient: "from-[#f857a6] to-[#ff5858]",
    category: "focus",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    defaultTitle: "Harajuku Youth Runway",
    defaultTopic: "방과 후 크레페 가게, 밝은 웃음소리",
    lyricsTemplate: ''
  },
  {
    id: "enoshima-surf",
    name: "Enoshima Summer Surf (에노시마 여름 서핑)",
    desc: getJapanPresetProfile("enoshima-surf")!.descriptionKo,
    tags: getJapanPresetProfile("enoshima-surf")!.recipe,
    emoji: "🏄",
    gradient: "from-[#4facfe] to-[#00f2fe]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    defaultTitle: "Enoshima Wave Rider",
    defaultTopic: "에노시마 노면전차, 여름 해변 드라이브",
    lyricsTemplate: ''
  },
  {
    id: "asakusa-traditional",
    name: "Asakusa Traditional (아사쿠사 전통 앰비언트)",
    desc: getJapanPresetProfile("asakusa-traditional")!.descriptionKo,
    tags: getJapanPresetProfile("asakusa-traditional")!.recipe,
    emoji: "⛩️",
    gradient: "from-[#d35400] to-[#e67e22]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    defaultTitle: "Asakusa Temple Peace",
    defaultTopic: "고요한 아사쿠사의 저녁 노을, 바람에 날리는 벚꽃",
    lyricsTemplate: ''
  },
  {
    id: "ginza-neon-jazz",
    name: "Ginza Neon Jazz (긴자 네온 재즈)",
    desc: getJapanPresetProfile("ginza-neon-jazz")!.descriptionKo,
    tags: getJapanPresetProfile("ginza-neon-jazz")!.recipe,
    emoji: "🎺",
    gradient: "from-[#2c3e50] to-[#3498db]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    defaultTitle: "Ginza Midnight Swing",
    defaultTopic: "화려한 불빛 아래 바쁜 발걸음, 나만의 재즈 선율",
    lyricsTemplate: ''
  },
  {
    id: "yokohama-port-acoustic",
    name: "Yokohama Port Acoustic (요코하마 항구 어쿠스틱)",
    desc: getJapanPresetProfile("yokohama-port-acoustic")!.descriptionKo,
    tags: getJapanPresetProfile("yokohama-port-acoustic")!.recipe,
    emoji: "⚓",
    gradient: "from-[#1abc9c] to-[#2ecc71]",
    category: "healing",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    defaultTitle: "Yokohama Bay Breeze",
    defaultTopic: "멀리 보이는 대관람차, 잔잔한 파도 소리",
    lyricsTemplate: ''
  },
  {
    id: "tokyo-subway-commute",
    name: "Tokyo Subway Commute (도쿄 지하철 퇴근길)",
    desc: getJapanPresetProfile("tokyo-subway-commute")!.descriptionKo,
    tags: getJapanPresetProfile("tokyo-subway-commute")!.recipe,
    emoji: "🚇",
    gradient: "from-[#2b5876] to-[#4e4376]",
    category: "retro",
    cardImage: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    defaultTitle: "Tokyo Subway Ride",
    defaultTopic: "퇴근길 붐비는 지하철 창문 너머 노을빛 야경",
    lyricsTemplate: ''
  }
];

const isJapanTrack = (item: any) => {
  if (!item.license_hash) return false;
  try {
    const meta = JSON.parse(item.license_hash);
    return meta.sourceMenu === "japan" || meta.presetId === "japan_landing";
  } catch {
    return false;
  }
};

const isPublicJpTrack = (item: any) => {
  if (item.status !== "completed") return false;
  if (!isJapanTrack(item)) return false;
  if (item.is_public === false) return false;
  if (!item.license_hash) return true;
  try {
    const meta = JSON.parse(item.license_hash);
    return meta.isPublic !== false;
  } catch {
    return true;
  }
};

/** 가사에는 구조 태그와 실제 노랫말만 전달한다. */
function buildLyricsPrompt(sections: LyricsSection[]): string {
  return compileLyricsSections(sections).lyricsPrompt
}

export default function JapanLandingClient() {
  const { studioGender, activeVoice } = useVoice();
  const [lyricLanguage, setLyricLanguage] = useState('ja');

  const { user, loading } = useAuth();
  const { saveHistory } = useHistory();
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const [variant, setVariant] = useState<Variant>("A");

  // J-BGM 특화 생성기 상태
  const [selectedPresetId, setSelectedPresetId] = useState<string>("romance-pop");
  const [title, setTitle] = useState("Tokyo Neon Romance");
  const [topic, setTopic] = useState("비 내리는 도쿄의 밤거리, 흘러간 사랑");
  const [manualStyleTags, setStyleTags] = useState(jpPresets[0].tags);
  const [lyrics, setLyrics] = useState("");
  const [isInstrumental, setIsInstrumental] = useState(false);
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [genModalState, setGenModalState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [genErrorMsg, setGenErrorMsg] = useState("");
  const [generationJob, setGenerationJob] = useState<{
    ids: string[];
    status: 'submitting' | 'generating' | 'completed' | 'error';
    title: string;
    isPublic: boolean;
    message?: string;
  } | null>(null);
  const [publicTracksRefreshSignal, setPublicTracksRefreshSignal] = useState(0);
  const [myTracks, setMyTracks] = useState<any[]>([]);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<{ id: string; title: string; message: string } | null>(null);
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [copiedTextType, setCopiedTextType] = useState<string | null>(null);

  // Audio Forge / PromptBuilder 연동용 추가 상태들
  const [isPlaylistMode, setIsPlaylistMode] = useState(false);
  const [trackCount, setTrackCount] = useState(2);
  const [engine, setEngine] = useState<MusicEngine>("auto");
  const [sunoVersion, setSunoVersion] = useState<string>("v6");
  const [youtubeTags, setYoutubeTags] = useState("");
  const [snsHashtags, setSnsHashtags] = useState("");
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistYoutubeTags, setPlaylistYoutubeTags] = useState("");
  const [playlistSnsHashtags, setPlaylistSnsHashtags] = useState("");
  const [tracks, setTracks] = useState<any[]>([]);
  const [activeTrackIdx, setActiveTrackIdx] = useState(0);
  const [lyricsSections, setLyricsSections] = useState<LyricsSection[]>([]);
  const [excludePrompt, setExcludePrompt] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const artistState = useStudioArtist({ userId: user?.id, initialArtistId: searchParams.get('artistId'), lyricsLanguage: lyricLanguage,
    hasLyrics: Boolean(lyrics.trim()) || lyricsSections.some(section => Boolean(section.content?.trim())) || tracks.some(track => Array.isArray(track.sections) && track.sections.some((section: LyricsSection) => Boolean(section.content?.trim()))),
    onLyricsLanguageChange: setLyricLanguage, allowedLanguages: ['en', 'ja'] });
  const styleTags = resolveJapanPresetStyle(resolveArtistMusicStyle(manualStyleTags, artistState.defaultMusicStyle), selectedPresetId, isInstrumental);
  const artistSettings = { isInstrumental, sunoVersion, sourceMenu: 'japan', stylePrompt: styleTags };
  const studioVoiceFields = artistState.artistVoice
    ? { vocalGender: artistState.artistVoice.gender, activeVoice: null, voicePrompt: undefined, vdCode: undefined, lyricsLanguage: lyricLanguage }
    : resolveStudioVoiceFields(studioGender, activeVoice, lyricLanguage);
  const [ambienceVolume, setAmbienceVolume] = useState<number>(20);
  const [dynamicElements, setDynamicElements] = useState<any>(null);
  const [isAsmrEnabled, setIsAsmrEnabled] = useState(false);
  const [ambientFoley, setAmbientFoley] = useState("");
  const [isSunoDropdownOpen, setIsSunoDropdownOpen] = useState(false);
  const [isTrackPlaying, setIsTrackPlaying] = useState(false);
  const [jpPage, setJpPage] = useState(1);
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [presetTab, setPresetTab] = useState<'all' | 'healing' | 'focus' | 'retro' | 'custom'>('all');
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [dbPresets, setDbPresets] = useState<any[]>([]);
  const [isCreatePresetOpen, setIsCreatePresetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [trackPage, setTrackPage] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAttemptRef = useRef<{ id: string; title: string; url: string } | null>(null);

  // 대시보드 연동용 추가 상태
  const [activeGenId, setActiveGenId] = useState<string>('');
  const [generatingCovers, setGeneratingCovers] = useState<Record<string, boolean>>({});
  const [likedTracks, setLikedTracks] = useState<Record<string, boolean>>({});
  const [isPro, setIsPro] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<{ id: string; title: string } | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [likedPresets, setLikedPresets] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('melodio_liked_presets');
    if (saved) {
      try {
        setLikedPresets(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const toggleLikePreset = (id: string) => {
    setLikedPresets(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('melodio_liked_presets', JSON.stringify(next));
      return next;
    });
  };
  // Load custom presets from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('melodio_japan_custom_presets');
    if (saved) {
      try {
        setCustomPresets(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load Japan custom presets:", e);
      }
    }
  }, []);

  const allJpPresets = useMemo(() => {
    const mappedDefaults = jpPresets.map(p => {
      let dyn = null;
      if (p.id === 'lofi-study') {
        dyn = {
          audio_system: {
            ambience_layer: {
              ambience_label: "창밖의 빗소리 (Rain)",
              base_prompt: "gentle rain tapping on window glass, soft tape hiss",
              default_mix_ratio: 0.2
            }
          }
        };
      } else if (p.id === 'cozy-jazz-cafe') {
        dyn = {
          audio_system: {
            ambience_layer: {
              ambience_label: "카페 소음 (Cafe)",
              base_prompt: "gentle indoor cafe chatter, cup clinking sounds, cozy coffeehouse ambiance",
              default_mix_ratio: 0.2
            }
          }
        };
      } else if (p.id === 'acoustic-healing') {
        dyn = {
          audio_system: {
            ambience_layer: {
              ambience_label: "새들의 지저귐 (Birds)",
              base_prompt: "peaceful morning forest birds chirping, gentle rustling leaves",
              default_mix_ratio: 0.2
            }
          }
        };
      } else if (p.id === 'okinawa-sanshin') {
        dyn = {
          audio_system: {
            ambience_layer: {
              ambience_label: "해변의 파도 (Waves)",
              base_prompt: "gentle ocean waves washing on sand shore, distant seagulls",
              default_mix_ratio: 0.2
            }
          }
        };
      } else if (p.id === 'kyoto-ambient') {
        dyn = {
          audio_system: {
            ambience_layer: {
              ambience_label: "대나무 숲 바람 (Wind)",
              base_prompt: "calm wind rustling bamboo leaves, soft gentle forest breeze",
              default_mix_ratio: 0.2
            }
          }
        };
      }

      // 다국어 명칭 및 설명 매핑
      const trans = jpPresetTranslations[p.id] || null;
      const resolvedName = trans
        ? trans[`name_${language}`] || trans.name_en || trans.name_ko || p.name
        : p.name;
      const resolvedDesc = trans
        ? trans[`desc_${language}`] || trans.desc_en || trans.desc_ko || p.desc
        : p.desc;

      return {
        id: p.id,
        emoji: p.emoji,
        name: resolvedName,
        desc: resolvedDesc,
        gradient: p.gradient || "#3e3668",
        customPrompt: p.tags,
        instrumentalOnly: false,
        lyricsTemplate: p.lyricsTemplate,
        selections: {},
        metadata: {
          cardImage: `/japan-presets/${p.id}.webp`,
          category: p.category,
          defaultTitle: p.defaultTitle,
          defaultTopic: p.defaultTopic,
          dynamic_elements: dyn
        }
      };
    });

    const mappedDb = dbPresets.map(p => {
      const trans = p.metadata || {};
      const profile = getJapanPresetProfile(p.id);
      const profileDesc = profile ? ({ ko: profile.descriptionKo, en: profile.descriptionEn, ja: profile.descriptionJa } as Record<string, string>)[language] : undefined;
      const resolvedName = trans[`name_${language}`] || (p as any)[`name_${language}`] || trans.name_en || p.name || p.title || "";
      const resolvedDesc = profileDesc || trans[`desc_${language}`] || (p as any)[`desc_${language}`] || trans.desc_en || p.desc || "";

      return {
        id: p.id,
        emoji: p.emoji,
        name: resolvedName,
        desc: resolvedDesc,
        gradient: p.gradient || "from-[#fcb045] to-[#fd1d1d]",
        customPrompt: profile?.recipe || p.customPrompt,
        lyricsTemplate: p.lyricsTemplate,
        instrumentalOnly: p.instrumentalOnly ?? trans.instrumentalOnly ?? trans.isInstrumental,
        selections: {},
        metadata: {
          cardImage: p.cardImage,
          category: p.category,
          defaultTitle: p.defaultTitle,
          defaultTopic: p.defaultTopic,
          dynamic_elements: trans.dynamic_elements || null
        }
      };
    });
    
    const mappedCustoms = customPresets.map(p => {
      const meta = p.metadata || {};
      const img = meta.cardImage || meta.thumbnail_url || (p as any).cardImage || "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png";
      const resolvedName = meta[`name_${language}`] || meta.name_en || meta.name_ko || p.name;
      const resolvedDesc = meta[`desc_${language}`] || meta.desc_en || meta.desc_ko || p.desc;

      return {
        ...p,
        instrumentalOnly: (p as Preset & { instrumentalOnly?: boolean }).instrumentalOnly === true || meta.instrumentalOnly === true || meta.isInstrumental === true,
        name: resolvedName,
        desc: resolvedDesc,
        gradient: p.gradient || "#584072",
        metadata: {
          ...meta,
          cardImage: img,
          category: meta.category || "CUSTOM BGM",
          defaultTitle: meta.defaultTitle || p.name,
          defaultTopic: meta.defaultTopic || p.desc,
        }
      };
    });

    return uniqueJapanPresets([...mappedCustoms, ...mappedDb, ...mappedDefaults]);
  }, [customPresets, dbPresets, language]);

  const filteredJpPresets = useMemo(() => {
    return allJpPresets.filter(p => {
      // 1. 탭 필터링
      if (presetTab === 'custom') {
        if (!p.id.startsWith('custom-')) return false;
      } else if (presetTab !== 'all') {
        if (p.metadata?.category !== presetTab) return false;
        if (p.id.startsWith('custom-')) return false; // 기본 제공 탭이 선택되었을 땐 커스텀을 숨김
      }
      
      const query = presetSearchQuery.trim().toLowerCase();
      if (!query) return true;
      
      return (
        (p.name || "").toLowerCase().includes(query) ||
        (p.desc || "").toLowerCase().includes(query) ||
        (p.customPrompt || "").toLowerCase().includes(query) ||
        (p.metadata?.category || "").toLowerCase().includes(query)
      );
    });
  }, [allJpPresets, presetTab, presetSearchQuery]);
  const visibleJpPresets = filteredJpPresets.slice((jpPage - 1) * JAPAN_PRESETS_PER_PAGE, jpPage * JAPAN_PRESETS_PER_PAGE);
  const samplePresets = visibleJpPresets.map(p => ({ ...p, instrumentalOnly: p.instrumentalOnly === true || getJapanPresetProfile(p.id)?.defaultMode === 'instrumental' }));
  const samplePlayer = usePresetSamples('japan', samplePresets);

  const handleSaveCustomPreset = (data: { id?: string; name: string; desc: string; emoji: string; gradient: string; customPrompt: string; metadata?: any }) => {
    if (data.id) {
      const updated = customPresets.map(p => p.id === data.id ? {
        ...p,
        name: data.name,
        desc: data.desc,
        emoji: data.emoji,
        gradient: data.gradient,
        customPrompt: data.customPrompt,
        metadata: data.metadata || p.metadata,
      } : p);
      setCustomPresets(updated);
      localStorage.setItem('melodio_japan_custom_presets', JSON.stringify(updated));
      setEditingPreset(null);
    } else {
      const newPreset = {
        id: `custom-${Date.now()}`,
        emoji: data.emoji,
        name: data.name,
        desc: data.desc,
        gradient: data.gradient,
        customPrompt: data.customPrompt,
        selections: {},
        lyricsTemplate: isInstrumental ? '' : buildLyricsPrompt(lyricsSections),
        metadata: data.metadata || {
          category: "CUSTOM BGM",
          defaultTitle: data.name,
          defaultTopic: data.desc,
        },
      };
      const updated = [newPreset, ...customPresets];
      setCustomPresets(updated);
      localStorage.setItem('melodio_japan_custom_presets', JSON.stringify(updated));
      setIsCreatePresetOpen(false);
    }
  };

  const handleDeleteCustomPreset = (id: string) => {
    if (!confirm('정말 이 일본 특화 커스텀 프리셋을 삭제하시겠습니까?')) return;
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    localStorage.setItem('melodio_japan_custom_presets', JSON.stringify(updated));
    if (selectedPresetId === id) {
      handleSelectPreset(allJpPresets.find(p => p.id === jpPresets[0].id) || allJpPresets.find(p => p.id !== id));
    }
  };

  const activePreset = useMemo(() => {
    return allJpPresets.find((p) => p.id === selectedPresetId) || allJpPresets[0];
  }, [selectedPresetId, allJpPresets]);

  // 프롬프트 페이로드 계산 (실시간)
  const payload: PromptPayload | null = useMemo(() => {
    if (!styleTags) return null;

    const resolvedEngine = engine === 'auto' ? 'suno_v5' : engine;

    if (isPlaylistMode) {
      const activeTrack = tracks[activeTrackIdx];
      if (!activeTrack) return null;

      return {
        title: activeTrack.title,
        stylePrompt: styleTags,
        lyricsPrompt: isInstrumental ? '' : buildLyricsPrompt(activeTrack.sections),
        engine: resolvedEngine,
        isInstrumental,
        sunoVersion,
        tags: {
          youtubeTags: activeTrack.youtubeTags,
          snsHashtags: activeTrack.snsHashtags,
        },
        metadata: {
          primaryGenre: (activePreset as any)?.metadata?.category ?? (activePreset as any)?.category ?? '',
          subGenre: '',
          bpm: '',
          mood: '',
        },
      };
    }

    return {
      title,
      stylePrompt: styleTags,
      lyricsPrompt: isInstrumental ? '' : buildLyricsPrompt(lyricsSections),
      excludePrompt: excludePrompt.trim() || undefined,
      engine: resolvedEngine,
      isInstrumental,
      sunoVersion,
      tags: {
        youtubeTags,
        snsHashtags,
      },
      metadata: {
        primaryGenre: (activePreset as any)?.metadata?.category ?? (activePreset as any)?.category ?? '',
        subGenre: '',
        bpm: '',
        mood: '',
        ambienceVolume: ambienceVolume / 100,
        dynamicElements: dynamicElements,
      },
    };
  }, [styleTags, activePreset, lyricsSections, isInstrumental, engine, sunoVersion, title, youtubeTags, snsHashtags, isPlaylistMode, tracks, activeTrackIdx, excludePrompt, ambienceVolume, dynamicElements]);

  // HTML5 Audio 기반 원곡 재생
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = new Audio();
    el.preload = 'auto';
    const handleStopped = () => setIsTrackPlaying(false);
    const handlePlaying = () => {
      if (!el.paused && playbackAttemptRef.current && (!el.currentSrc || el.currentSrc === el.src)) {
        registerActiveAudio(el, handleStopped);
        setIsTrackPlaying(true);
      }
    };
    const handleError = () => {
      const attempt = playbackAttemptRef.current;
      if (!attempt || audioRef.current !== el || (el.currentSrc && el.currentSrc !== el.src)) return;
      setIsTrackPlaying(false);
      const message = getAudioPlaybackError(attempt.url, el.error?.code === 1 ? { name: 'AbortError' } : undefined);
      if (message) setPlaybackError({ id: attempt.id, title: attempt.title, message });
    };
    el.addEventListener('ended', handleStopped);
    el.addEventListener('pause', handleStopped);
    el.addEventListener('play', handlePlaying);
    el.addEventListener('error', handleError);
    audioRef.current = el;
    return () => {
      playbackAttemptRef.current = null;
      audioRef.current = null;
      el.removeEventListener('ended', handleStopped);
      el.removeEventListener('pause', handleStopped);
      el.removeEventListener('play', handlePlaying);
      el.removeEventListener('error', handleError);
      el.pause();
      el.removeAttribute('src');
    };
  }, []);

  useEffect(() => {
    const fetchDbPresets = async () => {
      try {
        const { data, error } = await supabase
          .from('curation_playbooks')
          .select('*')
          .eq('category', 'japan')
          .order('updated_at', { ascending: false });
        
        if (error) throw error;
        if (data) {
          const formatted = data
            .filter((pb: any) => {
              const metadata = pb.metadata || {};
              const label = `${pb.key_name || ''} ${pb.title || ''}`;
              return metadata.is_test !== true && !/(^|[\s_-])(test|demo|sample|테스트|샘플)([\s_-]|$)/i.test(label);
            })
            .map((pb: any) => {
            const metadata = pb.metadata || {};
            let extractedDesc = '';
            if (pb.content) {
              const conceptMatch = pb.content.match(/## 💡 핵심 컨셉\s*([\s\S]*?)(?=\n##|$)/);
              if (conceptMatch && conceptMatch[1]) {
                extractedDesc = conceptMatch[1].trim();
              }
            }
            if (!extractedDesc) {
              extractedDesc = metadata.desc || pb.content.slice(0, 100);
            }

            const thumbnailUrl = metadata.thumbnail_url
              || (Array.isArray(metadata.thumbnail_urls) ? metadata.thumbnail_urls[0] : '')
              || metadata.cardImage
              || '';

            return {
              id: pb.key_name,
              name: pb.title,
              desc: extractedDesc,
              customPrompt: metadata.suno_tags || metadata.tags || "",
              emoji: metadata.emoji || "🇯🇵",
              gradient: metadata.gradient || "from-[#fcb045] to-[#fd1d1d]",
              category: metadata.category || "retro",
              cardImage: thumbnailUrl || "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
              defaultTitle: metadata.defaultTitle || pb.title,
              defaultTopic: metadata.defaultTopic || extractedDesc,
              lyricsTemplate: pb.content || "",
              metadata
            };
          });
          setDbPresets(formatted);
        }
      } catch (err) {
        console.error("Failed to fetch database J-BGM presets:", err);
      }
    };
    fetchDbPresets();
  }, []);

  const fetchMyJpTracks = async () => {
    try {
      const res = await fetch("/api/generations");
      if (res.ok) {
        const { generations } = await res.json();
        const list = generations ? generations.filter(isPublicJpTrack) : [];
        setMyTracks(list);
        
        // DB의 좋아요 상태를 state와 동기화
        const likes: Record<string, boolean> = {};
        list.forEach((track: any) => {
          likes[track.id] = !!track.is_liked;
        });
        setLikedTracks(prev => ({ ...prev, ...likes }));
      }
    } catch (err) {
      console.error("Failed to fetch generations:", err);
    }
  };

  useEffect(() => {
    fetchMyJpTracks();
    if (user) {
      const checkProStatus = async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('stripe_customer_id')
            .eq('id', user.id)
            .single();
          if (profile) {
            setIsPro(!!profile.stripe_customer_id);
          }
        } catch (e) {
          console.error("Failed to fetch profile:", e);
        }
      };
      checkProStatus();
    }
  }, [user]);

  const parseTemplateToSections = (template: string): LyricsSection[] => {
    if (!template) return [];
    const parts = template.split('\n\n');
    return parts.map((part, idx) => {
      const lines = part.split('\n');
      let type: any = 'verse';
      let content = part;
      if (lines[0].startsWith('[') && lines[0].endsWith(']')) {
        const typeStr = lines[0].slice(1, -1).toLowerCase();
        if (['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro'].includes(typeStr)) {
          type = typeStr;
          content = lines.slice(1).join('\n');
        }
      }
      return {
        id: `preset-${idx}-${Date.now()}`,
        type,
        content,
        description: '',
      };
    });
  };

  const handleSelectPreset = (preset: any) => {
    if (!preset) return;
    setSelectedPresetId(preset.id);
    const defaultMode = getJapanPresetProfile(preset.id)?.defaultMode;
    if (preset.instrumentalOnly === true) setIsInstrumental(true);
    else if (defaultMode) setIsInstrumental(!artistState.artistVoice && defaultMode === 'instrumental');
    setTitle(""); // Clear for AI Auto-title placeholder
    setTopic(preset.metadata?.defaultTopic || preset.desc || "일본 감성 BGM");
    setStyleTags(preset.customPrompt || preset.tags || "");
    setExcludePrompt(preset.excludePrompt || "");
    setLyricsSections([]); // Clear lyrics by default so it shows the pending state
    setTracks([]);

    const dyn = preset.metadata?.dynamic_elements || null;
    setDynamicElements(dyn);
    // Always default ambient sound volume to 20% (recommended) as requested by user
    setAmbienceVolume(20);

    const foley = preset.metadata?.ambient_foley || null;
    setIsAsmrEnabled(!!foley);
    setAmbientFoley(foley || "");
  };

  // 엔진 변경 및 트랙 수 동기화
  const handleEngineChange = (newEngine: MusicEngine) => {
    if (newEngine === 'lyria3') return;
    setEngine(newEngine);
    if (newEngine === 'suno_v5') {
      if (trackCount === 1) {
        setTrackCount(2);
        setIsPlaylistMode(false);
      }
    }
  };

  // 트랙 수 변경 핸들러
  const handleTrackCountChange = (count: number) => {
    setTrackCount(count);
    if (count === 1 || count === 2) {
      setIsPlaylistMode(false);
    } else {
      setIsPlaylistMode(true);
    }
  };

  const handleGenerateMusic = async () => {
    if (generationJob?.status === 'submitting' || generationJob?.status === 'generating') {
      return;
    }
    if (!user) {
      alert("음악을 생성하려면 로그인이 필요합니다. 로그인 페이지로 이동합니다.");
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    const artistError = artistState.getError(artistSettings);
    if (artistError) {
      setGenErrorMsg(artistError);
      setGenModalState('error');
      return;
    }
    const activePreset = allJpPresets.find(p => p.id === selectedPresetId) || allJpPresets[0];
    if (isPlaylistMode) {
      if (tracks.length === 0) {
        alert('먼저 플레이리스트 가사를 작성해주세요!');
        return;
      }
      if (!isInstrumental) {
        const emptyTrackIndex = tracks.findIndex((track) =>
          !Array.isArray(track.sections) || !track.sections.some((section: LyricsSection) => section.content?.trim())
        );
        if (emptyTrackIndex >= 0) {
          setActiveTrackIdx(emptyTrackIndex);
          alert(`${emptyTrackIndex + 1}번 곡의 가사가 비어 있습니다. 모든 곡의 가사를 확인한 후 생성해주세요.`);
          return;
        }
      }
      setIsGeneratingMusic(true);
      setGenModalState('submitting');
      setGenErrorMsg("");
      setGenerationJob({ ids: [], status: 'submitting', title: `${tracks.length}곡 플레이리스트`, isPublic });
      try {
        const submittedIds: string[] = [];
        const resolvedEngine = engine === 'auto' ? 'suno_v5' : engine;

        const mergeAndClampStyle = (common: string, desc?: string): string => {
          if (!desc || !desc.trim()) return common;
          const baseStyle = common.trim().replace(/[.,;]$/, '');
          const trackDesc = desc.trim();

          const hasMaleInTrack = /\bmale\b|\bman\b|\bmen\b|\bgentleman\b/i.test(trackDesc);
          const hasFemaleInTrack = /\bfemale\b|\bwoman\b|\bwomen\b|\blady\b|\bgirl\b/i.test(trackDesc);
          const hasDuetInTrack = /\bduet\b|\bduo\b|\bmixed vocal\b|\bmale and female\b/i.test(trackDesc);

          let sanitizedBase = baseStyle;

          if (hasMaleInTrack && !hasDuetInTrack) {
            sanitizedBase = sanitizedBase
              .replace(/\b(female|woman|women|lady|girl)\s+vocals?\b/gi, 'male vocal')
              .replace(/\b(female|woman|women|lady|girl)\s+singers?\b/gi, 'male singer')
              .replace(/\b(female|woman|women|lady|girl)\s+voice\b/gi, 'male voice')
              .replace(/\b(female|woman|women|lady|girl)\b/gi, 'male');
          } else if (hasFemaleInTrack && !hasDuetInTrack) {
            sanitizedBase = sanitizedBase
              .replace(/\b(male|man|men|boy)\s+vocals?\b/gi, 'female vocal')
              .replace(/\b(male|man|men|boy)\s+singers?\b/gi, 'female singer')
              .replace(/\b(male|man|men|boy)\s+voice\b/gi, 'female voice')
              .replace(/\b(male|man|men|boy|gentleman)\b/gi, 'female');
          } else if (hasDuetInTrack) {
            sanitizedBase = sanitizedBase
              .replace(/\b(female|male|woman|man|women|men|lady|girl|boy)\s+vocals?\b/gi, 'duet vocal')
              .replace(/\b(female|male|woman|man|women|men|lady|girl|boy)\s+singers?\b/gi, 'duet singers')
              .replace(/\b(female|male|woman|man|women|men|lady|girl|boy)\s+voice\b/gi, 'duet voice');
          }

          const joined = `${sanitizedBase.trim()}, ${trackDesc}`;
          return fitJapanStyleBudget(joined, activePreset?.id);
        };

         const getPresetImages = () => {
          const urls = (activePreset as any)?.metadata?.thumbnail_urls || [];
          if (urls.length > 0) return urls;
          const single = (activePreset as any)?.metadata?.thumbnail_url || (activePreset as any)?.cardImage || (activePreset as any)?.thumbnailUrl;
          if (single) return [single];
          return [];
        };
        const presetImages = getPresetImages();

        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          const submittedSections = Array.isArray(track.sections)
            ? track.sections.map((section: LyricsSection) => ({ ...section }))
            : [];
          const lyricsPrompt = isInstrumental ? '' : buildLyricsPrompt(submittedSections);

          const targetSection = track.sections.find((s: any) => s.type === 'chorus' && s.description?.trim())
            || track.sections.find((s: any) => s.type === 'verse' && s.description?.trim())
            || track.sections.find((s: any) => s.description?.trim());
          const trackDescription = targetSection?.description?.trim() || '';

          let finalStylePrompt = isInstrumental
            ? `${resolveRotationPrompt(styleTags).trim()}, natural ending`
            : mergeAndClampStyle(resolveRotationPrompt(styleTags), trackDescription);

          // ASMR Foley 레이어 결합
          if (isAsmrEnabled && ambientFoley) {
            if (!finalStylePrompt.includes(ambientFoley)) {
              finalStylePrompt = `${finalStylePrompt.trim()} ${ambientFoley}`.trim();
            }
          }

          // 환경음 동적 합성
          if (dynamicElements?.audio_system?.ambience_layer && ambienceVolume > 0) {
            const ambiencePrompt = dynamicElements.audio_system.ambience_layer.base_prompt;
            if (ambienceVolume <= 15) {
              finalStylePrompt += `, subtle background ${ambiencePrompt}`;
            } else if (ambienceVolume <= 45) {
              finalStylePrompt += `, gentle background ${ambiencePrompt}`;
            } else if (ambienceVolume <= 75) {
              finalStylePrompt += `, prominent ${ambiencePrompt} background`;
            } else {
              finalStylePrompt += `, loud intensive ${ambiencePrompt} ASMR background`;
            }
          }

          if (finalStylePrompt.length > 1000) {
            finalStylePrompt = fitJapanStyleBudget(finalStylePrompt, activePreset?.id);
          }

          const trackPayload: PromptPayload = {
            title: track.title,
            stylePrompt: finalStylePrompt,
            lyricsPrompt,
            engine: resolvedEngine,
            isInstrumental,
            sunoVersion,
            tags: {
              youtubeTags: track.youtubeTags,
              snsHashtags: track.snsHashtags,
            },
            metadata: {
              primaryGenre: (activePreset as any)?.metadata?.category ?? (activePreset as any)?.category ?? '',
              subGenre: '',
              bpm: '',
              mood: '',
              ambienceVolume: ambienceVolume / 100,
              dynamicElements: dynamicElements,
            },
          };

          let img1: string | undefined = undefined;
          let img2: string | undefined = undefined;
          if (presetImages.length > 0) {
            img1 = presetImages[(2 * i) % presetImages.length];
            img2 = presetImages[(2 * i + 1) % presetImages.length];
          }

          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...trackPayload,
              selections: {},
              lyricsSections: submittedSections,
              presetId: selectedPresetId,
              presetName: activePreset?.name,
              sourceMenu: 'japan',
              ...studioVoiceFields,
              ...artistState.requestFields,
              coverArtUrl1: img1,
              coverArtUrl2: img2,
              isPublic: isPublic,
            }),
          });

          const result = await res.json().catch(() => null);
          if (!res.ok) {
            throw new Error(result?.error || `${i + 1}번 음원 생성에 실패했습니다.`);
          }
          if (result?.track?.id) submittedIds.push(result.track.id);

          if (user) {
            await saveHistory(trackPayload, {});
          }
        }
        setGenerationJob({
          ids: submittedIds,
          status: submittedIds.length > 0 ? 'generating' : 'completed',
          title: `${tracks.length}곡 플레이리스트`,
          isPublic,
          message: submittedIds.length > 0 ? '워커에서 음원을 생성하고 있습니다.' : '음원 생성 요청이 완료됐습니다.',
        });
        setGenModalState('success');
        setPublicTracksRefreshSignal((value) => value + 1);
        window.setTimeout(() => setPublicTracksRefreshSignal((value) => value + 1), 10_000);
        window.setTimeout(() => setPublicTracksRefreshSignal((value) => value + 1), 30_000);
        fetchMyJpTracks();
      } catch (err: any) {
        console.error("Music gen error:", err);
        setGenErrorMsg(err.message || "오류가 발생했습니다.");
        setGenerationJob((current) => ({
          ids: current?.ids || [],
          status: 'error',
          title: current?.title || '플레이리스트',
          isPublic: current?.isPublic ?? isPublic,
          message: err.message || '음원 생성 중 오류가 발생했습니다.',
        }));
        setGenModalState("error");
      } finally {
        setIsGeneratingMusic(false);
      }
    } else {
      if (!styleTags.trim()) {
        alert("스타일 태그는 필수 입력 사항입니다!");
        return;
      }
      const submittedLyricsSections = lyricsSections.map((section) => ({ ...section }));
      if (!isInstrumental && !submittedLyricsSections.some((section) => section.content?.trim())) {
        alert("보컬곡을 생성하려면 먼저 가사를 작성하거나 AI 가사를 생성해주세요.");
        return;
      }
      setIsGeneratingMusic(true);
      setGenModalState("submitting");
      setGenErrorMsg("");
      setGenerationJob({ ids: [], status: 'submitting', title: title || activePreset?.name || '일본 BGM', isPublic });
      try {
        const resolvedEngine = engine === 'auto' ? 'suno_v5' : engine;

        const mergeAndClampStyle = (common: string, desc?: string): string => {
          if (!desc || !desc.trim()) return common;
          const baseStyle = common.trim().replace(/[.,;]$/, '');
          const trackDesc = desc.trim();

          const hasMaleInTrack = /\bmale\b|\bman\b|\bmen\b|\bgentleman\b/i.test(trackDesc);
          const hasFemaleInTrack = /\bfemale\b|\bwoman\b|\bwomen\b|\blady\b|\bgirl\b/i.test(trackDesc);
          const hasDuetInTrack = /\bduet\b|\bduo\b|\bmixed vocal\b|\bmale and female\b/i.test(trackDesc);

          let sanitizedBase = baseStyle;

          if (hasMaleInTrack && !hasDuetInTrack) {
            sanitizedBase = sanitizedBase
              .replace(/\b(female|woman|women|lady|girl)\s+vocals?\b/gi, 'male vocal')
              .replace(/\b(female|woman|women|lady|girl)\s+singers?\b/gi, 'male singer')
              .replace(/\b(female|woman|women|lady|girl)\s+voice\b/gi, 'male voice')
              .replace(/\b(female|woman|women|lady|girl)\b/gi, 'male');
          } else if (hasFemaleInTrack && !hasDuetInTrack) {
            sanitizedBase = sanitizedBase
              .replace(/\b(male|man|men|boy)\s+vocals?\b/gi, 'female vocal')
              .replace(/\b(male|man|men|boy)\s+singers?\b/gi, 'female singer')
              .replace(/\b(male|man|men|boy)\s+voice\b/gi, 'female voice')
              .replace(/\b(male|man|men|boy|gentleman)\b/gi, 'female');
          } else if (hasDuetInTrack) {
            sanitizedBase = sanitizedBase
              .replace(/\b(female|male|woman|man|women|men|lady|girl|boy)\s+vocals?\b/gi, 'duet vocal')
              .replace(/\b(female|male|woman|man|women|men|lady|girl|boy)\s+singers?\b/gi, 'duet singers')
              .replace(/\b(female|male|woman|man|women|men|lady|girl|boy)\s+voice\b/gi, 'duet voice');
          }

          const joined = `${sanitizedBase.trim()}, ${trackDesc}`;
          return fitJapanStyleBudget(joined, activePreset?.id);
        };

        const targetSection = lyricsSections.find((s: any) => s.type === 'chorus' && s.description?.trim())
          || lyricsSections.find((s: any) => s.type === 'verse' && s.description?.trim())
          || lyricsSections.find((s: any) => s.description?.trim());
        const trackDescription = targetSection?.description?.trim() || '';

        let finalSingleStylePrompt = isInstrumental
          ? `${resolveRotationPrompt(styleTags).trim()}, natural ending`
          : mergeAndClampStyle(resolveRotationPrompt(styleTags), trackDescription);

        // ASMR Foley 레이어 결합
        if (isAsmrEnabled && ambientFoley) {
          if (!finalSingleStylePrompt.includes(ambientFoley)) {
            finalSingleStylePrompt = `${finalSingleStylePrompt.trim()} ${ambientFoley}`.trim();
          }
        }

        // 환경음 동적 합성
        if (dynamicElements?.audio_system?.ambience_layer && ambienceVolume > 0) {
          const ambiencePrompt = dynamicElements.audio_system.ambience_layer.base_prompt;
          if (ambienceVolume <= 15) {
            finalSingleStylePrompt += `, subtle background ${ambiencePrompt}`;
          } else if (ambienceVolume <= 45) {
            finalSingleStylePrompt += `, gentle background ${ambiencePrompt}`;
          } else if (ambienceVolume <= 75) {
            finalSingleStylePrompt += `, prominent ${ambiencePrompt} background`;
          } else {
            finalSingleStylePrompt += `, loud intensive ${ambiencePrompt} ASMR background`;
          }
        }

        if (finalSingleStylePrompt.length > 1000) {
          finalSingleStylePrompt = fitJapanStyleBudget(finalSingleStylePrompt, activePreset?.id);
        }

        const resolvedPayload: PromptPayload = {
          title: title,
          stylePrompt: finalSingleStylePrompt,
          lyricsPrompt: isInstrumental ? '' : buildLyricsPrompt(submittedLyricsSections),
          excludePrompt: excludePrompt.trim() || undefined,
          engine: resolvedEngine,
          isInstrumental,
          sunoVersion,
          tags: {
            youtubeTags,
            snsHashtags,
          },
          metadata: {
            primaryGenre: (activePreset as any)?.metadata?.category ?? (activePreset as any)?.category ?? '',
            subGenre: '',
            bpm: '',
            mood: '',
            ambienceVolume: ambienceVolume / 100,
            dynamicElements: dynamicElements,
          },
        };

        const getPresetImages = () => {
          const urls = (activePreset as any)?.metadata?.thumbnail_urls || [];
          if (urls.length > 0) return urls;
          const single = (activePreset as any)?.metadata?.thumbnail_url || (activePreset as any)?.cardImage || (activePreset as any)?.thumbnailUrl;
          if (single) return [single];
          return [];
        };
        const presetImages = getPresetImages();
        let img1: string | undefined = undefined;
        let img2: string | undefined = undefined;
        if (presetImages.length > 0) {
          img1 = presetImages[0 % presetImages.length];
          img2 = presetImages[1 % presetImages.length];
        }

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...resolvedPayload,
            selections: {},
            lyricsSections: submittedLyricsSections,
            presetId: selectedPresetId,
            presetName: activePreset?.name,
            sourceMenu: 'japan',
              ...studioVoiceFields,
              ...artistState.requestFields,
            coverArtUrl1: img1,
            coverArtUrl2: img2,
            isPublic: isPublic,
          }),
        });
        const result = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(result?.error || '음원 생성에 실패했습니다.');
        }
        const submittedId = result?.track?.id;
        setGenerationJob({
          ids: submittedId ? [submittedId] : [],
          status: result?.track?.status === 'completed' || !submittedId ? 'completed' : 'generating',
          title: result?.track?.title || title || activePreset?.name || '일본 BGM',
          isPublic,
          message: result?.track?.status === 'completed' ? '음원이 완성됐습니다.' : '워커에서 음원을 생성하고 있습니다.',
        });
        if (user) {
          await saveHistory(resolvedPayload, {});
        }
        setGenModalState('success');
        setPublicTracksRefreshSignal((value) => value + 1);
        window.setTimeout(() => setPublicTracksRefreshSignal((value) => value + 1), 10_000);
        window.setTimeout(() => setPublicTracksRefreshSignal((value) => value + 1), 30_000);
        fetchMyJpTracks();
      } catch (err: any) {
        console.error("Music gen error:", err);
        setGenErrorMsg(err.message || "오류가 발생했습니다.");
        setGenerationJob((current) => ({
          ids: current?.ids || [],
          status: 'error',
          title: current?.title || title || '일본 BGM',
          isPublic: current?.isPublic ?? isPublic,
          message: err.message || '음원 생성 중 오류가 발생했습니다.',
        }));
        setGenModalState("error");
      } finally {
        setIsGeneratingMusic(false);
      }
    }
  };

  useEffect(() => {
    if (!generationJob || generationJob.status !== 'generating' || generationJob.ids.length === 0) return;

    let cancelled = false;
    const checkGenerationStatus = async () => {
      try {
        const results = await Promise.all(generationJob.ids.map(async (id) => {
          const res = await fetch(`/api/generations?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
          if (!res.ok) return null;
          const data = await res.json();
          return data.generation || null;
        }));
        if (cancelled) return;

        const available = results.filter(Boolean);
        if (available.some((item: any) => item.status === 'failed')) {
          setGenerationJob((current) => current ? { ...current, status: 'error', message: '음원 생성에 실패했습니다.' } : current);
          setGenModalState('error');
          return;
        }
        if (available.length === generationJob.ids.length && available.every((item: any) => item.status === 'completed')) {
          setGenerationJob((current) => current ? { ...current, status: 'completed', message: `${available.length}곡의 음원 생성이 완료됐습니다.` } : current);
          setGenModalState('success');
          setPublicTracksRefreshSignal((value) => value + 1);
          fetchMyJpTracks();
        }
      } catch (error) {
        console.error('Failed to check Japan generation status:', error);
      }
    };

    checkGenerationStatus();
    const intervalId = window.setInterval(checkGenerationStatus, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [generationJob?.ids.join(','), generationJob?.status]);

  const handlePlayTrack = (item: any) => {
    const el = audioRef.current;
    if (!el) return;

    const trackUrl = item.audio_url || item.source_audio_url;
    if (item.status !== "completed") return;
    if (!trackUrl) {
      setPlaybackError({ id: item.id, title: item.title || 'Untitled', message: getAudioPlaybackError('') || '음원 파일을 불러오지 못했습니다' });
      return;
    }

    const attempt = { id: item.id, title: item.title || 'Untitled', url: trackUrl };
    const isCurrentSource = playingTrackId === item.id && el.src === new URL(trackUrl, window.location.href).href;
    playbackAttemptRef.current = attempt;
    const expired = getExpiredAudioPlaybackError(trackUrl);
    if (expired) {
      el.pause();
      setPlayingTrackId(item.id);
      setIsTrackPlaying(false);
      setPlaybackError({ id: item.id, title: attempt.title, message: expired });
      return;
    }
    if (isCurrentSource && isTrackPlaying) {
      el.pause();
      return;
    }
    setPlaybackError(null);
    if (!isCurrentSource) {
      el.pause();
      el.src = trackUrl;
      el.load();
      setPlayingTrackId(item.id);
    }
    el.play().catch(error => {
      if (audioRef.current !== el || playbackAttemptRef.current !== attempt) return;
      setIsTrackPlaying(false);
      const message = getAudioPlaybackError(trackUrl, error);
      if (message) setPlaybackError({ id: attempt.id, title: attempt.title, message });
    });
  };

  // ─── 좋아요 토글 ───
  const toggleLike = async (id: string) => {
    const isCurrentlyLiked = !!likedTracks[id];
    const newLikeState = !isCurrentlyLiked;

    setLikedTracks(prev => ({
      ...prev,
      [id]: newLikeState
    }));

    try {
      const res = await fetch('/api/generations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_liked: newLikeState })
      });

      if (!res.ok) {
        setLikedTracks(prev => ({
          ...prev,
          [id]: isCurrentlyLiked
        }));
      }
    } catch (e) {
      console.error('Like toggle exception:', e);
      setLikedTracks(prev => ({
        ...prev,
        [id]: isCurrentlyLiked
      }));
    }
  };

  // ─── 온디맨드 스템 분리 요청 ───
  const handleRequestStemSplit = async (id: string) => {
    if (!isPro) {
      alert("스템 분리는 Pro Plan 회원만 이용할 수 있습니다.");
      return;
    }

    try {
      const resp = await fetch('/api/generations/split-stems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: id }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        throw new Error(data.error || '스템 분리 요청 실패');
      }

      alert('스템 분리 작업이 시작되었습니다. 완료될 때까지 잠시 기다려주세요.');
      fetchMyJpTracks();
    } catch (err: any) {
      alert('스템 분리 요청 실패: ' + err.message);
    }
  };

  // ─── AI 커버 아트 생성 ───
  const handleGenerateCoverArt = async (item: any) => {
    if (generatingCovers[item.id]) return;
    
    setGeneratingCovers(prev => ({ ...prev, [item.id]: true }));
    
    try {
      let promptText = "";
      if (item.license_hash) {
        try {
          const parsed = JSON.parse(item.license_hash);
          promptText = parsed.stylePrompt || parsed.lyricsPrompt || "";
        } catch {}
      }
      if (!promptText) {
        promptText = item.title || "premium lofi retro future bass music concept illustration";
      }
      
      const imgRes = await fetch('/api/autopilot/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${promptText}, premium Japanese music album cover art, clear luminous exposure, fresh refined colors, crisp focal subject, elegant centered composition, bright and polished visual finish`,
          size: '1:1',
          imageType: 'thumbnail',
          channelTitle: item.title || 'Melodio Track'
        })
      });
      
      const imgData = await imgRes.json();
      if (!imgRes.ok || !imgData.success || !imgData.imageUrl) {
        throw new Error(imgData.error || 'Failed to generate cover art');
      }
      
      const newCoverUrl = imgData.imageUrl;
      
      const patchRes = await fetch('/api/generations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          cover_art_url: newCoverUrl
        })
      });
      
      if (!patchRes.ok) {
        throw new Error('Failed to update cover art in database');
      }
      
      setMyTracks(prev => 
        prev.map(track => 
          track.id === item.id 
            ? { ...track, cover_art_url: newCoverUrl } 
            : track
        )
      );
    } catch (err: any) {
      console.error('CoverArt error:', err);
      alert('커버 아트 생성 도중 오류가 발생했습니다. 잠시 후 다시 시도해 주십시오.');
    } finally {
      setGeneratingCovers(prev => ({ ...prev, [item.id]: false }));
    }
  };

  // ─── 제목 수정 및 삭제 처리 ───
  const openEditModal = (track: any) => {
    setEditingTrack({ id: track.id, title: track.title || 'Untitled' });
    setNewTitle(track.title || 'Untitled');
    setIsEditModalOpen(true);
    setActiveMenuId(null);
  };

  const handleCopyText = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTextType(type);
    setTimeout(() => setCopiedTextType(null), 2000);
  };

  const handleUpdateTitle = async () => {
    if (!editingTrack || !newTitle.trim()) return;
    const response = await fetch('/api/generations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingTrack.id, title: newTitle.trim() }),
    });

    if (response.ok) {
      setIsEditModalOpen(false);
      setEditingTrack(null);
      fetchMyJpTracks();
    } else {
      const payload = await response.json().catch(() => ({}));
      alert('제목 수정 실패: ' + (payload.error || '서버 요청에 실패했습니다.'));
    }
  };

  const handleDeleteTrack = async (id: string) => {
    setActiveMenuId(null);
    if (!confirm('정말 이 AI 생성 음원을 삭제하시겠습니까? (삭제된 곡의 스템 분리 데이터도 전부 초기화됩니다)')) return;
    
    try {
      const res = await fetch(`/api/generations?id=${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        if (playingTrackId === id) {
          setPlayingTrackId(null);
          setIsTrackPlaying(false);
        }
        fetchMyJpTracks();
      } else {
        const errData = await res.json();
        alert('삭제 실패: ' + (errData.error || '알 수 없는 오류'));
      }
    } catch (err) {
      alert('삭제 중 통신 오류가 발생했습니다.');
    }
  };

  // URL 쿼리 파라미터(?v=a, ?v=b, ?v=c) 감지 및 로드
  useEffect(() => {
    const vParam = searchParams.get("v")?.toUpperCase();
    if (vParam === "A" || vParam === "B" || vParam === "C") {
      setVariant(vParam as Variant);
    }
  }, [searchParams]);

  // Variant 변경 시 URL 업데이트 (새로고침 없이)
  const handleVariantChange = (v: Variant) => {
    setVariant(v);
    const newUrl = `${window.location.pathname}?v=${v.toLowerCase()}`;
    window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070a] text-white flex flex-col items-center justify-center font-sans">
        <div className="w-10 h-10 border-4 border-fuchsia-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <span className="text-zinc-500 text-xs">페이지 정보를 불러오는 중...</span>
      </div>
    );
  }

  if (user) {
    const activePreset = allJpPresets.find(p => p.id === selectedPresetId) || allJpPresets[0];

    return (
      <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col pb-20 relative font-sans space-y-8 animate-fade-in text-white">
        <PresetSamplePlayer controller={samplePlayer} />
        {/* 헤더 — 통일된 표준 브랜드 헤더 */}
        <header className="mb-8 border-b border-white/10 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">일본 BGM 스튜디오</h1>
            <p className="text-zinc-400">일본 감성(City Pop, J-Lofi, Midnight Jazz) BGM 채널 특화 가사/음원 생성 및 라이브러리 제어 센터</p>
          </div>
          <Link 
            href="/dashboard" 
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-bold rounded-xl transition-all flex-shrink-0"
          >
            전체 대시보드 바로가기 ➡️
          </Link>
        </header>

        {/* 메인 생성기 워크스페이스 그리드 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start lg:items-stretch">
          
          {/* 좌측: 프리셋 리스트 셀렉터 (6 cols) */}
          <div data-japan-preset-column className="lg:col-span-6 flex min-w-0 flex-col gap-4">
            <h2 className="text-xs font-bold text-melodio-muted uppercase tracking-widest pl-1">
              🌸 1단계: 프리셋 감성 테마 선택
            </h2>
            
            {/* 검색 & 필터 헤더 */}
            <div className="p-4 rounded-2xl bg-zinc-900/40 border border-white/5 space-y-4 mb-4">
              {/* 상단 라인: 타이틀 + 검색창 & 신규 생성 버튼 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white tracking-tight uppercase whitespace-nowrap">
                    일본 특화 프리셋 라이브러리
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono whitespace-nowrap">
                    (총 {filteredJpPresets.length}개)
                  </span>
                </div>
                
                {/* 검색창 + 나만의 프리셋 만들기 버튼 */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {/* 검색창 */}
                  <div className="relative flex-1 sm:w-48">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="프리셋 검색..."
                      value={presetSearchQuery}
                      onChange={(e) => {
                        setPresetSearchQuery(e.target.value);
                        setJpPage(1);
                      }}
                      className="w-full pl-9 pr-3 py-1.5 bg-black/50 border border-white/10 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-all"
                    />
                  </div>

                  {/* 신규 생성 버튼 */}
                  <button
                    onClick={() => setIsCreatePresetOpen(true)}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white rounded-xl text-[10px] font-extrabold hover:shadow-[0_0_10px_rgba(244,63,94,0.3)] transition-all flex items-center justify-center gap-1 shrink-0"
                  >
                    + 나만의 프리셋 만들기
                  </button>
                </div>
              </div>

              {/* 구분선 */}
              <div className="h-px bg-white/5" />

              {/* 하단 라인: 필터 탭 (슬라이더 제거, 일반 BGM과 동일한 버튼 탭 적용) */}
              <div className="flex">
                <div className="flex bg-black/50 border border-white/10 p-0.5 rounded-xl text-[10px] font-medium flex-wrap gap-y-1">
                  {[
                    { id: 'all', label: '전체 BGM' },
                    { id: 'healing', label: '💆‍♂️ 마음의 위로와 힐링' },
                    { id: 'focus', label: '✏️ 몰입과 생산성' },
                    { id: 'retro', label: '📻 아날로그 & 향수' },
                    { id: 'custom', label: '✨ 나만의 컨셉' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setPresetTab(tab.id as any);
                        setJpPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        presetTab === tab.id
                          ? 'bg-zinc-800 text-white font-bold'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 데스크톱 2열 × 9행, 페이지당 18개 */}
            <div data-japan-preset-grid className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleJpPresets.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                const cardImage = (preset.metadata as any)?.cardImage || (preset.metadata as any)?.thumbnail_url || (preset as any).cardImage || (preset as any).thumbnailUrl || (preset as any).thumbnail_url;
                const category = (preset.metadata as any)?.category || (preset as any).category || "CUSTOM BGM";
                
                const isLiked = likedPresets.includes(preset.id);

                return (
                  <div
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`relative w-full rounded-2xl overflow-hidden border transition-all duration-300 text-left flex flex-col group shrink-0 cursor-pointer ${
                      isSelected 
                        ? "border-amber-500 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.3)] scale-[1.02]" 
                        : "border-white/5 bg-zinc-900/40 hover:border-white/10 hover:bg-zinc-900/60"
                    }`}
                  >
                    {/* 1. Upper Image Thumbnail Area */}
                    <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-zinc-900 border-b border-white/5">
                      <div className="absolute inset-0 z-0" style={{ backgroundColor: preset.gradient }}>
                        {cardImage && (
                          <img 
                            src={cardImage} 
                            alt="" 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.025] group-hover:saturate-[1.03]"
                          />
                        )}
                      </div>
                      {/* Top Left Big Overlay Category Title */}
                      <div className="absolute top-3 left-3 z-10 px-2 py-0.5 rounded bg-white/50 text-black text-[9px] font-extrabold uppercase tracking-widest transition-all font-mono shadow-sm backdrop-blur-sm">
                        {category}
                      </div>

                      {/* Top Right Zoom Overlay (visible on hover) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingPreset(preset);
                        }}
                        className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-white/90 hover:bg-white border border-white/80 text-zinc-700 hover:text-amber-600 transition-all opacity-0 group-hover:opacity-100 shadow-md backdrop-blur-sm"
                        title="상세보기"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                      <PresetSampleButton preset={preset} controller={samplePlayer} />
                    </div>

                    {/* 2. Lower Content Area */}
                    <div className="pt-2 px-3 pb-2.5 bg-zinc-950/40 flex flex-col justify-between min-w-0 shrink-0 h-[78px]">
                      <div className="min-w-0">
                        <h3 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPreset(preset);
                          }}
                          className="text-[11.5px] font-black text-white leading-tight hover:text-amber-400 cursor-pointer transition-colors truncate"
                          title={preset.name}
                        >
                          {preset.name.split(" (")[0]}
                        </h3>
                        <p className="text-[9.5px] text-zinc-400 mt-0.5 line-clamp-1 leading-normal group-hover:text-zinc-200 transition-colors font-sans">
                          {preset.desc}
                        </p>
                      </div>

                      {/* Bottom utility row: Badge on the left, Hover Actions on the right */}
                      <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/5">
                        <div className="flex items-center gap-1 scale-90 origin-left">
                          {preset.id.startsWith("custom-") ? (
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-300 font-mono tracking-wider uppercase font-bold shadow-sm">
                              Custom Set
                            </span>
                          ) : (
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-900 text-zinc-500 font-mono tracking-wider uppercase font-semibold">
                              Signature
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {getJapanPresetProfile(preset.id)?.defaultMode === 'instrumental' && (
                            <span className="text-[9px] text-zinc-400">연주 기본</span>
                          )}
                          {/* Always visible action buttons */}
                          <div className="flex items-center gap-1.5">
                            {preset.id.startsWith("custom-") ? (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPreset(preset);
                                  }}
                                  className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5"
                                  title="수정"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCustomPreset(preset.id);
                                  }}
                                  className="text-zinc-500 hover:text-red-400 transition-colors p-0.5"
                                  title="삭제"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            ) : null}

                            {/* Heart (Like) button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLikePreset(preset.id);
                              }}
                              className={`transition-colors p-0.5 ${isLiked ? 'text-red-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                              title={isLiked ? "좋아요 취소" : "좋아요"}
                            >
                              <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
                            </button>
                          </div>

                          {/* Selected Indicator Dot */}
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b] animate-pulse" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls - 페이지당 18개 */}
            {filteredJpPresets.length > 0 && (
              <div className="flex items-center justify-center gap-1.5 pt-2">
                <button
                  onClick={() => setJpPage(prev => Math.max(prev - 1, 1))}
                  disabled={jpPage === 1}
                  className="p-1 rounded bg-zinc-900/40 border border-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-all flex items-center justify-center"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.ceil(filteredJpPresets.length / JAPAN_PRESETS_PER_PAGE) }).map((_, idx) => {
                  const pageNum = idx + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setJpPage(pageNum)}
                      className={`w-6 h-6 rounded text-xs font-bold font-mono flex items-center justify-center transition-all bg-zinc-900/40 border border-zinc-800 ${
                        jpPage === pageNum
                          ? 'text-white border-zinc-700/80 font-extrabold shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/10'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setJpPage(prev => Math.min(prev + 1, Math.ceil(filteredJpPresets.length / JAPAN_PRESETS_PER_PAGE)))}
                  disabled={jpPage === Math.ceil(filteredJpPresets.length / JAPAN_PRESETS_PER_PAGE)}
                  className="p-1 rounded bg-zinc-900/40 border border-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-all flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 일본 시장 가이드보드 */}
            <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-5 space-y-3 lg:mt-auto">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                💡 일본 BGM 채널 특화 가이드
              </h3>
              <ul className="text-xs text-zinc-500 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>일본 BGM 채널 트렌드는 <strong>"장기 체류형 음악"</strong>입니다. 1시간 이상의 편집물로 엮기 좋은 70~80BPM의 차분한 리듬을 권장합니다.</li>
                <li>가사는 연주곡(Instrumental)도 인기 있으나, 일본어로 작사 시 번역 템플릿보다 감성적인 <strong>단편 구절 형태</strong>가 현지인들에게 더 잘 통합니다.</li>
              </ul>
            </div>
          </div>

          {/* 우측: 실제 음악 생성 컨트롤 패널 (6 cols) */}
          <div data-japan-generation-column className="lg:col-span-6 flex min-w-0 flex-col gap-4">
            <h2 className="text-xs font-bold text-melodio-muted uppercase tracking-widest pl-1">
              🛠️ 2단계: AI 일본어 가사 및 음원 생성 제어
            </h2>
            
            {/* 엔진 선택 바 */}
            <div className="flex flex-wrap items-center gap-3 mb-2 px-1">
              <div className="flex flex-wrap items-center gap-2 text-sm relative">
                <span className="text-melodio-muted text-xs font-semibold">엔진:</span>
                <button
                  onClick={() => handleEngineChange('auto')}
                  className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${
                    engine === 'auto'
                      ? 'border-[#ff4e7e] bg-[#ff4e7e]/20 text-[#ff6b4a]'
                      : 'border-zinc-800 text-melodio-muted hover:text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  🔄 Auto
                </button>
                <button
                  type="button"
                  disabled
                  title="Lyria 3는 현재 사용할 수 없습니다. Suno를 선택해 주세요."
                  className="px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-500 text-xs cursor-not-allowed"
                >
                  Lyria 3 · 현재 이용 불가
                </button>

                {/* Suno Button & Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      if (engine !== 'suno_v5') {
                        handleEngineChange('suno_v5');
                        setIsSunoDropdownOpen(true);
                      } else {
                        setIsSunoDropdownOpen(!isSunoDropdownOpen);
                      }
                    }}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                      engine === 'suno_v5'
                        ? 'border-[#ff4e7e] bg-[#ff4e7e]/20 text-[#ff6b4a]'
                        : 'border-zinc-800 text-melodio-muted hover:text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <span>🟡 Suno {sunoVersion}</span>
                    <span className="text-[9px] opacity-70">▼</span>
                  </button>

                  {isSunoDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsSunoDropdownOpen(false)}
                      />
                      <div className="absolute left-0 mt-1 w-28 bg-[#18181b] border border-zinc-800 rounded-lg shadow-xl z-50 py-1 text-xs">
                        {SUNO_VERSIONS.map((v) => (
                          <button
                            key={v}
                            onClick={() => {
                              setSunoVersion(v);
                              setIsSunoDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200 transition-colors"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* AI 생성 알림 에러/성공 메시지 피드백 */}
            {genModalState === "success" && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium text-center mb-2 flex items-center justify-center gap-2 animate-pulse">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>음원 작곡 요청이 성공적으로 접수되었습니다! 워커가 백그라운드에서 곡을 완성 중입니다.</span>
              </div>
            )}
            {genModalState === "error" && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium text-center mb-2 flex items-center justify-center gap-2">
                <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>생성 오류: {genErrorMsg}</span>
              </div>
            )}

            <StudioArtistPicker state={artistState} />

            <div data-japan-generation-output className="lg:flex lg:flex-1 lg:flex-col lg:[&>div]:static lg:[&>div]:flex-1">
            <PromptOutput
              payload={payload}
              stylePrompt={styleTags}
              onStylePromptChange={setStyleTags}
              excludePrompt={excludePrompt}
              onExcludePromptChange={setExcludePrompt}
              isPublic={isPublic}
              onPublicToggle={setIsPublic}
              sourceMenu="japan"
              isInstrumental={isInstrumental}
              onInstrumentalToggle={(next) => { if (next || !activePreset?.instrumentalOnly) setIsInstrumental(next); }}
              compositorResult={{ prompt: styleTags, charCount: styleTags.length, truncatedCount: 0, maxChars: 1000 }}
              onGenerate={handleGenerateMusic}
              isGenerating={isGeneratingMusic || generationJob?.status === 'submitting' || generationJob?.status === 'generating'}
              isPlaylistMode={isPlaylistMode}
              trackCount={trackCount}
              isPro={isPro}
              onOpenProPaywall={() => alert('AI 프롬프트 최적화 기능은 Pro 요금제 구독 시 사용 가능합니다.')}
              dynamicElements={dynamicElements}
              ambienceVolume={ambienceVolume}
              onAmbienceVolumeChange={setAmbienceVolume}
              isAsmrEnabled={isAsmrEnabled}
              onAsmrToggle={setIsAsmrEnabled}
              ambientFoley={ambientFoley}
              lyricsBuilderNode={
                <div data-japan-lyrics-area className="lg:flex lg:flex-1 lg:flex-col lg:[&>div]:flex-1">
                <LyricsBuilder
                  artistVoice={artistState.artistVoice}
                  artistContextKey={JSON.stringify(artistState.requestFields)}
                  lyricTopic={topic}
                  onLyricTopicChange={setTopic}
                  artistSelectionError={artistState.getError(artistSettings)}
                  isInstrumental={isInstrumental}
                  stylePrompt={styleTags}
                  onInstrumentalToggle={(next) => { if (next || !activePreset?.instrumentalOnly) setIsInstrumental(next); }}
                  isPlaylistMode={isPlaylistMode}
                  onPlaylistModeToggle={setIsPlaylistMode}
                  trackCount={trackCount}
                  onTrackCountChange={handleTrackCountChange}
                  engine={engine}
                  title={title}
                  onTitleChange={setTitle}
                  youtubeTags={youtubeTags}
                  snsHashtags={snsHashtags}
                  onTagsChange={(yt, sns) => {
                    setYoutubeTags(yt);
                    setSnsHashtags(sns);
                  }}
                  sections={lyricsSections}
                  onSectionsChange={setLyricsSections}
                  lyricLanguage={lyricLanguage}
                  onLyricLanguageChange={setLyricLanguage}
                  playlistTitle={playlistTitle}
                  onPlaylistTitleChange={setPlaylistTitle}
                  playlistDescription={playlistDescription}
                  onPlaylistDescriptionChange={setPlaylistDescription}
                  playlistYoutubeTags={playlistYoutubeTags}
                  playlistSnsHashtags={playlistSnsHashtags}
                  onPlaylistTagsChange={(yt, sns) => {
                    setPlaylistYoutubeTags(yt);
                    setPlaylistSnsHashtags(sns);
                  }}
                  tracks={tracks}
                  onTracksChange={setTracks}
                  activeTrackIdx={activeTrackIdx}
                  onActiveTrackIdxChange={setActiveTrackIdx}
                  presetId={selectedPresetId}
                  isJapanCampaign={true}
                />
                </div>
              }
            />
            </div>
          </div>

        </div>

        {/* 공개 여부와 무관하게 현재 사용자의 생성 상태를 항상 표시 */}
        {generationJob && (
          <div className={`fixed ${samplePlayer.current ? 'bottom-20' : 'bottom-6'} right-6 z-[100] w-[min(380px,calc(100vw-3rem))] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${
            generationJob.status === 'completed'
              ? 'border-emerald-400/40 bg-emerald-950/90'
              : generationJob.status === 'error'
                ? 'border-red-400/40 bg-red-950/90'
                : 'border-cyan-400/40 bg-zinc-950/95'
          }`} role="status" aria-live="polite">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {generationJob.status === 'completed' ? (
                  <Check className="h-5 w-5 text-emerald-400" />
                ) : generationJob.status === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-black text-white">
                    {generationJob.status === 'submitting'
                      ? '음원 생성 요청 접수 중'
                      : generationJob.status === 'generating'
                        ? '음원 생성 중'
                        : generationJob.status === 'completed'
                          ? '음원 생성 완료'
                          : '음원 생성 오류'}
                  </p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${generationJob.isPublic ? 'bg-fuchsia-500/15 text-fuchsia-300' : 'bg-zinc-700/70 text-zinc-300'}`}>
                    {generationJob.isPublic ? '공개' : '비공개'}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-zinc-200">{generationJob.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  {generationJob.message || (generationJob.status === 'submitting' ? '생성 서버에 요청을 전달하고 있습니다.' : '완료될 때까지 중복 생성을 방지합니다.')}
                </p>
                {generationJob.status === 'completed' && !generationJob.isPublic && (
                  <p className="mt-1 text-[10px] text-emerald-300">비공개 음원은 대시보드에서 확인할 수 있습니다.</p>
                )}
              </div>
              {(generationJob.status === 'completed' || generationJob.status === 'error') && (
                <button
                  type="button"
                  onClick={() => setGenerationJob(null)}
                  className="shrink-0 rounded-lg p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                  aria-label="생성 상태 알림 닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* J-BGM 공개 음원 목록 */}
        <section className="pt-6 border-t border-white/5">
          <PublicTrackGrid sourceMenu="japan" itemsPerPage={16} refreshSignal={publicTracksRefreshSignal} />
          {playbackError && playbackError.id === playingTrackId && (
            <p role="alert" className="mt-3 text-xs leading-relaxed text-red-300">{playbackError.title}: {playbackError.message}</p>
          )}
        </section>

        {/* 🔮 일본 특화 나만의 프리셋 만들기/수정 모달 */}
        {(isCreatePresetOpen || !!editingPreset) && (
          <CreatePresetModal
            isOpen={isCreatePresetOpen || !!editingPreset}
            onClose={() => {
              setIsCreatePresetOpen(false);
              setEditingPreset(null);
            }}
            onSave={handleSaveCustomPreset}
            currentStylePrompt={styleTags}
            editingPreset={editingPreset}
            layoutType="japan"
          />
        )}

        {/* ── 곡 제목 수정 팝업 모달 ── */}
        {isEditModalOpen && editingTrack && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl relative">
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-rose-500" />
                <span>Edit Track Title</span>
              </h3>
              <p className="text-xs text-zinc-400 mb-6">
                Update the metadata and display name of this generated track.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 font-mono">
                    Track Name
                  </label>
                  <input 
                    type="text" 
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-rose-500/50 transition-colors"
                    placeholder="Enter track title..."
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white text-xs font-semibold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpdateTitle}
                  className="px-5 py-2 bg-gradient-to-r from-rose-600 to-cyan-500 text-white text-xs font-semibold rounded-xl hover:shadow-[0_0_15px_rgba(244,63,94,0.4)] transition-all"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── 트랙 상세정보 모달 ─── */}
        {detailItem && (() => {
          let meta: Record<string, any> = {};
          const metaSource = detailItem.license_hash || detailItem.duration_mode;
          if (metaSource && metaSource !== 'clip' && metaSource !== 'full') {
            try {
              meta = JSON.parse(metaSource);
            } catch (e) {
              console.error('Failed to parse track metadata:', e);
            }
          }

          const allPresets = [...jpPresets, ...customPresets, ...dbPresets];
          const presetId = meta.presetId || null;
          const presetName = meta.presetName || null;

          let displayPresetId = presetId;
          let displayPresetName = presetName;

          if (!displayPresetId && meta.stylePrompt && allPresets.length > 0) {
            const cleanStyle = meta.stylePrompt.toLowerCase().replace(/[^a-zA-Z0-9]/g, '').trim();
            const matched = allPresets.find(p => {
              const cleanCustom = (p.tags || '').toLowerCase().replace(/[^a-zA-Z0-9]/g, '').trim();
              return cleanStyle.includes(cleanCustom) || cleanCustom.includes(cleanStyle);
            });
            if (matched) {
              displayPresetId = matched.id;
              displayPresetName = matched.name;
            }
          }

          let isDeleted = false;
          if (displayPresetId) {
            const exists = allPresets.some(p => p.id === displayPresetId);
            if (!exists) {
              isDeleted = true;
            }
          }

          const linkUrl = displayPresetId 
            ? `/japan?preset=${encodeURIComponent(displayPresetId)}&style=${encodeURIComponent(meta.stylePrompt || '')}&name=${encodeURIComponent(displayPresetName || '')}`
            : `/japan?style=${encodeURIComponent(meta.stylePrompt || '')}`;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailItem(null)}>
              <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-6 space-y-4 flex flex-col max-h-[85vh] text-left" onClick={(e) => e.stopPropagation()}>
                {/* 헤더 */}
                <div className="flex items-center justify-between flex-shrink-0">
                  <h3 className="text-white text-lg font-bold truncate flex-1 mr-4">
                    🎵 {detailItem.title || 'Untitled Track'}
                  </h3>
                  <button 
                    onClick={() => setDetailItem(null)} 
                    className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 스크롤 가능한 본문 영역 */}
                <div className="overflow-y-auto flex-1 pr-1 space-y-4 max-h-[60vh]">
                  {/* 상태 & ID */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded font-mono border ${
                      detailItem.status === 'completed' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                        : detailItem.status === 'generating' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20 animate-pulse'
                        : detailItem.status === 'failed' ? 'text-red-400 bg-red-400/10 border-red-400/20'
                        : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                    }`}>
                      {detailItem.status === 'completed' ? 'READY' : detailItem.status.toUpperCase()}
                    </span>
                    <span className="text-zinc-600">{new Date(detailItem.created_at).toLocaleString('ko-KR')}</span>
                  </div>

                  {/* 앨범 커버 이미지 (1:1 비율) */}
                  <div className="flex justify-center flex-shrink-0 py-2">
                    <div className="w-48 h-48 rounded-xl overflow-hidden border border-white/10 shadow-lg relative bg-black/40">
                      <img 
                        src={detailItem.cover_art_url || 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png'}
                        alt={detailItem.title || 'Track Art'} 
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  </div>

                  {/* 곡 설명 및 태그 */}
                  {meta.description && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-center">
                      <div className="text-zinc-300 text-sm font-medium">{meta.description}</div>
                    </div>
                  )}

                  {meta.tags && (
                    <div className="flex flex-wrap justify-center gap-1.5 py-1">
                      {meta.tags.split(',').map((tag: string, i: number) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                          #{tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 메타데이터 표 */}
                  <div className="space-y-2">
                    {!meta.stylePrompt && !meta.lyricsPrompt && !meta.engine && (
                      <div className="bg-white/5 rounded-xl p-4 border border-white/5 text-center">
                        <div className="text-zinc-500 text-sm">이 곡은 메타데이터 저장 기능 이전에 생성되어 상세 정보가 없습니다.</div>
                        <div className="text-zinc-600 text-xs mt-1">새로 생성하는 곡부터 스타일프롬프트, 가사 등이 자동 저장됩니다.</div>
                      </div>
                    )}

                    {/* 오디오 URL */}
                    {detailItem.audio_url && (
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div className="text-rose-400 text-[10px] font-bold uppercase tracking-wider mb-1">Audio Source</div>
                        <div className="text-zinc-400 text-xs font-mono break-all">{detailItem.audio_url}</div>
                      </div>
                    )}

                    {/* 적용된 프리셋/스타일 매칭 */}
                    {(displayPresetId || meta.stylePrompt) && (
                      <div className="bg-white/5 rounded-xl p-3.5 border border-white/5 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-rose-400 text-[10px] font-bold uppercase tracking-wider mb-1">Applied Preset</div>
                          <div className="text-white text-sm font-semibold truncate">{displayPresetName || 'Custom Style'}</div>
                          <div className="text-zinc-500 text-[10px] mt-0.5">
                            {displayPresetName 
                              ? `이 곡은 '${displayPresetName}' 스타일로 제작되었습니다.` 
                              : `이 곡은 사용자 지정 스타일로 제작되었습니다.`}
                          </div>
                        </div>
                        <Link 
                          href={linkUrl}
                          className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 hover:text-white border border-rose-500/20 hover:border-rose-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 shadow-[0_0_15px_rgba(244,63,94,0.15)] hover:shadow-[0_0_20px_rgba(244,63,94,0.3)] active:scale-95"
                          onClick={() => setDetailItem(null)}
                        >
                          <span>🪄 이 스타일로 만들기</span>
                        </Link>
                      </div>
                    )}

                    {meta.stylePrompt && (
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 relative group/card">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-rose-400 text-[10px] font-bold uppercase tracking-wider">Style Prompt</div>
                          <button
                            onClick={() => handleCopyText(meta.stylePrompt, 'style')}
                            className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-all"
                            title="Style Prompt 복사"
                          >
                            {copiedTextType === 'style' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="text-zinc-300 text-sm whitespace-pre-wrap">{meta.stylePrompt}</div>
                      </div>
                    )}

                    {meta.lyricsPrompt && (
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 relative group/card">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-cyan-400 text-[10px] font-bold uppercase tracking-wider">Lyrics</div>
                          <button
                            onClick={() => handleCopyText(meta.lyricsPrompt, 'lyrics')}
                            className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-all"
                            title="Lyrics 복사"
                          >
                            {copiedTextType === 'lyrics' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="text-zinc-300 text-sm whitespace-pre-wrap">{meta.lyricsPrompt}</div>
                      </div>
                    )}

                    {meta.excludePrompt && (
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div className="text-red-400 text-[10px] font-bold uppercase tracking-wider mb-1">Exclude</div>
                        <div className="text-zinc-300 text-sm">{meta.excludePrompt}</div>
                      </div>
                    )}

                    {/* 태그 그리드 */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {meta.engine && (
                        <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                          <span className="text-zinc-500">Engine</span>
                          <span className="ml-2 text-white font-mono">{meta.engine} {meta.sunoVersion || ''}</span>
                        </div>
                      )}
                      {meta.genre && (
                        <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                          <span className="text-zinc-500">Genre</span>
                          <span className="ml-2 text-white">{meta.genre}{meta.subGenre ? ` / ${meta.subGenre}` : ''}</span>
                        </div>
                      )}
                      {meta.bpm && (
                        <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                          <span className="text-zinc-500">BPM</span>
                          <span className="ml-2 text-white font-mono">{meta.bpm}</span>
                        </div>
                      )}
                      {meta.mood && (
                        <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                          <span className="text-zinc-500">Mood</span>
                          <span className="ml-2 text-white">{meta.mood}</span>
                        </div>
                      )}
                      <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                        <span className="text-zinc-500">Vocals</span>
                        <span className="ml-2 text-white">{meta.isInstrumental ? '❌ Instrumental' : '✅ Vocal'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 닫기 */}
                <div className="flex justify-end flex-shrink-0 pt-2 border-t border-white/5">
                  <button 
                    onClick={() => setDetailItem(null)} 
                    className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white text-xs font-semibold rounded-xl transition-all"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    );
  }

  // 변종별 디자인 사양 정의
  const theme = {
    A: {
      gradient: "from-[#FFD700] via-[#FFE44D] to-[#FFA500]",
      glowColor: "rgba(255, 215, 0, 0.08)",
      subGlow: "rgba(255, 165, 0, 0.04)",
      badgeBorder: "border-[#FFD700]/20",
      badgeBg: "bg-[#FFD700]/5",
      badgeText: "text-[#FFD700]",
      ctaBg: "from-[#FFD700] to-[#FFA500]",
      shadow: "hover:shadow-[0_0_40px_rgba(255,215,0,0.25)]",
      finalCtaGlow: "rgba(255,215,0,0.06)",
    },
    B: {
      gradient: "from-[#00D4FF] via-[#3B82F6] to-[#0072FF]",
      glowColor: "rgba(0, 212, 255, 0.08)",
      subGlow: "rgba(0, 114, 255, 0.04)",
      badgeBorder: "border-[#00D4FF]/20",
      badgeBg: "bg-[#00D4FF]/5",
      badgeText: "text-[#00D4FF]",
      ctaBg: "from-[#00D4FF] to-[#0072FF]",
      shadow: "hover:shadow-[0_0_40px_rgba(0,212,255,0.25)]",
      finalCtaGlow: "rgba(0,212,255,0.06)",
    },
    C: {
      gradient: "from-[#FFB7C5] via-[#F472B6] to-[#EC4899]",
      glowColor: "rgba(255, 183, 197, 0.08)",
      subGlow: "rgba(236, 72, 153, 0.04)",
      badgeBorder: "border-[#FFB7C5]/20",
      badgeBg: "bg-[#FFB7C5]/5",
      badgeText: "text-[#FFB7C5]",
      ctaBg: "from-[#FFB7C5] to-[#EC4899]",
      shadow: "hover:shadow-[0_0_40px_rgba(255,183,197,0.25)]",
      finalCtaGlow: "rgba(255,183,197,0.06)",
    },
  }[variant];

  return (
    <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col pb-20 relative font-sans">
      {/* ━━━ HERO SECTION ━━━ */}
      <section className="relative pt-8 pb-20 px-6">
        {/* Dynamic radial glow backgrounds */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full blur-[140px] transition-all duration-700"
            style={{
              background: `radial-gradient(ellipse at center, ${theme.glowColor} 0%, transparent 70%)`,
            }}
          />
          <div
            className="absolute top-40 right-0 w-[400px] h-[400px] rounded-full blur-[100px] transition-all duration-700"
            style={{
              background: `radial-gradient(circle, ${theme.subGlow} 0%, transparent 60%)`,
            }}
          />
        </div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Version Badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${theme.badgeBorder} ${theme.badgeBg} mb-8 backdrop-blur-sm transition-all duration-500`}>
            <span className={`w-2 h-2 rounded-full bg-current ${theme.badgeText} animate-pulse`} />
            <span className={`text-sm font-semibold ${theme.badgeText} uppercase tracking-wider`}>
              {variant === "A" && "🎌 Japan Market — Early Access"}
              {variant === "B" && "⚡ Smart Autopilot — AI Worker"}
              {variant === "C" && "🌸 Japanese Aesthetic — J-Lofi & CityPop"}
            </span>
          </div>

          {/* Animating Headline and Content based on selected version */}
          <AnimatePresence mode="wait">
            <motion.div
              key={variant}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {/* HEADLINES */}
              {variant === "A" && (
                <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.1] tracking-tight">
                  <span className="text-white">세계 2위 음악 시장이</span>
                  <br />
                  <span className={`bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent`}>
                    지금 비어 있습니다.
                  </span>
                </h1>
              )}

              {variant === "B" && (
                <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.1] tracking-tight">
                  <span className="text-white">당신이 자는 동안, AI가</span>
                  <br />
                  <span className={`bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent`}>
                    일본 음악 채널을 운영합니다.
                  </span>
                </h1>
              )}

              {variant === "C" && (
                <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.1] tracking-tight">
                  <span className="text-2xl sm:text-3xl md:text-4xl block font-mono text-zinc-500 tracking-wider mb-2">
                    勉強用BGM. 夜のJazz. シティポップ.
                  </span>
                  <span className="text-white">당신이 사랑하는 일본 감성,</span>
                  <br />
                  <span className={`bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent`}>
                    이제 당신이 만드세요.
                  </span>
                </h1>
              )}

              {/* SUBHEADINGS */}
              {variant === "A" && (
                <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-light">
                  일본어 AI 음악 채널을 만드는 크리에이터가 아직 없습니다.
                  <br />
                  Melodio로 그 블루오션 자리를 먼저 선점하세요.
                </p>
              )}

              {variant === "B" && (
                <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-light">
                  프롬프트 하나만 넣으세요. J-Lofi 생성 → 영상 합성 → 유튜브 자동 업로드까지.
                  <br />
                  Melodio는 음악 채널의 모든 운영 과정을 대행합니다.
                </p>
              )}

              {variant === "C" && (
                <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-light">
                  AI가 음악을 디자인하고, 온 세상에 스트리밍합니다.
                  <br />
                  Melodio로 도쿄 카페 BGM부터 레트로 시티팝까지 다채롭게 연출해 보세요.
                </p>
              )}

              {/* SUPPORTING TEXT & FACTS */}
              {variant === "A" && (
                <div className="max-w-xl mx-auto space-y-1 py-4 border-y border-white/5 my-8">
                  <p className="text-sm text-zinc-500">영어 Lofi? Lofi Girl이 1,300만 구독자로 채널을 굳혔습니다.</p>
                  <p className="text-sm text-zinc-500">한국어 AI 음악? 이미 레드오션 경쟁이 시작되었습니다.</p>
                  <p className="text-sm text-[#FFD700]/90 font-medium">일본어 음악 채널은 — 아직 확실한 강자가 없습니다.</p>
                </div>
              )}

              {variant === "B" && (
                <div className="max-w-xl mx-auto space-y-1 py-4 border-y border-white/5 my-8">
                  <p className="text-sm text-zinc-500">음악을 하나도 작곡할 줄 몰라도 완벽히 가능합니다.</p>
                  <p className="text-sm text-zinc-500">일본어나 영어 번역을 할 줄 몰라도 자동 현지화가 작동합니다.</p>
                  <p className="text-sm text-[#00D4FF]/90 font-medium">Melodio가 백그라운드에서 교대 없이 24시간 작동합니다.</p>
                </div>
              )}

              {variant === "C" && (
                <div className="max-w-xl mx-auto space-y-1 py-4 border-y border-white/5 my-8">
                  <p className="text-sm text-zinc-500">새벽 2시 도쿄 편의점의 불빛, 비 내리는 시부야 교차로, 벚꽃 날리는 시골길 BGM.</p>
                  <p className="text-sm text-zinc-500">당신 마음 속 일본 감성 프롬프트가 즉시 하나의 유튜브 플레이리스트가 됩니다.</p>
                  <p className="text-sm text-[#FFB7C5]/90 font-medium">복잡한 영상 편집기나 디자인 툴은 전혀 켤 필요가 없습니다.</p>
                </div>
              )}


            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* ━━━ DYNAMIC SECTION (PROBLEM OR GENRE SHOWCASE) ━━━ */}
      <AnimatePresence mode="wait">
        {variant === "C" ? (
          /* VERSION C: GENRE SHOWCASE */
          <motion.section
            key="genre-showcase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="py-20 px-6 relative"
          >
            <div className="max-w-5xl mx-auto relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">당신이 사랑하는 그 장르, 전부 있습니다</h2>
              <p className="text-center text-zinc-500 mb-12 text-sm">프리셋 클릭 한 번으로 일본 감성을 완벽히 재현합니다</p>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {[
                  { emoji: "🎌", name: "J-Lofi 공부방", tag: "勉強用BGM · 集中力", desc: "잔잔한 재즈 코드 위에 빗소리와 연필 소리를 얹어 집중을 돕는 공부방 BGM.", border: "hover:border-[#3B82F6]/30", text: "group-hover:text-[#3B82F6]" },
                  { emoji: "🌃", name: "도쿄 야간 재즈", tag: "夜のJazz · カフェBGM", desc: "도쿄 네온사인 아래 울려 퍼지는 감각적인 솔로 피아노와 더블베이스 재즈 세션.", border: "hover:border-[#8B5CF6]/30", text: "group-hover:text-[#8B5CF6]" },
                  { emoji: "🌸", name: "80s 시티팝 리바이벌", tag: "シティポップ", desc: "타츠로, 마리야 스타일의 아날로그 신디사이저와 그루브 넘치는 베이스의 여름밤 감성.", border: "hover:border-[#EC4899]/30", text: "group-hover:text-[#EC4899]" },
                  { emoji: "🍵", name: "와비사비 앰비언트", tag: "眠れる BGM · 瞑想", desc: "여백과 절제의 미학. 긴장을 부드럽게 이완시키는 수면용 힐링 명상 사운드.", border: "hover:border-[#10B981]/30", text: "group-hover:text-[#10B981]" },
                  { emoji: "🌟", name: "애니 BGM 스타일", tag: "アニメBGM · 作業用", desc: "지브리의 푸른 들판, 신카이의 빛나는 하늘을 닮은 맑고 포근한 오케스트라 판타지.", border: "hover:border-[#F97316]/30", text: "group-hover:text-[#F97316]" },
                ].map((genre) => (
                  <div
                    key={genre.name}
                    className={`p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] ${genre.border} transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between group`}
                  >
                    <div>
                      <span className="text-3xl mb-4 block">{genre.emoji}</span>
                      <h3 className={`font-bold text-base text-white mb-1 ${genre.text} transition-colors`}>{genre.name}</h3>
                      <p className="text-[10px] text-zinc-500 font-mono mb-4 block">{genre.tag}</p>
                      <p className="text-xs text-zinc-400 leading-relaxed font-light">{genre.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        ) : (
          /* VERSION A & B: WHY JAPAN & PROBLEM CARD GRID */
          <motion.section
            key="why-japan"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="py-20 px-6 relative"
          >
            <div className="max-w-5xl mx-auto relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
                {variant === "A" ? "왜 지금 일본 시장인가?" : "딱 3단계로 운영되는 자동화"}
              </h2>
              <p className="text-center text-zinc-500 mb-12 text-sm">
                {variant === "A" ? "글로벌 음악 비즈니스의 비밀이 여기에 있습니다" : "기획만 하세요. 제작과 유통은 에이전트에게 맡깁니다."}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {variant === "A" ? (
                  <>
                    {/* Variant A Cards */}
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-[#FFD700]/20 transition-all duration-300">
                      <div className="w-12 h-12 rounded-xl bg-[#FFD700]/10 flex items-center justify-center mb-4">
                        <Globe className="w-6 h-6 text-[#FFD700]" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">세계 2위, 하지만 아무도 없다</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed font-light">
                        일본은 세계 2위의 독보적 음악 소비 대국입니다. 그러나 일본 로컬 타겟의 감성을 정밀 조준한 AI 유튜브 BGM 채널은 사실상 텅 비어 있습니다.
                      </p>
                    </div>
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-[#FFD700]/20 transition-all duration-300">
                      <div className="w-12 h-12 rounded-xl bg-[#FFD700]/10 flex items-center justify-center mb-4">
                        <Target className="w-6 h-6 text-[#FFD700]" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">초정밀 로컬라이징 프리셋</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed font-light">
                        일본인들이 검색하는 `勉強用BGM(공부용 BGM)`부터 `夜のJazz(밤의 재즈)`까지 현지인 취향의 키워드와 감성에 특화된 사운드 프리셋을 즉시 연동합니다.
                      </p>
                    </div>
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-[#FFD700]/20 transition-all duration-300">
                      <div className="w-12 h-12 rounded-xl bg-[#FFD700]/10 flex items-center justify-center mb-4">
                        <Coins className="w-6 h-6 text-[#FFD700]" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">수익화 달성 후 압도적 마진</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed font-light">
                        서버와 생성 툴을 유지하는 비용은 단돈 월 1.8만 원 선. 채널의 조회수 및 해외 스트리밍 정산 수익이 들어오기 시작하면 마진율은 급상승합니다.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Variant B Cards */}
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-[#00D4FF]/20 transition-all duration-300 relative overflow-hidden group">
                      <span className="absolute top-4 right-6 text-5xl font-black text-white/5 select-none font-mono">01</span>
                      <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center mb-4">
                        <Music className="w-6 h-6 text-[#00D4FF]" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">프리셋 선택 (30초)</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed font-light">
                        J-Lofi, 도쿄 야간 재즈, 시티팝 리바이벌 등 제공되는 5가지 Japan 특화 프리셋 중 하나를 고르거나 나만의 태그 조합을 생성합니다.
                      </p>
                    </div>
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-[#00D4FF]/20 transition-all duration-300 relative overflow-hidden group">
                      <span className="absolute top-4 right-6 text-5xl font-black text-white/5 select-none font-mono">02</span>
                      <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center mb-4">
                        <Bot className="w-6 h-6 text-[#00D4FF]" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">AI 원스톱 제작 (5분)</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed font-light">
                        Suno V6로 음원을 생성하고, AI 기반의 비주얼 테마와 자동 번역 메타데이터를 결합합니다.
                      </p>
                    </div>
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-[#00D4FF]/20 transition-all duration-300 relative overflow-hidden group">
                      <span className="absolute top-4 right-6 text-5xl font-black text-white/5 select-none font-mono">03</span>
                      <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/10 flex items-center justify-center mb-4">
                        <Radio className="w-6 h-6 text-[#00D4FF]" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">유튜브 오토파일럿 업로드</h3>
                      <p className="text-sm text-zinc-400 leading-relaxed font-light">
                        스케줄러 설정 한 번으로 채널 인증을 거쳐 예약된 요일과 시간에 비디오가 자동으로 게재됩니다. 채널 업로드부터 메타 세팅까지 완전 무인화됩니다.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ━━━ MIDDLE EXTRAS (STORY OR COMPARISON) ━━━ */}
      <AnimatePresence mode="wait">
        {variant === "B" && (
          /* COMPARISON TABLE FOR VERSION B */
          <motion.section
            key="comparison-table"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="py-16 px-6 bg-white/[0.01] border-y border-white/5"
          >
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4">Melodio로 전환 시 생산성 극대화</h2>
              <p className="text-center text-zinc-500 mb-10 text-xs">수동 운영과 AI 오토파일럿 비교</p>
              <div className="overflow-x-auto rounded-2xl border border-white/5 bg-zinc-950/60">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02] text-zinc-400">
                      <th className="p-4 font-semibold">비교 항목</th>
                      <th className="p-4 font-semibold">❌ 수동 크리에이터</th>
                      <th className="p-4 font-semibold text-[#00D4FF]">⚡ Melodio 오토파일럿</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-light text-zinc-300">
                    <tr>
                      <td className="p-4 font-medium text-white">음악 음원 제작</td>
                      <td className="p-4 text-zinc-500">DAW 작곡 훈련 필요 (수십 시간 소요)</td>
                      <td className="p-4">프롬프트 및 프리셋 기반 (5분 내 자동화)</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-medium text-white">커버아트 & 썸네일</td>
                      <td className="p-4 text-zinc-500">포토샵/디자이너 외주 비용 지출</td>
                      <td className="p-4">Gemini API로 테마 연계 이미지 실시간 렌더</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-medium text-white">비디오 클립 합성</td>
                      <td className="p-4 text-zinc-500">프리미어 프로 렌더링 및 편집 대기</td>
                      <td className="p-4">클라우드 FFmpeg 엔진 즉시 렌더링</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-medium text-white">외국어 메타데이터</td>
                      <td className="p-4 text-zinc-500">번역기 수동 돌린 뒤 복사 붙여넣기</td>
                      <td className="p-4 text-[#00D4FF]">일본어 제목/설명/해시태그 자동 작성</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-medium text-white">매일 업로드 관리</td>
                      <td className="p-4 text-zinc-500">유튜브 매번 로그인하여 수동 업로드</td>
                      <td className="p-4">스케줄 예약 기반 자동 백그라운드 업로드</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </motion.section>
        )}

        {variant === "C" && (
          /* CREATOR STORY FOR VERSION C */
          <motion.section
            key="creator-story"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="py-16 px-6 bg-white/[0.01] border-y border-white/5"
          >
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-2xl sm:text-3xl font-bold mb-10">음악을 몰라도, 일본어를 몰라도 감성만 있다면</h2>
              <div className="p-8 rounded-3xl bg-[#FFB7C5]/5 border border-[#FFB7C5]/10 backdrop-blur-sm relative max-w-2xl mx-auto">
                <span className="text-5xl text-[#FFB7C5]/20 font-serif absolute top-4 left-6 pointer-events-none">“</span>
                <p className="text-base sm:text-lg text-zinc-200 leading-relaxed italic font-light relative z-10 mb-6 px-4">
                  저는 일본어를 전공하지도 않았고 다룰 수 있는 악기도 전혀 없습니다. 하지만 시티팝 특유의 감성을 정말 좋아해 왔죠. Melodio로 30년대풍 레트로 시티팝 채널을 빌딩한 지 약 3개월 만에 유튜브 채널 조회수가 급증해 꿈꾸던 수익화를 달성했습니다.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs border border-white/10">
                    JP
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">K. Min-seok</p>
                    <p className="text-[10px] text-zinc-500">Melodio Lofi/CityPop 크리에이터</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ━━━ FEATURES SUMMARY (8 STAGES PIPELINE) ━━━ */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">일본 채널 운영의 전부를 처리합니다</h2>
          <p className="text-center text-zinc-500 mb-12 text-sm">기획부터 유통까지 하나의 시스템으로 자동 연계</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: Music,
                title: "Japan 특화 고정밀 프리셋 제공",
                desc: "공부방 BGM(勉強 BGM), 도쿄 Jazz, 시티팝 등 현지 시청자들을 정확하게 타겟팅하는 태그셋 사전 탑재.",
              },
              {
                icon: Bot,
                title: "Suno V6 음원 생성",
                desc: "일본 채널에 맞춘 프리셋과 스타일 태그를 Suno V6 음원 생성에 적용합니다.",
              },
              {
                icon: Video,
                title: "비디오 합성 및 유튜브 즉시 배포",
                desc: "고품질의 AI 일러스트와 음원을 비디오로 병합하고, 일본어로 현지화된 메타 태그를 생성해 유튜브 자동 배포.",
              },
              {
                icon: Radio,
                title: "글로벌 150여 개 플랫폼 유통 지원",
                desc: "유튜브 스트리밍 수익 외에 Spotify Japan, Apple Music에 음원을 즉각 유통시켜 추가 스트리밍 인세 확보.",
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="flex items-start gap-4 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center shrink-0 mt-0.5">
                  <feat.icon className={`w-5 h-5 ${theme.badgeText} transition-all duration-500`} />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-1">{feat.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed font-light">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ NUMBERS & METRICS ━━━ */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">숫자로 검증된 비즈니스 가치</h2>
          <p className="text-center text-zinc-500 mb-12 text-sm">시장 규모와 수익성 데이터</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: "$1.5 ~ $2.5", label: "유튜브 1,000뷰당 수익", sub: "RPM 기준" },
              { value: "3 ~ 6개월", label: "채널 평균 수익화 달성", sub: "YPP 달성율 92%" },
              { value: "₩18,000", label: "월 채널 유지 비용", sub: "Melodio 플랜 기준" },
              { value: "5분 이내", label: "첫 음원 비디오 렌더링", sub: "클라우드 렌더" },
            ].map((stat) => (
              <div key={stat.label} className="text-center p-6 rounded-2xl bg-white/[0.01] border border-white/[0.05]">
                <p className={`text-2xl sm:text-3xl font-black bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent mb-1 transition-all duration-500`}>
                  {stat.value}
                </p>
                <p className="text-xs text-zinc-400 mb-0.5">{stat.label}</p>
                <span className="text-[10px] text-zinc-600 font-mono">{stat.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ PRICING SECTION ━━━ */}
      <section className="py-20 px-6 relative">
        <div className="max-w-4xl mx-auto relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">커피 한 잔 비용으로 채널을 소유하세요</h2>
          <p className="text-center text-zinc-500 mb-12 text-sm">투명한 요금제 구성</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free Plan */}
            <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/[0.05] flex flex-col justify-between">
              <div>
                <p className="text-sm text-zinc-500 mb-1">Free</p>
                <p className="text-3xl font-black text-white mb-4">₩0</p>
                <ul className="space-y-3 text-sm text-zinc-400 mb-6 font-light">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> 월 5곡 무료 생성
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Japan 프리셋 2종 체험
                  </li>
                  <li className="flex items-center gap-2 text-zinc-600">
                    <X className="w-4 h-4" /> 자동 업로드 기능 제외
                  </li>
                  <li className="flex items-center gap-2 text-zinc-600">
                    <X className="w-4 h-4" /> 글로벌 음원 유통 제외
                  </li>
                </ul>
              </div>
              <Link
                href={user ? "/audio" : "/login?next=/japan"}
                className="block text-center py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
              >
                무료 시작하기
              </Link>
            </div>

            {/* Pro Plan */}
            <div className={`p-6 rounded-2xl bg-white/[0.01] border-2 border-opacity-40 transition-all duration-500 relative flex flex-col justify-between shadow-[0_0_30px_rgba(255,255,255,0.01)]`}
              style={{ borderColor: variant === "A" ? "#FFD700" : variant === "B" ? "#00D4FF" : "#FFB7C5" }}
            >
              <span className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold text-black bg-gradient-to-r ${theme.gradient} transition-all duration-500`}>
                가장 인기
              </span>
              <div>
                <p className={`text-sm font-semibold ${theme.badgeText} mb-1 transition-all duration-500`}>💎 Pro</p>
                <p className="text-3xl font-black text-white mb-1">
                  $9.99
                  <span className="text-sm font-normal text-zinc-500">/월</span>
                </p>
                <p className={`text-xs ${theme.badgeText} opacity-70 mb-4 transition-all duration-500`}>첫 달 50% 즉시 할인</p>
                <ul className="space-y-3 text-sm text-zinc-300 mb-6 font-light">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> 월 100곡 생성 크레딧
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Japan 프리셋 5종 전체 개방
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> Suno V6 음원 생성
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> 월 20곡 주요 음원 유통
                  </li>
                </ul>
              </div>
              <Link
                href={user ? "/audio" : "/login?next=/japan"}
                className={`block text-center py-3 rounded-xl bg-gradient-to-r ${theme.ctaBg} text-black font-bold hover:opacity-90 transition-all`}
              >
                Pro 플랜 적용
              </Link>
            </div>

            {/* Business Plan */}
            <div className="p-6 rounded-2xl bg-white/[0.01] border border-white/[0.05] flex flex-col justify-between">
              <div>
                <p className="text-sm text-zinc-500 mb-1">🚀 Business</p>
                <p className="text-3xl font-black text-white mb-4">
                  $29.99
                  <span className="text-sm font-normal text-zinc-500">/월</span>
                </p>
                <ul className="space-y-3 text-sm text-zinc-400 mb-6 font-light">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> 월 500곡 생성 크레딧
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> 유튜브 자동 스케줄링 예약
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> 무제한 음원 플랫폼 유통
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" /> B2B 1시간 논스톱 루핑
                  </li>
                </ul>
              </div>
              <Link
                href={user ? "/audio" : "/login?next=/japan"}
                className="block text-center py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors"
              >
                Business 시작하기
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ FINAL CTA SECTION ━━━ */}
      <section className="py-28 px-6 text-center relative border-t border-white/5">
        <div
          className="absolute inset-0 blur-[120px] transition-all duration-700 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, ${theme.finalCtaGlow} 0%, transparent 60%)`,
          }}
        />
        <div className="max-w-3xl mx-auto relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={variant}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {variant === "A" && (
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-6 leading-tight">
                  1년 후, 당신은 두 가지 중 하나입니다.
                  <br />
                  <span className="text-zinc-500">&quot;그때 시작할걸&quot;</span> — 혹은 —
                  <br />
                  <span className={`bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent`}>
                    &quot;그때 시작하길 잘했다&quot;
                  </span>
                </h2>
              )}

              {variant === "B" && (
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-6 leading-tight">
                  일본 채널 선점의 골든타임,
                  <br />
                  <span className="text-zinc-500">지금 안 시작하면</span> 다음 달엔
                  <br />
                  <span className={`bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent`}>
                    무조건 후회하게 됩니다.
                  </span>
                </h2>
              )}

              {variant === "C" && (
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-6 leading-tight">
                  당신 마음 속 깊은 일본의 감성이
                  <br />
                  <span className="text-zinc-500">온 세상 누군가의 플레이리스트로</span>
                  <br />
                  <span className={`bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent`}>
                    재탄생할 차례입니다.
                  </span>
                </h2>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-col items-center gap-3 mt-10">
            <Link
              href={user ? "/audio" : "/login?next=/japan"}
              className={`group inline-flex items-center gap-3 px-10 py-5 rounded-2xl bg-gradient-to-r ${theme.ctaBg} text-black font-bold text-lg transition-all duration-300 ${theme.shadow} hover:scale-105`}
            >
              {variant === "A" && "🎌 일본 채널 지금 시작하기 — 무료"}
              {variant === "B" && "⚡ 무료로 채널 자동화 체험하기"}
              {variant === "C" && "🌸 일본 감성 채널 시작하기"}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <span className="text-xs text-zinc-500">
              {variant === "A" && "신용카드 요구 없음 · 5분 안에 첫 트랙 완성"}
              {variant === "B" && "5분 원클릭 세팅 · 무료 크레딧 제공"}
              {variant === "C" && "가입 즉시 첫 트랙 5분 완성 · 무료 체험"}
            </span>
          </div>
        </div>
      </section>

      {/* ━━━ FOOTER ━━━ */}
      <footer className="border-t border-white/5 py-10 px-6 bg-zinc-950/20">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎵</span>
            <span className={`font-bold bg-gradient-to-r ${theme.gradient} bg-clip-text text-transparent transition-all duration-500`}>
              Melodio
            </span>
            <span className="text-xs text-zinc-600 ml-2">Global AI Music Label SaaS</span>
          </div>
          <p className="text-xs text-zinc-600">© 2026 Melodio. All rights reserved.</p>
        </div>
      </footer>

      {/* ━━━ A/B/C VARIANT CONTROLLER (REVIEW & DEVELOPER CONSOLE) ━━━ */}
      <PresetSamplePlayer controller={samplePlayer} />
      {samplePlayer.current && <div className="h-20" aria-hidden="true" />}
      <div className={`fixed ${samplePlayer.current ? 'bottom-20' : 'bottom-6'} right-6 z-50 p-2 rounded-2xl bg-zinc-900/90 border border-white/10 backdrop-blur-xl flex flex-col gap-2 shadow-2xl items-center`}>
        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest px-2 pt-1">
          A/B Test View
        </span>
        <div className="flex gap-1">
          {(["A", "B", "C"] as Variant[]).map((v) => (
            <button
              key={v}
              onClick={() => handleVariantChange(v)}
              className={`w-9 h-9 rounded-xl font-black text-sm flex items-center justify-center transition-all ${
                variant === v
                  ? "bg-white text-black shadow-lg"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
