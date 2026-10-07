/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node test entry. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const jsx = (type, props) => ({ type, props });
const noop = () => {};
const snapshot = value => JSON.parse(JSON.stringify(value));
function evaluate(source, scope = {}, dependencies = {}) {
  const offlineModule = { exports: {} };
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  new Function('module', 'exports', 'require', ...Object.keys(scope), compiled)(
    offlineModule, offlineModule.exports, name => {
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked dependency: ${name}`);
      return dependencies[name];
    }, ...Object.values(scope));
  return offlineModule.exports;
}
const batch = evaluate(fs.readFileSync('src/lib/generation-batch-client.ts', 'utf8'));
function treeFor(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function find(tree, predicate) {
  let result;
  function visit(node) {
    if (predicate(node)) result = node;
    if (!result) ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(result, 'Expected source expression was not found');
  return result;
}
function handler(file, name, scope) {
  const tree = treeFor(file);
  const declaration = find(tree, node => ts.isVariableDeclaration(node) && node.name.getText(tree) === name);
  return evaluate(`export const run = ${declaration.initializer.getText(tree)}`, scope).run;
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree && typeof tree === 'object' ? text(tree.props?.children) : String(tree ?? '');
}

test('batch metadata retains every input in order for all supported counts', () => {
  for (const count of [1, 5, 10, 15, 20, 30, 40]) {
    assert.deepEqual(snapshot(batch.buildGenerationBatch('offline-batch', count)),
      Array.from({ length: count }, (_, trackIndex) => ({ id: 'offline-batch', trackIndex, inputCount: count })));
  }
  for (const count of [0, -1, 41, 1.5, NaN]) assert.throws(() => batch.buildGenerationBatch('offline-batch', count), RangeError);
});

const studios = [
  ['src/components/prompt-builder/PromptBuilder.tsx', 'handleGenerate', 'style-library'],
  ['src/components/prompt-builder/PresetStudioBuilder.tsx', 'handleGenerate', 'preset-studio'],
  ['src/components/japan-landing-client.tsx', 'handleGenerateMusic', 'japan'],
];
for (const [file, name, menu] of studios) {
  test(`${menu}: actual playlist handler shares one UUID, preserves input requests, and separates later actions`, async () => {
    for (const count of [1, 5, 10, 15, 20, 30, 40]) {
      const requests = [], history = [], errors = [];
      let uuidCalls = 0;
      const tracks = Array.from({ length: count }, (_, index) => ({
        title: `Song ${index + 1}`, sections: [{ type: 'verse', content: `Lyric ${index + 1}` }],
        youtubeTags: 'tag', snsHashtags: '#tag',
      }));
      const scope = {
        ...batch, tracks, trackCount: count === 10 ? 15 : count,
        isPlaylistMode: true, isInstrumental: false, engine: 'suno_v5', sunoVersion: 'v6',
        user: { id: 'offline-owner' }, sourceMenu: menu, searchParams: new URLSearchParams(),
        artistState: { getError: () => null, requestFields: {} }, artistSettings: {},
        selections: {}, customPresets: [], selectedStudioPreset: null, selectedPresetId: null, selectedPresetName: '',
        stylePrompt: 'Jazz', styleTags: 'Jazz', studioVoiceFields: { lyricsLanguage: 'ko', vocalGender: 'female' },
        isAsmrEnabled: false, ambientFoley: '', dynamicElements: null, ambienceVolume: 0, isPublic: false,
        generationJob: null, allJpPresets: [],
        setIsGenerating: noop, setIsGeneratingMusic: noop, setGenModalState: noop,
        setGenErrorMsg: message => { if (message) errors.push(message); }, setGenerationJob: noop,
        setPublicTracksRefreshSignal: noop, fetchMyJpTracks: noop, setActiveTrackIdx: noop,
        buildLyricsPrompt: sections => sections.map(section => section.content).join('\n'),
        resolveRotationPrompt: value => value, fitJapanStyleBudget: value => value,
        crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCalls).padStart(12, '0')}` },
        window: { setTimeout: noop }, console: { error: error => errors.push(String(error)) },
        alert: message => { throw Error(message); }, saveHistory: async payload => { history.push(payload); },
        fetch: async (url, options) => {
          assert.equal(url, '/api/generate');
          requests.push(JSON.parse(options.body));
          return { ok: true, json: async () => ({ track: { id: `result-${requests.length}` } }) };
        },
      };
      const run = handler(file, name, scope);
      await run();
      await run();
      assert.deepEqual(errors, []);
      assert.equal(uuidCalls, 2);
      assert.equal(requests.length, count * 2, 'Each action still submits exactly one request per input song');
      assert.equal(history.length, count * 2);
      for (let action = 0; action < 2; action++) {
        const submitted = requests.slice(action * count, (action + 1) * count);
        assert.equal(new Set(submitted.map(request => request.generationBatch.id)).size, 1);
        submitted.forEach((request, index) => {
          assert.equal(request.generationBatch.trackIndex, index);
          assert.equal(request.generationBatch.inputCount, count);
          assert.equal(request.title, tracks[index].title);
          assert.equal(request.lyricsPrompt, tracks[index].sections[0].content);
          assert.equal(request.sourceMenu, menu);
          assert.equal(request.sunoVersion, 'v6');
          assert.equal(request.isPublic, false);
        });
      }
      assert.notEqual(requests[0].generationBatch.id, requests[count].generationBatch.id);
    }
  });
}

