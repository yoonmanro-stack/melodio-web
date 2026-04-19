"use client";

import Link from "next/link";
import { Hexagon, Sparkles, ArrowRight } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);
    
    // 1. Supabase Auth 계정 생성
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName }
      }
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        setErrorMsg("이미 가입된 이메일입니다.");
      } else {
        setErrorMsg(authError.message);
      }
      setLoading(false);
      return;
    }

    setLoading(false);
    setSuccessMsg("가입 성공! 메일함을 확인해주세요. (5초 후 로그인 창으로 이동)");
    setTimeout(() => {
      router.push("/login");
    }, 5000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden glass-panel shadow-[0_0_50px_rgba(192,38,211,0.15)] min-h-[600px]">
        
        {/* Left Side: Signup Form */}
        <div className="p-10 flex flex-col justify-center bg-black/40">
          <Link href="/" className="mb-10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-600 to-cyan-400 flex items-center justify-center">
              <Hexagon className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-wider text-white">MELODIO</span>
          </Link>

          <h3 className="text-2xl font-bold text-white mb-2">Create your account</h3>
          <p className="text-zinc-400 mb-8 text-sm">Start building your infinite music label today.</p>
          
          <form className="space-y-4" onSubmit={handleSignup}>
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center font-medium">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs text-center font-medium">
                {successMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">First Name</label>
                <input required value={firstName} onChange={e=>setFirstName(e.target.value)} type="text" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-fuchsia-500 outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Last Name</label>
                <input required value={lastName} onChange={e=>setLastName(e.target.value)} type="text" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-fuchsia-500 outline-none transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Email Address</label>
              <input required value={email} onChange={e=>setEmail(e.target.value)} type="email" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-fuchsia-500 outline-none transition-colors" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Password</label>
              <input required value={password} onChange={e=>setPassword(e.target.value)} type="password" minLength={6} className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-fuchsia-500 outline-none transition-colors" />
            </div>

            <button disabled={loading} type="submit" className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all font-bold text-white flex justify-center items-center gap-2 mt-6">
              {loading ? "Creating..." : "Create Account"} <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-zinc-500">
            Already have an account? <Link href="/login" className="text-cyan-400 hover:text-cyan-300">Sign in</Link>
          </p>
        </div>

        {/* Right Side: Creative Onboarding Concept */}
        <div className="bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] p-10 flex flex-col justify-center items-center relative overflow-hidden text-center">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-overlay pointer-events-none"></div>
          
          <div className="z-10 bg-black/20 p-8 rounded-3xl border border-white/10 backdrop-blur-md max-w-sm w-full mx-auto">
            <Sparkles className="w-12 h-12 text-fuchsia-400 mx-auto mb-6" />
            <h4 className="text-xl font-bold text-white mb-4">Step 1: Your First Artist</h4>
            <p className="text-sm text-zinc-300 mb-6">After signing up, you will be guided to construct your first Virtual Artist Persona using our AI Architect.</p>
            <div className="flex -space-x-2 justify-center mb-6">
              <div className="w-10 h-10 rounded-full border-2 border-[#302b63] bg-fuchsia-900 flex items-center justify-center text-xs">Vibe</div>
              <div className="w-10 h-10 rounded-full border-2 border-[#302b63] bg-purple-900 flex items-center justify-center text-xs">Voice</div>
              <div className="w-10 h-10 rounded-full border-2 border-[#302b63] bg-cyan-900 flex items-center justify-center text-xs">Lore</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
