/** Offline card-to-studio behavior regressions. Every I/O surface is injected. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const root = path.resolve(__dirname, '..');
const libraryFile = path.join(root, 'src/components/viral/ViralVideoLibrary.tsx');
const pageFile = path.join(root, 'src/app/(app)/viral/page.tsx');
const categories = ['drama', 'pet', 'relationship', 'human', 'trend', 'challenge', 'brand', 'history', 'parenting', 'food_diet', 'horror_mystery', 'ai_future', 'dance_challenge'];
function compile(source, filename) {
  return ts.transpileModule(source, { fileName: filename, compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
}
function walk(node, predicate, found = []) {
  if (Array.isArray(node)) { node.forEach(item => walk(item, predicate, found)); return found; }
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  walk(node.props?.children, predicate, found);
  return found;
}
function label(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(label).join('');
  return typeof node === 'object' ? label(node.props?.children) : String(node);
}
const createActions = tree => walk(tree, node => ['button', 'a'].includes(node.type) && label(node).trim() === '이 포맷으로 만들기');
function availability() {
  const file = path.join(root, 'src/lib/vle/viralCategoryAvailability.ts');
  const module = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(file, 'utf8'), file), { module, exports: module.exports, require });
  return module.exports;
}
const sameDependencies = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const tick = () => new Promise(resolve => setImmediate(resolve));
function row(category, overrides = {}) {
  return {
    id: `public-${category}`, title: `Public ${category}`, status: 'completed', is_public: true,
    video_url: `https://example.invalid/${category}.mp4`,
    metadata: { sourceMenu: 'viral', presetId: category }, ...overrides,
  };
}

/** Render the production component and invoke its actual JSX event handlers. */
function libraryHarness(rows, overrides = {}) {
  const slots = [], effects = [], requests = [], created = [], loaded = [], storageReads = [];
  let cursor = 0;
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] || (slots[index] = { current: initial }); },
    useMemo(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) slots[index] = { value: callback(), dependencies };
      return slots[index].value;
    },
    useCallback(callback, dependencies) { return this.useMemo(() => callback, dependencies); },
    useEffect(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
        slots[index] = { dependencies, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  // Exported React hook bindings are called without a receiver.
  react.useCallback = (callback, dependencies) => react.useMemo(() => callback, dependencies);
  const storage = new Map(Object.entries(overrides.storage || {}));
  const module = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(libraryFile, 'utf8'), libraryFile), {
    module, exports: module.exports, console,
    require(name) {
      if (name === 'react') return react;
      if (name === '@/lib/globalAudio') return { registerActiveAudio() {} };
      if (name === '@/lib/vle/viralCategoryAvailability') return availability();
      return require(name);
    },
    window: {},
    localStorage: {
      getItem(key) { storageReads.push(key); return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
    },
    async fetch(url) {
      requests.push(url);
      assert.equal(url, '/api/viral-videos?coverVersion=3', 'Card selection must not start generation requests');
      return { ok: true, json: async () => ({ generations: rows }) };
    },
  }, { filename: libraryFile });
  const props = {
    onVideosLoaded: videos => loaded.push(videos), onCreateFormat: category => created.push(category),
    creationDisabled: false, ...overrides.props,
  };
  function render(nextProps = {}) { Object.assign(props, nextProps); cursor = 0; return module.exports.default(props); }
  async function mount() { render(); effects.splice(0).forEach(effect => effect()); await tick(); return render(); }
  return { render, mount, created, loaded, requests, storageReads };
}

for (const category of categories) {
  test(`public ${category} card applies studio availability`, async () => {
    const harness = libraryHarness([row(category)]);
    const tree = await harness.mount();
    const actions = createActions(tree);
    assert.equal(actions.length, availability().isActiveViralCategory(category) ? 1 : 0);
    assert.equal(walk(tree, node => node.type === 'video').length, availability().isActiveViralCategory(category) ? 1 : 0, 'Excluded categories are absent from the studio showcase');
    if (!availability().isActiveViralCategory(category)) {
      assert.deepEqual(harness.created, []);
      return;
    }
    assert.equal(typeof actions[0].props.onClick, 'function', 'A scroll-only link does not select a studio category');
    actions[0].props.onClick({ preventDefault() {} });
    assert.deepEqual(harness.created, [category]);
    assert.equal(harness.requests.length, 1);
  });
}

