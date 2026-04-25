"use client";

import { useState, useMemo } from "react";
import { Search, Copy, Check, BookmarkPlus, Music2, Zap, Waves, Mic2, Guitar, Drum } from "lucide-react";

// ──────────────────────────────────────────────
// 스타일 데이터베이스 (실제 Suno/Lyria 호환 태그)
// ──────────────────────────────────────────────
const GENRES = [
  "All", "Electronic", "Hip Hop", "Pop", "R&B / Soul", "Rock", "Jazz", "Classical",
  "Lo-Fi", "Ambient", "Folk / Acoustic", "K-Pop", "Latin", "Reggae", "Metal", "Punk",
  "Funk", "Gospel", "Country", "Blues", "World Music", "Cinematic",
];

const MOODS = ["All", "Dark", "Uplifting", "Chill", "Energetic", "Romantic", "Aggressive", "Dreamy", "Epic", "Nostalgic", "Mysterious", "Playful"];

const STYLE_DATA = [
  // ── Electronic ──
  { id: 1, name: "Dark Synthwave", genre: "Electronic", mood: "Dark", bpm: "90–110", vocal: "Female Whisper", tags: "dark synthwave, retrofuturistic, analog synth, reverb, neon noir", color: "from-purple-900 to-indigo-900", accent: "purple" },
  { id: 2, name: "Cyberpunk Bass", genre: "Electronic", mood: "Aggressive", bpm: "130–145", vocal: "Male Distorted", tags: "cyberpunk, heavy bass, industrial, glitch, dystopian electronic", color: "from-cyan-900 to-blue-900", accent: "cyan" },
  { id: 3, name: "Chillwave Drift", genre: "Electronic", mood: "Chill", bpm: "70–90", vocal: "Soft Male", tags: "chillwave, lo-fi electronic, dreamy synth pads, slow groove", color: "from-teal-900 to-emerald-900", accent: "teal" },
  { id: 4, name: "Future Bass Anthem", genre: "Electronic", mood: "Uplifting", bpm: "145–160", vocal: "Female High", tags: "future bass, festival anthem, euphoric drop, supersaws, emotional build", color: "from-pink-900 to-fuchsia-900", accent: "pink" },
  { id: 5, name: "Vaporwave Nostalgia", genre: "Electronic", mood: "Nostalgic", bpm: "75–95", vocal: "Pitched Down", tags: "vaporwave, slowed and reverbed, 80s aesthetic, dreamy, mall music", color: "from-violet-900 to-pink-900", accent: "violet" },
  { id: 6, name: "Techno Pulse", genre: "Electronic", mood: "Energetic", bpm: "130–145", vocal: "No Vocal", tags: "berlin techno, dark club, 4/4 kick, industrial percussion, hypnotic loop", color: "from-gray-900 to-zinc-900", accent: "gray" },
  { id: 7, name: "EDM Festival Drop", genre: "Electronic", mood: "Energetic", bpm: "128–138", vocal: "Female Powerful", tags: "progressive house, festival EDM, epic build, euphoric drop, hands-up anthem", color: "from-orange-900 to-yellow-900", accent: "orange" },

  // ── Lo-Fi ──
  { id: 8, name: "Late Night Lo-Fi", genre: "Lo-Fi", mood: "Chill", bpm: "65–80", vocal: "No Vocal", tags: "lo-fi hip hop, vinyl crackle, jazz chords, rain ambience, cozy night", color: "from-amber-900 to-orange-900", accent: "amber" },
  { id: 9, name: "Rainy Day Study", genre: "Lo-Fi", mood: "Nostalgic", bpm: "60–75", vocal: "No Vocal", tags: "lo-fi study beats, soft piano, cassette tape, warm bassline, peaceful", color: "from-blue-900 to-slate-900", accent: "blue" },

  // ── Hip Hop ──
  { id: 10, name: "Trap Darkness", genre: "Hip Hop", mood: "Dark", bpm: "140–160", vocal: "Male Rap", tags: "dark trap, 808 bass, hi-hat rolls, menacing atmosphere, drill influence", color: "from-red-900 to-rose-900", accent: "red" },
  { id: 11, name: "Boom Bap Classic", genre: "Hip Hop", mood: "Nostalgic", bpm: "85–100", vocal: "Male Rap", tags: "boom bap, sample-based, east coast hip hop, jazz samples, golden era", color: "from-yellow-900 to-amber-900", accent: "yellow" },
  { id: 12, name: "Cloud Rap Haze", genre: "Hip Hop", mood: "Dreamy", bpm: "130–145", vocal: "Auto-Tune Male", tags: "cloud rap, ethereal trap, atmospheric, spacey, melodic ad-libs", color: "from-indigo-900 to-purple-900", accent: "indigo" },
  { id: 13, name: "K-Hip Hop Flex", genre: "Hip Hop", mood: "Energetic", bpm: "120–135", vocal: "Male Korean", tags: "Korean hip hop, swag, fashion flex, modern trap, Seoul underground", color: "from-lime-900 to-green-900", accent: "lime" },

  // ── Pop ──
  { id: 14, name: "K-Pop Summer Bop", genre: "K-Pop", mood: "Uplifting", bpm: "115–130", vocal: "Female Group", tags: "K-pop, catchy hook, bright synths, dance pop, idol concept, summer vibe", color: "from-fuchsia-900 to-pink-900", accent: "fuchsia" },
  { id: 15, name: "Indie Pop Daydream", genre: "Pop", mood: "Dreamy", bpm: "90–110", vocal: "Female Breathy", tags: "indie pop, bedroom pop, guitar jangle, reverb vocals, coming-of-age", color: "from-rose-900 to-orange-900", accent: "rose" },
  { id: 16, name: "Synth Pop 80s Revival", genre: "Pop", mood: "Nostalgic", bpm: "110–125", vocal: "Male Melodic", tags: "synth pop, 80s revival, new wave, driving bassline, chorus reverb", color: "from-violet-900 to-fuchsia-900", accent: "violet" },
  { id: 17, name: "Dark Pop Anthem", genre: "Pop", mood: "Dark", bpm: "100–120", vocal: "Female Powerful", tags: "dark pop, haunting melody, cinematic drops, emotional intensity, introspective", color: "from-slate-900 to-purple-900", accent: "slate" },

  // ── R&B / Soul ──
  { id: 18, name: "Neo-Soul Groove", genre: "R&B / Soul", mood: "Romantic", bpm: "75–95", vocal: "Female Warm", tags: "neo-soul, smooth groove, live instruments, soulful, late night vibes", color: "from-amber-900 to-rose-900", accent: "amber" },
  { id: 19, name: "Contemporary R&B", genre: "R&B / Soul", mood: "Romantic", bpm: "85–105", vocal: "Female Sultry", tags: "contemporary R&B, trap soul, auto-tune, slow jam, 808 bass, atmospheric", color: "from-purple-900 to-rose-900", accent: "purple" },

  // ── Jazz ──
  { id: 20, name: "Midnight Jazz Club", genre: "Jazz", mood: "Mysterious", bpm: "90–120", vocal: "Male Jazz", tags: "jazz, upright bass, brushed drums, smoky atmosphere, bebop chord changes", color: "from-zinc-900 to-stone-900", accent: "zinc" },
  { id: 21, name: "Nu-Jazz Electronica", genre: "Jazz", mood: "Chill", bpm: "90–110", vocal: "Female Scat", tags: "nu-jazz, electronic jazz, rhodes piano, smooth, urban, chill vibes", color: "from-sky-900 to-teal-900", accent: "sky" },

  // ── Cinematic ──
  { id: 22, name: "Epic Orchestral Rise", genre: "Cinematic", mood: "Epic", bpm: "60–80", vocal: "Choir", tags: "cinematic orchestral, epic brass, string swell, trailer music, powerful build", color: "from-red-900 to-orange-900", accent: "red" },
  { id: 23, name: "Dark Thriller Score", genre: "Cinematic", mood: "Mysterious", bpm: "70–90", vocal: "No Vocal", tags: "thriller score, dark ambience, tension strings, percussive hits, suspenseful", color: "from-slate-900 to-gray-900", accent: "slate" },
  { id: 24, name: "Emotional Piano Film", genre: "Cinematic", mood: "Nostalgic", bpm: "60–80", vocal: "No Vocal", tags: "emotional piano, cinematic, string accompaniment, heartfelt, filmic, delicate", color: "from-blue-900 to-indigo-900", accent: "blue" },

  // ── Ambient ──
  { id: 25, name: "Space Ambient Float", genre: "Ambient", mood: "Dreamy", bpm: "50–70", vocal: "No Vocal", tags: "space ambient, cosmic soundscape, deep pads, zero gravity, meditative", color: "from-indigo-900 to-blue-900", accent: "indigo" },
  { id: 26, name: "Nature Meditation", genre: "Ambient", mood: "Chill", bpm: "55–75", vocal: "No Vocal", tags: "nature ambient, healing frequencies, binaural, forest sounds, meditation", color: "from-green-900 to-emerald-900", accent: "green" },

  // ── Rock / Metal ──
  { id: 27, name: "Alternative Rock Anthem", genre: "Rock", mood: "Energetic", bpm: "115–135", vocal: "Male Grunge", tags: "alternative rock, distorted guitar, anthemic chorus, energetic, stadium rock", color: "from-orange-900 to-red-900", accent: "orange" },
  { id: 28, name: "Post-Rock Crescendo", genre: "Rock", mood: "Epic", bpm: "90–120", vocal: "No Vocal", tags: "post-rock, dynamic crescendo, delay guitar, emotional build, instrumental", color: "from-stone-900 to-amber-900", accent: "stone" },

  // ── Folk / Acoustic ──
  { id: 29, name: "Indie Folk Sunrise", genre: "Folk / Acoustic", mood: "Uplifting", bpm: "85–105", vocal: "Female Warm", tags: "indie folk, acoustic guitar, fingerpicking, warm vocals, americana, hopeful", color: "from-yellow-900 to-lime-900", accent: "yellow" },
  { id: 30, name: "Dark Americana", genre: "Folk / Acoustic", mood: "Mysterious", bpm: "70–90", vocal: "Male Deep", tags: "dark americana, southern gothic, banjo, slide guitar, haunting vocals", color: "from-stone-900 to-red-900", accent: "stone" },

  // ── Latin / World ──
  { id: 31, name: "Reggaeton Club", genre: "Latin", mood: "Energetic", bpm: "90–100", vocal: "Male Spanish", tags: "reggaeton, dembow rhythm, perreo, urban latino, club banger", color: "from-yellow-900 to-orange-900", accent: "yellow" },
  { id: 32, name: "Afrobeats Wave", genre: "World Music", mood: "Uplifting", bpm: "100–115", vocal: "Male African", tags: "afrobeats, percussion groove, highlife influence, dance, vibrant, Lagos sound", color: "from-green-900 to-yellow-900", accent: "green" },
];

