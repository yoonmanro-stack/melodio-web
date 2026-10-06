'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Download, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import styles from './VoicePlaybackRange.module.css'
import { voicePlaybackTrackStyle } from './voice-playback-style'
import { registerActiveAudio } from '@/lib/globalAudio'

function clock(seconds: number) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function VoicePreviewPlayer({ src, limitSeconds, audioRef, onError, className = '' }: {
  src: string
  limitSeconds?: number
  audioRef?: RefObject<HTMLAudioElement | null>
  onError?: () => void
  className?: string
}) {
  const localRef = useRef<HTMLAudioElement>(null)
  const player = audioRef ?? localRef
  const mounted = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(limitSeconds || 0)
  const [volume, setVolume] = useState(1)
  const [rate, setRate] = useState(1)
  const [error, setError] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    mounted.current = true
    const element = player.current
    return () => { mounted.current = false; element?.pause() }
  }, [player])

  function failed() {
    if (!mounted.current) return
    setLoading(false); setPlaying(false); setError(true); onError?.()
  }
  async function toggle() {
    const element = player.current
    if (!element) return
    if (!element.paused) { element.pause(); return }
    setError(false)
    if (duration > 0 && element.currentTime >= duration) element.currentTime = 0
    setLoading(true)
    try { await element.play() } catch { failed() }
  }
  function seek(seconds: number) {
    const element = player.current
    if (!element || !duration || !ready) return
    element.currentTime = seconds
    setPosition(seconds)
    if (seconds >= duration) element.pause()
  }

  return <div className={className}>
    <div className="flex h-[58px] items-center gap-2 rounded-xl border border-white/15 bg-zinc-900 px-3 text-zinc-100" aria-label="가창 샘플 플레이어">
      <button type="button" aria-label={playing ? '샘플 일시 정지' : '샘플 재생'} onClick={() => void toggle()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-zinc-200">
        {loading ? <Loader2 size={17} className="animate-spin" /> : playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
      </button>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-200">{clock(position)}</span>
      <input aria-label="샘플 재생 위치" aria-valuetext={`${clock(position)} / ${clock(duration)}`} type="range" min={0} max={duration || 1} step={0.1} value={Math.min(position, duration || 1)} disabled={!ready || !duration || error} onChange={event => seek(Number(event.target.value))} style={voicePlaybackTrackStyle(position, duration)} className={`${styles.track} min-w-8 flex-1`} />
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">{clock(duration)}</span>
      <details className="relative shrink-0">
        <summary aria-label="샘플 재생 설정" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 [&::-webkit-details-marker]:hidden">{volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</summary>
        <div className="absolute bottom-10 right-0 z-10 w-44 space-y-3 rounded-xl border border-white/15 bg-zinc-900 p-3 text-xs shadow-xl">
          <label className="block">음량 <input aria-label="샘플 음량" type="range" min={0} max={1} step={0.01} value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); if (player.current) player.current.volume = value }} className="mt-1 w-full accent-zinc-200" /></label>
          <label className="flex items-center justify-between gap-2">재생 속도 <select aria-label="샘플 재생 속도" value={rate} onChange={event => { const value = Number(event.target.value); setRate(value); if (player.current) player.current.playbackRate = value }} className="rounded bg-zinc-800 px-2 py-1">{[0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
          <a href={src} download className="flex items-center gap-2 text-zinc-300 hover:text-white"><Download size={14} />샘플 다운로드</a>
        </div>
      </details>
    </div>
    {error && !onError && <p role="alert" className="mt-2 text-xs text-rose-300">샘플을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.</p>}
    <audio data-voice-preview ref={player} src={src} preload="none" onLoadedMetadata={event => {
      const seconds = event.currentTarget.duration
      if (Number.isFinite(seconds)) { setDuration(limitSeconds ? Math.min(seconds, limitSeconds) : seconds); setReady(true) }
    }} onPlay={event => {
      registerActiveAudio(event.currentTarget)
      document.querySelectorAll<HTMLAudioElement>('audio[data-voice-preview]').forEach(other => { if (other !== event.currentTarget) other.pause() })
      setPlaying(true)
    }} onPlaying={() => setLoading(false)} onWaiting={() => setLoading(true)} onPause={() => { setPlaying(false); setLoading(false) }} onEnded={() => { setPlaying(false); setLoading(false) }} onTimeUpdate={event => {
      const current = event.currentTarget.currentTime
      setPosition(duration ? Math.min(current, duration) : current)
      if (limitSeconds && current >= limitSeconds) event.currentTarget.pause()
    }} onSeeked={event => setPosition(duration ? Math.min(event.currentTarget.currentTime, duration) : event.currentTarget.currentTime)} onError={failed} />
  </div>
}