test('category resolution skips invalid early values and preserves valid metadata precedence', async () => {
  const cases = [
    [row('one', { title: '고양이의 하루', metadata: { sourceMenu: 'viral', presetId: 'unrelated-preset', genCategory: 'brand' } }), 'brand'],
    [row('two', { title: '다른 주제', metadata: { sourceMenu: 'viral', presetId: 'invalid', tab_type: 'invalid-too' }, preset_id: 'history', category: 'pet' }), 'history'],
    [row('three', { title: '고양이의 하루', metadata: { sourceMenu: 'viral', presetId: ' relationship ', genCategory: 'pet' }, category: 'brand' }), 'relationship'],
    [row('four', { metadata: JSON.stringify({ sourceMenu: 'viral', presetId: 'invalid' }), license_hash: JSON.stringify({ genCategory: 'food_diet' }) }), 'food_diet'],
    [row('five', { title: '고양이의 하루', metadata: { sourceMenu: 'viral', presetId: 'invalid' }, category: 'invalid' }), 'pet'],
    [row('six', { title: 'A neutral moment', metadata: { sourceMenu: 'viral', presetId: 'invalid' } }), 'trend'],
    [row('seven', { metadata: { sourceMenu: 'viral', presetId: 'dance' } }), 'dance_challenge'],
  ];
  const harness = libraryHarness(cases.map(([item]) => item));
  const tree = await harness.mount();
  assert.deepEqual(Array.from(harness.loaded[0], item => item.category), cases.map(([, category]) => category).filter(availability().isActiveViralCategory));
  for (const action of createActions(tree)) action.props.onClick({ preventDefault() {} });
  assert.deepEqual(harness.created, cases.map(([, category]) => category).filter(availability().isActiveViralCategory));
});

test('creation lock prevents category callbacks, including an explicitly invoked event handler', async () => {
  const harness = libraryHarness([row('pet')], { props: { creationDisabled: true } });
  const tree = await harness.mount();
  const action = createActions(tree)[0];
  assert.ok(action);
  assert.ok(action.props.disabled === true || action.props['aria-disabled'] === true);
  action.props.onClick?.({ preventDefault() {} });
  assert.deepEqual(harness.created, []);
});

test('public library continues to exclude unfinished, private, non-viral, missing-video and duplicate rows', async () => {
  const valid = row('pet');
  const harness = libraryHarness([
    valid, { ...valid, id: 'duplicate' }, row('brand', { status: 'processing' }),
    row('drama', { id: 'public-second', title: 'Public drama (2)' }),
    row('history', { is_public: false }), row('human', { metadata: { sourceMenu: 'playlist' } }),
    row('challenge', { video_url: '' }), row('parenting', { metadata: { sourceMenu: 'viral', isPublic: false } }),
  ]);
  const tree = await harness.mount();
  assert.deepEqual(Array.from(harness.loaded[0], item => item.id), ['public-pet']);
  assert.equal(createActions(tree).length, 1);
  assert.equal(walk(tree, node => node.type === 'video').length, 1, 'Other categories remain outside the studio showcase');
});

