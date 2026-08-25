import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  PRIVATE_STEM_BUCKET,
  buildPrivateStemUploadPath,
  buildStorageUri,
  createStemAdminClient,
  parsePrepareStemUpload,
  readStemJson,
  requireStemUser,
  stemApiErrorMessage,
  stemApiErrorStatus,
} from '@/lib/stems/stem-api';

export const dynamic = 'force-dynamic';

// Supabase signed upload tokens last about two hours. Keep the server session
// five minutes longer, then retain a durable +30m exact-path cleanup task for a
// PUT that began just before token expiry and commits late.
const UPLOAD_SESSION_TTL_MS = (2 * 60 + 5) * 60 * 1000;

async function cleanExpiredSessions(
  admin: ReturnType<typeof createStemAdminClient>,
  userId: string,
) {
  const now = new Date();
  const { data: expired, error } = await admin
    .from('stem_upload_sessions')
    .select('id,storage_path')
    .eq('user_id', userId)
    .is('confirmed_at', null)
    .lt('expires_at', now.toISOString())
    .limit(50);

  if (error) throw new Error(`expired upload session query failed: ${error.message}`);

  for (const session of expired || []) {
    const sourceUri = buildStorageUri(session.storage_path);
    const { data: reference, error: referenceError } = await admin
      .from('generations')
      .select('id')
      .eq('user_id', userId)
      .eq('source_audio_url', sourceUri)
      .limit(1)
      .maybeSingle();

    if (referenceError) {
      console.error('[API/prepare-upload] 만료 세션 참조 확인 실패:', referenceError.message);
      continue;
    }
    if (reference) {
      await admin
        .from('stem_upload_sessions')
        .update({ confirmed_at: now.toISOString(), generation_id: reference.id })
        .eq('id', session.id);
      continue;
    }

    const { data: cleanupScheduled, error: scheduleError } = await admin.rpc(
      'expire_stem_upload_session_with_cleanup',
      {
        p_id: session.id,
        p_user_id: userId,
        p_storage_path: session.storage_path,
      },
    );
    if (scheduleError) {
      console.error('[API/prepare-upload] 만료 세션 cleanup 예약 실패:', scheduleError.message);
      continue;
    }
    if (!cleanupScheduled) continue;

    const { error: removeError } = await admin.storage
      .from(PRIVATE_STEM_BUCKET)
      .remove([session.storage_path]);
    if (removeError) {
      console.error('[API/prepare-upload] 만료 원본 정리 실패:', removeError.message);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireStemUser();
    const input = parsePrepareStemUpload(await readStemJson(request));
    const serviceSupabase = createStemAdminClient();

    await cleanExpiredSessions(serviceSupabase, user.id);

    const generationId = randomUUID();
    const storagePath = buildPrivateStemUploadPath(user.id, generationId, input.extension);
    const expiresAt = new Date(Date.now() + UPLOAD_SESSION_TTL_MS).toISOString();

    const { error: sessionError } = await serviceSupabase.rpc('reserve_stem_upload_session', {
      p_id: generationId,
      p_user_id: user.id,
      p_storage_path: storagePath,
      p_original_file_name: input.fileName,
      p_expected_size: input.fileSize,
      p_expires_at: expiresAt,
    });
    if (sessionError) {
      if (sessionError.message.includes('UPLOAD_RATE_LIMIT')) {
        return NextResponse.json({ error: '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
      }
      if (sessionError.message.includes('UPLOAD_STORAGE_QUOTA')) {
        return NextResponse.json({ error: 'Stem 원본 저장공간 2GB 한도에 도달했습니다. 오래된 Stem 작업을 삭제한 뒤 다시 시도해 주세요.' }, { status: 413 });
      }
      if (sessionError.message.includes('STEM_ACTIVE_LIMIT')) {
        return NextResponse.json({ error: '동시에 처리할 수 있는 Stem 작업은 최대 3개입니다. 기존 작업 완료 후 다시 시도해 주세요.' }, { status: 429 });
      }
      if (sessionError.message.includes('STEM_OUTPUT_LIMIT')) {
        return NextResponse.json({ error: 'Stem 보관 작업은 최대 10개입니다. Stem Studio에서 오래된 작업을 삭제한 뒤 다시 시도해 주세요.' }, { status: 413 });
      }
      throw new Error(`upload session reservation failed: ${sessionError.message}`);
    }

    // Supabase Storage에 직접 업로드 가능한 서명된 URL 생성 (Vercel 4.5MB 제한 우회)
    const { data, error } = await serviceSupabase.storage
      .from(PRIVATE_STEM_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      await serviceSupabase.from('stem_upload_sessions').delete().eq('id', generationId);
      console.error('[API/prepare-upload] 서명된 업로드 URL 생성 실패:', error?.message);
      return NextResponse.json({ error: '업로드 URL 생성 실패: ' + (error?.message || '알 수 없는 오류') }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      generationId,
      bucket: PRIVATE_STEM_BUCKET,
      path: storagePath,
      token: data.token,
      signedUrl: data.signedUrl,
      ext: input.extension,
      expiresAt,
    });
  } catch (error) {
    const status = stemApiErrorStatus(error);
    if (status === 500) console.error('[API/prepare-upload] 요청 실패:', error);
    return NextResponse.json({ error: stemApiErrorMessage(error) }, { status });
  }
}
