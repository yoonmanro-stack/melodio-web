'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, RefreshCw, Search } from 'lucide-react'
import { useVoice } from '@/contexts/VoiceContext'
import { DISCOVERY_VOICES } from '@/data/discoveryVoices'
import { VoicePreviewPlayer } from '@/components/voice/VoicePreviewPlayer'
import { getSingingSampleUrl } from '@/lib/voice/singing-sample-url'
import { studioLanguageLabel } from '@/lib/voice/studio-selection'
import type { ArtistDraft } from './artist-form'
import { artistVoiceChoice, VOICE_KIND_LABELS, FIELD_CLASS, type ArtistVoiceChoice } from './artist-form'

const VoiceDesigner = dynamic(() => import('@/components/voice/CustomVoiceDesigner').then(module => module.CustomVoiceDesigner), { loading: () => <p className="p-6 text-sm text-zinc-400">보컬 설계 도구를 불러오는 중…</p> })

export function ArtistVoiceStep({ form, onChange, savedVoiceName }: { form: ArtistDraft; onChange: (patch: Partial<ArtistDraft>, kind?: 'voice' | 'checks') => void; savedVoiceName?: string }) {
  const { voices, refreshVoices, openCreateModal } = useVoice()
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [designerOpen, setDesignerOpen] = useState(false)
  const [heardKey, setHeardKey] = useState('')
  const [previewErrorKey, setPreviewErrorKey] = useState('')
  const audio = useRef<HTMLAudioElement>(null)
  const choices = useMemo(() => {
    const available = new Map<string, ArtistVoiceChoice>()
    for (const voice of [...DISCOVERY_VOICES, ...voices]) {
      const choice = artistVoiceChoice(voice)
      if (choice) available.set(choice.key, choice)
    }
    return [...available.values()]
  }, [voices])
  const selectedKey = form.voice ? `${form.voice.kind}:${form.voice.referenceId}` : ''
  const selected = choices.find(choice => choice.key === selectedKey)
  const sampleUrl = selected ? getSingingSampleUrl(selected.voice.audioUrl) : null
  const previewFailed = selectedKey !== '' && previewErrorKey === selectedKey
  const matching = choices.filter(choice => (kindFilter === 'all' || choice.kind === kindFilter)
    && (genderFilter === 'all' || choice.voice.gender === genderFilter)
    && (languageFilter === 'all' || studioLanguageLabel(choice.voice.language) === languageFilter)
    && `${choice.voice.name} ${choice.voice.shortDescription || ''} ${choice.voice.desc || ''} ${choice.voice.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => { refreshVoices() }, [refreshVoices])
  useEffect(() => {
    const player = audio.current
    if (!player) return
    const heard = () => { setHeardKey(selectedKey); setPreviewErrorKey('') }
    player.addEventListener('playing', heard)
    return () => { player.pause(); player.removeEventListener('playing', heard) }
  }, [selectedKey, sampleUrl])

  const canConfirm = !!selected && (selected.kind === 'custom' || (sampleUrl !== null && heardKey === selectedKey && !previewFailed) || form.checks.voiceAuditioned)
  return <div className="space-y-5">
    <p className="text-sm leading-relaxed text-zinc-400">샘플을 듣고 이 가수에게 사용할 보컬을 선택하세요. 즐겨찾기 여부와 관계없이 준비된 보컬을 모두 선택할 수 있습니다.</p>
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1"><span className="sr-only">보컬 이름과 음색 검색</span><Search size={16} className="absolute left-3 top-5 text-zinc-500" /><input className={`${FIELD_CLASS} pl-9`} placeholder="이름 또는 음색 검색" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <button type="button" onClick={refreshVoices} aria-label="저장된 보컬 새로고침" className="mt-2 rounded-xl border border-white/10 px-3 text-zinc-400 hover:bg-white/5"><RefreshCw size={16} /></button>
        </div>
        <label className="mt-3 block text-xs text-zinc-500">보컬 종류<select value={kindFilter} onChange={event => setKindFilter(event.target.value)} className={`${FIELD_CLASS} mt-1.5 py-2.5`}><option value="all">모든 보컬 ({choices.length})</option>{Object.entries(VOICE_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label} ({choices.filter(choice => choice.kind === kind).length})</option>)}</select></label>
        <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs text-zinc-500">성별<select value={genderFilter} onChange={event => setGenderFilter(event.target.value)} className={`${FIELD_CLASS} mt-1.5 py-2.5`}><option value="all">전체</option><option value="female">여성</option><option value="male">남성</option></select></label><label className="text-xs text-zinc-500">샘플 언어<select value={languageFilter} onChange={event => setLanguageFilter(event.target.value)} className={`${FIELD_CLASS} mt-1.5 py-2.5`}><option value="all">전체 언어</option>{[...new Set(choices.map(choice => studioLanguageLabel(choice.voice.language)))].sort().map(language => <option key={language} value={language}>{language}</option>)}</select></label></div>
        <p className="mt-3 text-xs text-zinc-500">{matching.length}개의 보컬</p>
        <div className="mt-3 max-h-[390px] space-y-2 overflow-y-auto pr-1" aria-label="사용 가능한 보컬">
          {matching.map(choice => <button key={choice.key} type="button" aria-pressed={selectedKey === choice.key} onClick={() => {
            if (selectedKey === choice.key) return
            audio.current?.pause()
            setHeardKey(''); setPreviewErrorKey('')
            onChange({ voice: { kind: choice.kind, referenceId: choice.referenceId } }, 'voice')
          }} className={`w-full rounded-xl border p-3.5 text-left transition-colors ${selectedKey === choice.key ? 'border-purple-400/60 bg-purple-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`}>
            <span className="block text-sm font-semibold text-zinc-100">{choice.voice.name}</span>
            <span className="mt-1 block text-xs text-zinc-500">{VOICE_KIND_LABELS[choice.kind]} · {studioLanguageLabel(choice.voice.language)} · {choice.voice.gender === 'female' ? '여성' : '남성'}</span>
            <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-zinc-400">{choice.voice.shortDescription || choice.voice.desc}</span>
          </button>)}
          {!matching.length && <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">조건에 맞는 보컬이 없습니다. 검색 조건을 바꾸거나 새 보컬을 저장하세요.</p>}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        {selected ? <>
          <p className="text-xs font-medium text-purple-300">선택한 보컬 · {VOICE_KIND_LABELS[selected.kind]}</p>
          <h3 className="mt-2 text-xl font-semibold">{selected.voice.name}</h3>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{selected.voice.desc}</p>
          <p className="mt-3 text-xs text-zinc-500">{selected.voice.tags.slice(0, 4).join(' · ')}</p>
          {sampleUrl ? <VoicePreviewPlayer key={selectedKey} audioRef={audio} src={sampleUrl} limitSeconds={selected.voice.sampleDurationSeconds || 30} className="mt-5" onError={() => { setPreviewErrorKey(selectedKey); setHeardKey('') }} /> : <p className="mt-5 rounded-xl bg-white/5 p-3 text-sm leading-relaxed text-zinc-400">{selected.kind === 'custom' ? '등록 목소리 · 본인 확인 완료. 가창 미리듣기는 이 가수로 곡을 제작한 뒤 확인할 수 있습니다.' : '현재 가창 샘플을 불러올 수 없습니다. 보컬 목록을 새로고침하거나 다른 보컬을 선택해 주세요.'}</p>}
          {previewFailed && <p role="alert" className="mt-2 text-xs text-rose-300">샘플 재생에 실패했습니다. 다시 재생해 확인해 주세요.</p>}
          <label className={`mt-5 flex items-start gap-2.5 rounded-xl border p-3.5 text-sm leading-relaxed ${form.checks.voiceAuditioned ? 'border-purple-400/30 bg-purple-500/10 text-purple-200' : 'border-white/10 text-zinc-400'}`}>
            <input type="checkbox" className="mt-1 accent-purple-500" disabled={!canConfirm} checked={form.checks.voiceAuditioned} onChange={event => onChange({ checks: { ...form.checks, voiceAuditioned: event.target.checked } }, 'checks')} />
            <span>{selected.kind === 'custom' ? '본인 확인을 마친 등록 목소리의 연결을 확인했습니다. 실제 가창은 곡 제작 후 확인하겠습니다.' : '샘플을 듣고 이 가수의 보컬로 확인했습니다.'}</span>
          </label>
          {selected.kind !== 'custom' && !canConfirm && <p className="mt-2 text-xs text-zinc-500">샘플을 재생하면 보컬 확인을 체크할 수 있습니다.</p>}
          <p className="mt-4 text-xs leading-relaxed text-zinc-500">보컬 참조의 음색과 창법을 사용합니다. 곡과 음역에 따라 표현이 달라질 수 있습니다.</p>
        </> : <><h3 className="font-semibold">{savedVoiceName || '가수의 목소리를 골라주세요'}</h3><p className="mt-3 text-sm leading-relaxed text-zinc-500">{form.voice ? '저장한 보컬의 현재 상태를 불러오는 중입니다. 목록 새로고침 후에도 나타나지 않으면 사용 가능한 보컬을 다시 선택해 주세요.' : '왼쪽 목록에서 보컬을 선택하면 샘플과 특징을 확인할 수 있습니다.'}</p></>}
      </div>
    </div>
    <div className="rounded-xl border border-white/10">
      <button type="button" aria-expanded={designerOpen} onClick={() => setDesignerOpen(value => !value)} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left text-sm"><span>새로운 보컬이 필요하다면 · 음색 설계</span><ChevronDown size={16} className={`text-zinc-500 transition-transform ${designerOpen ? 'rotate-180' : ''}`} /></button>
      {designerOpen && <div className="border-t border-white/10 p-3 sm:p-5"><VoiceDesigner /></div>}
    </div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"><button type="button" onClick={openCreateModal} className="text-purple-300 hover:text-purple-200">본인 목소리 녹음·업로드 등록 ↗</button><Link href="/voice-lab" className="text-zinc-400 hover:text-zinc-200">보컬 라이브러리 열기 ↗</Link></div>
  </div>
}
