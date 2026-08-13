const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const dataDir = path.join(__dirname, '../data');
const jsonOutputPath = path.join(dataDir, 'recent_20k_youtube_playlists.json');
const mdOutputPath = path.join(dataDir, 'obsidian_recent_20k_playlist_trends.md');

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

// Dedicated 1H, 2H, 3H, 10H Long-Form Playlist Queries with videoDuration=long
const LONG_PLAYLIST_QUERIES = [
  // 1. 마음의 위로 & 힐링 (1~10시간 수면/힐링 장편 플리)
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '수면 음악 1시간' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '수면 음악 2시간' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '수면 음악 3시간' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '불면증 빗소리 10시간' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '1 hour sleep music relaxing' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '2 hours sleep music rain' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '3 hours deep sleep binaural' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '10 hours sleep ocean waves' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '1時間 睡眠用bgm ピアノ' },
  { conceptId: 'healing', label: '마음의 위로 & 힐링', query: '3時間 睡眠用bgm α波' },

  // 2. 몰입 & 생산성 (1~3시간 공부/코딩 장편 플리)
  { conceptId: 'focus', label: '몰입 & 생산성', query: '공부 bgm 1시간' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '공부 bgm 2시간' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '코딩 bgm 3시간' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '작업용 bgm 1시간' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '1 hour lofi study beats' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '2 hours lofi study beats' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '3 hours coding focus music' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '1時間 勉強用bgm 超集中' },
  { conceptId: 'focus', label: '몰입 & 생산성', query: '3時間 作業用bgm lofi' },

  // 3. 아날로그 & 향수 (1~3시간 레트로/시티팝 장편 플리)
  { conceptId: 'retro', label: '아날로그 & 향수', query: '시티팝 1시간' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: '시티팝 2시간' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: '레트로 LP 1시간' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: '1 hour city pop playlist' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: '2 hours synthwave retrowave' },
  { conceptId: 'retro', label: '아날로그 & 향수', query: '1時間 シティポップ メドレー' },

  // 4. 카페 & 오프라인 공간 (1~3시간 카페 재즈 장편 플리)
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '카페 bgm 1시간' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '카페 재즈 2시간' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '보사노바 카페 3시간' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '1 hour cozy cafe jazz' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '2 hours coffee shop music' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '3 hours bossa nova cafe' },
  { conceptId: 'cafe', label: '카페 & 오프라인 공간', query: '1時間 カフェbgm ジャズ' },

  // 5. 드라이브 & 감성 여행 (1~3시간 드라이브 장편 플리)
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: '드라이브 bgm 1시간' },
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: '심야 드라이브 2시간' },
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: '1 hour night drive lofi' },
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: '2 hours road trip playlist' },
  { conceptId: 'drive', label: '드라이브 & 감성 여행', query: '1時間 ドライブ bgm' },

  // 6. 서사 & 시네마틱 스토리 (1~3시간 판타지/오케스트라 장편 플리)
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: '웅장한 ost 1시간' },
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: '판타지 bgm 2시간' },
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: '1 hour epic cinematic ost' },
  { conceptId: 'story', label: '서사 & 시네마틱 스토리', query: '2 hours dark fantasy orchestra' }
];

async function fetchLongPlaylistVideos(queryObj, maxPages = 4) {
  const q = queryObj.query;
  const allResults = [];
  let pageToken = '';

  for (let page = 0; page < maxPages; page++) {
    const tokenParam = pageToken ? `&pageToken=${pageToken}` : '';
    // Explicitly enforce videoDuration=long (>20 minutes!)
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoDuration=long&publishedAfter=${encodeURIComponent(sixMonthsAgo)}&order=viewCount&maxResults=50${tokenParam}&key=${youtubeApiKey}`;

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
        // Cutoff: 20,000+ views (2만 뷰 이상)
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
      console.error(`Error on long query "${q}" page ${page}:`, err.message);
      break;
    }
  }

  return allResults;
}

async function main() {
  console.log('🚀 [Ops Team Leader] Pure Long-Form (20Min~3H+) YouTube 6-Month 20k+ Playlist Scraper Starting...');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let existingVideos = [];
  if (fs.existsSync(jsonOutputPath)) {
    try {
      existingVideos = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
    } catch (e) {
      existingVideos = [];
    }
  }

  const seenIds = new Set(existingVideos.map(v => v.id));
  const allVideos = [...existingVideos];

  console.log(`📦 Existing dataset size: ${existingVideos.length} titles.`);

  for (let i = 0; i < LONG_PLAYLIST_QUERIES.length; i++) {
    const qObj = LONG_PLAYLIST_QUERIES[i];
    console.log(`🔍 [${i + 1}/${LONG_PLAYLIST_QUERIES.length}] Fetching pure long-form (videoDuration=long): "${qObj.label}" — "${qObj.query}"...`);
    const videos = await fetchLongPlaylistVideos(qObj, 4);
    let addedCount = 0;
    for (const v of videos) {
      if (!seenIds.has(v.id)) {
        seenIds.add(v.id);
        allVideos.push(v);
        addedCount++;
      }
    }
    console.log(`   └─ Found ${videos.length} long videos (20k+ views), Added ${addedCount} new unique titles. Total: ${allVideos.length}`);
    await new Promise(r => setTimeout(r, 200));
  }

  allVideos.sort((a, b) => b.viewCount - a.viewCount);

  console.log(`\n🎉 PURE LONG-FORM PLAYLIST SUCCESS: Total Recent 20k+ Playlist Titles Collected: ${allVideos.length}`);

  fs.writeFileSync(jsonOutputPath, JSON.stringify(allVideos, null, 2), 'utf8');
  console.log(`💾 Saved JSON to: ${jsonOutputPath}`);

  let mdContent = `# 🎵 [Melodio Ops] 대용량 최근 6개월 2만 뷰+ 검증 유튜브 음악 플리 타이틀 DB (${allVideos.length}개)\n\n`;
  mdContent += `> **수집 조건**: 최근 6개월 이내 업로드 + 20분 이상 장편 플리(videoDuration=long) + 1~3시간 뱃지 포함 + 조회수 20,000회 이상\n`;
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
  console.log(`💾 Saved Obsidian Markdown Playbook to: ${mdOutputPath}`);
}

main().catch(err => {
  console.error('Fatal error in scraper:', err);
  process.exit(1);
});
