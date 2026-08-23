"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  LayoutDashboard, 
  Sparkles, 
  Music4, 
  Film, 
  Rocket,
  CreditCard,
  LogOut,
  X,
  Settings,
  HelpCircle,
  Fingerprint,
  ShieldCheck,
  BarChart3,
  Globe,
  Radio,
  Zap,
  Mic2,
  Workflow,
} from "lucide-react";
import clsx from "clsx";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Artist Incubator", href: "/incubator", icon: Fingerprint },
  { name: "아티스트 페르소나", href: "/persona", icon: Sparkles },
  { name: "뮤직 스튜디오", href: "/style-library", icon: Music4 },
  { name: "프리셋 스튜디오", href: "/audio", icon: Sparkles },
  { name: "Channel Builder", href: "/channel-builder", icon: Workflow },
  { name: "Viral & Trend Zone", href: "/viral", icon: Zap },
  { name: "일본 BGM 스튜디오", href: "/japan", icon: Globe },
  { name: "Longform Studio", href: "/studio", icon: Film },
  { name: "보이스 스튜디오", href: "/voice-lab", icon: Mic2 },
  { name: "YouTube Auto-Pilot", href: "/autopilot", icon: Radio },
  { name: "YouTube Analytics", href: "/analytics", icon: BarChart3 },
  { name: "IP & License Vault", href: "/vault", icon: ShieldCheck },
  { name: "Distribution", href: "/publishing", icon: Rocket },
  { name: "Help Center & FAQ", href: "/help", icon: HelpCircle },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Billing & Subscription", href: "/billing", icon: CreditCard },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function SidebarToggleIcon({ isCollapsed, className }: { isCollapsed: boolean; className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M9 3v18" />
      {!isCollapsed && (
        <path d="M3 6a3 3 0 0 1 3-3h3v18H6a3 3 0 0 1-3-3V6z" fill="currentColor" className="opacity-80" />
      )}
    </svg>
  );
}

export function Sidebar({ isCollapsed, onToggle, isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <aside className={clsx(
      "h-screen border-r border-[rgba(255,255,255,0.05)] bg-[rgba(10,10,14,0.8)] backdrop-blur-xl flex flex-col pt-6 pb-24 fixed top-0 z-40 transition-all duration-300",
      // Desktop positioning
      "md:left-0",
      isCollapsed ? "md:w-20 md:px-2" : "md:w-64 md:px-4",
      // Mobile positioning (drawer)
      "w-64 px-4",
      isMobileOpen ? "left-0 shadow-[0_0_50px_rgba(0,0,0,0.8)]" : "-left-64"
    )}>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pr-2">
        {/* Mobile Header Logo and Close button */}
        <div className="md:hidden flex items-center justify-between px-2 mb-6 border-b border-white/5 pb-4">
          <Link href="/dashboard" className="cursor-pointer" onClick={onMobileClose}>
            <Logo size="sm" showText={true} />
          </Link>
          <button 
            onClick={onMobileClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-1.5 rounded-lg hover:bg-white/5"
            title="Close Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Desktop Header Logo and Toggle button */}
        <div className="hidden md:block">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-4 px-2 mb-6">
              <Link href="/dashboard" className="cursor-pointer">
                <Logo size="sm" showText={false} />
              </Link>
              <button 
                onClick={onToggle}
                className="text-zinc-500 hover:text-zinc-200 transition-colors p-1.5 rounded-lg hover:bg-white/5 opacity-60 hover:opacity-100"
                title="Expand Sidebar"
              >
                <SidebarToggleIcon isCollapsed={true} className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-2 mb-6">
              <Link href="/dashboard" className="cursor-pointer">
                <Logo size="sm" showText={true} />
              </Link>
              <button 
                onClick={onToggle}
                className="text-zinc-500 hover:text-zinc-200 transition-colors p-1.5 rounded-lg hover:bg-white/5 opacity-60 hover:opacity-100"
                title="Collapse Sidebar"
              >
                <SidebarToggleIcon isCollapsed={false} className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <nav className="space-y-1 pb-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onMobileClose}
                className={clsx(
                  "flex items-center rounded-xl transition-all duration-200 group",
                  !isCollapsed && "md:relative",
                  isCollapsed ? "md:justify-center md:p-3 md:h-11 md:w-11 md:mx-auto" : "md:gap-3 md:px-3 md:py-2.5",
                  "gap-3 px-3 py-2.5",
                  isActive 
                    ? "bg-[rgba(255,255,255,0.1)] text-white shadow-[inset_2px_0_0_#c026d3]" 
                    : "text-zinc-400 hover:bg-[rgba(255,255,255,0.05)] hover:text-zinc-200"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className={clsx("font-medium text-sm flex-1", isCollapsed ? "md:hidden" : "inline-block")}>
                  {t(item.name)}
                </span>
                
                {isCollapsed && (
                  <div className="hidden md:block absolute left-20 scale-90 group-hover:scale-100 bg-zinc-950 text-zinc-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50 shadow-2xl border border-white/10 ml-2">
                    {t(item.name)}
                  </div>
                )}
              </Link>
            );
          })}

          <div className="pt-2 my-2 border-t border-white/5">
            <Link 
              href="/login" 
              onClick={onMobileClose}
              className={clsx(
                "flex items-center transition-colors text-zinc-500 hover:text-red-400 hover:bg-white/[0.04] rounded-xl group",
                !isCollapsed && "md:relative",
                isCollapsed ? "md:justify-center md:p-3 md:h-11 md:w-11 md:mx-auto" : "md:gap-3 md:px-3 md:py-2.5",
                "gap-3 px-3 py-2.5"
              )}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <span className={clsx("font-medium text-sm flex-1", isCollapsed ? "md:hidden" : "inline-block")}>
                {t("Log Out")}
              </span>
              {isCollapsed && (
                <div className="hidden md:block absolute left-20 scale-90 group-hover:scale-100 bg-zinc-950 text-red-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 whitespace-nowrap z-50 shadow-2xl border border-white/10 ml-2">
                  {t("Log Out")}
                </div>
              )}
            </Link>
          </div>
        </nav>
      </div>
    </aside>
  );
}
