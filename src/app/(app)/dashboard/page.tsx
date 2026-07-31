"use client";

import { 
  Sparkles, Music4, Film, Info, Clock, CheckCircle2,
  Search, SlidersHorizontal, MoreVertical, Play, Pause, 
  Trash2, Edit3, Download, RefreshCw, Heart, Share2,
  ChevronLeft, ChevronRight, ListFilter, AlertCircle, X,
  Copy, Check, SkipBack, SkipForward, Shuffle, Repeat, Lock, Globe,
  Volume2, VolumeX, ThumbsUp, ThumbsDown, Link as LinkIcon
} from "lucide-react";
import { registerActiveAudio } from "@/lib/globalAudio";
import MultiTrackPlayer from "@/components/MultiTrackPlayer";

const YoutubeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={props.className}
  >
    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.524 3.545 12 3.545 12 3.545s-7.525 0-9.388.51a3.002 3.002 0 0 0-2.11 2.108C0 8.025 0 12 0 12s0 3.975.502 5.837a2.999 2.999 0 0 0 2.11 2.108c1.863.51 9.388.51 9.388.51s7.524 0 9.388-.51a3.002 3.002 0 0 0 2.11-2.108c.502-1.862.502-5.837.502-5.837s0-3.975-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useStemAudio, type StemId } from "@/hooks/useStemAudio";
import Link from "next/link";
import ProPaywallModal from "@/components/prompt-builder/ProPaywallModal";
import { motion, AnimatePresence } from "framer-motion";

