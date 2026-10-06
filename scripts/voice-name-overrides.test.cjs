const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file) {
  const module = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(module, module.exports);
  return module.exports;
}
const names = load('src/lib/voice/voice-name-overrides.ts');
const { restoreDesignAttributes } = load('src/lib/voice/restore-design-attributes.ts');
const source = fs.readFileSync('src/contexts/VoiceContext.tsx', 'utf8');
const ast = ts.createSourceFile('VoiceContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = {};
function walk(node) {
  if (ts.isFunctionDeclaration(node) && ['selectableVoice', 'persistCustomVoices', 'registeredVoiceItem'].includes(node.name?.text)) nodes[node.name.text] = node;
  if (ts.isVariableDeclaration(node) && ['updateVoice', 'setActiveVoice', 'saveDiscoveryVoice', 'syncDesignedVoice', 'syncRegisteredVoice'].includes(node.name.getText(ast))) {
    nodes[node.name.getText(ast)] = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0] : node.initializer;
  }
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    const body = node.arguments[0]?.getText(ast) || '';
    if (body.includes('const saved = localStorage.getItem("melodio_user_voices")')) nodes.restore = node.arguments[0];
    if (body.includes('fetch("/api/voice/custom"')) nodes.registeredRefresh = node.arguments[0];
    if (body.includes("fetch('/api/voice/designed'")) nodes.designedRefresh = node.arguments[0];
  }
  ts.forEachChild(node, walk);
}
walk(ast);
function evaluate(node, globals) {
  assert.ok(node, 'Expected actual Context callback');
  const code = ts.transpileModule(`const callback = ${node.getText(ast)};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function('globals', `with(globals){${code};return callback;}`)(globals);
}
const baseline = { id: 'official-veyra', officialVoiceId: 'official-veyra', name: 'Veyra', sourceType: 'default', gender: 'female',
  stylePrompt: 'canonical official prompt', audioUrl: '/assets/voices/official-veyra.mp3', audioUrlB: '/assets/voices/official-veyra-b.mp3',
  tags: [], createdAt: '2026-10-05', isFavorite: true, previewStatus: 'ready' };
const discovered = { id: 'discovery-v2-f-001', discoveryVoiceId: 'discovery-v2-f-001', name: 'Catalog name', sourceType: 'discovered', gender: 'female',
  stylePrompt: 'canonical discovery prompt', audioUrl: '/assets/voices/discovery-v2-20261005/discovery-v2-f-001-A.mp3',
  tags: ['canonical tag'], createdAt: '2026-10-05', isFavorite: true, previewStatus: 'ready', reuseStatus: 'ready' };
const customId = '11111111-1111-4111-8111-111111111111';
const designedId = '22222222-2222-4222-8222-222222222222';
const sampleId = '33333333-3333-4333-8333-333333333333';
function harness(voices = [baseline], storage = new Map()) {
  const state = { voices: structuredClone(voices), active: structuredClone(voices[0] || null) };
  const timers = [], responses = new Map();
  const g = { ...names, restoreDesignAttributes, INITIAL_SYSTEM_VOICES: [structuredClone(baseline)],
    nameOverrides: { current: Object.create(null) }, legacySampleHints: { current: new Map() }, sampleRevisions: { current: new Map() },
    discoveryVoiceItem: id => id === discovered.id ? structuredClone(discovered) : null,
    resolveLegacyGeneratedSample: () => null,
    isGenerationId: value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co' } },
    setVoices: value => { state.voices = typeof value === 'function' ? value(state.voices) : value; },
    setActiveVoiceState: value => { state.active = typeof value === 'function' ? value(state.active) : value; },
    setStudioGender() {}, setStudioGenderState() {}, setVoiceRefresh() {},
    setTimeout: callback => { timers.push(callback); }, isVoiceModalOpen: true, voiceRefresh: 1,
    fetch: async url => { assert.ok(responses.has(url), `Unexpected offline request: ${url}`); return { ok: true, json: async () => responses.get(url) }; },
  };
  Object.defineProperty(g, 'voices', { get: () => state.voices });
  Object.defineProperty(g, 'activeVoice', { get: () => state.active });
  for (const name of ['selectableVoice', 'persistCustomVoices', 'registeredVoiceItem', 'setActiveVoice']) g[name] = evaluate(nodes[name], g);
  return { g, state, storage, responses, run: name => evaluate(nodes[name], g), flush: () => timers.splice(0).forEach(callback => callback()) };
}

test('display aliases trim valid names and reject invalid values without altering identity', () => {
  assert.equal(names.normalizeVoiceName('  My voice  '), 'My voice');
  assert.equal(names.normalizeVoiceName('가'.repeat(80)), '가'.repeat(80));
  for (const value of ['', '   ', 'x'.repeat(81), 'line\nbreak', 'name\u0000', null, {}, 42]) assert.equal(names.normalizeVoiceName(value), null);
  assert.equal(names.applyVoiceNameOverride(baseline, '  '), baseline);
  const renamed = names.applyVoiceNameOverride(baseline, 'My Veyra');
  assert.equal(renamed.name, 'My Veyra');
  for (const field of ['id', 'officialVoiceId', 'audioUrl', 'stylePrompt']) assert.equal(renamed[field], baseline[field]);
  assert.deepEqual({ ...names.readVoiceNameOverrides({ good: ' Valid ', bad: {}, empty: '', long: 'x'.repeat(81) }) }, { good: 'Valid' });
});

test('actual default rename preserves both previews and survives reload and fresh canonical selection', () => {
  const h = harness();
  h.run('updateVoice')(baseline.id, { name: '  My Veyra  ' });
  assert.equal(h.state.voices[0].name, 'My Veyra');
  assert.equal(h.state.voices[0].audioUrl, baseline.audioUrl);
  assert.equal(h.state.voices[0].audioUrlB, baseline.audioUrlB);
  assert.equal(h.state.active.audioUrl, baseline.audioUrl);
  assert.deepEqual(JSON.parse(h.storage.get('melodio_user_voices')), []);
  assert.equal(JSON.parse(h.storage.get(names.VOICE_NAME_OVERRIDES_KEY))[baseline.id], 'My Veyra');
  const reloaded = harness([baseline], h.storage); reloaded.run('restore')(); reloaded.flush();
  assert.equal(reloaded.state.voices[0].name, 'My Veyra');
  assert.equal(reloaded.state.voices[0].isFavorite, true);
  reloaded.g.setActiveVoice(structuredClone(baseline));
  assert.equal(reloaded.state.active.name, 'My Veyra');
  assert.equal(reloaded.state.active.audioUrl, baseline.audioUrl);
});

test('old stored Moe default reloads the new canonical singing preview while keeping favorites and aliases', () => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/data/vocalStyles.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', code)(name => {
    assert.ok(['./officialVocalCatalog.json', './legacyVocalSamples.json'].includes(name));
    return { default: JSON.parse(fs.readFileSync('src/data/' + name.slice(2), 'utf8')) };
  }, exports);
  const moe = exports.INITIAL_SYSTEM_VOICES.find(voice => voice.id === 'voice-moe-jpop');
  const storage = new Map([
    ['melodio_user_voices', JSON.stringify([{ ...moe, audioUrl: '/assets/voices/vd-7705.mp3', stylePrompt: 'stale cached prompt' }])],
    ['melodio_voice_favorites', JSON.stringify([moe.id])],
    ['melodio_active_voice_id', moe.id],
    [names.VOICE_NAME_OVERRIDES_KEY, JSON.stringify({ [moe.id]: '나의 모에' })],
  ]);
  const h = harness([moe], storage); h.g.INITIAL_SYSTEM_VOICES = [structuredClone(moe)];
  h.run('restore')(); h.flush();
  assert.equal(h.state.voices.length, 1); assert.equal(h.state.active.id, moe.id);
  assert.equal(h.state.active.name, '나의 모에'); assert.equal(h.state.active.isFavorite, true);
  assert.equal(h.state.active.audioUrl, '/assets/voices/approved-20261006/voice-moe-jpop-A.mp3');
  assert.equal(h.state.active.sampleDurationSeconds, 30); assert.equal(h.state.active.previewStatus, 'ready');
  assert.equal(h.state.active.stylePrompt, moe.stylePrompt); assert.equal(h.state.active.officialVoiceId, undefined);
  h.g.setActiveVoice(h.state.voices[0]);
  assert.equal(h.state.active.audioUrl, moe.audioUrl); assert.equal(h.state.active.sampleDurationSeconds, 30);
});

test('actual Discovery rename restores canonical identity and survives selection and saving again', () => {
  const h = harness([discovered]); h.run('updateVoice')(discovered.id, { name: 'My discovered singer' });
  const saved = JSON.parse(h.storage.get('melodio_user_voices'));
  saved[0].audioUrl = 'https://untrusted.invalid/fake.mp3'; saved[0].stylePrompt = 'forged prompt';
  h.storage.set('melodio_user_voices', JSON.stringify(saved));
  const reloaded = harness([baseline], h.storage); reloaded.run('restore')(); reloaded.flush();
  let voice = reloaded.state.voices.find(row => row.id === discovered.id);
  assert.equal(voice.name, 'My discovered singer');
  assert.equal(voice.audioUrl, discovered.audioUrl); assert.equal(voice.stylePrompt, discovered.stylePrompt);
  reloaded.g.setActiveVoice({ ...discovered, name: 'stale name', stylePrompt: 'forged', audioUrl: '/wrong.mp3' });
  assert.equal(reloaded.state.active.name, 'My discovered singer');
  assert.equal(reloaded.state.active.stylePrompt, discovered.stylePrompt);
  assert.equal(reloaded.state.active.audioUrl, discovered.audioUrl);
  voice = reloaded.run('saveDiscoveryVoice')(discovered.id);
  assert.equal(voice.name, 'My discovered singer'); assert.equal(voice.discoveryVoiceId, discovered.id);
});

test('actual created-voice rename keeps runtime audio but never restores arbitrary cached media', () => {
  const created = { ...baseline, id: 'voice-created', sourceType: 'uploaded', officialVoiceId: undefined, audioUrl: 'blob:runtime-only', audioUrlB: 'blob:runtime-b' };
  const h = harness([created]); h.run('updateVoice')(created.id, { name: 'My recording' });
  assert.equal(h.state.voices[0].audioUrl, 'blob:runtime-only');
  assert.equal(h.state.voices[0].audioUrlB, 'blob:runtime-b');
  for (const bad of [' ', 'x'.repeat(81), 123]) h.run('updateVoice')(created.id, { name: bad });
  assert.equal(h.state.voices[0].name, 'My recording');
  const stored = JSON.parse(h.storage.get('melodio_user_voices'));
  assert.equal(stored[0].audioUrl, ''); assert.equal(stored[0].audioUrlB, undefined);
  stored[0].audioUrl = 'https://untrusted.invalid/source.mp3'; h.storage.set('melodio_user_voices', JSON.stringify(stored));
  const reloaded = harness([baseline], h.storage); reloaded.run('restore')();
  const restored = reloaded.state.voices.find(row => row.id === created.id);
  assert.equal(restored.name, 'My recording'); assert.equal(restored.audioUrl, '');
});

test('server registered and designed refreshes retain personal aliases with canonical fields', async () => {
  const registered = { ...baseline, id: `custom-voice-${customId}`, officialVoiceId: undefined, customVoiceId: customId, sourceType: 'uploaded' };
  const designed = { ...baseline, id: `designed-voice-${designedId}`, officialVoiceId: undefined, designedVoiceId: designedId, sourceType: 'dna_designed', sampleGenerationId: sampleId };
  const h = harness([registered, designed]);
  h.run('updateVoice')(registered.id, { name: 'My registered singer' });
  h.run('updateVoice')(designed.id, { name: 'My designed singer' });
  h.responses.set('/api/voice/custom', { voices: [{ id: customId, status: 'ready', name: 'Server original', gender: 'female', style: 'server custom prompt' }] });
  h.responses.set('/api/voice/designed', { voices: [{ ...designed, name: 'Server design original', status: 'ready', stylePrompt: 'server design prompt' }] });
  h.responses.set(`/api/generations?id=${sampleId}`, { generation: { audio_url: '/canonical-generated.mp3' } });
  const cleanups = [h.run('registeredRefresh')(), h.run('designedRefresh')()];
  for (let n = 0; n < 8; n++) await new Promise(setImmediate);
  cleanups.forEach(cleanup => cleanup());
  const custom = h.state.voices.find(row => row.id === registered.id), design = h.state.voices.find(row => row.id === designed.id);
  assert.equal(custom.name, 'My registered singer'); assert.equal(custom.stylePrompt, 'server custom prompt');
  assert.equal(design.name, 'My designed singer'); assert.equal(design.stylePrompt, 'server design prompt');
  assert.equal(design.audioUrl, '/canonical-generated.mp3');
  h.run('syncRegisteredVoice')({ ...custom, name: 'Server renamed', stylePrompt: 'updated canonical custom prompt' });
  h.run('syncDesignedVoice')({ ...design, name: 'Server renamed design' });
  assert.equal(h.state.voices.find(row => row.id === registered.id).name, 'My registered singer');
  assert.equal(h.state.voices.find(row => row.id === designed.id).name, 'My designed singer');
});
