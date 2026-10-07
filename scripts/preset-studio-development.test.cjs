/* Offline post-batch source contract. No provider, DB, media or active release changes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const baseline = '357bbea17d97c1bba211b340cd49c1fb358e71e6';
const profiles = require('../worker/preset-studio-profiles.json');
const policy = require('../worker/lyrics-policy');
const { buildKieSunoRequest, fitSunoStylePrompt } = require('../worker/suno-provider');
const { protectPresetStudioLeadVocal } = require('../worker/preset-studio-vocal-policy');
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const historical = relative => execFileSync('git', ['show', baseline + ':' + relative], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
const oldProfiles = JSON.parse(historical('worker/preset-studio-profiles.json'));
const rap = ['uk_grime', 'uk_drill', 'sample_drill', 'rage_rap', 'original_drill', 'east_coast_boom_bap'];
const melodic = ['bubblegum_pop_kpop', 'brazilian_funk', 'bluegrass', 'authentic_samba', 'baile_funk'];
const pairedDecisions = {
  "uk_funky": {
    "durations": [
      148.8,
      146.04
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "uk_bassline": {
    "durations": [
      157.63201814058957,
      150.79201814058956
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "twee_pop": {
    "durations": [
      133.22401360544217,
      142.56
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "trap_music": {
    "durations": [
      105.62401360544217,
      123.38401360544218
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "skate_punk_pop": {
    "durations": [
      157.46401360544218,
      153.62401360544217
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "ska_traditional": {
    "durations": [
      157.94401360544217,
      143.23201814058956
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "ska_punk": {
    "durations": [
      126.79201814058958,
      129.9840136054422
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "reggaeton": {
    "durations": [
      130.39201814058956,
      128.66401360544216
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "pop_punk": {
    "durations": [
      128.23201814058956,
      122.83201814058957
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "original_afrobeat": {
    "durations": [
      152.16,
      137.76
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "noise_rock": {
    "durations": [
      156.02401360544218,
      150.02401360544218
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "no_bounce": {
    "durations": [
      122.83201814058957,
      130.8
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "memphis_phonk": {
    "durations": [
      154.8240136054422,
      148.03201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "math_rock_midwest_emo": {
    "durations": [
      156.02401360544218,
      142.75201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "math_rock": {
    "durations": [
      119.88,
      132.02401360544218
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "kpop_dance": {
    "durations": [
      136.44,
      135.24
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "kpop_bubblegum": {
    "durations": [
      115.99201814058956,
      123.62401360544217
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "korean_rnb": {
    "durations": [
      143.23201814058956,
      152.83201814058958
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "kawaii_future_bass": {
    "durations": [
      126.84,
      100.70401360544217
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "joseon_hiphop": {
    "durations": [
      146.42401360544218,
      123.19201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "jersey_club": {
    "durations": [
      120.02401360544218,
      114.79201814058958
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "jamaican_dancehall": {
    "durations": [
      137.88,
      137.18401360544217
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "j_core": {
    "durations": [
      153.62401360544217,
      150.74401360544218
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "hyperpop": {
    "durations": [
      120.38401360544218,
      112.44
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "house_phonk": {
    "durations": [
      138.02401360544218,
      137.35201814058956
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "hardcore_punk": {
    "durations": [
      107.4,
      121.2
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "gypsy_jazz": {
    "durations": [
      148.8240136054422,
      99.74401360544218
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "garage_rock_revival": {
    "durations": [
      143.06401360544217,
      143.59201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "garage_rock": {
    "durations": [
      123.62401360544217,
      121.2
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "eurobeat": {
    "durations": [
      116.83201814058957,
      141.67201814058956
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "emo_trap": {
    "durations": [
      121.32,
      132.84
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "emo_rap": {
    "durations": [
      152.78401360544217,
      142.44
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "electroclash": {
    "durations": [
      130.8240136054422,
      154.87201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "electro_swing": {
    "durations": [
      148.87201814058957,
      152.64
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "drift_phonk": {
    "durations": [
      136.32,
      125.23201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "digicore": {
    "durations": [
      137.4,
      116.95201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "dance_punk": {
    "durations": [
      123.62401360544217,
      116.78401360544218
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "complextro": {
    "durations": [
      143.95201814058956,
      143.16
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "classic_phonk": {
    "durations": [
      122.04,
      121.46401360544218
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "chiptune": {
    "durations": [
      123.50401360544218,
      132.24
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "chamber_folk": {
    "durations": [
      158.04,
      156.19201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "celtic_folk": {
    "durations": [
      140.83201814058958,
      117.19201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "boom_bap": {
    "durations": [
      150.79201814058956,
      156.19201814058957
    ],
    "lyricsDevelopment": "moderate-developed-six"
  },
  "atlanta_trap": {
    "durations": [
      99,
      125.64
    ],
    "lyricsDevelopment": "melodic-developed-six"
  },
  "alt_pop": {
    "durations": [
      150.02401360544218,
      139.34401360544217
    ],
    "lyricsDevelopment": "moderate-developed-six"
  }
};
const allMelodic = [...melodic, ...Object.keys(pairedDecisions).filter(id => pairedDecisions[id].lyricsDevelopment === 'melodic-developed-six')];
const moderate = Object.keys(pairedDecisions).filter(id => pairedDecisions[id].lyricsDevelopment === 'moderate-developed-six');
const development = new Set([...rap, 'kpop_girl_crush', ...allMelodic, ...moderate]);
const tagIds = new Set(['roots_reggae', 'reggae_fusion']);
const activeFields = new Set(['recipe', 'selectedVoiceRecipe', 'instrumentalRecipe']);

function evaluate(relative, modules = {}, source) {
  const module = { exports: {} }, fixtureMath = Object.create(Math);
  fixtureMath.random = () => 0.25;
  vm.runInNewContext(ts.transpileModule(source ?? fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { module, exports: module.exports,
    require(name) { if (Object.hasOwn(modules, name)) return modules[name]; throw Error(`Unmocked dependency: ${name}`); },
    process: { env: new Proxy({}, { get() { throw Error('Environment access forbidden'); } }) },
    fetch: async () => { throw Error('External fetch forbidden'); }, console: { log() {}, warn() {}, error() {} },
    Math: fixtureMath, Date, Error, AbortSignal,
  }, { filename: relative });
  return module.exports;
}
const helper = evaluate('src/lib/preset-studio-profile.ts', { '../../worker/preset-studio-profiles.json': profiles });
const form = evaluate('src/lib/lyrics/validate-song-form.ts');
function loadEngine(source, profileHelper = helper) {
  return evaluate('src/lib/engines/lyrics-generator.ts', {
    '@/lib/preset-studio-profile': profileHelper,
    '@/lib/japan-preset-profile': { getJapanPresetProfile: () => undefined },
    '@/lib/lyrics/validate-song-form': form,
    '@/lib/lyrics/compile-sections': policy,
    '@/lib/db/knowledge': { getPlaybookByKey: async () => null, matchPlaybooksByPrompt: async () => [], matchEpisodesByCategoryAndTopic: async () => [] },
    '@/lib/engines/infinite-story-matrix': { generateBoundlessCreativeVector: () => ({ uniqueEntropySeed: 'offline', perspectiveType: 'scene', thematicDimension: 'choice', sensoryFocus: 'light' }) },
    '@/lib/vle/vleEngine': { loadVLEMasterPrompt: () => '' }, '@/lib/vle/viralSongSpec': { buildStructureDirective: () => '' },
  }, source);
}
const current = loadEngine(), previous = loadEngine(historical('src/lib/engines/lyrics-generator.ts'));
function song(performance = false) {
  const types = performance ? ['intro', 'verse', 'pre-chorus', 'chorus', 'verse', 'pre-chorus', 'chorus', 'outro']
    : ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'];
  return { title: 'Authored scene', youtubeTags: 'scene', snsHashtags: '#scene', sections: types.map((type, index) => ({ type,
    content: ['intro', 'outro'].includes(type) ? '' : Array.from({ length: type === 'verse' ? 20 : 9 }, (_, line) => `I follow the light home ${index}-${line}`).join('\n'),
    description: 'Clear lead; fuller melody',
  })) };
}
function fixture(body) {
  const calls = [];
  return { calls, dependencies: { apiKey: 'offline-fixture-key', fetch: async (_url, request) => {
    calls.push(JSON.parse(request.body));
    return { ok: true, json: async () => ({ model: 'gpt-5.6-sol', usage: { prompt_tokens: 1, completion_tokens: 1 },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }] }) };
  } } };
}
const core = prompt => prompt.match(/## COMPLETE SONG STRUCTURE AND NATURAL DEVELOPMENT\n([\s\S]*?)(?=\n## |$)/)?.[1];
const types = prompt => [...core(prompt).matchAll(/^[1-8]\. .*\(type: "([^"]+)"\)/gm)].map(match => match[1]);

test('paired-evidence registry selects only forty-five usable originals below the soft preference', () => {
  assert.equal(Object.keys(pairedDecisions).length, 45);
  assert.equal(moderate.length, 33);
  assert.equal(allMelodic.length - melodic.length, 12);
  for (const [id, decision] of Object.entries(pairedDecisions)) {
    assert.equal(decision.durations.length, 2, id);
    assert.ok(decision.durations.every(value => Number.isFinite(value) && value > 0), id);
    const maximum = Math.max(...decision.durations);
    assert.ok(maximum >= 120 && maximum < 160, id);
    assert.equal(decision.lyricsDevelopment, maximum <= 130 ? 'melodic-developed-six' : 'moderate-developed-six', id);
    assert.equal(profiles[id].lyricsDevelopment, decision.lyricsDevelopment, id);
  }
});

test('only fifty-seven development metadata fields and two submitted recipe variants differ from the deployed profile baseline', () => {
  assert.equal(Object.keys(profiles).length, 211);
  const metadataIds = Object.keys(profiles).filter(id => profiles[id].lyricsDevelopment);
  assert.equal(digest(metadataIds.sort()), digest([...development].sort()));
  for (const [id, original] of Object.entries(oldProfiles)) {
    const currentProfile = profiles[id];
    for (const field of new Set([...Object.keys(original), ...Object.keys(currentProfile)])) {
      if (development.has(id) && field === 'lyricsDevelopment') continue;
      if (tagIds.has(id) && activeFields.has(field)) {
        assert.ok(!/\bskank\b/i.test(currentProfile[field]), `${id}/${field}`);
      } else assert.equal(digest(currentProfile[field] ?? null), digest(original[field] ?? null), `${id}/${field}`);
    }
  }
});

test('six confirmed percussive MC presets keep six sections and full returned words with sixteen-line verses and eight-line hooks', async () => {
  for (const id of rap) for (const isPlaylistMode of [false, true]) {
    const authored = song(), payload = isPlaylistMode ? { playlistTitle: 'Scenes', youtubeDescription: 'Scenes', youtubeTags: 'scene', snsHashtags: '#scene',
      tracks: [1, 2].map(trackNumber => ({ ...authored, trackNumber })) } : authored;
    const mock = fixture(payload);
    const result = await current.generateLyrics({ sourceMenu: 'preset-studio', presetId: id, stylePrompt: profiles[id].recipe,
      vocalProfileSpecified: true, vocalGender: 'female', language: 'en', topic: 'My authored topic', isPlaylistMode, trackCount: 2,
    }, mock.dependencies);
    const system = mock.calls[0].messages[0].content;
    assert.equal(digest(types(system)), digest(['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro']));
    assert.equal((core(system).match(/16 coherent rap lines/g) || []).length, 2);
    assert.equal((core(system).match(/8 meaningful hook\/response lines/g) || []).length, 2);
    assert.ok(!/target:\s*\d|\d+:\d{2}|\d+\s*(?:seconds|minutes)\b/i.test(core(system)));
    const returned = result.tracks || [result];
    assert.equal(returned[0].sections[1].content, authored.sections[1].content);
    assert.equal(result.stylePrompt, profiles[id].recipe);
  }
});

test('Girl Crush uses ten-line melodic verses and six-line hooks inside its six existing sections', async () => {
  const mock = fixture(song());
  await current.generateLyrics({ sourceMenu: 'audio-forge', presetId: 'kpop_girl_crush', stylePrompt: profiles.kpop_girl_crush.recipe, language: 'ko' }, mock.dependencies);
  const system = mock.calls[0].messages[0].content;
  assert.equal((core(system).match(/10 coherent sung lines/g) || []).length, 2);
  assert.equal((core(system).match(/6 meaningful hook\/response lines/g) || []).length, 2);
  assert.ok(core(system).includes('melodic lift belongs inside each Verse'));
  assert.equal(types(system).length, 6);
});

test('reviewed paired-evidence tiers keep genre-appropriate six-part development and unaffected profiles on five/four guidance', async () => {
  assert.equal(digest(Object.keys(profiles).filter(id => profiles[id].lyricsDevelopment === 'moderate-developed-six').sort()), digest([...moderate].sort()));
  assert.equal(digest(Object.keys(profiles).filter(id => profiles[id].lyricsDevelopment === 'melodic-developed-six').sort()), digest([...allMelodic].sort()));
  for (const id of allMelodic) {
    const mock = fixture(song());
    await current.generateLyrics({ sourceMenu: 'preset-studio', presetId: id, stylePrompt: profiles[id].recipe }, mock.dependencies);
    const text = core(mock.calls[0].messages[0].content);
    assert.equal((text.match(/10 coherent genre-appropriate vocal lines/g) || []).length, 2);
    assert.equal((text.match(/6 meaningful genre-appropriate hook\/response lines/g) || []).length, 2);
    assert.ok(!text.includes('Girl Crush'));
  }
  for (const id of moderate) {
    const mock = fixture(song());
    await current.generateLyrics({ sourceMenu: 'preset-studio', presetId: id, stylePrompt: profiles[id].recipe }, mock.dependencies);
    const text = core(mock.calls[0].messages[0].content);
    assert.equal((text.match(/8 coherent genre-appropriate vocal lines/g) || []).length, 2);
    assert.equal((text.match(/5 meaningful genre-appropriate hook\/response lines/g) || []).length, 2);
    assert.ok(text.includes('sung, rapped or chanted'));
  }
  for (const [tier, verse, hook] of [['moderate-developed-six', 8, 5], ['melodic-developed-six', 10, 6]]) {
    const future = loadEngine(undefined, { ...helper, getPresetStudioProfile: id => id === 'reviewed-future-fixture'
      ? { ...profiles.uk_bassline, lyricsDevelopment: tier } : helper.getPresetStudioProfile(id) });
    const mock = fixture(song());
    await future.generateLyrics({ sourceMenu: 'preset-studio', presetId: 'reviewed-future-fixture', stylePrompt: profiles.uk_bassline.recipe }, mock.dependencies);
    const text = core(mock.calls[0].messages[0].content);
    assert.equal((text.match(new RegExp(`${verse} coherent genre-appropriate vocal lines`, 'g')) || []).length, 2);
    assert.equal((text.match(new RegExp(`${hook} meaningful genre-appropriate hook/response lines`, 'g')) || []).length, 2);
  }
});

test('152 unaffected profiles, performance eight-part form, non-Preset sources and dedicated forms retain prior request prompts', async () => {
  const inputs = Object.keys(profiles).filter(id => !development.has(id) && !tagIds.has(id)).map(id => ({ sourceMenu: 'preset-studio', presetId: id,
    stylePrompt: profiles[id].recipe }));
  assert.equal(inputs.length, 152);
  inputs.push(...['japan', 'mugsound-supply', undefined].map(sourceMenu => ({ sourceMenu, presetId: 'uk_grime', stylePrompt: profiles.uk_grime.recipe })),
    ...[{ durationSeconds: 30 }, { viralMode: true }].map(change => ({ sourceMenu: 'preset-studio', presetId: 'uk_grime', stylePrompt: profiles.uk_grime.recipe, ...change })));
  for (const input of inputs) {
    const authored = song(input.presetId === 'brazilian-funk-kpop-performance'), old = fixture(authored), next = fixture(authored);
    await previous.generateLyrics(input, old.dependencies);
    await current.generateLyrics(input, next.dependencies);
    assert.equal(digest(next.calls[0]), digest(old.calls[0]), input.presetId);
  }
});

test('guitar terms from merged metadata normalize for vocal/selected/instrumental requests while lyrics and generic artist refs stay intact', () => {
  const lyric = '[Verse]\nWe skank under amber lights and keep our own names';
  for (const id of tagIds) for (const instrumental of [false, true]) for (const selected of [false, true]) {
    const request = buildKieSunoRequest({ sourceMenu: 'preset-studio', presetId: id,
      style: instrumental ? profiles[id].instrumentalRecipe : profiles[id].recipe, lyrics: lyric,
      lyricsSections: [{ type: 'verse', content: 'We skank under amber lights and keep our own names', description: 'warm guitar skank, chosen grainy voice' }],
      instrumental, naturalFullSong: true, vocalGender: 'f', vocalProfileSpecified: selected,
      ...(selected && !instrumental ? { personaId: 'offline_persona_123', personaModel: 'style_persona' } : {}),
    }).input;
    assert.ok(!/\bskank\b/i.test(request.style));
    assert.ok(request.style.includes('upstrokes'));
    assert.equal(request.prompt, lyric);
    assert.ok(!Object.hasOwn(request, 'duration'));
    if (selected && !instrumental) assert.equal(request.persona_id, 'offline_persona_123');
  }
  const base = { sourceMenu: 'preset-studio', presetId: 'roots_reggae', instrumental: false, naturalFullSong: true };
  const custom = protectPresetStudioLeadVocal(base, 'My custom guitar skank, raw deep voice', '', fitSunoStylePrompt).style;
  assert.ok(custom.includes('offbeat guitar upstrokes'));
  assert.ok(!custom.includes('Default lead:'));
  for (const sourceMenu of ['japan', 'mugsound-supply', 'viral']) {
    const input = 'My guitar skank, Artist Skank voice';
    assert.equal(protectPresetStudioLeadVocal({ ...base, sourceMenu }, input, '', fitSunoStylePrompt).style, input);
  }
  assert.equal(protectPresetStudioLeadVocal(base, 'Artist Skank has a deep voice', '', fitSunoStylePrompt).style, 'Artist Skank has a deep voice');
  assert.equal(protectPresetStudioLeadVocal({ ...base, presetId: 'unknown-custom' }, 'guitar skank, deep voice', '', fitSunoStylePrompt).style, 'guitar skank, deep voice');
});

test('generated duet speaker labels are rejected without stripping words or returning a partial playlist', async () => {
  for (const [id, labels] of [['gothic_metal', ['Female:', 'Male:', 'Both:']], ['euro_disco', ['Donna:', 'Uomo:', 'Insieme:']]]) {
    for (const isPlaylistMode of [false, true]) {
      const authored = song();
      authored.sections[1].content = `${labels[0]} I keep your letter\n${labels[1]} I remember the rain\n${labels[2]} We choose our road`;
      const before = digest(authored);
      const payload = isPlaylistMode ? { playlistTitle: 'Duet scenes', youtubeDescription: 'Scenes', youtubeTags: 'scene', snsHashtags: '#scene',
        tracks: [{ ...song(), trackNumber: 1 }, { ...authored, trackNumber: 2 }] } : authored;
      const mock = fixture(payload);
      await assert.rejects(current.generateLyrics({ sourceMenu: 'preset-studio', presetId: id, stylePrompt: profiles[id].recipe,
        vocalGender: 'duet', language: id === 'euro_disco' ? 'it' : 'en', isPlaylistMode, trackCount: 2,
      }, mock.dependencies), error => error.code === 'lyrics_instruction_in_content');
      assert.equal(mock.calls.length, 1);
      assert.equal(digest(authored), before);
      const prompt = mock.calls[0].messages[0].content;
      assert.ok(prompt.includes('exclusively in'));
      assert.ok(!prompt.includes('Assign duet parts in the lyrics'));
    }
  }
});

test('duet natural colons remain authored words, while solo/mixed and the shared manual compiler remain unchanged', async () => {
  const authored = song();
  authored.sections[1].content = 'I said: I will meet you there\nPromessa sul cruscotto: fianco a fianco, sempre noi';
  const mock = fixture(authored);
  const result = await current.generateLyrics({ sourceMenu: 'preset-studio', presetId: 'eurobeat', stylePrompt: profiles.eurobeat.recipe,
    vocalGender: 'duet', language: 'it' }, mock.dependencies);
  assert.equal(result.sections[1].content, authored.sections[1].content);
  assert.equal(current.validateGeneratedDuetLyrics([{ content: 'Female: I wrote these words' }], 'male'), true);
  assert.equal(current.validateGeneratedDuetLyrics([{ content: 'Both: I wrote these words' }], 'mixed'), true);
  assert.equal(current.validateGeneratedDuetLyrics([{ content: '女声：歌う言葉' }], 'duet'), false);
  assert.equal(current.validateGeneratedDuetLyrics([{ content: '[Female] I keep my words' }], 'duet'), false);
  assert.equal(current.validateGeneratedDuetLyrics([{ content: '[Female]Hello' }], 'duet'), false);
  const manual = [{ type: 'verse', content: 'Female: I deliberately authored this line', description: 'Shared duet' }];
  assert.equal(policy.compileLyricsSections(manual).lyricsPrompt, '[Verse]\nFemale: I deliberately authored this line');
});
