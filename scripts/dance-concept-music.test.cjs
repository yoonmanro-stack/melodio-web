/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
function loader(overrides = {}, fetchImpl = () => { throw Error('NETWORK_FORBIDDEN'); }) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative); if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const local = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`)
      : name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', js)(local, mod, mod.exports,
      { env: { OPENAI_API_KEY: 'offline-planner-key', KIE_API_KEY: 'offline-music-key', NEXT_PUBLIC_SUPABASE_URL: 'https://storage.test', SUPABASE_SERVICE_ROLE_KEY: 'offline-admin-key' } }, fetchImpl);
    return mod.exports;
  }
  return load;
}
const load = loader();
const { createDanceMusicService, danceMusicInput, musicMetadata, danceConceptCheckpoint, isActiveDanceMusic } = load('src/lib/dance/music.ts');
const { createDanceConceptMusicPlan, validateDanceConceptMusicPlan } = load('src/lib/dance/conceptMusicPlan.ts');
const { resolveDanceMusicSpec, DANCE_MUSIC_PROFILES } = load('src/lib/dance/musicProfiles.ts');
const USER = 'a0000000-0000-4000-8000-000000000001', OTHER = 'a0000000-0000-4000-8000-000000000002';
const ID = 'b0000000-0000-4000-8000-000000000001', NEXT = 'b0000000-0000-4000-8000-000000000002';
const STAMP = '2026-10-10T12:00:00.000Z';
const INPUT = { requestId: ID, isPublic: false, musicMode: 'concept', coreContext: '퇴근 준비를 하던 두 동료가 작은 실수를 같이 웃어넘기는 리듬 있는 순간' };
const RAW = { title: '서로 웃는 퇴근길', genre: 'Original syncopated dance R&B', bpm: 104, instrumental: false, language: 'ko', vocalGender: 'female',
  style: 'Original syncopated R&B dance song, 104 BPM, dry drums, nimble bass, responsive keys, amused female vocal, immediate hook, clear contrasting bridge and complete natural ending.',
  exclude: 'borrowed melodies, artist imitation, celebrity voices, abrupt ending', lyrics: '[Verse]\n잠깐 멈춘 손끝에 네 웃음이 닿아\n[Chorus]\n내 실수도 네 리듬도 같이 웃어넘겨\n[Outro]\n다시 걸어가는 우리', rhythmPurpose: '작은 실수에 대한 서로의 반응과 함께 웃는 체중 이동' };
const normalized = input => ({ ...input, vocalPreference: input.vocalPreference || 'recommended' });
const planFor = input => validateDanceConceptMusicPlan(RAW, normalized(input));
function fixture(overrides = {}) {
  const rows = new Map(), calls = [], tokens = []; let clock = new Date(STAMP);
  const repository = {
    find: async id => rows.has(id) ? structuredClone(rows.get(id)) : null,
    list: async (user, id) => [...rows.values()].filter(row => row.user_id === user && (!id || id === row.id)).map(row => structuredClone(row)),
    active: async user => [...rows.values()].find(row => row.user_id === user && isActiveDanceMusic(row)) || null,
    insert: async row => { if (rows.has(row.id)) return false; rows.set(row.id, structuredClone(row)); calls.push('reserve'); return true; },
    updatePending: async (previous, change) => {
      const current = rows.get(previous.id), token = danceConceptCheckpoint(previous);
      if (!current || current.user_id !== previous.user_id || current.status !== 'generating' || current.source_audio_url !== null
        || (token ? danceConceptCheckpoint(current) !== token : current.license_hash !== previous.license_hash)) return false;
      rows.set(previous.id, { ...current, ...change }); if (token) tokens.push(danceConceptCheckpoint(rows.get(previous.id))); return true;
    },
  };
  const deps = { repository, storageOrigin: 'https://storage.test', now: () => clock,
    planConceptMusic: async input => { calls.push('plan'); const meta = musicMetadata(rows.get(input.requestId));
      assert.equal(meta.danceMusicPlanning.planningSubmitted, true); assert.equal(meta.danceMusicPlanning.state, 'submitting'); return planFor(input); },
    submit: async options => { calls.push({ submit: options }); const meta = musicMetadata(rows.get(ID));
      if (meta.danceMusicMode === 'concept') { assert.equal(meta.danceMusicPlanning.state, 'planned'); assert.equal(meta.danceSubmission.state, 'submitting'); assert.equal(meta.stylePrompt, options.style); }
      return { taskId: 'new-audio-task', model: 'V6' }; }, ...overrides };
  return { service: createDanceMusicService(deps), rows, calls, tokens, repository, tick: milliseconds => { clock = new Date(clock.getTime() + milliseconds); } };
}
test('concept input accepts1000 Korean characters and rejects unauthorized modes, context and locks before spending', () => {
  const input = danceMusicInput({ ...INPUT, coreContext: '가'.repeat(1000) }); assert.equal(input.coreContext.length, 1000); assert.equal(input.vocalPreference, 'recommended');
  for (const extra of [{ coreContext: '' }, { coreContext: '가'.repeat(1001) }, { coreContext: 'data:invalid' }, { musicProfileId: 'auto' }, { vocalPreference: 'female' }, { style: 'override' }, { musicMode: 'unknown' }]) {
    assert.throws(() => danceMusicInput({ ...INPUT, ...extra }));
  }
});
test('one winning reservation plans once, persists full recipe/context, then submits exactly that new recipe', async () => {
  const c = fixture(); const first = await c.service.create(USER, INPUT), second = await c.service.create(USER, { ...INPUT, coreContext: 'different late input' });
  assert.equal(first.id, second.id); assert.equal(first.musicMode, 'concept'); assert.equal(first.coreContext, INPUT.coreContext); assert.equal(first.musicPlanningState, 'planned');
  assert.deepEqual(c.calls.filter(call => typeof call === 'string'), ['reserve', 'plan']); assert.equal(c.calls.filter(call => typeof call === 'object').length, 1);
  const meta = musicMetadata(c.rows.get(ID)), submitted = c.calls.find(call => typeof call === 'object').submit;
  assert.equal(meta.danceCoreContext, INPUT.coreContext); assert.equal(meta.danceMusic.style, RAW.style); assert.equal(meta.danceMusic.lyrics, RAW.lyrics);
  assert.equal(c.rows.get(ID).source_audio_url, 'suno:kie:new-audio-task'); assert.equal(submitted.style, RAW.style); assert.equal(submitted.lyrics, RAW.lyrics); assert.equal(submitted.vocalGender, 'f');
  assert.equal(submitted.naturalFullSong, true); assert.equal(submitted.model, 'v6'); assert.equal(new Set(c.tokens).size, 2);
  await assert.rejects(c.service.create(OTHER, INPUT), error => error.status === 404);
});
test('parallel duplicate clicks return current planning state and never make another planner call', async () => {
  let release, plans = 0; const gate = new Promise(resolve => { release = resolve; });
  const c = fixture({ planConceptMusic: async input => { plans++; await gate; return planFor(input); } });
  const pending = c.service.create(USER, INPUT); await new Promise(setImmediate);
  const repeated = await c.service.create(USER, INPUT); assert.equal(repeated.musicPlanningState, 'planning'); assert.equal(plans, 1);
  release(); await pending; assert.equal(plans, 1); assert.equal(c.calls.filter(call => typeof call === 'object').length, 1);
});
test('known Suno task reference survives every post-submit write failing, including a total read outage', async () => {
  for (const failReads of [false, true]) {
    const c = fixture(); const update = c.repository.updatePending, find = c.repository.find; let planned = false;
    c.repository.updatePending = async (row, change) => { if (planned) throw Error('offline storage unavailable'); const result = await update(row, change); planned = result; return result; };
    c.repository.find = async id => { if (planned && failReads) throw Error('offline read unavailable'); return find(id); };
    const result = await c.service.create(USER, INPUT);
    assert.equal(result.status, 'attention'); assert.equal(result.acceptedTaskReference, 'suno:kie:new-audio-task'); assert.equal(result.coreContext, INPUT.coreContext);
    assert.equal(c.calls.filter(call => call === 'plan').length, 1); assert.equal(c.calls.filter(call => typeof call === 'object').length, 1);
    assert.equal(c.rows.get(ID).source_audio_url, null, 'does not claim DB checkpoint success');
  }
});
test('unknown or invalid planning holds the same context with zero Suno calls and no fallback/replanning', async () => {
  for (const planConceptMusic of [async () => { throw Error('private provider body'); }, async () => ({ title: 'bad', genre: 'bad', music: {} })]) {
    let plans = 0; const c = fixture({ planConceptMusic: async input => { plans++; return planConceptMusic(input); } });
    const first = await c.service.create(USER, INPUT); assert.equal(first.status, 'attention'); assert.equal(first.musicPlanningState, 'attention'); assert.equal(first.coreContext, INPUT.coreContext);
    await c.service.create(USER, INPUT); assert.equal(plans, 1); assert.equal(c.calls.filter(call => typeof call === 'object').length, 0);
    assert.doesNotMatch(c.rows.get(ID).license_hash, /private provider body/);
    await assert.rejects(c.service.create(USER, { ...INPUT, requestId: NEXT }), error => error.code === 'ACTIVE_REQUEST');
  }
});
test('explicit profile and vocal dimensions constrain plans without supplying stock lyrics', async () => {
  const profile = DANCE_MUSIC_PROFILES.find(item => item.id === 'house-footwork'); const input = normalized({ ...INPUT, musicProfileId: profile.id, vocalPreference: 'off' });
  const raw = { ...RAW, genre: profile.label, bpm: profile.bpm, instrumental: true, language: 'none', vocalGender: 'none', lyrics: '[Instrumental]\n[Original contrasting rhythmic sections]' };
  const plan = validateDanceConceptMusicPlan(raw, input); assert.equal(plan.music.id, profile.id); assert.equal(plan.music.instrumental, true);
  for (const changed of [{ bpm: 104 }, { genre: 'other genre' }, { instrumental: false }]) assert.throws(() => validateDanceConceptMusicPlan({ ...raw, ...changed }, input));
  assert.throws(() => validateDanceConceptMusicPlan({ ...RAW, lyrics: '가'.repeat(5001) }, normalized(INPUT)));
  let requests = 0; const requestPlan = await createDanceConceptMusicPlan(input, async (_url, init) => {
    requests++; const body = JSON.parse(init.body), user = JSON.parse(body.messages[1].content);
    assert.equal(body.model, 'gpt-5.6-sol'); assert.equal(body.reasoning_effort, 'low'); assert.equal(user.coreContext, INPUT.coreContext);
    assert.equal(user.explicitMusicProfile.bpm, profile.bpm); assert.equal(user.explicitMusicProfile.hooks, undefined);
    assert.match(body.messages[0].content, /CONCEPT \+ CONTEXT PRIORITY/); assert.match(body.messages[0].content, /Design NEW original music/);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] });
  });
  assert.equal(requests, 1); assert.equal(requestPlan.music.bpm, profile.bpm);
});
test('reloading owned planned/completed music exposes frozen context while preserving the stored original audio', async () => {
  const c = fixture(); await c.service.create(USER, INPUT); const row = c.rows.get(ID), meta = musicMetadata(row);
  row.status = 'completed'; row.audio_url = 'https://storage.test/storage/v1/object/public/melodio-assets/original.mp3'; meta.duration = 195; row.license_hash = JSON.stringify(meta);
  const recovered = (await c.service.list(USER, ID))[0]; assert.equal(recovered.coreContext, INPUT.coreContext); assert.equal(recovered.audioUrl, row.audio_url); assert.equal(recovered.durationSeconds, 195);
  await c.service.create(USER, { ...INPUT, musicMode: undefined, musicProfileId: 'latin-step' }).catch(() => undefined);
  assert.equal(c.calls.filter(call => call === 'plan').length, 1); assert.equal(c.rows.get(ID).audio_url, row.audio_url);
});
test('unmarked legacy submission bytes and metadata fields stay exactly the existing recipe', async () => {
  const c = fixture(); const legacy = { requestId: ID, isPublic: true, musicProfileId: 'latin-step', vocalPreference: 'on' };
  const track = await c.service.create(USER, legacy), spec = resolveDanceMusicSpec('latin-step', 'on', ID), submitted = c.calls.find(call => typeof call === 'object').submit;
  const expected = { style: spec.style, lyrics: spec.lyrics, title: `${spec.label} · ${STAMP.slice(0, 10)} · ${ID.slice(0, 6)}`, instrumental: spec.instrumental, model: 'v6', exclude: spec.exclude, naturalFullSong: true,
    ...(spec.vocalGender ? { vocalGender: spec.vocalGender === 'male' ? 'm' : 'f' } : {}) };
  assert.equal(createHash('sha256').update(JSON.stringify(submitted)).digest('hex'), createHash('sha256').update(JSON.stringify(expected)).digest('hex'));
  assert.equal(track.musicMode, undefined); assert.equal(track.coreContext, undefined); assert.equal(musicMetadata(c.rows.get(ID)).danceConceptCheckpoint, undefined); assert.equal(c.calls.includes('plan'), false);
});
test('actual route uses a bounded owner/id/NULL-source nonce matcher for1000 Korean context and rotates it', async () => {
  const { NextRequest } = require('next/server'); const { createClient } = require('@supabase/supabase-js');
  let row; const updateUrls = [], seenTokens = []; const providerBodies = [];
  const admin = createClient('https://storage.test', 'offline-admin-fixture', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init = {}) => {
    const url = new URL(String(input)); assert.equal(url.origin, 'https://storage.test');
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.method === 'POST') { assert.equal(row, undefined); row = body; seenTokens.push(danceConceptCheckpoint(row)); return Response.json(null, { status: 201 }); }
    if (init.method === 'PATCH') {
      updateUrls.push(url); assert.equal(url.searchParams.get('id'), `eq.${ID}`); assert.equal(url.searchParams.get('user_id'), `eq.${USER}`); assert.equal(url.searchParams.get('status'), 'eq.generating'); assert.equal(url.searchParams.get('source_audio_url'), 'is.null');
      assert.equal(url.searchParams.get('license_hash'), `like.{"danceConceptCheckpoint":"${danceConceptCheckpoint(row)}",%`); assert.ok(url.href.length < 1000);
      row = { ...row, ...body }; seenTokens.push(danceConceptCheckpoint(row)); return Response.json([{ id: ID }]);
    }
    if (url.searchParams.get('id') && row) return Response.json([row]); return Response.json([]);
  } } });
  const routeLoad = loader({ '@supabase/supabase-js': { createClient: () => admin }, '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) } }) },
    '../../../../../worker/suno-provider': { submitKieSunoJob: async options => { providerBodies.push(options); return { taskId: 'route-task', model: 'V6' }; } } },
  async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(RAW) } }] }));
  const route = routeLoad('src/app/api/viral-cf/dance-music/route.ts');
  const response = await route.POST(new NextRequest('https://app.test/api/viral-cf/dance-music', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.test' }, body: JSON.stringify({ ...INPUT, coreContext: '가'.repeat(1000) }) }));
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.track.coreContext.length, 1000); assert.equal(providerBodies.length, 1); assert.equal(updateUrls.length, 2); assert.equal(new Set(seenTokens).size, 3); assert.equal(route.maxDuration, 300);
  const worker = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8'); assert.match(worker, /\.like\("source_audio_url", "suno:%"\)/);
});
