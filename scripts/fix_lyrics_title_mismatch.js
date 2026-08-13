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

function determineLyricsMatchedTitle(record) {
  let licenseObj = {};
  try { licenseObj = JSON.parse(record.license_hash || '{}'); } catch {}

  const lyrics = (licenseObj.lyrics || licenseObj.lyricsPrompt || licenseObj.prompt || '').toLowerCase();
  const currentTitle = record.title || '';
  const dupMatch = currentTitle.match(/\(\d+\)$/);
  const dupSuffix = dupMatch ? ' ' + dupMatch[0] : '';

  // 1. History Preset - Distinguish Alexander/Cleopatra vs Yi Sun-sin
  if (lyrics.includes('알렉산더') || lyrics.includes('아리스토텔레스') || lyrics.includes('클레오파트라') || lyrics.includes('네로 황제')) {
    return `[역사 환생] 알렉산더 & 클레오파트라 2026년 지하철 환승 대소동${dupSuffix}`;
  }
  if (lyrics.includes('이순신') || lyrics.includes('광화문') || lyrics.includes('갑옷엔 택시')) {
    return `[조선 인스타] 이순신 장군님이 2026년에 환생하셨다면?${dupSuffix}`;
  }

  // 2. K-Drama Preset - Distinguish Yeon-jin vs general drama
  if (lyrics.includes('연진') || lyrics.includes('동은') || lyrics.includes('꿈은 너야')) {
    return `[통장 0원] 연진아 내 꿈은 너야... 카드값 팩폭 슬픔송${dupSuffix}`;
  }

  // 3. Brand/Meme Preset - Distinguish iPhone vs general brand
  if (lyrics.includes('아이폰') || lyrics.includes('액정') || lyrics.includes('수리비')) {
    return `새로 산 아이폰 16 액정 3초 만에 박살 났을 때 듣는 슬픔송${dupSuffix}`;
  }

  // 4. Pet Preset - Distinguish Cat/Dog food bowl
  if (lyrics.includes('밥그릇') || lyrics.includes('집사') || lyrics.includes('묘권')) {
    return `집사야 밥그릇이 3초간 비었다 (묘권 침해 팩폭가)${dupSuffix}`;
  }

  // 5. Relationship Preset
  if (lyrics.includes('카톡') || lyrics.includes('답장') || lyrics.includes('읽씹')) {
    return `남자들 카톡 답장 20분 늦을 때 진짜 속마음 번역기${dupSuffix}`;
  }

  // 6. Food Meme Preset
  if (lyrics.includes('탕후루') || lyrics.includes('요아정') || lyrics.includes('잔고')) {
    return `탕후루 가고 요아정 3kg 빠졌다는 내 통장 잔고 팩폭${dupSuffix}`;
  }

  // 7. Fire Noodle Challenge Preset
  if (lyrics.includes('불닭') || lyrics.includes('매운맛') || lyrics.includes('지옥')) {
    return `[불닭 챌린지] 불닭 맵부심 지옥의 묵시록 — 극강의 매운맛 록 챌린지${dupSuffix}`;
  }

  return currentTitle;
}

async function main() {
  console.log('🚀 [Ops Team Leader Diagnostic Fix] Fixing Title-Lyrics Mismatches in Supabase DB...');

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
    const newTitle = determineLyricsMatchedTitle(g);

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
        console.log(`✅ Fixed Mismatch [${g.id.slice(0, 8)}]:`);
        console.log(`   Old: ${oldTitle}`);
        console.log(`   New: ${newTitle}`);
        updatedCount++;
      } else {
        console.error(`❌ Error updating ${g.id}:`, updErr);
      }
    }
  }

  console.log(`🎉 TITLE-LYRICS MISMATCH FIX COMPLETED! Total records fixed: ${updatedCount}`);
}

main();
