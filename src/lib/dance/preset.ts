/** Versioned pilot: independently composed music, never reference-audio conditioning. */
export const DANCE_CATEGORY_ID = 'dance_challenge' as const;
export const DANCE_WORKFLOW = 'dance-music-first-v1' as const;
export const DANCE_PRESET = {
  id: 'dance-hook-instrumental-v1',
  label: '댄스 훅 · 테스트 스타일',
  description: '138 BPM · 경쾌한 리듬 · 반복 멜로디 · 보컬 없음',
  bpm: 138,
  durationSeconds: 195,
  instrumental: true,
  model: 'v6',
  style: 'Original playful electronic dance instrumental, 138 BPM, steady four-on-the-floor kick, springy syncopated bass, crisp handclaps and dry percussion, bright plucked synth lead. Invent a fresh memorable two-bar melodic motif with call-and-response instrumental phrases. Hook arrives immediately and returns with small rhythmic and timbral variations. Buoyant, charming, modern festival energy, clear beat accents for expressive movement, clean punchy balanced mix, complete musical phrases, clean ending. Independently composed melody and arrangement.',
  exclude: 'recognizable existing melodies, samples, covers, artist imitation, vocals, speech, slow cinematic intro, long ambient breakdown, harsh distortion',
  arrangement: '[Instrumental]\n[Immediate original melodic hook]\n[Groove variation]\n[Main hook reprise]\n[Percussion variation]\n[Full hook return]\n[Clean musical ending]',
} as const;
export const DANCE_CLIP_SECONDS = 30;
export function isDanceMetadata(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (value as Record<string, unknown>).workflow === DANCE_WORKFLOW
    && (value as Record<string, unknown>).presetId === DANCE_CATEGORY_ID);
}
export type DanceAudioSelection = {
  audioUrl: string; audioHash: string; sourceAudioHash: string; sourceDurationSeconds: number;
  startSeconds: number; durationSeconds: 30; bpm?: number; onsetSeconds?: number[];
};
export function isDanceAudioSelection(value: unknown): value is DanceAudioSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const clip = value as DanceAudioSelection;
  return typeof clip.audioUrl === 'string' && /^[a-f0-9]{64}$/.test(clip.audioHash)
    && /^[a-f0-9]{64}$/.test(clip.sourceAudioHash) && clip.durationSeconds === 30
    && Number.isFinite(clip.startSeconds) && clip.startSeconds >= 0
    && Number.isFinite(clip.sourceDurationSeconds) && clip.sourceDurationSeconds <= 3600
    && clip.startSeconds + 30 <= clip.sourceDurationSeconds + 0.00001
    && (clip.bpm === undefined || (Number.isFinite(clip.bpm) && clip.bpm > 0))
    && (clip.onsetSeconds === undefined || (Array.isArray(clip.onsetSeconds) && clip.onsetSeconds.length <= 10000
      && clip.onsetSeconds.every(second => Number.isFinite(second) && second >= 0 && second < 30)));
}
export type DanceTrack = { id: string; title: string; status: string; audioUrl: string | null; durationSeconds: number | null; createdAt: string; isPublic: boolean; requestId?: string; error?: string;
  savedClip?: Pick<DanceAudioSelection, 'audioUrl' | 'audioHash' | 'startSeconds' | 'durationSeconds'>; reused?: boolean; rootTrackId?: string };
export type DancePlan = { title: string; summary: string; identity: string; imagePrompt: string; clips: [string, string] };
export type DancePlanFailure = {
  code: 'PLAN_TIMEOUT' | 'PLAN_CONNECTION' | 'PLAN_HTTP' | 'PLAN_RESPONSE' | 'PLAN_INVALID' | 'PLAN_LENGTH';
  kind: 'timeout' | 'connection' | 'http' | 'response'; phase: 'preparation' | 'request' | 'response';
  elapsedMs: number; timeoutMs: number; httpStatus?: number; providerRequestId?: string;
};
export type DanceVideoJob = {
  id: string; trackId: string; status: 'preparing' | 'ready' | 'image' | 'clip1' | 'bridge' | 'clip2' | 'render' | 'completed' | 'attention';
  startSeconds: number; durationSeconds: 30; visualBrief: string; createdAt: string; updatedAt: string;
  audioUrl?: string; sourceAudioHash?: string; audioHash?: string; sourceDurationSeconds?: number;
  bpm?: number; onsetSeconds?: number[]; plan?: DancePlan; imageUrl?: string; bridgeUrl?: string;
  clip1RequestId?: string; clip2RequestId?: string; clip1Url?: string; clip2Url?: string; videoUrl?: string;
  planningSubmitted?: boolean;
  planFailure?: DancePlanFailure;
  inFlight?: { action: string; token: string; at: string }; error?: string;
};
