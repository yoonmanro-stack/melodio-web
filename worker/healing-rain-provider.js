'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

// Contracts checked 2026-10-12: docs.kie.ai/market/kling/kling-3-0,
// docs.kie.ai/market/google/pro-image-to-image, and
// elevenlabs.io/docs/api-reference/text-to-sound-effects/convert.
const KIE_ORIGIN = 'https://api.kie.ai';
const AUDIO_ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
const MAX_JSON_BYTES = 128 * 1024;
const SMALL_ASSET_BYTES = 10 * 1024 * 1024;
const VIDEO_BYTES = 100 * 1024 * 1024;
// Exact hosts observed in successful Healing Rain receipts; never accept suffix matches.
const ASSET_HOSTS = new Set(['tempfile.aiquickdraw.com', 'tempfile.redpandaai.co']);

class ProviderError extends Error {
  constructor(code, ambiguous = false) {
    super(code);
    this.name = 'HealingRainProviderError';
    this.code = code;
    this.ambiguous = ambiguous;
  }
}

function error(code, ambiguous = false) { return new ProviderError(code, ambiguous); }
function sanitizeFailure(cause, fallback, ambiguous = false) {
  if (cause instanceof ProviderError) return cause;
  return error(fallback, ambiguous);
}
function credential(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192 || /[\r\n]/.test(value)) {
    throw error('MISSING_OR_INVALID_API_KEY');
  }
  return value.trim();
}
function jsonBody(value) {
  let body;
  try { body = JSON.stringify(value); } catch { throw error('INVALID_REQUEST'); }
  if (!body || Buffer.byteLength(body) > MAX_JSON_BYTES) throw error('REQUEST_TOO_LARGE');
  return body;
}
function taskReference(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw error('INVALID_TASK_ID');
  return value;
}
function cost(value) {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
function assetUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw error('UNSAFE_ASSET_URL'); }
  // An exact public-provider allowlist also excludes localhost, IP literals, and private ranges.
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
    || !ASSET_HOSTS.has(url.hostname) || String(value).length > 4096) throw error('UNSAFE_ASSET_URL');
  return url.href;
}
async function cancel(response) {
  try { await response?.body?.cancel(); } catch { /* Best-effort transport cleanup. */ }
}
function declaredLength(response) {
  const value = response.headers.get('content-length');
  if (value == null) return null;
  return /^\d+$/.test(value) ? Number(value) : null;
}
async function boundedJson(response) {
  if (declaredLength(response) > MAX_JSON_BYTES) {
    await cancel(response);
    throw error('RESPONSE_TOO_LARGE');
  }
  const chunks = [];
  let size = 0;
  try {
    if (!response.body) throw error('INVALID_PROVIDER_RESPONSE');
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_JSON_BYTES) throw error('RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(chunk));
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw error('INVALID_PROVIDER_RESPONSE');
    return value;
  } catch (cause) {
    throw sanitizeFailure(cause, 'INVALID_PROVIDER_RESPONSE');
  }
}
async function kieRequest(endpoint, { apiKey, body, submitting = false }) {
  const key = credential(apiKey);
  let response;
  try {
    response = await fetch(`${KIE_ORIGIN}${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body } : {}), redirect: 'manual', signal: AbortSignal.timeout(90_000),
    });
  } catch { throw error('PROVIDER_TRANSPORT_FAILED', submitting); }
  if (!response.ok) {
    await cancel(response);
    throw error(`PROVIDER_HTTP_${response.status}`, submitting && (response.status >= 500 || response.status === 408 || response.status < 400));
  }
  let result;
  try { result = await boundedJson(response); }
  catch (cause) { throw error(sanitizeFailure(cause, 'INVALID_PROVIDER_RESPONSE').code, submitting); }
  if (result.code !== 200) {
    const code = Number.isInteger(result.code) && result.code >= 100 && result.code <= 599 ? result.code : null;
    throw error(code ? `PROVIDER_API_${code}` : 'INVALID_PROVIDER_RESPONSE', submitting && (!code || code >= 500 || code === 408));
  }
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    throw error('INVALID_PROVIDER_RESPONSE', submitting);
  }
  return result.data;
}

/** Caller must persist a submission lock first. A paid POST is attempted exactly once. */
async function createKieTask({ model, input, apiKey }) {
  if (typeof model !== 'string' || !/^[A-Za-z0-9./_-]{1,120}$/.test(model)
    || !input || typeof input !== 'object' || Array.isArray(input)) throw error('INVALID_REQUEST');
  const data = await kieRequest('/api/v1/jobs/createTask', { apiKey, body: jsonBody({ model, input }), submitting: true });
  try { return { taskId: taskReference(data.taskId) }; }
  catch { throw error('TASK_ID_MISSING_OR_INVALID', true); }
}

async function pollKieTask({ taskId, apiKey }) {
  taskReference(taskId);
  const data = await kieRequest(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, { apiKey });
  const common = { taskId, urls: [], creditsConsumed: cost(data.creditsConsumed) };
  if (['waiting', 'queuing', 'generating', 'pending', 'processing'].includes(data.state)) return { ...common, state: 'pending' };
  if (['fail', 'failed'].includes(data.state)) {
    const errorCode = typeof data.failCode === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(data.failCode)
      ? data.failCode : 'PROVIDER_TASK_FAILED';
    return { ...common, state: 'failed', errorCode };
  }
  if (data.state !== 'success') throw error('INVALID_PROVIDER_STATE');
  let result;
  try { result = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : null; }
  catch { throw error('INVALID_PROVIDER_RESULT'); }
  if (!Array.isArray(result?.resultUrls) || !result.resultUrls.length || result.resultUrls.length > 8) {
    throw error('MISSING_PROVIDER_ASSET');
  }
  return { ...common, state: 'ready', urls: result.resultUrls.map(assetUrl) };
}

async function reserveOutput(outputPath) {
  if (typeof outputPath !== 'string' || !path.isAbsolute(outputPath) || outputPath.includes('\0')) throw error('INVALID_OUTPUT_PATH');
  try {
    await fs.lstat(outputPath);
    throw error('OUTPUT_ALREADY_EXISTS', true);
  } catch (cause) { if (cause.code !== 'ENOENT') throw sanitizeFailure(cause, 'OUTPUT_UNAVAILABLE'); }
  try { return await fs.open(`${outputPath}.partial`, 'wx', 0o600); }
  catch (cause) { throw error(cause.code === 'EEXIST' ? 'PARTIAL_OUTPUT_EXISTS' : 'OUTPUT_UNAVAILABLE', cause.code === 'EEXIST'); }
}
async function writeAsset(response, file, outputPath, maxBytes) {
  if (declaredLength(response) > maxBytes) { await cancel(response); throw error('ASSET_TOO_LARGE'); }
  let bytes = 0;
  if (!response.body) throw error('EMPTY_ASSET');
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw error('ASSET_TOO_LARGE');
    const buffer = Buffer.from(chunk);
    // FileHandle.write may write fewer bytes than requested.
    for (let offset = 0; offset < buffer.length;) {
      const result = await file.write(buffer, offset, buffer.length - offset);
      if (!result.bytesWritten) throw error('OUTPUT_WRITE_FAILED');
      offset += result.bytesWritten;
    }
  }
  if (!bytes) throw error('EMPTY_ASSET');
  await file.sync();
  await file.close();
  // The exclusive partial reserves this path for cooperating workers.
  try { await fs.lstat(outputPath); throw error('OUTPUT_ALREADY_EXISTS'); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  await fs.rename(`${outputPath}.partial`, outputPath);
  return bytes;
}
function responseId(response) {
  const value = response.headers.get('request-id') || response.headers.get('x-request-id') || response.headers.get('x-trace-id');
  return value && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : null;
}

async function generateRainAudio({ prompt, apiKey, outputPath }) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 450) throw error('INVALID_AUDIO_PROMPT');
  const key = credential(apiKey);
  const body = jsonBody({ text: prompt.trim(), duration_seconds: 30, loop: true, prompt_influence: 0.4, model_id: 'eleven_text_to_sound_v2' });
  const file = await reserveOutput(outputPath);
  let response;
  let attempted = false;
  try {
    attempted = true;
    response = await fetch(AUDIO_ENDPOINT, {
      method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body, redirect: 'manual', signal: AbortSignal.timeout(240_000),
    });
    if (!response.ok) {
      await cancel(response);
      throw error(`PROVIDER_HTTP_${response.status}`, response.status >= 500 || response.status === 408 || response.status < 400);
    }
    const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(mimeType)) throw error('INVALID_AUDIO_CONTENT_TYPE', true);
    const metadata = { requestId: responseId(response), creditsConsumed: cost(response.headers.get('character-cost')), durationSeconds: 30, mimeType };
    const bytes = await writeAsset(response, file, outputPath, SMALL_ASSET_BYTES);
    return { ...metadata, bytes };
  } catch (cause) {
    await file.close().catch(() => {});
    const failure = sanitizeFailure(cause, 'AUDIO_TRANSFER_FAILED', attempted);
    // Keep even an empty partial as durable evidence that the paid request was attempted.
    if (response?.ok) failure.ambiguous = true;
    throw failure;
  }
}

async function downloadAsset({ url, outputPath, maxBytes = VIDEO_BYTES }) {
  let currentUrl = assetUrl(url);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > VIDEO_BYTES) throw error('INVALID_ASSET_LIMIT');
  if (/\.(png|jpe?g|webp|gif|mp3|wav|m4a|aac)$/i.test(outputPath || '')) maxBytes = Math.min(maxBytes, SMALL_ASSET_BYTES);
  const file = await reserveOutput(outputPath);
  try {
    const signal = AbortSignal.timeout(120_000);
    for (let redirect = 0; redirect <= 3; redirect++) {
      const response = await fetch(currentUrl, { redirect: 'manual', signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await cancel(response);
        if (!location || redirect === 3) throw error('ASSET_REDIRECT_REJECTED');
        try { currentUrl = assetUrl(new URL(location, currentUrl).href); }
        catch { throw error('UNSAFE_ASSET_REDIRECT'); }
        continue;
      }
      if (!response.ok) { await cancel(response); throw error(`ASSET_HTTP_${response.status}`); }
      const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!/^(image\/(png|jpeg|webp|gif)|audio\/(mpeg|mp3|wav|x-wav|aac|mp4)|video\/(mp4|quicktime)|application\/octet-stream)$/.test(mimeType)) {
        await cancel(response); throw error('INVALID_ASSET_CONTENT_TYPE');
      }
      const limit = /^(image|audio)\//.test(mimeType) ? Math.min(maxBytes, SMALL_ASSET_BYTES) : maxBytes;
      const bytes = await writeAsset(response, file, outputPath, limit);
      return { bytes, mimeType };
    }
    throw error('ASSET_REDIRECT_REJECTED');
  } catch (cause) {
    await file.close().catch(() => {});
    throw sanitizeFailure(cause, 'ASSET_TRANSFER_FAILED');
  }
}

module.exports = { createKieTask, pollKieTask, generateRainAudio, downloadAsset };
