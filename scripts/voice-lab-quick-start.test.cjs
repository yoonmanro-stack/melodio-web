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
  vm.runInNewContext(js, { module, exports: module.exports, URL, require: name => mocks[name] || require(name) });
  return module.exports;
}
const { QUICK_START_TEMPLATES } = loadTs('src/lib/voice/quick-start-templates.ts');
const { getSingingSampleUrl } = loadTs('src/lib/voice/singing-sample-url.ts');
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
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require, URL, ...globals });
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
    demoCompletedSignatureRef: { current: "old-recipe" },
    demoGenerationIdRef: { current: "old-a" }, demoGenerationIdBRef: { current: "old-b" },
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
  assert.equal(f.state.StageName, QUICK_START_TEMPLATES[template].displayName);
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
      demoGenerationIdRef: { current: "550e8400-e29b-41d4-a716-446655440000" }, demoGenerationIdBRef: { current: "550e8400-e29b-41d4-a716-446655440001" },
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
    assert.equal(added[0].sampleGenerationId, matching ? g.demoGenerationIdBRef.current : undefined);
    assert.equal(cache[0][0].sample_generation_id, matching ? g.demoGenerationIdRef.current : undefined);
    assert.equal(cache[0][0].sample_generation_id_b, matching ? g.demoGenerationIdBRef.current : undefined);
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
    demoGenerationIdRef: { current: null }, demoGenerationIdBRef: { current: null },
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
    demoGenerationIdRef: { current: 'old-a' }, demoGenerationIdBRef: { current: 'old-b' },
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
    demoCompletedSignatureRef: { current: 'old' }, demoGenerationIdRef: { current: 'old-a' }, demoGenerationIdBRef: { current: 'old-b' }, selectedGenre: 'pop',
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

function playbackFixture() {
  const audios = [], playing = [], values = { voiceId: null, progress: 0, playing: false };
  const g = {
    exploreAudioRef: { current: null }, exploreSampleRef: { current: null }, explorePlayRequestRef: { current: 0 }, exploreVolume: 1,
    setVoicePreviewNotice() {}, setExplorePlaying(value) { playing.push(value); values.playing = value; },
    setExplorePlayingVoiceId(value) { values.voiceId = value; }, setExploreProgress(value) { values.progress = value; },
    Audio: class {
      constructor(url) { this.url = url; this.duration = 60; this.currentTime = 0; this.ended = false; this.pauses = 0; this.playCalls = 0; audios.push(this); }
      pause() { this.pauses += 1; }
      play() { this.playCalls += 1; return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); }
    },
  };
  g.getStoredVoiceSampleUrl = evaluate(named('getStoredVoiceSampleUrl'), { getSingingSampleUrl });
  for (const name of ['getExplorePreviewDuration', 'stopExploreVoiceDemo', 'pauseExploreVoiceDemo', 'resumeExploreVoiceDemo', 'playExploreVoiceDemo', 'seekExploreVoicePreview']) g[name] = evaluate(named(name), g);
  return { g, audios, playing, values };
}

