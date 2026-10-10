/** Shared, client-safe creative choices. Selection is planning data, never proof of generated video quality. */
import { DANCE_ANIMAL_SPECIES, DANCE_SPECIES_ANATOMY, buildDanceCastPrompt, validateDanceCastContract, type DanceAnimalSpecies, type DanceCastContract, type DanceCastMember, type DanceEnsemble } from './cast';
export { buildDanceCastPrompt, validateDanceCastContract, DANCE_ANATOMY_GUIDANCE } from './cast';
export type { DanceCastContract, DanceCastMember, DanceAnimalSpecies, DanceEnsemble, DanceMovementAnatomy } from './cast';
export const DANCE_CREATIVE_OPTIONS = {
  performer: [{ id: 'auto', label: '매번 새 주인공' }, { id: 'woman', label: '성인 여성' }, { id: 'man', label: '성인 남성' }, { id: 'duo', label: '성인 듀오' }, { id: 'group', label: '성인 3인 그룹' }, { id: 'crowd', label: '성인 군무' }, { id: 'robot', label: '로봇 캐릭터' }, { id: 'animal', label: '동물만' }, { id: 'human_animal', label: '사람 + 동물' }],
  ensemble: [{ id: 'auto', label: '자동 구성' }, { id: 'solo', label: '솔로 · 1명' }, { id: 'duo', label: '듀오 · 2명' }, { id: 'trio', label: '트리오 · 3명' }, { id: 'crowd', label: '군무 · 4~6명' }],
  species: [{ id: 'auto', label: '매번 새 동물' }, { id: 'cat', label: '고양이' }, { id: 'dog', label: '강아지' }, { id: 'penguin', label: '펭귄' }, { id: 'otter', label: '수달' }, { id: 'bear', label: '곰' }, { id: 'rabbit', label: '토끼' }, { id: 'fox', label: '여우' }],
  location: [{ id: 'auto', label: '매번 새 장소' }, { id: 'street', label: '거리 광장' }, { id: 'studio', label: '댄스 스튜디오' }, { id: 'rooftop', label: '도시 루프톱' }, { id: 'park', label: '공원' }, { id: 'beach', label: '해변 산책로' }, { id: 'arcade', label: '레트로 아케이드' }, { id: 'courtyard', label: '건물 안뜰' }],
  danceStyle: [{ id: 'auto', label: '음악에 맞게 새 안무' }, { id: 'bounce', label: '바운스 스텝' }, { id: 'shuffle', label: '좌우 셔플' }, { id: 'groove', label: '그루브 웨이브' }, { id: 'hand_hook', label: '손 훅 + 발 스텝' }, { id: 'disco', label: '디스코 스텝' }, { id: 'robot', label: '로봇 팝핑' }],
  visualStyle: [{ id: 'realistic', label: '실사' }, { id: 'stylized3d', label: '3D 캐릭터' }, { id: 'illustration', label: '일러스트 애니메이션' }],
  difficulty: [{ id: 'easy', label: '쉬움 · 따라 하기' }, { id: 'medium', label: '보통 · 동작 변화' }],
} as const;

export type DanceCreativePreferences = {
  performer: typeof DANCE_CREATIVE_OPTIONS.performer[number]['id'];
  ensemble: typeof DANCE_CREATIVE_OPTIONS.ensemble[number]['id'];
  species: typeof DANCE_CREATIVE_OPTIONS.species[number]['id'];
  location: typeof DANCE_CREATIVE_OPTIONS.location[number]['id'];
  danceStyle: typeof DANCE_CREATIVE_OPTIONS.danceStyle[number]['id'];
  visualStyle: typeof DANCE_CREATIVE_OPTIONS.visualStyle[number]['id'];
  difficulty: typeof DANCE_CREATIVE_OPTIONS.difficulty[number]['id'];
};
export type DanceCreativeDirection = {
  version: 2;
  castId: string; appearanceId: string; outfitId: string; paletteId: string; locationId: string; choreographyId: string;
  castLabel: string; locationLabel: string; danceStyleLabel: string;
  sources: { cast: 'explicit' | 'brief' | 'automatic'; location: 'explicit' | 'brief' | 'automatic'; choreography: 'explicit' | 'brief' | 'automatic' };
  lockedAxes: ('castId' | 'locationId' | 'choreographyId' | 'visualStyle')[];
  signature: string; concreteEn: string;
  /** Absent in saved v2 directions from before cast contracts. */
  cast?: DanceCastContract;
  musicMatch?: {
    profileId: string | null; rhythmPurpose: string; tempoTargetBpm: number | null;
    preferredStyles: string[]; recommendationTags: string[]; selection: 'preferred' | 'adapted' | 'user';
  };
};
export type DanceDirectionMusicSpec = { id: string; bpm: number; rhythmPurpose: string };
/** Immutable identity facts, created directly rather than parsed from legacy styling prose. */
export type DanceProductionAnchorV3 = {
  id: DanceCastMember['id']; kind: DanceCastMember['kind']; species: DanceCastMember['species'];
  gender: 'woman' | 'man' | 'unspecified' | 'none'; adult: boolean; ageBand: string | null;
  face: string | null; hair: string | null; coat: string | null; surface: string | null;
  movementAnatomy: DanceCastMember['movementAnatomy'];
};
export const DANCE_PRODUCTION_LAYOUTS = {
  solo_center: { counts: [1], formation: 'centered solo', positions: ['center'] },
  side_by_side: { counts: [2], formation: 'separated left/right pair', positions: ['left', 'right'] },
  open_triangle: { counts: [3], formation: 'open triangle', positions: ['front-center', 'rear-left', 'rear-right'] },
  staggered_rows: { counts: [4, 5, 6], formation: 'two staggered rows, every body visible', positions: POSITIONS_V3() },
  loose_arc: { counts: [2, 3, 4, 5, 6], formation: 'open shallow arc, every body visible', positions: ['arc-left', 'arc-right', 'arc-center', 'arc-rear-left', 'arc-rear-right', 'arc-rear-center'] },
  diagonal: { counts: [2, 3, 4, 5, 6], formation: 'spaced diagonal, every body visible', positions: ['near-left', 'middle-left', 'middle-right', 'far-right', 'far-left', 'near-right'] },
} as const;
function POSITIONS_V3() { return ['front-left', 'front-center', 'front-right', 'rear-left', 'rear-center', 'rear-right']; }
export type DanceProductionManifestV3 = {
  version: 3; locationId: Exclude<DanceCreativePreferences['location'], 'auto'>;
  danceStyleId: Exclude<DanceCreativePreferences['danceStyle'], 'auto'>;
  layoutId: keyof typeof DANCE_PRODUCTION_LAYOUTS; locationDetail: string;
  wardrobes: { memberId: string; description: string }[];
};
export type DanceProductionSeedV3 = {
  version: 3; seedId: string; count: number; kind: DanceCastContract['kind']; ensemble: DanceEnsemble;
  anchors: DanceProductionAnchorV3[];
  locks: { locationId: string | null; danceStyleId: string | null; layoutId: string | null;
    visualStyle: DanceCreativePreferences['visualStyle']; difficulty: DanceCreativePreferences['difficulty']; wardrobeTerms: string[];
    /** Absent on earlier saved V3 seeds; IDs bind clothing to immutable members, not changeable slots. */
    wardrobeByMember?: { memberId: string; terms: string[] }[] };
  hints: { locationId: string; danceStyleId: string; outfitId: string; paletteId: string; layoutId: keyof typeof DANCE_PRODUCTION_LAYOUTS };
  /** Compact legacy axes only: never an approved production direction. */
  variation: Pick<DanceCreativeDirection, 'castId' | 'appearanceId' | 'sources' | 'musicMatch'>;
};
export class DanceCreativeInputError extends Error {
  constructor(message: string, public code: 'CREATIVE_PREFERENCES' | 'CREATIVE_CONFLICT' | 'CREATIVE_VARIATION' = 'CREATIVE_PREFERENCES') { super(message); this.name = 'DanceCreativeInputError'; }
}
/** Stored V3 facts are validated before they can authorize a new planning or media action. */
export function validateDanceProductionSeedV3(value: unknown, expectedSeedId?: string): DanceProductionSeedV3 {
  const fail = (): never => { throw new DanceCreativeInputError('저장된 공연 정체성·선택을 확인해 주세요.', 'CREATIVE_CONFLICT'); };
  const object = (input: unknown, required: string[], optional: string[] = []): input is Record<string, unknown> => Boolean(input && typeof input === 'object' && !Array.isArray(input)
    && required.every(key => Object.hasOwn(input, key)) && Object.keys(input).every(key => required.includes(key) || optional.includes(key)));
  const text = (input: unknown, limit: number): input is string => typeof input === 'string' && input.trim() === input && Boolean(input) && input.length <= limit && !/data:|base64|[\u0000-\u001f]/i.test(input);
  const option = (key: keyof DanceCreativePreferences, input: unknown, auto = false) => (DANCE_CREATIVE_OPTIONS[key] as readonly { id: string }[]).some(item => item.id === input && (auto || item.id !== 'auto'));
  if (!object(value, ['version', 'seedId', 'count', 'kind', 'ensemble', 'anchors', 'locks', 'hints', 'variation']) || value.version !== 3
    || !text(value.seedId, 200) || (expectedSeedId !== undefined && value.seedId !== expectedSeedId)
    || !Number.isInteger(value.count) || Number(value.count) < 1 || Number(value.count) > 6
    || !['human', 'animal', 'robot', 'human_animal'].includes(String(value.kind))
    || value.ensemble !== ensembleForCount(Number(value.count)) || !Array.isArray(value.anchors) || value.anchors.length !== value.count) return fail();
  for (const [index, anchor] of value.anchors.entries()) {
    if (!object(anchor, ['id', 'kind', 'species', 'gender', 'adult', 'ageBand', 'face', 'hair', 'coat', 'surface', 'movementAnatomy'])
      || anchor.id !== `performer_${index + 1}` || !Object.hasOwn(DANCE_SPECIES_ANATOMY, String(anchor.species))
      || anchor.movementAnatomy !== DANCE_SPECIES_ANATOMY[anchor.species as DanceCastMember['species']]
      || anchor.kind !== (anchor.species === 'human' ? 'human' : anchor.species === 'robot' ? 'robot' : 'animal')) return fail();
    const human = anchor.kind === 'human', robot = anchor.kind === 'robot';
    if (anchor.adult !== human || !(human ? ['woman', 'man', 'unspecified'] : ['none']).includes(String(anchor.gender))
      || (human ? !text(anchor.ageBand, 40) || !/^(?:[2-9]0s|(?:1[89]|[2-9]\d|10\d|11\d) years old)$/.test(anchor.ageBand) || !text(anchor.hair, 80) : anchor.ageBand !== null || anchor.hair !== null)
      || (human || robot ? !text(anchor.face, 100) : anchor.face !== null)
      || (anchor.kind === 'animal' ? !text(anchor.coat, 80) : anchor.coat !== null)
      || (robot ? !text(anchor.surface, 80) : anchor.surface !== null)) return fail();
  }
  const kinds = new Set(value.anchors.map(anchor => anchor.kind));
  if (value.kind === 'human_animal' ? kinds.size !== 2 || !kinds.has('human') || !kinds.has('animal') : kinds.size !== 1 || !kinds.has(value.kind)) return fail();
  const locks = value.locks, hints = value.hints, variation = value.variation;
  const wardrobeTerms = (terms: unknown): terms is string[] => Array.isArray(terms) && terms.length <= WARDROBE_TERMS.length && new Set(terms).size === terms.length && terms.every(term => WARDROBE_TERMS.some(([known]) => known === term));
  if (!object(locks, ['locationId', 'danceStyleId', 'layoutId', 'visualStyle', 'difficulty', 'wardrobeTerms'], ['wardrobeByMember'])
    || (locks.locationId !== null && !option('location', locks.locationId)) || (locks.danceStyleId !== null && !option('danceStyle', locks.danceStyleId))
    || (locks.layoutId !== null && (typeof locks.layoutId !== 'string' || !Object.hasOwn(DANCE_PRODUCTION_LAYOUTS, locks.layoutId) || !(DANCE_PRODUCTION_LAYOUTS[locks.layoutId as keyof typeof DANCE_PRODUCTION_LAYOUTS].counts as readonly number[]).includes(Number(value.count))))
    || !option('visualStyle', locks.visualStyle) || !option('difficulty', locks.difficulty) || !wardrobeTerms(locks.wardrobeTerms)) return fail();
  if (locks.wardrobeByMember !== undefined) {
    if (!Array.isArray(locks.wardrobeByMember) || locks.wardrobeByMember.length > value.count) return fail();
    let lastIndex = -1;
    for (const lock of locks.wardrobeByMember) {
      if (!object(lock, ['memberId', 'terms']) || !wardrobeTerms(lock.terms) || !lock.terms.length || lock.terms.some(term => !(locks.wardrobeTerms as string[]).includes(term))) return fail();
      const index = value.anchors.findIndex(anchor => anchor.id === lock.memberId);
      if (index <= lastIndex) return fail();
      lastIndex = index;
    }
  }
  if (!object(hints, ['locationId', 'danceStyleId', 'outfitId', 'paletteId', 'layoutId']) || !option('location', hints.locationId) || !option('danceStyle', hints.danceStyleId)
    || !OUTFIT.some(item => item.id === hints.outfitId) || !PALETTE.some(item => item.id === hints.paletteId) || typeof hints.layoutId !== 'string' || !Object.hasOwn(DANCE_PRODUCTION_LAYOUTS, hints.layoutId)
    || !(DANCE_PRODUCTION_LAYOUTS[hints.layoutId as keyof typeof DANCE_PRODUCTION_LAYOUTS].counts as readonly number[]).includes(Number(value.count))
    || !object(variation, ['castId', 'appearanceId', 'sources'], ['musicMatch']) || !CAST.some(item => item.id === variation.castId) || !APPEARANCE.some(item => item.id === variation.appearanceId)
    || !object(variation.sources, ['cast', 'location', 'choreography']) || Object.values(variation.sources).some(source => !['explicit', 'brief', 'automatic'].includes(String(source)))) return fail();
  if (variation.musicMatch !== undefined) {
    const match = variation.musicMatch;
    if (!object(match, ['profileId', 'rhythmPurpose', 'tempoTargetBpm', 'preferredStyles', 'recommendationTags', 'selection'])
      || (match.profileId !== null && !text(match.profileId, 80)) || typeof match.rhythmPurpose !== 'string' || match.rhythmPurpose.length > 200
      || (match.tempoTargetBpm !== null && (typeof match.tempoTargetBpm !== 'number' || !Number.isFinite(match.tempoTargetBpm) || match.tempoTargetBpm < 60 || match.tempoTargetBpm > 200))
      || !Array.isArray(match.preferredStyles) || match.preferredStyles.some(style => !option('danceStyle', style))
      || !Array.isArray(match.recommendationTags) || match.recommendationTags.some(tag => !text(tag, 80)) || !['preferred', 'adapted', 'user'].includes(String(match.selection))) return fail();
  }
  return value as DanceProductionSeedV3;
}
const DEFAULTS: DanceCreativePreferences = { performer: 'auto', ensemble: 'auto', species: 'auto', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' };
export function validateDanceCreativePreferences(raw?: unknown): DanceCreativePreferences {
  if (raw === undefined || raw === null) return { ...DEFAULTS };
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new DanceCreativeInputError('댄스 연출 선택을 확인해 주세요.');
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some(key => !Object.hasOwn(DEFAULTS, key))) throw new DanceCreativeInputError('지원하지 않는 댄스 연출 선택이 있습니다.');
  const result = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof DanceCreativePreferences)[]) {
    if (!Object.hasOwn(input, key)) continue;
    if (typeof input[key] !== 'string' || !(DANCE_CREATIVE_OPTIONS[key] as readonly { id: string }[]).some(option => option.id === input[key])) throw new DanceCreativeInputError('댄스 연출 선택을 확인해 주세요.');
    Object.assign(result, { [key]: input[key] });
  }
  const legacyCount = result.performer === 'duo' ? 'duo' : result.performer === 'group' ? 'trio' : result.performer === 'crowd' ? 'crowd' : undefined;
  if (legacyCount && result.ensemble !== 'auto' && result.ensemble !== legacyCount) throw new DanceCreativeInputError('출연자 유형과 인원 구성이 다릅니다. 같은 구성으로 맞춰 주세요.', 'CREATIVE_CONFLICT');
  if (result.performer === 'human_animal' && result.ensemble === 'solo') throw new DanceCreativeInputError('사람 + 동물은 2명 이상의 구성을 선택해 주세요.', 'CREATIVE_CONFLICT');
  if (result.species !== 'auto' && !['auto', 'animal', 'human_animal'].includes(result.performer)) throw new DanceCreativeInputError('동물 종은 동물 또는 사람 + 동물 구성에서 선택해 주세요.', 'CREATIVE_CONFLICT');
  return result;
}

