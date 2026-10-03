/** Pet performance defaults: transient reactions never recast an identity or rewrite an authored beat. */
export const PET_PERFORMANCE_POLICY = 'pet-human-reaction-v1' as const;
export const PET_HUMAN_REACTION_DIRECTION = 'HUMAN PERFORMANCE: Authored awake, visible people react warmly and naturally to the pet through gaze, brows, smiles, surprise or amused disbelief as the beat earns. Avoid default blank/sad posing and frozen grins. Preserve authored sleep, serious emotions and off-screen presence; no speech lip-sync.';
export const PET_ANIMAL_REACTION_DIRECTION = 'ANIMAL AFFECT: Use species-appropriate eyes, ears, head, tail and posture; never human smiles, frowns or talking lips on the pet.';
export function buildPetPerformanceDirection(hasHumans: boolean): string {
  return [hasHumans ? PET_HUMAN_REACTION_DIRECTION : '', PET_ANIMAL_REACTION_DIRECTION].filter(Boolean).join('\n');
}
