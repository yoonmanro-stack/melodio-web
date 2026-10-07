const test = require('node:test');
const assert = require('node:assert/strict');
const { sealSunoRetryIdentity, resolveSunoRetryIdentity } = require('../worker/suno-retry-identity');
const secret = 'offline-fixture-key-no-production-credentials';
const metadata = { sourceMenu: 'preset-studio', presetId: 'uk_grime', vocalGender: 'female', officialVoiceId: 'fixture-voice', voiceFeatureMode: 'suno_style_persona' };
const identity = { personaId: 'fixture_persona', personaModel: 'style_persona' };
const owner = 'fixture-owner';
const sealed = () => ({ ...metadata, sunoVoiceRetry: sealSunoRetryIdentity(identity, metadata, owner, secret) });
test('a verified selected persona and model survive retry without plain provider ID metadata', () => {
  const value = sealed();
  assert.ok(!value.sunoVoiceRetry.includes(identity.personaId));
  assert.deepEqual(resolveSunoRetryIdentity(value, owner, secret), identity);
  assert.deepEqual(resolveSunoRetryIdentity({ ...value, title: 'New title' }, owner, secret), identity);
});
for (const [field, changed] of [['sourceMenu', 'japan'], ['presetId', 'uk_drill'], ['vocalGender', 'male'], ['officialVoiceId', 'another-voice'], ['artistRevision', 8]]) {
  test(`retry capability rejects changed ${field}`, () => {
    assert.throws(() => resolveSunoRetryIdentity({ ...sealed(), [field]: changed }, owner, secret), { code: 'retry_voice_unavailable' });
  });
}
test('retry capability rejects different owners, credentials, malformed or tampered tokens', () => {
  const value = sealed();
  assert.throws(() => resolveSunoRetryIdentity(value, 'another-owner', secret), { code: 'retry_voice_unavailable' });
  assert.throws(() => resolveSunoRetryIdentity(value, owner, secret + 'changed'), { code: 'retry_voice_unavailable' });
  for (const token of ['v1.bad.bad.bad', value.sunoVoiceRetry.replace(/^v1\./, 'v2.'), value.sunoVoiceRetry + 'x']) {
    assert.throws(() => resolveSunoRetryIdentity({ ...value, sunoVoiceRetry: token }, owner, secret), { code: 'retry_voice_unavailable' });
  }
});
test('legacy registered/artist voices are held before paid retry; default and prompt-only remain usable', () => {
  for (const voice of [metadata, { customVoiceRegistrationId: 'legacy' }, { artistIdentity: { voice: { referenceId: 'legacy' } } }]) {
    assert.throws(() => resolveSunoRetryIdentity(voice, owner, secret), { code: 'retry_voice_unavailable' });
  }
  assert.deepEqual(resolveSunoRetryIdentity({ voicePrompt: 'rough low voice', vocalProfileSpecified: true }, owner, secret), {});
  assert.deepEqual(resolveSunoRetryIdentity({ isInstrumental: true, ...metadata }, owner, undefined), {});
  assert.equal(sealSunoRetryIdentity({}, metadata, owner, undefined), undefined);
});
