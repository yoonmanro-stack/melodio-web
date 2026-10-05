const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const cache = new Map();
function load(relativePath) {
  const filename = path.join(root, relativePath);
  if (cache.has(filename)) return cache.get(filename);
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  cache.set(filename, module.exports);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', compiled)(module, module.exports, specifier => {
    if (specifier.startsWith('@/')) return load(`src/${specifier.slice(2)}.ts`);
    throw new Error(`Unexpected runtime dependency: ${specifier}`);
  });
  return module.exports;
}

const { presets } = load('src/data/presets.ts');
const { mergePublicPresetCatalog, canonicalPresetId, findStudioPreset, getPresetCategory } = load('src/lib/preset-catalog.ts');
const { presetCatalogCategories } = load('src/data/presetCatalogCategories.ts');
const { resolvePresetApplication, resolveGeneratedPresetStyle, parsePresetLyrics } = load('src/lib/preset-application.ts');
const makePreset = (id, overrides = {}) => ({ id, name: id, desc: 'A real creative recipe', emoji: '🎵', gradient: '', selections: {}, customPrompt: 'original genre, 140 BPM, bass and drums', ...overrides });

for (const builderName of ['PresetStudioBuilder', 'PromptBuilder']) test(`${builderName} preserves full recipe, tempo and instrumental mode for either membership`, async () => {
  const source = fs.readFileSync(path.join(root, `src/components/prompt-builder/${builderName}.tsx`), 'utf8');
  const ast = ts.createSourceFile('Builder.tsx', source, ts.ScriptTarget.Latest, true);
  let handler;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handlePresetApply') handler = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(handler);
  const code = ts.transpileModule(`exports.apply = ${handler}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const isPro of [false, true]) {
    const state = {};
    const module = { exports: {} };
    const setters = ['Selections', 'StylePrompt', 'ExcludePrompt', 'SelectedPresetId', 'SelectedPresetName', 'DynamicElements', 'AmbienceVolume', 'IsAsmrEnabled', 'Title', 'YoutubeTags', 'SnsHashtags', 'IsInstrumental', 'LyricsSections'];
    const values = {
      exports: module.exports, isPro, isInstrumental: false, customPresets: [],
      publicPresetCatalog: mergePublicPresetCatalog([], presets),
      isApplyingPresetRef: { current: false }, appliedPresetPromptRef: { current: '' },
      findStudioPreset, resolvePresetApplication, parsePresetLyrics,
      composeStylePrompt: () => { throw new Error('A real preset must use its own recipe'); },
      setTimeout: () => 0, document: {},
      ...Object.fromEntries(setters.map(name => [`set${name}`, value => { state[name] = value; }])),
    };
    new Function(...Object.keys(values), code)(...Object.values(values));
    for (const id of ['developer-debugging', 'iced-oolong-tea', 'matcha-kyoto-jazz', 'deep-sleep-drift', 'highway-disco-trot']) {
      const preset = findStudioPreset(id, [], values.publicPresetCatalog);
      await module.exports.apply(preset);
      assert.equal(state.StylePrompt, preset.customPrompt);
      assert.equal(state.IsInstrumental, ['developer-debugging', 'iced-oolong-tea', 'matcha-kyoto-jazz', 'deep-sleep-drift'].includes(id));
      assert.equal(state.SelectedPresetId, id);
    }
    assert.match(state.StylePrompt, /136 BPM/);
  }
});

test('public database beats stale bundled recipes and old URLs resolve the representative', () => {
  const database = [makePreset('dead-mall-nostalgia', { isDb: true, customPrompt: 'current mall recipe' }), makePreset('uk_grime'), makePreset('grime'), makePreset('grunge_seattle'), makePreset('grunge'), makePreset('joseon-hiphop')];
  const merged = mergePublicPresetCatalog(database, presets);
  assert.equal(merged.filter(p => p.id === 'dead-mall-nostalgia').length, 1);
  assert.equal(merged.filter(p => p.id === 'uk_grime').length, 1);
  assert.ok(!merged.some(p => ['grime', 'grunge', 'joseon-hip-hop'].includes(p.id)));
  assert.equal(findStudioPreset('grime', [], merged).id, 'uk_grime');
  assert.equal(findStudioPreset('joseon-hip-hop', [], merged).id, 'joseon-hiphop');
  assert.equal(canonicalPresetId('custom-123'), 'custom-123');
});

test('a held database entry cannot resurrect from the bundled fallback', () => {
  const held = makePreset('deep-sleep-drift', { metadata: { publication_status: 'held' } });
  assert.ok(!mergePublicPresetCatalog([held], presets).some(p => p.id === held.id));
  assert.equal(mergePublicPresetCatalog([makePreset('uk_grime', { metadata: { quality_status: 'failed' } }), makePreset('grime')], []).length, 0);
});

test('new unreviewed public entries wait for publication and explicit test rows stay hidden', () => {
  assert.equal(mergePublicPresetCatalog([makePreset('new-unreviewed')], []).length, 0);
  assert.equal(mergePublicPresetCatalog([makePreset('new-reviewed', { metadata: { publication_status: 'published' } })], []).length, 1);
  assert.equal(mergePublicPresetCatalog([makePreset('new-reviewed', { metadata: { publication_status: 'published', quality_status: 'pending' } })], []).length, 0);
  assert.equal(mergePublicPresetCatalog([makePreset('uk_grime', { metadata: { is_test: true } })], []).length, 0);
});

test('personal records bypass public corrections and aliases without losing exclusions or lyrics', () => {
  const personal = makePreset('grime', {
    customPrompt: 'my original harp recipe, 63 BPM', excludePrompt: 'no autotune',
    lyricsTemplate: '[Verse]\nMy original verse\n\n[Chorus]\nMy original chorus',
  });
  const before = JSON.stringify(personal);
  const selected = findStudioPreset('grime', [personal], mergePublicPresetCatalog([makePreset('uk_grime')], []));
  assert.equal(selected, personal);
  const application = resolvePresetApplication(selected);
  assert.equal(application.stylePrompt, personal.customPrompt);
  assert.equal(application.excludePrompt, 'no autotune');
  assert.equal(application.isInstrumental, false);
  assert.deepEqual(parsePresetLyrics(application.lyricsTemplate).map(section => section.content), ['My original verse', 'My original chorus']);
  assert.equal(JSON.stringify(personal), before);
});

test('lyrics generation cannot overwrite a selected preset but can still improve a manual style', () => {
  assert.equal(resolveGeneratedPresetStyle('harp, 45 BPM', 'piano, 110 BPM', true), 'harp, 45 BPM');
  assert.equal(resolveGeneratedPresetStyle('manual', 'refined manual', false), 'refined manual');
});

test('vocal instrumental palette descriptions stay vocal while explicit instrumental flags survive', () => {
  assert.equal(resolvePresetApplication(makePreset('visual', { customPrompt: 'expressive vocals, rich instrumental palette' })).isInstrumental, false);
  assert.equal(resolvePresetApplication(makePreset('quiet', { customPrompt: 'Instrumental only, no vocals, grand piano' })).isInstrumental, true);
  assert.equal(resolvePresetApplication(makePreset('saved', { metadata: { isInstrumental: true }, customPrompt: 'my long musical recipe' })).isInstrumental, true);
  assert.equal(resolvePresetApplication(makePreset('tags', { metadata: { exclude_tags: ['choir', 'autotune'] } })).excludePrompt, 'choir, autotune');
});

test('reviewed category map covers the complete public catalog and six actual purposes', () => {
  const values = new Set(Object.values(presetCatalogCategories));
  assert.deepEqual([...values].sort(), ['cafe', 'cinematic', 'drive', 'focus', 'healing', 'retro']);
  assert.equal(Object.keys(presetCatalogCategories).length, 214); // 204 DB keys + 11 bundled keys - one overlap.
  const currentDatabaseKeys = require('./fixtures/preset-catalog-keys-20261005.json');
  assert.equal(currentDatabaseKeys.length, 204);
  for (const key of currentDatabaseKeys) assert.ok(presetCatalogCategories[key], `Missing reviewed purpose: ${key}`);
  assert.equal(getPresetCategory(makePreset('uk_grime')), 'drive');
  assert.equal(getPresetCategory(makePreset('bossa_nova')), 'cafe');
  assert.equal(getPresetCategory(makePreset('ambient_drone')), 'healing');
  assert.equal(getPresetCategory(makePreset('post_rock')), 'cinematic');
  assert.equal(getPresetCategory(makePreset('custom-99', { metadata: { category: 'dance' } })), 'drive');
});
