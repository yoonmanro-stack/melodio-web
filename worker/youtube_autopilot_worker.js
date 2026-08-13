/**
 * Melodio YouTube Auto-Pilot Background Worker
 * 
 * 동작 원리:
 * 1. 1분마다 youtube_automations 테이블 중 활성화(is_active=true)된 항목을 스캔합니다.
 * 2. 현재 요일/시간과 매칭되고, 최근 1시간 이내에 동일 작업이 실행된 적이 없을 때 트리거됩니다.
 * 3. 15곡의 음악 생성 (MOCK 모드 시 더미 MP3 파일 생성, REAL 모드 시 Suno API 호출)
 * 4. 각 곡의 실제 길이(Duration)를 ffprobe로 추출하여 동적 유튜브 타임코드 목록 생성.
 * 5. 10초 루프 비디오를 오디오 전체 길이에 맞게 무한 루핑 합성 (FFmpeg 인코딩)
 * 6. 연동된 유튜브 채널의 refresh_token을 디크립트하여 유튜브 API 업로드 (videos.insert) 실행.
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');
const { exec } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// 환경변수 로드 (웹앱의 설정 재이용)
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '../melodio-web/.env.local') });

const NEXT_API_BASE = process.env.MELODIO_API_BASE || 'http://localhost:3001';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const MOCK_MODE = process.env.MOCK_MODE !== 'false'; // 기본적으로 Mock 모드로 안전하게 동작

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[AUTOPILOT][FATAL] Supabase URL 또는 Service Role Key가 누락되었습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 복호화 헬퍼 (웹앱의 암호화 방식과 대칭)
const ENCRYPTION_KEY = (YOUTUBE_CLIENT_SECRET || 'fallback-secret-key-32-chars-long-!!').slice(0, 32).padEnd(32, '0');

function decrypt(text) {
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('[AUTOPILOT][DECRYPT_ERROR] 복호화 실패:', err.message);
    throw new Error('유튜브 토큰 복호화 실패');
  }
}

// 오디오 길이 추출 (ffprobe 이용)
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    if (MOCK_MODE) {
      // Mock 모드 시 2분 30초 ~ 3분 30초 랜덤 반환
      const randSec = Math.floor(Math.random() * 60) + 150;
      return resolve(randSec);
    }
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
    exec(cmd, (error, stdout) => {
      if (error) return reject(error);
      resolve(parseFloat(stdout.trim()));
    });
  });
}

// 파일 다운로드 헬퍼
async function downloadAudio(url, destPath) {
  const resp = await axios.get(url, { responseType: 'stream', timeout: 60000 });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    resp.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// 초 단위 ➡️ HH:MM:SS / MM:SS 포맷터
function formatTimecode(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

// 유튜브 Access Token 리프레시
async function refreshAccessToken(encryptedRefreshToken) {
  const refreshToken = decrypt(encryptedRefreshToken);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Access Token 갱신 실패: ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

// 유튜브 비디오 업로드 (Resumable Upload 방식 빌딩)
async function uploadToYoutube(accessToken, videoPath, metadata) {
  if (MOCK_MODE) {
    console.log('[AUTOPILOT][MOCK] 유튜브 업로드 시뮬레이션 완료. Video ID: mock_video_id_123');
    return 'mock_video_id_123';
  }

  // 1. Resumable Upload 세션 시작
  const initiateUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
  const initiateRes = await fetch(initiateUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(fs.statSync(videoPath).size),
      'X-Upload-Content-Type': 'video/*',
    },
    body: JSON.stringify({
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags || [],
        categoryId: '10', // Music 카테고리 고정
      },
      status: {
        privacyStatus: 'public', // 공개 업로드
        selfDeclaredMadeForKids: false,
      }
    })
  });

  if (!initiateRes.ok) {
    const errText = await initiateRes.text();
    throw new Error(`유튜브 업로드 세션 생성 실패: ${errText}`);
  }

  const uploadUrl = initiateRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('유튜브 업로드 세션 Location 헤더가 존재하지 않습니다.');
  }

  // 2. 비디오 바이너리 스트림 전송
  const videoStream = fs.createReadStream(videoPath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/*',
      'Content-Length': String(fs.statSync(videoPath).size),
    },
    body: videoStream,
    duplex: 'half'
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`유튜브 비디오 전송 실패: ${errText}`);
  }

  const data = await uploadRes.json();
  return data.id; // YouTube Video ID 반환
}

// 메인 태스크 프로세서
async function runAutopilotJob(automation) {
  const workDir = path.join(os.tmpdir(), `autopilot-job-${automation.id}`);
  fs.mkdirSync(workDir, { recursive: true });

  const logRow = {
    automation_id: automation.id,
    status: 'generating_audio',
    started_at: new Date().toISOString()
  };

  // 1. 로그 테이블에 진행 상태 추가
  const { data: logDb, error: logErr } = await supabase
    .from('youtube_automation_logs')
    .insert(logRow)
    .select()
    .single();

  if (logErr) {
    console.error('[AUTOPILOT] 로그 추가 실패:', logErr.message);
    return;
  }

  const logId = logDb.id;
  console.log(`[AUTOPILOT][JOB] 시작 | Automation ID: ${automation.id} | Log ID: ${logId}`);

  try {
    // DB에서 프리셋 세부 정보 로드
    let presetName = 'Premium Lofi';
    let playbookTags = 'lofi, smooth, study beats';
    const brandingMetadata = automation.branding_metadata || {};

    try {
      const { data: pb } = await supabase
        .from('curation_playbooks')
        .select('title, metadata')
        .eq('key_name', automation.audio_preset_id)
        .maybeSingle();
      if (pb) {
        presetName = pb.title;
        playbookTags = pb.metadata?.suno_tags || playbookTags;
      } else {
        // signature presets 매핑
        const LOCAL_PRESETS = {
          'developer-debugging': '시니어 개발자의 백엔드 디버깅 룸',
          'iced-oolong-tea': '아이스 우롱티 한 잔, 방 구석 잔잔한 여유',
          'tokyo-midnight-1984': '1984년 도쿄의 밤, 미드나잇 시티팝 드라이브',
          'matcha-kyoto-jazz': '말차 향 머문 교토 모퉁이, 잔잔한 피아노 재즈',
          'french-vintage-chanson': '촉촉한 파리 거리의 낭만, 프렌치 빈티지 샹송',
          'deep-sleep-drift': '깊은 수면 속으로의 표류, 12시간 숙면 앰비언트',
          'dead-mall-nostalgia': '1992년 버려진 쇼핑몰, 아득한 메아리의 멜랑콜리'
        };
        presetName = LOCAL_PRESETS[automation.audio_preset_id] || 'Premium Lofi';
      }
    } catch (err) {
      console.error('[AUTOPILOT][ERROR] DB 프리셋 이름 쿼리 실패:', err.message);
    }

    // 2. 음원 패키지 생성 (15곡)
    const audioFiles = [];
    const tracklistMeta = [];
    let accumulatedTime = 0;

    for (let i = 1; i <= 15; i++) {
      const trackPath = path.join(workDir, `track_${i}.mp3`);
      let trackTitle = `Acoustic Healing Symphony Vol.${i}`;

      if (MOCK_MODE) {
        // Mock 모드: 더미 MP3 파일 생성
        fs.writeFileSync(trackPath, Buffer.alloc(1024, 0xef));
      } else {
        // Real 모드: 실제 웹앱 API 호출을 통해 AI 가사/음악 생성 파이프라인 가동
        console.log(`[AUTOPILOT] 트랙 ${i}/15 생성 개시... (Preset: ${presetName})`);
        try {
          // 1단계: 가사 및 제목 생성
          const lyricsResp = await fetch(`${NEXT_API_BASE}/api/lyrics/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stylePrompt: playbookTags,
              topic: `Autopilot compilation track ${i} for preset ${presetName}`,
              language: automation.target_region === 'JP' ? 'ja' : (automation.target_region === 'EN' ? 'en' : 'ko'),
              isPlaylistMode: false,
              vocalGender: 'mixed',
              presetId: automation.audio_preset_id
            })
          });

          if (!lyricsResp.ok) {
            throw new Error(`Lyrics API responded with status ${lyricsResp.status}`);
          }
          const lyricsData = await lyricsResp.json();
          trackTitle = lyricsData.title || trackTitle;

          // 2단계: Suno 음원 생성 요청
          const genResp = await fetch(`${NEXT_API_BASE}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stylePrompt: playbookTags,
              title: trackTitle,
              lyricsPrompt: lyricsData.sections ? lyricsData.sections.map(s => `[${s.type}]\n${s.content}`).join('\n\n') : '',
              engine: 'suno_v5',
              sunoVersion: 'v5.5',
              presetId: automation.audio_preset_id
            })
          });

          if (!genResp.ok) {
            throw new Error(`Generate API responded with status ${genResp.status}`);
          }
          const genData = await genResp.json();
          const trackId = genData.id;

          // 3단계: 생성 상태 폴링
          console.log(`[AUTOPILOT] 트랙 ${i} (ID: ${trackId}) 폴링 시작...`);
          let audioUrl = null;
          for (let attempt = 0; attempt < 60; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            const { data: row } = await supabase
              .from('generations')
              .select('audio_url, status')
              .eq('id', trackId)
              .single();

            if (row?.status === 'completed' && row.audio_url) {
              audioUrl = row.audio_url;
              break;
            }
            if (row?.status === 'failed') {
              throw new Error('Suno generation status is failed.');
            }
          }

          if (!audioUrl) {
            throw new Error('Suno generation timed out (5 minutes).');
          }

          // 4단계: 완성 음원 로컬 다운로드
          console.log(`[AUTOPILOT] 트랙 ${i} 다운로드 중: ${audioUrl}`);
          await downloadAudio(audioUrl, trackPath);
          console.log(`[AUTOPILOT] 트랙 ${i} 다운로드 완료.`);
        } catch (err) {
          console.error(`[AUTOPILOT][ERROR] 트랙 ${i} 생성 실패. 더미 음원으로 대체합니다:`, err.message);
          // 실패 시 중단 방지용 10초 무음/더미 파일 생성
          fs.writeFileSync(trackPath, Buffer.alloc(1024, 0xef));
        }
      }

      const duration = await getAudioDuration(trackPath);
      const startTimecode = formatTimecode(accumulatedTime);
      
      tracklistMeta.push(`${startTimecode} - ${trackTitle}`);
      accumulatedTime += duration;
      audioFiles.push(trackPath);
    }

    // 3. 비디오 렌더링 파이프라인 (FFmpeg 스티칭)
    await supabase.from('youtube_automation_logs').update({ status: 'rendering_video' }).eq('id', logId);
    
    const outputVideoPath = path.join(workDir, 'output_final.mp4');
    const dummyLoopVideo = path.join(workDir, 'loop.mp4');
    const backgroundPath = path.join(workDir, 'background.png');

    let hasBgImage = false;
    if (brandingMetadata.thumbnailUrl) {
      try {
        console.log(`[AUTOPILOT] 배경 이미지 다운로드 중: ${brandingMetadata.thumbnailUrl}`);
        await downloadAudio(brandingMetadata.thumbnailUrl, backgroundPath);
        hasBgImage = true;
      } catch (err) {
        console.warn('[AUTOPILOT][WARN] 배경 이미지 다운로드 실패. 단색 배경으로 폴백:', err.message);
      }
    }

    // 비디오 루프 및 인코딩 시뮬레이션
    if (MOCK_MODE) {
      fs.writeFileSync(outputVideoPath, Buffer.alloc(4096, 0x12));
    } else {
      // Concat 오디오 리스트 빌드 및 머지
      const concatListPath = path.join(workDir, 'concat_list.txt');
      const listContent = audioFiles.map(f => `file '${f}'`).join('\n');
      fs.writeFileSync(concatListPath, listContent);

      const mergedAudioPath = path.join(workDir, 'merged_audio.mp3');
      await new Promise((resolve, reject) => {
        exec(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${mergedAudioPath}"`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      if (hasBgImage) {
        // 1단계: 스틸 이미지 기반의 고품질 MP4 인코딩 실행
        console.log('[AUTOPILOT] 스틸 이미지 기반 고화질 MP4 렌더링 중...');
        await new Promise((resolve, reject) => {
          exec(`ffmpeg -y -loop 1 -i "${backgroundPath}" -i "${mergedAudioPath}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${outputVideoPath}"`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      } else {
        // 단색 흑색 배경 폴백 비디오 생성
        await new Promise((resolve, reject) => {
          exec(`ffmpeg -y -f lavfi -i color=c=black:s=1280x720:d=10 -c:v libx264 "${dummyLoopVideo}"`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        // 영상 루핑 합성
        await new Promise((resolve, reject) => {
          exec(`ffmpeg -y -stream_loop -1 -i "${dummyLoopVideo}" -i "${mergedAudioPath}" -shortest -c:v libx264 -c:a aac -b:a 192k -pix_fmt yuv420p "${outputVideoPath}"`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      }
    }

    // 4. 유튜브 설명란 및 메타데이터 조립 (타겟 국가별 로컬라이징)
    let title = '';
    let description = '';
    let tags = [];

    const monetizationSection = automation.monetization_links?.length > 0
      ? `\n\n[🎁 추천 쇼핑 & 할인 링크 / Links]\n${automation.monetization_links.join('\n')}`
      : '';

    if (automation.target_region === 'JP') {
      title = `【作業用BGM】${presetName} ｜ 心地よいリラックスメロディー ｜ Autopilot 24/7`;
      description = `🎧 Tracklist:\n${tracklistMeta.join('\n')}${monetizationSection}\n\n*このプレイリストはMelodio AIオートパイロットエンジンによって100%自動生成およびアップロードされました。`;
      tags = ['作業用BGM', '勉強用BGM', '睡眠用BGM', 'lofi', 'playlist', presetName];
    } else if (automation.target_region === 'EN') {
      title = `[Cozy Lofi BGM] ${presetName} ｜ Calm Chill beats for study & coding ｜ Autopilot 24/7`;
      description = `🎧 Tracklist:\n${tracklistMeta.join('\n')}${monetizationSection}\n\n*This playlist was fully generated and uploaded by the Melodio AI Autopilot engine.`;
      tags = ['lofi', 'bgm', 'studybeats', 'playlist', presetName];
    } else {
      // KR (기본값)
      title = `[감성 BGM] ${presetName} ｜ 공부할 때, 잠들기 전 듣는 자율운영 플레이리스트`;
      description = `🎧 Tracklist:\n${tracklistMeta.join('\n')}${monetizationSection}\n\n*이 플레이리스트는 Melodio AI 오토파일럿 엔진에 의해 100% 자율 제작 및 자동 업로드되었습니다.`;
      tags = ['lofi', 'bgm', '플레이리스트', presetName];
    }

    // 5. 유튜브 API 업로드 기동
    await supabase.from('youtube_automation_logs').update({ status: 'uploading' }).eq('id', logId);

    // OAuth Access Token 획득
    const { data: channelData } = await supabase
      .from('youtube_channels')
      .select('refresh_token')
      .eq('channel_id', automation.channel_id)
      .single();

    if (!channelData) throw new Error('채널 크레덴셜이 유효하지 않습니다.');

    const accessToken = await refreshAccessToken(channelData.refresh_token);
    const youtubeVideoId = await uploadToYoutube(accessToken, outputVideoPath, {
      title,
      description,
      tags
    });

    // 6. 성공 완료 처리
    await supabase.from('youtube_automation_logs').update({
      status: 'success',
      youtube_video_id: youtubeVideoId,
      completed_at: new Date().toISOString()
    }).eq('id', logId);

    console.log(`[AUTOPILOT][JOB] 성공 완료 ✔ Video ID: ${youtubeVideoId}`);

  } catch (err) {
    console.error('[AUTOPILOT][JOB] 실패:', err.message);
    await supabase.from('youtube_automation_logs').update({
      status: 'failed',
      error_message: err.message,
      completed_at: new Date().toISOString()
    }).eq('id', logId);
  } finally {
    // 임시 디렉토리 정리
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('임시 디렉토리 클린업 실패:', e.message);
    }
  }
}

// 요일 문자열 변환
function getCurrentDayString(date) {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return days[date.getDay()];
}

// 스케줄러 메인 루프
async function tick() {
  const now = new Date();
  const currentDay = getCurrentDayString(now);
  const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  console.log(`[AUTOPILOT][TICK] 스캔 시작 | 요일: ${currentDay} | 시간: ${currentHourMin}`);

  try {
    // 활성화된 모든 오토파일럿 목록 조회
    const { data: automations, error } = await supabase
      .from('youtube_automations')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    if (!automations || automations.length === 0) return;

    for (const auto of automations) {
      // 요일 및 시간 조건 검증
      const dayMatches = auto.upload_days.includes(currentDay);
      const autoTime = auto.upload_time.slice(0, 5); // '21:00'
      const timeMatches = autoTime === currentHourMin;

      if (dayMatches && timeMatches) {
        // 중복 실행 방지: 최근 1시간 이내에 이미 실행 중이거나 성공한 동일 로그가 있는지 체크
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const { data: recentLogs } = await supabase
          .from('youtube_automation_logs')
          .select('id')
          .eq('automation_id', auto.id)
          .gt('started_at', oneHourAgo)
          .limit(1);

        if (recentLogs && recentLogs.length > 0) {
          console.log(`[AUTOPILOT] 최근 1시간 이내 실행 이력 존재 (중복 차단): Automation ID ${auto.id}`);
          continue;
        }

        // 작업 실행 (백그라운드 비동기 기동)
        runAutopilotJob(auto);
      }
    }
  } catch (err) {
    console.error('[AUTOPILOT][TICK_ERROR] 루프 에러:', err.message);
  }
}

// 1분 마다 동작하는 스케줄러 기동
console.log('[AUTOPILOT] 자율주행 스케줄러 데몬 시작 (매 60초 폴링)');
tick();
setInterval(tick, 60000);
