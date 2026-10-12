// Offline execution of the real route, validation and persistence modules.
// SQL concurrency/RLS requires the separate rollback-only SQL fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Error, Date, JSON, TextDecoder, Request, Response, URL, crypto,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
    ...globals,
  }, { filename: file });
  return module.exports;
}
const recipes = load('src/lib/healing-rain/recipes.ts');
const model = load('src/lib/healing-rain/projects.ts', { './recipes': recipes });
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const key = '33333333-3333-4333-8333-333333333333';
const plain = value => JSON.parse(JSON.stringify(value));
const body = overrides => ({ clientRequestId: key, input: { ...recipes.defaults }, ...overrides });
const request = (value, method = 'POST') => new Request('https://melodio.test/api/healing-rain/projects', {
  method, ...(method === 'POST' ? { body: typeof value === 'string' ? value : JSON.stringify(value) } : {}),
});

function harness(options = {}) {
  const calls = [], queries = [], state = options.state || new Map();
  let adminCalls = 0;
  const query = {
    select(value) { queries.push(['select', value]); return this; },
    eq(...args) { queries.push(['eq', ...args]); return this; },
    order(...args) { queries.push(['order', ...args]); return this; },
    limit(value) { queries.push(['limit', value]); return this; },
    or(value) { queries.push(['or', value]); return this; },
    then(resolve, reject) { return Promise.resolve({ data: options.rows || [], error: options.readError || null }).then(resolve, reject); },
  };
  const client = {
    auth: { async getUser() { return { data: { user: options.user === null ? null : { id: options.user || owner } }, error: options.authError || null }; } },
    from(table) { assert.equal(table, 'healing_rain_projects'); return query; },
  };
  const admin = {
    async rpc(name, args) {
      assert.equal(name, 'save_healing_rain_projects'); calls.push(plain(args));
      if (options.writeError) return { data: null, error: options.writeError };
      // The adapter models the declared transaction boundary; SQL fixture tests
      // actual PostgreSQL rollback, grants and RLS when a local DB is available.
      const transaction = new Map(state), data = [];
      for (const item of args.p_projects) {
        const identity = `${args.p_user_id}:${item.client_request_id}`;
        const previous = transaction.get(identity);
        if (previous && JSON.stringify(previous.input) !== JSON.stringify(item.plan.input)) return { data: null, error: { code: '23505' } };
        const plan = previous || plain(item.plan);
        transaction.set(identity, plan);
        data.push({ client_request_id: item.client_request_id, plan, created: !previous });
      }
      for (const [id, plan] of transaction) state.set(id, plan);
      return { data: data.reverse(), error: null }; // RPC lock order needn't match request order.
    },
  };
  const server = load('src/lib/healing-rain/project-server.ts', {
    'server-only': {},
    '@supabase/supabase-js': { createClient() { adminCalls += 1; return admin; } },
    '@/lib/supabase/server': { async createClient() { return client; } },
    './recipes': recipes, './projects': model,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://offline.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only', ...options.env } } });
  const dependencies = { '@/lib/healing-rain/project-server': server, '@/lib/healing-rain/projects': model };
  return {
    route: load('src/app/api/healing-rain/projects/route.ts', dependencies),
    importer: load('src/app/api/healing-rain/projects/import/route.ts', dependencies),
    calls, queries, state, adminCalls: () => adminCalls,
  };
}

test('all endpoints reject unauthenticated users before reads, parsing or admin creation', async () => {
  const h = harness({ user: null });
  for (const result of [await h.route.GET(request(null, 'GET')), await h.route.POST(request('{')), await h.importer.POST(request('{'))]) {
    assert.equal(result.status, 401); assert.equal((await result.json()).code, 'authentication_required');
    assert.match(result.headers.get('Cache-Control'), /no-store/);
  }
  assert.equal(h.adminCalls(), 0); assert.equal(h.queries.length, 0);
});

test('save derives owner and recompile snapshot instead of trusting caller data', async () => {
  const h = harness();
  const response = await h.route.POST(request(body({ user_id: other, owner: other, prompts: { image: 'FORGED' }, id: key, createdAt: '2000-01-01' })));
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(h.calls[0].p_user_id, owner);
  assert.equal(saved.created, true); assert.notEqual(saved.project.id, key);
  assert.match(saved.project.prompts.image, /Private sleeper train/);
  assert.equal(JSON.stringify(saved).includes('FORGED'), false);
  assert.equal(saved.project.generation.status, 'draft');
  assert.equal(Object.hasOwn(saved.project, 'user_id'), false);
});

test('same owner+request returns original immutable snapshot; changed recipe conflicts', async () => {
  const h = harness();
  const first = await (await h.route.POST(request(body()))).json();
  const retry = await h.route.POST(request(body({ input: { ...recipes.defaults, title: ` ${recipes.defaults.title} ` } })));
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).project, first.project);
  const conflict = await h.route.POST(request(body({ input: { ...recipes.defaults, title: 'changed' } })));
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, 'request_conflict');
  assert.equal(h.state.size, 1);
});