test('quantity controls preserve existing input choices and expose 20/30/40 generated results as 10/15/20 inputs', () => {
  const file = 'src/components/prompt-builder/LyricsBuilder.tsx';
  const tree = treeFor(file);
  const expression = find(tree, node => ts.isCallExpression(node)
    && node.expression.getText(tree).endsWith('.map') && node.getText(tree).includes('onTrackCountChange(count)'));
  for (const engine of ['auto', 'suno_v5', 'lyria3']) {
    let selected;
    const choices = evaluate(`export const choices = ${expression.getText(tree)}`, {
      engine, trackCount: 10, onTrackCountChange: count => { selected = count; },
    }, { 'react/jsx-runtime': { jsx, jsxs: jsx } }).choices;
    assert.deepEqual(choices.map(choice => choice.props.children[0]), engine === 'lyria3'
      ? ['1곡 (싱글)', '10곡 생성', '15곡 생성', '20곡 생성', '30곡 생성', '40곡 생성']
      : ['2곡 (기본)', '20곡 생성', '30곡 생성', '40곡 생성', '60곡 생성', '80곡 생성']);
    choices.forEach((choice, index) => {
      choice.props.onClick();
      assert.equal(selected, [engine === 'lyria3' ? 1 : 2, 10, 15, 20, 30, 40][index]);
      if (selected > 2) assert.ok(text(choice).includes(`기본 수록 ${selected}곡`));
    });
  }
});

test('all studio layouts display prepared track count while the next lyric request retains its selected count', () => {
  let outputs = 0;
  for (const [file] of studios) {
    const tree = treeFor(file);
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName.getText(tree);
        if (name === 'PromptOutput' || name === 'LyricsBuilder') {
          const attribute = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(tree) === 'trackCount');
          assert.ok(attribute);
          const expression = attribute.initializer.expression.getText(tree);
          for (const prepared of [0, 10, 15]) {
            const count = evaluate(`export const count = ${expression}`, {
              isPlaylistMode: true, tracks: Array(prepared), trackCount: 15,
            }).count;
            assert.equal(count, name === 'PromptOutput' ? prepared : 15, `${file}: ${name}`);
          }
          if (name === 'PromptOutput') outputs++;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  assert.equal(outputs, 5);
});

test('generate button distinguishes generated results from default playlist count, including an empty prepared list', () => {
  const Component = evaluate(fs.readFileSync('src/components/prompt-builder/PromptOutput.tsx', 'utf8'), {}, {
    react: { useState: initial => [initial, noop] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '@/components/voice/ActiveVoiceBadge': { ActiveVoiceBadge: 'ActiveVoiceBadge' },
  }).default;
  for (const count of [0, 10, 15, 20, 30, 40]) for (const isGenerating of [false, true]) {
    const tree = Component({ payload: { engine: 'suno_v5' }, stylePrompt: '', excludePrompt: '',
      compositorResult: {}, onGenerate: noop, isPlaylistMode: true, trackCount: count, isGenerating });
    const button = nodes(tree, node => node.type === 'button' && node.props.onClick === noop).at(-1);
    assert.ok(button);
    assert.ok(text(button).includes(`${count * 2}곡 생성`));
    assert.ok(text(button).includes(`기본 수록 ${count}곡`));
    assert.equal(button.props.disabled, isGenerating);
  }
});
