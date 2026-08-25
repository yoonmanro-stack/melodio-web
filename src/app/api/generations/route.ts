import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  PRIVATE_STEM_BUCKET,
  PRIVATE_STEM_OUTPUT_BUCKET,
  parsePrivateStorageUri,
  validateLegacyPublicStemUploadSource,
} from '@/lib/stems/stem-api'

export const dynamic = 'force-dynamic'

const UUID_PATH_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const GENERATION_ID_PATTERN = new RegExp(`^${UUID_PATH_SEGMENT}$`, 'i')
const MAX_GENERATION_TITLE_LENGTH = 200
const MAX_GENERATION_ASSET_URL_LENGTH = 2_048
const STEM_NAMES = ['vocals', 'drums', 'bass', 'other'] as const
const STEM_OUTPUT_FIELDS = [
  'stem_vocals_url',
  'stem_drums_url',
  'stem_bass_url',
  'stem_other_url',
  'preview_vocals_url',
  'preview_drums_url',
  'preview_bass_url',
  'preview_other_url',
] as const
const MAX_STEM_PRIVATE_SOURCE_PATHS = 11
const MAX_STEM_PRIVATE_OUTPUT_PATHS = 144
const MAX_STEM_PUBLIC_ASSET_PATHS = 145

type StemArtifactAttempt = {
  token: string
  storage: 'private' | 'public'
}

function parseUuidAttemptHistory(value: unknown): { attempts: string[]; malformed: boolean } {
  if (value === undefined || value === null) return { attempts: [], malformed: false }
  if (!Array.isArray(value)) return { attempts: [], malformed: true }

  const attempts: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || !GENERATION_ID_PATTERN.test(entry)) {
      return { attempts: [], malformed: true }
    }
    attempts.push(entry)
  }

  return { attempts: [...new Set(attempts)], malformed: false }
}

function parseStemArtifactAttemptHistory(
  value: unknown,
  fallbackStorage: 'private' | 'public' | null,
): { attempts: StemArtifactAttempt[]; malformed: boolean } {
  if (value === undefined || value === null) return { attempts: [], malformed: false }
  if (!Array.isArray(value)) return { attempts: [], malformed: true }

  const attempts: StemArtifactAttempt[] = []
  for (const entry of value) {
    if (typeof entry === 'string' && GENERATION_ID_PATTERN.test(entry)) {
      if (!fallbackStorage) return { attempts: [], malformed: true }
      attempts.push({ token: entry, storage: fallbackStorage })
      continue
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { attempts: [], malformed: true }
    }
    const record = entry as Record<string, unknown>
    if (
      typeof record.token !== 'string'
      || !GENERATION_ID_PATTERN.test(record.token)
      || (record.storage !== 'private' && record.storage !== 'public')
    ) {
      return { attempts: [], malformed: true }
    }
    attempts.push({ token: record.token, storage: record.storage })
  }

  return {
    attempts: [...new Map(
      attempts.map((attempt) => [`${attempt.storage}:${attempt.token}`, attempt]),
    ).values()],
    malformed: false,
  }
}

function isHttpAssetUrl(value: string): boolean {
  if (value.length > MAX_GENERATION_ASSET_URL_LENGTH) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function validatedPublicStemObjectPath(value: unknown, generationId: string): string | null {
  if (typeof value !== 'string' || !value) return null
  const attempt = `(?:${UUID_PATH_SEGMENT}/)?`
  const stem = '(?:vocals|drums|bass|other)'
  const pattern = new RegExp(`^stems/${generationId}/${attempt}(?:original/${stem}\\.wav|preview/${stem}\\.m4a)$`, 'i')
  return pattern.test(value) ? value : null
}

function validatedPublicStemPath(value: unknown, generationId: string, supabaseUrl: string): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    if (url.origin !== new URL(supabaseUrl).origin || url.username || url.password || url.search || url.hash) return null
    const marker = '/storage/v1/object/public/melodio-assets/'
    const decodedPath = decodeURIComponent(url.pathname)
    if (!decodedPath.startsWith(marker)) return null
    return validatedPublicStemObjectPath(decodedPath.slice(marker.length), generationId)
  } catch {
    return null
  }
}

