import { randomUUID } from 'node:crypto';
import { DANCE_CATEGORY_ID, DANCE_WORKFLOW, isDanceAudioSelection, isDanceMetadata, type DanceAudioSelection, type DancePlan, type DancePlanFailure, type DanceVideoJob } from './preset';
import { validateDanceCreativePreferences, resolveDanceCreativeDirection, buildDanceCadenceGuide } from './creativeDirection';
import { getDanceMusicSpec } from './musicProfiles';
import { validateDanceIdeas, compactDanceCastPrompt, validateDanceActorActions, validateDanceActorSequence, type DanceIdea } from './ideas';

export class DanceVideoError extends Error {
  constructor(message: string, public code = 'DANCE_VIDEO', public status = 400, public planFailure?: DancePlanFailure) { super(message); }
}
export const DANCE_PREVIEW_SCENE_LIMIT = 650;
export const DANCE_PREVIEW_SCENE_PATTERN = '^[ -~]+$';
/** Bounded scene instructions shared by new plan parsing and stored preview compilation. */
export function validateDancePreviewScene(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > DANCE_PREVIEW_SCENE_LIMIT
    || !new RegExp(DANCE_PREVIEW_SCENE_PATTERN).test(value) || /data:|base64/i.test(value)) throw new DanceVideoError('테스트 영상 연출은 650자 이내의 영문 ASCII 문장으로 설명해 주세요.', 'PLAN_INVALID');
  return value.trim();
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
  recentDirections?(userId: string): Promise<unknown[]>;
}
export type DanceSnapshot = Pick<DanceVideoJob, 'audioUrl' | 'sourceAudioHash' | 'audioHash' | 'sourceDurationSeconds' | 'bpm' | 'onsetSeconds' | 'rhythm'>;
export interface DanceVideoDependencies {
  store: DanceVideoStore; now?: () => number;
  snapshot(job: DanceVideoJob, sourceUrl: string): Promise<DanceSnapshot>;
  reuseSnapshot(selection: DanceAudioSelection): Promise<void>;
  plan(job: DanceVideoJob, options?: { timeoutMs: number }): Promise<DancePlan>;
  ideas?(job: DanceVideoJob, options?: { timeoutMs: number }): Promise<DanceIdea[]>;
  generateImage(prompt: string): Promise<{ url: string }>;
  startVideo(prompt: string, duration: number, keyframe: string, options?: { resolution: '480p' | '720p'; model?: NonNullable<DanceVideoJob['videoSpec']>['model']; referenceImageUrl?: string; generateAudio?: boolean }): Promise<{ requestId: string }>;
  pollVideo(requestId: string): Promise<{ status: 'pending' | 'done' | 'failed' | 'expired'; url?: string }>;
  copyAsset(job: DanceVideoJob, kind: 'image' | 'video', url: string, filename: string): Promise<string>;
  bridge(job: DanceVideoJob): Promise<string>;
  render(job: DanceVideoJob): Promise<string>;
  preview?(job: DanceVideoJob): Promise<string>;
  videoModel?: NonNullable<DanceVideoJob['videoSpec']>['model'];
}
export function readDanceVideoJob(record: DanceOwnedRecord): DanceSavedJob | null {
  const value = record.metadata.danceVideo;
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DanceVideoError('저장된 영상 작업을 확인하지 못했습니다.', 'JOB_INVALID', 409);
  const job = value as DanceSavedJob;
  if (!UUID.test(job.id || '') || job.trackId !== record.id || job.durationSeconds !== 30
    || !['preparing', 'ideas', 'ready', 'image', 'image-review', 'preview', 'preview-review', 'clip1', 'bridge', 'clip2', 'render', 'completed', 'attention'].includes(job.status)
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
    ...(value.onsetSeconds === undefined ? {} : { onsetSeconds: [...value.onsetSeconds] }),
    ...(value.rhythm === undefined ? {} : { rhythm: structuredClone(value.rhythm) }) };
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
  function reuseEligible(job: DanceSavedJob) {
    if (!job.inFlight) return ['ideas', 'ready', 'image-review', 'preview-review', 'completed', 'attention'].includes(job.status);
    // An abandoned planning request may have spent money, so leave its lease and
    // job untouched. Only fork its verified audio into a separate, unstarted job.
    if (!['preparing', 'attention'].includes(job.status) || !['prepare', 'select-idea'].includes(job.inFlight.action)
      || !Number.isFinite(Date.parse(job.inFlight.at)) || !expired(job) || !isDanceAudioSelection(job)) return false;
    return !job.plan && !job.imageSourceUrl && !job.imageUrl && !job.previewRequestId && !job.previewSourceUrl
      && !job.previewClipUrl && !job.previewUrl && !job.clip1RequestId && !job.clip1SourceUrl && !job.clip1Url
      && !job.bridgeUrl && !job.clip2RequestId && !job.clip2SourceUrl && !job.clip2Url && !job.videoUrl;
  }
  function resumeStage(job: DanceSavedJob): DanceVideoJob['failedStage'] | null {
    if (job.failureCode === 'PROVIDER_FAILED') return null;
    const stage = job.failedStage || (expired(job) ? job.status : null);
    if (stage === 'image' && job.imageSourceUrl) return 'image';
    if (stage === 'preview' && (job.previewRequestId || job.previewSourceUrl || job.previewClipUrl)) return 'preview';
    if (stage === 'clip1' && (job.clip1RequestId || job.clip1SourceUrl)) return 'clip1';
    if (stage === 'bridge' && job.clip1Url) return 'bridge';
    if (stage === 'clip2' && (job.clip2RequestId || job.clip2SourceUrl)) return 'clip2';
    if (stage === 'render' && job.clip1Url && job.clip2Url) return 'render';
    return null;
  }
  function view(job: DanceSavedJob | null): DanceVideoJob | null {
    if (!job) return null;
    const result = structuredClone(job);
    const recoverableStage = resumeStage(result);
    result.canReuseAudio = reuseEligible(job) && isDanceAudioSelection(job);
    if (expired(result)) {
      result.status = 'attention';
      result.error = '이전 요청의 완료 여부를 확인해야 합니다. 중복 생성을 막기 위해 저장된 작업을 보류했습니다.';
    }
    result.canResume = result.status === 'attention' && (!result.inFlight || expired(result)) && Boolean(recoverableStage);
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
    if (!reuseEligible(job)) {
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
    if (!currentJob || currentJob.id !== jobId || !reuseEligible(currentJob)
      || JSON.stringify(audioSelection(currentJob)) !== JSON.stringify(selection)) {
      throw new DanceVideoError('원본 작업이 바뀌었습니다. 저장된 음원을 다시 확인해 주세요.', 'REUSE_CONFLICT', 409);
    }
    const priorVariant = source.metadata.danceVariant as Record<string, unknown> | undefined;
    const rootTrackId = priorVariant && typeof priorVariant.rootTrackId === 'string' && UUID.test(priorVariant.rootTrackId) ? priorVariant.rootTrackId : source.id;
    const originalMusicTitle = (typeof source.metadata.originalMusicTitle === 'string' ? source.metadata.originalMusicTitle : source.title)
      .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
    const musicSpec = getDanceMusicSpec(source.metadata);
    if (!musicSpec) throw new DanceVideoError('원본 댄스 음악 설정을 확인하지 못했습니다.', 'MUSIC_SPEC', 409);
    const metadata = { workflow: DANCE_WORKFLOW, presetId: DANCE_CATEGORY_ID, presetName: musicSpec.label,
      sourceMenu: 'dance', isPublic: current.isPublic, isInstrumental: musicSpec.instrumental, instrumental: musicSpec.instrumental,
      danceMusic: musicSpec, danceVocalPreference: source.metadata.danceVocalPreference,
      duration: selection.sourceDurationSeconds,
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
    const finished = await finish(userId, { ...saved, status: 'attention', error: safeFailure(error),
      failureCode: error instanceof DanceVideoError && /^[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : 'STAGE_FAILURE',
      ...(['image', 'preview', 'clip1', 'bridge', 'clip2', 'render'].includes(saved.status) ? { failedStage: saved.status as DanceSavedJob['failedStage'] } : {}),
      ...(error instanceof DanceVideoError && error.planFailure ? { planFailure: error.planFailure } : {}) }, token);
    return view(finished)! as DanceSavedJob;
  }
  async function prepare(userId: string, trackId: string, startSeconds: unknown, visualBrief: unknown, creativePreferences?: unknown) {
    const startedAt = now();
    if (typeof startSeconds !== 'number' || !Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds > 3600) throw new DanceVideoError('올바른 30초 구간의 시작 시간을 선택해 주세요.', 'AUDIO_RANGE');
    if (typeof visualBrief !== 'string' || visualBrief.trim().length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(visualBrief)) throw new DanceVideoError('상황 설정은 1,000자 이내의 텍스트로 입력해 주세요. 비워 두면 AI가 기획합니다.', 'VISUAL_BRIEF');
    const normalizedBrief = visualBrief.trim();
    let preferences;
    try { preferences = validateDanceCreativePreferences(creativePreferences); }
    catch { throw new DanceVideoError('출연자·장소·안무 선택을 확인해 주세요.', 'CREATIVE_SELECTION'); }
    const record = await owned(userId, trackId);
    const savedSelection = record.metadata.danceAudioSelection === undefined ? null : audioSelection(record.metadata.danceAudioSelection);
    if (savedSelection && startSeconds !== savedSelection.startSeconds) {
      throw new DanceVideoError('재사용 음원은 저장된 30초 구간을 그대로 사용합니다.', 'AUDIO_SELECTION_LOCKED', 409);
    }
    const previous = readDanceVideoJob(record);
    if (previous) {
      if (previous.startSeconds === startSeconds && previous.visualBrief === normalizedBrief
        && JSON.stringify(validateDanceCreativePreferences(previous.creativePreferences)) === JSON.stringify(preferences)) return view(previous)!;
      const unspentPreparation = previous.status === 'attention' && !previous.planningSubmitted && !previous.imageSourceUrl;
      if ((!['ideas', 'ready'].includes(previous.status) && !unspentPreparation) || previous.inFlight) throw new DanceVideoError('이미 시작된 작업의 음원을 바꿀 수 없습니다. 저장된 작업을 확인해 주세요.', 'JOB_EXISTS', 409);
    }
    const reusableSelection = savedSelection || (previous?.startSeconds === startSeconds && isDanceAudioSelection(previous) ? audioSelection(previous) : null);
    const token = randomUUID();
    const id = randomUUID();
    const musicSpec = getDanceMusicSpec(record.metadata);
    if (!musicSpec) throw new DanceVideoError('저장된 댄스 음악 설정을 확인하지 못했습니다.', 'MUSIC_SPEC', 409);
    const recent = await deps.store.recentDirections?.(userId) || [];
    let direction;
    try { direction = resolveDanceCreativeDirection(preferences, id, normalizedBrief, recent, musicSpec); }
    catch { throw new DanceVideoError('선택한 출연자·장소와 상황 설명이 맞는지 확인해 주세요.', 'CREATIVE_SELECTION'); }
    let job: DanceSavedJob = { id, trackId, status: 'preparing', startSeconds, durationSeconds: 30,
      creativePreferences: preferences, direction, musicSpec, imageReviewRequired: true,
      ideaReviewRequired: Boolean(deps.ideas),
      qualityPreviewRequired: Boolean(deps.ideas && deps.preview),
      videoSpec: { model: deps.videoModel || 'grok-imagine-video', resolution: '720p', width: 720, height: 1280 },
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
      if (deps.ideas) {
        const ideas = validateDanceIdeas(await deps.ideas(job, { timeoutMs }), job.direction?.cast);
        return finish(userId, { ...job, ideas, status: 'ideas' }, token);
      }
      const plan = await deps.plan(job, { timeoutMs });
      if (plan.clips.length !== 2 || plan.clips.some(prompt => !prompt.trim() || Buffer.byteLength(prompt, 'utf8') > 4096)
        || Buffer.byteLength(plan.imagePrompt, 'utf8') > 4096) throw new DanceVideoError('두 개의 15초 영상 계획과 프롬프트 길이를 확인하지 못했습니다.', 'PLAN_INVALID');
      return finish(userId, { ...job, plan, status: 'ready' }, token);
    } catch (error) { return hold(userId, job, token, error); }
  }
  async function transition(userId: string, trackId: string, jobId: string, action: 'start' | 'advance') {
    assertDanceUuid(jobId);
    const record = await owned(userId, trackId);
    let job = readDanceVideoJob(record);
    if (!job || job.id !== jobId) throw new DanceVideoError('저장된 작업 ID가 일치하지 않습니다.', 'JOB_NOT_FOUND', 404);
    if (expired(job)) {
      const stale = { ...job, status: 'attention' as const,
        ...(['image', 'preview', 'clip1', 'bridge', 'clip2', 'render'].includes(job.status) ? { failedStage: job.status as DanceSavedJob['failedStage'] } : {}),
        error: '이전 요청의 완료 여부를 확인해야 합니다. 저장된 요청 ID를 보존하고 자동 재생성을 중단했습니다.', updatedAt: timestamp() };
      return view(readDanceVideoJob(await deps.store.compareAndSwap(record, stale) || await owned(userId, trackId)));
    }
    if (job.inFlight || job.status === 'completed' || job.status === 'attention') return view(job);
    if (action === 'start') {
      if (job.status !== 'ready') return view(job);
      if (!job.plan || !job.audioUrl) throw new DanceVideoError('선택 음원과 영상 계획을 먼저 준비해 주세요.', 'NOT_READY', 409);
      if (job.ideaReviewRequired && (!job.selectedIdea || !validateDanceIdeas(job.ideas).some(idea => idea.id === job!.selectedIdea!.id))) throw new DanceVideoError('아이디어를 선택하고 안무 기획을 먼저 확인해 주세요.', 'IDEA_SELECTION', 409);
      const started = await deps.store.compareAndSwap(record, { ...job, imageReviewRequired: true, status: 'image', updatedAt: timestamp() });
      return readDanceVideoJob(started || await owned(userId, trackId));
    }
    if (job.status === 'ideas' || job.status === 'ready' || job.status === 'preparing' || job.status === 'image-review' || job.status === 'preview-review') return view(job);
    if (!job.plan || !job.audioUrl) throw new DanceVideoError('저장된 음원 또는 영상 계획이 없습니다.', 'NOT_READY', 409);
    // Bound polling even if a browser accidentally dispatches duplicate advances.
    const isPoll = (job.status === 'preview' && job.previewRequestId) || (job.status === 'clip1' && job.clip1RequestId) || (job.status === 'clip2' && job.clip2RequestId);
    if (isPoll && job.lastPollAt && now() - Date.parse(job.lastPollAt) < 4000) return view(job);
    const token = randomUUID();
    job = { ...job, inFlight: { action: isPoll ? `${job.status}-poll` : job.status, token, at: timestamp() }, updatedAt: timestamp() };
    const reserved = await deps.store.compareAndSwap(record, job);
    if (!reserved) return get(userId, trackId);
    try {
      if (job.status === 'image') {
        const result = job.imageSourceUrl ? { url: job.imageSourceUrl } : await deps.generateImage(job.plan!.imagePrompt);
        if (!job.imageSourceUrl) job = await checkpoint(userId, { ...job, imageSourceUrl: result.url }, token);
        const imageUrl = await deps.copyAsset(job, 'image', result.url, 'first-frame');
        return finish(userId, { ...job, imageUrl, status: job.imageReviewRequired ? 'image-review' : 'clip1' }, token);
      }
      if (job.status === 'preview') {
        if (!deps.preview || !job.imageUrl) throw new DanceVideoError('동작 테스트 준비가 필요합니다.', 'NOT_READY', 409);
        if (!job.previewRequestId && !job.previewSourceUrl && !job.previewClipUrl) {
          const prompt = buildDancePreviewPrompt(job);
          const result = await deps.startVideo(prompt, 5, job.imageUrl, { resolution: job.videoSpec?.resolution || '480p', model: job.videoSpec?.model,
            ...(job.videoSpec?.model === 'grok-imagine-video-1.5' ? { referenceImageUrl: job.imageUrl } : {}), generateAudio: false });
          if (!/^[a-zA-Z0-9_-]{1,150}$/.test(result.requestId)) throw new DanceVideoError('테스트 영상 제출 결과가 불확실합니다. 자동 재요청하지 않습니다.', 'UNKNOWN_SUBMISSION');
          return finish(userId, { ...job, previewRequestId: result.requestId, previewSeconds: 5 }, token);
        }
        if (!job.previewSourceUrl && !job.previewClipUrl) {
          const result = await deps.pollVideo(job.previewRequestId!);
          job = { ...job, lastPollAt: timestamp() };
          if (result.status === 'pending') return finish(userId, job, token);
          if (result.status !== 'done' || !result.url) throw new DanceVideoError('테스트 영상이 완료되지 않았습니다. 음원과 기획은 보존했습니다.', 'PROVIDER_FAILED');
          job = await checkpoint(userId, { ...job, previewSourceUrl: result.url }, token);
        }
        if (!job.previewClipUrl) job = await checkpoint(userId, { ...job, previewClipUrl: await deps.copyAsset(job, 'video', job.previewSourceUrl!, 'preview-native') }, token);
        return finish(userId, { ...job, previewUrl: await deps.preview(job), previewSeconds: 5, status: 'preview-review' }, token);
      }
      if (job.status === 'clip1' || job.status === 'clip2') {
        const second = job.status === 'clip2';
        const requestId = second ? job.clip2RequestId : job.clip1RequestId;
        const storedSource = second ? job.clip2SourceUrl : job.clip1SourceUrl;
        if (storedSource) {
          const url = await deps.copyAsset(job, 'video', storedSource, second ? 'clip2' : 'clip1');
          return finish(userId, { ...job, ...(second ? { clip2Url: url, status: 'render' } : { clip1Url: url, status: 'bridge' }) }, token);
        }
        if (!requestId) {
          const keyframe = second ? job.bridgeUrl : job.imageUrl;
          if (!keyframe) throw new DanceVideoError('클립 시작 프레임을 확인하지 못했습니다.', 'MISSING_IMAGE');
          const result = await deps.startVideo(buildDancePacedClipPrompt(job, job.plan!.clips[second ? 1 : 0]), 15, keyframe, { resolution: job.videoSpec?.resolution || '480p', model: job.videoSpec?.model,
            ...(job.videoSpec?.model === 'grok-imagine-video-1.5' && job.imageUrl ? { referenceImageUrl: job.imageUrl } : {}), generateAudio: false });
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
  async function approveFrame(userId: string, trackId: string, jobId: string) {
    assertDanceUuid(jobId);
    const record = await owned(userId, trackId), job = readDanceVideoJob(record);
    if (!job || job.id !== jobId) throw new DanceVideoError('저장된 작업 ID가 일치하지 않습니다.', 'JOB_NOT_FOUND', 404);
    if (job.inFlight || job.status !== 'image-review') return view(job);
    if (!job.imageUrl || !job.plan || !job.audioUrl) throw new DanceVideoError('확인할 첫 장면이 준비되지 않았습니다.', 'NOT_READY', 409);
    const saved = await deps.store.compareAndSwap(record, { ...job, status: job.qualityPreviewRequired ? 'preview' : 'clip1', imageApprovedAt: timestamp(), updatedAt: timestamp() });
    return view(readDanceVideoJob(saved || await owned(userId, trackId)));
  }
  async function approvePreview(userId: string, trackId: string, jobId: string) {
    assertDanceUuid(jobId);
    const record = await owned(userId, trackId), job = readDanceVideoJob(record);
    if (!job || job.id !== jobId) throw new DanceVideoError('저장된 작업 ID가 일치하지 않습니다.', 'JOB_NOT_FOUND', 404);
    if (job.inFlight || job.status !== 'preview-review') return view(job);
    if (!job.previewUrl || job.previewSeconds !== 5 || !job.imageUrl || !job.plan) throw new DanceVideoError('완료된 동작 테스트를 먼저 확인해 주세요.', 'NOT_READY', 409);
    const saved = await deps.store.compareAndSwap(record, { ...job, status: 'clip1', previewApprovedAt: timestamp(), updatedAt: timestamp() });
    return view(readDanceVideoJob(saved || await owned(userId, trackId)));
  }
  async function selectIdea(userId: string, trackId: string, jobId: string, ideaId: unknown) {
    assertDanceUuid(jobId);
    if (typeof ideaId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(ideaId)) throw new DanceVideoError('목록에서 아이디어를 선택해 주세요.', 'IDEA_SELECTION');
    const record = await owned(userId, trackId), previous = readDanceVideoJob(record);
    if (!previous || previous.id !== jobId) throw new DanceVideoError('저장된 작업 ID가 일치하지 않습니다.', 'JOB_NOT_FOUND', 404);
    if (previous.inFlight || !['ideas', 'attention'].includes(previous.status)) return view(previous);
    if (previous.plan || previous.imageUrl || previous.imageSourceUrl || previous.clip1RequestId || previous.clip2RequestId) return view(previous);
    const ideas = validateDanceIdeas(previous.ideas, previous.direction?.cast), selectedIdea = ideas.find(idea => idea.id === ideaId);
    if (!selectedIdea || !previous.audioUrl || !previous.audioHash) throw new DanceVideoError('현재 작업의 저장된 아이디어를 선택해 주세요.', 'IDEA_SELECTION', 409);
    if ((previous.conceptPlanAttempts || 0) >= 2) throw new DanceVideoError('같은 아이디어의 기획 재시도 한도에 도달했습니다. 음원을 유지하고 새 챌린지를 준비해 주세요.', 'IDEA_ATTEMPTS', 409);
    const token = randomUUID();
    const next: DanceSavedJob = { ...previous, selectedIdea, status: 'preparing', planningSubmitted: true,
      conceptPlanAttempts: (previous.conceptPlanAttempts || 0) + 1, updatedAt: timestamp(), inFlight: { action: 'select-idea', token, at: timestamp() } };
    delete next.error; delete next.planFailure; delete next.failureCode; delete next.failedStage; delete next.canResume;
    const reserved = await deps.store.compareAndSwap(record, next);
    if (!reserved) return get(userId, trackId);
    try {
      const plan = await deps.plan(next, { timeoutMs: DANCE_PLAN_TIMEOUT_MS });
      if (plan.clips.length !== 2 || plan.clips.some(prompt => !prompt.trim() || Buffer.byteLength(prompt, 'utf8') > 4096)
        || Buffer.byteLength(plan.imagePrompt, 'utf8') > 4096) throw new DanceVideoError('선택한 아이디어의 두 클립 계획과 프롬프트 길이를 확인해 주세요.', 'PLAN_INVALID');
      return finish(userId, { ...next, plan, status: 'ready' }, token);
    } catch (error) { return hold(userId, next, token, error); }
  }
  async function resume(userId: string, trackId: string, jobId: string) {
    assertDanceUuid(jobId);
    const record = await owned(userId, trackId), job = readDanceVideoJob(record);
    if (!job || job.id !== jobId) throw new DanceVideoError('저장된 작업 ID가 일치하지 않습니다.', 'JOB_NOT_FOUND', 404);
    if (job.inFlight && !expired(job)) return view(job);
    if (job.status !== 'attention' && !expired(job)) return view(job);
    const stage = resumeStage(job);
    if (!stage) throw new DanceVideoError('제출 결과가 불확실해 같은 유료 요청을 다시 보내지 않습니다. 저장된 음원으로 새 챌린지를 만들 수 있습니다.', 'RESUME_UNSAFE', 409);
    const next = { ...job, status: stage, updatedAt: timestamp() }; delete next.inFlight; delete next.error; delete next.failedStage; delete next.failureCode; delete next.canResume;
    const saved = await deps.store.compareAndSwap(record, next);
    return view(readDanceVideoJob(saved || await owned(userId, trackId)));
  }
  return { get, reuse, prepare, selectIdea, approveFrame, approvePreview, resume, start: (user: string, track: string, job: string) => transition(user, track, job, 'start'), advance: (user: string, track: string, job: string) => transition(user, track, job, 'advance') };
}

export function buildDancePreviewPrompt(job: DanceVideoJob): string {
  if (!job.plan || !job.selectedIdea) throw new DanceVideoError('확인된 아이디어와 안무가 필요합니다.', 'NOT_READY', 409);
  const idea = job.selectedIdea;
  const cast = job.plan.cast || idea.cast || job.direction?.cast;
  const cadence = buildDanceCadenceGuide(job.musicSpec?.bpm || job.bpm, 5, cast);
  if (job.plan.previewPrompt !== undefined) {
    const scene = validateDancePreviewScene(job.plan.previewPrompt);
    let motion = idea.signatureMove;
    if (cast) {
      const steps = job.plan.choreography?.steps;
      if (!Array.isArray(steps) || steps.length < 2 || steps.length > 4 || steps.some(step => !step || typeof step !== 'object' || !Number.isInteger(step.count) || step.count < 1 || step.count > 7)
        || steps.reduce((sum, step) => sum + step.count, 0) !== 8) throw new DanceVideoError('테스트 영상에는 확인된 8카운트 출연자 동작이 필요합니다.', 'PLAN_INVALID');
      const validated = steps.map((step, stepIndex) => ({ count: step.count, actors: validateDanceActorActions(step.actors, cast, Math.max(8, Math.floor(48 / cast.count)), { stepIndex }) }));
      validateDanceActorSequence(validated, cast);
      motion = validated.map(step => `${step.count}counts:${step.actors.map(actor => `${actor.memberId}:${actor.action}`).join(',')}`).join('; ');
    }
    const prompt = `Five-second experimental motion test. ${scene}\n${cadence}\n${cast ? compactDanceCastPrompt(cast) : `Same original cast: ${job.plan.identity}.`} Preserve identities, setting, premise props and readable whole bodies from the action still. Start its physical conflict at0s; show the first causal response by5s, no camera-facing lineup or separate intro. Species-native role actions: ${motion}. Keep body movement and foot/weight contact readable. The later payoff/restart is outside this test. No cuts, acrobatics, text, logos, speech or generated music. Silent visual; original audio is combined separately; no verified synchronization claim.`;
    if (Buffer.byteLength(prompt, 'utf8') > 4096) throw new DanceVideoError('테스트 영상 프롬프트가 UTF-8 기준 4,096바이트를 넘었습니다.', 'PLAN_LENGTH', 422);
    return prompt;
  }
  const motion = idea.signatureActors ? idea.signatureActors.map(step => `${step.count}counts:${step.actors.map(actor => `${actor.memberId}:${actor.action}`).join(',')}`).join('; ')
    : idea.signatureMove;
  const story = idea.hookStory;
  const prompt = `${cadence}\nFive-second experimental motion test. ${cast ? compactDanceCastPrompt(cast) : `Same original cast: ${job.plan.identity}.`} Preserve appearance, formation, setting/style from this image. Stable vertical9:16 whole bodies and contact. Start the repeatable eight-count hook immediately at0s, with no separate intro; the opening mechanism is in that same moving hook: ${idea.firstTwoSeconds}. ${cast ? 'Species-native role actions' : 'Grounded alternating steps, knee flexion and pelvis/torso weight transfer'}: ${motion}. ${story ? `Test the first physical development: ${story.development}. The later payoff/restart is outside this test; five seconds cannot validate the complete story.` : `Planned payoff: ${idea.visualPayoff}.`} Musical intention: ${job.musicSpec?.rhythmPurpose || ''}; no verified audio synchronization claim. Keep actual body movement, no gesture-only substitute. No cuts, acrobatics, text, logos, speech or generated music. Silent visual; original audio is combined separately.`;
  if (Buffer.byteLength(prompt, 'utf8') > 4096) throw new DanceVideoError('테스트 영상 프롬프트가 UTF-8 기준 4,096바이트를 넘었습니다.', 'PLAN_LENGTH', 422);
  return prompt;
}

/** Enforce the current cadence even when reopening an already approved stored plan. */
export function buildDancePacedClipPrompt(job: DanceVideoJob, approvedPrompt: string): string {
  const cast = job.plan?.cast || job.selectedIdea?.cast || job.direction?.cast;
  const cadence = buildDanceCadenceGuide(job.musicSpec?.bpm || job.bpm, 15, cast);
  const prompt = approvedPrompt.includes(cadence) ? approvedPrompt : `${cadence}\nCADENCE OVERRIDE: keep the approved cast, setting and hook, but this real-time rate takes priority over slower descriptive timing or holds below.\n${approvedPrompt}`;
  if (Buffer.byteLength(prompt, 'utf8') > 4096) throw new DanceVideoError('속도 지시를 포함한 영상 프롬프트가 UTF-8 기준 4,096바이트를 넘었습니다.', 'PLAN_LENGTH', 422);
  return prompt;
}
