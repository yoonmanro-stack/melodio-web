/** Conservative source facts for fresh planning. Archived episodes are never reinterpreted. */
export const PET_HUMAN_ROLES: Array<{ role: string; adult: boolean; pattern: RegExp }> = [
  { role: 'husband', adult: true, pattern: /남편|신랑|\bhusbands?\b|\bgrooms?\b/giu },
  { role: 'wife', adult: true, pattern: /아내|부인|신부|\bw(?:ife|ives)\b|\bbrides?\b/giu },
  { role: 'boyfriend', adult: true, pattern: /남자\s*친구|남친|\bboyfriends?\b/giu },
  { role: 'girlfriend', adult: true, pattern: /여자\s*친구|여친|\bgirlfriends?\b/giu },
  { role: 'mother', adult: true, pattern: /엄마|어머니|\bmothers?\b|\bmoms?\b|\bmums?\b/giu },
  { role: 'father', adult: true, pattern: /아빠|아버지|\bfathers?\b|\bdads?\b/giu },
  { role: 'grandmother', adult: true, pattern: /할머니|\bgrandmothers?\b|\bgrandmas?\b/giu },
  { role: 'grandfather', adult: true, pattern: /할아버지|\bgrandfathers?\b|\bgrandpas?\b/giu },
  { role: 'woman', adult: true, pattern: /여성|여자(?!\s*친구|친)|\bwom(?:an|en)\b/giu },
  { role: 'man', adult: true, pattern: /남성|남자(?!\s*친구|친)|\bm(?:an|en)\b/giu },
  { role: 'owner', adult: true, pattern: /집사|보호자|(?:^|[^가-힣])주인(?:[은는이가을를의와과도에]|(?=$|[^가-힣]))|\bowners?\b|\bguardians?\b/giu },
  { role: 'person', adult: true, pattern: /사람|인물|어른|성인|\bpersons?\b|\bpeople\b|\bhumans?\b|\badults?\b(?!(?:\s+\w+){0,3}\s+(?:dog|cat|pet|animal)s?\b)/giu },
  // A Korean noun must end or take a particle: 딸랑이는 is a bell, not a daughter.
  { role: 'daughter', adult: false, pattern: /(?:^|[^가-힣])딸(?=$|[^가-힣]|(?:은|는|이|가|을|를|의|과|도|에게|들)(?:\s|$))|\bdaughters?\b/giu },
  { role: 'son', adult: false, pattern: /아들|\bsons?\b/giu },
  { role: 'child', adult: false, pattern: /어린이|(?:^|[^가-힣])아이(?=$|[^가-힣]|(?:는|가|를|의|와|도|에게|들)(?:\s|$))|\bchildren\b|\bchild\b|\bkids?\b/giu },
];

const COUPLE = /부부|커플|연인|신혼|\b(?:married\s+couple|couple|spouses?|romantic\s+partners?)\b/giu;
const NO_HUMANS = /(?:사람|인물|집사|주인|보호자|인간)\s*(?:이|가|은|는)?\s*(?:없(?:는|이|다|음)|등장하지\s*않|보이지\s*않)|\b(?:without|no)\s+(?:a\s+|any\s+|visible\s+)?(?:humans?|persons?|people|owners?)\b/iu;

/** Negation is local to the mentioned noun, so "not a couple; two women" keeps the women. */
export function petMentionIsNegated(value: string, start: number, length: number): boolean {
  const before = value.slice(Math.max(0, start - 40), start);
  const after = value.slice(start + length, start + length + 40);
  return /(?:\b(?:no|without|not|neither|nor)\s+(?:(?:a|an|any|the|visible|another)\s+)*)$/iu.test(before)
    || /^\s*(?:(?:이|가|은|는|도)\s*)?(?:없|없이|아닌|아니라|아니다|아님|제외|등장하지\s*않|보이지\s*않)/u.test(after)
    || /^\s*(?:(?:is|are|was|were)\s+)?(?:absent|excluded|not\s+(?:present|shown|visible))\b/iu.test(after);
}

function positiveMatches(value: string, pattern: RegExp): RegExpMatchArray[] {
  return [...value.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))]
    .filter(match => !petMentionIsNegated(value, match.index ?? 0, match[0].length));
}

function mentionCount(value: string, match: RegExpMatchArray): number {
  const start = match.index ?? 0;
  const before = value.slice(Math.max(0, start - 32), start);
  const after = value.slice(start + match[0].length, start + match[0].length + 24);
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, 한: 1, 두: 2, 세: 3, 네: 4 };
  const prefix = before.match(/(?:\b(one|two|three|four|[1-4])\s+(?:(?:distinct|adult)\s+)*|([한두세네1-4])\s*(?:명(?:의)?\s*)?(?:(?:성인|어른)\s+)?)$/iu);
  const suffix = after.match(/^\s*(?:([한두세네1-4])\s*명|([1-4])\b)/u);
  const word = (prefix?.[1] || prefix?.[2] || suffix?.[1] || suffix?.[2] || '').toLowerCase();
  return words[word] || Number(word) || (/\b(?:women|men|people|children|\w+s)\b/iu.test(match[0]) || /^\s*들/u.test(after) ? 2 : 1);
}

