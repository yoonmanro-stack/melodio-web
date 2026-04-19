import { Search, MessageSquare, ChevronDown, BookOpen, ShieldCheck, CreditCard, Link as LinkIcon } from "lucide-react";

export default function HelpCenter() {
  return (
    <div className="max-w-4xl mx-auto pt-4 h-full flex flex-col pb-20">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-white mb-4">How can we help?</h1>
        <div className="relative max-w-xl mx-auto">
          <input 
            type="text" 
            placeholder="Search for answers or ask Melodio AI..." 
            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-lg focus:border-fuchsia-500 outline-none transition-colors shadow-[0_0_20px_rgba(192,38,211,0.1)]" 
          />
          <Search className="absolute left-4 top-4.5 w-6 h-6 text-fuchsia-400" />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        <div className="glass-panel p-6 flex items-start gap-4 hover:border-white/20 transition-colors cursor-pointer group">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-bold mb-1">Copyrights & IP</h3>
            <p className="text-sm text-zinc-400">Learn about commercial rights, royalties, and ownership of your AI-generated artists and tracks.</p>
          </div>
        </div>
        
        <div className="glass-panel p-6 flex items-start gap-4 hover:border-white/20 transition-colors cursor-pointer group">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <CreditCard className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-white font-bold mb-1">Billing & Tokens</h3>
            <p className="text-sm text-zinc-400">Manage your subscription, view token usage for generation, and upgrade your label tier.</p>
          </div>
        </div>

        <div className="glass-panel p-6 flex items-start gap-4 hover:border-white/20 transition-colors cursor-pointer group">
          <div className="w-10 h-10 rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <BookOpen className="w-5 h-5 text-fuchsia-400" />
          </div>
          <div>
            <h3 className="text-white font-bold mb-1">Artist Incubator Guide</h3>
            <p className="text-sm text-zinc-400">Step-by-step masterclass on engineering the perfect Persona prompt and building lore.</p>
          </div>
        </div>

        <div className="glass-panel p-6 flex items-start gap-4 hover:border-white/20 transition-colors cursor-pointer group">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <LinkIcon className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-white font-bold mb-1">YouTube & SNS Sync</h3>
            <p className="text-sm text-zinc-400">Troubleshoot API connections, auto-publishing limits, and multi-channel routing.</p>
          </div>
        </div>
      </div>

      <div className="glass-panel p-8">
        <h2 className="text-xl font-bold text-white mb-6">Frequently Asked Questions</h2>
        
        <div className="space-y-3">
          {[
            { q: "Who owns the copyright to the generated music?", a: "You do. Subscribed users retain 100% commercial rights to all tracks generated through the platform, subject to the underlying engine's (e.g. Suno) specific commercial terms pass-through." },
            { q: "Can I register my AI Artist to Spotify or Apple Music?", a: "Yes. Melodio acts as your label backend. You can export WAV files and distribute them via any standard aggregator like DistroKid or TuneCore." },
            { q: "What happens if a YouTube video gets a copyright strike?", a: "The Dual-Engine system features an Anti-Dupe tracker to ensure unique generations. If an erroneous Content ID claim occurs, we provide automated dispute templates in the IP center." },
            { q: "Do my generation tokens roll over to the next month?", a: "No, tokens reset on your billing cycle. However, 'Studio Tier' users have access to token vaultinging options." }
          ].map((faq, i) => (
            <div key={i} className="border border-white/10 rounded-xl bg-black/30 overflow-hidden">
              <button className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors">
                <span className="font-medium text-zinc-200 text-sm">{faq.q}</span>
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              </button>
              {/* Mock active state for the first one */}
              {i === 0 && (
                <div className="px-6 py-4 border-t border-white/5 bg-black/50">
                  <p className="text-zinc-400 text-sm leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      <div className="mt-8 text-center flex flex-col items-center">
        <p className="text-zinc-500 mb-4 text-sm">Still need help?</p>
        <button className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white font-medium text-sm flex items-center gap-2 transition-colors">
          <MessageSquare className="w-4 h-4" /> Open a Support Ticket
        </button>
      </div>

    </div>
  );
}
