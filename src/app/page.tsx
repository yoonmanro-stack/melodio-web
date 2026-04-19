import Link from "next/link";
import { Sparkles, ArrowRight, Music, ShieldCheck } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-[url('https://grainy-gradients.vercel.app/noise.svg')] relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-fuchsia-900/20 via-[#09090b] to-cyan-900/20 z-0"></div>
      
      <div className="z-10 max-w-4xl flex flex-col items-center">
        <div className="inline-flex flex-row items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 mb-8 backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-fuchsia-400" />
          <span className="text-sm font-medium text-zinc-300">The Next Gen AI Music Label SaaS</span>
        </div>

        <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-500 mb-6 tracking-tighter">
          MELODIO
        </h1>
        
        <p className="text-lg md:text-xl text-zinc-400 mb-12 max-w-2xl font-light">
          Create infinite virtual artists, generate studio-quality tracks, and dispatch copyright-safe longform playlists directly to YouTube and TikTok with zero manual editing.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
          <Link 
            href="/login" 
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold text-lg flex items-center gap-3 transition-transform hover:scale-105 shadow-[0_0_20px_rgba(192,38,211,0.4)]"
          >
            Start Your Label <ArrowRight className="w-5 h-5" />
          </Link>
          <Link 
            href="/dashboard"
            className="px-8 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-white font-medium text-lg flex items-center gap-3 transition-colors"
          >
            Go to Dashboard <ShieldCheck className="w-5 h-5"/>
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <Music className="w-8 h-8 text-cyan-400 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Dual-Engine AI</h3>
            <p className="text-sm text-zinc-400">Powered by Suno and Lyria to generate infinite, high-fidelity stems simultaneously.</p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <Sparkles className="w-8 h-8 text-fuchsia-400 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Artist Incubator</h3>
            <p className="text-sm text-zinc-400">Design an IP, set the visual concept via Midjourney, and own the copyright permanently.</p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <ShieldCheck className="w-8 h-8 text-purple-400 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Auto-Publish pipeline</h3>
            <p className="text-sm text-zinc-400">Slice 9:16 shorts, generate multi-language SEO, and publish in one click.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
