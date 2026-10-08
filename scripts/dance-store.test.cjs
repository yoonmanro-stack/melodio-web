/* eslint-disable @typescript-eslint/no-require-imports */
/** Real Supabase transport with an offline CAS server; never connects to a database. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const root = path.resolve(__dirname, '..');
const USER = 'a0000000-0000-4000-8000-000000000001';
const TRACK = 'a0000000-0000-4000-8000-000000000002';
const JOB = 'a0000000-0000-4000-8000-000000000003';
const OTHER = 'a0000000-0000-4000-8000-000000000004';
const RPC = 'compare_and_swap_dance_generation';
const FIELDS = ['id', 'user_id', 'title', 'is_public', 'created_at', 'status', 'audio_url', 'license_hash'];
const overrides = { './renderVideo': {}, './videoPlan': {}, './ideas': {}, '../video/petProvider': {}, '../video/petMedia': {} };
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name]
    : name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', 'process', 'fetch', compiled)(localRequire, mod, mod.exports,
    { env: {} }, () => { throw Error('NETWORK_FORBIDDEN'); });
  return mod.exports;
}
const { createDanceVideoStore } = load('src/lib/dance/videoServer.ts');
const { createDanceVideoService } = load('src/lib/dance/videoService.ts');
function fixture(options = {}) {
  const metadata = { workflow: 'dance-music-first-v1', presetId: 'dance_challenge',
    dancePreset: { id: 'dance-hook-instrumental-v1', bpm: 138 }, note: options.large ? '한글 안무·음악·장소 '.repeat(2400) : '원래 기획' };
  const initial = { id: TRACK, user_id: USER, title: '원곡', is_public: false, created_at: '2026-10-08T00:00:00Z',
    status: options.status || 'completed', audio_url: 'https://storage.test/original.mp3',
    source_audio_url: 'https://storage.test/source.mp3', cover_art_url: 'https://storage.test/original.jpg',
    license_hash: Object.hasOwn(options, 'licenseHash') ? options.licenseHash : JSON.stringify(metadata),
    unrelated: 'preserve' };
  let row = structuredClone(initial);
  const requests = [];
  const admin = createClient('https://dance-store.test', 'offline-fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.origin !== 'https://dance-store.test') throw Error('NETWORK_FORBIDDEN');
      const method = init.method || 'GET';
      const body = init.body ? JSON.parse(init.body) : undefined;
      requests.push({ url: url.toString(), method, body });
      if (url.pathname === `/rest/v1/rpc/${RPC}`) {
        assert.equal(method, 'POST');
        assert.equal(url.search, '', 'full metadata never enters the URL');
        if (options.missingRpc) return Response.json({ code: 'PGRST202', message: 'Offline missing function' }, { status: 404 });
        const match = row.id === body.p_track_id && row.user_id === body.p_user_id && row.status === 'completed'
          && row.license_hash === body.p_expected_license_hash && body.p_next_license_hash !== null;
        if (!match) return Response.json([]);
        row = { ...row, license_hash: body.p_next_license_hash,
          title: body.p_final_title ?? row.title, cover_art_url: body.p_final_cover_art_url ?? row.cover_art_url };
        return Response.json([Object.fromEntries(FIELDS.map(key => [key, row[key]]))]);
      }
      assert.equal(url.pathname, '/rest/v1/generations'); assert.equal(method, 'GET', 'no PATCH URL workaround');
      if (url.searchParams.get('select') === 'license_hash') return Response.json([{ license_hash: row.license_hash }]);
      const match = url.searchParams.get('id') === `eq.${row.id}` && url.searchParams.get('user_id') === `eq.${row.user_id}`;
      return Response.json(match ? [Object.fromEntries(FIELDS.map(key => [key, row[key]]))] : []);
    } },
  });
  return { store: createDanceVideoStore(admin), requests, initial, row: () => structuredClone(row) };
}
const job = overrides => ({ id: JOB, trackId: TRACK, status: 'ready', startSeconds: 10, durationSeconds: 30,
  visualBrief: '원래 기획', createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z', ...overrides });

test('more than32KB Unicode metadata uses an RPC POST body and returns only the owned record fields', async () => {
  const c = fixture({ large: true }); const previous = await c.store.load(USER, TRACK);
  assert.ok(Buffer.byteLength(previous.licenseHash, 'utf8') > 32 * 1024);
  const saved = await c.store.compareAndSwap(previous, job());
  const request = c.requests.at(-1);
  assert.equal(request.url, `https://dance-store.test/rest/v1/rpc/${RPC}`);
  assert.equal(request.body.p_expected_license_hash, previous.licenseHash);
  assert.ok(Buffer.byteLength(JSON.stringify(request.body), 'utf8') > 64 * 1024);
  assert.equal(saved.id, TRACK); assert.equal(saved.userId, USER); assert.equal(saved.metadata.note, previous.metadata.note);
  assert.deepEqual(saved.metadata.danceVideo, job());
  assert.equal(saved.metadata.unrelated, undefined);
  assert.deepEqual(c.row(), { ...c.initial, license_hash: request.body.p_next_license_hash });
  assert.equal(request.body.p_final_title, null); assert.equal(request.body.p_final_cover_art_url, null);
});

test('simultaneous metadata reservations keep exact CAS: one winner, one null conflict', async () => {
  const c = fixture({ large: true }); const previous = await c.store.load(USER, TRACK);
  const results = await Promise.all([c.store.compareAndSwap(previous, job({ visualBrief: '첫 요청' })),
    c.store.compareAndSwap(previous, job({ visualBrief: '다른 요청' }))]);
  assert.equal(results.filter(Boolean).length, 1); assert.equal(results.filter(value => value === null).length, 1);
  assert.equal(c.row().license_hash, results.find(Boolean).licenseHash);
  assert.equal(c.requests.filter(request => request.method === 'POST').length, 2);
});

test('null expected metadata remains null-sensitive rather than matching empty text', async () => {
  const c = fixture({ licenseHash: null }); const previous = await c.store.load(USER, TRACK);
  assert.equal(previous.licenseHash, null);
  assert.equal(await c.store.compareAndSwap({ ...previous, licenseHash: '' }, job()), null);
  assert.deepEqual(c.row(), c.initial);
  assert.ok(await c.store.compareAndSwap(previous, job()));
  assert.equal(c.requests.at(-1).body.p_expected_license_hash, null);
});

test('wrong owner, track or noncompleted source cannot update or expose a generation', async () => {
  for (const mismatch of ['owner', 'track', 'status']) {
    const c = fixture({ ...(mismatch === 'status' ? { status: 'generating' } : {}) });
    const previous = await c.store.load(USER, TRACK);
    if (mismatch === 'owner') previous.userId = OTHER;
    if (mismatch === 'track') previous.id = OTHER;
    assert.equal(await c.store.compareAndSwap(previous, job()), null);
    assert.deepEqual(c.row(), c.initial);
  }
});

test('final completion changes only metadata and optional final title/cover', async () => {
  const c = fixture(); const previous = await c.store.load(USER, TRACK);
  const saved = await c.store.compareAndSwap(previous, job({ status: 'completed', videoUrl: 'https://storage.test/final.mp4',
    imageUrl: 'https://storage.test/frame.jpg', plan: { title: '완성 춤', summary: '훅', identity: 'cast', imagePrompt: 'frame', clips: ['one', 'two'] } }));
  assert.equal(saved.title, '완성 춤'); assert.equal(saved.metadata.originalMusicTitle, '원곡');
  const row = c.row();
  assert.deepEqual(Object.keys(row).filter(key => row[key] !== c.initial[key]).sort(), ['cover_art_url', 'license_hash', 'title']);
  assert.equal(row.is_public, false); assert.equal(row.audio_url, c.initial.audio_url); assert.equal(row.source_audio_url, c.initial.source_audio_url);
});

test('unavailable RPC fails the initial reservation before audio work or any paid provider call', async () => {
  const c = fixture({ missingRpc: true }); const calls = [];
  const forbidden = async () => { calls.push('provider'); throw Error('PROVIDER_FORBIDDEN'); };
  const service = createDanceVideoService({ store: c.store, snapshot: forbidden, reuseSnapshot: forbidden,
    plan: forbidden, ideas: forbidden, generateImage: forbidden, startVideo: forbidden,
    pollVideo: forbidden, copyAsset: forbidden, bridge: forbidden, render: forbidden });
  await assert.rejects(service.prepare(USER, TRACK, 10, '원래 기획'), { code: 'JOB_STORAGE', status: 503 });
  assert.equal(calls.length, 0); assert.deepEqual(c.row(), c.initial);
  assert.equal(c.requests.filter(request => request.method === 'POST').length, 1);
});

test('migration keeps full nullable TEXT CAS, restricted invoker execution and a three-column write contract', () => {
  const sql = fs.readFileSync(path.join(root, 'migrations/20261008_dance_metadata_cas.sql'), 'utf8');
  const source = sql.replace(/--[^\n]*/g, '').trim();
  assert.match(source, /^BEGIN;/); assert.match(source, /COMMIT;$/);
  assert.match(source, /LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS \$\$/);
  assert.doesNotMatch(source, /SECURITY DEFINER|GRANT (?:ALL|UPDATE)|CREATE TABLE|ALTER TABLE|DROP |DELETE |INSERT /i);
  const body = source.split('$$')[1];
  assert.match(body, /UPDATE public\.generations AS g/);
  const writes = body.match(/SET\s+([\s\S]*?)\s+WHERE/)[1];
  assert.deepEqual([...writes.matchAll(/(?:^|,)\s*(\w+)\s*=/g)].map(match => match[1]), ['license_hash', 'title', 'cover_art_url']);
  assert.match(body, /g\.id = p_track_id\s+AND g\.user_id = p_user_id\s+AND g\.status = 'completed'/);
  assert.match(body, /g\.license_hash IS NOT DISTINCT FROM p_expected_license_hash/);
  assert.doesNotMatch(body, /\bLIKE\b|\bILIKE\b|md5\(|digest\(|::json/i);
  assert.match(body, /AND p_next_license_hash IS NOT NULL/);
  assert.match(body, /RETURNING g\.id, g\.user_id, g\.title, g\.is_public, g\.created_at,\s+g\.status, g\.audio_url, g\.license_hash/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.compare_and_swap_dance_generation\(UUID, UUID, TEXT, TEXT, TEXT, TEXT\)\s+FROM PUBLIC, anon, authenticated;/);
  const grants = [...source.matchAll(/GRANT EXECUTE ON FUNCTION public\.compare_and_swap_dance_generation\(UUID, UUID, TEXT, TEXT, TEXT, TEXT\)\s+TO (\w+);/g)];
  assert.deepEqual(grants.map(match => match[1]), ['service_role']);
  assert.match(source, /p_expected_license_hash TEXT,\s+p_next_license_hash TEXT,/);
});
