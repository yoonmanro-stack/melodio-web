/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '..', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), `${name}.ts`))) : require(name), mod, mod.exports);
  return mod.exports;
}
const { resolveDanceCreativeDirection: resolve, validateDanceCreativePreferences: preferences, getDanceCastContract, buildDanceCastPrompt, validateDanceCastContract, buildDanceCadenceGuide } = load('src/lib/dance/creativeDirection.ts');
const music = { id: 'house-footwork', bpm: 138, rhythmPurpose: '발 교차 체중 이동 무릎 바운스 훅'.repeat(7) };

test('explicit casts preserve exact population, species and stable identities for solo through crowd', () => {
  for (const performer of ['woman', 'man', 'robot', 'animal', 'human_animal']) {
    for (const ensemble of ['solo', 'duo', 'trio', 'crowd']) {
      if (performer === 'human_animal' && ensemble === 'solo') continue;
      for (let seed = 0; seed < 24; seed++) {
        const raw = { performer, ensemble, ...(performer === 'animal' || performer === 'human_animal' ? { species: 'penguin' } : {}) };
        const direction = resolve(raw, `cast-${seed}`, '', [], music);
        const cast = getDanceCastContract(direction);
        assert.equal(cast.ensemble, ensemble);
        assert.equal(cast.count, cast.members.length);
        assert.equal(cast.count, ensemble === 'solo' ? 1 : ensemble === 'duo' ? 2 : ensemble === 'trio' ? 3 : cast.count);
        if (ensemble === 'crowd') assert.ok(cast.count >= 4 && cast.count <= 6);
        assert.equal(new Set(cast.members.map(member => member.id)).size, cast.count);
        assert.equal(new Set(cast.members.map(member => member.identity)).size, cast.count);
        assert.equal(new Set(cast.members.map(member => member.position)).size, cast.count);
        assert.ok(cast.members.filter(member => member.kind === 'animal').every(member => member.species === 'penguin' && member.movementAnatomy === 'penguin_biped'));
        if (performer === 'woman') assert.ok(cast.members.every(member => /attractive adult woman/.test(member.identity)));
        if (performer === 'human_animal') assert.ok(cast.members.some(member => member.kind === 'human') && cast.members.some(member => member.kind === 'animal'));
        assert.match(buildDanceCastPrompt(cast), new RegExp(`exactly ${cast.count} `));
        for (const member of cast.members) assert.ok(direction.concreteEn.includes(member.id) && direction.concreteEn.includes(member.identity));
        assert.ok(direction.concreteEn.length <= 1600, `${performer}/${ensemble}/${seed}: ${direction.concreteEn.length}`);
        assert.deepEqual(resolve(raw, `cast-${seed}`, '', [], music), direction);
      }
    }
  }
});

test('automatic cast rotates kinds, populations and species while a species-only request stays animals', () => {
  const casts = Array.from({ length: 160 }, (_, seed) => getDanceCastContract(resolve({}, `auto-${seed}`)));
  assert.deepEqual(new Set(casts.map(cast => cast.kind)), new Set(['human', 'robot', 'animal', 'human_animal']));
  assert.deepEqual(new Set(casts.map(cast => cast.ensemble)), new Set(['solo', 'duo', 'trio', 'crowd']));
  assert.ok(new Set(casts.flatMap(cast => cast.members.filter(member => member.kind === 'animal').map(member => member.species))).size >= 6);
  const requested = resolve({ species: 'otter', ensemble: 'trio' }, 'otter');
  assert.equal(requested.sources.cast, 'explicit');
  assert.equal(requested.cast.kind, 'animal'); assert.equal(requested.cast.count, 3);
  assert.ok(requested.cast.members.every(member => member.species === 'otter'));
  assert.equal(resolve({ species: 'cat' }, 'mixed', '사람과 고양이가 함께 춤춘다').cast.kind, 'human_animal');
});

test('briefs preserve mixed roles and named animal counts without a conflicting solo default', () => {
  for (const [brief, kind, count, species, humanCount] of [
    ['two penguins dancing in a park', 'animal', 2, 'penguin', 0],
    ['two penguin dancers in a park', 'animal', 2, 'penguin', 0],
    ['a group of penguins dancing', 'animal', 3, 'penguin', 0],
    ['고양이 세 마리가 셔플을 춘다', 'animal', 3, 'cat', 0],
    ['one man and two dogs dance together', 'human_animal', 3, 'dog', 1],
    ['남자 한 명과 펭귄 두 마리가 함께 춤춘다', 'human_animal', 3, 'penguin', 1],
    ['three robots doing a shuffle', 'robot', 3, null, 0],
    ['여성과 남성의 듀오', 'human', 2, null, 2],
  ]) {
    const direction = resolve({}, 'brief', brief);
    assert.equal(direction.cast.kind, kind, brief); assert.equal(direction.cast.count, count, brief);
    assert.equal(direction.cast.members.filter(member => member.kind === 'human').length, humanCount, brief);
    if (species) assert.ok(direction.cast.members.filter(member => member.kind === 'animal').every(member => member.species === species), brief);
    assert.equal(direction.sources.cast, 'brief');
  }
  const severalSpecies = resolve({}, 'animals', 'one cat and two dogs dancing');
  assert.deepEqual(severalSpecies.cast.members.map(member => member.species), ['cat', 'dog', 'dog']);
});

