const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const profiles = require('../worker/preset-studio-profiles.json');
const { buildKieSunoRequest, fitSunoStylePrompt } = require('../worker/suno-provider');
const { protectPresetStudioLeadVocal } = require('../worker/preset-studio-vocal-policy');
const { patchWorkerSource } = require('./patch-preset-studio-worker.cjs');
const { sealSunoRetryIdentity, resolveSunoRetryIdentity } = require('../worker/suno-retry-identity');
const { prepareLyricsSubmission } = require('../worker/lyrics-policy');
const moduleFixture = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../src/lib/preset-studio-profile.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
vm.runInNewContext(js, { module: moduleFixture, exports: moduleFixture.exports,
  require(name) { assert.equal(name, '../../worker/preset-studio-profiles.json'); return profiles; }, Error });
const helper = moduleFixture.exports;
const lyric = '[Verse]\nI hold the light and let it grow\n[Chorus]\nWe find our way across the road';

test('211 reviewed source recipes resolve without replacing personal edits or future DB recipes', () => {
  for (const [id, p] of Object.entries(profiles)) {
    assert.equal(helper.resolvePresetStudioStyle(p.sourceRecipe, id, false), p.recipe);
    assert.equal(helper.resolvePresetStudioStyle(p.sourceRecipe, id, false, true), p.selectedVoiceRecipe);
    assert.equal(helper.resolvePresetStudioStyle(p.sourceRecipe, id, true), p.instrumentalRecipe);
    assert.equal(helper.resolvePresetStudioStyle('My original edited recipe, new 112 BPM groove', id, false), 'My original edited recipe, new 112 BPM groove');
    assert.equal(helper.resolvePresetStudioStyle(p.recipe + ', personal instrument motif', id, false, true), p.selectedVoiceRecipe + ', personal instrument motif');
  }
  assert.equal(helper.resolvePresetStudioStyle('My personal recipe', 'custom-fixture', false), 'My personal recipe');
});

test('all public vocal defaults and male/female/duet requests keep genre, lyrics and natural endings', () => {
  let count = 0;
  for (const [id, p] of Object.entries(profiles)) for (const gender of ['m', 'f', undefined]) {
    const request = buildKieSunoRequest({ sourceMenu: 'preset-studio', presetId: id,
      style: p.recipe, lyrics: lyric, instrumental: false, naturalFullSong: true, vocalGender: gender });
    assert.ok(request.input.style.length <= 1000, id);
    assert.equal(request.input.prompt, lyric, id);
    assert.equal(request.input.model, 'V6');
    assert.ok(!Object.hasOwn(request.input, 'duration'), id);
    assert.ok(request.input.style.includes(p.recipe.split(/[,.]/)[0]), id);
    if (id !== 'brazilian-funk-kpop-performance') assert.ok(request.input.style.includes(p.defaultVocal), id);
    assert.equal(request.input.vocal_gender, gender);
    count++;
  }
  assert.equal(count, 633);
});

test('chosen voices suppress catalog timbre and preserve persona IDs and lyrics', () => {
  for (const [id, p] of Object.entries(profiles)) {
    const style = `${p.genreLabel}, chosen dry low resonant voice, ${p.selectedVoiceRecipe}`;
    const request = buildKieSunoRequest({ sourceMenu: 'preset-studio', presetId: id, style,
      lyrics: lyric, instrumental: false, naturalFullSong: true, vocalProfileSpecified: true,
      personaId: 'offline_persona_123', personaModel: 'style_persona' });
    assert.ok(!request.input.style.includes('Default lead:'), id);
    assert.ok(request.input.style.includes('chosen dry low resonant voice'), id);
    assert.equal(request.input.persona_id, 'offline_persona_123');
    assert.equal(request.input.persona_model, 'style_persona');
    assert.equal(request.input.prompt, lyric);
    assert.ok(!Object.hasOwn(request.input, 'duration'));
  }
});

test('instrumental, Japanese studio, short-form, MugSound and unknown presets receive no Preset Studio policy', () => {
  const style = 'original unrelated recipe';
  const base = { sourceMenu: 'preset-studio', presetId: 'uk_grime', instrumental: false, naturalFullSong: true };
  for (const overrides of [{ instrumental: true }, { sourceMenu: 'japan' }, { sourceMenu: 'mugsound-supply' }, { naturalFullSong: false }, { presetId: 'custom-fixture' }]) {
    assert.deepEqual(protectPresetStudioLeadVocal({ ...base, ...overrides }, style, 'noise', fitSunoStylePrompt), { style, exclude: 'noise' });
  }
  assert.deepEqual(protectPresetStudioLeadVocal(base, 'Future DB recipe, user-selected raw voice', 'noise', fitSunoStylePrompt), { style: 'Future DB recipe, user-selected raw voice', exclude: 'noise' });
});

