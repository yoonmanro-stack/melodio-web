'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createKieTask, pollKieTask, generateRainAudio, downloadAsset } = require('./healing-rain-provider');
const apiKey = 'offline-fixture';
const goodUrl = 'https://tempfile.aiquickdraw.com/healing-rain.mp4';
const ok = data => new Response(JSON.stringify({ code: 200, data }));
const matches = (code, ambiguous) => e => e.code === code && e.message === code && (ambiguous === undefined || e.ambiguous === ambiguous);
async function temp(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'healing-rain-provider-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('KIE forwards exact single-shot request once and returns only task ID', async t => {
  const input = { prompt: 'Fixed sleeper cabin, downward rain.', image_urls: [goodUrl, goodUrl], duration: '11', mode: 'std', sound: false, multi_shots: false, aspect_ratio: '16:9' };
  const stub = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.kie.ai/api/v1/jobs/createTask');
    assert.equal(init.headers.Authorization, `Bearer ${apiKey}`);
    assert.equal(init.redirect, 'manual');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { model: 'kling-3.0/video', input });
    return ok({ taskId: 'task_123', privateBody: 'never-return' });
  });
  assert.deepEqual(await createKieTask({ apiKey, model: 'kling-3.0/video', input }), { taskId: 'task_123' });
  assert.equal(stub.mock.callCount(), 1);
});

test('image request uses the unified endpoint and documented Nano Banana shape', async t => {
  const input = { prompt: 'Sleeper train cabin', image_input: [], aspect_ratio: '16:9', resolution: '2K', output_format: 'png' };
  t.mock.method(globalThis, 'fetch', async (_, init) => {
    assert.deepEqual(JSON.parse(init.body), { model: 'nano-banana-pro', input });
    return ok({ taskId: 'image_1' });
  });
  await createKieTask({ apiKey, model: 'nano-banana-pro', input });
});

test('ambiguous paid POST never retries or leaks raw transport error', async t => {
  const stub = t.mock.method(globalThis, 'fetch', async () => { throw new Error('secret-key provider raw body https://private.invalid'); });
  await assert.rejects(createKieTask({ apiKey, model: 'kling-3.0/video', input: {} }), matches('PROVIDER_TRANSPORT_FAILED', true));
  assert.equal(stub.mock.callCount(), 1);
});

test('known rejection is distinct from ambiguous malformed or server responses', async t => {
  for (const [response, code, ambiguous] of [
    [new Response('secret', { status: 422 }), 'PROVIDER_HTTP_422', false],
    [new Response('secret', { status: 503 }), 'PROVIDER_HTTP_503', true],
    [new Response('<html>private provider error</html>'), 'INVALID_PROVIDER_RESPONSE', true],
    [ok({}), 'TASK_ID_MISSING_OR_INVALID', true],
    [new Response(JSON.stringify({ code: 402, msg: 'private account detail' })), 'PROVIDER_API_402', false],
  ]) {
    const stub = t.mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(createKieTask({ apiKey, model: 'kling-3.0/video', input: {} }), matches(code, ambiguous));
    assert.equal(stub.mock.callCount(), 1);
    stub.mock.restore();
  }
});

test('request and response bodies are bounded at 128 KiB', async t => {
  const stub = t.mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(128 * 1024 + 1)));
  await assert.rejects(createKieTask({ apiKey, model: 'nano-banana-pro', input: { prompt: 'x'.repeat(128 * 1024) } }), matches('REQUEST_TOO_LARGE', false));
  assert.equal(stub.mock.callCount(), 0);
  await assert.rejects(createKieTask({ apiKey, model: 'nano-banana-pro', input: {} }), matches('RESPONSE_TOO_LARGE', true));
  assert.equal(stub.mock.callCount(), 1);
});

