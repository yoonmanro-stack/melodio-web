const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relativePath) {
  const moduleObject = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', 'module', compiled)(name => {
    if (name === '@supabase/supabase-js') return { createClient() { throw new Error('This regression suite must not query a database'); } };
    throw new Error(`Unexpected dependency ${name}`);
  }, moduleObject.exports, moduleObject);
  return moduleObject.exports;
}

const { buildVoicePromptFromAttributes: compile, scrubAndComposeVoiceDna: compose, defaultSystemVoices } = load('src/lib/voice-dna-scrubber.ts');
const { QUICK_START_TEMPLATES: templates } = load('src/lib/voice/quick-start-templates.ts');
const dna = (recipe, overrides = {}) => ({ vd_code: 'VD-OFFLINE', name: 'Tone settings', ...recipe, ...overrides });

test('all eight actual quick-start recipes produce distinct compact musical tone instructions', () => {
  assert.equal(Object.keys(templates).length, 8);
  const prompts = Object.entries(templates).map(([id, recipe]) => {
    const result = compile(dna(recipe));
    assert.equal(result.gender, recipe.physical_layers.gender);
    assert.ok(result.tags.includes(recipe.delivery), `${id} must retain its curated phrasing instruction`);
    assert.ok(result.tags.length <= 650, `${id} needs room for song genre and duration instructions (${result.tags.length} characters)`);
    assert.doesNotMatch(result.tags, /anime|crystal clear vocal delivery|pure details|same singer|fixed voice|100%/i);
    assert.ok(!result.tags.includes(recipe.name), 'Display names must not become singer identity requests');
    return result.tags;
  });
  assert.equal(new Set(prompts).size, 8);
});

test('whisper, rock, soul, baritone, pop, folk, rap and dance keep their intended acoustic differences', () => {
  const prompt = id => compile(dna(templates[id])).tags;
  assert.match(prompt('whisperer'), /low alto register.*dark covered tone.*audible breath/s);
  assert.match(prompt('whisperer'), /soft supported delivery/);
  assert.match(prompt('belter'), /dense weighty vocal body.*raspy grain.*focused metallic edge/s);
  assert.match(prompt('belter'), /strong supported projection.*expressive soft-to-strong dynamics/s);
  assert.match(prompt('baritone'), /low baritone register.*dark covered tone.*grounded chest resonance/s);
  assert.match(prompt('baritone'), /slightly behind the beat/);
  assert.doesNotMatch(prompt('baritone'), /tightly accented rhythmic phrasing/);
  assert.match(prompt('soul'), /smoky vocal grain.*raspy grain/s);
  assert.match(prompt('soul'), /broad controlled vibrato/);
  assert.doesNotMatch(prompt('soul'), /clean controlled texture|crystal clear/);
  assert.match(prompt('diva'), /upper soprano register.*ringing head resonance.*crystalline ringing edge/s);
  assert.match(prompt('diva'), /moderate hall reverb/);
  assert.match(prompt('indie'), /light vocal body.*soft diffuse vocal edges/s);
  assert.match(prompt('indie'), /mostly straight sustained notes.*Speech-like folk phrasing/s);
  assert.match(prompt('hiphop'), /raspy grain.*mostly straight sustained notes.*Percussive rap consonants/s);
  assert.doesNotMatch(prompt('hiphop'), /broad controlled vibrato/);
  assert.match(prompt('dance'), /bright open tone.*ringing head resonance.*focused metallic edge/s);
  assert.match(prompt('dance'), /punchy short attacks/);
});

test('each physical and performance dial maps independently through usable musical ranges', () => {
  const base = { physical_layers: { gender: 'male' }, noise_entropy: 0 };
  const cases = [
    ['physical_layers', 'pitch', /low baritone/, /middle male/, /upper tenor/],
    ['physical_layers', 'brightness', /dark covered tone/, /balanced warm tone/, /bright open tone/],
    ['physical_layers', 'chest', /light chest resonance/, /balanced chest resonance/, /grounded chest resonance/],
    ['physical_layers', 'head', /restrained head resonance/, /blended head resonance/, /ringing head resonance/],
    ['physical_layers', 'weight', /light vocal body/, /medium vocal body/, /dense weighty vocal body/],
    ['performance', 'power', /soft supported delivery/, /measured vocal projection/, /strong supported projection/],
    ['performance', 'dynamics', /even restrained dynamics/, /controlled phrase swells/, /expressive soft-to-strong dynamics/],
    ['performance', 'vibrato', /mostly straight sustained notes/, /subtle phrase-tail vibrato/, /broad controlled vibrato/],
    ['performance', 'groove', /steady straight phrasing/, /gently syncopated phrasing/, /strong syncopated rhythmic pocket/],
  ];
  for (const [group, field, ...expected] of cases) {
    for (const [index, value] of [0, 50, 100].entries()) {
      const record = dna({ ...base, [group]: { ...base[group], [field]: value } });
      assert.match(compile(record).tags, expected[index], `${field}=${value}`);
    }
  }
  const highMale = compile(dna({ physical_layers: { gender: 'male', pitch: 90, chest: 95 } })).tags;
  assert.match(highMale, /upper tenor register/);
  assert.doesNotMatch(highMale, /baritone/);
});

