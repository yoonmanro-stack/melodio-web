import { createClient as createAdminClient } from '@supabase/supabase-js'
import { isIP } from 'node:net'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const PRIVATE_STEM_BUCKET = 'melodio-private'
export const PRIVATE_STEM_OUTPUT_BUCKET = 'melodio-private-stems'
export const MAX_STEM_UPLOAD_BYTES = 80 * 1024 * 1024
export const STEM_SOURCE_URI_PREFIX = `storage://${PRIVATE_STEM_BUCKET}/`
export const STEM_OUTPUT_URI_PREFIX = `storage://${PRIVATE_STEM_OUTPUT_BUCKET}/`

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'])
const DEFAULT_TRUSTED_SOURCE_HOST_RULES = [
  '*.supabase.co',
  'file.302.ai',
  'suno.ai',
  '*.suno.ai',
  'suno.com',
  '*.suno.com',
  'storage.googleapis.com',
  '*.storage.googleapis.com',
  'storage.cloud.google.com',
  '*.googleusercontent.com',
  '*.r2.dev',
]

type UnknownRecord = Record<string, unknown>

export class StemApiInputError extends Error {
  readonly field?: string

  constructor(message: string, field?: string) {
    super(message)
    this.name = 'StemApiInputError'
    this.field = field
  }
}

export class StemApiAuthenticationError extends Error {
  constructor() {
    super('로그인이 필요합니다.')
    this.name = 'StemApiAuthenticationError'
  }
}

export function createStemAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server configuration is missing')
  }

  return createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function requireStemUser() {
  const client = await createServerClient()
  const { data, error } = await client.auth.getUser()

  if (error || !data.user) {
    throw new StemApiAuthenticationError()
  }

  return data.user
}

export async function readStemJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new StemApiInputError('올바른 JSON 요청 본문이 필요합니다.', 'body')
  }
}

function record(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StemApiInputError('객체 형식의 요청이 필요합니다.', 'body')
  }
  return value as UnknownRecord
}

export function parseStemUuid(value: unknown, field = 'generationId'): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new StemApiInputError('올바른 UUID가 필요합니다.', field)
  }
  return value.toLowerCase()
}

function parseFileName(value: unknown): { fileName: string; extension: string } {
  if (typeof value !== 'string') {
    throw new StemApiInputError('파일명이 필요합니다.', 'fileName')
  }

  const fileName = value.trim()
  if (!fileName || fileName.length > 255 || /[\u0000-\u001f/\\]/.test(fileName)) {
    throw new StemApiInputError('올바른 파일명이 필요합니다.', 'fileName')
  }

  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new StemApiInputError('지원하지 않는 오디오 형식입니다.', 'fileName')
  }

  return { fileName, extension }
}

function parseFileSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new StemApiInputError('올바른 파일 크기가 필요합니다.', 'fileSize')
  }
  const fileSize = value as number
  if (fileSize > MAX_STEM_UPLOAD_BYTES) {
    throw new StemApiInputError('파일 크기는 최대 80MB까지 가능합니다.', 'fileSize')
  }
  return fileSize
}

function parseTitle(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback.slice(0, 80)
  if (typeof value !== 'string') {
    throw new StemApiInputError('곡 제목은 문자열이어야 합니다.', 'title')
  }
  const title = value.trim()
  if (!title || title.length > 80 || /[\u0000-\u001f]/.test(title)) {
    throw new StemApiInputError('곡 제목은 1~80자여야 합니다.', 'title')
  }
  return title
}

export function buildPrivateStemUploadPath(userId: string, generationId: string, extension: string): string {
  return `uploads/${userId}/${generationId}.${extension}`
}

export function buildStorageUri(path: string): string {
  return `${STEM_SOURCE_URI_PREFIX}${path}`
}

export function parsePrepareStemUpload(value: unknown): {
  fileName: string
  fileSize: number
  extension: string
} {
  const input = record(value)
  const { fileName, extension } = parseFileName(input.fileName)
  return {
    fileName,
    extension,
    fileSize: parseFileSize(input.fileSize),
  }
}

export function parseConfirmStemUpload(
  value: unknown,
  userId: string,
): {
  generationId: string
  path: string
  title: string
  fileName: string
  fileSize: number
  extension: string
} {
  const input = record(value)
  const generationId = parseStemUuid(input.generationId)
  const { fileName, extension } = parseFileName(input.fileName)
  const fileSize = parseFileSize(input.fileSize)
  const expectedPath = buildPrivateStemUploadPath(userId, generationId, extension)

  if (typeof input.path !== 'string' || input.path !== expectedPath) {
    throw new StemApiInputError('업로드 경로가 현재 사용자와 일치하지 않습니다.', 'path')
  }

  return {
    generationId,
    path: expectedPath,
    title: parseTitle(input.title, fileName.replace(/\.[^/.]+$/, '') || '업로드 오디오 트랙'),
    fileName,
    fileSize,
    extension,
  }
}

