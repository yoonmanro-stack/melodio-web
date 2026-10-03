const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const env = { SUPABASE_SERVICE_ROLE_KEY: 'offline-voice-integrity-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://offline.example' };
function load(file, imports = {}, logger = { error() {} }) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'console', compiled)(name => {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    if (name === 'node:crypto' || name === 'crypto') return require(name);
    throw new Error(`Unexpected import: ${name}`);
  }, mod, mod.exports, { env }, logger);
  return mod.exports;
}
const integrity = load('src/lib/voice/custom-voice-integrity.ts');
const { customVoiceFailureCode } = load('src/lib/voice/custom-voice-provider.ts');
const repository = load('src/lib/voice/custom-voice-repository.ts', { './custom-voice-integrity': integrity });
const userId = '00000000-0000-4000-8000-000000000001';
const voiceId = '00000000-0000-4000-8000-000000000002';
const clone = value => structuredClone(value);
function voice(status = 'draft') {
  const row = {
    id: voiceId, user_id: userId, vd_code: 'SV-test', name: 'Test singer', style: 'Pop',
    created_at: new Date().toISOString(), physical_layers: { gender: 'female', registrationRevision: 0, registration: {
      status, description: '', language: 'ko', singerSkillLevel: 'intermediate', sourceType: 'uploaded',
      sourceObjectPath: `uploads/${userId}/voice/${voiceId}/source.wav`,
      verificationObjectPath: `uploads/${userId}/voice/${voiceId}/verification.wav`,
      validationTaskId: status === 'draft' ? null : 'validation-task',
      voiceTaskId: status === 'voice_pending' ? 'creation-task' : null,
      providerVoiceId: status === 'ready' ? 'voice_profile_12345' : null,
      consentVersion: 'test', consentedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } },
  };
  row.physical_layers = integrity.signedCustomVoiceLayers(row, row.physical_layers);
  return row;
}

