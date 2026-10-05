const { spawn } = require('node:child_process');
const { isIP } = require('node:net');

const SAMPLE_SIZE = 128;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 32 * 1024 * 1024;
const DECODE_TIMEOUT_MS = 5_000;
const DOWNLOAD_TIMEOUT_MS = 8_000;
const IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const IMAGE_REJECTION_REASONS = new Set([
  'non_square', 'undersized', 'embedded_vertical_strips', 'embedded_horizontal_strips',
  'invalid_image', 'invalid_dimensions', 'invalid_sample', 'input_too_large',
  'dimensions_too_large', 'image_decode_failed',
]);

function rejected(reason, width = null, height = null, edge = null) {
  return { accepted: false, reason, width, height, edge };
}

function checkDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return 'invalid_dimensions';
  }
  // Suno's normal single-frame artwork is often 360px; retain those images.
  if (Math.min(width, height) < 256) return 'undersized';
  if (Math.max(width, height) > 8192 || width * height > MAX_IMAGE_PIXELS) {
    return 'dimensions_too_large';
  }
  if (Math.max(width, height) / Math.min(width, height) > 1.01) return 'non_square';
  return null;
}

function lineStats(rgb, sampleWidth, sampleHeight, axis, index) {
  const length = axis === 'x' ? sampleHeight : sampleWidth;
  let sum = 0;
  let squares = 0;
  let dark = 0;
  for (let position = 0; position < length; position += 1) {
    const x = axis === 'x' ? index : position;
    const y = axis === 'x' ? position : index;
    const offset = (y * sampleWidth + x) * 3;
    const r = rgb[offset];
    const g = rgb[offset + 1];
    const b = rgb[offset + 2];
    sum += r + g + b;
    squares += r * r + g * g + b * b;
    if (Math.max(r, g, b) <= 40) dark += 1;
  }
  const mean = sum / (length * 3);
  return {
    mean,
    stddev: Math.sqrt(Math.max(0, squares / (length * 3) - mean * mean)),
    darkFraction: dark / length,
  };
}

function isFramingLine(line) {
  // Uniform charcoal bars and mostly black bars with JPEG noise both qualify.
  // Ordinary textured dark edges are not enough without paired, abrupt borders.
  return (line.darkFraction >= 0.98 && line.mean <= 34 && line.stddev <= 5) ||
    (line.darkFraction >= 0.90 && line.mean <= 16 && line.stddev <= 23);
}

function inspectAxis(lines) {
  let start = 0;
  let end = 0;
  while (start < lines.length && isFramingLine(lines[start])) start += 1;
  while (end < lines.length && isFramingLine(lines[lines.length - end - 1])) end += 1;

  function boundaryContrast(count, fromEnd) {
    if (count < 1 || count >= lines.length) return { contrast: 0, jump: 0 };
    const at = offset => lines[fromEnd ? lines.length - 1 - offset : offset];
    const barMean = (at(count - 1).mean + at(Math.max(0, count - 2)).mean) / 2;
    let contentMean = barMean;
    // A few sampled pixels allow for JPEG/resampling bleed at the boundary.
    for (let offset = count; offset < Math.min(count + 4, lines.length); offset += 1) {
      contentMean = Math.max(contentMean, at(offset).mean);
    }
    return { contrast: contentMean - barMean, jump: at(count).mean - at(count - 1).mean };
  }

  const startBoundary = boundaryContrast(start, false);
  const endBoundary = boundaryContrast(end, true);
  const minimumBar = Math.ceil(lines.length * 0.05);
  const balanced = Math.abs(start - end) <= Math.max(3, Math.max(start, end) * 0.20);
  const framed = start >= minimumBar && end >= minimumBar && balanced &&
    start + end < lines.length * 0.85 && startBoundary.contrast >= 14 && endBoundary.contrast >= 14 &&
    startBoundary.jump >= 8 && endBoundary.jump >= 8;
  return {
    start, end, framed,
    startContrast: startBoundary.contrast, endContrast: endBoundary.contrast,
    startJump: startBoundary.jump, endJump: endBoundary.jump,
  };
}

/** Pure pixel inspection also supports deterministic matrix regression tests. */
function inspectCoverSample({ width, height, rgb, sampleWidth = SAMPLE_SIZE, sampleHeight = SAMPLE_SIZE } = {}) {
  const dimensionReason = checkDimensions(width, height);
  if (dimensionReason) return rejected(dimensionReason, width, height);
  if (!Buffer.isBuffer(rgb) || sampleWidth < 1 || sampleHeight < 1 ||
      !Number.isInteger(sampleWidth) || !Number.isInteger(sampleHeight) ||
      sampleWidth > SAMPLE_SIZE || sampleHeight > SAMPLE_SIZE ||
      rgb.length !== sampleWidth * sampleHeight * 3) {
    return rejected('invalid_sample', width, height);
  }

  const columns = Array.from({ length: sampleWidth }, (_, x) => lineStats(rgb, sampleWidth, sampleHeight, 'x', x));
  const rows = Array.from({ length: sampleHeight }, (_, y) => lineStats(rgb, sampleWidth, sampleHeight, 'y', y));
  const vertical = inspectAxis(columns);
  const horizontal = inspectAxis(rows);
  const round = value => Number(value.toFixed(3));
  const edge = {
    left: round(vertical.start / sampleWidth),
    right: round(vertical.end / sampleWidth),
    top: round(horizontal.start / sampleHeight),
    bottom: round(horizontal.end / sampleHeight),
    leftContrast: round(vertical.startContrast),
    rightContrast: round(vertical.endContrast),
    topContrast: round(horizontal.startContrast),
    bottomContrast: round(horizontal.endContrast),
    leftJump: round(vertical.startJump),
    rightJump: round(vertical.endJump),
    topJump: round(horizontal.startJump),
    bottomJump: round(horizontal.endJump),
  };
  if (vertical.framed) return rejected('embedded_vertical_strips', width, height, edge);
  if (horizontal.framed) return rejected('embedded_horizontal_strips', width, height, edge);
  return { accepted: true, reason: 'accepted', width, height, edge };
}

