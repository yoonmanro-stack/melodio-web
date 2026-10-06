const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  const moduleObject = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', 'module', ...Object.keys(globals), compiled)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, moduleObject.exports, moduleObject, ...Object.values(globals));
  return moduleObject.exports;
}

const { getSingingSampleUrl: sampleUrl } = load('src/lib/voice/singing-sample-url.ts');
const actual = '/assets/voices/discovery-20261005/discovery-v1-en-f1.mp3';
const legacy = '/assets/voices/vd-1004.mp3';
const dependencies = { 'react/jsx-runtime': require('react/jsx-runtime'), '@/lib/voice/singing-sample-url': { getSingingSampleUrl: sampleUrl } };

test('legacy TTS paths cannot become singing samples through saved absolute, query or encoded URLs', () => {
  for (const value of [legacy, `${legacy}?play=true`, `https://melodio.app${legacy}`, `https://old-host.invalid${legacy}?signature=offline`,
    '/assets/voices/VD-3802.MP3', '/assets/voices/vd7705.mp3', '/assets/voices/%76%64-1004.mp3',
    'https://melodio.app/assets%2Fvoices%2Fvd-1004.mp3', '/assets/voices/vd-2001.mp3#sample']) {
    assert.equal(sampleUrl(value), null, value);
  }
  for (const value of [undefined, '', {}, 'task:pending', 'data:audio/fake', 'javascript:offline', 'https://user:password@host.invalid/audio.mp3']) assert.equal(sampleUrl(value), null);
});

test('actual discovery, official and generated sample URLs are preserved', () => {
  for (const value of [actual, '/assets/voices/official-20261004/melodio-selected-c.mp3',
    'https://storage.invalid/storage/v1/object/public/audio/sample.mp3', 'https://storage.invalid/sample.mp3?token=offline',
    '/api/voice/audio/sample-token']) assert.equal(sampleUrl(value), value);
  assert.equal(sampleUrl(`  ${actual}  `), actual);
});

test('legacy defaults retain authored settings with linked singing previews', () => {
  const official = JSON.parse(fs.readFileSync('src/data/officialVocalCatalog.json', 'utf8'));
  const { INITIAL_SYSTEM_VOICES: voices } = load('src/data/vocalStyles.ts', { './officialVocalCatalog.json': { default: official }, './legacyVocalSamples.json': { default: require('../src/data/legacyVocalSamples.json') } });
  for (const id of ['voice-anna-kim', 'voice-kaelen-soul', 'voice-moe-jpop', 'voice-yeontaek-rock', 'voice-aria-soprano']) {
    const voice = voices.find(item => item.id === id);
    assert.ok(voice?.stylePrompt && voice.tags.length && voice.sourceType === 'default');
    assert.ok(sampleUrl(voice.audioUrl));
    assert.equal(voice.sampleDurationSeconds, 30);
  }
  const moe = voices.find(voice => voice.id === 'voice-moe-jpop');
  assert.equal(moe.audioUrl, '/assets/voices/approved-20261006/voice-moe-jpop-A.mp3');
  assert.equal(sampleUrl(moe.audioUrl), moe.audioUrl);
  assert.equal(moe.previewStartSeconds, 0); assert.equal(moe.sampleDurationSeconds, 30);
  assert.equal(moe.previewStatus, 'ready'); assert.equal(moe.language, 'Japanese'); assert.equal(moe.gender, 'female');
  for (const key of ['officialVoiceId', 'discoveryVoiceId', 'designedVoiceId', 'customVoiceId', 'voice_model_id', 'reviewStatus', 'reuseStatus']) assert.equal(moe[key], undefined);
  assert.equal(voices.filter(voice => voice.id === moe.id).length, 1);
  const bytes = fs.readFileSync(`public${moe.audioUrl}`);
  assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), '2dc9ac0cea2efa05ee61a3a05421cb57a0052c83549bb668ede222976cc9e456');
  assert.equal(voices.find(voice => voice.id === 'voice-aria-soprano').isFavorite, true);
  assert.equal(voices.find(voice => voice.id === 'voice-kaelen-soul').isFavorite, false);
  for (const voice of official) assert.deepEqual(voices.find(item => item.id === voice.id), voice);
});

function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function modalFixture(audioUrl) {
  const slots = [], audios = [];
  let cursor = 0;
  const voice = { id: 'offline-voice', name: 'Fixture', gender: 'female', tags: [], audioUrl };
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useEffect() {},
    useCallback(callback) { return callback; },
  };
  class OfflineAudio {
    src = '';
    pause() {}
    play() { this.playCalls++; return Promise.resolve(); }
    constructor() { this.playCalls = 0; audios.push(this); }
  }
  const { VoiceModal } = load('src/components/voice/VoiceModal.tsx', {
    ...dependencies, react,
    'lucide-react': new Proxy({}, { get: (_target, name) => `icon-${String(name)}` }),
    'framer-motion': { motion: { div: 'motion-div' } },
    '@/contexts/VoiceContext': { useVoice: () => ({ voices: [voice], favorites: [], isVoiceModalOpen: true }) },
  }, { Audio: OfflineAudio, setTimeout() { throw new Error('No fake playback timer may run'); } });
  const render = () => { cursor = 0; return VoiceModal(); };
  const button = () => elements(render()).find(node => node.type === 'button' && node.props['aria-label']?.startsWith('Fixture '));
  return { audios, render, button };
}

test('VoiceModal disables missing and persisted legacy samples without fake playing feedback', () => {
  for (const value of [undefined, legacy, `https://old-host.invalid${legacy}`]) {
    const fixture = modalFixture(value);
    const button = fixture.button();
    assert.equal(button.props.disabled, true);
    assert.match(button.props['aria-label'], /가창 샘플 없음/);
    button.props.onClick();
    assert.equal(fixture.audios.length, 0);
    assert.match(fixture.button().props['aria-label'], /가창 샘플 없음/);
  }
});

test('VoiceModal plays an actual sample and reports playback only after play succeeds', async () => {
  const fixture = modalFixture(actual);
  assert.equal(fixture.button().props.disabled, false);
  fixture.button().props.onClick();
  assert.equal(fixture.audios[0].src, actual);
  assert.equal(fixture.audios[0].playCalls, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(fixture.button().props['aria-label'], /일시정지/);
});

test('StudioVoicePicker uses the shared URL guard before mounting the preview player', () => {
  const source = fs.readFileSync('src/components/voice/StudioVoicePicker.tsx', 'utf8');
  const ast = ts.createSourceFile('StudioVoicePicker.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'candidateSampleUrl') declaration = node; ts.forEachChild(node, visit); }
  visit(ast);
  assert.ok(declaration);
  const code = ts.transpileModule(`exports.result = ${declaration.initializer.getText(ast)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const [url, expected] of [[legacy, null], [`https://old-host.invalid${legacy}`, null], [actual, actual]]) {
    const result = {};
    new Function('exports', 'candidate', 'getSingingSampleUrl', code)(result, { audioUrl: url }, sampleUrl);
    assert.equal(result.result, expected);
  }
  assert.match(source, /src=\{candidateSampleUrl\}/);
});
