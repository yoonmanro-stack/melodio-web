/** Offline public feed/privacy regressions: production helper, no DB or provider calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'src/lib/video/publicViralVideos.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
let providerCalls = 0;
const moduleFixture = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleFixture, exports: moduleFixture.exports, URL, Date,
  fetch() { providerCalls++; throw new Error('Provider access is forbidden in this pure projection'); },
  require(name) {
    if (name !== './petContentReadiness') throw new Error('Projection must not import runtime services');
    const helper = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/video/petContentReadiness.ts'), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, { module: helper, exports: helper.exports, Date });
    return helper.exports;
  },
  process: { env: new Proxy({}, { get() { throw new Error('Projection must not read environment keys'); } }) },
});
const build = (generations, jobs = []) => JSON.parse(JSON.stringify(moduleFixture.exports.buildPublicViralVideoRows(generations, jobs)));
const metadata = row => JSON.parse(row.license_hash);
const PUBLIC = { sourceMenu: 'viral', isPublic: true, presetId: 'challenge', genre: 'Comedy Pop' };
const NOW = '2026-09-17T06:00:00.000Z';
const OLD = '2026-07-01T00:00:00.000Z';
function generation(overrides = {}, meta = PUBLIC) {
  return { id: 'track-A', user_id: 'owner-A', status: 'completed', title: '공개 완성 영상',
    is_public: true, created_at: OLD, cover_art_url: 'https://example.invalid/audio-cover.jpg',
    license_hash: JSON.stringify(meta), ...overrides };
}
function job(overrides = {}) {
  return { id: 'private-job-id', user_id: 'owner-A', status: 'completed', updated_at: NOW,
    track_id: 'track-A', video_url: 'https://example.invalid/final.mp4',
    poster_url: 'https://example.invalid/first-frame.jpg', ...overrides };
}

test('new public pet final binds to its existing audio without requiring a generation video URL', () => {
  const generations = [generation({}, { isPublic: true, petEpisode: { privateStory: 'PRIVATE_SENTINEL' } })];
  const jobs = [job()];
  const before = JSON.stringify({ generations, jobs });
  const rows = build(generations, jobs);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'track-A');
  assert.equal(rows[0].created_at, NOW);
  assert.equal(rows[0].completed_at, NOW);
  assert.equal(rows[0].cover_art_url, jobs[0].poster_url);
  assert.equal(metadata(rows[0]).video_url, jobs[0].video_url);
  assert.equal(metadata(rows[0]).sourceMenu, 'viral-cf');
  assert.equal(metadata(rows[0]).presetId, 'pet');
  assert.equal(JSON.stringify({ generations, jobs }), before, 'Projection must never mutate durable source rows');
});

for (const [label, row] of [
  ['row false overrides metadata true', generation({ is_public: false })],
  ['license false overrides row true', generation({}, { ...PUBLIC, isPublic: false })],
  ['object metadata false overrides both true', generation({ metadata: { isPublic: false } })],
]) test(`private exclusion: ${label}`, () => assert.deepEqual(build([row], [job()]), []));

test('public proof must be explicit in row or parsed license; unrelated object metadata is insufficient', () => {
  assert.deepEqual(build([generation({ is_public: undefined, metadata: { isPublic: true } }, { sourceMenu: 'viral' })], [job()]), []);
  assert.equal(build([generation({ is_public: undefined }, PUBLIC)], [job()]).length, 1);
  assert.equal(build([generation({}, { sourceMenu: 'viral' })], [job()]).length, 1);
});

for (const raw of ['{broken', '[]', 'null', '42', '"string"', '', null, {}]) {
  test(`malformed or non-object license fails closed (${typeof raw === 'string' ? raw.slice(0, 12) : typeof raw})`, () => {
    assert.deepEqual(build([generation({ license_hash: raw })], [job()]), []);
  });
}

test('deleted/missing generation or missing audio binding cannot publish a job', () => {
  assert.deepEqual(build([], [job()]), []);
  assert.deepEqual(build([generation({ id: 'another-track' })], [job()]), []);
  assert.deepEqual(build([generation()], [job({ track_id: null })]), []);
});

test('job ownership must match the bound generation owner', () => {
  assert.deepEqual(build([generation()], [job({ user_id: 'another-owner' })]), []);
  assert.deepEqual(build([generation({ user_id: null })], [job()]), []);
});

test('pending or failed generations and video jobs cannot create public finals', () => {
  for (const status of ['generating', 'failed', 'review', 'held']) {
    assert.deepEqual(build([generation({ status })], [job()]), []);
    assert.deepEqual(build([generation()], [job({ status })]), []);
  }
});

test('latest valid completed job wins; later invalid or foreign-owner jobs do not shadow it', () => {
  const rows = build([generation()], [
    job({ updated_at: '2026-09-16T01:00:00Z', video_url: 'https://example.invalid/older.mp4' }),
    job(), job(),
    job({ updated_at: '2026-09-18T01:00:00Z', video_url: 'http://example.invalid/insecure.mp4' }),
    job({ updated_at: 'not-a-date', video_url: 'https://example.invalid/bad-date.mp4' }),
    job({ user_id: 'another-owner', updated_at: '2026-09-19T01:00:00Z', video_url: 'https://example.invalid/foreign.mp4' }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(metadata(rows[0]).video_url, 'https://example.invalid/final.mp4');
  assert.equal(rows[0].created_at, NOW);
});

test('generation IDs deduplicate and final rows sort by public completion recency', () => {
  const rows = build([
    generation(), generation(),
    generation({ id: 'legacy', created_at: '2026-08-20T00:00:00Z' }, { ...PUBLIC, video_url: 'https://example.invalid/legacy.mp4' }),
    generation({ id: 'newest' }),
  ], [job(), job({ track_id: 'newest', updated_at: '2026-09-18T00:00:00Z' })]);
  assert.deepEqual(rows.map(row => row.id), ['newest', 'track-A', 'legacy']);
});

test('conflicting private duplicate snapshots cannot be exposed by an older public copy', () => {
  assert.deepEqual(build([generation(), generation({ is_public: false })], [job()]), []);
});

for (const url of ['http://example.invalid/a.mp4', '//example.invalid/a.mp4', 'javascript:alert(1)',
  'data:text/plain,x', 'https://', 'https://user:password@example.invalid/a.mp4']) {
  test(`invalid or credentialed final URL is excluded (${url.split(':')[0]})`, () => {
    assert.deepEqual(build([generation()], [job({ video_url: url })]), []);
    assert.deepEqual(build([generation({}, { ...PUBLIC, video_url: url })]), []);
  });
}

test('invalid first-frame URL uses only a safe existing cover fallback', () => {
  assert.equal(build([generation()], [job({ poster_url: 'http://example.invalid/frame.jpg' })])[0].cover_art_url,
    'https://example.invalid/audio-cover.jpg');
  assert.equal(build([generation({ cover_art_url: 'https://user@example.invalid/cover.jpg' })],
    [job({ poster_url: null })])[0].cover_art_url, '');
});

test('legitimate legacy public viral videos and URL aliases remain visible without jobs', () => {
  for (const field of ['video_url', 'grok_video_url', 'videoUrl']) {
    const rows = build([generation({}, { sourceMenu: 'viral-cf', [field]: 'https://example.invalid/legacy.mp4' })]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].created_at, OLD);
    assert.equal(metadata(rows[0]).video_url, 'https://example.invalid/legacy.mp4');
  }
  assert.equal(build([generation({ is_public: undefined }, { viralMode: true, isPublic: true, video_url: 'https://example.invalid/legacy.mp4' })]).length, 1);
  assert.deepEqual(build([generation({}, { sourceMenu: 'playlist', isPublic: true, video_url: 'https://example.invalid/unrelated.mp4' })]), []);
});

test('public DTO whitelists list data and never leaks job IDs, owners, stories, prompts, or state', () => {
  const secret = 'PRIVATE_SENTINEL';
  const rows = build([generation({ email: secret, prompt: secret, user_id: secret, metadata: { privateNotes: secret } }, {
    ...PUBLIC, privateNotes: secret, petEpisode: { story: secret }, requestId: secret,
    play_count: 12, genre: 'Comedy Pop', styleName: 'Comedy', brand_name: 'Public Channel',
  })], [job({ user_id: secret, id: secret, state: { privateNotes: secret }, requestId: secret })]);
  assert.equal(rows.length, 1);
  assert.equal(JSON.stringify(rows).includes(secret), false);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['id', 'title', 'status', 'is_public', 'created_at', 'completed_at', 'play_count', 'cover_art_url', 'license_hash'].sort());
  assert.deepEqual(Object.keys(metadata(rows[0])).sort(), ['sourceMenu', 'viralMode', 'video_url', 'presetId', 'tab_type', 'genCategory', 'genre', 'styleName', 'brand_name'].sort());
  assert.equal(rows[0].play_count, 12);
});

test.after(() => assert.equal(providerCalls, 0, 'Every regression is offline and the projection must call no provider'));