test('request identity is scoped per owner', async () => {
  const state = new Map();
  const a = harness({ state }), b = harness({ state, user: other });
  assert.equal((await a.route.POST(request(body()))).status, 201);
  assert.equal((await b.route.POST(request(body()))).status, 201);
  assert.equal(state.size, 2);
});

test('invalid recipe, identity, JSON, duplicate or oversized import never reaches storage', async () => {
  const h = harness();
  const invalid = [body({ clientRequestId: 'bad' }), body({ input: { ...recipes.defaults, takes: 999 } }), '{'];
  for (const value of invalid) assert.equal((await h.route.POST(request(value))).status, 400);
  for (const value of [{ projects: [] }, { projects: Array.from({ length: 51 }, (_, i) => body({ clientRequestId: `request-${i}` })) }, { projects: [body(), body()] }, { projects: [body(), body({ clientRequestId: 'valid-new-key', input: {} })] }]) {
    assert.equal((await h.importer.POST(request(value))).status, 400);
  }
  assert.equal(h.adminCalls(), 0);
});

test('streamed byte cap works without Content-Length and malformed JSON returns 400', async () => {
  const h = harness();
  assert.equal((await h.route.POST(request('한'.repeat(3000)))).status, 413);
  assert.equal((await h.route.POST(request('{'))).status, 400);
  assert.equal(h.adminCalls(), 0);
});

test('import uses one atomic RPC, restores input order and retries without duplicate snapshots', async () => {
  const h = harness();
  const items = [body(), body({ clientRequestId: 'second-request', input: { ...recipes.defaults, title: 'second' } })];
  const first = await (await h.importer.POST(request({ projects: items }))).json();
  assert.equal(h.calls.length, 1); assert.equal(first.createdCount, 2); assert.equal(first.existingCount, 0);
  assert.equal(first.projects[0].input.title, recipes.defaults.title); assert.equal(first.projects[1].input.title, 'second');
  const second = await (await h.importer.POST(request({ projects: items }))).json();
  assert.equal(second.createdCount, 0); assert.equal(second.existingCount, 2);
  assert.deepEqual(second.projects, first.projects);
  assert.equal(h.state.size, 2);
});

test('import conflict returns no partial success payload', async () => {
  const h = harness();
  await h.route.POST(request(body()));
  const response = await h.importer.POST(request({ projects: [body({ clientRequestId: 'new-request' }), body({ input: { ...recipes.defaults, title: 'changed' } })] }));
  assert.equal(response.status, 409); assert.equal(h.state.size, 1);
  assert.equal(Object.hasOwn(await response.json(), 'projects'), false);
});

test('missing migration/config returns explicit 503 without exposing database messages', async () => {
  for (const code of ['42P01', '42883', '42703', 'PGRST202', 'PGRST204', 'PGRST205']) {
    const h = harness({ writeError: { code, message: 'private database detail' }, readError: { code } });
    for (const response of [await h.route.POST(request(body())), await h.route.GET(request(null, 'GET')), await h.importer.POST(request({ projects: [body()] }))]) {
      assert.equal(response.status, 503); assert.equal((await response.json()).code, 'persistence_not_ready');
    }
  }
  const h = harness({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });
  assert.equal((await h.route.POST(request(body()))).status, 503); assert.equal(h.adminCalls(), 0);
});

test('list is owner-filtered with stable pagination and rejects filter injection', async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`, created_at: '2026-10-12T00:00:00+00:00', plan: { id: i } }));
  const h = harness({ rows });
  const response = await h.route.GET(request(null, 'GET'));
  const page = await response.json();
  assert.equal(page.projects.length, 50); assert.equal(page.nextCursor, `${rows[49].created_at}|${rows[49].id}`);
  assert.deepEqual(h.queries.find(item => item[0] === 'eq'), ['eq', 'user_id', owner]);
  const next = new Request(`https://melodio.test/api/healing-rain/projects?cursor=${encodeURIComponent(page.nextCursor)}`);
  assert.equal((await h.route.GET(next)).status, 200);
  assert.match(h.queries.find(item => item[0] === 'or')[1], /created_at\.lt\./);
  const invalid = new Request('https://melodio.test/api/healing-rain/projects?cursor=owner.eq.other');
  assert.equal((await h.route.GET(invalid)).status, 400);
});

test('migration keeps browser writes/RPC revoked and immutable owner-scoped keys', () => {
  const sql = fs.readFileSync('migrations/20261012_create_healing_rain_projects.sql', 'utf8');
  assert.match(sql, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /UNIQUE \(user_id, client_request_id\)/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR SELECT TO authenticated USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_healing_rain_projects\(UUID, JSONB\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /GRANT (?:ALL|INSERT|UPDATE|DELETE).*TO authenticated/);
  assert.match(sql, /BEFORE UPDATE ON public\.healing_rain_projects/);
  assert.match(sql, /v_stored->'input' IS DISTINCT FROM v_plan->'input'/);
  assert.match(sql, /ON CONFLICT ON CONSTRAINT healing_rain_projects_owner_request DO NOTHING/);
});
