const fs = require('fs');
const path = require('path');

// Local path configuration
const envPath = path.join(__dirname, '../.env.local');
const dataDir = path.join(__dirname, '../data');
const jsonOutputPath = path.join(dataDir, 'raw_youtube_titles.json');
const mdOutputPath = path.join(dataDir, 'raw_youtube_titles.md');

// Load environment variables manually from .env.local
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

const QUERIES = [
  'lofi bgm coding study',
  'calm chill lofi beats',
  '트로트 메들리',
  '신나는 트로트 인기곡',
  'chillwave synthwave bgm',
  'cozy acoustic pop bgm'
];

async function fetchYoutubeVideos(query) {
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=viewCount&maxResults=25&key=${youtubeApiKey}`;
  
  try {
    const res = await fetch(searchUrl);
    if (!res.ok) {
      console.warn(`Search failed for query "${query}":`, await res.text());
      return [];
    }
    const data = await res.json();
    const videoIds = (data.items || []).map(item => item.id.videoId).filter(Boolean);
    if (videoIds.length === 0) return [];

    // Fetch detailed statistics (view count)
    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}&key=${youtubeApiKey}`;
    const detailRes = await fetch(detailUrl);
    if (!detailRes.ok) {
      console.warn(`Details fetch failed:`, await detailRes.text());
      return [];
    }
    const detailData = await detailRes.json();
    
    return (detailData.items || []).map(item => ({
      id: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      viewCount: parseInt(item.statistics.viewCount || '0', 10),
      publishedAt: item.snippet.publishedAt,
      queryMatched: query
    }));
  } catch (err) {
    console.error(`Error fetching query "${query}":`, err.message);
    return [];
  }
}

async function main() {
  console.log('Starting YouTube Music Titles Scraping...');
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const allVideos = [];
  const seenIds = new Set();

  for (const query of QUERIES) {
    console.log(`Searching query: "${query}"...`);
    const videos = await fetchYoutubeVideos(query);
    for (const v of videos) {
      if (!seenIds.has(v.id)) {
        seenIds.add(v.id);
        allVideos.push(v);
      }
    }
    // Respect rate limits / API courtesy
    await new Promise(r => setTimeout(r, 500));
  }

  // Sort by viewCount descending
  allVideos.sort((a, b) => b.viewCount - a.viewCount);

  // Write JSON
  fs.writeFileSync(jsonOutputPath, JSON.stringify(allVideos, null, 2), 'utf8');
  console.log(`Saved JSON output to: ${jsonOutputPath}`);

  // Write Markdown Report
  let mdContent = `# Raw YouTube BGM & Music Titles Report\n\n`;
  mdContent += `Generated on: ${new Date().toLocaleString('ko-KR')}\n`;
  mdContent += `Total unique videos scraped: ${allVideos.length}\n\n`;
  mdContent += `| # | View Count | Title | Channel | Query | Published At |\n`;
  mdContent += `|---|------------|-------|---------|-------|--------------|\n`;

  allVideos.forEach((v, idx) => {
    // Escape Markdown pipeline symbols in titles
    const safeTitle = v.title.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    mdContent += `| ${idx + 1} | ${v.viewCount.toLocaleString()} | ${safeTitle} | ${v.channelTitle} | ${v.queryMatched} | ${v.publishedAt.slice(0, 10)} |\n`;
  });

  fs.writeFileSync(mdOutputPath, mdContent, 'utf8');
  console.log(`Saved Markdown report to: ${mdOutputPath}`);
  console.log('Scraping completed successfully.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
