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
  if (filename.endsWith('.json')) return JSON.parse(source);
  const module = { exports: {} };
  cache.set(filename, module.exports);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('module', 'exports', 'require', compiled)(module, module.exports, specifier => {
    if (specifier.startsWith('@/')) return load(`src/${specifier.slice(2)}.ts`);
    if (specifier.endsWith('.json') && specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)));
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
  const code = ts.transpileModule(`exports.apply = ${handler}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
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

test('future database edits survive the complete historical-correction and reviewed-profile path', () => {
  const profiles = JSON.parse(fs.readFileSync(path.join(root, 'worker/preset-studio-profiles.json'), 'utf8'));
  const corrected = Object.entries(profiles).filter(([, profile]) => profile.catalogSourceRecipe);
  assert.equal(corrected.length, 12);
  for (const [id] of corrected) {
    const edited = makePreset(id, { isDb: true, customPrompt: 'future revised genre, 112 BPM, my chosen raspy voice', instrumentalOnly: false });
    const selected = mergePublicPresetCatalog([edited], []).find(p => p.id === id);
    assert.equal(selected.customPrompt, edited.customPrompt, id);
    assert.equal(selected.instrumentalOnly, false, id);
  }
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

test('the 21 reviewed vocal recipes remain vocal when their descriptions discuss performance', () => {
  const cases = [
    ['uk_jazz_modern', '재즈의 즉흥 연주와 과감하게 하이브리드했습니다.'],
    ['symphonic_power_metal', '헤비메탈의 폭발적인 연주 속도에 클래식을 더합니다.'],
    ['shoegaze', '연주자들이 무대 위에서 이펙터 페달을 바라봅니다.'],
    ['screamo_skramz', '변칙적으로 폭발하는 드럼 연주 위에 가창합니다.'],
    ['psychedelic_rock', '연주음을 퍼즈와 와와로 왜곡합니다.'],
    ['progressive_rock', '재즈의 즉흥 연주와 우주적 세계관을 수용합니다.'],
    ['mathcore', '예측 불가능한 박자로 몰아치는 드럼 연주가 핵심입니다.'],
    ['math_rock_midwest_emo', '기타 줄을 양손으로 눌러 건반처럼 연주합니다.'],
    ['math_rock', '변박자와 폴리리듬을 정교한 연주력으로 풀어냅니다.'],
    ['korean_ballad', '아쿠스틱 그랜드 피아노 연주로 서정적인 시작을 알립니다.'],
    ['hardcore_punk', '정교한 연주 테크닉을 배제한 채 거친 에너지를 냅니다.'],
    ['glam_metal', '초고난도 전자기타 속주 솔로 연주가 등장합니다.'],
    ['future_bass', '사람 목소리를 잘라 악기처럼 연주하는 보컬 찹을 더합니다.'],
    ['folktronica', '자연주의적인 포크의 아날로그 악기와 전자음을 결합합니다.'],
    ['flamenco', '관객과 연주자가 정교하게 쪼개는 손뼉 소리가 결합합니다.'],
    ['dance_punk', '펑키한 베이스 기타 연주와 냉소적 가창을 앞세웁니다.'],
    ['bossa_nova', '드럼 브러시 연주와 나직이 속삭이는 가창이 조화를 이룹니다.'],
    ['bluegrass', '통기타의 초고속 속주 연주가 축제의 에너지를 만듭니다.'],
    ['blackgaze', '아름답고 슬픈 멜로디를 연주하며 비명과 목소리가 교차합니다.'],
    ['atmospheric_black_metal', '블래스트 비트 드럼 연주 뒤로 스산한 선율이 흐릅니다.'],
    ['afro_cuban_jazz', '재즈의 복잡한 화성학과 즉흥 연주 기술을 결합합니다.'],
  ];
  for (const [id, desc] of cases) {
    const recipe = 'Selected genre with expressive vocals, distinctive instruments and rhythm';
    const application = resolvePresetApplication(makePreset(id, { desc, customPrompt: recipe }));
    assert.equal(application.isInstrumental, false, id);
    assert.equal(application.stylePrompt, recipe, id);
  }
});

test('explicit modes and no-vocal constraints win while bare performance words never set mode', () => {
  assert.equal(resolvePresetApplication(makePreset('selected-vocal', {
    instrumentalOnly: false, name: '기타 연주곡', customPrompt: 'Instrumental only, no vocals',
  })).isInstrumental, false);
  assert.equal(resolvePresetApplication(makePreset('selected-instrumental', {
    metadata: { instrumentalOnly: true }, customPrompt: 'expressive vocals',
  })).isInstrumental, true);
  assert.equal(resolvePresetApplication(makePreset('wordless', {
    customPrompt: 'no lead vocals, ambient vocal textures',
  })).isInstrumental, true);
  assert.equal(resolvePresetApplication(makePreset('performance', {
    desc: '기타 연주와 연주자의 자연주의적 해석', customPrompt: 'Warm acoustic guitar',
  })).isInstrumental, false);
  assert.equal(resolvePresetApplication(makePreset('clear-instrumental', {
    name: '숲속 기타 연주곡', customPrompt: 'Warm acoustic guitar',
  })).isInstrumental, true);
});

test('all reviewed explicit modes and the six genuine instrumental defaults survive', () => {
  const corrections = load('src/data/presetCatalogCorrections.ts').presetCatalogCorrections;
  for (const [id, correction] of Object.entries(corrections)) {
    const preset = makePreset(id, { ...correction, customPrompt: correction.customPrompt || 'expressive vocals' });
    assert.equal(resolvePresetApplication(preset).isInstrumental, correction.instrumentalOnly, id);
  }
  const merged = mergePublicPresetCatalog([makePreset('post_rock'), makePreset('quiet-forest-acoustic-guitar')], presets);
  const instrumental = merged.filter(preset => resolvePresetApplication(preset).isInstrumental).map(preset => preset.id).sort();
  assert.deepEqual(instrumental, ['post_rock', 'quiet-forest-acoustic-guitar', 'developer-debugging',
    'iced-oolong-tea', 'matcha-kyoto-jazz', 'deep-sleep-drift'].sort());
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
