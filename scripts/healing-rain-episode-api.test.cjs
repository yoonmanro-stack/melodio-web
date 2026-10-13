// Offline tests execute the real route, validation, compiler and persistence
// modules. PostgreSQL concurrency, grants and RLS belong to the SQL fixture.
/* eslint-disable @typescript-eslint/no-require-imports -- This offline CommonJS harness transpiles the real TypeScript route modules. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(file, dependencies = {}, globals = {}) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports, Error, Date, JSON, TextDecoder, Request, Response, URL, crypto,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
    ...globals,
  }, { filename: file });
  return loadedModule.exports;
}

// Only the pure local model graph may be loaded without explicit stubs.
const pureModules = new Map();
function loadPure(file) {
  const absolute = path.resolve(file);
  if (pureModules.has(absolute)) return pureModules.get(absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  const imports = [...source.matchAll(/(?:from\s+|require\()['"]([^'"]+)['"]/g)].map(match => match[1]);
  const dependencies = {};
  for (const name of imports) {
    if (name.startsWith('node:')) { dependencies[name] = require(name); continue; }
    const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
    assert.ok(base.startsWith(path.resolve('src/lib/healing-rain') + path.sep) || base.startsWith(path.resolve('shared/healing-rain') + path.sep), `Unexpected model dependency: ${name}`);
    const resolved = [base, `${base}.ts`, `${base}.js`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    assert.ok(resolved, `Missing model dependency: ${name}`);
    dependencies[name] = resolved.endsWith('.ts') ? loadPure(resolved) : require(resolved);
  }
  const result = load(absolute, dependencies);
  pureModules.set(absolute, result);
  return result;
}
const model = loadPure('src/lib/healing-rain/projects.ts');
const episodes = loadPure('src/lib/healing-rain/episodes.ts');
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const knownId = '33333333-3333-4333-8333-333333333333';
const reviewId = '44444444-4444-4444-8444-444444444444';
const plain = value => JSON.parse(JSON.stringify(value));
const body = overrides => ({ clientRequestId: 'episode-request-1', input: plain(episodes.exampleEpisodeInput()), ...overrides });
const review = overrides => ({ clientRequestId: 'review-request-1', verdict: 'approve_plan', reason: 'The intro and main scene support the same quiet sheltered atmosphere.', ...overrides });
const request = (value, method = 'POST', suffix = '') => new Request(`https://melodio.test/api/healing-rain/episodes${suffix}`, {
  method, ...(method === 'POST' ? { body: typeof value === 'string' ? value : JSON.stringify(value) } : {}),
});
const context = id => ({ params: Promise.resolve({ id }) });
function storedRow(userId = owner, id = knownId, input = body().input, clientRequestId = 'seed-request') {
  const plan = plain(episodes.compileEpisodePlan(episodes.parseEpisodeInput(input), id, '2026-10-13T00:00:00.000Z'));
  return { id, user_id: userId, client_request_id: clientRequestId, plan, comparison: plain(episodes.compareEpisodePlans(plan, [], false)), created_at: plan.createdAt };
}

function harness(options = {}) {
  const calls = [], queries = [], state = options.state || new Map();
  const reviews = options.reviews || new Map();
  let adminCalls = 0, authCalls = 0, catalogCalls = 0;
  for (const row of options.rows || []) state.set(`${row.user_id}:${row.client_request_id}`, plain(row));
  const execute = (query, single) => {
    if (options.readError) return { data: null, error: options.readError };
    let rows = [...(query.table === 'healing_rain_episodes' ? state : reviews).values()];
    for (const [key, value] of query.filters) rows = rows.filter(row => row[key] === value);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    if (query.cursor) {
      const match = query.cursor.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.lt\.([^)]*)\)$/);
      assert.ok(match, 'Cursor must be a validated stable keyset filter');
      rows = rows.filter(row => row.created_at < match[1] || row.created_at === match[1] && row.id < match[2]);
    }
    if (query.maximum !== undefined) rows = rows.slice(0, query.maximum);
    return { data: single ? rows[0] || null : rows, error: null };
  };
  const client = {
    auth: { async getUser() { authCalls += 1; return { data: { user: options.user === null ? null : { id: options.user || owner } }, error: options.authError || null }; } },
    from(table) {
      assert.ok(['healing_rain_episodes', 'healing_rain_episode_reviews'].includes(table));
      const query = { table, filters: [], orders: [] };
      queries.push(query);
      return {
        select(value) { query.select = value; return this; },
        eq(...args) { query.filters.push(args); return this; },
        order(...args) { query.orders.push(args); return this; },
        limit(value) { query.maximum = value; return this; },
        or(value) { query.cursor = value; return this; },
        async maybeSingle() { query.single = true; return execute(query, true); },
        then(resolve, reject) { return Promise.resolve(execute(query, false)).then(resolve, reject); },
      };
    },
  };
  const admin = {
    async rpc(name, args) {
      calls.push({ name, args: plain(args) });
      if (options.writeError) return { data: null, error: options.writeError };
      const identity = `${args.p_user_id}:${args.p_client_request_id}`;
      if (name === 'save_healing_rain_episode') {
        const previous = state.get(identity);
        if (previous && !require('node:util').isDeepStrictEqual(previous.plan.input, plain(args.p_plan.input))) return { data: null, error: { code: '23505' } };
        const row = previous || { id: args.p_plan.id, user_id: args.p_user_id, client_request_id: args.p_client_request_id, plan: plain(args.p_plan), comparison: plain(args.p_comparison), created_at: args.p_plan.createdAt };
        state.set(identity, row);
        return { data: [{ id: row.id, plan: row.plan, comparison: row.comparison, created: !previous }], error: null };
      }
      assert.equal(name, 'review_healing_rain_episode');
      const owned = [...state.values()].some(row => row.id === args.p_episode_id && row.user_id === args.p_user_id);
      if (!owned) return { data: null, error: { code: 'P0002' } };
      const previous = reviews.get(identity);
      const reason = args.p_reason.replace(/\s+/g, ' ').trim();
      if (previous && (previous.episode_id !== args.p_episode_id || previous.verdict !== args.p_verdict || previous.reason !== reason)) return { data: null, error: { code: '23505' } };
      const row = previous || { id: crypto.randomUUID(), user_id: args.p_user_id, episode_id: args.p_episode_id, client_request_id: args.p_client_request_id, verdict: args.p_verdict, reason, created_at: new Date().toISOString() };
      reviews.set(identity, row);
      return { data: [{ ...row, created: !previous }], error: null };
    },
  };
  const projectServer = load('src/lib/healing-rain/project-server.ts', {
    'server-only': {}, '@supabase/supabase-js': { createClient() { throw new Error('Unexpected project write'); } },
    '@/lib/supabase/server': { async createClient() { return client; } },
    './recipes': loadPure('src/lib/healing-rain/recipes.ts'), './projects': model,
  });
  const server = load('src/lib/healing-rain/episode-server.ts', {
    'server-only': {}, './project-server': projectServer, './projects': model, './episodes': episodes,
    '@supabase/supabase-js': { createClient() { adminCalls += 1; return admin; } },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://offline.test', SUPABASE_SERVICE_ROLE_KEY: 'offline-only', ...options.env } } });
  const dependencies = { '@/lib/healing-rain/episode-server': server, '@/lib/healing-rain/episodes': episodes, '@/lib/healing-rain/projects': model };
  return {
    route: load('src/app/api/healing-rain/episodes/route.ts', dependencies),
    planner: load('src/app/api/healing-rain/episodes/plan/route.ts', dependencies),
    detail: load('src/app/api/healing-rain/episodes/[id]/route.ts', dependencies),
    reviewer: load('src/app/api/healing-rain/episodes/[id]/reviews/route.ts', dependencies),
    catalog: load('src/app/api/healing-rain/episodes/catalog/route.ts', {
      ...dependencies,
      '@/lib/healing-rain/episodes': { ...episodes, getEpisodeCatalog() {
        catalogCalls += 1;
        if (options.catalogError) throw options.catalogError;
        return episodes.getEpisodeCatalog();
      } },
    }),
    calls, queries, state, reviews, adminCalls: () => adminCalls, authCalls: () => authCalls, catalogCalls: () => catalogCalls,
  };
}

test('authentication precedes JSON parsing, ID validation, history reads and service clients on every route', async () => {
  const h = harness({ user: null });
  const results = [await h.route.GET(request(null, 'GET', '?cursor=invalid')), await h.route.POST(request('{')),
    await h.planner.POST(request('{')), await h.detail.GET(request(null, 'GET'), context('invalid')),
    await h.reviewer.POST(request('{'), context('invalid')), await h.catalog.GET()];
  for (const result of results) {
    assert.equal(result.status, 401);
    assert.equal((await result.json()).code, 'authentication_required');
    assert.match(result.headers.get('Cache-Control'), /private, no-store/);
  }
  assert.equal(h.adminCalls(), 0); assert.equal(h.queries.length, 0); assert.equal(h.catalogCalls(), 0);
});

test('authenticated catalog returns 10 independent families without account data or storage side effects', async () => {
  const h = harness({ rows: [storedRow()], readError: { code: '42P01' } });
  const baseline = plain(episodes.getEpisodeCatalog());
  const response = await h.catalog.GET();
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const result = await response.json();
  assert.deepEqual(result, baseline);
  assert.equal(result.families.length, 10); assert.equal(new Set(result.families.map(family => family.id)).size, 10);
  assert.equal(result.generationEnabled, false);
  for (const privateValue of [owner, knownId, 'seed-request']) assert.equal(JSON.stringify(result).includes(privateValue), false);
  assert.equal(Object.hasOwn(result, 'user'), false); assert.equal(Object.hasOwn(result, 'user_id'), false);
  assert.equal(h.authCalls(), 1); assert.equal(h.catalogCalls(), 1);
  assert.equal(h.queries.length, 0); assert.equal(h.adminCalls(), 0); assert.equal(h.calls.length, 0);
  assert.equal(h.state.size, 1); assert.equal(h.reviews.size, 0);
  const mutable = episodes.getEpisodeCatalog();
  mutable.families[0].variants[0].name = 'Changed locally';
  mutable.families[0].exclusions.push('Changed locally');
  mutable.sceneSurfaces.train.push('Changed locally');
  mutable.scenePerspectives.train.push('Changed locally');
  mutable.surfaces.glass = 'Changed locally';
  result.families.length = 0;
  assert.deepEqual(await (await h.catalog.GET()).json(), baseline);
  const secondOwner = harness({ user: other });
  assert.deepEqual(await (await secondOwner.catalog.GET()).json(), baseline);
});

test('catalog auth and unexpected errors use the standard sanitized no-store response', async () => {
  const failedAuth = harness({ authError: { message: 'private-auth-detail' } });
  const unauthorized = await failedAuth.catalog.GET();
  assert.equal(unauthorized.status, 401); assert.equal((await unauthorized.json()).code, 'authentication_required');
  assert.equal(failedAuth.catalogCalls(), 0); assert.equal(failedAuth.queries.length, 0); assert.equal(failedAuth.adminCalls(), 0);
  const h = harness({ catalogError: new Error('private-catalog-detail') });
  const response = await h.catalog.GET();
  assert.equal(response.status, 503); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const error = await response.json();
  assert.equal(error.code, 'persistence_unavailable'); assert.equal(JSON.stringify(error).includes('private-catalog-detail'), false);
  assert.equal(h.authCalls(), 1); assert.equal(h.catalogCalls(), 1); assert.equal(h.queries.length, 0); assert.equal(h.adminCalls(), 0);
});

test('save compiles an immutable planning-only snapshot with server identity and authenticated owner', async () => {
  const h = harness();
  const response = await h.route.POST(request(body()));
  assert.equal(response.status, 201); assert.match(response.headers.get('Cache-Control'), /no-store/);
  const saved = await response.json();
  assert.equal(saved.created, true); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].args.p_user_id, owner);
  assert.notEqual(saved.episode.id, knownId);
  assert.equal(saved.episode.execution.providerCallsAllowed, false);
  assert.equal(saved.episode.execution.longFormEnabled, false);
  assert.equal(saved.episode.execution.policyApproval, false);
  assert.equal(Object.hasOwn(saved.episode, 'user_id'), false);
  assert.equal(h.reviews.size, 0);
});

test('save, preview and review reject forged envelope fields before reads or writes', async () => {
  const h = harness();
  for (const key of ['owner', 'user_id', 'history', 'comparison', 'plan', 'prompts', 'review', 'reviewState', 'approved', 'createdAt', 'id']) {
    assert.equal((await h.route.POST(request(body({ [key]: 'forged' })))).status, 400, key);
    assert.equal((await h.planner.POST(request({ input: body().input, [key]: 'forged' }))).status, 400, key);
    assert.equal((await h.reviewer.POST(request(review({ [key]: 'forged' })), context(knownId))).status, 400, key);
  }
  assert.equal(h.queries.length, 0); assert.equal(h.adminCalls(), 0);
});

test('idempotent retry returns original plan and comparison without recompiling against new history', async () => {
  const h = harness();
  const first = await (await h.route.POST(request(body()))).json();
  const extra = storedRow(owner, knownId, body().input, 'later-history');
  h.state.set(`${owner}:later-history`, extra);
  const callsBefore = h.calls.length, queriesBefore = h.queries.length;
  const retry = await h.route.POST(request(body()));
  assert.equal(retry.status, 200);
  const replay = await retry.json();
  assert.deepEqual(replay.episode, first.episode); assert.deepEqual(replay.comparison, first.comparison);
  assert.equal(replay.created, false); assert.equal(h.calls.length, callsBefore);
  assert.equal(h.queries.length, queriesBefore + 1);
  assert.equal(h.queries.at(-1).single, true);
  const changed = body(); changed.input.title = 'A different episode title';
  const conflict = await h.route.POST(request(changed));
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, 'request_conflict');
  assert.equal(h.state.size, 2);
});

test('JSONB object key order does not change retry identity', async () => {
  const h = harness();
  const first = await (await h.route.POST(request(body()))).json();
  const saved = [...h.state.values()][0];
  const reverseKeys = value => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseKeys(value[key])])) : value;
  saved.plan.input = reverseKeys(saved.plan.input);
  const response = await h.route.POST(request(body()));
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).episode, first.episode);
});

test('racing first saves replay the RPC snapshot and keep one account-scoped identity', async () => {
  const state = new Map();
  const a = harness({ state }), b = harness({ state });
  const responses = await Promise.all([a.route.POST(request(body())), b.route.POST(request(body()))]);
  assert.deepEqual(responses.map(result => result.status).sort(), [200, 201]);
  const [first, second] = await Promise.all(responses.map(result => result.json()));
  assert.deepEqual(first.episode, second.episode); assert.deepEqual(first.comparison, second.comparison);
  assert.equal(state.size, 1);
  const otherAccount = harness({ state, user: other });
  assert.equal((await otherAccount.route.POST(request(body()))).status, 201); assert.equal(state.size, 2);
});

test('preview derives comparisons only from owned stored history and never opens the service client', async () => {
  const owned = storedRow();
  const foreign = storedRow(other, reviewId, body().input, 'foreign-history');
  const h = harness({ rows: [owned, foreign] });
  const response = await h.planner.POST(request({ input: body().input }));
  assert.equal(response.status, 200); assert.match(response.headers.get('Cache-Control'), /no-store/);
  const result = await response.json();
  assert.deepEqual(result.comparison, plain(episodes.compareEpisodePlans(result.episode, [owned.plan], false)));
  assert.deepEqual(h.queries[0].filters, [['user_id', owner]]);
  assert.equal(h.queries[0].maximum, 101);
  assert.equal(h.adminCalls(), 0); assert.equal(h.calls.length, 0); assert.equal(h.state.size, 2);
});

test('history is bounded at 100 and comparison is told when more records exist', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => storedRow(owner, `${String(index).padStart(8, '0')}-3333-4333-8333-333333333333`, body().input, `history-${index}`));
  const h = harness({ rows });
  const response = await h.planner.POST(request({ input: body().input }));
  assert.equal(response.status, 200);
  const result = await response.json();
  const expectedHistory = [...rows].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 100).map(row => row.plan);
  assert.deepEqual(result.comparison, plain(episodes.compareEpisodePlans(result.episode, expectedHistory, true)));
});

test('unrecognized historical plan versions are surfaced as incomplete comparison, never automatic approval', async () => {
  const row = storedRow(); delete row.plan.version;
  const h = harness({ rows: [row] });
  const result = await (await h.planner.POST(request({ input: body().input }))).json();
  assert.equal(result.comparison.invalidHistoryCount, 1);
  assert.ok(result.comparison.reasonCodes.includes('history_not_fully_comparable'));
  assert.equal(result.comparison.policyApproval, false);
  assert.equal(result.comparison.mediaSimilarityMeasured, false);
  assert.equal(result.episode.review.status, 'required');
  assert.equal(h.adminCalls(), 0);
});

test('invalid JSON, malformed fields and byte caps reject requests before data access', async () => {
  const h = harness();
  for (const invoke of [value => h.route.POST(request(value)), value => h.planner.POST(request(value)), value => h.reviewer.POST(request(value), context(knownId))]) {
    assert.equal((await invoke('{')).status, 400);
    assert.equal((await invoke('한'.repeat(5400))).status, 413);
  }
  const overHeader = request(body()); overHeader.headers.set('content-length', '16001');
  assert.equal((await h.route.POST(overHeader)).status, 413);
  assert.equal((await h.route.POST(request(body({ clientRequestId: 'bad' })))).status, 400);
  const invalidInput = body(); invalidInput.input.main.hours = 999;
  assert.equal((await h.route.POST(request(invalidInput))).status, 400);
  const invalidDirection = body(); invalidDirection.input.main.notes = 'No breathing. Keep blanket motionless.';
  assert.equal((await h.route.POST(request(invalidDirection))).status, 400);
  for (const invalid of [review({ verdict: 'approved' }), review({ reason: '' }), review({ clientRequestId: 'bad' })]) {
    assert.equal((await h.reviewer.POST(request(invalid), context(knownId))).status, 400);
  }
  // The direction compiler runs after the idempotency lookup, before history or writes.
  assert.equal(h.queries.length, 1); assert.equal(h.queries[0].single, true); assert.equal(h.adminCalls(), 0);
});

test('list uses owner isolation, 50 row pagination and validated cursors', async () => {
  const rows = Array.from({ length: 51 }, (_, index) => storedRow(owner, `${String(index).padStart(8, '0')}-3333-4333-8333-333333333333`, body().input, `page-${index}`));
  const h = harness({ rows: [...rows, storedRow(other, reviewId)] });
  const response = await h.route.GET(request(null, 'GET'));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.episodes.length, 50); assert.ok(result.nextCursor);
  assert.equal(result.episodes.some(item => item.episode.id === reviewId), false);
  const next = await h.route.GET(request(null, 'GET', `?cursor=${encodeURIComponent(result.nextCursor)}`));
  assert.equal(next.status, 200); const page = await next.json();
  assert.equal(page.episodes.length, 1); assert.equal(page.nextCursor, null);
  assert.deepEqual(h.queries[0].filters, [['user_id', owner]]); assert.equal(h.queries[0].maximum, 51);
  assert.equal((await h.route.GET(request(null, 'GET', '?cursor=user_id.eq.other'))).status, 400);
});

test('detail rejects malformed and foreign IDs and returns only the latest 20 owned reviews', async () => {
  const records = new Map(Array.from({ length: 21 }, (_, index) => [`${owner}:review-${index}`, {
    id: `${String(index).padStart(8, '0')}-4444-4444-8444-444444444444`, user_id: owner, episode_id: knownId,
    client_request_id: `review-${index}`, verdict: 'needs_revision', reason: 'Make the transition more gradual.', created_at: '2026-10-13T00:00:00Z',
  }]));
  records.set(`${other}:foreign-review`, { id: reviewId, user_id: other, episode_id: knownId, verdict: 'approve_plan', reason: 'foreign-private-reason', created_at: '2026-10-13T01:00:00Z' });
  const h = harness({ rows: [storedRow(), storedRow(other, reviewId)], reviews: records });
  assert.equal((await h.detail.GET(request(null, 'GET'), context('invalid'))).status, 400);
  assert.equal((await h.detail.GET(request(null, 'GET'), context(reviewId))).status, 404);
  const response = await h.detail.GET(request(null, 'GET'), context(knownId));
  assert.equal(response.status, 200); const result = await response.json();
  assert.equal(result.episode.id, knownId); assert.equal(result.reviews.length, 20);
  assert.equal(JSON.stringify(result).includes('foreign-private-reason'), false);
  assert.equal(Object.hasOwn(result.reviews[0], 'user_id'), false);
  assert.equal(Object.hasOwn(result.reviews[0], 'client_request_id'), false);
  assert.equal(h.queries.at(-1).maximum, 20);
  for (const query of h.queries) assert.ok(query.filters.some(([key, value]) => key === 'user_id' && value === owner));
});

test('reviews require owned plans, are explicit and append-only, and preserve immutable plan flags', async () => {
  const original = storedRow();
  const h = harness({ rows: [original, storedRow(other, reviewId)] });
  const missing = await h.reviewer.POST(request(review()), context(reviewId));
  assert.equal(missing.status, 404); assert.equal(h.adminCalls(), 0);
  const first = await h.reviewer.POST(request(review()), context(knownId));
  assert.equal(first.status, 201); const saved = await first.json();
  assert.equal(saved.review.episodeId, knownId); assert.equal(saved.review.verdict, 'approve_plan');
  assert.equal(h.calls[0].args.p_user_id, owner);
  const retry = await h.reviewer.POST(request(review()), context(knownId));
  assert.equal(retry.status, 200); assert.deepEqual((await retry.json()).review, saved.review);
  const whitespaceRetry = await h.reviewer.POST(request(review({ reason: review().reason.replaceAll(' ', '  ') })), context(knownId));
  assert.equal(whitespaceRetry.status, 200); assert.deepEqual((await whitespaceRetry.json()).review, saved.review);
  assert.equal((await h.reviewer.POST(request(review({ reason: 'A conflicting review using the same request identifier.' })), context(knownId))).status, 409);
  assert.equal((await h.reviewer.POST(request(review({ clientRequestId: 'second-review', verdict: 'needs_revision', reason: 'Adjust the rain texture before producing this episode.' })), context(knownId))).status, 201);
  assert.equal(h.reviews.size, 2); assert.deepEqual(h.state.get(`${owner}:seed-request`).plan, original.plan);
  assert.equal(h.state.get(`${owner}:seed-request`).plan.execution.providerCallsAllowed, false);
});

test('database errors are sanitized and missing migration/config is an explicit 503', async () => {
  for (const code of ['42P01', '42883', '42703', 'PGRST202', 'PGRST204', 'PGRST205']) {
    const h = harness({ readError: { code, message: 'private-database-secret' } });
    const results = [await h.route.GET(request(null, 'GET')), await h.route.POST(request(body())), await h.planner.POST(request({ input: body().input })),
      await h.detail.GET(request(null, 'GET'), context(knownId)), await h.reviewer.POST(request(review()), context(knownId))];
    for (const result of results) {
      assert.equal(result.status, 503); const error = await result.json();
      assert.equal(error.code, 'persistence_not_ready'); assert.equal(JSON.stringify(error).includes('private-database-secret'), false);
      assert.match(result.headers.get('Cache-Control'), /no-store/);
    }
  }
  for (const [code, status] of [['23505', 409], ['22023', 400], ['23514', 400], ['42501', 403], ['P0002', 404], ['unexpected', 503]]) {
    const h = harness({ rows: [storedRow()], writeError: { code, message: 'private-database-secret' } });
    for (const result of [await h.route.POST(request(body())), await h.reviewer.POST(request(review()), context(knownId))]) {
      assert.equal(result.status, status); assert.equal(JSON.stringify(await result.json()).includes('private-database-secret'), false);
    }
  }
  const h = harness({ env: { SUPABASE_SERVICE_ROLE_KEY: undefined } });
  const result = await h.route.POST(request(body()));
  assert.equal(result.status, 503); assert.equal((await result.json()).code, 'persistence_not_ready'); assert.equal(h.adminCalls(), 0);
});
