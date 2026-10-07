const crypto = require('node:crypto');
const DOMAIN = 'melodio:suno-retry-identity:v1';

function retryBinding(metadata, ownerId) {
  return JSON.stringify([ownerId || null, metadata.sourceMenu || null, metadata.presetId || null,
    metadata.vocalGender || null, metadata.officialVoiceId || null, metadata.discoveryVoiceId || null,
    metadata.designedVoiceId || null, metadata.customVoiceRegistrationId || null,
    metadata.artistId || null, metadata.artistRevision || null, metadata.artistIdentitySignature || null]);
}
function retryKey(secret) {
  if (typeof secret !== 'string' || secret.length < 16) throw voiceRetryError();
  return crypto.createHash('sha256').update(DOMAIN).update('\0').update(secret).digest();
}
function voiceRetryError() {
  const error = new Error('등록 목소리의 재생성 연결을 확인하지 못했습니다. 자동 재생성을 보류합니다.');
  error.code = 'retry_voice_unavailable';
  return error;
}

/** Opaque authenticated reference; provider IDs are never published as plain metadata. */
function sealSunoRetryIdentity(identity, metadata, ownerId, secret) {
  if (!identity?.personaId) return undefined;
  if (!/^[A-Za-z0-9_-]{6,160}$/.test(identity.personaId)
      || !['style_persona', 'voice_persona'].includes(identity.personaModel)) throw voiceRetryError();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', retryKey(secret), iv);
  cipher.setAAD(Buffer.from(DOMAIN + retryBinding(metadata, ownerId)));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(identity), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), encrypted.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

function resolveSunoRetryIdentity(metadata, ownerId, secret) {
  if (metadata.isInstrumental === true) return {};
  const token = metadata.sunoVoiceRetry;
  if (token == null) {
    // Older rows have no recoverable server-resolved reference. Never silently switch their singer.
    if (['suno_style_persona', 'suno_voice_persona'].includes(metadata.voiceFeatureMode)
        || metadata.officialVoiceId || metadata.discoveryVoiceId || metadata.designedVoiceId
        || metadata.customVoiceRegistrationId || metadata.artistIdentity?.voice?.referenceId) throw voiceRetryError();
    return {};
  }
  try {
    if (typeof token !== 'string' || token.length > 1024 || !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error();
    const [, iv, encrypted, tag] = token.split('.').map((value, i) => i ? Buffer.from(value, 'base64url') : value);
    if (iv.length !== 12 || tag.length !== 16) throw Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', retryKey(secret), iv);
    decipher.setAAD(Buffer.from(DOMAIN + retryBinding(metadata, ownerId)));
    decipher.setAuthTag(tag);
    const identity = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
    if (!/^[A-Za-z0-9_-]{6,160}$/.test(identity.personaId)
        || !['style_persona', 'voice_persona'].includes(identity.personaModel)) throw Error();
    return { personaId: identity.personaId, personaModel: identity.personaModel };
  } catch { throw voiceRetryError(); }
}

module.exports = { sealSunoRetryIdentity, resolveSunoRetryIdentity };
