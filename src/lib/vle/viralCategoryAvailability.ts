/** Temporary creation policy. Archived categories and completed media remain readable. */
export const ACTIVE_VIRAL_CATEGORY_IDS = ['pet', 'dance_challenge'] as const;
export type ActiveViralCategoryId = typeof ACTIVE_VIRAL_CATEGORY_IDS[number];

export function isActiveViralCategory(value: unknown): value is ActiveViralCategoryId {
  return value === 'pet' || value === 'dance_challenge';
}

/** Existing Dance internals use `dance`; keep that alias out of visible category lists. */
export function normalizeActiveViralCategory(value: unknown): ActiveViralCategoryId | null {
  return value === 'dance' ? 'dance_challenge' : isActiveViralCategory(value) ? value : null;
}

export const VIRAL_CATEGORY_DISABLED_CODE = 'VIRAL_CATEGORY_DISABLED';
export const VIRAL_CATEGORY_DISABLED_MESSAGE = '현재는 댕냥이와 댄스 챌린지만 새로 제작할 수 있습니다.';
