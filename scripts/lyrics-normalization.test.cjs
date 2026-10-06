/** Offline generation/approval contracts. All model replies are synthetic; external fetch and environment keys are forbidden. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const policy = require(path.join(root, 'worker/lyrics-policy.js'));
const { buildKieSunoRequest } = require(path.join(root, 'worker/suno-provider.js'));

function loadTs(relative, modules) {
  const filename = path.join(root, relative);
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(name) { if (Object.hasOwn(modules, name)) return modules[name]; throw new Error('Unmocked offline dependency: ' + name); },
    process: { env: new Proxy({}, { get() { throw new Error('Environment access forbidden'); } }) },
    fetch() { throw new Error('External network forbidden'); },
    console: { log() {}, warn() {}, error() {} }, Date, Math, Error, AbortSignal,
  }, { filename });
  return module.exports;
}

function loadEngine() {
  return loadTs('src/lib/engines/lyrics-generator.ts', {
    '@/lib/lyrics/compile-sections': policy,
    '@/lib/db/knowledge': { getPlaybookByKey: async () => null, matchPlaybooksByPrompt: async () => [], matchEpisodesByCategoryAndTopic: async () => [] },
    '@/lib/engines/infinite-story-matrix': { generateBoundlessCreativeVector: () => ({ uniqueEntropySeed: 'offline', perspectiveType: 'authored', thematicDimension: 'theme', sensoryFocus: 'senses' }) },
    '@/lib/vle/vleEngine': { loadVLEMasterPrompt: () => '' },
    '@/lib/vle/viralSongSpec': { buildStructureDirective: () => '' },
  });
}

function fixture(payload) {
  const calls = [];
  return { calls, dependencies: { apiKey: 'offline-fixture-key', fetch: async (_url, request) => {
    calls.push(request);
    return { ok: true, status: 200, json: async () => ({
      model: 'gpt-5.6-sol', usage: { prompt_tokens: 1200, completion_tokens: 800, completion_tokens_details: { reasoning_tokens: 500 } },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    }) };
  } } };
}

const safeSections = [
  { type: 'verse', content: '  오늘 [기억]을 노래해  ', description: 'male vocal, [warm guitar] [brushed drums]' },
  { type: 'chorus', content: '내 기타 소리에 춤을 추네', description: 'intimate male vocal' },
];
const canonical = '[Verse]\n오늘 [기억]을 노래해\n\n[Chorus]\n내 기타 소리에 춤을 추네';
const song = (sections = safeSections) => ({
  title: 'Offline authored title', youtubeTags: 'offline,tags', snsHashtags: '#offline', sections,
  lyricsPrompt: '[male vocal, [warm guitar] [brushed drums], close microphone production]',
});

/** Evaluate the real Queue render/guard/hash statements without creating a DB client. */
function approve(single) {
  const filename = path.join(root, 'src/lib/channel-system/generation-queue-service.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const render = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'renderSections');
  const hashFunction = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'hashLyrics');
  let choice;
  function visit(node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => ts.isIdentifier(item.name)
      && item.name.text === 'lyricsPrompt' && item.initializer?.getText(tree).startsWith('renderSections(sections)'))) choice = node;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(render && hashFunction && choice, 'Queue must prefer the shared canonical compiler');
  const statements = choice.parent.statements;
  const offset = statements.indexOf(choice);
  const body = render.getText(tree) + '\n' + hashFunction.getText(tree) + '\nconst sections=single.sections;\n'
    + statements.slice(offset, offset + 3).map(node => node.getText(tree)).join('\n') + '\nexports.approved={lyricsPrompt,hash};';
  const output = { exports: {} };
  vm.runInNewContext(ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: output.exports, single, compileLyricsSections: policy.compileLyricsSections,
    assertSafeVocalLyrics: policy.assertSafeVocalLyrics, createHash: crypto.createHash,
  });
  return output.exports.approved;
}

const unsafe = [
  ['short two-clause metadata', '[male vocal, warm guitar]'],
  ['adjacent metadata blocks', '[warm guitar][brushed drums]'],
  ['plain production list', 'male vocal, warm guitar, brushed drums'],
  ['explicit production label', 'Music directions: male vocal, warm guitar'],
  ['nested production metadata', '[male vocal, [warm guitar] [brushed drums], close microphone]'],
];

test('generated normalized sections, Queue approval/hash and provider input are identical while metadata is preserved', async () => {
  const { generateLyrics } = loadEngine();
  const mock = fixture(song());
  const result = await generateLyrics({ stylePrompt: 'acoustic pop', language: 'ko', vocalGender: 'male', durationSeconds: 180 }, mock.dependencies);
  assert.equal(mock.calls.length, 1);
  assert.equal(result.lyricsPrompt, canonical);
  assert.equal(result.title, 'Offline authored title');
  assert.equal(result.youtubeTags, 'offline,tags');
  assert.equal(result.snsHashtags, '#offline');
  assert.equal(result.sections[0].description, safeSections[0].description);
  assert.equal(result.modelUsage.actualModel, 'gpt-5.6-sol');
  const approved = approve({ ...result, lyricsPrompt: '[Verse]\nDifferent raw model text' });
  assert.equal(approved.lyricsPrompt, canonical);
  assert.equal(approved.hash, crypto.createHash('sha256').update(canonical.normalize('NFKC').replace(/\s+/g, ' ').trim()).digest('hex'));
  const { input } = buildKieSunoRequest({ style: 'acoustic pop', lyrics: result.lyricsPrompt, lyricsSections: result.sections, model: 'V6', instrumental: false, durationSeconds: 180 });
  assert.equal(input.prompt, approved.lyricsPrompt);
});

