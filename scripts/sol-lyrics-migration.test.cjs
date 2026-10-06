/** Offline Sol lyrics migration: injected fetch/key, stubbed DB/prompt references. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const CHAT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5.6-sol';
const KEY = 'offline-fixture-key';
function loadLyrics() {
  const filename = path.join(root, 'src/lib/engines/lyrics-generator.ts');
  const module = { exports: {} };
  const offlineProbe = { knowledgeCalls: 0 };
  const knowledge = { getPlaybookByKey: async () => { offlineProbe.knowledgeCalls++; return null; }, matchPlaybooksByPrompt: async () => { offlineProbe.knowledgeCalls++; return []; }, matchEpisodesByCategoryAndTopic: async () => { offlineProbe.knowledgeCalls++; return []; } };
  const modules = {
    '@/lib/lyrics/compile-sections': require(path.join(root, 'worker/lyrics-policy.js')),
    '@/lib/db/knowledge': knowledge,
    '@/lib/engines/infinite-story-matrix': { generateBoundlessCreativeVector: () => ({ uniqueEntropySeed: 'offline', perspectiveType: 'authored perspective', thematicDimension: 'authored theme', sensoryFocus: 'authored sensory focus' }) },
    '@/lib/vle/vleEngine': { loadVLEMasterPrompt: () => '' },
    '@/lib/vle/viralSongSpec': { buildStructureDirective: () => '' },
  };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(name) { if (Object.hasOwn(modules, name)) return modules[name]; throw new Error(`Unmocked module: ${name}`); },
    process: { env: new Proxy({}, { get() { throw new Error('Offline tests must never read environment keys'); } }) },
    fetch: async () => { throw new Error('Uninjected external fetch is forbidden'); },
    console: { log() {}, warn() {}, error() {} }, Date, Math, Error, AbortSignal,
  }, { filename });
  return { ...module.exports, offlineProbe };
}
function loadRoute(engine) {
  const filename = path.join(root, 'src/app/api/lyrics/generate/route.ts');
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(name) {
      if (name === '@/lib/engines/lyrics-generator') return { generateLyrics: engine };
      if (name === 'next/server') return { NextResponse: { json(body, options = {}) { return { body, status: options.status || 200 }; } } };
      throw new Error(`Unmocked route module: ${name}`);
    }, Error,
  }, { filename });
  return module.exports;
}
const section = (type = 'verse', content = '  작성된 가사  ') => ({ type, content, description: '  intimate female vocal  ' });
const singlePayload = () => ({ title: '사용자가 정한 감성의 곡', youtubeTags: '감성, 일상', snsHashtags: '#감성', sections: [section(), section('chorus', '  작성된 후렴  ')] });
const playlistPayload = count => ({ playlistTitle: '선택한 플레이리스트', youtubeDescription: '작성한 목록 설명', youtubeTags: 'playlist', snsHashtags: '#playlist', tracks: Array.from({ length: count }, (_, i) => ({ trackNumber: i + 1, title: `작성한 곡 ${i + 1}`, youtubeTags: `track${i + 1}`, snsHashtags: `#track${i + 1}`, sections: [section('verse', `  서로 다른 가사 ${i + 1}  `)] })) });
function responder(payload = singlePayload(), options = {}) {
  const calls = [];
  const dependencies = { apiKey: KEY, fetch: async (url, request) => {
    const body = JSON.parse(request.body); calls.push({ url, request, body });
    if (options.networkError) throw new Error('PRIVATE_NETWORK_DIAGNOSTIC');
    return { ok: options.status === undefined || options.status === 200, status: options.status || 200,
      body: { async cancel() { options.cancelled = true; } },
      async json() { if (options.invalidEnvelope) throw new Error('PRIVATE_PROVIDER_BODY'); return { model: options.omitModel ? undefined : options.actualModel || MODEL, usage: options.omitUsage ? undefined : { prompt_tokens: 1200, completion_tokens: 800, completion_tokens_details: { reasoning_tokens: 500 } }, choices: [{ finish_reason: options.finishReason || 'stop', message: { content: options.content === undefined ? JSON.stringify(payload) : options.content, refusal: options.refusal } }] }; },
    };
  } };
  return { calls, dependencies };
}
function verifyFixedSol(call) {
  assert.equal(call.url, CHAT); assert.equal(call.request.method, 'POST'); assert.equal(call.request.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(call.body.model, MODEL); assert.equal(call.body.reasoning_effort, 'high'); assert.equal(call.body.max_completion_tokens, 32000);
  assert.equal(call.body.response_format.type, 'json_object'); assert.equal(call.body.messages.length, 2);
  assert.ok(call.request.signal instanceof AbortSignal);
  for (const field of ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty', 'max_tokens']) assert.equal(call.body[field], undefined);
}

test('single full-song success uses one fixed Sol request and preserves structured result and duration instructions', async () => {
  const { generateLyrics, LYRICS_MODEL } = loadLyrics(); assert.equal(LYRICS_MODEL, MODEL);
  const fixture = responder();
  const result = await generateLyrics({ stylePrompt: 'acoustic pop', topic: '가을의 일상', language: 'ko', vocalGender: 'female', durationSeconds: 180 }, fixture.dependencies);
  assert.equal(fixture.calls.length, 1); verifyFixedSol(fixture.calls[0]);
  assert.match(fixture.calls[0].body.messages[0].content, /TARGET: 180 SECONDS/);
  assert.match(fixture.calls[0].body.messages[1].content, /Language: Korean/);
  assert.equal(result.title, singlePayload().title); assert.equal(result.youtubeTags, '감성, 일상'); assert.equal(result.snsHashtags, '#감성');
  assert.equal(result.sections[0].content, '작성된 가사'); assert.equal(result.sections[0].description, 'intimate female vocal');
  assert.match(result.sections[0].id, /^gpt-/); assert.equal(result.lyricsPrompt, '[Verse]\n작성된 가사\n\n[Chorus]\n작성된 후렴');
  assert.match(result.stylePrompt, /^acoustic pop,/);
  assert.deepEqual(JSON.parse(JSON.stringify(result.modelUsage)), { requestedModel: MODEL, actualModel: MODEL, reasoningEffort: 'high', inputTokens: 1200, outputTokens: 800, reasoningTokens: 500 });
});
test('playlist success preserves requested track count, titles, sections and playlist metadata', async () => {
  const { generateLyrics } = loadLyrics(); const fixture = responder(playlistPayload(3));
  const result = await generateLyrics({ stylePrompt: 'acoustic pop', topic: '세 가지 다른 일상', language: 'en', isPlaylistMode: true, trackCount: 3 }, fixture.dependencies);
  assert.equal(fixture.calls.length, 1); verifyFixedSol(fixture.calls[0]);
  assert.match(fixture.calls[0].body.messages[1].content, /full 3-track playlist/);
  assert.equal(result.playlistTitle, '선택한 플레이리스트'); assert.equal(result.youtubeDescription, '작성한 목록 설명'); assert.equal(result.tracks.length, 3);
  assert.equal(result.tracks[2].trackNumber, 3); assert.equal(result.tracks[2].title, '작성한 곡 3'); assert.equal(result.tracks[2].sections[0].content, '서로 다른 가사 3');
  assert.equal(result.modelUsage.actualModel, MODEL); assert.equal(result.modelUsage.inputTokens, 1200);
});
test('short duration preserves its timing contract and compiles canonical sections over the supplied raw prompt', async () => {
  const { generateLyrics } = loadLyrics(); const payload = singlePayload(); payload.lyricsPrompt = '[VERSE]\n작성자가 반환한 가사';
  const fixture = responder(payload);
  const result = await generateLyrics({ stylePrompt: 'acoustic pop', durationSeconds: 30 }, fixture.dependencies);
  assert.match(fixture.calls[0].body.messages[0].content, /TARGET: 26 TO 29.5 SECONDS/); assert.equal(result.lyricsPrompt, '[Verse]\n작성된 가사\n\n[Chorus]\n작성된 후렴'); verifyFixedSol(fixture.calls[0]);
});
test('missing injected key fails before DB, provider or mock generation for both modes', async () => {
  const { generateLyrics, offlineProbe } = loadLyrics(); let calls = 0;
  for (const isPlaylistMode of [false, true]) await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop', isPlaylistMode }, { apiKey: '', fetch: async () => { calls++; throw new Error('Unwanted provider call'); } }), /API 설정/);
  assert.equal(calls, 0); assert.equal(offlineProbe.knowledgeCalls, 0);
});
for (const status of [400, 403, 429, 500]) test(`HTTP ${status} fails without a downgrade, retry or sample lyrics`, async () => {
  const { generateLyrics } = loadLyrics(); const options = { status }; const fixture = responder(singlePayload(), options);
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop' }, fixture.dependencies), error => /GPT-5.6-sol/.test(error.message) && error.message.includes(`HTTP ${status}`));
  assert.equal(fixture.calls.length, 1); verifyFixedSol(fixture.calls[0]); assert.equal(options.cancelled, true);
});
test('network failures propagate one compact error without exposing diagnostics or substituting lyrics', async () => {
  const { generateLyrics } = loadLyrics(); const fixture = responder(singlePayload(), { networkError: true });
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop' }, fixture.dependencies), error => /연결이 중단/.test(error.message) && !error.message.includes('PRIVATE_'));
  assert.equal(fixture.calls.length, 1); verifyFixedSol(fixture.calls[0]);
});
for (const options of [{ content: '{invalid' }, { content: '' }, { finishReason: 'length' }, { actualModel: 'gpt-4o' }, { invalidEnvelope: true }, { refusal: 'not possible' }, { omitUsage: true }, { omitModel: true }]) test(`invalid/incomplete provider output is never treated as successful lyrics (${Object.keys(options)[0]})`, async () => {
  const { generateLyrics } = loadLyrics(); const fixture = responder(singlePayload(), options);
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop' }, fixture.dependencies), error => /응답을 확인하지/.test(error.message) && !error.message.includes('PRIVATE_'));
  assert.equal(fixture.calls.length, 1); verifyFixedSol(fixture.calls[0]);
});
test('empty song sections and incomplete playlists fail their existing structured contracts', async () => {
  const { generateLyrics } = loadLyrics();
  const song = responder({ title: 'Empty', sections: [] });
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop' }, song.dependencies), /Invalid single track/);
  const playlist = responder(playlistPayload(1));
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop', isPlaylistMode: true, trackCount: 2 }, playlist.dependencies), /Invalid playlist/);
  assert.equal(song.calls.length, 1); assert.equal(playlist.calls.length, 1);
});
test('lyrics route preserves result fields and returns verified Sol provenance within a longer route deadline', async () => {
  const { generateLyrics, LYRICS_PROVIDER_TIMEOUT_MS } = loadLyrics();
  const fixture = responder(singlePayload(), { actualModel: 'gpt-5.6-sol-2026-09-01' });
  const route = loadRoute(params => generateLyrics(params, fixture.dependencies));
  assert.ok(route.maxDuration * 1000 > LYRICS_PROVIDER_TIMEOUT_MS);
  const response = await route.POST({ async json() { return { stylePrompt: 'acoustic pop' }; } });
  assert.equal(response.status, 200); assert.equal(response.body.success, true); assert.equal(response.body.title, singlePayload().title);
  assert.equal(response.body.modelUsage.requestedModel, MODEL); assert.equal(response.body.modelUsage.actualModel, 'gpt-5.6-sol-2026-09-01');
  assert.equal(fixture.calls.length, 1); verifyFixedSol(fixture.calls[0]);
});
test('lyrics route returns an error for provider failure without success/sample output', async () => {
  const { generateLyrics } = loadLyrics(); const fixture = responder(singlePayload(), { status: 403 });
  const route = loadRoute(params => generateLyrics(params, fixture.dependencies));
  const response = await route.POST({ async json() { return { stylePrompt: 'acoustic pop' }; } });
  assert.equal(response.status, 500); assert.match(response.body.error, /HTTP 403/); assert.equal(response.body.success, undefined); assert.equal(response.body.sections, undefined); assert.equal(fixture.calls.length, 1);
});
test('lyrics route returns a missing-key error without reading actual keys or making provider requests', async () => {
  const { generateLyrics } = loadLyrics(); let calls = 0;
  const route = loadRoute(params => generateLyrics(params, { apiKey: '', fetch: async () => { calls++; throw new Error('Unwanted request'); } }));
  const response = await route.POST({ async json() { return { stylePrompt: 'acoustic pop', isPlaylistMode: true }; } });
  assert.equal(response.status, 500); assert.match(response.body.error, /API 설정/); assert.equal(response.body.tracks, undefined); assert.equal(calls, 0);
});
