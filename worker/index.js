/**
 * melodio-worker — Demucs Audio Worker Node (Phase 10 / Dual-Path Encoding)
 *
 * 동작 원리:
 * 1. Supabase Realtime으로 generations 테이블 INSERT 이벤트 구독
 * 2. 이벤트 감지 → status 'processing'으로 업데이트
 * 3. 원본 오디오 로컬 다운로드 (audio_url)
 * 4. Demucs 실행 (htdemucs_ft) → WAV 4채널 스템 분리
 * 5. FFmpeg 병렬 압축 → 프리뷰용 저용량 AAC(.m4a) 변환
 * 6. 8개 파일(WAV 4 + AAC 4) melodio-assets 버킷에 업로드
 * 7. status 'completed' 및 원본/프리뷰 URL 8개 업데이트
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { isIP } = require('net');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { analyzeAudio } = require('./analyzer');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

// ─── 환경변수 검증 ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// demucs/ffmpeg 없는 환경에서도 전체 파이프라인 논리 증명 가능 (행동강령 3조)
const MOCK_MODE = process.env.MOCK_MODE === 'true';
// 실제 음성 복제 엔진이 검증되어 명시적으로 활성화되기 전까지 자동 변환은 fail-closed 한다.
// 일반 Demucs 스템 분리 작업은 이 플래그와 무관하게 계속 동작한다.
const VOICE_CLONING_ENABLED = process.env.VOICE_CLONING_ENABLED === 'true';

// ─── 숏폼(바이럴) 길이 정책 ────────────────────────────────────────────────────
// Suno 제출 API(/suno/submit/music)에는 duration 파라미터가 없다. 스타일
// 프롬프트에 "target duration 0:28"을 넣어도 무시된다 — 동일 지시로 14초,
// 32초, 43초가 나온 것이 실측으로 확인됐다. 가사 음절 수와도 선형 관계가 아니다.
//
// ⚠️ 목표(target)와 재발행 기준(accept)은 다른 숫자다. 반드시 분리해서 쓸 것.
//
// 이 둘을 하나로 묶어 뒀던 것이 실제 사고를 냈다. 기존 [25, 29.5] 하나가
// "목표"이자 "합격선"이었기 때문에 22초짜리 멀쩡한 곡이 규격 밖으로 판정돼
// 버려지고 Suno 를 다시 불렀다. 재발행은 공짜가 아니다 — 크레딧 1회 + 약 2분이고,
// 그 2분 때문에 프런트 폴링(325초)이 먼저 끝나 "생성 타임아웃" 알림까지 떴다.
//
//   목표 : 가사를 이 길이로 쓰도록 유도하는 값. 후보 2곡 중 고를 때의 기준이기도 하다.
//          melodio-web 의 viralSongSpec(23~28초)과 같은 값을 쓴다.
//   합격 : 이 밖으로 나갔을 때만 재발행한다. "목표에 못 미침" 이 아니라
//          "정말 못 쓰는 곡" 일 때만 다시 뽑는다.
const SHORTFORM_TARGET_MIN_SEC = 23;
const SHORTFORM_TARGET_MAX_SEC = 28;
/** 후보 2곡 중 하나를 고를 때의 기준점 (목표 구간 중앙) */
const SHORTFORM_TARGET_SEC = 25.5;

/**
 * 합격 상한 — 영상이 덮을 수 있는 한계에서 유도한다.
 *
 * Grok 영상은 15초 단위 과금이고 기본 2클립 = 30초다. 음원이 그보다 길면
 * melodio-web 의 lib/video/fitVideoToAudio 가 마지막 프레임을 최대 8초까지
 * 고정해 **3번째 클립 과금 없이** 덮는다. 따라서 38초까지는 영상 쪽 손해가 없다.
 * (34초 음원 → 4초 정지. 여유 있게 들어간다.)
 *
 * ⚠️ 이 값을 바꾸려면 fitVideoToAudio.MAX_FREEZE_SECONDS 도 함께 봐야 한다.
 *    여기만 늘리면 영상이 루프로 떨어져 도입부가 재등장한다.
 */
const VIDEO_TWO_CLIP_SEC = 30;
const VIDEO_MAX_FREEZE_SEC = 8;
const SHORTFORM_ACCEPT_MAX_SEC = VIDEO_TWO_CLIP_SEC + VIDEO_MAX_FREEZE_SEC; // 38

/**
 * 합격 하한.
 *
 * 15초짜리는 훅이 한 바퀴 돌기도 전에 끝나 밈이 성립하지 않는다 — 이건 다시 뽑아야 한다.
 * 반면 20~22초는 훅 2회 + 벌스가 다 들어가므로 목표(23초)에 조금 못 미쳐도 그냥 쓴다.
 * 짧은 건 과금 손해도 없다.
 */
const SHORTFORM_ACCEPT_MIN_SEC = 20;

const SHORTFORM_FADE_SEC = 0.3;

/**
 * 트림 허용 최대 초과분(초).
 *
 * 트림은 무조건 뒷부분을 잘라낸다. 초과분이 작으면(≤3초) 대개 후주 꼬리라
 * 잘라도 가사가 살지만, 크면 보컬 구간을 자른다.
 * 실측: 45.8초를 29.4초로 자르자 가사 마지막 2~3줄이 통째로 유실됐다.
 *
 * 사용자 요구사항은 "가사는 다 생성되고 음원·영상 모두 잘림 없이" 이므로,
 * 초과분이 이 값을 넘으면 자르지 않고 완곡을 그대로 내보낸다.
 * (길이 규격보다 가사 완전성이 우선. 재발행 1회로도 못 맞춘 경우에만 발생한다.)
 */
const SHORTFORM_MAX_TRIMMABLE_SEC = 3;

/**
 * 길이 미달 시 재발행 횟수.
 *
 * Suno 는 같은 가사로 만든 두 클립의 길이가 15초 이상 벌어지는 일이 잦다
 * (실측 25/42, 30/45, 28/46). 즉 한 번 더 뽑으면 규격에 드는 클립이 나올 확률이 높다.
 * 정식 서비스 기준에서는 "가끔 잘린 곡"보다 "가끔 한 번 더 생성"이 낫다고 판단해 2회로 둔다.
 * 음질 재발행(retry_count)과는 별도 카운터(duration_retry_count)를 쓴다.
 */
// ─── MugSound 방향 승인용 플리곡 길이 정책 ───────────────────────────────────
// 기존 Melodio의 약 3분 연주곡 생성 방식을 사용하되, Suno가 반환한 실제 길이를
// 반드시 검사한다. A/B 두 후보가 모두 범위 안에 들어오기 전에는 완료 처리하지 않는다.
const MUGSOUND_MIN_DURATION_SEC = 150;
const MUGSOUND_MAX_DURATION_SEC = 270;
// 초기 A/B 2개 + 길이 실패 시 A/B 2개를 한 번만 추가한다.
// generation-policy의 Blueprint당 최대 후보 4개와 일치시켜 과금을 제한한다.
const MUGSOUND_MAX_DURATION_RETRIES = 1;
const MUGSOUND_INSTRUMENTAL_STRUCTURE_PROMPT = `[Target Duration: 3:30, Full Extended Instrumental Master]
[Instrumental Intro]
[Melodic Main Theme - Piano & Bass]
[Instrumental Verse 1]
[Rich Melodic Chorus 1]
[Instrumental Verse 2 - Dynamic Lead Development]
[Extended Solo & Piano Bridge]
[Rich Melodic Chorus 2 - Full Climax]
[Outro & Gradual Fade Out]`;

function appendMugSoundAttempt(meta, taskId, durations, outcome) {
  const attempts = Array.isArray(meta.mugsoundAttempts) ? meta.mugsoundAttempts : [];
  meta.mugsoundAttempts = [
    ...attempts,
    {
      attempt: attempts.length + 1,
      taskId,
      measuredDurations: durations,
      outcome,
      recordedAt: new Date().toISOString(),
    },
  ];
}
/**
 * 곡과 무관한 자리표시자 커버인가.
 *
 * 기존에는 unsplash URL만 걸렀다. 그런데 generate 라우트의 getGenreFallback()이
 * 붙이는 /presets/*.png 도 스타일 문자열 매칭으로 고른 고정 이미지라 곡과 무관하다.
 * 그게 "진짜 커버"로 통과해서, Suno가 곡마다 새로 만들어 주는 clip.image_url 이
 * 매번 버려졌고 공개 플레이리스트의 바이럴곡이 전부 같은 그림을 달았다.
 *
 * ※ 왜 하필 개발자 그림이었나: 이전 스타일 프롬프트의 "avoid: aggressive rap" 에
 *   들어 있던 'rap' 을 getGenreFallback 의 문자열 매칭이 힙합으로 인식했다.
 */
function isPlaceholderCover(url) {
  return (
    !url ||
    url.includes('unsplash.com/photo-1514525253161') ||
    url.includes('/melodio-assets/presets/') ||
    // /preset-thumbs/ 는 Preset Studio 장르 카탈로그용 이미지다. generate 라우트의
    // getGenreFallback() 이 matchedPlaybook.metadata.thumbnail_url 을 최우선으로 쓰는데,
    // 프리셋 203개에 썸네일을 채우자 그 장르 이미지가 곡 커버로 새어 들어왔다.
    // (강아지 노래 커버가 vocaloid_pop.png 로 붙는 사고)
    url.includes('/melodio-assets/preset-thumbs/')
  );
}

// ─── AI 앨범 커버 생성 ─────────────────────────────────────────────────────────
// 원래 melodio-web 의 /api/generate 안에서 응답 반환 뒤 .then() 으로 돌던 코드다.
// Vercel 서버리스는 응답을 보내면 함수를 얼리기 때문에 그 프로미스가 완료된다는
// 보장이 없다. 맥미니(상시 실행)에서는 되고 프로덕션에서는 안 되는 구조였다.
// 상시 실행되는 이 워커로 옮긴다.
const SUNO_IMAGE_API_URL = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '');

/** 곡 메타데이터로 앨범 커버 프롬프트를 만든다 */
function buildCoverPrompt(metaObj, title) {
  const meta = metaObj || {};
  const style = String(meta.stylePrompt || '')
    // 사운드 엔지니어링 태그는 그림과 무관하므로 걷어낸다
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

/**
 * 앨범 커버를 생성해 Supabase Storage에 올리고 공개 URL을 돌려준다.
 * 실패하면 null — 호출부가 기존 커버를 유지하면 되므로 예외를 던지지 않는다.
 */
async function generateCoverArt(metaObj, title, rowId) {
  const prompt = buildCoverPrompt(metaObj, title);
  let buffer = null;

  // 1순위: gpt-image-2 (302.ai)
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
        if (b64) buffer = Buffer.from(b64, 'base64');
        else if (rawUrl) {
          const r = await fetch(rawUrl);
          if (r.ok) buffer = Buffer.from(await r.arrayBuffer());
        }
      } else {
        log('WARN', '[커버] gpt-image-2 실패', (await res.text()).slice(0, 120));
      }
    } catch (e) {
      log('WARN', '[커버] gpt-image-2 예외', e.message);
    }
  }

  // 2순위: Pollinations (키 불필요)
  if (!buffer) {
    try {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 300))}?width=1024&height=1024&nologo=true&seed=${Date.now() % 1000000}`;
      const r = await fetch(url);
      if (r.ok) buffer = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      log('WARN', '[커버] Pollinations 예외', e.message);
    }
  }

  if (!buffer || buffer.length < 1024) return null;

  try {
    const filePath = `covers/${rowId}_${Date.now()}.png`;
    const { error } = await supabase.storage
      .from('melodio-assets')
      .upload(filePath, buffer, { contentType: 'image/png', upsert: true });
    if (error) throw new Error(error.message);
    return supabase.storage.from('melodio-assets').getPublicUrl(filePath).data.publicUrl;
  } catch (e) {
    log('WARN', '[커버] 업로드 실패', e.message);
    return null;
  }
}

/** 이 트랙이 25~30초 숏폼 규격 대상인가 */
function isShortFormTrack(metaObj) {
  const meta = metaObj || {};
  const menu = String(meta.sourceMenu || '').toLowerCase();
  if (menu === 'viral' || menu === 'viral-cf') return true;
  const secs = parseFloat(meta.durationSeconds);
  if (Number.isFinite(secs) && secs > 0 && secs <= 60) return true;
  return false;
}

/**
 * 합격 상한을 넘은 음원을 잘라 Supabase Storage에 올리고 새 공개 URL을 돌려준다.
 * 실패하면 null — 호출부가 원본을 그대로 쓰면 되므로 예외를 던지지 않는다.
 *
 * 자를 목표 초를 인자로 받는다. 예전에는 전역 상수(29.4초)로 고정돼 있었는데,
 * 합격 상한이 38초로 넓어진 뒤로 "합격은 38초까지인데 자를 땐 29.4초로" 라는
 * 모순이 생기기 때문이다. 어디까지 허용하는지와 어디까지 자르는지는 같아야 한다.
 */
async function trimAudioAndUpload(audioUrl, rowId, trimToSec) {
  const stamp = Date.now();
  const srcPath = path.join(os.tmpdir(), `sf_src_${stamp}.mp3`);
  const outPath = path.join(os.tmpdir(), `sf_trim_${stamp}.mp3`);
  const cleanup = () => {
    for (const f of [srcPath, outPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* 무시 */ }
    }
  };

  try {
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`음원 다운로드 실패 (${res.status})`);
    fs.writeFileSync(srcPath, Buffer.from(await res.arrayBuffer()));

    const fadeStart = Math.max(0, trimToSec - SHORTFORM_FADE_SEC);
    await new Promise((resolve, reject) => {
      exec(
        `ffmpeg -y -i "${srcPath}" -t ${trimToSec} -af "afade=t=out:st=${fadeStart}:d=${SHORTFORM_FADE_SEC}" -c:a libmp3lame -q:a 2 "${outPath}"`,
        (err) => (err ? reject(err) : resolve())
      );
    });

    if (!fs.existsSync(outPath)) throw new Error('ffmpeg 출력 파일 없음');

    const remotePath = `viral_shorts/trimmed_${rowId}_${stamp}.mp3`;
    const { error: upErr } = await supabase.storage
      .from('melodio-assets')
      .upload(remotePath, fs.readFileSync(outPath), { contentType: 'audio/mpeg', upsert: true });
    if (upErr) throw new Error(`업로드 실패: ${upErr.message}`);

    const publicUrl = supabase.storage.from('melodio-assets').getPublicUrl(remotePath).data.publicUrl;
    cleanup();
    return publicUrl;
  } catch (err) {
    cleanup();
    log('WARN', `[숏폼 트림] 처리 중 오류`, err.message);
    return null;
  }
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[WORKER][FATAL] .env에 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  process.exit(1);
}

if (SUPABASE_SERVICE_ROLE_KEY.includes('여기에') || SUPABASE_SERVICE_ROLE_KEY.includes('붙여넣기')) {
  console.error('[WORKER][FATAL] Service Role Key가 아직 설정되지 않았습니다. .env 파일을 확인해주세요.');
  process.exit(1);
}

// ─── Supabase 클라이언트 (Service Role — RLS 우회) ─────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── 스템 종류 정의 ────────────────────────────────────────────────────────────
const STEMS = ['vocals', 'bass', 'drums', 'other'];
const PRIVATE_STEM_BUCKET = 'melodio-private';
const PRIVATE_STEM_OUTPUT_BUCKET = 'melodio-private-stems';
const PRIVATE_STEM_INPUT_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);
const UUID_OBJECT_SEGMENT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── 스템 작업 수명주기 ────────────────────────────────────────────────────────
// generations 테이블에 별도 job 컬럼이 없는 현재 스키마와 호환하기 위해
// license_hash JSON의 stem* 필드를 lease/진행 상태로 사용한다.
const STEM_WORKER_ID = process.env.STEM_WORKER_ID || `${os.hostname()}:${process.pid}`;
const STEM_HEARTBEAT_INTERVAL_MS = Number(process.env.STEM_HEARTBEAT_INTERVAL_MS) || 15_000;
const STEM_LEASE_TIMEOUT_MS = Number(process.env.STEM_LEASE_TIMEOUT_MS) || 10 * 60_000;
const STEM_DOWNLOAD_TIMEOUT_MS = Number(process.env.STEM_DOWNLOAD_TIMEOUT_MS) || 2 * 60_000;
const STEM_DEMUCS_TIMEOUT_MS = Number(process.env.STEM_DEMUCS_TIMEOUT_MS) || 20 * 60_000;
const STEM_FFMPEG_TIMEOUT_MS = Number(process.env.STEM_FFMPEG_TIMEOUT_MS) || 8 * 60_000;
const STEM_UPLOAD_TIMEOUT_MS = Number(process.env.STEM_UPLOAD_TIMEOUT_MS) || 5 * 60_000;
const STEM_SHUTDOWN_GRACE_MS = Number(process.env.STEM_SHUTDOWN_GRACE_MS) || 25_000;
const STEM_MAX_SOURCE_BYTES = Number(process.env.STEM_MAX_SOURCE_BYTES) || 80 * 1024 * 1024;
const STEM_MAX_DURATION_SECONDS = Number(process.env.STEM_MAX_DURATION_SECONDS) || 6 * 60;
const STEM_MAX_PROCESSING_ATTEMPTS = 3;
// Every claim creates a unique output path recorded in stemArtifactAttempts.
// Keep a separate hard lease bound so repeated infrastructure interruptions
// can never push an undeletable path out of the bounded deletion manifest.
const STEM_MAX_LEASE_CLAIMS = 16;
const STEM_MAX_LEGACY_BACKFILL_ATTEMPTS = 10;
const STEM_MAINTENANCE_INTERVAL_MS = Number(process.env.STEM_MAINTENANCE_INTERVAL_MS) || 30 * 60_000;
const STEM_ERROR_MAX_LENGTH = 500;
const STEM_MAX_SOURCE_REDIRECTS = 3;
const DEFAULT_TRUSTED_STEM_SOURCE_HOSTS = [
  '*.supabase.co',
  'file.302.ai',
  'suno.ai',
  '*.suno.ai',
  'suno.com',
  '*.suno.com',
  'storage.googleapis.com',
  '*.storage.googleapis.com',
  'storage.cloud.google.com',
  '*.googleapis.com',
  '*.googleusercontent.com',
  '*.r2.dev',
  // 오래된 B2B 데모 generation의 실제 원본 호스트다.
  'www.soundhelix.com',
];
const ALLOWED_STEM_AUDIO_CODECS = new Set([
  'mp3', 'aac', 'alac', 'flac', 'vorbis', 'opus',
  'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_f64le',
]);

const activeStemJobs = new Map();
let isShuttingDown = false;
let pendingScanInProgress = false;
let generationChannel = null;
let pendingScanTimeout = null;
let pendingScanInterval = null;
let lastStemMaintenanceAt = 0;
let stemMaintenanceInProgress = false;
// Security maintenance must eventually traverse the whole table even when a
// permanently broken legacy row keeps failing. UUID cursors advance past every
// inspected batch and wrap after the end instead of repeatedly selecting row 1.
let expiredSessionCursor = null;
let cleanupOutboxCursor = null;
let stemUploadPrivacyCursor = null;
let customUploadPrivacyCursor = null;
let ownerlessLegacyCursor = null;
let completedBackfillCursor = null;
let completedGeneratedOutputBackfillCursor = null;
let pendingPublicCleanupCursor = null;
let failedPublicCleanupCursor = null;
let pendingGeneratedOutputCleanupCursor = null;
let failedGeneratedOutputCleanupCursor = null;

function parseGenerationMetadata(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // 예전의 실제 hash 문자열도 잃지 않고 JSON 안에 보존한다.
  }
  return { legacyLicenseHash: String(value) };
}

function sanitizeStemError(error) {
  const message = error instanceof Error ? error.message : String(error || '알 수 없는 스템 처리 오류');
  return message.replace(/[\r\n]+/g, ' ').slice(0, STEM_ERROR_MAX_LENGTH);
}

function addLicenseHashCondition(query, licenseHash) {
  return licenseHash == null ? query.is('license_hash', null) : query.eq('license_hash', licenseHash);
}

function isExternalStemUpload(metadata) {
  return metadata?.sourceMenu === 'stem-upload' || metadata?.sourceMenu === 'custom-upload';
}

function shouldStoreStemPrivately(row, metadata) {
  // Stem WAV/AAC artifacts are user-owned working files even when the mixed
  // song is public. Keeping all owned outputs private decouples publication
  // toggles from Storage placement and prevents public-bucket privacy drift.
  return Boolean(row?.user_id)
    || isExternalStemUpload(metadata)
    || row?.is_public === false
    || metadata?.isPublic === false;
}

function hasStemSource(row) {
  return Boolean(row?.audio_url || row?.source_audio_url);
}

function shouldClaimStemRow(row) {
  const metadata = parseGenerationMetadata(row?.license_hash);
  if (metadata.stemStatus === 'pending') return hasStemSource(row);
  // legacy worker는 audio_url이 있는 row만 스템 queue로 취급했다.
  // source_audio_url="suno:<task>"인 음악 생성 polling row와 혼동하면 안 된다.
  return row?.status === 'pending' && Boolean(row?.audio_url) && !row?.stem_vocals_url;
}

function isProcessingStemRow(row) {
  const metadata = parseGenerationMetadata(row?.license_hash);
  if (metadata.stemStatus === 'processing') return hasStemSource(row);
  return row?.status === 'processing' && Boolean(row?.audio_url) && !row?.stem_vocals_url;
}

function getStemSource(row) {
  if (typeof row?.source_audio_url === 'string' && row.source_audio_url.startsWith('storage://')) {
    return row.source_audio_url;
  }
  return row?.audio_url || row?.source_audio_url || null;
}

function allowedStemInputExtension(candidate) {
  if (typeof candidate !== 'string' || !candidate) return null;
  const extension = path.posix.extname(candidate).slice(1).toLowerCase();
  return PRIVATE_STEM_INPUT_EXTENSIONS.has(extension) ? extension : null;
}

function resolveStemInputExtension(metadata, source) {
  const candidates = [];
  const storageRef = parseStorageUri(source);
  if (storageRef) candidates.push(storageRef.objectPath);
  if (typeof metadata?.originalFileName === 'string') candidates.push(metadata.originalFileName);

  if (!storageRef) {
    try {
      const pathname = new URL(String(source)).pathname;
      candidates.push(pathname);
      try { candidates.push(decodeURIComponent(pathname)); } catch {}
    } catch {
      // 실제 URL 검증은 다운로드 직전에 수행하고 여기서는 확장자만 찾는다.
    }
  }

  for (const candidate of candidates) {
    const extension = allowedStemInputExtension(candidate);
    if (extension) return extension;
  }
  // 공개 생성 엔진 중에는 확장자 없는 HTTPS download URL을 반환하는 곳이 있다.
  // private Storage 업로드는 경로 확장자를 엄격히 요구하되, 기존 공개곡은
  // Demucs/ffmpeg의 포맷 sniffing이 동작하도록 과거 기본값 mp3를 유지한다.
  if (!storageRef) return 'mp3';
  throw new Error('지원되는 원본 확장자(mp3, wav, m4a, aac, ogg, flac)를 확인할 수 없습니다.');
}

function parseStorageUri(uri) {
  const match = /^storage:\/\/([^/]+)\/(.+)$/.exec(String(uri || ''));
  if (!match) return null;
  const bucket = match[1];
  const objectPath = match[2];
  const segments = objectPath.split('/');
  if (
    !bucket
    || !objectPath
    || segments.some(segment => !segment || segment === '.' || segment === '..' || /[?#\\]/.test(segment))
  ) {
    throw new Error('유효하지 않은 private Storage URI입니다.');
  }
  return { bucket, objectPath };
}

function validatePrivateStemSource(row, metadata, storageRef) {
  if (storageRef.bucket !== PRIVATE_STEM_BUCKET) {
    throw new Error(`허용되지 않은 private Storage bucket입니다: ${storageRef.bucket}`);
  }
  if (!row?.user_id) throw new Error('private 원본 소유자를 확인할 수 없습니다.');
  const ownerPrefix = `uploads/${row.user_id}/`;
  if (!storageRef.objectPath.startsWith(ownerPrefix)) {
    throw new Error('private 원본 경로가 generation 소유자와 일치하지 않습니다.');
  }
  if (isExternalStemUpload(metadata)) {
    const relativePath = storageRef.objectPath.slice(ownerPrefix.length);
    const directMatch = new RegExp(`^${row.id}\\.(mp3|wav|m4a|aac|ogg|flac)$`, 'i').exec(relativePath);
    const migratedMatch = new RegExp(
      `^${row.id}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(mp3|wav|m4a|aac|ogg|flac)$`,
      'i',
    ).exec(relativePath);
    const extension = (directMatch?.[1] || migratedMatch?.[1] || '').toLowerCase();
    if (!PRIVATE_STEM_INPUT_EXTENSIONS.has(extension)) {
      throw new Error('외부 업로드 원본 경로가 generation ID와 일치하지 않습니다.');
    }
  }
}

function configuredTrustedStemSourceHosts() {
  const configured = String(process.env.STEM_SOURCE_HOSTS || '')
    .split(',')
    .map(value => value.trim().toLowerCase().replace(/\.$/, ''))
    .filter(value => /^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value));
  return [...DEFAULT_TRUSTED_STEM_SOURCE_HOSTS, ...configured];
}

function stemSourceHostnameMatches(hostname, rule) {
  if (!rule.startsWith('*.')) return hostname === rule;
  const suffix = rule.slice(2);
  return hostname.length > suffix.length && hostname.endsWith(`.${suffix}`);
}

function validateTrustedHttpStemSource(source) {
  let url;
  try {
    url = new URL(String(source));
  } catch {
    throw new Error('원본 오디오 URL 형식이 올바르지 않습니다.');
  }

  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('스템 원본은 HTTPS 기본 포트 URL만 허용됩니다.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const ipCandidate = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  if (
    !hostname
    || isIP(ipCandidate) !== 0
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
  ) {
    throw new Error('내부 네트워크 주소는 스템 원본으로 사용할 수 없습니다.');
  }

  if (!configuredTrustedStemSourceHosts().some(rule => stemSourceHostnameMatches(hostname, rule))) {
    throw new Error(`신뢰되지 않은 스템 원본 호스트입니다: ${hostname}`);
  }
  return url;
}

function planLegacyPublicStemSourceMigration(row, metadata, source, inputExtension) {
  if (!isExternalStemUpload(metadata) || String(source).startsWith('storage://') || !row?.user_id) return null;

  let sourceUrl;
  let supabaseOrigin;
  try {
    sourceUrl = validateTrustedHttpStemSource(source);
    supabaseOrigin = new URL(SUPABASE_URL).origin;
  } catch {
    return null;
  }

  const publicObjectPath = `uploads/${row.id}.${inputExtension}`;
  const expectedPathname = `/storage/v1/object/public/melodio-assets/${publicObjectPath}`;
  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(sourceUrl.pathname);
  } catch {
    return null;
  }
  if (sourceUrl.origin !== supabaseOrigin || decodedPathname !== expectedPathname) return null;

  const privateObjectPath = `uploads/${row.user_id}/${row.id}.${inputExtension}`;
  const legacyPublicStemPaths = STEMS.flatMap(stem => [
    `stems/${row.id}/original/${stem}.wav`,
    `stems/${row.id}/preview/${stem}.m4a`,
  ]);
  return {
    publicBucket: 'melodio-assets',
    // broad prefix 삭제 없이 검증된 원본 1개 + 고정된 stem 산출물 8개만 정리한다.
    publicObjectPaths: [publicObjectPath, ...legacyPublicStemPaths],
    privateBucket: PRIVATE_STEM_BUCKET,
    privateObjectPath,
    privateStorageUri: `storage://${PRIVATE_STEM_BUCKET}/${privateObjectPath}`,
  };
}

