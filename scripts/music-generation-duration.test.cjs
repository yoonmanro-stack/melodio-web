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
    module, module.exports, () => { throw new Error('Unexpected dependency in duration policy'); },
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

const { resolveMusicDuration } = loadPureModule('src/lib/music-duration.ts');
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
  new Function('exports', 'submitKieSunoJob', 'resolveMusicDuration', 'resolveDurationSeconds', 'scrubConflictingVocalTags', 'console', submitCode)(
    module.exports,
    async options => {
      calls.push(provider.buildKieSunoRequest(options).input);
      return { taskId: 'offline-duration-check', model: 'V6' };
    },
    resolveMusicDuration, provider.resolveDurationSeconds, scrubModule.exports.scrubConflictingVocalTags,
    { log() {}, error() {} },
  );
  // Supply a playbook so no knowledge-database import can run for short prompts.
  const result = await module.exports.submit(payload, { metadata: { suno_tags: 'full-band production' } }, personaId, 'style_persona');
  assert.equal(calls.length, 1);
  const input = calls[0];
  assert.equal(input.prompt, lyrics, 'All six sections must reach the provider without truncation');
  assert.equal(input.persona_id, personaId);
  assert.equal(input.persona_model, 'style_persona');
  assert.equal(input.vocal_gender, 'f');
  assert.equal(input.custom_mode, true);
  assert.equal(result.requestedDurationSeconds, input.duration, 'Receipt must record actual submitted duration');
  return { input, result };
}

test('all three studios preserve a full song for the incident voice and misleading style words', async () => {
  for (const sourceMenu of studioMenus) {
    for (const phrase of ['short call-and-response vocal hook, short sub-bass notes, short room ambience', 'viral dance appeal', 'parody character', 'comical delivery']) {
      const { input, result } = await submit({ sourceMenu, stylePrompt: `Brazilian funk, female vocals, ${phrase}` });
      assert.equal(input.duration, 195, `${sourceMenu}: ${phrase}`);
      assert.equal(result.durationMode, 'full-song');
      assert.equal(result.durationSource, 'studio-default');
      assert.doesNotMatch(input.style, /0:28|28-second|abrupt finish/i);
      assert.doesNotMatch(input.style, /minimal backing beat/i, 'Style adjectives must not trigger the viral mix header');
    }
  }
});

test('the complete incident-style prompt sends 195 seconds with full lyrics and its persona', async () => {
  const { input } = await submit();
  assert.equal(input.duration, 195);
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

test('explicit full-song and short durations survive the final provider payload', async () => {
  for (const [metadata, seconds, mode] of [
    [{ durationSeconds: 210 }, 210, 'full-song'],
    [{ duration: '3:30' }, 210, 'full-song'],
    [{ durationSeconds: 30 }, 30, 'short-form'],
  ]) {
    const { input, result } = await submit({ metadata });
    assert.equal(input.duration, seconds);
    assert.equal(result.durationMode, mode);
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

test('long style prompts retain the requested duration and full-song instruction within the provider limit', async () => {
  const { input } = await submit({
    metadata: { durationSeconds: 210 },
    stylePrompt: `Female vocals, short syncopated guitar notes, ${'warm analog bass and detailed percussion, '.repeat(70)}`,
  });
  assert.equal(input.duration, 210);
  assert.ok(input.style.length <= 1000);
  assert.match(input.style, /^Target duration 210 seconds \(3:30\);/);
  assert.match(input.style, /complete full-length song; perform all supplied lyric sections/);
  assert.doesNotMatch(input.style, /0:28|28-second|abrupt finish/i);
});

test('invalid durations and non-boolean short-form flags cannot shrink a normal studio song', async () => {
  for (const metadata of [{ durationSeconds: 0 }, { durationSeconds: -1 }, { durationSeconds: 361 }, { duration: 'invalid' }]) {
    const { input, result } = await submit({ metadata, isViral: 'true', isViralTrack: 'false' });
    assert.equal(input.duration, 195);
    assert.equal(result.durationSource, 'studio-default');
  }
});
