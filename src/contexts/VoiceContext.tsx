"use client";

import { studioVoiceFields as buildStudioVoiceFields } from "@/lib/voice/studio-selection";
import { INITIAL_SYSTEM_VOICES } from "@/data/vocalStyles";
import { discoveryVoiceItem } from "@/data/discoveryVoices";
import { restoreDesignAttributes } from "@/lib/voice/restore-design-attributes";
import type { VoiceDnaRecord } from "@/lib/voice-dna-scrubber";
import React, { createContext, useCallback, useContext, useState, useEffect } from "react";

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
  sourceType: "default" | "recorded" | "uploaded" | "dna_designed" | "extracted" | "discovered";
  stylePrompt: string;
  isFavorite?: boolean;
  createdAt: string;
  avatarGradient?: string;
  voice_model_id?: string;
  /** Melodio registration ID. Provider Voice IDs remain server-side. */
  customVoiceId?: string;
  /** Public catalog ID. Provider persona IDs remain server-side. */
  officialVoiceId?: string;
  /** Independent discovery catalog reference, resolved by the server. */
  discoveryVoiceId?: string;
  previewStatus?: "pending" | "ready";
  reuseStatus?: "pending" | "ready";
  previewStartSeconds?: number;
  sampleDurationSeconds?: number;
  /** Saved generated style persona; provider identity remains server-side. */
  designedVoiceId?: string;
  sampleGenerationId?: string;
  sampleVersion?: 'A' | 'B';
  reviewStatus?: "selected" | "trial";
  shortDescription?: string;
  is100PercentSync?: boolean;
  /** Full editable recipe, kept separate from audio samples and singer identities. */
  designAttributes?: VoiceDnaRecord;
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


export type StudioVocalGender = "mixed" | "female" | "male" | "duet";

interface VoiceContextProps {
  refreshVoices: () => void;
  studioGender: StudioVocalGender;
  setStudioGender: (gender: StudioVocalGender) => void;
  studioVoiceFields: Record<string, unknown>;
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
  saveDiscoveryVoice: (id: string) => VoiceItem | null;
  syncDesignedVoice: (voice: VoiceItem) => void;
  syncRegisteredVoice: (voice: Omit<VoiceItem, "id" | "createdAt"> & { customVoiceId: string }) => void;
  updateVoice: (id: string, updates: Partial<VoiceItem>) => void;
  deleteVoice: (id: string) => void;
  toggleFavorite: (id: string) => void;
}

const VoiceContext = createContext<VoiceContextProps | undefined>(undefined);

function selectableVoice(voice: VoiceItem): VoiceItem | null {
  const canonical = discoveryVoiceItem(voice.discoveryVoiceId || voice.id);
  if (!voice.discoveryVoiceId && !canonical) return voice;
  if (!canonical || canonical.previewStatus !== 'ready' || canonical.reuseStatus !== 'ready' || !canonical.audioUrl) return null;
  return { ...canonical, isFavorite: voice.isFavorite };
}

function registeredVoiceItem(value: unknown): VoiceItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.status !== "ready" || typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id)
    || typeof row.name !== "string" || (row.gender !== "female" && row.gender !== "male")) return null;
  const style = typeof row.style === "string" ? row.style : "";
  return {
    id: `custom-voice-${row.id}`,
    customVoiceId: row.id,
    name: row.name,
    desc: typeof row.description === "string" ? row.description : "Suno V6 등록 목소리",
    gender: row.gender,
    language: typeof row.language === "string" ? row.language : "ko",
    category: "Registered Voice",
    tags: ["Suno Voice", style || "Custom"],
    sourceType: row.sourceType === "recorded" ? "recorded" : "uploaded",
    stylePrompt: style || `${row.gender} vocals, preserve the registered singer identity and natural expression`,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
    isFavorite: false,
    audioUrl: "",
    audioUrlB: undefined,
    voice_model_id: undefined,
    is100PercentSync: false,
    avatarGradient: row.gender === "female"
      ? "linear-gradient(135deg, #fb7185, #a855f7)"
      : "linear-gradient(135deg, #22d3ee, #6366f1)",
  };
}

