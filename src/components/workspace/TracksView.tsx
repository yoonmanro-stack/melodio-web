"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Mic2, Disc3, Guitar, Piano, Volume2, VolumeX, Play, Pause, SkipBack } from "lucide-react";
import { motion } from "framer-motion";
import { useStemAudio, type StemId } from "@/hooks/useStemAudio";

const STEMS: { id: StemId; name: string; icon: typeof Mic2; color: string }[] = [
  { id: "vocals", name: "Lead Vocals", icon: Mic2, color: "#c76ad8" },
  { id: "drums", name: "Drums & Percussion", icon: Disc3, color: "#5abdd4" },
  { id: "bass", name: "Bassline", icon: Guitar, color: "#d4b85c" },
  { id: "other", name: "Melody & FX", icon: Piano, color: "#50c89a" },
];

const BAR_COUNT = 160;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function generateBaseWaveform(seed: number): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const t = i / BAR_COUNT;
    const w1 = Math.sin(t * (47 + seed)) * 0.35;
    const w2 = Math.sin(t * (113 + seed * 2)) * 0.25;
    const w3 = Math.sin(t * (31 + seed * 3)) * 0.2;
    const pseudo = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    const micro = (pseudo - Math.floor(pseudo) - 0.5) * 0.3;
    return Math.max(0.15, Math.min(1, Math.abs(w1 + w2 + w3 + micro) + 0.3));
  });
}