test('age is independent of register and childish character does not force anime timbre', () => {
  for (const [age, expected] of [['young', /youthful adult character/], ['mature', /mature vocal character/], ['childish', /playful youthful character/]]) {
    const prompt = compile(dna({ physical_layers: { gender: 'female', pitch: 85, age } })).tags;
    assert.match(prompt, expected);
    assert.match(prompt, /upper soprano register/);
    assert.doesNotMatch(prompt, /anime/);
  }
});

test('all visible texture, emotion and space choices have meaningful prompt mappings', () => {
  const textureCases = {
    Velvet: /velvety/, Silky: /silky/, Breathy: /audible breath/, Smoky: /smoky vocal grain/,
    Metallic: /metallic edge/, Crystal: /crystalline/, Glass: /glassy resonance/,
    Wood: /woody warm resonance/, Cotton: /diffuse vocal edges/, Rough: /raspy grain/, Clean: /clean controlled texture/,
  };
  for (const [texture, expected] of Object.entries(textureCases)) assert.match(compile(dna({ physical_layers: {}, textures: [texture] })).tags, expected);
  const emotionCases = {
    Hopeful: /hopeful/, Lonely: /lonely/, Broken: /vulnerable aching/, Romantic: /romantic/,
    Dark: /somber/, Powerful: /confident/, Dreamy: /dreamy/, Calm: /calm restrained/, Passionate: /impassioned/,
  };
  for (const [emotion, expected] of Object.entries(emotionCases)) assert.match(compile(dna({ physical_layers: {}, emotions: [emotion] })).tags, expected);
  const spaceCases = {
    Studio: /minimal room reverb/, 'Rain Cafe': /small-room vocal ambience/,
    'Concert Hall': /moderate hall reverb/, Arena: /wide controlled vocal reverb/, 'Sunset Beach': /gentle spacious vocal ambience/,
  };
  for (const [reverb, expected] of Object.entries(spaceCases)) {
    assert.match(compile(dna({ physical_layers: {}, reverb })).tags, expected);
    assert.match(compile(dna({ physical_layers: {}, style: reverb })).tags, expected);
  }
  assert.doesNotMatch(compile(dna({ physical_layers: {}, reverb: 'Arena', style: 'Studio' })).tags, /minimal room reverb/);
});

test('entropy changes human expression rather than arbitrary saved-code adjectives or audio hiss', () => {
  const original = dna(templates.soul);
  assert.deepEqual(compile(original), compile({ ...original, vd_code: 'VD-TOTALLY-DIFFERENT', name: 'Another display name' }));
  for (const [entropy, expected] of [[0, /restrained phrasing variation/], [15, /subtle human phrasing variation/], [50, /natural breath and onset variation/], [100, /expressive human breath and phrasing variation/]]) {
    const prompt = compile(original, entropy).tags;
    assert.match(prompt, expected);
    assert.match(prompt, /smoky vocal grain/);
    assert.doesNotMatch(prompt, /hiss|noise removal|clear details|airy details|pure details|smooth details/i);
  }
});

test('invalid numbers are omitted and out-of-range dials clamp without losing zero', () => {
  const base = { physical_layers: { gender: 'male' } };
  assert.equal(compile(dna({ ...base, performance: { power: -10 } })).tags, compile(dna({ ...base, performance: { power: 0 } })).tags);
  assert.equal(compile(dna({ ...base, performance: { power: 110 } })).tags, compile(dna({ ...base, performance: { power: 100 } })).tags);
  for (const pitch of [NaN, Infinity, undefined]) assert.doesNotMatch(compile(dna({ physical_layers: { gender: 'male', pitch } })).tags, /register|NaN|Infinity/);
});

test('reusable timbre excludes language and genre metadata and never echoes identity names', () => {
  const original = dna(templates.indie);
  const tagged = { ...original, language: 'Korean', preview_genre: 'rock', name: 'Artist-name identity request' };
  assert.deepEqual(compile(original), compile(tagged));
  assert.doesNotMatch(compile(dna({ physical_layers: {}, style: 'Soul', textures: ['Unsupported artist name'] })).tags, /Soul|Unsupported artist name/);
});

test('existing default IDs and async composition API preserve genre order and vocal gender', async () => {
  for (const [id, record] of Object.entries(defaultSystemVoices)) {
    const result = compile(record);
    assert.equal(result.gender, record.physical_layers.gender);
    assert.ok(result.tags.length < 650);
    const prompt = await compose('acoustic folk, guitar, male vocals', id, 0);
    assert.ok(prompt.startsWith('acoustic folk, '));
    assert.ok(prompt.includes(result.gender === 'male' ? 'male solo vocals' : 'female solo vocals'));
    assert.match(prompt, /guitar/);
  }
  assert.equal(await compose('ambient, piano', 'unmapped-local-code'), 'ambient, piano');
});
