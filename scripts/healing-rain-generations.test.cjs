// Offline execution of the actual validation, server and route modules.
// SQL grants/locking require the reviewed migration on a PostgreSQL instance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(file, dependencies = {}, globals = {}) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports, Error, Date, JSON, TextDecoder, Request, Response, URL, crypto,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
    ...globals,
  }, { filename: file });
  return loadedModule.exports;
}
const direction = require('../shared/healing-rain/direction');
const recipes = load('src/lib/healing-rain/recipes.ts', { '../../../shared/healing-rain/direction': direction });
const projects = load('src/lib/healing-rain/projects.ts', { './recipes': recipes });
const model = load('src/lib/healing-rain/generations.ts', { './projects': projects, '../../../shared/healing-rain/direction': direction, '../../../shared/healing-rain/audio-policy': require('../shared/healing-rain/audio-policy') });
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const jobId = '44444444-4444-4444-8444-444444444444';
const otherProjectId = '55555555-5555-4555-8555-555555555555';
const plain = value => JSON.parse(JSON.stringify(value));
const body = overrides => ({ projectId, clientRequestId: 'generation-request-1', quoteVersion: model.RAIN_GENERATION_QUOTE.version, ...overrides });
const request = (value, method = 'POST', query = '') => new Request(`https://melodio.test/api/healing-rain/generations${query}`, {
  method, ...(method === 'POST' ? { body: typeof value === 'string' ? value : JSON.stringify(value) } : {}),
});
function row(overrides = {}) {
  return { id: jobId, user_id: owner, project_id: projectId, client_request_id: 'generation-request-1',
    request_snapshot: recipes.compileRecipe({ ...recipes.defaults }, projectId, '2026-10-12T00:00:00Z'),
    quote_version: model.RAIN_GENERATION_QUOTE.version, status: 'queued', stage: 'queued', progress: 0,
    checkpoints: {}, assets: {}, review_records: {}, estimated_cost: plain(model.RAIN_GENERATION_QUOTE), actual_usage: {},
    error_code: null, error_message: null, claim_token: 'private-claim-token', lease_expires_at: null,
    created_at: '2026-10-12T00:00:00Z', updated_at: '2026-10-12T00:00:00Z', started_at: null, completed_at: null,
    ...overrides };
}

