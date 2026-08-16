'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, LoaderCircle, Play, RefreshCw } from 'lucide-react'
import type { DirectionApprovalBlueprint } from '@/data/mugsound-direction-approval-blueprints'
import { MUGSOUND_DIRECTION_BATCH_ID, MUGSOUND_PLAYLIST_TARGET_SECONDS } from '@/lib/mugsound/direction-batch'

type GenerationMode = 'instrumental' | 'lyrics'

interface BatchCandidate {
  id: string
  blueprintId: string
  status: string
  audioUrl: string | null
}

export function DirectionBatchConsole({ blueprints }: { blueprints: DirectionApprovalBlueprint[] }) {
  const [candidates, setCandidates] = useState<BatchCandidate[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [modes, setModes] = useState<Record<string, GenerationMode>>(() => Object.fromEntries(blueprints.map((blueprint) => [blueprint.blueprintId, 'instrumental'])))
  const [lyrics, setLyrics] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/internal/mugsound/direction-batch?batchId=${encodeURIComponent(MUGSOUND_DIRECTION_BATCH_ID)}`, { cache: 'no-store' })
    const body = await response.json() as { data?: { candidates: BatchCandidate[] }; error?: string }
    if (!response.ok) throw new Error(body.error || 'Batch 상태를 불러오지 못했습니다.')
    setCandidates(body.data?.candidates || [])
  }, [])

  useEffect(() => { refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '상태 조회 실패')) }, [refresh])
  useEffect(() => {
    if (!candidates.some((candidate) => candidate.status === 'generating')) return
    const timer = window.setInterval(() => refresh().catch(() => undefined), 10_000)
    return () => window.clearInterval(timer)
  }, [candidates, refresh])

  const submittedBlueprints = new Set(candidates.map((candidate) => candidate.blueprintId))
  const pending = blueprints.filter((blueprint) => !submittedBlueprints.has(blueprint.blueprintId))
  const completed = candidates.filter((candidate) => candidate.status === 'completed' && candidate.audioUrl).length

  const submit = async () => {
    if (!confirmed || submitting || pending.length === 0) return
    const missingLyrics = pending.find((blueprint) => modes[blueprint.blueprintId] === 'lyrics' && !lyrics[blueprint.blueprintId]?.trim())
    if (missingLyrics) {
      setError(`${missingLyrics.workingTitle}: 가사곡은 가사를 입력해야 합니다.`)
      return
    }
    setSubmitting(true)
    setError(null)
    setSubmitted(0)
    try {
      for (const blueprint of pending) {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: blueprint.workingTitle,
            stylePrompt: blueprint.stylePrompt,
            excludePrompt: blueprint.excludePrompt,
            lyricsPrompt: modes[blueprint.blueprintId] === 'lyrics' ? lyrics[blueprint.blueprintId].trim() : '',
            engine: 'suno_v5',
            sunoVersion: 'v5.5',
            isInstrumental: modes[blueprint.blueprintId] !== 'lyrics',
            sourceMenu: 'mugsound-supply',
            isPublic: false,
            mugsoundBatchId: MUGSOUND_DIRECTION_BATCH_ID,
            mugsoundBlueprintId: blueprint.blueprintId,
            mugsoundEpisodeId: blueprint.episodeId,
            mugsoundPhase: blueprint.phase,
            mugsoundTargetEnergy: blueprint.targetEnergy,
            mugsoundTargetWarmth: blueprint.targetWarmth,
            mugsoundBridgeDirection: blueprint.bridgeDirection,
            metadata: { primaryGenre: 'warm minimal cafe', subGenre: blueprint.phase, bpm: String(blueprint.targetBpm), mood: blueprint.episodeId, durationSeconds: MUGSOUND_PLAYLIST_TARGET_SECONDS },
          }),
        })
        const body = await response.json() as { error?: string }
        if (!response.ok && response.status !== 409) throw new Error(body.error || `${blueprint.workingTitle} 제출 실패`)
        setSubmitted((value) => value + 1)
      }
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suno Batch 제출 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Blueprint" value={`${blueprints.length}`} />
        <Metric label="제출됨" value={`${blueprints.length - pending.length} / ${blueprints.length}`} />
        <Metric label="완료 후보" value={`${completed} / ${blueprints.length * 2}`} />
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4 text-sm text-zinc-300">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-300" />
        <span><strong className="text-amber-100">Suno 유료 생성 확인</strong><span className="mt-1 block text-xs leading-5 text-zinc-500">미제출 Blueprint마다 A/B 후보 2개를 생성합니다. 중복 제출은 서버에서 차단됩니다.</span></span>
      </label>
      <div className="grid gap-3 lg:grid-cols-2">
        {blueprints.map((blueprint) => {
          const submittedAlready = submittedBlueprints.has(blueprint.blueprintId)
          const mode = modes[blueprint.blueprintId] || 'instrumental'
          return <section key={blueprint.blueprintId} className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-wider text-zinc-600">{blueprint.episodeId} · {blueprint.phase}</p><h3 className="mt-1 text-sm font-semibold text-white">{blueprint.workingTitle}</h3></div><span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-zinc-500">약 3분</span></div>
            <div className="mt-3 grid grid-cols-2 rounded-xl bg-white/[0.035] p-1" role="group" aria-label={`${blueprint.workingTitle} 생성 유형`}>
              {(['instrumental', 'lyrics'] as const).map((value) => <button key={value} type="button" disabled={submittedAlready || submitting} aria-pressed={mode === value} onClick={() => setModes((current) => ({ ...current, [blueprint.blueprintId]: value }))} className={`rounded-lg px-3 py-2 text-xs transition disabled:opacity-40 ${mode === value ? 'bg-amber-300 text-amber-950' : 'text-zinc-500 hover:text-white'}`}>{value === 'instrumental' ? '연주곡' : '가사곡'}</button>)}
            </div>
            {mode === 'lyrics' ? <label className="mt-3 block text-[11px] text-zinc-500">확정 가사<textarea disabled={submittedAlready || submitting} value={lyrics[blueprint.blueprintId] || ''} onChange={(event) => setLyrics((current) => ({ ...current, [blueprint.blueprintId]: event.target.value }))} rows={5} maxLength={5000} placeholder="Suno에 전달할 확정 가사를 입력하세요." className="mt-2 w-full resize-y rounded-xl border border-white/8 bg-black/30 p-3 text-xs leading-5 text-zinc-300 outline-none focus:border-amber-300/35 disabled:opacity-40" /></label> : <p className="mt-3 text-[11px] leading-5 text-zinc-600">보컬과 가사를 생성하지 않는 기존 Melodio 연주곡 방식입니다.</p>}
          </section>
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={submit} disabled={!confirmed || submitting || pending.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-950 disabled:opacity-40">
          {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : pending.length === 0 ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {submitting ? `제출 중 ${submitted}/${pending.length}` : pending.length === 0 ? '모두 제출됨' : `남은 ${pending.length}개 제출`}
        </button>
        <button type="button" onClick={() => refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '조회 실패'))} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 hover:text-white"><RefreshCw className="h-4 w-4" />새로고침</button>
      </div>
      {error ? <p role="alert" className="flex items-center gap-2 text-sm text-red-300"><AlertTriangle className="h-4 w-4" />{error}</p> : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/[0.035] p-4"><p className="text-xs text-zinc-600">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p></div>
}
