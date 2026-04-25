"use client";

import { useState } from "react";
import { SlidersHorizontal, Play, Check, X, SkipForward, Music, Settings2, ArrowLeft, Library, Copy, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TracksView } from "@/components/workspace/TracksView";
import Link from "next/link";

// ── Style Library 데이터와 동일한 소스 공유 ──────────────────
const QUICK_STYLES = [
  { id: 1, name: "Dark Synthwave",      genre: "Electronic", tags: "dark synthwave, retrofuturistic, analog synth, reverb, neon noir",                     color: "from-purple-600 to-indigo-600" },
  { id: 2, name: "Cyberpunk Bass",      genre: "Electronic", tags: "cyberpunk, heavy bass, industrial, glitch, dystopian electronic",                       color: "from-cyan-600 to-blue-600" },
  { id: 3, name: "Late Night Lo-Fi",    genre: "Lo-Fi",      tags: "lo-fi hip hop, vinyl crackle, jazz chords, rain ambience, cozy night",                  color: "from-amber-600 to-orange-600" },
  { id: 4, name: "Trap Darkness",       genre: "Hip Hop",    tags: "dark trap, 808 bass, hi-hat rolls, menacing atmosphere, drill influence",               color: "from-red-600 to-rose-600" },
  { id: 5, name: "K-Pop Summer Bop",   genre: "K-Pop",      tags: "K-pop, catchy hook, bright synths, dance pop, idol concept, summer vibe",              color: "from-fuchsia-600 to-pink-600" },
  { id: 6, name: "Future Bass Anthem", genre: "Electronic", tags: "future bass, festival anthem, euphoric drop, supersaws, emotional build",               color: "from-pink-600 to-fuchsia-600" },
  { id: 7, name: "Neo-Soul Groove",    genre: "R&B / Soul", tags: "neo-soul, smooth groove, live instruments, soulful, late night vibes",                  color: "from-amber-600 to-rose-600" },
  { id: 8, name: "Epic Orchestral",    genre: "Cinematic",  tags: "cinematic orchestral, epic brass, string swell, trailer music, powerful build",         color: "from-red-600 to-orange-600" },
];

