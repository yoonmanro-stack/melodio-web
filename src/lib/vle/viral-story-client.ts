/** Browser orchestration for the opt-in, durable two-clip Viral endpoint. */
export const VIRAL_STORY_VIDEO_CATEGORIES = new Set([
  'drama', 'relationship', 'human', 'trend', 'challenge', 'brand',
  'history', 'parenting', 'food_diet', 'horror_mystery',
]);

export type ViralStoryVideoJob = {
  id: string;
  trackId: string;
  version: 1;
  category: string;
  status: 'audio' | 'clip1' | 'bridge' | 'clip2' | 'render' | 'completed' | 'held';
  progress: number;
  inFlight: boolean;
  canResume: boolean;
  failureCode?: string;
  failureMessage?: string;
  videoUrl?: string;
  durationSeconds?: number;
  clips?: string[];
  is30SecFull?: boolean;
  updatedAt: string;
  inputFingerprint: string;
  prompt: string;
  allowDance: boolean;
  cutCadenceSeconds: number;
};

export type ViralStoryVideoInput = {
  trackId: string;
  prompt: string;
  category: string;
  allowDance: boolean;
  cutCadenceSeconds: number;
  audioUrl?: string;
};

export type ViralStoryRecoveryToken = {
  version: 1;
  trackId: string;
  jobId: string;
  inputFingerprint?: string;
  uncertain: boolean;
  rejected?: true;
};

export type ViralStoryClientState = {
  job: ViralStoryVideoJob | null;
  busy: boolean;
  uncertain: boolean;
  error: string | null;
};

type ClientStorage = Pick<Storage, 'getItem' | 'setItem'>;
type ClientOptions = {
  ownerId: string;
  trackId: string;
  storage?: ClientStorage;
  fetch?: typeof fetch;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  onState: (state: ViralStoryClientState) => void;
};

const endpoint = '/api/viral-cf/grok-video/jobs';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(['audio', 'clip1', 'bridge', 'clip2', 'render', 'completed', 'held']);
const unsafeResumeCodes = new Set(['UNKNOWN_SUBMISSION', 'PROVIDER_RESULT', 'PROVIDER_FAILED', 'PROVIDER_TERMINAL_FAILURE',
  'AUDIO_DURATION', 'AUDIO_HASH', 'MEDIA_HASH', 'CLIP_DURATION', 'FINAL_DURATION', 'FINAL_SIZE']);
const rejectedCreateCodes = new Set(['INPUT', 'PROMPT_LENGTH', 'ID', 'AUDIO_MISMATCH', 'AUDIO_REQUIRED', 'TRACK_CATEGORY',
  'UNAUTHORIZED', 'ORIGIN', 'CONTENT_TYPE', 'BODY', 'SERVER_CONFIG']);
const uncertainMessage = '영상 요청 결과를 확인하지 못했습니다. 저장된 작업 상태를 확인한 뒤 이어갈 수 있습니다.';
const missingJobMessage = '이전 영상 요청의 저장 상태를 아직 확인하지 못했습니다. 새 요청을 보내지 않고 상태를 다시 확인해 주세요.';
class RejectedCreation extends Error {}

