const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['\"]|['\"]$/g, '');
    env[key] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);

function generateExactLyricsTitle(record) {
  let licenseObj = {};
  try { licenseObj = JSON.parse(record.license_hash || '{}'); } catch {}

  const lyrics = (licenseObj.lyrics || licenseObj.lyricsPrompt || licenseObj.prompt || '').toLowerCase();
  const stylePrompt = (licenseObj.stylePrompt || licenseObj.style_prompt || '').toLowerCase();
  const currentTitle = record.title || '';
  const sourceMenu = licenseObj.sourceMenu || licenseObj.source || '';
  const presetId = licenseObj.presetId || licenseObj.metadata?.tab_type || licenseObj.tab_type || '';

  const dupMatch = currentTitle.match(/\(\d+\)$/);
  const dupSuffix = dupMatch ? ' ' + dupMatch[0] : '';

  // 1. Specific Keyword Matching in Lyrics
  if (lyrics.includes('샤워') || lyrics.includes('수건') || lyrics.includes('헬스장')) {
    return `[헬스장 억울] 헬스장 샤워실 수건 안 챙기고 들어갔을 때 슬픔송${dupSuffix}`;
  }
  if (lyrics.includes('택배') || lyrics.includes('요가 매트') || lyrics.includes('요가매트')) {
    return `[택배 힐링] 요가 매트 위 매일 도착하는 택배 상자 언박싱 챌린지가${dupSuffix}`;
  }
  if (lyrics.includes('와이파이') && (lyrics.includes('카페') || lyrics.includes('배터리') || lyrics.includes('신호'))) {
    return `[와이파이 대혼란] 카페 와이파이 끊기고 배터리 3% 남았을 때 안절부절 반응${dupSuffix}`;
  }
  if (lyrics.includes('알렉산더') || lyrics.includes('아리스토텔레스') || lyrics.includes('클레오파트라') || lyrics.includes('네로 황제')) {
    return `[역사 환생] 알렉산더 & 클레오파트라 2026년 지하철 환승 대소동${dupSuffix}`;
  }
  if (lyrics.includes('광화문') || lyrics.includes('이순신') || lyrics.includes('갑옷엔 택시')) {
    return `[조선 인스타] 이순신 장군님이 2026년에 환생하셨다면?${dupSuffix}`;
  }
  if (lyrics.includes('연진') || lyrics.includes('동은') || lyrics.includes('내 꿈은 너야')) {
    return `[통장 0원] 연진아 내 꿈은 너야... 카드값 팩폭 슬픔송${dupSuffix}`;
  }
  if (lyrics.includes('아이폰') && (lyrics.includes('할부') || lyrics.includes('콘크리트') || lyrics.includes('거미줄'))) {
    return `새로 산 아이폰 16 액정 3초 만에 박살 났을 때 듣는 슬픔송${dupSuffix}`;
  }
  if (lyrics.includes('지문') && (lyrics.includes('아이폰') || lyrics.includes('극세사') || lyrics.includes('얼룩'))) {
    return `새로 산 스마트폰 액정에 누군가 지문 찍었을 때 극세사 닦기 송${dupSuffix}`;
  }
  if (lyrics.includes('탕후루') || lyrics.includes('요아정')) {
    return `탕후루 가고 요아정 3kg 빠졌다는 내 통장 잔고 팩폭${dupSuffix}`;
  }
  if (lyrics.includes('불닭') || lyrics.includes('지옥의 묵시록') || lyrics.includes('맵부심')) {
    return `[불닭 챌린지] 불닭 맵부심 지옥의 묵시록 — 극강의 매운맛 록 챌린지${dupSuffix}`;
  }

  // 2. Japanese Tracks
  if (lyrics.includes('潮風の絵葉書') || lyrics.includes('海辺')) {
    return `[日本BGM] 潮風の絵葉書 — 海辺カフェ時間の静かなインディーポップ${dupSuffix}`;
  }
  if (lyrics.includes('星の囁き') && (lyrics.includes('睡眠') || lyrics.includes('夢'))) {
    return `[睡眠音楽] 星の囁き — 5分で熟睡できる癒しの睡眠BGM${dupSuffix}`;
  }
  if (lyrics.includes('星の囁き') && (lyrics.includes('勉強') || lyrics.includes('作業'))) {
    return `[作業用BGM] 星の囁き — 3時間没頭できるジャズホップ${dupSuffix}`;
  }
  if (lyrics.includes('雨の囁き')) {
    return `[雨音Lo-Fi] 雨の囁き — 落ち着くカフェ勉強BGM${dupSuffix}`;
  }
  if (lyrics.includes('夏の空') || lyrics.includes('夏の静寂')) {
    return `[夏風BGM] 夏の静寂 — 静かな海辺のカフェChill Beats${dupSuffix}`;
  }

  // 3. Korean Healing & BGM Tracks
  if (lyrics.includes('숲속') || lyrics.includes('숲의 아침') || lyrics.includes('새벽의 숲')) {
    return `[힐링 BGM] 숲의 아침 — 마음이 차분해지는 숲속 피아노${dupSuffix}`;
  }
  if (lyrics.includes('평온한 숨결') || lyrics.includes('깊은 잠')) {
    return `[수면 음악] 평온한 숨결 — 깊은 잠에 빠지는 힐링 멜로디${dupSuffix}`;
  }
  if (lyrics.includes('새벽의 멜로디') || lyrics.includes('새벽의 울려')) {
    return `[집중 BGM] 새벽의 멜로디 — 3시간 몰입을 부르는 Lofi Beats${dupSuffix}`;
  }
  if (lyrics.includes('자연의 속삭임') || lyrics.includes('자연의 부드러운')) {
    return `[자연 음향] 자연의 속삭임 — 스트레스 해소 힐링 사운드${dupSuffix}`;
  }
  if (lyrics.includes('이슬의 노래') || lyrics.includes('풀잎 위의 이슬')) {
    return `[새벽 감성] 이슬의 노래 — 감성 촉촉 드라이브 BGM${dupSuffix}`;
  }
  if (lyrics.includes('안개의 춤') || lyrics.includes('안개가 춤추는')) {
    return `[몽환 감성] 안개의 춤 — 새벽 감성 몰입 플레이리스트${dupSuffix}`;
  }
  if (lyrics.includes('나무의 속삭임') || lyrics.includes('나무들이 속삭여')) {
    return `[힐링 숲] 나무의 속삭임 — 평화로운 숲길 힐링 음악${dupSuffix}`;
  }
  if (lyrics.includes('고요한 아침')) {
    return `[아침 루틴] 고요한 아침 — 상쾌한 갓생 스타트 BGM${dupSuffix}`;
  }
  if (lyrics.includes('평화의 순간') || lyrics.includes('평화로운 순간')) {
    return `[마음 평화] 평화의 순간 — 차분해지는 클래식 힐링 Sound${dupSuffix}`;
  }

  // 4. Drive & Traditional Fusion
  if (lyrics.includes('먹빛 깃발') || lyrics.includes('조선 붐뱁')) {
    return `[조선 힙합] 먹빛 깃발 — 밤길을 가르는 웅장한 국악 퓨전 힙합${dupSuffix}`;
  }
  if (lyrics.includes('푸른 승강장')) {
    return `[해안 드라이브] 푸른 승강장의 숨결 — 파도 소리와 함께 듣는 인디팝${dupSuffix}`;
  }
  if (lyrics.includes('달빛 속 도시')) {
    return `[심야 드라이브] 달빛 속 도시의 밤 — 몽환적인 시티팝 힐링 BGM${dupSuffix}`;
  }

  return currentTitle;
}

