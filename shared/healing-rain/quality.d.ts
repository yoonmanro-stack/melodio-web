export type RainQualityCheck = { id: string; status: 'passed' | 'warning' | 'failed' | 'not_measured'; message: string };
export type RainQualitySummary = { version: string; directionVersion: string; technicalStatus: 'passed' | 'warning' | 'failed'; reviewDecision: 'required' | 'sample' | 'not_required'; reasons: string[]; profiles: string[]; unreviewedProfiles: string[]; checks: RainQualityCheck[] };
export function sampleJob(jobId: string, every?: number): boolean;
export function evaluatePreviewQuality(input: { direction?: unknown; report?: unknown; jobId?: string; models?: Record<string, string>; approvals?: unknown[]; sampleEvery?: number }): RainQualitySummary;
export const QUALITY_VERSION: string;