// Extract production handlers/effects structurally; no parallel implementation of selection logic.
function pageAst() { return ts.createSourceFile(pageFile, fs.readFileSync(pageFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function findNode(source, predicate) {
  let found;
  function visit(node) { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); }
  visit(source); assert.ok(found, 'Required production handler/effect must exist'); return found;
}
function handlerNode(name) {
  const source = pageAst();
  return { source, node: findNode(source, node => ts.isVariableDeclaration(node) && node.name.getText(source) === name).initializer };
}
function effectNode(predicate) {
  const source = pageAst();
  const call = findNode(source, node => ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && predicate(node.arguments[0].getText(source)));
  return { source, node: call.arguments[0] };
}
function execute({ source, node }, bindings) {
  const module = { exports: {} };
  vm.runInNewContext(compile(`module.exports = (${node.getText(source)});`, 'production-handler.tsx'), {
    module, exports: module.exports, console, require, useCallback: value => value, ...bindings,
  });
  return module.exports;
}

function pageHarness(overrides = {}) {
  const state = {
    genCategory: 'pet', customTopic: 'Current user situation', customLyrics: 'Current lyrics', optimizedPrompt: 'Current style',
    producerBrief: { categoryId: 'pet' }, petUserId: 'owner-A', petDraftOwner: 'owner-A',
    petOwnedTracksOwner: 'owner-A', petOwnedTracksStatus: 'ready', petTrackId: null, generatedResult: null,
    petCompletedRefreshKey: null,
    topVideoIds: new Set(), topVideoUrls: new Set(),
    danceBusy: false, studioBusy: false, planningAccount: { userId: 'owner-A' }, isOptimizing: false, isGenerating: false, isGeneratingGrokVideo: false,
    ...overrides,
  };
  const refs = {
    planningAccountRef: { current: state.planningAccount }, explicitCategorySelection: { current: null }, explicitGrokSelectionRef: { current: null }, petPlanningRequest: { current: 7 },
    grokPromptRequest: { current: 0 },
    petAccountRef: { current: 'owner-A' }, petCategoryRef: { current: state.genCategory },
    petTopicDraft: { current: state.customTopic }, petOpeningTrackRequest: { current: null },
  };
  const episode = { sourceTopic: 'Saved situation', lyrics: 'Saved lyrics', stylePrompt: 'Saved style', title: 'Saved title', shots: [{ caption: 'Saved hook' }] };
  const track = { id: 'url-track', user_id: 'owner-A', status: 'completed', audio_url: 'https://example.invalid/owned.mp3', petEpisode: episode };
  state.petOwnedTracks = [track];
  const changes = [], loads = [], storageReads = [];
  let requestedPetTrackId = 'url-track';
  const setters = {};
  const source = pageAst();
  function collect(node) {
    if (ts.isIdentifier(node) && /^set[A-Z]/.test(node.text)) {
      const key = node.text.slice(3, 4).toLowerCase() + node.text.slice(4);
      setters[node.text] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; changes.push(key); };
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  function bindings() {
    return { ...state, ...refs, ...setters, ...availability(), requestedPetTrackId,
      searchParams: { get(key) { assert.equal(key, 'petTrack'); return requestedPetTrackId; } },
      // Parsing has separate contract regressions; these fixtures isolate page selection and restoration guards.
      readPetEpisode: value => value?.petEpisode || null,
      localStorage: { getItem(key) { storageReads.push(key); return key.includes('pet-active') ? 'true' : JSON.stringify({ episode, trackId: track.id }); } },
      handleLoadPetTrack: async id => { loads.push(id); },
      fetch() { throw new Error('Unexpected network request in selection regression'); },
    };
  }
  const select = category => execute(handlerNode('handleSelectGenerationCategory'), bindings())(category);
  const restoreUrl = () => execute(effectNode(text => text.includes('requestedPetTrackId') && text.includes('petOpeningTrackRequest')), bindings())();
  const resetOwner = () => execute(effectNode(text => text.includes('const previousOwner') && text.includes('petAccountRef.current')), bindings())();
  return { state, refs, changes, loads, storageReads, track, bindings, select, restoreUrl, resetOwner, setUrl(id) { requestedPetTrackId = id; } };
}

test('page wiring sends the public dance CTA to the same reset handler as manual category selection', async () => {
  const page = pageHarness();
  const source = pageAst();
  const node = findNode(source, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'ViralVideoLibrary');
  const libraryElement = execute({ source, node }, {
    ...page.bindings(), ViralVideoLibrary() {}, setViralVideos() {}, handleSelectGenerationCategory: page.select,
  });
  const harness = libraryHarness([row('dance_challenge')], { props: libraryElement.props });
  const action = createActions(await harness.mount())[0];
  assert.equal(action.props.href, '#viral-studio', 'Successful selection retains native studio navigation');
  let prevented = false;
  action.props.onClick({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(page.state.genCategory, 'dance_challenge');
  assert.equal(page.state.customTopic, '');
  assert.equal(page.state.customLyrics, '');
  assert.equal(page.state.optimizedPrompt, '');
  assert.equal(page.state.producerBrief, null);
  assert.equal(page.refs.petPlanningRequest.current, 8, 'Old asynchronous planning results are invalidated');
  assert.equal(page.refs.explicitCategorySelection.current.petTrackId, 'url-track');
  const manualPage = pageHarness();
  const click = findNode(source, node => ts.isJsxAttribute(node) && node.name.getText(source) === 'onClick'
    && node.initializer?.getText(source).includes('handleSelectGenerationCategory(cat.id'));
  execute({ source, node: click.initializer.expression }, { cat: { id: 'dance_challenge' }, handleSelectGenerationCategory: manualPage.select })();
  assert.equal(manualPage.state.genCategory, page.state.genCategory);
  assert.deepEqual(manualPage.changes, page.changes);
});

for (const busyFlag of ['danceBusy', 'isOptimizing', 'isGenerating', 'isGeneratingGrokVideo']) {
  test(`page ${busyFlag} guard retains the category and current work`, () => {
    const harness = pageHarness({ [busyFlag]: true });
    harness.select('dance_challenge');
    assert.equal(harness.state.genCategory, 'pet');
    assert.equal(harness.state.customLyrics, 'Current lyrics');
    assert.equal(harness.refs.explicitCategorySelection.current, null);
    assert.deepEqual(harness.changes, []);
  });
}

test('same-category explicit selection retains current work and prevents stale URL reopening', () => {
  const harness = pageHarness();
  harness.select('pet');
  harness.restoreUrl();
  assert.equal(harness.state.customLyrics, 'Current lyrics');
  assert.equal(harness.refs.petPlanningRequest.current, 7);
  assert.deepEqual(harness.loads, []);
});

test('owner reset cannot fill an explicit dance selection from an old active pet draft', () => {
  const harness = pageHarness();
  harness.select('dance_challenge');
  harness.refs.petAccountRef.current = null;
  harness.refs.petCategoryRef.current = 'dance_challenge';
  harness.resetOwner();
  assert.equal(harness.state.genCategory, 'dance_challenge');
  assert.equal(harness.state.customTopic, '');
  assert.equal(harness.state.customLyrics, '');
  assert.equal(harness.state.petEpisode, null);
  assert.equal(harness.state.petDraftOwner, 'owner-A');
});

test('normal owner initialization stays fresh despite an old active pet draft', () => {
  const harness = pageHarness({ genCategory: 'trend', customTopic: '', customLyrics: '', optimizedPrompt: '', producerBrief: null });
  harness.refs.petAccountRef.current = null;
  harness.resetOwner();
  assert.equal(harness.state.genCategory, 'trend');
  assert.equal(harness.state.customLyrics, '');
  assert.equal(harness.state.optimizedPrompt, '');
  assert.equal(harness.state.customTopic, '');
  assert.equal(harness.state.petEpisode, null);
  assert.equal(harness.state.petTrackId, null);
  assert.equal(harness.state.producerBrief, null);
  assert.equal(harness.state.petDraftOwner, 'owner-A');
  assert.deepEqual(harness.storageReads, []);
});

test('existing petTrack URL is ignored after explicit selection, while a different owned URL can open', async () => {
  const harness = pageHarness();
  harness.select('dance_challenge');
  harness.restoreUrl();
  assert.equal(harness.state.genCategory, 'dance_challenge');
  assert.deepEqual(harness.loads, []);
  harness.state.petOwnedTracks.push({ ...harness.track, id: 'new-track' });
  harness.setUrl('new-track');
  harness.restoreUrl();
  assert.equal(harness.state.genCategory, 'pet');
  harness.restoreUrl();
  await tick();
  assert.deepEqual(harness.loads, ['new-track']);
});

test('an in-flight pet-track response cannot restore old work after explicit category selection', async () => {
  const harness = pageHarness();
  let releaseReply;
  const reply = new Promise(resolve => { releaseReply = resolve; });
  const loader = execute(handlerNode('handleLoadPetTrack'), { ...harness.bindings(), fetch: async () => reply });
  const pending = loader('url-track');
  harness.select('dance_challenge');
  releaseReply({ ok: true, json: async () => ({ generation: harness.track }) });
  await pending;
  assert.equal(harness.state.genCategory, 'dance_challenge');
  assert.equal(harness.state.customLyrics, '');
  assert.equal(harness.state.petEpisode, null);
  assert.equal(harness.state.generatedResult, null);
});

test('petTrack navigation A to B to A permits Back to reopen A after its earlier dismissal', async () => {
  const harness = pageHarness();
  harness.select('dance_challenge');
  harness.restoreUrl();
  assert.deepEqual(harness.loads, [], 'Explicit category selection dismisses the current A URL');
  harness.state.petOwnedTracks.push({ ...harness.track, id: 'new-track' });
  harness.setUrl('new-track');
  harness.restoreUrl();
  harness.restoreUrl();
  await tick();
  assert.deepEqual(harness.loads, ['new-track']);
  harness.setUrl('url-track');
  harness.restoreUrl();
  await tick();
  assert.deepEqual(harness.loads, ['new-track', 'url-track'], 'Back navigation to A is a new opening request');
});

test('persisted public caches are ignored before the fresh public list arrives', () => {
  const harness = libraryHarness([], { storage: {
    melodio_viral_video_library_v2: JSON.stringify([{ id: 'old', category: 'trend', videoUrl: 'https://example.invalid/old.mp4' }]),
    melodio_viral_video_library_v3: JSON.stringify([{ id: 'old', category: 'trend', videoUrl: 'https://example.invalid/old.mp4' }]),
    melodio_viral_video_library_v4: JSON.stringify([{ id: 'old', category: 'trend', videoUrl: 'https://example.invalid/old.mp4' }]),
  } });
  assert.equal(createActions(harness.render()).length, 0);
  assert.deepEqual(harness.storageReads, []);
});

for (const category of categories.filter(value => !['pet', 'dance_challenge'].includes(value))) {
  test(`page rejects disabled ${category} selection without discarding current work`, () => {
    const harness = pageHarness();
    harness.select(category);
    assert.equal(harness.state.genCategory, 'pet');
    assert.equal(harness.state.customLyrics, 'Current lyrics');
    assert.deepEqual(harness.changes, []);
  });
}

test('public library exposes only the two active category filters', async () => {
  const harness = libraryHarness(categories.map(category => row(category)));
  const tree = await harness.mount();
  const filters = walk(tree, node => node.props?.['aria-label'] === '영상 카테고리')[0];
  assert.deepEqual(walk(filters, node => node.type === 'button').map(label), ['전체', '댕냥이 집사속마음', '댄스 챌린지']);
});
