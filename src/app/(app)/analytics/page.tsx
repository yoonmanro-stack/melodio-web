"use client";

import { useState, useEffect } from "react";
import { 
  Search, TrendingUp, Users, Eye, Video, ExternalLink, 
  Loader2, BarChart3, Clock, Globe, Calendar, Flame, 
  Sparkles, Copy, Check, MessageSquare, ShieldAlert, Music, X
} from "lucide-react";

// Types matching the backend API
type VideoData = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  durationSec: number;
  description: string;
  tags: string[];
  subscriberCount?: number;
};

type CommentData = {
  id: string;
  authorDisplayName: string;
  authorProfileImageUrl: string;
  textDisplay: string;
  textOriginal: string;
  likeCount: number;
  publishedAt: string;
};

type AnalysisResult = {
  searchVolume: string;
  competition: string;
  competitionScore: number;
  musicStyle: string;
  visualConcept: string;
  tags: string[];
  titles: string[];
  strategy: string;
};

const REGIONS = [
  { code: 'KR', name: '대한민국 (KR)' },
  { code: 'US', name: '미국 (US)' },
  { code: 'JP', name: '일본 (JP)' },
  { code: 'IN', name: '인도 (IN)' },
  { code: 'GB', name: '영국 (UK)' },
];

const CATEGORIES = [
  { id: '10', name: '음악 (Music)' },
  { id: '0', name: '전체 카테고리' },
];

const DATE_FILTERS = [
  { code: 'any', name: '전체 기간' },
  { code: '1day', name: '최근 1일' },
  { code: '1week', name: '최근 1주일' },
  { code: '1month', name: '최근 1개월' },
  { code: '3months', name: '최근 3개월' },
];

// --- SMART LOCAL CACHE SYSTEM ---
const CACHE_PREFIX = 'melodio_yt_cache_v2_';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachedData<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const itemStr = localStorage.getItem(CACHE_PREFIX + key);
    if (!itemStr) return null;
    const item = JSON.parse(itemStr);
    if (Date.now() - item.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return item.data;
  } catch {
    return null;
  }
}

function setCachedData<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      timestamp: Date.now(),
      data
    }));
  } catch {
    // If quota exceeded, clear all melodio cache
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(k);
      }
    }
  }
}

// Utility: Number formatter
function fmt(n?: number): string {
  if (n === undefined || isNaN(n)) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

// Utility: Duration formatter
function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Helper to parse and style multi-line text dynamically (key: value or bullets)
function formatTextLines(text: string) {
  if (!text) return null;
  return text.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    
    // Bullet point starting with '-' or '•'
    if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
      const content = trimmed.substring(1).trim();
      return (
        <div key={idx} className="flex items-start gap-1.5 mb-1.5 leading-relaxed text-[12.5px] text-zinc-400 font-normal">
          <span className="text-zinc-500 mt-1 flex-shrink-0">•</span>
          <span>{content}</span>
        </div>
      );
    }

    // Key-value pair separated by ':'
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const label = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      return (
        <div key={idx} className="mb-1.5 leading-relaxed font-normal">
          <span className="text-zinc-500 text-[11.5px] mr-1.5">{label}:</span>
          <span className="text-zinc-400 text-[12.5px]">{value}</span>
        </div>
      );
    }

    // Normal line
    return (
      <p key={idx} className="text-[12.5px] text-zinc-400 leading-relaxed mb-1 font-normal">
        {line}
      </p>
    );
  });
}


