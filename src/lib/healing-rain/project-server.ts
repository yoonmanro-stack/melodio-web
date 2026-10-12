import 'server-only';

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';
import { compileRecipe, type RainPlan } from './recipes';
import { RainProjectError, type SaveRainProjectInput, type SavedRainProject, type RainProjectPage } from './projects';

type ProjectRow = { id: string; user_id: string; client_request_id: string; plan: Json; created_at: string };
// Kept beside the independently versioned migration instead of widening the
// application's hand-maintained shared Database type.
type RainProjectDatabase = {
  public: {
    Tables: {
      healing_rain_projects: {
        Row: ProjectRow;
        Insert: ProjectRow;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_healing_rain_projects: {
        Args: { p_user_id: string; p_projects: Json };
        Returns: { client_request_id: string; plan: Json; created: boolean }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export async function requireRainProjectUser() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new RainProjectError('authentication_required', '로그인한 뒤 장면을 저장해 주세요.', 401);
  return { userId: data.user.id, client: client as unknown as SupabaseClient<RainProjectDatabase> };
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RainProjectError('persistence_not_ready', '계정 장면 저장 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.', 503);
  return createSupabaseClient<RainProjectDatabase>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function databaseError(error: { code?: string }): never {
  if (['42P01', '42883', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) {
    throw new RainProjectError('persistence_not_ready', '계정 장면 저장 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.', 503);
  }
  if (error.code === '23505') {
    throw new RainProjectError('request_conflict', '이 저장 요청 ID는 다른 장면에 사용되었습니다. 새 저장 요청으로 다시 시도해 주세요.', 409);
  }
  if (error.code === '22023' || error.code === '23514') {
    throw new RainProjectError('invalid_request', '저장할 장면 설정을 확인해 주세요.', 400);
  }
  if (error.code === '42501') throw new RainProjectError('persistence_forbidden', '장면 저장소에 접근할 수 없습니다.', 403);
  throw new RainProjectError('persistence_unavailable', '장면 저장소에 연결하지 못했습니다. 같은 요청 ID로 다시 시도해 주세요.', 503);
}

export async function listRainProjects(
  auth: Awaited<ReturnType<typeof requireRainProjectUser>>,
  cursor: { createdAt: string; id: string } | null,
): Promise<RainProjectPage> {
  // RLS is authoritative; the explicit owner filter is defense in depth.
  let query = auth.client.from('healing_rain_projects').select('id,plan,created_at')
    .eq('user_id', auth.userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(51);
  if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) databaseError(error);
  const rows = data ?? [];
  const page = rows.slice(0, 50);
  const last = page.at(-1);
  return {
    projects: page.map(row => row.plan as unknown as RainPlan),
    nextCursor: rows.length > 50 && last ? `${last.created_at}|${last.id}` : null,
  };
}

/** Only call with requireRainProjectUser().userId and fully parsed inputs. */
export async function saveRainProjects(userId: string, inputs: SaveRainProjectInput[]): Promise<SavedRainProject[]> {
  const prepared = inputs.map(item => ({
    client_request_id: item.clientRequestId,
    plan: compileRecipe(item.input, crypto.randomUUID(), new Date().toISOString()),
  }));
  // One service-only RPC is one transaction, including import conflict checks.
  // Clients cannot bypass compilation by writing directly through PostgREST.
  const { data, error } = await adminClient().rpc('save_healing_rain_projects', {
    p_user_id: userId, p_projects: prepared as unknown as Json,
  });
  if (error) databaseError(error);
  if (!data || data.length !== inputs.length) databaseError({});
  const byRequest = new Map(data.map(row => [row.client_request_id, row]));
  return inputs.map(item => {
    const row = byRequest.get(item.clientRequestId);
    if (!row) databaseError({});
    return { project: row.plan as unknown as RainPlan, created: row.created };
  });
}
