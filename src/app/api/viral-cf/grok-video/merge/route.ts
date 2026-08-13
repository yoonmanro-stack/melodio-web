import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegStatic from 'ffmpeg-static';
import { planFit, buildFitCommand, probeDurationSeconds } from '@/lib/video/fitVideoToAudio';

const execAsync = promisify(exec);

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { videoUrls, audioUrl, trackId, prompt } = body;

    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
      return NextResponse.json({ success: false, error: 'videoUrls 배열이 필요합니다.' }, { status: 400 });
    }

    const tmpDir = os.tmpdir();
    const timestamp = Date.now();
    const videoFiles: string[] = [];

    console.log(`[API/grok-video/merge] Processing merge for ${videoUrls.length} clips...`);

    for (let i = 0; i < videoUrls.length; i++) {
      if (!videoUrls[i]) continue;
      const res = await fetch(videoUrls[i]);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const vFile = path.join(tmpDir, `grok_clip_${timestamp}_${i}.mp4`);
      await fs.promises.writeFile(vFile, buf);
      videoFiles.push(vFile);
    }

    if (videoFiles.length === 0) {
      return NextResponse.json({ success: false, error: '비디오 클립 다운로드 실패' }, { status: 400 });
    }

    let audioFile: string | null = null;
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

    let targetDurationSec = body.duration || 28.5;

    /*
     * 음원 실제 길이 측정. 여기가 틀리면 뒤가 전부 틀어진다.
     * (기존에는 없는 ffprobe 를 불러 늘 실패 → 기본 28.5초로 조용히 넘어갔다.)
     */
    if (audioFile && fs.existsSync(audioFile)) {
      const measured = await probeDurationSeconds(ffmpegCmd, audioFile);
      if (measured !== null) {
        targetDurationSec = Math.round(measured * 10) / 10;
        console.log(`[API/grok-video/merge] Detected Melodio song audio duration: ${targetDurationSec}s (Full UNCUT Audio Matching)`);
      } else {
        console.warn(`[API/grok-video/merge] 음원 길이 측정 실패 — 기본값 ${targetDurationSec}s 사용 (마지막 소절이 잘릴 수 있음)`);
      }
    }

    const concatVideoFile = path.join(tmpDir, `grok_concat_${timestamp}.mp4`);
    const finalOutputFile = path.join(tmpDir, `grok_final_${timestamp}.mp4`);

    /*
     * 원본 Grok 오디오 제거(-an) + 음원 길이에 맞춰 영상 채우기.
     * 채우는 방식(마지막 프레임 고정 / 루프 / 트림)은 fitVideoToAudio 가 정한다.
     * 예전에는 이 로직이 ../route.ts 에도 복제돼 있어 한쪽만 고치면 반영이
     * 안 됐다. 지금은 공용 모듈 하나만 고치면 양쪽에 반영된다.
     */
    let sourceVideoFile: string;
    let cleanupConcat: string | null = null;

    if (videoFiles.length > 1) {
      const rawConcatFile = path.join(tmpDir, `grok_concat_raw_${timestamp}.mp4`);
      const inputs = videoFiles.map(f => `-i "${f}"`).join(' ');
      const filter = videoFiles.map((_, idx) => `[${idx}:v]`).join('') + `concat=n=${videoFiles.length}:v=1:a=0[v]`;
      const concatCmd = `${ffmpegCmd} -y ${inputs} -filter_complex "${filter}" -map "[v]" -an -c:v libx264 -preset fast -crf 22 "${rawConcatFile}"`;
      console.log(`[API/grok-video/merge] Concat clips (-an SILENT): ${concatCmd}`);
      await execAsync(concatCmd);
      sourceVideoFile = rawConcatFile;
      cleanupConcat = rawConcatFile;
    } else {
      sourceVideoFile = videoFiles[0];
    }

    const plan = planFit(await probeDurationSeconds(ffmpegCmd, sourceVideoFile), targetDurationSec);
    console.log(`[API/grok-video/merge] ${plan.reason}`);
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
      console.log(`[API/grok-video/merge] Muxing Melodio audio into pure silent video (Exact ${targetDurationSec}s): ${muxCmd}`);
      await execAsync(muxCmd);
    } else {
      await fs.promises.copyFile(concatVideoFile, finalOutputFile);
    }

    if (!fs.existsSync(finalOutputFile)) {
      return NextResponse.json({ success: false, error: 'FFmpeg 비디오 인코딩 생성 실패' }, { status: 500 });
    }

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const fileName = `grok_short_30s_merged_${Date.now()}.mp4`;
    const filePath = `viral_shorts/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('melodio-assets')
      .upload(`viral_shorts/${fileName}`, finalBuffer, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) {
      console.error('[API/grok-video/merge] Supabase upload error:', uploadError.message);
      throw new Error(`동영상 저장소 업로드 실패: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('melodio-assets')
      .getPublicUrl(`viral_shorts/${fileName}`);

    const publicUrl = publicUrlData.publicUrl;
    console.log(`[API/grok-video/merge] Merged 28s MP4 uploaded to Supabase: ${publicUrl}`);

    // 💾 대시보드 및 Vault 보관함 저장을 위해 generations 테이블 video_url 및 license_hash 직접 업데이트
    if (trackId) {
      try {
        const { data: existingGen } = await supabase
          .from('generations')
          .select('license_hash, user_id')
          .eq('id', trackId)
          .single();

        let meta: Record<string, any> = {};
        if (existingGen?.license_hash) {
          try { meta = JSON.parse(existingGen.license_hash); } catch {}
        }
        meta = { ...meta, video_url: publicUrl, grok_video_url: publicUrl };

        // 1. generations 테이블 direct update
        await supabase
          .from('generations')
          .update({
            video_url: publicUrl,
            license_hash: JSON.stringify(meta)
          })
          .eq('id', trackId);

        // 2. video_assets 테이블 insert
        if (existingGen?.user_id) {
          await supabase
            .from('video_assets')
            .insert({
              user_id: existingGen.user_id,
              prompt: prompt || 'Grok Viral Video',
              video_url: publicUrl,
              status: 'done'
            });
        }
        console.log(`[API/grok-video/merge] Saved videoUrl directly to generations & video_assets for trackId: ${trackId}`);
      } catch (dbErr) {
        console.warn('[API/grok-video/merge] DB Save warning:', dbErr);
      }
    }

    try {
      for (const f of videoFiles) await fs.promises.unlink(f).catch(() => {});
      if (audioFile) await fs.promises.unlink(audioFile).catch(() => {});
      await fs.promises.unlink(concatVideoFile).catch(() => {});
      await fs.promises.unlink(finalOutputFile).catch(() => {});
    } catch {}

    return NextResponse.json({
      success: true,
      mergedVideoUrl: publicUrl,
      // 호출부(../route.ts)와 화면이 길이를 바로 표시할 수 있게 실측값을 함께 돌려준다.
      durationSeconds: targetDurationSec,
      message: `${targetDurationSec}초 풀 비디오 + 멜로디오 음원 머징 인코딩이 완료되었습니다.`
    });

  } catch (err: any) {
    console.error('[API/grok-video/merge] Exception:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
