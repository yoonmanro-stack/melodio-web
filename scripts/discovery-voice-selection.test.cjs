const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = process.cwd();
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
const officialCatalog = require(path.join(root, 'src/data/officialVocalCatalog.json'));
const provider = require(path.join(root, 'worker/suno-provider.js'));
const ready = {
  id: 'discovery-offline-female', name: 'Offline singer', shortDescription: 'Clear solo', gender: 'female', language: 'fr',
  stylePrompt: 'female vocals, resonant clear middle register, precise French articulation',
  audioUrl: '/assets/voices/discovery-20261005/offline-female.mp3', previewStatus: 'ready', reuseStatus: 'ready',
};
const designedId = '00000000-0000-4000-8000-000000000032';
const savedDesign = { id: designedId, userId: 'offline-user', name: 'Owned design', status: 'ready',
  providerPersonaId: 'offline_designed_persona', voicePrompt: 'female vocals, dense chest body, dark grain', gender: 'female', language: 'fr' };

function loadSource(source, imports = {}) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions }).outputText)(name => {
    if (name === 'server-only') return {};
    assert.ok(name in imports, `Unexpected module ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
function load(file, imports) { return loadSource(fs.readFileSync(path.join(root, file), 'utf8'), imports); }
function extract(name, file = 'src/app/api/generate/route.ts') {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, `Missing ${name}`);
  return fn.getText(ast);
}
const studio = load('src/lib/voice/studio-selection.ts');
const duration = load('src/lib/music-duration.ts');
const designCompiler = load('src/lib/voice/voice-design-prompt.ts');
const scrubber = loadSource(extract('scrubConflictingVocalTags', 'src/lib/voice-dna-scrubber.ts'));
const official = load('src/lib/voice/official-voice-selection.ts', { '@/data/officialVocalCatalog.json': officialCatalog });
function selection(catalog = [ready]) {
  return load('src/lib/voice/discovery-voice-selection.ts', {
    '@/data/discoveryVoices.json': catalog, '@/data/officialVocalCatalog.json': officialCatalog,
  });
}
function body(overrides = {}) {
  return {
    title: 'Offline discovery test', stylePrompt: 'French pop, piano and bass', lyricsPrompt: '[Verse]\nBonjour le jour\n[Chorus]\nEncore toujours',
    vocalGender: 'female', isInstrumental: false, sunoVersion: 'V6', sourceMenu: 'style-library', isPublic: false,
    activeVoice: { id: ready.id, discoveryVoiceId: ready.id, gender: 'male', stylePrompt: 'browser-overridden', personaId: 'browser_persona_123' },
    voicePrompt: 'browser-overridden', metadata: {}, ...overrides,
  };
}

// Execute the actual POST and submission functions. All external boundaries are offline mocks.
async function request(input, { catalog = [ready], registry = { [ready.id]: 'offline_discovery_persona' }, user = { id: 'offline-user' }, designed = savedDesign } = {}) {
  const calls = { provider: [], rows: [], metadata: 0, designedReads: [] };
  const discovery = selection(catalog);
  const persona = load('src/lib/voice/discovery-voice-registry.ts', { './discovery-voice-personas.json': registry });
  const db = { from(table) {
    assert.equal(table, 'generations');
    return { insert(row) { calls.rows.push(row); return { select() { return { single: async () => ({ data: { id: 'offline-generation' }, error: null }) }; } }; } };
  } };
  const dependencies = {
    ...studio, ...duration, ...scrubber, ...official, ...discovery, ...persona, ...designCompiler,
    NextResponse: { json: (data, options) => ({ status: options?.status || 200, data }) },
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
    createSupabaseClient: () => db,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://offline.invalid', SUPABASE_SERVICE_ROLE_KEY: 'offline' } },
    officialVoicePersona: () => 'offline_official_persona',
    readCustomVoice: async () => ({ name: 'Offline owned voice' }),
    registeredVoicePersona: () => 'offline_custom_persona',
    readDesignedVoice: async (_admin, ownerId, id) => { calls.designedReads.push({ ownerId, id }); return designed; },
    generateSongMetadata: async () => { calls.metadata++; return { title: input.title, description: '', tags: '', source: 'offline', model: null }; },
    inferGenreLabel: () => 'Pop', inferVocalLabel: () => 'Female', getGenreFallback: () => '',
    kieTaskReference: provider.kieTaskReference, sunoVersionLabel: provider.sunoVersionLabel,
    submitKieSunoJob: async options => { calls.provider.push(provider.buildKieSunoRequest(options).input); return { taskId: 'offline-task', model: 'V6' }; },
    console: { log() {}, error() {}, warn() {} },
    require: name => {
      if (name === '@/lib/voice-dna-scrubber') return scrubber;
      if (name === '@/lib/db/knowledge') return { matchPlaybooksByPrompt: async () => [] };
      throw new Error(`Unexpected route import ${name}`);
    },
  };
  const exports = {};
  const source = ['buildLyricsPromptFromSections', 'submitSunoJob', 'applyVoiceDesignRequest', 'POST'].map(name => extract(name)).join('\n');
  new Function('exports', ...Object.keys(dependencies), ts.transpileModule(source, { compilerOptions }).outputText)(exports, ...Object.values(dependencies));
  return { response: await exports.POST({ json: async () => structuredClone(input) }), calls };
}

test('Discovery resolves canonical fields independently of official voices and browser prompts', () => {
  const value = selection().resolveDiscoveryVoice(body());
  assert.deepEqual(value, ready);
  assert.equal(selection().resolveDiscoveryVoice({ activeVoice: { id: 'legacy-style' } }), null);
});

test('unknown IDs, conflicting IDs, gender, lyrics, menus and incompatible models fail closed', () => {
  for (const change of [
    { activeVoice: { discoveryVoiceId: 'unknown' } }, { discoveryVoiceId: 'other' }, { discoveryVoiceId: 42 },
    { vocalGender: 'male' }, { vocalGender: undefined }, { lyricsPrompt: '' }, { sourceMenu: 'viral' },
    { sunoVersion: 'V6_MINI' }, { sunoVersion: 'V6_WILD' }, { sunoVersion: 'unknown' },
  ]) assert.throws(() => selection().resolveDiscoveryVoice(body(change)));
});

test('the actual route binds a ready Discovery persona in all studio aliases and sample requests', async () => {
  for (const sourceMenu of ['style-library', 'preset-studio', 'japan', 'audio-forge', 'audio', 'voice-discovery-sample']) {
    const sample = sourceMenu === 'voice-discovery-sample';
    const input = body({ sourceMenu, metadata: sample ? { durationSeconds: 30 } : {},
      lyricsSections: [{ type: 'verse', content: 'Bonjour le jour' }, { type: 'chorus', content: 'Encore toujours' }] });
    const { response, calls } = await request(input);
    assert.equal(response.status, 200);
    assert.equal(calls.provider.length, 1);
    const submitted = calls.provider[0];
    assert.equal(submitted.persona_id, 'offline_discovery_persona');
    assert.equal(submitted.persona_model, 'style_persona');
    assert.equal(submitted.vocal_gender, 'f');
    assert.equal(submitted.model, 'V6');
    assert.equal(submitted.duration, sample ? 30 : 195);
    assert.ok(submitted.style.includes(ready.stylePrompt));
    assert.ok(!submitted.style.includes('browser-overridden'));
    assert.ok(submitted.prompt.includes('[Chorus]\nEncore toujours'));
    const metadata = JSON.parse(calls.rows[0].license_hash);
    assert.equal(metadata.discoveryVoiceId, ready.id);
    assert.equal(metadata.discoveryVoiceName, ready.name);
    assert.equal(metadata.officialVoiceId, null);
    assert.equal(metadata.customVoiceRegistrationId, null);
    assert.equal(metadata.voiceFeatureMode, 'suno_style_persona');
    assert.equal(calls.rows[0].is_public, false);
  }
});

test('pending, missing audio, legacy TTS, official samples and absent personas return 503 before external work', async () => {
  for (const options of [
    { catalog: [{ ...ready, previewStatus: 'pending' }] }, { catalog: [{ ...ready, audioUrl: '' }] },
    { catalog: [{ ...ready, audioUrl: '/assets/voices/vd-1004.mp3' }] },
    { catalog: [{ ...ready, audioUrl: '/assets/voices/official-20261004/sample.mp3' }] },
    { registry: {} }, { registry: { [ready.id]: 'invalid persona!' } },
  ]) {
    const { response, calls } = await request(body(), options);
    assert.equal(response.status, 503);
    assert.equal(calls.provider.length + calls.rows.length + calls.metadata, 0);
  }
});

test('pending catalog reuse throws before any external work even with a registry entry and forged browser-ready flags', async () => {
  for (const reuseStatus of ['pending', undefined]) {
    const voice = { ...ready, reuseStatus };
    const input = body({ activeVoice: { id: ready.id, discoveryVoiceId: ready.id, previewStatus: 'ready', reuseStatus: 'ready' } });
    assert.throws(() => selection([voice]).resolveDiscoveryVoice(input), /discovery_voice_not_ready/);
    const { response, calls } = await request(input, { catalog: [voice] });
    assert.equal(response.status, 503);
    assert.equal(calls.provider.length + calls.rows.length + calls.metadata, 0);
  }
});

test('shared selection and restoration eligibility uses canonical Discovery readiness and preserves other voice types', () => {
  const id = 'discovery-v2-f-001';
  let canonical = { ...ready, id, discoveryVoiceId: id, reuseStatus: 'pending' };
  const { selectableVoice } = loadSource(`import { discoveryVoiceItem } from 'offline-catalog';\nimport { applyVoiceNameOverride } from 'offline-names';\n${extract('selectableVoice', 'src/contexts/VoiceContext.tsx')}\nexport { selectableVoice };`, {
    'offline-catalog': { discoveryVoiceItem: value => value === id ? canonical : null },
    'offline-names': load('src/lib/voice/voice-name-overrides.ts'),
  });
  const forged = { ...canonical, reuseStatus: 'ready', previewStatus: 'ready', stylePrompt: 'browser override', isFavorite: true };
  assert.equal(selectableVoice(forged), null);
  assert.equal(selectableVoice({ ...forged, discoveryVoiceId: undefined }), null);
  canonical = { ...canonical, reuseStatus: 'ready', previewStatus: 'pending' };
  assert.equal(selectableVoice(forged), null);
  canonical = { ...canonical, previewStatus: 'ready', audioUrl: '' };
  assert.equal(selectableVoice(forged), null);
  canonical = { ...canonical, audioUrl: ready.audioUrl };
  assert.deepEqual(selectableVoice(forged), { ...canonical, isFavorite: true });
  for (const other of [officialCatalog[0], { id: 'owned-custom', customVoiceId: designedId }, { id: 'owned-design', designedVoiceId: designedId }]) assert.equal(selectableVoice(other), other);
});

test('v2 first-A registry binding survives browser clip overrides without requiring a listening approval', async () => {
  for (const language of ['en', 'ko', 'ja', 'fr']) for (const gender of ['female', 'male']) {
    const id = `discovery-v2-${gender === 'female' ? 'f-001' : 'm-120'}`;
    const voice = { ...ready, id, discoveryVoiceId: id, gender, language,
      stylePrompt: `${gender} vocals, dry close middle register, precise connected vowels`,
      audioUrl: `/assets/voices/discovery-v2-20261005/${id}-A.mp3`, sampleVersion: 'A',
      reuseStatus: 'ready', designStatus: 'verified', qualityReview: 'unreviewed' };
    const { response, calls } = await request(body({ vocalGender: gender,
      activeVoice: { id, discoveryVoiceId: id, sampleVersion: 'B', personaId: 'browser_second_b_persona', stylePrompt: 'browser-overridden' },
    }), { catalog: [voice], registry: { [id]: 'offline_registered_first_a_persona' } });
    assert.equal(response.status, 200);
    assert.equal(calls.provider.length, 1);
    assert.equal(calls.provider[0].persona_id, 'offline_registered_first_a_persona');
    assert.equal(calls.provider[0].persona_model, 'style_persona');
    assert.equal(calls.provider[0].vocal_gender, gender === 'female' ? 'f' : 'm');
    assert.ok(calls.provider[0].style.includes(voice.stylePrompt));
    assert.ok(!calls.provider[0].style.includes('browser-overridden'));
    assert.equal(JSON.parse(calls.rows[0].license_hash).discoveryVoiceId, id);
  }
});

test('a generated v2 A sample and verified written design cannot substitute for a registered persona', async () => {
  const id = 'discovery-v2-f-120';
  const voice = { ...ready, id, discoveryVoiceId: id, sampleVersion: 'A', reuseStatus: 'ready',
    audioUrl: `/assets/voices/discovery-v2-20261005/${id}-A.mp3`, designStatus: 'verified', qualityReview: 'unreviewed' };
  const { response, calls } = await request(body({ activeVoice: { id, discoveryVoiceId: id } }), { catalog: [voice], registry: {} });
  assert.equal(response.status, 503);
  assert.equal(calls.provider.length + calls.rows.length + calls.metadata, 0);
});

test('official, Discovery and custom selections are mutually exclusive before any external work', async () => {
  const officialId = officialCatalog[0].id;
  for (const fields of [
    { officialVoiceId: officialId }, { customVoiceId: '00000000-0000-4000-8000-000000000001' },
    { activeVoice: { id: officialId }, discoveryVoiceId: ready.id },
    { activeVoice: { officialVoiceId: officialId, customVoiceId: '00000000-0000-4000-8000-000000000001' } },
    { activeVoice: { discoveryVoiceId: ready.id, customVoiceId: '00000000-0000-4000-8000-000000000001' } },
    { designedVoiceId: designedId },
    { activeVoice: { officialVoiceId: officialId, designedVoiceId: designedId } },
    { activeVoice: { customVoiceId: '00000000-0000-4000-8000-000000000001', designedVoiceId: designedId } },
  ]) {
    const { response, calls } = await request(body(fields));
    assert.equal(response.status, 400);
    assert.match(response.data.error, /하나만/);
    assert.equal(calls.provider.length + calls.rows.length + calls.metadata, 0);
  }
});

test('mixed, random, duet and instrumental suppress all Discovery selection fields', async () => {
  for (const change of [{ vocalGender: 'mixed' }, { vocalGender: 'random' }, { vocalGender: 'duet' }, { isInstrumental: true }]) {
    const input = body({ discoveryVoiceId: ready.id, designedVoiceId: designedId, ...change });
    studio.suppressIneligibleVoice(input);
    assert.equal(input.discoveryVoiceId, undefined);
    assert.equal(input.designedVoiceId, undefined);
    assert.equal(input.activeVoice, undefined);
    const { response, calls } = await request(body({ discoveryVoiceId: ready.id, ...change }));
    assert.equal(response.status, 200);
    assert.equal(calls.provider[0].persona_id, undefined);
    assert.equal(JSON.parse(calls.rows[0].license_hash).discoveryVoiceId, null);
  }
});

test('existing official and owned custom bindings retain their distinct persona models', async () => {
  const officialVoice = officialCatalog.find(voice => voice.gender === 'female');
  for (const [activeVoice, expectedId, expectedModel] of [
    [{ officialVoiceId: officialVoice.id }, 'offline_official_persona', 'style_persona'],
    [{ customVoiceId: '00000000-0000-4000-8000-000000000001' }, 'offline_custom_persona', 'voice_persona'],
  ]) {
    const { response, calls } = await request(body({ activeVoice }));
    assert.equal(response.status, 200);
    assert.equal(calls.provider[0].persona_id, expectedId);
    assert.equal(calls.provider[0].persona_model, expectedModel);
    assert.equal(JSON.parse(calls.rows[0].license_hash).discoveryVoiceId, null);
  }
});

const designProfile = { gender: 'female', age: '40s', language: 'fr', traits: ['body-dense', 'texture-husky', 'resonance-dark'] };
function designBody(overrides = {}) {
  return { sourceMenu: 'voice-discovery-design', voiceDesign: designProfile, sunoVersion: 'V6', ...overrides };
}

test('the actual design route honors explicit 30 seconds with canonical dark timbre and private provenance', async () => {
  const { response, calls } = await request(designBody({
    metadata: { durationSeconds: 30 }, isPublic: true, vocalGender: 'male',
    stylePrompt: 'browser bright choir', voicePrompt: 'browser-overridden', lyricsPrompt: 'browser lyrics',
    lyricsSections: [{ type: 'verse', content: 'browser sections' }], isViral: true, isViralTrack: true,
  }));
  assert.equal(response.status, 200);
  const submitted = calls.provider[0];
  const compiled = designCompiler.compileVoiceDesign(designProfile);
  assert.equal(submitted.duration, 30);
  assert.equal(submitted.model, 'V6');
  assert.equal(submitted.vocal_gender, 'f');
  assert.equal(submitted.persona_id, undefined);
  assert.equal(submitted.prompt, compiled.lyricsPrompt);
  assert.ok(submitted.style.includes(compiled.sampleStylePrompt));
  assert.doesNotMatch(submitted.style, /browser|crystal clear vocal delivery|beautiful|bright choir/);
  assert.equal(calls.metadata, 0, 'A design preview must not call the unrelated metadata model');
  assert.equal(calls.rows[0].is_public, false);
  const metadata = JSON.parse(calls.rows[0].license_hash);
  assert.equal(metadata.voiceDesignCode, compiled.designCode);
  assert.deepEqual(metadata.voiceDesign.traits, compiled.traits);
  assert.equal(metadata.voiceDesign.language, 'fr');
  assert.equal(metadata.voiceFeatureMode, 'prompt_style_only');
});

test('design previews default to 45 seconds and preserve all four chosen lyric languages', async () => {
  for (const language of ['en', 'ko', 'ja', 'fr']) {
    const profile = { ...designProfile, language };
    const { response, calls } = await request(designBody({ voiceDesign: profile }));
    assert.equal(response.status, 200);
    assert.equal(calls.provider[0].duration, 45);
    assert.equal(calls.provider[0].prompt, designCompiler.compileVoiceDesign(profile).lyricsPrompt);
  }
});

test('invalid structured designs, incompatible model and persona mixtures stop before provider or database work', async () => {
  for (const changes of [
    { voiceDesign: { ...designProfile, traits: [] } }, { voiceDesign: undefined },
    { voiceDesign: { ...designProfile, traits: ['body-dense', 'body-light'] } },
    { sunoVersion: 'V6_MINI' }, { engine: 'lyria3' }, { sourceMenu: 'style-library' },
    { activeVoice: { discoveryVoiceId: ready.id } }, { customVoiceId: 'offline-custom' },
    { designedVoiceId: designedId },
    { metadata: { durationSeconds: 195 } }, { metadata: { durationSeconds: 'invalid' } },
  ]) {
    const { response, calls } = await request(designBody(changes));
    assert.equal(response.status, 400);
    assert.equal(calls.provider.length + calls.rows.length + calls.metadata, 0);
  }
});

test('design samples require an authenticated owner before any paid submission', async () => {
  const { response, calls } = await request(designBody(), { user: null });
  assert.equal(response.status, 401);
  assert.equal(calls.provider.length + calls.rows.length + calls.metadata, 0);
});

test('saved designs bind the owner record canonical style persona in studios and the incubator', async () => {
  for (const sourceMenu of ['style-library', 'preset-studio', 'japan', 'audio-forge', 'audio', 'voice-discovery-sample']) {
    const { response, calls } = await request(body({ sourceMenu,
      activeVoice: { designedVoiceId: designedId, gender: 'male', stylePrompt: 'browser-overridden', personaId: 'browser_bad_persona' },
      lyricsSections: [{ type: 'verse', content: 'Bonjour le jour' }],
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(calls.designedReads, [{ ownerId: 'offline-user', id: designedId }]);
    assert.equal(calls.provider[0].persona_id, savedDesign.providerPersonaId);
    assert.equal(calls.provider[0].persona_model, 'style_persona');
    assert.equal(calls.provider[0].vocal_gender, 'f');
    assert.ok(calls.provider[0].style.includes(savedDesign.voicePrompt));
    assert.doesNotMatch(calls.provider[0].style, /browser-overridden/);
    const metadata = JSON.parse(calls.rows[0].license_hash);
    assert.equal(metadata.designedVoiceId, designedId);
    assert.equal(metadata.designedVoiceName, savedDesign.name);
    assert.equal(metadata.discoveryVoiceId, null);
    assert.equal(metadata.customVoiceRegistrationId, null);
    assert.equal(metadata.voiceFeatureMode, 'suno_style_persona');
  }
});

test('saved design authentication, ownership, readiness and composition failures never reach the provider', async () => {
  const input = body({ activeVoice: undefined, designedVoiceId: designedId });
  for (const [overrides, options, status] of [
    [{}, { user: null }, 401], [{}, { designed: null }, 404],
    [{}, { designed: { ...savedDesign, status: 'held' } }, 503],
    [{}, { designed: { ...savedDesign, providerPersonaId: null } }, 503],
    [{}, { designed: { ...savedDesign, userId: 'other-owner' } }, 404],
    [{ vocalGender: 'male' }, {}, 400], [{ sourceMenu: 'viral' }, {}, 400],
    [{ sunoVersion: 'V6_WILD' }, {}, 400], [{ lyricsPrompt: '' }, {}, 400],
    [{ designedVoiceId: 'invalid' }, {}, 400],
    [{ activeVoice: { designedVoiceId: '00000000-0000-4000-8000-000000000099' } }, {}, 400],
  ]) {
    const { response, calls } = await request({ ...input, ...overrides }, options);
    assert.equal(response.status, status);
    assert.equal(calls.provider.length + calls.rows.length + calls.metadata, 0);
  }
});
