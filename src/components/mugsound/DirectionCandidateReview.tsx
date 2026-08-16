'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CircleHelp, Crown, LoaderCircle, RefreshCw, X } from 'lucide-react'
import type { DirectionApprovalBlueprint } from '@/data/mugsound-direction-approval-blueprints'
import { MUGSOUND_DIRECTION_LEGACY_BATCH_ID } from '@/lib/mugsound/direction-batch'

type Verdict = 'pass' | 'review' | 'reject'

interface CandidateReview {
  verdict: Verdict
  notes: string
  isPreferred: boolean
  reviewedAt: string
}

interface ReviewCandidate {
  id: string
  blueprintId: string
  episodeId: string
  phase: string
  title: string
  status: string
  audioUrl: string | null
  audioGrade: string | null
  clippingCount: number | null
  dissonanceScore: number | null
  durationSeconds: number | null
  createdAt: string
  review: CandidateReview | null
}

const episodeLabels: Record<string, string> = {
  'ms-ep-001': 'Warm Arrival',
  'ms-ep-002': 'Gentle Focus',
  'ms-ep-003': 'Conversation Glow',
}

export function DirectionCandidateReview({ blueprints }: { blueprints: DirectionApprovalBlueprint[] }) {
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/internal/mugsound/direction-batch?batchId=${encodeURIComponent(MUGSOUND_DIRECTION_LEGACY_BATCH_ID)}`, { cache: 'no-store' })
    const body = await response.json() as { data?: { candidates: ReviewCandidate[] }; error?: string }
    if (!response.ok) throw new Error(body.error || '후보를 불러오지 못했습니다.')
    const next = body.data?.candidates || []
    setCandidates(next)
    setDrafts((current) => {
      const merged = { ...current }
      for (const candidate of next) if (!(candidate.id in merged)) merged[candidate.id] = candidate.review?.notes || ''
      return merged
    })
  }, [])

  useEffect(() => { refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '후보 조회 실패')) }, [refresh])

  const grouped = useMemo(() => {
    const byBlueprint = new Map<string, ReviewCandidate[]>()
    for (const candidate of candidates) {
      const list = byBlueprint.get(candidate.blueprintId) || []
      list.push(candidate)
      byBlueprint.set(candidate.blueprintId, list)
    }
    return blueprints.map((blueprint) => ({ blueprint, candidates: byBlueprint.get(blueprint.blueprintId) || [] }))
  }, [blueprints, candidates])

  const reviewed = candidates.filter((candidate) => candidate.review).length
  const preferred = candidates.filter((candidate) => candidate.review?.isPreferred).length

  const save = async (candidate: ReviewCandidate, verdict: Verdict, isPreferred = candidate.review?.isPreferred || false) => {
    setSavingId(candidate.id)
    setError(null)
    try {
      const response = await fetch('/api/internal/mugsound/direction-batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: candidate.id, verdict, notes: drafts[candidate.id] || '', isPreferred }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || '판정을 저장하지 못했습니다.')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '판정 저장 실패')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="생성 후보" value={`${candidates.length} / 12`} />
        <Metric label="판정 완료" value={`${reviewed} / 12`} />
        <Metric label="대표 선택" value={`${preferred} / ${blueprints.length}`} />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <p className="text-xs leading-5 text-zinc-500">A/B를 모두 듣고 Pass 후보 중 Blueprint 대표 1곡을 선택하세요. 재생기는 동시에 하나만 재생하는 것을 권장합니다.</p>
        <button type="button" onClick={() => refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '조회 실패'))} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-400 hover:text-white"><RefreshCw className="h-3.5 w-3.5" />새로고침</button>
      </div>
      {error ? <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-400/10 p-3 text-sm text-red-300"><AlertTriangle className="h-4 w-4" />{error}</p> : null}
      {grouped.map(({ blueprint, candidates: items }) => (
        <article key={blueprint.blueprintId} className="[content-visibility:auto] [contain-intrinsic-size:430px] rounded-2xl border border-white/8 bg-black/20 p-4 sm:p-5">
          <header className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/70">{episodeLabels[blueprint.episodeId]} · {blueprint.phase}</p><h3 className="mt-1 text-base font-semibold text-white">{blueprint.workingTitle}</h3></div>
            <p className="text-xs text-zinc-500">Energy {blueprint.targetEnergy} · Warmth {blueprint.targetWarmth} · {blueprint.targetBpm} BPM</p>
          </header>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {items.map((candidate, index) => {
              const verdict = candidate.review?.verdict
              const busy = savingId === candidate.id
              return <section key={candidate.id} className={`rounded-2xl border p-4 ${candidate.review?.isPreferred ? 'border-amber-300/45 bg-amber-300/[0.06]' : 'border-white/8 bg-white/[0.025]'}`}>
                <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-white">Candidate {index === 0 ? 'A' : 'B'}</h4>{candidate.review?.isPreferred ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-300/15 px-2.5 py-1 text-[10px] font-semibold text-amber-200"><Crown className="h-3 w-3" />대표 후보</span> : null}</div>
                {candidate.audioUrl ? <audio className="mt-3 h-10 w-full" controls preload="none" src={candidate.audioUrl}>이 브라우저는 오디오 재생을 지원하지 않습니다.</audio> : <p className="mt-3 rounded-xl bg-white/[0.03] p-3 text-xs text-zinc-500">음원 URL을 준비 중입니다.</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-zinc-600"><span>{candidate.durationSeconds ? `${Math.round(candidate.durationSeconds)}초` : '길이 미상'}</span><span>Grade {candidate.audioGrade || '—'}</span><span>Clip {candidate.clippingCount ?? '—'}</span></div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <VerdictButton active={verdict === 'pass'} disabled={busy} onClick={() => save(candidate, 'pass')} icon={Check} label="Pass" tone="emerald" />
                  <VerdictButton active={verdict === 'review'} disabled={busy} onClick={() => save(candidate, 'review', false)} icon={CircleHelp} label="Review" tone="amber" />
                  <VerdictButton active={verdict === 'reject'} disabled={busy} onClick={() => save(candidate, 'reject', false)} icon={X} label="Reject" tone="red" />
                </div>
                <label className="mt-4 block text-[11px] text-zinc-500">청취 메모<textarea value={drafts[candidate.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: event.target.value }))} maxLength={1000} rows={3} placeholder="도입, 연결성, 멜로디 전경화, 종료 상태를 기록하세요." className="mt-2 w-full resize-y rounded-xl border border-white/8 bg-black/30 p-3 text-xs leading-5 text-zinc-300 outline-none focus:border-amber-300/35" /></label>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy || !verdict} onClick={() => save(candidate, verdict || 'review')} className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:opacity-40">{busy ? <LoaderCircle className="mx-auto h-4 w-4 animate-spin" /> : '메모 저장'}</button>
                  <button type="button" disabled={busy || verdict !== 'pass' || candidate.review?.isPreferred} onClick={() => save(candidate, 'pass', true)} className="flex-1 rounded-xl bg-amber-300 px-3 py-2 text-xs font-semibold text-amber-950 disabled:opacity-35">대표로 선택</button>
                </div>
              </section>
            })}
            {items.length === 0 ? <p className="text-sm text-zinc-500">후보를 불러오는 중입니다.</p> : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/[0.035] p-4"><p className="text-xs text-zinc-600">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p></div>
}

function VerdictButton({ active, disabled, onClick, icon: Icon, label, tone }: { active: boolean; disabled: boolean; onClick: () => void; icon: typeof Check; label: string; tone: 'emerald' | 'amber' | 'red' }) {
  const tones = { emerald: 'border-emerald-400/25 text-emerald-300 bg-emerald-400/10', amber: 'border-amber-300/25 text-amber-200 bg-amber-300/10', red: 'border-red-400/25 text-red-300 bg-red-400/10' }
  return <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs disabled:opacity-40 ${active ? tones[tone] : 'border-white/8 text-zinc-500 hover:text-zinc-200'}`}><Icon className="h-3.5 w-3.5" />{label}</button>
}
