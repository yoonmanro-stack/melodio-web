'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, Download, Film, Music4, Pause, Play, RefreshCw, Sparkles } from 'lucide-react';
import { type DanceTrack, type DanceVideoJob } from '@/lib/dance/preset';
import { DANCE_MUSIC_PROFILES, type DanceVocalPreference } from '@/lib/dance/musicProfiles';
import { DANCE_CREATIVE_OPTIONS, type DanceCreativePreferences } from '@/lib/dance/creativeDirection';
import { registerActiveAudio } from '@/lib/globalAudio';

const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-fuchsia-400/50 bg-fuchsia-950 px-5 py-3 font-bold text-fuchsia-100 transition enabled:hover:bg-fuchsia-900 disabled:cursor-not-allowed disabled:border-zinc-600 disabled:bg-zinc-900 disabled:text-zinc-300';
const field = 'w-full rounded-xl border border-white/20 bg-zinc-950 p-3 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:border-fuchsia-400';
const active = (job: DanceVideoJob | null) => Boolean(job && !['ideas', 'ready', 'image-review', 'preview-review', 'completed', 'attention'].includes(job.status));
const clock = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
const DEFAULT_CREATIVE_PREFERENCES: DanceCreativePreferences = { performer: 'auto', ensemble: 'auto', species: 'auto', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' };
const creativeFields: { key: keyof DanceCreativePreferences; label: string }[] = [
  { key: 'performer', label: '출연자' }, { key: 'ensemble', label: '출연 규모' }, { key: 'species', label: '동물 종류' },
  { key: 'location', label: '장소' }, { key: 'danceStyle', label: '안무 스타일' },
  { key: 'visualStyle', label: '영상 표현' }, { key: 'difficulty', label: '따라 추기 난이도' },
];
const samePreferences = (left: DanceCreativePreferences | undefined, right: DanceCreativePreferences) => creativeFields.every(({ key }) => ({ ...DEFAULT_CREATIVE_PREFERENCES, ...left })[key] === ({ ...DEFAULT_CREATIVE_PREFERENCES, ...right })[key]);
const statusCopy: Record<DanceVideoJob['status'], string> = {
  preparing: '선택한 음원으로 아이디어와 장면 설계 준비 중…', ideas: '아이디어 3개를 비교하고 하나를 선택해 주세요.', ready: '선택한 아이디어의 장면 설계가 준비됐습니다.',
  image: '주인공과 배경 준비 중…', 'image-review': '첫 장면을 확인해 주세요.', clip1: '첫 번째 15초 영상 생성 중…',
  preview: '5초 동작 테스트 영상 만드는 중…', 'preview-review': '5초 동작 테스트를 확인해 주세요.',
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
  const [creativePreferences, setCreativePreferences] = useState<DanceCreativePreferences>(DEFAULT_CREATIVE_PREFERENCES);
  const [musicProfileId, setMusicProfileId] = useState<string>(DANCE_MUSIC_PROFILES[0].id);
  const [vocalPreference, setVocalPreference] = useState<DanceVocalPreference>('recommended');
  const [job, setJob] = useState<DanceVideoJob | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [listenPosition, setListenPosition] = useState(0);
  const [pendingAction, setPendingAction] = useState<'music' | 'prepare' | 'select-idea' | 'start' | 'approve-frame' | 'approve-preview' | 'resume' | 'reuse' | 'retry-plan' | null>(null);
  const [pendingIdeaId, setPendingIdeaId] = useState('');
  const requestId = useRef<{ id: string; isPublic: boolean; musicProfileId: string; vocalPreference: DanceVocalPreference } | null>(null);
  const reuseRequest = useRef<{ source: string; id: string } | null>(null);
  const handoff = useRef<{ userId: string; trackId: string; brief: string; preferences: DanceCreativePreferences; job: DanceVideoJob | null; uncertain: boolean } | null>(null);
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
  const currentJob = useRef(job);
  currentJob.current = job;
  const track = tracks.find(t => t.id === trackId);
  const musicProfile = DANCE_MUSIC_PROFILES.find(profile => profile.id === musicProfileId) || DANCE_MUSIC_PROFILES[0];
  const musicPending = Boolean(track && ['generating', 'pending'].includes(track.status));
  const videoPending = active(job);
  const busy = pending || musicPending || videoPending;
  const audioReady = track?.status === 'completed' && Boolean(track.audioUrl);
  const fullDuration = duration || track?.durationSeconds || 0;
  const maxStart = Math.max(0, fullDuration - 30);
  const lockedClip = track?.savedClip;
  const clipReady = Boolean(lockedClip) || fullDuration >= 30;
  const savedAudioUrl = job?.audioUrl || lockedClip?.audioUrl;
  const canReuseAudio = Boolean(job?.audioUrl && (job.canReuseAudio ??
    (['ideas', 'ready', 'image-review', 'preview-review', 'completed', 'attention'].includes(job.status) && !job.inFlight)));
  const rangeFrozen = Boolean(lockedClip);
  const canRetryPlan = Boolean(job?.status === 'attention' && job.audioUrl && !job.plan && !job.inFlight && !job.imageUrl && !job.clip1RequestId && !job.clip2RequestId);
  const canRetryIdea = Boolean(canRetryPlan && job?.ideas?.length && job.selectedIdea && (job.conceptPlanAttempts || 0) < 2 && !job.previewUrl && !job.bridgeUrl && !job.clip1Url && !job.clip2Url && !job.videoUrl);
  const selectionChanged = Boolean(job && (Math.abs(job.startSeconds - startSeconds) > 0.001 || job.visualBrief !== visualBrief.trim() || !samePreferences(job.creativePreferences, creativePreferences)));
  const currentSelectionState = useRef({ selectionChanged, uncertain, jobLoading, canRetryIdea });
  currentSelectionState.current = { selectionChanged, uncertain, jobLoading, canRetryIdea };
  const frozen = Boolean(job && !['ideas', 'ready'].includes(job.status) && !(job.status === 'attention' && !job.planningSubmitted && !job.inFlight));
  const preparedSelection = Boolean(job && ['ideas', 'ready'].includes(job.status) && !selectionChanged);

  useEffect(() => {
    if (previousUser.current !== null && previousUser.current !== userId) {
      revision.current += 1; audio.current?.pause(); previewAudio.current?.pause(); clipAudio.current?.pause(); video.current?.pause();
      setTracks([]); setTrackId(''); setJob(null); setVisualBrief(''); setCreativePreferences(DEFAULT_CREATIVE_PREFERENCES); setMusicProfileId(DANCE_MUSIC_PROFILES[0].id); setVocalPreference('recommended'); setError(''); setUncertain(false); requestId.current = null; reuseRequest.current = null; handoff.current = null;
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
    setJob(recovery?.job || null); setUncertain(Boolean(recovery?.uncertain)); setStartSeconds(lockedClip?.startSeconds || 0); setVisualBrief(recovery?.brief || ''); setCreativePreferences(recovery?.preferences || DEFAULT_CREATIVE_PREFERENCES); setDuration(0); setListenPosition(0); setPlaying(false); audio.current?.pause(); previewAudio.current?.pause(); clipAudio.current?.pause();
    setJobLoading(Boolean(trackId && userId));
    if (!trackId || !userId) return () => controller.abort();
    void jsonRequest<{ job: DanceVideoJob | null }>(`/api/viral-cf/dance-video?trackId=${encodeURIComponent(trackId)}`, undefined, controller.signal)
      .then(data => { if (current === revision.current && currentUser.current === userId) {
        setJob(data.job || recovery?.job || null);
        if (data.job) { setStartSeconds(data.job.startSeconds); setVisualBrief(data.job.visualBrief); setCreativePreferences(data.job.creativePreferences || DEFAULT_CREATIVE_PREFERENCES); setUncertain(false); }
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
        if (data.job) { setStartSeconds(data.job.startSeconds); setVisualBrief(data.job.visualBrief); setCreativePreferences(data.job.creativePreferences || DEFAULT_CREATIVE_PREFERENCES); }
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
    requestId.current ||= { id: crypto.randomUUID(), isPublic, musicProfileId, vocalPreference };
    try {
      const { id, ...musicRequest } = requestId.current;
      const data = await jsonRequest<{ track: DanceTrack }>('/api/viral-cf/dance-music', { requestId: id, ...musicRequest });
      if (current !== revision.current) return;
      setTracks(old => [data.track, ...old.filter(t => t.id !== data.track.id)]); setTrackId(data.track.id); requestId.current = null; reuseRequest.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : '음원 제출 상태를 확인해 주세요.'); }
    finally { inRequest.current = false; setPending(false); setPendingAction(null); }
  }
  async function act(action: 'prepare' | 'start' | 'approve-frame' | 'approve-preview' | 'resume') {
    if (!trackId || !userId || currentUser.current !== userId || selectedTrackRef.current !== trackId || pending || inRequest.current || currentSelectionState.current.uncertain || currentSelectionState.current.jobLoading) return;
    if (action === 'prepare' && (busy || frozen || !clipReady || preparedSelection)) return;
    if (action !== 'prepare' && (!job || currentJob.current?.id !== job.id || currentJob.current.status !== job.status)) return;
    if (action === 'start' && (job?.status !== 'ready' || currentSelectionState.current.selectionChanged)) return;
    if (action === 'approve-frame' && (job?.status !== 'image-review' || !job.imageUrl || currentSelectionState.current.selectionChanged)) return;
    if (action === 'approve-preview' && (job?.status !== 'preview-review' || !job.previewUrl || currentSelectionState.current.selectionChanged)) return;
    if (action === 'resume' && (job?.status !== 'attention' || !job.canResume)) return;
    inRequest.current = true; setPending(true); setPendingAction(action); setError(''); setUncertain(false);
    audio.current?.pause(); previewAudio.current?.pause(); clipAudio.current?.pause(); video.current?.pause(); setPlaying(false);
    const current = revision.current;
    try {
      const data = await jsonRequest<{ job: DanceVideoJob | null }>('/api/viral-cf/dance-video', action === 'prepare'
        ? { action, trackId, startSeconds, visualBrief: visualBrief.trim(), creativePreferences }
        : { action, trackId, jobId: job?.id });
      if (!data.job) throw new Error('기획 결과가 저장됐는지 확인하지 못했습니다. 저장된 작업 상태를 확인해 주세요.');
      if (current === revision.current && currentUser.current === userId) setJob(data.job);
    } catch (e) { if (current === revision.current && currentUser.current === userId) { setError(e instanceof Error ? e.message : '작업 상태를 확인해 주세요.'); setUncertain(true); } }
    finally { inRequest.current = false; setPending(false); setPendingAction(null); }
  }
  async function selectIdea(ideaId: string) {
    if (!trackId || !userId || currentUser.current !== userId || selectedTrackRef.current !== trackId || pending || inRequest.current || currentSelectionState.current.uncertain || currentSelectionState.current.jobLoading || currentSelectionState.current.selectionChanged) return;
    if (!job || currentJob.current?.id !== job.id || currentJob.current.status !== job.status || job.inFlight || !job.ideas?.some(idea => idea.id === ideaId) || (currentJob.current.conceptPlanAttempts || 0) >= 2) return;
    if (job.status !== 'ideas' && !(job.status === 'attention' && canRetryIdea && currentSelectionState.current.canRetryIdea && job.selectedIdea?.id === ideaId && currentJob.current.selectedIdea?.id === ideaId)) return;
    inRequest.current = true; setPending(true); setPendingAction('select-idea'); setPendingIdeaId(ideaId); setError('');
    audio.current?.pause(); previewAudio.current?.pause(); clipAudio.current?.pause(); setPlaying(false);
    const current = revision.current;
    try {
      const data = await jsonRequest<{ job: DanceVideoJob | null }>('/api/viral-cf/dance-video', { action: 'select-idea', trackId, jobId: job.id, ideaId });
      if (!data.job) throw new Error('아이디어 선택 결과가 저장됐는지 확인하지 못했습니다. 저장된 작업 상태를 확인해 주세요.');
      if (current === revision.current && currentUser.current === userId) setJob(data.job);
    } catch (e) {
      if (current === revision.current && currentUser.current === userId) { setError(e instanceof Error ? e.message : '아이디어 선택 상태를 확인해 주세요.'); setUncertain(true); }
    } finally { inRequest.current = false; setPending(false); setPendingAction(null); setPendingIdeaId(''); }
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
            action: 'prepare', trackId: result.trackId, startSeconds: job.startSeconds, visualBrief: job.visualBrief, creativePreferences: job.creativePreferences || DEFAULT_CREATIVE_PREFERENCES,
          });
          if (!prepared.job) throw new Error('기획 결과가 저장됐는지 확인하지 못했습니다. 저장된 작업 상태를 확인해 주세요.');
          preparedJob = prepared.job;
        } finally {
          // Even a lost response must reopen the saved attempt, not submit another one.
          if (current === revision.current && currentUser.current === userId) {
            handoff.current = { userId, trackId: result.trackId, brief: job.visualBrief, preferences: job.creativePreferences || DEFAULT_CREATIVE_PREFERENCES, job: preparedJob, uncertain: !preparedJob };
            setTrackId(result.trackId); setVisualBrief(job.visualBrief); setUncertain(!preparedJob); reuseRequest.current = null;
          }
        }
      } else {
        setTrackId(result.trackId); setVisualBrief(''); setCreativePreferences(DEFAULT_CREATIVE_PREFERENCES); setUncertain(false); reuseRequest.current = null;
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
      <h3 className="flex items-center gap-2 font-bold text-fuchsia-100"><Music4 className="h-4 w-4" />음악부터 만드는 댄스 챌린지</h3>
      <p className="text-sm text-zinc-200">시선을 붙잡을 상황과 춤을 기획하세요. 솔로부터 군집, 사람과 동물의 콜라보, 동물만의 챌린지까지 만들 수 있습니다.</p>
      <p className="text-xs leading-relaxed text-zinc-300">{job && !job.qualityPreviewRequired ? '아이디어 3개 중 하나를 골라 장면을 설계하고, 첫 장면에서 출연자와 장소를 확인한 뒤 영상 제작을 시작합니다.' : '아이디어 3개 중 하나를 골라 장면을 설계합니다. 첫 장면과 5초 동작 테스트를 확인한 뒤 30초 영상 제작을 시작합니다.'}</p>
    </div>
    {!userId ? <p className="text-sm text-amber-200">로그인 후 음원을 생성할 수 있습니다.</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-amber-400/40 bg-amber-950/40 p-3 text-sm text-amber-100">{error}</p> : null}
    <div className="space-y-3">
      <h3 className="font-bold text-white">1 · 음악 만들기</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-2 text-sm text-zinc-200">댄스 음악
          <select aria-label="댄스 음악" className={field} value={musicProfileId} disabled={busy || Boolean(requestId.current)} onChange={e => setMusicProfileId(e.target.value)}>
            {DANCE_MUSIC_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
          </select>
        </label>
        <label className="block space-y-2 text-sm text-zinc-200">보컬
          <select aria-label="보컬" className={field} value={vocalPreference} disabled={busy || Boolean(requestId.current)} onChange={e => setVocalPreference(e.target.value as DanceVocalPreference)}>
            <option value="recommended">음악에 맞춰 추천</option><option value="on">보컬 포함</option><option value="off">보컬 없이</option>
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-zinc-200 space-y-1">
        <p>{musicProfile.description}</p><p className="text-xs text-zinc-300">{musicProfile.rhythmPurpose}</p>
      </div>
      {trackId ? <p className="text-xs text-zinc-300">음악·보컬 선택은 다음 새 음원에 적용됩니다. 저장된 음원은 그대로 유지됩니다.</p> : null}
      {requestId.current && !pending ? <p className="text-xs text-amber-200">처음 선택한 음악·보컬 설정으로 요청 상태를 확인합니다.</p> : null}
      <label className="flex items-center gap-2 text-sm text-zinc-200"><input type="checkbox" checked={isPublic} disabled={busy || Boolean(trackId) || Boolean(requestId.current)} onChange={e => setIsPublic(e.target.checked)} />완성 영상을 바이럴 & 트렌드 존에 공개</label>
      <button type="button" className={`${button} w-full`} disabled={!userId || busy} onClick={() => void createMusic()} aria-busy={(pending && pendingAction === 'music') || musicPending}>
        {(pending && pendingAction === 'music') || musicPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Music4 className="h-4 w-4" />}{musicPending ? '음원 생성 중…' : pending && pendingAction === 'music' ? '요청 중…' : '새 댄스 음원 만들기'}
      </button>
      {tracks.length ? <label className="block space-y-1 text-sm text-zinc-200">내 댄스 음원
        <select aria-label="내 댄스 음원" className={field} value={trackId} disabled={pending || videoPending} onChange={e => { setError(''); setUncertain(false); setTrackId(e.target.value); setVisualBrief(''); setCreativePreferences(DEFAULT_CREATIVE_PREFERENCES); }}>
          <option value="">음원을 선택해 주세요</option>
          {tracks.map(t => <option key={t.id} value={t.id}>{t.title}{t.status !== 'completed' ? ` · ${t.status === 'generating' ? '생성 중' : '상태 확인 필요'}` : ''}</option>)}
        </select>
      </label> : null}
      {track?.musicLabel ? <p className="text-sm text-fuchsia-100">선택한 음원의 음악 · {track.musicLabel}{typeof track.instrumental === 'boolean' ? ` · ${track.instrumental ? '보컬 없음' : '보컬 포함'}` : ''}</p> : null}
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
      {job?.rhythm?.endingStatus === 'review' ? <p className="text-sm text-amber-200">마지막 보컬이나 음악이 잘리지 않는지 선택 구간을 확인하세요.</p> : null}
      <div className="flex flex-wrap gap-3"><a href={`/api/download?url=${encodeURIComponent(savedAudioUrl)}&filename=${encodeURIComponent(`${job?.plan?.title || track?.title || 'dance-clip'}-30s.wav`)}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-200 underline"><Download className="h-4 w-4" />30초 음원 WAV 다운로드</a></div>
      {canReuseAudio ? <button type="button" className={`${button} w-full`} disabled={busy} aria-busy={pendingAction === 'reuse'} onClick={() => void reuseAudio()}>{pendingAction === 'reuse' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}{pendingAction === 'reuse' ? '새 작업 준비 중…' : '같은 음원으로 새 챌린지 만들기'}</button> : null}
      {canReuseAudio && job?.inFlight ? <p className="text-sm text-amber-200">이전 기획은 결과 확인이 필요한 상태로 보존합니다. 같은 음원으로 별도의 새 챌린지를 준비할 수 있습니다.</p> : null}
      <p className="text-xs leading-relaxed text-zinc-300">이 음원은 자동 보관됩니다. 같은 음원으로 새 챌린지를 만들면 음악만 유지하고, 출연자·장소·안무를 새로 기획합니다. 기존 영상과 별도로 저장됩니다.</p>
    </div> : null}
    {audioReady ? <div className="space-y-4 border-t border-white/15 pt-5">
      <h3 className="font-bold text-white">3 · 상황 설정 &amp; 아이디어 선택</h3>
      <p className="text-sm leading-relaxed text-zinc-200">출연 구성과 규모를 선택하세요. 두세 명의 주고받는 춤, 군집의 순차 반응, 사람과 동물의 대비처럼 관계를 활용한 아이디어를 제안합니다.</p>
      <p className="text-xs leading-relaxed text-zinc-300">먼저 글로 된 아이디어 3개를 만듭니다. 아이디어 생성에는 기획 비용이 발생할 수 있으며, 이미지와 영상은 이후 버튼을 누를 때 제작합니다.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {creativeFields.filter(({ key }) => key !== 'species' || ['auto', 'animal', 'human_animal'].includes(creativePreferences.performer)).map(({ key, label }) => <label key={key} className="block space-y-2 text-sm text-zinc-200">{label}
          <select aria-label={label} className={field} value={creativePreferences[key] ?? DEFAULT_CREATIVE_PREFERENCES[key]} disabled={busy || frozen || (key === 'ensemble' && ['duo', 'group', 'crowd'].includes(creativePreferences.performer))} onChange={e => {
            const value = e.target.value;
            setCreativePreferences(previous => {
              const next = { ...previous, [key]: value };
              if (key === 'performer') {
                if (['woman', 'man', 'duo', 'group', 'crowd', 'robot'].includes(value)) next.species = 'auto';
                if (value === 'duo') next.ensemble = 'duo';
                else if (value === 'group') next.ensemble = 'trio';
                else if (value === 'crowd') next.ensemble = 'crowd';
                else if (value === 'human_animal' && next.ensemble === 'solo') next.ensemble = 'duo';
                else if (['duo', 'group', 'crowd'].includes(previous.performer)) next.ensemble = 'auto';
              }
              return next;
            });
          }}>
            {DANCE_CREATIVE_OPTIONS[key].filter(option => !(key === 'ensemble' && creativePreferences.performer === 'human_animal' && option.id === 'solo')).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>)}
      </div>
      <p className="text-xs leading-relaxed text-zinc-300">군집은 4–6명으로 구성하고 각 출연자의 역할과 위치를 유지합니다. 동물은 종류에 맞는 걸음·고개·앞발·날개 움직임으로 기획합니다.</p>
      <label className="block space-y-2 text-sm text-zinc-200">상황 및 요구사항 입력 (선택)
        <textarea className={`${field} min-h-28 resize-y`} maxLength={1000} disabled={busy || frozen} value={visualBrief} onChange={e => setVisualBrief(e.target.value)} placeholder="장소·인물의 분위기·반전 상황을 자유롭게 적어주세요. 비워두면 선택한 출연 구성에 맞춰 첫 장면의 후킹부터 전개와 결말까지 새로 기획합니다." />
      </label>
      <button type="button" className={`${button} w-full`} aria-busy={pending && pendingAction === 'prepare'} disabled={busy || jobLoading || uncertain || frozen || !clipReady || preparedSelection} onClick={() => void act('prepare')}>
        {pending && pendingAction === 'prepare' ? <RefreshCw className="h-4 w-4 animate-spin" /> : preparedSelection ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{pending && pendingAction === 'prepare' ? '아이디어 준비 중…' : preparedSelection ? job?.status === 'ideas' ? '아이디어 준비 완료' : '장면 설계 완료' : '아이디어 3개 받기'}
      </button>
      {job?.status === 'ideas' ? <div className="space-y-3">
        <p role="status" aria-live="polite" className="text-sm font-bold text-fuchsia-100">{pendingAction === 'select-idea' ? '선택한 아이디어로 장면 설계 중…' : statusCopy.ideas}</p>
        <p className="text-xs leading-relaxed text-zinc-300">마음에 드는 아이디어를 고르면 8카운트 안무와 30초 흐름을 설계합니다. 첫 장면은 설계 확인 후 따로 요청합니다.</p>
        {selectionChanged ? <p className="text-sm text-amber-200">설정이 바뀌었습니다. 아이디어 3개 받기를 눌러 새 설정에 맞는 아이디어를 확인하세요.</p> : null}
        <div className="grid gap-3 lg:grid-cols-3">
          {job.ideas?.map((idea, index) => <article key={idea.id} aria-label={`아이디어 ${index + 1} · ${idea.title}`} className="flex flex-col rounded-2xl border border-fuchsia-400/25 bg-black/30 p-4">
            <p className="mb-2 text-xs font-bold text-fuchsia-200">아이디어 {index + 1}</p>
            <h4 className="mb-4 text-base font-bold text-white">{idea.title}</h4>
            <dl className="flex-1 space-y-3 text-sm leading-relaxed">
              {idea.hookStory ? <><div><dt className="font-bold text-fuchsia-200">계속 볼 이유</dt><dd className="text-zinc-200">{idea.hookStory.watchReason}</dd></div><div><dt className="font-bold text-fuchsia-200">전개</dt><dd className="text-zinc-200">{idea.hookStory.development}</dd></div></> : null}
              <div><dt className="font-bold text-fuchsia-100">첫 2초</dt><dd className="text-zinc-200">{idea.firstTwoSeconds}</dd></div>
              <div><dt className="font-bold text-fuchsia-100">따라 할 동작</dt><dd className="text-zinc-200">{idea.signatureMove}</dd></div>
              <div><dt className="font-bold text-fuchsia-100">음악과 맞는 포인트</dt><dd className="text-zinc-200">{idea.musicConnection}</dd></div>
              <div><dt className="font-bold text-fuchsia-100">장면의 변화</dt><dd className="text-zinc-200">{idea.visualPayoff}</dd></div>
              <div><dt className="font-bold text-fuchsia-100">시리즈로 이어가기</dt><dd className="text-zinc-200">{idea.seriesPotential}</dd></div>
              <div><dt className="font-bold text-amber-200">제작 시 주의점</dt><dd className="text-zinc-200">{idea.productionRisk}</dd></div>
              {idea.reviewNote ? <div><dt className="font-bold text-amber-200">아이디어 검토</dt><dd className="text-zinc-200">{idea.reviewNote}</dd></div> : null}
            </dl>
            <button type="button" aria-label={`${idea.title} 선택하고 장면 설계`} className={`${button} mt-5 w-full`} disabled={busy || jobLoading || uncertain || selectionChanged || Boolean(job.inFlight)} aria-busy={pendingAction === 'select-idea' && pendingIdeaId === idea.id} onClick={() => void selectIdea(idea.id)}>
              {pendingAction === 'select-idea' && pendingIdeaId === idea.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{pendingAction === 'select-idea' && pendingIdeaId === idea.id ? '장면 설계 중…' : '이 아이디어로 장면 설계'}
            </button>
          </article>)}
        </div>
      </div> : null}
      {job?.selectedIdea ? <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-950/30 p-4 space-y-2">
        <p className="font-bold text-fuchsia-100">선택한 아이디어 · {job.selectedIdea.title}</p>
        <p className="text-sm text-zinc-200">첫 2초 · {job.selectedIdea.firstTwoSeconds}</p>
        <p className="text-sm text-zinc-200">따라 할 동작 · {job.selectedIdea.signatureMove}</p>
        {job.selectedIdea.hookStory ? <p className="text-sm text-zinc-200">계속 볼 이유 · {job.selectedIdea.hookStory.watchReason}</p> : null}
      </div> : null}
      {job?.plan ? <div className="rounded-xl border border-white/15 bg-black/30 p-4 space-y-3">
        <p className="font-bold text-white">{job.plan.title}</p><p className="text-sm leading-relaxed text-zinc-200">{job.plan.summary}</p>
        {job.direction ? <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-zinc-400">출연자</dt><dd className="text-zinc-100">{job.direction.castLabel}</dd></div>
          <div><dt className="text-zinc-400">장소</dt><dd className="text-zinc-100">{job.direction.locationLabel}</dd></div>
          <div><dt className="text-zinc-400">안무</dt><dd className="text-zinc-100">{job.direction.danceStyleLabel}</dd></div>
        </dl> : null}
        {job.direction?.cast ? <div className="space-y-2 border-t border-white/15 pt-3">
          <p className="text-sm font-bold text-white">출연 구성 · {job.direction.cast.count}{job.direction.cast.kind === 'animal' ? '마리' : '명/마리'}</p>
          <ul className="space-y-1 text-xs leading-relaxed text-zinc-300">{job.direction.cast.members.map(member => <li key={member.id}>{member.position} · {member.identity}</li>)}</ul>
        </div> : null}
        {job.plan.choreography ? <div className="space-y-3 border-t border-white/15 pt-3">
          <p className="font-bold text-fuchsia-100">반복 훅 · {job.plan.choreography.hookName}</p>
          <div className="space-y-2"><p className="text-sm font-bold text-white">8카운트 따라 추기</p><ol className="space-y-1 text-sm text-zinc-200">
            {job.plan.choreography.steps.map((step, index) => <li key={index}><span className="font-bold text-fuchsia-200">{step.count}</span> · {step.action}</li>)}
          </ol></div>
          <div className="space-y-2"><p className="text-sm font-bold text-white">30초 흐름</p><ol className="space-y-1 text-sm text-zinc-200">
            {job.plan.choreography.segments.map((segment, index) => <li key={index}><span className="font-bold text-fuchsia-200">{segment.startSeconds}–{segment.endSeconds}초</span> · {segment.action}{segment.repeatHook ? ' · 훅 반복' : ''}</li>)}
          </ol></div>
          <p className="text-xs text-zinc-300">시작 포즈 · {job.plan.choreography.firstPose}</p><p className="text-xs text-zinc-300">마지막 포즈 · {job.plan.choreography.endPose}</p>
        </div> : null}
      </div> : null}
    </div> : null}
    {job && job.status !== 'ideas' ? <div className="space-y-4 border-t border-white/15 pt-5">
      <h3 className="font-bold text-white">4 · 영상 만들기</h3>
      {!job.imageUrl && !job.videoSpec?.model?.includes('lite') ? <p className="text-xs text-zinc-300">Grok 1.5 · 720p로 제작합니다. 첫 장면과 5초 테스트를 확인한 뒤 30초 본편을 요청합니다.</p> : null}
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-bold text-fuchsia-100">{videoPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}{statusCopy[job.status]}</p>

      {job.status === 'ready' ? <button type="button" className={`${button} w-full`} disabled={pending || jobLoading || uncertain || selectionChanged} aria-busy={pendingAction === 'start'} onClick={() => void act('start')}><Film className="h-4 w-4" />{pendingAction === 'start' ? '첫 장면 요청 중…' : '첫 장면 만들기'}</button> : null}
      {selectionChanged ? <p className="text-sm text-amber-200">구간 또는 영상 선택이 바뀌었습니다. 아이디어를 다시 받아 주세요.</p> : null}
      {job.status === 'image-review' ? <div className="rounded-xl border border-fuchsia-400/30 bg-black/30 p-4 space-y-3">
        {job.imageUrl ? <Image unoptimized src={job.imageUrl} width={480} height={854} alt="영상 제작 전 확인할 출연자와 장소의 첫 장면" className="mx-auto max-h-[520px] w-auto max-w-full rounded-xl object-contain" /> : null}
        <p className="text-sm leading-relaxed text-zinc-200">선택한 인원과 동물 종류가 모두 보이는지, 각 출연자의 모습과 위치가 구별되는지 확인하세요. 전신과 바닥이 보이고 춤출 공간에 장애물이 없어야 합니다.</p>
        <p className="text-xs text-zinc-300">{job.qualityPreviewRequired ? '승인하면 이 출연자와 장소를 유지해 5초 동작 테스트를 만듭니다. 30초 영상은 테스트 확인 후 따로 요청합니다.' : '승인하면 이 출연자와 장소를 유지해 30초 영상을 만듭니다.'}</p>
        <button type="button" className={`${button} w-full`} disabled={pending || jobLoading || uncertain || selectionChanged || !job.imageUrl} aria-busy={pendingAction === 'approve-frame'} onClick={() => void act('approve-frame')}><Check className="h-4 w-4" />{pendingAction === 'approve-frame' ? job.qualityPreviewRequired ? '5초 테스트 요청 중…' : '영상 제작 요청 중…' : job.qualityPreviewRequired ? '이 장면으로 5초 동작 테스트' : '이 장면으로 영상 만들기'}</button>
      </div> : null}
      {job.status === 'preview-review' ? <div className="rounded-xl border border-fuchsia-400/30 bg-black/30 p-4 space-y-3">
        <p className="font-bold text-fuchsia-100">5초 동작 테스트</p>
        {job.previewUrl ? <video ref={video} aria-label="5초 동작 테스트" src={job.previewUrl} poster={job.imageUrl} controls playsInline preload="metadata" className="mx-auto max-h-[520px] max-w-full rounded-xl bg-black" onPlay={e => registerActiveAudio(e.currentTarget)} /> : null}
        <p className="text-xs text-zinc-300">저장한 30초 음원의 처음 5초에 맞춘 테스트입니다.</p>
        <p className="text-sm leading-relaxed text-zinc-200">첫 2초에 눈길을 끄는지, 각 출연자의 동작과 주고받는 반응이 보이는지 확인하세요. 인원·동물 종류·의상·위치가 유지되고 동물의 관절이 자연스러워야 합니다.</p>
        <p className="text-xs leading-relaxed text-zinc-300">동작이 약하거나 발·관절이 어색하면 같은 음원으로 새 챌린지를 만들어 아이디어를 바꿀 수 있습니다.</p>
        <p className="text-xs leading-relaxed text-zinc-300">승인하면 15초 영상 두 편으로 30초 영상을 만듭니다. 새로운 영상 제작 비용이 발생할 수 있습니다.</p>
        <button type="button" className={`${button} w-full`} disabled={pending || jobLoading || uncertain || selectionChanged || !job.previewUrl} aria-busy={pendingAction === 'approve-preview'} onClick={() => void act('approve-preview')}><Check className="h-4 w-4" />{pendingAction === 'approve-preview' ? '30초 영상 요청 중…' : '이 동작으로 30초 영상 만들기'}</button>
      </div> : null}
      {videoPending ? <p className="text-xs leading-relaxed text-zinc-300">생성 중에는 이 화면을 열어두세요. 이동했다면 대시보드의 ‘작업 열기’에서 이어갈 수 있습니다.</p> : null}
      {job.error ? <p className="text-sm text-amber-200">{job.error}</p> : null}
      {job.status === 'attention' && job.canResume ? <div className="space-y-2">
        <button type="button" className={`${button} w-full`} disabled={pending || jobLoading || uncertain} aria-busy={pendingAction === 'resume'} onClick={() => void act('resume')}><RefreshCw className={`h-4 w-4${pendingAction === 'resume' ? ' animate-spin' : ''}`} />{pendingAction === 'resume' ? '저장된 결과 확인 중…' : '저장된 결과로 이어 만들기'}</button>
        <p className="text-xs text-zinc-300">저장된 생성 결과와 클립을 확인해 이어갑니다.</p>
      </div> : null}
      {canRetryIdea && job.selectedIdea ? <div className="space-y-2">
        <button type="button" className={`${button} w-full`} disabled={busy || jobLoading || uncertain || selectionChanged} aria-busy={pendingAction === 'select-idea'} onClick={() => void selectIdea(job.selectedIdea!.id)}><RefreshCw className={`h-4 w-4${pendingAction === 'select-idea' ? ' animate-spin' : ''}`} />{pendingAction === 'select-idea' ? '같은 아이디어 기획 중…' : '이 아이디어로 기획 다시 시도'}</button>
        <p className="text-xs leading-relaxed text-zinc-300">선택한 아이디어로 장면 설계를 한 번 더 요청합니다. 새로운 기획 요청 비용이 발생할 수 있습니다.</p>
      </div> : null}
      {canRetryPlan && job.selectedIdea && (job.conceptPlanAttempts || 0) >= 2 ? <p className="text-xs leading-relaxed text-amber-200">이 아이디어의 장면 설계를 두 번 시도했습니다. 저장된 음원으로 새 챌린지를 만들어 다른 아이디어를 고를 수 있습니다.</p> : null}
      {canRetryPlan ? <div className="space-y-2"><button type="button" className={`${button} w-full`} disabled={busy || jobLoading || uncertain} aria-busy={pendingAction === 'retry-plan'} onClick={() => void reuseAudio(true)}><RefreshCw className={`h-4 w-4${pendingAction === 'retry-plan' ? ' animate-spin' : ''}`} />{pendingAction === 'retry-plan' ? '아이디어 다시 요청 중…' : '아이디어 다시 받기'}</button><p className="text-xs leading-relaxed text-zinc-300">저장된 30초 음원과 입력 내용으로 아이디어 3개를 다시 요청합니다. 새로운 기획 요청 비용이 발생할 수 있습니다.</p></div> : null}
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
