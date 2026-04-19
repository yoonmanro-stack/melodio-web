"use client";

import { Sparkles, Music4, Film, Info, Clock, CheckCircle2 } from "lucide-react";
import MultiTrackPlayer from "@/components/MultiTrackPlayer";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type Generation = {
  id: string;
  status: string;
  created_at: string;
};

export default function Home() {
  const [history, setHistory] = useState<Generation[]>([]);
  const [activeGenId, setActiveGenId] = useState<string>('');

  useEffect(() => {
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('generations')
        .select('id, status, created_at')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(6);
      
      if (data && !error) {
        setHistory(data);
        if (data.length > 0 && !activeGenId) {
          // 기본값으로 최신 세션 선택
          setActiveGenId(data[0].id);
        }
      }
    };
    fetchHistory();
  }, [activeGenId]);
  return (
    <div className="max-w-6xl mx-auto pt-4">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-white mb-2">Welcome back, Alex!</h1>
        <p className="text-zinc-400">Melodio AI Music Label Overview</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[400px]">
        {/* Usage & Subscription Card */}
        <div className="glass-panel p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              Usage & Subscription
            </h2>
            <div className="mb-8">
              <div className="text-sm text-zinc-400 mb-1">My Subscription</div>
              <div className="text-2xl font-bold text-fuchsia-400 neon-text">Pro Plan</div>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-400">Monthly Tokens</span>
                  <span className="text-white">4.2GB / 10GB</span>
                </div>
                <div className="w-full bg-[rgba(255,255,255,0.1)] rounded-full h-2">
                  <div className="bg-gradient-to-r from-fuchsia-600 to-cyan-400 h-2 rounded-full w-[42%]"></div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-[rgba(255,255,255,0.05)] text-center">
                <div>
                  <div className="text-2xl font-bold text-white">42</div>
                  <div className="text-[10px] text-zinc-400">Personas</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-fuchsia-400">18</div>
                  <div className="text-[10px] text-zinc-400">Longform MVs</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-cyan-400">54</div>
                  <div className="text-[10px] text-zinc-400">Shorts Hooks</div>
                </div>
              </div>
            </div>
          </div>
          
          <button className="w-full py-3 mt-4 rounded-xl bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] transition-colors text-sm font-medium">
            Manage Subscription
          </button>
        </div>

        {/* Action Cards */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="relative group rounded-2xl p-6 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#4c1d95] to-[#7e22ce] border border-[#a855f7]/30 shadow-[0_0_30px_rgba(126,34,206,0.3)] hover:shadow-[0_0_40px_rgba(126,34,206,0.6)] transition-all cursor-pointer">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
              <Sparkles className="w-24 h-24" />
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Create Persona</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Build your unique AI Artist. Define sound, style & brand with our interactive lab.
              </p>
            </div>
            <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 mt-6 font-medium transition-colors">
              Get Started
            </button>
          </div>

          <div className="relative group rounded-2xl p-6 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#be185d] to-[#db2777] border border-[#f472b6]/30 shadow-[0_0_30px_rgba(219,39,119,0.3)] hover:shadow-[0_0_40px_rgba(219,39,119,0.6)] transition-all cursor-pointer">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
              <Music4 className="w-24 h-24" />
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <Music4 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Batch Music Gen</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Generate 50+ tracks simultaneously using dual engines. Rapid music creation.
              </p>
            </div>
            <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 mt-6 font-medium transition-colors">
              Get Started
            </button>
          </div>

          <div className="relative group rounded-2xl p-6 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0369a1] to-[#0284c7] border border-[#38bdf8]/30 shadow-[0_0_30px_rgba(2,132,199,0.3)] hover:shadow-[0_0_40px_rgba(2,132,199,0.6)] transition-all cursor-pointer">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
              <Film className="w-24 h-24" />
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <Film className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Cinematic Studio</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Assemble high-fidelity dual-format MVs using 10s auto-stitching for Veo 3.1 & HeyGen.
              </p>
            </div>
            <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 mt-6 font-medium transition-colors">
              Get Started
            </button>
          </div>
        </div>
      </div>
      
      {/* ── 최근 생성 이력 (듀얼 패스 검증용) ── */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-fuchsia-400" />
          <h2 className="text-xl font-bold text-white">Recent Generations</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {history.length === 0 ? (
            <div className="col-span-3 text-zinc-500 text-sm p-4 glass-panel text-center">
              No completed generations found.
            </div>
          ) : (
            history.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setActiveGenId(item.id)}
                className={`glass-panel p-4 cursor-pointer transition-all border ${activeGenId === item.id ? 'border-fuchsia-500/50 bg-fuchsia-500/10 shadow-[0_0_15px_rgba(192,38,211,0.2)]' : 'border-white/5 hover:bg-white/5 hover:border-white/20'}`}
              >
                 <div className="flex flex-col gap-2">
                   <div className="flex justify-between items-start">
                     <div className="font-semibold text-white text-sm">Session #{item.id.slice(0, 6).toUpperCase()}</div>
                     <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-md font-medium border border-emerald-400/20">
                       <CheckCircle2 className="w-3 h-3" />
                       AAC READY
                     </span>
                   </div>
                   <div className="text-[11px] text-zinc-500">{new Date(item.created_at).toLocaleString()}</div>
                 </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* ── 멀티트랙 스템 플레이어 ── */}
      <div className="mt-8">
        {activeGenId ? (
          <MultiTrackPlayer generationId={activeGenId} />
        ) : (
          <MultiTrackPlayer />
        )}
      </div>

      {/* Alert banner replacing Insights*/}
      <div className="mt-8 glass-panel p-4 flex items-center gap-4 bg-[rgba(147,51,234,0.05)] border-[rgba(147,51,234,0.2)]">
        <div className="w-10 h-10 rounded-full bg-[rgba(147,51,234,0.2)] flex items-center justify-center flex-shrink-0">
          <Info className="w-5 h-5 text-fuchsia-400" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">Zero Analysis Needed</h4>
          <p className="text-sm text-zinc-400">Melodio automatically engineers the most viral keywords and algorithms for your selected Persona.</p>
        </div>
      </div>
    </div>
  );
}
