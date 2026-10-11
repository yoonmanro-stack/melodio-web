/* Execute the actual Pet validator and generate POST with offline storage/provider adapters. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const lyricsPolicy = require('../worker/lyrics-policy');

const root = path.resolve(__dirname, '..');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
const contractModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/vle/petEpisode.ts'), 'utf8')), {
  module: contractModule, exports: contractModule.exports,
});
const contract = contractModule.exports;
const routeSource = fs.readFileSync(path.join(root, 'src/app/api/generate/route.ts'), 'utf8');
const routeAst = ts.createSourceFile('generate-route.ts', routeSource, ts.ScriptTarget.Latest, true);
const post = routeAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'POST');
assert.ok(post, 'Exercise the production POST rather than a copied validator');
const postCode = compile(post.getText(routeAst));

function episode(overrides = {}) {
  const lengths = [4, 5, 5, 6, 6, 4];
  return {
    version: 'pet-v3', id: 'pet-audio-fixture', title: '집사만 출근 준비',
    sourceTopic: '고양이는 집사의 출근 준비를 구경한다.', story: '집사는 가방을 들고 고양이는 그대로 눕는다.',
    pov: 'owner_inner_voice', fingerprint: { prop: '가방', conflict: '출근 준비', twist: '고양이는 낮잠' }, candidates: [],
    character: { species: 'cat', appearance: 'Adult grey cat', owner: 'One adult owner', setting: 'One living room', continuity: [] },
    lyrics: '[Verse]\n집사만 출근해 나는 다시 누워', stylePrompt: 'playful Korean acoustic pop', models: [], createdAt: '2026-10-11T00:00:00Z',
    shots: lengths.map((durationSeconds, index) => ({
      id: `S${index + 1}`, startSeconds: lengths.slice(0, index).reduce((a, b) => a + b, 0), durationSeconds,
      beat: '집사의 출근', caption: `출근 준비 장면 ${index + 1}`, action: 'Cat looks toward owner', camera: 'fixed medium shot',
      keyframePrompt: 'One grey cat beside the owner bag', videoPrompt: 'One small natural head turn toward owner',
    })), ...overrides,
  };
}
const instrumental = () => episode({ audioMode: 'instrumental', lyrics: '', stylePrompt: 'playful acoustic instrumental, no vocals' });
const request = (savedEpisode, overrides = {}) => ({
  sourceMenu: 'viral', presetId: 'pet', title: savedEpisode?.title || 'Pet',
  stylePrompt: savedEpisode?.stylePrompt || 'acoustic', lyricsPrompt: savedEpisode?.lyrics || '',
  isInstrumental: contract.isPetInstrumental(savedEpisode), sunoVersion: 'v5.5', isPublic: false,
  metadata: { duration: '30s', durationSeconds: 30, ...(savedEpisode === undefined ? {} : { petEpisode: savedEpisode }) },
  ...overrides,
});

function harness() {
  const events = [], submitted = [], inserted = [];
  const client = {
    auth: { async getUser() { events.push('auth'); return { data: { user: { id: 'offline-owner' } } }; } },
    from(table) {
      assert.equal(table, 'generations');
      const builder = {
        insert(value) { inserted.push(plain(value)); events.push('insert'); return builder; },
        select() { return builder; },
        async single() { return { data: { id: 'offline-track' }, error: null }; },
      };
      return builder;
    },
  };
  const module = { exports: {} };
  const noop = () => {};
  vm.runInNewContext(postCode, {
    module, exports: module.exports, Error, Date,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'offline-only' } },
    console: { log: noop, warn: noop, error: noop },
    NextResponse: { json: (value, init = {}) => ({ status: init.status ?? 200, body: plain(value) }) },
    isViralGenerationAvailable: () => true,
    parseGenerationBatchInput: () => null,
    GenerationBatchError: class GenerationBatchError extends Error {},
    applyVoiceDesignRequest: () => null,
    hasArtistSelection: () => false,
    suppressIneligibleVoice: noop,
    readViralBriefSnapshot: () => null,
    ...contract, ...lyricsPolicy,
    assertExclusiveVoiceSelection: noop,
    resolveOfficialVoice: () => null,
    resolveDiscoveryVoice: () => null,
    createClient: async () => client,
    createSupabaseClient: () => client,
    async generateSongMetadata() { events.push('metadata'); return { title: 'offline-title', description: 'offline', tags: 'pet', source: 'basic', model: null }; },
    getGenreFallback: () => '/track-cover-pending.svg',
    isPresetStudioSource: () => false,
    sealSunoRetryIdentity: () => ({}),
    async submitSunoJob(payload) {
      events.push('music'); submitted.push(plain(payload));
      return { taskId: 'offline-task', model: 'V6', requestedDurationSeconds: 30, durationMode: 'short-form', durationSource: 'viral' };
    },
    sunoVersionLabel: () => 'v6', kieTaskReference: id => `kie:${id}`,
    inferGenreLabel: () => 'Pet', inferVocalLabel: value => value.isInstrumental ? 'Instrumental' : 'Vocal',
    fetch: async () => { throw Error('Unexpected network access'); },
    require(name) {
      if (name === '@/lib/db/knowledge') return { getPlaybookByKey: async () => null, matchPlaybooksByPrompt: async () => [] };
      if (name === '@/lib/voice-dna-scrubber') return { scrubConflictingVocalTags: value => value };
      throw Error(`Unmocked POST dependency ${name}`);
    },
  }, { filename: 'src/app/api/generate/route.ts' });
  return {
    events, submitted, inserted,
    post: value => module.exports.POST({ json: async () => structuredClone(value) }),
    saved: () => inserted.length ? JSON.parse(inserted.at(-1).license_hash) : null,
  };
}

test('instrumental Pet with empty sung lyrics reaches submission (regression: original 400)', async () => {
  const plan = instrumental(); const h = harness(); const result = await h.post(request(plan));
  assert.equal(result.status, 200, result.body.error); assert.equal(result.body.track.id, 'offline-track');
  assert.equal(contract.validatePetEpisode(plan).length, 0);
  assert.equal(h.submitted.length, 1); assert.equal(h.submitted[0].isInstrumental, true);
  assert.equal(h.submitted[0].lyricsPrompt, ''); assert.equal(h.submitted[0].isViral, true);
  assert.deepEqual(h.saved().petEpisode, plan); assert.equal(h.saved().lyricsPrompt, '');
  assert.equal(h.saved().petEpisode.shots.filter(shot => shot.caption).length, 6);
});

test('vocal and legacy-vocal episodes submit exact lyrics without rewriting saved identities', async () => {
  for (const plan of [episode(), episode({ audioMode: 'vocal' })]) {
    const before = JSON.stringify(plan); const h = harness(); const result = await h.post(request(plan));
    assert.equal(result.status, 200, result.body.error); assert.equal(h.submitted[0].isInstrumental, false);
    assert.equal(h.submitted[0].lyricsPrompt, plan.lyrics); assert.deepEqual(h.saved().petEpisode, plan);
    assert.equal(JSON.stringify(plan), before);
    assert.equal(Object.hasOwn(h.saved().petEpisode, 'audioMode'), Object.hasOwn(plan, 'audioMode'));
  }
});

test('structured vocal lyrics are canonicalized before Pet snapshot equality is evaluated', async () => {
  const plan = episode(); const h = harness();
  const result = await h.post(request(plan, { lyricsPrompt: 'stale client string', lyricsSections: [{ type: 'verse', content: '집사만 출근해 나는 다시 누워' }] }));
  assert.equal(result.status, 200, result.body.error); assert.equal(h.submitted[0].lyricsPrompt, plan.lyrics);
  assert.equal(h.saved().lyricsPrompt, plan.lyrics);
  const tampered = harness(); const mismatch = await tampered.post(request(plan, {
    lyricsSections: [{ type: 'verse', content: '다른 가사를 노래해' }],
  }));
  assert.equal(mismatch.status, 400); assert.match(mismatch.body.error, /콘티의 가사/);
  assert.deepEqual(tampered.events, []);
});

test('instrumental Pet cannot hide sung structured lyrics behind an empty lyricsPrompt', async () => {
  const h = harness(); const result = await h.post(request(instrumental(), {
    lyricsSections: [{ type: 'chorus', content: '숨겨진 가사를 노래해' }],
  }));
  assert.equal(result.status, 400); assert.match(result.body.error, /콘티의 가사/);
  assert.deepEqual(h.events, []); assert.equal(h.inserted.length, 0);
});

test('boolean audio flags must agree with the episode before metadata, music or storage', async () => {
  for (const [plan, flags] of [
    [instrumental(), [false, undefined, null, 'true', 'false', 1]],
    [episode(), [true, undefined, null, 'false', 0]],
    [episode({ audioMode: 'vocal' }), [true]],
  ]) {
    for (const isInstrumental of flags) {
      const h = harness(); const result = await h.post(request(plan, { isInstrumental }));
      assert.equal(result.status, 400, `Unexpected acceptance of ${String(isInstrumental)}`);
      assert.match(result.body.error, /음악 모드/); assert.deepEqual(h.events, []);
      assert.equal(h.submitted.length, 0); assert.equal(h.inserted.length, 0);
    }
  }
});

test('malformed modes and contradictory or absent lyrics are rejected at the Pet contract', async () => {
  for (const plan of [
    ...[null, false, true, '', 'Instrumental', 'other', 0, {}].map(audioMode => episode({ audioMode })),
  ]) {
    assert.ok(contract.validatePetEpisode(plan).some(issue => issue.includes('음악 모드')));
    const h = harness(); assert.equal((await h.post(request(plan))).status, 400); assert.deepEqual(h.events, []);
  }
  for (const plan of [episode({ lyrics: '' }), episode({ audioMode: 'vocal', lyrics: ' ' }),
    ...[' ', '숨겨진 가사', null, undefined].map(lyrics => episode({ audioMode: 'instrumental', lyrics }))]) {
    assert.ok(contract.validatePetEpisode(plan).length);
    const h = harness(); assert.equal((await h.post(request(plan))).status, 400); assert.deepEqual(h.events, []);
  }
});

test('fresh Pet requests require a valid episode snapshot and matching submitted lyrics', async () => {
  for (const input of [request(undefined), request(null), request(false),
    request(instrumental(), { lyricsPrompt: '가사는 넣을 수 없어' }),
    request(episode(), { lyricsPrompt: '' }), request(episode(), { lyricsPrompt: '다른 가사' })]) {
    const h = harness(); assert.equal((await h.post(input)).status, 400); assert.deepEqual(h.events, []);
  }
});

test('instrumental helper never infers mode from lyrics, style or a false mode value', () => {
  assert.equal(contract.isPetInstrumental(episode()), false);
  assert.equal(contract.isPetInstrumental(episode({ audioMode: 'vocal', stylePrompt: 'instrumental' })), false);
  assert.equal(contract.isPetInstrumental(episode({ audioMode: false, lyrics: '' })), false);
  assert.equal(contract.isPetInstrumental(instrumental()), true);
});
