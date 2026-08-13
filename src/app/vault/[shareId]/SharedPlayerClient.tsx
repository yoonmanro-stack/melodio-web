'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Sparkles, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface SharedPlayerClientProps {
  generation: {
    id: string;
    title: string;
    audio_url: string;
    cover_art_url?: string;
    prompt?: string;
    style_tags?: string;
    lyrics?: string;
    created_at?: string;
  };
}

export default function SharedPlayerClient({ generation }: SharedPlayerClientProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const rawCover = generation.cover_art_url;
  const coverUrl = (rawCover && !rawCover.includes('unsplash.com'))
    ? rawCover
    : 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png';
  const audioUrl = generation.audio_url;

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setCurrentTime(audio.currentTime);
      }
    };
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    // Set initial volume
    audio.volume = volume;

    return () => {
      audio.pause();
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => console.warn('Playback failed:', err));
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current || !duration) return;
    const newProgress = Number(e.target.value);
    const newTime = (newProgress / 100) * duration;
    audioRef.current.currentTime = newTime;
    setProgress(newProgress);
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = Number(e.target.value);
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    audioRef.current.muted = nextMute;
  };

  const seek = (seconds: number) => {
    if (!audioRef.current) return;
    let newTime = audioRef.current.currentTime + seconds;
    if (newTime < 0) newTime = 0;
    if (newTime > duration) newTime = duration;
    audioRef.current.currentTime = newTime;
  };

  const formatTime = (time: number) => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center bg-[#07070a] px-4 overflow-y-auto py-12">
      {/* 1. Blurred full screen background */}
      <div 
        className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-30 blur-[60px] scale-110"
        style={{ backgroundImage: `url(${coverUrl})` }}
      />
      
      {/* 2. Glassmorphic player card wrapper */}
      <div className="relative z-10 w-full max-w-[420px] flex flex-col items-center">
        
        {/* Logo at top */}
        <div className="flex flex-col items-center gap-1.5 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/10">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-black tracking-widest text-white font-mono bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-500">
              MELODIO
            </span>
          </div>
          <span className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-[0.25em] font-mono">
            AI GENERATED MUSIC
          </span>
        </div>

        {/* The Card */}
        <div className="w-full bg-white/[0.02] border border-white/[0.08] backdrop-blur-3xl rounded-[32px] p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)] flex flex-col items-center">
          
          {/* Cover Art Frame */}
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden shadow-2xl group">
            <img 
              src={coverUrl} 
              alt={generation.title} 
              className="w-full h-full object-cover select-none transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
          </div>

          {/* Track metadata */}
          <div className="w-full mt-6 text-left px-1">
            <h1 className="text-xl font-bold text-white line-clamp-1 leading-tight tracking-tight">
              {generation.title || 'Untitled Track'}
            </h1>
            <p className="text-sm text-zinc-400 font-semibold mt-1">
              Melodio Creator
            </p>
          </div>

          {/* Progress Bar & Timer */}
          <div className="w-full mt-6 px-1 space-y-2">
            <input 
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={handleSliderChange}
              className="w-full h-1 bg-white/10 hover:bg-white/20 rounded-lg appearance-none cursor-pointer accent-fuchsia-500 outline-none transition-colors"
              style={{
                background: `linear-gradient(to right, #d946ef 0%, #d946ef ${progress}%, rgba(255, 255, 255, 0.1) ${progress}%, rgba(255, 255, 255, 0.1) 100%)`
              }}
            />
            <div className="flex justify-between text-[11px] text-zinc-500 font-mono font-bold">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-between w-full mt-6 px-4">
            {/* Rewind -10s */}
            <button 
              onClick={() => seek(-10)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
              title="10초 뒤로"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            {/* Play/Pause Button */}
            <button 
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-white hover:bg-zinc-100 text-black flex items-center justify-center shadow-xl shadow-white/5 active:scale-95 hover:scale-105 transition-all"
              title={isPlaying ? "일시정지" : "재생"}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current translate-x-0.5" />
              )}
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleMute}
                className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 active:scale-95 transition-all"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input 
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white outline-none"
              />
            </div>
          </div>
        </div>

        {/* 3. Call to Action below card */}
        <Link 
          href="/"
          className="mt-8 flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white text-xs font-bold border border-fuchsia-400/20 shadow-lg shadow-fuchsia-500/10 hover:shadow-fuchsia-500/20 hover:scale-102 active:scale-98 transition-all cursor-pointer"
        >
          <span>멜로디오에서 나만의 AI 음악 만들기</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>

        {/* Copyright */}
        <p className="text-[10px] text-zinc-600 font-mono mt-12 font-bold tracking-wider">
          © 2026 MELODIO. ALL RIGHTS RESERVED.
        </p>
      </div>
    </div>
  );
}
