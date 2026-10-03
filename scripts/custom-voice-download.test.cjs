/* eslint-disable @typescript-eslint/no-require-imports -- Node's focused test harness is CommonJS. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/audio/voiceSampleDownload.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(FFmpeg, timers = {}) {
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'setTimeout', 'clearTimeout', compiled)(
    (name) => {
      if (name === '@ffmpeg/ffmpeg') return { FFmpeg };
      if (name === './voiceSample') return {
        MAX_VOICE_SOURCE_BYTES: 40 * 1024 * 1024, MIN_VOICE_SAMPLE_SECONDS: 6, MAX_VOICE_SAMPLE_SECONDS: 120,
      };
      throw new Error(`Unexpected dependency: ${name}`);
    }, loadedModule, loadedModule.exports, { location: { origin: 'https://melodio.test' } },
    timers.setTimeout || setTimeout, timers.clearTimeout || clearTimeout,
  );
  return loadedModule.exports;
}
const file = (name = '목소리.wav', type = 'audio/wav') => new File([new Uint8Array([1])], name, { type });
function fakeEngine(overrides = {}) {
  const state = { terminated: 0, args: [], loads: [], probeName: '', writes: 0 };
  class FFmpeg {
    async load(config) { state.loads.push(config); if (overrides.load) await overrides.load(); }
    async writeFile() { state.writes++; }
    async ffprobe(args) { state.probeName = args.at(-3); return overrides.probeResult ?? 0; }
    async readFile(name) {
      if (!name.endsWith('.probe.json')) return new Uint8Array([1, 2, 3]);
      if (overrides.emptyMetadata) return '{}';
      return JSON.stringify({
        streams: [{ codec_name: overrides.codec || 'pcm_s24le', channels: 1, sample_rate: '48000' }],
        format: {
          format_name: overrides.container || 'wav', size: String(overrides.size || 1000),
          duration: state.probeName.startsWith('source') ? '12' : String(overrides.duration || 6),
        },
      });
    }
    async exec(args) { state.args = args; return overrides.execResult || 0; }
    terminate() { state.terminated++; }
  }
  return { state, FFmpeg };
}

test('detects supported extensions and MIME fallbacks without advertising unknown formats', () => {
  const { getVoiceDownloadFormat } = load();
  for (const extension of ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'webm']) {
    assert.equal(getVoiceDownloadFormat({ name: `VOICE.${extension.toUpperCase()}`, type: '' }).extension, extension);
  }
  assert.equal(getVoiceDownloadFormat({ name: 'recording', type: 'audio/webm;codecs=opus' }).extension, 'webm');
  assert.equal(getVoiceDownloadFormat({ name: 'voice.xyz', type: 'application/octet-stream' }), null);
});

test('keeps PCM depth, accurate seek arguments, Korean filename, and local asset URLs', async () => {
  const { state, FFmpeg } = fakeEngine();
  const stages = [];
  const result = await load(FFmpeg).trimVoiceSampleOriginal(file(), 3.25, 9.25, { onStage: (stage) => stages.push(stage) });
  assert.equal(result.name, '목소리-selected-3.25-9.25.wav');
  assert.equal(result.type, 'audio/wav');
  assert.deepEqual(stages, ['loading', 'trimming']);
  assert.ok(state.args.indexOf('-ss') < state.args.indexOf('-i'));
  assert.equal(state.args[state.args.indexOf('-t') + 1], '6');
  assert.equal(state.args[state.args.indexOf('-c:a') + 1], 'pcm_s24le');
  assert.equal(state.args[state.args.indexOf('-fs') + 1], String(80 * 1024 * 1024));
  assert.ok(!state.args.includes('copy'));
  assert.equal(state.terminated, 1);
  for (const url of Object.values(state.loads[0])) assert.ok(url.startsWith('https://melodio.test/vendor/voice-audio/'));
});

test('rejects invalid intervals and oversized source before loading a worker', async () => {
  const { state, FFmpeg } = fakeEngine();
  const { trimVoiceSampleOriginal } = load(FFmpeg);
  for (const interval of [[0, 5.9], [0, 120.1], [-1, 6], [NaN, 8], [0, Infinity]]) {
    await assert.rejects(trimVoiceSampleOriginal(file(), ...interval), /6~120초/);
  }
  await assert.rejects(trimVoiceSampleOriginal({ size: 40 * 1024 * 1024 + 1 }, 0, 6), /40MB/);
  assert.equal(state.loads.length, 0);
});

test('accepts the pinned core ffprobe -1 only with valid fresh metadata', async () => {
  const valid = fakeEngine({ probeResult: -1 });
  assert.ok(await load(valid.FFmpeg).trimVoiceSampleOriginal(file(), 0, 6));
  const invalid = fakeEngine({ probeResult: -1, emptyMetadata: true });
  await assert.rejects(load(invalid.FFmpeg).trimVoiceSampleOriginal(file(), 0, 6), /음성 정보를 읽을 수/);
  assert.equal(invalid.state.args.length, 0);
});

test('library failures are normalized instead of exposing raw worker or provider text', async () => {
  const { FFmpeg } = fakeEngine({ load: () => { throw new Error('RAW_ENGINE_EXCEPTION_DO_NOT_SHOW'); } });
  await assert.rejects(load(FFmpeg).trimVoiceSampleOriginal(file(), 0, 6), {
    message: '선택 구간을 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.',
  });
});

test('rejects mismatched containers, unknown codecs, failed encoding, truncation, and output overflow', async () => {
  for (const config of [
    { container: 'mp3' }, { codec: 'adpcm_ima_wav' }, { execResult: 1 },
    { duration: 5 }, { size: 80 * 1024 * 1024 },
  ]) {
    const { state, FFmpeg } = fakeEngine(config);
    await assert.rejects(load(FFmpeg).trimVoiceSampleOriginal(file(), 0, 6));
    assert.equal(state.terminated, 1);
  }
});

test('abort while the core loads terminates the worker and rejects promptly', async () => {
  let beginLoad;
  const started = new Promise((resolve) => { beginLoad = resolve; });
  const { state, FFmpeg } = fakeEngine({ load: () => { beginLoad(); return new Promise(() => {}); } });
  const controller = new AbortController();
  const promise = load(FFmpeg).trimVoiceSampleOriginal(file(), 0, 6, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  assert.ok(state.terminated >= 1);
  assert.equal(state.writes, 0);
});

test('timeout covers core loading and terminates it', async () => {
  let expire;
  let beginLoad;
  const started = new Promise((resolve) => { beginLoad = resolve; });
  const { state, FFmpeg } = fakeEngine({ load: () => { beginLoad(); return new Promise(() => {}); } });
  const helper = load(FFmpeg, { setTimeout: (callback, ms) => { assert.equal(ms, 120_000); expire = callback; return 1; }, clearTimeout() {} });
  const promise = helper.trimVoiceSampleOriginal(file(), 0, 6);
  await started;
  expire();
  await assert.rejects(promise, /시간이 초과/);
  assert.ok(state.terminated >= 1);
});

let nativeFFmpeg = 'ffmpeg';
try { nativeFFmpeg = require('ffmpeg-static') || nativeFFmpeg; } catch { /* Use a system binary when available. */ }
const hasNative = [nativeFFmpeg, 'ffprobe'].every((command) => spawnSync(command, ['-version'], { stdio: 'ignore' }).status === 0);
const fixtures = hasNative ? fs.mkdtempSync(path.join(os.tmpdir(), 'melodio-voice-download-tests-')) : null;
function native(command, args, options = {}) {
  const result = spawnSync(command === 'ffmpeg' ? nativeFFmpeg : command, args, { cwd: fixtures, maxBuffer: 4 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${command} failed: ${String(result.stderr || '').slice(-1000)}`);
  return result.stdout;
}
function nativeProbe(name) {
  return JSON.parse(native('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', name], { encoding: 'utf8' }));
}

test('exact pinned WASM core completes probing and export despite ffprobe return -1', { skip: !hasNative }, async () => {
  const previousSelf = globalThis.self;
  const previousLocation = globalThis.location;
  globalThis.self = globalThis;
  globalThis.location = { href: `file://${require.resolve('@ffmpeg/core')}` };
  const inputName = 'wasm-probe-source.wav';
  native('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=8', '-c:a', 'pcm_s24le', inputName]);
  let terminated = false;
  const probeCodes = [];
  class CoreFFmpeg {
    async load() {
      this.core = await require('@ffmpeg/core')({ wasmBinary: fs.readFileSync(require.resolve('@ffmpeg/core/wasm')) });
      this.core.setLogger(() => {});
    }
    async writeFile(name, bytes) { this.core.FS.writeFile(name, bytes); }
    async readFile(name, encoding = 'binary') { return this.core.FS.readFile(name, { encoding }); }
    async ffprobe(args) {
      this.core.setTimeout(-1);
      this.core.ffprobe(...args);
      const result = this.core.ret;
      probeCodes.push(result);
      this.core.reset();
      return result;
    }
    async exec(args) {
      this.core.setTimeout(-1);
      this.core.exec(...args);
      const result = this.core.ret;
      this.core.reset();
      return result;
    }
    terminate() { terminated = true; }
  }
  try {
    const input = new File([fs.readFileSync(path.join(fixtures, inputName))], 'wasm.wav', { type: 'audio/wav' });
    const result = await load(CoreFFmpeg).trimVoiceSampleOriginal(input, 1, 7);
    assert.deepEqual(probeCodes, [-1, -1]);
    assert.equal(result.name, 'wasm-selected-1-7.wav');
    assert.ok(result.size > 800_000);
    assert.ok(terminated);
  } finally {
    if (previousSelf === undefined) delete globalThis.self; else globalThis.self = previousSelf;
    if (previousLocation === undefined) delete globalThis.location; else globalThis.location = previousLocation;
  }
});

