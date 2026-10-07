/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node tests use CommonJS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { protectLofiLeadVocal } = require('../worker/lofi-vocal-policy');
const { fitSunoStylePrompt } = require('../worker/suno-provider');
const { compileLyricsSections, prepareLyricsSubmission } = require('../worker/lyrics-policy');

const target = Object.freeze({ sourceMenu: 'japan', presetId: 'lofi-study', instrumental: false, naturalFullSong: true });
const identity = 'J-Lofi hip-hop, chosen husky and airy male baritone, 73 BPM';
const base = `${identity}, warm Rhodes and soft backing tape hiss, gentle rain ambience`;
const expectedExclusions = ['telephone-filtered lead vocal', 'cup-filtered lead vocal', 'electrical static on lead vocal'];
const clauseKeys = value => value.split(',').map(clause => clause.trim().replace(/\s+/g, ' ').toLowerCase());

function policy(style = base, exclude = '') {
  return protectLofiLeadVocal(target, style, exclude, fitSunoStylePrompt);
}

function exactStyle(length) {
  let result = `${base}, `;
  const clause = 'warm Rhodes and brushed drums, ';
  while (result.length + clause.length + 4 <= length) result += clause;
  result += 'soft'.padEnd(length - result.length, 'x');
  assert.equal(result.length, length);
  return result;
}

test('the exact target scopes tape/hiss to backing while retaining chosen vocal color and tempo', () => {
  const result = policy(base, 'no choir');
  assert.match(result.style, /^Preserve the chosen vocal timbre and natural full-range presence from the first sung phrase;/);
  assert.match(result.style, /lo-fi tape warmth and hiss belong only to instruments and background ambience/);
  assert.ok(result.style.endsWith(base));
  for (const phrase of ['husky and airy male baritone', '73 BPM', 'soft backing tape hiss', 'gentle rain ambience']) {
    assert.ok(result.style.includes(phrase), phrase);
  }
  assert.doesNotMatch(result.style, /bright|crystal.clear|clean vocal|beauty/i);
  assert.equal(result.exclude, `no choir, ${expectedExclusions.join(', ')}`);
  assert.deepEqual(Object.keys(result).sort(), ['exclude', 'style']);
});

test('every off-scope request returns the literal original inputs without using the fitter', () => {
  const style = '  Indie folk, husky baritone, 91 BPM\n';
  const exclude = '  no choir,  telephone effect on instruments  ';
  const changes = [
    { sourceMenu: 'preset-studio' }, { sourceMenu: 'audio-forge' }, { sourceMenu: 'Japan' },
    { sourceMenu: 'japan ' }, { presetId: 'cozy-jazz-cafe' }, { presetId: 'lofi_study' },
    { presetId: 'lofi-study-extra' }, { presetId: ' lofi-study' }, { instrumental: true },
    { instrumental: undefined }, { instrumental: 'false' }, { naturalFullSong: false },
    { naturalFullSong: undefined }, { naturalFullSong: 'true' },
  ];
  for (const change of changes) {
    const result = protectLofiLeadVocal({ ...target, ...change }, style, exclude, () => { throw Error('Off-scope fitter call'); });
    assert.deepEqual(result, { style, exclude });
  }
  for (const options of [null, undefined, {}, [], 'japan', false]) {
    assert.deepEqual(protectLofiLeadVocal(options, style, exclude), { style, exclude });
  }
});

for (const length of [625, 950, 1000]) test(`${length}-character styles reserve the cue and keep early voice/tempo at complete boundaries`, () => {
  const original = exactStyle(length);
  let observedBudget;
  const result = protectLofiLeadVocal(target, original, '', (body, limit) => {
    observedBudget = limit;
    assert.equal(body, original);
    return fitSunoStylePrompt(body, limit);
  });
  const prefixEnd = result.style.indexOf(`, ${identity}`);
  assert.ok(prefixEnd > 0);
  const guard = result.style.slice(0, prefixEnd);
  assert.equal(observedBudget, 1000 - guard.length - 2);
  assert.ok(result.style.length <= 1000);
  assert.ok(result.style.includes(identity));
  assert.ok(result.style.includes('soft backing tape hiss'));
  const fitted = result.style.slice(prefixEnd + 2);
  assert.ok(original.startsWith(fitted));
  if (fitted.length < original.length) assert.match(original.slice(fitted.length, fitted.length + 1), /[\s,;]/);
});

test('a boundary cannot turn a final instrument name into a partial tag', () => {
  const original = `${identity}, ${'warm acoustic guitar, '.repeat(60)}shamisen ornament, gentle strings`;
  const result = policy(original);
  assert.ok(result.style.length <= 1000);
  assert.match(result.style, /warm acoustic guitar$/);
  assert.doesNotMatch(result.style, /\bshami$/);
  assert.ok(result.style.includes(identity));
});

test('guard and exclusions are idempotent, including a caller header added before an existing guard', () => {
  const first = policy(exactStyle(1000), 'no choir');
  assert.deepEqual(policy(first.style, first.exclude), first);
  const guard = first.style.slice(0, first.style.indexOf(`, ${identity}`));
  const withHeader = policy(`Natural complete song and ending, ${first.style}`, first.exclude);
  assert.equal(withHeader.style.split(guard).length - 1, 1);
  assert.ok(withHeader.style.startsWith(guard));
  assert.ok(withHeader.style.includes('Natural complete song and ending'));
  assert.ok(withHeader.style.includes(identity));
  assert.equal(withHeader.exclude, first.exclude);
});

