import { supabase } from '@/lib/supabase'

const STORAGE_URI_PATTERN = /^storage:\/\/([^/]+)\/(.+)$/
const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * Resolve a private `storage://bucket/path` reference with the current user's
 * Supabase session. Plain HTTP(S) URLs are returned unchanged for backwards
 * compatibility with existing generated tracks.
 */
export async function resolveStemStorageUrl(
  value?: string | null,
  options: { download?: string } = {},
): Promise<string | null> {
  if (!value) return null

  const match = STORAGE_URI_PATTERN.exec(value)
  if (!match) {
    if (!options.download) return value
    try {
      const url = new URL(value)
      if (url.pathname.includes('/storage/v1/object/public/')) {
        url.searchParams.set('download', options.download)
        return url.toString()
      }
    } catch {
      // URL 형식 검증은 실제 소비 지점에서 처리한다.
    }
    return value
  }

  const [, bucket, objectPath] = match
  if (
    !bucket ||
    !objectPath ||
    objectPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('올바르지 않은 비공개 오디오 경로입니다.')
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(
      objectPath,
      SIGNED_URL_TTL_SECONDS,
      options.download ? { download: options.download } : undefined,
    )

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || '비공개 오디오 링크를 만들 수 없습니다.')
  }

  return data.signedUrl
}
