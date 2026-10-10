/** Client-safe performance ideas. Production/choreography are deliberately absent before selection. */
import type { DanceProductionSeedV3 } from './creativeDirection';
export const DANCE_PERFORMANCE_PREMISE_LIMITS = {
  title: 70, visibleHook: 180, characterGoal: 120, emotionalReaction: 120,
  turn: 160, payoff: 160, participation: 140, productionRisk: 160, musicConnection: 180,
} as const;
export const DANCE_PERFORMANCE_FAMILIES = ['interaction', 'contrast', 'rhythm_reveal'] as const;
export type DancePerformancePremiseV3 = {
  version: 3; id: string; conceptFamily: typeof DANCE_PERFORMANCE_FAMILIES[number];
  title: string; visibleHook: string; characterGoal: string; emotionalReaction: string;
  turn: string; payoff: string; participation: string; productionRisk: string; musicConnection: string;
};
const KEYS = ['version', 'id', 'conceptFamily', ...Object.keys(DANCE_PERFORMANCE_PREMISE_LIMITS)];
const prohibited = /data:|base64|[\u0000-\u001f]/i;
/** A complete guard, usable by browser cards without importing any server modules. */
export function isDancePerformancePremiseV3(value: unknown): value is DancePerformancePremiseV3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === KEYS.length && KEYS.every(key => Object.hasOwn(item, key))
    && item.version === 3 && typeof item.id === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(item.id)
    && DANCE_PERFORMANCE_FAMILIES.includes(item.conceptFamily as DancePerformancePremiseV3['conceptFamily'])
    && Object.entries(DANCE_PERFORMANCE_PREMISE_LIMITS).every(([key, limit]) => {
      const text = item[key];
      return typeof text === 'string' && text === text.trim() && text.length > 0 && text.length <= limit
        && /[가-힣]/.test(text) && !prohibited.test(text);
    });
}
export function validateDancePerformancePremisesV3(value: unknown): DancePerformancePremiseV3[] {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isDancePerformancePremiseV3)) {
    throw new Error('공연 아이디어 세 개의 형식을 확인하지 못했습니다.');
  }
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  for (const key of ['id', 'title'] as const) {
    if (new Set(value.map(item => normalize(item[key]))).size !== 3) throw new Error('세 공연 아이디어는 서로 다른 장면과 목적을 가져야 합니다.');
  }
  return value.map(item => ({ ...item }));
}
/** Private selection envelope. The provider acknowledges immutable facts without inventing choreography. */
export function dancePerformanceSelectionFacts(seed: DanceProductionSeedV3, musicProfileId: string | null) {
  return { seedId: seed.seedId, musicProfileId, count: seed.count, kind: seed.kind, anchors: seed.anchors, locks: seed.locks };
}
export function danceExactFactsSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', minItems: value.length, maxItems: value.length,
    items: value.length === 1 ? danceExactFactsSchema(value[0]) : value.length ? { anyOf: value.map(danceExactFactsSchema) } : { type: 'string' } };
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return { type: 'object', additionalProperties: false, required: entries.map(([key]) => key),
      properties: Object.fromEntries(entries.map(([key, item]) => [key, danceExactFactsSchema(item)])) };
  }
  return { type: typeof value === 'number' ? 'integer' : typeof value, enum: [value] };
}
export function matchesDanceExactFacts(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => matchesDanceExactFacts(actual[index], item));
  if (expected && typeof expected === 'object') return Boolean(actual && typeof actual === 'object' && !Array.isArray(actual)
    && Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, item]) => Object.hasOwn(actual, key) && matchesDanceExactFacts((actual as Record<string, unknown>)[key], item)));
  return actual === expected;
}
