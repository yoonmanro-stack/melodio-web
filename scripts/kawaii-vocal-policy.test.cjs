const test = require('node:test');
const assert = require('node:assert/strict');
const provider = require('../worker/suno-provider.js');
const { protectKawaiiLeadVocal } = require('../worker/kawaii-vocal-policy.js');
const base = { sourceMenu: 'japan', presetId: 'kawaii-future', instrumental: false, naturalFullSong: true, model: 'V6',
  style: 'Kawaii future bass, 140 BPM, wide modulated synth chords, bouncy sub-bass, synth chops',
  lyrics: '[Verse]\n君の声を聞く\n[Chorus]\n明日へ歩こう', vocalGender: 'f', exclude: 'harsh drums' };

test('default Harajuku lead has adult character without processed pitch and without losing Future Bass layers', () => {
  const r = provider.buildKieSunoRequest(base).input;
  assert.match(r.style, /natural adult lead.*forward resonance.*midrange body/);
  assert.match(r.style, /articulate the requested lyrics/);
  assert.match(r.style, /140 BPM.*modulated synth chords.*sub-bass.*synth chops/);
  assert.match(r.negative_tags, /^harsh drums, chipmunk lead vocal/);
  assert.match(r.negative_tags, /chopped main sung vocal/);
  assert.equal(r.prompt, base.lyrics);
  assert.equal(r.vocal_gender, 'f');
  assert.equal(Object.hasOwn(r, 'duration'), false);
  assert.equal(Object.hasOwn(r, 'vocalProfileSpecified'), false);
  assert.doesNotMatch(r.style, /Japanese lyrics|crystal.clear|polished|bright lead vocal/);
});
test('chosen style-only, registered voice and style-persona retain character without default color injection', () => {
  for (const voice of [{ vocalProfileSpecified: true }, { personaId: 'chosen_voice_123', personaModel: 'voice_persona' }, { personaId: 'chosen_style_123', personaModel: 'style_persona' }]) {
    const o = { ...base, ...voice, style: 'Kawaii future bass, chosen husky low alto with airy grain, 147 BPM, synth chops' };
    const r = provider.buildKieSunoRequest(o).input;
    assert.match(r.style, /Preserve the chosen lead-vocal timbre/);
    assert.match(r.style, /chosen husky low alto with airy grain, 147 BPM/);
    assert.doesNotMatch(r.style, /solid midrange body|distinctive dry texture/);
    if (voice.personaId) assert.equal(r.persona_id, voice.personaId);
    if (voice.personaModel) assert.equal(r.persona_model, voice.personaModel);
  }
});
test('scope stays exact and off-scope does not call a fitter or normalize authored values', () => {
  for (const override of [{ sourceMenu: 'preset-studio' }, { presetId: 'kawaii_future_bass' }, { presetId: 'kawaii-future-copy' }, { instrumental: true }, { naturalFullSong: false }]) {
    const style = '  chosen vox  ', exclude = '  author tags  ';
    assert.deepEqual(protectKawaiiLeadVocal({ ...base, ...override }, style, exclude, () => { throw Error('unexpected_fit'); }), { style, exclude });
  }
});
test('reserved style budget preserves early voice/tempo and repeated application is stable', () => {
  for (const length of [625, 950, 1000]) {
    const prefix = 'Kawaii future bass, mature husky alto, 145 BPM, ';
    const style = (prefix + 'warm synth chords, '.repeat(80)).slice(0, length);
    const options = { ...base, vocalProfileSpecified: true };
    const once = protectKawaiiLeadVocal(options, style, 'user tags', provider.fitSunoStylePrompt);
    const twice = protectKawaiiLeadVocal(options, once.style, once.exclude, provider.fitSunoStylePrompt);
    assert.deepEqual(twice, once);
    assert.ok(once.style.length <= 1000);
    assert.match(once.style, /mature husky alto, 145 BPM/);
  }
});
test('full authored negatives stay intact and LoFi protection remains separate', () => {
  const full = 'x'.repeat(1000);
  assert.equal(provider.buildKieSunoRequest({ ...base, exclude: full }).input.negative_tags, full);
  const lofi = provider.buildKieSunoRequest({ ...base, presetId: 'lofi-study', style: 'J-lofi, male airy timbre, 72 BPM, tape hiss, rain' }).input;
  assert.match(lofi.style, /lo-fi tape warmth and hiss belong only to instruments/);
  assert.match(lofi.negative_tags, /cup-filtered lead vocal/);
  assert.doesNotMatch(lofi.style, /distinctive dry texture/);
  assert.doesNotMatch(lofi.negative_tags, /chipmunk/);
});
