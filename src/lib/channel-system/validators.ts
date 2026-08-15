import type { ChannelDna, DnaLockMode } from '../../types'

export type DnaValidationCode =
  | 'LOCK_CONFIGURATION_CHANGED'
  | 'LOCK_PATH_NOT_FOUND'
  | 'LOCKED_FIELD_CHANGED'
  | 'BOUNDED_RANGE_EXPANDED'
  | 'BOUNDED_VALUE_NOT_ALLOWED'
  | 'BOUNDED_FIELD_CHANGED'
  | 'UNLISTED_FIELD_CHANGED'

export interface DnaValidationIssue {
  code: DnaValidationCode
  path: string
  mode: DnaLockMode
  previousValue: unknown
  candidateValue: unknown
  message: string
}
export interface DnaValidationResult {
  valid: boolean
  issues: DnaValidationIssue[]
  changedPaths: string[]
}

export interface DnaValidationOptions {
  /** fieldLocks에 없는 필드의 기본 정책. 안전을 위해 기본값은 locked다. */
  unlistedMode?: DnaLockMode
}

export interface TitleRecord {
  id: string
  title: string
}

export type TitleValidationCode = 'EMPTY_TITLE' | 'EXACT_DUPLICATE' | 'SIMILAR_TITLE'

export interface TitleValidationIssue {
  code: TitleValidationCode
  titleId: string
  title: string
  comparedToId?: string
  comparedToTitle?: string
  /** EXACT_DUPLICATE는 1, SIMILAR_TITLE은 0~1 범위다. */
  similarity: number
  message: string
}

export interface TitleValidationResult {
  valid: boolean
  issues: TitleValidationIssue[]
  normalizedTitles: Record<string, string>
}

export interface TitleValidationOptions {
  existingTitles?: TitleRecord[]
  /** 기본 0.85. 0~1 범위로 제한된다. */
  similarityThreshold?: number
  /** 번역 병기 등에 쓰이는 괄호 안 문구를 비교에서 제외한다. 기본 true. */
  ignoreBracketedText?: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 객체 키 순서와 무관한 깊은 동등성 비교. */
function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => deepEqual(value, right[index]))
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => (
        key === rightKeys[index] && deepEqual(left[key], right[key])
      ))
  }
  return false
}

function getAtPath(value: unknown, path: string): { found: boolean; value: unknown } {
  if (!path) return { found: true, value }
  let current = value
  for (const segment of path.split('.')) {
    if (!isPlainObject(current) || !Object.hasOwn(current, segment)) {
      return { found: false, value: undefined }
    }
    current = current[segment]
  }
  return { found: true, value: current }
}

function collectChangedLeafPaths(
  previous: unknown,
  candidate: unknown,
  parentPath = '',
): string[] {
  if (deepEqual(previous, candidate)) return []

  if (isPlainObject(previous) && isPlainObject(candidate)) {
    const keys = [...new Set([...Object.keys(previous), ...Object.keys(candidate)])].sort()
    return keys.flatMap((key) => collectChangedLeafPaths(
      previous[key],
      candidate[key],
      parentPath ? `${parentPath}.${key}` : key,
    ))
  }

  return [parentPath]
}

function isPathCovered(path: string, lockPath: string): boolean {
  return path === lockPath || path.startsWith(`${lockPath}.`)
}

function boundedIssue(
  path: string,
  previousValue: unknown,
  candidateValue: unknown,
): DnaValidationIssue | null {
  if (deepEqual(previousValue, candidateValue)) return null

  if (
    Array.isArray(previousValue)
    && Array.isArray(candidateValue)
    && previousValue.length === 2
    && candidateValue.length === 2
    && previousValue.every((value) => typeof value === 'number')
    && candidateValue.every((value) => typeof value === 'number')
  ) {
    const [previousMin, previousMax] = previousValue as number[]
    const [candidateMin, candidateMax] = candidateValue as number[]
    const validRange = candidateMin <= candidateMax
      && candidateMin >= previousMin
      && candidateMax <= previousMax
    if (validRange) return null
    return {
      code: 'BOUNDED_RANGE_EXPANDED',
      path,
      mode: 'bounded',
      previousValue,
      candidateValue,
      message: `${path} 값은 기존 범위 ${previousMin}–${previousMax} 안에 있어야 합니다.`,
    }
  }

  if (Array.isArray(previousValue) && Array.isArray(candidateValue)) {
    const allAllowed = candidateValue.every((candidateItem) => (
      previousValue.some((allowedItem) => deepEqual(allowedItem, candidateItem))
    ))
    if (allAllowed) return null
    return {
      code: 'BOUNDED_VALUE_NOT_ALLOWED',
      path,
      mode: 'bounded',
      previousValue,
      candidateValue,
      message: `${path}에 Channel DNA 허용 목록 밖의 값이 포함되어 있습니다.`,
    }
  }

  return {
    code: 'BOUNDED_FIELD_CHANGED',
    path,
    mode: 'bounded',
    previousValue,
    candidateValue,
    message: `${path}는 별도 허용 범위가 없는 bounded 필드이므로 값을 변경할 수 없습니다.`,
  }
}

/**
 * 기존 DNA의 fieldLocks를 기준으로 후보 DNA 변경을 검증한다.
 * 후보가 자신의 lock 설정을 바꿔 제한을 우회하는 행위도 차단한다.
 */