function fixture(initial, options = {}) {
  const base = `voice-registration-state/${userId}/${voiceId}`;
  const objects = new Map(initial ? [[`${base}/record.json`, JSON.stringify(initial)]] : []);
  const receipts = new Set();
  const calls = { validation: 0, creation: 0, availability: 0, preflight: 0, sign: 0, table: 0, cleanupStates: [] };
  const diagnostics = [];
  let transientValidationSaveFailures = options.failValidationTaskSaveOnce ? 1 : 0;
  const admin = {
    from() { calls.table++; throw new Error('Custom voices must not query a database table'); },
    storage: { from(bucket) {
      assert.equal(bucket, 'melodio-private');
      return {
        async download(path, _options, fetchOptions) {
          assert.equal(fetchOptions?.cache, 'no-store');
          return objects.has(path)
            ? { data: new Blob([objects.get(path)], { type: 'application/json' }), error: null }
            : { data: null, error: { statusCode: '404', message: 'Object not found' } };
        },
        async list(prefix, config) {
          const names = [...new Set([...objects.keys()].filter(path => path.startsWith(`${prefix}/`))
            .map(path => path.slice(prefix.length + 1).split('/')[0]))].sort();
          return { data: names.slice(config.offset || 0, (config.offset || 0) + config.limit).map(name => ({ name, id: null })), error: null };
        },
        async createSignedUrl() {
          calls.sign++;
          if (options.failSign) return { data: null, error: new Error('private storage detail') };
          return { data: { signedUrl: 'https://offline.example/audio' }, error: null };
        },
        async createSignedUploadUrl() { return { data: { signedUrl: 'https://offline.example/upload', token: 'offline' }, error: null }; },
        async upload(path, body, config) {
          assert.equal(config.upsert, false); assert.equal(config.contentType, 'application/json');
          const isReceipt = /^voice-registration-state\/[^/]+\/(validation|creation)\.json$/.test(path);
          const value = JSON.parse(body);
          if ((isReceipt && options.failReceipt) || objects.has(path)) {
            return { error: { statusCode: '409', message: 'Object already exists' } };
          }
          if (options.failReadySave && value.physical_layers?.registration?.status === 'ready') {
            return { error: new Error('offline simulated persistence failure') };
          }
          if (value.physical_layers?.registration?.status === 'validation_pending'
            && (options.failValidationTaskSave || transientValidationSaveFailures > 0)) {
            if (transientValidationSaveFailures > 0) transientValidationSaveFailures--;
            return { error: { statusCode: '503', message: 'Offline simulated storage failure' } };
          }
          if (options.failValidationFailureSave && value.physical_layers?.registration?.status === 'failed'
            && String(value.physical_layers?.registration?.errorCode).startsWith('validation_submission_')) {
            return { error: { statusCode: '503', message: 'Offline simulated storage failure' } };
          }
          if (options.failValidationClaimSave && value.physical_layers?.registration?.status === 'validation_submitting') {
            return { error: { statusCode: '503', message: 'Offline simulated storage failure' } };
          }
          if (options.foreignClaimOnLoss && value.physical_layers?.registration?.status === 'validation_submitting') {
            const otherClaim = clone(value);
            otherClaim.physical_layers.registration.validationClaimId = 'different-request';
            otherClaim.physical_layers = integrity.signedCustomVoiceLayers(otherClaim, otherClaim.physical_layers);
            objects.set(path, JSON.stringify(otherClaim));
            return { error: { statusCode: '503', message: 'Offline simulated response loss' } };
          }
          objects.set(path, body);
          if (isReceipt) receipts.add(path);
          if (isReceipt && options.loseReceiptResponse) {
            return { error: { statusCode: '503', message: 'Offline simulated receipt response loss' } };
          }
          if (options.loseClaimSaveResponse && value.physical_layers?.registration?.status === 'validation_submitting') {
            return { error: { statusCode: '503', message: 'Offline simulated response loss after claim' } };
          }
          if (options.loseFailureSaveResponse && value.physical_layers?.registration?.status === 'failed'
            && String(value.physical_layers?.registration?.errorCode).startsWith('validation_submission_')) {
            return { error: { statusCode: '503', message: 'Offline simulated response loss after failure' } };
          }
          if (options.loseTaskSaveResponse && ['validation_pending', 'voice_pending'].includes(value.physical_layers?.registration?.status)) {
            return { error: { statusCode: '503', message: 'Offline simulated response loss after commit' } };
          }
          return { error: null };
        },
        async remove(paths) {
          calls.cleanupStates.push((await repository.readCustomVoice(admin, userId, voiceId))?.physical_layers.registration.status);
          for (const path of paths) objects.delete(path);
          return { error: null };
        },
      };
    } },
  };
  const route = load('src/app/api/voice/custom/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@supabase/supabase-js': { createClient: () => admin },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } }) },
    '@/lib/voice/custom-voice-integrity': integrity,
    '@/lib/voice/custom-voice-repository': repository,
    '@/lib/voice/custom-voice-audio-link': {
      createCustomVoiceAudioLink() {
        calls.sign++;
        if (options.failSign) throw new Error('voice_storage_unavailable');
        return 'https://offline.example/api/voice/audio/signed-token';
      },
    },
    '@/lib/voice/custom-voice-provider': {
      customVoiceFailureCode,
      assertCustomVoiceProviderConfigured() { calls.preflight++; if (options.failPreflight) throw new Error('private provider detail'); },
      async startVoiceValidation(input) {
        calls.validation++;
        calls.validationInput = input;
        if (options.providerCode !== undefined) {
          const error = new Error('private provider detail');
          error.name = 'CustomVoiceProviderError'; error.providerCode = options.providerCode;
          throw error;
        }
        if (options.timeout) throw new Error('private provider detail');
        return 'validation-task';
      },
      async startVoiceCreation() { calls.creation++; if (options.timeout) throw new Error('timeout'); return 'creation-task'; },
      async fetchCustomVoiceTask() { return options.taskResult || { state: 'complete', voiceId: 'voice_profile_12345' }; },
      async checkVoiceAvailability() { calls.availability++; return true; },
    },
  }, { error: (...items) => diagnostics.push(items) });
  return {
    objects, receipts, calls, diagnostics, route,
    current: () => repository.readCustomVoice(admin, userId, voiceId),
    post: (action, body = {}) => route.POST({ json: async () => ({ action, id: voiceId, ...body }) }),
    replay(row) {
      // Even a privileged rollback of the state chain must retain the independent
      // immutable submission receipts, preventing another billed provider task.
      for (const path of objects.keys()) if (path.startsWith(`${base}/`)) objects.delete(path);
      objects.set(`${base}/record.json`, JSON.stringify(row));
    },
  };
}

