/**
 * Melodio — 듀얼 엔진 라우터
 * Auto 모드: 보컬 없음 → Lyria 3, 보컬 있음 → Suno V5
 */

import type { PromptPayload, GeneratedTrack } from '@/types'
import { generateWithLyria3 } from './lyria3'
import { generateWithSuno } from './suno'

function mapSunoVersionToModel(version?: string): string {
  if (!version) return 'chirp-v3-5'
  const normalized = version.toLowerCase()
  switch (normalized) {
    case 'v5.5': return 'chirp-v4'
    case 'v5': return 'chirp-v4'
    case 'v4.5+': return 'chirp-v4'
    case 'v4.5': return 'chirp-v4'
    case 'v4.5-all': return 'chirp-v4'
    case 'v4': return 'chirp-v4'
    default: return 'chirp-v3-5'
  }
}

export async function generateMusic(payload: PromptPayload): Promise<GeneratedTrack> {
  const engine =
    payload.engine === 'auto'
      ? payload.isInstrumental
        ? 'lyria3'
        : 'suno_v5'
      : payload.engine

  if (engine === 'lyria3') {
    return generateWithLyria3({
      prompt: payload.stylePrompt,
      durationSeconds: 30,
      sampleRate: 48000,
    })
  }

  // Exclude 프롬프트가 있으면 스타일 프롬프트 뒤에 append (Suno v5.5 inline negation)
  const effectiveStylePrompt = payload.excludePrompt?.trim()
    ? `${payload.stylePrompt}, ${payload.excludePrompt.trim()}`
    : payload.stylePrompt

  return generateWithSuno({
    prompt: effectiveStylePrompt,
    lyrics: payload.lyricsPrompt || undefined,
    instrumental: payload.isInstrumental,
    model: mapSunoVersionToModel(payload.sunoVersion),
  })
}

export { generateWithLyria3, generateWithSuno }
