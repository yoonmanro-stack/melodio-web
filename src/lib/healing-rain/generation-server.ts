import 'server-only';

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/types/database';
import type { RainPlan } from './recipes';
import { requireRainProjectUser } from './project-server';
import { RainProjectError } from './projects';
import {
  RAIN_GENERATION_BUCKET, RAIN_GENERATION_QUOTE, isSafeRainGenerationAssetPath,
  rainGenerationPlanUnavailableReason, rainGenerationPublicError, rainGenerationPublicUsage, rainGenerationPublicQuality,
  type CreateRainGenerationInput, type RainGenerationJob, type RainGenerationRow,
} from './generations';

type RainGenerationDatabase = {
  public: {
    Tables: {
      healing_rain_projects: { Row: { id: string; user_id: string; plan: Json }; Insert: never; Update: never; Relationships: [] };
      healing_rain_generations: { Row: RainGenerationRow; Insert: never; Update: never; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      enqueue_healing_rain_generation: {
        Args: { p_user_id: string; p_project_id: string; p_client_request_id: string; p_quote_version: string; p_estimated_cost: Json; p_global_queue_limit: number };
        Returns: { job: Json; created: boolean }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export async function requireRainGenerationUser() {
  const auth = await requireRainProjectUser();
  return { userId: auth.userId, client: auth.client as unknown as SupabaseClient<RainGenerationDatabase> };
}
type RainGenerationAuth = Awaited<ReturnType<typeof requireRainGenerationUser>>;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RainProjectError('generation_not_ready', '미리보기 생성 기능을 준비 중입니다.', 503);
  return createSupabaseClient<RainGenerationDatabase>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function databaseError(error: { code?: string; message?: string }): never {
  if (['42P01', '42883', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) throw new RainProjectError('generation_not_ready', '미리보기 생성 기능을 준비 중입니다.', 503);
  if (error.code === '23505') throw new RainProjectError('request_conflict', '이 요청 ID는 다른 장면에 사용되었습니다.', 409);
  if (error.code === 'P0002') throw new RainProjectError('project_not_found', '저장된 장면을 찾을 수 없습니다.', 404);
  if (error.code === 'P0001') throw new RainProjectError('generation_busy', '이미 생성 중인 작업이 있거나 생성 대기열이 가득 찼습니다.', 409);
  if (error.code === '22023' || error.code === '23514') throw new RainProjectError('invalid_request', '첫 생성은 천둥 없는 침대 열차와 빗소리 6개 설정을 지원합니다.', 400);
  if (error.code === '42501') throw new RainProjectError('generation_forbidden', '이 생성 작업에 접근할 수 없습니다.', 403);
  throw new RainProjectError('generation_unavailable', '생성 작업을 확인하지 못했습니다. 같은 요청 ID로 다시 시도해 주세요.', 503);
}

function generationGate(userId: string): string | null {
  if (process.env.HEALING_RAIN_GENERATION_ENABLED !== 'true') return '미리보기 생성 기능을 준비 중입니다.';
  const allowed = (process.env.HEALING_RAIN_ALLOWED_USER_IDS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(userId.toLowerCase())) return '현재 계정은 미리보기 생성 대상에 포함되지 않았습니다.';
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return '미리보기 생성 저장소를 준비 중입니다.';
  return null;
}

async function ownProject(auth: RainGenerationAuth, projectId: string): Promise<RainPlan> {
  const { data, error } = await auth.client.from('healing_rain_projects').select('id,plan').eq('user_id', auth.userId).eq('id', projectId).maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new RainProjectError('project_not_found', '저장된 장면을 찾을 수 없습니다.', 404);
  return data.plan as unknown as RainPlan;
}

async function publicJob(row: RainGenerationRow, ownerId: string): Promise<RainGenerationJob> {
  // Both database RLS and this final check protect signing privileges.
  if (row.user_id !== ownerId) throw new RainProjectError('generation_not_found', '생성 작업을 찾을 수 없습니다.', 404);
  const outputs: RainGenerationJob['outputs'] = {};
  const expiresIn = 600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  for (const key of ['preview30', 'preview180', 'poster'] as const) {
    const asset = row.assets?.[key];
    const expectedMime = key === 'poster' ? /^image\/(?:png|jpeg|webp)$/ : /^video\/mp4$/;
    if (!asset || !expectedMime.test(asset.mimeType) || !isSafeRainGenerationAssetPath(asset.path, ownerId, row.id)) continue;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) continue;
    const { data, error } = await adminClient().storage.from(RAIN_GENERATION_BUCKET).createSignedUrl(asset.path, expiresIn);
    if (error || !data?.signedUrl) continue;
    outputs[key] = { url: data.signedUrl, mimeType: asset.mimeType, expiresAt, ...(Number.isFinite(asset.durationSeconds) ? { durationSeconds: asset.durationSeconds } : {}) };
  }
  return {
    id: row.id, projectId: row.project_id, status: row.status, stage: row.stage, progress: row.progress,
    createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
    reviewStatus: 'pending', quality: rainGenerationPublicQuality(row.checkpoints?.render?.quality), estimatedCost: row.estimated_cost, actualUsage: rainGenerationPublicUsage(row.actual_usage),
    errorCode: row.error_code && /^[a-z0-9_]{1,64}$/.test(row.error_code) ? row.error_code : null,
    error: rainGenerationPublicError(row.status), outputs,
  };
}

export async function listRainGenerations(auth: RainGenerationAuth, projectId: string) {
  const plan = await ownProject(auth, projectId);
  const { data, error } = await auth.client.from('healing_rain_generations').select('*')
    .eq('user_id', auth.userId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(20);
  if (error) databaseError(error);
  const unavailableReason = generationGate(auth.userId) ?? rainGenerationPlanUnavailableReason(plan);
  return { jobs: await Promise.all((data ?? []).map(row => publicJob(row, auth.userId))), quote: RAIN_GENERATION_QUOTE, canGenerate: unavailableReason === null, unavailableReason };
}

export async function getRainGeneration(auth: RainGenerationAuth, id: string) {
  const { data, error } = await auth.client.from('healing_rain_generations').select('*').eq('user_id', auth.userId).eq('id', id).maybeSingle();
  if (error) databaseError(error);
  if (!data) throw new RainProjectError('generation_not_found', '생성 작업을 찾을 수 없습니다.', 404);
  return { job: await publicJob(data, auth.userId) };
}

export async function createRainGeneration(auth: RainGenerationAuth, input: CreateRainGenerationInput) {
  // A retry returns its existing durable job even if generation has since been disabled or the quote changed.
  const previous = await auth.client.from('healing_rain_generations').select('*').eq('user_id', auth.userId).eq('client_request_id', input.clientRequestId).maybeSingle();
  if (previous.error) databaseError(previous.error);
  if (previous.data) {
    if (previous.data.project_id !== input.projectId) throw new RainProjectError('request_conflict', '이 요청 ID는 다른 장면에 사용되었습니다.', 409);
    return { job: await publicJob(previous.data, auth.userId), created: false };
  }
  const gate = generationGate(auth.userId);
  if (gate) throw new RainProjectError('generation_disabled', gate, 403);
  if (input.quoteVersion !== RAIN_GENERATION_QUOTE.version) throw new RainProjectError('quote_changed', '견적이 변경되었습니다. 새 견적을 확인해 주세요.', 409);
  const plan = await ownProject(auth, input.projectId);
  const unsupported = rainGenerationPlanUnavailableReason(plan);
  if (unsupported) throw new RainProjectError('unsupported_recipe', unsupported, 400);
  const configuredLimit = Number(process.env.HEALING_RAIN_MAX_QUEUED_JOBS ?? '10');
  const queueLimit = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 100 ? configuredLimit : 10;
  const { data, error } = await adminClient().rpc('enqueue_healing_rain_generation', {
    p_user_id: auth.userId, p_project_id: input.projectId, p_client_request_id: input.clientRequestId,
    p_quote_version: RAIN_GENERATION_QUOTE.version, p_estimated_cost: RAIN_GENERATION_QUOTE as unknown as Json, p_global_queue_limit: queueLimit,
  });
  if (error) databaseError(error);
  const saved = data?.[0];
  if (!saved) databaseError({});
  return { job: await publicJob(saved.job as unknown as RainGenerationRow, auth.userId), created: saved.created };
}
