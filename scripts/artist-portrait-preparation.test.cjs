const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const sharp = require('sharp');
const quality = require('../worker/cover-art-quality');

const compiled = ts.transpileModule(fs.readFileSync('src/lib/artists/portrait-preparation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled)(name => {
  if (name === 'server-only') return {};
  if (name === 'sharp') return sharp;
  if (name === '../../../worker/cover-art-quality') return quality;
  throw new Error(`Unexpected import: ${name}`);
}, mod, mod.exports);
const { prepareArtistPortrait } = mod.exports;
const solid = (width, height, background) => sharp({ create: { width, height, channels: 3, background } });

test('portrait crop is square, JPEG, bounded and reviewed before generation', async () => {
  const source = await solid(600, 800, '#e4ad90').withMetadata().png().toBuffer();
  const prepared = await prepareArtistPortrait(source);
  const metadata = await sharp(prepared).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
  assert.ok(prepared.byteLength < 4 * 1024 * 1024);
  const sample = await sharp(prepared).resize(128, 128).raw().toBuffer();
  assert.equal(quality.inspectCoverSample({ width: 1024, height: 1024, rgb: sample }).accepted, true);
});

test('centre crop retains central identity and removes surplus side regions', async () => {
  const centre = await solid(600, 600, '#ca7850').png().toBuffer();
  const source = await solid(1000, 600, '#226ac1').composite([{ input: centre, left: 200, top: 0 }]).png().toBuffer();
  const prepared = await prepareArtistPortrait(source);
  const pixel = await sharp(prepared).extract({ left: 100, top: 100, width: 1, height: 1 }).raw().toBuffer();
  assert.ok(pixel[0] > 180 && pixel[2] < 100, 'centre crop matches the approved central portrait');
});

test('corrupt, undersized and multiple frame inputs fail before upload', async () => {
  await assert.rejects(() => prepareArtistPortrait(Buffer.from('invalid image')), /invalid_portrait_file/);
  const small = await solid(256, 800, '#d6a890').png().toBuffer();
  await assert.rejects(() => prepareArtistPortrait(small), /artist_portrait_dimensions/);
  const secondFrame = await solid(600, 600, '#226ac1').png().toBuffer();
  const frames = await solid(600, 1200, '#d6a890').composite([{ input: secondFrame, left: 0, top: 600 }]).raw().toBuffer();
  const animated = await sharp(frames, { raw: { width: 600, height: 1200, channels: 3, pageHeight: 600 } }).gif().toBuffer();
  await assert.rejects(() => prepareArtistPortrait(animated), /artist_portrait_dimensions/);
});

test('embedded dark frame bands are rejected before portrait approval', async () => {
  const centre = await solid(600, 420, '#ddb092').png().toBuffer();
  const source = await solid(600, 600, '#080808').composite([{ input: centre, left: 0, top: 90 }]).png().toBuffer();
  await assert.rejects(() => prepareArtistPortrait(source), /artist_portrait_framing/);
});
