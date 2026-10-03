const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function modules() {
  const cache = new Map();
  const effects = [];
  const context = { window: { dispatchEvent() {} }, CustomEvent: class {} };
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    vm.runInNewContext(code, { ...context, module, exports: module.exports, require(name) {
      if (name === 'react') return { ...require('react'), useRef: current => ({ current }), useEffect: callback => effects.push(callback) };
      if (name === 'next/link') return 'a';
      if (name === 'lucide-react') return { Download: 'download-icon' };
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), `${name}.ts`)));
      return require(name);
    } }, { filename: file });
    return module.exports;
  }
  load.effects = effects;
  return load;
}
const load = modules();
const projection = load('src/lib/dance/dashboard.ts');
const { DashboardDanceAudio, DashboardDanceProductionList } = load('src/components/dashboard/DashboardDanceTracks.tsx');
const { registerActiveAudio } = load('src/lib/globalAudio.ts');
function track(id, metadata = {}, overrides = {}) {
  return {
    id, title: '영상 제목', user_id: 'owner', status: 'completed', audio_url: 'https://storage.test/original.mp3',
    license_hash: JSON.stringify({ workflow: 'dance-music-first-v1', presetId: 'dance_challenge', sourceMenu: 'dance', originalMusicTitle: '원본 곡', ...metadata }),
    ...overrides,
  };
}
function nodes(node, type, matches = []) {
  if (Array.isArray(node)) node.forEach(child => nodes(child, type, matches));
  else if (node && typeof node === 'object') {
    if (node.type === type) matches.push(node);
    nodes(node.props?.children, type, matches);
  }
  return matches;
}
function label(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(label).join('');
  return typeof node === 'object' ? label(node.props?.children) : String(node);
}

test('original dance music stays exactly once in the library as videos and variants progress', () => {
  const ready = track('original', { danceVideo: { status: 'ready' } });
  const completed = track('original', { sourceMenu: 'viral', danceVideo: { status: 'completed', videoUrl: 'https://storage.test/original.mp4' } });
  const variant = track('variant', { danceVariant: { rootTrackId: 'original' }, danceVideo: { status: 'ready' } });
  const completedVariant = track('variant', { sourceMenu: 'viral', danceVariant: { rootTrackId: 'original' }, video_url: 'https://storage.test/variant.mp4' });
  for (const history of [[ready], [completed], [completed, variant], [completed, completedVariant]]) {
    const library = history.filter(row => projection.getDashboardLibraryCategory(row) !== null);
    assert.equal(library.length, 1);
    assert.equal(library[0].id, 'original');
    assert.equal(projection.getDashboardLibraryCategory(library[0]), 'audio-forge');
    assert.equal(projection.getDashboardMusicTitle(library[0]), '원본 곡');
  }
  assert.equal(projection.getDashboardTrackCategory(completed), 'viral-cf');
  assert.equal(projection.getDashboardTrackCategory(completedVariant), 'viral-cf');
});

test('existing music and viral categories keep their library behavior', () => {
  for (const [meta, category, libraryCategory] of [
    [{ sourceMenu: 'audio-forge' }, 'audio-forge', 'audio-forge'],
    [{ sourceMenu: 'japan' }, 'japan', 'japan'],
    [{ presetId: 'japan_landing' }, 'japan', 'japan'],
    [{ sourceMenu: 'style' }, 'style-library', 'style-library'],
    [{ presetId: 'custom-style-v1' }, 'style-library', 'style-library'],
    [{ sourceMenu: 'viral' }, 'viral-cf', null],
    [{ sourceMenu: 'viral-cf' }, 'viral-cf', null],
  ]) {
    const row = { id: 'ordinary', title: 'Ordinary song', license_hash: JSON.stringify(meta) };
    assert.equal(projection.getDashboardTrackCategory(row), category);
    assert.equal(projection.getDashboardLibraryCategory(row), libraryCategory);
    assert.equal(projection.getDashboardDanceAudio(row), null);
  }
  for (const license_hash of ['invalid JSON', 'null', '[]']) {
    assert.equal(projection.getDashboardLibraryCategory({ id: 'legacy', license_hash }), 'audio-forge');
  }
});

