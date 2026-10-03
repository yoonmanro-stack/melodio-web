import { DANCE_CATEGORY_ID, DANCE_PRESET, DANCE_WORKFLOW, isDanceAudioSelection, isDanceMetadata, type DanceTrack } from './preset';

export class DanceMusicError extends Error {
  constructor(message: string, public code = 'INVALID_REQUEST', public status = 400) { super(message); }
}
export type DanceMusicInput = { requestId: string; isPublic: boolean };
export type DanceMusicRow = {
  id: string; user_id: string; title: string; status: string; is_public: boolean;
  created_at: string; audio_url: string | null; source_audio_url: string | null; license_hash: string;
};
export type DanceMusicRepository = {
  find(id: string): Promise<DanceMusicRow | null>;
  list(userId: string, trackId?: string): Promise<DanceMusicRow[]>;
  active(userId: string): Promise<DanceMusicRow | null>;
  insert(row: DanceMusicRow): Promise<boolean>;
  updatePending(row: DanceMusicRow, change: Partial<DanceMusicRow>): Promise<boolean>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function assertDanceMusicId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new DanceMusicError('올바른 음악 요청 ID가 필요합니다.');
}
export function danceMusicInput(body: unknown): DanceMusicInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DanceMusicError('올바른 음악 요청이 필요합니다.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['requestId', 'isPublic'].includes(key))) throw new DanceMusicError('음악 스타일은 고정 프리셋으로만 생성할 수 있습니다.');
  assertDanceMusicId(input.requestId);
  if (typeof input.isPublic !== 'boolean') throw new DanceMusicError('공개 여부를 선택해 주세요.');
  return { requestId: input.requestId.toLowerCase(), isPublic: input.isPublic };
}
export function musicMetadata(row: DanceMusicRow): Record<string, unknown> {
  try { const value = JSON.parse(row.license_hash); return isDanceMetadata(value) ? value : {}; } catch { return {}; }
}
function submissionState(meta: Record<string, unknown>) {
  const value = meta.danceSubmission;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).state : undefined;
}
export function isActiveDanceMusic(row: DanceMusicRow) {
  const meta = musicMetadata(row);
  return isDanceMetadata(meta) && (row.status === 'generating' || submissionState(meta) === 'ambiguous');
}
export function toDanceTrack(row: DanceMusicRow, storageOrigin: string, now = Date.now()): DanceTrack {
  const meta = musicMetadata(row);
  const state = submissionState(meta);
  const pendingTooLong = row.status === 'generating' && !row.source_audio_url
    && now - Date.parse(row.created_at) > 90_000;
  const status = state === 'ambiguous' || pendingTooLong ? 'attention' : row.status;
  let audioUrl: string | null = null;
  if (row.status === 'completed' && row.audio_url) {
    try {
      const url = new URL(row.audio_url);
      if (url.protocol === 'https:' && url.origin === storageOrigin && !url.username && !url.password
        && !url.search && !url.hash && url.pathname.startsWith('/storage/v1/object/public/melodio-assets/')) audioUrl = url.href;
    } catch { /* A provider or invalid URL must never be exposed as a completed original. */ }
  }
  const duration = Number(meta.duration);
  const durationSeconds = row.status === 'completed' && Number.isFinite(duration) && duration > 0 && duration <= 3600 ? duration : null;
  let savedClip: DanceTrack['savedClip'];
  if (row.status === 'completed' && isDanceAudioSelection(meta.danceAudioSelection)) {
    const clip = meta.danceAudioSelection;
    try {
      const url = new URL(clip.audioUrl);
      if (url.protocol === 'https:' && url.origin === storageOrigin && !url.username && !url.password && !url.search && !url.hash
        && url.pathname.startsWith('/storage/v1/object/public/melodio-assets/dance_challenge/')) {
        savedClip = { audioUrl: url.href, audioHash: clip.audioHash, startSeconds: clip.startSeconds, durationSeconds: 30 };
      }
    } catch { /* Invalid stored clips must never become browser playback sources. */ }
  }
  const variant = meta.danceVariant as Record<string, unknown> | undefined;
  const rootTrackId = variant && typeof variant.rootTrackId === 'string' && UUID.test(variant.rootTrackId) ? variant.rootTrackId : undefined;
  return {
    id: row.id, title: row.title.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200), status,
    audioUrl, durationSeconds, createdAt: row.created_at, isPublic: row.is_public,
    ...(savedClip ? { savedClip, reused: true, ...(rootTrackId ? { rootTrackId } : {}) } : {}),
    ...(typeof meta.danceRequestId === 'string' && UUID.test(meta.danceRequestId) ? { requestId: meta.danceRequestId } : {}),
    ...(status === 'attention' ? { error: '음악 제출 결과 확인이 필요합니다. 중복 생성을 막기 위해 다시 제출하지 않았습니다.' }
      : row.status === 'failed' ? { error: '음악을 완성하지 못했습니다. 저장된 요청 상태를 확인해 주세요.' } : {}),
  };
}

