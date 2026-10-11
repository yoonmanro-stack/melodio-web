import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { getPetProductionShots, hasPetTwoClipProduction, PetEpisode, PetVideoJobView, validatePetEpisode } from '../vle/petEpisode';
import { compileLegacyPetClips } from '../vle/petLegacyTwoClip';
import type { AudioRhythmAnalysis } from './audioRhythm';
import { fallbackPetAudioAlignment, measurePetAudioAlignment, plannedPetAudioAlignment, type PetAudioAlignment } from './petAudioAlignment';
import { PET_OBSOLETE_OPENING_IMAGE_POLICY_VERSIONS, PET_QUALITY_POLICY_VERSION } from './petQualityPolicy';
import { PET_CONTENT_REVIEW_POLICY, summarizePetContentReadiness } from './petContentReadiness';
import { DEFAULT_VIRAL_VIDEO_MODEL, LEGACY_VIRAL_VIDEO_MODEL, isViralVideoModel, type ViralVideoModel } from './viralVideoModel';

export type PetAssetStatus = 'empty' | 'submitting' | 'pending' | 'generated' | 'ready' | 'held';
export interface PetAssetQualityReview { status: 'passed' | 'review' | 'advisory'; issues: string[]; [key: string]: unknown }
export interface PetImageQualityRecheck {
  policyVersion: string;
  requestedAt: string;
  previousReview: PetAssetQualityReview;
}
export type PetVideoQualityRecheck = PetImageQualityRecheck;
export const PET_VIDEO_REQUEST_MAX_BYTES = 120_000;
export const PET_VIDEO_POLL_MAX_ATTEMPTS = 120;
export const PET_VIDEO_POLL_MAX_WAIT_MS = 30 * 60_000;
export interface PetVideoRetrieval {
  startedAt: number;
  deadlineAt: number;
  attempts: number;
  totalAttempts: number;
  resumeCount: number;
  lastErrorCode?: string;
}
export interface PetJobState {
  videoModel?: ViralVideoModel;
  audio: { trackId: string; sourceUrl: string; stableUrl?: string; durationSeconds?: number; rhythm?: AudioRhythmAnalysis; alignment?: PetAudioAlignment };
  shots: Array<{ id: string; imageStatus: PetAssetStatus; videoStatus: PetAssetStatus; imageSourceUrl?: string; keyframeUrl?: string; videoSourceUrl?: string; videoUrl?: string; requestId?: string; error?: string; nextPollAt?: number; retrieval?: PetVideoRetrieval; quality?: { image?: PetAssetQualityReview; video?: PetAssetQualityReview }; imageQualityRecheck?: PetImageQualityRecheck; videoQualityRecheck?: PetVideoQualityRecheck }>;
  productionMotionPrompts?: string[];
  contentPolicyVersion?: typeof PET_CONTENT_REVIEW_POLICY;
  contentApproval?: { videoUrl: string; approvedAt: string };
  approvedAt?: string;
  approvedMotionPrompts?: string[];
  lease?: { token: string; until: number; operation: string; shotIndex?: number };
  message: string;
  videoUrl?: string;
  durationSeconds?: number;
  failedOperation?: string;
  failedShotIndex?: number;
  failureCode?: string;
  productionMode?: 'legacy-six-clips' | 'two-clips';
}
export interface PetJobRecord {
  id: string; user_id: string; episode: PetEpisode; state: PetJobState;
  status: PetVideoJobView['status']; revision: number; created_at: string; updated_at: string;
}
export interface PetJobStore {
  get(userId: string, jobId: string): Promise<PetJobRecord | null>;
  findEpisode(userId: string, episodeId: string): Promise<PetJobRecord | null>;
  insert(job: PetJobRecord): Promise<PetJobRecord>;
  compareAndSwap(job: PetJobRecord, expectedRevision: number): Promise<PetJobRecord | null>;
  ownedAudio(userId: string, trackId: string, episode: PetEpisode): Promise<{ sourceUrl: string; episode: PetEpisode }>;
}
export interface PetPipelineDependencies {
  store: PetJobStore;
  now?: () => number;
  snapshotAudio(job: PetJobRecord): Promise<{ url: string; durationSeconds: number; rhythm?: AudioRhythmAnalysis }>;
  generateImage(prompt: string, masterUrl?: string): Promise<{ url: string }>;
  startVideo(prompt: string, duration: number, keyframeUrl: string, model: ViralVideoModel): Promise<{ requestId: string }>;
  pollVideo(requestId: string): Promise<{ status: 'pending' | 'done' | 'failed' | 'expired'; url?: string }>;
  copyAsset(job: PetJobRecord, shotIndex: number, kind: 'image' | 'video', url: string): Promise<string>;
  extractBridgeFrame?(job: PetJobRecord, shotIndex: number): Promise<{ url: string }>;
  reviewAsset?(job: PetJobRecord, shotIndex: number, kind: 'image' | 'video'): Promise<PetAssetQualityReview>;
  render(job: PetJobRecord): Promise<{ url: string; durationSeconds: number }>;
}
export class PetPipelineError extends Error {
  constructor(message: string, public code = 'PET_ERROR', public status = 400, public providerHttpStatus?: number) { super(message); }
}
/** Provider GET failures may be retried; invalid results/configuration cannot heal by polling. */
export function classifyPetPollFailure(error: unknown): 'permanent' | 'transient' {
  if (!(error instanceof PetPipelineError)) return 'transient';
  if (error.code === 'PROVIDER_HTTP') {
    // Preserve compatibility with the older provider adapter's sanitized HTTP message.
    const status = error.providerHttpStatus ?? Number(/\bHTTP (\d{3})\b/.exec(error.message)?.[1]);
    return Number.isFinite(status) && status >= 400 && status < 500 && ![408, 425, 429].includes(status) ? 'permanent' : 'transient';
  }
  return ['REQUEST_ID', 'PROVIDER_CONFIG', 'PROVIDER_PROMPT_LENGTH', 'PROVIDER_RESPONSE', 'PROVIDER_STATUS',
    'MEDIA_URL', 'MEDIA_HOST', 'MEDIA_TYPE', 'MEDIA_SIZE', 'MEDIA_EMPTY', 'MEDIA_REDIRECT'].includes(error.code) ? 'permanent' : 'transient';
}
export function assertPetUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new PetPipelineError('작업 또는 음원 ID가 올바르지 않습니다.');
}
function validateMotionPrompts(value: unknown, jobId: string): string[] {
  if (!Array.isArray(value) || value.length !== 6) throw new PetPipelineError('장면별 모션 프롬프트 여섯 개가 필요합니다.', 'MOTION_PROMPTS');
  const prompts = Array.from(value);
  if (prompts.some(prompt => typeof prompt !== 'string' || !prompt.trim() || prompt.length > 5000 || /data:|base64/i.test(prompt))) {
    throw new PetPipelineError('모션 프롬프트는 장면마다 1~5,000자의 텍스트여야 하며 인코딩된 미디어를 포함할 수 없습니다.', 'MOTION_PROMPTS');
  }
  if (Buffer.byteLength(JSON.stringify({ action: 'approve', jobId, motionPrompts: prompts }), 'utf8') > PET_VIDEO_REQUEST_MAX_BYTES) {
    throw new PetPipelineError('모션 프롬프트 요청 본문이 너무 큽니다.', 'MOTION_PROMPTS');
  }
  return prompts as string[];
}
function validateQualityReview(value: unknown): PetAssetQualityReview {
  if (!value || typeof value !== 'object') throw new PetPipelineError('품질 검사 결과를 확인할 수 없습니다.', 'QUALITY_RESPONSE', 503);
  const review = value as PetAssetQualityReview;
  if (!['passed', 'review', 'advisory'].includes(review.status) || !Array.isArray(review.issues) || review.issues.length > 20
    || review.issues.some(issue => typeof issue !== 'string' || issue.length > 500)) {
    throw new PetPipelineError('품질 검사 결과 형식이 올바르지 않습니다.', 'QUALITY_RESPONSE', 503);
  }
  if (review.status === 'advisory' && (review.decision !== 'advisory'
    || !['complete', 'not_applicable', 'unavailable'].includes(String(review.analysisStatus))
    || typeof review.policyVersion !== 'string' || !review.policyVersion.trim())) {
    throw new PetPipelineError('참고 분석 상태를 확인할 수 없습니다.', 'QUALITY_RESPONSE', 503);
  }
  const serialized = JSON.stringify(review);
  if (serialized.length > 20_000 || /data:|base64/i.test(serialized)) throw new PetPipelineError('품질 검사 결과가 너무 크거나 미디어 데이터를 포함합니다.', 'QUALITY_RESPONSE', 503);
  return structuredClone(review);
}
// The public pet pilot uses the classic v3 two-clip adapter; held alternate engines keep their protocol.
function hasAdvisoryPetProduction(job: PetJobRecord): boolean {
  return job.episode.version === 'pet-v3' && job.episode.legacyProduction?.mode === 'two-clips' && job.state.productionMode === 'two-clips';
}
/** Unavailable optional analysis is consumed once, never retried as a paid generation. */
function unavailableAnalysis(operation: string, recordedAt: string): PetAssetQualityReview {
  return { status: 'advisory', decision: 'advisory', analysisStatus: 'unavailable', scope: 'not_evaluated',
    issues: [], reason: operation === 'image_review' ? '첫 이미지의 스토리 분석은 수행하지 않습니다.' : '참고 분석을 완료하지 못했습니다. 생성된 영상은 직접 확인해 주세요.',
    policyVersion: PET_QUALITY_POLICY_VERSION, recordedAt };
}
function isTechnicalReviewFailure(error: unknown): boolean {
  return error instanceof PetPipelineError && /^(?:MEDIA_|MISSING_SHOT$|SHOT_DURATION$|AUDIO_DURATION$|DURATION_MISMATCH$|FINAL_|FFMPEG_|DISK_SPACE$)/.test(error.code);
}
/** One explicit policy recheck of a rejected opening image, before any video work has begun. */
function canRecheckObsoleteOpeningImage(job: PetJobRecord): boolean {
  if (job.status !== 'held' || job.state.lease || !hasAdvisoryPetProduction(job)
    || job.state.failedOperation !== 'image_review' || job.state.failedShotIndex !== 0
    || job.state.failureCode !== 'QUALITY_REVIEW' || job.state.shots.length !== 2) return false;
  const first = job.state.shots[0];
  const review = first.quality?.image;
  if (first.imageStatus !== 'ready' || !first.keyframeUrl || first.imageQualityRecheck !== undefined || review?.status !== 'review') return false;
  // Any durable video marker means recovery must follow that existing request, never re-open image approval.
  if (job.state.shots.some(shot => shot.videoStatus !== 'empty' || shot.requestId !== undefined
    || shot.videoSourceUrl !== undefined || shot.videoUrl !== undefined || shot.nextPollAt !== undefined || shot.quality?.video)) return false;
  if (job.state.shots[1].imageStatus !== 'empty' || job.state.shots[1].keyframeUrl !== undefined || job.state.shots[1].imageSourceUrl !== undefined) return false;
  // Retire only known content gates; an unknown policy is not proof of obsolescence.
  if (review.policyVersion !== undefined && !PET_OBSOLETE_OPENING_IMAGE_POLICY_VERSIONS.some(version => version === review.policyVersion)) return false;
  try { validateQualityReview(review); } catch { return false; }
  return true;
}

