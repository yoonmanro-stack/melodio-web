'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, Film, Lock, Music4, Pause, Play, RefreshCw, Sparkles } from 'lucide-react';
import { DANCE_PRESET, type DanceTrack, type DanceVideoJob } from '@/lib/dance/preset';
import { registerActiveAudio } from '@/lib/globalAudio';

const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-400/50 bg-fuchsia-950 px-5 py-3 font-bold text-fuchsia-100 transition enabled:hover:bg-fuchsia-900 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-900 disabled:text-zinc-300';
const field = 'w-full rounded-xl border border-white/20 bg-zinc-950 p-3 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:border-fuchsia-400';
const active = (job: DanceVideoJob | null) => Boolean(job && !['ready', 'completed', 'attention'].includes(job.status));
const clock = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
const statusCopy: Record<DanceVideoJob['status'], string> = {
  preparing: '선택한 음원으로 영상 기획 중…', ready: '영상 기획이 준비됐습니다.',
  image: '주인공과 배경 준비 중…', clip1: '첫 번째 15초 영상 생성 중…',
  bridge: '두 영상의 연결 장면 준비 중…', clip2: '두 번째 15초 영상 생성 중…',
  render: '선택한 음악과 영상 합치는 중…', completed: '30초 영상이 완성됐습니다.', attention: '작업 상태를 확인해 주세요.',
};

async function jsonRequest<T>(url: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), cache: 'no-store', signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(typeof data.error === 'string' ? data.error : '요청을 확인하지 못했습니다. 상태를 다시 확인해 주세요.');
  return data as T;
}

