import { Film, Image as ImageIcon, PlayCircle, Clock, Volume2, Save, Sparkles, Scissors } from "lucide-react";

export default function LongformStudio() {
  return (
    <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Longform Studio</h1>
          <p className="text-zinc-400">Synthesize audio tracks with HeyGen Lip-Sync and Veo 3.1 B-Rolls.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-medium text-sm transition-all flex items-center gap-2">
             📱 Shorts (9:16)
          </button>
          <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-medium text-sm transition-all flex items-center gap-2">
             💻 Longform (16:9)
          </button>
          <button className="px-6 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all ml-4">
            <Save className="w-4 h-4" /> Export Video
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[500px]">
        {/* Visual Asset Generator */}
        <div className="glass-panel flex flex-col p-6 overflow-y-auto">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-semibold text-white">Generation Engines</h2>
          </div>

          <div className="space-y-4">
            {/* HeyGen Panel */}
            <div className="p-4 bg-black/40 rounded-xl border border-fuchsia-500/30 group cursor-pointer hover:border-fuchsia-500/80 transition-colors">
              <p className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-wider mb-2">Lip-Sync Engine</p>
              <h3 className="text-sm font-bold text-white mb-1">HeyGen API (Anchor)</h3>
              <p className="text-xs text-zinc-400">Map Suno/Lyria audio to your base Artist Avatar perfectly.</p>
              <button className="w-full mt-3 py-2 rounded-lg bg-fuchsia-900/30 border border-fuchsia-500/30 text-xs font-medium text-fuchsia-200 hover:bg-fuchsia-900/50 transition-colors">
                Generate Lip-Sync Clip
              </button>
            </div>

            {/* Veo 3.1 Panel */}
            <div className="p-4 bg-black/40 rounded-xl border border-cyan-500/30 group cursor-pointer hover:border-cyan-500/80 transition-colors">
              <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-2">B-Roll Engine</p>
              <h3 className="text-sm font-bold text-white mb-1">Veo 3.1 (Cinematic I2V)</h3>
              <p className="text-xs text-zinc-400">Create high-fidelity dynamic action shots holding character consistency.</p>
              <textarea 
                placeholder="Visual Prompt: e.g. Neon city tracking shot, slow-mo running..." 
                className="w-full h-16 mt-3 bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-zinc-300 outline-none focus:border-cyan-500/50 resize-none"
              ></textarea>
              <button className="w-full mt-2 py-2 rounded-lg bg-cyan-900/30 border border-cyan-500/30 text-xs font-medium text-cyan-200 hover:bg-cyan-900/50 transition-colors flex items-center justify-center gap-2">
                <ImageIcon className="w-3.5 h-3.5" /> Generate Veo 3.1 Clip
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Synthesizer */}
        <div className="lg:col-span-2 glass-panel flex flex-col p-0 overflow-hidden">
          {/* Main Video Player Mock */}
          <div className="h-[300px] w-full bg-black relative flex items-center justify-center border-b border-white/10">
             {/* Fake abstract background */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 via-black to-fuchsia-900/30"></div>
            <div className="absolute inset-0 opacity-20 Mix-blend-color-dodge bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-400 via-transparent to-transparent"></div>
            
            <PlayCircle className="w-16 h-16 text-white/50 hover:text-white/80 cursor-pointer transition-colors z-10" />
            
            {/* Player controls overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-4 z-10">
              <span className="text-xs text-white tabular-nums">00:00:00</span>
              <div className="flex-1 h-1 bg-white/20 rounded-full cursor-pointer relative">
                 <div className="absolute left-0 top-0 h-full w-0 bg-purple-500 rounded-full"></div>
              </div>
              <span className="text-xs text-white tabular-nums">01:00:00</span>
              <Volume2 className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Timeline Tracks */}
          <div className="flex-1 bg-[#0a0a0c] p-6 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-zinc-300">Playlist Timeline</h3>
              <div className="flex items-center gap-2">
                 <button className="text-xs text-fuchsia-300 hover:text-white bg-fuchsia-900/20 px-3 py-1.5 rounded border border-fuchsia-500/30 flex items-center gap-1 font-medium transition-colors shadow-[0_0_10px_rgba(192,38,211,0.2)]">
                    <Scissors className="w-3 h-3" /> Auto-Split by Beat (10s)
                 </button>
                 <button className="text-xs text-zinc-400 hover:text-white bg-white/5 px-2 py-1.5 rounded border border-white/10 transition-colors">Auto-Stitch</button>
                 <button className="text-xs text-zinc-400 hover:text-white bg-white/5 px-2 py-1.5 rounded border border-white/10 transition-colors">Shuffle</button>
              </div>
            </div>

            {/* Main Video Track (HeyGen base + Veo overlays) */}
            <div className="flex items-center gap-3">
              <div className="w-24 flex-shrink-0 flex items-center justify-between">
                <span className="text-[10px] text-fuchsia-400 uppercase font-bold tracking-wider">Video</span>
                <Film className="w-3.5 h-3.5 text-fuchsia-400" />
              </div>
              <div className="flex-1 h-12 bg-black/50 rounded flex gap-1 relative p-1 overflow-visible">
                 {/* HeyGen Base */}
                 <div className="absolute inset-x-1 inset-y-1 bg-fuchsia-900/30 border border-fuchsia-500/30 rounded flex items-center justify-center opacity-80 z-0">
                    <span className="text-[10px] text-fuchsia-300/80">HeyGen Master Lip-Sync Track (Underlay)</span>
                 </div>
                 
                 {/* Veo B-Roll 1 */}
                 <div className="w-[15%] h-full bg-cyan-900 border border-cyan-500 rounded relative z-10 ml-[20%] flex items-center justify-center cursor-pointer hover:bg-cyan-800 transition-colors shadow-lg">
                    <span className="text-[10px] text-cyan-100 font-medium">Veo B-Roll</span>
                 </div>

                 {/* Veo B-Roll 2 */}
                 <div className="w-[20%] h-full bg-cyan-900 border border-cyan-500 rounded relative z-10 ml-[30%] flex items-center justify-center cursor-pointer hover:bg-cyan-800 transition-colors shadow-lg">
                    <span className="text-[10px] text-cyan-100 font-medium">Veo_Clip_02 (Slowmo)</span>
                 </div>
              </div>
            </div>

            {/* Audio Track */}
            <div className="flex items-center gap-3">
              <div className="w-20 flex-shrink-0 flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <Film className="w-3.5 h-3.5 text-cyan-500" />
                  <span className="text-[10px] text-cyan-500 uppercase font-bold tracking-wider">Audio</span>
                </div>
              </div>
              
              <div className="flex-1 flex gap-1 h-12 bg-black/50 rounded overflow-hidden relative">
                 {/* Track 1 */}
                 <div className="w-1/4 h-full bg-cyan-900/40 border-r border-cyan-500/50 flex flex-col justify-center px-2 cursor-pointer hover:bg-cyan-800/40 transition-colors">
                    <span className="text-[10px] text-zinc-300 truncate">Suno_Track_01.mp3</span>
                    <div className="w-full h-3 mt-1 flex items-center gap-px opacity-50">
                      {[1,3,5,2,4,6,3,1,5,2,4,1,3,2].map((h,i) => <div key={i} className="w-1 bg-cyan-400" style={{height: `${h*15}%`}}></div>)}
                    </div>
                 </div>
                 {/* Track 2 */}
                 <div className="w-[30%] h-full bg-cyan-900/40 border-r border-cyan-500/50 flex flex-col justify-center px-2 cursor-pointer hover:bg-cyan-800/40 transition-colors">
                    <span className="text-[10px] text-zinc-300 truncate">Lyria_Track_07.mp3</span>
                    <div className="w-full h-3 mt-1 flex items-center gap-px opacity-50">
                      {[2,5,3,6,4,2,7,4,2,5,3,6,4,2,3,5].map((h,i) => <div key={i} className="w-1 bg-cyan-400" style={{height: `${h*15}%`}}></div>)}
                    </div>
                 </div>
                 {/* Track 3 */}
                 <div className="flex-1 h-full bg-cyan-900/40 flex items-center justify-center border-l-2 border-dashed border-white/20 hover:bg-cyan-800/20 cursor-pointer transition-colors">
                    <span className="text-xs text-zinc-500 flex items-center gap-1">+ Drop Audio </span>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
