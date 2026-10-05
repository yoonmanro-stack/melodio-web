const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, requireModule, Audio) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('module', 'exports', 'require', 'Audio', code)(module, module.exports, requireModule, Audio);
  return module.exports;
}

// Execute the component's own handlers and visibility effects with offline media.
function harness() {
  const hooks = [], pendingEffects = [], audios = [], events = [];
  let cursor = 0, tree;
  const unchanged = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: initial };
      return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }];
    },
    useRef(value) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { current: value };
      return hooks[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!unchanged(hooks[index]?.deps, deps)) hooks[index] = { callback, deps };
      return hooks[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!unchanged(hooks[index]?.deps, deps)) pendingEffects.push(() => {
        hooks[index]?.cleanup?.();
        hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const context = {
    voices: [
      { id: 'a', name: 'Sample A', audioUrl: '/samples/a.mp3', sourceType: 'default', tags: [] },
      { id: 'b', name: 'Sample B', audioUrl: '/samples/b.mp3', sourceType: 'default', tags: [] },
    ],
    activeVoice: null, favorites: [], isVoiceModalOpen: true,
    closeVoiceModal() { events.push('close'); context.isVoiceModalOpen = false; },
    openCreateModal() {
      assert.ok(audios.every(audio => audio.paused), 'Preview must stop before recording registration opens');
      events.push('register');
    },
    setActiveVoice(voice) { context.activeVoice = voice; },
    updateVoice() {}, deleteVoice() {}, toggleFavorite() {},
  };
  class FakeAudio {
    constructor() { this.currentTime = 0; this.paused = true; this.plays = []; audios.push(this); }
    pause() { this.paused = true; }
    play() {
      this.paused = false;
      return new Promise((resolve, reject) => this.plays.push({ resolve, reject }));
    }
  }
  const samples = load('src/lib/voice/singing-sample-url.ts', () => { throw new Error('Unexpected import'); });
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'lucide-react': new Proxy({}, { get: (_, name) => name }),
    'framer-motion': { motion: { div: 'motion.div' } },
    '@/contexts/VoiceContext': { useVoice: () => context },
    '@/lib/voice/singing-sample-url': samples,
  };
  const { VoiceModal } = load('src/components/voice/VoiceModal.tsx', name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
    return dependencies[name];
  }, FakeAudio);
  function render() {
    cursor = 0;
    tree = VoiceModal();
    pendingEffects.splice(0).forEach(effect => effect());
    return tree;
  }
  function allButtons(node) {
    if (Array.isArray(node)) return node.flatMap(allButtons);
    if (!node || typeof node !== 'object') return [];
    return [...(node.type === 'button' ? [node] : []), ...allButtons(node.props?.children)];
  }
  function text(node) {
    if (Array.isArray(node)) return node.map(text).join('');
    if (!node || typeof node === 'boolean') return '';
    return typeof node === 'object' ? text(node.props?.children) : String(node);
  }
  const button = label => {
    const found = allButtons(tree).find(node => node.props['aria-label'] === label || text(node).trim() === label);
    assert.ok(found, `Missing button: ${label}`);
    return found;
  };
  render();
  return { context, audios, events, render, button, unmount: () => hooks.forEach(hook => hook.cleanup?.()) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('registration stops audio before opening the recording flow and ignores pending playback completion', async () => {
  const h = harness();
  h.button('Sample A 가창 샘플 듣기').props.onClick();
  const audio = h.audios[0]; audio.currentTime = 12;
  h.button('목소리 등록Suno V6노래 샘플과 검증 문구 녹음으로 등록합니다.').props.onClick();
  assert.equal(audio.paused, true); assert.equal(audio.currentTime, 0);
  assert.deepEqual(h.events, ['close', 'register']);
  assert.equal(h.render(), null);
  audio.plays[0].resolve(); await flush();
  h.context.isVoiceModalOpen = true; h.render();
  assert.ok(h.button('Sample A 가창 샘플 듣기'));
  assert.equal(audio.paused, true);
});

test('an external close stops a mounted modal and pending playback cannot mark it playing after reopening', async () => {
  const h = harness();
  h.button('Sample A 가창 샘플 듣기').props.onClick();
  const audio = h.audios[0]; audio.currentTime = 7;
  h.context.isVoiceModalOpen = false; assert.equal(h.render(), null);
  assert.equal(audio.paused, true); assert.equal(audio.currentTime, 0);
  audio.plays[0].resolve(); await flush();
  h.context.isVoiceModalOpen = true; h.render();
  assert.ok(h.button('Sample A 가창 샘플 듣기'));
});

test('close and selection stop active playback, and unmount invalidates a pending request', async () => {
  for (const action of ['닫기', '스타일 선택', 'unmount']) {
    const h = harness();
    h.button('Sample A 가창 샘플 듣기').props.onClick();
    const audio = h.audios[0];
    if (action !== 'unmount') {
      audio.plays[0].resolve(); await flush(); h.render();
      assert.ok(h.button('Sample A 가창 샘플 일시정지'));
      audio.currentTime = 3;
      h.button(action).props.onClick();
    } else {
      h.unmount(); audio.plays[0].resolve(); await flush();
    }
    assert.equal(audio.paused, true); assert.equal(audio.currentTime, 0);
    if (action === '스타일 선택') assert.equal(h.context.activeVoice.id, 'a');
  }
});

test('a stale rejected play cannot clear newer playback after close and reopen', async () => {
  const h = harness();
  h.button('Sample A 가창 샘플 듣기').props.onClick();
  h.button('닫기').props.onClick(); h.render();
  h.context.isVoiceModalOpen = true; h.render();
  h.button('Sample B 가창 샘플 듣기').props.onClick();
  const audio = h.audios[0];
  audio.plays[1].resolve(); await flush(); h.render();
  assert.ok(h.button('Sample B 가창 샘플 일시정지'));
  audio.plays[0].reject(new Error('Interrupted old preview')); await flush(); h.render();
  assert.ok(h.button('Sample B 가창 샘플 일시정지'));
  assert.equal(audio.paused, false);
});
