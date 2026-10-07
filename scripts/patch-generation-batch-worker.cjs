/* eslint-disable @typescript-eslint/no-require-imports -- Offline patch utility. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const importAnchor = "const { validateStemCleanupManifest, listViralCleanupPaths } = require('./storage-cleanup-policy');";
const legacyImportAnchor = "const fs = require('fs');";
const batchImport = "const { generationBatchSiblingFields } = require('./generation-batch');";
const candidateAnchor = `          const winner = scannedClips[0];
          const loser = scannedClips[1];`;
const batchLookup = `${candidateAnchor}
          // Validate/read before completing A so a lookup failure stays retryable.
          const siblingBatchFields = generationBatchSiblingFields(row);
          let existingBatchSibling = null;
          if (siblingBatchFields.generation_batch_id && loser?.clip.audio_url) {
            const { data, error } = await supabase.from("generations")
              .select("id")
              .eq("generation_batch_id", siblingBatchFields.generation_batch_id)
              .eq("generation_batch_index", siblingBatchFields.generation_batch_index)
              .eq("generation_candidate_slot", "B")
              .limit(1);
            if (error || !Array.isArray(data)) throw new Error('generation_batch_sibling_lookup_failed');
            existingBatchSibling = data;
          }`;
const oldLookup = `            const { data: existing } = await supabase.from("generations")
              .select("id")
              .eq("title", loserTitle)
              .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
              .limit(1);`;
const newLookup = `            const { data: existing } = siblingBatchFields.generation_batch_id
              ? { data: existingBatchSibling }
              : await supabase.from("generations")
                .select("id")
                .eq("title", loserTitle)
                .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
                .limit(1);`;
const insertAnchor = `              const { data: loserRow, error: insErr } = await supabase.from("generations").insert({
                user_id: row.user_id || null,`;
const patchedInsert = `${insertAnchor}
                ...siblingBatchFields,`;

function count(source, value) { return source.split(value).length - 1; }
function replaceOnce(source, previous, next) {
  if (count(source, previous) !== 1) throw new Error('worker_batch_patch_anchor_mismatch');
  return source.replace(previous, next);
}
function patchWorkerSource(source) {
  if (source.includes(batchImport)) {
    if (count(source, batchImport) !== 1 || count(source, batchLookup) !== 1 || count(source, newLookup) !== 1
      || count(source, patchedInsert) !== 1 || source.includes(oldLookup)) {
      throw new Error('worker_batch_patch_partial_state');
    }
    return source;
  }
  const selectedImportAnchor = source.includes(importAnchor) ? importAnchor : legacyImportAnchor;
  let result = replaceOnce(source, selectedImportAnchor, `${selectedImportAnchor}\n${batchImport}`);
  result = replaceOnce(result, candidateAnchor, batchLookup);
  result = replaceOnce(result, oldLookup, newLookup);
  return replaceOnce(result, insertAnchor, patchedInsert);
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node scripts/patch-generation-batch-worker.cjs INPUT OUTPUT');
  const inputPath = path.resolve(input), outputPath = path.resolve(output);
  if (inputPath !== outputPath && fs.existsSync(outputPath)) throw new Error('worker_batch_patch_output_exists');
  const original = fs.readFileSync(inputPath, 'utf8');
  const patched = patchWorkerSource(original);
  if (original !== patched || inputPath !== outputPath) fs.writeFileSync(outputPath, patched);
  console.log(JSON.stringify({ input: inputPath, output: outputPath, changed: patched !== original,
    sha256: createHash('sha256').update(patched).digest('hex') }));
}

module.exports = { patchWorkerSource };