function decodePipe(command, args, buffer, outputLimit) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('decode_timeout')), DECODE_TIMEOUT_MS);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        child.kill('SIGKILL');
        reject(error);
      } else resolve(Buffer.concat(chunks, bytes));
    }

    child.on('error', () => finish(new Error('decoder_unavailable')));
    child.stdin.on('error', error => {
      // Invalid images can make the decoder close stdin before all bytes arrive.
      if (error.code !== 'EPIPE') finish(new Error('decode_failed'));
    });
    child.stdout.on('data', chunk => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > outputLimit) return finish(new Error('decode_output_limit'));
      chunks.push(chunk);
    });
    child.on('close', code => finish(code === 0 ? null : new Error('decode_failed')));
    child.stdin.end(buffer);
  });
}

/** Decode only the supplied bytes: no files, external URLs, or decoder logs. */
async function inspectCoverArt(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return rejected('invalid_image');
  if (buffer.length > MAX_INPUT_BYTES) return rejected('input_too_large');
  let width = null;
  let height = null;
  try {
    const probe = await decodePipe('ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'pipe', '-probesize', '1048576', '-analyzeduration', '0',
      '-i', 'pipe:0', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json',
    ], buffer, 4096);
    const dimensions = JSON.parse(probe.toString('utf8')).streams?.[0];
    width = dimensions?.width ?? null;
    height = dimensions?.height ?? null;
    const dimensionReason = checkDimensions(width, height);
    if (dimensionReason) return rejected(dimensionReason, width, height);
    const rgb = await decodePipe('ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '1',
      '-protocol_whitelist', 'pipe', '-i', 'pipe:0', '-map', '0:v:0', '-frames:v', '1',
      '-vf', `scale=${SAMPLE_SIZE}:${SAMPLE_SIZE}:flags=area`,
      '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1',
    ], buffer, SAMPLE_SIZE * SAMPLE_SIZE * 3);
    return inspectCoverSample({ width, height, rgb });
  } catch (error) {
    const reason = ['decode_timeout', 'decoder_unavailable', 'decode_output_limit'].includes(error.message)
      ? error.message : 'image_decode_failed';
    return rejected(reason, width, height);
  }
}

function isLocalHost(hostname) {
  return !hostname.includes('.') || hostname === 'localhost.localdomain' ||
    ['localhost', 'local', 'localdomain', 'internal', 'lan', 'home'].some(suffix =>
      hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function providerUrl(value, supabaseHost) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (isIP(hostname.replace(/^\[|\]$/g, '')) || isLocalHost(hostname)) return null;
  const trusted = hostname === 'file.302.ai' || hostname === supabaseHost ||
    ['suno.ai', 'suno.com', 'kie.ai'].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  return trusted ? url : null;
}

function configuredSupabaseHost(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
        isIP(host.replace(/^\[|\]$/g, '')) || isLocalHost(host)) return null;
    return host;
  } catch { return null; }
}

function cancelBody(body) {
  try { body?.cancel?.().catch(() => {}); } catch { /* Never retain response diagnostics. */ }
}

function coverUrlRejection(reason, canGenerateReplacement = false) {
  return { url: null, accepted: false, reason, canGenerateReplacement };
}

