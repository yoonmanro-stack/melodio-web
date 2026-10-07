/** Real reviewed profiles, injected model responses, forbidden external I/O. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const profiles = require('../worker/preset-studio-profiles.json');
const japanProfiles = require('../worker/japan-preset-profiles.json');
const policy = require('../worker/lyrics-policy.js');
const sources = ['preset-studio', 'audio-forge', 'audio-forge-pro', 'audio'];
const ordinary = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'];
const performance = ['intro', 'verse', 'pre-chorus', 'chorus', 'verse', 'pre-chorus', 'chorus', 'outro'];
const trap = 'UNRELATED_STALE_PLAYBOOK_AND_COMIC_EPISODE';

function evaluate(relative, modules = {}) {
  const module = { exports: {} };
  const fixtureMath = Object.create(Math);
  fixtureMath.random = () => 0.25;
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    require(name) { if (Object.hasOwn(modules, name)) return modules[name]; throw new Error(`Unmocked module: ${name}`); },
    process: { env: new Proxy({}, { get() { throw new Error('Environment access forbidden'); } }) },
    fetch: async () => { throw new Error('External network forbidden'); },
    console: { log() {}, warn() {}, error() {} }, Math: fixtureMath, Date, Error, AbortSignal,
  }, { filename: relative });
  return module.exports;
}
const helper = evaluate('src/lib/preset-studio-profile.ts', { '../../worker/preset-studio-profiles.json': profiles });
const form = evaluate('src/lib/lyrics/validate-song-form.ts');
const probe = { knowledgeCalls: 0 };
const knowledge = {
  getPlaybookByKey: async () => { probe.knowledgeCalls++; return { title: trap, content: trap }; },
  matchPlaybooksByPrompt: async () => { probe.knowledgeCalls++; return [{ title: trap, content: trap }]; },
  matchEpisodesByCategoryAndTopic: async () => { probe.knowledgeCalls++; return [{ title: trap, summary: trap }]; },
};
const engine = evaluate('src/lib/engines/lyrics-generator.ts', {
  '@/lib/preset-studio-profile': helper,
  '@/lib/japan-preset-profile': { getJapanPresetProfile: id => japanProfiles[id] },
  '@/lib/lyrics/validate-song-form': form,
  '@/lib/lyrics/compile-sections': policy,
  '@/lib/db/knowledge': knowledge,
  '@/lib/engines/infinite-story-matrix': { generateBoundlessCreativeVector: () => ({
    uniqueEntropySeed: 'offline', perspectiveType: trap, thematicDimension: trap, sensoryFocus: trap,
  }) },
  '@/lib/vle/vleEngine': { loadVLEMasterPrompt: () => '' },
  '@/lib/vle/viralSongSpec': { buildStructureDirective: () => '' },
});
function song(id = 'uk_grime', number = 1) {
  const types = profiles[id]?.performanceSectionCount === 8 ? performance : ordinary;
  return { title: `Authored scene ${number}`, youtubeTags: 'scene', snsHashtags: '#scene',
    sections: types.map((type, index) => ({ type,
      content: ['intro', 'outro'].includes(type) ? ''
        : Array.from({ length: type === 'verse' ? 9 : 4 }, (_, line) => `I follow your light home ${number}-${index}-${line}`).join('\n'),
      description: index === 0 ? 'Sparse opening' : 'Clear lead; fuller refrain',
    })),
  };
}
const playlist = id => ({ playlistTitle: 'Authored scenes', youtubeDescription: 'Two scenes', youtubeTags: 'scene', snsHashtags: '#scene',
  tracks: [1, 2].map(number => ({ trackNumber: number, ...song(id, number) })) });
function fixture(payload) {
  const calls = [];
  return { calls, dependencies: { apiKey: 'offline-fixture-key', fetch: async (_url, request) => {
    calls.push(JSON.parse(request.body));
    return { ok: true, json: async () => ({ model: 'gpt-5.6-sol', usage: { prompt_tokens: 1, completion_tokens: 1 },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    }) };
  } } };
}

test('all 211 profiles preserve original musical context and skip stale playbooks in single songs and playlists', async () => {
  const start = probe.knowledgeCalls;
  let index = 0;
  for (const [id, profile] of Object.entries(profiles)) for (const isPlaylistMode of [false, true]) {
    const selected = index % 2 === 0;
    const style = `${selected ? profile.selectedVoiceRecipe : profile.recipe}, user tempo 147 BPM, original muted horn`;
    const authored = isPlaylistMode ? playlist(id) : song(id), mock = fixture(authored);
    const result = await engine.generateLyrics({ sourceMenu: sources[index++ % sources.length], presetId: id,
      stylePrompt: style, topic: 'My requested lighthouse reunion', vocalProfileSpecified: selected,
      vocalGender: 'female', language: 'en', isPlaylistMode, trackCount: 2, durationSeconds: 195,
    }, mock.dependencies);
    const text = mock.calls[0].messages.map(message => message.content).join('\n');
    assert.equal(result.stylePrompt, style, `${id}: selected recipe changed`);
    assert.ok(text.includes(profile.genreLabel), `${id}: genre missing`);
    assert.ok(text.includes('My requested lighthouse reunion'), `${id}: requested topic missing`);
    assert.ok(text.includes('explicit user tempo remain authoritative'), `${id}: tempo precedence missing`);
    assert.ok(!text.includes(trap), `${id}: stale narrative escaped isolation`);
    assert.ok(!text.includes('key of G major'), `${id}: random key injected`);
    assert.ok(!text.includes('CRITICAL DURATION'), `${id}: clock instruction injected`);
    assert.equal(mock.calls.length, 1);
    const returned = result.tracks || [result], original = authored.tracks || [authored];
    for (let i = 0; i < returned.length; i++) {
      assert.equal(returned[i].sections.length, profile.performanceSectionCount === 8 ? 8 : 6);
      assert.equal(returned[i].sections[1].content, original[i].sections[1].content, `${id}: authored words cropped`);
      assert.ok(!policy.compileLyricsSections(returned[i].sections).lyricsPrompt.includes('Clear lead'), `${id}: direction sung`);
    }
  }
  assert.equal(probe.knowledgeCalls, start);
});

test('chosen artist register and explicit user edits override catalog vocal defaults across allowed sources', async () => {
  for (const sourceMenu of sources) for (const vocalGender of ['female', 'male', 'duet']) {
    const style = 'My edited UK Grime, chosen low husky voice, 151 BPM, original strings';
    const mock = fixture(song());
    const result = await engine.generateLyrics({ sourceMenu, presetId: 'uk_grime', stylePrompt: style,
      vocalProfileSpecified: true, vocalGender, language: 'ko', topic: 'My own story',
    }, mock.dependencies);
    const system = mock.calls[0].messages[0].content;
    assert.equal(result.stylePrompt, style);
    assert.ok(system.includes('do not impose the catalog default vocal color'));
    assert.ok(!system.includes(profiles.uk_grime.defaultVocal));
    assert.ok(system.includes('Explicit user edits take precedence over catalog defaults'));
  }
});

test('catalog default lead directions are applied only when no voice or explicit vocal direction is supplied', async () => {
  const mock = fixture(song('vocaloid_pop'));
  await engine.generateLyrics({ sourceMenu: 'preset-studio', presetId: 'vocaloid_pop',
    stylePrompt: profiles.vocaloid_pop.recipe, vocalProfileSpecified: false,
  }, mock.dependencies);
  assert.ok(mock.calls[0].messages[0].content.includes(profiles.vocaloid_pop.defaultVocal));
  assert.ok(mock.calls[0].messages[0].content.includes('the user has not supplied a vocal direction'));
});

test('missing verses, missing endings, empty hooks and extra cycles fail before result normalization', async () => {
  const base = song();
  const malformed = [[base.sections[1]], base.sections.slice(0, -1),
    base.sections.filter((_, index) => index !== 3), [...base.sections, base.sections[4], base.sections[5]],
    base.sections.map((section, index) => index === 2 ? { ...section, content: '  ' } : section)];
  for (const sections of malformed) for (const isPlaylistMode of [false, true]) {
    const payload = isPlaylistMode ? playlist('uk_grime') : song();
    (payload.tracks?.[1] || payload).sections = sections;
    const mock = fixture(payload);
    await assert.rejects(engine.generateLyrics({ sourceMenu: 'preset-studio', presetId: 'uk_grime',
      stylePrompt: profiles.uk_grime.recipe, isPlaylistMode, trackCount: 2,
    }, mock.dependencies), error => error.code === 'lyrics_response_structure');
    assert.equal(mock.calls.length, 1);
  }
});

test('dedicated short and viral requests keep their independent forms and do not activate reviewed ordinary profiles', async () => {
  for (const change of [{ durationSeconds: 30 }, { viralMode: true }, { durationSeconds: 30, viralMode: true }]) {
    const authored = song();
    authored.sections = authored.sections.filter(section => ['intro', 'chorus', 'outro'].includes(section.type)).slice(0, 3);
    const mock = fixture(authored);
    const result = await engine.generateLyrics({ sourceMenu: 'preset-studio', presetId: 'uk_grime',
      stylePrompt: profiles.uk_grime.recipe, ...change,
    }, mock.dependencies);
    assert.equal(result.sections.length, 3);
    assert.ok(!mock.calls[0].messages[0].content.includes('REVIEWED PRESET STUDIO'));
  }
});

test('the route forwards only allowlisted source and strict selected-voice context', async () => {
  const calls = [];
  const route = evaluate('src/app/api/lyrics/generate/route.ts', {
    '@/lib/preset-studio-profile': helper,
    '@/lib/engines/lyrics-generator': { generateLyrics: async params => { calls.push(params); return song(); } },
    'next/server': { NextResponse: { json(body, options = {}) { return { body, status: options.status || 200 }; } } },
  });
  for (const sourceMenu of [...sources, 'japan', 'preset-studio-copy', undefined]) for (const selected of [true, false, 'true', undefined]) {
    const result = await route.POST({ json: async () => ({ sourceMenu, presetId: 'uk_grime',
      stylePrompt: profiles.uk_grime.recipe, vocalProfileSpecified: selected }) });
    assert.equal(result.status, 200);
    const actual = calls.at(-1), allowed = sources.includes(sourceMenu) || sourceMenu === 'japan';
    assert.equal(actual.sourceMenu, allowed ? sourceMenu : undefined);
    assert.equal(actual.vocalProfileSpecified, allowed ? selected === true : undefined);
  }
});
