import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { generationId, path, title, fileName, fileSize } = await request.json();

    if (!generationId || !path) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
    }

    // 현재 세션의 user_id 파악
    let loggedInUserId: string | null = null;
    try {
      const serverSupabase = await createServerClient();
      const { data: { user } } = await serverSupabase.auth.getUser();
      if (user) {
        loggedInUserId = user.id;
      }
    } catch {
      // ignore
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 });
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const publicAudioUrl = serviceSupabase.storage
      .from('melodio-assets')
      .getPublicUrl(path).data.publicUrl;

    const trackTitle = title?.trim() || fileName?.replace(/\.[^/.]+$/, '') || '업로드 오디오 트랙';

    // generations 테이블에 pending 상태로 등록 -> 맥미니 Demucs 워커가 즉시 감지하여 4채널 분리
    const { data: newGen, error: dbError } = await serviceSupabase
      .from('generations')
      .insert({
        id: generationId,
        user_id: loggedInUserId,
        title: trackTitle,
        status: 'pending',
        is_stem_extracted: false,
        audio_url: publicAudioUrl,
        license_hash: JSON.stringify({
          sourceMenu: 'stem-upload',
          uploadedAt: new Date().toISOString(),
          originalFileName: fileName || '',
          fileSize: fileSize || null,
        }),
      })
      .select()
      .single();

    if (dbError) {
      console.error('[API/confirm-and-split] DB 등록 실패:', dbError.message);
      return NextResponse.json({ error: 'DB 등록 실패: ' + dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      generationId: newGen.id,
      track: newGen,
      message: '업로드 완료 및 4채널 스템 분리 큐에 정상 등록되었습니다.',
    });
  } catch (err: any) {
    console.error('[API/confirm-and-split] 예외 발생:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
