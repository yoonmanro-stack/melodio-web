/* Offline UI behavior: real batch model, mocked authenticated HTTP, no media or DB calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(relativePath, imports = {}, globals = {}) {
  const filename = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports,
    require: name => imports[name] || require(name), AbortController, URL, ...globals }, { filename });
  return module.exports;
}

const { buildGenerationBatchTracklist } = load('src/lib/generation-batches/model.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const batchRow = count => ({ id: id(1), user_id: id(2), input_count: count, source_menu: 'audio',
  created_at: '2026-10-07T00:00:00Z', selection_revision: 0, selected_generation_ids: null });
function fixture(count = 10) {
  const batch = batchRow(count);
  const rows = Array.from({ length: count * 2 }, (_, i) => ({
    id: id(100 + i), generation_batch_index: Math.floor(i / 2), generation_candidate_slot: i % 2 ? 'B' : 'A',
    title: `실제 곡 ${Math.floor(i / 2) + 1} ${i % 2 ? 'B' : 'A'}`, status: 'completed',
    audio_url: `https://example.test/audio/${i}.mp3`, cover_art_url: null,
    actual_duration_seconds: 197.8 + i, provider_clip_key: `clip-${i}`,
  }));
  return { batch, rows, data: () => buildGenerationBatchTracklist(batch, rows) };
}
const reply = data => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const flush = () => new Promise(setImmediate);

function harness(fetcher) {
  const states = [], effects = [], pendingEffects = [], timers = new Map(), requests = [];
  let cursor = 0, timerId = 0, tree, props = { batchId: id(1) }, writes = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
      return [states[slot], value => { writes++; states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
    },
    useRef(initial) { const slot = cursor++; return states[slot] ??= { current: initial }; },
    useCallback(callback, deps) {
      const slot = cursor++;
      if (!same(states[slot]?.deps, deps)) states[slot] = { callback, deps };
      return states[slot].callback;
    },
    useEffect(callback, deps) {
      const slot = cursor++;
      if (!same(effects[slot]?.deps, deps)) {
        pendingEffects.push(() => { effects[slot]?.cleanup?.(); effects[slot] = { deps, cleanup: callback() }; });
      }
    },
  };
  const Component = load('src/components/dashboard/GenerationBatchTracklist.tsx', {
    react: hooks, 'lucide-react': new Proxy({}, { get: () => () => React.createElement('svg') }),
    '@/lib/globalAudio': { registerActiveAudio() {} },
  }, {
    fetch: async (url, init) => { requests.push({ url, init }); return fetcher(url, init, requests.length); },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: key => timers.delete(key),
  }).default;
  function render(nextProps = props) {
    props = nextProps; cursor = 0; tree = Component(props);
    pendingEffects.splice(0).forEach(run => run());
    return tree;
  }
  function nodes(node = tree) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== 'object') return [];
    return [node, ...nodes(node.props?.children ?? null)];
  }
  render();
  return { requests, timers, render, nodes,
    html: () => renderToStaticMarkup(render()),
    button: label => { render(); const button = nodes().find(node => node.type === 'button' && node.props['aria-label'] === label); assert.ok(button, `Missing button ${label}`); return button; },
    unmount: () => effects.forEach(effect => effect?.cleanup?.()),
    writes: () => writes,
    tickRefresh: async () => {
      const entry = [...timers.entries()].find(([, timer]) => timer.delay === 5000);
      if (!entry) return false;
      timers.delete(entry[0]); entry[1].callback(); await flush(); return true;
    },
  };
}

test('only eligible same-job 20/30/40 results render 10/15/20 selected real A songs', async () => {
  for (const count of [10, 15, 20]) {
    const f = fixture(count), ui = harness(() => reply(f.data()));
    await flush();
    const html = ui.html();
    assert.ok(html.includes(`생성 ${count * 2}곡 · 선택 ${count}곡`));
    assert.equal(ui.nodes().filter(node => node.type === 'li').length, count);
    assert.equal(ui.nodes().filter(node => node.type === 'audio').length, count);
    assert.ok(ui.nodes().filter(node => node.type === 'audio').every(node => node.props.preload === 'none'));
    assert.ok(html.includes('예상 트랙리스트 · 곡 전체를 순서대로 연결한 기준'));
    assert.ok(!html.includes('트랙리스트 복사'));
    assert.equal(ui.requests[0].init.credentials, 'same-origin');
    assert.equal(ui.requests[0].init.cache, 'no-store');
    ui.unmount();
  }
  for (const completed of [2, 18, 19]) {
    const f = fixture(); f.rows.splice(completed);
    const ui = harness(() => reply(f.data())); await flush();
    assert.equal(ui.html(), ''); ui.unmount();
  }
});

test('B replacement and reorder send the revision and persist the server-confirmed order after reopening', async () => {
  const f = fixture();
  const server = (url, init) => {
    if (init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      assert.equal(body.expectedRevision, f.batch.selection_revision);
      f.batch.selected_generation_ids = body.selectedGenerationIds;
      f.batch.selection_revision += 1;
    }
    return reply(f.data());
  };
  const ui = harness(server); await flush();
  ui.button('후보 B 선택: 실제 곡 1 B').props.onClick(); await flush();
  assert.equal(f.batch.selected_generation_ids[0], id(101));
  ui.button('실제 곡 1 B 아래로 이동').props.onClick(); await flush();
  assert.deepEqual(f.batch.selected_generation_ids.slice(0, 2), [id(102), id(101)]);
  assert.equal(f.batch.selection_revision, 2);
  ui.unmount();
  const reopened = harness(server); await flush();
  assert.ok(reopened.html().includes('저장된 선택과 순서'));
  assert.equal(reopened.nodes().find(node => node.type === 'audio').props['aria-label'], '실제 곡 2 A 후보 A 듣기');
  reopened.unmount();
});

test('revision conflicts reload the latest selection and show a specific notice', async () => {
  const f = fixture();
  const ui = harness((url, init) => {
    if (init.method === 'PATCH') {
      f.batch.selected_generation_ids = Array.from(f.data().selectedGenerationIds).reverse();
      f.batch.selection_revision += 1;
      return { ok: false, status: 409 };
    }
    return reply(f.data());
  });
  await flush(); ui.button('후보 B 선택: 실제 곡 1 B').props.onClick(); await flush();
  assert.equal(ui.requests.length, 3);
  assert.ok(ui.html().includes('다른 화면에서 목록이 변경되어 최신 목록을 불러왔습니다'));
  assert.equal(ui.nodes().find(node => node.type === 'audio').props['aria-label'], '실제 곡 10 A 후보 A 듣기');
  ui.unmount();
});

test('unknown durations retain real titles and withhold later timestamps and total duration', async () => {
  const f = fixture(); f.rows[0].actual_duration_seconds = null;
  const ui = harness(() => reply(f.data())); await flush();
  const html = ui.html();
  assert.ok(html.includes('예상 총 길이 · 길이 미확인'));
  assert.ok(html.includes('1곡의 길이가 미확인입니다.'));
  assert.ok(html.includes('시작 확인 대기'));
  assert.ok(html.includes('실제 곡 2 A'));
  ui.unmount();
});

test('pending batches refresh within a fixed budget and unmount aborts requests without stale state writes', async () => {
  const f = fixture(); f.rows.pop();
  const ui = harness(() => reply(f.data())); await flush();
  for (let i = 0; i < 12; i++) assert.equal(await ui.tickRefresh(), true);
  assert.equal(await ui.tickRefresh(), false);
  assert.equal(ui.requests.length, 13);
  ui.unmount(); assert.equal(ui.timers.size, 0);

  let resolve;
  const delayed = harness(() => new Promise(done => { resolve = done; }));
  const writes = delayed.writes();
  delayed.unmount();
  assert.equal(delayed.requests[0].init.signal.aborted, true);
  resolve(reply(fixture().data())); await flush();
  assert.equal(delayed.writes(), writes);
});

test('failed saves keep the last confirmed choice and never claim a successful save', async () => {
  const f = fixture();
  const ui = harness((url, init) => init.method === 'PATCH' ? { ok: false, status: 503 } : reply(f.data()));
  await flush(); ui.button('후보 B 선택: 실제 곡 1 B').props.onClick(); await flush();
  assert.ok(ui.html().includes('선택을 저장하지 못했습니다.'));
  assert.equal(ui.nodes().find(node => node.type === 'audio').props['aria-label'], '실제 곡 1 A 후보 A 듣기');
  ui.unmount();
});

test('individual detail cannot expose legacy strings, invented tracks, prompt titles or their copy actions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/(app)/dashboard/page.tsx'), 'utf8');
  for (const retired of ['meta.tracklistText', 'meta.youtubeMainTitle', 'displayTracklist', 'displayYtTitle', 'copiedYtTitle', 'copiedTracklist', 'Acoustic Version', '2,370+ DB']) {
    assert.ok(!source.includes(retired), retired);
  }
  assert.match(source, /detailItem\.generation_batch_id \? \([\s\S]*?<GenerationBatchTracklist/);
  assert.ok(source.includes('바이럴 숏폼 뮤비'));
  assert.ok(source.includes('copiedLyrics'));
});
