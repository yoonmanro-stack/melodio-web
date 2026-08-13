/**
 * 프리셋 카탈로그 썸네일 일괄 생성 (1회성 스크립트)
 *
 * 배경:
 *   Preset Studio 의 카드 195개가 전부 같은 신스웨이브 도시 이미지였다.
 *   PresetGrid.getPresetThumbnail() 의 최종 폴백이
 *     DEFAULT_THUMBNAILS[id] || DEFAULT_THUMBNAILS['tokyo-midnight-1984']
 *   인데, DEFAULT_THUMBNAILS 는 초창기 프리셋 8개의 키만 갖고 있고
 *   옵시디언에서 동기화된 장르 프리셋들의 키는 스네이크 케이스(afro_cuban_jazz 등)라
 *   단 하나도 매칭되지 않았다. 결과적으로 195개가 모두 같은 그림으로 떨어졌다.
 *
 * 엔진:
 *   Pollinations (무료). 프리셋 카드는 16:9 소형 썸네일이라 이 품질로 충분하다.
 *   사용자가 UI에서 새로 만드는 프리셋은 /api/autopilot/generate-image 가
 *   gpt-image-2(유료)로 처리하므로 이 스크립트와 무관하다.
 *
 * 사용법:
 *   node backfill-preset-thumbs.js                # 미리보기
 *   node backfill-preset-thumbs.js --apply
 *   node backfill-preset-thumbs.js --apply --limit 5
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) : 0;
// Pollinations 무료 티어는 레이트 리밋이 빡빡하다(동시 4로 돌렸더니 429 폭주).
// 순차 처리 + 요청 간 간격 + 429 시 지수 백오프로 간다.
const REQUEST_GAP_MS = 4000;
const MAX_RETRIES = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** 카드에 쓰이는 16:9 비율 (PresetGrid 의 aspect-[16/9]) */
const WIDTH = 1024;
const HEIGHT = 576;

/** 콤마/배열 형태 메타 필드를 문자열로 정규화 */
function metaList(v, max) {
  if (!v) return '';
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, max)
    .join(', ');
}

/**
 * 장르 프리셋에서 시각 프롬프트를 만든다.
 *
 * 1차 시도에서는 장르명만 넣고 "rich atmospheric lighting"을 붙였더니
 * 아프로 큐반 재즈가 어두운 뒷골목으로 나왔다. 그 문구가 모든 장르를
 * 어둡고 침침한 쪽으로 몰았다.
 *
 * metadata 에 instruments / mood / signature_instruments 가 이미 들어 있으므로
 * 그것으로 장르를 구체화한다. 악기가 화면에 보이면 장르 식별이 훨씬 쉬워진다.
 */
