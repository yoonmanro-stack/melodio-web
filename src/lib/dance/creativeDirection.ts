/** Shared, client-safe creative choices. Selection is planning data, never proof of generated video quality. */
export const DANCE_CREATIVE_OPTIONS = {
  performer: [{ id: 'auto', label: '매번 새 주인공' }, { id: 'woman', label: '성인 여성' }, { id: 'man', label: '성인 남성' }, { id: 'duo', label: '성인 듀오' }, { id: 'group', label: '성인 3인 그룹' }, { id: 'robot', label: '로봇 캐릭터' }, { id: 'animal', label: '동물 캐릭터' }],
  location: [{ id: 'auto', label: '매번 새 장소' }, { id: 'street', label: '거리 광장' }, { id: 'studio', label: '댄스 스튜디오' }, { id: 'rooftop', label: '도시 루프톱' }, { id: 'park', label: '공원' }, { id: 'beach', label: '해변 산책로' }, { id: 'arcade', label: '레트로 아케이드' }, { id: 'courtyard', label: '건물 안뜰' }],
  danceStyle: [{ id: 'auto', label: '음악에 맞게 새 안무' }, { id: 'bounce', label: '바운스 스텝' }, { id: 'shuffle', label: '좌우 셔플' }, { id: 'groove', label: '그루브 웨이브' }, { id: 'hand_hook', label: '손 훅 + 발 스텝' }, { id: 'disco', label: '디스코 스텝' }, { id: 'robot', label: '로봇 팝핑' }],
  visualStyle: [{ id: 'realistic', label: '실사' }, { id: 'stylized3d', label: '3D 캐릭터' }, { id: 'illustration', label: '일러스트 애니메이션' }],
  difficulty: [{ id: 'easy', label: '쉬움 · 따라 하기' }, { id: 'medium', label: '보통 · 동작 변화' }],
} as const;

export type DanceCreativePreferences = {
  performer: typeof DANCE_CREATIVE_OPTIONS.performer[number]['id'];
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
  musicMatch?: {
    profileId: string | null; rhythmPurpose: string; tempoTargetBpm: number | null;
    preferredStyles: string[]; recommendationTags: string[]; selection: 'preferred' | 'adapted' | 'user';
  };
};
export type DanceDirectionMusicSpec = { id: string; bpm: number; rhythmPurpose: string };
export class DanceCreativeInputError extends Error {
  constructor(message: string, public code: 'CREATIVE_PREFERENCES' | 'CREATIVE_CONFLICT' | 'CREATIVE_VARIATION' = 'CREATIVE_PREFERENCES') { super(message); this.name = 'DanceCreativeInputError'; }
}
const DEFAULTS: DanceCreativePreferences = { performer: 'auto', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' };
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
  return result;
}

