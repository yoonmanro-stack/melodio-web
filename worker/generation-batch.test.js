/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node test entry. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generationBatchSiblingFields } = require('./generation-batch');
const { patchWorkerSource } = require('../scripts/patch-generation-batch-worker.cjs');
const BATCH = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const primary = (changes = {}) => ({ id: 'source-a', user_id: 'owner', title: 'Same title',
  generation_batch_id: BATCH, generation_batch_index: 0, generation_candidate_slot: 'A', ...changes });

test('A produces B fields with exactly the same batch and input index', () => {
  for (const index of [0, 9, 14, 19, 29, 39]) {
    const row = primary({ generation_batch_index: index });
    assert.deepEqual(generationBatchSiblingFields(row), { generation_batch_id: BATCH,
      generation_batch_index: index, generation_candidate_slot: 'B' });
    assert.equal(row.generation_candidate_slot, 'A');
  }
});
test('legacy rows without any lineage stay unassociated', () => {
  assert.deepEqual(generationBatchSiblingFields({}), {});
  assert.deepEqual(generationBatchSiblingFields({ generation_batch_id: null,
    generation_batch_index: null, generation_candidate_slot: null }), {});
});
test('partial, malformed, unknown input and B-source lineage fail closed', () => {
  const cases = [null, [], primary({ generation_batch_id: null }), primary({ generation_batch_id: '' }),
    primary({ generation_batch_id: '00000000-0000-0000-0000-000000000000' }),
    primary({ generation_batch_id: 'invalid' }), primary({ generation_batch_index: undefined }),
    primary({ generation_batch_index: null }), primary({ generation_batch_index: '0' }),
    primary({ generation_batch_index: -1 }), primary({ generation_batch_index: 40 }),
    primary({ generation_batch_index: 0.5 }), primary({ generation_candidate_slot: null }),
    primary({ generation_candidate_slot: 'B' }), primary({ generation_candidate_slot: 'a' })];
  for (const row of cases) assert.throws(() => generationBatchSiblingFields(row), /generation_batch_lineage_invalid/);
});

const workerPath = process.env.GENERATION_BATCH_WORKER_SOURCE || path.join(__dirname, 'index.js');
const source = fs.readFileSync(workerPath, 'utf8');
test('patch is idempotent, refuses partial changes, and validates before A completion', () => {
  assert.equal(patchWorkerSource(source), source);
  assert.throws(() => patchWorkerSource(source.replace('...siblingBatchFields,', '...unknownFields,')), /partial_state/);
  const completion = source.indexOf('.update({\n              audio_url: winner.clip.audio_url,');
  assert.ok(completion > 0);
  assert.ok(source.indexOf('generationBatchSiblingFields(row)') < completion);
  assert.ok(source.indexOf("throw new Error('generation_batch_sibling_lookup_failed')") < completion);
});

