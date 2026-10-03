import { randomUUID } from 'node:crypto';
import { DANCE_CATEGORY_ID, DANCE_PRESET, DANCE_WORKFLOW, isDanceAudioSelection, isDanceMetadata, type DanceAudioSelection, type DancePlan, type DancePlanFailure, type DanceVideoJob } from './preset';

export class DanceVideoError extends Error {
  constructor(message: string, public code = 'DANCE_VIDEO', public status = 400, public planFailure?: DancePlanFailure) { super(message); }
}
export const DANCE_VIDEO_LEASE_MS = 4 * 60 * 1000;
export const DANCE_VIDEO_REQUEST_BYTES = 16 * 1024;
export const DANCE_PLAN_TIMEOUT_MS = 180_000;
// The route allows 300 seconds; reserve 30 seconds for failure/final checkpoints.
export const DANCE_PREPARE_BUDGET_MS = 270_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function assertDanceUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new DanceVideoError('저장된 음원 또는 작업 ID가 필요합니다.', 'ID');
}
export type DanceSavedJob = DanceVideoJob & {
  imageSourceUrl?: string; clip1SourceUrl?: string; clip2SourceUrl?: string; lastPollAt?: string;
  planningSubmitted?: boolean;
};
export type DanceOwnedRecord = {
  id: string; userId: string; status: string; audioUrl: string | null; licenseHash: string | null;
  title: string; isPublic: boolean; createdAt: string;
  metadata: Record<string, unknown>;
};
export interface DanceVideoStore {
  load(userId: string, trackId: string): Promise<DanceOwnedRecord | null>;
  compareAndSwap(record: DanceOwnedRecord, job: DanceSavedJob): Promise<DanceOwnedRecord | null>;
  insert?(record: DanceOwnedRecord): Promise<boolean>;
}
export type DanceSnapshot = Pick<DanceVideoJob, 'audioUrl' | 'sourceAudioHash' | 'audioHash' | 'sourceDurationSeconds' | 'bpm' | 'onsetSeconds'>;
export interface DanceVideoDependencies {
  store: DanceVideoStore; now?: () => number;
  snapshot(job: DanceVideoJob, sourceUrl: string): Promise<DanceSnapshot>;
  reuseSnapshot(selection: DanceAudioSelection): Promise<void>;
  plan(job: DanceVideoJob, options?: { timeoutMs: number }): Promise<DancePlan>;
  generateImage(prompt: string): Promise<{ url: string }>;
  startVideo(prompt: string, duration: number, keyframe: string): Promise<{ requestId: string }>;
  pollVideo(requestId: string): Promise<{ status: 'pending' | 'done' | 'failed' | 'expired'; url?: string }>;
  copyAsset(job: DanceVideoJob, kind: 'image' | 'video', url: string, filename: string): Promise<string>;
  bridge(job: DanceVideoJob): Promise<string>;
  render(job: DanceVideoJob): Promise<string>;
}
export function readDanceVideoJob(record: DanceOwnedRecord): DanceSavedJob | null {
  const value = record.metadata.danceVideo;
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DanceVideoError('저장된 영상 작업을 확인하지 못했습니다.', 'JOB_INVALID', 409);
  const job = value as DanceSavedJob;
  if (!UUID.test(job.id || '') || job.trackId !== record.id || job.durationSeconds !== 30
    || !['preparing', 'ready', 'image', 'clip1', 'bridge', 'clip2', 'render', 'completed', 'attention'].includes(job.status)
    || !Number.isFinite(job.startSeconds) || job.startSeconds < 0) throw new DanceVideoError('저장된 영상 작업이 음원과 일치하지 않습니다.', 'JOB_INVALID', 409);
  return structuredClone(job);
}
function safeFailure(error: unknown): string {
  if (error instanceof DanceVideoError) return error.message;
  // Never reflect provider payloads, prompts, URLs, or transport errors into metadata.
  return '현재 단계를 확인하지 못했습니다. 저장된 음원·클립과 요청 ID를 보존했습니다. 자동으로 다시 생성하지 않습니다.';
}
function audioSelection(value: unknown): DanceAudioSelection {
  if (!isDanceAudioSelection(value)) throw new DanceVideoError('재사용할 30초 음원 정보가 올바르지 않습니다.', 'AUDIO_SELECTION', 409);
  return { audioUrl: value.audioUrl, audioHash: value.audioHash, sourceAudioHash: value.sourceAudioHash,
    sourceDurationSeconds: value.sourceDurationSeconds, startSeconds: value.startSeconds, durationSeconds: 30,
    ...(value.bpm === undefined ? {} : { bpm: value.bpm }),
    ...(value.onsetSeconds === undefined ? {} : { onsetSeconds: [...value.onsetSeconds] }) };
}

