/**
 * Melodio — 듀얼 엔진 라우터
 * Auto 모드: Kie Suno V6
 */

import type { PromptPayload, GeneratedTrack } from '@/types'
import { generateWithLyria3 } from './lyria3'
import { generateWithSuno } from './suno'

export async function generateMusic(payload: PromptPayload): Promise<GeneratedTrack> {
  const engine =
    payload.engine === 'auto'
      ? 'suno_v5'
      : payload.engine

  if (engine === 'lyria3') {
    return generateWithLyria3({
      prompt: payload.stylePrompt,
      durationSeconds: 30,
      sampleRate: 48000,
    })
  }

  return generateWithSuno({
    prompt: payload.stylePrompt,
    lyrics: payload.lyricsPrompt || undefined,
    instrumental: payload.isInstrumental,
    model: payload.sunoVersion,
    title: payload.title,
    exclude: payload.excludePrompt,
  })
}

export { generateWithLyria3, generateWithSuno }
