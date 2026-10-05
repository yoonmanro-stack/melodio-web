'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ImagePlus, Library, Loader2, Mic2, Music2, Plus, RefreshCw, Save, UserRound } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useVoice } from '@/contexts/VoiceContext'
import { DISCOVERY_VOICES } from '@/data/discoveryVoices'
import type { User } from '@supabase/supabase-js'
import type { ArtistInput, ArtistPortrait, ArtistProfile } from '@/lib/artists/types'
import { ArtistProfileFields } from './ArtistProfileFields'
import { ArtistVoiceStep } from './ArtistVoiceStep'
import { ArtistPortraitStep } from './ArtistPortraitStep'
import { artistInput, artistResponse, artistToDraft, artistVoiceChoice, newArtistDraft, readyRequirements, VOICE_KIND_LABELS, type ArtistDraft } from './artist-form'

const STEPS = [
  { label: '프로필', title: '어떤 가수를 만들고 싶나요?', icon: UserRound },
  { label: '보컬', title: '가수에게 어울리는 목소리', icon: Mic2 },
  { label: '참조 사진', title: '얼굴과 비주얼 방향', icon: ImagePlus },
  { label: '확인·승인', title: '첫 곡을 만들기 전에', icon: CheckCircle2 },
] as const

function coreValue(form: ArtistDraft) {
  const value = artistInput(form)
  return JSON.stringify([value.name, value.tagline, value.description, value.genres, value.personality, value.backstory, value.speakingStyle, value.visualDirection, value.voice, value.portrait])
}

export default function ArtistWorkspace({ initialArtistId, initialStep = 0 }: { initialArtistId?: string; initialStep?: 0 | 1 | 2 | 3 }) {
  const { user, loading } = useAuth()
  return <ArtistIncubator key={user?.id || 'signed-out'} initialArtistId={initialArtistId} initialStep={initialStep} user={user} authLoading={loading} />
}

