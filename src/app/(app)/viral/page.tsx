"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Zap, Check, Play, Pause, Download,
  Search, Flame, RefreshCw, FileText, Settings,
  Music4, Mic, Clock, ChevronDown, Volume2, AlertTriangle, Shield,
  ArrowRight, BookOpen, User, Smile, Tv, TrendingUp, History, Users,
  Lightbulb, Wand2, ScrollText, Mic2, ChevronRight, ChevronLeft,
  VolumeX, X, Lock, ThumbsUp, ThumbsDown, Heart, LayoutGrid, Link,
  Shuffle, SkipBack, SkipForward, Repeat, Video, Film, Dog, Baby, Utensils, Ghost, RotateCcw, Cpu
} from "lucide-react";
import { registerActiveAudio } from "@/lib/globalAudio";
import PublicTrackGrid from "@/components/prompt-builder/PublicTrackGrid";

// 커스텀 유튜브 아이콘 SVG
function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

// 카테고리별 SVG 아이콘
function TrendIcon({ className }: { className?: string }) {
  return <TrendingUp className={className} />;
}
function HistoryIcon({ className }: { className?: string }) {
  return <History className={className} />;
}
function HumanIcon({ className }: { className?: string }) {
  return <Users className={className} />;
}

interface Concept {
  id: string | number;
  title: string;
  genre: string;
  styleName: string;
  source: string;
  visual: string;
  suggestedTags: string[];
  tab_type: string;
  created_date?: string;
  thumbnail_url?: string;
  audio_url?: string;
}

// ── 썸네일 이미지 매퍼 ────────────────────────────────────────────────────────
const CONCEPT_THUMBNAIL_MAP: Record<string, string> = {
  'trend-var':       'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&q=80',
  'trend-yoajeong':  'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80',
  'trend-ai-finger': 'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=400&q=80',
  'trend-algorithm': 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=80',
  'history-sunshin': 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&q=80',
  'history-jeongjo': 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&q=80',
  'history-saimdang':'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=400&q=80',
  'history-sejong':  'https://images.unsplash.com/photo-1555421689-d68471e189f2?w=400&q=80',
  'human-study-cafe':'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&q=80',
  'human-instagram': 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=400&q=80',
  'human-monday':    'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=400&q=80',
  'human-mbti':      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&q=80',
};

const CATEGORY_THUMBNAIL_MAP: Record<string, string> = {
  challenge: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
  relationship: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=400&q=80',
  trend: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=80',
  history: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&q=80',
  human: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=400&q=80',
  brand: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80',
  drama: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&q=80',
  pet: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80',
};

const CATEGORY_TITLES: Record<string, string> = {
  drama: "K-드라마 명대사",
  pet: "댕냥이 집사속마음",
  relationship: "연애·남녀심리",
  human: "현대인·직장인",
  trend: "트렌드·이슈",
  challenge: "도파민 응원",
  brand: "B급 광고",
  history: "역사 부캐",
  parenting: "육아·잼민이 월드",
  food_diet: "야식·다이어트",
  horror_mystery: "이불킥·흑역사",
  ai_future: "AI·미래 판타지",
};

// 카테고리별 폴백 그라데이션 배경
const CATEGORY_FALLBACK: Record<string, { gradient: string; icon: React.ReactNode }> = {
  drama:   { gradient: 'from-purple-900/80 to-indigo-900/60', icon: <Film className="w-8 h-8 text-purple-300/70" /> },
  pet:     { gradient: 'from-orange-900/80 to-amber-900/60', icon: <Dog className="w-8 h-8 text-orange-300/70" /> },
  relationship: { gradient: 'from-rose-900/80 to-pink-900/60', icon: <Heart className="w-8 h-8 text-rose-300/70" /> },
  human:   { gradient: 'from-emerald-900/80 to-teal-900/60', icon: <Users className="w-8 h-8 text-emerald-300/70" /> },
  trend:   { gradient: 'from-red-900/80 to-orange-900/60', icon: <TrendingUp className="w-8 h-8 text-red-300/70" /> },
  challenge: { gradient: 'from-cyan-900/80 to-blue-900/60', icon: <Flame className="w-8 h-8 text-cyan-300/70" /> },
  brand:   { gradient: 'from-fuchsia-900/80 to-pink-900/60', icon: <Tv className="w-8 h-8 text-fuchsia-300/70" /> },
  history: { gradient: 'from-amber-900/80 to-yellow-900/60', icon: <History className="w-8 h-8 text-amber-300/70" /> },
  parenting: { gradient: 'from-yellow-900/80 to-amber-900/60', icon: <Baby className="w-8 h-8 text-yellow-300/70" /> },
  food_diet: { gradient: 'from-emerald-900/80 to-green-900/60', icon: <Utensils className="w-8 h-8 text-emerald-300/70" /> },
  horror_mystery: { gradient: 'from-indigo-900/80 to-purple-900/60', icon: <Ghost className="w-8 h-8 text-indigo-300/70" /> },
  ai_future: { gradient: 'from-sky-900/80 to-cyan-900/60', icon: <Cpu className="w-8 h-8 text-sky-300/70" /> },
};

