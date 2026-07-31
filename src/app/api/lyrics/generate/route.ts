/**
 * Melodio — AI 가사 자동 생성 API Route
 * POST /api/lyrics/generate
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateLyrics } from '@/lib/engines/lyrics-generator'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { stylePrompt, topic, language, isPlaylistMode, trackCount, vocalGender, presetId, durationSeconds, viralMode } = await request.json()

    if (!stylePrompt) {
      return NextResponse.json({ error: 'stylePrompt가 필요합니다.' }, { status: 400 })
    }

    const result = await generateLyrics({
      stylePrompt,
      topic,
      language,
      isPlaylistMode,
      trackCount,
      vocalGender,
      presetId,
      durationSeconds,
      viralMode,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : '가사 생성 중 오류 발생'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
