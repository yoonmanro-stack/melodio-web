import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { DANCE_CATEGORY_ID, type DanceVideoJob } from './preset';
import { createDanceVideoService, DanceVideoError, type DanceOwnedRecord, type DanceVideoStore } from './videoService';
import { createDancePlan } from './videoPlan';
import { createDanceIdeas } from './ideas';
import { extractDanceBridge, renderDancePreview, renderDanceVideo, reuseDanceAudio, snapshotDanceAudio, type DanceUpload } from './renderVideo';
import { createPetXaiProvider } from '../video/petProvider';
import { downloadPetMedia } from '../video/petMedia';

type GenerationRow = { id: string; user_id: string; title: string; is_public: boolean; created_at: string; status: string; audio_url: string | null; license_hash: string | null };
function record(row: GenerationRow): DanceOwnedRecord {
  let metadata: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.license_hash || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
  } catch { /* A legacy/non-dance track will be rejected by the service. */ }
  return { id: row.id, userId: row.user_id, title: row.title, isPublic: row.is_public, createdAt: row.created_at,
    status: row.status, audioUrl: row.audio_url, licenseHash: row.license_hash, metadata };
}
const FIELDS = 'id,user_id,title,is_public,created_at,status,audio_url,license_hash';
export function createDanceVideoStore(admin: SupabaseClient): DanceVideoStore {
  return {
    async recentDirections(userId) {
      const { data, error } = await admin.from('generations').select('license_hash').eq('user_id', userId)
        .ilike('license_hash', '%dance-music-first-v1%').order('created_at', { ascending: false }).limit(12).abortSignal(AbortSignal.timeout(10000));
      if (error) throw new DanceVideoError('최근 댄스 연출을 확인하지 못했습니다.', 'JOB_STORAGE', 503);
      return (data || []).flatMap(row => {
        try { const meta = JSON.parse(row.license_hash || '{}'); const direction = meta?.danceVideo?.direction;
          return direction?.version === 2 && typeof direction.signature === 'string' ? [direction] : [];
        } catch { return []; }
      });
    },
    async load(userId, trackId) {
      const { data, error } = await admin.from('generations').select(FIELDS).eq('id', trackId).eq('user_id', userId).maybeSingle();
      if (error) throw new DanceVideoError('영상 작업 저장소를 확인하지 못했습니다.', 'JOB_STORAGE', 503);
      return data ? record(data as GenerationRow) : null;
    },
    async insert(next) {
      const { error } = await admin.from('generations').insert({ id: next.id, user_id: next.userId, title: next.title,
        status: 'completed', is_public: next.isPublic, created_at: next.createdAt, audio_url: next.audioUrl,
        source_audio_url: null, license_hash: next.licenseHash, duration_mode: 'clip', is_stem_extracted: false });
      if (error?.code === '23505') return false;
      if (error) throw new DanceVideoError('같은 음원의 새 영상 작업을 저장하지 못했습니다.', 'JOB_STORAGE', 503);
      return true;
    },
    async compareAndSwap(previous, job) {
      const metadata: Record<string, unknown> = { ...previous.metadata, danceVideo: job };
      const payload: Record<string, unknown> = {};
      if (job.status === 'completed' && job.videoUrl && job.plan && job.imageUrl) {
        if (typeof metadata.originalMusicTitle !== 'string') metadata.originalMusicTitle = previous.title;
        Object.assign(metadata, { video_url: job.videoUrl, grok_video_url: job.videoUrl, sourceMenu: 'viral', viralMode: true,
          presetId: DANCE_CATEGORY_ID, tab_type: DANCE_CATEGORY_ID, genCategory: DANCE_CATEGORY_ID });
        payload.title = job.plan.title;
        payload.cover_art_url = job.imageUrl;
      }
      payload.license_hash = JSON.stringify(metadata);
      // Deliberately leave original audio_url/source_audio_url and is_public untouched.
      // Existing generations stores video_url inside license_hash, not a video column.
      // Full UTF-8 metadata belongs in the POST body, never in a URL filter.
      // The restricted RPC retains owner/status and exact nullable TEXT CAS.
      const { data, error } = await admin.rpc('compare_and_swap_dance_generation', {
        p_track_id: previous.id,
        p_user_id: previous.userId,
        p_expected_license_hash: previous.licenseHash,
        p_next_license_hash: payload.license_hash,
        p_final_title: payload.title ?? null,
        p_final_cover_art_url: payload.cover_art_url ?? null,
      }).maybeSingle();
      if (error) throw new DanceVideoError('작업 상태를 저장하지 못했습니다. 저장된 요청을 먼저 확인해 주세요.', 'JOB_STORAGE', 503);
      return data ? record(data as GenerationRow) : null;
    },
  };
}
export function createDanceVideoServerService(admin: SupabaseClient, userId: string, options: { videoModel?: NonNullable<DanceVideoJob['videoSpec']>['model'] } = {}) {
  const upload: DanceUpload = async (job: DanceVideoJob, filename: string, buffer: Buffer, contentType: string) => {
    if (!/^[a-zA-Z0-9._-]{1,150}$/.test(filename)) throw new DanceVideoError('결과 파일 이름이 올바르지 않습니다.', 'ASSET_PATH');
    const assetPath = `${DANCE_CATEGORY_ID}/${userId}/${job.trackId}/${job.id}/${filename}`;
    const { error } = await admin.storage.from('melodio-assets').upload(assetPath, buffer, { contentType, upsert: true });
    if (error) throw new DanceVideoError('생성 결과를 보관하지 못했습니다. 저장된 요청과 원본을 확인해 주세요.', 'ASSET_STORAGE', 503);
    return admin.storage.from('melodio-assets').getPublicUrl(assetPath).data.publicUrl;
  };
  return createDanceVideoService({
    videoModel: options.videoModel || 'grok-imagine-video-1.5',
    store: createDanceVideoStore(admin),
    snapshot: (job, sourceUrl) => snapshotDanceAudio(job, sourceUrl, upload),
    reuseSnapshot: reuseDanceAudio,
    plan: (job, options) => createDancePlan(job, undefined, options),
    ideas: (job, options) => createDanceIdeas(job, undefined, options),
    generateImage: prompt => createPetXaiProvider().generateImage(prompt),
    startVideo: (prompt, duration, keyframe, options) => createPetXaiProvider(undefined, {
      resolution: options?.resolution || '480p', model: options?.model || 'grok-imagine-video',
      ...(options?.referenceImageUrl ? { referenceImageUrl: options.referenceImageUrl } : {}), generateAudio: false,
    }).startVideo(prompt, duration, keyframe),
    pollVideo: requestId => createPetXaiProvider().pollVideo(requestId),
    async copyAsset(job, kind, url, filename) {
      const media = await downloadPetMedia(url, kind);
      const hash = createHash('sha256').update(media.buffer).digest('hex').slice(0, 16);
      const extension = kind === 'video' ? 'mp4' : media.contentType === 'image/png' ? 'png' : media.contentType === 'image/webp' ? 'webp' : 'jpg';
      return upload(job, `${filename}-${hash}.${extension}`, media.buffer, media.contentType);
    },
    bridge: job => extractDanceBridge(job, upload),
    render: job => renderDanceVideo(job, upload),
    preview: job => renderDancePreview(job, upload),
  });
}
