import { NextRequest, NextResponse } from 'next/server';
import {
  PRIVATE_STEM_BUCKET,
  buildStorageUri,
  createStemAdminClient,
  parseConfirmStemUpload,
  readStemJson,
  requireStemUser,
  stemApiErrorMessage,
  stemApiErrorStatus,
  verifyPrivateStemObject,
} from '@/lib/stems/stem-api';

export const dynamic = 'force-dynamic';

async function removeUnconfirmedUpload(
  admin: ReturnType<typeof createStemAdminClient>,
  sessionId: string,
  userId: string,
  path: string,
) {
  const { data: cleanupScheduled, error: scheduleError } = await admin.rpc(
    'expire_stem_upload_session_with_cleanup',
    { p_id: sessionId, p_user_id: userId, p_storage_path: path },
  );
  if (scheduleError) {
    console.error('[API/confirm-and-split] 미확정 원본 cleanup 예약 실패:', scheduleError.message);
    return;
  }
  if (!cleanupScheduled) return;

  const { error: cleanupError } = await admin.storage.from(PRIVATE_STEM_BUCKET).remove([path]);
  if (cleanupError) {
    console.error('[API/confirm-and-split] 미확정 원본 정리 실패:', cleanupError.message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireStemUser();
    const input = parseConfirmStemUpload(await readStemJson(request), user.id);
    const serviceSupabase = createStemAdminClient();
    const expectedSource = buildStorageUri(input.path);

    const { data: existing, error: existingError } = await serviceSupabase
      .from('generations')
      .select('id,user_id,source_audio_url,status')
      .eq('id', input.generationId)
      .maybeSingle();

    if (existingError) {
      throw new Error(`generation collision check failed: ${existingError.message}`);
    }
    if (existing) {
      if (existing.user_id === user.id && existing.source_audio_url === expectedSource) {
        return NextResponse.json({
          success: true,
          generationId: existing.id,
          status: existing.status,
          message: '이미 접수된 동일한 Stem 작업입니다.',
        });
      }
      // 충돌 시 업로드 객체를 지우면 응답 유실 뒤 재확인 요청에서 정상 원본을
      // 손상할 수 있다. 보존한 채 명시적 정리 대상으로 남긴다.
      return NextResponse.json({ error: '이미 등록된 업로드 작업입니다.' }, { status: 409 });
    }

    const { data: session, error: sessionError } = await serviceSupabase
      .from('stem_upload_sessions')
      .select('id,user_id,storage_path,original_file_name,expected_size,expires_at,confirmed_at')
      .eq('id', input.generationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (sessionError) throw new Error(`upload session query failed: ${sessionError.message}`);
    if (!session) {
      return NextResponse.json({ error: '유효한 업로드 세션을 찾을 수 없습니다. 파일을 다시 업로드해 주세요.' }, { status: 409 });
    }
    if (
      session.storage_path !== input.path
      || session.original_file_name !== input.fileName
      || Number(session.expected_size) !== input.fileSize
    ) {
      return NextResponse.json({ error: '업로드 세션의 파일 정보가 일치하지 않습니다.' }, { status: 409 });
    }
    if (session.confirmed_at) {
      return NextResponse.json({ error: '이미 사용된 업로드 세션입니다.' }, { status: 409 });
    }
    if (Date.parse(session.expires_at) <= Date.now()) {
      await removeUnconfirmedUpload(serviceSupabase, session.id, user.id, session.storage_path);
      return NextResponse.json({ error: '업로드 세션이 만료되었습니다. 파일을 다시 업로드해 주세요.' }, { status: 410 });
    }

    await verifyPrivateStemObject(serviceSupabase, input.path, input.fileSize);

    const requestedAt = new Date().toISOString();
    const sourceStorageUri = expectedSource;
    const licenseHash = JSON.stringify({
      sourceMenu: 'stem-upload',
      isPublic: false,
      uploadedAt: requestedAt,
      originalFileName: input.fileName,
      fileSize: input.fileSize,
      storageBucket: PRIVATE_STEM_BUCKET,
      storagePath: input.path,
      stemStatus: 'pending',
      stemStage: 'queued',
      stemProgress: 0,
      stemRequestedAt: requestedAt,
    });

    // 세션 consume, 동시 작업 상한, queue row 생성은 사용자별 advisory lock
    // 아래 하나의 DB transaction에서 처리해 병렬 요청 TOCTOU를 차단한다.
    const { data: confirmed, error: dbError } = await serviceSupabase.rpc('confirm_stem_upload_session', {
      p_id: input.generationId,
      p_user_id: user.id,
      p_storage_path: input.path,
      p_original_file_name: input.fileName,
      p_expected_size: input.fileSize,
      p_title: input.title,
      p_source_uri: sourceStorageUri,
      p_requested_at: requestedAt,
      p_license_hash: licenseHash,
    });
    if (dbError) {
      if (dbError.message.includes('UPLOAD_ACTIVE_LIMIT')) {
        return NextResponse.json({
          error: '동시에 처리할 수 있는 Stem 작업은 최대 3개입니다. 기존 작업 완료 후 다시 시도해 주세요.',
        }, { status: 429 });
      }
      if (dbError.message.includes('UPLOAD_SESSION_EXPIRED')) {
        await removeUnconfirmedUpload(serviceSupabase, session.id, user.id, session.storage_path);
        return NextResponse.json({ error: '업로드 세션이 만료되었습니다. 파일을 다시 업로드해 주세요.' }, { status: 410 });
      }
      if (dbError.message.includes('STEM_OUTPUT_LIMIT')) {
        return NextResponse.json({
          error: 'Stem 보관 작업은 최대 10개입니다. Stem Studio에서 오래된 작업을 삭제한 뒤 다시 시도해 주세요.',
        }, { status: 413 });
      }
      if (/UPLOAD_(?:SESSION|GENERATION)/.test(dbError.message)) {
        return NextResponse.json({ error: '업로드 세션 상태가 변경되었습니다. 파일을 다시 업로드해 주세요.' }, { status: 409 });
      }
      throw new Error(`upload session confirmation failed: ${dbError.message}`);
    }

    const confirmedRecord = confirmed && typeof confirmed === 'object' && !Array.isArray(confirmed)
      ? confirmed as Record<string, unknown>
      : {};
    const generationId = typeof confirmedRecord.id === 'string' ? confirmedRecord.id : input.generationId;
    const generationStatus = typeof confirmedRecord.status === 'string' ? confirmedRecord.status : 'pending';

    return NextResponse.json({
      success: true,
      generationId,
      track: { id: generationId, status: generationStatus },
      message: '업로드 완료 및 4채널 스템 분리 큐에 정상 등록되었습니다.',
    });
  } catch (error) {
    const status = stemApiErrorStatus(error);
    if (status === 500) console.error('[API/confirm-and-split] 요청 실패:', error);
    return NextResponse.json({ error: stemApiErrorMessage(error) }, { status });
  }
}
