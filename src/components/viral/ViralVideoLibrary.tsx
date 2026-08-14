'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Film, RefreshCw, Search, Sparkles } from 'lucide-react'
import { registerActiveAudio } from '@/lib/globalAudio'

export type ViralCategory = 'drama' | 'pet' | 'relationship' | 'human' | 'trend' | 'challenge' | 'brand' | 'history' | 'parenting' | 'food_diet' | 'horror_mystery' | 'ai_future'

export type ViralVideo = {
  id: string
  title: string
  videoUrl: string
  posterUrl?: string
  category: ViralCategory
  genre: string
  creator: string
  viewCount: number
  createdAt: string
}

const CATEGORIES: Array<{ id: ViralCategory; label: string }> = [
  { id: 'drama', label: 'K-드라마 명대사' },
  { id: 'pet', label: '댕냥이 집사속마음' },
  { id: 'relationship', label: '연애·남녀심리' },
  { id: 'human', label: '현대인·직장인' },
  { id: 'trend', label: '트렌드·이슈' },
  { id: 'challenge', label: '도파민 응원' },
  { id: 'brand', label: 'B급 광고' },
  { id: 'history', label: '역사 부캐' },
  { id: 'parenting', label: '육아·잼민이 월드' },
  { id: 'food_diet', label: '야식·다이어트' },
  { id: 'horror_mystery', label: '이불킥·흑역사' },
  { id: 'ai_future', label: 'AI·미래 판타지' },
]

const CATEGORY_KEYWORDS: Record<ViralCategory, string[]> = {
  drama: ['드라마', '명대사', '연진', '넷플릭스'],
  pet: ['강아지', '고양이', '집사', '댕냥이', '사료'],
  relationship: ['연애', '카톡', '읽씹', '남녀', '심리', '이별'],
  human: ['직장', '월급', '카드값', '헬스장', '퇴근', '와이파이'],
  trend: ['아이폰', '요아정', '불닭', '코인', '이슈', '풍자'],
  challenge: ['갓생', '택배', '도파민', '응원', '언박싱', '챌린지'],
  brand: ['광고', '브랜드', 'cm', 'b급'],
  history: ['이순신', '정조', '신사임당', '세종', '역사', '부캐'],
  parenting: ['육아', '아이', '엄마', '아빠', '잼민이', '등원'],
  food_diet: ['야식', '다이어트', '먹방', '음식', '치킨', '라면'],
  horror_mystery: ['이불킥', '흑역사', '괴담', '공포', '미스터리'],
  ai_future: ['ai', '인공지능', '로봇', '미래', '메타버스'],
}

const FALLBACK_POSTER = 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png'
const VIDEO_CACHE_KEY = 'melodio_viral_video_library_v1'

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw !== 'string') return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function readString(...values: unknown[]): string {
  const value = values.find((item) => typeof item === 'string' && item.trim().length > 0)
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return 0
}

function resolveCategory(item: Record<string, unknown>, meta: Record<string, unknown>): ViralCategory {
  const rawCategory = readString(meta.presetId, meta.tab_type, meta.genCategory, item.preset_id, item.category)
  if (CATEGORIES.some((category) => category.id === rawCategory)) {
    return rawCategory as ViralCategory
  }

  const haystack = `${item.title || ''} ${item.prompt || ''} ${item.lyrics_prompt || ''}`.toLowerCase()
  const match = Object.entries(CATEGORY_KEYWORDS).find(([, keywords]) => keywords.some((keyword) => haystack.includes(keyword)))
  return (match?.[0] as ViralCategory | undefined) || 'trend'
}

function toViralVideo(item: Record<string, unknown>): ViralVideo | null {
  const title = readString(item.title)
  if (item.status !== 'completed' || item.is_public === false || title.endsWith(' (2)')) return null

  const licenseMeta = parseMetadata(item.license_hash)
  const metadata = { ...parseMetadata(item.metadata), ...licenseMeta }
  if (metadata.isPublic === false) return null

  const source = readString(metadata.sourceMenu, item.source_menu, item.source).toLowerCase()
  const viralMode = metadata.viralMode === true || item.is_viral === true || source === 'viral' || source === 'viral-cf'
  if (!viralMode) return null

  const videoUrl = readString(item.video_url, metadata.video_url, metadata.grok_video_url, metadata.videoUrl)
  if (!videoUrl) return null

  return {
    id: String(item.id),
    title: title || 'Untitled Viral Short',
    videoUrl,
    posterUrl: readString(item.thumbnail_url, item.cover_art_url, item.image_url) || FALLBACK_POSTER,
    category: resolveCategory(item, metadata),
    genre: readString(metadata.genre, item.genre, metadata.styleName) || 'Viral Short',
    creator: readString(item.creator_name, item.channel_name, metadata.brand_name) || 'Melodio Creator',
    viewCount: readNumber(item.play_count, item.view_count, metadata.play_count, metadata.viewCount),
    createdAt: readString(item.created_at, item.created_date, metadata.created_at) || new Date(0).toISOString(),
  }
}

