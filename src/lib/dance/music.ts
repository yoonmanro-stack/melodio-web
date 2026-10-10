import { DANCE_CATEGORY_ID, DANCE_PRESET, DANCE_WORKFLOW, isDanceAudioSelection, isDanceMetadata, type DanceTrack } from './preset';
import { getDanceMusicSpec, resolveDanceMusicSpec, type DanceVocalPreference } from './musicProfiles';
import { randomUUID } from 'node:crypto';
import { DANCE_MUSIC_PROFILES } from './musicProfiles';
import type { DanceConceptMusicInput, DanceConceptMusicPlan } from './conceptMusicPlan';

export class DanceMusicError extends Error {
  constructor(message: string, public code = 'INVALID_REQUEST', public status = 400) { super(message); }
}
export type DanceMusicInput = { requestId: string; isPublic: boolean; musicProfileId: string; vocalPreference: DanceVocalPreference }
  | (DanceConceptMusicInput & { isPublic: boolean; musicMode: 'concept' });
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
  if (input.musicMode === 'concept') {
    if (Object.keys(input).some(key => !['requestId', 'isPublic', 'musicMode', 'coreContext', 'musicProfileId', 'vocalPreference'].includes(key))) throw new DanceMusicError('컨셉과 선택한 음악·보컬 설정만 입력해 주세요.');
    assertDanceMusicId(input.requestId);
    const vocalPreference = input.vocalPreference === undefined ? 'recommended' : input.vocalPreference;
    if (typeof input.isPublic !== 'boolean' || typeof input.coreContext !== 'string' || !input.coreContext.trim() || input.coreContext.trim().length > 1000
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]|data:|base64/i.test(input.coreContext)
      || (input.musicProfileId !== undefined && !DANCE_MUSIC_PROFILES.some(profile => profile.id === input.musicProfileId))
      || !['recommended', 'on', 'off'].includes(vocalPreference as string)) throw new DanceMusicError('1,000자 이내 컨셉과 음악·보컬 선택을 확인해 주세요.');
    return { requestId: input.requestId.toLowerCase(), isPublic: input.isPublic, musicMode: 'concept', coreContext: input.coreContext.trim(),
      vocalPreference: vocalPreference as DanceVocalPreference, ...(typeof input.musicProfileId === 'string' ? { musicProfileId: input.musicProfileId } : {}) };
  }
  if (Object.keys(input).some(key => !['requestId', 'isPublic', 'musicProfileId', 'vocalPreference'].includes(key))) throw new DanceMusicError('목록의 댄스 음악과 보컬 옵션만 선택할 수 있습니다.');
  assertDanceMusicId(input.requestId);
  if (typeof input.isPublic !== 'boolean') throw new DanceMusicError('공개 여부를 선택해 주세요.');
  let spec;
  try { spec = resolveDanceMusicSpec(input.musicProfileId, input.vocalPreference, input.requestId.toLowerCase()); }
  catch (error) { throw new DanceMusicError(error instanceof Error ? error.message : '음악 선택을 확인해 주세요.'); }
  return { requestId: input.requestId.toLowerCase(), isPublic: input.isPublic, musicProfileId: spec.id,
    vocalPreference: (input.vocalPreference === undefined ? 'recommended' : input.vocalPreference) as DanceVocalPreference };
}
export function musicMetadata(row: DanceMusicRow): Record<string, unknown> {
  try { const value = JSON.parse(row.license_hash); return isDanceMetadata(value) ? value : {}; } catch { return {}; }
}
export function danceConceptCheckpoint(row: DanceMusicRow): string | null {
  const meta = musicMetadata(row);
  if (meta.danceMusicMode !== 'concept') return null;
  const token = meta.danceConceptCheckpoint;
  // The server-owned nonce is the first serialized key. An anchored matcher cannot match nested copies.
  if (typeof token !== 'string' || !UUID.test(token) || !row.license_hash.startsWith(`{"danceConceptCheckpoint":"${token}",`)) throw new DanceMusicError('음악 설계 체크포인트를 확인하지 못했습니다.', 'STORAGE', 503);
  return token;
}
function submissionState(meta: Record<string, unknown>) {
  const value = meta.danceSubmission;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).state : undefined;
}
export function isActiveDanceMusic(row: DanceMusicRow) {
  const meta = musicMetadata(row);
  return isDanceMetadata(meta) && (row.status === 'generating' || submissionState(meta) === 'ambiguous' || (meta.danceMusicMode === 'concept' && (meta.danceMusicPlanning as Record<string, unknown> | undefined)?.state === 'attention'));
}
export function toDanceTrack(row: DanceMusicRow, storageOrigin: string, now = Date.now()): DanceTrack & { musicProfileId?: string; musicLabel?: string; instrumental?: boolean } {
  const meta = musicMetadata(row);
  const state = submissionState(meta);
  const concept = meta.danceMusicMode === 'concept';
  const planning = concept && meta.danceMusicPlanning && typeof meta.danceMusicPlanning === 'object' ? meta.danceMusicPlanning as Record<string, unknown> : undefined;
  const pendingTooLong = row.status === 'generating' && !row.source_audio_url
    && now - Date.parse(row.created_at) > (concept ? 270_000 : 90_000);
  const status = state === 'ambiguous' || planning?.state === 'attention' || pendingTooLong ? 'attention' : row.status;
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
  const music = getDanceMusicSpec(meta);
  return {
    id: row.id, title: row.title.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200), status,
    audioUrl, durationSeconds, createdAt: row.created_at, isPublic: row.is_public,
    ...(music ? { musicProfileId: music.id, musicLabel: music.label, instrumental: music.instrumental } : {}),
    ...(concept ? { musicMode: 'concept' as const, coreContext: typeof meta.danceCoreContext === 'string' ? meta.danceCoreContext.slice(0, 1000) : '',
      musicPlanningState: (planning?.state === 'submitting' ? 'planning' : planning?.state === 'planned' ? 'planned' : 'attention') as 'planning' | 'planned' | 'attention',
      ...(typeof meta.danceMusicProfileLock === 'string' ? { musicProfileLock: meta.danceMusicProfileLock } : {}),
      ...((meta.danceSubmission as Record<string, unknown> | undefined)?.acceptedTaskReference && /^suno:kie:[a-zA-Z0-9_-]{1,200}$/.test(String((meta.danceSubmission as Record<string, unknown>).acceptedTaskReference))
        ? { acceptedTaskReference: String((meta.danceSubmission as Record<string, unknown>).acceptedTaskReference) } : {}),
      vocalPreference: meta.danceVocalPreference as DanceVocalPreference } : {}),
    ...(savedClip ? { savedClip, reused: true, ...(rootTrackId ? { rootTrackId } : {}) } : {}),
    ...(typeof meta.danceRequestId === 'string' && UUID.test(meta.danceRequestId) ? { requestId: meta.danceRequestId } : {}),
    ...(status === 'attention' ? { error: planning?.state === 'attention' ? '음악 설계 결과 확인이 필요합니다. 원래 컨셉과 요청을 보존하고 자동 재설계하지 않았습니다.' : '음악 제출 결과 확인이 필요합니다. 중복 생성을 막기 위해 다시 제출하지 않았습니다.' }
      : row.status === 'failed' ? { error: '음악을 완성하지 못했습니다. 저장된 요청 상태를 확인해 주세요.' } : {}),
  };
}

