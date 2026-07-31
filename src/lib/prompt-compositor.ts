/**
 * Melodio — 스마트 프롬프트 결합 엔진 (Compositor)
 *
 * Suno v5.5 팩트 기반 설계 (2026-07-01 검증):
 *   - 스타일 프롬프트 최대 1,000자
 *   - 앞쪽 배치 태그에 높은 가중치 (Top-Loading)
 *   - 5~8개 핵심 태그가 최적, 15개 이상은 품질 저하
 *
 * 결합 로직:
 *   1. 우선순위 정렬 (장르 → 보컬 → 악기 → BPM → 키 → 무드 → 프로덕션 → ...)
 *   2. Instrumental 필터 (보컬/보컬이펙트 태그 완전 제거)
 *   3. 단일 선택 강제 (tempo, key — 마지막 선택만 유지)
 *   4. 1,000자 스마트 컷 (낮은 순위부터 삭제)
 */

import type { TagSelections } from '@/types'

/** 카테고리별 결합 우선순위 (숫자가 작을수록 프롬프트 앞쪽 배치) */
const PRIORITY_ORDER: string[] = [
  'genre',       // 1순위: 장르 (절대 삭제 불가)
  'vocal',       // 2순위: 보컬 (절대 삭제 불가)
  'instruments', // 3순위: 악기
  'tempo',       // 4순위: BPM
  'key',         // 5순위: 키/스케일
  'mood',        // 6순위: 무드
  'production',  // 7순위: 프로덕션
  'era',         // 8순위: 시대
  'vocalFx',     // 9순위: 보컬 이펙트
  'structure',   // 10순위: 곡 구조
  'foley',       // 11순위: 환경음 (가장 먼저 삭제)
  'theme',       // 12순위: 테마 (가장 먼저 삭제)
]

/** 삭제 불가 카테고리 (글자 수 초과 시에도 보존) */
const PROTECTED_CATEGORIES = new Set(['genre', 'vocal'])

/** 보컬 관련 카테고리 ID (Instrumental 모드 시 제거 대상) */
const VOCAL_CATEGORIES = new Set(['vocal', 'vocalFx'])

/** Suno v5.5 스타일 프롬프트 최대 글자 수 */
const MAX_CHARS = 1000

/** 안전 마진 (이 글자 수 초과 시 스마트 컷 발동) */
const SOFT_LIMIT = 950

export interface CompositorResult {
  /** 최종 결합된 스타일 프롬프트 */
  prompt: string
  /** 현재 글자 수 */
  charCount: number
  /** 스마트 컷으로 제거된 태그 수 */
  truncatedCount: number
  /** 최대 글자 수 */
  maxChars: number
}

/**
 * 스마트 프롬프트 결합 엔진 — 메인 함수
 *
 * @param selections  사용자가 선택한 카테고리별 태그 맵
 * @param isInstrumental  연주곡 모드 여부
 * @returns CompositorResult
 */
export function composeStylePrompt(
  selections: TagSelections,
  isInstrumental: boolean,
): CompositorResult {
  // 1. 우선순위 순으로 태그 수집
  const orderedParts: { categoryId: string; value: string }[] = []
  const safeSelections = selections || {}

  for (const catId of PRIORITY_ORDER) {
    const values = safeSelections[catId]
    if (!values?.length) continue

    // 2. Instrumental 필터: 보컬 관련 카테고리 전체 스킵
    if (isInstrumental && VOCAL_CATEGORIES.has(catId)) continue

    for (const val of values) {
      orderedParts.push({ categoryId: catId, value: val })
    }
  }

  // 3. Instrumental 모드 시 "Instrumental, No Vocals"을 2번째 위치(장르 바로 뒤)에 삽입
  if (isInstrumental) {
    const genreEndIdx = orderedParts.findIndex((p) => p.categoryId !== 'genre')
    const insertIdx = genreEndIdx >= 0 ? genreEndIdx : orderedParts.length
    orderedParts.splice(insertIdx, 0, {
      categoryId: 'vocal',
      value: 'Instrumental, No Vocals',
    })
  }

  // 4. 결합 (콤마 구분)
  let prompt = orderedParts.map((p) => p.value).join(', ')
  let truncatedCount = 0

  // 5. 1,000자 스마트 컷 — 뒤쪽(낮은 우선순위)부터 삭제
  if (prompt.length > SOFT_LIMIT) {
    // 뒤에서부터 제거하되, PROTECTED 카테고리는 건드리지 않음
    while (prompt.length > SOFT_LIMIT && orderedParts.length > 0) {
      const lastPart = orderedParts[orderedParts.length - 1]
      if (PROTECTED_CATEGORIES.has(lastPart.categoryId)) break
      orderedParts.pop()
      truncatedCount++
      prompt = orderedParts.map((p) => p.value).join(', ')
    }
  }

  // 6. 최종 하드 컷 (만약 보호 카테고리만으로도 1,000자 초과 시)
  if (prompt.length > MAX_CHARS) {
    prompt = prompt.slice(0, MAX_CHARS)
  }

  return {
    prompt,
    charCount: prompt.length,
    truncatedCount,
    maxChars: MAX_CHARS,
  }
}

/**
 * 단일 선택 강제 헬퍼 — 특정 카테고리에서 새 값을 선택하면 기존 선택을 교체
 */
export function enforceSingleSelect(
  selections: TagSelections,
  categoryId: string,
  newValue: string,
): TagSelections {
  const current = selections[categoryId] ?? []

  if (current.includes(newValue)) {
    // 이미 선택된 값이면 해제
    return {
      ...selections,
      [categoryId]: current.filter((v) => v !== newValue),
    }
  }

  // 새 값으로 교체 (기존 선택 모두 해제)
  return {
    ...selections,
    [categoryId]: [newValue],
  }
}

/**
 * 동적 변수 로테이션 템플릿 파서
 * {[옵션1]|[옵션2]|[옵션3]} 이나 {옵션1|옵션2|옵션3} 형태를 감지하여 
 * 그 중 1개의 옵션을 무작위로 선택하여 문자열을 치환합니다.
 */
export function resolveRotationPrompt(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(/\{([^}]+)\}/g, (match, choicesText) => {
    const choices = choicesText.split('|').map((choice: string) => {
      let cleaned = choice.trim()
      if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
        cleaned = cleaned.substring(1, cleaned.length - 1)
      }
      return cleaned.trim()
    })
    const validChoices = choices.filter((c: string) => c.length > 0)
    if (validChoices.length === 0) return ''
    const randomIndex = Math.floor(Math.random() * validChoices.length)
    return validChoices[randomIndex]
  })
}
