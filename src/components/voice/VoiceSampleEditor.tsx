"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Download } from "lucide-react";
import { getVoiceDownloadFormat, trimVoiceSampleOriginal } from "@/lib/audio/voiceSampleDownload";

export type VoiceSampleSelection = {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  valid: boolean;
};

type Props = {
  file: File;
  onSelectionChange: (selection: VoiceSampleSelection) => void;
};

type MediaInfo = { file: File; duration: number | null; error: string | null };
type Range = { file: File; start: number; end: number };
type DownloadState = Range & {
  controller: AbortController;
  stage: "loading" | "trimming" | "saved" | "error";
  message?: string;
};

const MIN_SECONDS = 6;
const MAX_SECONDS = 120;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(value: number) {
  if (!Number.isFinite(value)) return "0:00.0";
  const minutes = Math.floor(value / 60);
  const seconds = (value % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

export function VoiceSampleEditor({ file, onSelectionChange }: Props) {
  const startId = useId();
  const endId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewActiveRef = useRef(false);
  const previewEndRef = useRef(0);
  const previewFrameRef = useRef<number | null>(null);
  const sourceRef = useRef<{ file: File; url: string } | null>(null);
  const fallbackAttemptRef = useRef<string | null>(null);
  const nativeDurationRef = useRef<string | null>(null);
  const callbackRef = useRef(onSelectionChange);
  const downloadRef = useRef<AbortController | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [playhead, setPlayhead] = useState<{ file: File; seconds: number } | null>(null);
  const [previewingFile, setPreviewingFile] = useState<File | null>(null);
  const [previewError, setPreviewError] = useState<{ file: File; message: string } | null>(null);

  useEffect(() => { callbackRef.current = onSelectionChange; }, [onSelectionChange]);

  useEffect(() => {
    const audio = audioRef.current;
    const url = URL.createObjectURL(file);
    sourceRef.current = { file, url };
    fallbackAttemptRef.current = null;
    nativeDurationRef.current = null;
    if (audio) {
      audio.src = url;
      audio.load();
    }
    return () => {
      audio?.pause();
      audio?.removeAttribute("src");
      previewActiveRef.current = false;
      if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
      if (sourceRef.current?.url === url) sourceRef.current = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const duration = mediaInfo?.file === file ? mediaInfo.duration : null;
  const metadataError = mediaInfo?.file === file ? mediaInfo.error : null;
  const playbackError = previewError?.file === file ? previewError.message : null;
  const start = range?.file === file ? range.start : 0;
  const end = range?.file === file ? range.end : 0;
  const currentTime = playhead?.file === file ? playhead.seconds : 0;
  const selectedDuration = Math.max(0, end - start);
  const valid = duration !== null && duration >= MIN_SECONDS
    && start >= 0 && end <= duration + 0.001
    && selectedDuration >= MIN_SECONDS - 0.001 && selectedDuration <= MAX_SECONDS + 0.001;
  const isPreviewing = previewingFile === file;
  const downloadFormat = getVoiceDownloadFormat(file);
  const currentDownload = downloadState?.file === file && downloadState.start === start
    && downloadState.end === end && !downloadState.controller.signal.aborted ? downloadState : null;
  const downloading = currentDownload?.stage === "loading" || currentDownload?.stage === "trimming";

  useEffect(() => () => {
    downloadRef.current?.abort();
    downloadRef.current = null;
  }, [file, start, end]);

  useEffect(() => {
    callbackRef.current({ startSeconds: start, endSeconds: end, durationSeconds: selectedDuration, valid });
  }, [file, start, end, selectedDuration, valid]);

  const finishPreview = useCallback((pauseAudio: boolean) => {
    previewActiveRef.current = false;
    if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);
    previewFrameRef.current = null;
    if (pauseAudio) audioRef.current?.pause();
    setPreviewingFile(null);
  }, []);

  const acceptDuration = (seconds: number, url: string) => {
    if (sourceRef.current?.file !== file || sourceRef.current.url !== url) return;
    setMediaInfo({ file, duration: seconds, error: null });
    setRange((previous) => {
      if (previous?.file !== file) return { file, start: 0, end: Math.min(seconds, MAX_SECONDS) };
      if (seconds < MIN_SECONDS) return { file, start: 0, end: seconds };
      const endSeconds = clamp(previous.end, MIN_SECONDS, seconds);
      const startSeconds = clamp(previous.start, Math.max(0, endSeconds - MAX_SECONDS), endSeconds - MIN_SECONDS);
      return { file, start: startSeconds, end: endSeconds };
    });
  };

  const readDuration = (audio: HTMLAudioElement) => {
    const activeSource = sourceRef.current;
    if (activeSource?.file !== file || audio.currentSrc !== activeSource.url) return;
    const seconds = audio.duration;
    if (Number.isFinite(seconds) && seconds > 0) {
      nativeDurationRef.current = activeSource.url;
      acceptDuration(seconds, activeSource.url);
      return;
    }

    const isWebM = file.type.split(";")[0].toLowerCase() === "audio/webm" || /\.webm$/i.test(file.name);
    if (!isWebM) {
      setMediaInfo({ file, duration: null, error: "음성 파일의 길이를 확인할 수 없습니다. 다른 형식의 파일을 선택해 주세요." });
      return;
    }
    if (fallbackAttemptRef.current === activeSource.url) return;
    fallbackAttemptRef.current = activeSource.url;
    const sourceUrl = activeSource.url;

    // MediaRecorder WebM files often report Infinity. Decode once to obtain
    // duration; no waveform or duplicate PCM buffer is retained.
    void (async () => {
      let context: AudioContext | null = null;
      try {
        const encoded = await file.arrayBuffer();
        if (sourceRef.current?.url !== sourceUrl) return;
        context = new AudioContext();
        const decoded = await context.decodeAudioData(encoded);
        if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error("invalid_duration");
        acceptDuration(decoded.duration, sourceUrl);
      } catch {
        if (sourceRef.current?.url === sourceUrl && nativeDurationRef.current !== sourceUrl) {
          setMediaInfo({ file, duration: null, error: "음성 파일의 길이를 확인할 수 없습니다. 다른 형식의 파일을 선택해 주세요." });
        }
      } finally {
        if (context) await context.close().catch(() => undefined);
      }
    })();
  };

  const updateStart = (value: number) => {
    if (duration === null || duration < MIN_SECONDS || !Number.isFinite(value)) return;
    finishPreview(true);
    const nextStart = clamp(Math.round(value * 10) / 10, 0, duration - MIN_SECONDS);
    setRange((previous) => {
      const previousEnd = previous?.file === file ? previous.end : Math.min(duration, MAX_SECONDS);
      const nextEnd = clamp(previousEnd, nextStart + MIN_SECONDS, Math.min(duration, nextStart + MAX_SECONDS));
      return { file, start: nextStart, end: nextEnd };
    });
  };

  const updateEnd = (value: number) => {
    if (duration === null || duration < MIN_SECONDS || !Number.isFinite(value)) return;
    finishPreview(true);
    const nextEnd = clamp(Math.round(value * 10) / 10, MIN_SECONDS, duration);
    setRange((previous) => {
      const previousStart = previous?.file === file ? previous.start : 0;
      const nextStart = clamp(previousStart, Math.max(0, nextEnd - MAX_SECONDS), nextEnd - MIN_SECONDS);
      return { file, start: nextStart, end: nextEnd };
    });
  };

  const previewSelection = async () => {
    const audio = audioRef.current;
    if (!audio || !valid) return;
    if (previewActiveRef.current) { finishPreview(true); return; }
    setPreviewError(null);
    audio.currentTime = start;
    previewEndRef.current = end;
    previewActiveRef.current = true;
    setPreviewingFile(file);

    const watchEnd = () => {
      if (!previewActiveRef.current) return;
      const player = audioRef.current;
      if (!player || player.ended || player.currentTime >= previewEndRef.current - 0.015) {
        finishPreview(true);
        return;
      }
      previewFrameRef.current = requestAnimationFrame(watchEnd);
    };

    try {
      await audio.play();
      if (previewActiveRef.current) previewFrameRef.current = requestAnimationFrame(watchEnd);
      else audio.pause();
    } catch {
      finishPreview(true);
      setPreviewError({ file, message: "선택 구간을 재생할 수 없습니다. 원본 재생 상태를 확인해 주세요." });
    }
  };

  const downloadSelection = async () => {
    if (!valid || !downloadFormat || downloadRef.current) return;
    finishPreview(true);
    const controller = new AbortController();
    downloadRef.current = controller;
    const selection = { file, start, end, controller };
    setDownloadState({ ...selection, stage: "loading" });
    try {
      const output = await trimVoiceSampleOriginal(file, start, end, {
        signal: controller.signal,
        onStage: (stage) => {
          if (!controller.signal.aborted) setDownloadState({ ...selection, stage });
        },
      });
      if (controller.signal.aborted || downloadRef.current !== controller) return;
      const url = URL.createObjectURL(output);
      const link = document.createElement("a");
      link.href = url;
      link.download = output.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Allow the browser to start saving before releasing the output buffer.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setDownloadState({ ...selection, stage: "saved" });
    } catch (error) {
      if (!controller.signal.aborted) {
        setDownloadState({ ...selection, stage: "error", message: error instanceof Error
          ? error.message : "선택 구간을 저장하지 못했습니다. 다시 시도해 주세요." });
      }
    } finally {
      if (downloadRef.current === controller) downloadRef.current = null;
    }
  };

  const startPercent = duration ? (start / duration) * 100 : 0;
  const endPercent = duration ? (end / duration) * 100 : 0;
  const playheadPercent = duration ? clamp((currentTime / duration) * 100, 0, 100) : 0;

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div>
        <p className="text-sm font-semibold text-white">보컬 구간 선택</p>
        <p className="mt-1 text-xs text-zinc-400">원본을 탐색한 뒤 코러스 없이 한 사람의 노래가 선명한 6초~2분 구간을 고르세요.</p>
      </div>

      <audio
          ref={audioRef}
          controls
          preload="metadata"
          aria-label="원본 음성 전체 재생 및 탐색"
          className="w-full"
          onLoadedMetadata={(event) => readDuration(event.currentTarget)}
          onDurationChange={(event) => readDuration(event.currentTarget)}
          onError={(event) => {
            if (sourceRef.current?.file === file && event.currentTarget.currentSrc === sourceRef.current.url) {
              setMediaInfo({ file, duration: null, error: "음성 파일을 읽을 수 없습니다. 다른 파일을 선택해 주세요." });
            }
          }}
          onTimeUpdate={(event) => setPlayhead({ file, seconds: event.currentTarget.currentTime })}
          onSeeked={(event) => setPlayhead({ file, seconds: event.currentTarget.currentTime })}
          onPause={() => { if (previewActiveRef.current) finishPreview(false); }}
          onEnded={() => { if (previewActiveRef.current) finishPreview(false); }}
      />

      {metadataError && <p role="alert" className="text-xs text-red-300">{metadataError}</p>}
      {playbackError && <p role="alert" className="text-xs text-red-300">{playbackError}</p>}
      {!metadataError && duration === null && <p role="status" className="text-xs text-zinc-400">음성 파일의 길이를 확인하고 있습니다…</p>}

      {duration !== null && (
        <>
          <div aria-hidden="true">
            <div className="relative h-4 overflow-hidden rounded-full bg-zinc-700">
              <div
                className={`absolute inset-y-0 ${valid ? "bg-fuchsia-500" : "bg-amber-500"}`}
                style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }}
              />
              <div className="absolute inset-y-0 w-0.5 bg-white shadow-sm" style={{ left: `${playheadPercent}%` }} />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px] text-zinc-400">
              <span>0:00.0</span><span>{formatSeconds(duration)}</span>
            </div>
          </div>

          {duration >= MIN_SECONDS ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <label htmlFor={startId} className="flex justify-between gap-2 text-xs text-zinc-300">
                  <span>시작</span><span className="font-mono text-white">{formatSeconds(start)}</span>
                </label>
                <input id={startId} type="range" min={0} max={Math.max(0, duration - MIN_SECONDS)} step="any"
                  value={start} onChange={(event) => updateStart(Number(event.target.value))}
                  className="w-full accent-fuchsia-500" aria-label="보컬 구간 시작 시간" />
                <button type="button" onClick={() => updateStart(audioRef.current?.currentTime ?? 0)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">
                  현재 재생 위치를 시작으로
                </button>
              </div>
              <div className="min-w-0 space-y-2">
                <label htmlFor={endId} className="flex justify-between gap-2 text-xs text-zinc-300">
                  <span>끝</span><span className="font-mono text-white">{formatSeconds(end)}</span>
                </label>
                <input id={endId} type="range" min={MIN_SECONDS} max={duration} step="any"
                  value={end} onChange={(event) => updateEnd(Number(event.target.value))}
                  className="w-full accent-cyan-400" aria-label="보컬 구간 끝 시간" />
                <button type="button" onClick={() => updateEnd(audioRef.current?.currentTime ?? 0)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">
                  현재 재생 위치를 끝으로
                </button>
              </div>
            </div>
          ) : <p role="status" className="text-xs text-amber-300">원본이 6초보다 짧습니다. 더 긴 노래 샘플을 선택해 주세요.</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
            <p aria-live="polite" className="text-xs text-zinc-300">
              선택 {formatSeconds(start)} – {formatSeconds(end)} · {selectedDuration.toFixed(1)}초
              {valid && <span className="ml-2 text-emerald-300">사용 가능</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!valid} onClick={() => void previewSelection()}
                className="rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40">
                {isPreviewing ? "미리듣기 중지" : "선택 구간 미리듣기"}
              </button>
              <button type="button" disabled={!valid || !downloadFormat || downloading}
                onClick={() => void downloadSelection()} aria-busy={downloading}
                className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50">
                <Download size={15} aria-hidden="true" />
                {currentDownload?.stage === "loading" ? "다운로드 준비 중…"
                  : currentDownload?.stage === "trimming" ? "구간 저장 중…" : "선택 구간 다운로드"}
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-300">
            {downloadFormat ? `${downloadFormat.label} 원본 형식으로 저장합니다. 처음 이용할 때는 잠시 준비 시간이 필요합니다.`
              : "이 파일 형식은 구간 다운로드를 지원하지 않습니다. MP3, WAV, M4A, AAC, FLAC, OGG, WebM 파일을 사용해 주세요."}
          </p>
          {currentDownload?.stage === "saved" && <p role="status" className="text-xs text-emerald-300">선택 구간 다운로드를 시작했습니다.</p>}
          {currentDownload?.stage === "error" && <p role="alert" className="text-xs text-red-300">{currentDownload.message}</p>}
        </>
      )}
    </div>
  );
}
