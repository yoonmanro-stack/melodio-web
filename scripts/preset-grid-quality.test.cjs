const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const compile = filename => ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type, props) => ({ type, props });
const walk = (tree, predicate) => Array.isArray(tree) ? tree.flatMap(node => walk(node, predicate))
  : !tree || typeof tree !== 'object' ? [] : [...(predicate(tree) ? [tree] : []), ...walk(tree.props?.children, predicate)];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : String(tree ?? '');

function harness(initialLikes = []) {
  const storage = new Map([['melodio_liked_presets', JSON.stringify(initialLikes)]]);
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  const hooks = new Map();
  let context = 'grid', cursor = 0;
  const useState = initial => {
    const state = hooks.get(context) || []; hooks.set(context, state);
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.join(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} }; cache.set(filename, module.exports);
    new Function('module', 'exports', 'require', 'localStorage', 'window', 'Event', compile(filename))(
      module, module.exports, specifier => {
        if (specifier === 'react') return { useState, useSyncExternalStore: (_subscribe, read) => read() };
        if (specifier === 'react/jsx-runtime') return { jsx, jsxs: jsx };
        if (specifier === '@/contexts/LanguageContext') return { useLanguage: () => ({ language: 'ko' }) };
        if (specifier === 'lucide-react') return new Proxy({}, { get: (_value, key) => String(key) });
        if (specifier.startsWith('@/')) return load(`src/${specifier.slice(2)}.ts`);
        throw new Error(`Unexpected dependency: ${specifier}`);
      }, localStorage, window, Event,
    );
    return module.exports;
  }
  const Grid = load('src/components/prompt-builder/PresetGrid.tsx').default;
  let props = { onApply() {}, isPro: true, onOpenCreatePreset() {}, onOpenProPaywall() {}, customPresets: [], dbPresets: [], onDeletePreset() {} };
  return {
    render(changes = {}) { props = { ...props, ...changes }; context = 'grid'; cursor = 0; return Grid(props); },
    artwork(node) { context = `art:${node.props.preset.id}`; cursor = 0; return node.type(node.props); },
    storedLikes: () => JSON.parse(storage.get('melodio_liked_presets')),
    thumbnail: load('src/lib/preset-thumbnail.ts'),
  };
}

test('built-in thumbnails are explicit and the three trot styles have different art', () => {
  const h = harness();
  const paths = ['traditional-trot-master', 'highway-disco-trot', 'acoustic-folk-trot'].map(id => h.thumbnail.getPresetThumbnail({ id }));
  assert.equal(new Set(paths).size, 3);
  for (const asset of paths) {
    assert.ok(fs.existsSync(path.join(root, 'public', asset)));
    assert.match(fs.readFileSync(path.join(root, 'public', asset), 'utf8'), /<svg/);
  }
  assert.equal(h.thumbnail.getPresetThumbnail({ id: 'custom-1' }, true), null);
  assert.equal(h.thumbnail.getPresetThumbnail({ id: 'grime', metadata: { thumbnail_url: 'javascript:alert(1)' } }), null);
});

test('an image error becomes that card artwork without fetching the Tokyo fallback', () => {
  const h = harness();
  const tree = h.render();
  const node = walk(tree, node => typeof node.type === 'function' && node.type.name === 'PresetArtwork')[0];
  let artwork = h.artwork(node);
  assert.equal(artwork.type, 'img');
  artwork.props.onError();
  artwork = h.artwork(node);
  assert.equal(walk(artwork, node => node.type === 'img').length, 0);
  assert.equal(artwork.props.role, 'img');
  assert.match(text(artwork), new RegExp(node.props.preset.name));
});

test('missing metrics show no synthetic popularity or false quality badges', () => {
  const h = harness();
  const tree = h.render();
  assert.doesNotMatch(text(tree), /이용횟수|Signature|Best|Crown|2026\.07\.12/);
  assert.equal(h.thumbnail.getPresetUsageCount({ metadata: {} }), null);
  assert.equal(h.thumbnail.getPresetUsageCount({ metadata: { usage_count: 23 } }), 23);
  assert.equal(h.thumbnail.getPresetUsageCount({ metadata: { usage_count: -1 } }), null);
});

test('old public favorite IDs resolve to the merged card and can be removed', () => {
  const h = harness(['grime', 'custom-123']);
  const row = { id: 'uk_grime', name: 'UK Grime', desc: 'London rap', emoji: '🎵', selections: {}, customPrompt: 'UK Grime, 140 BPM', isDb: true };
  const tree = h.render({ dbPresets: [row] });
  const favorite = walk(tree, node => node.type === 'button' && node.props.title === '좋아요 취소')[0];
  assert.ok(favorite);
  favorite.props.onClick({ stopPropagation() {} });
  assert.deepEqual(h.storedLikes(), ['custom-123']);
});

test('all five personal styles remain editable and deletable in their own category', () => {
  const h = harness();
  const customPresets = Array.from({ length: 5 }, (_, i) => ({ id: `custom-${i}`, name: `Personal ${i}`, desc: 'Own style', emoji: '🎵', selections: {}, customPrompt: 'my own recipe' }));
  let tree = h.render({ customPresets, onEditPreset() {} });
  const tab = walk(tree, node => node.type === 'button' && text(node).includes('나만의 컨셉'))[0];
  tab.props.onClick(); tree = h.render();
  assert.equal(walk(tree, node => node.type === 'button' && node.props.title === '수정').length, 5);
  assert.equal(walk(tree, node => node.type === 'button' && node.props.title === '삭제').length, 5);
  for (const preset of customPresets) assert.ok(text(tree).includes(preset.name));
});
