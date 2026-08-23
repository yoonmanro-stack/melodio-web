'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Play, Pause, Search, RefreshCw, Music, ChevronLeft, ChevronRight, 
  Volume2, VolumeX, Link, Check, Shuffle, SkipBack, SkipForward, Repeat, 
  ThumbsUp, ThumbsDown, X
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { registerActiveAudio } from '@/lib/globalAudio'

interface PublicTrackGridProps {
  sourceMenu: 'audio-forge' | 'style-library' | 'japan' | 'viral' | 'viral-cf' | 'preset-studio' | 'audio-forge-pro'
  itemsPerPage?: number
  layout?: 'grid' | 'horizontal'
  columns?: number
  useExternalPlayer?: boolean
  playingTrackId?: string | null
  isTrackPlaying?: boolean
  onPlayTrack?: (track: any) => void
  onPauseTrack?: () => void
  refreshSignal?: number
}

export default function PublicTrackGrid({
  sourceMenu,
  itemsPerPage = 16,
  layout = 'grid',
  columns,
  useExternalPlayer = false,
  playingTrackId: extPlayingTrackId,
  isTrackPlaying: extIsTrackPlaying,
  onPlayTrack: extOnPlayTrack,
  onPauseTrack: extOnPauseTrack,
  refreshSignal = 0,
}: PublicTrackGridProps) {
  const [tracks, setTracks] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(`melodio_cached_public_grid_${sourceMenu}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const hasUnsplash = parsed.some(t => (t.cover_art_url || t.image_url || '').includes('unsplash.com'));
            if (!hasUnsplash) return parsed;
          }
        }
      } catch {}
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(() => tracks.length === 0);
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // 로컬 플레이어 상태 (useExternalPlayer === false 일 때 사용)
  const [localPlayingTrack, setLocalPlayingTrack] = useState<any | null>(null)
  const [localIsPlaying, setLocalIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  const [copiedLinkTrackId, setCopiedLinkTrackId] = useState<string | null>(null)
  
  // 표준 오디오 플레이어 추가 상태
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isShuffle, setIsShuffle] = useState(false)
  const [isRepeat, setIsRepeat] = useState(false)
  const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set())
  const [dislikedSongs, setDislikedSongs] = useState<Set<string>>(new Set())
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const fetchPublicTracks = async () => {
    try {
      if (tracks.length === 0) {
        setIsLoading(true)
      }
      const res = await fetch('/api/generations', { cache: 'no-store' })
      if (res.ok) {
        const { generations } = await res.json()
        const list = generations || []
        
        // 카테고리, 음원 길이(Duration), 공개 여부 엄격 필터링
        const filtered = list.filter((item: any) => {
          if (item.status !== 'completed') return false
          if (item.is_public === false) return false
          if (item.title?.endsWith(' (2)')) return false // 서브 곡(2)은 대시보드 저장용이며 공개 피드 중복 노출 차단

          let isPublic = true
          let trackCategory = 'audio-forge'
          let trackDuration = 0
          let isViralMode = false

          if (item.license_hash) {
            try {
              const meta = JSON.parse(item.license_hash)
              isPublic = meta.isPublic !== false
              trackDuration = meta.duration || 0
              isViralMode = meta.viralMode === true || meta.sourceMenu === 'viral-cf' || meta.sourceMenu === 'viral'

              if (meta.sourceMenu === 'japan' || meta.presetId === 'japan_landing') {
                trackCategory = 'japan';
              } else if (meta.sourceMenu === 'style-library' || meta.presetId?.includes('style') || meta.sourceMenu === 'style') {
                trackCategory = 'style-library';
              } else if (isViralMode) {
                trackCategory = 'viral-cf';
              } else if (meta.sourceMenu === 'preset-studio') {
                trackCategory = 'preset-studio';
              }
            } catch {
              // ignore
            }
          }

          if (!isPublic) return false;

          // 🚨 [바이럴 & 트렌드 존 엄격 격리 지침]
          if (sourceMenu === 'viral' || sourceMenu === 'viral-cf') {
            // 3분~4분 일반 음원(duration > 90s) 절대 노출 금지. 1분 이내 숏폼(duration <= 90s)만 허용.
            if (trackDuration > 90) return false;
            return trackCategory === 'viral' || trackCategory === 'viral-cf' || isViralMode;
          } else {
            // 일반 메뉴에서는 1분 이내 바이럴 숏폼 음원(duration <= 90s) 노출 제외
            if (trackDuration > 0 && trackDuration <= 90 && isViralMode) return false;
          }

          if (sourceMenu === 'preset-studio' && (trackCategory === 'preset-studio' || trackCategory === 'audio-forge')) {
            return true;
          }

          return trackCategory === sourceMenu;
        })

        // 🛡️ [동일 곡/중복 곡 완전 방지 락]: 동일 기본 제목(baseTitle) 또는 동일 audio_url인 경우 첫 번째 우승곡 1개만 공개 노출
        const seenTitles = new Set<string>();
        const seenAudios = new Set<string>();
        const deduplicated = filtered.filter((item: any) => {
          const baseTitle = item.title?.replace(/\s*\(\d+\)$/, '').trim().toLowerCase();
          const audioKey = item.audio_url || item.id;
          if (!baseTitle || seenTitles.has(baseTitle) || seenAudios.has(audioKey)) {
            return false;
          }
          seenTitles.add(baseTitle);
          if (audioKey) seenAudios.add(audioKey);
          return true;
        });

        setTracks(deduplicated)
        try {
          localStorage.setItem(`melodio_cached_public_grid_${sourceMenu}`, JSON.stringify(deduplicated))
        } catch {}
      }
    } catch (err) {
      console.error('Failed to fetch public tracks:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPublicTracks()
  }, [sourceMenu, refreshSignal])

  // 재생 컨트롤 헬퍼
  const handleTogglePlay = (track: any) => {
    if (useExternalPlayer) {
      const isCurrentActive = extPlayingTrackId === track.id
      if (isCurrentActive && extIsTrackPlaying) {
        extOnPauseTrack?.()
      } else {
        extOnPlayTrack?.(track)
      }
      return
    }

    // 로컬 오디오 재생 관리
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }

    const isCurrentActive = localPlayingTrack?.id === track.id
    if (isCurrentActive) {
      if (localIsPlaying) {
        audioRef.current.pause()
        setLocalIsPlaying(false)
      } else {
        registerActiveAudio(audioRef.current, () => setLocalIsPlaying(false))
        audioRef.current.play().catch(err => console.error(err))
        setLocalIsPlaying(true)
      }
    } else {
      audioRef.current.src = track.audio_url
      audioRef.current.volume = isMuted ? 0 : volume
      registerActiveAudio(audioRef.current, () => setLocalIsPlaying(false))
      audioRef.current.play().catch(err => console.error(err))
      setLocalPlayingTrack(track)
      setLocalIsPlaying(true)
    }
  }

  // 전역 오디오 이벤트 수신 (다른 메뉴/페이지에서 재생 시 이 쪽 플레이어 일시정지)
  useEffect(() => {
    const handleOtherAudioStart = (e: any) => {
      if (e.detail?.audio && audioRef.current && e.detail.audio !== audioRef.current) {
        setLocalIsPlaying(false)
      }
    }
    window.addEventListener('melodio-audio-started', handleOtherAudioStart)
    return () => window.removeEventListener('melodio-audio-started', handleOtherAudioStart)
  }, [])

  // 시간 포맷 헬퍼
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  // 필터링 및 페이징 적용
  const searchedTracks = tracks.filter((t: any) => {
    const titleText = (t.title || 'Untitled').toLowerCase()
    const lyricsText = (t.lyrics_prompt || t.prompt || '').toLowerCase()
    const query = searchQuery.toLowerCase().trim()
    const matchesSearch = !query || titleText.includes(query) || lyricsText.includes(query)
    if (!matchesSearch) return false

    if ((sourceMenu === 'viral' || sourceMenu === 'viral-cf') && selectedCategory !== 'all') {
      let meta: any = {}
      if (t.license_hash) {
        try { meta = JSON.parse(t.license_hash); } catch {}
      }
      const trackCat = meta.presetId || meta.tab_type || meta.genCategory || t.preset_id || ''
      if (trackCat === selectedCategory) return true

      const catKeywords: Record<string, string[]> = {
        drama: ['드라마', '명대사', '연진', '넷플릭스', '패러디'],
        pet: ['강아지', '고양이', '집사', '댕냥이', '사료', '밥그릇'],
        relationship: ['연애', '카톡', '읽씹', '남녀', '심리', '이별'],
        human: ['직장', '월급', '카드값', '헬스장', 'mbti', '퇴근', '와이파이'],
        trend: ['아이폰', '요아정', '불닭', '코인', '이슈', '풍자'],
        challenge: ['이불', '갓생', '택배', '도파민', '응원', '언박싱'],
        brand: ['광고', '패러디', '브랜드', 'b급'],
        history: ['이순신', '정조', '신사임당', '알렉산더', '역사', '부캐']
      }
      const keywords = catKeywords[selectedCategory] || []
      return keywords.some(kw => titleText.includes(kw) || lyricsText.includes(kw))
    }
    return true
  })

  const totalPages = Math.ceil(searchedTracks.length / itemsPerPage) || 1
  const paginated = searchedTracks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  // 이전/다음 곡 재생 헬퍼
  const playNextTrack = useCallback(() => {
    if (!localPlayingTrack || paginated.length === 0) return
    const currentIndex = paginated.findIndex(t => t.id === localPlayingTrack.id)
    let nextIndex = (currentIndex + 1) % paginated.length
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * paginated.length)
    }
    const nextTrack = paginated[nextIndex]
    if (nextTrack) {
      handleTogglePlay(nextTrack)
    }
  }, [localPlayingTrack, paginated, isShuffle])

  const playPrevTrack = useCallback(() => {
    if (!localPlayingTrack || paginated.length === 0) return
    const currentIndex = paginated.findIndex(t => t.id === localPlayingTrack.id)
    let prevIndex = (currentIndex - 1 + paginated.length) % paginated.length
    const prevTrack = paginated[prevIndex]
    if (prevTrack) {
      handleTogglePlay(prevTrack)
    }
  }, [localPlayingTrack, paginated])

  // 오디오 타임라인 및 재생 완료 동기화
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleLoadedMetadata = () => setDuration(audio.duration)
    const handleEnded = () => {
      if (isRepeat) {
        audio.currentTime = 0
        audio.play().catch(console.error)
      } else {
        playNextTrack()
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [localPlayingTrack, isRepeat, playNextTrack])

  // 볼륨 변경 동기화
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  const AI_GRID_PRESETS = [
    'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png',
    'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png',
    'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png',
    'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png',
    'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png',
    'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png'
  ];

  const getFallbackCover = (style: any) => {
    const promptText = (style.title || style.tags || style.license_hash || '').toLowerCase();
    if (promptText.includes('lo-fi') || promptText.includes('lofi') || promptText.includes('tea') || promptText.includes('healing')) {
      return AI_GRID_PRESETS[0];
    }
    if (promptText.includes('hip-hop') || promptText.includes('hiphop') || promptText.includes('rap') || promptText.includes('dev')) {
      return AI_GRID_PRESETS[1];
    }
    if (promptText.includes('city') || promptText.includes('japan') || promptText.includes('tokyo') || promptText.includes('synth') || promptText.includes('retro')) {
      return AI_GRID_PRESETS[2];
    }
    if (promptText.includes('jazz') || promptText.includes('kyoto') || promptText.includes('matcha')) {
      return AI_GRID_PRESETS[3];
    }
    if (promptText.includes('chanson') || promptText.includes('french') || promptText.includes('vintage')) {
      return AI_GRID_PRESETS[4];
    }
    return AI_GRID_PRESETS[5];
  }

  const isCurrentPlaying = (trackId: string) => {
    if (useExternalPlayer) {
      return extPlayingTrackId === trackId && extIsTrackPlaying
    }
    return localPlayingTrack?.id === trackId && localIsPlaying
  }

  const getTrackMeta = (track: any) => {
    let genre = 'BGM'
    let vocal = 'No Vocal'
    if (track?.license_hash) {
      try {
        const meta = JSON.parse(track.license_hash)
        genre = meta.genre || 'BGM'
        vocal = meta.vocal || (meta.selections?.vocal?.[0]) || 'No Vocal'
      } catch {
        // ignore
      }
    }
    return { genre, vocal }
  }

  const menuTitleKo = 
    sourceMenu === 'audio-forge' ? 'Preset Studio' :
    sourceMenu === 'style-library' ? 'Audio Forge Pro' :
    sourceMenu === 'japan' ? '일본 BGM 포지' :
    (sourceMenu === 'viral' || sourceMenu === 'viral-cf') ? '바이럴 & 트렌드 존' : 'Preset Studio'

  return (
    <div className="space-y-4">
      {/* 리스트 헤더 및 새로고침 */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest pl-1 flex items-center gap-2">
          <span className="w-1.5 h-3 bg-fuchsia-500 rounded-full animate-pulse" />
          <span>{menuTitleKo} 공개 음원 라이브러리 ({searchedTracks.length}곡)</span>
        </h3>
        
        <div className="flex items-center gap-3">
          {/* 검색 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search public tracks..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-8 pr-3 py-1.5 bg-black/40 border border-white/5 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-fuchsia-500/40 w-44 transition-all"
            />
          </div>
          
          <button
            onClick={fetchPublicTracks}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 border border-white/5 rounded-lg transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 바이럴 전용 카테고리 탭 (상단 좌측 카드 1 내부 통합) */}
      {(sourceMenu === 'viral' || sourceMenu === 'viral-cf') && (
        <div className="flex flex-wrap gap-1.5 pt-1 pb-2 border-b border-white/5">
          {[
            { id: 'all', label: '전체' },
            { id: 'drama', label: 'K-드라마/명대사' },
            { id: 'pet', label: '댕냥이/집사속마음' },
            { id: 'relationship', label: '연애/남녀 심리' },
            { id: 'human', label: '현대인/직장인' },
            { id: 'trend', label: '트렌드/이슈' },
            { id: 'challenge', label: '도파민 응원' },
            { id: 'brand', label: 'B급 광고' },
            { id: 'history', label: '역사 부캐' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-fuchsia-500 text-white shadow-md shadow-fuchsia-950/60 scale-[1.03]'
                  : 'bg-black/40 border border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* 목록 본문 */}
      {isLoading ? (
        <div className="p-12 text-center text-sm text-zinc-500 flex flex-col items-center gap-3 bg-zinc-950/20 border border-white/5 rounded-2xl">
          <RefreshCw className="w-6 h-6 animate-spin text-zinc-600" />
          <span>공개 라이브러리 목록 로드 중...</span>
        </div>
      ) : paginated.length === 0 ? (
        <div className="p-12 text-center text-sm text-zinc-500 flex flex-col items-center gap-2 bg-zinc-950/20 border border-white/5 rounded-2xl">
          <Music className="w-8 h-8 text-zinc-800" />
          <span>공개된 음원이 아직 없습니다. 첫 곡을 생성하여 공개해 보세요!</span>
        </div>
      ) : (
        <div className="space-y-4">
          {layout === 'horizontal' ? (
            <div className="relative group/hscroll">
              <div className="flex gap-4 overflow-x-auto scrollbar-none pb-2 pt-1 snap-x snap-mandatory">
                {searchedTracks.map((track) => {
                  const playing = isCurrentPlaying(track.id)
                  const rawCover = track.cover_art_url || track.image_url
                  const coverUrl = (rawCover && !rawCover.includes('unsplash.com')) ? rawCover : getFallbackCover(track)
                  
                  let genre = 'BGM'
                  let vocal = 'No Vocal'
                  let tags = ''
                  if (track.license_hash) {
                    try {
                      const meta = JSON.parse(track.license_hash)
                      genre = meta.genre || 'BGM'
                      vocal = meta.vocal || (meta.selections?.vocal?.[0]) || 'No Vocal'
                      tags = meta.stylePrompt || ''
                    } catch {
                      // ignore
                    }
                  }

                  return (
                    <div
                      key={track.id}
                      onClick={() => handleTogglePlay(track)}
                      className={`w-72 sm:w-80 shrink-0 snap-start relative rounded-2xl border transition-all duration-300 p-3.5 flex items-center gap-3.5 group/item cursor-pointer ${
                        playing
                          ? 'border-cyan-500/60 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
                          : 'border-white/10 bg-zinc-950/70 hover:border-cyan-500/40 hover:bg-zinc-900/90'
                      }`}
                    >
                      {/* Left Playable Circle Cover */}
                      <div className="relative w-16 h-16 rounded-full shrink-0 overflow-hidden bg-zinc-900 border border-white/10 cursor-pointer shadow-md group/play">
                        <img
                          src={coverUrl}
                          alt={track.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.025] group-hover:saturate-[1.03]"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getFallbackCover(track)
                          }}
                        />
                        
                        {/* Hover Play/Pause Overlay */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePlay(track);
                          }}
                          className="absolute inset-0 opacity-0 group-hover/play:opacity-100 transition-opacity duration-200 flex items-center justify-center z-10"
                        >
                          {playing ? (
                            <Pause className="w-10 h-10 rounded-full bg-white/90 p-2.5 text-fuchsia-600 fill-current shadow-lg backdrop-blur-sm" />
                          ) : (
                            <Play className="w-10 h-10 rounded-full bg-white/90 p-2.5 text-zinc-900 fill-current shadow-lg backdrop-blur-sm" />
                          )}
                        </div>

                        {playing && (
                          <div className="absolute bottom-0.5 right-0.5 bg-black/80 p-0.5 rounded-full z-20">
                            <span className="flex items-center gap-0.5 text-xs text-cyan-400">
                              <span className="w-0.5 h-1 bg-cyan-400 rounded-full animate-[bounce_0.6s_infinite_100ms]" />
                              <span className="w-0.5 h-2 bg-cyan-400 rounded-full animate-[bounce_0.6s_infinite_300ms]" />
                              <span className="w-0.5 h-1.5 bg-cyan-400 rounded-full animate-[bounce_0.6s_infinite_500ms]" />
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right Metadata */}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-black text-white truncate leading-snug">
                          {track.title}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-400 font-bold">
                          <span className="text-cyan-400 uppercase tracking-wider">{genre}</span>
                          <span>•</span>
                          <span className="truncate">{vocal}</span>
                        </div>
                        {tags && (
                          <p className="text-[10px] text-zinc-500 font-mono mt-1 truncate max-w-[95%]" title={tags}>
                            {tags}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={columns === 1 ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"}>
              {paginated.map((track) => {
                const playing = isCurrentPlaying(track.id)
                const rawCover = track.cover_art_url || track.image_url
                const coverUrl = (rawCover && !rawCover.includes('unsplash.com')) ? rawCover : getFallbackCover(track)
                
                let genre = 'BGM'
                let vocal = 'No Vocal'
                let tags = ''
                if (track.license_hash) {
                  try {
                    const meta = JSON.parse(track.license_hash)
                    genre = meta.genre || 'BGM'
                    vocal = meta.vocal || (meta.selections?.vocal?.[0]) || 'No Vocal'
                    tags = meta.stylePrompt || ''
                  } catch {
                    // ignore
                  }
                }

                return (
                  <div
                    key={track.id}
                    onClick={() => handleTogglePlay(track)}
                    className={`relative rounded-2xl border transition-all duration-300 p-3.5 flex items-center gap-4 group cursor-pointer ${
                      playing
                        ? 'border-fuchsia-500/40 bg-fuchsia-500/5 shadow-[0_0_20px_rgba(244,63,94,0.05)]'
                        : 'border-white/5 bg-zinc-950/40 hover:border-white/10 hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Left Playable Circle Cover */}
                    <div className="relative w-20 h-20 rounded-full shrink-0 overflow-hidden bg-zinc-900 border border-white/5 cursor-pointer shadow-md group/play">
                      <img
                        src={coverUrl}
                        alt={track.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.025] group-hover:saturate-[1.03]"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = getFallbackCover(track)
                        }}
                      />
                      
                      {/* Hover Play/Pause Overlay */}
                      <div
                        onClick={() => handleTogglePlay(track)}
                        className="absolute inset-0 opacity-0 group-hover/play:opacity-100 transition-opacity duration-200 flex items-center justify-center z-10"
                      >
                        {playing ? (
                          <Pause className="w-10 h-10 rounded-full bg-white/90 p-2.5 text-fuchsia-600 fill-current shadow-lg backdrop-blur-sm" />
                        ) : (
                          <Play className="w-10 h-10 rounded-full bg-white/90 p-2.5 text-zinc-900 fill-current shadow-lg backdrop-blur-sm" />
                        )}
                      </div>

                      {playing && (
                        <div className="absolute bottom-1 right-1 bg-black/75 p-0.5 rounded-full z-20">
                          <span className="flex items-center gap-0.5 text-xs text-fuchsia-400">
                            <span className="w-0.5 h-1 bg-fuchsia-400 rounded-full animate-[bounce_0.6s_infinite_100ms]" />
                            <span className="w-0.5 h-2 bg-fuchsia-400 rounded-full animate-[bounce_0.6s_infinite_300ms]" />
                            <span className="w-0.5 h-1.5 bg-fuchsia-400 rounded-full animate-[bounce_0.6s_infinite_500ms]" />
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right Metadata */}
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-zinc-200 truncate leading-snug">
                        {track.title}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[9.5px] text-zinc-400 font-medium">
                        <span className="text-zinc-300 uppercase tracking-wider">{genre}</span>
                        <span>•</span>
                        <span className="truncate">{vocal}</span>
                      </div>
                      {tags && (
                        <p className="text-[10px] text-zinc-500 font-mono mt-1.5 truncate max-w-[95%]" title={tags}>
                          {tags}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-4">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-zinc-900/40 border border-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-all flex items-center justify-center"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-6 h-6 rounded text-xs font-bold font-mono flex items-center justify-center transition-all bg-zinc-900/40 border border-zinc-800 ${
                      currentPage === pageNum
                        ? 'text-white border-zinc-700/80 font-extrabold shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/10'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-zinc-900/40 border border-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-all flex items-center justify-center"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 로컬 오디오 미니 플레이어 바 (useExternalPlayer === false 일 때만 표시) */}
      <AnimatePresence>
        {!useExternalPlayer && localPlayingTrack && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 w-full z-[100] bg-[#0c0d12]/95 border-t border-white/10 backdrop-blur-2xl px-4 md:px-8 py-3 flex items-center justify-between shadow-[0_-10px_30px_rgba(0,0,0,0.8)]"
          >
            {/* Track Info (Left) */}
            {(() => {
              const meta = getTrackMeta(localPlayingTrack)
              const coverUrl = localPlayingTrack.cover_art_url || getFallbackCover(localPlayingTrack)
              return (
                <div className="flex items-center gap-3 w-1/4 min-w-0">
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-zinc-900 border border-white/10 shadow-md">
                    <img
                      src={coverUrl}
                      alt={localPlayingTrack.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getFallbackCover(localPlayingTrack)
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white truncate leading-snug">
                      {localPlayingTrack.title}
                    </h4>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {meta.genre} • {meta.vocal}
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* Playback Controls & Timeline (Center) */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-xl mx-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsShuffle(!isShuffle)}
                  className={`transition-colors ${isShuffle ? "text-fuchsia-400" : "text-zinc-500 hover:text-zinc-300"}`}
                  title="셔플"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                <button
                  onClick={playPrevTrack}
                  className="text-zinc-400 hover:text-white transition-colors"
                  title="이전 곡"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                <button
                  onClick={() => handleTogglePlay(localPlayingTrack)}
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-md"
                  title={localIsPlaying ? "일시정지" : "재생"}
                >
                  {localIsPlaying ? (
                    <Pause className="w-4 h-4 fill-black text-black" />
                  ) : (
                    <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                  )}
                </button>
                <button
                  onClick={playNextTrack}
                  className="text-zinc-400 hover:text-white transition-colors"
                  title="다음 곡"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
                <button
                  onClick={() => setIsRepeat(!isRepeat)}
                  className={`transition-colors ${isRepeat ? "text-fuchsia-400" : "text-zinc-500 hover:text-zinc-300"}`}
                  title="반복"
                >
                  <Repeat className="w-4 h-4" />
                </button>
              </div>

              {/* Timeline Progress Bar */}
              <div className="flex items-center gap-3 w-full">
                <span className="text-[10px] text-zinc-400 font-mono w-9 text-right">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    if (audioRef.current) {
                      audioRef.current.currentTime = val
                      setCurrentTime(val)
                    }
                  }}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: '#ffffff',
                    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${(duration > 0 ? (currentTime / duration) : 0) * 100}%, rgba(255,255,255,0.15) ${(duration > 0 ? (currentTime / duration) : 0) * 100}%)`,
                  }}
                />
                <span className="text-[10px] text-zinc-400 font-mono w-9">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Extra Tools (Right) - Like, Dislike, Copy Link, Volume */}
            <div className="flex items-center justify-end gap-3 w-1/4">
              <button
                onClick={() => {
                  const songId = localPlayingTrack.id
                  setLikedSongs(prev => {
                    const next = new Set(prev)
                    if (next.has(songId)) {
                      next.delete(songId)
                    } else {
                      next.add(songId)
                      setDislikedSongs(d => { const n = new Set(d); n.delete(songId); return n; })
                    }
                    return next
                  })
                }}
                className={`p-2 rounded-lg transition-colors ${
                  likedSongs.has(localPlayingTrack.id) ? "text-emerald-400 bg-emerald-400/10" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="좋아요"
              >
                <ThumbsUp className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={() => {
                  const songId = localPlayingTrack.id
                  setDislikedSongs(prev => {
                    const next = new Set(prev)
                    if (next.has(songId)) {
                      next.delete(songId)
                    } else {
                      next.add(songId)
                      setLikedSongs(l => { const n = new Set(l); n.delete(songId); return n; })
                    }
                    return next
                  })
                }}
                className={`p-2 rounded-lg transition-colors ${
                  dislikedSongs.has(localPlayingTrack.id) ? "text-red-400 bg-red-400/10" : "text-zinc-500 hover:text-zinc-300"
                }`}
                title="싫어요"
              >
                <ThumbsDown className="w-4.5 h-4.5" />
              </button>

              {/* Copy Song Link Button */}
              <button
                onClick={() => {
                  const shareUrl = `${window.location.origin}/vault/share-${localPlayingTrack.id}`
                  navigator.clipboard.writeText(shareUrl)
                  setCopiedLinkTrackId(localPlayingTrack.id.toString())
                  setTimeout(() => setCopiedLinkTrackId(null), 2000)
                }}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Copy Song Link"
              >
                {copiedLinkTrackId === localPlayingTrack.id.toString() ? (
                  <Check className="w-4.5 h-4.5 text-emerald-400" />
                ) : (
                  <Link className="w-4.5 h-4.5" />
                )}
              </button>

              {/* Speaker & Volume Slider */}
              <div className="flex items-center gap-2 group/volume ml-1">
                <button onClick={() => setIsMuted(!isMuted)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                  {isMuted ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value))
                    setIsMuted(false)
                  }}
                  className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                />
              </div>

              {/* Close Player Button */}
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause()
                  }
                  setLocalIsPlaying(false)
                  setLocalPlayingTrack(null)
                }}
                className="text-zinc-500 hover:text-white p-1.5 transition-colors ml-1"
                title="플레이어 닫기"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
