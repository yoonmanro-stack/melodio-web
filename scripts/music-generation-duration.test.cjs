const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Resolve from cwd so this same test exercises the primary or release checkout.
const root = process.cwd();
const provider = require(path.join(root, 'worker/suno-provider.js'));
const catalog = require(path.join(root, 'src/data/officialVocalCatalog.json'));
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };

function loadPureModule(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const module = { exports: {} };
  new Function('module', 'exports', 'require', ts.transpileModule(source, { compilerOptions }).outputText)(
    module, module.exports, name => {
      if (name === '../../worker/natural-song-preferences') return require(path.join(root, 'worker/natural-song-preferences.js'));
      throw new Error('Unexpected dependency in duration policy');
    },
  );
  return module.exports;
}

function extractFunction(relativePath, name) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const ast = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `${relativePath} must contain ${name}`);
  return declaration.getText(ast);
}

const { resolveMusicDuration, buildInstrumentalArrangement, removeClockDurationInstructions } = loadPureModule('src/lib/music-duration.ts');
const performancePresetId = 'brazilian-funk-kpop-performance';

test('only the known Brazilian performance vocal preset gets a soft 200-second center and 160–260 range', () => {
  for (const sourceMenu of ['preset-studio', 'audio-forge', 'audio-forge-pro']) {
    const plan = resolveMusicDuration({ sourceMenu, presetId: performancePresetId, isInstrumental: false });
    assert.equal(plan.seconds, undefined);
    assert.equal(plan.naturalFullSong, true);
    assert.deepEqual(plan.preferredSeconds, { minimum: 160, maximum: 260, target: 200 });
  }
  const nested = resolveMusicDuration({ sourceMenu: 'preset-studio', metadata: { presetId: performancePresetId, isInstrumental: false, durationSeconds: 30, preferredSeconds: { minimum: 1, maximum: 9999 } } });
  assert.deepEqual(nested.preferredSeconds, { minimum: 160, maximum: 240 }, 'Only canonical top-level identity used by persisted worker metadata selects a preset preference');
  assert.equal(nested.seconds, undefined, 'Old clip metadata must not become a native duration');
  for (const request of [
    { sourceMenu: 'preset-studio', presetId: 'brazilian_funk', isInstrumental: false },
    { sourceMenu: 'preset-studio', presetId: performancePresetId, isInstrumental: true },
    { sourceMenu: 'preset-studio', presetId: performancePresetId },
    { sourceMenu: 'japan', presetId: performancePresetId, isInstrumental: false },
    { sourceMenu: 'preset-studio', metadata: { naturalPreferredRange: { minimumSeconds: 1, maximumSeconds: 9999 } } },
  ]) assert.deepEqual(resolveMusicDuration(request).preferredSeconds, { minimum: 160, maximum: 240 });
  for (const sourceMenu of ['viral', 'voice-discovery-sample', 'mugsound-supply']) {
    assert.equal(resolveMusicDuration({ sourceMenu, presetId: performancePresetId, isInstrumental: false }).preferredSeconds, undefined);
  }
});
const scrubModule = { exports: {} };
new Function('exports', ts.transpileModule(
  extractFunction('src/lib/voice-dna-scrubber.ts', 'scrubConflictingVocalTags'), { compilerOptions },
).outputText)(scrubModule.exports);
const submitSource = extractFunction('src/app/api/generate/route.ts', 'submitSunoJob');
const submitCode = ts.transpileModule(`${submitSource}\nexports.submit = submitSunoJob;`, { compilerOptions }).outputText;

const lyrics = ['Verse', 'Pre-chorus', 'Chorus', 'Verse', 'Bridge', 'Chorus'].map((section, index) =>
  `[${section}]\n` + Array.from({ length: 6 }, (_, line) =>
    `Fresh lyric ${index + 1}.${line + 1}: the midnight rhythm carries our whole story home.`,
  ).join('\n'),
).join('\n\n');
const personaId = 'offline_style_persona_123';
const studioMenus = ['style-library', 'preset-studio', 'japan'];

