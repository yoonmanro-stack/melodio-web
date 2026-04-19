import { MessageSquare, Library, Plus } from "lucide-react";

export default function PersonaLab() {
  return (
    <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Persona Lab</h1>
        <p className="text-zinc-400">Design your Virtual Artist's identity, genre, and storytelling universe.</p>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[500px]">
        {/* Brand Vault / Library (Left Column) */}
        <div className="glass-panel flex flex-col p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Library className="w-5 h-5 text-fuchsia-400" /> Brand Vault
            </h2>
            <button className="p-2 rounded-lg bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors">
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto pr-2">
            {/* Persona Card 1 */}
            <div className="p-4 rounded-xl border border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-900/40 to-transparent cursor-pointer hover:border-fuchsia-400/60 transition-all">
              <h3 className="font-bold text-white mb-1 tracking-wide">Neon Rain Lofi</h3>
              <p className="text-xs text-fuchsia-200 mb-3">Urban Cyberpunk • Melancholic</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-0.5 rounded-full bg-black/40 text-[10px] text-zinc-300">#Midnight</span>
                <span className="px-2 py-0.5 rounded-full bg-black/40 text-[10px] text-zinc-300">#Piano</span>
              </div>
            </div>

            {/* Persona Card 2 */}
            <div className="p-4 rounded-xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-all">
              <h3 className="font-bold text-zinc-200 mb-1 tracking-wide">Cozy Cabin Jazz</h3>
              <p className="text-xs text-zinc-400 mb-3">Vintage Jazz • Warm & Relaxing</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-0.5 rounded-full bg-black/40 text-[10px] text-zinc-400">#Winter</span>
                <span className="px-2 py-0.5 rounded-full bg-black/40 text-[10px] text-zinc-400">#Saxophone</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Concept Interview Chat (Right 2 Columns) */}
      <div className="lg:col-span-2 glass-panel flex flex-col p-6 relative overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-white/10 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-600 to-cyan-400 flex items-center justify-center">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Melodio AI Architect</h3>
              <p className="text-xs text-cyan-400">Online & Ready to brainstorm</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto space-y-6  max-h-[400px]">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-600 to-cyan-400 flex-shrink-0 flex items-center justify-center mt-1">
                <SparklesIcon className="w-4 h-4 text-white" />
              </div>
              <div className="bg-[rgba(255,255,255,0.05)] border border-white/10 rounded-2xl rounded-tl-sm p-4 text-sm text-zinc-200 max-w-[80%]">
                <p>Welcome! Let&apos;s build your new Virtual Artist. What kind of vibe or storytelling universe are we aiming for today?</p>
                <p className="mt-2 text-zinc-400 italic">Example: &quot;A rainy cafe run by a melancholic barista in Tokyo&quot;</p>
              </div>
            </div>
            
            <div className="flex gap-4 flex-row-reverse">
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex-shrink-0 mt-1"></div>
              <div className="bg-gradient-to-r from-fuchsia-600/80 to-purple-600/80 rounded-2xl rounded-tr-sm p-4 text-sm text-white max-w-[80%] shadow-[0_0_15px_rgba(192,38,211,0.3)]">
                <p>I want a futuristic cyberpunk city vibe. Electronic synthwave but slow and sad.</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-600 to-cyan-400 flex-shrink-0 flex items-center justify-center mt-1">
                <SparklesIcon className="w-4 h-4 text-white" />
              </div>
              <div className="bg-[rgba(255,255,255,0.05)] border border-white/10 rounded-2xl rounded-tl-sm p-4 text-sm text-zinc-200 max-w-[80%]">
                <p>Excellent concept! I&apos;ve extracted the following structure. Shall I create the Persona Profile?</p>
                <div className="mt-4 bg-black/40 p-3 rounded-lg border border-cyan-500/30">
                  <div className="flex mb-1"><span className="text-zinc-400 w-20 text-xs">Genre:</span><span className="text-cyan-300 text-xs font-semibold">Synthwave, Slow Electronic</span></div>
                  <div className="flex mb-1"><span className="text-zinc-400 w-20 text-xs">Mood:</span><span className="text-cyan-300 text-xs font-semibold">Melancholic, Cinematic, Sad</span></div>
                  <div className="flex"><span className="text-zinc-400 w-20 text-xs">Story:</span><span className="text-cyan-300 text-xs font-semibold">Futuristic Cyberpunk City</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Chat Input */}
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Type your concept here..." 
                className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-4 pr-12 text-sm text-white outline-none focus:border-fuchsia-500/50 transition-colors"
                readOnly
              />
              <button className="absolute right-2 top-2 p-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 transition-colors">
                <MessageSquare className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  )
}
