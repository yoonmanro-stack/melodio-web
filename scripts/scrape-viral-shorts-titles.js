const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const dataDir = path.join(__dirname, '../data');
const jsonOutputPath = path.join(dataDir, 'viral_shorts_scraped_titles.json');
const mdOutputPath = path.join(dataDir, 'viral_shorts_title_analysis.md');

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

const CATEGORY_QUERIES = [
  { category: 'drama', query: 'K드라마 명대사 패러디 쇼츠' },
  { category: 'drama', query: '더글로리 연진아 패러디' },
  { category: 'pet', query: '댕냥이 집사 속마음 쇼츠' },
  { category: 'pet', query: '고양이 강아지 번역기 쇼츠' },
  { category: 'relationship', query: '연애 남녀 심리 번역 쇼츠' },
  { category: 'relationship', query: '남자 카톡 답장 속마음' },
  { category: 'human', query: '직장인 퇴사 팩폭 쇼츠' },
  { category: 'human', query: '현대인 공부 알바 공감 밈' },
  { category: 'brand', query: 'B급 광고 패러디 밈' },
  { category: 'brand', query: '병맛 CF 패러디 쇼츠' },
  { category: 'challenge', query: '도파민 충전 챌린지' },
  { category: 'challenge', query: '갓생 살기 팩폭 동기부여' },
  { category: 'history', query: '역사 위인 패러디 쇼츠' },
  { category: 'history', query: '조선 시대 인스타 유머' },
  { category: 'trend', query: '실시간 이슈 탕후루 요아정 쇼츠' },
  { category: 'trend', query: '요즘 핫한 밈 챌린지' }
];

async function fetchYoutubeShorts(categoryObj) {
  const { category, query } = categoryObj;
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoDuration=short&order=viewCount&maxResults=20&key=${youtubeApiKey}`;

  try {
    const res = await fetch(searchUrl);
    if (!res.ok) {
      console.warn(`Search failed for query "${query}":`, await res.text());
      return [];
    }
    const data = await res.json();
    const videoIds = (data.items || []).map(item => item.id.videoId).filter(Boolean);
    if (videoIds.length === 0) return [];

    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(',')}&key=${youtubeApiKey}`;
    const detailRes = await fetch(detailUrl);
    if (!detailRes.ok) return [];
    const detailData = await detailRes.json();

    return (detailData.items || []).map(item => ({
      id: item.id,
      category,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      viewCount: parseInt(item.statistics.viewCount || '0', 10),
      likeCount: parseInt(item.statistics.likeCount || '0', 10),
      publishedAt: item.snippet.publishedAt,
      queryMatched: query
    }));
  } catch (err) {
    console.error(`Error fetching query "${query}":`, err.message);
    return [];
  }
}

// Hook Formula Parser Engine
function analyzeHookFormula(title) {
  const cleanTitle = title.replace(/#shorts|#Shorts|#쇼츠|#릴스|#TikTok/gi, '').trim();

  let hookType = '공감형';
  if (cleanTitle.includes('?') || cleanTitle.includes('왜')) hookType = '호기심 도발형';
  if (cleanTitle.includes('!') || cleanTitle.includes('ㅋㅋㅋ') || cleanTitle.includes('레전드')) hookType = 'B급 도파민형';
  if (cleanTitle.includes('팩폭') || cleanTitle.includes('현실')) hookType = '팩폭 직격형';
  if (cleanTitle.includes('연진') || cleanTitle.includes('집사') || cleanTitle.includes('상사')) hookType = '상황극 부캐형';

  return {
    cleanTitle,
    hookType
  };
}

async function main() {
  console.log('🚀 [Ops Team Leader] YouTube Viral Shorts Title Scraping & Analysis Engine Started...');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const allVideos = [];
  const seenIds = new Set();

  for (const item of CATEGORY_QUERIES) {
    console.log(`🔍 Scraping YouTube API [${item.category}] Query: "${item.query}"...`);
    const videos = await fetchYoutubeShorts(item);
    for (const v of videos) {
      if (!seenIds.has(v.id)) {
        seenIds.add(v.id);
        const analysis = analyzeHookFormula(v.title);
        allVideos.push({
          ...v,
          cleanTitle: analysis.cleanTitle,
          hookType: analysis.hookType
        });
      }
    }
    await new Promise(r => setTimeout(r, 400));
  }

  allVideos.sort((a, b) => b.viewCount - a.viewCount);

  fs.writeFileSync(jsonOutputPath, JSON.stringify(allVideos, null, 2), 'utf8');
  console.log(`✅ Saved ${allVideos.length} scraped viral titles to JSON: ${jsonOutputPath}`);

  // Generate Report
  let mdContent = `# 🎬 YouTube 100만 구독자 채널 Ops 팀장 보고서: 조회수 폭발 바이럴 숏폼 제목 분석\n\n`;
  mdContent += `> **생성 일시**: ${new Date().toLocaleString('ko-KR')}\n`;
  mdContent += `> **수집 데이터**: 총 ${allVideos.length}개 핫 바이럴 숏폼 제목 (조회수 정렬)\n\n`;

  mdContent += `## 💡 100만 채널 Ops팀장의 핵심 후킹 타이틀 공식 (Viral Title Hook Matrix)\n\n`;
  mdContent += `1. **[상황극/스포일러 괄호 후킹]**: \`[결국 쫓겨남]\`, \`[소름주의]\`, \`[팩폭 100%]\` 괄호로 시선을 먼저 고정.\n`;
  mdContent += `2. **[상대방 지칭/부캐 독백]**: \`연진아\`, \`집사야\`, \`김부장님\` 3초 만에 몰입 유도.\n`;
  mdContent += `3. **[숫자 & 구체성 팩폭]**: \`3초 만에\`, \`249만 원\`, \`월급 250\` 현실적 데이터로 호기심 자극.\n`;
  mdContent += `4. **[반전 의문문]**: \`이게 진짜 나만 그래?\`, \`왜 내 통장은 통과해?\` 공감대 폭발 질문.\n\n`;

  mdContent += `## 📊 수집된 바이럴 타이틀 상위 Top List\n\n`;
  mdContent += `| # | 조회수 | 카테고리 | 후킹 유형 | 정제된 타이틀 | 원본 채널 |\n`;
  mdContent += `|---|------------|----------|-----------|----------------|-----------|\n`;

  allVideos.forEach((v, idx) => {
    const safeTitle = v.cleanTitle.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    mdContent += `| ${idx + 1} | ${(v.viewCount / 10000).toFixed(1)}만 | \`${v.category}\` | ${v.hookType} | **${safeTitle}** | ${v.channelTitle} |\n`;
  });

  fs.writeFileSync(mdOutputPath, mdContent, 'utf8');
  console.log(`✅ Saved Markdown Analysis Report to: ${mdOutputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
