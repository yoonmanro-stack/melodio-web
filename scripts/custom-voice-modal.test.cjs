/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function compile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

const guidanceModule = { exports: {} };
new Function('module', 'exports', compile('src/components/voice/registrationUi.ts'))(guidanceModule, guidanceModule.exports);

// Exercise the modal's real event handlers with local hook state and offline I/O.
// Explicit effect flushing exercises restoration without timers, capture or network.
function modalFixture(duration, submission, options = {}) {
  const slots = [];
  let cursor = 0;
  let open = true;
  let jobs = [];
  const requests = [];
  const dom = { activeElement: null, body: { style: { overflow: '' } }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
  const voiceContext = { closeCreateModal() { open = false; }, syncRegisteredVoice() {} };
  const sameDeps = (before, after) => before && after && before.length === after.length && before.every((value, index) => Object.is(value, after[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) {
        const cleanup = slots[index]?.cleanup;
        slots[index] = { deps };
        jobs.push(() => { cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  const dependencies = {
    react,
    'react-dom': { createPortal: node => node },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': Object.fromEntries(['Check', 'CircleStop', 'FileAudio', 'Loader2', 'Mic2', 'ShieldCheck', 'Upload', 'X'].map(name => [name, `icon-${name}`])),
    '@/lib/supabase/client': { createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) } }) },
    '@/contexts/VoiceContext': { useVoice: () => ({ ...voiceContext, isCreateModalOpen: open }) },
    '@/components/voice/VoiceSampleEditor': { VoiceSampleEditor: 'sample-editor' },
    '@/components/voice/VoiceUploadGuide': { VoiceUploadGuide: 'upload-guide' },
    '@/components/voice/registrationUi': guidanceModule.exports,
    '@/lib/audio/voiceSample': { MAX_VOICE_SOURCE_BYTES: 40 * 1024 * 1024, trimVoiceSampleToWav: async file => ({ file, durationSeconds: duration }) },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'fetch', 'document', 'HTMLElement', 'window', 'navigator', 'MediaRecorder', compile('src/components/voice/CreateVoiceModal.tsx'))(
    name => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    mod, mod.exports,
    async (_url, init) => {
      if (!init?.body) {
        if (options.getResponse) return options.getResponse(init);
        return Response.json({ voices: requests.length ? [{ id: 'saved-draft', status: 'draft' }] : options.registrations || [] });
      }
      const body = JSON.parse(init.body);
      requests.push(body);
      if (body.action === 'prepare-source-upload') return Response.json({ id: 'saved-draft', bucket: 'private', path: 'source.wav', token: 'offline' });
      assert.equal(body.action, 'start-validation');
      return submission();
    },
    dom, class HTMLElement {}, { setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} },
    options.navigator || {}, options.MediaRecorder,
  );
  const fixture = {
    requests,
    render() { cursor = 0; return mod.exports.CreateVoiceModal(); },
    flush() { const batch = jobs; jobs = []; batch.forEach(job => job()); },
    async mount() { fixture.render(); fixture.flush(); await new Promise(setImmediate); fixture.render(); fixture.flush(); await new Promise(setImmediate); return fixture.render(); },
    async settle() { for (let n = 0; n < 3; n++) { await new Promise(setImmediate); fixture.render(); fixture.flush(); } return fixture.render(); },
    setOpen(value) { open = value; const node = fixture.render(); fixture.flush(); return node; },
  };
  return fixture;
}

function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

function text(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join('');
  return text(node?.props?.children || '');
}

async function submitSample(fixture) {
  await fixture.mount();
  const file = new File(['offline audio'], 'selected.wav', { type: 'audio/wav' });
  let nodes = elements(fixture.render());
  nodes.find(node => node.type === 'input' && node.props.placeholder?.includes('Warm Vocal')).props.onChange({ target: { value: 'My Voice' } });
  nodes.find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [file] } });
  nodes.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  nodes = elements(fixture.render());
  nodes.find(node => node.type === 'sample-editor').props.onSelectionChange({ startSeconds: 0, endSeconds: 71, durationSeconds: 71, valid: true });
  nodes = elements(fixture.render());
  const submit = nodes.find(node => node.type === 'button' && /다음|검증 문구 받기|샘플 제출하고 본인 확인으로/.test(text(node)));
  assert.equal(submit.props.disabled, false);
  await submit.props.onClick();
  return file;
}

test('preflight draft shows recovery and retains the selected source and interval', async () => {
  const fixture = modalFixture(71, () => Response.json({ error: '서비스 설정 확인 필요' }, { status: 503 }));
  const file = await submitSample(fixture);
  assert.equal(fixture.requests[1].durationSeconds, 71);
  const draft = fixture.render();
  assert.match(text(draft), /등록 준비를 완료하지 못했습니다/);
  elements(draft).find(node => node.type === 'button' && text(node) === '입력 화면으로 돌아가기').props.onClick();
  const nodes = elements(fixture.render());
  assert.equal(nodes.find(node => node.type === 'sample-editor').props.file, file);
  assert.equal(nodes.find(node => node.type === 'button' && /다음|검증 문구 받기|샘플 제출하고 본인 확인으로/.test(text(node))).props.disabled, false);
  assert.equal(fixture.requests.length, 2);
});