// Helper to persist only custom voice-style metadata safely.
// Module scope keeps the localStorage migration stable across provider renders.
function persistCustomVoices(allVoices: VoiceItem[]) {
  try {
    const customOnly = (allVoices || [])
      .filter((v) => v && typeof v === "object" && v.sourceType !== "default")
      .map((v) => ({
        ...v,
        // Provider Voice ID와 원본 음성 URL은 브라우저 저장소에 남기지 않는다.
        audioUrl: "",
        audioUrlB: undefined,
        voice_model_id: undefined,
        is100PercentSync: false,
        designAttributes: restoreDesignAttributes(v.designAttributes),
        tags: Array.isArray(v.tags) ? v.tags : [],
        stylePrompt: v.stylePrompt || "",
        name: v.name || "보컬 음색 스타일",
        desc: v.desc || "보컬 음색 스타일",
        gender: v.gender || "female",
      }));
    localStorage.setItem("melodio_user_voices", JSON.stringify(customOnly));
    localStorage.setItem("melodio_voice_favorites", JSON.stringify(allVoices.filter(v => v.isFavorite).map(v => v.id)));
  } catch (err) {
    console.warn("Failed to persist user voices to localStorage", err);
  }
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [voiceRefresh, setVoiceRefresh] = useState(0);
  const refreshVoices = useCallback(() => setVoiceRefresh(n => n + 1), []);
  const [studioGender, setStudioGenderState] = useState<StudioVocalGender>("mixed");
  const setStudioGender = useCallback((gender: StudioVocalGender) => {
    setStudioGenderState(gender);
    try { localStorage.setItem('melodio_studio_vocal_gender', gender); } catch {}
  }, []);
  const [voices, setVoices] = useState<VoiceItem[]>(INITIAL_SYSTEM_VOICES);
  const [activeVoice, setActiveVoiceState] = useState<VoiceItem | null>(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // 로컬스토리지 복원
  useEffect(() => {
    try {
      const savedGender = localStorage.getItem('melodio_studio_vocal_gender');
      if (savedGender && ['female', 'male', 'duet', 'mixed'].includes(savedGender)) setStudioGenderState(savedGender as StudioVocalGender);
      const favoriteIds = JSON.parse(localStorage.getItem("melodio_voice_favorites") || "null");
      if (Array.isArray(favoriteIds)) setVoices(current => current.map(v => ({ ...v, isFavorite: favoriteIds.includes(v.id) })));
      const saved = localStorage.getItem("melodio_user_voices");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const customOnly: VoiceItem[] = parsed
            .filter((v: any) => v && typeof v === "object" && v.sourceType !== "default")
            .map((v: any): VoiceItem | null => {
              if (typeof v.discoveryVoiceId === "string") {
                const canonical = discoveryVoiceItem(v.discoveryVoiceId);
                if (canonical) return { ...canonical, isFavorite: !!v.isFavorite };
                return null;
              }
              const gender = v.gender === "male" || v.gender === "female" || v.gender === "duet" ? v.gender : "female";
              const prompt = typeof v.stylePrompt === "string" ? v.stylePrompt : "";
              const tags = Array.isArray(v.tags) ? v.tags : ["Custom", gender];
              const genderLabel = gender === "female" ? "여성" : gender === "male" ? "남성" : "듀엣";
              
              let stylePrompt = prompt;
              if (!prompt.trim()) {
                stylePrompt = gender === "female"
                  ? "female vocals, crystalline soprano highs, pure bell-like vocal clarity, delicate emotional high notes, warm acoustic resonance, intimate close-mic delivery, subtle elegant vibrato, dry up-front vocal-centric mix"
                  : "male vocals, warm velvety chest-dominant baritone, sweet acoustic resonance, smooth breathy vocal texture, heartfelt intimate delivery, rich low-end harmonics, crystal clear vocal-centric mastering";
              }

              return {
                id: v.id || `voice-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                name: v.name || `${genderLabel} 보컬 음색 스타일`,
                desc: v.desc || "보컬 음색 스타일",
                gender,
                language: v.language || "Korean",
                category: v.category || "Singing/Music",
                tags,
                audioUrl: "",
                audioUrlB: undefined,
                sourceType: v.sourceType || "uploaded",
                stylePrompt,
                isFavorite: !!v.isFavorite,
                createdAt: v.createdAt || new Date().toISOString(),
                avatarGradient: v.avatarGradient || (gender === "female" ? "linear-gradient(135deg, #ec4899, #8b5cf6)" : "linear-gradient(135deg, #06b6d4, #3b82f6)"),
                voice_model_id: undefined,
                customVoiceId: typeof v.customVoiceId === "string" && /^[0-9a-f-]{36}$/i.test(v.customVoiceId)
                  ? v.customVoiceId
                  : undefined,
                designedVoiceId: typeof v.designedVoiceId === "string" && /^[0-9a-f-]{36}$/i.test(v.designedVoiceId) ? v.designedVoiceId : undefined,
                sampleGenerationId: typeof v.sampleGenerationId === "string" && /^[0-9a-f-]{36}$/i.test(v.sampleGenerationId) ? v.sampleGenerationId : undefined,
                sampleVersion: v.sampleVersion === 'B' ? 'B' : 'A',
                sampleDurationSeconds: v.designedVoiceId ? 30 : undefined,
                previewStartSeconds: v.designedVoiceId ? 0 : undefined,
                previewStatus: v.designedVoiceId ? 'ready' : undefined,
                is100PercentSync: false,
                physicalLayers: v.physicalLayers,
                designAttributes: restoreDesignAttributes(v.designAttributes),
              };
            }).filter((v: VoiceItem | null): v is VoiceItem => v !== null);
          setVoices([...INITIAL_SYSTEM_VOICES, ...customOnly].map(v => ({ ...v, isFavorite: Array.isArray(favoriteIds) ? favoriteIds.includes(v.id) : v.isFavorite })));

        }
      }

      const savedActiveId = localStorage.getItem("melodio_active_voice_id");
      if (savedActiveId) {
        setTimeout(() => {
          setVoices((current) => {
            const found = current.find((v) => v && v.id === savedActiveId);
            const selected = found ? selectableVoice(found) : null;
            if (selected) {
              setActiveVoiceState(selected);
              if (!savedGender && (selected.gender === 'female' || selected.gender === 'male')) setStudioGenderState(selected.gender);
            }
            return current;
          });
        }, 100);
      }
    } catch (e) {
      console.warn("Failed to load voices from localStorage", e);
    }
  }, []);

  // Refresh once per selection-modal opening, including on another device.
  useEffect(() => {
    if (!isVoiceModalOpen && voiceRefresh === 0) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/voice/custom", { cache: "no-store", signal: controller.signal });
        // Only an authenticated successful list is authoritative for deletions.
        if (!response.ok) return;
        const data = await response.json();
        if (controller.signal.aborted || !Array.isArray(data.voices)) return;
        const registered = new Map<string, VoiceItem>();
        for (const row of data.voices) {
          const voice = registeredVoiceItem(row);
          if (voice?.customVoiceId) registered.set(voice.customVoiceId, voice);
        }
        setVoices((prev) => {
          const previous = new Map(prev.filter((voice) => voice.customVoiceId).map((voice) => [voice.customVoiceId, voice]));
          const ready = [...registered.values()].map((voice) => {
            const existing = previous.get(voice.customVoiceId);
            return existing ? { ...voice, createdAt: existing.createdAt, isFavorite: existing.isFavorite } : voice;
          });
          const updated = [...ready, ...prev.filter((voice) => !voice.customVoiceId)];
          persistCustomVoices(updated);
          return updated;
        });
        setActiveVoiceState((current) => {
          if (!current?.customVoiceId) return current;
          const refreshed = registered.get(current.customVoiceId);
          if (refreshed) return { ...refreshed, createdAt: current.createdAt, isFavorite: current.isFavorite };
          try { localStorage.removeItem("melodio_active_voice_id"); } catch {}
          return null;
        });
      } catch {
        // Keep local choices when signed out, offline, or the request is cancelled.
      }
    })();
    return () => controller.abort();
  }, [isVoiceModalOpen, voiceRefresh]);

  useEffect(() => {
    if (!isVoiceModalOpen && voiceRefresh === 0) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/voice/designed', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (!Array.isArray(data.voices)) return;
        const ready = await Promise.all(data.voices.map(async (row: VoiceItem & { status?: string }): Promise<VoiceItem | null> => {
          if (row.status !== 'ready' || !row.designedVoiceId || !/^[0-9a-f-]{36}$/i.test(row.designedVoiceId) || !row.sampleGenerationId) return null;
          let audioUrl = '';
          try {
            const sampleResponse = await fetch(`/api/generations?id=${encodeURIComponent(row.sampleGenerationId)}`, { cache: 'no-store', signal: controller.signal });
            if (sampleResponse.ok) {
              const sample = await sampleResponse.json();
              audioUrl = typeof sample.generation?.audio_url === 'string' ? sample.generation.audio_url : '';
            }
          } catch { /* A saved persona remains usable while its preview is unavailable. */ }
          return { ...row, sourceType: 'dna_designed', audioUrl, voice_model_id: undefined,
            is100PercentSync: false, previewStartSeconds: 0, sampleDurationSeconds: 30, previewStatus: 'ready' };
        }));
        if (controller.signal.aborted) return;
        const incoming = ready.filter((row): row is VoiceItem => row !== null);
        setVoices(previous => {
          const updated = [...incoming.map(row => ({ ...row, isFavorite: previous.find(item => item.designedVoiceId === row.designedVoiceId)?.isFavorite ?? true })),
            ...previous.filter(row => !row.designedVoiceId)];
          persistCustomVoices(updated);
          return updated;
        });
        setActiveVoiceState(previous => previous?.designedVoiceId
          ? incoming.find(row => row.designedVoiceId === previous.designedVoiceId) || null : previous);
      } catch { /* Keep saved choices during a transient connection error. */ }
    })();
    return () => controller.abort();
  }, [isVoiceModalOpen, voiceRefresh]);

  const openVoiceModal = () => setIsVoiceModalOpen(true);
  const closeVoiceModal = () => setIsVoiceModalOpen(false);
  const openCreateModal = () => {
    setIsCreateModalOpen(true);
  };
  const closeCreateModal = () => setIsCreateModalOpen(false);

  const setActiveVoice = (voice: VoiceItem | null) => {
    const selected = voice ? selectableVoice(voice) : null;
    if (voice && !selected) return;
    setActiveVoiceState(selected);
    if (selected) {
      try {
        localStorage.setItem("melodio_active_voice_id", selected.id);
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
      // 원본 음성과 provider ID는 컨텍스트에 유입시키지 않는다.
      audioUrl: "",
      audioUrlB: undefined,
      voice_model_id: undefined,
      is100PercentSync: false,
      id: `voice-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
      gender,
      name: voiceData.name || "보컬 음색 스타일",
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

  const saveDiscoveryVoice = (id: string): VoiceItem | null => {
    const canonical = discoveryVoiceItem(id);
    if (!canonical) return null;
    const saved = { ...canonical, isFavorite: true };
    setVoices(previous => {
      const updated = previous.some(voice => voice.discoveryVoiceId === canonical.discoveryVoiceId)
        ? previous.map(voice => voice.discoveryVoiceId === canonical.discoveryVoiceId ? saved : voice)
        : [saved, ...previous];
      persistCustomVoices(updated);
      return updated;
    });
    return saved;
  };

  const syncDesignedVoice = (voice: VoiceItem) => {
    if (!voice.designedVoiceId || !/^[0-9a-f-]{36}$/i.test(voice.designedVoiceId)) return;
    const saved: VoiceItem = { ...voice, id: `designed-voice-${voice.designedVoiceId}`, sourceType: 'dna_designed',
      audioUrl: '', audioUrlB: undefined, voice_model_id: undefined, is100PercentSync: false,
      isFavorite: true, sampleDurationSeconds: 30, previewStartSeconds: 0, previewStatus: 'ready' };
    setVoices(previous => {
      const updated = [saved, ...previous.filter(item => item.designedVoiceId !== saved.designedVoiceId)];
      persistCustomVoices(updated);
      return updated;
    });
    setActiveVoice(saved);
    if (saved.gender === 'female' || saved.gender === 'male') setStudioGender(saved.gender);
    setVoiceRefresh(value => value + 1);
  };

  const syncRegisteredVoice = useCallback((voiceData: Omit<VoiceItem, "id" | "createdAt"> & { customVoiceId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(voiceData.customVoiceId)) return;
    const registered: VoiceItem = {
      ...voiceData,
      id: `custom-voice-${voiceData.customVoiceId}`,
      createdAt: new Date().toISOString(),
      audioUrl: "",
      audioUrlB: undefined,
      voice_model_id: undefined,
      is100PercentSync: false,
    };
    setVoices((prev) => {
      const exists = prev.some((item) => item.customVoiceId === voiceData.customVoiceId);
      const updated = exists
        ? prev.map((item) => item.customVoiceId === voiceData.customVoiceId
          ? { ...item, ...registered, createdAt: item.createdAt, isFavorite: item.isFavorite }
          : item)
        : [registered, ...prev];
      persistCustomVoices(updated);
      return updated;
    });
  }, []);

  const updateVoice = (id: string, updates: Partial<VoiceItem>) => {
    const safeUpdates: Partial<VoiceItem> = {
      ...updates,
      audioUrl: "",
      audioUrlB: undefined,
      voice_model_id: undefined,
      is100PercentSync: false,
    };
    setVoices((prev) => {
      const updated = prev.map((v) => (v && v.id === id ? { ...v, ...safeUpdates } : v));
      persistCustomVoices(updated);
      return updated;
    });
    if (activeVoice?.id === id) {
      setActiveVoiceState((prev) => (prev ? { ...prev, ...safeUpdates } : null));
    }
  };

  const deleteVoice = (id: string) => {
    const target = voices.find((voice) => voice.id === id);
    if (target?.customVoiceId) {
      void fetch('/api/voice/custom', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.customVoiceId }),
      }).then((response) => {
        if (!response.ok) console.warn('Failed to delete registered voice from server');
      }).catch(() => console.warn('Failed to delete registered voice from server'));
    }
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
        refreshVoices, studioGender, setStudioGender,
        studioVoiceFields: buildStudioVoiceFields(studioGender, activeVoice),
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
        saveDiscoveryVoice,
        syncDesignedVoice,
        syncRegisteredVoice,
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
      refreshVoices: () => {},
      studioGender: "mixed" as StudioVocalGender,
      setStudioGender: (_gender: StudioVocalGender) => {},
      studioVoiceFields: {} as Record<string, unknown>,
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
      saveDiscoveryVoice: (_id: string) => null,
      syncDesignedVoice: (_voice: VoiceItem) => {},
      syncRegisteredVoice: () => {},
      updateVoice: () => {},
      deleteVoice: () => {},
      toggleFavorite: () => {},
    };
  }
  return context;
}
