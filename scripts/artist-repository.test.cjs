const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const crypto = require('node:crypto');

const env = { SUPABASE_SERVICE_ROLE_KEY: 'offline-artist-test-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://offline.example' };
function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', compiled)(name => {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    if (name === 'node:crypto') return crypto;
    throw new Error(`Unexpected import: ${name}`);
  }, mod, mod.exports, { env });
  return mod.exports;
}
const userId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';
const voiceId = '00000000-0000-4000-8000-000000000003';
const designedId = '00000000-0000-4000-8000-000000000004';
const officialCatalog = require('../src/data/officialVocalCatalog.json');
const discoveryCatalog = require('../src/data/discoveryVoices.json');
const officialRegistry = require('../src/lib/voice/official-voice-personas.json');
const integrity = load('src/lib/voice/custom-voice-integrity.ts');
const customRepository = load('src/lib/voice/custom-voice-repository.ts', { './custom-voice-integrity': integrity });
const designedRecords = new Map();
const resolver = load('src/lib/artists/voice-reference.ts', {
  '@/data/officialVocalCatalog.json': officialCatalog,
  '@/data/discoveryVoices.json': discoveryCatalog,
  '@/lib/voice/official-voice-registry': load('src/lib/voice/official-voice-registry.ts', { './official-voice-personas.json': officialRegistry }),
  '@/lib/voice/discovery-voice-registry': load('src/lib/voice/discovery-voice-registry.ts', { './discovery-voice-personas.json': require('../src/lib/voice/discovery-voice-personas.json') }),
  '@/lib/voice/designed-voice-repository': { async readDesignedVoice(_admin, owner, id) { return designedRecords.get(`${owner}:${id}`) || null; } },
  '@/lib/voice/custom-voice-repository': customRepository,
  '@/lib/voice/custom-voice-integrity': integrity,
});
const preparedPortraitBytes = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 255, 217]);
const repository = load('src/lib/artists/repository.ts', {
  './voice-reference': resolver,
  './portrait-preparation': { async prepareArtistPortrait() { return Buffer.from(preparedPortraitBytes); } },
});
const voice = officialCatalog.find(row => Object.hasOwn(officialRegistry, row.id));
assert.ok(voice, 'fixture requires a ready official voice');
const checks = { voiceAuditioned: true, portraitReviewed: true, identityReviewed: true };
function input(patch = {}) {
  return { name: '하린', tagline: '따뜻한 밤의 목소리', description: '첫 앨범의 주인공', genres: ['소울'], personality: '차분하고 세심함',
    backstory: '작은 무대에서 시작함', speakingStyle: '짧고 부드럽게', visualDirection: '어두운 갈색 배경과 따뜻한 조명',
    voice: { kind: 'official', referenceId: voice.id }, portrait: null, checks: { ...checks }, status: 'draft', ...patch };
}
function fixture() {
  const objects = new Map();
  const calls = { tables: 0, uploads: [], downloads: [], lists: [] };
  const failures = { upload: null, download: null, head: null };
  const admin = {
    from() { calls.tables++; throw new Error('Unexpected database access'); },
    storage: { from(bucket) {
      assert.equal(bucket, 'melodio-private');
      return {
        async download(path, _options, config) {
          assert.equal(config?.cache, 'no-store');
          calls.downloads.push(path);
          if (failures.download) return { data: null, error: failures.download };
          const object = objects.get(path);
          return object ? { data: new Blob([object.body], { type: object.type }), error: null }
            : { data: null, error: { statusCode: 404, message: 'Object not found' } };
        },
        async upload(path, body, config) {
          calls.uploads.push(path);
          assert.equal(config.upsert, path.endsWith('/latest.json'));
          assert.equal(config.cacheControl, '0');
          if (failures.upload) return { error: failures.upload };
          if (path.endsWith('/latest.json') && failures.head) return { error: failures.head };
          if (objects.has(path) && !config.upsert) return { error: { statusCode: 409, message: 'Object already exists' } };
          objects.set(path, { body, type: config.contentType });
          return { error: null };
        },
        async list(prefix, config) {
          calls.lists.push({ prefix, ...config });
          const names = [...new Set([...objects.keys()].filter(path => path.startsWith(`${prefix}/`))
            .map(path => path.slice(prefix.length + 1).split('/')[0]))].sort();
          return { data: names.slice(config.offset, config.offset + config.limit).map(name => ({ name })), error: null };
        },
      };
    } },
  };
  return { admin, objects, calls, failures };
}
function jsonObject(f, path) { return JSON.parse(f.objects.get(path).body); }
const artistRoot = row => `artist-profiles/${row.userId}/${row.id}`;
const portraitRoot = portrait => `artist-portraits/${userId}/${portrait.assetId}`;
function pngFile(name = 'portrait.png') {
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  return { name, type: 'image/png', size: bytes.length, async arrayBuffer() { return bytes.buffer; } };
}
function customRow(status = 'ready') {
  const row = { id: voiceId, user_id: userId, vd_code: `SV-${voiceId}`, name: '나의 등록 목소리', style: 'Soul', textures: [], emotions: [], performance: {}, noise_entropy: 0,
    created_at: '2026-10-05T00:00:00Z', physical_layers: { gender: 'male', registrationRevision: 0,
      registration: { status, language: 'ja', providerVoiceId: status === 'ready' ? 'owned-persona-123' : null, sourceObjectPath: null, verificationObjectPath: null } } };
  row.physical_layers = integrity.signedCustomVoiceLayers(row, row.physical_layers);
  return row;
}

