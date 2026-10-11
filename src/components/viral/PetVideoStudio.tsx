"use client";

import { useEffect, useRef, useState } from 'react';
import { getPetProductionShots, isPetInstrumental, isPetTwoClipEpisode, validatePetEpisode, type PetEpisode, type PetShot, type PetVideoJobView } from '@/lib/vle/petEpisode';
import { registerActiveAudio } from '@/lib/globalAudio';
import { summarizePetContentReadiness } from '@/lib/video/petContentReadiness';

const fieldClass = 'w-full rounded-xl border border-white/15 bg-black/40 p-3 text-sm text-zinc-100 disabled:cursor-not-allowed';
const buttonClass = 'rounded-xl border border-fuchsia-400/40 bg-fuchsia-950/60 px-4 py-3 text-sm font-bold text-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-100';
const stoppedStatuses = new Set(['review', 'completed', 'failed', 'held']);

interface StoryCandidatePreview {
  title: string;
  premise?: string;
  storyBeats?: { setup: string; escalation: string; reversal: string; punchline: string };
  relatableMoment?: string;
  behavioralContradiction?: string;
  review?: { reason: string; risk: string };
}

export function ViralStoryReview({ title, story, candidates, selectedCandidateIndex, selectedReason }: {
  title: string; story: string; candidates: StoryCandidatePreview[]; selectedCandidateIndex: number; selectedReason: string;
}) {
  const beats = candidates[selectedCandidateIndex]?.storyBeats;
  return <section className="space-y-3 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-950/10 p-4" aria-label="30초 웃음 이야기">
    <h4 className="font-bold text-fuchsia-200">{title}</h4>
    <p className="text-sm leading-relaxed text-zinc-200">{story}</p>
    {beats ? <div className="grid gap-3 sm:grid-cols-2">{([['setup', '상황'], ['escalation', '갈등의 확대'], ['reversal', '반전'], ['punchline', '마지막 한마디']] as const).map(([key, label]) => <div key={key} className="rounded-xl bg-black/30 p-3"><p className="mb-1 text-xs font-bold text-fuchsia-200">{label}</p><p className="text-sm leading-relaxed text-zinc-200">{beats[key]}</p></div>)}</div> : null}
    <p className="text-xs leading-relaxed text-zinc-300">선정 이유 · {selectedReason}</p>
    <details className="text-xs text-zinc-300"><summary className="cursor-pointer py-1">이번에 새로 기획한 후보 보기</summary>
      {candidates.map((candidate, index) => <div key={index} className="mt-3 space-y-1 leading-relaxed"><p className="font-bold">{index === selectedCandidateIndex ? '선정 · ' : '후보 · '}{candidate.title}</p>{candidate.premise ? <p>{candidate.premise}</p> : null}{candidate.relatableMoment ? <p>공감 순간: {candidate.relatableMoment}</p> : null}{candidate.behavioralContradiction ? <p>웃음 포인트: {candidate.behavioralContradiction}</p> : null}{candidate.storyBeats ? <p>{candidate.storyBeats.setup} → {candidate.storyBeats.escalation} → {candidate.storyBeats.reversal}<br />“{candidate.storyBeats.punchline}”</p> : null}{candidate.review ? <p>{candidate.review.reason}<br />검토할 점: {candidate.review.risk}</p> : null}</div>)}
    </details>
    <p className="text-xs text-zinc-400">AI 기획 가설 · 공감도와 재미는 실제 시청자 반응으로 검증합니다.</p>
  </section>;
}

export function readPetEpisode(track: unknown): PetEpisode | null {
  try {
    if (!track || typeof track !== 'object') return null;
    const row = track as Record<string, any>;
    const license = typeof row.license_hash === 'string' && row.license_hash.length < 150_000
      ? JSON.parse(row.license_hash) : null;
    const value = row.petEpisode || row.metadata?.petEpisode || license?.petEpisode || license?.metadata?.petEpisode;
    return value && validatePetEpisode(value).length === 0 ? value : null;
  } catch { return null; }
}

