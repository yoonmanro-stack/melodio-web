/* Offline creation policy tests. No provider, storage, or database mutations are permitted. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(overrides = {}, fallback) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      const mocked = fallback?.(name); if (mocked !== undefined) return mocked;
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
      return require(name);
    };
    new Function('require', 'module', 'exports', 'process', 'fetch', 'console', code)(localRequire, mod, mod.exports,
      { env: {} }, () => { throw Error('REAL_NETWORK_FORBIDDEN'); }, { warn() {}, error() {}, info() {}, log() {} });
    return mod.exports;
  }
  return load;
}
const load = loader();
const policy = load('src/lib/vle/viralCategoryAvailability.ts');
const { isViralGenerationAvailable, isActiveViralTrackCategory } = load('src/lib/vle/viralGenerationAvailability.ts');
const disabled = ['drama', 'relationship', 'human', 'trend', 'challenge', 'brand', 'history', 'parenting', 'food_diet', 'horror_mystery', 'ai_future'];
test('the visible policy has two categories, and the old dance alias cannot become a third choice', () => {
  assert.deepEqual(policy.ACTIVE_VIRAL_CATEGORY_IDS, ['pet', 'dance_challenge']);
  for (const category of policy.ACTIVE_VIRAL_CATEGORY_IDS) assert.equal(policy.isActiveViralCategory(category), true);
  for (const category of [...disabled, 'dance', null, {}, '', undefined]) assert.equal(policy.isActiveViralCategory(category), false);
  assert.equal(policy.normalizeActiveViralCategory('dance'), 'dance_challenge');
});
test('audio and lyric guards reject disabled IDs through every legacy alias and conflicting snapshots', () => {
  for (const category of disabled) {
    for (const sourceMenu of ['viral', 'viral-cf', 'short-form']) assert.equal(isViralGenerationAvailable({ sourceMenu, presetId: category }), false);
    for (const flag of ['isViral', 'isViralTrack', 'viralMode']) assert.equal(isViralGenerationAvailable({ [flag]: true, presetId: category, isInstrumental: true }), false);
    for (const key of ['genCategory', 'tab_type', 'presetId', 'categoryId']) {
      assert.equal(isViralGenerationAvailable({ metadata: { [key]: category } }), false);
      assert.equal(isViralGenerationAvailable({ sourceMenu: 'viral', presetId: 'pet', metadata: { [key]: category } }), false);
    }
    assert.equal(isViralGenerationAvailable({ metadata: { viralBrief: { categoryId: category } } }), false);
    assert.equal(isViralGenerationAvailable({ sourceMenu: 'viral', presetId: 'pet', category }), false);
  }
  assert.equal(isViralGenerationAvailable({ sourceMenu: 'viral' }), false);
  assert.equal(isViralGenerationAvailable({ sourceMenu: 'viral', presetId: 'pet', metadata: { viralBrief: { categoryId: 'dance_challenge' } } }), false);
  assert.equal(isViralGenerationAvailable({ sourceMenu: 'viral', presetId: 'pet', metadata: { petEpisode: {} } }), true);
  assert.equal(isViralGenerationAvailable({ sourceMenu: 'viral', presetId: 'dance', metadata: { genCategory: 'dance_challenge' } }), true);
  for (const sourceMenu of ['audio', 'japan', 'preset-studio', 'channel-builder']) {
    assert.equal(isViralGenerationAvailable({ sourceMenu, presetId: 'ordinary-music-preset', stylePrompt: 'jazz' }), true);
    assert.equal(isViralGenerationAvailable({ sourceMenu, category: 'classical', metadata: { categoryId: 'ordinary-music-category' } }), true);
  }
  assert.equal(isViralGenerationAvailable({ sourceMenu: 'dance', presetId: 'dance-hook-instrumental-v1' }), true);
});
test('stored audio category must agree across all saved aliases before legacy video submission', () => {
  assert.equal(isActiveViralTrackCategory({ presetId: 'pet', genCategory: 'pet' }, 'pet'), true);
  assert.equal(isActiveViralTrackCategory({ presetId: 'dance_challenge', genCategory: 'dance' }, 'dance'), true);
  assert.equal(isActiveViralTrackCategory({}, 'pet'), false);
  for (const category of disabled) {
    assert.equal(isActiveViralTrackCategory({ presetId: category }, 'pet'), false);
    assert.equal(isActiveViralTrackCategory({ presetId: 'pet', metadata: { tab_type: category } }, 'pet'), false);
    assert.equal(isActiveViralTrackCategory({ presetId: 'pet', viralBrief: { categoryId: category } }, 'pet'), false);
  }
});
function routeFixture(options = {}) {
  const calls = [];
  const denied = name => () => { calls.push(name); throw Error('UNEXPECTED_SIDE_EFFECT'); };
  const overrides = {
    'next/server': { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), init) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
      from: () => { const query = { select() { return query; }, eq() { return query; }, order() { return query; },
        then(resolve) { return Promise.resolve({ data: options.playbooks ?? [], error: options.dbError ?? null }).then(resolve); },
        async limit() { calls.push('track-read'); return { data: options.tracks ?? [], error: null }; } }; return query; } }) },
    '@supabase/supabase-js': { createClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; },
      async order() { return { data: options.playbooks ?? [], error: options.dbError ?? null }; } }) }) },
    '@/lib/video/petMedia': { readPetBoundedBody: async response => Buffer.from(await response.arrayBuffer()) },
    '@/lib/engines/lyrics-generator': { generateLyrics: async input => { calls.push({ lyrics: input }); return { title: 'offline result' }; } },
    '@/lib/preset-studio-profile': { isPresetStudioSource: source => source === 'preset-studio' },
    '@/lib/artists/generation': { hasArtistSelection: () => false },
    '@/lib/voice/studio-selection': { suppressIneligibleVoice() {} },
    '@/lib/generation-batches/model': { parseGenerationBatchInput: denied('batch-parse') },
    '@/lib/generation-batches/server': { ensureGenerationBatch: denied('batch-write') },
  };
  const routeLoad = loader(overrides, name => {
    if (name.includes('viralCategoryAvailability')) return policy;
    if (name.includes('viralGenerationAvailability')) return { isViralGenerationAvailable, isActiveViralTrackCategory };
    if (name.startsWith('@/') || name.startsWith('../../../../worker/')) return {};
  });
  const request = body => { const req = new Request('https://melodio.example.test/api', { method: 'POST', headers: {
    'content-type': 'application/json', origin: 'https://melodio.example.test',
  }, body: JSON.stringify(body) }); req.nextUrl = new URL(req.url); return req; };
  return { calls, request, route: relative => routeLoad(relative) };
}
test('paid API entries reject disabled creation before planning, generation-batch writes, or provider access', async () => {
  for (const file of ['src/app/api/generate/route.ts', 'src/app/api/lyrics/generate/route.ts',
    'src/app/api/viral-cf/producer-brief/route.ts', 'src/app/api/viral-cf/grok-video/prompt/route.ts', 'src/app/api/viral-cf/grok-video/route.ts']) {
    const c = routeFixture(); const route = c.route(file);
    const body = { sourceMenu: 'viral', presetId: 'drama', category: 'drama', stylePrompt: 'test', topic: 'test', lyrics: 'test', generationBatch: { enabled: true } };
    // Routes with exact input schemas only receive their permitted fields.
    const input = file.includes('producer-brief') ? { category: 'drama' }
      : file.includes('/prompt/') ? { category: 'drama', lyrics: 'test' } : body;
    const response = await route.POST(c.request(input));
    assert.equal(response.status, 400, file); assert.equal((await response.json()).code, policy.VIRAL_CATEGORY_DISABLED_CODE, file);
    assert.deepEqual(c.calls, [], file);
  }
});
test('lyrics permit both active categories and genuine music menus using their existing generator', async () => {
  const c = routeFixture(); const route = c.route('src/app/api/lyrics/generate/route.ts');
  for (const input of [{ sourceMenu: 'viral', presetId: 'pet' }, { sourceMenu: 'viral', presetId: 'dance_challenge' },
    { sourceMenu: 'japan', presetId: 'kawaii-future' }, { sourceMenu: 'preset-studio', presetId: 'city-pop' }]) {
    assert.equal((await route.POST(c.request({ ...input, stylePrompt: 'upbeat' }))).status, 200);
  }
  assert.equal(c.calls.length, 4);
});
test('presets show active DB categories and pet fallback without guessing missing category metadata', async () => {
  const c = routeFixture({ playbooks: [{ id: 'pet', title: 'cat', content: '', metadata: { tab_type: 'pet' } },
    { id: 'dance', title: 'dance', content: '', metadata: { tab_type: 'dance' } },
    { id: 'old', title: 'old', content: '', metadata: { tab_type: 'drama' } }, { id: 'unknown', title: 'unknown', content: '', metadata: {} }] });
  const data = await (await c.route('src/app/api/viral-cf/presets/route.ts').GET(c.request({}))).json();
  assert.deepEqual(data.presets.map(item => item.tab_type), ['pet', 'dance_challenge']);
  const fallback = routeFixture({ dbError: { message: 'offline' } });
  const fallbackData = await (await fallback.route('src/app/api/viral-cf/presets/route.ts').GET(fallback.request({}))).json();
  assert.ok(fallbackData.presets.length > 0); assert.ok(fallbackData.presets.every(item => item.tab_type === 'pet'));
});
test('legacy video cannot submit a disabled saved song by relabeling the request as pet', async () => {
  const c = routeFixture({ tracks: [{ license_hash: JSON.stringify({ presetId: 'drama' }) }] });
  const response = await c.route('src/app/api/viral-cf/grok-video/route.ts').POST(c.request({ category: 'pet', prompt: 'test', audioUrl: 'https://assets.example.test/song.mp3' }));
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'TRACK_CATEGORY');
  assert.deepEqual(c.calls, ['track-read']);
});
const story = load('src/lib/video/viralStoryPipeline.ts');
const USER = 'a0000000-0000-4000-8000-000000000001', TRACK = 'a0000000-0000-4000-8000-000000000002', JOB = 'a0000000-0000-4000-8000-000000000003';
const storyInput = { prompt: 'An adult opens her bag and finds the missing key.', category: 'drama', allowDance: false, cutCadenceSeconds: 1.5 };
function storyFixture(status = 'audio') {
  const now = 1_000_000; const sourceAudioUrl = 'https://assets.example.test/audio.mp3'; const calls = [];
  const item = (name, durationSeconds) => ({ url: `https://assets.example.test/${name}`, hash: 'a'.repeat(64), durationSeconds });
  const job = { version: 1, promptVersion: 2, id: JOB, trackId: TRACK, input: storyInput,
    inputFingerprint: story.viralStoryInputFingerprint(TRACK, sourceAudioUrl, storyInput, 2),
    prompts: story.compileViralStoryPrompts(storyInput, 2), sourceAudioUrl, status,
    clips: [{ status: 'empty' }, { status: 'empty' }], createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  if (status === 'held') { job.failedOperation = 'audio'; job.failureCode = 'TRANSIENT_IO'; }
  if (status === 'completed') { job.audio = item('audio', 29.8); job.bridge = { url: 'https://assets.example.test/frame.jpg', hash: 'a'.repeat(64) };
    job.clips = [0, 1].map(index => ({ status: 'ready', submittedAt: job.updatedAt, asset: item(`clip${index}.mp4`, 15) })); job.final = item('final.mp4', 30); }
  const record = { id: TRACK, userId: USER, status: 'completed', audioUrl: sourceAudioUrl, licenseHash: 'unchanged',
    metadata: { genCategory: 'drama', viralVideoJob: job, unrelated: { keep: true } } };
  const denied = name => async () => { calls.push(name); throw Error('UNEXPECTED_SIDE_EFFECT'); };
  const service = story.createViralStoryPipeline({ now: () => now, store: { load: async () => structuredClone(record), compareAndSwap: denied('write') },
    snapshotAudio: denied('audio'), startVideo: denied('paid-video'), pollVideo: denied('poll'), archiveClip: denied('copy'), extractBridge: denied('frame'), render: denied('render') });
  return { service, record, calls };
}
test('archived story jobs keep read and completed replay while unfinished create/advance/resume have no effects', async () => {
  for (const status of ['audio', 'held']) {
    const c = storyFixture(status); const before = JSON.stringify(c.record);
    const view = await c.service.get(USER, TRACK, JOB); assert.equal(view.status, status); assert.equal(view.canResume, false);
    for (const action of ['advance', 'resume']) await assert.rejects(c.service[action](USER, TRACK, JOB), { code: policy.VIRAL_CATEGORY_DISABLED_CODE });
    await assert.rejects(c.service.create(USER, TRACK, JOB, storyInput), { code: policy.VIRAL_CATEGORY_DISABLED_CODE });
    assert.equal(JSON.stringify(c.record), before); assert.deepEqual(c.calls, []);
  }
  const c = storyFixture('completed'); const before = JSON.stringify(c.record);
  for (const action of ['get', 'advance', 'resume']) {
    const view = await c.service[action](USER, TRACK, JOB); assert.equal(view.videoUrl, 'https://assets.example.test/final.mp4');
    assert.equal(story.completedViralStoryResponse(view).durationSeconds, 30);
  }
  assert.equal(JSON.stringify(c.record), before); assert.deepEqual(c.calls, []);
});
