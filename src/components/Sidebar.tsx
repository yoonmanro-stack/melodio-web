"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Sparkles, 
  Music4, 
  Film, 
  Rocket,
  CreditCard,
  LogOut,
  Hexagon,
  Settings,
  HelpCircle,
  Fingerprint,
  ShieldCheck
} from "lucide-react";
import clsx from "clsx";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Artist Incubator", href: "/incubator", icon: Fingerprint },
  { name: "Persona Lab", href: "/persona", icon: Sparkles },
  { name: "Audio Forge", href: "/audio", icon: Music4 },
  { name: "Longform Studio", href: "/studio", icon: Film },
  { name: "IP & License Vault", href: "/vault", icon: ShieldCheck },
  { name: "Distribution", href: "/publishing", icon: Rocket },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-screen border-r border-[rgba(255,255,255,0.05)] bg-[rgba(10,10,14,0.6)] backdrop-blur-xl flex flex-col justify-between py-6 px-4 absolute left-0 top-0 z-50">
      <div>
        <Link href="/dashboard" className="flex items-center gap-3 px-2 mb-10 cursor-pointer">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-600 to-cyan-400 flex items-center justify-center shadow-[0_0_15px_rgba(192,38,211,0.5)]">
            <Hexagon className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-wider text-white">MELODIO</span>
        </Link>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                  isActive 
                    ? "bg-[rgba(255,255,255,0.1)] text-white shadow-[inset_2px_0_0_#c026d3]" 
                    : "text-zinc-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-zinc-200"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2 border-t border-[rgba(255,255,255,0.05)] pt-4">
        <Link href="/help" className="w-full flex items-center justify-start gap-3 px-4 py-3 rounded-xl transition-colors text-zinc-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-zinc-200">
          <HelpCircle className="w-5 h-5" />
          <span className="font-medium text-sm">Help Center & FAQ</span>
        </Link>
        <Link href="/settings" className="w-full flex items-center justify-start gap-3 px-4 py-3 rounded-xl transition-colors text-zinc-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-zinc-200">
          <Settings className="w-5 h-5" />
          <span className="font-medium text-sm">Settings</span>
        </Link>
        <Link href="/billing" className="w-full flex items-center justify-start gap-3 px-4 py-3 rounded-xl transition-colors text-zinc-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-zinc-200">
          <CreditCard className="w-5 h-5" />
          <span className="font-medium text-sm">Billing</span>
        </Link>
        <Link href="/login" className="w-full flex items-center justify-start gap-3 px-4 py-3 rounded-xl transition-colors text-zinc-500 hover:text-red-400">
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Sign Out</span>
        </Link>
      </div>
    </aside>
  );
}
