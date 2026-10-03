const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const env = { SUPABASE_SERVICE_ROLE_KEY: 'offline-voice-integrity-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://offline.example' };
function load(file, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', compiled)(name => {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    if (name === 'node:crypto' || name === 'crypto') return require(name);
    throw new Error(`Unexpected import: ${name}`);
  }, mod, mod.exports, { env });
  return mod.exports;
}
const integrity = load('src/lib/voice/custom-voice-integrity.ts');
const repository = load('src/lib/voice/custom-voice-repository.ts', { './custom-voice-integrity': integrity });
const userId = '00000000-0000-4000-8000-000000000001';
const voiceId = '00000000-0000-4000-8000-000000000002';
const otherUserId = '00000000-0000-4000-8000-000000000003';
const root = row => `voice-registration-state/${row.user_id}/${row.id}`;
const genesis = row => `${root(row)}/record.json`;
const successor = row => `${root(row)}/versions/${row.physical_layers.registrationSignature}.json`;
function voice(id = voiceId, status = 'draft') {
  const row = {
    id, user_id: userId, vd_code: `SV-${id}`, name: 'Test singer', style: 'Pop',
    created_at: '2026-09-27T00:00:00.000Z',
    textures: ['Suno Voice'], emotions: [], performance: {}, noise_entropy: 0,
    physical_layers: { gender: 'female', registrationRevision: 0, registration: {
      status, sourceObjectPath: null, verificationObjectPath: null,
      updatedAt: '2026-09-27T00:00:00.000Z',
    } },
  };
  row.physical_layers = integrity.signedCustomVoiceLayers(row, row.physical_layers);
  return row;
}
function next(row, status) {
  const candidate = structuredClone(row);
  candidate.physical_layers.registration.status = status;
  candidate.physical_layers = integrity.signedCustomVoiceLayers(candidate, candidate.physical_layers);
  return candidate;
}
function fixture() {
  const objects = new Map();
  const calls = { table: 0, downloads: [], uploads: [], lists: [] };
  const failures = { download: null, upload: null };
  const admin = {
    from() { calls.table++; throw new Error('Unexpected database table access'); },
    storage: { from(bucket) {
      assert.equal(bucket, 'melodio-private');
      return {
        async download(path, _options, fetchOptions) {
          assert.equal(fetchOptions?.cache, 'no-store');
          calls.downloads.push(path);
          if (failures.download) return { data: null, error: failures.download };
          return objects.has(path)
            ? { data: new Blob([objects.get(path)], { type: 'application/json' }), error: null }
            : { data: null, error: { statusCode: '404', message: 'Object not found' } };
        },
        async upload(path, body, config) {
          calls.uploads.push(path);
          assert.equal(config.upsert, false);
          assert.equal(config.contentType, 'application/json');
          if (failures.upload) return { error: failures.upload };
          if (objects.has(path)) return { error: { statusCode: '409', message: 'Object already exists' } };
          objects.set(path, body);
          return { error: null };
        },
        async list(prefix, config) {
          calls.lists.push({ prefix, ...config });
          const names = [...new Set([...objects.keys()].filter(path => path.startsWith(`${prefix}/`))
            .map(path => path.slice(prefix.length + 1).split('/')[0]))].sort();
          return { data: names.slice(config.offset || 0, (config.offset || 0) + config.limit)
            .map(name => ({ name, id: null })), error: null };
        },
      };
    } },
  };
  return { admin, objects, calls, failures, seed(row) { objects.set(genesis(row), JSON.stringify(row)); } };
}

test('creation, owner lookup and listing work with no database table', async () => {
  const f = fixture();
  const stored = await repository.createCustomVoice(f.admin, voice());
  assert.equal(integrity.isTrustedCustomVoice(stored), true);
  assert.equal(stored.physical_layers.registrationRevision, 0);
  assert.deepEqual(await repository.readCustomVoice(f.admin, userId, voiceId), stored);
  assert.equal(await repository.readCustomVoice(f.admin, otherUserId, voiceId), null);
  assert.deepEqual(await repository.listCustomVoices(f.admin, userId), [stored]);
  assert.equal(f.calls.table, 0);
  assert.deepEqual([...f.objects.keys()], [genesis(stored)]);
});

