'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { ARTIST_LANGUAGE_LABELS, type ArtistProfile } from '@/lib/artists/types'
import { buildArtistMusicStyle } from '@/lib/artists/studio-style'

type ArtistOptions = {
  userId?: string
  initialArtistId: string | null
  lyricsLanguage: string
  hasLyrics: boolean
  onLyricsLanguageChange: (language: string) => void
  allowedLanguages?: readonly string[]
}
type GenerationSettings = { isInstrumental: boolean; sunoVersion: string; sourceMenu: string; stylePrompt?: string; vocalSelections?: string[] }
const STUDIO_MENUS = new Set(['style-library', 'preset-studio', 'audio-forge', 'audio', 'japan'])

/** Selection stays within the open studio; ordinary voice preferences remain independent. */
export function useStudioArtist(options: ArtistOptions) {
  const { userId, initialArtistId } = options
  const [artists, setArtists] = useState<ArtistProfile[]>([])
  const [artist, setArtist] = useState<ArtistProfile | null>(null)
  const [unresolvedId, setUnresolvedId] = useState(initialArtistId)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)
  const latestOptions = useRef(options)
  const selectedId = useRef<string | null>(initialArtistId)
  const previousInitialId = useRef(initialArtistId)
  const previousUserId = useRef(userId)
  useEffect(() => { latestOptions.current = options })

  function applyArtist(profile: ArtistProfile | null) {
    setArtist(profile)
    selectedId.current = profile?.id || null
    setUnresolvedId(null)
    setLoadError('')
    const current = latestOptions.current
    if (profile?.voice && !current.hasLyrics && (!current.allowedLanguages || current.allowedLanguages.includes(profile.voice.language))) {
      current.onLyricsLanguageChange(profile.voice.language)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    if (previousInitialId.current !== initialArtistId || previousUserId.current !== userId) {
      previousInitialId.current = initialArtistId
      previousUserId.current = userId
      selectedId.current = initialArtistId
      setArtist(null)
      setArtists([])
      setUnresolvedId(initialArtistId)
    }
    if (!userId) {
      setArtists([])
      setArtist(null)
      setLoading(false)
      setUnresolvedId(initialArtistId)
      selectedId.current = initialArtistId
      setLoadError(initialArtistId !== null ? '아티스트를 불러오려면 로그인해 주세요.' : '')
      return () => controller.abort()
    }
    setLoading(true)
    setLoadError('')
    const requestedId = selectedId.current
    async function load() {
      try {
        const response = await fetch('/api/artists', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        const result = await response.json()
        if (!response.ok || !Array.isArray(result.artists)) throw new Error('아티스트 목록을 불러오지 못했습니다. 다시 시도해 주세요.')
        if (controller.signal.aborted) return
        const ready = (result.artists as ArtistProfile[]).filter(profile => profile.status === 'ready' && profile.voice && profile.portrait)
        setArtists(ready)
        if (requestedId !== null && selectedId.current === requestedId) {
          const selected = ready.find(profile => profile.id === requestedId)
          if (!selected) {
            setArtist(null)
            setUnresolvedId(requestedId)
            setLoadError('선택한 아티스트를 사용할 수 없습니다. 작곡 준비를 마친 내 아티스트를 다시 선택해 주세요.')
          } else applyArtist(selected)
        }
      } catch {
        if (!controller.signal.aborted) {
          setLoadError('아티스트 목록을 불러오지 못했습니다. 다시 시도해 주세요.')
          if (requestedId !== null && selectedId.current === requestedId) setUnresolvedId(requestedId)
        }
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [userId, initialArtistId, reloadCount])

  const voice = artist?.voice
  const hasSelection = Boolean(artist) || unresolvedId !== null
  const languageError = voice && (voice.language !== options.lyricsLanguage || (options.allowedLanguages && !options.allowedLanguages.includes(voice.language)))
    ? `아티스트는 ${ARTIST_LANGUAGE_LABELS[voice.language]}로 노래합니다. ${options.allowedLanguages && !options.allowedLanguages.includes(voice.language) ? '이 스튜디오의 가사 언어와 맞는 아티스트를 선택해 주세요.' : '기존 가사의 언어를 확인하고 가사 언어를 맞추거나 다른 아티스트를 선택해 주세요.'}`
    : ''
  const error = hasSelection ? loadError || languageError : ''
  function getError(settings: GenerationSettings): string {
    if (!hasSelection) return ''
    if (loading) return '아티스트 정보를 불러오는 중입니다. 잠시 후 생성해 주세요.'
    if (error) return error
    if (!artist || !voice) return '작곡 준비를 마친 아티스트를 다시 선택해 주세요.'
    if (settings.isInstrumental) return '아티스트는 솔로 보컬곡에 적용됩니다. 연주곡을 만들려면 아티스트 선택을 해제해 주세요.'
    if (/\b(?:duet|duo|mixed vocals?|male and female)\b/i.test(settings.stylePrompt || '') || settings.vocalSelections?.some(value => /duet|duo|mixed|random|듀엣|랜덤|혼성/i.test(value))) return '듀엣·랜덤 보컬 스타일을 사용하려면 아티스트 선택을 해제해 주세요.'
    if (settings.sunoVersion.toUpperCase() !== 'V6') return '선택한 아티스트는 Suno V6에서 작곡할 수 있습니다.'
    if (!STUDIO_MENUS.has(settings.sourceMenu)) return '아티스트는 뮤직·프리셋·일본 BGM 스튜디오에서 사용해 주세요.'
    return ''
  }
  return {
    artists, artist, loading, loadError, error, hasSelection, isAuthenticated: Boolean(userId),
    defaultMusicStyle: artist ? buildArtistMusicStyle(artist.genres) : '',
    requestFields: artist ? { artistId: artist.id, artistRevision: artist.revision } : {},
    artistVoice: voice ? { name: artist!.name, gender: voice.gender, language: voice.language } : undefined,
    select: (id: string) => { if (!id) applyArtist(null); else { const profile = artists.find(item => item.id === id); if (profile) applyArtist(profile) } },
    refresh: () => setReloadCount(count => count + 1),
    getError,
  }
}

export function StudioArtistPicker({ state }: { state: ReturnType<typeof useStudioArtist> }) {
  const labelId = useId()
  return <section aria-labelledby={labelId} className="mb-4 rounded-2xl border border-violet-400/25 bg-violet-950/15 p-4 text-zinc-200">
    <div className="flex items-start justify-between gap-3">
      <div><h3 id={labelId} className="text-sm font-semibold text-violet-200">아티스트로 작곡</h3><p className="mt-1 text-xs leading-relaxed text-zinc-400">작곡 준비를 마친 내 아티스트의 목소리와 정체성을 곡에 연결합니다.</p></div>
      <Link href="/persona" className="shrink-0 text-xs text-violet-200 underline underline-offset-4">아티스트 작업실 ↗</Link>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <select aria-label="작곡할 아티스트" value={state.artist?.id || (state.hasSelection ? '__unavailable__' : '')} disabled={state.loading} onChange={event => state.select(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50">
        <option value="">아티스트 없이 작곡</option>
        {state.hasSelection && !state.artist && <option value="__unavailable__" disabled>{state.loading ? '선택한 아티스트를 불러오는 중' : '선택한 아티스트 사용 불가'}</option>}
        {state.artists.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {ARTIST_LANGUAGE_LABELS[profile.voice!.language]} · {profile.voice!.gender === 'female' ? '여성' : '남성'}</option>)}
      </select>
      <button type="button" disabled={state.loading} onClick={state.refresh} className="rounded-lg bg-white/5 px-3 py-2 text-xs disabled:opacity-50">다시 불러오기</button>
      {state.hasSelection && <button type="button" onClick={() => state.select('')} className="rounded-lg bg-white/5 px-3 py-2 text-xs">선택 해제</button>}
    </div>
    {state.loading && <p role="status" className="mt-2 text-xs text-zinc-400">아티스트를 불러오는 중…</p>}
    {!state.loading && !state.artists.length && !state.loadError && <p className="mt-2 text-xs text-zinc-400">{state.isAuthenticated ? '작곡 준비를 마친 아티스트가 없습니다. 작업실에서 목소리·초상·정체성을 확인해 주세요.' : '로그인 후 내 아티스트를 선택할 수 있습니다.'}</p>}
    {state.artist && <p className="mt-2 text-xs leading-relaxed text-violet-200">{state.artist.name} · {state.artist.voice!.name} · 솔로 보컬 적용. 일반 보컬 선택은 아티스트를 해제한 뒤 변경할 수 있습니다.</p>}
    {state.artist && <p className="mt-1 text-xs leading-relaxed text-zinc-400">{state.artist.genres.length
      ? `기본 장르: ${state.artist.genres.join(', ')}. 음악 스타일이 비어 있으면 적용합니다. 프리셋이나 직접 입력한 스타일도 사용할 수 있습니다.`
      : '등록된 기본 장르가 없습니다. 프리셋을 선택하거나 STYLE PROMPT에 장르·분위기를 입력해 주세요.'}</p>}
    {(state.error || state.loadError) && <p role="alert" className="mt-2 text-xs leading-relaxed text-amber-200">{state.error || state.loadError}</p>}
  </section>
}
