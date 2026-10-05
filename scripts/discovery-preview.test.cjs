const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/voice/discovery-preview.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(mod, mod.exports);
const { discoveryPreviewWindow, discoveryPreviewPosition } = mod.exports;

test('a preview uses exactly 30 seconds starting at the curated singing cue', () => {
  assert.deepEqual(discoveryPreviewWindow(180, 42), { start: 42, end: 72 });
  assert.deepEqual(discoveryPreviewWindow(30), { start: 0, end: 30 });
});

test('short, missing and invalid media never masquerade as a ready 30-second preview', () => {
  for (const duration of [0, 15, 29.9, NaN, Infinity, -1]) assert.equal(discoveryPreviewWindow(duration), null);
  assert.equal(discoveryPreviewWindow(50, 30), null);
  assert.equal(discoveryPreviewWindow(180, -1), null);
  assert.equal(discoveryPreviewWindow(180, NaN), null);
});

test('seeking cannot escape the 30-second preview window', () => {
  assert.equal(discoveryPreviewPosition(-20), 0);
  assert.equal(discoveryPreviewPosition(45), 30);
  assert.equal(discoveryPreviewPosition(12.5), 12.5);
  assert.equal(discoveryPreviewPosition(Infinity), 0);
});
