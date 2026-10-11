/** Offline guards for fresh drafts, not an evaluation of generated film quality. */
import type { PetStoryFingerprint } from './petEpisode';

type Family = { key: string; pattern: RegExp };
const PROPS: Family[] = [
  { key: 'computer', pattern: /\b(?:keyboard|keypad|laptop|computer|workstation|notebook\s+computer)\b|키보드|노트북|컴퓨터/iu },
  { key: 'leash', pattern: /\b(?:leash|lead|harness)\b|목줄|리드줄|하네스/iu },
  { key: 'door', pattern: /\b(?:door|doorway|threshold|entrance)\b|현관|문턱|출입문|(?:^|[^가-힣])문(?:이|을|은|(?=$|[^가-힣]))/iu },
  { key: 'rain', pattern: /\b(?:rain|rainy|raining|downpour|wet\s+(?:weather|outside))\b|비가|비를|빗|장마/iu },
  { key: 'sofa', pattern: /\b(?:sofa|couch|settee)\b|소파|쇼파/iu },
  { key: 'bed', pattern: /\b(?:bed|pet\s*bed|mattress)\b|침대/iu },
  { key: 'cushion', pattern: /\b(?:cushion|pillow|bolster)\b|방석|쿠션|베개/iu },
  { key: 'ball', pattern: /\b(?:ball|tennis\s+ball)\b|(?:^|[^가-힣])공(?:이|을|은|(?=$|[^가-힣]))/iu },
  { key: 'cup', pattern: /\b(?:cup|mug|tumbler)\b|컵|머그/iu },
  { key: 'bowl', pattern: /\b(?:bowl|water\s+dish|food\s+dish)\b|그릇|물그릇|밥그릇/iu },
  { key: 'water', pattern: /\bwater\b|(?:^|[^가-힣])물(?:이|을|은|(?=$|[^가-힣]))/iu },
  { key: 'photo', pattern: /\b(?:photo|photograph|selfie|camera\s+timer)\b|사진|셀카/iu },
  { key: 'blanket', pattern: /\b(?:blanket|duvet|quilt)\b|이불|담요/iu },
  { key: 'chest', pattern: /\bchest\b|가슴/iu },
  { key: 'bell', pattern: /\b(?:bell|jingle)\b|방울|딸랑/iu },
  { key: 'food', pattern: /\b(?:food|kibble|meal|feed)\b|사료|먹이|밥/iu },
  { key: 'treat', pattern: /\b(?:treat|snack|biscuit)\b|간식/iu },
  { key: 'shoe', pattern: /\b(?:shoe|slipper|sneaker|boot)\b|신발|슬리퍼|운동화/iu },
  { key: 'paper', pattern: /\b(?:paper|newspaper|document|book|notebook)\b|종이|신문|서류|책/iu },
  { key: 'window', pattern: /\b(?:window|windowsill)\b|창가|창문/iu },
  { key: 'toy', pattern: /\b(?:toy|plush|stuffed\s+animal)\b|장난감|인형/iu },
  { key: 'flower', pattern: /\b(?:flower|bouquet|rose)\b|꽃|꽃다발/iu },
];