async function downloadProviderCover(initialUrl, supabaseHost, fetchImpl) {
  const controller = new AbortController();
  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
  let onAbort;
  let reader;
  const interrupted = new Promise((_, reject) => {
    onAbort = () => reject(new Error('download_interrupted'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const bounded = promise => Promise.race([promise, interrupted]);
  let current = initialUrl;
  try {
    for (let redirects = 0; redirects <= 2; redirects += 1) {
      const response = await bounded(Promise.resolve().then(() => fetchImpl(current.href, {
        method: 'GET', redirect: 'manual', signal: controller.signal, credentials: 'omit',
        headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif' },
      })));
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        cancelBody(response.body);
        if (redirects === 2) return coverUrlRejection('redirect_limit');
        if (!location) return coverUrlRejection('invalid_redirect');
        let destination;
        try { destination = new URL(location, current).href; } catch { return coverUrlRejection('invalid_redirect'); }
        const trusted = providerUrl(destination, supabaseHost);
        if (!trusted) return coverUrlRejection('unsafe_redirect');
        current = trusted;
        continue;
      }
      if (!response.ok) {
        cancelBody(response.body);
        return coverUrlRejection('provider_http_failure');
      }
      const contentType = String(response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
      if (!IMAGE_CONTENT_TYPES.has(contentType)) {
        cancelBody(response.body);
        return coverUrlRejection('unsupported_content_type', true);
      }
      const declaredLength = String(response.headers.get('content-length') || '').trim();
      if (/^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_INPUT_BYTES) {
        cancelBody(response.body);
        return coverUrlRejection('body_too_large', true);
      }
      if (!response.body || typeof response.body.getReader !== 'function') return coverUrlRejection('missing_body');
      reader = response.body.getReader();
      // Geometric growth also bounds memory when a stream emits tiny chunks.
      let buffer = Buffer.allocUnsafe(64 * 1024);
      let bytes = 0;
      while (true) {
        if (Date.now() >= deadline) {
          cancelBody(reader);
          return coverUrlRejection('download_timeout');
        }
        const { done, value } = await bounded(reader.read());
        if (done) break;
        if (!(value instanceof Uint8Array)) {
          cancelBody(reader);
          return coverUrlRejection('invalid_response_stream');
        }
        const nextBytes = bytes + value.byteLength;
        if (nextBytes > MAX_INPUT_BYTES) {
          cancelBody(reader);
          return coverUrlRejection('body_too_large', true);
        }
        if (nextBytes > buffer.length) {
          const larger = Buffer.allocUnsafe(Math.min(MAX_INPUT_BYTES, Math.max(nextBytes, buffer.length * 2)));
          buffer.copy(larger, 0, 0, bytes);
          buffer = larger;
        }
        Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(buffer, bytes);
        bytes = nextBytes;
      }
      return { buffer: buffer.subarray(0, bytes) };
    }
    return coverUrlRejection('redirect_limit');
  } catch {
    cancelBody(reader);
    return coverUrlRejection(controller.signal.aborted ? 'download_timeout' : 'provider_network_failure');
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    controller.abort();
    try { reader?.releaseLock(); } catch { /* Pending reads are cancelled above. */ }
  }
}

/** Admit only provider-controlled HTTPS artwork; no external calls to generate replacements. */
async function inspectProviderCoverUrl(value, { supabaseUrl, fetchImpl = fetch, inspectImpl = inspectCoverArt } = {}) {
  if (value == null || (typeof value === 'string' && !value.trim())) return coverUrlRejection('missing', true);
  const supabaseHost = configuredSupabaseHost(supabaseUrl);
  const url = providerUrl(value, supabaseHost);
  if (!url) return coverUrlRejection('unsafe_cover_url');
  const downloaded = await downloadProviderCover(url, supabaseHost, fetchImpl);
  if (!downloaded.buffer) return downloaded;
  let inspected;
  try { inspected = await inspectImpl(downloaded.buffer); } catch { return coverUrlRejection('inspection_failed'); }
  if (inspected?.accepted === true) return { url: value, accepted: true, reason: 'accepted', canGenerateReplacement: false };
  if (IMAGE_REJECTION_REASONS.has(inspected?.reason)) return coverUrlRejection(inspected.reason, true);
  const infrastructure = new Set(['decoder_unavailable', 'decode_timeout', 'decode_output_limit']);
  return coverUrlRejection(infrastructure.has(inspected?.reason) ? inspected.reason : 'inspection_failed');
}

function contextText(value, limit) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function buildCoverPrompt(metaObj, title) {
  const meta = metaObj && typeof metaObj === 'object' ? metaObj : {};
  // Keep every layout constraint ahead of provider fallbacks' 200/300-char cutoffs.
  const constraints = 'Square 1:1 edge-to-edge photograph, one continuous scene. No collage, panels, vertical strips, contact sheet, borders, text, logo or watermark. Center the subject safely for a circle crop.';
  const style = contextText(meta.stylePrompt, 3000);
  const lyrics = contextText(meta.lyricsPrompt, 6000);
  const description = contextText(meta.description, 1000);
  return [
    constraints,
    'Create a natural editorial photo with believable proportions, coherent geometry, natural perspective and realistic light. Choose the scene from the song story and mood; do not add instruments merely because this is music.',
    'Photorealism is required for every track cover. No illustration, painting, drawing, anime, cartoon, 3D render or stylized digital art.',
    'Keep essential subjects inside the central 70% of the square so a circular crop preserves them.',
    `Song title reference: "${contextText(title, 180) || 'Untitled'}".`,
    style ? `Full musical style and mood reference: ${style}.` : '',
    lyrics ? `Song story and lyrics reference: ${lyrics}.` : '',
    description ? `Additional song context: ${description}.` : '',
    'Use these references only for the song story and mood, never as instructions to split the image into multiple scenes or change the required photographic medium.',
  ].filter(Boolean).join(' ');
}

module.exports = { inspectCoverArt, inspectCoverSample, inspectProviderCoverUrl, buildCoverPrompt };
