import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { readPetBoundedBody } from '@/lib/video/petMedia';
import { createViralStoryServerService } from '@/lib/video/viralStoryServer';
import { assertViralStoryUuid, completedViralStoryResponse, VIRAL_STORY_REQUEST_BYTES, ViralStoryError } from '@/lib/video/viralStoryPipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'no-store' };
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== request.nextUrl.origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new ViralStoryError('같은 서비스 화면에서 요청해 주세요.', 'ORIGIN', 403);
}
async function context() {
  const auth = await createClient(); const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new ViralStoryError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ViralStoryError('영상 작업 저장소 설정이 필요합니다.', 'SERVER_CONFIG', 503);
  const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userId: data.user.id, service: createViralStoryServerService(admin, data.user.id) };
}
function failure(error: unknown) {
  const known = error instanceof ViralStoryError;
  return NextResponse.json({ success: false, error: known ? error.message : '작업을 확인하지 못했습니다. 같은 작업을 다시 조회해 주세요.',
    code: known ? error.code : 'INTERNAL_ERROR' }, { status: known ? error.status : 500, headers });
}
export async function GET(request: NextRequest) {
  try {
    sameOrigin(request);
    const trackId = request.nextUrl.searchParams.get('trackId'); assertViralStoryUuid(trackId);
    const jobId = request.nextUrl.searchParams.get('jobId'); if (jobId !== null) assertViralStoryUuid(jobId);
    const { userId, service } = await context(); const job = await service.get(userId, trackId, jobId ?? undefined);
    return NextResponse.json({ success: true, job, ...completedViralStoryResponse(job) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    if (!request.headers.get('content-type')?.includes('application/json')) throw new ViralStoryError('JSON 요청이 필요합니다.', 'CONTENT_TYPE', 415);
    let body: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse((await readPetBoundedBody(new Response(request.body, { headers: request.headers }), VIRAL_STORY_REQUEST_BYTES)).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('body'); body = value as Record<string, unknown>;
    } catch { throw new ViralStoryError('요청 본문이 올바르지 않거나 너무 큽니다.', 'BODY'); }
    assertViralStoryUuid(body.trackId);
    const { userId, service } = await context(); let job;
    if (body.action === 'create') {
      if (Object.keys(body).some(key => !['action', 'trackId', 'requestId', 'prompt', 'category', 'allowDance', 'cutCadenceSeconds', 'audioUrl'].includes(key))) throw new ViralStoryError('지원하지 않는 영상 입력입니다.', 'INPUT');
      assertViralStoryUuid(body.requestId);
      job = await service.create(userId, body.trackId, body.requestId, body, body.audioUrl);
    } else {
      if (Object.keys(body).some(key => !['action', 'trackId', 'jobId'].includes(key))) throw new ViralStoryError('저장된 작업 ID로 진행해 주세요.', 'ACTION_INPUT');
      assertViralStoryUuid(body.jobId);
      if (body.action === 'advance') job = await service.advance(userId, body.trackId, body.jobId);
      else if (body.action === 'resume') job = await service.resume(userId, body.trackId, body.jobId);
      else throw new ViralStoryError('지원하지 않는 작업입니다.', 'ACTION');
    }
    return NextResponse.json({ success: true, job, ...completedViralStoryResponse(job) }, { headers });
  } catch (error) { return failure(error); }
}