const ACTIONS: Family[] = [
  { key: 'pick_up', pattern: /\b(?:pick(?:s|ed|ing)?\s+up|grip(?:s|ped|ping)?|grab(?:s|bed|bing)?|take(?:s)?\s+(?:the\s+)?[^.;]{0,24}\bin\s+(?:its|the)\s+mouth)\b|집어|물고|문다|문채|물어/iu },
  { key: 'carry', pattern: /\b(?:carr(?:y|ies|ied|ying)|bring(?:s|ing)?|brought|deliver(?:s|ed|ing)?|fetch(?:es|ed|ing)?)\b|가져|가져다|물고\s*(?:가|간|달|옮)|옮겨|운반/iu },
  { key: 'push', pattern: /\b(?:push(?:es|ed|ing)?|shov(?:e|es|ed|ing)|knock(?:s|ed|ing)?\s+(?:the\s+)?[^.;]{0,24}(?:off|over)|bat(?:s|ted|ting)?)\b|밀어|(?<!내)민다|밀고|떨어뜨/iu },
  { key: 'nudge', pattern: /\b(?:nudg(?:e|es|ed|ing)|nose(?:s|d)?|poke(?:s|d|ing)?|tap(?:s|ped|ping)?|touch(?:es|ed|ing)?)\b|툭|건드|콕|비비|깨운/iu },
  { key: 'hide', pattern: /\b(?:hid(?:e|es|den|ing)|stash(?:es|ed|ing)?|conceal(?:s|ed|ing)?)\b|숨기|숨긴|숨겨|감춘|감추/iu },
  { key: 'give', pattern: /\b(?:giv(?:e|es|ing)|gave|hand(?:s|ed|ing)?\s+(?:back|over)|return(?:s|ed|ing)?\s+(?:the\s+)?(?:leash|ball|toy|cup|shoe)|press(?:es)?[^.;]{0,40}\binto[^.;]{0,24}\bhand|release(?:s|d|ing)?)\b|돌려주|건네|반납/iu },
  { key: 'place', pattern: /\b(?:plac(?:e|es|ed|ing)|(?:put(?:s|ting)?|set(?:s|ting)?|lay(?:s|ing)?)\s+(?:the\s+)?[^.;]{0,24}\bdown)\b|내려놓|놓아|놓고|놓는다/iu },
  { key: 'drop', pattern: /\b(?:drop(?:s|ped|ping)?|fall(?:s|ing)?|fell|land(?:s|ed|ing)?)\b|떨어|떨군|착지/iu },
  { key: 'open', pattern: /\bopen(?:s|ed|ing)?\b|열어|열린|열리|연다/iu },
  { key: 'close', pattern: /\bclos(?:e|es|ed|ing)\b|닫|감는다|감고/iu },
  { key: 'fill', pattern: /\b(?:fill(?:s|ed|ing)?|refill(?:s|ed|ing)?|pour(?:s|ed|ing)?)\b|채우|채운|따라|부어/iu },
  { key: 'drink', pattern: /\b(?:drink(?:s|ing)?|drank|lap(?:s|ped|ping)?|sip(?:s|ped|ping)?)\b|마시|마신|핥/iu },
  { key: 'eat', pattern: /\b(?:eat(?:s|ing)?|ate|chew(?:s|ed|ing)?)\b|먹는|먹고|먹어|먹으|씹/iu },
  { key: 'wake', pattern: /\b(?:wake(?:s)?|waking|woke|awaken(?:s|ed|ing)?)\b|깨어|깬다|깨어난|일어난|일어나|눈이\s*번쩍/iu },
  { key: 'run', pattern: /\b(?:run(?:s|ning)?|ran|rac(?:e|es|ed|ing)|sprint(?:s|ed|ing)?|zoom(?:s|ed|ing)?)\b|달려|달리|질주|뛰어다/iu },
  { key: 'jump', pattern: /\b(?:jump(?:s|ed|ing)?|leap(?:s|ed|ing)?|spring(?:s|ing)?|sprang)\b|점프|뛰어오|뛰어내/iu },
  { key: 'retreat', pattern: /\b(?:retreat(?:s|ed|ing)?|back(?:s|ed|ing)?\s+away|step(?:s|ped|ping)?\s+backward|withdraw(?:s|ing)?)\b|후퇴|뒷걸음|물러/iu },
  { key: 'approach', pattern: /\b(?:approach(?:es|ed|ing)?|walk(?:s|ed|ing)?|move(?:s|d|ing)?|go(?:es|ing)?|went|return(?:s|ed|ing)?\s+to|enter(?:s|ed|ing)?|squeez(?:e|es|ed|ing))\b|다가|걸어|걷|들어|비집|돌아간|(?<!달려)간다|가다가/iu },
  { key: 'settle', pattern: /\b(?:settl(?:e|es|ed|ing)|sit(?:s|ting)?|sat|lie(?:s)?|lying|lay|loaf(?:s|ed|ing)?|curl(?:s|ed|ing)?)\b|앉|누워|누운|자리\s*잡|식빵|웅크/iu },
  { key: 'sleep', pattern: /\b(?:sleep(?:s|ing)?|asleep|doz(?:e|es|ed|ing)|nap(?:s|ped|ping)?)\b|잠든|잠들|자는|자고|잔(?:다|척)/iu },
  { key: 'rest', pattern: /\b(?:rest(?:s|ed|ing)?|relax(?:es|ed|ing)?)\b|쉰다|쉬고|쉬는|쉬다/iu },
  { key: 'look', pattern: /\b(?:look(?:s|ed|ing)?|gaze(?:s|d|ing)?|star(?:e|es|ed|ing)|watch(?:es|ed|ing)?|eye\s+contact)\b|바라|응시|눈\s*마주|눈을\s*맞|비를\s*보/iu },
  { key: 'smile', pattern: /\b(?:smil(?:e|es|ed|ing)|laugh(?:s|ed|ing)?|grin(?:s|ned|ning)?)\b|웃|미소/iu },
  { key: 'react', pattern: /\b(?:react(?:s|ed|ing)?|flinch(?:es|ed|ing)?|startl(?:e|es|ed|ing)|blink(?:s|ed|ing)?|tilt(?:s|ed|ing)?|yawn(?:s|ed|ing)?)\b|놀라|깜짝|갸웃|깜빡|하품/iu },
  { key: 'check', pattern: /\b(?:check(?:s|ed|ing)?|inspect(?:s|ed|ing)?|discover(?:s|ed|ing)?|reveal(?:s|ed|ing)?)\b|확인|살피|발견|드러/iu },
  { key: 'sniff', pattern: /\b(?:sniff(?:s|ed|ing)?|smell(?:s|ed|ing)?)\b|냄새|킁킁/iu },
  { key: 'listen', pattern: /\b(?:listen(?:s|ed|ing)?|hear(?:s|ing)?|heard)\b|듣|귀를/iu },
  { key: 'photo', pattern: /\b(?:tak(?:e|es|ing)\s+(?:a\s+|the\s+|family\s+)*(?:photo|picture)|photograph(?:s|ed|ing)?|pos(?:e|es|ed|ing)|prepar(?:e|es|ed|ing)[^.;]{0,24}\bphoto)\b|사진을\s*찍|촬영|셀카/iu },
  { key: 'work', pattern: /\b(?:typ(?:e|es|ed|ing)|work(?:s|ed|ing)?|writ(?:e|es|ing))\b|타이핑|일하|작업|입력/iu },
  { key: 'sound', pattern: /\b(?:ring(?:s|ing)?|jingle(?:s|d|ing)?|bark(?:s|ed|ing)?|meow(?:s|ed|ing)?)\b|딸랑|짖|울린|운다|야옹/iu },
  { key: 'perform', pattern: /\b(?:wag(?:s|ged|ging)?|knead(?:s|ed|ing)?|pounce(?:s|d|ing)?|stretch(?:es|ed|ing)?|roll(?:s|ed|ing)?|shak(?:e|es|ing)|scratch(?:es|ed|ing)?|dig(?:s|ging)?|chas(?:e|es|ed|ing))\b|꼬리(?:를)?\s*흔|꾹꾹|기지개|구른|굴러|긁|쫓/iu },
];