/** Explicit retirement of a known C2 content gate, using both saved videos. */
function canRecheckObsoleteC2Video(job: PetJobRecord): boolean {
  if (job.status !== 'held' || job.state.lease || job.episode.version !== 'pet-v3'
    || job.episode.legacyProduction?.mode !== 'two-clips' || job.state.productionMode !== 'two-clips'
    || job.state.failedOperation !== 'video_review' || job.state.failedShotIndex !== 1
    || job.state.failureCode !== 'QUALITY_REVIEW' || job.state.shots.length !== 2
    || !job.state.audio.stableUrl) return false;
  const [first, second] = job.state.shots;
  if (first.id !== 'C1' || second.id !== 'C2' || first.quality?.image?.status !== 'passed'
    || first.quality?.video?.status !== 'passed' || second.videoQualityRecheck !== undefined
    || second.quality?.video?.status !== 'review'
    || !PET_OBSOLETE_OPENING_IMAGE_POLICY_VERSIONS.some(version => version === second.quality!.video!.policyVersion)) return false;
  if (job.state.shots.some(shot => shot.videoStatus !== 'ready' || !shot.videoUrl || !shot.videoSourceUrl
    || !shot.requestId || shot.imageStatus !== 'ready' || !shot.keyframeUrl)) return false;
  try {
    validateQualityReview(first.quality.image);
    validateQualityReview(first.quality.video);
    validateQualityReview(second.quality.video);
  } catch { return false; }
  return true;
}

