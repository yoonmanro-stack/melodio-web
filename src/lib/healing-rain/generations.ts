import type { RainPlan } from './recipes';
import { RainProjectError } from './projects';

export const RAIN_GENERATION_BUCKET = 'healing-rain';
export const RAIN_GENERATION_QUOTE = {
  version: 'healing-rain-preview-v1',
  provisional: false,
  image: { provider: 'kie', model: 'nano-banana-pro', count: 1, resolution: '2K', aspectRatio: '16:9', format: 'png', credits: 18 },
  video: { provider: 'kie', model: 'kling-3.0', mode: 'std', sourceVideoSeconds: 11, finalLoopSeconds: 10, sound: false, credits: 154 },
  audio: { provider: 'elevenlabs', model: 'eleven_text_to_sound_v2', takes: 6, secondsPerTake: 30, credits: 1800 },
  kieCredits: 172,
  kieListedUsd: 0.86,
  outputs: { previewSeconds: [30, 180], longFormIncluded: false },
  note: 'KIE 172크레딧(공시 가격 약 $0.86), ElevenLabs 과거 사용량 기준 약 1,800크레딧입니다. 오디오는 응답의 실제 사용량을 기록하며 두 크레딧을 합산하지 않습니다.',
} as const;

export type RainGenerationStatus = 'queued' | 'running' | 'ready' | 'needs_attention' | 'failed';
export type RainGenerationCheckpoint = {
  state: 'intent' | 'submitted' | 'ready' | 'needs_attention';
  intentAt?: string;
  provider?: string;
  model?: string;
  taskId?: string;
  completedAt?: string;
  [key: string]: unknown;
};
export type RainGenerationAsset = { path: string; mimeType: string; bytes?: number; durationSeconds?: number };
export type RainGenerationAssetKey = 'image' | 'video' | 'audio1' | 'audio2' | 'audio3' | 'audio4' | 'audio5' | 'audio6' | 'preview30' | 'preview180' | 'poster';

/** Worker wire contract. Store compact identifiers and measurements only, never provider response bodies.
 * Persist an `intent` checkpoint with the live claim token before every paid submission.
 * An intent without a task ID/finished asset is ambiguous: hold needs_attention, never automatically resubmit.
 */
export type RainGenerationRow = {
  id: string;
  user_id: string;
  project_id: string;
  client_request_id: string;
  request_snapshot: RainPlan;
  quote_version: string;
  status: RainGenerationStatus;
  stage: string;
  progress: number;
  checkpoints: Partial<Record<RainGenerationAssetKey | 'render', RainGenerationCheckpoint>>;
  assets: Partial<Record<RainGenerationAssetKey, RainGenerationAsset>>;
  estimated_cost: Record<string, unknown>;
  actual_usage: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  claim_token: string | null;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};
export type RainGenerationOutput = { url: string; mimeType: string; durationSeconds?: number; expiresAt: string };
export type RainGenerationJob = {
  id: string;
  projectId: string;
  status: RainGenerationStatus;
  stage: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  reviewStatus: 'pending';
  estimatedCost: Record<string, unknown>;
  actualUsage: Record<string, unknown>;
  errorCode: string | null;
  error: string | null;
  outputs: Partial<Record<'preview30' | 'preview180' | 'poster', RainGenerationOutput>>;
};
export type CreateRainGenerationInput = { projectId: string; clientRequestId: string; quoteVersion: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/;

export function parseRainGenerationId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new RainProjectError('invalid_request', '생성할 장면 또는 작업 ID를 확인해 주세요.', 400);
  return value.toLowerCase();
}

export function parseCreateRainGeneration(value: unknown): CreateRainGenerationInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RainProjectError('invalid_request', '생성 요청을 확인해 주세요.', 400);
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['projectId', 'clientRequestId', 'quoteVersion'].includes(key))) {
    throw new RainProjectError('invalid_request', '저장된 장면 ID와 견적 버전으로 요청해 주세요.', 400);
  }
  if (typeof body.clientRequestId !== 'string' || !REQUEST_ID.test(body.clientRequestId)) throw new RainProjectError('invalid_request', '생성 요청 ID를 확인해 주세요.', 400);
  if (typeof body.quoteVersion !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(body.quoteVersion)) throw new RainProjectError('invalid_request', '견적 버전을 확인해 주세요.', 400);
  return { projectId: parseRainGenerationId(body.projectId), clientRequestId: body.clientRequestId, quoteVersion: body.quoteVersion };
}

export function rainGenerationPlanUnavailableReason(plan: RainPlan): string | null {
  if (plan.input.sceneId !== 'train' || plan.input.thunder !== 'none') return '첫 생성은 천둥 없는 침대 열차 장면을 지원합니다.';
  if (plan.input.takes !== 6 || plan.generation.audioTakes !== 6) return '빗소리 6개로 저장한 장면을 선택해 주세요.';
  return null;
}

/** Strictly scoped object keys only; never sign a caller/provider URL or a different owner's object. */
export function isSafeRainGenerationAssetPath(path: unknown, userId: string, jobId: string): path is string {
  if (typeof path !== 'string' || !UUID.test(userId) || !UUID.test(jobId)) return false;
  const prefix = `${userId}/${jobId}/`;
  if (!path.startsWith(prefix)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}\.(?:mp4|png|jpe?g|webp|wav|mp3|m4a)$/.test(path.slice(prefix.length));
}

export function rainGenerationPublicError(status: RainGenerationStatus): string | null {
  if (status === 'needs_attention') return '제공사 처리 결과를 확인해야 합니다. 중복 결제를 막기 위해 자동 재요청을 멈췄습니다.';
  if (status === 'failed') return '미리보기 생성이 완료되지 않았습니다. 작업 내역을 확인해 주세요.';
  return null;
}

export function rainGenerationPublicUsage(value: Record<string, unknown>): Record<string, number | boolean> {
  const result: Record<string, number | boolean> = {};
  for (const key of ['kieCredits', 'elevenLabsCredits', 'kieCalls', 'elevenLabsCalls']) {
    const amount = value?.[key];
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) result[key] = amount;
  }
  if (typeof value?.unreportedCost === 'boolean') result.unreportedCost = value.unreportedCost;
  return result;
}