test('polling maps compact states, real credits and safe private-worker URLs', async t => {
  const responses = [ok({ state: 'generating' }), ok({ state: 'success', creditsConsumed: '154', resultJson: JSON.stringify({ resultUrls: [goodUrl] }) }), ok({ state: 'fail', failCode: 'REJECTED', failMsg: 'private details' })];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_1');
    assert.equal(init.method, 'GET');
    return responses.shift();
  });
  assert.deepEqual(await pollKieTask({ taskId: 'task_1', apiKey }), { taskId: 'task_1', urls: [], creditsConsumed: null, state: 'pending' });
  assert.deepEqual(await pollKieTask({ taskId: 'task_1', apiKey }), { taskId: 'task_1', urls: [goodUrl], creditsConsumed: 154, state: 'ready' });
  assert.deepEqual(await pollKieTask({ taskId: 'task_1', apiKey }), { taskId: 'task_1', urls: [], creditsConsumed: null, state: 'failed', errorCode: 'REJECTED' });
});

test('polling rejects unknown states, malformed results and unapproved hosts', async t => {
  for (const [data, code] of [
    [{ state: 'surprise' }, 'INVALID_PROVIDER_STATE'],
    [{ state: 'success', resultJson: 'secret' }, 'INVALID_PROVIDER_RESULT'],
    [{ state: 'success', resultJson: '{"resultUrls":[]}' }, 'MISSING_PROVIDER_ASSET'],
    [{ state: 'success', resultJson: '{"resultUrls":["https://localhost/a"]}' }, 'UNSAFE_ASSET_URL'],
  ]) {
    const stub = t.mock.method(globalThis, 'fetch', async () => ok(data));
    await assert.rejects(pollKieTask({ apiKey, taskId: 'task_1' }), matches(code, false));
    stub.mock.restore();
  }
});

test('audio uses v2 30s looping, captures actual billing headers and atomically completes', async t => {
  const dir = await temp(t); const outputPath = path.join(dir, 'audio.mp3');
  const stub = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128');
    assert.equal(init.headers['xi-api-key'], apiKey);
    assert.equal(init.redirect, 'manual');
    assert.deepEqual(JSON.parse(init.body), { text: 'Gentle steady train-window rain.', duration_seconds: 30, loop: true, prompt_influence: 0.4, model_id: 'eleven_text_to_sound_v2' });
    await assert.rejects(fs.stat(outputPath), { code: 'ENOENT' });
    assert.ok(await fs.stat(`${outputPath}.partial`));
    return new Response(Buffer.from('ID3audio'), { headers: { 'content-type': 'audio/mpeg', 'character-cost': '300', 'request-id': 'req_test' } });
  });
  assert.deepEqual(await generateRainAudio({ apiKey, prompt: 'Gentle steady train-window rain.', outputPath }), { requestId: 'req_test', creditsConsumed: 300, durationSeconds: 30, mimeType: 'audio/mpeg', bytes: 8 });
  assert.equal(await fs.readFile(outputPath, 'utf8'), 'ID3audio');
  await assert.rejects(fs.stat(`${outputPath}.partial`), { code: 'ENOENT' });
  await assert.rejects(generateRainAudio({ apiKey, prompt: 'rain', outputPath }), matches('OUTPUT_ALREADY_EXISTS', true));
  assert.equal(stub.mock.callCount(), 1);
});

test('audio enforces 450 characters before opening files or charging', async t => {
  const dir = await temp(t);
  const stub = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not call'); });
  await assert.rejects(generateRainAudio({ apiKey, prompt: 'x'.repeat(451), outputPath: path.join(dir, 'audio.mp3') }), matches('INVALID_AUDIO_PROMPT', false));
  assert.deepEqual(await fs.readdir(dir), []);
  assert.equal(stub.mock.callCount(), 0);
});

test('audio timeout preserves submission evidence and prevents automatic resubmission', async t => {
  const dir = await temp(t); const outputPath = path.join(dir, 'audio.mp3');
  const stub = t.mock.method(globalThis, 'fetch', async () => { throw new Error('private timeout detail'); });
  await assert.rejects(generateRainAudio({ apiKey, prompt: 'rain', outputPath }), matches('AUDIO_TRANSFER_FAILED', true));
  await assert.rejects(generateRainAudio({ apiKey, prompt: 'rain', outputPath }), matches('PARTIAL_OUTPUT_EXISTS', true));
  assert.equal(stub.mock.callCount(), 1);
  assert.ok(await fs.stat(`${outputPath}.partial`));
  await assert.rejects(fs.stat(outputPath), { code: 'ENOENT' });
});

