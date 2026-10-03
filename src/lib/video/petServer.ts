import type { SupabaseClient } from '@supabase/supabase-js';
import { isDeepStrictEqual } from 'node:util';
import { createPetVideoService, PetJobRecord, PetJobStore, PetPipelineError } from './petPipeline';
import { assertPetMediaUrl, downloadPetMedia } from './petMedia';
import { createPetXaiProvider } from './petProvider';
import { extractPetBridgeFrame, extractPetReviewFrames, renderPetVideo, snapshotPetAudio, PetAssetUploader } from './petRenderer';
import { validatePetEpisode, type PetEpisode } from '../vle/petEpisode';

import { openingImageAnalysis, reviewPetAsset } from './petQuality';

export function createPetJobStore(admin: SupabaseClient): PetJobStore {
  async function select(userId: string, column: string, value: string): Promise<PetJobRecord | null> {
    const { data, error } = await admin.from('viral_pet_jobs').select('*').eq('user_id', userId).eq(column, value).maybeSingle();
    if (error) throw new PetPipelineError('댕냥이 작업 저장소를 확인할 수 없습니다.', 'JOB_STORAGE', 503);
    return data as PetJobRecord | null;
  }
  return {
    get: (userId, jobId) => select(userId, 'id', jobId),
    findEpisode: (userId, episodeId) => select(userId, 'episode->>id', episodeId),
    async insert(job) {
      const { data, error } = await admin.from('viral_pet_jobs').insert(job).select('*').single();
      if (error?.code === '23505') {
        const existing = await select(job.user_id, 'episode->>id', job.episode.id);
        if (existing && existing.state.audio.trackId === job.state.audio.trackId && isDeepStrictEqual(existing.episode, job.episode)) return existing;
        throw new PetPipelineError('이미 시작한 콘티입니다. 저장된 작업을 조회해 주세요.', 'EPISODE_ALREADY_STARTED', 409);
      }
      if (error || !data) throw new PetPipelineError('콘티를 저장하지 못했습니다. 유료 생성은 시작하지 않았습니다.', 'JOB_STORAGE', 503);
      return data as PetJobRecord;
    },
    async compareAndSwap(job, revision) {
      const { data, error } = await admin.from('viral_pet_jobs').update({ state: job.state, status: job.status, revision: job.revision, updated_at: job.updated_at }).eq('id', job.id).eq('user_id', job.user_id).eq('revision', revision).select('*').maybeSingle();
      if (error) throw new PetPipelineError('작업 상태를 저장하지 못했습니다. 저장된 요청을 먼저 조회해 주세요.', 'JOB_STORAGE', 503);
      return data as PetJobRecord | null;
    },
    async ownedAudio(userId, trackId, episode) {
      // This scoped release converts v3 audio only. Existing private v4 jobs remain readable.
      if (episode.version !== 'pet-v3') throw new PetPipelineError('이 콘티는 시험 제작 버전입니다. 저장된 작업을 불러와 주세요.', 'PILOT_ONLY', 409);
      const { data, error } = await admin.from('generations').select('id,user_id,status,audio_url,license_hash').eq('id', trackId).eq('user_id', userId).maybeSingle();
      if (error || !data) throw new PetPipelineError('본인 소유의 음원을 찾을 수 없습니다.', 'TRACK_NOT_FOUND', 404);
      if (data.status !== 'completed' || typeof data.audio_url !== 'string') throw new PetPipelineError('완성된 음원을 먼저 선택해 주세요.', 'AUDIO_NOT_READY', 409);
      let metadata: { petEpisode?: PetEpisode } = {};
      try { metadata = JSON.parse(data.license_hash || '{}'); } catch { /* Legacy tracks cannot be bound to a reviewed pet episode. */ }
      const canonicalEpisode = metadata.petEpisode;
      let canonicalIssues: string[] = [];
      try { canonicalIssues = validatePetEpisode(canonicalEpisode); } catch { canonicalIssues = ['저장된 콘티 형식이 올바르지 않습니다.']; }
      if (!canonicalEpisode || canonicalIssues.length || !isDeepStrictEqual(canonicalEpisode, episode)) {
        throw new PetPipelineError('현재 콘티 전체와 일치하는 음원을 선택해 주세요. 입력이나 장면이 바뀌었다면 다시 기획해 주세요.', 'AUDIO_EPISODE_MISMATCH', 409);
      }
      assertPetMediaUrl(data.audio_url, 'audio');
      return { sourceUrl: data.audio_url, episode: structuredClone(canonicalEpisode) };
    },
  };
}
export function createPetVideoServerService(admin: SupabaseClient) {
  const upload: PetAssetUploader = async (job, filename, buffer, contentType) => {
    const assetPath = `viral_pet/${job.user_id}/${job.id}/${filename}`;
    const { error } = await admin.storage.from('melodio-assets').upload(assetPath, buffer, { contentType, upsert: true });
    if (error) throw new PetPipelineError('생성 결과를 안전하게 보관하지 못했습니다. 저장된 원본을 확인해 주세요.', 'ASSET_STORAGE', 503);
    return admin.storage.from('melodio-assets').getPublicUrl(assetPath).data.publicUrl;
  };
  // Lazy provider configuration allows read/resume review without requiring a provider call.
  return createPetVideoService({
    store: createPetJobStore(admin),
    snapshotAudio: job => snapshotPetAudio(job, upload),
    generateImage: (prompt, master) => createPetXaiProvider().generateImage(prompt, master),
    startVideo: (prompt, duration, keyframe) => createPetXaiProvider().startVideo(prompt, duration, keyframe),
    pollVideo: requestId => createPetXaiProvider().pollVideo(requestId),
    async copyAsset(job, index, kind, url) {
      const media = await downloadPetMedia(url, kind);
      const extension = kind === 'video' ? '.mp4' : media.contentType === 'image/png' ? '.png' : '.jpg';
      return upload(job, `${job.state.shots[index].id}-${kind}${extension}`, media.buffer, media.contentType);
    },
    extractBridgeFrame: (job, index) => extractPetBridgeFrame(job, index, upload),
    async reviewAsset(job, index, kind) {
      if (kind === 'image') return openingImageAnalysis(job, index);
      const frames = await extractPetReviewFrames(job, index, kind, upload);
      return reviewPetAsset(job, index, kind, frames.urls);
    },
    render: job => renderPetVideo(job, upload),
  });
}
