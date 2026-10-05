'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVoice, type VoiceItem } from '@/contexts/VoiceContext'
import { VoicePreviewPlayer } from './VoicePreviewPlayer'
import { getSingingSampleUrl } from '@/lib/voice/singing-sample-url'
import { matchesStudioVoice, studioLanguageLabel } from '@/lib/voice/studio-selection'

function voiceLabel(voice: VoiceItem) {
  return voice.shortDescription ? `${voice.name} · ${voice.shortDescription}` : voice.name
}

/** Shared selection surface for all three music studios. */
export function StudioVoicePicker({ language }: { language?: string }) {
  const { voices, activeVoice, setActiveVoice, studioGender, toggleFavorite, refreshVoices } = useVoice()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'default' | 'mine'>('default')
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const audio = useRef<HTMLAudioElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const enabled = studioGender === 'female' || studioGender === 'male'
  const selected = matchesStudioVoice(studioGender, activeVoice, language) ? activeVoice : null
  const eligibleVoices = voices.filter(v => matchesStudioVoice(studioGender, v, language))
  const candidate = eligibleVoices.find(v => v.id === candidateId)
  const candidateSampleUrl = candidate && (!candidate.discoveryVoiceId || candidate.previewStatus === 'ready')
    ? getSingingSampleUrl(candidate.audioUrl) : null
  const defaultCount = eligibleVoices.filter(v => v.sourceType === 'default').length
  const mineCount = eligibleVoices.length - defaultCount
  const choices = eligibleVoices.filter(v => (tab === 'default' ? v.sourceType === 'default' : v.sourceType !== 'default')
    && (!favoritesOnly || v.isFavorite)
    && `${v.name} ${v.shortDescription || ''} ${v.desc || ''} ${v.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  function chooseCandidate(id: string | null) {
    audio.current?.pause()
    setError('')
    setCandidateId(id)
  }
  function close() { audio.current?.pause(); setOpen(false); trigger.current?.focus() }

  return <section className="rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-4 text-zinc-200">
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-cyan-300">보컬 음색 스타일</p>
        <p className="mt-1 text-base font-semibold">{enabled ? selected ? voiceLabel(selected) : '곡에 맞는 기본 음색' : '개별 음색 미적용'}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{enabled ? selected?.desc || `${studioLanguageLabel(language)} · ${studioGender === 'female' ? '여성' : '남성'} 설정에 맞는 보컬을 선택하세요.` : '여성 또는 남성 보컬을 선택하면 목소리를 지정할 수 있습니다.'}</p>
        {enabled && activeVoice && !selected && <p className="mt-2 text-xs text-amber-200">이전 목소리는 현재 언어·성별과 달라 적용되지 않습니다.</p>}
        {selected && <p className="mt-2 text-xs text-cyan-200">{selected.officialVoiceId || selected.discoveryVoiceId || selected.designedVoiceId ? '샘플 기반 음색 참조' : selected.customVoiceId ? '등록 목소리 연결' : '음색 특성 적용'} · 선택은 이 브라우저에 저장됩니다</p>}
      </div>
      <button ref={trigger} type="button" disabled={!enabled} onClick={() => { refreshVoices(); chooseCandidate(selected?.id || null); setTab(selected && selected.sourceType !== 'default' ? 'mine' : 'default'); setOpen(true) }} className="shrink-0 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black disabled:bg-zinc-800 disabled:text-zinc-500">목소리 선택</button>
    </div>
    {open && createPortal(<dialog ref={dialog} aria-labelledby="studio-voice-title" onCancel={e => { e.preventDefault(); close() }} className="fixed inset-0 m-auto w-[min(960px,96vw)] max-h-[92dvh] rounded-2xl border border-white/15 bg-[#141416] p-0 text-zinc-100 shadow-2xl backdrop:bg-black/75">
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex items-start justify-between border-b border-white/10 p-5">
          <div><h2 id="studio-voice-title" className="text-xl font-bold">다시 듣고 싶은 목소리</h2><p className="mt-1 text-sm text-zinc-400">{studioLanguageLabel(language)} · {studioGender === 'female' ? '여성' : '남성'} 보컬</p><p className="mt-1 text-xs text-zinc-500">선택한 가사 언어에 맞는 샘플·음색 설정입니다.</p></div>
          <button type="button" aria-label="닫기" onClick={close} className="rounded-lg px-3 py-2 hover:bg-white/10">✕</button>
        </header>
        <div className="flex flex-wrap items-center gap-2 p-4">
          <button type="button" aria-pressed={tab === 'default'} onClick={() => setTab('default')} className={`rounded-lg px-4 py-2 ${tab === 'default' ? 'bg-cyan-500 text-black' : 'bg-white/5'}`}>멜로디오 보컬 <span className="text-xs">{defaultCount}</span></button>
          <button type="button" aria-pressed={tab === 'mine'} onClick={() => setTab('mine')} className={`rounded-lg px-4 py-2 ${tab === 'mine' ? 'bg-cyan-500 text-black' : 'bg-white/5'}`}>내 보컬 · 즐겨찾기 <span className="text-xs">{mineCount}</span></button>
          <Link href="/voice-lab" onClick={close} className="ml-auto text-sm text-cyan-300">새 보컬 만들기 ↗</Link>
          <input aria-label="보컬 검색" placeholder="이름, 음색 특징 검색" value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} />즐겨찾기만</label>
        </div>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_1fr]">
          <div className="space-y-2 p-4 pt-0">
            {!choices.length && <p className="p-5 text-sm leading-relaxed text-zinc-400">{query || favoritesOnly ? '검색·즐겨찾기 조건에 맞는 보컬이 없습니다.' : tab === 'default' ? `${studioLanguageLabel(language)} ${studioGender === 'female' ? '여성' : '남성'} 기본 보컬은 아직 준비되지 않았습니다. 기본 음색으로 작곡하거나 내 보컬을 선택할 수 있습니다.` : '현재 언어·성별에 맞는 내 보컬 또는 즐겨찾기가 없습니다.'}</p>}
            {choices.map(v => <div key={v.id} className={`flex rounded-xl border ${candidateId === v.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10'}`}>
              <button type="button" aria-pressed={candidateId === v.id} onClick={() => chooseCandidate(v.id)} className="min-w-0 flex-1 p-4 text-left"><span className="font-semibold">{voiceLabel(v)}</span><span className="mt-1 block text-xs text-zinc-400">{studioLanguageLabel(v.language)} · {v.gender === 'female' ? '여성' : '남성'} · {getSingingSampleUrl(v.audioUrl) ? '가창 샘플' : '음색 설정'}</span><span className="mt-1 block text-sm leading-relaxed text-zinc-400">{v.desc}</span><span className="mt-2 block text-xs text-cyan-200">{v.tags.slice(0, 3).join(' · ')}</span></button>
              <button type="button" aria-label={`${v.name} 즐겨찾기`} aria-pressed={!!v.isFavorite} onClick={() => toggleFavorite(v.id)} className="px-3 text-amber-300">{v.isFavorite ? '★' : '☆'}</button>
            </div>)}
          </div>
          <aside className="border-t border-white/10 bg-black/20 p-5 md:border-l md:border-t-0">
            {candidate ? <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-cyan-300">{candidate.officialVoiceId || candidate.discoveryVoiceId || candidate.designedVoiceId ? '샘플 기반 음색 참조' : candidate.customVoiceId ? '등록 목소리' : candidate.sourceType === 'default' ? '음색 설계 v2 · 청취 검증 전' : '음색 스타일'}</p>
                {candidate.officialVoiceId && candidate.reviewStatus && <span className={`rounded-full px-2 py-1 text-xs font-semibold ${candidate.reviewStatus === 'selected' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{candidate.reviewStatus === 'selected' ? '선택 완료' : '시험 공개'}</span>}
              </div>
              <h3 className="mt-2 text-2xl font-bold">{voiceLabel(candidate)}</h3>
              <p className="mt-3 leading-relaxed text-zinc-300">{candidate.desc}</p>
              <p className="mt-4 text-sm text-zinc-400">{candidate.tags.join(' · ')}</p>
              {candidateSampleUrl ? <div className="mt-6"><p className="mb-2 text-xs text-zinc-400">{candidate.sampleDurationSeconds === 30 || candidate.discoveryVoiceId || candidate.designedVoiceId ? '30초 가창 참조' : candidate.officialVoiceId ? '음색 참조 샘플' : '기존 참고 샘플'} · 생성 결과는 곡에 따라 달라집니다</p><VoicePreviewPlayer key={candidate.id} audioRef={audio} src={candidateSampleUrl} limitSeconds={candidate.sampleDurationSeconds} onError={() => setError('샘플을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.')} /></div> : <p className="mt-6 rounded-xl bg-white/5 p-4 text-sm text-zinc-400">가창 샘플 없음 · 음색 설정만 적용</p>}
              {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
              <p className="mt-5 text-xs leading-relaxed text-zinc-500">{candidate.officialVoiceId || candidate.discoveryVoiceId || candidate.designedVoiceId ? '샘플의 음색과 창법을 참조합니다. 곡과 음역에 따라 표현이 달라지며, 동일 가수의 목소리를 보장하지 않습니다.' : candidate.customVoiceId ? '등록한 목소리를 기준으로 생성합니다. 곡과 음역에 따라 표현이 달라질 수 있습니다.' : '음색과 창법의 특성을 적용합니다. 동일 가수의 목소리를 보장하는 기능은 아닙니다.'}</p>
            </> : <p className="text-zinc-400">목록에서 보컬을 선택해 특징과 샘플을 확인하세요.</p>}
          </aside>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-white/10 p-4">
          <button type="button" onClick={() => { setActiveVoice(null); close() }} className="rounded-xl bg-white/5 px-4 py-3 text-sm">기본 음색 사용</button>
          <button type="button" disabled={!candidate || (!!candidate.discoveryVoiceId && (candidate.previewStatus !== 'ready' || candidate.reuseStatus !== 'ready'))} onClick={() => { if (candidate) setActiveVoice(candidate); close() }} className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-black disabled:opacity-40">이 목소리 적용</button>
        </footer>
      </div>
    </dialog>, document.body)}
  </section>
}
