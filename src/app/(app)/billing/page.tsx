import { CreditCard } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-8 h-full">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-400 to-cyan-400">
          Billing & Workspace
        </h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-3xl border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] backdrop-blur-xl">
        <CreditCard className="w-16 h-16 text-fuchsia-400/50 mb-6" />
        <h2 className="text-2xl font-bold text-white mb-2">Token Exhausted? Recharge Here.</h2>
        <p className="text-zinc-400 max-w-md text-center">
          Manage your Stripe subscription, view hard-capped credit limits, 
          and upgrade to Pro for unthrottled stem separation API access.
        </p>
      </div>
    </div>
  );
}
