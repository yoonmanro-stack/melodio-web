const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/lib/voice/custom-voice-provider.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', 'process', 'URL', 'AbortSignal', 'fetch', compiled)(
  require,
  mod,
  mod.exports,
  { env: { KIE_API_KEY: 'offline-test-key', KIE_API_URL: 'https://api.kie.ai' } },
  URL,
  AbortSignal,
  fetch,
);

const { fetchCustomVoiceTask, checkVoiceAvailability, customVoiceFailureCode } = mod.exports;
const providerResponse = (data) => new Response(JSON.stringify({ code: 200, data }));

test('validation task exposes only the provider validation phrase', async () => {
  const result = await fetchCustomVoiceTask('validation-task', async (url, init) => {
    assert.equal(url, 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=validation-task');
    assert.equal(init.headers.Authorization, 'Bearer offline-test-key');
    return providerResponse({ status: 'wait_validating', resultJson: JSON.stringify({ validateInfo: 'Please read this phrase.' }) });
  });
  assert.deepEqual(result, { state: 'complete', validationPhrase: 'Please read this phrase.', voiceId: undefined, isAvailable: undefined });
});

test('generating task exposes verify_phrase_text from the observed nested envelope', async () => {
  const result = await fetchCustomVoiceTask('existing-validation-task', async () => providerResponse({
    state: 'generating',
    resultJson: JSON.stringify({
      msg: 'success', code: 200,
      data: {
        verify_phrase_id: '00000000-0000-4000-8000-000000000001',
        persona_voice_user_id: 123,
        verify_phrase_text: 'Please read this phrase.',
        voice_recording_id: '00000000-0000-4000-8000-000000000002',
        vox_audio_id: '00000000-0000-4000-8000-000000000003',
      },
      task_id: '00000000000000000000000000000004',
    }),
  }));
  assert.deepEqual(result, { state: 'complete', validationPhrase: 'Please read this phrase.', voiceId: undefined, isAvailable: undefined });
});

test('voice creation and availability results normalize nested Kie responses', async () => {
  const created = await fetchCustomVoiceTask('voice-task', async () => providerResponse({
    state: 'success', response: { resultObject: { voiceId: 'voice_profile_123456' } },
  }));
  assert.equal(created.voiceId, 'voice_profile_123456');
  const checked = await fetchCustomVoiceTask('check-task', async () => providerResponse({
    state: 'success', resultJson: JSON.stringify({ data: { isAvailable: true } }),
  }));
  assert.equal(checked.isAvailable, true);
});

test('availability check reads the immediate Kie response instead of inventing another task', async () => {
  const available = await checkVoiceAvailability('voice-task', async (url, init) => {
    assert.equal(url, 'https://api.kie.ai/api/v1/jobs/createTask');
    const body = JSON.parse(init.body);
    assert.deepEqual(body, { model: 'ai-music-api/check-voice', input: { task_id: 'voice-task' } });
    return providerResponse({ isAvailable: true });
  });
  assert.equal(available, true);
});

test('terminal failures return a safe state without provider body details', async () => {
  const result = await fetchCustomVoiceTask('failed-task', async () => providerResponse({
    state: 'failed', failMsg: 'PRIVATE_PROVIDER_DETAIL',
  }));
  assert.deepEqual(result, { state: 'failed' });
});

test('provider errors expose a bounded HTTP code without provider response text', async () => {
  await assert.rejects(
    checkVoiceAvailability('voice-task', async () => new Response('PRIVATE_PROVIDER_BODY', { status: 401 })),
    error => error.name === 'CustomVoiceProviderError'
      && error.providerCode === 401
      && !error.message.includes('PRIVATE_PROVIDER_BODY'),
  );
});

test('internal task failures expose a bounded category without provider details', async () => {
  for (const failure of [
    { failCode: '500', failMsg: 'PRIVATE_PROVIDER_DETAIL' },
    { failMsg: "Data too long for column 'original_voice_info' PRIVATE_PROVIDER_DETAIL" },
  ]) {
    const result = await fetchCustomVoiceTask('failed-task', async () => providerResponse({ state: 'fail', ...failure }));
    assert.deepEqual(result, { state: 'failed', errorCode: 'provider_internal_error' });
    assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER_DETAIL'));
  }
});

test('explicit authorization and billing rejections remain distinct from transport uncertainty', async () => {
  for (const [code, category] of [[401, 'provider_auth_error'], [403, 'provider_auth_error'], [402, 'provider_billing_error'], [500, 'provider_internal_error']]) {
    await assert.rejects(checkVoiceAvailability('voice-task', async () => Response.json({ code, msg: 'PRIVATE_PROVIDER_DETAIL' })), error => {
      assert.equal(customVoiceFailureCode(error), category);
      assert.ok(!JSON.stringify(error).includes('PRIVATE_PROVIDER_DETAIL'));
      return true;
    });
  }
  assert.equal(customVoiceFailureCode(new Error('network timeout')), undefined);
});

test('unrecognized successful results are held instead of declared failed', async () => {
  for (const resultJson of ['malformed', JSON.stringify({ unknown: true }), 'null', '[]']) {
    assert.deepEqual(await fetchCustomVoiceTask('existing-task', async () => providerResponse({ state: 'success', resultJson })), {
      state: 'unrecognized', errorCode: 'provider_result_unrecognized',
    });
  }
  await assert.rejects(checkVoiceAvailability('existing-task', async () => Response.json(null)), error => customVoiceFailureCode(error) === 'provider_result_unrecognized');
});
