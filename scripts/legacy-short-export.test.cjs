/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline contracts and synthetic media only. No provider, database, storage, or real environment calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const ts = require('typescript');
const ffmpeg = require('ffmpeg-static');
const run = promisify(execFile);
const root = path.resolve(__dirname, '..');

function load(relative, overrides = {}, fetchOverride) {
  const source = ts.transpileModule(syncFs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'fetch', source)(
    name => name in overrides ? overrides[name] : require(name), mod, mod.exports,
    { env: { XAI_API_KEY: 'offline-fixture', XAI_API_BASE: 'https://fixture.invalid' } },
    fetchOverride || (() => { throw Error('NETWORK_FORBIDDEN'); }),
  );
  return mod.exports;
}
const helper = load('src/lib/video/legacyShortExport.ts');

function route(relative, overrides = {}, fetchOverride) {
  return load(relative, {
    'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
    '@/lib/video/legacyShortExport': helper,
    '@/lib/video/fitVideoToAudio': {},
    ...overrides,
  }, fetchOverride);
}
const request = body => ({ json: async () => body });

test('both routes reject missing audio before any provider, media, or storage work', async () => {
  let calls = 0;
  for (const relative of ['src/app/api/viral-cf/grok-video/route.ts', 'src/app/api/viral-cf/grok-video/merge/route.ts']) {
    const result = await route(relative, {}, () => { calls++; throw Error('NETWORK_FORBIDDEN'); })
      .POST(request({ prompt: 'One physical action', videoUrls: ['https://fixture.invalid/clip'] }));
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'AUDIO_REQUIRED');
    assert.equal(result.body.videoUrl, undefined);
  }
  assert.equal(calls, 0);
});

test('single-clip merge failure is an error and common provider prompts prohibit subtitles', async () => {
  const prompts = [];
  const fakeFs = { existsSync: () => true, promises: {
    mkdtemp: async () => '/private/tmp/offline-route-fixture', writeFile: async () => {}, rm: async () => {}, unlink: async () => {},
  } };
  const api = route('src/app/api/viral-cf/grok-video/route.ts', {
    fs: fakeFs,
    'child_process': { exec: (_command, callback) => callback(null, '', '') },
    '@/lib/video/fitVideoToAudio': { planFit: () => ({}), buildFitCommand: () => 'fixture-fit', probeDurationSeconds: async () => 30 },
    '@/lib/video/legacyShortExport': { ...helper, validateLegacyShortAudio: async () => 26, muxLegacyShortVideo: async () => { throw Error('offline-mux-failure'); } },
  }, async (url, options) => {
    if (url.endsWith('/videos/generations')) {
      prompts.push(JSON.parse(options.body).prompt);
      return { ok: true, text: async () => JSON.stringify({ url: 'https://fixture.invalid/clip' }) };
    }
    if (url.includes('/merge')) return { ok: false };
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  });
  const result = await api.POST(request({ prompt: 'One physical action', audioUrl: 'https://fixture.invalid/audio', generate30SecFull: false }));
  assert.equal(result.status, 500);
  assert.equal(result.body.success, false);
  assert.equal(result.body.videoUrl, undefined);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /NO KOREAN OR ENGLISH SUBTITLES/);
});

test('proxy duration claims cannot bypass output verification', async () => {
  await assert.rejects(helper.validateLegacyShortProxyOutput(ffmpeg, 'https://fixture.invalid/video', 26), error => error.code === 'FINAL_DURATION');
});

test('30s MP4 preserves original audio once, pads silence, rejects vocals after 30s and missing streams', { skip: !ffmpeg || !syncFs.existsSync(ffmpeg) }, async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-short-test-'));
  const file = name => path.join(temp, name);
  const createAudio = async (name, seconds) => run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(seconds), '-c:a', 'pcm_s16le', file(name)], { timeout: 20_000, maxBuffer: 128 * 1024 });
  try {
    await run(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x284:r=30', '-t', '30', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file('video.mp4')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    await createAudio('source.wav', 26);
    assert.equal(await helper.muxLegacyShortVideo(ffmpeg, file('video.mp4'), file('source.wav'), file('final.mp4')), 30);
    assert.equal(await helper.validateLegacyShortOutput(ffmpeg, file('final.mp4')), 30);
    const videoChecksums = async filename => (await run(ffmpeg, ['-v', 'error', '-i', filename, '-map', '0:v:0', '-an', '-f', 'framemd5', '-'], { timeout: 20_000, maxBuffer: 128 * 1024 })).stdout.split('\n').filter(line => /^0,/.test(line));
    assert.deepEqual(await videoChecksums(file('final.mp4')), await videoChecksums(file('video.mp4')), 'Every video frame stays unchanged; no caption pixels are burned in');
    const decode = async (filename, seek = '0', seconds = '26') => (await run(ffmpeg, ['-v', 'error', '-i', filename, '-ss', seek, '-t', seconds, '-map', '0:a:0', '-ar', '48000', '-ac', '1', '-f', 'f32le', '-'], { timeout: 20_000, encoding: 'buffer', maxBuffer: 6 * 1024 * 1024 })).stdout;
    const original = await decode(file('source.wav'));
    const rendered = await decode(file('final.mp4'));
    assert.equal(rendered.length, original.length);
    let errorEnergy = 0; let sourceEnergy = 0;
    for (let offset = 0; offset + 4 <= original.length; offset += 4) {
      const a = original.readFloatLE(offset); const b = rendered.readFloatLE(offset);
      errorEnergy += (a - b) ** 2; sourceEnergy += a ** 2;
    }
    assert.ok(errorEnergy / sourceEnergy < 0.005, 'Audio samples retain their original timeline through AAC encoding');
    const tail = await decode(file('final.mp4'), '27', '3');
    let tailPeak = 0;
    for (let offset = 0; offset + 4 <= tail.length; offset += 4) tailPeak = Math.max(tailPeak, Math.abs(tail.readFloatLE(offset)));
    assert.ok(tailPeak < 0.0001, 'Quiet tail is silence, never repeated music');
    await createAudio('long.wav', 30.2);
    await assert.rejects(helper.validateLegacyShortAudio(ffmpeg, file('long.wav')), error => error.code === 'AUDIO_DURATION');
    await createAudio('audible-overhang.wav', 30.1);
    await assert.rejects(helper.validateLegacyShortAudio(ffmpeg, file('audible-overhang.wav')), error => error.code === 'AUDIO_DURATION');
    await run(ffmpeg, ['-v', 'error', '-y', '-i', file('source.wav'), '-af', 'apad=whole_dur=30.1', '-t', '30.1', '-c:a', 'pcm_s16le', file('silent-overhang.wav')], { timeout: 20_000, maxBuffer: 128 * 1024 });
    assert.ok((await helper.validateLegacyShortAudio(ffmpeg, file('silent-overhang.wav'))) <= 30.15);
    await assert.rejects(helper.validateLegacyShortOutput(ffmpeg, file('video.mp4')), error => error.code === 'MEDIA_PROBE');
    await assert.rejects(helper.validateLegacyShortOutput(ffmpeg, file('source.wav')), error => error.code === 'MEDIA_PROBE');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
