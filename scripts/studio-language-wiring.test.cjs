const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, dependencies = {}, fetch = () => { throw new Error('Unexpected request'); }) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('module', 'exports', 'require', 'fetch', 'alert', code)(module, module.exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, fetch, message => { throw new Error(message); });
  return module.exports;
}

const selection = load('src/lib/voice/studio-selection.ts');
const noop = () => {};
const jsx = (type, props) => ({ type, props });
function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(node => elements(node, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree && typeof tree === 'object' ? text(tree.props?.children) : String(tree ?? '');
}

// Run real component handlers with retained hook state and offline network stubs.
// Parent background effects are omitted; LyricsBuilder's eligibility effect is run.
function harness(name, { runEffects = false, props = {}, context = {} } = {}) {
  const hooks = [], effects = [], requests = [];
  let cursor = 0;
  const voiceContext = { studioGender: 'female', activeVoice: null, setStudioGender: gender => { voiceContext.studioGender = gender; }, ...context };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { current: initial };
      return hooks[index];
    },
    useMemo(calculate) { return calculate(); },
    useEffect(effect) { if (runEffects) effects.push(effect); },
  };
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    'framer-motion': { motion: { div: 'motion.div', button: 'motion.button' }, AnimatePresence: 'AnimatePresence' },
    'next/navigation': { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() },
    '@/contexts/VoiceContext': { useVoice: () => voiceContext },
    '@/lib/voice/studio-selection': selection,
    '@/lib/suno-models': { SUNO_VERSIONS: ['v6'], currentSunoVersion: () => 'v6' },
    '@/data/categories': { categories: [], SINGLE_SELECT_CATEGORIES: [] },
    '@/data/presets': { presets: [] },
    '@/hooks/useAuth': { useAuth: () => ({ user: null }) },
    '@/hooks/useHistory': { useHistory: () => ({ saveHistory: noop }) },
    '@/lib/prompt-compositor': { composeStylePrompt: () => ({ prompt: '' }), enforceSingleSelect: value => value, resolveRotationPrompt: value => value },
    '@/lib/supabase': { supabase: {} },
    '@/components/voice/StudioVoicePicker': { StudioVoicePicker: 'StudioVoicePicker' },
  };
  for (const child of ['GenreSelector', 'CategorySection', 'LyricsBuilder', 'PresetGrid', 'PromptOutput', 'CreatePresetModal', 'ProPaywallModal']) dependencies[`./${child}`] = { default: child };
  const Component = load(`src/components/prompt-builder/${name}.tsx`, dependencies, async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ success: true, title: 'Generated', sections: [{ id: 'verse', type: 'verse', content: 'Generated lyric' }] }) };
  }).default;
  function render(next = {}) {
    Object.assign(props, next);
    cursor = 0;
    const tree = Component(props);
    effects.splice(0).forEach(effect => effect());
    return tree;
  }
  return { render, requests, context: voiceContext };
}

function lyricProps(overrides = {}) {
  return {
    isInstrumental: false, stylePrompt: 'Jazz', isPlaylistMode: false, trackCount: 2, engine: 'suno_v5',
    title: '', youtubeTags: '', snsHashtags: '', sections: [], tracks: [], activeTrackIdx: 0,
    playlistTitle: '', playlistDescription: '', playlistYoutubeTags: '', playlistSnsHashtags: '',
    ...Object.fromEntries(['InstrumentalToggle', 'PlaylistModeToggle', 'TrackCountChange', 'TitleChange', 'TagsChange', 'SectionsChange', 'PlaylistTitleChange', 'PlaylistDescriptionChange', 'PlaylistTagsChange', 'TracksChange', 'ActiveTrackIdxChange'].map(name => [`on${name}`, noop])),
    ...overrides,
  };
}

