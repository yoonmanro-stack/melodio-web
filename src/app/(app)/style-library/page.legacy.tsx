"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Search, Copy, Check, BookmarkPlus, Music2, Zap, Waves, Mic2, Guitar, Drum, Play, Pause, FileText, SkipBack, SkipForward, Shuffle, Repeat, Sparkles, Trash2, Pencil, Heart, X, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, Volume2, VolumeX, Lock, Link, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import CreatePresetModal from "@/components/prompt-builder/CreatePresetModal";
import PromptBuilder from "@/components/prompt-builder/PromptBuilder";
import PublicTrackGrid from "@/components/prompt-builder/PublicTrackGrid";
import { registerActiveAudio } from "@/lib/globalAudio";

function formatTime(sec: number): string {
  if (isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 프리셋 장르/컨셉에 맞춘 프리미엄 썸네일 헬퍼 ───
const COVER_IMAGE_PALETTE = [
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png"
];

const PRESET_AUDIO_POOL = [
  "https://file.302.ai/gpt/imgs/20260721/b66ef6378e90637fd6fa0bd4ceae5c2a.mp3",
  "https://file.302.ai/gpt/imgs/20260721/bfe3e4d9f67efae7ebec1dd50b696ee3.mp3",
  "https://file.302.ai/gpt/imgs/20260721/db2d8d80f833a695bcefa7b4b1a43a05.mp3",
  "https://file.302.ai/gpt/imgs/20260721/6b4fb245781a700084f7bbd743a18a99.mp3",
  "https://file.302.ai/gpt/imgs/20260721/f8430ea6c836ec4ff4995f6efdf2a16d.mp3",
  "https://file.302.ai/gpt/imgs/20260721/9ceee5c56cbfccdf46ebddc932bfbc63.mp3",
  "https://file.302.ai/gpt/imgs/20260721/3c2a38210fe522646d6b2b6241c2c31e.mp3",
  "https://file.302.ai/gpt/imgs/20260721/e3328e686cfc49d885d500980fae81bd.mp3",
  "https://file.302.ai/gpt/imgs/20260721/bc3a2a5f8bccbbd366d2cebbd99cd130.mp3",
  "https://file.302.ai/gpt/imgs/20260721/7151048b61c9ec8d098e9dd2ca3ec1e6.mp3",
  "https://file.302.ai/gpt/imgs/20260721/80518f87ed0d35ae6ed1a14a796e6d1e.mp3",
  "https://file.302.ai/gpt/imgs/20260722/6614e2045fdbef25fd4ad2f8aaf77240.mp3",
  "https://file.302.ai/gpt/imgs/20260721/846366722c5740689ce76d827b7f8083.mp3",
  "https://file.302.ai/gpt/imgs/20260721/c50d906c878145a1abcf9a9acd87c6af.mp3",
  "https://file.302.ai/gpt/imgs/20260721/80c471b756dc4fc397daa5ad1b45bbd2.mp3",
  "https://file.302.ai/gpt/imgs/20260721/a09182e8758936a6da62992dc14b5d40.mp3",
  "https://file.302.ai/gpt/imgs/20260721/6b6b16e458a284549c23450e69b74b75.mp3",
  "https://file.302.ai/gpt/imgs/20260721/2d05615eaa0a9128e122dcb61d836969.mp3",
  "https://file.302.ai/gpt/imgs/20260721/ff29bbfec047fcfcec08931f70e87563.mp3",
  "https://file.302.ai/gpt/imgs/20260721/454d845f5e0f5eab08c467f9c44239fe.mp3",
  "https://file.302.ai/gpt/imgs/20260721/a98e47c8e72532ec9bedf58c7706ec0b.mp3",
  "https://file.302.ai/gpt/imgs/20260721/cfd533909f68a8ddbf28204ad7782803.mp3",
  "https://file.302.ai/gpt/imgs/20260721/77a0f845cfc0ee3c394ccddba0d58638.mp3",
  "https://file.302.ai/gpt/imgs/20260720/d931b9e82957a5086edb678d27e1ae05.mp3",
  "https://file.302.ai/gpt/imgs/20260720/b40f8b7f9a424573be49fb22c0fd2957.mp3",
  "https://file.302.ai/gpt/imgs/20260720/d4d5ab6094f165fcaa8f4b4b91da3284.mp3",
  "https://file.302.ai/gpt/imgs/20260720/30c4712a4c654d68c3b3c38659845b91.mp3"
];

const getFallbackCoverArtForPreset = (style: any): string => {
  if (!style) return COVER_IMAGE_PALETTE[0];
  if (style.thumbnailUrl && style.thumbnailUrl.startsWith('http')) {
    return style.thumbnailUrl;
  }
  const nameStr = String(style.name || style.title || "").toLowerCase();
  const tagStr = String(style.tags || style.prompt || "").toLowerCase();
  const combinedStr = `${nameStr} ${tagStr}`;

  if (combinedStr.includes('phonk') || combinedStr.includes('cyber') || combinedStr.includes('dystopian')) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png";
  }
  if (combinedStr.includes('lofi') || combinedStr.includes('lo-fi') || combinedStr.includes('study')) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png";
  }
  if (combinedStr.includes('afro') || combinedStr.includes('reggae') || combinedStr.includes('ethnic')) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png";
  }
  if (combinedStr.includes('rock') || combinedStr.includes('metal') || combinedStr.includes('punk')) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png";
  }
  if (combinedStr.includes('pop') || combinedStr.includes('dance') || combinedStr.includes('disco')) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png";
  }
  if (combinedStr.includes('nature') || combinedStr.includes('acoustic') || combinedStr.includes('forest') || combinedStr.includes('새소리') || combinedStr.includes('바람')) {
    return "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png";
  }

  const key = String(style.id || style.name || style.title || "");
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COVER_IMAGE_PALETTE.length;
  return COVER_IMAGE_PALETTE[index];
};

const FREE_STYLE_IDS = new Set<string | number>([1, 4, "trot", "korean-trot"]);

const SHOWCASE_TRACKS = [
  {
    id: "showcase-rock",
    title: "Neon Overdrive",
    genre: "Rock",
    vocal: "Male Power Vocals",
    tags: "Heavy rock, 125 BPM, overdrive electric guitar solos, heavy rock drum machine punch, stadium concert reverb, analog valve distortion, raw energetic performance",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/7151048b61c9ec8d098e9dd2ca3ec1e6.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    lyrics: "Running through the neon rain, electric lines inside my brain\nWe are the future that they feared, binary dust that disappeared...",
    countInfo: "Suno 5.5 • 24곡 일괄 패키지",
    color: "from-purple-950 to-indigo-950",
    glowColor: "rgba(168,85,247,0.3)"
  },
  {
    id: "showcase-gospel",
    title: "Grace Abounds",
    genre: "Gospel",
    vocal: "Soulful Choir",
    tags: "Uplifting gospel choir, 78 BPM, warm church organ chords, handclaps, high ceiling hall reverb, warm dual vocal harmonization, authentic black gospel vibe",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/80518f87ed0d35ae6ed1a14a796e6d1e.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    lyrics: "Hallelujah, praise the light that guides us through the night...",
    countInfo: "Suno 5.5 • 16곡 일괄 패키지",
    color: "from-amber-950 to-orange-950",
    glowColor: "rgba(245,158,11,0.3)"
  },
  {
    id: "showcase-pop",
    title: "Summer Heartbeat",
    genre: "Pop",
    vocal: "Female Dance Pop",
    tags: "Upbeat dance pop, 120 BPM, retro Juno synths, punchy bassline, bright stereo mix, summer festival vibe, radio ready vocal polish",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/b66ef6378e90637fd6fa0bd4ceae5c2a.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    lyrics: "Feel the beat in the warm summer air, dancing all night without a care...",
    countInfo: "Suno 5.5 • 20곡 일괄 패키지",
    color: "from-fuchsia-950 to-indigo-950",
    glowColor: "rgba(217,70,239,0.3)"
  },
  {
    id: "showcase-country",
    title: "Dusty Road Memoirs",
    genre: "Country",
    vocal: "Warm Baritone",
    tags: "Acoustic country, 84 BPM, slide guitar, acoustic guitar picking, warm room reverb, nostalgic storytelling baritone vocal, organic folk drums",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/bfe3e4d9f67efae7ebec1dd50b696ee3.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    lyrics: "Long dusty roads and clear blue skies, counting the miles as the evening dies...",
    countInfo: "Suno 5.5 • 22곡 일괄 패키지",
    color: "from-yellow-950 to-amber-950",
    glowColor: "rgba(234,179,8,0.3)"
  },
  {
    id: "showcase-latin",
    title: "Salsa de la Luna",
    genre: "Latin",
    vocal: "Salsa Chorus",
    tags: "Energetic salsa, 115 BPM, horn brass section, latin conga percussion, driving acoustic piano montuno, bright danceable mix, festive reverb",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/db2d8d80f833a695bcefa7b4b1a43a05.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    lyrics: "Baila bajo la luna llena, olvida toda la pena...",
    countInfo: "Suno 5.5 • 24곡 일괄 패키지",
    color: "from-emerald-950 to-teal-950",
    glowColor: "rgba(16,185,129,0.3)"
  },
  {
    id: "showcase-afrobeats",
    title: "Lagos Sunshine",
    genre: "Afrobeats",
    vocal: "Rhythmic Male",
    tags: "Afrobeats groove, 102 BPM, rhythmic synth brass, heavy percussive bassline, warm low-mid warmth, summer beach party vibe",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/6b4fb245781a700084f7bbd743a18a99.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    lyrics: "Moving to the rhythm under Lagos skies, sunshine in your eyes...",
    countInfo: "Suno 5.5 • 22곡 일괄 패키지",
    color: "from-orange-950 to-red-950",
    glowColor: "rgba(249,115,22,0.3)"
  },
  {
    id: "showcase-lofi",
    title: "Cozy Rain Drops",
    genre: "Lo-Fi",
    vocal: "No Vocal",
    tags: "Chill lofi hiphop, 74 BPM, cozy jazz rhodes chords, vinyl crackle, gentle rain ambient, vintage cassette saturation, mellow boom-bap",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/f8430ea6c836ec4ff4995f6efdf2a16d.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    lyrics: "(Instrumental - Cozy Rain)",
    countInfo: "Suno 5.5 • 18곡 일괄 패키지",
    color: "from-zinc-950 to-stone-950",
    glowColor: "rgba(120,113,108,0.3)"
  },
  {
    id: "showcase-jazz",
    title: "Midnight Jazz Club",
    genre: "Jazz",
    vocal: "Smooth Saxophone",
    tags: "Vintage jazz bar, 65 BPM, slow double bass, brushed drums groove, smooth smoky tenor saxophone lead, nostalgic warm room reverb",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/9ceee5c56cbfccdf46ebddc932bfbc63.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    lyrics: "Late night saxophone whispers in the dark, leaving a vintage mark...",
    countInfo: "Suno 5.5 • 15곡 일괄 패키지",
    color: "from-blue-950 to-indigo-950",
    glowColor: "rgba(59,130,246,0.3)"
  },
  {
    id: "showcase-citypop",
    title: "Tokyo Night Cruiser",
    genre: "City Pop",
    vocal: "Nostalgic Female",
    tags: "Retro Japanese city pop, 112 BPM, slap bassline, shiny digital DX7 synthesizers, 80s pop brass riffs, sparkling stereo production",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/3c2a38210fe522646d6b2b6241c2c31e.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    lyrics: "Cruising down the highway, city lights in our eyes...",
    countInfo: "Suno 5.5 • 25곡 일괄 패키지",
    color: "from-violet-950 to-pink-950",
    glowColor: "rgba(139,92,246,0.3)"
  },
  {
    id: "showcase-trot",
    title: "사랑의 종착역",
    genre: "Trot",
    vocal: "Dual Trot Vocals",
    tags: "Modern Korean Trot pop, 138 BPM, upbeat brass section, acoustic guitar accompaniment, nostalgic trot vocal vibrato, 80s adult contemporary mix",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/e3328e686cfc49d885d500980fae81bd.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    lyrics: "그대 내 사랑의 종착역에 언제쯤 도착하려나...",
    countInfo: "Suno 5.5 • 16곡 일괄 패키지",
    color: "from-rose-950 to-red-950",
    glowColor: "rgba(244,63,94,0.3)"
  },
  {
    id: "showcase-metal",
    title: "Iron Reign",
    genre: "Heavy Metal",
    vocal: "Screaming Male",
    tags: "Heavy metal, 160 BPM, double bass drums, aggressive guitar riffs, screaming male vocals, epic battle vibe, intense energy",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/bc3a2a5f8bccbbd366d2cebbd99cd130.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    lyrics: "Crushing the gears of the broken machine, the darkest fire you've ever seen...",
    countInfo: "Suno 5.5 • 18곡 일괄 패키지",
    color: "from-slate-950 to-neutral-950",
    glowColor: "rgba(100,116,139,0.3)"
  },
  {
    id: "showcase-reggae",
    title: "Island Breeze",
    genre: "Reggae",
    vocal: "Relaxed Male Lead",
    tags: "Root reggae, 76 BPM, offbeat guitar skank, dub delay bass, warm brass section, relaxed male lead vocal, organic percussion",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/a98e47c8e72532ec9bedf58c7706ec0b.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    lyrics: "Walking on the sandy beach, troubles out of reach, feel the sunshine...",
    countInfo: "Suno 5.5 • 15곡 일괄 패키지",
    color: "from-yellow-950 to-green-950",
    glowColor: "rgba(34,197,94,0.3)"
  },
  {
    id: "showcase-synthwave",
    title: "Neon Horizon",
    genre: "Synthwave",
    vocal: "No Vocal",
    tags: "Retro synthwave, 110 BPM, analog retro lead synth, heavy gating snare, retro futuristic vibe, 80s movie soundtrack, spacious",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/cfd533909f68a8ddbf28204ad7782803.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    lyrics: "(Instrumental - Retro Future)",
    countInfo: "Suno 5.5 • 20곡 일괄 패키지",
    color: "from-pink-950 to-purple-950",
    glowColor: "rgba(236,72,153,0.3)"
  },
  {
    id: "showcase-edm",
    title: "Hyper Drop",
    genre: "EDM",
    vocal: "Female Vocal Chops",
    tags: "Modern EDM house, 128 BPM, heavy synth pluck, epic build-up, heavy bass drop, energetic female vocal chops, club ready",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/77a0f845cfc0ee3c394ccddba0d58638.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    lyrics: "Jump into the neon light, dance until the morning light...",
    countInfo: "Suno 5.5 • 25곡 일괄 패키지",
    color: "from-cyan-950 to-blue-950",
    glowColor: "rgba(6,182,212,0.3)"
  },
  {
    id: "showcase-classical",
    title: "Serenade of Spring",
    genre: "Classical",
    vocal: "No Vocal",
    tags: "Orchestral chamber music, 80 BPM, solo violin melody, warm cello accompaniment, grand concert hall reverb, emotional strings",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/d931b9e82957a5086edb678d27e1ae05.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    lyrics: "(Instrumental - Chamber Serenade)",
    countInfo: "Suno 5.5 • 12곡 일괄 패키지",
    color: "from-stone-950 to-amber-950",
    glowColor: "rgba(217,119,6,0.3)"
  },
  {
    id: "showcase-hiphop",
    title: "Concrete Jungle",
    genre: "Hip Hop",
    vocal: "Raw Male Rap",
    tags: "90s boom bap hip hop, 90 BPM, jazzy piano loop, punchy dusty vinyl drums, scratching effects, raw male rap vocals, street vibe",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/b40f8b7f9a424573be49fb22c0fd2957.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    lyrics: "Rhymes on the concrete, concrete streets, feel the city heartbeat...",
    countInfo: "Suno 5.5 • 22곡 일괄 패키지",
    color: "from-zinc-950 to-neutral-950",
    glowColor: "rgba(82,82,82,0.3)"
  },
  {
    id: "showcase-rnb",
    title: "Velvet Whispers",
    genre: "R&B",
    vocal: "Silky Female",
    tags: "Contemporary R&B, 80 BPM, smooth electric piano, 808 sub bass, silky female harmonies, sensual late night mood, slow jam",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/d4d5ab6094f165fcaa8f4b4b91da3284.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    lyrics: "Softly whispered in the dark, lighting up a tiny spark...",
    countInfo: "Suno 5.5 • 16곡 일괄 패키지",
    color: "from-rose-950 to-pink-950",
    glowColor: "rgba(244,63,94,0.3)"
  },
  {
    id: "showcase-folk",
    title: "Pine Forest Breeze",
    genre: "Acoustic Folk",
    vocal: "Soft Dual Harmonies",
    tags: "Acoustic indie folk, 90 BPM, fingerstyle acoustic guitar, whistling, warm room reverb, soft dual harmonies, outdoor camp vibe",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/30c4712a4c654d68c3b3c38659845b91.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    lyrics: "Wind through the pine trees, carrying the summer breeze...",
    countInfo: "Suno 5.5 • 18곡 일괄 패키지",
    color: "from-emerald-950 to-green-950",
    glowColor: "rgba(16,185,129,0.3)"
  },
  {
    id: "showcase-ballad",
    title: "Winter Tears",
    genre: "Ballad",
    vocal: "Powerful Male Lead",
    tags: "Emotional K-Ballad, 72 BPM, grand acoustic piano, sweeping orchestral strings, tear-jerking powerful vocals, high dynamic range",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/7151048b61c9ec8d098e9dd2ca3ec1e6.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    lyrics: "차가운 바람이 불어올 때, 내 맘속 깊은 눈물이 마르지 않네...",
    countInfo: "Suno 5.5 • 15곡 일괄 패키지",
    color: "from-blue-950 to-slate-950",
    glowColor: "rgba(59,130,246,0.3)"
  },
  {
    id: "showcase-funk",
    title: "Groove Station",
    genre: "Funk",
    vocal: "Groovy Backing Vocals",
    tags: "70s funk disco, 118 BPM, slapped bass guitar, wah-wah electric guitar, brass horns, groovy backing vocals, dancefloor ready",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/80518f87ed0d35ae6ed1a14a796e6d1e.mp3",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    lyrics: "Get up and feel the groove, nothing left for you to lose...",
    countInfo: "Suno 5.5 • 22곡 일괄 패키지",
    color: "from-yellow-950 to-orange-950",
    glowColor: "rgba(234,179,8,0.3)"
  }
];



