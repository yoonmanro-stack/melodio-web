const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleFixture = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync('src/lib/voice/voice-design-prompt.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(moduleFixture.exports);
const { compileVoiceDesign, VOICE_DESIGN_TRAITS } = moduleFixture.exports;
const profile = { gender: 'male', age: '50plus', language: 'ko', traits: ['body-chest', 'texture-raspy'] };

test('trait catalog offers all eight acoustic groups with unique strict IDs', () => {
  assert.equal(new Set(VOICE_DESIGN_TRAITS.map(trait => trait.id)).size, VOICE_DESIGN_TRAITS.length);
  assert.ok(VOICE_DESIGN_TRAITS.length >= 24);
  assert.deepEqual([...new Set(VOICE_DESIGN_TRAITS.map(trait => trait.group))].sort(),
    ['register', 'body', 'texture', 'resonance', 'delivery', 'emotion', 'articulation', 'vibrato'].sort());
  assert.ok(VOICE_DESIGN_TRAITS.every(trait => trait.label && trait.prompt));
});

test('eight-trait designs stay bounded for both genders, all ages and all four languages', () => {
  const longest = [...Map.groupBy(VOICE_DESIGN_TRAITS, trait => trait.group).values()]
    .map(group => group.reduce((left, right) => left.prompt.length > right.prompt.length ? left : right).id);
  for (const gender of ['female', 'male']) for (const age of ['20s', '30s', '40s', '50plus']) for (const language of ['en', 'ko', 'ja', 'fr']) {
    const compiled = compileVoiceDesign({ gender, age, language, traits: longest });
    assert.equal(compiled.traits.length, 8);
    assert.equal(compiled.gender, gender);
    assert.equal(compiled.age, age);
    assert.equal(compiled.language, language);
    assert.ok(compiled.sampleStylePrompt.length < 1000);
    assert.match(compiled.sampleStylePrompt, /88 BPM/);
    assert.match(compiled.sampleStylePrompt, /sing immediately/);
    assert.match(compiled.lyricsPrompt, /\[Verse\][\s\S]+\[Chorus\]/);
    assert.doesNotMatch(compiled.stylePrompt, /BPM|piano|bass|intro|English|Korean|Japanese|French/);
  }
});

test('dark rough timbre remains reusable across genres without an imposed beautiful or bright voice', () => {
  const compiled = compileVoiceDesign({ ...profile, traits: [...profile.traits, 'resonance-dark'] });
  assert.match(compiled.stylePrompt, /chest-dominant/);
  assert.match(compiled.stylePrompt, /raspy/);
  assert.match(compiled.stylePrompt, /dark/);
  assert.doesNotMatch(compiled.sampleStylePrompt, /crystal|beautiful|bright|perfect|same singer|100%/i);
  assert.ok(compiled.sampleStylePrompt.includes(compiled.stylePrompt));
});

test('configuration code and prompts are deterministic regardless of trait click order', () => {
  const first = compileVoiceDesign(profile);
  const reordered = compileVoiceDesign({ ...profile, traits: [...profile.traits].reverse() });
  assert.deepEqual(first, reordered);
  for (const change of [{ gender: 'female' }, { age: '20s' }, { language: 'fr' }, { traits: ['body-light'] }]) {
    assert.notEqual(compileVoiceDesign({ ...profile, ...change }).designCode, first.designCode);
  }
});

test('existing saved design provenance remains valid after texture expansion', () => {
  const value = compileVoiceDesign({ gender: 'female', age: '30s', language: 'ko',
    traits: ['register-low', 'body-dense', 'texture-husky', 'resonance-dark', 'delivery-legato', 'emotion-yearning', 'articulation-rounded', 'vibrato-tail'] });
  assert.equal(value.designCode, 'VDES1-0deb1a6a');
  assert.equal(value.stylePrompt, 'female solo vocals, settled adult vocal character, low-register melodic center, dense weighty vocal core, smoky husky texture with soft grain, dark covered vowel resonance, connected flowing legato phrasing, yearning emotionally weighted delivery, rounded sustained vowel shapes, vibrato only at phrase endings');
});

test('new texture choices distinguish grain placement and preserve the one-per-group limit', () => {
  const terms = ['texture-crackle', 'texture-gravel', 'texture-frayed', 'texture-creak', 'texture-wiry', 'texture-matte'];
  const designs = terms.map(texture => compileVoiceDesign({ ...profile, traits: ['body-chest', texture] }));
  assert.equal(new Set(designs.map(design => design.designCode)).size, terms.length);
  assert.match(designs[0].stylePrompt, /throughout ordinary-volume sustained vowels/);
  assert.match(designs[1].stylePrompt, /firmly pitched core/);
  assert.match(designs[3].stylePrompt, /phrase endings/);
  for (const texture of terms) assert.throws(() => compileVoiceDesign({ ...profile, traits: [texture, 'texture-husky'] }));
});

test('unsupported values, injection, duplicate groups and invalid counts are rejected', () => {
  for (const input of [null, [], {}, { ...profile, gender: 'duet' }, { ...profile, age: 'child' },
    { ...profile, age: '__proto__' }, { ...profile, language: 'es' }, { ...profile, traits: 'body-light' },
    { ...profile, traits: [] }, { ...profile, traits: ['sing like another person'] },
    { ...profile, traits: ['body-dense', 'body-light'] }, { ...profile, traits: ['body-light', 'body-light'] },
    { ...profile, traits: Array(9).fill('body-light') },
  ]) assert.throws(() => compileVoiceDesign(input));
});