export function extractPetSourceCast(topic: string): {
  humans: Array<{ id: string; role: string; adult: boolean }>;
  couple: boolean;
  explicitlyNoHuman: boolean;
} {
  const text = topic.normalize('NFKC');
  let explicitlyNoHuman = NO_HUMANS.test(text);
  const couple = positiveMatches(text, COUPLE).length > 0;
  const detected = PET_HUMAN_ROLES.flatMap(({ role, adult, pattern }) => {
    const matches = positiveMatches(text, pattern);
    if (!matches.length) return [];
    const count = Math.max(...matches.map(match => mentionCount(text, match)));
    return Array.from({ length: Math.min(4, count) }, () => ({ role, adult }));
  });
  // "No owner" excludes that role; it does not erase separately supplied women/children.
  if (explicitlyNoHuman && detected.length && !/(?:사람|인물|인간)\s*(?:이|가|은|는)?\s*(?:없|등장하지\s*않|보이지\s*않)|\b(?:no|without)\s+(?:any\s+)?(?:humans?|persons?|people)\b/iu.test(text)) explicitlyNoHuman = false;
  if (explicitlyNoHuman) return { humans: [], couple: false, explicitlyNoHuman };
  let roles = detected;
  const owners = positiveMatches(text, PET_HUMAN_ROLES.find(item => item.role === 'owner')!.pattern);
  const personDescriptors = PET_HUMAN_ROLES.filter(item => item.adult && !['owner', 'person'].includes(item.role))
    .flatMap(item => positiveMatches(text, item.pattern).map(match => ({ role: item.role, start: match.index ?? 0, end: (match.index ?? 0) + match[0].length })));
  const aliasedRoles = new Set<string>();
  for (const owner of owners) {
    const start = owner.index ?? 0;
    const descriptor = personDescriptors.filter(item => item.end <= start).sort((a, b) => b.end - a.end)[0];
    if (!descriptor) continue;
    const between = text.slice(descriptor.end, start);
    const after = text.slice(start + owner[0].length, start + owner[0].length + 16);
    if (/^\s*$/u.test(between) || /^\s+(?:is|are|was|were)\s+(?:(?:a|an|the)\s+)?$/iu.test(between)
      || (/^(?:이|가|은|는)\s*$/u.test(between) && /^(?:이다|다|입니다|이며|이고|였다|였습니다)/u.test(after))) aliasedRoles.add(descriptor.role);
  }
  if (aliasedRoles.size) {
    // A clear alias establishes identity for later bare "owner" mentions too.
    // Preserve an explicitly additional owner or an owner count exceeding the aliased cast.
    const aliasCount = roles.filter(item => aliasedRoles.has(item.role)).length;
    const distinct = owners.filter(match => /\b(?:and|plus|another|other|second|different|additional)\s+(?:(?:a|an|the|distinct|adult)\s+)*$|(?:여성|남성|여자|남자|엄마|아빠|남편|아내|집사|보호자)(?:와|과)\s*$|(?:^|\s)(?:그리고|다른|별도의?)\s*$/iu.test(text.slice(Math.max(0, (match.index ?? 0) - 40), match.index)));
    const ownerCount = Math.max(0, ...owners.map(match => mentionCount(text, match)));
    const extraCount = Math.max(ownerCount - aliasCount, 0, ...distinct.map(match => mentionCount(text, match)));
    roles = [...roles.filter(item => item.role !== 'owner'), ...Array.from({ length: Math.min(4, extraCount) }, () => ({ role: 'owner', adult: true }))];
  }
  // "Adult woman" describes one person; explicit generic count can still establish a missing second adult.
  const generic = roles.filter(item => item.role === 'person');
  if (roles.some(item => item.role !== 'person')) {
    roles = roles.filter(item => item.role !== 'person');
    while (roles.filter(item => item.adult).length < generic.length) roles.push({ role: 'person', adult: true });
  }
  if (couple) {
    const partners = roles.filter(item => ['husband', 'wife', 'boyfriend', 'girlfriend'].includes(item.role));
    if (partners.length >= 2) roles = partners;
    else if (roles.filter(item => item.adult).length < 2) roles = [{ role: 'adult partner A', adult: true }, { role: 'adult partner B', adult: true }];
  }
  return { humans: roles.slice(0, 4).map((role, index) => ({ id: `H${index + 1}`, ...role })), couple, explicitlyNoHuman };
}

export function inferPetSourceHints(topic = ''): { species?: 'cat' | 'dog'; pov?: 'pet_inner_voice' | 'owner_inner_voice' } {
  const text = topic.normalize('NFKC');
  const dog = /강아지|댕댕이|댕댕|반려견|애견|멍멍이|(?:^|[^가-힣])개(?=$|[^가-힣]|[가는를의와])|\b(?:dogs?|puppy|puppies|canine|doggy)\b/giu;
  const cat = /고양이|냥이|반려묘|애묘|\b(?:cats?|kitten|kittens|feline)\b/giu;
  const mentionsDog = positiveMatches(text, dog).length > 0;
  const mentionsCat = positiveMatches(text, cat).length > 0;
  const petVoice = /(?:강아지|댕댕이|반려견|고양이|냥이|반려묘|반려동물)(?:의)?\s*(?:속마음|마음|시점|입장|관점|화자)|\b(?:dog|cat|pet|animal)(?:'s|’s)?\s+(?:(?:inner|singing)\s+)?(?:voice|thoughts?|pov|perspective|point\s+of\s+view)\b/iu.test(text);
  const ownerVoice = /(?:집사|주인|보호자)(?:의)?\s*(?:속마음|마음|시점|입장|관점|화자)|\b(?:owner|guardian)(?:'s|’s)?\s+(?:(?:inner|singing)\s+)?(?:voice|thoughts?|pov|perspective|point\s+of\s+view)\b/iu.test(text);
  return {
    ...(mentionsDog !== mentionsCat ? { species: mentionsDog ? 'dog' as const : 'cat' as const } : {}),
    ...(petVoice !== ownerVoice ? { pov: petVoice ? 'pet_inner_voice' as const : 'owner_inner_voice' as const } : {}),
  };
}
