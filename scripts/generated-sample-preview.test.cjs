const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, imports = {}) {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports, name => { assert.ok(imports[name], name); return imports[name]; });
  return exports;
}
const restore = load('src/lib/voice/restore-design-attributes.ts');
const names = load('src/lib/voice/voice-name-overrides.ts');
const selection = load('src/lib/voice/generated-sample-selection.ts', { './restore-design-attributes': restore });
const previewModule = load('src/lib/voice/generated-sample-preview.ts', { './generated-sample-selection': selection });
const { fetchGeneratedSamplePreview, isGenerationId } = previewModule;
const rootId = '22222222-2222-4222-8222-222222222222';
const bId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const origin = 'https://project.supabase.co';
const url = slot => `${origin}/storage/v1/object/public/melodio-assets/generated_audio/v1/${rootId}/${'a'.repeat(24)}/${slot}-${'b'.repeat(20)}/${'c'.repeat(64)}.mp3`;
const row = (id, slot) => ({ id, user_id: userId, status: 'completed', audio_url: url(slot) });
const options = data => ({ supabaseUrl: origin, signal: new AbortController().signal,
  fetcher: async route => { assert.match(route, /^\/api\/generations\?id=/); return { ok: true, json: async () => data }; } });

test('saved generated sample resolves an owned completed server record', async () => {
  assert.deepEqual(await fetchGeneratedSamplePreview(rootId, undefined, options({ generation: row(rootId, 1) })), { sampleGenerationId: rootId, audioUrl: url(1) });
});
test('legacy selected B migrates to actual B row, never the unrelated primary', async () => {
  const data = { generation: row(rootId, 1), sibling: row(bId, 2) };
  assert.deepEqual(await fetchGeneratedSamplePreview(rootId, url(2), options(data)), { sampleGenerationId: bId, audioUrl: url(2) });
  assert.equal(await fetchGeneratedSamplePreview(rootId, url(3), options(data)), null);
});
test('missing, public non-owner, unfinished, raw-upload and ambiguous audio are rejected', async () => {
  for (const generation of [null, { ...row(rootId, 1), id: bId }, { ...row(rootId, 1), user_id: undefined },
    { ...row(rootId, 1), status: 'processing' }, { ...row(rootId, 1), audio_url: '/assets/voices/vd-1004.mp3' },
    { ...row(rootId, 1), audio_url: `${origin}/storage/v1/object/public/melodio-assets/uploads/voice.mp3` }]) {
    assert.equal(await fetchGeneratedSamplePreview(rootId, undefined, options({ generation })), null);
  }
  assert.equal(await fetchGeneratedSamplePreview(rootId, url(1), options({ generation: row(rootId, 1), sibling: row(bId, 1) })), null);
  assert.equal(await fetchGeneratedSamplePreview('invalid', undefined, options({})), null);
});

