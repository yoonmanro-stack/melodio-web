/* eslint-disable @typescript-eslint/no-require-imports */
/** Isolated provider contract checks: fake process config and mocked fetch only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

class FixturePipelineError extends Error {
  constructor(message, code, status) { super(message); this.code = code; this.status = status; }
}
function loader() {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(root, filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = name => name === './petPipeline' ? { PetPipelineError: FixturePipelineError }
      : name.startsWith('.') ? load(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', source)(localRequire, mod, mod.exports,
      { env: { XAI_API_KEY: 'offline-fixture-token' } }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}
const { createPetXaiProvider, PET_XAI_VIDEO_MODELS } = loader()('src/lib/video/petProvider.ts');
const keyframe = 'https://images.x.ai/offline-keyframe.png';
function fixture() {
  const calls = [];
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, method: options.method, redirect: options.redirect, body });
    const result = url.endsWith('/videos/generations') ? { request_id: 'offline-video-1' }
      : { data: [{ url: 'https://images.x.ai/offline-generated.png' }] };
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetch };
}

test('dance Full 1.5 pins bridge frame while retaining the original cast reference and disabling generated audio', async () => {
  const f = fixture(), bridge = 'https://images.x.ai/offline-bridge.jpg';
  const provider = createPetXaiProvider(f.fetch, { model: 'grok-imagine-video-1.5', resolution: '720p', referenceImageUrl: keyframe, generateAudio: false });
  for (const frame of [keyframe, bridge]) await provider.startVideo('approved species-native movement', 15, frame);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls.map(call => call.body.image), [{ url: keyframe }, { url: bridge }]);
  for (const call of f.calls) {
    assert.deepEqual(call.body.reference_images, [{ url: keyframe }]);
    assert.equal(call.body.generate_audio, false);
    assert.equal(call.body.model, 'grok-imagine-video-1.5');
  }
});

test('unsupported reference model, unsafe reference URL and reference prompt byte overflow stop before a paid fetch', async () => {
  const f = fixture();
  assert.throws(() => createPetXaiProvider(f.fetch, { model: 'grok-imagine-video-1.5-lite', referenceImageUrl: keyframe }), { code: 'PROVIDER_CONFIG' });
  assert.throws(() => createPetXaiProvider(f.fetch, { model: 'grok-imagine-video-1.5', referenceImageUrl: 'http://127.0.0.1/private.jpg' }));
  const provider = createPetXaiProvider(f.fetch, { model: 'grok-imagine-video-1.5', referenceImageUrl: keyframe, generateAudio: false });
  await assert.rejects(provider.startVideo('가'.repeat(1366), 15, keyframe), { code: 'PROVIDER_PROMPT_LENGTH' });
  assert.equal(f.calls.length, 0);
});

test('720p option reaches the classic video request with its exact prompt, duration and keyframe', async () => {
  const f = fixture();
  assert.deepEqual(await createPetXaiProvider(f.fetch, { resolution: '720p' }).startVideo('approved dance motion', 15, keyframe), { requestId: 'offline-video-1' });
  assert.deepEqual(f.calls, [{ url: 'https://api.x.ai/v1/videos/generations', method: 'POST', redirect: 'error', body: {
    model: 'grok-imagine-video', prompt: 'approved dance motion', duration: 15, aspect_ratio: '9:16', resolution: '720p', image: { url: keyframe },
  } }]);
});

test('existing pet calls and empty options retain the classic 480p video default', async () => {
  const f = fixture();
  for (const options of [undefined, {}, { resolution: '480p' }]) {
    await createPetXaiProvider(f.fetch, options).startVideo('approved pet motion', 15, keyframe);
  }
  assert.equal(f.calls.length, 3);
  for (const call of f.calls) assert.deepEqual(call.body, {
    model: 'grok-imagine-video', prompt: 'approved pet motion', duration: 15, aspect_ratio: '9:16', resolution: '480p', image: { url: keyframe },
  });
});

test('each explicit model uses the same approved image-to-video shape at 720p', async () => {
  const f = fixture();
  for (const model of ['grok-imagine-video', 'grok-imagine-video-1.5', 'grok-imagine-video-1.5-lite']) {
    assert.deepEqual(await createPetXaiProvider(f.fetch, { model, resolution: '720p' }).startVideo('approved dance motion', 15, keyframe), { requestId: 'offline-video-1' });
    assert.deepEqual(f.calls.at(-1), { url: 'https://api.x.ai/v1/videos/generations', method: 'POST', redirect: 'error', body: {
      model, prompt: 'approved dance motion', duration: 15, aspect_ratio: '9:16', resolution: '720p', image: { url: keyframe },
    } });
  }
  assert.equal(f.calls.length, 3);
  assert.deepEqual(PET_XAI_VIDEO_MODELS, ['grok-imagine-video', 'grok-imagine-video-1.5', 'grok-imagine-video-1.5-lite']);
});

test('choosing a new model alone retains the 480p resolution default', async () => {
  const f = fixture();
  for (const model of ['grok-imagine-video-1.5', 'grok-imagine-video-1.5-lite']) {
    await createPetXaiProvider(f.fetch, { model }).startVideo('approved dance motion', 15, keyframe);
    assert.deepEqual(f.calls.at(-1).body, {
      model, prompt: 'approved dance motion', duration: 15, aspect_ratio: '9:16', resolution: '480p', image: { url: keyframe },
    });
  }
});

test('video model and resolution options leave image generation and reference editing requests unchanged', async () => {
  const f = fixture();
  for (const options of [undefined, { resolution: '720p' }, { model: 'grok-imagine-video-1.5', resolution: '720p' }, { model: 'grok-imagine-video-1.5-lite', resolution: '720p' }]) {
    const provider = createPetXaiProvider(f.fetch, options);
    assert.deepEqual(await provider.generateImage('approved opening'), { url: 'https://images.x.ai/offline-generated.png' });
    await provider.generateImage('approved referenced opening', keyframe);
  }
  assert.equal(f.calls.length, 8);
  for (const index of [2, 4, 6]) {
    assert.deepEqual(f.calls[0], f.calls[index]);
    assert.deepEqual(f.calls[1], f.calls[index + 1]);
  }
  assert.equal(f.calls[0].url, 'https://api.x.ai/v1/images/generations');
  assert.deepEqual(f.calls[0].body, { model: 'grok-imagine-image', prompt: 'approved opening', n: 1, aspect_ratio: '9:16', response_format: 'url' });
  assert.equal(f.calls[1].url, 'https://api.x.ai/v1/images/edits');
  assert.deepEqual(f.calls[1].body, { model: 'grok-imagine-image', prompt: 'approved referenced opening', n: 1, aspect_ratio: '9:16', response_format: 'url', image: { url: keyframe, type: 'image_url' } });
});

test('unsupported video resolutions fail during configuration before fetch can run', () => {
  const f = fixture();
  for (const resolution of ['1080p', '720P', '', null, false, 720, {}]) {
    assert.throws(() => createPetXaiProvider(f.fetch, { resolution }), { code: 'PROVIDER_CONFIG', status: 503 });
  }
  assert.equal(f.calls.length, 0);
});

test('unsupported or malformed video models fail during configuration before fetch can run', () => {
  const f = fixture();
  for (const model of ['grok-imagine-video-latest', 'grok-imagine-video-1.5-preview', 'grok-imagine-video-2', 'GROK-IMAGINE-VIDEO', '', null, false, 1.5, {}]) {
    assert.throws(() => createPetXaiProvider(f.fetch, { model, resolution: '720p' }), { code: 'PROVIDER_CONFIG', status: 503 });
  }
  assert.equal(f.calls.length, 0);
});

test('all selected models retain the 4096-character cap before any paid request', async () => {
  const f = fixture();
  for (const model of PET_XAI_VIDEO_MODELS) {
    const provider = createPetXaiProvider(f.fetch, { model, resolution: '720p' });
    for (const prompt of ['', '   ', 'x'.repeat(4097)]) {
      await assert.rejects(provider.startVideo(prompt, 15, keyframe), { code: 'PROVIDER_PROMPT_LENGTH', status: 422 });
    }
  }
  assert.equal(f.calls.length, 0);
  await createPetXaiProvider(f.fetch, { model: 'grok-imagine-video-1.5' }).startVideo('x'.repeat(4096), 15, keyframe);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.prompt.length, 4096);
});

test('model selection retains the trusted image URL requirement before fetch', async () => {
  const f = fixture();
  for (const model of PET_XAI_VIDEO_MODELS) {
    const provider = createPetXaiProvider(f.fetch, { model });
    for (const url of ['http://images.x.ai/keyframe.png', 'https://outside.example/keyframe.png', 'https://x.ai.outside.example/keyframe.png', 'https://user:password@images.x.ai/keyframe.png']) {
      await assert.rejects(provider.startVideo('approved motion', 15, url), { code: 'MEDIA_HOST' });
    }
  }
  assert.equal(f.calls.length, 0);
});

test('selected models preserve one submission attempt and redact provider error bodies', async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: 'offline-private-marker in reflected prompt' }), { status: 429 });
  };
  const provider = createPetXaiProvider(fetch, { model: 'grok-imagine-video-1.5', resolution: '720p' });
  await assert.rejects(provider.startVideo('approved motion', 15, keyframe), error => error.code === 'PROVIDER_HTTP' && !error.message.includes('offline-private-marker'));
  assert.equal(calls, 1);
});
