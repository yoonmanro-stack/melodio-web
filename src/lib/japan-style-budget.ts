/** Retain the existing behavior outside the reviewed Harajuku preset. */
export function fitJapanStyleBudget(style: string, presetId?: string, limit = 1000): string {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError('Style budget must be between 1 and 1000 characters.')
  }
  if (style.length <= limit) return style
  if (presetId !== 'kawaii-future') return style.slice(0, limit)

  const prefix = style.slice(0, limit + 1)
  const clauseEnd = Math.max(...[',', ';', '\n', '、', '。'].map(mark => prefix.lastIndexOf(mark)))
  if (clauseEnd >= limit * 0.65) return style.slice(0, clauseEnd).trimEnd()
  const wordEnd = prefix.search(/\s\S*$/u)
  if (wordEnd > 0) return style.slice(0, wordEnd).trimEnd()
  throw new Error('스타일 설명이 너무 깁니다. 문장이나 태그를 나누어 줄여 주세요.')
}
