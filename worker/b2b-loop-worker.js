/**
 * melodio-worker — B2B 1-Hour Loop FFmpeg 워커
 *
 * 동작 원리:
 *   1. Supabase Realtime으로 b2b_loops 테이블 INSERT 이벤트 구독
 *   2. 잡 감지 → status 'generating'으로 전환
 *   3. Lyria API(또는 Mock)로 track_count개 오디오 순차 생성
 *   4. status 'stitching'으로 전환
 *   5. FFmpeg concat으로 전체 오디오 병합 (1시간 루프)
 *   6. 커버 이미지 + 오디오 → MP4 변환
 *   7. Supabase Storage 업로드 → output_mp4_url, output_audio_url 저장
 *   8. status 'completed'
 *
 * ⚠️  비용 폭탄 방지:
 *   USE_MOCK_LYRIA=true → 실제 Lyria API 호출 없이 샘플 오디오 사용
 *
 * 실행:
 *   node b2b-loop-worker.js  (또는 PM2 ecosystem에 추가)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

// ─── 환경변수 ──────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_MOCK = process.env.USE_MOCK_LYRIA !== 'false'; // 기본: Mock 안전 모드

// Lyria API 설정
const NEXT_API_BASE = process.env.MELODIO_API_BASE ?? 'http://localhost:3000';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[B2B-WORKER][FATAL] .env에 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const log = (level, msg, data = '') => {
  const ts = new Date().toISOString();
  const icon = { INFO: '✅', WARN: '⚠️', ERROR: '❌', PROC: '⚙️' }[level] || '▶';
  console.log(`[${ts}] ${icon} [B2B][${level}] ${msg}${data ? ' | ' + JSON.stringify(data) : ''}`);
};

// ─── Mock 오디오 URL ───────────────────────────────────────────
const MOCK_AUDIO_URLS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
];

// ─── Supabase 잡 상태 업데이트 ────────────────────────────────
async function updateJob(id, fields) {
  const { error } = await supabase.from('b2b_loops').update(fields).eq('id', id);
  if (error) log('ERROR', `DB 업데이트 실패 (${id})`, { msg: error.message });
}

// ─── 단일 트랙 생성 ───────────────────────────────────────────
async function generateTrack(prompt, trackIndex) {
  if (USE_MOCK) {
    const url = MOCK_AUDIO_URLS[trackIndex % MOCK_AUDIO_URLS.length];
    log('INFO', `[MOCK] 트랙 ${trackIndex + 1} — ${url}`);
    await new Promise((r) => setTimeout(r, 800)); // Mock 딜레이
    return url;
  }

  // 실제 Lyria API 호출 (Next.js API Route 경유)
  const resp = await fetch(`${NEXT_API_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stylePrompt: prompt, durationMode: 'pro' }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`트랙 ${trackIndex + 1} 생성 실패: ${err.error ?? resp.status}`);
  }

  const data = await resp.json();
  // generations 테이블에 삽입된 row — audio_url은 오케스트레이터가 채워줄 때까지 polling
  let audioUrl = data.audio_url;
  if (!audioUrl) {
    // 최대 120초 폴링
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const { data: row } = await supabase
        .from('generations')
        .select('audio_url, status')
        .eq('id', data.id)
        .single();
      if (row?.status === 'completed' && row.audio_url) {
        audioUrl = row.audio_url;
        break;
      }
      if (row?.status === 'failed') throw new Error(`트랙 ${trackIndex + 1} 생성 실패`);
    }
  }
  if (!audioUrl) throw new Error(`트랙 ${trackIndex + 1}: 타임아웃 — audio_url 없음`);
  return audioUrl;
}

// ─── 오디오 파일 다운로드 ─────────────────────────────────────
async function downloadAudio(url, destPath) {
  const resp = await axios.get(url, { responseType: 'stream', timeout: 60000 });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    resp.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// ─── FFmpeg: 오디오 파일 concat ───────────────────────────────
async function stitchAudio(audioPaths, outputPath) {
  // concat demuxer용 파일 리스트 텍스트 생성
  const listFile = outputPath + '.txt';
  const lines = audioPaths.map((p) => `file '${p}'`).join('\n');
  await fsp.writeFile(listFile, lines, 'utf-8');

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .output(outputPath)
      .on('end', () => {
        fsp.unlink(listFile).catch(() => {});
        resolve();
      })
      .on('error', reject)
      .run();
  });
}

// ─── FFmpeg: 오디오 + 이미지 → MP4 ───────────────────────────
async function createMp4(audioPath, coverImagePath, outputMp4Path) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(coverImagePath)
      .inputOptions(['-loop', '1'])
      .input(audioPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate('192k')
      .outputOptions([
        '-c:v', 'libx264',
        '-tune', 'stillimage',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        '-movflags', '+faststart',
      ])
      .output(outputMp4Path)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

// ─── Supabase Storage 업로드 ──────────────────────────────────
async function uploadToStorage(localPath, storagePath, mimeType) {
  const buffer = await fsp.readFile(localPath);
  const { error } = await supabase.storage
    .from('melodio-assets')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Storage 업로드 실패: ${error.message}`);

  const { data } = supabase.storage.from('melodio-assets').getPublicUrl(storagePath);
  return data.publicUrl;
}

// ─── 커버 이미지 준비 ─────────────────────────────────────────
async function prepareCoverImage(coverImageUrl, tmpDir) {
  const coverPath = path.join(tmpDir, 'cover.jpg');
  try {
    await downloadAudio(coverImageUrl, coverPath);
    return coverPath;
  } catch {
    // 다운로드 실패 시 기본 1x1 흰 이미지 생성 (FFmpeg이 처리 가능한 최소 이미지)
    log('WARN', '커버 이미지 다운로드 실패 — 기본 이미지 사용');
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input('color=white:size=1920x1080:rate=1')
        .inputOptions(['-f', 'lavfi'])
        .frames(1)
        .output(coverPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    return coverPath;
  }
}

// ─── 메인 잡 처리 ─────────────────────────────────────────────
async function processB2BJob(job) {
  const { id, prompt, track_count, cover_image_url } = job;
  const tmpDir = path.join(os.tmpdir(), `melodio-b2b-${id}`);
  await fsp.mkdir(tmpDir, { recursive: true });
  log('INFO', `B2B 잡 시작 — id=${id}, tracks=${track_count}`);

  try {
    // ─ Phase 1: 트랙 생성 (순차) ────────────────────────────
    await updateJob(id, { status: 'generating' });
    log('INFO', `트랙 생성 시작 (${USE_MOCK ? 'MOCK' : 'REAL'} 모드)`);

    const audioPaths = [];
    for (let i = 0; i < track_count; i++) {
      const trackUrl = await generateTrack(prompt, i);
      const trackPath = path.join(tmpDir, `track_${String(i).padStart(2, '0')}.mp3`);
      await downloadAudio(trackUrl, trackPath);
      audioPaths.push(trackPath);
      log('PROC', `트랙 ${i + 1}/${track_count} 완료`);
    }

    // ─ Phase 2: FFmpeg 병합 ──────────────────────────────────
    await updateJob(id, { status: 'stitching' });
    log('INFO', 'FFmpeg 오디오 병합 시작...');
    const stitchedPath = path.join(tmpDir, 'output-loop.mp3');
    await stitchAudio(audioPaths, stitchedPath);
    log('INFO', '오디오 병합 완료');

    // ─ Phase 3: 커버 이미지 준비 ────────────────────────────
    const coverPath = await prepareCoverImage(cover_image_url, tmpDir);

    // ─ Phase 4: MP4 생성 ────────────────────────────────────
    log('INFO', 'MP4 렌더링 시작...');
    const mp4Path = path.join(tmpDir, 'output-loop.mp4');
    await createMp4(stitchedPath, coverPath, mp4Path);
    log('INFO', 'MP4 렌더링 완료');

    // ─ Phase 5: Storage 업로드 ──────────────────────────────
    log('INFO', 'Supabase Storage 업로드 중...');
    const [audioUrl, mp4Url] = await Promise.all([
      uploadToStorage(stitchedPath, `b2b_loops/${id}/loop.mp3`, 'audio/mpeg'),
      uploadToStorage(mp4Path, `b2b_loops/${id}/loop.mp4`, 'video/mp4'),
    ]);

    // ─ Phase 6: 완료 ────────────────────────────────────────
    await updateJob(id, {
      status: 'completed',
      output_audio_url: audioUrl,
      output_mp4_url: mp4Url,
    });
    log('INFO', `B2B 잡 완료 — id=${id}`, { audioUrl, mp4Url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', `B2B 잡 실패 — id=${id}`, { msg });
    await updateJob(id, { status: 'failed', error_message: msg });
  } finally {
    // 임시 파일 정리
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Realtime 구독 ─────────────────────────────────────────────
let isProcessing = false;

function subscribeToB2BLoops() {
  log('INFO', `B2B Loop 워커 시작 (Mock=${USE_MOCK})`);

  supabase
    .channel('b2b-loops-worker')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'b2b_loops', filter: "status=eq.pending" },
      async (payload) => {
        if (isProcessing) {
          log('WARN', '이미 처리 중인 잡이 있음 — 대기 (재구독 필요)');
          return;
        }
        isProcessing = true;
        try {
          await processB2BJob(payload.new);
        } finally {
          isProcessing = false;
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') log('INFO', 'b2b_loops Realtime 구독 완료 — 이벤트 대기 중');
      if (status === 'CHANNEL_ERROR') log('ERROR', 'b2b_loops Realtime 구독 실패');
    });
}

// ─── 미처리 pending 잡 초기 스캔 ─────────────────────────────
async function scanPendingJobs() {
  const { data, error } = await supabase
    .from('b2b_loops')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    log('ERROR', '초기 스캔 실패', { msg: error.message });
    return;
  }
  if (data && data.length > 0) {
    log('INFO', `미처리 pending 잡 ${data.length}개 발견 — 즉시 처리`);
    isProcessing = true;
    await processB2BJob(data[0]).finally(() => { isProcessing = false; });
  }
}

// ─── 진입점 ────────────────────────────────────────────────────
(async () => {
  subscribeToB2BLoops();
  await scanPendingJobs();
})();

module.exports = { processB2BJob };