type Choice = { id: string; en: string };
const CAST: Choice[] = [
  { id: 'woman', en: 'one original adult woman' }, { id: 'man', en: 'one original adult man' },
  { id: 'duo', en: 'two distinct original adult dancers, stable left/right positions' }, { id: 'group', en: 'three distinct original adult dancers, stable triangular formation' },
  { id: 'robot', en: 'one original articulated robot, stable joints and proportions' }, { id: 'animal', en: 'one original animal character with species-appropriate grounded movement' },
  { id: 'crowd', en: 'four to six original adult dancers' }, { id: 'human_animal', en: 'original adults and animals together' },
];
const APPEARANCE: Choice[] = [
  { id: 'sleek', en: 'sleek silhouette and crisp distinguishing details' }, { id: 'rounded', en: 'rounded silhouette and soft distinguishing details' },
  { id: 'angular', en: 'angular silhouette and sharply defined details' }, { id: 'compact', en: 'compact silhouette and expressive facial features' },
  { id: 'textured', en: 'distinct textured surface and an expressive face' }, { id: 'flowing', en: 'fluid silhouette and clear expressive facial features' },
];
const OUTFIT: Choice[] = [
  { id: 'sport', en: 'sport-inspired styling with a single clear accent' }, { id: 'retro', en: 'retro styling with clean color blocks' },
  { id: 'casual', en: 'relaxed casual styling with visible limb outlines' }, { id: 'minimal', en: 'minimal styling with a clean contrasting trim' },
  { id: 'utility', en: 'practical utility styling with simple details' }, { id: 'festival', en: 'playful festival styling, no loose obstructing pieces' },
];
const PALETTE: Choice[] = [
  { id: 'coral_teal', en: 'coral and teal' }, { id: 'cobalt_cream', en: 'cobalt and cream' }, { id: 'lime_charcoal', en: 'lime and charcoal' },
  { id: 'violet_silver', en: 'violet and silver' }, { id: 'terracotta_sky', en: 'terracotta and sky blue' }, { id: 'mustard_navy', en: 'mustard and navy' },
];
const LOCATION: Choice[] = [
  { id: 'street', en: 'an uncluttered pedestrian street plaza with level paving' }, { id: 'studio', en: 'a spacious dance studio with a plain wall and clear floor' },
  { id: 'rooftop', en: 'a spacious enclosed city rooftop with safe railings far behind' }, { id: 'park', en: 'a level park plaza with trees well behind the performer' },
  { id: 'beach', en: 'a level beach boardwalk with sea in the background' }, { id: 'arcade', en: 'a spacious retro arcade aisle with unobstructed floor' },
  { id: 'courtyard', en: 'a sunlit building courtyard with a level stone floor' },
];
const CHOREOGRAPHY: Choice[] = [
  { id: 'bounce', en: 'a bouncy side-step hook with knee flexion, weight transfer and arm accents' },
  { id: 'shuffle', en: 'a small lateral shuffle hook with readable alternating foot placement and upper-body accents' },
  { id: 'groove', en: 'a grounded groove hook with torso waves, knee flexion and alternating steps' },
  { id: 'hand_hook', en: 'a recognizable arm-signature hook accompanied by active side steps, weight transfer and knee bounce' },
  { id: 'disco', en: 'an original disco-inspired point-and-step hook with alternating footwork and hip accents' },
  { id: 'robot', en: 'an original stop-and-release hook with articulated torso accents, knee flexion and deliberate foot placement' },
];
const VISUAL: Record<DanceCreativePreferences['visualStyle'], string> = { realistic: 'photorealistic live action', stylized3d: 'expressive stylized 3D animation', illustration: 'fluid illustrated animation' };
const AXES = ['castId', 'appearanceId', 'outfitId', 'paletteId', 'locationId', 'choreographyId'] as const;
function hash(value: string): number { let h = 2166136261; for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(list: Choice[], seed: string, salt: string, attempt: number): Choice { return list[hash(`${seed}:${salt}:${attempt}`) % list.length]; }
function label(key: 'performer' | 'location' | 'danceStyle', id: string): string { return (DANCE_CREATIVE_OPTIONS[key] as readonly { id: string; label: string }[]).find(option => option.id === id)?.label || '요청한 연출'; }

const BRIEF_HINTS: Record<'performer' | 'location' | 'danceStyle', readonly [string, RegExp][]> = {
  performer: [['robot', /로봇|robot|android/i], ['animal', /고양이|강아지|동물|곰|토끼|여우|펭귄|돼지|오리|사자|호랑이|수달|햄스터|드래곤|cat\b|dog\b|animal|bear\b|rabbit|fox\b|penguin|pig\b|duck\b|lion\b|tiger|otter|hamster|dragon/i], ['group', /그룹|세\s*명|3\s*명|group|trio|three dancers/i], ['duo', /듀오|두\s*명|2\s*명|duo|couple|two dancers/i], ['woman', /여성|여자|woman|female/i], ['man', /남성|남자|\bman\b|\bmale\b/i]],
  location: [['rooftop', /루프톱|옥상|rooftop/i], ['studio', /스튜디오|연습실|studio/i], ['beach', /해변|바닷가|beach|boardwalk/i], ['park', /공원|\bpark\b/i], ['arcade', /아케이드|오락실|arcade/i], ['courtyard', /안뜰|courtyard/i], ['street', /거리|광장|street|plaza/i]],
  danceStyle: [['robot', /팝핑|로봇\s*(춤|댄스)|popping|robot dance/i], ['shuffle', /셔플|shuffle/i], ['disco', /디스코|disco/i], ['groove', /웨이브|그루브|wave|groove/i], ['hand_hook', /손\s*(훅|춤)|hand hook/i], ['bounce', /바운스|bounce/i]],
};
function hint(key: keyof typeof BRIEF_HINTS, brief: string): string | undefined {
  const matches = BRIEF_HINTS[key].filter(([, pattern]) => pattern.test(brief));
  // Mixed descriptions and alternatives remain task data; never infer a contract from them.
  return matches.length === 1 ? matches[0][0] : undefined;
}

const SPECIES_HINTS: Record<DanceAnimalSpecies, string> = {
  cat: '고양이|cats?\\b', dog: '강아지|개(?=\\s|와|랑|가)|dogs?\\b', penguin: '펭귄|penguins?\\b', otter: '수달|otters?\\b',
  bear: '곰|bears?\\b', rabbit: '토끼|rabbits?\\b|bunnies\\b', fox: '여우|fox(?:es)?\\b',
};
const NUMBERS: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 };
const NUMBER_PATTERN = '(?:\\d+|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열|one|two|three|four|five|six|seven|eight|nine|ten|an|a)';
const HUMAN_PATTERN = '사람|인간|성인|여성|여자|남성|남자|humans?\\b|people\\b|persons?\\b|dancers?\\b|women\\b|woman\\b|men\\b|man\\b';
function namedCount(brief: string, noun: string): number | undefined {
  const before = brief.match(new RegExp(`(${NUMBER_PATTERN})\\s*(?:명(?:의)?|마리(?:의)?|인)?\\s*(?:adult\\s+)?(?:${noun})`, 'i'));
  const after = brief.match(new RegExp(`(?:${noun})\\s*(${NUMBER_PATTERN})\\s*(?:명|마리|인)`, 'i'));
  const value = (before || after)?.[1]?.toLowerCase();
  return value ? NUMBERS[value] || Number(value) : undefined;
}
function ensembleForCount(count: number): DanceEnsemble { return count === 1 ? 'solo' : count === 2 ? 'duo' : count === 3 ? 'trio' : 'crowd'; }
type BriefCast = { performer?: string; count?: number; humanCount?: number; species: DanceAnimalSpecies[]; woman: boolean; man: boolean };
function briefCast(brief: string): BriefCast {
  const result: BriefCast = { species: [], woman: false, man: false };
  // Alternative/comparison descriptions do not become irreversible cast selections.
  if (/또는|혹은|말고|아니|처럼|\bor\b|\bnot\b/i.test(brief)) return result;
  result.woman = /여성|여자|\bwoman\b|\bwomen\b|\bfemale\b/i.test(brief);
  result.man = /남성|남자|\bman\b|\bmen\b|\bmale\b/i.test(brief);
  const foundSpecies = DANCE_ANIMAL_SPECIES.filter(species => new RegExp(SPECIES_HINTS[species], 'i').test(brief));
  for (const species of foundSpecies) {
    const count = namedCount(brief, SPECIES_HINTS[species]);
    if (count !== undefined && (count < 1 || count > 6)) throw new DanceCreativeInputError('출연자는 1~6명으로 구성해 주세요.', 'CREATIVE_CONFLICT');
    result.species.push(...Array.from({ length: count || 1 }, () => species));
  }
  const hasAnimal = foundSpecies.length > 0 || /동물|animals?\b/i.test(brief);
  // These explicit human exclusions are not requests for an additional performer.
  const humanBrief = brief.replace(/(?:사람|인간)\s*없이|\b(?:without\s+people|no\s+humans)\b/gi, ' ');
  // "penguin dancers" describes animals; an unqualified "two dancers and a penguin" includes humans.
  const withoutAnimalDancers = foundSpecies.reduce((value, species) => value.replace(new RegExp(`(?:${SPECIES_HINTS[species]})\\s+dancers?\\b`, 'gi'), species), humanBrief).replace(/animals?\s+dancers?\b/gi, 'animals');
  const hasHuman = new RegExp(HUMAN_PATTERN, 'i').test(withoutAnimalDancers);
  result.humanCount = namedCount(humanBrief, HUMAN_PATTERN);
  if (result.woman && result.man) {
    const women = namedCount(humanBrief, '여성|여자|women\\b|woman\\b|female\\b'), men = namedCount(humanBrief, '남성|남자|men\\b|man\\b|male\\b');
    if (women !== undefined && men !== undefined) result.humanCount = women + men;
  }
  if (hasHuman && hasAnimal) {
    result.performer = 'human_animal';
    if (result.humanCount !== undefined || foundSpecies.some(species => namedCount(brief, SPECIES_HINTS[species]) !== undefined)) result.count = (result.humanCount || 1) + (result.species.length || 1);
  } else if (hasAnimal) {
    result.performer = 'animal';
    result.count = foundSpecies.some(species => namedCount(brief, SPECIES_HINTS[species]) !== undefined) || foundSpecies.length > 1 ? result.species.length : namedCount(brief, '동물|animals?\\b');
  } else if (/로봇|\brobots?\b|android/i.test(brief)) {
    result.performer = 'robot'; result.count = namedCount(brief, '로봇|robots?\\b|androids?\\b');
  } else if (hasHuman) {
    result.count = result.humanCount;
    result.performer = result.woman && !result.man ? 'woman' : result.man && !result.woman ? 'man' : undefined;
  }
  const generalCount = brief.match(new RegExp(`(${NUMBER_PATTERN})\\s*(?:명|마리|인)(?!트)|(${NUMBER_PATTERN})\\s+(?:dancers|people)`, 'i'));
  if (result.count === undefined && generalCount) {
    const value = (generalCount[1] || generalCount[2]).toLowerCase(); result.count = NUMBERS[value] || Number(value);
  }
  if (result.count === undefined) {
    if (/솔로|한\s*명|\bsolo\b|\balone\b/i.test(brief)) result.count = 1;
    else if (/듀오|\bduo\b|\bcouple\b/i.test(brief)) result.count = 2;
    else if (/트리오|그룹|세\s*명|3\s*명|\btrio\b|\bgroup\b/i.test(brief)) result.count = 3;
    else if (/군무|여러\s*(?:명|마리)|\bcrowd\b/i.test(brief)) result.count = 4;
  }
  if (result.count !== undefined && (result.count < 1 || result.count > 6)) throw new DanceCreativeInputError('출연자는 1~6명으로 구성해 주세요.', 'CREATIVE_CONFLICT');
  if (!result.performer && result.count) result.performer = result.count === 2 ? 'duo' : result.count === 3 ? 'group' : result.count >= 4 ? 'crowd' : result.woman ? 'woman' : result.man ? 'man' : undefined;
  return result;
}

