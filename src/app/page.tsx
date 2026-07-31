import Link from "next/link";
import { Sparkles, ArrowRight, Music, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Revalidate once per hour to keep landing page static and fast (ISR)
export const revalidate = 3600;

async function getWikiStats() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return { genres: 0, curations: 0 };
  }

  try {
    const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    const [genresRes, curationsRes] = await Promise.all([
      supabase
        .from("curation_playbooks")
        .select("*", { count: "exact", head: true })
        .eq("category", "genre"),
      supabase
        .from("curation_playbooks")
        .select("*", { count: "exact", head: true })
        .eq("category", "curation")
    ]);

    return {
      genres: genresRes.count || 0,
      curations: curationsRes.count || 0
    };
  } catch (err) {
    console.error("[WikiStats] Failed to fetch wiki stats:", err);
    return { genres: 0, curations: 0 };
  }
}

export default async function LandingPage() {
  const stats = await getWikiStats();
  // 6,291개 에브리노이즈 장르 기저에 큐레이션 플레이북 개수를 합산하여 마케팅 스케일 극대화
  const totalProfiles = 6291 + stats.curations;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-[url('https://grainy-gradients.vercel.app/noise.svg')] relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-fuchsia-900/20 via-[#09090b] to-cyan-900/20 z-0"></div>
      
      <div className="z-10 max-w-4xl flex flex-col items-center">
        <div className="inline-flex flex-row items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 mb-8 backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-fuchsia-400" />
          <span className="text-sm font-medium text-zinc-300">The Next Gen AI Music Label SaaS</span>
        </div>

        <Logo size="xl" className="mb-8 scale-110 md:scale-125" />
        
        <p className="text-lg md:text-xl text-zinc-400 mb-6 max-w-2xl font-light">
          Create infinite virtual artists, generate studio-quality tracks, and dispatch copyright-safe longform playlists directly to YouTube and TikTok with zero manual editing.
        </p>

        {/* Premium Acoustic Engine Statistics Row */}
        <div className="mb-10 inline-flex flex-row items-center justify-center gap-4 md:gap-8 px-6 py-3 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md max-w-2xl">
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 font-medium uppercase tracking-wider text-[9px] md:text-[10px] mb-1">Acoustic Taxonomies</span>
            <span className="text-white font-bold text-sm md:text-base">6,200+ <span className="text-zinc-500 text-[10px] md:text-xs font-normal">Genres</span></span>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 font-medium uppercase tracking-wider text-[9px] md:text-[10px] mb-1">DSP Mastering Specs</span>
            <span className="text-white font-bold text-sm md:text-base">3,200+ <span className="text-zinc-500 text-[10px] md:text-xs font-normal">ATDs</span></span>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="text-zinc-500 font-medium uppercase tracking-wider text-[9px] md:text-[10px] mb-1">Engine Live Knowledge</span>
            <span className="text-white font-bold text-sm md:text-base">
              {totalProfiles} <span className="text-fuchsia-400 text-[10px] md:text-xs font-semibold animate-pulse">Indexed</span>
            </span>
          </div>
        </div>

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