/** Recover only stages with exact persisted inputs; never retry paid media submissions. */
export function canResumePetJob(job: PetJobRecord): boolean {
  if (job.status !== 'held' || job.state.lease) return false;
  if (canRecheckObsoleteOpeningImage(job)) return true;
  if (canRecheckObsoleteC2Video(job)) return true;
  // Reprocessing cannot fix a wrong-length source, an untrusted URL, or missing media.
  if (['AUDIO_DURATION', 'AUDIO_ENDING_REVIEW', 'SHOT_DURATION', 'DURATION_MISMATCH', 'FINAL_DURATION', 'MISSING_SHOT', 'MEDIA_URL', 'MEDIA_HOST', 'MEDIA_TYPE', 'MEDIA_SIZE', 'FINAL_SIZE', 'BRIDGE_CONFIG', 'REVIEW_CONFIG', 'QUALITY_REVIEW', 'UNKNOWN_SUBMISSION'].includes(job.state.failureCode || '')) return false;
  const shot = job.state.failedShotIndex === undefined ? undefined : job.state.shots[job.state.failedShotIndex];
  switch (job.state.failedOperation) {
    case 'audio': return !!job.state.audio.sourceUrl && !job.state.audio.stableUrl;
    case 'video_poll': return job.state.failureCode === 'PROVIDER_POLL_TIMEOUT'
      && !!shot?.requestId && shot.videoStatus === 'pending' && !shot.videoSourceUrl && !shot.videoUrl;
    case 'image_copy': return !!shot?.imageSourceUrl && shot.imageStatus === 'generated';
    case 'video_copy': return !!shot?.videoSourceUrl && !!shot.requestId && shot.videoStatus === 'generated';
    case 'bridge': return hasPetTwoClipProduction(job.episode) && job.state.shots[0]?.videoStatus === 'ready' && !!job.state.shots[0]?.videoUrl;
    case 'image_review': return hasPetTwoClipProduction(job.episode) && !!shot?.keyframeUrl && !shot.quality?.image;
    case 'video_review': return hasPetTwoClipProduction(job.episode) && !!shot?.videoUrl && !shot.quality?.video;
    case 'render': return !!job.state.audio.stableUrl
      && (hasPetTwoClipProduction(job.episode) ? job.state.shots.length === 2 : !!job.state.approvedAt && job.state.shots.length === 6)
      && job.state.shots.every(s => s.videoStatus === 'ready' && !!s.videoUrl);
    default: return false;
  }
}
export function petJobView(job: PetJobRecord): PetVideoJobView {
  const productionShots = getPetProductionShots(job.episode);
  const productionMode = hasPetTwoClipProduction(job.episode) ? 'two-clips' : 'legacy-six-clips';
  const imageCount = job.state.shots.filter(s => s.imageStatus === 'ready').length;
  const videoCount = job.state.shots.filter(s => s.videoStatus === 'ready').length;
  return {
    id: job.id, episodeId: job.episode.id, status: job.status,
    progress: job.status === 'completed' ? 100 : Math.round(imageCount * 5 + videoCount * 10 + (job.state.audio.stableUrl ? 5 : 0)),
    message: job.state.message,
    shots: job.state.shots.map((s, i) => ({ id: s.id, status: s.videoStatus === 'empty' ? `image_${s.imageStatus}` : `video_${s.videoStatus}`, keyframeUrl: s.keyframeUrl, videoUrl: s.videoUrl, requestId: s.requestId, error: s.error, motionPrompt: job.state.approvedMotionPrompts?.[i] ?? job.state.productionMotionPrompts?.[i] ?? productionShots[i]?.videoPrompt, quality: s.quality })),
    videoUrl: job.state.videoUrl, durationSeconds: job.state.durationSeconds, canResume: canResumePetJob(job),
    productionMode,
    contentReview: summarizePetContentReadiness({ videoUrl: job.state.videoUrl, shots: job.state.shots, planningWarnings: job.episode.planningWarnings, approval: job.state.contentApproval }),
    audioQuality: job.state.audio.rhythm || job.state.audio.alignment ? {
      bpm: job.state.audio.rhythm?.bpm,
      confidence: job.state.audio.rhythm?.confidence,
      method: job.state.audio.rhythm?.method,
      endingStatus: job.state.audio.rhythm?.ending.status,
      endingReasons: job.state.audio.rhythm?.ending.reasons,
      alignment: job.state.audio.alignment,
    } : undefined,
    // Planned list price, not a provider billing receipt.
    estimatedCostUsd: productionMode === 'two-clips'
      ? Number((1 * 0.02 + 30 * 0.05 + 2 * 0.002).toFixed(3))
      : Number((6 * 0.02 + 5 * 0.002 + 30 * 0.05 + 6 * 0.002).toFixed(3)),
  };
}
export function assertPetAudioDuration(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 20 || seconds > 30) throw new PetPipelineError('음원은 실제 길이가 20~30초여야 합니다. 가사를 줄여 다시 녹음·생성해 주세요. 가창을 자르거나 반복하지 않습니다.', 'AUDIO_DURATION');
}
function assertPetV4AudioDuration(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 20 || seconds > 30.15) throw new PetPipelineError('음원은 실제 길이가 20~30초여야 합니다. 30초 인코딩 오차만 허용합니다.', 'AUDIO_DURATION');
}

