import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegStatic from 'ffmpeg-static';

const execAsync = promisify(exec);

export const maxDuration = 120; // Allow long polling up to 2 mins on Vercel

async function generateGrokClip(promptText: string, apiKey: string, apiBase: string): Promise<string> {
  const outputRequirements = `Output Requirements: - Silent video only - No audio track - No music - No dialogue - No narration - No sound effects - Visual output only`;
  const noDanceRule = `STRICT DIRECTIVE: ABSOLUTELY NO DANCING, NO STAGE DANCE, NO CHOREOGRAPHY, NO DANCERS, NO DANCE MOVES. FOCUS ON DRAMATIC STORYLINE ACTING, SITUATIONAL HUMOR, AND REALISTIC CHARACTER EMOTIONS.`;
  const cleanPrompt = `${promptText.trim()}, expert B-grade comedy camera direction, rapid crash-zooms, whip-pans, fisheye angle, ${noDanceRule}, ${outputRequirements}`;
  
  const initRes = await fetch(`${apiBase}/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: 'grok-imagine-video',
      prompt: cleanPrompt,
      duration: 15,
      aspect_ratio: '9:16',
      watermark: false,
      silent: true,
      audio: false,
      sound: false,
      voice: false
    })
  });

  const initText = await initRes.text();
  if (!initRes.ok) {
    throw new Error(`xAI Grok 비디오 요청 실패 (${initRes.status}): ${initText}`);
  }

  let initData: any;
  try {
    initData = JSON.parse(initText);
  } catch (parseErr) {
    throw new Error(`xAI Grok API가 유효하지 않은 응답을 반환했습니다 (JSON 파싱 실패): ${initText.slice(0, 100)}`);
  }
  const requestId = initData.request_id || initData.id || initData.task_id;
  if (!requestId) {
    const directUrl = initData.video?.url || initData.data?.[0]?.url || initData.url;
    if (directUrl) return directUrl;
    throw new Error('request_id 수신 실패');
  }

  console.log(`[API/grok-video] Started clip task: ${requestId}. Fast polling every 2s...`);

  const maxPollAttempts = 40; // 1클립만 생성: 40회 × 2초 = 80초 (Vercel 120초 내 충분)
  let lastData: any = null;

  for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, attempt <= 5 ? 1500 : 2000));
    
    try {
      const pollRes = await fetch(`${apiBase}/videos/${requestId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
      });

      if (!pollRes.ok) continue;

      let pollData: any;
      try {
        const pollText = await pollRes.text();
        pollData = JSON.parse(pollText);
      } catch {
        console.warn(`[API/grok-video] Poll #${attempt}: non-JSON response, skipping`);
        continue;
      }
      lastData = pollData;
      console.log(`[API/grok-video] Task ${requestId} #${attempt}: status=${pollData.status || pollData.state}, progress=${pollData.progress || 0}%`);

      const videoUrl = pollData.video?.url || pollData.url || pollData.data?.[0]?.url || pollData.result?.url;

      if (pollData.status === 'done' || pollData.status === 'completed' || pollData.status === 'succeeded' || pollData.state === 'completed') {
        if (videoUrl) return videoUrl;
      }

      if (videoUrl && attempt > 8) {
        return videoUrl;
      }

      if (pollData.status === 'failed' || pollData.status === 'error') {
        throw new Error(pollData.error || pollData.message || 'Grok 비디오 생성 작업 실패');
      }
    } catch (e: any) {
      if (e.message?.includes('실패')) throw e;
    }
  }

  if (lastData && (lastData.video?.url || lastData.url || lastData.data?.[0]?.url)) {
    return lastData.video?.url || lastData.url || lastData.data[0].url;
  }

  throw new Error('Grok AI 비디오 서버 응답이 지연되었습니다. 잠시 후 다시 시도해 주세요.');
}