/** Every paid call is preceded by an owner-scoped CAS lease, and every provider ID is checkpointed. */
export function createDanceVideoService(deps: DanceVideoDependencies) {
  const now = deps.now || Date.now;
  const timestamp = () => new Date(now()).toISOString();
  async function owned(userId: string, trackId: string, requireAudio = true) {
    assertDanceUuid(userId); assertDanceUuid(trackId);
    const record = await deps.store.load(userId, trackId);
    if (!record || record.userId !== userId) throw new DanceVideoError('본인 소유의 음원을 찾을 수 없습니다.', 'TRACK_NOT_FOUND', 404);
    if (!isDanceMetadata(record.metadata) || (requireAudio && (record.status !== 'completed' || !record.audioUrl))) {
      throw new DanceVideoError('이 흐름에서 새로 만든 완성된 댄스 음원을 선택해 주세요.', 'TRACK_NOT_READY', 409);
    }
    return record;
  }
  function expired(job: DanceSavedJob) {
    return Boolean(job.inFlight && (!Number.isFinite(Date.parse(job.inFlight.at)) || now() - Date.parse(job.inFlight.at) >= DANCE_VIDEO_LEASE_MS));
  }
  function view(job: DanceSavedJob | null): DanceVideoJob | null {
    if (!job) return null;
    const result = structuredClone(job);
    if (expired(result)) {
      result.status = 'attention';
      result.error = '이전 요청의 완료 여부를 확인해야 합니다. 중복 생성을 막기 위해 저장된 작업을 보류했습니다.';
    }
    return result;
  }
  async function get(userId: string, trackId: string) { return view(readDanceVideoJob(await owned(userId, trackId, false))); }
  async function reuse(userId: string, trackId: string, jobId: string, requestId: string) {
    assertDanceUuid(userId); assertDanceUuid(trackId); assertDanceUuid(jobId); assertDanceUuid(requestId);
    const request = requestId.toLowerCase();
    if (request === trackId.toLowerCase()) throw new DanceVideoError('새 영상에 사용할 별도 요청 ID가 필요합니다.', 'REUSE_CONFLICT', 409);
    function existingVariant(record: DanceOwnedRecord) {
      const variant = record.metadata.danceVariant as Record<string, unknown> | undefined;
      if (record.userId !== userId || !isDanceMetadata(record.metadata) || !variant
        || variant.sourceTrackId !== trackId || variant.sourceJobId !== jobId
        || !isDanceAudioSelection(record.metadata.danceAudioSelection)) {
        throw new DanceVideoError('다른 작업에 사용된 요청 ID입니다. 저장된 작업을 확인해 주세요.', 'REUSE_CONFLICT', 409);
      }
      return { trackId: record.id, job: null };
    }
    const existing = await deps.store.load(userId, request);
    if (existing) return existingVariant(existing);
    const source = await owned(userId, trackId);
    const job = readDanceVideoJob(source);
    if (!job || job.id !== jobId) throw new DanceVideoError('재사용할 저장 작업을 찾을 수 없습니다.', 'JOB_NOT_FOUND', 404);
    if (job.inFlight || !['ready', 'completed', 'attention'].includes(job.status)) {
      throw new DanceVideoError('현재 영상 작업이 멈추거나 완료된 뒤 같은 음원을 사용할 수 있습니다.', 'REUSE_NOT_READY', 409);
    }
    const selection = audioSelection(job);
    if (source.metadata.danceAudioSelection !== undefined
      && JSON.stringify(audioSelection(source.metadata.danceAudioSelection)) !== JSON.stringify(selection)) {
      throw new DanceVideoError('저장된 재사용 음원과 작업의 구간이 일치하지 않습니다.', 'AUDIO_SELECTION', 409);
    }
    if (typeof source.isPublic !== 'boolean' || !deps.store.insert || !deps.reuseSnapshot) {
      throw new DanceVideoError('음원 재사용 저장소를 확인하지 못했습니다.', 'JOB_STORAGE', 503);
    }
    await deps.reuseSnapshot(selection);
    // Source edits during validation cannot silently change the requested job or clip.
    const current = await owned(userId, trackId);
    const currentJob = readDanceVideoJob(current);
    if (!currentJob || currentJob.id !== jobId || currentJob.inFlight || !['ready', 'completed', 'attention'].includes(currentJob.status)
      || JSON.stringify(audioSelection(currentJob)) !== JSON.stringify(selection)) {
      throw new DanceVideoError('원본 작업이 바뀌었습니다. 저장된 음원을 다시 확인해 주세요.', 'REUSE_CONFLICT', 409);
    }
    const priorVariant = source.metadata.danceVariant as Record<string, unknown> | undefined;
    const rootTrackId = priorVariant && typeof priorVariant.rootTrackId === 'string' && UUID.test(priorVariant.rootTrackId) ? priorVariant.rootTrackId : source.id;
    const originalMusicTitle = (typeof source.metadata.originalMusicTitle === 'string' ? source.metadata.originalMusicTitle : source.title)
      .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
    const metadata = { workflow: DANCE_WORKFLOW, presetId: DANCE_CATEGORY_ID, presetName: DANCE_PRESET.label,
      sourceMenu: 'dance', isPublic: current.isPublic, isInstrumental: true, duration: selection.sourceDurationSeconds,
      originalMusicTitle, danceVariant: { sourceTrackId: trackId, sourceJobId: jobId, rootTrackId }, danceAudioSelection: selection };
    const record: DanceOwnedRecord = { id: request, userId, status: 'completed', audioUrl: source.audioUrl,
      title: `${originalMusicTitle.slice(0, 170)} · 새 영상 ${request.slice(0, 6)}`, isPublic: current.isPublic, createdAt: timestamp(), metadata, licenseHash: JSON.stringify(metadata) };
    if (await deps.store.insert(record)) return { trackId: request, job: null };
    const winner = await deps.store.load(userId, request);
    if (winner) return existingVariant(winner);
    throw new DanceVideoError('요청 ID가 이미 사용되었거나 저장 상태를 확인할 수 없습니다.', 'REUSE_CONFLICT', 409);
  }
  async function checkpoint(userId: string, next: DanceSavedJob, token: string): Promise<DanceSavedJob> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const record = await owned(userId, next.trackId);
      const current = readDanceVideoJob(record);
      if (!current || current.id !== next.id || current.inFlight?.token !== token) {
        throw new DanceVideoError('다른 요청에서 작업 상태가 바뀌었습니다. 저장된 작업을 다시 확인해 주세요.', 'LEASE_LOST', 409);
      }
      const saved = await deps.store.compareAndSwap(record, { ...next, updatedAt: timestamp() });
      if (saved) return readDanceVideoJob(saved)!;
    }
    throw new DanceVideoError('작업 상태 저장이 지연되었습니다. 같은 단계를 자동 재요청하지 않습니다.', 'JOB_CONFLICT', 409);
  }
  async function finish(userId: string, job: DanceSavedJob, token: string) {
    const next = { ...job }; delete next.inFlight;
    return checkpoint(userId, next, token);
  }
  async function hold(userId: string, job: DanceSavedJob, token: string, error: unknown) {
    // Keep the latest successfully saved IDs/assets even if a later copy or render failed.
    const record = await owned(userId, job.trackId);
    const saved = readDanceVideoJob(record);
    if (!saved || saved.id !== job.id || saved.inFlight?.token !== token) throw error;
    return finish(userId, { ...saved, status: 'attention', error: safeFailure(error),
      ...(error instanceof DanceVideoError && error.planFailure ? { planFailure: error.planFailure } : {}) }, token);
  }
  async function prepare(userId: string, trackId: string, startSeconds: unknown, visualBrief: unknown) {
    const startedAt = now();
    if (typeof startSeconds !== 'number' || !Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds > 3600) throw new DanceVideoError('올바른 30초 구간의 시작 시간을 선택해 주세요.', 'AUDIO_RANGE');
    if (typeof visualBrief !== 'string' || visualBrief.trim().length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(visualBrief)) throw new DanceVideoError('상황 설정은 1,000자 이내의 텍스트로 입력해 주세요. 비워 두면 AI가 기획합니다.', 'VISUAL_BRIEF');
    const normalizedBrief = visualBrief.trim();
    const record = await owned(userId, trackId);
    const savedSelection = record.metadata.danceAudioSelection === undefined ? null : audioSelection(record.metadata.danceAudioSelection);
    if (savedSelection && startSeconds !== savedSelection.startSeconds) {
      throw new DanceVideoError('재사용 음원은 저장된 30초 구간을 그대로 사용합니다.', 'AUDIO_SELECTION_LOCKED', 409);
    }
    const previous = readDanceVideoJob(record);
    if (previous) {
      if (previous.startSeconds === startSeconds && previous.visualBrief === normalizedBrief) return view(previous)!;
      const unspentPreparation = previous.status === 'attention' && !previous.planningSubmitted && !previous.imageSourceUrl;
      if ((previous.status !== 'ready' && !unspentPreparation) || previous.inFlight) throw new DanceVideoError('이미 시작된 작업의 음원을 바꿀 수 없습니다. 저장된 작업을 확인해 주세요.', 'JOB_EXISTS', 409);
    }
    const reusableSelection = savedSelection || (previous?.startSeconds === startSeconds && isDanceAudioSelection(previous) ? audioSelection(previous) : null);
    const token = randomUUID();
    let job: DanceSavedJob = { id: randomUUID(), trackId, status: 'preparing', startSeconds, durationSeconds: 30,
      visualBrief: normalizedBrief, createdAt: timestamp(), updatedAt: timestamp(), inFlight: { action: 'prepare', token, at: timestamp() } };
    const reserved = await deps.store.compareAndSwap(record, job);
    if (!reserved) return get(userId, trackId);
    try {
      // Source duration/range and the exact preview bytes are established before any paid planning.
      let snapshot: DanceSnapshot;
      if (reusableSelection) {
        await deps.reuseSnapshot(reusableSelection);
        snapshot = reusableSelection;
      } else snapshot = await deps.snapshot(job, record.audioUrl!);
      if (!snapshot.audioUrl || !snapshot.audioHash || !snapshot.sourceAudioHash || !Number.isFinite(snapshot.sourceDurationSeconds)
        || snapshot.sourceDurationSeconds! < 30 || job.startSeconds + 30 > snapshot.sourceDurationSeconds! + 0.00001) {
        throw new DanceVideoError('선택한 30초 음원 구간을 확인하지 못했습니다.', 'AUDIO_RANGE');
      }
      const remaining = () => Math.max(0, Math.floor(DANCE_PREPARE_BUDGET_MS - Math.max(0, now() - startedAt)));
      // Keep the verified WAV even when earlier preparation consumed the request budget.
      // Renew the lease so a slow source download does not expire a live planning call.
      job = await checkpoint(userId, { ...job, ...snapshot, ...(remaining() > 0 ? { planningSubmitted: true } : {}),
        inFlight: { action: 'prepare', token, at: timestamp() } }, token);
      const timeoutMs = Math.min(DANCE_PLAN_TIMEOUT_MS, remaining());
      if (timeoutMs <= 0) throw new DanceVideoError('음원 준비 중 요청 대기 시간이 초과되었습니다. 저장된 30초 음원은 유지됩니다.', 'PLAN_TIMEOUT', 504,
        { code: 'PLAN_TIMEOUT', kind: 'timeout', phase: 'preparation', elapsedMs: Math.max(0, now() - startedAt), timeoutMs: DANCE_PREPARE_BUDGET_MS });
      const plan = await deps.plan(job, { timeoutMs });
      if (plan.clips.length !== 2 || plan.clips.some(prompt => !prompt.trim() || prompt.length > 4096)) throw new DanceVideoError('두 개의 15초 영상 계획을 확인하지 못했습니다.', 'PLAN_INVALID');
      return finish(userId, { ...job, plan, status: 'ready' }, token);
    } catch (error) { return hold(userId, job, token, error); }
  }
  async function transition(userId: string, trackId: string, jobId: string, action: 'start' | 'advance') {
    assertDanceUuid(jobId);
    const record = await owned(userId, trackId);
    let job = readDanceVideoJob(record);
    if (!job || job.id !== jobId) throw new DanceVideoError('저장된 작업 ID가 일치하지 않습니다.', 'JOB_NOT_FOUND', 404);
    if (expired(job)) {
      const stale = { ...job, status: 'attention' as const, error: '이전 요청의 완료 여부를 확인해야 합니다. 저장된 요청 ID를 보존하고 자동 재생성을 중단했습니다.', updatedAt: timestamp() };
      return readDanceVideoJob(await deps.store.compareAndSwap(record, stale) || await owned(userId, trackId));
    }
    if (job.inFlight || job.status === 'completed' || job.status === 'attention') return view(job);
    if (action === 'start') {
      if (job.status !== 'ready') return view(job);
      if (!job.plan || !job.audioUrl) throw new DanceVideoError('선택 음원과 영상 계획을 먼저 준비해 주세요.', 'NOT_READY', 409);
      const started = await deps.store.compareAndSwap(record, { ...job, status: 'image', updatedAt: timestamp() });
      return readDanceVideoJob(started || await owned(userId, trackId));
    }
    if (job.status === 'ready' || job.status === 'preparing') return view(job);
    if (!job.plan || !job.audioUrl) throw new DanceVideoError('저장된 음원 또는 영상 계획이 없습니다.', 'NOT_READY', 409);
    // Bound polling even if a browser accidentally dispatches duplicate advances.
    const isPoll = (job.status === 'clip1' && job.clip1RequestId) || (job.status === 'clip2' && job.clip2RequestId);
    if (isPoll && job.lastPollAt && now() - Date.parse(job.lastPollAt) < 4000) return view(job);
    const token = randomUUID();
    job = { ...job, inFlight: { action: isPoll ? `${job.status}-poll` : job.status, token, at: timestamp() }, updatedAt: timestamp() };
    const reserved = await deps.store.compareAndSwap(record, job);
    if (!reserved) return get(userId, trackId);
    try {
      if (job.status === 'image') {
        const result = await deps.generateImage(job.plan!.imagePrompt);
        job = await checkpoint(userId, { ...job, imageSourceUrl: result.url }, token);
        const imageUrl = await deps.copyAsset(job, 'image', result.url, 'first-frame');
        return finish(userId, { ...job, imageUrl, status: 'clip1' }, token);
      }
      if (job.status === 'clip1' || job.status === 'clip2') {
        const second = job.status === 'clip2';
        const requestId = second ? job.clip2RequestId : job.clip1RequestId;
        if (!requestId) {
          const keyframe = second ? job.bridgeUrl : job.imageUrl;
          if (!keyframe) throw new DanceVideoError('클립 시작 프레임을 확인하지 못했습니다.', 'MISSING_IMAGE');
          const result = await deps.startVideo(job.plan!.clips[second ? 1 : 0], 15, keyframe);
          if (!/^[a-zA-Z0-9_-]{1,150}$/.test(result.requestId)) throw new DanceVideoError('영상 제출 결과가 불확실합니다. 자동으로 다시 제출하지 않습니다.', 'UNKNOWN_SUBMISSION');
          return finish(userId, { ...job, ...(second ? { clip2RequestId: result.requestId } : { clip1RequestId: result.requestId }) }, token);
        }
        const result = await deps.pollVideo(requestId);
        job = { ...job, lastPollAt: timestamp() };
        if (result.status === 'pending') return finish(userId, job, token);
        if (result.status !== 'done' || !result.url) throw new DanceVideoError('영상 공급자가 이 클립을 완료하지 못했습니다. 다른 클립과 음원은 보존했습니다.', 'PROVIDER_FAILED');
        job = await checkpoint(userId, { ...job, ...(second ? { clip2SourceUrl: result.url } : { clip1SourceUrl: result.url }) }, token);
        const url = await deps.copyAsset(job, 'video', result.url, second ? 'clip2' : 'clip1');
        return finish(userId, { ...job, ...(second ? { clip2Url: url, status: 'render' } : { clip1Url: url, status: 'bridge' }) }, token);
      }
      if (job.status === 'bridge') {
        if (!job.clip1Url) throw new DanceVideoError('첫 번째 완성 클립이 필요합니다.', 'MISSING_CLIP');
        return finish(userId, { ...job, bridgeUrl: await deps.bridge(job), status: 'clip2' }, token);
      }
      if (job.status === 'render') {
        if (!job.clip1Url || !job.clip2Url) throw new DanceVideoError('두 개의 완성 클립이 모두 필요합니다.', 'MISSING_CLIP');
        return finish(userId, { ...job, videoUrl: await deps.render(job), status: 'completed' }, token);
      }
      throw new DanceVideoError('지원하지 않는 작업 단계입니다.', 'JOB_STATE');
    } catch (error) { return hold(userId, job, token, error); }
  }
  return { get, reuse, prepare, start: (user: string, track: string, job: string) => transition(user, track, job, 'start'), advance: (user: string, track: string, job: string) => transition(user, track, job, 'advance') };
}