async function main() {
  console.log('🚀 [Ops Team Leader Precision Alignment] Re-aligning ALL Generation Titles to exact lyrics content...');

  const { data, error } = await supabase
    .from('generations')
    .select('id, title, license_hash')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching generations:', error);
    return;
  }

  let updatedCount = 0;

  for (const g of data) {
    const oldTitle = g.title || '';
    const newTitle = generateExactLyricsTitle(g);

    if (newTitle !== oldTitle) {
      let licenseObj = {};
      try { licenseObj = JSON.parse(g.license_hash || '{}'); } catch {}
      licenseObj.title = newTitle;

      const { error: updErr } = await supabase
        .from('generations')
        .update({
          title: newTitle,
          license_hash: JSON.stringify(licenseObj)
        })
        .eq('id', g.id);

      if (!updErr) {
        console.log(`✅ [${g.id.slice(0, 8)}] Re-aligned Title:`);
        console.log(`   Old: "${oldTitle}"`);
        console.log(`   New: "${newTitle}"`);
        updatedCount++;
      } else {
        console.error(`❌ Error updating ${g.id}:`, updErr);
      }
    }
  }

  console.log(`🎉 PRECISION REALIGNMENT COMPLETE! Total records updated: ${updatedCount} / ${data.length}`);
}

main();
