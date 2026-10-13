export type RainQualityCheck = { id: string; status: 'passed' | 'warning' | 'failed' | 'not_measured'; message: string };
export type RainQualitySummary = {
  version: string;
  directionVersion: string;
  /** Objective render and waveform checks only; does not establish scene or audio content quality. */
  technicalStatus: 'passed' | 'warning' | 'failed';
  /** Always required until source-specific audio listening evidence is supported. */
  reviewDecision: 'required' | 'sample' | 'not_required';
  /** Includes audio_content_review_required regardless of representative profile approvals. */
  reasons: string[];
  profiles: string[];
  unreviewedProfiles: string[];
  checks: RainQualityCheck[];
};
export function sampleJob(jobId: string, every?: number): boolean;
export function evaluatePreviewQuality(input: { direction?: unknown; report?: unknown; jobId?: string; models?: Record<string, string>; approvals?: unknown[]; sampleEvery?: number }): RainQualitySummary;
export const QUALITY_VERSION: string;
