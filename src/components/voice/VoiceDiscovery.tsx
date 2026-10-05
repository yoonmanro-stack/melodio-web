'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Pause, Play, Volume2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DISCOVERY_VOICES, discoveryVoiceItem } from '@/data/discoveryVoices'
import { useVoice } from '@/contexts/VoiceContext'
import { DISCOVERY_PREVIEW_SECONDS, discoveryPreviewPosition, discoveryPreviewWindow } from '@/lib/voice/discovery-preview'

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'ko', label: '한국어' },
  { id: 'ja', label: '日本語' },
  { id: 'fr', label: 'Français' },
] as const

const STUDIOS = [
  { href: '/style-library', label: '뮤직 스튜디오' },
  { href: '/audio', label: '프리셋 스튜디오' },
  { href: '/japan', label: '일본 BGM 스튜디오' },
] as const

function waitForMetadata(audio: HTMLAudioElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer)
      audio.removeEventListener('loadedmetadata', loaded)
      audio.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    const loaded = () => { cleanup(); resolve() }
    const failed = () => { cleanup(); reject(new Error('샘플을 불러오지 못했습니다. 다시 재생해 주세요.')) }
    const aborted = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = window.setTimeout(failed, 15_000)
    audio.addEventListener('loadedmetadata', loaded, { once: true })
    audio.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
    else if (audio.readyState >= 1) loaded()
  })
}

function timeLabel(seconds: number) {
  return `0:${Math.floor(discoveryPreviewPosition(seconds)).toString().padStart(2, '0')}`
}

