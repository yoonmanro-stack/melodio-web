'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Pause, Play, Volume2, X } from 'lucide-react'
import type { Preset } from '@/types'
import type { PresetSample, PresetSampleResponse } from '@/lib/preset-samples'
import { resolvePresetApplication } from '@/lib/preset-application'
import { registerActiveAudio } from '@/lib/globalAudio'
import { getAudioPlaybackError } from '@/lib/audio-playback'
import styles from '@/components/voice/VoicePlaybackRange.module.css'
import { voicePlaybackTrackStyle } from '@/components/voice/voice-playback-style'

function clock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

type CurrentSample = { presetId: string; presetName: string; sample: PresetSample }

/** One lookup for the visible cards; one full-song player for the entire grid. */
export function usePresetSamples(sourceMenu: 'japan' | 'preset-studio', presets: Preset[]) {
  const requestKey = JSON.stringify(presets.map(preset => ({ id: preset.id, isInstrumental: resolvePresetApplication(preset).isInstrumental })))
  const [lookup, setLookup] = useState<{ key: string; response: PresetSampleResponse | null; failed: boolean }>({ key: '', response: null, failed: false })
  const [current, setCurrent] = useState<CurrentSample | null>(null)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [playbackError, setPlaybackError] = useState('')
  const audio = useRef<HTMLAudioElement>(null)
  const active = useRef<CurrentSample | null>(null)
  const attempt = useRef(0)

  useEffect(() => {
    if (requestKey === '[]') return
    let cancelled = false
    let controller: AbortController | null = null
    let running = false
    async function refresh() {
      if (running || document.visibilityState === 'hidden') return
      running = true
      controller = new AbortController()
      try {
        const query = new URLSearchParams({ sourceMenu, presets: requestKey })
        const response = await fetch(`/api/presets/samples?${query}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw Error('lookup_failed')
        const result: PresetSampleResponse = await response.json()
        if (!result.samples || !result.errors || typeof result.samples !== 'object' || typeof result.errors !== 'object') throw Error('lookup_shape')
        if (!cancelled) setLookup({ key: requestKey, response: result, failed: false })
      } catch {
        if (!cancelled) setLookup({ key: requestKey, response: null, failed: true })
      } finally { running = false }
    }
    void refresh()
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    const interval = window.setInterval(onFocus, 60_000)
    return () => { cancelled = true; controller?.abort(); window.clearInterval(interval); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [requestKey, sourceMenu])

  const close = useCallback(() => {
    attempt.current += 1
    audio.current?.pause()
    audio.current?.removeAttribute('src')
    active.current = null
    setCurrent(null); setPlaying(false); setBuffering(false); setPlaybackError('')
  }, [])

  useEffect(() => {
    const element = audio.current
    function onOtherAudio(event: Event) {
      const other = (event as CustomEvent<{ audio?: HTMLMediaElement }>).detail?.audio
      if (other && other !== element) close()
    }
    window.addEventListener('melodio-audio-started', onOtherAudio)
    return () => { attempt.current += 1; element?.pause(); window.removeEventListener('melodio-audio-started', onOtherAudio) }
  }, [close])

  function sampleFor(id: string) { return lookup.key === requestKey ? lookup.response?.samples[id] ?? null : null }
  function statusFor(id: string): 'ready' | 'loading' | 'missing' | 'error' {
    if (lookup.key !== requestKey) return 'loading'
    if (lookup.failed || lookup.response?.errors[id]) return 'error'
    return sampleFor(id) ? 'ready' : 'missing'
  }
  async function resume() {
    const element = audio.current
    const selected = active.current
    if (!element || !selected) return
    const version = ++attempt.current
    if (element.ended) element.currentTime = 0
    setPlaybackError(''); setBuffering(true)
    registerActiveAudio(element, () => { setPlaying(false); setBuffering(false) })
    try {
      await element.play()
      if (attempt.current === version && active.current?.sample.id === selected.sample.id && !element.paused) { setPlaying(true); setBuffering(false) }
    } catch (error) {
      if (attempt.current !== version) return
      setBuffering(false); setPlaying(false)
      setPlaybackError(getAudioPlaybackError(selected.sample.audioUrl, error as { name?: string }) || '재생 버튼을 다시 눌러 주세요.')
    }
  }
  function toggle(preset: Preset) {
    const sample = sampleFor(preset.id)
    const element = audio.current
    if (!sample || !element) return
    if (active.current?.sample.id === sample.id && active.current.presetId === preset.id) {
      if (!element.paused) { attempt.current += 1; element.pause(); setBuffering(false) }
      else void resume()
      return
    }
    attempt.current += 1
    element.pause()
    const selected = { presetId: preset.id, presetName: preset.name, sample }
    active.current = selected
    setCurrent(selected); setPosition(0); setDuration(sample.duration || 0); setPlaying(false)
    element.src = sample.audioUrl
    element.volume = volume
    element.load()
    void resume()
  }
  function toggleCurrent() {
    if (!audio.current?.paused) { attempt.current += 1; audio.current?.pause(); setBuffering(false) }
    else void resume()
  }
  function seek(value: number) {
    if (!audio.current || !Number.isFinite(audio.current.duration)) return
    audio.current.currentTime = value
    setPosition(value)
  }
  return { audio, current, playing, buffering, position, duration, volume, playbackError, sampleFor, statusFor, toggle, toggleCurrent, close, seek,
    setPlaying, setBuffering, setPosition, setDuration, setPlaybackError,
    changeVolume(value: number) { setVolume(value); if (audio.current) audio.current.volume = value },
  }
}

type Controller = ReturnType<typeof usePresetSamples>

export function PresetSampleButton({ preset, controller }: { preset: Preset; controller: Controller }) {
  const status = controller.statusFor(preset.id)
  const selected = controller.current?.presetId === preset.id && controller.current.sample.id === controller.sampleFor(preset.id)?.id
  const label = status === 'loading' ? '샘플 확인 중' : status === 'error' ? '샘플 연결 확인 필요' : status === 'missing' ? '샘플 준비 중' : selected && controller.playing ? '샘플 일시 정지' : '샘플 듣기'
  if (status !== 'ready') return <span className="pointer-events-none absolute bottom-2 left-2 z-20 rounded-md bg-black/70 px-2 py-1 text-[10px] text-zinc-300" aria-live="polite">{label}</span>
  return <button type="button" aria-label={`${preset.name} ${label}`} aria-pressed={selected && controller.playing} title="이 프리셋으로 만든 최신 공개곡 전체 듣기" onClick={event => { event.stopPropagation(); controller.toggle(preset) }} className={`absolute left-1/2 top-1/2 z-20 flex min-h-11 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-white/30 bg-zinc-950/80 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition-opacity focus-visible:outline-2 focus-visible:outline-white [@media(hover:none)]:opacity-100 ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
    {selected && controller.buffering ? <Loader2 size={18} className="animate-spin" /> : selected && controller.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
    {label}
  </button>
}

export function PresetSamplePlayer({ controller }: { controller: Controller }) {
  const { current, audio } = controller
  return <>
    <audio data-preset-sample ref={audio} preload="none" onLoadedMetadata={event => {
      const seconds = event.currentTarget.duration
      if (Number.isFinite(seconds)) controller.setDuration(seconds)
    }} onTimeUpdate={event => controller.setPosition(event.currentTarget.currentTime)} onPause={() => { controller.setPlaying(false); controller.setBuffering(false) }} onPlaying={() => { controller.setPlaying(true); controller.setBuffering(false) }} onWaiting={() => controller.setBuffering(true)} onEnded={() => { controller.setPlaying(false); controller.setBuffering(false) }} onError={() => { if (current) { controller.setPlaying(false); controller.setBuffering(false); controller.setPlaybackError('음원을 불러오지 못했습니다. 재생 버튼을 다시 눌러 주세요.') } }} />
    {current && createPortal(<div role="region" aria-label="프리셋 샘플 플레이어" className="fixed inset-x-0 bottom-0 z-[120] border-t border-white/15 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] text-zinc-200 shadow-[0_-6px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      {controller.playbackError && <p role="alert" className="absolute bottom-full left-0 right-0 border-b border-white/10 bg-zinc-900 px-4 py-2 text-xs text-zinc-200">{controller.playbackError}</p>}
      <div className="mx-auto flex h-[58px] max-w-6xl items-center gap-2 px-3 sm:gap-3">
        <button type="button" aria-label={controller.playing ? '샘플 일시 정지' : '샘플 재생'} onClick={controller.toggleCurrent} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">{controller.buffering ? <Loader2 size={18} className="animate-spin" /> : controller.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
        <div className="w-24 min-w-0 shrink-0 sm:w-48" title={`${current.presetName} · ${current.sample.title}`}><p className="truncate text-xs font-semibold">{current.presetName}</p><p className="truncate text-[10px] text-zinc-400">{current.sample.isInstrumental ? '연주곡' : '보컬곡'} · {current.sample.title}</p></div>
        <span className="hidden font-mono text-[11px] tabular-nums sm:block">{clock(controller.position)}</span>
        <input aria-label="샘플 재생 위치" aria-valuetext={`${clock(controller.position)} / ${clock(controller.duration)}`} type="range" min={0} max={controller.duration || 1} step={0.1} value={Math.min(controller.position, controller.duration || 1)} disabled={!controller.duration} onChange={event => controller.seek(Number(event.target.value))} style={voicePlaybackTrackStyle(controller.position, controller.duration)} className={`${styles.track} min-w-8 flex-1`} />
        <span className="font-mono text-[11px] tabular-nums text-zinc-400">{clock(controller.duration)}</span>
        <details className="relative hidden shrink-0 sm:block"><summary aria-label="샘플 음량" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full hover:bg-white/10 [&::-webkit-details-marker]:hidden"><Volume2 size={17} /></summary><label className="absolute bottom-12 right-0 w-36 rounded-lg border border-white/15 bg-zinc-900 p-3 text-xs">음량<input aria-label="샘플 음량 조절" type="range" min={0} max={1} step={0.01} value={controller.volume} onChange={event => controller.changeVolume(Number(event.target.value))} className="mt-2 w-full accent-zinc-200" /></label></details>
        <button type="button" aria-label="샘플 플레이어 닫기" onClick={controller.close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"><X size={18} /></button>
      </div>
    </div>, document.body)}
  </>
}