async function submit(overrides = {}) {
  const voice = catalog.find(item => item.id === 'melodio-mv3-bronze-rhythm-female');
  assert.ok(voice, 'The incident voice must remain represented in the regression fixture');
  const payload = {
    title: 'Duration regression', sourceMenu: 'preset-studio', sunoVersion: 'v6',
    stylePrompt: `Brazilian funk, ${voice.stylePrompt}, short call-and-response vocal hook, short sub-bass notes, short room ambience`,
    lyricsPrompt: lyrics, isInstrumental: false, vocalGender: 'female', metadata: {},
    ...overrides,
  };
  const calls = [];
  const module = { exports: {} };
  new Function('exports', 'submitKieSunoJob', 'resolveMusicDuration', 'resolveDurationSeconds', 'scrubConflictingVocalTags', 'buildInstrumentalArrangement', 'removeClockDurationInstructions', 'fitSunoStylePrompt', 'console', submitCode)(
    module.exports,
    async options => {
      calls.push(provider.buildKieSunoRequest(options).input);
      return { taskId: 'offline-duration-check', model: 'V6' };
    },
    resolveMusicDuration, provider.resolveDurationSeconds, scrubModule.exports.scrubConflictingVocalTags, buildInstrumentalArrangement, removeClockDurationInstructions, provider.fitSunoStylePrompt,
    { log() {}, error() {} },
  );
  // Supply a playbook so no knowledge-database import can run for short prompts.
  const result = await module.exports.submit(payload, { metadata: { suno_tags: 'full-band production' } }, personaId, 'style_persona');
  assert.equal(calls.length, 1);
  const input = calls[0];
  if (!payload.isInstrumental) assert.equal(input.prompt, lyrics, 'All six sections must reach the provider without truncation');
  assert.equal(input.persona_id, payload.isInstrumental ? undefined : personaId);
  assert.equal(input.persona_model, payload.isInstrumental ? undefined : 'style_persona');
  if (!payload.isInstrumental) assert.equal(input.vocal_gender, 'f');
  assert.equal(input.custom_mode, true);
  assert.equal(result.requestedDurationSeconds, input.duration, 'Receipt must record actual submitted duration');
  return { input, result };
}

test('performance preference reaches the API result while provider lyrics, tempo, persona and duration contract stay intact', async () => {
  const { input, result } = await submit({ presetId: performancePresetId, stylePrompt: 'Brazilian funk, 130 BPM, warm 808 bass, crisp percussion, K-pop performance vocal', metadata: { preferredSeconds: { minimum: 1, maximum: 9999 }, durationSeconds: 200 } });
  assert.deepEqual(result.requestedPreferredSeconds, { minimum: 160, maximum: 260, target: 200 });
  assert.equal(Object.hasOwn(input, 'duration'), false);
  assert.equal(input.prompt, lyrics);
  assert.equal(input.persona_id, personaId);
  assert.match(input.style, /130 BPM/);
  assert.doesNotMatch(input.style, /200 seconds|3:20|160 seconds|260 seconds/);
  const ordinary = await submit({ presetId: 'ambient_pop' });
  assert.deepEqual(ordinary.result.requestedPreferredSeconds, { minimum: 160, maximum: 240 });
  const timed = await submit({ presetId: performancePresetId, sourceMenu: 'voice-discovery-sample', metadata: { durationSeconds: 30 } });
  assert.equal(timed.result.requestedPreferredSeconds, undefined);
  assert.equal(timed.input.duration, 30);
});

test('all three studios preserve a full song for the incident voice and misleading style words', async () => {
  for (const sourceMenu of studioMenus) {
    for (const phrase of ['short call-and-response vocal hook, short sub-bass notes, short room ambience', 'viral dance appeal', 'parody character', 'comical delivery']) {
      const { input, result } = await submit({ sourceMenu, stylePrompt: `Brazilian funk, female vocals, ${phrase}` });
      assert.equal(Object.hasOwn(input, 'duration'), false, `${sourceMenu}: ${phrase}`);
      assert.equal(result.durationMode, 'full-song');
      assert.equal(result.durationSource, 'studio-natural');
      assert.doesNotMatch(input.style, /0:28|28-second|abrupt finish/i);
      assert.doesNotMatch(input.style, /minimal backing beat/i, 'Style adjectives must not trigger the viral mix header');
    }
  }
});

test('ordinary instrumental arrangements ignore old lengths and keep the chosen instruments', async () => {
  for (const seconds of [30, 195, 210]) {
    const { input } = await submit({
      isInstrumental: true, lyricsPrompt: '', vocalGender: undefined,
      metadata: { durationSeconds: seconds },
      stylePrompt: 'Instrumental ambient, 45 BPM, harp and analog pads, no drums',
    });
    assert.equal(Object.hasOwn(input, 'duration'), false);
    assert.equal(input.prompt, buildInstrumentalArrangement());
    assert.match(input.prompt, /Main Theme Variation/);
    assert.match(input.prompt, /Outro and Natural Ending/);
    assert.equal(input.prompt.split('\n').length, 8);
    assert.doesNotMatch(input.prompt, /piano|bass|solo|full climax/i);
    assert.match(input.style, /45 BPM/);
    assert.match(input.style, /harp and analog pads/);
    assert.equal(input.vocal_gender, undefined);
  }
});

test('a selected short recipe does not acquire unrelated playbook tags', async () => {
  const { input } = await submit({ presetId: 'french-vintage-chanson', stylePrompt: 'female vocals, accordion, 85 BPM' });
  assert.match(input.style, /accordion, 85 BPM/);
  assert.doesNotMatch(input.style, /full-band production/);
});

