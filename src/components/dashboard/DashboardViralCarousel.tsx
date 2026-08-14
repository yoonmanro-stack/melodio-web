"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Film, Pause, Play } from "lucide-react";
import { registerActiveAudio } from "@/lib/globalAudio";

export type DashboardViralVideo = {
  id: string;
  title: string;
  videoUrl: string;
  posterUrl: string;
  createdAt: string;
  isPublic: boolean;
};

type DashboardViralCarouselProps = {
  videos: DashboardViralVideo[];
  onOpenDetails: (id: string) => void;
};

export default function DashboardViralCarousel({ videos, onOpenDetails }: DashboardViralCarouselProps) {
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(videos.length / itemsPerPage));
  const activePage = Math.min(currentPage, totalPages);
  const pageVideos = videos.slice((activePage - 1) * itemsPerPage, activePage * itemsPerPage);

  useEffect(() => {
    const mountedVideos = videoRefs.current;
    return () => mountedVideos.forEach((video) => video.pause());
  }, []);

  const handlePlay = (id: string, video: HTMLVideoElement) => {
    videoRefs.current.forEach((candidate, candidateId) => {
      if (candidateId !== id) candidate.pause();
    });
    setPlayingId(id);
    registerActiveAudio(video, () => {
      video.pause();
      setPlayingId((current) => current === id ? null : current);
    });
  };

  const toggleVideo = (id: string) => {
    const video = videoRefs.current.get(id);
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const goToPage = (page: number) => {
    videoRefs.current.forEach((video) => video.pause());
    setPlayingId(null);
    setCurrentPage(Math.min(totalPages, Math.max(1, page)));
  };

  if (videos.length === 0) return null;

  return (
    <section aria-labelledby="dashboard-viral-shorts-title" className="mt-12 rounded-3xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-950/25 via-zinc-950/80 to-purple-950/20 p-5 shadow-xl sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Film className="h-5 w-5 text-fuchsia-400" />
            <h2 id="dashboard-viral-shorts-title" className="text-xl font-black text-white">내 Viral Shorts</h2>
            <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-black text-fuchsia-300">
              영상 {videos.length}개
            </span>
          </div>
          <p className="text-xs text-zinc-500">영상 생성이 완료된 바이럴 콘텐츠만 표시됩니다.</p>
        </div>
        <Link href="/viral" className="inline-flex items-center gap-1.5 text-xs font-black text-fuchsia-300 transition hover:text-white">
          Viral Zone 열기 <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {pageVideos.map((video) => {
            const isPlaying = playingId === video.id;
            return (
              <article key={video.id} className="min-w-0">
                <div className={`group/card relative aspect-[9/16] overflow-hidden rounded-2xl border bg-black shadow-xl transition ${isPlaying ? "border-fuchsia-400 shadow-fuchsia-950/50" : "border-white/10 hover:border-fuchsia-400/40"}`}>
                  <video
                    ref={(element) => {
                      if (element) videoRefs.current.set(video.id, element);
                      else videoRefs.current.delete(video.id);
                    }}
                    src={video.videoUrl}
                    poster={video.posterUrl}
                    loop
                    playsInline
                    preload="none"
                    onPlay={(event) => handlePlay(video.id, event.currentTarget)}
                    onPause={() => setPlayingId((current) => current === video.id ? null : current)}
                    className="h-full w-full object-cover"
                    aria-label={`${video.title} 영상`}
                  />

                  <button
                    type="button"
                    onClick={() => toggleVideo(video.id)}
                    aria-label={isPlaying ? `${video.title} 일시정지` : `${video.title} 재생`}
                    className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400"
                  />

                  <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 h-32 bg-gradient-to-t to-transparent transition-opacity duration-300 ${isPlaying ? "from-black/40 via-black/5 opacity-100" : "from-black/65 via-black/10 opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100"}`} />

                  <span className={`pointer-events-none absolute left-2.5 top-2.5 z-20 rounded-full border px-2 py-1 text-[9px] font-black opacity-0 backdrop-blur transition-opacity duration-300 group-hover/card:opacity-100 group-focus-within/card:opacity-100 ${isPlaying ? "opacity-100" : ""} ${video.isPublic ? "border-emerald-400/30 bg-black/60 text-emerald-300" : "border-zinc-400/30 bg-black/60 text-zinc-300"}`}>
                    {video.isPublic ? "PUBLIC" : "PRIVATE"}
                  </span>

                  <span className={`pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 text-white opacity-0 shadow-xl backdrop-blur transition-all duration-300 group-hover/card:scale-105 group-hover/card:opacity-100 group-focus-within/card:opacity-100 ${isPlaying ? "bg-fuchsia-600/90 opacity-100" : "bg-black/55"}`}>
                    {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                  </span>

                  <div className={`pointer-events-none absolute inset-x-3 bottom-3 z-20 translate-y-2 opacity-0 transition-all duration-300 group-hover/card:translate-y-0 group-hover/card:opacity-100 group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100 ${isPlaying ? "translate-y-0 opacity-100" : ""}`}>
                    <h3 className="line-clamp-2 text-xs font-black leading-snug text-white drop-shadow-lg">{video.title}</h3>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[9px] font-bold text-zinc-300">
                      <span>{new Date(video.createdAt).toLocaleDateString("ko-KR")}</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenDetails(video.id);
                        }}
                        className="pointer-events-auto rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-white transition hover:bg-white/15"
                      >
                        관리
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {totalPages > 1 ? (
          <nav aria-label="바이럴 영상 페이지" className="mt-5 flex items-center justify-center gap-1.5 border-t border-white/10 pt-4">
            <button type="button" onClick={() => goToPage(activePage - 1)} disabled={activePage === 1} aria-label="이전 바이럴 페이지" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" onClick={() => goToPage(page)} aria-current={activePage === page ? "page" : undefined} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-black transition ${activePage === page ? "bg-fuchsia-500 text-white" : "border border-white/10 text-zinc-400 hover:text-white"}`}>
                {page}
              </button>
            ))}
            <button type="button" onClick={() => goToPage(activePage + 1)} disabled={activePage === totalPages} aria-label="다음 바이럴 페이지" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white disabled:opacity-30">
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
