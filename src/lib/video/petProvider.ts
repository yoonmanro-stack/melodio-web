import { PetPipelineError } from './petPipeline';
import { assertPetMediaUrl, readPetBoundedBody } from './petMedia';

// Confirmed by the live classic-model validation response on 2026-09-15.
export const PET_XAI_VIDEO_PROMPT_MAX_LENGTH = 4096;
export const PET_XAI_VIDEO_MODELS = ['grok-imagine-video', 'grok-imagine-video-1.5', 'grok-imagine-video-1.5-lite'] as const;
export type PetXaiVideoModel = typeof PET_XAI_VIDEO_MODELS[number];

// REST shapes verified 2026-09-14: docs.x.ai/developers/model-capabilities/images/editing
// and /video/generation. Optional video models use the same image-to-video REST shape
// (rechecked 2026-10-08); existing pet calls keep the classic model and 480p default.
export function createPetXaiProvider(fetchImpl: typeof fetch = fetch, options: { model?: PetXaiVideoModel; resolution?: '480p' | '720p'; referenceImageUrl?: string; generateAudio?: boolean } = {}) {
  const model = options.model === undefined ? 'grok-imagine-video' : options.model;
  const resolution = options.resolution === undefined ? '480p' : options.resolution;
  if (!PET_XAI_VIDEO_MODELS.includes(model)) throw new PetPipelineError('영상 모델 설정이 올바르지 않습니다.', 'PROVIDER_CONFIG', 503);
  if (!['480p', '720p'].includes(resolution)) throw new PetPipelineError('영상 해상도 설정이 올바르지 않습니다.', 'PROVIDER_CONFIG', 503);
  if (options.referenceImageUrl !== undefined) {
    if (model !== 'grok-imagine-video-1.5') throw new PetPipelineError('첫 장면과 인물 참조를 함께 사용하는 영상은 Grok 1.5가 필요합니다.', 'PROVIDER_CONFIG', 503);
    assertPetMediaUrl(options.referenceImageUrl, 'image');
  }
  if (options.generateAudio !== undefined && typeof options.generateAudio !== 'boolean') throw new PetPipelineError('영상 오디오 설정이 올바르지 않습니다.', 'PROVIDER_CONFIG', 503);
  const apiKey = process.env.XAI_API_KEY?.trim();
  const base = (process.env.XAI_API_BASE || 'https://api.x.ai/v1').replace(/\/$/, '');
  if (!apiKey) throw new PetPipelineError('영상 생성 API 설정이 필요합니다.', 'PROVIDER_CONFIG', 503);
  if (base !== 'https://api.x.ai/v1') throw new PetPipelineError('댕냥이 파일럿은 공식 xAI API 주소를 사용해야 합니다.', 'PROVIDER_CONFIG', 503);
  async function request(path: string, body?: object): Promise<Record<string, unknown>> {
    const response = await fetchImpl(`${base}${path}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(body ? 90_000 : 20_000),
      headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      // Inspect a bounded error in memory; never retain provider bodies or echo
      // their potentially reflected prompts, URLs or credentials to the client.
      let promptTooLong = false;
      try {
        const errorText = (await readPetBoundedBody(response, 4096)).toString('utf8');
        promptTooLong = response.status === 400 && /prompt/i.test(errorText)
          && /4096/.test(errorText) && /length|long|maximum|limit/i.test(errorText);
      } catch { await response.body?.cancel().catch(() => undefined); }
      if (promptTooLong) throw new PetPipelineError('영상 프롬프트가 Grok의 4,096자 한도를 넘었습니다. 콘티 압축이 필요합니다.', 'PROVIDER_PROMPT_LENGTH', 422);
      throw new PetPipelineError(`xAI 요청을 확인하지 못했습니다 (HTTP ${response.status}). 자동 재생성하지 않습니다.`, 'PROVIDER_HTTP', 400, response.status);
    }
    const buffer = await readPetBoundedBody(response, 128 * 1024);
    let data: unknown;
    try { data = JSON.parse(buffer.toString('utf8')); } catch { throw new PetPipelineError('xAI 응답 형식을 확인하지 못했습니다.', 'PROVIDER_RESPONSE'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PetPipelineError('xAI 응답이 올바르지 않습니다.', 'PROVIDER_RESPONSE');
    return data as Record<string, unknown>;
  }
  return {
    async generateImage(prompt: string, masterUrl?: string) {
      if (masterUrl) assertPetMediaUrl(masterUrl, 'image');
      const data = await request(masterUrl ? '/images/edits' : '/images/generations', {
        model: 'grok-imagine-image', prompt, n: 1, aspect_ratio: '9:16', response_format: 'url',
        ...(masterUrl ? { image: { url: masterUrl, type: 'image_url' } } : {}),
      });
      const rows = data.data as Array<Record<string, unknown>> | undefined;
      const first = rows?.[0];
      if (typeof first?.url !== 'string' || first.respect_moderation === false || data.respect_moderation === false) throw new PetPipelineError('기준 이미지 결과를 확인하지 못했습니다. 제출 상태를 확인해 주세요.', 'IMAGE_RESULT');
      assertPetMediaUrl(first.url, 'image'); return { url: first.url };
    },
    async startVideo(prompt: string, duration: number, keyframeUrl: string) {
      if (!prompt.trim() || prompt.length > PET_XAI_VIDEO_PROMPT_MAX_LENGTH) {
        throw new PetPipelineError('영상 프롬프트는 1~4,096자여야 합니다. 유료 요청 전 중단했습니다.', 'PROVIDER_PROMPT_LENGTH', 422);
      }
      if (options.referenceImageUrl && Buffer.byteLength(prompt, 'utf8') > PET_XAI_VIDEO_PROMPT_MAX_LENGTH) {
        throw new PetPipelineError('참조 영상 프롬프트는 UTF-8 4,096바이트 이내여야 합니다. 유료 요청 전 중단했습니다.', 'PROVIDER_PROMPT_LENGTH', 422);
      }
      assertPetMediaUrl(keyframeUrl, 'image');
      const data = await request('/videos/generations', {
        model, prompt, duration, aspect_ratio: '9:16', resolution, image: { url: keyframeUrl },
        ...(options.referenceImageUrl ? { reference_images: [{ url: options.referenceImageUrl }] } : {}),
        ...(options.generateAudio === undefined ? {} : { generate_audio: options.generateAudio }),
      });
      if (typeof data.request_id !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(data.request_id)) throw new PetPipelineError('영상 요청 ID를 확인하지 못했습니다. 중복 결제를 막기 위해 보류합니다.', 'UNKNOWN_SUBMISSION');
      return { requestId: data.request_id };
    },
    async pollVideo(requestId: string): Promise<{ status: 'pending' | 'done' | 'failed' | 'expired'; url?: string }> {
      if (!/^[a-zA-Z0-9_-]{1,150}$/.test(requestId)) throw new PetPipelineError('저장된 공급자 요청 ID가 올바르지 않습니다.', 'REQUEST_ID');
      const data = await request(`/videos/${encodeURIComponent(requestId)}`);
      if (data.status === 'failed' || data.status === 'expired') return { status: data.status };
      if (data.status === 'done') {
        const video = data.video as Record<string, unknown> | undefined;
        if (typeof video?.url !== 'string' || video.respect_moderation === false) return { status: 'failed' };
        assertPetMediaUrl(video.url, 'video'); return { status: 'done', url: video.url };
      }
      if (!['pending', 'processing', 'queued', 'in_progress'].includes(String(data.status))) {
        throw new PetPipelineError('저장된 영상 요청의 공급자 상태 형식을 확인하지 못했습니다.', 'PROVIDER_STATUS');
      }
      return { status: 'pending' };
    },
  };
}
