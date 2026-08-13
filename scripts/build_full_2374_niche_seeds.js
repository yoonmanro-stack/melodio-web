const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../data/youtube_verified_mega_dataset.json');
const outputPath = path.join(__dirname, '../src/data/nicheMasterSeeds.ts');

if (!fs.existsSync(jsonPath)) {
  console.error('Error: youtube_verified_mega_dataset.json not found');
  process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const CATEGORY_MAP = {
  healing: [],
  focus: [],
  retro: [],
  cafe: [],
  drive: [],
  story: []
};

// Categorize all 2374 records
rawData.forEach(item => {
  if (!item || !item.title) return;
  const title = item.title.trim();
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

// Safe Stringify Generator
let tsContent = `// ─── 2,374개 마스터 유튜브 플리 타이틀 DB 연동 틈새 시드 풀 ───\n`;
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

fs.writeFileSync(outputPath, tsContent, 'utf8');
console.log(`✅ Generated safely escaped ${outputPath} with all 2,374 master titles!`);
