/* Offline quick-template UI regressions. No paid generation, save or provider calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function loadTs(relative, mocks = {}) {
  const module = { exports: {} };
  const text = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: name => mocks[name] || require(name) });
  return module.exports;
}
const { QUICK_START_TEMPLATES } = loadTs('src/lib/voice/quick-start-templates.ts');
const { buildVoicePromptFromAttributes } = loadTs('src/lib/voice-dna-scrubber.ts', { '@supabase/supabase-js': {} });

const source = fs.readFileSync(path.join(__dirname, '../src/app/(app)/voice-lab/page.tsx'), 'utf8');
const file = ts.createSourceFile('voice-lab.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler, navigation, templateFieldset;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'loadQuickStartTemplate') handler = node.initializer;
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect'
    && node.arguments[0].getText(file).includes('designer.scrollIntoView')) navigation = node.arguments[0];
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'fieldset'
    && node.getText(file).includes('loadQuickStartTemplate')) templateFieldset = node;
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(handler && navigation && templateFieldset);
function evaluate(node, globals) {
  const module = { exports: {} };
  const js = ts.transpileModule(`module.exports = ${node.getText(file)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(js, { module, ...globals });
  return module.exports;
}
function fixture(generating = false) {
  const state = {
    LoadedVoiceId: 'old-saved-voice', LoadedVoiceAudioUrl: 'old-saved-sample', LastSavedDna: 'old-code',
    DemoAudioUrl: 'old-A', DemoAudioUrlB: 'old-B', SelectedVocalVersion: 'B', IsDemoPlaying: true,
    DemoProgress: 70, DemoGenerateStep: 3, VoiceType: 'blend', ActiveTab: 'explore', QuickStartNavigationRequest: 0,
  };
  const calls = { pause: 0, stop: 0, clears: [] };
  const unexpected = () => assert.fail('Quick settings must not generate or save');
  const globals = {
    QUICK_START_TEMPLATES,
    isDemoGenerating: generating, selectedGenre: 'ballad',
    demoAudioRef: { current: { pause() { calls.pause += 1; } } },
    demoTimersRef: { current: ['old-timer-a', 'old-timer-b'] },
    stopExploreVoiceDemo() { calls.stop += 1; },
    clearTimeout(id) { calls.clears.push(id); },
    fetch: unexpected, handleGenerateDemo: unexpected, addVoice: unexpected, updateVoice: unexpected,
    supabase: { from: unexpected }, localStorage: { setItem: unexpected },
  };
  function setters(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^set[A-Z]/.test(node.expression.text)) {
      const name = node.expression.text.slice(3);
      globals[node.expression.text] = value => { state[name] = typeof value === 'function' ? value(state[name]) : value; };
    }
    ts.forEachChild(node, setters);
  }
  setters(handler);
  return { state, calls, globals, click: evaluate(handler, globals) };
}
const templates = [
  ['whisperer', 'Warm Lofi Whisperer', 'female', 'ballad'],
  ['belter', 'Steel Heavy Belter', 'male', 'rock'],
  ['diva', 'Crystal Pop Diva', 'female', 'pop'],
  ['baritone', 'Midnight Velvet Baritone', 'male', 'jazz'],
  ['soul', 'Golden Retro Soul', 'female', 'rnb'],
  ['indie', 'Indie Acoustic Breeze', 'female', 'acoustic'],
  ['hiphop', 'Street Lyricist Rap', 'male', 'hiphop'],
  ['dance', 'Neon Electro Diva', 'female', 'dance'],
];
for (const [template, name, gender, genre] of templates) test(`${template} loads design settings and clears unrelated saved identity/sample`, () => {
  const f = fixture();
  f.click(template);
  assert.equal(f.state.StageName, name);
  assert.equal(f.state.Gender, gender);
  assert.equal(f.state.SelectedGenre, genre);
  assert.equal(f.state.ActiveTab, 'design');
  assert.equal(f.state.VoiceType, 'default');
  for (const name of ['LoadedVoiceId', 'LoadedVoiceAudioUrl', 'LastSavedDna', 'DemoAudioUrl', 'DemoAudioUrlB']) assert.equal(f.state[name], null);
  assert.equal(f.state.SelectedVocalVersion, 'A');
  assert.equal(f.state.IsDemoPlaying, false);
  assert.equal(f.state.DemoProgress, 0);
  assert.equal(f.state.DemoGenerateStep, 0);
  assert.equal(f.globals.demoAudioRef.current, null);
  assert.equal(f.globals.demoTimersRef.current.length, 0);
  assert.equal(f.calls.pause, 1);
  assert.equal(f.calls.stop, 1);
  assert.equal(f.calls.clears.length, 2);
  assert.equal(f.state.QuickStartStatus, '설정 적용됨 → 조절 → 스타일 저장 → 스튜디오 선택');
  assert.equal(f.state.QuickStartNavigationRequest, 1);
  f.click(template);
  assert.equal(f.state.QuickStartNavigationRequest, 2, 'Repeated selection must request navigation again');
});

test('all template switches preserve an active generation and its polling/playback', () => {
  for (const [template] of templates) {
    const f = fixture(true);
    const before = structuredClone(f.state);
    f.click(template);
    assert.deepEqual(f.state, before);
    assert.equal(f.calls.stop, 0);
    assert.equal(f.calls.pause, 0);
    assert.equal(f.calls.clears.length, 0);
    assert.equal(f.globals.demoTimersRef.current.length, 2);
  }
  const disabled = templateFieldset.openingElement.attributes.properties.find(attribute => attribute.name?.getText(file) === 'disabled');
  assert.equal(disabled.initializer.expression.getText(file), 'isDemoGenerating');
  assert.equal((templateFieldset.getText(file).match(/onClick=/g) || []).length, 8);
});

test('selection navigates after design DOM mounts and focuses without double scrolling', () => {
  const calls = [];
  const globals = {
    quickStartNavigationRequest: 1, activeTab: 'design',
    designerRegionRef: { current: {
      focus(options) { calls.push(['focus', options.preventScroll]); },
      scrollIntoView(options) { calls.push(['scroll', options.behavior, options.block]); },
    } },
  };
  evaluate(navigation, globals)();
  assert.deepEqual(calls, [['focus', true], ['scroll', 'smooth', 'start']]);
  calls.length = 0;
  evaluate(navigation, { ...globals, activeTab: 'explore' })();
  evaluate(navigation, { ...globals, quickStartNavigationRequest: 0 })();
  assert.deepEqual(calls, []);
});

function named(name) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) found = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(found, name);
  return found;
}
function recipeGlobals(key) {
  const t = QUICK_START_TEMPLATES[key], p = t.physical_layers, f = t.performance;
  const globals = {
    QUICK_START_TEMPLATES, activeQuickStart: key, gender: p.gender, age: p.age, pitch: p.pitch,
    brightness: p.brightness, chestResonance: p.chest, headResonance: p.head, weight: p.weight,
    power: f.power, dynamics: f.dynamics, vibrato: f.vibrato, groove: f.groove,
    selectedTextures: [...t.textures], selectedEmotions: [...t.emotions], selectedReverb: t.reverb,
    noiseEntropy: t.noise_entropy, language: 'ja', selectedGenre: t.genre,
  };
  globals.buildCurrentVoiceDna = evaluate(named('buildCurrentVoiceDna'), globals);
  return globals;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('all eight recipes compile actual age, weight and every performance control identically for preview/save', () => {
  for (const [key] of templates) {
    const t = QUICK_START_TEMPLATES[key], g = recipeGlobals(key);
    const preview = g.buildCurrentVoiceDna('VD-DEMO', 'Demo'), saved = g.buildCurrentVoiceDna('VD-SAVED', 'Saved');
    assert.deepEqual(plain(preview.physical_layers), plain(t.physical_layers));
    assert.deepEqual(plain(preview.performance), plain(t.performance));
    assert.equal(preview.delivery, t.delivery);
    assert.equal(preview.language, 'ja');
    assert.equal(buildVoicePromptFromAttributes(preview).tags, buildVoicePromptFromAttributes(saved).tags);
    assert.equal(evaluate(named('getActiveQuickStart'), { ...g, selectedGenre: 'ballad' })(), key);
    assert.equal(evaluate(named('getActiveQuickStart'), { ...g, weight: g.weight + 1 })(), null);
  }
});

test('save uses compiled recipe and selected language, never unrelated source/test audio', () => {
  for (const matching of [false, true]) {
    const g = recipeGlobals('soul'), added = [], inserts = [], cache = [];
    let studioGender;
    Object.assign(g, {
      stageName: 'Golden Retro Soul', loadedVoiceId: null, canOverwriteLoadedVoice: false, voices: [], customVoices: [],
      buildVoicePromptFromAttributes, currentDesignSignature: 'current-recipe',
      demoCompletedSignatureRef: { current: matching ? 'current-recipe' : 'old-recipe' },
      demoAudioUrl: 'https://fixture.invalid/generated-A', demoAudioUrlB: 'https://fixture.invalid/generated-B',
      selectedVocalVersion: 'B', loadedVoiceAudioUrl: 'UNRELATED_TEST_SOURCE', voiceLanguageName: 'Japanese',
      currentUser: { id: 'owner' },
      addVoice(value) { added.push(value); }, updateVoice() { assert.fail('Unexpected overwrite'); },
      setStudioGender(value) { studioGender = value; }, setActiveVoice() {},
      setCustomVoices() {}, setCustomPage() {}, setLastSavedDna() {},
      localStorage: { setItem(_key, value) { cache.push(JSON.parse(value)); } },
      supabase: { from() { return { insert(value) { inserts.push(value); return Promise.resolve({ error: null }); } }; } },
    });
    evaluate(named('handleSaveDna'), g)();
    assert.equal(added[0].stylePrompt, buildVoicePromptFromAttributes(g.buildCurrentVoiceDna('another', 'another')).tags);
    assert.equal(added[0].language, 'Japanese');
    assert.equal(added[0].physicalLayers.weight, g.weight);
    assert.equal(studioGender, 'female');
    assert.equal(added[0].audioUrl, matching ? 'https://fixture.invalid/generated-B' : '');
    assert.equal(added[0].sampleVersion, matching ? 'B' : 'A');
    assert.equal(added[0].designAttributes.audio_url, undefined);
    assert.equal(JSON.stringify(cache).includes('UNRELATED_TEST_SOURCE'), false);
    assert.deepEqual(plain(inserts[0].performance), plain(QUICK_START_TEMPLATES.soul.performance));
    assert.equal(inserts[0].physical_layers.weight, g.weight);
  }
});

test('explicit demo action submits a private 30-second request containing the shared real recipe', async () => {
  const g = recipeGlobals('diva'), requests = [], timers = [];
  Object.assign(g, {
    isDemoGenerating: false, demoRequestRef: { current: 0 }, demoCompletedSignatureRef: { current: null },
    currentDesignSignature: 'diva-recipe', demoAudioRef: { current: null }, demoTimersRef: { current: [] },
    buildVoicePromptFromAttributes, stageName: 'Crystal Pop Diva', voiceLanguageName: 'Japanese', lyricIndex: 0,
    DEMO_LYRICS: { ja: { female: { pop: ['fixture lyrics'] } } },
    clearTimeout() {}, setTimeout(run) { timers.push(run); return timers.length; }, alert() { assert.fail('Unexpected error'); },
    async fetch(url, init) { requests.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ success: true, track: { id: 'generation' } }) }; },
  });
  const demo = named('handleGenerateDemo');
  function setters(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^set[A-Z]/.test(node.expression.text) && node.expression.text !== 'setTimeout') g[node.expression.text] = () => {};
    ts.forEachChild(node, setters);
  }
  setters(demo);
  await evaluate(demo, g)();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/generate');
  assert.equal(requests[0].body.isPublic, false);
  assert.equal(requests[0].body.metadata.durationSeconds, 30);
  assert.equal(requests[0].body.isInstrumental, false);
  assert.ok(requests[0].body.stylePrompt.includes(buildVoicePromptFromAttributes(g.buildCurrentVoiceDna('saved', 'saved')).tags));
  assert.equal(timers.length, 1);
});

test('missing actual sample never creates oscillator audio or paid requests', () => {
  let notice;
  evaluate(named('playCurrentDesignedVoicePreview'), {
    explorePlaying: false, explorePlayingVoiceId: null, selectedVocalVersion: 'A', demoAudioUrl: null,
    setVoicePreviewNotice(value) { notice = value; }, playExploreVoiceDemo() { assert.fail('No sample exists'); },
  })();
  assert.match(notice, /실제 보컬 샘플/);
  assert.doesNotMatch(source, /createOscillator|createBiquadFilter|playVoiceSyntheticDemo/);
});

test('all recipe changes invalidate both samples without cancelling accepted generation polling', () => {
  let reset;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect'
      && node.arguments[0].getText(file).includes('demoCompletedSignatureRef.current = null')) reset = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(file);
  const values = {}, g = {
    demoAudioRef: { current: { pause() {} } }, exploreAudioRef: { current: { pause() {} } },
    demoCompletedSignatureRef: { current: 'old' },
    clearTimeout() { assert.fail('Accepted job polling must continue'); },
    setIsDemoGenerating() { assert.fail('Accepted job must remain active'); },
  };
  function setters(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^set[A-Z]/.test(node.expression.text)) {
      g[node.expression.text] = value => { values[node.expression.text] = value; };
    }
    ts.forEachChild(node, setters);
  }
  setters(reset);
  evaluate(reset, g)();
  assert.equal(values.setDemoAudioUrl, null);
  assert.equal(values.setDemoAudioUrlB, null);
  assert.equal(values.setLoadedVoiceAudioUrl, null);
  assert.equal(g.demoCompletedSignatureRef.current, null);
  assert.equal(values.setSelectedVocalVersion, 'A');
});

test('zero-valued saved controls and actual age restore without replacing them with defaults', () => {
  const values = {}, g = {
    isDemoGenerating: false, stopExploreVoiceDemo() {},
    demoCompletedSignatureRef: { current: 'old' }, selectedGenre: 'pop',
  };
  const loader = named('loadPresetToSliders');
  function setters(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^set[A-Z]/.test(node.expression.text)) g[node.expression.text] = value => { values[node.expression.text] = value; };
    ts.forEachChild(node, setters);
  }
  setters(loader);
  evaluate(loader, g)({
    name: 'Zero', physical_layers: { gender: 'male', age: 'mature', pitch: 0, brightness: 0, chest: 0, head: 0, weight: 0 },
    performance: { power: 0, dynamics: 0, vibrato: 0, groove: 0 }, noise_entropy: 0,
    textures: [], emotions: [], reverb: 'Studio', language: 'ja', preview_genre: 'jazz',
  });
  for (const name of ['Pitch', 'Brightness', 'ChestResonance', 'HeadResonance', 'Weight', 'Power', 'Dynamics', 'Vibrato', 'Groove', 'NoiseEntropy']) assert.equal(values['set' + name], 0);
  assert.equal(values.setAge, 'mature');
  assert.equal(values.setLanguage, 'ja');
  assert.equal(values.setSelectedGenre, 'jazz');
});

test('late playback promises and old sample events cannot control a newer sample', async () => {
  const audios = [], playing = [], g = {
    exploreAudioRef: { current: null }, setVoicePreviewNotice() {}, setExplorePlaying(value) { playing.push(value); },
    setExplorePlayingVoiceId() {}, setExploreProgress() {},
    Audio: class {
      constructor(url) { this.url = url; this.duration = 30; this.currentTime = 1; this.pauses = 0; audios.push(this); }
      pause() { this.pauses += 1; }
      play() { return new Promise(resolve => { this.resolve = resolve; }); }
    },
  };
  g.stopExploreVoiceDemo = evaluate(named('stopExploreVoiceDemo'), g);
  const play = evaluate(named('playExploreVoiceDemo'), g);
  play({ id: 'old', audioUrl: 'https://fixture.invalid/old' });
  const oldEnded = audios[0].onended;
  play({ id: 'new', audioUrl: 'https://fixture.invalid/new' });
  assert.equal(audios[0].onended, null);
  oldEnded();
  assert.equal(audios[1].pauses, 0);
  audios[0].resolve();
  await Promise.resolve();
  assert.equal(playing.includes(true), false);
  audios[1].resolve();
  await Promise.resolve();
  assert.equal(playing.at(-1), true);
});