type Choice = { id: string; en: string };
const CAST: Choice[] = [
  { id: 'woman', en: 'one original adult woman' }, { id: 'man', en: 'one original adult man' },
  { id: 'duo', en: 'two distinct original adult dancers, stable left/right positions' }, { id: 'group', en: 'three distinct original adult dancers, stable triangular formation' },
  { id: 'robot', en: 'one original articulated robot, stable joints and proportions' }, { id: 'animal', en: 'one original animal character with species-appropriate grounded movement' },
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
const HUMAN_DETAILS: Record<string, string> = { sleek: 'straight shoulder-length dark hair with a side part', rounded: 'short copper curls with a rounded fringe', angular: 'close-cropped dark hair with a sharp side part', compact: 'a silver cropped hairstyle with a neat fringe', textured: 'dark braided hair tied back away from the face', flowing: 'wavy dark hair secured in a low ponytail' };
const ROBOT_DETAILS: Record<string, string> = { sleek: 'a brushed-silver oval head and blue circular eyes', rounded: 'a round copper head and two white lens eyes', angular: 'a charcoal rectangular head and amber lens eyes', compact: 'a small ivory ceramic head and teal round eyes', textured: 'a ribbed bronze head and two green lens eyes', flowing: 'a smooth violet shell and two silver lens eyes' };
const ANIMAL_DETAILS: Record<string, string> = { sleek: 'a fox with orange fur and a white muzzle', rounded: 'a round grey cat with white front paws', angular: 'a black-and-white dog with distinct upright ears', compact: 'a small cream rabbit with short rounded ears', textured: 'a brown bear with a cream muzzle', flowing: 'a black-and-white penguin with a yellow cheek patch' };
const HUMAN_OUTFITS: Record<string, string> = { sport: 'a zip jacket, straight-leg joggers and flat trainers', retro: 'a striped track jacket, wide-leg trousers and flat sneakers', casual: 'a cotton overshirt over a plain tee, relaxed trousers and flat sneakers', minimal: 'a plain crewneck, straight-leg trousers and flat shoes', utility: 'a cropped work jacket, cargo trousers and flat trainers', festival: 'a fitted vest over a plain tee, pleated trousers and flat trainers, no dangling accessories' };
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

function musicTimingEn(match: ReturnType<typeof musicMatching>, difficulty: DanceCreativePreferences['difficulty']): string {
  if (!match.profileId && !match.rhythmPurpose && !match.tempoTargetBpm) return '';
  const target = match.tempoTargetBpm;
  const nominalBeat = target ? (60 / target).toFixed(3) : 'unknown';
  const easyFast = difficulty === 'easy' && target !== null && target >= 124;
  return `Music-to-movement recommendation: ${(match.rhythmPurpose || 'follow the selected audio groove').slice(0, 100)}. Tags: ${match.recommendationTags.join(', ') || 'whole-body groove'}. ${target ? `Recipe target ${target} BPM; nominal beat ${nominalBeat}s, not a measured downbeat.` : 'No measured tempo.'} ${easyFast ? 'Easy fast-tempo steps: use two beats per count for weight transfers.' : 'Keep steps clear at the chosen count pace.'} Keep the8-count hook. Follow audible accents and supplied approximate energy cues; no exact sync claim. Explicit styles stay valid; adapt amplitude/count pace, never ban a genre.`;
}

/** Independent salted axes; recent records contain only the owner's compact direction metadata. */
export function resolveDanceCreativeDirection(raw: DanceCreativePreferences | unknown, seed: string | number, brief = '', recent: readonly unknown[] = [], musicSpec?: DanceDirectionMusicSpec): DanceCreativeDirection {
  const prefs = validateDanceCreativePreferences(raw);
  if (typeof brief !== 'string' || brief.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(brief)) throw new DanceCreativeInputError('상황 설정은 1,000자 이내의 텍스트로 입력해 주세요.');
  const chosen = {} as Record<'performer' | 'location' | 'danceStyle', string | undefined>;
  for (const key of ['performer', 'location', 'danceStyle'] as const) {
    const requested = hint(key, brief);
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
    const cast = CAST.find(option => option.id === chosen.performer) || pick(CAST, seedText, 'cast', attempt);
    const appearance = pick(APPEARANCE, seedText, 'appearance', attempt);
    const outfit = pick(OUTFIT, seedText, 'outfit', attempt);
    const palette = pick(PALETTE, seedText, 'palette', attempt);
    const location = LOCATION.find(option => option.id === chosen.location) || pick(LOCATION, seedText, 'location', attempt);
    const choreography = CHOREOGRAPHY.find(option => option.id === chosen.danceStyle) || pick(weightedChoreography, seedText, `choreography:${music.profileId || 'unmatched'}`, attempt);
    const axes = { castId: cast.id, appearanceId: appearance.id, outfitId: outfit.id, paletteId: palette.id, locationId: location.id, choreographyId: choreography.id };
    const signature = `dance-v2-${hash([...AXES.map(key => axes[key]), prefs.visualStyle, prefs.difficulty].join('|')).toString(16).padStart(8, '0')}`;
    if (history.some(old => old.signature === signature || (AXES.every(key => typeof old[key] === 'string') && AXES.filter(key => old[key] !== axes[key]).length < 2))) continue;
    const sources = { cast: prefs.performer !== 'auto' ? 'explicit' : chosen.performer ? 'brief' : 'automatic', location: prefs.location !== 'auto' ? 'explicit' : chosen.location ? 'brief' : 'automatic', choreography: prefs.danceStyle !== 'auto' ? 'explicit' : chosen.danceStyle ? 'brief' : 'automatic' } as DanceCreativeDirection['sources'];
    const lockedAxes: DanceCreativeDirection['lockedAxes'] = [];
    if (sources.cast !== 'automatic') lockedAxes.push('castId');
    if (sources.location !== 'automatic') lockedAxes.push('locationId');
    if (sources.choreography !== 'automatic') lockedAxes.push('choreographyId');
    const base = `Explicit selected cast/place/dance style are contracts; preserve the original brief for all other requested details. ${sources.cast === 'automatic' ? 'Default cast only if brief unspecified' : 'Cast contract'}: ${cast.en}. ${sources.location === 'automatic' ? 'Default place only if brief unspecified' : 'Place contract'}: ${location.en}. ${sources.choreography === 'automatic' ? 'Default choreography only if brief unspecified' : 'Choreography contract'}: ${choreography.en}. Unspecified appearance/outfit/palette defaults: ${cast.id === 'robot' ? ROBOT_DETAILS[appearance.id] : cast.id === 'animal' ? ANIMAL_DETAILS[appearance.id] : HUMAN_DETAILS[appearance.id]}; ${cast.id === 'animal' ? `${outfit.en} expressed as a simple collar or bandana` : cast.id === 'robot' ? `${outfit.en} expressed as shell panels and a small chest detail` : HUMAN_OUTFITS[outfit.id] || outfit.en}; ${palette.en}. Visual default unless brief specifies otherwise: ${VISUAL[prefs.visualStyle]}. Difficulty: ${prefs.difficulty}; grounded feet, torso and pelvis accents with readable full-body movement.`;
    return { version: 2, ...axes, signature, castLabel: label('performer', cast.id), locationLabel: label('location', location.id), danceStyleLabel: label('danceStyle', choreography.id), sources, lockedAxes,
      musicMatch: { ...music, selection: sources.choreography !== 'automatic' ? 'user' : music.preferredStyles.includes(choreography.id) ? 'preferred' : 'adapted' },
      concreteEn: `${base}\n${musicTimingEn(music, prefs.difficulty)}`.trim() };
  }
  throw new DanceCreativeInputError('최근 연출과 다른 조합을 만들지 못했습니다. 인물·장소·안무 중 하나를 바꿔 주세요.', 'CREATIVE_VARIATION');
}