/** One durable operation per advance. All paid submissions are preceded by CAS + a persisted submission marker. */
export function createPetVideoService(deps: PetPipelineDependencies) {
  const now = deps.now || Date.now;
  const store = deps.store;
  async function load(userId: string, jobId: string) {
    assertPetUuid(jobId);
    const job = await store.get(userId, jobId);
    if (!job) throw new PetPipelineError('작업을 찾을 수 없습니다.', 'NOT_FOUND', 404);
    return job;
  }
  async function save(job: PetJobRecord): Promise<PetJobRecord> {
    const saved = await store.compareAndSwap({ ...job, revision: job.revision + 1, updated_at: new Date(now()).toISOString() }, job.revision);
    if (!saved) throw new PetPipelineError('다른 요청이 진행 중입니다. 저장된 작업을 다시 조회해 주세요.', 'CONFLICT', 409);
    return saved;
  }
  async function finish(job: PetJobRecord) { delete job.state.lease; return save(job); }
  function newRetrieval(previous?: PetVideoRetrieval): PetVideoRetrieval {
    return { startedAt: now(), deadlineAt: now() + PET_VIDEO_POLL_MAX_WAIT_MS, attempts: 0,
      totalAttempts: previous?.totalAttempts ?? 0, resumeCount: previous ? previous.resumeCount + 1 : 0 };
  }
  function holdRetrieval(job: PetJobRecord, shotIndex: number) {
    const shot = job.state.shots[shotIndex];
    shot.error = '저장된 영상 요청의 조회 대기 한도에 도달했습니다. 새 결제 없이 같은 요청을 다시 조회할 수 있습니다.';
    delete shot.nextPollAt;
    job.status = 'held'; job.state.failedOperation = 'video_poll'; job.state.failedShotIndex = shotIndex;
    job.state.failureCode = 'PROVIDER_POLL_TIMEOUT'; job.state.message = `${shot.id}: ${shot.error}`;
  }
  return {
    async create(userId: string, episode: PetEpisode, trackId: string): Promise<PetVideoJobView> {
      assertPetUuid(trackId);
      let issues: string[];
      try { issues = validatePetEpisode(episode); } catch { issues = ['콘티 형식이 올바르지 않습니다.']; }
      if (issues.length) throw new PetPipelineError(issues.join(' '));
      if (JSON.stringify(episode).length > 100_000 || typeof episode.id !== 'string' || episode.id.length > 100) throw new PetPipelineError('콘티 크기가 너무 큽니다.');
      // Never trust a client-supplied adapter, or modify an already-started job.
      episode = structuredClone(episode);
      if (episode.version === 'pet-v3') delete episode.legacyProduction;
      const existing = await store.findEpisode(userId, episode.id);
      if (existing) {
        const original = structuredClone(existing.episode);
        if (original.version === 'pet-v3') delete original.legacyProduction;
        if (existing.state.audio.trackId !== trackId || !isDeepStrictEqual(original, episode)) throw new PetPipelineError('이미 시작한 콘티입니다. 저장된 작업을 이어가거나 새 콘티를 만들어 주세요.', 'EPISODE_ALREADY_STARTED', 409);
        return petJobView(existing);
      }
      const audio = await store.ownedAudio(userId, trackId, episode);
      let canonicalIssues: string[];
      try { canonicalIssues = validatePetEpisode(audio.episode); } catch { canonicalIssues = ['저장된 콘티 형식이 올바르지 않습니다.']; }
      if (canonicalIssues.length || !isDeepStrictEqual(audio.episode, episode)) {
        throw new PetPipelineError('현재 콘티 전체와 일치하는 음원을 선택해 주세요. 입력이나 장면이 바뀌었다면 다시 기획해 주세요.', 'AUDIO_EPISODE_MISMATCH', 409);
      }
      episode = structuredClone(audio.episode);
      if (episode.version === 'pet-v3') {
        try { episode.legacyProduction = { mode: 'two-clips', version: 'legacy-adapter-v1', clips: compileLegacyPetClips(episode) }; }
        catch (error) { throw new PetPipelineError(error instanceof Error ? error.message : '15초 클립 구성에 실패했습니다.', 'CLIP_PLAN', 422); }
      }
      const timestamp = new Date(now()).toISOString();
      const productionShots = getPetProductionShots(episode);
      const productionMode = hasPetTwoClipProduction(episode) ? 'two-clips' : 'legacy-six-clips';
      const job: PetJobRecord = {
        id: randomUUID(), user_id: userId, episode: structuredClone(episode), status: 'draft', revision: 0, created_at: timestamp, updated_at: timestamp,
        state: { videoModel: DEFAULT_VIRAL_VIDEO_MODEL, contentPolicyVersion: PET_CONTENT_REVIEW_POLICY, audio: { trackId, sourceUrl: audio.sourceUrl, ...(episode.version === 'pet-v3' ? { alignment: plannedPetAudioAlignment(episode) } : {}) }, shots: productionShots.map(s => ({ id: s.id, imageStatus: 'empty', videoStatus: 'empty' })), productionMode, message: '승인한 콘티가 저장되었습니다. 음원 길이를 확인합니다.' },
      };
      return petJobView(await store.insert(job));
    },
    async get(userId: string, jobId: string) { return petJobView(await load(userId, jobId)); },
    /** Owner preview acknowledgement only: no renderer, analysis or paid provider operation. */
    async confirm(userId: string, jobId: string, expectedVideoUrl: unknown) {
      const job = await load(userId, jobId);
      if (job.status !== 'completed' || !job.state.videoUrl || job.state.lease) {
        throw new PetPipelineError('완성된 영상을 확인한 후 진행해 주세요.', 'CONTENT_NOT_READY', 409);
      }
      if (typeof expectedVideoUrl !== 'string' || expectedVideoUrl !== job.state.videoUrl) {
        throw new PetPipelineError('영상이 변경되었습니다. 저장된 최신 영상을 확인해 주세요.', 'CONTENT_CHANGED', 409);
      }
      if (job.state.contentApproval?.videoUrl === job.state.videoUrl
        && Number.isFinite(Date.parse(job.state.contentApproval.approvedAt))) return petJobView(job);
      job.state.contentApproval = { videoUrl: job.state.videoUrl, approvedAt: new Date(now()).toISOString() };
      return petJobView(await save(job));
    },
    async resume(userId: string, jobId: string) {
      const job = await load(userId, jobId);
      if (job.status !== 'held') return petJobView(job);
      if (!canResumePetJob(job)) throw new PetPipelineError('저장된 결과로 복구할 수 없는 단계입니다. 유료 생성 상태 또는 원본을 확인해 주세요.', 'RECOVERY_NOT_SAFE', 409);
      const operation = job.state.failedOperation;
      const shot = job.state.failedShotIndex === undefined ? undefined : job.state.shots[job.state.failedShotIndex];
      const obsoleteImageRecheck = canRecheckObsoleteOpeningImage(job);
      const obsoleteVideoRecheck = canRecheckObsoleteC2Video(job);
      if (obsoleteImageRecheck && shot?.quality?.image) {
        // Keep one bounded evidence snapshot; the saved Grok image and all media remain untouched.
        shot.imageQualityRecheck = {
          policyVersion: PET_QUALITY_POLICY_VERSION,
          requestedAt: new Date(now()).toISOString(),
          previousReview: validateQualityReview(shot.quality.image),
        };
        delete shot.quality.image;
      }
      if (obsoleteVideoRecheck && shot?.quality?.video) {
        shot.videoQualityRecheck = {
          policyVersion: PET_QUALITY_POLICY_VERSION,
          requestedAt: new Date(now()).toISOString(),
          previousReview: validateQualityReview(shot.quality.video),
        };
        delete shot.quality.video;
      }
      if (operation === 'video_poll' && shot) {
        shot.retrieval = newRetrieval(shot.retrieval);
        delete shot.nextPollAt;
      }
      if (shot) delete shot.error;
      delete job.state.failedOperation; delete job.state.failedShotIndex; delete job.state.failureCode;
      job.status = operation === 'render' ? 'assembling' : hasPetTwoClipProduction(job.episode) ? 'generating' : operation === 'video_copy' ? 'generating' : 'keyframes';
      job.state.message = obsoleteImageRecheck
        ? '세부 검수 중단 조건을 해제했습니다. 저장된 이미지로 영상 제작을 이어갑니다.'
        : obsoleteVideoRecheck
          ? '저장된 C2 영상의 핵심 전달을 참고 분석한 뒤 합성을 이어갑니다.'
        : operation === 'video_poll' ? '저장된 요청 ID로 영상 결과를 다시 조회합니다. 새 영상을 요청하지 않습니다.'
        : '저장된 원본으로 중단된 보관·합성 단계를 다시 진행합니다.';
      // Resume itself makes no provider call. The next advance reuses saved media and follows the remaining stages.
      return petJobView(await finish(job));
    },
    async approve(userId: string, jobId: string, motionPrompts?: unknown) {
      const job = await load(userId, jobId);
      if (hasPetTwoClipProduction(job.episode)) return petJobView(job);
      const reviewedPrompts = motionPrompts === undefined ? undefined : validateMotionPrompts(motionPrompts, jobId);
      if (job.state.approvedAt) return petJobView(job);
      if (job.status !== 'review' || job.state.shots.some(s => s.imageStatus !== 'ready' || !s.keyframeUrl)) throw new PetPipelineError('여섯 장의 기준 이미지를 먼저 확인해 주세요.', 'NOT_READY', 409);
      // Freeze reviewed motion separately; the original story, audio and keyframes remain immutable.
      job.state.approvedMotionPrompts = reviewedPrompts ?? validateMotionPrompts(job.episode.shots.map(s => s.videoPrompt), jobId);
      job.state.approvedAt = new Date(now()).toISOString(); job.status = 'generating';
      job.state.message = '기준 이미지가 승인되었습니다. 장면별 영상을 생성합니다.';
      return petJobView(await save(job));
    },
    async advance(userId: string, jobId: string): Promise<PetVideoJobView> {
      let job = await load(userId, jobId);
      if (['completed', 'failed', 'held', 'review'].includes(job.status)) return petJobView(job);
      if (job.state.lease) {
        if (job.state.lease.until > now()) return petJobView(job);
        // Consume an expired optional analysis once; its lost response cannot justify another billed analysis.
        if (hasAdvisoryPetProduction(job) && ['image_review', 'video_review'].includes(job.state.lease.operation)) {
          const expired = job.state.lease;
          const shot = job.state.shots[expired.shotIndex!];
          const kind = expired.operation === 'image_review' ? 'image' : 'video';
          shot.quality = { ...shot.quality, [kind]: unavailableAnalysis(expired.operation, new Date(now()).toISOString()) };
          delete shot.error;
          job.state.message = `${shot.id}: 참고 분석 응답을 확인하지 못했습니다. 같은 분석을 반복하지 않고 제작을 이어갑니다.`;
          return petJobView(await finish(job));
        }
        // A lost media POST response cannot prove whether the provider billed it. Never resubmit.
        if (['image_submit', 'video_submit', 'image_review', 'video_review'].includes(job.state.lease.operation)) {
          const shot = job.state.shots[job.state.lease.shotIndex!];
          shot.error = '제출 응답을 확인하지 못했습니다. 중복 결제를 막기 위해 보류했습니다. 운영자 확인이 필요합니다.';
          if (job.state.lease.operation === 'image_submit') shot.imageStatus = 'held';
          if (job.state.lease.operation === 'video_submit') shot.videoStatus = 'held';
          job.state.failedOperation = job.state.lease.operation; job.state.failedShotIndex = job.state.lease.shotIndex; job.state.failureCode = 'UNKNOWN_SUBMISSION';
          job.status = 'held'; job.state.message = `${shot.id}: ${shot.error}`;
          return petJobView(await finish(job));
        }
        delete job.state.lease;
      }
      let operation = 'audio';
      let shotIndex = -1;
      const twoClip = hasPetTwoClipProduction(job.episode);
      const productionShots = getPetProductionShots(job.episode);
      if (job.state.audio.stableUrl) {
        if (twoClip) {
          const first = job.state.shots[0];
          const second = job.state.shots[1];
          if (first.imageStatus !== 'ready') { shotIndex = 0; operation = first.imageStatus === 'generated' ? 'image_copy' : 'image_submit'; }
          else if (!first.quality?.image) { shotIndex = 0; operation = 'image_review'; }
          else if (first.videoStatus !== 'ready') {
            shotIndex = 0;
            if (first.nextPollAt && first.nextPollAt > now()) return petJobView(job);
            operation = first.videoStatus === 'generated' ? 'video_copy' : first.requestId ? 'video_poll' : 'video_submit';
          } else if (!first.quality?.video) { shotIndex = 0; operation = 'video_review'; }
          else if (second.imageStatus !== 'ready') { shotIndex = 1; operation = 'bridge'; }
          else if (second.videoStatus !== 'ready') {
            shotIndex = 1;
            if (second.nextPollAt && second.nextPollAt > now()) return petJobView(job);
            operation = second.videoStatus === 'generated' ? 'video_copy' : second.requestId ? 'video_poll' : 'video_submit';
          } else if (!second.quality?.video) { shotIndex = 1; operation = 'video_review'; }
          else operation = 'render';
        } else {
          shotIndex = job.state.shots.findIndex(s => s.imageStatus !== 'ready');
          if (shotIndex >= 0) operation = job.state.shots[shotIndex].imageStatus === 'generated' ? 'image_copy' : 'image_submit';
          else {
            if (!job.state.approvedAt) { job.status = 'review'; job.state.message = '여섯 장의 동물·소품·공간을 확인한 뒤 영상 생성을 승인해 주세요.'; return petJobView(await finish(job)); }
            shotIndex = job.state.shots.findIndex(s => s.videoStatus !== 'ready');
            if (shotIndex < 0) operation = 'render';
            else {
              const shot = job.state.shots[shotIndex];
              if (shot.nextPollAt && shot.nextPollAt > now()) return petJobView(job);
              operation = shot.videoStatus === 'generated' ? 'video_copy' : shot.requestId ? 'video_poll' : 'video_submit';
            }
          }
        }
      }
      const shot = shotIndex >= 0 ? job.state.shots[shotIndex] : undefined;
      if (operation === 'video_poll') {
        shot!.retrieval ??= newRetrieval();
        if (shot!.retrieval.attempts >= PET_VIDEO_POLL_MAX_ATTEMPTS || now() >= shot!.retrieval.deadlineAt) {
          holdRetrieval(job, shotIndex);
          return petJobView(await finish(job));
        }
        // Consume an attempt before GET. A lost response/lease cannot reset this bound.
        shot!.retrieval.attempts += 1; shot!.retrieval.totalAttempts += 1;
      }
      if (operation === 'image_submit') shot!.imageStatus = 'submitting';
      if (operation === 'video_submit') shot!.videoStatus = 'submitting';
      job.state.lease = { token: randomUUID(), until: now() + (operation === 'render' ? 600_000 : 150_000), operation, ...(shotIndex >= 0 ? { shotIndex } : {}) };
      job.status = operation === 'render' ? 'assembling' : twoClip && operation !== 'image_submit' && operation !== 'image_copy' ? 'generating' : job.state.approvedAt ? 'generating' : 'keyframes';
      job = await save(job);
      // References must be taken from the saved record; store adapters can return a deserialized copy.
      const current = shotIndex >= 0 ? job.state.shots[shotIndex] : undefined;
      try {
        if (operation === 'audio') {
          const audio = await deps.snapshotAudio(job);
          if (twoClip) assertPetV4AudioDuration(audio.durationSeconds); else assertPetAudioDuration(audio.durationSeconds);
          job.state.audio.stableUrl = audio.url; job.state.audio.durationSeconds = audio.durationSeconds;
          if (audio.rhythm) job.state.audio.rhythm = structuredClone(audio.rhythm);
          if (hasAdvisoryPetProduction(job)) {
            const unsubmitted = job.state.audio.alignment?.status === 'planned'
              && job.state.shots.every(shot => shot.imageStatus === 'empty' && shot.videoStatus === 'empty'
                && !shot.requestId && !shot.keyframeUrl && !shot.imageSourceUrl && !shot.videoSourceUrl && !shot.videoUrl);
            let alignment = unsubmitted ? measurePetAudioAlignment(job.episode, audio.durationSeconds, audio.rhythm)
              : fallbackPetAudioAlignment(job.episode, audio.durationSeconds, 'saved-motion-prompts-preserved', audio.rhythm?.confidence);
            if (alignment.appliedToMotionPrompts) {
              try {
                const alignedClips = compileLegacyPetClips(job.episode, { actionStartSeconds: alignment.actionStarts.map(action => action.seconds) });
                job.state.productionMotionPrompts = alignedClips.map(clip => clip.videoPrompt);
              } catch {
                // A conservative timing/prompt-limit fallback must never erase story instructions.
                alignment = fallbackPetAudioAlignment(job.episode, audio.durationSeconds, 'motion-timing-or-prompt-limit', audio.rhythm?.confidence);
              }
            }
            job.state.audio.alignment = alignment;
          }
          if (twoClip && audio.rhythm?.ending.status === 'review') {
            job.state.failedOperation = 'audio_review'; job.state.failureCode = 'AUDIO_ENDING_REVIEW'; job.status = 'held';
            job.state.message = '음원 끝에서 소리가 이어진 채 종료될 가능성이 있어 영상 제작을 시작하지 않았습니다. 음원 끝부분을 확인해 주세요.';
          } else {
            job.state.message = `음원 ${audio.durationSeconds.toFixed(1)}초 확인.${twoClip && audio.rhythm?.ending.status === 'uncertain' ? ' 끝부분 판정은 확인이 필요합니다.' : ''} 기준 이미지를 생성합니다.`;
          }
        } else if (operation === 'image_submit') {
          const image = await deps.generateImage(productionShots[shotIndex].keyframePrompt, shotIndex ? job.state.shots[0].keyframeUrl : undefined);
          current!.imageSourceUrl = image.url; current!.imageStatus = 'generated';
          job.state.message = `${current!.id} 기준 이미지가 생성되었습니다. 원본을 보관합니다.`;
        } else if (operation === 'image_copy') {
          current!.keyframeUrl = await deps.copyAsset(job, shotIndex, 'image', current!.imageSourceUrl!); current!.imageStatus = 'ready';
          job.state.message = `${current!.id} 기준 이미지 보관 완료.`;
          if (!twoClip && job.state.shots.every(s => s.imageStatus === 'ready')) { job.status = 'review'; job.state.message = '여섯 장의 동물·소품·공간을 확인한 뒤 영상 생성을 승인해 주세요.'; }
        } else if (operation === 'bridge') {
          if (!deps.extractBridgeFrame) throw new PetPipelineError('두 번째 클립 연결 프레임 추출기가 준비되지 않았습니다.', 'BRIDGE_CONFIG', 503);
          const bridge = await deps.extractBridgeFrame(job, 0);
          current!.keyframeUrl = bridge.url; current!.imageStatus = 'ready';
          job.state.message = `${current!.id} 연결 프레임 보관 완료.`;
        } else if (operation === 'image_review' || operation === 'video_review') {
          if (!deps.reviewAsset) throw new PetPipelineError('생성 결과 품질 검사기가 준비되지 않았습니다.', 'REVIEW_CONFIG', 503);
          const kind = operation === 'image_review' ? 'image' : 'video';
          const review = validateQualityReview(await deps.reviewAsset(job, shotIndex, kind));
          // The pilot never reinstates a legacy content gate returned by an outdated analysis adapter.
          if (hasAdvisoryPetProduction(job) && review.status === 'review') throw new PetPipelineError('이전 검수 형식은 제작 중단 조건으로 사용하지 않습니다.', 'QUALITY_RESPONSE', 503);
          current!.quality = { ...current!.quality, [kind]: review };
          if (review.status === 'review') {
            current!.error = review.issues.join(' ') || '생성 결과를 직접 확인해 주세요.';
            job.state.failedOperation = operation; job.state.failedShotIndex = shotIndex; job.state.failureCode = 'QUALITY_REVIEW';
            job.status = 'held'; job.state.message = `${current!.id}: ${current!.error}`;
          } else {
            delete current!.error;
            job.state.message = review.status === 'advisory'
              ? `${current!.id}: ${kind === 'image' ? '기준 이미지 준비 완료.' : '콘텐츠 핵심 분석 완료. 개선 의견은 참고용입니다.'}`
              : `${current!.id} ${kind === 'image' ? '기준 이미지' : '영상'} 품질 확인 완료.`;
          }
        } else if (operation === 'video_submit') {
          const motionPrompt = job.state.approvedMotionPrompts?.[shotIndex] ?? job.state.productionMotionPrompts?.[shotIndex] ?? productionShots[shotIndex].videoPrompt;
          const model = job.state.videoModel === undefined ? LEGACY_VIRAL_VIDEO_MODEL : job.state.videoModel;
          if (!isViralVideoModel(model)) throw new PetPipelineError('저장된 영상 모델 설정을 확인해 주세요.', 'PROVIDER_CONFIG', 503);
          const result = await deps.startVideo(motionPrompt, productionShots[shotIndex].durationSeconds, current!.keyframeUrl!, model);
          current!.requestId = result.requestId; current!.videoStatus = 'pending'; current!.nextPollAt = now() + 5000;
          current!.retrieval = newRetrieval();
          job.state.message = `${current!.id} 영상 요청을 저장했습니다. 결과를 기다립니다.`;
        } else if (operation === 'video_poll') {
          const result = await deps.pollVideo(current!.requestId!);
          current!.nextPollAt = now() + 5000;
          if (result.status === 'done' && result.url) { current!.videoSourceUrl = result.url; current!.videoStatus = 'generated'; delete current!.nextPollAt; }
          else if (result.status === 'failed' || result.status === 'expired' || result.status === 'done') {
            current!.videoStatus = 'held'; current!.error = result.status === 'expired' ? '공급자 결과가 만료되었습니다. 이 장면은 운영자 확인이 필요합니다.' : '이 장면의 생성이 실패했습니다. 자동으로 다시 결제하지 않습니다.';
            job.state.failedOperation = operation; job.state.failedShotIndex = shotIndex; job.state.failureCode = 'PROVIDER_RESULT';
            job.status = 'held'; job.state.message = `${current!.id}: ${current!.error}`;
          } else if (current!.retrieval!.attempts >= PET_VIDEO_POLL_MAX_ATTEMPTS || now() >= current!.retrieval!.deadlineAt) {
            holdRetrieval(job, shotIndex);
          } else {
            delete current!.retrieval!.lastErrorCode;
            job.state.message = `${current!.id} 영상 생성 중. 저장된 요청 ID로 확인합니다.`;
          }
        } else if (operation === 'video_copy') {
          current!.videoUrl = await deps.copyAsset(job, shotIndex, 'video', current!.videoSourceUrl!); current!.videoStatus = 'ready';
          job.state.message = `${current!.id} 영상 보관 완료.`;
          if (job.state.shots.every(s => s.videoStatus === 'ready')) job.status = 'assembling';
        } else {
          if (job.state.shots.length !== (twoClip ? 2 : 6) || job.state.shots.some(s => s.videoStatus !== 'ready' || !s.videoUrl)) throw new PetPipelineError(twoClip ? '두 클립이 모두 필요합니다.' : '여섯 장면이 모두 필요합니다.', 'MISSING_SHOT');
          const result = await deps.render(job);
          if (Math.abs(result.durationSeconds - 30) > 0.1) throw new PetPipelineError('완성본이 30초가 아닙니다.', 'DURATION_MISMATCH');
          job.state.videoUrl = result.url; job.state.durationSeconds = result.durationSeconds; job.status = 'completed';
          job.state.message = '30초 영상과 음원 합성이 완료되었습니다.';
        }
      } catch (error) {
        const message = error instanceof PetPipelineError ? error.message : '처리를 확인하지 못했습니다. 저장된 결과를 보존하고 중단했습니다.';
        if (hasAdvisoryPetProduction(job) && (operation === 'image_review' || operation === 'video_review') && !isTechnicalReviewFailure(error)) {
          const kind = operation === 'image_review' ? 'image' : 'video';
          current!.quality = { ...current!.quality, [kind]: unavailableAnalysis(operation, new Date(now()).toISOString()) };
          delete current!.error;
          job.state.message = `${current!.id}: 참고 분석을 완료하지 못했습니다. 제작은 계속 진행합니다.`;
        } else if (operation === 'video_poll') {
          current!.retrieval!.lastErrorCode = error instanceof PetPipelineError ? error.code : 'TRANSIENT_IO';
          if (classifyPetPollFailure(error) === 'permanent') {
            current!.videoStatus = 'held'; current!.error = message; delete current!.nextPollAt;
            job.status = 'held'; job.state.failedOperation = operation; job.state.failedShotIndex = shotIndex;
            job.state.failureCode = error instanceof PetPipelineError ? error.code : 'PROVIDER_POLL_PERMANENT';
            job.state.message = `${current!.id}: ${message}`;
          } else if (current!.retrieval!.attempts >= PET_VIDEO_POLL_MAX_ATTEMPTS || now() >= current!.retrieval!.deadlineAt) {
            holdRetrieval(job, shotIndex);
          } else {
            // GET is safe within the persisted bound; preserve the original POST marker and ID.
            current!.nextPollAt = now() + 10_000; job.state.message = '공급자 조회가 지연되었습니다. 같은 요청 ID로 다시 확인합니다.';
          }
        } else {
          job.status = 'held'; job.state.message = (current ? `${current.id}: ` : '') + message;
          job.state.failedOperation = operation; job.state.failedShotIndex = shotIndex >= 0 ? shotIndex : undefined;
          job.state.failureCode = error instanceof PetPipelineError ? error.code : 'TRANSIENT_IO';
          if (current) { current.error = message; if (operation === 'image_submit') current.imageStatus = 'held'; if (operation === 'video_submit') current.videoStatus = 'held'; }
        }
      }
      // Save errors deliberately escape: the durable submission marker prevents a duplicate paid request.
      return petJobView(await finish(job));
    },
  };
}
