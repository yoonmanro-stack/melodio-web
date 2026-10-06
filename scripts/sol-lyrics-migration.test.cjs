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
  assert.equal(call.body.response_format.type, 'json_schema'); assert.equal(call.body.messages.length, 2);
  assert.equal(call.body.response_format.json_schema.strict, true);
  assert.equal(call.body.response_format.json_schema.schema.additionalProperties, false);
  assert.ok(call.request.signal instanceof AbortSignal);
  for (const field of ['temperature', 'top_p', 'presence_penalty', 'frequency_penalty', 'max_tokens']) assert.equal(call.body[field], undefined);
}

test('single full-song success uses one fixed Sol request and preserves structured result and natural development', async () => {
  const { generateLyrics, LYRICS_MODEL } = loadLyrics(); assert.equal(LYRICS_MODEL, MODEL);
  const fixture = responder();
  const result = await generateLyrics({ stylePrompt: 'acoustic pop', topic: '가을의 일상', language: 'ko', vocalGender: 'female', durationSeconds: 180 }, fixture.dependencies);
  assert.equal(fixture.calls.length, 1); verifyFixedSol(fixture.calls[0]);
  assert.match(fixture.calls[0].body.messages[0].content, /COMPLETE SONG STRUCTURE AND NATURAL DEVELOPMENT/);
  assert.doesNotMatch(fixture.calls[0].body.messages[0].content, /TARGET: 180 SECONDS/);
  assert.match(fixture.calls[0].body.messages[1].content, /Language: Korean/);
  assert.equal(result.title, singlePayload().title); assert.equal(result.youtubeTags, '감성, 일상'); assert.equal(result.snsHashtags, '#감성');
  assert.equal(result.sections[0].content, '작성된 가사'); assert.equal(result.sections[0].description, 'intimate female vocal');
  assert.match(result.sections[0].id, /^gpt-/); assert.equal(result.lyricsPrompt, '[Verse]\n작성된 가사\n\n[Chorus]\n작성된 후렴');
  assert.match(result.stylePrompt, /^acoustic pop,/);
  assert.deepEqual(JSON.parse(JSON.stringify(result.modelUsage)), { requestedModel: MODEL, actualModel: MODEL, reasoningEffort: 'high', inputTokens: 1200, outputTokens: 800, reasoningTokens: 500 });
});

