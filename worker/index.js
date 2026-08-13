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
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pipeline } = require('stream/promises');
const { analyzeAudio } = require('./analyzer');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

// ─── 환경변수 검증 ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// demucs/ffmpeg 없는 환경에서도 전체 파이프라인 논리 증명 가능 (행동강령 3조)
const MOCK_MODE = process.env.MOCK_MODE === 'true';

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
const SHORTFORM_MAX_DURATION_RETRIES = 2;

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
  log('INFO', `  [SLEEP MODE] Max ${MAX_JOBS}개 작업 완료 — 휴면 상태 진입`);
  log('INFO', '  ▸ Realtime 구독 유지 (새 잡은 무시)');
  log('INFO', '  ▸ 재활성화: pm2 restart melodio-worker');
  log('INFO', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ─── 핵심 파이프라인: 한 generation row를 처리 ────────────────────────────────
async function processGeneration(row) {
  if (isSleeping || jobsProcessed >= MAX_JOBS) {
    log('WARN', `[SLEEP] 새 잡 수신 — 슬립 모드 중 무시`, { id: row.id });
    return;
  }
  jobsProcessed++;
  log('INFO', `[잡 ${jobsProcessed}/${MAX_JOBS}] 처리 시작 (Phase 10: Dual-Path Encoding)`);

  const { id, audio_url, user_id } = row;
  log('INFO', `파이프라인 시작`, { id, user_id });

  if (!audio_url) {
    log('ERROR', `audio_url이 존재하지 않습니다.`);
    return;
  }

  if (row.stem_vocals_url) {
    log('INFO', `이미 스템 분리가 완료된 잡입니다. 건너뜁니다.`, { id });
    return;
  }

  // 작업 디렉토리 설정
  const workDir = path.join(os.tmpdir(), `melodio-worker-${id}`);
  const inputPath = path.join(workDir, 'input.mp3'); 
  const outDir = path.join(workDir, 'demucs_out');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    // 1단계: status → 'processing'
    const { error: updateErr } = await supabase
      .from('generations')
      .update({ status: 'processing' })
      .eq('id', id);

    if (updateErr) throw new Error(`Status 업데이트 실패: ${updateErr.message}`);
    log('INFO', `[1/6] status → processing 업데이트 성공`);

    // 2단계: 오디오 다운로드 (MOCK 모드: 더미 버퍼 생성)
    log('PROC', `[2/6] 오디오 다운로드 중... | url=${audio_url} | mock=${MOCK_MODE}`);
    if (!MOCK_MODE) {
      const response = await fetch(audio_url);
      if (!response.ok) throw new Error(`음원 다운로드 실패 (HTTP ${response.status})`);
      await pipeline(response.body, fs.createWriteStream(inputPath));
    } else {
      // MOCK: 더미 MP3 헤더 바이트로 파일 생성
      fs.writeFileSync(inputPath, Buffer.alloc(1024, 0xff));
    }
    log('INFO', `[2/6] 다운로드 성공 → ${inputPath}`);

    // 3단계: Demucs 연산 실행 (MOCK 모드: 더미 WAV 생성)
    log('PROC', `[3/6] Demucs 분리 프로세스 가동 (htdemucs_ft)... | mock=${MOCK_MODE}`);
    // demucs 출력 경로: outDir/htdemucs_ft/input/{vocals,bass,drums,other}.wav
    const demucsResultDir = path.join(outDir, 'htdemucs_ft', 'input');
    if (!MOCK_MODE) {
      await new Promise((resolve, reject) => {
        // Python 경로는 환경에 따라 동적 탐색 (muse → yoonmanro 경로 변경 대응)
        const demucsCmd = `/usr/bin/python3 -m demucs -n htdemucs_ft -o "${outDir}" -d cpu "${inputPath}"`;
        exec(demucsCmd, (error, stdout, stderr) => {
          if (error) {
            log('ERROR', 'Demucs 에러', stderr);
            return reject(new Error('Demucs 실행 실패'));
          }
          resolve();
        });
      });
      if (!fs.existsSync(demucsResultDir)) {
        throw new Error(`Demucs 출력 디렉토리 없음: ${demucsResultDir}`);
      }
    } else {
      // MOCK: 더미 WAV 파일 4종 생성
      fs.mkdirSync(demucsResultDir, { recursive: true });
      for (const stem of STEMS) {
        fs.writeFileSync(path.join(demucsResultDir, `${stem}.wav`), Buffer.alloc(2048, 0xab));
      }
    }
    log('INFO', `[3/6] Demucs 4채널 WAV 분리 완료`);

    // 4단계: FFmpeg 프리뷰용 AAC 변환 (MOCK 모드: 더미 m4a 생성)
    log('PROC', `[4/6] FFmpeg AAC 프리뷰 인코딩 시작... | mock=${MOCK_MODE}`);
    if (!MOCK_MODE) {
      const encodePromises = STEMS.map(stem => {
        return new Promise((resolve, reject) => {
          const wavFile = path.join(demucsResultDir, `${stem}.wav`);
          const aacFile = path.join(demucsResultDir, `${stem}.m4a`);
          exec(`ffmpeg -y -i "${wavFile}" -c:a aac -b:a 192k "${aacFile}"`, (error) => {
            if (error) return reject(new Error(`FFmpeg AAC 변환 실패: ${stem}`));
            resolve();
          });
        });
      });
      await Promise.all(encodePromises);
    } else {
      // MOCK: 더미 AAC 파일 4종 생성
      for (const stem of STEMS) {
        fs.writeFileSync(path.join(demucsResultDir, `${stem}.m4a`), Buffer.alloc(1024, 0xcd));
      }
    }
    log('INFO', `[4/6] 4채널 AAC(.m4a) 압축 파이프라인 완료`);

    // 5단계: Supabase 버킷에 듀얼 업로드
    log('PROC', `[5/6] Supabase Storage 듀얼 업로드 시작 (WAV + AAC)...`);
    const uploadResults = { original: {}, preview: {} };

    for (const stem of STEMS) {
      // WAV 업로드
      const wavLocal = path.join(demucsResultDir, `${stem}.wav`);
      const wavRemote = `stems/${id}/original/${stem}.wav`;
      const wavBuf = fs.readFileSync(wavLocal);
      await supabase.storage.from('melodio-assets').upload(wavRemote, wavBuf, { contentType: 'audio/wav', upsert: true });
      uploadResults.original[stem] = supabase.storage.from('melodio-assets').getPublicUrl(wavRemote).data.publicUrl;

      // AAC 업로드
      const aacLocal = path.join(demucsResultDir, `${stem}.m4a`);
      const aacRemote = `stems/${id}/preview/${stem}.m4a`;
      const aacBuf = fs.readFileSync(aacLocal);
      await supabase.storage.from('melodio-assets').upload(aacRemote, aacBuf, { contentType: 'audio/mp4', upsert: true });
      uploadResults.preview[stem] = supabase.storage.from('melodio-assets').getPublicUrl(aacRemote).data.publicUrl;

      log('PROC', `  → [${stem}] WAV + AAC 업로드 완료`);
    }
    log('INFO', `[5/6] 총 8개 스템 파일 업로드 성공`);

    // 6단계: generations DB 반영
    const { error: completeErr } = await supabase
      .from('generations')
      .update({
        status: 'completed',
        stem_vocals_url: uploadResults.original['vocals'],
        stem_bass_url: uploadResults.original['bass'],
        stem_drums_url: uploadResults.original['drums'],
        stem_other_url: uploadResults.original['other'],
        preview_vocals_url: uploadResults.preview['vocals'],
        preview_bass_url: uploadResults.preview['bass'],
        preview_drums_url: uploadResults.preview['drums'],
        preview_other_url: uploadResults.preview['other'],
      })
      .eq('id', id);

    if (completeErr) throw new Error(`Completed URL 업데이트 실패: ${completeErr.message}`);
    log('INFO', `[6/6] 파이프라인 최종 완료 ✔`);

  } catch (err) {
    log('ERROR', `파이프라인 치명적 에러: ${err.message}`);
    await supabase.from('generations').update({ status: 'failed' }).eq('id', id);
  } finally {
    // 임시 디렉토리 클린업
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      log('PROC', `[CLEANUP] 임시 파일 정리 완료: ${workDir}`);
    } catch (e) {
      log('WARN', `임시 파일 정리 실패: ${e.message}`);
    }
    
    // ★ 야간 모드이므로 1개 처리 완료 후 슬립
    enterSleepMode();
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

        // 온디맨드 스템 분리: 사용자가 버튼을 눌러 status가 'pending'이 되었을 때만 시작
        if (row.status === 'pending' && row.audio_url && !row.stem_vocals_url) {
          log('INFO', `generation ${payload.eventType} 감지 (pending) -> 스템 분리 시작`, { id: row.id });
          try {
            await processGeneration(row);
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

  return channel;
}

// ─── 비정상 종료 핸들링 ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  log('WARN', 'SIGTERM 수신 — 워커를 종료합니다.');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('WARN', 'SIGINT 수신 — 워커를 종료합니다.');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log('ERROR', `예외 미처리: ${err.message}`, err.stack);
});

