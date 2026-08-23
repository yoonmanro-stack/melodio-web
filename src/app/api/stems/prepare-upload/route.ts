import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { fileName, fileSize } = await request.json();

    if (!fileName) {
      return NextResponse.json({ error: '파일명이 필요합니다.' }, { status: 400 });
    }

    const MAX_SIZE_MB = 80;
    if (fileSize && fileSize > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `파일 크기는 최대 ${MAX_SIZE_MB}MB까지 가능합니다.` }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase env variables missing' }, { status: 500 });
    }

    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const generationId = randomUUID();
    const ext = fileName.split('.').pop()?.toLowerCase() || 'mp3';
    const storagePath = `uploads/${generationId}.${ext}`;

    // Supabase Storage에 직접 업로드 가능한 서명된 URL 생성 (Vercel 4.5MB 제한 우회)
    const { data, error } = await serviceSupabase.storage
      .from('melodio-assets')
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      console.error('[API/prepare-upload] 서명된 업로드 URL 생성 실패:', error?.message);
      return NextResponse.json({ error: '업로드 URL 생성 실패: ' + (error?.message || '알 수 없는 오류') }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      generationId,
      path: storagePath,
      token: data.token,
      signedUrl: data.signedUrl,
      ext,
    });
  } catch (err: any) {
    console.error('[API/prepare-upload] 예외 발생:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
