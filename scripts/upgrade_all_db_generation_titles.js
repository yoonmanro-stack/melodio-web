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

function transformTitleToMasterHook(oldTitle, licenseObj) {
  let title = (oldTitle || '').trim();
  const sourceMenu = licenseObj.sourceMenu || licenseObj.source || '';
  const presetId = licenseObj.presetId || licenseObj.metadata?.tab_type || licenseObj.tab_type || '';

  // Clean trailing duplicate markers like " (2)"
  const baseTitle = title.replace(/\s*\(\d+\)$/, '').trim();
  const hasDupSuffix = /\(\d+\)$/.test(title) ? ' ' + title.match(/\(\d+\)$/)[0] : '';

  // 1. Japanese / Japan BGM Forge Menu (Clean & Elegant)
  if (sourceMenu === 'japan' || /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(baseTitle)) {
    if (baseTitle.includes('潮風の絵葉書')) return `[日本BGM] 潮風の絵葉書 — 海辺カフェ時間の静かなインディーポップ${hasDupSuffix}`;
    if (baseTitle.includes('星の囁き 睡眠')) return `[睡眠音楽] 星の囁き — 5分で熟睡できる癒しの睡眠BGM${hasDupSuffix}`;
    if (baseTitle.includes('星の囁き 勉強')) return `[作業用BGM] 星の囁き — 3時間没頭できるジャズホップ${hasDupSuffix}`;
    if (baseTitle.includes('雨の囁き')) return `[雨音Lo-Fi] 雨の囁き — 落ち着くカフェ勉強BGM${hasDupSuffix}`;
  }

  // 2. Korean Healing / Nature / Meditation (Studio & Autopilot) (Clean & Elegant)
  if (baseTitle.includes('숲의 아침')) return `[힐링 BGM] 숲의 아침 — 마음이 차분해지는 숲속 피아노${hasDupSuffix}`;
  if (baseTitle.includes('평온한 숨결')) return `[수면 음악] 평온한 숨결 — 깊은 잠에 빠지는 힐링 멜로디${hasDupSuffix}`;
  if (baseTitle.includes('새벽의 멜로디')) return `[집중 BGM] 새벽의 멜로디 — 3시간 몰입을 부르는 Lofi Beats${hasDupSuffix}`;
  if (baseTitle.includes('자연의 속삭임')) return `[자연 음향] 자연의 속삭임 — 스트레스 해소 힐링 사운드${hasDupSuffix}`;
  if (baseTitle.includes('이슬의 노래')) return `[새벽 감성] 이슬의 노래 — 감성 촉촉 드라이브 BGM${hasDupSuffix}`;
  if (baseTitle.includes('안개의 춤')) return `[몽환 감성] 안개의 춤 — 새벽 감성 몰입 플레이리스트${hasDupSuffix}`;
  if (baseTitle.includes('나무의 속삭임')) return `[힐링 숲] 나무의 속삭임 — 평화로운 숲길 힐링 음악${hasDupSuffix}`;
  if (baseTitle.includes('고요한 아침')) return `[아침 루틴] 고요한 아침 — 상쾌한 갓생 스타트 BGM${hasDupSuffix}`;
  if (baseTitle.includes('평화의 순간')) return `[마음 평화] 평화의 순간 — 차분해지는 클래식 힐링 Sound${hasDupSuffix}`;
  if (baseTitle.includes('가을빛 속 도시')) return `[가을 감성] 가을빛 속 도시의 속삭임 — 심야 감성 BGM${hasDupSuffix}`;
  if (baseTitle.includes('산맥의 심장')) return `[웅장 감성] 산맥의 심장 속으로 — 압도적 오케스트라 사운드트랙${hasDupSuffix}`;
  if (baseTitle.includes('햇살 아래 자유')) return `[드라이브] 햇살 아래 자유 — 청량 인디팝 드라이브 BGM${hasDupSuffix}`;

  // 3. Drive / Hip-Hop / Soul / Meme (Studio & Preset Studio) (Clean & Elegant)
  if (baseTitle.includes('먹빛 깃발')) return `[조선 힙합] 먹빛 깃발 — 밤길을 가르는 웅장한 국악 퓨전 힙합${hasDupSuffix}`;
  if (baseTitle.includes('푸른 승강장')) return `[해안 드라이브] 푸른 승강장의 숨결 — 파도 소리와 함께 듣는 인디팝${hasDupSuffix}`;
  if (baseTitle.includes('달빛 속 도시')) return `[심야 드라이브] 달빛 속 도시의 밤 — 몽환적인 시티팝 힐링 BGM${hasDupSuffix}`;

  // 4. Shorts / Parody Comedy Mode (B-Grade Savage Comedy Only)
  if (baseTitle.includes('코인/주식')) return `[소름주의] 코인/주식 고점 인간 지표 송 (내가 사면 폭락 팩폭)${hasDupSuffix}`;

  // 5. Global / English Titles (Clean & Professional)
  if (baseTitle.includes('Whispers in the Midnight Groove')) return `[Late Night Soul] Whispers in the Midnight Groove — Driving R&B${hasDupSuffix}`;
  if (baseTitle.includes('Neon on Marble')) return `[Deep Focus] Neon on Marble Study Music — Authentic Chill Reverie${hasDupSuffix}`;
  if (baseTitle.includes('Cozy night study ambiance')) return `[Cozy Lo-Fi] Cozy Night Study Ambiance — 3-Hour Deep Concentration${hasDupSuffix}`;
  if (baseTitle.startsWith('Lyria Track') || baseTitle === 'Untitled') return `[Lo-Fi Beats] Chill Ambient Soundscape — Deep Focus Study BGM${hasDupSuffix}`;

  // Clean any remaining "팩폭" from non-viral titles
  if (sourceMenu !== 'viral' && title.includes('팩폭')) {
    return title.replace(/팩폭/g, '감성').replace(/\s+/g, ' ').trim();
  }

  return title;
}

async function main() {
  console.log('🚀 [Ops Team Leader] Refining DB Titles for Music Playlists & BGM Channels (Removing crude slang like 팩폭 from music titles)...');

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
    const newTitle = transformTitleToMasterHook(oldTitle, licenseObj);

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

  console.log(`🎉 ALL MUSIC & BGM TITLES REFINED! Total records updated: ${updatedCount} / ${data.length}`);
}

main();
