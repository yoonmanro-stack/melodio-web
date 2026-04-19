import { ShieldCheck } from "lucide-react";

export default function VaultPage() {
  return (
    <div className="flex flex-col gap-8 h-full">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-400 to-cyan-400">
          IP & License Vault
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-3xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] backdrop-blur-xl">
        <ShieldCheck className="w-16 h-16 text-cyan-400/50 mb-6" />
        <h2 className="text-2xl font-bold text-white mb-2">Secure Your AI Genesis</h2>
        <p className="text-zinc-400 max-w-md text-center">
          All audio stems and tracks generated through Melodio are vaulted here. 
          Download your official Pro License Certificates to ensure 100% copyright safety.
        </p>
      </div>
    </div>
  );
}