// Execute the actual provider save/restore/effect callbacks, not a duplicate implementation.
const source = fs.readFileSync('src/contexts/VoiceContext.tsx', 'utf8');
const file = ts.createSourceFile('VoiceContext.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = {};
function walk(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'persistCustomVoices') nodes.persist = node;
  if (ts.isVariableDeclaration(node) && ['addVoice', 'updateVoice'].includes(node.name.getText(file))) nodes[node.name.getText(file)] = node.initializer;
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect') {
    if (node.arguments[0]?.getText(file).includes('const saved = localStorage.getItem("melodio_user_voices")')) nodes.restore = node.arguments[0];
    if (node.arguments[0]?.getText(file).includes('const candidates = voices.filter')) nodes.hydrate = node.arguments[0];
  }
  ts.forEachChild(node, walk);
}
walk(file);
function evaluate(node, globals) {
  const expression = ts.transpileModule(`const callback = ${node.getText(file)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function('globals', `with(globals){${expression}; return callback;}`)(globals);
}
function harness(storage = new Map()) {
  const state = { voices: [], active: null };
  const g = {
    ...restore, ...selection, ...previewModule, ...names, process: { env: { NEXT_PUBLIC_SUPABASE_URL: origin } },
    nameOverrides: { current: Object.create(null) },
    INITIAL_SYSTEM_VOICES: [], legacySampleHints: { current: new Map() }, sampleRevisions: { current: new Map() },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    setStudioGenderState() {},
    setVoices: v => { state.voices = typeof v === 'function' ? v(state.voices) : v; },
    setActiveVoice: v => { state.active = v; }, setActiveVoiceState: v => { state.active = typeof v === 'function' ? v(state.active) : v; },
    fetch: options({ generation: row(rootId, 1), sibling: row(bId, 2) }).fetcher,
  };
  Object.defineProperty(g, 'voices', { get: () => state.voices });
  Object.defineProperty(g, 'activeVoice', { get: () => state.active });
  g.persistCustomVoices = evaluate(nodes.persist, g);
  return { g, state, storage };
}
async function hydrate(h) {
  const cleanup = evaluate(nodes.hydrate, h.g)();
  for (let n = 0; n < 10 && !h.state.voices[0]?.audioUrl; n++) await new Promise(setImmediate);
  cleanup();
}
test('actual save → hydrate → reload retains selected audio while only IDs persist', async () => {
  const h = harness();
  evaluate(nodes.addVoice, h.g)({ name: '내가 정한 보컬', gender: 'male', sourceType: 'dna_designed', tags: [], stylePrompt: 'male vocals',
    sampleGenerationId: rootId, sampleVersion: 'A', audioUrl: 'https://untrusted.invalid/source.mp3' });
  assert.equal(h.state.voices[0].audioUrl, '');
  await hydrate(h);
  assert.equal(h.state.voices[0].audioUrl, url(1));
  assert.equal(h.state.active.audioUrl, url(1));
  const persisted = JSON.parse(h.storage.get('melodio_user_voices'))[0];
  assert.equal(persisted.sampleGenerationId, rootId);
  assert.equal(persisted.audioUrl, '');
  evaluate(nodes.updateVoice, h.g)(persisted.id, { name: '새 이름' });
  assert.equal(h.state.voices[0].audioUrl, url(1), 'Rename must preserve a hydrated sample');
  const reloaded = harness(h.storage);
  evaluate(nodes.restore, reloaded.g)();
  await hydrate(reloaded);
  assert.equal(reloaded.state.voices[0].name, '새 이름');
  assert.equal(reloaded.state.voices[0].audioUrl, url(1));
});
test('actual context recovers pre-fix saved B by exact DNA and persists the selected row ID', async () => {
  const recipe = { vd_code: 'VD-8123', name: 'Steel Heavy Belter', physical_layers: { gender: 'male', pitch: 48 }, textures: ['Rough'] };
  const voice = { id: 'voice-existing', name: recipe.name, gender: 'male', sourceType: 'dna_designed', stylePrompt: 'male vocals',
    designAttributes: recipe, sampleVersion: 'B' };
  const h = harness(new Map([
    ['melodio_user_voices', JSON.stringify([voice])],
    ['custom_voice_dnas', JSON.stringify([{ ...recipe, audio_url: url(1), audio_url_b: url(2), sample_version: 'B' }])],
  ]));
  evaluate(nodes.restore, h.g)();
  await hydrate(h);
  assert.equal(h.state.voices[0].audioUrl, url(2));
  assert.equal(h.state.voices[0].sampleGenerationId, bId);
  assert.equal(JSON.parse(h.storage.get('melodio_user_voices'))[0].sampleGenerationId, bId);
  assert.equal(h.g.legacySampleHints.current.size, 0, 'Successful recovery consumes the legacy hint');
  evaluate(nodes.updateVoice, h.g)(voice.id, { sampleGenerationId: undefined, designAttributes: { ...recipe, textures: ['Warm'] } });
  await hydrate(h);
  assert.equal(h.state.voices[0].audioUrl, '', 'Later overwrite cannot reuse the old hint');
});

test('in-flight legacy recovery cannot attach audio after recipe overwrite', async () => {
  const recipe = { vd_code: 'VD-8123', name: 'Steel Heavy Belter', physical_layers: { gender: 'male', pitch: 48 }, textures: ['Rough'] };
  const voice = { id: 'voice-existing', name: recipe.name, gender: 'male', sourceType: 'dna_designed', stylePrompt: 'male vocals', designAttributes: recipe, sampleVersion: 'A' };
  const h = harness(new Map([
    ['melodio_user_voices', JSON.stringify([voice])],
    ['custom_voice_dnas', JSON.stringify([{ ...recipe, audio_url: url(1), sample_version: 'A' }])],
  ]));
  evaluate(nodes.restore, h.g)();
  h.state.active = h.state.voices[0];
  let release;
  h.g.fetch = async () => { await new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => ({ generation: row(rootId, 1) }) }; };
  const cleanup = evaluate(nodes.hydrate, h.g)();
  evaluate(nodes.updateVoice, h.g)(voice.id, { designAttributes: { ...recipe, textures: ['Warm'] }, sampleGenerationId: undefined });
  assert.equal(h.g.legacySampleHints.current.size, 0);
  release();
  for (let n = 0; n < 10; n++) await new Promise(setImmediate);
  cleanup();
  assert.equal(h.state.voices[0].audioUrl, '');
  assert.equal(h.state.voices[0].sampleGenerationId, undefined);
  assert.equal(h.state.active.audioUrl, '');
});