const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[_-]/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const compactKey = (value: string) => normalized(value).replace(/\s/g, '');
const families = (value: string, list: Family[]) => list.filter(item => item.pattern.test(value.normalize('NFKC'))).map(item => item.key);

export function canonicalPetProp(value: string): string {
  const matches = families(normalized(value), PROPS);
  // A saved fingerprint can be descriptive prose. Prefer its recognized tangible prop.
  return matches.find(key => !['rain', 'water'].includes(key)) || matches[0] || compactKey(value);
}

export function canonicalPetConflict(value: string, prop = ''): string {
  const text = normalized(value);
  if (canonicalPetProp(prop) === 'computer' && /occup|block|interrupt|takeover|take over|obstruct|work|typing|방해|점령|가로막/.test(text)) return 'computer_access_interruption';
  if (/rain|wet|비|빗/.test(text) && /walk|cancel|refus|retreat|산책|취소|거부|후퇴/.test(text)) return 'rain_cancels_walk';
  if (/night|midnight|3 am|zoom|새벽|야간/.test(text) && /run|rac|zoom|wake|sleep|질주|잠|깨/.test(text)) return 'nighttime_disturbance';
  if (/photo|portrait|selfie|사진|셀카/.test(text) && /block|interrupt|squeez|intrud|join|방해|끼|비집/.test(text)) return 'photo_intrusion';
  if (/hid|stash|conceal|숨|감추/.test(text)) return 'object_concealment';
  if (/empty|refill|thirst|물|비어/.test(text) && /water|bowl|dish|물|그릇/.test(text)) return 'empty_water_bowl';
  return compactKey(value);
}

