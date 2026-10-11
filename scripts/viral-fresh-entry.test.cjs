/** Offline fresh-entry checks against production initializers, memos and effects. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const root = path.resolve(__dirname, '..');
const pageFile = path.join(root, 'src/app/(app)/viral/page.tsx');
function source() { return ts.createSourceFile(pageFile, fs.readFileSync(pageFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function find(ast, predicate) {
  let result;
  function visit(node) { if (!result && predicate(node)) result = node; if (!result) ts.forEachChild(node, visit); }
  visit(ast); assert.ok(result, 'Required production initializer/effect must exist'); return result;
}
function variable(name) {
  const ast = source();
  return { ast, node: find(ast, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name).initializer };
}
function stateInitializer(name) {
  const ast = source();
  return { ast, node: find(ast, node => ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
    && node.name.elements.some(element => element.name?.getText(ast) === name)).initializer };
}
function effect(dependency) {
  const ast = source();
  const call = find(ast, node => ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
    && node.arguments[1]?.getText(ast).includes(dependency));
  return { ast, node: call.arguments[0] };
}
function libraryEffect() {
  const ast = source();
  const declaration = find(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadGrokTracks');
  assert.ok(ts.isArrowFunction(declaration.parent.parent));
  return { ast, node: declaration.parent.parent };
}
function execute({ ast, node }, bindings = {}) {
  const module = { exports: {} };
  const expression = ts.isFunctionDeclaration(node)
    ? `function ${node.name?.text || ''}(${node.parameters.map(parameter => parameter.getText(ast)).join(',')}) ${node.body.getText(ast)}`
    : node.getText(ast);
  const code = ts.transpileModule(`module.exports = (${expression});`, {
    fileName: 'production-fresh-entry.tsx', compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, console, require,
    useMemo: callback => callback(), useCallback: callback => callback,
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    fetch() { throw new Error('Unexpected network request in offline fresh-entry test'); },
    ...bindings,
  });
  return module.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const saved = { id: 'saved-track', title: 'Saved song', lyrics: 'Old lyrics', source: 'viral' };
function harness(overrides = {}) {
  const state = {
    selectedGrokTrackId: '', availableTracks: [], generatedResult: null, currentPlayingTrack: null,
    customLyrics: '', genCategory: 'drama', grokVideoPrompt: 'Prior prompt', isTuningPrompt: false, ...overrides,
  };
  const requests = [], writes = [];
  const grokPromptRequest = { current: 0 };
  function bindings() {
    return { ...state, grokPromptRequest, readPetEpisode: track => track?.petEpisode || null, readViralBrief: () => null,
      setGrokVideoPrompt(value) { state.grokVideoPrompt = value; writes.push(value); },
      setIsTuningPrompt(value) { state.isTuningPrompt = value; },
      setGrokAllowDance() {}, setGrokCutCadence() {},
      async fetch(url, options) {
        requests.push({ url, body: options?.body ? JSON.parse(options.body) : null });
        assert.equal(url, '/api/viral-cf/grok-video/prompt');
        return overrides.reply ? overrides.reply() : { ok: true, json: async () => ({ prompt: 'Selected track prompt' }) };
      },
    };
  }
  const selected = () => execute(variable('selectedGrokTrack'), bindings());
  function runPrompt() {
    return execute(effect('selectedGrokTrack'), { ...bindings(), selectedGrokTrack: selected(),
      fetchDynamicGrokPrompt: execute(variable('fetchDynamicGrokPrompt'), bindings()),
    })();
  }
  function tune() {
    execute(variable('handleTuneGrokPrompt'), { ...bindings(), selectedGrokTrack: selected(),
      fetchDynamicGrokPrompt: execute(variable('fetchDynamicGrokPrompt'), bindings()),
    })();
  }
  return { state, requests, writes, selected, runPrompt, tune };
}

test('a fresh mount initializes lyrics, planning, track and video fields empty even with stale browser storage', () => {
  const reads = [];
  const bindings = { window: {}, localStorage: { getItem(key) { reads.push(key); return JSON.stringify(saved); } } };
  for (const name of ['customTopic', 'customLyrics', 'optimizedPrompt', 'selectedGrokTrackId', 'grokVideoPrompt']) {
    assert.equal(execute(stateInitializer(name), bindings)[0], '', `${name} must start empty`);
  }
  for (const name of ['producerBrief', 'generatedResult', 'petEpisode', 'petTrackId', 'grokVideoResult']) {
    assert.equal(execute(stateInitializer(name), bindings)[0], null, `${name} must start absent`);
  }
  assert.deepEqual(reads, [], 'Studio state initialization must not read a prior draft');
});

test('cached and currently playing library tracks do not become implicit studio selections', () => {
  const host = harness({ availableTracks: [saved], currentPlayingTrack: saved });
  assert.equal(host.selected(), null);
  host.runPrompt();
  assert.equal(host.state.grokVideoPrompt, '');
  assert.deepEqual(host.requests, []);
});

test('loading the saved/public track library alone never chooses a studio track or requests an AI prompt', async () => {
  const host = harness();
  const requests = [];
  execute(libraryEffect(), {
    generatedResult: null, readPetEpisode: () => null,
    localStorage: { getItem() { return JSON.stringify([saved]); }, setItem() {} },
    setAvailableTracks(value) { host.state.availableTracks = value; },
    async fetch(url) {
      requests.push(url); assert.equal(url, '/api/generations?limit=50');
      return { ok: true, json: async () => ({ generations: [{ ...saved, id: 'public-track' }] }) };
    },
  })();
  await tick();
  assert.equal(host.state.availableTracks.length, 2);
  assert.equal(host.selected(), null);
  host.runPrompt();
  assert.deepEqual(requests, ['/api/generations?limit=50']);
  assert.deepEqual(host.requests, []);
});

for (const kind of ['explicit', 'generated']) {
  test(`${kind} track selection remains read-only until the explicit prompt action`, async () => {
    const host = harness(kind === 'explicit' ? { availableTracks: [saved], selectedGrokTrackId: saved.id } : { generatedResult: saved });
    assert.equal(host.selected().id, saved.id);
    host.runPrompt();
    await tick();
    assert.equal(host.requests.length, 0);
    host.tune();
    await tick();
    assert.equal(host.requests.length, 1);
    assert.equal(host.requests[0].body.lyrics, saved.lyrics);
    assert.equal(host.state.grokVideoPrompt, 'Selected track prompt');
  });
}

test('a removed selection clears prompt and rejects its late asynchronous prompt response', async () => {
  let release;
  const reply = new Promise(resolve => { release = resolve; });
  const host = harness({ availableTracks: [saved], selectedGrokTrackId: saved.id, reply: () => reply });
  const cleanup = host.runPrompt();
  host.tune();
  assert.equal(typeof cleanup, 'function');
  cleanup();
  host.state.selectedGrokTrackId = '';
  host.runPrompt();
  assert.equal(host.state.grokVideoPrompt, '');
  release({ ok: true, json: async () => ({ prompt: 'Late stale prompt' }) });
  await tick();
  assert.equal(host.state.grokVideoPrompt, '');
  assert.ok(!host.writes.includes('Late stale prompt'));
});

test('switching to pet clears the general prompt and rejects the previous category response', async () => {
  let release;
  const reply = new Promise(resolve => { release = resolve; });
  const host = harness({ generatedResult: saved, reply: () => reply });
  const cleanup = host.runPrompt();
  host.tune();
  cleanup();
  host.state.genCategory = 'pet';
  host.runPrompt();
  release({ ok: true, json: async () => ({ prompt: 'Old category prompt' }) });
  await tick();
  assert.equal(host.requests.length, 1);
  assert.equal(host.state.grokVideoPrompt, '');
});

test('changing selection during manual tuning clears busy state and rejects the late tuning response', async () => {
  let release;
  const reply = new Promise(resolve => { release = resolve; });
  const host = harness({ availableTracks: [saved], selectedGrokTrackId: saved.id, reply: () => reply });
  const cleanup = host.runPrompt();
  host.tune();
  assert.equal(host.state.isTuningPrompt, true);
  cleanup();
  host.state.selectedGrokTrackId = '';
  host.runPrompt();
  assert.equal(host.state.isTuningPrompt, false);
  release({ ok: true, json: async () => ({ prompt: 'Stale tuned prompt' }) });
  await tick();
  assert.equal(host.state.isTuningPrompt, false);
  assert.equal(host.state.grokVideoPrompt, '');
  assert.ok(!host.writes.includes('Stale tuned prompt'));
});

test('page wrapper changes the studio key for petTrack and danceTrack links and restores normal entry', () => {
  const ast = source();
  const node = find(ast, node => ts.isFunctionDeclaration(node)
    && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  let petTrack = null, danceTrack = null;
  const wrapper = execute({ ast, node }, {
    useSearchParams: () => ({ get(key) { assert.ok(['petTrack', 'danceTrack'].includes(key)); return key === 'petTrack' ? petTrack : danceTrack; } }),
    ViralTrendZoneStudio() {},
  });
  const normal = wrapper();
  petTrack = 'owned-A';
  const a = wrapper();
  petTrack = 'owned-B';
  const b = wrapper();
  petTrack = null;
  const returned = wrapper();
  assert.equal(a.type, normal.type);
  assert.notEqual(a.key, normal.key, 'An explicit track link receives a distinct React mount identity');
  assert.notEqual(a.key, b.key);
  assert.notEqual(returned.key, b.key, 'Returning to normal entry replaces the linked studio');
  assert.equal(returned.key, normal.key);
  danceTrack = 'dance-A';
  const danceA = wrapper();
  danceTrack = 'dance-B';
  const danceB = wrapper();
  assert.notEqual(danceA.key, normal.key, 'An explicit dance link receives a distinct mount identity');
  assert.notEqual(danceA.key, danceB.key, 'Changing dance tracks replaces prior state');
  danceTrack = null;
  assert.equal(wrapper().key, normal.key, 'Leaving a dance link restores fresh entry');
});

test('viral route template passes each new studio child through a fragment', () => {
  const filename = path.join(root, 'src/app/(app)/viral/template.tsx');
  const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = find(ast, node => ts.isFunctionDeclaration(node)
    && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
  const template = execute({ ast, node });
  const first = React.createElement('div', { key: 'first-studio' });
  const second = React.createElement('div', { key: 'next-studio' });
  const initialTree = template({ children: first });
  const nextTree = template({ children: second });
  assert.equal(initialTree.type, React.Fragment);
  assert.equal(initialTree.props.children, first);
  assert.equal(nextTree.props.children, second);
});

test('fresh studio defaults to pet and preserves the dedicated danceTrack entry', () => {
  for (const [danceTrack, category] of [[null, 'pet'], ['owned-dance-id', 'dance_challenge']]) {
    assert.equal(execute(stateInitializer('genCategory'), { DANCE_CATEGORY_ID: 'dance_challenge', searchParams: { get(key) { assert.equal(key, 'danceTrack'); return danceTrack; } } })[0], category);
  }
});
