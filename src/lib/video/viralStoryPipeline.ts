import { createHash, randomUUID } from 'node:crypto';
import { getCategoryQualityDirection, VIRAL_QUALITY_CATEGORY_IDS } from '../vle/categoryQualityDirection';
import { LEGACY_NO_TEXT_RULE } from './legacyShortExport';
import { normalizeActiveViralCategory, VIRAL_CATEGORY_DISABLED_CODE, VIRAL_CATEGORY_DISABLED_MESSAGE } from '../vle/viralCategoryAvailability';

export const VIRAL_STORY_CATEGORIES = VIRAL_QUALITY_CATEGORY_IDS.filter(id => id !== 'pet');
export const VIRAL_STORY_REQUEST_BYTES = 16 * 1024;
export const VIRAL_STORY_LEASE_MS = 6 * 60 * 1000;
// The 300-second route retains time for owner reads and the final CAS checkpoint.
export const VIRAL_STORY_OPERATION_MS = 240_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID = /^[a-zA-Z0-9_-]{1,150}$/;
const HASH = /^[a-f0-9]{64}$/;
const STAGES = ['audio', 'clip1', 'bridge', 'clip2', 'render', 'completed', 'held'] as const;
export type ViralStoryStage = typeof STAGES[number];
export type ViralStoryOperation = 'audio' | 'clip1_submit' | 'clip1_poll' | 'clip1_copy' | 'bridge' | 'clip2_submit' | 'clip2_poll' | 'clip2_copy' | 'render';
export class ViralStoryError extends Error {
  constructor(message: string, public code = 'VIRAL_STORY', public status = 400) { super(message); }
}
export function assertViralStoryUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ViralStoryError('저장된 음원과 작업 ID가 필요합니다.', 'ID');
}
export interface ViralStoryInput { prompt: string; category: string; allowDance: boolean; cutCadenceSeconds: number }
export interface ViralStoryAsset { url: string; hash: string; durationSeconds: number }
export interface ViralStoryClip {
  status: 'empty' | 'submitting' | 'pending' | 'generated' | 'ready';
  submittedAt?: string; requestId?: string; sourceUrl?: string; asset?: ViralStoryAsset; nextPollAt?: number;
}
export interface ViralStoryJob {
  version: 1; id: string; trackId: string; input: ViralStoryInput; inputFingerprint: string;
  promptVersion?: 2;
  prompts: [string, string]; sourceAudioUrl: string; status: ViralStoryStage;
  audio?: ViralStoryAsset; clips: [ViralStoryClip, ViralStoryClip]; bridge?: { url: string; hash: string };
  final?: ViralStoryAsset; createdAt: string; updatedAt: string;
  lease?: { token: string; until: number; operation: ViralStoryOperation };
  failureCode?: string; failedOperation?: ViralStoryOperation;
}
export interface ViralStoryJobView {
  version: 1; id: string; trackId: string; category: string; inputFingerprint: string;
  promptVersion?: 2;
  prompt: string; allowDance: boolean; cutCadenceSeconds: number;
  status: ViralStoryStage; progress: number; inFlight: boolean; canResume: boolean;
  failureCode?: string; failureMessage?: string; updatedAt: string;
  videoUrl?: string; durationSeconds?: number; clips?: string[]; is30SecFull?: true;
}
export interface ViralStoryOwnedRecord {
  id: string; userId: string; status: string; audioUrl: string | null;
  licenseHash: string | null; metadata: Record<string, unknown>;
}
export interface ViralStoryStore {
  load(userId: string, trackId: string): Promise<ViralStoryOwnedRecord | null>;
  compareAndSwap(previous: ViralStoryOwnedRecord, job: ViralStoryJob): Promise<ViralStoryOwnedRecord | null>;
}
export interface ViralStoryDependencies {
  store: ViralStoryStore; now?: () => number; operationTimeoutMs?: number;
  validateAudioUrl?(url: string): void;
  snapshotAudio(job: ViralStoryJob): Promise<ViralStoryAsset>;
  startVideo(prompt: string, referenceImageUrl?: string): Promise<{ requestId?: string; url?: string }>;
  pollVideo(requestId: string): Promise<{ status: 'pending' | 'done' | 'failed' | 'expired'; url?: string }>;
  archiveClip(job: ViralStoryJob, index: 0 | 1, url: string): Promise<ViralStoryAsset>;
  extractBridge(job: ViralStoryJob): Promise<{ url: string; hash: string }>;
  render(job: ViralStoryJob): Promise<ViralStoryAsset>;
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function mediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
function asset(value: unknown, kind: 'audio' | 'video' | 'final'): value is ViralStoryAsset {
  if (!object(value) || !mediaUrl(value.url) || typeof value.hash !== 'string' || !HASH.test(value.hash) || typeof value.durationSeconds !== 'number' || !Number.isFinite(value.durationSeconds)) return false;
  return kind === 'audio' ? value.durationSeconds > 0 && value.durationSeconds <= 30.15
    : kind === 'video' ? value.durationSeconds >= 15 && value.durationSeconds <= 15.1 : Math.abs(value.durationSeconds - 30) <= 0.05;
}
export function validateViralStoryInput(value: unknown): ViralStoryInput {
  if (!object(value) || typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 2400 || /data:|base64/i.test(value.prompt)
    || typeof value.category !== 'string' || !VIRAL_STORY_CATEGORIES.some(id => id === value.category)
    || typeof value.allowDance !== 'boolean' || typeof value.cutCadenceSeconds !== 'number'
    || !Number.isFinite(value.cutCadenceSeconds) || value.cutCadenceSeconds < 0.5 || value.cutCadenceSeconds > 8) {
    throw new ViralStoryError('영상 연출과 카테고리를 확인해 주세요.', 'INPUT');
  }
  return { prompt: value.prompt.trim(), category: value.category, allowDance: value.allowDance, cutCadenceSeconds: value.cutCadenceSeconds };
}
/** Exact compiler for saved jobs without a promptVersion. Never rewrite their paid inputs. */
function compileViralStoryPromptsV1(input: ViralStoryInput): [string, string] {
  const direction = getCategoryQualityDirection(input.category);
  if (!direction || input.category === 'pet') throw new ViralStoryError('지원하는 스토리 카테고리를 선택해 주세요.', 'INPUT');
  const common = `${direction.cameraRuleEn} ${direction.motionRuleEn} Preserve the authored cast, actions, causal reveal and original visual style. Silent visual output only; no audio track, music, dialogue, narration or sound effects. ${LEGACY_NO_TEXT_RULE}`;
  const continuity = 'Keep exactly the same subject appearance, wardrobe, supporting cast, prop inventory, set, lighting and positions across both clips.';
  const prompts: [string, string] = [
    `${input.prompt}\nPART 1, 0-15s: Begin the immediate visible hook, then develop its physical cause in the same situation. Keep the consequence readable; change camera angle only to reveal story information. ${continuity} ${common}`,
    `${input.prompt}\nPART 2, 15-30s: Continue directly from the supplied final frame of part 1. That frame is the authoritative starting state. Preserve character identity, prop state, positions and eye lines. Advance the same cause into its payoff and resolved reaction; do not restart or repeat the hook, introduce a new cast, or reset the scene. ${continuity} ${common}`,
  ];
  if (prompts.some(prompt => Buffer.byteLength(prompt, 'utf8') > 4096)) throw new ViralStoryError('두 영상의 연출이 Grok 한도를 넘습니다. 기획을 간결하게 수정해 주세요.', 'PROMPT_LENGTH', 422);
  return prompts;
}
/** Fresh jobs bind both final prompts before reserving a job or making any paid call. */
export function compileViralStoryPrompts(input: ViralStoryInput, promptVersion: 1 | 2 = 2): [string, string] {
  if (promptVersion === 1) return compileViralStoryPromptsV1(input);
  if (promptVersion !== 2) throw new ViralStoryError('저장된 영상 연출 버전을 확인해 주세요.', 'PROMPT_VERSION', 409);
  const direction = getCategoryQualityDirection(input.category);
  if (!direction || input.category === 'pet') throw new ViralStoryError('지원하는 스토리 카테고리를 선택해 주세요.', 'INPUT');
  const continuity = 'CONTINUITY: Preserve subject identity, wardrobe, supporting cast, prop inventory, set and lighting. Match positions, prop contact and eye lines at the clip boundary; then let them evolve continuously through motivated authored movement. Do not freeze actors in the starting pose.';
  const movement = input.allowDance
    ? 'MOVEMENT CHOICE: allowDance=true. Authored rhythmic movement and dance-like gestures are allowed. Each actor, including supporting actors, must perform their own authored action and payoff; do not replace them with a generic reaction or category-default gesture.'
    : 'MOVEMENT CHOICE: allowDance=false. Do not add dancing or choreography. Perform each actor\'s authored situational action and payoff with continuous motivated movement.';
  const cadence = `EDITING PREFERENCE: nominal ${input.cutCadenceSeconds} seconds per shot. This is a pacing target, not a mandatory cut schedule. Hold longer for readable action and payoff; cut only when motivated by new visual information.`;
  const common = `${direction.cameraRuleEn} CATEGORY PHYSICAL FEASIBILITY GUIDE (examples only, not action selection): ${direction.motionRuleEn} Apply that guide only where compatible with the authored action. The authored prompt controls each actor's cause, movement and payoff; a guide's example must not substitute for them. ${movement} ${cadence} Preserve the authored visual style. Silent visual output only; no audio track, music, dialogue, narration or sound effects. ${LEGACY_NO_TEXT_RULE}`;
  const prompts: [string, string] = [
    `${input.prompt}\nPART 1, 0-15s: Begin the immediate visible hook and develop its physical cause in the same situation. Keep each authored action readable and continuously motivated. ${continuity} ${common}`,
    `${input.prompt}\nPART 2, 15-30s: Continue directly from the supplied final frame of part 1. That frame is the authoritative starting state, including initial positions, prop state, contacts and eye lines. From that state, let each actor continue the authored movement and cause into their own payoff and resolved reaction; do not restart or repeat the hook, introduce a new cast, or reset the scene. ${continuity} ${common}`,
  ];
  if (prompts.some(prompt => Buffer.byteLength(prompt, 'utf8') > 4096)) throw new ViralStoryError('두 영상의 연출이 Grok 한도를 넘습니다. 기획을 간결하게 수정해 주세요.', 'PROMPT_LENGTH', 422);
  return prompts;
}
export function viralStoryInputFingerprint(trackId: string, sourceAudioUrl: string, input: ViralStoryInput, promptVersion?: 2): string {
  if (promptVersion !== undefined && promptVersion !== 2) throw new ViralStoryError('저장된 영상 연출 버전을 확인해 주세요.', 'PROMPT_VERSION', 409);
  return createHash('sha256').update(JSON.stringify({ version: 1, trackId, sourceAudioUrl, ...input,
    ...(promptVersion === 2 ? { promptVersion } : {}) })).digest('hex');
}
const FAILURE_MESSAGES: Record<string, string> = {
  PROMPT_VERSION: '저장된 영상 연출 버전을 지원하지 않습니다. 기존 요청과 원본을 보존하고 운영자 확인을 기다립니다.',
  UNKNOWN_SUBMISSION: '영상 제출 응답을 확인하지 못했습니다. 중복 결제를 막기 위해 보류했습니다. 운영자 확인이 필요합니다.',
  PROVIDER_RESULT: '저장된 영상 요청이 실패하거나 만료되었습니다. 자동 재생성하지 않습니다.',
  AUDIO_DURATION: '음원이 30초를 넘거나 끝에서 소리가 남아 있습니다. 가창을 자르지 않고 제작을 보류했습니다.',
  AUDIO_HASH: '보관 음원이 원본 스냅샷과 다릅니다. 원본과 저장 상태를 확인해 주세요.',
  MEDIA_HASH: '보관된 영상이 원본 스냅샷과 다릅니다. 원본과 저장 상태를 확인해 주세요.',
  CLIP_DURATION: '생성 클립의 실제 길이가 15초인지 확인하지 못했습니다. 원본을 보존했습니다.',
  FINAL_DURATION: '완성본 영상과 음원이 모두 30초인지 확인하지 못했습니다.',
  TRANSIENT_IO: '저장된 원본을 처리하지 못했습니다. 같은 작업에서 안전하게 다시 진행할 수 있습니다.',
  MEDIA_FETCH: '저장된 미디어를 가져오지 못했습니다. 같은 작업에서 다시 진행해 주세요.',
  ASSET_STORAGE: '생성 결과를 보관하지 못했습니다. 같은 작업에서 보관을 다시 진행해 주세요.',
  BRIDGE_FRAME: '첫 영상의 마지막 프레임을 추출하지 못했습니다. 원본으로 다시 진행해 주세요.',
  DISK_SPACE: '영상 합성 서버의 여유 공간이 부족합니다. 공간 확보 후 같은 작업을 진행해 주세요.',
  FFMPEG_CONFIG: '영상 합성 도구를 확인하지 못했습니다. 서버 설정 확인 후 같은 작업을 진행해 주세요.',
  MEDIA_PROBE: '미디어의 실제 길이를 확인하지 못했습니다. 같은 원본을 다시 확인해 주세요.',
  VIDEO_CONCAT: '두 영상을 연결하지 못했습니다. 저장된 클립으로 다시 진행해 주세요.',
  VIDEO_MUX: '기존 음원과 영상을 합치지 못했습니다. 저장된 원본으로 다시 진행해 주세요.',
  FINAL_SIZE: '완성 영상이 허용 크기를 넘었습니다. 원본은 보존됩니다.',
  OPERATION_TIMEOUT: '이번 처리 시간이 초과되었습니다. 저장된 원본으로 같은 작업을 다시 진행해 주세요.',
};
function retryable(job: ViralStoryJob): boolean {
  return job.status === 'held' && !!job.failedOperation && !job.failedOperation.endsWith('_submit')
    && !['PROMPT_VERSION', 'UNKNOWN_SUBMISSION', 'PROVIDER_RESULT', 'AUDIO_DURATION', 'AUDIO_HASH', 'MEDIA_HASH', 'CLIP_DURATION', 'FINAL_DURATION', 'FINAL_SIZE'].includes(job.failureCode || '');
}
function stage(job: ViralStoryJob): ViralStoryStage {
  if (job.final) return 'completed';
  if (!job.audio) return 'audio';
  if (!job.clips[0].asset) return 'clip1';
  if (!job.bridge) return 'bridge';
  if (!job.clips[1].asset) return 'clip2';
  return 'render';
}
export function viralStoryJobView(job: ViralStoryJob, now = Date.now()): ViralStoryJobView {
  const current = job.status === 'held' ? stage(job) : job.status;
  const progress = { audio: 8, clip1: 20, bridge: 48, clip2: 58, render: 88, completed: 100, held: 0 }[current];
  return { version: 1, id: job.id, trackId: job.trackId, category: job.input.category, inputFingerprint: job.inputFingerprint,
    ...(job.promptVersion === 2 ? { promptVersion: 2 as const } : {}),
    prompt: job.input.prompt, allowDance: job.input.allowDance, cutCadenceSeconds: job.input.cutCadenceSeconds,
    status: job.status, progress, inFlight: !!job.lease && job.lease.until > now,
    canResume: normalizeActiveViralCategory(job.input.category) !== null && retryable(job), updatedAt: job.updatedAt,
    ...(job.failureCode ? { failureCode: job.failureCode, failureMessage: FAILURE_MESSAGES[job.failureCode] || FAILURE_MESSAGES.TRANSIENT_IO } : {}),
    ...(job.status === 'completed' && job.final ? { videoUrl: job.final.url, durationSeconds: job.final.durationSeconds,
      clips: job.clips.map(clip => clip.asset!.url), is30SecFull: true as const } : {}) };
}
export function completedViralStoryResponse(job: ViralStoryJobView | null) {
  return job?.status === 'completed' ? { videoUrl: job.videoUrl, durationSeconds: job.durationSeconds, clips: job.clips,
    is30SecFull: true, message: '30초 숏폼 MP4와 기존 음원 합성이 완료되었습니다.' } : {};
}
export function readViralStoryJob(record: ViralStoryOwnedRecord): ViralStoryJob | null {
  const value = record.metadata.viralVideoJob;
  if (value === undefined || value === null) return null;
  const invalid = (): never => { throw new ViralStoryError('저장된 영상 작업이 올바르지 않습니다. 원본과 요청 상태를 확인해 주세요.', 'JOB_INVALID', 409); };
  if (!object(value)) return invalid();
  const job = structuredClone(value) as unknown as ViralStoryJob;
  if (job.version !== 1 || !UUID.test(job.id || '') || job.trackId !== record.id || !STAGES.includes(job.status)
    || !mediaUrl(job.sourceAudioUrl) || !HASH.test(job.inputFingerprint || '') || !Number.isFinite(Date.parse(job.createdAt)) || !Number.isFinite(Date.parse(job.updatedAt))) return invalid();
  const supportedPromptVersion = job.promptVersion === undefined || job.promptVersion === 2;
  let input: ViralStoryInput; let prompts: [string, string] | undefined;
  try { input = validateViralStoryInput(job.input); if (supportedPromptVersion) prompts = compileViralStoryPrompts(input, job.promptVersion ?? 1); } catch { return invalid(); }
  if ((supportedPromptVersion && (viralStoryInputFingerprint(job.trackId, job.sourceAudioUrl, input, job.promptVersion) !== job.inputFingerprint || JSON.stringify(prompts) !== JSON.stringify(job.prompts)))
    || !Array.isArray(job.prompts) || job.prompts.length !== 2 || job.prompts.some(prompt => typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt, 'utf8') > 4096)
    || !Array.isArray(job.clips) || job.clips.length !== 2) return invalid();
  for (const clip of job.clips) {
    if (!object(clip) || !['empty', 'submitting', 'pending', 'generated', 'ready'].includes(clip.status)
      || (clip.requestId !== undefined && !REQUEST_ID.test(clip.requestId)) || (clip.sourceUrl !== undefined && !mediaUrl(clip.sourceUrl))
      || (clip.status !== 'empty' && !Number.isFinite(Date.parse(clip.submittedAt || '')))
      || (clip.status === 'pending' && !clip.requestId) || (clip.status === 'generated' && !clip.sourceUrl)
      || (clip.status === 'ready' && !asset(clip.asset, 'video'))
      || (clip.asset !== undefined && !asset(clip.asset, 'video')) || (clip.nextPollAt !== undefined && !Number.isFinite(clip.nextPollAt))) return invalid();
  }
  if ((job.audio !== undefined && !asset(job.audio, 'audio')) || (job.bridge !== undefined && (!mediaUrl(job.bridge.url) || !HASH.test(job.bridge.hash || '')))
    || (job.final !== undefined && !asset(job.final, 'final'))
    || (job.clips[0].status !== 'empty' && !job.audio) || (job.bridge && !job.clips[0].asset)
    || (job.clips[1].status !== 'empty' && !job.bridge) || (job.final && (!job.audio || !job.clips.every(clip => clip.asset) || !job.bridge))
    || (job.status !== 'held' && stage(job) !== job.status)) return invalid();
  if (job.lease && (!UUID.test(job.lease.token || '') || !Number.isFinite(job.lease.until) || !validOperation(job.lease.operation))) return invalid();
  if (job.failedOperation !== undefined && !validOperation(job.failedOperation)) return invalid();
  // An unknown revision cannot be recompiled safely. Hold the view without altering durable inputs or IDs.
  if (!supportedPromptVersion) { job.status = 'held'; job.failureCode = 'PROMPT_VERSION'; }
  return job;
}
function validOperation(value: unknown): value is ViralStoryOperation {
  return ['audio', 'clip1_submit', 'clip1_poll', 'clip1_copy', 'bridge', 'clip2_submit', 'clip2_poll', 'clip2_copy', 'render'].includes(value as string);
}
function nextOperation(job: ViralStoryJob): ViralStoryOperation {
  const current = stage(job);
  if (current === 'clip1' || current === 'clip2') {
    const clip = job.clips[current === 'clip1' ? 0 : 1];
    return `${current}_${clip.sourceUrl ? 'copy' : clip.requestId ? 'poll' : 'submit'}` as ViralStoryOperation;
  }
  return current as ViralStoryOperation;
}
/** One operation per advance. A persisted submission marker is never cleared for another POST. */
export function createViralStoryPipeline(deps: ViralStoryDependencies) {
  const now = deps.now || Date.now;
  const timestamp = () => new Date(now()).toISOString();
  async function bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ViralStoryError('처리 시간이 초과되었습니다.', 'OPERATION_TIMEOUT', 503)), deps.operationTimeoutMs ?? VIRAL_STORY_OPERATION_MS); });
    try { return await Promise.race([promise, timeout]); } finally { if (timer) clearTimeout(timer); }
  }
  async function owned(userId: string, trackId: string) {
    assertViralStoryUuid(userId); assertViralStoryUuid(trackId);
    const record = await deps.store.load(userId, trackId);
    if (!record || record.id !== trackId || record.userId !== userId) throw new ViralStoryError('저장된 음원을 찾을 수 없습니다.', 'NOT_FOUND', 404);
    if (record.status !== 'completed' || !record.audioUrl) throw new ViralStoryError('완성된 음원이 필요합니다.', 'AUDIO_REQUIRED', 409);
    return record;
  }
  async function load(userId: string, trackId: string, jobId?: string) {
    const record = await owned(userId, trackId); const job = readViralStoryJob(record);
    if (jobId !== undefined) { assertViralStoryUuid(jobId); if (!job || job.id !== jobId) throw new ViralStoryError('저장된 영상 작업을 찾을 수 없습니다.', 'JOB_NOT_FOUND', 404); }
    return { record, job };
  }
  async function checkpoint(userId: string, job: ViralStoryJob, token: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await load(userId, job.trackId, job.id);
      if (current.job!.lease?.token !== token) throw new ViralStoryError('다른 요청이 작업을 진행 중입니다. 저장된 상태를 다시 확인해 주세요.', 'JOB_CONFLICT', 409);
      const saved = await deps.store.compareAndSwap(current.record, { ...job, updatedAt: timestamp() });
      if (saved) return readViralStoryJob(saved)!;
    }
    throw new ViralStoryError('결과 상태를 저장하지 못했습니다. 같은 작업을 다시 조회해 주세요.', 'JOB_STORAGE', 503);
  }
  function hold(job: ViralStoryJob, operation: ViralStoryOperation, code: string) {
    job.status = 'held'; job.failedOperation = operation;
    job.failureCode = Object.hasOwn(FAILURE_MESSAGES, code) ? code : 'TRANSIENT_IO';
    delete job.lease;
  }
  return {
    async get(userId: string, trackId: string, jobId?: string) { const { job } = await load(userId, trackId, jobId); return job ? viralStoryJobView(job, now()) : null; },
    async create(userId: string, trackId: string, requestId: string, rawInput: unknown, expectedAudioUrl?: unknown) {
      assertViralStoryUuid(requestId); const input = validateViralStoryInput(rawInput);
      if (!normalizeActiveViralCategory(input.category)) throw new ViralStoryError(VIRAL_CATEGORY_DISABLED_MESSAGE, VIRAL_CATEGORY_DISABLED_CODE);
      const { record, job: existing } = await load(userId, trackId);
      if (expectedAudioUrl !== undefined && expectedAudioUrl !== record.audioUrl) throw new ViralStoryError('선택한 음원이 저장된 음원과 다릅니다.', 'AUDIO_MISMATCH', 409);
      if (!mediaUrl(record.audioUrl)) throw new ViralStoryError('저장된 음원 주소를 확인해 주세요.', 'AUDIO_REQUIRED', 409);
      deps.validateAudioUrl?.(record.audioUrl!);
      const metadataCategories = ['genCategory', 'tab_type', 'presetId'].map(key => record.metadata[key]);
      if (record.metadata.danceVideo || record.metadata.petVideoJob || metadataCategories.some(id => ['pet', 'dance', 'dance_challenge'].includes(id as string))
        || metadataCategories.some(id => typeof id === 'string' && VIRAL_STORY_CATEGORIES.some(category => category === id) && id !== input.category)) {
        throw new ViralStoryError('음원의 카테고리와 영상 제작 경로를 확인해 주세요.', 'TRACK_CATEGORY', 409);
      }
      const inputFingerprint = viralStoryInputFingerprint(trackId, record.audioUrl!, input, existing ? existing.promptVersion : 2);
      const same = (job: ViralStoryJob | null) => job?.id === requestId && job.inputFingerprint === inputFingerprint;
      if (existing) {
        if (!same(existing)) throw new ViralStoryError('이 음원에 저장된 영상 작업이 있습니다. 기존 작업을 확인해 주세요.', existing.id === requestId ? 'INPUT_CHANGED' : 'JOB_EXISTS', 409);
        return viralStoryJobView(existing, now());
      }
      const prompts = compileViralStoryPrompts(input, 2);
      const job: ViralStoryJob = { version: 1, promptVersion: 2, id: requestId, trackId, input, inputFingerprint, prompts, sourceAudioUrl: record.audioUrl!,
        status: 'audio', clips: [{ status: 'empty' }, { status: 'empty' }], createdAt: timestamp(), updatedAt: timestamp() };
      const saved = await deps.store.compareAndSwap(record, job);
      if (saved) return viralStoryJobView(readViralStoryJob(saved)!, now());
      const latest = (await load(userId, trackId)).job;
      if (same(latest)) return viralStoryJobView(latest!, now());
      throw new ViralStoryError('다른 입력이 먼저 저장되었습니다. 기존 작업을 확인해 주세요.', 'JOB_CONFLICT', 409);
    },
    async resume(userId: string, trackId: string, jobId: string) {
      const { record, job } = await load(userId, trackId, jobId);
      if (job!.status === 'completed') return viralStoryJobView(job!, now());
      if (!normalizeActiveViralCategory(job!.input.category)) throw new ViralStoryError(VIRAL_CATEGORY_DISABLED_MESSAGE, VIRAL_CATEGORY_DISABLED_CODE);
      if (job!.status !== 'held') return viralStoryJobView(job!, now());
      if (!retryable(job!) || job!.lease) throw new ViralStoryError('이 작업은 안전한 자동 재시도가 불가능합니다. 저장된 요청을 운영자가 확인해야 합니다.', 'RESUME_UNSAFE', 409);
      const resumed = { ...job!, status: stage(job!), updatedAt: timestamp() };
      // An expiring download URL may be refreshed by GET against the saved ID, never by POST.
      if (job!.failureCode === 'MEDIA_FETCH' && job!.failedOperation?.endsWith('_copy')) {
        const clip = resumed.clips[job!.failedOperation.startsWith('clip2') ? 1 : 0];
        if (clip.requestId) { delete clip.sourceUrl; clip.status = 'pending'; clip.nextPollAt = 0; }
      }
      delete resumed.failureCode; delete resumed.failedOperation;
      const saved = await deps.store.compareAndSwap(record, resumed);
      return viralStoryJobView(saved ? readViralStoryJob(saved)! : (await load(userId, trackId, jobId)).job!, now());
    },
    async advance(userId: string, trackId: string, jobId: string) {
      const loaded = await load(userId, trackId, jobId); let { record } = loaded; let job = loaded.job!;
      if (job.status === 'completed') return viralStoryJobView(job, now());
      if (!normalizeActiveViralCategory(job.input.category)) throw new ViralStoryError(VIRAL_CATEGORY_DISABLED_MESSAGE, VIRAL_CATEGORY_DISABLED_CODE);
      if (job.status === 'held') return viralStoryJobView(job, now());
      if (job.lease && job.lease.until > now()) return viralStoryJobView(job, now());
      // Lost submit response, or a saved marker without an ID, cannot prove a paid request failed.
      const uncertain = job.clips.findIndex(clip => clip.status === 'submitting' && !clip.requestId && !clip.sourceUrl);
      if (uncertain >= 0 || job.lease?.operation.endsWith('_submit')) {
        hold(job, uncertain === 1 ? 'clip2_submit' : 'clip1_submit', 'UNKNOWN_SUBMISSION'); job.updatedAt = timestamp();
        const saved = await deps.store.compareAndSwap(record, job);
        return viralStoryJobView(saved ? readViralStoryJob(saved)! : (await load(userId, trackId, jobId)).job!, now());
      }
      const operation = nextOperation(job); const index: 0 | 1 = operation.startsWith('clip2') ? 1 : 0;
      const clip = job.clips[index];
      if (operation.endsWith('_poll') && (clip.nextPollAt || 0) > now()) return viralStoryJobView(job, now());
      const token = randomUUID();
      job.lease = { token, until: now() + VIRAL_STORY_LEASE_MS, operation };
      if (operation.endsWith('_submit')) { clip.status = 'submitting'; clip.submittedAt = timestamp(); }
      job.updatedAt = timestamp();
      const reserved = await deps.store.compareAndSwap(record, job);
      if (!reserved) return viralStoryJobView((await load(userId, trackId, jobId)).job!, now());
      record = reserved; job = readViralStoryJob(record)!;
      const current = job.clips[index];
      const assertActive = () => { if (job.lease?.token !== token) throw new ViralStoryError('처리 시간이 초과되었습니다.', 'OPERATION_TIMEOUT', 503); };
      try {
        await bounded((async () => {
        if (operation === 'audio') {
          const audio = await deps.snapshotAudio(job);
          assertActive();
          if (!asset(audio, 'audio')) throw new ViralStoryError('음원 길이를 확인해 주세요.', 'AUDIO_DURATION');
          job.audio = audio;
        } else if (operation.endsWith('_submit')) {
          const result = await deps.startVideo(job.prompts[index], index === 1 ? job.bridge!.url : undefined);
          assertActive();
          if (result.requestId !== undefined && !REQUEST_ID.test(result.requestId)) throw new ViralStoryError('영상 제출 상태를 확인해 주세요.', 'UNKNOWN_SUBMISSION');
          if (result.url !== undefined && !mediaUrl(result.url)) throw new ViralStoryError('영상 제출 상태를 확인해 주세요.', 'UNKNOWN_SUBMISSION');
          if (!result.requestId && !result.url) throw new ViralStoryError('영상 제출 상태를 확인해 주세요.', 'UNKNOWN_SUBMISSION');
          if (result.requestId) current.requestId = result.requestId;
          if (result.url) { current.sourceUrl = result.url; current.status = 'generated'; }
          else { current.status = 'pending'; current.nextPollAt = now() + 5000; }
        } else if (operation.endsWith('_poll')) {
          const result = await deps.pollVideo(current.requestId!); assertActive(); current.nextPollAt = now() + 5000;
          if (result.status === 'done' && result.url && mediaUrl(result.url)) { current.sourceUrl = result.url; current.status = 'generated'; delete current.nextPollAt; }
          else if (result.status !== 'pending') hold(job, operation, 'PROVIDER_RESULT');
        } else if (operation.endsWith('_copy')) {
          const archived = await deps.archiveClip(job, index, current.sourceUrl!);
          assertActive();
          if (!asset(archived, 'video')) throw new ViralStoryError('클립 길이를 확인해 주세요.', 'CLIP_DURATION');
          current.asset = archived; current.status = 'ready';
        } else if (operation === 'bridge') {
          const bridge = await deps.extractBridge(job);
          assertActive();
          if (!mediaUrl(bridge.url) || !HASH.test(bridge.hash)) throw new ViralStoryError('연결 프레임을 확인해 주세요.', 'BRIDGE_FRAME');
          job.bridge = bridge;
        } else {
          const final = await deps.render(job);
          assertActive();
          if (!asset(final, 'final')) throw new ViralStoryError('완성본 길이를 확인해 주세요.', 'FINAL_DURATION');
          job.final = final;
        }
        if (job.status !== 'held') job.status = stage(job);
        })());
      } catch (error) {
        if (operation.endsWith('_submit')) hold(job, operation, 'UNKNOWN_SUBMISSION');
        else if (operation.endsWith('_poll')) { current.nextPollAt = now() + 10000; }
        else {
          const code = object(error) && typeof error.code === 'string' ? error.code : error instanceof ViralStoryError ? error.code : 'TRANSIENT_IO';
          hold(job, operation, code);
        }
      }
      // A storage failure escapes: the durable lease/marker remains and prevents another POST.
      delete job.lease;
      return viralStoryJobView(await checkpoint(userId, job, token), now());
    },
  };
}
