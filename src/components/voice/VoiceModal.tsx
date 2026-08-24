"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  X, Search, Plus, Play, Pause, Star, Trash2, 
  Sparkles, Mic2, LayoutGrid, List, CheckCircle2, ChevronRight, Edit2, Check
} from "lucide-react";
import { useVoice, VoiceItem } from "@/contexts/VoiceContext";
import { motion } from "framer-motion";

export function VoiceModal() {
  const {
    voices,
    activeVoice,
    favorites,
    isVoiceModalOpen,
    closeVoiceModal,
    setActiveVoice,
    updateVoice,
    deleteVoice,
    toggleFavorite
  } = useVoice();

  const [tab, setTab] = useState<"my" | "favorites">("my");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 탭 및 검색어 필터링
  const sourceList = tab === "my" ? (voices || []) : (favorites || []);
  const filteredList = sourceList.filter((v) => {
    if (!v) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = v.name || "";
    const desc = v.desc || "";
    const tags = Array.isArray(v.tags) ? v.tags : [];
    return (
      name.toLowerCase().includes(q) ||
      desc.toLowerCase().includes(q) ||
      tags.some((t) => typeof t === "string" && t.toLowerCase().includes(q))
    );
  });

  // Unmount cleanup for the preview audio element.
  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  const handleStopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingId(null);
  };

  const handleClose = () => {
    handleStopAudio();
    closeVoiceModal();
  };

  const handlePlayToggle = (voice: VoiceItem) => {
    if (playingId === voice.id) {
      handleStopAudio();
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (voice.audioUrl) {
        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        audioRef.current.src = voice.audioUrl;
        audioRef.current.play().catch(() => {});
        audioRef.current.onended = () => setPlayingId(null);
        setPlayingId(voice.id);
      } else {
        // 데모 오디오가 없을 경우 가상 청음 피드백
        setPlayingId(voice.id);
        setTimeout(() => {
          setPlayingId((curr) => (curr === voice.id ? null : curr));
        }, 3000);
      }
    }
  };

  const handleSelectVoice = (voice: VoiceItem) => {
    handleStopAudio();
    if (activeVoice?.id === voice.id) {
      setActiveVoice(null); // 토글 해제
    } else {
      setActiveVoice(voice);
    }
    closeVoiceModal();
  };

  if (!isVoiceModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative w-full max-w-lg bg-[#141416] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">보컬 음색 스타일 선택</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="mx-6 mt-4 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-950/40 via-fuchsia-950/30 to-zinc-900/60 border border-fuchsia-500/20 flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-fuchsia-500/20 flex items-center justify-center shrink-0 text-fuchsia-300">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs text-zinc-300">
            <span className="font-semibold text-fuchsia-300">선택한 음색 특성을 음악 생성 프롬프트에 반영합니다.</span>
          </div>
        </div>

        {/* Tab & Filter Bar */}
        <div className="px-6 mt-4 flex flex-col gap-3">
          {/* Segmented Tabs */}
          <div className="grid grid-cols-2 p-1 bg-zinc-900/90 rounded-2xl border border-white/5">
            <button
              onClick={() => setTab("my")}
              className={`py-2 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                tab === "my"
                  ? "bg-zinc-800 text-white shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              전체 음색 스타일 ({voices.length})
            </button>
            <button
              onClick={() => setTab("favorites")}
              className={`py-2 text-sm font-semibold rounded-xl transition-all cursor-pointer ${
                tab === "favorites"
                  ? "bg-zinc-800 text-white shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              찜한 스타일 ({favorites.length})
            </button>
          </div>

          {/* Search and View Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
              className="p-2.5 rounded-xl bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="보기 방식 변경"
            >
              {viewMode === "list" ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
            </button>

            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="음색 스타일 이름 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500/50 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* 실제 목소리 등록은 준비 중 */}
        <div className="px-6 mt-3">
          <button
            type="button"
            disabled
            title="목소리 녹음·업로드 등록 기능은 준비 중입니다."
            className="w-full relative overflow-hidden rounded-2xl p-4 flex items-center justify-between border border-white/10 bg-zinc-900/60 text-left opacity-70 cursor-not-allowed"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-500 shrink-0">
                <Plus className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-300 text-base">목소리 등록</span>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/20">준비 중</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">녹음·업로드 기반 실제 목소리 등록은 아직 사용할 수 없습니다.</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-600" />
          </button>
        </div>

        {/* Voice List Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5 scrollbar-thin scrollbar-thumb-white/10">
          {filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-600 mb-3">
                <Mic2 className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-zinc-300">저장된 음색 스타일이 없습니다</h4>
              <p className="text-xs text-zinc-500 max-w-xs mt-1 leading-relaxed">
                추천 음색 스타일을 선택하거나 스타일 설계 화면에서 새 프리셋을 저장해 보세요.
              </p>
            </div>
          ) : (
            filteredList.map((voice) => {
              const isPlaying = playingId === voice.id;
              const isActive = activeVoice?.id === voice.id;

              return (
                <div
                  key={voice.id}
                  className={`relative group rounded-2xl p-3.5 border transition-all flex items-center justify-between gap-3 ${
                    isActive
                      ? "bg-fuchsia-500/10 border-fuchsia-500/40 shadow-[0_0_20px_rgba(217,70,239,0.15)]"
                      : "bg-zinc-900/60 border-white/5 hover:border-white/15 hover:bg-zinc-900"
                  }`}
                >
                  {/* Left: Avatar & Play & Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      style={{ background: voice.avatarGradient || "linear-gradient(135deg, #a855f7, #ec4899)" }}
                      className="relative w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0 shadow-md overflow-hidden cursor-pointer"
                      onClick={() => handlePlayToggle(voice)}
                    >
                      <button
                        className="absolute inset-0 bg-black/30 flex items-center justify-center hover:bg-black/50 transition-colors"
                        title={isPlaying ? "일시정지" : "미리듣기"}
                      >
                        {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {editingVoiceId === voice.id ? (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (editingName.trim()) {
                                    updateVoice(voice.id, { name: editingName.trim() });
                                  }
                                  setEditingVoiceId(null);
                                } else if (e.key === "Escape") {
                                  setEditingVoiceId(null);
                                }
                              }}
                              autoFocus
                              className="px-2 py-0.5 rounded-lg bg-black/60 border border-fuchsia-500 text-sm font-bold text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (editingName.trim()) {
                                  updateVoice(voice.id, { name: editingName.trim() });
                                }
                                setEditingVoiceId(null);
                              }}
                              className="p-1 rounded bg-fuchsia-600 text-white hover:bg-fuchsia-500"
                              title="저장"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingVoiceId(null)}
                              className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-white"
                              title="취소"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            <span className="font-bold text-sm text-white truncate">{voice.name}</span>
                            {voice.sourceType !== "default" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingVoiceId(voice.id);
                                  setEditingName(voice.name);
                                }}
                                className="opacity-0 group-hover/name:opacity-100 p-1 text-zinc-400 hover:text-fuchsia-400 transition-all"
                                title="이름 수정"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                        {isActive && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 shrink-0">
                            <CheckCircle2 className="w-2.5 h-2.5" /> 적용됨
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">{voice.desc || voice.stylePrompt}</p>
                      
                      {/* Tags */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {(voice.tags || []).slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/5"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleFavorite(voice.id)}
                      className={`p-2 rounded-lg transition-colors cursor-pointer ${
                        voice.isFavorite
                          ? "text-amber-400 hover:text-amber-300 bg-amber-400/10"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                      }`}
                      title={voice.isFavorite ? "찜 해제" : "찜하기"}
                    >
                      <Star className={`w-4 h-4 ${voice.isFavorite ? "fill-amber-400" : ""}`} />
                    </button>

                    {voice.sourceType !== "default" && (
                      <button
                        onClick={() => deleteVoice(voice.id)}
                        className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="음색 스타일 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleSelectVoice(voice)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isActive
                          ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                          : "bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-md shadow-fuchsia-600/30"
                      }`}
                    >
                      {isActive ? "선택 해제" : "스타일 선택"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-white/5 bg-zinc-950/50 flex items-center justify-between text-xs text-zinc-500">
          <span>선택한 보컬 음색 스타일이 생성 프롬프트에 반영됩니다.</span>
          <button
            onClick={handleClose}
            className="text-zinc-400 hover:text-white font-medium cursor-pointer"
          >
            닫기
          </button>
        </div>
      </motion.div>
    </div>
  );
}
