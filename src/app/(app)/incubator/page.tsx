"use client";

import { Fingerprint, PenTool, Image as ImageIcon, Link as LinkIcon, ShieldAlert, Sparkles, Smartphone, MonitorPlay } from "lucide-react";
import { useState } from "react";

export default function ArtistIncubator() {
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");

  return (
    <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Artist Incubator</h1>
        <p className="text-zinc-400">Design your Virtual Artist IP from scratch, set the visual concept, and manage copyrights.</p>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[650px] pb-10">
        
        {/* Left Column: DNA & Core Info */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-panel p-6 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-4">
              <Fingerprint className="w-5 h-5 text-fuchsia-400" />
              <h2 className="text-xl font-semibold text-white">Artist DNA</h2>
            </div>
            
            <div className="flex-1 flex flex-col justify-center items-center">
              <div className="w-32 h-32 rounded-full border-2 border-dashed border-zinc-600 bg-black/40 flex flex-col items-center justify-center cursor-pointer hover:border-fuchsia-500 hover:bg-fuchsia-900/20 transition-all mb-6 group">
                <ImageIcon className="w-8 h-8 text-zinc-500 group-hover:text-fuchsia-400 mb-2" />
                <span className="text-xs text-zinc-500 group-hover:text-fuchsia-400 text-center">Generate<br/>Anchor Image</span>
              </div>

              <div className="w-full space-y-4">
                <div className="w-full flex bg-black/50 p-1 rounded-xl border border-white/10 mb-2">
                  <button 
                    onClick={() => setAspectRatio("9:16")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${aspectRatio === "9:16" ? 'bg-gradient-to-r from-fuchsia-600/30 to-purple-600/30 text-fuchsia-300 shadow-[0_0_10px_rgba(192,38,211,0.2)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <Smartphone className="w-4 h-4" /> Shorts (9:16)
                  </button>
                  <button 
                    onClick={() => setAspectRatio("16:9")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${aspectRatio === "16:9" ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <MonitorPlay className="w-4 h-4" /> Longform (16:9)
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2">Stage Name</label>
                  <input type="text" placeholder="e.g. Neon Phantom" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-fuchsia-500 outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-2">Genre & Style Focus</label>
                  <input type="text" placeholder="e.g. Synthwave / Cyberpunk Lofi" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-fuchsia-500 outline-none transition-colors" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column: Lore & Visuals */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="glass-panel p-6 flex flex-col flex-1">
            <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-4">
              <PenTool className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-semibold text-white">Lore & Prompt Engineering</h2>
            </div>
            
            <div className="space-y-4 flex-1">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Backstory / Universe</label>
                <textarea 
                  rows={4} 
                  placeholder="Describe the artist's world. (e.g. A rogue AI living in a neon-lit futuristic city...)"
                  className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-cyan-500 outline-none transition-colors resize-none" 
                ></textarea>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 flex justify-between">
                  <span>Nano Banana Pro Visual Style Prompt</span>
                  <span className="text-cyan-400 border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 rounded text-[10px]">--ar {aspectRatio}</span>
                </label>
                <textarea 
                  rows={3} 
                  placeholder={`anime style, dark cyberpunk city, raining, neon lighting, highly detailed --ar ${aspectRatio}`}
                  className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-fuchsia-200 font-mono text-xs focus:border-cyan-500 outline-none transition-colors resize-none" 
                ></textarea>
                <p className="text-[10px] text-zinc-500 mt-2">* The system will automatically inject Face Identity preservation rules (PuLID compatible) and HeyGen optimal guidelines into the anchor prompt.</p>
              </div>
            </div>

            <button className="w-full py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-bold text-white text-sm flex items-center justify-center gap-2 mt-4">
              <Sparkles className="w-4 h-4 text-cyan-400"/> Save to Brand Vault
            </button>
          </div>
        </div>

        {/* Right Column: IP & Integration */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          {/* Copyright Registration */}
          <div className="glass-panel p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-white">Copyright Protection</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-4">Generate legally binding timestamps and register your IP metadata to the blockchain registry.</p>
            <button className="w-full py-2.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs font-medium transition-colors">
              Hash & Register IP
            </button>
          </div>

          {/* Social Media Linkage */}
          <div className="glass-panel p-6 flex flex-col flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">SNS Linkage</h3>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-lg">
                <span className="text-xs text-white font-medium">YouTube</span>
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Not Linked</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-lg">
                <span className="text-xs text-white font-medium">Instagram</span>
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Not Linked</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-lg">
                <span className="text-xs text-white font-medium">TikTok</span>
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Not Linked</span>
              </div>
            </div>

            <button className="w-full py-3 mt-auto rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 font-bold text-white text-xs flex items-center justify-center shadow-[0_0_15px_rgba(192,38,211,0.3)]">
              Connect Channels
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