function ArtistIncubator({ initialArtistId, initialStep, user, authLoading }: { initialArtistId?: string; initialStep: 0 | 1 | 2 | 3; user: User | null; authLoading: boolean }) {
  const { voices } = useVoice()
  const [artists, setArtists] = useState<ArtistProfile[]>([])
  const [selected, setSelected] = useState<ArtistProfile | null>(null)
  const [form, setForm] = useState<ArtistDraft>(newArtistDraft)
  const [step, setStep] = useState<number>(initialStep)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [showApproved, setShowApproved] = useState(false)
  const [saveUncertain, setSaveUncertain] = useState(false)
  const requestBusy = useRef(false)
  const activeUser = useRef<string | undefined>(undefined)
  const initializedUser = useRef<string | null>(null)
  const baseline = selected ? artistToDraft(selected) : newArtistDraft()
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)
  const coreDirty = selected !== null && coreValue(form) !== coreValue(baseline)
  const archived = selected?.status === 'archived'
  const busy = saving || uploading
  const draftArtists = artists.filter(artist => artist.status === 'draft')
  const activeArtistCount = artists.filter(artist => artist.status !== 'archived').length
  const visibleArtists = artists.filter(artist => artist.id === selected?.id || artist.status === 'draft' || (showApproved && artist.status === 'ready') || (showArchived && artist.status === 'archived'))
  const missing = readyRequirements(form)
  const savedReady = selected?.status === 'ready' && !dirty
  const currentVoice = [...voices, ...DISCOVERY_VOICES].map(artistVoiceChoice).find(choice => choice?.kind === form.voice?.kind && choice?.referenceId === form.voice?.referenceId)
  const voiceName = currentVoice?.voice.name || (selected?.voice?.kind === form.voice?.kind && selected?.voice?.referenceId === form.voice?.referenceId ? selected?.voice?.name : null)
  const userId = user?.id

  useEffect(() => { activeUser.current = userId; return () => { activeUser.current = undefined } }, [userId])

  const loadArtists = useCallback(async (signal?: AbortSignal) => {
    setListLoading(true); setListError('')
    try {
      if (!userId) { setArtists([]); setSelected(null); setForm(newArtistDraft()); initializedUser.current = null; return }
      const data = await artistResponse<{ artists: ArtistProfile[] }>(await fetch('/api/artists', { cache: 'no-store', signal }))
      if (!Array.isArray(data.artists)) throw new Error('아티스트 목록을 확인하지 못했습니다.')
      if (data.artists.some(artist => artist.userId !== userId)) throw new Error('현재 계정의 가수 목록을 확인하지 못했습니다. 다시 불러와 주세요.')
      if (signal?.aborted || activeUser.current !== userId) return
      setArtists(data.artists)
      const initialKey = `${userId}:${initialArtistId || ''}:${initialStep}`
      if (initializedUser.current !== initialKey) {
        const requested = data.artists.find(artist => artist.id === initialArtistId)
        const candidate = requested
        setSelected(candidate || null); setForm(candidate ? artistToDraft(candidate) : newArtistDraft())
        setStep(requested ? initialStep : 0)
        if (initialArtistId && !requested) setNotice('요청한 가수를 찾을 수 없습니다. 새 가수를 만들거나 목록에서 선택하세요.')
        initializedUser.current = initialKey
      }
    } catch (reason) { if (!signal?.aborted) setListError(reason instanceof Error ? reason.message : '아티스트를 불러오지 못했습니다.') }
    finally { if (!signal?.aborted) setListLoading(false) }
  }, [initialArtistId, initialStep, userId])

  useEffect(() => {
    if (authLoading) return
    const controller = new AbortController()
    void loadArtists(controller.signal)
    return () => controller.abort()
  }, [authLoading, loadArtists])

  useEffect(() => {
    if (!dirty && !busy) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const guardNavigation = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const destination = new URL(link.href, window.location.href)
      if (destination.origin !== window.location.origin || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return
      if (busy || !window.confirm('저장하지 않은 변경 사항이 있습니다. 변경 사항을 버리고 이동할까요?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', guardNavigation, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', guardNavigation, true) }
  }, [dirty, busy])

  function canSwitch(message = '저장하지 않은 변경 사항이 있습니다. 변경 사항을 버리고 다른 가수를 열까요?') { return !requestBusy.current && (!dirty || window.confirm(message)) }
  function chooseArtist(artist: ArtistProfile | null) {
    if (artist?.id === selected?.id || (!artist && !selected) || !canSwitch()) return
    setSelected(artist); setForm(artist ? artistToDraft(artist) : newArtistDraft()); setStep(0); setError(''); setNotice(''); setSaveUncertain(false)
  }
  function change(patch: Partial<ArtistDraft>, kind: 'identity' | 'voice' | 'portrait' | 'checks' = 'identity') {
    setForm(current => {
      const checks = { ...current.checks }
      if (kind === 'identity') checks.identityReviewed = false
      if (kind === 'voice') { checks.voiceAuditioned = false; checks.identityReviewed = false }
      if (kind === 'portrait') checks.identityReviewed = false
      if (kind === 'portrait' || patch.visualDirection !== undefined) checks.portraitReviewed = false
      return { ...current, ...patch, status: 'draft', checks: patch.checks || checks }
    })
    setNotice(''); setError('')
  }
  function acceptArtist(artist: ArtistProfile) {
    setSelected(artist); setForm(artistToDraft(artist))
    setArtists(previous => [artist, ...previous.filter(row => row.id !== artist.id)])
    window.dispatchEvent(new Event('melodio-artists-changed'))
  }

  async function save(status: ArtistInput['status']) {
    if (requestBusy.current || archived || !user || saveUncertain) return
    const input = { ...artistInput(form), status }
    if (!input.name) { setError('가수 이름을 입력해 주세요.'); setStep(0); return }
    if (input.genres.length > 8 || input.genres.some(genre => genre.length > 60)) { setError('장르는 최대 8개, 각 60자 이내로 입력해 주세요.'); setStep(0); return }
    if (status === 'ready' && (missing.length || coreDirty)) { setError(coreDirty ? '변경 사항을 먼저 초안으로 저장한 뒤 확인 항목을 다시 체크해 주세요.' : `승인 전에 확인해 주세요: ${missing.join(', ')}`); setStep(3); return }
    requestBusy.current = true; setSaving(true); setError(''); setNotice('')
    let responseReceived = false
    let responseMayHaveSaved = false
    const savingUserId = user.id
    try {
      const response = await fetch(selected ? `/api/artists/${encodeURIComponent(selected.id)}` : '/api/artists', { method: selected ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selected ? { ...input, expectedRevision: selected.revision } : input) })
      responseReceived = true
      responseMayHaveSaved = response.ok || response.status >= 500
      const data = await artistResponse<{ artist: ArtistProfile }>(response)
      if (!data.artist?.id) throw new Error('저장된 아티스트를 확인하지 못했습니다. 목록을 새로고침해 주세요.')
      if (activeUser.current !== savingUserId) return
      acceptArtist(data.artist)
      setNotice(data.artist.status === 'ready' ? `${data.artist.name}의 버전 ${data.artist.revision + 1}을 승인했습니다. 이제 이 가수로 곡을 만들 수 있습니다.` : coreDirty ? '변경 사항을 초안으로 저장했습니다. 음성·사진·정체성의 확인 항목을 다시 확인하고 승인하세요.' : '초안을 계정에 저장했습니다. 언제든 이어서 완성할 수 있습니다.')
    } catch (reason) {
      if (activeUser.current !== savingUserId) return
      if (!responseReceived || responseMayHaveSaved) { setSaveUncertain(true); setError('저장 요청의 결과를 확인하지 못했습니다. 목록을 새로고침해 저장된 가수를 확인한 뒤 계속해 주세요.') }
      else setError(reason instanceof Error ? reason.message : '저장하지 못했습니다.')
    } finally { requestBusy.current = false; setSaving(false) }
  }

  async function uploadPortrait(file: File) {
    if (requestBusy.current || archived || !user) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 4 * 1024 * 1024) { setError('JPEG, PNG, WebP 사진을 최대 4MB까지 업로드할 수 있습니다.'); return }
    requestBusy.current = true; setUploading(true); setError('')
    const uploadingUserId = user.id
    try {
      const data = new FormData(); data.set('file', file)
      const result = await artistResponse<{ portrait: ArtistPortrait }>(await fetch('/api/artists/portrait', { method: 'POST', body: data }))
      if (!result.portrait?.assetId) throw new Error('업로드한 사진을 확인하지 못했습니다.')
      if (activeUser.current !== uploadingUserId) return
      change({ portrait: result.portrait }, 'portrait'); setNotice('사진을 업로드했습니다. 프로필에 연결하려면 초안을 저장해 주세요.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '사진을 업로드하지 못했습니다.') }
    finally { requestBusy.current = false; setUploading(false) }
  }

  async function reloadCurrent() {
    if (!selected || !canSwitch('저장하지 않은 변경 사항이 있습니다. 변경 사항을 버리고 계정에 저장된 내용을 다시 불러올까요?')) return
    requestBusy.current = true; setSaving(true); setError('')
    try {
      const data = await artistResponse<{ artist: ArtistProfile }>(await fetch(`/api/artists/${encodeURIComponent(selected.id)}`, { cache: 'no-store' }))
      if (activeUser.current !== userId) return
      acceptArtist(data.artist); setSaveUncertain(false); setNotice('계정에 저장된 최신 내용을 불러왔습니다.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '저장된 내용을 불러오지 못했습니다.') }
    finally { requestBusy.current = false; setSaving(false) }
  }

  return <div className="mx-auto max-w-7xl pb-12 pt-3">
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold tracking-[0.15em] text-purple-300">MELODIO INCUBATOR</p><h1 className="text-3xl font-bold tracking-tight text-white">AI 가수 인큐베이터</h1><p className="mt-2 text-sm leading-relaxed text-zinc-400">가수의 기본 방향을 정하고, 보컬과 얼굴을 확인해 제작 준비를 마칩니다.</p></div><Link href="/persona" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5"><Library size={16} />내 가수 관리 · 페르소나</Link></header>
    {!authLoading && !user && <div className="mb-5 rounded-xl border border-purple-400/20 bg-purple-500/10 p-4 text-sm text-purple-200">로그인하면 프로필과 참조 사진을 계정에 비공개로 저장하고 다른 기기에서 이어서 작업할 수 있습니다. <Link href="/login" className="ml-2 underline underline-offset-4">로그인</Link></div>}
    <div className="grid items-start gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">준비 중인 가수 <span className="ml-1 text-zinc-500">{draftArtists.length}</span></h2><button type="button" disabled={listLoading || busy || !user} aria-label="아티스트 목록 새로고침" onClick={() => void loadArtists()} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 disabled:opacity-40"><RefreshCw size={15} className={listLoading ? 'animate-spin' : ''} /></button></div>
        <button type="button" disabled={busy || !user || activeArtistCount >= 30} onClick={() => chooseArtist(null)} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium disabled:opacity-40 ${!selected ? 'border-purple-400/40 bg-purple-500/10 text-purple-200' : 'border-white/10 text-zinc-300 hover:bg-white/5'}`}><Plus size={16} />새 가수</button>
        {authLoading || listLoading ? <p className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={14} className="animate-spin" />가수를 불러오는 중…</p> : listError ? <p role="alert" className="mt-4 text-xs text-rose-300">{listError}</p> : user && !visibleArtists.length ? <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">준비 중인 가수가 없습니다. 새 가수를 만들거나 페르소나에서 승인한 가수를 관리하세요.</p> : null}
        <div className="mt-3 max-h-[620px] space-y-2 overflow-y-auto">{visibleArtists.map(artist => <button type="button" key={artist.id} disabled={busy} aria-pressed={selected?.id === artist.id} onClick={() => chooseArtist(artist)} className={`flex w-full gap-3 rounded-xl border p-3 text-left disabled:opacity-60 ${selected?.id === artist.id ? 'border-purple-400/40 bg-purple-500/10' : 'border-transparent bg-white/[0.02] hover:bg-white/5'}`}><span className="relative flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-900">{artist.portrait ? <Image src={`/api/artists/portrait?assetId=${encodeURIComponent(artist.portrait.assetId)}`} alt="" fill unoptimized sizes="40px" className="object-cover" /> : <UserRound size={18} className="text-zinc-600" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{artist.name}</span><span className="mt-1 block truncate text-xs text-zinc-500">{artist.tagline || artist.voice?.name || '보컬 선택 전'}</span><span className={`mt-1.5 inline-block text-[11px] ${artist.status === 'ready' ? 'text-emerald-300' : artist.status === 'archived' ? 'text-zinc-600' : 'text-purple-300'}`}>{artist.status === 'ready' ? '제작 준비 완료' : artist.status === 'archived' ? '보관됨' : '초안'} · 버전 {artist.revision + 1}</span></span></button>)}</div>
        {artists.some(artist => artist.status === 'ready') && <label className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><input type="checkbox" checked={showApproved} onChange={event => setShowApproved(event.target.checked)} className="accent-purple-500" />승인한 가수 검토·변경</label>}
        {artists.some(artist => artist.status === 'archived') && <label className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} className="accent-purple-500" />보관한 가수 보기</label>}
      </aside>
      <main className="min-w-0">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="border-b border-white/10 px-5 py-5 sm:px-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{selected ? selected.name : '새로운 AI 가수'}</h2><p className="mt-1.5 text-xs text-zinc-500">{selected ? `${archived ? '보관된 프로필' : savedReady ? '승인된 가수' : '작성 중인 프로필'} · 버전 ${selected.revision + 1} · ${new Date(selected.updatedAt).toLocaleDateString('ko-KR')} 저장` : '아직 저장하지 않은 프로필'}</p></div>{savedReady && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300"><CheckCircle2 size={14} />제작 준비 완료</span>}{dirty && <span className="rounded-full bg-purple-500/10 px-3 py-1.5 text-xs text-purple-200">저장 전 변경 사항</span>}</div>
            {selected?.status === 'ready' && dirty && <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-200">승인한 가수를 편집 중입니다. 저장하면 초안이 되며, 변경된 내용을 확인하고 다시 승인해야 곡 제작에 사용할 수 있습니다.</p>}{archived && <p className="mt-4 rounded-xl bg-white/5 p-3 text-xs text-zinc-400">보관한 가수는 읽기 전용입니다. 프로필과 기존 음원을 확인할 수 있습니다.</p>}
          </div>
          <nav aria-label="가수 완성 단계" className="grid grid-cols-4 gap-1 border-b border-white/10 p-3 sm:px-6">{STEPS.map((item, index) => <button type="button" key={item.label} disabled={busy} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)} className={`flex flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-3 text-xs sm:flex-row sm:gap-2 ${step === index ? 'bg-purple-500/15 text-purple-200' : 'text-zinc-500 hover:bg-white/5'}`}><item.icon size={15} /><span>{index + 1}. {item.label}</span></button>)}</nav>
          <fieldset disabled={busy || archived || !user || authLoading || listLoading} className="min-w-0 px-5 py-6 disabled:opacity-70 sm:px-7"><legend className="sr-only">가수 프로필 편집</legend><h3 className="mb-5 text-lg font-semibold">{STEPS[step].title}</h3>
            {step === 0 ? <ArtistProfileFields form={form} onChange={change} /> : step === 1 ? <ArtistVoiceStep key={selected?.id || 'new'} form={form} onChange={change} savedVoiceName={selected?.voice?.name} /> : step === 2 ? <ArtistPortraitStep form={form} onChange={change} onUpload={uploadPortrait} uploading={uploading} /> : <div className="space-y-5">
              <div className="grid gap-4 rounded-xl border border-white/10 bg-black/15 p-4 sm:grid-cols-2"><div><p className="text-xs text-zinc-500">가수 이름</p><p className="mt-1 text-sm font-medium">{form.name || '이름 입력 전'}</p><p className="mt-2 text-xs text-zinc-500">{form.tagline || '한 줄 소개 입력 전'}</p></div><div><p className="text-xs text-zinc-500">보컬</p><p className="mt-1 text-sm font-medium">{voiceName || '보컬을 다시 확인해 주세요'}</p><p className="mt-2 text-xs text-zinc-500">{form.voice ? VOICE_KIND_LABELS[form.voice.kind] : '선택 전'}</p></div><div><p className="text-xs text-zinc-500">성격과 매력</p><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{form.personality || '작성 전'}</p></div><div><p className="text-xs text-zinc-500">비주얼 방향</p><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{form.visualDirection || '작성 전'}</p></div></div>
              {(form.backstory || form.speakingStyle) && <div className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:grid-cols-2">{form.backstory && <div><p className="text-xs text-zinc-500">배경 이야기와 세계관</p><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{form.backstory}</p></div>}{form.speakingStyle && <div><p className="text-xs text-zinc-500">말투와 표현 방식</p><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{form.speakingStyle}</p></div>}</div>}
              <div className="space-y-2.5">{[{ label: '보컬 선택과 확인', done: !!form.voice && form.checks.voiceAuditioned, target: 1 }, { label: '참조 사진과 비주얼 확인', done: !!form.portrait && !!form.visualDirection.trim() && form.checks.portraitReviewed, target: 2 }].map(item => <button type="button" key={item.label} onClick={() => setStep(item.target)} className="flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-left text-sm"><span className="flex items-center gap-2">{item.done ? <Check size={16} className="text-emerald-300" /> : <span className="h-4 w-4 rounded-full border border-zinc-600" />}{item.label}</span><span className={item.done ? 'text-emerald-300' : 'text-zinc-500'}>{item.done ? '확인됨' : '확인하기'} →</span></button>)}</div>
              <label className={`flex items-start gap-2.5 rounded-xl border p-4 text-sm ${form.checks.identityReviewed ? 'border-purple-400/30 bg-purple-500/10 text-purple-200' : 'border-white/10 text-zinc-400'}`}><input type="checkbox" className="mt-1 accent-purple-500" checked={form.checks.identityReviewed} disabled={!form.name.trim() || !form.personality.trim() || !form.visualDirection.trim()} onChange={event => change({ checks: { ...form.checks, identityReviewed: event.target.checked } }, 'checks')} /><span>가수 이름, 성격, 이야기와 외형을 검토했습니다. 이 프로필을 곡 제작에 사용할 정체성으로 승인합니다.</span></label>
              <p className="text-xs leading-relaxed text-zinc-500">이 가수로 곡을 생성하면 확정한 기준 이미지가 곡 커버로 사용됩니다. 기준 사진은 비공개로 저장되며, 곡 제작 시 커버 사본이 공개 이미지로 저장됩니다.</p>
              {coreDirty ? <p className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-sm text-amber-200">변경한 프로필을 먼저 초안으로 저장하세요. 저장 후 변경된 항목의 확인을 다시 체크하면 승인할 수 있습니다.</p> : missing.length ? <p className="text-xs text-zinc-500">승인까지 남은 항목 · {missing.join(' · ')}</p> : <p className="text-sm text-emerald-300">모든 확인을 마쳤습니다. 승인해 첫 곡을 만들어 보세요.</p>}
              <button type="button" onClick={() => void save('ready')} disabled={!!missing.length || coreDirty || saveUncertain || savedReady} className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 py-3.5 text-sm font-semibold text-white hover:bg-purple-400 disabled:bg-zinc-800 disabled:text-zinc-500"><CheckCircle2 size={17} />{savedReady ? '승인된 가수입니다' : '가수 승인 · 제작 준비 완료'}</button>
            </div>}
          </fieldset>
          <div className="border-t border-white/10 px-5 py-4 sm:px-7">
            {error && <p role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-500/5 p-3 text-sm text-rose-300">{error}</p>}{notice && <p role="status" className="mb-4 rounded-xl border border-purple-400/20 bg-purple-500/5 p-3 text-sm text-purple-200">{notice}</p>}
            <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy || archived || !user || !dirty || saveUncertain || listLoading} onClick={() => void save('draft')} className="inline-flex items-center gap-2 rounded-xl bg-purple-500/15 px-4 py-3 text-sm font-semibold text-purple-200 hover:bg-purple-500/25 disabled:opacity-40">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}초안 저장</button><p className="text-xs text-zinc-500">{busy ? uploading ? '사진 업로드 중' : '저장 중' : dirty ? '변경 사항이 아직 저장되지 않았습니다' : selected ? '계정에 저장됨' : '초안을 저장해 이어서 작업하세요'}</p><div className="ml-auto flex items-center gap-2">{step > 0 && <button type="button" disabled={busy} onClick={() => setStep(value => value - 1)} aria-label="이전 단계" className="rounded-xl border border-white/10 p-3 text-zinc-400"><ArrowLeft size={16} /></button>}{step < 3 && <button type="button" disabled={busy} onClick={() => setStep(value => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300">다음 <ArrowRight size={16} /></button>}</div></div>
            {selected && <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/5 pt-3"><button type="button" disabled={busy} onClick={() => void reloadCurrent()} className="text-xs text-zinc-500 hover:text-zinc-300">저장된 내용 다시 불러오기</button></div>}{saveUncertain && <button type="button" disabled={listLoading || busy} onClick={() => void loadArtists()} className="mt-3 text-sm text-purple-300 underline">저장된 가수 목록 확인</button>}
          </div>
        </section>
        {selected && <section className="mt-5 rounded-2xl border border-purple-400/15 bg-purple-500/[0.04] p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Music2 size={18} className="text-purple-300" />{savedReady ? '가수 준비를 마쳤습니다' : '검토를 마치고 가수를 승인하세요'}</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{savedReady ? '세계관과 제작곡은 페르소나에서 관리하고, 승인한 목소리로 첫 곡을 만들어 보세요.' : '저장한 보컬·얼굴·정체성을 확인한 뒤 승인하면 이 가수로 곡을 만들 수 있습니다.'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/persona?artistId=${encodeURIComponent(selected.id)}`} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${savedReady ? 'bg-purple-500 text-white hover:bg-purple-400' : 'border border-white/10 text-zinc-300 hover:bg-white/5'}`}>페르소나에서 가수 관리 ↗</Link>
            {savedReady ? <><Link href={`/style-library?artistId=${encodeURIComponent(selected.id)}`} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5">뮤직 스튜디오 ↗</Link><Link href={`/audio?artistId=${encodeURIComponent(selected.id)}`} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5">프리셋 스튜디오 ↗</Link></> : <button type="button" disabled={archived || busy} onClick={() => setStep(3)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 disabled:opacity-40">{archived ? '보관된 가수' : '승인 항목 확인'}</button>}
          </div>
        </section>}
      </main>
    </div>
  </div>
}
