'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, ArrowUpRight, CheckCircle2, Disc3, Library, Loader2, Mic2, RefreshCw, Save, Search, UserRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ARTIST_LANGUAGE_LABELS, type ArtistProfile } from '@/lib/artists/types'
import { PersonaIdentityFields } from './PersonaIdentityFields'
import { ArtistWorks } from './ArtistWorks'
import { artistResponse, VOICE_KIND_LABELS } from './artist-form'
import { orderedPersonaArtists, personaIdentity, personaSaveInput, reconcilePersonaMutation, type PersonaIdentity, type PersonaMutation } from './artist-persona-state'

type Editor = { artist: ArtistProfile | null; identity: PersonaIdentity | null }
const EMPTY_EDITOR: Editor = { artist: null, identity: null }
const STATUS_LABEL = { ready: '제작 준비 완료', draft: '검토가 필요한 초안', archived: '보관됨' }

function savedDate(value: string) {
  return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function PersonaHeader() {
  return <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
    <div><p className="mb-2 text-xs font-semibold tracking-[0.15em] text-purple-300">MELODIO PERSONA</p><h1 className="text-3xl font-bold tracking-tight text-white">아티스트 페르소나</h1><p className="mt-2 text-sm leading-relaxed text-zinc-400">저장한 가수의 성격과 세계관을 다듬고, 그 가수가 만든 음악을 모아 보세요.</p></div>
    <Link href="/incubator" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5">인큐베이터에서 새 가수 만들기 <ArrowUpRight size={15} /></Link>
  </header>
}

export default function ArtistPersonaWorkspace({ initialArtistId }: { initialArtistId?: string }) {
  const { user, loading } = useAuth()
  return <div className="mx-auto max-w-7xl pb-12 pt-3"><PersonaHeader />{loading ? <div role="status" className="flex items-center gap-2 rounded-2xl border border-white/10 p-8 text-sm text-zinc-400"><Loader2 size={18} className="animate-spin" />계정을 확인하는 중…</div> : user ? <PersonaManager key={user.id} userId={user.id} initialArtistId={initialArtistId} /> : <PersonaSignIn />}</div>
}

function PersonaSignIn() {
  return <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center"><Library size={30} className="mx-auto text-purple-300" /><h2 className="mt-4 text-lg font-semibold">내 가수의 페르소나를 관리하세요</h2><p className="mt-2 text-sm leading-relaxed text-zinc-500">로그인하면 계정에 저장한 가수와 제작한 곡을 불러올 수 있습니다.</p><Link href="/login" className="mt-5 inline-block rounded-xl bg-purple-500 px-5 py-3 text-sm font-semibold text-white hover:bg-purple-400">로그인</Link></section>
}

function PersonaManager({ userId, initialArtistId }: { userId: string; initialArtistId?: string }) {
  const [artists, setArtists] = useState<ArtistProfile[]>([])
  const [editor, setEditor] = useState<Editor>(EMPTY_EDITOR)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'identity' | 'works'>('identity')
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState<PersonaMutation | null>(null)
  const [conflict, setConflict] = useState(false)
  const [reconnectStage, setReconnectStage] = useState<'voice' | 'portrait' | null>(null)
  const [accessLost, setAccessLost] = useState(false)
  const editorRef = useRef<Editor>(EMPTY_EDITOR)
  const requestBusy = useRef(false)
  const uncertainRef = useRef<PersonaMutation | null>(null)
  const alive = useRef(false)
  const requests = useRef(new Set<AbortController>())
  const listSequence = useRef(0)
  const artist = editor.artist
  const identity = editor.identity
  const dirty = !!artist && !!identity && JSON.stringify(identity) !== JSON.stringify(personaIdentity(artist))
  const archived = artist?.status === 'archived'
  const ready = artist?.status === 'ready' && !dirty && !uncertain && !conflict
  const visibleArtists = orderedPersonaArtists(artists).filter(row => (showArchived || row.status !== 'archived') && `${row.name} ${row.tagline} ${row.genres.join(' ')}`.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    alive.current = true
    const pending = requests.current
    return () => { alive.current = false; pending.forEach(controller => controller.abort()); pending.clear() }
  }, [])

  const installArtist = useCallback((value: ArtistProfile | null) => {
    const next = { artist: value, identity: value ? personaIdentity(value) : null }
    editorRef.current = next; setEditor(next)
  }, [])

  const ownedArtist = useCallback((value: ArtistProfile): ArtistProfile => {
    if (!value || value.userId !== userId || typeof value.id !== 'string' || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('계정에 저장된 가수 정보를 확인하지 못했습니다. 다시 불러와 주세요.')
    return value
  }, [userId])

  const loadList = useCallback(async (controller: AbortController, chooseRequested: boolean) => {
    const sequence = ++listSequence.current
    requests.current.add(controller); setListLoading(true); setListError('')
    try {
      const response = await fetch('/api/artists', { cache: 'no-store', signal: controller.signal })
      if (!alive.current || controller.signal.aborted || sequence !== listSequence.current) return
      if (response.status === 401) setAccessLost(true)
      const data = await artistResponse<{ artists: ArtistProfile[] }>(response)
      if (!Array.isArray(data.artists)) throw new Error('가수 목록을 확인하지 못했습니다.')
      const owned = data.artists.map(ownedArtist)
      if (!alive.current || controller.signal.aborted || sequence !== listSequence.current) return
      setArtists(owned)
      const previous = editorRef.current
      if (chooseRequested || !previous.artist) {
        if (requestBusy.current || uncertainRef.current) return
        const requested = owned.find(row => row.id === initialArtistId)
        const preferred = requested || orderedPersonaArtists(owned)[0] || null
        const hasEdits = !!previous.artist && !!previous.identity && JSON.stringify(previous.identity) !== JSON.stringify(personaIdentity(previous.artist))
        if (hasEdits && previous.artist?.id === preferred?.id) return
        if (hasEdits && !window.confirm('저장하지 않은 변경 사항이 있습니다. 변경 사항을 버리고 요청한 가수를 열까요?')) return
        installArtist(preferred)
        if (preferred?.status === 'archived') setShowArchived(true)
        if (initialArtistId && !requested) setNotice('요청한 가수를 찾을 수 없어 저장된 가수를 불러왔습니다.')
      }
    } catch (reason) {
      if (alive.current && !controller.signal.aborted && sequence === listSequence.current) setListError(reason instanceof Error ? reason.message : '가수를 불러오지 못했습니다.')
    } finally {
      requests.current.delete(controller)
      if (alive.current && !controller.signal.aborted && sequence === listSequence.current) setListLoading(false)
    }
  }, [initialArtistId, installArtist, ownedArtist])

  useEffect(() => {
    const controller = new AbortController()
    void loadList(controller, true)
    return () => controller.abort()
  }, [loadList])

  useEffect(() => {
    if ((!dirty && !busy && !uncertain) || accessLost) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const guardNavigation = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const destination = new URL(link.href, window.location.href)
      if (destination.origin !== window.location.origin || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return
      if (busy || uncertain || !window.confirm('저장하지 않은 변경 사항이 있습니다. 변경 사항을 버리고 이동할까요?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', beforeUnload); document.addEventListener('click', guardNavigation, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', guardNavigation, true) }
  }, [accessLost, dirty, busy, uncertain])

  function chooseArtist(value: ArtistProfile) {
    if (requestBusy.current || uncertain || value.id === artist?.id) return
    if (dirty && !window.confirm('저장하지 않은 변경 사항이 있습니다. 변경 사항을 버리고 다른 가수를 열까요?')) return
    installArtist(value); setTab('identity'); setError(''); setNotice(''); setConflict(false); setReconnectStage(null)
  }

  function changeIdentity(patch: Partial<PersonaIdentity>) {
    const current = editorRef.current
    if (!current.artist || !current.identity || current.artist.status === 'archived' || requestBusy.current || uncertain) return
    const next = { ...current, identity: { ...current.identity, ...patch } }
    editorRef.current = next; setEditor(next); setNotice(''); setError('')
  }

  function acceptArtist(value: ArtistProfile) {
    installArtist(value); setArtists(previous => [value, ...previous.filter(row => row.id !== value.id)])
    uncertainRef.current = null; setUncertain(null); setConflict(false); setReconnectStage(null); window.dispatchEvent(new Event('melodio-artists-changed'))
  }

  async function mutate(receipt: PersonaMutation) {
    if (requestBusy.current || uncertain || accessLost) return
    const controller = new AbortController()
    requests.current.add(controller); requestBusy.current = true; setBusy(true); setError(''); setNotice(''); setReconnectStage(null)
    let mayHaveCommitted = true
    try {
      const response = await fetch(`/api/artists/${encodeURIComponent(receipt.artistId)}`, { method: receipt.kind === 'save' ? 'PATCH' : 'DELETE', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(receipt.kind === 'save' ? { ...receipt.input, expectedRevision: receipt.expectedRevision } : { expectedRevision: receipt.expectedRevision }) })
      if (!alive.current || controller.signal.aborted) return
      mayHaveCommitted = response.ok || response.status >= 500
      if (response.status === 401) setAccessLost(true)
      if (!response.ok) {
        const failure = await response.clone().json().catch(() => null)
        if (failure?.code === 'artist_conflict') setConflict(true)
        if (['artist_voice_not_ready', 'artist_voice_not_found'].includes(failure?.code)) setReconnectStage('voice')
        if (failure?.code === 'artist_portrait_not_found') setReconnectStage('portrait')
      }
      const data = await artistResponse<{ artist: ArtistProfile }>(response)
      const saved = ownedArtist(data.artist)
      if (!alive.current || controller.signal.aborted) return
      if (saved.id !== receipt.artistId || saved.revision !== receipt.expectedRevision + 1 || saved.status !== (receipt.kind === 'save' ? 'draft' : 'archived')) throw new Error('요청한 가수의 저장 결과를 확인하지 못했습니다. 계정의 최신 내용을 확인해 주세요.')
      acceptArtist(saved)
      if (saved.status === 'archived') { setShowArchived(true); setNotice('가수를 보관했습니다. 페르소나와 기존 제작곡은 계속 확인할 수 있습니다.') }
      else setNotice('페르소나를 초안으로 저장했습니다. 인큐베이터에서 정체성을 검토하고 다시 승인하면 다음 곡에 사용할 수 있습니다.')
    } catch (reason) {
      if (!alive.current || controller.signal.aborted) return
      if (mayHaveCommitted) { uncertainRef.current = receipt; setUncertain(receipt); setError('요청 결과를 확인하지 못했습니다. 다시 저장하거나 보관하기 전에 계정에 저장된 결과를 확인해 주세요.') }
      else setError(reason instanceof Error ? reason.message : '변경 사항을 처리하지 못했습니다.')
    } finally {
      requests.current.delete(controller)
      if (alive.current && !controller.signal.aborted) { requestBusy.current = false; setBusy(false) }
    }
  }

  function saveIdentity() {
    if (!artist || !identity || archived || !dirty || conflict || listLoading) return
    const input = personaSaveInput(artist, identity)
    if (!input.name) { setError('가수 이름을 입력해 주세요.'); return }
    if (input.genres.length > 8 || input.genres.some(genre => genre.length > 60)) { setError('장르는 최대 8개, 각 60자 이내로 입력해 주세요.'); return }
    void mutate({ kind: 'save', artistId: artist.id, expectedRevision: artist.revision, input })
  }

  function archiveArtist() {
    if (!artist || archived || conflict || requestBusy.current || uncertain) return
    if (!window.confirm(`${artist.name}을 보관할까요? ${dirty ? '저장하지 않은 변경 사항은 버립니다. ' : ''}보관 후에는 읽기 전용이며 새 곡 제작에 선택할 수 없습니다.`)) return
    void mutate({ kind: 'archive', artistId: artist.id, expectedRevision: artist.revision })
  }

  async function reloadArtist(verifyReceipt = false) {
    if (!artist || requestBusy.current || (uncertain && !verifyReceipt)) return
    if (!verifyReceipt && dirty && !window.confirm('저장하지 않은 변경 사항을 버리고 계정에 저장된 최신 페르소나를 불러올까요?')) return
    const controller = new AbortController()
    const receipt = verifyReceipt ? uncertainRef.current : null
    const targetArtistId = receipt?.artistId || artist.id
    requests.current.add(controller); requestBusy.current = true; setBusy(true); setError('')
    try {
      const response = await fetch(`/api/artists/${encodeURIComponent(targetArtistId)}`, { cache: 'no-store', signal: controller.signal })
      if (!alive.current || controller.signal.aborted) return
      if (response.status === 401) setAccessLost(true)
      const data = await artistResponse<{ artist: ArtistProfile }>(response)
      const current = ownedArtist(data.artist)
      if (!alive.current || controller.signal.aborted) return
      if (current.id !== targetArtistId) throw new Error('요청한 가수의 페르소나를 확인하지 못했습니다. 다시 불러와 주세요.')
      if (receipt) {
        const result = reconcilePersonaMutation(receipt, current)
        uncertainRef.current = null; setUncertain(null)
        if (result === 'applied') { acceptArtist(current); if (current.status === 'archived') setShowArchived(true); setNotice(current.status === 'archived' ? '계정에서 보관 완료를 확인했습니다.' : '계정에서 페르소나 저장 완료를 확인했습니다. 인큐베이터에서 검토·승인해 주세요.') }
        else if (result === 'not-applied') setNotice('계정에는 이전 버전이 유지되어 있습니다. 편집 내용은 그대로 남아 있으므로 다시 저장할 수 있습니다.')
        else { setConflict(true); setError('계정의 페르소나가 다른 내용으로 변경되었습니다. 편집 내용은 유지했습니다. 최신 내용을 다시 불러온 뒤 작업해 주세요.') }
      } else { acceptArtist(current); setNotice('계정에 저장된 최신 페르소나를 불러왔습니다.') }
    } catch (reason) { if (alive.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : '저장된 페르소나를 확인하지 못했습니다.') }
    finally { requests.current.delete(controller); if (alive.current && !controller.signal.aborted) { requestBusy.current = false; setBusy(false) } }
  }

  function cancelEdits() {
    if (!artist || requestBusy.current || uncertain || !dirty) return
    if (!window.confirm('저장하지 않은 변경 사항을 취소할까요?')) return
    installArtist(artist); setError(''); setNotice('변경 사항을 취소했습니다.')
  }

  if (accessLost) return <PersonaSignIn />
  return <div className="grid items-start gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
    <aside className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Library size={16} className="text-purple-300" />저장한 가수 <span className="text-zinc-500">{artists.filter(row => row.status !== 'archived').length}</span></h2><button type="button" aria-label="저장한 가수 목록 새로고침" disabled={listLoading || busy || !!uncertain} onClick={() => void loadList(new AbortController(), false)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 disabled:opacity-40"><RefreshCw size={15} className={listLoading ? 'animate-spin' : ''} /></button></div>
      <label className="relative mt-4 block"><Search size={15} className="absolute left-3 top-3 text-zinc-600" /><span className="sr-only">저장한 가수 검색</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="가수 이름, 장르 검색" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-purple-400" /></label>
      {listLoading ? <p role="status" className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={15} className="animate-spin" />저장한 가수를 불러오는 중…</p> : listError ? <p role="alert" className="mt-4 text-xs leading-relaxed text-rose-300">{listError}</p> : null}
      <div className="mt-4 max-h-[650px] space-y-2 overflow-y-auto">{visibleArtists.map(row => <button type="button" key={row.id} aria-pressed={artist?.id === row.id} disabled={busy || !!uncertain || listLoading} onClick={() => chooseArtist(row)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50 ${artist?.id === row.id ? 'border-purple-400/40 bg-purple-500/10' : 'border-transparent hover:bg-white/5'}`}><span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-900">{row.portrait ? <Image src={`/api/artists/portrait?assetId=${encodeURIComponent(row.portrait.assetId)}`} alt="" fill unoptimized sizes="48px" className="object-cover" /> : <UserRound size={20} className="text-zinc-600" />}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{row.name}</span><span className="mt-1 block truncate text-xs text-zinc-500">{row.tagline || row.genres.join(' · ') || '소개 작성 전'}</span><span className={`mt-1.5 block text-[11px] ${row.status === 'ready' ? 'text-emerald-300' : row.status === 'draft' ? 'text-purple-300' : 'text-zinc-600'}`}>{STATUS_LABEL[row.status]}</span></span></button>)}</div>
      {!listLoading && !listError && artists.length > 0 && !visibleArtists.length && <p className="mt-4 text-xs leading-relaxed text-zinc-500">조건에 맞는 저장된 가수가 없습니다.</p>}
      {artists.some(row => row.status === 'archived') && <label className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} className="accent-purple-500" />보관한 가수 보기</label>}
    </aside>
    <main className="min-w-0">
      {!artist || !identity ? <section className="flex min-h-[470px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center"><UserRound size={36} className="text-purple-300" /><h2 className="mt-5 text-xl font-semibold">{listLoading ? '가수를 불러오고 있습니다' : listError ? '가수 목록을 불러오지 못했습니다' : '아직 저장한 가수가 없습니다'}</h2><p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-500">{listLoading ? '계정에 저장된 프로필을 확인한 뒤 페르소나와 제작곡을 보여드립니다.' : listError ? '목록을 새로고침해 다시 확인해 주세요.' : '인큐베이터에서 가수의 프로필, 보컬, 기준 사진을 만들고 저장하면 여기에서 정체성과 작업물을 관리할 수 있습니다.'}</p>{!listLoading && !listError && <Link href="/incubator" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-purple-500 px-5 py-3 text-sm font-semibold text-white hover:bg-purple-400">인큐베이터에서 첫 가수 만들기 <ArrowUpRight size={16} /></Link>}</section> : <>
        <section className="grid gap-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6 xl:grid-cols-[250px_minmax(0,1fr)]">
          <div className="relative mx-auto flex aspect-square w-full max-w-[300px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/25">{artist.portrait ? <Image src={`/api/artists/portrait?assetId=${encodeURIComponent(artist.portrait.assetId)}`} alt={`${artist.name}의 저장된 기준 사진`} fill unoptimized sizes="(max-width: 640px) 280px, 300px" className="object-contain" /> : <div className="px-6 text-center"><UserRound size={44} className="mx-auto text-zinc-600" /><p className="mt-3 text-xs text-zinc-500">기준 사진 등록 전</p></div>}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${artist.status === 'ready' ? 'bg-emerald-500/10 text-emerald-300' : artist.status === 'draft' ? 'bg-purple-500/10 text-purple-200' : 'bg-white/5 text-zinc-500'}`}>{artist.status === 'ready' && <CheckCircle2 size={13} />}{STATUS_LABEL[artist.status]}</span><span className="text-xs text-zinc-500">{artist.status === 'ready' ? '승인' : '저장'} 버전 {artist.revision + 1}</span></div><h2 className="mt-4 break-words text-3xl font-bold">{artist.name}</h2>{artist.tagline && <p className="mt-2 text-sm text-zinc-300">{artist.tagline}</p>}{artist.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-500">{artist.description}</p>}
            <div className="mt-5 rounded-xl border border-white/10 bg-black/15 p-4"><p className="flex items-center gap-2 text-xs text-zinc-500"><Mic2 size={14} />연결된 보컬</p><p className="mt-1.5 text-sm font-medium">{artist.voice?.name || '보컬 지정 전'}</p>{artist.voice && <p className="mt-1.5 text-xs text-zinc-500">{VOICE_KIND_LABELS[artist.voice.kind]} · {ARTIST_LANGUAGE_LABELS[artist.voice.language]} · {artist.voice.gender === 'female' ? '여성' : '남성'}</p>}</div>
            {!!artist.genres.length && <div className="mt-4 flex flex-wrap gap-2">{artist.genres.map(genre => <span key={genre} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-400">{genre}</span>)}</div>}
            <p className="mt-4 text-[11px] text-zinc-600">최근 저장 · {savedDate(artist.updatedAt)} (서울)</p>
          </div>
        </section>
        {archived ? <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-zinc-500">보관된 가수입니다. 페르소나와 제작곡을 읽기 전용으로 확인할 수 있습니다.</p> : <section className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-purple-400/15 bg-purple-500/[0.04] p-4"><p className="text-sm leading-relaxed text-zinc-400">{artist.status === 'draft' ? '보컬·기준 사진·정체성을 검토하고 승인하면 다음 곡을 제작할 수 있습니다.' : '가수의 보컬과 기준 사진은 인큐베이터에서 검증하고 변경합니다.'}</p><Link href={`/incubator?artistId=${encodeURIComponent(artist.id)}&stage=${artist.status === 'draft' ? 'review' : 'voice'}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-300 hover:text-purple-200">{artist.status === 'draft' ? '인큐베이터에서 정체성 검토·승인' : '보컬·얼굴 확인/변경'} <ArrowUpRight size={15} /></Link></section>}
        {(error || notice || uncertain) && <div className="mt-4 space-y-3">{error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-3.5 text-sm leading-relaxed text-rose-300">{error}</p>}{reconnectStage && !archived && <Link href={`/incubator?artistId=${encodeURIComponent(artist.id)}&stage=${reconnectStage}`} className="inline-flex items-center gap-1.5 text-sm text-purple-300 hover:text-purple-200">{reconnectStage === 'voice' ? '인큐베이터에서 보컬 다시 연결' : '인큐베이터에서 기준 사진 다시 연결'} <ArrowUpRight size={15} /></Link>}{notice && <p role="status" className="rounded-xl border border-purple-400/20 bg-purple-500/5 p-3.5 text-sm leading-relaxed text-purple-200">{notice}</p>}{uncertain && <button type="button" disabled={busy} onClick={() => void reloadArtist(true)} className="inline-flex items-center gap-2 rounded-xl border border-purple-400/30 px-4 py-3 text-sm text-purple-200 disabled:opacity-40"><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />계정에 저장된 요청 결과 확인</button>}</div>}
        <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div role="tablist" aria-label="페르소나 관리" className="flex gap-2 border-b border-white/10 p-3"><button type="button" role="tab" id="persona-identity-tab" aria-selected={tab === 'identity'} aria-controls="persona-identity-panel" onClick={() => setTab('identity')} className={`rounded-xl px-4 py-3 text-sm ${tab === 'identity' ? 'bg-purple-500/15 text-purple-200' : 'text-zinc-500 hover:bg-white/5'}`}>정체성·세계관 {dirty && <span className="ml-1 text-xs">· 수정 중</span>}</button><button type="button" role="tab" id="persona-works-tab" aria-selected={tab === 'works'} aria-controls="persona-works-panel" onClick={() => setTab('works')} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${tab === 'works' ? 'bg-purple-500/15 text-purple-200' : 'text-zinc-500 hover:bg-white/5'}`}><Disc3 size={16} />제작곡</button></div>
          {tab === 'identity' ? <div role="tabpanel" id="persona-identity-panel" aria-labelledby="persona-identity-tab" className="p-5 sm:p-7"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">이 가수의 이야기와 표현 방식</h3><p className="mt-2 text-xs leading-relaxed text-zinc-500">이름, 소개, 장르, 성격과 세계관을 직접 편집합니다. 보컬과 기준 사진은 저장된 연결을 유지합니다.</p></div>{dirty && <span className="rounded-full bg-purple-500/10 px-3 py-1.5 text-xs text-purple-200">저장 전 변경 사항</span>}</div>
            {!archived && <p className="mb-5 rounded-xl border border-amber-400/15 bg-amber-500/5 p-3.5 text-xs leading-relaxed text-amber-200/85">페르소나를 수정해 저장하면 초안이 됩니다. 인큐베이터에서 정체성을 다시 검토·승인한 뒤 다음 곡에 적용하세요.</p>}
            <fieldset disabled={busy || archived || !!uncertain || listLoading} className="min-w-0 disabled:opacity-70"><legend className="sr-only">저장된 페르소나 편집</legend><PersonaIdentityFields identity={identity} onChange={changeIdentity} /></fieldset>
            {artist.visualDirection && <div className="mt-6 rounded-xl bg-black/15 p-4"><p className="text-xs font-medium text-zinc-500">인큐베이터에 저장된 비주얼 방향</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{artist.visualDirection}</p></div>}
            {!archived && <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5"><button type="button" disabled={busy || !!uncertain || !dirty || conflict || listLoading} onClick={saveIdentity} className="inline-flex items-center gap-2 rounded-xl bg-purple-500 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-400 disabled:bg-zinc-800 disabled:text-zinc-500">{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}페르소나 저장</button><button type="button" disabled={busy || !!uncertain || !dirty} onClick={cancelEdits} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-400 hover:bg-white/5 disabled:opacity-40">변경 취소</button><p className="text-xs text-zinc-500">{busy ? '계정에 반영하는 중…' : uncertain ? '요청 결과 확인이 필요합니다' : dirty ? '아직 저장하지 않은 편집 내용' : '계정에 저장된 내용'}</p></div>}
          </div> : <div role="tabpanel" id="persona-works-panel" aria-labelledby="persona-works-tab" className="px-5 pb-6 sm:px-7"><ArtistWorks key={artist.id} artistId={artist.id} artistName={artist.name} />{ready && <div className="mt-4 flex flex-wrap gap-2"><Link href={`/style-library?artistId=${encodeURIComponent(artist.id)}`} className="rounded-xl bg-purple-500 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-400">이 가수로 뮤직 스튜디오 열기 ↗</Link><Link href={`/audio?artistId=${encodeURIComponent(artist.id)}`} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 hover:bg-white/5">프리셋 스튜디오 ↗</Link></div>}</div>}
        </section>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3"><button type="button" disabled={busy || !!uncertain} onClick={() => void reloadArtist()} className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-40">계정에 저장된 최신 페르소나 불러오기</button>{!archived && <button type="button" disabled={busy || !!uncertain || conflict} onClick={archiveArtist} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-300 disabled:opacity-40"><Archive size={13} />가수 보관</button>}</div>
      </>}
    </main>
  </div>
}
