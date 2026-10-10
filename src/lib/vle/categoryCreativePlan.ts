/** Client-safe persisted story contract. No provider, Node or server imports. */
export type CategorySceneContext = { place: string; ongoingActivity: string; immediateTrigger: string; settingEvidence: string };
export type CategoryMusicDirection = {
  genreEn: string; vocalEn: string; moodEn: string; styleEn: string;
  rationale: string; targetBpm: number; isInstrumental: boolean;
};
export type CategoryCreativePlan = {
  opening2s: { startSeconds: 0; endSeconds: 2; action: string };
  watchReason: string; development: string[]; payoff: string;
  roles: Array<{ id: string; role: string; appearance: string; count: number; visibility: 'on_screen' | 'off_screen' }>;
  /** Required for fresh plans; older persisted plans retain their original shape. */
  sceneContext?: CategorySceneContext;
  wardrobes?: Array<{ roleId: string; clothing: string; footwear: string }>;
  music?: CategoryMusicDirection;
};
export type CategoryBriefExtras = {
  creativePlan?: CategoryCreativePlan;
  isInstrumental?: boolean;
  lyricsPurpose?: 'sung' | 'story-guide';
};
export const CATEGORY_CREATIVE_PLAN_MAX_BYTES = 8 * 1024;
export class CategoryCreativePlanError extends Error {
  readonly code = 'CATEGORY_CREATIVE_PLAN';
  readonly status = 400;
  constructor() { super('저장된 기획의 행동·출연자·음악 용도를 확인해 주세요.'); this.name = 'CategoryCreativePlanError'; }
}
function invalid(): never { throw new CategoryCreativePlanError(); }
const unsafeText = /data\s*:|base64|(?:https?|javascript)\s*:\s*|[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/i;
// These checks establish readable planned action, never generated-video quality.
const physicalAction = /딛|걷|걸어|돌리|돌아|닫|열|옮|집어|잡|놓|밀|당기|들어|들고|내리|올리|가리|멈|앉|일어|누르|펴|접|뻗|건네|꺼내|넣|빼|벗|메고|씌|빗|씹|먹|마시|찍|덮|훑|응시|바라|웃|찡그|고개|눈썹|흔들|끄덕|모으|펼/;
type DataObject = Record<string, unknown>;
function object(raw: unknown, keys?: readonly string[], optional: readonly string[] = []): DataObject {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const ownKeys = Reflect.ownKeys(raw);
  if (ownKeys.length > 64 || ownKeys.some(key => typeof key !== 'string' || key.length > 80 || ['__proto__', 'prototype', 'constructor'].includes(key))) invalid();
  if (keys && (keys.some(key => !Object.hasOwn(raw, key)) || ownKeys.some(key => !keys.includes(key as string) && !optional.includes(key as string)))) invalid();
  const result: DataObject = Object.create(null);
  for (const key of ownKeys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) invalid();
    result[key] = descriptor.value;
  }
  return result;
}
function array(raw: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype || raw.length < min || raw.length > max) invalid();
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== raw.length + 1 || keys.some(key => typeof key !== 'string' || (key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(key)))) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < raw.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) invalid();
    result.push(descriptor.value);
  }
  return result;
}
function narrative(raw: unknown, max: number): string {
  if (typeof raw !== 'string' || raw.length > max || !raw.trim() || !/[가-힣]/.test(raw) || unsafeText.test(raw) || /[<>]/.test(raw)) invalid();
  return raw.trim();
}
function english(raw: unknown, max: number): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > max || unsafeText.test(raw) || !/^[ -~]+$/.test(raw) || /[<>]/.test(raw)) invalid();
  return raw.trim();
}
function audioChoice(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 300 || unsafeText.test(raw) || /[<>]/.test(raw)) invalid();
  return raw.trim();
}
export function validateCategoryMusicDirection(raw: unknown): CategoryMusicDirection {
  try {
    const music = object(raw, ['genreEn', 'vocalEn', 'moodEn', 'styleEn', 'rationale', 'targetBpm', 'isInstrumental']);
    if (!Number.isInteger(music.targetBpm) || Number(music.targetBpm) < 70 || Number(music.targetBpm) > 170 || typeof music.isInstrumental !== 'boolean') invalid();
    return { genreEn: audioChoice(music.genreEn), vocalEn: audioChoice(music.vocalEn), moodEn: audioChoice(music.moodEn),
      styleEn: english(music.styleEn, 320), rationale: narrative(music.rationale, 240), targetBpm: Number(music.targetBpm), isInstrumental: music.isInstrumental };
  } catch { return invalid(); }
}
/** An explicit vocal choice determines audio mode; no choice lets the inferred plan decide. */
export function categoryInstrumentalChoice(vocal: string | undefined): boolean | undefined {
  if (!vocal?.trim()) return undefined;
  return /^(?:instrumental(?:\s+only)?(?:\s*\(\s*(?:연주곡|보컬 없음|no vocals?|no singing)\s*\))?|연주곡|인스트루멘탈|무보컬)$/i.test(vocal.trim())
    || /\bno\s+(?:vocals?|singing)\b|보컬\s*없음|무보컬/i.test(vocal);
}
/** Independent audio overrides never reintroduce an unselected matrix genre or voice. */
export function compileCategoryMusicStyle(music: CategoryMusicDirection, overrides: { genreEn?: string; vocalEn?: string; moodEn?: string } = {}): { stylePrompt: string; isInstrumental: boolean } {
  const selected = validateCategoryMusicDirection(music);
  const isInstrumental = categoryInstrumentalChoice(overrides.vocalEn) ?? selected.isInstrumental;
  const parts = [overrides.genreEn?.trim() || selected.genreEn, overrides.moodEn?.trim() || selected.moodEn, selected.styleEn,
    `${selected.targetBpm} BPM target, not measured`, '30-second self-contained musical short, immediate hook, resolved final cadence, no abrupt cutoff'];
  parts.push(isInstrumental ? 'instrumental only, no vocals, no singing, original instrumental hook'
    : `${overrides.vocalEn?.trim() || selected.vocalEn}, clear Korean diction, vocals start immediately, final complete phrase finishes by26-27 seconds, brief instrumental ending`);
  return { stylePrompt: parts.join(', '), isInstrumental };
}
function normalizePlan(raw: unknown): CategoryCreativePlan {
  const plan = object(raw, ['opening2s', 'watchReason', 'development', 'payoff', 'roles'], ['sceneContext', 'wardrobes', 'music']);
  const opening = object(plan.opening2s, ['startSeconds', 'endSeconds', 'action']);
  if (opening.startSeconds !== 0 || opening.endSeconds !== 2) invalid();
  const action = narrative(opening.action, 180), watchReason = narrative(plan.watchReason, 180), payoff = narrative(plan.payoff, 240);
  const development = array(plan.development, 1, 2).map(value => narrative(value, 240));
  const physical = [action, ...development, payoff];
  if (physical.some(value => !physicalAction.test(value)) || new Set(physical).size !== physical.length) invalid();
  const roles = array(plan.roles, 1, 3).map(rawRole => {
    const role = object(rawRole, ['id', 'role', 'appearance', 'count', 'visibility']);
    if (typeof role.id !== 'string' || !/^R[1-3]$/.test(role.id) || !Number.isInteger(role.count) || Number(role.count) < 1 || Number(role.count) > 6
      || typeof role.visibility !== 'string' || !['on_screen', 'off_screen'].includes(role.visibility)) invalid();
    return { id: role.id, role: narrative(role.role, 80), appearance: narrative(role.appearance, 200), count: Number(role.count), visibility: role.visibility as 'on_screen' | 'off_screen' };
  });
  if (new Set(roles.map(role => role.id)).size !== roles.length || roles.reduce((total, role) => total + role.count, 0) > 6 || !roles.some(role => role.visibility === 'on_screen')) invalid();
  const result: CategoryCreativePlan = { opening2s: { startSeconds: 0, endSeconds: 2, action }, watchReason, development, payoff, roles };
  const additions = ['sceneContext', 'wardrobes', 'music'].filter(key => Object.hasOwn(plan, key));
  if (additions.length && additions.length !== 3) invalid();
  if (additions.length) {
    const context = object(plan.sceneContext, ['place', 'ongoingActivity', 'immediateTrigger', 'settingEvidence']);
    result.sceneContext = { place: narrative(context.place, 100), ongoingActivity: narrative(context.ongoingActivity, 180),
      immediateTrigger: narrative(context.immediateTrigger, 160), settingEvidence: narrative(context.settingEvidence, 240) };
    result.wardrobes = array(plan.wardrobes, roles.length, roles.length).map((rawWardrobe, index) => {
      const wardrobe = object(rawWardrobe, ['roleId', 'clothing', 'footwear']);
      if (wardrobe.roleId !== roles[index].id) invalid();
      return { roleId: roles[index].id, clothing: narrative(wardrobe.clothing, 160), footwear: narrative(wardrobe.footwear, 120) };
    });
    result.music = validateCategoryMusicDirection(plan.music);
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > CATEGORY_CREATIVE_PLAN_MAX_BYTES) invalid();
  return result;
}
/** Always returns a fresh canonical object, safe to serialize or persist. */
export function validateCategoryCreativePlan(raw: unknown): CategoryCreativePlan {
  try { return normalizePlan(raw); } catch { return invalid(); }
}
export function validateFreshCategoryCreativePlan(raw: unknown): CategoryCreativePlan & Required<Pick<CategoryCreativePlan, 'sceneContext' | 'wardrobes' | 'music'>> {
  const plan = validateCategoryCreativePlan(raw);
  if (!plan.sceneContext || !plan.wardrobes || !plan.music) invalid();
  return plan as CategoryCreativePlan & Required<Pick<CategoryCreativePlan, 'sceneContext' | 'wardrobes' | 'music'>>;
}
/** The caller validates the six legacy brief fields; this helper retains optional extras. */
export function readCategoryBriefExtras(raw: unknown): CategoryBriefExtras {
  try {
    const brief = object(raw), extras: CategoryBriefExtras = {};
    if (Object.hasOwn(brief, 'creativePlan')) extras.creativePlan = normalizePlan(brief.creativePlan);
    if (Object.hasOwn(brief, 'isInstrumental')) {
      if (typeof brief.isInstrumental !== 'boolean') invalid();
      extras.isInstrumental = brief.isInstrumental;
    }
    if (Object.hasOwn(brief, 'lyricsPurpose')) {
      if (brief.lyricsPurpose !== 'sung' && brief.lyricsPurpose !== 'story-guide') invalid();
      extras.lyricsPurpose = brief.lyricsPurpose;
    }
    if (extras.isInstrumental !== undefined && extras.lyricsPurpose !== undefined
      && extras.lyricsPurpose !== (extras.isInstrumental ? 'story-guide' : 'sung')) invalid();
    if (extras.creativePlan?.music && extras.isInstrumental !== undefined && extras.creativePlan.music.isInstrumental !== extras.isInstrumental) invalid();
    return extras;
  } catch { return invalid(); }
}
export function serializeCategoryCreativePlan(raw: unknown): string { return JSON.stringify(validateCategoryCreativePlan(raw)); }
export function serializeCategoryBriefExtras(raw: unknown): string { return JSON.stringify(readCategoryBriefExtras(raw)); }
