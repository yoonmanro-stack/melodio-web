import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const customTitle = formData.get('title') as string | null;

    if (!file) {
      return NextResponse.json({ error: '오디오 파일이 필요합니다.' }, { status: 400 });
    }

    // 파일 형식 및 크기 검증 (최대 50MB)
    const MAX_SIZE_MB = 50;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `파일 크기는 최대 ${MAX_SIZE_MB}MB까지 업로드할 수 있습니다.` }, { status: 400 });
    }

    const fileName = file.name || 'uploaded_track.mp3';
    const ext = fileName.split('.').pop()?.toLowerCase() || 'mp3';
    const cleanTitle = (customTitle?.trim() || fileName.replace(/\.[^/.]+$/, '')).slice(0, 80);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[API/upload-and-split] Supabase 환경 변수 누락');
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 });
    }

    // 로그인된 유저 확인
    let loggedInUserId: string | null = null;
    try {
      const authClient = await createServerClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user) loggedInUserId = user.id;
    } catch {
      // ignore
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const genId = randomUUID();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const storagePath = `uploads/${genId}.${ext}`;

    // 1. Supabase Storage에 원본 오디오 업로드
    const { error: uploadError } = await serviceSupabase.storage
      .from('melodio-assets')
      .upload(storagePath, buffer, {
        contentType: file.type || (ext === 'wav' ? 'audio/wav' : 'audio/mpeg'),
        upsert: true,
      });

    if (uploadError) {
      console.error('[API/upload-and-split] Storage 업로드 실패:', uploadError.message);
      return NextResponse.json({ error: '오디오 파일 스토리지 저장 실패: ' + uploadError.message }, { status: 500 });
    }

    const publicAudioUrl = serviceSupabase.storage
      .from('melodio-assets')
      .getPublicUrl(storagePath).data.publicUrl;

    // 2. generations 테이블에 신규 행 생성 (status: 'pending')
    const { error: insertError } = await serviceSupabase
      .from('generations')
      .insert({
        id: genId,
        title: cleanTitle,
        status: 'pending',
        is_stem_extracted: false,
        audio_url: publicAudioUrl,
        source_audio_url: publicAudioUrl,
        duration_mode: 'clip',
        is_liked: false,
        audio_grade: 'A',
        user_id: loggedInUserId,
        cover_art_url: 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/thumbnails/trot_upgrade_1784340900699.png',
        license_hash: JSON.stringify({
          sourceMenu: 'custom-upload',
          originalFileName: fileName,
          fileSize: file.size,
          isPublic: false,
          uploadedAt: new Date().toISOString(),
        }),
      });

    if (insertError) {
      console.error('[API/upload-and-split] DB insert 실패:', insertError.message);
      return NextResponse.json({ error: 'DB 등록 실패: ' + insertError.message }, { status: 500 });
    }

    console.log(`[API/upload-and-split] 외부 음원 등록 완료 -> 스템 분리 큐 진입: ${genId} (${cleanTitle})`);

    return NextResponse.json({
      success: true,
      message: '오디오 업로드 및 스템 분리 작업이 시작되었습니다.',
      generationId: genId,
      title: cleanTitle,
      audioUrl: publicAudioUrl,
    });
  } catch (err: any) {
    console.error('[API/upload-and-split] 예외 발생:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