export function TracksView() {
  const audio = useStemAudio(); // Web Audio API 하드싱크 훅
  const { isPlaying, currentTime, duration, allLoaded, stemStates } = audio;
  const progress = duration > 0 ? currentTime / duration : 0;

  // Continuous animation time for visual bounce
  const [animTime, setAnimTime] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPlaying) {
      const start = performance.now();
      const tick = () => {
        setAnimTime((performance.now() - start) / 1000);
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying]);

  const handleToggle = () => {
    if (isPlaying) audio.pause();
    else audio.play();
  };

  const handleReset = () => audio.reset();

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = (e.clientX - rect.left) / rect.width;
    audio.seek(p * duration);
  };

  return (
    <div className="w-full flex flex-col gap-4 p-6 bg-[rgba(20,20,25,0.7)] rounded-3xl border border-[rgba(255,255,255,0.05)] backdrop-blur-2xl shadow-2xl">
      <div className="flex justify-between items-center mb-2 px-2">
        <div>
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-500">
            Stem Separation Mixer
          </h2>
          {!allLoaded && <p className="text-xs text-cyan-400 animate-pulse mt-1">Loading audio buffers...</p>}
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-1.5 rounded-full bg-cyan-500/20 text-cyan-400 text-sm font-semibold hover:bg-cyan-500/40 transition-colors">
            Sync All
          </button>
          <button className="px-4 py-1.5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/40 transition-colors">
            Export MIDI
          </button>
        </div>
      </div>

      {/* Master Transport */}
      <div className="flex items-center gap-4 px-2 py-3 rounded-xl bg-black/30 border border-white/5">
        <button onClick={handleReset} className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors">
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={handleToggle}
          disabled={!allLoaded}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg disabled:opacity-40 ${
            isPlaying ? "bg-fuchsia-600 hover:bg-fuchsia-500 shadow-fuchsia-500/30" : "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/30"
          }`}
        >
          {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
        </button>
        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs text-zinc-500 font-mono w-10 text-right">{formatTime(currentTime)}</span>
          <div className="flex-1 h-1.5 bg-white/5 rounded-full cursor-pointer relative overflow-hidden" onClick={handleSeek}>
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 transition-none" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="text-xs text-zinc-500 font-mono w-10">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Stem Tracks */}
      <div className="flex flex-col gap-3">
        {STEMS.map((stem, index) => (
          <TrackRow
            key={stem.id}
            stem={stem}
            index={index}
            progress={progress}
            animTime={animTime}
            isPlaying={isPlaying}
            stemState={stemStates[stem.id]}
            onToggleMute={() => audio.toggleMute(stem.id)}
            onToggleSolo={() => audio.toggleSolo(stem.id)}
            onVolumeChange={(v) => audio.setVolume(stem.id, v)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center px-2 pt-2 border-t border-white/5">
        <span className="text-[10px] text-zinc-600">🔊 Web Audio API · Hard-Sync · Solo(S) · Mute · Vol</span>
        <span className="text-[10px] text-zinc-600">Phase 11 · Live (Dual Path)</span>
      </div>
    </div>
  );
}

function TrackRow({
  stem, index, progress, animTime, isPlaying, stemState, onToggleMute, onToggleSolo, onVolumeChange,
}: {
  stem: typeof STEMS[0];
  index: number;
  progress: number;
  animTime: number;
  isPlaying: boolean;
  stemState: { muted: boolean; solo: boolean; volume: number };
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onVolumeChange: (v: number) => void;
}) {
  const baseWaveform = useMemo(() => generateBaseWaveform(index * 17 + 7), [index]);
  const isMuted = stemState.muted;
  const isSolo = stemState.solo;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`flex items-center gap-4 p-3 rounded-2xl transition-all duration-300 ${
        isMuted ? "bg-black/40 grayscale opacity-50" : "bg-black/20 hover:bg-black/40 border border-transparent hover:border-[rgba(255,255,255,0.05)]"
      }`}
    >
      {/* Label */}
      <div className="w-44 flex items-center gap-3 pl-2 border-r border-[rgba(255,255,255,0.05)] pr-4">
        <div className="p-2 bg-[rgba(255,255,255,0.05)] rounded-lg">
          <stem.icon className="w-5 h-5" style={{ color: stem.color }} />
        </div>
        <span className="font-medium text-sm text-zinc-300">{stem.name}</span>
      </div>

      {/* Mute & Solo */}
      <div className="flex flex-col gap-1 w-8">
        <button
          onClick={onToggleMute}
          className={`w-full h-6 rounded flex items-center justify-center transition-colors ${
            isMuted ? "bg-red-500/20 text-red-400" : "bg-[rgba(255,255,255,0.05)] text-zinc-500 hover:text-white"
          }`}
        >
          <span className="text-[10px] font-bold">M</span>
        </button>
        <button
          onClick={onToggleSolo}
          className={`w-full h-6 rounded flex items-center justify-center transition-colors ${
            isSolo ? "bg-yellow-500/20 text-yellow-400" : "bg-[rgba(255,255,255,0.05)] text-zinc-500 hover:text-yellow-400"
          }`}
        >
          <span className="text-[10px] font-bold">S</span>
        </button>
      </div>

      {/* Animated Waveform */}
      <div className="flex-1 relative mx-2 h-12 flex items-center gap-[1px]">
        {baseWaveform.map((base, i) => {
          const barPos = i / BAR_COUNT;
          const isPlayed = barPos < progress;

          let animatedHeight = base;
          if (isPlaying && !isMuted) {
            const distFromHead = Math.abs(barPos - progress);
            if (distFromHead < 0.08) {
              const intensity = 1 - distFromHead / 0.08;
              const bounce = Math.sin(animTime * (8 + index * 2) + i * 0.7) * 0.4 * intensity;
              const pulse = Math.sin(animTime * (12 + index * 3) + i * 1.3) * 0.2 * intensity;
              animatedHeight = Math.min(1, Math.max(0.05, base + bounce + pulse));
            }
          }

          return (
            <div
              key={i}
              className="flex-1 rounded-full"
              style={{
                minWidth: '1px',
                maxWidth: '2px',
                height: `${Math.max(4, animatedHeight * 100)}%`,
                background: isPlayed ? stem.color : `${stem.color}20`,
                boxShadow: isPlayed && isPlaying ? `0 0 3px ${stem.color}40` : 'none',
              }}
            />
          );
        })}

        {/* Playhead */}
        {progress > 0 && progress < 1 && (
          <div
            className="absolute top-0 bottom-0 w-[2px] pointer-events-none z-10"
            style={{
              left: `${progress * 100}%`,
              background: `linear-gradient(to bottom, ${stem.color}, ${stem.color}40, transparent)`,
              boxShadow: `0 0 10px ${stem.color}aa, 0 0 20px ${stem.color}40`,
            }}
          />
        )}
      </div>

      {/* Volume */}
      <div className="w-28 flex items-center gap-2 pl-4 border-l border-[rgba(255,255,255,0.05)]">
        {isMuted || stemState.volume === 0 ? <VolumeX className="w-4 h-4 text-zinc-500" /> : <Volume2 className="w-4 h-4 text-zinc-400" />}
        <input
          type="range" min="0" max="100" value={Math.round(stemState.volume * 100)}
          onChange={(e) => onVolumeChange(parseInt(e.target.value) / 100)}
          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
        />
      </div>
    </motion.div>
  );
}
