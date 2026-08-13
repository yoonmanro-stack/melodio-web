const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
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

function overhaulTitle(oldTitle, licenseObj) {
  let title = (oldTitle || '').trim();
  const sourceMenu = licenseObj.sourceMenu || licenseObj.source || '';
  const presetId = licenseObj.presetId || licenseObj.metadata?.tab_type || licenseObj.tab_type || '';

  // Preserve duplicate suffix like " (2)"
  const dupMatch = title.match(/\(\d+\)$/);
  const dupSuffix = dupMatch ? ' ' + dupMatch[0] : '';
  let cleanBase = title.replace(/\s*\(\d+\)$/, '').trim();

  // Strip embarrassing legacy prefixes like "[100만 뷰 픽]", "나만의", etc.
  cleanBase = cleanBase.replace(/^\[100만 뷰 픽\]\s*/, '').replace(/^나만의\s*/, '').trim();

  // 1. Viral & Trend Zone (Short-form Parody / Comedy / Memes)
  if (sourceMenu === 'viral' || presetId || cleanBase.includes('챌린지송') || cleanBase.includes('B급 광고')) {
    if (presetId === 'drama' || cleanBase.includes('K-드라마') || cleanBase.includes('연진')) {
      return `[통장 0원] 연진아 내 꿈은 너야... 카드값 팩폭 슬픔송${dupSuffix}`;
    }
    if (presetId === 'pet' || cleanBase.includes('댕냥이') || cleanBase.includes('집사')) {
      return `집사야 밥그릇이 3초간 비었다 (묘권 침해 팩폭가)${dupSuffix}`;
    }
    if (presetId === 'relationship' || cleanBase.includes('연애') || cleanBase.includes('남녀')) {
      return `남자들 카톡 답장 20분 늦을 때 진짜 속마음 번역기${dupSuffix}`;
    }
    if (presetId === 'human' || cleanBase.includes('현대인') || cleanBase.includes('직장인')) {
      return `월급 250 들어왔다 1초 만에 카드값 249만원 퍼가요~♡${dupSuffix}`;
    }
    if (presetId === 'brand' || cleanBase.includes('B급 광고') || cleanBase.includes('아이폰')) {
      return `새로 산 아이폰 16 액정 3초 만에 박살 났을 때 듣는 슬픔송${dupSuffix}`;
    }
    if (presetId === 'trend' || cleanBase.includes('트렌드') || cleanBase.includes('요아정') || cleanBase.includes('탕후루')) {
      return `탕후루 가고 요아정 3kg 빠졌다는 내 통장 잔고 팩폭${dupSuffix}`;
    }
    if (presetId === 'challenge' || cleanBase.includes('도파민') || cleanBase.includes('갓생')) {
      return `[소름주의] 오늘 아침 3초 만에 이불 개기 성공한 갓생 챌린지가${dupSuffix}`;
    }
    if (presetId === 'history' || cleanBase.includes('역사') || cleanBase.includes('이순신')) {
      return `[조선 인스타] 이순신 장군님이 2026년에 환생하셨다면?${dupSuffix}`;
    }
  }

  // 2. Japanese BGM Forge (Japan BGM Menu & Japanese Titles)
  if (sourceMenu === 'japan' || /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(cleanBase)) {
    if (cleanBase.includes('潮風の絵葉書')) return `[日本BGM] 潮風の絵葉書 — 海辺カフェ時間の静かなインディーポップ${dupSuffix}`;
    if (cleanBase.includes('星の囁き 睡眠')) return `[睡眠音楽] 星の囁き — 5分で熟睡できる癒しの睡眠BGM${dupSuffix}`;
    if (cleanBase.includes('星の囁き 勉強')) return `[作業用BGM] 星の囁き — 3時間没頭できるジャズホップ${dupSuffix}`;
    if (cleanBase.includes('雨の囁き')) return `[雨音Lo-Fi] 雨の囁き — 落ち着くカフェ勉強BGM${dupSuffix}`;
  }

  // 3. Audio Forge Pro & Studio & Preset Studio Music Titles
  if (cleanBase.includes('먹빛 깃발')) return `[조선 힙합] 먹빛 깃발 — 밤길을 가르는 웅장한 국악 퓨전 힙합${dupSuffix}`;
  if (cleanBase.includes('푸른 승강장')) return `[해안 드라이브] 푸른 승강장의 숨결 — 파도 소리와 함께 듣는 인디팝${dupSuffix}`;
  if (cleanBase.includes('달빛 속 도시')) return `[심야 드라이브] 달빛 속 도시의 밤 — 몽환적인 시티팝 힐링 BGM${dupSuffix}`;
  if (cleanBase.includes('불닭 맵부심')) return `[불닭 챌린지] 불닭 맵부심 지옥의 묵시록 — 극강의 매운맛 록 챌린지${dupSuffix}`;
  if (cleanBase.includes('아이폰 액정 박살')) return `[아이폰 슬픔] 아이폰 16 액정 박살 — 3초 만에 흘린 눈물의 슬픔송${dupSuffix}`;
  if (cleanBase.includes('코인/주식')) return `[소름주의] 코인/주식 고점 인간 지표 송 (내가 사면 폭락 팩폭)${dupSuffix}`;

  // 4. Korean Healing / Nature / Meditation Music Titles
  if (cleanBase.includes('숲의 아침')) return `[힐링 BGM] 숲의 아침 — 마음이 차분해지는 숲속 피아노${dupSuffix}`;
  if (cleanBase.includes('평온한 숨결')) return `[수면 음악] 평온한 숨결 — 깊은 잠에 빠지는 힐링 멜로디${dupSuffix}`;
  if (cleanBase.includes('새벽의 멜로디')) return `[집중 BGM] 새벽의 멜로디 — 3시간 몰입을 부르는 Lofi Beats${dupSuffix}`;
  if (cleanBase.includes('새벽의 속삭임')) return `[새벽 감성] 새벽의 속삭임 — 잔잔하게 가슴을 적시는 새벽 Lofi${dupSuffix}`;
  if (cleanBase.includes('자연의 속삭임')) return `[자연 음향] 자연의 속삭임 — 스트레스 해소 힐링 사운드${dupSuffix}`;
  if (cleanBase.includes('이슬의 노래')) return `[새벽 감성] 이슬의 노래 — 감성 촉촉 드라이브 BGM${dupSuffix}`;
  if (cleanBase.includes('안개의 춤')) return `[몽환 감성] 안개의 춤 — 새벽 감성 몰입 플레이리스트${dupSuffix}`;
  if (cleanBase.includes('나무의 속삭임')) return `[힐링 숲] 나무의 속삭임 — 평화로운 숲길 힐링 음악${dupSuffix}`;
  if (cleanBase.includes('고요한 아침')) return `[아침 루틴] 고요한 아침 — 상쾌한 갓생 스타트 BGM${dupSuffix}`;
  if (cleanBase.includes('평화의 순간')) return `[마음 평화] 평화의 순간 — 차분해지는 클래식 힐링 Sound${dupSuffix}`;
  if (cleanBase.includes('가을빛 속 도시')) return `[가을 감성] 가을빛 속 도시의 속삭임 — 심야 감성 BGM${dupSuffix}`;
  if (cleanBase.includes('산맥의 심장')) return `[웅장 감성] 산맥의 심장 속으로 — 압도적 오케스트라 사운드트랙${dupSuffix}`;
  if (cleanBase.includes('햇살 아래 자유')) return `[드라이브] 햇살 아래 자유 — 청량 인디팝 드라이브 BGM${dupSuffix}`;

  // 5. Global / English Titles
  if (cleanBase.includes('Whispers in the Midnight Groove')) return `[Late Night Soul] Whispers in the Midnight Groove — Driving R&B${dupSuffix}`;
  if (cleanBase.includes('Neon on Marble')) return `[Deep Focus] Neon on Marble Study Music — Authentic Chill Reverie${dupSuffix}`;
  if (cleanBase.includes('Cozy night study ambiance')) return `[Cozy Lo-Fi] Cozy Night Study Ambiance — 3-Hour Deep Concentration${dupSuffix}`;
  if (cleanBase.startsWith('Lyria Track') || cleanBase === 'Untitled') return `[Lo-Fi Beats] Chill Ambient Soundscape — Deep Focus Study BGM${dupSuffix}`;

  // Final sanity check: remove any leftover crude slang from non-viral tracks
  if (sourceMenu !== 'viral' && title.includes('팩폭')) {
    title = title.replace(/팩폭/g, '감성').replace(/\s+/g, ' ').trim();
  }

  return title;
}

async function main() {
  console.log('🚀 [Ops Team Leader] COMPLETELY OVERHAULING ALL EMBARRASSING DB TITLES IN SUPABASE DB...');

  const { data, error } = await supabase
    .from('generations')
    .select('id, title, license_hash, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching generations:', error);
    return;
  }

  let updatedCount = 0;

  for (const g of data) {
    let licenseObj = {};
    try { licenseObj = JSON.parse(g.license_hash || '{}'); } catch {}

    const oldTitle = g.title || '';
    const newTitle = overhaulTitle(oldTitle, licenseObj);

    if (newTitle !== oldTitle) {
      licenseObj.title = newTitle;
      const { error: updErr } = await supabase
        .from('generations')
        .update({
          title: newTitle,
          license_hash: JSON.stringify(licenseObj)
        })
        .eq('id', g.id);

      if (!updErr) {
        console.log(`✅ [${g.id.slice(0, 8)}] ${oldTitle} ===> ${newTitle}`);
        updatedCount++;
      } else {
        console.error(`❌ Error updating ${g.id}:`, updErr);
      }
    }
  }

  console.log(`🎉 OVERHAUL COMPLETE! Total records updated: ${updatedCount} / ${data.length}`);
}

main();
