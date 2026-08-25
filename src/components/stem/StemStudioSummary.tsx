'use client'

import Link from 'next/link'
import { AlertCircle, CheckCircle2, Headphones, Loader2, MoveRight } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type SummaryJob = {
  id: string
  title: string
  status: string
  stemStatus: string
  progress: number
  updatedAt: string
  isStemExtracted: boolean
  error: string | null
}

const DELAYED_AFTER_MS = 15 * 60 * 1000

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function parseJobs(value: unknown): SummaryJob[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const row = asRecord(entry)
    if (!row || typeof row.id !== 'string') return []
    const status = typeof row.status === 'string' ? row.status.toLowerCase() : 'pending'
    const stemStatus = typeof row.stemStatus === 'string' ? row.stemStatus.toLowerCase() : status
    return [{
      id: row.id,
      title: typeof row.title === 'string' ? row.title : '업로드 음원',
      status,
      stemStatus,
      progress: typeof row.progress === 'number' ? Math.max(0, Math.min(100, row.progress)) : 0,
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
      isStemExtracted: Boolean(row.isStemExtracted),
      error: typeof row.error === 'string' && row.error ? row.error : null,
    }]
  })
}

function stateOf(job: SummaryJob): 'active' | 'completed' | 'attention' {
  if (job.isStemExtracted || job.stemStatus === 'completed') return 'completed'
  const updatedAt = new Date(job.updatedAt).getTime()
  const delayed = Number.isFinite(updatedAt) && Date.now() - updatedAt >= DELAYED_AFTER_MS
  if (job.error || job.stemStatus === 'failed' || job.status === 'failed' || delayed) return 'attention'
  return 'active'
}

export default function StemStudioSummary() {
  const [jobs, setJobs] = useState<SummaryJob[]>([])
  const [unavailable, setUnavailable] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/stems/jobs', { cache: 'no-store' })
      if (!response.ok) throw new Error('load failed')
      const payload = await response.json() as { jobs?: unknown }
      setJobs(parseJobs(payload.jobs).slice(0, 3))
      setUnavailable(false)
    } catch {
      setUnavailable(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const hasActive = jobs.some((job) => stateOf(job) === 'active')
  useEffect(() => {
    if (!hasActive) return
    const timer = window.setInterval(load, 10_000)
    return () => window.clearInterval(timer)
  }, [hasActive, load])

  return (
    <section className="mt-8 overflow-hidden rounded-3xl border border-fuchsia-500/15 bg-gradient-to-r from-fuchsia-950/25 via-[#111118] to-cyan-950/20 p-5 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/10">
            <Headphones className="h-5 w-5 text-fuchsia-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white">Stem Studio</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold text-zinc-400">업로드 음원 전용</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">음원 업로드·4채널 분리·재생을 생성곡과 분리해 관리합니다.</p>
          </div>
        </div>
        <Link href="/stem-studio" className="inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/10 px-4 py-2.5 text-xs font-bold text-fuchsia-200 transition hover:bg-fuchsia-500/15 hover:text-white">
          Stem Studio 열기<MoveRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {jobs.length > 0 ? jobs.map((job) => {
          const state = stateOf(job)
          return (
            <Link key={job.id} href={`/stem-studio?job=${encodeURIComponent(job.id)}`} className="rounded-2xl border border-white/7 bg-white/[0.025] p-3 transition hover:border-white/15 hover:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold text-zinc-200">{job.title}</p>
                {state === 'completed' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : state === 'attention' ? <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-400" />}
              </div>
              <p className={`mt-1 text-[10px] font-semibold ${state === 'completed' ? 'text-emerald-400' : state === 'attention' ? 'text-amber-400' : 'text-cyan-400'}`}>
                {state === 'completed' ? '4채널 분리 완료' : state === 'attention' ? '지연/오류 확인 필요' : `${job.stemStatus === 'processing' || job.stemStatus === 'cleanup' ? 'AI 분리 중' : '대기열'} · ${job.progress}%`}
              </p>
            </Link>
          )
        }) : (
          <div className="md:col-span-3 rounded-2xl border border-dashed border-white/8 px-4 py-3 text-xs text-zinc-500">
            {unavailable ? '상태를 불러오지 못했습니다. Stem Studio에서 다시 확인해 주세요.' : '아직 업로드 Stem 작업이 없습니다.'}
          </div>
        )}
      </div>
    </section>
  )
}