test('signature rejects altered identity, metadata, state, provider and paths', () => {
  const original = voice('ready');
  for (const mutate of [
    row => { row.id = '00000000-0000-4000-8000-000000000003'; },
    row => { row.user_id = '00000000-0000-4000-8000-000000000003'; },
    row => { row.name = 'Changed'; }, row => { row.style = 'Changed'; }, row => { row.vd_code = 'SV-other'; },
    row => { row.physical_layers.registration.status = 'draft'; },
    row => { row.physical_layers.registration.providerVoiceId = 'another_voice'; },
    row => { row.physical_layers.registration.sourceObjectPath = 'uploads/another-owner/private.wav'; },
  ]) {
    const changed = clone(original); mutate(changed); assert.equal(integrity.isTrustedCustomVoice(changed), false);
  }
  assert.equal(integrity.registeredVoicePersona(original, userId), 'voice_profile_12345');
  assert.throws(() => integrity.registeredVoicePersona(original, 'other-owner'));
  assert.throws(() => integrity.registeredVoicePersona(voice(), userId));
  const reordered = clone(original);
  reordered.physical_layers.registration = Object.fromEntries(Object.entries(reordered.physical_layers.registration).reverse());
  assert.equal(integrity.isTrustedCustomVoice(reordered), true);
});

test('storage guards reject other owners, traversal and wrong object kinds even on a signed row', async () => {
  for (const path of ['uploads/another-owner/private.wav', `uploads/${userId}/voice/${voiceId}/source.../secret`, `uploads/${userId}/voice/${voiceId}/verification.wav`]) {
    const row = voice(); row.physical_layers.registration.sourceObjectPath = path;
    row.physical_layers = integrity.signedCustomVoiceLayers(row, row.physical_layers);
    const f = fixture(row);
    assert.equal((await f.post('start-validation')).status, 409);
    assert.equal(f.calls.sign, 0); assert.equal(f.calls.validation, 0);
    assert.equal((await f.route.DELETE({ json: async () => ({ id: voiceId }) })).status, 409);
    assert.deepEqual(f.calls.cleanupStates, []);
  }
});

for (const [status, action, counter] of [['draft', 'start-validation', 'validation'], ['phrase_ready', 'start-creation', 'creation']]) {
  test(`concurrent ${action} creates exactly one provider job`, async () => {
    const f = fixture(voice(status));
    const responses = await Promise.all([f.post(action), f.post(action)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(f.calls[counter], 1); assert.equal(f.receipts.size, 1);
  });
  test(`signed snapshot replay cannot repeat ${action}`, async () => {
    const original = voice(status); const f = fixture(original);
    assert.equal((await f.post(action)).status, 200);
    f.replay(original);
    assert.equal((await f.post(action)).status, 200);
    assert.equal(f.calls[counter], 1);
    assert.equal((await f.current()).physical_layers.registration.status, 'failed');
  });
  test(`lost persistence response after ${action} recovers without another provider job`, async () => {
    const f = fixture(voice(status), { loseTaskSaveResponse: true });
    assert.equal((await f.post(action)).status, action === 'start-validation' ? 200 : 409);
    assert.equal((await f.current()).physical_layers.registration.status,
      action === 'start-validation' ? 'validation_pending' : 'voice_pending');
    assert.equal((await f.post(action)).status, 400);
    assert.equal(f.calls[counter], 1);
    assert.deepEqual(f.calls.cleanupStates, []);
  });
  test(`uncertain ${action} keeps audio and cannot retry`, async () => {
    const f = fixture(voice(status), { timeout: true });
    const response = await f.post(action);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).voice.status, 'failed');
    if (action === 'start-validation') {
      assert.equal((await f.current()).physical_layers.registration.errorCode, 'validation_submission_unconfirmed');
      assert.ok(f.diagnostics.some(line => line.includes('provider_request')));
      assert.ok(!JSON.stringify(f.diagnostics).includes('private provider detail'));
    }
    assert.ok((await f.current()).physical_layers.registration.sourceObjectPath);
    assert.equal((await f.post(action)).status, 400);
    assert.equal(f.calls[counter], 1); assert.deepEqual(f.calls.cleanupStates, []);
  });
}