// These synthetic fixtures stay in one designated temporary directory, never in the repository.
const cases = [
  ['wav', 'pcm_s16le', []], ['wav', 'pcm_s24le', []], ['wav', 'pcm_f32le', []],
  ['mp3', 'libmp3lame', []], ['m4a', 'aac', []], ['m4a', 'alac', []],
  ['aac', 'aac', []], ['ogg', 'libvorbis', []], ['ogg', 'libopus', []],
  ['flac', 'flac', []], ['webm', 'libopus', []], ['webm', 'libvorbis', []],
];
for (const [extension, encoder, extra] of cases) {
  test(`native ${extension}/${encoder}: preserves codec and selects the requested six seconds`, { skip: !hasNative }, async () => {
    const name = `${encoder}.${extension}`;
    const expression = 'aevalsrc=if(between(t\\,3.25\\,9.25)\\,0.3*sin(2*PI*1000*t)\\,0.3*sin(2*PI*2000*t)):s=48000:d=12';
    native('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', expression, '-c:a', encoder, ...extra, name]);
    const original = nativeProbe(name);
    const files = new Map();
    let terminated = false;
    class NativeFFmpeg {
      async load() {}
      async writeFile(filename, data) { fs.writeFileSync(path.join(fixtures, filename), data); }
      async ffprobe(args) {
        const outputIndex = args.indexOf('-o');
        const output = args[outputIndex + 1];
        const remaining = args.filter((_, index) => index !== outputIndex && index !== outputIndex + 1);
        files.set(output, native('ffprobe', remaining, { encoding: 'utf8' }));
        return 0;
      }
      async readFile(filename) { return files.get(filename) || new Uint8Array(fs.readFileSync(path.join(fixtures, filename))); }
      async exec(args) { native('ffmpeg', ['-y', ...args]); return 0; }
      terminate() { terminated = true; }
    }
    const input = new File([fs.readFileSync(path.join(fixtures, name))], `목소리.${extension}`);
    const result = await load(NativeFFmpeg).trimVoiceSampleOriginal(input, 3.25, 9.25);
    const outputName = `${encoder}-result.${extension}`;
    fs.writeFileSync(path.join(fixtures, outputName), new Uint8Array(await result.arrayBuffer()));
    const output = nativeProbe(outputName);
    assert.equal(output.streams[0].codec_name, original.streams[0].codec_name);
    assert.equal(output.streams[0].channels, original.streams[0].channels);
    assert.ok(Math.abs(Number(output.format.duration) - 6) < 0.1);
    if (extension === 'wav') assert.equal(output.streams[0].bits_per_sample, original.streams[0].bits_per_sample);
    const pcm = native('ffmpeg', ['-v', 'error', '-i', outputName, '-f', 'f32le', '-ac', '1', '-ar', '48000', '-']);
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    function energy(hz, start = 2400) {
      let sine = 0; let cosine = 0;
      for (let i = start; i < start + 4800; i++) {
        const sample = view.getFloat32(i * 4, true);
        sine += sample * Math.sin(2 * Math.PI * hz * i / 48000);
        cosine += sample * Math.cos(2 * Math.PI * hz * i / 48000);
      }
      return sine ** 2 + cosine ** 2;
    }
    assert.ok(energy(1000) > energy(2000) * 100, 'export begins in selected 1kHz passage, not preceding 2kHz audio');
    assert.ok(energy(1000, 5.8 * 48000) > energy(2000, 5.8 * 48000) * 100, 'export ends inside the selected passage');
    assert.ok(terminated);
  });
}
