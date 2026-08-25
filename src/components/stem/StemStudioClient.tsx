'use client'

import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileAudio,
  Headphones,
  Loader2,
  Music4,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import MultiTrackPlayer from '@/components/MultiTrackPlayer'
import UploadStemModal from '@/components/UploadStemModal'
import { useStemAudio, type StemId } from '@/hooks/useStemAudio'
import { stopActiveAudio } from '@/lib/globalAudio'

type StemUrlMap = Partial<Record<StemId, string>>

type StemJob = {
  id: string
  title: string
  status: string
  stemStatus: string
  stage: string
  progress: number
  error: string | null
  createdAt: string
  updatedAt: string
  isStemExtracted: boolean
  canRetry: boolean
  previewUrls: StemUrlMap
  originalUrls: StemUrlMap
}

type StemJobsResponse = {
  jobs?: unknown
  error?: string
}

type JobTone = 'queued' | 'processing' | 'delayed' | 'completed' | 'failed'

const ACTIVE_STATUSES = new Set(['pending', 'queued', 'processing', 'cleanup'])
const DELAYED_AFTER_MS = 15 * 60 * 1000

const STAGE_LABELS: Record<string, string> = {
  queued: '대기열 접수',
  claimed: '작업 워커 연결',
  downloading: '원본 오디오 준비',
  separating: 'AI 4채널 분리',
  encoding: '미리듣기 파일 생성',
  uploading: '스템 파일 저장',
  finalizing: '완료 상태 확인',
  completed: '4채널 분리 완료',
  failed: '분리 실패',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseUrlMap(value: unknown): StemUrlMap {
  if (!isRecord(value)) return {}
  const result: StemUrlMap = {}
  for (const id of ['vocals', 'drums', 'bass', 'other'] as StemId[]) {
    if (typeof value[id] === 'string' && value[id]) result[id] = value[id]
  }
  return result
}

function parseJob(value: unknown): StemJob | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  if (!id) return null

  const status = stringValue(value.status, 'pending').toLowerCase()
  const stemStatus = stringValue(value.stemStatus, status).toLowerCase()
  return {
    id,
    title: stringValue(value.title, '업로드 음원'),
    status,
    stemStatus,
    stage: stringValue(value.stage, stemStatus),
    progress: Math.max(0, Math.min(100, numberValue(value.progress, status === 'completed' ? 100 : 0))),
    error: typeof value.error === 'string' && value.error ? value.error : null,
    createdAt: stringValue(value.createdAt, new Date().toISOString()),
    updatedAt: stringValue(value.updatedAt, stringValue(value.createdAt, new Date().toISOString())),
    isStemExtracted: Boolean(value.isStemExtracted),
    canRetry: Boolean(value.canRetry),
    previewUrls: parseUrlMap(value.previewUrls),
    originalUrls: parseUrlMap(value.originalUrls),
  }
}

function parseJobs(value: unknown): StemJob[] {
  if (!Array.isArray(value)) return []
  return value.map(parseJob).filter((job): job is StemJob => Boolean(job))
}