export async function verifyPrivateStemObject(
  admin: ReturnType<typeof createStemAdminClient>,
  path: string,
  expectedSize: number,
) {
  const { data, error } = await admin.storage
    .from(PRIVATE_STEM_BUCKET)
    .info(path)

  if (error) {
    throw new Error(`업로드 확인 실패: ${error.message}`)
  }

  const actualSize = Number(data?.size || 0)
  if (!data || actualSize <= 0) {
    throw new StemApiInputError('업로드된 오디오 파일을 찾을 수 없습니다.', 'path')
  }
  if (actualSize > MAX_STEM_UPLOAD_BYTES || actualSize !== expectedSize) {
    throw new StemApiInputError('업로드된 파일 크기가 요청 정보와 일치하지 않습니다.', 'fileSize')
  }
  if (data.contentType && !data.contentType.toLowerCase().startsWith('audio/')) {
    throw new StemApiInputError('업로드된 파일의 오디오 형식을 확인할 수 없습니다.', 'fileName')
  }
}

export function parsePrivateStorageUri(value: string, userId: string): { bucket: string; path: string } | null {
  if (!value.startsWith('storage://')) return null
  const isSource = value.startsWith(STEM_SOURCE_URI_PREFIX)
  const isOutput = value.startsWith(STEM_OUTPUT_URI_PREFIX)
  if (!isSource && !isOutput) {
    throw new StemApiInputError('허용되지 않은 비공개 저장소 URI입니다.')
  }

  const bucket = isSource ? PRIVATE_STEM_BUCKET : PRIVATE_STEM_OUTPUT_BUCKET
  const path = value.slice(isSource ? STEM_SOURCE_URI_PREFIX.length : STEM_OUTPUT_URI_PREFIX.length)
  const segments = path.split('/')
  const validPrefix = isSource ? segments[0] === 'uploads' : segments[0] === 'stems'
  if (
    !validPrefix ||
    segments[1] !== userId ||
    segments.length < 3 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..' || /[?#\\]/.test(segment))
  ) {
    throw new StemApiInputError('비공개 저장소 경로가 현재 사용자와 일치하지 않습니다.')
  }

  return { bucket, path }
}

function configuredStemSourceHostRules(): string[] {
  const configured = (process.env.STEM_SOURCE_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase().replace(/\.$/, ''))
    .filter((value) => /^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value))

  return [...DEFAULT_TRUSTED_SOURCE_HOST_RULES, ...configured]
}

function hostnameMatchesRule(hostname: string, rule: string): boolean {
  if (!rule.startsWith('*.')) return hostname === rule
  const suffix = rule.slice(2)
  return hostname.length > suffix.length && hostname.endsWith(`.${suffix}`)
}

export function validateTrustedStemSourceUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new StemApiInputError('원본 오디오 URL 형식이 올바르지 않습니다.', 'sourceUrl')
  }

  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
  ) {
    throw new StemApiInputError('HTTPS 기본 포트의 원본 오디오 URL만 허용됩니다.', 'sourceUrl')
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    !hostname
    || isIP(hostname) !== 0
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
  ) {
    throw new StemApiInputError('내부 네트워크 주소는 원본 오디오로 사용할 수 없습니다.', 'sourceUrl')
  }

  if (!configuredStemSourceHostRules().some((rule) => hostnameMatchesRule(hostname, rule))) {
    throw new StemApiInputError('신뢰된 음원 저장소 URL만 스템 분리에 사용할 수 있습니다.', 'sourceUrl')
  }

  return url
}

/**
 * Validate the exact public object shape written by the retired custom-upload
 * endpoint. This is only used to migrate/retry a row already owned by the user.
 */
export function validateLegacyPublicStemUploadSource(value: string, generationId: string): URL {
  const url = validateTrustedStemSourceUrl(value)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('Supabase server configuration is missing')

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(url.pathname)
  } catch {
    throw new StemApiInputError('이전 업로드 원본 경로가 올바르지 않습니다.', 'sourceUrl')
  }

  const expectedPrefix = `/storage/v1/object/public/melodio-assets/uploads/${generationId}.`
  const extension = decodedPath.startsWith(expectedPrefix)
    ? decodedPath.slice(expectedPrefix.length).toLowerCase()
    : ''
  if (url.origin !== new URL(supabaseUrl).origin || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new StemApiInputError('검증된 이전 업로드 원본만 다시 처리할 수 있습니다.', 'sourceUrl')
  }
  return url
}

export function stemApiErrorStatus(error: unknown): number {
  if (error instanceof StemApiAuthenticationError) return 401
  if (error instanceof StemApiInputError) return 400
  return 500
}

export function stemApiErrorMessage(error: unknown): string {
  if (error instanceof StemApiAuthenticationError || error instanceof StemApiInputError) {
    return error.message
  }
  return '스템 작업 요청을 처리하지 못했습니다.'
}
