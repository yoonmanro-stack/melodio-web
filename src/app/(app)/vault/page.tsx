import { ShieldCheck, FileText, Download, Building2, Calendar } from "lucide-react";

export default function VaultPage() {
  return (
    <div className="flex flex-col gap-8 h-full overflow-y-auto pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 flex items-center gap-3">
            <ShieldCheck className="w-10 h-10 text-cyan-400" /> IP & License Vault
          </h1>
          <p className="text-zinc-400 mt-2">Manage your commercial B2B licenses and download legal certificates.</p>
        </div>
      </div>

      <div className="grid gap-4 mt-4">
        {/* Mock License 1 */}
        <div className="flex items-center justify-between p-6 rounded-2xl border border-cyan-500/20 bg-cyan-950/10 backdrop-blur-md">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30">
              <Building2 className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Cafe Brown - LoFi Ambient Mix (April)</h3>
              <div className="flex gap-4 text-sm text-zinc-400">
                <span className="flex items-center gap-1"><Calendar className="w-4 h-4"/> Valid: 2026.04.19 - Perpetual</span>
                <span className="flex items-center gap-1"><FileText className="w-4 h-4"/> Certificate #M-49201</span>
              </div>
            </div>
          </div>
          <button className="px-6 py-3 rounded-xl bg-white/5 hover:bg-cyan-500/20 hover:border-cyan-500/50 border border-white/10 text-cyan-400 font-semibold transition-all flex items-center gap-2">
            <Download className="w-5 h-5" /> Download PDF
          </button>
        </div>

        {/* Mock License 2 */}
        <div className="flex items-center justify-between p-6 rounded-2xl border border-white/5 bg-black/40 backdrop-blur-md">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center border border-white/10">
              <Building2 className="w-8 h-8 text-zinc-500" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Retro Burger - Synthwave Hits</h3>
              <div className="flex gap-4 text-sm text-zinc-500">
                <span className="flex items-center gap-1"><Calendar className="w-4 h-4"/> Valid: 2026.03.11 - Perpetual</span>
                <span className="flex items-center gap-1"><FileText className="w-4 h-4"/> Certificate #M-38102</span>
              </div>
            </div>
          </div>
          <button className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold transition-all flex items-center gap-2">
            <Download className="w-5 h-5" /> Download PDF
          </button>
        </div>
      </div>
      
      <div className="mt-8 p-6 rounded-2xl bg-blue-950/20 border border-blue-500/20">
        <h4 className="text-blue-400 font-bold mb-2">Notice to Inspectors</h4>
        <p className="text-blue-200/70 text-sm leading-relaxed">
          The certificates generated in this vault serve as definitive proof that the audio tracks are 100% AI-generated via Melodio's commercial APIs. They are legally clear of traditional Public Performance Rights (공연권) and are safe to broadcast in commercial retail spaces.
        </p>
      </div>
    </div>
  );
}
