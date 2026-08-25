import { NextRequest, NextResponse } from 'next/server'
import {
  createStemAdminClient,
  parsePrivateStorageUri,
  parseStemUuid,
  readStemJson,
  requireStemUser,
  stemApiErrorMessage,
  stemApiErrorStatus,
  validateLegacyPublicStemUploadSource,
} from '@/lib/stems/stem-api'

export const dynamic = 'force-dynamic'

const STALE_PROCESSING_MS = 15 * 60 * 1000
const MAX_RETRY_COUNT = 3
const MAX_LEASE_CLAIMS = 16

type StemMetadata = Record<string, unknown>

function parseMetadata(value: unknown): StemMetadata {
  if (typeof value !== 'string' || !value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as StemMetadata
      : {}
  } catch {
    return {}
  }
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function progressValue(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(100, Math.max(0, Math.round(numeric)))
}

function resolveOwnedAudioReference(
  value: unknown,
  userId: string,
): string | null {
  const raw = optionalText(value)
  if (!raw) return null

  if (raw.startsWith('storage://')) {
    try {
      return parsePrivateStorageUri(raw, userId) ? raw : null
    } catch {
      return null
    }
  }

  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? raw : null
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const user = await requireStemUser()
    const admin = createStemAdminClient()
    const { data, error } = await admin
      .from('generations')
      .select('id,title,status,is_stem_extracted,created_at,license_hash,audio_url,source_audio_url,stem_vocals_url,stem_drums_url,stem_bass_url,stem_other_url,preview_vocals_url,preview_drums_url,preview_bass_url,preview_other_url')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw new Error(`Stem jobs query failed: ${error.message}`)

    const ownUploadRows = (data || []).filter((row) => {
      const metadata = parseMetadata(row.license_hash)
      return metadata.sourceMenu === 'stem-upload' || metadata.sourceMenu === 'custom-upload'
    })

    const jobs = ownUploadRows.map((row) => {
      const metadata = parseMetadata(row.license_hash)
      let canRetry = false
      const legacySource = optionalText(row.source_audio_url) || optionalText(row.audio_url)
      if (metadata.sourceMenu === 'stem-upload' && legacySource) {
        try {
          canRetry = legacySource.startsWith('storage://')
            ? Boolean(parsePrivateStorageUri(legacySource, user.id))
            : Boolean(validateLegacyPublicStemUploadSource(legacySource, row.id))
        } catch {
          canRetry = false
        }
      } else if (metadata.sourceMenu === 'custom-upload') {
        try {
          canRetry = Boolean(legacySource && validateLegacyPublicStemUploadSource(legacySource, row.id))
        } catch {
          canRetry = false
        }
      }
      const sourceUrl = resolveOwnedAudioReference(row.source_audio_url || row.audio_url, user.id)
      const vocals = resolveOwnedAudioReference(row.stem_vocals_url, user.id)
      const drums = resolveOwnedAudioReference(row.stem_drums_url, user.id)
      const bass = resolveOwnedAudioReference(row.stem_bass_url, user.id)
      const other = resolveOwnedAudioReference(row.stem_other_url, user.id)
      const previewVocals = resolveOwnedAudioReference(row.preview_vocals_url, user.id)
      const previewDrums = resolveOwnedAudioReference(row.preview_drums_url, user.id)
      const previewBass = resolveOwnedAudioReference(row.preview_bass_url, user.id)
      const previewOther = resolveOwnedAudioReference(row.preview_other_url, user.id)

      return {
        id: row.id,
        title: row.title,
        status: row.status,
        stemStatus: optionalText(metadata.stemStatus) || (row.is_stem_extracted ? 'completed' : row.status === 'completed' ? 'failed' : row.status),
        stage: optionalText(metadata.stemStage) || (row.is_stem_extracted ? 'completed' : 'queued'),
        progress: progressValue(metadata.stemProgress ?? (row.is_stem_extracted ? 100 : 0)),
        error: optionalText(metadata.stemError) || (row.status === 'completed' && !row.is_stem_extracted ? '완료된 스템 파일을 확인할 수 없습니다.' : null),
        createdAt: row.created_at,
        updatedAt: optionalText(
          metadata.stemHeartbeatAt
          ?? metadata.stemUpdatedAt
          ?? metadata.stemCompletedAt
          ?? metadata.stemRequestedAt,
        ) || row.created_at,
        isStemExtracted: Boolean(row.is_stem_extracted),
        canRetry,
        sourceUrl,
        previewUrls: {
          vocals: previewVocals,
          drums: previewDrums,
          bass: previewBass,
          other: previewOther,
        },
        originalUrls: { vocals, drums, bass, other },
      }
    })

    return NextResponse.json({ jobs })
  } catch (error) {
    const status = stemApiErrorStatus(error)
    if (status === 500) console.error('[API/stems/jobs] GET 실패:', error)
    return NextResponse.json({ error: stemApiErrorMessage(error) }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireStemUser()
    const body = await readStemJson(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '객체 형식의 요청이 필요합니다.' }, { status: 400 })
    }

    const input = body as Record<string, unknown>
    const generationId = parseStemUuid(input.generationId)
    if (input.action !== 'retry') {
      return NextResponse.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 })
    }

    const admin = createStemAdminClient()
    const { data: row, error } = await admin
      .from('generations')
      .select('id, user_id, status, created_at, audio_url, source_audio_url, license_hash, is_stem_extracted')
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single()

    if (error || !row) {
      return NextResponse.json({ error: '스템 작업을 찾을 수 없습니다.' }, { status: 404 })
    }

    const metadata = parseMetadata(row.license_hash)
    if (metadata.sourceMenu !== 'stem-upload' && metadata.sourceMenu !== 'custom-upload') {
      return NextResponse.json({ error: '외부 업로드 Stem 작업만 다시 시도할 수 있습니다.' }, { status: 409 })
    }

    const retrySource = optionalText(row.source_audio_url) || optionalText(row.audio_url)
    try {
      if (metadata.sourceMenu === 'stem-upload') {
        if (!retrySource) throw new Error('missing source')
        if (retrySource.startsWith('storage://')) {
          if (!parsePrivateStorageUri(retrySource, user.id)) throw new Error('invalid private source')
        } else if (!validateLegacyPublicStemUploadSource(retrySource, generationId)) {
          throw new Error('invalid migrated source')
        }
      } else if (!retrySource || !validateLegacyPublicStemUploadSource(retrySource, generationId)) {
        throw new Error('invalid legacy source')
      }
    } catch {
      return NextResponse.json({ error: '검증 가능한 원본 오디오 경로를 찾을 수 없습니다.' }, { status: 409 })
    }

    const stemStatus = optionalText(metadata.stemStatus)
      || (row.status === 'completed' && !row.is_stem_extracted ? 'failed' : row.status)
    const lastActivityText = optionalText(
      metadata.stemHeartbeatAt ?? metadata.stemStartedAt ?? metadata.stemRequestedAt,
    ) || row.created_at
    const lastActivity = Date.parse(lastActivityText)
    const isStaleProcessing = stemStatus === 'processing'
      && Number.isFinite(lastActivity)
      && Date.now() - lastActivity >= STALE_PROCESSING_MS
    const isFailed = stemStatus === 'failed' || row.status === 'failed'

    if (!isFailed && !isStaleProcessing) {
      return NextResponse.json({ error: '실패했거나 장시간 응답이 없는 작업만 다시 시도할 수 있습니다.' }, { status: 409 })
    }

    const retryCount = Number(metadata.stemRetryCount || 0)
    const processingAttempt = Number(metadata.stemAttempt || 0)
    const artifactAttemptCount = Array.isArray(metadata.stemArtifactAttempts)
      ? metadata.stemArtifactAttempts.length
      : 0
    const storedLeaseClaimCount = Number(metadata.stemLeaseClaimCount)
    const leaseClaimCount = Number.isFinite(storedLeaseClaimCount)
      ? Math.max(0, storedLeaseClaimCount)
      : artifactAttemptCount
    if (leaseClaimCount >= MAX_LEASE_CLAIMS) {
      return NextResponse.json({
        error: '반복된 시스템 중단으로 안전 복구 한도를 초과했습니다. 작업을 삭제한 뒤 다시 업로드해 주세요.',
      }, { status: 409 })
    }
    // A stale processing lease represents a worker/host interruption, not a
    // completed Demucs failure. Refund that in-flight claim before enforcing
    // the real processing-attempt limit.
    const effectiveProcessingAttempt = Number.isFinite(processingAttempt)
      ? Math.max(0, processingAttempt - (isStaleProcessing ? 1 : 0))
      : 0
    if (effectiveProcessingAttempt >= MAX_RETRY_COUNT) {
      return NextResponse.json({ error: '이 작업의 스템 분리 시도 횟수를 초과했습니다.' }, { status: 409 })
    }
    if (!isStaleProcessing && Number.isFinite(retryCount) && retryCount >= MAX_RETRY_COUNT) {
      return NextResponse.json({ error: '자동 다시 시도 횟수를 초과했습니다.' }, { status: 409 })
    }

    const requestedAt = new Date().toISOString()
    const nextMetadata: StemMetadata = {
      ...metadata,
      isPublic: false,
      stemStatus: 'pending',
      stemStage: 'queued',
      stemProgress: 0,
      stemRequestedAt: requestedAt,
      stemUpdatedAt: requestedAt,
      stemAttempt: effectiveProcessingAttempt,
      stemRetryCount: isStaleProcessing
        ? (Number.isFinite(retryCount) ? retryCount : 0)
        : (Number.isFinite(retryCount) ? retryCount + 1 : 1),
      ...(isStaleProcessing ? {
        stemInfrastructureRequeueCount: Math.max(0, Number(metadata.stemInfrastructureRequeueCount) || 0) + 1,
        stemRequeueReason: 'manual-stale-recovery',
      } : {}),
    }
    for (const key of ['stemError', 'stemErrorCode', 'stemHeartbeatAt', 'stemStartedAt', 'stemCompletedAt']) {
      delete nextMetadata[key]
    }

    const { data: updated, error: updateError } = await admin.rpc('queue_existing_stem_job', {
      p_id: generationId,
      p_user_id: user.id,
      p_expected_status: row.status,
      p_expected_license_hash: row.license_hash,
      p_next_status: 'pending',
      p_next_license_hash: JSON.stringify(nextMetadata),
      p_force_private: true,
    })

    if (updateError?.message.includes('STEM_ACTIVE_LIMIT')) {
      return NextResponse.json({ error: '동시에 처리할 수 있는 Stem 작업은 최대 3개입니다.' }, { status: 429 })
    }
    if (updateError?.message.includes('STEM_OUTPUT_LIMIT')) {
      return NextResponse.json({ error: 'Stem 보관 작업은 최대 10개입니다. 오래된 작업을 삭제한 뒤 다시 시도해 주세요.' }, { status: 413 })
    }
    if (updateError) throw new Error(`Stem retry update failed: ${updateError.message}`)
    if (!updated) {
      return NextResponse.json({ error: '작업 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.' }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      generationId,
      stemStatus: 'pending',
      stage: 'queued',
    })
  } catch (error) {
    const status = stemApiErrorStatus(error)
    if (status === 500) console.error('[API/stems/jobs] POST 실패:', error)
    return NextResponse.json({ error: stemApiErrorMessage(error) }, { status })
  }
}
