import { MonitorPlay, Calendar, Globe, Share2, Type, Hash } from "lucide-react";

export default function Publishing() {
  return (
    <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Publishing & SEO</h1>
        <p className="text-zinc-400">Metadata generation, multi-language SEO, and YouTube scheduling.</p>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[500px]">
        
        {/* SEO & Metadata Generator */}
        <div className="glass-panel flex flex-col p-6 overflow-y-auto max-h-[75vh]">
          <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-4">
            <Globe className="w-5 h-5 text-fuchsia-400" />
            <h2 className="text-xl font-semibold text-white">Global Meta Forge</h2>
          </div>

          <div className="space-y-5">
            <div className="bg-[#0a0a0c] p-4 rounded-xl border border-white/5">
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-300 mb-3">
                <Type className="w-4 h-4 text-fuchsia-500" /> Viral Title Generation
              </label>
              <div className="space-y-2">
                <div className="p-3 bg-black/60 rounded-lg border border-fuchsia-500/30 cursor-pointer hover:border-fuchsia-400/50">
                  <p className="text-sm text-white">【24/7】深夜の東京: 眠れない夜の雨音とLo-Fi ☔️</p>
                  <span className="text-[10px] text-fuchsia-400 mt-1 block">Score: 98% (JP Target)</span>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-transparent cursor-pointer hover:border-white/20">
                  <p className="text-sm text-zinc-300">Late Night Tokyo Rain: Lofi Hip Hop for Sleep & Study</p>
                  <span className="text-[10px] text-zinc-500 mt-1 block">Score: 85% (Global Target)</span>
                </div>
              </div>
            </div>

            <div className="bg-[#0a0a0c] p-4 rounded-xl border border-white/5">
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-300 mb-3">
                <Type className="w-4 h-4 text-cyan-500" /> Auto-Generated Description & Chapters
              </label>
              <div className="p-3 bg-black/60 rounded-lg border border-white/10 h-40 overflow-y-auto">
                <p className="text-xs text-zinc-400 leading-relaxed font-mono whitespace-pre-wrap">
{`Welcome to Neon Rain Lofi. 
Listen to this carefully curated mix of melancholic electronic beats.

🎧 Timestamps:
00:00 - Midnight Protocol
03:42 - Neon Puddles
06:15 - Synthetic Dreams
10:02 - Coffee & Code
...`}
                </p>
              </div>
            </div>

            <div className="bg-[#0a0a0c] p-4 rounded-xl border border-white/5">
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-300 mb-3">
                <Hash className="w-4 h-4 text-purple-500" /> Optimized Tags
              </label>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-purple-900/30 border border-purple-500/30 text-purple-200 text-xs rounded-full">#lofi</span>
                <span className="px-3 py-1 bg-purple-900/30 border border-purple-500/30 text-purple-200 text-xs rounded-full">#cyberpunk</span>
                <span className="px-3 py-1 bg-purple-900/30 border border-purple-500/30 text-purple-200 text-xs rounded-full">#作業用BGM</span>
                <span className="px-3 py-1 bg-white/5 border border-white/10 text-zinc-400 text-xs rounded-full hover:bg-white/10 cursor-pointer">+ Regenerate</span>
              </div>
            </div>
          </div>
        </div>

        {/* Scheduler & Publishing Hub */}
        <div className="glass-panel flex flex-col p-6">
          <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <MonitorPlay className="w-5 h-5 text-red-500" /> Dispatch Hub
            </h2>
          </div>

          <div className="flex-1 space-y-6">
            
            {/* Output Formats Detected */}
            <div className="mb-6 bg-black/40 p-4 rounded-xl border border-white/5 flex items-center justify-between">
               <div>
                 <span className="block text-xs text-zinc-400 font-medium mb-1">Source Material Export</span>
                 <span className="block text-[10px] text-zinc-500">Auto-generated via Studio Timeline</span>
               </div>
               <div className="flex flex-col gap-2">
                 <span className="px-3 py-1 bg-cyan-900/40 text-cyan-400 text-[10px] font-bold rounded border border-cyan-500/30">💻 16:9 Longform MV (03:42)</span>
                 <span className="px-3 py-1 bg-fuchsia-900/40 text-fuchsia-400 text-[10px] font-bold rounded border border-fuchsia-500/30">📱 9:16 Shorts Hook (00:59)</span>
               </div>
            </div>

            {/* Target Channel */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Target YouTube Channel</label>
              <div className="flex items-center gap-3 bg-[rgba(0,0,0,0.5)] border border-white/10 rounded-xl p-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-red-600 to-pink-600 flex items-center justify-center">
                  <MonitorPlay className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Neon Records (Official)</p>
                  <p className="text-[10px] text-zinc-400">125K Subscribers • Connected</p>
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Visibility & Schedule</label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button className="py-3 bg-blue-600/20 border border-blue-500/50 text-blue-400 font-medium text-sm rounded-xl flex justify-center items-center gap-2 transition-colors">
                  <Globe className="w-4 h-4"/> Public
                </button>
                <button className="py-3 bg-white/5 border border-white/10 text-zinc-400 hover:text-white font-medium text-sm rounded-xl flex justify-center items-center gap-2 transition-colors">
                  Unlisted
                </button>
              </div>
              
              <div className="bg-[rgba(0,0,0,0.5)] border border-white/10 rounded-xl p-4 flex justify-between items-center cursor-pointer hover:border-white/20 transition-colors">
                 <div className="flex items-center gap-3">
                   <Calendar className="w-5 h-5 text-zinc-400" />
                   <div>
                     <p className="text-sm text-white">Schedule Upload</p>
                     <p className="text-xs text-zinc-500">Friday, Oct 24 • 18:00 (JST)</p>
                   </div>
                 </div>
                 <div className="w-8 h-4 bg-cyan-500 rounded-full relative"><div className="w-3 h-3 bg-white rounded-full absolute right-0.5 top-0.5"></div></div>
              </div>
            </div>

            {/* Multi-platform distribute summary */}
            <div className="p-4 rounded-xl bg-gradient-to-b from-fuchsia-900/20 to-transparent border border-fuchsia-500/20">
              <label className="flex items-center gap-2 text-sm font-semibold text-fuchsia-300 mb-2">
                <Share2 className="w-4 h-4" /> Cross-Platform Pipeline
              </label>
              <p className="text-xs text-zinc-400 mb-3">Upon successful YouTube upload, Melodio will automatically slice a 60-second 9:16 vertical hook and dispatch to:</p>
              <div className="flex gap-2">
                 <span className="px-2 py-1 bg-black/50 text-[#ff0050] text-[10px] font-bold rounded border border-white/5">TikTok</span>
                 <span className="px-2 py-1 bg-black/50 text-[#E1306C] text-[10px] font-bold rounded border border-white/5">Instagram Reels</span>
                 <span className="px-2 py-1 bg-black/50 text-[#FF0000] text-[10px] font-bold rounded border border-white/5">YT Shorts</span>
              </div>
            </div>

          </div>

          <button className="w-full py-4 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all font-bold text-white flex justify-center items-center gap-2 mt-6">
            <MonitorPlay className="w-5 h-5" /> Execute Upload Pipeline
          </button>
        </div>

      </div>
    </div>
  );
}
