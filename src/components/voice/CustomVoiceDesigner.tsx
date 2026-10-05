'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useVoice, type VoiceItem } from '@/contexts/VoiceContext'
import { createClient } from '@/lib/supabase/client'
import { VOICE_DESIGN_TRAITS, compileVoiceDesign, type VoiceDesignInput } from '@/lib/voice/voice-design-prompt'
import { DISCOVERY_PREVIEW_SECONDS, discoveryPreviewPosition, discoveryPreviewWindow } from '@/lib/voice/discovery-preview'

type CompiledDesign = ReturnType<typeof compileVoiceDesign>
type PendingDesign = { id: string; userId: string; profile: CompiledDesign | null }
type DesignResult = { id: string; profile: CompiledDesign | null; audioA: string; audioB: string | null; siblingId: string | null }
type PendingSave = { generationId: string; version: 'A' | 'B'; userId: string }
type Submission = { requestId: string; startedAt: number; state: 'submitting' | 'uncertain' }
type SaveResponse = { status?: 'ready' | 'submitting' | 'held'; voice?: VoiceItem & { status?: string }; error?: string; code?: string; message?: string }
type GenerationRow = { id?: string; user_id?: string; status?: string; audio_url?: string; metadata?: unknown; license_hash?: string; created_at?: string; title?: string }
type RecoveryChoice = { id: string; title: string; createdAt: string }

const GROUPS = [
  { id: 'register', label: '음역' }, { id: 'body', label: '울림의 무게' },
  { id: 'texture', label: '목소리의 결' }, { id: 'resonance', label: '공명' },
  { id: 'delivery', label: '부르는 방식' }, { id: 'emotion', label: '감정' },
  { id: 'articulation', label: '발음' }, { id: 'vibrato', label: '끝음과 떨림' },
] as const
const LANGUAGE_LABELS = { en: 'English', ko: '한국어', ja: '日本語', fr: 'Français' } as const
const AGE_LABELS = { '20s': '20대', '30s': '30대', '40s': '40대', '50plus': '50대 이상' } as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const POLL_LIMIT_MS = 15 * 60 * 1000
const pendingKey = (userId: string) => `melodio_voice_design_pending:${userId}`
const submissionKey = (userId: string) => `melodio_voice_design_submission:${userId}`
const REQUEST_CHANGED = 'melodio-voice-design-request-changed'
const saveKey = (userId: string, version: 'A' | 'B') => `melodio_voice_design_save:${userId}:${version}`

function readSubmission(userId: string): Submission | null {
  const raw = localStorage.getItem(submissionKey(userId))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Submission
    if (UUID.test(value.requestId) && Number.isFinite(value.startedAt) && value.startedAt > 0
      && (value.state === 'submitting' || value.state === 'uncertain')) return value
  } catch {}
  // An unreadable receipt must not unlock another potentially paid request.
  return { requestId: 'unknown', startedAt: 0, state: 'uncertain' }
}

function notifyRequestChanged() { window.dispatchEvent(new Event(REQUEST_CHANGED)) }

function beginSubmission(userId: string): Submission {
  if (readSubmission(userId)) throw new Error('이전 생성 요청의 접수 여부를 먼저 확인해 주세요.')
  const receipt: Submission = { requestId: crypto.randomUUID(), startedAt: Date.now(), state: 'submitting' }
  const raw = JSON.stringify(receipt)
  localStorage.setItem(submissionKey(userId), raw)
  if (localStorage.getItem(submissionKey(userId)) !== raw) throw new Error('진행 상태를 저장하지 못했습니다. 생성 요청을 보내지 않았습니다.')
  notifyRequestChanged()
  return receipt
}

function acceptSubmission(userId: string, receipt: Submission, generationId: string) {
  if (!UUID.test(generationId)) throw new Error('생성 요청의 접수 번호를 확인하지 못했습니다.')
  if (readSubmission(userId)?.requestId !== receipt.requestId) throw new Error('다른 화면에서 진행 상태가 바뀌었습니다. 기존 요청을 다시 확인해 주세요.')
  // Write the accepted ID before releasing the duplicate-request guard.
  localStorage.setItem(pendingKey(userId), generationId)
  if (localStorage.getItem(pendingKey(userId)) !== generationId) throw new Error('접수 번호를 저장하지 못했습니다.')
  localStorage.removeItem(submissionKey(userId))
  notifyRequestChanged()
}