test('interrupted paid audio stream retains partial data and stays ambiguous', async t => {
  const dir = await temp(t); const outputPath = path.join(dir, 'audio.mp3');
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ pull(controller) {
    if (reads++ === 0) controller.enqueue(Buffer.from('ID3partial'));
    else controller.error(new Error('private transport info'));
  } }), { headers: { 'content-type': 'audio/mpeg' } }));
  await assert.rejects(generateRainAudio({ apiKey, prompt: 'rain', outputPath }), matches('AUDIO_TRANSFER_FAILED', true));
  assert.equal(await fs.readFile(`${outputPath}.partial`, 'utf8'), 'ID3partial');
  await assert.rejects(fs.stat(outputPath), { code: 'ENOENT' });
});

test('paid audio rejects oversized declared output without buffering it', async t => {
  const dir = await temp(t); const outputPath = path.join(dir, 'audio.mp3');
  t.mock.method(globalThis, 'fetch', async () => new Response('x', { headers: { 'content-type': 'audio/mpeg', 'content-length': String(10 * 1024 * 1024 + 1) } }));
  await assert.rejects(generateRainAudio({ apiKey, prompt: 'rain', outputPath }), matches('ASSET_TOO_LARGE', true));
  assert.equal((await fs.stat(`${outputPath}.partial`)).size, 0);
});

test('asset URLs reject credentials, private IPs, deceptive domains and HTTP before fetching', async t => {
  const dir = await temp(t);
  const stub = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch'); });
  for (const url of ['http://tempfile.aiquickdraw.com/a', 'https://u:p@tempfile.aiquickdraw.com/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://10.0.0.1/a', 'https://[::1]/a', 'https://tempfile.aiquickdraw.com.evil.invalid/a', 'https://tempfile.aiquickdraw.com:8443/a']) {
    await assert.rejects(downloadAsset({ url, outputPath: path.join(dir, 'asset.mp4') }), matches('UNSAFE_ASSET_URL', false));
  }
  assert.equal(stub.mock.callCount(), 0);
});

test('asset redirects are individually allowlisted without forwarding API credentials', async t => {
  const dir = await temp(t); let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_, init) => {
    assert.equal(init.redirect, 'manual');
    assert.equal(init.headers, undefined);
    return ++calls === 1 ? new Response(null, { status: 302, headers: { location: 'https://tempfile.redpandaai.co/final.mp4' } })
      : new Response('video', { headers: { 'content-type': 'video/mp4' } });
  });
  const outputPath = path.join(dir, 'video.mp4');
  assert.deepEqual(await downloadAsset({ url: goodUrl, outputPath }), { bytes: 5, mimeType: 'video/mp4' });
  assert.equal(calls, 2);
  assert.equal(await fs.readFile(outputPath, 'utf8'), 'video');
});

test('redirect to a private address is refused before any second request', async t => {
  const dir = await temp(t);
  const stub = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }));
  await assert.rejects(downloadAsset({ url: goodUrl, outputPath: path.join(dir, 'video.mp4') }), matches('UNSAFE_ASSET_REDIRECT', false));
  assert.equal(stub.mock.callCount(), 1);
});

test('asset streaming enforces limits even without content-length', async t => {
  const dir = await temp(t); const outputPath = path.join(dir, 'video.mp4');
  t.mock.method(globalThis, 'fetch', async () => new Response('oversized', { headers: { 'content-type': 'video/mp4' } }));
  await assert.rejects(downloadAsset({ url: goodUrl, outputPath, maxBytes: 3 }), matches('ASSET_TOO_LARGE', false));
  await assert.rejects(fs.stat(outputPath), { code: 'ENOENT' });
  assert.equal((await fs.stat(`${outputPath}.partial`)).size, 0);
});

test('image MIME applies 10 MiB cap even with a video filename and 100 MiB caller limit', async t => {
  const dir = await temp(t);
  t.mock.method(globalThis, 'fetch', async () => new Response('x', { headers: { 'content-type': 'image/png', 'content-length': String(10 * 1024 * 1024 + 1) } }));
  await assert.rejects(downloadAsset({ url: goodUrl, outputPath: path.join(dir, 'video.mp4') }), matches('ASSET_TOO_LARGE', false));
});
