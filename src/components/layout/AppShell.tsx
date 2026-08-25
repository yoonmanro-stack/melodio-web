"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TokenMeter } from "@/components/TokenMeter";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { LanguageSelector } from "@/components/LanguageSelector";
import { VoiceProvider } from "@/contexts/VoiceContext";
import { VoiceModal } from "@/components/voice/VoiceModal";
import { CreateVoiceModal } from "@/components/voice/CreateVoiceModal";
import { PlaylistPlaybackProvider } from "@/contexts/PlaylistPlaybackContext";
import { Menu } from "lucide-react";
import clsx from "clsx";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (!isMobileOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMobileOpen]);

  return (
    <LanguageProvider>
      <VoiceProvider>
        <PlaylistPlaybackProvider>
          <header className="md:hidden fixed top-0 left-0 w-full h-16 bg-[rgba(10,10,14,0.8)] backdrop-blur-xl border-b border-[rgba(255,255,255,0.05)] z-40 flex items-center px-4 justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMobileOpen(true)}
                className="text-zinc-400 hover:text-zinc-200 p-2 rounded-lg hover:bg-white/5 transition-colors"
                aria-label="Open navigation"
                aria-controls="app-navigation"
                aria-expanded={isMobileOpen}
              >
                <Menu className="w-6 h-6" />
              </button>
              <span className="text-sm font-semibold tracking-wider text-zinc-200">MELODIO</span>
            </div>
          </header>

          <Sidebar
            isCollapsed={isCollapsed}
            onToggle={() => setIsCollapsed((value) => !value)}
            isMobileOpen={isMobileOpen}
            onMobileClose={() => setIsMobileOpen(false)}
          />

          {isMobileOpen ? (
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setIsMobileOpen(false)}
              className="md:hidden fixed inset-0 z-[70] cursor-default bg-black/60 backdrop-blur-sm transition-opacity duration-300"
            />
          ) : null}

          <div className="fixed top-3 right-4 md:top-6 md:right-8 z-[60] flex items-center gap-2 md:gap-3 scale-90 md:scale-100 origin-right">
            <LanguageSelector />
            <TokenMeter />
          </div>

          <main className={clsx(
            "h-screen overflow-y-auto overflow-x-hidden no-scrollbar w-full relative transition-all duration-300",
            "pl-2 pr-2 pt-20 pb-28",
            isCollapsed ? "md:pl-20" : "md:pl-64",
            "md:pr-8 md:pt-8 md:pb-28",
            isCollapsed ? "sidebar-collapsed-content" : ""
          )}>
            {children}
          </main>

          <VoiceModal />
          <CreateVoiceModal />
        </PlaylistPlaybackProvider>
      </VoiceProvider>
    </LanguageProvider>
  );
}