export function validateChannelDnaMutation(
  previous: ChannelDna,
  candidate: ChannelDna,
  options: DnaValidationOptions = {},
): DnaValidationResult {
  const issues: DnaValidationIssue[] = []
  const changedPaths = collectChangedLeafPaths(previous, candidate)
    .filter((path) => path && path !== 'fieldLocks' && !path.startsWith('fieldLocks.'))
  const lockEntries = Object.entries(previous.fieldLocks).sort(([left], [right]) => (
    left.localeCompare(right)
  ))

  if (!deepEqual(previous.fieldLocks, candidate.fieldLocks)) {
    issues.push({
      code: 'LOCK_CONFIGURATION_CHANGED',
      path: 'fieldLocks',
      mode: 'locked',
      previousValue: previous.fieldLocks,
      candidateValue: candidate.fieldLocks,
      message: 'DNA 변경 요청에서 잠금 정책 자체를 수정할 수 없습니다.',
    })
  }

  for (const [path, mode] of lockEntries) {
    const oldField = getAtPath(previous, path)
    const newField = getAtPath(candidate, path)
    if (!oldField.found) {
      issues.push({
        code: 'LOCK_PATH_NOT_FOUND',
        path,
        mode,
        previousValue: undefined,
        candidateValue: newField.value,
        message: `${path} 잠금 경로가 기존 Channel DNA에 존재하지 않습니다.`,
      })
      continue
    }
    if (mode === 'free' || deepEqual(oldField.value, newField.value)) continue

    if (mode === 'locked') {
      issues.push({
        code: 'LOCKED_FIELD_CHANGED',
        path,
        mode,
        previousValue: oldField.value,
        candidateValue: newField.value,
        message: `${path}는 잠긴 Channel DNA 필드이므로 변경할 수 없습니다.`,
      })
      continue
    }

    const issue = boundedIssue(path, oldField.value, newField.value)
    if (issue) issues.push(issue)
  }

  const unlistedMode = options.unlistedMode ?? 'locked'
  if (unlistedMode !== 'free') {
    for (const path of changedPaths) {
      if (lockEntries.some(([lockPath]) => isPathCovered(path, lockPath))) continue
      const oldField = getAtPath(previous, path)
      const newField = getAtPath(candidate, path)
      issues.push({
        code: unlistedMode === 'bounded'
          ? 'BOUNDED_FIELD_CHANGED'
          : 'UNLISTED_FIELD_CHANGED',
        path,
        mode: unlistedMode,
        previousValue: oldField.value,
        candidateValue: newField.value,
        message: `${path}에 잠금 정책이 없어 기본 ${unlistedMode} 정책으로 변경을 차단했습니다.`,
      })
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    changedPaths,
  }
}

/** 제목 비교를 위한 Unicode·공백·문장부호 정규화. */
export function normalizeTitle(
  title: string,
  options: Pick<TitleValidationOptions, 'ignoreBracketedText'> = {},
): string {
  const ignoreBracketedText = options.ignoreBracketedText ?? true
  let normalized = title.normalize('NFKC').toLocaleLowerCase()
  if (ignoreBracketedText) {
    normalized = normalized
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/【[^】]*】/g, ' ')
  }
  return normalized
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
    }
    previous = current
  }
  return previous[right.length]
}

function lexicalSimilarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1

  const compactLeft = left.replace(/\s/g, '')
  const compactRight = right.replace(/\s/g, '')
  const editSimilarity = 1 - (
    levenshteinDistance(compactLeft, compactRight)
    / Math.max(compactLeft.length, compactRight.length, 1)
  )

  const leftTokens = new Set(left.split(' ').filter(Boolean))
  const rightTokens = new Set(right.split(' ').filter(Boolean))
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  const tokenSimilarity = union === 0 ? 0 : intersection / union

  return Math.max(editSimilarity, tokenSimilarity)
}

/**
 * 한 에피소드의 후보 제목과 기존 채널 제목 원장을 함께 검사한다.
 * 의미 임베딩을 사용하지 않는 순수 lexical validator이므로 의미 유사도 검사는 별도 단계다.
 */
export function validateTitleUniqueness(
  titles: TitleRecord[],
  options: TitleValidationOptions = {},
): TitleValidationResult {
  const existingTitles = options.existingTitles || []
  const threshold = Math.min(1, Math.max(0, options.similarityThreshold ?? 0.85))
  const normalizationOptions = { ignoreBracketedText: options.ignoreBracketedText }
  const normalizedTitles: Record<string, string> = {}
  const issues: TitleValidationIssue[] = []

  for (const record of [...existingTitles, ...titles]) {
    normalizedTitles[record.id] = normalizeTitle(record.title, normalizationOptions)
  }

  for (const record of titles) {
    const normalized = normalizedTitles[record.id]
    if (!normalized) {
      issues.push({
        code: 'EMPTY_TITLE',
        titleId: record.id,
        title: record.title,
        similarity: 0,
        message: '정규화 후 제목이 비어 있습니다.',
      })
    }
  }

  const compare = (record: TitleRecord, comparedTo: TitleRecord) => {
    const normalized = normalizedTitles[record.id]
    const comparedNormalized = normalizedTitles[comparedTo.id]
    if (!normalized || !comparedNormalized) return
    const similarity = lexicalSimilarity(normalized, comparedNormalized)
    if (similarity < threshold) return

    const exact = normalized === comparedNormalized
    issues.push({
      code: exact ? 'EXACT_DUPLICATE' : 'SIMILAR_TITLE',
      titleId: record.id,
      title: record.title,
      comparedToId: comparedTo.id,
      comparedToTitle: comparedTo.title,
      similarity,
      message: exact
        ? `“${record.title}” 제목이 “${comparedTo.title}”와 중복됩니다.`
        : `“${record.title}” 제목이 “${comparedTo.title}”와 너무 유사합니다.`,
    })
  }

  for (let index = 0; index < titles.length; index += 1) {
    for (let compareIndex = 0; compareIndex < index; compareIndex += 1) {
      compare(titles[index], titles[compareIndex])
    }
    for (const existing of existingTitles) {
      compare(titles[index], existing)
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    normalizedTitles,
  }
}
