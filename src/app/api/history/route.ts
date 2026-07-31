/**
 * Melodio — 프롬프트 히스토리 API
 * GET  /api/history       — 목록 조회 (최신순, 최대 50개)
 * POST /api/history       — 히스토리 저장
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PromptPayload, TagSelections } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('prompt_history')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ history: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await request.json() as {
    payload: PromptPayload
    selections: TagSelections
    presetId?: string
    title?: string
  }

  const { data, error } = await supabase
    .from('prompt_history')
    .insert({
      user_id: user.id,
      style_prompt: body.payload.stylePrompt,
      lyrics_prompt: body.payload.lyricsPrompt || null,
      engine: body.payload.engine,
      is_instrumental: body.payload.isInstrumental,
      selections: body.selections,
      preset_id: body.presetId ?? null,
      title: body.payload.title || body.title || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ saved: data })
}