test('existing authored negative tags retain their spelling/spacing and policy clauses deduplicate by case', () => {
  const original = '  No Choir, TELEPHONE-FILTERED LEAD VOCAL, electrical   static on lead vocal  ';
  const result = policy(base, original);
  assert.ok(result.exclude.startsWith(original));
  for (const clause of expectedExclusions) assert.equal(clauseKeys(result.exclude).filter(value => value === clause).length, 1);
  assert.ok(result.exclude.endsWith('cup-filtered lead vocal'));
  const complete = 'No Choir, TELEPHONE-FILTERED LEAD VOCAL, CUP-filtered lead vocal, electrical   static on lead vocal  ';
  assert.equal(policy(base, complete).exclude, complete);
  assert.equal(policy(base, result.exclude).exclude, result.exclude);
});

test('the negative-tag budget never slices or replaces user exclusions', () => {
  const additionLength = expectedExclusions.join(', ').length + 2;
  const fits = 'x'.repeat(1000 - additionLength);
  assert.equal(policy(base, fits).exclude.length, 1000);
  const tooLong = 'x'.repeat(1001 - additionLength);
  assert.equal(policy(base, tooLong).exclude, tooLong);
  const oversizedUser = `no choir, ${'user-tag,'.repeat(160)}`;
  assert.ok(oversizedUser.length > 1000);
  assert.equal(policy(base, oversizedUser).exclude, oversizedUser);
});

test('the added negatives target the lead without denying ambient hiss, tape, distortion or airy/husky timbre', () => {
  for (const exclude of ['', undefined, null]) {
    const result = policy(base, exclude);
    assert.deepEqual(clauseKeys(result.exclude), expectedExclusions);
    assert.doesNotMatch(result.exclude, /\b(?:hiss|tape|distortion|airy|husky)\b/i);
  }
  const original = 'no choir, preserve background tape hiss';
  assert.ok(policy(base, original).exclude.startsWith(original));
});

test('malformed/empty styles and unknown options are safe; active protection requires a valid bounded fitter', () => {
  for (const style of [undefined, null, 42, {}, '', '  \n']) {
    assert.deepEqual(protectLofiLeadVocal(target, style, 'user tags'), { style, exclude: 'user tags' });
  }
  assert.throws(() => protectLofiLeadVocal(target, base, ''), TypeError);
  assert.throws(() => protectLofiLeadVocal(target, base, '', () => undefined), TypeError);
  assert.throws(() => protectLofiLeadVocal(target, base, '', () => 'x'.repeat(1000)), RangeError);
});

test('the demonstrated Intro description remains global context but never becomes sung lyrics or a forced bright voice', () => {
  const lyricsSections = [
    { type: 'intro', description: 'soft tape hiss, warm backing texture', content: '  君の声が聞こえる  ' },
    { type: 'verse', description: 'husky and airy male baritone', content: '夜の雨\n窓の灯り' },
  ];
  const compiled = compileLyricsSections(lyricsSections);
  assert.equal(compiled.styleDescriptions[0], 'soft tape hiss, warm backing texture');
  const prepared = prepareLyricsSubmission({ stylePrompt: identity, lyricsPrompt: '', lyricsSections,
    isInstrumental: false, vocalGender: 'male' });
  assert.match(prepared.stylePrompt, /soft tape hiss/);
  assert.doesNotMatch(prepared.stylePrompt, /Intro/);
  const options = Object.freeze({ ...target, lyricsPrompt: prepared.lyricsPrompt, lyricsSections,
    personaId: 'offline-persona', vocalGender: 'm', durationSeconds: 187.224 });
  const before = JSON.stringify(options);
  const result = protectLofiLeadVocal(options, prepared.stylePrompt, 'no choir', fitSunoStylePrompt);
  assert.equal(JSON.stringify(options), before);
  assert.equal(options.lyricsPrompt, compiled.lyricsPrompt);
  assert.ok(options.lyricsPrompt.startsWith('[Intro]\n  君の声が聞こえる  '));
  assert.doesNotMatch(options.lyricsPrompt, /tape hiss|Preserve the chosen|telephone-filtered/);
  assert.ok(result.style.includes('husky and airy male baritone'));
  assert.ok(result.style.includes('73 BPM'));
  assert.ok(result.style.includes('soft tape hiss'));
});

test('native lyrics and chosen voice/timing/persona context stay byte-identical across repeated policy calls', () => {
  const options = Object.freeze({ ...target, vocalGender: 'm', personaId: 'offline-persona',
    lyricsPrompt: '[Intro]\n君の声\n[Verse]\n가사 / paroles / गीत', durationSeconds: 185.64 });
  const before = JSON.stringify(options);
  const style = `選択したハスキーな男性の息感, ${base}`;
  const first = protectLofiLeadVocal(options, style, 'original exclusions', fitSunoStylePrompt);
  assert.deepEqual(protectLofiLeadVocal(options, first.style, first.exclude, fitSunoStylePrompt), first);
  assert.equal(JSON.stringify(options), before);
  assert.ok(first.style.includes('選択したハスキーな男性の息感'));
});
