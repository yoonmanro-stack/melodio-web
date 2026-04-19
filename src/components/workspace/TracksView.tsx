"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Mic2, Disc3, Guitar, Piano, Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";

const STEMS = [
  { id: "vocals", name: "Lead Vocals", icon: Mic2, color: "#c026d3" },
  { id: "drums", name: "Drums & Percussion", icon: Disc3, color: "#06b6d4" },
  { id: "bass", name: "Bassline", icon: Guitar, color: "#eab308" },
  { id: "other", name: "Melody & FX", icon: Piano, color: "#10b981" },
];

export function TracksView() {
  return (
    <div className="w-full flex flex-col gap-4 p-6 bg-[rgba(20,20,25,0.7)] rounded-3xl border border-[rgba(255,255,255,0.05)] backdrop-blur-2xl shadow-2xl">
      <div className="flex justify-between items-center mb-2 px-2">
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-500">
          Stem Separation Mixer
        </h2>
        <div className="flex gap-2">
          <button className="px-4 py-1.5 rounded-full bg-cyan-500/20 text-cyan-400 text-sm font-semibold hover:bg-cyan-500/40 transition-colors">
            Sync All
          </button>
          <button className="px-4 py-1.5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 text-sm font-semibold hover:bg-fuchsia-500/40 transition-colors">
            Export MIDI
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {STEMS.map((stem, index) => (
          <TrackRow key={stem.id} stem={stem} delay={index * 0.1} />
        ))}
      </div>
    </div>
  );
}

function TrackRow({ stem, delay }: { stem: typeof STEMS[0], delay: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(80);

  useEffect(() => {
    if (!containerRef.current) return;

    // Generate fake peaks for visual representation since we have no audio yet
    // wavesurfer.js v7: peaks는 number[][] 형태여야 함
    const dummyPeaks: number[][] = [
      Array.from({ length: 200 }, () => (Math.random() * 2) - 1),
    ];

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: `${stem.color}40`,
      progressColor: stem.color,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      height: 48,
      normalize: true,
      cursorColor: 'rgba(255,255,255,0.5)',
      interact: true,
    });

    // We load a dummy silent peak data just to render the shape
    ws.load('', dummyPeaks, 30);
    setWavesurfer(ws);

    return () => {
      ws.destroy();
    };
  }, [stem.color]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (wavesurfer) {
      wavesurfer.setVolume(isMuted ? volume / 100 : 0);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`flex items-center gap-4 p-3 rounded-2xl transition-all duration-300 ${isMuted ? 'bg-black/40 grayscale opacity-50' : 'bg-black/20 hover:bg-black/40 border border-transparent hover:border-[rgba(255,255,255,0.05)]'}`}
    >
      {/* Control Panel (Left) */}
      <div className="w-48 flex items-center justify-between pl-2 border-r border-[rgba(255,255,255,0.05)] pr-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[rgba(255,255,255,0.05)] rounded-lg">
            <stem.icon className="w-5 h-5 mb-0.5" style={{ color: stem.color }} />
          </div>
          <span className="font-medium text-sm text-zinc-300">{stem.name}</span>
        </div>
      </div>

      {/* Mute & Solo Toggles */}
      <div className="flex flex-col gap-1 w-8">
        <button 
          onClick={toggleMute}
          className={`w-full h-6 rounded flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-[rgba(255,255,255,0.05)] text-zinc-500 hover:text-white'}`}
        >
          <span className="text-[10px] font-bold">M</span>
        </button>
        <button className="w-full h-6 rounded bg-[rgba(255,255,255,0.05)] text-zinc-500 flex items-center justify-center hover:text-yellow-400 transition-colors">
          <span className="text-[10px] font-bold">S</span>
        </button>
      </div>

      {/* Waveform Canvas */}
      <div className="flex-1 relative mx-2 h-12 flex items-center">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Volume Slider (Right) */}
      <div className="w-32 flex items-center gap-2 pl-4 border-l border-[rgba(255,255,255,0.05)]">
        {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-zinc-500" /> : <Volume2 className="w-4 h-4 text-zinc-400" />}
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={isMuted ? 0 : volume}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            setVolume(val);
            if(wavesurfer) wavesurfer.setVolume(val / 100);
            if(val > 0 && isMuted) setIsMuted(false);
          }}
          className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
        />
      </div>
    </motion.div>
  );
}
