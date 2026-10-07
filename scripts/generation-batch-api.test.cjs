/* Actual generate POST + batch admission code with offline DB/provider adapters. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = process.cwd();
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
function load(relativePath, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, relativePath), 'utf8')), {
    module, exports: module.exports, Error, URL,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unmocked dependency ${name}`); return dependencies[name]; },
    ...globals,
  }, { filename: relativePath });
  return module.exports;
}
const model = load('src/lib/generation-batches/model.ts');
const server = load('src/lib/generation-batches/server.ts', {
  'server-only': {}, '@/lib/supabase/server': {}, './model': model,
});
const routePath = 'src/app/api/generate/route.ts';
const routeSource = fs.readFileSync(path.join(root, routePath), 'utf8');
const routeAst = ts.createSourceFile(routePath, routeSource, ts.ScriptTarget.Latest, true);
const postNode = routeAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'POST');
assert.ok(postNode, 'The production POST must be exercised');
const postCode = compile(postNode.getText(routeAst));
const batchId = '12345678-1234-4123-8123-123456789000';
const ownerId = '12345678-1234-4123-8123-123456789001';
const queueId = '12345678-1234-4123-8123-123456789002';
const generationId = '12345678-1234-4123-8123-123456789003';
const input = () => ({ id: batchId, inputCount: 10, trackIndex: 3 });
const body = overrides => ({ sourceMenu: 'audio', stylePrompt: 'Jazz, warm piano',
  isInstrumental: true, title: 'An actual original song', lyricsPrompt: '', sunoVersion: 'V6',
  generationBatch: input(), ...overrides });
const plain = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(setImmediate);

function harness(options = {}) {
  const events = [], claims = [], inserted = [], queueWrites = [], queries = [];
  const claimed = new Set();
  const user = options.user === null ? null : { id: ownerId };
  const queueItem = { id: queueId, batch_id: batchId, track_number: 4,
    title: 'An actual original song', style_prompt: 'Jazz, warm piano', exclude_prompt: '',
    lyrics_prompt: '', lyrics_sections: [], is_instrumental: true, status: 'ready' };
  function from(table) {
    const query = { table, filters: [], value: null, columns: undefined };
    queries.push(query);
    const builder = {
      select(columns) { query.columns = columns; return builder; },
      eq(column, value) { query.filters.push([column, value]); return builder; },
      insert(value) { assert.equal(table, 'generations'); query.value = plain(value); inserted.push(query.value); events.push('insert'); return builder; },
      update(value) { assert.equal(table, 'generation_queue_items'); query.value = plain(value); queueWrites.push(query.value); return builder; },
      async single() {
        if (table === 'generations') return { data: { id: generationId }, error: null };
        if (table === 'generation_queue_items') return { data: queueItem, error: null };
        if (table === 'episode_generation_batches') return { data: { id: batchId, total_blueprints: options.queueCount ?? 10 }, error: null };
        throw Error(`Unmocked table ${table}`);
      },
      async maybeSingle() {
        assert.equal(table, 'generation_queue_items'); events.push('queue_claim');
        return { data: options.queueClaimDenied ? null : { id: queueId }, error: null };
      },
      then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
    };
    return builder;
  }
  const client = { auth: { getUser: async () => { events.push('auth'); return { data: { user }, error: null }; } }, from,
    async rpc(name, args) {
      assert.equal(name, 'claim_generation_batch_track');
      claims.push({ name, args: plain(args) }); events.push('batch_claim');
      if (options.claimGate) await options.claimGate;
      if (options.claimError) return { error: { code: options.claimError } };
      const key = `${args.p_batch_id}:${args.p_track_index}`;
      if (claimed.has(key)) return { error: { code: '23505' } };
      claimed.add(key);
      return { error: null };
    },
  };
  const module = { exports: {} };
  const noop = () => {};
  vm.runInNewContext(postCode, {
    module, exports: module.exports, Error,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'offline-only', ...options.env } },
    console: { log: noop, error: noop, warn: noop },
    NextResponse: { json: (value, init = {}) => ({ status: init.status ?? 200, body: plain(value) }) },
    parseGenerationBatchInput: model.parseGenerationBatchInput,
    GenerationBatchError: model.GenerationBatchError,
    ensureGenerationBatch: server.ensureGenerationBatch,
    createClient: async () => client,
    createSupabaseClient: () => client,
    applyVoiceDesignRequest: () => null,
    hasArtistSelection: () => false,
    suppressIneligibleVoice: noop,
    compileLyricsSections: () => ({ lyricsPrompt: '' }),
    assertSafeVocalLyrics: noop,
    assertExclusiveVoiceSelection: noop,
    resolveOfficialVoice: () => null,
    resolveDiscoveryVoice: () => null,
    prepareLyricsSubmission: payload => ({ stylePrompt: payload.stylePrompt, lyricsPrompt: payload.lyricsPrompt }),
    async generateSongMetadata() {
      events.push('metadata');
      if (options.metadataFailure) throw Error('offline_metadata_failed');
      return { title: 'Metadata song title', description: 'A single real song', tags: 'jazz', source: 'basic', model: null };
    },
    getGenreFallback: () => '/track-cover-pending.svg',
    async submitSunoJob() {
      events.push('suno');
      return { taskId: 'offline-task', model: 'V6', durationMode: 'full-song', durationSource: 'studio-natural' };
    },
    sunoVersionLabel: () => 'v6',
    kieTaskReference: taskId => `kie:${taskId}`,
    inferGenreLabel: () => 'Jazz',
    inferVocalLabel: () => 'Instrumental',
    LyricsInstructionError: class LyricsInstructionError extends Error {},
    fetch: async () => { throw Error('Unexpected network access'); },
    require(name) {
      if (name === '@/lib/voice-dna-scrubber') return { scrubConflictingVocalTags: value => value };
      if (name === '@/lib/db/knowledge') return { getPlaybookByKey: async () => null, matchPlaybooksByPrompt: async () => [] };
      throw Error(`Unmocked POST dependency ${name}`);
    },
  }, { filename: routePath });
  return { events, claims, inserted, queueWrites, queries,
    post: value => module.exports.POST({ json: async () => structuredClone(value) }),
    paidCalls: () => events.filter(event => event === 'metadata' || event === 'suno'),
  };
}

test('malformed batch identity is rejected before authentication, claim, metadata or music submission', async () => {
  for (const generationBatch of [ {}, { ...input(), id: 'invalid' }, { ...input(), inputCount: 41 },
    { ...input(), inputCount: '10' }, { ...input(), trackIndex: 10 }, { ...input(), trackIndex: -1 } ]) {
    const h = harness(); const result = await h.post(body({ generationBatch }));
    assert.equal(result.status, 400); assert.equal(result.body.code, 'invalid_batch');
    assert.deepEqual(h.events, []); assert.equal(h.inserted.length, 0);
  }
});

test('unauthenticated batch and unavailable batch storage fail before paid calls', async () => {
  for (const [options, status, code] of [
    [{ user: null }, 401, 'authentication_required'],
    [{ env: { SUPABASE_SERVICE_ROLE_KEY: '' } }, 503, 'batch_unavailable'],
  ]) {
    const h = harness(options); const result = await h.post(body());
    assert.equal(result.status, status); assert.equal(result.body.code, code);
    assert.equal(h.claims.length, 0); assert.deepEqual(h.paidCalls(), []); assert.equal(h.inserted.length, 0);
  }
});

test('raw channel, queue, viral and sample grouping is refused before paid calls', async () => {
  for (const change of [
    { sourceMenu: 'channel-builder' }, { queueItemId: queueId }, { sourceMenu: 'viral' }, { sourceMenu: 'viral-cf' },
    { isViral: true }, { isViralTrack: true }, { voiceDesign: {} },
    { metadata: { petEpisode: {} } }, { metadata: { storyPlan: {} } }, { sourceMenu: 'voice-discovery-sample' },
  ]) {
    const h = harness(); const result = await h.post(body(change));
    assert.equal(result.status, 400); assert.equal(result.body.code, 'invalid_batch');
    assert.equal(h.claims.length, 0); assert.deepEqual(h.paidCalls(), []); assert.equal(h.inserted.length, 0);
  }
});

test('claim failures are mapped before metadata and Suno, including duplicate submissions', async () => {
  for (const [claimError, status, code] of [
    ['23505', 409, 'batch_conflict'], ['40001', 409, 'batch_conflict'],
    ['42501', 403, 'batch_forbidden'], ['XX000', 503, 'batch_unavailable'],
  ]) {
    const h = harness({ claimError }); const result = await h.post(body());
    assert.equal(result.status, status); assert.equal(result.body.code, code);
    assert.equal(h.claims.length, 1); assert.deepEqual(h.paidCalls(), []); assert.equal(h.inserted.length, 0);
  }
  const h = harness();
  assert.equal((await h.post(body())).status, 200);
  const duplicate = await h.post(body());
  assert.equal(duplicate.status, 409); assert.equal(duplicate.body.code, 'batch_conflict');
  assert.deepEqual(h.paidCalls(), ['metadata', 'suno']); assert.equal(h.inserted.length, 1);
});

test('admission must finish before any paid call, and normal inserts store the exact authenticated A identity', async () => {
  let admit;
  const h = harness({ claimGate: new Promise(resolve => { admit = resolve; }) });
  const pending = h.post(body({ generationBatch: { ...input(), userId: 'forged-owner', candidateSlot: 'B' }, user_id: 'forged-owner' }));
  await flush();
  assert.equal(h.claims.length, 1); assert.deepEqual(h.paidCalls(), []); assert.equal(h.inserted.length, 0);
  admit();
  const result = await pending;
  assert.equal(result.status, 200); assert.equal(result.body.success, true);
  assert.deepEqual(h.claims[0].args, { p_batch_id: batchId, p_user_id: ownerId, p_input_count: 10, p_source_menu: 'audio', p_track_index: 3 });
  assert.deepEqual(h.events.filter(event => event !== 'auth'), ['batch_claim', 'metadata', 'suno', 'insert']);
  assert.equal(h.inserted[0].generation_batch_id, batchId);
  assert.equal(h.inserted[0].generation_batch_index, 3);
  assert.equal(h.inserted[0].generation_candidate_slot, 'A');
  assert.equal(h.inserted[0].user_id, ownerId);
});

test('ordinary supported menus retain exact batch fields while legacy requests without a batch remain ungrouped', async () => {
  for (const sourceMenu of ['audio', 'audio-forge', 'preset-studio', 'style-library', 'japan']) {
    const h = harness(); const result = await h.post(body({ sourceMenu }));
    assert.equal(result.status, 200, sourceMenu); assert.equal(h.claims[0].args.p_source_menu, sourceMenu);
    assert.equal(h.inserted[0].generation_candidate_slot, 'A');
  }
  const h = harness({ user: null }); const result = await h.post(body({ generationBatch: undefined }));
  assert.equal(result.status, 200); assert.equal(h.claims.length, 0);
  assert.deepEqual(h.paidCalls(), ['metadata', 'suno']);
  for (const key of ['generation_batch_id', 'generation_batch_index', 'generation_candidate_slot']) assert.equal(Object.hasOwn(h.inserted[0], key), false);
  assert.equal(h.inserted[0].user_id, null);
});

test('trusted channel queue uses server batch count and zero-based order only after the queue claim', async () => {
  for (const queueCount of [10, 40]) {
    const h = harness({ queueCount });
    const result = await h.post(body({ generationBatch: undefined, sourceMenu: 'channel-builder', queueItemId: queueId, batchInputCount: 999, batchTrackIndex: 999 }));
    assert.equal(result.status, 200); assert.equal(h.claims.length, 1);
    assert.deepEqual(h.claims[0].args, { p_batch_id: batchId, p_user_id: ownerId, p_input_count: queueCount, p_source_menu: 'channel-builder', p_track_index: 3 });
    assert.deepEqual(h.events.filter(event => event !== 'auth'), ['queue_claim', 'batch_claim', 'suno', 'insert']);
    assert.equal(h.inserted[0].generation_batch_index, 3);
    assert.equal(h.queueWrites.at(-1).generation_id, generationId);
    assert.equal(h.queueWrites.at(-1).status, 'generating');
  }
  const large = harness({ queueCount: 41 });
  assert.equal((await large.post(body({ generationBatch: undefined, sourceMenu: 'channel-builder', queueItemId: queueId }))).status, 200);
  assert.equal(large.claims.length, 0); assert.equal(Object.hasOwn(large.inserted[0], 'generation_batch_id'), false);
  const denied = harness({ queueClaimDenied: true });
  assert.equal((await denied.post(body({ generationBatch: undefined, sourceMenu: 'channel-builder', queueItemId: queueId }))).status, 409);
  assert.equal(denied.claims.length, 0); assert.deepEqual(denied.paidCalls(), []);
});

test('an error after durable admission does not silently release the claim and charge a retry', async () => {
  const h = harness({ metadataFailure: true });
  assert.equal((await h.post(body())).status, 500);
  assert.equal((await h.post(body())).status, 409);
  assert.deepEqual(h.paidCalls(), ['metadata']); assert.equal(h.inserted.length, 0);
});
