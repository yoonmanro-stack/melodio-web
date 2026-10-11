export const VIRAL_VIDEO_MODELS = ['grok-imagine-video', 'grok-imagine-video-1.5', 'grok-imagine-video-1.5-lite'] as const;
export type ViralVideoModel = typeof VIRAL_VIDEO_MODELS[number];

// Reserve this model when creating a job; later clips use its saved selection.
export const DEFAULT_VIRAL_VIDEO_MODEL: ViralVideoModel = 'grok-imagine-video-1.5-lite';
export const LEGACY_VIRAL_VIDEO_MODEL: ViralVideoModel = 'grok-imagine-video';

export function isViralVideoModel(value: unknown): value is ViralVideoModel {
  return typeof value === 'string' && VIRAL_VIDEO_MODELS.includes(value as ViralVideoModel);
}
