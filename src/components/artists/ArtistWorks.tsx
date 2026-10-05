'use client'

import { useEffect, useState } from 'react'
import { Disc3, Loader2, RefreshCw } from 'lucide-react'
import { getSingingSampleUrl } from '@/lib/voice/singing-sample-url'
import { artistResponse } from './artist-form'

type ArtistWork = { id: string; title: string; status: string; audioUrl: string | null; coverArtUrl: string | null; createdAt: string; artistRevision: number }
const WORK_STATUS: Record<string, string> = { completed: '완료', pending: '대기 중', processing: '제작 중', generating: '제작 중', failed: '제작 실패', submitted: '접수됨' }

export function ArtistWorks({ artistId, artistName }: { artistId: string; artistName: string }) {
  const [works, setWorks] = useState<ArtistWork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      setLoading(true); setError('')
      try {
        const data = await artistResponse<{ works: ArtistWork[] }>(await fetch(`/api/artists/${encodeURIComponent(artistId)}/works`, { cache: 'no-store', signal: controller.signal }))
        if (!Array.isArray(data.works)) throw new Error('음원 목록을 확인하지 못했습니다.')
        if (!controller.signal.aborted) setWorks(data.works)
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '음원을 불러오지 못했습니다.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [artistId, refresh])
  return <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
    <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Disc3 size={18} className="text-purple-300" />{artistName}의 음원</h2><button type="button" aria-label="아티스트 음원 새로고침" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button></div>
    <p className="mt-2 text-xs leading-relaxed text-zinc-500">이 가수를 선택해 제작한 곡과 제작 당시의 승인 버전을 확인합니다.</p>
    {loading ? <p className="mt-5 flex items-center gap-2 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" />음원을 불러오는 중…</p> : error ? <p role="alert" className="mt-5 text-sm text-rose-300">{error}</p> : !works.length ? <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-sm text-zinc-500">이 가수로 제작한 음원이 아직 없습니다. 승인한 가수를 뮤직 스튜디오에서 선택해 첫 곡을 만드세요.</p> : <div className="mt-4 space-y-3">{works.map(work => {
      const audioUrl = work.status === 'completed' ? getSingingSampleUrl(work.audioUrl) : null
      return <article key={work.id} className="rounded-xl border border-white/10 bg-black/15 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{work.title || '제목 없는 곡'}</h3><span className="text-xs text-zinc-500">{WORK_STATUS[work.status] || '상태 확인 중'}</span></div><p className="mt-1.5 text-xs text-zinc-500">{new Date(work.createdAt).toLocaleDateString('ko-KR')} · 승인 버전 {work.artistRevision + 1}</p>{audioUrl && <audio aria-label={`${work.title || '가수 음원'} 재생`} controls preload="none" src={audioUrl} className="mt-3 h-10 w-full" />}</article>
    })}</div>}
  </section>
}