test('whole-clause budgeting never cuts an instrument or artist-name fragment', () => {
  const prefix = 'my genre, selected resonant voice, ';
  const long = prefix + ('warm bass, precise drums, '.repeat(50));
  const fitted = helper.fitPresetStudioStyleBudget(long, 200);
  assert.ok(fitted.startsWith(prefix));
  assert.ok(fitted.endsWith('warm bass') || fitted.endsWith('precise drums'));
});

test('gender scrubbing preserves Girl Crush genre and Game Boy instrument while removing outside conflicting voices', () => {
  const scrubSource = fs.readFileSync(path.join(__dirname, '../src/lib/voice-dna-scrubber.ts'), 'utf8');
  const tree = ts.createSourceFile('scrub.ts', scrubSource, ts.ScriptTarget.Latest, true);
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'scrubConflictingVocalTags');
  const compiled = ts.transpileModule(fn.getText(tree).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const scrub = new Function(`${compiled};return scrubConflictingVocalTags`)();
  for (const [id, gender, wrong] of [['kpop_girl_crush', 'male', 'female vocals'], ['chiptune', 'female', 'male vocals']]) {
    const p = profiles[id];
    const value = helper.preservePresetStudioMusicWhileScrubbing(`${wrong}, ${p.recipe}`, id, gender, scrub);
    assert.ok(value.includes(p.recipe), id);
    assert.ok(!value.includes(wrong), id);
  }
});

test('structured lyrics preparation and provider preparation preserve every neutral music core for either solo gender', () => {
  const sections = [{ type: 'verse', content: 'A new road carries us home', description: 'A restrained first phrase' }];
  for (const [id, p] of Object.entries(profiles)) for (const gender of ['male', 'female']) {
    const prepared = prepareLyricsSubmission({ stylePrompt: p.recipe, lyricsSections: sections, isInstrumental: false, vocalGender: gender });
    assert.ok(prepared.stylePrompt.includes(p.recipe), `${id}/${gender}`);
    const request = buildKieSunoRequest({ sourceMenu: 'preset-studio', presetId: id, style: prepared.stylePrompt,
      lyricsSections: sections, instrumental: false, vocalGender: gender === 'male' ? 'm' : 'f', naturalFullSong: true });
    assert.ok(request.input.style.includes(p.recipe.split(/[,.]/)[0]), `${id}/${gender}`);
    assert.equal(request.input.prompt, '[Verse]\nA new road carries us home');
  }
});

test('real deployed retry function passes exactly the authenticated persona; old selected rows cannot submit', async () => {
  const beforePath = '/private/tmp/melodio-generation-batch-worker/candidate-index-v2.js';
  if (!fs.existsSync(beforePath)) return;
  const patched = patchWorkerSource(fs.readFileSync(beforePath, 'utf8'));
  const start = patched.indexOf('async function submitSunoJobForRetry(');
  const end = patched.indexOf('// ─── Suno 작업 폴링', start);
  const captured = [];
  const secret = 'offline-fixture-key-no-production-credentials';
  const metadata = { sourceMenu: 'preset-studio', presetId: 'uk_grime', vocalGender: 'female', officialVoiceId: 'fixture-voice', voiceFeatureMode: 'suno_style_persona', stylePrompt: profiles.uk_grime.selectedVoiceRecipe, lyricsPrompt: lyric, sunoVersion: 'V6' };
  metadata.sunoVoiceRetry = sealSunoRetryIdentity({ personaId: 'offline_persona_123', personaModel: 'style_persona' }, metadata, 'owner', secret);
  const bindings = { resolveSunoRetryIdentity, process: { env: { SUPABASE_SERVICE_ROLE_KEY: secret } }, isNaturalFullSong: () => true, compactNaturalSongStyle: s => s,
    removeClockDurationInstructions: s => s, fitSunoStylePrompt, Date, log() {},
    submitKieSunoJob: async options => { captured.push(buildKieSunoRequest(options)); return { taskId: 'offline-task', model: 'V6' }; }, sunoVersionLabel: () => 'v6' };
  const fn = new Function(...Object.keys(bindings), `${patched.slice(start, end)};return submitSunoJobForRetry;`)(...Object.values(bindings));
  await fn(metadata, 'Original title', 'owner');
  assert.equal(captured[0].input.persona_id, 'offline_persona_123');
  assert.equal(captured[0].input.persona_model, 'style_persona');
  assert.equal(captured[0].input.vocal_gender, 'f');
  assert.ok(!Object.hasOwn(captured[0].input, 'duration'));
  delete metadata.sunoVoiceRetry;
  await assert.rejects(fn(metadata, 'Original title', 'owner'), { code: 'retry_voice_unavailable' });
  assert.equal(captured.length, 1);
});
