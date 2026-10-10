import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { DANCE_WORKFLOW } from '@/lib/dance/preset';
import { createDanceMusicService, DanceMusicError, danceConceptCheckpoint, isActiveDanceMusic, type DanceMusicRepository, type DanceMusicRow } from '@/lib/dance/music';
import { createDanceConceptMusicPlan } from '@/lib/dance/conceptMusicPlan';
import { submitKieSunoJob } from '../../../../../worker/suno-provider';

export const runtime = 'nodejs';
export const maxDuration = 300;
const FIELDS = 'id,user_id,title,status,is_public,created_at,audio_url,source_audio_url,license_hash';
const MAX_BODY_BYTES = 8 * 1024;
const headers = { 'Cache-Control': 'no-store' };

async function context() {
  const auth = await createClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new DanceMusicError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DanceMusicError('음악 저장소 설정을 확인해 주세요.', 'SERVER_CONFIG', 503);
  const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = (error: unknown) => { if (error) throw new DanceMusicError('저장된 음악 상태를 확인하지 못했습니다.', 'STORAGE', 503); };
  const ownedQuery = (userId: string) => admin.from('generations').select(FIELDS).eq('user_id', userId).like('license_hash', `%"workflow":"${DANCE_WORKFLOW}"%`);
  const repository: DanceMusicRepository = {
    async find(id) {
      const { data, error } = await admin.from('generations').select(FIELDS).eq('id', id).maybeSingle(); check(error); return data as DanceMusicRow | null;
    },
    async list(userId, trackId) {
      let query = ownedQuery(userId);
      if (trackId) query = query.eq('id', trackId);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(30); check(error); return (data || []) as DanceMusicRow[];
    },
    async active(userId) {
      const { data, error } = await ownedQuery(userId).in('status', ['generating', 'failed']).order('created_at', { ascending: false }).limit(30);
      check(error); return ((data || []) as DanceMusicRow[]).find(isActiveDanceMusic) || null;
    },
    async insert(row) {
      const { error } = await admin.from('generations').insert({ ...row, duration_mode: 'clip', is_stem_extracted: false });
      if (error?.code === '23505') return false;
      check(error); return true;
    },
    async updatePending(row, change) {
      let query = admin.from('generations').update(change).eq('id', row.id).eq('user_id', row.user_id)
        .eq('status', 'generating').is('source_audio_url', null);
      const token = danceConceptCheckpoint(row);
      query = token ? query.like('license_hash', `{"danceConceptCheckpoint":"${token}",%`) : query.eq('license_hash', row.license_hash);
      const { data, error } = await query.select('id').maybeSingle();
      check(error); return Boolean(data);
    },
  };
  return { userId: data.user.id, service: createDanceMusicService({ repository, storageOrigin: new URL(url).origin,
    planConceptMusic: createDanceConceptMusicPlan,
    submit: async options => {
      const apiKey = (process.env.KIE_API_KEY || '').trim();
      if (!apiKey) throw new DanceMusicError('음악 생성 설정을 확인해 주세요.', 'SERVER_CONFIG', 503);
      return submitKieSunoJob(options, { apiKey, apiBaseUrl: 'https://api.kie.ai' });
    },
  }) };
}
function failure(error: unknown) {
  const known = error instanceof DanceMusicError;
  return NextResponse.json({ success: false, code: known ? error.code : 'INTERNAL_ERROR',
    error: known ? error.message : '음악 요청을 처리하지 못했습니다. 저장된 요청 상태를 확인해 주세요.' }, { status: known ? error.status : 500, headers });
}
async function readInput(request: NextRequest) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new DanceMusicError('JSON 요청이 필요합니다.');
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES || !request.body) throw new DanceMusicError('음악 요청이 올바르지 않거나 너무 큽니다.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('limit'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch { throw new DanceMusicError('음악 요청이 올바르지 않거나 너무 큽니다.'); }
  finally { reader.releaseLock(); }
}
export async function GET(request: NextRequest) {
  try {
    const { userId, service } = await context();
    const trackId = request.nextUrl.searchParams.get('trackId') || undefined;
    return NextResponse.json({ success: true, tracks: await service.list(userId, trackId) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('origin') !== request.nextUrl.origin
      || request.headers.get('sec-fetch-site') === 'cross-site') throw new DanceMusicError('동일한 서비스 화면에서 요청해 주세요.', 'ORIGIN', 403);
    const { userId, service } = await context();
    const track = await service.create(userId, await readInput(request));
    return NextResponse.json({ success: true, track }, { headers });
  } catch (error) { return failure(error); }
}