const DEFAULT_KEYWORDS_BY_REGION: Record<string, { name: string; type: string; keywords: string[] }[]> = {
  KR: [
    {
      name: "핵심 장르 (Core)",
      type: "genre",
      keywords: ["로파이 플레이리스트", "감성 시티팝 BGM", "에센셜 재즈 BGM", "칠홉 비트 BGM", "신스웨이브 BGM", "딥하우스 EDM BGM"]
    },
    {
      name: "상황 및 테마 (TPO)",
      type: "tpo",
      keywords: ["공부할 때 듣는 BGM", "새벽 코딩 노동요", "밤샘 작업용 칠홉", "차분한 카페 배경음악", "비오는 날 센티멘탈 BGM", "수면 유도 앰비언트", "헬스 부스터 EDM BGM", "드라이브 감성 BGM", "책 읽을 때 잔잔한 음악"]
    },
    {
      name: "사운드 디테일 (Sound)",
      type: "sound",
      keywords: ["빗소리 ASMR BGM", "아날로그 LP 잡음", "재즈 피아노 BGM", "잔잔한 어쿠스틱 기타", "힐링 뉴에이지 피아노", "숲속 자연음 ASMR BGM", "우주 신스패드 BGM", "카페 소음 어쿠스틱"]
    }
  ],
  JP: [
    {
      name: "メインジャンル (Core)",
      type: "genre",
      keywords: ["lofi ヒップホップ", "シティーポップ BGM", "ジャズ プレイリスト", "チルフロウ ビート", "シンセウェーブ BGM", "ディープハウス EDM"]
    },
    {
      name: "目的・シチュエーション (TPO)",
      type: "tpo",
      keywords: ["作業用BGM 集中", "睡眠用BGM ぐっすり", "勉強用BGM カフェ", "読書用BGM 静か", "雨の日 センチメンタル", "ドライブ用 洋楽BGM", "筋トレ EDM", "おしゃれ カフェBGM"]
    },
    {
      name: "サウンド詳細 (Sound)",
      type: "sound",
      keywords: ["雨の音 睡眠用", "レコード 雑音 BGM", "ピアノ ヒーリング", "アコースティック ギター", "癒し ニューエージ", "自然の音 ASMR", "宇宙 シンセパッド BGM", "カフェの雑音 BGM"]
    }
  ],
  US: [
    {
      name: "Core Genre",
      type: "genre",
      keywords: ["lofi playlist chill beats", "retro city pop BGM", "essential jazz BGM", "chillhop beats playlist", "synthwave gaming BGM", "deep house edm playlist"]
    },
    {
      name: "TPO / Theme",
      type: "tpo",
      keywords: ["study ambient music", "coding working music", "late night focus beats", "cozy cafe background music", "rainy day sentimental BGM", "deep sleep relaxing piano", "workout cardio gym boost", "road trip driving playlist", "reading books calm music"]
    },
    {
      name: "Detail Sound",
      type: "sound",
      keywords: ["rain sounds white noise", "vintage vinyl crackle BGM", "jazz piano background", "calm acoustic guitar BGM", "healing new age piano", "nature forest sounds ASMR", "cosmic synth pad BGM", "coffee shop ambient chatter"]
    }
  ],
  GB: [
    {
      name: "Core Genre",
      type: "genre",
      keywords: ["lofi playlist chill beats", "essential jazz BGM", "synthwave retro gaming", "acoustic guitar BGM", "ambient study music", "chillout cafe music"]
    },
    {
      name: "TPO / Theme",
      type: "tpo",
      keywords: ["study ambient music", "acoustic guitar BGM", "deep sleep relaxing piano", "workout EDM booster", "synthwave retro gaming", "calm relaxing sounds", "cafe jazz music"]
    },
    {
      name: "Detail Sound",
      type: "sound",
      keywords: ["rain sounds white noise", "vintage vinyl crackle BGM", "jazz piano background", "calm acoustic guitar BGM", "healing new age piano", "nature forest sounds ASMR", "cosmic synth pad BGM", "coffee shop ambient chatter"]
    }
  ],
  IN: [
    {
      name: "Core Genre",
      type: "genre",
      keywords: ["lofi bollywood playlist", "essential jazz BGM", "chillout house music", "gaming lo-fi beats", "classical fusion BGM", "acoustic pop playlist"]
    },
    {
      name: "TPO / Theme",
      type: "tpo",
      keywords: ["study ambient music", "sleep relaxing BGM", "workout EDM boost", "meditation yoga music", "driving focus music", "night coding beats"]
    },
    {
      name: "Detail Sound",
      type: "sound",
      keywords: ["instrumental flute BGM", "classical sitar fusion", "rain sounds relax", "acoustic guitar BGM", "soft piano background", "nature sounds healing"]
    }
  ]
};

