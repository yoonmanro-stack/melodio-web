'use client';

import { useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, Headphones, Loader2, DownloadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStemAudio, type StemId } from '@/hooks/useStemAudio';

// ─── 스템 시각 설정 (정적) ────────────────────────────────────────────────────
interface StemVisual {
  id: StemId;
  label: string;
  emoji: string;
  glowColor: string;
  accentColor: string;
  barColor: string;
  bars: number[];
}

function generateBars(count: number, seed: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const x = Math.sin(seed + i * 0.7) * Math.cos(i * 0.3 + seed * 0.5);
    return Math.abs(x) * 0.7 + 0.15;
  });
}

const STEM_VISUALS: StemVisual[] = [
  {
    id: 'vocals', label: 'Vocals', emoji: '🎤',
    glowColor: 'rgba(192,38,211,0.4)', accentColor: '#d946ef', barColor: '#e879f9',
    bars: generateBars(48, 1.2),
  },
  {
    id: 'drums', label: 'Drums', emoji: '🥁',
    glowColor: 'rgba(6,182,212,0.4)', accentColor: '#06b6d4', barColor: '#22d3ee',
    bars: generateBars(48, 3.5),
  },
  {
    id: 'bass', label: 'Bass', emoji: '🎸',
    glowColor: 'rgba(245,158,11,0.4)', accentColor: '#f59e0b', barColor: '#fbbf24',
    bars: generateBars(48, 6.8),
  },
  {
    id: 'other', label: 'Guitar', emoji: '🎵',
    glowColor: 'rgba(16,185,129,0.4)', accentColor: '#10b981', barColor: '#34d399',
    bars: generateBars(48, 9.1),
  },
];

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

// ─── 웨이브폼 바 컴포넌트 ─────────────────────────────────────────────────────
function WaveformBars({
  bars, color, progress, isPlaying, isLoading,
}: {
  bars: number[];
  color: string;
  progress: number;
  isPlaying: boolean;
  isLoading: boolean;
}) {
  const playedCount = Math.floor(bars.length * progress);

  if (isLoading) {
    // 로딩 중: 펄스 애니메이션
    return (
      <div className="flex items-center gap-[2px] h-10 w-full">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            className="rounded-full flex-1 bg-white/10"
            style={{ height: `${h * 60}%`, minHeight: 2 }}
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.02, ease: 'easeInOut' }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-[2px] h-10 w-full">
      {bars.map((h, i) => {
        const played   = i < playedCount;
        const isCurrent = i === playedCount;
        return (
          <motion.div
            key={i}
            className="rounded-full flex-1"
            style={{
              height: `${h * 100}%`,
              minHeight: 2,
              backgroundColor: played || isCurrent ? color : 'rgba(255,255,255,0.12)',
              opacity: isCurrent ? 1 : played ? 0.9 : 0.4,
            }}
            animate={
              isPlaying && isCurrent
                ? { scaleY: [1, 1.5, 0.8, 1.3, 1], opacity: [1, 0.8, 1] }
                : {}
            }
            transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        );
      })}
    </div>
  );
}

// ─── 로딩 스피너 오버레이 ─────────────────────────────────────────────────────
function LoadingBadge({ loaded, total }: { loaded: number; total: number }) {
  return (
    <motion.div
      className="flex items-center gap-1.5 text-[11px] text-zinc-400"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400" />
      <span>버퍼 로드 중 {loaded}/{total}</span>
    </motion.div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
interface MultiTrackPlayerProps {
  /** 실제 generation ID (미제공 시 더미 오디오 사용) */
  generationId?: string;
  stemUrls?: Partial<Record<StemId, string>>;
}

export default function MultiTrackPlayer({ generationId, stemUrls }: MultiTrackPlayerProps = {}) {
  const {
    stemStates, allLoaded,
    isPlaying, currentTime, duration,
    originalWavUrls,
    play, pause, reset, seek,
    toggleMute, toggleSolo, setVolume,
  } = useStemAudio({ generationId, stemUrls });

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

  return (
    <div className="glass-panel p-6 space-y-5">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-600 to-cyan-500 flex items-center justify-center">
            <Headphones className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Stem Player</h2>
            <p className="text-[11px] text-zinc-500">4-track hard-sync mixer</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!allLoaded ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LoadingBadge loaded={loadedCnt} total={4} />
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
        {/* 커버 아트 */}
        <div
          className={`w-14 h-14 rounded-xl bg-gradient-to-br ${MOCK_TRACK.coverGradient} flex-shrink-0 flex items-center justify-center text-xl shadow-lg`}
        >
          🎵
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{MOCK_TRACK.title}</div>
          <div className="text-[11px] text-zinc-500 truncate">{MOCK_TRACK.artist}</div>

          {/* 프로그레스 바 */}
          <div
            className="mt-2 w-full h-1.5 bg-white/10 rounded-full cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 relative transition-[width]"
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

        {/* 컨트롤 버튼 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={reset}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <SkipBack className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {/* ★ 로딩 완료 전 비활성화 + 스피너 표시 */}
          <button
            onClick={handlePlayPause}
            disabled={!allLoaded}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #c026d3, #06b6d4)',
              boxShadow: isPlaying ? '0 0 20px rgba(192,38,211,0.6)' : undefined,
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
          const isLoading = audio.loadState === 'loading';

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
              {/* 스템 라벨 */}
              <div className="w-20 flex-shrink-0 flex items-center gap-2">
                <span className="text-base">{visual.emoji}</span>
                <span className="text-xs font-semibold text-zinc-300">{visual.label}</span>
              </div>

              {/* 웨이브폼 */}
              <div className="flex-1">
                <WaveformBars
                  bars={visual.bars}
                  color={visual.barColor}
                  progress={progress}
                  isPlaying={isPlaying && active}
                  isLoading={isLoading}
                />
              </div>

              {/* 볼륨 슬라이더 */}
              <div className="flex items-center gap-1.5 w-24 flex-shrink-0">
                <Volume2 className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={audio.volume}
                  onChange={(e) => setVolume(visual.id, parseFloat(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: visual.accentColor,
                    background: `linear-gradient(to right, ${visual.accentColor} ${audio.volume * 100}%, rgba(255,255,255,0.1) ${audio.volume * 100}%)`,
                  }}
                />
              </div>

              {/* Solo 버튼 */}
              <button
                onClick={() => toggleSolo(visual.id)}
                className="w-7 h-7 rounded-md text-[10px] font-bold transition-all flex-shrink-0"
                style={{
                  background: audio.solo ? visual.accentColor : 'rgba(255,255,255,0.06)',
                  color: audio.solo ? '#000' : 'rgba(255,255,255,0.4)',
                  boxShadow: audio.solo ? `0 0 8px ${visual.glowColor}` : undefined,
                }}
              >
                S
              </button>

              {/* Mute 버튼 */}
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

              {/* 다운로드 버튼 (원본 WAV) */}
              {originalWavUrls[visual.id] && (
                <button
                  title="Download WAV Original"
                  onClick={() => handleDownload(originalWavUrls[visual.id], visual.label)}
                  className="w-7 h-7 rounded-md flex items-center justify-center transition-all flex-shrink-0 hover:bg-white/10"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <DownloadCloud className="w-3.5 h-3.5 text-cyan-400 hover:text-cyan-300" />
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ── 하단 레이블 ── */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-zinc-600">
          🎛 Web Audio API · Hard-Sync · Solo(S) · Mute · Vol
        </p>
        <span className="text-[10px] text-zinc-700">Phase 11 · {generationId ? 'Live (Dual Path)' : 'Mock Tones'}</span>
      </div>
    </div>
  );
}