test('create, strict owner lookup and list require no database and expose no signature', async () => {
  const f = fixture();
  const created = await repository.createArtist(f.admin, userId, input());
  assert.equal(created.revision, 0);
  assert.equal(created.userId, userId);
  assert.equal(created.voice.name, voice.name);
  assert.equal(Object.hasOwn(created, 'signature'), false);
  assert.deepEqual(await repository.readArtist(f.admin, userId, created.id), created);
  assert.equal(await repository.readArtist(f.admin, otherUserId, created.id), null);
  assert.deepEqual(await repository.listArtists(f.admin, userId), [created]);
  assert.equal(f.calls.tables, 0);
  await assert.rejects(repository.readArtist(f.admin, userId, '../outside'), /invalid_request/);
});

function seedUnknownFolders(f, owner, count) {
  for (let index = 0; index < count; index++) {
    const id = `00000000-0000-4000-9000-${String(index).padStart(12, '0')}`;
    f.objects.set(`artist-profiles/${owner}/${id}/record.json`, { body: JSON.stringify({ incomplete: true }), type: 'application/json' });
  }
}

test('100 retained folders including archives and corrupt records block creation before writes', async () => {
  const f = fixture();
  const created = await repository.createArtist(f.admin, userId, input());
  const archived = await repository.archiveArtist(f.admin, userId, created.id, 0);
  seedUnknownFolders(f, userId, 99);
  assert.deepEqual(await repository.listArtists(f.admin, userId), [archived]);
  const uploadCount = f.calls.uploads.length;
  await assert.rejects(repository.createArtist(f.admin, userId, input()), /too_many_artist_records/);
  assert.equal(f.calls.uploads.length, uploadCount);
  assert.deepEqual(await repository.listArtists(f.admin, userId), [archived]);
});

test('the 100th accepted profile stays listable and another owner does not consume capacity', async () => {
  const f = fixture();
  seedUnknownFolders(f, userId, 99);
  seedUnknownFolders(f, otherUserId, 100);
  const created = await repository.createArtist(f.admin, userId, input());
  assert.deepEqual(await repository.listArtists(f.admin, userId), [created]);
  await assert.rejects(repository.createArtist(f.admin, userId, input()), /too_many_artist_records/);
  const isolated = fixture();
  seedUnknownFolders(isolated, otherUserId, 100);
  assert.equal((await repository.createArtist(isolated.admin, userId, input())).userId, userId);
});