function stemInputContentType(extension) {
  return {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  }[extension] || 'application/octet-stream';
}

async function fetchTrustedStemSource(source, signal) {
  let currentUrl = validateTrustedHttpStemSource(source);
  const redirectStatuses = new Set([301, 302, 303, 307, 308]);

  for (let redirectCount = 0; redirectCount <= STEM_MAX_SOURCE_REDIRECTS; redirectCount++) {
    const response = await fetch(currentUrl, { signal, redirect: 'manual' });
    if (!redirectStatuses.has(response.status)) return response;

    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => {});
    if (!location) throw new Error('음원 저장소 redirect 위치가 없습니다.');
    if (redirectCount === STEM_MAX_SOURCE_REDIRECTS) {
      throw new Error(`음원 저장소 redirect가 ${STEM_MAX_SOURCE_REDIRECTS}회를 초과했습니다.`);
    }
    currentUrl = validateTrustedHttpStemSource(new URL(location, currentUrl).toString());
  }

  throw new Error('음원 저장소 redirect 처리에 실패했습니다.');
}

function createOperationAbort(parentSignal, timeoutMs, label) {
  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => controller.abort(parentSignal.reason || new Error(`${label} 중단`));
  if (parentSignal?.aborted) onParentAbort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`${label} 시간 초과`));
  }, timeoutMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    },
  };
}

async function withOperationTimeout(label, timeoutMs, parentSignal, operation) {
  const timeout = createOperationAbort(parentSignal, timeoutMs, label);
  let abortListener;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(timeout.signal)),
      new Promise((_, reject) => {
        abortListener = () => {
          const reason = timeout.didTimeout()
            ? new Error(`${label} 시간 초과 (${Math.ceil(timeoutMs / 1000)}초)`)
            : (timeout.signal.reason instanceof Error ? timeout.signal.reason : new Error(`${label} 중단`));
          reject(reason);
        };
        timeout.signal.addEventListener('abort', abortListener, { once: true });
      }),
    ]);
  } finally {
    if (abortListener) timeout.signal.removeEventListener('abort', abortListener);
    timeout.cleanup();
  }
}

