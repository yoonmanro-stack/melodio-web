import type { DirectionSceneId } from './direction';

export const INTRO_FAMILY_VERSION: 'healing-rain-intro-families-v1';
export type IntroFamilyId = 'cloud-bed' | 'lotus-bed' | 'underwater-suite' | 'flower-meadow' | 'ancient-tree' | 'lake-dome' | 'aurora-conservatory' | 'waterfall-garden' | 'space-garden' | 'pearl-shell';
export type IntroFamilyVariant = {
  id: string;
  name: string;
  compositionPrompt: string;
  atmospherePrompt: string;
};
export type IntroFamily = {
  id: IntroFamilyId;
  name: string;
  description: string;
  worldPrompt: string;
  comfortPrompt: string;
  motionPrompt: string;
  exclusions: string[];
  /** Suggested visual pairings; consumers may choose any valid main scene. */
  compatibleScenes: DirectionSceneId[];
  variants: IntroFamilyVariant[];
};
export type ReadonlyIntroFamily = {
  readonly [Key in keyof IntroFamily]: Key extends 'variants'
    ? readonly Readonly<IntroFamilyVariant>[]
    : Key extends 'compatibleScenes'
      ? readonly DirectionSceneId[]
      : Key extends 'exclusions'
        ? readonly string[]
        : IntroFamily[Key];
};
export const INTRO_FAMILIES: readonly ReadonlyIntroFamily[];
/** Returns an independent mutable clone; throws Error with code episode_invalid for an unknown ID. */
export function getIntroFamily(id: IntroFamilyId): IntroFamily;
