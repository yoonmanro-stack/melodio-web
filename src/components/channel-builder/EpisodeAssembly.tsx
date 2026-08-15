'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import {
  ArrowLeft, BadgeCheck, Clock3, Copy, Download, FileAudio, Layers3,
  LoaderCircle, Music2, PackageCheck, Play, RefreshCw,
} from 'lucide-react'
import { ChannelBuilderApiError } from '@/lib/channel-system/channel-builder-client'
import {
  createEpisodeAssembly,
  getEpisodeAssembly,
  queueEpisodeAssembly,
} from '@/lib/channel-system/episode-assembly-client'
import { formatPlaylistTimestamp } from '@/lib/channel-system/episode-assembly'
import type { EpisodeAssemblyContext } from '@/lib/channel-system/episode-assembly-service'

interface Props { channelId: string; episodeId: string }

export function EpisodeAssembly({ channelId, episodeId }: Props) {
  const [context, setContext] = useState<EpisodeAssemblyContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const controller = new AbortController()
    getEpisodeAssembly(channelId, episodeId, controller.signal).then(setContext).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(formatError(reason))
    })
    return () => controller.abort()
  }, [channelId, episodeId])

  const assemblyStatus = context?.assembly?.status
  useEffect(() => {
    if (assemblyStatus !== 'queued' && assemblyStatus !== 'assembling') return
    const timer = window.setInterval(() => {
      getEpisodeAssembly(channelId, episodeId).then(setContext).catch(() => undefined)
    }, 8_000)
    return () => window.clearInterval(timer)
  }, [assemblyStatus, channelId, episodeId])

  const run = (operation: () => Promise<EpisodeAssemblyContext>) => {
    setError(null)
    startTransition(async () => {
      try { setContext(await operation()) } catch (reason) { setError(formatError(reason)) }
    })
  }

  if (error && !context) return <State title="Episode Assembly를 열 수 없습니다" detail={error} />
  if (!context) return <State title="Assembly 정보를 불러오는 중" detail="확정 Master와 실제 재생시간을 확인하고 있습니다." loading />

  const total = context.queue.review.tracks.length
  const selected = context.queue.items.filter((item) => item.selectedCandidateId).length
  const assembly = context.assembly
  const target = context.queue.review.episode.targetDurationSeconds
  const actual = assembly?.totalDurationSeconds || 0
  const delta = actual - target

  return (
    <div className="mx-auto min-h-full w-full max-w-[1350px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <header className="mb-7">
        <Link href={`/channel-builder/${channelId}/episodes/${episodeId}/generation-queue`} className="mb-4 inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Generation Console</Link>
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300"><Layers3 className="h-4 w-4" /> Episode Assembly</div><h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{context.queue.review.episode.episodeTitle}</h1><p className="mt-3 text-sm text-zinc-400">확정 Master를 Track 순서대로 연결하고 실제 길이로 타임스탬프를 계산합니다.</p></div><Status value={assembly?.status || 'not_created'} /></div>
      </header>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Music2} label="Selected Masters" value={`${selected} / ${total}`} />
        <Metric icon={Clock3} label="Target Duration" value={formatLong(target)} />
        <Metric icon={FileAudio} label="Actual Duration" value={actual ? formatLong(actual) : '—'} />
        <Metric icon={RefreshCw} label="Target Delta" value={actual ? `${delta >= 0 ? '+' : '−'}${formatLong(Math.abs(delta))}` : '—'} />
      </section>

      {!assembly ? (
        <section className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.05] p-8"><h2 className="text-xl font-semibold text-white">Gapless Assembly Plan 생성</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">Track Blueprint 순서를 그대로 유지하고, 선택된 Master의 실제 길이를 누적해 시작·종료 시각과 YouTube Tracklist를 만듭니다. 크로스페이드나 임의 무음은 넣지 않습니다.</p><button type="button" disabled={pending || selected !== total} onClick={() => run(() => createEpisodeAssembly(channelId, episodeId))} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-cyan-950 disabled:opacity-40"><Layers3 className="h-4 w-4" />{pending ? 'Plan 계산 중…' : `${total}곡 Assembly Plan 생성`}</button>{selected !== total ? <p className="mt-3 text-xs text-amber-300">Generation Console에서 모든 Master를 먼저 선택해야 합니다.</p> : null}</section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="overflow-hidden rounded-3xl border border-white/10 bg-[#111118]"><div className="grid grid-cols-[54px_minmax(0,1fr)_90px_90px] border-b border-white/8 px-4 py-3 text-[10px] uppercase tracking-wider text-zinc-600 sm:grid-cols-[54px_minmax(0,1fr)_110px_110px_90px]"><span>#</span><span>Master</span><span>Start</span><span className="hidden sm:block">End</span><span>Duration</span></div>{context.items.map((item) => <div key={item.id} className="grid grid-cols-[54px_minmax(0,1fr)_90px_90px] items-center border-b border-white/5 px-4 py-3 text-xs last:border-0 sm:grid-cols-[54px_minmax(0,1fr)_110px_110px_90px]"><span className="font-mono text-zinc-600">{String(item.trackNumber).padStart(2, '0')}</span><div className="min-w-0"><p className="truncate text-zinc-200">{item.title}</p><audio className="mt-2 h-7 w-full max-w-sm" controls preload="none" src={item.audioUrl} /></div><span className="font-mono text-cyan-300">{formatPlaylistTimestamp(item.startSeconds)}</span><span className="hidden font-mono text-zinc-500 sm:block">{formatPlaylistTimestamp(item.endSeconds)}</span><span className="text-zinc-500">{formatTrackDuration(item.durationSeconds)}</span></div>)}</main>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start"><section className="rounded-2xl border border-white/10 bg-[#111118] p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">YouTube Tracklist</h2><button type="button" onClick={async () => { await navigator.clipboard.writeText(assembly.tracklistText); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }} className="inline-flex items-center gap-1.5 text-xs text-cyan-300"><Copy className="h-3.5 w-3.5" />{copied ? '복사됨' : '복사'}</button></div><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 p-4 font-mono text-xs leading-6 text-zinc-400">{assembly.tracklistText}</pre></section>
            {assembly.status === 'draft' || assembly.status === 'failed' ? <button type="button" disabled={pending} onClick={() => run(() => queueEpisodeAssembly(channelId, episodeId))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-50"><Play className="h-4 w-4" />{pending ? '작업 등록 중…' : assembly.status === 'failed' ? 'Assembly 다시 실행' : '실제 오디오 조립 시작'}</button> : null}
            {assembly.status === 'queued' || assembly.status === 'assembling' ? <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5"><div className="flex items-center gap-2 text-sm text-amber-200"><LoaderCircle className="h-4 w-4 animate-spin" />Worker 조립 중</div><p className="mt-2 text-xs leading-5 text-zinc-500">원본을 다운로드하고 ffprobe로 길이를 다시 측정한 뒤 320kbps MP3로 연결합니다.</p></section> : null}
            {assembly.status === 'completed' && assembly.outputAudioUrl ? <section className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-5"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><BadgeCheck className="h-4 w-4" />Episode Audio 완료</div><audio className="mt-4 h-10 w-full" controls preload="metadata" src={assembly.outputAudioUrl} /><a href={assembly.outputAudioUrl} download className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-emerald-400/25 px-3 py-2 text-xs text-emerald-300"><Download className="h-3.5 w-3.5" />Episode MP3 다운로드</a><Link href={`/channel-builder/${channelId}/episodes/${episodeId}/publish-package`} className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-950"><PackageCheck className="h-3.5 w-3.5" />Publish Package</Link></section> : null}
            {assembly.errorMessage ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{assembly.errorMessage}</p> : null}{error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{error}</p> : null}</aside>
        </div>
      )}
    </div>
  )
}

function formatTrackDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` }
function formatLong(seconds: number) { return formatPlaylistTimestamp(seconds) }
function formatError(error: unknown) { return error instanceof ChannelBuilderApiError || error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다.' }
function Status({ value }: { value: string }) { return <span className="w-fit rounded-full border border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-2 text-xs font-semibold uppercase text-cyan-300">{value}</span> }
function Metric({ icon: Icon, label, value }: { icon: typeof Music2; label: string; value: string }) { return <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-600"><Icon className="h-3.5 w-3.5 text-cyan-300" />{label}</div><p className="mt-2 text-xl font-semibold text-white">{value}</p></div> }
function State({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) { return <div className="mx-auto mt-20 max-w-lg rounded-2xl border border-white/10 bg-[#111118] p-8 text-center">{loading ? <LoaderCircle className="mx-auto mb-4 h-6 w-6 animate-spin text-cyan-300" /> : null}<h1 className="text-lg font-semibold text-white">{title}</h1><p className="mt-2 text-sm text-zinc-500">{detail}</p></div> }