async function runChildProcess(command, args, { label, timeoutMs, signal, job }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = execFile(command, args, {
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      job.childProcesses.delete(child);
      if (error) {
        const detail = String(stderr || error.message || '').trim().slice(-2_000);
        reject(new Error(`${label} 실패${detail ? `: ${detail}` : ''}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    const onAbort = () => {
      if (settled) return;
      child.kill('SIGTERM');
      const forceKill = setTimeout(() => child.kill('SIGKILL'), 2_000);
      forceKill.unref?.();
    };

    job.childProcesses.add(child);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createByteLimitTransform(maxBytes, label) {
  let received = 0;
  return new Transform({
    transform(chunk, encoding, callback) {
      received += Buffer.byteLength(chunk);
      if (received > maxBytes) {
        callback(new Error(`${label} 크기가 ${Math.floor(maxBytes / 1024 / 1024)}MB 제한을 초과했습니다.`));
        return;
      }
      callback(null, chunk);
    },
  });
}

async function validateStemInputMedia(inputPath, signal, job) {
  const { stdout } = await runChildProcess('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name',
    '-of', 'json',
    inputPath,
  ], {
    label: 'FFprobe 원본 검증',
    timeoutMs: 30_000,
    signal,
    job,
  });

  let probe;
  try {
    probe = JSON.parse(stdout);
  } catch {
    throw new Error('원본 오디오 분석 결과를 읽을 수 없습니다.');
  }
  const duration = Number(probe?.format?.duration);
  const audioStreams = Array.isArray(probe?.streams)
    ? probe.streams.filter(stream => stream?.codec_type === 'audio')
    : [];
  if (!Number.isFinite(duration) || duration <= 0 || audioStreams.length === 0) {
    throw new Error('재생 가능한 오디오 스트림을 찾을 수 없습니다.');
  }
  if (duration > STEM_MAX_DURATION_SECONDS) {
    throw new Error(`오디오 길이는 최대 ${Math.floor(STEM_MAX_DURATION_SECONDS / 60)}분까지 처리할 수 있습니다.`);
  }
  const unsupportedCodec = audioStreams.find(stream => !ALLOWED_STEM_AUDIO_CODECS.has(String(stream.codec_name || '').toLowerCase()));
  if (unsupportedCodec) {
    throw new Error(`지원하지 않는 오디오 코덱입니다: ${unsupportedCodec.codec_name || 'unknown'}`);
  }
  return { duration, codec: audioStreams[0].codec_name };
}

async function patchStemMetadata(
  id,
  patch,
  rowPatch = {},
  expectedStemStatus = 'processing',
  expectedLeaseToken = null,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current, error: fetchError } = await supabase
      .from('generations')
      .select('id,status,license_hash')
      .eq('id', id)
      .single();
    if (fetchError || !current) {
      throw new Error(`스템 메타데이터 조회 실패: ${fetchError?.message || '행 없음'}`);
    }

    const metadata = parseGenerationMetadata(current.license_hash);
    if (expectedStemStatus && metadata.stemStatus !== expectedStemStatus) return false;
    if (expectedLeaseToken && metadata.stemLeaseToken !== expectedLeaseToken) return false;
    const nextMetadata = { ...metadata, ...patch };
    let updateQuery = supabase
      .from('generations')
      .update({ ...rowPatch, license_hash: JSON.stringify(nextMetadata) })
      .eq('id', id);
    updateQuery = addLicenseHashCondition(updateQuery, current.license_hash);
    const { data: updated, error: updateError } = await updateQuery.select('id');
    if (updateError) throw new Error(`스템 메타데이터 업데이트 실패: ${updateError.message}`);
    if (updated?.length) return true;
  }
  return false;
}

async function claimStemJob(row, job) {
  const metadata = parseGenerationMetadata(row.license_hash);
  if (!shouldClaimStemRow(row)) return false;

  const currentAttempt = Math.max(0, Number(metadata.stemAttempt) || 0);
  if (currentAttempt >= STEM_MAX_PROCESSING_ATTEMPTS) {
    const failedAt = new Date().toISOString();
    const nextMetadata = {
      ...metadata,
      stemStatus: 'failed',
      stemStage: 'failed',
      stemProgress: 0,
      stemHeartbeatAt: failedAt,
      stemFailedAt: failedAt,
      stemError: `스템 분리 최대 ${STEM_MAX_PROCESSING_ATTEMPTS}회 시도를 초과했습니다.`,
    };
    const nextStatus = isExternalStemUpload(metadata) ? 'failed' : 'completed';
    let limitQuery = supabase
      .from('generations')
      .update({ status: nextStatus, license_hash: JSON.stringify(nextMetadata) })
      .eq('id', row.id);
    limitQuery = addLicenseHashCondition(limitQuery, row.license_hash);
    const { data: limited, error: limitError } = await limitQuery.select('id');
    if (limitError) throw new Error(`스템 최대 시도 상태 기록 실패: ${limitError.message}`);
    if (limited?.length) {
      log('ERROR', '스템 최대 처리 시도 초과로 작업을 종료합니다.', { id: row.id, attempts: currentAttempt });
    }
    return false;
  }

  const now = new Date().toISOString();
  const artifactAttemptAudit = normalizedArtifactAttemptsForBackfill(metadata);
  const previousArtifactAttempts = artifactAttemptAudit.attempts;
  const storedLeaseClaimCount = Number(metadata.stemLeaseClaimCount);
  const leaseClaimCount = Number.isFinite(storedLeaseClaimCount)
    ? Math.max(0, storedLeaseClaimCount, previousArtifactAttempts.length)
    : previousArtifactAttempts.length;
  if (artifactAttemptAudit.invalid || leaseClaimCount >= STEM_MAX_LEASE_CLAIMS) {
    const failedAt = new Date().toISOString();
    const invalidHistory = artifactAttemptAudit.invalid;
    const nextMetadata = {
      ...metadata,
      stemStatus: 'failed',
      stemStage: 'failed',
      stemProgress: 0,
      stemHeartbeatAt: failedAt,
      stemFailedAt: failedAt,
      stemErrorCode: invalidHistory ? 'STEM_ARTIFACT_HISTORY_INVALID' : 'STEM_LEASE_CLAIM_LIMIT',
      stemError: invalidHistory
        ? '기존 Stem 파일 정리 이력을 안전하게 검증할 수 없습니다. 관리자 점검이 필요합니다.'
        : '반복된 시스템 중단으로 안전 복구 한도를 초과했습니다. 작업을 삭제한 뒤 다시 업로드해 주세요.',
    };
    const nextStatus = isExternalStemUpload(metadata) ? 'failed' : 'completed';
    let limitQuery = supabase
      .from('generations')
      .update({ status: nextStatus, license_hash: JSON.stringify(nextMetadata) })
      .eq('id', row.id);
    limitQuery = addLicenseHashCondition(limitQuery, row.license_hash);
    const { data: limited, error: limitError } = await limitQuery.select('id');
    if (limitError) throw new Error(`스템 lease claim 한도 기록 실패: ${limitError.message}`);
    if (limited?.length) {
      log('ERROR', '스템 artifact 이력/lease 안전 한도로 작업을 종료합니다.', {
        id: row.id,
        leaseClaims: leaseClaimCount,
        invalidHistory,
      });
    }
    return false;
  }
  const artifactStorage = shouldStoreStemPrivately(row, metadata) ? 'private' : 'public';
  const artifactAttempts = [
    ...previousArtifactAttempts,
    { token: job.leaseToken, storage: artifactStorage },
  ];
  const nextMetadata = {
    ...metadata,
    ...(isExternalStemUpload(metadata) ? { isPublic: false } : {}),
    stemStatus: 'processing',
    stemStage: 'claimed',
    stemProgress: 2,
    stemHeartbeatAt: now,
    stemStartedAt: now,
    stemWorkerId: STEM_WORKER_ID,
    stemLeaseToken: job.leaseToken,
    stemArtifactAttempts: artifactAttempts,
    stemArtifactStorage: artifactStorage,
    stemAttempt: currentAttempt + 1,
    stemLeaseClaimCount: leaseClaimCount + 1,
    stemCleanupReason: null,
    stemError: null,
  };
  const nextGenerationStatus = isExternalStemUpload(metadata) ? 'processing' : 'completed';

  let query = supabase
    .from('generations')
    .update({
      status: nextGenerationStatus,
      license_hash: JSON.stringify(nextMetadata),
      ...(isExternalStemUpload(metadata) ? { is_public: false } : {}),
    })
    .eq('id', row.id);
  query = addLicenseHashCondition(query, row.license_hash);
  if (metadata.stemStatus !== 'pending') query = query.eq('status', 'pending');
  const { data: claimed, error } = await query.select('id');
  if (error) throw new Error(`스템 작업 claim 실패: ${error.message}`);
  return Boolean(claimed?.length);
}

async function updateStemStage(job, stage, progress, extra = {}) {
  const updated = await patchStemMetadata(job.id, {
    stemStage: stage,
    stemProgress: progress,
    stemHeartbeatAt: new Date().toISOString(),
    ...extra,
  }, {}, 'processing', job.leaseToken);
  if (!updated) throw new Error(`스템 작업 lease 상실 (${stage})`);
  return true;
}

function startStemHeartbeat(job) {
  job.heartbeatTimer = setInterval(async () => {
    if (job.heartbeatInFlight || job.controller.signal.aborted) return;
    job.heartbeatInFlight = true;
    try {
      const updated = await patchStemMetadata(
        job.id,
        { stemHeartbeatAt: new Date().toISOString() },
        {},
        'processing',
        job.leaseToken,
      );
      if (!updated && !job.controller.signal.aborted) {
        const leaseError = new Error('스템 작업 lease 상실 (heartbeat)');
        log('WARN', '스템 heartbeat lease 상실 — 작업 중단', { id: job.id });
        job.controller.abort(leaseError);
      }
    } catch (error) {
      log('WARN', '스템 heartbeat 갱신 실패', { id: job.id, error: sanitizeStemError(error) });
    } finally {
      job.heartbeatInFlight = false;
    }
  }, STEM_HEARTBEAT_INTERVAL_MS);
  job.heartbeatTimer.unref?.();
}

async function downloadStemSource(row, metadata, source, destination, signal) {
  const storageRef = parseStorageUri(source);
  if (storageRef) {
    validatePrivateStemSource(row, metadata, storageRef);
    await withOperationTimeout('private 원본 다운로드', STEM_DOWNLOAD_TIMEOUT_MS, signal, async (operationSignal) => {
      const { data, error } = await supabase.storage
        .from(storageRef.bucket)
        .download(storageRef.objectPath, undefined, { signal: operationSignal })
        .asStream();
      if (error || !data) throw new Error(error?.message || 'Storage 객체 없음');
      await pipeline(
        data,
        createByteLimitTransform(STEM_MAX_SOURCE_BYTES, 'private 원본'),
        fs.createWriteStream(destination),
        { signal: operationSignal },
      );
    });
    return;
  }

  await withOperationTimeout('공개 원본 다운로드', STEM_DOWNLOAD_TIMEOUT_MS, signal, async (operationSignal) => {
    const response = await fetchTrustedStemSource(source, operationSignal);
    if (!response.ok || !response.body) throw new Error(`음원 다운로드 실패 (HTTP ${response.status})`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > STEM_MAX_SOURCE_BYTES) {
      await response.body.cancel().catch(() => {});
      throw new Error(`공개 원본 크기가 ${Math.floor(STEM_MAX_SOURCE_BYTES / 1024 / 1024)}MB 제한을 초과했습니다.`);
    }
    await pipeline(
      response.body,
      createByteLimitTransform(STEM_MAX_SOURCE_BYTES, '공개 원본'),
      fs.createWriteStream(destination),
      { signal: operationSignal },
    );
  });
}

function encodeStoragePath(objectPath) {
  return objectPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

async function uploadLocalStem({ bucket, objectPath, localPath, contentType, isPrivate, signal }) {
  const expectedSize = fs.statSync(localPath).size;
  if (!Number.isFinite(expectedSize) || expectedSize <= 0) {
    throw new Error(`빈 Stem 산출물은 업로드할 수 없습니다: ${path.basename(localPath)}`);
  }
  const bodyStream = fs.createReadStream(localPath);
  try {
    await withOperationTimeout(`Storage 업로드 ${path.basename(localPath)}`, STEM_UPLOAD_TIMEOUT_MS, signal, async (operationSignal) => {
      const endpoint = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        body: bodyStream,
        duplex: 'half',
        signal: operationSignal,
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }

      const { data: storedInfo, error: storedInfoError } = await supabase.storage
        .from(bucket)
        .info(objectPath);
      const storedSize = Number(storedInfo?.size || 0);
      if (storedInfoError || storedSize !== expectedSize) {
        throw new Error(
          storedInfoError?.message
          || `Storage 업로드 크기 불일치 (${expectedSize} -> ${storedSize}): ${objectPath}`,
        );
      }
    });
  } finally {
    bodyStream.destroy();
  }

  if (isPrivate) return `storage://${bucket}/${objectPath}`;
  return supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
}

async function removeLegacyPublicStemArtifacts(migration, signal) {
  for (let offset = 0; offset < migration.publicObjectPaths.length; offset += 100) {
    const objectPaths = migration.publicObjectPaths.slice(offset, offset + 100);
    await withOperationTimeout('legacy 공개 원본/스템 산출물 삭제', STEM_UPLOAD_TIMEOUT_MS, signal, async (operationSignal) => {
      const { error } = await supabase.storage
        .from(migration.publicBucket)
        .remove(objectPaths);
      if (error) throw new Error(error.message);
      if (operationSignal.aborted) throw operationSignal.reason || new Error('legacy 공개 artifact 삭제 중단');
    });
  }
}

async function removePartialStemArtifacts({ id, userId, privateOutput, leaseToken }) {
  const outputRoot = privateOutput
    ? `stems/${userId}/${id}/${leaseToken}`
    : `stems/${id}/${leaseToken}`;
  const bucket = privateOutput ? PRIVATE_STEM_OUTPUT_BUCKET : 'melodio-assets';
  const outputPaths = STEMS.flatMap(stem => [
    `${outputRoot}/original/${stem}.wav`,
    `${outputRoot}/preview/${stem}.m4a`,
  ]);
  const { error: outputError } = await supabase.storage.from(bucket).remove(outputPaths);
  if (outputError) throw new Error(`부분 Stem 산출물 삭제 실패: ${outputError.message}`);
}

// ─── 야간 과부하 방지: Max 100 Job 제한 ─────────────────────────────────────────
const MAX_JOBS = 100;
let jobsProcessed = 0;
let isSleeping = false;

// ─── 로그 유틸 (타임스탬프 포함) ─────────────────────────────────────────────
const log = (level, msg, data = '') => {
  const ts = new Date().toISOString();
  const prefix = { INFO: '✅', WARN: '⚠️', ERROR: '❌', PROC: '⚙️' }[level] || '▶';
  const extra = data ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[${ts}] ${prefix} [${level}] ${msg}${extra}`);
};

// ─── 슬립 모드 진입 ───────────────────────────────────────────────────────────
function enterSleepMode() {
  isSleeping = true;
  log('INFO', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('INFO', `  [WORKER ROTATION] Max ${MAX_JOBS}개 작업 완료 — 안전 재시작`);
  log('INFO', '  ▸ PM2가 새 프로세스로 자동 교체합니다.');
  log('INFO', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  setImmediate(() => { void initiateGracefulShutdown('max-jobs-rotation', 0); });
}

// ─── 핵심 파이프라인: claim된 generation row를 처리 ───────────────────────────
async function processGeneration(row, job) {
  const { id, user_id } = row;
  const metadata = parseGenerationMetadata(row.license_hash);
  const attemptBeforeClaim = Math.max(0, Number(metadata.stemAttempt) || 0);
  const source = getStemSource(row);
  const externalUpload = isExternalStemUpload(metadata);
  const privateOutput = shouldStoreStemPrivately(row, metadata);

  const workDir = path.join(os.tmpdir(), `melodio-worker-${id}`);
  const outDir = path.join(workDir, 'demucs_out');
  let sourceMigration = null;

  try {
    if (!source) throw new Error('분리할 audio_url 또는 source_audio_url이 없습니다.');
    if (privateOutput && !user_id) throw new Error('private 스템 저장에 필요한 user_id가 없습니다.');
    const inputExtension = resolveStemInputExtension(metadata, source);
    const inputFileName = `input.${inputExtension}`;
    const inputPath = path.join(workDir, inputFileName);
    const demucsInputName = path.parse(inputFileName).name;
    const demucsResultDir = path.join(outDir, 'htdemucs_ft', demucsInputName);
    // Mock 입력은 실제 원본을 대체할 수 없으므로 절대 migration/delete에 사용하지 않는다.
    sourceMigration = MOCK_MODE
      ? null
      : planLegacyPublicStemSourceMigration(row, metadata, source, inputExtension);
    fs.mkdirSync(outDir, { recursive: true });
    startStemHeartbeat(job);
    await updateStemStage(job, 'downloading', 8);
    log('PROC', `[1/5] 원본 오디오 다운로드 중... | ext=${inputExtension} | private=${Boolean(parseStorageUri(source))} | mock=${MOCK_MODE}`);
    if (!MOCK_MODE) await downloadStemSource(row, metadata, source, inputPath, job.controller.signal);
    else fs.writeFileSync(inputPath, Buffer.alloc(1024, 0xff));
    if (job.controller.signal.aborted) throw job.controller.signal.reason || new Error('스템 작업 중단');

    if (!MOCK_MODE) {
      await updateStemStage(job, 'validating', 12);
      const media = await validateStemInputMedia(inputPath, job.controller.signal, job);
      log('PROC', '원본 오디오 검증 완료', { id, duration: media.duration, codec: media.codec });
    }

    if (sourceMigration) {
      await updateStemStage(job, 'migrating-source', 15);
      await uploadLocalStem({
        bucket: sourceMigration.privateBucket,
        objectPath: sourceMigration.privateObjectPath,
        localPath: inputPath,
        contentType: stemInputContentType(inputExtension),
        isPrivate: true,
        signal: job.controller.signal,
      });
      log('PROC', 'legacy 공개 업로드 원본을 private Storage에 복사 완료', { id });
    }

    await updateStemStage(job, 'separating', 20);
    log('PROC', `[2/5] Demucs 분리 프로세스 가동 (htdemucs_ft)... | mock=${MOCK_MODE}`);
    if (!MOCK_MODE) {
      await runChildProcess('/usr/bin/python3', [
        '-m', 'demucs', '-n', 'htdemucs_ft', '-o', outDir, '-d', 'cpu', inputPath,
      ], {
        label: 'Demucs 분리',
        timeoutMs: STEM_DEMUCS_TIMEOUT_MS,
        signal: job.controller.signal,
        job,
      });
      if (!fs.existsSync(demucsResultDir)) {
        throw new Error(`Demucs 출력 디렉토리 없음: ${demucsResultDir}`);
      }
    } else {
      fs.mkdirSync(demucsResultDir, { recursive: true });
      for (const stem of STEMS) {
        fs.writeFileSync(path.join(demucsResultDir, `${stem}.wav`), Buffer.alloc(2048, 0xab));
      }
    }
    if (job.controller.signal.aborted) throw job.controller.signal.reason || new Error('스템 작업 중단');

    await updateStemStage(job, 'encoding', 62);
    log('PROC', `[3/5] FFmpeg AAC 프리뷰 인코딩 시작... | mock=${MOCK_MODE}`);
    if (!MOCK_MODE) {
      await Promise.all(STEMS.map(stem => runChildProcess('ffmpeg', [
        '-y', '-i', path.join(demucsResultDir, `${stem}.wav`),
        // Browser mixer decodes all four previews simultaneously. Mono 44.1k
        // previews keep full-length memory bounded; downloadable WAVs stay stereo.
        '-c:a', 'aac', '-ac', '1', '-ar', '44100', '-b:a', '128k', path.join(demucsResultDir, `${stem}.m4a`),
      ], {
        label: `FFmpeg AAC 변환(${stem})`,
        timeoutMs: STEM_FFMPEG_TIMEOUT_MS,
        signal: job.controller.signal,
        job,
      })));
    } else {
      for (const stem of STEMS) {
        fs.writeFileSync(path.join(demucsResultDir, `${stem}.m4a`), Buffer.alloc(1024, 0xcd));
      }
    }
    if (job.controller.signal.aborted) throw job.controller.signal.reason || new Error('스템 작업 중단');

    await updateStemStage(job, 'uploading', 75);
    const bucket = privateOutput ? PRIVATE_STEM_OUTPUT_BUCKET : 'melodio-assets';
    // Attempt-scoped paths make late cleanup from a stale worker harmless: an
    // old lease can only delete its own files, never the next attempt's output.
    const outputRoot = privateOutput
      ? `stems/${user_id}/${id}/${job.leaseToken}`
      : `stems/${id}/${job.leaseToken}`;
    const uploadResults = { original: {}, preview: {} };
    log('PROC', `[4/5] Storage 스트리밍 업로드 시작`, { id, bucket });

    for (let index = 0; index < STEMS.length; index++) {
      const stem = STEMS[index];
      const wavRemote = `${outputRoot}/original/${stem}.wav`;
      const aacRemote = `${outputRoot}/preview/${stem}.m4a`;
      uploadResults.original[stem] = await uploadLocalStem({
        bucket,
        objectPath: wavRemote,
        localPath: path.join(demucsResultDir, `${stem}.wav`),
        contentType: 'audio/wav',
        isPrivate: privateOutput,
        signal: job.controller.signal,
      });
      uploadResults.preview[stem] = await uploadLocalStem({
        bucket,
        objectPath: aacRemote,
        localPath: path.join(demucsResultDir, `${stem}.m4a`),
        contentType: 'audio/mp4',
        isPrivate: privateOutput,
        signal: job.controller.signal,
      });
      if (job.controller.signal.aborted) throw job.controller.signal.reason || new Error('스템 작업 중단');
      await updateStemStage(job, 'uploading', 80 + ((index + 1) * 4));
      log('PROC', `  → [${stem}] WAV + AAC 업로드 완료`);
    }

    await updateStemStage(job, 'finalizing', 98);
    const completedAt = new Date().toISOString();
    const rowPatch = {
      is_stem_extracted: true,
      stem_vocals_url: uploadResults.original.vocals,
      stem_bass_url: uploadResults.original.bass,
      stem_drums_url: uploadResults.original.drums,
      stem_other_url: uploadResults.original.other,
      preview_vocals_url: uploadResults.preview.vocals,
      preview_bass_url: uploadResults.preview.bass,
      preview_drums_url: uploadResults.preview.drums,
      preview_other_url: uploadResults.preview.other,
      ...(externalUpload ? { status: 'completed' } : {}),
      ...(sourceMigration ? {
        audio_url: null,
        source_audio_url: sourceMigration.privateStorageUri,
      } : {}),
    };
    const completed = await patchStemMetadata(id, {
      stemStatus: 'completed',
      stemStage: 'completed',
      stemProgress: 100,
      stemHeartbeatAt: completedAt,
      stemCompletedAt: completedAt,
      stemError: null,
      ...(sourceMigration ? {
        stemSourceMigratedAt: completedAt,
        storageBucket: sourceMigration.privateBucket,
        storagePath: sourceMigration.privateObjectPath,
        stemLegacyPublicArtifactsCleanup: 'pending',
        stemLegacyPublicArtifactsCleanupError: null,
      } : {}),
    }, rowPatch, 'processing', job.leaseToken);
    if (!completed) throw new Error('작업 lease를 잃어 최종 DB 반영을 중단했습니다.');

    if (sourceMigration) {
      try {
        await removeLegacyPublicStemArtifacts(sourceMigration, job.controller.signal);
        await patchStemMetadata(id, {
          stemLegacyPublicArtifactsCleanup: 'completed',
          stemLegacyPublicArtifactsDeletedAt: new Date().toISOString(),
          stemLegacyPublicArtifactsCleanupError: null,
        }, {}, 'completed');
        log('INFO', 'legacy public artifacts cleanup 완료', { id, objectCount: sourceMigration.publicObjectPaths.length });
      } catch (cleanupError) {
        const cleanupMessage = sanitizeStemError(cleanupError);
        log('ERROR', 'legacy public artifacts cleanup 실패', { id, error: cleanupMessage });
        try {
          await patchStemMetadata(id, {
            stemLegacyPublicArtifactsCleanup: 'failed',
            stemLegacyPublicArtifactsCleanupError: cleanupMessage,
          }, {}, 'completed');
        } catch (metadataError) {
          log('ERROR', 'legacy public artifacts cleanup 실패 메타데이터 기록 실패', {
            id,
            error: sanitizeStemError(metadataError),
          });
        }
      }
    }
    log('INFO', `[5/5] 스템 파이프라인 최종 완료 ✔`, { id, privateOutput });
  } catch (error) {
    const errorMessage = sanitizeStemError(error);
    const shouldRequeue = isShuttingDown;
    log(shouldRequeue ? 'WARN' : 'ERROR', shouldRequeue ? '종료 중 스템 작업 재큐' : '스템 파이프라인 실패', {
      id,
      error: errorMessage,
    });
    try {
      if (job.heartbeatTimer) {
        clearInterval(job.heartbeatTimer);
        job.heartbeatTimer = null;
      }
      // 먼저 이 lease만 진입할 수 있는 정리 상태를 CAS로 선점한다. 이 상태는
      // stale recovery/다른 worker가 claim하지 않으므로, 선점 이후 deterministic
      // Storage 경로를 지워도 새 시도의 정상 산출물과 충돌하지 않는다.
      const ownsFailureCleanup = await patchStemMetadata(id, {
        stemStatus: 'cleanup',
        stemStage: 'cleanup',
        stemHeartbeatAt: new Date().toISOString(),
        stemCleanupReason: shouldRequeue ? 'worker-shutdown' : 'processing-error',
      }, {}, 'processing', job.leaseToken);
      if (!ownsFailureCleanup) {
        log('WARN', 'lease를 잃은 실행의 실패 정리/상태 변경을 건너뜁니다.', { id });
        return;
      }

      try {
        await removePartialStemArtifacts({
          id,
          userId: user_id,
          privateOutput,
          leaseToken: job.leaseToken,
        });
      } catch (cleanupError) {
        log('ERROR', '실패한 Stem 부분 산출물 정리 실패', { id, error: sanitizeStemError(cleanupError) });
      }

      const rowStatus = externalUpload
        ? (shouldRequeue ? 'pending' : 'failed')
        : 'completed';
      const recorded = await patchStemMetadata(id, {
        stemStatus: shouldRequeue ? 'pending' : 'failed',
        stemStage: shouldRequeue ? 'queued' : 'failed',
        stemProgress: 0,
        stemHeartbeatAt: new Date().toISOString(),
        stemError: shouldRequeue ? null : errorMessage,
        ...(shouldRequeue
          ? {
              stemAttempt: attemptBeforeClaim,
              stemInfrastructureRequeueCount: Math.max(0, Number(metadata.stemInfrastructureRequeueCount) || 0) + 1,
              stemCleanupReason: null,
              stemRequeuedAt: new Date().toISOString(),
              stemRequeueReason: 'worker-shutdown',
            }
          : { stemCleanupReason: null, stemFailedAt: new Date().toISOString() }),
      }, { status: rowStatus }, 'cleanup', job.leaseToken);
      if (!recorded) log('WARN', '스템 실패/재큐 최종 상태 CAS 충돌', { id });
    } catch (stateError) {
      log('ERROR', '스템 실패/재큐 상태 기록 실패', { id, error: sanitizeStemError(stateError) });
    }
  } finally {
    if (job.heartbeatTimer) clearInterval(job.heartbeatTimer);
    for (const child of job.childProcesses) child.kill('SIGKILL');
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      log('PROC', `[CLEANUP] 임시 파일 정리 완료: ${workDir}`);
    } catch (error) {
      log('WARN', `임시 파일 정리 실패: ${sanitizeStemError(error)}`);
    }
  }
}

async function scheduleStemJob(row, source = 'unknown') {
  if (isShuttingDown || isSleeping) return false;
  if (!row?.id || activeStemJobs.has(row.id)) {
    if (row?.id) log('INFO', '이미 이 프로세스에서 처리 중인 스템 작업을 건너뜁니다.', { id: row.id, source });
    return false;
  }
  // Demucs는 Mac mini CPU/RAM을 크게 사용하므로 프로세스 전체에서 반드시 1개만 실행한다.
  // 다른 ID는 DB pending 상태를 유지하며 다음 30초 스캔에서 다시 잡는다.
  if (activeStemJobs.size > 0) {
    log('INFO', '다른 스템 작업이 실행 중이므로 pending을 유지합니다.', { id: row.id, source });
    return false;
  }
  if (jobsProcessed >= MAX_JOBS) {
    enterSleepMode();
    return false;
  }

  const job = {
    id: row.id,
    leaseToken: randomUUID(),
    controller: new AbortController(),
    childProcesses: new Set(),
    heartbeatTimer: null,
    heartbeatInFlight: false,
    promise: null,
  };
  activeStemJobs.set(row.id, job);

  job.promise = (async () => {
    const claimed = await claimStemJob(row, job);
    if (!claimed) {
      log('INFO', '다른 worker가 먼저 claim했거나 더 이상 pending이 아닙니다.', { id: row.id, source });
      return false;
    }
    jobsProcessed++;
    log('INFO', `[잡 ${jobsProcessed}/${MAX_JOBS}] 스템 처리 시작`, { id: row.id, source });
    await processGeneration(row, job);
    return true;
  })();

  try {
    return await job.promise;
  } catch (error) {
    log('ERROR', '스템 작업 스케줄 실패', { id: row.id, source, error: sanitizeStemError(error) });
    return false;
  } finally {
    activeStemJobs.delete(row.id);
  }
}

// ─── Realtime 구독 설정 ───────────────────────────────────────────────────────
function startRealtimeSubscription() {
  log('INFO', 'Supabase Realtime 구독 시작 (generations 테이블 INSERT/UPDATE 감시)');

  const channel = supabase
    .channel('generations-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'generations',
      },
      async (payload) => {
        const row = payload.new;
        if (!row) return;

        // 새 큐 기준은 license_hash.stemStatus이며, 예전 status=pending 행도 계속 지원한다.
        if (shouldClaimStemRow(row)) {
          log('INFO', `generation ${payload.eventType} 감지 -> 스템 분리 claim 시도`, { id: row.id });
          try {
            await scheduleStemJob(row, `realtime:${payload.eventType}`);
          } catch (err) {
            log('ERROR', '이벤트 핸들러 예외', err.message);
          }
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        log('INFO', 'Realtime 채널 연결 완료 — 이벤트 대기 중...');
      } else if (status === 'CHANNEL_ERROR') {
        log('ERROR', 'Realtime 채널 에러 — 재연결 시도 중...');
      } else {
        log('WARN', `Realtime 상태 변경: ${status}`);
      }
    });

  generationChannel = channel;
  return generationChannel;
}

// ─── graceful 종료: 진행 중 작업을 중단하고 pending으로 돌린 뒤 종료 ──────────
async function initiateGracefulShutdown(reason, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('WARN', `graceful shutdown 시작`, { reason, activeStemJobs: activeStemJobs.size });

  if (pendingScanTimeout) clearTimeout(pendingScanTimeout);
  if (pendingScanInterval) clearInterval(pendingScanInterval);
  if (generationChannel) {
    try { await supabase.removeChannel(generationChannel); } catch {}
  }

  const activePromises = [];
  for (const job of activeStemJobs.values()) {
    job.controller.abort(new Error(`worker shutdown: ${reason}`));
    if (job.promise) activePromises.push(job.promise);
  }

  let graceTimer;
  await Promise.race([
    Promise.allSettled(activePromises),
    new Promise(resolve => {
      graceTimer = setTimeout(resolve, STEM_SHUTDOWN_GRACE_MS);
      graceTimer.unref?.();
    }),
  ]);
  if (graceTimer) clearTimeout(graceTimer);

  // timeout 등으로 catch에 도달하지 못한 job도 낙관적 조건으로 재큐한다.
  for (const job of activeStemJobs.values()) {
    try {
      const { data: row } = await supabase
        .from('generations')
        .select('id,status,license_hash')
        .eq('id', job.id)
        .single();
      if (!row || !isProcessingStemRow(row)) continue;
      const metadata = parseGenerationMetadata(row.license_hash);
      const status = isExternalStemUpload(metadata) ? 'pending' : 'completed';
      const processingAttempt = Math.max(0, Number(metadata.stemAttempt) || 0);
      await patchStemMetadata(job.id, {
        stemStatus: 'pending',
        stemStage: 'queued',
        stemProgress: 0,
        stemHeartbeatAt: new Date().toISOString(),
        stemAttempt: Math.max(0, processingAttempt - 1),
        stemInfrastructureRequeueCount: Math.max(0, Number(metadata.stemInfrastructureRequeueCount) || 0) + 1,
        stemCleanupReason: null,
        stemError: null,
        stemRequeuedAt: new Date().toISOString(),
        stemRequeueReason: `worker-shutdown:${reason}`,
      }, { status }, 'processing', job.leaseToken);
    } catch (error) {
      log('ERROR', 'shutdown 재큐 실패', { id: job.id, error: sanitizeStemError(error) });
    }
  }

  log('INFO', 'graceful shutdown 완료', { reason });
  process.exit(exitCode);
}

process.on('SIGTERM', () => { void initiateGracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { void initiateGracefulShutdown('SIGINT'); });
process.on('uncaughtException', (error) => {
  log('ERROR', `예외 미처리: ${error.message}`, error.stack);
  void initiateGracefulShutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (error) => {
  log('ERROR', 'Promise rejection 미처리', sanitizeStemError(error));
  void initiateGracefulShutdown('unhandledRejection', 1);
});

// ─── 워커 메인 진입점 ─────────────────────────────────────────────────────────
log('INFO', '============================================');
log('INFO', '  Melodio Worker Node v2.0 (Phase 10: Dual)  ');
log('INFO', '============================================');
log('INFO', `SUPABASE_URL: ${SUPABASE_URL}`);

startRealtimeSubscription();
startVideoSubscription();

async function cleanupExpiredStemUploadSessions() {
  let query = supabase
    .from('stem_upload_sessions')
    .select('id,user_id,storage_path')
    .is('confirmed_at', null)
    .lt('expires_at', new Date().toISOString())
    .order('id', { ascending: true })
    .limit(100);
  if (expiredSessionCursor) query = query.gt('id', expiredSessionCursor);
  const { data: sessions, error } = await query;
  if (error) throw new Error(`만료 Stem 업로드 세션 조회 실패: ${error.message}`);
  expiredSessionCursor = sessions?.length ? sessions[sessions.length - 1].id : null;

  for (const session of sessions || []) {
    const sourceUri = `storage://${PRIVATE_STEM_BUCKET}/${session.storage_path}`;
    const { data: reference, error: referenceError } = await supabase
      .from('generations')
      .select('id')
      .eq('user_id', session.user_id)
      .eq('source_audio_url', sourceUri)
      .limit(1)
      .maybeSingle();
    if (referenceError) {
      log('ERROR', '만료 업로드 세션 참조 확인 실패', { id: session.id, error: referenceError.message });
      continue;
    }
    if (reference) {
      const { error: repairError } = await supabase
        .from('stem_upload_sessions')
        .update({ confirmed_at: new Date().toISOString(), generation_id: reference.id })
        .eq('id', session.id)
        .is('confirmed_at', null);
      if (repairError) log('ERROR', 'Stem 업로드 세션 확정 상태 복구 실패', { id: session.id, error: repairError.message });
      continue;
    }

    const { data: cleanupScheduled, error: scheduleError } = await supabase.rpc(
      'expire_stem_upload_session_with_cleanup',
      {
        p_id: session.id,
        p_user_id: session.user_id,
        p_storage_path: session.storage_path,
      },
    );
    if (scheduleError) {
      log('ERROR', '만료 Stem 업로드 cleanup 예약 실패', { id: session.id, error: scheduleError.message });
      continue;
    }
    if (!cleanupScheduled) continue;

    const { error: removeError } = await supabase.storage
      .from(PRIVATE_STEM_BUCKET)
      .remove([session.storage_path]);
    if (removeError) {
      log('ERROR', '만료 미확정 Stem 원본 삭제 실패', { id: session.id, error: removeError.message });
    }
  }

  if (sessions?.length) log('INFO', '만료 Stem 업로드 세션 정리 완료', { count: sessions.length });
}

function validateStemCleanupManifest(task) {
  const manifest = task?.cleanup_manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  const privateSource = Array.isArray(manifest.privateSource) ? manifest.privateSource : null;
  const privateOutputs = Array.isArray(manifest.privateOutputs) ? manifest.privateOutputs : null;
  const publicAssets = Array.isArray(manifest.publicAssets) ? manifest.publicAssets : null;
  if (!privateSource || !privateOutputs || !publicAssets) return null;
  if (![...privateSource, ...privateOutputs, ...publicAssets].every(value => typeof value === 'string')) return null;

  const uuidSegment = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  const optionalAttempt = `(?:${uuidSegment}/)?`;
  const stemName = '(?:vocals|drums|bass|other)';
  const sourcePattern = new RegExp(
    `^uploads/${task.user_id}/${task.generation_id}(?:/${uuidSegment})?\\.(?:mp3|wav|m4a|aac|ogg|flac)$`,
    'i',
  );
  const privateOutputPattern = new RegExp(
    `^stems/${task.user_id}/${task.generation_id}/${optionalAttempt}(?:original/${stemName}\\.wav|preview/${stemName}\\.m4a)$`,
    'i',
  );
  const publicOutputPattern = new RegExp(
    `^stems/${task.generation_id}/${optionalAttempt}(?:original/${stemName}\\.wav|preview/${stemName}\\.m4a)$`,
    'i',
  );
  const publicSourcePattern = new RegExp(`^uploads/${task.generation_id}\\.(?:mp3|wav|m4a|aac|ogg|flac)$`, 'i');
  if (privateSource.length > 11 || !privateSource.every(value => sourcePattern.test(value))) return null;
  if (privateOutputs.length > 144 || !privateOutputs.every(value => privateOutputPattern.test(value))) return null;
  if (publicAssets.length > 145 || !publicAssets.every(value => publicOutputPattern.test(value) || publicSourcePattern.test(value))) return null;
  return { privateSource, privateOutputs, publicAssets };
}

async function processStemStorageCleanupOutbox() {
  let query = supabase
    .from('stem_storage_cleanup_tasks')
    .select('generation_id,user_id,cleanup_manifest,attempts,next_attempt_at')
    .lte('next_attempt_at', new Date().toISOString())
    .order('generation_id', { ascending: true })
    .limit(100);
  if (cleanupOutboxCursor) query = query.gt('generation_id', cleanupOutboxCursor);
  const { data: tasks, error } = await query;
  if (error) throw new Error(`Stem cleanup outbox 조회 실패: ${error.message}`);
  cleanupOutboxCursor = tasks?.length ? tasks[tasks.length - 1].generation_id : null;

  for (const task of tasks || []) {
    const manifest = validateStemCleanupManifest(task);
    if (!manifest) {
      const message = 'cleanup manifest exact-path 검증 실패';
      log('ERROR', message, { id: task.generation_id });
      await supabase.from('stem_storage_cleanup_tasks').update({
        attempts: Number(task.attempts || 0) + 1,
        last_error: message,
        next_attempt_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('generation_id', task.generation_id);
      continue;
    }

    try {
      for (const [bucket, paths] of [
        [PRIVATE_STEM_BUCKET, manifest.privateSource],
        [PRIVATE_STEM_OUTPUT_BUCKET, manifest.privateOutputs],
        ['melodio-assets', manifest.publicAssets],
      ]) {
        if (paths.length === 0) continue;
        for (let offset = 0; offset < paths.length; offset += 100) {
          const { error: removeError } = await supabase.storage
            .from(bucket)
            .remove(paths.slice(offset, offset + 100));
          if (removeError) throw new Error(`${bucket}: ${removeError.message}`);
        }
      }
      const { error: deleteError } = await supabase
        .from('stem_storage_cleanup_tasks')
        .delete()
        .eq('generation_id', task.generation_id);
      if (deleteError) throw new Error(`outbox 완료 삭제: ${deleteError.message}`);
      log('INFO', 'Stem Storage cleanup outbox 처리 완료', { id: task.generation_id });
    } catch (cleanupError) {
      const message = sanitizeStemError(cleanupError);
      log('ERROR', 'Stem Storage cleanup outbox 처리 실패', { id: task.generation_id, error: message });
      await supabase.from('stem_storage_cleanup_tasks').update({
        attempts: Number(task.attempts || 0) + 1,
        last_error: message,
        next_attempt_at: new Date(
          Date.now() + Math.min(60 * 60_000, Math.max(5 * 60_000, (Number(task.attempts || 0) + 1) * 5 * 60_000)),
        ).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('generation_id', task.generation_id);
    }
  }
}

async function enforceLegacyStemUploadPrivacy() {
  let stemUploadQuery = supabase
      .from('generations')
      .select('id,is_public,license_hash')
      .like('license_hash', '%"sourceMenu":"stem-upload"%')
      .or('is_public.is.null,is_public.eq.true')
      .order('id', { ascending: true })
      .limit(200);
  let customUploadQuery = supabase
      .from('generations')
      .select('id,is_public,license_hash')
      .like('license_hash', '%"sourceMenu":"custom-upload"%')
      .or('is_public.is.null,is_public.eq.true')
      .order('id', { ascending: true })
      .limit(200);
  if (stemUploadPrivacyCursor) stemUploadQuery = stemUploadQuery.gt('id', stemUploadPrivacyCursor);
  if (customUploadPrivacyCursor) customUploadQuery = customUploadQuery.gt('id', customUploadPrivacyCursor);
  const [stemUploadResult, customUploadResult] = await Promise.all([stemUploadQuery, customUploadQuery]);
  if (stemUploadResult.error) throw new Error(`stem-upload privacy 조회 실패: ${stemUploadResult.error.message}`);
  if (customUploadResult.error) throw new Error(`custom-upload privacy 조회 실패: ${customUploadResult.error.message}`);
  stemUploadPrivacyCursor = stemUploadResult.data?.length
    ? stemUploadResult.data[stemUploadResult.data.length - 1].id
    : null;
  customUploadPrivacyCursor = customUploadResult.data?.length
    ? customUploadResult.data[customUploadResult.data.length - 1].id
    : null;

  const rows = Array.from(new Map(
    [...(stemUploadResult.data || []), ...(customUploadResult.data || [])].map(row => [row.id, row]),
  ).values());
  for (const row of rows) {
    const metadata = parseGenerationMetadata(row.license_hash);
    if (!isExternalStemUpload(metadata) || (row.is_public === false && metadata.isPublic === false)) continue;
    const nextMetadata = { ...metadata, isPublic: false };
    let query = supabase
      .from('generations')
      .update({ is_public: false, license_hash: JSON.stringify(nextMetadata) })
      .eq('id', row.id);
    query = addLicenseHashCondition(query, row.license_hash);
    const { error: updateError } = await query;
    if (updateError) log('ERROR', 'legacy Stem 비공개 강제 실패', { id: row.id, error: updateError.message });
  }
}

function rebuildLegacyPublicCleanupPlan(row, metadata) {
  if (!row?.id || !row?.user_id || !isExternalStemUpload(metadata)) return null;
  if (!['pending', 'failed'].includes(metadata.stemLegacyPublicArtifactsCleanup)) return null;
  const storagePath = String(metadata.storagePath || '');
  const escapedUserId = String(row.user_id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedRowId = String(row.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const storageMatch = new RegExp(
    `^uploads/${escapedUserId}/${escapedRowId}(?:/[0-9a-f-]{36})?\\.(mp3|wav|m4a|aac|ogg|flac)$`,
    'i',
  ).exec(storagePath);
  const extension = (storageMatch?.[1] || '').toLowerCase();
  if (!PRIVATE_STEM_INPUT_EXTENSIONS.has(extension)) return null;
  if (row.source_audio_url !== `storage://${PRIVATE_STEM_BUCKET}/${storagePath}`) return null;

  return {
    publicBucket: 'melodio-assets',
    publicObjectPaths: [
      `uploads/${row.id}.${extension}`,
      ...STEMS.flatMap(stem => [
        `stems/${row.id}/original/${stem}.wav`,
        `stems/${row.id}/preview/${stem}.m4a`,
      ]),
    ],
  };
}

function planCompletedLegacyStemBackfill(row, metadata, backfillToken) {
  if (!row?.id || !row?.user_id || !row?.is_stem_extracted || !isExternalStemUpload(metadata)) return null;
  const source = row.source_audio_url || row.audio_url;
  if (typeof source !== 'string' || source.startsWith('storage://')) return null;

  let sourceUrl;
  try {
    sourceUrl = new URL(source);
  } catch {
    return null;
  }
  const expectedPrefix = `/storage/v1/object/public/melodio-assets/uploads/${row.id}.`;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(sourceUrl.pathname);
  } catch {
    return null;
  }
  if (sourceUrl.origin !== new URL(SUPABASE_URL).origin || !decodedPath.startsWith(expectedPrefix)) return null;
  const extension = decodedPath.slice(expectedPrefix.length).toLowerCase();
  if (!PRIVATE_STEM_INPUT_EXTENSIONS.has(extension)) return null;

  const sourcePublicPath = `uploads/${row.id}.${extension}`;
  const sourcePrivatePath = `uploads/${row.user_id}/${row.id}/${backfillToken}.${extension}`;
  const outputPairs = STEMS.flatMap(stem => [
    {
      publicPath: `stems/${row.id}/original/${stem}.wav`,
      privatePath: `stems/${row.user_id}/${row.id}/${backfillToken}/original/${stem}.wav`,
      contentType: 'audio/wav',
      kind: 'original',
      stem,
    },
    {
      publicPath: `stems/${row.id}/preview/${stem}.m4a`,
      privatePath: `stems/${row.user_id}/${row.id}/${backfillToken}/preview/${stem}.m4a`,
      contentType: 'audio/mp4',
      kind: 'preview',
      stem,
    },
  ]);
  return {
    extension,
    sourcePublicPath,
    sourcePrivatePath,
    outputPairs,
    publicObjectPaths: [sourcePublicPath, ...outputPairs.map(item => item.publicPath)],
  };
}

const GENERATED_STEM_OUTPUT_FIELDS = STEMS.flatMap(stem => [
  {
    field: `stem_${stem}_url`,
    stem,
    kind: 'original',
    extension: 'wav',
    contentType: 'audio/wav',
  },
  {
    field: `preview_${stem}_url`,
    stem,
    kind: 'preview',
    extension: 'm4a',
    contentType: 'audio/mp4',
  },
]);

function exactLegacyPublicStorageObjectPath(reference) {
  if (typeof reference !== 'string' || !reference) return null;
  let parsed;
  try {
    parsed = new URL(reference);
  } catch {
    return null;
  }
  if (parsed.origin !== new URL(SUPABASE_URL).origin || parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  const prefix = '/storage/v1/object/public/melodio-assets/';
  if (!decodedPath.startsWith(prefix)) return null;
  return decodedPath.slice(prefix.length);
}

function generatedOutputPath(id, storageToken, descriptor, isPrivate, userId = null) {
  const root = isPrivate
    ? `stems/${userId}/${id}/${storageToken}`
    : `stems/${id}`;
  return `${root}/${descriptor.kind}/${descriptor.stem}.${descriptor.extension}`;
}

function generatedPublicOutputAttemptToken(id, descriptor, objectPath) {
  const deterministicPath = generatedOutputPath(id, null, descriptor, false);
  if (objectPath === deterministicPath) return '';
  const prefix = `stems/${id}/`;
  const suffix = `/${descriptor.kind}/${descriptor.stem}.${descriptor.extension}`;
  if (!objectPath.startsWith(prefix) || !objectPath.endsWith(suffix)) return null;
  const token = objectPath.slice(prefix.length, -suffix.length);
  return UUID_OBJECT_SEGMENT_PATTERN.test(token) ? token : null;
}

function isAllowedGeneratedPublicOutputPath(id, objectPath) {
  return GENERATED_STEM_OUTPUT_FIELDS.some(
    descriptor => generatedPublicOutputAttemptToken(id, descriptor, objectPath) !== null,
  );
}

function isSeparatedShortFormStemDomain(metadata) {
  if (isShortFormTrack(metadata) || metadata?.viralMode === true) return true;
  const sourceMenu = String(metadata?.sourceMenu || '').toLowerCase();
  if (sourceMenu.includes('viral') || sourceMenu.includes('parody') || sourceMenu.includes('short')) return true;
  if (metadata?.isParody === true || metadata?.parodyMode === true || metadata?.shortForm === true) return true;
  const actualDuration = Number(metadata?.duration);
  return Number.isFinite(actualDuration) && actualDuration > 0 && actualDuration <= 60;
}

function normalizedArtifactAttemptsForBackfill(metadata) {
  if (!Array.isArray(metadata.stemArtifactAttempts)) return { attempts: [], invalid: false };
  const attempts = [];
  const seen = new Set();
  for (const value of metadata.stemArtifactAttempts) {
    const token = typeof value === 'string' ? value : value?.token;
    const storage = typeof value === 'string' ? metadata.stemArtifactStorage : value?.storage;
    if (
      typeof token !== 'string'
      || !UUID_OBJECT_SEGMENT_PATTERN.test(token)
      || (storage !== 'private' && storage !== 'public')
    ) return { attempts: [], invalid: true };
    const key = `${storage}:${token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    attempts.push({ token, storage });
  }
  return { attempts, invalid: false };
}

function normalizedArtifactMetadataAfterPublicCleanup(metadata) {
  const normalized = normalizedArtifactAttemptsForBackfill(metadata);
  if (normalized.invalid) return null;
  const privateAttempts = normalized.attempts.filter(attempt => attempt.storage === 'private');
  return {
    stemArtifactAttempts: privateAttempts,
    stemArtifactStorage: privateAttempts.length ? 'private' : null,
  };
}

function planCompletedGeneratedStemOutputBackfill(row, metadata, storageToken) {
  if (
    !row?.id
    || !row?.user_id
    || !row?.is_stem_extracted
    || isExternalStemUpload(metadata)
    || isSeparatedShortFormStemDomain(metadata)
    || metadata.stemStatus === 'processing'
    || metadata.stemStatus === 'cleanup'
    || !UUID_OBJECT_SEGMENT_PATTERN.test(storageToken)
  ) return null;

  const outputPairs = [];
  let currentPublicAttemptToken;
  for (const descriptor of GENERATED_STEM_OUTPUT_FIELDS) {
    const publicPath = exactLegacyPublicStorageObjectPath(row[descriptor.field]);
    if (!publicPath) return null;
    const publicAttemptToken = generatedPublicOutputAttemptToken(row.id, descriptor, publicPath);
    if (publicAttemptToken === null) return null;
    if (currentPublicAttemptToken === undefined) currentPublicAttemptToken = publicAttemptToken;
    else if (currentPublicAttemptToken !== publicAttemptToken) return null;
    outputPairs.push({
      ...descriptor,
      publicPath,
      privatePath: generatedOutputPath(row.id, storageToken, descriptor, true, row.user_id),
    });
  }
  const artifactAttempts = normalizedArtifactAttemptsForBackfill(metadata);
  if (artifactAttempts.invalid || artifactAttempts.attempts.length > STEM_MAX_LEASE_CLAIMS) return null;
  const publicObjectPaths = new Set(outputPairs.map(output => output.publicPath));
  for (const attempt of artifactAttempts.attempts) {
    if (attempt.storage !== 'public') continue;
    for (const descriptor of GENERATED_STEM_OUTPUT_FIELDS) {
      publicObjectPaths.add(`stems/${row.id}/${attempt.token}/${descriptor.kind}/${descriptor.stem}.${descriptor.extension}`);
    }
  }
  if (publicObjectPaths.size > 136) return null;
  return {
    outputPairs,
    publicObjectPaths: [...publicObjectPaths],
  };
}

function rebuildGeneratedStemOutputCleanupPlan(row, metadata) {
  if (!row?.id || !row?.user_id || isExternalStemUpload(metadata)) return null;
  if (metadata.stemLegacyOutputBackfillKind !== 'outputs-only') return null;
  if (!['pending', 'failed'].includes(metadata.stemLegacyOutputPublicArtifactsCleanup)) return null;
  const storageToken = String(metadata.stemLegacyOutputBackfillStorageToken || '');
  if (!UUID_OBJECT_SEGMENT_PATTERN.test(storageToken)) return null;

  const persistedPublicPaths = metadata.stemLegacyOutputPublicObjectPaths;
  if (
    !Array.isArray(persistedPublicPaths)
    || persistedPublicPaths.length < GENERATED_STEM_OUTPUT_FIELDS.length
    || persistedPublicPaths.length > 136
    || persistedPublicPaths.some(value => typeof value !== 'string')
  ) return null;
  const publicObjectPaths = [...new Set(persistedPublicPaths)];
  if (
    publicObjectPaths.length !== persistedPublicPaths.length
    || !publicObjectPaths.every(objectPath => isAllowedGeneratedPublicOutputPath(row.id, objectPath))
  ) return null;
  for (const descriptor of GENERATED_STEM_OUTPUT_FIELDS) {
    const privatePath = generatedOutputPath(row.id, storageToken, descriptor, true, row.user_id);
    if (row[descriptor.field] !== `storage://${PRIVATE_STEM_OUTPUT_BUCKET}/${privatePath}`) return null;
  }
  return { publicBucket: 'melodio-assets', publicObjectPaths };
}

function planOwnerlessLegacyUploadCleanup(row, metadata) {
  if (!row?.id || row.user_id || !isExternalStemUpload(metadata)) return null;
  if (!['completed', 'failed'].includes(String(row.status || '').toLowerCase())) return null;
  if (['pending', 'processing', 'cleanup'].includes(String(metadata.stemStatus || '').toLowerCase())) return null;
  const source = row.source_audio_url || row.audio_url;
  if (typeof source !== 'string' || source.startsWith('storage://')) return null;
  let sourceUrl;
  try {
    sourceUrl = new URL(source);
  } catch {
    return null;
  }
  const expectedPrefix = `/storage/v1/object/public/melodio-assets/uploads/${row.id}.`;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(sourceUrl.pathname);
  } catch {
    return null;
  }
  if (sourceUrl.origin !== new URL(SUPABASE_URL).origin || !decodedPath.startsWith(expectedPrefix)) return null;
  const extension = decodedPath.slice(expectedPrefix.length).toLowerCase();
  if (!PRIVATE_STEM_INPUT_EXTENSIONS.has(extension)) return null;
  return {
    publicBucket: 'melodio-assets',
    publicObjectPaths: [
      `uploads/${row.id}.${extension}`,
      ...STEMS.flatMap(stem => [
        `stems/${row.id}/original/${stem}.wav`,
        `stems/${row.id}/preview/${stem}.m4a`,
      ]),
    ],
  };
}

async function removeOwnerlessLegacyStemUploads() {
  let query = supabase
    .from('generations')
    .select('id,user_id,status,audio_url,source_audio_url,license_hash')
    .is('user_id', null)
    .in('status', ['completed', 'failed'])
    .like('source_audio_url', '%/storage/v1/object/public/melodio-assets/uploads/%')
    .order('id', { ascending: true })
    .limit(100);
  if (ownerlessLegacyCursor) query = query.gt('id', ownerlessLegacyCursor);
  const { data: rows, error } = await query;
  if (error) throw new Error(`ownerless legacy Stem 조회 실패: ${error.message}`);
  ownerlessLegacyCursor = rows?.length ? rows[rows.length - 1].id : null;

  for (const row of rows || []) {
    if (activeStemJobs.has(row.id)) continue;
    const metadata = parseGenerationMetadata(row.license_hash);
    const cleanupPlan = planOwnerlessLegacyUploadCleanup(row, metadata);
    if (!cleanupPlan) continue;
    try {
      const cleanupManifest = {
        privateSource: [],
        privateOutputs: [],
        publicAssets: cleanupPlan.publicObjectPaths,
      };
      const { data: scheduled, error: scheduleError } = await supabase.rpc(
        'delete_ownerless_legacy_stem_with_cleanup',
        {
          p_id: row.id,
          p_expected_status: row.status,
          p_expected_license_hash: row.license_hash,
          p_expected_source_url: row.source_audio_url,
          p_cleanup_manifest: cleanupManifest,
        },
      );
      if (scheduleError) throw new Error(`ownerless cleanup transaction 실패: ${scheduleError.message}`);
      if (!scheduled) {
        log('INFO', '소유자 없는 legacy row 상태 변경으로 자동 정리를 건너뜁니다.', { id: row.id });
        continue;
      }
      // The row deletion and exact-path task are already atomic, so immediate
      // removal is now safe. Any timeout/error leaves the outbox intact for an
      // idempotent retry instead of leaving an untracked public object.
      try {
        await removeLegacyPublicStemArtifacts(cleanupPlan, new AbortController().signal);
        const { error: outboxDeleteError } = await supabase
          .from('stem_storage_cleanup_tasks')
          .delete()
          .eq('generation_id', row.id);
        if (outboxDeleteError) {
          log('WARN', 'ownerless cleanup 완료 후 outbox 삭제 실패 — 멱등 재확인 유지', {
            id: row.id,
            error: outboxDeleteError.message,
          });
        }
        log('WARN', '소유자 없는 legacy 공개 Stem 업로드 정리 완료', { id: row.id });
      } catch (storageError) {
        log('ERROR', 'ownerless Storage 즉시 정리 실패 — outbox 재시도 유지', {
          id: row.id,
          error: sanitizeStemError(storageError),
        });
      }
    } catch (cleanupError) {
      log('ERROR', '소유자 없는 legacy 공개 Stem 업로드 cleanup 예약 실패', { id: row.id, error: sanitizeStemError(cleanupError) });
    }
  }
}

async function copyStorageObject({ sourceBucket, sourcePath, destinationBucket, destinationPath, contentType, signal }) {
  await withOperationTimeout('legacy private Storage 복사', STEM_UPLOAD_TIMEOUT_MS, signal, async (operationSignal) => {
    const { data: sourceInfo, error: sourceInfoError } = await supabase.storage
      .from(sourceBucket)
      .info(sourcePath);
    const sourceSize = Number(sourceInfo?.size || 0);
    if (sourceInfoError || !Number.isFinite(sourceSize) || sourceSize <= 0) {
      throw new Error(sourceInfoError?.message || `Storage 원본 크기 확인 실패: ${sourcePath}`);
    }

    const { data, error } = await supabase.storage
      .from(sourceBucket)
      .download(sourcePath, undefined, { signal: operationSignal })
      .asStream();
    if (error || !data) throw new Error(error?.message || `Storage 원본 없음: ${sourcePath}`);

    const endpoint = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(destinationBucket)}/${encodeStoragePath(destinationPath)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: data,
      duplex: 'half',
      signal: operationSignal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Storage 복사 HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    const { data: destinationInfo, error: destinationInfoError } = await supabase.storage
      .from(destinationBucket)
      .info(destinationPath);
    const destinationSize = Number(destinationInfo?.size || 0);
    if (destinationInfoError || destinationSize !== sourceSize) {
      throw new Error(
        destinationInfoError?.message
        || `Storage 복사 크기 불일치 (${sourceSize} -> ${destinationSize}): ${destinationPath}`,
      );
    }
  });
}

async function patchLegacyBackfillMetadata(id, leaseToken, patch, rowPatch = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current, error: fetchError } = await supabase
      .from('generations')
      .select('id,license_hash')
      .eq('id', id)
      .single();
    if (fetchError || !current) return false;
    const metadata = parseGenerationMetadata(current.license_hash);
    if (metadata.stemLegacyBackfillToken !== leaseToken) return false;

    const nextMetadata = { ...metadata, ...patch };
    let query = supabase
      .from('generations')
      .update({ ...rowPatch, license_hash: JSON.stringify(nextMetadata) })
      .eq('id', id);
    query = addLicenseHashCondition(query, current.license_hash);
    const { data: updated, error: updateError } = await query.select('id');
    if (updateError) throw new Error(`legacy backfill 메타데이터 업데이트 실패: ${updateError.message}`);
    if (updated?.length) return true;
  }
  return false;
}

async function patchGeneratedOutputBackfillMetadata(id, leaseToken, patch, rowPatch = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current, error: fetchError } = await supabase
      .from('generations')
      .select('id,license_hash')
      .eq('id', id)
      .single();
    if (fetchError || !current) return false;
    const metadata = parseGenerationMetadata(current.license_hash);
    if (metadata.stemLegacyOutputBackfillToken !== leaseToken) return false;

    const nextMetadata = { ...metadata, ...patch };
    let query = supabase
      .from('generations')
      .update({ ...rowPatch, license_hash: JSON.stringify(nextMetadata) })
      .eq('id', id);
    query = addLicenseHashCondition(query, current.license_hash);
    const { data: updated, error: updateError } = await query.select('id');
    if (updateError) throw new Error(`일반곡 legacy Stem output 메타데이터 업데이트 실패: ${updateError.message}`);
    if (updated?.length) return true;
  }
  return false;
}

function validGeneratedOutputBackfillAttempts(metadata) {
  if (!Array.isArray(metadata.stemLegacyOutputBackfillAttempts)) return [];
  return [...new Set(
    metadata.stemLegacyOutputBackfillAttempts
      .filter(value => typeof value === 'string' && UUID_OBJECT_SEGMENT_PATTERN.test(value)),
  )];
}

async function backfillCompletedGeneratedStemOutputs() {
  let query = supabase
    .from('generations')
    .select([
      'id',
      'user_id',
      'status',
      'is_stem_extracted',
      'license_hash',
      ...GENERATED_STEM_OUTPUT_FIELDS.map(descriptor => descriptor.field),
    ].join(','))
    .eq('status', 'completed')
    .eq('is_stem_extracted', true)
    .not('user_id', 'is', null)
    .like('stem_vocals_url', '%/storage/v1/object/public/melodio-assets/stems/%')
    .order('id', { ascending: true })
    .limit(20);
  if (completedGeneratedOutputBackfillCursor) {
    query = query.gt('id', completedGeneratedOutputBackfillCursor);
  }
  const { data: rows, error } = await query;
  if (error) throw new Error(`일반곡 legacy 공개 Stem output 조회 실패: ${error.message}`);
  completedGeneratedOutputBackfillCursor = rows?.length ? rows[rows.length - 1].id : null;

  for (const row of rows || []) {
    const metadata = parseGenerationMetadata(row.license_hash);
    if (isExternalStemUpload(metadata)) continue;

    const processingStartedAt = Date.parse(
      metadata.stemLegacyOutputBackfillHeartbeatAt || metadata.stemLegacyOutputBackfillStartedAt || '',
    );
    if (
      metadata.stemLegacyOutputBackfillStatus === 'processing'
      && Number.isFinite(processingStartedAt)
      && Date.now() - processingStartedAt < STEM_LEASE_TIMEOUT_MS
    ) continue;
    const nextRetryAt = Date.parse(metadata.stemLegacyOutputBackfillNextRetryAt || '');
    if (
      metadata.stemLegacyOutputBackfillStatus === 'failed'
      && Number.isFinite(nextRetryAt)
      && Date.now() < nextRetryAt
    ) continue;

    const attempt = Math.max(0, Number(metadata.stemLegacyOutputBackfillAttempt) || 0);
    if (attempt >= STEM_MAX_LEGACY_BACKFILL_ATTEMPTS) {
      log('ERROR', '일반곡 legacy Stem output backfill 최대 시도 초과 — 수동 점검 필요', {
        id: row.id,
        attempts: attempt,
      });
      continue;
    }

    const artifactAttemptAudit = normalizedArtifactAttemptsForBackfill(metadata);
    const artifactAttemptCount = artifactAttemptAudit.attempts.length;
    if (artifactAttemptAudit.invalid || artifactAttemptCount > STEM_MAX_LEASE_CLAIMS) {
      log('ERROR', '일반곡 legacy Stem output backfill 중단 — 기존 artifact 이력이 유효하지 않거나 manifest 한도를 초과함', {
        id: row.id,
        artifactAttemptCount,
      });
      continue;
    }
    // Deletion manifests allow 144 exact output paths: 8 legacy base paths,
    // up to 16 processing attempts, and these output-only backfill paths must
    // fit inside that same finite bound. At least one backfill path remains
    // available even when all 16 processing-attempt slots were used.
    const outputAttemptPathLimit = Math.min(
      STEM_MAX_LEGACY_BACKFILL_ATTEMPTS,
      Math.max(1, 17 - artifactAttemptCount),
    );
    const previousOutputAttempts = validGeneratedOutputBackfillAttempts(metadata);
    if (previousOutputAttempts.length > outputAttemptPathLimit) {
      log('ERROR', '일반곡 legacy Stem output backfill 중단 — output attempt manifest 한도 초과', {
        id: row.id,
        outputAttempts: previousOutputAttempts.length,
        outputAttemptPathLimit,
      });
      continue;
    }

    const leaseToken = randomUUID();
    const canAllocateOutputPath = previousOutputAttempts.length < outputAttemptPathLimit;
    const storageToken = canAllocateOutputPath
      ? randomUUID()
      : previousOutputAttempts[previousOutputAttempts.length - 1];
    if (!storageToken) continue;
    const plan = planCompletedGeneratedStemOutputBackfill(row, metadata, storageToken);
    if (!plan) continue;

    const claimedAt = new Date().toISOString();
    const nextOutputAttempts = canAllocateOutputPath
      ? [...previousOutputAttempts, storageToken]
      : previousOutputAttempts;
    const claimedMetadata = {
      ...metadata,
      stemLegacyOutputBackfillStatus: 'processing',
      stemLegacyOutputBackfillKind: 'outputs-only',
      stemLegacyOutputBackfillToken: leaseToken,
      stemLegacyOutputBackfillStorageToken: storageToken,
      stemLegacyOutputBackfillStartedAt: claimedAt,
      stemLegacyOutputBackfillHeartbeatAt: claimedAt,
      stemLegacyOutputBackfillStage: 'claimed',
      stemLegacyOutputBackfillError: null,
      stemLegacyOutputBackfillAttempt: attempt + 1,
      stemLegacyOutputBackfillAttempts: nextOutputAttempts,
      stemLegacyOutputPublicObjectPaths: plan.publicObjectPaths,
      stemLegacyOutputPublicArtifactsCleanup: null,
      stemLegacyOutputPublicArtifactsCleanupError: null,
    };
    const { data: claimed, error: claimError } = await supabase.rpc('claim_legacy_stem_backfill', {
      p_id: row.id,
      p_user_id: row.user_id,
      p_expected_status: row.status,
      p_expected_license_hash: row.license_hash,
      p_next_license_hash: JSON.stringify(claimedMetadata),
    });
    if (claimError) {
      log('ERROR', '일반곡 legacy Stem output backfill claim 실패', { id: row.id, error: claimError.message });
      continue;
    }
    if (!claimed) continue;

    let databaseSwitched = false;
    const controller = new AbortController();
    const renewLease = async (stage) => {
      const renewed = await patchGeneratedOutputBackfillMetadata(row.id, leaseToken, {
        stemLegacyOutputBackfillHeartbeatAt: new Date().toISOString(),
        stemLegacyOutputBackfillStage: stage,
      });
      if (!renewed) {
        const leaseError = new Error(`일반곡 legacy Stem output backfill lease 상실 (${stage})`);
        controller.abort(leaseError);
        throw leaseError;
      }
    };

    try {
      for (const output of plan.outputPairs) {
        await renewLease(`copying-${output.kind}-${output.stem}`);
        await copyStorageObject({
          sourceBucket: 'melodio-assets',
          sourcePath: output.publicPath,
          destinationBucket: PRIVATE_STEM_OUTPUT_BUCKET,
          destinationPath: output.privatePath,
          contentType: output.contentType,
          signal: controller.signal,
        });
        await renewLease(`copied-${output.kind}-${output.stem}`);
      }

      const rowPatch = {};
      for (const output of plan.outputPairs) {
        rowPatch[output.field] = `storage://${PRIVATE_STEM_OUTPUT_BUCKET}/${output.privatePath}`;
      }
      const migratedAt = new Date().toISOString();
      const switched = await patchGeneratedOutputBackfillMetadata(row.id, leaseToken, {
        stemLegacyOutputBackfillStatus: 'completed',
        stemLegacyOutputBackfillStage: 'completed',
        stemLegacyOutputBackfillHeartbeatAt: migratedAt,
        stemLegacyOutputBackfillCompletedAt: migratedAt,
        stemLegacyOutputBackfillError: null,
        stemLegacyOutputBackfillNextRetryAt: null,
        stemLegacyOutputPublicArtifactsCleanup: 'pending',
        stemLegacyOutputPublicArtifactsCleanupError: null,
      }, rowPatch);
      if (!switched) throw new Error('일반곡 legacy Stem output backfill CAS 충돌');
      databaseSwitched = true;

      await removeLegacyPublicStemArtifacts({
        publicBucket: 'melodio-assets',
        publicObjectPaths: plan.publicObjectPaths,
      }, new AbortController().signal);
      const normalizedArtifacts = normalizedArtifactMetadataAfterPublicCleanup(claimedMetadata);
      if (!normalizedArtifacts) throw new Error('일반곡 legacy 공개 artifact 이력 정상화 실패');
      await patchGeneratedOutputBackfillMetadata(row.id, leaseToken, {
        stemLegacyOutputPublicArtifactsCleanup: 'completed',
        stemLegacyOutputPublicArtifactsDeletedAt: new Date().toISOString(),
        stemLegacyOutputPublicArtifactsCleanupError: null,
        ...normalizedArtifacts,
      });
      log('INFO', '일반곡 legacy 공개 Stem output private backfill 완료', { id: row.id });
    } catch (backfillError) {
      const message = sanitizeStemError(backfillError);
      log('ERROR', '일반곡 legacy 공개 Stem output private backfill 실패', { id: row.id, error: message });
      try {
        if (databaseSwitched) {
          await patchGeneratedOutputBackfillMetadata(row.id, leaseToken, {
            stemLegacyOutputPublicArtifactsCleanup: 'failed',
            stemLegacyOutputPublicArtifactsCleanupError: message,
          });
        } else {
          await patchGeneratedOutputBackfillMetadata(row.id, leaseToken, {
            stemLegacyOutputBackfillStatus: 'failed',
            stemLegacyOutputBackfillFailedAt: new Date().toISOString(),
            stemLegacyOutputBackfillError: message,
            stemLegacyOutputBackfillNextRetryAt: new Date(Date.now() + STEM_LEASE_TIMEOUT_MS).toISOString(),
          });
        }
      } catch (metadataError) {
        log('ERROR', '일반곡 legacy Stem output backfill 실패 상태 기록 실패', {
          id: row.id,
          error: sanitizeStemError(metadataError),
        });
      }
    }
  }
}

async function backfillCompletedLegacyStemUploads() {
  let query = supabase
    .from('generations')
    .select('id,user_id,status,is_stem_extracted,is_public,audio_url,source_audio_url,license_hash')
    .eq('status', 'completed')
    .eq('is_stem_extracted', true)
    .like('source_audio_url', '%/storage/v1/object/public/melodio-assets/uploads/%')
    .order('id', { ascending: true })
    .limit(20);
  if (completedBackfillCursor) query = query.gt('id', completedBackfillCursor);
  const { data: rows, error } = await query;
  if (error) throw new Error(`완료 legacy Stem backfill 조회 실패: ${error.message}`);
  completedBackfillCursor = rows?.length ? rows[rows.length - 1].id : null;

  for (const row of rows || []) {
    const metadata = parseGenerationMetadata(row.license_hash);
    const backfillAttempt = Math.max(0, Number(metadata.stemLegacyBackfillAttempt) || 0);
    if (backfillAttempt >= STEM_MAX_LEGACY_BACKFILL_ATTEMPTS) {
      log('ERROR', 'legacy Stem private backfill 최대 시도 초과 — 수동 점검 필요', {
        id: row.id,
        attempts: backfillAttempt,
      });
      continue;
    }

    const artifactAttemptAudit = normalizedArtifactAttemptsForBackfill(metadata);
    if (artifactAttemptAudit.invalid || artifactAttemptAudit.attempts.length >= STEM_MAX_LEASE_CLAIMS) {
      log('ERROR', 'legacy Stem private backfill 중단 — artifact 이력이 유효하지 않거나 안전 한도에 도달함', {
        id: row.id,
        artifactAttempts: artifactAttemptAudit.attempts.length,
      });
      continue;
    }
    const rawBackfillAttempts = Array.isArray(metadata.stemLegacyBackfillAttempts)
      ? metadata.stemLegacyBackfillAttempts
      : [];
    if (rawBackfillAttempts.some(value => typeof value !== 'string' || !UUID_OBJECT_SEGMENT_PATTERN.test(value))) {
      log('ERROR', 'legacy Stem private backfill 중단 — source attempt 이력 검증 실패', { id: row.id });
      continue;
    }
    const previousBackfillAttempts = [...new Set(rawBackfillAttempts)];
    if (previousBackfillAttempts.length >= STEM_MAX_LEGACY_BACKFILL_ATTEMPTS) {
      log('ERROR', 'legacy Stem private backfill 중단 — source attempt manifest 안전 한도 도달', {
        id: row.id,
        sourceAttempts: previousBackfillAttempts.length,
      });
      continue;
    }

    const backfillToken = randomUUID();
    const plan = planCompletedLegacyStemBackfill(row, metadata, backfillToken);
    if (!plan) continue;
    const backfillStartedAt = Date.parse(
      metadata.stemLegacyBackfillHeartbeatAt || metadata.stemLegacyBackfillStartedAt || '',
    );
    if (
      metadata.stemLegacyBackfillStatus === 'processing'
      && Number.isFinite(backfillStartedAt)
      && Date.now() - backfillStartedAt < STEM_LEASE_TIMEOUT_MS
    ) {
      continue;
    }
    const nextRetryAt = Date.parse(metadata.stemLegacyBackfillNextRetryAt || '');
    if (metadata.stemLegacyBackfillStatus === 'failed' && Number.isFinite(nextRetryAt) && Date.now() < nextRetryAt) {
      continue;
    }

    const claimedAt = new Date().toISOString();
    const claimedMetadata = {
      ...metadata,
      stemLegacyBackfillStatus: 'processing',
      stemLegacyBackfillToken: backfillToken,
      stemLegacyBackfillStartedAt: claimedAt,
      stemLegacyBackfillHeartbeatAt: claimedAt,
      stemLegacyBackfillError: null,
      stemLegacyBackfillAttempt: backfillAttempt + 1,
      stemLegacyBackfillAttempts: [...previousBackfillAttempts, backfillToken],
      stemLegacyBackfillSourceExtension: plan.extension,
      stemArtifactAttempts: [
        ...artifactAttemptAudit.attempts,
        { token: backfillToken, storage: 'private' },
      ],
      stemArtifactStorage: 'private',
    };
    const claimedLicenseHash = JSON.stringify(claimedMetadata);
    const { data: claimed, error: claimError } = await supabase.rpc('claim_legacy_stem_backfill', {
      p_id: row.id,
      p_user_id: row.user_id,
      p_expected_status: row.status,
      p_expected_license_hash: row.license_hash,
      p_next_license_hash: claimedLicenseHash,
    });
    if (claimError) {
      log('ERROR', '완료 legacy Stem backfill claim 실패', { id: row.id, error: claimError.message });
      continue;
    }
    if (!claimed) continue;

    let databaseSwitched = false;
    const backfillController = new AbortController();
    const renewBackfillLease = async (stage) => {
      const heartbeatAt = new Date().toISOString();
      const renewed = await patchLegacyBackfillMetadata(row.id, backfillToken, {
        stemLegacyBackfillHeartbeatAt: heartbeatAt,
        stemLegacyBackfillStage: stage,
      });
      if (!renewed) {
        const leaseError = new Error(`legacy backfill lease 상실 (${stage})`);
        backfillController.abort(leaseError);
        throw leaseError;
      }
    };
    try {
      await renewBackfillLease('copying-source');
      await copyStorageObject({
        sourceBucket: 'melodio-assets',
        sourcePath: plan.sourcePublicPath,
        destinationBucket: PRIVATE_STEM_BUCKET,
        destinationPath: plan.sourcePrivatePath,
        contentType: stemInputContentType(plan.extension),
        signal: backfillController.signal,
      });
      await renewBackfillLease('copying-outputs');
      for (const output of plan.outputPairs) {
        await renewBackfillLease(`copying-${output.kind}-${output.stem}`);
        await copyStorageObject({
          sourceBucket: 'melodio-assets',
          sourcePath: output.publicPath,
          destinationBucket: PRIVATE_STEM_OUTPUT_BUCKET,
          destinationPath: output.privatePath,
          contentType: output.contentType,
          signal: backfillController.signal,
        });
        await renewBackfillLease(`copied-${output.kind}-${output.stem}`);
      }

      const original = {};
      const preview = {};
      for (const output of plan.outputPairs) {
        const uri = `storage://${PRIVATE_STEM_OUTPUT_BUCKET}/${output.privatePath}`;
        if (output.kind === 'original') original[output.stem] = uri;
        else preview[output.stem] = uri;
      }
      const migratedAt = new Date().toISOString();
      const completionPatch = {
        isPublic: false,
        stemStatus: 'completed',
        stemStage: 'completed',
        stemProgress: 100,
        stemSourceMigratedAt: migratedAt,
        storageBucket: PRIVATE_STEM_BUCKET,
        storagePath: plan.sourcePrivatePath,
        stemLegacyPublicArtifactsCleanup: 'pending',
        stemLegacyPublicArtifactsCleanupError: null,
        stemLegacyBackfillStatus: 'completed',
        stemLegacyBackfillStage: 'completed',
        stemLegacyBackfillHeartbeatAt: migratedAt,
        stemLegacyBackfillCompletedAt: migratedAt,
        stemLegacyBackfillError: null,
        stemLegacyBackfillNextRetryAt: null,
      };
      const switched = await patchLegacyBackfillMetadata(row.id, backfillToken, completionPatch, {
          is_public: false,
          audio_url: null,
          source_audio_url: `storage://${PRIVATE_STEM_BUCKET}/${plan.sourcePrivatePath}`,
          stem_vocals_url: original.vocals,
          stem_bass_url: original.bass,
          stem_drums_url: original.drums,
          stem_other_url: original.other,
          preview_vocals_url: preview.vocals,
          preview_bass_url: preview.bass,
          preview_drums_url: preview.drums,
          preview_other_url: preview.other,
        });
      if (!switched) throw new Error('legacy backfill CAS 충돌');
      databaseSwitched = true;

      await removeLegacyPublicStemArtifacts({
        publicBucket: 'melodio-assets',
        publicObjectPaths: plan.publicObjectPaths,
      }, new AbortController().signal);
      await patchStemMetadata(row.id, {
        stemLegacyPublicArtifactsCleanup: 'completed',
        stemLegacyPublicArtifactsDeletedAt: new Date().toISOString(),
        stemLegacyPublicArtifactsCleanupError: null,
      }, {}, 'completed');
      log('INFO', '완료 legacy Stem private backfill 완료', { id: row.id });
    } catch (backfillError) {
      const message = sanitizeStemError(backfillError);
      log('ERROR', '완료 legacy Stem private backfill 실패', { id: row.id, error: message });
      try {
        if (databaseSwitched) {
          await patchStemMetadata(row.id, {
            stemLegacyPublicArtifactsCleanup: 'failed',
            stemLegacyPublicArtifactsCleanupError: message,
          }, {}, 'completed');
        } else {
          await patchLegacyBackfillMetadata(row.id, backfillToken, {
            stemLegacyBackfillStatus: 'failed',
            stemLegacyBackfillFailedAt: new Date().toISOString(),
            stemLegacyBackfillError: message,
            stemLegacyBackfillNextRetryAt: new Date(Date.now() + STEM_LEASE_TIMEOUT_MS).toISOString(),
          });
        }
      } catch (metadataError) {
        log('ERROR', 'legacy backfill 실패 상태 기록 실패', {
          id: row.id,
          error: sanitizeStemError(metadataError),
        });
      }
    }
  }
}

async function retryLegacyPublicArtifactCleanup() {
  let pendingQuery = supabase
    .from('generations')
    .select('id,user_id,source_audio_url,license_hash')
    .like('license_hash', '%"stemLegacyPublicArtifactsCleanup":"pending"%')
    .order('id', { ascending: true })
    .limit(100);
  let failedQuery = supabase
    .from('generations')
    .select('id,user_id,source_audio_url,license_hash')
    .like('license_hash', '%"stemLegacyPublicArtifactsCleanup":"failed"%')
    .order('id', { ascending: true })
    .limit(100);
  if (pendingPublicCleanupCursor) pendingQuery = pendingQuery.gt('id', pendingPublicCleanupCursor);
  if (failedPublicCleanupCursor) failedQuery = failedQuery.gt('id', failedPublicCleanupCursor);
  const [pendingResult, failedResult] = await Promise.all([
    pendingQuery,
    failedQuery,
  ]);
  if (pendingResult.error) throw new Error(`legacy cleanup pending 조회 실패: ${pendingResult.error.message}`);
  if (failedResult.error) throw new Error(`legacy cleanup failed 조회 실패: ${failedResult.error.message}`);
  pendingPublicCleanupCursor = pendingResult.data?.length
    ? pendingResult.data[pendingResult.data.length - 1].id
    : null;
  failedPublicCleanupCursor = failedResult.data?.length
    ? failedResult.data[failedResult.data.length - 1].id
    : null;

  const rows = Array.from(new Map(
    [...(pendingResult.data || []), ...(failedResult.data || [])].map(row => [row.id, row]),
  ).values());
  for (const row of rows) {
    const metadata = parseGenerationMetadata(row.license_hash);
    const cleanupPlan = rebuildLegacyPublicCleanupPlan(row, metadata);
    if (!cleanupPlan) continue;
    try {
      await removeLegacyPublicStemArtifacts(cleanupPlan, new AbortController().signal);
      const updated = await patchStemMetadata(row.id, {
        stemLegacyPublicArtifactsCleanup: 'completed',
        stemLegacyPublicArtifactsDeletedAt: new Date().toISOString(),
        stemLegacyPublicArtifactsCleanupError: null,
      }, {}, 'completed');
      if (updated) log('INFO', 'legacy public artifacts cleanup 재시도 완료', { id: row.id });
    } catch (cleanupError) {
      const cleanupMessage = sanitizeStemError(cleanupError);
      log('ERROR', 'legacy public artifacts cleanup 재시도 실패', { id: row.id, error: cleanupMessage });
      try {
        await patchStemMetadata(row.id, {
          stemLegacyPublicArtifactsCleanup: 'failed',
          stemLegacyPublicArtifactsCleanupError: cleanupMessage,
        }, {}, 'completed');
      } catch (metadataError) {
        log('ERROR', 'legacy cleanup 재시도 오류 기록 실패', { id: row.id, error: sanitizeStemError(metadataError) });
      }
    }
  }
}

async function retryGeneratedStemOutputPublicCleanup() {
  const selectFields = [
    'id',
    'user_id',
    'license_hash',
    ...GENERATED_STEM_OUTPUT_FIELDS.map(descriptor => descriptor.field),
  ].join(',');
  let pendingQuery = supabase
    .from('generations')
    .select(selectFields)
    .like('license_hash', '%"stemLegacyOutputPublicArtifactsCleanup":"pending"%')
    .order('id', { ascending: true })
    .limit(100);
  let failedQuery = supabase
    .from('generations')
    .select(selectFields)
    .like('license_hash', '%"stemLegacyOutputPublicArtifactsCleanup":"failed"%')
    .order('id', { ascending: true })
    .limit(100);
  if (pendingGeneratedOutputCleanupCursor) {
    pendingQuery = pendingQuery.gt('id', pendingGeneratedOutputCleanupCursor);
  }
  if (failedGeneratedOutputCleanupCursor) {
    failedQuery = failedQuery.gt('id', failedGeneratedOutputCleanupCursor);
  }
  const [pendingResult, failedResult] = await Promise.all([pendingQuery, failedQuery]);
  if (pendingResult.error) {
    throw new Error(`일반곡 legacy Stem output cleanup pending 조회 실패: ${pendingResult.error.message}`);
  }
  if (failedResult.error) {
    throw new Error(`일반곡 legacy Stem output cleanup failed 조회 실패: ${failedResult.error.message}`);
  }
  pendingGeneratedOutputCleanupCursor = pendingResult.data?.length
    ? pendingResult.data[pendingResult.data.length - 1].id
    : null;
  failedGeneratedOutputCleanupCursor = failedResult.data?.length
    ? failedResult.data[failedResult.data.length - 1].id
    : null;

  const rows = Array.from(new Map(
    [...(pendingResult.data || []), ...(failedResult.data || [])].map(row => [row.id, row]),
  ).values());
  for (const row of rows) {
    const metadata = parseGenerationMetadata(row.license_hash);
    const cleanupPlan = rebuildGeneratedStemOutputCleanupPlan(row, metadata);
    if (!cleanupPlan) continue;
    const leaseToken = String(metadata.stemLegacyOutputBackfillToken || '');
    if (!UUID_OBJECT_SEGMENT_PATTERN.test(leaseToken)) continue;
    const normalizedArtifacts = normalizedArtifactMetadataAfterPublicCleanup(metadata);
    if (!normalizedArtifacts) {
      log('ERROR', '일반곡 legacy 공개 Stem output cleanup 중단 — artifact 이력 검증 실패', { id: row.id });
      continue;
    }
    try {
      await removeLegacyPublicStemArtifacts(cleanupPlan, new AbortController().signal);
      const updated = await patchGeneratedOutputBackfillMetadata(row.id, leaseToken, {
        stemLegacyOutputPublicArtifactsCleanup: 'completed',
        stemLegacyOutputPublicArtifactsDeletedAt: new Date().toISOString(),
        stemLegacyOutputPublicArtifactsCleanupError: null,
        ...normalizedArtifacts,
      });
      if (updated) log('INFO', '일반곡 legacy 공개 Stem output cleanup 재시도 완료', { id: row.id });
    } catch (cleanupError) {
      const message = sanitizeStemError(cleanupError);
      log('ERROR', '일반곡 legacy 공개 Stem output cleanup 재시도 실패', { id: row.id, error: message });
      try {
        await patchGeneratedOutputBackfillMetadata(row.id, leaseToken, {
          stemLegacyOutputPublicArtifactsCleanup: 'failed',
          stemLegacyOutputPublicArtifactsCleanupError: message,
        });
      } catch (metadataError) {
        log('ERROR', '일반곡 legacy 공개 Stem output cleanup 오류 기록 실패', {
          id: row.id,
          error: sanitizeStemError(metadataError),
        });
      }
    }
  }
}

async function runStemMaintenance() {
  if (stemMaintenanceInProgress || Date.now() - lastStemMaintenanceAt < STEM_MAINTENANCE_INTERVAL_MS) return;
  stemMaintenanceInProgress = true;
  lastStemMaintenanceAt = Date.now();
  try {
    await processStemStorageCleanupOutbox();
    await enforceLegacyStemUploadPrivacy();
    await cleanupExpiredStemUploadSessions();
    await removeOwnerlessLegacyStemUploads();
    await backfillCompletedLegacyStemUploads();
    await backfillCompletedGeneratedStemOutputs();
    await retryLegacyPublicArtifactCleanup();
    await retryGeneratedStemOutputPublicCleanup();
  } catch (error) {
    log('ERROR', 'Stem 유지보수 작업 실패', sanitizeStemError(error));
  } finally {
    stemMaintenanceInProgress = false;
  }
}

async function recoverStaleStemJobs() {
  const [legacyResult, metadataResult, cleanupResult] = await Promise.all([
    supabase
      .from('generations')
      .select('*')
      .eq('status', 'processing')
      .not('audio_url', 'is', null)
      .is('stem_vocals_url', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('generations')
      .select('*')
      .like('license_hash', '%"stemStatus":"processing"%')
      .order('created_at', { ascending: true }),
    supabase
      .from('generations')
      .select('*')
      .like('license_hash', '%"stemStatus":"cleanup"%')
      .order('created_at', { ascending: true }),
  ]);
  if (legacyResult.error) throw new Error(`legacy processing 복구 조회 실패: ${legacyResult.error.message}`);
  if (metadataResult.error) throw new Error(`stemStatus processing 복구 조회 실패: ${metadataResult.error.message}`);
  if (cleanupResult.error) throw new Error(`stemStatus cleanup 복구 조회 실패: ${cleanupResult.error.message}`);
  const rows = Array.from(new Map(
    [...(legacyResult.data || []), ...(metadataResult.data || []), ...(cleanupResult.data || [])]
      .map(row => [row.id, row]),
  ).values());

  const now = Date.now();
  for (const row of rows) {
    const metadata = parseGenerationMetadata(row.license_hash);
    const recoverable = isProcessingStemRow(row) || metadata.stemStatus === 'cleanup';
    if (activeStemJobs.has(row.id) || !recoverable || !hasStemSource(row)) continue;
    const heartbeatAt = Date.parse(metadata.stemHeartbeatAt || metadata.stemStartedAt || row.created_at || '');
    if (Number.isFinite(heartbeatAt) && now - heartbeatAt < STEM_LEASE_TIMEOUT_MS) continue;

    const recoveredAt = new Date().toISOString();
    const processingAttempt = Math.max(0, Number(metadata.stemAttempt) || 0);
    const refundInfrastructureAttempt = metadata.stemStatus === 'processing'
      || (metadata.stemStatus === 'cleanup' && metadata.stemCleanupReason === 'worker-shutdown');
    const nextMetadata = {
      ...metadata,
      stemStatus: 'pending',
      stemStage: 'queued',
      stemProgress: 0,
      stemHeartbeatAt: recoveredAt,
      stemAttempt: refundInfrastructureAttempt ? Math.max(0, processingAttempt - 1) : processingAttempt,
      ...(refundInfrastructureAttempt ? {
        stemInfrastructureRequeueCount: Math.max(0, Number(metadata.stemInfrastructureRequeueCount) || 0) + 1,
      } : {}),
      stemCleanupReason: null,
      stemError: null,
      stemRecoveredAt: recoveredAt,
      stemRequeueReason: metadata.stemStatus === 'cleanup'
        ? 'stale-failure-cleanup-lease'
        : 'stale-processing-lease',
    };
    const nextStatus = isExternalStemUpload(metadata) ? 'pending' : 'completed';
    let query = supabase
      .from('generations')
      .update({ status: nextStatus, license_hash: JSON.stringify(nextMetadata) })
      .eq('id', row.id)
      .eq('status', row.status);
    query = addLicenseHashCondition(query, row.license_hash);
    const { data: recovered, error: recoverError } = await query.select('*');
    if (recoverError) {
      log('ERROR', 'stale processing 복구 실패', { id: row.id, error: recoverError.message });
    } else if (recovered?.length) {
      log('WARN', 'stale processing lease를 pending으로 복구', { id: row.id });
      await scheduleStemJob(recovered[0], 'stale-recovery');
    }
  }
}

async function fetchQueuedStemRows() {
  const columns = '*';
  const [legacyResult, metadataResult] = await Promise.all([
    supabase
      .from('generations')
      .select(columns)
      .eq('status', 'pending')
      .is('stem_vocals_url', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('generations')
      .select(columns)
      .like('license_hash', '%"stemStatus":"pending"%')
      .order('created_at', { ascending: true }),
  ]);
  if (legacyResult.error) throw new Error(`legacy pending 조회 실패: ${legacyResult.error.message}`);
  if (metadataResult.error) throw new Error(`stemStatus pending 조회 실패: ${metadataResult.error.message}`);
  return Array.from(new Map(
    [...(legacyResult.data || []), ...(metadataResult.data || [])]
      .filter(shouldClaimStemRow)
      .map(row => [row.id, row]),
  ).values());
}

// ─── 시작 시 기존 PENDING 및 stale PROCESSING 작업 자동 스캔 ─────────────────
async function processExistingPending() {
  if (isShuttingDown || pendingScanInProgress) return;
  pendingScanInProgress = true;
  log("INFO", "기존 PENDING 작업 스캔 시작...");
  try {
    await runStemMaintenance();
    await recoverStaleStemJobs();
    const data = await fetchQueuedStemRows();
    if (data.length === 0) {
      log("INFO", "처리 대기 중인 PENDING 작업 없음");
      return;
    }

    log("INFO", `PENDING 작업 ${data.length}건 발견 — 순차 처리 시작`);
    for (const row of data) {
      log("INFO", `PENDING 작업 처리 시작`, { id: row.id, title: (row.title || "").slice(0, 30) });
      try {
        await scheduleStemJob(row, 'periodic-scan');
      } catch (err) {
        log("ERROR", `PENDING 작업 처리 실패`, { id: row.id, error: err.message });
      }
    }
    log("INFO", "기존 PENDING 작업 스캔 완료");
  } catch (err) {
    log("ERROR", "PENDING 스캔 예외", err.message);
  } finally {
    pendingScanInProgress = false;
  }
}

// 시작 후 5초 대기 후 PENDING 스캔, 이후 30초마다 반복 (Realtime 누락 방지)
pendingScanTimeout = setTimeout(processExistingPending, 5000);
pendingScanInterval = setInterval(processExistingPending, 30000);

// ─── Suno 버전 모델 매핑 헬퍼 ────────────────────────────────────────────────
function mapSunoVersionToModel(version) {
  if (!version) return 'chirp-fenix';
  const n = version.toLowerCase();
  switch (n) {
    case 'v5.5':
      return 'chirp-fenix';
    case 'v5':
      return 'chirp-crow';
    case 'v4.5+':
      return 'chirp-bluejay';
    case 'v4.5':
      return 'chirp-auk';
    default:
      return 'chirp-fenix';
  }
}

// ─── 자동 재발행을 위한 Suno Submit API 호출 ───────────────────────────────────
async function submitSunoJobForRetry(metadata, title) {
  const apiKey = process.env.SUNO_API_KEY;
  const apiBaseUrl = process.env.SUNO_API_URL || 'https://api.302.ai';

  let effectiveStylePrompt = metadata.excludePrompt?.trim()
    ? `${metadata.stylePrompt}, avoid: ${metadata.excludePrompt.trim()}`
    : metadata.stylePrompt;

  if (metadata.sourceMenu === 'mugsound-supply' &&
      !effectiveStylePrompt.toLowerCase().includes('fade out') &&
      !effectiveStylePrompt.toLowerCase().includes('clean ending')) {
    effectiveStylePrompt = `${effectiveStylePrompt}, target duration 3:15, fade out at 3:20, clean ending`;
  }
  effectiveStylePrompt = String(effectiveStylePrompt || '').slice(0, 1000);

  const isMugSoundInstrumental = metadata.sourceMenu === 'mugsound-supply' && metadata.isInstrumental === true;
  const finalPrompt = isMugSoundInstrumental
    ? MUGSOUND_INSTRUMENTAL_STRUCTURE_PROMPT
    : (metadata.lyricsPrompt ?? '');
  const model = mapSunoVersionToModel(metadata.sunoVersion);

  log("INFO", `[RETRY SUBMIT] Suno 재발행 요청 전송 중... (model: ${model})`);

  const submitRes = await fetch(`${apiBaseUrl}/suno/submit/music`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: finalPrompt,
      tags: effectiveStylePrompt ?? '',
      title: title ?? 'Untitled',
      mv: model,
      // 기존 Melodio 3분 연주곡 방식과 동일하게 구조 태그를 prompt로 전달한다.
      // make_instrumental=true는 prompt 구조를 무시해 짧은 스케치가 반복됐다.
      make_instrumental: isMugSoundInstrumental ? false : (metadata.isInstrumental ?? false),
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`Suno Retry API 제출 실패: ${submitRes.status} | ${errText}`);
  }

  const submitData = await submitRes.json();
  if (submitData.code !== 200 && submitData.code !== 'success' && submitData.message !== 'success') {
    throw new Error(`Suno Retry API 에러: ${submitData.message || JSON.stringify(submitData)}`);
  }

  const taskId = typeof submitData.data === 'string'
    ? submitData.data
    : (submitData.data?.task_id || submitData.data?.id);

  if (!taskId) {
    throw new Error('Suno Retry API 작업 ID 수급 실패');
  }

  log("INFO", `[RETRY SUBMIT] 재발행 성공. 새 Task ID: ${taskId}`);
  return taskId;
}

// ─── Suno 작업 폴링 (generating 상태 곡 자동 완료 처리) ────────────────────────
const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_API_URL = process.env.SUNO_API_URL || "https://api.302.ai";

let isPollingSuno = false;

async function linkGenerationQueueCandidate(meta, generationId, slot, clip, quality, recommended) {
  const queueItemId = meta?.queueItemId;
  if (!queueItemId || !generationId || !clip?.audio_url) return;

  const duration = Number.parseFloat(clip.duration);
  const { error } = await supabase.from('generation_queue_candidates').upsert({
    queue_item_id: queueItemId,
    generation_id: generationId,
    candidate_slot: slot,
    audio_url: clip.audio_url,
    duration_seconds: Number.isFinite(duration) ? duration : null,
    audio_grade: quality?.grade || null,
    clipping_count: quality?.clippingCount ?? null,
    dissonance_score: quality?.dissonanceScore ?? null,
    is_recommended: recommended,
  }, { onConflict: 'queue_item_id,candidate_slot' });

  if (error) {
    log('ERROR', `[GENERATION QUEUE] 후보 ${slot} 연결 실패`, { error: error.message });
    return;
  }
  await supabase.from('generation_queue_items').update({
    status: 'awaiting_selection',
    error_message: null,
  }).eq('id', queueItemId).in('status', ['submitting', 'generating', 'submission_failed']);
}

async function pollSunoGenerations() {
  if (!SUNO_API_KEY) {
    return;
  }
  if (isPollingSuno) {
    log("INFO", "[SUNO POLL] 이전 폴링 작업이 아직 진행 중입니다. 스킵합니다.");
    return;
  }
  isPollingSuno = true;

  try {
    const { data, error } = await supabase
      .from("generations")
      .select("*")
      .eq("status", "generating")
      .like("source_audio_url", "suno:%");

    if (error || !data || data.length === 0) return;

    log("INFO", `[SUNO POLL] generating 상태 곡 ${data.length}건 발견`);

    for (const row of data) {
      const taskId = row.source_audio_url.replace("suno:", "");
      log("INFO", `[SUNO POLL] 폴링 시작`, { id: row.id.slice(0, 8), taskId: taskId.slice(0, 8) });

      try {
        const fetchRes = await fetch(`${SUNO_API_URL}/suno/fetch/${taskId}`, {
          headers: { "Authorization": `Bearer ${SUNO_API_KEY}` },
        });

        if (!fetchRes.ok) {
          log("WARN", `[SUNO POLL] fetch 실패: ${fetchRes.status}`);
          continue;
        }

        const fetchData = await fetchRes.json();
        let clips = null;

        if (fetchData.data) {
          if (Array.isArray(fetchData.data)) {
            clips = fetchData.data;
          } else if (fetchData.data.data && Array.isArray(fetchData.data.data)) {
            clips = fetchData.data.data;
          }
        }

        if (!clips || !Array.isArray(clips)) continue;

        const anyFailed = clips.some(c => 
          c.status === "failed" || c.status === "FAILED" || c.status === "error" ||
          c.state === "failed" || c.state === "FAILED" || c.state === "error" ||
          ((c.status === "complete" || c.status === "SUCCESS") && !c.audio_url)
        );
        if (anyFailed) {
          log("ERROR", `[SUNO POLL] 생성 실패 (에러 또는 URL 누락)`, { id: row.id.slice(0, 8) });
          await supabase.from("generations").update({ status: "failed" }).eq("id", row.id);
          try {
            const failedMeta = row.license_hash ? JSON.parse(row.license_hash) : {};
            if (failedMeta.queueItemId) {
              await supabase.from('generation_queue_items').update({
                status: 'generation_failed',
                error_message: 'Suno A/B 생성에 실패했습니다.',
              }).eq('id', failedMeta.queueItemId).eq('status', 'generating');
            }
          } catch (metaError) {
            log('WARN', '[GENERATION QUEUE] 실패 상태 연결 오류', metaError.message);
          }
          continue;
        }

        const allComplete = clips.every(c => c.status === "complete" || c.status === "SUCCESS");
        if (allComplete && clips.length > 0) {
          log("INFO", `[SUNO POLL] 2곡 생성 완료 감지 -> 물리 음질 정밀 검수 시작`, { id: row.id.slice(0, 8) });

          // 1단계: 각 완성 음원 물리 스캔 수행
          const scannedClips = [];
          for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            if (!clip.audio_url) continue;

            log("PROC", `  [검수] 곡 ${i + 1} 스캔 중...`, { clipId: clip.id });
            try {
              const quality = await analyzeAudio(clip.audio_url);
              log("INFO", `  [검수 결과] 곡 ${i + 1}`, {
                grade: quality.grade,
                clippingPerMin: quality.clippingPerMinute,
                dissonance: quality.dissonanceScore
              });
              scannedClips.push({ clip, quality });
            } catch (scanErr) {
              log("WARN", `  [검수 오류] 오디오 분석 건너뜀 (기본 A등급 부여)`, scanErr.message);
              scannedClips.push({
                clip,
                quality: { clippingCount: 0, clippingPerMinute: 0, dissonanceScore: 0, grade: 'A' }
              });
            }
          }

          if (scannedClips.length === 0) {
            log("WARN", "[SUNO POLL] 유효한 오디오 링크를 확보하지 못했습니다.");
            continue;
          }

          // 2단계: 메타데이터 파싱 및 리트라이 정보 점검
          let metaObj = {};
          let currentRetryCount = 0;
          try {
            if (row.license_hash) {
              metaObj = JSON.parse(row.license_hash);
              currentRetryCount = metaObj.retry_count || 0;
            }
          } catch (pErr) {
            log("WARN", "license_hash 파싱 실패", pErr.message);
          }

          // 3단계: 재발행 판단 — (a) 두 곡 모두 F등급 (b) 숏폼인데 두 곡 모두 길이 초과
          const allFailedQuality = scannedClips.every(sc => sc.quality.grade === 'F');

          /*
           * 숏폼 길이 재발행.
           *
           * 트림은 안전망이 아니다. 실측 45.8초를 29.4초로 자르면 16초가 날아가는데
           * 그 구간에 보컬이 들어 있어 가사 마지막 2~3줄이 통째로 유실됐다.
           * (초기 가정은 "잘리는 건 대부분 후주" 였으나 사용자 확인 결과 보컬이었다.)
           *
           * Suno는 같은 가사로 만든 두 클립의 길이가 15초 이상 벌어지는 일이 잦으므로,
           * 둘 다 규격 밖이면 한 번 더 뽑는 편이 잘린 곡을 내보내는 것보다 낫다.
           */
          const isShortFormEarly = isShortFormTrack(metaObj);
          const clipSecEarly = (c) => {
            const d = parseFloat(c.duration);
            return Number.isFinite(d) && d > 0 ? d : null;
          };
          /*
           * ⚠️ 여기 기준은 "목표"가 아니라 "합격선"이다.
           *
           * 예전에는 목표 구간(25~29.5초)을 그대로 재발행 기준으로 썼다. 그래서
           * 22초짜리 완성곡이 "규격 밖"으로 판정돼 버려지고 Suno 를 다시 불렀다.
           * 22초는 훅 2회가 다 들어가는 멀쩡한 곡이고, 짧아서 생기는 과금 손해도 없다.
           * 목표에 못 미치는 것과 못 쓰는 것은 다르다.
           *
           * 이제는 정말 못 쓰는 경우에만 다시 뽑는다:
           *   - 20초 미만  : 훅이 한 바퀴 돌기도 전에 끝난다
           *   - 38초 초과  : 영상 2클립(30초) + 정지 프레임(8초)으로도 못 덮어
           *                  3번째 클립이 과금된다
           */
          const noClipUsable =
            isShortFormEarly &&
            scannedClips.every((sc) => {
              const d = clipSecEarly(sc.clip);
              return d === null || d < SHORTFORM_ACCEPT_MIN_SEC || d > SHORTFORM_ACCEPT_MAX_SEC;
            });

          // 길이 재발행은 음질 재발행과 별도 카운터를 쓴다.
          // 같은 retry_count 를 쓰면 길이 재발행이 한도를 소진해 음질 재발행이 막힌다.
          const durationRetryCount = metaObj.duration_retry_count || 0;

          const isMugSoundSupply = metaObj.sourceMenu === 'mugsound-supply';
          const mugsoundDurations = scannedClips.map((sc) => clipSecEarly(sc.clip));
          const hasTwoMugSoundCandidates = scannedClips.length === 2 && mugsoundDurations.every((duration) =>
            duration !== null && duration >= MUGSOUND_MIN_DURATION_SEC && duration <= MUGSOUND_MAX_DURATION_SEC
          );

          if (isMugSoundSupply && !hasTwoMugSoundCandidates) {
            const lens = mugsoundDurations.map((duration) => `${duration ?? '?'}s`).join(', ');
            appendMugSoundAttempt(metaObj, taskId, mugsoundDurations, 'duration_out_of_spec');
            if (durationRetryCount < MUGSOUND_MAX_DURATION_RETRIES) {
              log('WARN', `[MugSound 길이 미달] A/B ${lens} — 합격 ${MUGSOUND_MIN_DURATION_SEC}~${MUGSOUND_MAX_DURATION_SEC}초, 재발행 (${durationRetryCount + 1}/${MUGSOUND_MAX_DURATION_RETRIES})`);
              try {
                const newTaskId = await submitSunoJobForRetry(metaObj, row.title);
                metaObj.duration_retry_count = durationRetryCount + 1;
                metaObj.retry_reason = `mugsound_duration_out_of_spec (${lens})`;
                await supabase.from('generations').update({
                  source_audio_url: `suno:${newTaskId}`,
                  status: 'generating',
                  license_hash: JSON.stringify(metaObj)
                }).eq('id', row.id);
                continue;
              } catch (retryErr) {
                log('ERROR', '[MugSound 길이 재발행 실패]', retryErr.message);
              }
            }

            metaObj.durationOutcome = `failed_out_of_spec (${lens})`;
            await supabase.from('generations').update({
              status: 'failed',
              error_message: `MugSound A/B 길이 기준 미통과: ${lens} (허용 ${MUGSOUND_MIN_DURATION_SEC}~${MUGSOUND_MAX_DURATION_SEC}초)`,
              license_hash: JSON.stringify(metaObj)
            }).eq('id', row.id);
            log('ERROR', `[MugSound 길이 최종 실패] ${lens} — 완료 처리하지 않음`);
            continue;
          }

          if (isMugSoundSupply) {
            appendMugSoundAttempt(metaObj, taskId, mugsoundDurations, 'duration_qualified');
            metaObj.durationQualification = {
              status: 'qualified',
              minimumSeconds: MUGSOUND_MIN_DURATION_SEC,
              maximumSeconds: MUGSOUND_MAX_DURATION_SEC,
              qualifiedAt: new Date().toISOString(),
            };
          }
          if (noClipUsable && durationRetryCount < SHORTFORM_MAX_DURATION_RETRIES) {
            const lens = scannedClips.map((sc) => `${clipSecEarly(sc.clip) ?? '?'}s`).join(', ');
            log("WARN", `🚨 [숏폼 길이 불가] 두 곡 모두 사용 불가 (${lens}) — 합격 ${SHORTFORM_ACCEPT_MIN_SEC}~${SHORTFORM_ACCEPT_MAX_SEC}초 밖이라 재발행 (${durationRetryCount + 1}/${SHORTFORM_MAX_DURATION_RETRIES})`);
            try {
              const newTaskId = await submitSunoJobForRetry(metaObj, row.title);
              metaObj.duration_retry_count = durationRetryCount + 1;
              metaObj.retry_reason = `duration_out_of_spec (${lens})`;
              await supabase.from("generations").update({
                source_audio_url: `suno:${newTaskId}`,
                status: "generating",
                license_hash: JSON.stringify(metaObj)
              }).eq("id", row.id);
              log("INFO", `[RETRY] 길이 재발행 제출 완료 — 다음 폴링에서 새 태스크를 확인한다.`);
              continue;
            } catch (retryErr) {
              log("ERROR", `[RETRY 실패] 길이 재발행 중 오류 — 기존 결과로 진행`, retryErr.message);
            }
          }

          if (allFailedQuality && currentRetryCount < 1) {
            // 🚨 리트라이 기동 조건 충족 (2곡 모두 불량 & 1회 시도 미만)
            log("WARN", `🚨 [음질 불량 검출] 2곡 모두 F등급 판정 — 백그라운드 자동 재발행(Retry 1회)을 실행합니다.`);

            try {
              const newTaskId = await submitSunoJobForRetry(metaObj, row.title);
              
              // 메타데이터의 retry_count 가산하여 갱신
              metaObj.retry_count = currentRetryCount + 1;
              const updatedMetaStr = JSON.stringify(metaObj);

              // 기존 레코드를 새 Task ID 기반으로 초기화하여 generating 상태 유지
              await supabase.from("generations").update({
                source_audio_url: `suno:${newTaskId}`,
                status: "generating",
                license_hash: updatedMetaStr
              }).eq("id", row.id);

              log("INFO", `[RETRY] DB 갱신 완료 — 다음 스케줄러에서 새 태스크 폴링을 대기합니다.`);
              continue; // 이번 루프 건너뜀
            } catch (retryErr) {
              log("ERROR", `[RETRY 실패] 재발행 중 치명적 에러 발생 — 기존 파일 강제 채택으로 복귀`, retryErr.message);
            }
          }

          // 4단계: Winner-Selection
          // 정렬 기준: (숏폼인 경우) 길이 규격 준수 → 등급 가중치 → 피크 왜곡률
          //
          // Suno 제출 API에는 duration 파라미터가 없어 길이를 지정할 수 없다.
          // 텍스트로 "target duration 0:28"을 넣어도 무시된다 (실측: 같은 지시로
          // 14초/32초/43초가 나왔다). 다만 Suno는 매번 2곡을 만들고 각 clip의
          // duration을 돌려주므로, 규격에 맞는 쪽을 고르는 것만으로 상당수 해결된다.
          const gradePriority = { 'A': 3, 'B': 2, 'F': 1 };
          const isShortForm = isShortFormTrack(metaObj);
          const clipSeconds = (c) => {
            const d = parseFloat(c.duration);
            return Number.isFinite(d) && d > 0 ? d : null;
          };

          if (isShortForm) {
            // 후보를 "고를 때"는 목표(23~28초)를 쓴다. 버릴지 말지를 정하는
            // 합격선(20~38초)과 다른 기준이라는 점이 중요하다 — 목표에 가까운 쪽을
            // 우선할 뿐, 목표 밖이라고 탈락시키지는 않는다.
            const inTarget = (c) => {
              const d = clipSeconds(c);
              return d !== null && d >= SHORTFORM_TARGET_MIN_SEC && d <= SHORTFORM_TARGET_MAX_SEC;
            };
            const isUsable = (c) => {
              const d = clipSeconds(c);
              return d !== null && d >= SHORTFORM_ACCEPT_MIN_SEC && d <= SHORTFORM_ACCEPT_MAX_SEC;
            };
            scannedClips.sort((a, b) => {
              // 1순위: 쓸 수 있는 곡. 2순위: 목표 구간에 드는 곡.
              const usableDiff = (isUsable(b.clip) ? 1 : 0) - (isUsable(a.clip) ? 1 : 0);
              if (usableDiff !== 0) return usableDiff;
              const targetDiff = (inTarget(b.clip) ? 1 : 0) - (inTarget(a.clip) ? 1 : 0);
              if (targetDiff !== 0) return targetDiff;
              // 같은 등급이면 목표 중앙(25.5초)에 가까운 쪽
              const da = clipSeconds(a.clip), db = clipSeconds(b.clip);
              if (da !== null && db !== null) {
                const gap = Math.abs(da - SHORTFORM_TARGET_SEC) - Math.abs(db - SHORTFORM_TARGET_SEC);
                if (gap !== 0) return gap;
              }
              const gradeDiff = gradePriority[b.quality.grade] - gradePriority[a.quality.grade];
              if (gradeDiff !== 0) return gradeDiff;
              return a.quality.clippingPerMinute - b.quality.clippingPerMinute;
            });
            // Suno 원본 길이를 그대로 남긴다. 우승곡이 28.5s 로 보이는 게 자연 생성인지
            // 트림 결과인지 구분되지 않아 문제를 오래 못 봤다(실측: 두 클립 다 38~56초).
            log("INFO", `[숏폼 길이 심사] Suno 원본 길이: ${scannedClips.map(sc => `${clipSeconds(sc.clip) ?? '?'}s(${sc.quality.grade})`).join(', ')} — 목표 ${SHORTFORM_TARGET_MIN_SEC}~${SHORTFORM_TARGET_MAX_SEC}초 / 합격 ${SHORTFORM_ACCEPT_MIN_SEC}~${SHORTFORM_ACCEPT_MAX_SEC}초`);
            if (!scannedClips.some(sc => isUsable(sc.clip))) {
              log("WARN", `[숏폼 길이 심사] 두 클립 모두 합격선 밖 — 재발행 한도를 이미 쓴 상태라면 그대로 내보낸다`);
            } else if (!scannedClips.some(sc => inTarget(sc.clip))) {
              // 재발행하지 않는다. 목표를 벗어난 것은 가사 분량 문제이므로
              // 다시 뽑아도 같은 결과가 나온다 — 고칠 곳은 가사다.
              log("INFO", `[숏폼 길이 심사] 목표 구간 밖이지만 사용 가능 — 재발행 없이 채택. 반복되면 가사 음절을 줄여라`);
            }
          } else {
            scannedClips.sort((a, b) => {
              // 일반 보컬곡은 목표 길이(약 3:15)에 도달한 완성 후보를 우선한다.
              // 음질 등급만 비교하면 1분대 조기 종료본이 2~3분 완성본보다 먼저
              // 선택되는 문제가 있었다.
              if (!metaObj.isInstrumental && String(metaObj.lyricsPrompt || '').trim()) {
                const da = clipSeconds(a.clip), db = clipSeconds(b.clip);
                const completeDiff = ((db !== null && db >= 120) ? 1 : 0) - ((da !== null && da >= 120) ? 1 : 0);
                if (completeDiff !== 0) return completeDiff;
                if (da !== null && db !== null) {
                  const targetGap = Math.abs(da - 195) - Math.abs(db - 195);
                  if (targetGap !== 0) return targetGap;
                }
              }
              const gradeDiff = gradePriority[b.quality.grade] - gradePriority[a.quality.grade];
              if (gradeDiff !== 0) return gradeDiff;
              return a.quality.clippingPerMinute - b.quality.clippingPerMinute;
            });
          }

          const winner = scannedClips[0];
          const loser = scannedClips[1];

          /*
           * 트림은 합격 상한(38초)을 넘었을 때만 한다.
           *
           * 예전 기준은 29.5초였다. 그래서 32초짜리 완성곡도 29.4초로 잘려
           * 마지막 소절이 날아갔다. 지금은 38초까지 영상이 정지 프레임으로 덮으므로
           * 자를 이유가 없다 — 자르면 보컬만 잃고 얻는 게 없다.
           */
          if (isShortForm && winner && winner.clip.audio_url) {
            const wSec = clipSeconds(winner.clip);
            if (wSec !== null && wSec > SHORTFORM_ACCEPT_MAX_SEC) {
              const overshoot = wSec - SHORTFORM_ACCEPT_MAX_SEC;
              if (overshoot > SHORTFORM_MAX_TRIMMABLE_SEC) {
                // 잘라내면 보컬이 날아간다. 길이보다 가사 완전성이 우선이다.
                metaObj.durationWarning = `합격 상한 초과 ${wSec}초 (재발행 후에도 미달 — 가사 보존을 위해 트림하지 않음)`;
                log("WARN", `[숏폼] 1번 곡 ${wSec}초 — ${overshoot.toFixed(1)}초 초과라 트림 시 보컬이 잘린다. 완곡 유지하고 규격 위반으로 기록`);
              } else {
                log("INFO", `[숏폼 트림] 1번 곡 ${wSec}초 — 초과분 ${overshoot.toFixed(1)}초(후주 꼬리 추정)만 정리`);
                const trimmedUrl = await trimAudioAndUpload(winner.clip.audio_url, row.id, SHORTFORM_ACCEPT_MAX_SEC);
                if (trimmedUrl) {
                  metaObj.originalDuration = wSec; // 원본 길이 보존 (트림 여부 추적용)
                  winner.clip.audio_url = trimmedUrl;
                  winner.clip.duration = SHORTFORM_ACCEPT_MAX_SEC;
                  log("INFO", `[숏폼 트림] ✅ 1번 곡 ${SHORTFORM_ACCEPT_MAX_SEC}초로 보정`);
                } else {
                  log("WARN", `[숏폼 트림] 실패 — 원본 ${wSec}초 그대로 사용`);
                }
              }
            }
          }

          /*
           * 서브곡(2번)도 같은 규격을 적용한다.
           *
           * 정렬이 짧은 쪽을 1번으로 올리므로 2번은 자동으로 긴 클립이 된다.
           * 그대로 두면 대시보드에 38~56초짜리가 노출돼 "왜 길이가 이렇게 다르냐",
           * "숏폼인데 44초냐" 가 된다. 2번도 트림해 둘 다 바로 쓸 수 있게 만든다.
           */
          if (isShortForm && loser && loser.clip.audio_url) {
            const lSec = clipSeconds(loser.clip);
            if (lSec !== null && lSec > SHORTFORM_ACCEPT_MAX_SEC) {
              const overshoot2 = lSec - SHORTFORM_ACCEPT_MAX_SEC;
              if (overshoot2 > SHORTFORM_MAX_TRIMMABLE_SEC) {
                log("WARN", `[숏폼] 2번 곡 ${lSec}초 — 초과분이 커서 트림 시 보컬 유실. 완곡 유지`);
              } else {
                const trimmedLoser = await trimAudioAndUpload(loser.clip.audio_url, `${row.id}_alt`, SHORTFORM_ACCEPT_MAX_SEC);
                if (trimmedLoser) {
                  metaObj.originalDuration2 = lSec;
                  loser.clip.audio_url = trimmedLoser;
                  loser.clip.duration = SHORTFORM_ACCEPT_MAX_SEC;
                  log("INFO", `[숏폼 트림] ✅ 2번 곡 ${SHORTFORM_ACCEPT_MAX_SEC}초로 보정`);
                }
              }
            }
          }

          log("INFO", `🏆 [Winner Selected] 우승 곡 채택 완료`, {
            grade: winner.quality.grade,
            clipping: winner.quality.clippingPerMinute,
            dissonance: winner.quality.dissonanceScore
          });

          // 5단계: 첫 번째 우승 곡 DB 업데이트 (오디오 등급/품질값 추가 수록)
          if (winner.clip.audio_url) {
            log("INFO", `[SUNO POLL] ✅ 우승 곡 DB 반영 완료!`, { id: row.id.slice(0, 8) });
            metaObj.duration = winner.clip.duration ? parseFloat(winner.clip.duration) : 0;

            /*
             * 길이 처리 결과를 남긴다. 안정성을 눈으로 측정하기 위한 필드다.
             * 이게 없어서 "28.5초"만 보고 자연 생성인지 트림 결과인지 구분하지 못했고,
             * 가사가 잘린 곡이 정상으로 집계됐다.
             *   natural    — 손대지 않고 목표(23~28초) 충족
             *   off_target — 목표 밖이지만 쓸 수 있어 그대로 채택 (재발행하지 않음)
             *   retried    — 재발행 후 채택
             *   trimmed    — 합격 상한 초과분(≤3초)만 정리
             *   over_spec  — 합격 상한(38초) 초과지만 가사 보존을 위해 완곡 유지
             *
             * off_target 이 잦으면 Suno 가 아니라 **가사 분량**을 고쳐야 한다는 신호다.
             * 재발행해도 같은 가사면 같은 길이가 나온다.
             */
            if (isShortForm) {
              const d = metaObj.duration;
              const inTargetFinal =
                Number.isFinite(d) && d >= SHORTFORM_TARGET_MIN_SEC && d <= SHORTFORM_TARGET_MAX_SEC;
              metaObj.durationOutcome = metaObj.durationWarning
                ? 'over_spec'
                : metaObj.originalDuration
                  ? 'trimmed'
                  : (metaObj.duration_retry_count || 0) > 0
                    ? 'retried'
                    : inTargetFinal
                      ? 'natural'
                      : 'off_target';
              log("INFO", `[숏폼 결과] ${metaObj.durationOutcome} · ${metaObj.duration}초 · 재발행 ${metaObj.duration_retry_count || 0}회`);
            }

            const updatedMetaStr = JSON.stringify(metaObj);

            /*
             * 커버 우선순위.
             *
             * 숏폼(바이럴)은 썸네일이 클릭률을 좌우하므로 가사 내용이 그림에 보여야 한다.
             * Suno 자동 커버는 스타일 프롬프트만 보고 만들어서 곡 내용과 무관하다
             * ("귀여운 하이퍼팝" → 곡이 택배 얘기든 커튼 얘기든 비슷한 그림).
             * 따라서 숏폼은 유료 AI 생성을 1순위로 둔다.
             *
             * 일반 트랙은 비용을 아껴 Suno 커버를 먼저 쓴다.
             */
            let winnerCoverUrl = row.cover_art_url;

            if (isPlaceholderCover(winnerCoverUrl)) {
              if (isShortForm) {
                log("INFO", `[커버] 숏폼 — 가사 기반 AI 커버 생성`, { id: row.id.slice(0, 8) });
                const aiCover = await generateCoverArt(metaObj, row.title, row.id);
                if (aiCover) {
                  winnerCoverUrl = aiCover;
                  log("INFO", `[커버] ✅ AI 커버 생성 완료`, { id: row.id.slice(0, 8) });
                } else if (winner.clip.image_url) {
                  winnerCoverUrl = winner.clip.image_url;
                  log("WARN", `[커버] AI 생성 실패 — Suno 커버로 폴백`, { id: row.id.slice(0, 8) });
                }
              } else if (winner.clip.image_url) {
                winnerCoverUrl = winner.clip.image_url;
                log("INFO", `[커버] Suno 곡별 커버 채택`, { id: row.id.slice(0, 8) });
              } else {
                const aiCover = await generateCoverArt(metaObj, row.title, row.id);
                if (aiCover) winnerCoverUrl = aiCover;
              }
            }

            const { error: upErr } = await supabase.from("generations").update({
              audio_url: winner.clip.audio_url,
              source_audio_url: winner.clip.audio_url,
              title: row.title || winner.clip.title || "Untitled",
              status: "completed",
              license_hash: updatedMetaStr,
              clipping_count: winner.quality.clippingCount,
              dissonance_score: winner.quality.dissonanceScore,
              audio_grade: winner.quality.grade,
              retry_count: currentRetryCount,
              cover_art_url: winnerCoverUrl
            }).eq("id", row.id);

            if (upErr) {
              log("ERROR", `[SUNO POLL] 우승 곡 DB 업데이트 실패!`, { error: upErr.message });
            } else {
              await linkGenerationQueueCandidate(metaObj, row.id, 'A', winner.clip, winner.quality, true);

              // 🎤 [AUTO RVC] 마이 보이스(커스텀 보이스)가 지정되어 있으면 즉시 자동으로 스템 분리 및 1:1 보이스 변환 파이프라인 가동!
              const isAutoVoice = metaObj.auto_voice_convert === true || (metaObj.voiceDna && (String(metaObj.voiceDna).includes('yoon') || String(metaObj.voiceDna).startsWith('custom')));

              if (!VOICE_CLONING_ENABLED && isAutoVoice) {
                log("INFO", `[AUTO RVC] 음성 복제 기능 비활성화 — 자동 변환 건너뜀`, { id: row.id.slice(0, 8) });
              }

              if (VOICE_CLONING_ENABLED && isAutoVoice && winner.clip.audio_url) {
                log("INFO", `[AUTO RVC] 후속 스템 작업을 안전한 큐에 등록`, { id: row.id.slice(0, 8) });
                const queuedAt = new Date().toISOString();
                const queuedMetadata = {
                  ...parseGenerationMetadata(updatedMetaStr),
                  stemStatus: 'pending',
                  stemStage: 'queued',
                  stemProgress: 0,
                  stemHeartbeatAt: queuedAt,
                  stemError: null,
                };
                const { data: autoVoiceRow, error: autoVoiceQueueError } = await supabase
                  .from('generations')
                  .update({ license_hash: JSON.stringify(queuedMetadata) })
                  .eq('id', row.id)
                  .eq('license_hash', updatedMetaStr)
                  .select('*')
                  .single();
                if (autoVoiceQueueError || !autoVoiceRow) {
                  log('ERROR', '[AUTO RVC] 스템 큐 등록 실패', autoVoiceQueueError?.message || '행 없음');
                } else {
                  void scheduleStemJob(autoVoiceRow, 'auto-voice');
                }
              }
            }
          }

          // 6단계: 두 번째 곡(서브 곡) 저장 — 길이 편차가 큰 조기 종료본은 제외
          if (loser && loser.clip.audio_url) {
            const loserTitle = (row.title ? row.title + " (2)" : loser.clip.title) || "Untitled (2)";
            const winnerSec = clipSeconds(winner.clip);
            const loserSec = clipSeconds(loser.clip);
            const isIncompleteGeneralVariant = !isShortForm
              && !metaObj.isInstrumental
              && winnerSec !== null
              && loserSec !== null
              && Math.min(winnerSec, loserSec) / Math.max(winnerSec, loserSec) < 0.7
              && Math.abs(winnerSec - loserSec) > 45;

            if (isIncompleteGeneralVariant) {
              log("WARN", `[SUNO POLL] 서브 곡 저장 제외 — 동일 요청 후보 길이 편차 과다 (${winnerSec}s / ${loserSec}s)`, { title: loserTitle });
              continue;
            }
            
            const { data: existing } = await supabase.from("generations")
              .select("id")
              .eq("title", loserTitle)
              .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
              .limit(1);

            if (!existing || existing.length === 0) {
              log("INFO", `[SUNO POLL] ✅ 서브 곡(2) 저장! (대시보드 전용 / 공개 피드 노출 방지)`, { title: loserTitle, grade: loser.quality.grade });
              metaObj.duration = loser.clip.duration ? parseFloat(loser.clip.duration) : 0;
              metaObj.isPublic = false; // 서브 곡은 대시보드 저장용이며 공개 피드 중복 노출을 차단합니다.
              const updatedMeta2Str = JSON.stringify(metaObj);

              // ⚠️ 여기서 쓰던 isUnsplashPlaceholder 는 우승곡 블록 안에서 선언돼
              //    있어 이 스코프에서는 ReferenceError 였다. 서브곡 저장이 조용히
              //    실패해 온 원인. 모듈 스코프 isPlaceholderCover 로 교체한다.
              const loserCoverUrl = !isPlaceholderCover(metaObj.coverArtUrl2)
                ? metaObj.coverArtUrl2
                : (loser.clip.image_url
                    || (!isPlaceholderCover(row.cover_art_url) ? row.cover_art_url : null)
                    || row.cover_art_url);

              const { data: loserRow, error: insErr } = await supabase.from("generations").insert({
                user_id: row.user_id || null,
                title: loserTitle,
                audio_url: loser.clip.audio_url,
                source_audio_url: loser.clip.audio_url,
                status: "completed",
                is_public: false,
                is_stem_extracted: false,
                duration_mode: row.duration_mode || null,
                license_hash: updatedMeta2Str,
                clipping_count: loser.quality.clippingCount,
                dissonance_score: loser.quality.dissonanceScore,
                audio_grade: loser.quality.grade,
                retry_count: currentRetryCount,
                cover_art_url: loserCoverUrl
              }).select('id').single();

              if (insErr) {
                log("ERROR", `[SUNO POLL] 서브 곡 INSERT 실패!`, { error: insErr.message });
              } else {
                await linkGenerationQueueCandidate(metaObj, loserRow?.id, 'B', loser.clip, loser.quality, false);
              }
            }
          }

          log("INFO", `[SUNO POLL] DB 업데이트 최종 완료`, { id: row.id.slice(0, 8) });
        } else {
          log("INFO", `[SUNO POLL] 아직 생성 중...`, { id: row.id.slice(0, 8), progress: fetchData.progress || "unknown" });
        }
      } catch (pollErr) {
        log("ERROR", `[SUNO POLL] 에러`, { id: row.id.slice(0, 8), error: pollErr.message });
      }
    }
  } catch (err) {
    log("ERROR", "[SUNO POLL] 스캔 예외", err.message);
  } finally {
    isPollingSuno = false;
  }
}

// 10초마다 Suno generating 상태 곡 폴링
setInterval(pollSunoGenerations, 10000);
log("INFO", "[SUNO POLL] Suno 폴링 스케줄러 시작 (10초 간격)");

// ─── 비디오 생성 비동기 처리 함수 (Vertex AI Veo 3.1) ────────────────────────
async function processVideoGeneration(row) {
  const { id, prompt } = row;
  log('INFO', `비디오 생성 프로세스 가동: ${id}`, { prompt: prompt.slice(0, 50) });

  try {
    // 1. 상태를 'processing'으로 변경
    await supabase
      .from('video_assets')
      .update({ status: 'processing' })
      .eq('id', id);

    // 2. Vertex AI 인증 획득
    const keyFilePath = './vertex-express-key.json';
    if (!fs.existsSync(keyFilePath)) {
      throw new Error(`Vertex AI 키 파일(${keyFilePath})이 존재하지 않습니다.`);
    }

    const auth = new GoogleAuth({
      keyFile: keyFilePath,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    // JSON 키에서 프로젝트 ID 로드
    const keyData = require(keyFilePath);
    const projectId = keyData.project_id;
    const region = process.env.GOOGLE_CLOUD_REGION || 'us-central1';
    const modelId = process.env.VEO_MODEL_ID || 'veo-2.0-generate-video-001';

    log('INFO', `Vertex AI 호출 준비: model=${modelId}, region=${region}, project=${projectId}`);

    // 3. Long Running Operation 생성 요청
    const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${modelId}:predictLongRunning`;
    
    const payload = {
      instances: [
        {
          prompt: prompt
        }
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: "16:9",
        resolution: "720p",
        durationSeconds: 8
      }
    };

    const res = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      }
    });

    const operation = res.data;
    const operationName = operation.name;
    log('INFO', `Vertex AI 비디오 Operation 생성 완료: ${operationName}`);

    // 4. Polling 루프 시작
    let isDone = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 * 10초 = 300초 (5분)
    let videoBase64 = null;

    while (!isDone && attempts < maxAttempts) {
      attempts++;
      log('INFO', `비디오 렌더링 진행 상태 폴링 중... (${attempts}/${maxAttempts})`);
      
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10초 대기

      const pollRes = await axios.get(`https://${region}-aiplatform.googleapis.com/v1/${operationName}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        }
      });

      const opStatus = pollRes.data;
      if (opStatus.done) {
        isDone = true;
        if (opStatus.error) {
          throw new Error(`Vertex AI Operation Error: ${opStatus.error.message}`);
        }
        
        const responseData = opStatus.response;
        const generatedVideo = responseData?.generatedVideos?.[0];
        videoBase64 = generatedVideo?.video?.bytesBase64Encoded;
        
        if (!videoBase64) {
          throw new Error('생성된 비디오 데이터(Base64)를 찾을 수 없습니다.');
        }
      }
    }

    if (!isDone) {
      throw new Error('비디오 생성 대기 시간이 초과되었습니다 (5분).');
    }

    log('INFO', 'Vertex AI 비디오 생성 완료 -> Supabase Storage 업로드 시작');

    // 5. Supabase Storage 업로드
    const videoBuffer = Buffer.from(videoBase64, 'base64');
    const remotePath = `videos/${id}_veo.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('melodio-assets')
      .upload(remotePath, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`비디오 파일 업로드 실패: ${uploadError.message}`);
    }

    const publicUrl = supabase.storage
      .from('melodio-assets')
      .getPublicUrl(remotePath)
      .data.publicUrl;

    log('INFO', `비디오 업로드 완료 -> DB 상태 업데이트`, { publicUrl });

    // 6. DB 완료 처리
    await supabase
      .from('video_assets')
      .update({
        status: 'completed',
        video_url: publicUrl
      })
      .eq('id', id);

    log('INFO', `비디오 에셋 생성 프로세스 최종 완료: ${id}`);
  } catch (err) {
    log('ERROR', `비디오 에셋 생성 실패: ${id}`, err.message);
    await supabase
      .from('video_assets')
      .update({
        status: 'failed'
      })
      .eq('id', id);
  }
}

// ─── Video Realtime 구독 설정 ────────────────────────────────────────────────
function startVideoSubscription() {
  log('INFO', 'Supabase Realtime 비디오 구독 시작 (video_assets 테이블 INSERT 감시)');

  const channel = supabase
    .channel('video_assets-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'video_assets',
      },
      async (payload) => {
        const row = payload.new;
        if (!row) return;

        if (row.status === 'pending') {
          log('INFO', `video_assets INSERT 감지 (pending) -> Veo 3.1 비디오 생성 시작`, { id: row.id });
          try {
            await processVideoGeneration(row);
          } catch (err) {
            log('ERROR', '비디오 이벤트 핸들러 예외', err.message);
          }
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        log('INFO', 'Video Realtime 채널 연결 완료 — 이벤트 대기 중...');
      }
    });

  return channel;
}

// 시작 시 기존 PENDING 비디오 작업 자동 스캔 & 처리
async function processExistingPendingVideo() {
  log("INFO", "기존 PENDING 비디오 작업 스캔 시작...");
  try {
    const { data, error } = await supabase
      .from("video_assets")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      log("ERROR", "비디오 PENDING 스캔 실패", error.message);
      return;
    }

    if (!data || data.length === 0) {
      log("INFO", "처리 대기 중인 PENDING 비디오 작업 없음");
      return;
    }

    log("INFO", `PENDING 비디오 작업 ${data.length}건 발견 — 순차 처리 시작`);
    for (const row of data) {
      log("INFO", `PENDING 비디오 작업 처리 시작`, { id: row.id, prompt: row.prompt.slice(0, 30) });
      try {
        await processVideoGeneration(row);
      } catch (err) {
        log("ERROR", `PENDING 비디오 작업 처리 실패`, { id: row.id, error: err.message });
      }
    }
  } catch (err) {
    log("ERROR", "비디오 PENDING 스캔 예외", err.message);
  }
}

// 시작 후 5초 대기 후 비디오 PENDING 스캔, 이후 30초마다 반복
setTimeout(processExistingPendingVideo, 5000);
setInterval(processExistingPendingVideo, 30000);

// ─── Episode Assembly: 확정 Master 순차 병합 ────────────────────────────────
let isProcessingAssemblies = false;

function runFile(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      resolve(stdout);
    });
  });
}

function assemblyTimestamp(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

async function processEpisodeAssembly(assembly) {
  const workDir = path.join(os.tmpdir(), `melodio-assembly-${assembly.id}`);
  fs.mkdirSync(workDir, { recursive: true });
  const { data: claimed } = await supabase.from('episode_assemblies').update({
    status: 'assembling', error_message: null,
  }).eq('id', assembly.id).eq('status', 'queued').select('id').maybeSingle();
  if (!claimed) return;

  try {
    const { data: items, error } = await supabase.from('episode_assembly_items')
      .select('*').eq('assembly_id', assembly.id).order('track_number');
    if (error || !items?.length) throw new Error(error?.message || 'Assembly Track이 없습니다.');

    const localPaths = [];
    let cursor = 0;
    const tracklist = [];
    for (const item of items) {
      const localPath = path.join(workDir, `track-${String(item.track_number).padStart(3, '0')}.audio`);
      const response = await axios.get(item.audio_url, { responseType: 'stream', timeout: 120000 });
      await pipeline(response.data, fs.createWriteStream(localPath));
      const probe = await runFile('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', localPath,
      ]);
      const duration = Number.parseFloat(String(probe).trim());
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Track ${item.track_number} 길이 측정 실패`);
      const start = cursor;
      cursor += duration;
      tracklist.push(`${assemblyTimestamp(start)} ${item.title}`);
      await supabase.from('episode_assembly_items').update({
        duration_seconds: duration,
        start_seconds: start,
        end_seconds: cursor,
      }).eq('id', item.id);
      localPaths.push(localPath);
    }

    const listPath = path.join(workDir, 'concat.txt');
    fs.writeFileSync(listPath, localPaths.map((file) => `file '${file}'`).join('\n'));
    const outputPath = path.join(workDir, 'episode-master.mp3');
    await runFile('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', outputPath,
    ]);

    const remotePath = `channel-episodes/${assembly.user_id}/${assembly.episode_id}/${assembly.id}.mp3`;
    const outputBuffer = fs.readFileSync(outputPath);
    const { error: uploadError } = await supabase.storage.from('melodio-assets').upload(
      remotePath, outputBuffer, { contentType: 'audio/mpeg', upsert: true },
    );
    if (uploadError) throw new Error(`Assembly 업로드 실패: ${uploadError.message}`);
    const outputUrl = supabase.storage.from('melodio-assets').getPublicUrl(remotePath).data.publicUrl;
    await supabase.from('episode_assemblies').update({
      status: 'completed',
      total_duration_seconds: cursor,
      tracklist_text: tracklist.join('\n'),
      output_audio_url: outputUrl,
      completed_at: new Date().toISOString(),
      error_message: null,
    }).eq('id', assembly.id);
    await supabase.from('channel_episodes').update({ status: 'completed' }).eq('id', assembly.episode_id);
    log('INFO', '[EPISODE ASSEMBLY] 조립 완료', { id: assembly.id, tracks: items.length, seconds: cursor });
  } catch (error) {
    await supabase.from('episode_assemblies').update({
      status: 'failed', error_message: error.message,
    }).eq('id', assembly.id);
    log('ERROR', '[EPISODE ASSEMBLY] 조립 실패', { id: assembly.id, error: error.message });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function processQueuedEpisodeAssemblies() {
  if (isProcessingAssemblies) return;
  isProcessingAssemblies = true;
  try {
    const { data, error } = await supabase.from('episode_assemblies').select('*')
      .eq('status', 'queued').order('created_at').limit(2);
    if (error) throw error;
    for (const assembly of data || []) await processEpisodeAssembly(assembly);
  } catch (error) {
    log('ERROR', '[EPISODE ASSEMBLY] Queue 조회 실패', error.message);
  } finally {
    isProcessingAssemblies = false;
  }
}

setTimeout(processQueuedEpisodeAssemblies, 7000);
setInterval(processQueuedEpisodeAssemblies, 15000);
