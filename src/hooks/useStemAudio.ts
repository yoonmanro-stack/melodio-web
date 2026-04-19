'use client';

/**
 * useStemAudio — 4채널 스템 오디오 하드싱크 훅
 *
 * 동작 원리:
 * 1. generationId/stemUrls 미제공 시 → Web Audio API 로 더미 톤 버퍼 생성
 * 2. 제공 시 → Supabase Storage URL 로드 → 실패하면 더미 폴백
 * 3. Promise.all 패턴: 4개 버퍼가 모두 준비된 뒤 AudioContext.currentTime
 *    기준 단일 스케줄로 동시 start() → 샘플 단위 오차 없는 하드싱크
 * 4. GainNode 개별 연결로 Mute/Solo/Volume 즉각 반영
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type StemId = 'vocals' | 'drums' | 'bass' | 'other';

export interface StemAudioState {
  id: StemId;
  loadState: 'loading' | 'ready' | 'error';
  muted: boolean;
  solo: boolean;
  volume: number;
}

export interface UseStemAudioOptions {
  /** 실제 generation ID — 제공 시 Supabase URL 로드 시도 */
  generationId?: string;
  /** 직접 URL 주입 (generationId 없이 사용 가능) */
  stemUrls?: Partial<Record<StemId, string>>;
}

export interface UseStemAudioReturn {
  stemStates: Record<StemId, StemAudioState>;
  allLoaded: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  /** 원본 고음질 WAV URL 맵 (다운로드용) */
  originalWavUrls: Record<StemId, string | null>;
  play: () => void;
  pause: () => void;
  reset: () => void;
  seek: (time: number) => void;
  toggleMute: (id: StemId) => void;
  toggleSolo: (id: StemId) => void;
  setVolume: (id: StemId, volume: number) => void;
}

// ─── 상수 ──────────────────────────────────────────────────────────────────
const STEM_IDS: StemId[] = ['vocals', 'drums', 'bass', 'other'];
const LOOP_DURATION = 12; // 12초 루프 (더미 모드)

// ─── 더미 오디오 버퍼 생성 (Web Audio API) ──────────────────────────────────
function makeDummyBuffer(ctx: AudioContext, id: StemId): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * LOOP_DURATION);
  const buf = ctx.createBuffer(2, n, sr);

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    switch (id) {
      case 'vocals':
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const vibrato = 1 + Math.sin(2 * Math.PI * 5.5 * t) * 0.003;
          d[i] = Math.sin(2 * Math.PI * 440 * vibrato * t) * 0.22 + Math.sin(2 * Math.PI * 528 * vibrato * t) * 0.10 + Math.sin(2 * Math.PI * 660 * vibrato * t) * 0.06;
        }
        break;
      case 'drums': {
        const kickN = Math.floor(sr * 0.5);
        const hatN  = Math.floor(sr * 0.25);
        for (let i = 0; i < n; i++) {
          const kp = i % kickN;
          const hp = i % hatN;
          const kick  = kp < 4000 ? (Math.random() * 2 - 1) * Math.exp(-kp / 380) * 0.65 : 0;
          const hihat = hp < 500  ? (Math.random() * 2 - 1) * Math.exp(-hp / 90)  * 0.18 : 0;
          d[i] = kick + hihat;
        }
        break;
      }
      case 'bass':
        for (let i = 0; i < n; i++) {
          d[i] = Math.sin(2 * Math.PI * 110 * i / sr) * 0.38 + Math.sin(2 * Math.PI * 220 * i / sr) * 0.10 + Math.sin(2 * Math.PI * 330 * i / sr) * 0.04;
        }
        break;
      case 'other': {
        const chordNotes = [330, 392, 494, 392, 440, 392];
        const noteLen = Math.floor(sr * (LOOP_DURATION / chordNotes.length));
        for (let i = 0; i < n; i++) {
          const noteIdx = Math.floor(i / noteLen) % chordNotes.length;
          const notePhase = i % noteLen;
          const env = Math.min(1, notePhase / 800) * Math.max(0, 1 - (notePhase / noteLen) * 0.6);
          d[i] = Math.sin(2 * Math.PI * chordNotes[noteIdx] * i / sr) * 0.18 * env;
        }
        break;
      }
    }
  }
  return buf;
}

