import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegStatic from 'ffmpeg-static';
import { planFit, buildFitCommand, probeDurationSeconds } from '@/lib/video/fitVideoToAudio';

const execAsync = promisify(exec);

export const maxDuration = 120; // Allow long polling up to 2 mins on Vercel

async function generateGrokClip(
  promptText: string,
  apiKey: string,
  apiBase: string,
  allowDance: boolean
): Promise<string> {
  const outputRequirements = `Output Requirements: - Silent video only - No audio track - No music - No dialogue - No narration - No sound effects - Visual output only`;
  // 춤 금지는 카테고리별로 판단한다. '도파민 응원'이나 '트렌드·이슈'처럼
  // 챌린지 안무가 콘텐츠의 핵심인 카테고리에서 전역 금지는 오히려 해가 된다.
  const motionRule = allowDance
    ? `MOTION DIRECTIVE: ENERGETIC CHALLENGE-STYLE BODY MOVEMENT AND SIMPLE REPEATABLE GESTURES ARE ENCOURAGED. KEEP IT SITUATIONAL AND COMEDIC, NOT A POLISHED STAGE PERFORMANCE.`
    : `STRICT DIRECTIVE: ABSOLUTELY NO DANCING, NO STAGE DANCE, NO CHOREOGRAPHY, NO DANCERS, NO DANCE MOVES. FOCUS ON DRAMATIC STORYLINE ACTING, SITUATIONAL HUMOR, AND REALISTIC CHARACTER EMOTIONS.`;
  const cleanPrompt = `${promptText.trim()}, expert short-form comedy camera direction, rapid crash-zooms, whip-pans, fisheye angle, ${motionRule}, ${outputRequirements}`;

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

/**
 * 병합 결과.
 *
 * 예전에는 URL 만 돌려줘서, 화면이 길이를 알려면 <video> 가 메타데이터를
 * 내려받을 때까지 기다려야 했다. 여기서는 이미 ffprobe 로 정확한 초를
 * 재고 있으므로 그대로 실어 보낸다.
 */
interface MergeResult {
  url: string;
  durationSeconds: number;
}

async function mergeClipsAndAudio(
  videoUrls: string[],
  audioUrl?: string,
  reqDuration: number = 30
): Promise<MergeResult | null> {
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

    /*
     * 음원 실제 길이 측정.
     *
     * 이 값이 틀리면 뒤의 모든 계산이 틀어진다. 예전에는 여기서 존재하지 않는
     * ffprobe 를 호출해 늘 실패했고, 조용히 기본값 30초로 넘어갔다. 그래서
     * 34초 음원이 30초에서 잘렸다. probeDurationSeconds 는 ffprobe 가 없으면
     * ffmpeg 로 잰다.
     */
    if (audioFile && fs.existsSync(audioFile)) {
      const measured = await probeDurationSeconds(ffmpegCmd, audioFile);
      if (measured !== null) {
        targetDurationSec = Math.round(measured * 10) / 10;
        console.log(`[API/grok-video/ffmpeg] Detected Melodio song audio duration: ${targetDurationSec}s (Full UNCUT Audio Matching)`);
      } else {
        console.warn(`[API/grok-video/ffmpeg] 음원 길이 측정 실패 — 기본값 ${targetDurationSec}s 사용 (마지막 소절이 잘릴 수 있음)`);
      }
    }

    const concatVideoFile = path.join(tmpDir, `grok_concat_${timestamp}.mp4`);
    const finalOutputFile = path.join(tmpDir, `grok_final_${timestamp}.mp4`);

    /*
     * 원본 Grok 오디오 제거(-an) + 음원 길이에 맞춰 영상 채우기.
     *
     * 2클립 concat 은 소스가 30초(15초 × 2)뿐이라 -t 를 크게 줘도 늘어나지 않는다.
     * 34초 음원에 30초 영상이 붙고 -shortest 로 묶이면서 마지막 소절이 잘렸다.
     * 남는 구간을 어떻게 채울지는 planFit 이 정한다(기본: 마지막 프레임 고정).
     */
    let sourceVideoFile: string;
    let cleanupConcat: string | null = null;

    if (videoFiles.length > 1) {
      const rawConcatFile = path.join(tmpDir, `grok_concat_raw_${timestamp}.mp4`);
      const inputs = videoFiles.map(f => `-i "${f}"`).join(' ');
      const filter = videoFiles.map((_, idx) => `[${idx}:v]`).join('') + `concat=n=${videoFiles.length}:v=1:a=0[v]`;
      const concatCmd = `${ffmpegCmd} -y ${inputs} -filter_complex "${filter}" -map "[v]" -an -c:v libx264 -preset fast -crf 22 "${rawConcatFile}"`;
      console.log(`[API/grok-video/ffmpeg] Concat clips (-an SILENT): ${concatCmd}`);
      await execAsync(concatCmd);
      sourceVideoFile = rawConcatFile;
      cleanupConcat = rawConcatFile;
    } else {
      sourceVideoFile = videoFiles[0];
    }

    const plan = planFit(await probeDurationSeconds(ffmpegCmd, sourceVideoFile), targetDurationSec);
    console.log(`[API/grok-video/ffmpeg] ${plan.reason}`);
    await execAsync(
      buildFitCommand({
        ffmpegCmd,
        inputFile: sourceVideoFile,
        outputFile: concatVideoFile,
        targetSeconds: targetDurationSec,
        plan,
      })
    );
    if (cleanupConcat) await fs.promises.unlink(cleanupConcat).catch(() => {});

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

    console.log(`[API/grok-video/supabase] Merged ${targetDurationSec}s MP4 uploaded successfully: ${publicUrl}`);
    return { url: publicUrl, durationSeconds: targetDurationSec };
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
          return {
            url: data.mergedVideoUrl,
            durationSeconds: Number(data.durationSeconds) || 0,
          };
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
    const {
      prompt,
      audioUrl,
      generate30SecFull = true,
      // 카테고리를 받아 연출을 결정한다. 기존에는 이 값이 없어서 모든 카테고리에
      // 'butler / pet reaction' 연출이 하드코딩으로 주입됐다.
      category,
      allowDance = false,
      cutCadenceSeconds = 1.5,
    } = body as {
      prompt?: string;
      audioUrl?: string;
      generate30SecFull?: boolean;
      category?: string;
      allowDance?: boolean;
      cutCadenceSeconds?: number;
    };

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
      const continuityDirective = `CHARACTER CONSISTENCY DIRECTIVE: MAINTAIN THE EXACT SAME SUBJECT APPEARANCE, WARDROBE, SUPPORTING ACTOR, AND SET DECOR FOR 1:1 VISUAL SCENE CONTINUITY.`;

      // 컷 밀도는 클립 수를 늘리지 않고 클립 내부 하드컷 지시로 확보한다.
      // 15초 클립 × 1.5초 케이던스 = 클립당 10컷, 30초 영상에 총 20컷.
      const CLIP_SECONDS = 15;
      const cutsPerClip = Math.max(2, Math.round(CLIP_SECONDS / cutCadenceSeconds));
      const cutDirective = `EDITING RHYTHM: ${cutsPerClip} DISTINCT HARD CUTS ACROSS THIS ${CLIP_SECONDS}-SECOND CLIP, A NEW CAMERA ANGLE EVERY ${cutCadenceSeconds} SECONDS. RAPID WHIP-PAN AND CRASH-ZOOM TRANSITIONS BETWEEN CUTS. NEVER HOLD A SINGLE STATIC SHOT LONGER THAN ${cutCadenceSeconds} SECONDS.`;

      // 전반부/후반부 연출은 카테고리 중립적으로 기술한다.
      // (기존에는 'frantic butler interaction', 'pet reaction'이 하드코딩돼
      //  K-드라마·역사 부캐 영상에도 집사와 반려동물 연출이 주입됐다.)
      const comicCam1 = `CAMERAWORK: Dynamic whip-pan entrance, 0.5x ultra-wide fisheye angle, rapid crash-zoom onto the protagonist's comedic facial expression as the situation is set up.`;
      const comicCam2 = `CAMERAWORK: High-dopamine climax, Dutch-angle snap zooms, slow-mo spin cuts, the protagonist's most exaggerated reaction of the whole skit.`;

      const promptPart1 = `${prompt}\n(Part 1 - Hook & Setup: ${comicCam1} ${cutDirective} ${continuityDirective} ${noTextRule})`;
      const promptPart2 = `${prompt}\n(Part 2 - Hook Repeat & Climax: ${comicCam2} ${cutDirective} ${continuityDirective} ${noTextRule})`;

      let videoUrl1: string | null = null;
      let videoUrl2: string | null = null;

      try {
        console.log(
          `[API/grok-video] Rendering 2 clips in PARALLEL (category=${category ?? 'n/a'}, ${cutsPerClip} cuts/clip @ ${cutCadenceSeconds}s, allowDance=${allowDance})...`
        );
        const [result1, result2] = await Promise.allSettled([
          generateGrokClip(promptPart1, xaiApiKey, apiBase, allowDance),
          generateGrokClip(promptPart2, xaiApiKey, apiBase, allowDance)
        ]);

        if (result1.status === 'fulfilled') videoUrl1 = result1.value;
        else console.warn('[API/grok-video] Clip 1 (Verse) failed:', result1.reason?.message);

        if (result2.status === 'fulfilled') videoUrl2 = result2.value;
        else console.warn('[API/grok-video] Clip 2 (Chorus) failed:', result2.reason?.message);
      } catch (e: any) {
        console.error('[API/grok-video] Parallel clip generation error:', e.message);
      }

      if (!videoUrl1 && !videoUrl2) {
        videoUrl1 = await generateGrokClip(prompt, xaiApiKey, apiBase, allowDance);
      }

      const activeClips = [videoUrl1, videoUrl2].filter(Boolean) as string[];
      console.log(`[API/grok-video] Finished distinct clips (${activeClips.length}). Merging 30s clips & audio...`);

      let merged = await mergeClipsAndAudio(activeClips, audioUrl);

      // 🚨 FFmpeg 결합 실패 시 Melodio 맥미니 서버에 결합 강제 요청
      if (!merged && activeClips.length > 0) {
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
              merged = {
                url: proxyData.mergedVideoUrl,
                durationSeconds: Number(proxyData.durationSeconds) || 0,
              };
            }
          }
        } catch (proxyErr: any) {
          console.error('[API/grok-video] Proxy merge call error:', proxyErr.message);
        }
      }

      if (!merged) {
        throw new Error('비디오 결합 및 음원 인코딩에 실패했습니다. 맥미니 서버 상태를 확인해주세요.');
      }

      return NextResponse.json({
        success: true,
        videoUrl: merged.url,
        // 화면이 <video> 메타데이터를 기다리지 않고 바로 길이를 표시할 수 있게 한다.
        durationSeconds: merged.durationSeconds,
        clips: activeClips,
        is30SecFull: activeClips.length > 1,
        message: `${merged.durationSeconds}초 숏폼 MP4 (영상 결합 + 멜로디오 음원 매핑) 생성이 완료되었습니다!`
      });
    } else {
      console.log(`[API/grok-video] Generating single 15-sec Grok AI video clip...`);
      const singleUrl = await generateGrokClip(prompt, xaiApiKey, apiBase, allowDance);
      const merged = await mergeClipsAndAudio([singleUrl], audioUrl);
      const finalUrl = merged?.url || singleUrl;

      return NextResponse.json({
        success: true,
        videoUrl: finalUrl,
        // 병합에 실패해 원본 클립을 그대로 쓰는 경우 길이를 알 수 없다(0 = 미측정).
        durationSeconds: merged?.durationSeconds ?? 0,
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