export function isViralStoryTrackId(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function storageKey(ownerId: string, trackId?: string) {
  return `melodio:viral-video:v1:${ownerId}:${trackId || 'active'}`;
}

export function readViralStoryRecovery(storage: ClientStorage | undefined, ownerId: string, trackId?: string): ViralStoryRecoveryToken | null {
  try {
    const value = JSON.parse(storage?.getItem(storageKey(ownerId, trackId)) || 'null');
    if (value?.version !== 1 || !isViralStoryTrackId(value.trackId) || !isViralStoryTrackId(value.jobId)
      || (trackId && value.trackId !== trackId)) return null;
    return {
      version: 1, trackId: value.trackId, jobId: value.jobId, uncertain: value.uncertain === true,
      ...(value.rejected === true ? { rejected: true as const } : {}),
      ...(typeof value.inputFingerprint === 'string' && /^[0-9a-f]{64}$/i.test(value.inputFingerprint)
        ? { inputFingerprint: value.inputFingerprint } : {}),
    };
  } catch { return null; }
}

function safeMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

function readJob(value: unknown, trackId: string): ViralStoryVideoJob | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(uncertainMessage);
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !isViralStoryTrackId(row.id) || row.trackId !== trackId
    || typeof row.category !== 'string' || !VIRAL_STORY_VIDEO_CATEGORIES.has(row.category)
    || typeof row.status !== 'string' || !statuses.has(row.status)
    || typeof row.progress !== 'number' || !Number.isFinite(row.progress)
    || typeof row.inFlight !== 'boolean' || typeof row.canResume !== 'boolean'
    || typeof row.inputFingerprint !== 'string' || !/^[0-9a-f]{64}$/i.test(row.inputFingerprint)
    || typeof row.prompt !== 'string' || row.prompt.length > 2400
    || typeof row.allowDance !== 'boolean' || typeof row.cutCadenceSeconds !== 'number' || !Number.isFinite(row.cutCadenceSeconds)
    || typeof row.updatedAt !== 'string' || row.updatedAt.length > 80
    || (row.status === 'completed' && (!safeMediaUrl(row.videoUrl)
      || typeof row.durationSeconds !== 'number' || !Number.isFinite(row.durationSeconds) || Math.abs(row.durationSeconds - 30) > 0.05
      || !Array.isArray(row.clips) || row.clips.length !== 2 || !row.clips.every(safeMediaUrl)
      || row.is30SecFull !== true))) throw new Error(uncertainMessage);
  return {
    id: row.id, trackId, version: 1, category: row.category,
    status: row.status as ViralStoryVideoJob['status'], progress: Math.max(0, Math.min(100, row.progress)),
    inFlight: row.inFlight, canResume: row.canResume, updatedAt: row.updatedAt, inputFingerprint: row.inputFingerprint,
    prompt: row.prompt, allowDance: row.allowDance, cutCadenceSeconds: row.cutCadenceSeconds,
    ...(typeof row.failureCode === 'string' && /^[A-Z0-9_]{1,80}$/.test(row.failureCode) ? { failureCode: row.failureCode } : {}),
    ...(typeof row.failureMessage === 'string' && row.failureMessage.length <= 360 && !row.failureMessage.includes('data:')
      ? { failureMessage: row.failureMessage } : {}),
    ...(safeMediaUrl(row.videoUrl) ? { videoUrl: row.videoUrl } : {}),
    ...(typeof row.durationSeconds === 'number' && Number.isFinite(row.durationSeconds) && row.durationSeconds > 0
      ? { durationSeconds: row.durationSeconds } : {}),
    ...(Array.isArray(row.clips) ? { clips: row.clips.filter(safeMediaUrl).slice(0, 2) } : {}),
    ...(row.is30SecFull === true ? { is30SecFull: true } : {}),
  };
}

export function canResumeViralStoryJob(job: ViralStoryVideoJob): boolean {
  return job.status === 'held' && job.canResume && !unsafeResumeCodes.has(job.failureCode || '');
}

export function viralStoryProgressLabel(job: ViralStoryVideoJob | null): string {
  if (!job) return '저장된 영상 상태 확인 중';
  switch (job.status) {
    case 'audio': return '30초 음원 확인 중';
    case 'clip1': return '첫 번째 15초 영상 생성 중';
    case 'bridge': return '첫 영상의 마지막 장면 연결 중';
    case 'clip2': return '이어지는 두 번째 15초 영상 생성 중';
    case 'render': return '30초 영상과 음원 합성 중';
    case 'completed': return '30초 영상과 음원 결합 완료';
    case 'held': return '저장된 영상 작업 확인 필요';
  }
}