function harness(options = {}) {
  const calls = [], queries = [], signed = [], rows = options.rows || [];
  const plan = options.plan || recipes.compileRecipe({ ...recipes.defaults }, projectId, '2026-10-12T00:00:00Z');
  let adminCalls = 0;
  const userId = options.user || owner;
  const projectRows = options.projectRows || [{ id: projectId, user_id: userId, plan }];
  const client = {
    from(table) {
      const filters = [];
      const query = {
        select(value) { queries.push([table, 'select', value]); return this; },
        eq(...args) { queries.push([table, 'eq', ...args]); filters.push(args); return this; },
        order(...args) { queries.push([table, 'order', ...args]); return this; },
        limit(value) { queries.push([table, 'limit', value]); return this; },
        result(single) {
          const data = (table === 'healing_rain_projects' ? projectRows : rows).filter(item => filters.every(([key, value]) => item[key] === value));
          return { data: single ? data[0] || null : data, error: options.readError || null };
        },
        async maybeSingle() { return this.result(true); },
        then(resolve, reject) { return Promise.resolve(this.result(false)).then(resolve, reject); },
      };
      return query;
    },
  };
  const admin = {
    storage: { from(bucket) { assert.equal(bucket, 'healing-rain'); return { async createSignedUrl(path, seconds) { signed.push([path, seconds]); return { data: { signedUrl: `https://storage.test/signed/${path}` }, error: null }; } }; } },
    async rpc(name, args) {
      if (name === 'review_healing_rain_generation') {
        calls.push(plain(args));
        if (options.writeError) return { data: null, error: options.writeError };
        const saved = rows.find(item => item.id === args.p_job_id && item.user_id === args.p_user_id);
        if (!saved) return { data: null, error: { code: 'P0002' } };
        const prior = saved.review_records?.[args.p_kind];
        if (prior) return prior.decision === args.p_decision ? { data: [saved], error: null } : { data: null, error: { code: '40001' } };
        if ((args.p_kind === 'audio' && (saved.stage !== 'audio_review_required' || saved.status !== 'needs_attention'))
          || (args.p_kind === 'preview' && (saved.stage !== 'preview_ready' || saved.status !== 'ready'))) return { data: null, error: { code: '40001' } };
        saved.review_records = { ...saved.review_records, [args.p_kind]: { userId: args.p_user_id, jobId: args.p_job_id, decision: args.p_decision,
          generationSpecSha256: args.p_spec_sha256, assetHashes: args.p_asset_hashes, reviewedAt: '2026-10-13T00:00:00Z' } };
        saved.status = args.p_decision === 'reject' ? 'failed' : args.p_kind === 'audio' ? 'queued' : 'ready';
        saved.stage = `${args.p_kind}_${args.p_decision === 'reject' ? 'rejected' : 'approved'}`;
        return { data: [saved], error: null };
      }
      assert.equal(name, 'enqueue_healing_rain_generation'); calls.push(plain(args));
      if (options.writeError) return { data: null, error: options.writeError };
      const previous = rows.find(item => item.user_id === args.p_user_id && item.client_request_id === args.p_client_request_id);
      if (previous) return previous.project_id === args.p_project_id ? { data: [{ job: previous, created: false }], error: null } : { data: null, error: { code: '23505' } };
      if (rows.some(item => item.user_id === args.p_user_id && ['queued', 'running', 'needs_attention'].includes(item.status))) return { data: null, error: { code: 'P0001' } };
      const saved = row({ user_id: args.p_user_id, project_id: args.p_project_id, client_request_id: args.p_client_request_id, request_snapshot: plan, estimated_cost: args.p_estimated_cost });
      rows.push(saved); return { data: [{ job: saved, created: true }], error: null };
    },
  };
  const projectServer = { async requireRainProjectUser() {
    if (options.user === null) throw new projects.RainProjectError('authentication_required', '로그인이 필요합니다.', 401);
    return { userId, client };
  } };
  const server = load('src/lib/healing-rain/generation-server.ts', {
    'server-only': {}, '@supabase/supabase-js': { createClient() { adminCalls += 1; return admin; } },
    './project-server': projectServer, './projects': projects, './generations': model,
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://offline.test', SUPABASE_SERVICE_ROLE_KEY: 'offline-service-key',
    HEALING_RAIN_GENERATION_ENABLED: 'true', HEALING_RAIN_ALLOWED_USER_IDS: owner, ...options.env } } });
  const dependencies = { '@/lib/healing-rain/generation-server': server, '@/lib/healing-rain/generations': model, '@/lib/healing-rain/projects': projects };
  return { route: load('src/app/api/healing-rain/generations/route.ts', dependencies),
    detail: load('src/app/api/healing-rain/generations/[id]/route.ts', dependencies), review: load('src/app/api/healing-rain/generations/[id]/review/route.ts', dependencies), calls, queries, signed, rows, adminCalls: () => adminCalls };
}

