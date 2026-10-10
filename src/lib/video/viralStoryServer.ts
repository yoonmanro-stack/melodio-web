import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertPetMediaUrl, downloadPetMedia, readPetBoundedBody } from './petMedia';
import { preflightPetRenderer, probePetMediaSeconds } from './petRenderer';
import { muxLegacyShortVideo, validateLegacyShortAudio } from './legacyShortExport';
import { assertDanceClipDuration, concatDanceClips, extractDanceFinalFrame } from '../dance/renderVideo';
import { createViralStoryPipeline, ViralStoryError, type ViralStoryAsset, type ViralStoryJob, type ViralStoryOwnedRecord, type ViralStoryStore } from './viralStoryPipeline';

const FIELDS = 'id,user_id,status,audio_url,license_hash';
const hash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
type GenerationRow = { id: string; user_id: string; status: string; audio_url: string | null; license_hash: string | null };
function record(row: GenerationRow): ViralStoryOwnedRecord {
  let metadata: unknown = {};
  try { metadata = JSON.parse(row.license_hash || '{}'); } catch { throw new ViralStoryError('음원의 저장 형식을 확인해 주세요.', 'TRACK_METADATA', 409); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new ViralStoryError('음원의 저장 형식을 확인해 주세요.', 'TRACK_METADATA', 409);
  return { id: row.id, userId: row.user_id, status: row.status, audioUrl: row.audio_url, licenseHash: row.license_hash, metadata: metadata as Record<string, unknown> };
}
/** The deployed RPC is generic owner/status/exact-TEXT CAS despite its historical dance name. */
export function createViralStoryStore(admin: SupabaseClient): ViralStoryStore {
  return {
    async load(userId, trackId) {
      const { data, error } = await admin.from('generations').select(FIELDS).eq('id', trackId).eq('user_id', userId)
        .abortSignal(AbortSignal.timeout(10000)).maybeSingle();
      if (error) throw new ViralStoryError('영상 작업 저장소를 확인하지 못했습니다.', 'JOB_STORAGE', 503);
      return data ? record(data as GenerationRow) : null;
    },
    async compareAndSwap(previous, job) {
      const metadata = { ...previous.metadata, viralVideoJob: job,
        ...(job.status === 'completed' && job.final ? { video_url: job.final.url, grok_video_url: job.final.url,
          sourceMenu: 'viral', viralMode: true } : {}) };
      const { data, error } = await admin.rpc('compare_and_swap_dance_generation', {
        p_track_id: previous.id, p_user_id: previous.userId,
        p_expected_license_hash: previous.licenseHash, p_next_license_hash: JSON.stringify(metadata),
        p_final_title: null, p_final_cover_art_url: null,
      }).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
      if (error) throw new ViralStoryError('영상 상태를 저장하지 못했습니다. 저장된 요청을 다시 조회해 주세요.', 'JOB_STORAGE', 503);
      return data ? record(data as GenerationRow) : null;
    },
  };
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function resultUrl(data: Record<string, unknown>): string | undefined {
  if (data.respect_moderation === false) return undefined;
  const video = object(data.video) ? data.video : undefined;
  const result = object(data.result) ? data.result : undefined;
  const first = Array.isArray(data.data) && object(data.data[0]) ? data.data[0] : undefined;
  if (video?.respect_moderation === false || result?.respect_moderation === false || first?.respect_moderation === false) return undefined;
  const url = video?.url || data.url || first?.url || result?.url;
  if (typeof url !== 'string' || url.length > 2048) return undefined;
  assertPetMediaUrl(url, 'video'); return url;
}
/** Same classic model, two 15-second calls and silent flags as the unchanged synchronous route. */
export function createViralStoryProvider(fetchImpl: typeof fetch = fetch, options: { apiKey?: string; apiBase?: string } = {}) {
  function configuration() {
    const apiKey = (options.apiKey ?? process.env.XAI_API_KEY)?.trim();
    const apiBase = (options.apiBase ?? process.env.XAI_API_BASE ?? 'https://api.x.ai/v1').replace(/\/$/, '');
    if (!apiKey || apiBase !== 'https://api.x.ai/v1') throw new ViralStoryError('영상 API 설정을 확인해 주세요.', 'PROVIDER_CONFIG', 503);
    return { apiKey, apiBase };
  }
  async function request(endpoint: string, body?: Record<string, unknown>) {
    const { apiKey, apiBase } = configuration();
    const response = await fetchImpl(`${apiBase}${endpoint}`, { method: body ? 'POST' : 'GET', redirect: 'error',
      signal: AbortSignal.timeout(body ? 90000 : 20000), headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new ViralStoryError('영상 요청 응답을 확인하지 못했습니다.', body ? 'UNKNOWN_SUBMISSION' : 'PROVIDER_HTTP', 502); }
    const buffer = await readPetBoundedBody(response, 128 * 1024);
    let value: unknown;
    try { value = JSON.parse(buffer.toString('utf8')); } catch { throw new ViralStoryError('영상 요청 응답을 확인하지 못했습니다.', body ? 'UNKNOWN_SUBMISSION' : 'PROVIDER_RESPONSE', 502); }
    if (!object(value)) throw new ViralStoryError('영상 요청 응답을 확인하지 못했습니다.', body ? 'UNKNOWN_SUBMISSION' : 'PROVIDER_RESPONSE', 502);
    return value;
  }
  return {
    assertConfigured: configuration,
    async startVideo(prompt: string, referenceImageUrl?: string) {
      if (!prompt.trim() || Buffer.byteLength(prompt, 'utf8') > 4096) throw new ViralStoryError('영상 연출이 Grok 한도를 넘습니다.', 'PROMPT_LENGTH', 422);
      if (referenceImageUrl) assertPetMediaUrl(referenceImageUrl, 'image');
      const data = await request('/videos/generations', { model: 'grok-imagine-video', prompt, duration: 15, aspect_ratio: '9:16',
        watermark: false, silent: true, audio: false, sound: false, voice: false,
        ...(referenceImageUrl ? { image: { url: referenceImageUrl } } : {}) });
      const id = data.request_id || data.id || data.task_id;
      const requestId = typeof id === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(id) ? id : undefined;
      // A known ID is authoritative even if a result URL is malformed; retain it for GET recovery.
      if (requestId) return { requestId };
      const url = resultUrl(data);
      if (!url) throw new ViralStoryError('영상 요청 ID를 확인하지 못했습니다.', 'UNKNOWN_SUBMISSION', 502);
      return { url };
    },
    async pollVideo(requestId: string): Promise<{ status: 'pending' | 'done' | 'failed' | 'expired'; url?: string }> {
      if (!/^[a-zA-Z0-9_-]{1,150}$/.test(requestId)) throw new ViralStoryError('저장된 영상 요청 ID를 확인해 주세요.', 'REQUEST_ID', 409);
      const data = await request(`/videos/${encodeURIComponent(requestId)}`);
      const status = data.status || data.state;
      if (status === 'failed' || status === 'error') return { status: 'failed' };
      if (status === 'expired') return { status: 'expired' };
      if (['done', 'completed', 'succeeded'].includes(status as string)) {
        const url = resultUrl(data); return url ? { status: 'done', url } : { status: 'failed' };
      }
      return { status: 'pending' };
    },
  };
}
type Upload = (job: ViralStoryJob, filename: string, buffer: Buffer, contentType: string) => Promise<string>;
function storedUrl(job: ViralStoryJob, userId: string, value: string, kind: 'audio' | 'image' | 'video') {
  const url = assertPetMediaUrl(value, kind);
  const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prefix = `/storage/v1/object/public/melodio-assets/viral_story/${userId}/${job.trackId}/${job.id}/`;
  if (!storageOrigin || url.origin !== new URL(storageOrigin).origin || !url.pathname.startsWith(prefix)) throw new ViralStoryError('이 작업에 보관된 미디어만 사용할 수 있습니다.', 'MEDIA_STORAGE', 409);
  return value;
}
async function scratch<T>(name: string, callback: (binary: string, temp: string) => Promise<T>): Promise<T> {
  const { binary } = await preflightPetRenderer();
  const temp = await mkdtemp(path.join(os.tmpdir(), `viral-story-${name}-`));
  try { return await callback(binary, temp); } finally { await rm(temp, { recursive: true, force: true }); }
}
async function archivedDownload(job: ViralStoryJob, userId: string, asset: ViralStoryAsset, kind: 'audio' | 'video') {
  const media = await downloadPetMedia(storedUrl(job, userId, asset.url, kind), kind);
  if (hash(media.buffer) !== asset.hash) throw new ViralStoryError('보관된 원본 파일이 스냅샷과 다릅니다.', kind === 'audio' ? 'AUDIO_HASH' : 'MEDIA_HASH', 409);
  return media;
}
export function createViralStoryServerService(admin: SupabaseClient, userId: string) {
  const provider = createViralStoryProvider();
  const upload: Upload = async (job, filename, buffer, contentType) => {
    // A timed-out local task can finish decoding later. It must not publish after its lease is cleared.
    if (!job.lease) throw new ViralStoryError('처리 시간이 초과되었습니다.', 'OPERATION_TIMEOUT', 503);
    if (!/^[a-zA-Z0-9._-]{1,150}$/.test(filename) || !buffer.length || buffer.length > 60 * 1024 ** 2) throw new ViralStoryError('결과 파일 크기와 이름을 확인해 주세요.', 'FINAL_SIZE', 409);
    const assetPath = `viral_story/${userId}/${job.trackId}/${job.id}/${filename}`;
    const { error } = await admin.storage.from('melodio-assets').upload(assetPath, buffer, { contentType, upsert: true });
    if (error) throw new ViralStoryError('생성 결과를 보관하지 못했습니다.', 'ASSET_STORAGE', 503);
    return storedUrl(job, userId, admin.storage.from('melodio-assets').getPublicUrl(assetPath).data.publicUrl, contentType.startsWith('image/') ? 'image' : contentType.startsWith('video/') ? 'video' : 'audio');
  };
  return createViralStoryPipeline({
    store: createViralStoryStore(admin),
    validateAudioUrl(url) { assertPetMediaUrl(url, 'audio'); provider.assertConfigured(); },
    startVideo: provider.startVideo, pollVideo: provider.pollVideo,
    snapshotAudio: job => scratch('audio', async (binary, temp) => {
      const audio = await downloadPetMedia(job.sourceAudioUrl, 'audio'); const input = path.join(temp, 'original.audio');
      await writeFile(input, audio.buffer);
      const durationSeconds = await validateLegacyShortAudio(binary, input); const fingerprint = hash(audio.buffer);
      const url = await upload(job, `original-audio-${fingerprint.slice(0, 16)}.audio`, audio.buffer, audio.contentType);
      return { url, hash: fingerprint, durationSeconds };
    }),
    archiveClip: (job, index, sourceUrl) => scratch('clip', async (binary, temp) => {
      const clip = await downloadPetMedia(sourceUrl, 'video'); const input = path.join(temp, 'clip.mp4');
      await writeFile(input, clip.buffer);
      const durationSeconds = await probePetMediaSeconds(binary, input, 'video'); assertDanceClipDuration(durationSeconds);
      const fingerprint = hash(clip.buffer); const url = await upload(job, `clip${index + 1}-${fingerprint.slice(0, 16)}.mp4`, clip.buffer, 'video/mp4');
      return { url, hash: fingerprint, durationSeconds };
    }),
    extractBridge: job => scratch('bridge', async (binary, temp) => {
      const clip = await archivedDownload(job, userId, job.clips[0].asset!, 'video');
      const input = path.join(temp, 'clip1.mp4'), output = path.join(temp, 'final-frame.jpg');
      await writeFile(input, clip.buffer);
      // Shared helper decodes the terminal interval and retains the actual last frame unchanged.
      await extractDanceFinalFrame(binary, input, output);
      const frame = await readFile(output); const fingerprint = hash(frame);
      return { url: await upload(job, `bridge-${fingerprint.slice(0, 16)}.jpg`, frame, 'image/jpeg'), hash: fingerprint };
    }),
    render: job => scratch('render', async (binary, temp) => {
      const audio = await archivedDownload(job, userId, job.audio!, 'audio'); const audioFile = path.join(temp, 'original.audio');
      await writeFile(audioFile, audio.buffer); await validateLegacyShortAudio(binary, audioFile);
      const clipFiles: [string, string] = [path.join(temp, 'clip1.mp4'), path.join(temp, 'clip2.mp4')];
      for (const index of [0, 1] as const) {
        const clip = await archivedDownload(job, userId, job.clips[index].asset!, 'video'); await writeFile(clipFiles[index], clip.buffer);
      }
      const silentVideo = path.join(temp, 'silent.mp4'), output = path.join(temp, 'final.mp4');
      // No freeze fill, clip repetition, generated soundtrack, captions or provider audio survives.
      await concatDanceClips(binary, clipFiles, silentVideo);
      const durationSeconds = await muxLegacyShortVideo(binary, silentVideo, audioFile, output);
      const buffer = await readFile(output); const fingerprint = hash(buffer);
      return { url: await upload(job, `final-captionless-${fingerprint.slice(0, 16)}.mp4`, buffer, 'video/mp4'), hash: fingerprint, durationSeconds };
    }),
  });
}
