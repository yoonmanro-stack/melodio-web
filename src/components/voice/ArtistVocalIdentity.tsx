'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useVoice } from '@/contexts/VoiceContext'
import { VoicePreviewPlayer } from './VoicePreviewPlayer'

type Binding = { name: string; voiceId: string; updatedAt: string }
const BINDINGS_CHANGED = 'melodio-artist-vocal-bindings-changed'
const serverSnapshot = () => '[]'

/** An artist selects a saved reference; provider credentials never enter the profile. */
export function ArtistVocalIdentity({ artistName }: { artistName: string }) {
  const { user } = useAuth()
  const { voices, setActiveVoice, setStudioGender, refreshVoices } = useVoice()
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('')
  const key = user ? `melodio_artist_vocal_bindings_v1:${user.id}` : null
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener('storage', onChange)
    window.addEventListener(BINDINGS_CHANGED, onChange)
    return () => { window.removeEventListener('storage', onChange); window.removeEventListener(BINDINGS_CHANGED, onChange) }
  }, [])
  const getSnapshot = useCallback(() => {
    if (!key) return '[]'
    try { return localStorage.getItem(key) || '[]' } catch { return '[]' }
  }, [key])
  const storedBindings = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot)
  const bindings = useMemo<Binding[]>(() => {
    try {
      const stored = JSON.parse(storedBindings)
      return Array.isArray(stored) ? stored.filter(row => row && typeof row.name === 'string' && typeof row.voiceId === 'string') : []
    } catch { return [] }
  }, [storedBindings])
  const choices = voices.filter(voice => voice.designedVoiceId || voice.customVoiceId || (voice.discoveryVoiceId && voice.isFavorite && voice.reuseStatus === 'ready'))
  const selected = choices.find(voice => voice.id === selectedId)

  useEffect(() => { refreshVoices() }, [refreshVoices])

  function bindVoice() {
    if (!key || !selected || !artistName.trim()) return
    const next = [{ name: artistName.trim(), voiceId: selected.id, updatedAt: new Date().toISOString() }, ...bindings.filter(row => row.name !== artistName.trim())]
    try { localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event(BINDINGS_CHANGED)) }
    catch { setNotice('보컬 지정을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'); return }
    setActiveVoice(selected)
    if (selected.gender === 'female' || selected.gender === 'male') setStudioGender(selected.gender)
    setNotice(`${artistName.trim()}의 보컬 참조로 ${selected.name}을 지정했습니다.`)
  }

  return <section className="rounded-2xl border border-cyan-500/20 bg-cyan-950/10 p-5 text-zinc-200">
    <h2 className="text-lg font-semibold">AI 가수의 보컬 참조</h2>
    <p className="mt-2 text-sm leading-relaxed text-zinc-400">저장한 커스텀 음색, 등록 목소리 또는 탐색에서 즐겨찾기한 보컬을 지정하세요. 같은 참조를 다음 곡에도 사용합니다.</p>
    <label className="mt-4 block text-sm">저장된 보컬
      <select value={selectedId} onChange={event => { setSelectedId(event.target.value); setNotice('') }} className="mt-2 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-3 text-sm">
        <option value="">보컬을 선택하세요</option>
        {choices.map(voice => <option key={voice.id} value={voice.id}>{voice.name} · {voice.gender === 'female' ? '여성' : '남성'} · {voice.customVoiceId ? '등록 목소리' : '가창 샘플 참조'}</option>)}
      </select>
    </label>
    {selected && <div className="mt-3 rounded-xl bg-black/20 p-4">
      <p className="font-medium">{selected.name}</p><p className="mt-1 text-sm text-zinc-400">{selected.desc}</p>
      {selected.audioUrl && <VoicePreviewPlayer key={selected.id} src={selected.audioUrl} limitSeconds={30} className="mt-3" />}
      <p className="mt-3 break-all text-xs text-zinc-500">음색 참조 ID · {selected.designedVoiceId || selected.discoveryVoiceId || selected.customVoiceId}</p>
    </div>}
    <button type="button" disabled={!user || !selected || !artistName.trim()} onClick={bindVoice} className="mt-4 w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-black disabled:bg-zinc-800 disabled:text-zinc-500">이 가수의 보컬로 지정</button>
    <p className="mt-2 text-xs leading-relaxed text-zinc-500">가수 이름을 입력한 뒤 지정하세요. 가수와 보컬의 연결은 이 브라우저에 저장됩니다. 가창 샘플 참조는 곡과 음역에 따라 달라질 수 있습니다.</p>
    {!choices.length && <p className="mt-3 text-sm text-zinc-400">위에서 새 음색을 만들어 저장하거나 <Link href="/voice-lab" className="text-cyan-300 underline">보컬 음색 탐색</Link>에서 즐겨찾기해 주세요.</p>}
    {notice && <p role="status" className="mt-3 text-sm text-cyan-200">{notice}</p>}
    {!!bindings.length && <div className="mt-5 border-t border-white/10 pt-4"><p className="text-sm font-medium">지정한 가수</p>{bindings.map(binding => {
      const voice = choices.find(row => row.id === binding.voiceId)
      return <button type="button" key={binding.name} disabled={!voice} onClick={() => { if (!voice) return; setSelectedId(voice.id); setActiveVoice(voice); if (voice.gender === 'female' || voice.gender === 'male') setStudioGender(voice.gender); setNotice(`${binding.name} · ${voice.name} 참조를 선택했습니다.`) }} className="mt-2 block w-full rounded-lg bg-white/5 p-3 text-left text-sm disabled:text-zinc-600">{binding.name} · {voice?.name || '보컬을 불러오는 중'}</button>
    })}</div>}
  </section>
}