// Run the actual candidate-selection precheck and actual sibling storage branch,
// without starting the worker, fetching audio, calling providers or reading env.
function harness(records = [], options = {}) {
  const precheckStart = source.indexOf('          const winner = scannedClips[0];');
  const precheckEndMarker = '            existingBatchSibling = data;\n          }';
  const precheckEnd = source.indexOf(precheckEndMarker, precheckStart) + precheckEndMarker.length;
  const siblingStart = source.indexOf('          // 6단계: 두 번째 곡', precheckEnd);
  const siblingEnd = source.indexOf('          log("INFO", `[SUNO POLL] DB 업데이트 최종 완료`', siblingStart);
  assert.ok(precheckStart > 0 && precheckEnd > precheckStart && siblingStart > precheckEnd && siblingEnd > siblingStart);
  const queries = [], inserted = [], links = [];
  const supabase = { from(table) {
    assert.equal(table, 'generations');
    return {
      select() {
        const conditions = [];
        return {
          eq(field, value) { conditions.push(['eq', field, value]); return this; },
          gte(field, value) { conditions.push(['gte', field, value]); return this; },
          async limit(count) {
            assert.equal(count, 1);
            queries.push(conditions);
            if (options.lookupError) return { data: null, error: { message: 'offline lookup error' } };
            return { data: records.filter(row => conditions.every(([kind, field, value]) =>
              kind === 'eq' ? row[field] === value : row[field] >= value)).slice(0, count), error: null };
          },
        };
      },
      insert(row) {
        inserted.push(row);
        records.push({ ...row, id: `sibling-${inserted.length}`, created_at: new Date().toISOString() });
        return { select: () => ({ single: async () => ({ data: records.at(-1), error: null }) }) };
      },
    };
  } };
  const globals = {
    generationBatchSiblingFields, supabase, scannedClips: [
      { clip: { audio_url: 'offline-a', duration: 180 }, quality: { grade: 'A' } },
      { clip: { audio_url: 'offline-b', duration: 180, archiveClipKey: 'b' }, quality: { grade: 'A' } },
    ], naturalSongDecision: { applies: true }, isShortForm: false,
    metaObj: { audioPersistence: {} }, currentRetryCount: 0,
    clipSeconds: clip => clip.duration, naturalSongCandidateMetadata: () => ({}),
    winnerCoverUrl: 'offline-cover', winnerCoverProvenance: {}, SUPABASE_URL: 'https://offline.invalid',
    isPlaceholderCover: value => !value,
    sharePhotorealTrackCover: () => ({ url: 'offline-cover', provenance: {} }), log: () => {},
    linkGenerationQueueCandidate: async (...args) => { links.push(args); },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(...Object.keys(globals), 'rows',
    `for (const row of rows) { ${source.slice(precheckStart, precheckEnd)}\n${source.slice(siblingStart, siblingEnd)} }`);
  return { run: row => execute(...Object.values(globals), [row]), queries, inserted, links };
}

test('same-title jobs and other input indexes cannot suppress the correct B candidate', async () => {
  const records = [
    { ...primary(), generation_batch_id: OTHER, generation_candidate_slot: 'B', title: 'Same title (2)', created_at: new Date().toISOString() },
    { ...primary(), generation_batch_index: 1, generation_candidate_slot: 'B', title: 'Same title (2)', created_at: new Date().toISOString() },
  ];
  const h = harness(records);
  await h.run(primary());
  assert.equal(h.inserted.length, 1);
  assert.deepEqual(h.queries[0], [['eq', 'generation_batch_id', BATCH], ['eq', 'generation_batch_index', 0], ['eq', 'generation_candidate_slot', 'B']]);
  assert.deepEqual(generationBatchSiblingFields(primary()), {
    generation_batch_id: h.inserted[0].generation_batch_id,
    generation_batch_index: h.inserted[0].generation_batch_index,
    generation_candidate_slot: h.inserted[0].generation_candidate_slot,
  });
  assert.equal(h.inserted[0].is_public, false);
  assert.equal(h.links[0][2], 'B');
  await h.run(primary({ title: 'Changed title' }));
  assert.equal(h.inserted.length, 1, 'The batch/index/B identity also deduplicates later polling or title changes');
});
test('existing B from the same input deduplicates regardless of age or title', async () => {
  const h = harness([{ ...primary(), generation_candidate_slot: 'B', title: 'Older title', created_at: '2000-01-01T00:00:00Z' }]);
  await h.run(primary());
  assert.equal(h.inserted.length, 0);
});
test('legacy title/time dedup and unassociated insertion stay unchanged', async () => {
  const h = harness([{ title: 'Same title (2)', created_at: new Date().toISOString() }]);
  await h.run({ id: 'legacy', title: 'Same title' });
  assert.equal(h.inserted.length, 0);
  assert.deepEqual(h.queries[0][0], ['eq', 'title', 'Same title (2)']);
  assert.equal(h.queries[0][1][0], 'gte');
  await h.run({ id: 'legacy-other', title: 'Different title' });
  assert.equal(h.inserted.length, 1);
  for (const key of ['generation_batch_id', 'generation_batch_index', 'generation_candidate_slot']) {
    assert.equal(Object.hasOwn(h.inserted[0], key), false);
  }
});
test('malformed lineage or a failed batch lookup cannot insert an unassociated sibling', async () => {
  const malformed = harness();
  await assert.rejects(malformed.run(primary({ generation_batch_index: null })), /lineage_invalid/);
  assert.equal(malformed.queries.length, 0);
  assert.equal(malformed.inserted.length, 0);
  const failed = harness([], { lookupError: true });
  await assert.rejects(failed.run(primary()), /sibling_lookup_failed/);
  assert.equal(failed.inserted.length, 0);
});
