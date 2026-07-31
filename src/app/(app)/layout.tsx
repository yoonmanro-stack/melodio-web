"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TokenMeter } from "@/components/TokenMeter";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Menu } from "lucide-react";
import clsx from "clsx";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <LanguageProvider>
      {/* Mobile Top Header (h-16, visible below md) */}
      <header className="md:hidden fixed top-0 left-0 w-full h-16 bg-[rgba(10,10,14,0.8)] backdrop-blur-xl border-b border-[rgba(255,255,255,0.05)] z-40 flex items-center px-4 justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMobileOpen(true)}
            className="text-zinc-400 hover:text-zinc-200 p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="text-sm font-semibold tracking-wider text-zinc-200">MELODIO</span>
        </div>
      </header>

      {/* Sidebar Component */}
      <Sidebar 
        isCollapsed={isCollapsed} 
        onToggle={() => setIsCollapsed(!isCollapsed)} 
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
      />

      {/* Mobile Sidebar Backdrop Overlay */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
        />
      )}

      {/* Fixed top container for LanguageSelector and TokenMeter */}
      <div className="fixed top-3 right-4 md:top-6 md:right-8 z-[60] flex items-center gap-2 md:gap-4 scale-90 md:scale-100 origin-right">
        <LanguageSelector />
        <TokenMeter />
      </div>

      <main className={clsx(
        "h-screen overflow-y-auto overflow-x-hidden no-scrollbar w-full relative z-10 transition-all duration-300",
        // Mobile default padding (symmetrical left/right spacing)
        "pl-2 pr-2 pt-20 pb-4",
        // Desktop padding overrides
        isCollapsed ? "md:pl-20" : "md:pl-64",
        "md:pr-8 md:pt-8 md:pb-8",
        isCollapsed ? "sidebar-collapsed-content" : ""
      )}>
        {children}
      </main>
    </LanguageProvider>
  );
}
