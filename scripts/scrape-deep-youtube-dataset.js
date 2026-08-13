const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const dataDir = path.join(__dirname, '../data');
const jsonOutputPath = path.join(dataDir, 'youtube_verified_mega_dataset.json');
const mdOutputPath = path.join(dataDir, 'obsidian_youtube_music_playlist_title_master_database.md');

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

// 6 Months Ago ISO timestamp
const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

// Ultimate Playlist Channel Formula Search Queries
const MEGA_PLLY_QUERIES = [
  // 1. [시간/뱃지] + [수면/힐링]
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '1시간 수면' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '2시간 수면' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '3시간 수면' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '10시간 수면' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '1 HOUR sleep music' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '2 HOURS sleep music' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '3 HOURS relaxing sleep' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: 'playlist 수면' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: 'plly 수면' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '빗소리 힐링 플리' },

  // 2. [시간/뱃지] + [몰입/코딩/공부]
  { conceptId: 'focus', label: '몰입 & 생산성', query: '1시간 공부' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '2시간 공부' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '3시간 코딩' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '1 HOUR lofi study' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '2 HOURS lofi beats' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '3 HOURS coding music' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: 'playlist 공부' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: 'plly 코딩' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '개발자 코딩 플리' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '노동요 플리' },

  // 3. [시간/뱃지] + [레트로/시티팝]
  { conceptId: 'retro', label: '아날로그 & 향수', query: '1시간 시티팝' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: '2시간 레트로' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: '1 HOUR city pop' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: '2 HOURS synthwave' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: 'playlist 시티팝' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: 'plly 레트로' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: 'Y2K 감성 플리' },

  // 4. [시간/뱃지] + [카페/재즈]
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '1시간 카페 재즈' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '2시간 카페' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '3시간 보사노바' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '1 HOUR cafe jazz' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '2 HOURS coffee shop' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: 'playlist 카페' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: 'plly 재즈' },

  // 5. [시간/뱃지] + [드라이브/여행]
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: '1시간 드라이브' },
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: '2시간 드라이브' },
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: '1 HOUR night drive' },
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: '2 HOURS road trip' },
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: 'playlist 드라이브' },
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: 'plly 드라이브' },

  // 6. [시간/뱃지] + [시네마틱/판타지]
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: '1시간 웅장한 ost' },
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: '2시간 판타지 ost' },
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: '1 HOUR epic cinematic' },
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: '2 HOURS dark fantasy' },
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: 'playlist 웅장한' },
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: 'plly 판타지' }
];

async function fetchMegaPllyVideos(queryObj, maxPages = 4) {
  const q = queryObj.query;
  const allResults = [];
  let pageToken = '';

  for (let page = 0; page < maxPages; page++) {
    const tokenParam = pageToken ? `&pageToken=${pageToken}` : '';
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&publishedAfter=${encodeURIComponent(sixMonthsAgo)}&order=viewCount&maxResults=50${tokenParam}&key=${youtubeApiKey}`;

    try {
      const res = await fetch(searchUrl);
      if (!res.ok) break;
      const data = await res.json();
      pageToken = data.nextPageToken || '';
      const videoIds = (data.items || []).map(item => item.id.videoId).filter(Boolean);
      if (videoIds.length === 0) break;

      const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}&key=${youtubeApiKey}`;
      const detailRes = await fetch(detailUrl);
      if (!detailRes.ok) break;
      const detailData = await detailRes.json();

      for (const item of detailData.items || []) {
        const viewCount = parseInt(item.statistics.viewCount || '0', 10);
        if (viewCount >= 20000) {
          allResults.push({
            id: item.id,
            conceptId: queryObj.conceptId,
            conceptLabel: queryObj.label,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            viewCount,
            publishedAt: item.snippet.publishedAt,
            queryMatched: q
          });
        }
      }

      if (!pageToken) break;
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.error(`Error on query "${q}":`, err.message);
      break;
    }
  }

  return allResults;
}

async function main() {
  console.log('🚀 [Ops Team Leader] Ultimate Plly Channel Master Title Scraper Starting...');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let existingVideos = [];
  if (fs.existsSync(jsonOutputPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
      existingVideos = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      existingVideos = [];
    }
  }

  const seenIds = new Set(existingVideos.map(v => v.id));
  const allVideos = [...existingVideos];

  console.log(`📦 Loaded existing dataset: ${existingVideos.length} titles.`);

  for (let i = 0; i < MEGA_PLLY_QUERIES.length; i++) {
    const qObj = MEGA_PLLY_QUERIES[i];
    console.log(`🔍 [${i + 1}/${MEGA_PLLY_QUERIES.length}] Query: "${qObj.label}" — "${qObj.query}"...`);
    const videos = await fetchMegaPllyVideos(qObj, 4);
    let addedCount = 0;
    for (const v of videos) {
      if (!seenIds.has(v.id)) {
        seenIds.add(v.id);
        allVideos.push(v);
        addedCount++;
      }
    }
    console.log(`   └─ Found ${videos.length} videos (20k+ views), Added ${addedCount} new unique titles. Total: ${allVideos.length}`);
    await new Promise(r => setTimeout(r, 200));
  }

  allVideos.sort((a, b) => b.viewCount - a.viewCount);

  console.log(`\n🏆 MASTER SUCCESS: Total Verified Playlist Titles Collected: ${allVideos.length}`);

  fs.writeFileSync(jsonOutputPath, JSON.stringify(allVideos, null, 2), 'utf8');
  console.log(`💾 Saved JSON to: ${jsonOutputPath}`);

  let mdContent = `# 🎵 [Melodio Ops] 유튜브 플리 채널 타이틀 3,000+ 검증 대용량 마스터 DB 플레이북 (${allVideos.length}개)\n\n`;
  mdContent += `> **수집 스케일**: 최근 6개월 2만 뷰+ 검증 글로벌 & 한국/일본 대표 음악 플리 타이틀\n`;
  mdContent += `> **타이틀 수사법**: [시간 뱃지] + [청취 맥락/메타포] + [사운드 믹스] 구조 100% 반영\n`;
  mdContent += `> **생성 시각**: ${new Date().toISOString()}\n\n`;
  mdContent += `| # | 조회수 | 채널 대분류 | 2만 뷰+ 검증 유튜브 플리 타이틀 | 채널명 | 업로드일 |\n`;
  mdContent += `|---|------------|--------------|----------------------------------|--------|----------|\n`;

  allVideos.forEach((v, idx) => {
    const formattedViews = v.viewCount >= 10000 
      ? (v.viewCount / 10000).toFixed(1) + '만'
      : v.viewCount.toLocaleString();
    const pubDate = v.publishedAt.split('T')[0];
    const cleanTitle = v.title.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    mdContent += `| ${idx + 1} | ${formattedViews} | ${v.conceptLabel} | **${cleanTitle}** | ${v.channelTitle} | ${pubDate} |\n`;
  });

  fs.writeFileSync(mdOutputPath, mdContent, 'utf8');
  console.log(`💾 Saved Obsidian Master Playbook to: ${mdOutputPath}`);
}

main().catch(err => {
  console.error('Fatal error in scraper:', err);
  process.exit(1);
});
