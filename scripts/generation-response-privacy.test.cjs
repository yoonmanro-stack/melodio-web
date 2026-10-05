/* Pure GET response regression: fake auth/database only; no network or provider requests. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/app/api/generations/route.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const privateB = 'https://fixtures.invalid/private-clip-b.mp3';
const privateTask = 'fixture-task-provenance';
const manifest = { schemaVersion: 1, provider: 'kie', generationId: 'primary', taskId: privateTask, status: 'ready', taskReference: `suno:kie:${privateTask}`, selectedClipKey: 'a', clips: [{ clipKey: 'a', durableUrl: 'https://fixtures.invalid/public-clip-a.mp3' }, { clipKey: 'b', durableUrl: privateB }] };
const meta = { duration: 209, durationSeconds: 209, stylePrompt: 'soft piano', lyricsPrompt: 'fixture lyrics', isPublic: true, audioPersistence: manifest };
const fixtures = [
  { id: 'primary', user_id: 'owner', status: 'completed', title: 'Fixture', created_at: '2026-09-14T10:00:00.000Z', is_public: true, license_hash: JSON.stringify(meta), audio_url: 'https://fixtures.invalid/public-clip-a.mp3', stem_vocals_url: 'storage://private/fixture.wav', email: 'private@example.invalid' },
  { id: 'sibling', user_id: 'owner', status: 'completed', title: 'Fixture (2)', created_at: '2026-09-14T10:00:01.000Z', is_public: false, license_hash: JSON.stringify({ ...meta, isPublic: false, audioPersistence: { ...manifest, selectedClipKey: 'b' } }), audio_url: privateB },
];
function handler(user, rows = fixtures, jobs = [], options = {}) {
  const service = { from(table) {
    let selected = structuredClone(table === 'viral_pet_jobs' ? jobs : rows);
    let projection, signal;
    const result = async () => {
      await options.beforeRead?.(table, signal);
      if (table === 'viral_pet_jobs' && options.petFailure) {
        if (options.petFailure === 'throw') throw new Error('fixture lookup failure');
        return { data: null, error: { message: 'fixture lookup failure' } };
      }
      const data = table === 'viral_pet_jobs' && projection !== 'state'
        ? selected.map(row => ({ track_id: row.state?.audio?.trackId, video_url: row.state?.videoUrl, poster_url: row.state?.shots?.[0]?.keyframeUrl }))
        : selected;
      return { data, error: null };
    };
    const q = {
      select(columns) { projection = columns; options.selects?.push({ table, columns }); return q; }, order() { return q; }, gte() { return q; }, lte() { return q; },
      abortSignal(value) { signal = value; return q; },
      eq(key, value) { selected = selected.filter(row => row[key] === value); return q; },
      neq(key, value) { selected = selected.filter(row => row[key] !== value); return q; },
      like(key, value) { selected = selected.filter(row => typeof row[key] === 'string' && row[key].includes(value.slice(1, -1))); return q; },
      is(key, value) { selected = selected.filter(row => (row[key] ?? null) === value); return q; },
      limit(n) { selected = selected.slice(0, n); return q; },
      single() { return Promise.resolve({ data: selected[0] || null, error: null }); },
      then(resolve, reject) { return result().then(resolve, reject); },
    }; return q;
  } };
  const exports = {};
  vm.runInNewContext(js, { exports, URL, Date, AbortSignal: options.abortSignal || AbortSignal, console: { error() {}, warn() {} }, process: { env: { SUPABASE_SERVICE_ROLE_KEY: 'fixture', NEXT_PUBLIC_SUPABASE_URL: 'https://fixtures.invalid' } }, require(name) {
    if (name === 'next/server') return { NextResponse: { json(body, options) { return { body, status: options?.status || 200 }; } } };
    if (name === '@supabase/supabase-js') return { createClient: () => service };
    if (name === '@/lib/supabase/server') return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) } }) };
    if (name === '@/lib/stems/stem-api') return { PRIVATE_STEM_BUCKET: 'private', PRIVATE_STEM_OUTPUT_BUCKET: 'outputs', parsePrivateStorageUri() { return null; }, validateLegacyPublicStemUploadSource() { return null; } };
    if (name === '../../../../worker/storage-cleanup-policy') return require(path.join(root, 'worker/storage-cleanup-policy'));
    throw new Error('unexpected_module');
  } }, { filename: 'generations-route-fixture.js' });
  return url => exports.GET({ url: 'https://fixtures.invalid/api/generations' + url });
}
function assertPublicRecord(row) {
  const parsed = JSON.parse(row.license_hash);
  assert.equal(parsed.audioPersistence, undefined);
  assert.equal(parsed.duration, 209);
  assert.equal(parsed.stylePrompt, 'soft piano');
  assert.equal(parsed.lyricsPrompt, 'fixture lyrics');
  assert.equal(parsed.isPublic, true);
  assert.equal(row.user_id, undefined);
  assert.equal(row.email, undefined);
  assert.equal(row.stem_vocals_url, null);
  const response = JSON.stringify(row);
  assert.equal(response.includes(privateB), false);
  assert.equal(response.includes(privateTask), false);
}
function assertOwnerRecord(row) {
  assert.deepEqual(JSON.parse(row.license_hash).audioPersistence, { ...manifest, selectedClipKey: row.id === 'sibling' ? 'b' : 'a' });
  assert.equal(JSON.parse(row.license_hash).duration, 209);
  assert.equal(row.user_id, 'owner');
}
const results = [];
async function test(name, run) {
  try { await run(); results.push({ name, passed: true }); }
  catch (error) { console.error(JSON.stringify({ name, passed: false, error: error.name })); process.exitCode = 1; throw new Error('fixture_failed'); }
}
(async () => {
  for (const user of [null, 'other', 'owner']) await test('public_list_' + (user || 'anonymous'), async () => {
    const result = await handler(user)('?scope=public'); assert.equal(result.status, 200); assert.equal(result.body.generations.length, 1); assertPublicRecord(result.body.generations[0]);
  });
  for (const user of [null, 'other']) await test('nonowner_single_' + (user || 'anonymous'), async () => {
    const result = await handler(user)('?id=primary'); assertPublicRecord(result.body.generation); assert.equal(result.body.sibling, null);
  });
  await test('nonowner_public_sibling', async () => {
    const rows = structuredClone(fixtures); rows[1].is_public = true; rows[1].license_hash = JSON.stringify({ ...meta, audioPersistence: { ...manifest, selectedClipKey: 'b' } }); rows[1].audio_url = 'https://fixtures.invalid/public-sibling.mp3'; rows[1].stem_vocals_url = 'storage://private/fixture-b.wav';
    const result = await handler('other', rows)('?id=primary'); assertPublicRecord(result.body.generation); assertPublicRecord(result.body.sibling);
  });
  await test('owner_single_manifest', async () => {
    const result = await handler('owner')('?id=primary'); assertOwnerRecord(result.body.generation); assertOwnerRecord(result.body.sibling);
  });
  await test('sibling_uses_origin_after_title_change_or_delayed_completion', async () => {
    const rows = structuredClone(fixtures);
    rows[0].title = 'Renamed primary (2)'; rows[1].title = 'Unrelated user title';
    rows[1].created_at = '2026-09-15T12:00:00.000Z';
    const result = await handler('owner', rows)('?id=primary');
    assert.equal(result.body.sibling.id, 'sibling');
  });
  await test('same_title_and_time_never_substitute_another_task_or_origin', async () => {
    for (const override of [{ taskId: 'other-task', taskReference: 'suno:kie:other-task' }, { generationId: 'another-primary' }, { taskReference: 'suno:kie:wrong-task' }, { selectedClipKey: 'a' }]) {
      const rows = structuredClone(fixtures);
      rows[1].license_hash = JSON.stringify({ ...meta, audioPersistence: { ...manifest, selectedClipKey: 'b', ...override } });
      const result = await handler('owner', rows)('?id=primary');
      assert.equal(result.body.sibling, null);
    }
  });
  await test('legacy_or_malformed_provenance_returns_primary_without_a_guessed_sibling', async () => {
    for (const license of ['legacy-license', '{}', '{', JSON.stringify({ audioPersistence: { ...manifest, status: 'pending' } })]) {
      const rows = structuredClone(fixtures); rows[0].license_hash = license;
      const result = await handler('owner', rows)('?id=primary');
      assert.equal(result.status, 200); assert.equal(result.body.generation.id, 'primary'); assert.equal(result.body.sibling, null);
    }
  });
  await test('incomplete_cross_owner_and_duplicate_alternates_fail_closed', async () => {
    for (const mutate of [rows => { rows[1].status = 'generating'; }, rows => { rows[1].audio_url = ''; }, rows => { rows[1].user_id = 'other'; }, rows => { rows.push({ ...rows[1], id: 'duplicate-b' }); }]) {
      const rows = structuredClone(fixtures); mutate(rows);
      const result = await handler('owner', rows)('?id=primary'); assert.equal(result.body.sibling, null);
    }
  });
  await test('unrelated_same_title_cannot_hide_the_proven_alternate', async () => {
    const rows = structuredClone(fixtures);
    rows.splice(1, 0, { ...rows[1], id: 'unrelated-b', license_hash: JSON.stringify({ ...meta, audioPersistence: { ...manifest, generationId: 'unrelated-primary', selectedClipKey: 'b' } }) });
    const result = await handler('owner', rows)('?id=primary'); assert.equal(result.body.sibling.id, 'sibling');
  });
  await test('requesting_the_alternate_does_not_reverse_or_invent_the_B_slot', async () => {
    const result = await handler('owner')('?id=sibling'); assert.equal(result.body.generation.id, 'sibling'); assert.equal(result.body.sibling, null);
  });
  await test('saturated_candidate_lookup_does_not_pick_an_unproven_unique_alternate', async () => {
    const rows = structuredClone(fixtures);
    for (let index = 0; index < 7; index++) rows.push({ ...rows[1], id: `unrelated-${index}`, license_hash: JSON.stringify({ ...meta, audioPersistence: { ...manifest, selectedClipKey: 'b', taskId: `another-task-${index}`, taskReference: `suno:kie:another-task-${index}` } }) });
    const result = await handler('owner', rows)('?id=primary'); assert.equal(result.body.sibling, null);
  });
  await test('sibling_lookup_timeout_returns_the_primary_without_blocking_it', async () => {
    const controller = new AbortController(); let timeoutMs;
    const pending = handler('owner', fixtures, [], {
      abortSignal: { timeout(ms) { timeoutMs = ms; return controller.signal; } },
      beforeRead: async (table, signal) => {
        assert.equal(table, 'generations'); assert.equal(signal, controller.signal);
        return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('fixture timeout')), { once: true }));
      },
    })('?id=primary');
    await new Promise(setImmediate);
    assert.equal(timeoutMs, 4000); controller.abort();
    const result = await pending; assert.equal(result.status, 200); assert.equal(result.body.generation.id, 'primary'); assert.equal(result.body.sibling, null);
  });
  await test('owner_dashboard_manifest', async () => {
    const result = await handler('owner')('?scope=dashboard'); assert.equal(result.body.generations.length, 2); result.body.generations.forEach(assertOwnerRecord);
  });
  await test('private_pet_video_dashboard_owned_completed_only', async () => {
    const url = 'https://fixtures.invalid/final-pet.mp4';
    const jobs = [
      { user_id: 'owner', status: 'completed', state: { audio: { trackId: 'sibling' }, videoUrl: url, shots: [{keyframeUrl:'https://fixtures.invalid/actual-first-scene.jpg'}] } },
      { user_id: 'other', status: 'completed', state: { audio: { trackId: 'primary' }, videoUrl: 'https://fixtures.invalid/other.mp4' } },
      { user_id: 'owner', status: 'review', state: { audio: { trackId: 'primary' }, videoUrl: url } },
    ];
    const result = await handler('owner', fixtures, jobs)('?scope=dashboard');
    const row = result.body.generations.find(row => row.id === 'sibling');
    assert.equal(row.video_url, url);
    assert.equal(row.cover_art_url, 'https://fixtures.invalid/actual-first-scene.jpg');
    assert.equal(row.thumbnail_url, row.cover_art_url);
    assert.equal(JSON.parse(row.license_hash).sourceMenu, 'viral-cf');
    assert.equal(JSON.parse(row.license_hash).isPublic, false);
    assert.equal(result.body.generations.find(row => row.id === 'primary').video_url, undefined);
    const publicResult = await handler('other', fixtures, jobs)('?scope=public');
    assert.equal(JSON.stringify(publicResult.body).includes(url), false);
  });
  await test('dashboard_asset_projection_and_parallel_reads', async () => {
    const reads = [], selects = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const pending = handler('owner', fixtures, [], { selects, beforeRead(table) { reads.push(table); return gate; } })('?scope=dashboard');
    await new Promise(setImmediate);
    assert.deepEqual([...reads].sort(), ['generations', 'viral_pet_jobs']);
    const projection = selects.find(query => query.table === 'viral_pet_jobs')?.columns;
    assert.equal(projection, 'track_id:state->audio->>trackId,video_url:state->>videoUrl,poster_url:state->shots->0->>keyframeUrl');
    release();
    const result = await pending;
    assert.equal(result.status, 200);
    assert.equal(result.body.generations.length, fixtures.length);
  });
  for (const petFailure of ['error', 'throw']) await test('optional_video_' + petFailure + '_preserves_owned_audio', async () => {
    const result = await handler('owner', fixtures, [], { petFailure })('?scope=dashboard');
    assert.equal(result.status, 200);
    assert.equal(result.body.generations.length, fixtures.length);
    result.body.generations.forEach(assertOwnerRecord);
  });
  await test('optional_video_timeout_preserves_audio_list', async () => {
    const controller = new AbortController();
    let timeoutMs;
    const pending = handler('owner', fixtures, [], {
      abortSignal: { timeout(value) { timeoutMs = value; return controller.signal; } },
      beforeRead(table, signal) {
        if (table !== 'viral_pet_jobs') return;
        return new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('fixture timeout')), { once: true }); });
      },
    })('?scope=dashboard');
    await new Promise(setImmediate);
    assert.equal(timeoutMs, 4000);
    controller.abort();
    const result = await pending;
    assert.equal(result.status, 200);
    assert.equal(result.body.generations.length, fixtures.length);
    result.body.generations.forEach(assertOwnerRecord);
  });
  await test('private_single_nonowner_404', async () => { const result = await handler('other')('?id=sibling'); assert.equal(result.status, 404); assert.equal(JSON.stringify(result.body).includes(privateB), false); });
  await test('anonymous_dashboard_401', async () => { const result = await handler(null)('?scope=dashboard'); assert.equal(result.status, 401); });
  await test('legacy_license_preserved', async () => { const rows = structuredClone(fixtures); rows[0].license_hash = 'legacy-license'; const result = await handler(null, rows)('?id=primary'); assert.equal(result.body.generation.license_hash, 'legacy-license'); });
  const receipt = { verifiedAt: new Date().toISOString(), sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), caseCount: results.length, passed: results.length, results };
  const receiptPath = path.join(root, 'data/audio-health/generation-response-privacy-verification-20260914.json');
  if (!process.argv.includes('--no-receipt')) {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    if (fs.existsSync(receiptPath)) fs.statSync(receiptPath);
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  }
  console.log(JSON.stringify({ caseCount: results.length, passed: results.length, sourceSha256: receipt.sourceSha256 }));
})().catch(() => { process.exitCode = 1; });
