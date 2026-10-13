'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const sharp = require('sharp');
const { DEFAULT_BRANDING_CONFIG } = require('../shared/healing-rain/branding');
const { prepareBranding } = require('../worker/healing-rain-branding');
const { renderHealingRain } = require('../worker/healing-rain-render');
const { renderHealingRainIntro } = require('../worker/healing-rain-intro-render');

const WIDTH = 320, HEIGHT = 180, FPS = 12, SECONDS = 6;
const profileId = '11111111-1111-4111-8111-111111111111';
const makeSnapshot = config => ({ schemaVersion: 1, profileId, profileVersion: 1, profileName: '검증용 프로필', config: {
  ...DEFAULT_BRANDING_CONFIG, enabled: true, mode: 'title', font: 'sans', color: 'white',
  fadeInSeconds: .5, holdSeconds: 1, fadeOutSeconds: .5, ...config,
} });
let root, sourceVideo, bodyVideo, sourceAudio;

function ffmpeg(args, maxBytes = 6 * 1024 ** 2) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', ...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let size = 0, stderr = '', failure;
    const timer = setTimeout(() => { failure = new Error('Synthetic branding FFmpeg test timed out'); child.kill('SIGKILL'); }, 60000);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > maxBytes) { failure = new Error('Synthetic test output exceeded bound'); child.kill('SIGKILL'); } else chunks.push(chunk); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2048); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); if (failure || code) reject(failure || new Error(`FFmpeg exited ${code}: ${stderr}`)); else resolve(Buffer.concat(chunks)); });
  });
}

async function checkSingleAppearance(file) {
  const bytes = await ffmpeg(['-i', file, '-an', '-vf', 'format=gray', '-f', 'rawvideo', '-']);
  const frameSize = WIDTH * HEIGHT;
  assert.equal(bytes.length, frameSize * FPS * SECONDS, 'The rendered output must contain exactly six seconds of frames');
  const brightPixels = Array.from({ length: FPS * SECONDS }, (_, frame) => {
    let count = 0;
    for (let index = frame * frameSize; index < (frame + 1) * frameSize; index++) if (bytes[index] > 32) count++;
    return count;
  });
  assert.equal(brightPixels[0], 0, 'Fade in starts with no branding pixels');
  assert.ok(brightPixels[FPS / 2] > 40, 'The Korean title must visibly render after fade in');
  assert.ok(brightPixels[FPS] > 40, 'The title remains visible during the hold');
  assert.ok(brightPixels[2 * FPS - 1] < brightPixels[FPS], 'The final overlay frame must be fading out');
  assert.ok(brightPixels.slice(2 * FPS).every(count => count === 0), 'No visible branding may remain or reappear at any repeated-body frame after two seconds');
  return { checkedFrames: brightPixels.length, visibleHoldPixels: brightPixels[FPS], cleanFramesAfterOverlay: brightPixels.length - 2 * FPS };
}

test.before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'healing-rain-branding-render-'));
  const disk = await fs.statfs(root);
  assert.ok(disk.bavail * disk.bsize > 10 * 1024 ** 3, 'Preserve at least 10 GiB before rendering the synthetic fixture');
  sourceVideo = path.join(root, 'source-1.5s.mp4');
  bodyVideo = path.join(root, 'body-1s.mp4');
  sourceAudio = path.join(root, 'audio-8s.wav');
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=1.5`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-fps_mode', 'cfr', '-bf', '0', sourceVideo]);
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=1`, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-fps_mode', 'cfr', '-bf', '0', bodyVideo]);
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=8', '-ac', '2', '-c:a', 'pcm_s16le', sourceAudio]);
});

test('disabled and empty branding do not create an overlay file', async () => {
  const outputDir = path.join(root, 'off-does-not-exist');
  for (const snapshot of [null, makeSnapshot({ enabled: false }), makeSnapshot({ mode: 'none' })]) {
    assert.equal(await prepareBranding({ snapshot, title: '표시하면 안 되는 제목', width: WIDTH, height: HEIGHT, outputDir }), null);
  }
  assert.equal(await prepareBranding({ snapshot: makeSnapshot({ channelName: '', tagline: '', logoPath: null }), title: '', width: WIDTH, height: HEIGHT, outputDir }), null);
  await assert.rejects(fs.stat(outputDir), { code: 'ENOENT' });
});

test('both bundled Korean fonts render literal script and Pango markup safely', async () => {
  const hashes = [];
  for (const font of ['sans', 'serif']) {
    const outputDir = path.join(root, `font-${font}`); await fs.mkdir(outputDir);
    const title = '고요한 밤 <script>alert("밤")</script> & <span foreground="#00FF00">초록 금지</span>';
    const prepared = await prepareBranding({ snapshot: makeSnapshot({ font, color: 'ivory' }), title, width: 960, height: 540, outputDir });
    assert.equal(prepared.overlay.title, title);
    assert.equal(prepared.receipt.font, font);
    assert.equal(prepared.receipt.occurrences, 1);
    const { data, info } = await sharp(prepared.imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let opaque = 0, green = 0;
    for (let index = 0; index < data.length; index += info.channels) {
      if (data[index + 3] > 128) { opaque++; if (data[index + 1] > data[index] + 30 && data[index + 1] > data[index + 2] + 30) green++; }
    }
    assert.ok(opaque > 100, 'Korean and literal markup must have visible glyph pixels');
    assert.equal(green, 0, 'User Pango markup must never change text color');
    hashes.push(prepared.receipt.imageSha256);
    await assert.rejects(prepareBranding({ snapshot: makeSnapshot({ font }), title, width: 960, height: 540, outputDir }), { code: 'EEXIST' });
  }
  assert.notEqual(hashes[0], hashes[1], 'Sans and serif selections must produce distinct rendered glyphs');
});

test('ordinary render shows a 2s overlay once across the 6s repeated body', { timeout: 120000 }, async context => {
  const report = await renderHealingRain({
    videoPath: sourceVideo, audioPaths: [sourceAudio], outputDir: path.join(root, 'normal-render'),
    targetSeconds: SECONDS, previewSeconds: SECONDS, fps: FPS, maxWidth: WIDTH,
    videoCrossfadeSeconds: .5, targetVideoCycleSeconds: 1, audioCrossfadeSeconds: .5,
    brandingSnapshot: makeSnapshot(), brandingTitle: '고요한 밤',
  });
  assert.equal(report.status, 'complete');
  assert.equal(report.effectiveVideoCycleSeconds, 1);
  assert.equal(report.branding.durationSeconds, 2);
  assert.equal(report.branding.occurrences, 1);
  context.diagnostic(JSON.stringify(await checkSingleAppearance(report.outputs[0].video)));
});

test('intro render shows the same 2s overlay once across its body repetitions', { timeout: 120000 }, async context => {
  const report = await renderHealingRainIntro({
    introPath: sourceVideo, bodyPath: bodyVideo, audioPath: sourceAudio, outputDir: path.join(root, 'intro-render'),
    durations: [SECONDS], fps: FPS, width: WIDTH, height: HEIGHT,
    introSeconds: 1.5, bodySeconds: 1, fadeSeconds: .5, onsetSeconds: .25,
    brandingSnapshot: makeSnapshot(), brandingTitle: '고요한 밤',
  });
  assert.equal(report.status, 'complete');
  assert.equal(report.branding.durationSeconds, 2);
  assert.equal(report.branding.occurrences, 1);
  context.diagnostic(JSON.stringify(await checkSingleAppearance(report.outputs[0].video)));
});

test.after(async context => {
  if (!root) return;
  context.diagnostic(`Synthetic fixture artifacts retained for review: ${root}`);
});