// ──────────────────────────────────────────────
// 1. 장르 목록 (TOP 100 & TOP 200 — Trot, 조선힙합 필수 포함)
// ──────────────────────────────────────────────
const TOP_100_GENRES = [
  "All",
  "Trot",
  "Joseon Hip Hop",
  "Phonk",
  "Hyperpop",
  "Bedroom Pop",
  "Lo-Fi",
  "Drill",
  "Afrobeats",
  "Amapiano",
  "K-Pop",
  "J-Pop",
  "City Pop",
  "Pop",
  "Electronic",
  "Hip Hop",
  "R&B / Soul",
  "Trap",
  "Latin",
  "Reggaeton",
  "Rock",
  "Indie Rock",
  "Shoegaze",
  "Post-Punk",
  "Grunge",
  "Metal",
  "Punk",
  "Emo / Pop Punk",
  "Synthwave",
  "Vaporwave",
  "Future Bass",
  "Drum & Bass",
  "House",
  "Techno",
  "Trance",
  "Celtic",
  "Bossa Nova",
  "Reggae",
  "World / Ethnic",
  "Jazz",
  "Blues",
  "Cinematic",
  "Ambient",
  "New Age",
  "Folk / Acoustic",
  "Gospel / Worship",
  "Country",
  "Meditation",
  "Disco",
  "Funk",
  "Eurodance",
  "Dubstep",
  "EDM",
  "Heavy Metal",
  "Thrash Metal",
  "Hard Rock",
  "Progressive Rock",
  "Psychedelic Rock",
  "Alternative Rock",
  "Indie Pop",
  "Synthpop",
  "Electropop",
  "Trap Latino",
  "Corrido",
  "Salsa",
  "Bachata",
  "Merengue",
  "Tango",
  "Flamenco",
  "Samba",
  "Highlife",
  "Soca",
  "Dancehall",
  "Afro House",
  "Deep House",
  "Tech House",
  "Minimal Techno",
  "Psytrance",
  "Hardstyle",
  "UK Garage",
  "Grime",
  "Boom Bap",
  "Melodic Rap",
  "Cloud Rap",
  "Pluggnb",
  "Rage",
  "Chillhop",
  "Neo Soul",
  "Contemporary R&B",
  "Smooth Jazz",
  "Bebop",
  "Gypsy Jazz",
  "Bluegrass",
  "Americana",
  "Chanson",
  "Enka",
  "Traditional Chinese",
  "Gamelan",
  "Qawwali",
  "Klezmer"
];

const TOP_200_GENRES = [
  ...TOP_100_GENRES,
  "Acid House", "Post-Rock", "Ska", "Math Rock", "Dream Pop", "Art Rock", "Stoner Rock", "Death Metal", "Black Metal", "Folk Metal",
  "Symphonic Metal", "Hardcore Punk", "Noise Rock", "No Wave", "Trip Hop", "Glitch", "Breakcore", "Ambient Techno", "IDM", "Chiptune",
  "Industrial", "EBM", "Darkwave", "Gothic Rock", "Ska Punk", "Hardcore Hip Hop", "Jazz Rap", "Gangsta Rap", "Conscious Hip Hop", "Trap Metal",
  "Jazz Fusion", "Hard Bop", "Cool Jazz", "Free Jazz", "Latin Jazz", "Afro-Cuban Jazz", "Bossa Nova Jazz", "Balkan Brass", "Celtic Punk", "Mariachi",
  "Cumbia", "Bolero", "Fado", "Choro", "MPB", "Afrobeat", "Soukous", "Mbalax", "Juju", "Gnawa",
  "Rai", "Dabke", "Bhangra", "Carnatic", "Hindustani", "Traditional Japanese", "Min'yo", "Traditional Korean", "Pansori", "Guzheng",
  "Guqin", "Erhu", "Morin Khuur", "Throat Singing", "Calypso", "Zouk", "Kompa", "Kizomba", "Semba", "Coladeira",
  "Morna", "Kuduro", "Shangaan Electro", "Kwaito", "Gqom", "Gengetone", "Singeli", "Taarab", "Bongo Flava", "Hiplife",
  "Fuji", "Apala", "Makossa", "Bikutsi", "Coupe-Decale", "Ndombolo", "Zoblazo", "Mapouka", "Tango Nuevo", "Milonga",
  "Chamarrita"
];

// ──────────────────────────────────────────────
// 2. 무드 목록 (최대 15개 감성 라벨링 확장)
// ──────────────────────────────────────────────
const MOODS = [
  "All",
  "Dark",
  "Uplifting",
  "Chill",
  "Energetic",
  "Romantic",
  "Aggressive",
  "Dreamy",
  "Epic",
  "Nostalgic",
  "Mysterious",
  "Melancholic",
  "Euphoric",
  "Groovy",
  "Futuristic",
  "Cozy / Warm"
];

