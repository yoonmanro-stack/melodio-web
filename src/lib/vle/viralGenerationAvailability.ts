import { VIRAL_CATEGORY_ORDER } from './viralCategoryMatrix';
import { normalizeActiveViralCategory } from './viralCategoryAvailability';

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Check every supplied category binding before any paid planning or generation work. */
export function isViralGenerationAvailable(value: unknown): boolean {
  const input = object(value);
  if (!input) return false;
  const metadata = object(input.metadata);
  const brief = object(metadata?.viralBrief);
  const knownCategory = (category: unknown) => typeof category === 'string'
    && (VIRAL_CATEGORY_ORDER.some(id => id === category) || normalizeActiveViralCategory(category) !== null);
  const explicitCategories = [input.category, input.genCategory, metadata?.genCategory, metadata?.tab_type,
    metadata?.categoryId, brief?.categoryId];
  const viral = ['viral', 'viral-cf', 'short-form'].includes(String(input.sourceMenu ?? ''))
    || input.isViral === true || input.isViralTrack === true || input.viralMode === true
    || metadata?.viralBrief !== undefined || metadata?.petEpisode !== undefined
    || explicitCategories.some(knownCategory)
    || knownCategory(input.presetId) || knownCategory(metadata?.presetId);
  if (!viral) return true;
  const categories = [...explicitCategories, input.presetId, metadata?.presetId]
    .filter(category => category !== undefined);
  if (metadata?.petEpisode !== undefined) categories.push('pet');
  if (!categories.length) return false;
  const normalized = categories.map(normalizeActiveViralCategory);
  return normalized.every(category => category !== null && category === normalized[0]);
}

/** Saved audio must agree with the requested active video category, including older metadata aliases. */
export function isActiveViralTrackCategory(metadata: unknown, requestedCategory: unknown): boolean {
  const category = normalizeActiveViralCategory(requestedCategory);
  const saved = object(metadata);
  if (!category || !saved) return false;
  const nested = object(saved.metadata);
  const brief = object(saved.viralBrief);
  const values = [saved.genCategory, saved.tab_type, saved.presetId, saved.categoryId, brief?.categoryId,
    nested?.genCategory, nested?.tab_type, nested?.presetId, nested?.categoryId].filter(value => value !== undefined);
  if (saved.petEpisode !== undefined || saved.petVideoJob !== undefined) values.push('pet');
  if (saved.danceVideo !== undefined || saved.workflow === 'dance-music-first-v1') values.push('dance_challenge');
  return values.length > 0 && values.every(value => normalizeActiveViralCategory(value) === category);
}
