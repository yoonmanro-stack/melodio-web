/**
 * upgrade_existing_presets.js
 * Melodio curation_playbooks 테이블의 기존 프리셋을 고퀄리티로 벌크 업그레이드합니다.
 *
 * 수행 순서:
 * 1. Supabase DB에서 전체 프리셋 로드
 * 2. OpenAI GPT-4o-mini로 풍부한 플레이북 content + metadata 생성
 * 3. 302.ai gpt-image-2로 1:1 썸네일 이미지 생성 → Supabase Storage 업로드
 * 4. Supabase DB 업데이트 (content, metadata, thumbnail_url)
 * 5. 로컬 Obsidian 마크다운 파일 갱신
 * 6. scp로 Mac Mini Obsidian 볼륨에 동기화
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// ── 환경변수 로드 ─────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local 파일을 찾을 수 없습니다:', envPath);
    process.exit(1);
  }
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });
}
loadEnv();

// ── 설정 ──────────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUNO_KEY = process.env.SUNO_API_KEY;
const SUNO_URL = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '');

const username = os.userInfo().username;
const VAULT_LOCAL = username === 'yoonmanro'
  ? '/Users/yoonmanro/Desktop/project/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio'
  : '/Users/muse/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio';
const VAULT_MACMINI = 'macmini:/Users/muse/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio';

// ── Step 2: OpenAI로 고퀄리티 플레이북 생성 ───────────────────────────────────
async function generatePlaybookContent(preset) {
  const systemPrompt = `당신은 Melodio AI 음악 SaaS 플랫폼의 전문 장르 큐레이터입니다.
주어진 프리셋 정보를 분석하여 유튜브 채널 운영에 최적화된 고품질 음악 플레이북을 JSON 형식으로 작성하십시오.`;

  const userPrompt = `아래 프리셋을 고품질로 업그레이드하십시오.

[프리셋 정보]
- key_name: ${preset.key_name}
- title: ${preset.title}
- category: ${preset.category}
- 기존 content: ${(preset.content || '').substring(0, 500) || '(없음)'}
- 기존 metadata: ${JSON.stringify(preset.metadata || {}, null, 0)}

[출력 JSON 스키마]
{
  "content": "## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n이 장르/스타일의 핵심 매력과 청중 감성을 2~3문장으로 서술...\\n\\n## 🚀 채널 운영 전략\\n- 업로드 주기: ...\\n- 영상 길이: ...\\n- 썸네일 전략: ...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n- 한글안: ...\\n- 영문안: ...\\n\\n## 🎵 음악적 특징\\n- BPM: ...\\n- 대표 악기: ...\\n- 리듬 패턴: ...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n- 핵심 주제: ...\\n- 추천 은유: ...",
  "suno_tags": "Suno V5 최적화 영문 스타일 태그 (쉼표 구분, 15~25개 단어 이내)",
  "audio_engineering": "믹싱/마스터링 기법 영문 설명 (예: warm analog saturation, subtle tape compression)",
  "moods": "무드 키워드 (한영 혼용, 쉼표 구분)",
  "instruments": "핵심 악기 목록 (한영 혼용)",
  "bpm_range": "적정 BPM 범위 (예: 75-90)",
  "logo_prompt": "이 장르에 완벽히 어울리는 1:1 앨범 커버 이미지 생성용 영문 프롬프트. 구체적인 시각 요소(색감, 조명, 분위기, 오브젝트)를 포함하여 100단어 이상 상세히 서술하시오.",
  "inferred_genre": "추론된 장르 (한글, 예: 어쿠스틱 포크)",
  "description": "프리셋 한줄 설명 (한글, 50자 이내)"
}

반드시 완전한 JSON 객체만 출력하십시오.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.75
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API 오류: ${errText}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// ── Step 3: 302.ai로 썸네일 생성 + Supabase Storage 업로드 ────────────────────
async function generateAndUploadThumbnail(logoPrompt, keyName) {
  const finalPrompt = `${logoPrompt}. Clean, cinematic, high-fidelity atmospheric aesthetic illustration. Crucially, NO text, NO typography, NO logos, NO watermarks, NO letters, and NO writing whatsoever on the image.`;

  const res = await fetch(`${SUNO_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUNO_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: finalPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'auto'
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`302.ai 이미지 생성 오류: ${errText}`);
  }
  const imgData = await res.json();

  const b64Data = imgData.data?.[0]?.b64_json;
  const imageUrl = imgData.data?.[0]?.url;

  let buffer;
  if (b64Data) {
    buffer = Buffer.from(b64Data, 'base64');
  } else if (imageUrl) {
    const imgRes = await fetch(imageUrl);
    buffer = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new Error('302.ai 응답에 이미지 데이터 없음');
  }

  const safeName = keyName.replace(/[^a-zA-Z0-9-]/g, '_');
  const filePath = `thumbnails/${safeName}_upgrade_${Date.now()}.png`;

  const { error: uploadErr } = await supabase.storage
    .from('melodio-assets')
    .upload(filePath, buffer, { contentType: 'image/png', upsert: true });
  if (uploadErr) throw new Error(`Supabase Storage 업로드 실패: ${uploadErr.message}`);

  const { data: { publicUrl } } = supabase.storage.from('melodio-assets').getPublicUrl(filePath);
  return publicUrl;
}

// ── Step 5: Obsidian 마크다운 작성 ────────────────────────────────────────────
function writeObsidianMarkdown(preset, enriched, thumbnailUrl) {
  const folderName = (preset.category === 'curation' || preset.category === 'japan')
    ? '300_Prompts'
    : '100_Genres & Styles';
  const dirPath = path.join(VAULT_LOCAL, folderName);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

  const mdContent = `---
category: ${preset.category}
key_name: ${preset.key_name}
title: ${preset.title}
bpm_range: ${enriched.bpm_range || ''}
sub_genres:
suno_tags: ${enriched.suno_tags || ''}
audio_engineering: ${enriched.audio_engineering || ''}
instruments: ${enriched.instruments || ''}
moods: ${enriched.moods || ''}
logo_prompt: ${enriched.logo_prompt || ''}
thumbnail_url: ${thumbnailUrl}
rendering_version: 2026_Latest
source: Upgraded
---
# ${preset.title}

${enriched.content}
`;

  const filePath = path.join(dirPath, `${preset.key_name}.md`);
  fs.writeFileSync(filePath, mdContent, 'utf-8');
  console.log(`    📝 Obsidian 파일 작성: ${path.relative(VAULT_LOCAL, filePath)}`);
  return filePath;
}

// ── Step 6: Mac Mini scp 동기화 ────────────────────────────────────────────────
function syncToMacMini(localFilePath, preset) {
  const folderName = (preset.category === 'curation' || preset.category === 'japan')
    ? '300_Prompts'
    : '100_Genres & Styles';
  const remotePath = `${VAULT_MACMINI}/${folderName}/${preset.key_name}.md`;
  try {
    execSync(`scp "${localFilePath}" "${remotePath}"`, { stdio: 'pipe' });
    console.log(`    🖥️ Mac Mini 동기화 완료: ${folderName}/${preset.key_name}.md`);
  } catch (err) {
    console.error(`    ⚠️ Mac Mini scp 실패 (무시하고 계속): ${err.message}`);
  }
}

// ── 단일 프리셋 업그레이드 ─────────────────────────────────────────────────────
async function upgradePreset(preset) {
  console.log(`\n🔄 [${preset.category}] ${preset.title} (${preset.key_name})`);

  try {
    // Step 2: GPT 플레이북 생성
    process.stdout.write('    🤖 GPT-4o-mini 플레이북 생성 중... ');
    const enriched = await generatePlaybookContent(preset);
    console.log('완료');

    // Step 3: 썸네일 이미지 생성
    let thumbnailUrl = preset.metadata?.thumbnail_url || '';
    process.stdout.write('    🎨 썸네일 이미지 생성 중... ');
    try {
      thumbnailUrl = await generateAndUploadThumbnail(enriched.logo_prompt, preset.key_name);
      console.log('완료');
    } catch (imgErr) {
      console.log(`실패 (기존 URL 유지): ${imgErr.message}`);
    }

    // Step 4: Supabase DB 업데이트
    const updatedMetadata = {
      ...(preset.metadata || {}),
      bpm_range: enriched.bpm_range,
      suno_tags: enriched.suno_tags,
      audio_engineering: enriched.audio_engineering,
      moods: enriched.moods,
      instruments: enriched.instruments,
      logo_prompt: enriched.logo_prompt,
      inferred_genre: enriched.inferred_genre,
      description: enriched.description,
      ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl, thumbnail_urls: [thumbnailUrl] } : {})
    };

    const { error: dbErr } = await supabase
      .from('curation_playbooks')
      .update({
        content: enriched.content,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('key_name', preset.key_name);

    if (dbErr) throw new Error(`DB 업데이트 실패: ${dbErr.message}`);
    console.log('    ✅ DB 업데이트 완료');

    // Step 5: Obsidian 마크다운 작성
    const localFilePath = writeObsidianMarkdown(preset, enriched, thumbnailUrl);

    // Step 6: Mac Mini scp 동기화
    if (username === 'yoonmanro') {
      syncToMacMini(localFilePath, preset);
    }

    return { success: true, key_name: preset.key_name };
  } catch (err) {
    console.error(`    ❌ 오류: ${err.message}`);
    return { success: false, key_name: preset.key_name, error: err.message };
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=' .repeat(60));
  console.log('🚀 Melodio Preset Bulk Upgrade 시작');
  console.log('=' .repeat(60));

  if (!OPENAI_KEY) { console.error('❌ OPENAI_API_KEY 누락'); process.exit(1); }
  if (!SUNO_KEY) { console.error('❌ SUNO_API_KEY 누락'); process.exit(1); }

  const { data: presets, error } = await supabase
    .from('curation_playbooks')
    .select('*')
    .order('updated_at', { ascending: true });

  if (error) { console.error('❌ Supabase 조회 실패:', error.message); process.exit(1); }

  console.log(`\n📋 대상 프리셋: ${presets.length}개\n`);
  presets.forEach(p => {
    const thumb = p.metadata?.thumbnail_url ? '✅썸네일' : '❌썸네일 없음';
    console.log(`  - [${p.category}] ${p.title} (${p.key_name}) ${thumb}`);
  });

  const results = [];
  for (let i = 0; i < presets.length; i++) {
    console.log(`\n[${i + 1}/${presets.length}]`);
    const result = await upgradePreset(presets[i]);
    results.push(result);
    // API 레이트리밋 방지 딜레이
    if (i < presets.length - 1) {
      process.stdout.write('    ⏳ 다음 프리셋 준비 중 (2초)...');
      await new Promise(r => setTimeout(r, 2000));
      console.log(' 완료');
    }
  }

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n' + '='.repeat(60));
  console.log(`🎉 벌크 업그레이드 완료!`);
  console.log(`  성공: ${succeeded.length}/${presets.length}`);
  if (failed.length > 0) {
    console.log(`  실패: ${failed.length}개`);
    failed.forEach(r => console.log(`    - ${r.key_name}: ${r.error}`));
  }
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('💥 예기치 않은 오류:', err);
  process.exit(1);
});