const HAIR = ['dark side-part', 'copper curls', 'silver crop', 'dark braids', 'black fringe', 'brown ponytail'];
const HUMAN_LOOKS = ['East Asian', 'Black', 'Latina', 'South Asian', 'White', 'Middle Eastern'];
const EXPRESSIONS = ['bright smile', 'playful gaze', 'warm smile', 'confident gaze', 'soft smile', 'lively grin'];
const ANIMAL_COATS: Record<DanceAnimalSpecies, string> = { cat: 'grey cat, white paws', dog: 'black-white dog', penguin: 'penguin, yellow cheeks', otter: 'brown otter, cream muzzle', bear: 'brown bear, cream muzzle', rabbit: 'cream rabbit, short ears', fox: 'orange fox, white muzzle' };
const POSITIONS: Record<DanceEnsemble, string[]> = {
  solo: ['center'], duo: ['left', 'right'], trio: ['front-center', 'rear-left', 'rear-right'],
  crowd: ['front-left', 'front-center', 'front-right', 'rear-left', 'rear-center', 'rear-right'],
};
const FORMATIONS: Record<DanceEnsemble, string> = { solo: 'centered solo', duo: 'separated left/right pair', trio: 'open triangle', crowd: 'two staggered rows, every body visible' };
function makeCast(castId: string, count: number, species: DanceAnimalSpecies[], appearance: string, palette: string, details?: BriefCast): DanceCastContract {
  const kind = castId === 'human_animal' ? 'human_animal' : castId === 'animal' ? 'animal' : castId === 'robot' ? 'robot' : 'human';
  const ensemble = ensembleForCount(count);
  const humanCount = kind === 'human_animal' ? Math.max(1, Math.min(count - 1, details?.humanCount || (details?.species.length ? count - details.species.length : Math.ceil(count / 2)))) : kind === 'human' ? count : 0;
  const accents = palette.split('_');
  const offset = Math.max(0, APPEARANCE.findIndex(option => option.id === appearance));
  const members = Array.from({ length: count }, (_, index): DanceCastMember => {
    const memberKind = index < humanCount ? 'human' : kind === 'robot' ? 'robot' : 'animal';
    const memberSpecies = memberKind === 'human' ? 'human' : memberKind === 'robot' ? 'robot' : species[(index - humanCount + species.length) % species.length] || 'cat';
    let identity: string;
    if (memberKind === 'human') {
      const gender = castId === 'woman' ? 'woman' : castId === 'man' ? 'man' : details?.woman && details?.man ? index % 2 === 0 ? 'woman' : 'man' : details?.woman ? 'woman' : details?.man ? 'man' : kind === 'human_animal' && index === 0 && offset % 2 === 0 ? 'woman' : 'dancer';
      const detailIndex = (offset + index) % HAIR.length;
      identity = `${gender === 'woman' ? 'attractive ' : ''}adult ${gender} ${[20, 30, 40, 50][detailIndex % 4]}s, ${HUMAN_LOOKS[detailIndex]}, ${HAIR[detailIndex]}, ${accents[index % 2]} trim${gender === 'woman' ? `, ${EXPRESSIONS[detailIndex]}` : ''}`;
    } else if (memberSpecies === 'robot') identity = `${accents[index % 2]} robot, ${['round', 'oval', 'square'][index % 3]} lens face`;
    else identity = `${ANIMAL_COATS[memberSpecies as DanceAnimalSpecies]}, ${accents[index % 2]} ${['plain', 'striped', 'dotted', 'checked', 'woven', 'piped'][index]} collar`;
    return { id: `performer_${index + 1}`, kind: memberKind, species: memberSpecies, role: index === 0 ? 'lead' : index === 1 ? 'partner' : 'ensemble', position: POSITIONS[ensemble][index], identity, movementAnatomy: DANCE_SPECIES_ANATOMY[memberSpecies] };
  });
  return validateDanceCastContract({ version: 1, kind, ensemble, count, formation: FORMATIONS[ensemble], members });
}

