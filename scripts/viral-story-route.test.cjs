/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const USER = 'a0000000-0000-4000-8000-000000000001', TRACK = 'a0000000-0000-4000-8000-000000000002', JOB = 'a0000000-0000-4000-8000-000000000003';
function fixture(options = {}) {
  const calls = []; const cache = new Map();
  const job = { id: JOB, trackId: TRACK, status: 'completed', videoUrl: 'https://assets.x.ai/final.mp4', durationSeconds: 30, clips: ['https://assets.x.ai/c1.mp4', 'https://assets.x.ai/c2.mp4'], is30SecFull: true };
  const service = Object.fromEntries(['get', 'create', 'advance', 'resume'].map(method => [method, async (...args) => { calls.push({ method, args }); if (options.error) throw options.error; return options.empty ? null : job; }]));
  const overrides = {
    'next/server': { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } }) } },
    '@supabase/supabase-js': { createClient: () => ({ fake: true }) },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: USER } }, error: null }) } }) },
    '@/lib/video/viralStoryServer': { createViralStoryServerService: (_admin, user) => { assert.equal(user, USER); return service; } },
  };
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative); if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name]
      : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`)
      : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', js)(localRequire, mod, mod.exports,
      { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://storage.example.test', SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role-key' } }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  const route = load('src/app/api/viral-cf/grok-video/jobs/route.ts');
  function request(method, body, headers = {}, query = `trackId=${TRACK}`) {
    const req = new Request(`https://melodio.example.test/api/viral-cf/grok-video/jobs?${query}`, { method,
      headers: { ...(method === 'POST' ? { 'Content-Type': 'application/json', Origin: 'https://melodio.example.test' } : {}), ...headers },
      ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
    req.nextUrl = new URL(req.url); return req;
  }
  return { route, calls, request, job };
}
test('read is authenticated, owner scoped, exact-job recoverable and no-store with old completion fields', async () => {
  const c = fixture(); const response = await c.route.GET(c.request('GET', undefined, {}, `trackId=${TRACK}&jobId=${JOB}`));
  const data = await response.json(); assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(c.calls, [{ method: 'get', args: [USER, TRACK, JOB] }]); assert.equal(data.videoUrl, c.job.videoUrl); assert.deepEqual(data.clips, c.job.clips);
  assert.equal(data.durationSeconds, 30); assert.equal(data.is30SecFull, true); assert.equal(c.route.runtime, 'nodejs'); assert.equal(c.route.maxDuration, 300);
  const unauth = fixture({ unauthorized: true }); assert.equal((await unauth.route.GET(unauth.request('GET'))).status, 401); assert.deepEqual(unauth.calls, []);
});
test('create passes pinned UUID/input, control actions only accept stored job IDs', async () => {
  const c = fixture(); const body = { action: 'create', trackId: TRACK, requestId: JOB, prompt: 'frozen story', category: 'drama', allowDance: false, cutCadenceSeconds: 1.5 };
  assert.equal((await c.route.POST(c.request('POST', body))).status, 200); assert.equal(c.calls[0].method, 'create');
  assert.deepEqual(c.calls[0].args, [USER, TRACK, JOB, body, undefined]);
  for (const action of ['advance', 'resume']) assert.equal((await c.route.POST(c.request('POST', { action, trackId: TRACK, jobId: JOB }))).status, 200);
  assert.deepEqual(c.calls.slice(1).map(call => call.args), [[USER, TRACK, JOB], [USER, TRACK, JOB]]);
});
test('cross-origin, invalid UUID, extra action fields and oversized/malformed bodies fail before service operations', async () => {
  const c = fixture(); const body = { action: 'advance', trackId: TRACK, jobId: JOB };
  assert.equal((await c.route.POST(c.request('POST', body, { Origin: 'https://other.example.test' }))).status, 403);
  assert.equal((await c.route.GET(c.request('GET', undefined, { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
  assert.equal((await c.route.POST(c.request('POST', { ...body, prompt: 'replace frozen input' }))).status, 400);
  assert.equal((await c.route.POST(c.request('POST', { ...body, jobId: '../bad' }))).status, 400);
  assert.equal((await c.route.POST(c.request('POST', '{bad JSON'))).status, 400);
  assert.equal((await c.route.POST(c.request('POST', JSON.stringify({ ...body, noise: 'x'.repeat(17000) })))).status, 400);
  assert.equal((await c.route.POST(c.request('POST', body, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.deepEqual(c.calls, []);
});
test('read-only discovery returns null and unexpected errors never reveal provider bodies', async () => {
  const empty = fixture({ empty: true }); const found = await empty.route.GET(empty.request('GET')); assert.equal((await found.json()).job, null);
  const c = fixture({ error: Error('raw secret provider response body') }); const response = await c.route.GET(c.request('GET'));
  assert.equal(response.status, 500); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(JSON.stringify(await response.json()), /raw secret/);
});
