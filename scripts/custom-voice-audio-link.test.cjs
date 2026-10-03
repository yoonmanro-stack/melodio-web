const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync('src/lib/voice/custom-voice-audio-link.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', 'process', compiled)(name => {
  if (name === 'server-only') return {};
  if (name === 'node:crypto') return require(name);
  throw new Error(`Unexpected import: ${name}`);
}, mod, mod.exports, { env: { SUPABASE_SERVICE_ROLE_KEY: 'offline-test-secret' } });

const { createCustomVoiceAudioLink, parseCustomVoiceAudioLink } = mod.exports;
const user = '00000000-0000-4000-8000-000000000001';
const registration = '00000000-0000-4000-8000-000000000002';
const now = Date.UTC(2026, 8, 28, 12, 0, 0);

test('short voice link identifies one private sample without exposing its storage path', () => {
  const url = createCustomVoiceAudioLink(user, registration, 'source', now);
  assert.ok(url.length < 255);
  assert.ok(!url.includes('uploads/'));
  assert.deepEqual(parseCustomVoiceAudioLink(new URL(url).pathname.split('/').pop(), now), {
    userId: user, registrationId: registration, kind: 'source',
  });
});

test('voice link rejects edits and expires after one hour', () => {
  const token = createCustomVoiceAudioLink(user, registration, 'verification', now).split('/').pop();
  assert.equal(parseCustomVoiceAudioLink(token, now)?.kind, 'verification');
  assert.equal(parseCustomVoiceAudioLink(token.replace('000000000002', '000000000003'), now), null);
  assert.equal(parseCustomVoiceAudioLink(token, now + 60 * 60 * 1000 + 1000), null);
});

test('a small clock difference does not reject a freshly signed link', () => {
  const token = createCustomVoiceAudioLink(user, registration, 'source', now + 5_000).split('/').pop();
  assert.equal(parseCustomVoiceAudioLink(token, now)?.registrationId, registration);
  const farFuture = createCustomVoiceAudioLink(user, registration, 'source', now + 31_000).split('/').pop();
  assert.equal(parseCustomVoiceAudioLink(farFuture, now), null);
  assert.equal(parseCustomVoiceAudioLink(token, now + 3_606_000), null);
});