test('unknown successful result shows the existing registration without a new-registration action', async () => {
  const fixture = modalFixture(71, () => Response.json({ voice: { id: 'existing-task', status: 'validation_pending', errorCode: 'provider_result_unrecognized' } }));
  await submitSample(fixture);
  const pending = fixture.render();
  assert.match(text(pending), /응답 형식을 확인할 수 없어/);
  assert.match(text(pending), /existing-task/);
  assert.doesNotMatch(text(pending), /새 등록 화면|선택 구간으로 검증 문구 받기/);
  assert.equal(fixture.requests.length, 2);
});

test('opening waits for saved state and a stale response cannot replace the reopened registration', async () => {
  let resolveFirst;
  let reads = 0;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  const fixture = modalFixture(30, () => { throw new Error('Unexpected paid submission'); }, {
    getResponse: () => ++reads === 1 ? first : Response.json({ voices: [{ id: 'current-voice', name: 'Current Voice', status: 'phrase_ready', validationPhrase: 'Current phrase' }] }),
  });
  const loading = fixture.render(); fixture.flush();
  assert.match(text(loading), /이전 등록 상태/);
  assert.equal(elements(loading).filter(node => node.type === 'input').length, 0);
  fixture.setOpen(false); fixture.setOpen(true);
  await fixture.settle();
  resolveFirst(Response.json({ voices: [{ id: 'stale-voice', name: 'Stale Voice', status: 'phrase_ready', validationPhrase: 'Stale phrase' }] }));
  const restored = await fixture.settle();
  assert.match(text(restored), /Current phrase/);
  assert.doesNotMatch(text(restored), /Stale phrase/);
  assert.equal(fixture.requests.length, 0);
});

test('restored identity screen separates the spoken phrase recording from source upload', async () => {
  const fixture = modalFixture(30, () => { throw new Error('Unexpected paid submission'); }, {
    registrations: [{ id: 'voice-a', name: 'My Voice', status: 'phrase_ready', validationPhrase: 'Read this exact phrase.' }],
  });
  const screen = await fixture.mount();
  assert.equal(text(elements(screen).find(node => node.type === 'h2')), '본인 목소리 확인');
  const currentStep = elements(screen).find(node => node.props?.['aria-current'] === 'step');
  assert.match(text(currentStep), /본인 확인 녹음/);
  assert.match(text(screen), /My Voice/);
  assert.match(text(screen), /위 문구 읽고 녹음하기/);
  const alternative = elements(screen).find(node => node.type === 'details' && /이미 녹음한 본인 확인 문구/.test(text(node)));
  assert.ok(alternative);
  assert.notEqual(alternative.props.open, true);
  assert.match(text(alternative), /검증 문구를 읽은 녹음 파일 선택/);
  assert.equal(elements(screen).filter(node => node.type === 'sample-editor' || node.type === 'upload-guide').length, 0);
  assert.equal(fixture.requests.length, 0);
});

test('load failure offers retry without exposing a duplicate new-registration form', async () => {
  const fixture = modalFixture(30, () => { throw new Error('Unexpected paid submission'); }, {
    getResponse: () => Response.json({ error: 'Offline fixture' }, { status: 503 }),
  });
  const screen = await fixture.mount();
  assert.match(text(screen), /등록 상태 다시 불러오기/);
  assert.equal(elements(screen).filter(node => node.type === 'input').length, 0);
  assert.equal(fixture.requests.length, 0);
});

test('a verification file cannot carry over to another restored voice', async () => {
  let voice = { id: 'voice-a', name: 'First', status: 'phrase_ready', validationPhrase: 'First phrase' };
  const fixture = modalFixture(30, () => { throw new Error('Unexpected paid submission'); }, {
    getResponse: () => Response.json({ voices: [voice] }),
  });
  let screen = await fixture.mount();
  const file = new File(['offline sample'], 'first-verification.wav', { type: 'audio/wav' });
  elements(screen).find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [file] } });
  screen = await fixture.settle();
  assert.match(text(screen), /first-verification.wav/);
  fixture.setOpen(false);
  voice = { id: 'voice-b', name: 'Second', status: 'phrase_ready', validationPhrase: 'Second phrase' };
  fixture.setOpen(true);
  screen = await fixture.settle();
  assert.match(text(screen), /Second phrase/);
  assert.doesNotMatch(text(screen), /first-verification.wav/);
  const submit = elements(screen).find(node => node.type === 'button' && text(node) === '본인 확인 요청');
  assert.equal(submit.props.disabled, true);
  assert.equal(fixture.requests.length, 0);
});

test('microphone access granted after close is stopped without starting a recorder', async () => {
  let resolveStream, stopped = 0, constructed = 0;
  const streamReady = new Promise(resolve => { resolveStream = resolve; });
  class Recorder { constructor() { constructed++; } static isTypeSupported() { return true; } }
  const fixture = modalFixture(30, () => { throw new Error('Unexpected paid submission'); }, {
    registrations: [{ id: 'voice-a', name: 'My Voice', status: 'phrase_ready', validationPhrase: 'Read this phrase.' }],
    navigator: { mediaDevices: { getUserMedia: () => streamReady } }, MediaRecorder: Recorder,
  });
  const screen = await fixture.mount();
  const recording = elements(screen).find(node => node.type === 'button' && /위 문구 읽고 녹음하기/.test(text(node))).props.onClick();
  fixture.setOpen(false);
  resolveStream({ getTracks: () => [{ stop() { stopped++; } }] });
  await recording;
  assert.equal(constructed, 0);
  assert.equal(stopped, 1);
  assert.equal(fixture.requests.length, 0);
});
