"use client";

import Link from "next/link";
import { Hexagon, LogIn, Mail } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);
    
    // Supabase 로그인 시도
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    
    if (error) {
      // alert 대신 UI 에러메시지로 출력 (팝업 증발 방지)
      if (error.message.includes("Email not confirmed")) {
        setErrorMsg("이메일 인증이 필요합니다. 가입하신 메일함을 확인해주세요.");
      } else if (error.message.includes("Invalid login")) {
        setErrorMsg("이메일 또는 비밀번호가 일치하지 않습니다.");
      } else {
        setErrorMsg(error.message);
      }
    } else {
      router.push("/dashboard");
    }
  };

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    setErrorMsg("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/dashboard`
      }
    });
    
    if (error) {
      setErrorMsg(error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden glass-panel shadow-[0_0_50px_rgba(192,38,211,0.15)] h-[600px]">
        
        {/* Left Side: Branding / Media Loop */}
        <div className="bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] p-10 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-overlay"></div>
          
          <Link href="/" className="z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-fuchsia-600 to-cyan-400 flex items-center justify-center shadow-[0_0_15px_rgba(192,38,211,0.5)]">
              <Hexagon className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-wider text-white">MELODIO</span>
          </Link>
          
          <div className="z-10 mt-auto">
            <h2 className="text-3xl font-bold text-white mb-4">Welcome back,<br/>Maestro.</h2>
            <p className="text-zinc-300 text-sm">Sign in to orchestrate your virtual artists and automate your music empire.</p>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="p-10 flex flex-col justify-center bg-black/40">
          <h3 className="text-2xl font-bold text-white mb-8">Sign In</h3>
          
          <div className="space-y-4 mb-8">
            <button type="button" onClick={() => handleOAuthLogin('google')} className="w-full py-3 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-colors flex items-center justify-center gap-3 text-zinc-300 font-medium">
              <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center"><span className="text-black font-bold text-xs">G</span></div>
              Continue with Google
            </button>
            <button type="button" onClick={() => handleOAuthLogin('github')} className="w-full py-3 px-4 rounded-xl border border-white/10 hover:bg-white/5 transition-colors flex items-center justify-center gap-3 text-zinc-300 font-medium">
              <div className="w-5 h-5 flex items-center justify-center">🐙</div>
              Continue with GitHub
            </button>
          </div>

          <div className="relative flex items-center py-5">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="flex-shrink-0 mx-4 text-zinc-500 text-xs">OR CONTINUE WITH EMAIL</span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>

          <form className="space-y-4" onSubmit={handleLogin}>
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center font-medium">
                {errorMsg}
              </div>
            )}
            
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Email Address</label>
              <div className="relative">
                <input type="email" placeholder="maestro@melodio.ai" required value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:border-fuchsia-500 outline-none transition-colors" />
                <Mail className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 mt-4">Password</label>
              <div className="relative">
                <input type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-4 pr-4 text-white focus:border-fuchsia-500 outline-none transition-colors" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all font-bold text-white flex justify-center items-center gap-2 mt-6">
              <LogIn className="w-4 h-4" /> {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-zinc-500">
            Don&apos;t have an account? <Link href="/signup" className="text-fuchsia-400 hover:text-fuchsia-300">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