test('receipt storage failure prevents provider submission', async () => {
  const f = fixture(voice(), { failReceipt: true });
  assert.equal((await f.post('start-validation')).status, 200);
  assert.equal(f.calls.validation, 0);
  assert.equal((await f.current()).physical_layers.registration.status, 'failed');
  assert.equal((await f.current()).physical_layers.registration.errorCode, 'validation_submission_held');
  assert.ok(f.diagnostics.some(line => line.includes('receipt_claim')));
});

test('a lost receipt response remains held even when its immutable receipt exists', async () => {
  const original = voice();
  const f = fixture(original, { loseReceiptResponse: true });
  const response = await f.post('start-validation');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).voice.errorCode, 'validation_submission_held');
  assert.equal(f.receipts.size, 1);
  assert.equal(f.calls.validation, 0);
  f.replay(original);
  assert.equal((await f.post('start-validation')).status, 200);
  assert.equal(f.calls.validation, 0);
});

test('validation preflight failures leave the draft and never claim a receipt', async () => {
  for (const option of ['failSign', 'failPreflight', 'failValidationClaimSave']) {
    const f = fixture(voice(), { [option]: true });
    const response = await f.post('start-validation');
    assert.equal(response.status, 503);
    assert.equal((await f.current()).physical_layers.registration.status, 'draft');
    assert.equal(f.receipts.size, 0);
    assert.equal(f.calls.validation, 0);
    const stage = option === 'failSign' ? 'source_signing'
      : option === 'failPreflight' ? 'provider_configuration' : 'state_claim';
    assert.ok(f.diagnostics.some(line => line.includes(stage)));
    assert.ok(!JSON.stringify(f.diagnostics).includes('private'));
  }
});

test('provider response logs a bounded numeric code without response detail', async () => {
  const f = fixture(voice(), { providerCode: 402 });
  const response = await f.post('start-validation');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).voice.errorCode, 'provider_billing_error');
  assert.ok(f.diagnostics.some(line => line.includes('provider_response_402')));
  assert.ok(!JSON.stringify(f.diagnostics).includes('private provider detail'));
  assert.equal(f.calls.validation, 1);
});

test('authorization rejection is classified without permitting a second submission', async () => {
  const f = fixture(voice(), { providerCode: 401 });
  const response = await f.post('start-validation');
  assert.equal((await response.json()).voice.errorCode, 'provider_auth_error');
  assert.equal(f.receipts.size, 1);
  assert.equal((await f.post('start-validation')).status, 400);
  assert.equal(f.calls.validation, 1);
});

test('provider internal task failure preserves the task and private audio', async () => {
  const f = fixture(voice('validation_pending'), { taskResult: { state: 'failed', errorCode: 'provider_internal_error' } });
  const response = await f.post('poll');
  assert.equal((await response.json()).voice.errorCode, 'provider_internal_error');
  const saved = (await f.current()).physical_layers.registration;
  assert.equal(saved.validationTaskId, 'validation-task');
  assert.ok(saved.sourceObjectPath);
  assert.deepEqual(f.calls.cleanupStates, []);
  assert.equal(f.calls.validation + f.calls.creation, 0);
});

