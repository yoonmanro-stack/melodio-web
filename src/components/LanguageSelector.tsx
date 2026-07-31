"use client";

import { useLanguage, Language } from "@/contexts/LanguageContext";
import { Globe, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages: { key: Language; label: string; flag: string }[] = [
    { key: "ko", label: "한국어", flag: "🇰🇷" },
    { key: "en", label: "English", flag: "🇺🇸" },
    { key: "ja", label: "日本語", flag: "🇯🇵" },
    { key: "es", label: "Español", flag: "🇪🇸" },
    { key: "fr", label: "Français", flag: "🇫🇷" },
    { key: "de", label: "Deutsch", flag: "🇩🇪" },
    { key: "pt", label: "Português", flag: "🇧🇷" },
    { key: "zh", label: "中文", flag: "🇨🇳" },
    { key: "it", label: "Italiano", flag: "🇮🇹" },
    { key: "hi", label: "हिन्दी", flag: "🇮🇳" },
  ];

  const currentLang = languages.find((l) => l.key === language) || languages[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative z-[70]">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-black/40 border border-fuchsia-500/20 hover:border-fuchsia-500/50 hover:bg-black/60 backdrop-blur-xl transition-all duration-300 shadow-[0_0_15px_-3px_rgba(192,38,211,0.1)] text-zinc-300 hover:text-white text-xs font-semibold"
      >
        <Globe className="w-4 h-4 text-fuchsia-400" />
        <span>{currentLang.flag} {currentLang.label}</span>
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-44 max-h-[450px] overflow-y-auto no-scrollbar rounded-2xl bg-[rgba(10,10,14,0.95)] border border-white/10 p-1.5 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.5),0_0_15px_rgba(192,38,211,0.1)] backdrop-blur-2xl"
          >
            {languages.map((lang) => (
              <button
                key={lang.key}
                onClick={() => {
                  setLanguage(lang.key);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-medium transition-all ${
                  language === lang.key
                    ? "bg-fuchsia-600/20 text-fuchsia-300"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </div>
                {language === lang.key && <Check className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
