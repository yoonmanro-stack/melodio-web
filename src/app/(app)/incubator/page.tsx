"use client";

import { Fingerprint, PenTool, Image as ImageIcon, Link as LinkIcon, ShieldAlert, Sparkles, Smartphone, MonitorPlay } from "lucide-react";
import { useState } from "react";

export default function ArtistIncubator() {
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [voiceType, setVoiceType] = useState<"default" | "reference" | "upload" | "blend">("default");
  const [blendRatio, setBlendRatio] = useState(50);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);

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

          {/* Prompt-based vocal tone style panel */}
          <div className="glass-panel p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2 border-b border-white/10 pb-3">
              <Sparkles className="w-5 h-5 text-fuchsia-400" />
              <div>
                <h2 className="text-xl font-semibold text-white">보컬 음색 스타일</h2>
                <p className="mt-0.5 text-[10px] text-zinc-500">프롬프트 기반 · 실제 목소리 복제 기능이 아닙니다.</p>
              </div>
            </div>
            
            <div className="space-y-4">
              {/* Voice Generation Type Selector */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">음색 스타일 입력 방식</label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/50 border border-white/5 rounded-lg text-[10px] font-semibold">
                  {(
                    [
                      { id: 'default', label: '기본 스타일', disabled: false },
                      { id: 'reference', label: '참조 음원 · 준비 중', disabled: true },
                      { id: 'upload', label: '음성 업로드 · 준비 중', disabled: true },
                      { id: 'blend', label: '스타일 혼합', disabled: false }
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={t.disabled}
                      onClick={() => {
                        if (!t.disabled) setVoiceType(t.id)
                      }}
                      className={`py-1.5 px-2 rounded-md transition-all ${
                        voiceType === t.id
                          ? 'bg-fuchsia-600/30 text-fuchsia-300 border border-fuchsia-500/20 font-bold'
                          : t.disabled
                            ? 'cursor-not-allowed text-zinc-600 opacity-70'
                            : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[10px] leading-relaxed text-zinc-400">
                실제 목소리 등록·녹음·업로드는 <span className="font-bold text-amber-300">준비 중</span>입니다. 현재는 보컬 특성을 텍스트 프롬프트로 설계합니다.
              </div>

              {voiceType === 'blend' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">음색 스타일 A 코드 (예: VD-1004)</label>
                    <input 
                      type="text" 
                      placeholder="VD-1004"
                      className="w-full bg-black/50 border border-white/10 rounded-xl py-2.5 px-4 text-xs text-white focus:border-fuchsia-500 outline-none transition-colors" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">음색 스타일 B 코드</label>
                    <input 
                      type="text" 
                      placeholder="VD-3802"
                      className="w-full bg-black/50 border border-white/10 rounded-xl py-2.5 px-4 text-xs text-white focus:border-fuchsia-500 outline-none transition-colors" 
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                      <span>Ratio (A : B)</span>
                      <span>{blendRatio}% : {100 - blendRatio}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={blendRatio} 
                      onChange={(e) => setBlendRatio(Number(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500" 
                    />
                  </div>
                </div>
              )}

              {/* Vocal Traits Tag Selection */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">보컬 음색 특성 (프롬프트 태그)</label>
                <div className="flex flex-wrap gap-1">
                  {['Whispered', 'Airy', 'Heavy Vibrato', 'Falsetto', 'Dry Mix', 'Warm tone'].map((tag) => {
                    const isSelected = selectedTraits.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setSelectedTraits(prev => 
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                          );
                        }}
                        className={`px-2 py-1 rounded text-[9px] font-medium transition-all ${
                          isSelected 
                            ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30' 
                            : 'bg-zinc-800/40 text-zinc-400 hover:text-zinc-300 border border-transparent'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
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