test('all routes authenticate before reads, parsing, signing or service client creation', async () => {
  const h = harness({ user: null });
  for (const response of [await h.route.GET(request(null, 'GET')), await h.route.POST(request('{')), await h.detail.GET(request(null, 'GET'), { params: Promise.resolve({ id: 'bad' }) })]) {
    assert.equal(response.status, 401); assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
  assert.equal(h.queries.length, 0); assert.equal(h.adminCalls(), 0);
});

test('creation derives account, snapshot and prices server-side; rejects caller privilege/prompt fields', async () => {
  const h = harness();
  for (const extra of [{ user_id: other }, { prompts: { image: 'forged' } }, { price: 0 }, { request_snapshot: {} }]) {
    assert.equal((await h.route.POST(request(body(extra)))).status, 400);
  }
  const response = await h.route.POST(request(body())); assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(h.calls[0].p_user_id, owner);
  assert.equal(h.calls[0].p_project_id, projectId);
  assert.equal(h.calls[0].p_estimated_cost.kieCredits, 172);
  assert.equal(h.calls[0].p_estimated_cost.audio.credits, 1800);
  assert.equal(h.calls[0].p_estimated_cost.video.sourceVideoSeconds, 11);
  assert.equal(h.calls[0].p_estimated_cost.video.finalLoopSeconds, 10);
  assert.equal(Object.hasOwn(h.calls[0], 'request_snapshot'), false);
  assert.equal(result.created, true); assert.equal(result.job.reviewStatus, 'pending');
  for (const privateKey of ['user_id', 'client_request_id', 'request_snapshot', 'claim_token', 'checkpoints']) assert.equal(Object.hasOwn(result.job, privateKey), false);
});

test('same request returns its original job after rollout/quote changes; another project conflicts', async () => {
  const h = harness(); const first = await (await h.route.POST(request(body()))).json();
  const paused = harness({ rows: h.rows, env: { HEALING_RAIN_GENERATION_ENABLED: 'false' } });
  const retry = await paused.route.POST(request(body({ quoteVersion: 'older-version' })));
  assert.equal(retry.status, 200); assert.deepEqual((await retry.json()).job, first.job);
  assert.equal(paused.calls.length, 0);
  assert.equal((await paused.route.POST(request(body({ projectId: otherProjectId })))).status, 409);
});

test('both rollout flag and explicit account allowlist gate new jobs but not existing job reads', async () => {
  for (const env of [{ HEALING_RAIN_GENERATION_ENABLED: undefined }, { HEALING_RAIN_GENERATION_ENABLED: '1' }, { HEALING_RAIN_ALLOWED_USER_IDS: '' }, { HEALING_RAIN_ALLOWED_USER_IDS: '*' }, { HEALING_RAIN_ALLOWED_USER_IDS: other }]) {
    const h = harness({ env, rows: [row({ client_request_id: 'previous-request' })] });
    assert.equal((await h.route.POST(request(body()))).status, 403);
    const response = await h.route.GET(request(null, 'GET', `?projectId=${projectId}`));
    assert.equal(response.status, 200); const result = await response.json();
    assert.equal(result.canGenerate, false); assert.equal(result.jobs.length, 1); assert.equal(h.calls.length, 0);
  }
});

test('owner filters prevent foreign project enqueue and foreign job reading', async () => {
  const h = harness({ projectRows: [{ id: projectId, user_id: other, plan: {} }], rows: [row({ user_id: other })] });
  assert.equal((await h.route.POST(request(body()))).status, 404);
  assert.equal((await h.route.GET(request(null, 'GET', `?projectId=${projectId}`))).status, 404);
  assert.equal((await h.detail.GET(request(null, 'GET'), { params: Promise.resolve({ id: jobId }) })).status, 404);
  assert.equal(h.calls.length, 0); assert.equal(h.signed.length, 0);
  assert.ok(h.queries.filter(item => item[1] === 'eq' && item[2] === 'user_id').every(item => item[3] === owner));
});

test('unsupported scenes, thunder, take counts and outdated new-job quote cannot enqueue', async () => {
  for (const input of [{ sceneId: 'tent' }, { thunder: 'distant' }, { takes: 3 }, { takes: 12 }]) {
    const h = harness({ plan: recipes.compileRecipe({ ...recipes.defaults, ...input }, projectId, '2026-10-12T00:00:00Z') });
    assert.equal((await h.route.POST(request(body()))).status, 400); assert.equal(h.calls.length, 0);
  }
  const h = harness(); assert.equal((await h.route.POST(request(body({ quoteVersion: 'old' })))).status, 409); assert.equal(h.calls.length, 0);
});

test('JSON, UUID, request ID, query injection and streamed byte bounds reject before enqueue', async () => {
  const h = harness();
  for (const value of ['{', [], body({ projectId: 'id.or.user_id' }), body({ clientRequestId: 'short' }), body({ clientRequestId: 'x'.repeat(129) }), body({ quoteVersion: '' })]) {
    assert.equal((await h.route.POST(request(value))).status, 400);
  }
  assert.equal((await h.route.POST(request('한'.repeat(1000)))).status, 413);
  assert.equal((await h.route.GET(request(null, 'GET', '?projectId=owner.eq.other'))).status, 400);
  assert.equal(h.calls.length, 0);
});

test('only scoped preview outputs are signed, owner/lease/provider details are never returned', async () => {
  const h = harness({ rows: [row({ status: 'needs_attention', error_code: 'provider_outcome_unknown', error_message: 'provider secret detail',
    actual_usage: { kieCredits: 172, elevenLabsCredits: 1800, kieCalls: 2, elevenLabsCalls: 6, unreportedCost: false, rawResponse: 'private' },
    assets: { preview30: { path: `${owner}/${jobId}/preview-30.mp4`, mimeType: 'video/mp4', durationSeconds: 30 },
      preview180: { path: `${other}/${jobId}/preview-180.mp4`, mimeType: 'video/mp4' },
      poster: { path: `${owner}/${jobId}/../poster.png`, mimeType: 'image/png' },
      image: { path: `${owner}/${jobId}/image.png`, mimeType: 'image/png' } } })] });
  const response = await h.detail.GET(request(null, 'GET'), { params: Promise.resolve({ id: jobId }) });
  assert.equal(response.status, 200); const result = await response.json();
  assert.deepEqual(h.signed, [[`${owner}/${jobId}/preview-30.mp4`, 600]]);
  assert.deepEqual(Object.keys(result.job.outputs), ['preview30']);
  assert.equal(result.job.actualUsage.kieCredits, 172); assert.equal(result.job.actualUsage.unreportedCost, false);
  for (const secret of ['private-claim-token', 'provider secret detail', 'rawResponse', 'private']) assert.equal(JSON.stringify(result).includes(secret), false);
});

test('asset path signer rejects URLs, nested keys, traversal, escapes and unsafe names', () => {
  const prefix = `${owner}/${jobId}/`;
  for (const path of ['https://evil.test/file.mp4', `${prefix}a/b.mp4`, `${prefix}../a.mp4`, `${prefix}%2e%2e.mp4`, `${prefix}.file.mp4`, `${prefix}file.svg`, `${prefix}file.mp4?token=secret`, `${other}/${jobId}/file.mp4`]) assert.equal(model.isSafeRainGenerationAssetPath(path, owner, jobId), false);
  assert.equal(model.isSafeRainGenerationAssetPath(`${prefix}preview-180.mp4`, owner, jobId), true);
});

test('queue conflicts and database errors are sanitized without raw provider/database messages', async () => {
  for (const [code, status] of [['23505', 409], ['P0001', 409], ['42P01', 503], ['42501', 403], ['unexpected', 503]]) {
    const h = harness({ writeError: { code, message: 'private database detail' } });
    const response = await h.route.POST(request(body()));
    assert.equal(response.status, status); assert.equal((await response.text()).includes('private database detail'), false);
  }
  const h = harness({ rows: [row({ client_request_id: 'earlier-request' })] });
  assert.equal((await h.route.POST(request(body()))).status, 409);
});

test('migration has server-only RPCs, owner RLS, atomic guards and live-lease CAS', () => {
  const sql = fs.readFileSync('migrations/20261012_create_healing_rain_generations.sql', 'utf8');
  assert.match(sql, /UNIQUE \(user_id, client_request_id\)/);
  assert.match(sql, /REFERENCES public\.healing_rain_projects\(id\)/);
  assert.match(sql, /FOR SELECT TO authenticated USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /GRANT (?:ALL|INSERT|UPDATE|DELETE).*TO authenticated/);
  for (const name of ['enqueue_healing_rain_generation', 'claim_healing_rain_generation', 'update_healing_rain_generation']) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]+FROM PUBLIC, anon, authenticated`));
  }
  assert.match(sql, /p\.id = p_project_id AND p\.user_id = p_user_id/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /FOR UPDATE SKIP LOCKED LIMIT 1/);
  assert.match(sql, /g\.claim_token = p_claim_token AND g\.status = 'running' AND g\.lease_expires_at > clock_timestamp\(\)/);
  assert.match(sql, /BEFORE UPDATE ON public\.healing_rain_generations/);
  assert.match(sql, /AS RESTRICTIVE[\s\S]+FOR ALL TO anon, authenticated/);
  assert.match(sql, /VALUES \('healing-rain', 'healing-rain', false/);
});


test('legacy snapshots remain readable but new generation requires a newly saved direction plan', async()=>{
 const plan=recipes.compileRecipe({...recipes.defaults},projectId,'2026-10-12T00:00:00Z'); delete plan.direction;delete plan.generation.sourceVideoSeconds;delete plan.generation.videoCrossfadeSeconds;
 const old=row({request_snapshot:plan,status:'ready'});const h=harness({plan,rows:[old]});
 const list=await h.route.GET(request(null,'GET',`?projectId=${projectId}`));const data=await list.json();assert.equal(data.jobs.length,1);assert.equal(data.canGenerate,false);assert.match(data.unavailableReason,/이전 연출/);
 const create=await h.route.POST(request(body({clientRequestId:'new-legacy-attempt'})));assert.equal(create.status,400);assert.equal(h.calls.length,0);
 const retry=await h.route.POST(request(body()));assert.equal(retry.status,200);assert.equal((await retry.json()).created,false);
});
test('v2 prompt or duration drift is rejected before a paid job is enqueued',async()=>{
 for(const mutate of [p=>p.prompts.video+=' faster',p=>p.generation.sourceVideoSeconds=10,p=>p.direction.version='unknown-version']){
  const plan=recipes.compileRecipe({...recipes.defaults},projectId,'2026-10-12T00:00:00Z');mutate(plan);const h=harness({plan});
  const response=await h.route.POST(request(body()));assert.equal(response.status,400);assert.equal(h.calls.length,0);
 }
});
test('only bounded public quality fields leave the server',()=>{
 const {evaluatePreviewQuality}=require('../shared/healing-rain/quality');const q=evaluatePreviewQuality({direction:recipes.compileRecipe({...recipes.defaults},projectId,'now').direction,report:{}});
 const safe=model.rainGenerationPublicQuality({...q,secret:'private',localPath:'/private/file'});assert.ok(safe);assert.equal(Object.hasOwn(safe,'secret'),false);assert.equal(Object.hasOwn(safe,'localPath'),false);
 assert.equal(model.rainGenerationPublicQuality({...q,checks:[{id:'bad',status:'passed',message:'x'.repeat(181)}]}),null);
});

test('quote includes every new rain take and refuses caller-supplied reuse controls', () => {
 const audio=model.RAIN_GENERATION_QUOTE.audio;
 assert.equal(audio.takes,6);assert.equal(audio.secondsPerTake,30);assert.equal(audio.credits,1800);
 assert.equal(audio.sourcePolicy.reuseAcrossProductions,false);assert.equal(audio.sourcePolicy.fallbackToExistingAudio,false);
 for(const extra of [{audioIds:['old-audio']},{sourceJobId:other},{reuseAudio:true},{freshAudio:false}]) {
  assert.throws(()=>model.parseCreateRainGeneration({...body(),...extra}),error=>error.status===400);
 }
});


test('new content review survives the public API and legacy technical passes cannot waive listening', () => {
 const {evaluatePreviewQuality}=require('../shared/healing-rain/quality');
 const current=evaluatePreviewQuality({direction:recipes.compileRecipe({...recipes.defaults},projectId,'now').direction,report:{}});
 const visible=model.rainGenerationPublicQuality(current);
 assert.equal(visible.version,'healing-rain-quality-v3');assert.equal(visible.reviewDecision,'required');
 assert.ok(visible.reasons.includes('audio_content_review_required'));
 assert.equal(visible.checks.find(c=>c.id==='audio_content').status,'not_measured');
 const old={...current,version:'healing-rain-quality-v2',technicalStatus:'passed',reviewDecision:'not_required',reasons:[],checks:current.checks.filter(c=>c.id!=='audio_content')};
 const before=JSON.stringify(old);const legacy=model.rainGenerationPublicQuality(old);
 assert.equal(legacy.technicalStatus,'passed');assert.equal(legacy.reviewDecision,'required');
 assert.equal(legacy.checks.find(c=>c.id==='audio_content').status,'not_measured');
 assert.ok(legacy.reasons.includes('audio_content_review_required'));assert.equal(JSON.stringify(old),before);
 assert.deepEqual(plain(model.rainGenerationPublicQuality(legacy)),plain(legacy));
 for(const bad of [{version:'unknown-quality-version'},{version:['healing-rain-quality-v2']},{technicalStatus:['passed']},{reviewDecision:['not_required']}]) {
  assert.equal(model.rainGenerationPublicQuality({...old,...bad}),null);
 }
 const maxChecks=Array.from({length:40},(_,i)=>({id:`check_${i}`,status:'passed',message:'measured'}));
 const maxReasons=Array.from({length:30},(_,i)=>`reason_${i}`);
 assert.equal(model.rainGenerationPublicQuality({...old,checks:maxChecks}),null);
 assert.equal(model.rainGenerationPublicQuality({...old,reasons:maxReasons}),null);
 const atLimit=model.rainGenerationPublicQuality({...old,checks:maxChecks.slice(1),reasons:maxReasons.slice(1)});
 assert.equal(atLimit.checks.length,40);assert.equal(atLimit.reasons.length,30);
 assert.deepEqual(plain(model.rainGenerationPublicQuality(atLimit)),plain(atLimit));
});


function reviewRow(kind = 'audio', overrides = {}) {
  const saved = row({ status: kind === 'audio' ? 'needs_attention' : 'ready', stage: kind === 'audio' ? 'audio_review_required' : 'preview_ready', claim_token: null, ...overrides });
  saved.checkpoints.generationSpec = { state: 'frozen', sha256: 'a'.repeat(64) };
  for (let i = 1; i <= 6; i++) {
    const key = `audio${i}`, sha256 = String(i).repeat(64);
    const audioOrigin = { policyVersion: 'healing-rain-fresh-audio-v1', jobId, userId: owner, takeIndex: i, seconds: 30 };
    saved.checkpoints[key] = { state: 'ready', sha256, generationSpecSha256: 'a'.repeat(64), provider: 'elevenlabs', model: 'eleven_text_to_sound_v2', audioOrigin };
    saved.assets[key] = { path: `${owner}/${jobId}/${key}.mp3`, mimeType: 'audio/mpeg', sha256, durationSeconds: 30, audioOrigin };
  }
  if (kind === 'preview') {
    saved.checkpoints.render = { state: 'ready', generationSpecSha256: 'a'.repeat(64) };
    saved.review_records.audio = { userId: owner, jobId, decision: 'approve', generationSpecSha256: 'a'.repeat(64),
      assetHashes: Object.fromEntries(model.RAIN_AUDIO_KEYS.map(key => [key, saved.assets[key].sha256])), reviewedAt: '2026-10-13T00:00:00Z' };
    for (const [key, seconds] of [['preview30', 30], ['preview180', 180]]) saved.assets[key] = { path: `${owner}/${jobId}/${key}.mp4`, mimeType: 'video/mp4', sha256: (seconds === 30 ? 'b' : 'c').repeat(64), durationSeconds: seconds };
  }
  return saved;
}
function reviewInput(saved, kind = 'audio', decision = 'approve') {
  const evidence = model.rainGenerationReviewEvidence(saved, kind);
  return { kind, decision, generationSpecSha256: evidence.generationSpecSha256, assetHashes: evidence.assetHashes };
}
const reviewContext = { params: Promise.resolve({ id: jobId }) };

test('review authentication precedes parsing and service access; foreign owner cannot review', async () => {
  const unauthenticated = harness({ user: null });
  assert.equal((await unauthenticated.review.POST(request('{'), { params: Promise.resolve({ id: 'bad' }) })).status, 401);
  assert.equal(unauthenticated.queries.length, 0); assert.equal(unauthenticated.adminCalls(), 0);
  const saved = reviewRow(); const h = harness({ user: other, rows: [saved] });
  assert.equal((await h.review.POST(request(reviewInput(saved)), reviewContext)).status, 404);
  assert.equal(h.calls.length, 0); assert.equal(h.signed.length, 0);
});

test('every original signed audio URL is scoped to owner, job, basename, MIME, origin and SHA-256', async () => {
  const saved = reviewRow(); const h = harness({ rows: [saved] });
  const result = await (await h.detail.GET(request(null, 'GET'), reviewContext)).json();
  assert.equal(h.signed.length, 6); assert.equal(result.job.canApproveAudio, true);
  assert.equal(result.job.reviews.audio.status, 'pending'); assert.equal(result.job.error, null);
  for (const key of model.RAIN_AUDIO_KEYS) { assert.equal(result.job.outputs[key].mimeType, 'audio/mpeg'); assert.equal(result.job.outputs[key].sha256, saved.assets[key].sha256); }
  for (const mutate of [r => { r.assets.audio1.path = `${other}/${jobId}/audio1.mp3`; }, r => { r.assets.audio1.path = `${owner}/${jobId}/nested/audio1.mp3`; }, r => { r.assets.audio1.mimeType = 'video/mp4'; }, r => { r.assets.audio1.audioOrigin.jobId = other; }, r => { r.assets.audio1.sha256 = '0'.repeat(64); }]) {
    const bad = reviewRow(); mutate(bad); const invalid = harness({ rows: [bad] });
    const output = await (await invalid.detail.GET(request(null, 'GET'), reviewContext)).json();
    assert.equal(invalid.signed.length, 0); assert.equal(output.job.canApproveAudio, false); assert.deepEqual(output.job.reviews, {});
  }
});

test('review validates exact hash sets and rejects privilege, missing, stale and forged inputs before RPC', async () => {
  const saved = reviewRow(); const h = harness({ rows: [saved] }); const input = reviewInput(saved);
  for (const value of [{ ...input, userId: other }, { ...input, assetHashes: { ...input.assetHashes, extra: '0'.repeat(64) } }, { ...input, assetHashes: { audio1: '1'.repeat(64) } }, { ...input, decision: 'approved' }, { ...input, decision: ['approve'] }, { ...input, kind: ['audio'] }, { ...input, kind: 'longForm' }]) {
    assert.equal((await h.review.POST(request(value), reviewContext)).status, 400);
  }
  for (const value of [{ ...input, generationSpecSha256: '0'.repeat(64) }, { ...input, assetHashes: { ...input.assetHashes, audio1: '0'.repeat(64) } }]) {
    assert.equal((await h.review.POST(request(value), reviewContext)).status, 409);
  }
  assert.equal(h.calls.length, 0);
});

test('audio approval requires current paid-generation gate and same hashed originals, rejection remains possible while disabled', async () => {
  const saved = reviewRow(); const disabled = harness({ rows: [saved], env: { HEALING_RAIN_GENERATION_ENABLED: 'false' } });
  assert.equal((await disabled.review.POST(request(reviewInput(saved)), reviewContext)).status, 403); assert.equal(disabled.calls.length, 0);
  const rejected = await disabled.review.POST(request(reviewInput(saved, 'audio', 'reject')), reviewContext);
  assert.equal(rejected.status, 200); const result = await rejected.json();
  assert.equal(result.job.status, 'failed'); assert.equal(result.job.stage, 'audio_rejected'); assert.equal(result.job.reviews.audio.status, 'rejected');
  assert.equal((await disabled.review.POST(request(reviewInput(saved)), reviewContext)).status, 409);
  const fresh = reviewRow(); const allowed = harness({ rows: [fresh] }); const input = reviewInput(fresh);
  const approved = await (await allowed.review.POST(request(input), reviewContext)).json();
  assert.equal(approved.job.status, 'queued'); assert.equal(approved.job.stage, 'audio_approved'); assert.equal(approved.job.longFormEnabled, false);
  assert.equal(allowed.calls[0].p_user_id, owner); assert.equal(allowed.calls[0].p_global_queue_limit, 10); assert.deepEqual(allowed.calls[0].p_asset_hashes, plain(input.assetHashes));
  const replay = harness({ rows: allowed.rows, env: { HEALING_RAIN_GENERATION_ENABLED: 'false' } });
  assert.equal((await replay.review.POST(request(input), reviewContext)).status, 200, 'same immutable decision survives network uncertainty and later gate changes');
});

test('preview approval only records a human decision and keeps long form disabled', async () => {
  const saved = reviewRow('preview'); const h = harness({ rows: [saved] });
  const approved = await (await h.review.POST(request(reviewInput(saved, 'preview')), reviewContext)).json();
  assert.equal(approved.job.status, 'ready'); assert.equal(approved.job.stage, 'preview_approved');
  assert.equal(approved.job.reviewStatus, 'approved'); assert.equal(approved.job.longFormEnabled, false);
  assert.equal(h.calls.length, 1); assert.equal(Object.hasOwn(h.calls[0], 'p_quote_version'), false);
  for (const code of ['40001', '42501', 'P0001']) {
    const conflict = reviewRow(); const mocked = harness({ rows: [conflict], writeError: { code, message: 'private review state' } });
    const response = await mocked.review.POST(request(reviewInput(conflict)), reviewContext);
    assert.equal(response.status, code === '42501' ? 403 : 409); assert.equal((await response.text()).includes('private review state'), false);
  }
});

test('staged review SQL locks and validates the owner, originals, expected state and immutable decisions', () => {
  const sql = fs.readFileSync('migrations/20261013_healing_rain_staged_reviews.sql', 'utf8');
  assert.match(sql, /g\.id = p_job_id AND g\.user_id = p_user_id FOR UPDATE/);
  assert.match(sql, /COALESCE\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.review_healing_rain_generation\([^;]+FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /v_hashes IS DISTINCT FROM p_asset_hashes/);
  assert.match(sql, /v_job\.stage <> 'audio_review_required'/); assert.match(sql, /v_job\.stage <> 'preview_ready'/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('healing-rain-generation-queue'/);
  assert.match(sql, /g\.status = 'queued'\) >= p_global_queue_limit/);
  assert.match(sql, /Review evidence is immutable/); assert.match(sql, /Reviewed originals are immutable/);
  assert.doesNotMatch(sql, /GRANT (?:ALL|INSERT|UPDATE|DELETE).*TO authenticated/);
});
