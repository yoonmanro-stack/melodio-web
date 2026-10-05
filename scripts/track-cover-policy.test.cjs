const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/track-cover.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, mod.exports);
const { resolveTrackCoverUrl, getTrackCoverFallback, TRACK_COVER_PENDING } = mod.exports;
const legacy = 'https://storage.test/genre.png';
const photo = 'https://storage.test/covers/photo.png';
const track = (status, url = null) => ({ cover_art_url: url, license_hash: JSON.stringify({ coverArt: {
  requestedStyle: 'photoreal', status, assetUrl: photo,
} }) });

test('failed or pending photos do not adopt Suno, genre or secondary images', () => {
  for (const status of ['unavailable', 'pending']) {
    assert.equal(resolveTrackCoverUrl({ ...track(status), image_url: 'https://cdn2.suno.ai/illustration.jpeg' }, legacy), TRACK_COVER_PENDING);
    assert.equal(resolveTrackCoverUrl(track(status, legacy), legacy), TRACK_COVER_PENDING);
  }
});
test('ready photos must match the recorded asset and safe URL protocol', () => {
  assert.equal(resolveTrackCoverUrl(track('ready', photo), legacy), photo);
  assert.equal(resolveTrackCoverUrl(track('ready', legacy), legacy), TRACK_COVER_PENDING);
  assert.equal(resolveTrackCoverUrl({ cover_art_url: 'javascript:bad', metadata: { coverArt: {
    requestedStyle: 'photoreal', status: 'ready', assetUrl: 'javascript:bad',
  } } }, legacy), TRACK_COVER_PENDING);
});
test('a failed photo fetch uses the neutral placeholder even after successful generation', () => {
  assert.equal(getTrackCoverFallback(track('ready', photo), legacy), TRACK_COVER_PENDING);
});
test('legacy artwork and malformed legacy metadata retain their display behavior', () => {
  assert.equal(resolveTrackCoverUrl({ cover_art_url: photo, license_hash: 'old-hash' }, legacy), photo);
  assert.equal(resolveTrackCoverUrl({ image_url: photo }, legacy), photo);
  assert.equal(getTrackCoverFallback({}, legacy), legacy);
  assert.equal(resolveTrackCoverUrl({ cover_art_url: 'https://images.unsplash.com/old.jpg' }, legacy), legacy);
});