export default function AudioForge() {
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<typeof QUICK_STYLES[0] | null>(null);
  const [copiedStyle, setCopiedStyle] = useState<number | null>(null);
  const [bpmMin, setBpmMin] = useState(80);
  const [bpmMax, setBpmMax] = useState(130);
  const [batchCount, setBatchCount] = useState<"1" | "10" | "20">("1");
  const [engine, setEngine] = useState<"lyria" | "suno">("lyria");

  const handleKeep = () => setSelectedTrack("Track_007.mp3");
  const handleBack = () => setSelectedTrack(null);

  const handleStyleSelect = (style: typeof QUICK_STYLES[0]) => {
    setSelectedStyle(style);
  };

  const handleCopyStyle = (style: typeof QUICK_STYLES[0], e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(style.tags);
    setCopiedStyle(style.id);
    setTimeout(() => setCopiedStyle(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col relative w-full">
      <header className="mb-6">
        <h1 className="text-4xl font-bold text-white mb-2">Audio Forge</h1>
        <p className="text-zinc-400">Generate tracks and remix them instantly.</p>
      </header>

      <div className="flex-1 relative w-full h-[700px]">
        <AnimatePresence mode="wait">
          {!selectedTrack ? (
            <motion.div
              key="curator"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 absolute inset-0"
            >
              {/* ── 좌측: Batch Generator ── */}
              <div className="glass-panel flex flex-col p-6 border border-white/5 rounded-2xl bg-black/40">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="font-semibold flex items-center gap-2 text-white">
                    <SlidersHorizontal className="w-5 h-5 text-cyan-400" /> Batch Generator
                  </h2>
                </div>

                <div className="flex-1 flex flex-col gap-5">

                  {/* ── Style 선택 (Style Library 연동) ── */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-zinc-400">Genre / Style</label>
                      <Link
                        href="/style-library"
                        className="flex items-center gap-1 text-[10px] text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                      >
                        <Library className="w-3 h-3" /> 전체 라이브러리
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>

                    {/* 선택된 스타일 표시 */}
                    {selectedStyle && (
                      <div className="mb-3 p-3 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/5">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-fuchsia-300">{selectedStyle.name}</span>
                            <span className="text-[10px] text-zinc-500 ml-2">{selectedStyle.genre}</span>
                          </div>
                          <button
                            onClick={() => setSelectedStyle(null)}
                            className="text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-mono mt-1 line-clamp-1">{selectedStyle.tags}</p>
                      </div>
                    )}

                    {/* 퀵 스타일 카드 그리드 */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {QUICK_STYLES.map((style) => (
                        <div
                          key={style.id}
                          onClick={() => handleStyleSelect(style)}
                          className={`group relative rounded-lg p-2.5 cursor-pointer border transition-all duration-150 overflow-hidden ${
                            selectedStyle?.id === style.id
                              ? "border-fuchsia-500/70 bg-fuchsia-500/10 shadow-[0_0_12px_rgba(192,38,211,0.2)]"
                              : "border-white/8 bg-white/3 hover:border-white/20 hover:bg-white/5"
                          }`}
                        >
                          {/* 그라디언트 left bar */}
                          <div className={`absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b ${style.color} rounded-l-lg`} />
                          <div className="pl-2 flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-semibold text-white truncate">{style.name}</p>
                              <p className="text-[9px] text-zinc-500 truncate">{style.genre}</p>
                            </div>
                            <button
                              onClick={(e) => handleCopyStyle(style, e)}
                              className="ml-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                              title="태그 복사"
                            >
                              {copiedStyle === style.id
                                ? <Check className="w-3 h-3 text-green-400" />
                                : <Copy className="w-3 h-3 text-zinc-400" />
                              }
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── BPM Range ── */}
                  <div>
                    <label className="text-xs text-zinc-400 block mb-2">
                      BPM Range <span className="text-white font-mono ml-2">{bpmMin} – {bpmMax}</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-600 w-6">60</span>
                      <input
                        type="range" min={60} max={bpmMax - 10} value={bpmMin}
                        onChange={(e) => setBpmMin(Number(e.target.value))}
                        className="flex-1 accent-cyan-500 h-1"
                      />
                      <input
                        type="range" min={bpmMin + 10} max={200} value={bpmMax}
                        onChange={(e) => setBpmMax(Number(e.target.value))}
                        className="flex-1 accent-fuchsia-500 h-1"
                      />
                      <span className="text-xs text-zinc-600 w-6">200</span>
                    </div>
                  </div>

                  {/* ── Batch Count ── */}
                  <div>
                    <label className="text-xs text-zinc-400 block mb-2">Track Output & B2B Stitching</label>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        {(["1", "10"] as const).map((n) => (
                          <button
                            key={n}
                            onClick={() => setBatchCount(n)}
                            className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                              batchCount === n
                                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                                : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                            }`}
                          >
                            {n === "1" ? "1 (Single)" : "10 (EP)"}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setBatchCount("20")}
                        className={`w-full py-3 rounded-xl text-sm border-2 font-bold transition-colors ${
                          batchCount === "20"
                            ? "border-cyan-500 bg-cyan-500/20 text-cyan-300 shadow-[0_0_20px_rgba(8,145,178,0.3)]"
                            : "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                        }`}
                      >
                        🏆 20 Tracks (1-Hour B2B Loop Mix + Video Render)
                      </button>
                    </div>
                  </div>

                  {/* ── AI Engine ── */}
                  <div>
                    <label className="text-xs text-zinc-400 block mb-2">AI Engine</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setEngine("lyria")}
                        className={`py-2.5 rounded-lg text-sm border flex items-center justify-center gap-2 transition-colors ${
                          engine === "lyria"
                            ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-400"
                            : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                        }`}
                      >
                        <Settings2 className="w-3.5 h-3.5" /> Lyria 3
                      </button>
                      <button
                        onClick={() => setEngine("suno")}
                        className={`py-2.5 rounded-lg text-sm border flex items-center justify-center gap-2 transition-colors ${
                          engine === "suno"
                            ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-400"
                            : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                        }`}
                      >
                        <Music className="w-3.5 h-3.5" /> Suno V5
                      </button>
                    </div>
                  </div>
                </div>

                <button className="w-full py-4 mt-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 font-bold text-white flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(8,145,178,0.4)] transition-shadow">
                  <Music className="w-5 h-5" />
                  Generate {batchCount === "1" ? "Track" : `${batchCount} Tracks`}
                  {selectedStyle && <span className="text-xs opacity-70 ml-1">— {selectedStyle.name}</span>}
                </button>
              </div>

              {/* ── 우측: Track Preview ── */}
              <div className="glass-panel flex flex-col items-center justify-center p-6 border border-white/5 rounded-2xl bg-black/40">
                <motion.div layoutId="track-card" className="w-full max-w-xs flex flex-col items-center">
                  <motion.div
                    layoutId="track-icon"
                    className={`w-28 h-28 rounded-full flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(8,145,178,0.2)] border border-cyan-500/30 ${
                      selectedStyle
                        ? `bg-gradient-to-br ${selectedStyle.color}`
                        : "bg-gradient-to-br from-[#083344] to-[#164e63]"
                    }`}
                  >
                    <Play className="w-12 h-12 text-white fill-white ml-2" />
                  </motion.div>

                  <motion.h3 layoutId="track-title" className="text-2xl font-bold text-white mb-1">
                    {selectedStyle ? selectedStyle.name : "Track_007.mp3"}
                  </motion.h3>
                  <motion.p layoutId="track-desc" className="text-cyan-400/80 text-sm mb-8">
                    {selectedStyle ? `${selectedStyle.genre} · ${bpmMin}–${bpmMax} BPM` : "Dark Synthwave • 95 BPM"}
                  </motion.p>

                  {/* Waveform placeholder */}
                  <div className="w-full h-16 flex items-center justify-center gap-[3px] mb-8 px-4">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 rounded-full bg-cyan-500/40"
                        style={{ height: `${Math.sin(i * 0.4) * 30 + 50}%` }}
                      />
                    ))}
                  </div>

                  <div className="flex justify-center items-center gap-8 w-full">
                    <button className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                      <X className="w-6 h-6 text-red-400" />
                    </button>
                    <button className="flex flex-col items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                      <SkipForward className="w-5 h-5 text-zinc-500" />
                      <span className="text-[10px] text-zinc-500">Skip</span>
                    </button>
                    <button onClick={handleKeep} className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center hover:bg-green-500/20 transition-colors">
                      <Check className="w-6 h-6 text-green-400" />
                    </button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="mixer"
              layoutId="track-card"
              className="absolute inset-0 w-full h-full bg-black/60 rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(8,145,178,0.2)] p-6 overflow-y-auto flex flex-col gap-6"
            >
              <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                <button onClick={handleBack} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <ArrowLeft className="text-zinc-400" />
                </button>
                <motion.div layoutId="track-icon" className="w-12 h-12 rounded-full bg-gradient-to-br from-[#083344] to-[#164e63] flex items-center justify-center">
                  <Play className="w-5 h-5 text-cyan-400 fill-cyan-400 ml-1" />
                </motion.div>
                <div>
                  <motion.h3 layoutId="track-title" className="text-xl font-bold text-white">Track_007.mp3</motion.h3>
                  <motion.p layoutId="track-desc" className="text-cyan-400/80 text-xs">Entering Stem Separation Mode...</motion.p>
                </div>
              </div>
              <div className="flex-1">
                <TracksView />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
