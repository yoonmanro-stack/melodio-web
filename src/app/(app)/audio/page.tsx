"use client";

import { useState } from "react";
import { SlidersHorizontal, Play, Check, X, SkipForward, Music, Settings2, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TracksView } from "@/components/workspace/TracksView";

export default function AudioForge() {
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);

  const handleKeep = () => {
    setSelectedTrack("Track_007.mp3"); // Enter mixing mode
  };

  const handleBack = () => {
    setSelectedTrack(null);
  };

  return (
    <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col relative w-full">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Audio Forge</h1>
        <p className="text-zinc-400">Generate tracks and remix them instantly.</p>
      </header>

      <div className="flex-1 relative w-full h-[650px]">
        <AnimatePresence mode="wait">
          {!selectedTrack ? (
            <motion.div 
              key="curator"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 absolute inset-0"
            >
              {/* Batch Generator — 좌측 카드 */}
              <div className="glass-panel flex flex-col p-6 border border-white/5 rounded-2xl bg-black/40">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-semibold flex items-center gap-2"><SlidersHorizontal className="w-5 h-5 text-cyan-400" /> Batch Generator</h2>
                </div>

                <div className="flex-1 flex flex-col gap-5">
                  {/* Genre Selector */}
                  <div>
                    <label className="text-xs text-zinc-400 block mb-2">Genre / Style</label>
                    <div className="flex flex-wrap gap-2">
                      {["Synthwave", "Lo-Fi", "K-Pop", "Hip Hop", "Ambient", "Jazz"].map((g) => (
                        <button key={g} className="px-3 py-1.5 rounded-lg text-xs border border-white/10 bg-white/5 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-colors text-zinc-300">{g}</button>
                      ))}
                    </div>
                  </div>

                  {/* BPM Range */}
                  <div>
                    <label className="text-xs text-zinc-400 block mb-2">BPM Range</label>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500">60</span>
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full relative">
                        <div className="absolute left-[20%] right-[30%] h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" />
                      </div>
                      <span className="text-xs text-zinc-500">180</span>
                    </div>
                  </div>

                  {/* Batch Count */}
                  <div>
                    <label className="text-xs text-zinc-400 block mb-2">Track Output & B2B Stitching</label>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button className="flex-1 py-2 rounded-lg text-sm border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors">1 (Single)</button>
                        <button className="flex-1 py-2 rounded-lg text-sm border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors">10 (EP)</button>
                      </div>
                      <button className="w-full py-3 rounded-xl text-sm border-2 border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-bold hover:bg-cyan-500/20 shadow-[0_0_20px_rgba(8,145,178,0.2)] transition-colors">
                        🏆 20 Tracks (1-Hour B2B Loop Mix + Video Render)
                      </button>
                    </div>
                  </div>

                  {/* Engine Select */}
                  <div>
                    <label className="text-xs text-zinc-400 block mb-2">AI Engine</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button className="py-2.5 rounded-lg text-sm border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 flex items-center justify-center gap-2">
                        <Settings2 className="w-3.5 h-3.5" /> Lyria 3
                      </button>
                      <button className="py-2.5 rounded-lg text-sm border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                        <Music className="w-3.5 h-3.5" /> Suno V5
                      </button>
                    </div>
                  </div>
                </div>

                <button className="w-full py-4 mt-6 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 font-bold text-white flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(8,145,178,0.4)] transition-shadow">
                  <Music className="w-5 h-5"/> Generate Tracks
                </button>
              </div>

              {/* Track Preview — 우측 카드 */}
              <div className="glass-panel flex flex-col items-center justify-center p-6 border border-white/5 rounded-2xl bg-black/40">
                <motion.div 
                  layoutId="track-card"
                  className="w-full max-w-xs flex flex-col items-center"
                >
                  <motion.div layoutId="track-icon" className="w-28 h-28 rounded-full bg-gradient-to-br from-[#083344] to-[#164e63] border border-cyan-500/30 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(8,145,178,0.2)]">
                    <Play className="w-12 h-12 text-cyan-400 fill-cyan-400 ml-2" />
                  </motion.div>

                  <motion.h3 layoutId="track-title" className="text-2xl font-bold text-white mb-2">Track_007.mp3</motion.h3>
                  <motion.p layoutId="track-desc" className="text-cyan-400/80 text-sm mb-8">Dark Synthwave • 95 BPM</motion.p>

                  {/* Waveform placeholder */}
                  <div className="w-full h-16 flex items-center justify-center gap-[3px] mb-8 px-4">
                    {Array.from({ length: 40 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 rounded-full bg-cyan-500/40"
                        style={{ height: `${Math.random() * 80 + 20}%` }}
                      />
                    ))}
                  </div>

                  <div className="flex justify-center items-center gap-8 w-full">
                    <button className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center hover:bg-red-500/20 transition-colors"><X className="w-6 h-6 text-red-400" /></button>
                    <button className="flex flex-col items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"><SkipForward className="w-5 h-5 text-zinc-500"/><span className="text-[10px] text-zinc-500">Skip</span></button>
                    <button onClick={handleKeep} className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center hover:bg-green-500/20 transition-colors"><Check className="w-6 h-6 text-green-400" /></button>
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
                <button onClick={handleBack} className="p-2 hover:bg-white/5 rounded-full transition-colors"><ArrowLeft className="text-zinc-400"/></button>
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