for (const [name, content] of unsafe) test('generator and Queue reject ' + name + ' without a safe-looking raw fallback', async () => {
  const { generateLyrics } = loadEngine();
  const payload = song([{ type: 'verse', content, description: 'production context' }]);
  payload.lyricsPrompt = '[Verse]\nSafe-looking raw fallback';
  const mock = fixture(payload);
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop', language: 'ko' }, mock.dependencies), error => error.code === 'lyrics_instruction_in_content');
  assert.equal(mock.calls.length, 1);
  assert.throws(() => approve({ sections: payload.sections, lyricsPrompt: payload.lyricsPrompt }), error => error.code === 'lyrics_instruction_in_content');
});

test('playlist validation rejects unsafe track content before returning any playlist', async () => {
  const { generateLyrics } = loadEngine();
  const payload = { playlistTitle: 'Offline playlist', youtubeDescription: 'Preserved description', youtubeTags: 'playlist', snsHashtags: '#playlist',
    tracks: [{ trackNumber: 1, title: 'Good', sections: safeSections }, { trackNumber: 2, title: 'Bad', sections: [{ type: 'verse', content: unsafe[2][1] }] }] };
  const mock = fixture(payload);
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop', language: 'ko', isPlaylistMode: true, trackCount: 2 }, mock.dependencies), error => error.code === 'lyrics_instruction_in_content');
  assert.equal(mock.calls.length, 1);
});

test('safe playlist keeps track and playlist metadata and permits authored instrument words', async () => {
  const { generateLyrics } = loadEngine();
  const payload = { playlistTitle: 'Offline playlist', youtubeDescription: 'Preserved description', youtubeTags: 'playlist', snsHashtags: '#playlist',
    tracks: [{ trackNumber: 1, title: 'One', youtubeTags: 'one', snsHashtags: '#one', sections: safeSections },
      { trackNumber: 2, title: 'Two', youtubeTags: 'two', snsHashtags: '#two', sections: [{ type: 'verse', content: 'I remember your piano, my guitar carries love, our drums sing memories' }] }] };
  const result = await generateLyrics({ stylePrompt: 'acoustic pop', language: 'ko', isPlaylistMode: true, trackCount: 2 }, fixture(payload).dependencies);
  assert.equal(result.playlistTitle, payload.playlistTitle);
  assert.equal(result.youtubeDescription, payload.youtubeDescription);
  assert.equal(result.tracks[1].title, 'Two');
  assert.equal(result.tracks[1].youtubeTags, 'two');
  assert.equal(result.tracks[1].snsHashtags, '#two');
  assert.equal(result.tracks[1].sections[0].content, payload.tracks[1].sections[0].content);
});

test('Queue checks raw fallback only when no usable sections exist', () => {
  assert.equal(approve({ sections: [], lyricsPrompt: '내 기타 소리에 춤을 추네' }).lyricsPrompt, '내 기타 소리에 춤을 추네');
  assert.throws(() => approve({ sections: [], lyricsPrompt: unsafe[2][1] }), error => error.code === 'lyrics_instruction_in_content');
});

test('empty model sections remain invalid even when the model supplies raw lyrics', async () => {
  const { generateLyrics } = loadEngine();
  await assert.rejects(generateLyrics({ stylePrompt: 'acoustic pop' }, fixture(song([])).dependencies), error => error.code === 'lyrics_response_structure');
});

function story() {
  return { hook: ['내 기타 소리에 추억이 춤을 춰', '네 마음을 다시 불러', '오늘을 기억해'], verse: ['낡은 피아노 옆에 네가 웃네', '우리의 노래가 돌아와'],
    memoryAnchor: '우리 노래', twist: '다시 만남', tagOutro: '다시 네 마음을 부르네', finalPunch: '오늘도 사랑을 노래해' };
}
function loadStoryFormatter() {
  return loadTs('src/lib/vle/viralSongSpec.ts', { '@/lib/lyrics/compile-sections': policy }).formatLyricsToSuno;
}

for (const field of ['hook', 'verse', 'tagOutro', 'finalPunch']) {
  for (const [name, content] of [unsafe[0], unsafe[4]]) test('story formatter rejects ' + name + ' in ' + field + ' before stripping brackets', () => {
    const payload = story();
    if (Array.isArray(payload[field])) payload[field] = [content];
    else payload[field] = content;
    assert.throws(() => loadStoryFormatter()(payload), error => error.code === 'lyrics_instruction_in_content');
  });
}
test('story formatter preserves legitimate instrument narratives', () => {
  const result = loadStoryFormatter()(story());
  assert.ok(result.includes('내 기타 소리에 추억이 춤을 춰'));
  assert.ok(result.includes('낡은 피아노 옆에 네가 웃네'));
  assert.ok(result.includes('오늘도 사랑을 노래해'));
});
