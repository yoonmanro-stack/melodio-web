const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { escapePetCaption } = require('../src/lib/video/petRenderer.ts');

test('short Korean captions balance intact words instead of leaving a lone ending', () => {
  assert.equal(escapePetCaption('키보드 하나 더 사면 끝인 줄'), '키보드 하나 더\\N사면 끝인 줄');
  assert.equal(escapePetCaption('네 자린 왼쪽, 내 자린 오른쪽'), '네 자린 왼쪽,\\N내 자린 오른쪽');
  assert.equal(escapePetCaption('아, 키보드 말고 내 옆이었네'), '아, 키보드 말고\\N내 옆이었네');
});

test('fitting captions retain one line and normalize repeated whitespace', () => {
  assert.equal(escapePetCaption('  비싼  자리표 하나 샀네 '), '비싼 자리표 하나 샀네');
  assert.equal(escapePetCaption(''), '');
});

test('only oversized words split and every glyph is retained within the width cap', () => {
  for (const text of ['가'.repeat(56), 'M'.repeat(56), 'A'.repeat(56)]) {
    const lines = escapePetCaption(text).split('\\N');
    assert.equal(lines.join(''), text);
    assert.ok(lines.every(line => [...line].reduce((width, char) => width + (char === 'A' ? 0.55 : 1), 0) <= 13));
  }
});

test('ASS control characters remain inert after word wrapping', () => {
  const caption = escapePetCaption('{\\an7}안녕\\N집사\u0000');
  assert.ok(!/[{}\u0000]/.test(caption));
  assert.ok(!caption.includes('\\an7'));
});