test('ordinary songs use a compact complete form and a flexible writing budget without a clock', async () => {
  const { generateLyrics } = loadLyrics();
  for (const durationSeconds of [undefined, 120, 180, 195, 210, 360]) {
    const fixture = responder();
    await generateLyrics({ stylePrompt: 'acoustic pop', durationSeconds }, fixture.dependencies);
    const prompt = fixture.calls[0].body.messages[0].content;
    assert.match(prompt, /compact, complete song/);
    assert.match(prompt, /distinct second verse/);
    assert.match(prompt, /two or three purposeful appearances in total/);
    assert.match(prompt, /bridge or another contrasting development is optional/);
    assert.match(prompt, /final chorus or equivalent closing refrain/);
    assert.match(prompt, /natural outro short/);
    assert.match(prompt, /enough original lyrical material/);
    assert.match(prompt, /Adapt this arc to the genre/);
    assert.match(prompt, /roughly 24–32 concise sung lines/);
    assert.match(prompt, /Usually use 6–8 sections/);
    assert.match(prompt, /never a double final chorus/);
    assert.match(prompt, /guides, not exact counts or a reason to truncate/);
    assert.match(prompt, /Avoid long instrumental breaks, extended solos, repeated ending cycles/);
    assert.match(prompt, /never trim returned lyrics to meet a count/);
    assert.doesNotMatch(prompt, /CRITICAL DURATION|TARGET:.*SECONDS|\b\d+:\d{2}\b|Total lyrics:|generate EXACTLY this structure|Do NOT add (?:Bridge|Pre-chorus)/);
    assert.match(prompt, /sections\[\]\.content contains only the words to be sung/);
    assert.match(prompt, /Section description fields must always stay in unbracketed English/);
    assert.equal(fixture.calls.length, 1);
    verifyFixedSol(fixture.calls[0]);
  }
});
test('ordinary lyric density uses each language’s sung units for both single songs and playlists', async () => {
  const { generateLyrics } = loadLyrics();
  const languages = [
    ['en', /For English, aim for roughly 160–220 sung words/, /For (?:French|Japanese|Korean), aim/],
    ['fr', /For French, aim for roughly 160–220 sung words/, /For (?:English|Japanese|Korean), aim/],
    ['ja', /For Japanese, aim for roughly 320–480 written lyric characters/, /For (?:English|French|Korean), aim/],
    ['ko', /For Korean, aim for roughly 260–400 Hangul syllable blocks/, /For (?:English|French|Japanese), aim/],
  ];
  for (const [language, expected, unrelated] of languages) {
    for (const isPlaylistMode of [false, true]) {
      const fixture = responder(isPlaylistMode ? playlistPayload(2) : singlePayload());
      await generateLyrics({ stylePrompt: 'acoustic pop', language, isPlaylistMode, trackCount: 2 }, fixture.dependencies);
      const prompt = fixture.calls[0].body.messages[0].content;
      assert.match(prompt, expected);
      assert.doesNotMatch(prompt, unrelated);
      assert.match(prompt, /Treat this density as a writing preference, never a hard limit/);
      if (language === 'ja' || language === 'ko') assert.match(prompt, /Do not apply an English whitespace-word budget/);
      assert.equal(fixture.calls.length, 1);
      verifyFixedSol(fixture.calls[0]);
    }
  }
});
test('Japanese and Korean slow enka or ballads prefer fewer phrases while preserving a complete natural ending', async () => {
  const { generateLyrics } = loadLyrics();
  for (const [language, stylePrompt, density] of [
    ['ja', 'Japanese enka, 72 BPM, expressive female voice', /280–420 written lyric characters/],
    ['ja', '日本語のバラード, warm female voice', /280–420 written lyric characters/],
    ['ko', '서정적인 발라드, intimate male voice', /220–360 Hangul syllable blocks/],
    ['ko', 'slow acoustic folk, warm female voice', /220–360 Hangul syllable blocks/],
  ]) {
    const fixture = responder();
    await generateLyrics({ stylePrompt, language }, fixture.dependencies);
    const prompt = fixture.calls[0].body.messages[0].content;
    assert.match(prompt, /roughly 20–28 concise sung lines/);
    assert.match(prompt, density);
    assert.match(prompt, /expressive breathing room, not extra verses or refrain cycles/);
    assert.match(prompt, /never a double final chorus/);
    assert.match(prompt, /never trim returned lyrics to meet a count/);
    assert.doesNotMatch(prompt, /roughly 24–32 concise sung lines|TARGET:.*SECONDS|\b\d+:\d{2}\b/);
    verifyFixedSol(fixture.calls[0]);
  }
});
test('playlist success preserves requested track count, titles, sections and playlist metadata', async () => {
  const { generateLyrics } = loadLyrics(); const fixture = responder(playlistPayload(3));
  const result = await generateLyrics({ stylePrompt: 'acoustic pop', topic: '세 가지 다른 일상', language: 'en', isPlaylistMode: true, trackCount: 3 }, fixture.dependencies);
  assert.equal(fixture.calls.length, 1); verifyFixedSol(fixture.calls[0]);
  assert.match(fixture.calls[0].body.messages[1].content, /full 3-track playlist/);
  const prompt = fixture.calls[0].body.messages[0].content;
  assert.match(prompt, /COMPLETE SONG STRUCTURE AND NATURAL DEVELOPMENT/);
  assert.match(prompt, /every track a compact, complete, genre-appropriate structure/);
  assert.match(prompt, /Apply the flexible writing budget separately to each track/);
  assert.match(prompt, /do not invent timestamps/);
  assert.doesNotMatch(prompt, /\b\d+:\d{2}\b|Total lyrics:|generate EXACTLY this structure/);
  assert.equal(result.playlistTitle, '선택한 플레이리스트'); assert.equal(result.youtubeDescription, '작성한 목록 설명'); assert.equal(result.tracks.length, 3);
  assert.equal(result.tracks[2].trackNumber, 3); assert.equal(result.tracks[2].title, '작성한 곡 3'); assert.equal(result.tracks[2].sections[0].content, '서로 다른 가사 3');
  assert.equal(result.modelUsage.actualModel, MODEL); assert.equal(result.modelUsage.inputTokens, 1200);
});
test('short duration preserves its timing contract and compiles canonical sections over the supplied raw prompt', async () => {
  const { generateLyrics } = loadLyrics(); const payload = singlePayload(); payload.lyricsPrompt = '[VERSE]\n작성자가 반환한 가사';
  const fixture = responder(payload);
  const result = await generateLyrics({ stylePrompt: 'acoustic pop', durationSeconds: 30 }, fixture.dependencies);
  assert.match(fixture.calls[0].body.messages[0].content, /TARGET: 26 TO 29.5 SECONDS/); assert.equal(result.lyricsPrompt, '[Verse]\n작성된 가사\n\n[Chorus]\n작성된 후렴'); verifyFixedSol(fixture.calls[0]);
  assert.doesNotMatch(fixture.calls[0].body.messages[0].content, /FLEXIBLE LYRIC DENSITY|compact, complete song/);
});

