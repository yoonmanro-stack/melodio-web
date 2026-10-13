export const DIRECTION_VERSION: 'healing-rain-direction-v2';
export type DirectionSceneId = 'train' | 'tent' | 'hanok' | 'cabin' | 'night-nature' | 'quiet-park' | 'mountain-temple' | 'pond' | 'lake' | 'highland-village';
export const SCENE_IDS: DirectionSceneId[];
export type DirectionInput = { sceneId: DirectionSceneId; intensity: 'gentle' | 'moderate' | 'heavy' | 'downpour'; thunder: 'none' | 'distant' | 'close'; camera: 'wide' | 'window' | 'bedside'; palette: 'amber' | 'linen' | 'midnight'; variation: number; title: string; hours: number; takes: number; notes: string };
export type DirectionRegion = 'subject' | 'shelter' | 'exterior' | 'water' | 'practicalLight';
export type DirectionIssue = { code: string; path: string; message: string; severity: 'error' | 'review' };
export type DirectionMotion = {
  id: string; region: DirectionRegion; target: string; type: 'rain' | 'glass-runoff' | 'background-translation' | 'blanket-breathing' | 'tent-fabric' | 'eave-runoff' | 'vegetation' | 'rain-ripples' | 'stream' | 'mist' | 'local-reflection';
  direction: string; amplitude: string; periodSeconds: number | null; instruction: string; phase?: string; targetStatus?: 'initial-descriptive-target';
  speed?: { nearCrossingSeconds: [number, number]; distant: 'slower-than-near'; constant: true; targetStatus: 'initial-descriptive-target' };
};
export type DirectionSummary = { subject: string; motion: string; lighting: string; loop: string; verification: string };
export type HealingRainDirection = {
  version: typeof DIRECTION_VERSION; sceneId: DirectionSceneId; sourceInput: DirectionInput; profiles: string[];
  fixed: {
    scene: string; camera: { mode: 'locked'; composition: string }; people: 'one-sleeping-adult-woman' | 'none';
    subject: { description: string; face: 'stable'; head: 'stable'; hands: 'stable'; bodyMotion: 'blanket-breathing-only' } | null;
    architecture: string[]; landscape: string[]; palette: string; variation: string; exclusions: string[]; creativeNotes: string;
  };
  motion: DirectionMotion[];
  lighting: { timeOfDay: 'deep-night'; sky: 'deep-dark'; exposure: 'fixed'; globalVariation: 'none'; instruction: string; regions: { id: DirectionRegion; applicable: boolean; brightness: string; source: string; allowedVariation: string }[] };
  loop: { sourceSeconds: 11; cycleSeconds: 10; overlapSeconds: 1; fps: 24; reversePlayback: false; boundary: string; phaseGuarantee: 'requires-media-review' };
  longEvents: { enabled: false; requestedThunder: DirectionInput['thunder']; thunder: { enabled: false; placement: 'separate-long-edit-only' }; turningOver: { enabled: false; placement: 'future-long-event-only' } };
  verification: {
    status: 'review-required'; unknownRegions: 'review-required'; regionExtraction: 'not-run';
    checks: { id: string; status: 'not-run' | 'review-required' | 'not-implemented'; method: 'existing-render-checks' | 'human-review' | 'planned-region-analysis' | 'planned-motion-analysis'; criteria: string }[];
    coverage: { scopedSceneId: DirectionSceneId; representativePassCoversOtherProfiles: false; additionalMotionReview: string[]; automaticChecksGuaranteeNaturalness: false };
  };
  summaryDetails: DirectionSummary; summary: string;
};
export type Direction = HealingRainDirection;
export type CompiledDirection = {
  image: string; video: string; checks: string[]; summary: string;
  render: { seconds: 180; previewSeconds: 30; sourceVideoSeconds: 11; targetVideoCycleSeconds: 10; videoCrossfadeSeconds: 1; audioCrossfadeSeconds: 2; fps: 24; maxWidth: 1920 };
};
export function buildDirection(input: DirectionInput): HealingRainDirection;
export function validateDirection(direction: unknown): { valid: boolean; issues: DirectionIssue[] };
export function compileDirection(direction: HealingRainDirection, input: DirectionInput): CompiledDirection;
