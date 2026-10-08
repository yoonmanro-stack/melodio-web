const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', compiled)(localRequire, mod, mod.exports);
  return mod.exports;
}
const { DANCE_MUSIC_PROFILES, resolveDanceMusicSpec, getDanceMusicSpec } = load('src/lib/dance/musicProfiles.ts');
const { DANCE_PRESET } = load('src/lib/dance/preset.ts');
const { buildKieSunoRequest } = require('../worker/suno-provider');
const { assertSafeVocalLyrics } = require('../worker/lyrics-policy');

test('six dance profiles have distinct grooves and requested tempos, independent of vocal choice', () => {
  assert.equal(DANCE_MUSIC_PROFILES.length, 6);
  assert.equal(new Set(DANCE_MUSIC_PROFILES.map(item => item.id)).size, 6);
  assert.deepEqual(DANCE_MUSIC_PROFILES.map(item => item.bpm), [116, 106, 128, 100, 110, 130]);
  const styles = [];
  for (const profile of DANCE_MUSIC_PROFILES) {
    const vocal = resolveDanceMusicSpec(profile.id, 'on', 'saved-request');
    const instrumental = resolveDanceMusicSpec(profile.id, 'off', 'saved-request');
    const recommended = resolveDanceMusicSpec(profile.id, 'recommended', 'saved-request');
    assert.equal(vocal.instrumental, false); assert.equal(instrumental.instrumental, true);
    assert.equal(recommended.instrumental, !profile.recommendedVocal);
    assert.equal(vocal.bpm, instrumental.bpm); assert.equal(vocal.rhythmPurpose, instrumental.rhythmPurpose);
    assert.match(vocal.style, /complete original dance song|complete verses and choruses/);
    assert.match(vocal.style, /30-second dance challenge/); assert.match(vocal.style, /natural musical ending/);
    assert.ok(vocal.style.length <= 1000); assert.ok(instrumental.style.length <= 1000);
    assert.ok(!/vocals, speech/.test(vocal.exclude)); assert.match(instrumental.exclude, /vocals, speech/);
    styles.push(vocal.style);
  }
  assert.equal(new Set(styles).size, 6);
});
test('vocal recipes contain meaningful authored words and safe section labels in the real provider prompt', () => {
  for (const profile of DANCE_MUSIC_PROFILES) {
    const spec = resolveDanceMusicSpec(profile.id, 'on', 'request-for-vocal');
    assert.doesNotThrow(() => assertSafeVocalLyrics(spec.lyrics));
    assert.match(spec.lyrics, /\[Verse\][\s\S]+\[Chorus\][\s\S]+\[Bridge\]/);
    assert.doesNotMatch(spec.lyrics, /BPM|vocals?|kick|snare|percussion|instrumental|mixing|편곡|보컬|리버브/i);
    const body = buildKieSunoRequest({ style: spec.style, lyrics: spec.lyrics, title: spec.label, instrumental: spec.instrumental,
      exclude: spec.exclude, naturalFullSong: true, vocalGender: spec.vocalGender === 'male' ? 'm' : 'f', model: 'v6' });
    assert.equal(body.input.custom_mode, true); assert.equal(body.input.instrumental, false);
    assert.equal(body.input.prompt, spec.lyrics); assert.equal(body.input.style, spec.style); assert.equal(body.input.duration, undefined);
    assert.equal(body.input.vocal_gender, spec.vocalGender === 'male' ? 'm' : 'f');
    assert.doesNotMatch(body.input.style, /138 BPM|Original playful electronic dance instrumental/);
  }
});
test('server recipe is deterministic for a retry and varies complete hooks across request seeds', () => {
  const original = resolveDanceMusicSpec('hook-pop', 'on', 'one');
  assert.deepEqual(resolveDanceMusicSpec('hook-pop', 'on', 'one'), original);
  const recipes = Array.from({ length: 8 }, (_, index) => resolveDanceMusicSpec('hook-pop', 'on', `request-${index}`));
  assert.ok(new Set(recipes.map(spec => spec.lyrics)).size > 1);
  assert.ok(new Set(recipes.map(spec => spec.vocalGender)).size > 1);
  for (const args of [['freeform artist style', 'on'], ['hook-pop', 'auto'], [null, 'on'], ['hook-pop', null]]) assert.throws(() => resolveDanceMusicSpec(...args));
});
test('stored recipes preserve exact snapshots and reject malformed values without defaulting to a new song', () => {
  const spec = resolveDanceMusicSpec('afro-groove', 'on', 'saved-request');
  const metadata = { danceMusic: spec };
  assert.deepEqual(getDanceMusicSpec(metadata), spec);
  const copy = getDanceMusicSpec(metadata); copy.style = 'changed';
  assert.equal(getDanceMusicSpec(metadata).style, spec.style);
  for (const mutation of [{ version: 1 }, { bpm: NaN }, { instrumental: 'false' }, { style: 'x'.repeat(1001) }, { lyrics: '' }, { language: 'none' }]) {
    assert.equal(getDanceMusicSpec({ danceMusic: { ...spec, ...mutation } }), null);
  }
  assert.equal(getDanceMusicSpec({ danceMusic: null }), null);
  assert.equal(getDanceMusicSpec({}), null);
});
test('legacy original and same-audio variants retain the known 138 BPM instrumental recipe', () => {
  const base = { workflow: 'dance-music-first-v1', presetId: 'dance_challenge', isInstrumental: true };
  for (const metadata of [{ ...base, dancePreset: { id: DANCE_PRESET.id } },
    { ...base, danceVariant: { sourceTrackId: 'saved' }, danceAudioSelection: { audioHash: 'saved' } }]) {
    const legacy = getDanceMusicSpec(metadata);
    assert.equal(legacy.id, DANCE_PRESET.id); assert.equal(legacy.bpm, 138); assert.equal(legacy.instrumental, true);
    assert.equal(legacy.style, DANCE_PRESET.style); assert.equal(legacy.lyrics, DANCE_PRESET.arrangement);
  }
  assert.equal(getDanceMusicSpec({ ...base, danceMusic: { version: 1 } }), null);
});