test('pending variant work is owner scoped and disappears from the work list when a final video exists', () => {
  const variant = { danceVariant: { rootTrackId: 'original' } };
  const rows = [
    track('original'),
    track('ready', { ...variant, danceVideo: { status: 'ready' } }),
    track('attention', { ...variant, danceVideo: { status: 'attention' } }),
    track('other-owner', variant, { user_id: 'another-user' }),
    track('complete-column', variant, { video_url: 'https://storage.test/final.mp4' }),
    track('complete-job', { ...variant, danceVideo: { status: 'completed', videoUrl: 'https://storage.test/final.mp4' } }),
    track('complete-metadata', { ...variant, sourceMenu: 'viral', grok_video_url: 'https://storage.test/final.mp4' }),
  ];
  const pending = projection.getDashboardDanceProductionRows(rows, 'owner');
  assert.equal(pending.map(row => row.track.id).join(','), 'ready,attention');
  assert.match(pending[0].statusLabel, /영상 제작 대기/);
  assert.match(pending[1].statusLabel, /확인 필요/);
  assert.equal(projection.getDashboardDanceProductionRows(rows, null).length, 0);
  const links = nodes(DashboardDanceProductionList({ history: rows, userId: 'owner' }), 'a');
  assert.equal(links.map(link => link.props.href).join(','), '/viral?danceTrack=ready,/viral?danceTrack=attention');
});

test('completed dance details retain distinct full MP3 and frozen 30-second WAV downloads', () => {
  const full = 'https://storage.test/original.mp3';
  const clip = 'https://storage.test/selected-30s.wav';
  for (const status of ['ready', 'image', 'completed', 'attention']) {
    const row = track(status, { sourceMenu: status === 'completed' ? 'viral' : 'dance', danceVideo: { status, audioUrl: clip } });
    const tree = DashboardDanceAudio({ track: row });
    const audio = nodes(tree, 'audio')[0];
    assert.equal(audio.props.src, full);
    assert.equal(audio.props.controls, true);
    const links = nodes(tree, 'a');
    assert.equal(links.length, 2);
    const fullDownload = new URL(links[0].props.href, 'https://melodio.test');
    const clipDownload = new URL(links[1].props.href, 'https://melodio.test');
    assert.equal(fullDownload.searchParams.get('url'), full);
    assert.equal(fullDownload.searchParams.get('filename'), '원본 곡.mp3');
    assert.equal(clipDownload.searchParams.get('url'), clip);
    assert.equal(clipDownload.searchParams.get('filename'), '원본 곡_30s.wav');
    assert.match(label(links[0]), /전체 음원 MP3 다운로드/);
    assert.match(label(links[1]), /30초 음원 WAV 다운로드/);
  }
});

test('variant snapshot provides the clip before its next video job exists without inventing a clip URL', () => {
  const saved = track('variant', { danceVariant: { rootTrackId: 'original' }, danceAudioSelection: { audioUrl: 'https://storage.test/frozen.wav' } });
  const panel = DashboardDanceAudio({ track: saved });
  assert.equal(new URL(nodes(panel, 'a')[1].props.href, 'https://melodio.test').searchParams.get('url'), 'https://storage.test/frozen.wav');
  assert.equal(nodes(DashboardDanceAudio({ track: track('no-selection') }), 'a').length, 1);
  assert.equal(projection.getDashboardDanceAudio(track('pending', {}, { audio_url: undefined, source_audio_url: 'suno:task-id' })).fullAudioUrl, '');
});

test('playing the native full-song control pauses existing global media', () => {
  let paused = false, stopped = false;
  registerActiveAudio({ pause() { paused = true; } }, () => { stopped = true; });
  const audio = nodes(DashboardDanceAudio({ track: track('original') }), 'audio')[0];
  audio.props.onPlay({ currentTarget: { pause() {} } });
  assert.equal(paused, true);
  assert.equal(stopped, true);
});

test('closing the detail modal or switching tracks pauses its full-song player', () => {
  load.effects.length = 0;
  const audio = nodes(DashboardDanceAudio({ track: track('original') }), 'audio')[0];
  let paused = false;
  audio.props.ref.current = { pause() { paused = true; } };
  const cleanup = load.effects[0]();
  assert.equal(paused, false);
  cleanup();
  assert.equal(paused, true);
});
