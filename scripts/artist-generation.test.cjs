const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadTS(path, requireModule = () => { throw new Error('unexpected import'); }) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(requireModule, module, module.exports);
  return module.exports;
}
const generation = loadTS('src/lib/artists/generation.ts');
const { resolveArtistGeneration } = generation;
const ownerId = 'b6666666-6666-4666-8666-666666666666';
const artistId = 'a5555555-5555-4555-8555-555555555555';
const referenceId = 'melodio-test-voice';
const voice = { kind: 'official', referenceId, name: 'Studio Voice', gender: 'female', language: 'ko' };
function profile(changes = {}) {
  return { schemaVersion: 1, id: artistId, userId: ownerId, name: 'My Artist', tagline: 'A steady identity',
    description: 'Test identity', genres: ['soul'], personality: 'Warm', backstory: 'A story', speakingStyle: 'Calm', visualDirection: 'Soft studio light',
    voice: { ...voice }, portrait: { assetId: 'c7777777-7777-4777-8777-777777777777', mimeType: 'image/webp', fileName: 'approved.webp' },
    checks: { voiceAuditioned: true, portraitReviewed: true, identityReviewed: true }, status: 'ready', revision: 0,
    createdAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z', ...changes };
}
function body(changes = {}) {
  return { artistId, artistRevision: 0, sourceMenu: 'style-library', sunoVersion: 'v6', engine: 'suno_v5', vocalGender: 'female',
    lyricsLanguage: 'ko', isInstrumental: false, stylePrompt: 'Soul, intimate solo vocal', lyricsPrompt: '[Verse]\n새로운 노래', title: 'Test song', ...changes };
}
function deps(artist = profile(), canonicalVoice = voice) {
  return { readArtist: async () => artist, resolveVoice: async () => ({ ...canonicalVoice }) };
}
test('ready revision zero resolves an owned immutable identity and replaces every browser voice path', async () => {
  const request = body({ activeVoice: { officialVoiceId: 'other', stylePrompt: 'untrusted', gender: 'male' },
    customVoiceId: 'other', discoveryVoiceId: 'other', designedVoiceId: 'other', voicePrompt: 'untrusted', vdCode: 'untrusted',
    personaId: 'provider-browser', providerPersonaId: 'provider-browser', voiceId: 'provider-browser' });
  const artist = profile();
  const snapshot = await resolveArtistGeneration(request, ownerId, deps(artist));
  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.id, artistId);
  assert.deepEqual(snapshot.voice, voice);
  assert.equal(request.officialVoiceId, referenceId);
  assert.deepEqual(request.activeVoice, { id: referenceId, officialVoiceId: referenceId, gender: 'female', language: 'ko' });
  for (const field of ['customVoiceId', 'discoveryVoiceId', 'designedVoiceId', 'voicePrompt', 'vdCode', 'personaId', 'providerPersonaId', 'voiceId']) assert.equal(field in request, false);
  snapshot.portrait.fileName = 'changed.webp';
  snapshot.voice.name = 'Changed';
  assert.equal(artist.portrait.fileName, 'approved.webp');
  assert.equal(artist.voice.name, 'Studio Voice');
});
test('all four canonical voice kinds carry the correct field without favorites or global voice state', async () => {
  const fields = { official: 'officialVoiceId', discovery: 'discoveryVoiceId', designed: 'designedVoiceId', custom: 'customVoiceId' };
  for (const kind of Object.keys(fields)) {
    const canonical = { ...voice, kind, referenceId: kind === 'official' || kind === 'discovery' ? `${kind}-test` : 'd8888888-8888-4888-8888-888888888888' };
    const request = body({ activeVoice: { id: 'global-other' } });
    await resolveArtistGeneration(request, ownerId, deps(profile({ voice: canonical }), canonical));
    assert.equal(request[fields[kind]], canonical.referenceId);
    assert.equal(request.activeVoice[fields[kind]], canonical.referenceId);
    for (const other of Object.values(fields).filter(field => field !== fields[kind])) assert.equal(other in request, false);
  }
});
test('ordinary generation keeps its existing voice fields and does not read artist storage', async () => {
  const request = { sourceMenu: 'style-library', activeVoice: { id: 'ordinary' }, lyricsLanguage: 'ko-en' };
  assert.equal(await resolveArtistGeneration(request, null, { readArtist: async () => { throw Error('read forbidden'); }, resolveVoice: async () => { throw Error('read forbidden'); } }), null);
  assert.deepEqual(request.activeVoice, { id: 'ordinary' });
  assert.equal(request.lyricsLanguage, 'ko-en');
});
test('owner, stale revision, readiness, language and gender failures never proceed to a paid submission', async () => {
  const cases = [
    [body(), null, deps(), 'artist_auth_required'],
    [body({ artistId: 'invalid' }), ownerId, deps(), 'artist_selection_invalid'],
    [body({ artistId: '' }), ownerId, deps(), 'artist_selection_invalid'],
    [body({ artistRevision: -1 }), ownerId, deps(), 'artist_selection_invalid'],
    [body(), ownerId, deps(null), 'artist_not_found'],
    [body(), ownerId, deps(profile({ userId: 'other-owner' })), 'artist_not_found'],
    [body({ artistRevision: 1 }), ownerId, deps(), 'artist_revision_stale'],
    [body(), ownerId, deps(profile({ status: 'draft' })), 'artist_not_ready'],
    [body(), ownerId, deps(profile({ status: 'archived' })), 'artist_not_ready'],
    [body(), ownerId, deps(profile({ portrait: null })), 'artist_not_ready'],
    [body(), ownerId, deps(profile({ checks: { voiceAuditioned: false, portraitReviewed: true, identityReviewed: true } })), 'artist_not_ready'],
    [body({ lyricsLanguage: 'en' }), ownerId, deps(), 'artist_language_mismatch'],
    [body({ lyricsLanguage: 'ko-en' }), ownerId, deps(), 'artist_language_mismatch'],
    [body({ lyricsLanguage: undefined }), ownerId, deps(), 'artist_language_mismatch'],
    [body({ vocalGender: 'male' }), ownerId, deps(), 'artist_gender_mismatch'],
    [body(), ownerId, deps(profile(), { ...voice, language: 'en' }), 'artist_voice_changed'],
  ];
  for (const [request, userId, dependencies, code] of cases) {
    let submissions = 0;
    await assert.rejects(async () => { await resolveArtistGeneration(request, userId, dependencies); submissions++; }, error => error.code === code);
    assert.equal(submissions, 0, code);
  }
});
test('restricted source, model, solo mode and Japan language fail explicitly', async () => {
  for (const change of [{ sourceMenu: 'viral' }, { sourceMenu: 'voice-discovery-sample' }, { sunoVersion: 'v6_mini' },
    { sunoVersion: 'v6_wild' }, { sunoVersion: undefined }, { engine: 'lyria3' }, { isInstrumental: true },
    { vocalGender: 'mixed' }, { vocalGender: 'random' }, { vocalGender: 'duet' }, { stylePrompt: 'Soul, male and female duet' },
    { selections: { vocal: ['Duet'] } }, { queueItemId: 'approved-queue' }, { voiceDesign: {} }, { sourceMenu: 'japan' }]) {
    await assert.rejects(resolveArtistGeneration(body(change), ownerId, deps()));
  }
  for (const language of ['en', 'ja']) {
    const canonical = { ...voice, language };
    const snapshot = await resolveArtistGeneration(body({ sourceMenu: 'japan', lyricsLanguage: language }), ownerId, deps(profile({ voice: canonical }), canonical));
    assert.equal(snapshot.voice.language, language);
  }
  await assert.rejects(resolveArtistGeneration(body(), ownerId, { readArtist: async () => profile(), resolveVoice: async () => { throw Error('artist_voice_not_ready'); } }), error => error.code === 'artist_voice_unavailable');
});

