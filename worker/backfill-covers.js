/**
 * 기존 곡 앨범 커버 일괄 교체 (1회성 스크립트)
 *
 * 배경:
 *   공개 플레이리스트의 바이럴곡 커버가 전부 동일한 고정 프리셋이었다.
 *   원인은 세 가지였고 모두 수정됐지만(getGenreFallback 단어경계,
 *   isPlaceholderCover 판정 범위, 커버 생성의 워커 이관), 이미 DB에 저장된
 *   곡들은 자리표시자 URL을 그대로 들고 있다.
 *
 *   완료된 곡은 source_audio_url 이 최종 오디오 URL로 덮어써져 Suno task ID가
 *   남아 있지 않다. 따라서 Suno 원본 커버는 재조회할 수 없고, 워커와 동일한
 *   AI 생성기로 새로 만든다.
 *
 * 사용법:
 *   node backfill-covers.js            # 미리보기 (DB 변경 없음)
 *   node backfill-covers.js --apply    # 실제 적용
 *   node backfill-covers.js --apply --limit 5
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) : 0;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_IMAGE_API_URL = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '');

function isPlaceholderCover(url) {
  return (
    !url ||
    url.includes('unsplash.com/photo-1514525253161') ||
    url.includes('/melodio-assets/presets/')
  );
}

function buildCoverPrompt(metaObj, title) {
  const meta = metaObj || {};
  const style = String(meta.stylePrompt || '')
    .replace(/\b(no intro|instant vocal start|vocal-forward mix|minimal backing|vocal-centric mix|\d+\s*BPM)\b/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(,\s*){2,}/g, ', ')
    .trim();
  const lyricSnippet = String(meta.lyricsPrompt || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  return [
    `Square 1:1 album cover art for a Korean short-form comedy song titled "${title || 'Untitled'}".`,
    lyricSnippet ? `The song is about: ${lyricSnippet}.` : '',
    style ? `Musical mood: ${style.slice(0, 180)}.` : '',
    'Bold, playful, high-contrast illustration that reads clearly as a tiny thumbnail.',
    'No text, no lettering, no watermark, no logo.',
  ]
    .filter(Boolean)
    .join(' ');
}

async function generateCoverArt(metaObj, title, rowId) {
  const prompt = buildCoverPrompt(metaObj, title);
  let buffer = null;
  let engine = '';

  if (SUNO_API_KEY) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(`${SUNO_IMAGE_API_URL}/v1/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUNO_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt,
          n: 1,
          size: '1024x1024',
          quality: 'auto',
          response_format: 'b64_json',
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const d = await res.json();
        const b64 = d.data?.[0]?.b64_json;
        const rawUrl = d.data?.[0]?.url;
        if (b64) {
          buffer = Buffer.from(b64, 'base64');
          engine = 'gpt-image-2';
        } else if (rawUrl) {
          const r = await fetch(rawUrl);
          if (r.ok) {
            buffer = Buffer.from(await r.arrayBuffer());
            engine = 'gpt-image-2(url)';
          }
        }
      } else {
        console.warn('    gpt-image-2 실패:', (await res.text()).slice(0, 100));
      }
    } catch (e) {
      console.warn('    gpt-image-2 예외:', e.message);
    }
  }

  if (!buffer) {
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 300))}?width=1024&height=1024&nologo=true&seed=${Date.now() % 1000000}`;
      const r = await fetch(url);
      if (r.ok) {
        buffer = Buffer.from(await r.arrayBuffer());
        engine = 'pollinations';
      }
    } catch (e) {
      console.warn('    Pollinations 예외:', e.message);
    }
  }

  if (!buffer || buffer.length < 1024) return null;

  const filePath = `covers/${rowId}_${Date.now()}.png`;
  const { error } = await supabase.storage
    .from('melodio-assets')
    .upload(filePath, buffer, { contentType: 'image/png', upsert: true });
  if (error) {
    console.warn('    업로드 실패:', error.message);
    return null;
  }
  const publicUrl = supabase.storage.from('melodio-assets').getPublicUrl(filePath).data.publicUrl;
  return { publicUrl, engine, bytes: buffer.length };
}

(async () => {
  const { data, error } = await supabase
    .from('generations')
    .select('id,title,status,cover_art_url,license_hash,created_at')
    .eq('status', 'completed')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('조회 실패:', error.message);
    process.exit(1);
  }

  let targets = data.filter((r) => isPlaceholderCover(r.cover_art_url));
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);

  console.log(`완료곡 ${data.length}건 중 자리표시자 커버 ${targets.length}건`);
  console.log(APPLY ? '=== 실제 적용 모드 ===\n' : '=== 미리보기 (DB 변경 없음). 적용하려면 --apply ===\n');

  let ok = 0;
  let fail = 0;

  for (const [i, row] of targets.entries()) {
    let meta = {};
    try {
      meta = JSON.parse(row.license_hash || '{}');
    } catch {
      /* 메타 없으면 제목만으로 생성 */
    }
    const label = `[${i + 1}/${targets.length}] ${(row.title || '(무제)').slice(0, 30)}`;

    if (!APPLY) {
      console.log(`${label}\n    현재: ${(row.cover_art_url || 'none').split('/').pop()}`);
      console.log(`    프롬프트: ${buildCoverPrompt(meta, row.title).slice(0, 110)}...`);
      continue;
    }

    console.log(label);
    const result = await generateCoverArt(meta, row.title, row.id);
    if (!result) {
      console.log('    ❌ 생성 실패 — 기존 커버 유지');
      fail++;
      continue;
    }

    const { error: upErr } = await supabase
      .from('generations')
      .update({ cover_art_url: result.publicUrl })
      .eq('id', row.id);

    if (upErr) {
      console.log('    ❌ DB 갱신 실패:', upErr.message);
      fail++;
    } else {
      console.log(`    ✅ ${result.engine} · ${Math.round(result.bytes / 1024)}KB`);
      ok++;
    }
  }

  if (APPLY) console.log(`\n완료: 성공 ${ok}건 / 실패 ${fail}건`);
})();
