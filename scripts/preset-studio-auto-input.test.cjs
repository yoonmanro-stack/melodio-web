/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node regression harness is CommonJS. */
/** Execute the shipped builder handlers offline; never contact providers or a database. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const policy = require('../worker/lyrics-policy');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const applicationModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/preset-application.ts'), 'utf8')),
  { module: applicationModule, exports: applicationModule.exports });
const application = applicationModule.exports;
const section = { id: 'generated-verse', type: 'verse', content: 'I follow the light beside the river', description: '' };
const imagePreset = { name: 'Image inspired river', desc: 'A quiet reunion beside the river', emoji: '🌿', gradient: '',
  customPrompt: 'original acoustic pop, female vocal, 112 BPM', metadata: { thumbnail_url: 'https://offline.test/river.png' } };

function handler(source, name) {
  const ast = ts.createSourceFile('Builder.tsx', source, ts.ScriptTarget.Latest, true);
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) result = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, `Missing actual ${name} handler`);
  return result;
}

function harness(builder, overrides = {}) {
  const source = fs.readFileSync(path.join(root, `src/components/prompt-builder/${builder}.tsx`), 'utf8');
  const requests = [], alerts = [];
  const context = {
    ...application, compileLyricsSections: policy.compileLyricsSections,
    selections: {}, lyricsSections: [], isInstrumental: false, isPlaylistMode: false, tracks: [], engine: 'auto', trackCount: 2,
    playlistTitle: '', playlistDescription: '', playlistYoutubeTags: '', playlistSnsHashtags: '', activeTrackIdx: 0,
    selectedVdCode: 'auto', vdOptions: [], LyricsBuilder: 'LyricsBuilder', handleTrackCountChange() {},
    sunoVersion: 'v6', title: '', autoTitle: true, autoTopic: true, lyricsTopic: '', lyricsLanguage: 'ko',
    youtubeTags: '', snsHashtags: '', stylePrompt: '', excludePrompt: '', selectedPresetId: '', selectedPresetName: '',
    selectedStudioPreset: null, editingPreset: null, customPresets: [], publicPresetCatalog: [],
    sourceMenu: 'preset-studio', user: null, isPublic: false, isAsmrEnabled: false,
    studioVoiceFields: { vocalGender: 'female', activeVoice: null, lyricsLanguage: 'ko' },
    artistSettings: {}, artistState: { getError: () => '', requestFields: {}, artistVoice: null },
    appliedPresetPromptRef: { current: '' }, isApplyingPresetRef: { current: false },
    searchParams: { get: () => null }, getPresetStudioProfile: () => null,
    findStudioPreset: (id, custom, catalog) => [...custom, ...catalog].find(preset => preset.id === id),
    composeStylePrompt: () => ({ prompt: '' }), resolveRotationPrompt: value => value,
    fitPresetStudioStyleBudget: value => value, autoSelectEngine: () => 'suno_v5',
    buildLyricsPrompt: sections => policy.compileLyricsSections(sections).lyricsPrompt,
    localStorage: { setItem() {} }, setTimeout() {}, alert: message => alerts.push(message),
    console: { error() {} }, ...overrides,
  };
  const stateFields = { Selections: 'selections', StylePrompt: 'stylePrompt', ExcludePrompt: 'excludePrompt',
    SelectedPresetId: 'selectedPresetId', SelectedPresetName: 'selectedPresetName', IsInstrumental: 'isInstrumental',
    LyricsSections: 'lyricsSections', Title: 'title', YoutubeTags: 'youtubeTags', SnsHashtags: 'snsHashtags',
    CustomPresets: 'customPresets', EditingPreset: 'editingPreset', IsCreatePresetOpen: 'isCreatePresetOpen',
    DynamicElements: 'dynamicElements', AmbienceVolume: 'ambienceVolume', IsAsmrEnabled: 'isAsmrEnabled',
    IsGenerating: 'isGenerating', GenModalState: 'genModalState', GenErrorMsg: 'genErrorMsg',
    AutoTitle: 'autoTitle', AutoTopic: 'autoTopic', LyricsTopic: 'lyricsTopic', LyricsLanguage: 'lyricsLanguage',
    IsPlaylistMode: 'isPlaylistMode', PlaylistTitle: 'playlistTitle', PlaylistDescription: 'playlistDescription',
    PlaylistYoutubeTags: 'playlistYoutubeTags', PlaylistSnsHashtags: 'playlistSnsHashtags', Tracks: 'tracks',
    ActiveTrackIdx: 'activeTrackIdx', SelectedVdCode: 'selectedVdCode',
  };
  for (const [name, key] of Object.entries(stateFields)) context[`set${name}`] = value => {
    context[key] = value;
    if (name === 'SelectedPresetId' || name === 'CustomPresets') {
      context.selectedStudioPreset = context.findStudioPreset(context.selectedPresetId, context.customPresets, context.publicPresetCatalog) || null;
    }
  };
  context.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (url === '/api/lyrics/generate') return { ok: true, json: async () => ({ success: true, title: 'Generated title', sections: [section] }) };
    assert.equal(url, '/api/generate');
    assert.ok(requests.at(-1).body.stylePrompt.trim(), 'music submission requires the applied style');
    return { ok: true, json: async () => ({ success: true }) };
  };
  vm.createContext(context);
  for (const name of ['handlePresetApply', 'handleSaveCustomPreset', 'handleGenerate']) {
    vm.runInContext(compile(`globalThis.${name} = ${handler(source, name)}`), context);
  }
  const ast = ts.createSourceFile('Builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lyricsNodes = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'LyricsBuilder') lyricsNodes.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  context.require = name => {
    assert.equal(name, 'react/jsx-runtime');
    return { jsx: (type, props) => ({ type, props }) };
  };
  const childProps = index => {
    context.exports = {};
    vm.runInContext(`(() => { ${compile(`exports.getNode = () => (${lyricsNodes[index]})`)} })()`, context);
    return context.exports.getNode().props;
  };
  return { source, context, requests, alerts, apply: preset => {
    context.customPresets = [preset, ...context.customPresets.filter(saved => saved.id !== preset.id)];
    return context.handlePresetApply(preset);
  },
    save: data => context.handleSaveCustomPreset(data), generate: () => context.handleGenerate(), childProps,
    childCount: lyricsNodes.length };
}

function childHarness(props) {
  const jsx = (type, props) => ({ type, props });
  const hooks = []; let cursor = 0;
  const mod = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/components/prompt-builder/LyricsBuilder.tsx'), 'utf8')), {
    module: mod, exports: mod.exports,
    require(name) {
      if (name === 'react') return {
        useState(initial) { const index = cursor++; if (!hooks[index]) hooks[index] = { value: initial };
          return [hooks[index].value, value => { hooks[index].value = value; }]; },
        useRef(initial) { const index = cursor++; return hooks[index] || (hooks[index] = { current: initial }); },
        useEffect() {}, useLayoutEffect() {},
      };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name === '@/contexts/VoiceContext') return { useVoice: () => ({ activeVoice: null, studioGender: 'female', setStudioGender() {} }) };
      if (name === '@/lib/voice/studio-selection') return { matchesStudioVoice: () => false };
      if (name === '@/lib/preset-studio-profile') return { isPresetStudioSource: () => false, getPresetStudioProfile: () => null };
      if (name === '@/components/voice/StudioVoicePicker') return { StudioVoicePicker: 'StudioVoicePicker' };
      throw new Error(`Unmocked dependency: ${name}`);
    },
  });
  function walk(node, predicate) {
    if (Array.isArray(node)) return node.flatMap(item => walk(item, predicate));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
  }
  const content = node => Array.isArray(node) ? node.map(content).join('')
    : node && typeof node === 'object' ? content(node.props?.children) : String(node ?? '');
  const render = next => { cursor = 0; return mod.exports.default(next || props); };
  return { render, toggle(tree, text) { const buttons = walk(tree, node => node.type === 'button' && content(node).includes(text));
    assert.equal(buttons.length, 1); buttons[0].props.onClick(); },
    input(tree, value) { const inputs = walk(tree, node => node.type === 'input' && node.props.value === value && Object.hasOwn(node.props, 'disabled')); assert.equal(inputs.length, 1); return inputs[0]; } };
}

for (const builder of ['PresetStudioBuilder', 'PromptBuilder']) {
  test(`${builder}: both rendered layouts share actual title/topic toggle and field changes with the full handler`, async () => {
    const h = harness(builder);
    await h.apply({ ...imagePreset, id: 'custom-image' });
    assert.equal(h.childCount, 2);
    for (let index = 0; index < h.childCount; index++) {
      h.context.autoTitle = true; h.context.autoTopic = true; h.context.title = ''; h.context.lyricsTopic = '';
      const child = childHarness(h.childProps(index));
      let tree = child.render();
      child.toggle(tree, 'AI 자동 작명'); child.toggle(tree, 'AI 자동 기획');
      assert.equal(h.context.autoTitle, false); assert.equal(h.context.autoTopic, false);
      tree = child.render(h.childProps(index));
      const inputs = h.childProps(index);
      assert.equal(inputs.autoTitle, false); assert.equal(inputs.autoTopic, false);
      inputs.onTitleChange('Title from the visible manual field');
      inputs.onLyricTopicChange('Topic from the visible manual field');
      tree = child.render(h.childProps(index));
      const title = child.input(tree, h.context.title), topic = child.input(tree, h.context.lyricsTopic);
      assert.equal(title.props.disabled, false); assert.equal(topic.props.disabled, false);
      title.props.onChange({ target: { value: 'My visible title' } });
      topic.props.onChange({ target: { value: 'My visible story' } });
      await h.generate();
      assert.equal(h.requests.at(-2).body.topic, 'My visible story');
      assert.equal(h.requests.at(-1).body.title, 'My visible title');
      tree = child.render(h.childProps(index));
      child.toggle(tree, 'AI 자동 작명'); child.toggle(tree, 'AI 자동 기획');
      assert.equal(h.context.title, ''); assert.equal(h.context.lyricsTopic, '');
      assert.equal(h.context.autoTitle, true); assert.equal(h.context.autoTopic, true);
      await h.generate();
      assert.equal(h.requests.at(-2).body.topic, imagePreset.desc);
      assert.equal(h.requests.at(-1).body.title, 'Generated title');
    }
  });

  test(`${builder}: saving an image preset applies its required music style before automatic vocal generation`, async () => {
    const h = harness(builder);
    h.save(imagePreset);
    assert.equal(h.context.stylePrompt, imagePreset.customPrompt);
    assert.match(h.context.selectedPresetId, /^custom-/);
    await h.generate();
    assert.deepEqual(h.requests.map(request => request.url), ['/api/lyrics/generate', '/api/generate']);
    assert.equal(h.requests[0].body.topic, imagePreset.desc);
    assert.equal(h.requests[1].body.title, 'Generated title');
    assert.equal(h.requests[1].body.stylePrompt, imagePreset.customPrompt);
    assert.equal(h.context.genModalState, 'success');
  });

  test(`${builder}: saving an active preset edit applies its updated catalog entry immediately`, async () => {
    const h = harness(builder);
    await h.apply({ ...imagePreset, id: 'custom-image', metadata: { cached_optimized_prompt: 'old optimized style' } });
    h.save({ ...imagePreset, id: 'custom-image', desc: 'An edited reunion story', customPrompt: 'edited acoustic pop, female vocal, 112 BPM' });
    assert.equal(h.context.stylePrompt, 'edited acoustic pop, female vocal, 112 BPM');
    assert.equal(h.context.selectedPresetId, 'custom-image');
    await h.generate();
    assert.equal(h.requests[0].body.topic, 'An edited reunion story');
    assert.equal(h.requests[1].body.stylePrompt, 'edited acoustic pop, female vocal, 112 BPM');
  });

  test(`${builder}: editing an unselected preset preserves the current music selection`, async () => {
    const h = harness(builder);
    await h.apply({ ...imagePreset, id: 'custom-active' });
    h.context.customPresets.push({ ...imagePreset, id: 'custom-inactive' });
    h.save({ ...imagePreset, id: 'custom-inactive', customPrompt: 'different edited genre, 97 BPM' });
    assert.equal(h.context.stylePrompt, imagePreset.customPrompt);
    assert.equal(h.context.selectedPresetId, 'custom-active');
  });

  test(`${builder}: an active recipe edit preserves the current manual song inputs`, async () => {
    const h = harness(builder);
    await h.apply({ ...imagePreset, id: 'custom-image', lyricsTemplate: '[Verse]\nOld template words' });
    const authoredSections = [{ ...section, content: 'My own authored words beside the shore' }];
    Object.assign(h.context, { autoTitle: false, autoTopic: false, title: 'My own title', lyricsTopic: 'My own exact story',
      lyricsSections: authoredSections, youtubeTags: 'my-authored-tag', snsHashtags: '#my-authored-tag' });
    h.save({ ...imagePreset, id: 'custom-image', customPrompt: 'edited acoustic pop, female vocal, 112 BPM' });
    assert.equal(h.context.title, 'My own title');
    assert.equal(h.context.lyricsSections, authoredSections);
    assert.equal(h.context.lyricsTopic, 'My own exact story');
    assert.equal(h.context.youtubeTags, 'my-authored-tag');
    assert.equal(h.context.snsHashtags, '#my-authored-tag');
    await h.generate();
    assert.equal(h.requests[0].body.topic, 'My own exact story');
    assert.equal(h.requests[1].body.title, 'My own title');
    assert.equal(h.requests[1].body.stylePrompt, 'edited acoustic pop, female vocal, 112 BPM');
  });

  for (const [autoTitle, autoTopic] of [[true, true], [false, true], [true, false], [false, false]]) {
    test(`${builder}: full vocal handler honors title=${autoTitle ? 'automatic' : 'manual'} and topic=${autoTopic ? 'automatic' : 'manual'}`, async () => {
      const h = harness(builder, { autoTitle, autoTopic, title: autoTitle ? '' : 'My authored title', lyricsTopic: autoTopic ? '' : 'My exact lighthouse reunion' });
      await h.apply({ ...imagePreset, id: 'custom-image' });
      h.context.title = autoTitle ? '' : 'My authored title';
      await h.generate();
      assert.equal(h.requests[0].body.topic, autoTopic ? imagePreset.desc : 'My exact lighthouse reunion');
      assert.equal(h.requests[1].body.title, autoTitle ? 'Generated title' : 'My authored title');
      assert.equal(h.requests[1].body.stylePrompt, imagePreset.customPrompt);
      assert.equal(h.context.genModalState, 'success');
    });
  }

  test(`${builder}: instrumental generation requires neither a vocal title nor a lyric topic`, async () => {
    const h = harness(builder, { autoTitle: false, autoTopic: false });
    await h.apply({ ...imagePreset, id: 'custom-instrumental', customPrompt: 'original acoustic instrumental only, 112 BPM' });
    await h.generate();
    assert.deepEqual(h.requests.map(request => request.url), ['/api/generate']);
    assert.equal(h.requests[0].body.isInstrumental, true);
    assert.equal(h.requests[0].body.lyricsPrompt, '');
    assert.equal(h.context.genModalState, 'success');
  });
}