function validatedPrivateStemOutputPath(value: unknown, userId: string, generationId: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('storage://')) return null
  try {
    const parsed = parsePrivateStorageUri(value, userId)
    if (parsed?.bucket !== PRIVATE_STEM_OUTPUT_BUCKET) return null
    const attempt = `(?:${UUID_PATH_SEGMENT}/)?`
    const stem = '(?:vocals|drums|bass|other)'
    const pattern = new RegExp(`^stems/${userId}/${generationId}/${attempt}(?:original/${stem}\\.wav|preview/${stem}\\.m4a)$`, 'i')
    return pattern.test(parsed.path) ? parsed.path : null
  } catch {
    return null
  }
}

function stripPrivateStemReferences(record: Record<string, unknown>): void {
  for (const field of STEM_OUTPUT_FIELDS) {
    if (typeof record[field] === 'string' && record[field].startsWith('storage://')) {
      record[field] = null
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const scope = searchParams.get('scope') === 'dashboard' ? 'dashboard' : 'public'

    // 현재 세션의 user_id 파악
    let loggedInUserId: string | null = null
    try {
      const supabase = await createServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        loggedInUserId = user.id
      }
    } catch {
      // ignore
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('[API/generations] Supabase 환경 변수 누락')
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 })
    }

    // Service Role 클라이언트를 사용하여 RLS 정책 우회
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    if (id) {
      const { data, error } = await serviceSupabase
        .from('generations')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('[API/generations] SELECT 단건 에러:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const ownerUserId = data?.user_id || null
      const isOwner = Boolean(data && loggedInUserId && ownerUserId === loggedInUserId)
      let metadataPublic = true
      if (data?.license_hash) {
        try { metadataPublic = JSON.parse(data.license_hash).isPublic !== false } catch {}
      }
      const isPrivate = data?.is_public === false || data?.metadata?.isPublic === false || !metadataPublic

      // 비공개 업로드·생성물은 ID를 알아도 소유자 외에는 조회할 수 없다.
      if (data && !isOwner && isPrivate) {
        return NextResponse.json({ error: '음원을 찾을 수 없습니다.' }, { status: 404 })
      }

      // 공개 음원도 소유자가 아니면 개인 식별 필드를 마스킹한다.
      if (data && !isOwner) {
        stripPrivateStemReferences(data)
        delete data.user_id
        delete data.email
        delete data.user_email
      }

      // Sibling (서브 보컬 버전 2) 자동 검색
      let sibling = null
      try {
        const primaryTitle = data.title;
        if (primaryTitle && !primaryTitle.endsWith(' (2)')) {
          const siblingTitle = `${primaryTitle} (2)`
          const createdTime = new Date(data.created_at)
          const minTime = new Date(createdTime.getTime() - 3 * 60 * 1000).toISOString()
          const maxTime = new Date(createdTime.getTime() + 3 * 60 * 1000).toISOString()
          
          let query = serviceSupabase
            .from('generations')
            .select('*')
            .eq('title', siblingTitle)
            .gte('created_at', minTime)
            .lte('created_at', maxTime)

          // 기존 RLS 우회 데이터의 소유자 매핑 유지
          const checkUserId = ownerUserId
          if (checkUserId) {
            query = query.eq('user_id', checkUserId)
          } else {
            query = query.is('user_id', null)
          }
          
          const { data: siblings } = await query.limit(1)
          if (siblings && siblings.length > 0) {
            sibling = siblings[0]
            const siblingIsOwner = Boolean(loggedInUserId && sibling.user_id === loggedInUserId)
            let siblingMetadataPublic = true
            if (sibling.license_hash) {
              try { siblingMetadataPublic = JSON.parse(sibling.license_hash).isPublic !== false } catch {}
            }
            const siblingIsPrivate = sibling.is_public === false || sibling.metadata?.isPublic === false || !siblingMetadataPublic
            if (!siblingIsOwner && siblingIsPrivate) {
              sibling = null
            } else if (!siblingIsOwner) {
              stripPrivateStemReferences(sibling)
              delete sibling.user_id
              delete sibling.email
              delete sibling.user_email
            }
          }
        }
      } catch (sibErr: unknown) {
        console.warn(
          '[API/generations] Sibling search warning:',
          sibErr instanceof Error ? sibErr.message : 'Unknown sibling lookup error',
        )
      }

      return NextResponse.json({ generation: data, sibling })
    }

    if (scope === 'dashboard' && !loggedInUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    let listQuery = serviceSupabase
      .from('generations')
      .select('*')
      .order('created_at', { ascending: false })
    if (scope === 'dashboard') listQuery = listQuery.eq('user_id', loggedInUserId)
    const { data, error } = await listQuery

    if (error) {
      console.error('[API/generations] SELECT 에러:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const filtered = (data || [])
      .filter(item => !item.title?.includes('VoiceDNA Demo'))
      .filter(item => {
        // Dashboard는 소유자의 모든 작업을 보존한다. 공개 여부는 공개 목록에만 적용한다.
        if (scope === 'dashboard') return true
        let metaPublic = true
        if (item.license_hash) {
          try { metaPublic = JSON.parse(item.license_hash).isPublic !== false } catch {}
        }
        const isPrivate = item.is_public === false || item.metadata?.isPublic === false || !metaPublic;
        return !isPrivate
      })
      .map(item => {
        if (scope === 'public') {
          const rest = { ...item }
          delete rest.user_id
          delete rest.email
          delete rest.user_email
          stripPrivateStemReferences(rest)
          return rest
        }
        return item
      })
    return NextResponse.json({ generations: filtered })
  } catch (err) {
    console.error('[API/generations] 예외 발생:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id || !GENERATION_ID_PATTERN.test(id)) {
      return NextResponse.json({ error: '올바른 id가 필요합니다' }, { status: 400 })
    }

    // 1. 사용자 인증 확인
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('[API/generations] Supabase 환경 변수 누락')
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 })
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // 2. 음원 소유권 확인
    const { data: existing } = await serviceSupabase
      .from('generations')
      .select('user_id,status,license_hash,audio_url,source_audio_url,stem_vocals_url,stem_drums_url,stem_bass_url,stem_other_url,preview_vocals_url,preview_drums_url,preview_bass_url,preview_other_url')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: '권한이 없습니다 (소유자가 아님)' }, { status: 403 })
    }

    let metadata: Record<string, unknown> = {}
    if (typeof existing.license_hash === 'string' && existing.license_hash) {
      try {
        const parsed: unknown = JSON.parse(existing.license_hash)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          metadata = parsed as Record<string, unknown>
        }
      } catch {
        // Legacy metadata does not participate in Stem lease checks.
      }
    }

    const sourceMenu = metadata.sourceMenu
    const isExternalStemUpload = sourceMenu === 'stem-upload' || sourceMenu === 'custom-upload'
    const stemStatus = String(metadata.stemStatus || (isExternalStemUpload ? existing.status : '')).toLowerCase()
    if (stemStatus === 'pending' || stemStatus === 'processing' || stemStatus === 'cleanup') {
      return NextResponse.json({
        error: 'Stem 분리가 진행 중인 작업은 삭제할 수 없습니다. 완료 또는 실패 후 다시 시도해 주세요.',
      }, { status: 409 })
    }
    if (metadata.stemLegacyBackfillStatus === 'processing') {
      return NextResponse.json({
        error: '기존 Stem 파일을 안전한 저장소로 이전 중입니다. 잠시 후 다시 시도해 주세요.',
      }, { status: 409 })
    }
    if (metadata.stemLegacyOutputBackfillStatus === 'processing') {
      return NextResponse.json({
        error: '기존 공개 Stem 파일을 비공개 저장소로 이전 중입니다. 잠시 후 다시 시도해 주세요.',
      }, { status: 409 })
    }

    const privateSourcePaths = new Set<string>()
    const sourceReference = typeof existing.source_audio_url === 'string' && existing.source_audio_url
      ? existing.source_audio_url
      : isExternalStemUpload && typeof existing.audio_url === 'string'
        ? existing.audio_url
        : ''
    if (sourceReference.startsWith('storage://')) {
      try {
        const parsed = parsePrivateStorageUri(sourceReference, user.id)
        const sourcePattern = new RegExp(
          `^uploads/${user.id}/${id}(?:/${UUID_PATH_SEGMENT})?\\.(?:mp3|wav|m4a|aac|ogg|flac)$`,
          'i',
        )
        if (parsed?.bucket === PRIVATE_STEM_BUCKET && sourcePattern.test(parsed.path)) {
          privateSourcePaths.add(parsed.path)
        }
      } catch {
        // Never delete a private object that does not exactly match this row.
      }
    }

    const parsedLegacyBackfillAttempts = parseUuidAttemptHistory(metadata.stemLegacyBackfillAttempts)
    if (parsedLegacyBackfillAttempts.malformed) {
      return NextResponse.json({ error: 'Stem 원본 정리 이력이 손상되어 자동 삭제를 중단했습니다.' }, { status: 409 })
    }
    const legacyBackfillAttempts = parsedLegacyBackfillAttempts.attempts
    if (legacyBackfillAttempts.length > 10) {
      return NextResponse.json({ error: 'Stem 원본 정리 이력이 안전 한도를 초과했습니다.' }, { status: 409 })
    }
    const legacyBackfillExtension = typeof metadata.stemLegacyBackfillSourceExtension === 'string'
      ? metadata.stemLegacyBackfillSourceExtension.toLowerCase()
      : ''
    if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(legacyBackfillExtension)) {
      for (const attempt of legacyBackfillAttempts) {
        privateSourcePaths.add(`uploads/${user.id}/${id}/${attempt}.${legacyBackfillExtension}`)
      }
    }

    const privateOutputPaths = new Set(STEM_NAMES.flatMap((stem) => [
      `stems/${user.id}/${id}/original/${stem}.wav`,
      `stems/${user.id}/${id}/preview/${stem}.m4a`,
    ]))
    const publicOutputPaths = new Set(STEM_NAMES.flatMap((stem) => [
      `stems/${id}/original/${stem}.wav`,
      `stems/${id}/preview/${stem}.m4a`,
    ]))
    const parsedArtifactAttempts = parseStemArtifactAttemptHistory(
      metadata.stemArtifactAttempts,
      metadata.stemArtifactStorage === 'public' || metadata.stemArtifactStorage === 'private'
        ? metadata.stemArtifactStorage
        : null,
    )
    if (parsedArtifactAttempts.malformed) {
      return NextResponse.json({ error: 'Stem 결과 정리 이력이 손상되어 자동 삭제를 중단했습니다.' }, { status: 409 })
    }
    const uniqueArtifactAttempts = parsedArtifactAttempts.attempts
    if (uniqueArtifactAttempts.length > 16) {
      return NextResponse.json({ error: 'Stem 결과 정리 이력이 안전 한도를 초과했습니다.' }, { status: 409 })
    }
    for (const attempt of uniqueArtifactAttempts) {
      const target = attempt.storage === 'private' ? privateOutputPaths : publicOutputPaths
      for (const stem of STEM_NAMES) {
        if (target === privateOutputPaths) {
          target.add(`stems/${user.id}/${id}/${attempt.token}/original/${stem}.wav`)
          target.add(`stems/${user.id}/${id}/${attempt.token}/preview/${stem}.m4a`)
        } else {
          target.add(`stems/${id}/${attempt.token}/original/${stem}.wav`)
          target.add(`stems/${id}/${attempt.token}/preview/${stem}.m4a`)
        }
      }
    }

    const parsedLegacyOutputAttempts = parseUuidAttemptHistory(metadata.stemLegacyOutputBackfillAttempts)
    if (parsedLegacyOutputAttempts.malformed) {
      return NextResponse.json({ error: '기존 Stem 결과 이전 이력이 손상되어 자동 삭제를 중단했습니다.' }, { status: 409 })
    }
    const legacyOutputBackfillAttempts = parsedLegacyOutputAttempts.attempts
    if (legacyOutputBackfillAttempts.length > 10) {
      return NextResponse.json({ error: '기존 Stem 결과 이전 이력이 안전 한도를 초과했습니다.' }, { status: 409 })
    }
    for (const token of legacyOutputBackfillAttempts) {
      for (const stem of STEM_NAMES) {
        privateOutputPaths.add(`stems/${user.id}/${id}/${token}/original/${stem}.wav`)
        privateOutputPaths.add(`stems/${user.id}/${id}/${token}/preview/${stem}.m4a`)
      }
    }

    const persistedPublicObjectPaths = metadata.stemLegacyOutputPublicObjectPaths
    if (persistedPublicObjectPaths !== undefined && persistedPublicObjectPaths !== null) {
      if (!Array.isArray(persistedPublicObjectPaths)) {
        return NextResponse.json({ error: '기존 공개 Stem 정리 목록이 손상되어 자동 삭제를 중단했습니다.' }, { status: 409 })
      }
      for (const value of persistedPublicObjectPaths) {
        const exactPath = validatedPublicStemObjectPath(value, id)
        if (!exactPath) {
          return NextResponse.json({ error: '기존 공개 Stem 정리 경로가 유효하지 않아 자동 삭제를 중단했습니다.' }, { status: 409 })
        }
        publicOutputPaths.add(exactPath)
      }
    }

    const outputReferences = [
      existing.stem_vocals_url,
      existing.stem_drums_url,
      existing.stem_bass_url,
      existing.stem_other_url,
      existing.preview_vocals_url,
      existing.preview_drums_url,
      existing.preview_bass_url,
      existing.preview_other_url,
    ]
    for (const reference of outputReferences) {
      const privatePath = validatedPrivateStemOutputPath(reference, user.id, id)
      if (privatePath) privateOutputPaths.add(privatePath)
      const publicPath = validatedPublicStemPath(reference, id, supabaseUrl)
      if (publicPath) publicOutputPaths.add(publicPath)
    }
    const publicSourcePaths: string[] = []
    if (isExternalStemUpload && sourceReference && !sourceReference.startsWith('storage://')) {
      try {
        const legacyUrl = validateLegacyPublicStemUploadSource(sourceReference, id)
        const decodedPath = decodeURIComponent(legacyUrl.pathname)
        const marker = '/storage/v1/object/public/melodio-assets/'
        if (decodedPath.startsWith(marker)) {
          const publicPath = decodedPath.slice(marker.length)
          publicSourcePaths.push(publicPath)
          const extension = publicPath.split('.').pop()?.toLowerCase()
          if (extension && ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(extension)) {
            // A failed legacy migration may have copied the source before the DB
            // was switched from the public URL to its deterministic private URI.
            privateSourcePaths.add(`uploads/${user.id}/${id}.${extension}`)
          }
        }
      } catch {
        // Provider URLs and non-exact legacy paths are never removed.
      }
    }

    if (
      privateSourcePaths.size > MAX_STEM_PRIVATE_SOURCE_PATHS
      || privateOutputPaths.size > MAX_STEM_PRIVATE_OUTPUT_PATHS
      || publicOutputPaths.size + publicSourcePaths.length > MAX_STEM_PUBLIC_ASSET_PATHS
    ) {
      return NextResponse.json({
        error: 'Stem 저장소 정리 목록이 안전 한도를 초과했습니다. 관리자 점검이 필요합니다.',
      }, { status: 409 })
    }

    const cleanupManifest = {
      privateSource: [...privateSourcePaths],
      privateOutputs: [...privateOutputPaths],
      publicAssets: [...publicSourcePaths, ...publicOutputPaths],
    }

    const requiresSafetyRecheck = isExternalStemUpload
      || privateSourcePaths.size > 0
      || uniqueArtifactAttempts.length > 0
      || legacyBackfillAttempts.length > 0
      || legacyOutputBackfillAttempts.length > 0
    // Insert the durable cleanup task in a future-due state in the same
    // transaction as the generation deletion. This prevents the worker from
    // consuming the task while this request is still doing immediate cleanup.
    const cleanupNotBefore = new Date(Date.now() + 30 * 60 * 1000).toISOString()

    // Generation deletion and its exact Storage cleanup manifest are committed
    // atomically. If immediate Storage cleanup fails, the worker retries the
    // durable outbox task instead of leaving an untraceable orphan.
    const { data: deleted, error: deleteError } = await serviceSupabase.rpc('delete_generation_with_stem_cleanup', {
      p_id: id,
      p_user_id: user.id,
      p_expected_status: existing.status,
      p_expected_license_hash: existing.license_hash,
      p_cleanup_manifest: cleanupManifest,
      p_cleanup_not_before: cleanupNotBefore,
    })
    if (deleteError) {
      console.error('[API/generations] DELETE transaction 에러:', deleteError.message)
      return NextResponse.json({ error: '음원 삭제 준비에 실패했습니다.' }, { status: 500 })
    }
    if (!deleted) {
      return NextResponse.json({ error: '음원 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.' }, { status: 409 })
    }

    const cleanupFailures: string[] = []
    const cleanupStorage = async (bucket: string, paths: string[]) => {
      if (paths.length === 0) return
      for (let offset = 0; offset < paths.length; offset += 100) {
        const { error: cleanupError } = await serviceSupabase.storage
          .from(bucket)
          .remove(paths.slice(offset, offset + 100))
        if (cleanupError) {
          cleanupFailures.push(`${bucket}: ${cleanupError.message}`)
          return
        }
      }
    }
    await Promise.all([
      cleanupStorage(PRIVATE_STEM_BUCKET, [...privateSourcePaths]),
      cleanupStorage(PRIVATE_STEM_OUTPUT_BUCKET, [...privateOutputPaths]),
      cleanupStorage('melodio-assets', [...publicSourcePaths, ...publicOutputPaths]),
    ])
    if (cleanupFailures.length > 0) {
      console.error('[API/generations] DELETE 후 즉시 Stem 객체 정리 일부 실패:', cleanupFailures)
      const nextAttemptAt = requiresSafetyRecheck ? undefined : new Date().toISOString()
      const { data: updatedTasks, error: outboxUpdateError } = await serviceSupabase
        .from('stem_storage_cleanup_tasks')
        .update({
          attempts: 1,
          last_error: cleanupFailures.join(' | ').slice(0, 500),
          ...(nextAttemptAt ? { next_attempt_at: nextAttemptAt } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('generation_id', id)
        .select('generation_id')
      if (outboxUpdateError || updatedTasks?.length !== 1) {
        console.error(
          '[API/generations] cleanup outbox 오류 기록 실패:',
          outboxUpdateError?.message ?? 'cleanup task not found',
        )
      }
      return NextResponse.json({ success: true, cleanupPending: true })
    }

    if (requiresSafetyRecheck) {
      // A timed-out Storage request can finish after the HTTP client aborts.
      // The deletion RPC already scheduled the durable task atomically, so the
      // worker repeats these exact removals after all known timeouts elapsed.
      return NextResponse.json({ success: true, cleanupSafetyRecheck: true })
    }

    const { error: outboxDeleteError } = await serviceSupabase
      .from('stem_storage_cleanup_tasks')
      .delete()
      .eq('generation_id', id)
    if (outboxDeleteError) {
      // Safe to leave: worker will repeat idempotent exact removals and delete it.
      console.error('[API/generations] cleanup outbox 완료 삭제 실패:', outboxDeleteError.message)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API/generations] DELETE 예외 발생:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '올바른 요청 본문이 필요합니다' }, { status: 400 })
    }

    const {
      id,
      title,
      is_liked,
      cover_art_url,
      is_public,
      video_url,
    } = body as Record<string, unknown>

    if (typeof id !== 'string' || !GENERATION_ID_PATTERN.test(id)) {
      return NextResponse.json({ error: '올바른 id가 필요합니다' }, { status: 400 })
    }

    const suppliedFields = [title, is_liked, cover_art_url, is_public, video_url]
    if (suppliedFields.every((value) => value === undefined)) {
      return NextResponse.json({ error: '변경할 항목이 필요합니다' }, { status: 400 })
    }
    if (title !== undefined && (
      typeof title !== 'string'
      || !title.trim()
      || title.trim().length > MAX_GENERATION_TITLE_LENGTH
      || /[\u0000-\u001f\u007f]/.test(title)
    )) {
      return NextResponse.json({ error: '제목은 1~200자의 문자열이어야 합니다' }, { status: 400 })
    }
    if (is_liked !== undefined && typeof is_liked !== 'boolean') {
      return NextResponse.json({ error: 'is_liked는 boolean이어야 합니다' }, { status: 400 })
    }
    if (is_public !== undefined && typeof is_public !== 'boolean') {
      return NextResponse.json({ error: 'is_public은 boolean이어야 합니다' }, { status: 400 })
    }
    if (cover_art_url !== undefined && cover_art_url !== null && (
      typeof cover_art_url !== 'string' || !isHttpAssetUrl(cover_art_url)
    )) {
      return NextResponse.json({ error: 'cover_art_url은 올바른 HTTPS URL이어야 합니다' }, { status: 400 })
    }
    if (video_url !== undefined && video_url !== null && (
      typeof video_url !== 'string' || !isHttpAssetUrl(video_url)
    )) {
      return NextResponse.json({ error: 'video_url은 올바른 HTTPS URL이어야 합니다' }, { status: 400 })
    }

    // 1. 사용자 인증 확인
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('[API/generations] Supabase 환경 변수 누락')
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 })
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // 2. 음원 소유권 확인
    const { data: existing } = await serviceSupabase
      .from('generations')
      .select('user_id')
      .eq('id', id)
      .single()

    if (!existing || existing.user_id !== user.id) {
      return NextResponse.json({ error: '권한이 없습니다 (소유자가 아님)' }, { status: 403 })
    }

    if (is_public !== undefined) {
      const { data: managedCandidate } = await serviceSupabase
        .from('generation_queue_candidates')
        .select('id,queue_item_id')
        .eq('generation_id', id)
        .maybeSingle()
      if (managedCandidate) {
        const { data: queueItem } = await serviceSupabase
          .from('generation_queue_items')
          .select('selected_candidate_id')
          .eq('id', managedCandidate.queue_item_id)
          .single()
        const canonicalPublic = queueItem?.selected_candidate_id === managedCandidate.id
        if (Boolean(is_public) !== canonicalPublic) {
          return NextResponse.json({
            error: 'Channel Builder A/B 공개 상태는 Generation Console의 Master 선택으로만 변경할 수 있습니다.',
          }, { status: 409 })
        }
      }
    }

    const updatePayload: Record<string, string | boolean | null> = {}
    if (typeof title === 'string') updatePayload.title = title.trim()
    if (is_liked !== undefined) updatePayload.is_liked = is_liked
    if (cover_art_url !== undefined) updatePayload.cover_art_url = cover_art_url
    if (is_public !== undefined) updatePayload.is_public = is_public

    if (is_public !== undefined || video_url !== undefined) {
      // license_hash also carries the Stem worker lease, artifact manifest and
      // attempt counters. Merge with an exact old-value CAS so a public/video
      // PATCH can never overwrite a worker update that committed in between.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { data: currentGen, error: currentError } = await serviceSupabase
          .from('generations')
          .select('user_id,license_hash,is_public,is_stem_extracted,stem_vocals_url,stem_drums_url,stem_bass_url,stem_other_url,preview_vocals_url,preview_drums_url,preview_bass_url,preview_other_url')
          .eq('id', id)
          .maybeSingle()
        if (currentError) {
          console.error('[API/generations] PATCH metadata 조회 에러:', currentError.message)
          return NextResponse.json({ error: '음원 메타데이터 조회에 실패했습니다.' }, { status: 500 })
        }
        if (!currentGen || currentGen.user_id !== user.id) {
          return NextResponse.json({ error: '음원 상태가 변경되었거나 삭제되었습니다.' }, { status: 409 })
        }

        let meta: Record<string, unknown> = {}
        if (currentGen.license_hash) {
          try {
            const parsed: unknown = JSON.parse(currentGen.license_hash)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              meta = parsed as Record<string, unknown>
            }
          } catch {
            // Preserve compatibility with old non-JSON license values while
            // keeping all new mutable metadata inside a JSON object.
            meta = { legacyLicenseHash: currentGen.license_hash }
          }
        }

        if (
          is_public === true
          && (meta.sourceMenu === 'stem-upload' || meta.sourceMenu === 'custom-upload')
        ) {
          return NextResponse.json({
            error: '업로드한 Stem 원본과 분리 결과는 비공개로만 보관됩니다.',
          }, { status: 409 })
        }
        if (is_public !== undefined && is_public !== currentGen.is_public) {
          const stemStatus = typeof meta.stemStatus === 'string' ? meta.stemStatus : ''
          if (stemStatus === 'pending' || stemStatus === 'processing' || stemStatus === 'cleanup') {
            return NextResponse.json({
              error: 'Stem 분리가 진행 중일 때는 공개 상태를 변경할 수 없습니다.',
            }, { status: 409 })
          }
          if (meta.stemLegacyOutputBackfillStatus === 'processing') {
            return NextResponse.json({
              error: '기존 공개 Stem 파일을 비공개 저장소로 이전 중에는 공개 상태를 변경할 수 없습니다.',
            }, { status: 409 })
          }

          const stemReferences = [
            currentGen.stem_vocals_url,
            currentGen.stem_drums_url,
            currentGen.stem_bass_url,
            currentGen.stem_other_url,
            currentGen.preview_vocals_url,
            currentGen.preview_drums_url,
            currentGen.preview_bass_url,
            currentGen.preview_other_url,
          ]
          const hasPublicArtifactAttempt = Array.isArray(meta.stemArtifactAttempts)
            && meta.stemArtifactAttempts.some((value) => {
              if (typeof value === 'string') return meta.stemArtifactStorage === 'public'
              if (!value || typeof value !== 'object' || Array.isArray(value)) return false
              return (value as Record<string, unknown>).storage === 'public'
            })
          const hasPendingLegacyOutputCleanup = meta.stemLegacyOutputPublicArtifactsCleanup === 'pending'
            || meta.stemLegacyOutputPublicArtifactsCleanup === 'failed'
          const hasLegacyPublicStemArtifacts = hasPublicArtifactAttempt || hasPendingLegacyOutputCleanup || (
            currentGen.is_stem_extracted === true
            && (
              meta.stemArtifactStorage === 'public'
              || stemReferences.some((value) => (
                typeof value === 'string'
                && value.includes('/storage/v1/object/public/melodio-assets/stems/')
              ))
            )
          )
          if (is_public === false && hasLegacyPublicStemArtifacts) {
            return NextResponse.json({
              error: '기존 공개 Stem 파일의 비공개 이전이 필요해 현재 공개 해제를 진행할 수 없습니다.',
            }, { status: 409 })
          }
        }
        if (is_public !== undefined) meta.isPublic = is_public
        if (video_url !== undefined) meta.video_url = video_url

        const payload = { ...updatePayload, license_hash: JSON.stringify(meta) }
        let updateQuery = serviceSupabase
          .from('generations')
          .update(payload)
          .eq('id', id)
          .eq('user_id', user.id)
        updateQuery = currentGen.license_hash === null
          ? updateQuery.is('license_hash', null)
          : updateQuery.eq('license_hash', currentGen.license_hash)
        const { data: updated, error: updateError } = await updateQuery.select('id')
        if (updateError) {
          console.error('[API/generations] PATCH metadata 에러:', updateError.message)
          return NextResponse.json({ error: updateError.message }, { status: 500 })
        }
        if (updated?.length === 1) return NextResponse.json({ success: true })
      }

      return NextResponse.json({
        error: '음원 처리 상태가 계속 변경되고 있습니다. 잠시 후 다시 시도해 주세요.',
      }, { status: 409 })
    }

    const { data: updated, error } = await serviceSupabase
      .from('generations')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')

    if (error) {
      console.error('[API/generations] PATCH 에러:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (updated?.length !== 1) {
      return NextResponse.json({ error: '음원 상태가 변경되었거나 삭제되었습니다.' }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API/generations] PATCH 예외 발생:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
