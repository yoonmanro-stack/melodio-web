'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Scissors, Play, Pause, RotateCcw, Download, Sparkles, 
  Mic2, Drum, Guitar, Music2, Layers, Loader2, Volume2, Check, ArrowRight
} from 'lucide-react';
import { audioBufferToWav, sliceAudioBuffer } from '@/lib/audioWavUtils';
import Link from 'next/link';

interface StemOption {
  id: string;
  label: string;
  url?: string;
  icon: any;
  color: string;
  badge?: string;
}

interface AudioTrimmerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackTitle?: string;
  stems: {
    vocals?: string;
    drums?: string;
    bass?: string;
    melody?: string;
    original?: string;
  };
}

function formatSec(sec: number): string {
  if (isNaN(sec) || sec < 0) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

export default function AudioTrimmerModal({
  isOpen,
  onClose,
  trackTitle = '오디오 트랙',
  stems,
}: AudioTrimmerModalProps) {
  const [selectedStemId, setSelectedStemId] = useState<string>('vocals');
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);

  // 구간 선택 (초 단위)
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(20);

  // 재생 상태
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 스템 옵션 리스트
  const stemOptions: StemOption[] = [
    { id: 'vocals', label: '보컬 (Vocals)', url: stems.vocals, icon: Mic2, color: '#ec4899', badge: '보이스 디자인 최적' },
    { id: 'drums', label: '드럼 (Drums)', url: stems.drums, icon: Drum, color: '#06b6d4' },
    { id: 'bass', label: '베이스 (Bass)', url: stems.bass, icon: Guitar, color: '#8b5cf6' },
    { id: 'melody', label: '멜로디 (Melody)', url: stems.melody, icon: Music2, color: '#10b981' },
    { id: 'original', label: '원곡 전체 (Full)', url: stems.original, icon: Layers, color: '#f59e0b' },
  ];

  const currentStem = stemOptions.find(s => s.id === selectedStemId) || stemOptions[0];
  const selectedDuration = Math.max(0, endTime - startTime);

  // 1. AudioContext 초기화
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // 2. 선택된 스템 오디오 다운로드 및 디코딩
  useEffect(() => {
    if (!isOpen) return;

    const targetUrl = currentStem.url || stems.original || stems.vocals;
    if (!targetUrl) return;

    let isMounted = true;
    setIsLoadingAudio(true);
    stopPlayback();

    const loadAudio = async () => {
      try {
        const resp = await fetch(targetUrl);
        const arrayBuffer = await resp.arrayBuffer();
        const ctx = getAudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuffer);

        if (!isMounted) return;
        setAudioBuffer(decoded);
        const dur = decoded.duration;
        setTotalDuration(dur);
        
        // 기본 20초 세팅 (곡 전체가 20초보다 짧으면 전체)
        setStartTime(0);
        setEndTime(Math.min(20, Math.floor(dur)));
        setCurrentTime(0);
      } catch (err) {
        console.error('[AudioTrimmerModal] Failed to load/decode audio:', err);
      } finally {
        if (isMounted) setIsLoadingAudio(false);
      }
    };

    loadAudio();

    return () => {
      isMounted = false;
      stopPlayback();
    };
  }, [isOpen, selectedStemId, stems, getAudioContext]);

  // 3. 파형 캔버스 렌더링
  useEffect(() => {
    if (!canvasRef.current || !audioBuffer) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const rawData = audioBuffer.getChannelData(0);
    const step = Math.ceil(rawData.length / width);
    const amp = height / 2;

    // 파형 그리기
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = rawData[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }

    // 선택 구간 강조 배경
    if (totalDuration > 0) {
      const startX = (startTime / totalDuration) * width;
      const endX = (endTime / totalDuration) * width;
      
      const grad = ctx.createLinearGradient(startX, 0, endX, 0);
      grad.addColorStop(0, `${currentStem.color}33`);
      grad.addColorStop(1, `${currentStem.color}66`);
      
      ctx.fillStyle = grad;
      ctx.fillRect(startX, 0, endX - startX, height);

      // 선택 구간 파형 선명하게 덧그리기
      ctx.fillStyle = currentStem.color;
      for (let i = Math.floor(startX); i <= Math.ceil(endX); i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
          const datum = rawData[i * step + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
      }

      // 재생 헤드 표시
      if (isPlaying && currentTime >= startTime && currentTime <= endTime) {
        const playX = (currentTime / totalDuration) * width;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.fillRect(playX - 1, 0, 2, height);
        ctx.shadowBlur = 0;
      }
    }
  }, [audioBuffer, startTime, endTime, totalDuration, currentStem, isPlaying, currentTime]);

  // 4. 구간 재생 로직
  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const playRange = useCallback((offsetSec: number = startTime) => {
    if (!audioBuffer) return;
    stopPlayback();

    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const dur = Math.max(0.1, endTime - offsetSec);
    source.start(0, offsetSec, dur);
    sourceNodeRef.current = source;
    playStartTimeRef.current = ctx.currentTime - (offsetSec - startTime);
    setIsPlaying(true);

    const updatePlayhead = () => {
      if (!sourceNodeRef.current) return;
      const elapsed = ctx.currentTime - playStartTimeRef.current;
      const current = startTime + elapsed;

      if (current >= endTime) {
        if (isLooping) {
          playRange(startTime);
        } else {
          stopPlayback();
          setCurrentTime(startTime);
        }
        return;
      }

      setCurrentTime(current);
      animFrameRef.current = requestAnimationFrame(updatePlayhead);
    };

    animFrameRef.current = requestAnimationFrame(updatePlayhead);

    source.onended = () => {
      if (!isLooping) {
        setIsPlaying(false);
      }
    };
  }, [audioBuffer, startTime, endTime, isLooping, getAudioContext, stopPlayback]);

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      playRange(startTime);
    }
  };

  // 5. 프리셋 길이 설정
  const applyPresetDuration = (sec: number) => {
    stopPlayback();
    const newEnd = Math.min(totalDuration, startTime + sec);
    setEndTime(newEnd);
  };

  // 6. 무손실 WAV 슬라이스 다운로드
  const handleDownloadWav = () => {
    if (!audioBuffer) return;
    setIsDownloading(true);

    try {
      const ctx = getAudioContext();
      const slicedBuffer = sliceAudioBuffer(ctx, audioBuffer, startTime, endTime);
      const wavBlob = audioBufferToWav(slicedBuffer);

      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      const cleanName = trackTitle.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
      const startStr = Math.floor(startTime);
      const endStr = Math.floor(endTime);
      a.href = url;
      a.download = `[Melodio_${currentStem.id}]_${cleanName}_${startStr}s-${endStr}s.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('[AudioTrimmerModal] Download failed:', err);
      alert('WAV 다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
        {/* 백드롭 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* 모달 창 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl rounded-2xl bg-zinc-950 border border-white/10 p-6 shadow-2xl overflow-hidden z-10"
          style={{
            boxShadow: `0 0 60px ${currentStem.color}22, 0 0 100px rgba(0,0,0,0.8)`,
          }}
        >
          {/* 닫기 버튼 */}
          <button
            onClick={() => {
              stopPlayback();
              onClose();
            }}
            className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* 헤더 */}
          <div className="flex items-center gap-3 mb-5">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-colors"
              style={{ backgroundColor: `${currentStem.color}22`, color: currentStem.color }}
            >
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  4-Track 정밀 구간 컷 & 보컬 추출기
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                  수노 Persona 100% 규격
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate max-w-md">
                '{trackTitle}' 트랙에서 원하는 15~30초 구간을 잘라내어 다운로드합니다.
              </p>
            </div>
          </div>

          {/* 스템 선택 탭 */}
          <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-xl mb-5 overflow-x-auto">
            {stemOptions.map(stem => {
              const Icon = stem.icon;
              const isSelected = selectedStemId === stem.id;
              const isAvailable = Boolean(stem.url || stems.original);
              return (
                <button
                  key={stem.id}
                  disabled={!isAvailable}
                  onClick={() => {
                    setSelectedStemId(stem.id);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    isSelected
                      ? 'bg-white text-zinc-950 shadow-md scale-[1.02]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5 disabled:opacity-30'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: isSelected ? '#000000' : stem.color }} />
                  <span>{stem.label}</span>
                  {stem.badge && (
                    <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.2 rounded-md bg-fuchsia-500/20 text-fuchsia-700 font-extrabold">
                      ⭐
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 파형 시각화 영역 */}
          <div className="relative rounded-xl bg-zinc-900/90 border border-white/10 p-3 mb-4 overflow-hidden">
            {isLoadingAudio ? (
              <div className="h-28 flex flex-col items-center justify-center gap-2 text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400" />
                <span className="text-xs">무손실 오디오 디코딩 중...</span>
              </div>
            ) : (
              <>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={110}
                  className="w-full h-28 rounded-lg cursor-pointer block"
                />

                {/* 구간 시간 안내 바 */}
                <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono mt-2 px-1">
                  <span>0:00</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold bg-white/10 px-2 py-0.5 rounded">
                      시작: {formatSec(startTime)}
                    </span>
                    <span className="text-zinc-400">➔</span>
                    <span className="text-white font-bold bg-white/10 px-2 py-0.5 rounded">
                      종료: {formatSec(endTime)}
                    </span>
                  </div>
                  <span>{formatSec(totalDuration)}</span>
                </div>
              </>
            )}
          </div>

          {/* 듀얼 슬라이더 컨트롤 */}
          <div className="space-y-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 mb-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">시작 시간 (Start)</span>
                  <span className="text-white font-mono font-bold">{formatSec(startTime)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, endTime - 1)}
                  step={0.5}
                  value={startTime}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setStartTime(val);
                    if (isPlaying) stopPlayback();
                  }}
                  className="w-full accent-fuchsia-500 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">종료 시간 (End)</span>
                  <span className="text-white font-mono font-bold">{formatSec(endTime)}</span>
                </div>
                <input
                  type="range"
                  min={Math.min(totalDuration, startTime + 1)}
                  max={totalDuration || 60}
                  step={0.5}
                  value={endTime}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setEndTime(val);
                    if (isPlaying) stopPlayback();
                  }}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            {/* 빠른 프리셋 버튼 */}
            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-400 mr-1">추천 길이:</span>
                <button
                  onClick={() => applyPresetDuration(15)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    Math.round(selectedDuration) === 15
                      ? 'bg-fuchsia-500 text-white'
                      : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  15초
                </button>
                <button
                  onClick={() => applyPresetDuration(20)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    Math.round(selectedDuration) === 20
                      ? 'bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white shadow-md'
                      : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  ⚡ 20초 (수노 최적)
                </button>
                <button
                  onClick={() => applyPresetDuration(30)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    Math.round(selectedDuration) === 30
                      ? 'bg-cyan-500 text-zinc-950'
                      : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  30초
                </button>
              </div>

              <div className="text-right">
                <span className="text-xs text-zinc-400">선택 길이: </span>
                <span className="text-xs font-bold text-fuchsia-400 font-mono">
                  {selectedDuration.toFixed(1)}초
                </span>
                {selectedDuration >= 15 && selectedDuration <= 30 && (
                  <span className="ml-1.5 text-[10px] text-emerald-400 font-bold">✓ 적합</span>
                )}
              </div>
            </div>
          </div>

          {/* 재생 및 다운로드 액션 바 */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                disabled={isLoadingAudio || !audioBuffer}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  isPlaying
                    ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? '일시정지' : '선택 구간 미리듣기'}</span>
              </button>

              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`p-2.5 rounded-xl transition-all ${
                  isLooping ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30' : 'bg-white/5 text-zinc-500'
                }`}
                title={isLooping ? '구간 반복 재생 켜짐' : '구간 반복 재생 꺼짐'}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadWav}
                disabled={isLoadingAudio || !audioBuffer || isDownloading}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all ${
                  downloadSuccess
                    ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                    : 'bg-gradient-to-r from-fuchsia-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400 text-white shadow-fuchsia-500/20 hover:scale-[1.02]'
                }`}
              >
                {downloadSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>다운로드 완료!</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>{selectedDuration.toFixed(0)}초 무손실 WAV 저장</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