// ─── 초기 상태 생성 ──────────────────────────────────────────────────────────
const DEFAULT_VOLUMES: Record<StemId, number> = {
  vocals: 0.85, drums: 0.9, bass: 0.75, other: 0.8,
};

function makeInitialStates(): Record<StemId, StemAudioState> {
  return Object.fromEntries(
    STEM_IDS.map((id) => [
      id,
      { id, loadState: 'loading' as const, muted: false, solo: false, volume: DEFAULT_VOLUMES[id] },
    ])
  ) as Record<StemId, StemAudioState>;
}

// ─── 메인 훅 ──────────────────────────────────────────────────────────────────
export function useStemAudio(options: UseStemAudioOptions = {}): UseStemAudioReturn {
  const { generationId, stemUrls } = options;

  const [stemStates, setStemStates] = useState<Record<StemId, StemAudioState>>(makeInitialStates);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [originalWavUrls, setOriginalWavUrls] = useState<Record<StemId, string | null>>({
    vocals: null, drums: null, bass: null, other: null
  });

  const ctxRef      = useRef<AudioContext | null>(null);
  const gainsRef    = useRef<Partial<Record<StemId, GainNode>>>({});
  const sourcesRef  = useRef<Partial<Record<StemId, AudioBufferSourceNode>>>({});
  const buffersRef  = useRef<Partial<Record<StemId, AudioBuffer>>>({});
  const playStartRef = useRef(0);
  const offsetRef    = useRef(0);
  const rafRef       = useRef(0);
  const isPlayingRef = useRef(false);

  // ─── AudioContext 초기화 + 버퍼 로드 ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Reset URL maps
    setOriginalWavUrls({ vocals: null, drums: null, bass: null, other: null });
    setStemStates(makeInitialStates());

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    for (const id of STEM_IDS) {
      const gain = ctx.createGain();
      gain.gain.value = DEFAULT_VOLUMES[id];
      gain.connect(ctx.destination);
      gainsRef.current[id] = gain;
    }

    const loadData = async () => {
      let previewUrlsToFetch: Partial<Record<StemId, string>> = {};
      let originalUrlsMapped: Record<StemId, string | null> = { vocals: null, drums: null, bass: null, other: null };

      if (generationId) {
        // 백엔드 세션 DB 조회
        const { data, error } = await supabase.from('generations').select('*').eq('id', generationId).single();
        if (data && !error && data.status === 'completed') {
          previewUrlsToFetch = {
            vocals: data.preview_vocals_url,
            drums: data.preview_drums_url,
            bass: data.preview_bass_url,
            other: data.preview_other_url,
          };
          originalUrlsMapped = {
            vocals: data.stem_vocals_url,
            drums: data.stem_drums_url,
            bass: data.stem_bass_url,
            other: data.stem_other_url,
          };
          setOriginalWavUrls(originalUrlsMapped);
        } else {
          console.warn('DB 조회가 실패했거나 아직 완료되지 않았습니다.', error);
        }
      } else if (stemUrls) {
        previewUrlsToFetch = stemUrls;
      }

      const tasks = STEM_IDS.map(async (id) => {
        const url = previewUrlsToFetch[id] ?? null;
        try {
          if (url) {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const raw = await resp.arrayBuffer();
            buffersRef.current[id] = await ctx.decodeAudioData(raw);
          } else {
            buffersRef.current[id] = makeDummyBuffer(ctx, id);
          }
        } catch {
          buffersRef.current[id] = makeDummyBuffer(ctx, id);
        }
        setStemStates((prev) => ({
          ...prev,
          [id]: { ...prev[id], loadState: 'ready' },
        }));
      });

      await Promise.all(tasks);
    };

    loadData();

    return () => {
      cancelAnimationFrame(rafRef.current);
      isPlayingRef.current = false;
      for (const id of STEM_IDS) {
        try { sourcesRef.current[id]?.stop(); } catch { /* 무시 */ }
      }
      ctx.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationId]);

  const allLoaded = STEM_IDS.every((id) => stemStates[id].loadState === 'ready');

  // ─── RAF 타임 업데이트 ─────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !isPlayingRef.current) return;
    const t = ctx.currentTime - playStartRef.current;
    setCurrentTime(Math.max(0, t % LOOP_DURATION));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ─── 전 스템 동시 스케줄 (하드싱크 핵심) ──────────────────────────────────
  const scheduleAll = useCallback((fromOffset: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    // 기존 소스 일괄 정지
    for (const id of STEM_IDS) {
      try { sourcesRef.current[id]?.stop(); } catch { /* 무시 */ }
    }

    // 50ms 후 미래 시각 — 모든 노드를 동일 시각에 예약
    const startAt = ctx.currentTime + 0.05;
    playStartRef.current = startAt - fromOffset;

    for (const id of STEM_IDS) {
      const buf  = buffersRef.current[id];
      const gain = gainsRef.current[id];
      if (!buf || !gain) continue;

      const src = ctx.createBufferSource();
      src.buffer   = buf;
      src.loop     = true;
      src.loopEnd  = LOOP_DURATION;
      src.connect(gain);
      // ★ 모든 스템을 startAt 동일 시각에 start (하드싱크)
      src.start(startAt, fromOffset % LOOP_DURATION);
      sourcesRef.current[id] = src;
    }
  }, []);

  // ─── 재생 ─────────────────────────────────────────────────────────────────
  const play = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx || !allLoaded) return;
    if (ctx.state === 'suspended') await ctx.resume();

    scheduleAll(offsetRef.current);
    setIsPlaying(true);
    isPlayingRef.current = true;
    rafRef.current = requestAnimationFrame(tick);
  }, [allLoaded, scheduleAll, tick]);

  // ─── 일시정지 ─────────────────────────────────────────────────────────────
  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx) {
      offsetRef.current = ctx.currentTime - playStartRef.current;
    }
    for (const id of STEM_IDS) {
      try { sourcesRef.current[id]?.stop(); } catch { /* 무시 */ }
    }
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  // ─── 리셋 ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    pause();
    offsetRef.current = 0;
    setCurrentTime(0);
  }, [pause]);

  // ─── Seek ──────────────────────────────────────────────────────────────────
  const seek = useCallback((time: number) => {
    offsetRef.current = time;
    if (isPlayingRef.current) {
      scheduleAll(time);
    } else {
      setCurrentTime(time);
    }
  }, [scheduleAll]);

  // ─── GainNode 실시간 반영 ─────────────────────────────────────────────────
  useEffect(() => {
    const hasSolo = STEM_IDS.some((id) => stemStates[id].solo);
    for (const id of STEM_IDS) {
      const gain = gainsRef.current[id];
      if (!gain) continue;
      const s = stemStates[id];
      const silent = hasSolo ? !s.solo : s.muted;
      // gain.value 직접 조절 — 끊김 없는 즉시 반영
      gain.gain.value = silent ? 0 : s.volume;
    }
  }, [stemStates]);

  // ─── 컨트롤 액션 ──────────────────────────────────────────────────────────
  const toggleMute = useCallback((id: StemId) => {
    setStemStates((prev) => ({ ...prev, [id]: { ...prev[id], muted: !prev[id].muted } }));
  }, []);

  const toggleSolo = useCallback((id: StemId) => {
    setStemStates((prev) => {
      const wasSolo = prev[id].solo;
      const next = { ...prev };
      for (const sid of STEM_IDS) {
        next[sid] = { ...next[sid], solo: sid === id ? !wasSolo : false };
      }
      return next;
    });
  }, []);

  const setVolume = useCallback((id: StemId, volume: number) => {
    setStemStates((prev) => ({ ...prev, [id]: { ...prev[id], volume } }));
  }, []);

  return {
    stemStates, allLoaded,
    isPlaying, currentTime, duration: LOOP_DURATION,
    originalWavUrls,
    play, pause, reset, seek,
    toggleMute, toggleSolo, setVolume,
  };
}
