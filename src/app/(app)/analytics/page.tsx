"use client";

import { useState } from "react";
import { Search, TrendingUp, Users, Eye, Video, ExternalLink, Music2, Loader2, BarChart3 } from "lucide-react";

type ChannelResult = { channelId: string; title: string; description: string; thumbnail: string; };
type ChannelStats = {
  channelId: string; title: string; description: string; thumbnail: string;
  country?: string; subscriberCount: number; viewCount: number; videoCount: number;
};
type VideoItem = { videoId: string; title: string; channelTitle?: string; thumbnail: string; publishedAt: string; };

const TREND_QUERIES = [
  "lo-fi hip hop 24/7", "AI music chill beats", "dark synthwave 1 hour",
  "K-pop study music", "cinematic ambient music", "jazz lofi coffee",
];

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

export default function AnalyticsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChannelResult[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<ChannelStats | null>(null);
  const [channelVideos, setChannelVideos] = useState<VideoItem[]>([]);
  const [trendVideos, setTrendVideos] = useState<VideoItem[]>([]);
  const [trendQuery, setTrendQuery] = useState(TREND_QUERIES[0]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [loadingTrend, setLoadingTrend] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    setSearchResults([]);
    setSelectedChannel(null);
    try {
      const res = await fetch(`/api/youtube?action=search_channel&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.channels || []);
    } catch { /* ignore */ }
    setLoadingSearch(false);
  };

  const handleSelectChannel = async (ch: ChannelResult) => {
    setLoadingChannel(true);
    setSelectedChannel(null);
    setChannelVideos([]);
    try {
      const [statsRes, vidRes] = await Promise.all([
        fetch(`/api/youtube?action=channel_stats&channelId=${ch.channelId}`),
        fetch(`/api/youtube?action=channel_videos&channelId=${ch.channelId}`),
      ]);
      const stats = await statsRes.json();
      const vids = await vidRes.json();
      setSelectedChannel(stats);
      setChannelVideos(vids.videos || []);
    } catch { /* ignore */ }
    setLoadingChannel(false);
  };

  const handleTrend = async (q: string) => {
    setTrendQuery(q);
    setLoadingTrend(true);
    setTrendVideos([]);
    try {
      const res = await fetch(`/api/youtube?action=trending_music&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setTrendVideos(data.videos || []);
    } catch { /* ignore */ }
    setLoadingTrend(false);
  };

  return (
    <div className="max-w-7xl mx-auto pt-4 pb-16">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-pink-600 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)]">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white">YouTube Analytics</h1>
        </div>
        <p className="text-zinc-400">경쟁 채널 분석 · 트렌딩 음악 탐색 · 레퍼런스 벤치마킹</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── 좌측: 채널 검색 & 분석 ── */}
        <div className="space-y-4">
          {/* 검색창 */}
          <div className="glass-panel p-5">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-fuchsia-400" /> 채널 검색 & 분석
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="채널명 검색... (예: lofi girl, Melodio)"
                className="flex-1 px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-fuchsia-500/50 transition-colors placeholder:text-zinc-600"
              />
              <button
                onClick={handleSearch}
                disabled={loadingSearch}
                className="px-5 py-3 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {loadingSearch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                검색
              </button>
            </div>

            {/* 검색 결과 */}
            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2">
                {searchResults.map((ch) => (
                  <div
                    key={ch.channelId}
                    onClick={() => handleSelectChannel(ch)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5 hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 cursor-pointer transition-all"
                  >
                    {ch.thumbnail && (
                      <img src={ch.thumbnail} alt={ch.title} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{ch.title}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{ch.description || "설명 없음"}</p>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 채널 상세 통계 */}
          {loadingChannel && (
            <div className="glass-panel p-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400" />
              <span className="ml-2 text-zinc-400 text-sm">채널 정보 불러오는 중...</span>
            </div>
          )}

          {selectedChannel && !loadingChannel && (
            <div className="glass-panel p-5 space-y-4">
              {/* 채널 헤더 */}
              <div className="flex items-center gap-4">
                {selectedChannel.thumbnail && (
                  <img src={selectedChannel.thumbnail} alt={selectedChannel.title} className="w-16 h-16 rounded-full object-cover border-2 border-fuchsia-500/30" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white">{selectedChannel.title}</h3>
                  <p className="text-xs text-zinc-500 truncate">{selectedChannel.description?.slice(0, 80)}...</p>
                  {selectedChannel.country && (
                    <span className="text-[10px] text-zinc-600 mt-1 block">📍 {selectedChannel.country}</span>
                  )}
                </div>
                <a
                  href={`https://youtube.com/channel/${selectedChannel.channelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* 핵심 지표 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-black/40 rounded-xl p-3 text-center border border-fuchsia-500/10">
                  <Users className="w-4 h-4 text-fuchsia-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-white">{fmt(selectedChannel.subscriberCount)}</p>
                  <p className="text-[10px] text-zinc-500">구독자</p>
                </div>
                <div className="bg-black/40 rounded-xl p-3 text-center border border-cyan-500/10">
                  <Eye className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-white">{fmt(selectedChannel.viewCount)}</p>
                  <p className="text-[10px] text-zinc-500">총 조회수</p>
                </div>
                <div className="bg-black/40 rounded-xl p-3 text-center border border-purple-500/10">
                  <Video className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                  <p className="text-xl font-bold text-white">{fmt(selectedChannel.videoCount)}</p>
                  <p className="text-[10px] text-zinc-500">영상 수</p>
                </div>
              </div>

              {/* 최신 영상 */}
              {channelVideos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 mb-3">최근 영상</p>
                  <div className="grid grid-cols-2 gap-2">
                    {channelVideos.slice(0, 4).map((v) => (
                      <a
                        key={v.videoId}
                        href={`https://youtube.com/watch?v=${v.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all bg-black/40"
                      >
                        {v.thumbnail && (
                          <img src={v.thumbnail} alt={v.title} className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300" />
                        )}
                        <div className="p-2">
                          <p className="text-[11px] text-zinc-300 line-clamp-2 leading-tight">{v.title}</p>
                          <p className="text-[9px] text-zinc-600 mt-1">{new Date(v.publishedAt).toLocaleDateString("ko-KR")}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 우측: 트렌딩 음악 탐색 ── */}
        <div className="space-y-4">
          <div className="glass-panel p-5">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" /> 트렌딩 AI 음악 탐색
            </h2>

            {/* 퀵 쿼리 버튼 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {TREND_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => handleTrend(q)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    trendQuery === q && trendVideos.length > 0
                      ? "bg-cyan-500/20 border-cyan-500/60 text-cyan-300"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            {loadingTrend && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                <span className="ml-2 text-zinc-400 text-sm">트렌딩 영상 검색 중...</span>
              </div>
            )}

            {trendVideos.length === 0 && !loadingTrend && (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-600">
                <Music2 className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">위 버튼을 클릭해서 트렌딩 음악을 탐색하세요</p>
              </div>
            )}

            {/* 트렌딩 영상 목록 */}
            {trendVideos.length > 0 && !loadingTrend && (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {trendVideos.map((v, i) => (
                  <a
                    key={v.videoId}
                    href={`https://youtube.com/watch?v=${v.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-3 p-3 rounded-xl bg-black/30 border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group"
                  >
                    <div className="relative flex-shrink-0">
                      <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 text-[9px] font-bold flex items-center justify-center z-10">
                        {i + 1}
                      </span>
                      {v.thumbnail && (
                        <img src={v.thumbnail} alt={v.title} className="w-24 h-14 rounded-lg object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium line-clamp-2 leading-snug group-hover:text-cyan-300 transition-colors">{v.title}</p>
                      <p className="text-[10px] text-zinc-500 mt-1">{v.channelTitle}</p>
                      <p className="text-[10px] text-zinc-600">{new Date(v.publishedAt).toLocaleDateString("ko-KR")}</p>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-600 group-hover:text-cyan-400 transition-colors flex-shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
