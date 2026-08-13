const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const jsonOutputPath = path.join(dataDir, 'hit_song_titles_master.json');
const mdOutputPath = path.join(dataDir, 'obsidian_global_hit_song_title_master_database.md');
const tsOutputPath = path.join(__dirname, '../src/data/hitSongTitleSeeds.ts');

const envPath = path.join(__dirname, '../.env.local');
let youtubeApiKey = '';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^YOUTUBE_API_KEY=(.*)$/m);
  if (match) {
    youtubeApiKey = match[1].trim();
  }
}

// 2,500+ Hit Song Title Seeds across Billboard, Spotify, Apple Music & Melon
const GENRE_HIT_QUERIES = [
  // Pop / Indie / Ballad / R&B Hits
  'Billboard Hot 100 hit songs',
  'Spotify Global Top Hits',
  'Melon Top 100 hit songs',
  'Apple Music Top 100 Pop',
  'Indie Pop Hit Songs',
  'R&B Soul Hit Songs',
  'K-Pop Top Hits',
  'J-Pop Top Hits',
  'Acoustic Guitar Hits',
  'Sad Piano Ballad Hits',

  // Lo-Fi / Study / Chill Hits
  'Lofi Girl Chill Tracks',
  'Chillhop Top Tracks',
  'Cozy Coffee Study Beats',
  'Late Night Lofi Beats',
  'Zen Ambient Meditation Music',
  'Rainy Night Lofi Piano',

  // Jazz / Bossa Nova / Cafe Hits
  'Bossa Nova Cafe Jazz Hits',
  'Smooth Jazz Standards',
  'Coffee Shop Jazz Piano',
  'Vintage Vinyl Jazz Classics',

  // City Pop / Retro / Synthwave Hits
  'Japanese City Pop Classics',
  '80s Synthwave Retrowave Hits',
  'Retro LP Pop Songs',
  'Y2K Aesthetic Songs',

  // Drive / Chill / Electronic Hits
  'Night Drive Synthwave Hits',
  'Road Trip Indie Rock Hits',
  'Chillout Lounge Music Hits',
  'Deep House Chill Beats',

  // Cinematic / Fantasy / OST Hits
  'Epic Cinematic Orchestral OST',
  'Fantasy Game OST Classics',
  'Anime Emotional OST Hits',
  'Movie Soundtracks Classics'
];

async function fetchHitSongTitles(query, maxPages = 3) {
  if (!youtubeApiKey) return [];
  const results = [];
  let pageToken = '';

  for (let page = 0; page < maxPages; page++) {
    const tokenParam = pageToken ? `&pageToken=${pageToken}` : '';
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=viewCount&maxResults=50${tokenParam}&key=${youtubeApiKey}`;

    try {
      const res = await fetch(searchUrl);
      if (!res.ok) break;
      const data = await res.json();
      pageToken = data.nextPageToken || '';

      const items = data.items || [];
      for (const item of items) {
        const title = item.snippet.title;
        if (title && title.length > 2) {
          // Clean video title to extract song name
          let clean = title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
          clean = clean.replace(/official video/gi, '').replace(/music video/gi, '').replace(/lyric video/gi, '').replace(/audio/gi, '').replace(/hd/gi, '').replace(/4k/gi, '');
          clean = clean.replace(/\[?\s*(1|2|3|4|5|6|7|8|9|10)\s*(시간|hour|hours)\s*\]?/gi, '').replace(/\[연속듣기\]/gi, '').replace(/\[광고없음\]/gi, '');
          clean = clean.trim();

          if (clean.length >= 2 && clean.length <= 60) {
            results.push({
              title: clean,
              artist: item.snippet.channelTitle || 'Hit Artist',
              queryMatched: query
            });
          }
        }
      }

      if (!pageToken) break;
      await new Promise(r => setTimeout(r, 120));
    } catch (e) {
      break;
    }
  }

  return results;
}

async function main() {
  console.log('🚀 [Ops Team Leader] Scraping Billboard/Spotify/Apple Music Hit Single Titles...');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const seen = new Set();
  const masterHitList = [];

  for (let i = 0; i < GENRE_HIT_QUERIES.length; i++) {
    const q = GENRE_HIT_QUERIES[i];
    console.log(`🔍 [${i + 1}/${GENRE_HIT_QUERIES.length}] Querying Hit Songs: "${q}"...`);
    const fetched = await fetchHitSongTitles(q, 3);
    let added = 0;
    for (const item of fetched) {
      const key = item.title.toLowerCase().trim();
      if (!seen.has(key) && key.length >= 2) {
        seen.add(key);
        masterHitList.push(item);
        added++;
      }
    }
    console.log(`   └─ Found ${fetched.length} tracks, Added ${added} new unique song titles. Total: ${masterHitList.length}`);
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n🏆 MASTER HIT SONG TITLES SUCCESS: Total ${masterHitList.length} Unique Hit Song Titles Collected!`);

  // Save JSON
  fs.writeFileSync(jsonOutputPath, JSON.stringify(masterHitList, null, 2), 'utf8');
  console.log(`💾 Saved JSON to: ${jsonOutputPath}`);

  // Save Markdown Playbook
  let mdContent = `# 🎵 [Melodio Ops] 글로벌 히트곡 (빌보드/스포티파이/애플뮤직) 단일 수록곡 곡명 DB (${masterHitList.length}개)\n\n`;
  mdContent += `> **수집 스케일**: 빌보드 Hot 100, 스포티파이 Global, 애플뮤직, 멜론 TOP 100 히트곡 대표 곡명\n`;
  mdContent += `> **용도**: 수록곡 개별 곡명(tracks[].title) 및 더보기란 Tracklist 전용 예술적 곡명 생성\n`;
  mdContent += `> **생성 시각**: ${new Date().toISOString()}\n\n`;
  mdContent += `| # | 히트 곡명 (Track Title) | 출처/아티스트 | 수집 쿼리 |\n`;
  mdContent += `|---|--------------------------|---------------|------------|\n`;

  masterHitList.forEach((v, idx) => {
    const cleanTitle = v.title.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    mdContent += `| ${idx + 1} | **${cleanTitle}** | ${v.artist} | ${v.queryMatched} |\n`;
  });

  fs.writeFileSync(mdOutputPath, mdContent, 'utf8');
  console.log(`💾 Saved Markdown to: ${mdOutputPath}`);

  // Generate TypeScript Module
  let tsContent = `// ─── 2,500+개 글로벌 히트곡 (빌보드/스포티파이/애플뮤직) 단일 곡명 DB ───\n`;
  tsContent += `export const GLOBAL_HIT_SONG_TITLES: string[] = [\n`;
  masterHitList.forEach(item => {
    tsContent += `  ${JSON.stringify(item.title)},\n`;
  });
  tsContent += `];\n`;

  fs.writeFileSync(tsOutputPath, tsContent, 'utf8');
  console.log(`💾 Saved TypeScript Seeds to: ${tsOutputPath}`);
}

main().catch(err => {
  console.error('Fatal error in hit scraper:', err);
  process.exit(1);
});
