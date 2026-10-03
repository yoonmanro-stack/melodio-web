const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScript(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (specifier) => {
      if (dependencies[specifier]) return dependencies[specifier];
      throw new Error(`Unexpected module: ${specifier}`);
    }, module, module.exports,
  );
  return module.exports;
}

const wavUtils = loadTypeScript('src/lib/audioWavUtils.ts');
const { trimVoiceSampleToWav, MAX_VOICE_SOURCE_BYTES } = loadTypeScript('src/lib/audio/voiceSample.ts', {
  '@/lib/audioWavUtils': wavUtils,
});

class FakeAudioBuffer {
  constructor(channels, length, sampleRate, source = false) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
    if (source) for (const channel of this.channels) {
      channel.fill(-0.5);
      channel.fill(0.25, 100, 200);
      channel.fill(-0.75, 200);
    }
  }
  getChannelData(index) { return this.channels[index]; }
}

class FakeAudioContext {
  async decodeAudioData() { return new FakeAudioBuffer(2, 1200, 10, true); }
  createBuffer(channels, length, sampleRate) { return new FakeAudioBuffer(channels, length, sampleRate); }
  async close() {}
}

test('exports only the selected vocal passage as a valid WAV', async () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try {
    const source = new File([new Uint8Array([1])], 'stem.mp3', { type: 'audio/mpeg' });
    const result = await trimVoiceSampleToWav(source, 10, 20);
    const bytes = new DataView(await result.file.arrayBuffer());
    assert.equal(result.durationSeconds, 10);
    assert.equal(result.file.name, 'stem-selected.wav');
    assert.equal(result.file.type, 'audio/wav');
    assert.equal(bytes.getUint32(24, true), 10);
    assert.equal(bytes.getUint16(22, true), 2);
    assert.equal(bytes.getUint32(40, true), 10 * 10 * 2 * 2);
    assert.equal(bytes.getInt16(44, true), Math.floor(0.25 * 32767));
    assert.equal(source.size, 1);
  } finally { globalThis.AudioContext = previous; }
});

test('rejects short or oversized selections before reading the source', async () => {
  const source = new File([new Uint8Array([1])], 'stem.mp3', { type: 'audio/mpeg' });
  await assert.rejects(trimVoiceSampleToWav(source, 1, 5), /6~120초/);
  await assert.rejects(trimVoiceSampleToWav(source, 0, 121), /6~120초/);
  await assert.rejects(trimVoiceSampleToWav({ size: MAX_VOICE_SOURCE_BYTES + 1 }, 0, 10), /40MB/);
});

test('supports a full two-minute selection', async () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try {
    const source = new File([new Uint8Array([1])], 'stem.mp3', { type: 'audio/mpeg' });
    const result = await trimVoiceSampleToWav(source, 0, 120);
    assert.equal(result.durationSeconds, 120);
    assert.equal(result.file.size, 44 + 120 * 10 * 2 * 2);
  } finally { globalThis.AudioContext = previous; }
});
