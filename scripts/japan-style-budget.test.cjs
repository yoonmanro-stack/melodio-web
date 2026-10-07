const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const moduleValue = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/japan-style-budget.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(moduleValue, moduleValue.exports, name => { assert.equal(name, './japan-preset-profile'); const profiles = require('../worker/japan-preset-profiles.json'); return { getJapanPresetProfile: id => profiles[id] }; });
const { fitJapanStyleBudget } = moduleValue.exports;

test('other Japan presets and unselected/custom presets keep their exact existing slice behavior', () => {
  for (const id of [undefined, 'custom-japan', 'unreviewed-copy', 'kawaii_future_bass', 'kawaii-future-copy', 'custom-harajuku']) {
    for (const text of ['', '  airy male, 72 BPM  ', 'x'.repeat(1001), '🦄'.repeat(501)]) {
      assert.equal(fitJapanStyleBudget(text, id), text.length <= 1000 ? text : text.slice(0, 1000));
    }
  }
});
test('Harajuku retains complete clauses and the early chosen voice/tempo instead of a partial instrument word', () => {
  const identity = 'Kawaii future bass, chosen mature husky mezzo, 140 BPM, ';
  const prefix = identity + 'synth '.repeat(Math.ceil((994 - identity.length) / 6)).slice(0, 994 - identity.length);
  const source = prefix + 'shamisen, clear ending';
  assert.equal(source.slice(0, 1000).endsWith('shamis'), true);
  const fitted = fitJapanStyleBudget(source, 'kawaii-future');
  assert.ok(fitted.length <= 1000);
  assert.match(fitted, /chosen mature husky mezzo, 140 BPM/);
  assert.doesNotMatch(fitted, /shami(?:s|se)?$/);
  assert.equal(fitJapanStyleBudget(fitted, 'kawaii-future'), fitted);
});
test('ordinary short Harajuku strings remain exact, while an unbroken over-budget token is rejected', () => {
  const text = '  Kawaii future bass, natural airy lead, glassy synths  ';
  assert.equal(fitJapanStyleBudget(text, 'kawaii-future'), text);
  assert.throws(() => fitJapanStyleBudget('x'.repeat(1001), 'kawaii-future'), /스타일 설명이 너무 깁니다/);
});
