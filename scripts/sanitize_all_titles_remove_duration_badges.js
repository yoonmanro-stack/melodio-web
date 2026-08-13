const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../data/youtube_verified_mega_dataset.json');
const mdOutputPath = path.join(__dirname, '../data/obsidian_youtube_music_playlist_title_master_database.md');
const tsPath = path.join(__dirname, '../src/data/nicheMasterSeeds.ts');

if (!fs.existsSync(jsonPath)) {
  console.error('Error: dataset json missing');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Regex to scrub garbage duration & ad tags: [1시간], [2시간], [3시간], [10시간], [연속듣기], [광고없음], [1 HOUR], [2 HOURS] etc.
const BAD_TAGS_REGEX = /\[?\s*(1|2|3|4|5|6|7|8|9|10)\s*(시간|시간연속듣기|시간 연속듣기|hour|hours|h)\s*\]?|\[연속듣기\]|\[광고없음\]|\[광고 없음\]|\[광고\s*X\]|\[no ads\]|\[no ad\]/gi;

let cleanedCount = 0;

const sanitizedList = data.map(item => {
  if (!item || !item.title) return item;
  let oldTitle = item.title;
  let newTitle = oldTitle.replace(BAD_TAGS_REGEX, '').trim();

  // Clean leading/trailing empty brackets or punctuation
  newTitle = newTitle.replace(/^[\s\-\|:;,.]+/, '').replace(/[\s\-\|:;,.]+$/, '').trim();

  if (oldTitle !== newTitle) {
    cleanedCount++;
  }

  return {
    ...item,
    title: newTitle
  };
});

// Remove duplicates after sanitization
const seen = new Set();
const uniqueList = [];
sanitizedList.forEach(v => {
  if (!v || !v.title) return;
  const key = v.title.toLowerCase().trim();
  if (!seen.has(key) && key.length > 3) {
    seen.add(key);
    uniqueList.push(v);
  }
});

uniqueList.sort((a, b) => b.viewCount - a.viewCount);

console.log(`🧹 Cleaned duration/ad badges from ${cleanedCount} titles! Total unique clean titles: ${uniqueList.length}`);

// Save JSON
fs.writeFileSync(jsonPath, JSON.stringify(uniqueList, null, 2), 'utf8');

// Save Markdown
let mdOutput = `# 🎵 [Melodio Ops] 유튜브 플리 채널 타이틀 ${uniqueList.length}개 검증 대용량 마스터 DB 플레이북 (클린 감성 훅 100% 정제)\n\n`;
mdOutput += `> **정제 가이드**: [1시간], [2시간], [연속듣기], [광고없음] 등 쓰레기 태그 100% 제거 완료\n`;
mdOutput += `> **타이틀 수사법**: 모바일 15자 황금 입지 100% 전면 감성/청취 맥락 훅 배치\n`;
mdOutput += `> **갱신 시각**: ${new Date().toISOString()}\n\n`;
mdOutput += `| # | 조회수 | 채널 대분류 | 2만 뷰+ 검증 유튜브 플리 타이틀 | 채널명 |\n`;
mdOutput += `|---|------------|--------------|----------------------------------|--------|\n`;

uniqueList.forEach((v, idx) => {
  const formattedViews = v.viewCount >= 100000000
    ? (v.viewCount / 100000000).toFixed(1) + '억'
    : v.viewCount >= 10000 
    ? (v.viewCount / 10000).toFixed(1) + '만'
    : v.viewCount ? v.viewCount.toLocaleString() : '';
  const cleanTitle = v.title.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  mdOutput += `| ${idx + 1} | ${formattedViews} | ${v.conceptLabel || '플리 BGM'} | **${cleanTitle}** | ${v.channelTitle || 'YouTube Channel'} |\n`;
});

fs.writeFileSync(mdOutputPath, mdOutput, 'utf8');

// Rebuild TypeScript TS Master Seeds
const CATEGORY_MAP = {
  healing: [],
  focus: [],
  retro: [],
  cafe: [],
  drive: [],
  story: []
};

uniqueList.forEach(item => {
  const title = item.title;
  const lower = title.toLowerCase();

  let conceptId = item.conceptId || 'healing';
  if (lower.includes('study') || lower.includes('focus') || lower.includes('coding') || lower.includes('공부') || lower.includes('작업') || lower.includes('몰입') || lower.includes('노동요')) {
    conceptId = 'focus';
  } else if (lower.includes('city pop') || lower.includes('retro') || lower.includes('synthwave') || lower.includes('vinyl') || lower.includes('시티팝') || lower.includes('레트로') || lower.includes('y2k') || lower.includes('lp')) {
    conceptId = 'retro';
  } else if (lower.includes('cafe') || lower.includes('jazz') || lower.includes('bossa') || lower.includes('brunch') || lower.includes('카페') || lower.includes('재즈') || lower.includes('브런치')) {
    conceptId = 'cafe';
  } else if (lower.includes('drive') || lower.includes('night') || lower.includes('road trip') || lower.includes('드라이브') || lower.includes('노을') || lower.includes('해안도로')) {
    conceptId = 'drive';
  } else if (lower.includes('epic') || lower.includes('cinematic') || lower.includes('fantasy') || lower.includes('ost') || lower.includes('웅장') || lower.includes('판타지') || lower.includes('웹툰')) {
    conceptId = 'story';
  } else if (lower.includes('sleep') || lower.includes('rain') || lower.includes('relax') || lower.includes('heal') || lower.includes('수면') || lower.includes('힐링') || lower.includes('빗소리') || lower.includes('명상')) {
    conceptId = 'healing';
  }

  let cleanLabel = title.length > 32 ? title.substring(0, 30) + '...' : title;
  cleanLabel = cleanLabel.replace(/#\S+/g, '').trim();

  const formattedViews = item.viewCount >= 100000000
    ? (item.viewCount / 100000000).toFixed(1) + '억'
    : item.viewCount >= 10000 
    ? (item.viewCount / 10000).toFixed(1) + '만'
    : item.viewCount ? item.viewCount.toLocaleString() : '';

  const prefix = formattedViews ? `🔥 [${formattedViews}뷰] ` : '🎯 ';

  CATEGORY_MAP[conceptId].push({
    label: `${prefix}${cleanLabel}`,
    value: title
  });
});

let tsContent = `// ─── 2,370+개 순수 감성 훅 100% 마스터 유튜브 플리 타이틀 DB 연동 ───\n`;
tsContent += `export interface NicheSeedItem {\n  label: string;\n  value: string;\n}\n\n`;
tsContent += `export const MASTER_NICHE_SEEDS: Record<string, NicheSeedItem[]> = {\n`;

Object.keys(CATEGORY_MAP).forEach(key => {
  tsContent += `  ${key}: [\n`;
  CATEGORY_MAP[key].forEach(seed => {
    tsContent += `    { label: ${JSON.stringify(seed.label)}, value: ${JSON.stringify(seed.value)} },\n`;
  });
  tsContent += `  ],\n`;
});

tsContent += `};\n`;

fs.writeFileSync(tsPath, tsContent, 'utf8');
console.log(`✅ Cleaned and generated ${tsPath} with ${uniqueList.length} pure emotional hook titles!`);