// ─── 워커 메인 진입점 ─────────────────────────────────────────────────────────
log('INFO', '============================================');
log('INFO', '  Melodio Worker Node v2.0 (Phase 10: Dual)  ');
log('INFO', '============================================');
log('INFO', `SUPABASE_URL: ${SUPABASE_URL}`);

startRealtimeSubscription();
startVideoSubscription();

// ─── 시작 시 기존 PENDING 작업 자동 스캔 & 처리 ────────────────────────────────
async function processExistingPending() {
  log("INFO", "기존 PENDING 작업 스캔 시작...");
  try {
    const { data, error } = await supabase
      .from("generations")
      .select("*")
      .in("status", ["pending"])
      .not("audio_url", "is", null)
      .is("stem_vocals_url", null)
      .order("created_at", { ascending: true });

    if (error) {
      log("ERROR", "PENDING 스캔 실패", error.message);
      return;
    }

    if (!data || data.length === 0) {
      log("INFO", "처리 대기 중인 PENDING 작업 없음");
      return;
    }

    log("INFO", `PENDING 작업 ${data.length}건 발견 — 순차 처리 시작`);
    for (const row of data) {
      log("INFO", `PENDING 작업 처리 시작`, { id: row.id, title: (row.title || "").slice(0, 30) });
      try {
        await processGeneration(row);
      } catch (err) {
        log("ERROR", `PENDING 작업 처리 실패`, { id: row.id, error: err.message });
      }
    }
    log("INFO", "기존 PENDING 작업 스캔 완료");
  } catch (err) {
    log("ERROR", "PENDING 스캔 예외", err.message);
  }
}