export function createDanceMusicService(deps: {
  repository: DanceMusicRepository; storageOrigin: string; now?: () => Date;
  submit: (options: { style: string; lyrics: string; title: string; instrumental: boolean; model: string; exclude: string; durationSeconds: number }) => Promise<{ taskId: string; model: string }>;
}) {
  const repository = deps.repository;
  const now = () => deps.now?.() || new Date();
  const project = (row: DanceMusicRow) => toDanceTrack(row, deps.storageOrigin, now().getTime());
  function owned(row: DanceMusicRow, userId: string) {
    if (row.user_id !== userId || !isDanceMetadata(musicMetadata(row))) throw new DanceMusicError('음악 요청을 찾을 수 없습니다.', 'NOT_FOUND', 404);
    return row;
  }
  return {
    async list(userId: string, trackId?: string) {
      if (!userId) throw new DanceMusicError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
      if (trackId !== undefined) assertDanceMusicId(trackId);
      return (await repository.list(userId, trackId)).filter(row => row.user_id === userId && isDanceMetadata(musicMetadata(row))).slice(0, 30).map(project);
    },
    async create(userId: string, rawInput: unknown): Promise<DanceTrack> {
      if (!userId) throw new DanceMusicError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
      const input = danceMusicInput(rawInput);
      const existing = await repository.find(input.requestId);
      if (existing) return project(owned(existing, userId));
      const active = await repository.active(userId);
      if (active) throw new DanceMusicError('진행 중이거나 확인이 필요한 음악 요청이 있습니다. 해당 요청을 먼저 확인해 주세요.', 'ACTIVE_REQUEST', 409);
      const stamp = now().toISOString();
      const title = `댄스 훅 · ${stamp.slice(0, 10)} · ${input.requestId.slice(0, 6)}`;
      const meta = {
        workflow: DANCE_WORKFLOW, presetId: DANCE_CATEGORY_ID, presetName: DANCE_PRESET.label,
        sourceMenu: 'dance', danceRequestId: input.requestId,
        dancePreset: { id: DANCE_PRESET.id, bpm: DANCE_PRESET.bpm },
        stylePrompt: DANCE_PRESET.style, excludePrompt: DANCE_PRESET.exclude, lyricsPrompt: DANCE_PRESET.arrangement,
        isInstrumental: true, engine: 'suno_v5', sunoProvider: 'kie', sunoVersion: 'v6', sunoModel: 'V6',
        durationSeconds: DANCE_PRESET.durationSeconds, bpm: String(DANCE_PRESET.bpm),
        isPublic: input.isPublic, auto_voice_convert: false, voiceFeatureMode: 'prompt_style_only',
        danceSubmission: { state: 'submitting', requestedAt: stamp },
      };
      // The primary key is the request token. Once reserved, no retry can make a second paid call.
      const row: DanceMusicRow = { id: input.requestId, user_id: userId, title, status: 'generating',
        is_public: input.isPublic, created_at: stamp, audio_url: null, source_audio_url: null, license_hash: JSON.stringify(meta) };
      const inserted = await repository.insert(row);
      if (!inserted) {
        const winner = await repository.find(input.requestId);
        if (!winner) throw new DanceMusicError('음악 요청 저장 상태를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.', 'STORAGE', 503);
        return project(owned(winner, userId));
      }
      let acceptedTaskReference: string | undefined;
      try {
        const result = await deps.submit({ style: DANCE_PRESET.style, lyrics: DANCE_PRESET.arrangement, title,
          instrumental: true, model: DANCE_PRESET.model, exclude: DANCE_PRESET.exclude, durationSeconds: DANCE_PRESET.durationSeconds });
        if (!result || typeof result.taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(result.taskId) || result.model !== 'V6') {
          throw new Error('Unconfirmed music submission');
        }
        acceptedTaskReference = `suno:kie:${result.taskId}`;
        const accepted: Partial<DanceMusicRow> = { source_audio_url: acceptedTaskReference,
          license_hash: JSON.stringify({ ...meta, sunoSubmittedAt: now().toISOString(), danceSubmission: { state: 'submitted', requestedAt: stamp } }) };
        // Retrying the database write is safe; retrying provider submission is not.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (await repository.updatePending(row, accepted)) return project({ ...row, ...accepted });
            const current = await repository.find(row.id);
            if (current?.user_id === userId && current.source_audio_url === accepted.source_audio_url) return project(current);
          } catch { /* A lost database response may already have committed. Reconcile once. */ }
        }
        throw new Error('Music submission checkpoint unavailable');
      } catch (error) {
        const rejected = error instanceof DanceMusicError && error.code === 'SERVER_CONFIG';
        const change: Partial<DanceMusicRow> = { status: 'failed', license_hash: JSON.stringify({ ...meta,
          danceSubmission: { state: rejected ? 'rejected' : 'ambiguous', requestedAt: stamp,
            ...(acceptedTaskReference ? { acceptedTaskReference } : {}) } }) };
        try {
          if (await repository.updatePending(row, change)) return project({ ...row, ...change });
          const current = await repository.find(row.id);
          if (current?.user_id === userId) return project(current);
        } catch { /* Reservation remains non-retryable even if recording the failure is unavailable. */ }
        throw new DanceMusicError('음악 제출 결과를 확인하지 못했습니다. 같은 요청 ID로 저장 상태를 확인해 주세요.', 'SUBMISSION_UNCONFIRMED', 503);
      }
    },
  };
}
