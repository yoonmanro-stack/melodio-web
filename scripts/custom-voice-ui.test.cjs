/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/components/voice/registrationUi.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUnderTest = { exports: {} };
new Function('module', 'exports', compiled)(moduleUnderTest, moduleUnderTest.exports);
const { restoreRegistration, failureGuidance } = moduleUnderTest.exports;

test('reopening shows a new registration instead of a terminal failure', () => {
  const failed = { id: 'newer', status: 'failed', errorCode: 'validation_failed' };
  const registrations = [
    { id: 'ready', status: 'ready' },
    failed,
    { id: 'older', status: 'phrase_ready' },
  ];
  assert.equal(restoreRegistration(registrations), registrations[2]);
  assert.equal(restoreRegistration([failed]), null);
  assert.equal(restoreRegistration([{ id: 'ready', status: 'ready' }]), null);
});

test('confirmed phrase validation failure explains why there is no phrase', () => {
  const guidance = failureGuidance('validation_failed');
  assert.equal(guidance.canStartNew, true);
  assert.match(guidance.detail, /문구가 제공되지 않았습니다/);
  assert.match(guidance.detail, /자동으로 다시 요청되지 않습니다/);
  assert.doesNotMatch(guidance.detail, /반주|코러스|잡음/);
});

test('provider failures identify the service issue and stay in terminal history', () => {
  for (const code of ['provider_internal_error', 'provider_auth_error', 'provider_billing_error']) {
    const guidance = failureGuidance(code);
    assert.match(guidance.detail, /공급자/);
    assert.doesNotMatch(guidance.detail, /반주|코러스|잡음/);
    assert.equal(restoreRegistration([{ status: 'failed', errorCode: code }]), null);
  }
  assert.match(failureGuidance('provider_auth_error').detail, /접근 권한/);
  assert.match(failureGuidance('provider_billing_error').detail, /크레딧/);
});

test('unrecognized results restore the existing pending job and never suggest another registration', () => {
  const registration = { status: 'validation_pending', errorCode: 'provider_result_unrecognized' };
  assert.equal(restoreRegistration([registration]), registration);
  const guidance = failureGuidance(registration.errorCode);
  assert.equal(guidance.canStartNew, false);
  assert.match(guidance.detail, /새로 등록하지 말고/);
  const unreadableSubmission = { status: 'failed', errorCode: 'provider_result_unrecognized' };
  assert.equal(restoreRegistration([unreadableSubmission]), unreadableSubmission);
});

test('validation submission uncertainty and pre-provider hold explain the missing phrase', () => {
  const uncertain = failureGuidance('validation_submission_unconfirmed');
  assert.equal(uncertain.canStartNew, true);
  assert.match(uncertain.detail, /검증 문구가 표시되지 않았습니다/);
  assert.match(uncertain.detail, /접수 여부가 불확실/);
  assert.match(uncertain.detail, /비용이 다시 발생할 수 있습니다/);
  const timedOut = failureGuidance('submission_unconfirmed');
  assert.equal(timedOut.canStartNew, true);
  assert.match(timedOut.detail, /검증 문구가 표시되지 않았습니다/);
  assert.doesNotMatch(failureGuidance('submission_unconfirmed', 'Read this phrase.').detail, /검증 문구가 표시되지 않았습니다/);
  const held = failureGuidance('validation_submission_held');
  assert.equal(held.canStartNew, true);
  assert.match(held.detail, /검증 문구가 표시되지 않았습니다/);
  assert.match(held.detail, /Kie에 보내기 전에 보류/);
  assert.match(held.detail, /이전 요청의 상태/);
});

test('unknown acceptance allows a separate manual registration without retrying the old one', () => {
  for (const code of [
    'validation_submission_unconfirmed',
    'validation_submission_held',
    'voice_submission_unconfirmed',
    'availability_check_unconfirmed',
    'submission_unconfirmed',
    undefined,
    'future_failure_code',
  ]) {
    const guidance = failureGuidance(code);
    assert.equal(guidance.canStartNew, true, code);
    assert.match(guidance.detail, /자동 재요청하지 않았습니다/);
    assert.match(guidance.detail, /별도 요청/);
  }
});
