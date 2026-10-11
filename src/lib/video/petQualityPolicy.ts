/** Advisory analysis of the authored story core; never an asset approval gate. */
export const PET_QUALITY_POLICY_VERSION = 'pet-story-core-analysis-v2' as const;
/** Known opening-image interpretations that must no longer gate saved assets. */
export const PET_OBSOLETE_OPENING_IMAGE_POLICY_VERSIONS = ['pet-asset-review-v2-opening-actor', 'pet-asset-review-v3-physical-beats'] as const;
/** Only this known deployed C2 video interpretation is eligible for one saved-asset recheck. */
export const PET_OBSOLETE_C2_VIDEO_POLICY_VERSION = 'pet-asset-review-v2-opening-actor' as const;
