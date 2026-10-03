/* eslint-disable @typescript-eslint/no-require-imports */
/** API boundary tests: synthetic auth/storage credentials and no external connections. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
const USER = 'a0000000-0000-4000-8000-000000000001';
const TRACK = 'a0000000-0000-4000-8000-000000000002';
const JOB = 'a0000000-0000-4000-8000-000000000003';
const OTHER = 'a0000000-0000-4000-8000-000000000004';
const URL_BASE = 'https://melodio.test/api/viral-cf/dance-video';

function loader(overrides = {}, env = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(ROOT, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name]
      : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`)
      : name.startsWith('.') ? load(path.relative(ROOT, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', js)(localRequire, mod, mod.exports,
      { env }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}

class FixtureMediaError extends Error { constructor(message, code) { super(message); this.code = code; } }
const sharedLoad = loader({ './petPipeline': { PetPipelineError: FixtureMediaError } });
const { DanceVideoError, DANCE_VIDEO_REQUEST_BYTES, assertDanceUuid } = sharedLoad('src/lib/dance/videoService.ts');
const { readPetBoundedBody } = sharedLoad('src/lib/video/petMedia.ts');

function fixture({ userId = USER, authError, serviceError, missingConfig = false, getResult } = {}) {
  const calls = []; const envReads = []; let authCalls = 0; let adminCalls = 0; let serviceFactories = 0;
  const env = new Proxy({ NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: missingConfig ? undefined : 'offline-storage-only-fixture' }, {
    get: (target, name) => {
      envReads.push(name);
      if (!Object.hasOwn(target, name)) throw Error(`UNEXPECTED_ENV_ACCESS:${String(name)}`);
      return target[name];
    },
  });
  const service = Object.fromEntries(['get', 'prepare', 'start', 'advance', 'reuse'].map(action => [action, async (...args) => {
    calls.push([action, ...args]);
    if (serviceError) throw serviceError;
    if (args[0] !== USER || args[1] !== TRACK) throw new DanceVideoError('저장된 음원을 찾을 수 없습니다.', 'NOT_FOUND', 404);
    if (action === 'get' && getResult !== undefined) return getResult;
    if (action === 'reuse') return { trackId: args[3], job: null };
    return { id: JOB, trackId: TRACK, status: action === 'get' ? 'completed' : 'ready' };
  }]));
  const admin = { fixture: true };
  const load = loader({
    'next/server': { NextResponse: { json: (value, options = {}) => new Response(JSON.stringify(value), { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }) } },
    '@supabase/supabase-js': { createClient: (url, key, options) => {
      adminCalls++; assert.equal(url, 'https://fixture.supabase.co'); assert.equal(key, 'offline-storage-only-fixture');
      assert.deepEqual(options, { auth: { persistSession: false, autoRefreshToken: false } }); return admin;
    } },
    '@/lib/supabase/server': { createClient: async () => {
      authCalls++; return { auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: authError }) } };
    } },
    '@/lib/video/petMedia': { readPetBoundedBody },
    '@/lib/dance/videoService': { DanceVideoError, DANCE_VIDEO_REQUEST_BYTES, assertDanceUuid },
    '@/lib/dance/videoServer': { createDanceVideoServerService: (client, owner) => {
      serviceFactories++; assert.equal(client, admin); assert.equal(owner, userId); return service;
    } },
  }, env);
  return { api: load('src/app/api/viral-cf/dance-video/route.ts'), calls, envReads,
    contextCalls: () => ({ authCalls, adminCalls, serviceFactories }) };
}

function request(body, options = {}) {
  const method = options.method || 'POST';
  const url = options.url || URL_BASE;
  const init = { method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json', origin: 'https://melodio.test' } : {}), ...options.headers } };
  if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return Object.assign(new Request(url, init), { nextUrl: new URL(url) });
}
async function expectFailure(response, status, code) {
  assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json(); assert.equal(body.success, false); assert.equal(body.code, code); assert.equal(body.job, undefined);
  return body;
}
const prepare = { action: 'prepare', trackId: TRACK, startSeconds: 12.5, visualBrief: '리듬을 따라 밝게 움직이는 댄서' };

test('reuse forwards only authenticated owner and saved identifiers, returning the separate track', async () => {
  const ctx = fixture();
  const response = await ctx.api.POST(request({ action: 'reuse', trackId: TRACK, jobId: JOB, requestId: OTHER }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { success: true, trackId: OTHER, job: null });
  assert.deepEqual(ctx.calls, [['reuse', USER, TRACK, JOB, OTHER]]);
});
test('reuse rejects client URLs, hashes, privacy overrides and invalid request IDs before workflow', async () => {
  const ctx = fixture(); const input = { action: 'reuse', trackId: TRACK, jobId: JOB, requestId: OTHER };
  for (const extra of [{ audioUrl: 'https://attacker.test/audio.wav' }, { audioHash: 'a'.repeat(64) }, { startSeconds: 0 }, { isPublic: true }, { userId: OTHER }]) {
    await expectFailure(await ctx.api.POST(request({ ...input, ...extra })), 400, 'REUSE_INPUT');
  }
  for (const requestId of [undefined, 'bad', 123]) await expectFailure(await ctx.api.POST(request({ ...input, requestId })), 400, 'ID');
  assert.equal(ctx.calls.length, 0);
});

test('unauthenticated GET/POST return 401 before admin service construction', async () => {
  for (const auth of [{ userId: null }, { authError: Error('expired') }]) {
    const ctx = fixture(auth);
    await expectFailure(await ctx.api.POST(request(prepare)), 401, 'UNAUTHORIZED');
    await expectFailure(await ctx.api.GET(request(undefined, { method: 'GET', url: `${URL_BASE}?trackId=${TRACK}` })), 401, 'UNAUTHORIZED');
    assert.deepEqual(ctx.contextCalls(), { authCalls: 2, adminCalls: 0, serviceFactories: 0 });
    assert.equal(ctx.calls.length, 0); assert.deepEqual(ctx.envReads, []);
  }
});

test('cross-origin and non-JSON POST fail before auth/context work', async () => {
  const ctx = fixture();
  await expectFailure(await ctx.api.POST(request(prepare, { headers: { origin: 'https://attacker.test' } })), 403, 'ORIGIN');
  await expectFailure(await ctx.api.POST(request(prepare, { headers: { 'content-type': 'text/plain' } })), 415, 'CONTENT_TYPE');
  await expectFailure(await ctx.api.POST(request(prepare, { headers: { 'content-type': '' } })), 415, 'CONTENT_TYPE');
  assert.deepEqual(ctx.contextCalls(), { authCalls: 0, adminCalls: 0, serviceFactories: 0 });
  assert.deepEqual(ctx.envReads, []); assert.equal(ctx.calls.length, 0);
});

test('JSON shape and 16KB limit count actual UTF-8 body bytes, not only declared length', async () => {
  const ctx = fixture();
  for (const raw of ['{', 'null', '[]', 'true', '"string"']) {
    await expectFailure(await ctx.api.POST(request(raw)), 400, 'BODY');
  }
  const oversized = JSON.stringify({ ...prepare, visualBrief: '가'.repeat(6000) });
  assert.ok(Buffer.byteLength(oversized) > DANCE_VIDEO_REQUEST_BYTES);
  await expectFailure(await ctx.api.POST(request(oversized)), 400, 'BODY');
  await expectFailure(await ctx.api.POST(request(oversized, { headers: { 'content-length': '1' } })), 400, 'BODY');
  await expectFailure(await ctx.api.POST(request(prepare, { headers: { 'content-length': String(DANCE_VIDEO_REQUEST_BYTES + 1) } })), 400, 'BODY');
  assert.equal(ctx.calls.length, 0);
  const atLimit = { ...prepare, padding: '' };
  atLimit.padding = 'x'.repeat(DANCE_VIDEO_REQUEST_BYTES - Buffer.byteLength(JSON.stringify(atLimit)));
  assert.equal(Buffer.byteLength(JSON.stringify(atLimit)), DANCE_VIDEO_REQUEST_BYTES);
  assert.equal((await ctx.api.POST(request(atLimit))).status, 200, 'exactly 16KB remains accepted');
});

test('invalid action and track/job IDs never reach workflow methods', async () => {
  const ctx = fixture();
  for (const body of [{ ...prepare, trackId: 'bad' }, { ...prepare, trackId: 123 }, { action: 'start', trackId: TRACK, jobId: 'bad' }, { action: 'advance', trackId: TRACK }]) {
    await expectFailure(await ctx.api.POST(request(body)), 400, 'ID');
  }
  await expectFailure(await ctx.api.POST(request({ action: 'erase', trackId: TRACK, jobId: JOB })), 400, 'ACTION');
  await expectFailure(await ctx.api.GET(request(undefined, { method: 'GET', url: `${URL_BASE}?trackId=bad` })), 400, 'ID');
  assert.equal(ctx.calls.length, 0);
});

test('authenticated identity owns forwarding; body identity cannot impersonate another owner', async () => {
  const ctx = fixture();
  const prepared = await ctx.api.POST(request({ ...prepare, userId: OTHER, ownerId: OTHER }, { headers: { 'content-type': 'application/json; charset=utf-8' } }));
  assert.equal(prepared.status, 200); assert.equal((await prepared.json()).job.id, JOB);
  for (const action of ['start', 'advance']) {
    const response = await ctx.api.POST(request({ action, trackId: TRACK, jobId: JOB, userId: OTHER }));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual(ctx.calls, [
    ['prepare', USER, TRACK, 12.5, prepare.visualBrief], ['start', USER, TRACK, JOB], ['advance', USER, TRACK, JOB],
  ]);
  await expectFailure(await ctx.api.POST(request({ ...prepare, trackId: OTHER })), 404, 'NOT_FOUND');
  const outsider = fixture({ userId: OTHER });
  await expectFailure(await outsider.api.POST(request({ ...prepare, userId: USER })), 404, 'NOT_FOUND');
  assert.equal(outsider.calls[0][1], OTHER);
});

test('GET only reads owned persisted job and does not access provider credentials or advance work', async () => {
  const ctx = fixture();
  const response = await ctx.api.GET(request(undefined, { method: 'GET', url: `${URL_BASE}?trackId=${TRACK}&action=advance&jobId=${JOB}` }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).job.status, 'completed');
  assert.deepEqual(ctx.calls, [['get', USER, TRACK]]);
  assert.deepEqual(ctx.envReads, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  await expectFailure(await ctx.api.GET(request(undefined, { method: 'GET', url: `${URL_BASE}?trackId=${OTHER}` })), 404, 'NOT_FOUND');
  const empty = fixture({ getResult: null });
  const emptyResponse = await empty.api.GET(request(undefined, { method: 'GET', url: `${URL_BASE}?trackId=${TRACK}` }));
  assert.equal(emptyResponse.status, 200); assert.deepEqual(await emptyResponse.json(), { success: true, job: null });
  assert.deepEqual(empty.calls, [['get', USER, TRACK]]);
});

test('known service failures retain safe code; unknown errors are sanitized', async () => {
  const known = fixture({ serviceError: new DanceVideoError('선택한 구간을 확인해 주세요.', 'AUDIO_RANGE', 400) });
  const body = await expectFailure(await known.api.POST(request(prepare)), 400, 'AUDIO_RANGE');
  assert.equal(body.error, '선택한 구간을 확인해 주세요.');
  for (const method of ['GET', 'POST']) {
    const ctx = fixture({ serviceError: new Error('SECRET_PROVIDER_PAYLOAD https://private.invalid/token /private/tmp/internal') });
    const response = method === 'POST' ? await ctx.api.POST(request(prepare)) : await ctx.api.GET(request(undefined, { method: 'GET', url: `${URL_BASE}?trackId=${TRACK}` }));
    const unknown = await expectFailure(response, 500, 'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(unknown), /SECRET|PAYLOAD|private|token|https/);
  }
  const unconfigured = fixture({ missingConfig: true });
  await expectFailure(await unconfigured.api.POST(request(prepare)), 503, 'SERVER_CONFIG');
  assert.equal(unconfigured.contextCalls().adminCalls, 0); assert.equal(unconfigured.calls.length, 0);
});
