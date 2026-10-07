/* Narrow patch for the existing deployed worker. Never replace it with a repository index. */
const fs = require('node:fs');
const { createHash } = require('node:crypto');
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw Error('preset_worker_patch_anchor_mismatch');
  return source.replace(before, after);
}
const importAnchor = "const { generationBatchSiblingFields } = require('./generation-batch');";
const retryImport = "const { resolveSunoRetryIdentity } = require('./suno-retry-identity');";
function patchWorkerSource(source) {
  if (source.includes(retryImport)) throw Error('preset_worker_already_patched');
  const anchor = source.includes(importAnchor) ? importAnchor : "const fs = require('fs');";
  let result = replaceOnce(source, anchor, `${anchor}\n${retryImport}`);
  result = replaceOnce(result, 'sunoVersionLabel, resolveDurationSeconds, SUNO_TIMEOUT_MS',
    'sunoVersionLabel, resolveDurationSeconds, fitSunoStylePrompt, SUNO_TIMEOUT_MS');
  result = replaceOnce(result, 'async function submitSunoJobForRetry(metadata, title) {',
    `async function submitSunoJobForRetry(metadata, title, ownerId) {
  const retryIdentity = resolveSunoRetryIdentity(metadata, ownerId, process.env.SUPABASE_SERVICE_ROLE_KEY);`);
  result = replaceOnce(result, "  effectiveStylePrompt = String(effectiveStylePrompt || '').slice(0, 1000);",
    "  effectiveStylePrompt = fitSunoStylePrompt(effectiveStylePrompt);");
  const retryStart = result.indexOf('async function submitSunoJobForRetry(');
  const retryEnd = result.indexOf('// ─── Suno 작업 폴링', retryStart);
  let retry = result.slice(retryStart, retryEnd);
  retry = replaceOnce(retry, '    title,\n    model: metadata.sunoVersion,',
    '    title,\n    ...retryIdentity,\n    model: metadata.sunoVersion,');
  result = result.slice(0, retryStart) + retry + result.slice(retryEnd);
  const calls = 'submitSunoJobForRetry(metaObj, row.title)';
  if (result.split(calls).length !== 4) throw Error('preset_worker_retry_call_count');
  result = result.split(calls).join('submitSunoJobForRetry(metaObj, row.title, row.user_id)');
  const oldCatch = "if (retryErr?.code === 'lyrics_instruction_in_content') throw retryErr;";
  if (result.split(oldCatch).length !== 4) throw Error('preset_worker_retry_catch_count');
  result = result.split(oldCatch).join("if (['lyrics_instruction_in_content', 'retry_voice_unavailable'].includes(retryErr?.code)) throw retryErr;");
  result = replaceOnce(result, 'async function holdUnsafeSunoLyrics(row, metadata, revision) {',
    "async function holdUnsafeSunoLyrics(row, metadata, revision, reason = 'lyrics_instruction_in_content') {");
  result = replaceOnce(result, "  const message = '보컬 가사에 제작 지시가 섞여 있어 기존 음원을 채택하지 않습니다. 가사를 수정한 뒤 다시 생성해 주세요.';",
    "  const message = reason === 'retry_voice_unavailable'\n    ? '등록 목소리의 재생성 연결을 확인하지 못해 자동 재생성을 보류했습니다. 목소리를 다시 선택해 주세요.'\n    : '보컬 가사에 제작 지시가 섞여 있어 기존 음원을 채택하지 않습니다. 가사를 수정한 뒤 다시 생성해 주세요.';");
  result = replaceOnce(result, "state: 'held', reason: 'lyrics_instruction_in_content', message,", "state: 'held', reason, message,");
  result = replaceOnce(result, "        if (pollErr?.code === 'lyrics_instruction_in_content') {\n          await holdUnsafeSunoLyrics(row, pollMeta, checkpointXmin);",
    "        if (['lyrics_instruction_in_content', 'retry_voice_unavailable'].includes(pollErr?.code)) {\n          await holdUnsafeSunoLyrics(row, pollMeta, checkpointXmin, pollErr.code);");
  return result;
}
if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || fs.existsSync(output)) throw Error('preset_worker_output_invalid');
  const source = patchWorkerSource(fs.readFileSync(input, 'utf8'));
  fs.writeFileSync(output, source, { flag: 'wx' });
  console.log(JSON.stringify({ sha256: createHash('sha256').update(source).digest('hex'), changed: true }));
}
module.exports = { patchWorkerSource };