export default function DanceChallengeStudio({ userId, initialTrackId = '', onBusyChange, onCompleted }: {
  userId: string | null; initialTrackId?: string; onBusyChange: (busy: boolean) => void; onCompleted: (id: string) => void;
}) {
  const [tracks, setTracks] = useState<DanceTrack[]>([]);
  const [trackId, setTrackId] = useState(initialTrackId);
  const [isPublic, setIsPublic] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [startSeconds, setStartSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visualBrief, setVisualBrief] = useState('');
  const [job, setJob] = useState<DanceVideoJob | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [listenPosition, setListenPosition] = useState(0);
  const [pendingAction, setPendingAction] = useState<'music' | 'prepare' | 'start' | 'reuse' | 'retry-plan' | null>(null);
  const requestId = useRef<string | null>(null);
  const reuseRequest = useRef<{ source: string; id: string } | null>(null);
  const handoff = useRef<{ userId: string; trackId: string; brief: string; job: DanceVideoJob | null; uncertain: boolean } | null>(null);
  const revision = useRef(0);
  const audio = useRef<HTMLAudioElement>(null);
  const previewAudio = useRef<HTMLAudioElement>(null);
  const clipAudio = useRef<HTMLAudioElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const completedNotice = useRef('');
  const inRequest = useRef(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const previousUser = useRef(userId);
  const selectedTrackRef = useRef(trackId);
  selectedTrackRef.current = trackId;
  const track = tracks.find(t => t.id === trackId);
  const musicPending = Boolean(track && ['generating', 'pending'].includes(track.status));
  const videoPending = active(job);
  const busy = pending || musicPending || videoPending;
  const audioReady = track?.status === 'completed' && Boolean(track.audioUrl);
  const fullDuration = duration || track?.durationSeconds || 0;
  const maxStart = Math.max(0, fullDuration - 30);
  const lockedClip = track?.savedClip;
  const clipReady = Boolean(lockedClip) || fullDuration >= 30;
  const savedAudioUrl = job?.audioUrl || lockedClip?.audioUrl;
  const rangeFrozen = Boolean(lockedClip);
  const canRetryPlan = Boolean(job?.status === 'attention' && job.audioUrl && !job.plan && !job.inFlight && !job.imageUrl && !job.clip1RequestId && !job.clip2RequestId);
  const selectionChanged = Boolean(job && (Math.abs(job.startSeconds - startSeconds) > 0.001 || job.visualBrief !== visualBrief.trim()));
  const frozen = Boolean(job && job.status !== 'ready' && !(job.status === 'attention' && !job.planningSubmitted && !job.inFlight));

  useEffect(() => {
    if (previousUser.current !== null && previousUser.current !== userId) {
      revision.current += 1; audio.current?.pause(); previewAudio.current?.pause(); clipAudio.current?.pause(); video.current?.pause();
      setTracks([]); setTrackId(''); setJob(null); setVisualBrief(''); setError(''); setUncertain(false); requestId.current = null; reuseRequest.current = null; handoff.current = null;
    }
    previousUser.current = userId;
  }, [userId]);
  useEffect(() => { if (track) setIsPublic(track.isPublic); }, [track?.id, track?.isPublic]);
  useEffect(() => { if (lockedClip) setStartSeconds(lockedClip.startSeconds); }, [trackId, lockedClip?.startSeconds]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => () => { revision.current += 1; audio.current?.pause(); previewAudio.current?.pause(); clipAudio.current?.pause(); video.current?.pause(); }, []);
  useEffect(() => {
    if (job?.status === 'completed' && completedNotice.current !== job.id) {
      completedNotice.current = job.id; onCompleted(job.id);
    }
  }, [job, onCompleted]);

  const refreshTracks = useCallback(async (signal?: AbortSignal) => {
    if (!userId) { setTracks([]); return []; }
    const result = await jsonRequest<{ tracks: DanceTrack[] }>('/api/viral-cf/dance-music', undefined, signal);
    const selected = selectedTrackRef.current;
    if (selected && !result.tracks.some(item => item.id === selected)) {
      const chosen = await jsonRequest<{ tracks: DanceTrack[] }>(`/api/viral-cf/dance-music?trackId=${encodeURIComponent(selected)}`, undefined, signal);
      result.tracks = [...chosen.tracks, ...result.tracks];
    }
    if (!signal?.aborted && currentUser.current === userId) setTracks(result.tracks);
    return result.tracks;
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshTracks(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [refreshTracks]);

  useEffect(() => {
    if (!musicPending) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refreshTracks(controller.signal); } catch { if (!controller.signal.aborted) setError('음원 상태를 확인하지 못했습니다. 상태 확인을 눌러 주세요.'); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 6000);
    };
    timer = setTimeout(poll, 6000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [musicPending, refreshTracks]);

  useEffect(() => {
    revision.current += 1;
    const current = revision.current; const controller = new AbortController();
    const recovery = handoff.current?.trackId === trackId && handoff.current.userId === userId ? handoff.current : null;
    handoff.current = null;
    setJob(recovery?.job || null); setUncertain(Boolean(recovery?.uncertain)); setStartSeconds(lockedClip?.startSeconds || 0); setVisualBrief(recovery?.brief || ''); setDuration(0); setListenPosition(0); setPlaying(false); audio.current?.pause(); previewAudio.current?.pause(); clipAudio.current?.pause();
    setJobLoading(Boolean(trackId && userId));
    if (!trackId || !userId) return () => controller.abort();
    void jsonRequest<{ job: DanceVideoJob | null }>(`/api/viral-cf/dance-video?trackId=${encodeURIComponent(trackId)}`, undefined, controller.signal)
      .then(data => { if (current === revision.current && currentUser.current === userId) {
        setJob(data.job || recovery?.job || null);
        if (data.job) { setStartSeconds(data.job.startSeconds); setVisualBrief(data.job.visualBrief); setUncertain(false); }
        else if (recovery) setUncertain(recovery.uncertain || Boolean(recovery.job));
      } })
      .catch(e => { if (!controller.signal.aborted && current === revision.current && currentUser.current === userId) { setError(e.message); setUncertain(true); } })
      .finally(() => { if (current === revision.current && currentUser.current === userId) setJobLoading(false); });
    return () => controller.abort();
  }, [trackId, userId]);

  const refreshJob = useCallback(async () => {
    if (!trackId || !userId || inRequest.current) return;
    const current = revision.current;
    setJobLoading(true);
    try {
      const data = await jsonRequest<{ job: DanceVideoJob | null }>(`/api/viral-cf/dance-video?trackId=${encodeURIComponent(trackId)}`);
      if (current === revision.current && currentUser.current === userId) {
        setJob(data.job); setUncertain(false); setError('');
        if (data.job) { setStartSeconds(data.job.startSeconds); setVisualBrief(data.job.visualBrief); }
      }
    } catch (e) { if (current === revision.current && currentUser.current === userId) { setError(e instanceof Error ? e.message : '저장 상태를 확인하지 못했습니다.'); setUncertain(true); } }
    finally { if (current === revision.current && currentUser.current === userId) setJobLoading(false); }
  }, [trackId, userId]);

  useEffect(() => {
    if (!videoPending || !job || uncertain) return;
    const current = revision.current; const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (inRequest.current) return;
      inRequest.current = true;
      try {
        const data = await jsonRequest<{ job: DanceVideoJob }>('/api/viral-cf/dance-video', { action: 'advance', trackId, jobId: job.id }, controller.signal);
        if (current === revision.current && !controller.signal.aborted) setJob(data.job);
      } catch (e) {
        if (current === revision.current && !controller.signal.aborted) { setError(e instanceof Error ? e.message : '작업 상태를 확인해 주세요.'); setUncertain(true); }
      } finally { inRequest.current = false; }
    }, 4000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [job, trackId, videoPending, uncertain]);

  async function createMusic() {
    if (!userId || pending || inRequest.current) return;
    inRequest.current = true; setPending(true); setPendingAction('music'); setError('');
    const current = revision.current;
    requestId.current ||= crypto.randomUUID();
    try {
      const data = await jsonRequest<{ track: DanceTrack }>('/api/viral-cf/dance-music', { requestId: requestId.current, isPublic });
      if (current !== revision.current) return;
      setTracks(old => [data.track, ...old.filter(t => t.id !== data.track.id)]); setTrackId(data.track.id); requestId.current = null; reuseRequest.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : '음원 제출 상태를 확인해 주세요.'); }
    finally { inRequest.current = false; setPending(false); setPendingAction(null); }
  }
  async function act(action: 'prepare' | 'start') {
    if (!trackId || !userId || pending || inRequest.current || uncertain || jobLoading) return;
    inRequest.current = true; setPending(true); setPendingAction(action); setError(''); setUncertain(false);
    audio.current?.pause(); previewAudio.current?.pause(); clipAudio.current?.pause(); setPlaying(false);
    const current = revision.current;
    try {
      const data = await jsonRequest<{ job: DanceVideoJob | null }>('/api/viral-cf/dance-video', action === 'prepare'
        ? { action, trackId, startSeconds, visualBrief: visualBrief.trim() }
        : { action, trackId, jobId: job?.id });
      if (!data.job) throw new Error('기획 결과가 저장됐는지 확인하지 못했습니다. 저장된 작업 상태를 확인해 주세요.');
      if (current === revision.current && currentUser.current === userId) setJob(data.job);
    } catch (e) { if (current === revision.current && currentUser.current === userId) { setError(e instanceof Error ? e.message : '작업 상태를 확인해 주세요.'); setUncertain(true); } }
    finally { inRequest.current = false; setPending(false); setPendingAction(null); }
  }
  async function reuseAudio(retryPlan = false) {
    if (!trackId || !job?.audioUrl || !userId || pending || inRequest.current || (retryPlan && (uncertain || jobLoading))) return;
    const source = `${trackId}:${job.id}`;
    if (reuseRequest.current?.source !== source) reuseRequest.current = { source, id: crypto.randomUUID() };
    inRequest.current = true; setPending(true); setPendingAction(retryPlan ? 'retry-plan' : 'reuse'); setError('');
    audio.current?.pause(); previewAudio.current?.pause(); clipAudio.current?.pause(); video.current?.pause();
    const current = revision.current;
    try {
      const result = await jsonRequest<{ trackId: string }>('/api/viral-cf/dance-video', {
        action: 'reuse', trackId, jobId: job.id, requestId: reuseRequest.current.id,
      });
      // Fetch the new record explicitly: it may not be in the latest thirty.
      const selected = await jsonRequest<{ tracks: DanceTrack[] }>(`/api/viral-cf/dance-music?trackId=${encodeURIComponent(result.trackId)}`);
      if (current !== revision.current || currentUser.current !== userId) return;
      if (!selected.tracks.some(t => t.id === result.trackId)) throw new Error('새 작업은 저장됐습니다. 같은 버튼으로 저장 상태를 다시 확인해 주세요.');
      setTracks(old => [...selected.tracks, ...old.filter(t => t.id !== result.trackId)]);
      if (retryPlan) {
        let preparedJob: DanceVideoJob | null = null;
        try {
          // One explicit click requests one new plan; the existing failed attempt is untouched.
          const prepared = await jsonRequest<{ job: DanceVideoJob | null }>('/api/viral-cf/dance-video', {
            action: 'prepare', trackId: result.trackId, startSeconds: job.startSeconds, visualBrief: job.visualBrief,
          });
          if (!prepared.job) throw new Error('기획 결과가 저장됐는지 확인하지 못했습니다. 저장된 작업 상태를 확인해 주세요.');
          preparedJob = prepared.job;
        } finally {
          // Even a lost response must reopen the saved attempt, not submit another one.
          if (current === revision.current && currentUser.current === userId) {
            handoff.current = { userId, trackId: result.trackId, brief: job.visualBrief, job: preparedJob, uncertain: !preparedJob };
            setTrackId(result.trackId); setVisualBrief(job.visualBrief); setUncertain(!preparedJob); reuseRequest.current = null;
          }
        }
      } else {
        setTrackId(result.trackId); setVisualBrief(''); setUncertain(false); reuseRequest.current = null;
      }
    } catch (e) { if (current === revision.current && currentUser.current === userId) setError(e instanceof Error ? e.message : '새 챌린지 작업을 확인해 주세요.'); }
    finally { inRequest.current = false; setPending(false); setPendingAction(null); }
  }
  async function previewRange() {
    const element = previewAudio.current;
    if (!element) return;
    if (!element.paused) { element.pause(); setPlaying(false); return; }
    element.currentTime = lockedClip ? 0 : startSeconds; registerActiveAudio(element, () => setPlaying(false));
    try { await element.play(); setPlaying(true); } catch { setError('재생 버튼을 다시 눌러 주세요.'); }
  }

  return <section aria-label="댄스·챌린지 제작" className="space-y-6 pt-2">
    <div className="rounded-2xl border border-fuchsia-400/40 bg-fuchsia-950/40 p-4 space-y-2">
      <h3 className="flex items-center gap-2 font-bold text-fuchsia-100"><Lock className="h-4 w-4" />전용 댄스 스타일 자동 적용</h3>
      <p className="text-sm text-zinc-200">{DANCE_PRESET.description}</p>
      <p className="text-xs leading-relaxed text-zinc-300">매번 새로운 음악을 만듭니다. 먼저 음원을 들어보고 마음에 드는 30초에 맞춰 영상을 기획하세요.</p>
    </div>
    {!userId ? <p className="text-sm text-amber-200">로그인 후 음원을 생성할 수 있습니다.</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-amber-400/40 bg-amber-950/40 p-3 text-sm text-amber-100">{error}</p> : null}
    <div className="space-y-3">
      <h3 className="font-bold text-white">1 · 음악 만들기</h3>
      <label className="flex items-center gap-2 text-sm text-zinc-200"><input type="checkbox" checked={isPublic} disabled={busy || Boolean(trackId)} onChange={e => setIsPublic(e.target.checked)} />완성 영상을 바이럴 & 트렌드 존에 공개</label>
      <button type="button" className={`${button} w-full`} disabled={!userId || busy} onClick={() => void createMusic()} aria-busy={(pending && pendingAction === 'music') || musicPending}>
        {(pending && pendingAction === 'music') || musicPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Music4 className="h-4 w-4" />}{musicPending ? '음원 생성 중…' : pending && pendingAction === 'music' ? '요청 중…' : '새 댄스 음원 만들기'}
      </button>
      {tracks.length ? <label className="block space-y-1 text-sm text-zinc-200">내 댄스 음원
        <select className={field} value={trackId} disabled={pending || videoPending} onChange={e => { setError(''); setUncertain(false); setTrackId(e.target.value); setVisualBrief(''); }}>
          <option value="">음원을 선택해 주세요</option>
          {tracks.map(t => <option key={t.id} value={t.id}>{t.title}{t.status !== 'completed' ? ` · ${t.status === 'generating' ? '생성 중' : '상태 확인 필요'}` : ''}</option>)}
        </select>
      </label> : null}
      {musicPending || error ? <button type="button" className="text-sm text-cyan-200 underline" onClick={() => void refreshTracks().catch(e => setError(e.message))}>음원 상태 확인</button> : null}
      {track?.error ? <p className="text-sm text-amber-200">{track.error}</p> : null}
    </div>
    {audioReady ? <div className="space-y-4 border-t border-white/15 pt-5">
      <h3 className="font-bold text-white">2 · 마음에 드는 30초 선택</h3>
      <div className="space-y-2 rounded-xl border border-white/15 bg-black/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-white">곡 전체 듣기</p><a href={`/api/download?url=${encodeURIComponent(track?.audioUrl || '')}&filename=${encodeURIComponent(`${track?.title || 'dance-original'}.mp3`)}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-200 underline"><Download className="h-4 w-4" />전체 음원 MP3 다운로드</a></div>
        <audio key={track?.audioUrl} ref={audio} aria-label="곡 전체 듣기" src={track?.audioUrl || undefined} controls controlsList="nodownload" preload="metadata" className="h-12 w-full" onLoadedMetadata={e => {
          const value = e.currentTarget.duration; if (Number.isFinite(value)) setDuration(value);
        }} onPlay={e => registerActiveAudio(e.currentTarget)} onTimeUpdate={e => setListenPosition(Math.round(e.currentTarget.currentTime * 10) / 10)}
          onError={() => setError('음원을 불러오지 못했습니다. 음원 상태를 확인해 주세요.')} />
        <p className="text-xs leading-relaxed text-zinc-300">곡 전체를 들으며 원하는 위치로 이동하세요. 마음에 드는 부분에서 아래 버튼을 누르면 그 지점부터 30초를 선택합니다.</p>
        <button type="button" className={button} disabled={busy || frozen || rangeFrozen || fullDuration < 30} onClick={() => {
          const position = audio.current?.currentTime ?? listenPosition;
          previewAudio.current?.pause(); setPlaying(false);
          setStartSeconds(Math.min(maxStart, Math.round(Math.max(0, position) * 10) / 10));
        }}>현재 위치부터 30초 선택 · {clock(listenPosition)}</button>
      </div>
      <audio key={`preview-${lockedClip?.audioUrl || track?.audioUrl}`} ref={previewAudio} aria-label="선택 구간 미리듣기" src={lockedClip?.audioUrl || track?.audioUrl || undefined} preload="none"
        onPlay={e => registerActiveAudio(e.currentTarget, () => setPlaying(false))}
        onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={e => {
          if (e.currentTarget.currentTime >= (lockedClip ? 30 : startSeconds + 30)) { e.currentTarget.pause(); setPlaying(false); }
        }} onError={() => setError('선택 구간을 재생하지 못했습니다. 다시 확인해 주세요.')} />
      <div className="flex items-center justify-between gap-3 text-sm text-zinc-200"><span>{clock(startSeconds)} – {clock(startSeconds + 30)}</span><span>전체 {clock(fullDuration)}</span></div>
      <input aria-label="30초 구간 시작 위치" type="range" min={0} max={maxStart} step={0.1} value={Math.min(startSeconds, maxStart)} disabled={busy || frozen || rangeFrozen || fullDuration < 30} onChange={e => { previewAudio.current?.pause(); setStartSeconds(Number(e.target.value)); }} className="w-full accent-fuchsia-400" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-200">시작 <input aria-label="시작 시간(초)" type="number" min={0} max={maxStart} step={0.1} value={startSeconds} disabled={busy || frozen || rangeFrozen} onChange={e => { previewAudio.current?.pause(); setStartSeconds(Math.max(0, Math.min(maxStart, Number(e.target.value) || 0))); }} className={`${field} !w-24`} />초</label>
        <button type="button" className={button} disabled={!clipReady || pending} onClick={() => void previewRange()}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? '멈추기' : '선택 구간 듣기'}</button>
      </div>
      {lockedClip ? <p className="rounded-xl border border-cyan-400/30 bg-cyan-950/30 p-3 text-sm text-cyan-100">저장한 30초 음원을 그대로 사용합니다. 구간과 음원은 고정되며, 아래에서 새로운 영상 상황을 기획할 수 있습니다.</p> : null}
      {fullDuration > 0 && fullDuration < 30 && !lockedClip ? <p className="text-sm text-amber-200">이 음원은 30초보다 짧습니다. 다른 음원을 선택해 주세요.</p> : null}
    </div> : null}
    {savedAudioUrl ? <div className="space-y-3 rounded-xl border border-cyan-400/30 bg-cyan-950/20 p-4">
      <p className="font-bold text-cyan-100">저장된 30초 음원</p>
      <audio key={savedAudioUrl} ref={clipAudio} aria-label="저장된 30초 음원" src={savedAudioUrl} controls preload="none" className="h-10 w-full" onPlay={e => registerActiveAudio(e.currentTarget)} />
      <div className="flex flex-wrap gap-3"><a href={`/api/download?url=${encodeURIComponent(savedAudioUrl)}&filename=${encodeURIComponent(`${job?.plan?.title || track?.title || 'dance-clip'}-30s.wav`)}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-200 underline"><Download className="h-4 w-4" />30초 음원 WAV 다운로드</a></div>
      {job?.audioUrl && ['ready', 'completed', 'attention'].includes(job.status) && !job.inFlight ? <button type="button" className={`${button} w-full`} disabled={busy} aria-busy={pendingAction === 'reuse'} onClick={() => void reuseAudio()}>{pendingAction === 'reuse' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}{pendingAction === 'reuse' ? '새 작업 준비 중…' : '같은 음원으로 새 챌린지 만들기'}</button> : null}
      <p className="text-xs leading-relaxed text-zinc-300">이 음원은 자동 보관됩니다. 새 챌린지는 기존 영상과 별도로 저장되며, 음악을 다시 생성하지 않습니다.</p>
    </div> : null}
    {audioReady ? <div className="space-y-4 border-t border-white/15 pt-5">
      <h3 className="font-bold text-white">3 · 상황 설정 &amp; AI 기획</h3>
      <p className="text-sm leading-relaxed text-zinc-200">원하는 상황을 직접 입력하거나, 비워두고 AI 기획하기를 눌러 보세요. 선택한 음악 구간에 맞춰 캐릭터·장소·댄스 전개를 제안합니다.</p>
      <label className="block space-y-2 text-sm text-zinc-200">상황 및 요구사항 입력 (선택)
        <textarea className={`${field} min-h-28 resize-y`} maxLength={1000} disabled={busy || frozen} value={visualBrief} onChange={e => setVisualBrief(e.target.value)} placeholder="예: 청소하던 귀여운 로봇이 비트가 나오자 빗자루를 마이크처럼 들고 신나게 춤춘다. 비워두면 AI가 새로운 상황을 기획합니다." />
      </label>
      <button type="button" className={`${button} w-full`} aria-busy={pending && pendingAction === 'prepare'} disabled={busy || jobLoading || uncertain || frozen || !clipReady || (job?.status === 'ready' && !selectionChanged)} onClick={() => void act('prepare')}>
        {pending && pendingAction === 'prepare' ? <RefreshCw className="h-4 w-4 animate-spin" /> : job?.status === 'ready' && !selectionChanged ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{pending && pendingAction === 'prepare' ? 'AI 기획 중…' : job?.status === 'ready' && !selectionChanged ? 'AI 기획 완료' : 'AI 기획하기'}
      </button>
      {job?.plan ? <div className="rounded-xl border border-white/15 bg-black/30 p-4 space-y-2"><p className="font-bold text-white">{job.plan.title}</p><p className="text-sm leading-relaxed text-zinc-200">{job.plan.summary}</p></div> : null}
    </div> : null}
    {job ? <div className="space-y-4 border-t border-white/15 pt-5">
      <h3 className="font-bold text-white">4 · 영상 만들기</h3>
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-fuchsia-100">{videoPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}{statusCopy[job.status]}</p>

      {job.status === 'ready' ? <button type="button" className={`${button} w-full`} disabled={pending || jobLoading || uncertain || selectionChanged} onClick={() => void act('start')}><Film className="h-4 w-4" />30초 영상 생성하기</button> : null}
      {selectionChanged ? <p className="text-sm text-amber-200">구간 또는 영상 요청이 바뀌었습니다. 다시 기획해 주세요.</p> : null}
      {job.status !== 'completed' && job.status !== 'attention' ? <p className="text-xs leading-relaxed text-zinc-300">영상 생성 중에는 이 화면을 열어두세요. 이동했다면 대시보드의 ‘작업 열기’에서 이어갈 수 있습니다.</p> : null}
      {job.error ? <p className="text-sm text-amber-200">{job.error}</p> : null}
      {canRetryPlan ? <div className="space-y-2"><button type="button" className={`${button} w-full`} disabled={busy || jobLoading || uncertain} aria-busy={pendingAction === 'retry-plan'} onClick={() => void reuseAudio(true)}><RefreshCw className={`h-4 w-4${pendingAction === 'retry-plan' ? ' animate-spin' : ''}`} />{pendingAction === 'retry-plan' ? 'AI 기획 다시 요청 중…' : 'AI 기획 다시 시도'}</button><p className="text-xs leading-relaxed text-zinc-300">저장된 30초 음원과 입력 내용으로 기획만 다시 요청합니다. 새로운 기획 요청 비용이 발생할 수 있습니다.</p></div> : null}
      {job.videoUrl && job.status === 'completed' ? <>
        <video ref={video} src={job.videoUrl} poster={job.imageUrl} controls playsInline preload="metadata" className="mx-auto max-h-[520px] rounded-xl bg-black" onPlay={e => registerActiveAudio(e.currentTarget)} />
        <div className="flex flex-wrap gap-3"><a href={`/api/download?url=${encodeURIComponent(job.videoUrl)}&filename=${encodeURIComponent(`${job.plan?.title || 'dance-short'}.mp4`)}`} className={button}><Download className="h-4 w-4" />MP4 다운로드</a><a href="/dashboard" className="inline-flex items-center text-sm text-cyan-200 underline">대시보드에서 보기</a></div>
      </> : null}
      <p className="text-xs text-zinc-300">15초 영상 두 편과 선택한 음원으로 완성합니다. 자막은 다운로드 후 캡컷에서 편집해 주세요.</p>
    </div> : null}
    {trackId && audioReady && (!job || uncertain || job.status === 'attention') ? <div className="space-y-2">
      {uncertain ? <p className="text-sm text-amber-200">요청 결과를 확인한 뒤 다시 기획할 수 있습니다. 저장된 30초 음원과 입력 내용은 유지됩니다.</p> : null}
      <button type="button" className={button} disabled={pending || jobLoading} onClick={() => void refreshJob()}>{jobLoading ? '저장 상태 확인 중…' : '저장된 작업 상태 확인'}</button>
    </div> : null}
    {trackId && audioReady ? <a href={`/viral?danceTrack=${encodeURIComponent(trackId)}`} className="inline-block text-sm text-cyan-200 underline">이 작업 다시 열기</a> : null}
  </section>;
}