async function fingerprint(input: ViralStoryVideoInput): Promise<string> {
  const canonical = JSON.stringify({
    version: 1, trackId: input.trackId, prompt: input.prompt.trim(), category: input.category,
    allowDance: input.allowDance, cutCadenceSeconds: input.cutCadenceSeconds, audioUrl: input.audioUrl || '',
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(new Error('cancelled')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, milliseconds);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

/** One client instance belongs to one signed-in owner and one completed track. */
export class ViralStoryVideoClient {
  private state: ViralStoryClientState = { job: null, busy: false, uncertain: false, error: null };
  private token: ViralStoryRecoveryToken | null;
  private disposed = false;
  private running = false;
  private controller = new AbortController();
  private requestFetch: typeof fetch;

  constructor(private options: ClientOptions) {
    this.requestFetch = options.fetch || fetch;
    this.token = readViralStoryRecovery(options.storage, options.ownerId, options.trackId);
    this.state.uncertain = this.token?.uncertain || false;
  }

  dispose() { this.disposed = true; this.controller.abort(); }

  private update(next: Partial<ViralStoryClientState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...next };
    this.options.onState(this.state);
  }

  private save(token: ViralStoryRecoveryToken) {
    if (this.disposed) return;
    this.token = token;
    try {
      const compact = JSON.stringify(token);
      this.options.storage?.setItem(storageKey(this.options.ownerId, this.options.trackId), compact);
      this.options.storage?.setItem(storageKey(this.options.ownerId), compact);
    } catch { /* Server discovery by owned track remains available. */ }
  }

  private accept(job: ViralStoryVideoJob | null) {
    if (this.disposed) return;
    if (job) {
      this.save({ version: 1, trackId: job.trackId, jobId: job.id, uncertain: false,
        ...(this.token?.jobId === job.id && this.token.inputFingerprint ? { inputFingerprint: this.token.inputFingerprint } : {}) });
    }
    const pending = !job && !!this.token && !this.token.rejected;
    this.update({ job, uncertain: pending,
      error: job?.status === 'held' ? job.failureMessage || '저장된 영상 작업의 상태를 확인해 주세요.' : pending ? missingJobMessage : null });
  }

  private async request(body?: Record<string, unknown>): Promise<ViralStoryVideoJob | null> {
    const response = await this.requestFetch(body ? endpoint : `${endpoint}?trackId=${encodeURIComponent(this.options.trackId)}`, {
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      cache: 'no-store', signal: this.controller.signal,
    });
    let result: { success?: boolean; job?: unknown; code?: unknown; error?: unknown };
    try { result = await response.json(); } catch { throw new Error(uncertainMessage); }
    if (!response.ok && body?.action === 'create' && typeof result.code === 'string' && rejectedCreateCodes.has(result.code)) {
      const message = typeof result.error === 'string' && result.error.length <= 360 && !result.error.includes('data:')
        ? result.error : '영상 기획과 선택한 음원을 확인해 주세요. 요청은 시작되지 않았습니다.';
      throw new RejectedCreation(message);
    }
    if (!response.ok || result.success !== true || !Object.prototype.hasOwnProperty.call(result, 'job')) throw new Error(uncertainMessage);
    const job = readJob(result.job, this.options.trackId);
    if (body && !job) throw new Error(uncertainMessage);
    return job;
  }

  /** Restoring or refreshing never advances a saved job. */
  async restore(): Promise<void> {
    if (this.running || this.disposed) return;
    this.running = true;
    this.update({ busy: true, error: null });
    try { this.accept(await this.request()); }
    catch { this.update({ uncertain: true, error: uncertainMessage }); }
    finally { this.running = false; this.update({ busy: false }); }
  }

  /** Explicit user action; duplicate clicks share the synchronous running guard. */
  async start(input?: ViralStoryVideoInput): Promise<void> {
    if (this.running || this.disposed) return;
    const frozenInput = input ? { ...input } : undefined;
    this.running = true;
    this.update({ busy: true, error: null });
    try {
      let current = await this.request();
      if (this.disposed) return;
      this.accept(current);
      if (!current) {
        // Any pending identity is kept after an unknown response, even if a later read is empty.
        if ((this.token && !this.token.rejected) || this.state.uncertain) { this.update({ uncertain: true, error: missingJobMessage }); return; }
        if (!frozenInput || frozenInput.trackId !== this.options.trackId || !VIRAL_STORY_VIDEO_CATEGORIES.has(frozenInput.category) || !frozenInput.prompt.trim()) {
          this.update({ error: '완성된 음원과 영상 기획을 먼저 선택해 주세요.' }); return;
        }
        const inputFingerprint = await fingerprint(frozenInput);
        if (this.disposed) return;
        const requestId = crypto.randomUUID();
        this.save({ version: 1, trackId: this.options.trackId, jobId: requestId, inputFingerprint, uncertain: true });
        current = await this.request({ action: 'create', ...frozenInput, prompt: frozenInput.prompt.trim(), requestId });
        if (this.disposed) return;
        this.accept(current);
      }
      if (!current || current.status === 'completed') return;
      if (current.status === 'held') {
        if (!canResumeViralStoryJob(current)) return;
        current = await this.request({ action: 'resume', trackId: this.options.trackId, jobId: current.id });
        if (this.disposed) return;
        this.accept(current);
      }
      while (current && current.status !== 'completed' && current.status !== 'held' && !this.disposed) {
        await (this.options.wait || wait)(5000, this.controller.signal);
        if (this.disposed) return;
        current = current.inFlight
          ? await this.request()
          : await this.request({ action: 'advance', trackId: this.options.trackId, jobId: current.id });
        if (this.disposed) return;
        this.accept(current);
      }
    } catch (reason) {
      if (this.disposed) return;
      if (reason instanceof RejectedCreation) {
        if (this.token) this.save({ ...this.token, uncertain: false, rejected: true });
        this.update({ uncertain: false, error: reason.message });
        return;
      }
      if (this.token) this.save({ ...this.token, uncertain: true });
      this.update({ uncertain: true, error: uncertainMessage });
      // A lost mutation response gets only a read. Continuing requires another button click.
      try {
        const recovered = await this.request();
        if (this.disposed) return;
        this.accept(recovered);
        if (recovered && recovered.status !== 'completed' && recovered.status !== 'held') this.update({ error: uncertainMessage });
      } catch { /* Preserve the existing identity and the uncertainty message. */ }
    } finally {
      this.running = false;
      this.update({ busy: false });
    }
  }
}
