"use client";

import { motion } from "framer-motion";
import { Zap, Terminal, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function TokenMeter() {
  const [tokens, setTokens] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    let authSubscription: any;
    
    const fetchTokens = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('tokens_balance').eq('id', user.id).single();
        if (data) setTokens(data.tokens_balance);
      } else {
        setTokens(null);
      }
    };

    fetchTokens();

    // 로그인 상태 변화 감지
    authSubscription = supabase.auth.onAuthStateChange(() => {
      fetchTokens();
    });

    // Realtime 구독 (DB 밸런스 변경 시 즉시 반영)
    const channel = supabase
      .channel('profiles-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        setTokens(payload.new.tokens_balance);
        setIsGenerating(true); // 토큰이 차감될 때 깜빡거림 효과 트리거
        setTimeout(() => setIsGenerating(false), 2500); 
      })
      .subscribe();

    return () => {
      authSubscription?.data?.subscription?.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  if (tokens === null) return null; // 로그인 안 되어 있으면 안 보임

  return (
    <div className="fixed top-6 right-8 z-50 flex items-center gap-4">
      {/* Cyberpunk Status Text */}
      {isGenerating && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/30 backdrop-blur-md"
        >
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="text-xs font-mono text-cyan-300 tracking-wider">
            DB_SYNCING...
          </span>
        </motion.div>
      )}

      {/* Main Meter Component */}
      <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/40 border border-fuchsia-500/20 backdrop-blur-xl shadow-[0_0_15px_-3px_rgba(192,38,211,0.2)] hover:border-fuchsia-500/50 transition-all duration-300">
        <div className="relative">
          <Zap className="w-5 h-5 text-fuchsia-400" />
          {isGenerating && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
          )}
        </div>
        
        <div className="flex flex-col items-start min-w-[70px]">
          <span className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase">
            Balance
          </span>
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-zinc-100 font-mono">
              {tokens.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
