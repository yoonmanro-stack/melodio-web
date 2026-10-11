import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { PetEpisode } from '@/lib/vle/petEpisode';
import { assertPetUuid, PET_VIDEO_REQUEST_MAX_BYTES, PetPipelineError } from '@/lib/video/petPipeline';
import { createPetVideoServerService } from '@/lib/video/petServer';
import { readPetBoundedBody } from '@/lib/video/petMedia';
import { preflightPetRenderer } from '@/lib/video/petRenderer';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function context() {
  const auth = await createClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new PetPipelineError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new PetPipelineError('서버 작업 저장소 설정이 필요합니다.', 'SERVER_CONFIG', 503);
  const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userId: data.user.id, service: createPetVideoServerService(admin) };
}
function failure(error: unknown) {
  const known = error instanceof PetPipelineError;
  return NextResponse.json({ success: false, error: known ? error.message : '작업을 처리하지 못했습니다. 저장된 작업 상태를 다시 확인해 주세요.', code: known ? error.code : 'INTERNAL_ERROR' }, { status: known ? error.status : 500, headers: { 'Cache-Control': 'no-store' } });
}
export async function GET(request: NextRequest) {
  try {
    const { userId, service } = await context();
    if (request.nextUrl.searchParams.get('check') === 'providers') {
      return NextResponse.json({ success: true, providers: {
        musicConfigured: Boolean(process.env.KIE_API_KEY?.trim()),
        videoConfigured: Boolean(process.env.XAI_API_KEY?.trim()),
      } }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.nextUrl.searchParams.get('check') === 'renderer') {
      await preflightPetRenderer();
      return NextResponse.json({ success: true, rendererReady: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const jobId = request.nextUrl.searchParams.get('jobId'); assertPetUuid(jobId);
    return NextResponse.json({ success: true, job: await service.get(userId, jobId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    // Same-origin cookie-authenticated mutation. Browser cross-site submissions cannot spend credits.
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) throw new PetPipelineError('동일한 서비스 화면에서 요청해 주세요.', 'ORIGIN', 403);
    const { userId, service } = await context();
    if (!request.headers.get('content-type')?.includes('application/json')) throw new PetPipelineError('JSON 요청이 필요합니다.');
    let body: Record<string, unknown>;
    try {
      const bytes = await readPetBoundedBody(new Response(request.body, { headers: request.headers }), PET_VIDEO_REQUEST_MAX_BYTES);
      body = JSON.parse(bytes.toString('utf8'));
    } catch { throw new PetPipelineError('요청 본문이 올바르지 않거나 너무 큽니다.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PetPipelineError('요청 본문이 올바르지 않습니다.');
    let job;
    if (body.action === 'create') {
      assertPetUuid(body.trackId);
      await preflightPetRenderer();
      job = await service.create(userId, body.episode as PetEpisode, body.trackId);
    } else {
      assertPetUuid(body.jobId);
      if (body.action === 'advance') job = await service.advance(userId, body.jobId);
      else if (body.action === 'approve') job = await service.approve(userId, body.jobId, body.motionPrompts);
      else if (body.action === 'resume') job = await service.resume(userId, body.jobId);
      else if (body.action === 'confirm') job = await service.confirm(userId, body.jobId, body.videoUrl);
      else throw new PetPipelineError('지원하지 않는 작업입니다.');
    }
    return NextResponse.json({ success: true, job }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