function buildThumbPrompt(pb) {
  const title = (pb.title || pb.key_name || '').trim();
  // "Yacht Rock / West Coast Smooth AOR (요트 록)" → 영문 장르명만
  const englishName = title.split('(')[0].trim();
  const meta = pb.metadata || {};

  const instruments =
    metaList(meta.signature_instruments, 4) || metaList(meta.instruments, 4);
  const mood = metaList(meta.mood, 3);

  // 헤딩 이름이 문서마다 달라서(## 1. 장르 개요 / ## 💡 핵심 컨셉 …)
  // 첫 번째 본문 문단을 그냥 집어온다.
  let overview = '';
  if (pb.content) {
    const body = pb.content
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('---'))
      .join(' ');
    overview = body.replace(/\s+/g, ' ').slice(0, 200);
  }

  /*
   * ⚠️ 프롬프트에 "no text", "no watermark", "album cover" 를 쓰지 말 것.
   *
   * Pollinations 는 진짜 negative prompt 를 지원하지 않는다. 그 단어들이 그대로
   * 조건으로 들어가 오히려 가짜 글자를 불러온다. 실제로 "Absolutely no text,
   * no letters, no signature, no watermark" 를 넣었더니 이미지 네 귀퉁이에
   * 깨진 글자가 박혀서 나왔다. "album cover" 역시 표지=타이포그래피를 연상시킨다.
   *
   * 대신 글자가 들어갈 자리가 없는 장면을 긍정문으로 지시한다.
   */
  return [
    `Wide cinematic 16:9 scene that visually represents the music genre "${englishName}".`,
    instruments ? `The scene centres on these instruments: ${instruments}.` : '',
    mood ? `Emotional tone: ${mood}.` : '',
    overview ? `Genre context: ${overview}` : '',
    'Colour palette and lighting come from this specific genre.',
    'Pure photographic scene, edge to edge imagery, single clear focal subject, empty margins with only background texture.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** 같은 프리셋은 항상 같은 그림이 나오도록 key_name 으로 시드를 만든다 */
function seedFrom(keyName) {
  let h = 0;
  for (let i = 0; i < keyName.length; i++) h = (h * 31 + keyName.charCodeAt(i)) >>> 0;
  return h % 1000000;
}

async function generateThumb(pb) {
  const prompt = buildThumbPrompt(pb);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 400))}` +
    `?width=${WIDTH}&height=${HEIGHT}&nologo=true&seed=${seedFrom(pb.key_name)}`;

  let buffer = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const b = Buffer.from(await res.arrayBuffer());
      if (b.length >= 2048) {
        buffer = b;
        break;
      }
      throw new Error(`이미지가 너무 작음 (${b.length}B)`);
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`Pollinations ${res.status}`);
    if (attempt === MAX_RETRIES) throw new Error(`Pollinations ${res.status} (${MAX_RETRIES}회 재시도 실패)`);
    // 429/5xx 는 지수 백오프 후 재시도
    await sleep(REQUEST_GAP_MS * Math.pow(2, attempt));
  }
  if (!buffer) throw new Error('이미지 수신 실패');

  const filePath = `preset-thumbs/${pb.key_name}.png`;
  const { error: upErr } = await supabase.storage
    .from('melodio-assets')
    .upload(filePath, buffer, { contentType: 'image/png', upsert: true });
  if (upErr) throw new Error(`업로드: ${upErr.message}`);

  const publicUrl = supabase.storage.from('melodio-assets').getPublicUrl(filePath).data.publicUrl;

  // metadata 는 통째로 덮어쓰지 말고 thumbnail_url 만 병합한다
  const nextMeta = { ...(pb.metadata || {}), thumbnail_url: publicUrl };
  const { error: dbErr } = await supabase
    .from('curation_playbooks')
    .update({ metadata: nextMeta })
    .eq('id', pb.id);
  if (dbErr) throw new Error(`DB: ${dbErr.message}`);

  return { publicUrl, bytes: buffer.length };
}

(async () => {
  const { data, error } = await supabase
    .from('curation_playbooks')
    .select('id,key_name,title,content,metadata,category')
    .in('category', ['genre', 'curation']);

  if (error) {
    console.error('조회 실패:', error.message);
    process.exit(1);
  }

  // --force: 이미 썸네일이 있어도 다시 생성 (프롬프트 개선 후 재생성용).
  // 단 사람이 직접 올린 이미지는 건드리지 않도록 preset-thumbs/ 경로만 대상으로 한다.
  const FORCE = process.argv.includes('--force');
  let targets = data.filter((pb) => {
    const t = pb.metadata?.thumbnail_url;
    if (!t) return true;
    return FORCE && t.includes('/preset-thumbs/');
  });
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);

  console.log(`프리셋 ${data.length}건 중 썸네일 없음 ${targets.length}건`);
  console.log(APPLY ? '=== 실제 적용 (Pollinations 무료) ===\n' : '=== 미리보기. 적용하려면 --apply ===\n');

  if (!APPLY) {
    targets.slice(0, 5).forEach((pb, i) => {
      console.log(`[${i + 1}] ${pb.key_name} — ${pb.title.slice(0, 40)}`);
      console.log(`    ${buildThumbPrompt(pb).slice(0, 130)}...`);
    });
    if (targets.length > 5) console.log(`... 외 ${targets.length - 5}건`);
    return;
  }

  let ok = 0;
  let fail = 0;
  const failed = [];

  for (const pb of targets) {
    try {
      const r = await generateThumb(pb);
      ok++;
      console.log(`✅ [${ok + fail}/${targets.length}] ${pb.key_name} · ${Math.round(r.bytes / 1024)}KB`);
    } catch (e) {
      fail++;
      failed.push(pb.key_name);
      console.log(`❌ [${ok + fail}/${targets.length}] ${pb.key_name} — ${e.message}`);
    }
    await sleep(REQUEST_GAP_MS);
  }

  console.log(`\n완료: 성공 ${ok}건 / 실패 ${fail}건`);
  if (failed.length) {
    console.log('실패 목록(재실행하면 이들만 다시 시도됨):', failed.join(', '));
  }
})();