const ACCENT_CLASSES: Record<string, string> = {
  purple: "border-purple-500/40 hover:border-purple-400/70 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]",
  cyan: "border-cyan-500/40 hover:border-cyan-400/70 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]",
  teal: "border-teal-500/40 hover:border-teal-400/70 hover:shadow-[0_0_20px_rgba(20,184,166,0.2)]",
  pink: "border-pink-500/40 hover:border-pink-400/70 hover:shadow-[0_0_20px_rgba(236,72,153,0.2)]",
  violet: "border-violet-500/40 hover:border-violet-400/70 hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]",
  gray: "border-gray-500/40 hover:border-gray-400/70 hover:shadow-[0_0_20px_rgba(156,163,175,0.2)]",
  orange: "border-orange-500/40 hover:border-orange-400/70 hover:shadow-[0_0_20px_rgba(249,115,22,0.2)]",
  amber: "border-amber-500/40 hover:border-amber-400/70 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]",
  blue: "border-blue-500/40 hover:border-blue-400/70 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]",
  red: "border-red-500/40 hover:border-red-400/70 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]",
  yellow: "border-yellow-500/40 hover:border-yellow-400/70 hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]",
  indigo: "border-indigo-500/40 hover:border-indigo-400/70 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]",
  lime: "border-lime-500/40 hover:border-lime-400/70 hover:shadow-[0_0_20px_rgba(132,204,22,0.2)]",
  fuchsia: "border-fuchsia-500/40 hover:border-fuchsia-400/70 hover:shadow-[0_0_20px_rgba(217,70,239,0.2)]",
  rose: "border-rose-500/40 hover:border-rose-400/70 hover:shadow-[0_0_20px_rgba(244,63,94,0.2)]",
  slate: "border-slate-500/40 hover:border-slate-400/70 hover:shadow-[0_0_20px_rgba(100,116,139,0.2)]",
  zinc: "border-zinc-500/40 hover:border-zinc-400/70 hover:shadow-[0_0_20px_rgba(113,113,122,0.2)]",
  sky: "border-sky-500/40 hover:border-sky-400/70 hover:shadow-[0_0_20px_rgba(14,165,233,0.2)]",
  green: "border-green-500/40 hover:border-green-400/70 hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]",
  stone: "border-stone-500/40 hover:border-stone-400/70 hover:shadow-[0_0_20px_rgba(120,113,108,0.2)]",
};

