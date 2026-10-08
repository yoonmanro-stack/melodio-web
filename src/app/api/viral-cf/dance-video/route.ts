import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { readPetBoundedBody } from '@/lib/video/petMedia';
import { createDanceVideoServerService } from '@/lib/dance/videoServer';
import { assertDanceUuid, DANCE_VIDEO_REQUEST_BYTES, DanceVideoError } from '@/lib/dance/videoService';

export const runtime = 'nodejs';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'no-store' };
async function context() {
  const auth = await createClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new DanceVideoError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DanceVideoError('영상 작업 저장소 설정이 필요합니다.', 'SERVER_CONFIG', 503);
  const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userId: data.user.id, service: createDanceVideoServerService(admin, data.user.id) };
}
function failure(error: unknown) {
  const known = error instanceof DanceVideoError;
  return NextResponse.json({ success: false, error: known ? error.message : '작업을 확인하지 못했습니다. 저장된 상태를 다시 조회해 주세요.', code: known ? error.code : 'INTERNAL_ERROR' }, { status: known ? error.status : 500, headers });
}
export async function GET(request: NextRequest) {
  try {
    const { userId, service } = await context();
    const trackId = request.nextUrl.searchParams.get('trackId'); assertDanceUuid(trackId);
    return NextResponse.json({ success: true, job: await service.get(userId, trackId) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) throw new DanceVideoError('같은 서비스 화면에서 요청해 주세요.', 'ORIGIN', 403);
    if (!request.headers.get('content-type')?.includes('application/json')) throw new DanceVideoError('JSON 요청이 필요합니다.', 'CONTENT_TYPE', 415);
    const { userId, service } = await context();
    let body: Record<string, unknown>;
    try {
      const data: unknown = JSON.parse((await readPetBoundedBody(new Response(request.body, { headers: request.headers }), DANCE_VIDEO_REQUEST_BYTES)).toString('utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('body');
      body = data as Record<string, unknown>;
    } catch { throw new DanceVideoError('요청 본문이 올바르지 않거나 너무 큽니다.', 'BODY'); }
    assertDanceUuid(body.trackId);
    if (body.action === 'reuse') {
      if (Object.keys(body).some(key => !['action', 'trackId', 'jobId', 'requestId'].includes(key))) {
        throw new DanceVideoError('저장된 작업 ID만으로 음원을 재사용할 수 있습니다.', 'REUSE_INPUT');
      }
      assertDanceUuid(body.jobId); assertDanceUuid(body.requestId);
      return NextResponse.json({ success: true, ...await service.reuse(userId, body.trackId, body.jobId, body.requestId) }, { headers });
    }
    let job;
    if (body.action === 'prepare') {
      if (Object.keys(body).some(key => !['action', 'trackId', 'startSeconds', 'visualBrief', 'creativePreferences'].includes(key))) throw new DanceVideoError('지원하지 않는 영상 기획 입력입니다.', 'PREPARE_INPUT');
      job = await service.prepare(userId, body.trackId, body.startSeconds, body.visualBrief, body.creativePreferences);
    }
    else if (body.action === 'select-idea') {
      if (Object.keys(body).some(key => !['action', 'trackId', 'jobId', 'ideaId'].includes(key))) throw new DanceVideoError('저장된 아이디어 목록에서 선택해 주세요.', 'IDEA_INPUT');
      assertDanceUuid(body.jobId);
      job = await service.selectIdea(userId, body.trackId, body.jobId, body.ideaId);
    }
    else {
      if (Object.keys(body).some(key => !['action', 'trackId', 'jobId'].includes(key))) throw new DanceVideoError('저장된 작업 ID로 진행해 주세요.', 'ACTION_INPUT');
      assertDanceUuid(body.jobId);
      if (body.action === 'start') job = await service.start(userId, body.trackId, body.jobId);
      else if (body.action === 'approve-frame') job = await service.approveFrame(userId, body.trackId, body.jobId);
      else if (body.action === 'approve-preview') job = await service.approvePreview(userId, body.trackId, body.jobId);
      else if (body.action === 'resume') job = await service.resume(userId, body.trackId, body.jobId);
      else if (body.action === 'advance') job = await service.advance(userId, body.trackId, body.jobId);
      else throw new DanceVideoError('지원하지 않는 작업입니다.', 'ACTION');
    }
    return NextResponse.json({ success: true, job }, { headers });
  } catch (error) { return failure(error); }
}
