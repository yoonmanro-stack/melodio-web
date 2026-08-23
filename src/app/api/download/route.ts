import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    const rawFilename = searchParams.get('filename') || 'melodio-track.mp3';

    if (!targetUrl) {
      return NextResponse.json({ error: 'url 파라미터가 누락되었습니다.' }, { status: 400 });
    }

    // URL 유효성 검사 (http / https 만 허용)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return NextResponse.json({ error: '지원되지 않는 프로토콜입니다.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: '잘못된 URL 형식입니다.' }, { status: 400 });
    }

    // 파일명 안전 정제 (특수문자 제거)
    const sanitizedFilename = rawFilename
      .replace(/[\\/:*?"<>|\r\n]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'melodio-track.mp3';

    // 업스트림(302.ai, Suno, Cloudflare CDN 등) 음원 데이터 요청
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(parsedUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
        signal: controller.signal,
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!upstreamRes.ok) {
      console.warn(`[API/download] 업스트림 실패 (HTTP ${upstreamRes.status}) for ${targetUrl}`);
      return NextResponse.json(
        {
          error: '음원이 아직 스토리지에 동기화 중입니다. 잠시 재생 후 다시 시도해 주세요.',
          upstreamStatus: upstreamRes.status,
        },
        { status: 502 }
      );
    }

    const contentType = upstreamRes.headers.get('content-type') || '';
    const contentLengthHeader = upstreamRes.headers.get('content-length');
    const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;

    // 100바이트 에러 텍스트(XML/HTML/JSON)가 MP3로 둔갑하는 현상 원천 차단
    const isTextOrJson = contentType.includes('application/json') || contentType.includes('text/html') || contentType.includes('text/xml');
    if (isTextOrJson || (contentLength !== null && contentLength < 1024)) {
      console.warn(`[API/download] 비정상 미디어 페이로드 감지 (type: ${contentType}, length: ${contentLength}) for ${targetUrl}`);
      return NextResponse.json(
        {
          error: '음원 파일이 아직 온전히 생성되지 않았습니다. 잠시 후 다시 시도해 주세요.',
          type: contentType,
          size: contentLength,
        },
        { status: 502 }
      );
    }

    // 최종 MIME 타입 결정
    let finalMime = contentType;
    if (!finalMime || finalMime.includes('application/octet-stream') || finalMime.includes('text/plain')) {
      if (sanitizedFilename.endsWith('.mp3')) finalMime = 'audio/mpeg';
      else if (sanitizedFilename.endsWith('.wav')) finalMime = 'audio/wav';
      else if (sanitizedFilename.endsWith('.m4a')) finalMime = 'audio/mp4';
      else if (sanitizedFilename.endsWith('.mp4')) finalMime = 'video/mp4';
      else finalMime = 'audio/mpeg';
    }

    // Content-Disposition 헤더 (RFC 5987 다국어 한글 파일명 지원)
    const asciiFilename = sanitizedFilename.replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(sanitizedFilename);
    const contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;

    const headers = new Headers();
    headers.set('Content-Disposition', contentDisposition);
    headers.set('Content-Type', finalMime);
    if (contentLengthHeader) {
      headers.set('Content-Length', contentLengthHeader);
    }
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    // 스트리밍 방식으로 클라이언트에 즉시 전달
    return new NextResponse(upstreamRes.body, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error('[API/download] 예외 발생:', err.message || err);
    return NextResponse.json(
      { error: '음원 다운로드 프록시 처리 중 오류가 발생했습니다.', details: err.message },
      { status: 500 }
    );
  }
}