export default function StyleLibraryPage() {
  const [search, setSearch] = useState("");
  const [activeGenre, setActiveGenre] = useState("All");
  const [activeMood, setActiveMood] = useState("All");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [selectedStyle, setSelectedStyle] = useState<typeof STYLE_DATA[0] | null>(null);

  const filtered = useMemo(() => {
    return STYLE_DATA.filter((s) => {
      const matchGenre = activeGenre === "All" || s.genre === activeGenre;
      const matchMood = activeMood === "All" || s.mood === activeMood;
      const matchSearch = search === "" ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.tags.toLowerCase().includes(search.toLowerCase()) ||
        s.genre.toLowerCase().includes(search.toLowerCase());
      return matchGenre && matchMood && matchSearch;
    });
  }, [search, activeGenre, activeMood]);

  const handleCopy = (style: typeof STYLE_DATA[0]) => {
    navigator.clipboard.writeText(style.tags);
    setCopiedId(style.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = (id: number) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-7xl mx-auto pt-4 pb-16">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(192,38,211,0.4)]">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white">Style Library</h1>
        </div>
        <p className="text-zinc-400 ml-13">
          {STYLE_DATA.length}개 큐레이션 스타일 태그 — 클릭 한 번으로 복사해서 바로 사용하세요.
        </p>
      </header>

      {/* Search + Stats Bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="스타일, 장르, 태그 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-fuchsia-500/50 transition-colors placeholder:text-zinc-600"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Zap className="w-4 h-4 text-fuchsia-400" />
          <span className="text-white font-semibold">{filtered.length}</span>
          <span>스타일 표시 중</span>
        </div>
        {savedIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-xl text-xs text-fuchsia-300">
            <BookmarkPlus className="w-3.5 h-3.5" />
            {savedIds.size}개 저장됨
          </div>
        )}
      </div>

      {/* Genre Filter */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Guitar className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">장르</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGenre(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                activeGenre === g
                  ? "bg-fuchsia-500/20 border-fuchsia-500/60 text-fuchsia-300 shadow-[0_0_10px_rgba(192,38,211,0.2)]"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Mood Filter */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Waves className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">무드</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              onClick={() => setActiveMood(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                activeMood === m
                  ? "bg-purple-500/20 border-purple-500/60 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                  : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Style Cards Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-zinc-600">
          <Music2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>검색 결과가 없습니다. 다른 키워드를 시도해보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((style) => (
            <div
              key={style.id}
              onClick={() => setSelectedStyle(selectedStyle?.id === style.id ? null : style)}
              className={`relative rounded-2xl border bg-black/40 backdrop-blur-sm cursor-pointer transition-all duration-200 overflow-hidden group ${ACCENT_CLASSES[style.accent] || "border-white/10"} ${selectedStyle?.id === style.id ? "ring-2 ring-fuchsia-500/50" : ""}`}
            >
              {/* Top gradient bar */}
              <div className={`h-1 w-full bg-gradient-to-r ${style.color} opacity-80`} />

              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-white text-base leading-tight">{style.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{style.genre}</span>
                      <span className="text-zinc-700">•</span>
                      <span className="text-[10px] text-zinc-500">{style.mood}</span>
                      <span className="text-zinc-700">•</span>
                      <span className="text-[10px] text-zinc-500">{style.bpm} BPM</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSave(style.id); }}
                      className={`p-2 rounded-lg transition-all ${savedIds.has(style.id) ? "bg-fuchsia-500/20 text-fuchsia-400" : "bg-white/5 text-zinc-500 hover:text-zinc-300"}`}
                      title="프리셋에 저장"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Vocal badge */}
                <div className="flex items-center gap-2 mb-3">
                  <Mic2 className="w-3 h-3 text-zinc-600" />
                  <span className="text-[11px] text-zinc-500">{style.vocal}</span>
                </div>

                {/* Tags preview */}
                <p className="text-xs text-zinc-400 font-mono leading-relaxed bg-black/30 rounded-lg px-3 py-2 border border-white/5 line-clamp-2">
                  {style.tags}
                </p>

                {/* Copy button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopy(style); }}
                  className={`mt-4 w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    copiedId === style.id
                      ? "bg-green-500/20 border border-green-500/50 text-green-400"
                      : "bg-white/5 border border-white/10 text-zinc-300 hover:bg-fuchsia-500/10 hover:border-fuchsia-500/30 hover:text-fuchsia-300"
                  }`}
                >
                  {copiedId === style.id ? (
                    <><Check className="w-3.5 h-3.5" /> 복사됨!</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> 태그 복사</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Panel (선택시 하단 고정) */}
      {selectedStyle && (
        <div className="fixed bottom-0 left-64 right-0 z-50 p-4">
          <div className="max-w-4xl mx-auto bg-[#0a0a0e]/95 backdrop-blur-xl border border-fuchsia-500/30 rounded-2xl p-5 shadow-[0_-10px_40px_rgba(192,38,211,0.15)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${selectedStyle.color}`} />
                  <div>
                    <h4 className="text-white font-bold">{selectedStyle.name}</h4>
                    <p className="text-xs text-zinc-500">{selectedStyle.genre} · {selectedStyle.mood} · {selectedStyle.bpm} BPM · {selectedStyle.vocal}</p>
                  </div>
                </div>
                <div className="bg-black/50 rounded-xl px-4 py-3 border border-white/5 font-mono text-xs text-zinc-300 leading-relaxed">
                  {selectedStyle.tags}
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button
                  onClick={() => handleCopy(selectedStyle)}
                  className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold text-sm rounded-xl flex items-center gap-2 shadow-[0_0_15px_rgba(192,38,211,0.3)] transition-all"
                >
                  {copiedId === selectedStyle.id ? <><Check className="w-4 h-4" /> 복사됨</> : <><Copy className="w-4 h-4" /> 전체 복사</>}
                </button>
                <button
                  onClick={() => setSelectedStyle(null)}
                  className="px-5 py-2 bg-white/5 border border-white/10 text-zinc-400 hover:text-white text-sm rounded-xl transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