test('controlled lyric language drives the selector, picker, lyric request, and stale voice reset', async () => {
  const changes = [], codes = [];
  const activeVoice = { id: 'korean-female', gender: 'female', language: 'ko', stylePrompt: 'Soft' };
  const h = harness('LyricsBuilder', { runEffects: true, context: { activeVoice }, props: lyricProps({ lyricLanguage: 'ko', selectedVdCode: activeVoice.id, onLyricLanguageChange: value => changes.push(value), onSelectedVdCodeChange: value => codes.push(value) }) });
  let tree = h.render();
  const languageSelect = () => elements(tree, node => node.type === 'select')[0];
  languageSelect().props.onChange({ target: { value: 'it' } });
  assert.deepEqual(changes, ['it']);
  tree = h.render({ lyricLanguage: 'it' });
  assert.equal(languageSelect().props.value, 'it');
  assert.equal(elements(tree, node => node.type === 'StudioVoicePicker')[0].props.language, 'it');
  assert.deepEqual(codes, ['auto']);
  await elements(tree, node => node.type === 'button' && text(node).includes('전체 가사 생성'))[0].props.onClick();
  assert.equal(h.requests[0].body.language, 'it');
  h.context.activeVoice = { ...activeVoice, id: 'italian-female', language: 'it' };
  h.render({ selectedVdCode: 'auto' });
  assert.equal(codes.at(-1), 'italian-female');
  h.context.studioGender = 'duet';
  h.render({ selectedVdCode: 'italian-female' });
  assert.equal(codes.at(-1), 'auto');
});

test('uncontrolled legacy and Japan callers retain local language defaults and Japan restrictions', () => {
  for (const isJapanCampaign of [false, true]) {
    const h = harness('LyricsBuilder', { props: lyricProps({ isJapanCampaign }) });
    let tree = h.render();
    const select = elements(tree, node => node.type === 'select')[0];
    assert.equal(select.props.value, isJapanCampaign ? 'ja' : 'ko');
    if (isJapanCampaign) assert.deepEqual(elements(select, node => node.type === 'option').map(node => node.props.value), ['en', 'ja', 'ja-en']);
    select.props.onChange({ target: { value: isJapanCampaign ? 'ja-en' : 'hi' } });
    tree = h.render();
    assert.equal(elements(tree, node => node.type === 'StudioVoicePicker')[0].props.language, isJapanCampaign ? 'ja-en' : 'hi');
  }
});

for (const name of ['PromptBuilder', 'PresetStudioBuilder']) {
  test(`${name} keeps chosen language through both layouts and automatic lyric/music requests`, async () => {
    const voice = { id: 'french-female', gender: 'female', language: 'fr', stylePrompt: 'French voice' };
    const h = harness(name, { props: { isDrawerMode: true }, context: { activeVoice: voice } });
    const output = tree => elements(tree, node => node.type === 'PromptOutput')[0].props;
    let result = output(h.render());
    assert.equal(result.lyricsBuilderNode.props.lyricLanguage, 'ko');
    result.lyricsBuilderNode.props.onLyricLanguageChange('fr');
    result.onStylePromptChange('Japanese city pop');
    result = output(h.render({ isDrawerMode: false }));
    assert.equal(result.lyricsBuilderNode.props.lyricLanguage, 'fr');
    await result.onGenerate();
    assert.deepEqual(h.requests.map(request => request.url), ['/api/lyrics/generate', '/api/generate']);
    assert.equal(h.requests[0].body.language, 'fr');
    assert.equal(h.requests[1].body.lyricsLanguage, 'fr');
    assert.equal(h.requests[1].body.activeVoice.id, voice.id);
    assert.equal(h.requests[1].body.voicePrompt, voice.stylePrompt);

    // Change language while a previous language's active voice is still in context.
    result = output(h.render({ isDrawerMode: true }));
    result.lyricsBuilderNode.props.onLyricLanguageChange('hi');
    result.lyricsBuilderNode.props.onPlaylistModeToggle(true);
    result.lyricsBuilderNode.props.onTracksChange([{ title: 'Track', sections: [{ id: 'verse', type: 'verse', content: 'Lyric' }] }]);
    result = output(h.render());
    await result.onGenerate();
    const playlistRequest = h.requests.at(-1).body;
    assert.equal(playlistRequest.lyricsLanguage, 'hi');
    assert.equal(playlistRequest.activeVoice, null);
    assert.equal(playlistRequest.voicePrompt, undefined);
    assert.equal(playlistRequest.vdCode, undefined);
  });
}
