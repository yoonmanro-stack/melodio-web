/** Client-safe performance ideas. Production/choreography are deliberately absent before selection. */
import type { DanceProductionSeedV3 } from './creativeDirection';
export const DANCE_PERFORMANCE_PREMISE_LIMITS = {
  title: 70, visibleHook: 180, characterGoal: 120, emotionalReaction: 120,
  turn: 160, payoff: 160, participation: 140, productionRisk: 160, musicConnection: 180,
} as const;
export const DANCE_PERFORMANCE_FAMILIES = ['interaction', 'contrast', 'rhythm_reveal'] as const;
export const DANCE_SCENE_CONTEXT_LIMITS = { place: 100, ongoingActivity: 180, immediateTrigger: 160 } as const;
export type DanceSceneContextV3 = { place: string; ongoingActivity: string; immediateTrigger: string };
export type DancePerformancePremiseV3 = {
  version: 3; id: string; conceptFamily: typeof DANCE_PERFORMANCE_FAMILIES[number];
  title: string; visibleHook: string; characterGoal: string; emotionalReaction: string;
  turn: string; payoff: string; participation: string; productionRisk: string; musicConnection: string;
  /** Required for fresh provider proposals; older saved V3 premises remain readable. */
  sceneContext?: DanceSceneContextV3;
};
const KEYS = ['version', 'id', 'conceptFamily', ...Object.keys(DANCE_PERFORMANCE_PREMISE_LIMITS)];
const prohibited = /data:|base64|[\u0000-\u001f]/i;
function boundedKoreanText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= limit
    && /[가-힣]/.test(value) && !prohibited.test(value);
}
export function isDanceSceneContextV3(value: unknown): value is DanceSceneContextV3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 3 && Object.entries(DANCE_SCENE_CONTEXT_LIMITS).every(([key, limit]) =>
    Object.hasOwn(item, key) && boundedKoreanText(item[key], limit) && !/[<>`]/.test(item[key] as string));
}
/** A complete guard, usable by browser cards without importing any server modules. */
export function isDancePerformancePremiseV3(value: unknown): value is DancePerformancePremiseV3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const hasContext = Object.hasOwn(item, 'sceneContext');
  return Object.keys(item).length === KEYS.length + Number(hasContext) && KEYS.every(key => Object.hasOwn(item, key))
    && item.version === 3 && typeof item.id === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(item.id)
    && DANCE_PERFORMANCE_FAMILIES.includes(item.conceptFamily as DancePerformancePremiseV3['conceptFamily'])
    && Object.entries(DANCE_PERFORMANCE_PREMISE_LIMITS).every(([key, limit]) => boundedKoreanText(item[key], limit))
    && (!hasContext || isDanceSceneContextV3(item.sceneContext));
}
export function validateDancePerformancePremisesV3(value: unknown): DancePerformancePremiseV3[] {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isDancePerformancePremiseV3)) {
    throw new Error('공연 아이디어 세 개의 형식을 확인하지 못했습니다.');
  }
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  for (const key of ['id', 'title'] as const) {
    if (new Set(value.map(item => normalize(item[key]))).size !== 3) throw new Error('세 공연 아이디어는 서로 다른 장면과 목적을 가져야 합니다.');
  }
  return value.map(item => ({ ...item, ...(item.sceneContext ? { sceneContext: { ...item.sceneContext } } : {}) }));
}
/** Provider output is stricter than the stored-data reader. No semantic novelty gate or retry. */
export function validateFreshDancePerformancePremisesV3(value: unknown): DancePerformancePremiseV3[] {
  const ideas = validateDancePerformancePremisesV3(value);
  if (ideas.some(idea => !idea.sceneContext)) throw new Error('새 공연 아이디어의 장소·진행 중인 활동·직접 계기가 필요합니다.');
  return ideas;
}
export const DANCE_RECENT_PREMISE_RECORD_LIMIT = 12;
export const DANCE_RECENT_PREMISE_LIMIT = 6;
export const DANCE_RECENT_PREMISE_BYTES = 12 * 1024;
export const DANCE_RECENT_PREMISE_METADATA_BYTES = 256 * 1024;
export type DanceRecentPremiseV3 = { goal: string; opening: string; turn: string; payoff: string; sceneContext?: DanceSceneContextV3 };
const RECENT_LIMITS = { goal: DANCE_PERFORMANCE_PREMISE_LIMITS.characterGoal, opening: DANCE_PERFORMANCE_PREMISE_LIMITS.visibleHook,
  turn: DANCE_PERFORMANCE_PREMISE_LIMITS.turn, payoff: DANCE_PERFORMANCE_PREMISE_LIMITS.payoff };
/** Only validated selected premises become history; no cast identity, media, title or full metadata. */
export function projectDanceRecentPremiseV3(value: unknown): DanceRecentPremiseV3 | null {
  if (!isDancePerformancePremiseV3(value)) return null;
  return { goal: value.characterGoal, opening: value.visibleHook, turn: value.turn, payoff: value.payoff,
    ...(value.sceneContext ? { sceneContext: { ...value.sceneContext } } : {}) };
}
/** Revalidate persisted/request snapshots and bound the complete serialized UTF-8 array. */
export function boundDanceRecentPremisesV3(value: unknown): DanceRecentPremiseV3[] {
  if (!Array.isArray(value)) return [];
  const result: DanceRecentPremiseV3[] = [];
  for (const raw of value.slice(0, DANCE_RECENT_PREMISE_RECORD_LIMIT)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>, hasContext = Object.hasOwn(item, 'sceneContext');
    if (Object.keys(item).length !== 4 + Number(hasContext)
      || !Object.entries(RECENT_LIMITS).every(([key, limit]) => Object.hasOwn(item, key) && boundedKoreanText(item[key], limit))
      || (hasContext && !isDanceSceneContextV3(item.sceneContext))) continue;
    const premise = { goal: item.goal, opening: item.opening, turn: item.turn, payoff: item.payoff,
      ...(hasContext ? { sceneContext: { ...(item.sceneContext as DanceSceneContextV3) } } : {}) } as DanceRecentPremiseV3;
    if (new TextEncoder().encode(JSON.stringify([...result, premise])).byteLength > DANCE_RECENT_PREMISE_BYTES) continue;
    result.push(premise);
    if (result.length === DANCE_RECENT_PREMISE_LIMIT) break;
  }
  return result;
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