test('poll advances an existing validation task to phrase ready without another creation request', async () => {
  const f = fixture(voice('validation_pending'), { taskResult: { state: 'complete', validationPhrase: 'Please read this phrase.' } });
  const response = await f.post('poll');
  const { voice: visible, complete } = await response.json();
  assert.equal(visible.status, 'phrase_ready');
  assert.equal(visible.validationPhrase, 'Please read this phrase.');
  assert.equal(complete, true);
  const saved = (await f.current()).physical_layers.registration;
  assert.equal(saved.validationTaskId, 'validation-task');
  assert.equal(saved.errorCode, null);
  assert.equal(f.calls.validation + f.calls.creation + f.calls.availability, 0);
  assert.deepEqual(f.calls.cleanupStates, []);
});

test('unknown successful output remains pollable and can recover without resubmission', async () => {
  for (const status of ['validation_pending', 'voice_pending']) {
    const options = { taskResult: { state: 'unrecognized', errorCode: 'provider_result_unrecognized' } };
    const f = fixture(voice(status), options);
    const response = await f.post('poll');
    const { voice: visible, complete } = await response.json();
    assert.equal(visible.status, status);
    assert.equal(visible.errorCode, 'provider_result_unrecognized');
    assert.equal(complete, false);
    const saved = await f.current();
    assert.equal(saved.physical_layers.registration.validationTaskId, 'validation-task');
    if (status === 'voice_pending') assert.equal(saved.physical_layers.registration.voiceTaskId, 'creation-task');
    await f.post('poll');
    assert.equal((await f.current()).physical_layers.registrationRevision, saved.physical_layers.registrationRevision);
    options.taskResult = status === 'validation_pending'
      ? { state: 'complete', validationPhrase: 'Read this phrase.' }
      : { state: 'complete', voiceId: 'voice_profile_12345' };
    await f.post('poll');
    const recovered = (await f.current()).physical_layers.registration;
    assert.equal(recovered.status, status === 'validation_pending' ? 'phrase_ready' : 'ready');
    assert.equal(recovered.errorCode, null);
    assert.equal(f.calls.validation + f.calls.creation, 0);
  }
});

test('a result from the wrong phase is held without consuming revisions repeatedly', async () => {
  const f = fixture(voice('validation_pending'), { taskResult: { state: 'complete', voiceId: 'voice_profile_12345' } });
  await f.post('poll');
  const saved = await f.current();
  assert.equal(saved.physical_layers.registration.status, 'validation_pending');
  assert.equal(saved.physical_layers.registration.errorCode, 'provider_result_unrecognized');
  await f.post('poll');
  assert.equal((await f.current()).physical_layers.registrationRevision, saved.physical_layers.registrationRevision);
});

test('validation uses the selected duration above sixty seconds', async () => {
  for (const durationSeconds of [71, 120]) {
    const f = fixture(voice());
    await f.post('start-validation', { durationSeconds });
    assert.equal(f.calls.validationInput.endSeconds, durationSeconds);
    assert.equal(f.calls.validationInput.startSeconds, 0);
  }
});

test('fractional sample duration uses whole seconds without extending past the selected audio', async () => {
  const f = fixture(voice());
  await f.post('start-validation', { durationSeconds: 71.9 });
  assert.equal(f.calls.validationInput.endSeconds, 71);
  assert.equal(Number.isInteger(f.calls.validationInput.endSeconds), true);
  assert.ok(f.calls.validationInput.endSeconds <= 71.9);
});

test('a returned validation task retries only local state persistence', async () => {
  const f = fixture(voice(), { failValidationTaskSaveOnce: true });
  const response = await f.post('start-validation');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).voice.status, 'validation_pending');
  assert.equal((await f.current()).physical_layers.registration.validationTaskId, 'validation-task');
  assert.equal(f.calls.validation, 1);
  assert.equal(f.receipts.size, 1);
});