async function mergeClipsAndAudio(videoUrls: string[], audioUrl?: string, reqDuration: number = 30): Promise<string | null> {
  if (!videoUrls || videoUrls.length === 0) return null;
  try {
    const tmpDir = os.tmpdir();
    const videoFiles: string[] = [];
    const timestamp = Date.now();

    console.log(`[API/grok-video/ffmpeg] Downloading ${videoUrls.length} video clips for concatenation...`);
    for (let i = 0; i < videoUrls.length; i++) {
      if (!videoUrls[i]) continue;
      const res = await fetch(videoUrls[i]);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const vFile = path.join(tmpDir, `grok_clip_${timestamp}_${i}.mp4`);
      await fs.promises.writeFile(vFile, buf);
      videoFiles.push(vFile);
    }

    if (videoFiles.length === 0) return null;

    let audioFile: string | null = null;
    let targetDurationSec = reqDuration || 30;

    if (audioUrl) {
      const aRes = await fetch(audioUrl);
      if (aRes.ok) {
        audioFile = path.join(tmpDir, `grok_a_${timestamp}.mp3`);
        const aBuf = Buffer.from(await aRes.arrayBuffer());
        await fs.promises.writeFile(audioFile, aBuf);
      }
    }

    let ffmpegCmd = 'ffmpeg';
    try {
      if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        ffmpegCmd = ffmpegStatic;
      } else if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
        ffmpegCmd = '/opt/homebrew/bin/ffmpeg';
      } else if (fs.existsSync('/usr/bin/ffmpeg')) {
        ffmpegCmd = '/usr/bin/ffmpeg';
      } else if (fs.existsSync('/usr/local/bin/ffmpeg')) {
        ffmpegCmd = '/usr/local/bin/ffmpeg';
      }
    } catch {}

    // 동적 음원 재생 시간 프로브 (FFprobe 탐색)
    if (audioFile && fs.existsSync(audioFile)) {
      try {
        const ffprobeCmd = ffmpegCmd.replace(/ffmpeg$/i, 'ffprobe');
        const { stdout } = await execAsync(`"${ffprobeCmd}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`);
        const parsedSec = parseFloat(stdout.trim());
        if (!isNaN(parsedSec) && parsedSec > 0) {
          targetDurationSec = Math.round(parsedSec * 10) / 10;
          console.log(`[API/grok-video/ffmpeg] Detected Melodio song audio duration: ${targetDurationSec}s`);
        }
      } catch (e) {
        console.warn(`[API/grok-video/ffmpeg] FFprobe probe failed, using fallback duration ${targetDurationSec}s`);
      }
    }

    const concatVideoFile = path.join(tmpDir, `grok_concat_${timestamp}.mp4`);
    const finalOutputFile = path.join(tmpDir, `grok_final_${timestamp}.mp4`);

    // 🚨 원본 Grok 비디오 오디오 100% 제거 (-an) + 음원 실제 길이에 맞춘 심리스 무한 루프 (-stream_loop -1)
    if (videoFiles.length > 1) {
      const inputs = videoFiles.map(f => `-i "${f}"`).join(' ');
      const filter = videoFiles.map((_, idx) => `[${idx}:v]`).join('') + `concat=n=${videoFiles.length}:v=1:a=0[v]`;
      const concatCmd = `${ffmpegCmd} -y ${inputs} -filter_complex "${filter}" -map "[v]" -an -t ${targetDurationSec} -c:v libx264 -preset fast -crf 22 "${concatVideoFile}"`;
      console.log(`[API/grok-video/ffmpeg] Concat clips (-an SILENT trimmed to ${targetDurationSec}s): ${concatCmd}`);
      await execAsync(concatCmd);
    } else {
      const singleCmd = `${ffmpegCmd} -y -stream_loop -1 -i "${videoFiles[0]}" -an -t ${targetDurationSec} -c:v libx264 -preset fast -crf 22 "${concatVideoFile}"`;
      console.log(`[API/grok-video/ffmpeg] Single clip (-an SILENT ${targetDurationSec}s looped trim): ${singleCmd}`);
      await execAsync(singleCmd);
    }

    if (audioFile && fs.existsSync(audioFile)) {
      // 멜로디오 음원 오디오 1:1 무손실 Muxing (-shortest 로 음원 마감 프레임에 깔끔 트림)
      const muxCmd = `${ffmpegCmd} -y -i "${concatVideoFile}" -i "${audioFile}" -t ${targetDurationSec} -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${finalOutputFile}"`;
      console.log(`[API/grok-video/ffmpeg] Muxing Melodio audio into pure silent video (Exact ${targetDurationSec}s): ${muxCmd}`);
      await execAsync(muxCmd);
    } else {
      await fs.promises.copyFile(concatVideoFile, finalOutputFile);
    }

    if (!fs.existsSync(finalOutputFile)) return null;

    const finalBuffer = await fs.promises.readFile(finalOutputFile);

    try {
      for (const f of videoFiles) await fs.promises.unlink(f).catch(() => {});
      if (audioFile) await fs.promises.unlink(audioFile).catch(() => {});
      await fs.promises.unlink(concatVideoFile).catch(() => {});
      await fs.promises.unlink(finalOutputFile).catch(() => {});
    } catch {}

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !supabaseServiceKey) return null;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const fileName = `grok_short_30s_${Date.now()}.mp4`;
    const filePath = `viral_shorts/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('melodio-assets')
      .upload(filePath, finalBuffer, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) {
      console.error('[API/grok-video/supabase] Upload error:', uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('melodio-assets')
      .getPublicUrl(filePath);

    console.log(`[API/grok-video/supabase] Single unified 29.5s MP4 uploaded successfully: ${publicUrl}`);
    return publicUrl;
  } catch (err: any) {
    console.error('[API/grok-video/ffmpeg] Local merge failed, delegating to Mac Mini server proxy:', err.message);
    try {
      const macMiniRes = await fetch('https://hivedesk-app.hivedesk.ai/api/viral-cf/grok-video/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrls, audioUrl })
      });
      if (macMiniRes.ok) {
        const data = await macMiniRes.json();
        if (data.success && data.mergedVideoUrl) {
          console.log('[API/grok-video/ffmpeg] Proxy merge succeeded via Mac Mini:', data.mergedVideoUrl);
          return data.mergedVideoUrl;
        }
      }
    } catch (proxyErr: any) {
      console.error('[API/grok-video/ffmpeg] Proxy merge exception:', proxyErr.message);
    }
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const xaiApiKey = process.env.XAI_API_KEY;
    if (!xaiApiKey || xaiApiKey.includes('여기에') || xaiApiKey.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'XAI_API_KEY가 설정되지 않았습니다. .env.local을 확인해 주세요.' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { prompt, audioUrl, duration = 30, aspectRatio = '9:16', generate30SecFull = true } = body;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'prompt 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    const apiBase = process.env.XAI_API_BASE || 'https://api.x.ai/v1';

    if (generate30SecFull) {
      console.log(`[API/grok-video] Generating 30-sec full short-form video with 2 distinct Grok 15-sec clips in parallel...`);

      const noTextRule = `STRICT DIRECTIVE: ABSOLUTELY NO TEXT ON SCREEN, NO KOREAN OR ENGLISH SUBTITLES, NO TYPOGRAPHY, NO LABELS. PURE CLEAN VISUAL MOTION ONLY.`;
      const continuityDirective = `CHARACTER CONSISTENCY DIRECTIVE: MAINTAIN THE EXACT SAME ANIMAL BREED, FUR COLOURING, CLOTHING, HUMAN ACTOR, AND ROOM DECOR FOR 1:1 VISUAL SCENE CONTINUITY.`;

      // 🎬 전반부(Part 1) vs 후반부(Part 2) 서로 다른 연출 & 프롬프트 지정
      const comicCam1 = `CAMERAWORK: Dynamic whip-pan camera entrance, 0.5x ultra-wide fisheye meme angle, rapid crash-zoom to hilarious comedic facial expression and frantic butler interaction.`;
      const comicCam2 = `CAMERAWORK: Dramatic high-dopamine climax, Dutch angle snap zooms, slow-mo spin cuts, exaggerated hilarious pet reaction and butler comedy climax.`;

      const promptPart1 = `${prompt}\n(Part 1 - Verse Setup: ${comicCam1} ${continuityDirective} ${noTextRule})`;
      const promptPart2 = `${prompt}\n(Part 2 - Chorus Climax: ${comicCam2} ${continuityDirective} ${noTextRule})`;

      let videoUrl1: string | null = null;
      let videoUrl2: string | null = null;

      try {
        console.log('[API/grok-video] Rendering Clip 1 (Verse) & Clip 2 (Chorus) in PARALLEL...');
        const [result1, result2] = await Promise.allSettled([
          generateGrokClip(promptPart1, xaiApiKey, apiBase),
          generateGrokClip(promptPart2, xaiApiKey, apiBase)
        ]);

        if (result1.status === 'fulfilled') videoUrl1 = result1.value;
        else console.warn('[API/grok-video] Clip 1 (Verse) failed:', result1.reason?.message);

        if (result2.status === 'fulfilled') videoUrl2 = result2.value;
        else console.warn('[API/grok-video] Clip 2 (Chorus) failed:', result2.reason?.message);
      } catch (e: any) {
        console.error('[API/grok-video] Parallel clip generation error:', e.message);
      }

      if (!videoUrl1 && !videoUrl2) {
        videoUrl1 = await generateGrokClip(prompt, xaiApiKey, apiBase);
      }

      const activeClips = [videoUrl1, videoUrl2].filter(Boolean) as string[];
      console.log(`[API/grok-video] Finished distinct clips (${activeClips.length}). Merging 30s clips & audio...`);

      let finalUrl = await mergeClipsAndAudio(activeClips, audioUrl);
      
      // 🚨 FFmpeg 결합 실패 시 Melodio 맥미니 서버에 결합 강제 요청
      if (!finalUrl && activeClips.length > 0) {
        console.warn('[API/grok-video] Local merge failed, calling Melodio Mac Mini merge proxy directly...');
        try {
          const proxyRes = await fetch('https://hivedesk-app.hivedesk.ai/api/viral-cf/grok-video/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoUrls: activeClips, audioUrl })
          });
          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            if (proxyData.success && proxyData.mergedVideoUrl) {
              finalUrl = proxyData.mergedVideoUrl;
            }
          }
        } catch (proxyErr: any) {
          console.error('[API/grok-video] Proxy merge call error:', proxyErr.message);
        }
      }

      if (!finalUrl) {
        throw new Error('30초 비디오 결합 및 음원 인코딩에 실패했습니다. 맥미니 서버 상태를 확인해주세요.');
      }

      return NextResponse.json({
        success: true,
        videoUrl: finalUrl,
        clips: activeClips,
        is30SecFull: activeClips.length > 1,
        message: '30초 단일 풀 숏폼 MP4 비디오 (영상 결합 + 멜로디오 음원 매핑) 생성이 완료되었습니다!'
      });
    } else {
      console.log(`[API/grok-video] Generating single 15-sec Grok AI video clip...`);
      const singleUrl = await generateGrokClip(prompt, xaiApiKey, apiBase);
      const mergedUrl = await mergeClipsAndAudio([singleUrl], audioUrl);
      const finalUrl = mergedUrl || singleUrl;

      return NextResponse.json({
        success: true,
        videoUrl: finalUrl,
        clips: [finalUrl],
        is30SecFull: false,
        message: 'Grok AI 비디오 + 멜로디오 음원 결합이 완료되었습니다.'
      });
    }

  } catch (err: any) {
    console.error('[API/grok-video] Exception:', err.message);
    return NextResponse.json(
      { success: false, error: err.message || 'Grok 비디오 생성 처리 중 오류 발생' },
      { status: 500 }
    );
  }
}