test('CAS concurrency has one winner, stale writes conflict and genesis remains immutable', async () => {
  const f = fixture();
  const created = await repository.createArtist(f.admin, userId, input());
  const genesis = f.objects.get(`${artistRoot(created)}/record.json`).body;
  const results = await Promise.allSettled([
    repository.updateArtist(f.admin, userId, created.id, 0, input({ tagline: '첫 변경' })),
    repository.updateArtist(f.admin, userId, created.id, 0, input({ tagline: '두 번째 변경' })),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.message, 'artist_conflict');
  const winner = results.find(result => result.status === 'fulfilled').value;
  assert.equal(winner.revision, 1);
  assert.equal(winner.checks.identityReviewed, false);
  assert.deepEqual(await repository.readArtist(f.admin, userId, created.id), winner);
  await assert.rejects(repository.updateArtist(f.admin, userId, created.id, 0, input()), /artist_conflict/);
  assert.equal(f.objects.get(`${artistRoot(created)}/record.json`).body, genesis);
});

test('signed head keeps long-lived profiles editable beyond 64 saves and stale hints follow CAS history', async () => {
  const f = fixture();
  const created = await repository.createArtist(f.admin, userId, input());
  const headPath = `${artistRoot(created)}/latest.json`;
  const oldHead = { ...f.objects.get(headPath) };
  let current = created;
  for (let revision = 1; revision <= 70; revision++) {
    current = await repository.updateArtist(f.admin, userId, created.id, current.revision, input({ tagline: `save ${revision}` }));
  }
  assert.equal(current.revision, 70);
  f.calls.downloads.length = 0;
  assert.deepEqual(await repository.readArtist(f.admin, userId, created.id), current);
  assert.equal(f.calls.downloads.length, 3);
  f.objects.set(headPath, oldHead);
  const results = await Promise.allSettled([
    repository.updateArtist(f.admin, userId, created.id, 70, input({ tagline: 'next A' })),
    repository.updateArtist(f.admin, userId, created.id, 70, input({ tagline: 'next B' })),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.message, 'artist_conflict');
  assert.equal((await repository.readArtist(f.admin, userId, created.id)).revision, 71);
});

test('failed head writes retain durable acknowledged transitions and tampered hints fail closed', async () => {
  const f = fixture();
  const created = await repository.createArtist(f.admin, userId, input());
  const headPath = `${artistRoot(created)}/latest.json`;
  const priorHead = f.objects.get(headPath).body;
  f.failures.head = { statusCode: 503, message: 'hint upload unavailable' };
  const saved = await repository.updateArtist(f.admin, userId, created.id, 0, input({ tagline: 'durably saved' }));
  assert.equal(saved.revision, 1);
  assert.equal(f.objects.get(headPath).body, priorHead);
  assert.deepEqual(await repository.readArtist(f.admin, userId, created.id), saved);
  const tampered = JSON.parse(priorHead); tampered.revision = 200;
  f.objects.set(headPath, { body: JSON.stringify(tampered), type: 'application/json' });
  await assert.rejects(repository.readArtist(f.admin, userId, created.id), /invalid_artist_record/);
});

test('signed record tamper and owner relocation fail closed', async () => {
  for (const mutate of [row => { row.name = 'tampered'; }, row => { row.userId = otherUserId; }]) {
    const f = fixture();
    const created = await repository.createArtist(f.admin, userId, input());
    const path = `${artistRoot(created)}/record.json`;
    const row = jsonObject(f, path); mutate(row);
    f.objects.set(path, { body: JSON.stringify(row), type: 'application/json' });
    await assert.rejects(repository.readArtist(f.admin, userId, created.id), /invalid_artist_record/);
    assert.deepEqual(await repository.listArtists(f.admin, userId), []);
  }
});

test('readiness requires approved components and edited identity requires a later review save', async () => {
  const f = fixture();
  await assert.rejects(repository.createArtist(f.admin, userId, input({ status: 'ready' })), /artist_not_ready/);
  const portrait = await repository.storeArtistPortrait(f.admin, userId, pngFile());
  const created = await repository.createArtist(f.admin, userId, input({ portrait, status: 'ready' }));
  assert.equal(created.status, 'ready');
  const changed = await repository.updateArtist(f.admin, userId, created.id, 0, input({ portrait, name: '새 이름', status: 'ready' }));
  assert.equal(changed.status, 'draft');
  assert.equal(changed.checks.identityReviewed, false);
  assert.equal(changed.checks.voiceAuditioned, true);
  const reviewed = await repository.updateArtist(f.admin, userId, created.id, 1, input({ portrait, name: '새 이름', status: 'ready' }));
  assert.equal(reviewed.status, 'ready');
  const replacement = await repository.storeArtistPortrait(f.admin, userId, pngFile('replacement.png'));
  const replaced = await repository.updateArtist(f.admin, userId, created.id, 2, input({ portrait: replacement, name: '새 이름', status: 'ready' }));
  assert.equal(replaced.status, 'draft');
  assert.equal(replaced.checks.portraitReviewed, false);
  assert.equal(replaced.checks.identityReviewed, false);
  const incomplete = await repository.updateArtist(f.admin, userId, created.id, 3, input({ portrait: replacement, name: '새 이름', personality: '', status: 'ready' }));
  assert.equal(incomplete.status, 'draft');
  await assert.rejects(repository.updateArtist(f.admin, userId, created.id, 4, input({ portrait: replacement, name: '새 이름', personality: '', status: 'ready' })), /artist_not_ready/);
});

test('archive retains immutable owned profile and remains possible with a removed voice', async () => {
  const f = fixture();
  const custom = await customRepository.createCustomVoice(f.admin, customRow());
  const created = await repository.createArtist(f.admin, userId, input({ voice: { kind: 'custom', referenceId: voiceId } }));
  await customRepository.deleteCustomVoice(f.admin, custom);
  const archived = await repository.archiveArtist(f.admin, userId, created.id, 0);
  assert.equal(archived.status, 'archived');
  assert.equal(archived.revision, 1);
  assert.equal(f.objects.has(`${artistRoot(created)}/record.json`), true);
  assert.deepEqual(await repository.readArtist(f.admin, userId, created.id), archived);
  assert.deepEqual(await repository.listArtists(f.admin, userId), [archived]);
  await assert.rejects(repository.archiveArtist(f.admin, otherUserId, created.id, 1), /artist_not_found/);
  await assert.rejects(repository.updateArtist(f.admin, userId, created.id, 1, input()), /artist_conflict/);
});

test('voice resolution ignores browser identity and rejects absent, held, cross-owner references', async () => {
  const f = fixture();
  const official = await resolver.resolveArtistVoice(f.admin, userId, { kind: 'official', referenceId: voice.id,
    name: 'spoof', gender: voice.gender === 'male' ? 'female' : 'male', language: 'fr', stylePrompt: 'spoof', providerPersonaId: 'spoof' });
  assert.deepEqual(official, { kind: 'official', referenceId: voice.id, name: voice.name, gender: voice.gender, language: voice.language });
  assert.equal(JSON.stringify(official).includes('spoof'), false);
  await customRepository.createCustomVoice(f.admin, customRow());
  const custom = await resolver.resolveArtistVoice(f.admin, userId, { kind: 'custom', referenceId: voiceId, gender: 'female', language: 'ko' });
  assert.equal(custom.gender, 'male'); assert.equal(custom.language, 'ja');
  await assert.rejects(resolver.resolveArtistVoice(f.admin, otherUserId, { kind: 'custom', referenceId: voiceId }), /artist_voice_not_found/);
  await assert.rejects(resolver.resolveArtistVoice(f.admin, userId, { kind: 'official', referenceId: '__proto__' }), /artist_voice_not_found/);
  const pendingDiscovery = discoveryCatalog.find(row => row.previewStatus !== 'ready' || row.reuseStatus !== 'ready');
  if (pendingDiscovery) await assert.rejects(resolver.resolveArtistVoice(f.admin, userId, { kind: 'discovery', referenceId: pendingDiscovery.id }), /artist_voice_not_ready/);
  designedRecords.set(`${userId}:${designedId}`, { id: designedId, userId, status: 'held', providerPersonaId: null, name: '디자인', gender: 'female', language: 'ko' });
  await assert.rejects(resolver.resolveArtistVoice(f.admin, userId, { kind: 'designed', referenceId: designedId }), /artist_voice_not_ready/);
  await assert.rejects(resolver.resolveArtistVoice(f.admin, otherUserId, { kind: 'designed', referenceId: designedId }), /artist_voice_not_found/);
  designedRecords.delete(`${userId}:${designedId}`);
});

test('voice replacement resets audition and identity checks despite supplied approvals', async () => {
  const f = fixture();
  await customRepository.createCustomVoice(f.admin, customRow());
  const portrait = await repository.storeArtistPortrait(f.admin, userId, pngFile());
  const created = await repository.createArtist(f.admin, userId, input({ portrait, status: 'ready' }));
  const changed = await repository.updateArtist(f.admin, userId, created.id, 0,
    input({ portrait, voice: { kind: 'custom', referenceId: voiceId }, status: 'ready' }));
  assert.equal(changed.status, 'draft');
  assert.equal(changed.checks.voiceAuditioned, false);
  assert.equal(changed.checks.identityReviewed, false);
  assert.equal(changed.checks.portraitReviewed, true);
});

test('portrait binding is owned, canonical and private bytes are checked against the signed digest', async () => {
  const f = fixture();
  const portrait = await repository.storeArtistPortrait(f.admin, userId, pngFile('../../portrait.png'));
  assert.equal(portrait.fileName, 'portrait.jpg');
  assert.equal(portrait.mimeType, 'image/jpeg');
  assert.equal(Object.hasOwn(portrait, 'signature'), false);
  const image = await repository.readArtistPortrait(f.admin, userId, portrait.assetId);
  assert.deepEqual(Buffer.from(image.bytes), preparedPortraitBytes);
  assert.equal(await repository.readArtistPortrait(f.admin, otherUserId, portrait.assetId), null);
  const created = await repository.createArtist(f.admin, userId,
    input({ portrait: { assetId: portrait.assetId, mimeType: 'image/png', fileName: 'spoof.png', url: 'https://untrusted.invalid/image' } }));
  assert.deepEqual(created.portrait, portrait);
  await assert.rejects(repository.createArtist(f.admin, otherUserId, input({ portrait })), /artist_portrait_not_found/);
  const path = `${portraitRoot(portrait)}/portrait.jpg`;
  const tampered = Buffer.from(image.bytes); tampered[15] ^= 1;
  f.objects.set(path, { body: tampered, type: 'image/jpeg' });
  await assert.rejects(repository.readArtistPortrait(f.admin, userId, portrait.assetId), /invalid_artist_record/);
});

test('portrait format spoof and byte limits reject before storage writes', async () => {
  const f = fixture();
  for (const file of [
    { ...pngFile(), type: 'image/jpeg' },
    { ...pngFile(), size: 4 * 1024 * 1024 + 1 },
    { name: 'fake.png', type: 'image/png', size: 6, async arrayBuffer() { return new TextEncoder().encode('<svg/>').buffer; } },
  ]) await assert.rejects(repository.storeArtistPortrait(f.admin, userId, file), /invalid_portrait_file/);
  assert.equal(f.calls.uploads.length, 0);
  await assert.rejects(repository.createArtist(f.admin, userId, input({ portrait: { assetId: '../outside' } })), /invalid_request/);
});

test('storage errors never masquerade as missing profiles or successful saves', async () => {
  const f = fixture();
  const created = await repository.createArtist(f.admin, userId, input());
  f.failures.download = { statusCode: 503, message: 'offline' };
  await assert.rejects(repository.readArtist(f.admin, userId, created.id), /artist_storage_unavailable/);
  f.failures.download = null;
  f.failures.upload = { statusCode: 503, message: 'offline' };
  await assert.rejects(repository.updateArtist(f.admin, userId, created.id, 0, input()), /artist_storage_unavailable/);
  assert.equal((await repository.readArtist(f.admin, userId, created.id)).revision, 0);
});

const api = load('src/lib/artists/api.ts', {
  'next/server': { NextResponse: { json(value, options) { return Response.json(value, options); } } },
  '@supabase/supabase-js': { createClient() { throw new Error('Unexpected admin call'); } },
  '@/lib/supabase/server': { async createClient() { return { auth: { async getUser() { return { data: { user: null }, error: null }; } } }; } },
});
test('API authentication, stream bounds and burst limits fail with compact no-store responses', async () => {
  await assert.rejects(api.artistApiContext(), /authentication_required/);
  const denied = api.artistJsonError(new Error('authentication_required'));
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await denied.json(), { error: '로그인이 필요합니다.', code: 'authentication_required' });
  const full = api.artistJsonError(new Error('too_many_artist_records'));
  assert.equal(full.status, 429);
  const fullBody = await full.json();
  assert.equal(fullBody.code, 'too_many_artist_records');
  assert.match(fullBody.error, /보관 기록.*100/);
  await assert.rejects(api.artistReadJson(new Request('https://offline.example/api/artists', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(40 * 1024) }),
  })), /artist_request_too_large/);
  await assert.rejects(api.artistReadJson(new Request('https://offline.example/api/artists', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '[]',
  })), /invalid_request/);
  for (let index = 0; index < 6; index++) api.limitArtistRequests(userId, 'portrait');
  assert.throws(() => api.limitArtistRequests(userId, 'portrait'), /artist_rate_limited/);
  api.limitArtistRequests(otherUserId, 'portrait');
});
