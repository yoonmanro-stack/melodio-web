/* Offline dashboard request/lifecycle regressions; no browser, database or provider calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/app/(app)/dashboard/page.tsx'), 'utf8');
const file = ts.createSourceFile('dashboard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name) {
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) expression = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(expression, `Missing dashboard callback ${name}`);
  return expression.getText(file);
}
function evaluate(expression, globals) {
  const module = { exports: {} };
  const js = ts.transpileModule(`module.exports = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(js, { module, console: { error() {}, warn() {} }, ...globals });
  return module.exports;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const row = (id, extra = {}) => ({ id, user_id: 'owner', status: 'completed', ...extra });
const reply = generations => ({ ok: true, status: 200, json: async () => ({ generations }) });
function fixture(options = {}) {
  const writes = [], loading = [], requests = [], errors = [];
  const state = { history: options.history || [], active: options.active || '', stats: {}, likes: {} };
  const cache = new Map(options.cache || []);
  const globals = {
    dashboardActiveRef: { current: true },
    historyLoadedRef: { current: state.history.length > 0 },
    historyCacheOwnerRef: { current: options.owner ?? 'owner' },
    historyFetchInFlightRef: { current: false },
    historyRefreshQueuedRef: { current: false },
    isStemUploadTrack: item => item.upload === true,
    isTrackStemSplit: item => item.split === true,
    setHistory(value) { state.history = value; },
    setIsHistoryLoading(value) { loading.push(value); },
    setHistoryError(value) { errors.push(value); },
    setStats(update) { state.stats = update(state.stats); },
    setActiveGenId(update) { state.active = update(state.active); },
    setLikedTracks(value) { state.likes = value; },
    setUserId() {}, setUserName() {}, setPlanName() {}, setIsPro() {}, setTokensGB() {},
    setTokenPercent() {}, setYoutubeChannel() {}, setHasActiveAutomation() {},
    localStorage: {
      getItem(key) { return cache.get(key) ?? null; },
      setItem(key, value) { writes.push(key); cache.set(key, value); },
    },
    async fetch(url, init) {
      const index = requests.push({ url, init }) - 1;
      return options.fetch ? options.fetch(index) : reply([row('new')]);
    },
  };
  return { state, globals, loading, requests, writes, errors, cache, refresh: evaluate(callback('fetchHistory'), globals) };
}

test('burst refreshes serialize into one latest follow-up without hiding a loaded library', async () => {
  const first = deferred(), second = deferred();
  const f = fixture({ fetch: index => [first, second][index].promise });
  const pending = f.refresh();
  await Promise.all([f.refresh(), f.refresh(), f.refresh()]);
  assert.equal(f.requests.length, 1);
  first.resolve(reply([row('first')]));
  await new Promise(setImmediate);
  assert.equal(f.requests.length, 2);
  assert.equal(f.state.history[0].id, 'first');
  assert.deepEqual(f.loading, [true, false]);
  second.resolve(reply([row('latest')]));
  await pending;
  assert.equal(f.state.history[0].id, 'latest');
  assert.equal(f.globals.historyFetchInFlightRef.current, false);
  assert.deepEqual(f.loading, [true, false, false]);
  assert.ok(f.requests.every(request => request.init.cache === 'no-store'));
});

test('background failure and malformed responses preserve existing tracks', async () => {
  for (const response of [{ ok: false, status: 503 }, reply(null)]) {
    const f = fixture({ history: [row('existing')], fetch: () => response });
    await f.refresh();
    assert.equal(f.state.history[0].id, 'existing');
    assert.deepEqual(f.loading, [false]);
    assert.equal(f.writes.length, 0);
    assert.equal(typeof f.errors[0], 'string');
  }
});

test('refresh preserves current stem selection and only writes the authenticated owner cache', async () => {
  const f = fixture({ active: 'second', fetch: () => reply([row('first', { split: true }), row('second', { split: true })]) });
  await f.refresh();
  assert.equal(f.state.active, 'second');
  assert.deepEqual(f.writes, ['melodio_cached_generations:owner']);
  const mixed = fixture({ fetch: () => reply([row('other', { user_id: 'another-owner' })]) });
  await mixed.refresh();
  assert.equal(mixed.writes.length, 0);
});

test('late responses after unmount cannot replace tracks, cache or loading state', async () => {
  const wait = deferred();
  const f = fixture({ history: [row('existing')], fetch: () => wait.promise });
  const pending = f.refresh();
  f.globals.dashboardActiveRef.current = false;
  wait.resolve(reply([row('late')]));
  await pending;
  assert.equal(f.state.history[0].id, 'existing');
  assert.deepEqual(f.loading, []);
  assert.deepEqual(f.writes, []);
});

test('authenticated cache restoration ignores shared and foreign-owner cache entries', async () => {
  const f = fixture({ owner: null, cache: [
    ['melodio_cached_generations', JSON.stringify([row('shared-other', { user_id: 'other' })])],
    ['melodio_cached_generations:owner', JSON.stringify([row('owned'), row('foreign', { user_id: 'other' })])],
  ] });
  const tables = [];
  const query = { select() { return query; }, eq() { return query; }, single: async () => ({ data: null }), maybeSingle: async () => ({ data: null }) };
  f.globals.supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from(table) { tables.push(table); return query; },
  };
  await evaluate(callback('fetchUserDataAndStats'), f.globals)();
  assert.deepEqual([...f.state.history].map(item => item.id), ['owned']);
  assert.equal(f.globals.historyCacheOwnerRef.current, 'owner');
  assert.equal(tables.includes('prompt_history'), false);
});

test('realtime uses owner filter, coalesces a burst and cancels refresh on cleanup', () => {
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect'
      && node.arguments[0].getText(file).includes('dashboard-generations-')) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(file);
  let subscribed, event, filter, refreshes = 0, removed = 0, timerId = 0;
  const timers = new Map();
  const channel = {
    on(_kind, config, listener) { filter = config; event = listener; return channel; },
    subscribe() { subscribed = true; return channel; },
  };
  const cleanup = evaluate(effect.getText(file), {
    userId: 'owner', fetchHistory() { refreshes += 1; },
    supabase: { channel: () => channel, removeChannel() { removed += 1; } },
    setTimeout(run) { timers.set(++timerId, run); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  })();
  assert.equal(subscribed, true);
  assert.equal(filter.filter, 'user_id=eq.owner');
  event(); event(); event();
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(refreshes, 1);
  event(); cleanup();
  assert.equal(timers.size, 0);
  assert.equal(removed, 1);
});