function getConceptThumbnail(concept: Concept): { url: string; isStatic: boolean } {
  if (concept.thumbnail_url) return { url: concept.thumbnail_url, isStatic: false };
  const mapped = CONCEPT_THUMBNAIL_MAP[concept.id.toString()];
  if (mapped) return { url: mapped, isStatic: true };
  const catMapped = CATEGORY_THUMBNAIL_MAP[concept.tab_type];
  if (catMapped) return { url: catMapped, isStatic: true };
  return { url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80', isStatic: true };
}

// 카테고리 설정 (높은 이용도/떡상 예상순 배치)
const CATEGORY_CONFIG = {
  drama: {
    label: 'K-드라마 명대사',
    icon: <Film className="w-3 h-3" />,
    color: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
    glowColor: 'bg-purple-500/10',
  },
  pet: {
    label: '댕냥이 집사속마음',
    icon: <Dog className="w-3 h-3" />,
    color: 'text-orange-400 border-orange-500/20 bg-orange-500/10',
    glowColor: 'bg-orange-500/10',
  },
  relationship: {
    label: '연애·남녀심리',
    icon: <Heart className="w-3 h-3" />,
    color: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
    glowColor: 'bg-rose-500/10',
  },
  human: {
    label: '현대인·직장인',
    icon: <Users className="w-3 h-3" />,
    color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
    glowColor: 'bg-emerald-500/10',
  },
  trend: {
    label: '트렌드·이슈',
    icon: <TrendingUp className="w-3 h-3" />,
    color: 'text-red-400 border-red-500/20 bg-red-500/10',
    glowColor: 'bg-red-500/10',
  },
  challenge: {
    label: '도파민 응원',
    icon: <Flame className="w-3 h-3" />,
    color: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10',
    glowColor: 'bg-cyan-500/10',
  },
  brand: {
    label: 'B급 광고',
    icon: <Tv className="w-3 h-3" />,
    color: 'text-fuchsia-400 border-fuchsia-500/20 bg-fuchsia-500/10',
    glowColor: 'bg-fuchsia-500/10',
  },
  history: {
    label: '역사 부캐',
    icon: <History className="w-3 h-3" />,
    color: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
    glowColor: 'bg-amber-500/10',
  },
  parenting: {
    label: '육아·잼민이 월드',
    icon: <Baby className="w-3 h-3" />,
    color: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
    glowColor: 'bg-yellow-500/10',
  },
  food_diet: {
    label: '야식·다이어트',
    icon: <Utensils className="w-3 h-3" />,
    color: 'text-green-400 border-green-500/20 bg-green-500/10',
    glowColor: 'bg-green-500/10',
  },
  horror_mystery: {
    label: '이불킥·흑역사',
    icon: <Ghost className="w-3 h-3" />,
    color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10',
    glowColor: 'bg-indigo-500/10',
  },
  ai_future: {
    label: 'AI·미래 판타지',
    icon: <Cpu className="w-3 h-3" />,
    color: 'text-sky-400 border-sky-500/20 bg-sky-500/10',
    glowColor: 'bg-sky-500/10',
  },
};

// 풍자곡 특화 장르 & 무드 매핑
const VIRAL_GENRE_OPTIONS = [
  "K-Pop 댄스",
  "힙합/디스곡",
  "시티팝/레트로",
  "애니 OST/락",
  "펑크/디스코",
  "펑크 락",
  "테크/사이버펑크"
];

const VIRAL_GENRE_PROMPT_MAP: Record<string, string> = {
  "K-Pop 댄스": "K-pop dance, 135 BPM, catchy hook, clear diction, crisp vocals, bright synthesizer",
  "힙합/디스곡": "Hip-hop, Trap, Fast-paced, 140 BPM, aggressive rap vocals, punchy drums, heavy bassline",
  "시티팝/레트로": "Synth-pop, Retro Wave, 125 BPM, comical vocals, 80s synthesizer, groovy",
  "애니 OST/락": "J-Pop Rock, Anime OST Style, 150 BPM, fast-paced, high energy, crisp vocals, distorted guitar",
  "펑크/디스코": "Funk, Disco, 120 BPM, groovy bassline, sarcastic vocals, upbeat, brass",
  "펑크 락": "Punk Rock, 140 BPM, raw energetic vocals, rebellious, clear diction, fast drums",
  "테크/사이버펑크": "Cyberpunk, Dark Synth, 130 BPM, robotic vocals, futuristic, electronic"
};

const VIRAL_MOOD_OPTIONS = [
  "Comical (코믹한)",
  "Sarcastic (풍자적인)",
  "Raw (날것의)",
  "Rebellious (반항적인)",
  "High Energy (에너지 넘치는)"
];

const VOCAL_OPTIONS = [
  { label: '밝은 여성 보컬', value: 'Bright Female Vocal' },
  { label: '부드러운 남성 보컬', value: 'Smooth Male Vocal, Baritone' },
  { label: '속삭이는 보컬 (ASMR)', value: 'Whisper Vocal, ASMR Voice' },
  { label: '거친 남성 보컬', value: 'Raspy Male Vocal, Gritty' },
  { label: '오토튠 보컬', value: 'Auto-Tune Vocal' },
  { label: '말하듯 노래하는 보컬 (Talk-Sung)', value: 'Talk-Sung, Spoken Word, Comical Narrative Vocal' },
  { label: '떼창 / 군중 보컬 (Group Chant)', value: 'Group Chant, Gang Vocals, Comical Chorus' },
  { label: '하이피치 밈 보컬 (Sped-Up)', value: 'High-pitched Cute Vocal, Sped-up Vocal, Chipmunk Voice' },
  { label: '인스트루멘탈 (보컬 없음)', value: 'Instrumental, No Vocals' }
];

const DURATION_OPTIONS = [
  { value: '15s', label: '15초 (초고속 후킹)' },
  { value: '20s', label: '20초' },
  { value: '30s', label: '30초 (표준 쇼츠)' },
  { value: '40s', label: '40초' },
  { value: '50s', label: '50초' },
  { value: '60s', label: '60초 (최대 분량)' }
];

const REAL_VIRAL_AUDIO_POOL = [
  'https://file.302.ai/gpt/imgs/20260722/32faef5d727f4c629523c0489c4f38d3.mp3', // 14s (도파민 충전 응원 챌린지송)
  'https://file.302.ai/gpt/imgs/20260721/846366722c5740689ce76d827b7f8083.mp3', // 26s (연애/남녀 심리 챌린지송)
  'https://file.302.ai/gpt/imgs/20260721/80c471b756dc4fc397daa5ad1b45bbd2.mp3', // 31s (역사 부캐 챌린지송)
  'https://file.302.ai/gpt/imgs/20260721/6b6b16e458a284549c23450e69b74b75.mp3', // 29.76s (아이폰 액정 박살 슬픔송)
  'https://file.302.ai/gpt/imgs/20260721/ff29bbfec047fcfcec08931f70e87563.mp3', // 26s (불닭 맵부심)
  'https://file.302.ai/gpt/imgs/20260718/62b8cb433faaad367e7547359bb6e13e.mp3', // 35.48s (요아정 탕진송)
  'https://file.302.ai/gpt/imgs/20260718/df79d06f7ae9100ad458963bd5e12e9c.mp3', // 29.76s (MBTI 과몰입러)
  'https://file.302.ai/gpt/imgs/20260718/4155ed293d783d10902141538ffae20c.mp3', // 31.8s (신사임당 탈출기)
  'https://file.302.ai/gpt/imgs/20260718/22a4290de549176bfbc90b18bbd6dcf2.mp3', // 44.24s (월드컵 오심 저격송)
  'https://file.302.ai/gpt/imgs/20260718/e2682872c1fc205d87086abae9063d0e.mp3', // 44s (이순신 장군 하소연)
  'https://file.302.ai/gpt/imgs/20260718/1a66dc942e9dd3bad8a28ae8a3a6c700.mp3', // 44.2s (카공족 vs 사장님)
  'https://file.302.ai/gpt/imgs/20260717/c41c7e2e1f79854b5d181ecac199d4d1.mp3', // 44.72s (정조대왕 팩폭)
  'https://file.302.ai/gpt/imgs/20260709/c8b6bfb45fa72bcefca74f3ffb51d4c6.mp3'  // 24.48s (코인/주식 고점 지표)
];

const VIRAL_SHOWCASE_TRACKS = [
  {
    id: "viral-omg",
    title: "OMG 2.0",
    centerCaption: "OMG 2.0",
    userName: "Jacob Allan",
    audioUrl: REAL_VIRAL_AUDIO_POOL[0],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-in-front-of-a-store-40545-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop",
    tags: "viral trap, heavy 808 bass, omg chant, punchy drums"
  },
  {
    id: "viral-chidori",
    title: "千鳥",
    centerCaption: "千鳥",
    userName: "KAYA",
    audioUrl: REAL_VIRAL_AUDIO_POOL[1],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-dj-playing-music-at-a-club-42283-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=600&auto=format&fit=crop",
    tags: "japanese lofi arpeggios, soft bells, chillhop beat"
  },
  {
    id: "viral-money",
    title: "Money for my son 💸",
    centerCaption: "You received a message from your son asking for money",
    userName: "Barol Beats",
    audioUrl: REAL_VIRAL_AUDIO_POOL[2],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-neon-sign-of-a-pizza-slice-40546-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?q=80&w=600&auto=format&fit=crop",
    tags: "comical narrative hip-hop, bouncy bass, ding effect"
  },
  {
    id: "viral-girlfriend",
    title: "Whole Day",
    centerCaption: "TURNED MY MANIPULATIVE GIRLFRIEND'S TEXT INTO AN EMO SONG",
    userName: "oceanfigo",
    audioUrl: REAL_VIRAL_AUDIO_POOL[3],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-man-dancing-under-neon-lights-40549-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1515002246390-7bf7e8f87b54?q=80&w=600&auto=format&fit=crop",
    tags: "emo rock, distorted guitars, emotional shouting vocals"
  },
  {
    id: "viral-fan",
    title: "I am your fan",
    centerCaption: "안녕하세요\nannyeonghaseyo",
    userName: "korean_hamin",
    audioUrl: REAL_VIRAL_AUDIO_POOL[4],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-pianist-playing-the-piano-40573-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=600&auto=format&fit=crop",
    tags: "korean study beat, cute synthesizers, 95 BPM"
  },
  {
    id: "viral-react",
    title: "Don't react",
    centerCaption: "Turning my situation's 'don't react' texts into a dramatic pop song",
    userName: "Lidell",
    audioUrl: REAL_VIRAL_AUDIO_POOL[5],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-guitarist-playing-an-acoustic-guitar-42261-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=600&auto=format&fit=crop",
    tags: "dramatic synth pop, intense reverb, heavy vocal doubling"
  },
  {
    id: "viral-paycheck",
    title: "Paycheck Gone",
    centerCaption: "My bank account after paying rent and buying one coffee",
    userName: "BrokeBoi",
    audioUrl: REAL_VIRAL_AUDIO_POOL[6],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-spinning-vinyl-record-on-a-turntable-40575-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=600&auto=format&fit=crop",
    tags: "comical lofi hiphop, sad brass horn, acoustic guitar"
  },
  {
    id: "viral-ghosted",
    title: "Left on Read 👻",
    centerCaption: "Saw them active 2 minutes ago but reply is nowhere to be found",
    userName: "GhostBuster",
    audioUrl: REAL_VIRAL_AUDIO_POOL[7],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-womans-feet-walking-on-rainy-streets-40544-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop",
    tags: "rnb soul, emotional female vocal, deep bass"
  },
  {
    id: "viral-monday",
    title: "Monday Alarm Sucks",
    centerCaption: "The 6:00 AM alarm sound triggers my fight or flight response",
    userName: "Overworked",
    audioUrl: REAL_VIRAL_AUDIO_POOL[8],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-coffee-cup-with-steam-rising-40578-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=600&auto=format&fit=crop",
    tags: "heavy metal punk, screaming vocals, fast drums"
  },
  {
    id: "viral-diet-fail",
    title: "Salad is a Lie 🥗",
    centerCaption: "Ate one piece of lettuce, time to reward myself with a family size pizza",
    userName: "FoodieJunkie",
    audioUrl: REAL_VIRAL_AUDIO_POOL[9],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-neon-sign-of-a-pizza-slice-40546-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=600&auto=format&fit=crop",
    tags: "funky disco pop, cheerful brass, groovy slap bass"
  },
  {
    id: "viral-wifi",
    title: "No Signal Panic",
    centerCaption: "When the Wi-Fi drops for 5 seconds and I have to face reality",
    userName: "NetAddict",
    audioUrl: REAL_VIRAL_AUDIO_POOL[10],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-man-dancing-under-neon-lights-40549-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop",
    tags: "glitch hop synth, frantic beat, electronic FX"
  },
  {
    id: "viral-gym",
    title: "Pre-Workout Rage",
    centerCaption: "When the pre-workout kicks in but you're still stuck in traffic",
    userName: "Iron Lifter",
    audioUrl: REAL_VIRAL_AUDIO_POOL[11],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-in-front-of-a-store-40545-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=600&auto=format&fit=crop",
    tags: "cyberpunk gym electronic, heavy growl bass, 130 BPM"
  },
  {
    id: "viral-cooking",
    title: "Microwave Gourmet",
    centerCaption: "Burnt my instant ramen but still calling it fine dining",
    userName: "Gordon R.",
    audioUrl: REAL_VIRAL_AUDIO_POOL[12],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-coffee-cup-with-steam-rising-40578-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=600&auto=format&fit=crop",
    tags: "lofi acoustic satire, funny whistle, casual beats"
  },
  {
    id: "viral-crypto",
    title: "Buy the Dip",
    centerCaption: "Bought the dip but it kept dipping all the way to the core",
    userName: "HODL King",
    audioUrl: REAL_VIRAL_AUDIO_POOL[0],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-spinning-vinyl-record-on-a-turntable-40575-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?q=80&w=600&auto=format&fit=crop",
    tags: "hyperpop crash, dramatic glitch beats, pitched vocals"
  },
  {
    id: "viral-cat",
    title: "Zoomies at 3AM",
    centerCaption: "My cat running at the speed of sound for absolutely no reason",
    userName: "Meow Mix",
    audioUrl: REAL_VIRAL_AUDIO_POOL[1],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-man-dancing-under-neon-lights-40549-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=600&auto=format&fit=crop",
    tags: "bouncy house, cat meow sound effects, upbeat groove"
  },
  {
    id: "viral-shopping",
    title: "Cart Abandoner",
    centerCaption: "Adding $500 of items to cart just to close the tab",
    userName: "Shop Addict",
    audioUrl: REAL_VIRAL_AUDIO_POOL[2],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-neon-sign-of-a-pizza-slice-40546-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=600&auto=format&fit=crop",
    tags: "indie pop electro, sassy female narration, retail therapy"
  },
  {
    id: "viral-coffee",
    title: "Liquid Sanity",
    centerCaption: "Do not speak to me before I consume my daily black coffee",
    userName: "Caffeine Addict",
    audioUrl: REAL_VIRAL_AUDIO_POOL[3],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-coffee-cup-with-steam-rising-40578-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=600&auto=format&fit=crop",
    tags: "chill jazz lofi, smooth rhodes keys, coffee ambient"
  },
  {
    id: "viral-travel",
    title: "Gate Delays",
    centerCaption: "Waiting 6 hours at the airport gate with overpriced snacks",
    userName: "Wanderlust",
    audioUrl: REAL_VIRAL_AUDIO_POOL[4],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-womans-feet-walking-on-rainy-streets-40544-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600&auto=format&fit=crop",
    tags: "melodic house trance, ambient airport sounds, deep bass"
  },
  {
    id: "viral-diet",
    title: "Cheat Day Confessions",
    centerCaption: "Telling myself salad counts when it's covered in bacon and cheese",
    userName: "Diet Tomorrow",
    audioUrl: REAL_VIRAL_AUDIO_POOL[5],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-neon-sign-of-a-pizza-slice-40546-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?q=80&w=600&auto=format&fit=crop",
    tags: "funk disco pop, comical brass horn, danceable rhythm"
  },
  {
    id: "viral-sleep",
    title: "One More Scroll",
    centerCaption: "Just one more video at 2 AM and now the sun is rising",
    userName: "Insomniac",
    audioUrl: REAL_VIRAL_AUDIO_POOL[6],
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-in-front-of-a-store-40545-large.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1511295742364-92767fa62d9f?q=80&w=600&auto=format&fit=crop",
    tags: "chillwave synthpop, nostalgic pads, soft clock ticking"
  }
];

export default function ViralTrendZonePage() {
  const searchParams = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<'all' | 'trend' | 'history' | 'human' | 'brand' | 'challenge' | 'relationship'>('all');

  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const availableDates = Array.from(
    new Set(concepts.map((c: any) => c.created_date).filter(Boolean))
  ).sort((a: any, b: any) => b.localeCompare(a)) as string[];

  const [genCategory, setGenCategory] = useState<string>('challenge');
  const [searchTerm, setSearchTerm] = useState("");

  // ─── 5-Step Linear Flow Progress ───
  // Step 1: 카테고리 선택 (genCategory)
  // Step 2: 사운드 스타일 (selectedGenre + selectedMood + selectedVocal)
  // Step 3: 상황 설정 & AI 기획 (customTopic + optimizedPrompt)
  // Step 4: 가사 확인 & 음원 생성 (customLyrics + generatedResult)
  // Step 5: AI 영상 생성 (grokVideoResult)

  const [selectedGenre, setSelectedGenre] = useState(VIRAL_GENRE_OPTIONS[0]);
  const [selectedMood, setSelectedMood] = useState(VIRAL_MOOD_OPTIONS[0]);
  const [selectedVocal, setSelectedVocal] = useState(VOCAL_OPTIONS[0].value);
  const [duration, setDuration] = useState('30s');

  const [brandName, setBrandName] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [customLyrics, setCustomLyrics] = useState("");
  const [optimizedPrompt, setOptimizedPrompt] = useState("");

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [autoTuneFlash, setAutoTuneFlash] = useState(false);

  const handleAutoTuneShortsSound = () => {
    const presetPairs = [
      { genre: "K-Pop 댄스", mood: "Comical (코믹한)", vocal: "Bright Female Vocal" },
      { genre: "힙합/디스곡", mood: "Raw (날것의)", vocal: "Auto-Tune Vocal" },
      { genre: "펑크/디스코", mood: "Sarcastic (풍자적인)", vocal: "Talk-Sung, Spoken Word, Comical Narrative Vocal" },
      { genre: "테크/사이버펑크", mood: "High Energy (에너지 넘치는)", vocal: "Group Chant, Gang Vocals, Comical Chorus" },
      { genre: "애니 OST/락", mood: "Rebellious (반항적인)", vocal: "High-pitched Cute Vocal, Sped-up Vocal, Chipmunk Voice" },
    ];
    const picked = presetPairs[Math.floor(Math.random() * presetPairs.length)];
    setSelectedGenre(picked.genre);
    setSelectedMood(picked.mood);
    setSelectedVocal(picked.vocal);

    setAutoTuneFlash(true);
    setTimeout(() => setAutoTuneFlash(false), 2000);
  };

  // AI Producer Brief States
  const [producerBrief, setProducerBrief] = useState<{ title: string; hook: string; lyrics: string } | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [briefCredits, setBriefCredits] = useState<number | null>(3);

  // Load and reset brief credits daily
  useEffect(() => {
    // ♾️ 엔터프라이즈 / Pro 요금제 및 전 유저 무제한 허용
    localStorage.setItem('melodio_brief_credits', '9999');
    setBriefCredits(9999);
  }, []);

  const handleGenerateProducerBrief = async () => {
    setIsGeneratingBrief(true);
    try {
      const response = await fetch('/api/viral-cf/producer-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: genCategory })
      });
      
      const data = await response.json();
      if (data.success && data.brief) {
        setProducerBrief(data.brief);
        setBriefCredits(9999);
        localStorage.setItem('melodio_brief_credits', '9999');
      } else {
        alert("브리프 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch (err) {
      console.error(err);
      alert("브리프 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingBrief(false);
    }
  };
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [generatedResult, setGeneratedResult] = useState<any>(null);

  const [isPublic, setIsPublic] = useState(true);
  const [showTerms, setShowTerms] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingTrackObj, setPlayingTrackObj] = useState<any>(null);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
  const [dislikedSongs, setDislikedSongs] = useState<Set<string>>(new Set());
  const [isPro, setIsPro] = useState<boolean>(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 13;
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [copiedLinkTrackId, setCopiedLinkTrackId] = useState<string | null>(null);

  const viralScrollRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // Reset pagination when search, date, or category filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDate, activeCategory]);

  // Check Pro Status on mount
  useEffect(() => {
    async function checkProStatus() {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('stripe_customer_id')
            .eq('id', user.id)
            .single();
          setIsPro(!!profile?.stripe_customer_id);
        }
      } catch (err) {
        console.error('Failed to check pro status:', err);
      }
    }
    checkProStatus();
  }, []);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Unified currentPlayingTrack useMemo
  const currentPlayingTrack = useMemo<any>(() => {
    if (!playingId) return null;
    if (playingId === 'generated') {
      return {
        id: 'generated',
        title: generatedResult?.title || 'Generated Track',
        genre: selectedGenre,
        vocal: selectedVocal,
        userName: brandName || 'My AI Channel',
        thumbnailUrl: generatedResult?.thumbnailUrl || CATEGORY_THUMBNAIL_MAP[genCategory] || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
        audioUrl: generatedResult?.audioUrl,
        tags: optimizedPrompt || 'viral short-form, catchy, dopamine mix'
      };
    }
    if (playingTrackObj && String(playingTrackObj.id) === String(playingId)) {
      return playingTrackObj;
    }
    const foundShowcase = VIRAL_SHOWCASE_TRACKS.find(t => String(t.id) === String(playingId));
    if (foundShowcase) return foundShowcase;

    return {
      id: playingId,
      title: 'Viral Dopamine Anthem',
      audioUrl: '',
      thumbnailUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
      userName: 'Melodio Viral',
      genre: 'Viral Trend',
      tags: 'TikTok, Shorts, Reels'
    };
  }, [playingId, playingTrackObj, generatedResult, selectedGenre, selectedVocal, brandName, genCategory, optimizedPrompt]);

  // Grok 30-sec Video Studio States
  const [autoGrokVideo, setAutoGrokVideo] = useState(false);
  const [availableTracks, setAvailableTracks] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('melodio_viral_tracks');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
        const genCached = localStorage.getItem('melodio_cached_generations');
        if (genCached) {
          const parsed = JSON.parse(genCached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [];
  });
  const [selectedGrokTrackId, setSelectedGrokTrackId] = useState<string>('');

  const [grokVideoPrompt, setGrokVideoPrompt] = useState(
    "A hyper-viral 9:16 vertical short-form video, fast-paced Korean comedy reel.\n" +
    "[Scene 1] A dramatic Korean woman standing in front of a traditional diner. Glowing neon 3D Korean text \"쉿, 김치찌개 찌개 궁합!\" floating in mid-air.\n" +
    "[Scene 2] A boiling red Kimchi Stew (Kimchi Jjigae) pot bubbling furiously. Bold impact Korean typography \"사랑은 환승역!\" appearing on screen.\n" +
    "[Scene 3] Extreme close-up of a restaurant receipt floating down. Large stylized Korean text \"(whispered) 계산은 왜 늘 내 앞으로 와?\" rendered in white subtitles.\n" +
    "[Scene 4] Young Korean friends chanting around the boiling pot. Vibrant 3D neon text \"환승역 연애심리학! ㅋㅋㅋ\" pulsing with bright colors --ar 9:16"
  );
  const [isGeneratingGrokVideo, setIsGeneratingGrokVideo] = useState(false);
  const [grokVideoProgress, setGrokVideoProgress] = useState(0);
  const [grokVideoResult, setGrokVideoResult] = useState<string | null>(null);
  const [grokVideoError, setGrokVideoError] = useState<string | null>(null);
  const [grokVideoClips, setGrokVideoClips] = useState<string[]>([]);
  const [activeClipIndex, setActiveClipIndex] = useState<number>(0);
  const [grokVideoDuration, setGrokVideoDuration] = useState<number>(0);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const step4CardRef = useRef<HTMLDivElement | null>(null);

  // Fetch ONLY Viral & Trend zone tracks for Grok video selection dropdown
  // Fetch ONLY Viral & Trend zone tracks for Grok video selection dropdown
  useEffect(() => {
    function sanitizeViralTrackTitle(track: any) {
      if (!track) return track;
      let presetId = track.presetId || track.metadata?.tab_type || track.tab_type;
      let lyricsText = track.lyrics || track.lyricsPrompt || track.prompt || '';
      if (track.license_hash) {
        try {
          const parsed = JSON.parse(track.license_hash);
          presetId = presetId || parsed.presetId || parsed.metadata?.tab_type || parsed.tab_type;
          lyricsText = lyricsText || parsed.lyrics || parsed.lyricsPrompt || parsed.prompt || '';
        } catch {}
      }

      let newTitle = track.title || '';
      if (newTitle.includes('나만의') || newTitle.includes('챌린지송') || newTitle.includes('패러디송') || newTitle.includes('B급 광고')) {
        if (presetId === 'drama' || newTitle.includes('K-드라마')) {
          newTitle = '[통장 0원] 연진아 내 꿈은 너야... 카드값 팩폭 슬픔송';
        } else if (presetId === 'pet' || newTitle.includes('댕냥이')) {
          newTitle = '집사야 밥그릇이 3초간 비었다 (묘권 침해 팩폭가)';
        } else if (presetId === 'relationship' || newTitle.includes('연애')) {
          newTitle = '남자들 카톡 답장 20분 늦을 때 진짜 속마음 번역기';
        } else if (presetId === 'human' || newTitle.includes('현대인') || newTitle.includes('직장인')) {
          newTitle = '월급 250 들어왔다 1초 만에 카드값 249만원 퍼가요~♡';
        } else if (presetId === 'brand' || newTitle.includes('B급 광고')) {
          newTitle = '새로 산 아이폰 16 액정 3초 만에 박살 났을 때 듣는 슬픔송';
        } else if (presetId === 'trend' || newTitle.includes('트렌드') || newTitle.includes('이슈')) {
          newTitle = '탕후루 가고 요아정 3kg 빠졌다는 내 통장 잔고 팩폭';
        } else if (presetId === 'challenge' || newTitle.includes('도파민')) {
          newTitle = '[소름주의] 오늘 아침 3초 만에 이불 개기 성공한 갓생 챌린지가';
        } else if (presetId === 'history' || newTitle.includes('역사')) {
          if (lyricsText.includes('알렉산더') || lyricsText.includes('클레오파트라') || lyricsText.includes('네로')) {
            newTitle = '[역사 환생] 알렉산더 & 클레오파트라 2026년 지하철 환승 대소동';
          } else {
            newTitle = '[조선 인스타] 이순신 장군님이 2026년에 환생하셨다면?';
          }
        }
      } else if (newTitle.includes('이순신') && (lyricsText.includes('알렉산더') || lyricsText.includes('클레오파트라') || lyricsText.includes('네로'))) {
        newTitle = '[역사 환생] 알렉산더 & 클레오파트라 2026년 지하철 환승 대소동';
      }

      return { ...track, title: newTitle };
    }

    async function loadGrokTracks() {
      try {
        let localViralTracks: any[] = [];
        try {
          const saved = localStorage.getItem('melodio_viral_tracks');
          if (saved) {
            localViralTracks = JSON.parse(saved).map(sanitizeViralTrackTitle);
            localStorage.setItem('melodio_viral_tracks', JSON.stringify(localViralTracks));
          }
        } catch {}

        const res = await fetch('/api/generations?limit=50');
        let apiViralTracks: any[] = [];
        if (res.ok) {
          const data = await res.json();
          if (data.generations && Array.isArray(data.generations)) {
            apiViralTracks = data.generations.map(sanitizeViralTrackTitle).filter((t: any) => {
              const tagsStr = Array.isArray(t.tags) ? t.tags.join(' ') : String(t.tags || '');
              const promptStr = String(t.prompt || '');
              const styleStr = String(t.style || '');
              const titleStr = String(t.title || '');
              const sourceStr = String(t.source_menu || t.source || '');

              return (
                sourceStr === 'viral' ||
                t.is_viral === true ||
                t.viral_mode === true ||
                tagsStr.toLowerCase().includes('viral') ||
                promptStr.toLowerCase().includes('viral') ||
                styleStr.toLowerCase().includes('viral') ||
                titleStr.toLowerCase().includes('viral') ||
                titleStr.includes('챌린지')
              );
            });
          }
        }

        const combinedMap = new Map();
        if (generatedResult) {
          combinedMap.set(String(generatedResult.id), sanitizeViralTrackTitle({ ...generatedResult, is_viral: true, source: 'viral' }));
        }
        [...localViralTracks, ...apiViralTracks].forEach((t) => {
          if (t && t.id && !combinedMap.has(String(t.id))) {
            combinedMap.set(String(t.id), sanitizeViralTrackTitle(t));
          }
        });

        const finalTracks = Array.from(combinedMap.values());
        setAvailableTracks(finalTracks);
        try {
          localStorage.setItem('melodio_viral_tracks', JSON.stringify(finalTracks));
        } catch {}
      } catch (e) {
        console.error('[Grok Tracks Load]', e);
      }
    }
    loadGrokTracks();
  }, [generatedResult]);

  const fetchDynamicGrokPrompt = useCallback(async (track: any): Promise<string> => {
    if (!track) return '';
    const lyricsText = track.lyrics || track.customLyrics || customLyrics || '';
    const rawTitle = (track.title || track.name || 'Viral Short Track');
    const genreStyle = track.genre || track.style || (Array.isArray(track.tags) ? track.tags[0] : track.tags) || 'K-POP';
    const cat = track.category || track.tab_type || track.presetId || genCategory || 'viral';

    try {
      const res = await fetch('/api/viral-cf/grok-video/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: rawTitle,
          lyrics: lyricsText,
          topic: customTopic || rawTitle,
          category: cat,
          genre: genreStyle,
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.prompt) return data.prompt;
      }
    } catch (e) {
      console.warn('[ViralPage] AI Grok Prompt API fallback:', e);
    }

    // Fallback Smart Prompt
    const cleanTitle = rawTitle.replace(/^[Viral]s*/i, '').trim();
    return `Hyper-kinetic 9:16 vertical short-form viral skit for "${cleanTitle}" (${genreStyle}). STRICT VISUAL SUBJECT: PROTAGONIST: EXPRESSIVE MAIN CHARACTER IN TRENDY OUTFIT, SUPPORTING ACTOR: DRAMATIC REACTION PARTNER. CORE OBJECT: ICONIC KEY ITEM FROM STORY. VISUAL ACTION & SCENE: EXAGGERATED 3-SECOND HOOK SITUATION & COMEDIC BODY LANGUAGE. CAMERA & LIGHTING: 0.5X FISHEYE SNAP-ZOOMS, DYNAMIC LIGHTING. ABSOLUTELY CLEAN VISUAL MOTION ONLY, ABSOLUTELY ZERO TEXT ON SCREEN, NO SUBTITLES, NO TYPOGRAPHY.`;
  }, [customLyrics, customTopic, genCategory]);

  const selectedGrokTrack = useMemo(() => {
    if (selectedGrokTrackId) {
      const found = availableTracks.find(t => String(t.id) === String(selectedGrokTrackId));
      if (found) return found;
      if (generatedResult && String(generatedResult.id) === String(selectedGrokTrackId)) return generatedResult;
      if (currentPlayingTrack && String(currentPlayingTrack.id) === String(selectedGrokTrackId)) return currentPlayingTrack;
    }
    if (generatedResult) return generatedResult;
    if (currentPlayingTrack) return currentPlayingTrack;
    return availableTracks[0] || null;
  }, [selectedGrokTrackId, availableTracks, generatedResult, currentPlayingTrack]);

  useEffect(() => {
    if (selectedGrokTrack) {
      fetchDynamicGrokPrompt(selectedGrokTrack).then(p => {
        if (p) setGrokVideoPrompt(p);
      });
    }
  }, [selectedGrokTrack, fetchDynamicGrokPrompt]);

  const handleTuneGrokPrompt = () => {
    if (selectedGrokTrack) {
      fetchDynamicGrokPrompt(selectedGrokTrack).then(p => {
        if (p) setGrokVideoPrompt(p);
      });
    }
  };
  const handleGenerateGrokVideo = async (overrideTrack?: any) => {
    setIsGeneratingGrokVideo(true);
    setGrokVideoError(null);
    setGrokVideoProgress(15);
    let p = 15;
    const interval = setInterval(() => {
      p = Math.min(95, p + Math.floor(Math.random() * 4) + 2);
      setGrokVideoProgress(p);
    }, 1000);

    try {
      const activeTrack = overrideTrack || selectedGrokTrack || generatedResult || currentPlayingTrack;
      const targetAudio = activeTrack?.audio_url || activeTrack?.audioUrl || activeTrack?.audio || activeTrack?.url || activeTrack?.stream_url || activeTrack?.file_url;
      const activePrompt = overrideTrack ? await fetchDynamicGrokPrompt(overrideTrack) : grokVideoPrompt;

      console.log('[ViralPage] Triggering Grok video for track:', { id: activeTrack?.id, title: activeTrack?.title, audioUrl: targetAudio });

      const res = await fetch('/api/viral-cf/grok-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: activePrompt,
          audioUrl: targetAudio,
          duration: 30,
          aspectRatio: '9:16',
          generate30SecFull: true
        })
      });

      clearInterval(interval);
      setGrokVideoProgress(100);

      let data: any;
      try {
        const resText = await res.text();
        data = JSON.parse(resText);
      } catch {
        throw new Error('Grok 영상 서버 응답 타임아웃 (Vercel 120초 제한). 잠시 후 [영상만 재시도] 버튼을 눌러주세요.');
      }
      if (data.success && data.videoUrl) {
        setGrokVideoResult(data.videoUrl);
        if (data.clips && Array.isArray(data.clips) && data.clips.length > 0) {
          setGrokVideoClips(data.clips);
        } else {
          setGrokVideoClips([data.videoUrl]);
        }
        setActiveClipIndex(0);

        // 🎬 비디오 화면으로 자동 스와이프 스크롤
        setTimeout(() => {
          if (previewVideoRef.current) {
            previewVideoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 400);

        // 🎬 Supabase DB (generations)에 video_url 영구 수록 (대시보드 노출용)
        if (selectedGrokTrack?.id) {
          fetch('/api/generations', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: selectedGrokTrack.id,
              video_url: data.videoUrl
            })
          }).catch(err => console.warn('[Viral] Failed to persist video_url to generation:', err));
        }
      } else {
        setGrokVideoError(data.error || 'Grok 비디오 생성 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error('[Grok Video]', err);
      setGrokVideoError(err.message || 'Grok 비디오 생성 네트워크 요청 실패');
    } finally {
      setIsGeneratingGrokVideo(false);
    }
  };

  const handleTogglePlay = (id: string, audioUrl: string, trackObj?: any) => {
    if (!audioRef.current) return;

    if (playingId === id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        registerActiveAudio(audioRef.current, () => setIsPlaying(false));
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    } else {
      setPlayingId(id);
      if (trackObj) {
        setPlayingTrackObj(trackObj);
      } else {
        const found = VIRAL_SHOWCASE_TRACKS.find(t => String(t.id) === String(id));
        if (found) setPlayingTrackObj(found);
      }
      setIsPlaying(true);
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      registerActiveAudio(audioRef.current, () => setIsPlaying(false));
      audioRef.current.play().catch(() => {});
    }
  };

  useEffect(() => {
    const handleOtherAudioStart = (e: any) => {
      if (e.detail?.audio && audioRef.current && e.detail.audio !== audioRef.current) {
        setIsPlaying(false);
      }
    };
    window.addEventListener("melodio-audio-started", handleOtherAudioStart);
    return () => window.removeEventListener("melodio-audio-started", handleOtherAudioStart);
  }, []);

  const scrollViral = (direction: 'left' | 'right') => {
    if (viralScrollRef.current) {
      const scrollAmount = 400;
      viralScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const loadPresets = async () => {
      try {
        const res = await fetch('/api/viral-cf/presets');
        if (!res.ok) throw new Error('프리셋 로드 실패');
        const data = await res.json();
        if (data.success && data.presets) {
          setConcepts(data.presets);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadPresets();
  }, []);

  const insertTextAtCursor = (textToInsert: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextText = textarea.value.substring(0, start) + textToInsert + textarea.value.substring(end);
    setCustomLyrics(nextText);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
    }, 0);
  };

  const DURATION_CHAR_LIMIT: Record<string, number> = {
    '15s': 150, '20s': 200, '30s': 350, '40s': 450, '50s': 600, '60s': 800,
  };
  const currentCharLimit = DURATION_CHAR_LIMIT[duration] || 150;
  const durationSeconds = parseInt(duration.replace('s', ''), 10) || 30;

  const handleOptimizePrompt = async () => {
    setIsOptimizing(true);
    let basePrompt = "";
    try {
      // ── 상황 입력이 비어있으면 프로듀서 브리프 API로 자동 기획 ──
      let topicInput = customTopic.trim();
      if (!topicInput) {
        try {
          const briefRes = await fetch('/api/viral-cf/producer-brief', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: genCategory })
          });
          const briefData = await briefRes.json();
          if (briefData.success && briefData.brief) {
            topicInput = `[컨셉] ${briefData.brief.title}\n[훅] ${briefData.brief.hook}\n[상황] ${briefData.brief.lyrics}`;
            setCustomTopic(topicInput);
          }
        } catch (briefErr) {
          console.warn('[ViralPage] Auto producer-brief fallback:', briefErr);
        }
      }

      const randomVariations = [
        "소심하고 어리숙한 관찰자 시점, 풍자적이고 우스꽝스러운 무드",
        "극도로 분노한 자영업자/피해자 시점, 빠르고 강렬한 메탈/락 디스 스타일",
        "얄밉고 귀여운 틱톡 댄서 시점, 통통 튀고 냉소적인 일렉트로닉 팝 스타일",
        "인생 해탈한 애늙은이 시점, 잔잔하지만 뼈를 깊게 찌르는 어쿠스틱 포크 스타일",
        "부자 허세 가득한 힙합 래퍼 시점, 돈 자랑과 자조적 자폭이 섞인 트랩 스타일",
        "로봇 또는 AI 관찰자 시점, 차갑고 팩트 위주의 사이버펑크 스타일"
      ];
      const randomVariation = randomVariations[Math.floor(Math.random() * randomVariations.length)];
      const baseGenrePrompt = VIRAL_GENRE_PROMPT_MAP[selectedGenre];
      
      const categoryLabel = CATEGORY_TITLES[genCategory] || 'B급 광고';

      const topicText = topicInput || `${categoryLabel} 테마 자유 주제`;
      basePrompt = `vocal-centric mix, dry upfront vocals close to mic, minimal backing beat, crystal clear vocal delivery, ${categoryLabel} 바이럴 숏폼 송, ${baseGenrePrompt}, ${selectedMood}, ${selectedVocal}, comical parody tone, goofy and humorous vocals, witty expression, B-grade meme energy, variation style: [${randomVariation}], user special request: ${topicText}`;

      let finalPrompt = basePrompt;
      try {
        const optRes = await fetch('/api/prompt-optimize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: basePrompt, language: 'ko', viralMode: true })
        });
        if (optRes.ok) {
          const optData = await optRes.json();
          if (optData.optimized) finalPrompt = optData.optimized;
        }
      } catch (optErr) {
        console.warn('[ViralPage] prompt-optimize API fallback to basePrompt:', optErr);
      }
      setOptimizedPrompt(finalPrompt);

      const fullTopic = `카테고리: ${categoryLabel}. 주제: ${topicText}. [구조 필수: 첫 3초 팩폭 스포일러 독백 나레이션(spoken intro) -> 2줄 팩폭 상황 벌스 -> 2줄 빵터지는 펀치라인 아웃트로]. 페르소나: [${randomVariation}]`;

      try {
        const lyrRes = await fetch('/api/lyrics/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stylePrompt: finalPrompt,
            topic: fullTopic,
            language: 'ko',
            isPlaylistMode: false,
            trackCount: 1,
            presetId: genCategory,
            durationSeconds,
            viralMode: true,
          })
        });
        if (lyrRes.ok) {
          const lyrData = await lyrRes.json();
          if (lyrData.success && lyrData.lyricsPrompt) {
            setCustomLyrics(lyrData.lyricsPrompt);
            if (lyrData.title) {
              setProducerBrief(prev => ({
                title: lyrData.title,
                hook: prev?.hook || lyrData.title,
                lyrics: lyrData.lyricsPrompt
              }));
            }
          } else {
            setCustomLyrics(`[Fast Intro]\n${brandName ? brandName + '! ' : ''}${categoryLabel} 정신 번쩍!\n[Outro]\n도파민 폭발 가자!`);
          }
        } else {
          setCustomLyrics(`[Fast Intro]\n${brandName ? brandName + '! ' : ''}${categoryLabel} 정신 번쩍!\n[Outro]\n도파민 폭발 가자!`);
        }
      } catch (lyrErr) {
        console.warn('[ViralPage] lyrics/generate API fallback:', lyrErr);
        setCustomLyrics(`[Fast Intro]\n${brandName ? brandName + '! ' : ''}${categoryLabel} 정신 번쩍!\n[Outro]\n도파민 폭발 가자!`);
      }
    } catch (e) {
      console.error('[ViralPage] handleOptimizePrompt error:', e);
      setOptimizedPrompt(basePrompt);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!customLyrics.trim()) {
      alert("가사가 비어 있습니다. Step 3의 [AI 기획 분석] 버튼으로 가사를 먼저 생성해 주세요!");
      return;
    }
    setIsGenerating(true);
    setGenProgress(5);
    setGeneratedResult(null);
    setSelectedGrokTrackId('');
    setIsPlaying(false);
    try {
      const baseGenrePrompt = VIRAL_GENRE_PROMPT_MAP[selectedGenre];
      const comicalSuffix = ", no intro, instant vocal start, acapella start, comical parody tone, goofy and humorous vocals, dry close-up vocals, vocal-centric mix, minimal instrumentation, crystal clear vocal delivery, funny theatrical expression, witty delivery, B-grade meme energy, dynamic transitions";
      let finalStyle = optimizedPrompt || `${baseGenrePrompt}, ${selectedMood}, ${selectedVocal}${comicalSuffix}, high-fidelity studio mastering`;
      if (optimizedPrompt && !optimizedPrompt.includes('no intro')) {
        finalStyle = `no intro, instant vocal start, acapella start, ${optimizedPrompt}`;
      }
      let finalLyrics = customLyrics;

      const categoryLabel =
        genCategory === 'trend' ? '트렌드/이슈' :
        genCategory === 'history' ? '역사 부캐' :
        genCategory === 'human' ? '현대인/직장인' :
        genCategory === 'challenge' ? '도파민 충전 응원' :
        genCategory === 'relationship' ? '연애/남녀 심리' :
        genCategory === 'drama' ? 'K-드라마/명대사' :
        genCategory === 'pet' ? '댕냥이/집사속마음' : 'B급 광고 패러디';

      let finalTitle = "";
      if (producerBrief?.title) {
        finalTitle = producerBrief.title;
      } else if (customTopic && customTopic.trim()) {
        const topicText = customTopic.trim();
        finalTitle = topicText.length > 30 ? topicText.slice(0, 30) + '...' : topicText;
        if (brandName) {
          finalTitle = `[${brandName}] ${finalTitle}`;
        }
      } else if (brandName) {
        finalTitle = `[Viral] ${brandName} - ${categoryLabel}`;
      } else {
        finalTitle = `${categoryLabel} 숏폼 바이럴송`;
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylePrompt: finalStyle,
          lyricsPrompt: finalLyrics,
          title: finalTitle,
          isInstrumental: selectedVocal.includes('Instrumental'),
          sunoVersion: 'v5.5',
          selections: { genre: [selectedGenre], mood: [selectedMood], vocal: [selectedVocal] },
          presetId: genCategory,
          presetName: `${categoryLabel} 템플릿`,
          sourceMenu: 'viral',
          isPublic: isPublic,
          metadata: { brand_name: brandName, tab_type: genCategory, duration, durationSeconds }
        })
      });
      if (!res.ok) throw new Error(`생성 실패: ${await res.text()}`);
      const data = await res.json();
      if (!data.success || !data.track?.id) throw new Error(data.error || '생성 작업 ID 누락');
      const trackId = data.track.id;
      setGenProgress(20);
      let pollCount = 0;
      const maxPolls = 65;
      const interval = setInterval(async () => {
        pollCount++;
        setGenProgress(prev => Math.min(95, prev + Math.floor(Math.random() * 4) + 1));
        try {
          const statusRes = await fetch(`/api/generations?id=${trackId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            const gen = statusData.generation;
            if (gen && gen.status === 'completed') {
              clearInterval(interval);
              setGenProgress(100);
              const newViralTrack = {
                id: trackId,
                title: gen.title || finalTitle,
                lyrics: finalLyrics,
                prompt: finalStyle,
                style: finalStyle,
                audioUrl: gen.audio_url || gen.source_audio_url,
                audio_url: gen.audio_url || gen.source_audio_url,
                thumbnailUrl: gen.thumbnail_url || gen.image_url || CATEGORY_THUMBNAIL_MAP[genCategory] || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
                visualGuide: "9:16 vertical shorts visual outline",
                tags: [selectedGenre, selectedMood, selectedVocal, 'viral'],
                suggestedTitle: finalTitle,
                is_viral: true,
                source: 'viral'
              };
              setSelectedGrokTrackId(String(trackId));
              setGeneratedResult(newViralTrack);

              // 🎨 앨범 커버 아트 AI 이미지 동적 자동 생성 및 갱신
              (async () => {
                try {
                  const coverPrompt = `Album cover art for "${finalTitle}", 9:16 vertical viral short-form theme, ${selectedGenre}, ${selectedMood}, vibrant cinematic pop aesthetic, high resolution studio art`;
                  const imgRes = await fetch('/api/autopilot/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: coverPrompt, style: 'anime', aspectRatio: '1:1' })
                  });
                  if (imgRes.ok) {
                    const imgData = await imgRes.json();
                    const newCoverUrl = imgData.imageUrl || imgData.url;
                    if (newCoverUrl) {
                      setGeneratedResult((prev: any) => prev ? { ...prev, thumbnailUrl: newCoverUrl, coverUrl: newCoverUrl } : prev);
                    }
                  }
                } catch (imgErr) {
                  console.warn('[ViralPage] Cover art generation warning:', imgErr);
                }
              })();
              try {
                const existing = JSON.parse(localStorage.getItem('melodio_viral_tracks') || '[]');
                const updated = [newViralTrack, ...existing.filter((t: any) => String(t.id) !== String(trackId))];
                localStorage.setItem('melodio_viral_tracks', JSON.stringify(updated));
              } catch {}
              setIsGenerating(false);
              // ✅ 음원 완료 — 영상은 Step 5에서 사용자가 수동으로 시작
              // (자동 비디오 생성 제거: 사용자가 음원 먼저 확인 후 진행)
            } else if (gen && gen.status === 'failed') {
              clearInterval(interval);
              setIsGenerating(false);
              alert('음원 생성 작업이 실패했습니다. 다시 시도해 주세요.');
            }
          }
        } catch (e) { console.error('[Polling]', e); }
        if (pollCount >= maxPolls) {
          clearInterval(interval);
          setIsGenerating(false);
          alert('생성 타임아웃. Track Library에서 완료 여부를 확인해 주십시오.');
        }
      }, 5000);
    } catch (err: any) {
      console.error(err);
      alert(`생성 처리 중 에러: ${err.message}`);
      setIsGenerating(false);
    }
  };

  const togglePlay = () => {
    if (!generatedResult?.audioUrl) return;
    handleTogglePlay('generated', generatedResult.audioUrl);
  };

  const filteredConcepts = concepts.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          c.genre.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'all' || c.tab_type === activeCategory;
    const matchesDate = selectedDate === 'all' || c.created_date === selectedDate;
    return matchesSearch && matchesCategory && matchesDate;
  });

  const totalPages = Math.max(1, Math.ceil(filteredConcepts.length / itemsPerPage));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedConcepts = filteredConcepts.slice((activePage - 1) * itemsPerPage, activePage * itemsPerPage);

  const libraryTracks = useMemo(() => {
    const merged: any[] = [];
    const seenIds = new Set();

    availableTracks.forEach((t) => {
      if (t && t.id && !seenIds.has(String(t.id))) {
        seenIds.add(String(t.id));
        merged.push({
          id: String(t.id),
          title: t.title || t.name || '바이럴 숏폼 음원',
          category: t.presetId || t.metadata?.tab_type || t.tab_type || 'trend',
          genre: t.genre || t.styleName || (Array.isArray(t.tags) ? t.tags[0] : 'Viral Mix'),
          audioUrl: t.audioUrl || t.audio_url,
          thumbnailUrl: t.thumbnailUrl || t.thumbnail_url || CATEGORY_THUMBNAIL_MAP[t.tab_type || 'trend'] || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80',
          tags: Array.isArray(t.tags) ? t.tags : (t.suggestedTags || ['#바이럴', '#숏폼']),
          lyrics: t.lyrics || t.lyricsPrompt || t.source || '',
          raw: t
        });
      }
    });

    concepts.forEach((c: any) => {
      if (c && c.id && !seenIds.has(String(c.id))) {
        seenIds.add(String(c.id));
        merged.push({
          id: String(c.id),
          title: c.title,
          category: c.tab_type || 'trend',
          genre: c.genre || c.styleName || 'Viral Preset',
          audioUrl: c.audioUrl || c.audio_url || '',
          thumbnailUrl: getConceptThumbnail(c).url,
          tags: c.suggestedTags || ['#바이럴', '#숏폼'],
          lyrics: c.source || '',
          raw: c
        });
      }
    });

    return merged;
  }, [availableTracks, concepts]);

  const filteredLibraryTracks = useMemo(() => {
    return libraryTracks.filter((t) => {
      const titleMatch = (t.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      const lyricsMatch = (t.lyrics || '').toLowerCase().includes(searchTerm.toLowerCase());
      const tagsMatch = (t.tags || []).join(' ').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSearch = !searchTerm.trim() || titleMatch || lyricsMatch || tagsMatch;

      const matchesCategory = activeCategory === 'all' || t.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [libraryTracks, searchTerm, activeCategory]);

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pb-10 pr-2 no-scrollbar">
      <audio 
        ref={audioRef} 
        preload="auto"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
        onEnded={() => {
          setIsPlaying(false);
          setPlayingId(null);
        }}
      />

      {/* ── 헤더 (통일된 표준 브랜드 헤더) ─────────────────────────────────────────────────────── */}
      <header className="mb-4 border-b border-white/10 pb-4">
        <h1 className="text-3xl font-bold text-white mb-1.5">Viral & Trend Zone</h1>
        <p className="text-xs text-zinc-400">지금 가장 뜨거운 도파민 이슈, 역사 인물 환생 디스전, 그리고 인간 군상 뼈 분쇄기 테마를 기반으로 한 1분 이내 숏폼 전용 고중독성 음원 기획 조종석입니다.</p>
      </header>

      {/* ─── Premium Viral Shorts Showcase Section ─── */}
      <div className="relative space-y-1 select-none">
        {/* Top Branding & Value Prop Copy */}
        <div className="space-y-1 text-left pl-2 pt-1">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-none bg-gradient-to-r from-fuchsia-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
            Trending Viral Shorts Gallery
          </h2>
          
          <p className="text-xs font-normal text-zinc-400 leading-snug">
            유튜브 쇼츠, 틱톡, 릴스를 강타한 최신 B급 풍자 음악과 중독성 넘치는 바이럴 트렌드 사운드를 9:16 비주얼로 감상해 보세요.
          </p>
        </div>

        {/* Carousel Container Wrapper */}
        <div className="relative group/slider px-2 pt-2">
          {/* Scrollable Card Container */}
          <div 
            ref={viralScrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-none pt-1 pb-4 scroll-smooth snap-x snap-mandatory z-10"
          >
            {VIRAL_SHOWCASE_TRACKS.map((track) => {
              const isTrackPlaying = playingId === track.id && isPlaying;
              return (
                <div 
                  key={track.id}
                  className="w-44 shrink-0 snap-start flex flex-col group/card relative pt-4"
                >
                  {/* Card Stack Deck Background Layers */}
                  <div className="absolute top-2 left-2.5 right-2.5 h-4 rounded-t-2xl bg-zinc-800/85 border border-white/5 opacity-40 transform scale-[0.96] z-0 origin-bottom" />
                  <div className="absolute top-0.5 left-5 right-5 h-4 rounded-t-2xl bg-zinc-700/60 border border-white/5 opacity-25 transform scale-[0.91] z-0 origin-bottom" />

                  {/* Album Cover Art Card (9:16 Ratio Box) */}
                  <div className="relative w-44 h-[280px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl z-10 bg-zinc-950 select-none group-hover/card:border-zinc-500/50 transition-colors duration-300">
                    <video 
                      src={track.videoUrl} 
                      poster={track.thumbnailUrl}
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover rounded-2xl group-hover/card:scale-105 transition-transform duration-700 select-none"
                      onMouseEnter={(e) => {
                        e.currentTarget.play().catch(() => {});
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />

                    {/* Dark gradient overlay for typography readability */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/75 rounded-2xl z-15" />

                    {/* Center Text Caption Overlay */}
                    <div className="absolute inset-x-3.5 top-1/2 -translate-y-1/2 text-center z-20 flex flex-col justify-center select-none pointer-events-none">
                      <span className="text-[11.5px] font-black text-white leading-snug tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] line-clamp-5 uppercase font-sans antialiased">
                        {track.centerCaption}
                      </span>
                    </div>

                    {/* Top Right Active Playing Waveform Badge */}
                    {isTrackPlaying && (
                      <div className="absolute top-3 right-3 z-30 bg-black/60 border border-white/10 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-0.5 justify-center shadow-md">
                        <span className="w-0.5 h-2 bg-fuchsia-400 rounded-full animate-[bounce_0.6s_infinite_100ms]" />
                        <span className="w-0.5 h-3 bg-fuchsia-400 rounded-full animate-[bounce_0.6s_infinite_300ms]" />
                        <span className="w-0.5 h-2 bg-fuchsia-400 rounded-full animate-[bounce_0.6s_infinite_500ms]" />
                      </div>
                    )}

                    {/* Bottom Metadata Info Overlay */}
                    <div className="absolute inset-x-3.5 bottom-3.5 z-20 space-y-1 text-left select-none pointer-events-none">
                      <div className="text-[12px] font-extrabold text-white truncate drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.9)]">
                        {track.title}
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center text-[8.5px] font-extrabold text-white shrink-0 shadow-md">
                          {track.userName.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="text-[9.5px] text-zinc-300 font-bold truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                          {track.userName}
                        </span>
                      </div>
                    </div>

                    {/* Play / Pause Overlays on Hover */}
                    <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center z-25">
                      {isTrackPlaying ? (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePlay(track.id, track.audioUrl);
                          }}
                          className="w-11 h-11 rounded-full bg-fuchsia-600 border border-white/10 flex items-center justify-center cursor-pointer shadow-lg hover:scale-105 transition-transform"
                        >
                          <Pause className="w-4 h-4 text-white fill-current" />
                        </div>
                      ) : (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePlay(track.id, track.audioUrl);
                          }}
                          className="w-11 h-11 rounded-full bg-black/60 border border-white/10 flex items-center justify-center cursor-pointer shadow-lg hover:scale-105 transition-transform"
                        >
                          <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tiny click info */}
                  <div className="mt-2.5 px-1 flex justify-between items-center">
                    <span 
                      onClick={() => {
                        if (!isPro) {
                          setIsUpgradeModalOpen(true);
                        } else {
                          navigator.clipboard.writeText(track.tags);
                          alert("Pro Viral 스타일 프롬프트가 복사되었습니다!");
                        }
                      }}
                      className="text-[9.5px] text-zinc-500 hover:text-cyan-400 font-bold uppercase tracking-wider cursor-pointer transition-colors"
                    >
                      Copy Recipe
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Left Navigation Chevron Overlay */}
          <button 
            onClick={() => scrollViral('left')}
            className="absolute left-0 top-[50%] -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-zinc-950/80 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all hover:scale-105 opacity-80 hover:opacity-100 shadow-2xl"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Right Navigation Chevron Overlay */}
          <button 
            onClick={() => scrollViral('right')}
            className="absolute right-0 top-[50%] -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-zinc-950/80 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all hover:scale-105 opacity-80 hover:opacity-100 shadow-2xl"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ─── 좌우 2열 메인 레이아웃 (좌: 공개 음원 1x10 피드 / 우: 생성 조종석) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ── 좌측: 실시간 바이럴 숏폼 라이브러리 (1x14 배치 + 페이지네이션) ── */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="p-5 rounded-3xl bg-zinc-950/60 border border-white/10 backdrop-blur-md shadow-xl space-y-4">
            <PublicTrackGrid
              sourceMenu="viral"
              layout="grid"
              columns={1}
              itemsPerPage={18}
              useExternalPlayer={true}
              playingTrackId={playingId ? String(playingId) : null}
              isTrackPlaying={isPlaying && playingId !== null}
              onPlayTrack={(track: any) => handleTogglePlay(String(track.id), track.audio_url || track.audioUrl || '', track)}
              onPauseTrack={() => {
                if (audioRef.current) audioRef.current.pause();
                setIsPlaying(false);
              }}
            />
          </div>
        </div>

        {/* ── 우측: 생성 조종석 ───────────────────────────────────────────── */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Glassmorphism 조종석 패널 */}
          <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 p-6 sm:p-8 rounded-3xl space-y-6 shadow-xl shadow-black/20">

            {/* ─── Step Progress Indicator ─── */}
            {(() => {
              const step1Done = !!genCategory;
              const step2Done = !!(selectedGenre && selectedMood && selectedVocal);
              const step3Done = !!(optimizedPrompt.trim());
              const step4Done = !!generatedResult;
              const step5Done = !!grokVideoResult;
              const steps = [
                { num: 1, label: '카테고리', done: step1Done },
                { num: 2, label: '스타일', done: step2Done },
                { num: 3, label: 'AI 기획', done: step3Done },
                { num: 4, label: '음원 생성', done: step4Done },
                { num: 5, label: '영상 생성', done: step5Done },
              ];
              // current = first incomplete step
              const currentStepNum = step5Done ? 5 : step4Done ? 5 : step3Done ? 4 : step2Done ? 3 : step1Done ? 2 : 1;
              return (
                <div className="flex items-center gap-1 w-full mb-2">
                  {steps.map((s, i) => {
                    const isCurrent = s.num === currentStepNum;
                    const isPast = s.done;
                    return (
                      <div key={s.num} className="flex items-center flex-1 min-w-0">
                        <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-extrabold transition-all w-full justify-center ${
                          isPast
                            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                            : isCurrent
                            ? 'bg-cyan-500/15 border border-cyan-400/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                            : 'bg-zinc-900/40 border border-white/5 text-zinc-600'
                        }`}>
                          {isPast ? (
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          ) : (
                            <span className={`text-[10px] font-mono ${isCurrent ? 'text-cyan-300' : 'text-zinc-600'}`}>{s.num}</span>
                          )}
                          <span className="truncate text-[10px] sm:text-xs">{s.label}</span>
                        </div>
                        {i < steps.length - 1 && (
                          <div className={`w-3 h-px mx-0.5 shrink-0 ${isPast ? 'bg-emerald-500/40' : 'bg-white/10'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}


            {/* 기획 의도 카드 (선택된 카테고리에 맞춰 가변 연출) */}
            {(() => {
              const bgImages = {
                drama: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80",
                pet: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&q=80",
                trend: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80",
                history: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&q=80",
                human: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80",
                brand: "https://images.unsplash.com/photo-1560169897-fc0cdbdfa4d5?w=800&q=80",
                challenge: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80",
                relationship: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800&q=80"
              };
              const bgImg = bgImages[genCategory as keyof typeof bgImages] || bgImages.trend;
              const categoryTitle = CATEGORY_TITLES[genCategory] || "나만의 바이럴 숏폼 제작";
              
              return (
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-zinc-950 shadow-lg shadow-black/30 flex min-h-[145px] items-stretch group/banner select-none p-4">
                  {/* Background Image Layer - Spanning 100% Width */}
                  <div className="absolute inset-0 z-0 overflow-hidden">
                    <AnimatePresence mode="popLayout">
                      <motion.img 
                        key={genCategory}
                        initial={{ opacity: 0, scale: 1.05 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        src={bgImg} 
                        alt={categoryTitle}
                        className="absolute inset-0 w-full h-full object-cover transform group-hover/banner:scale-105 transition-transform duration-700"
                      />
                    </AnimatePresence>
                    {/* Linear gradient overlay: Solid #09090b on left 1/3 (0% to 33%), smoothly fading to transparent at right end (100%) */}
                    <div 
                      className="absolute inset-0 z-10" 
                      style={{
                        background: 'linear-gradient(to right, #09090b 0%, #09090b 33%, transparent 100%)'
                      }}
                    />
                    {/* Subtle top/bottom shadow overlays to blend with borders */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#09090b]/40 via-transparent to-[#09090b]/20 z-10" />
                  </div>

                  {/* Banner Content (Foreground) - Spanning 100% width to align badges */}
                  <div className="relative z-20 flex flex-col h-full justify-between gap-2.5 w-full">
                    {/* Header: Dynamic Category Badges (Aligns category badge and PRODUCER BRIEF badge at same height) */}
                    <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2 w-full">
                      <div className="flex items-center gap-2">
                        {genCategory === 'drama' && (
                          <span className="text-[9px] bg-purple-500/20 border border-purple-500/30 text-purple-300 font-extrabold px-2.5 py-1 rounded-full tracking-wide uppercase inline-flex items-center justify-center gap-1 shadow-md shadow-purple-950/50 leading-none">
                            <Film className="w-2.5 h-2.5 text-purple-400 shrink-0" /> K-드라마/명대사
                          </span>
                        )}
                        {genCategory === 'pet' && (
                          <span className="text-[9px] bg-orange-500/20 border border-orange-500/30 text-orange-300 font-extrabold px-2.5 py-1 rounded-full tracking-wide uppercase inline-flex items-center justify-center gap-1 shadow-md shadow-orange-950/50 leading-none">
                            <Dog className="w-2.5 h-2.5 text-orange-400 shrink-0" /> 댕냥이/집사속마음
                          </span>
                        )}
                        {genCategory === 'relationship' && (
                          <span className="text-[9px] bg-rose-500/20 border border-rose-500/30 text-rose-300 font-extrabold px-2.5 py-1 rounded-full tracking-wide uppercase inline-flex items-center justify-center gap-1 shadow-md shadow-rose-950/50 leading-none">
                            <Heart className="w-2.5 h-2.5 text-rose-400 shrink-0" /> 연애/남녀 심리
                          </span>
                        )}
                        {genCategory === 'challenge' && (
                          <span className="text-[9px] bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-extrabold px-2.5 py-1 rounded-full tracking-wide uppercase inline-flex items-center justify-center gap-1 shadow-md shadow-cyan-950/50 leading-none">
                            <Flame className="w-2.5 h-2.5 text-cyan-400 shrink-0" /> 도파민 충전 응원
                          </span>
                        )}
                        {genCategory === 'trend' && (
                          <span className="text-[9px] bg-red-500/20 border border-red-500/30 text-red-300 font-extrabold px-2.5 py-1 rounded-full tracking-wide uppercase inline-flex items-center justify-center gap-1 shadow-md shadow-red-950/50 leading-none">
                            <TrendingUp className="w-2.5 h-2.5 text-red-400 shrink-0" /> 트렌드/이슈
                          </span>
                        )}
                        {genCategory === 'history' && (
                          <span className="text-[9px] bg-amber-500/20 border border-amber-500/30 text-amber-300 font-extrabold px-2.5 py-1 rounded-full tracking-wide uppercase inline-flex items-center justify-center gap-1 shadow-md shadow-amber-950/50 leading-none">
                            <History className="w-2.5 h-2.5 text-amber-400 shrink-0" /> 역사 부캐
                          </span>
                        )}
                        {genCategory === 'human' && (
                          <span className="text-[9px] bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-extrabold px-2.5 py-1 rounded-full tracking-wide uppercase inline-flex items-center justify-center gap-1 shadow-md shadow-emerald-950/50 leading-none">
                            <Users className="w-2.5 h-2.5 text-emerald-400 shrink-0" /> 현대인/직장인
                          </span>
                        )}
                        {genCategory === 'brand' && (
                          <span className="text-[9px] bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-300 font-extrabold px-2.5 py-1 rounded-full tracking-wide uppercase inline-flex items-center justify-center gap-1 shadow-md shadow-fuchsia-950/50 leading-none">
                            <Tv className="w-2.5 h-2.5 text-fuchsia-400 shrink-0" /> B급 광고 패러디
                          </span>
                        )}
                      </div>
                      
                      <span className="text-[9px] bg-white/80 backdrop-blur-[2px] border border-white/20 text-zinc-950 font-extrabold px-2.5 py-1 rounded-full tracking-wide uppercase inline-flex items-center justify-center shadow-md shadow-black/30 leading-none shrink-0">
                        PRODUCER BRIEF
                      </span>
                    </div>

                    {/* Body: Concept Title & Dynamic Description - Constrained to Left 2/3 */}
                    <div className="space-y-1 w-full lg:max-w-[65%] min-h-[58px]">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={genCategory}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-1"
                        >
                          <h4 className="text-xs font-black text-zinc-100 tracking-tight">
                            {categoryTitle}
                          </h4>
                          <p className="text-[11px] text-zinc-400 leading-normal font-medium">
                            {genCategory === 'drama' && "넷플릭스, K-드라마, 영화 속 전설의 명대사 및 캐릭터 억양에 B급 현실 팩폭 반전을 더한 최고 떡상 패러디 카테고리입니다."}
                            {genCategory === 'pet' && "사랑스러운 강아지, 고양이의 속마음 번역기 및 집사 수난시대 실화를 담은 숏폼 조회수 1위 보증수표 카테고리입니다."}
                            {genCategory === 'relationship' && "연애 중 벌어지는 소통 오류, 안읽씹/읽씹 고뇌, 쿨하지 못한 찌질한 이별 대참사 등 남녀 심리를 코믹하고 사실적으로 극대화한 카테고리입니다."}
                            {genCategory === 'human' && "일상 속에서 누구나 겪는 킹받는 상황, MBTI, 인간관계, 직장 생활의 애환을 저격해 격공을 유발하는 카테고리입니다."}
                            {genCategory === 'trend' && "지금 이 순간 가장 핫한 사회적 이슈, 스포츠, 인터넷 밈, 시사 사건을 영리하게 풍자하는 곡들이 모이는 카테고리입니다."}
                            {genCategory === 'challenge' && "일상의 소소한 지점에 무한한 긍정 텐션과 유쾌한 도파민을 불어넣어, 듣는 순간 웃음이 나고 자존감이 수직 상승하는 초특급 기살리기 응원 카테고리입니다."}
                            {genCategory === 'brand' && "유명 브랜드나 상품 소비 과정에서 겪는 웃픈 실화와 허세를 유쾌하고 과장되게 꼬집는 B급 코믹 광고 패러디 카테고리입니다."}
                            {genCategory === 'history' && "한국 역사 속 실존 인물들이 현대의 시점이나 페르소나(부캐)를 가지고 등장해 속마음을 털어놓는 이야기 중심의 카테고리입니다."}
                            {genCategory === 'parenting' && "육아 전쟁터의 리얼한 하루와 잼민이들의 예측불가 행동을 웃기고 공감가게 담아내는 카테고리입니다."}
                            {genCategory === 'food_diet' && "야식의 달콤한 유혹과 다이어트의 냉혹한 현실 사이에서 갈등하는 만인의 공감 카테고리입니다."}
                            {genCategory === 'horror_mystery' && "누구나 한 번쯤 겪은 이불킥급 흑역사와 소름돋는 일상 괴담을 코믹하게 승화시킨 카테고리입니다."}
                            {genCategory === 'ai_future' && "AI가 지배하는 미래, 로봇 상사, 메타버스 출근 등 SF적 상상력으로 현실을 풍자하는 카테고리입니다."}
                          </p>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {/* Footer: Algorithm Hook Points - Constrained to Left 2/3 */}
                    <div className="flex items-center gap-1.5 border-t border-white/5 pt-2 w-full lg:max-w-[65%] min-h-[28px]">
                      <Zap className="w-3 h-3 text-indigo-400 shrink-0 animate-pulse" />
                      <div className="text-[9.5px] min-w-0 flex-1">
                        <span className="text-indigo-400 font-bold">알고리즘 픽: </span>
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={genCategory}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-zinc-400 truncate block sm:inline"
                          >
                            {genCategory === 'drama' && "원작 명대사 억양과 반전 팩폭 가사의 극적 대조로 1초 만에 웃음을 자극하는 명대사 밈 엔진"}
                            {genCategory === 'pet' && "귀여운 반려동물 모션 및 집사 수난시대 짤방과 찰떡 결합하여 100만 뷰 떡상을 만드는 댕냥이 바이럴 엔진"}
                            {genCategory === 'relationship' && "남녀 간의 극적인 입장 차와 은밀한 행동 패턴을 고해성사하듯 나열하여 격한 소환 댓글을 부르는 커플 태그 엔진"}
                            {genCategory === 'human' && "'이거 완전 너다'라며 소셜 미디어와 DM으로 자발적 확산을 만드는 공유 엔진"}
                            {genCategory === 'trend' && "뉴스/SNS 보도 시점의 대중 트래픽을 즉각 락인(Lock-in)하는 핵심 엔진"}
                            {genCategory === 'challenge' && "유쾌하고 긍정적인 가사 대조로 청취자의 미소와 자존감 떡상을 동시에 자극하는 기살리기 엔진"}
                            {genCategory === 'brand' && "노골적이고 극적인 대조 구조로 리액션과 'ㅋㅋㅋ' 댓글 폭탄을 유발하는 중독성 최강 엔진"}
                            {genCategory === 'history' && "스토리의 깊이감과 가사 매칭의 신선함으로 장기 체류를 유도하는 차별화 엔진"}
                            {genCategory === 'parenting' && "'어머 우리 애도 이래요!'라며 부모 커뮤니티에서 자발적 공유가 폭발하는 육아 공감 엔진"}
                            {genCategory === 'food_diet' && "배고픔과 죄책감의 무한 루프를 중독적 멜로디로 가두는 야식 루프 엔진"}
                            {genCategory === 'horror_mystery' && "'아 이거 나 아님?!'이라며 자조적 웃음과 함께 자발적 흑역사 고백을 유도하는 이불킥 엔진"}
                            {genCategory === 'ai_future' && "SF적 상상력과 현실 직장인의 고단함을 결합해 미래 불안을 웃음으로 승화시키는 AI 풍자 엔진"}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Step 1: 카테고리 선택 */}
            <div className="space-y-4 pt-1">
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2 border-b border-white/10 pb-3">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-xs font-mono text-cyan-300 shrink-0">1</div>
                카테고리 선택
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: 'drama', label: 'K-드라마 명대사', icon: <Film className="w-4 h-4" /> },
                  { id: 'pet', label: '댕냥이 집사속마음', icon: <Dog className="w-4 h-4" /> },
                  { id: 'relationship', label: '연애·남녀심리', icon: <Heart className="w-4 h-4" /> },
                  { id: 'human', label: '현대인·직장인', icon: <Users className="w-4 h-4" /> },
                  { id: 'trend', label: '트렌드·이슈', icon: <TrendingUp className="w-4 h-4" /> },
                  { id: 'challenge', label: '도파민 응원', icon: <Flame className="w-4 h-4" /> },
                  { id: 'brand', label: 'B급 광고', icon: <Tv className="w-4 h-4" /> },
                  { id: 'history', label: '역사 부캐', icon: <History className="w-4 h-4" /> },
                  { id: 'parenting', label: '육아·잼민이 월드', icon: <Baby className="w-4 h-4" /> },
                  { id: 'food_diet', label: '야식·다이어트', icon: <Utensils className="w-4 h-4" /> },
                  { id: 'horror_mystery', label: '이불킥·흑역사', icon: <Ghost className="w-4 h-4" /> },
                  { id: 'ai_future', label: 'AI·미래 판타지', icon: <Cpu className="w-4 h-4" /> },
                ].map((cat) => {
                  const isCatSelected = genCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setGenCategory(cat.id);
                        setProducerBrief(null);
                      }}
                      className={`py-3 px-3.5 rounded-xl border text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-2 ${
                        isCatSelected
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200 font-black shadow-lg shadow-indigo-950/60 scale-[1.02]'
                          : 'border-white/10 bg-zinc-950/60 text-zinc-300 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {cat.icon}
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: 스타일 선택 */}
            <div className="space-y-4 pt-2">
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2 border-b border-white/10 pb-3">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-xs font-mono text-indigo-300 shrink-0">2</div>
                스타일 선택
                <button
                  type="button"
                  onClick={handleAutoTuneShortsSound}
                  className={`text-xs sm:text-sm font-black px-3 py-1 rounded-full border transition-all duration-300 ml-auto flex items-center gap-1 active:scale-95 shadow-md cursor-pointer ${
                    autoTuneFlash
                      ? 'bg-emerald-500 text-black border-emerald-400 shadow-emerald-500/50 scale-105'
                      : 'text-cyan-300 bg-cyan-950/80 border-cyan-500/50 hover:bg-cyan-900/90 hover:border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.35)]'
                  }`}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${autoTuneFlash ? 'text-black' : 'text-cyan-300'} shrink-0`} />
                  <span>{autoTuneFlash ? '✓ 스타일 자동 선택 완료!' : '⚡ 스타일 자동 선택'}</span>
                </button>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm text-zinc-200 font-extrabold flex items-center gap-1.5">
                    <Music4 className="w-4 h-4 text-cyan-400" />
                    풍자/밈 전용 장르
                  </label>
                  <div className="relative">
                    <select value={selectedGenre} onChange={(e) => setSelectedGenre(e.target.value)}
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-xs sm:text-sm font-bold text-white appearance-none focus:outline-none focus:border-indigo-500">
                      {VIRAL_GENRE_OPTIONS.map(g => <option key={g} value={g} className="bg-zinc-900 text-white">{g}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm text-zinc-200 font-extrabold flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    전용 무드
                  </label>
                  <div className="relative">
                    <select value={selectedMood} onChange={(e) => setSelectedMood(e.target.value)}
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-xs sm:text-sm font-bold text-white appearance-none focus:outline-none focus:border-indigo-500">
                      {VIRAL_MOOD_OPTIONS.map(m => <option key={m} value={m} className="bg-zinc-900 text-white">{m}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs sm:text-sm text-zinc-200 font-extrabold flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-rose-400" />
                  보컬 스타일 (Vocal)
                </label>
                <div className="relative">
                  <select value={selectedVocal} onChange={(e) => setSelectedVocal(e.target.value)}
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-4 py-3 text-xs sm:text-sm font-bold text-white appearance-none focus:outline-none focus:border-indigo-500">
                    {VOCAL_OPTIONS.map(v => <option key={v.value} value={v.value} className="bg-zinc-900 text-white">{v.label}</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Step 3: 상황 설정 & AI 기획 */}
            <div className="space-y-4 pt-2">
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2 border-b border-white/10 pb-3">
                <div className="w-6 h-6 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/40 flex items-center justify-center text-xs font-mono text-fuchsia-300 shrink-0">3</div>
                상황 설정 & AI 기획
              </h3>

              <div className="space-y-2 w-full">
                <label className="text-xs sm:text-sm text-zinc-200 font-extrabold flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-zinc-400" />
                  상황 및 요구사항 입력
                </label>
                <textarea
                  placeholder={`예시:\n- 2026 최신 OTT 화제작 OO 명대사 팩폭\n- 가사에 "내가 널 버릴거야~" 문구를 꼭 포함시켜줘\n- 보컬을 최대한 강조하고 반주를 줄여서 가사 전달이 잘 되게 해줘`}
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-y h-36 min-h-[144px] leading-relaxed font-medium"
                />
              </div>

              {/* AI 기획 실행 버튼 (Step 3 유일한 CTA) */}
              {(() => {
                const isStep3Enabled = !!genCategory;
                const isStep3Done = !!(optimizedPrompt.trim());

                return (
                  <div className="space-y-1.5">
                    <button
                      onClick={handleOptimizePrompt}
                      disabled={!isStep3Enabled || isOptimizing || isGenerating || isGeneratingGrokVideo}
                      className={`w-full py-4 rounded-xl border text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all ${
                        isOptimizing || isGenerating || isGeneratingGrokVideo
                          ? 'bg-zinc-800 border-zinc-700 text-zinc-400 opacity-60 cursor-not-allowed'
                          : !isStep3Enabled
                          ? 'bg-zinc-900/60 border-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed'
                          : isStep3Done
                          ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                          : 'bg-fuchsia-950/40 hover:bg-fuchsia-900/60 border-fuchsia-500/50 text-fuchsia-300 shadow-[0_0_20px_rgba(217,70,239,0.25)] hover:scale-[1.005]'
                      }`}
                    >
                      {isOptimizing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          AI 기획 분석 중...
                        </>
                      ) : isStep3Done ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          ✅ AI 기획 완료 (재기획은 클릭)
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4 text-fuchsia-400" />
                          ▶ AI 기획 시작
                        </>
                      )}
                    </button>
                  </div>
                );
              })()}

              {/* AI 기획 결과 (자동 채움, 직접 수정 가능) */}
              {optimizedPrompt.trim() && (
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-indigo-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      AI 기획 결과
                    </span>
                    <span className="text-[10px] sm:text-xs text-zinc-400 font-mono">
                      직접 수정 가능
                    </span>
                  </div>
                  <textarea
                    value={optimizedPrompt}
                    onChange={(e) => setOptimizedPrompt(e.target.value)}
                    placeholder="AI 최적화 결과가 여기에 채워집니다."
                    className="w-full h-40 bg-black/50 border border-white/15 rounded-xl p-3.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none font-mono leading-relaxed font-medium"
                  />
                </div>
              )}
            </div>

            {/* Step 4: 가사 확인 & 음원 생성 */}
            <div className={`space-y-4 pt-2 transition-all duration-300 ${!optimizedPrompt.trim() ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono shrink-0 ${
                      !optimizedPrompt.trim()
                        ? 'bg-zinc-800 border border-zinc-700 text-zinc-500'
                        : generatedResult
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                    }`}>{generatedResult ? <Check className="w-3 h-3" /> : '4'}</div>
                    가사 확인 & 음원 생성 (최대 {currentCharLimit}자)
                    {!optimizedPrompt.trim() && <Lock className="w-3.5 h-3.5 text-zinc-500 ml-1" />}
                  </h3>
                  <span className={`text-xs font-mono font-black ${customLyrics.length > currentCharLimit ? "text-red-400" : "text-zinc-400"}`}>
                    {customLyrics.length} / {currentCharLimit}자
                  </span>
                </div>

                {/* 퀵 태그 버튼 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-300 font-bold">B급 태그:</span>
                  {[
                    { label: '[Shout]', icon: <Zap className="w-3 h-3" /> },
                    { label: '[Laughing]', icon: <Smile className="w-3 h-3" /> },
                    { label: '(더블링)', icon: <Mic2 className="w-3 h-3" /> },
                  ].map(tag => (
                    <button
                      key={tag.label}
                      type="button"
                      onClick={() => insertTextAtCursor(tag.label)}
                      className="px-3 py-1.5 text-xs font-extrabold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      {tag.icon}
                      {tag.label}
                    </button>
                  ))}
                </div>

                <textarea
                  ref={textareaRef}
                  value={customLyrics}
                  onChange={(e) => {
                    if (e.target.value.length <= currentCharLimit) setCustomLyrics(e.target.value);
                  }}
                  disabled={!optimizedPrompt.trim()}
                  className={`w-full h-[220px] bg-black/50 border rounded-xl p-4 text-xs sm:text-sm leading-relaxed font-mono focus:outline-none resize-none font-medium ${
                    !optimizedPrompt.trim()
                      ? 'border-white/5 text-zinc-600 cursor-not-allowed opacity-50'
                      : 'border-white/15 text-white focus:border-indigo-500'
                  }`}
                  placeholder={
                    !optimizedPrompt.trim()
                      ? "🔒 Step 3에서 AI 기획 분석을 완료하면 이 영역이 활성화됩니다."
                      : "위에서 선택한 트렌드/풍자 템플릿과 세부 상황을 바탕으로 [AI 기획 분석] 버튼을 누르면, AI가 3초 룰 최적화 가사를 자동으로 작사합니다!"
                  }
                />
                <p className="text-xs text-zinc-400 leading-normal">
                  <span className="inline-flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                    한 행당 10~14글자 내외로 작성하고 쉼표(,)나 마침표(.)를 찍으면 AI의 발음이 훨씬 정확해집니다.
                  </span>
                </p>
              </div>

              {/* 공개/비공개 토글 + 약관 */}
              <div className="p-4 bg-zinc-950/60 border border-white/10 rounded-2xl space-y-2.5 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-black text-white">🌐 바이럴 & 트렌드 존 공개</span>
                    <button
                      type="button"
                      onClick={() => setShowTerms(!showTerms)}
                      className="text-xs text-rose-400/80 hover:text-rose-400 underline font-bold transition-colors"
                    >
                      약관 보기
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPublic(!isPublic)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      isPublic ? 'bg-rose-500' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isPublic ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-zinc-400 font-medium">
                  {isPublic
                    ? '✅ 생성된 곡이 바이럴 & 트렌드 존에 공개됩니다'
                    : '🔒 비공개 — 내 히스토리에서만 확인할 수 있습니다'}
                </p>
                {/* 약관 내용 */}
                {showTerms && (
                  <div className="mt-2 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 leading-relaxed space-y-1.5">
                    <p className="font-bold text-zinc-200 border-b border-zinc-800 pb-1 flex items-center gap-1.5">📋 바이럴 & 트렌드 존 공개 약관</p>
                    <p>1. 🔒 <strong>원작자 식별 ID 절대 비공개</strong>: 원작자의 고유 ID는 외부에 절대 노출되지 않고 시스템 내부에서 암호화 처리됩니다.</p>
                    <p>2. 🛡️ <strong>저작권 및 상업적 권리 유지</strong>: 공개하더라도 귀하의 음원에 대한 소유권 및 상업적 권리에는 영향을 주지 않습니다.</p>
                    <p>3. 🌐 <strong>프롬프트 공유 및 감상</strong>: 다른 사용자가 템플릿 제작이나 곡을 감상하는 용도로만 노출됩니다.</p>
                    <p>4. 🔄 <strong>언제든 상태 변경 가능</strong>: 언제든지 비공개 상태로 즉각 전환할 수 있습니다.</p>
                  </div>
                )}
              </div>

              {/* 생성 버튼 — 맥박 pulse ring 효과 */}
              {(() => {
                const isReadyToGenerate = !!(optimizedPrompt.trim() && (customLyrics.trim() || customTopic.trim())) && !isOptimizing;

                return (
                  <div className="relative">
                    {!isGenerating && isReadyToGenerate && (
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 opacity-40 blur-xl animate-pulse pointer-events-none" />
                    )}
                    <button
                      onClick={handleGenerate}
                      disabled={isGenerating || isOptimizing || isGeneratingGrokVideo || !isReadyToGenerate}
                      className={`relative w-full py-5 rounded-2xl text-base sm:text-lg font-black tracking-tight flex items-center justify-center gap-2.5 transition-all ${
                        isGenerating || isOptimizing || isGeneratingGrokVideo || !isReadyToGenerate
                          ? 'bg-zinc-900 border border-zinc-800 text-zinc-500 opacity-50 cursor-not-allowed'
                          : 'bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white border border-cyan-400/40 shadow-[0_0_35px_rgba(6,182,212,0.4)] hover:shadow-[0_0_50px_rgba(6,182,212,0.5)] hover:scale-[1.01] active:scale-[0.99]'
                      }`}
                    >
                      {isGenerating ? (
                        <div className="w-full flex items-center justify-between px-4">
                          <div className="flex items-center gap-2.5">
                            <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                            <span className="text-xs sm:text-sm font-bold text-zinc-300">Suno V5.5 실시간 믹싱 중... ({genProgress}%)</span>
                          </div>
                          <div className="w-28 bg-zinc-700 h-2 rounded-full overflow-hidden">
                            <div style={{ width: `${genProgress}%` }} className="bg-cyan-400 h-full transition-all duration-500" />
                          </div>
                        </div>
                      ) : isGeneratingGrokVideo ? (
                        <>
                          <Film className="w-5 h-5 text-fuchsia-400 animate-pulse" />
                          🎬 음원 완료 → Step 5에서 영상 생성 가능
                        </>
                      ) : isOptimizing ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin text-fuchsia-400" />
                          AI 기획 분석 진행 중... (Step 3)
                        </>
                      ) : !isReadyToGenerate ? (
                        <>
                          <Sparkles className="w-5 h-5 text-zinc-500" />
                          🔒 Step 3 (AI 기획) 완료 후 활성화됩니다
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-6 h-6 text-yellow-300 animate-bounce" />
                          🚀 음원 생성하기 (Suno V5.5 바이럴 숏폼)
                        </>
                      )}
                    </button>
                  </div>
                );
              })()}

              {/* ─── 🎵 [결과 1] 생성된 바이럴 숏폼 음원 카드 (Card 1 영역 하단 즉시 배치) ─── */}
              {generatedResult && (
                <div className="mt-5 p-5 rounded-2xl bg-indigo-950/50 border border-cyan-500/50 space-y-3.5 shadow-2xl relative overflow-hidden animate-fadeIn">
                  <div className="flex items-center justify-between flex-wrap gap-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />
                      <h4 className="text-sm font-black text-white">{generatedResult.title}</h4>
                      {audioDuration > 0 && (
                        <span className="text-xs font-mono font-bold text-cyan-300 px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 shadow-sm flex items-center gap-1">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          <span>⏱️ {audioDuration.toFixed(1)}초</span>
                        </span>
                      )}
                    </div>
                    <a
                      href={generatedResult.audio_url}
                      download={`${generatedResult.title || 'viral_audio'}.mp3`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-black text-white px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5" /> MP3 음원 다운로드
                    </a>
                  </div>

                  {/* 음원 오디오 플레이어 */}
                  <div className="p-3.5 bg-black/70 border border-white/10 rounded-xl flex items-center gap-3 shadow-inner">
                    <button
                      type="button"
                      onClick={() => togglePlay()}
                      className="w-10 h-10 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black flex items-center justify-center font-black transition-all shadow-md shrink-0 cursor-pointer active:scale-95"
                    >
                      {isPlaying && currentPlayingTrack?.id === generatedResult.id ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-extrabold text-cyan-300 truncate">{generatedResult.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{generatedResult.genre || 'Suno V5.5 Vocal Mix'}</p>
                    </div>
                    <audio
                      ref={audioRef}
                      src={generatedResult.audio_url}
                      controls
                      onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
                      className="h-8 max-w-[200px]"
                    />
                  </div>

                  {/* ✅ 음원 완료 → Step 5 영상 생성 안내 */}
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-400" />
                      ✅ 음원 생성 완료! 아래 Step 5에서 AI 영상을 만들어 보세요
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        step4CardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="text-xs font-extrabold text-fuchsia-300 hover:text-fuchsia-200 bg-fuchsia-950/60 border border-fuchsia-500/40 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all shadow-md active:scale-95"
                    >
                      ↓ Step 5 AI 영상 생성으로 이동
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Step 5: 🎬 AI 영상 생성 ─── */}
            <div ref={step4CardRef} className={`mt-8 p-6 rounded-3xl bg-black/60 border space-y-5 shadow-2xl relative transition-all duration-300 ${
              !generatedResult
                ? 'border-zinc-800 opacity-40 pointer-events-none'
                : 'border-fuchsia-500/40'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md ${
                    !generatedResult
                      ? 'bg-zinc-800 border border-zinc-700'
                      : grokVideoResult
                      ? 'bg-gradient-to-tr from-emerald-500 to-emerald-600'
                      : 'bg-gradient-to-tr from-fuchsia-500 to-purple-600'
                  }`}>
                    {grokVideoResult ? <Check className="w-4 h-4" /> : '5'}
                  </div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    🎬 AI 영상 생성
                    {!generatedResult && <Lock className="w-4 h-4 text-zinc-500 ml-1" />}
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                      {!generatedResult ? '🔒 음원 생성 후 활성화' : '⚡ 9:16 비디오 + 음원 FFmpeg Muxing'}
                    </span>
                  </h3>
                </div>

                {/* 하이브리드 자동화 토글 버튼 (기본: OFF 🔴) */}
                <div className="flex items-center gap-2.5 bg-black/40 border border-white/10 px-3 py-1.5 rounded-full">
                  <span className="text-[11px] font-bold text-zinc-300">음원 생성 시 자동 비디오 연동</span>
                  <button
                    type="button"
                    onClick={() => setAutoGrokVideo(!autoGrokVideo)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      autoGrokVideo ? 'bg-fuchsia-500' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        autoGrokVideo ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${autoGrokVideo ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'bg-zinc-800 text-zinc-400'}`}>
                    {autoGrokVideo ? 'ON (자동)' : 'OFF (수동 검증)'}
                  </span>
                </div>
              </div>

                <div className="p-4 rounded-2xl bg-zinc-950/70 border border-white/10 space-y-3">
                  {/* 대상 음원 선택 셀렉트 드롭다운 */}
                  <div className="flex items-center justify-between text-xs text-zinc-300 bg-black/60 border border-white/10 px-3.5 py-2.5 rounded-xl flex-wrap gap-2.5">
                    <label className="flex items-center gap-1.5 font-black text-fuchsia-400 shrink-0">
                      <Music4 className="w-4 h-4 text-fuchsia-400" />
                      합성 대상 음원 선택:
                    </label>
                    <select
                      value={selectedGrokTrackId || (selectedGrokTrack?.id ? String(selectedGrokTrack.id) : '')}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setSelectedGrokTrackId(newId);
                        const targetTrack = availableTracks.find(t => String(t.id) === String(newId)) || (String(generatedResult?.id) === newId ? generatedResult : null) || (String(currentPlayingTrack?.id) === newId ? currentPlayingTrack : null);
                        if (targetTrack) {
                          fetchDynamicGrokPrompt(targetTrack).then(p => {
                            if (p) setGrokVideoPrompt(p);
                          });
                        }
                      }}
                      className="bg-zinc-900 text-white font-bold border border-fuchsia-500/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-fuchsia-400 flex-1 min-w-[220px] cursor-pointer shadow-sm hover:border-fuchsia-400 transition-colors"
                    >
                      {generatedResult && (
                        <option value={String(generatedResult.id)}>
                          ✨ [방금 생성된 곡] {generatedResult.title}
                        </option>
                      )}
                      {currentPlayingTrack && String(currentPlayingTrack.id) !== String(generatedResult?.id) && (
                        <option value={String(currentPlayingTrack.id)}>
                          🎧 [현재 재생 중] {currentPlayingTrack.title || currentPlayingTrack.name}
                        </option>
                      )}
                      {availableTracks.map((t) => (
                        <option key={t.id} value={String(t.id)}>
                          🎵 {t.title || '바이럴 음원'} ({t.genre || t.tags?.[0] || 'Master Quality'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                      <Video className="w-4 h-4 text-fuchsia-400" />
                      Grok Imagine 30초 비디오 프롬프트 & 한글 자막 스크립트
                    </label>
                    <button
                      type="button"
                      onClick={handleTuneGrokPrompt}
                      className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30 hover:bg-cyan-900/50 transition-all"
                    >
                      <Sparkles className="w-3 h-3 text-cyan-400 animate-spin" />
                      🎬 가사 맞춤 한글 자막 자동 추출
                    </button>
                  </div>

                  <textarea
                    rows={4}
                    value={grokVideoPrompt}
                    onChange={(e) => setGrokVideoPrompt(e.target.value)}
                    placeholder="Grok 30초 한글자막 비디오 생성 프롬프트..."
                    className="w-full bg-black/60 border border-white/10 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:border-fuchsia-500/50 resize-none font-mono leading-relaxed"
                  />

                  {/* 🎬 2단계 비디오 결과 표시 영역 (하단 중복 버튼 제거, 순수 결과물 노출) */}
                  {isGeneratingGrokVideo ? (
                    <div className="p-6 rounded-2xl bg-zinc-900/90 border border-fuchsia-500/40 flex flex-col items-center justify-center text-center space-y-3 shadow-inner">
                      <RefreshCw className="w-8 h-8 animate-spin text-fuchsia-400" />
                      <p className="text-sm font-extrabold text-white">🎬 Grok Imagine 30초 AI 비디오 렌더링 중... ({grokVideoProgress}%)</p>
                      <p className="text-xs text-zinc-400">가사 맞춤 9:16 비디오 렌더링 및 멜로디오 30초 음원 FFmpeg 인코딩 중입니다.</p>
                    </div>
                  ) : grokVideoError ? (
                    <div className="p-6 rounded-2xl bg-zinc-900/90 border border-red-500/40 flex flex-col items-center justify-center text-center space-y-3 shadow-inner">
                      <AlertTriangle className="w-8 h-8 text-red-400" />
                      <p className="text-sm font-extrabold text-red-300">⚠️ Grok 영상 생성 실패</p>
                      <p className="text-xs text-zinc-400 max-w-md break-all">{grokVideoError}</p>
                      <p className="text-[11px] text-zinc-500">음원은 정상 생성되었습니다. 영상만 재시도할 수 있습니다.</p>
                      <button
                        type="button"
                        onClick={() => handleGenerateGrokVideo()}
                        disabled={isGeneratingGrokVideo}
                        className="mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white text-sm font-extrabold flex items-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50"
                      >
                        <RotateCcw className="w-4 h-4" />
                        🎬 영상만 재시도 (음원 유지)
                      </button>
                    </div>
                  ) : !grokVideoResult ? (
                    <div className="p-8 rounded-2xl bg-zinc-900/40 border border-dashed border-white/10 flex flex-col items-center justify-center text-center space-y-2">
                      <Video className="w-8 h-8 text-zinc-600 animate-pulse" />
                      <p className="text-sm font-bold text-zinc-300">🎬 AI 숏폼 비디오 결과 보관함</p>
                      <p className="text-xs text-zinc-500 max-w-md">Step 4에서 음원을 생성한 후, 이곳에서 AI 영상을 생성할 수 있습니다.</p>
                    </div>
                  ) : null}

                  {/* 생성된 비디오 프리뷰 및 보관함 안내 */}
                  {grokVideoResult && (
                    <div className="mt-4 p-4 rounded-2xl bg-black/80 border border-cyan-500/40 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-cyan-400" />
                          Grok 코믹 AI 비디오 + 멜로디오 음원 결합 완료!
                        </span>
                        <div className="flex items-center gap-2">
                          {grokVideoDuration > 0 && (
                            <span className="text-[11px] font-mono font-bold text-cyan-300 px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-cyan-400 animate-pulse" />
                              <span>⏱️ {grokVideoDuration.toFixed(1)}초</span>
                              <span className="text-[9px] text-cyan-200 bg-cyan-500/20 px-1 py-0.5 rounded ml-0.5">
                                {grokVideoDuration <= 30 ? '🛡️ 30초 과금 안전구역' : '⚠️ 30초 초과'}
                              </span>
                            </span>
                          )}
                          <a
                            href={grokVideoResult}
                            download={`grok_short_30s_${Date.now()}.mp4`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-white px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 flex items-center gap-1.5 transition-all shadow-md"
                          >
                            <Download className="w-3.5 h-3.5" /> 쇼츠 MP4 다운로드
                          </a>
                          <button
                            type="button"
                            onClick={() => handleGenerateGrokVideo()}
                            disabled={isGeneratingGrokVideo}
                            className="text-[11px] font-bold text-white px-3.5 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> 영상 재생성
                          </button>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-900/90 border border-fuchsia-500/30 text-xs space-y-1.5">
                        <p className="text-fuchsia-300 font-bold flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
                          🎬 Grok Imagine 비디오 생성 프롬프트 (가사 맞춤 실시간 매핑):
                        </p>
                        <p className="text-cyan-300 font-mono text-[11px] bg-black/60 p-2.5 rounded-lg border border-cyan-500/30 break-all leading-relaxed">
                          {grokVideoPrompt || '프롬프트 로딩 중...'}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 text-[11px] text-zinc-400 space-y-1">
                        <p className="text-white font-bold flex items-center gap-1">
                          📁 생성된 29.5초 풀 쇼츠 비디오 구성 및 보관 위치:
                        </p>
                        <p>1. 🎬 <strong>29.5초 코믹 숏폼 MP4</strong>: B급 코믹 뮤비 연출(Snap-zoom, 0.5x wide, whip-pan) 렌더링 및 멜로디오 음원 인코딩 완료 (15초 3단계 과금 방어 적용).</p>
                        <p>2. 🔒 <strong>내 보관함 (Vault / 히스토리)</strong>: 데이터베이스에 자동 영구 보관되며 언제든 재다운로드 가능합니다.</p>
                      </div>

                      <div className="relative aspect-[9/16] max-w-[220px] mx-auto rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-zinc-900">
                        <video
                          ref={previewVideoRef}
                          src={grokVideoResult}
                          controls
                          autoPlay
                          loop
                          onLoadedMetadata={(e) => {
                            setGrokVideoDuration(e.currentTarget.duration);
                          }}
                          onPlay={() => {
                            if (audioRef.current && !audioRef.current.paused) {
                              audioRef.current.pause();
                              setIsPlaying(false);
                            }
                          }}
                          onPause={() => {
                            if (audioRef.current) {
                              audioRef.current.pause();
                              setIsPlaying(false);
                            }
                          }}
                          onSeeking={() => {
                            if (audioRef.current && previewVideoRef.current) {
                              audioRef.current.currentTime = previewVideoRef.current.currentTime;
                            }
                          }}
                          onTimeUpdate={() => {
                            if (audioRef.current && previewVideoRef.current) {
                              const vidTime = previewVideoRef.current.currentTime;
                              const audTime = audioRef.current.currentTime;
                              if (Math.abs(audTime - vidTime) > 0.4 || vidTime < 0.2) {
                                audioRef.current.currentTime = vidTime;
                                if (!audioRef.current.paused) {
                                  audioRef.current.play().catch(() => {});
                                }
                              }
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
      </div>


      {/* ─── Bottom Player Bar ─── */}
      <AnimatePresence>
        {playingId && currentPlayingTrack && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 left-0 md:left-64 right-0 z-50 bg-zinc-950/95 border-t border-white/10 backdrop-blur-xl px-6 py-3 shadow-2xl flex items-center justify-between"
          >
            {/* Track Info (Left) */}
            <div className="flex items-center gap-3.5 min-w-[240px] max-w-[320px] shrink-0">
              <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-zinc-900 border border-white/10 shadow-md relative">
                <img 
                  src={currentPlayingTrack.thumbnailUrl || currentPlayingTrack.thumbnail_url || currentPlayingTrack.coverUrl || CATEGORY_THUMBNAIL_MAP[genCategory] || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80'} 
                  alt={currentPlayingTrack.title || currentPlayingTrack.name || 'Viral Track'}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate leading-tight">
                  {currentPlayingTrack.title || currentPlayingTrack.name || 'Viral Short-Form Anthem'}
                </h4>
                <p className="text-[10px] text-zinc-400 font-mono mt-1 truncate">
                  {currentPlayingTrack.genre || 'Viral Shorts'} • {currentPlayingTrack.vocal || currentPlayingTrack.userName || 'Master Quality'}
                </p>
              </div>
            </div>

            {/* Playback Controls (Center) */}
            <div className="flex flex-col items-center gap-1.5 flex-1 max-w-xl px-4">
              <div className="flex items-center justify-center gap-6">
                {/* Shuffle */}
                <button 
                  onClick={() => setIsShuffle(!isShuffle)}
                  className={`transition-all p-1.5 rounded-lg ${
                    isShuffle 
                      ? "text-white bg-white/10 hover:bg-white/15" 
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title={isShuffle ? "셔플 재생 해제" : "셔플 재생 설정"}
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                {/* SkipBack */}
                <button
                  onClick={() => {
                    if (audioRef.current) audioRef.current.currentTime = 0;
                  }}
                  className="text-zinc-400 hover:text-white transition-colors p-1"
                  title="처음부터 재생"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>

                {/* Play/Pause */}
                <button 
                  onClick={() => handleTogglePlay(currentPlayingTrack.id, currentPlayingTrack.audioUrl)}
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg cursor-pointer"
                  title={isPlaying ? "일시정지" : "재생"}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-black text-black" />
                  ) : (
                    <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                  )}
                </button>

                {/* SkipForward */}
                <button
                  onClick={() => {
                    if (audioRef.current) audioRef.current.currentTime = audioDuration;
                  }}
                  className="text-zinc-400 hover:text-white transition-colors p-1"
                  title="끝으로 이동"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>

                {/* Repeat */}
                <button 
                  onClick={() => setIsRepeat(!isRepeat)}
                  className={`transition-all p-1.5 rounded-lg ${
                    isRepeat 
                      ? "text-white bg-white/10 hover:bg-white/15" 
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title={isRepeat ? "반복 재생 해제" : "한 곡 반복 설정"}
                >
                  <Repeat className="w-4 h-4" />
                </button>
              </div>

              {/* Timeline Slider */}
              <div className="flex items-center gap-2.5 w-full">
                <span className="text-[10px] text-zinc-400 font-mono w-9 text-right">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (audioRef.current) {
                      audioRef.current.currentTime = val;
                      setCurrentTime(val);
                    }
                  }}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: '#ffffff',
                    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${(audioDuration > 0 ? (currentTime / audioDuration) : 0) * 100}%, rgba(255,255,255,0.15) ${(audioDuration > 0 ? (currentTime / audioDuration) : 0) * 100}%)`,
                  }}
                />
                <span className="text-[10px] text-zinc-400 font-mono w-9">
                  {formatTime(audioDuration)}
                </span>
              </div>
            </div>

            {/* Volume Control, Copy Link & Close (Right) */}
            <div className="flex items-center justify-end gap-3 w-1/4">
              {/* ThumbsUp (Like) */}
              <button
                onClick={() => {
                  const songId = currentPlayingTrack.id.toString();
                  setLikedSongs(prev => {
                    const next = new Set(prev);
                    if (next.has(songId)) {
                      next.delete(songId);
                    } else {
                      next.add(songId);
                      setDislikedSongs(d => { const n = new Set(d); n.delete(songId); return n; });
                    }
                    return next;
                  });
                }}
                className={`p-2 rounded-lg transition-colors ${
                  likedSongs.has(currentPlayingTrack.id.toString()) ? "text-emerald-400 bg-emerald-400/10" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="좋아요"
              >
                <ThumbsUp className="w-4 h-4" />
              </button>

              {/* ThumbsDown (Dislike) */}
              <button
                onClick={() => {
                  const songId = currentPlayingTrack.id.toString();
                  setDislikedSongs(prev => {
                    const next = new Set(prev);
                    if (next.has(songId)) {
                      next.delete(songId);
                    } else {
                      next.add(songId);
                      setLikedSongs(l => { const n = new Set(l); n.delete(songId); return n; });
                    }
                    return next;
                  });
                }}
                className={`p-2 rounded-lg transition-colors ${
                  dislikedSongs.has(currentPlayingTrack.id.toString()) ? "text-red-400 bg-red-400/10" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="싫어요"
              >
                <ThumbsDown className="w-4 h-4" />
              </button>

              {/* Copy Song Link Button */}
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}/vault/share-${currentPlayingTrack.id}`;
                  navigator.clipboard.writeText(shareUrl);
                  setCopiedLinkTrackId(currentPlayingTrack.id.toString());
                  setTimeout(() => setCopiedLinkTrackId(null), 2000);
                }}
                className="p-2 rounded-lg text-zinc-400 hover:text-white transition-colors"
                title="곡 링크 복사"
              >
                {copiedLinkTrackId === currentPlayingTrack.id.toString() ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Link className="w-4 h-4" />
                )}
              </button>

              <div className="flex items-center gap-2 group/volume ml-1">
                <button
                  onClick={() => {
                    setVolume(prev => prev === 0 ? 0.8 : 0);
                  }}
                  className="text-zinc-400 hover:text-white p-1 transition-colors"
                  title={volume === 0 ? "음소거 해제" : "음소거"}
                >
                  {volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: '#ffffff',
                    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%)`,
                  }}
                />
              </div>

              {/* Close Player Button */}
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                  }
                  setIsPlaying(false);
                  setPlayingId(null);
                }}
                className="text-zinc-500 hover:text-white p-1.5 transition-colors ml-1"
                title="플레이어 닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Pro 업그레이드 유도 모달 ─── */}
      <AnimatePresence>
        {isUpgradeModalOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={() => setIsUpgradeModalOpen(false)}
          >
            <div 
              className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-5 flex flex-col relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button 
                onClick={() => setIsUpgradeModalOpen(false)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex justify-center pt-2">
                <div className="w-14 h-14 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
                  <Lock className="w-6 h-6" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-white text-base font-bold">
                  💎 Pro 전용 프리미엄 스타일
                </h3>
                <p className="text-zinc-400 text-xs leading-relaxed px-2">
                  이 스타일의 상세 레시피(프롬프트, 가사 테마 복사) 및 음악 생성 기능은 **Pro 요금제 전용** 서비스입니다.
                </p>
                <p className="text-zinc-500 text-[10.5px] leading-relaxed">
                  ※ 각 섹션의 첫 번째 샘플곡 상세 정보만 체험으로 무료 제공됩니다.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    setIsUpgradeModalOpen(false);
                    router.push('/settings');
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-fuchsia-600 to-cyan-500 hover:shadow-[0_0_15px_rgba(192,38,211,0.4)] text-white text-xs font-semibold rounded-xl transition-all"
                >
                  Pro 요금제로 업그레이드
                </button>
                <button
                  onClick={() => setIsUpgradeModalOpen(false)}
                  className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold rounded-xl transition-all"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
