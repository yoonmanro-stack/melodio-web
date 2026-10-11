/**
 * Melodio — AI 가사 자동 생성 API Route
 * POST /api/lyrics/generate
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateLyrics } from '@/lib/engines/lyrics-generator'
import { isPresetStudioSource } from '@/lib/preset-studio-profile'
import { isViralGenerationAvailable } from '@/lib/vle/viralGenerationAvailability'
import { VIRAL_CATEGORY_DISABLED_CODE, VIRAL_CATEGORY_DISABLED_MESSAGE } from '@/lib/vle/viralCategoryAvailability'

export const dynamic = 'force-dynamic'
/** Leave room beyond the 180-second Sol provider deadline for prompt preparation. */
export const maxDuration = 240

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!isViralGenerationAvailable(body)) {
      return NextResponse.json({ success: false, error: VIRAL_CATEGORY_DISABLED_MESSAGE, code: VIRAL_CATEGORY_DISABLED_CODE }, { status: 400 })
    }
    const { stylePrompt, topic, language, isPlaylistMode, trackCount, vocalGender, presetId, durationSeconds, viralMode, sourceMenu, vocalProfileSpecified } = body

    if (typeof stylePrompt !== 'string' || !stylePrompt.trim()) {
      return NextResponse.json({ error: '음악 스타일을 입력하거나 프리셋을 선택해 주세요.' }, { status: 400 })
    }
    if (isPlaylistMode !== undefined && typeof isPlaylistMode !== 'boolean') {
      return NextResponse.json({ error: '가사 생성 모드가 올바르지 않습니다. 다시 선택해 주세요.' }, { status: 400 })
    }
    if (trackCount !== undefined && (!Number.isInteger(trackCount) || trackCount < 1 || trackCount > 40)) {
      return NextResponse.json({ error: '생성할 곡 수는 1~40곡으로 선택해 주세요.' }, { status: 400 })
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
      ...(sourceMenu === 'japan' || isPresetStudioSource(sourceMenu)
        ? { sourceMenu, vocalProfileSpecified: vocalProfileSpecified === true } : {}),
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    const responseFormatError = code === 'lyrics_response_structure' || code === 'lyrics_response_incomplete'
    const message = error instanceof Error ? error.message : '가사 생성 중 오류가 발생했습니다. 다시 시도해 주세요.'
    return NextResponse.json({ success: false, error: message, ...(typeof code === 'string' ? { code } : {}) },
      { status: responseFormatError ? 502 : code === 'lyrics_instruction_in_content' ? 400 : 500 })
  }
}