const ITEMS_PER_PAGE = 12

export function readCachedViralVideos(): ViralVideo[] {
  if (typeof window === 'undefined') return []
  try {
    const cached = JSON.parse(localStorage.getItem(VIDEO_CACHE_KEY) || '[]')
    return Array.isArray(cached) ? cached : []
  } catch {
    return []
  }
}

export default function ViralVideoLibrary({ onVideosLoaded }: { onVideosLoaded?: (videos: ViralVideo[]) => void }) {
  const [videos, setVideos] = useState<ViralVideo[]>(readCachedViralVideos)
  const [isLoading, setIsLoading] = useState(() => readCachedViralVideos().length === 0)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ViralCategory | 'all'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const videoRefs = useRef(new Map<string, HTMLVideoElement>())

  const loadVideos = useCallback(async () => {
    try {
      const response = await fetch('/api/viral-videos', { cache: 'force-cache' })
      if (!response.ok) throw new Error('영상 목록을 불러오지 못했습니다.')
      const payload = await response.json() as { generations?: unknown[] }
      const seenVideos = new Set<string>()
      const nextVideos = (Array.isArray(payload.generations) ? payload.generations : [])
        .map((item) => item && typeof item === 'object' ? toViralVideo(item as Record<string, unknown>) : null)
        .filter((item: ViralVideo | null): item is ViralVideo => {
          if (!item || seenVideos.has(item.videoUrl)) return false
          seenVideos.add(item.videoUrl)
          return true
        })
      setVideos(nextVideos)
      onVideosLoaded?.(nextVideos)
      try {
        localStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify(nextVideos))
      } catch {
        // Storage can be unavailable in private browsing mode.
      }
    } catch (error) {
      console.error('[ViralVideoLibrary]', error)
      setVideos([])
    } finally {
      setIsLoading(false)
    }
  }, [onVideosLoaded])

  useEffect(() => {
    loadVideos()
    const mountedVideos = videoRefs.current
    return () => {
      mountedVideos.forEach((video) => video.pause())
    }
  }, [loadVideos])

  const filteredVideos = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    return videos.filter((video) => {
      if (selectedCategory !== 'all' && video.category !== selectedCategory) return false
      if (!normalizedQuery) return true
      return `${video.title} ${video.genre} ${video.creator}`.toLowerCase().includes(normalizedQuery)
    })
  }, [searchQuery, selectedCategory, videos])

  const totalPages = Math.max(1, Math.ceil(filteredVideos.length / ITEMS_PER_PAGE))
  const activePage = Math.min(currentPage, totalPages)
  const paginatedVideos = filteredVideos.slice((activePage - 1) * ITEMS_PER_PAGE, activePage * ITEMS_PER_PAGE)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedCategory])

  const handlePlay = useCallback((videoId: string, video: HTMLVideoElement) => {
    videoRefs.current.forEach((candidate, candidateId) => {
      if (candidateId !== videoId) candidate.pause()
    })
    setActiveVideoId(videoId)
    registerActiveAudio(video, () => {
      video.pause()
      setActiveVideoId((current) => current === videoId ? null : current)
    })
  }, [])

  return (
    <section aria-labelledby="viral-video-library-title" className="rounded-3xl border border-white/10 bg-zinc-950/60 p-4 shadow-xl backdrop-blur-md sm:p-5">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300">
                <Film className="h-4 w-4" />
              </span>
              <div>
                <h2 id="viral-video-library-title" className="text-sm font-black text-white">완성된 바이럴 숏폼</h2>
                <p className="text-[11px] text-zinc-500">영상과 음원이 결합된 콘텐츠만 표시됩니다.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">바이럴 영상 검색</span>
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="영상 검색"
                className="w-40 rounded-xl border border-white/10 bg-black/50 py-2 pl-9 pr-3 text-xs text-white outline-none transition focus:border-fuchsia-500/60 sm:w-48"
              />
            </label>
            <button
              type="button"
              onClick={loadVideos}
              disabled={isLoading}
              aria-label="영상 목록 새로고침"
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2" aria-label="영상 카테고리">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            aria-pressed={selectedCategory === 'all'}
            className={`col-span-3 min-h-10 rounded-xl px-2.5 py-2 text-[11px] font-extrabold leading-tight transition ${
              selectedCategory === 'all'
                ? 'bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-950/50'
                : 'border border-white/10 bg-black/40 text-zinc-400 hover:text-white'
            }`}
          >
            전체
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category.id)}
              aria-pressed={selectedCategory === category.id}
              className={`min-h-11 rounded-xl px-1.5 py-2 text-[9px] font-extrabold leading-tight transition sm:px-2 sm:text-[10px] ${
                selectedCategory === category.id
                  ? 'bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-950/50'
                  : 'border border-white/10 bg-black/40 text-zinc-400 hover:text-white'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-zinc-500">
          <RefreshCw className="h-6 w-6 animate-spin" />
          완성 영상을 불러오는 중입니다.
        </div>
      ) : paginatedVideos.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300">
            <Film className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-black text-white">공개된 완성 영상이 없습니다.</p>
            <p className="mt-1 text-xs text-zinc-500">음원과 영상 합성이 완료된 숏폼만 이곳에 표시됩니다.</p>
          </div>
          <a href="#viral-studio" className="inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-600 px-4 py-2 text-xs font-black text-white transition hover:bg-fuchsia-500">
            <Sparkles className="h-3.5 w-3.5" /> 첫 숏폼 만들기
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {paginatedVideos.map((video) => {
            const isActive = activeVideoId === video.id
            return (
              <article key={video.id} className={`overflow-hidden rounded-2xl border bg-black/50 transition ${isActive ? 'border-fuchsia-400 shadow-[0_0_24px_rgba(217,70,239,0.22)]' : 'border-white/10 hover:border-white/20'}`}>
                <div className="relative aspect-[9/16] bg-zinc-950">
                  <video
                    ref={(element) => {
                      if (element) videoRefs.current.set(video.id, element)
                      else videoRefs.current.delete(video.id)
                    }}
                    src={video.videoUrl}
                    poster={video.posterUrl}
                    controls
                    playsInline
                    preload="metadata"
                    onPlay={(event) => handlePlay(video.id, event.currentTarget)}
                    onPause={() => setActiveVideoId((current) => current === video.id ? null : current)}
                    onEnded={() => setActiveVideoId((current) => current === video.id ? null : current)}
                    onError={() => setVideos((current) => current.filter((item) => item.id !== video.id))}
                    aria-label={`${video.title} 영상 재생`}
                    className="h-full w-full object-cover"
                  >
                    브라우저가 동영상 재생을 지원하지 않습니다.
                  </video>
                  <span className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-black/75 px-2 py-1 text-[9px] font-black text-emerald-300 backdrop-blur">
                    <Check className="h-2.5 w-2.5" /> VIDEO READY
                  </span>
                </div>
                <div className="space-y-3 p-3.5">
                  <div>
                    <h3 className="line-clamp-2 text-sm font-black leading-snug text-white">{video.title}</h3>
                    <p className="mt-1 text-[10px] font-bold text-zinc-500">{video.creator} · {video.genre}</p>
                  </div>
                  <a href="#viral-studio" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-[11px] font-black text-fuchsia-200 transition hover:bg-fuchsia-500/20">
                    <Sparkles className="h-3.5 w-3.5" /> 이 포맷으로 만들기
                  </a>
                </div>
              </article>
            )
          })}
          {totalPages > 1 ? (
            <nav aria-label="바이럴 영상 페이지" className="col-span-full flex items-center justify-center gap-1.5 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={activePage === 1}
                aria-label="이전 페이지"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  aria-current={activePage === page ? 'page' : undefined}
                  className={`h-8 min-w-8 rounded-lg px-2 text-xs font-black transition ${activePage === page ? 'bg-fuchsia-500 text-white' : 'border border-white/10 text-zinc-400 hover:text-white'}`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={activePage === totalPages}
                aria-label="다음 페이지"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 transition hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          ) : null}
        </div>
      )}
    </section>
  )
}
