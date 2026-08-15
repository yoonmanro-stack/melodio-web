'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle, ArrowLeft, ChevronDown, CircleDollarSign,
  Disc3, FileText, Fingerprint, LoaderCircle, Music2, Play, RefreshCw, Sparkles,
  Trophy, Upload,
} from 'lucide-react'
import { ChannelBuilderApiError } from '@/lib/channel-system/channel-builder-client'
import {
  compileGenerationQueueLyrics,
  getGenerationQueue,
  prepareGenerationQueue,
  selectGenerationQueueMaster,
  submitGenerationQueueItem,
} from '@/lib/channel-system/generation-queue-client'
import type {
  GenerationQueueContext,
  GenerationQueueItem,
} from '@/lib/channel-system/generation-queue-service'

interface Props { channelId: string; episodeId: string }

export function GenerationQueue({ channelId, episodeId }: Props) {
  const [context, setContext] = useState<GenerationQueueContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set())
  const [isPreparing, startPreparing] = useTransition()
  const [compilingAll, setCompilingAll] = useState(false)
  const [submittingAll, setSubmittingAll] = useState(false)
  const [costConfirmed, setCostConfirmed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getGenerationQueue(channelId, episodeId, controller.signal).then(setContext).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(formatError(reason))
    })
    return () => controller.abort()
  }, [channelId, episodeId])

  useEffect(() => {
    const polling = context?.items.some((item) => ['submitting', 'generating'].includes(item.status))
    if (!polling) return
    const timer = window.setInterval(() => {
      getGenerationQueue(channelId, episodeId).then(setContext).catch(() => undefined)
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [channelId, episodeId, context?.items])

  const replaceItem = (item: GenerationQueueItem) => setContext((current) => current ? {
    ...current,
    items: current.items.map((candidate) => candidate.id === item.id ? item : candidate),
    batch: current.batch ? {
      ...current.batch,
      readyItems: current.items.filter((candidate) => (
        candidate.id === item.id ? item.status : candidate.status
      ) === 'ready').length,
    } : null,
  } : current)

  const compileOne = async (item: GenerationQueueItem) => {
    setError(null)
    setActiveIds((current) => new Set(current).add(item.id))
    try {
      replaceItem(await compileGenerationQueueLyrics(channelId, episodeId, item.id))
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setActiveIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  const compileAll = async () => {
    if (!context) return
    const pending = context.items.filter((item) => !item.isInstrumental && ['awaiting_lyrics', 'failed'].includes(item.status))
    setCompilingAll(true)
    setError(null)
    let cursor = 0
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor]
        cursor += 1
        await compileOne(item)
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker))
    try { setContext(await getGenerationQueue(channelId, episodeId)) } catch (reason) { setError(formatError(reason)) }
    setCompilingAll(false)
  }

  const submitOne = async (item: GenerationQueueItem) => {
    setError(null)
    setActiveIds((current) => new Set(current).add(item.id))
    try {
      await submitGenerationQueueItem(item)
      setContext(await getGenerationQueue(channelId, episodeId))
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setActiveIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  const submitAll = async () => {
    if (!context || !costConfirmed) return
    setSubmittingAll(true)
    for (const item of context.items.filter((candidate) => candidate.status === 'ready')) {
      await submitOne(item)
    }
    setSubmittingAll(false)
  }

  const selectMaster = async (item: GenerationQueueItem, candidateId: string) => {
    setActiveIds((current) => new Set(current).add(item.id))
    try {
      replaceItem(await selectGenerationQueueMaster(channelId, episodeId, item.id, candidateId))
    } catch (reason) {
      setError(formatError(reason))
    } finally {
      setActiveIds((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
    }
  }

  if (error && !context) return <State title="Generation Queue를 열 수 없습니다" detail={error} />
  if (!context) return <State title="Generation Queue를 불러오는 중" detail="승인 상태와 프롬프트 권한을 확인하고 있습니다." loading />

  const total = context.review.tracks.length
  const ready = context.items.filter((item) => item.status === 'ready').length
  const pendingLyrics = context.items.filter((item) => !item.isInstrumental && ['awaiting_lyrics', 'compiling_lyrics', 'failed'].includes(item.status)).length
  const allReady = Boolean(context.batch) && ready === total
  const generating = context.items.filter((item) => ['submitting', 'generating'].includes(item.status)).length
  const awaitingSelection = context.items.filter((item) => item.status === 'awaiting_selection').length
  const selected = context.items.filter((item) => Boolean(item.selectedCandidateId)).length
  const studio = context.entitledPromptTier === 'studio'

  return (
    <div className="mx-auto min-h-full w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <header className="mb-7">
        <Link href={`/channel-builder/${channelId}/episodes/${episodeId}/review`} className="mb-4 inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Episode Review</Link>
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300"><Sparkles className="h-4 w-4" /> Generation Queue</div><h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{context.review.episode.episodeTitle}</h1><p className="mt-3 text-sm text-zinc-400">승인된 Blueprint를 고유 가사와 Suno A/B 생성 패키지로 컴파일합니다.</p></div>
          <span className={`w-fit rounded-full border px-4 py-2 text-xs font-semibold ${selected === total ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-violet-400/30 bg-violet-400/10 text-violet-300'}`}>{selected === total ? 'MASTERS SELECTED' : context.batch?.status?.toUpperCase() || 'NOT PREPARED'}</span>
        </div>
      </header>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Music2} label="Final Masters" value={`${total}곡`} />
        <Metric icon={Disc3} label="Suno A/B Candidates" value={`${total * 2}곡`} />
        <Metric icon={FileText} label="Ready / Generating" value={`${ready} / ${generating}`} />
        <Metric icon={Fingerprint} label="Prompt Tier" value={studio ? 'Studio · 1,000자' : 'Compact · 200자'} />
      </section>

      {!context.batch ? (
        <section className="rounded-3xl border border-violet-400/20 bg-violet-500/[0.06] p-7 sm:p-9">
          <h2 className="text-xl font-semibold text-white">생성 패키지를 준비할까요?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">{total}개의 승인된 Blueprint에 {studio ? 'Studio-Grade 자연어 프롬프트' : '태그 기반 Compact 프롬프트'}를 적용합니다. Instrumental은 즉시 준비되고, Vocal은 이후 곡별로 고유 가사를 컴파일합니다.</p>
          {!studio ? <p className="mt-3 text-xs text-amber-300">무료 플랜은 Compact 프롬프트가 적용됩니다. 유료 플랜에서 1,000자 이내 Studio-Grade 브리프를 사용할 수 있습니다.</p> : null}
          <button type="button" disabled={isPreparing || context.review.episode.status !== 'approved'} onClick={() => startPreparing(async () => {
            try { setError(null); setContext(await prepareGenerationQueue(channelId, episodeId)) } catch (reason) { setError(formatError(reason)) }
          })} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-300 px-5 py-3 text-sm font-semibold text-violet-950 disabled:opacity-40"><Play className="h-4 w-4" /> {isPreparing ? '프롬프트 컴파일 중…' : `${total}곡 Queue 준비`}</button>
          {error ? <p role="alert" className="mt-4 text-xs text-red-300">{error}</p> : null}
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-2xl border border-white/10 bg-[#111118] p-5"><p className="text-xs uppercase tracking-wider text-zinc-600">Pipeline</p><p className="mt-3 text-sm text-zinc-300">{total} Briefs → <strong className="text-amber-300">{total * 2} Candidates</strong> → {total} Masters</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${total ? (selected / total) * 100 : 0}%` }} /></div><p className="mt-2 text-xs text-zinc-500">생성 중 {generating} · 선택 대기 {awaitingSelection} · Master {selected}</p></section>
            <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-5"><div className="flex items-center gap-2 text-sm text-amber-200"><CircleDollarSign className="h-4 w-4" /> Suno 유료 실행</div><p className="mt-3 text-xs leading-5 text-zinc-500">제출 버튼부터 실제 Suno 크레딧을 사용합니다. 각 Blueprint 제출은 A/B 후보 2곡을 생성합니다.</p>{allReady ? <label className="mt-4 flex items-start gap-2 text-xs text-zinc-400"><input type="checkbox" checked={costConfirmed} onChange={(event) => setCostConfirmed(event.target.checked)} className="mt-0.5 accent-amber-300" /><span>{total}건의 Suno 작업 제출과 유료 크레딧 사용을 확인했습니다.</span></label> : null}</section>
            {pendingLyrics > 0 ? <button type="button" disabled={compilingAll} onClick={compileAll} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-50"><Sparkles className="h-4 w-4" /> {compilingAll ? '고유 가사 컴파일 중…' : `남은 ${pendingLyrics}곡 전체 컴파일`}</button> : null}
            {allReady ? <button type="button" disabled={!costConfirmed || submittingAll} onClick={submitAll} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-sm font-semibold text-amber-950 disabled:opacity-40"><Upload className="h-4 w-4" />{submittingAll ? '한 곡씩 제출 중…' : `${total}건 Suno 제출`}</button> : null}
            {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{error}</p> : null}
          </aside>
          <main className="space-y-2">{context.items.map((item) => <QueueItem key={item.id} item={item} busy={activeIds.has(item.id)} onCompile={() => compileOne(item)} onSubmit={() => submitOne(item)} onSelect={(candidateId) => selectMaster(item, candidateId)} />)}</main>
        </div>
      )}

      {selected === total && total > 0 ? <section className="mt-5 flex flex-col justify-between gap-4 rounded-3xl border border-emerald-400/25 bg-emerald-400/[0.07] p-6 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-300 text-emerald-950"><Trophy className="h-5 w-5" /></span><div><h2 className="font-semibold text-emerald-200">Episode Master {total}곡 확정</h2><p className="mt-1 text-xs text-zinc-500">선택된 Master를 실제 재생시간 기준으로 조립할 수 있습니다.</p></div></div><Link href={`/channel-builder/${channelId}/episodes/${episodeId}/assembly`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950"><Play className="h-4 w-4" /> Episode Assembly</Link></section> : null}
    </div>
  )
}

function QueueItem({ item, busy, onCompile, onSubmit, onSelect }: { item: GenerationQueueItem; busy: boolean; onCompile: () => void; onSubmit: () => void; onSelect: (candidateId: string) => void }) {
  const ready = item.status === 'ready'
  const lyricPending = !item.isInstrumental && ['awaiting_lyrics', 'compiling_lyrics', 'failed'].includes(item.status)
  return <details className="group [content-visibility:auto] [contain-intrinsic-size:220px] rounded-2xl border border-white/8 bg-[#111118] p-4 open:border-violet-400/20"><summary className="flex cursor-pointer list-none items-center gap-4"><span className="w-8 font-mono text-xs text-zinc-600">{String(item.trackNumber).padStart(2, '0')}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium text-white">{item.title}</h3><p className="mt-1 text-[11px] text-zinc-600">{item.isInstrumental ? 'Instrumental' : 'Vocal · A/B same lyrics'} · Prompt {item.stylePrompt.length}자</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] ${item.status === 'completed' ? 'bg-emerald-400/10 text-emerald-300' : ['failed', 'submission_failed', 'generation_failed'].includes(item.status) ? 'bg-red-400/10 text-red-300' : ready ? 'bg-cyan-400/10 text-cyan-300' : 'bg-amber-400/10 text-amber-300'}`}>{item.status === 'completed' ? 'MASTER' : ready ? 'READY ×2' : item.status}</span><ChevronDown className="h-4 w-4 text-zinc-600 transition group-open:rotate-180" /></summary><div className="mt-4 border-t border-white/6 pt-4"><p className="text-[10px] uppercase tracking-wider text-zinc-600">{item.promptTier === 'studio' ? 'Studio-Grade Prompt' : 'Compact Prompt'}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-400">{item.stylePrompt}</p>{item.excludePrompt ? <p className="mt-3 text-xs text-red-300/70">Exclude: {item.excludePrompt}</p> : null}{item.lyricsPrompt ? <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 p-4 font-sans text-xs leading-5 text-zinc-400">{item.lyricsPrompt}</pre> : null}{lyricPending ? <button type="button" disabled={busy} onClick={onCompile} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-violet-400/25 px-3 py-2 text-xs text-violet-300 disabled:opacity-50">{item.status === 'failed' ? <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> : <Sparkles className="h-3.5 w-3.5" />}{busy ? '컴파일 중…' : item.status === 'failed' ? '가사 다시 컴파일' : '고유 가사 컴파일'}</button> : null}{ready ? <button type="button" disabled={busy} onClick={onSubmit} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-xs font-semibold text-amber-950 disabled:opacity-50"><Upload className="h-3.5 w-3.5" />{busy ? 'Suno 제출 중…' : '이 곡만 Suno 제출'}</button> : null}{item.candidates.length > 0 ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{item.candidates.map((candidate) => <div key={candidate.id} className={`rounded-xl border p-3 ${item.selectedCandidateId === candidate.id ? 'border-emerald-400/40 bg-emerald-400/[0.06]' : 'border-white/8 bg-black/20'}`}><div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-white">Candidate {candidate.slot}</span>{candidate.isRecommended ? <span className="rounded-full bg-violet-400/10 px-2 py-1 text-[10px] text-violet-300">AI 추천</span> : null}</div><audio className="h-9 w-full" controls preload="none" src={candidate.audioUrl} /><div className="mt-3 flex gap-3 text-[10px] text-zinc-500"><span>{candidate.durationSeconds ? `${Math.round(candidate.durationSeconds)}초` : '길이 미상'}</span><span>Grade {candidate.audioGrade || '—'}</span><span>Clip {candidate.clippingCount ?? '—'}</span></div><button type="button" disabled={busy || item.selectedCandidateId === candidate.id} onClick={() => onSelect(candidate.id)} className="mt-3 w-full rounded-lg border border-emerald-400/25 px-3 py-2 text-xs text-emerald-300 disabled:opacity-50">{item.selectedCandidateId === candidate.id ? 'Master 선택됨' : '이 후보를 Master로 선택'}</button></div>)}</div> : null}{['submitting', 'generating'].includes(item.status) ? <p className="mt-4 flex items-center gap-2 text-xs text-amber-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Suno A/B 생성 및 음질 검수 중입니다.</p> : null}{item.errorMessage ? <p className="mt-3 flex items-center gap-2 text-xs text-red-300"><AlertTriangle className="h-3.5 w-3.5" />{item.errorMessage}</p> : null}</div></details>
}

function Metric({ icon: Icon, label, value }: { icon: typeof Music2; label: string; value: string }) {
  return <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-600"><Icon className="h-3.5 w-3.5 text-violet-300" />{label}</div><p className="mt-2 text-xl font-semibold text-white">{value}</p></div>
}

function State({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) {
  return <div className="mx-auto mt-20 max-w-lg rounded-2xl border border-white/10 bg-[#111118] p-8 text-center">{loading ? <LoaderCircle className="mx-auto mb-4 h-6 w-6 animate-spin text-violet-300" /> : null}<h1 className="text-lg font-semibold text-white">{title}</h1><p className="mt-2 text-sm text-zinc-500">{detail}</p></div>
}

function formatError(error: unknown) {
  if (error instanceof ChannelBuilderApiError) return error.message
  return error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다.'
}