test('late playback promises and old sample events cannot control a newer sample', async () => {
  const { g, audios, playing } = playbackFixture();
  g.playExploreVoiceDemo({ id: 'old', audioUrl: 'https://fixture.invalid/old' });
  const oldEnded = audios[0].onended;
  g.playExploreVoiceDemo({ id: 'new', audioUrl: 'https://fixture.invalid/new' });
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

test('pause preserves the actual sample and position; same voice resumes and pending play cannot undo pause', async () => {
  const { g, audios, values } = playbackFixture();
  const voice = { id: 'saved', audioUrl: 'https://fixture.invalid/sample' };
  g.playExploreVoiceDemo(voice);
  const audio = audios[0];
  audio.currentTime = 12;
  audio.ontimeupdate();
  g.pauseExploreVoiceDemo();
  assert.equal(g.exploreAudioRef.current, audio);
  assert.equal(values.voiceId, 'saved');
  assert.equal(values.progress, 40);
  assert.equal(audio.currentTime, 12);
  audio.resolve();
  await Promise.resolve();
  assert.equal(values.playing, false, 'Late play resolution must not undo a pause');
  g.playExploreVoiceDemo(voice);
  assert.equal(audios.length, 1);
  assert.equal(audio.currentTime, 12);
  assert.equal(audio.playCalls, 2);
  audio.resolve();
  await Promise.resolve();
  assert.equal(values.playing, true);
  g.pauseExploreVoiceDemo();
  g.resumeExploreVoiceDemo();
  assert.equal(audios.length, 1, 'Footer resume reuses the same sample');
  assert.equal(audio.currentTime, 12);
  g.playExploreVoiceDemo({ id: 'next', audioUrl: 'https://fixture.invalid/next' });
  assert.equal(audios.length, 2);
  assert.equal(audio.onended, null);
  assert.equal(values.voiceId, 'next');
  assert.equal(values.progress, 0);
});

test('actual seeking and truthful short duration obey the 30-second cap and clean end reset', () => {
  for (const duration of [27, 60]) {
    const { g, audios, values } = playbackFixture();
    g.playExploreVoiceDemo({ id: 'sample', audioUrl: 'https://fixture.invalid/sample' });
    const audio = audios[0];
    audio.duration = duration;
    const bound = Math.min(duration, 30);
    assert.equal(g.getExplorePreviewDuration(), bound);
    g.seekExploreVoicePreview(50);
    assert.equal(audio.currentTime, bound / 2);
    assert.equal(values.progress, 50);
    g.pauseExploreVoiceDemo();
    assert.equal(audio.currentTime, bound / 2);
    audio.currentTime = bound;
    audio.ontimeupdate();
    assert.equal(g.exploreAudioRef.current, null);
    assert.equal(g.exploreSampleRef.current, null);
    assert.equal(values.voiceId, null);
    assert.equal(values.progress, 0);
    assert.equal(values.playing, false);
    assert.equal(audio.onended, null);
  }
  const { g, audios, values } = playbackFixture();
  g.playExploreVoiceDemo({ id: 'sample', audioUrl: 'https://fixture.invalid/sample' });
  audios[0].onended();
  assert.equal(g.exploreAudioRef.current, null);
  assert.equal(values.voiceId, null);
  assert.equal(values.progress, 0);
  const footer = source.slice(source.indexOf('{/* Saved-sample player'), source.indexOf('{/* Global CSS Styles'));
  assert.match(footer, /createPortal/);
  assert.match(footer, /md:pt-3 md:pb-\[13px\]/);
  assert.match(footer, /pauseExploreVoiceDemo\(\) : resumeExploreVoiceDemo\(\)/);
  assert.match(footer, /seekExploreVoicePreview/);
  assert.match(footer, /exploreAudioRef.current.volume = volume/);
  assert.doesNotMatch(footer, /Shuffle|Previous|Next|Repeat|custom_voice_dnas|melodio.app\//);
});

test('all save actions require a name confirmation and preserve the exact visible name', () => {
  const values = {}, saves = [];
  const g = {
    stageName: QUICK_START_TEMPLATES.belter.displayName,
    setSaveNameInput(value) { values.name = value; }, setSaveNameError(value) { values.error = value; },
    setSaveNameRequest(value) { values.request = value; }, setStageName(value) { values.savedName = value; },
    handleSaveDna(...args) { saves.push(args); },
  };
  const open = evaluate(named('openSaveNameDialog'), g);
  open(true);
  assert.equal(values.name, '파워풀 락 보컬 (Steel Belter)');
  assert.equal(values.request.overwrite, true);
  assert.equal(saves.length, 0);
  const confirm = evaluate(named('confirmSaveName'), { ...g, saveNameInput: '내 락 보컬', saveNameRequest: values.request });
  confirm({ preventDefault() {} });
  assert.deepEqual(saves, [[true, '내 락 보컬']]);
  assert.equal(values.savedName, '내 락 보컬');
  assert.equal(values.request, null);
  evaluate(named('confirmSaveName'), { ...g, saveNameInput: '  ', saveNameRequest: { overwrite: false } })({ preventDefault() {} });
  assert.equal(saves.length, 1);
  assert.match(values.error, /1~80/);
  assert.equal((source.match(/onClick=\{\(\) => openSaveNameDialog\((?:true|false)\)\}/g) || []).length, 3);
  assert.doesNotMatch(source, /onClick=\{\(\) => handleSaveDna/);
  assert.match(source, /<dialog[\s\S]*?aria-labelledby="save-voice-name-title"/);
  assert.match(source, /<label htmlFor="save-voice-name"/);
  assert.doesNotMatch(named('handleSaveDna').getText(file), /\(v2\)|setLastSavedDna\(vdCode\)/);
});

test('saved cards expose one accessible sample control and never play legacy spoken examples', () => {
  const getStoredVoiceSampleUrl = evaluate(named('getStoredVoiceSampleUrl'), { getSingingSampleUrl });
  for (const audioUrl of ['/assets/voices/vd1004.mp3', 'https://melodio.app/assets/voices/vd3802.mp3?v=2', 'https://melodio.app/assets/voices/%76d7705.mp3']) {
    assert.equal(getStoredVoiceSampleUrl({ audioUrl }), null);
  }
  assert.equal(getStoredVoiceSampleUrl({ audio_url: 'https://fixture.invalid/A', audio_url_b: 'https://fixture.invalid/B', sample_version: 'B' }), 'https://fixture.invalid/B');
  const calls = [], render = evaluate(named('renderStoredVoiceSampleControl'), {
    getStoredVoiceSampleUrl, Play() {}, Pause() {}, pauseExploreVoiceDemo() { calls.push('pause'); },
    playExploreVoiceDemo(voice) { calls.push(voice.audioUrl); },
  });
  const missing = render({ name: 'Saved', audioUrl: '/assets/voices/vd1004.mp3' }, false);
  const absentButton = missing;
  assert.equal(absentButton.props.disabled, true);
  assert.equal(absentButton.props['aria-label'], 'Saved 보컬 샘플 없음');
  assert.equal(missing.props.children.props.children, '샘플 없음', 'Missing actual audio must have a visible label');
  assert.equal(render({ name: 'Saved' }, true).props.disabled, true, 'An absent sample must never show a false playing control');
  const ready = render({ name: 'Generated', audioUrl: 'https://fixture.invalid/B', sampleVersion: 'B' }, false);
  ready.props.onClick();
  const playing = render({ name: 'Generated', audioUrl: 'https://fixture.invalid/B' }, true);
  playing.props.onClick();
  assert.match(ready.props.children.props.className, /group-hover\/sample:opacity-100/);
  assert.match(ready.props.children.props.className, /group-focus-visible\/sample:opacity-100/);
  assert.match(ready.props.children.props.className, /pointer:coarse/);
  assert.doesNotMatch(playing.props.children.props.className, /opacity-0/);
  assert.deepEqual(calls, ['https://fixture.invalid/B', 'pause']);
  const collection = source.slice(source.indexOf('{activeTab === "collections" &&'), source.indexOf('{activeTab === "decoder" &&'));
  assert.equal((collection.match(/renderStoredVoiceSampleControl\(voice, isPlaying\)/g) || []).length, 2);
  const thumbnailClasses = [];
  function findThumbnail(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'renderStoredVoiceSampleControl') {
      const parent = node.parent.parent;
      assert.ok(ts.isJsxElement(parent));
      const className = parent.openingElement.attributes.properties.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(file) === 'className');
      thumbnailClasses.push(className?.getText(file));
    }
    ts.forEachChild(node, findThumbnail);
  }
  findThumbnail(file);
  assert.equal(thumbnailClasses.length, 2);
  assert.ok(thumbnailClasses.every(value => /relative w-(?:11|12) h-(?:11|12)/.test(value)), 'Playback must live inside thumbnails, never footer actions');
  assert.doesNotMatch(collection, /playExploreVoiceDemo\(voice\)|signatureVoices|추천 보컬 음색 스타일/);
});

test('completion records independent actual A/B generation IDs only for completed matching samples', async () => {
  for (const bCompleted of [false, true]) {
    const g = recipeGlobals('belter'), timers = [], requests = [], values = {};
    const aId = '550e8400-e29b-41d4-a716-446655440000', bId = '550e8400-e29b-41d4-a716-446655440001';
    Object.assign(g, {
      isDemoGenerating: false, demoRequestRef: { current: 0 }, demoCompletedSignatureRef: { current: null },
      demoGenerationIdRef: { current: 'old-a' }, demoGenerationIdBRef: { current: 'old-b' },
      currentDesignSignature: 'recipe', currentDesignSignatureRef: { current: 'recipe' },
      demoAudioRef: { current: null }, demoTimersRef: { current: [] }, buildVoicePromptFromAttributes,
      stageName: QUICK_START_TEMPLATES.belter.displayName, voiceLanguageName: 'Japanese', lyricIndex: 0,
      DEMO_LYRICS: { ja: { male: { rock: ['fixture lyrics'] } } },
      clearTimeout() {}, setTimeout(run) { timers.push(run); return timers.length; }, alert() { assert.fail('Unexpected error'); },
      async fetch(url) {
        requests.push(url);
        return { ok: true, json: async () => url === '/api/generate' ? { success: true, track: { id: aId } } : {
          generation: { id: aId, status: 'completed', audio_url: 'https://fixture.invalid/A' },
          sibling: { id: bId, status: bCompleted ? 'completed' : 'generating', audio_url: 'https://fixture.invalid/B' },
        } };
      },
    });
    const demo = named('handleGenerateDemo');
    function setters(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^set[A-Z]/.test(node.expression.text) && node.expression.text !== 'setTimeout') g[node.expression.text] = value => { values[node.expression.text] = value; };
      ts.forEachChild(node, setters);
    }
    setters(demo);
    await evaluate(demo, g)();
    assert.equal(g.demoGenerationIdRef.current, null);
    assert.equal(g.demoGenerationIdBRef.current, null);
    await timers[0]();
    assert.equal(g.demoGenerationIdRef.current, aId);
    assert.equal(g.demoGenerationIdBRef.current, bCompleted ? bId : null);
    assert.equal(values.setDemoAudioUrl, 'https://fixture.invalid/A');
    assert.equal(values.setDemoAudioUrlB, bCompleted ? 'https://fixture.invalid/B' : null);
    assert.deepEqual(requests, ['/api/generate', `/api/generations?id=${aId}`]);
  }
});

test('both collections share an always-visible rename action and update only a valid name', () => {
  const original = {
    id: 'saved-voice', name: 'Original', audioUrl: 'https://fixture.invalid/sample',
    sampleGenerationId: '550e8400-e29b-41d4-a716-446655440000', discoveryVoiceId: 'catalog-voice',
  };
  const updates = [], state = {}, g = {
    editingCollectionVoiceId: null, editingCollectionVoiceName: '', editingCollectionVoiceSection: 'created',
    collectionVoiceNameError: null, Edit2() {}, Check() {}, X() {},
    setEditingCollectionVoiceId(value) { state.id = value; },
    setEditingCollectionVoiceName(value) { state.name = value; },
    setEditingCollectionVoiceSection(value) { state.section = value; },
    setCollectionVoiceNameError(value) { state.error = value; },
    updateVoice(id, value) { updates.push([id, plain(value)]); },
  };
  g.beginCollectionVoiceRename = evaluate(named('beginCollectionVoiceRename'), g);
  for (const section of ['created', 'favorites']) {
    const display = evaluate(named('renderCollectionVoiceName'), g)(original, section);
    const pencil = display.props.children[1];
    assert.equal(pencil.props['aria-label'], 'Original 이름 수정');
    assert.doesNotMatch(pencil.props.className, /opacity-0|hidden|group-hover/);
    pencil.props.onClick();
    assert.equal(state.id, original.id);
    assert.equal(state.name, original.name);
    assert.equal(state.section, section);
    assert.equal(updates.length, 0);
    const actions = [];
    const active = { ...g, editingCollectionVoiceId: original.id, editingCollectionVoiceName: 'Alias', editingCollectionVoiceSection: section,
      saveCollectionVoiceRename(id) { actions.push(['save', id]); }, cancelCollectionVoiceRename() { actions.push(['cancel']); } };
    const edit = evaluate(named('renderCollectionVoiceName'), active)(original, section);
    const input = edit.props.children[0].props.children[0];
    assert.equal(input.props.maxLength, 80);
    assert.equal(input.props['aria-label'], 'Original 새 이름');
    input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() {} });
    assert.equal(actions.length, 0, 'IME Enter must finish composition without saving');
    input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() {} });
    input.props.onKeyDown({ key: 'Escape', nativeEvent: { isComposing: false }, preventDefault() {} });
    assert.deepEqual(actions, [['save', original.id], ['cancel']]);
    const other = section === 'created' ? 'favorites' : 'created';
    assert.equal(evaluate(named('renderCollectionVoiceName'), active)(original, other).props.children[1].type, 'button', 'A duplicated voice edits only the selected section');
  }
  for (const name of ['', '   ', 'x'.repeat(81)]) {
    evaluate(named('saveCollectionVoiceRename'), { ...g, editingCollectionVoiceName: name })(original.id);
    assert.equal(updates.length, 0);
    assert.match(state.error, /1~80/);
  }
  evaluate(named('saveCollectionVoiceRename'), { ...g, editingCollectionVoiceName: '  사용자 이름  ' })(original.id);
  assert.deepEqual(updates, [[original.id, { name: '사용자 이름' }]]);
  assert.equal(state.id, null);
  assert.equal(original.audioUrl, 'https://fixture.invalid/sample');
  assert.equal(original.sampleGenerationId, '550e8400-e29b-41d4-a716-446655440000');
  evaluate(named('cancelCollectionVoiceRename'), g)();
  assert.equal(updates.length, 1);
  assert.match(source, /renderCollectionVoiceName\(voice, "created"\)/);
  assert.match(source, /renderCollectionVoiceName\(voice, "favorites"\)/);
});