export function petFingerprintPair(value: PetStoryFingerprint): string {
  return `${canonicalPetProp(value.prop)}:${canonicalPetConflict(value.conflict, value.prop)}`;
}

type Event = { kind: string; actor?: 'pet' | 'human'; props: string[]; object?: string };

function actionObject(value: string, position: number, kind: string): string | undefined {
  if (!['pick_up', 'carry', 'push', 'nudge', 'hide', 'give', 'place', 'drop', 'open', 'close', 'fill', 'drink', 'eat', 'check', 'photo', 'work'].includes(kind)) return undefined;
  const nouns = PROPS.flatMap(({ key, pattern }) => {
    if (kind === 'drink' && !['bowl', 'water'].includes(key)) return [];
    if (kind === 'photo' && key !== 'photo') return [];
    if (kind === 'work' && !['computer', 'paper'].includes(key)) return [];
    const matches = [...value.matchAll(new RegExp(pattern.source, 'giu'))];
    return matches.map(match => ({ key, index: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
  });
  const koreanObject = nouns.filter(noun => noun.index < position && /^(?:을|를)(?:\s|$)/u.test(value.slice(noun.end)))
    .sort((a, b) => b.index - a.index)[0];
  if (koreanObject) return koreanObject.key;
  const englishObject = nouns.filter(noun => noun.index >= position
    && (['drink', 'photo', 'work'].includes(kind) || !/\b(?:on|at|beside|toward|towards|to|with|under|onto|from|in|beneath|behind)\s+(?:\w+\s+){0,3}$/iu.test(value.slice(position, noun.index))))
    .sort((a, b) => a.index - b.index)[0];
  return englishObject?.key;
}
function actorBefore(value: string, position: number): Event['actor'] {
  const before = value.slice(0, position);
  const actors = [...before.matchAll(/\b(?:dog|cat|pet|animal|human|owner|guardian|husband|wife|partner|woman|man|person|H[1-4])\b|(?:강아지|고양이|반려견|반려묘|반려동물|집사|주인|보호자|남편|아내|부부|여성|남성|여자|남자)(?:이|가|은|는)(?=\s|$)/giu)]
    .filter(match => !/\b(?:beside|with|toward|towards|onto|under|of|from|behind|between|on|at)\s+(?:\w+\s+){0,3}$/iu.test(before.slice(Math.max(0, (match.index ?? 0) - 35), match.index)));
  if (!actors.length) return undefined;
  const noun = actors[actors.length - 1][0];
  return /dog|cat|pet|animal|강아지|고양이|반려견|반려묘|반려동물/iu.test(noun) ? 'pet' : 'human';
}

function eventFacts(value: string): Event[] {
  const clauses = value.normalize('NFKC').split(/[.!?;]|\b(?:while|whereas|but|then)\b|하지만|그리고/iu);
  return clauses.flatMap(clause => ACTIONS.flatMap(({ key, pattern }) => [...clause.matchAll(new RegExp(pattern.source, 'giu'))].flatMap(action => {
    const position = action.index ?? 0;
    const before = clause.slice(Math.max(0, position - 25), position);
    const after = clause.slice(position + action[0].length, position + action[0].length + 25);
    const requestContext = clause.slice(Math.max(0, position - 100), position);
    // A quoted imperative or explicit request is not proof that its requested action occurred.
    // Inspect each occurrence so a later performed action in the same clause is still checked.
    if (/^(?:오|다주|으|달|어달|아달|해달|가|주)?(?:라며|라고|라는|도록)/u.test(after)
      || /\b(?:asks?|tells?|requests?|orders?|instructs?)\b[^.!?;]{0,70}\bto\s+(?:(?:please|now|just|gently|quickly|quietly|immediately)\s+){0,2}$/iu.test(requestContext)) return [];
    if (['open', 'close'].includes(key) && /^(?:open|closed)$/iu.test(action[0])
      && /\b(?:at|to|from|beside|near|toward|towards|behind|through|with|on)\s+(?:\w+\s+){0,3}$/iu.test(before)
      && /^\s+(?:(?:front|back|small|large)\s+)?(?:door|window|gate)\b/iu.test(after)) return [];
    if (/\b(?:no|not|never|without|doesn['’]?t|cannot|can['’]?t)\s*(?:\w+\s+){0,2}$/iu.test(before)
      || /^\s*(?:지\s*않|지\s*못)/u.test(after)) return [];
    return [{ kind: key, actor: actorBefore(clause, position), props: families(clause, PROPS), object: actionObject(clause, position, key) }];
  })));
}

function eventMatches(source: Event, action: Event): boolean {
  const compatibleMovement = source.kind === 'approach' && ['settle', 'carry', 'run', 'jump'].includes(action.kind);
  const props = source.props.filter(prop => (prop !== 'photo' || source.kind === 'photo' || source.object === 'photo')
    && (!['drink', 'eat', 'work', 'photo', 'smile', 'react', 'nudge', 'fill'].includes(source.kind) || !['bed', 'sofa', 'blanket', 'cushion', 'window'].includes(prop)));
  return (source.kind === action.kind || compatibleMovement) && (!source.actor || !action.actor || source.actor === action.actor)
    && (!source.object || (action.object ? source.object === action.object : action.props.includes(source.object)))
    && (!props.length || props.some(prop => action.props.includes(prop)));
}

/** Check supported bilingual action families in scene actions; synopsis/caption/camera cannot supply missing events. */
export function validatePetSourceEvents(source: { sourceTopic: string; coreAction: string; reversal: string; payoff: string }, actions: string[]): string[] {
  if (!source.sourceTopic.trim()) return [];
  const sceneEvents = actions.map(eventFacts);
  const requirements = [
    { value: source.coreAction, label: '핵심 행동' },
    { value: source.reversal, label: '반전' },
    { value: source.payoff, label: '결말' },
  ];
  const issues: string[] = [];
  for (const { value, label } of requirements) {
    if (value.startsWith('Not separately stated')) continue;
    const events = eventFacts(value);
    // Actor/prop context and static states support an event; they do not substitute for its principal actions.
    const active = events.filter(event => !['sleep', 'rest', 'look', 'settle', 'check', 'react'].includes(event.kind));
    const required = active.length ? active : events;
    if (required.some(event => !sceneEvents.some(scene => scene.some(action => eventMatches(event, action))))) {
      issues.push(`입력 원문의 ${label}이 실제 장면 행동에서 빠지거나 행동 주체가 바뀌었습니다.`);
    }
  }
  return issues;
}

function actionSignature(value: string): string {
  const events = eventFacts(value);
  return [...new Set(events.map(event => `${event.kind}:${event.props.filter(prop => !['water', 'rain'].includes(prop)).sort().join(',')}`))].sort().join('|');
}

/** High-confidence duplicate/static/biomechanical guards; normal reactions and result cuts remain author choices. */
export function validatePetSceneProgression(actions: string[]): string[] {
  const issues: string[] = [];
  const exact = actions.map(normalized);
  for (let index = 1; index < actions.length; index++) {
    if (exact[index] && exact[index] === exact[index - 1]) issues.push(`장면 ${index}과 ${index + 1}의 행동이 같은 장면을 반복합니다.`);
  }
  const events = actions.map(eventFacts);
  const advancing = events.flat().filter(event => !['look', 'sleep', 'rest', 'settle', 'check'].includes(event.kind));
  if (!advancing.length && events.every(scene => scene.length > 0)) issues.push('여섯 장면에 사건을 진행시키는 실제 행동이나 변화가 없습니다.');
  const signatures = actions.map(actionSignature).filter(Boolean);
  if (signatures.length >= 4 && new Set(signatures).size === 1) issues.push('표현만 달라진 같은 행동으로 여섯 장면을 반복할 수 없습니다.');
  const ending = actions.slice(-2).map(actionSignature);
  if (ending.length === 2 && ending[0] && ending[0] === ending[1]) issues.push('마지막 두 장면이 같은 행동과 결말을 표현만 바꾸어 반복합니다.');
  for (let index = 0; index < actions.length; index++) {
    // These are explicit human-like animal operations, not generic natural contact or support movement.
    if (/\b(?:dog|cat|pet|animal)\b[^.;]{0,100}\b(?:with\s+(?:its\s+)?(?:human\s+)?hands?|using\s+(?:its\s+)?(?:fingers?|thumbs?)|(?:types?|typing)\s+(?:a\s+)?(?:sentence|message)|(?:ties?|tying)\s+(?:a\s+)?(?:knot|shoelace)|(?:uses?|using|holds?|holding|operates?|operating)\s+(?:a\s+|the\s+)?(?:knife|scissors|pen|screwdriver))\b|(?:강아지|고양이|반려견|반려묘)[^.;]{0,60}(?:손가락|엄지|칼을|가위로|펜으로)/iu.test(actions[index])) {
      issues.push(`장면 ${index + 1}의 동물 행동이 자연스러운 신체 능력을 벗어납니다.`);
    }
  }
  return [...new Set(issues)];
}

function semanticEvents(value: string): Set<string> {
  return new Set(eventFacts(value).filter(event => !['look', 'check'].includes(event.kind))
    .map(event => `${event.actor || 'unspecified'}:${event.kind}:${event.props.filter(prop => !['rain', 'water'].includes(prop)).sort().join(',')}`));
}

/** Compact scene-derived cause/consequence history; labels cannot rename these visible events away. */
export function petActionSummary(actions: string[]): string {
  const verbs: Record<string, string> = { pick_up: 'pick up' };
  const facts = actions.flatMap(eventFacts).map(event => `${event.actor || 'actor'} ${verbs[event.kind] || event.kind} ${event.props.join(' ')}`.trim());
  return [...new Set(facts)].join('; ').slice(0, 1000);
}

export function petStoriesRepeat(candidate: PetStoryFingerprint, previous: PetStoryFingerprint): boolean {
  if (petFingerprintPair(candidate) === petFingerprintPair(previous)) return true;
  if (!candidate.action || !candidate.payoff || !previous.action || !previous.payoff) return false;
  const actionA = semanticEvents(candidate.action), actionB = semanticEvents(previous.action);
  const payoffA = semanticEvents(candidate.payoff), payoffB = semanticEvents(previous.payoff);
  const same = (a: Set<string>, b: Set<string>) => a.size > 0 && a.size === b.size && [...a].every(item => b.has(item));
  // Both cause and visible consequence must match; sharing a prop, broad gesture or twist alone is allowed.
  return same(actionA, actionB) && same(payoffA, payoffB);
}