/** Saved v2 directions remain readable; adaptation is local and never regenerates the saved choice. */
export function getDanceCastContract(direction: Pick<DanceCreativeDirection, 'castId' | 'appearanceId' | 'paletteId' | 'concreteEn' | 'cast'>): DanceCastContract {
  if (direction.cast !== undefined) return validateDanceCastContract(direction.cast);
  const count = direction.castId === 'duo' ? 2 : direction.castId === 'group' ? 3 : direction.castId === 'crowd' ? 4 : direction.castId === 'human_animal' ? 2 : 1;
  const legacy = direction.castId === 'animal' ? briefCast(direction.concreteEn || '').species : [];
  const appearanceSpecies: Record<string, DanceAnimalSpecies> = { sleek: 'fox', rounded: 'cat', angular: 'dog', compact: 'rabbit', textured: 'bear', flowing: 'penguin' };
  return makeCast(direction.castId, count, legacy.length ? legacy : [appearanceSpecies[direction.appearanceId] || 'cat'], direction.appearanceId, direction.paletteId || 'coral_teal');
}

/** Recommendations reflect the saved recipe's movement cues, never genre prohibitions or measured beat claims. */
function musicMatching(spec?: DanceDirectionMusicSpec) {
  const profileId = spec && typeof spec.id === 'string' ? spec.id.slice(0, 80) : null;
  const rhythmPurpose = spec && typeof spec.rhythmPurpose === 'string' ? spec.rhythmPurpose.slice(0, 200) : '';
  const tempoTargetBpm = spec && typeof spec.bpm === 'number' && Number.isFinite(spec.bpm) && spec.bpm >= 60 && spec.bpm <= 200 ? spec.bpm : null;
  const profiles: Record<string, string[]> = {
    'hook-pop': ['hand_hook', 'bounce', 'disco'], 'afro-groove': ['groove', 'bounce'],
    'house-footwork': ['shuffle', 'disco', 'bounce'], 'hiphop-bounce': ['bounce', 'groove', 'robot'],
    'latin-step': ['disco', 'groove', 'bounce'],
    'brazil-funk': ['bounce', 'shuffle', 'groove'],
  };
  const preferredStyles = profileId && Object.hasOwn(profiles, profileId) ? profiles[profileId] : [];
  const recommendationTags: string[] = [];
  if (/발|교차|풋워크|footwork|cross[- ]?step/i.test(rhythmPurpose) || profileId === 'house-footwork') recommendationTags.push('readable-footwork');
  if (/골반|어깨|체중|groove|weight|hip|shoulder/i.test(rhythmPurpose)) recommendationTags.push('weight-transfer');
  if (/무릎|바운스|bounce|knee/i.test(rhythmPurpose)) recommendationTags.push('knee-bounce');
  if (/훅|응답|hook|response/i.test(rhythmPurpose)) recommendationTags.push('repeatable-hook');
  if (!preferredStyles.length) {
    if (recommendationTags.includes('readable-footwork')) preferredStyles.push('shuffle', 'bounce');
    if (recommendationTags.includes('weight-transfer')) preferredStyles.push('groove', 'disco');
    if (recommendationTags.includes('knee-bounce')) preferredStyles.push('bounce');
    if (recommendationTags.includes('repeatable-hook')) preferredStyles.push('hand_hook');
  }
  return { profileId, rhythmPurpose, tempoTargetBpm, preferredStyles: [...new Set(preferredStyles)], recommendationTags };
}

/** Nominal text guidance for image-to-video prompts; it does not measure audio or synchronization. */
export function buildDanceCadenceGuide(tempoBpm: unknown, durationSeconds: 5 | 15, cast?: DanceCastContract): string {
  const tempo = typeof tempoBpm === 'number' && Number.isFinite(tempoBpm) && tempoBpm >= 60 && tempoBpm <= 200 ? tempoBpm : 120;
  const duration = durationSeconds === 5 ? 5 : 15;
  const countSeconds = 60 / tempo, loopSeconds = 480 / tempo;
  const fullCycles = Math.floor(duration / loopSeconds), remainderSeconds = duration - fullCycles * loopSeconds;
  const continuation = remainderSeconds > 1e-9 ? `then continue the next cycle for ${remainderSeconds.toFixed(3)}s` : 'ending at the cycle boundary';
  const animalMotion = cast && validateDanceCastContract(cast).members.some(member => member.kind === 'animal');
  const accents = animalMotion ? 'continuous species-native paw, hop, waddle or weight accents on EVERY beat; flipper, ear, head or tail accents may span two beats. Humans use feet and arms; animals retain their own anatomy' : 'fast continuous alternating footfall or weight accents on EVERY beat; arm accents may span two beats';
  return `NOMINAL CADENCE: ${tempo} BPM; one count per quarter-note beat, ${countSeconds.toFixed(3)}s per count; eight-count cycle ${loopSeconds.toFixed(3)}s. In ${duration}s perform ${fullCycles} complete eight-count cycles, ${continuation}. Start immediately with ${accents}. Easy reduces amplitude and complexity, NOT cadence. No slow motion, walking pace, whole-body pauses or stretching counts to fill a segment. Any finish microfreeze is at most one beat (${countSeconds.toFixed(3)}s). Textual nominal guidance only, with no audio input, measured downbeat or verified synchronization claim.`;
}

function musicTimingEn(match: ReturnType<typeof musicMatching>, difficulty: DanceCreativePreferences['difficulty']): string {
  if (!match.profileId && !match.rhythmPurpose && !match.tempoTargetBpm) return '';
  const target = match.tempoTargetBpm;
  const nominalBeat = target ? (60 / target).toFixed(3) : 'unknown';
  return `Music: ${(match.rhythmPurpose || 'selected audio groove').slice(0, 45)}. ${target ? `Recipe target ${target} BPM; nominal beat ${nominalBeat}s, not a measured downbeat.` : 'No measured tempo.'} Use one count per quarter-note beat. ${difficulty === 'easy' ? 'Easy reduces amplitude and complexity, not cadence.' : 'Keep count cadence with clear movement changes.'} Keep the8-count hook; follow audible accents; no exact sync claim.`;
}

/** Independent salted axes; recent records contain only the owner's compact direction metadata. */
export function resolveDanceCreativeDirection(raw: DanceCreativePreferences | unknown, seed: string | number, brief = '', recent: readonly unknown[] = [], musicSpec?: DanceDirectionMusicSpec): DanceCreativeDirection {
  const prefs = validateDanceCreativePreferences(raw);
  if (typeof brief !== 'string' || brief.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(brief)) throw new DanceCreativeInputError('상황 설정은 1,000자 이내의 텍스트로 입력해 주세요.');
  const inferredCast = briefCast(brief);
  const legacyEnsemble = prefs.performer === 'duo' ? 'duo' : prefs.performer === 'group' ? 'trio' : prefs.performer === 'crowd' ? 'crowd' : undefined;
  const selectedEnsemble = prefs.ensemble !== 'auto' ? prefs.ensemble : legacyEnsemble;
  if (selectedEnsemble && inferredCast.count !== undefined && (selectedEnsemble === 'crowd' ? inferredCast.count < 4 : inferredCast.count !== { solo: 1, duo: 2, trio: 3, crowd: 4 }[selectedEnsemble])) throw new DanceCreativeInputError('선택한 인원과 상황 설정의 인원이 다릅니다.', 'CREATIVE_CONFLICT');
  if (prefs.species !== 'auto' && inferredCast.species.some(species => species !== prefs.species)) throw new DanceCreativeInputError('선택한 동물 종과 상황 설정이 다릅니다.', 'CREATIVE_CONFLICT');
  const explicitKind = prefs.performer === 'auto' ? undefined : prefs.performer === 'animal' ? 'animal' : prefs.performer === 'human_animal' ? 'human_animal' : prefs.performer === 'robot' ? 'robot' : 'human';
  const briefKind = inferredCast.performer === 'animal' ? 'animal' : inferredCast.performer === 'human_animal' ? 'human_animal' : inferredCast.performer === 'robot' ? 'robot' : inferredCast.performer ? 'human' : undefined;
  if (explicitKind && briefKind && explicitKind !== briefKind && !(explicitKind === 'human_animal' && (briefKind === 'animal' || briefKind === 'human'))) throw new DanceCreativeInputError('선택한 출연자와 상황 설정의 출연자가 다릅니다.', 'CREATIVE_CONFLICT');
  const chosen = {} as Record<'performer' | 'location' | 'danceStyle', string | undefined>;
  for (const key of ['performer', 'location', 'danceStyle'] as const) {
    const requested = key === 'performer' ? inferredCast.performer : hint(key, brief);
    const clearSolo = key === 'performer' && /(?:여성|여자|남성|남자|woman|man|female|male)\s*(?:솔로|한\s*명|solo|alone)|(?:solo|one)\s+(?:woman|man|female|male)/i.test(brief);
    if (prefs[key] !== 'auto' && requested && prefs[key] !== requested && clearSolo && !/또는|혹은|말고|아니|처럼|\bor\b|\bnot\b/i.test(brief)) throw new DanceCreativeInputError('연출 선택과 상황 설정의 솔로 주인공이 다릅니다. 같은 내용으로 맞춰 주세요.', 'CREATIVE_CONFLICT');
    chosen[key] = prefs[key] === 'auto' ? requested : prefs[key];
  }
  const history = Array.isArray(recent) ? recent.slice(0, 12).flatMap(value => value && typeof value === 'object' && !Array.isArray(value) ? [value as Record<string, unknown>] : []) : [];
  const seedText = String(seed).slice(0, 200);
  const music = musicMatching(musicSpec);
  // All styles stay eligible; saved rhythm cues raise recommendation weight instead of erecting a genre wall.
  const weightedChoreography = [...CHOREOGRAPHY, ...CHOREOGRAPHY.filter(option => music.preferredStyles.includes(option.id)).flatMap(option => [option, option, option])];
  for (let attempt = 0; attempt < 256; attempt++) {
    const castChoice = chosen.performer || (prefs.species !== 'auto' ? 'animal' : undefined);
    const availableCast = selectedEnsemble ? CAST.filter(option => (option.id !== 'duo' || selectedEnsemble === 'duo') && (option.id !== 'group' || selectedEnsemble === 'trio') && (option.id !== 'crowd' || selectedEnsemble === 'crowd') && (option.id !== 'human_animal' || selectedEnsemble !== 'solo')) : CAST;
    let cast = CAST.find(option => option.id === castChoice) || pick(availableCast, seedText, 'cast', attempt);
    const appearance = pick(APPEARANCE, seedText, 'appearance', attempt);
    const outfit = pick(OUTFIT, seedText, 'outfit', attempt);
    const palette = pick(PALETTE, seedText, 'palette', attempt);
    const location = LOCATION.find(option => option.id === chosen.location) || pick(LOCATION, seedText, 'location', attempt);
    const choreography = CHOREOGRAPHY.find(option => option.id === chosen.danceStyle) || pick(weightedChoreography, seedText, `choreography:${music.profileId || 'unmatched'}`, attempt);
    const explicitCast = prefs.performer !== 'auto' || prefs.ensemble !== 'auto' || prefs.species !== 'auto';
    const defaultCount = cast.id === 'duo' ? 2 : cast.id === 'group' ? 3 : cast.id === 'crowd' ? 4 + hash(`${seedText}:crowd:${attempt}`) % 3 : cast.id === 'human_animal' ? 2 : 1;
    const randomEnsemble = ['solo', 'duo', 'trio', 'crowd'][hash(`${seedText}:ensemble:${attempt}`) % 4] as DanceEnsemble;
    const ensemble = selectedEnsemble || (inferredCast.count ? ensembleForCount(inferredCast.count) : explicitCast || chosen.performer ? ensembleForCount(defaultCount) : cast.id === 'duo' || cast.id === 'group' || cast.id === 'crowd' ? ensembleForCount(defaultCount) : randomEnsemble);
    let count = inferredCast.count || { solo: 1, duo: 2, trio: 3, crowd: 4 + hash(`${seedText}:crowd:${attempt}`) % 3 }[ensemble];
    if (cast.id === 'human_animal' && count === 1) {
      if (selectedEnsemble === 'solo' || inferredCast.count === 1) throw new DanceCreativeInputError('사람 + 동물은 2명 이상이 필요합니다.', 'CREATIVE_CONFLICT');
      count = 2;
    }
    const species = prefs.species !== 'auto' ? [prefs.species] : inferredCast.species.length ? inferredCast.species : [DANCE_ANIMAL_SPECIES[hash(`${seedText}:species:${attempt}`) % DANCE_ANIMAL_SPECIES.length]];
    if (!castChoice && count > 1 && !['robot', 'animal', 'human_animal'].includes(cast.id)) cast = CAST.find(option => option.id === (count === 2 ? 'duo' : count === 3 ? 'group' : 'crowd'))!;
    const castContract = makeCast(cast.id, count, species, appearance.id, palette.id, inferredCast);
    const axes = { castId: cast.id, appearanceId: appearance.id, outfitId: outfit.id, paletteId: palette.id, locationId: location.id, choreographyId: choreography.id };
    const signature = `dance-v2-${hash([...AXES.map(key => axes[key]), count, castContract.members.map(member => member.species).join(','), prefs.visualStyle, prefs.difficulty].join('|')).toString(16).padStart(8, '0')}`;
    if (history.some(old => old.signature === signature || (AXES.every(key => typeof old[key] === 'string') && AXES.filter(key => old[key] !== axes[key]).length < 2))) continue;
    const sources = { cast: explicitCast ? 'explicit' : chosen.performer || inferredCast.count ? 'brief' : 'automatic', location: prefs.location !== 'auto' ? 'explicit' : chosen.location ? 'brief' : 'automatic', choreography: prefs.danceStyle !== 'auto' ? 'explicit' : chosen.danceStyle ? 'brief' : 'automatic' } as DanceCreativeDirection['sources'];
    const lockedAxes: DanceCreativeDirection['lockedAxes'] = [];
    if (sources.cast !== 'automatic') lockedAxes.push('castId');
    if (sources.location !== 'automatic') lockedAxes.push('locationId');
    if (sources.choreography !== 'automatic') lockedAxes.push('choreographyId');
    const movement = castContract.members.some(member => member.kind === 'animal') ? `species-native grounded motion; ${choreography.id} rhythm translated to each anatomy, never human limbs on animals` : choreography.en;
    const styling = castContract.kind === 'human' ? `${outfit.id} clothing, flat shoes` : castContract.kind === 'robot' ? `${outfit.id} shell details` : `${outfit.id} collars; humans wear flat shoes`;
    const base = `Explicit selected cast/place/dance style are contracts; preserve other brief details. ${buildDanceCastPrompt(castContract)} Place: ${location.en}. Choreography (${choreography.id}): ${movement}. Styling defaults: ${styling}; ${palette.en}. Visual: ${VISUAL[prefs.visualStyle]}. Difficulty: ${prefs.difficulty}; readable full-body motion.`;
    const concreteEn = `${base}\n${musicTimingEn(music, prefs.difficulty)}`.trim();
    if (concreteEn.length > 1600) throw new DanceCreativeInputError('출연자 연출 설명이 너무 깁니다.', 'CREATIVE_VARIATION');
    return { version: 2, ...axes, cast: castContract, signature, castLabel: `${label('performer', cast.id)} · ${count}명`, locationLabel: label('location', location.id), danceStyleLabel: label('danceStyle', choreography.id), sources, lockedAxes,
      musicMatch: { ...music, selection: sources.choreography !== 'automatic' ? 'user' : music.preferredStyles.includes(choreography.id) ? 'preferred' : 'adapted' },
      concreteEn };
  }
  throw new DanceCreativeInputError('최근 연출과 다른 조합을 만들지 못했습니다. 인물·장소·안무 중 하나를 바꿔 주세요.', 'CREATIVE_VARIATION');
}