test('dedicated ultra-short and mid-form lyric requests retain their explicit timing contracts', async () => {
  const { generateLyrics } = loadLyrics();
  for (const durationSeconds of [15, 45, 60]) {
    const fixture = responder();
    await generateLyrics({ stylePrompt: 'acoustic pop', durationSeconds }, fixture.dependencies);
    const prompt = fixture.calls[0].body.messages[0].content;
    assert.match(prompt, new RegExp(`TARGET: ${durationSeconds} SECONDS`));
    assert.doesNotMatch(prompt, /COMPLETE SONG STRUCTURE AND NATURAL DEVELOPMENT|FLEXIBLE LYRIC DENSITY/);
    assert.equal(fixture.calls.length, 1);
    verifyFixedSol(fixture.calls[0]);
  }
});
test('Japan single and playlist instrumental prompts request compact natural compositions without changing the selected sound', () => {
  const filename = path.join(root, 'src/components/japan-landing-client.tsx');
  const source = fs.readFileSync(filename, 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const branches = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['finalStylePrompt', 'finalSingleStylePrompt'].includes(node.name.getText(ast))
      && node.initializer && ts.isConditionalExpression(node.initializer)) branches.set(node.name.getText(ast), node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(branches.size, 2, 'Both Japan submission modes must retain their explicit style branches');
  for (const [mode, branch] of branches) {
    const code = ts.transpileModule(`module.exports = ${branch.getText(ast)};`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const selectedStyle = 'Instrumental ambient, 45 BPM, harp and analog pads, no drums';
    const evaluate = isInstrumental => {
      const module = { exports: {} };
      vm.runInNewContext(code, { module, isInstrumental, styleTags: selectedStyle,
        resolveRotationPrompt: value => value, trackDescription: 'authored vocal context',
        mergeAndClampStyle: (style, description) => `${style}; ${description}` });
      return module.exports;
    };
    const instrumentalStyle = evaluate(true);
    assert.match(instrumentalStyle, /compact complete instrumental composition/, mode);
    assert.match(instrumentalStyle, /brief introduction, main theme and concise contrast/, mode);
    assert.match(instrumentalStyle, /purposeful theme return/, mode);
    assert.match(instrumentalStyle, /final theme resolution and short natural outro/, mode);
    assert.match(instrumentalStyle, /no extended solos or repeated ending cycles/, mode);
    assert.ok(instrumentalStyle.startsWith(selectedStyle), 'Chosen instruments, ambience and tempo must survive');
    assert.doesNotMatch(instrumentalStyle, /\b\d+:\d{2}\b|duration|seconds|complete instrumental development/i);
    assert.equal(evaluate(false), `${selectedStyle}; authored vocal context`, 'Vocal branch must preserve its selected style and section context');
  }
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
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop' }, song.dependencies), error => error.code === 'lyrics_response_structure' && /가사 파트/.test(error.message));
  const playlist = responder(playlistPayload(1));
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop', isPlaylistMode: true, trackCount: 2 }, playlist.dependencies), error => error.code === 'lyrics_response_structure' && /2곡/.test(error.message));
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
  assert.equal(response.status, 500); assert.match(response.body.error, /HTTP 403/); assert.equal(response.body.success, false); assert.equal(response.body.sections, undefined); assert.equal(fixture.calls.length, 1);
});
test('lyrics route returns a missing-key error without reading actual keys or making provider requests', async () => {
  const { generateLyrics } = loadLyrics(); let calls = 0;
  const route = loadRoute(params => generateLyrics(params, { apiKey: '', fetch: async () => { calls++; throw new Error('Unwanted request'); } }));
  const response = await route.POST({ async json() { return { stylePrompt: 'acoustic pop', isPlaylistMode: true }; } });
  assert.equal(response.status, 500); assert.match(response.body.error, /API 설정/); assert.equal(response.body.tracks, undefined); assert.equal(calls, 0);
});

test('Japan two-candidate mode requests one strict song package in Japanese', async () => {
  const { generateLyrics } = loadLyrics();
  const payload = { title: '夜を渡る灯り', youtubeTags: '夜,シティポップ', snsHashtags: '#シティポップ',
    sections: [{ type: 'verse', content: '窓の灯りが揺れている', description: 'Gentle city pop accompaniment' }] };
  const fixture = responder(payload);
  const route = loadRoute(params => generateLyrics(params, fixture.dependencies));
  const response = await route.POST({ json: async () => ({ stylePrompt: '80s Japanese City Pop', language: 'ja', isPlaylistMode: false, trackCount: 2, vocalGender: 'female' }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.sections[0].content, payload.sections[0].content);
  const request = fixture.calls[0].body;
  assert.equal(request.response_format.json_schema.name, 'melodio_lyrics_single');
  assert.deepEqual(Object.keys(request.response_format.json_schema.schema.properties), ['title', 'youtubeTags', 'snsHashtags', 'sections']);
  assert.match(request.messages[1].content, /Language: Japanese/);
  assert.equal(fixture.calls.length, 1);
});

test('playlist strict schema constrains the requested count and every nested object', async () => {
  const { generateLyrics } = loadLyrics(), fixture = responder(playlistPayload(10));
  await generateLyrics({ stylePrompt: 'city pop', language: 'ja', isPlaylistMode: true, trackCount: 10 }, fixture.dependencies);
  const schema = fixture.calls[0].body.response_format.json_schema.schema;
  assert.equal(schema.properties.tracks.minItems, 10);
  assert.equal(schema.properties.tracks.maxItems, 10);
  const track = schema.properties.tracks.items, section = track.properties.sections.items;
  assert.equal(track.additionalProperties, false);
  assert.equal(section.additionalProperties, false);
  assert.deepEqual(section.required, ['type', 'content', 'description']);
  assert.deepEqual(section.properties.type.enum, ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro']);
});

test('nullable optional description keeps legitimate Japanese sung content intact', async () => {
  const { generateLyrics } = loadLyrics(), payload = singlePayload();
  payload.sections = [{ type: 'verse', content: '私のギターが思い出を歌う', description: null }];
  const fixture = responder(payload);
  const result = await generateLyrics({ stylePrompt: 'Japanese city pop', language: 'ja' }, fixture.dependencies);
  assert.equal(result.sections[0].content, payload.sections[0].content);
  assert.equal(result.sections[0].description, undefined);
  assert.equal(result.lyricsPrompt, '[Verse]\n' + payload.sections[0].content);
  assert.equal(fixture.calls.length, 1);
});

test('wrong response wrappers and malformed section types fail with a friendly contract error', async () => {
  const { generateLyrics } = loadLyrics();
  for (const payload of [{ song: singlePayload() }, { tracks: [singlePayload()] },
    { ...singlePayload(), title: undefined, songTitle: 'Alias' },
    { ...singlePayload(), sections: [{ type: 123, content: 'Authored lyric', description: '' }] }]) {
    const fixture = responder(payload);
    await assert.rejects(generateLyrics({ stylePrompt: 'city pop', language: 'ja' }, fixture.dependencies),
      error => error.code === 'lyrics_response_structure' && /곡 제목이나 가사 파트/.test(error.message));
    assert.equal(fixture.calls.length, 1);
  }
});

test('lyrics route rejects ambiguous mode and invalid counts before a model request', async () => {
  let calls = 0;
  const route = loadRoute(async () => { calls++; throw Error('Unexpected model request'); });
  for (const change of [{ stylePrompt: '   ' }, { isPlaylistMode: 'false' }, { trackCount: '2' }, { trackCount: 0 }, { trackCount: 41 }]) {
    const response = await route.POST({ json: async () => ({ stylePrompt: 'city pop', ...change }) });
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

test('lyrics route returns the friendly response-shape code without generated sections', async () => {
  const { generateLyrics } = loadLyrics(), fixture = responder({ title: 'Missing sections' });
  const route = loadRoute(params => generateLyrics(params, fixture.dependencies));
  const response = await route.POST({ json: async () => ({ stylePrompt: 'Japanese city pop', language: 'ja', isPlaylistMode: false, trackCount: 2 }) });
  assert.equal(response.status, 502);
  assert.equal(response.body.code, 'lyrics_response_structure');
  assert.equal(response.body.success, false);
  assert.match(response.body.error, /가사 파트/);
  assert.equal(response.body.sections, undefined);
  assert.equal(fixture.calls.length, 1);
});

test('strict JSON format still rejects production instructions in sung content before returning lyrics', async () => {
  const { generateLyrics } = loadLyrics(), payload = singlePayload();
  payload.sections = [{ type: 'verse', content: '[male vocal, warm guitar]', description: 'Music direction' }];
  const fixture = responder(payload);
  const route = loadRoute(params => generateLyrics(params, fixture.dependencies));
  const response = await route.POST({ json: async () => ({ stylePrompt: 'city pop', language: 'ja' }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'lyrics_instruction_in_content');
  assert.equal(response.body.sections, undefined);
  assert.equal(fixture.calls.length, 1);
});
