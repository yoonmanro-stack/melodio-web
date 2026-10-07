const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  const module = { exports: {} };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', js)(module, module.exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  });
  return module.exports;
}
const model = loadModule('src/lib/generation-batches/model.ts');
const batchId = '12345678-1234-4123-8123-123456789000';
const ownerId = '12345678-1234-4123-8123-123456789001';
const id = index => `12345678-1234-4123-8123-${String(index + 100).padStart(12, '0')}`;
function fixture(count = 10) {
  return {
    batch: { id: batchId, user_id: ownerId, input_count: count, source_menu: 'preset-studio', created_at: '2026-10-07T00:00:00Z', selection_revision: 0, selected_generation_ids: null },
    rows: Array.from({ length: count * 2 }, (_, i) => ({
      id: id(i), generation_batch_index: Math.floor(i / 2), generation_candidate_slot: i % 2 ? 'B' : 'A',
      title: `Same title`, status: 'completed', audio_url: `https://audio.example/${i}.mp3`, cover_art_url: null,
      actual_duration_seconds: 60.6, provider_clip_key: `clip-${i}`,
    })),
  };
}

test('ordinary completed 20/30/40-output batches default to ordered A10/A15/A20', () => {
  for (const count of [10, 15, 20]) {
    const { batch, rows } = fixture(count);
    const result = model.buildGenerationBatchTracklist(batch, [...rows].reverse());
    assert.equal(result.eligible, true);
    assert.equal(result.completedOutputCount, 2 * count);
    assert.equal(result.selectedGenerationIds.length, count);
    assert.deepEqual(result.selectedGenerationIds, rows.filter(row => row.generation_candidate_slot === 'A').map(row => row.id));
    assert.equal(result.selectionSource, 'default_a');
    assert.equal(result.preview.renderVerified, false);
  }
});

test('subthreshold, missing, pending and invalid URLs never become an eligible tracklist', () => {
  const small = fixture(9);
  assert.equal(model.buildGenerationBatchTracklist(small.batch, small.rows).ineligibilityReason, 'insufficient_outputs');
  for (const change of [
    rows => rows.pop(),
    rows => { rows[0].status = 'generating'; },
    rows => { rows[0].audio_url = 'kie-task:abc'; },
    rows => { rows[0].audio_url = 'https://user:secret@audio.example/a.mp3'; },
  ]) {
    const { batch, rows } = fixture();
    change(rows);
    const result = model.buildGenerationBatchTracklist(batch, rows);
    assert.equal(result.eligible, false);
    assert.deepEqual(result.selectedGenerationIds, []);
  }
});

test('duplicated audio, signed URL variants, provider clips and bad pairing are rejected', () => {
  for (const change of [
    rows => { rows[1].id = rows[0].id; },
    rows => { rows[1].audio_url = rows[0].audio_url; },
    rows => { rows[1].audio_url = `${rows[0].audio_url}?token=changed`; },
    rows => { rows[1].provider_clip_key = rows[0].provider_clip_key; },
    rows => { rows[1].generation_candidate_slot = 'A'; },
    rows => { rows[1].generation_batch_index = 10; },
    rows => { rows[1].generation_candidate_slot = 'C'; },
  ]) {
    const { batch, rows } = fixture();
    change(rows);
    const result = model.buildGenerationBatchTracklist(batch, rows);
    assert.equal(result.ineligibilityReason, 'invalid_pairing');
    assert.equal(result.eligible, false);
  }
});

test('saved A/B selection preserves explicit order and cannot include two from one input', () => {
  const { batch, rows } = fixture();
  batch.selected_generation_ids = rows.filter((_, i) => i % 2).map(row => row.id).reverse();
  let result = model.buildGenerationBatchTracklist(batch, rows);
  assert.equal(result.selectionSource, 'saved');
  assert.deepEqual(result.selectedGenerationIds, batch.selected_generation_ids);
  batch.selected_generation_ids[0] = rows[0].id;
  result = model.buildGenerationBatchTracklist(batch, rows);
  assert.equal(result.selectionSource, 'default_a');
});

