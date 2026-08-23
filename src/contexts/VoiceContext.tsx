"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface VoiceItem {
  id: string;
  name: string;
  desc?: string;
  gender: "female" | "male" | "duet";
  language?: string;
  category?: string;
  tags: string[];
  audioUrl?: string;
  audioUrlB?: string;
  sourceType: "default" | "recorded" | "uploaded" | "dna_designed" | "extracted";
  stylePrompt: string;
  isFavorite?: boolean;
  createdAt: string;
  avatarGradient?: string;
  voice_model_id?: string;
  is100PercentSync?: boolean;
  physicalLayers?: {
    pitch?: number;
    brightness?: number;
    chest?: number;
    head?: number;
    weight?: number;
    vibrato?: number;
    breathiness?: number;
    roughness?: number;
    airiness?: number;
    nasality?: number;
    strain?: number;
    warmth?: number;
    clarity?: number;
  };
}

// 초기 기본 시스템 프리셋 Voices
const INITIAL_SYSTEM_VOICES: VoiceItem[] = [
  {
    id: "voice-anna-kim",
    name: "Anna Kim",
    desc: "Tender and Warm Pop Balladeer with Airy Highs",
    gender: "female",
    language: "Korean",
    category: "Singing/Music",
    tags: ["Pop Ballad", "Warm", "Airy", "Soprano"],
    audioUrl: "/assets/voices/vd-2001.mp3",
    sourceType: "default",
    stylePrompt: "female vocals, tender and warm pop balladeer, clear crystal high notes, emotional delivery, airy breathy tone",
    isFavorite: true,
    createdAt: "2026-08-20T00:00:00Z",
    avatarGradient: "linear-gradient(135deg, #a855f7, #ec4899)",
  },
  {
    id: "voice-kaelen-soul",
    name: "Kaelen",
    desc: "Deep & Rich Soul Baritone with Husky Texture",
    gender: "male",
    language: "English",
    category: "Singing/Music",
    tags: ["R&B/Soul", "Baritone", "Smoky", "Husky"],
    audioUrl: "/assets/voices/vd-3802.mp3",
    sourceType: "default",
    stylePrompt: "male vocals, deep and rich soul baritone, smoky textured timbre, velvet chest resonance, melancholic groove",
    isFavorite: false,
    createdAt: "2026-08-20T00:00:00Z",
    avatarGradient: "linear-gradient(135deg, #3b82f6, #14b8a6)",
  },
  {
    id: "voice-moe-jpop",
    name: "Moe",
    desc: "Sweet & Bright Kawaii J-Pop Vocalist",
    gender: "female",
    language: "Japanese",
    category: "Singing/Music",
    tags: ["J-Pop", "Kawaii", "High-Pitch", "Energetic"],
    audioUrl: "/assets/voices/vd-7705.mp3",
    sourceType: "default",
    stylePrompt: "female vocals, sweet and bright kawaii anime J-Pop, energetic high-pitch, crisp clear head resonance",
    isFavorite: false,
    createdAt: "2026-08-20T00:00:00Z",
    avatarGradient: "linear-gradient(135deg, #ec4899, #f43f5e)",
  },
  {
    id: "voice-yeontaek-rock",
    name: "Yeon Taek",
    desc: "Vintage Smoky Rock Baritone with Raw Power",
    gender: "male",
    language: "Korean",
    category: "Singing/Music",
    tags: ["Rock", "Baritone", "Gravelly", "Powerful"],
    audioUrl: "/assets/voices/vd-2002.mp3",
    sourceType: "default",
    stylePrompt: "male vocals, raw powerful rock baritone, vintage gravelly distortion, aggressive chest voice",
    isFavorite: false,
    createdAt: "2026-08-20T00:00:00Z",
    avatarGradient: "linear-gradient(135deg, #f59e0b, #eab308)",
  },
  {
    id: "voice-aria-soprano",
    name: "Aria",
    desc: "Tender, Calm and Clear Soprano for Dream Pop",
    gender: "female",
    language: "English",
    category: "Singing/Music",
    tags: ["Dream Pop", "Clear", "Ethereal", "Soprano"],
    audioUrl: "/assets/voices/vd-1004.mp3",
    sourceType: "default",
    stylePrompt: "female vocals, ethereal dream pop soprano, silky smooth texture, heavenly clear reverb delivery",
    isFavorite: true,
    createdAt: "2026-08-20T00:00:00Z",
    avatarGradient: "linear-gradient(135deg, #f43f5e, #fb923c)",
  },
];

