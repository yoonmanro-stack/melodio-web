// Deterministic account branding contract shared by the website and worker.
const BRANDING_VERSION = 'healing-rain-branding-v1';
const DEFAULT_BRANDING_CONFIG = Object.freeze({ enabled: false, mode: 'none', channelName: '', tagline: '', logoPath: null, preset: 'minimal', font: 'sans', size: 'medium', color: 'ivory', position: 'center', fadeInSeconds: 1, holdSeconds: 5, fadeOutSeconds: 1 });
const choices = { mode: ['none', 'title', 'channel-title', 'logo-title'], preset: ['minimal', 'classic', 'natural', 'modern'], font: ['sans', 'serif'], size: ['small', 'medium', 'large'], color: ['ivory', 'white', 'warm'], position: ['center', 'lower-third', 'upper-third'] };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const LOGO_PATH = new RegExp(`^${UUID}/branding/${UUID}\\.webp$`, 'i');
function invalid() { const error = new Error('브랜딩 설정을 확인해 주세요.'); error.code = 'invalid_branding'; throw error; }
function cleanBrandingText(value, maxLength = 200) {
  if (typeof value !== 'string') return '';
  return Array.from(value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim()).slice(0, maxLength).join('');
}
function normalizeBrandingConfig(value, options = {}) {
  const strict = options.strict === true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) { if (strict) invalid(); return { ...DEFAULT_BRANDING_CONFIG }; }
  const result = { ...DEFAULT_BRANDING_CONFIG };
  if (strict && (Object.keys(value).some(key => !Object.hasOwn(result, key)) || Object.keys(result).some(key => !Object.hasOwn(value, key)))) invalid();
  if (typeof value.enabled === 'boolean') result.enabled = value.enabled; else if (strict) invalid();
  for (const [key, values] of Object.entries(choices)) {
    if (values.includes(value[key])) result[key] = value[key]; else if (strict) invalid();
  }
  for (const [key, maximum] of [['channelName', 80], ['tagline', 160]]) {
    if (strict && (typeof value[key] !== 'string' || Array.from(value[key]).length > maximum || /[\u0000-\u001f\u007f-\u009f]/.test(value[key]))) invalid();
    result[key] = cleanBrandingText(value[key], maximum);
  }
  if (typeof value.logoPath === 'string' && LOGO_PATH.test(value.logoPath)) result.logoPath = value.logoPath.toLowerCase();
  else if (strict && value.logoPath !== null) invalid();
  for (const key of ['fadeInSeconds', 'holdSeconds', 'fadeOutSeconds']) {
    const number = value[key];
    if (typeof number === 'number' && Number.isFinite(number) && number >= (key === 'holdSeconds' ? 0.5 : 0) && number <= 15) result[key] = Math.round(number * 100) / 100;
    else if (strict) invalid();
  }
  if (result.fadeInSeconds + result.holdSeconds + result.fadeOutSeconds > 15) {
    if (strict) invalid();
    result.fadeInSeconds = 1; result.holdSeconds = 5; result.fadeOutSeconds = 1;
  }
  return result;
}
function resolveBrandingOverlay(value, suppliedTitle) {
  const config = normalizeBrandingConfig(value);
  if (!config.enabled || config.mode === 'none') return null;
  const title = cleanBrandingText(suppliedTitle);
  const channelName = config.mode === 'channel-title' ? config.channelName : '';
  const logoPath = config.mode === 'logo-title' ? config.logoPath : null;
  if (!title && !channelName && !config.tagline && !logoPath) return null;
  return { ...config, title, channelName, logoPath, durationSeconds: config.fadeInSeconds + config.holdSeconds + config.fadeOutSeconds };
}
function createBrandingSnapshot(profile) {
  if (!profile || !new RegExp(`^${UUID}$`, 'i').test(profile.id) || !Number.isInteger(profile.version) || profile.version < 1) return null;
  return { schemaVersion: 1, profileId: profile.id, profileVersion: profile.version, profileName: cleanBrandingText(profile.name, 80), config: normalizeBrandingConfig(profile.config, { strict: true }) };
}
module.exports = { BRANDING_VERSION, DEFAULT_BRANDING_CONFIG, cleanBrandingText, normalizeBrandingConfig, resolveBrandingOverlay, createBrandingSnapshot };