export default function AnalyticsPage() {
  // Mode selection
  const [mode, setMode] = useState<"keyword" | "trending">("keyword");
  const [isShorts, setIsShorts] = useState<boolean>(false);

  // Filters State
  const [keyword, setKeyword] = useState("");
  const [regionCode, setRegionCode] = useState("KR");
  const [publishedAfter, setPublishedAfter] = useState("any");
  const [videoCategoryId, setVideoCategoryId] = useState("10"); // Default Music

  // Recommended keywords based on regionCode
  const [recommendedKeywords, setRecommendedKeywords] = useState<{ name: string; type: string; keywords: string[] }[]>([]);
  const [isLoadingKeywords, setIsLoadingKeywords] = useState(false);

  // Dynamically load search keywords from data/API whenever regionCode changes
  useEffect(() => {
    // 1. Set local preset as instant fallback
    const defaultList = DEFAULT_KEYWORDS_BY_REGION[regionCode] || DEFAULT_KEYWORDS_BY_REGION["US"];
    setRecommendedKeywords(defaultList);

    // 2. Fetch fresh dynamic data from the backend
    const fetchKeywords = async () => {
      setIsLoadingKeywords(true);
      try {
        const res = await fetch(`/api/youtube?action=recommend_keywords&regionCode=${regionCode}`);
        if (res.ok) {
          const data = await res.json();
          if (data.groups && Array.isArray(data.groups) && data.groups.length > 0) {
            setRecommendedKeywords(data.groups);
          }
        }
      } catch (err) {
        console.error("Failed to load dynamic recommended keywords", err);
      } finally {
        setIsLoadingKeywords(false);
      }
    };

    fetchKeywords();
  }, [regionCode]);

  // Advanced Filters
  const [minViews, setMinViews] = useState<number>(0);
  const [maxViews, setMaxViews] = useState<number>(0);
  const [minSubscribers, setMinSubscribers] = useState<number>(0);
  const [maxSubscribers, setMaxSubscribers] = useState<number>(0);

  // Results State
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // AI Report State
  const [aiReport, setAiReport] = useState<AnalysisResult | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Comment Modal State
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Comment NLP Sentiment Analysis states
  const [commentAnalysis, setCommentAnalysis] = useState<any | null>(null);
  const [analyzingComments, setAnalyzingComments] = useState(false);

  // Copied indicator
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [presetSaveStatus, setPresetSaveStatus] = useState<string | null>(null);

  // Pre-load default trend on start
  useEffect(() => {
    // Load default Lofi search
    handleSearch("lofi playlist", false);
  }, []);

  const handleSearch = async (overrideKeyword?: string, overrideShorts?: boolean) => {
    const activeKeyword = overrideKeyword !== undefined ? overrideKeyword : keyword;
    const activeShorts = overrideShorts !== undefined ? overrideShorts : isShorts;

    if (mode === "keyword" && !activeKeyword.trim()) {
      setErrorMsg("검색 키워드를 입력해 주세요.");
      return;
    }

    setErrorMsg("");
    setLoading(true);
    setAiReport(null);
    setVideos([]);

    // Create Cache Key
    const filterObj = {
      mode,
      keyword: activeKeyword,
      isShorts: activeShorts,
      regionCode,
      publishedAfter,
      videoCategoryId,
      minViews,
      maxViews,
      minSubscribers,
      maxSubscribers
    };
    const cacheKey = JSON.stringify(filterObj);

    // Check Cache
    const cachedVideos = getCachedData<VideoData[]>(cacheKey);
    const cachedAi = getCachedData<AnalysisResult>(cacheKey + "_ai");

    if (cachedVideos) {
      setVideos(cachedVideos);
      if (cachedAi) {
        setAiReport(cachedAi);
      } else if (cachedVideos.length > 0) {
        // If videos in cache but AI is not, run AI
        triggerAiAnalysis(activeKeyword, cachedVideos, activeShorts);
      }
      setLoading(false);
      return;
    }

    try {
      let url = "";
      if (mode === "keyword") {
        url = `/api/youtube?action=search_videos&q=${encodeURIComponent(activeKeyword)}&publishedAfter=${publishedAfter}&isShorts=${activeShorts}&regionCode=${regionCode}&minViews=${minViews}&maxViews=${maxViews}&minSubscribers=${minSubscribers}&maxSubscribers=${maxSubscribers}`;
      } else {
        url = `/api/youtube?action=trending_videos&videoCategoryId=${videoCategoryId}&isShorts=${activeShorts}&regionCode=${regionCode}&publishedAfter=${publishedAfter}&minViews=${minViews}&maxViews=${maxViews}&minSubscribers=${minSubscribers}&maxSubscribers=${maxSubscribers}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "영상 데이터를 가져오지 못했습니다.");
      }

      const resultVideos: VideoData[] = data.videos || [];
      setVideos(resultVideos);
      setCachedData(cacheKey, resultVideos);

      if (resultVideos.length > 0) {
        triggerAiAnalysis(activeKeyword, resultVideos, activeShorts, cacheKey + "_ai");
      } else {
        setErrorMsg("필터 조건에 부합하는 유튜브 영상이 없습니다. 필터를 완화해 보세요.");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "데이터 호출 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const triggerAiAnalysis = async (
    kw: string, 
    videoList: VideoData[], 
    shortsFlag: boolean,
    cacheKeyAi?: string
  ) => {
    setLoadingAi(true);
    try {
      const categoryName = CATEGORIES.find(c => c.id === videoCategoryId)?.name || "음악";
      const regionName = REGIONS.find(r => r.code === regionCode)?.name || regionCode;

      const res = await fetch("/api/youtube?action=analyze_trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: kw,
          videos: videoList,
          isShorts: shortsFlag,
          mode,
          categoryName,
          regionName,
          publishedAfter
        })
      });
      const data = await res.json();
      if (res.ok) {
        setAiReport(data);
        if (cacheKeyAi) {
          setCachedData(cacheKeyAi, data);
        }
      }
    } catch (e) {
      console.warn("AI Analysis Failed", e);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleOpenComments = async (vid: VideoData) => {
    setSelectedVideo(vid);
    setIsModalOpen(true);
    setLoadingComments(true);
    setComments([]);
    setCommentAnalysis(null);

    try {
      const res = await fetch(`/api/youtube?action=comments&videoId=${vid.id}&ownerChannelId=${vid.channelId}`);
      const data = await res.json();
      setComments(data.comments || []);
    } catch {
      // ignore
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAnalyzeComments = async () => {
    if (comments.length === 0) return;
    setAnalyzingComments(true);
    setCommentAnalysis(null);

    try {
      const res = await fetch('/api/youtube?action=analyze_comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ comments })
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        setCommentAnalysis(data.analysis);
      } else {
        alert(data.error || '댓글 감성 분석에 실패했습니다.');
      }
    } catch (err: any) {
      alert('통신 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setAnalyzingComments(false);
    }
  };

  const handleCopyTitle = (txt: string, idx: number) => {
    navigator.clipboard.writeText(txt);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 1500);
  };

  return (
    <div className="max-w-7xl mx-auto pt-4 pb-16 px-4">
      
      {/* ── 헤더 (통일된 표준 브랜드 헤더) ── */}
      <header className="mb-8 border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">YouTube Analytics</h1>
          <p className="text-zinc-400">최근 폭발적인 구독자/조회수 성장을 이루어 낸 AI 음악 및 플레이리스트 레퍼런스를 심층 탐색·분석합니다.</p>
        </div>

        {/* 퀵 숏츠 / 롱폼 토글 */}
        <div className="flex bg-black/40 border border-white/5 p-1 rounded-xl w-fit self-start">
          <button 
            onClick={() => { setIsShorts(false); handleSearch(keyword, false); }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${!isShorts ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Video className="w-3.5 h-3.5" /> 롱폼 플레이리스트
          </button>
          <button 
            onClick={() => { setIsShorts(true); handleSearch(keyword, true); }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${isShorts ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Flame className="w-3.5 h-3.5" /> 숏츠 음악/음원
          </button>
        </div>
      </header>

      {/* ── 레이아웃 Grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        
        {/* 1. 필터 설정 사이드바 (1컬럼) */}
        <div className="xl:col-span-1 space-y-4">
          <div className="glass-panel p-5 space-y-5 border border-white/5 bg-zinc-950/40 rounded-2xl">
            
            {/* 탐색 모드 */}
            <div>
              <label className="text-[11px] font-normal text-zinc-500 uppercase tracking-wider block mb-2">탐색 방식</label>
              <div className="grid grid-cols-2 gap-2 bg-black/50 p-1 rounded-xl">
                <button
                  onClick={() => setMode("keyword")}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all ${mode === "keyword" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                >
                  키워드 검색
                </button>
                <button
                  onClick={() => setMode("trending")}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all ${mode === "trending" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                >
                  급상승 차트
                </button>
              </div>
            </div>

            {/* 입력창 (키워드 모드용) */}
            {mode === "keyword" ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-normal text-zinc-500 uppercase tracking-wider block mb-2">검색 키워드</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="예: lofi playlist, chill beats"
                      className="w-full pl-9 pr-3 py-2.5 bg-black/50 border border-white/10 rounded-xl text-zinc-300 text-xs outline-none focus:border-fuchsia-500/50 transition-colors placeholder:text-zinc-700"
                    />
                    <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3.5" />
                  </div>
                </div>

                {/* 추천 키워드 태그 (클릭 시 입력창에 반영 및 검색) */}
                <div>
                  <div className="text-[10px] text-zinc-500 mb-2 flex items-center justify-between">
                    <span>💡 추천 검색어 (클릭하여 즉시 분석)</span>
                    {isLoadingKeywords && <span className="animate-pulse text-fuchsia-400 text-[9px]">갱신 중...</span>}
                  </div>
 
                  {/* 그룹 범례 (Legend) */}
                  <div className="flex items-center gap-3 mb-3 text-[10px]">
                    {recommendedKeywords.map((g, idx) => {
                      const levelColor = g.type === "genre" ? "text-fuchsia-300" : g.type === "tpo" ? "text-zinc-200" : "text-zinc-400";
                      return (
                        <span key={idx} className={levelColor}>
                          ■ {g.name}
                        </span>
                      );
                    })}
                  </div>
 
                  <div className="flex flex-wrap gap-1.5 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin">
                    {recommendedKeywords.flatMap(g => 
                      g.keywords.map(kw => ({ text: kw, type: g.type }))
                    ).map((kw, i) => {
                      let btnStyle = "border-zinc-400/20 text-zinc-400 hover:text-zinc-300 bg-zinc-950/20 hover:bg-zinc-900/30 hover:border-zinc-400/40"; // sound
                      if (kw.type === "genre") {
                        btnStyle = "border-fuchsia-300/25 text-fuchsia-300 hover:text-fuchsia-200 bg-fuchsia-500/5 hover:bg-fuchsia-500/10 hover:border-fuchsia-300/45";
                      } else if (kw.type === "tpo") {
                        btnStyle = "border-zinc-200/20 text-zinc-200 hover:text-white bg-white/5 hover:bg-white/10 hover:border-zinc-200/40";
                      }
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setKeyword(kw.text);
                            handleSearch(kw.text);
                          }}
                          className={`px-3 py-1.5 border rounded-full text-xs transition-all cursor-pointer ${btnStyle}`}
                        >
                          {kw.text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-normal text-zinc-500 uppercase tracking-wider block mb-2">카테고리</label>
                <select
                  value={videoCategoryId}
                  onChange={(e) => setVideoCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-black/50 border border-white/10 rounded-xl text-zinc-300 text-xs outline-none focus:border-fuchsia-500/50 transition-colors"
                >
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {/* 지역 및 수집기간 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-normal text-zinc-500 uppercase tracking-wider block mb-2 flex items-center gap-1"><Globe className="w-3 h-3" /> 국가</label>
                <select
                  value={regionCode}
                  onChange={(e) => setRegionCode(e.target.value)}
                  className="w-full px-2 py-2.5 bg-black/50 border border-white/10 rounded-xl text-zinc-300 text-xs outline-none focus:border-fuchsia-500/50"
                >
                  {REGIONS.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-normal text-zinc-500 uppercase tracking-wider block mb-2 flex items-center gap-1"><Calendar className="w-3 h-3" /> 기간</label>
                <select
                  value={publishedAfter}
                  onChange={(e) => setPublishedAfter(e.target.value)}
                  className="w-full px-2 py-2.5 bg-black/50 border border-white/10 rounded-xl text-zinc-300 text-xs outline-none focus:border-fuchsia-500/50"
                >
                  {DATE_FILTERS.map(f => <option key={f.code} value={f.code}>{f.name}</option>)}
                </select>
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <span className="text-[11px] font-normal text-zinc-500 uppercase tracking-wider block mb-3">고급 벤치마킹 필터</span>
              
              {/* 최소 조회수 */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 mb-1">
                    <span>최소 조회수</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="5000000"
                        placeholder="제한 없음"
                        value={minViews === 0 ? "" : minViews}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Number(e.target.value);
                          setMinViews(val);
                        }}
                        className="w-20 px-1.5 py-0.5 bg-black/40 border border-white/10 rounded text-right text-zinc-300 text-xs focus:border-fuchsia-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      {minViews > 0 && <span className="text-zinc-500 text-[10px]">회</span>}
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="5000000" 
                    step="1000"
                    value={minViews}
                    onChange={(e) => setMinViews(Number(e.target.value))}
                    className="w-full accent-fuchsia-500 bg-zinc-800"
                  />
                </div>

                {/* 구독자 수 필터 */}
                <div>
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 mb-1">
                    <span>최소 채널 구독자 수</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        placeholder="제한 없음"
                        value={minSubscribers === 0 ? "" : minSubscribers}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Number(e.target.value);
                          setMinSubscribers(val);
                        }}
                        className="w-20 px-1.5 py-0.5 bg-black/40 border border-white/10 rounded text-right text-zinc-300 text-xs focus:border-fuchsia-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      {minSubscribers > 0 && <span className="text-zinc-500 text-[10px]">명</span>}
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1000000" 
                    step="100"
                    value={minSubscribers}
                    onChange={(e) => setMinSubscribers(Number(e.target.value))}
                    className="w-full accent-violet-500 bg-zinc-800"
                  />
                </div>
                <div className="p-3 bg-zinc-950/40 border border-white/5 rounded-xl mt-2">
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-normal">
                    * 구독자수가 적은데 최근 폭발적인 조회수를 낸 &apos;알짜배기 성장형 채널&apos;을 발굴하고 벤치마킹하려면 최소 구독자 제한을 낮추고 최소 조회수를 올려보세요.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleSearch()}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-fuchsia-500/10 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  트렌드 분석 중...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  벤치마킹 분석 시작
                </>
              )}
            </button>

          </div>
        </div>

        {/* 2. 메인 결과 & AI 보고서 영역 (3컬럼) */}
        <div className="xl:col-span-3 space-y-6">

          {/* 에러 메시지 */}
          {errorMsg && (
            <div className="p-4 rounded-xl border border-red-500/10 bg-red-500/5 text-red-400 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* AI 분석 보고서 패널 */}
          {(loadingAi || aiReport) && (
            <div className="glass-panel p-6 border border-fuchsia-500/10 bg-zinc-950/20 rounded-2xl relative overflow-hidden">
              {/* 로딩 애니메이션 */}
              {loadingAi && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-600 to-violet-600 flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.5)] animate-bounce mb-3">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-white">AI 트렌드 벤치마킹 보고서 생성 중...</span>
                  <span className="text-xs text-zinc-500 mt-1">상위 비디오 스타일 및 콘셉트를 디코딩하는 중입니다</span>
                </div>
              )}

              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-fuchsia-400" /> AI 트렌드 & 기획 분석 리포트
                </h3>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 font-bold uppercase tracking-wider">
                  Custom Curation
                </span>
              </div>

              {aiReport && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* 경쟁 지표 */}
                  <div className="md:col-span-1 space-y-4">
                    <div className="bg-black/30 border border-white/5 rounded-xl p-4 text-center">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2">경쟁 편승 난이도</p>
                      <div className="relative w-24 h-24 mx-auto flex items-center justify-center mb-2">
                        {/* Circle Dial */}
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="transparent" />
                          <circle 
                            cx="48" 
                            cy="48" 
                            r="40" 
                            stroke="url(#fuchsiaGrad)" 
                            strokeWidth="8" 
                            fill="transparent" 
                            strokeDasharray={251.2}
                            strokeDashoffset={251.2 - (251.2 * aiReport.competitionScore) / 100}
                          />
                          <defs>
                            <linearGradient id="fuchsiaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#ec4899" />
                              <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <span className="absolute text-xl font-black text-white">{aiReport.competitionScore}</span>
                      </div>
                      <p className="text-xs text-zinc-500 font-normal">진단: <span className="text-zinc-400 font-normal">{aiReport.competition}</span></p>
                    </div>

                    <div className="bg-black/30 border border-white/5 rounded-xl p-4">
                      <span className="text-[11px] text-zinc-500 font-normal uppercase tracking-wider block mb-1">트렌드 열기 & 대중 관심사</span>
                      <p className="text-xs text-zinc-400 leading-relaxed font-normal">{aiReport.searchVolume}</p>
                    </div>
                  </div>

                  {/* 스타일 및 기획 분석 (2컬럼) */}
                  <div className="md:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-2">
                        <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1">🎵 추천 음원 및 작곡 스타일</h4>
                        <div className="space-y-1">{formatTextLines(aiReport.musicStyle)}</div>
                      </div>
                      <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-2">
                        <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1">🎬 비주얼 및 아트워크 콘셉트</h4>
                        <div className="space-y-1">{formatTextLines(aiReport.visualConcept)}</div>
                      </div>
                    </div>
 
                    {/* 추천 제목 및 태그 */}
                    <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
                      <div>
                        <h4 className="text-xs font-bold text-zinc-300 mb-2">벤치마킹 추천 영상 제목</h4>
                        <div className="space-y-1.5">
                          {aiReport.titles.map((title, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 bg-black/40 px-3 py-2 rounded-lg border border-white/5 text-xs text-zinc-400 font-normal">
                              <span className="truncate">{title}</span>
                              <button 
                                onClick={() => handleCopyTitle(title, i)}
                                className="text-zinc-500 hover:text-white transition-colors"
                              >
                                {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
 
                      <div>
                        <h4 className="text-xs font-bold text-zinc-300 mb-2">추천 해시태그 / 키워드</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {aiReport.tags.map((tag) => (
                            <span 
                              key={tag}
                              onClick={() => handleCopyTag(tag)}
                              className="px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] text-zinc-400 hover:text-zinc-200 font-normal cursor-pointer transition-all flex items-center gap-1"
                            >
                              {tag}
                              {copiedTag === tag ? <Check className="w-2.5 h-2.5 text-green-400" /> : <Copy className="w-2.5 h-2.5 opacity-50" />}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
 
                    {/* 실행 핵심 요약 */}
                    <div className="bg-fuchsia-500/5 border border-fuchsia-500/10 rounded-xl p-4">
                      <h4 className="text-xs font-bold text-zinc-300 mb-1">핵심 성장 및 성장률 부스팅 전략</h4>
                      <div className="space-y-1 mt-2">{formatTextLines(aiReport.strategy)}</div>
                    </div>
 
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 비디오 리스트 */}
          <div className="glass-panel p-5 border border-white/5 bg-zinc-950/40 rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-fuchsia-400" />
                {mode === "keyword" ? `"${keyword || 'lofi playlist'}" 검색 결과` : `급상승 차트 비디오`}
                <span className="text-[11px] text-zinc-500 font-normal">({videos.length}개 발견)</span>
              </h3>
            </div>

            {loading && videos.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin text-fuchsia-500 mb-3" />
                <p className="text-sm">유튜브 인기 비디오 정보를 집계 중입니다...</p>
              </div>
            )}

            {!loading && videos.length === 0 && (
              <div className="py-20 flex flex-col items-center justify-center text-zinc-600">
                <Music className="w-12 h-12 opacity-20 mb-3" />
                <p className="text-sm">검색 결과가 비어 있습니다. 검색 시작을 클릭해 주세요.</p>
              </div>
            )}

            {videos.length > 0 && (
              <div className="space-y-3">
                {videos.map((vid, idx) => (
                  <div 
                    key={vid.id}
                    className="flex flex-col md:flex-row gap-4 p-3 rounded-xl bg-black/20 border border-white/5 hover:border-fuchsia-500/20 hover:bg-fuchsia-500/5 transition-all group"
                  >
                    {/* 썸네일 */}
                    <div className="relative w-full md:w-44 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-zinc-900">
                      <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 border border-white/10 text-zinc-200 text-[10px] font-bold flex items-center justify-center z-10">
                        {idx + 1}
                      </span>
                      {vid.thumbnail ? (
                        <img src={vid.thumbnail} alt={vid.title} className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Video className="w-5 h-5 text-zinc-700" /></div>
                      )}
                      <span className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[9px] text-zinc-300 font-mono">
                        {fmtDuration(vid.durationSec)}
                      </span>
                    </div>

                    {/* 비디오 정보 */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-sm font-normal text-zinc-300 line-clamp-2 leading-snug group-hover:text-fuchsia-400 transition-colors">
                            {vid.title}
                          </h4>
                          <a 
                            href={`https://youtube.com/watch?v=${vid.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-zinc-500 hover:text-white transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1 font-normal">{vid.channelTitle}</p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 md:mt-0 pt-3 border-t border-white/5">
                        <div className="flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-zinc-500" />
                          <div>
                            <p className="text-[10px] text-zinc-500 leading-none">조회수</p>
                            <p className="text-xs text-zinc-300 font-normal mt-0.5">{fmt(vid.viewCount)}회</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-zinc-500" />
                          <div>
                            <p className="text-[10px] text-zinc-500 leading-none">구독자</p>
                            <p className="text-xs text-zinc-300 font-normal mt-0.5">{fmt(vid.subscriberCount)}명</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                          <div>
                            <p className="text-[10px] text-zinc-500 leading-none">업로드</p>
                            <p className="text-xs text-zinc-300 font-normal mt-0.5">{new Date(vid.publishedAt).toLocaleDateString("ko-KR")}</p>
                          </div>
                        </div>

                        {/* 댓글 분석 유도 */}
                        <button
                          onClick={() => handleOpenComments(vid)}
                          className="px-3 py-1.5 h-fit self-center border border-fuchsia-500/10 hover:border-fuchsia-500/30 bg-fuchsia-500/5 hover:bg-fuchsia-500/10 rounded-lg text-[10px] font-bold text-fuchsia-400 flex items-center justify-center gap-1 transition-all"
                        >
                          <MessageSquare className="w-3 h-3" />
                          댓글 분석
                        </button>
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>

        </div>

      </div>

      {/* ── 댓글 모달 ── */}
      {isModalOpen && selectedVideo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[740px] md:h-[640px] bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-fadeIn flex flex-col">
            {/* 모달 헤더 */}
            <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4 bg-zinc-900/30 shrink-0">
              <div>
                <span className="text-[9px] px-2 py-0.5 rounded bg-zinc-800 border border-white/5 text-zinc-400 font-mono">VIDEO COMMENTS</span>
                <h4 className="text-sm font-bold text-white mt-1.5 line-clamp-2">{selectedVideo.title}</h4>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-white bg-white/5 hover:bg-white/10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-7 flex-1 overflow-y-auto space-y-4 scrollbar-thin">
              {loadingComments ? (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-500">
                  <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400 mb-2" />
                  <p className="text-xs">상위 댓글에서 시청자의 리액션을 추출하는 중...</p>
                </div>
              ) : comments.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 text-xs">
                  <MessageSquare className="w-8 h-8 mx-auto opacity-20 mb-2" />
                  댓글 데이터를 조회할 수 없습니다. (비공개 처리되었거나 댓글 없음)
                </div>
              ) : (
                <div className="space-y-4">
                  {/* AI 감성 마이닝 배너 */}
                  {comments.length > 0 && !commentAnalysis && (
                    <div className="p-4 rounded-xl bg-gradient-to-r from-fuchsia-950/40 via-purple-950/20 to-cyan-950/40 border border-fuchsia-500/20 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
                      <div>
                        <p className="text-xs font-bold text-fuchsia-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
                          AI 감성 마이닝 (Seed Blender)
                        </p>
                        <p className="text-[10px] text-zinc-400 mt-1">시청자들의 반응을 분석하여 Suno/Veo 프롬프트를 자동으로 조제합니다.</p>
                      </div>
                      <button
                        onClick={handleAnalyzeComments}
                        disabled={analyzingComments}
                        className="px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-[0_0_15px_rgba(192,38,211,0.3)] select-none cursor-pointer"
                      >
                        {analyzingComments ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            분석 중...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            감성 마이닝 실행
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* AI 감성 마이닝 결과 패널 */}
                  {commentAnalysis && (
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-4 relative overflow-hidden animate-fadeIn">
                      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <Sparkles className="w-24 h-24 text-fuchsia-400" />
                      </div>
                      
                      <div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-bold uppercase">Sentiment Analysis</span>
                        <p className="text-xs text-zinc-300 font-medium mt-2 leading-relaxed">{commentAnalysis.moodSummary}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-black/35 p-3 rounded-lg border border-white/5">
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">대표 감성 키워드</p>
                          <div className="flex flex-wrap gap-1.5">
                            {commentAnalysis.keyKeywords?.map((kw: string, i: number) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 font-medium">{kw}</span>
                            ))}
                          </div>
                        </div>

                        <div className="bg-black/35 p-3 rounded-lg border border-white/5">
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">추천 사운드 & 템포</p>
                          <p className="text-xs text-zinc-400 font-medium">{commentAnalysis.suggestedBpm}</p>
                          <p className="text-[11px] text-zinc-500 truncate mt-1">{(commentAnalysis.suggestedInstruments || []).join(', ')}</p>
                        </div>
                      </div>

                      <div className="p-3 bg-black/45 rounded-lg border border-fuchsia-500/15 relative">
                        <p className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Music className="w-3 h-3" /> 추천 사운드 프롬프트 (GMIV 규격)
                        </p>
                        <p className="text-xs text-zinc-400 font-mono leading-relaxed select-all line-clamp-3 hover:line-clamp-none transition-all cursor-pointer bg-black/20 p-2 rounded border border-white/5">
                          {commentAnalysis.blendedStylePrompt}
                        </p>
                      </div>

                      {presetSaveStatus && (
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-xs font-bold text-green-400 text-center animate-fadeIn">
                          {presetSaveStatus}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const style = encodeURIComponent(commentAnalysis.blendedStylePrompt || "");
                            window.location.href = `/audio?style=${style}`;
                          }}
                          className="flex-1 py-2.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-xs font-bold transition-all shadow-[0_0_15px_rgba(192,38,211,0.4)] flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Music className="w-3.5 h-3.5" /> 이 감성 시드로 음악 생성
                        </button>

                        <button
                          onClick={() => {
                            const getCleanPresetName = (rawTitle: string) => {
                              if (!rawTitle) return "감성 큐레이션";

                              // 1. Remove text inside brackets/parentheses like [Playlist], (Lofi), [Music]
                              let clean = rawTitle.replace(/\[[^\]]+\]/g, '')
                                               .replace(/\([^)]+\)/g, '');

                              // 2. Remove emojis and special symbols
                              clean = clean.replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
                                           .replace(/[\u{2600}-\u{27BF}]/gu, '');

                              // 3. Normalize spaces
                              clean = clean.replace(/\s+/g, ' ').trim();

                              // 4. Split by words to avoid cut-off, take first 4 words
                              const words = clean.split(' ');
                              let candidate = words.length > 4 ? words.slice(0, 4).join(' ') : clean;

                              // 5. Fallback if candidate is too generic (like just Playlist)
                              const lowerCandidate = candidate.toLowerCase();
                              if (!candidate || lowerCandidate === 'playlist' || lowerCandidate === '플레이리스트' || candidate.length < 3) {
                                const firstKw = commentAnalysis?.keyKeywords?.[0];
                                const secondKw = commentAnalysis?.keyKeywords?.[1];
                                if (firstKw && secondKw) {
                                  candidate = `${firstKw} ${secondKw} 감성`;
                                } else {
                                  candidate = "맞춤형 감성 큐레이션";
                                }
                              }

                              // 6. Max length clamp
                              if (candidate.length > 20) {
                                candidate = candidate.slice(0, 17).trim() + "...";
                              }

                              return candidate;
                            };

                            const presetName = getCleanPresetName(selectedVideo?.title || "");
                            const sampleColors = ['#ffc800', '#ccfa29', '#1cfd54'];
                            const randomColor = sampleColors[Math.floor(Math.random() * sampleColors.length)];
                            
                            const newPreset = {
                              id: `custom-${Date.now()}`,
                              emoji: "🔮",
                              name: presetName,
                              desc: commentAnalysis.moodSummary || "유튜브 댓글 감성을 NLP 분석한 프리셋입니다.",
                              gradient: randomColor,
                              customPrompt: commentAnalysis.blendedStylePrompt,
                              selections: {},
                              lyricsTemplate: ""
                            };

                            const existingRaw = localStorage.getItem("melodio_custom_presets");
                            let existing = [];
                            if (existingRaw) {
                              try {
                                existing = JSON.parse(existingRaw);
                              } catch {}
                            }
                            const updated = [newPreset, ...existing];
                            localStorage.setItem("melodio_custom_presets", JSON.stringify(updated));
                            setPresetSaveStatus(`나만의 프리셋에 '${presetName}'(으)로 즉시 저장되었습니다!`);
                            setTimeout(() => setPresetSaveStatus(null), 4000);
                          }}
                          className="px-3.5 py-2.5 bg-fuchsia-950/40 border border-fuchsia-500/30 hover:bg-fuchsia-900/60 text-fuchsia-300 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> 프리셋 저장
                        </button>
                        
                        <button
                          onClick={() => setCommentAnalysis(null)}
                          className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        >
                          다시 분석
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-zinc-500 font-bold mb-2">시청자들의 핵심 긍정 리액션 & 피드백</p>
                  {comments.map((comment) => (
                    <div key={comment.id} className="p-3 bg-white/2 rounded-xl border border-white/5 flex gap-3">
                      {comment.authorProfileImageUrl && (
                        <img src={comment.authorProfileImageUrl} alt={comment.authorDisplayName} className="w-8 h-8 rounded-full object-cover bg-zinc-800" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <p className="text-xs font-semibold text-zinc-300 truncate">{comment.authorDisplayName}</p>
                          <span className="text-[10px] text-zinc-600">{new Date(comment.publishedAt).toLocaleDateString("ko-KR")}</span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: comment.textDisplay }}></p>
                        {comment.likeCount > 0 && (
                          <span className="text-[9px] text-fuchsia-500 font-bold mt-1.5 block">👍 {comment.likeCount.toLocaleString()} Likes</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="p-4 bg-zinc-900/10 border-t border-white/5 flex justify-end shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation classes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
