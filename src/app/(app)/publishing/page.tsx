"use client";

import { useState } from "react";
import {
  MonitorPlay, Calendar, Globe, Share2, Type, Hash,
  Sparkles, Copy, Check, RefreshCw, Languages, Clock,
  ChevronDown, Video, Music2
} from "lucide-react";

const LANG_OPTIONS = [
  { code: "ko", label: "🇰🇷 한국어" },
  { code: "ja", label: "🇯🇵 日本語" },
  { code: "en", label: "🇺🇸 English" },
  { code: "zh", label: "🇨🇳 中文" },
  { code: "es", label: "🇪🇸 Español" },
  { code: "pt", label: "🇧🇷 Português" },
  { code: "fr", label: "🇫🇷 Français" },
  { code: "de", label: "🇩🇪 Deutsch" },
  { code: "th", label: "🇹🇭 ภาษาไทย" },
  { code: "vi", label: "🇻🇳 Tiếng Việt" },
];

const TITLE_PRESETS: Record<string, string[]> = {
  ko: [
    "【새벽 감성】 비오는 밤 듣기 좋은 Lo-Fi 음악 🌧️",
    "자면서 듣는 Lo-Fi / 공부할 때 들으면 집중되는 음악 ☕",
  ],
  ja: [
    "【24/7】深夜の東京: 眠れない夜の雨音とLo-Fi ☔️",
    "作業用BGM / 集中できるLo-Fiヒップホップ 🎧",
  ],
  en: [
    "Late Night Tokyo Rain: Lofi Hip Hop for Sleep & Study 🌙",
    "24/7 Chill Beats to Relax / Focus — Lo-Fi Hip Hop Radio",
  ],
  zh: [
    "深夜城市Lo-Fi | 适合学习和放松的音乐 🏙️",
    "【24小时】专注学习音乐 / Lo-Fi Hip Hop电台",
  ],
  es: [
    "Lo-Fi Hip Hop para Estudiar y Relajarse 🎵 — Lluvia de Tokio",
    "Música para Concentrarse: Lo-Fi Beats 24/7 ☕",
  ],
  pt: ["Lo-Fi Hip Hop para Estudar — Noite de Tóquio 🌃", "Música Lo-Fi para Relaxar e Focar 24/7"],
  fr: ["Lo-Fi Hip Hop pour Étudier et Se Détendre 🌙 Tokyo", "Musique Lo-Fi 24/7 — Concentrez-vous"],
  de: ["Lo-Fi Hip Hop zum Lernen und Entspannen 🎧 Tokio Nacht", "24/7 Chill Beats zum Fokussieren"],
  th: ["เพลง Lo-Fi เพื่อการเรียนและผ่อนคลาย 🌙", "Lo-Fi Hip Hop 24 ชั่วโมง"],
  vi: ["Nhạc Lo-Fi để Học Bài và Thư Giãn 🌃 Tokyo", "Lo-Fi Hip Hop 24/7 — Tập Trung Học"],
};

const DESC_TEMPLATE = `Welcome to Melodio — your AI Music Label destination.

🎵 Track List:
00:00 — Midnight Protocol
03:42 — Neon Puddles  
06:15 — Synthetic Dreams
10:02 — Coffee & Code
14:30 — Rain on Glass
18:00 — Tokyo Drift
22:45 — Infinite Loop

🎧 Perfect for: studying, working late, relaxing, coding

━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Follow Melodio:
▶ YouTube: @MelodioAI
📷 Instagram: @melodio.ai
🎵 TikTok: @melodioai
━━━━━━━━━━━━━━━━━━━━━━━━━━━
© Melodio AI Music Label | Copyright-Free ✅`;

const TAG_SETS: Record<string, string[]> = {
  ko: ["#로파이", "#공부음악", "#작업음악", "#집중음악", "#새벽감성", "#lofi", "#chill", "#bgm"],
  ja: ["#作業用BGM", "#勉強用", "#LoFi", "#深夜", "#睡眠用BGM", "#集中できる音楽", "#chill"],
  en: ["#lofi", "#lofihiphop", "#studymusic", "#chillbeats", "#relaxingmusic", "#focus", "#24_7lofi"],
  zh: ["#学习音乐", "#专注音乐", "#LoFi", "#放松音乐", "#深夜音乐"],
  es: ["#lofi", "#musicaparaestudiar", "#relajante", "#chillbeats"],
  pt: ["#lofi", "#musicaparaestudar", "#relaxante", "#foco"],
  fr: ["#lofi", "#musiquepouretudier", "#relaxation", "#concentration"],
  de: ["#lofi", "#lernmusik", "#entspannung", "#konzentration"],
  th: ["#lofi", "#เพลงเรียน", "#ผ่อนคลาย"],
  vi: ["#lofi", "#nhachocbai", "#thugiãn"],
};

