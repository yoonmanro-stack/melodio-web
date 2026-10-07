/* Pure response-contract tests. No environment, database, provider or media access. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/lib/lyrics/validate-song-form.ts');
const moduleProbe = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('module', 'exports', source)(moduleProbe, moduleProbe.exports);
const { validateGeneratedSongForm } = moduleProbe.exports;
const ordinary = { ordinarySong: true };
const performance = { ordinarySong: true, presetId: 'brazilian-funk-kpop-performance' };
const six = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'];
const eight = ['intro', 'verse', 'pre-chorus', 'chorus', 'verse', 'pre-chorus', 'chorus', 'outro'];
const makeSections = types => types.map((type, index) => ({
  type, content: ['intro', 'outro'].includes(type) ? '' : `My complete authored phrase ${index}\nMy next complete thought`,
  description: 'Warm melody',
}));

test('ordinary songs keep all six parts and preserve long authored lyrics verbatim', () => {
  const sections = makeSections(six);
  sections[1].content = 'My deliberately long authored verse remains complete\n'.repeat(80);
  const before = JSON.stringify(sections);
  assert.equal(validateGeneratedSongForm(sections, ordinary), true);
  assert.equal(JSON.stringify(sections), before);
  assert.equal(validateGeneratedSongForm(makeSections(six), { ...ordinary, presetId: 'uk_grime' }), true);
});

test('a lone verse, missing second verse or missing natural ending cannot pass', () => {
  const sections = makeSections(six);
  assert.equal(validateGeneratedSongForm([sections[1]], ordinary), false);
  assert.equal(validateGeneratedSongForm(sections.filter((_, index) => index !== 3), ordinary), false);
  assert.equal(validateGeneratedSongForm(sections.slice(0, -1), ordinary), false);
});

test('extra ending cycles and misplaced parts cannot silently expand the requested song', () => {
  const sections = makeSections(six);
  assert.equal(validateGeneratedSongForm([...sections, sections[4], sections[5]], ordinary), false);
  assert.equal(validateGeneratedSongForm(makeSections(['intro', 'chorus', 'verse', 'verse', 'chorus', 'outro']), ordinary), false);
  assert.equal(validateGeneratedSongForm(makeSections(eight), ordinary), false);
});

test('performance songs require their existing eight parts without adding a bridge', () => {
  assert.equal(validateGeneratedSongForm(makeSections(eight), performance), true);
  assert.equal(validateGeneratedSongForm(makeSections(six), performance), false);
  assert.equal(validateGeneratedSongForm(makeSections([...eight.slice(0, -1), 'bridge', 'outro']), performance), false);
  const emptyLift = makeSections(eight);
  emptyLift[2].content = '  \n';
  assert.equal(validateGeneratedSongForm(emptyLift, performance), false);
});

test('empty sung development and malformed section data are rejected without mutation', () => {
  for (const index of [1, 2, 3, 4]) {
    const sections = makeSections(six);
    sections[index].content = '\n  ';
    assert.equal(validateGeneratedSongForm(sections, ordinary), false);
  }
  for (const sections of [null, {}, [], makeSections(six).map((section, index) => index === 2 ? null : section)]) {
    assert.equal(validateGeneratedSongForm(sections, ordinary), false);
  }
});

test('dedicated short and viral structure contracts bypass the ordinary form guard', () => {
  const short = makeSections(['intro', 'chorus', 'outro']);
  assert.equal(validateGeneratedSongForm(short, { ordinarySong: false }), true);
  assert.equal(validateGeneratedSongForm(short, { ordinarySong: false, presetId: performance.presetId }), true);
});