test('timestamps accumulate fractional duration before flooring; request durations are never substituted', () => {
  const { batch, rows } = fixture();
  let result = model.buildGenerationBatchTracklist(batch, rows);
  assert.equal(result.preview.rows[1].timestamp, '01:00');
  assert.equal(result.preview.rows[2].timestamp, '02:01');
  assert.equal(result.preview.rows[2].startSeconds, 121.2);
  rows[2].actual_duration_seconds = null;
  rows[2].durationSeconds = 240;
  result = model.buildGenerationBatchTracklist(batch, rows);
  assert.equal(result.eligible, true);
  assert.equal(result.preview.rows[1].timestamp, '01:00');
  assert.equal(result.preview.rows[1].durationSeconds, null);
  assert.equal(result.preview.rows[2].startSeconds, null);
  assert.equal(result.preview.rows[2].timestamp, null);
  assert.equal(result.preview.durationSeconds, null);
  assert.equal(result.preview.timelineComplete, false);
  const longBatch = fixture(40);
  longBatch.rows.forEach(row => { row.actual_duration_seconds = 100.1; });
  const accurate = model.buildGenerationBatchTracklist(longBatch.batch, longBatch.rows);
  assert.equal(accurate.preview.rows[20].startSeconds, 2002);
  assert.equal(accurate.preview.rows[20].timestamp, '33:22');
});

test('input boundaries, UUIDs and selection uniqueness are strict', () => {
  assert.equal(model.parseGenerationBatchInput(undefined), null);
  assert.deepEqual(model.parseGenerationBatchInput({ id: batchId, inputCount: 40, trackIndex: 39 }), { id: batchId, inputCount: 40, trackIndex: 39 });
  for (const value of [ {}, { id: batchId, inputCount: 41, trackIndex: 0 }, { id: batchId, inputCount: 10, trackIndex: 10 }, { id: batchId, inputCount: '10', trackIndex: 0 }, { id: 'wrong', inputCount: 10, trackIndex: 0 } ]) {
    assert.throws(() => model.parseGenerationBatchInput(value), { status: 400 });
  }
  assert.throws(() => model.parseGenerationBatchSelection({ expectedRevision: 0, selectedGenerationIds: [id(0), id(0)] }), { status: 400 });
  assert.throws(() => model.parseGenerationBatchSelection({ expectedRevision: -1, selectedGenerationIds: [id(0)] }), { status: 400 });
});

test('admission uses authenticated owner, sends only bounded identity and fails closed for duplicate claims', async () => {
  const server = loadModule('src/lib/generation-batches/server.ts', {
    'server-only': {}, '@/lib/supabase/server': {}, './model': model,
  });
  const calls = [];
  const admin = { rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } };
  const input = { id: batchId, inputCount: 10, trackIndex: 3, userId: 'forged-owner' };
  const fields = await server.ensureGenerationBatch(admin, ownerId, input, 'preset-studio');
  assert.deepEqual(fields, { generation_batch_id: batchId, generation_batch_index: 3, generation_candidate_slot: 'A' });
  assert.deepEqual(calls, [{ name: 'claim_generation_batch_track', args: {
    p_batch_id: batchId, p_user_id: ownerId, p_input_count: 10, p_source_menu: 'preset-studio', p_track_index: 3,
  } }]);
  await assert.rejects(server.ensureGenerationBatch({ rpc: async () => ({ error: { code: '23505' } }) }, ownerId, input, 'preset-studio'), { status: 409 });
  await assert.rejects(server.ensureGenerationBatch({ rpc: async () => ({ error: { code: 'PGRST202' } }) }, ownerId, input, 'preset-studio'), { status: 503 });
  await assert.rejects(server.ensureGenerationBatch(admin, ownerId, input, 'viral'), { status: 400 });
  await assert.rejects(server.ensureGenerationBatch(admin, '', input, 'preset-studio'), { status: 401 });
  await server.ensureGenerationBatch(admin, ownerId, input, 'channel-builder');
  assert.equal(calls[1].args.p_source_menu, 'channel-builder', 'Trusted queue-derived source is supported by the service helper');
});

test('migration keeps admission service-only, owner checks, bounded projection and atomic selection revision', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'migrations/20261007_create_generation_batches.sql'), 'utf8');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_generation_batch_track\([^;]+FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_generation_batch_track\([^;]+TO service_role/);
  assert.match(sql, /b\.user_id = auth\.uid\(\)/);
  assert.match(sql, /LIMIT 80/);
  assert.doesNotMatch(sql, /->> 'durationSeconds'/);
  assert.match(sql, /p_expected_revision <> v_batch\.selection_revision/);
  assert.match(sql, /WHERE id = p_batch_id AND user_id = v_user_id FOR UPDATE/);
  assert.match(sql, /generation_candidate_slot IS NOT NULL/);
  assert.match(sql, /IF TG_OP = 'INSERT' AND COALESCE\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(sql, /EXCEPTION WHEN invalid_text_representation OR untranslatable_character/);
});
