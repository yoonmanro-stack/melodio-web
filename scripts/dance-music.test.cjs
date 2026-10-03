const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(mocks = {}, fakeProcess = { env: {} }) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      return require(name);
    };
    new Function('require', 'module', 'exports', 'process', compiled)(localRequire, mod, mod.exports, fakeProcess);
    return mod.exports;
  }
  return load;
}
const load = loader();
const { createDanceMusicService, DanceMusicError, danceMusicInput, isActiveDanceMusic, toDanceTrack } = load('src/lib/dance/music.ts');
const { DANCE_PRESET, DANCE_WORKFLOW, DANCE_CATEGORY_ID } = load('src/lib/dance/preset.ts');
const USER = 'a0000000-0000-4000-8000-000000000001';
const REQUEST = 'b0000000-0000-4000-8000-000000000001';
const NEXT = 'b0000000-0000-4000-8000-000000000002';
const OTHER = 'a0000000-0000-4000-8000-000000000002';
const STAMP = '2026-09-18T00:00:00.000Z';
function fixture({ submit, update } = {}) {
  const rows = new Map(), calls = [];
  const repository = {
    async find(id) { return rows.has(id) ? structuredClone(rows.get(id)) : null; },
    async list(userId, id) { return [...rows.values()].filter(row => row.user_id === userId && (!id || id === row.id)).map(row => structuredClone(row)); },
    async active(userId) { return [...rows.values()].find(row => row.user_id === userId && isActiveDanceMusic(row)) || null; },
    async insert(row) { if (rows.has(row.id)) return false; rows.set(row.id, structuredClone(row)); return true; },
    async updatePending(row, change) {
      if (update) return update(row, change, rows);
      const current = rows.get(row.id);
      if (!current || current.user_id !== row.user_id || current.status !== 'generating' || current.source_audio_url !== null || current.license_hash !== row.license_hash) return false;
      rows.set(row.id, { ...current, ...change }); return true;
    },
  };
  const service = createDanceMusicService({ repository, storageOrigin: 'https://storage.test', now: () => new Date(STAMP),
    submit: async options => { calls.push(options); return submit ? submit(options) : { taskId: 'kie-task-1', model: 'V6' }; } });
  return { rows, calls, repository, service };
}
test('authentication and preset lock reject before storage or provider submission', async () => {
  const ctx = fixture();
  await assert.rejects(ctx.service.create('', { requestId: REQUEST, isPublic: false }), error => error.status === 401);
  for (const extra of [{ stylePrompt: 'tamper' }, { durationSeconds: 28 }, { sourceMenu: 'viral' }, { isInstrumental: false }, { model: 'v5' }]) {
    assert.throws(() => danceMusicInput({ requestId: REQUEST, isPublic: false, ...extra }), DanceMusicError);
  }
  assert.equal(ctx.rows.size, 0); assert.equal(ctx.calls.length, 0);
});
test('first request reserves ownership and submits exactly the fixed full-song instrumental', async () => {
  const ctx = fixture();
  const track = await ctx.service.create(USER, { requestId: REQUEST, isPublic: true });
  assert.equal(track.id, REQUEST); assert.equal(track.status, 'generating'); assert.equal(track.durationSeconds, null);
  assert.deepEqual(ctx.calls[0], { style: DANCE_PRESET.style, lyrics: DANCE_PRESET.arrangement, title: track.title,
    instrumental: true, model: DANCE_PRESET.model, exclude: DANCE_PRESET.exclude, durationSeconds: 195 });
  const row = ctx.rows.get(REQUEST), meta = JSON.parse(row.license_hash);
  assert.equal(row.user_id, USER); assert.equal(row.source_audio_url, 'suno:kie:kie-task-1');
  assert.equal(meta.sourceMenu, 'dance'); assert.equal(meta.workflow, DANCE_WORKFLOW); assert.equal(meta.presetId, DANCE_CATEGORY_ID);
  assert.equal(meta.bpm, '138'); assert.equal(meta.durationSeconds, 195); assert.equal(meta.danceSubmission.state, 'submitted');
  assert.doesNotMatch(JSON.stringify(track), /suno:kie|license_hash|stylePrompt|audioPersistence/);
  assert.deepEqual(await ctx.service.list(USER, REQUEST), [track]);
  assert.deepEqual(await ctx.service.list(OTHER, REQUEST), []);
});
test('concurrent duplicate request token permits only one paid submit, including later retries', async () => {
  const ctx = fixture();
  const input = { requestId: REQUEST, isPublic: true };
  const tracks = await Promise.all([ctx.service.create(USER, input), ctx.service.create(USER, input)]);
  assert.equal(tracks[0].id, tracks[1].id); assert.equal(ctx.calls.length, 1);
  await ctx.service.create(USER, { ...input, isPublic: false });
  assert.equal(ctx.calls.length, 1); assert.equal(ctx.rows.get(REQUEST).is_public, true);
  await assert.rejects(ctx.service.create(OTHER, input), error => error.status === 404);
  await assert.rejects(ctx.service.create(USER, { requestId: NEXT, isPublic: false }), error => error.code === 'ACTIVE_REQUEST');
});
test('ambiguous timeout persists attention, never resubmits, and blocks a new token', async () => {
  const ctx = fixture({ submit: async () => { throw new Error('private provider response must not leak'); } });
  const track = await ctx.service.create(USER, { requestId: REQUEST, isPublic: false });
  assert.equal(track.status, 'attention'); assert.equal(ctx.rows.get(REQUEST).status, 'failed');
  assert.doesNotMatch(JSON.stringify(ctx.rows.get(REQUEST)), /private provider/);
  const retry = await ctx.service.create(USER, { requestId: REQUEST, isPublic: false });
  assert.equal(retry.status, 'attention'); assert.equal(ctx.calls.length, 1);
  await assert.rejects(ctx.service.create(USER, { requestId: NEXT, isPublic: false }), error => error.status === 409);
});
test('malformed successful response is fail-closed without a second provider call', async () => {
  const ctx = fixture({ submit: async () => ({ taskId: undefined, model: 'V6' }) });
  assert.equal((await ctx.service.create(USER, { requestId: REQUEST, isPublic: false })).status, 'attention');
  await ctx.service.create(USER, { requestId: REQUEST, isPublic: false }); assert.equal(ctx.calls.length, 1);
});
test('lost DB response after acceptance reconciles its committed task without duplicate submission', async () => {
  let once = false;
  const ctx = fixture({ update: async (row, change, rows) => {
    if (!once) { once = true; rows.set(row.id, { ...row, ...change }); throw new Error('lost database response'); }
    return false;
  } });
  const track = await ctx.service.create(USER, { requestId: REQUEST, isPublic: false });
  assert.equal(track.status, 'generating'); assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.rows.get(REQUEST).source_audio_url, 'suno:kie:kie-task-1');
});
test('unavailable checkpoint leaves reservation non-retryable after a paid submission', async () => {
  const ctx = fixture({ update: async () => { throw new Error('storage offline'); } });
  await assert.rejects(ctx.service.create(USER, { requestId: REQUEST, isPublic: false }), error => error.code === 'SUBMISSION_UNCONFIRMED');
  const retry = await ctx.service.create(USER, { requestId: REQUEST, isPublic: false });
  assert.equal(retry.id, REQUEST); assert.equal(ctx.calls.length, 1);
  assert.equal(toDanceTrack(ctx.rows.get(REQUEST), 'https://storage.test', Date.parse(STAMP) + 100_000).status, 'attention');
});
test('known accepted provider reference survives a failed worker checkpoint for manual reconciliation', async () => {
  const ctx = fixture({ update: async (row, change, rows) => {
    if (change.source_audio_url) return false;
    rows.set(row.id, { ...row, ...change }); return true;
  } });
  const track = await ctx.service.create(USER, { requestId: REQUEST, isPublic: false });
  assert.equal(track.status, 'attention'); assert.equal(ctx.calls.length, 1);
  assert.equal(JSON.parse(ctx.rows.get(REQUEST).license_hash).danceSubmission.acceptedTaskReference, 'suno:kie:kie-task-1');
  assert.doesNotMatch(JSON.stringify(track), /kie-task-1/);
});
test('list includes worker variants and final-video metadata; only durable URLs and actual duration project', async () => {
  const ctx = fixture();
  await ctx.service.create(USER, { requestId: REQUEST, isPublic: true });
  const base = ctx.rows.get(REQUEST), meta = JSON.parse(base.license_hash);
  ctx.rows.set(REQUEST, { ...base, status: 'completed', audio_url: 'https://storage.test/storage/v1/object/public/melodio-assets/generated_audio/song.mp3',
    license_hash: JSON.stringify({ ...meta, sourceMenu: 'viral', duration: 183.5, video_url: 'https://video.test/final.mp4', audioPersistence: { secret: 'hidden' } }) });
  ctx.rows.set(NEXT, { ...base, id: NEXT, status: 'completed', audio_url: 'https://provider.test/expiring.mp3', license_hash: JSON.stringify({ ...meta, duration: 199 }) });
  const tracks = await ctx.service.list(USER);
  assert.equal(tracks.length, 2); assert.equal(tracks[0].durationSeconds, 183.5); assert.ok(tracks[0].audioUrl);
  assert.equal(tracks[1].audioUrl, null); assert.equal(tracks[1].requestId, REQUEST);
  assert.doesNotMatch(JSON.stringify(tracks), /secret|provider.test|license_hash|audioPersistence|video_url/);
  assert.equal((await ctx.service.list(OTHER)).length, 0);
});
function routeFixture(userId, environmentAllowed = true, environment = {}, serviceRepository) {
  let providerCalls = 0, adminCalls = 0;
  const providerRequests = [];
  const fakeProcess = { env: new Proxy({}, { get(_target, key) {
    if (!environmentAllowed) throw new Error('environment accessed before authentication');
    return ({ NEXT_PUBLIC_SUPABASE_URL: 'https://storage.test', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only', ...environment })[key];
  } }) };
  const route = loader({
    'next/server': { NextResponse: { json: (body, options = {}) => new Response(JSON.stringify(body), { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) } }) },
    '@supabase/supabase-js': { createClient: () => { adminCalls++; return { from() { throw new Error('unexpected database access'); } }; } },
    ...(serviceRepository ? { '@/lib/dance/music': { ...load('src/lib/dance/music.ts'),
      createDanceMusicService: dependencies => createDanceMusicService({ ...dependencies, repository: serviceRepository }),
    } } : {}),
    '../../../../../worker/suno-provider': { submitKieSunoJob: async (options, config) => {
      providerCalls++; providerRequests.push({ options, config });
      if (!serviceRepository) throw new Error('unexpected provider access');
      return { taskId: 'kie-route-fixture', model: 'V6' };
    } },
  }, fakeProcess)('src/app/api/viral-cf/dance-music/route.ts');
  return { route, providerRequests, counts: () => ({ providerCalls, adminCalls }) };
}
function request(body, origin = 'https://melodio.test') {
  const req = new Request('https://melodio.test/api/viral-cf/dance-music', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body });
  req.nextUrl = new URL(req.url); return req;
}
test('route authentication blocks before admin credentials or provider access', async () => {
  const ctx = routeFixture(null, false);
  const response = await ctx.route.POST(request(JSON.stringify({ requestId: REQUEST, isPublic: true })));
  assert.equal(response.status, 401); assert.deepEqual(ctx.counts(), { providerCalls: 0, adminCalls: 0 });
});
test('route enforces same-origin, bounded JSON stream, and fixed input schema before any spend', async () => {
  const ctx = routeFixture(USER);
  assert.equal((await ctx.route.POST(request('{}', 'https://attacker.test'))).status, 403);
  assert.equal((await ctx.route.POST(request('"' + 'x'.repeat(2048) + '"'))).status, 400);
  assert.equal((await ctx.route.POST(request(JSON.stringify({ requestId: REQUEST, isPublic: true, stylePrompt: 'changed' })))).status, 400);
  assert.equal(ctx.counts().providerCalls, 0);
});
test('retired SUNO credential alone fails closed without any Kie provider call', async () => {
  const memory = fixture();
  const ctx = routeFixture(USER, true, { SUNO_API_KEY: 'fixture-retired-provider' }, memory.repository);
  const response = await ctx.route.POST(request(JSON.stringify({ requestId: REQUEST, isPublic: false })));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.track.status, 'failed');
  assert.equal(ctx.counts().providerCalls, 0);
  assert.equal(JSON.parse(memory.rows.get(REQUEST).license_hash).danceSubmission.state, 'rejected');
  assert.doesNotMatch(JSON.stringify(body), /fixture-retired-provider/);
});
test('official Kie credential is selected when both Kie and retired SUNO keys exist', async () => {
  const memory = fixture();
  const ctx = routeFixture(USER, true, { KIE_API_KEY: 'fixture-official-kie', SUNO_API_KEY: 'fixture-retired-provider' }, memory.repository);
  const response = await ctx.route.POST(request(JSON.stringify({ requestId: REQUEST, isPublic: false })));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.track.status, 'generating');
  assert.equal(ctx.counts().providerCalls, 1);
  assert.deepEqual(ctx.providerRequests[0].config, { apiKey: 'fixture-official-kie', apiBaseUrl: 'https://api.kie.ai' });
  assert.equal(memory.rows.get(REQUEST).source_audio_url, 'suno:kie:kie-route-fixture');
  assert.doesNotMatch(JSON.stringify(body), /fixture-official-kie|fixture-retired-provider/);
});
