export interface GenerationBatchTrack {
  id: string
  trackIndex: number
  inputCount: number
}

/** Keep every input in one submitted playlist attached to the same batch. */
export function buildGenerationBatch(id: string, inputCount: number): GenerationBatchTrack[] {
  if (!Number.isInteger(inputCount) || inputCount < 1 || inputCount > 40) {
    throw new RangeError('플레이리스트는 1~40곡의 입력으로 생성할 수 있습니다.')
  }
  return Array.from({ length: inputCount }, (_, trackIndex) => ({ id, trackIndex, inputCount }))
}
