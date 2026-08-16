'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, LoaderCircle, Play, RefreshCw } from 'lucide-react'
import type { DirectionApprovalBlueprint } from '@/data/mugsound-direction-approval-blueprints'

const BATCH_ID = 'mugsound-direction-20260816-v1'

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

  const refresh = useCallback(async () => {
    const response = await fetch('/api/internal/mugsound/direction-batch', { cache: 'no-store' })
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
            lyricsPrompt: '',
            engine: 'suno_v5',
            sunoVersion: 'v5.5',
            isInstrumental: true,
            sourceMenu: 'mugsound-supply',
            isPublic: false,
            mugsoundBatchId: BATCH_ID,
            mugsoundBlueprintId: blueprint.blueprintId,
            mugsoundEpisodeId: blueprint.episodeId,
            mugsoundPhase: blueprint.phase,
            mugsoundTargetEnergy: blueprint.targetEnergy,
            mugsoundTargetWarmth: blueprint.targetWarmth,
            mugsoundBridgeDirection: blueprint.bridgeDirection,
            metadata: { primaryGenre: 'warm minimal cafe', subGenre: blueprint.phase, bpm: String(blueprint.targetBpm), mood: blueprint.episodeId },
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
