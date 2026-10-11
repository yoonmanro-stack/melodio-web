/** Public list privacy/refresh regressions: real component handlers, injected I/O only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const file = path.resolve(__dirname, '../src/components/viral/ViralVideoLibrary.tsx');
const tick = () => new Promise(resolve => setImmediate(resolve));
const sameDependencies = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
function walk(node, predicate, found = []) {
  if (Array.isArray(node)) { node.forEach(item => walk(item, predicate, found)); return found; }
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  walk(node.props?.children, predicate, found);
  return found;
}
const videos = tree => walk(tree, node => node.type === 'video');
function label(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(label).join('');
  return typeof node === 'object' ? label(node.props?.children) : String(node);
}
const sources = tree => videos(tree).map(video => video.props.src);
const pageButtons = tree => walk(tree, node => node.type === 'button' && /^\d+$/.test(label(node)));
const button = (tree, text) => walk(tree, node => node.type === 'button' && label(node).includes(text))[0];
const reply = rows => ({ ok: true, json: async () => ({ generations: rows }) });
function row(id = 'public-pet', title = 'Completed pet', category = 'pet') {
  return { id, title, status: 'completed', is_public: true,
    video_url: `https://example.invalid/${id}.mp4`, cover_art_url: `https://example.invalid/${id}.jpg`,
    license_hash: JSON.stringify({ sourceMenu: 'viral-cf', presetId: category, isPublic: true }),
  };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function harness(replies, initialProps = {}) {
  const slots = [], pendingEffects = [], requests = [], loaded = [], created = [], storageReads = [], storageWrites = [];
  let cursor = 0, parentVideos = [];
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] || (slots[index] = { current: initial }); },
    useMemo(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) slots[index] = { value: callback(), dependencies };
      return slots[index].value;
    },
    useEffect(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
        slots[index] = { dependencies, cleanup: previous?.cleanup };
        pendingEffects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  react.useCallback = (callback, dependencies) => react.useMemo(() => callback, dependencies);
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    module, exports: module.exports, window: {}, console: { ...console, error() {} },
    require(name) {
      if (name === 'react') return react;
      if (name === '@/lib/globalAudio') return { registerActiveAudio() {} };
      if (name === '@/lib/vle/viralCategoryAvailability') {
        const policyModule = { exports: {} };
        const policy = path.resolve(__dirname, '../src/lib/vle/viralCategoryAvailability.ts');
        const code = ts.transpileModule(fs.readFileSync(policy, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        vm.runInNewContext(code, { module: policyModule, exports: policyModule.exports, require });
        return policyModule.exports;
      }
      return require(name);
    },
    localStorage: {
      getItem(key) { storageReads.push(key); return JSON.stringify([{ id: 'withdrawn', category: 'pet', videoUrl: 'https://example.invalid/withdrawn.mp4' }]); },
      setItem(key) { storageWrites.push(key); },
    },
    async fetch(url, options) {
      requests.push({ url, cache: options?.cache });
      assert.equal(url, '/api/viral-videos?coverVersion=3');
      assert.equal(options?.cache, 'no-store');
      assert.ok(replies.length, 'Unexpected extra public-list request');
      const response = await replies.shift();
      if (response instanceof Error) throw response;
      return response;
    },
  }, { filename: file });
  const props = { onVideosLoaded(value) { parentVideos = Array.from(value); loaded.push(parentVideos); }, onCreateFormat(category) { created.push(category); }, refreshKey: null, ...initialProps };
  function render(nextProps = {}) { Object.assign(props, nextProps); cursor = 0; return module.exports.default(props); }
  function flushEffects() { pendingEffects.splice(0).forEach(effect => effect()); }
  async function mount() { render(); flushEffects(); await tick(); return render(); }
  async function refresh(key) { render({ refreshKey: key }); flushEffects(); await tick(); return render(); }
  return { render, flushEffects, mount, refresh, requests, loaded, created, storageReads, storageWrites,
    readCache: module.exports.readCachedViralVideos, get parentVideos() { return parentVideos; } };
}

test('public cards and TOP20 seed remain empty until current API proof, ignoring persisted URLs', () => {
  const host = harness([]);
  assert.equal(host.readCache().length, 0);
  assert.equal(videos(host.render()).length, 0);
  assert.deepEqual(host.parentVideos, []);
  assert.deepEqual(host.storageReads, []);
  assert.deepEqual(host.storageWrites, []);
  assert.deepEqual(host.requests, []);
});

test('completion refresh loads a newly public second-variant video without choosing a creation format', async () => {
  const host = harness([reply([]), reply([row('completed-second', 'Completed pet (2)')])]);
  assert.equal(videos(await host.mount()).length, 0);
  const tree = await host.refresh('owner:completed-job:video');
  assert.equal(host.requests.length, 2);
  assert.equal(videos(tree).length, 1);
  assert.deepEqual(host.parentVideos.map(item => item.id), ['completed-second']);
  assert.deepEqual(host.created, []);
  assert.deepEqual(host.storageWrites, []);
});

test('failed refresh clears both public cards and the parent TOP20 list', async () => {
  const host = harness([reply([row()]), { ok: false }]);
  const loadedTree = await host.mount();
  assert.equal(videos(loadedTree).length, 1);
  assert.equal(host.parentVideos.length, 1);
  const refreshButton = walk(loadedTree, node => node.type === 'button' && node.props['aria-label'] === '영상 목록 새로고침')[0];
  await refreshButton.props.onClick();
  assert.equal(videos(host.render()).length, 0);
  assert.deepEqual(host.parentVideos, []);
});

test('an old delayed public response cannot replace a newer empty result after refresh', async () => {
  const old = deferred();
  const host = harness([old.promise, reply([])]);
  host.render(); host.flushEffects();
  await host.refresh('newer-completion');
  assert.equal(host.requests.length, 2);
  assert.deepEqual(host.parentVideos, []);
  old.resolve(reply([row('withdrawn-public')]));
  await tick();
  assert.equal(videos(host.render()).length, 0);
  assert.deepEqual(host.parentVideos, []);
  assert.equal(host.loaded.length, 1, 'Only the newest response may publish the public list');
});

test('TOP20 IDs are excluded before slicing, leaving two full22-slot pages and the full parent dataset', async () => {
  const top = Array.from({ length: 20 }, (_, index) => row(`top-${index}`, `TOP ${index}`));
  const remaining = Array.from({ length: 44 }, (_, index) => row(`ordinary-${index}`, `Ordinary ${index}`));
  const host = harness([reply([...top, ...remaining])], {
    excludedVideoIds: new Set(top.map(item => item.id)),
    excludedVideoUrls: new Set(top.map(item => item.video_url)),
  });
  let tree = await host.mount();
  assert.deepEqual(sources(tree), remaining.slice(0, 22).map(item => item.video_url));
  assert.deepEqual(pageButtons(tree).map(label), ['1', '2'], '64 raw rows must become44 eligible rows and two pages');
  button(tree, '2').props.onClick();
  tree = host.render();
  assert.deepEqual(sources(tree), remaining.slice(22).map(item => item.video_url));
  assert.equal(host.parentVideos.length, 64, 'TOP20 ranking must receive the full unfiltered dataset');
  assert.equal(host.loaded.length, 1, 'Exclusion must not emit a smaller dataset back to the parent');
  assert.equal(host.requests.length, 1);
});

test('a TOP video URL is excluded even when its lower-list row has a different ID', async () => {
  const alias = row('different-top-id');
  alias.video_url = 'https://example.invalid/canonical-top.mp4';
  const ordinary = row('ordinary');
  const host = harness([reply([alias, ordinary])], {
    excludedVideoIds: new Set(['canonical-top-id']), excludedVideoUrls: new Set([alias.video_url]),
  });
  const tree = await host.mount();
  assert.deepEqual(sources(tree), [ordinary.video_url]);
  assert.deepEqual(host.parentVideos.map(item => item.id), [alias.id, ordinary.id]);
});

test('rank-down and date-boundary cards return when current TOP exclusion sets change without refetching', async () => {
  const rankDown = row('rank-down'), boundary = row('date-boundary'), ordinary = row('ordinary');
  const host = harness([reply([rankDown, boundary, ordinary])], {
    excludedVideoIds: new Set([rankDown.id, boundary.id]), excludedVideoUrls: new Set([rankDown.video_url, boundary.video_url]),
  });
  assert.deepEqual(sources(await host.mount()), [ordinary.video_url]);
  let tree = host.render({ excludedVideoIds: new Set([boundary.id]), excludedVideoUrls: new Set([boundary.video_url]) });
  host.flushEffects();
  assert.deepEqual(sources(tree), [rankDown.video_url, ordinary.video_url]);
  tree = host.render({ excludedVideoIds: new Set(), excludedVideoUrls: new Set() });
  host.flushEffects();
  assert.deepEqual(sources(tree), [rankDown.video_url, boundary.video_url, ordinary.video_url]);
  assert.equal(host.requests.length, 1);
  assert.equal(host.loaded.length, 1);
  assert.equal(host.parentVideos.length, 3);
});

test('search and category changes cannot reintroduce excluded TOP IDs or URLs', async () => {
  const topPet = row('top-pet', 'Needle TOP pet'), topDrama = row('top-drama', 'Needle TOP drama', 'dance_challenge');
  const pet = row('ordinary-pet', 'Needle ordinary pet'), drama = row('ordinary-dance', 'Needle ordinary drama', 'dance_challenge');
  const other = row('other-pet', 'Different ordinary pet');
  const host = harness([reply([topPet, topDrama, pet, drama, other])], {
    excludedVideoIds: new Set([topPet.id]), excludedVideoUrls: new Set([topDrama.video_url]),
  });
  let tree = await host.mount();
  const search = walk(tree, node => node.type === 'input' && node.props.type === 'search')[0];
  search.props.onChange({ target: { value: 'Needle' } });
  tree = host.render(); host.flushEffects();
  assert.deepEqual(sources(tree), [pet.video_url, drama.video_url]);
  button(tree, '댕냥이').props.onClick();
  tree = host.render(); host.flushEffects();
  assert.deepEqual(sources(tree), [pet.video_url]);
  search.props.onChange({ target: { value: 'TOP' } });
  tree = host.render(); host.flushEffects();
  assert.deepEqual(sources(tree), []);
  button(tree, '전체').props.onClick();
  tree = host.render(); host.flushEffects();
  assert.deepEqual(sources(tree), []);
  assert.equal(host.parentVideos.length, 5);
  assert.equal(host.loaded.length, 1);
});
