/**
 * Melodio — 히스토리 단건 조작
 * PATCH  /api/history/[id]  — 즐겨찾기 토글 / 제목 수정
 * DELETE /api/history/[id]  — 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type HistoryUpdate = Database['public']['Tables']['prompt_history']['Update']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { id } = await params
  const raw = await request.json() as { is_favorite?: boolean; title?: string }

  // 허용된 필드만 명시적으로 추출
  const updateData: HistoryUpdate = {}
  if (typeof raw.is_favorite === 'boolean') updateData.is_favorite = raw.is_favorite
  if (typeof raw.title === 'string') updateData.title = raw.title

  const { data, error } = await supabase
    .from('prompt_history')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('prompt_history')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
