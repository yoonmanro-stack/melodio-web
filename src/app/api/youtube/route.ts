import { NextRequest, NextResponse } from "next/server";

const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const BASE = "https://www.googleapis.com/youtube/v3";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (!YT_API_KEY) {
    return NextResponse.json({ error: "YouTube API 키가 설정되지 않았습니다." }, { status: 500 });
  }

  try {
    // ── 채널 검색 ──────────────────────────────────
    if (action === "search_channel") {
      const query = searchParams.get("q") || "";
      const res = await fetch(
        `${BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=6&key=${YT_API_KEY}`
      );
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ error: data.error?.message }, { status: res.status });

      const channels = (data.items || []).map((item: any) => ({
        channelId: item.snippet.channelId,
        title: item.snippet.channelTitle,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails?.default?.url,
        publishedAt: item.snippet.publishedAt,
      }));
      return NextResponse.json({ channels });
    }

    // ── 채널 상세 통계 ─────────────────────────────
    if (action === "channel_stats") {
      const channelId = searchParams.get("channelId") || "";
      const res = await fetch(
        `${BASE}/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${YT_API_KEY}`
      );
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ error: data.error?.message }, { status: res.status });

      const ch = data.items?.[0];
      if (!ch) return NextResponse.json({ error: "채널을 찾을 수 없습니다." }, { status: 404 });

      return NextResponse.json({
        channelId: ch.id,
        title: ch.snippet.title,
        description: ch.snippet.description,
        thumbnail: ch.snippet.thumbnails?.high?.url,
        country: ch.snippet.country,
        subscriberCount: parseInt(ch.statistics.subscriberCount || "0"),
        viewCount: parseInt(ch.statistics.viewCount || "0"),
        videoCount: parseInt(ch.statistics.videoCount || "0"),
        bannerUrl: ch.brandingSettings?.image?.bannerExternalUrl,
      });
    }

    // ── 채널 최신 영상 목록 ────────────────────────
    if (action === "channel_videos") {
      const channelId = searchParams.get("channelId") || "";
      // uploads 플레이리스트 ID 가져오기
      const chRes = await fetch(
        `${BASE}/channels?part=contentDetails&id=${channelId}&key=${YT_API_KEY}`
      );
      const chData = await chRes.json();
      const uploadsId = chData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsId) return NextResponse.json({ videos: [] });

      const vidRes = await fetch(
        `${BASE}/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=8&key=${YT_API_KEY}`
      );
      const vidData = await vidRes.json();

      const videos = (vidData.items || []).map((item: any) => ({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.medium?.url,
        publishedAt: item.snippet.publishedAt,
      }));
      return NextResponse.json({ videos });
    }

    // ── 트렌딩 AI 음악 영상 검색 ──────────────────
    if (action === "trending_music") {
      const query = searchParams.get("q") || "lo-fi hip hop 24/7";
      const res = await fetch(
        `${BASE}/search?part=snippet&type=video&q=${encodeURIComponent(query)}&videoCategoryId=10&order=viewCount&maxResults=8&key=${YT_API_KEY}`
      );
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ error: data.error?.message }, { status: res.status });

      const videos = (data.items || []).map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url,
        publishedAt: item.snippet.publishedAt,
      }));
      return NextResponse.json({ videos });
    }

    return NextResponse.json({ error: "알 수 없는 action입니다." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
