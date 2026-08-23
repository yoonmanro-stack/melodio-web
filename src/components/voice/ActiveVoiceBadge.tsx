"use client";

import React from "react";
import { Mic2, Plus, X, Sparkles, Check } from "lucide-react";
import { useVoice } from "@/contexts/VoiceContext";

interface ActiveVoiceBadgeProps {
  className?: string;
  compact?: boolean;
}

export function ActiveVoiceBadge({ className = "", compact = false }: ActiveVoiceBadgeProps) {
  const { activeVoice, openVoiceModal, setActiveVoice } = useVoice();

  if (!activeVoice) {
    return (
      <button
        onClick={openVoiceModal}
        type="button"
        className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:border-fuchsia-500/40 text-zinc-300 hover:text-white transition-all text-xs font-semibold ${className}`}
        title="보이스 DNA 장착하기 (Suno Voices)"
      >
        <Plus className="w-3.5 h-3.5 text-fuchsia-400 group-hover:scale-110 transition-transform" />
        <span>보이스 선택</span>
      </button>
    );
  }

  return (
    <div
      className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-fuchsia-950/50 to-purple-950/40 border border-fuchsia-500/40 text-fuchsia-200 shadow-[0_0_15px_rgba(217,70,239,0.15)] text-xs font-bold ${className}`}
    >
      <div
        style={{ background: activeVoice.avatarGradient || "linear-gradient(135deg, #a855f7, #ec4899)" }}
        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white shrink-0"
      >
        <Mic2 className="w-2.5 h-2.5" />
      </div>

      <button
        onClick={openVoiceModal}
        type="button"
        className="flex items-center gap-1.5 hover:text-white transition-colors truncate max-w-[140px]"
        title={`활성 보이스: ${activeVoice.name}\n${activeVoice.desc || activeVoice.stylePrompt}`}
      >
        <span className="truncate">{activeVoice.name}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          setActiveVoice(null);
        }}
        type="button"
        className="text-fuchsia-400/60 hover:text-white p-0.5 rounded transition-colors"
        title="보이스 장착 해제"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