// ──────────────────────────────────────────────
// 2. 스타일 데이터베이스 (장르당 정확히 3개씩 엄선)
// ──────────────────────────────────────────────
const STYLE_DATA = [
  // ── Electronic ──
  {
    id: 1,
    name: "Dark Synthwave",
    genre: "Electronic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    mood: "Dark",
    bpm: "95–110",
    vocal: "Female Whisper",
    tags: "Dark synthwave, 100 BPM, retrofuturistic analog hardware synthesizers, heavy driving Roland Juno-106 bassline, neon-noir cyberpunk atmosphere, Lexicon digital reverb, punchy stereo mix, no autotune",
    color: "from-purple-950 to-indigo-950",
    accent: "purple",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/b66ef6378e90637fd6fa0bd4ceae5c2a.mp3",
    lyrics: `[Intro]\n(Heavy analog synthesizer build-up)\n(Neon lights flickering)\n\n[Verse 1]\nGrid lines glow in the digital haze\nDriving fast in a cyber maze\nAnalog synths in my head collide\nNowhere to run, nowhere to hide\n\n[Chorus]\nWe are the retro future, riding the wave\nCybernetic hearts we could not save\nLost in the synthesizer pulse and drive\nIn the electronic grid, we feel alive`
  },
  {
    id: 2,
    name: "Cyberpunk Bass",
    genre: "Electronic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    mood: "Aggressive",
    bpm: "135–145",
    vocal: "Male Distorted",
    tags: "Dystopian cyberpunk bass, 140 BPM, heavy industrial MS-20 bass, glitchy metallic percussion, dark sci-fi synth leads, gritty analog tape distortion, aggressive warehouse mix, no polish",
    color: "from-cyan-950 to-blue-950",
    accent: "cyan",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/bfe3e4d9f67efae7ebec1dd50b696ee3.mp3",
    lyrics: `[Intro]\n(Heavy industrial bass drops)\n(Metallic sound effects)\n\n[Verse 1]\nSilicon veins and metallic bones\nWalking through the neon zones\nGritty static in the atmosphere\nSystem failure is drawing near\n\n[Chorus]\nReset the network, overwrite the code\nWe are breaking down on this binary road\nGlitch in the matrix, power to the core\nWe don't follow their rules anymore`
  },
  {
    id: 3,
    name: "Chillwave Drift",
    genre: "Electronic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    mood: "Chill",
    bpm: "80–95",
    vocal: "Soft Male",
    tags: "Nostalgic chillwave drift, 88 BPM, vintage synth chords, warm Oberheim pads, slow drum machine groove, sun-drenched tape flutter, dreamy summer reverb, warm low-pass filter",
    color: "from-teal-950 to-emerald-950",
    accent: "teal",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/db2d8d80f833a695bcefa7b4b1a43a05.mp3",
    lyrics: `[Intro]\n(Warm tape hiss, retro synthesizer swell)\n\n[Verse 1]\nSunset fading on the coastline drive\nWarm breeze makes the memories alive\nDreamy chords floating on the sea\nEverything is where it's meant to be\n\n[Chorus]\nDrifting away in a pastel dream\nSlow motion, like a movie scene\nNo need to hurry, just let it flow\nWhere the chillwave synths want us to go`
  },

  // ── Lo-Fi ──
  {
    id: 4,
    name: "Late Night Lo-Fi",
    genre: "Lo-Fi",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    mood: "Chill",
    bpm: "70–80",
    vocal: "No Vocal",
    tags: "Late-night lo-fi hip hop, 75 BPM, cozy jazz chords, vinyl crackle, warm Rhodes piano, gentle rain ambience, vintage cassette saturation, mellow boom-bap drums, no compression",
    color: "from-amber-955 to-orange-955",
    accent: "amber",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/6b4fb245781a700084f7bbd743a18a99.mp3",
    lyrics: `[Intro]\n(Soft rain pattering on glass)\n(Vinyl crackle, warm rhodes piano chords)\n\n[Theme Main]\n(Melancholy guitar lick plays over jazz chords)\n(Deep warm bassline enters)\n(Relaxed boom-bap drum pattern)\n\n[Outro]\n(Music gradually fades into the rain ambient sound)`
  },
  {
    id: 5,
    name: "Rainy Day Study",
    genre: "Lo-Fi",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    mood: "Nostalgic",
    bpm: "65–75",
    vocal: "No Vocal",
    tags: "Rainy day study beats, 70 BPM, introspective nostalgic piano, cassette tape hiss, low-pass filtered drums, ambient street murmur, peaceful bedroom studio mix, no modern drums",
    color: "from-blue-955 to-slate-955",
    accent: "blue",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/f8430ea6c836ec4ff4995f6efdf2a16d.mp3",
    lyrics: `[Intro]\n(Distant city street sounds, cassette tape click)\n\n[Theme Main]\n(Delicate, repetitive jazz piano loop)\n(Subtle percussion and shaker groove)\n(Warm acoustic bass pluck)\n\n[Bridge]\n(Piano filter sweep, soft tape decay)\n\n[Outro]\n(Tape stops with a slow click)`
  },
  {
    id: 6,
    name: "Coffee Shop Chill",
    genre: "Lo-Fi",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    mood: "Chill",
    bpm: "72–85",
    vocal: "No Vocal",
    tags: "Mellow coffee shop jazzhop, 80 BPM, acoustic guitar fingerpicking, subtle background espresso shop chatter, relaxed boom-bap kick, smooth electric keys, warm analog preamp, dry mix",
    color: "from-yellow-955 to-amber-955",
    accent: "yellow",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/9ceee5c56cbfccdf46ebddc932bfbc63.mp3",
    lyrics: `[Intro]\n(Espresso machine hiss, low chatter, cups clinking)\n\n[Theme Main]\n(Sweet jazz acoustic guitar fingerpicking)\n(Mellow hip-hop drums kick in)\n(Rhodes electric piano plays sweet accent chords)\n\n[Outro]\n(Acoustic guitar outro solo)\n(Chatter fades out)`
  },

  // ── Hip Hop ──
  {
    id: 7,
    name: "Trap Darkness",
    genre: "Hip Hop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    mood: "Dark",
    bpm: "140–155",
    vocal: "Male Rap",
    tags: "Dark trap, 145 BPM, heavy sliding 808 sub bass, rapid-fire hi-hat rolls, menacing brass, atmospheric synth pad, ambient horror texture, raw street mix, no autotune",
    color: "from-red-955 to-rose-955",
    accent: "red",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/3c2a38210fe522646d6b2b6241c2c31e.mp3",
    lyrics: `[Intro]\n(Spooky bells and distant sirens)\n(808 bass rumble)\n\n[Verse 1]\nShadows on the wall, we rise in the dark\nLight another flame, leaving our mark\n808 hitting hard, shaking the ground\nNobody makes a move, nobody makes a sound\n\n[Chorus]\nWe own the night, ruling this game\nWrite in the sky, remember the name\nFrom the shadows we break the chain\nNothing to lose, nothing to explain`
  },
  {
    id: 8,
    name: "Boom Bap Classic",
    genre: "Hip Hop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    mood: "Nostalgic",
    bpm: "90–100",
    vocal: "Male Rap",
    tags: "90s East Coast Boom Bap, 90 BPM, jazzy saxophone sample, dusty vinyl crackle, punchy MPC-60 drums, upright acoustic bass pluck, raw street mix, no modern synth",
    color: "from-orange-955 to-yellow-955",
    accent: "orange",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/e3328e686cfc49d885d500980fae81bd.mp3",
    lyrics: `[Intro]\n(Classic vinyl record scratch)\n(Dusty jazz trumpet loop enters)\n\n[Verse 1]\nBack to the basics, street corner rhyme\nFlowing like water, frozen in time\nDusty drum breaks keeping the beat\nReal hip hop playing out in the street\n\n[Chorus]\nKeep it boom, keep it bap, keep the record spin\nThis is the era where the stories begin\nFrom the East to the West, we hold it down\nGolden age rhythms rocking the town`
  },
  {
    id: 9,
    name: "Cloud Rap Haze",
    genre: "Hip Hop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    mood: "Dreamy",
    bpm: "125–135",
    vocal: "Auto-Tune Male",
    tags: "Cloud rap, 130 BPM, ethereal trap, floating synth pads, auto-tuned vocal atmosphere, spacey reverb, heavy delay, slowed tempo, no harsh transients",
    color: "from-indigo-955 to-purple-955",
    accent: "indigo",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/bc3a2a5f8bccbbd366d2cebbd99cd130.mp3",
    lyrics: `[Intro]\n(Reverbed vocal pad, heavy delay)\n\n[Verse 1]\nFloating in the clouds, losing all control\nReverb on my mind, gravity let go\nPurple stars shining in the velvet sky\nNo one asks questions, no one wonders why\n\n[Chorus]\nLost in the haze, we drift away\nNothing is real, nothing stays\nAuto-tune echoes through the night air\nWe're so high, we don't care`
  },

  // ── Pop ──
  {
    id: 10,
    name: "Indie Pop Daydream",
    genre: "Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    mood: "Dreamy",
    bpm: "95–110",
    vocal: "Female Breathy",
    tags: "Indie pop, 105 BPM, jangle electric guitar, warm bedroom pop synthesiser pads, sweet melodic hooks, nostalgic summer reverb, close-mic breathy female vocal",
    color: "from-pink-955 to-rose-955",
    accent: "pink",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/a98e47c8e72532ec9bedf58c7706ec0b.mp3",
    lyrics: `[Intro]\n(Bright acoustic guitar jangle, soft whistle)\n\n[Verse 1]\nSunlight streaming through the bedroom door\nMessy clothes scattered on the floor\nThinking of the summer days we knew\nEverything was beautiful with you\n\n[Chorus]\nI'm caught in an indie pop daydream\nSoft pastel colors, or so it would seem\nJust humming a tune under the sun\nOur little romance has only begun`
  },
  {
    id: 11,
    name: "Synth Pop 80s Revival",
    genre: "Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    mood: "Nostalgic",
    bpm: "115–125",
    vocal: "Male Melodic",
    tags: "Synthpop Anthem, 120 BPM, bright neon lead, driving LinnDrum pattern, warm vocal harmonies, euphoric chorus lift, polished 80s commercial production, Roland Jupiter-8, no distortion",
    color: "from-violet-955 to-fuchsia-955",
    accent: "violet",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/cfd533909f68a8ddbf28204ad7782803.mp3",
    lyrics: `[Intro]\n(Upbeat 80s drum machine kick, pulsing synth bass)\n\n[Verse 1]\nMidnight neon reflection in the glass\nWondering if this retro love will last\nEchoes of the radio play in my ears\nSweeping away all of my quiet fears\n\n[Chorus]\nTake me back to the synth pop night\nUnderneath the pulsing strobe light\nDance with me until the morning sun\nThis 80s revival has just begun`
  },
  {
    id: 12,
    name: "Dark Pop Anthem",
    genre: "Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    mood: "Dark",
    bpm: "100–115",
    vocal: "Female Powerful",
    tags: "Dark pop, 110 BPM, moody vocals, haunting synth chords, heavy sub bass, cinematic drums, dramatic vocal reverb, dark minor key scale, compressed stereo field",
    color: "from-zinc-950 to-purple-950",
    accent: "zinc",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/77a0f845cfc0ee3c394ccddba0d58638.mp3",
    lyrics: `[Intro]\n(Eerie piano chords, deep sub bass hum)\n\n[Verse 1]\nWhispers in the hallway, shadows in the light\nSomething beautiful is going down tonight\nBitter taste of sweet revenge on my tongue\nThe game has started, the bell has rung\n\n[Chorus]\nThis is our dark pop anthem, hear it rise\nNo more looking down, no more sweet disguise\nWe dance in the shadows, dynamic and bold\nWriting our own story, untamed and untold`
  },

  // ── R&B / Soul ──
  {
    id: 13,
    name: "Neo-Soul Groove",
    genre: "R&B / Soul",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    mood: "Romantic",
    bpm: "80–92",
    vocal: "Female Warm",
    tags: "Neo Soul Groove, 92 BPM, warm Fender Rhodes, smooth electric bass, lazy offbeat drum pocket, soulful vocal runs, vintage preamp warmth, natural room ambiance",
    color: "from-amber-950 to-rose-950",
    accent: "amber",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/d931b9e82957a5086edb678d27e1ae05.mp3",
    lyrics: `[Intro]\n(Rhodes electric piano flourishes, soft jazz guitar chords)\n\n[Verse 1]\nCoffee brewing in the morning breeze\nYour smile blowing through the willow trees\nOrganic rhythms beating in my soul\nHaving you beside me makes me whole\n\n[Chorus]\nIt's a neo-soul groove, taking it slow\nWarm jazz chords, letting it glow\nSmooth as honey, sweet as tea\nJust you and me, living free`
  },
  {
    id: 14,
    name: "Contemporary R&B",
    genre: "R&B / Soul",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    mood: "Romantic",
    bpm: "85–100",
    vocal: "Female Sultry",
    tags: "Sultry R&B, 85 BPM, moody sub-bass glide, intimate breathy vocals, sparse 808 snaps, late-night atmospheric pads, glossy contemporary mix, sweet vocal harmonies",
    color: "from-purple-950 to-pink-955",
    accent: "purple",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/b40f8b7f9a424573be49fb22c0fd2957.mp3",
    lyrics: `[Intro]\n(Sensual vocal ad-libs with heavy delay, warm synth pads)\n\n[Verse 1]\nMidnight clock ticking on the wall\nWaiting for your late night text and call\nSensual atmosphere fills the room\n808 drums beating like a heartbeat boom\n\n[Chorus]\nThis R&B vibe is taking over me\nEvery little touch is sweet harmony\nUnder the sheets, in the ambient glow\nLet's keep it sexy, let's keep it slow`
  },
  {
    id: 15,
    name: "Retro Soul Ballad",
    genre: "R&B / Soul",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    mood: "Nostalgic",
    bpm: "68–78",
    vocal: "Male Gritty Soul",
    tags: "60s soul ballad, 72 BPM, vintage Motown horn section, Hammond organ swell, electric guitar stabs, gritty soul vocals, warm tape saturation, analog room sound",
    color: "from-red-950 to-yellow-950",
    accent: "red",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/d4d5ab6094f165fcaa8f4b4b91da3284.mp3",
    lyrics: `[Intro]\n(Vintage horn section blast, Hammond organ swell)\n\n[Verse 1]\nStanding in the cold pouring rain\nTrying to wash away all of this pain\nMotown rhythms beating in my chest\nWithout your love, I cannot find no rest\n\n[Chorus]\nOh, baby, won't you come on home to me\nVintage memories are all that I see\nHearing this retro soul ballad rise\nWith tears falling from my heavy eyes`
  },

  // ── Jazz ──
  {
    id: 16,
    name: "Midnight Jazz Club",
    genre: "Jazz",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    mood: "Mysterious",
    bpm: "85–105",
    vocal: "Male Jazz",
    tags: "Cool Jazz Trio, 75 BPM, warm hollowbody archtop guitar, double bass walk, brushed jazz drums, smoky jazz club acoustic reverb, vintage ribbon mic texture, relaxed timing",
    color: "from-stone-900 to-zinc-950",
    accent: "stone",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/30c4712a4c654d68c3b3c38659845b91.mp3",
    lyrics: `[Intro]\n(Slow, soft brushed snare, upright bass pluck)\n\n[Verse 1]\nSmokey dim lights in a corner booth\nWhiskey in a glass, searching for the truth\nGrand piano plays a melancholy melody\nWriting pages of our sweet biography\n\n[Chorus]\nAt the midnight jazz club, time stands still\nNo more running up that crowded hill\nJust the smoky trumpet and the upright bass\nFinding solace in this quiet place`
  },
  {
    id: 17,
    name: "Nu-Jazz Electronica",
    genre: "Jazz",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    mood: "Chill",
    bpm: "95–110",
    vocal: "Female Scat",
    tags: "Nu-Jazz, 105 BPM, electronic jazz fusion, Rhodes electric piano, synth bass lounge vibe, modern urban groove, syncopated scat, jazzy guitar stabs, no autotune",
    color: "from-sky-950 to-teal-950",
    accent: "sky",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/7151048b61c9ec8d098e9dd2ca3ec1e6.mp3",
    lyrics: `[Intro]\n(Electronic synth loop, upbeat jazz hi-hat)\n\n[Verse scat]\nShubidua-ba-da, doobidua-ba-da-bop\n(Warm rhodes piano solo over electronic beat)\n\n[Chorus]\nNu-jazz fusion in the city air\nLounge electronics playing everywhere\nScat vocals weaving through the modern groove\nFeel the rhythm make your body move`
  },
  {
    id: 18,
    name: "Bossa Nova Lounge",
    genre: "Jazz",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    mood: "Chill",
    bpm: "110–120",
    vocal: "Female Warm",
    tags: "Jazzy Bossa Nova, 120 BPM, nylon string acoustic guitar, syncopated brush snare, soft upright bass, warm Portuguese vocal tone, sunny coastal atmosphere, tape warmth",
    color: "from-teal-950 to-emerald-950",
    accent: "teal",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/80518f87ed0d35ae6ed1a14a796e6d1e.mp3",
    lyrics: `[Intro]\n(Soft nylon guitar bossa chords, light percussion shake)\n\n[Verse 1]\nCanta bossa nova, sing the summer breeze\nSunlight dancing gently through the palm trees\nNylon guitar chords flowing with the tide\nIn this lazy afternoon, with you by my side\n\n[Chorus]\nSamba do mar, feel the rhythm rise\nUnderneath the beautiful blue coastal skies\nLet the music take us where the palm winds blow\nBossa nova lounge, taking it sweet and slow`
  },

  // ── K-Pop ──
  {
    id: 19,
    name: "K-Pop Synth Blast",
    genre: "K-Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    mood: "Uplifting",
    bpm: "120–130",
    vocal: "Female Group",
    tags: "K-Pop Dance Dynamite, 120 BPM, punchy brass hook, funk bassline, syncopated vocal chops, bright polished vocal stacks, high-energy dance drop, modern radio mastering",
    color: "from-pink-950 to-violet-950",
    accent: "pink",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/b66ef6378e90637fd6fa0bd4ceae5c2a.mp3",
    lyrics: `[Intro]\n(Glitchy synth intro, group chant, heavy sub drop)\nLet's go! Melodio ready!\n\n[Verse 1]\n눈부신 조명 아래 시작되는 밤\n심장 소린 터질 듯이 BPM을 높여가\n짜릿한 이 느낌은 멈출 수가 없어\n너와 나 우리만의 무대로 다 비춰줘\n\n[Chorus]\n빛을 질러봐, dance all night!\n우린 멈추지 않아, hold me tight\n터지는 신디사이저 멜로디 속에\n하나 되는 K-pop synth blast!`
  },
  {
    id: 20,
    name: "K-Pop Soft R&B",
    genre: "K-Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    mood: "Chill",
    bpm: "82–92",
    vocal: "Male Sweet",
    tags: "Dreamy K-Pop R&B, 85 BPM, lush futuristic synth pads, sweet falsetto vocals, sparse trap drums, romantic late-night neon city vibe, warm chorus vocal stack",
    color: "from-indigo-950 to-purple-950",
    accent: "indigo",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/bfe3e4d9f67efae7ebec1dd50b696ee3.mp3",
    lyrics: `[Intro]\n(Warm electric piano chord, sweet male falsetto humming)\n\n[Verse 1]\n비 개인 뒤에 젖은 골목길 사이로\n어렴풋이 비쳐오는 가로등 불빛처럼\n너의 고운 목소리가 내 귀를 감싸 안아\n조금 천천히 가볼까, 이 밤이 지나기 전에\n\n[Chorus]\nSweet K-pop R&B, 우리들의 멜로디\n라벤더 향기 가득한 이 꿈결 속에서\n조용히 속삭이는 너의 고백처럼\n가장 감미로운 노래를 들려줄게`
  },
  {
    id: 21,
    name: "K-Pop Retro Funk",
    genre: "K-Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    mood: "Uplifting",
    bpm: "110–122",
    vocal: "Female Sweet",
    tags: "K-Pop Retro Disco Funk, 118 BPM, slapping bass guitar, funky rhythm guitar strum, bright brass stabs, sweet layered female lead vocals, vintage analog synth lead, glossy radio production",
    color: "from-yellow-950 to-orange-950",
    accent: "yellow",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/db2d8d80f833a695bcefa7b4b1a43a05.mp3",
    lyrics: `[Intro]\n(Slap bass solo, funky electric guitar riff, brass hits)\nGet ready for the retro groove!\n\n[Verse 1]\n미러볼 아래 흩어지는 colorful light\n오래된 라디오에 흘러나오는 vibe\n발끝을 자극하는 베이스라인의 리듬\n모든 고민은 잊고 그냥 춤을 추는 거야\n\n[Chorus]\nRetro K-pop funk, 흔들어봐 다 같이!\n짜릿한 이 리듬은 영원할 테니\n어깨를 들썩이며 웃어보여줘\n디스코 열기 속으로 빠져들어가`
  },

  // ── J-Pop ──
  {
    id: 22,
    name: "J-Pop Anime Energy",
    genre: "J-Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    mood: "Energetic",
    bpm: "165–178",
    vocal: "Female Soaring",
    tags: "Anime J-Pop Opener, 175 BPM, fast driving electric guitar riffs, melodic piano run, walking bassline, high-energy drums, soaring female vocals, bright pop mix, no compression",
    color: "from-sky-950 to-blue-950",
    accent: "sky",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/6b4fb245781a700084f7bbd743a18a99.mp3",
    lyrics: `[Intro]\n(Fast dual electric guitar harmonies, grand piano arpeggio)\n\n[Verse 1]\n青空に向かって走り出した背中\n追いかける風が未来を教えてくれた\n胸の奥に秘めた夢を抱きしめて\n迷うことなく今、扉を開けよう\n\n[Chorus]\n駆け抜けるJ-pop anime energy!\n諦めない心で奇跡を起こそう\n響けメロディ、君の元へ届くように\n七色の虹を渡って輝こう`
  },
  {
    id: 23,
    name: "J-Pop Future Bass",
    genre: "J-Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    mood: "Uplifting",
    bpm: "135–148",
    vocal: "Female Kawaii",
    tags: "Kawaii Future Bass, 140 BPM, massive sidechained supersaw chords, sparkling chiptune arpeggios, high-pitched sweet female vocal, playful vocal chops, neon color mix",
    color: "from-pink-955 to-purple-955",
    accent: "pink",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/f8430ea6c836ec4ff4995f6efdf2a16d.mp3",
    lyrics: `[Intro]\n(Kawaii voice chop, sidechained synth chord buildup)\nJ-Future, start!\n\n[Verse 1]\nデジタルワールド飛び出して見つけたの\n君と私のカラフルな約束\n光る星屑タップしてメロディ\n終わらない夢の続きを歌おう\n\n[Chorus]\nJ-pop future bass, 弾けるハートの鼓動\n超広角のステレオ、響くラブソング\n電子の海を越えて君の胸に届けたい\nこのピュアな想いをギュッと抱きしめて`
  },
  {
    id: 24,
    name: "J-Pop Retro City",
    genre: "J-Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    mood: "Nostalgic",
    bpm: "112–122",
    vocal: "Female Melodic",
    tags: "80s J-Pop City Pop, 115 BPM, groovy electric bassline, FM synthesiser chords, vintage drum machine clap, clean jazzy guitar, nostalgic city night sunset atmosphere",
    color: "from-indigo-950 to-blue-950",
    accent: "indigo",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/9ceee5c56cbfccdf46ebddc932bfbc63.mp3",
    lyrics: `[Intro]\n(80s synth brass stabs, groovy bass guitar line)\n\n[Verse 1]\n真夜中のドアをノックする雨音\nカセットテープから流れるメロディ\nヘッドライトの列が川のように流れていく\n君のいない都会の夜を歩くの\n\n[Chorus]\n懐かしいJ-pop retro city vibe\nネオンに染まるこの寂しさを抱いて\n通り過ぎる風になって君の街へ\n戻れないあの夏を歌い続ける`
  },

  // ── Cinematic ──
  {
    id: 25,
    name: "Epic Orchestral Theme",
    genre: "Cinematic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    mood: "Epic",
    bpm: "75–90",
    vocal: "No Vocal",
    tags: "Epic Orchestral Theme, 80 BPM, swelling orchestral brass, massive Taiko drum hits, soaring solo violin, dramatic choir backing, huge film-score Lexicon reverb, wide dynamic range",
    color: "from-amber-950 to-yellow-950",
    accent: "amber",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/3c2a38210fe522646d6b2b6241c2c31e.mp3",
    lyrics: `[Intro]\n(Soft, low string drone, distant horn call)\n\n[Theme Main]\n(Soaring solo violin melody enters)\n(Huge orchestral swell: brass, strings, woodwinds)\n(Thunderous orchestral percussion and drum rolls)\n\n[Climax]\n(Full orchestra fortissimo, dramatic choir backing)\n\n[Outro]\n(Strings slowly fade out, soft harp pluck)`
  },
  {
    id: 26,
    name: "Sci-Fi Cyberpunk Score",
    genre: "Cinematic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    mood: "Mysterious",
    bpm: "100–115",
    vocal: "No Vocal",
    tags: "Sci-Fi Cyberpunk Score, 110 BPM, grinding modular synthesizers, robotic sound effects, dark atmospheric drone, tension percussion, dystopian cyberpunk mood, industrial warehouse mix",
    color: "from-zinc-950 to-cyan-950",
    accent: "zinc",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/e3328e686cfc49d885d500980fae81bd.mp3",
    lyrics: `[Intro]\n(Glitchy analog synthesizer pulse, deep mechanical hum)\n\n[Theme Main]\n(Gritty industrial synth bassline kicks in)\n(Eerie electric guitar swell, metallic percussion hits)\n(Fast arpeggiator synthesizer drive)\n\n[Outro]\n(Static noise, heartbeat pulse fading into silence)`
  },
  {
    id: 27,
    name: "Emotional Piano & Cello",
    genre: "Cinematic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    mood: "Nostalgic",
    bpm: "60–75",
    vocal: "No Vocal",
    tags: "Emotional Piano Cello Ballad, 68 BPM, weeping solo cello, soft felt grand piano chords, ambient room reverb, cinematic nostalgia, raw melancholic delivery, no digital processing",
    color: "from-stone-900 to-slate-950",
    accent: "stone",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/bc3a2a5f8bccbbd366d2cebbd99cd130.mp3",
    lyrics: `[Intro]\n(Delicate, slow piano chords)\n\n[Theme Main]\n(Expressive, crying solo cello enters)\n(Gentle piano arpeggios supporting the cello)\n(Very soft violin pad in the background)\n\n[Outro]\n(Piano chord decays, final soft cello sigh)`
  },

  // ── Ambient ──
  {
    id: 28,
    name: "Ethereal Dreamscape",
    genre: "Ambient",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    mood: "Dreamy",
    bpm: "50–65",
    vocal: "No Vocal",
    tags: "Ethereal Ambient Drone, 60 BPM, endless synthesiser pad, floating reverb tail, soft wind sound effects, relaxing dreamscape, cosmic slow motion, no percussion",
    color: "from-blue-955 to-teal-955",
    accent: "blue",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/a98e47c8e72532ec9bedf58c7706ec0b.mp3",
    lyrics: `[Intro]\n(Gentle sound of wind, soft synthesizer swell)\n\n[Theme Main]\n(Endless, lush major chord synthesizer pad)\n(Very slow, floating melodic soundscape)\n(Distant chime sounds echoing)\n\n[Outro]\n(Chime echoes fade, pad returns to wind sound)`
  },
  {
    id: 29,
    name: "Deep Space Textures",
    genre: "Ambient",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    mood: "Mysterious",
    bpm: "40–55",
    vocal: "No Vocal",
    tags: "Deep Space Textures, 50 BPM, low sub-bass drone, metallic echo effects, sparse analog blips, immersive space atmosphere, sci-fi minimalist, wide stereo panning",
    color: "from-purple-950 to-indigo-950",
    accent: "purple",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/cfd533909f68a8ddbf28204ad7782803.mp3",
    lyrics: `[Intro]\n(Low frequency cosmic hum, space wind noise)\n\n[Theme Main]\n(Subtle, mysterious analog synthesizer pulses)\n(Reverberating metallic sound effects)\n(Low sub-bass drone maintaining tension)\n\n[Outro]\n(Cosmic hum slowly pitch bends down and fades)`
  },
  {
    id: 30,
    name: "Nature's Whisper",
    genre: "Ambient",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    mood: "Chill",
    bpm: "60–75",
    vocal: "No Vocal",
    tags: "Chakra Healing Bowls, 65 BPM, resonant singing bowls, soft native flute melody, gentle stream water sounds, calming meditation frequency, acoustic field recording",
    color: "from-green-950 to-emerald-950",
    accent: "green",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/77a0f845cfc0ee3c394ccddba0d58638.mp3",
    lyrics: `[Intro]\n(Gentle stream water flowing, distant birds chirping)\n\n[Theme Main]\n(Resonant, calming Tibetan singing bowl strike)\n(Soft, airy native wooden flute melody)\n(Warm acoustic guitar chords strummed very slowly)\n\n[Outro]\n(Flute melody ends, stream sound fades out)`
  },

  // ── Rock ──
  {
    id: 31,
    name: "Alt-Rock Grunge Revival",
    genre: "Rock",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    mood: "Aggressive",
    bpm: "120–135",
    vocal: "Male Grit",
    tags: "Alt Rock Grunge, 130 BPM, crunchy overdriven Gibson Les Paul guitars, driving bass guitar, heavy acoustic drum hits, passionate melodic vocals, raw garage sound, no autotune",
    color: "from-zinc-900 to-stone-900",
    accent: "zinc",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/d931b9e82957a5086edb678d27e1ae05.mp3",
    lyrics: `[Intro]\n(Crunchy electric guitar riff, heavy drum fill)\n\n[Verse 1]\nStatic noise in the morning air\nFighting for something, showing I care\nGritty bassline keeps me on track\nNo turning round, no looking back\n\n[Chorus]\nHere is the rock revival, feel the sound!\nCrunchy guitars shaking the ground\nSinging out loud, breaking the chain\nIn the garage rock, we find our lane`
  },
  {
    id: 32,
    name: "Desert Stoned Groove",
    genre: "Rock",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    mood: "Chill",
    bpm: "85–98",
    vocal: "Male Deep",
    tags: "Desert Rock, 90 BPM, fuzzy overdriven guitar riffs, low-tuned heavy bass pocket, slow driving rock groove, warm vintage analog sound, raw studio mix, no modern synths",
    color: "from-amber-950 to-stone-950",
    accent: "amber",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/b40f8b7f9a424573be49fb22c0fd2957.mp3",
    lyrics: `[Intro]\n(Slow, fuzzy bass guitar riff, dry acoustic kick drum)\n\n[Verse 1]\nDusty highway under the hot sun\nSearching for water, on the run\nFuzzy guitars playing so slow\nWhere the desert winds blow\n\n[Chorus]\nStoned groove under the blue sky\nHeavy riffs making us fly\nNo need to hurry, just ride the sound\nDeep in the canyon, we are found`
  },
  {
    id: 33,
    name: "Classic Arena Rock",
    genre: "Rock",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    mood: "Epic",
    bpm: "110–125",
    vocal: "Male Soaring",
    tags: "Classic Arena Rock, 115 BPM, massive guitar solo, driving stadium drum beat, soaring high-pitch vocals, anthemic chorus, crowd echo reverb, no electronic drums",
    color: "from-red-955 to-orange-955",
    accent: "red",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/d4d5ab6094f165fcaa8f4b4b91da3284.mp3",
    lyrics: `[Intro]\n(Screaming electric guitar solo, fast rock drum build-up)\n\n[Verse 1]\nStadium lights shining so bright\nWe are ready to conquer the night\nPower chords echoing through the air\nHands in the sky, showing we care\n\n[Chorus]\nArena rock anthem, sing it out loud!\nStanding together, proud of the crowd\nDriving guitars, feel the big beat\nRocking the stadium, shaking the street!`
  },

  // ── Folk / Acoustic ──
  {
    id: 34,
    name: "Rustic Cabin Folk",
    genre: "Folk / Acoustic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    mood: "Nostalgic",
    bpm: "88–100",
    vocal: "Male & Female Duet",
    tags: "Indie Folk Strum, 95 BPM, warm acoustic guitar picking, rustic banjo plucks, soft kick drum thump, intimate dual vocal harmony, cabin studio warmth, no digital processing",
    color: "from-yellow-955 to-amber-955",
    accent: "yellow",
    audioUrl: "https://file.302.ai/gpt/imgs/20260720/30c4712a4c654d68c3b3c38659845b91.mp3",
    lyrics: `[Intro]\n(Warm, rustic acoustic guitar fingerpicking)\n\n[Verse 1]\n(Male) Wooden cabin in the deep green pine\n(Female) Cozy fireplace, sweet red wine\n(Both) Rustic banjo playing a tune\nUnder the yellow harvest moon\n\n[Chorus]\nThis is our simple acoustic song\nIn these mountains is where we belong\nWarm guitar and a banjo pluck\nWith your love, I'm rich in luck`
  },
  {
    id: 35,
    name: "Modern Acoustic Pop",
    genre: "Folk / Acoustic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    mood: "Uplifting",
    bpm: "95–110",
    vocal: "Female Sweet",
    tags: "Modern Indie Pop, 105 BPM, clean acoustic guitar strumming, bright piano accents, foot-stomp percussion, sweet close-mic female vocal, uplifting chorus harmonies",
    color: "from-pink-955 to-rose-955",
    accent: "pink",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/7151048b61c9ec8d098e9dd2ca3ec1e6.mp3",
    lyrics: `[Intro]\n(Bright acoustic guitar strum, foot stomp and clap beat)\n\n[Verse 1]\nWalking down the sunny city street\nSaying hello to everyone I meet\nSweet guitar chords making me smile\nThink I'll stay here for a little while\n\n[Chorus]\nModern acoustic pop in the air\nPositive vibes spreading everywhere\nStrum the guitar, tap your own feet\nMake this simple life feel so sweet`
  },
  {
    id: 36,
    name: "Americana Storyteller",
    genre: "Folk / Acoustic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
    mood: "Nostalgic",
    bpm: "75–88",
    vocal: "Male Baritone",
    tags: "Americana Roots, 80 BPM, slide dobro guitar, weeping pedal steel, steady acoustic drum brush, warm storytelling baritone vocal, dusty highway road, raw studio room sound",
    color: "from-amber-950 to-stone-900",
    accent: "amber",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/80518f87ed0d35ae6ed1a14a796e6d1e.mp3",
    lyrics: `[Intro]\n(Weeping pedal steel guitar, slow acoustic guitar strum)\n\n[Verse 1]\nDusty boots on a long gravel road\nCarrying a heavy, historic load\nDobro guitar playing a sad song\nWondering where the years have gone\n\n[Chorus]\nAmericana story of the land\nSlide guitar and a working man's hand\nBaritone voice singing so true\nUnder the sky of red, white, and blue`
  },

  // ── Latin ──
  {
    id: 37,
    name: "Salsa Fuego",
    genre: "Latin",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
    mood: "Energetic",
    bpm: "170–190",
    vocal: "Male & Group Chant",
    tags: "Salsa Caliente, 180 BPM, fast piano montuno, driving congas and cowbell, blazing trumpet section, energetic Spanish chorus, dancing salsa groove, no synth, raw room mix",
    color: "from-red-955 to-orange-955",
    accent: "red",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/b66ef6378e90637fd6fa0bd4ceae5c2a.mp3",
    lyrics: `[Intro]\n(Fast piano montuno, driving congas, timbales fill, trumpet blast)\n¡Fuego! ¡A bailar salsa!\n\n[Verse 1]\nEl ritmo caliente te llama a bailar\nSiente la conga y la clave vibrar\nPiano montuno tocando con sabor\nOlvida la pena, canta con amor\n\n[Chorus]\n(Group) ¡Salsa caliente de mi corazón!\nSiente el fuego, siente la pasión\nTrompetas sonando, timbales con control\nBaila conmigo, pierde el control`
  },
  {
    id: 38,
    name: "Reggaeton Urbano",
    genre: "Latin",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
    mood: "Energetic",
    bpm: "90–100",
    vocal: "Male Spanish",
    tags: "Reggaeton Bouncer, 95 BPM, classic Dembow drum pattern, heavy sub-bass thump, synthesiser lead pluck, sultry Spanish vocal, dance club mood, no autotune",
    color: "from-yellow-955 to-orange-955",
    accent: "yellow",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/bfe3e4d9f67efae7ebec1dd50b696ee3.mp3",
    lyrics: `[Intro]\n(Heavy dembow beat drops, vocal chants)\n¡Melodio! Urbano, let's go!\n\n[Verse 1]\nElla baila sola en la discoteca\nBajo la luz roja que la delata\nBajo de bajo, sintiendo el calor\nEste ritmo urbano es mi salvador\n\n[Chorus]\nBaila reggaeton, mueve la cintura\nEste dembow bouncer es una locura\nSiente la vibra en toda la piel\nHasta que salga el sol, vamos a beber`
  },
  {
    id: 39,
    name: "Sensual Bachata",
    genre: "Latin",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
    mood: "Romantic",
    bpm: "110–120",
    vocal: "Female Spanish Sultry",
    tags: "Bachata Amor, 115 BPM, nylon bachata guitar picking, bongo rhythm, electric bass sliding, romantic Spanish vocal, sweet slow dance, no drums",
    color: "from-rose-955 to-pink-955",
    accent: "rose",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/db2d8d80f833a695bcefa7b4b1a43a05.mp3",
    lyrics: `[Intro]\n(Sensual bachata electric guitar picking, bongos dynamic beat)\n\n[Verse 1]\nEn la quietud de la noche te busco yo\nHeredero del dulce dolor que tu amor dejó\nLos bongos golpean al compás del latir\nSin tu mirada no puedo vivir\n\n[Chorus]\nBaila bachata de mi corazón\nSensual romance lleno de pasión\nJunta tu cuerpo muy cerca de mí\nEn este baile yo me pierdo por ti`
  },

  // ── Afrobeats ──
  {
    id: 40,
    name: "Afrobeats Wave",
    genre: "Afrobeats",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    mood: "Uplifting",
    bpm: "100–115",
    vocal: "Male African Style",
    tags: "Afrobeats Lagos Wave, 105 BPM, syncopated west african log drum beat, warm electric guitar loop, afrobeat synth brass, smooth nigerian vocal vibes, no autotune",
    color: "from-green-950 to-yellow-950",
    accent: "green",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/6b4fb245781a700084f7bbd743a18a99.mp3",
    lyrics: `[Intro]\n(Uplifting log drum beat, Lagos style guitar loop)\nYeah-yeah, Afrobeats wave taking over!\n\n[Verse 1]\nFrom the streets of Lagos to the global stage\nWriting our own story, turning the page\nWest African percussion moving your feet\nFeel the positive vibes in every single beat\n\n[Chorus]\nRide the afrobeats wave, feel the sunshine shine\nEverything is beautiful, everything is fine\nDance to the rhythm, let the music take you high\nUnderneath the golden African sky`
  },
  {
    id: 41,
    name: "Deep Tribal Afro",
    genre: "Afrobeats",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    mood: "Energetic",
    bpm: "115–124",
    vocal: "Tribal Chants",
    tags: "Deep Tribal House, 120 BPM, deep house kick drum, heavy afro hand percussion, log drum bass rolls, energetic tribal chanting, trance dance, no synth, raw room mix",
    color: "from-yellow-955 to-stone-900",
    accent: "yellow",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/f8430ea6c836ec4ff4995f6efdf2a16d.mp3",
    lyrics: `[Intro]\n(Distant tribal chanting, massive hand drums entering)\n\n[Verse Chants]\nYay-he-ah! Tribal fire! Ancestors call!\n(Heavy deep house kick drum drops)\n(Log drums playing syncopated patterns)\n\n[Chorus]\n ancestorial trance under the moon\nAfro percussion playing the tune\nFeel the vibration shaking the earth\nRitual dance of fire and rebirth`
  },

  // ── World / Ethnic ──
  {
    id: 42,
    name: "Bollywood Dance",
    genre: "World / Ethnic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    mood: "Uplifting",
    bpm: "128–140",
    vocal: "Male & Female Hindi",
    tags: "Bollywood Sitar Dance, 130 BPM, traditional Sitar run, energetic Dhol drum beats, modern EDM supersaw leads, group Hindi chanting, no autotune",
    color: "from-orange-955 to-amber-955",
    accent: "orange",
    audioUrl: "https://file.302.ai/gpt/imgs/20260721/9ceee5c56cbfccdf46ebddc932bfbc63.mp3",
    lyrics: `[Intro]\n(Fast dhol drum roll, traditional sitar trill, group shout)\nChalo! Nacho! Bollywood dance!\n\n[Verse 1]\n(Male) 눈부신 도심 아래 축제가 시작돼\n(Female) Traditional sitar plays, calling you and me\nDhol drums beating, heart starts to race\nLet's get lost in this magical place\n\n[Chorus]\n(Group) Nacho nacho, bollywood dance!\nThis is our festival, this is our chance\nTraditional melody with a modern EDM beat\nDancing together, shaking up the street!`
  },

  // ── Phonk ──
  { id: 43, name: "Drift Phonk", genre: "Phonk",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png", mood: "Aggressive", bpm: "130–140", vocal: "Pitched-Down Male", tags: "Drift phonk, 135 BPM, high-pitched Memphis cowbell loops, distorted 808 sub bass, aggressive Memphis rap vocal samples, dark trap, no clean vocals", color: "from-red-955 to-zinc-955", accent: "red", audioUrl: "", lyrics: "" },
  { id: 44, name: "Brazilian Phonk", genre: "Brazilian Phonk",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png", mood: "Energetic", bpm: "140–150", vocal: "MC Vocal Chops", tags: "Brazilian phonk, 145 BPM, funk carioca drum rhythm, aggressive Brazilian rave phonk synth stabs, heavy bass house kick, MC vocal chops, high energy", color: "from-orange-955 to-red-955", accent: "orange", audioUrl: "", lyrics: "" },
  { id: 45, name: "House Phonk", genre: "House Phonk",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png", mood: "Dark", bpm: "125–135", vocal: "None", tags: "House phonk, 128 BPM, phonk cowbell groove, filtered old school funk sample, deep house sub bass, retro synth stabs, club dance mix", color: "from-zinc-900 to-stone-900", accent: "gray", audioUrl: "", lyrics: "" },

  // ── Hyperpop ──
  { id: 46, name: "Glitch Pop", genre: "Hyperpop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png", mood: "Energetic", bpm: "150–170", vocal: "Pitched-Up Female", tags: "Glitch pop, 160 BPM, glitchy bitcrushed synthesizer leads, pitched-up chipmunk female vocals, maximalist PC Music production, chaotic electronic drops, no natural drums", color: "from-fuchsia-955 to-pink-955", accent: "pink", audioUrl: "", lyrics: "" },
  { id: 47, name: "Bubblegum Bass", genre: "Hyperpop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png", mood: "Uplifting", bpm: "140–160", vocal: "Cute Female", tags: "Bubblegum bass, 150 BPM, sweet metallic synthesiser plucks, heavy plastic sub bass, sugary anime-like melodies, polished digital pop, no analog warmth", color: "from-pink-955 to-violet-955", accent: "pink", audioUrl: "", lyrics: "" },

  // ── Bedroom Pop ──
  { id: 48, name: "Indie Bedroom", genre: "Bedroom Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png", mood: "Dreamy", bpm: "90–110", vocal: "Soft Male", tags: "Indie bedroom pop, 95 BPM, raw lo-fi guitar strumming, intimate whispered male vocal, DIY cassette deck recording texture, warm room reverb, cozy atmosphere", color: "from-amber-955 to-yellow-955", accent: "amber", audioUrl: "", lyrics: "" },
  { id: 49, name: "Dreamy Bedroom", genre: "Bedroom Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png", mood: "Romantic", bpm: "85–100", vocal: "Soft Female", tags: "Dreamy bedroom pop, 90 BPM, jangly clean electric guitar, soft lazy percussion, nostalgic pop melody, close mic female vocal, sweet reverb", color: "from-rose-955 to-pink-955", accent: "rose", audioUrl: "", lyrics: "" },

  // ── Drill ──
  { id: 50, name: "UK Drill", genre: "Drill",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png", mood: "Aggressive", bpm: "140–145", vocal: "Male Flow", tags: "UK drill, 142 BPM, sliding 808 bass slides, dark minor key piano loops, rapid-fire hi-hat rolls, gritty UK street rap flow, no vocal tune", color: "from-zinc-955 to-gray-900", accent: "gray", audioUrl: "", lyrics: "" },
  { id: 51, name: "NY Drill", genre: "Drill",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png", mood: "Dark", bpm: "140–150", vocal: "Aggressive Male", tags: "NY drill, 145 BPM, aggressive sliding 808 sub bass, minor key cinematic strings, heavy syncopated snare rolls, street energy, no autotune", color: "from-stone-900 to-zinc-900", accent: "gray", audioUrl: "", lyrics: "" },

  // ── Amapiano ──
  { id: 52, name: "Deep Amapiano", genre: "Amapiano",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png", mood: "Chill", bpm: "112–118", vocal: "Zulu Vocal", tags: "Deep Amapiano, 114 BPM, heavy log drum bassline, soft electric piano chords, shaker percussion loops, South African deep house groove, chill mood", color: "from-emerald-955 to-teal-955", accent: "teal", audioUrl: "", lyrics: "" },
  { id: 53, name: "Piano Hub", genre: "Amapiano",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png", mood: "Uplifting", bpm: "115–120", vocal: "Female Vocal", tags: "Amapiano pop, 118 BPM, syncopated jazzy piano chord stabs, Soweto house groove, warm rolling bassline, traditional percussion shakers, uplifting vocal hooks", color: "from-teal-955 to-green-955", accent: "green", audioUrl: "", lyrics: "" },

  // ── City Pop ──
  { id: 54, name: "80s City Pop", genre: "City Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png", mood: "Nostalgic", bpm: "100–120", vocal: "Female Japanese", tags: "80s Japanese City Pop, 110 BPM, groovy funk bassline, FM synthesiser brass chords, vintage drum machine clap, clean electric jazz guitar, nostalgic city night atmosphere", color: "from-sky-955 to-blue-955", accent: "blue", audioUrl: "", lyrics: "" },
  { id: 55, name: "Neo City Pop", genre: "City Pop",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png", mood: "Uplifting", bpm: "110–125", vocal: "Soft Male", tags: "Neo city pop, 115 BPM, modern retro pop, jazzy electric guitar licks, analog synthesizer warmth, groovy syncopated bassline, polished metropolitan mix", color: "from-blue-955 to-indigo-955", accent: "blue", audioUrl: "", lyrics: "" },

  // ── Trap ──
  { id: 56, name: "Dark Trap Beats", genre: "Trap",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png", mood: "Dark", bpm: "130–145", vocal: "Auto-tuned Male", tags: "Dark trap beats, 140 BPM, heavy sliding 808 sub bass, eerie bell melody, rapid-fire hi-hat triplets, reverb-drenched auto-tuned male vocals, ambient horror texture", color: "from-zinc-955 to-purple-955", accent: "purple", audioUrl: "", lyrics: "" },
  { id: 57, name: "Melodic Trap", genre: "Trap",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png", mood: "Dreamy", bpm: "130–140", vocal: "Auto-tuned Male", tags: "Melodic trap, 135 BPM, emotional grand piano, soft rolling 808 bass, lush synthesiser pads, atmospheric vocal reverb, no aggressive drums", color: "from-violet-955 to-indigo-955", accent: "violet", audioUrl: "", lyrics: "" },

  // ── Reggaeton ──
  { id: 58, name: "Perreo Disco", genre: "Reggaeton",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png", mood: "Energetic", bpm: "92–100", vocal: "Male Spanish", tags: "Reggaeton Perreo, 96 BPM, classic dembow drum rhythm, heavy latin hand percussion, bouncy synth bassline, energetic Spanish club vocals", color: "from-yellow-955 to-orange-955", accent: "yellow", audioUrl: "", lyrics: "" },

  // ── Indie Rock ──
  { id: 59, name: "Indie Anthem", genre: "Indie Rock",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png", mood: "Uplifting", bpm: "120–135", vocal: "Male Alt", tags: "Indie rock anthem, 125 BPM, jangly electric guitars, driving indie bass guitar, anthemic rock chorus, high-energy live acoustic drums, stadium reverb", color: "from-orange-955 to-amber-955", accent: "orange", audioUrl: "", lyrics: "" },

  // ── Shoegaze ──
  { id: 60, name: "Wall of Sound", genre: "Shoegaze",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png", mood: "Dreamy", bpm: "80–100", vocal: "Ethereal Female", tags: "Shoegaze wall of sound, 90 BPM, massive distorted guitar layers, heavy guitar feedback, lush room reverb, ethereal whispered female vocals, no autotune", color: "from-pink-955 to-purple-955", accent: "pink", audioUrl: "", lyrics: "" },

  // ── Post-Punk ──
  { id: 61, name: "Cold Wave", genre: "Post-Punk",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png", mood: "Dark", bpm: "110–130", vocal: "Baritone Male", tags: "Post-punk cold wave, 120 BPM, angular electric guitar riffs, driving melodic bass guitar, cold synthesiser pads, raw acoustic drums, baritone male vocal", color: "from-slate-900 to-zinc-900", accent: "gray", audioUrl: "", lyrics: "" },

  // ── Grunge ──
  { id: 62, name: "90s Grunge", genre: "Grunge",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png", mood: "Aggressive", bpm: "100–130", vocal: "Raspy Male", tags: "90s Seattle grunge, 110 BPM, raw distorted electric guitars, heavy bass guitar, aggressive live drums, raspy angsty male vocals, raw studio mix, no polish", color: "from-stone-900 to-zinc-900", accent: "gray", audioUrl: "", lyrics: "" },

  // ── Metal ──
  { id: 63, name: "Modern Metal", genre: "Metal",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png", mood: "Aggressive", bpm: "140–180", vocal: "Growl / Scream", tags: "Modern metal, 160 BPM, low-tuned distorted electric guitars, heavy double-kick drum rolls, aggressive metal riffs, growling vocals, massive raw breakdown", color: "from-red-955 to-black", accent: "red", audioUrl: "", lyrics: "" },

  // ── Punk ──
  { id: 64, name: "Fast Punk", genre: "Punk",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png", mood: "Energetic", bpm: "160–200", vocal: "Shouting Male", tags: "Classic punk rock, 180 BPM, fast three-chord power guitar riffs, simple driving bass, fast snare-heavy punk beat, raw shouting vocals, high energy", color: "from-red-900 to-orange-955", accent: "red", audioUrl: "", lyrics: "" },

  // ── Emo / Pop Punk ──
  { id: 65, name: "Emo Revival", genre: "Emo / Pop Punk",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png", mood: "Nostalgic", bpm: "130–150", vocal: "Emotional Male", tags: "Emo revival pop punk, 140 BPM, palm-muted electric guitar verse, explosive melodic chorus, emotional raw male vocals, steady rock drums, nostalgic feel", color: "from-zinc-900 to-rose-955", accent: "rose", audioUrl: "", lyrics: "" },

  // ── Synthwave ──
  { id: 66, name: "Outrun", genre: "Synthwave",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png", mood: "Epic", bpm: "100–120", vocal: "None", tags: "Synthwave outrun, 110 BPM, vintage retro 80s synthesiser stabs, driving analog arpeggios, massive drum machine snare, neon retro aesthetic, analog warmth", color: "from-purple-955 to-fuchsia-955", accent: "purple", audioUrl: "", lyrics: "" },

  // ── Vaporwave ──
  { id: 67, name: "Mall Soft", genre: "Vaporwave",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png", mood: "Nostalgic", bpm: "70–90", vocal: "Pitched-Down Sample", tags: "Vaporwave mallsoft, 80 BPM, slowed down elevator music sample, heavy reverb environment, lo-fi aesthetic, nostalgic 90s shopping mall ambiance", color: "from-teal-955 to-cyan-955", accent: "teal", audioUrl: "", lyrics: "" },

  // ── Future Bass ──
  { id: 68, name: "Kawaii Future", genre: "Future Bass",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png", mood: "Uplifting", bpm: "140–155", vocal: "Vocal Chops", tags: "Kawaii future bass, 145 BPM, massive sidechained supersaw chords, cute synthesiser melodies, playful vocal chop loops, heavy sub bass, colorful drops", color: "from-cyan-955 to-blue-955", accent: "cyan", audioUrl: "", lyrics: "" },

  // ── Drum & Bass ──
  { id: 69, name: "Liquid DnB", genre: "Drum & Bass",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png", mood: "Dreamy", bpm: "170–180", vocal: "Ethereal Female", tags: "Liquid drum and bass, 175 BPM, fast rolling breakbeat drum loops, lush electric piano pads, ethereal solo female vocal, warm sub bassline, spacious stereo field", color: "from-emerald-955 to-cyan-955", accent: "teal", audioUrl: "", lyrics: "" },

  // ── House ──
  { id: 70, name: "Deep House", genre: "House",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png", mood: "Chill", bpm: "120–125", vocal: "Soulful Female", tags: "Deep house, 122 BPM, warm electric synthesizer chords, classic four-on-the-floor kick, smooth walking bassline, soulful female vocal stabs, club lounge reverb", color: "from-violet-955 to-purple-955", accent: "violet", audioUrl: "", lyrics: "" },

  // ── Techno ──
  { id: 71, name: "Berlin Techno", genre: "Techno",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png", mood: "Dark", bpm: "128–135", vocal: "None", tags: "Berlin techno, 130 BPM, heavy driving industrial kick drum, hypnotic synthesiser loop, dark warehouse acoustics, minimalist electronic percussion", color: "from-gray-900 to-zinc-955", accent: "gray", audioUrl: "", lyrics: "" },

  // ── Trance ──
{
    id: 72,
    name: "Uplifting Trance",
    genre: "Trance",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
    mood: "Epic",
    bpm: "136–142",
    vocal: "Female Ethereal",
    tags: "Uplifting trance, 138 BPM, soaring synthesiser leads, euphoric cinematic breakdown, dramatic chord build-up, epic hands-in-the-air stadium drop",
    color: "from-blue-955 to-cyan-955",
    accent: "blue",
    audioUrl: "",
    lyrics: ""
  },

  // ── Celtic ──
  {
    id: 73,
    name: "Celtic Journey",
    genre: "Celtic",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
    mood: "Epic",
    bpm: "100–120",
    vocal: "Female Gaelic",
    tags: "Celtic journey epic folk, 110 BPM, traditional Irish fiddle and tin whistle, Bodhran frame drum, soaring ethereal female vocal, misty highland atmosphere",
    color: "from-green-955 to-emerald-955",
    accent: "green",
    audioUrl: "",
    lyrics: ""
  },

  // ── Bossa Nova ──
  {
    id: 74,
    name: "Rio Nights",
    genre: "Bossa Nova",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
    mood: "Romantic",
    bpm: "90–110",
    vocal: "Soft Female Portuguese",
    tags: "Jazzy Bossa Nova, 100 BPM, nylon string acoustic guitar chords, soft syncopated brush snare, warm double bass plucks, soft Portuguese vocal, sunny beach atmosphere",
    color: "from-yellow-955 to-amber-955",
    accent: "amber",
    audioUrl: "",
    lyrics: ""
  },

  // ── Reggae ──
  {
    id: 75,
    name: "Roots Reggae",
    genre: "Reggae",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png",
    mood: "Chill",
    bpm: "70–85",
    vocal: "Male Jamaican",
    tags: "Roots reggae, 75 BPM, offbeat electric guitar chops, heavy low-tuned sub bass, classic one-drop drum beat, relaxed Jamaican vocals, warm analog room mix",
    color: "from-green-955 to-yellow-955",
    accent: "green",
    audioUrl: "",
    lyrics: ""
  },

  // ── Blues ──
  { id: 76, name: "Delta Blues", genre: "Blues",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png", mood: "Nostalgic", bpm: "60–80", vocal: "Raspy Male", tags: "delta blues, slide guitar, raw acoustic, foot stomp, soulful moan, dusty road", color: "from-amber-950 to-stone-900", accent: "amber", audioUrl: "", lyrics: "" },

  // ── New Age ──
  { id: 77, name: "Crystal Healing", genre: "New Age",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png", mood: "Dreamy", bpm: "60–80", vocal: "None", tags: "new age, crystal singing bowls, gentle piano, nature sounds, healing frequency, ethereal", color: "from-sky-950 to-teal-950", accent: "teal", audioUrl: "", lyrics: "" },

  // ── Gospel / Worship ──
  { id: 78, name: "Modern Worship", genre: "Gospel / Worship",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png", mood: "Uplifting", bpm: "70–80", vocal: "Choir", tags: "modern worship, gospel choir, powerful vocals, uplifting piano, spiritual, anthemic", color: "from-amber-950 to-yellow-950", accent: "amber", audioUrl: "", lyrics: "" },

  // ── Country ──
  { id: 79, name: "Modern Country", genre: "Country",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png", mood: "Uplifting", bpm: "100–120", vocal: "Male Country", tags: "modern country, twangy guitar, steel guitar, storytelling, Nashville sound, dusty road", color: "from-orange-950 to-amber-950", accent: "orange", audioUrl: "", lyrics: "" },

  // ── Meditation ──
  { id: 80, name: "Deep Meditation", genre: "Meditation",
    thumbnailUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png", mood: "Chill", bpm: "40–60", vocal: "None", tags: "meditation, tibetan singing bowl, drone pad, binaural beats, deep relaxation, mindfulness", color: "from-indigo-950 to-purple-950", accent: "indigo", audioUrl: "", lyrics: "" },
];

const ACCENT_CLASSES: Record<string, string> = {
  purple: "border-purple-500/40 hover:border-purple-400/70 hover:shadow-[0_0_20px_rgba(168,85,247,0.25)]",
  cyan: "border-cyan-500/40 hover:border-cyan-400/70 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]",
  teal: "border-teal-500/40 hover:border-teal-400/70 hover:shadow-[0_0_20px_rgba(20,184,166,0.25)]",
  pink: "border-pink-500/40 hover:border-pink-400/70 hover:shadow-[0_0_20px_rgba(236,72,153,0.25)]",
  violet: "border-violet-500/40 hover:border-violet-400/70 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]",
  gray: "border-gray-500/40 hover:border-gray-400/70 hover:shadow-[0_0_20px_rgba(156,163,175,0.25)]",
  orange: "border-orange-500/40 hover:border-orange-400/70 hover:shadow-[0_0_20px_rgba(249,115,22,0.25)]",
  amber: "border-amber-500/40 hover:border-amber-400/70 hover:shadow-[0_0_20px_rgba(245,158,11,0.25)]",
  blue: "border-blue-500/40 hover:border-blue-400/70 hover:shadow-[0_0_20px_rgba(59,130,246,0.25)]",
  red: "border-red-500/40 hover:border-red-400/70 hover:shadow-[0_0_20px_rgba(239,68,68,0.25)]",
  yellow: "border-yellow-500/40 hover:border-yellow-400/70 hover:shadow-[0_0_20px_rgba(234,179,8,0.25)]",
  indigo: "border-indigo-500/40 hover:border-indigo-400/70 hover:shadow-[0_0_20px_rgba(99,102,241,0.25)]",
  lime: "border-lime-500/40 hover:border-lime-400/70 hover:shadow-[0_0_20px_rgba(132,204,22,0.25)]",
  fuchsia: "border-fuchsia-500/40 hover:border-fuchsia-400/70 hover:shadow-[0_0_20px_rgba(217,70,239,0.25)]",
  rose: "border-rose-500/40 hover:border-rose-400/70 hover:shadow-[0_0_20px_rgba(244,63,94,0.25)]",
  slate: "border-slate-500/40 hover:border-slate-400/70 hover:shadow-[0_0_20px_rgba(100,116,139,0.25)]",
  zinc: "border-zinc-500/40 hover:border-zinc-400/70 hover:shadow-[0_0_20px_rgba(113,113,122,0.25)]",
  sky: "border-sky-500/40 hover:border-sky-400/70 hover:shadow-[0_0_20px_rgba(14,165,233,0.25)]",
  green: "border-green-500/40 hover:border-green-400/70 hover:shadow-[0_0_20px_rgba(34,197,94,0.25)]",
  stone: "border-stone-500/40 hover:border-stone-400/70 hover:shadow-[0_0_20px_rgba(120,113,108,0.25)]",
  emerald: "border-emerald-500/40 hover:border-emerald-400/70 hover:shadow-[0_0_20px_rgba(16,185,129,0.25)]",
};

export default function StyleLibraryPage() {
  const [search, setSearch] = useState("");
  const [activeGenre, setActiveGenre] = useState("All");
  const [activeMood, setActiveMood] = useState("All");
  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number | string>>(new Set());
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const router = useRouter();
  const [customPresets, setCustomPresets] = useState<any[]>([]);
  const [dbPresets, setDbPresets] = useState<any[]>([]);
  const [isCreatePresetOpen, setIsCreatePresetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<any>(null);

  // 장르 탭 (TOP 100 / TOP 200) 및 스타일 프리셋 3x7(21개) 페이징/정렬/커스텀 상태
  const [activeGenreTab, setActiveGenreTab] = useState<'top100' | 'top200'>('top100');
  const [showCustomPresetsOnly, setShowCustomPresetsOnly] = useState<boolean>(false);
  const [presetPage, setPresetPage] = useState<number>(1);
  const [sortByPreset, setSortByPreset] = useState<'popular' | 'recommended' | 'latest' | 'oldest' | 'mostLiked'>('popular');
  const [activeTrackObject, setActiveTrackObject] = useState<any>(null);
  const [selectedStyle, setSelectedStyle] = useState<any>(null);
  const [activeSampleSongDetail, setActiveSampleSongDetail] = useState<any>(null);
  const [copiedLinkTrackId, setCopiedLinkTrackId] = useState<string | null>(null);
  const [isPro, setIsPro] = useState<boolean>(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState<boolean>(false);
  const [isGenerationDrawerOpen, setIsGenerationDrawerOpen] = useState(false);
  const [drawerPreset, setDrawerPreset] = useState<any | null>(null);
  const [activeShowcaseIndex, setActiveShowcaseIndex] = useState<number>(0);
  const showcaseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showcaseScrollRef = useRef<HTMLDivElement | null>(null);

  const scrollShowcase = (direction: 'left' | 'right') => {
    if (showcaseScrollRef.current) {
      const scrollAmount = 400;
      showcaseScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };


  const getSampleSongDetails = useCallback((style: any) => {
    if (!style) return null;
    
    const idStr = String(style.id);
    const hash = idStr.startsWith('custom_') 
      ? idStr.replace('custom_', 'CUST_').slice(0, 8).toUpperCase()
      : idStr.startsWith('db_')
        ? idStr.replace('db_', 'DB_').slice(0, 8).toUpperCase()
        : idStr.startsWith('showcase-')
          ? 'MASTERPIECE'
          : idStr.startsWith('viral-')
            ? 'VIRAL_SHORTS'
            : `STYLE_${idStr.padStart(4, '0')}`;
        
    const createdDate = style.updated_at 
      ? new Date(style.updated_at).toLocaleString('ko-KR')
      : `2026. 7. 8. 오후 4:13:41`;
      
    // Realistic song title mappings matching user request
    let sampleTitle = style.title || style.name || `${style.name} Demo Song`;
    const styleName = style.name || '';
    if (!style.title) {
      if (styleName.includes('Dark Synthwave')) {
        sampleTitle = 'Grid Runner';
      } else if (styleName.includes('Cyberpunk Bass')) {
        sampleTitle = 'Silicon Vengeance';
      } else if (styleName.includes('Chillwave Drift')) {
        sampleTitle = 'Neon Coastline';
      } else if (styleName.includes('Late Night Lo-Fi')) {
        sampleTitle = 'Cozy Rain Drops';
      } else if (styleName.includes('Rainy Day Study')) {
        sampleTitle = 'Silent Window';
      } else if (styleName.includes('Coffee Shop Chill')) {
        sampleTitle = 'Espresso Dreams';
      } else if (styleName.includes('Trap Darkness')) {
        sampleTitle = 'Nightmare Alley';
      } else if (styleName.includes('Boom Bap Classic')) {
        sampleTitle = '90s Concrete';
      } else if (styleName.includes('Cloud Rap Haze')) {
        sampleTitle = 'Vaporized Mind';
      } else if (styleName.includes('Bedroom Pop Dreams')) {
        sampleTitle = 'Sleepless Sunday';
      } else if (styleName.includes('Indie Bedroom Vibe')) {
        sampleTitle = 'Dusty Skylights';
      } else if (styleName.includes('Lofi Bedroom Beat')) {
        sampleTitle = 'Midnight Tea';
      } else if (styleName.includes('Modern Acoustic Pop')) {
        sampleTitle = 'Sunny Afternoon';
      } else if (styleName.includes('Americana Storyteller')) {
        sampleTitle = 'Whiskey River';
      } else if (styleName.includes('Rustic Cabin Folk')) {
        sampleTitle = 'Pine & Cedar';
      } else if (styleName.includes('Salsa Fuego')) {
        sampleTitle = 'Bailamos';
      } else if (styleName.includes('Reggaeton Urbano')) {
        sampleTitle = 'Dale Fuego';
      } else if (styleName.includes('Sensual Bachata')) {
        sampleTitle = 'Corazón Loco';
      } else if (styleName.includes('Classic Arena Rock')) {
        sampleTitle = 'Electric Thunder';
      } else if (styleName.includes('Desert Stoned Groove')) {
        sampleTitle = 'Dust & Shadows';
      } else if (styleName.includes('Alt-Rock Grunge Revival')) {
        sampleTitle = 'Broken Mirror';
      } else if (styleName.includes('Trot')) {
        sampleTitle = '먹빛 깃발 드라이브송 조선힙합 기개서사';
      }
    }
    
    const sampleCoverArt = style.thumbnailUrl || style.cover_art_url || style.image_url || style.imageUrl || "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png";
    const sampleAudioUrl = style.audioUrl || style.audio_url || "https://file.302.ai/gpt/imgs/20260721/3c2a38210fe522646d6b2b6241c2c31e.mp3";
    const sampleTags = style.tags || style.stylePrompt || "";
    const sampleLyrics = style.lyrics || style.lyricsPrompt || "";
    
    return {
      id: hash,
      title: sampleTitle,
      cover_art_url: sampleCoverArt,
      audio_url: sampleAudioUrl,
      created_at: createdDate,
      status: 'completed',
      license_hash: JSON.stringify({
        stylePrompt: sampleTags,
        lyricsPrompt: sampleLyrics,
        engine: 'Suno V4.0'
      })
    };
  }, []);

  const handleSaveCustomPreset = (data: { id?: string; name: string; desc: string; emoji: string; gradient: string; customPrompt: string; metadata?: any }) => {
    const thumbnailUrl = data.metadata?.thumbnail_url || data.metadata?.cardImage || "";
    if (data.id) {
      const updated = customPresets.map(p => p.id === data.id ? { ...p, ...data, thumbnailUrl, isCustom: true } : p);
      setCustomPresets(updated);
      localStorage.setItem('melodio_custom_presets', JSON.stringify(updated));
    } else {
      const newPreset = {
        id: `custom_${Date.now()}`,
        ...data,
        thumbnailUrl,
        isCustom: true
      };
      const updated = [newPreset, ...customPresets];
      setCustomPresets(updated);
      setShowCustomPresetsOnly(true);
      setActiveGenre("All");
    }
    setIsCreatePresetOpen(false);
    setEditingPreset(null);
  };

  // Load custom presets from localStorage on mount & auto-heal missing IDs
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("melodio_custom_presets");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            let updated = false;
            const cleaned = parsed.map((p: any, idx: number) => {
              if (!p.id) {
                updated = true;
                return { ...p, id: `custom_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 9)}` };
              }
              return p;
            });
            setCustomPresets(cleaned);
            if (updated) {
              localStorage.setItem("melodio_custom_presets", JSON.stringify(cleaned));
            }
          } else {
            setCustomPresets([]);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  // Check user Pro status on mount
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



  // 즐겨찾기 목록이 비어 있으면 필터 자동 해제
  useEffect(() => {
    if (savedIds.size === 0) {
      setShowSavedOnly(false);
    }
  }, [savedIds.size]);

  // 가사 보기 상태 (card별)
  const [expandedLyricsId, setExpandedLyricsId] = useState<number | string | null>(null);

  // 음원 재생 재생/일시정지 상태
  const [playingId, setPlayingId] = useState<number | string | null>(null);

  // Auto-slide showcase carousel (8 seconds)
  useEffect(() => {
    // If playing a showcase song, pause auto-slide
    const isPlayingShowcase = playingId && String(playingId).startsWith('showcase-');
    if (isPlayingShowcase) {
      if (showcaseTimerRef.current) {
        clearInterval(showcaseTimerRef.current);
        showcaseTimerRef.current = null;
      }
      return;
    }

    showcaseTimerRef.current = setInterval(() => {
      setActiveShowcaseIndex((prev) => (prev + 1) % SHOWCASE_TRACKS.length);
    }, 8500);

    return () => {
      if (showcaseTimerRef.current) {
        clearInterval(showcaseTimerRef.current);
      }
    };
  }, [playingId]);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isShuffle, setIsShuffle] = useState(false);
  const [likedSongs, setLikedSongs] = useState<Set<number | string>>(new Set());
  const [dislikedSongs, setDislikedSongs] = useState<Set<number | string>>(new Set());
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);
  const [isRepeat, setIsRepeat] = useState(false);

  const isShuffleRef = useRef(isShuffle);
  const isRepeatRef = useRef(isRepeat);
  const playingIdRef = useRef(playingId);
  const filteredRef = useRef<typeof STYLE_DATA>([]);
  const handleEndedRef = useRef<() => void>(() => {});

  // 컴포넌트 마운트 시 오디오 생성
  useEffect(() => {
    audioRef.current = new Audio();
    
    const handleEnded = () => {
      if (handleEndedRef.current) {
        handleEndedRef.current();
      }
    };
    const handleTimeUpdate = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    };
    const handleDurationChange = () => {
      if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    };

    audioRef.current.addEventListener("ended", handleEnded);
    audioRef.current.addEventListener("timeupdate", handleTimeUpdate);
    audioRef.current.addEventListener("durationchange", handleDurationChange);
    audioRef.current.addEventListener("loadedmetadata", handleDurationChange);

    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener("ended", handleEnded);
        audioRef.current.removeEventListener("timeupdate", handleTimeUpdate);
        audioRef.current.removeEventListener("durationchange", handleDurationChange);
        audioRef.current.removeEventListener("loadedmetadata", handleDurationChange);
        audioRef.current.pause();
      }
    };
  }, []);

  // Refs 동기화
  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  useEffect(() => {
    isRepeatRef.current = isRepeat;
  }, [isRepeat]);

  useEffect(() => {
    playingIdRef.current = playingId;
  }, [playingId]);

  // 음원 재생/일시정지 토글 함수
  const handleTogglePlay = useCallback((id: number | string, url: string, trackObj?: any) => {
    if (!audioRef.current) return;

    if (trackObj) {
      setActiveTrackObject(trackObj);
    }

    if (playingIdRef.current === id) {
      if (audioRef.current.paused) {
        registerActiveAudio(audioRef.current, () => setPlayingId(null));
        audioRef.current.play().catch((err) => console.log("Audio playback failed:", err));
      } else {
        audioRef.current.pause();
        setPlayingId(null);
      }
    } else {
      audioRef.current.pause();
      setCurrentTime(0);
      setDuration(0);
      audioRef.current.src = url;
      audioRef.current.load();
      registerActiveAudio(audioRef.current, () => setPlayingId(null));
      audioRef.current.play().catch((err) => console.log("Audio playback failed:", err));
      setPlayingId(id);
    }
  }, []);

  useEffect(() => {
    const handleOtherAudioStart = (e: any) => {
      if (e.detail?.audio && audioRef.current && e.detail.audio !== audioRef.current) {
        setPlayingId(null);
      }
    };
    window.addEventListener("melodio-audio-started", handleOtherAudioStart);
    return () => window.removeEventListener("melodio-audio-started", handleOtherAudioStart);
  }, []);

  const playNext = useCallback((isAutoPlay = false) => {
    const list = filteredRef.current;
    const currentId = playingIdRef.current;
    if (list.length === 0) return;

    let nextIndex = 0;
    if (isShuffleRef.current) {
      nextIndex = Math.floor(Math.random() * list.length);
      if (list.length > 1 && list[nextIndex].id === currentId) {
        nextIndex = (nextIndex + 1) % list.length;
      }
    } else {
      const currentIndex = list.findIndex(item => item.id === currentId);
      if (currentIndex !== -1) {
        nextIndex = currentIndex + 1;
        if (nextIndex >= list.length) {
          if (isAutoPlay) {
            setPlayingId(null);
            setCurrentTime(0);
            return;
          } else {
            nextIndex = 0;
          }
        }
      }
    }

    const nextTrack = list[nextIndex];
    if (nextTrack) {
      handleTogglePlay(nextTrack.id, nextTrack.audioUrl);
    }
  }, [handleTogglePlay]);

  const playPrev = useCallback(() => {
    const list = filteredRef.current;
    const currentId = playingIdRef.current;
    if (list.length === 0) return;

    let prevIndex = 0;
    if (isShuffleRef.current) {
      prevIndex = Math.floor(Math.random() * list.length);
      if (list.length > 1 && list[prevIndex].id === currentId) {
        prevIndex = (prevIndex + 1) % list.length;
      }
    } else {
      const currentIndex = list.findIndex(item => item.id === currentId);
      if (currentIndex !== -1) {
        prevIndex = currentIndex - 1;
        if (prevIndex < 0) {
          prevIndex = list.length - 1;
        }
      }
    }

    const prevTrack = list[prevIndex];
    if (prevTrack) {
      handleTogglePlay(prevTrack.id, prevTrack.audioUrl);
    }
  }, [handleTogglePlay]);

  const handleSkipBack = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    } else {
      playPrev();
    }
  }, [playPrev]);

  // ended 콜백 실시간 바인딩
  useEffect(() => {
    handleEndedRef.current = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (isRepeatRef.current) {
        audio.currentTime = 0;
        audio.play().catch(err => console.error(err));
      } else {
        playNext(true);
      }
    };
  }, [playNext]);

  const combined = useMemo(() => {
    const list = Array.isArray(customPresets) ? customPresets : [];
    const mappedCustom = list.map((p, idx) => ({
      id: p.id || `custom_fallback_${idx}_${p.name || 'preset'}`,
      name: p.name || "무제 프리셋",
      genre: "Custom",
      mood: "Chill",
      bpm: "Auto",
      vocal: "No Vocal",
      tags: p.customPrompt || p.tags || p.prompt || p.stylePrompt || "",
      color: "from-fuchsia-950 to-purple-950",
      accent: "fuchsia" as const,
      audioUrl: "",
      lyrics: p.lyricsTemplate || "",
      isCustom: true,
      thumbnailUrl: (p.thumbnailUrl || p.metadata?.thumbnail_url || p.metadata?.cardImage || p.thumbnail_url || "").startsWith('http') 
        ? (p.thumbnailUrl || p.metadata?.thumbnail_url || p.metadata?.cardImage || p.thumbnail_url) 
        : getFallbackCoverArtForPreset({
            tags: p.customPrompt || p.tags || p.prompt || p.stylePrompt || "",
            name: p.name || ""
          })
    }));

    return [...STYLE_DATA, ...mappedCustom];
  }, [customPresets]);

  const displayedGenres = useMemo(() => {
    if (activeGenreTab === 'top100') return TOP_100_GENRES;
    return TOP_200_GENRES;
  }, [activeGenreTab]);

  const filtered = useMemo(() => {
    return combined.filter((s: any) => {
      // 1. Custom only filter
      if (showCustomPresetsOnly && !s.isCustom) return false;

      // 2. Saved only
      if (showSavedOnly && !savedIds.has(s.id)) return false;

      // 3. Genre match
      const matchGenre = activeGenre === "All" || (s.genre && s.genre.toLowerCase() === activeGenre.toLowerCase());

      // 4. Mood match
      const matchMood = activeMood === "All" || (s.mood && s.mood.toLowerCase() === activeMood.toLowerCase());

      // 5. Search match
      const query = search.trim().toLowerCase();
      if (query === "") return matchGenre && matchMood;

      const keywords = query.split(/\s+/).filter(Boolean);
      const matchSearch = keywords.every(kw => {
        return (
          (s.name || "").toLowerCase().includes(kw) ||
          (s.tags || "").toLowerCase().includes(kw) ||
          (s.genre || "").toLowerCase().includes(kw) ||
          (s.mood || "").toLowerCase().includes(kw) ||
          String(s.id).toLowerCase().includes(kw) ||
          (s.lyrics || "").toLowerCase().includes(kw)
        );
      });
      return matchGenre && matchMood && matchSearch;
    });
  }, [search, activeGenre, activeMood, activeGenreTab, showSavedOnly, showCustomPresetsOnly, savedIds, combined]);

  const sortedPresets = useMemo(() => {
    const list = [...filtered];
    if (sortByPreset === 'latest') {
      return list.sort((a: any, b: any) => (b.isCustom ? 1 : 0) - (a.isCustom ? 1 : 0) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
    }
    if (sortByPreset === 'oldest') {
      return list.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    }
    if (sortByPreset === 'mostLiked') {
      return list.sort((a: any, b: any) => (savedIds.has(b.id) ? 1 : 0) - (savedIds.has(a.id) ? 1 : 0));
    }
    if (sortByPreset === 'recommended') {
      return list.sort((a: any, b: any) => {
        const aVal = (String(a.id).charCodeAt(0) * 19 + (a.name || '').length * 7) % 100;
        const bVal = (String(b.id).charCodeAt(0) * 19 + (b.name || '').length * 7) % 100;
        return bVal - aVal;
      });
    }
    // popular (default)
    return list.sort((a: any, b: any) => {
      const aVal = (String(a.id).charCodeAt(0) * 31 + (a.genre || '').length * 13) % 500;
      const bVal = (String(b.id).charCodeAt(0) * 31 + (b.genre || '').length * 13) % 500;
      return bVal - aVal;
    });
  }, [filtered, sortByPreset, savedIds]);

  // 검색, 필터, 탭, 정렬, 커스텀 변경 시 페이지 번호를 1로 리셋
  useEffect(() => {
    setPresetPage(1);
  }, [search, activeGenre, activeMood, activeGenreTab, sortByPreset, showCustomPresetsOnly]);

  const PRESET_PAGE_SIZE = 21; // 3x7 Grid (21개 노출)
  const totalPages = Math.ceil(sortedPresets.length / PRESET_PAGE_SIZE) || 1;

  const paginatedPresets = useMemo(() => {
    return sortedPresets.slice((presetPage - 1) * PRESET_PAGE_SIZE, presetPage * PRESET_PAGE_SIZE);
  }, [sortedPresets, presetPage]);

  const currentPlayingTrack = useMemo(() => {
    if (!playingId) return null;
    const playingIdStr = String(playingId);

    if (playingIdStr.startsWith('showcase-')) {
      return SHOWCASE_TRACKS.find((t: any) => String(t.id) === playingIdStr) || null;
    }
    const foundInPresets = combined.find((t: any) => String(t.id) === playingIdStr);
    if (foundInPresets) return foundInPresets;

    if (activeTrackObject) {
      return {
        id: activeTrackObject.id || playingId,
        name: activeTrackObject.title || activeTrackObject.name || activeTrackObject.prompt || 'Style Library Track',
        title: activeTrackObject.title || activeTrackObject.name || activeTrackObject.prompt || 'Style Library Track',
        genre: activeTrackObject.tags || activeTrackObject.genre || activeTrackObject.stylePrompt || 'Style Library',
        audioUrl: activeTrackObject.audio_url || activeTrackObject.audioUrl,
        thumbnailUrl: activeTrackObject.image_url || activeTrackObject.imageUrl || activeTrackObject.thumbnailUrl || "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
        tags: activeTrackObject.tags || activeTrackObject.stylePrompt || '',
        lyrics: activeTrackObject.lyrics || '',
        updated_at: activeTrackObject.created_at || activeTrackObject.updated_at || new Date().toISOString(),
      };
    }

    return null;
  }, [combined, playingId, activeTrackObject]);

  useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);

  const getEnrichedTags = (style: any) => {
    let enriched = style.tags || "";
    if (style.vocal) {
      const vocalLower = style.vocal.toLowerCase();
      const tagsLower = enriched.toLowerCase();
      
      if (vocalLower === "no vocal" || vocalLower === "none") {
        if (!tagsLower.includes("instrumental") && !tagsLower.includes("no vocals")) {
          enriched = enriched ? `${enriched}, instrumental, no vocals` : "instrumental, no vocals";
        }
      } else {
        const words = vocalLower.split(" ");
        const alreadyHasVocal = words.some((word: string) => tagsLower.includes(word)) && (tagsLower.includes("vocal") || tagsLower.includes("voice") || tagsLower.includes("singing") || tagsLower.includes("rap"));
        if (!alreadyHasVocal) {
          enriched = enriched ? `${enriched}, ${vocalLower.toLowerCase()} vocal style` : `${vocalLower.toLowerCase()} vocal style`;
        }
      }
    }
    return enriched;
  };

  const handleCopy = (style: any) => {
    const finalTags = getEnrichedTags(style);
    navigator.clipboard.writeText(finalTags);
    setCopiedId(style.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = (id: number | string) => {
    setSavedIds((prev: Set<number | string>) => {
      const next = new Set<number | string>(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };



  const renderStyleCard = (style: any, index: number) => {
    const isPlaying = playingId === style.id;
    const audioUrlToPlay = (style.audioUrl && style.audioUrl.startsWith('http'))
      ? style.audioUrl 
      : PRESET_AUDIO_POOL[index % PRESET_AUDIO_POOL.length];
    const isSaved = savedIds.has(style.id);
    const isLocked = !style.isCustom && !isPro && !FREE_STYLE_IDS.has(style.id);

    return (
      <div
        key={style.id}
        className="relative rounded-xl border border-zinc-800 bg-zinc-950/20 hover:border-zinc-700/60 backdrop-blur-sm transition-all duration-300 p-3.5 flex items-center gap-4 group hover:z-30"
      >
        {/* Left: Circular Image with Play/Pause hover overlay */}
        <div className="relative w-24 h-24 rounded-full shrink-0 overflow-hidden bg-zinc-900 border border-white/5 group/play cursor-pointer shadow-md">
          <img 
            src={style.thumbnailUrl && style.thumbnailUrl.startsWith('http') ? style.thumbnailUrl : getFallbackCoverArtForPreset(style)} 
            alt={style.name}
            onError={(e) => {
              if (e.currentTarget.getAttribute('data-fallback-attempted') === 'true') {
                e.currentTarget.src = "/image_to_music_banner.png";
                return;
              }
              e.currentTarget.setAttribute('data-fallback-attempted', 'true');
              e.currentTarget.src = getFallbackCoverArtForPreset(style);
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          
          {/* Hover Play/Pause Overlay */}
          <div 
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePlay(style.id, audioUrlToPlay, style);
            }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover/play:opacity-100 transition-opacity duration-200 flex items-center justify-center z-10"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-white fill-current animate-pulse" />
            ) : (
              <Play className="w-6 h-6 text-white fill-current ml-0.5" />
            )}
          </div>

          {isPlaying && (
            <div className="absolute bottom-2 right-2 bg-black/75 p-0.5 rounded-full z-20">
              <span className="flex items-center gap-0.5 text-xs text-red-400">
                <span className="w-0.5 h-1.5 bg-red-400 rounded-full animate-[bounce_0.6s_infinite_100ms]" />
                <span className="w-0.5 h-2 bg-red-400 rounded-full animate-[bounce_0.6s_infinite_300ms]" />
                <span className="w-0.5 h-1 bg-red-400 rounded-full animate-[bounce_0.6s_infinite_500ms]" />
              </span>
            </div>
          )}
        </div>

        {/* Right Metadata Block */}
        <div className="min-w-0 flex-1 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h4 
              onClick={() => {
                if (isLocked) {
                  setIsUpgradeModalOpen(true);
                } else {
                  setSelectedStyle(style);
                }
              }}
              className="text-[15px] font-bold text-zinc-200 hover:text-fuchsia-400 transition-colors cursor-pointer truncate leading-snug flex items-center gap-1.5"
            >
              {style.name}
              {isLocked && <Lock className="w-3 h-3 text-zinc-500 shrink-0" />}
            </h4>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
              <span className="font-semibold text-zinc-300 uppercase tracking-wider">
                {style.genre}
              </span>
              <span className="text-zinc-700">•</span>
              <span>
                {style.vocal || 'No Vocal'}
              </span>
              {style.isCustom && (
                <>
                  <span className="text-zinc-700">•</span>
                  <span className="text-[8px] px-1 py-0.2 rounded bg-zinc-900/60 border border-zinc-800/80 text-zinc-500 font-mono tracking-wider uppercase font-semibold scale-90 origin-left">
                    Custom
                  </span>
                </>
              )}
            </div>
            {/* 3rd Line: Spec details (BPM & Mood) */}
            <div className="flex items-center gap-2 mt-1 text-[9.5px] text-zinc-500 font-mono">
              <span>BPM: <span className="text-zinc-400 font-bold">{style.bpm || "Auto"}</span></span>
              <span className="text-zinc-800">•</span>
              <span>Mood: <span className="text-zinc-400 font-bold">{style.mood || "Chill"}</span></span>
            </div>
            {/* 4th Line: Prompt Tags */}
            <p className="text-[10.5px] text-zinc-500 font-mono mt-1.5 truncate max-w-[90%] leading-relaxed" title={isLocked ? "Pro Plan Exclusive" : style.tags}>
              {isLocked ? "🔒 Upgrade to Pro to view style recipe" : (style.tags || 'No prompt tags')}
            </p>
          </div>

          {/* Likes & Delete/Edit for Custom */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {style.isCustom && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const found = customPresets.find(p => p.id === style.id);
                    if (found) {
                      setEditingPreset(found);
                    }
                  }}
                  className="text-zinc-500 hover:text-white transition-colors p-1"
                  title="수정"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('이 커스텀 프리셋을 삭제하시겠습니까?')) {
                      const updated = customPresets.filter(p => p.id !== style.id);
                      setCustomPresets(updated);
                      localStorage.setItem('melodio_custom_presets', JSON.stringify(updated));
                    }
                  }}
                  className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                  title="삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            
            <button
              onClick={() => handleSave(style.id)}
              className={`p-1 rounded-lg transition-colors border border-transparent ${
                isSaved ? "text-red-500" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="좋아요"
            >
              <Heart className={`w-3.5 h-3.5 ${isSaved ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>

        {/* 바로 곡 생성하기 단축 버튼 (우측 하단 절대 배치) */}
        <div className="absolute bottom-2.5 right-2.5 z-20 group/btn">
          {/* Tooltip: 음표 아이콘 바로 위에 배치 */}
          <span className="absolute bottom-11 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 shadow-[0_4px_15px_rgba(0,0,0,0.6)] pointer-events-none opacity-0 translate-y-1 group-hover/btn:opacity-100 group-hover/btn:translate-y-0 transition-all duration-200 whitespace-nowrap z-30">
            이 스타일로 곡 생성하기
            {/* Tooltip Arrow */}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-zinc-800" />
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isLocked) {
                setIsUpgradeModalOpen(true);
              } else {
                setDrawerPreset(style);
                setIsGenerationDrawerOpen(true);
              }
            }}
            className="w-9 h-9 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-950 p-[2px] border border-white/15 shadow-[0_3px_8px_rgba(0,0,0,0.5)] hover:shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all duration-300 active:scale-90 relative overflow-hidden flex items-center justify-center group/btn"
          >
            {/* Glossy Sheen reflection */}
            <span className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent rounded-t-full pointer-events-none z-10" />
            
            {/* Inner Ring */}
            <div className="w-full h-full rounded-full border border-white/10 bg-gradient-to-b from-zinc-900 to-black hover:from-fuchsia-950/80 hover:to-purple-950/80 flex items-center justify-center transition-all duration-300">
              <Music2 className="w-3.5 h-3.5 text-zinc-300 group-hover/btn:text-fuchsia-400 group-hover/btn:scale-110 transition-all duration-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
            </div>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto pt-4 pb-16">
      <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.4)]">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white">Style Library</h1>
          </div>
          <p className="text-zinc-400 ml-13">
            장르별 고품질 시그니처 3선 — 수노 최신 엔진에 최적화된 프롬프트 태그와 가사, 샘플 곡을 들어보고 바로 카피해 가세요.
          </p>
        </div>
      </header>

      {/* ─── Premium AI Showcase Section ─── */}
      <div className="relative mb-14 space-y-1 select-none">
        {/* Top Branding & Value Prop Copy */}
        <div className="space-y-2 text-center flex flex-col items-center justify-center">
          <div className="flex items-center justify-center gap-2">
            <span className="tracking-[0.25em] text-[10px] font-extrabold text-cyan-400 uppercase select-none drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
              SIGNATURE PRESETS
            </span>
            <span className="text-zinc-600 text-xs">•</span>
            <span className="text-[10px] font-extrabold text-fuchsia-400 uppercase tracking-widest">
              Inspiration Gallery
            </span>
          </div>
          
          <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none">
            Signature Masterpiece Showcase
          </h2>
          
          <p className="text-[12.5px] md:text-[13.5px] font-light text-zinc-400 leading-relaxed max-w-4xl mx-auto">
            멜로디오 프로듀서들이 엄선하고 검증한 장르별 프리미엄 스타일 레시피입니다. 
            각 앨범을 클릭하여 고품질 데모 음원을 감상하고, 마법 같은 프롬프트 태그와 가사 스타일을 즉시 카피하여 나만의 음악을 창작해 보세요.
          </p>
        </div>

        {/* Carousel Container Wrapper */}
        <div className="relative group/slider px-2">
          {/* Scrollable Card Container */}
          <div 
            ref={showcaseScrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-none pt-1 pb-6 scroll-smooth snap-x snap-mandatory z-10"
          >
            {SHOWCASE_TRACKS.map((track) => {
              const isPlaying = playingId === track.id;
              return (
                <div 
                  key={track.id}
                  className="w-48 shrink-0 snap-start flex flex-col group/card relative pt-4"
                >
                  {/* Card Stack Deck Background Layers */}
                  <div className="absolute top-2 left-2.5 right-2.5 h-4 rounded-t-2xl bg-zinc-800/85 border border-white/5 opacity-40 transform scale-[0.96] z-0 origin-bottom" />
                  <div className="absolute top-0.5 left-5 right-5 h-4 rounded-t-2xl bg-zinc-700/60 border border-white/5 opacity-25 transform scale-[0.91] z-0 origin-bottom" />

                  {/* Album Cover Art Card */}
                  <div className="relative w-48 h-48 rounded-2xl overflow-hidden border border-white/10 shadow-2xl z-10 bg-zinc-950 select-none group-hover/card:border-zinc-600/50 transition-colors duration-300">
                    <img 
                      src={track.thumbnailUrl} 
                      alt={track.title}
                      className="w-full h-full object-cover rounded-2xl group-hover/card:scale-105 transition-transform duration-700 select-none"
                    />

                    {/* Large Semi-transparent White Genre Overlay */}
                    <div className="absolute top-3.5 left-4 text-[26px] font-black text-white/80 tracking-tight z-20 select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] font-sans antialiased">
                      {track.genre}
                    </div>

                    {/* Play Button / Waveform Overlay in Bottom Right */}
                    <div className="absolute bottom-3.5 right-4 z-30">
                      {isPlaying ? (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePlay(track.id, track.audioUrl);
                          }}
                          className="w-10 h-10 rounded-full bg-black/60 border border-white/10 backdrop-blur-sm flex items-center justify-center cursor-pointer transition-all duration-200"
                        >
                          {/* Playing Waves */}
                          <div className="group-hover/card:hidden flex items-center gap-0.5 justify-center">
                            <span className="w-0.5 h-3 bg-fuchsia-400 rounded-full animate-[bounce_0.6s_infinite_100ms]" />
                            <span className="w-0.5 h-4 bg-fuchsia-400 rounded-full animate-[bounce_0.6s_infinite_300ms]" />
                            <span className="w-0.5 h-2.5 bg-fuchsia-400 rounded-full animate-[bounce_0.6s_infinite_500ms]" />
                          </div>
                          <Pause className="w-3.5 h-3.5 text-fuchsia-400 fill-current hidden group-hover/card:block" />
                        </div>
                      ) : (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePlay(track.id, track.audioUrl);
                          }}
                          className="w-10 h-10 rounded-full bg-black/60 border border-white/10 backdrop-blur-sm flex items-center justify-center cursor-pointer opacity-0 group-hover/card:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/card:translate-y-0"
                        >
                          <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                        </div>
                      )}
                    </div>

                    {/* Play / Pause Overlays on Hover */}
                    <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px] opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-center justify-center z-25">
                      {isPlaying ? (
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

                  {/* Text below the card */}
                  <div className="mt-3.5 space-y-0.5 px-1 min-w-0">
                    <h3 
                      onClick={() => {
                        if (!isPro) {
                          setIsUpgradeModalOpen(true);
                        } else {
                          navigator.clipboard.writeText(track.tags);
                          alert("Pro Showcase 스타일 프롬프트가 복사되었습니다!");
                        }
                      }}
                      className="text-[13.5px] font-bold text-zinc-100 hover:text-cyan-400 transition-colors cursor-pointer truncate tracking-tight"
                    >
                      Best of {track.genre}
                    </h3>
                    <p className="text-[10.5px] text-zinc-500 font-medium truncate tracking-tight">
                      {track.countInfo}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Left Navigation Chevron Overlay */}
          <button 
            onClick={() => scrollShowcase('left')}
            className="absolute left-0 top-[50%] -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-zinc-950/80 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all hover:scale-105 opacity-80 hover:opacity-100 shadow-2xl"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Right Navigation Chevron Overlay */}
          <button 
            onClick={() => scrollShowcase('right')}
            className="absolute right-0 top-[50%] -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-zinc-950/80 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all hover:scale-105 opacity-80 hover:opacity-100 shadow-2xl"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>



      {/* Genre Filter & Sub-tabs */}
      <div className="mb-6 bg-zinc-950/40 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Guitar className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-extrabold text-zinc-200 uppercase tracking-wider">장르 카테고리</span>
          </div>

          {/* 2 Genre Sub-tabs: TOP 100 / TOP 200 */}
          <div className="flex items-center gap-1.5 p-1 bg-zinc-900/90 border border-zinc-800 rounded-xl shrink-0">
            <button
              onClick={() => {
                setActiveGenreTab('top100');
                setActiveGenre('All');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                activeGenreTab === 'top100'
                  ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-lg shadow-fuchsia-600/30'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}
            >
              🔥 TOP 100
            </button>
            <button
              onClick={() => {
                setActiveGenreTab('top200');
                setActiveGenre('All');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                activeGenreTab === 'top200'
                  ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-lg shadow-fuchsia-600/30'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}
            >
              🌐 TOP 200
            </button>
          </div>
        </div>

        {/* Genre Pill Buttons (Height increased to 150%: 210px) */}
        <div className="flex flex-wrap gap-2 max-h-[210px] overflow-y-auto pr-1 custom-scrollbar">
          {displayedGenres.map((g) => {
            const count =
              g === "All"
                ? (activeGenreTab === 'top100' ? 100 : 201)
                : combined.filter((s: any) => (s.genre || "").toLowerCase() === g.toLowerCase()).length;
            return (
              <button
                key={g}
                onClick={() => setActiveGenre(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border flex items-center gap-1.5 ${
                  activeGenre === g
                    ? "bg-violet-500/25 border-violet-500/70 text-violet-200 font-bold shadow-[0_0_12px_rgba(139,92,246,0.3)]"
                    : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
                }`}
              >
                <span>{g}</span>
                <span className="text-[10px] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mood Filter (최대 15개 감성 무드) */}
      <div className="mb-8 bg-zinc-950/30 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <Waves className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-extrabold text-zinc-200 uppercase tracking-wider">무드 필터</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              onClick={() => setActiveMood(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                activeMood === m
                  ? "bg-purple-500/25 border-purple-500/70 text-purple-200 font-bold shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* 🎨 스타일 프리셋 (Style Presets) 단일 통합 카드 섹션 */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-fuchsia-400" />
            <div>
              <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                🎨 스타일 프리셋 (Style Presets)
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                멜로디오 AI 멀티 엔진 및 전문가 집단이 엄선한 최상급 사운드 템플릿 레시피
              </p>
            </div>
            <span className="ml-2 text-xs px-3 py-1 rounded-full bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 font-mono font-bold shrink-0">
              {sortedPresets.length}개 레시피
            </span>
          </div>

          {/* 우측 상단 액션 버튼 그룹 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* ⭐ CUSTOM 프리셋 토글 */}
            <button
              onClick={() => setShowCustomPresetsOnly(!showCustomPresetsOnly)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-2 border shadow-sm ${
                showCustomPresetsOnly
                  ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 border-fuchsia-400 text-white shadow-lg shadow-fuchsia-600/30 scale-105'
                  : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>⭐ CUSTOM 프리셋</span>
              <span className="px-1.5 py-0.5 rounded-md bg-black/40 text-[10px] font-mono font-bold">
                {customPresets.length}
              </span>
            </button>

            {/* ✨ + 나만의 프리셋 만들기 버튼 */}
            <button
              onClick={() => setIsCreatePresetOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400 text-white shadow-lg shadow-fuchsia-600/25 hover:shadow-fuchsia-600/40 transition-all flex items-center gap-1.5 active:scale-95 border border-fuchsia-400/30 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>+ 나만의 프리셋 만들기</span>
            </button>
          </div>
        </div>

        {/* 🔍 검색창 & 정렬/필터 바 (제목 직하단 배치) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 bg-zinc-950/60 rounded-xl border border-white/5 backdrop-blur-sm">
          {/* 검색 입력창 */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="스타일명, 레시피 태그, 가사 키워드 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs outline-none focus:border-fuchsia-500/50 transition-colors placeholder:text-zinc-500 font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 정렬 드롭다운 & 보관함 토글 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 정렬 선택 */}
            <div className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-zinc-300 font-semibold">
              <Zap className="w-3.5 h-3.5 text-fuchsia-400" />
              <select
                value={sortByPreset}
                onChange={(e: any) => setSortByPreset(e.target.value)}
                className="bg-transparent text-white outline-none cursor-pointer font-bold text-xs pr-1"
              >
                <option value="popular" className="bg-zinc-900 text-white">🔥 인기순 (Popular)</option>
                <option value="recommended" className="bg-zinc-900 text-white">✨ 추천순 (Recommended)</option>
                <option value="latest" className="bg-zinc-900 text-white">🆕 최신순 (Latest)</option>
                <option value="oldest" className="bg-zinc-900 text-white">⏳ 오래된순 (Oldest)</option>
                <option value="mostLiked" className="bg-zinc-900 text-white">❤️ 좋아요순 (Most Liked)</option>
              </select>
            </div>

            {/* 내가 저장한 스타일 토글 */}
            <button
              onClick={() => setShowSavedOnly(!showSavedOnly)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                showSavedOnly
                  ? "bg-rose-950/60 border-rose-500/60 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]"
                  : "bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              }`}
              title={showSavedOnly ? "전체 보기" : "내가 저장한 스타일만 보기"}
            >
              <Heart className={`w-3.5 h-3.5 ${showSavedOnly ? "fill-current text-rose-400" : "text-zinc-400"}`} />
              <span>보관함 ({savedIds.size})</span>
            </button>
          </div>
        </div>

        {/* 3x7 Grid (21개 노출) */}
        {paginatedPresets.length === 0 ? (
          <div className="text-center py-24 text-zinc-600 bg-zinc-950/40 rounded-2xl border border-white/5">
            <Music2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm font-medium">선택하신 조건에 맞는 스타일 프리셋이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedPresets.map((style: any, idx: number) => renderStyleCard(style, (presetPage - 1) * PRESET_PAGE_SIZE + idx))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-6">
            <button
              onClick={() => setPresetPage(p => Math.max(1, p - 1))}
              disabled={presetPage === 1}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => (
              <button
                key={pg}
                onClick={() => setPresetPage(pg)}
                className={`w-9 h-9 rounded-xl text-xs font-bold transition-all border font-mono ${
                  presetPage === pg
                    ? 'bg-fuchsia-600 border-fuchsia-400 text-white shadow-lg shadow-fuchsia-600/30'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {pg}
              </button>
            ))}

            <button
              onClick={() => setPresetPage(p => Math.min(totalPages, p + 1))}
              disabled={presetPage === totalPages}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── 🎧 스타일 라이브러리 공개 음원 섹션 ── */}
      <div className="mt-16 pt-10 border-t border-white/10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <Music2 className="w-5 h-5 text-cyan-400" />
              <span>🎧 스타일 라이브러리 공개 음원</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              멜로디오 프로듀서들이 스타일 라이브러리로 음원을 생성한 후 공식 트랙 갤러리에 공개한 음원 리스트
            </p>
          </div>
        </div>

        <PublicTrackGrid
          sourceMenu="style-library"
          itemsPerPage={16}
          useExternalPlayer={true}
          playingTrackId={playingId ? String(playingId) : null}
          isTrackPlaying={playingId !== null}
          onPlayTrack={(track: any) => handleTogglePlay(track.id, track.audio_url || track.audioUrl || '', track)}
          onPauseTrack={() => {
            audioRef.current?.pause();
            setPlayingId(null);
          }}
        />
      </div>

      {/* ── Fixed Bottom Audio Player Bar ── */}
      <AnimatePresence>
        {playingId && currentPlayingTrack && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 w-full z-[100] bg-[#0c0d12]/95 border-t border-white/10 backdrop-blur-2xl px-4 md:px-8 py-3 flex items-center justify-between shadow-[0_-10px_30px_rgba(0,0,0,0.8)]"
          >
            {/* Track Info (Left) */}
            {(() => {
              const info = getSampleSongDetails(currentPlayingTrack);
              if (!info) return null;
              return (
                <div className="flex items-center gap-3 w-1/4 min-w-0">
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-zinc-900 border border-white/10 shadow-md">
                    <img 
                      src={info.cover_art_url} 
                      alt={info.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png";
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 
                      onClick={() => setActiveSampleSongDetail(info)}
                      className="text-sm font-bold text-white hover:text-fuchsia-400 hover:underline transition-colors cursor-pointer truncate leading-snug"
                      title="곡 상세 정보 보기"
                    >
                      {info.title}
                    </h4>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {(currentPlayingTrack as any).genre || (currentPlayingTrack as any).name || (currentPlayingTrack as any).title || "Style"}
                      {` • `}
                      {(currentPlayingTrack as any).vocal || (currentPlayingTrack as any).userName || "No Vocal"}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Playback Controls (Center) */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-xl">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsShuffle(!isShuffle)}
                  className={`transition-colors ${isShuffle ? "text-fuchsia-400" : "text-zinc-500 hover:text-zinc-300"}`}
                  title="셔플"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                <button 
                  onClick={handleSkipBack}
                  className="text-zinc-400 hover:text-white transition-colors"
                  title="이전 곡"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                <button 
                  onClick={() => handleTogglePlay(currentPlayingTrack.id, currentPlayingTrack.audioUrl || "https://file.302.ai/gpt/imgs/20260721/bc3a2a5f8bccbbd366d2cebbd99cd130.mp3")}
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95"
                  title={audioRef.current && !audioRef.current.paused ? "일시정지" : "재생"}
                >
                  {audioRef.current && !audioRef.current.paused ? (
                    <Pause className="w-4 h-4 fill-black text-black" />
                  ) : (
                    <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                  )}
                </button>
                <button 
                  onClick={() => playNext(false)}
                  className="text-zinc-400 hover:text-white transition-colors"
                  title="다음 곡"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
                <button 
                  onClick={() => setIsRepeat(!isRepeat)}
                  className={`transition-colors ${isRepeat ? "text-fuchsia-400" : "text-zinc-500 hover:text-zinc-300"}`}
                  title="반복"
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
                  max={duration || 100}
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
                    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${(duration > 0 ? (currentTime / duration) : 0) * 100}%, rgba(255,255,255,0.15) ${(duration > 0 ? (currentTime / duration) : 0) * 100}%)`,
                  }}
                />
                <span className="text-[10px] text-zinc-400 font-mono w-9">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Extra Tools (Right) - Like, Dislike, Volume */}
            <div className="flex items-center justify-end gap-3 w-1/4">
              <button
                onClick={() => {
                  const songId = currentPlayingTrack.id;
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
                  likedSongs.has(currentPlayingTrack.id) ? "text-emerald-400 bg-emerald-400/10" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="좋아요"
              >
                <ThumbsUp className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={() => {
                  const songId = currentPlayingTrack.id;
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
                  dislikedSongs.has(currentPlayingTrack.id) ? "text-red-400 bg-red-400/10" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="싫어요"
              >
                <ThumbsDown className="w-4.5 h-4.5" />
              </button>
              
              {/* Copy Song Link Button */}
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}/vault/share-${currentPlayingTrack.id}`;
                  navigator.clipboard.writeText(shareUrl);
                  setCopiedLinkTrackId(currentPlayingTrack.id.toString());
                  setTimeout(() => setCopiedLinkTrackId(null), 2000);
                }}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Copy Song Link"
              >
                {copiedLinkTrackId === currentPlayingTrack.id.toString() ? (
                  <Check className="w-4.5 h-4.5 text-emerald-400" />
                ) : (
                  <Link className="w-4.5 h-4.5" />
                )}
              </button>

              {/* Speaker & Volume Slider */}
              <div className="flex items-center gap-2 group/volume ml-2">
                <button
                  onClick={() => {
                    setVolume(prev => prev === 0 ? 0.8 : 0);
                  }}
                  className="text-zinc-400 hover:text-white p-1.5 transition-colors"
                  title={volume === 0 ? "음소거 해제" : "음소거"}
                >
                  {volume === 0 ? <VolumeX className="w-4 h-4 text-zinc-500" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 h-1 rounded-full bg-zinc-800 appearance-none cursor-pointer accent-white"
                  style={{
                    accentColor: '#ffffff'
                  }}
                />
              </div>

              {/* Close Player Button */}
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                  }
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

      {/* ── Detailed Style Information Popover ── */}
      <AnimatePresence>
        {selectedStyle && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div 
              className="w-full max-w-[740px] bg-zinc-950 border border-white/10 rounded-2xl p-7 shadow-2xl relative max-h-[90vh] overflow-y-auto scrollbar-thin"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button 
                onClick={() => setSelectedStyle(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Music2 className="w-5 h-5 text-fuchsia-400" />
                    <span>{selectedStyle.name}</span>
                  </h3>
                  <div className="flex items-center gap-2.5 mt-2 text-xs text-zinc-400">
                    <span className="font-semibold text-zinc-300 uppercase tracking-wider">{selectedStyle.genre}</span>
                    <span>•</span>
                    <span>{selectedStyle.vocal || 'No Vocal'}</span>
                    <span>•</span>
                    <span>{selectedStyle.bpm} BPM</span>
                  </div>
                </div>

                {/* Style Description */}
                {selectedStyle.desc && (
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                    <h5 className="text-[11px] text-zinc-500 font-mono uppercase font-bold tracking-wider mb-1.5">Style Description</h5>
                    <p className="text-sm text-zinc-300 leading-relaxed font-sans">{selectedStyle.desc}</p>
                  </div>
                )}

                {/* Style Prompt Tags Box */}
                <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase font-bold tracking-wider">Style Prompt Tags</span>
                    <button
                      onClick={() => handleCopy(selectedStyle)}
                      className="flex items-center gap-1 text-[11px] text-fuchsia-400 hover:text-fuchsia-300 font-bold"
                    >
                      {copiedId === selectedStyle.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span>복사 완료</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>태그 복사</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[12.5px] text-zinc-300 font-mono leading-relaxed break-words">{getEnrichedTags(selectedStyle)}</p>
                </div>

                {/* Demo Sound Player */}
                <div className="bg-zinc-900/20 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleTogglePlay(selectedStyle.id, selectedStyle.audioUrl || "https://file.302.ai/gpt/imgs/20260721/a98e47c8e72532ec9bedf58c7706ec0b.mp3")}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        playingId === selectedStyle.id ? "bg-red-500/20 text-red-400" : "bg-white/5 text-white hover:bg-white/10"
                      }`}
                    >
                      {playingId === selectedStyle.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </button>
                    <div>
                      <div className="text-xs font-bold text-white">데모 음원 재생</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">이 프리셋의 질감과 믹싱 밸런스를 들어보세요.</div>
                    </div>
                  </div>
                  {playingId === selectedStyle.id && (
                    <span className="text-[10px] text-zinc-400 font-mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
                  )}
                </div>

                {/* Lyrics Guide Preview */}
                {selectedStyle.lyrics && (
                  <div>
                    <span className="text-[10px] text-zinc-500 font-mono uppercase font-bold tracking-wider">Lyrics Guide</span>
                    <div className="bg-black/50 border border-white/5 rounded-xl p-4 mt-2 max-h-40 overflow-y-auto scrollbar-thin text-[11px] text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
                      {selectedStyle.lyrics}
                    </div>
                  </div>
                )}

                {/* Create Music Button */}
                <button
                  onClick={() => {
                    setDrawerPreset(selectedStyle);
                    setIsGenerationDrawerOpen(true);
                    setSelectedStyle(null);
                  }}
                  className="w-full mt-6 py-3 bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white text-sm font-semibold rounded-xl hover:shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>이 스타일로 곡 생성하기</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
      
      {/* ─── 샘플곡 상세정보 모달 (대시보드와 동일한 팝업) ─── */}
      <AnimatePresence>
        {activeSampleSongDetail && (() => {
          let meta: Record<string, any> = {};
          try {
            meta = JSON.parse(activeSampleSongDetail.license_hash || '{}');
          } catch (e) {
            console.error('Failed to parse sample track metadata:', e);
          }

          return (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" 
              onClick={() => setActiveSampleSongDetail(null)}
            >
              <div 
                className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4 flex flex-col max-h-[85vh]" 
                onClick={(e) => e.stopPropagation()}
              >
                {/* 헤더 */}
                <div className="flex items-center justify-between flex-shrink-0">
                  <h3 className="text-white text-base font-bold truncate flex-1 mr-4">
                    🎵 {activeSampleSongDetail.title}
                  </h3>
                  <button 
                    onClick={() => setActiveSampleSongDetail(null)} 
                    className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 스크롤 본문 */}
                <div className="overflow-y-auto flex-1 pr-1 space-y-4 max-h-[60vh] scrollbar-thin">
                  {/* 상태, ID, 날짜 */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded font-mono border text-emerald-400 bg-emerald-400/10 border-emerald-400/20">
                      READY
                    </span>
                    <span className="text-zinc-500 font-mono">{activeSampleSongDetail.id}</span>
                    <span className="text-zinc-600">{activeSampleSongDetail.created_at}</span>
                  </div>

                  {/* 앨범 커버 */}
                  <div className="flex justify-center flex-shrink-0 py-2">
                    <div className="w-48 h-48 rounded-xl overflow-hidden border border-white/10 shadow-lg relative bg-black/40">
                      <img 
                        src={activeSampleSongDetail.cover_art_url} 
                        alt={activeSampleSongDetail.title} 
                        className="w-full h-full object-cover" 
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
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-zinc-850 text-zinc-300 border border-zinc-700/50">
                          #{tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 메타데이터 */}
                  <div className="space-y-2">
                    {activeSampleSongDetail.audio_url && (
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-1">Audio Source</div>
                        <div className="text-zinc-400 text-xs font-mono break-all">{activeSampleSongDetail.audio_url}</div>
                      </div>
                    )}

                    {meta.stylePrompt && (
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 relative group/card">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-fuchsia-400 text-[10px] font-bold uppercase tracking-wider">Style Prompt</div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(meta.stylePrompt);
                              alert('Style Prompt가 복사되었습니다.');
                            }}
                            className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-all"
                            title="복사"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-zinc-300 text-xs whitespace-pre-wrap leading-relaxed">{meta.stylePrompt}</div>
                      </div>
                    )}

                    {meta.lyricsPrompt && (
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 relative group/card">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-cyan-400 text-[10px] font-bold uppercase tracking-wider">Lyrics</div>
                        </div>
                        <div className="text-zinc-300 text-xs whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto scrollbar-thin">{meta.lyricsPrompt}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 닫기 버튼 */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setActiveSampleSongDetail(null)}
                    className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
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

      {/* ─── 우측 슬라이드 오버 패널 (음원 생성 Drawer) ─── */}
      <AnimatePresence>
        {isGenerationDrawerOpen && drawerPreset && (() => {
          const mappedPreset = {
            id: String(drawerPreset.id),
            emoji: drawerPreset.emoji || '🪄',
            name: drawerPreset.name || 'Custom Style',
            desc: drawerPreset.desc || '',
            gradient: drawerPreset.gradient || 'linear-gradient(135deg, #a855f7, #ec4899)',
            customPrompt: drawerPreset.customPrompt || drawerPreset.tags || drawerPreset.prompt || '',
            selections: drawerPreset.selections || {},
            excludePrompt: drawerPreset.excludePrompt || '',
            lyricsTemplate: drawerPreset.lyricsTemplate || drawerPreset.lyrics || undefined
          };

          return (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsGenerationDrawerOpen(false)}
                className="fixed inset-0 bg-black/10 z-[90]"
              />
              {/* Drawer Content */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="fixed inset-y-0 right-0 w-full max-w-[500px] bg-zinc-950 border-l border-white/10 z-[100] flex flex-col shadow-2xl h-full"
              >
                {/* Header */}
                <div className="p-5 border-b border-white/5 flex items-center justify-between flex-shrink-0 bg-zinc-900/40">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-md">
                      <Sparkles className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h3 className="text-white text-sm font-bold font-sans">음원 제작실 (Studio)</h3>
                      <p className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-[340px]">
                        컨셉: {drawerPreset.name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsGenerationDrawerOpen(false)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
                  <PromptBuilder
                    isDrawerMode={true}
                    initialPreset={mappedPreset}
                    onOpenProPaywall={() => {
                      setIsUpgradeModalOpen(true);
                    }}
                    sourceMenu="style-library"
                  />
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* 커스텀 프리셋 생성 모달 */}
      <CreatePresetModal
        isOpen={isCreatePresetOpen || !!editingPreset}
        onClose={() => {
          setIsCreatePresetOpen(false)
          setEditingPreset(null)
        }}
        onSave={handleSaveCustomPreset}
        currentStylePrompt=""
        editingPreset={editingPreset}
      />
    </div>
  );
}