test('concurrent changes to one signed state have exactly one CAS winner', async () => {
  const f = fixture();
  const initial = await repository.createCustomVoice(f.admin, voice());
  const results = await Promise.allSettled([
    repository.updateCustomVoice(f.admin, initial, next(initial, 'validation_pending')),
    repository.updateCustomVoice(f.admin, initial, next(initial, 'failed')),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failure = results.find(result => result.status === 'rejected');
  assert.equal(failure.reason.message, 'registration_conflict');
  const winner = results.find(result => result.status === 'fulfilled').value;
  assert.equal(winner.physical_layers.registrationRevision, 1);
  assert.equal(integrity.isTrustedCustomVoice(winner), true);
  assert.deepEqual(await repository.readCustomVoice(f.admin, userId, voiceId), winner);
  assert.equal([...f.objects.keys()].filter(path => path.includes('/versions/')).length, 1);
});

test('immutable old genesis recovers the latest state through successive transitions', async () => {
  const f = fixture();
  const initial = await repository.createCustomVoice(f.admin, voice());
  const initialBody = f.objects.get(genesis(initial));
  let current = initial;
  for (const status of ['validation_submitting', 'validation_pending', 'phrase_ready', 'voice_submitting', 'voice_pending']) {
    current = await repository.updateCustomVoice(f.admin, current, next(current, status));
  }
  assert.equal(f.objects.get(genesis(initial)), initialBody);
  assert.equal(current.physical_layers.registrationRevision, 5);
  assert.deepEqual(await repository.readCustomVoice(f.admin, userId, voiceId), current);
  await assert.rejects(repository.updateCustomVoice(f.admin, initial, next(initial, 'failed')), /registration_conflict/);
  assert.deepEqual(await repository.readCustomVoice(f.admin, userId, voiceId), current);
});

test('delete leaves an immutable signed tombstone and list omits it', async () => {
  const f = fixture();
  const removed = await repository.createCustomVoice(f.admin, voice());
  const retained = await repository.createCustomVoice(f.admin, voice('00000000-0000-4000-8000-000000000004'));
  await repository.deleteCustomVoice(f.admin, removed);
  assert.equal(await repository.readCustomVoice(f.admin, userId, removed.id), null);
  assert.deepEqual(await repository.listCustomVoices(f.admin, userId), [retained]);
  assert.ok(f.objects.has(genesis(removed)));
  const tombstone = JSON.parse(f.objects.get(successor(removed)));
  assert.equal(tombstone.physical_layers.registrationDeleted, true);
  assert.equal(integrity.isTrustedCustomVoice(tombstone), true);
  await assert.rejects(repository.updateCustomVoice(f.admin, removed, next(removed, 'ready')), /registration_conflict/);
});

test('invalid signatures and mismatched identity cannot enter a trusted read', async () => {
  for (const mutate of [
    row => { row.name = 'Tampered name'; },
    row => { row.user_id = otherUserId; row.physical_layers = integrity.signedCustomVoiceLayers(row, row.physical_layers); },
  ]) {
    const f = fixture();
    const initial = voice();
    const changed = structuredClone(initial); mutate(changed);
    f.objects.set(genesis(initial), JSON.stringify(changed));
    await assert.rejects(repository.readCustomVoice(f.admin, userId, voiceId), /invalid_voice_registration/);
    assert.deepEqual(await repository.listCustomVoices(f.admin, userId), []);
  }
});

test('successor must be trusted and advance the exact revision', async () => {
  for (const mutate of [
    row => { row.physical_layers.registration.status = 'ready'; },
    row => { row.physical_layers.registrationRevision = 4; row.physical_layers = integrity.signedCustomVoiceLayers(row, row.physical_layers); },
  ]) {
    const f = fixture();
    const initial = await repository.createCustomVoice(f.admin, voice());
    const saved = await repository.updateCustomVoice(f.admin, initial, next(initial, 'validation_pending'));
    mutate(saved);
    f.objects.set(successor(initial), JSON.stringify(saved));
    await assert.rejects(repository.readCustomVoice(f.admin, userId, voiceId), /invalid_voice_registration/);
  }
});

test('listing paginates past deleted registrations and caps active results at 20', async () => {
  const f = fixture();
  for (let index = 1; index <= 125; index++) {
    const row = voice(`00000000-0000-4000-9000-${String(index).padStart(12, '0')}`);
    row.created_at = new Date(Date.UTC(2026, 8, 27, 0, 0, index)).toISOString();
    if (index <= 100) row.physical_layers.registrationDeleted = true;
    row.physical_layers = integrity.signedCustomVoiceLayers(row, row.physical_layers);
    f.seed(row);
  }
  const rows = await repository.listCustomVoices(f.admin, userId);
  assert.equal(rows.length, 20);
  assert.ok(rows.every(row => !row.physical_layers.registrationDeleted));
  assert.ok(f.calls.lists.some(call => call.offset === 100));
  assert.deepEqual(rows.map(row => row.created_at), rows.map(row => row.created_at).sort().reverse());
});

test('storage failures never become missing records or acknowledged writes', async () => {
  const f = fixture();
  const initial = await repository.createCustomVoice(f.admin, voice());
  f.failures.download = { statusCode: '503', message: 'Offline simulated outage' };
  await assert.rejects(repository.readCustomVoice(f.admin, userId, voiceId));
  f.failures.download = null;
  f.failures.upload = { statusCode: '503', message: 'Offline simulated outage' };
  await assert.rejects(repository.updateCustomVoice(f.admin, initial, next(initial, 'ready')));
  assert.deepEqual(await repository.readCustomVoice(f.admin, userId, voiceId), initial);
});