export function createDanceMusicService(deps: {
  repository: DanceMusicRepository; storageOrigin: string; now?: () => Date;
  planConceptMusic?: (input: DanceConceptMusicInput) => Promise<DanceConceptMusicPlan>;
  submit: (options: { style: string; lyrics: string; title: string; instrumental: boolean; model: string; exclude: string; naturalFullSong: boolean; vocalGender?: 'm' | 'f' }) => Promise<{ taskId: string; model: string }>;
}) {
  const repository = deps.repository;
  const now = () => deps.now?.() || new Date();
  const project = (row: DanceMusicRow) => toDanceTrack(row, deps.storageOrigin, now().getTime());
  function owned(row: DanceMusicRow, userId: string) {
    if (row.user_id !== userId || !isDanceMetadata(musicMetadata(row))) throw new DanceMusicError('음악 요청을 찾을 수 없습니다.', 'NOT_FOUND', 404);
    return row;
  }
  async function checkpoint(row: DanceMusicRow, change: Partial<DanceMusicRow>, userId: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (await repository.updatePending(row, change)) return { ...row, ...change };
        const current = await repository.find(row.id);
        if (current?.user_id === userId && current.license_hash === change.license_hash) return current;
      } catch { /* Reconcile the same logical checkpoint; never repeat a paid request. */ }
    }
    throw new DanceMusicError('음악 설계 체크포인트를 확인하지 못했습니다.', 'STORAGE', 503);
  }
  async function createConcept(userId: string, input: Extract<DanceMusicInput, { musicMode: 'concept' }>) {
    const existing = await repository.find(input.requestId);
    if (existing) return project(owned(existing, userId));
    if (await repository.active(userId)) throw new DanceMusicError('진행 중이거나 확인이 필요한 음악 요청을 먼저 확인해 주세요.', 'ACTIVE_REQUEST', 409);
    if (!deps.planConceptMusic) throw new DanceMusicError('음악 설계 설정을 확인해 주세요.', 'SERVER_CONFIG', 503);
    const stamp = now().toISOString();
    let meta: Record<string, unknown> = { danceConceptCheckpoint: randomUUID(), workflow: DANCE_WORKFLOW, presetId: DANCE_CATEGORY_ID, sourceMenu: 'dance', danceRequestId: input.requestId,
      danceMusicMode: 'concept', danceCoreContext: input.coreContext, danceVocalPreference: input.vocalPreference,
      ...(input.musicProfileId ? { danceMusicProfileLock: input.musicProfileId } : {}),
      danceMusicPlanning: { state: 'submitting', planningSubmitted: true, requestedAt: stamp }, danceSubmission: { state: 'planning', requestedAt: stamp },
      isPublic: input.isPublic, auto_voice_convert: false, voiceFeatureMode: 'prompt_style_only' };
    let row: DanceMusicRow = { id: input.requestId, user_id: userId, title: '컨셉에 맞는 새 음악 설계 중', status: 'generating',
      is_public: input.isPublic, created_at: stamp, audio_url: null, source_audio_url: null, license_hash: JSON.stringify(meta) };
    if (!await repository.insert(row)) {
      const winner = await repository.find(row.id);
      if (!winner) throw new DanceMusicError('음악 요청 저장 상태를 확인하지 못했습니다.', 'STORAGE', 503);
      return project(owned(winner, userId));
    }
    let acceptedTaskReference: string | undefined;
    let planned = false;
    try {
      const plan = await deps.planConceptMusic(input);
      const spec = getDanceMusicSpec({ danceMusic: plan.music });
      if (!spec || typeof plan.title !== 'string' || !plan.title.trim() || plan.title.length > 150 || typeof plan.genre !== 'string' || !plan.genre.trim()
        || (input.musicProfileId && (spec.id !== input.musicProfileId || spec.bpm !== DANCE_MUSIC_PROFILES.find(profile => profile.id === input.musicProfileId)!.bpm))
        || (input.vocalPreference === 'on' && spec.instrumental) || (input.vocalPreference === 'off' && !spec.instrumental)) throw new DanceMusicError('음악 설계가 저장된 선택과 다릅니다.', 'MUSIC_PLAN_INVALID');
      meta = { ...meta, presetName: spec.label, dancePreset: { id: spec.id, bpm: spec.bpm }, danceMusic: spec, danceGenre: plan.genre,
        stylePrompt: spec.style, excludePrompt: spec.exclude, lyricsPrompt: spec.lyrics, isInstrumental: spec.instrumental, instrumental: spec.instrumental,
        engine: 'suno_v5', sunoProvider: 'kie', sunoVersion: 'v6', sunoModel: 'V6', naturalFullSong: true, bpm: String(spec.bpm),
        danceConceptCheckpoint: randomUUID(), danceMusicPlanning: { state: 'planned', planningSubmitted: true, requestedAt: stamp, plannedAt: now().toISOString() },
        danceSubmission: { state: 'submitting', requestedAt: stamp } };
      row = await checkpoint(row, { title: plan.title.trim(), license_hash: JSON.stringify(meta) }, userId); planned = true;
      const result = await deps.submit({ style: spec.style, lyrics: spec.lyrics, title: row.title, instrumental: spec.instrumental,
        model: DANCE_PRESET.model, exclude: spec.exclude, naturalFullSong: true,
        ...(spec.vocalGender ? { vocalGender: spec.vocalGender === 'male' ? 'm' as const : 'f' as const } : {}) });
      if (!result || typeof result.taskId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(result.taskId) || result.model !== 'V6') throw new Error('unconfirmed');
      acceptedTaskReference = `suno:kie:${result.taskId}`;
      const accepted = { ...meta, danceConceptCheckpoint: randomUUID(), sunoSubmittedAt: now().toISOString(), danceSubmission: { state: 'submitted', requestedAt: stamp } };
      row = await checkpoint(row, { source_audio_url: acceptedTaskReference, license_hash: JSON.stringify(accepted) }, userId);
      return project(row);
    } catch {
      const held = { ...meta, danceConceptCheckpoint: randomUUID(),
        ...(!planned ? { danceMusicPlanning: { state: 'attention', planningSubmitted: true, requestedAt: stamp } } : {}),
        danceSubmission: { state: planned ? 'ambiguous' : 'planning', requestedAt: stamp, ...(acceptedTaskReference ? { acceptedTaskReference } : {}) } };
      try { row = await checkpoint(row, { status: 'failed', license_hash: JSON.stringify(held) }, userId); return project(row); }
      catch {
        let current: DanceMusicRow | null = null;
        try { current = await repository.find(row.id); } catch { /* Return the validated task ID even during a total storage outage. */ }
        if (acceptedTaskReference) {
          if (current?.user_id === userId && (current.source_audio_url === acceptedTaskReference || project(current).audioUrl)) return project(current);
          return { ...project(current?.user_id === userId ? current : row), status: 'attention', acceptedTaskReference,
            error: '음악 요청 ID를 받았으나 저장하지 못했습니다. 재제출하지 말고 복구 참조를 보관해 주세요.' };
        }
        if (current?.user_id === userId) return project(current);
        throw new DanceMusicError('음악 설계·제출 결과를 확인하지 못했습니다. 같은 요청 ID로 조회해 주세요.', 'SUBMISSION_UNCONFIRMED', 503);
      }
    }
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
      if ('musicMode' in input) return createConcept(userId, input);
      const existing = await repository.find(input.requestId);
      if (existing) return project(owned(existing, userId));
      const active = await repository.active(userId);
      if (active) throw new DanceMusicError('진행 중이거나 확인이 필요한 음악 요청이 있습니다. 해당 요청을 먼저 확인해 주세요.', 'ACTIVE_REQUEST', 409);
      const stamp = now().toISOString();
      const spec = resolveDanceMusicSpec(input.musicProfileId, input.vocalPreference, input.requestId);
      const title = `${spec.label} · ${stamp.slice(0, 10)} · ${input.requestId.slice(0, 6)}`;
      const meta = {
        workflow: DANCE_WORKFLOW, presetId: DANCE_CATEGORY_ID, presetName: spec.label,
        sourceMenu: 'dance', danceRequestId: input.requestId,
        dancePreset: { id: spec.id, bpm: spec.bpm }, danceMusic: spec, danceVocalPreference: input.vocalPreference,
        stylePrompt: spec.style, excludePrompt: spec.exclude, lyricsPrompt: spec.lyrics,
        isInstrumental: spec.instrumental, instrumental: spec.instrumental, engine: 'suno_v5', sunoProvider: 'kie', sunoVersion: 'v6', sunoModel: 'V6',
        naturalFullSong: true, bpm: String(spec.bpm),
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
        const result = await deps.submit({ style: spec.style, lyrics: spec.lyrics, title,
          instrumental: spec.instrumental, model: DANCE_PRESET.model, exclude: spec.exclude, naturalFullSong: true,
          ...(spec.vocalGender ? { vocalGender: spec.vocalGender === 'male' ? 'm' as const : 'f' as const } : {}) });
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
