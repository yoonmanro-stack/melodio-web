const { createHmac, timingSafeEqual } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function valid(snapshot, userId) {
  return UUID.test(userId || '') && UUID.test(snapshot?.id || '') &&
    Number.isSafeInteger(snapshot?.revision) && snapshot.revision >= 0 &&
    typeof snapshot.name === 'string' && snapshot.name.length > 0 && snapshot.name.length <= 80 &&
    UUID.test(snapshot.portrait?.assetId || '') &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(snapshot.portrait?.mimeType) &&
    typeof snapshot.portrait?.fileName === 'string' && snapshot.portrait.fileName.length <= 160 &&
    ['official', 'discovery', 'designed', 'custom'].includes(snapshot.voice?.kind) &&
    typeof snapshot.voice?.referenceId === 'string' && snapshot.voice.referenceId.length > 0 && snapshot.voice.referenceId.length <= 160 &&
    ['female', 'male'].includes(snapshot.voice?.gender) && ['ko', 'en', 'ja', 'fr'].includes(snapshot.voice?.language) &&
    typeof snapshot.personality === 'string' && snapshot.personality.length <= 2000 &&
    typeof snapshot.visualDirection === 'string' && snapshot.visualDirection.length <= 2000;
}

function signArtistIdentity(snapshot, userId, secret) {
  if (!secret || !valid(snapshot, userId)) throw new Error('invalid_artist_identity');
  return createHmac('sha256', secret).update('melodio-artist-generation-v1\n').update(userId).update('\n').update(canonical(snapshot)).digest('hex');
}

function verifyArtistIdentity(snapshot, userId, signature, secret) {
  if (!secret || !valid(snapshot, userId) || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = signArtistIdentity(snapshot, userId, secret);
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

module.exports = { signArtistIdentity, verifyArtistIdentity };
