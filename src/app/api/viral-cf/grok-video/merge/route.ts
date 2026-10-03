import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegStatic from 'ffmpeg-static';
import { createHash } from 'node:crypto';
import { planFit, buildFitCommand, probeDurationSeconds } from '@/lib/video/fitVideoToAudio';
import { LEGACY_SHORT_SECONDS, LegacyShortExportError, muxLegacyShortVideo, validateLegacyShortAudio } from '@/lib/video/legacyShortExport';

const execAsync = promisify(exec);

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let scratchDirectory: string | undefined;
  try {
    const body = await req.json();
    const { videoUrls, audioUrl, trackId, prompt } = body;

    if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
      return NextResponse.json({ success: false, error: 'videoUrls 배열이 필요합니다.' }, { status: 400 });
    }
    if (typeof audioUrl !== 'string' || !audioUrl.trim()) {
      throw new LegacyShortExportError('완성된 음원이 필요합니다. 음원 없는 영상은 제공하지 않습니다.', 'AUDIO_REQUIRED');
    }

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'grok-short-merge-'));
    scratchDirectory = tmpDir;
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

    const targetDurationSec = LEGACY_SHORT_SECONDS;
    if (!audioFile) throw new LegacyShortExportError('음원을 다운로드하지 못했습니다. 음원 없는 영상은 제공하지 않습니다.', 'AUDIO_REQUIRED');
    await validateLegacyShortAudio(ffmpegCmd, audioFile);

    const concatVideoFile = path.join(tmpDir, `grok_concat_${timestamp}.mp4`);
    const finalOutputFile = path.join(tmpDir, `grok_final_${timestamp}.mp4`);

    // Remove provider audio and fit existing visual clips to the fixed 30-second export.
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

    const durationSeconds = await muxLegacyShortVideo(ffmpegCmd, concatVideoFile, audioFile, finalOutputFile);

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
    const fingerprint = createHash('sha256').update(finalBuffer).digest('hex').slice(0, 16);
    const fileName = `grok_short_30s_captionless_v1_${fingerprint}.mp4`;
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
    console.log(`[API/grok-video/merge] Verified 30s MP4 uploaded to Supabase: ${publicUrl}`);

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
      durationSeconds,
      message: `${targetDurationSec}초 풀 비디오 + 멜로디오 음원 머징 인코딩이 완료되었습니다.`
    });

  } catch (err: any) {
    console.error('[API/grok-video/merge] Exception:', err.message);
    return NextResponse.json({ success: false, error: err.message, ...(err instanceof LegacyShortExportError ? { code: err.code } : {}) }, { status: err instanceof LegacyShortExportError ? err.status : 500 });
  } finally { if (scratchDirectory) await fs.promises.rm(scratchDirectory, { recursive: true, force: true }); }
}
