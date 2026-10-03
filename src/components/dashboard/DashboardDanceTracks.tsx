'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { registerActiveAudio } from '@/lib/globalAudio';
import {
  dashboardDanceDownloadUrl,
  getDashboardDanceAudio,
  getDashboardDanceProductionRows,
  type DashboardDanceTrack,
} from '@/lib/dance/dashboard';

export function DashboardDanceProductionList({ history, userId }: { history: DashboardDanceTrack[]; userId: string | null }) {
  const rows = getDashboardDanceProductionRows(history, userId);
  if (rows.length === 0) return null;
  return <section aria-label="댄스·챌린지 작업" className="mt-6 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-950/10 p-5">
    <h2 className="text-sm font-bold text-fuchsia-200">댄스·챌린지 작업</h2>
    <ul className="mt-3 space-y-3">
      {rows.map(({ track, statusLabel }) => <li key={track.id} className="flex items-center justify-between gap-3 text-xs">
        <div className="min-w-0">
          <p className="truncate font-semibold text-zinc-200">{track.title || '새 댄스 영상'}</p>
          <p role="status" className="mt-1 text-zinc-400">{statusLabel}</p>
        </div>
        <Link href={`/viral?danceTrack=${encodeURIComponent(track.id)}`} className="shrink-0 text-fuchsia-300">작업 열기</Link>
      </li>)}
    </ul>
  </section>;
}

export function DashboardDanceAudio({ track }: { track: DashboardDanceTrack }) {
  const audio = getDashboardDanceAudio(track);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const player = audioRef.current;
    return () => { player?.pause(); };
  }, [track.id, audio?.fullAudioUrl]);
  if (!audio) return null;
  return <section aria-label="댄스 음원 듣기 및 다운로드" className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
    <div>
      <h4 className="text-sm font-bold text-emerald-200">전체 원본 음원</h4>
      <p className="mt-1 text-xs text-zinc-300">{audio.title}</p>
    </div>
    {audio.fullAudioUrl ? <>
      <audio key={audio.fullAudioUrl} ref={audioRef} aria-label="전체 원본 음원 듣기" src={audio.fullAudioUrl} controls preload="none" className="h-11 w-full" onPlay={event => registerActiveAudio(event.currentTarget)} />
      <a href={dashboardDanceDownloadUrl(audio.fullAudioUrl, audio.title, 'full')} download className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20">
        <Download className="h-3.5 w-3.5" />전체 음원 MP3 다운로드
      </a>
    </> : <p className="text-xs text-zinc-400">전체 음원을 준비하고 있습니다.</p>}
    {audio.clipAudioUrl ? <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-xs text-zinc-300">영상에 사용하는 저장된 30초 구간</p>
      <a href={dashboardDanceDownloadUrl(audio.clipAudioUrl, audio.title, 'clip')} download className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-2 text-xs font-bold text-fuchsia-200 hover:bg-fuchsia-500/20">
        <Download className="h-3.5 w-3.5" />30초 음원 WAV 다운로드
      </a>
    </div> : null}
  </section>;
}
