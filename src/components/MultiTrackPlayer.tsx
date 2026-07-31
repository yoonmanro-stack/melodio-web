'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, Headphones, Loader2, DownloadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStemAudio, type StemId } from '@/hooks/useStemAudio';
import { supabase } from '@/lib/supabase';

// ─── 스템 시각 설정 (파스텔 중간톤) ──────────────────────────────────────────
interface StemVisual {
  id: StemId;
  label: string;
  emoji: string;
  color: string;
  glowColor: string;
}

const STEM_VISUALS: StemVisual[] = [
  { id: 'vocals', label: 'Vocals', emoji: '🎤', color: '#c76ad8', glowColor: 'rgba(199,106,216,0.35)' },
  { id: 'drums',  label: 'Drums',  emoji: '🥁', color: '#5abdd4', glowColor: 'rgba(90,189,212,0.35)' },
  { id: 'bass',   label: 'Bass',   emoji: '🎸', color: '#d4b85c', glowColor: 'rgba(212,184,92,0.35)' },
  { id: 'other',  label: 'Melody', emoji: '🎵', color: '#50c89a', glowColor: 'rgba(80,200,154,0.35)' },
];

const BAR_COUNT = 160;

function generateBars(seed: number): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const t = i / BAR_COUNT;
    const w1 = Math.sin(t * (47 + seed)) * 0.35;
    const w2 = Math.sin(t * (113 + seed * 2)) * 0.25;
    const w3 = Math.sin(t * (31 + seed * 3)) * 0.2;
    const pseudo = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    const noise = (pseudo - Math.floor(pseudo) - 0.5) * 0.3;
    // 최소 0.15, 최대 1.0 — 전 구간 고르게 분포
    return Math.max(0.15, Math.min(1, Math.abs(w1 + w2 + w3 + noise) + 0.3));
  });
}