async function submitDesign(userId: string, profile: CompiledDesign, receipt: Submission) {
  try {
    // This request outlives a component unmount so a late receipt can still be saved.
    const response = await fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ voiceDesign: { gender: profile.gender, age: profile.age, language: profile.language, traits: profile.traits }, engine: 'suno_v5', sunoVersion: 'V6', isPublic: false, metadata: { durationSeconds: 45 }, sourceMenu: 'voice-discovery-design', isInstrumental: false }),
    })
    const data = await response.json().catch(() => ({})) as { error?: string; track?: { id?: string } }
    const id = data.track?.id
    if (!id || !UUID.test(id)) throw new Error(data.error || '생성 요청의 접수 여부를 확인하지 못했습니다. 기존 요청을 찾아 확인해 주세요.')
    acceptSubmission(userId, receipt, id)
    return id
  } catch (reason) {
    try {
      if (readSubmission(userId)?.requestId === receipt.requestId) {
        localStorage.setItem(submissionKey(userId), JSON.stringify({ ...receipt, state: 'uncertain' }))
        notifyRequestChanged()
      }
    } catch { /* The pre-request marker stays in place if storage becomes unavailable. */ }
    throw reason
  }
}

function readPendingSave(userId: string): PendingSave | null {
  try {
    for (const version of ['A', 'B'] as const) {
      const generationId = localStorage.getItem(saveKey(userId, version))
      if (generationId && UUID.test(generationId)) return { generationId, version, userId }
    }
  } catch {}
  return null
}

function clearPendingSave(value: PendingSave) {
  try { if (localStorage.getItem(saveKey(value.userId, value.version)) === value.generationId) localStorage.removeItem(saveKey(value.userId, value.version)) } catch {}
}

function readPending(userId: string) {
  try { const id = localStorage.getItem(pendingKey(userId)); return id && UUID.test(id) ? id : null } catch { return null }
}

function clearPending(userId: string, id: string) {
  try { if (localStorage.getItem(pendingKey(userId)) === id) localStorage.removeItem(pendingKey(userId)) } catch {}
}

function tryCompile(input: unknown) {
  try { return compileVoiceDesign(input) } catch { return null }
}

function restoredDesign(row: GenerationRow) {
  let metadata = row.metadata
  if (row.license_hash) {
    try { metadata = JSON.parse(row.license_hash) } catch {}
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  return tryCompile((metadata as Record<string, unknown>).voiceDesign)
}

function designDescription(profile: CompiledDesign) {
  const labels = VOICE_DESIGN_TRAITS.filter(trait => profile.traits.includes(trait.id)).map(trait => trait.label)
  return `${LANGUAGE_LABELS[profile.language]} · ${profile.gender === 'female' ? '여성' : '남성'} · ${AGE_LABELS[profile.age]} · ${labels.join(', ')}`
}

function stopOtherVoicePreviews(current: HTMLAudioElement) {
  document.querySelectorAll<HTMLAudioElement>('audio[data-voice-preview]').forEach(audio => {
    if (audio !== current) audio.pause()
  })
}

function DesignSamplePlayer({ url, version, onValidityChange }: { url: string; version: 'A' | 'B'; onValidityChange: (valid: boolean) => void }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const frameRef = useRef<number | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()
    }
  }, [])

  function pause() {
    audioRef.current?.pause()
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    setPlaying(false)
  }

  function watchEnd() {
    const audio = audioRef.current
    if (!audio || audio.paused) return
    if (audio.currentTime >= DISCOVERY_PREVIEW_SECONDS) { pause(); setElapsed(DISCOVERY_PREVIEW_SECONDS); return }
    frameRef.current = requestAnimationFrame(watchEnd)
  }

  async function togglePlay() {
    const audio = audioRef.current
    if (!audio || !ready) return
    if (playing) { pause(); return }
    setError('')
    stopOtherVoicePreviews(audio)
    if (audio.currentTime >= DISCOVERY_PREVIEW_SECONDS) audio.currentTime = 0
    audio.playbackRate = 1
    try { await audio.play(); if (!audio.paused) { setPlaying(true); watchEnd() } }
    catch { pause(); setError('샘플을 재생하지 못했습니다. 다시 재생해 주세요.') }
  }

  return <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">샘플 {version} · 가창 30초</p><button type="button" disabled={!ready} onClick={() => void togglePlay()} className="min-h-10 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40">{!ready ? '불러오는 중…' : playing ? '일시 정지' : elapsed >= 30 ? '다시 듣기' : '듣기'}</button></div>
    <label className="flex items-center gap-3 text-xs text-zinc-400"><span className="sr-only">샘플 {version} 재생 위치</span><span className="font-mono">0:{Math.floor(elapsed).toString().padStart(2, '0')}</span><input type="range" min={0} max={30} step={0.1} value={elapsed} disabled={!ready} onChange={event => { const seconds = discoveryPreviewPosition(Number(event.target.value)); if (audioRef.current) audioRef.current.currentTime = seconds; setElapsed(seconds); if (seconds === 30) pause() }} className="min-w-0 flex-1 accent-cyan-400" /><span className="font-mono">0:30</span></label>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <audio data-voice-preview ref={audioRef} src={url} preload="metadata" onLoadedMetadata={event => {
      const valid = !!discoveryPreviewWindow(event.currentTarget.duration)
      setReady(valid)
      onValidityChange(valid)
      if (!valid) setError('30초 가창 구간을 확인하지 못했습니다. 다른 샘플을 선택해 주세요.')
    }} onTimeUpdate={event => { setElapsed(discoveryPreviewPosition(event.currentTarget.currentTime)); if (event.currentTarget.currentTime >= 30) pause() }} onPause={pause} onEnded={() => {
      pause()
      if ((audioRef.current?.currentTime || 0) < 29.9) { onValidityChange(false); setError('샘플이 30초 전에 종료되었습니다.') }
    }} onError={() => { pause(); setReady(false); onValidityChange(false); setError('샘플을 불러오지 못했습니다. 다른 샘플을 선택하거나 다시 확인해 주세요.') }} />
  </div>
}

