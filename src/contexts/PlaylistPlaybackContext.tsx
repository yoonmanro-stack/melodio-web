"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ListMusic,
  Music4,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { registerActiveAudio } from "@/lib/globalAudio";
import type { LibraryPlaylistTrack } from "@/types/library-playlist";

type RepeatMode = "off" | "all" | "one";

interface PlaylistPlaybackContextValue {
  queuePlaylistId: string | null;
  currentTrackId: string | null;
  isPlaying: boolean;
  playQueue: (
    playlistId: string,
    playlistName: string,
    tracks: LibraryPlaylistTrack[],
    startTrackId?: string,
    shuffled?: boolean,
  ) => void;
  syncQueue: (
    playlistId: string,
    playlistName: string,
    tracks: LibraryPlaylistTrack[],
  ) => void;
  togglePlayback: () => void;
  removeGenerationFromQueue: (generationId: string) => void;
  closePlaylistQueue: (playlistId?: string) => void;
}

const PlaylistPlaybackContext = createContext<PlaylistPlaybackContextValue | null>(null);

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function PlaylistPlaybackProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<LibraryPlaylistTrack[]>([]);
  const currentIndexRef = useRef(-1);
  const repeatModeRef = useRef<RepeatMode>("off");
  const shuffleRef = useRef(false);
  const historyRef = useRef<string[]>([]);
  const lastAudibleVolumeRef = useRef(0.9);
  const endedRef = useRef<() => void>(() => undefined);

  const [queue, setQueue] = useState<LibraryPlaylistTrack[]>([]);
  const [queuePlaylistId, setQueuePlaylistId] = useState<string | null>(null);
  const [queuePlaylistName, setQueuePlaylistName] = useState("");
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] || null : null;

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    shuffleRef.current = isShuffle;
  }, [isShuffle]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.volume = 0.9;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handleDuration = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const handleEnded = () => endedRef.current();

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDuration);
    audio.addEventListener("loadedmetadata", handleDuration);
    audio.addEventListener("ended", handleEnded);
    audioRef.current = audio;

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDuration);
      audio.removeEventListener("loadedmetadata", handleDuration);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const resetQueue = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    queueRef.current = [];
    currentIndexRef.current = -1;
    historyRef.current = [];
    setQueue([]);
    setQueuePlaylistId(null);
    setQueuePlaylistName("");
    setCurrentIndex(-1);
    setCurrentTime(0);
    setDuration(0);
    setIsQueueOpen(false);
  }, []);

  const playAt = useCallback((index: number, recordHistory = true, forcePlay = false) => {
    const audio = audioRef.current;
    const tracks = queueRef.current;
    const track = tracks[index];
    if (!audio || !track) return;

    const previousIndex = currentIndexRef.current;
    if (recordHistory && previousIndex >= 0 && previousIndex !== index) {
      const previousTrackId = tracks[previousIndex]?.generationId;
      if (previousTrackId) historyRef.current.push(previousTrackId);
      if (historyRef.current.length > 100) historyRef.current.shift();
    }

    if (!forcePlay && previousIndex === index && audio.src === track.audioUrl) {
      if (audio.paused) {
        registerActiveAudio(audio, resetQueue);
        void audio.play().catch(() => setIsPlaying(false));
      } else {
        audio.pause();
      }
      return;
    }

    audio.pause();
    setCurrentTime(0);
    setDuration(track.durationSeconds || 0);
    currentIndexRef.current = index;
    setCurrentIndex(index);
    audio.src = track.audioUrl;
    audio.load();
    audio.volume = isMuted ? 0 : volume;
    registerActiveAudio(audio, resetQueue);
    void audio.play().catch(() => setIsPlaying(false));
  }, [isMuted, resetQueue, volume]);

  const playNext = useCallback((manual = false) => {
    const tracks = queueRef.current;
    const current = currentIndexRef.current;
    if (!tracks.length) return;

    if (!manual && repeatModeRef.current === "one" && current >= 0) {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        registerActiveAudio(audio, resetQueue);
        void audio.play().catch(() => setIsPlaying(false));
      }
      return;
    }

    let nextIndex: number;
    if (shuffleRef.current && tracks.length > 1) {
      nextIndex = Math.floor(Math.random() * tracks.length);
      if (nextIndex === current) nextIndex = (nextIndex + 1) % tracks.length;
    } else {
      nextIndex = current < 0 ? 0 : current + 1;
    }

    if (nextIndex >= tracks.length) {
      if (manual || repeatModeRef.current === "all") nextIndex = 0;
      else {
        audioRef.current?.pause();
        setCurrentTime(0);
        return;
      }
    }
    playAt(nextIndex);
  }, [playAt, resetQueue]);

  const playPrevious = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    if (shuffleRef.current && historyRef.current.length > 0) {
      let historyTrackId = historyRef.current.pop();
      while (historyTrackId) {
        const historyIndex = queueRef.current.findIndex((track) => track.generationId === historyTrackId);
        if (historyIndex >= 0) {
          playAt(historyIndex, false);
          return;
        }
        historyTrackId = historyRef.current.pop();
      }
    }

    const tracks = queueRef.current;
    if (!tracks.length) return;
    const current = currentIndexRef.current;
    playAt(current <= 0 ? tracks.length - 1 : current - 1);
  }, [playAt]);

  useEffect(() => {
    endedRef.current = () => playNext(false);
  }, [playNext]);

  const playQueue = useCallback((
    playlistId: string,
    playlistName: string,
    tracks: LibraryPlaylistTrack[],
    startTrackId?: string,
    shuffled = false,
  ) => {
    const playableTracks = tracks.filter((track) => track.isPlayable && /^https?:\/\//i.test(track.audioUrl));
    if (!playableTracks.length) return;

    const requestedIndex = startTrackId
      ? playableTracks.findIndex((track) => track.generationId === startTrackId)
      : -1;
    const startIndex = requestedIndex >= 0
      ? requestedIndex
      : shuffled ? Math.floor(Math.random() * playableTracks.length) : 0;
    queueRef.current = playableTracks;
    setQueue(playableTracks);
    setQueuePlaylistId(playlistId);
    setQueuePlaylistName(playlistName);
    historyRef.current = [];
    setIsShuffle(shuffled);
    shuffleRef.current = shuffled;
    playAt(startIndex, false, true);
  }, [playAt]);

  const syncQueue = useCallback((
    playlistId: string,
    playlistName: string,
    tracks: LibraryPlaylistTrack[],
  ) => {
    if (queuePlaylistId !== playlistId) return;
    const playableTracks = tracks.filter((track) => track.isPlayable && /^https?:\/\//i.test(track.audioUrl));
    const currentId = queueRef.current[currentIndexRef.current]?.generationId;
    const previousIndex = currentIndexRef.current;
    const nextIndex = currentId
      ? playableTracks.findIndex((track) => track.generationId === currentId)
      : -1;
    queueRef.current = playableTracks;
    setQueue(playableTracks);
    setQueuePlaylistName(playlistName);
    historyRef.current = historyRef.current.filter((trackId) =>
      playableTracks.some((track) => track.generationId === trackId),
    );
    if (nextIndex >= 0) {
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
    } else if (currentId) {
      if (playableTracks.length > 0) {
        const replacementIndex = Math.min(Math.max(previousIndex, 0), playableTracks.length - 1);
        playAt(replacementIndex, false, true);
      } else {
        resetQueue();
      }
    } else {
      resetQueue();
    }
  }, [playAt, queuePlaylistId, resetQueue]);

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || currentIndexRef.current < 0) return;
    if (audio.paused) {
      registerActiveAudio(audio, resetQueue);
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [resetQueue]);

  const removeGenerationFromQueue = useCallback((generationId: string) => {
    const previousTracks = queueRef.current;
    const filteredTracks = previousTracks.filter((track) => track.generationId !== generationId);
    if (filteredTracks.length === previousTracks.length) return;

    const previousIndex = currentIndexRef.current;
    const currentId = previousTracks[previousIndex]?.generationId;
    queueRef.current = filteredTracks;
    setQueue(filteredTracks);
    historyRef.current = historyRef.current.filter((trackId) => trackId !== generationId);

    if (!filteredTracks.length) {
      resetQueue();
      return;
    }

    if (currentId === generationId) {
      const replacementIndex = Math.min(Math.max(previousIndex, 0), filteredTracks.length - 1);
      playAt(replacementIndex, false, true);
      return;
    }

    const nextCurrentIndex = filteredTracks.findIndex((track) => track.generationId === currentId);
    if (nextCurrentIndex < 0) {
      resetQueue();
      return;
    }
    currentIndexRef.current = nextCurrentIndex;
    setCurrentIndex(nextCurrentIndex);
  }, [playAt, resetQueue]);

  const closePlaylistQueue = useCallback((playlistId?: string) => {
    if (playlistId && queuePlaylistId !== playlistId) return;
    resetQueue();
  }, [queuePlaylistId, resetQueue]);

  const cycleRepeatMode = () => {
    setRepeatMode((current) => current === "off" ? "all" : current === "all" ? "one" : "off");
  };

  const contextValue = useMemo<PlaylistPlaybackContextValue>(() => ({
    queuePlaylistId,
    currentTrackId: currentTrack?.generationId || null,
    isPlaying,
    playQueue,
    syncQueue,
    togglePlayback,
    removeGenerationFromQueue,
    closePlaylistQueue,
  }), [
    closePlaylistQueue,
    currentTrack?.generationId,
    isPlaying,
    playQueue,
    queuePlaylistId,
    removeGenerationFromQueue,
    syncQueue,
    togglePlayback,
  ]);

  return (
    <PlaylistPlaybackContext.Provider value={contextValue}>
      {children}

      {currentTrack ? (
        <>
          {isQueueOpen ? (
            <div className="fixed inset-0 z-[109] bg-black/55 backdrop-blur-sm" onClick={() => setIsQueueOpen(false)}>
              <aside
                className="absolute bottom-0 right-0 max-h-[72vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-[#101116] p-4 shadow-2xl sm:bottom-24 sm:right-4 sm:w-[390px] sm:rounded-3xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300">재생 대기열</p>
                    <h3 className="mt-1 font-semibold text-white">{queuePlaylistName}</h3>
                  </div>
                  <button onClick={() => setIsQueueOpen(false)} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="재생 대기열 닫기">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {queue.map((track, index) => (
                    <button
                      key={track.itemId}
                      onClick={() => playAt(index)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${index === currentIndex ? "bg-fuchsia-500/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`}
                    >
                      <span className="w-5 text-center text-[10px] font-mono">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{track.title}</span>
                      {index === currentIndex && isPlaying ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400" /> : null}
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          ) : null}

          <div className="fixed bottom-0 left-0 right-0 z-[108] border-t border-white/10 bg-[#0c0d12]/95 px-3 py-2.5 shadow-[0_-12px_34px_rgba(0,0,0,0.72)] backdrop-blur-2xl md:px-7 md:py-3">
            <div className="mx-auto flex max-w-7xl items-center gap-3 md:gap-6">
              <div className="flex min-w-0 flex-1 items-center gap-3 md:max-w-[320px]">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-fuchsia-900/60 to-cyan-900/60 md:h-12 md:w-12">
                  {currentTrack.coverArtUrl ? <img src={currentTrack.coverArtUrl} alt="" className="h-full w-full object-cover" /> : <Music4 className="h-5 w-5 text-white/70" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white md:text-sm">{currentTrack.title}</p>
                  <p className="mt-0.5 truncate text-[9px] text-zinc-500 md:text-[10px]">{queuePlaylistName} · {currentIndex + 1}/{queue.length}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 md:flex-1 md:justify-center md:gap-4">
                <button onClick={playPrevious} className="rounded-lg p-1.5 text-zinc-400 hover:text-white" aria-label="이전 곡">
                  <SkipBack className="h-4 w-4" />
                </button>
                <button onClick={togglePlayback} className="grid h-9 w-9 place-items-center rounded-full bg-white text-black transition hover:scale-105" aria-label={isPlaying ? "일시정지" : "재생"}>
                  {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                </button>
                <button onClick={() => playNext(true)} className="rounded-lg p-1.5 text-zinc-400 hover:text-white" aria-label="다음 곡">
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>

              <div className="hidden flex-1 items-center justify-end gap-2 md:flex">
                <button onClick={() => setIsShuffle((value) => !value)} className={`rounded-lg p-2 ${isShuffle ? "bg-fuchsia-500/10 text-fuchsia-300" : "text-zinc-500 hover:text-white"}`} title="셔플">
                  <Shuffle className="h-4 w-4" />
                </button>
                <button onClick={cycleRepeatMode} className={`relative rounded-lg p-2 ${repeatMode !== "off" ? "bg-cyan-500/10 text-cyan-300" : "text-zinc-500 hover:text-white"}`} title={`반복: ${repeatMode}`}>
                  <Repeat className="h-4 w-4" />
                  {repeatMode === "one" ? <span className="absolute text-[8px] font-black">1</span> : null}
                </button>
                <button onClick={() => setIsQueueOpen(true)} className="rounded-lg p-2 text-zinc-500 hover:text-white" title="재생 대기열">
                  <ListMusic className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      if (isMuted) {
                        const restoredVolume = lastAudibleVolumeRef.current || 0.9;
                        setVolume(restoredVolume);
                        setIsMuted(false);
                        audio.volume = restoredVolume;
                      } else {
                        if (volume > 0) lastAudibleVolumeRef.current = volume;
                        setIsMuted(true);
                        audio.volume = 0;
                      }
                    }}
                    className="p-1.5 text-zinc-500 hover:text-white"
                    aria-label={isMuted ? "음소거 해제" : "음소거"}
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(event) => {
                      const nextVolume = Number(event.target.value);
                      if (nextVolume > 0) {
                        lastAudibleVolumeRef.current = nextVolume;
                        setVolume(nextVolume);
                        setIsMuted(false);
                      } else {
                        setIsMuted(true);
                      }
                      if (audioRef.current) audioRef.current.volume = nextVolume;
                    }}
                    className="h-1 w-16 accent-white"
                    aria-label="볼륨"
                  />
                </div>
              </div>

              <button onClick={() => setIsQueueOpen(true)} className="rounded-lg p-1.5 text-zinc-500 hover:text-white md:hidden" aria-label="재생 대기열">
                <ListMusic className="h-4 w-4" />
              </button>
              <button onClick={() => closePlaylistQueue()} className="rounded-lg p-1.5 text-zinc-500 hover:text-white" aria-label="플레이어 닫기">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mx-auto mt-2 flex max-w-3xl items-center gap-2">
              <span className="w-8 text-right text-[9px] font-mono text-zinc-500">{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={Math.min(currentTime, duration || 100)}
                onChange={(event) => {
                  const nextTime = Number(event.target.value);
                  if (audioRef.current) audioRef.current.currentTime = nextTime;
                  setCurrentTime(nextTime);
                }}
                className="h-1 min-w-0 flex-1 accent-fuchsia-400"
                aria-label="재생 위치"
              />
              <span className="w-8 text-[9px] font-mono text-zinc-500">{formatTime(duration)}</span>
            </div>
          </div>
        </>
      ) : null}
    </PlaylistPlaybackContext.Provider>
  );
}

export function usePlaylistPlayback(): PlaylistPlaybackContextValue {
  const context = useContext(PlaylistPlaybackContext);
  if (!context) {
    throw new Error("usePlaylistPlayback must be used inside PlaylistPlaybackProvider");
  }
  return context;
}
