import 'server-only';

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/types/database';
import { requireRainProjectUser } from './project-server';
import { RainProjectError } from './projects';
import { compileEpisodePlan, compareEpisodePlans, type EpisodeComparison, type EpisodeInput, type EpisodePlan } from './episodes';

type EpisodeRow = { id: string; user_id: string; client_request_id: string; plan: Json; comparison: Json; created_at: string };
type ReviewRow = { id: string; user_id: string; episode_id: string; client_request_id: string; verdict: 'approve_plan' | 'needs_revision'; reason: string; created_at: string };
// The migration is independently versioned; reads use the caller's RLS client
// and writes are restricted to these service-only, append-only RPCs.
type EpisodeDatabase = {
  public: {
    Tables: {
      healing_rain_episodes: { Row: EpisodeRow; Insert: EpisodeRow; Update: never; Relationships: [] };
      healing_rain_episode_reviews: { Row: ReviewRow; Insert: ReviewRow; Update: never; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      save_healing_rain_episode: {
        Args: { p_user_id: string; p_client_request_id: string; p_plan: Json; p_comparison: Json };
        Returns: { id: string; plan: Json; comparison: Json; created: boolean }[];
      };
      review_healing_rain_episode: {
        Args: { p_user_id: string; p_episode_id: string; p_client_request_id: string; p_verdict: string; p_reason: string };
        Returns: { id: string; episode_id: string; verdict: ReviewRow['verdict']; reason: string; created_at: string; created: boolean }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type EpisodeSnapshot = { episode: EpisodePlan; comparison: EpisodeComparison };
type EpisodeReview = { id: string; episodeId: string; verdict: ReviewRow['verdict']; reason: string; createdAt: string };
type EpisodeAuth = Awaited<ReturnType<typeof requireRainEpisodeUser>>;

export async function requireRainEpisodeUser() {
  const auth = await requireRainProjectUser();
  return { userId: auth.userId, client: auth.client as unknown as SupabaseClient<EpisodeDatabase> };
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) databaseError({ code: 'PGRST202' });
  return createSupabaseClient<EpisodeDatabase>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function databaseError(error: { code?: string }): never {
  if (['42P01', '42883', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) {
    throw new RainProjectError('persistence_not_ready', '에피소드 저장 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.', 503);
  }
  if (error.code === '23505') throw new RainProjectError('request_conflict', '이 요청 ID는 다른 내용에 사용되었습니다. 새 요청 ID로 다시 시도해 주세요.', 409);
  if (error.code === 'P0002' || error.code === '02000') throw new RainProjectError('episode_not_found', '에피소드를 찾을 수 없습니다.', 404);
  if (error.code === '22023' || error.code === '23514') throw new RainProjectError('invalid_request', '에피소드 설정 또는 검토 내용을 확인해 주세요.', 400);
  if (error.code === '42501') throw new RainProjectError('persistence_forbidden', '에피소드 저장소에 접근할 수 없습니다.', 403);
  throw new RainProjectError('persistence_unavailable', '에피소드 저장소에 연결하지 못했습니다. 같은 요청 ID로 다시 시도해 주세요.', 503);
}

function snapshot(row: Pick<EpisodeRow, 'plan' | 'comparison'>): EpisodeSnapshot {
  return { episode: row.plan as unknown as EpisodePlan, comparison: row.comparison as unknown as EpisodeComparison };
}

function reviewDto(row: Pick<ReviewRow, 'id' | 'episode_id' | 'verdict' | 'reason' | 'created_at'>): EpisodeReview {
  return { id: row.id, episodeId: row.episode_id, verdict: row.verdict, reason: row.reason, createdAt: row.created_at };
}

// JSONB key order is not stable, so retry equality must not depend on it.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function planRainEpisode(auth: EpisodeAuth, input: EpisodeInput): Promise<EpisodeSnapshot> {
  const episode = compileEpisodePlan(input, crypto.randomUUID(), new Date().toISOString());
  const { data, error } = await auth.client.from('healing_rain_episodes').select('plan')
    .eq('user_id', auth.userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(101);
  if (error) databaseError(error);
  const rows = data ?? [];
  const comparison = compareEpisodePlans(episode, rows.slice(0, 100).map(row => row.plan as unknown as EpisodePlan), rows.length > 100);
  return { episode, comparison };
}

export async function saveRainEpisode(auth: EpisodeAuth, input: { clientRequestId: string; input: EpisodeInput }): Promise<EpisodeSnapshot & { created: boolean }> {
  const { data: existing, error } = await auth.client.from('healing_rain_episodes').select('plan,comparison')
    .eq('user_id', auth.userId).eq('client_request_id', input.clientRequestId).maybeSingle();
  if (error) databaseError(error);
  if (existing) {
    const saved = snapshot(existing);
    if (canonicalJson(saved.episode.input) !== canonicalJson(input.input)) databaseError({ code: '23505' });
    // A retry replays the stored comparison, even after the history or compiler changes.
    return { ...saved, created: false };
  }
  const planned = await planRainEpisode(auth, input.input);
  const result = await adminClient().rpc('save_healing_rain_episode', {
    p_user_id: auth.userId, p_client_request_id: input.clientRequestId,
    p_plan: planned.episode as unknown as Json, p_comparison: planned.comparison as unknown as Json,
  });
  if (result.error) databaseError(result.error);
  if (!result.data || result.data.length !== 1) databaseError({});
  // A racing retry can return the original transaction's snapshot.
  return { ...snapshot(result.data[0]), created: result.data[0].created };
}

export async function listRainEpisodes(auth: EpisodeAuth, cursor: { createdAt: string; id: string } | null) {
  let query = auth.client.from('healing_rain_episodes').select('id,plan,comparison,created_at')
    .eq('user_id', auth.userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(51);
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) databaseError(error);
  const rows = data ?? [];
  const page = rows.slice(0, 50);
  const last = page.at(-1);
  return { episodes: page.map(snapshot), nextCursor: rows.length > 50 && last ? `${last.created_at}|${last.id}` : null };
}

export async function getRainEpisode(auth: EpisodeAuth, id: string) {
  const { data, error } = await auth.client.from('healing_rain_episodes').select('plan,comparison')
    .eq('user_id', auth.userId).eq('id', id).maybeSingle();
  if (error) databaseError(error);
  if (!data) databaseError({ code: 'P0002' });
  const reviews = await auth.client.from('healing_rain_episode_reviews').select('id,episode_id,verdict,reason,created_at')
    .eq('user_id', auth.userId).eq('episode_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
  if (reviews.error) databaseError(reviews.error);
  return { ...snapshot(data), reviews: (reviews.data ?? []).map(reviewDto) };
}

export async function reviewRainEpisode(auth: EpisodeAuth, id: string, review: { clientRequestId: string; verdict: ReviewRow['verdict']; reason: string }) {
  // Verify ownership using the caller's RLS context before using the service role.
  const owned = await auth.client.from('healing_rain_episodes').select('id')
    .eq('user_id', auth.userId).eq('id', id).maybeSingle();
  if (owned.error) databaseError(owned.error);
  if (!owned.data) databaseError({ code: 'P0002' });
  const { data, error } = await adminClient().rpc('review_healing_rain_episode', {
    p_user_id: auth.userId, p_episode_id: id, p_client_request_id: review.clientRequestId,
    p_verdict: review.verdict, p_reason: review.reason,
  });
  if (error) databaseError(error);
  if (!data || data.length !== 1) databaseError({});
  return { review: reviewDto(data[0]), created: data[0].created };
}