function elapsedLabel(iso: string, now: number): string {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return '경과 시간 확인 불가'
  const seconds = Math.max(0, Math.floor((now - time) / 1000))
  if (seconds < 60) return `${seconds}초 경과`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}분 경과`
  const hours = Math.floor(minutes / 60)
  return `${hours}시간 ${minutes % 60}분 경과`
}

function stageLabel(stage: string, fallback: string): string {
  return STAGE_LABELS[stage.toLowerCase()] || fallback
}

function isComplete(job: StemJob): boolean {
  return job.isStemExtracted || job.stemStatus === 'completed'
}

function isActive(job: StemJob): boolean {
  return ACTIVE_STATUSES.has(job.stemStatus) || ACTIVE_STATUSES.has(job.status)
}

function isDelayed(job: StemJob, now: number): boolean {
  const baseline = new Date(job.updatedAt || job.createdAt).getTime()
  return isActive(job) && Number.isFinite(baseline) && now - baseline >= DELAYED_AFTER_MS
}

function jobTone(job: StemJob, now: number): JobTone {
  if (isComplete(job)) return 'completed'
  if (job.stemStatus === 'failed' || job.status === 'failed' || job.error) return 'failed'
  if (isDelayed(job, now)) return 'delayed'
  if (job.stemStatus === 'processing' || job.stemStatus === 'cleanup' || job.status === 'processing') return 'processing'
  return 'queued'
}

const TONE_UI: Record<JobTone, { label: string; chip: string; bar: string }> = {
  queued: {
    label: '대기열',
    chip: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    bar: 'from-cyan-500 to-blue-400',
  },
  processing: {
    label: 'AI 분리 중',
    chip: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300',
    bar: 'from-fuchsia-500 to-cyan-400',
  },
  delayed: {
    label: '지연 확인 필요',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    bar: 'from-amber-500 to-orange-400',
  },
  completed: {
    label: '완료',
    chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    bar: 'from-emerald-500 to-cyan-400',
  },
  failed: {
    label: '실패',
    chip: 'border-red-500/30 bg-red-500/10 text-red-300',
    bar: 'from-red-500 to-rose-400',
  },
}

function StageIcon({ tone }: { tone: JobTone }) {
  if (tone === 'completed') return <CheckCircle2 className="h-4 w-4" />
  if (tone === 'failed' || tone === 'delayed') return <AlertCircle className="h-4 w-4" />
  return <Loader2 className="h-4 w-4 animate-spin" />
}

function StemPlayer({ job, onOpenUpload }: { job: StemJob; onOpenUpload: () => void }) {
  const stemUrls = useMemo<StemUrlMap>(() => ({
    vocals: job.previewUrls.vocals || job.originalUrls.vocals,
    drums: job.previewUrls.drums || job.originalUrls.drums,
    bass: job.previewUrls.bass || job.originalUrls.bass,
    other: job.previewUrls.other || job.originalUrls.other,
  }), [
    job.previewUrls.vocals,
    job.previewUrls.drums,
    job.previewUrls.bass,
    job.previewUrls.other,
    job.originalUrls.vocals,
    job.originalUrls.drums,
    job.originalUrls.bass,
    job.originalUrls.other,
  ])
  const audio = useStemAudio({ generationId: job.id, stemUrls })
  const { pause, play: playStems } = audio

  useEffect(() => {
    const pauseForOtherAudio = () => pause()
    window.addEventListener('melodio-audio-started', pauseForOtherAudio)
    return () => window.removeEventListener('melodio-audio-started', pauseForOtherAudio)
  }, [pause])

  const play = useCallback(() => {
    stopActiveAudio()
    playStems()
  }, [playStems])

  return (
    <MultiTrackPlayer
      generationId={job.id}
      stemUrls={stemUrls}
      stemStates={audio.stemStates}
      allLoaded={audio.allLoaded}
      hasLoadError={audio.hasLoadError}
      isPlaying={audio.isPlaying}
      currentTime={audio.currentTime}
      duration={audio.duration}
      originalWavUrls={audio.originalWavUrls}
      originalWavRefs={job.originalUrls}
      onOpenUpload={onOpenUpload}
      play={play}
      pause={pause}
      reset={audio.reset}
      seek={audio.seek}
      toggleMute={audio.toggleMute}
      toggleSolo={audio.toggleSolo}
      setVolume={audio.setVolume}
    />
  )
}

export default function StemStudioClient({ initialJobId = '' }: { initialJobId?: string }) {
  const [jobs, setJobs] = useState<StemJob[]>([])
  const [selectedId, setSelectedId] = useState(initialJobId)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const loadJobs = useCallback(async (quiet = false, preferredId = '') => {
    if (!quiet) setIsRefreshing(true)
    try {
      const response = await fetch('/api/stems/jobs', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as StemJobsResponse
      if (!response.ok) throw new Error(payload.error || '스템 작업 목록을 불러오지 못했습니다.')

      const nextJobs = parseJobs(payload.jobs)
      setJobs(nextJobs)
      setSelectedId((current) => {
        const requested = preferredId || current || initialJobId
        if (requested && nextJobs.some((job) => job.id === requested)) return requested
        return nextJobs[0]?.id || ''
      })
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '스템 작업 목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [initialJobId])

  useEffect(() => {
    loadJobs(false)
  }, [loadJobs])

  const hasActiveJob = jobs.some(isActive)
  useEffect(() => {
    if (!hasActiveJob) return
    const timer = window.setInterval(() => loadJobs(true), 5_000)
    return () => window.clearInterval(timer)
  }, [hasActiveJob, loadJobs])

  // 완료 작업의 비공개 재생/다운로드 URL도 만료 전에 다시 발급받는다.
  useEffect(() => {
    const timer = window.setInterval(() => loadJobs(true), 10 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [loadJobs])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const selectedJob = jobs.find((job) => job.id === selectedId) || null
  const activeCount = jobs.filter(isActive).length
  const completedCount = jobs.filter(isComplete).length
  const attentionCount = jobs.filter((job) => {
    const tone = jobTone(job, now)
    return tone === 'failed' || tone === 'delayed'
  }).length

  const retryJob = useCallback(async (job: StemJob) => {
    const tone = jobTone(job, Date.now())
    if (tone !== 'failed' && tone !== 'delayed') return
    if (!window.confirm(`'${job.title}' 스템 분리를 다시 시작할까요?`)) return

    setRetryingId(job.id)
    setActionMessage(null)
    try {
      const response = await fetch('/api/stems/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: job.id, action: 'retry' }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || '재시도 요청을 접수하지 못했습니다.')
      setActionMessage({ text: '재시도 요청을 접수했습니다. 상태를 자동으로 새로고침합니다.', error: false })
      await loadJobs(true, job.id)
    } catch (error) {
      setActionMessage({
        text: error instanceof Error ? error.message : '재시도 요청에 실패했습니다.',
        error: true,
      })
    } finally {
      setRetryingId(null)
    }
  }, [loadJobs])

  const handleUploadSuccess = useCallback((generationId: string) => {
    setSelectedId(generationId)
    setActionMessage({ text: '업로드가 완료되어 스템 분리 대기열에 추가했습니다.', error: false })
    loadJobs(true, generationId)
  }, [loadJobs])

  const deleteJob = useCallback(async (job: StemJob) => {
    if (isActive(job)) return
    if (!window.confirm(`'${job.title}' 작업과 원본·스템 파일을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return

    setDeletingId(job.id)
    setActionMessage(null)
    try {
      const response = await fetch(`/api/generations?id=${encodeURIComponent(job.id)}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Stem 작업을 삭제하지 못했습니다.')
      setActionMessage({ text: 'Stem 작업과 저장된 원본·분리 파일을 삭제했습니다.', error: false })
      await loadJobs(true)
    } catch (error) {
      setActionMessage({
        text: error instanceof Error ? error.message : 'Stem 작업 삭제에 실패했습니다.',
        error: true,
      })
    } finally {
      setDeletingId(null)
    }
  }, [loadJobs])

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-24 pt-4">
      <header className="overflow-hidden rounded-3xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-950/50 via-zinc-950 to-cyan-950/40 p-6 shadow-2xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/25 to-cyan-400/20 shadow-lg shadow-fuchsia-950/40">
              <Headphones className="h-7 w-7 text-fuchsia-200" />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-cyan-300">PRIVATE WORKSPACE</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-zinc-400">업로드 음원 ≠ AI 생성곡</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Stem Studio</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">내 오디오를 업로드해 4채널로 분리하고, 작업 상태와 오류를 확인한 뒤 완료된 스템을 바로 재생합니다.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white">대시보드로</Link>
            <button type="button" onClick={() => setIsUploadOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-fuchsia-950/40 transition hover:brightness-110">
              <UploadCloud className="h-4 w-4" />내 오디오 업로드
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: '진행 중', value: activeCount, color: 'text-cyan-300' },
          { label: '완료', value: completedCount, color: 'text-emerald-300' },
          { label: '확인 필요', value: attentionCount, color: 'text-amber-300' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-4">
            <p className="text-[11px] font-semibold text-zinc-500">{stat.label}</p>
            <p className={`mt-1 text-2xl font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </section>

      {actionMessage && (
        <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs ${actionMessage.error ? 'border-red-500/20 bg-red-500/8 text-red-200' : 'border-cyan-500/20 bg-cyan-500/8 text-cyan-200'}`}>
          {actionMessage.error ? <AlertCircle className="h-4 w-4 shrink-0" /> : <Sparkles className="h-4 w-4 shrink-0" />}{actionMessage.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="h-fit rounded-3xl border border-white/8 bg-[#111118] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">내 Stem 작업</h2>
              <p className="mt-1 text-[11px] text-zinc-500">최신 업로드 기준</p>
            </div>
            <button type="button" onClick={() => loadJobs(false)} disabled={isRefreshing} title="새로고침" className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:text-white disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadError && (
            <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-300">
              <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{loadError}</span></div>
              <button type="button" onClick={() => loadJobs(false)} className="mt-2 font-bold text-red-200 underline underline-offset-2">다시 불러오기</button>
            </div>
          )}

          <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />작업을 불러오는 중…</div>
            ) : jobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                <FileAudio className="mx-auto h-7 w-7 text-zinc-600" />
                <p className="mt-3 text-xs font-semibold text-zinc-300">아직 Stem 작업이 없습니다.</p>
                <button type="button" onClick={() => setIsUploadOpen(true)} className="mt-3 text-xs font-bold text-fuchsia-300 hover:text-fuchsia-200">첫 음원 업로드</button>
              </div>
            ) : jobs.map((job) => {
              const tone = jobTone(job, now)
              const toneUi = TONE_UI[tone]
              const selected = selectedId === job.id
              return (
                <button key={job.id} type="button" onClick={() => setSelectedId(job.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? 'border-fuchsia-500/35 bg-fuchsia-500/8' : 'border-white/6 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-white">{job.title}</p>
                      <p className="mt-1 text-[10px] font-semibold text-zinc-500">업로드 음원 · {elapsedLabel(job.createdAt, now)}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${toneUi.chip}`}><StageIcon tone={tone} />{toneUi.label}</span>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/8">
                    <div className={`h-full rounded-full bg-gradient-to-r ${toneUi.bar} transition-[width] duration-500`} style={{ width: `${tone === 'delayed' ? Math.max(job.progress, 70) : job.progress}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="min-w-0">
          {!selectedJob ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center">
              <Music4 className="h-10 w-10 text-fuchsia-400" />
              <h2 className="mt-4 text-lg font-bold text-white">분리할 오디오를 업로드하세요.</h2>
              <p className="mt-2 max-w-md text-xs leading-5 text-zinc-500">업로드 음원은 일반 AI 생성곡과 섞이지 않고 이 Stem Studio에서만 관리됩니다.</p>
              <button type="button" onClick={() => setIsUploadOpen(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-fuchsia-500"><UploadCloud className="h-4 w-4" />오디오 업로드</button>
            </div>
          ) : isComplete(selectedJob) ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <div><p className="text-xs font-bold text-white">{selectedJob.title}</p><p className="mt-0.5 text-[10px] font-semibold text-emerald-300">업로드 음원 · 4채널 분리 완료</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">{elapsedLabel(selectedJob.createdAt, now)}</span>
                  <button type="button" onClick={() => deleteJob(selectedJob)} disabled={deletingId === selectedJob.id} className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/8 px-2.5 py-1.5 text-[10px] font-bold text-red-200 hover:bg-red-500/15 disabled:opacity-50">
                    {deletingId === selectedJob.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}삭제
                  </button>
                </div>
              </div>
              <StemPlayer job={selectedJob} onOpenUpload={() => setIsUploadOpen(true)} />
            </div>
          ) : (() => {
            const tone = jobTone(selectedJob, now)
            const toneUi = TONE_UI[tone]
            const canRetry = selectedJob.canRetry && (tone === 'failed' || tone === 'delayed')
            const progress = tone === 'delayed' ? Math.max(selectedJob.progress, 70) : selectedJob.progress
            return (
              <div className="rounded-3xl border border-white/8 bg-[#111118] p-6 sm:p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${toneUi.chip}`}><StageIcon tone={tone} /></div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-white">{selectedJob.title}</h2><span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold text-zinc-400">업로드 음원</span></div>
                      <p className="mt-2 text-xs text-zinc-400">{toneUi.label} · {elapsedLabel(selectedJob.createdAt, now)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => loadJobs(false, selectedJob.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold text-zinc-300 hover:bg-white/10"><RefreshCw className="h-3.5 w-3.5" />새로고침</button>
                    {canRetry && (
                      <button type="button" onClick={() => retryJob(selectedJob)} disabled={retryingId === selectedJob.id} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-200 hover:bg-amber-500/15 disabled:opacity-50">
                        {retryingId === selectedJob.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}재시도
                      </button>
                    )}
                    {tone === 'failed' && (
                      <button type="button" onClick={() => deleteJob(selectedJob)} disabled={deletingId === selectedJob.id} className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-[11px] font-bold text-red-200 hover:bg-red-500/15 disabled:opacity-50">
                        {deletingId === selectedJob.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}삭제
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-8">
                  <div className="mb-2 flex items-center justify-between text-[11px]"><span className="font-semibold text-zinc-400">{stageLabel(selectedJob.stage, toneUi.label)}</span><span className="font-mono font-bold text-white">{progress}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/8"><div className={`h-full rounded-full bg-gradient-to-r ${toneUi.bar} transition-[width] duration-500`} style={{ width: `${progress}%` }} /></div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold">
                    <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 py-2 text-emerald-300">업로드 완료</div>
                    <div className={`rounded-xl border py-2 ${tone === 'queued' ? 'border-cyan-500/25 bg-cyan-500/8 text-cyan-300' : 'border-emerald-500/15 bg-emerald-500/5 text-emerald-300'}`}>대기열 접수</div>
                    <div className={`rounded-xl border py-2 ${tone === 'failed' ? 'border-red-500/25 bg-red-500/8 text-red-300' : tone === 'delayed' ? 'border-amber-500/25 bg-amber-500/8 text-amber-300' : 'border-fuchsia-500/25 bg-fuchsia-500/8 text-fuchsia-300'}`}>4채널 분리</div>
                  </div>
                </div>

                {(tone === 'delayed' || tone === 'failed') && (
                  <div className={`mt-6 rounded-2xl border p-4 text-xs leading-5 ${tone === 'failed' ? 'border-red-500/20 bg-red-500/8 text-red-200' : 'border-amber-500/20 bg-amber-500/8 text-amber-100'}`}>
                    <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-bold">{tone === 'failed' ? '스템 분리가 완료되지 않았습니다.' : '15분 이상 상태 갱신이 없습니다.'}</p><p className="mt-1 opacity-80">{selectedJob.error || (selectedJob.canRetry ? '작업 워커가 중단되었을 수 있습니다. 새로고침 후 같으면 재시도하세요.' : '이전 업로드 작업입니다. 새 파일로 다시 업로드해 주세요.')}</p></div></div>
                  </div>
                )}

                {tone !== 'delayed' && tone !== 'failed' && (
                  <div className="mt-6 flex items-start gap-2 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-xs leading-5 text-zinc-400"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" /><p>페이지를 열어 두면 5초마다 상태를 확인합니다. 다른 페이지로 이동해도 작업은 배경에서 계속됩니다.</p></div>
                )}
              </div>
            )
          })()}
        </main>
      </div>

      <UploadStemModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} onSuccess={handleUploadSuccess} />
    </div>
  )
}