/** Independent discovery catalog; favorites use the shared studio selection context. */
export function VoiceDiscovery() {
  const router = useRouter()
  const { voices, saveDiscoveryVoice, toggleFavorite, setStudioGender, setActiveVoice } = useVoice()
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState('all')
  const [gender, setGender] = useState('all')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const frameRef = useRef<number | null>(null)
  const boundsRef = useRef<{ start: number; end: number } | null>(null)
  const savedById = new Map(voices.filter(voice => voice.discoveryVoiceId).map(voice => [voice.discoveryVoiceId, voice]))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const choices = DISCOVERY_VOICES.filter(voice =>
    (language === 'all' || voice.language === language)
    && (gender === 'all' || voice.gender === gender)
    && (!favoritesOnly || savedById.get(voice.discoveryVoiceId)?.isFavorite)
    && `${voice.name} ${voice.desc || ''} ${voice.tags.join(' ')}`.toLocaleLowerCase().includes(normalizedQuery))
  const current = DISCOVERY_VOICES.find(voice => voice.discoveryVoiceId === currentId)
  const readyCount = DISCOVERY_VOICES.filter(voice => voice.previewStatus === 'ready' && voice.audioUrl).length
  const referenceReadyCount = DISCOVERY_VOICES.filter(voice => voice.previewStatus === 'ready' && voice.audioUrl && voice.reuseStatus === 'ready').length

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      requestRef.current?.abort()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()
    }
  }, [])

  function pausePreview() {
    audioRef.current?.pause()
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    setPlaying(false)
  }

  function watchEnd() {
    const audio = audioRef.current
    const bounds = boundsRef.current
    if (!audio || !bounds || audio.paused) return
    if (audio.currentTime >= bounds.end) {
      pausePreview()
      setElapsed(DISCOVERY_PREVIEW_SECONDS)
      return
    }
    frameRef.current = requestAnimationFrame(watchEnd)
  }

  async function preview(id: string) {
    const voice = DISCOVERY_VOICES.find(item => item.discoveryVoiceId === id)
    const audio = audioRef.current
    if (!voice || voice.previewStatus !== 'ready' || !voice.audioUrl || !audio) return
    if (currentId === id && playing) { pausePreview(); return }
    const resume = currentId === id && boundsRef.current !== null
    requestRef.current?.abort()
    const request = new AbortController()
    requestRef.current = request
    pausePreview()
    setCurrentId(id)
    setError('')
    setLoading(true)
    try {
      if (!resume) {
        boundsRef.current = null
        setElapsed(0)
        audio.src = voice.audioUrl
        audio.load()
        await waitForMetadata(audio, request.signal)
        if (request.signal.aborted) return
        const bounds = discoveryPreviewWindow(audio.duration, voice.previewStartSeconds || 0)
        if (!bounds) throw new Error('30초 가창 구간을 확인하지 못했습니다. 샘플을 확인 중입니다.')
        boundsRef.current = bounds
        audio.currentTime = bounds.start
      }
      const bounds = boundsRef.current
      if (!bounds || request.signal.aborted) return
      if (audio.currentTime >= bounds.end || audio.currentTime < bounds.start) audio.currentTime = bounds.start
      audio.playbackRate = 1
      audio.volume = volume
      document.querySelectorAll<HTMLAudioElement>('audio[data-voice-preview]').forEach(other => { if (other !== audio) other.pause() })
      await audio.play()
      if (request.signal.aborted || audio.paused) return
      setPlaying(true)
      watchEnd()
    } catch (reason) {
      if (request.signal.aborted) return
      pausePreview()
      boundsRef.current = null
      setError(reason instanceof Error ? reason.message : '샘플을 재생하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      if (!request.signal.aborted) setLoading(false)
    }
  }

  function toggleSaved(id: string) {
    const saved = savedById.get(id)
    if (saved) toggleFavorite(saved.id)
    else if (!saveDiscoveryVoice(id)) { setNotice('음색을 저장하지 못했습니다. 다시 시도해 주세요.'); return }
    const ready = discoveryVoiceItem(id)?.reuseStatus === 'ready'
    setNotice(saved?.isFavorite ? '즐겨찾기를 해제했습니다.' : ready
      ? '즐겨찾기에 저장했습니다. 세 스튜디오에서 사용할 수 있습니다.'
      : '즐겨찾기에 저장했습니다. 작곡 연결을 준비하고 있습니다.')
  }

  function apply(id: string, href: (typeof STUDIOS)[number]['href']) {
    const catalogVoice = discoveryVoiceItem(id)
    if (!catalogVoice || catalogVoice.previewStatus !== 'ready' || catalogVoice.reuseStatus !== 'ready' || !catalogVoice.audioUrl) return
    const saved = savedById.get(id) || saveDiscoveryVoice(id)
    if (!saved || (saved.gender !== 'female' && saved.gender !== 'male')) return
    requestRef.current?.abort()
    pausePreview()
    setStudioGender(saved.gender)
    setActiveVoice(saved)
    router.push(href)
  }

  function seek(value: number) {
    const position = discoveryPreviewPosition(value)
    if (!audioRef.current || !boundsRef.current) return
    audioRef.current.currentTime = boundsRef.current.start + position
    setElapsed(position)
    if (position === DISCOVERY_PREVIEW_SECONDS) pausePreview()
  }

  return <section aria-labelledby="discovery-title" className={`space-y-5 ${current ? 'pb-28' : ''}`}>
    <header className="rounded-2xl border border-cyan-400/20 bg-cyan-950/15 p-5 sm:p-6">
      <p className="text-xs font-semibold tracking-wide text-cyan-300">EXPLORE</p>
      <h2 id="discovery-title" className="mt-2 text-2xl font-bold text-white">새로운 음색을 발견하세요</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">30초 가창 샘플을 듣고 마음에 드는 음색을 저장하세요. 즐겨찾기한 음색은 작곡 연결이 준비되면 세 스튜디오에서 사용할 수 있습니다.</p>
      <p className="mt-3 text-xs text-zinc-400">{DISCOVERY_VOICES.length}개 음색 · 가창 샘플 {readyCount}개 준비 · 작곡 참조 {referenceReadyCount}개 준비</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">설계 검증은 음색 설명의 검토를 뜻합니다. 샘플 생성과 작곡 참조 준비는 청음 품질 검증과 별개입니다.</p>
    </header>

    <div className="space-y-3 rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
      <label className="block text-xs font-semibold text-zinc-300">음색 검색
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름, 음색 특징, 장르" className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400 focus:outline-none" />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs text-zinc-300">샘플 언어
          <select value={language} onChange={event => setLanguage(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-2.5 text-sm text-white"><option value="all">모든 언어</option>{LANGUAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        </label>
        <label className="text-xs text-zinc-300">보컬
          <select value={gender} onChange={event => setGender(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-2.5 text-sm text-white"><option value="all">남녀 전체</option><option value="female">여성</option><option value="male">남성</option></select>
        </label>
        <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm text-zinc-300 sm:col-span-1"><input type="checkbox" checked={favoritesOnly} onChange={event => setFavoritesOnly(event.target.checked)} className="h-4 w-4 accent-cyan-400" />즐겨찾기만</label>
      </div>
    </div>

    <p role="status" className="text-sm text-zinc-400">{notice || `${choices.length}개 음색을 살펴보세요.`}</p>
    {choices.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-zinc-400">조건에 맞는 음색이 없습니다. 검색어나 필터를 바꿔보세요.</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {choices.map(voice => {
        const id = voice.discoveryVoiceId
        const favorite = !!savedById.get(id)?.isFavorite
        const isCurrent = currentId === id
        const ready = voice.previewStatus === 'ready' && !!voice.audioUrl
        return <article key={id} className={`flex flex-col rounded-2xl border p-5 ${isCurrent ? 'border-cyan-400/50 bg-cyan-950/15' : 'border-white/10 bg-zinc-950/40'}`}>
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="text-lg font-bold text-white">{voice.name}</h3><p className="mt-1 text-xs text-zinc-400">샘플 언어 {LANGUAGES.find(item => item.id === voice.language)?.label || voice.language} · {voice.gender === 'male' ? '남성' : '여성'}</p></div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${ready ? 'bg-cyan-400/10 text-cyan-200' : 'bg-zinc-800 text-zinc-400'}`}>{ready ? '가창 30초' : '샘플 준비 중'}</span>
          </div>
          {id.startsWith('discovery-v2-') && <p className="mt-3 text-xs text-amber-200">{voice.designStatus === 'verified' ? '설계 검증' : '설계 확인 중'} · {voice.qualityReview === 'reviewed' ? '청음 기록 있음' : '청음 미검증'}</p>}
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">{voice.desc}</p>
          <div className="mb-5 mt-3 flex flex-wrap gap-1.5">{voice.tags.slice(0, 3).map(tag => <span key={tag} className="rounded-full bg-white/5 px-2 py-1 text-xs text-zinc-400">{tag}</span>)}</div>
          <div className="mt-auto grid grid-cols-2 gap-2">
            <button type="button" disabled={!ready || (isCurrent && loading)} aria-label={`${voice.name} ${isCurrent && playing ? '청음 중지' : '가창 30초 듣기'}`} onClick={() => void preview(id)} className="min-h-11 rounded-xl bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">{!ready ? '샘플 준비 중' : isCurrent && loading ? '불러오는 중…' : isCurrent && playing ? '일시 정지' : '30초 듣기'}</button>
            <button type="button" aria-pressed={favorite} aria-label={`${voice.name} 즐겨찾기 ${favorite ? '해제' : '추가'}`} onClick={() => toggleSaved(id)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold ${favorite ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/15 text-zinc-300 hover:bg-white/5'}`}>{favorite ? '★ 저장됨' : '☆ 즐겨찾기'}</button>
          </div>
          <details className="mt-3 border-t border-white/10 pt-3">
            <summary className="cursor-pointer py-1 text-sm text-cyan-200">{ready ? '이 음색으로 만들기' : '샘플 준비 후 스튜디오에서 사용'}</summary>
            <p className="mt-3 text-xs text-zinc-500">{voice.reuseStatus === 'ready' ? '가창 샘플 기반 작곡 연결' : '작곡 연결 준비 중 · 먼저 청음하고 즐겨찾기하세요'}</p><div className="mt-3 grid gap-2">{STUDIOS.map(studio => <button key={studio.href} type="button" disabled={!ready || voice.reuseStatus !== 'ready'} onClick={() => apply(id, studio.href)} className="min-h-10 rounded-lg bg-white/5 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-600">{studio.label} ↗</button>)}</div>
          </details>
        </article>
      })}
    </div>

    {current && typeof document !== 'undefined' && createPortal(<div role="region" aria-label="30초 음색 플레이어" className="fixed inset-x-0 bottom-0 z-[65] border-t border-zinc-500/70 bg-[#222225] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.4)]">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_2.25rem_2.25rem] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(0,9rem)_2rem_minmax(0,1fr)_auto_2rem]">
        <p className="min-w-0 truncate text-sm font-medium text-zinc-100" title={current.name}>{current.name}</p>
        <button type="button" disabled={loading} aria-label={loading ? '샘플 불러오는 중' : playing ? '일시 정지' : elapsed >= DISCOVERY_PREVIEW_SECONDS ? '다시 듣기' : '재생'} title={playing ? '일시 정지' : '재생'} onClick={() => void preview(current.discoveryVoiceId)} className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-zinc-950 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 disabled:opacity-50 md:h-8 md:w-8">
          {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : playing ? <Pause aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor" /> : <Play aria-hidden="true" className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
        </button>
        <label className="col-span-3 row-start-2 flex min-w-0 items-center gap-2 text-[11px] tabular-nums text-zinc-300 md:col-span-1 md:col-start-3 md:row-start-1">
          <span className="sr-only">가창 샘플 재생 위치</span><span>{timeLabel(elapsed)}</span>
          <input type="range" min={0} max={DISCOVERY_PREVIEW_SECONDS} step={0.1} value={elapsed} disabled={loading || !!error} onChange={event => seek(Number(event.target.value))} className="h-4 min-w-0 flex-1 accent-zinc-200" />
          <span>0:30</span>
        </label>
        <label className="hidden items-center gap-2 text-zinc-300 md:col-start-4 md:row-start-1 md:flex">
          <span className="sr-only">음량</span><Volume2 aria-hidden="true" className="h-3.5 w-3.5" />
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); if (audioRef.current) audioRef.current.volume = value }} className="h-4 w-16 accent-zinc-200" />
        </label>
        <button type="button" aria-label="음색 플레이어 닫기" title="닫기" onClick={() => { requestRef.current?.abort(); pausePreview(); boundsRef.current = null; setCurrentId(null); setLoading(false) }} className="col-start-3 row-start-1 flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-zinc-100 md:col-start-5 md:h-8 md:w-8"><X aria-hidden="true" className="h-4 w-4" /></button>
      </div>
      {error && <p role="alert" className="mx-auto mt-1 max-w-6xl text-xs text-rose-300">{error}</p>}
    </div>, document.body)}
    <p className="text-xs leading-relaxed text-zinc-500">노래 샘플 기반 음색 참조 · 곡에 따라 표현이 달라질 수 있습니다.</p>
    <audio data-voice-preview ref={audioRef} preload="none" onPause={() => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      setPlaying(false)
    }} onTimeUpdate={() => {
      const audio = audioRef.current
      const bounds = boundsRef.current
      if (!audio || !bounds) return
      setElapsed(discoveryPreviewPosition(audio.currentTime - bounds.start))
      if (audio.currentTime >= bounds.end) pausePreview()
    }} onEnded={() => {
      pausePreview()
      const played = discoveryPreviewPosition((audioRef.current?.currentTime || 0) - (boundsRef.current?.start || 0))
      setElapsed(played)
      if (played < DISCOVERY_PREVIEW_SECONDS - 0.1) setError('샘플이 30초 전에 종료되었습니다. 샘플을 확인 중입니다.')
    }} onError={() => {
      if (!boundsRef.current) return
      pausePreview()
      boundsRef.current = null
      setError('샘플 재생이 중단되었습니다. 다시 재생해 주세요.')
    }} />
  </section>

}