const WARDROBE_TERMS: readonly [string, RegExp][] = [
  ['red', /빨간|빨강|붉은|\bred\b/i], ['blue', /파란|파랑|푸른|\bblue\b/i], ['black', /검은|검정|블랙|\bblack\b/i],
  ['white', /하얀|흰색|흰\s|화이트|\bwhite\b/i], ['yellow', /노란|노랑|\byellow\b/i], ['pink', /분홍|핑크|\bpink\b/i],
  ['tracksuit', /트레이닝복|운동복|\btracksuits?\b/i], ['suit', /정장|\bsuits?\b/i], ['dress', /원피스|드레스|\bdress(?:es)?\b/i],
  ['jacket', /재킷|자켓|\bjackets?\b/i], ['hoodie', /후드|\bhoodies?\b/i], ['hat', /모자|\bhats?\b/i],
];
const IDENTITY_COLORS: readonly [string, RegExp][] = [
  ['blonde', /금발|\bblond(?:e)?\b/i], ['black', /흑발|검은|검정|\bblack\b/i], ['brown', /갈색|밤색|\bbrown\b/i],
  ['silver', /은발|은색|\bsilver\b/i], ['grey', /회색|\bgr[ae]y\b/i], ['white', /백발|흰|하얀|\bwhite\b/i],
  ['red', /적발|붉은|빨간|\bred\b|\bredhead\b/i], ['copper', /구리색|\bcopper\b/i], ['blue', /파란|푸른|\bblue\b/i],
  ['pink', /분홍|\bpink\b/i], ['purple', /보라|\bpurple\b/i], ['green', /초록|\bgreen\b/i], ['dark', /어두운|\bdark\b/i],
];
type IdentityPatch = Partial<Pick<DanceProductionAnchorV3, 'gender' | 'ageBand' | 'hair' | 'face' | 'coat' | 'surface'>>;
function briefAttributeClauses(brief: string): string[] {
  return brief.split(/[.!?;,\n，]|\s+and\s+(?=[^.!?;,\n]{0,70}\b(?:wom[ae]n|m[ae]n|performer_[1-6]|left|right|cats?|dogs?|penguins?|otters?|bears?|rabbits?|fox(?:es)?|robots?|dancers?)\b)|그리고|반면|(?<=(?:명|마리|여성|여자|남성|남자))\s*(?:과|와|및)\s*|\s+(?=(?:여성|여자|남성|남자)(?:은|는|이|가)\s)/i).filter(value => value.trim());
}
function attributeTargets(clause: string, anchors: DanceProductionAnchorV3[], members: DanceCastMember[], intrinsic: boolean): number[] {
  const specific = [...clause.matchAll(/\bperformer_([1-6])\b/gi)].map(match => Number(match[1]) - 1);
  for (const [pattern, position] of [[/왼쪽|좌측|\bleft\b/i, 'left'], [/오른쪽|우측|\bright\b/i, 'right']] as const) {
    if (pattern.test(clause)) {
      const indices = members.flatMap((member, index) => member.position.includes(position) ? [index] : []);
      if (indices.length !== 1) throw new DanceCreativeInputError('왼쪽·오른쪽 출연자 설정은 한 명을 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
      specific.push(indices[0]);
    }
  }
  if (/주인공|리드|\blead\b/i.test(clause)) specific.push(0);
  if (/파트너|\bpartner\b/i.test(clause)) specific.push(1);
  if (specific.some(index => !anchors[index]) || new Set(specific).size > 1) throw new DanceCreativeInputError('출연자 ID·역할 설정이 서로 다릅니다.', 'CREATIVE_CONFLICT');
  if (specific.length) return [specific[0]];
  const woman = /여성|여자|\bwom[ae]n\b|\bfemale\b/i.test(clause), man = /남성|남자|\bm[ae]n\b|\bmale\b/i.test(clause);
  const species = DANCE_ANIMAL_SPECIES.filter(species => new RegExp(SPECIES_HINTS[species], 'i').test(clause));
  let candidates = anchors.flatMap((anchor, index) => species.length ? species.includes(anchor.species as DanceAnimalSpecies) ? [index] : []
    : /로봇|\brobot\b/i.test(clause) ? anchor.kind === 'robot' ? [index] : []
      : woman || man ? anchor.kind === 'human' && ((woman && man) || anchor.gender === (woman ? 'woman' : 'man')) ? [index] : []
        : intrinsic ? anchor.kind === 'human' ? [index] : [] : [index]);
  if (/모두|각각|모든|둘\s*다|\b(?:all|each|both|every)\b/i.test(clause)) {
    if (woman || man) candidates = anchors.flatMap((anchor, index) => anchor.kind === 'human' ? [index] : []);
    return candidates;
  }
  if (candidates.length > 1 && /중\s*한|\b(?:one of|among)\b/i.test(clause)) throw new DanceCreativeInputError('외모·의상 특징이 있는 출연자를 ID나 역할로 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
  if (candidates.length > 1 && (namedCount(clause, HUMAN_PATTERN) === candidates.length || /\b(?:women|men)\b/i.test(clause))) return candidates;
  if (candidates.length > 1 && !intrinsic && !(woman || man || species.length)) return [];
  if (candidates.length !== 1) throw new DanceCreativeInputError('나이·외모·의상은 출연자 ID나 성별·역할로 한 명을 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
  return candidates;
}
function identityPatch(clause: string): IdentityPatch {
  const result: IdentityPatch = {};
  const woman = /여성|여자|\bwoman\b|\bfemale\b/i.test(clause), man = /남성|남자|\bman\b|\bmale\b/i.test(clause);
  if (woman !== man) result.gender = woman ? 'woman' : 'man';
  if (/아동|아이(?:가|들|의|는)|어린이|미성년|소년|소녀|\b(?:child(?:ren)?|kids?|boy|girl|teen(?:ager)?)\b/i.test(clause)
    && !/없이|없는|\b(?:no|without)\b/i.test(clause)) throw new DanceCreativeInputError('사람 출연자는 성인으로 설정해 주세요.', 'CREATIVE_CONFLICT');
  const decades = [...clause.matchAll(/(\d{2})\s*대|\b(\d{2})s\b/gi)].map(match => Number(match[1] || match[2]));
  const ages = [...clause.matchAll(/(\d{1,3})[-\s]*(?:세|살|years?[-\s]+old|y\/o)/gi)].map(match => Number(match[1]));
  const wordAge = ([['20s', /\btwenties\b|청년|\byoung adult\b|\byoung\s+(?:woman|man|dancer)\b/i], ['30s', /\bthirties\b/i], ['40s', /\bforties\b|중년|\bmiddle[- ]aged\b/i], ['50s', /\bfifties\b/i], ['60s', /\bsixties\b|노년|\belderly\b/i], ['70s', /\bseventies\b/i]] as const).filter(([, pattern]) => pattern.test(clause));
  const ageValues = [...decades.map(age => `${age}s`), ...ages.map(age => `${age} years old`), ...wordAge.map(([age]) => age)];
  if (decades.some(age => age < 20 || age > 90 || age % 10) || ages.some(age => age < 18 || age > 119) || new Set(ageValues).size > 1) throw new DanceCreativeInputError('성인 출연자의 나이를 한 가지로 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
  if (ageValues.length) result.ageBand = ageValues[0];
  const hairContext = clause.match(/(?:(?:short|long|dark|black|brown|blond(?:e)?|silver|gr[ae]y|white|red|copper|blue|pink|purple|green|curly|straight|wavy|side-part)\s+){0,5}(?:hair|hairstyle|ponytail|braids?|curls?|bob|crop|mohawk|dreadlocks|bun|fringe)\b|(?:(?:짧은|긴|금발|흑발|은발|백발|적발|검은|갈색|은색|회색|흰|하얀|붉은|빨간|파란|푸른|분홍|보라|초록|곱슬|땋은|생|웨이브)\s*){0,5}(?:머리|헤어|포니테일|단발|곱슬)|금발|흑발|은발|백발|적발|\b(?:blond(?:e)?|brunette|redhead|bald)\b|대머리/gi)?.join(' ') || '';
  if (hairContext) {
    const colors = IDENTITY_COLORS.filter(([, pattern]) => pattern.test(hairContext)).map(([color]) => color);
    if (colors.length > 1 && colors.includes('dark')) colors.splice(colors.indexOf('dark'), 1);
    if (/\bbrunette\b/i.test(hairContext)) colors.push('brown');
    const length = /짧은|짧게|단발|\bshort\b/i.test(hairContext) ? 'short' : /긴|길게|\blong\b/i.test(hairContext) ? 'long' : '';
    const styles = ([['ponytail', /포니테일|묶은|\bponytail\b/i], ['braids', /땋은|\bbraids?\b/i], ['curls', /곱슬|\bcurls?|curly\b/i], ['bob', /단발|\bbob\b/i], ['crop', /\bcrop\b/i], ['mohawk', /모호크|\bmohawk\b/i], ['bun', /번\s*헤어|\bbun\b/i], ['dreadlocks', /\bdreadlocks\b/i], ['straight hair', /생머리|\bstraight\b/i], ['wavy hair', /웨이브\s*머리|\bwavy\b/i], ['side-part hair', /\bside-part\b/i], ['fringe', /\bfringe\b/i]] as const).filter(([, pattern]) => pattern.test(hairContext)).map(([style]) => style);
    if (new Set(colors).size > 1 || styles.length > 1) throw new DanceCreativeInputError('머리 색·모양을 한 가지로 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
    if (/대머리|\bbald\b/i.test(hairContext)) result.hair = 'bald';
    else if (length || colors.length || styles.length) result.hair = [length, colors[0], styles[0] || 'hair'].filter(Boolean).join(' ');
    else throw new DanceCreativeInputError('요청한 머리 특징을 안전하게 고정하지 못했습니다. 짧은 금발처럼 색·모양을 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
  }
  const face: string[] = [];
  const heritage = ([['Korean', /한국인|한국\s*(?:여성|남성)|\bKorean\b/i], ['East Asian', /동아시아|\bEast Asian\b/i], ['Black', /흑인|\bBlack\s+(?:woman|man|person|dancer)\b/i], ['White', /백인|\bWhite\s+(?:woman|man|person|dancer)\b/i], ['South Asian', /남아시아|\bSouth Asian\b/i], ['Latina', /\bLatin[ao]\b/i], ['Middle Eastern', /중동|\bMiddle Eastern\b/i]] as const).filter(([, pattern]) => pattern.test(clause));
  if (heritage.length > 1) throw new DanceCreativeInputError('출연자의 외모 특징을 한 가지로 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
  if (heritage.length) face.push(`${heritage[0][0]} face`);
  const eye = clause.match(/(?:blue|brown|green|grey|gray|black|hazel)\s+eyes\b|(?:파란|푸른|갈색|초록|회색|검은)\s*(?:눈동자|눈)/i);
  if (eye) {
    const color = IDENTITY_COLORS.find(([, pattern]) => pattern.test(eye[0]))?.[0] || 'hazel';
    face.push(`${color} eyes`);
  }
  const shape = clause.match(/(?:round|oval|square|angular)\s+face\b|(?:둥근|계란형|각진)\s*얼굴/i);
  if (shape) face.push(/round|둥근/i.test(shape[0]) ? 'round face' : /oval|계란형/i.test(shape[0]) ? 'oval face' : 'angular face');
  if (/주근깨|\bfreckles\b/i.test(clause)) face.push('freckles');
  const skin = clause.match(/(?:fair|pale|tan|dark|light|brown)\s+skin\b|(?:밝은|하얀|흰|어두운|갈색)\s*피부/i);
  if (skin) face.push(/dark|어두운/i.test(skin[0]) ? 'dark skin' : /tan|brown|갈색/i.test(skin[0]) ? 'tan skin' : 'fair skin');
  if (/수염|\bbeard\b/i.test(clause)) face.push('beard');
  const build = clause.match(/\b(?:tall|slim|athletic|muscular)\b|키가\s*큰|날씬한|근육질/i);
  if (build) face.push(/tall|키가/i.test(build[0]) ? 'tall build' : /muscular|근육질/i.test(build[0]) ? 'muscular build' : /athletic/i.test(build[0]) ? 'athletic build' : 'slim build');
  if (face.length) result.face = face.join(', ');
  const animal = DANCE_ANIMAL_SPECIES.find(species => new RegExp(SPECIES_HINTS[species], 'i').test(clause));
  if (animal) {
    const speciesIndex = clause.search(new RegExp(SPECIES_HINTS[animal], 'i'));
    const coatContext = clause.slice(Math.max(0, speciesIndex - 35), speciesIndex) + (clause.match(/(?:black|brown|white|grey|gray|red|orange|cream|silver)\s+(?:fur|coat)\b|(?:검은|갈색|흰|회색|붉은)\s*털/i)?.[0] || '');
    const color = IDENTITY_COLORS.find(([, pattern]) => pattern.test(coatContext))?.[0];
    if (color) result.coat = `${color} ${animal}`;
  }
  if (/로봇|\brobot\b/i.test(clause)) {
    const surface = clause.match(/(?:matte|metallic|chrome|copper|gold|silver|steel|wooden)\s+(?:shell|surface|robot)\b|(?:무광|금색|은색|구리|금속)\s*(?:로봇|표면|외장)/i);
    if (surface) result.surface = `${/chrome/i.test(surface[0]) ? 'chrome' : /gold|금색/i.test(surface[0]) ? 'gold' : /silver|은색/i.test(surface[0]) ? 'silver' : /copper|구리/i.test(surface[0]) ? 'copper' : /matte|무광/i.test(surface[0]) ? 'matte' : 'metallic'} articulated shell`;
  }
  const unresolved = /(?:나이|\bage(?:d)?\b|\byears?[- ]old\b|(?:스무|서른|마흔|쉰|예순)\s*(?:세|살|대)|눈동자|\b(?:eye color|skin tone|ethnicity)\b)/i.test(clause) && !result.ageBand && !result.face
    || /(?:얼굴|\bface\b)/i.test(clause) && !result.face && !/표정|웃|미소|\b(?:smil|expression|gaze|facing)/i.test(clause);
  if (unresolved) throw new DanceCreativeInputError('요청한 정체성 특징을 안전하게 고정하지 못했습니다. 출연자와 특징을 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
  return result;
}
function applyBriefProductionLocks(brief: string, anchors: DanceProductionAnchorV3[], members: DanceCastMember[], prefs: DanceCreativePreferences) {
  if (/\brespectively\b/i.test(brief) && /\bwom[ae]n\b|여성|여자/i.test(brief) && /\bm[ae]n\b|남성|남자/i.test(brief)
    && WARDROBE_TERMS.some(([, pattern]) => pattern.test(brief))) throw new DanceCreativeInputError('각 출연자의 의상·색상을 별도 문장이나 ID로 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
  const assigned = new Map<string, Map<string, unknown>>(), wardrobe = new Map<string, Set<string>>(), globalTerms = new Set<string>();
  for (const clause of briefAttributeClauses(brief)) {
    const patch = identityPatch(clause);
    // Unqualified gender-only roster wording already shaped the cast. It must not retarget animal members.
    const inheritedGender = Object.keys(patch).length === 1 && patch.gender && !/performer_[1-6]|왼쪽|오른쪽|좌측|우측|주인공|파트너|\b(?:left|right|lead|partner)\b/i.test(clause)
      && anchors.filter(anchor => anchor.kind === 'human').every(anchor => anchor.gender === patch.gender);
    const hasIdentity = Object.keys(patch).length > 0 && !inheritedGender;
    const wardrobeClause = clause.replace(/\b(?:short|long|blond(?:e)?|black|brown|silver|gr[ae]y|white|red|copper|blue|pink|purple|green|dark|curly|straight)(?:\s+(?:short|long|curly|straight|dark))*\s+(?:hair|eyes|skin|ponytail|braids?|curls?|bob|crop)\b|(?:짧은|긴|금발|흑발|은발|백발|적발|검은|갈색|은색|회색|흰|하얀|붉은|빨간|파란|푸른|분홍|보라|초록|곱슬)(?:\s*(?:짧은|긴|곱슬))*\s*(?:머리|눈동자|눈|피부)/gi, ' ');
    const garment = WARDROBE_TERMS.filter(([term, pattern]) => !IDENTITY_COLORS.some(([color]) => color === term) && pattern.test(wardrobeClause));
    const terms = garment.length || /의상|옷|입|\b(?:wear(?:ing)?|dressed|clothing|outfit)\b/i.test(wardrobeClause) ? WARDROBE_TERMS.filter(([, pattern]) => pattern.test(wardrobeClause)).map(([term]) => term) : [];
    if ((hasIdentity || terms.length) && /또는|혹은|\bor\b|\bnot\b/i.test(clause)) throw new DanceCreativeInputError('대안·부정이 포함된 외모·의상은 한 가지로 분명하게 지정해 주세요.', 'CREATIVE_CONFLICT');
    if (hasIdentity) {
      for (const index of attributeTargets(clause, anchors, members, true)) {
        const anchor = anchors[index], fields = assigned.get(anchor.id) || new Map<string, unknown>();
        const woman = /여성|여자|\bwoman\b|\bfemale\b/i.test(clause), man = /남성|남자|\bman\b|\bmale\b/i.test(clause);
        const resolved = { ...patch, ...(anchor.kind === 'human' && woman !== man ? { gender: woman ? 'woman' : 'man' } : {}) } as IdentityPatch;
        if ((anchor.kind !== 'human' && (resolved.ageBand || resolved.hair || resolved.face)) || (resolved.coat && anchor.kind !== 'animal') || (resolved.surface && anchor.kind !== 'robot')
          || (resolved.gender && ['woman', 'man'].includes(prefs.performer) && resolved.gender !== prefs.performer)) throw new DanceCreativeInputError('외모 특징과 선택한 출연자 유형이 다릅니다.', 'CREATIVE_CONFLICT');
        for (const [key, value] of Object.entries(resolved)) {
          if (key === 'face') {
            if (!fields.has('face.default')) fields.set('face.default', anchor.face?.replace('distinct original ', ''));
            for (const part of String(value).split(', ')) {
              const category = /Korean|East Asian|Black|White|South Asian|Latin[ao]|Middle Eastern/i.test(part) ? 'heritage' : /eyes/i.test(part) ? 'eyes'
                : /skin/i.test(part) ? 'skin' : /build/i.test(part) ? 'build' : /face/i.test(part) ? 'shape' : part;
              const field = `face.${category}`;
              if (fields.has(field) && fields.get(field) !== part) throw new DanceCreativeInputError('같은 출연자의 외모 특징이 서로 다릅니다.', 'CREATIVE_CONFLICT');
              fields.set(field, part);
            }
            anchor.face = `distinct original ${[...(fields.has('face.heritage') ? [] : [fields.get('face.default')]), ...[...fields].filter(([field]) => field.startsWith('face.') && field !== 'face.default').map(([, part]) => part)].join(', ')}`;
            continue;
          }
          if (fields.has(key) && fields.get(key) !== value) throw new DanceCreativeInputError('같은 출연자의 정체성 특징이 서로 다릅니다.', 'CREATIVE_CONFLICT');
          fields.set(key, value);
          Object.assign(anchor, { [key]: value });
        }
        assigned.set(anchor.id, fields);
      }
    }
    for (const term of terms) globalTerms.add(term);
    if (terms.length) for (const index of attributeTargets(clause, anchors, members, false)) {
      const memberTerms = wardrobe.get(anchors[index].id) || new Set<string>(); terms.forEach(term => memberTerms.add(term)); wardrobe.set(anchors[index].id, memberTerms);
    }
  }
  return { wardrobeTerms: [...globalTerms], wardrobeByMember: anchors.flatMap(anchor => wardrobe.has(anchor.id) ? [{ memberId: anchor.id, terms: [...wardrobe.get(anchor.id)!] }] : []) };
}
function briefLayout(brief: string): keyof typeof DANCE_PRODUCTION_LAYOUTS | null {
  if (/또는|혹은|\bor\b|\bnot\b/i.test(brief)) return null;
  const matches = ([['side_by_side', /나란히|좌우로|side.by.side/i], ['open_triangle', /삼각\s*(?:대형|배치)|triangle/i],
    ['staggered_rows', /두\s*줄|two\s+rows/i], ['loose_arc', /반원|곡선\s*대형|shallow\s+arc/i], ['diagonal', /대각선|diagonal/i]] as const).filter(([, pattern]) => pattern.test(brief));
  return matches.length === 1 ? matches[0][0] : null;
}
function defaultLayout(count: number): keyof typeof DANCE_PRODUCTION_LAYOUTS {
  return count === 1 ? 'solo_center' : count === 2 ? 'side_by_side' : count === 3 ? 'open_triangle' : 'staggered_rows';
}
/** Resolve selection facts once, but expose automatic production choices only as overridable hints. */
export function resolveDanceProductionSeedV3(raw: unknown, seed: string, brief = '', recent: readonly unknown[] = [], musicSpec?: DanceDirectionMusicSpec): DanceProductionSeedV3 {
  const prefs = validateDanceCreativePreferences(raw);
  for (const key of ['location', 'danceStyle'] as const) {
    const requested = hint(key, brief);
    if (prefs[key] !== 'auto' && requested && prefs[key] !== requested && !/또는|혹은|\bor\b|\bnot\b/i.test(brief)) throw new DanceCreativeInputError('선택한 장소·안무와 상황 설정이 다릅니다.', 'CREATIVE_CONFLICT');
  }
  const draft = resolveDanceCreativeDirection(prefs, seed, brief, recent, musicSpec);
  const cast = validateDanceCastContract(draft.cast), details = briefCast(brief);
  const offset = Math.max(0, APPEARANCE.findIndex(option => option.id === draft.appearanceId));
  const anchors = cast.members.map((member, index): DanceProductionAnchorV3 => {
    const human = member.kind === 'human', detailIndex = (offset + index) % HAIR.length;
    const gender = !human ? 'none' : draft.castId === 'woman' ? 'woman' : draft.castId === 'man' ? 'man'
      : details.woman && details.man ? index % 2 === 0 ? 'woman' : 'man' : details.woman ? 'woman' : details.man ? 'man'
        : cast.kind === 'human_animal' && index === 0 && offset % 2 === 0 ? 'woman' : 'unspecified';
    return { id: member.id, kind: member.kind, species: member.species, gender, adult: human,
      ageBand: human ? `${[20, 30, 40, 50][detailIndex % 4]}s` : null,
      face: human ? `distinct original ${HUMAN_LOOKS[detailIndex]} face` : member.kind === 'robot' ? `${['round', 'oval', 'square'][index % 3]} lens face` : null,
      hair: human ? HAIR[detailIndex] : null, coat: member.kind === 'animal' ? ANIMAL_COATS[member.species as DanceAnimalSpecies] : null,
      surface: member.kind === 'robot' ? 'articulated matte shell' : null, movementAnatomy: member.movementAnatomy };
  });
  const layoutId = briefLayout(brief) || (cast.count === 2 && /왼쪽|오른쪽|\b(?:left|right)\s+(?:dancer|performer|woman|man)\b|\b(?:dancer|performer|woman|man)\s+on\s+the\s+(?:left|right)\b/i.test(brief) ? 'side_by_side' : null);
  if (layoutId && !(DANCE_PRODUCTION_LAYOUTS[layoutId].counts as readonly number[]).includes(cast.count)) throw new DanceCreativeInputError('상황 설정의 배치와 출연자 수가 다릅니다.', 'CREATIVE_CONFLICT');
  // Resolve explicit intrinsic details before any model call; automatic details retain seeded variety.
  const wardrobeLocks = applyBriefProductionLocks(brief, anchors, cast.members, prefs);
  return { version: 3, seedId: seed, count: cast.count, kind: cast.kind, ensemble: cast.ensemble, anchors,
    locks: { locationId: draft.sources.location === 'automatic' ? null : draft.locationId,
      danceStyleId: draft.sources.choreography === 'automatic' ? null : draft.choreographyId, layoutId,
      visualStyle: prefs.visualStyle, difficulty: prefs.difficulty, ...wardrobeLocks },
    hints: { locationId: draft.locationId, danceStyleId: draft.choreographyId, outfitId: draft.outfitId, paletteId: draft.paletteId, layoutId: layoutId || defaultLayout(cast.count) },
    variation: { castId: draft.castId, appearanceId: draft.appearanceId, sources: draft.sources, musicMatch: draft.musicMatch } };
}
function productionText(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > limit || !/^[ -~]+$/.test(value)
    || /data:|base64/i.test(value)) throw new DanceCreativeInputError('공연 제작 세부 설정을 확인해 주세요.');
  return value;
}
/** Classify seconds by media grammar; age cues stay visible even beside valid timing. */
function hasDanceSceneAgeOverride(value: string): boolean {
  if (/\b(?:age(?:d)?\s*[:=]?|in\s*(?:her|his|their|the|early|mid|late))\s*(?:(?:early|mid|late)[- ]?)?\d+(?:\.\d+)?\s*s\b/i.test(value)
    || /\b(?:woman|man|dancer|performer|performer_[1-6])\s+in\s*(?:(?:her|his|their|the)\s*)?(?:(?:early|mid|late)[- ]?)?\d+\s*s\b/i.test(value)
    || /(?:^|\b(?:a|an|the|adult|original)\s+)[1-9]0s\s*(?:[-–—~]|to)\s*[1-9]0s\s+(?:adult\s+)?(?:woman|man|dancer|performer|person|human)\b/i.test(value)
    || /\b\d{1,3}\s*(?:years?\s*old|year[- ]old|y\/o)\b/i.test(value)) return true;
  const number = '\\d+(?:\\.\\d+)?', seconds = `${number}\\s*s\\b`;
  const grammars = [
    `\\b(?:from\\s*)?${number}\\s*s?\\s*(?:[-–—~]|to|until|till|through)\\s*${seconds}`,
    `\\bbetween\\s*${number}\\s*s?\\s*and\\s*${seconds}`,
    `\\b(?:first|second|next|last|remaining|initial|final|local|elapsed|total)\\s*${seconds}`,
    `\\b(?:t|time)\\s*[:=]\\s*${seconds}`,
    `(?:^|[\\s;(.])${seconds}(?=\\s*:)`,
    `\\b(?:for|over|during|lasting|after|before|at|by|within|throughout|in)\\s*(?:the\\s*)?(?:full\\s*)?${seconds}`,
    `\\b(?:duration|length)\\s*(?::|=|of|is)?\\s*${seconds}`,
    `\\b(?:by\\s*the\\s*end\\s*of|(?:ends?|finish(?:es)?|stops?|complete(?:s)?)\\s*(?:at|by|in|within))\\s*(?:local\\s*)?${seconds}`,
    `\\bfull\\s*${seconds}`,
    `${seconds}(?=\\s+(?:dance\\s+)?(?:sequence|clip|video|performance|preview|scene|segment|window|duration|test|take|animation|mark|timestamp)\\b|[- ]+long\\b|\\s+in\\s+duration\\b)`,
  ];
  const timeSpans = grammars.flatMap(pattern => [...value.matchAll(new RegExp(pattern, 'gi'))]
    .map(match => [match.index!, match.index! + match[0].length]));
  return [...value.matchAll(new RegExp(seconds, 'gi'))].some(match => {
    // 15s is seconds, not a decade. Bare 20s/30s/etc. remain ambiguous identity data.
    if (!/^[1-9]0s$/i.test(match[0].replace(/\s/g, ''))) return false;
    const start = match.index!, end = start + match[0].length;
    return !timeSpans.some(([from, to]) => start >= from && end <= to);
  });
}
/** Provider scene prose cannot override typed facts. Absence phrases describe genuine empty locations. */
export function assertDanceProductionSceneTextV3(value: string, environmentOnly = false, seed?: DanceProductionSeedV3): void {
  const positive = value.replace(/\b(?:no|without)\s+(?:(?:any|a|an|additional|extra|other|background)\s+){0,3}(?:human\s+(?:dancers?|performers?)|people|humans?|persons?|dancers?|performers?|child(?:ren)?|kids?|men|women|crowds?|bystanders|onlookers)\b/gi, ' ')
    .replace(/(?:사람|인간|출연자|무용수|아이들|어린이|관중)\s*(?:없이|없는)/g, ' ')
    .replace(/\b(?:dancer|performer|human|woman|man|animal|robot|dog|cat)\s+(?:statue|sculpture|mural|painting|portrait|mannequin|toy)\b/gi, 'scene object')
    .replace(/\bhuman[- ]scale\b/gi, 'ordinary scale').replace(/\bchildren(?:'s)?\s+playground\b|\bchild[- ]friendly\b/gi, 'play area');
  const actor = '(?:performer_[1-6]|cast|dancers?|performers?|humans?|people|persons?|child(?:ren)?|kids?|teenagers?|adults?|wom[ae]n|m[ae]n|boys?|girls?|animals?|robots?|cats?|dogs?|penguins?|otters?|bears?|rabbits?|fox(?:es)?)';
  const intrinsic = '(?:identity|identities|faces?|hair|hairstyle|eyes?|skin|ethnicity|age|gender|species|anatomy|wardrobe|clothing|outfits?|dress|suit|jacket|hoodie|hat|coat|fur|shell|surface)';
  const qualifiers = '(?:(?:a|an|the|all|one|two|three|four|five|six|[1-6]|new|additional|extra|saved|original|adult)\\s+){0,5}';
  if (hasDanceSceneAgeOverride(positive)) {
    throw new DanceCreativeInputError('공연 설명으로 저장된 출연자의 나이를 바꿀 수 없습니다.', 'CREATIVE_CONFLICT');
  }
  if (new RegExp(`\\b(?:replace|swap|recast|add|remove|omit|substitute)\\s+${qualifiers}(?:${actor}|${intrinsic})\\b`, 'i').test(positive)
    || new RegExp(`\\b(?:change|transform|convert|redesign)\\s+${qualifiers}(?:${actor}(?:'s)?\\s+)?${intrinsic}\\b`, 'i').test(positive)
    || new RegExp(`\\b(?:turn|make|change)\\b[^.!?;]{0,50}\\b${actor}\\b[^.!?;]{0,30}\\b(?:into|younger|older|male|female|wear)\\b`, 'i').test(positive)
    || new RegExp(`\\b${actor}\\b[^.!?;]{0,70}\\b(?:becomes?|turns? into|transforms? into|is now|are now)\\s+${qualifiers}(?:${actor}|${intrinsic}|younger|older|male|female)\\b`, 'i').test(positive)
    || /\b(?:blonde|brunette|redhead|hairstyle|hair|eye color|skin tone|ethnicity|years old|beard|new face|different face|child(?:ren)?|kids?|teenagers?|boys?|girls?)\b/i.test(positive)
    || /\b(?:blue|brown|green|gr[ae]y|black|hazel)\s+eyes\b|\b(?:round|oval|square|angular)\s+face\b|\b(?:fair|pale|tan|dark|light|brown)\s+skin\b/i.test(positive)
    || /\b(?:black|brown|white|gr[ae]y|red|orange|cream|silver|gold|copper)\s+(?:fur|shell|cat|dog|penguin|otter|bear|rabbit|fox|robot)\b|\b(?:young|elderly|middle-aged|teenage|younger|older)\s+(?:adult\s+)?(?:dancer|performer|woman|man)\b/i.test(positive)
    || /출연자.*(?:교체|바꾸|변경|추가)|어린이|미성년|머리\s*색|성별\s*변경/i.test(positive)
    || (environmentOnly && (new RegExp(`\\b${actor}\\b`, 'i').test(positive) || /\b(?:wardrobe|clothing|outfit|dress|suit|jacket|hoodie|hat|gender|species|identity|anatomy)\b/i.test(positive)))) {
    throw new DanceCreativeInputError('장소·연출 설명으로 저장된 출연자·정체성·의상을 바꿀 수 없습니다.', 'CREATIVE_CONFLICT');
  }
  if (seed && !environmentOnly) {
    const speciesMentions = DANCE_ANIMAL_SPECIES.filter(species => new RegExp(SPECIES_HINTS[species], 'i').test(positive));
    const genderConflict = /\bwom[ae]n\b|\bfemale\b/i.test(positive) && !seed.anchors.some(anchor => anchor.gender === 'woman')
      || /\bm[ae]n\b|\bmale\b/i.test(positive) && !seed.anchors.some(anchor => anchor.gender === 'man');
    const kindConflict = /\bhumans?|people|persons?\b/i.test(positive) && !seed.anchors.some(anchor => anchor.kind === 'human')
      || /\brobots?\b/i.test(positive) && !seed.anchors.some(anchor => anchor.kind === 'robot');
    const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    const counts = [...positive.matchAll(new RegExp(`(?:^|[.!?;]\\s*|\\b(?:exactly|only|cast of|show|featuring)\\s+)(one|two|three|four|five|six|\\d+)\\s+(?:(?:original|distinct|adult|human|nonhuman|animal|articulated)\\s+){0,4}${actor}\\b`, 'gi'))];
    if (genderConflict || kindConflict || speciesMentions.some(species => !seed.anchors.some(anchor => anchor.species === species))
      || counts.some(match => { const count = numbers[match[1].toLowerCase()] || Number(match[1]); return count > seed.count || count !== seed.count && /\b(?:exactly|only|cast of|show|featuring)\b/i.test(match[0]); })) throw new DanceCreativeInputError('공연 설명의 인원·성별·종이 저장된 출연자와 다릅니다.', 'CREATIVE_CONFLICT');
  }
}
export function validateDanceProductionManifestV3(value: unknown, seed: DanceProductionSeedV3): DanceProductionManifestV3 {
  validateDanceProductionSeedV3(seed);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DanceCreativeInputError('공연 제작 설정이 필요합니다.');
  const item = value as Record<string, unknown>, keys = ['version', 'locationId', 'danceStyleId', 'layoutId', 'locationDetail', 'wardrobes'];
  if (Object.keys(item).length !== keys.length || keys.some(key => !Object.hasOwn(item, key)) || item.version !== 3
    || !LOCATION.some(option => option.id === item.locationId) || !CHOREOGRAPHY.some(option => option.id === item.danceStyleId)
    || typeof item.layoutId !== 'string' || !Object.hasOwn(DANCE_PRODUCTION_LAYOUTS, item.layoutId)) throw new DanceCreativeInputError('공연 제작 설정의 필수 항목을 확인해 주세요.');
  const layoutId = item.layoutId as keyof typeof DANCE_PRODUCTION_LAYOUTS;
  if (!(DANCE_PRODUCTION_LAYOUTS[layoutId].counts as readonly number[]).includes(seed.count)
    || (seed.locks.locationId && item.locationId !== seed.locks.locationId)
    || (seed.locks.danceStyleId && item.danceStyleId !== seed.locks.danceStyleId)
    || (seed.locks.layoutId && layoutId !== seed.locks.layoutId)) throw new DanceCreativeInputError('공연 제작 설정이 저장된 선택과 다릅니다.', 'CREATIVE_CONFLICT');
  const locationDetail = productionText(item.locationDetail, 240);
  assertDanceProductionSceneTextV3(locationDetail, true);
  if (!Array.isArray(item.wardrobes) || item.wardrobes.length !== seed.count) throw new DanceCreativeInputError('모든 출연자의 의상 설정이 필요합니다.');
  const wardrobes = item.wardrobes.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2 || raw.memberId !== seed.anchors[index].id) throw new DanceCreativeInputError('출연자 의상의 순서와 ID가 다릅니다.', 'CREATIVE_CONFLICT');
    const description = productionText(raw.description, 60);
    if (/\b(?:face|hair|eye color|skin tone|ethnicity|years old|beard|identity|gender|species|child(?:ren)?|kids?|teenagers?|boys?|girls?|wom[ae]n|m[ae]n|adult|human|robot|animal|cat|dog|penguin)\b|\b\d{2}s\b/i.test(description)) throw new DanceCreativeInputError('의상으로 저장된 얼굴·나이·머리 정체성을 바꿀 수 없습니다.', 'CREATIVE_CONFLICT');
    return { memberId: raw.memberId as string, description };
  });
  const wardrobeText = wardrobes.map(item => item.description).join(' ');
  if (seed.locks.wardrobeTerms.some(term => !new RegExp(`\\b${term}\\b`, 'i').test(wardrobeText))) throw new DanceCreativeInputError('상황 설정에서 지정한 의상·색상을 유지해 주세요.', 'CREATIVE_CONFLICT');
  for (const lock of seed.locks.wardrobeByMember || []) {
    const wardrobe = wardrobes.find(item => item.memberId === lock.memberId)!;
    if (lock.terms.some(term => !new RegExp(`\\b${term}\\b`, 'i').test(wardrobe.description))) throw new DanceCreativeInputError('각 출연자에게 지정한 의상·색상을 유지해 주세요.', 'CREATIVE_CONFLICT');
  }
  return { version: 3, locationId: item.locationId as DanceProductionManifestV3['locationId'], danceStyleId: item.danceStyleId as DanceProductionManifestV3['danceStyleId'], layoutId, locationDetail, wardrobes };
}
/** Stable identity is reconstructed from frozen fields; only wardrobe and placement can be resolved. */
export function resolveDanceProductionDirectionV3(seed: DanceProductionSeedV3, raw: unknown): DanceCreativeDirection {
  const manifest = validateDanceProductionManifestV3(raw, seed), layout = DANCE_PRODUCTION_LAYOUTS[manifest.layoutId];
  const members = seed.anchors.map((anchor, index): DanceCastMember => {
    const original = anchor.kind === 'human' ? `adult ${anchor.gender === 'unspecified' ? 'dancer' : anchor.gender} ${anchor.ageBand}, ${anchor.face?.replace('distinct original ', '')}, ${anchor.hair}`
      : anchor.kind === 'robot' ? `${anchor.surface}, ${anchor.face}` : anchor.coat;
    return { id: anchor.id, kind: anchor.kind, species: anchor.species, role: index === 0 ? 'lead' : index === 1 ? 'partner' : 'ensemble',
      position: layout.positions[index], identity: `${original}; ${manifest.wardrobes[index].description}`, movementAnatomy: anchor.movementAnatomy };
  });
  const cast = validateDanceCastContract({ version: 1, kind: seed.kind, ensemble: seed.ensemble, count: seed.count, formation: layout.formation, members });
  const axes = { castId: seed.variation.castId, appearanceId: seed.variation.appearanceId, outfitId: `performance_${hash(JSON.stringify(manifest.wardrobes)).toString(16)}`, paletteId: 'performance',
    locationId: manifest.locationId, choreographyId: manifest.danceStyleId };
  const lockedAxes: DanceCreativeDirection['lockedAxes'] = ['castId', 'visualStyle'];
  if (seed.locks.locationId) lockedAxes.push('locationId');
  if (seed.locks.danceStyleId) lockedAxes.push('choreographyId');
  const musicMatch = seed.variation.musicMatch;
  const concreteEn = `${buildDanceCastPrompt(cast)} Place (${manifest.locationId}): ${manifest.locationDetail}. Style: ${manifest.danceStyleId}, native movement. Visual: ${VISUAL[seed.locks.visualStyle]}. Difficulty: ${seed.locks.difficulty}.`;
  if (concreteEn.length > 1600) throw new DanceCreativeInputError('출연자 연출 설명이 너무 깁니다.', 'CREATIVE_VARIATION');
  return { version: 2, ...axes, cast, signature: `dance-v2-${hash(JSON.stringify({ anchors: seed.anchors, manifest, visualStyle: seed.locks.visualStyle, difficulty: seed.locks.difficulty })).toString(16).padStart(8, '0')}`,
    castLabel: `${label('performer', axes.castId)} · ${seed.count}명`, locationLabel: label('location', manifest.locationId), danceStyleLabel: label('danceStyle', manifest.danceStyleId),
    sources: seed.variation.sources, lockedAxes, concreteEn,
    ...(musicMatch ? { musicMatch: { ...musicMatch, selection: seed.locks.danceStyleId ? 'user' : musicMatch.preferredStyles.includes(manifest.danceStyleId) ? 'preferred' : 'adapted' } } : {}) };
}
