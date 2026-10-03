/** Melodio — Lyria 3 is unavailable until a real provider is integrated. */

import type { LyriaGenerateRequest, GeneratedTrack } from '@/types'

export async function generateWithLyria3(_req: LyriaGenerateRequest): Promise<GeneratedTrack> {
  void _req
  throw new Error('Lyria 3 생성은 현재 제공되지 않습니다. Suno V6 엔진을 선택해 주세요.')
}
