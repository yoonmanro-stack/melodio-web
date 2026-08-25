import { NextRequest, NextResponse } from 'next/server';
import {
  createStemAdminClient,
  parsePrivateStorageUri,
  parseStemUuid,
  readStemJson,
  requireStemUser,
  stemApiErrorMessage,
  stemApiErrorStatus,
  validateTrustedStemSourceUrl,
} from '@/lib/stems/stem-api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await requireStemUser();
    const body = await readStemJson(request);
    const generationId = parseStemUuid(
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).generationId
        : undefined,
    );
    const serviceSupabase = createStemAdminClient();

    // 1. 해당 곡 확인
    const { data: track, error: fetchErr } = await serviceSupabase
      .from('generations')
      .select('id, title, audio_url, source_audio_url, status, license_hash, is_stem_extracted')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !track) {
      return NextResponse.json({ error: '음원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const sourceUrl = track.audio_url || track.source_audio_url;
    if (!sourceUrl) {
      return NextResponse.json({ error: '분리할 오디오 원본 URL이 존재하지 않습니다.' }, { status: 400 });
    }
    if (track.status !== 'completed') {
      return NextResponse.json({ error: '완료된 본인 소유 음원만 스템 분리를 요청할 수 있습니다.' }, { status: 409 });
    }

    if (sourceUrl.startsWith('storage://')) {
      parsePrivateStorageUri(sourceUrl, user.id);
    } else {
      validateTrustedStemSourceUrl(sourceUrl);
    }

    let metadata: Record<string, unknown> = {};
    if (track.license_hash) {
      try {
        const parsed = JSON.parse(track.license_hash);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed;
      } catch {
        // Legacy metadata may not be JSON. Preserve the raw value without trusting it.
        metadata = { legacyLicenseHash: track.license_hash };
      }
    }

    if (
      metadata.stemStatus === 'pending'
      || metadata.stemStatus === 'processing'
      || metadata.stemStatus === 'cleanup'
    ) {
      return NextResponse.json({ error: '이미 스템 분리 작업이 진행 중입니다.' }, { status: 409 });
    }
    if (track.is_stem_extracted || metadata.stemStatus === 'completed') {
      return NextResponse.json({ error: '이미 스템 분리가 완료된 곡입니다.' }, { status: 409 });
    }

    const stemAttempt = Number(metadata.stemAttempt || 0);
    if (Number.isFinite(stemAttempt) && stemAttempt >= 3) {
      return NextResponse.json({ error: '이 곡의 스템 분리 시도 횟수를 초과했습니다.' }, { status: 429 });
    }
    const artifactAttemptCount = Array.isArray(metadata.stemArtifactAttempts)
      ? metadata.stemArtifactAttempts.length
      : 0;
    const storedLeaseClaimCount = Number(metadata.stemLeaseClaimCount);
    const leaseClaimCount = Number.isFinite(storedLeaseClaimCount)
      ? Math.max(0, storedLeaseClaimCount)
      : artifactAttemptCount;
    if (leaseClaimCount >= 16) {
      return NextResponse.json({
        error: '반복된 시스템 중단으로 스템 안전 복구 한도를 초과했습니다.',
      }, { status: 409 });
    }

    const requestedAt = new Date().toISOString();
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      stemStatus: 'pending',
      stemStage: 'queued',
      stemProgress: 0,
      stemRequestedAt: requestedAt,
    };
    delete nextMetadata.stemError;
    delete nextMetadata.stemErrorCode;

    // 사용자별 동시 작업/보관 한도와 CAS 갱신을 하나의 DB transaction으로 처리한다.
    const { data: updated, error: updateErr } = await serviceSupabase.rpc('queue_existing_stem_job', {
      p_id: generationId,
      p_user_id: user.id,
      p_expected_status: track.status,
      p_expected_license_hash: track.license_hash,
      p_next_status: track.status,
      p_next_license_hash: JSON.stringify(nextMetadata),
      p_force_private: false,
    });

    if (updateErr) {
      if (updateErr.message.includes('STEM_ACTIVE_LIMIT')) {
        return NextResponse.json({ error: '동시에 처리할 수 있는 Stem 작업은 최대 3개입니다.' }, { status: 429 });
      }
      if (updateErr.message.includes('STEM_OUTPUT_LIMIT')) {
        return NextResponse.json({ error: 'Stem 보관 작업은 최대 10개입니다. 오래된 작업을 삭제한 뒤 다시 시도해 주세요.' }, { status: 413 });
      }
      console.error('[API/split-stems] UPDATE 에러:', updateErr.message);
      return NextResponse.json({ error: '스템 분리 요청 저장에 실패했습니다.' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: '곡 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.' }, { status: 409 });
    }

    console.log(`[API/split-stems] 스템 분리 큐 등록 성공: ${generationId} (${track.title})`);
    return NextResponse.json({
      success: true,
      message: '스템 분리 작업이 성공적으로 시작되었습니다.',
      generationId,
    });
  } catch (error) {
    const status = stemApiErrorStatus(error);
    if (status === 500) console.error('[API/split-stems] 요청 실패:', error);
    return NextResponse.json({ error: stemApiErrorMessage(error) }, { status });
  }
}