const MOCK_TRACK = {
  title: 'Neon Drift — Extended Mix',
  artist: 'Melodio AI · Persona #007',
  coverGradient: 'from-purple-900 via-fuchsia-900 to-cyan-900',
};

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── 매끄러운 곡선 아날로그 웨이브폼 (SVG Area Path) ──────────────────────────
function CenterBarsWaveform({
  bars, color, progress, isPlaying, isLoading,
}: {
  bars: number[];
  color: string;
  progress: number;
  isPlaying: boolean;
  isLoading: boolean;
}) {
  const [timeSeed, setTimeSeed] = useState(0);

  useEffect(() => {
    if (!isPlaying) return;
    let frame: number;
    const tick = () => {
      setTimeSeed((prev) => (prev + 0.08) % (Math.PI * 2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  if (isLoading) {
    return (
      <div className="h-12 w-full flex items-center justify-center">
        <div className="w-full h-4 bg-white/5 animate-pulse rounded-full" />
      </div>
    );
  }

  // bars 데이터를 기반으로 상하 대칭형 Bezier 곡선 패스 생성
  const pointsTop: string[] = [];
  const pointsBottom: string[] = [];
  const len = bars.length;

  for (let i = 0; i < len; i++) {
    const x = (i / (len - 1)) * 100; // 0% ~ 100%
    
    // 재생 중일 때의 유기적 일렁임(Breathing wave)
    let waveFactor = 1;
    if (isPlaying) {
      const distToPlayhead = Math.abs(i - Math.floor(len * progress));
      const influence = Math.max(0, 1 - distToPlayhead / 30);
      waveFactor = 1 + Math.sin(timeSeed + i * 0.18) * (0.04 + influence * 0.12);
    }
    
    // 높이 계산 (중앙 24px 기준, 최대 높이 스케일링)
    const amp = Math.max(1, bars[i] * 20 * waveFactor);
    const yTop = 24 - amp;
    const yBottom = 24 + amp;

    pointsTop.push(`${x.toFixed(2)},${yTop.toFixed(2)}`);
    pointsBottom.push(`${x.toFixed(2)},${yBottom.toFixed(2)}`);
  }

  const pathTopStr = pointsTop.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p}`).join(' ');
  const pathBottomStr = [...pointsBottom].reverse().map((p) => `L ${p}`).join(' ');
  
  // 완성된 상하 대칭 닫힌 다각형
  const fullPathStr = `${pathTopStr} L 100,24 ${pathBottomStr} Z`;

  return (
    <div className="h-12 w-full relative overflow-visible flex items-center">
      <svg className="w-full h-full" viewBox="0 0 100 48" preserveAspectRatio="none">
        <defs>
          {/* 미재생 배경 그라데이션 */}
          <linearGradient id={`grad-bg-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.04" />
            <stop offset="50%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0.04" />
          </linearGradient>
          
          {/* 재생 중 활성화 그라데이션 */}
          <linearGradient id={`grad-active-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="50%" stopColor={color} stopOpacity="0.8" />
            <stop offset="100%" stopColor={color} stopOpacity="0.3" />
          </linearGradient>
          
          {/* 실시간 클리핑 (진행률 기준) */}
          <clipPath id={`clip-${color}`}>
            <rect x="0" y="0" width={progress * 100} height="48" />
          </clipPath>
        </defs>

        {/* 1. 배경 미재생 웨이브 (매끄러운 실루엣 외곽선) */}
        <path
          d={fullPathStr}
          fill={`url(#grad-bg-${color})`}
          stroke={`${color}22`}
          strokeWidth="0.25"
        />

        {/* 2. 활성 재생 웨이브 (클리핑 마스크 적용) */}
        <g clipPath={`url(#clip-${color})`}>
          <path
            d={fullPathStr}
            fill={`url(#grad-active-${color})`}
            stroke={color}
            strokeWidth="0.45"
            filter={isPlaying ? `drop-shadow(0 0 1.5px ${color}80)` : 'none'}
          />
        </g>
      </svg>

      {/* Playhead glow laser line (초정밀 레이저 재생선) */}
      {progress > 0 && progress < 1 && (
        <div
          className="absolute top-[-3px] bottom-[-3px] w-[2px] pointer-events-none z-10 rounded-full"
          style={{
            left: `${progress * 100}%`,
            background: `linear-gradient(to bottom, transparent 0%, ${color} 30%, #fff 50%, ${color} 70%, transparent 100%)`,
            boxShadow: `0 0 8px ${color}, 0 0 16px ${color}80`,
          }}
        />
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
interface MultiTrackPlayerProps {
  generationId?: string;
  stemUrls?: Partial<Record<StemId, string>>;
  stemStates: Record<StemId, any>;
  allLoaded: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  originalWavUrls: Record<StemId, string | null>;
  play: () => void;
  pause: () => void;
  reset: () => void;
  seek: (time: number) => void;
  toggleMute: (id: StemId) => void;
  toggleSolo: (id: StemId) => void;
  setVolume: (id: StemId, vol: number) => void;
}

export default function MultiTrackPlayer({
  generationId,
  stemUrls,
  stemStates,
  allLoaded,
  isPlaying,
  currentTime,
  duration,
  originalWavUrls,
  play,
  pause,
  reset,
  seek,
  toggleMute,
  toggleSolo,
  setVolume,
}: MultiTrackPlayerProps) {
  const [trackMetadata, setTrackMetadata] = useState<{
    title: string;
    artist: string;
    audioGrade?: string;
    clippingCount?: number;
    dissonanceScore?: number;
  }>({
    title: 'Neon Drift — Extended Mix',
    artist: 'Melodio AI · Persona #007',
  });

  useEffect(() => {
    if (!generationId) {
      setTrackMetadata({
        title: 'Neon Drift — Extended Mix',
        artist: 'Melodio AI · Persona #007',
      });
      return;
    }

    const fetchGenMeta = async () => {
      try {
        const { data, error } = await supabase
          .from('generations')
          .select('title, id, audio_grade, clipping_count, dissonance_score')
          .eq('id', generationId)
          .single();
        
        if (data && !error) {
          setTrackMetadata({
            title: data.title || 'Untitled Track',
            artist: `Melodio AI · Session #${data.id.slice(0, 6).toUpperCase()}`,
            audioGrade: data.audio_grade || undefined,
            clippingCount: data.clipping_count ?? undefined,
            dissonanceScore: data.dissonance_score ?? undefined,
          });
        }
      } catch (err) {
        console.warn('[MultiTrackPlayer] Failed to fetch track metadata:', err);
      }
    };

    const interval = setInterval(fetchGenMeta, 4000); // 4초마다 갱신 (로딩완료/재시도 반영용)
    fetchGenMeta();
    return () => clearInterval(interval);
  }, [generationId]);

  const handleDownload = (url: string | null, stemName: string) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `melodio_${stemName}_original.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const progress  = currentTime / duration;
  const hasSolo   = Object.values(stemStates).some((s) => s.solo);
  const loadedCnt = Object.values(stemStates).filter((s) => s.loadState === 'ready').length;

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  }, [seek, duration]);

  const handlePlayPause = () => (isPlaying ? pause() : play());

  const isActive = (id: StemId) =>
    hasSolo ? stemStates[id].solo : !stemStates[id].muted;

  const stemBars = useMemo(() =>
    Object.fromEntries(STEM_VISUALS.map((v, i) => [v.id, generateBars(i * 17 + 7)])) as Record<StemId, number[]>,
  []);

  return (
    <div className="glass-panel p-6 space-y-5">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-600/70 to-cyan-500/70 flex items-center justify-center">
            <Headphones className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Stem Player</h2>
            <p className="text-[11px] text-zinc-500">4-track hard-sync mixer</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!allLoaded ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-[11px] text-zinc-400"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400" />
              <span>버퍼 로드 중 {loadedCnt}/4</span>
            </motion.div>
          ) : (
            <motion.span
              key="ready"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium"
            >
              ✓ SYNCED · Ready
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* ── 트랙 정보 + 전체 컨트롤 ── */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${MOCK_TRACK.coverGradient} flex-shrink-0 flex items-center justify-center text-xl shadow-lg`}>
          🎵
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate max-w-[280px]">{trackMetadata.title}</span>
            {trackMetadata.audioGrade && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                trackMetadata.audioGrade === 'A' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : trackMetadata.audioGrade === 'B'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                Grade {trackMetadata.audioGrade}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] text-zinc-500 truncate">{trackMetadata.artist}</span>
            {trackMetadata.audioGrade && (
              <span className="text-[9px] text-zinc-600 flex-shrink-0">
                (Clipping: {trackMetadata.clippingCount}회 | Dissonance: {trackMetadata.dissonanceScore}점)
              </span>
            )}
          </div>

          <div className="mt-2 w-full h-1.5 bg-white/10 rounded-full cursor-pointer group" onClick={handleSeek}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-500/60 to-cyan-400/60 relative transition-[width]"
              style={{ width: `${progress * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md" />
            </div>
          </div>

          <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={reset} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <SkipBack className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          <button
            onClick={handlePlayPause}
            disabled={!allLoaded}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #c76ad8, #5abdd4)',
              boxShadow: isPlaying ? '0 0 20px rgba(199,106,216,0.4)' : undefined,
            }}
          >
            <AnimatePresence mode="wait">
              {!allLoaded ? (
                <motion.div key="spinner" initial={{ scale: 0.7 }} animate={{ scale: 1 }}>
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </motion.div>
              ) : isPlaying ? (
                <motion.div key="pause" initial={{ scale: 0.7 }} animate={{ scale: 1 }} exit={{ scale: 0.7 }}>
                  <Pause className="w-4 h-4 text-white" />
                </motion.div>
              ) : (
                <motion.div key="play" initial={{ scale: 0.7 }} animate={{ scale: 1 }} exit={{ scale: 0.7 }}>
                  <Play className="w-4 h-4 text-white ml-0.5" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* ── 스템 채널 목록 ── */}
      <div className="space-y-2">
        {STEM_VISUALS.map((visual) => {
          const audio  = stemStates[visual.id];
          const active = isActive(visual.id);
          const isLoadingStem = audio.loadState === 'loading';

          return (
            <motion.div
              key={visual.id}
              animate={{ opacity: active ? 1 : 0.4 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
              style={{
                background: active ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)',
                borderColor: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                boxShadow: active && isPlaying ? `0 0 12px ${visual.glowColor}` : undefined,
              }}
            >
              <div className="w-20 flex-shrink-0 flex items-center gap-2">
                <span className="text-base">{visual.emoji}</span>
                <span className="text-xs font-semibold text-zinc-300">{visual.label}</span>
              </div>

              <div className="flex-1">
                <CenterBarsWaveform
                  bars={stemBars[visual.id]}
                  color={visual.color}
                  progress={progress}
                  isPlaying={isPlaying && active}
                  isLoading={isLoadingStem}
                />
              </div>

              <div className="flex items-center gap-1.5 w-24 flex-shrink-0">
                <Volume2 className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={audio.volume}
                  onChange={(e) => setVolume(visual.id, parseFloat(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: visual.color,
                    background: `linear-gradient(to right, ${visual.color} ${audio.volume * 100}%, rgba(255,255,255,0.1) ${audio.volume * 100}%)`,
                  }}
                />
              </div>

              <button
                onClick={() => toggleSolo(visual.id)}
                className="w-7 h-7 rounded-md text-[10px] font-bold transition-all flex-shrink-0"
                style={{
                  background: audio.solo ? visual.color : 'rgba(255,255,255,0.06)',
                  color: audio.solo ? '#000' : 'rgba(255,255,255,0.4)',
                  boxShadow: audio.solo ? `0 0 8px ${visual.glowColor}` : undefined,
                }}
              >
                S
              </button>

              <button
                onClick={() => toggleMute(visual.id)}
                className="w-7 h-7 rounded-md flex items-center justify-center transition-all flex-shrink-0"
                style={{
                  background: audio.muted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
                  border: audio.muted ? '1px solid rgba(239,68,68,0.4)' : '1px solid transparent',
                }}
              >
                {audio.muted
                  ? <VolumeX className="w-3.5 h-3.5 text-red-400" />
                  : <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                }
              </button>

              {originalWavUrls[visual.id] && (
                <button
                  title="Download WAV Original"
                  onClick={() => handleDownload(originalWavUrls[visual.id], visual.label)}
                  className="w-7 h-7 rounded-md flex items-center justify-center transition-all flex-shrink-0 hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <DownloadCloud className="w-3.5 h-3.5 text-cyan-400" />
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-zinc-600">🎛 Web Audio API · Hard-Sync · Solo(S) · Mute · Vol</p>
        <span className="text-[10px] text-zinc-700">Phase 11 · {generationId ? 'Live (Dual Path)' : 'Mock Tones'}</span>
      </div>
    </div>
  );
}