// Exercise the actual POST handler, with all I/O mocked. No network or provider is used.
let routeOwner = { id: ownerId }, routeArtist = profile(), routeVoice = voice;
let paidCalls = 0;
const savedEnv = Object.fromEntries(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY'].map(key => [key, process.env[key]]));
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-only';
process.env.OPENAI_API_KEY = 'unit-test-only';
const originalFetch = global.fetch;
global.fetch = async () => { paidCalls++; throw Error('network forbidden in test'); };
const studioSelection = loadTS('src/lib/voice/studio-selection.ts');
const routeImports = {
  '@/lib/lyrics/compile-sections': require('../worker/lyrics-policy'),
  '@/lib/music-duration': {}, '@/lib/voice/official-voice-selection': { resolveOfficialVoice: () => null },
  '@/lib/voice/official-voice-registry': {}, '@/lib/voice/discovery-voice-selection': { assertExclusiveVoiceSelection: () => {}, resolveDiscoveryVoice: () => null },
  '@/lib/voice/discovery-voice-registry': {}, '@/lib/voice/voice-design-prompt': {}, '@/lib/voice/designed-voice-repository': {},
  '@/lib/voice/studio-selection': studioSelection, '@/lib/artists/generation': generation,
  '@/lib/artists/repository': { readArtist: async () => routeArtist }, '@/lib/artists/voice-reference': { resolveArtistVoice: async () => routeVoice },
  '@/lib/artists/identity-signature': { signArtistIdentity: () => 'test-signature' },
  'next/server': { NextResponse: { json: (value, options = {}) => ({ status: options.status || 200, body: value }) } },
  '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: routeOwner } }) } }) },
  '@supabase/supabase-js': { createClient: () => ({}) }, 'google-auth-library': {}, '@/data/titlePlaybooks': {}, '@/lib/voice-dna-scrubber': {},
  '../../../../worker/suno-provider': { submitKieSunoJob: async () => { paidCalls++; throw Error('provider forbidden in test'); } },
  '@/lib/vle/petEpisode': {}, '@/lib/vle/petAudioPlan': {}, '@/lib/vle/viralStoryIdentity': {}, '@/lib/vle/viralStoryNovelty': {},
  '@/lib/voice/custom-voice-integrity': {}, '@/lib/voice/custom-voice-repository': {},
};
const { POST } = loadTS('src/app/api/generate/route.ts', name => {
  if (!(name in routeImports)) throw Error(`unmocked route import: ${name}`);
  return routeImports[name];
});
test('all three actual studio routes reject raw production blocks before paid I/O', async () => {
  for (const sourceMenu of ['style-library', 'preset-studio', 'japan']) {
    paidCalls = 0;
    const result = await POST({ json: async () => ({ sourceMenu, stylePrompt: 'Acoustic pop', isInstrumental: false,
      lyricsPrompt: '[male vocal, [gentle acoustic guitar] [brush drums]]\n오늘을 노래해' }) });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'lyrics_instruction_in_content');
    assert.equal(paidCalls, 0);
  }
});
test('actual route rejects foreign, stale, unavailable and incompatible artists before metadata or provider calls', async () => {
  const cases = [
    { artist: profile({ userId: 'someone-else' }), code: 'artist_not_found', status: 404 },
    { change: { artistRevision: 1 }, code: 'artist_revision_stale', status: 409 },
    { artist: profile({ status: 'archived' }), code: 'artist_not_ready', status: 409 },
    { change: { lyricsLanguage: 'en' }, code: 'artist_language_mismatch', status: 400 },
    { change: { vocalGender: 'male' }, code: 'artist_gender_mismatch', status: 400 },
    { change: { isInstrumental: true }, code: 'artist_vocal_mode_incompatible', status: 400 },
    { change: { vocalGender: 'duet' }, code: 'artist_vocal_mode_incompatible', status: 400 },
    { change: { vocalGender: 'random' }, code: 'artist_vocal_mode_incompatible', status: 400 },
    { change: { sunoVersion: 'V6_WILD' }, code: 'artist_model_incompatible', status: 400 },
    { change: { sourceMenu: 'viral' }, code: 'artist_menu_incompatible', status: 400 },
    { owner: null, code: 'artist_auth_required', status: 401 },
    { canonical: { ...voice, language: 'en' }, code: 'artist_voice_changed', status: 409 },
  ];
  for (const item of cases) {
    routeOwner = Object.hasOwn(item, 'owner') ? item.owner : { id: ownerId };
    routeArtist = item.artist || profile();
    routeVoice = item.canonical || voice;
    paidCalls = 0;
    const result = await POST({ json: async () => body(item.change) });
    assert.equal(result.status, item.status, item.code);
    assert.equal(result.body.code, item.code);
    assert.equal(paidCalls, 0, item.code);
  }
});
after(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
