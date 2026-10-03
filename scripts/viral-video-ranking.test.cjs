/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node CommonJS test harness. */
/** Production ranking helper regressions; no external services or environment keys. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/video/viralVideoRanking.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleFixture = { exports: {} };
let providerCalls = 0;
vm.runInNewContext(compiled, {
  module: moduleFixture, exports: moduleFixture.exports, Date,
  fetch() { providerCalls++; throw new Error('No provider requests in ranking'); },
  require() { throw new Error('No runtime dependencies in ranking'); },
  process: { env: new Proxy({}, { get() { throw new Error('No environment access in ranking'); } }) },
});
const select = moduleFixture.exports.selectTopViralVideos;
const NOW = new Date('2026-09-17T06:30:00.000Z');
const ids = rows => Array.from(rows, row => row.id);
function video(id, createdAt = '2026-09-01T00:00:00.000Z', viewCount = 0, extra = {}) {
  return { id, videoUrl: `https://example.invalid/${id}.mp4`, createdAt, viewCount, ...extra };
}

test('exact three-month cutoff and current instant are inclusive, with older/future instants excluded', () => {
  const rows = [video('older', '2026-06-17T06:29:59.999Z', 999),
    video('boundary', '2026-06-17T06:30:00.000Z'), video('now', NOW.toISOString()),
    video('future', '2026-09-17T06:30:00.001Z', 999)];
  assert.deepEqual(ids(select(rows, NOW)), ['now', 'boundary']);
});

test('videos older than one month remain eligible throughout the three-month window', () => {
  assert.deepEqual(ids(select([video('two-month-old', '2026-07-17T06:30:00Z'),
    video('almost-three-months', '2026-06-18T00:00:00Z'), video('too-old', '2026-06-16T00:00:00Z', 900)], NOW)),
  ['two-month-old', 'almost-three-months']);
});

test('May31 clamps the cutoff to February28 while preserving the UTC time', () => {
  const now = new Date('2026-05-31T12:15:00Z');
  assert.deepEqual(ids(select([video('cutoff', '2026-02-28T12:15:00Z'),
    video('too-early', '2026-02-28T12:14:59Z', 900)], now)), ['cutoff']);
});

test('leap-year May31 clamps to February29', () => {
  const now = new Date('2028-05-31T12:15:00Z');
  assert.deepEqual(ids(select([video('leap-cutoff', '2028-02-29T12:15:00Z'),
    video('too-early', '2028-02-28T12:15:00Z', 900)], now)), ['leap-cutoff']);
});

test('calendar subtraction crosses the year boundary without converting months to 90 days', () => {
  const now = new Date('2026-01-31T00:00:00Z');
  assert.deepEqual(ids(select([video('cutoff', '2025-10-31T00:00:00Z'),
    video('older', '2025-10-30T23:59:59Z', 900)], now)), ['cutoff']);
});

test('offset timestamps compare as UTC instants at the boundary', () => {
  assert.deepEqual(ids(select([video('same-instant', '2026-06-17T15:30:00+09:00'),
    video('older', '2026-06-17T15:29:59+09:00', 900)], NOW)), ['same-instant']);
});

test('invalid dates, impossible calendar dates, and future dates are excluded regardless of views', () => {
  const rows = ['', 'not-a-date', '2026-13-01T00:00:00Z', '2026-06-31T00:00:00Z',
    '2026-09-18T00:00:00Z'].map((date, index) => video(`invalid-${index}`, date, 999));
  rows.push(video('valid'));
  assert.deepEqual(ids(select(rows, NOW)), ['valid']);
  assert.deepEqual(ids(select(rows, new Date('invalid'))), []);
});

test('views outrank recency and equal views use the newest creation date', () => {
  assert.deepEqual(ids(select([video('newer-low', '2026-09-16T00:00:00Z', 9),
    video('older-high', '2026-06-20T00:00:00Z', 10),
    video('newer-high', '2026-09-10T00:00:00Z', 10)], NOW)),
  ['newer-high', 'older-high', 'newer-low']);
});

test('ranking occurs before the20 limit rather than limiting the first20 input rows', () => {
  const rows = Array.from({ length: 25 }, (_, index) => video(`row-${index}`, '2026-09-01T00:00:00Z', index));
  const selected = select(rows, NOW);
  assert.equal(selected.length, 20);
  assert.deepEqual(ids(selected), Array.from({ length: 20 }, (_, index) => `row-${24 - index}`));
});

test('more than20 videos with equal views use recency to determine who enters TOP20', () => {
  const rows = Array.from({ length: 22 }, (_, index) => video(`tie-${index}`,
    `2026-09-01T${String(index).padStart(2, '0')}:00:00Z`, 10));
  assert.deepEqual(ids(select(rows, NOW)), Array.from({ length: 20 }, (_, index) => `tie-${21 - index}`));
});

test('duplicate IDs and duplicate video URLs are removed before the20 limit so later unique videos fill slots', () => {
  const rows = Array.from({ length: 21 }, (_, index) => video(`unique-${index}`, '2026-09-01T00:00:00Z', 100 - index));
  rows.splice(1, 0, video('unique-0', '2026-09-02T00:00:00Z', 50, { videoUrl: 'https://example.invalid/alternate.mp4' }));
  rows.splice(2, 0, video('alias', '2026-09-01T00:00:00Z', 99, { videoUrl: rows[0].videoUrl }));
  const selected = select(rows, NOW);
  assert.equal(selected.length, 20);
  assert.deepEqual(ids(selected), Array.from({ length: 20 }, (_, index) => `unique-${index}`));
  assert.equal(new Set(Array.from(selected, row => row.videoUrl)).size, 20);
});

test('best-ranked duplicate wins instead of whichever duplicate appeared first in input', () => {
  const rows = [video('duplicate', '2026-09-01T00:00:00Z', 1, { marker: 'old' }),
    video('duplicate', '2026-09-02T00:00:00Z', 9, { marker: 'best' })];
  assert.equal(select(rows, NOW)[0], rows[1]);
});

test('frozen input and Date remain unchanged and complete original records are preserved', () => {
  const row = Object.freeze(video('full-record', '2026-09-01T00:00:00Z', 1,
    { category: 'pet', posterUrl: 'https://example.invalid/frame.jpg', editorial: Object.freeze({ title: '공개 제목' }) }));
  const rows = Object.freeze([row, Object.freeze(video('higher', '2026-09-01T00:00:00Z', 2))]);
  const before = JSON.stringify(rows);
  const beforeNow = NOW.getTime();
  const selected = select(rows, NOW);
  assert.equal(selected[1], row);
  assert.equal(selected[1].editorial, row.editorial);
  assert.equal(selected[1].category, 'pet');
  assert.equal(JSON.stringify(rows), before);
  assert.equal(NOW.getTime(), beforeNow);
});

test('empty input returns an empty fresh array', () => {
  const rows = [];
  const selected = select(rows, NOW);
  assert.deepEqual(ids(selected), []);
  assert.notEqual(selected, rows);
});

test.after(() => assert.equal(providerCalls, 0));
