'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  Disc3,
  Fingerprint,
  Gauge,
  Headphones,
  ListChecks,
  LoaderCircle,
  Music2,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react'
import type { TrackBlueprint, TrackRole } from '@/types/channel-system'
import { ChannelBuilderApiError } from '@/lib/channel-system/channel-builder-client'
import {
  approveEpisodeBlueprint,
  getEpisodeReview,
  regenerateReviewedTrackTitle,
  updateReviewedTrack,
} from '@/lib/channel-system/episode-review-client'
import type { TrackReviewUpdate } from '@/lib/channel-system/episode-review-input'
import type { EpisodeReviewContext } from '@/lib/channel-system/episode-review-service'
import { validateTitleUniqueness } from '@/lib/channel-system/validators'

interface EpisodeReviewProps { channelId: string; episodeId: string }
type Filter = 'all' | 'instrumental' | 'vocal' | 'issues'

const ROLE_LABELS: Record<TrackRole, string> = {
  opening: 'Opening', immersion: 'Immersion', steady: 'Steady', rise: 'Rise',
  peak: 'Peak', release: 'Release', reprise: 'Reprise', closing: 'Closing',
}
const INPUT = 'w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/10'
const SELECT = `${INPUT} [color-scheme:dark] [&>option]:bg-zinc-950 [&>option]:text-zinc-100`

function editable(track: TrackBlueprint): TrackReviewUpdate {
  return {
    songTitle: track.songTitle,
    role: track.role,
    energy: track.energy,
    bpm: track.bpm,
    musicalKey: track.musicalKey,
    leadInstrument: track.leadInstrument,
    isInstrumental: track.isInstrumental,
    arrangementVariation: track.arrangementVariation,
  }
}

