import { CreditCard, CheckCircle2, Building2, Zap } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-8 h-full overflow-y-auto pb-10">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-400 to-cyan-400">
          Billing & Plans
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
        {/* Pro Creator Plan */}
        <div className="flex flex-col p-8 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl relative overflow-hidden">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Zap className="w-6 h-6 text-fuchsia-400" /> Pro Creator</h2>
            <p className="text-zinc-400 text-sm mt-2">For independent artists & content creators.</p>
          </div>
          <div className="mb-6">
            <span className="text-5xl font-extrabold text-white">$10</span><span className="text-zinc-500">/mo</span>
          </div>
          <ul className="flex flex-col gap-3 mb-8 flex-1">
            <li className="flex items-center gap-3 text-zinc-300"><CheckCircle2 className="w-5 h-5 text-fuchsia-500" /> 1,000 Generation Credits</li>
            <li className="flex items-center gap-3 text-zinc-300"><CheckCircle2 className="w-5 h-5 text-fuchsia-500" /> Standard Generation Priority</li>
            <li className="flex items-center gap-3 text-zinc-500"><CheckCircle2 className="w-5 h-5 text-zinc-700" /> Personal Use Only</li>
          </ul>
          <button className="w-full py-4 rounded-xl font-bold border border-fuchsia-500/50 text-fuchsia-400 hover:bg-fuchsia-500/10 transition-colors">Current Plan</button>
        </div>

        {/* B2B Commercial Plan */}
        <div className="flex flex-col p-8 rounded-3xl border border-cyan-500/50 bg-cyan-950/20 backdrop-blur-xl relative overflow-hidden ring-1 ring-cyan-500/30 shadow-[0_0_50px_rgba(8,145,178,0.15)]">
          <div className="absolute top-0 right-0 bg-cyan-500 text-black text-xs font-bold px-4 py-1 rounded-bl-xl">STORES FOCUS</div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2"><Building2 className="w-6 h-6 text-cyan-400" /> B2B Commercial</h2>
            <p className="text-cyan-200/60 text-sm mt-2">For cafes, restaurants & offline spaces.</p>
          </div>
          <div className="mb-6">
            <span className="text-5xl font-extrabold text-white">$29</span><span className="text-zinc-500">/mo</span>
          </div>
          <ul className="flex flex-col gap-3 mb-8 flex-1">
            <li className="flex items-center gap-3 text-white"><CheckCircle2 className="w-5 h-5 text-cyan-400" /> Unlimited 1-Hour BGM Compilations</li>
            <li className="flex items-center gap-3 text-white"><CheckCircle2 className="w-5 h-5 text-cyan-400" /> Copyright-Free Shield Guarantee</li>
            <li className="flex items-center gap-3 text-white"><CheckCircle2 className="w-5 h-5 text-cyan-400" /> Official License Certificate Issuance (/vault)</li>
            <li className="flex items-center gap-3 text-white"><CheckCircle2 className="w-5 h-5 text-cyan-400" /> MP4 Video Automatic Render</li>
          </ul>
          <button className="w-full py-4 rounded-xl font-bold bg-cyan-500 text-black hover:bg-cyan-400 hover:shadow-[0_0_30px_rgba(8,145,178,0.5)] transition-all">
            Upgrade to B2B
          </button>
        </div>
      </div>
    </div>
  );
}