test('lost claim response is recovered before calling the validation provider once', async () => {
  const f = fixture(voice(), { loseClaimSaveResponse: true });
  const response = await f.post('start-validation');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).voice.status, 'validation_pending');
  assert.equal(f.calls.validation, 1);
  assert.equal(f.receipts.size, 1);
});

test('a lost claim response cannot adopt another request claim', async () => {
  const f = fixture(voice(), { foreignClaimOnLoss: true });
  assert.equal((await f.post('start-validation')).status, 503);
  assert.equal((await f.current()).physical_layers.registration.status, 'validation_submitting');
  assert.equal(f.receipts.size, 0);
  assert.equal(f.calls.validation, 0);
});

test('lost failure response reads back the validation failure code', async () => {
  for (const options of [{ failReceipt: true }, { timeout: true }]) {
    const f = fixture(voice(), { ...options, loseFailureSaveResponse: true });
    const response = await f.post('start-validation');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).voice.errorCode,
      options.failReceipt ? 'validation_submission_held' : 'validation_submission_unconfirmed');
    assert.equal(f.calls.validation, options.failReceipt ? 0 : 1);
  }
});

test('failed error-state persistence still reports the correct validation stage', async () => {
  for (const options of [{ failReceipt: true }, { timeout: true }]) {
    const f = fixture(voice(), { ...options, failValidationFailureSave: true });
    const response = await f.post('start-validation');
    assert.equal(response.status, options.failReceipt ? 409 : 503);
    assert.equal((await response.json()).code,
      options.failReceipt ? 'validation_submission_held' : 'validation_submission_unconfirmed');
    assert.equal((await f.current()).physical_layers.registration.status, 'validation_submitting');
    assert.equal(f.calls.validation, options.failReceipt ? 0 : 1);
  }
});

test('unpersistable validation task reports uncertainty without another provider call', async () => {
  const f = fixture(voice(), { failValidationTaskSave: true });
  const response = await f.post('start-validation');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'validation_submission_unconfirmed');
  assert.equal((await f.current()).physical_layers.registration.status, 'validation_submitting');
  assert.equal((await f.post('start-validation')).status, 400);
  assert.equal(f.calls.validation, 1);
  assert.ok(f.diagnostics.some(line => line.includes('task_state_save')));
});

test('audio cleanup happens only after ready is durably stored', async () => {
  const f = fixture(voice('voice_pending'));
  assert.equal((await f.post('poll')).status, 200);
  assert.deepEqual(f.calls.cleanupStates, ['ready']);
  assert.equal((await f.current()).physical_layers.registration.sourceObjectPath, null);
  assert.equal(integrity.isTrustedCustomVoice((await f.current())), true);
  const failure = fixture(voice('voice_pending'), { failReadySave: true });
  await failure.post('poll');
  assert.deepEqual(failure.calls.cleanupStates, []);
  assert.ok((await failure.current()).physical_layers.registration.sourceObjectPath);
});

test('unsigned rows are hidden and cannot submit a provider request', async () => {
  const row = voice(); delete row.physical_layers.registrationSignature;
  const f = fixture(row);
  assert.deepEqual(await (await f.route.GET()).json(), { voices: [] });
  assert.equal((await f.post('start-validation')).status, 409);
  assert.equal(f.calls.validation, 0);
});


test('draft preparation and listing require only private object storage', async () => {
  const f = fixture(null);
  const response = await f.route.POST({ json: async () => ({
    action: 'prepare-source-upload', consent: true, name: 'My voice',
    contentType: 'audio/wav', fileSize: 1024,
  }) });
  assert.equal(response.status, 200);
  const upload = await response.json();
  assert.equal(upload.bucket, 'melodio-private');
  assert.ok(f.objects.has(`voice-registration-state/${userId}/${upload.id}/record.json`));
  const listResponse = await f.route.GET();
  assert.equal(listResponse.status, 200);
  assert.deepEqual((await listResponse.json()).voices.map(row => [row.id, row.status]), [[upload.id, 'draft']]);
  assert.equal(f.calls.table, 0);
  assert.equal(f.calls.validation + f.calls.creation + f.calls.availability, 0);
});