test('negated human mentions preserve animals-only crowds, counts and direction snapshots', t => {
  const raw = { performer: 'animal', ensemble: 'crowd', species: 'penguin' };
  const baseline = resolve(raw, 'animal-only-negation', 'four penguins dance', [], music);
  for (const brief of ['펭귄4마리가 사람 없이 춤춘다', '펭귄 4마리가 사람없이 춤춘다', '펭귄4마리가 인간 없이 춤춘다', '펭귄 4마리가 인간없이 춤춘다', 'four penguins dance without people', 'four penguins dance with no humans']) {
    const direction = resolve(raw, 'animal-only-negation', brief, [], music);
    assert.deepEqual(direction, baseline, brief);
    assert.equal(direction.cast.kind, 'animal', brief); assert.equal(direction.cast.count, 4, brief);
    assert.ok(direction.cast.members.every(member => member.kind === 'animal' && member.species === 'penguin'), brief);
    assert.equal(resolve({}, 'animal-only-negation', brief).cast.kind, 'animal', brief);
    assert.equal(resolve({}, 'animal-only-negation', brief).cast.count, 4, brief);
    assert.ok(direction.concreteEn.length <= 1600, brief);
    assert.ok(Buffer.byteLength(buildDanceCastPrompt(direction.cast), 'utf8') <= 4096, brief);
  }
  const mixed = resolve({ performer: 'human_animal', ensemble: 'trio', species: 'penguin' }, 'positive-mixed', '한 명의 사람과 펭귄 두 마리가 함께 춤춘다');
  assert.equal(mixed.cast.kind, 'human_animal'); assert.equal(mixed.cast.count, 3);
  assert.equal(mixed.cast.members.filter(member => member.kind === 'human').length, 1);
  for (const [preferences, brief] of [
    [raw, '한 명의 사람과 펭귄 세 마리가 함께 춤춘다'],
    [raw, 'one human and three penguins dance'],
    [{ ...raw, ensemble: 'trio' }, '펭귄4마리가 사람 없이 춤춘다'],
    [{ ...raw, species: 'dog' }, 'four penguins dance with no humans'],
  ]) assert.throws(() => resolve(preferences, 'negative-conflict', brief), { code: 'CREATIVE_CONFLICT' });
  t.diagnostic(`animals-only snapshot: ${baseline.cast.count} penguins; cast/direction UTF8 bytes ${Buffer.byteLength(buildDanceCastPrompt(baseline.cast), 'utf8')}/${Buffer.byteLength(baseline.concreteEn, 'utf8')}`);
});

test('incompatible preferences, contradictory briefs and malformed rosters are rejected', () => {
  for (const raw of [{ performer: 'human_animal', ensemble: 'solo' }, { performer: 'duo', ensemble: 'trio' }, { performer: 'group', ensemble: 'crowd' }, { performer: 'woman', species: 'cat' }, { performer: 'robot', species: 'penguin' }]) assert.throws(() => preferences(raw), { code: 'CREATIVE_CONFLICT' });
  for (const [raw, brief] of [[{ ensemble: 'duo' }, '고양이 세 마리'], [{ species: 'dog' }, 'two cats'], [{ performer: 'animal' }, 'one man and two dogs'], [{ performer: 'man' }, '여성 솔로'], [{}, 'seven dancers'], [{}, '7명이 춤춘다']]) assert.throws(() => resolve(raw, 'bad', brief), { code: 'CREATIVE_CONFLICT' });
  const valid = resolve({ performer: 'animal', ensemble: 'duo', species: 'cat' }, 'roster').cast;
  const bad = mutate => { const value = structuredClone(valid); mutate(value); return value; };
  for (const value of [bad(cast => cast.count = 3), bad(cast => cast.members[1].id = cast.members[0].id), bad(cast => cast.members[1].position = cast.members[0].position), bad(cast => cast.members[0].movementAnatomy = 'human_biped'), bad(cast => cast.members[0].kind = 'human'), bad(cast => cast.kind = 'human_animal')]) assert.throws(() => validateDanceCastContract(value), { code: 'CREATIVE_CAST' });
});

test('old preferences and saved directions adapt deterministically without changing snapshots', () => {
  assert.equal(preferences({ performer: 'animal', location: 'park', danceStyle: 'bounce', visualStyle: 'realistic', difficulty: 'easy' }).ensemble, 'auto');
  for (const [castId, count] of [['woman', 1], ['duo', 2], ['group', 3], ['robot', 1], ['animal', 1]]) {
    const old = { version: 2, castId, appearanceId: 'flowing', paletteId: 'coral_teal', concreteEn: 'one black-and-white penguin with a yellow cheek patch' };
    const snapshot = JSON.stringify(old);
    const result = getDanceCastContract(old);
    assert.equal(result.count, count); assert.equal(JSON.stringify(old), snapshot);
    assert.deepEqual(getDanceCastContract(old), result);
    if (castId === 'animal') assert.equal(result.members[0].species, 'penguin');
  }
});

test('animal and mixed cadence uses native appendages and keeps quarter-note timing', () => {
  for (const performer of ['animal', 'human_animal']) {
    const cast = resolve({ performer, ensemble: 'duo', species: 'penguin' }, 'cadence').cast;
    const guide = buildDanceCadenceGuide(138, 15, cast);
    assert.match(guide, /0\.435s per count/); assert.match(guide, /species-native paw, hop, waddle or weight accents/);
    assert.match(guide, /animals retain their own anatomy/); assert.doesNotMatch(guide, /arm accents may span/);
    assert.match(buildDanceCastPrompt(cast), /no human hands, knees or arms/);
  }
});