// 시작 후 5초 대기 후 PENDING 스캔, 이후 30초마다 반복 (Realtime 누락 방지)
setTimeout(processExistingPending, 5000);
setInterval(processExistingPending, 30000);

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

  const effectiveStylePrompt = metadata.excludePrompt?.trim()
    ? `${metadata.stylePrompt}, ${metadata.excludePrompt.trim()}`
    : metadata.stylePrompt;

  const model = mapSunoVersionToModel(metadata.sunoVersion);

  log("INFO", `[RETRY SUBMIT] Suno 재발행 요청 전송 중... (model: ${model})`);

  const submitRes = await fetch(`${apiBaseUrl}/suno/submit/music`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: metadata.lyricsPrompt ?? '',
      tags: effectiveStylePrompt ?? '',
      title: title ?? 'Untitled',
      mv: model,
      make_instrumental: metadata.isInstrumental ?? false,
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
            }
          }

          // 6단계: 두 번째 곡(서브 곡) 무조건 저장 (Suno 기본 2곡 생성 보장)
          if (loser && loser.clip.audio_url) {
            const loserTitle = (row.title ? row.title + " (2)" : loser.clip.title) || "Untitled (2)";
            
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

              const { error: insErr } = await supabase.from("generations").insert({
                user_id: row.user_id || null,
                title: loserTitle,
                audio_url: loser.clip.audio_url,
                source_audio_url: loser.clip.audio_url,
                status: "completed",
                is_stem_extracted: false,
                duration_mode: row.duration_mode || null,
                license_hash: updatedMeta2Str,
                clipping_count: loser.quality.clippingCount,
                dissonance_score: loser.quality.dissonanceScore,
                audio_grade: loser.quality.grade,
                retry_count: currentRetryCount,
                cover_art_url: loserCoverUrl
              });

              if (insErr) {
                log("ERROR", `[SUNO POLL] 서브 곡 INSERT 실패!`, { error: insErr.message });
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
