/** Pure Japan preset regression matrix. No environment, database, network or media access. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = '131c667';
const MODEL = 'gpt-5.6-sol';
const KEY = 'offline-japan-fixture-key';
const TRAP = 'OFFLINE_UNRELATED_EPISODE_RANDOM_ACOUSTIC_TRAP';
const IDS = [
  'romance-pop', 'lofi-study', 'cozy-jazz-cafe', 'acoustic-healing', 'kawaii-future',
  'okinawa-sanshin', 'kyoto-ambient', 'anime-rock', 'tokyo-future-funk', 'sapporo-snow',
  'shibuya-neon-rock', 'kamakura-surf', 'osaka-street-food', 'fuji-meditation',
  'ghibli-fantasy', 'akiba-chiptune', 'okinawa-sunset', 'citypop-midnight',
  'cozy-rainy-cafe', 'lofi-dreamy-moon', 'spring-sakura', 'akihabara-cyber',
  'harajuku-pop-rock', 'enoshima-surf', 'asakusa-traditional', 'ginza-neon-jazz',
  'yokohama-port-acoustic', 'rainy-day-enka', 'tokyo-subway-commute',
];
const LANGUAGES = [['ja', 'Japanese'], ['en', 'English'], ['ja-en', 'a mix of Japanese and English']];
const GENDERS = ['female', 'male', 'duet', 'mixed'];
const SPECIAL = new Set(['lofi-study', 'kawaii-future']);
const TYPES = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'];
const INSTRUMENTAL_DEFAULTS = new Set(['cozy-jazz-cafe', 'okinawa-sanshin', 'kyoto-ambient', 'sapporo-snow',
  'fuji-meditation', 'akiba-chiptune', 'cozy-rainy-cafe', 'lofi-dreamy-moon', 'asakusa-traditional']);
const GENRE_ANCHORS = {
  'romance-pop': /city pop.*funk.*electric-piano/i,
  'lofi-study': /lo-fi hip hop.*swung.*Rhodes/i,
  'cozy-jazz-cafe': /jazz.*upright bass.*brushed drums.*saxophone/i,
  'acoustic-healing': /acoustic folk.*fingerpicked.*guitar/i,
  'kawaii-future': /future bass.*modulated synth.*half-time.*sub-bass/i,
  'okinawa-sanshin': /sanshin-led Okinawan folk.*pentatonic/i,
  'kyoto-ambient': /garden ambient.*koto.*bamboo-flute/i,
  'anime-rock': /Japanese rock.*live drums.*guitar/i,
  'tokyo-future-funk': /future funk.*disco.*octave bass/i,
  'sapporo-snow': /piano lo-fi.*piano.*felted-key/i,
  'shibuya-neon-rock': /indie rock.*overdriven guitars.*live drums/i,
  'kamakura-surf': /coastal acoustic folk.*fingerpicked guitar.*slide-guitar/i,
  'osaka-street-food': /brass funk.*syncopated bass.*trumpet-and-trombone/i,
  'fuji-meditation': /koto meditation ambient.*drones/i,
  'ghibli-fantasy': /orchestral waltz.*triple meter.*strings.*harp/i,
  'akiba-chiptune': /8-bit chiptune.*pulse-wave.*triangle-wave.*noise-channel/i,
  'okinawa-sunset': /island acoustic ballad.*guitar.*sanshin/i,
  'citypop-midnight': /city pop.*bass.*electric-piano.*saxophone/i,
  'cozy-rainy-cafe': /café piano ballad.*acoustic-piano.*rubato/i,
  'lofi-dreamy-moon': /Rhodes lo-fi.*electric-piano.*laid-back beat/i,
  'spring-sakura': /acoustic folk.*open-string guitar.*shaker/i,
  'akihabara-cyber': /cyber synthwave.*electronic backbeat.*sequenced bass/i,
  'harajuku-pop-rock': /synth pop rock.*guitar.*synth hooks.*live-drum/i,
  'enoshima-surf': /surf rock.*twangy.*spring reverb on guitar/i,
  'asakusa-traditional': /traditional ambient.*shakuhachi.*koto.*temple-bell/i,
  'ginza-neon-jazz': /swing jazz.*trumpet.*walking upright bass/i,
  'yokohama-port-acoustic': /acoustic ballad.*nylon-string guitar.*piano/i,
  'rainy-day-enka': /enka ballad.*swaying.*shamisen.*strings/i,
  'tokyo-subway-commute': /city pop.*R&B.*electric piano.*saxophone/i,
};
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const historical = relative => execFileSync('git', ['show', `${BASELINE}:${relative}`], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024,
});
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const profiles = JSON.parse(read('worker/japan-preset-profiles.json'));
const blockedEnvironment = new Proxy({}, { get() { throw new Error('Environment reads are forbidden in this suite'); } });
const blockedFetch = async () => { throw new Error('External fetch is forbidden in this suite'); };
const quietConsole = { log() {}, warn() {}, error() {} };

function evaluateTs(relative, source, modules = {}) {
  const module = { exports: {} };
  const fixtureMath = Object.create(Math);
  fixtureMath.random = () => 0.25;
  const code = ts.transpileModule(source ?? read(relative), { fileName: relative,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    require(name) { if (Object.hasOwn(modules, name)) return modules[name]; throw new Error(`Unmocked module: ${name}`); },
    process: { env: blockedEnvironment }, fetch: blockedFetch, console: quietConsole,
    Date, Math: fixtureMath, Error, AbortSignal, URL,
  }, { filename: relative });
  return module.exports;
}
const helper = evaluateTs('src/lib/japan-preset-profile.ts', undefined, {
  '../../worker/japan-preset-profiles.json': profiles,
});
const studioProfileModule = { getPresetStudioProfile: () => undefined,
  isPresetStudioSource: source => ['preset-studio', 'audio-forge', 'audio-forge-pro', 'audio'].includes(source) };
const formModule = evaluateTs('src/lib/lyrics/validate-song-form.ts');

function loadWorker(relative, revision) {
  const cache = new Map();
  function load(filename) {
    filename = filename.replace(/\\/g, '/');
    if (!/^worker\/[a-z0-9-]+\.(?:js|json)$/.test(filename)) throw new Error(`Unmocked worker module: ${filename}`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = revision ? historical(filename) : read(filename);
    const module = { exports: {} };
    cache.set(filename, module);
    if (filename.endsWith('.json')) module.exports = JSON.parse(source);
    else vm.runInNewContext(source, { module, exports: module.exports,
      require(name) {
        if (!name.startsWith('./')) throw new Error(`Unmocked worker dependency: ${name}`);
        const extension = path.extname(name) ? '' : '.js';
        return load(path.posix.join(path.posix.dirname(filename), name + extension));
      }, process: { env: blockedEnvironment }, fetch: blockedFetch, console: quietConsole,
      Error, RangeError, URL, AbortSignal, setTimeout, clearTimeout,
    }, { filename });
    return module.exports;
  }
  return load(relative);
}
const policy = loadWorker('worker/lyrics-policy.js');
const provider = loadWorker('worker/suno-provider.js');
const vocalPolicy = loadWorker('worker/japan-vocal-policy.js');

function loadLyrics(source) {
  const probe = { knowledgeCalls: 0 };
  const playbook = { title: TRAP, content: `Use unrelated comic episodes, 193 BPM and generic acoustic piano. ${TRAP}` };
  const knowledge = {
    getPlaybookByKey: async () => { probe.knowledgeCalls++; return playbook; },
    matchPlaybooksByPrompt: async () => { probe.knowledgeCalls++; return [playbook]; },
    matchEpisodesByCategoryAndTopic: async () => { probe.knowledgeCalls++; return [{ title: TRAP, category: TRAP,
      protagonist: TRAP, antagonist: TRAP, emotionalArc: TRAP, summary: TRAP, punchline: TRAP, visualPrompt: TRAP }]; },
  };
  const exports = evaluateTs('src/lib/engines/lyrics-generator.ts', source, {
    '@/lib/japan-preset-profile': helper,
    '@/lib/preset-studio-profile': studioProfileModule,
    '@/lib/lyrics/validate-song-form': formModule,
    '@/lib/lyrics/compile-sections': policy,
    '@/lib/db/knowledge': knowledge,
    '@/lib/engines/infinite-story-matrix': { generateBoundlessCreativeVector: () => ({
      uniqueEntropySeed: 'offline', perspectiveType: TRAP, thematicDimension: TRAP, sensoryFocus: TRAP,
    }) },
    '@/lib/vle/vleEngine': { loadVLEMasterPrompt: () => '' },
    '@/lib/vle/viralSongSpec': { buildStructureDirective: () => '' },
  });
  return { ...exports, probe };
}
const current = loadLyrics();
const baseline = loadLyrics(historical('src/lib/engines/lyrics-generator.ts'));

function sections(language = 'ja', number = 1) {
  const line = language === 'en' ? `I remember your smile beside the evening window ${number}`
    : language === 'ja-en' ? `君と歩いた道で I remember your smile ${number}`
      : `君と歩いた道の光を私は忘れない ${number}`;
  return TYPES.map((type, index) => ({ type,
    content: type === 'intro' || type === 'outro' ? ''
      : Array.from({ length: type === 'verse' ? 9 : 4 }, (_, i) => `${line} ${index + 1}-${i + 1}`).join('\n'),
    description: index === 0 ? 'Sparse opening; natural lead entry' : 'Warm melody; fuller refrain',
  }));
}
function payload(language, playlist = false) {
  const song = number => ({ title: `Authored song ${number}`, youtubeTags: 'evening, window', snsHashtags: '#evening', sections: sections(language, number) });
  return playlist ? { playlistTitle: 'Authored playlist', youtubeDescription: 'Distinct evening scenes',
    youtubeTags: 'evening', snsHashtags: '#evening', tracks: [1, 2].map(number => ({ trackNumber: number, ...song(number) })) } : song(1);
}
function responder(body) {
  const calls = [];
  return { calls, dependencies: { apiKey: KEY, fetch: async (url, request) => {
    calls.push({ url, method: request.method, headers: request.headers, signal: request.signal, body: JSON.parse(request.body) });
    return { ok: true, status: 200, async json() { return { model: MODEL,
      usage: { prompt_tokens: 800, completion_tokens: 500, completion_tokens_details: { reasoning_tokens: 200 } },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }],
    }; } };
  } } };
}
function assertModel(fixture) {
  assert.equal(fixture.calls.length, 1);
  const call = fixture.calls[0];
  assert.equal(call.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.Authorization, `Bearer ${KEY}`);
  assert.ok(call.signal instanceof AbortSignal);
  assert.equal(call.body.model, MODEL);
  assert.equal(call.body.reasoning_effort, 'high');
  assert.equal(call.body.max_completion_tokens, 32000);
  assert.equal(call.body.response_format.type, 'json_schema');
  assert.equal(call.body.response_format.json_schema.strict, true);
  assert.equal(call.body.response_format.json_schema.schema.additionalProperties, false);
  for (const key of ['temperature', 'top_p', 'max_tokens', 'duration', 'durationSeconds']) assert.equal(call.body[key], undefined);
}
function structureCore(prompt) {
  return prompt.match(/## COMPLETE SONG STRUCTURE AND NATURAL DEVELOPMENT\n([\s\S]*?)(?=\n## |$)/)?.[1].trim();
}
function assertNaturalForm(prompt) {
  const core = structureCore(prompt);
  assert.ok(core);
  assert.deepEqual([...core.matchAll(/^[1-6]\. .*\(type: "([^"]+)"\)/gm)].map(match => match[1]), TYPES);
  assert.equal([...core.matchAll(/^[24]\. Verse [12] \(type: "verse"\) - 5 coherent sung lines/gm)].length, 2);
  assert.equal([...core.matchAll(/^[35]\. Chorus \(type: "chorus"\) - 4 lines/gm)].length, 2);
  assert.match(core, /not a reason to truncate requested lyric phrases or returned lyrics/);
  assert.match(core, /natural cadence/);
  assert.doesNotMatch(prompt, /TARGET:\s*\d|CRITICAL DURATION|\b\d+:\d{2}\b|3rd Chorus/);
  return core;
}
function verifyReturned(result, authored, playlist = false) {
  const songs = playlist ? result.tracks : [result];
  const originals = playlist ? authored.tracks : [authored];
  for (let i = 0; i < songs.length; i++) {
    assert.equal(songs[i].title, originals[i].title);
    assert.deepEqual(plain(songs[i].sections.map(({ type, content, description }) => ({ type, content, description }))), originals[i].sections);
    const compiled = policy.compileLyricsSections(songs[i].sections).lyricsPrompt;
    assert.doesNotMatch(compiled, /Sparse opening|Warm melody|natural lead entry|fuller refrain/);
    assert.ok(compiled.includes(originals[i].sections[1].content), 'Long authored verses must not be cropped to the guidance');
    if (!playlist) assert.equal(result.lyricsPrompt, compiled);
  }
  assert.equal(result.modelUsage.actualModel, MODEL);
}
function japanInput(id, language, vocalGender, selected, playlist = false) {
  return { sourceMenu: 'japan', presetId: id, stylePrompt: profiles[id].recipe,
    topic: 'A promised evening walk; keep my original phrase', language, vocalGender,
    vocalProfileSpecified: selected, durationSeconds: 195, isPlaylistMode: playlist, trackCount: 2 };
}

test('29 durable profiles contain concise distinct recipes, selectable modes and backing-only effects', () => {
  const importPath = read('src/lib/japan-preset-profile.ts').match(/import profiles from ['"]([^'"]+)['"]/)?.[1];
  assert.ok(importPath);
  assert.equal(path.resolve(ROOT, 'src/lib', importPath), path.join(ROOT, 'worker/japan-preset-profiles.json'));
  assert.deepEqual(Object.keys(profiles).sort(), [...IDS].sort());
  assert.equal(new Set(IDS).size, 29);
  for (const id of IDS) {
    const p = profiles[id];
    for (const key of ['genreLabel', 'genreKey', 'recipe', 'instrumentalRecipe', 'defaultVocal', 'lyricTheme', 'descriptionKo', 'descriptionEn', 'descriptionJa']) {
      assert.equal(typeof p[key], 'string', `${id}/${key}`);
      assert.ok(p[key].trim().length > 0, `${id}/${key}`);
    }
    assert.ok(p.recipe.length >= 250 && p.recipe.length <= 450, `${id}: concise reviewed recipe`);
    assert.ok(p.instrumentalRecipe.length <= 450, `${id}: concise instrumental recipe`);
    assert.ok(['vocal', 'instrumental'].includes(p.defaultMode), id);
    assert.equal(p.defaultMode, INSTRUMENTAL_DEFAULTS.has(id) ? 'instrumental' : 'vocal', id);
    assert.match(p.recipe, GENRE_ANCHORS[id], `${id}: retain the reviewed genre and defining instruments`);
    assert.notEqual(p.recipe, p.instrumentalRecipe, id);
    assert.doesNotMatch(p.instrumentalRecipe, /\b(?:vocals?|sung|singers?|lyrics|singing|duet|female|male)\b/i, id);
    assert.doesNotMatch(p.recipe, /\b(?:cute pitched vocals|chipmunk|childlike vocals|vocoder lead|\d+\s*BPM)\b/i, id);
    assert.doesNotMatch(p.defaultVocal, /\b(?:female|male|duet|Japanese|English|chipmunk|pitch.shifted)\b/i, id);
  }
  assert.equal(new Set(IDS.map(id => profiles[id].recipe)).size, 29);
  assert.equal(new Set(IDS.map(id => profiles[id].defaultVocal)).size, 29);
  assert.match(profiles['kawaii-future'].recipe, /sidechain on synths only.*synth-only chops/);
  assert.match(profiles['lofi-study'].recipe, /tape color to instruments only/);
});

test('catalog helper switches only catalog-owned modes and preserves every manual edit verbatim', () => {
  for (const id of IDS) {
    const p = profiles[id];
    assert.equal(helper.getJapanPresetProfile(id), p);
    assert.equal(helper.resolveJapanPresetStyle(p.recipe, id, true), p.instrumentalRecipe);
    assert.equal(helper.resolveJapanPresetStyle(p.instrumentalRecipe, id, false), p.recipe);
    for (const style of [`  ${p.recipe}, my original 147 BPM and vocal color  `, '', '  Personal arrangement\nwith exact spacing  ']) {
      for (const instrumental of [false, true]) assert.equal(helper.resolveJapanPresetStyle(style, id, instrumental), style);
    }
    assert.equal(helper.resolveJapanPresetStyle(p.recipe, `${id}-custom`, true), p.recipe);
  }
  for (const id of [undefined, '', '__proto__', 'constructor', 'toString', 'ROMANCE-POP']) assert.equal(helper.getJapanPresetProfile(id), undefined);
  const custom = { id: 'romance-pop', origin: 'custom', instrumentalOnly: false };
  const db = { id: 'romance-pop', origin: 'db', instrumentalOnly: true };
  const enka = { id: 'rainy-day-enka', origin: 'db', instrumentalOnly: false };
  const original = [custom, db, enka, { id: 'romance-pop', origin: 'builtin' }, { id: 'lofi-study', origin: 'builtin' }];
  const unique = helper.uniqueJapanPresets(original);
  assert.deepEqual(plain(unique.map(item => item.id)), ['romance-pop', 'rainy-day-enka', 'lofi-study']);
  assert.equal(unique[0], custom);
  assert.equal(unique[1], enka);
  assert.equal(original.length, 5);
});

test('28 built-in cards and locale descriptions use reviewed profiles without changing mode flags or identity', () => {
  const source = read('src/components/japan-landing-client.tsx');
  // Evaluate only the array initializer, never import the React component or its side effects.
  const extract = text => {
    const file = ts.createSourceFile('japan.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let expression, imageExpression;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'jpPresets') expression = node.initializer.getText(file);
      if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'JP_PRESET_IMAGES') imageExpression = node.initializer.getText(file);
      ts.forEachChild(node, visit);
    }
    visit(file);
    assert.ok(expression);
    assert.ok(imageExpression);
    return vm.runInNewContext(ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
      { getJapanPresetProfile: helper.getJapanPresetProfile, JP_PRESET_IMAGES: vm.runInNewContext(`(${imageExpression})`) });
  };
  const cards = extract(source), oldCards = extract(historical('src/components/japan-landing-client.tsx'));
  assert.equal(cards.length, 28);
  assert.equal(new Set(cards.map(card => card.id)).size, 28);
  assert.deepEqual(plain(cards.map(card => card.id)), plain(oldCards.map(card => card.id)));
  for (const card of cards) {
    const old = oldCards.find(item => item.id === card.id);
    assert.equal(card.tags, profiles[card.id].recipe);
    assert.equal(card.desc, profiles[card.id].descriptionKo);
    assert.equal(card.lyricsTemplate, '');
    if (card.id === 'asakusa-traditional') assert.equal(card.name, 'Asakusa Traditional (아사쿠사 전통 앰비언트)');
    else assert.equal(card.name, old.name, `${card.id}/name`);
    for (const key of ['category', 'cardImage', 'defaultTitle', 'defaultTopic', 'instrumentalOnly', 'isInstrumental']) {
      assert.equal(card[key], old[key], `${card.id}/${key}`);
    }
  }
  const translations = evaluateTs('src/data/jp-presets-translations.ts', undefined, { '@/lib/japan-preset-profile': helper }).jpPresetTranslations;
  for (const card of cards) {
    for (const [locale, field] of [['ko', 'descriptionKo'], ['en', 'descriptionEn'], ['ja', 'descriptionJa']]) {
      assert.equal(translations[card.id][`desc_${locale}`], profiles[card.id][field]);
    }
  }
  assert.match(source, /resolveJapanPresetStyle\(resolveArtistMusicStyle\(manualStyleTags, artistState\.defaultMusicStyle\), selectedPresetId, isInstrumental\)/);
  assert.match(source, /uniqueJapanPresets\(\[\.\.\.mappedCustoms, \.\.\.mappedDb, \.\.\.mappedDefaults\]\)/);
  assert.match(source, /customPrompt: profile\?\.recipe \|\| p\.customPrompt/);
  assert.match(source, /instrumentalOnly: p\.instrumentalOnly \?\? trans\.instrumentalOnly \?\? trans\.isInstrumental/);
});

function initializer(source, name) {
  const file = ts.createSourceFile('japan.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) result = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(result, name);
  return ts.transpileModule(`(${result})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

test('executed UI selection initializes nine instrumental defaults, honors chosen artists and keeps built-ins toggleable', () => {
  const source = read('src/components/japan-landing-client.tsx');
  const selectionCode = initializer(source, 'handleSelectPreset');
  const instrumentCalls = [];
  const artistState = { artistVoice: null };
  const context = { getJapanPresetProfile: helper.getJapanPresetProfile, artistState,
    setIsInstrumental: value => instrumentCalls.push(value) };
  for (const setter of ['setSelectedPresetId', 'setTitle', 'setTopic', 'setStyleTags', 'setExcludePrompt',
    'setLyricsSections', 'setTracks', 'setDynamicElements', 'setAmbienceVolume', 'setIsAsmrEnabled', 'setAmbientFoley']) context[setter] = () => {};
  const select = vm.runInNewContext(selectionCode, context);
  for (const id of IDS) for (const voice of [null, { id: 'chosen-artist' }]) {
    artistState.artistVoice = voice;
    instrumentCalls.length = 0;
    select({ id, tags: profiles[id].recipe, instrumentalOnly: false });
    assert.deepEqual(instrumentCalls, [!voice && INSTRUMENTAL_DEFAULTS.has(id)], `${id}/${Boolean(voice)}`);
    instrumentCalls.length = 0;
    select({ id, instrumentalOnly: true });
    assert.deepEqual(instrumentCalls, [true], 'An explicit instrumental-only DB contract still takes precedence');
  }
  instrumentCalls.length = 0;
  select({ id: 'custom-japan', instrumentalOnly: false });
  select(null);
  assert.deepEqual(instrumentCalls, [], 'Unknown custom presets preserve the current user mode');
  const originals = IDS.map(id => ({ id, instrumentalOnly: false }));
  const samples = vm.runInNewContext(initializer(source, 'samplePresets'), {
    visibleJpPresets: originals, getJapanPresetProfile: helper.getJapanPresetProfile,
  });
  assert.equal(samples.filter(p => p.instrumentalOnly).length, 9);
  assert.ok(originals.every(p => p.instrumentalOnly === false), 'Sample request masks must not lock editable cards');
  for (const sample of samples) assert.equal(sample.instrumentalOnly, INSTRUMENTAL_DEFAULTS.has(sample.id));
  assert.match(source, /onInstrumentalToggle=\{\(next\) => \{ if \(next \|\| !activePreset\?\.instrumentalOnly\) setIsInstrumental\(next\); \}\}/);
  assert.match(source, /artistContextKey=\{JSON\.stringify\(artistState\.requestFields\)\}/);
  assert.match(source, /lyricTopic=\{topic\}/);
});

test('lyrics route forwards Japan and reviewed studio sources with a strict chosen-voice boolean', async () => {
  const calls = [];
  const route = evaluateTs('src/app/api/lyrics/generate/route.ts', undefined, {
    '@/lib/preset-studio-profile': studioProfileModule,
    '@/lib/engines/lyrics-generator': { generateLyrics: async params => { calls.push(params); return { title: 'Offline route fixture' }; } },
    'next/server': { NextResponse: { json(body, options = {}) { return { body, status: options.status || 200 }; } } },
  });
  for (const sourceMenu of ['japan', 'preset-studio', 'audio-forge', 'audio-forge-pro', 'audio', undefined, 'japan-copy']) for (const selected of [true, false, 'true', undefined]) {
    const body = { stylePrompt: profiles['romance-pop'].recipe, presetId: 'romance-pop', sourceMenu, vocalProfileSpecified: selected };
    const result = await route.POST({ json: async () => body });
    assert.equal(result.status, 200);
    const params = calls.at(-1);
    if (sourceMenu === 'japan' || studioProfileModule.isPresetStudioSource(sourceMenu)) {
      assert.equal(params.sourceMenu, sourceMenu);
      assert.equal(params.vocalProfileSpecified, selected === true);
    } else {
      assert.equal(Object.hasOwn(params, 'sourceMenu'), false);
      assert.equal(Object.hasOwn(params, 'vocalProfileSpecified'), false);
    }
  }
  const builder = read('src/components/prompt-builder/LyricsBuilder.tsx');
  assert.match(builder, /isJapanCampaign \? \{ sourceMenu: 'japan', vocalProfileSpecified: Boolean\(artistVoice \|\| selectedVoice\) \}/);
});

for (const selected of [false, true]) {
  test(`ordinary single matrix: 29 presets × 3 languages × 4 genders, ${selected ? 'chosen voice' : 'default voice'} (348 offline requests)`, async () => {
    const start = current.probe.knowledgeCalls;
    let commonCore;
    for (const id of IDS) for (const [language, label] of LANGUAGES) for (const gender of GENDERS) {
      const authored = payload(language), fixture = responder(authored);
      const result = await current.generateLyrics(japanInput(id, language, gender, selected), fixture.dependencies);
      assertModel(fixture);
      const [system, user] = fixture.calls[0].body.messages.map(message => message.content);
      const core = assertNaturalForm(system);
      if (commonCore === undefined) commonCore = core;
      assert.equal(core, commonCore, `${id}/${language}/${gender}`);
      assert.equal(result.stylePrompt, profiles[id].recipe);
      assert.ok(system.includes(profiles[id].genreLabel));
      assert.ok(system.includes(profiles[id].lyricTheme));
      assert.ok(user.includes(profiles[id].recipe));
      assert.ok(user.includes(profiles[id].lyricTheme));
      assert.match(user, new RegExp(`Language: ${label}`));
      assert.match(user, new RegExp(`Vocal Target: ${gender}`));
      assert.match(system, /plain, unbracketed English, at most two short clauses and 60 characters total/);
      assert.match(system, /all production directions stay out of sung content/);
      assert.match(user, /GENRE-FAITHFUL ORIGINALITY/);
      assert.doesNotMatch(system + user, new RegExp(TRAP));
      assert.doesNotMatch(system + user, /OBSIDIAN STORY EPISODES DB|BOUNDLESS IMAGINATION RULE/);
      if (selected) {
        assert.match(system, /A chosen voice is active/);
        assert.ok(!system.includes(profiles[id].defaultVocal));
      } else assert.ok(system.includes(profiles[id].defaultVocal));
      if (gender !== 'mixed') assert.match(system, new RegExp(gender === 'duet' ? 'male and female duet' : `for a ${gender} vocalist`));
      verifyReturned(result, authored);
    }
    assert.equal(current.probe.knowledgeCalls, start, 'Known ordinary Japan profiles must skip generic playbook and episode lookup');
  });
}

test('playlist matrix preserves recipe, language, gender and distinct complete songs for all 29 profiles', async () => {
  const start = current.probe.knowledgeCalls;
  for (const id of IDS) for (const [language, label] of LANGUAGES) {
    const gender = GENDERS[IDS.indexOf(id) % GENDERS.length];
    const authored = payload(language, true), fixture = responder(authored);
    const result = await current.generateLyrics(japanInput(id, language, gender, true, true), fixture.dependencies);
    assertModel(fixture);
    const [system, user] = fixture.calls[0].body.messages.map(message => message.content);
    assertNaturalForm(system);
    assert.match(system, /generate Intro, Verse 1, Chorus, Verse 2, Chorus, Outro sections/);
    assert.ok(system.includes(`requested language style: "${label}"`));
    assert.ok(user.includes(profiles[id].lyricTheme));
    assert.ok(!system.includes(profiles[id].defaultVocal));
    assert.doesNotMatch(system + user, new RegExp(TRAP));
    assert.equal(result.stylePrompt, profiles[id].recipe);
    assert.notEqual(result.tracks[0].sections[1].content, result.tracks[1].sections[1].content);
    verifyReturned(result, authored, true);
  }
  assert.equal(current.probe.knowledgeCalls, start);
});

test('explicit user tempo, voice color and long descriptions survive without random substitutions or lyric truncation', async () => {
  for (const id of IDS) {
    const style = `Chosen naturally high husky register with airy grain, 147 BPM, ${profiles[id].recipe}`;
    const authored = payload('ja-en');
    authored.sections[1].description = 'Preserve the chosen naturally high husky register with airy grain; sparse motif expands into the refrain';
    const fixture = responder(authored);
    const result = await current.generateLyrics({ ...japanInput(id, 'ja-en', 'duet', true), stylePrompt: style }, fixture.dependencies);
    assert.equal(result.stylePrompt, style);
    assert.equal(result.stylePrompt.match(/147 BPM/g).length, 1);
    assert.doesNotMatch(result.stylePrompt, /key of|193 BPM|featuring warm acoustic piano/);
    verifyReturned(result, authored);
    const prepared = policy.prepareLyricsSubmission({ stylePrompt: result.stylePrompt, lyricsSections: result.sections, isInstrumental: false, vocalGender: 'duet' });
    assert.ok(prepared.stylePrompt.includes(authored.sections[1].description));
    assert.ok(!prepared.lyricsPrompt.includes(authored.sections[1].description));
    assert.ok(prepared.lyricsPrompt.includes(authored.sections[1].content));
  }
});

test('unknown IDs, non-Japan menus, explicit short forms and viral modes retain baseline lyric request bodies', async () => {
  const cases = [
    { presetId: 'custom-japan', sourceMenu: 'japan' },
    { presetId: 'romance-pop-copy', sourceMenu: 'japan' },
    { presetId: 'ROMANCE-POP', sourceMenu: 'japan' },
    { presetId: 'city-pop', sourceMenu: 'japan' },
    { presetId: '__proto__', sourceMenu: 'japan' },
    ...IDS.map(presetId => ({ presetId, sourceMenu: 'preset-studio' })),
    { presetId: 'romance-pop' }, { presetId: 'romance-pop', sourceMenu: 'japan-copy' },
    { presetId: 'brazilian-funk-kpop-performance', sourceMenu: 'preset-studio' },
    ...IDS.flatMap(presetId => [30, 60].map(durationSeconds => ({ presetId, sourceMenu: 'japan', durationSeconds }))),
    ...[10, 15, 16, 31, 45].map(durationSeconds => ({ presetId: 'romance-pop', sourceMenu: 'japan', durationSeconds })),
    ...IDS.map(presetId => ({ presetId, sourceMenu: 'japan', viralMode: true })),
    { presetId: 'romance-pop', sourceMenu: 'japan', viralMode: true, durationSeconds: 30 },
  ];
  for (const params of cases) for (const playlist of [false, true]) {
    const input = { stylePrompt: 'Original city pop, chosen husky register, 147 BPM', language: 'ja-en', vocalGender: 'male',
      vocalProfileSpecified: true, isPlaylistMode: playlist, trackCount: 2, ...params };
    const authored = payload('ja-en', playlist);
    if (params.presetId === 'brazilian-funk-kpop-performance' && !params.viralMode && !(params.durationSeconds <= 60)) {
      for (const song of authored.tracks || [authored]) song.sections = ['intro', 'verse', 'pre-chorus', 'chorus', 'verse', 'pre-chorus', 'chorus', 'outro'].map(type => ({
        type, content: ['intro', 'outro'].includes(type) ? '' : '君と歩いた道で I remember your smile', description: 'Warm melody',
      }));
    }
    const oldFixture = responder(authored), nextFixture = responder(authored);
    const oldResult = await baseline.generateLyrics(input, oldFixture.dependencies);
    const nextResult = await current.generateLyrics(input, nextFixture.dependencies);
    assert.equal(digest(nextFixture.calls[0].body), digest(oldFixture.calls[0].body), `${params.presetId}/${params.sourceMenu}/${params.durationSeconds}/${playlist}`);
    assert.equal(nextResult.stylePrompt, oldResult.stylePrompt);
    assertModel(nextFixture);
  }
});

const baseMusic = { sourceMenu: 'japan', instrumental: false, naturalFullSong: true, model: 'V6', title: 'Authored title',
  lyrics: '[Verse]\n君と歩いた道を私は忘れない\n\n[Chorus]\n明日も君の笑顔を思い出す', exclude: 'harsh drums', durationSeconds: 195 };
const nativeGender = gender => ({ female: 'f', male: 'm', duet: 'duet', mixed: 'mixed' })[gender];

test('provider matrix keeps all 29 recipes and requested singers; native lyric/persona/timing fields remain intact', () => {
  for (const id of IDS) for (const [language] of LANGUAGES) for (const gender of GENDERS) for (const selected of [false, true]) {
    const voice = selected ? { vocalProfileSpecified: true, personaId: 'offline_voice_123', personaModel: 'voice_persona' } : {};
    const style = `${selected ? 'Chosen low husky register with airy grain, 147 BPM, ' : ''}${profiles[id].recipe}`;
    const options = { ...baseMusic, presetId: id, language, vocalGender: nativeGender(gender), ...voice, style };
    const request = provider.buildKieSunoRequest(options), r = request.input;
    assert.equal(request.model, 'ai-music-api/generate');
    assert.equal(r.model, 'V6');
    assert.equal(r.prompt, options.lyrics);
    assert.equal(r.title, options.title);
    assert.equal(r.custom_mode, true);
    assert.equal(r.instrumental, false);
    assert.ok(r.style.includes(style), `${id}: genre recipe and early selected voice must fit intact`);
    assert.ok(r.style.length <= 1000);
    assert.equal(r.vocal_gender, ['female', 'male'].includes(gender) ? nativeGender(gender) : undefined);
    assert.equal(r.persona_id, voice.personaId);
    assert.equal(r.persona_model, voice.personaModel);
    for (const key of ['duration', 'sourceMenu', 'presetId', 'vocalProfileSpecified', 'language']) assert.equal(Object.hasOwn(r, key), false, key);
    assert.doesNotMatch(r.style, /\b\d+:\d{2}\b|TARGET:|cut off|fade at/i);
    if (!SPECIAL.has(id)) {
      assert.equal(r.negative_tags, baseMusic.exclude);
      if (selected) {
        assert.match(r.style, /Preserve the chosen vocal timbre, register and phrasing/);
        assert.ok(!r.style.includes(profiles[id].defaultVocal));
      } else assert.ok(r.style.includes(`Default lead: ${profiles[id].defaultVocal}.`));
    }
  }
});

test('27-preset guard skips the two established policies and all out-of-scope requests without fitting', () => {
  const unchanged = { style: '  authored style  ', exclude: '  authored exclusions  ' };
  const cases = [
    ...[...SPECIAL].map(presetId => ({ presetId })),
    { presetId: 'romance-pop', sourceMenu: 'preset-studio' },
    { presetId: 'romance-pop', instrumental: true },
    { presetId: 'romance-pop', naturalFullSong: false },
    { presetId: 'romance-pop', naturalFullSong: undefined },
    { presetId: 'romance-pop-copy' }, { presetId: '__proto__' },
  ];
  for (const override of cases) {
    const result = vocalPolicy.protectJapanLeadVocal({ ...baseMusic, ...override }, unchanged.style, unchanged.exclude,
      () => { throw new Error('Out-of-scope fitting is forbidden'); });
    assert.deepEqual(plain(result), unchanged);
  }
  const oldProvider = loadWorker('worker/suno-provider.js', BASELINE);
  for (const presetId of SPECIAL) {
    const options = { ...baseMusic, presetId, style: profiles[presetId].recipe };
    assert.equal(digest(provider.buildKieSunoRequest(options)), digest(oldProvider.buildKieSunoRequest(options)), presetId);
  }
});

test('registered style-personas preserve their chosen character without a separate voice-selection flag', () => {
  for (const id of IDS.filter(id => !SPECIAL.has(id))) {
    const options = { ...baseMusic, presetId: id, personaId: 'offline_style_123', personaModel: 'style_persona',
      style: `Chosen airy high tenor, 147 BPM, ${profiles[id].recipe}` };
    const r = provider.buildKieSunoRequest(options).input;
    assert.match(r.style, /Preserve the chosen vocal timbre, register and phrasing/);
    assert.ok(!r.style.includes(profiles[id].defaultVocal));
    assert.ok(r.style.includes(options.style));
    assert.equal(r.persona_id, options.personaId);
    assert.equal(r.persona_model, 'style_persona');
  }
});

test('reserved vocal budget is idempotent and preserves early identity/tempo plus complete words', () => {
  for (const id of IDS.filter(id => !SPECIAL.has(id))) for (const selected of [false, true]) {
    const options = { ...baseMusic, presetId: id, vocalProfileSpecified: selected };
    const prefix = `Chosen husky register, 147 BPM, ${profiles[id].recipe}, `;
    const style = (prefix + 'whole instrumental variation, '.repeat(50)).slice(0, 1000);
    const once = vocalPolicy.protectJapanLeadVocal(options, style, '  authored negatives  ', provider.fitSunoStylePrompt);
    const twice = vocalPolicy.protectJapanLeadVocal(options, once.style, once.exclude, provider.fitSunoStylePrompt);
    assert.equal(digest(once), digest(twice), `${id}/${selected}`);
    assert.ok(once.style.length <= 1000);
    assert.ok(once.style.includes('Chosen husky register, 147 BPM'));
    assert.equal(once.exclude, '  authored negatives  ');
    const cueEnd = once.style.indexOf(', Chosen husky register');
    assert.ok(cueEnd > 0);
    const tail = once.style.slice(cueEnd + 2);
    assert.ok(style.startsWith(tail), `${id}: original arrangement order must be preserved`);
    if (tail.length < style.length) assert.match(style[tail.length], /[\s,;\n]/, `${id}: complete final clause or word`);
  }
});

test('provider instrumentals, dedicated samples and non-Japan requests remain byte-identical to baseline', () => {
  const oldProvider = loadWorker('worker/suno-provider.js', BASELINE);
  for (const id of IDS) {
    const cases = [
      { sourceMenu: 'preset-studio', style: profiles[id].recipe, instrumental: false },
      { sourceMenu: 'japan', style: helper.resolveJapanPresetStyle(profiles[id].recipe, id, true), instrumental: true, lyrics: '' },
      ...[10, 30, 45, 60].map(durationSeconds => ({ sourceMenu: 'japan', style: profiles[id].recipe, naturalFullSong: false, durationSeconds })),
    ];
    for (const override of cases) {
      const options = { ...baseMusic, presetId: id, vocalGender: 'm', personaId: 'offline_voice_123', ...override };
      const actual = provider.buildKieSunoRequest(options), expected = oldProvider.buildKieSunoRequest(options);
      assert.equal(digest(actual), digest(expected), `${id}/${override.sourceMenu}/${override.instrumental}/${override.durationSeconds}`);
      if (override.naturalFullSong === false) assert.equal(actual.input.duration, override.durationSeconds);
      if (override.instrumental) {
        assert.equal(actual.input.prompt, '');
        assert.equal(actual.input.style, profiles[id].instrumentalRecipe);
        assert.equal(actual.input.persona_id, undefined);
        assert.equal(actual.input.vocal_gender, undefined);
      }
    }
  }
  for (const presetId of ['custom-japan', 'romance-pop-copy', 'ROMANCE-POP']) {
    const options = { ...baseMusic, presetId, style: 'Original manual city pop with clear guitar and saxophone' };
    assert.equal(digest(provider.buildKieSunoRequest(options)), digest(oldProvider.buildKieSunoRequest(options)));
  }
});

test('production metadata in sung fields still fails safely with one offline lyric request', async () => {
  const authored = payload('ja');
  authored.sections[1].content = '[female vocal, synth bass, electronic drums]';
  const fixture = responder(authored);
  await assert.rejects(current.generateLyrics(japanInput('anime-rock', 'ja', 'female', true), fixture.dependencies),
    error => error.code === 'lyrics_instruction_in_content');
  assert.equal(fixture.calls.length, 1);
});