export function EpisodeReview({ channelId, episodeId }: EpisodeReviewProps) {
  const [context, setContext] = useState<EpisodeReviewContext | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmed, setConfirmed] = useState(false)
  const [dirtyTrackIds, setDirtyTrackIds] = useState<Set<string>>(() => new Set())
  const [busyTrackIds, setBusyTrackIds] = useState<Set<string>>(() => new Set())
  const [isApproving, startApproval] = useTransition()

  useEffect(() => {
    const controller = new AbortController()
    getEpisodeReview(channelId, episodeId, controller.signal)
      .then(setContext)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadError(error instanceof Error ? error.message : 'Episode을 불러오지 못했습니다.')
      })
    return () => controller.abort()
  }, [channelId, episodeId])

  if (loadError) return <StatePanel title="Episode Review를 열 수 없습니다" detail={loadError} />
  if (!context) return <StatePanel title="Blueprint를 불러오는 중" detail="Episode과 Track Blueprint를 확인하고 있습니다." loading />

  const titleValidation = validateTitleUniqueness(
    context.tracks.map((track) => ({ id: track.id, title: track.songTitle })),
  )
  const issueIds = new Set(titleValidation.issues.flatMap((issue) => (
    [issue.titleId, issue.comparedToId].filter((id): id is string => Boolean(id))
  )))
  const visibleTracks = context.tracks.filter((track) => {
    if (filter === 'instrumental') return track.isInstrumental
    if (filter === 'vocal') return !track.isInstrumental
    if (filter === 'issues') return issueIds.has(track.id)
    return true
  })
  const vocalCount = context.tracks.filter((track) => !track.isInstrumental).length
  const totalMinutes = Math.round(context.tracks.reduce((sum, track) => sum + track.targetDurationSeconds, 0) / 60)
  const approved = context.episode.status === 'approved'

  const replaceTrack = (track: TrackBlueprint) => {
    setContext((current) => current ? {
      ...current,
      tracks: current.tracks.map((item) => item.id === track.id ? track : item),
    } : current)
    setActionError(null)
    setDirtyTrackIds((current) => {
      const next = new Set(current)
      next.delete(track.id)
      return next
    })
  }

  const approve = () => {
    setActionError(null)
    startApproval(async () => {
      try {
        const result = await approveEpisodeBlueprint(channelId, episodeId)
        setContext((current) => current ? {
          ...current,
          episode: { ...current.episode, status: result.status },
          tracks: current.tracks.map((track) => ({ ...track, status: 'approved' })),
        } : current)
      } catch (error) {
        setActionError(formatError(error))
      }
    })
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <header className="mb-7">
        <Link href={`/channel-builder/${channelId}/episodes/new`} className="mb-4 inline-flex items-center gap-2 text-xs text-zinc-500 transition hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Episode Builder</Link>
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300"><ListChecks className="h-4 w-4" /> Episode Quality Gate</div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{context.tracks.length}곡을 생성 전에 검토하세요</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">제목과 편곡 역할을 개별 수정하고, 중복 없는 상태에서만 전체 Episode를 승인합니다.</p>
          </div>
          <StatusPill status={context.episode.status} />
        </div>
      </header>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Music2} label="Final Masters" value={`${context.tracks.length}곡`} accent="violet" />
        <Metric icon={Disc3} label="Suno A/B Candidates" value={`${context.tracks.length * 2}곡`} accent="amber" />
        <Metric icon={Clock3} label="Playlist Length" value={`${totalMinutes}분`} accent="cyan" />
        <Metric icon={Headphones} label="Vocal / Instrumental" value={`${vocalCount} / ${context.tracks.length - vocalCount}`} accent="pink" />
        <Metric icon={AlertTriangle} label="Title Issues" value={`${titleValidation.issues.length}건`} accent={titleValidation.valid ? 'emerald' : 'red'} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] p-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-300"><Fingerprint className="h-4 w-4" /> DNA v{context.dnaVersion.version}</div>
            <h2 className="mt-3 font-semibold text-white">{context.channel.name}</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{context.episode.episodeTitle}</p>
            <dl className="mt-4 space-y-2 border-t border-white/8 pt-4 text-xs">
              <Info label="Genre" value={context.dnaVersion.primaryGenre} />
              <Info label="BPM" value={`${context.dnaVersion.bpmRange[0]}–${context.dnaVersion.bpmRange[1]}`} />
              <Info label="Scene" value={context.episode.situation} />
              <Info label="Daypart" value={context.episode.daypart} />
            </dl>
          </section>

          <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-200"><Sparkles className="h-4 w-4" /> Suno Pair Rule</div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">각 Blueprint는 같은 제목·가사로 A/B 후보 2곡을 생성합니다. 두 후보 중 한 곡만 최종 Master로 채택합니다.</p>
            <div className="mt-4 rounded-xl bg-black/20 p-3 text-xs text-zinc-400">{context.tracks.length} Briefs → <strong className="text-amber-200">{context.tracks.length * 2} Candidates</strong> → {context.tracks.length} Masters</div>
          </section>
        </aside>

        <main>
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#111118]/85 backdrop-blur-xl">
            <div className="flex flex-col justify-between gap-4 border-b border-white/8 p-5 sm:flex-row sm:items-center sm:px-7">
              <div><h2 className="text-lg font-semibold text-white">Track Blueprints</h2><p className="mt-1 text-xs text-zinc-500">수정한 곡만 개별 저장할 수 있습니다.</p></div>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'instrumental', 'vocal', 'issues'] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs capitalize transition ${filter === value ? 'bg-white text-zinc-950' : 'bg-white/5 text-zinc-500 hover:text-white'}`}>{value}</button>)}
              </div>
            </div>
            <div className="space-y-2 p-3 sm:p-5">
              {visibleTracks.length > 0 ? visibleTracks.map((track) => (
                <TrackReviewCard
                  key={`${track.id}-${track.updatedAt}`}
                  track={track}
                  disabled={approved}
                  vocalAllowed={context.dnaVersion.vocalPolicy !== 'none'}
                  hasIssue={issueIds.has(track.id)}
                  onSave={async (update) => replaceTrack(await updateReviewedTrack(channelId, episodeId, track.id, update))}
                  onRegenerate={async () => replaceTrack(await regenerateReviewedTrackTitle(channelId, episodeId, track.id))}
                  onError={setActionError}
                  onDirtyChange={(dirty) => setDirtyTrackIds((current) => {
                    const next = new Set(current)
                    if (dirty) next.add(track.id)
                    else next.delete(track.id)
                    return next
                  })}
                  onBusyChange={(busy) => setBusyTrackIds((current) => {
                    const next = new Set(current)
                    if (busy) next.add(track.id)
                    else next.delete(track.id)
                    return next
                  })}
                />
              )) : <div className="py-16 text-center text-sm text-zinc-600">이 필터에 해당하는 곡이 없습니다.</div>}
            </div>
          </section>

          <section className={`mt-5 rounded-3xl border p-5 sm:p-7 ${approved ? 'border-emerald-400/25 bg-emerald-400/[0.07]' : 'border-white/10 bg-[#111118]'}`}>
            {approved ? (
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-400 text-emerald-950"><BadgeCheck className="h-6 w-6" /></span><div><h2 className="font-semibold text-emerald-200">Episode Blueprint 승인 완료</h2><p className="mt-1 text-xs text-zinc-500">{context.tracks.length}곡이 생성 대기 상태로 잠겼습니다.</p></div></div><Link href={`/channel-builder/${channelId}/episodes/${episodeId}/generation-queue`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200"><Sparkles className="h-4 w-4" /> Generation Queue 준비</Link></div>
            ) : (
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                <div>
                  <h2 className="font-semibold text-white">전체 편성을 최종 승인할까요?</h2>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">승인 후에는 이 화면에서 곡을 수정할 수 없습니다. 다음 생성 단계로 넘어가도 아직 자동 결제되지는 않습니다.</p>
                  {dirtyTrackIds.size > 0 ? <p className="mt-2 text-xs text-amber-300">저장하지 않은 수정 사항이 {dirtyTrackIds.size}곡에 남아 있습니다.</p> : null}
                  <label className="mt-4 flex cursor-pointer items-start gap-3 text-xs text-zinc-400"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-400" /><span>모든 제목·역할·에너지 흐름과 Suno A/B 후보 수를 확인했습니다.</span></label>
                  {actionError ? <p role="alert" className="mt-3 text-xs text-red-300">{actionError}</p> : null}
                </div>
                <button type="button" disabled={!confirmed || !titleValidation.valid || dirtyTrackIds.size > 0 || busyTrackIds.size > 0 || isApproving} onClick={approve} className="inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> {isApproving ? '승인 검사 중…' : `${context.tracks.length}곡 전체 승인`}</button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

function TrackReviewCard({
  track,
  disabled,
  vocalAllowed,
  hasIssue,
  onSave,
  onRegenerate,
  onError,
  onDirtyChange,
  onBusyChange,
}: {
  track: TrackBlueprint
  disabled: boolean
  vocalAllowed: boolean
  hasIssue: boolean
  onSave: (update: TrackReviewUpdate) => Promise<void>
  onRegenerate: () => Promise<void>
  onError: (message: string | null) => void
  onDirtyChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [draft, setDraft] = useState(() => editable(track))
  const [state, setState] = useState<'idle' | 'saving' | 'regenerating' | 'saved'>('idle')
  const dirty = JSON.stringify(draft) !== JSON.stringify(editable(track))

  const changeDraft = (change: Partial<TrackReviewUpdate>) => {
    const next = { ...draft, ...change }
    setDraft(next)
    onDirtyChange(JSON.stringify(next) !== JSON.stringify(editable(track)))
  }

  const run = async (kind: 'saving' | 'regenerating', operation: () => Promise<void>) => {
    setState(kind)
    onBusyChange(true)
    onError(null)
    try {
      await operation()
      onDirtyChange(false)
      setState('saved')
    } catch (error) {
      onError(formatError(error))
      setState('idle')
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <article className={`[content-visibility:auto] [contain-intrinsic-size:170px] rounded-2xl border p-4 transition ${hasIssue ? 'border-red-400/30 bg-red-500/[0.04]' : 'border-white/8 bg-black/10'} ${disabled ? 'opacity-70' : ''}`}>
      <div className="grid gap-3 lg:grid-cols-[48px_minmax(190px,1fr)_120px_82px_90px_minmax(130px,0.7fr)_auto] lg:items-end">
        <div className="pb-2 text-center font-mono text-xs text-zinc-600">{String(track.trackNumber).padStart(2, '0')}</div>
        <Label text="Song title"><input disabled={disabled} className={INPUT} value={draft.songTitle} onChange={(event) => changeDraft({ songTitle: event.target.value })} /></Label>
        <Label text="Role"><select disabled={disabled} className={SELECT} value={draft.role} onChange={(event) => changeDraft({ role: event.target.value as TrackRole })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Label>
        <Label text="Energy"><input disabled={disabled} type="number" min={0} max={100} className={INPUT} value={draft.energy} onChange={(event) => changeDraft({ energy: Number(event.target.value) })} /></Label>
        <Label text="BPM"><input disabled={disabled} type="number" min={20} max={300} className={INPUT} value={draft.bpm} onChange={(event) => changeDraft({ bpm: Number(event.target.value) })} /></Label>
        <Label text="Lead"><input disabled={disabled} className={INPUT} value={draft.leadInstrument} onChange={(event) => changeDraft({ leadInstrument: event.target.value })} /></Label>
        <button disabled={disabled || !dirty || state === 'saving'} type="button" onClick={() => run('saving', () => onSave(draft))} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-30"><Save className="h-3.5 w-3.5" /> {state === 'saving' ? '저장 중' : '저장'}</button>
      </div>
      <div className="mt-3 grid gap-3 border-t border-white/5 pt-3 sm:grid-cols-[110px_minmax(180px,1fr)_auto] sm:items-end">
        <Label text="Key"><input disabled={disabled} className={INPUT} value={draft.musicalKey} onChange={(event) => changeDraft({ musicalKey: event.target.value })} /></Label>
        <Label text="Arrangement variation"><input disabled={disabled} className={INPUT} value={draft.arrangementVariation} onChange={(event) => changeDraft({ arrangementVariation: event.target.value })} /></Label>
        <button type="button" disabled={disabled || (!vocalAllowed && draft.isInstrumental)} onClick={() => changeDraft({ isInstrumental: !draft.isInstrumental })} className={`h-10 rounded-lg border px-3 text-xs transition ${draft.isInstrumental ? 'border-cyan-400/20 bg-cyan-400/5 text-cyan-300' : 'border-pink-400/20 bg-pink-400/5 text-pink-300'} disabled:cursor-not-allowed disabled:opacity-50`}>{draft.isInstrumental ? 'Instrumental' : 'Vocal'}</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
        <div className="flex items-center gap-2 text-[10px] text-zinc-600"><span className={`rounded-full px-2 py-1 ${draft.isInstrumental ? 'bg-cyan-400/10 text-cyan-300' : 'bg-pink-400/10 text-pink-300'}`}>{draft.isInstrumental ? 'Instrumental' : 'Vocal · same lyrics for A/B'}</span><span>{Math.round(track.targetDurationSeconds / 60)} min</span>{hasIssue ? <span className="text-red-300">제목 확인 필요</span> : null}{state === 'saved' ? <span className="flex items-center gap-1 text-emerald-300"><Check className="h-3 w-3" /> 저장됨</span> : null}</div>
        <button disabled={disabled || dirty || state === 'regenerating'} type="button" onClick={() => run('regenerating', onRegenerate)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/20 px-2.5 py-1.5 text-[11px] text-violet-300 transition hover:bg-violet-400/10 disabled:opacity-40"><RefreshCw className={`h-3 w-3 ${state === 'regenerating' ? 'animate-spin' : ''}`} /> 비용 없이 제목 재생성</button>
      </div>
    </article>
  )
}

function formatError(error: unknown) {
  if (error instanceof ChannelBuilderApiError) {
    const field = error.details.field ? ` (${error.details.field})` : ''
    return `${error.message}${field}`
  }
  return error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다.'
}

function StatePanel({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) {
  return <div className="mx-auto mt-20 max-w-lg rounded-2xl border border-white/10 bg-[#111118] p-8 text-center">{loading ? <LoaderCircle className="mx-auto mb-4 h-6 w-6 animate-spin text-violet-300" /> : null}<h1 className="text-lg font-semibold text-white">{title}</h1><p className="mt-2 text-sm leading-6 text-zinc-500">{detail}</p><Link href="/channel-builder" className="mt-5 inline-flex items-center gap-2 text-sm text-violet-300"><ArrowLeft className="h-4 w-4" /> Channel Builder로 돌아가기</Link></div>
}

function StatusPill({ status }: { status: string }) {
  const approved = status === 'approved'
  return <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wider ${approved ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-300'}`}>{approved ? <BadgeCheck className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}{status}</span>
}

function Metric({ icon: Icon, label, value, accent }: { icon: typeof Music2; label: string; value: string; accent: string }) {
  const color: Record<string, string> = { violet: 'text-violet-300', amber: 'text-amber-300', cyan: 'text-cyan-300', pink: 'text-pink-300', emerald: 'text-emerald-300', red: 'text-red-300' }
  return <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-600"><Icon className={`h-3.5 w-3.5 ${color[accent]}`} />{label}</div><p className="mt-2 text-xl font-semibold text-white">{value}</p></div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-zinc-600">{label}</dt><dd className="max-w-36 text-right text-zinc-300">{value}</dd></div>
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return <label><span className="mb-1.5 block text-[10px] uppercase tracking-wider text-zinc-600">{text}</span>{children}</label>
}
