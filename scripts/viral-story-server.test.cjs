/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loader(overrides = {}, env = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name]
      : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`)
      : name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', js)(localRequire, mod, mod.exports, { env }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}
const cheapImports = { './petRenderer': {}, '../dance/renderVideo': {} };
const { createViralStoryProvider, createViralStoryStore } = loader(cheapImports)('src/lib/video/viralStoryServer.ts');
const USER = 'a0000000-0000-4000-8000-000000000001', TRACK = 'a0000000-0000-4000-8000-000000000002', JOB = 'a0000000-0000-4000-8000-000000000003';
test('provider keeps classic model, two15s calls and every silent flag; only C2 adds image', async () => {
  const calls = []; const provider = createViralStoryProvider(async (url, init) => { calls.push({ url, method: init.method, body: JSON.parse(init.body), redirect: init.redirect });
    return new Response(JSON.stringify({ request_id: `clip-${calls.length}` })); }, { apiKey: 'fake-test-key' });
  await provider.startVideo('first setup'); await provider.startVideo('same story continuation', 'https://assets.x.ai/final-frame.jpg');
  for (const call of calls) {
    assert.equal(call.url, 'https://api.x.ai/v1/videos/generations'); assert.equal(call.redirect, 'error');
    assert.equal(call.body.model, 'grok-imagine-video'); assert.equal(call.body.duration, 15); assert.equal(call.body.aspect_ratio, '9:16');
    assert.deepEqual(['watermark', 'silent', 'audio', 'sound', 'voice'].map(key => call.body[key]), [false, true, false, false, false]);
    assert.equal(call.body.resolution, undefined); assert.equal(call.body.reference_images, undefined);
  }
  assert.equal(calls[0].body.image, undefined); assert.deepEqual(calls[1].body.image, { url: 'https://assets.x.ai/final-frame.jpg' });
  assert.equal(calls.length, 2);
});
test('provider accepts deployed ID aliases and done URL shapes while retaining known IDs over malformed result URLs', async () => {
  for (const idField of ['request_id', 'id', 'task_id']) {
    const calls = []; const provider = createViralStoryProvider(async (url, init) => { calls.push(init.method);
      return new Response(JSON.stringify(init.method === 'POST' ? { [idField]: 'known-id', video: { url: 'invalid' } }
        : { state: 'completed', result: { url: 'https://assets.x.ai/result.mp4' } })); }, { apiKey: 'fake' });
    assert.deepEqual(await provider.startVideo('first'), { requestId: 'known-id' });
    assert.deepEqual(await provider.pollVideo('known-id'), { status: 'done', url: 'https://assets.x.ai/result.mp4' });
    assert.deepEqual(calls, ['POST', 'GET']);
  }
});
test('provider rejects oversize prompts before POST and all unknown submit shapes without reflecting payloads', async () => {
  let calls = 0; const provider = createViralStoryProvider(async () => { calls++; return new Response('private reflected prompt or body', { status: 502 }); }, { apiKey: 'fake' });
  await assert.rejects(provider.startVideo('한'.repeat(1400)), { code: 'PROMPT_LENGTH' }); assert.equal(calls, 0);
  const error = await provider.startVideo('small').catch(error => error); assert.equal(error.code, 'UNKNOWN_SUBMISSION'); assert.doesNotMatch(error.message, /private reflected/);
  for (const value of ['not JSON', '{}', JSON.stringify({ request_id: '../bad-id' }), 'x'.repeat(140000)]) {
    const p = createViralStoryProvider(async () => new Response(value), { apiKey: 'fake' });
    await assert.rejects(p.startVideo('small')); // Pipeline treats every thrown submit outcome as unknown.
  }
});
test('direct URL response works and terminal/moderation states never become successful poll outputs', async () => {
  const direct = createViralStoryProvider(async () => new Response(JSON.stringify({ data: [{ url: 'https://assets.x.ai/direct.mp4' }] })), { apiKey: 'fake' });
  assert.deepEqual(await direct.startVideo('small'), { url: 'https://assets.x.ai/direct.mp4' });
  for (const result of [{ status: 'failed' }, { state: 'error' }, { status: 'expired' }, { status: 'done', video: { url: 'https://assets.x.ai/blocked.mp4', respect_moderation: false } }]) {
    const p = createViralStoryProvider(async () => new Response(JSON.stringify(result)), { apiKey: 'fake' });
    assert.equal(['failed', 'expired'].includes((await p.pollVideo('known')).status), true);
  }
});
test('metadata CAS sends exact original text through deployed owner/status RPC and preserves unrelated metadata', async () => {
  const previous = { id: TRACK, userId: USER, status: 'completed', audioUrl: 'https://assets.x.ai/song.mp3',
    licenseHash: '{ "genCategory": "history", "keep": {"original": true} }', metadata: { genCategory: 'history', keep: { original: true } } };
  const calls = [];
  const store = createViralStoryStore({ rpc(name, args) { calls.push({ name, args }); return { abortSignal() { return this; }, async maybeSingle() {
    return { data: { id: TRACK, user_id: USER, status: 'completed', audio_url: previous.audioUrl, license_hash: args.p_next_license_hash }, error: null }; } }; } });
  const next = { status: 'completed', final: { url: 'https://assets.x.ai/final.mp4' } }; const saved = await store.compareAndSwap(previous, next);
  const call = calls[0]; assert.equal(call.name, 'compare_and_swap_dance_generation'); assert.equal(call.args.p_expected_license_hash, previous.licenseHash);
  assert.equal(call.args.p_track_id, TRACK); assert.equal(call.args.p_user_id, USER); assert.equal(call.args.p_final_title, null); assert.equal(call.args.p_final_cover_art_url, null);
  assert.equal(saved.metadata.keep.original, true); assert.equal(saved.metadata.genCategory, 'history'); assert.equal(saved.metadata.video_url, next.final.url);
  assert.equal(saved.metadata.grok_video_url, next.final.url); assert.equal(saved.audioUrl, previous.audioUrl);
});
test('audio archive and bridge/render helpers use original bytes, decoded final frame, silent concat and verified legacy mux', async () => {
  const crypto = require('node:crypto'); const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const originalAudio = Buffer.from('fake-original-audio-bytes'), clip1 = Buffer.from('fake-clip-one'), clip2 = Buffer.from('fake-clip-two');
  const files = new Map(); const uploads = [], operations = []; const storageOrigin = 'https://storage.example.test';
  let record = { id: TRACK, user_id: USER, status: 'completed', audio_url: 'https://assets.x.ai/original.mp3', license_hash: JSON.stringify({ genCategory: 'drama' }) };
  files.set(record.audio_url, { buffer: originalAudio, contentType: 'audio/mpeg' });
  const media = {
    assertPetMediaUrl: value => new URL(value),
    async downloadPetMedia(value) { const found = files.get(value); if (!found) throw Error('unavailable fake asset'); return found; },
    async readPetBoundedBody(response, max) { const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > max) throw Error('size'); return bytes; },
  };
  const render = {
    assertDanceClipDuration: seconds => assert.equal(seconds, 15),
    async extractDanceFinalFrame(_binary, inputFile, outputFile) { operations.push('decoded-final-frame'); assert.deepEqual(await fs.promises.readFile(inputFile), clip1); await fs.promises.writeFile(outputFile, Buffer.from('fake-final-decoded-frame')); },
    async concatDanceClips(_binary, clipFiles, outputFile) { operations.push('silent-concat'); assert.deepEqual(await fs.promises.readFile(clipFiles[0]), clip1); assert.deepEqual(await fs.promises.readFile(clipFiles[1]), clip2); await fs.promises.writeFile(outputFile, Buffer.from('fake-silent-video')); },
  };
  const legacy = loader()('src/lib/video/legacyShortExport.ts');
  const { createViralStoryServerService } = loader({ './petMedia': media, './petRenderer': {
    preflightPetRenderer: async () => ({ binary: 'fake-no-process-binary' }), probePetMediaSeconds: async () => 15,
  }, '../dance/renderVideo': render, './legacyShortExport': { ...legacy,
    async validateLegacyShortAudio(_binary, filename) { operations.push('audio-validation'); assert.deepEqual(await fs.promises.readFile(filename), originalAudio); return 29.8; },
    async muxLegacyShortVideo(_binary, _videoFile, audioFile, outputFile) { operations.push('verified-original-audio-mux'); assert.deepEqual(await fs.promises.readFile(audioFile), originalAudio); await fs.promises.writeFile(outputFile, Buffer.from('fake-verified-final')); return 30; },
  } }, { NEXT_PUBLIC_SUPABASE_URL: storageOrigin, XAI_API_KEY: 'fake' })('src/lib/video/viralStoryServer.ts');
  const admin = { from() { return { select() { return this; }, eq() { return this; }, abortSignal() { return this; }, async maybeSingle() { return { data: structuredClone(record), error: null }; } }; },
    rpc(_name, args) { return { abortSignal() { return this; }, async maybeSingle() { if (record.license_hash !== args.p_expected_license_hash) return { data: null, error: null }; record.license_hash = args.p_next_license_hash; return { data: structuredClone(record), error: null }; } }; },
    storage: { from() { return { async upload(filename, bytes, options) { uploads.push({ filename, bytes: Buffer.from(bytes), options }); files.set(`${storageOrigin}/storage/v1/object/public/melodio-assets/${filename}`, { buffer: bytes, contentType: options.contentType }); return { error: null }; },
      getPublicUrl(filename) { return { data: { publicUrl: `${storageOrigin}/storage/v1/object/public/melodio-assets/${filename}` } }; } }; } } };
  const service = createViralStoryServerService(admin, USER); await service.create(USER, TRACK, JOB, { prompt: 'one original simple story', category: 'drama', allowDance: false, cutCadenceSeconds: 1.5 });
  const audioJob = await service.advance(USER, TRACK, JOB); assert.equal(audioJob.status, 'clip1'); assert.deepEqual(uploads[0].bytes, originalAudio);
  let job = JSON.parse(record.license_hash).viralVideoJob;
  const clipUrl = index => `${storageOrigin}/storage/v1/object/public/melodio-assets/viral_story/${USER}/${TRACK}/${JOB}/clip${index}.mp4`;
  files.set(clipUrl(1), { buffer: clip1, contentType: 'video/mp4' }); files.set(clipUrl(2), { buffer: clip2, contentType: 'video/mp4' });
  job.clips[0] = { status: 'ready', submittedAt: job.updatedAt, requestId: 'one', asset: { url: clipUrl(1), hash: digest(clip1), durationSeconds: 15 } };
  job.status = 'bridge'; record.license_hash = JSON.stringify({ genCategory: 'drama', viralVideoJob: job });
  await service.advance(USER, TRACK, JOB); job = JSON.parse(record.license_hash).viralVideoJob;
  assert.equal(job.bridge.hash, digest(Buffer.from('fake-final-decoded-frame'))); assert.match(job.bridge.url, /bridge-/);
  job.clips[1] = { status: 'ready', submittedAt: job.updatedAt, requestId: 'two', asset: { url: clipUrl(2), hash: digest(clip2), durationSeconds: 15 } };
  job.status = 'render'; record.license_hash = JSON.stringify({ genCategory: 'drama', viralVideoJob: job });
  const result = await service.advance(USER, TRACK, JOB); assert.equal(result.status, 'completed'); assert.equal(result.durationSeconds, 30);
  assert.deepEqual(operations, ['audio-validation', 'decoded-final-frame', 'audio-validation', 'silent-concat', 'verified-original-audio-mux']);
  assert.equal(JSON.parse(record.license_hash).video_url, result.videoUrl);
  assert.equal(uploads.length, 3); assert.equal(record.audio_url, 'https://assets.x.ai/original.mp3');
});
