const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const dataDir = path.join(__dirname, '../data');
const jsonOutputPath = path.join(dataDir, 'youtube_playlist_and_viral_titles.json');
const mdPlaylistReportPath = path.join(dataDir, 'obsidian_youtube_music_playlist_titles.md');
const mdViralReportPath = path.join(dataDir, 'obsidian_youtube_viral_shorts_titles.md');

let youtubeApiKey = '';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^YOUTUBE_API_KEY=(.*)$/m);
  if (match) {
    youtubeApiKey = match[1].trim();
  }
}

if (!youtubeApiKey) {
  console.error('Error: YOUTUBE_API_KEY not found in .env.local');
  process.exit(1);
}

// Dual Category Queries: Playlist vs Viral Shorts
const PLAYLIST_QUERIES = [
  { type: 'playlist', menu: 'studio', genre: 'lofi bgm coding study', label: 'Lo-Fi 공부/작업' },
  { type: 'playlist', menu: 'studio', genre: 'calm chill sleep music', label: '힐링/수면 음악' },
  { type: 'playlist', menu: 'studio', genre: '조선 힙합 국악 퓨전', label: '조선 퓨전 힙합' },
  { type: 'playlist', menu: 'studio', genre: '심야 드라이브 시티팝 bgm', label: '심야 드라이브 시티팝' },
  { type: 'playlist', menu: 'japan', genre: '作業用bgm カフェ lofi', label: '일본 카페 BGM' },
  { type: 'playlist', menu: 'japan', genre: '睡眠用bgm 癒し ピアノ', label: '일본 수면 힐링' },
  { type: 'playlist', menu: 'style-library', genre: '신나는 트로트 인기곡 메들리', label: '인기 트로트 메들리' }
];

const VIRAL_QUERIES = [
  { type: 'viral', category: 'drama', query: 'K드라마 명대사 패러디 쇼츠' },
  { type: 'viral', category: 'pet', query: '댕냥이 집사 속마음 쇼츠' },
  { type: 'viral', category: 'relationship', query: '연애 남녀 심리 번역 쇼츠' },
  { type: 'viral', category: 'human', query: '직장인 퇴사 팩폭 쇼츠' },
  { type: 'viral', category: 'brand', query: 'B급 광고 패러디 밈 쇼츠' },
  { type: 'viral', category: 'challenge', query: '도파민 충전 챌린지' }
];

async function fetchYoutubeVideos(queryObj) {
  const { type, query, genre } = queryObj;
  const q = query || genre;
  const durationParam = type === 'viral' ? '&videoDuration=short' : '&videoDuration=long';
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video${durationParam}&order=viewCount&maxResults=20&key=${youtubeApiKey}`;

  try {
    const res = await fetch(searchUrl);
    if (!res.ok) return [];
    const data = await res.json();
    const videoIds = (data.items || []).map(item => item.id.videoId).filter(Boolean);
    if (videoIds.length === 0) return [];

    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}&key=${youtubeApiKey}`;
    const detailRes = await fetch(detailUrl);
    if (!detailRes.ok) return [];
    const detailData = await detailRes.json();

    return (detailData.items || []).map(item => ({
      id: item.id,
      type,
      label: queryObj.label || queryObj.category,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      viewCount: parseInt(item.statistics.viewCount || '0', 10),
      publishedAt: item.snippet.publishedAt,
      queryMatched: q
    }));
  } catch (err) {
    console.error(`Error fetching query "${q}":`, err.message);
    return [];
  }
}

async function main() {
  console.log('🚀 [Ops Team Leader] Dual YouTube Scraper (Playlist BGM vs Viral Shorts) Running...');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const allPlaylistVideos = [];
  const allViralVideos = [];
  const seenIds = new Set();

  for (const item of PLAYLIST_QUERIES) {
    console.log(`🔍 [Playlist BGM] Query: "${item.genre}"...`);
    const videos = await fetchYoutubeVideos(item);
    for (const v of videos) {
      if (!seenIds.has(v.id)) {
        seenIds.add(v.id);
        allPlaylistVideos.push(v);
      }
    }
    await new Promise(r => setTimeout(r, 400));
  }

  for (const item of VIRAL_QUERIES) {
    console.log(`🔍 [Viral Shorts] Query: "${item.query}"...`);
    const videos = await fetchYoutubeVideos(item);
    for (const v of videos) {
      if (!seenIds.has(v.id)) {
        seenIds.add(v.id);
        allViralVideos.push(v);
      }
    }
    await new Promise(r => setTimeout(r, 400));
  }

  allPlaylistVideos.sort((a, b) => b.viewCount - a.viewCount);
  allViralVideos.sort((a, b) => b.viewCount - a.viewCount);

  const combined = { playlist: allPlaylistVideos, viral: allViralVideos };
  fs.writeFileSync(jsonOutputPath, JSON.stringify(combined, null, 2), 'utf8');

  // 1. Generate Playlist Obsidian Report
  let mdPlaylist = `# 🎵 [100만 구독자 Ops팀장] 유튜브 음악 플레이리스트 채널 타이틀 마스터 프레임워크\n\n`;
  mdPlaylist += `> **수집 데이터**: 총 ${allPlaylistVideos.length}개 억 단위/백만 단위 조회수 음악 플리 타이틀 (조회수 정렬)\n`;
  mdPlaylist += `> **핵심 원칙**: 팩폭, B급 등 은어 100% 금지. [장르/분위기 뱃지] + 시적 메타포 + 타겟 유스케이스 결합\n\n`;

  mdPlaylist += `| # | 조회수 | 카테고리 | 플레이리스트 채널 타이틀 | 채널명 |\n`;
  mdPlaylist += `|---|------------|----------|---------------------------|--------|\n`;
  allPlaylistVideos.forEach((v, idx) => {
    const safeTitle = v.title.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    mdPlaylist += `| ${idx + 1} | ${(v.viewCount / 10000).toFixed(1)}만 | \`${v.label}\` | **${safeTitle}** | ${v.channelTitle} |\n`;
  });
  fs.writeFileSync(mdPlaylistReportPath, mdPlaylist, 'utf8');

  // 2. Generate Viral Shorts Obsidian Report
  let mdViral = `# 🎬 [100만 구독자 Ops팀장] 유튜브 B급 패러디 숏폼 후킹 타이틀 마스터 프레임워크\n\n`;
  mdViral += `> **수집 데이터**: 총 ${allViralVideos.length}개 백만 단위 핫 바이럴 숏폼 타이틀 (조회수 정렬)\n`;
  mdViral += `> **핵심 원칙**: [상황 괄호] + 부캐 독백 + 팩폭/숫자 펀치라인으로 0.1초 시선 강제 고정\n\n`;

  mdViral += `| # | 조회수 | 카테고리 | 바이럴 숏폼 타이틀 | 채널명 |\n`;
  mdViral += `|---|------------|----------|--------------------|--------|\n`;
  allViralVideos.forEach((v, idx) => {
    const safeTitle = v.title.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    mdViral += `| ${idx + 1} | ${(v.viewCount / 10000).toFixed(1)}만 | \`${v.label}\` | **${safeTitle}** | ${v.channelTitle} |\n`;
  });
  fs.writeFileSync(mdViralReportPath, mdViral);

  console.log(`✅ Dual Scraping & Obsidian Analysis Completed!`);
  console.log(`  - Playlist Report: ${mdPlaylistReportPath}`);
  console.log(`  - Viral Shorts Report: ${mdViralReportPath}`);
}

main().catch(err => console.error('Fatal error:', err));
