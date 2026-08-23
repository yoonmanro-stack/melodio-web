import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { generationId } = await request.json();

    if (!generationId) {
      return NextResponse.json({ error: 'generationId is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[API/split-stems] Supabase 환경 변수 누락');
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 });
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. 해당 곡 확인
    const { data: track, error: fetchErr } = await serviceSupabase
      .from('generations')
      .select('id, title, audio_url, source_audio_url')
      .eq('id', generationId)
      .single();

    if (fetchErr || !track) {
      return NextResponse.json({ error: '음원을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!track.audio_url && !track.source_audio_url) {
      return NextResponse.json({ error: '분리할 오디오 원본 URL이 존재하지 않습니다.' }, { status: 400 });
    }

    // 2. status -> pending 업데이트 (맥미니 워커 Demucs 즉시 트리거)
    const { error: updateErr } = await serviceSupabase
      .from('generations')
      .update({
        status: 'pending',
        is_stem_extracted: false,
        stem_vocals_url: null,
        stem_drums_url: null,
        stem_bass_url: null,
        stem_other_url: null,
        preview_vocals_url: null,
        preview_drums_url: null,
        preview_bass_url: null,
        preview_other_url: null,
      })
      .eq('id', generationId);

    if (updateErr) {
      console.error('[API/split-stems] UPDATE 에러:', updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log(`[API/split-stems] 스템 분리 큐 등록 성공: ${generationId} (${track.title})`);
    return NextResponse.json({
      success: true,
      message: '스템 분리 작업이 성공적으로 시작되었습니다.',
      generationId,
    });
  } catch (err: any) {
    console.error('[API/split-stems] 예외 발생:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
