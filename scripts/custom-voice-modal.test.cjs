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
// Effects are omitted so this fixture never starts timers or browser capture.
function modalFixture(duration, submission) {
  const slots = [];
  let cursor = 0;
  const requests = [];
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
    useCallback: callback => callback,
    useEffect() {},
  };
  const dependencies = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': Object.fromEntries(['Check', 'CircleStop', 'FileAudio', 'Loader2', 'Mic2', 'ShieldCheck', 'Upload', 'X'].map(name => [name, `icon-${name}`])),
    '@/lib/supabase/client': { createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) } }) },
    '@/contexts/VoiceContext': { useVoice: () => ({ isCreateModalOpen: true, closeCreateModal() {}, syncRegisteredVoice() {} }) },
    '@/components/voice/VoiceSampleEditor': { VoiceSampleEditor: 'sample-editor' },
    '@/components/voice/registrationUi': guidanceModule.exports,
    '@/lib/audio/voiceSample': { MAX_VOICE_SOURCE_BYTES: 40 * 1024 * 1024, trimVoiceSampleToWav: async file => ({ file, durationSeconds: duration }) },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'fetch', compile('src/components/voice/CreateVoiceModal.tsx'))(
    name => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    mod, mod.exports,
    async (_url, init) => {
      if (!init?.body) return Response.json({ voices: [{ id: 'saved-draft', status: 'draft' }] });
      const body = JSON.parse(init.body);
      requests.push(body);
      if (body.action === 'prepare-source-upload') return Response.json({ id: 'saved-draft', bucket: 'private', path: 'source.wav', token: 'offline' });
      assert.equal(body.action, 'start-validation');
      return submission();
    },
  );
  return { requests, render() { cursor = 0; return mod.exports.CreateVoiceModal(); } };
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
  const file = new File(['offline audio'], 'selected.wav', { type: 'audio/wav' });
  let nodes = elements(fixture.render());
  nodes.find(node => node.type === 'input' && node.props.placeholder?.includes('Warm Vocal')).props.onChange({ target: { value: 'My Voice' } });
  nodes.find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [file] } });
  nodes.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  nodes = elements(fixture.render());
  nodes.find(node => node.type === 'sample-editor').props.onSelectionChange({ startSeconds: 0, endSeconds: 71, durationSeconds: 71, valid: true });
  nodes = elements(fixture.render());
  const submit = nodes.find(node => node.type === 'button' && text(node) === '선택 구간으로 검증 문구 받기');
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
  assert.equal(nodes.find(node => node.type === 'button' && text(node) === '선택 구간으로 검증 문구 받기').props.disabled, false);
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