export default function Publishing() {
  const [activeLang, setActiveLang] = useState("ko");
  const [selectedTitle, setSelectedTitle] = useState(0);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedDesc, setCopiedDesc] = useState(false);
  const [copiedTags, setCopiedTags] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const currentTitles = TITLE_PRESETS[activeLang] || TITLE_PRESETS["en"];
  const currentTags = TAG_SETS[activeLang] || TAG_SETS["en"];

  const handleCopy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 1800);
  };

  return (
    <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col">
      <header className="mb-6">
        <h1 className="text-4xl font-bold text-white mb-2">Publishing & SEO</h1>
        <p className="text-zinc-400">YouTube SEO 자동생성 · 다국어 번역 · 예약 업로드 원클릭 파이프라인</p>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-10">

        {/* ── 좌측: SEO Meta Forge ── */}
        <div className="glass-panel flex flex-col p-6 overflow-y-auto max-h-[80vh]">
          <div className="flex items-center justify-between mb-5 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-fuchsia-400" />
              <h2 className="text-xl font-semibold text-white">Global SEO Forge</h2>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 text-xs font-bold rounded-lg hover:bg-fuchsia-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isGenerating ? "animate-spin" : ""}`} />
              {isGenerating ? "생성 중..." : "전체 재생성"}
            </button>
          </div>

          <div className="space-y-5">

            {/* 언어 선택 */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-400 mb-2">
                <Languages className="w-3.5 h-3.5 text-cyan-400" /> 타겟 언어 선택
              </label>
              <div className="flex flex-wrap gap-1.5">
                {LANG_OPTIONS.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => { setActiveLang(lang.code); setSelectedTitle(0); }}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                      activeLang === lang.code
                        ? "bg-fuchsia-500/20 border-fuchsia-500/60 text-fuchsia-200 shadow-[0_0_8px_rgba(192,38,211,0.2)]"
                        : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 제목 생성 */}
            <div className="bg-black/30 p-4 rounded-xl border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <Type className="w-4 h-4 text-fuchsia-500" /> Viral Title
                </label>
                <button
                  onClick={() => handleCopy(currentTitles[selectedTitle], setCopiedTitle)}
                  className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-fuchsia-500/10 border border-white/10 hover:border-fuchsia-500/30 text-zinc-400 hover:text-fuchsia-300 text-[10px] rounded-lg transition-all"
                >
                  {copiedTitle ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedTitle ? "복사됨!" : "복사"}
                </button>
              </div>
              <div className="space-y-2">
                {currentTitles.map((title, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedTitle(i)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedTitle === i
                        ? "bg-fuchsia-900/20 border-fuchsia-500/40"
                        : "bg-black/40 border-white/5 hover:border-white/15"
                    }`}
                  >
                    <p className="text-sm text-white">{title}</p>
                    <span className={`text-[10px] mt-1 block ${selectedTitle === i ? "text-fuchsia-400" : "text-zinc-600"}`}>
                      {selectedTitle === i ? "✓ 선택됨" : "클릭해서 선택"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 설명 & 챕터 */}
            <div className="bg-black/30 p-4 rounded-xl border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <Music2 className="w-4 h-4 text-cyan-500" /> Description & Chapters
                </label>
                <button
                  onClick={() => handleCopy(DESC_TEMPLATE, setCopiedDesc)}
                  className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-500/30 text-zinc-400 hover:text-cyan-300 text-[10px] rounded-lg transition-all"
                >
                  {copiedDesc ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedDesc ? "복사됨!" : "복사"}
                </button>
              </div>
              <div className="p-3 bg-black/50 rounded-lg border border-white/5 h-36 overflow-y-auto">
                <p className="text-xs text-zinc-400 leading-relaxed font-mono whitespace-pre-wrap">{DESC_TEMPLATE}</p>
              </div>
            </div>

            {/* 해시태그 */}
            <div className="bg-black/30 p-4 rounded-xl border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                  <Hash className="w-4 h-4 text-purple-500" /> Optimized Tags
                </label>
                <button
                  onClick={() => handleCopy(currentTags.join(" "), setCopiedTags)}
                  className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-purple-500/10 border border-white/10 hover:border-purple-500/30 text-zinc-400 hover:text-purple-300 text-[10px] rounded-lg transition-all"
                >
                  {copiedTags ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedTags ? "복사됨!" : "전체 복사"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentTags.map((tag) => (
                  <span key={tag} className="px-3 py-1 bg-purple-900/30 border border-purple-500/30 text-purple-200 text-xs rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── 우측: Dispatch Hub ── */}
        <div className="glass-panel flex flex-col p-6">
          <div className="flex items-center gap-2 mb-5 border-b border-white/10 pb-4">
            <Video className="w-5 h-5 text-red-500" />
            <h2 className="text-xl font-semibold text-white">Dispatch Hub</h2>
          </div>

          <div className="flex-1 space-y-5">

            {/* 소스 파일 */}
            <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <span className="block text-xs text-zinc-400 font-medium mb-1">Source Material</span>
                <span className="block text-[11px] text-zinc-600">Auto-generated via Studio Timeline</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="px-3 py-1 bg-cyan-900/40 text-cyan-400 text-[10px] font-bold rounded border border-cyan-500/30">💻 16:9 Longform MV (03:42)</span>
                <span className="px-3 py-1 bg-fuchsia-900/40 text-fuchsia-400 text-[10px] font-bold rounded border border-fuchsia-500/30">📱 9:16 Shorts Hook (00:59)</span>
              </div>
            </div>

            {/* 채널 선택 */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Target YouTube Channel</label>
              <div className="flex items-center gap-3 bg-black/50 border border-white/10 rounded-xl p-3 hover:border-white/20 transition-colors cursor-pointer">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-600 to-pink-600 flex items-center justify-center flex-shrink-0">
                  <Video className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-white">Neon Records (Official)</p>
                  <p className="text-[10px] text-zinc-500">125K Subscribers · Connected ✅</p>
                </div>
                <ChevronDown className="w-4 h-4 text-zinc-600" />
              </div>
            </div>

            {/* 공개 범위 */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Visibility</label>
              <div className="grid grid-cols-3 gap-2">
                {(["public", "unlisted", "private"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                      visibility === v
                        ? "bg-blue-600/20 border-blue-500/60 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.15)]"
                        : "bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
                    }`}
                  >
                    {v === "public" ? "🌐 Public" : v === "unlisted" ? "🔗 Unlisted" : "🔒 Private"}
                  </button>
                ))}
              </div>
            </div>

            {/* 예약 업로드 */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Schedule Upload</label>
              <div
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className="bg-black/50 border border-white/10 rounded-xl p-4 flex justify-between items-center cursor-pointer hover:border-white/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-zinc-400" />
                  <div>
                    <p className="text-sm text-white">예약 업로드</p>
                    <p className="text-[11px] text-zinc-500">{scheduleEnabled ? "Friday, Apr 25 · 18:00 (KST)" : "즉시 업로드"}</p>
                  </div>
                </div>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${scheduleEnabled ? "bg-cyan-500" : "bg-white/10"}`}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${scheduleEnabled ? "right-0.5" : "left-0.5"}`} />
                </div>
              </div>
              {scheduleEnabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input type="date" className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 outline-none focus:border-cyan-500/50" />
                  <input type="time" className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-300 outline-none focus:border-cyan-500/50" />
                </div>
              )}
            </div>

            {/* 크로스 플랫폼 */}
            <div className="p-4 rounded-xl bg-gradient-to-b from-fuchsia-900/20 to-transparent border border-fuchsia-500/20">
              <label className="flex items-center gap-2 text-sm font-semibold text-fuchsia-300 mb-2">
                <Share2 className="w-4 h-4" /> Cross-Platform Auto-Dispatch
              </label>
              <p className="text-xs text-zinc-400 mb-3">YouTube 업로드 완료 시 9:16 쇼츠를 자동 배포합니다.</p>
              <div className="flex gap-2">
                <span className="px-2.5 py-1 bg-black/50 text-[#ff0050] text-[10px] font-bold rounded border border-white/5">TikTok</span>
                <span className="px-2.5 py-1 bg-black/50 text-[#E1306C] text-[10px] font-bold rounded border border-white/5">Instagram Reels</span>
                <span className="px-2.5 py-1 bg-black/50 text-[#FF0000] text-[10px] font-bold rounded border border-white/5">YT Shorts</span>
              </div>
            </div>
          </div>

          <button className="w-full py-4 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all font-bold text-white flex justify-center items-center gap-2 mt-5">
            <Sparkles className="w-5 h-5" />
            {scheduleEnabled ? "예약 업로드 설정" : "지금 바로 업로드"}
          </button>
        </div>
      </div>
    </div>
  );
}
