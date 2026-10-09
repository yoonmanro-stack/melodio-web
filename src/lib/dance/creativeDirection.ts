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
export class DanceCreativeInputError extends Error {
  constructor(message: string, public code: 'CREATIVE_PREFERENCES' | 'CREATIVE_CONFLICT' | 'CREATIVE_VARIATION' = 'CREATIVE_PREFERENCES') { super(message); this.name = 'DanceCreativeInputError'; }
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
  // "penguin dancers" describes animals; an unqualified "two dancers and a penguin" includes humans.
  const withoutAnimalDancers = foundSpecies.reduce((value, species) => value.replace(new RegExp(`(?:${SPECIES_HINTS[species]})\\s+dancers?\\b`, 'gi'), species), brief).replace(/animals?\s+dancers?\b/gi, 'animals');
  const hasHuman = new RegExp(HUMAN_PATTERN, 'i').test(withoutAnimalDancers);
  result.humanCount = namedCount(brief, HUMAN_PATTERN);
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