export function petVideoStorageKey(userId: string, episode: PetEpisode): string {
  return `melodio:pet-video:${episode.version === 'pet-v4' ? 'v4' : 'v3'}:${userId}:${episode.id}`;
}

export function PetEpisodeEditor({ episode, onChange, disabled = false }: {
  episode: PetEpisode; onChange: (episode: PetEpisode) => void; disabled?: boolean;
}) {
  const issues = validatePetEpisode(episode);
  const musicMode = isPetInstrumental(episode) ? '인스트루멘탈 · 보컬·가사 없음' : '보컬곡 · 기획한 가사 사용';
  const planningNotice = episode.planningWarnings?.length ? <div role="status" className="rounded-xl border border-amber-400/30 bg-amber-950/15 p-3 text-sm text-amber-100">
    <p className="font-semibold">생성 전에 이야기 흐름을 확인해 주세요</p>
    <ul className="mt-2 list-disc space-y-1 pl-5">{episode.planningWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
  </div> : null;
  if (isPetTwoClipEpisode(episode)) return (
    <section className="space-y-4 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-950/10 p-4" aria-label="댕냥이 30초 콘티">
      <ViralStoryReview title={episode.title} story={episode.story} candidates={episode.candidates} selectedCandidateIndex={episode.editorialReview?.selectedCandidateIndex ?? 0} selectedReason={episode.editorialReview?.selectedReason || '선정 이유 확인 필요'} />
      <p className="text-xs text-zinc-300">영상 제작 · 15초 + 15초</p>
      <p className="text-xs text-zinc-300">음악 · {musicMode}</p>
      {planningNotice}
      <p className="text-xs text-zinc-300">{episode.pov === 'owner_inner_voice' ? '집사 속마음' : '반려동물 속마음'} · 이야기를 바꾸려면 위 상황을 수정한 뒤 다시 기획해 주세요.</p>
      <div className="grid gap-3 sm:grid-cols-2">{episode.production.clips.map(clip => <div key={clip.id} className="rounded-xl bg-black/25 p-3">
        <p className="mb-2 text-xs font-bold text-fuchsia-200">{clip.startSeconds}–{clip.startSeconds + 15}초 · {clip.id === 'C1' ? '상황과 시도' : '반전과 마무리'}</p>
        {episode.shots.filter(shot => clip.beatIds.includes(shot.id)).map(shot => <p key={shot.id} className="py-1 text-sm text-zinc-200">{shot.caption}</p>)}
      </div>)}</div>
      <details className="text-xs text-zinc-300"><summary className="cursor-pointer py-1">연출 설계 보기</summary>
        <p className="mt-3">선정된 이야기를 6개 편집 비트와 두 영상으로 나눈 제작 명세입니다.</p>
        <div className="mt-4 space-y-2">{episode.shots.map(shot => <p key={shot.id}><strong>{shot.startSeconds}초 · {shot.beat}</strong><br />{shot.action}</p>)}</div>
        <p className="mt-3">소품 수: {episode.production.inventory.map(item => `${item.description} × ${item.count}`).join(' · ') || '주요 소품 없음'}</p>
      </details>
      {issues.length ? <p role="alert" className="text-sm text-amber-200">{issues.join(' ')}</p> : null}
    </section>
  );
  const editShot = (id: string, key: keyof PetShot, value: string) => {
    onChange({ ...episode, shots: episode.shots.map(shot => shot.id === id ? { ...shot, [key]: value } : shot) });
  };
  return (
    <section className="space-y-4 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-950/10 p-4" aria-label="댕냥이 30초 콘티">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-fuchsia-200">30초 스토리 · 6장면 콘티</h4>
        <span className="text-xs text-zinc-300">4 + 5 + 5 + 6 + 6 + 4초</span>
      </div>
      <label className="block space-y-1 text-xs text-zinc-300">제목
        <input className={fieldClass} value={episode.title} maxLength={80} disabled={disabled} onChange={e => onChange({ ...episode, title: e.target.value })} />
      </label>
      <label className="block space-y-1 text-xs text-zinc-300">스토리와 반전
        <textarea className={fieldClass} rows={3} value={episode.story} maxLength={3000} disabled={disabled} onChange={e => onChange({ ...episode, story: e.target.value })} />
      </label>
      <p className="text-xs leading-relaxed text-zinc-300">{episode.pov === 'owner_inner_voice' ? '집사 속마음' : '반려동물 속마음'} · {episode.character.appearance}<br />{episode.character.setting}</p>
      <p className="text-xs text-zinc-300">음악 · {musicMode}</p>
      {planningNotice}
      {disabled ? <p className="text-xs text-amber-200">영상 작업에 저장된 콘티입니다. 새 이야기는 Step 3에서 다시 기획할 수 있습니다.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {episode.shots.map(shot => (
          <article key={shot.id} className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-sm font-semibold text-fuchsia-200">{shot.id} · {shot.startSeconds}–{shot.startSeconds + shot.durationSeconds}초 · {shot.beat}</p>
            <label className="block space-y-1 text-xs text-zinc-300">장면 요약
              <input className={fieldClass} value={shot.caption} maxLength={56} disabled={disabled} onChange={e => editShot(shot.id, 'caption', e.target.value)} />
            </label>
            <label className="block space-y-1 text-xs text-zinc-300">행동 요약 · 실제 연출은 아래 프롬프트에서 수정
              <textarea className={fieldClass} rows={2} value={shot.action} readOnly />
            </label>
            <details className="text-xs text-zinc-300">
              <summary className="cursor-pointer py-1">장면 이미지 · 움직임 지시 직접 수정</summary>
              <label className="mt-2 block space-y-1">장면 이미지
                <textarea className={fieldClass} rows={4} value={shot.keyframePrompt} maxLength={5000} disabled={disabled} onChange={e => editShot(shot.id, 'keyframePrompt', e.target.value)} />
              </label>
              <label className="mt-2 block space-y-1">영상 움직임
                <textarea className={fieldClass} rows={4} value={shot.videoPrompt} maxLength={5000} disabled={disabled} onChange={e => editShot(shot.id, 'videoPrompt', e.target.value)} />
              </label>
            </details>
          </article>
        ))}
      </div>
      {issues.length ? <p role="alert" className="text-sm text-amber-200">{issues.join(' ')}</p> : <p className="text-xs text-emerald-300">6장면 · 총 30초 · 필수 항목 확인 완료</p>}
    </section>
  );
}

export interface PetVideoExternalStartRequest {
  id: string;
  ownerId: string;
  episodeId: string;
  trackId: string;
}

export interface PetVideoExternalState {
  busy: boolean;
  loading: boolean;
  canStart: boolean;
  job: PetVideoJobView | null;
  error: string;
}

interface Props {
  userId: string | null;
  episode: PetEpisode | null;
  trackId: string | null;
  trackTitle?: string;
  compact?: boolean;
  externalControl?: boolean;
  startRequest?: PetVideoExternalStartRequest | null;
  onStateChange?: (state: PetVideoExternalState) => void;
  onRequestSettled?: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
  onLockedChange: (locked: boolean) => void;
  onCompleted: (job: PetVideoJobView) => void;
}

function mediaUrl(value?: string): string | undefined {
  return value && /^https?:\/\//i.test(value) ? value : undefined;
}

function StoryCoreAdvice({ quality }: { quality: unknown }) {
  if (!quality || typeof quality !== 'object') return null;
  const review = quality as Record<string, unknown>;
  if (review.status !== 'advisory') return null;
  const issues = Array.isArray(review.issues) ? review.issues.filter((issue): issue is string => typeof issue === 'string').slice(0, 5) : [];
  return <details className="text-xs leading-relaxed text-zinc-300">
    <summary className="cursor-pointer py-1">콘텐츠 핵심 분석 · 참고 의견</summary>
    {review.analysisStatus === 'unavailable' ? <p className="mt-2">참고 분석을 완료하지 못했습니다. 제작은 계속 진행하며 영상은 직접 확인해 주세요.</p>
      : <><p className="mt-2">영상의 세 정지 표본을 살펴본 참고 의견입니다. 전체 움직임이나 재미를 검증한 결과는 아닙니다.</p>
        {issues.length ? issues.map((issue, index) => <p key={index} className="mt-2 text-amber-100">{issue}</p>) : <p className="mt-2">표본에서 핵심 전달에 대한 개선 의견이 없습니다. 최종 표현과 재미는 직접 확인해 주세요.</p>}</>}
  </details>;
}

function AssetIssue({ error, imageQuality, canResume }: { error?: string; imageQuality: unknown; canResume: boolean }) {
  if (!error) return null;
  const historical = imageQuality && typeof imageQuality === 'object' && (imageQuality as Record<string, unknown>).status === 'review';
  return canResume && historical ? <div className="text-xs leading-relaxed text-zinc-300">
    <p>이전 세부 검수로 중단된 작업입니다. 저장된 이미지로 제작을 이어갈 수 있습니다.</p>
    <details className="mt-2"><summary className="cursor-pointer">이전 검수 기록</summary><p className="mt-2">{error}</p></details>
  </div> : <p className="text-xs text-amber-200">{error}</p>;
}

export function PetContentReviewNotice({ job }: { job: PetVideoJobView }) {
  const review = job.contentReview || summarizePetContentReadiness({ videoUrl: job.videoUrl, shots: job.shots });
  if (job.status !== 'completed') return null;
  return <section className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-950/15 p-3 text-xs leading-relaxed text-zinc-200" aria-label="완성 영상 내용 확인">
    <p className="font-bold text-amber-100">{review.status === 'owner_confirmed' ? '직접 확인 완료' : '영상 제작 완료 · 내용 확인 필요'}</p>
    <p>아래 영상에서 동물의 행동, 이야기의 전개와 마무리, 음악을 확인해 주세요. 정지 화면의 참고 분석만으로 전체 영상의 자연스러움이나 재미를 보장할 수는 없습니다.</p>
    {review.status !== 'owner_confirmed' ? <p>새 영상은 확인 완료 후 공개 목록에 표시됩니다. 비공개로 설정한 영상은 공개되지 않습니다.</p> : null}
    {review.concerns.map((concern, index) => <p key={index} className="text-amber-100">{concern}</p>)}
  </section>;
}

export default function PetVideoStudio({ userId, episode, trackId, trackTitle, compact = false, externalControl = false, startRequest, onStateChange, onRequestSettled, onBusyChange, onLockedChange, onCompleted }: Props) {
  const [job, setJob] = useState<PetVideoJobView | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [motionDraft, setMotionDraft] = useState<{ scope: string | null; values: Record<string, string> }>({ scope: null, values: {} });
  const [restoredScope, setRestoredScope] = useState<string | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const mounted = useRef(true);
  const running = useRef(false);
  const runId = useRef(0);
  const twoClip = !!episode && (!job || job.productionMode === 'two-clips');
  const productionShots = episode ? getPetProductionShots(episode) : [];
  const storageKey = userId && episode ? petVideoStorageKey(userId, episode) : null;
  const scope = storageKey ? `${storageKey}:${trackId || ''}` : null;
  const motionScope = storageKey && job ? `${storageKey}:${job.id}` : null;
  const callbacks = useRef({ onBusyChange, onLockedChange, onCompleted, onStateChange, onRequestSettled });
  const handledRequests = useRef(new Set<string>());
  const startHandler = useRef<((action?: 'approve' | 'resume') => Promise<void>) | null>(null);
  useEffect(() => { callbacks.current = { onBusyChange, onLockedChange, onCompleted, onStateChange, onRequestSettled }; }, [onBusyChange, onLockedChange, onCompleted, onStateChange, onRequestSettled]);
  // Only a different job/account resets local edits. A status refresh of this job does not.
  useEffect(() => { setMotionDraft({ scope: motionScope, values: {} }); }, [motionScope]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; runId.current += 1; callbacks.current.onBusyChange(false); callbacks.current.onLockedChange(false); };
  }, []);

  const acceptJob = (next: PetVideoJobView) => {
    setJob(next);
    callbacks.current.onLockedChange(true);
    if (storageKey) {
      try { localStorage.setItem(storageKey, next.id); } catch { /* Server remains the source of truth. */ }
    }
    if (next.status === 'completed') callbacks.current.onCompleted(next);
  };

  // Reload only reads durable state. An explicit button request is required to resume paid work.
  useEffect(() => {
    let cancelled = false;
    runId.current += 1;
    running.current = false;
    setJob(null); setError(''); setBusy(false); setRestoredScope(null); setRestoreFailed(false);
    callbacks.current.onBusyChange(false);
    callbacks.current.onLockedChange(false);
    if (!storageKey) { setLoading(false); return; }
    let savedId: string | null = null;
    try { savedId = localStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
    if (!savedId || !/^[a-zA-Z0-9_-]{1,100}$/.test(savedId)) { setLoading(false); setRestoredScope(scope); return; }
    setLoading(true);
    fetch(`/api/viral-cf/pet-video?jobId=${encodeURIComponent(savedId)}`, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !result.success || !result.job) throw new Error(result.error || '저장된 영상 상태를 불러오지 못했습니다.');
        if (result.job.episodeId !== episode?.id) throw new Error('저장된 영상과 현재 콘티가 일치하지 않습니다.');
        if (!cancelled) {
          setJob(result.job);
          callbacks.current.onLockedChange(true);
          if (result.job.status === 'completed') callbacks.current.onCompleted(result.job);
        }
      })
      .catch(reason => { if (!cancelled) { setRestoreFailed(true); setError(reason instanceof Error ? reason.message : '영상 상태를 확인해 주세요.'); } })
      .finally(() => { if (!cancelled) { setLoading(false); setRestoredScope(scope); } });
    return () => { cancelled = true; };
  }, [storageKey, scope, episode?.id, restoreAttempt]);

  async function post(body: object): Promise<PetVideoJobView> {
    const response = await fetch('/api/viral-cf/pet-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok || !result.success || !result.job) throw new Error(result.error || '영상 작업을 이어가지 못했습니다. 기존 작업은 보존됩니다.');
    return result.job;
  }

  const motionPrompts = (job?.shots || []).map((shot, index) => {
    const saved = shot.motionPrompt || productionShots[index]?.videoPrompt || '';
    return job?.status === 'review' && motionDraft.scope === motionScope ? motionDraft.values[shot.id] ?? saved : saved;
  });
  const validMotionPrompts = motionPrompts.length === 6 && motionPrompts.every(prompt => prompt.trim().length > 0 && prompt.length <= 5000);
  const allKeyframes = job?.shots.length === 6 && job.shots.every(shot => !!mediaUrl(shot.keyframeUrl));

  async function start(action?: 'approve' | 'resume') {
    if (running.current || !userId || !episode || (!job && !trackId)) return;
    const issues = validatePetEpisode(episode);
    if (issues.length) { setError(issues.join(' ')); return; }
    if (action === 'approve' && (job?.status !== 'review' || !allKeyframes || !validMotionPrompts)) {
      setError('기준 이미지 6개와 각 장면의 움직임 프롬프트를 확인해 주세요.');
      return;
    }
    running.current = true;
    const currentRun = ++runId.current;
    setBusy(true); setError(''); callbacks.current.onBusyChange(true);
    try {
      let current = action && job
        ? await post({ action, jobId: job.id, ...(action === 'approve' ? { motionPrompts: motionPrompts.map(prompt => prompt.trim()) } : {}) })
        : job || await post({ action: 'create', episode, trackId });
      if (!mounted.current || currentRun !== runId.current) return;
      acceptJob(current);
      while (!stoppedStatuses.has(current.status)) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (!mounted.current || currentRun !== runId.current) return;
        current = await post({ action: 'advance', jobId: current.id });
        if (!mounted.current || currentRun !== runId.current) return;
        acceptJob(current);
      }
    } catch (reason) {
      if (mounted.current && currentRun === runId.current) setError(reason instanceof Error ? reason.message : '영상 진행이 중단되었습니다. 저장된 단계부터 이어갈 수 있습니다.');
    } finally {
      if (mounted.current && currentRun === runId.current) { running.current = false; setBusy(false); callbacks.current.onBusyChange(false); }
    }
  }

  async function refresh() {
    if (!job && restoreFailed && !busy && !loading) { setRestoreAttempt(attempt => attempt + 1); return; }
    if (!job || busy) return;
    const currentRun = runId.current;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/viral-cf/pet-video?jobId=${encodeURIComponent(job.id)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success || !result.job) throw new Error(result.error || '상태를 확인하지 못했습니다.');
      if (mounted.current && currentRun === runId.current) acceptJob(result.job);
    } catch (reason) { if (mounted.current && currentRun === runId.current) setError(reason instanceof Error ? reason.message : '상태 확인 실패'); }
    finally { if (mounted.current && currentRun === runId.current) setLoading(false); }
  }

  async function confirmContent() {
    if (running.current || loading || !job || job.status !== 'completed' || !job.videoUrl || !userId) return;
    running.current = true;
    const currentRun = ++runId.current;
    setLoading(true); setError('');
    try {
      const confirmed = await post({ action: 'confirm', jobId: job.id, videoUrl: job.videoUrl });
      if (mounted.current && currentRun === runId.current) acceptJob(confirmed);
    } catch (reason) {
      if (mounted.current && currentRun === runId.current) setError(reason instanceof Error ? reason.message : '확인 상태를 저장하지 못했습니다.');
    } finally {
      if (mounted.current && currentRun === runId.current) { running.current = false; setLoading(false); }
    }
  }

  const ready = !!userId && !!episode && (!!job || !!trackId) && validatePetEpisode(episode).length === 0;
  const restoring = restoredScope !== scope;
  const canStart = ready && !busy && !loading && !restoring && !restoreFailed
    && (!job || job.episodeId === episode?.id && (!stoppedStatuses.has(job.status) || job.status === 'held' && !!job.canResume));
  useEffect(() => { startHandler.current = start; });
  useEffect(() => {
    callbacks.current.onStateChange?.({ busy, loading: loading || restoring, canStart, job: restoring ? null : job, error });
  }, [busy, loading, restoring, canStart, job, error]);

  const requestId = startRequest?.id;
  const requestOwner = startRequest?.ownerId;
  const requestEpisode = startRequest?.episodeId;
  const requestTrack = startRequest?.trackId;
  useEffect(() => {
    if (!externalControl || !requestId || handledRequests.current.has(requestId)) return;
    const matches = requestOwner === userId && requestEpisode === episode?.id && requestTrack === trackId && !!trackId;
    if (matches && (loading || restoring)) return;
    handledRequests.current.add(requestId);
    if (!matches || running.current || !canStart) {
      callbacks.current.onRequestSettled?.(requestId);
      return;
    }
    // Reuse the synchronous guard and serial progression from the normal button.
    // A held job can only resume when the server explicitly marks it safe.
    const currentRun = runId.current + 1;
    const request = startHandler.current?.(job?.canResume ? 'resume' : undefined);
    void request?.finally(() => {
      if (mounted.current && currentRun === runId.current) callbacks.current.onRequestSettled?.(requestId);
    });
  }, [externalControl, requestId, requestOwner, requestEpisode, requestTrack, userId, episode?.id, trackId, loading, restoring, canStart, job?.canResume]);
  const openingRecovery = !!job?.shots[0]?.keyframeUrl && job.shots.every(shot => !shot.videoUrl && !shot.requestId);
  const jobDetails = job ? <>
    <p className="break-all text-xs text-zinc-400">작업 {job.id} · 이미지·영상 예상 비용 ${job.estimatedCostUsd.toFixed(2)} · 기획·음원·참고 분석 별도</p>
    {job.audioQuality ? <p className="text-xs leading-relaxed text-zinc-300">{job.audioQuality.bpm ? `추정 템포 ${Math.round(job.audioQuality.bpm)} BPM · ` : ''}{job.audioQuality.endingStatus === 'clean' ? '음원 끝 신호 확인 완료 · 마지막 가창은 직접 들어 확인해 주세요.' : '음원 끝부분 청취 확인이 필요합니다.'}</p> : null}
    <div className={`grid grid-cols-2 gap-3 ${twoClip ? 'mx-auto max-w-sm' : 'sm:grid-cols-3'}`}>
      {job.shots.map((shot, index) => (
        <div key={shot.id} className="space-y-2 rounded-xl border border-white/10 p-2">
          {mediaUrl(shot.keyframeUrl) ? <img src={mediaUrl(shot.keyframeUrl)} alt={`${shot.id} ${productionShots[index]?.caption || '장면 이미지'}`} loading="lazy" className="aspect-[9/16] w-full rounded-lg bg-zinc-900 object-cover" /> : <div className="flex aspect-[9/16] items-center justify-center rounded-lg bg-zinc-900 text-xs text-zinc-400">{twoClip && index === 1 ? '첫 영상에서 이어집니다' : '이미지 준비 대기'}</div>}
          <p className="text-xs text-zinc-300">{shot.id} · {shot.status}</p>
          <details className="text-xs text-zinc-300">
            <summary className="cursor-pointer py-1">움직임 프롬프트 검토</summary>
            <label className="mt-2 block space-y-1">{job.status === 'review' ? `${shot.id} 영상 움직임` : `${shot.id} 저장된 영상 움직임`}
              <textarea
                className={fieldClass} rows={5} maxLength={5000}
                value={motionPrompts[index] || ''}
                readOnly={job.status !== 'review' || busy || loading}
                onChange={event => {
                  if (job.status !== 'review' || running.current || busy || loading) return;
                  const value = event.target.value;
                  setMotionDraft(current => ({ scope: motionScope, values: { ...(current.scope === motionScope ? current.values : {}), [shot.id]: value } }));
                }}
              />
            </label>
          </details>
          <StoryCoreAdvice quality={shot.quality?.video} />
          <AssetIssue error={shot.error} imageQuality={shot.quality?.image} canResume={!!job.canResume && openingRecovery} />
        </div>
      ))}
    </div>
  </> : null;
  if (compact && !ready && !job && !busy && !loading && !error) return null;
  return (
    <section className={compact ? "border-t border-white/10 pt-3 space-y-4" : "mt-8 space-y-5 rounded-3xl border border-fuchsia-500/40 bg-black/60 p-5"} aria-label="댕냥이 영상 제작">
      {!compact ? <>
        <h3 className="text-base font-bold text-white">5 · 30초 영상 만들기</h3>
        <p className="text-sm leading-relaxed text-zinc-300">{job && !twoClip ? '이전에 시작한 작업이 저장되어 있습니다. 아래에서 해당 작업을 이어갈 수 있습니다.' : '15초 영상 두 편을 이어 음원이 포함된 자막 없는 30초 영상으로 완성합니다.'}</p>
        <p className="text-xs text-zinc-300">{trackId ? `연결 음원: ${trackTitle || trackId}` : '이 콘티와 가사가 같은 음원을 Step 4에서 생성해 주세요.'}</p>
      </> : null}
      <p className="text-xs leading-relaxed text-zinc-300">{job?.status === 'completed' && !job.videoUrl?.includes('final-captionless-v1-') ? '자막과 효과 편집은 완성 영상을 다운로드한 후 캡컷에서 진행해 주세요.' : '음원이 포함된 자막 없는 30초 MP4를 제공합니다. 자막과 효과는 다운로드 후 캡컷에서 편집해 주세요.'}</p>
      {!job ? compact && (loading || busy || externalControl && restoring) ? (
        <p aria-live="polite" className="text-sm font-bold text-fuchsia-200">{loading ? '저장된 영상 작업 확인 중…' : '영상 제작을 준비하고 있습니다…'}</p>
      ) : !externalControl ? <button className={compact ? "w-full rounded-2xl border border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-4 py-4 text-base font-black text-white shadow-lg transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-100" : buttonClass} disabled={!ready} onClick={() => void start()}>{compact ? 'Step 5 영상 생성하기' : '30초 영상 만들기'}</button> : null : null}
      {job ? (
        <>
          <div aria-live="polite" className="space-y-2">
            <p className="text-sm text-fuchsia-200">{job.message} · {job.progress}%</p>
            <progress className="h-2 w-full accent-fuchsia-500" max={100} value={job.progress} aria-label="서버 영상 진행률" />
          </div>
          {job.status === 'review' ? <p className="text-xs leading-relaxed text-zinc-300">기준 이미지에서 어떤 동작을 할지 확인하세요. 이미지의 배치를 다시 설명하기보다 한 가지 동작을 짧게 적으면 좋습니다.</p> : null}
          {compact && job.status !== 'review' ? <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
            <h4 className="font-bold text-zinc-300">제작 상세</h4>
            <div className="mt-3 space-y-3">{jobDetails}</div>
          </div> : jobDetails}
          {job.status === 'review' && !validMotionPrompts ? <p className="text-xs text-amber-200">6개 움직임 프롬프트를 모두 입력해 주세요. 각 문구는 5,000자 이하여야 합니다.</p> : null}
          {job.status === 'review' ? <button className={buttonClass} disabled={!ready || !allKeyframes || !validMotionPrompts || busy || loading} onClick={() => void start('approve')}>2. 6장면 확인 완료 · 영상 생성 승인</button> : null}
          {!externalControl && !stoppedStatuses.has(job.status) && !busy ? <button className={buttonClass} disabled={!ready || loading} onClick={() => void start()}>저장된 단계부터 이어서 진행</button> : null}
          {job.status === 'failed' || job.status === 'held' ? <p className="text-sm text-amber-200">작업이 멈췄습니다. 상태를 확인해 주세요. 같은 장면을 자동으로 다시 결제하지 않습니다.</p> : null}
          {!externalControl && job.canResume ? <button className={buttonClass} disabled={!ready || busy || loading} onClick={() => void start('resume')}>{twoClip ? openingRecovery ? '저장된 이미지로 영상 제작 이어가기' : '저장된 결과로 제작 이어가기' : '저장된 결과로 다시 합성/보관'}</button> : null}
          {job.status !== 'completed' ? <button className="text-xs text-zinc-300 underline disabled:opacity-100" disabled={busy || loading} onClick={() => void refresh()}>상태 다시 확인</button> : null}
          {job.status === 'completed' && mediaUrl(job.videoUrl) ? <div className="space-y-3">
            <PetContentReviewNotice job={job} />
            <video controls playsInline preload="metadata" src={mediaUrl(job.videoUrl)} onPlay={event => registerActiveAudio(event.currentTarget)} className="mx-auto max-h-[560px] max-w-full rounded-xl" />
            <div className="flex flex-wrap items-center gap-3">
              <a className="inline-block text-sm text-fuchsia-300 underline" href={mediaUrl(job.videoUrl)} download>완성 영상 다운로드 · {job.durationSeconds ?? 30}초</a>
              {job.contentReview?.status !== 'owner_confirmed' ? <button type="button" className={buttonClass} disabled={busy || loading} onClick={() => void confirmContent()}>영상 확인 완료</button> : null}
            </div>
          </div> : null}
        </>
      ) : null}
      {!job && restoreFailed ? <button className="text-xs text-zinc-300 underline disabled:opacity-100" disabled={busy || loading} onClick={() => void refresh()}>상태 다시 확인</button> : null}
      {error ? <p role="alert" className="text-sm text-amber-200">{error}</p> : null}
    </section>
  );
}