function formatTime(sec: number): string {
  if (isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Generation = {
  id: string;
  status: string;
  created_at: string;
  user_id?: string;
  title?: string;
  audio_url?: string;
  source_audio_url?: string;
  stem_vocals_url?: string;
  stem_drums_url?: string;
  stem_bass_url?: string;
  stem_other_url?: string;
  is_stem_extracted?: boolean;
  duration_mode?: string;
  license_hash?: string;
  audio_grade?: string;
  clipping_count?: number;
  cover_art_url?: string | null;
  dissonance_score?: number;
  retry_count?: number;
};

// ─── 음원 앨범 커버 페이드인 이미지 컴포넌트 ───
const FadeInImage = ({ src, alt, className = "" }: { src: string; alt: string; className?: string }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
      {!isLoaded && (
        <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      )}
      <img 
        src={src} 
        alt={alt} 
        onLoad={() => setIsLoaded(true)}
        className={`${className} transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`} 
      />
    </div>
  );
};

// ─── 과거 이미지 미등록 음원용 컨셉 매핑 썸네일 헬퍼 ───
const getFallbackCoverArt = (item: Generation): string => {
  let styleText = "";
  if (item.license_hash) {
    try {
      const parsed = JSON.parse(item.license_hash);
      styleText = (parsed.stylePrompt || "").toLowerCase();
    } catch { /* ignore */ }
  }
  
  const titleText = (item.title || "").toLowerCase();
  
  if (styleText.includes("lo-fi") || styleText.includes("lofi") || styleText.includes("acoustic") || styleText.includes("folk") || styleText.includes("healing")) {
    return "https://images.unsplash.com/photo-1518173946687-a4c8a383392f?w=300&q=80";
  }
  if (styleText.includes("hip-hop") || styleText.includes("hiphop") || styleText.includes("rap") || styleText.includes("trap") || styleText.includes("디스")) {
    return "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80";
  }
  if (styleText.includes("city") || styleText.includes("synth") || styleText.includes("retro") || styleText.includes("레트로") || styleText.includes("시티팝")) {
    return "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&q=80";
  }
  if (styleText.includes("rock") || styleText.includes("metal") || styleText.includes("guitar") || styleText.includes("락") || styleText.includes("밴드")) {
    return "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&q=80";
  }
  if (styleText.includes("dance") || styleText.includes("pop") || styleText.includes("k-pop") || styleText.includes("댄스") || styleText.includes("club")) {
    return "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80";
  }
  
  if (titleText.includes("[cf]") || styleText.includes("commercial") || styleText.includes("advertising")) {
    return "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=300&q=80";
  }
  
  return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&q=80";
};

// ─── Track Library 데이터 로딩용 스켈레톤 컴포넌트 ───
const TrackLibrarySkeleton = () => {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div 
          key={i}
          className="flex flex-col p-4 rounded-2xl border border-white/5 bg-white/[0.01] animate-pulse"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {/* 앨범 커버 스켈레톤 */}
              <div className="w-[68px] h-[68px] rounded-xl bg-white/5 border border-white/10 flex-shrink-0" />
              {/* 메타 데이터 스켈레톤 */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-32 h-4.5 bg-white/10 rounded" />
                  <div className="w-16 h-3.5 bg-white/5 rounded" />
                </div>
                <div className="w-48 h-3.5 bg-white/5 rounded" />
                <div className="flex items-center gap-2">
                  <div className="w-20 h-3 bg-white/5 rounded" />
                  <div className="w-24 h-3 bg-white/5 rounded" />
                </div>
              </div>
            </div>
            {/* 우측 액션 버튼 스켈레톤 */}
            <div className="flex items-center gap-2 md:self-center">
              <div className="w-8 h-8 rounded-lg bg-white/5" />
              <div className="w-8 h-8 rounded-lg bg-white/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── 음원 실시간 길이(Duration) 획득용 컴포넌트 ───
const TrackDuration = ({ audioUrl, initialDuration }: { audioUrl?: string; initialDuration?: number }) => {
  const [duration, setDuration] = useState<number | null>(initialDuration || null);

  useEffect(() => {
    if (initialDuration && initialDuration > 0) {
      setDuration(initialDuration);
      return;
    }
    if (!audioUrl) return;

    const audio = new Audio();
    audio.src = audioUrl;
    audio.preload = 'metadata'; // 오직 헤더 정보만 로드

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.load();

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.src = '';
    };
  }, [audioUrl, initialDuration]);

  if (duration === null || duration <= 0) {
    return <span>2:30</span>; // 로딩중 및 기존 음원 에러 시 기본값
  }

  const mins = Math.floor(duration / 60);
  const secs = Math.round(duration % 60);
  return <span>{mins}:{secs < 10 ? '0' : ''}{secs}</span>;
};

const isJapanTrack = (item: any) => {
  if (!item.license_hash) return false;
  try {
    const meta = JSON.parse(item.license_hash);
    return meta.sourceMenu === "japan" || meta.presetId === "japan_landing";
  } catch {
    return false;
  }
};

export default function Home() {
  const [history, setHistory] = useState<Generation[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('melodio_cached_generations');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [];
  });
  const [activeGenId, setActiveGenId] = useState<string>('');
  
  // ─── 승격된 Audio 엔진 상태 바인딩 (Stem Player용) ───
  const audio = useStemAudio({ generationId: activeGenId });

  // ─── HTML5 Audio 기반 원곡 재생 ───
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playingTrack, setPlayingTrack] = useState<Generation | null>(null);
  const [isTrackPlaying, setIsTrackPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const isShuffleRef = useRef(isShuffle);
  const isRepeatRef = useRef(isRepeat);
  const playingTrackIdRef = useRef(playingTrackId);
  const filteredRef = useRef<Generation[]>([]);
  const handleEndedRef = useRef<() => void>(() => {});

  // ─── 리텐션 트래킹용 Refs & 헬퍼 함수 ───
  const lastPlayedTrackIdRef = useRef<string | null>(null);
  const playStartTimeRef = useRef<number | null>(null);
  const hasTriggeredPlayRef = useRef<boolean>(false);
  const hasTriggeredSkipRef = useRef<boolean>(false);

  const sendRetentionLog = useCallback(async (id: string, action: 'play' | 'skip' | 'complete') => {
    try {
      await fetch('/api/generations/retention', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action })
      });
    } catch (e) {
      console.error('[Dashboard/Retention] Failed to send log:', e);
    }
  }, []);

  const [detailItem, setDetailItem] = useState<Generation | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [isProPaywallOpen, setIsProPaywallOpen] = useState(false);
  const [copiedStyle, setCopiedStyle] = useState(false);
  const [copiedLyrics, setCopiedLyrics] = useState(false);
  const [copiedYtTitle, setCopiedYtTitle] = useState(false);
  const [copiedTracklist, setCopiedTracklist] = useState(false);
  const [allPresets, setAllPresets] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(() => history.length === 0);
  const [generatingCovers, setGeneratingCovers] = useState<Record<string, boolean>>({});

  // 0. 프리셋 로드 및 캐싱 (스타일 역추적용)
  useEffect(() => {
    async function loadPresets() {
      try {
        const { presets } = await import("@/data/presets");
        let list = [...presets];

        // 로컬 스토리지의 커스텀 프리셋 로드 추가
        const savedCustom = localStorage.getItem('melodio_custom_presets');
        if (savedCustom) {
          try {
            const parsed = JSON.parse(savedCustom);
            if (Array.isArray(parsed)) {
              list = [...list, ...parsed];
            }
          } catch (e) {
            console.error('Failed to parse custom presets in dashboard:', e);
          }
        }

        const { data } = await supabase
          .from('curation_playbooks')
          .select('*')
          .in('category', ['genre', 'curation'])
          .order('updated_at', { ascending: false });
        if (data) {
          const formatted = data.map((pb: any) => {
            const firstParagraph = (pb.content || '')
              .split('\n')
              .find((l: string) => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
              ?.trim();
            return {
              id: pb.key_name,
              emoji: pb.metadata?.emoji || '🎵',
              name: pb.title,
              desc: pb.metadata?.description || firstParagraph || pb.title,
              gradient: pb.metadata?.gradient || 'linear-gradient(135deg, #10b981, #059669)',
              selections: {},
              customPrompt: pb.metadata?.suno_tags || pb.metadata?.moods || 'lofi, relaxing, chill',
              isDb: true,
              updated_at: pb.updated_at,
            };
          });
          list = [...list, ...formatted];
        }
        setAllPresets(list);
      } catch (err) {
        console.error('Failed to load custom presets for matching:', err);
      }
    }
    loadPresets();
  }, []);

  const handleCopyText = async (text: string, type: 'style' | 'lyrics') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'style') {
        setCopiedStyle(true);
        setTimeout(() => setCopiedStyle(false), 2000);
      } else {
        setCopiedLyrics(true);
        setTimeout(() => setCopiedLyrics(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // 오디오 엘리먼트 초기화 (한 번만)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = new Audio();
    el.preload = 'auto';
    
    const handlePlay = () => {
      setIsTrackPlaying(true);
      const currentId = playingTrackIdRef.current;
      if (currentId) {
        if (!hasTriggeredPlayRef.current) {
          sendRetentionLog(currentId, 'play');
          hasTriggeredPlayRef.current = true;
        }
        playStartTimeRef.current = Date.now();
      }
    };
    const handlePause = () => setIsTrackPlaying(false);
    const handleEnded = () => {
      const currentId = playingTrackIdRef.current;
      if (currentId) {
        sendRetentionLog(currentId, 'complete');
      }
      if (handleEndedRef.current) {
        handleEndedRef.current();
      }
    };
    const handleTimeUpdate = () => {
      setCurrentTime(el.currentTime);
    };
    const handleDurationChange = () => {
      if (el.duration && !isNaN(el.duration)) {
        setDuration(el.duration);
      }
    };

    el.addEventListener('play', handlePlay);
    el.addEventListener('pause', handlePause);
    el.addEventListener('ended', handleEnded);
    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('durationchange', handleDurationChange);
    el.addEventListener('loadedmetadata', handleDurationChange);

    audioRef.current = el;

    const handleOtherAudioStart = (e: any) => {
      if (e.detail?.audio && audioRef.current && e.detail.audio !== audioRef.current) {
        setIsTrackPlaying(false);
      }
    };
    window.addEventListener('melodio-audio-started', handleOtherAudioStart);

    return () => {
      window.removeEventListener('melodio-audio-started', handleOtherAudioStart);
      el.removeEventListener('play', handlePlay);
      el.removeEventListener('pause', handlePause);
      el.removeEventListener('ended', handleEnded);
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('durationchange', handleDurationChange);
      el.removeEventListener('loadedmetadata', handleDurationChange);
      el.pause();
      el.src = '';
    };
  }, []);

  const handlePlayTrack = useCallback((item: Generation) => {
    const el = audioRef.current;
    if (!el) return;

    // completed 상태가 아니거나 URL이 없으면 재생 불가
    const trackUrl = item.audio_url || item.source_audio_url;
    if (item.status !== 'completed' || !trackUrl) {
      return;
    }

    // 다른 트랙으로 전환 시 이전 트랙의 skip 여부 판단
    if (playingTrackId && playingTrackId !== item.id) {
      const playedDuration = Date.now() - (playStartTimeRef.current || 0);
      if (playedDuration < 3000 && !hasTriggeredSkipRef.current) {
        sendRetentionLog(playingTrackId, 'skip');
        hasTriggeredSkipRef.current = true;
      }
    }

    if (playingTrackId === item.id) {
      // 동일 트랙 → 토글
      if (isTrackPlaying) {
        el.pause();
      } else {
        audio.pause(); // 스템 재생 중지
        registerActiveAudio(el, () => setIsTrackPlaying(false));
        el.play();
      }
    } else {
      // 다른 트랙 → 새로 로드 & 재생
      el.pause();
      audio.pause(); // 스템 재생 중지
      setCurrentTime(0);
      setDuration(0);

      // 새 트랙 트래킹 초기화
      hasTriggeredPlayRef.current = false;
      hasTriggeredSkipRef.current = false;

      el.src = trackUrl;
      el.load();
      registerActiveAudio(el, () => setIsTrackPlaying(false));
      el.play().catch(() => { /* autoplay policy */ });
      setPlayingTrackId(item.id);
      setPlayingTrack(item);
    }

    // Stem Player도 해당 트랙으로 세팅 (하단 분석용)
    setActiveGenId(item.id);
  }, [playingTrackId, isTrackPlaying, audio, sendRetentionLog]);

  // Refs 동기화
  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  useEffect(() => {
    isRepeatRef.current = isRepeat;
  }, [isRepeat]);

  useEffect(() => {
    playingTrackIdRef.current = playingTrackId;
  }, [playingTrackId]);

  const playNext = useCallback((isAutoPlay = false) => {
    const list = filteredRef.current;
    const currentId = playingTrackIdRef.current;
    if (list.length === 0) return;

    let nextIndex = 0;
    if (isShuffleRef.current) {
      nextIndex = Math.floor(Math.random() * list.length);
      if (list.length > 1 && list[nextIndex].id === currentId) {
        nextIndex = (nextIndex + 1) % list.length;
      }
    } else {
      const currentIndex = list.findIndex(item => item.id === currentId);
      if (currentIndex !== -1) {
        nextIndex = currentIndex + 1;
        if (nextIndex >= list.length) {
          if (isAutoPlay) {
            setIsTrackPlaying(false);
            setCurrentTime(0);
            return;
          } else {
            nextIndex = 0;
          }
        }
      }
    }

    const nextTrack = list[nextIndex];
    if (nextTrack) {
      handlePlayTrack(nextTrack);
    }
  }, [handlePlayTrack]);

  const playPrev = useCallback(() => {
    const list = filteredRef.current;
    const currentId = playingTrackIdRef.current;
    if (list.length === 0) return;

    let prevIndex = 0;
    if (isShuffleRef.current) {
      prevIndex = Math.floor(Math.random() * list.length);
      if (list.length > 1 && list[prevIndex].id === currentId) {
        prevIndex = (prevIndex + 1) % list.length;
      }
    } else {
      const currentIndex = list.findIndex(item => item.id === currentId);
      if (currentIndex !== -1) {
        prevIndex = currentIndex - 1;
        if (prevIndex < 0) {
          prevIndex = list.length - 1;
        }
      }
    }

    const prevTrack = list[prevIndex];
    if (prevTrack) {
      handlePlayTrack(prevTrack);
    }
  }, [handlePlayTrack]);

  const handleSkipBack = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    } else {
      playPrev();
    }
  }, [playPrev]);

  // ended 콜백 실시간 바인딩
  useEffect(() => {
    handleEndedRef.current = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (isRepeatRef.current) {
        audio.currentTime = 0;
        audio.play().catch(err => console.error(err));
      } else {
        playNext(true);
      }
    };
  }, [playNext]);

  // 스템 플레이어가 재생을 시작하면, 싱글 트랙 재생을 일시정지시킵니다.
  useEffect(() => {
    if (audio.isPlaying && isTrackPlaying) {
      audioRef.current?.pause();
    }
  }, [audio.isPlaying, isTrackPlaying]);
  
  // 동적 상태 추가
  const [userName, setUserName] = useState<string>('Alex');
  const [planName, setPlanName] = useState<string>('Pro Plan');
  const [tokensGB, setTokensGB] = useState<string>('4.2GB / 10GB');
  const [tokenPercent, setTokenPercent] = useState<number>(42);
  const [youtubeChannel, setYoutubeChannel] = useState<any>(null);
  const [hasActiveAutomation, setHasActiveAutomation] = useState<boolean>(false);
  const [stats, setStats] = useState({ 
    personas: 0, 
    longformMvs: 0, 
    shortsHooks: 0,
    customPresets: 0,
    musicGenerated: 0
  });

  // 검색, 필터, 정렬 및 페이지네이션
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryTab, setCategoryTab] = useState<'all' | 'audio-forge' | 'style-library' | 'japan' | 'viral-cf'>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 관리 드롭다운 메뉴 및 좋아요, 수정 모달
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [likedTracks, setLikedTracks] = useState<Record<string, boolean>>({});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<{ id: string; title: string } | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [sharingTrack, setSharingTrack] = useState<Generation | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const handleCopyLink = async (trackId: string) => {
    const shareUrl = `https://melodio.app/vault/share-${trackId}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setToastMessage("링크가 클립보드에 복사되었습니다!");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const fetchUserDataAndStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        if (user.email) {
          const part = user.email.split('@')[0];
          setUserName(part.charAt(0).toUpperCase() + part.slice(1));
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('stripe_customer_id, tokens_balance')
          .eq('id', user.id)
          .single();

        if (profile) {
          const hasSub = !!profile.stripe_customer_id;
          setPlanName(hasSub ? 'Pro Plan' : 'Free Tier');
          setIsPro(hasSub);
          
          const maxTokens = hasSub ? 10000 : 1000;
          const maxGB = hasSub ? 10 : 1;
          const balance = profile.tokens_balance;
          const usedTokens = Math.max(0, maxTokens - balance);
          const usedGB = (usedTokens / 1000).toFixed(1);
          
          setTokensGB(`${usedGB}GB / ${maxGB}GB`);
          setTokenPercent(Math.min(100, Math.round((usedTokens / maxTokens) * 100)));
        }

        // 유튜브 연동 채널 및 자동화 활성화 정보 조회
        const [channelRes, autoRes] = await Promise.all([
          supabase
            .from('youtube_channels')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('youtube_automations')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle()
        ]);
        setYoutubeChannel(channelRes.data);
        setHasActiveAutomation(!!autoRes.data);

        const { count: promptCount } = await supabase
          .from('prompt_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        const { count: completedCount } = await supabase
          .from('generations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'completed');

        const completed = completedCount || 0;
        
        let customPresetsCount = 0;
        try {
          const saved = localStorage.getItem('melodio_custom_presets');
          if (saved) {
            const parsed = JSON.parse(saved);
            customPresetsCount = Array.isArray(parsed) ? parsed.length : 0;
          }
        } catch (e) {
          console.warn('Failed to parse custom presets from localStorage:', e);
        }

        setStats({
          personas: 0,
          longformMvs: 0,
          shortsHooks: 0,
          customPresets: customPresetsCount,
          musicGenerated: completed
        });
      }
    } catch (err) {
      console.warn('[Dashboard] Failed to fetch dynamic profile/stats:', err);
    }
  };

  const fetchHistory = async () => {
    try {
      if (history.length === 0) {
        setIsHistoryLoading(true);
      }
      const res = await fetch('/api/generations');
      if (res.ok) {
        const { generations } = await res.json();
        const historyList = generations || [];
        setHistory(historyList);
        try {
          localStorage.setItem('melodio_cached_generations', JSON.stringify(historyList));
        } catch {}
        if (historyList.length > 0 && !activeGenId) {
          setActiveGenId(historyList[0].id);
        }
        // 좋아요 초기값 동기화
        const initialLikes: Record<string, boolean> = {};
        historyList.forEach((gen: any) => {
          if (gen.is_liked) {
            initialLikes[gen.id] = true;
          }
        });
        setLikedTracks(initialLikes);
      }
    } catch (err) {
      console.error('Failed to fetch generations:', err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleGenerateCoverArt = async (item: Generation) => {
    if (generatingCovers[item.id]) return;
    
    setGeneratingCovers(prev => ({ ...prev, [item.id]: true }));
    
    try {
      let promptText = "";
      if (item.license_hash) {
        try {
          const parsed = JSON.parse(item.license_hash);
          promptText = parsed.stylePrompt || parsed.lyricsPrompt || "";
        } catch {
          // ignore
        }
      }
      if (!promptText) {
        promptText = item.title || "premium lofi retro future bass music concept illustration";
      }
      
      const imgRes = await fetch('/api/autopilot/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${promptText}, 3d modern visual, artistic music album cover art, premium digital art, centered composition`,
          size: '1:1',
          imageType: 'thumbnail',
          channelTitle: item.title || 'Melodio Track'
        })
      });
      
      const imgData = await imgRes.json();
      if (!imgRes.ok || !imgData.success || !imgData.imageUrl) {
        throw new Error(imgData.error || 'Failed to generate cover art');
      }
      
      const newCoverUrl = imgData.imageUrl;
      
      const patchRes = await fetch('/api/generations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          cover_art_url: newCoverUrl
        })
      });
      
      if (!patchRes.ok) {
        throw new Error('Failed to update cover art in database');
      }
      
      setHistory(prevHistory => 
        prevHistory.map(track => 
          track.id === item.id 
            ? { ...track, cover_art_url: newCoverUrl } 
            : track
        )
      );
    } catch (err: any) {
      console.error('[Dashboard/CoverArt] Error:', err);
      alert('커버 아트 생성 도중 오류가 발생했습니다. 잠시 후 다시 시도해 주십시오.');
    } finally {
      setGeneratingCovers(prev => ({ ...prev, [item.id]: false }));
    }
  };

  useEffect(() => {
    fetchUserDataAndStats();
    fetchHistory();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'generations' },
        () => {
          fetchHistory();
          fetchUserDataAndStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── 좋아요 토글 ───
  const toggleLike = async (id: string) => {
    const isCurrentlyLiked = !!likedTracks[id];
    const newLikeState = !isCurrentlyLiked;

    // 1. UI 즉각 업데이트 (Optimistic)
    setLikedTracks(prev => ({
      ...prev,
      [id]: newLikeState
    }));

    // 2. DB 저장 (안전한 백엔드 API PATCH 방식 우회)
    try {
      const res = await fetch('/api/generations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_liked: newLikeState })
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error('[Dashboard] Like toggle failed:', errorData.error || 'Unknown error');
        // 에러 시 롤백
        setLikedTracks(prev => ({
          ...prev,
          [id]: isCurrentlyLiked
        }));
      }
    } catch (e) {
      console.error('[Dashboard] Like toggle exception:', e);
      // 에러 시 롤백
      setLikedTracks(prev => ({
        ...prev,
        [id]: isCurrentlyLiked
      }));
    }
  };

  // ─── 곡 제목 변경 처리 ───
  const openEditModal = (track: Generation) => {
    setEditingTrack({ id: track.id, title: track.title || 'Untitled' });
    setNewTitle(track.title || 'Untitled');
    setIsEditModalOpen(true);
    setActiveMenuId(null);
  };

  const handleUpdateTitle = async () => {
    if (!editingTrack || !newTitle.trim()) return;
    const { error } = await supabase
      .from('generations')
      .update({ title: newTitle.trim() })
      .eq('id', editingTrack.id);

    if (!error) {
      setIsEditModalOpen(false);
      setEditingTrack(null);
      fetchHistory(); // 새로고침
    } else {
      alert('제목 수정 실패: ' + error.message);
    }
  };

  // ─── 곡 삭제 처리 ───
  const handleDeleteTrack = async (id: string) => {
    setActiveMenuId(null);
    if (!confirm('정말 이 AI 생성 음원을 삭제하시겠습니까? (삭제된 곡의 스템 분리 데이터도 전부 초기화됩니다)')) return;
    
    try {
      const res = await fetch(`/api/generations?id=${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        if (activeGenId === id) {
          setActiveGenId('');
        }
        fetchHistory();
        fetchUserDataAndStats();
      } else {
        const errData = await res.json();
        alert('삭제 실패: ' + (errData.error || '알 수 없는 오류'));
      }
    } catch (err) {
      alert('삭제 중 통신 오류가 발생했습니다.');
    }
  };

  // ─── 공개/비공개 전환 처리 ───
  const handleTogglePublicStatus = async (id: string, currentPublic: boolean) => {
    setActiveMenuId(null);
    try {
      const res = await fetch('/api/generations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          is_public: !currentPublic,
        }),
      });
      if (res.ok) {
        fetchHistory();
      } else {
        const errData = await res.json();
        alert('상태 변경 실패: ' + (errData.error || '알 수 없는 오류'));
      }
    } catch (err) {
      alert('상태 변경 중 통신 오류가 발생했습니다.');
    }
  };

  // ─── 온디맨드 스템 분리 요청 ───
  const handleRequestStemSplit = async (id: string) => {
    if (!isPro) {
      setIsProPaywallOpen(true);
      return;
    }

    const { error } = await supabase
      .from('generations')
      .update({ 
        status: 'pending',
        is_stem_extracted: false
      })
      .eq('id', id);

    if (error) {
      alert('스템 분리 요청 실패: ' + error.message);
    } else {
      alert('스템 분리(보컬/드럼/베이스 분리) 작업이 시작되었습니다. 완료될 때까지 약 1분간 기다려주세요.');
    }
  };

  // ─── 카테고리 판별 헬퍼 ───
  const getTrackCategory = (item: any): string => {
    if (item.license_hash) {
      try {
        const meta = JSON.parse(item.license_hash);
        if (meta.sourceMenu === 'japan' || meta.presetId === 'japan_landing') {
          return 'japan';
        }
        if (meta.sourceMenu === 'style-library' || meta.presetId?.includes('style') || meta.sourceMenu === 'style') {
          return 'style-library';
        }
        if (meta.sourceMenu === 'viral-cf' || meta.sourceMenu === 'viral') {
          return 'viral-cf';
        }
        if (meta.sourceMenu === 'audio-forge') {
          return 'audio-forge';
        }
      } catch {
        // ignore
      }
    }
    const titleLower = (item.title || '').toLowerCase();
    const promptLower = (item.license_hash || '').toLowerCase();
    if (titleLower.includes('style') || promptLower.includes('style-library')) {
      return 'style-library';
    }
    return 'audio-forge'; // Default
  };

  // ─── 클라이언트 사이드 검색, 필터, 정렬 ───
  let filtered = history.filter(item => 
    (item.title || 'Untitled').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (statusFilter !== 'all') {
    filtered = filtered.filter(item => item.status === statusFilter);
  }

  if (categoryTab !== 'all') {
    filtered = filtered.filter(item => getTrackCategory(item) === categoryTab);
  }

  if (sortBy === 'oldest') {
    filtered = [...filtered].reverse();
  }

  useEffect(() => {
    filteredRef.current = filtered;
  }, [filtered]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginatedHistory = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // 페이지 경계 보완
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  return (
    <div className="max-w-6xl mx-auto pt-4 pb-20 relative">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-white mb-2">Welcome back, {userName}!</h1>
        <p className="text-zinc-400">Melodio AI Music Label Overview</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-auto min-h-[380px] mb-8">
        {/* Usage & Subscription Card */}
        <div className="glass-panel p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              Usage & Subscription
            </h2>
            <div className="mb-8">
              <div className="text-sm text-zinc-400 mb-1">My Subscription</div>
              <div className="text-2xl font-bold text-fuchsia-400 neon-text">{planName}</div>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-zinc-400">Monthly Usage (Tokens)</span>
                  <span className="text-white">{tokensGB}</span>
                </div>
                <div className="w-full bg-[rgba(255,255,255,0.1)] rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-fuchsia-600 to-cyan-400 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${tokenPercent}%` }}
                  ></div>
                </div>
              </div>

              <div className="pt-3.5 border-t border-[rgba(255,255,255,0.06)] space-y-2.5">
                <div className="flex justify-between items-center text-sm pb-1.5 border-b border-white/5">
                  <span className="text-zinc-400 font-medium font-sans">Music Gen</span>
                  <span className="font-extrabold text-fuchsia-400 neon-text text-base">{stats.musicGenerated}</span>
                </div>
                <div className="flex justify-between items-center text-sm pb-1.5 border-b border-white/5">
                  <span className="text-zinc-400 font-medium font-sans">Custom Presets</span>
                  <span className="font-extrabold text-cyan-400 neon-text text-base">{stats.customPresets}</span>
                </div>
                <div className="flex justify-between items-center text-sm pb-1.5 border-b border-white/5">
                  <span className="text-zinc-400 font-medium font-sans">Shorts Hooks</span>
                  <span className="font-bold text-white text-base">{stats.shortsHooks}</span>
                </div>
                <div className="flex justify-between items-center text-sm pb-1.5 border-b border-white/5">
                  <span className="text-zinc-400 font-medium font-sans">Longform MVs</span>
                  <span className="font-semibold text-zinc-300 text-base">{stats.longformMvs}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-400 font-medium font-sans">Personas</span>
                  <span className="font-semibold text-zinc-300 text-base">{stats.personas}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* YouTube 연동 채널 카드 */}
          {youtubeChannel ? (
            <Link href="/autopilot?tab=channels" className="block mt-4">
              {hasActiveAutomation ? (
                <div className="w-full p-4 rounded-xl bg-red-600/10 border border-red-500/20 hover:border-red-500/50 hover:bg-red-600/15 transition-all flex items-center justify-between group cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.05)] hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {youtubeChannel.thumbnail_url ? (
                      <img 
                        src={youtubeChannel.thumbnail_url} 
                        alt={youtubeChannel.channel_title} 
                        className="w-9 h-9 rounded-full border border-white/10 object-cover shrink-0" 
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-red-600/20 flex items-center justify-center text-red-500 font-bold shrink-0 text-xs">
                        YT
                      </div>
                    )}
                    <div className="text-left overflow-hidden">
                      <p className="text-[9px] text-red-400 font-bold tracking-wider uppercase">연동 완료 (자율운영 중)</p>
                      <p className="text-xs font-bold text-white mt-0.5 group-hover:text-red-400 transition-colors truncate max-w-[120px]">
                        {youtubeChannel.channel_title}
                      </p>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0 ml-2" />
                </div>
              ) : (
                <div className="w-full p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-500/15 transition-all flex items-center justify-between group cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {youtubeChannel.thumbnail_url ? (
                      <img 
                        src={youtubeChannel.thumbnail_url} 
                        alt={youtubeChannel.channel_title} 
                        className="w-9 h-9 rounded-full border border-white/10 object-cover shrink-0" 
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold shrink-0 text-xs">
                        YT
                      </div>
                    )}
                    <div className="text-left overflow-hidden">
                      <p className="text-[9px] text-amber-400 font-bold tracking-wider uppercase">연동 완료 (설정 대기)</p>
                      <p className="text-xs font-bold text-white mt-0.5 group-hover:text-amber-400 transition-colors truncate max-w-[120px]">
                        {youtubeChannel.channel_title}
                      </p>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0 ml-2" />
                </div>
              )}
            </Link>
          ) : (
            <Link href="/autopilot" className="block mt-4">
              <div className="w-full p-4 rounded-xl bg-zinc-900/30 border border-white/5 hover:border-red-500/30 hover:bg-red-950/5 transition-all flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 group-hover:text-red-500 transition-colors shrink-0">
                    <YoutubeIcon className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[9px] text-zinc-500 font-bold tracking-wider uppercase group-hover:text-zinc-400 transition-colors">유튜브 연동</p>
                    <p className="text-xs font-bold text-zinc-400 mt-0.5 group-hover:text-white transition-colors">
                      채널 연동하기
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-zinc-600 group-hover:text-red-400 font-bold transition-colors">연동 ➔</span>
              </div>
            </Link>
          )}

          <Link href="/billing" className="w-full">
            <button className="w-full py-3 mt-4 rounded-xl bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] transition-colors text-sm font-medium text-center cursor-pointer">
              Manage Subscription
            </button>
          </Link>
        </div>

        {/* Action Cards */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/persona" className="relative group rounded-2xl p-6 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#4c1d95] to-[#7e22ce] border border-[#a855f7]/30 shadow-[0_0_30px_rgba(126,34,206,0.3)] hover:shadow-[0_0_40px_rgba(126,34,206,0.6)] transition-all cursor-pointer">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
              <Sparkles className="w-24 h-24" />
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Create Persona</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Build your unique AI Artist. Define sound, style & brand with our interactive lab.
              </p>
            </div>
            <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 mt-6 font-medium transition-colors text-center">
              Get Started
            </button>
          </Link>

          <Link href="/audio" className="relative group rounded-2xl p-6 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#be185d] to-[#db2777] border border-[#f472b6]/30 shadow-[0_0_30px_rgba(219,39,119,0.3)] hover:shadow-[0_0_40px_rgba(219,39,119,0.6)] transition-all cursor-pointer">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
              <Music4 className="w-24 h-24" />
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <Music4 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Batch Music Gen</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Generate 50+ tracks simultaneously using dual engines. Rapid music creation.
              </p>
            </div>
            <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 mt-6 font-medium transition-colors text-center">
              Get Started
            </button>
          </Link>

          <Link href="/studio" className="relative group rounded-2xl p-6 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0369a1] to-[#0284c7] border border-[#38bdf8]/30 shadow-[0_0_30px_rgba(2,132,199,0.3)] hover:shadow-[0_0_40px_rgba(2,132,199,0.6)] transition-all cursor-pointer">
            <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
              <Film className="w-24 h-24" />
            </div>
            <div>
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
                <Film className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Cinematic Studio</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Assemble high-fidelity dual-format MVs using 10s auto-stitching for Veo 3.1 & HeyGen.
              </p>
            </div>
            <button className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 mt-6 font-medium transition-colors text-center">
              Get Started
            </button>
          </Link>
        </div>
      </div>
      
      {/* ─── Suno 스타일 곡 라이브러리 패널 (Overhaul) ─── */}
      <div className="mt-12 glass-panel p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-fuchsia-400" />
              <h2 className="text-xl font-bold text-white">Track Library</h2>
              <span className="text-xs text-zinc-400 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/10">
                Total {filtered.length}
              </span>
            </div>

            {/* 카테고리별 분리 탭 (5대 메뉴 일치) */}
            <div className="flex items-center gap-1 bg-black/40 border border-white/5 p-1 rounded-xl w-fit flex-wrap">
              <button
                onClick={() => { setCategoryTab('all'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  categoryTab === 'all'
                    ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                All Tracks
              </button>
              <button
                onClick={() => { setCategoryTab('audio-forge'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  categoryTab === 'audio-forge'
                    ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                Preset Studio
              </button>
              <button
                onClick={() => { setCategoryTab('style-library'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  categoryTab === 'style-library'
                    ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                Audio Forge Pro
              </button>
              <button
                onClick={() => { setCategoryTab('japan'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  categoryTab === 'japan'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/25 shadow-[0_0_10px_rgba(244,63,94,0.1)]'
                    : 'text-zinc-400 hover:text-rose-400 hover:bg-rose-500/5 border border-transparent'
                }`}
              >
                <span>일본 BGM 포지</span>
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              </button>
              <button
                onClick={() => { setCategoryTab('viral-cf'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  categoryTab === 'viral-cf'
                    ? 'bg-fuchsia-600/20 text-fuchsia-400 border border-fuchsia-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                바이럴 & 트렌드 존
              </button>
            </div>
          </div>

          {/* 서치 & 필터 도구 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 검색창 */}
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search tracks..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500/50 transition-colors"
              />
            </div>

            {/* 상태 필터 */}
            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-2 py-1 text-sm">
              <ListFilter className="w-3.5 h-3.5 text-zinc-400 mr-2 ml-1" />
              <select 
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-zinc-300 font-medium focus:outline-none pr-2 py-1 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="completed">AAC Ready</option>
                <option value="processing">Processing</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {/* 정렬 필터 */}
            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-2 py-1 text-sm">
              <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400 mr-2 ml-1" />
              <select 
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-transparent text-zinc-300 font-medium focus:outline-none pr-2 py-1 cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>
        </div>

        {/* 물리 음질 등급 안내 */}
        <div className="flex justify-end mb-3 text-[10px] text-zinc-500 gap-2 select-none">
          <span>* 물리 음질 등급 안내:</span>
          <span className="text-emerald-400 font-bold">Grade A (최상)</span>
          <span>/</span>
          <span className="text-blue-400 font-bold">Grade B (양호)</span>
          <span>/</span>
          <span className="text-amber-500 font-bold">Grade F (노이즈 감지)</span>
        </div>

        {/* 곡 목록 리스트 */}
        <div className="space-y-3">
          {isHistoryLoading ? (
            <TrackLibrarySkeleton />
          ) : paginatedHistory.length === 0 ? (
            <div className="text-zinc-500 text-sm py-12 text-center flex flex-col items-center justify-center gap-2">
              <AlertCircle className="w-8 h-8 text-zinc-600" />
              <span>No generations match the search or filter criteria.</span>
            </div>
          ) : (
            paginatedHistory.map((item) => {
              const isActive = activeGenId === item.id;
              const isLiked = !!likedTracks[item.id];
              return (
                <motion.div 
                  layout
                  key={item.id}
                  className={`flex flex-col p-4 rounded-2xl transition-all border group/row ${
                    isActive 
                      ? 'border-fuchsia-500/40 bg-fuchsia-500/5 shadow-[0_0_20px_rgba(192,38,211,0.05)]' 
                      : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
                    {/* 좌측: 썸네일 커버 및 곡 정보 */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* 앨범 커버 (Suno Style) */}
                    <div 
                      onClick={() => item.status === 'completed' && handlePlayTrack(item)}
                      className={`w-[68px] h-[68px] rounded-xl relative overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-950 flex-shrink-0 flex items-center justify-center ${
                        item.status === 'completed' ? 'cursor-pointer shadow-md border' : 'cursor-wait border-dashed'
                      } ${
                        playingTrackId === item.id && isTrackPlaying ? 'border-fuchsia-500/60 shadow-fuchsia-500/20' : 'border-white/10'
                      }`}
                    >
                      {/* 앨범 커버 이미지 또는 장르 컨셉 자동 매핑 (대안 B) 및 AI 재생성 트리거 */}
                      <FadeInImage 
                        src={item.cover_art_url || getFallbackCoverArt(item)} 
                        alt={item.title || 'Track Art'} 
                        className="absolute inset-0 w-full h-full object-cover" 
                      />

                      {generatingCovers[item.id] && (
                        /* 이미지 생성 중 로딩 레이어 */
                        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-1.5 z-20 text-[9px] text-cyan-400 font-bold">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>생성중...</span>
                        </div>
                      )}

                      {/* 🪄 미니 AI 커버 생성 버튼 (오른쪽 상단 배치) */}
                      {item.status === 'completed' && !generatingCovers[item.id] && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // 플레이어 실행 차단
                            handleGenerateCoverArt(item);
                          }}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/80 hover:bg-fuchsia-600 hover:scale-105 text-white flex items-center justify-center border border-white/20 opacity-0 group-hover/row:opacity-100 transition-all z-20 shadow-md"
                          title="컨셉 맞춤형 AI 앨범 커버 생성"
                        >
                          <span className="text-[10px]">🪄</span>
                        </button>
                      )}

                      {item.status === 'generating' ? (
                        /* 생성 중일 때: 로딩 스피너 오버레이 */
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                          <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
                        </div>
                      ) : (
                        <>
                          {/* 재생 시간 배지 (Suno 스타일 - 하단 중앙 반투명 블랙 백그라운드) */}
                          {item.status === 'completed' && (
                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/60 px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white/90 font-mono tracking-wider shadow-sm z-10">
                              <TrackDuration 
                                audioUrl={item.audio_url} 
                                initialDuration={(() => {
                                  const metaSource = item.license_hash || item.duration_mode;
                                  if (metaSource && metaSource !== 'clip' && metaSource !== 'full') {
                                    try {
                                      const meta = JSON.parse(metaSource);
                                      if (meta.duration && meta.duration > 0) {
                                        return Number(meta.duration);
                                      }
                                    } catch { /* ignore */ }
                                  }
                                  return undefined;
                                })()} 
                              />
                            </div>
                          )}

                          {/* 호버 시 재생 아이콘 레이어 */}
                          <div className={`absolute inset-0 bg-black/25 flex items-center justify-center transition-opacity duration-300 ${
                            playingTrackId === item.id && isTrackPlaying ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'
                          }`}>
                            {playingTrackId === item.id && isTrackPlaying ? (
                              <Pause className="w-5 h-5 text-fuchsia-400 fill-fuchsia-400" />
                            ) : (
                              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* 제목, 엔지니어 버전 및 메타 데이터 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span 
                          onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                          className={`font-semibold text-sm truncate hover:underline cursor-pointer ${playingTrackId === item.id && isTrackPlaying ? 'text-fuchsia-400' : isActive ? 'text-fuchsia-300' : 'text-white'}`}
                          title="클릭하여 상세 정보 보기"
                        >
                          {item.title || 'Untitled Track'}
                        </span>

                        {/* J-BGM 특화 배지 */}
                        {isJapanTrack(item) && (
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              setCategoryTab('japan');
                              setCurrentPage(1);
                            }}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono hover:bg-rose-500/20 cursor-pointer transition-colors"
                            title="일본 특화 BGM만 모아보기"
                          >
                            J-BGM
                          </span>
                        )}
                        
                        {/* 버전/엔진 태그 */}
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                          {(item.audio_url || item.source_audio_url || '').includes('lyria') ? 'Lyria v3.0' : 'Suno v5.5'}
                        </span>

                        {/* 음질 등급 배지 */}
                        {item.status === 'completed' && item.audio_grade && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono border ${
                            item.audio_grade === 'A' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : item.audio_grade === 'B' 
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            Grade {item.audio_grade}
                          </span>
                        )}

                        {/* 진행 배지 */}
                        <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-mono border ${
                          item.status === 'completed' 
                            ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' 
                            : item.status === 'failed'
                            ? 'text-red-400 bg-red-400/10 border-red-400/20'
                            : item.status === 'generating'
                            ? 'text-blue-400 bg-blue-400/10 border-blue-400/20 animate-pulse'
                            : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                        }`}>
                          {item.status === 'completed' ? 'READY' 
                            : item.status === 'generating' ? '🎵 GENERATING...'
                            : item.status.toUpperCase()}
                        </span>
                      </div>

                      {/* 스타일 태그 설명 */}
                      {(() => {
                        const metaSource = item.license_hash || item.duration_mode;
                        let descText = 'Professional studio mix, dynamic lyrics, master quality';
                        if (metaSource && metaSource !== 'clip' && metaSource !== 'full') {
                          try {
                            const meta = JSON.parse(metaSource);
                            if (meta.description) {
                              descText = meta.description;
                            } else if (meta.tags) {
                              descText = meta.tags;
                            }
                          } catch { /* ignore */ }
                        }
                        return (
                          <p className="text-[11px] text-zinc-400 truncate max-w-[450px]" title={descText}>
                            {descText}
                          </p>
                        );
                      })()}
                      
                      <div className="text-[10px] text-zinc-400 mt-1 flex items-center gap-2">
                        <span>{new Date(item.created_at).toLocaleString()}</span>
                        <span>•</span>
                        <span className="font-mono">ID: {item.id.slice(0, 8).toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  {/* 우측: 상호작용 및 관리 메뉴 */}
                  <div className="flex flex-wrap items-center justify-start md:justify-end gap-2 md:gap-3 mt-4 md:mt-0 flex-shrink-0 w-full md:w-auto relative">
                    {/* 좋아요 (Heart) */}
                    <button 
                      onClick={() => toggleLike(item.id)}
                      className={`p-2 rounded-xl border transition-all ${
                        isLiked 
                          ? 'bg-red-500/10 border-red-500/20 text-red-500' 
                          : 'bg-white/5 border-white/5 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500' : ''}`} />
                    </button>

                    {/* 스템 분리 (Split Stems) 온디맨드 요청 단추 */}
                    {item.status === 'completed' && !item.is_stem_extracted && (
                      <button 
                        onClick={() => handleRequestStemSplit(item.id)}
                        className="flex items-center gap-1.5 bg-gradient-to-r from-fuchsia-600/80 to-cyan-500/80 hover:from-fuchsia-600 hover:to-cyan-500 text-white px-2.5 py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] md:text-xs font-bold transition-all hover:shadow-[0_0_10px_rgba(192,38,211,0.3)]"
                      >
                        <Music4 className="w-3.5 h-3.5" />
                        <span>Split Stems</span>
                      </button>
                    )}

                    {/* 분리 진행 중 스피너 (Splitting) */}
                    {(item.status === 'pending' || item.status === 'processing') && (
                      <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] md:text-xs font-semibold select-none animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Splitting...</span>
                      </div>
                    )}

                    {/* 음원 생성 진행 중 스피너 (Generating) */}
                    {item.status === 'generating' && (
                      <div className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2.5 py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] md:text-xs font-semibold select-none animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating...</span>
                      </div>
                    )}

                    {/* 스템 완료 마크 */}
                    {item.is_stem_extracted && (
                      <span className="text-[10px] px-2 py-1.5 md:px-2.5 md:py-2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold select-none">
                        ✓ Stems Active
                      </span>
                    )}

                    {/* Download 버튼 (완료 시에만 노출) */}
                    {item.status === 'completed' && (item.audio_url || item.source_audio_url) && (
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          const dlUrl = item.audio_url || item.source_audio_url;
                          if (!dlUrl) return;
                          try {
                            const resp = await fetch(dlUrl);
                            const blob = await resp.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${item.title || 'melodio-track'}.mp3`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch {
                            window.open(dlUrl, '_blank');
                          }
                        }}
                        className="flex items-center gap-1 bg-white/5 border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 text-zinc-300 hover:text-white px-2.5 py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] md:text-xs font-semibold transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    )}

                    {/* Remix 버튼 (완료 시에만 노출) */}
                    {item.status === 'completed' && (
                      <Link href={`/audio?remix=${item.id}`} className="inline-flex">
                        <button className="flex items-center gap-1 bg-white/5 border border-white/5 hover:border-fuchsia-500/30 hover:bg-fuchsia-500/5 text-zinc-300 hover:text-white px-2.5 py-1.5 md:px-3.5 md:py-2 rounded-xl text-[11px] md:text-xs font-semibold transition-all w-full">
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Remix</span>
                        </button>
                      </Link>
                    )}

                    {/* 더보기(···) 드롭다운 트리거 */}
                    <div className="relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === item.id ? null : item.id);
                        }}
                        className={`p-2 rounded-xl border transition-all ${
                          activeMenuId === item.id 
                            ? 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400' 
                            : 'bg-white/5 border-white/5 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* 드롭다운 본체 (Suno Style) */}
                      {activeMenuId === item.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setActiveMenuId(null)}
                          />
                          <div className="absolute right-0 mt-2 w-48 rounded-xl bg-zinc-950 border border-white/10 p-1.5 shadow-2xl z-50 flex flex-col gap-0.5">
                            <button 
                              onClick={() => openEditModal(item)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit Title</span>
                            </button>
                            
                            {(item.audio_url || item.source_audio_url) && (
                              <button 
                                onClick={async () => {
                                  setActiveMenuId(null);
                                  const dlUrl = item.audio_url || item.source_audio_url;
                                  if (!dlUrl) return;
                                  try {
                                    const resp = await fetch(dlUrl);
                                    const blob = await resp.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `${item.title || 'melodio-track'}.mp3`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  } catch {
                                    window.open(dlUrl, '_blank');
                                  }
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download Mix</span>
                              </button>
                            )}
                            
                            <button 
                              onClick={() => {
                                setSharingTrack(item);
                                setActiveMenuId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              <span>Share Link</span>
                            </button>

                            {(() => {
                              let isPublic = true;
                              if (item.license_hash) {
                                try {
                                  const meta = JSON.parse(item.license_hash);
                                  isPublic = meta.isPublic !== false;
                                } catch {
                                  // ignore
                                }
                              }
                              return (
                                <button
                                  onClick={() => handleTogglePublicStatus(item.id, isPublic)}
                                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                                >
                                  {isPublic ? (
                                    <>
                                      <Lock className="w-3.5 h-3.5 text-zinc-400" />
                                      <span>비공개로 전환 (Private)</span>
                                    </>
                                  ) : (
                                    <>
                                      <Globe className="w-3.5 h-3.5 text-rose-400" />
                                      <span>공개로 전환 (Public)</span>
                                    </>
                                  )}
                                </button>
                              );
                            })()}

                            <div className="h-px bg-white/5 my-1" />

                            <button 
                              onClick={() => handleDeleteTrack(item.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Move to Trash</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* 페이지네이션 하단 바 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
            <span className="text-xs text-zinc-500">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* ── 멀티트랙 스템 플레이어 ── */}
      <div className="mt-8">
        {activeGenId ? (
          <MultiTrackPlayer 
            generationId={activeGenId} 
            stemStates={audio.stemStates}
            allLoaded={audio.allLoaded}
            isPlaying={audio.isPlaying}
            currentTime={audio.currentTime}
            duration={audio.duration}
            originalWavUrls={audio.originalWavUrls}
            play={audio.play}
            pause={audio.pause}
            reset={audio.reset}
            seek={audio.seek}
            toggleMute={audio.toggleMute}
            toggleSolo={audio.toggleSolo}
            setVolume={audio.setVolume}
          />
        ) : (
          <MultiTrackPlayer 
            stemStates={audio.stemStates}
            allLoaded={audio.allLoaded}
            isPlaying={audio.isPlaying}
            currentTime={audio.currentTime}
            duration={audio.duration}
            originalWavUrls={audio.originalWavUrls}
            play={audio.play}
            pause={audio.pause}
            reset={audio.reset}
            seek={audio.seek}
            toggleMute={audio.toggleMute}
            toggleSolo={audio.toggleSolo}
            setVolume={audio.setVolume}
          />
        )}
      </div>

      {/* Alert banner replacing Insights*/}
      <div className="mt-8 glass-panel p-4 flex items-center gap-4 bg-[rgba(147,51,234,0.05)] border-[rgba(147,51,234,0.2)]">
        <div className="w-10 h-10 rounded-full bg-[rgba(147,51,234,0.2)] flex items-center justify-center flex-shrink-0">
          <Info className="w-5 h-5 text-fuchsia-400" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">Zero Analysis Needed</h4>
          <p className="text-sm text-zinc-400">Melodio automatically engineers the most viral keywords and algorithms for your selected Persona.</p>
        </div>
      </div>

      {/* ── 곡 제목 수정 팝업 모달 ── */}
      {isEditModalOpen && editingTrack && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl relative">
            <button 
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-fuchsia-400" />
              <span>Edit Track Title</span>
            </h3>
            <p className="text-xs text-zinc-400 mb-6">
              Update the metadata and display name of this generated track.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2 font-mono">
                  Track Name
                </label>
                <input 
                  type="text" 
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50 transition-colors"
                  placeholder="Enter track title..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white text-xs font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpdateTitle}
                className="px-5 py-2 bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white text-xs font-semibold rounded-xl hover:shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── 트랙 상세정보 모달 ─── */}
      {detailItem && (() => {
        let meta: Record<string, any> = {};
        const metaSource = detailItem.license_hash || detailItem.duration_mode;
        if (metaSource && metaSource !== 'clip' && metaSource !== 'full') {
          try {
            meta = JSON.parse(metaSource);
          } catch (e) {
            console.error('Failed to parse track metadata:', e);
          }
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailItem(null)}>
            <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-6 space-y-4 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="flex items-center justify-between flex-shrink-0">
                <h3 className="text-white text-lg font-bold truncate flex-1 mr-4">
                  🎵 {detailItem.title || 'Untitled Track'}
                </h3>
                <button 
                  onClick={() => setDetailItem(null)} 
                  className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 스크롤 가능한 본문 영역 */}
              <div className="overflow-y-auto flex-1 pr-1 space-y-4 max-h-[60vh]">
                {/* 상태 & ID */}
                <div className="flex items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded font-mono border ${
                    detailItem.status === 'completed' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                      : detailItem.status === 'generating' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                      : detailItem.status === 'failed' ? 'text-red-400 bg-red-400/10 border-red-400/20'
                      : 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                  }`}>
                    {detailItem.status === 'completed' ? 'READY' : detailItem.status.toUpperCase()}
                  </span>
                  <span className="text-zinc-500 font-mono">{detailItem.id.slice(0, 8).toUpperCase()}</span>
                  <span className="text-zinc-600">{new Date(detailItem.created_at).toLocaleString('ko-KR')}</span>
                </div>

                {/* 앨범 커버 이미지 (1:1 비율) */}
                <div className="flex justify-center flex-shrink-0 py-2">
                  <div className="w-48 h-48 rounded-xl overflow-hidden border border-white/10 shadow-lg relative bg-black/40">
                    <img 
                      src={detailItem.cover_art_url || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80'} 
                      alt={detailItem.title || 'Track Art'} 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                </div>

                {/* 곡 설명 및 태그 */}
                {meta.description && (
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5 text-center">
                    <div className="text-zinc-300 text-sm font-medium">{meta.description}</div>
                  </div>
                )}

                {meta.tags && (
                  <div className="flex flex-wrap justify-center gap-1.5 py-1">
                    {meta.tags.split(',').map((tag: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-zinc-850 text-zinc-300 border border-zinc-700/50">
                        #{tag.trim()}
                      </span>
                    ))}
                  </div>
                )}

                {/* 메타데이터 표 */}
                <div className="space-y-2">
                  {!meta.stylePrompt && !meta.lyricsPrompt && !meta.engine && (
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5 text-center">
                      <div className="text-zinc-500 text-sm">이 곡은 메타데이터 저장 기능 이전에 생성되어 상세 정보가 없습니다.</div>
                      <div className="text-zinc-600 text-xs mt-1">새로 생성하는 곡부터 스타일프롬프트, 가사 등이 자동 저장됩니다.</div>
                    </div>
                  )}

                  {/* 오디오 URL (있으면 표시) */}
                  {detailItem.audio_url && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                      <div className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-1">Audio Source</div>
                      <div className="text-zinc-400 text-xs font-mono break-all">{detailItem.audio_url}</div>
                    </div>
                  )}

                  {/* 적용된 프리셋/스타일 매칭 및 제작 링크 */}
                  {(() => {
                    const presetId = meta.presetId || null;
                    const presetName = meta.presetName || null;
                    const sourceMenu = meta.sourceMenu || null;

                    let displayPresetId = presetId;
                    let displayPresetName = presetName;

                    // 1. 역추적 퍼지 매칭 시도 (기존 과거 곡들을 위한 폴백 매칭)
                    if (!displayPresetId && meta.stylePrompt && allPresets.length > 0) {
                      const cleanStyle = meta.stylePrompt.toLowerCase().replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').trim();
                      const matched = allPresets.find(p => {
                        if (!p.customPrompt) return false;
                        const cleanCustom = p.customPrompt.toLowerCase().replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').trim();
                        return cleanStyle.includes(cleanCustom) || cleanCustom.includes(cleanStyle);
                      });
                      if (matched) {
                        displayPresetId = matched.id;
                        displayPresetName = matched.name;
                      }
                    }

                    // 만약 이름도 없고 스타일 프롬프트도 아예 없는 과거 초창기 곡인 경우는 렌더링하지 않음
                    if (!displayPresetId && !displayPresetName && !meta.stylePrompt) return null;

                    // 2. 제작 소스 메뉴 유추 (과거 곡 폴백용)
                    let resolvedMenu = sourceMenu;
                    if (!resolvedMenu) {
                      // 템플릿 스타일 분석
                      const lowerStyle = (meta.stylePrompt || '').toLowerCase();
                      const isViralStyle = lowerStyle.includes('omg chant') || 
                                           lowerStyle.includes('lofi arpeggios') || 
                                           lowerStyle.includes('comical narrative') || 
                                           lowerStyle.includes('salsa de la luna') || 
                                           lowerStyle.includes('study beat') || 
                                           lowerStyle.includes('viral trap') || 
                                           lowerStyle.includes('chidor');

                      // 템플릿 ID가 숫자로만 되어있는 경우도 바이럴/CF 템플릿에 해당
                      const isNumericPresetId = displayPresetId && /^\d+$/.test(displayPresetId.toString());

                      if (
                        detailItem.title?.includes('[CF]') || 
                        meta.brand_name || 
                        meta.voiceover_script || 
                        isViralStyle || 
                        isNumericPresetId
                      ) {
                        resolvedMenu = 'viral-cf';
                      } else if (displayPresetId && (displayPresetId.toString().startsWith('showcase-') || displayPresetId.toString() === '1' || displayPresetId.toString() === '4' || displayPresetId.toString() === 'trot')) {
                        resolvedMenu = 'style-library';
                      } else {
                        resolvedMenu = 'audio-forge';
                      }
                    }

                    // 3. 프리셋 존재 여부 및 삭제 여부 체크 (기본/DB/커스텀 전체 대조)
                    let isDeleted = false;
                    if (displayPresetId) {
                      const exists = allPresets.some(p => p.id === displayPresetId);
                      if (!exists) {
                        isDeleted = true;
                      }
                    }

                    // A. 프리셋이 정상 존재하고 사용 가능한 상태
                    if (displayPresetId && !isDeleted) {
                      let linkUrl = `/audio?preset=${encodeURIComponent(displayPresetId)}&style=${encodeURIComponent(meta.stylePrompt || '')}&name=${encodeURIComponent(displayPresetName || '')}${meta.excludePrompt ? `&exclude=${encodeURIComponent(meta.excludePrompt)}` : ''}`;
                      if (resolvedMenu === 'viral-cf' || resolvedMenu === 'viral') {
                        linkUrl = `/viral?preset=${encodeURIComponent(displayPresetId)}`;
                      } else if (resolvedMenu === 'style-library') {
                        linkUrl = `/audio?preset=${encodeURIComponent(displayPresetId)}&sourceMenu=style-library&style=${encodeURIComponent(meta.stylePrompt || '')}&name=${encodeURIComponent(displayPresetName || '')}${meta.excludePrompt ? `&exclude=${encodeURIComponent(meta.excludePrompt)}` : ''}`;
                      }

                      return (
                        <div className="bg-white/5 rounded-xl p-3.5 border border-white/5 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="text-violet-400 text-[10px] font-bold uppercase tracking-wider mb-1">Applied Preset</div>
                            <div className="text-white text-sm font-semibold truncate">{displayPresetName}</div>
                            <div className="text-zinc-500 text-[10px] mt-0.5">이 곡은 '{displayPresetName}' 스타일로 제작되었습니다.</div>
                          </div>
                          <Link 
                            href={linkUrl}
                            className="px-3.5 py-2 bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 hover:text-white border border-violet-500/20 hover:border-violet-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] active:scale-95"
                            onClick={() => setDetailItem(null)}
                          >
                            <span>🪄 이 스타일로 만들기</span>
                          </Link>
                        </div>
                      );
                    }

                    // B. 프리셋은 등록되어 있었으나 현재 삭제된 상태
                    if (displayPresetId && isDeleted) {
                      return (
                        <div className="bg-white/5 rounded-xl p-3.5 border border-red-500/20 bg-red-950/5 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="text-red-400 text-[10px] font-bold uppercase tracking-wider mb-1">Applied Preset (Deleted)</div>
                            <div className="text-zinc-400 text-sm font-semibold truncate line-through">{displayPresetName || displayPresetId}</div>
                            <div className="text-red-400/80 text-[10px] mt-0.5">이 곡에 사용된 콘텐츠(프리셋)는 이미 삭제되어 더 이상 사용할 수 없습니다.</div>
                          </div>
                          <button 
                            disabled
                            className="px-3.5 py-2 bg-zinc-800 text-zinc-500 border border-zinc-700/50 rounded-xl text-xs font-semibold shrink-0 cursor-not-allowed"
                          >
                            사용 불가
                          </button>
                        </div>
                      );
                    }

                    // C. 프리셋이 매칭되지 않는 사용자 직접 입력 단일 음원 상태
                    let menuName = "Audio Forge";
                    let targetUrl = `/audio?style=${encodeURIComponent(meta.stylePrompt || '')}${meta.excludePrompt ? `&exclude=${encodeURIComponent(meta.excludePrompt)}` : ''}`;
                    if (resolvedMenu === 'viral-cf' || resolvedMenu === 'viral') {
                      menuName = "Viral & Trend Zone";
                      targetUrl = `/viral?style=${encodeURIComponent(meta.stylePrompt || '')}`;
                    } else if (resolvedMenu === 'style-library') {
                      menuName = "Style Library";
                      targetUrl = `/style-library`;
                    }

                    return (
                      <div className="bg-white/5 rounded-xl p-3.5 border border-white/5 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-cyan-400 text-[10px] font-bold uppercase tracking-wider mb-1">Direct Custom Prompt</div>
                          <div className="text-white text-sm font-semibold truncate">수동 직접 입력 곡</div>
                          <div className="text-zinc-500 text-[10px] mt-0.5">이 곡은 사용자가 '{menuName}' 메뉴에서 직접 제작한 단일 음원입니다.</div>
                        </div>
                        <Link 
                          href={targetUrl}
                          className="px-3.5 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 hover:text-white border border-cyan-500/20 hover:border-cyan-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shrink-0 shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-95"
                          onClick={() => setDetailItem(null)}
                        >
                          <span>🪄 {menuName} 이동하기</span>
                        </Link>
                      </div>
                    );
                  })()}

                  {/* 🎬 유튜브 영상 업로드 메인 타이틀 & 더보기란 Tracklist 카드 */}
                  {(() => {
                    const displayYtTitle = meta.youtubeMainTitle || `💻 ${detailItem.title || '새벽 몰입'} | ${meta.stylePrompt ? meta.stylePrompt.split(',')[0] : 'Melodio BGM'}`;
                    const displayTracklist = meta.tracklistText || `🎧 [Tracklist / 수록곡 목록]\n01. 00:00 ${detailItem.title || 'Main Theme'}\n02. 03:15 ${detailItem.title || 'Track'} (Acoustic Version)\n03. 06:40 ${detailItem.title || 'Track'} (Midnight Lofi Ver)\n04. 09:55 ${detailItem.title || 'Track'} (Piano Solo Mix)\n05. 13:20 ${detailItem.title || 'Track'} (Ambient Reverb)`;

                    return (
                      <div className="space-y-3">
                        {/* 🎬 유튜브 업로드 메인 타이틀 카드 */}
                        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent rounded-xl p-3 border border-amber-500/20 relative">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-amber-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                              <span>🎬</span>
                              <span>유튜브 영상 업로드 메인 타이틀 (2,370+ DB 모바일 15자 훅 적용)</span>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(displayYtTitle);
                                setCopiedYtTitle(true);
                                setTimeout(() => setCopiedYtTitle(false), 2000);
                              }}
                              className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 border border-amber-500/30"
                            >
                              {copiedYtTitle ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedYtTitle ? '복사됨!' : '제목 복사'}</span>
                            </button>
                          </div>
                          <div className="text-amber-100 text-xs font-bold bg-black/40 p-2.5 rounded-lg border border-amber-500/20 select-all">
                            {displayYtTitle}
                          </div>
                        </div>

                        {/* 🎧 더보기란 트랙리스트 타임스탬프 카드 */}
                        <div className="bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent rounded-xl p-3 border border-cyan-500/20 relative">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="text-cyan-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                              <span>🎧</span>
                              <span>유튜브 더보기란 Tracklist (타임코드 + 수록곡명)</span>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(displayTracklist);
                                setCopiedTracklist(true);
                                setTimeout(() => setCopiedTracklist(false), 2000);
                              }}
                              className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 border border-cyan-500/30"
                            >
                              {copiedTracklist ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedTracklist ? '복사됨!' : '트랙리스트 복사'}</span>
                            </button>
                          </div>
                          <pre className="text-cyan-100 text-[11px] font-mono bg-black/40 p-2.5 rounded-lg border border-cyan-500/20 whitespace-pre-wrap select-all max-h-36 overflow-y-auto">
                            {displayTracklist}
                          </pre>
                        </div>

                        {/* 🎬 바이럴 숏폼 뮤비 카드 (상시 노출) */}
                        {(() => {
                          const vUrl = meta.video_url || meta.grok_video_url || meta.videoUrl || (detailItem as any).video_url;
                          const hasVideo = !!vUrl;

                          return (
                            <div className="bg-gradient-to-r from-fuchsia-500/10 via-purple-500/5 to-transparent rounded-xl p-3 border border-fuchsia-500/30 relative space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="text-fuchsia-300 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                                  <Film className="w-3.5 h-3.5 text-fuchsia-400 animate-pulse" />
                                  <span>🎬 바이럴 숏폼 뮤비</span>
                                </div>

                                {hasVideo ? (
                                  <a
                                    href={vUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={`melodio_short_${detailItem.title || 'video'}.mp4`}
                                    className="px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(217,70,239,0.3)] active:scale-95 shrink-0"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>🎬 MP4 다운로드</span>
                                  </a>
                                ) : (
                                  <Link
                                    href={`/viral?trackId=${detailItem.id}`}
                                    onClick={() => setDetailItem(null)}
                                    className="px-3 py-1.5 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(217,70,239,0.3)] active:scale-95 shrink-0"
                                  >
                                    <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-bounce" />
                                    <span>🚀 숏폼 영상 제작하기</span>
                                  </Link>
                                )}
                              </div>

                              {hasVideo ? (
                                <div className="aspect-[9/16] max-w-[200px] mx-auto rounded-xl overflow-hidden border border-white/10 bg-black shadow-lg">
                                  <video
                                    src={vUrl}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="p-3 bg-black/40 rounded-lg border border-white/5 text-center text-zinc-400 text-xs">
                                  아직 생성된 AI 쇼츠 비디오가 없습니다. 상단 버튼을 눌러 1클릭 영상을 제작해 보세요!
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {meta.stylePrompt && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/5 relative group/card">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-fuchsia-400 text-[10px] font-bold uppercase tracking-wider">Style Prompt</div>
                        <button
                          onClick={() => handleCopyText(meta.stylePrompt, 'style')}
                          className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-all"
                          title="Style Prompt 복사"
                        >
                          {copiedStyle ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <div className="text-zinc-300 text-sm whitespace-pre-wrap">{meta.stylePrompt}</div>
                    </div>
                  )}

                  {meta.lyricsPrompt && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/5 relative group/card">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-cyan-400 text-[10px] font-bold uppercase tracking-wider">Lyrics</div>
                        <button
                          onClick={() => handleCopyText(meta.lyricsPrompt, 'lyrics')}
                          className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-all"
                          title="Lyrics 복사"
                        >
                          {copiedLyrics ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <div className="text-zinc-300 text-sm whitespace-pre-wrap">{meta.lyricsPrompt}</div>
                    </div>
                  )}

                  {meta.excludePrompt && (
                    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                      <div className="text-red-400 text-[10px] font-bold uppercase tracking-wider mb-1">Exclude</div>
                      <div className="text-zinc-300 text-sm">{meta.excludePrompt}</div>
                    </div>
                  )}

                  {/* 태그 그리드 */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {meta.engine && (
                      <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                        <span className="text-zinc-500">Engine</span>
                        <span className="ml-2 text-white font-mono">{meta.engine} {meta.sunoVersion || ''}</span>
                      </div>
                    )}
                    {meta.genre && (
                      <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                        <span className="text-zinc-500">Genre</span>
                        <span className="ml-2 text-white">{meta.genre}{meta.subGenre ? ` / ${meta.subGenre}` : ''}</span>
                      </div>
                    )}
                    {meta.bpm && (
                      <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                        <span className="text-zinc-500">BPM</span>
                        <span className="ml-2 text-white font-mono">{meta.bpm}</span>
                      </div>
                    )}
                    {meta.mood && (
                      <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                        <span className="text-zinc-500">Mood</span>
                        <span className="ml-2 text-white">{meta.mood}</span>
                      </div>
                    )}
                    <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                      <span className="text-zinc-500">Vocals</span>
                      <span className="ml-2 text-white">{meta.isInstrumental ? '❌ Instrumental' : '✅ Vocal'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 닫기 */}
              <div className="flex justify-end flex-shrink-0 pt-2 border-t border-white/5">
                <button 
                  onClick={() => setDetailItem(null)} 
                  className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white text-xs font-semibold rounded-xl transition-all"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      
      {/* 🎵 곡 공유 (Share Song) 모달 */}
      <AnimatePresence>
        {sharingTrack && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            {/* Click backdrop to close */}
            <div 
              className="absolute inset-0" 
              onClick={() => setSharingTrack(null)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-[420px] bg-zinc-950/90 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl z-10 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-fuchsia-400" />
                  <span>곡 공유</span>
                </h3>
                <button 
                  onClick={() => setSharingTrack(null)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body (Premium Preview Card) */}
              <div className="px-6 py-4 flex flex-col items-center">
                {/* Preview card wrapper with blurred bg */}
                <div className="relative w-full aspect-[3/4] max-w-[320px] rounded-2xl overflow-hidden border border-white/10 flex flex-col items-center justify-center p-6 bg-black/60 shadow-xl">
                  {/* Blurry artwork background */}
                  <div 
                    className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-40 blur-[30px] scale-110"
                    style={{ backgroundImage: `url(${sharingTrack.cover_art_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop'})` }}
                  />

                  {/* Frosted glass preview content */}
                  <div className="relative z-10 w-full flex flex-col items-center bg-white/[0.04] border border-white/[0.08] backdrop-blur-2xl rounded-2xl p-4 shadow-lg">
                    {/* Cover Art */}
                    <div className="w-full aspect-square rounded-xl overflow-hidden shadow-md">
                      <img 
                        src={sharingTrack.cover_art_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop'} 
                        alt={sharingTrack.title || 'Track Cover'} 
                        className="w-full h-full object-cover select-none"
                      />
                    </div>

                    {/* Metadata */}
                    <div className="w-full text-left mt-4">
                      <div className="text-sm font-bold text-white line-clamp-1 leading-tight">
                        {sharingTrack.title || 'Untitled Track'}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">
                        Melodio Creator
                      </div>
                    </div>

                    {/* Progress slider (non-interactive display) */}
                    <div className="w-full mt-4 space-y-1">
                      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full w-[35%] bg-fuchsia-500 rounded-full" />
                      </div>
                      <div className="flex justify-between text-[8px] text-zinc-500 font-mono font-bold">
                        <span>0:15</span>
                        <span>0:45</span>
                      </div>
                    </div>

                    {/* Player controls icons */}
                    <div className="flex items-center justify-between w-full mt-3 px-2">
                      <SkipBack className="w-3.5 h-3.5 text-zinc-500" />
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-black">
                        <Play className="w-3 h-3 fill-current translate-x-0.5" />
                      </div>
                      <SkipForward className="w-3.5 h-3.5 text-zinc-500" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer action */}
              <div className="p-6 border-t border-white/5 bg-black/20 flex flex-col gap-3">
                <button 
                  onClick={() => {
                    handleCopyLink(sharingTrack.id);
                    setSharingTrack(null);
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white text-xs font-bold border border-fuchsia-400/20 shadow-lg shadow-fuchsia-500/10 hover:shadow-fuchsia-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>링크 주소 복사</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 🔔 복사 알림 Toast */}
      {showToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900/90 border border-emerald-500/30 text-emerald-400 text-xs font-bold px-5 py-3 rounded-full shadow-2xl shadow-emerald-500/10 flex items-center gap-2 z-[110] animate-bounce">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          {toastMessage}
        </div>
      )}

      {/* PRO 멤버십 결제 페이월 모달 */}
      <ProPaywallModal
        isOpen={isProPaywallOpen}
        onClose={() => setIsProPaywallOpen(false)}
        feature="stems"
      />

      {/* 🎵 대시보드 하단 전역 통합 플레이어 바 */}
      {(() => {
        const currentDashboardTrack = playingTrack || history.find((g: Generation) => g.id === playingTrackId);
        if (!playingTrackId || !currentDashboardTrack) return null;

        let meta: any = {};
        const metaSource = currentDashboardTrack.license_hash || currentDashboardTrack.duration_mode;
        if (metaSource && metaSource !== 'clip' && metaSource !== 'full') {
          try {
            meta = JSON.parse(metaSource);
          } catch {
            // ignore
          }
        }

        const coverUrl = currentDashboardTrack.cover_art_url || getFallbackCoverArt(currentDashboardTrack);

        return (
          <div className="fixed bottom-0 left-0 md:left-64 right-0 z-50 bg-zinc-950/95 border-t border-white/10 backdrop-blur-xl px-6 py-3 shadow-2xl flex items-center justify-between">
            {/* Left Metadata & Artwork */}
            <div className="flex items-center gap-3.5 min-w-[240px] max-w-[320px] shrink-0">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 shrink-0 border border-white/10 shadow-md relative">
                <img 
                  src={coverUrl} 
                  alt={currentDashboardTrack.title || 'Track Art'} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = getFallbackCoverArt(currentDashboardTrack);
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate leading-tight">
                  {currentDashboardTrack.title || 'Untitled Track'}
                </h4>
                <p className="text-[10px] text-zinc-400 font-mono mt-1 truncate">
                  {meta.genre ? `${meta.genre} • ` : meta.stylePrompt ? `${meta.stylePrompt.slice(0, 15)}... • ` : ''}Suno v5.5 • Master
                </p>
              </div>
            </div>

            {/* Center Controls (Shuffle, SkipBack, Play/Pause, SkipForward, Repeat) & Timeline Slider */}
            <div className="flex flex-col items-center gap-1.5 flex-1 max-w-xl px-4">
              <div className="flex items-center justify-center gap-6">
                {/* Shuffle */}
                <button 
                  onClick={() => setIsShuffle(!isShuffle)}
                  className={`transition-all p-1.5 rounded-lg ${
                    isShuffle 
                      ? "text-white bg-white/10 hover:bg-white/15" 
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title={isShuffle ? "셔플 재생 해제" : "셔플 재생 설정"}
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                
                {/* SkipBack */}
                <button
                  onClick={handleSkipBack}
                  className="text-zinc-400 hover:text-white transition-colors p-1"
                  title="이전 곡"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                
                {/* Play/Pause */}
                <button
                  onClick={() => handlePlayTrack(currentDashboardTrack)}
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg cursor-pointer"
                  title={isTrackPlaying ? "일시정지" : "재생"}
                >
                  {isTrackPlaying ? (
                    <Pause className="w-4 h-4 fill-black text-black" />
                  ) : (
                    <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                  )}
                </button>
                
                {/* SkipForward */}
                <button
                  onClick={() => playNext(false)}
                  className="text-zinc-400 hover:text-white transition-colors p-1"
                  title="다음 곡"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
                
                {/* Repeat */}
                <button 
                  onClick={() => setIsRepeat(!isRepeat)}
                  className={`transition-all p-1.5 rounded-lg ${
                    isRepeat 
                      ? "text-white bg-white/10 hover:bg-white/15" 
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title={isRepeat ? "반복 재생 해제" : "한 곡 반복 설정"}
                >
                  <Repeat className="w-4 h-4" />
                </button>
              </div>

              {/* Timeline Slider */}
              <div className="flex items-center gap-2.5 w-full">
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
                    const val = parseFloat(e.target.value);
                    if (audioRef.current) {
                      audioRef.current.currentTime = val;
                      setCurrentTime(val);
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

            {/* Right Actions, Volume & Close */}
            <div className="flex items-center justify-end gap-3 w-1/4">
              {/* Like Button */}
              <button
                onClick={() => toggleLike(currentDashboardTrack.id)}
                className={`p-2 rounded-lg transition-colors ${
                  likedTracks[currentDashboardTrack.id]
                    ? "text-rose-400 bg-rose-500/10"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="좋아요"
              >
                <Heart className={`w-4 h-4 ${likedTracks[currentDashboardTrack.id] ? "fill-current" : ""}`} />
              </button>

              {/* Copy Song Link Button */}
              <button
                onClick={() => handleCopyLink(currentDashboardTrack.id)}
                className="p-2 rounded-lg text-zinc-400 hover:text-white transition-colors"
                title="곡 링크 복사"
              >
                <LinkIcon className="w-4 h-4" />
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const el = audioRef.current;
                    if (!el) return;
                    if (el.volume > 0) {
                      el.volume = 0;
                      setIsMuted(true);
                    } else {
                      el.volume = volume || 0.8;
                      setIsMuted(false);
                    }
                  }}
                  className="text-zinc-400 hover:text-white p-1 transition-colors"
                  title={isMuted ? "음소거 해제" : "음소거"}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVolume(val);
                    setIsMuted(val === 0);
                    if (audioRef.current) {
                      audioRef.current.volume = val;
                    }
                  }}
                  className="w-16 h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: '#ffffff',
                    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(isMuted ? 0 : volume) * 100}%)`,
                  }}
                />
              </div>

              {/* Close Player */}
              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.pause();
                  }
                  setIsTrackPlaying(false);
                  setPlayingTrackId(null);
                }}
                className="text-zinc-500 hover:text-white p-1.5 transition-colors ml-1"
                title="플레이어 닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