interface VoiceContextProps {
  voices: VoiceItem[];
  activeVoice: VoiceItem | null;
  favorites: VoiceItem[];
  isVoiceModalOpen: boolean;
  isCreateModalOpen: boolean;
  openVoiceModal: () => void;
  closeVoiceModal: () => void;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  setActiveVoice: (voice: VoiceItem | null) => void;
  addVoice: (voice: Omit<VoiceItem, "id" | "createdAt">) => VoiceItem;
  updateVoice: (id: string, updates: Partial<VoiceItem>) => void;
  deleteVoice: (id: string) => void;
  toggleFavorite: (id: string) => void;
}

const VoiceContext = createContext<VoiceContextProps | undefined>(undefined);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [voices, setVoices] = useState<VoiceItem[]>(INITIAL_SYSTEM_VOICES);
  const [activeVoice, setActiveVoiceState] = useState<VoiceItem | null>(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Helper to persist only custom voices safely
  const persistCustomVoices = (allVoices: VoiceItem[]) => {
    try {
      const customOnly = (allVoices || [])
        .filter((v) => v && typeof v === "object" && v.sourceType !== "default")
        .map((v) => {
          // If audioUrl is huge base64 > 300KB, remove raw data to prevent storage quota crash
          const audioUrl = v.audioUrl && v.audioUrl.startsWith("data:") && v.audioUrl.length > 300000 ? "" : v.audioUrl || "";
          return {
            ...v,
            audioUrl,
            tags: Array.isArray(v.tags) ? v.tags : [],
            stylePrompt: v.stylePrompt || "",
            name: v.name || "My Voice",
            gender: v.gender || "female",
          };
        });
      localStorage.setItem("melodio_user_voices", JSON.stringify(customOnly));
    } catch (err) {
      console.warn("Failed to persist user voices to localStorage", err);
    }
  };

  // 로컬스토리지 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem("melodio_user_voices");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const customOnly: VoiceItem[] = parsed
            .filter((v: any) => v && typeof v === "object" && v.sourceType !== "default")
            .map((v: any) => {
              const gender = v.gender === "male" || v.gender === "female" || v.gender === "duet" ? v.gender : "female";
              const prompt = typeof v.stylePrompt === "string" ? v.stylePrompt : "";
              const tags = Array.isArray(v.tags) ? v.tags : ["Custom", gender];
              
              let stylePrompt = prompt;
              if (
                !prompt ||
                prompt.includes("custom uploaded vocal profile") ||
                prompt.includes("organic recorded acoustic timbre") ||
                prompt.length < 40
              ) {
                stylePrompt = gender === "female"
                  ? "female vocals, crystalline soprano highs, pure bell-like vocal clarity, delicate emotional high notes, warm acoustic resonance, intimate close-mic delivery, subtle elegant vibrato, dry up-front vocal-centric mix"
                  : "male vocals, warm velvety chest-dominant baritone, sweet acoustic resonance, smooth breathy vocal texture, heartfelt intimate delivery, rich low-end harmonics, crystal clear vocal-centric mastering";
              }

              return {
                id: v.id || `voice-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                name: v.name || `${gender === "female" ? "Female" : "Male"} Voice`,
                desc: v.desc || "Custom Voice",
                gender,
                language: v.language || "Korean",
                category: v.category || "Singing/Music",
                tags,
                audioUrl: v.audioUrl || "",
                sourceType: v.sourceType || "uploaded",
                stylePrompt,
                isFavorite: !!v.isFavorite,
                createdAt: v.createdAt || new Date().toISOString(),
                avatarGradient: v.avatarGradient || (gender === "female" ? "linear-gradient(135deg, #ec4899, #8b5cf6)" : "linear-gradient(135deg, #06b6d4, #3b82f6)"),
                voice_model_id: v.voice_model_id || (v.name?.includes("QR.Yoon") || v.name?.includes("내 목소리") ? "qr_yoon" : undefined),
                is100PercentSync: v.is100PercentSync ?? (v.voice_model_id === "qr_yoon" || v.name?.includes("QR.Yoon")),
                physicalLayers: v.physicalLayers,
              };
            });
          setVoices([...INITIAL_SYSTEM_VOICES, ...customOnly]);
        }
      }

      const savedActiveId = localStorage.getItem("melodio_active_voice_id");
      if (savedActiveId) {
        setTimeout(() => {
          setVoices((current) => {
            const found = current.find((v) => v && v.id === savedActiveId);
            if (found) setActiveVoiceState(found);
            return current;
          });
        }, 100);
      }
    } catch (e) {
      console.warn("Failed to load voices from localStorage", e);
    }
  }, []);

  const openVoiceModal = () => setIsVoiceModalOpen(true);
  const closeVoiceModal = () => setIsVoiceModalOpen(false);
  const openCreateModal = () => {
    setIsCreateModalOpen(true);
  };
  const closeCreateModal = () => setIsCreateModalOpen(false);

  const setActiveVoice = (voice: VoiceItem | null) => {
    setActiveVoiceState(voice);
    if (voice) {
      try {
        localStorage.setItem("melodio_active_voice_id", voice.id);
      } catch {}
    } else {
      try {
        localStorage.removeItem("melodio_active_voice_id");
      } catch {}
    }
  };

  const addVoice = (voiceData: Omit<VoiceItem, "id" | "createdAt">): VoiceItem => {
    const gender = voiceData.gender || "female";
    const newVoice: VoiceItem = {
      ...voiceData,
      id: `voice-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      gender,
      name: voiceData.name || "My Custom Voice",
      tags: Array.isArray(voiceData.tags) ? voiceData.tags : ["Custom", gender],
      stylePrompt: voiceData.stylePrompt || (gender === "female" ? "female vocals, crystalline soprano highs" : "male vocals, warm baritone"),
      avatarGradient: voiceData.avatarGradient || (gender === "female" ? "linear-gradient(135deg, #ec4899, #8b5cf6)" : "linear-gradient(135deg, #06b6d4, #3b82f6)"),
    };

    setVoices((prev) => {
      const updated = [newVoice, ...prev];
      persistCustomVoices(updated);
      return updated;
    });

    setActiveVoice(newVoice);
    return newVoice;
  };

  const updateVoice = (id: string, updates: Partial<VoiceItem>) => {
    setVoices((prev) => {
      const updated = prev.map((v) => (v && v.id === id ? { ...v, ...updates } : v));
      persistCustomVoices(updated);
      return updated;
    });
    if (activeVoice?.id === id) {
      setActiveVoiceState((prev) => (prev ? { ...prev, ...updates } : null));
    }
  };

  const deleteVoice = (id: string) => {
    setVoices((prev) => {
      const updated = prev.filter((v) => v && v.id !== id);
      persistCustomVoices(updated);
      return updated;
    });
    if (activeVoice?.id === id) {
      setActiveVoice(null);
    }
  };

  const toggleFavorite = (id: string) => {
    setVoices((prev) => {
      const updated = prev.map((v) => (v && v.id === id ? { ...v, isFavorite: !v.isFavorite } : v));
      persistCustomVoices(updated);
      return updated;
    });
    if (activeVoice?.id === id) {
      setActiveVoiceState((prev) => (prev ? { ...prev, isFavorite: !prev.isFavorite } : null));
    }
  };

  const favorites = voices.filter((v) => v && v.isFavorite);

  return (
    <VoiceContext.Provider
      value={{
        voices,
        activeVoice,
        favorites,
        isVoiceModalOpen,
        isCreateModalOpen,
        openVoiceModal,
        closeVoiceModal,
        openCreateModal,
        closeCreateModal,
        setActiveVoice,
        addVoice,
        updateVoice,
        deleteVoice,
        toggleFavorite,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) {
    return {
      voices: INITIAL_SYSTEM_VOICES,
      activeVoice: null,
      favorites: INITIAL_SYSTEM_VOICES.filter(v => v.isFavorite),
      isVoiceModalOpen: false,
      isCreateModalOpen: false,
      openVoiceModal: () => {},
      closeVoiceModal: () => {},
      openCreateModal: () => {},
      closeCreateModal: () => {},
      setActiveVoice: () => {},
      addVoice: () => ({ id: 'fallback', name: 'Fallback', gender: 'female', tags: [], stylePrompt: '' } as any),
      updateVoice: () => {},
      deleteVoice: () => {},
      toggleFavorite: () => {},
    };
  }
  return context;
}
