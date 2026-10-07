export type SunoModel = 'V6' | 'V6_MINI' | 'V6_WILD';
export interface SunoJobOptions {
  style: string;
  lyrics?: string;
  /** Structured source used to keep arrangement descriptions out of sung lyrics. */
  lyricsSections?: unknown;
  title?: string;
  instrumental?: boolean;
  model?: string;
  exclude?: string;
  durationSeconds?: number | string;
  /** Complete studio songs end naturally; do not send an imposed duration. */
  naturalFullSong?: boolean;
  /** Known production context used locally; never sent as vendor input fields. */
  sourceMenu?: unknown;
  presetId?: unknown;
  /** True when the caller resolved a chosen vocal style or registered voice. */
  vocalProfileSpecified?: boolean;
  vocalGender?: string;
  /** Server-resolved Kie/Suno Voice ID. */
  personaId?: string;
  personaModel?: 'style_persona' | 'voice_persona';
}
export interface SunoConfig { apiKey: string; apiBaseUrl: string }
export interface SunoClip {
  id: string;
  title?: string;
  audio_url?: string;
  image_url?: string;
  duration?: number;
  status: string;
}
export interface SunoTaskStatus {
  state: 'processing' | 'failed' | 'complete' | 'held';
  clips: SunoClip[];
  progress?: number;
  reason?: 'legacy_not_supported';
}
export const SUNO_TIMEOUT_MS: number;
export class SunoProviderError extends Error { code: number }
export function resolveSunoModel(version?: string): SunoModel;
export function sunoVersionLabel(model?: string): string;
export function resolveDurationSeconds(value: unknown, fallback?: number): number;
export function fitSunoStylePrompt(value: unknown, limit?: number): string;
export function kieTaskReference(taskId: string): string;
export function parseSunoTaskReference(reference: string): { provider: 'kie' | 'legacy'; taskId: string };
export function normalizeKieConfig(config: SunoConfig): SunoConfig;
export function getKieConfig(): SunoConfig;
export function buildKieSunoRequest(options: SunoJobOptions): object;
export function submitKieSunoJob(options: SunoJobOptions, config?: SunoConfig, fetchImpl?: typeof fetch): Promise<{ taskId: string; model: SunoModel }>;
export function fetchSunoTask(reference: string, config?: SunoConfig, fetchImpl?: typeof fetch): Promise<SunoTaskStatus>;
