/** Real LyricsBuilder hooks and deferred local responses; no provider or database access. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = process.cwd();
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const selectionModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/voice/studio-selection.ts'), 'utf8')), { module: selectionModule, exports: selectionModule.exports });
const componentCode = compile(fs.readFileSync(path.join(root, 'src/components/prompt-builder/LyricsBuilder.tsx'), 'utf8'));
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
const jsx = (type, props) => ({ type, props });
function walk(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(item => walk(item, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}
function harness(overrides = {}, initialVoice = {}) {
  const hooks = [], layout = [], effects = [], requests = [], writes = [], alerts = [];
  let cursor = 0, dirty = true, mounted = true, tree, writesAfterUnmount = 0;
  const voice = { activeVoice: null, studioGender: 'female', setStudioGender(value) { voice.studioGender = value; dirty = true; }, ...initialVoice };
  const write = field => value => { writes.push({ field, value }); };
  const props = { isInstrumental: false, stylePrompt: 'Future bass, 147 BPM', isPlaylistMode: false, trackCount: 2,
    engine: 'suno_v5', title: '', youtubeTags: '', snsHashtags: '', sections: [], playlistTitle: '', playlistDescription: '',
    playlistYoutubeTags: '', playlistSnsHashtags: '', tracks: [], activeTrackIdx: 0, presetId: 'kawaii-future',
    isJapanCampaign: true, lyricLanguage: 'ja', lyricTopic: 'Neon street discovery', artistContextKey: '',
    onTitleChange: write('title'), onTagsChange: write('tags'), onSectionsChange: write('sections'),
    onPlaylistTitleChange: write('playlistTitle'), onPlaylistDescriptionChange: write('playlistDescription'),
    onPlaylistTagsChange: write('playlistTags'), onTracksChange: write('tracks'), onActiveTrackIdxChange: write('activeTrackIdx'),
    onInstrumentalToggle() {}, onPlaylistModeToggle() {}, onTrackCountChange() {}, ...overrides };
  function effect(callback, deps, queue) {
    const index = cursor++; const previous = hooks[index];
    if (!sameDeps(previous?.deps, deps)) {
      hooks[index] = { deps, cleanup: previous?.cleanup };
      queue.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = callback(); });
    }
  }
  const react = {
    useState(initial) { const index = cursor++; if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, next => { if (!mounted) writesAfterUnmount++; const value = typeof next === 'function' ? next(hooks[index].value) : next; if (!Object.is(value, hooks[index].value)) { hooks[index].value = value; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; return hooks[index] || (hooks[index] = { current: initial }); },
    useLayoutEffect(callback, deps) { effect(callback, deps, layout); },
    useEffect(callback, deps) { effect(callback, deps, effects); },
  };
  const mod = { exports: {} };
  vm.runInNewContext(componentCode, { module: mod, exports: mod.exports, AbortController,
    alert: value => alerts.push(value), console: { error() {} }, setTimeout() {}, navigator: {},
    fetch(url, options) { assert.equal(url, '/api/lyrics/generate'); const response = deferred(); requests.push({ body: JSON.parse(options.body), options, response }); return response.promise; },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name === '@/contexts/VoiceContext') return { useVoice: () => voice };
      if (name === '@/lib/voice/studio-selection') return selectionModule.exports;
      if (name === '@/components/voice/StudioVoicePicker') return { StudioVoicePicker: 'StudioVoicePicker' };
      throw new Error('Unmocked dependency: ' + name);
    },
  });
  function render(next = {}, nextVoice = {}) { Object.assign(props, next); Object.assign(voice, nextVoice); dirty = true;
    for (let n = 0; dirty && n < 12; n++) { dirty = false; cursor = 0; tree = mod.exports.default(props); layout.splice(0).forEach(run => run()); effects.splice(0).forEach(run => run()); }
    assert.equal(dirty, false); return tree;
  }
  const button = () => walk(tree, node => node.type === 'button' && node.props.onClick?.name === 'handleGenerateAI')[0];
  render();
  return { props, voice, requests, writes, alerts, render,
    start() { const pending = button().props.onClick(); render(); return pending; },
    finish(index = requests.length - 1, data = { success: true, title: 'Authored title', sections: [{ type: 'verse', content: 'A complete original thought', description: 'bell synth, clear lead' }] }) { requests[index].response.resolve({ ok: true, json: async () => data }); },
    loading() { render(); return Boolean(button().props.disabled); },
    unmount() { mounted = false; hooks.forEach(hook => hook?.cleanup?.()); },
    writesAfterUnmount: () => writesAfterUnmount,
  };
}

test('Japan request uses controlled theme, language and trusted profile status and preserves authored output', async () => {
  const h = harness({ lyricLanguage: 'en', lyricTopic: 'A specific riverside scene' });
  const pending = h.start();
  assert.equal(h.requests[0].body.topic, 'A specific riverside scene');
  assert.equal(h.requests[0].body.language, 'en'); assert.equal(h.requests[0].body.sourceMenu, 'japan');
  assert.equal(h.requests[0].body.vocalProfileSpecified, false);
  assert.equal(h.requests[0].options.signal.aborted, false);
  const sections = [{ type: 'verse', content: Array.from({ length: 9 }, (_, i) => `Complete thought ${i}`).join('\n'), description: 'preserve an authored arrangement direction longer than sixty characters' }];
  h.finish(0, { success: true, title: 'Original', sections }); await pending;
  assert.deepEqual(h.writes.find(write => write.field === 'sections').value, sections); assert.equal(h.loading(), false);
});

for (const [name, nextProps, nextVoice] of [
  ['preset', { presetId: 'lofi-study' }], ['style', { stylePrompt: 'Traditional enka' }],
  ['language', { lyricLanguage: 'en' }], ['topic', { lyricTopic: 'Another scene' }],
  ['gender', {}, { studioGender: 'male' }], ['mode', { isPlaylistMode: true }],
  ['count', { trackCount: 5 }], ['artist identity', { artistContextKey: 'artist-B:revision-2' }],
  ['matching voice', {}, { activeVoice: { id: 'chosen-B', gender: 'female', language: 'ja', stylePrompt: 'warm alto' } }],
]) test(`Japan ${name} change cancels and ignores an old success response`, async () => {
  const h = harness(); const pending = h.start(); h.render(nextProps, nextVoice);
  assert.equal(h.requests[0].options.signal.aborted, true); assert.equal(h.loading(), false);
  h.finish(); await pending; assert.equal(h.writes.length, 0); assert.equal(h.alerts.length, 0);
});

test('a superseded Japan response cannot clear the newer request loading state or write lyrics', async () => {
  const h = harness(); const first = h.start(); h.render({ presetId: 'lofi-study' }); const second = h.start();
  h.finish(0); await first; assert.equal(h.loading(), true); assert.equal(h.writes.length, 0);
  h.finish(1); await second; assert.equal(h.loading(), false); assert.equal(h.writes.filter(write => write.field === 'sections').length, 1);
});

test('Japan unmount and stale network errors never update state or alert', async () => {
  const h = harness(); const pending = h.start(); h.unmount();
  assert.equal(h.requests[0].options.signal.aborted, true); h.requests[0].response.reject(new Error('Offline cancelled response')); await pending;
  assert.equal(h.writes.length, 0); assert.equal(h.alerts.length, 0); assert.equal(h.writesAfterUnmount(), 0);
});

for (const [name, next] of [['identity', { id: 'voice-B' }], ['style', { stylePrompt: 'warm dry alto' }]]) {
  test(`changing the selected matching voice ${name} cancels the pending Japan request`, async () => {
    const activeVoice = { id: 'voice-A', gender: 'female', language: 'ja', stylePrompt: 'airy soprano' };
    const h = harness({}, { activeVoice }); const pending = h.start();
    h.render({}, { activeVoice: { ...activeVoice, ...next } });
    assert.equal(h.requests[0].options.signal.aborted, true); h.finish(); await pending;
    assert.equal(h.writes.length, 0); assert.equal(h.loading(), false);
  });
}

test('a cancelled Japan network failure cannot alert or overwrite a replacement request', async () => {
  const h = harness(); const first = h.start(); h.render({ lyricTopic: 'Updated theme' }); const second = h.start();
  h.requests[0].response.reject(new Error('Old response')); await first;
  assert.equal(h.loading(), true); assert.equal(h.alerts.length, 0); assert.equal(h.writes.length, 0);
  h.finish(1); await second; assert.equal(h.loading(), false);
});

test('Japan profile status includes only a matching selected voice or the chosen artist', async () => {
  for (const [voice, artistVoice, expected] of [
    [{ activeVoice: { id: 'a', gender: 'female', language: 'ja', stylePrompt: 'airy soprano' } }, undefined, true],
    [{ activeVoice: { id: 'a', gender: 'male', language: 'ja', stylePrompt: 'baritone' } }, undefined, false],
    [{ activeVoice: { id: 'a', gender: 'female', language: 'en', stylePrompt: 'alto' } }, undefined, false],
    [{ studioGender: 'mixed', activeVoice: { id: 'a', gender: 'female', language: 'ja', stylePrompt: 'alto' } }, undefined, false],
    [{ studioGender: 'duet', activeVoice: { id: 'a', gender: 'female', language: 'ja', stylePrompt: 'alto' } }, undefined, false],
    [{}, { name: 'Chosen artist', gender: 'male', language: 'ja' }, true],
  ]) { const h = harness({ artistVoice }, voice); const pending = h.start(); assert.equal(h.requests[0].body.vocalProfileSpecified, expected); h.finish(); await pending; }
});

test('non-Japan request body and existing local-topic response behavior stay unchanged', async () => {
  const h = harness({ isJapanCampaign: false, lyricTopic: undefined, lyricLanguage: undefined }); const pending = h.start();
  assert.deepEqual(h.requests[0].body, { stylePrompt: 'Future bass, 147 BPM', topic: '', language: 'ko', isPlaylistMode: false, trackCount: 2, vocalGender: 'female', presetId: 'kawaii-future' });
  assert.equal(Object.hasOwn(h.requests[0].options, 'signal'), false);
  h.render({ presetId: 'another' }); h.finish(); await pending;
  assert.equal(h.writes.filter(write => write.field === 'sections').length, 1);
});