export function CustomVoiceDesigner() {
  const { syncDesignedVoice } = useVoice()
  const [draft, setDraft] = useState<VoiceDesignInput>({ gender: 'female', age: '30s', language: 'ko', traits: [] })
  const [name, setName] = useState('')
  const [built, setBuilt] = useState<CompiledDesign | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [pending, setPending] = useState<PendingDesign | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [recoveryChoices, setRecoveryChoices] = useState<RecoveryChoice[]>([])
  const [recovering, setRecovering] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [held, setHeld] = useState(false)
  const [pollRevision, setPollRevision] = useState(0)
  const [result, setResult] = useState<DesignResult | null>(null)
  const [version, setVersion] = useState<'A' | 'B'>('A')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null)
  const [saveSubmitting, setSaveSubmitting] = useState(false)
  const [saveHeld, setSaveHeld] = useState(false)
  const [saveRevision, setSaveRevision] = useState(0)
  const [validatedSamples, setValidatedSamples] = useState<Record<string, boolean>>({})
  const submitRef = useRef<string | null>(null)
  const activeUserRef = useRef<string | null>(null)
  const recoveryRef = useRef<AbortController | null>(null)
  const saveRequestRef = useRef<AbortController | null>(null)
  const syncDesignedRef = useRef(syncDesignedVoice)
  const editedRef = useRef(false)
  const restoredRef = useRef<string | null>(null)
  const draftProfile = tryCompile(draft)
  const builtMatchesDraft = !!built && built.designCode === draftProfile?.designCode
  const resultMatchesDraft = !!result?.profile && result.profile.designCode === draftProfile?.designCode
  const selectedUrl = result ? version === 'A' ? result.audioA : result.audioB : null
  const selectedGenerationId = result ? version === 'A' ? result.id : result.siblingId : null
  const selectedSampleReady = !!selectedGenerationId && !!validatedSamples[selectedGenerationId]

  useEffect(() => { syncDesignedRef.current = syncDesignedVoice }, [syncDesignedVoice])

  useEffect(() => {
    const client = createClient()
    let cancelled = false
    let lastUserId: string | null | undefined
    const acceptUser = (nextId: string | null) => {
      if (cancelled || nextId === lastUserId) return
      lastUserId = nextId
      submitRef.current = null
      activeUserRef.current = nextId
      recoveryRef.current?.abort()
      saveRequestRef.current?.abort()
      saveRequestRef.current = null
      setSubmitting(false)
      setSaveSubmitting(false)
      setUserId(nextId)
      setAuthReady(true)
      setResult(null)
      setRecoveryChoices([])
      setRecovering(false)
      setHeld(false)
      setError('')
      let receipt: Submission | null = null
      try { receipt = nextId ? readSubmission(nextId) : null } catch { setError('브라우저에서 진행 상태를 읽지 못했습니다.') }
      setSubmission(receipt)
      const id = nextId && !receipt ? readPending(nextId) : null
      setPending(id && nextId ? { id, userId: nextId, profile: null } : null)
      setPendingSave(nextId ? readPendingSave(nextId) : null)
    }
    void client.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => acceptUser(data.user?.id || null)).catch(() => acceptUser(null))
    const { data } = client.auth.onAuthStateChange((_event: string, session: { user: { id: string } } | null) => acceptUser(session?.user.id || null))
    return () => { cancelled = true; activeUserRef.current = null; data.subscription.unsubscribe(); recoveryRef.current?.abort(); saveRequestRef.current?.abort() }
  }, [])

  useEffect(() => {
    if (!userId) return
    // A request from a previous mount (or another tab) may finish after navigation.
    const restoreReceipt = () => {
      try {
        const receipt = readSubmission(userId)
        setSubmission(receipt)
        if (receipt) { setPending(null); return }
        const id = readPending(userId)
        if (id) setPending(previous => previous?.id === id ? previous : { id, userId, profile: null })
      } catch { setError('브라우저에서 진행 상태를 읽지 못했습니다. 새 요청을 보내기 전에 기존 요청을 확인해 주세요.') }
    }
    window.addEventListener(REQUEST_CHANGED, restoreReceipt)
    window.addEventListener('storage', restoreReceipt)
    return () => { window.removeEventListener(REQUEST_CHANGED, restoreReceipt); window.removeEventListener('storage', restoreReceipt) }
  }, [userId])

  useEffect(() => {
    if (!pending || pending.userId !== userId) return
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (Date.now() - startedAt >= POLL_LIMIT_MS) {
        setHeld(true)
        setError('아직 생성 결과를 확인하지 못했습니다. 기존 요청의 상태를 다시 확인해 주세요. 새 생성 요청은 보내지 않습니다.')
        return
      }
      try {
        const response = await fetch(`/api/generations?id=${encodeURIComponent(pending.id)}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) {
          if (response.status === 401 || response.status === 403 || response.status === 404) {
            setHeld(true)
            setError('이 계정에서 생성 요청을 확인할 수 없습니다. 로그인 상태를 확인한 뒤 다시 확인해 주세요.')
            return
          }
          throw new Error('상태 확인이 지연되고 있습니다. 기존 요청을 계속 확인합니다.')
        }
        const data = await response.json() as { generation?: GenerationRow; sibling?: GenerationRow }
        if (controller.signal.aborted) return
        const row = data.generation
        if (!row || row.id !== pending.id || row.user_id !== pending.userId) {
          setHeld(true)
          setError('본인 계정의 생성 요청인지 확인하지 못했습니다. 로그인 상태를 확인해 주세요.')
          return
        }
        const profile = restoredDesign(row) || pending.profile
        if (profile && restoredRef.current !== pending.id) {
          restoredRef.current = pending.id
          if (!editedRef.current) { setDraft(profile); setBuilt(profile); setName(previous => previous || profile.title) }
        }
        if (row.status === 'failed') {
          clearPending(pending.userId, pending.id)
          setPending(null)
          setError('가창 샘플 생성에 실패했습니다. 설정을 확인한 뒤 새로 생성할 수 있습니다.')
          return
        }
        if (row.status === 'completed' && row.audio_url) {
          const sibling = data.sibling
          const readySibling = sibling?.user_id === pending.userId && sibling.status === 'completed' && sibling.audio_url && sibling.id && UUID.test(sibling.id) ? sibling : null
          setResult({ id: pending.id, profile, audioA: row.audio_url, audioB: readySibling?.audio_url || null, siblingId: readySibling?.id || null })
          setVersion('A')
          setError(profile ? '' : '샘플은 완료됐지만 생성 당시 설정을 복원하지 못했습니다. 현재 설정으로 저장할 수 없습니다.')
          setNotice('가창 샘플이 준비되었습니다. 들어본 뒤 저장할 음색을 골라주세요.')
          // Keep the UUID so an unsaved A/B result can be restored after navigation.
          setPending(null)
          return
        }
        setError('')
      } catch (reason) {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : '상태 확인이 지연되고 있습니다. 기존 요청을 계속 확인합니다.')
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5_000)
    }
    void poll()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [pending, userId, pollRevision])

  useEffect(() => {
    if (!pendingSave || pendingSave.userId !== userId || saveSubmitting) return
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (Date.now() - startedAt >= POLL_LIMIT_MS) {
        setSaveHeld(true)
        setError('음색 저장 결과를 아직 확인하지 못했습니다. 기존 저장 요청의 상태를 다시 확인해 주세요.')
        return
      }
      try {
        const response = await fetch(`/api/voice/designed?generationId=${encodeURIComponent(pendingSave.generationId)}&sampleVersion=${pendingSave.version}`, { cache: 'no-store', signal: controller.signal })
        const data = await response.json().catch(() => ({})) as SaveResponse
        if (controller.signal.aborted) return
        if (response.ok && (data.status === 'ready' || data.voice?.status === 'ready') && data.voice?.designedVoiceId) {
          syncDesignedRef.current(data.voice)
          clearPendingSave(pendingSave)
          setPendingSave(null)
          setSaveHeld(false)
          setError('')
          setNotice('이 음색을 저장했습니다. 내 음색 스타일과 세 스튜디오에서 사용할 수 있습니다.')
          return
        }
        if (data.status === 'held' || data.voice?.status === 'held' || response.status === 401 || response.status === 403) {
          setSaveHeld(true)
          setError(data.message || data.error || '기존 음색 저장 요청을 확인하고 있습니다. 새 저장 요청은 보내지 않습니다. 잠시 후 상태를 다시 확인해 주세요.')
          return
        }
        if (!response.ok && response.status !== 404) setError('음색 저장 상태 확인이 지연되고 있습니다. 기존 요청을 계속 확인합니다.')
      } catch {
        if (controller.signal.aborted) return
        setError('음색 저장 상태 확인이 지연되고 있습니다. 기존 요청을 계속 확인합니다.')
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5_000)
    }
    void poll()
    return () => { controller.abort(); if (timer) clearTimeout(timer) }
  }, [pendingSave, userId, saveSubmitting, saveRevision])

  function changeDraft(next: VoiceDesignInput) { editedRef.current = true; setDraft(next); setNotice('') }

  function toggleTrait(id: string) {
    const trait = VOICE_DESIGN_TRAITS.find(item => item.id === id)
    if (!trait) return
    const traits = draft.traits.includes(id) ? draft.traits.filter(item => item !== id)
      : [...draft.traits.filter(item => VOICE_DESIGN_TRAITS.find(option => option.id === item)?.group !== trait.group), id].slice(0, 8)
    changeDraft({ ...draft, traits })
  }

  function buildPrompt() {
    try {
      const profile = compileVoiceDesign(draft)
      setBuilt(profile)
      setName(previous => previous || profile.title)
      setError('')
      setNotice('전용 프롬프트를 만들었습니다. 내용을 확인하고 샘플을 생성해 주세요.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '음색 특성을 확인해 주세요.') }
  }

  async function copyPrompt() {
    if (!built) return
    try { await navigator.clipboard.writeText(`${built.stylePrompt}\n\n${built.lyricsPrompt}`); setNotice('프롬프트와 가사를 복사했습니다.') }
    catch { setNotice('자동 복사를 사용할 수 없습니다. 아래 프롬프트와 가사를 직접 선택해 복사해 주세요.') }
  }

  async function generate() {
    if (submitRef.current || pending || submission || !userId || !builtMatchesDraft || !built) return
    let receipt: Submission
    try { receipt = beginSubmission(userId) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '진행 상태를 저장하지 못해 생성 요청을 보내지 않았습니다.'); return }
    submitRef.current = receipt.requestId
    setSubmission(receipt)
    setRecoveryChoices([])
    setSubmitting(true)
    setError('')
    setNotice('')
    setHeld(false)
    try {
      const id = await submitDesign(userId, built, receipt)
      if (activeUserRef.current === userId) {
        setSubmission(null)
        setResult(null)
        setPending({ id, userId, profile: built })
      }
    } catch (reason) {
      if (activeUserRef.current === userId) {
        setSubmission({ ...receipt, state: 'uncertain' })
        setError(reason instanceof Error ? reason.message : '생성 요청의 접수 여부를 확인하지 못했습니다. 기존 요청을 찾아 확인해 주세요.')
      }
    } finally {
      if (submitRef.current === receipt.requestId) {
        submitRef.current = null
        if (activeUserRef.current === userId) setSubmitting(false)
      }
    }
  }

  async function findExistingRequest() {
    if (!userId || !submission || submitting || recoveryRef.current) return
    // First recover a receipt that arrived after an earlier component unmounted.
    try {
      const current = readSubmission(userId)
      const id = readPending(userId)
      if (!current && id) { setSubmission(null); setPending({ id, userId, profile: null }); return }
    } catch { setError('저장된 진행 상태를 읽지 못했습니다. 브라우저 저장소를 사용할 수 있는지 확인해 주세요.'); return }
    const controller = new AbortController()
    recoveryRef.current = controller
    setRecovering(true)
    setError('')
    setRecoveryChoices([])
    try {
      const response = await fetch('/api/generations?scope=dashboard', { cache: 'no-store', signal: controller.signal })
      const data = await response.json() as { generations?: GenerationRow[] }
      if (!response.ok || !Array.isArray(data.generations)) throw new Error('기존 요청을 확인하지 못했습니다. 로그인 상태를 확인한 뒤 다시 찾아주세요.')
      if (controller.signal.aborted) return
      const choices = data.generations.flatMap(row => {
        const createdAt = Date.parse(row.created_at || '')
        if (row.user_id !== userId || !row.id || !UUID.test(row.id) || !restoredDesign(row)
          || !Number.isFinite(createdAt) || createdAt < submission.startedAt
          || (submission.startedAt > 0 && createdAt > submission.startedAt + POLL_LIMIT_MS)) return []
        let metadata: Record<string, unknown> = {}
        try { metadata = JSON.parse(row.license_hash || '{}') } catch {}
        const persistence = metadata.audioPersistence as { generationId?: string } | undefined
        // B rows refer to their primary generation; restore A/B through that row.
        const id = persistence?.generationId && UUID.test(persistence.generationId) ? persistence.generationId : row.id
        return [{ id, title: row.title || '음색 가창 샘플', createdAt: row.created_at! }]
      })
      const unique = [...new Map(choices.map(choice => [choice.id, choice])).values()].slice(0, 8)
      setRecoveryChoices(unique)
      setNotice(unique.length ? '요청 시각 이후의 가창 샘플입니다. 이어서 확인할 결과를 선택해 주세요.' : '아직 해당 시각의 가창 샘플이 보이지 않습니다. 잠시 후 다시 확인하거나 음원 보관함을 확인해 주세요. 새 생성 요청은 보내지 않습니다.')
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '기존 요청을 확인하지 못했습니다. 새 요청은 보내지 않습니다.')
    } finally {
      if (recoveryRef.current === controller) { recoveryRef.current = null; if (!controller.signal.aborted) setRecovering(false) }
    }
  }

  function recoverResult(id: string) {
    if (!userId || !submission || !recoveryChoices.some(choice => choice.id === id)) return
    try {
      acceptSubmission(userId, submission, id)
      setSubmission(null)
      setRecoveryChoices([])
      setResult(null)
      setHeld(false)
      setPending({ id, userId, profile: null })
      setNotice('선택한 기존 요청의 결과를 확인합니다. 새 생성 요청은 보내지 않습니다.')
    } catch { setError('기존 요청을 저장하지 못했습니다. 진행 상태를 유지하고 다시 확인해 주세요.') }
  }

  async function save() {
    if (saveRequestRef.current || pendingSave || !result?.profile || !resultMatchesDraft || !selectedSampleReady || !selectedUrl || !selectedGenerationId || !name.trim() || !userId) return
    const request = new AbortController()
    saveRequestRef.current = request
    const lookup: PendingSave = { generationId: selectedGenerationId, version, userId }
    setSaveSubmitting(true)
    setSaveHeld(false)
    setPendingSave(lookup)
    setError('')
    setNotice('선택한 가창 샘플의 음색을 저장하고 있습니다.')
    try { localStorage.setItem(saveKey(userId, version), selectedGenerationId) } catch {}
    try {
      const response = await fetch('/api/voice/designed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify({ generationId: selectedGenerationId, sampleVersion: version, name: name.trim().slice(0, 80) }) })
      const data = await response.json().catch(() => ({})) as SaveResponse
      if (request.signal.aborted) return
      if (!response.ok && data.code && ['authentication_required', 'invalid_request', 'not_found', 'invalid_sample'].includes(data.code)) {
        clearPendingSave(lookup)
        setPendingSave(null)
        setNotice('')
        setError(data.error || '샘플과 음색 이름을 확인한 뒤 저장해 주세요.')
        return
      }
      if (response.ok && (data.status === 'ready' || data.voice?.status === 'ready') && data.voice?.designedVoiceId) {
        syncDesignedRef.current(data.voice)
        clearPendingSave(lookup)
        setPendingSave(null)
        setNotice('이 음색을 저장했습니다. 내 음색 스타일과 세 스튜디오에서 사용할 수 있습니다.')
      } else setNotice('기존 음색 저장 요청의 상태를 확인하고 있습니다. 자동으로 다시 저장하지 않습니다.')
    } catch {
      if (!request.signal.aborted) setError('저장 요청의 결과를 확인하지 못했습니다. 기존 요청의 상태만 다시 확인합니다.')
    } finally {
      if (saveRequestRef.current === request) { saveRequestRef.current = null; setSaveSubmitting(false) }
    }
  }

  return <section aria-labelledby="custom-design-title" className="space-y-5 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-950/10 p-4 sm:p-6">
    <div><h3 id="custom-design-title" className="text-xl font-bold text-white">나만의 음색 만들기</h3><p className="mt-2 text-sm leading-relaxed text-zinc-400">성별·연령감·언어와 원하는 음색 특성을 골라 전용 프롬프트를 만드세요. 가창 샘플을 비교한 뒤 마음에 드는 음색을 저장할 수 있습니다.</p></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-xs text-zinc-300">보컬<select value={draft.gender} onChange={event => changeDraft({ ...draft, gender: event.target.value as VoiceDesignInput['gender'] })} className="mt-2 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-3 text-sm text-white"><option value="female">여성</option><option value="male">남성</option></select></label>
      <label className="text-xs text-zinc-300">연령감<select value={draft.age} onChange={event => changeDraft({ ...draft, age: event.target.value as VoiceDesignInput['age'] })} className="mt-2 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-3 text-sm text-white">{Object.entries(AGE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-xs text-zinc-300">가창 언어<select value={draft.language} onChange={event => changeDraft({ ...draft, language: event.target.value as VoiceDesignInput['language'] })} className="mt-2 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 py-3 text-sm text-white">{Object.entries(LANGUAGE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    </div>
    <div><p className="mb-3 text-sm text-zinc-300">음색 특성 <span className="text-zinc-500">· 분류마다 하나씩, 총 1~8개 선택</span></p><div className="grid gap-4 lg:grid-cols-2">{GROUPS.map(group => <fieldset key={group.id} className="rounded-xl border border-white/10 p-3"><legend className="px-1 text-xs font-semibold text-zinc-300">{group.label}</legend><div className="flex flex-wrap gap-2">{VOICE_DESIGN_TRAITS.filter(trait => trait.group === group.id).map(trait => <button key={trait.id} type="button" aria-pressed={draft.traits.includes(trait.id)} onClick={() => toggleTrait(trait.id)} className={`min-h-10 rounded-lg border px-3 py-2 text-xs ${draft.traits.includes(trait.id) ? 'border-fuchsia-400/60 bg-fuchsia-400/15 text-fuchsia-100' : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'}`}>{trait.label}</button>)}</div></fieldset>)}</div></div>
    <button type="button" onClick={buildPrompt} className="min-h-11 rounded-xl bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white hover:bg-fuchsia-400">전용 프롬프트 만들기</button>

    {built && <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-white">전용 프롬프트</p><button type="button" onClick={() => void copyPrompt()} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-zinc-300">프롬프트·가사 복사</button></div><label className="block text-xs text-zinc-400">음색 프롬프트<textarea readOnly value={built.stylePrompt} rows={5} className="mt-2 w-full resize-y rounded-lg bg-black/30 p-3 text-sm leading-relaxed text-zinc-200" /></label><details><summary className="cursor-pointer text-xs text-zinc-400">샘플 가사 보기</summary><textarea aria-label="샘플 가사" readOnly value={built.lyricsPrompt} rows={7} className="mt-3 w-full resize-y rounded-lg bg-black/30 p-3 text-sm leading-relaxed text-zinc-200" /></details>{!builtMatchesDraft && <p className="text-xs text-amber-300">설정이 바뀌었습니다. 전용 프롬프트를 다시 만들어 주세요.</p>}</div>}
    <div className="space-y-2"><button type="button" disabled={!authReady || !userId || !builtMatchesDraft || submitting || !!pending || !!submission} onClick={() => void generate()} className="min-h-11 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">{submitting ? '생성 요청 중…' : submission ? '기존 생성 요청 확인 필요' : pending ? '가창 샘플 생성 확인 중…' : '30초 가창 샘플 생성'}</button><p className="text-xs text-zinc-400">버튼을 누르면 생성 요청이 발생합니다.</p>{authReady && !userId && <p className="text-xs text-amber-300">샘플 생성과 저장은 로그인 후 사용할 수 있습니다.</p>}</div>
    {submission && <div role="status" className="space-y-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-100">
      <p>{submitting ? '생성 요청의 접수를 확인하고 있습니다. 화면을 떠나도 새 요청을 자동으로 보내지 않습니다.' : '이전 요청이 접수되었을 수 있어 새 생성을 잠시 막았습니다. 기존 결과를 먼저 확인해 주세요.'}</p>
      {submission.startedAt > 0 && <p className="text-xs text-amber-200/70">요청 시각 · {new Date(submission.startedAt).toLocaleString('ko-KR')}</p>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={submitting || recovering} onClick={() => void findExistingRequest()} className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs disabled:opacity-40">{recovering ? '기존 요청 찾는 중…' : '기존 요청 찾아보기'}</button><Link href="/dashboard" className="px-1 py-2 text-xs underline underline-offset-4">음원 보관함 확인</Link></div>
      {recoveryChoices.map(choice => <button type="button" key={choice.id} onClick={() => recoverResult(choice.id)} className="block w-full rounded-lg border border-white/10 bg-black/20 p-3 text-left text-xs"><span className="block font-semibold">{choice.title} · 이 결과 이어서 확인</span><span className="mt-1 block text-amber-200/70">{new Date(choice.createdAt).toLocaleString('ko-KR')}</span></button>)}
      <p className="text-xs leading-relaxed text-amber-200/70">결과를 찾지 못해도 자동으로 재요청하지 않습니다. 요청 시각과 함께 문의하면 접수 여부를 확인하는 데 도움이 됩니다.</p>
    </div>}
    {pending && <div role="status" className="space-y-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-cyan-100"><p>{held ? '기존 생성 요청을 유지하고 있습니다.' : '가창 샘플을 만들고 있습니다. 이 계정으로 돌아오면 기존 요청을 이어서 확인합니다.'}</p>{held && <button type="button" onClick={() => { setHeld(false); setError(''); setPollRevision(value => value + 1) }} className="rounded-lg border border-cyan-400/30 px-3 py-2 text-xs">기존 요청 상태 다시 확인</button>}</div>}
    {pendingSave && <div role="status" className="space-y-3 rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4 text-sm text-fuchsia-100"><p>{saveHeld ? '기존 음색 저장 요청의 결과를 확인해야 합니다.' : '선택한 샘플의 음색을 저장하고 있습니다. 같은 요청을 다시 만들지 않습니다.'}</p>{saveHeld && <button type="button" onClick={() => { setSaveHeld(false); setError(''); setSaveRevision(value => value + 1) }} className="rounded-lg border border-fuchsia-400/30 px-3 py-2 text-xs">기존 저장 상태 다시 확인</button>}</div>}
    {error && <p role="alert" className="text-sm leading-relaxed text-rose-300">{error}</p>}
    {notice && <p role="status" className="text-sm leading-relaxed text-cyan-200">{notice}</p>}

    {result && <div className="space-y-4 border-t border-white/10 pt-5"><div><h4 className="text-base font-semibold text-white">생성된 가창 샘플</h4>{result.profile && <p className="mt-2 text-xs leading-relaxed text-zinc-400">{designDescription(result.profile)}</p>}</div><div className="flex gap-2"><button type="button" aria-pressed={version === 'A'} onClick={() => setVersion('A')} className={`min-h-10 rounded-lg px-4 py-2 text-sm ${version === 'A' ? 'bg-cyan-400 text-zinc-950' : 'bg-white/5 text-zinc-300'}`}>샘플 A</button><button type="button" disabled={!result.audioB} aria-pressed={version === 'B'} onClick={() => setVersion('B')} className={`min-h-10 rounded-lg px-4 py-2 text-sm ${version === 'B' ? 'bg-cyan-400 text-zinc-950' : 'bg-white/5 text-zinc-300'} disabled:text-zinc-600`}>샘플 B</button>{!result.audioB && !pending && userId && <button type="button" onClick={() => { setHeld(false); setPending({ id: result.id, userId, profile: result.profile }) }} className="px-2 py-2 text-xs text-zinc-400">B 결과 다시 확인</button>}</div>{selectedUrl && <DesignSamplePlayer key={`${result.id}-${version}`} url={selectedUrl} version={version} onValidityChange={valid => { if (selectedGenerationId) setValidatedSamples(previous => ({ ...previous, [selectedGenerationId]: valid })) }} />}{!resultMatchesDraft && <div className="space-y-2 rounded-xl bg-amber-400/5 p-3 text-xs text-amber-200"><p>현재 설정과 이 샘플의 설정이 다릅니다. 현재 설정으로 새 샘플을 만들거나, 샘플의 설정을 다시 불러와 저장하세요.</p>{result.profile && <button type="button" onClick={() => { const profile = result.profile; if (profile) { changeDraft(profile); setBuilt(profile) } }} className="rounded-lg border border-amber-400/30 px-3 py-2">샘플 설정 불러오기</button>}</div>}<label className="block text-xs text-zinc-300">저장할 음색 이름<input value={name} disabled={!!pendingSave || saveSubmitting} maxLength={80} onChange={event => setName(event.target.value)} placeholder="나만의 음색 이름" className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-sm text-white" /></label><button type="button" disabled={!resultMatchesDraft || !selectedSampleReady || !selectedUrl || !selectedGenerationId || !name.trim() || !userId || !!pendingSave || saveSubmitting} onClick={() => void save()} className="min-h-11 rounded-xl bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">{saveSubmitting ? '음색 저장 요청 중…' : pendingSave ? '저장 결과 확인 중…' : '이 음색 저장'}</button><p className="text-xs leading-relaxed text-zinc-500">노래 샘플 기반 음색 참조 · 곡에 따라 표현이 달라질 수 있습니다.</p></div>}
  </section>
}
