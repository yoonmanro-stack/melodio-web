import { User, Bell, Shield, Download, UploadCloud, Code, Copy } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto pt-4 h-full flex flex-col pb-20">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
        <p className="text-zinc-400">Manage your profile, team access, and platform preferences.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Settings Navigation (Sidebar within settings) */}
        <div className="col-span-1 md:col-span-3 space-y-2">
          <button className="w-full text-left px-4 py-2 rounded-lg bg-white/10 text-white font-medium border border-white/5">
            Profile
          </button>
          <button className="w-full text-left px-4 py-2 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-colors">
            Team & Workspace
          </button>
          <button className="w-full text-left px-4 py-2 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-colors">
            Notifications
          </button>
          <button className="w-full text-left px-4 py-2 rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white transition-colors">
            Terms & Privacy
          </button>
        </div>

        {/* Settings Content */}
        <div className="col-span-1 md:col-span-9 space-y-8">
          
          {/* Profile Form */}
          <div className="glass-panel p-8">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-cyan-400" /> Account Profile
            </h2>
            
            <div className="flex items-center gap-6 mb-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#0f0c29] to-[#302b63] border-2 border-fuchsia-500/50 flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity">
                <UploadCloud className="w-6 h-6 text-fuchsia-400 mb-1" />
                <span className="text-[10px] text-zinc-300">Avatar</span>
              </div>
              <div>
                <h3 className="text-white font-medium">Profile Picture</h3>
                <p className="text-sm text-zinc-500">JPG, GIF or PNG. Max size of 5MB.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Display Name</label>
                <input type="text" defaultValue="Maestro Alpha" className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:border-cyan-500 outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">Email Address</label>
                <input type="email" defaultValue="maestro@melodio.ai" readOnly className="w-full bg-black/30 border border-white/5 rounded-xl py-3 px-4 text-zinc-500 cursor-not-allowed outline-none" />
              </div>
            </div>

            <button className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 font-bold text-white text-sm shadow-[0_0_15px_rgba(8,145,178,0.3)]">
              Save Changes
            </button>
          </div>

          {/* Developer API & Integrations */}
          <div className="glass-panel p-8 border border-blue-500/30 bg-blue-950/10">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Code className="w-5 h-5 text-blue-400" /> Developer API & Integrations
            </h2>
            <p className="text-sm text-blue-200/70 mb-6">Connect your Antigravity or Luna Agent directly to the Melodio Dual-Engine Backend.</p>
            
            <div className="mb-6">
              <label className="block text-xs font-medium text-zinc-400 mb-2">Your Secret API Key</label>
              <div className="flex gap-2">
                <input type="password" defaultValue="mk_live_94f8b2...a8c9" readOnly className="flex-1 bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white outline-none font-mono" />
                <button className="px-6 py-3 rounded-xl bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500/50 text-blue-400 font-semibold transition-all">Copy Key</button>
              </div>
            </div>

            <div className="bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden relative">
              <div className="flex justify-between items-center px-4 py-2 bg-black/60 border-b border-white/5">
                <span className="text-xs text-zinc-400 font-mono">Python (Antigravity Agent Snippet)</span>
                <button className="text-xs text-blue-400 flex items-center gap-1 hover:text-white transition-colors"><Copy className="w-3 h-3"/> Copy</button>
              </div>
              <pre className="p-4 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
{`import requests

url = "https://api.melodio.ai/v1/audio/generate"
headers = {"Authorization": "Bearer YOUR_API_KEY"}
payload = {
    "prompt": "Lofi hip hop beats for studying, rain sounds",
    "durationMode": "FULL", # Lyria 3 Pro (3min, ~108 KRW)
    "engine": "LYRIA_3_PRO"
}

response = requests.post(url, json=payload, headers=headers)
print("Generated Audio URL:", response.json().get('audioUrl'))`}
              </pre>
            </div>
          </div>

          {/* Export Data */}
          <div className="glass-panel p-8">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Download className="w-5 h-5 text-zinc-400" /> Export Generation Data
            </h2>
            <p className="text-sm text-zinc-400 mb-6">Download a CSV of all your generated tracks, including stems, prompts, and timestamps.</p>
            <button className="px-6 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-white font-medium text-sm transition-colors">
              Request Export Archive
            </button>
          </div>

          {/* Legal */}
          <div className="glass-panel p-8 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-5 pointer-events-none">
              <Shield className="w-64 h-64" />
            </div>
            
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" /> Legal & Compliance
            </h2>
            
            <div className="space-y-3">
               <a href="#" className="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-lg hover:border-white/20 transition-colors">
                 <span className="text-sm text-zinc-300">Terms of Service (TOS)</span>
                 <span className="text-xs text-purple-400">Read &rarr;</span>
               </a>
               <a href="#" className="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-lg hover:border-white/20 transition-colors">
                 <span className="text-sm text-zinc-300">Privacy Policy</span>
                 <span className="text-xs text-purple-400">Read &rarr;</span>
               </a>
               <a href="#" className="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-lg hover:border-white/20 transition-colors">
                 <span className="text-sm text-zinc-300">Commercial Usage Rights Agreement</span>
                 <span className="text-xs text-purple-400">Read &rarr;</span>
               </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