test('the incident-style prompt stays untimed with full lyrics and its persona', async () => {
  const { input } = await submit();
  assert.equal(Object.hasOwn(input, 'duration'), false);
  assert.doesNotMatch(input.style, /0:28|28-second|abrupt finish/i);
});

test('explicit short-form flags and menus still send 28 seconds', async () => {
  for (const selection of [{ isViral: true }, { isViralTrack: true }, { sourceMenu: 'viral' }, { sourceMenu: 'viral-cf' }]) {
    const { input, result } = await submit({ ...selection, stylePrompt: 'Funk, female vocals, warm full band' });
    assert.equal(input.duration, 28, JSON.stringify(selection));
    assert.equal(result.durationMode, 'short-form');
    assert.equal(result.durationSource, 'short-form-request');
  }
});

test('saved duration metadata cannot impose a cutoff or turn an ordinary studio song into a sample', async () => {
  for (const sourceMenu of [...studioMenus, 'audio', 'audio-forge']) {
    for (const metadata of [{ durationSeconds: 210 }, { duration: '3:30' }, { durationSeconds: 30 }]) {
      const { input, result } = await submit({ sourceMenu, metadata });
      assert.equal(Object.hasOwn(input, 'duration'), false);
      assert.equal(result.durationMode, 'full-song');
      assert.equal(result.durationSource, 'studio-natural');
    }
  }
});

test('dedicated voice previews preserve their timed contract', async () => {
  for (const seconds of [30, 40, 45]) {
    const { input, result } = await submit({ sourceMenu: 'voice-discovery-design', metadata: { durationSeconds: seconds } });
    assert.equal(input.duration, seconds);
    assert.equal(result.durationMode, 'short-form');
    assert.equal(result.durationSource, 'explicit-duration');
    assert.doesNotMatch(input.style, /0:28|28-second|abrupt finish/i);
  }
});

test('valid explicit duration takes precedence over an explicit short-form request', async () => {
  const { input, result } = await submit({ sourceMenu: 'viral', metadata: { durationSeconds: 30 } });
  assert.equal(input.duration, 30);
  assert.equal(result.durationMode, 'short-form');
  assert.equal(result.durationSource, 'explicit-duration');
});

test('long style prompts retain natural ending instructions inside the provider limit', async () => {
  const { input } = await submit({
    metadata: { durationSeconds: 210 },
    stylePrompt: `Female vocals, short syncopated guitar notes, ${'warm analog bass and detailed percussion, '.repeat(70)}`,
  });
  assert.equal(Object.hasOwn(input, 'duration'), false);
  assert.ok(input.style.length <= 1000);
  assert.match(input.style, /^Perform all supplied lyric sections;/);
  assert.match(input.style, /perform all supplied lyric sections/i);
  assert.match(input.style, /final musical phrase to resolve with a natural ending/);
  assert.doesNotMatch(input.style, /0:28|28-second|abrupt finish/i);
});

test('invalid durations and non-boolean short-form flags cannot shrink a normal studio song', async () => {
  for (const metadata of [{ durationSeconds: 0 }, { durationSeconds: -1 }, { durationSeconds: 361 }, { duration: 'invalid' }]) {
    const { input, result } = await submit({ metadata, isViral: 'true', isViralTrack: 'false' });
    assert.equal(Object.hasOwn(input, 'duration'), false);
    assert.equal(result.durationSource, 'studio-natural');
  }
});

test('old clock directions are removed without altering tempo or vintage era markers', async () => {
  const { input } = await submit({ stylePrompt: '1950s soul, 195 BPM, target duration 195 seconds (3:15), fade out at 3:15, warm bass', metadata: { durationSeconds: 195 } });
  assert.doesNotMatch(input.style, /195 seconds|3:15|target duration|fade out at/i);
  assert.match(input.style, /1950s soul, 195 BPM/);
  assert.match(input.style, /warm bass/);
  assert.equal(removeClockDurationInstructions('[Target Duration: 3:30, Complete Instrumental] [Main Theme]'), '[Main Theme]');
});

test('ordinary songs record a preferred range without sending either a range or duration to the provider', async () => {
  const plan = resolveMusicDuration({ sourceMenu: 'japan' });
  assert.deepEqual(plan.preferredSeconds, { minimum: 160, maximum: 240 });
  assert.equal(plan.seconds, undefined);
  const { input } = await submit({ sourceMenu: 'japan' });
  assert.equal(Object.hasOwn(input, 'duration'), false);
  assert.doesNotMatch(input.style, /160 seconds|240 seconds|2:40|4:00|Target duration/i);
  assert.equal(resolveMusicDuration({ sourceMenu: 'voice-discovery-sample', metadata: { durationSeconds: 30 } }).preferredSeconds, undefined);
});
