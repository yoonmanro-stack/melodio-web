"use strict";
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { normalizeBrandingConfig, resolveBrandingOverlay } = require('../shared/healing-rain/branding');
const COLORS = { ivory: '#F4F0E6', white: '#FFFFFF', warm: '#EACAA5' };
const FONT_FILES = { sans: 'NotoSansKR-Regular.ttf', serif: 'NotoSerifKR.ttf' };
const FONTS = { sans: 'Noto Sans KR', serif: 'Noto Serif KR' };
const xml = value => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));

let fontInitialization;
function initializeFonts(outputDir) {
  if (!fontInitialization) {
    fontInitialization = (async () => {
      const fontDir = path.join(__dirname, '..', 'public', 'fonts');
      for (const filename of Object.values(FONT_FILES)) await fs.access(path.join(fontDir, filename));
      // Keep discovery deterministic and cache writes inside this render's private
      // output. macOS Core Text ignores Pango's explicit fontfile registration.
      const privateDir = await fs.mkdtemp(path.join(outputDir, '.branding-fonts-'));
      const cacheDir = path.join(privateDir, 'cache');
      await fs.mkdir(cacheDir, { mode: 0o700 });
      const configFile = path.join(privateDir, 'fonts.conf');
      await fs.writeFile(configFile, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>${xml(fontDir)}</dir><cachedir>${xml(cacheDir)}</cachedir></fontconfig>`, { flag: 'wx', mode: 0o600 });
      process.env.FONTCONFIG_FILE = configFile;
      if (process.platform === 'darwin') process.env.PANGOCAIRO_BACKEND = 'fontconfig';
    })().catch(error => { fontInitialization = null; throw error; });
  }
  return fontInitialization;
}

function overlayForSnapshot(snapshot, title) {
  if (!snapshot) return null;
  if (snapshot.schemaVersion !== 1 || !Number.isInteger(snapshot.profileVersion) || snapshot.profileVersion < 1) throw new Error('Invalid frozen branding snapshot');
  return resolveBrandingOverlay(normalizeBrandingConfig(snapshot.config, { strict: true }), title);
}

async function prepareBranding({ snapshot, title, logoFile, width, height, outputDir }) {
  const overlay = overlayForSnapshot(snapshot, title);
  if (!overlay) return null;
  if (![width, height].every(n => Number.isInteger(n) && n >= 16 && n <= 3840)) throw new Error('Invalid branding canvas');
  await initializeFonts(outputDir);
  const sharp = require('sharp');
  const scale = { small: 0.8, medium: 1, large: 1.2 }[overlay.size];
  const color = COLORS[overlay.color], gap = Math.max(3, Math.round(height * 0.018));
  const blocks = [];
  const text = async (value, relativeSize) => {
    if (!value) return;
    const fontSize = Math.max(8, Math.round(width * relativeSize * scale));
    const buffer = await sharp({ text: { text: `<span foreground="${color}">${xml(value)}</span>`,
      font: `${FONTS[overlay.font]} ${fontSize}`, fontfile: path.join(__dirname, '..', 'public', 'fonts', FONT_FILES[overlay.font]),
      width: Math.max(8, Math.floor(width * 0.78)), align: 'centre', rgba: true, dpi: 72, wrap: 'word-char' } })
      .resize({ width: Math.floor(width * 0.78), height: Math.max(8, Math.floor(height * 0.22)), fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    blocks.push({ input: buffer.data, width: buffer.info.width, height: buffer.info.height });
  };
  const divider = async (relativeWidth) => {
    const w = Math.max(4, Math.round(width * relativeWidth));
    blocks.push({ input: await sharp({ create: { width: w, height: 1, channels: 4, background: color } }).png().toBuffer(), width: w, height: 1 });
  };
  if (overlay.logoPath) {
    if (!logoFile || !path.isAbsolute(logoFile)) throw new Error('Frozen logo is unavailable');
    const bytes = await fs.readFile(logoFile);
    if (!bytes.length || bytes.length > 2 * 1024 ** 2) throw new Error('Invalid branding logo size');
    const metadata = await sharp(bytes, { limitInputPixels: 2048 ** 2 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format)) throw new Error('Invalid branding logo format');
    const logo = await sharp(bytes, { limitInputPixels: 2048 ** 2 }).resize({ width: Math.max(8, Math.floor(width * .22)), height: Math.max(8, Math.floor(height * .1)), fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    blocks.push({ input: logo.data, width: logo.info.width, height: logo.info.height });
  }
  await text(overlay.channelName, .013);
  if (overlay.preset === 'modern') await divider(.06);
  await text(overlay.title, .0292);
  if (overlay.preset === 'classic') await divider(.28);
  await text(overlay.tagline, .014);
  const totalHeight = blocks.reduce((n, b) => n + b.height, 0) + Math.max(0, blocks.length - 1) * gap;
  if (totalHeight > height * .84) throw new Error('Branding text exceeds the safe canvas');
  const center = { 'upper-third': .32, center: .5, 'lower-third': .73 }[overlay.position];
  let top = Math.max(Math.round(height * .08), Math.min(Math.round(height * .92 - totalHeight), Math.round(height * center - totalHeight / 2)));
  const composites = blocks.map(block => { const item = { input: block.input, left: Math.floor((width - block.width) / 2), top }; top += block.height + gap; return item; });
  const png = await sharp({ create: { width, height, channels: 4, background: '#00000000' } }).composite(composites).png().toBuffer();
  const imagePath = path.join(outputDir, 'branding-overlay.png');
  await fs.writeFile(imagePath, png, { flag: 'wx', mode: 0o600 });
  return { imagePath, overlay, receipt: { version: 'healing-rain-branding-render-v1', profileId: snapshot.profileId, profileVersion: snapshot.profileVersion,
    imageSha256: crypto.createHash('sha256').update(png).digest('hex'), font: overlay.font, mode: overlay.mode, durationSeconds: overlay.durationSeconds, occurrences: 1 } };
}
function brandingFilter(branding, sourceLabel, imageIndex, outputLabel = 'branded') {
  const c = branding.overlay;
  const filters = ['format=rgba', 'setpts=PTS-STARTPTS'];
  if (c.fadeInSeconds > 0) filters.push(`fade=t=in:st=0:d=${c.fadeInSeconds}:alpha=1`);
  if (c.fadeOutSeconds > 0) filters.push(`fade=t=out:st=${c.fadeInSeconds + c.holdSeconds}:d=${c.fadeOutSeconds}:alpha=1`);
  return `[${imageIndex}:v]${filters.join(',')}[brand];[${sourceLabel}][brand]overlay=0:0:enable='lt(t,${c.durationSeconds})':eof_action=pass,format=yuv420p[${outputLabel}]`;
}
module.exports = { overlayForSnapshot, prepareBranding, brandingFilter };
