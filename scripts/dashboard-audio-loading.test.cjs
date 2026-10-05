const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = process.cwd();
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const hookCode = compile(fs.readFileSync(path.join(root, 'src/hooks/useStemAudio.ts'), 'utf8'));
const dashboardSource = ts.createSourceFile('dashboard.tsx',
  fs.readFileSync(path.join(root, 'src/app/(app)/dashboard/page.tsx'), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function declaration(name) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(dashboardSource) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(dashboardSource);
  assert.ok(found, `${name} must exist in the dashboard`);
  return `const ${found.getText(dashboardSource)}; exports.value = ${name};`;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function hookHarness({ deferFetch = false, mediaDuration = 209 } = {}) {
  const states = [], refs = [], effectSlots = [], effects = [];
  const contexts = [], requests = [], resolutions = [], starts = [], resumes = [];
  let cursor = 0;
  const sameDeps = (before, after) => before && after && before.length === after.length && before.every((value, index) => Object.is(value, after[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return refs[index] ||= { current: initial };
    },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect, deps) {
      const index = cursor++;
      if (sameDeps(effectSlots[index]?.deps, deps)) return;
      effects.push(() => {
        effectSlots[index]?.cleanup?.();
        effectSlots[index] = { deps, cleanup: effect() };
      });
    },
  };
  class OfflineAudioContext {
    state = 'suspended';
    sampleRate = 10;
    currentTime = 10;
    destination = {};
    constructor() { contexts.push(this); }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    createBuffer(channels, length, sampleRate) {
      return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) };
    }
    async decodeAudioData() { return { duration: mediaDuration }; }
    resume() { resumes.push(this); this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createBufferSource() {
      return { connect() {}, stop() {}, start(time, offset) { starts.push({ time, offset, loop: this.loop, duration: this.buffer.duration }); } };
    }
  }
  const moduleObject = { exports: {} };
  new Function('require', 'exports', 'module', 'AudioContext', 'window', 'fetch', 'requestAnimationFrame', 'cancelAnimationFrame', 'console', hookCode)(
    name => {
      if (name === 'react') return react;
      if (name === '@/lib/supabase') return { supabase: { from() { throw new Error('Explicit stem URLs must skip the generation query'); } } };
      if (name === '@/lib/stems/resolve-client') return { resolveStemStorageUrl: async value => { resolutions.push(value); return value; } };
      throw new Error(`Unexpected dependency ${name}`);
    }, moduleObject.exports, moduleObject, OfflineAudioContext, {},
    (url, options) => {
      const pending = deferred();
      const request = { url, signal: options.signal, pending };
      requests.push(request);
      const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
      if (!deferFetch) pending.resolve(response);
      request.complete = () => pending.resolve(response);
      return pending.promise;
    }, () => 1, () => {}, { log() {}, warn() {} },
  );
  let options;
  function render(next = options) {
    options = next;
    cursor = 0;
    const result = moduleObject.exports.useStemAudio(options);
    effects.splice(0).forEach(effect => effect());
    return result;
  }
  return { render, contexts, requests, resolutions, starts, resumes,
    cleanup() { effectSlots.forEach(slot => slot?.cleanup?.()); } };
}

const options = (suffix = 'A') => ({
  generationId: `offline-${suffix}`, preload: false,
  stemUrls: Object.fromEntries(['vocals', 'drums', 'bass', 'other'].map(id => [id, `https://audio.invalid/${suffix}/${id}.wav`])),
});
async function settleUntil(check) {
  for (let attempts = 0; attempts < 30; attempts++) {
    if (check()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Offline audio operation did not settle');
}

test('dashboard mount and track selection make no AudioContext, signing, or media requests', () => {
  const harness = hookHarness();
  let audio = harness.render(options());
  assert.ok(Object.values(audio.stemStates).every(stem => stem.loadState === 'idle'));
  audio = harness.render(options('B'));
  assert.equal(audio.allLoaded, false);
  assert.equal(harness.contexts.length, 0);
  assert.equal(harness.resolutions.length, 0);
  assert.equal(harness.requests.length, 0);
  harness.cleanup();
});

test('first play resumes during the gesture, fetches once, and starts all decoded stems in sync', async () => {
  const harness = hookHarness();
  const audio = harness.render(options());
  const playing = audio.play();
  assert.equal(harness.contexts.length, 1);
  assert.equal(harness.resumes.length, 1);
  assert.equal(harness.requests.length, 0, 'Network work follows the synchronous context resume');
  await playing;
  assert.equal(harness.requests.length, 4);
  assert.equal(harness.starts.length, 4);
  assert.equal(new Set(harness.starts.map(start => start.time)).size, 1);
  assert.ok(harness.starts.every(start => start.offset === 0 && start.loop === false));
  assert.equal(harness.render().duration, 209);
  audio.pause();
  await audio.play();
  assert.equal(harness.requests.length, 4, 'Resume reuses decoded buffers');
  harness.cleanup();
});

test('pause during loading cancels pending playback even if all downloads subsequently finish', async () => {
  const harness = hookHarness({ deferFetch: true });
  const audio = harness.render(options());
  const playing = audio.play();
  await settleUntil(() => harness.requests.length === 4);
  audio.pause();
  harness.requests.forEach(request => request.complete());
  await playing;
  assert.equal(harness.starts.length, 0);
  assert.equal(harness.render().isPlaying, false);
  harness.cleanup();
});

test('track switch aborts former requests and cannot start stale stems', async () => {
  const harness = hookHarness({ deferFetch: true });
  const audio = harness.render(options());
  const playing = audio.play();
  await settleUntil(() => harness.requests.length === 4);
  harness.render(options('B'));
  assert.ok(harness.requests.every(request => request.signal.aborted));
  harness.requests.forEach(request => request.complete());
  await playing;
  assert.equal(harness.starts.length, 0);
  assert.equal(harness.contexts.length, 1, 'New selected track remains idle');
  assert.equal(harness.contexts[0].state, 'closed');
  harness.cleanup();
});

test('real 12-second media is not treated as a looping demo', async () => {
  const harness = hookHarness({ mediaDuration: 12 });
  await harness.render(options()).play();
  assert.ok(harness.starts.every(start => start.loop === false));
  harness.cleanup();
});

test('duration badge uses stored duration or unknown state without constructing media', () => {
  const moduleObject = { exports: {} };
  new Function('require', 'exports', 'Audio', compile(declaration('TrackDuration')))(
    require, moduleObject.exports, function ForbiddenAudio() { throw new Error('Badge must not load audio'); },
  );
  const text = value => Array.isArray(value) ? value.map(text).join('') : String(value);
  assert.equal(text(moduleObject.exports.value({ initialDuration: 209 }).props.children), '3:29');
  assert.equal(text(moduleObject.exports.value({ initialDuration: 179.9 }).props.children), '2:59');
  for (const initialDuration of [undefined, 0, -1, NaN, Infinity]) {
    assert.equal(moduleObject.exports.value({ initialDuration }).props.children, '--:--');
  }
});

test('explicit dashboard stem play pauses main audio before requesting stem playback', () => {
  const calls = [];
  const moduleObject = { exports: {} };
  new Function('exports', 'useCallback', 'audioRef', 'audio', compile(declaration('playDashboardStems')))(
    moduleObject.exports, callback => callback,
    { current: { pause() { calls.push('main-pause'); } } },
    { play() { calls.push('stem-play'); } },
  );
  moduleObject.exports.value();
  assert.deepEqual(calls, ['main-pause', 'stem-play']);
});
