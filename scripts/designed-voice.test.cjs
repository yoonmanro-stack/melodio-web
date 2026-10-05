const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const env = { SUPABASE_SERVICE_ROLE_KEY: 'offline-designed-voice-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://offline.example', KIE_API_KEY: 'offline-provider-key' };
function load(file, imports = {}, extras = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'fetch', compiled)(name => {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    if (name === 'node:crypto') return require(name);
    throw new Error(`Unexpected import: ${name}`);
  }, mod, mod.exports, { env: { ...env, ...extras.env } }, extras.fetch || (() => { throw new Error('Real fetch prohibited'); }));
  return mod.exports;
}
const compiler = load('src/lib/voice/voice-design-prompt.ts');
const repository = load('src/lib/voice/designed-voice-repository.ts', { './voice-design-prompt': compiler });
const userId = '00000000-0000-4000-8000-000000000001';
const generationId = '00000000-0000-4000-8000-000000000002';
const siblingId = '00000000-0000-4000-8000-000000000003';
const otherUserId = '00000000-0000-4000-8000-000000000004';
const profile = { gender: 'female', age: '40s', language: 'ko', traits: ['body-dense', 'texture-raspy'] };
const design = compiler.compileVoiceDesign(profile);
const audioUrl = 'https://offline.example/storage/v1/object/public/generated-audio/sample.mp3';
const metadata = () => ({
  sourceMenu: 'voice-discovery-design', duration: 45,
  voiceDesign: { ...profile, designCode: design.designCode }, voiceDesignCode: design.designCode,
  stylePrompt: 'Untrusted sample arrangement must never become the reusable voice prompt',
  audioPersistence: { schemaVersion: 1, generationId, provider: 'kie', taskId: 'provider_original_task',
    taskReference: 'suno:kie:provider_original_task', status: 'ready', selectedClipKey: 'clip-a',
    clips: [
      { clipKey: 'clip-a', clipId: 'provider_original_audio_a', status: 'ready', audioUrl },
      { clipKey: 'clip-b', clipId: 'provider_original_audio_b', status: 'ready', audioUrl: `${audioUrl}?b` },
    ] },
});
function generation(id = generationId, meta = metadata()) {
  return { id, user_id: userId, status: 'completed', audio_url: audioUrl, license_hash: JSON.stringify(meta) };
}
function seed() {
  return { userId, name: '나의 거친 음색', profile, gender: profile.gender, language: profile.language,
    voicePrompt: design.stylePrompt, designCode: design.designCode, sampleGenerationId: generationId,
    sampleVersion: 'A', durationSeconds: 45, providerOriginalTaskId: 'provider_original_task', providerAudioId: 'provider_original_audio_a' };
}
function fixture(options = {}) {
  const objects = new Map();
  const rows = new Map([[generationId, generation()]]);
  const calls = { fetch: [], upload: [], download: [], queries: [] };
  const failures = { upload: null, download: null };
  const state = { userId, provider: async () => Response.json({ code: 200, data: { persona_id: 'private_persona_id' } }) };
  const admin = {
    from(table) {
      assert.equal(table, 'generations');
      const filters = {};
      const query = {
        select(fields) { assert.equal(fields, 'id,user_id,status,audio_url,license_hash'); return query; },
        eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          calls.queries.push({ ...filters });
          const row = rows.get(filters.id);
          return { data: row?.user_id === filters.user_id ? row : null, error: null };
        },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'melodio-private');
      return {
        async download(path, _options, fetchOptions) {
          assert.equal(fetchOptions?.cache, 'no-store');
          calls.download.push(path);
          if (failures.download) return { data: null, error: { statusCode: '503' } };
          return objects.has(path) ? { data: new Blob([objects.get(path)]), error: null }
            : { data: null, error: { statusCode: '404' } };
        },
        async upload(path, body, config) {
          calls.upload.push(path);
          assert.equal(config.upsert, false);
          if (failures.upload === 'all' || failures.upload === 'terminal' && path.includes('/versions/')) return { error: { statusCode: '503' } };
          if (objects.has(path)) return { error: { statusCode: '409' } };
          objects.set(path, body);
          return { error: failures.upload === 'lost-response' ? { statusCode: '503' } : null };
        },
        async list(prefix, config) {
          const names = [...new Set([...objects.keys()].filter(path => path.startsWith(`${prefix}/`))
            .map(path => path.slice(prefix.length + 1).split('/')[0]))].sort();
          return { data: names.slice(config.offset || 0, (config.offset || 0) + config.limit).map(name => ({ name })), error: null };
        },
      };
    } },
  };
  const route = load('src/app/api/voice/designed/route.ts', {
    'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
    '@supabase/supabase-js': { createClient: () => admin },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) } }) },
    '@/lib/voice/voice-design-prompt': compiler,
    '@/lib/voice/designed-voice-repository': repository,
  }, { ...options, fetch: async (url, init) => {
    calls.fetch.push({ url, init });
    assert.ok(objects.size > 0, 'Provider dispatch requires an already-persisted intent');
    return state.provider(url, init);
  } });
  const request = (body = {}, search = '') => ({ text: async () => JSON.stringify(body), nextUrl: new URL(`https://offline.example/api/voice/designed${search}`) });
  const post = (body = {}) => route.POST(request({ generationId, sampleVersion: 'A', name: '나의 거친 음색', ...body }));
  const get = (search = '') => route.GET(request({}, search));
  return { objects, rows, calls, failures, state, admin, post, get, route, request };
}
function assertSafe(body) {
  const json = JSON.stringify(body);
  for (const secret of ['private_persona_id', 'provider_original_task', 'provider_original_audio', 'offline-provider-key', 'offline-designed-voice-secret', audioUrl]) assert.ok(!json.includes(secret), secret);
  assert.ok(!json.includes('providerPersonaId'));
  assert.ok(!json.includes('providerAudioId'));
}

test('signed repository keeps owner-scoped immutable records and sanitized voices', async () => {
  const f = fixture();
  const claim = await repository.claimDesignedVoice(f.admin, seed());
  assert.equal(claim.claimed, true);
  assert.equal(claim.record.status, 'submitting');
  assert.ok(f.objects.has(`designed-voices/${userId}/${generationId}-A.json`));
  assert.equal(await repository.readDesignedVoice(f.admin, otherUserId, claim.record.id), null);
  const ready = await repository.updateDesignedVoice(f.admin, claim.record, { status: 'ready', providerPersonaId: 'private_persona_id', providerTaskId: null, errorCode: null });
  assert.deepEqual(await repository.readDesignedVoice(f.admin, userId, ready.id), ready);
  assert.deepEqual(await repository.listDesignedVoices(f.admin, userId), [ready]);
  assertSafe(repository.safeDesignedVoice(ready));
  assert.equal(repository.safeDesignedVoice(ready).stylePrompt, design.stylePrompt);
  assert.equal(f.objects.size, 2);
});

test('tampered signature or cross-owner copied record cannot be read', async () => {
  for (const mutate of [row => { row.name = 'Changed'; }, row => { row.providerPersonaId = 'forged_persona'; }, row => { row.userId = otherUserId; }]) {
    const f = fixture();
    await repository.claimDesignedVoice(f.admin, seed());
    const path = [...f.objects.keys()][0];
    const row = JSON.parse(f.objects.get(path)); mutate(row);
    f.objects.set(path, JSON.stringify(row));
    await assert.rejects(repository.readDesignedVoiceForSample(f.admin, userId, generationId, 'A'), /invalid_designed_voice/);
  }
});

test('invalid provider identifiers cannot enter signed records', async () => {
  for (const value of [undefined, null, '', 'https://untrusted.example/id', 'with spaces']) {
    const f = fixture();
    await assert.rejects(repository.claimDesignedVoice(f.admin, { ...seed(), providerAudioId: value }), /invalid_designed_voice/);
    assert.equal(f.objects.size, 0);
  }
});

test('synchronous persona result binds canonical audio and vocal-only prompt', async () => {
  const f = fixture();
  const result = await f.post();
  assert.equal(result.status, 201);
  const body = await result.json();
  assert.equal(body.status, 'ready');
  assert.equal(body.voice.designedVoiceId, repository.designedVoiceId(userId, generationId, 'A'));
  assert.equal(body.voice.sourceType, 'dna_designed');
  assert.equal(body.voice.stylePrompt, design.stylePrompt);
  assertSafe(body);
  assert.equal(f.calls.fetch.length, 1);
  const call = f.calls.fetch[0];
  assert.equal(call.url, 'https://api.kie.ai/api/v1/jobs/createTask');
  const payload = JSON.parse(call.init.body);
  assert.equal(payload.model, 'ai-music-api/generate-persona');
  assert.deepEqual(payload.input, {
    task_id: 'provider_original_task', audio_id: 'provider_original_audio_a', name: '나의 거친 음색',
    description: `Original designed singing voice ${design.designCode}`, vocal_start: 0, vocal_end: 30, style: design.stylePrompt.slice(0, 200),
  });
  assert.deepEqual(f.calls.queries[0], { id: generationId, user_id: userId });
  const repeated = await (await f.post({ name: 'Other name' })).json();
  assert.equal(repeated.voice.name, '나의 거친 음색');
  assert.equal(f.calls.fetch.length, 1);
});

test('concurrent saves of the same sample dispatch at most once', async () => {
  const f = fixture();
  const results = await Promise.all([f.post(), f.post(), f.post()]);
  assert.ok(results.every(result => result.ok));
  assert.equal(f.calls.fetch.length, 1);
  assert.equal((await repository.readDesignedVoiceForSample(f.admin, userId, generationId, 'A')).status, 'ready');
});

test('B uses selected sibling row audio and rejects relabeling A to duplicate the request', async () => {
  const f = fixture();
  const meta = metadata(); meta.audioPersistence.selectedClipKey = 'clip-b'; meta.duration = 38;
  f.rows.set(siblingId, { ...generation(siblingId, meta), audio_url: `${audioUrl}?b` });
  const result = await f.post({ generationId: siblingId, sampleVersion: 'B' });
  assert.equal(result.status, 201);
  assert.equal(JSON.parse(f.calls.fetch[0].init.body).input.audio_id, 'provider_original_audio_b');
  assert.equal((await result.json()).voice.sampleGenerationId, siblingId);
  assert.equal((await f.post({ sampleVersion: 'B' })).status, 409);
  assert.equal((await f.post({ generationId: siblingId, sampleVersion: 'A' })).status, 409);
  assert.equal(f.calls.fetch.length, 1);
});

test('authentication, UUID, strict body and name checks stop provider calls', async () => {
  const f = fixture();
  f.state.userId = null;
  assert.equal((await f.post()).status, 401);
  f.state.userId = userId;
  for (const body of [{ generationId: '../secret' }, { sampleVersion: 'C' }, { name: '' }, { name: 'x'.repeat(81) }, { name: 'a\nb' }, { personaId: 'untrusted_provider_id' }]) assert.equal((await f.post(body)).status, 400);
  f.rows.get(generationId).user_id = otherUserId;
  assert.equal((await f.post()).status, 404);
  assert.equal(f.calls.fetch.length, 0);
  assert.equal(f.objects.size, 0);
});

test('only completed canonical design metadata and persisted thirty-second audio can be saved', async () => {
  for (const change of [
    row => { row.status = 'processing'; },
    (_row, meta) => { meta.sourceMenu = 'music'; },
    (_row, meta) => { meta.duration = 29.9; },
    (_row, meta) => { meta.duration = '45'; },
    (_row, meta) => { meta.voiceDesignCode = 'VDES1-wrong'; },
    (_row, meta) => { meta.voiceDesign.designCode = 'VDES1-wrong'; },
    (_row, meta) => { meta.voiceDesign.traits = ['not-real']; },
    (_row, meta) => { meta.audioPersistence.taskId = null; },
    (_row, meta) => { meta.audioPersistence.provider = 'retired'; },
    (_row, meta) => { meta.audioPersistence.selectedClipKey = 'missing'; },
    (_row, meta) => { meta.audioPersistence.clips[0].audioUrl = 'https://untrusted.example/audio'; },
    (_row, meta) => { meta.audioPersistence.clips[0].status = 'pending'; },
  ]) {
    const f = fixture(); const meta = metadata(); const row = generation(); change(row, meta);
    row.license_hash = JSON.stringify(meta); f.rows.set(generationId, row);
    assert.equal((await f.post()).status, 409);
    assert.equal(f.calls.fetch.length, 0);
    assert.equal(f.objects.size, 0);
  }
});

test('missing provider configuration does not persist an unrecoverable intent', async () => {
  const f = fixture({ env: { KIE_API_KEY: '' } });
  assert.equal((await f.post()).status, 503);
  assert.equal(f.objects.size, 0);
  assert.equal(f.calls.fetch.length, 0);
});

test('failed or ambiguous initial storage write never dispatches', async () => {
  const failed = fixture(); failed.failures.upload = 'all';
  assert.equal((await failed.post()).status, 503);
  assert.equal(failed.calls.fetch.length, 0);
  const uncertain = fixture(); uncertain.failures.upload = 'lost-response';
  assert.equal((await uncertain.post()).status, 202);
  uncertain.failures.upload = null;
  assert.equal((await uncertain.post()).status, 202);
  assert.equal(uncertain.calls.fetch.length, 0);
});

test('provider timeout, rejection or malformed result is held and never re-submitted', async () => {
  for (const provider of [
    async () => { throw new Error('timeout with private token should never reach response'); },
    async () => Response.json({ code: 500, msg: 'private raw provider error' }),
    async () => Response.json({ code: 200, data: {} }),
    async () => new Response('malformed private provider body'),
  ]) {
    const f = fixture(); f.state.provider = provider;
    const body = await (await f.post()).json();
    assert.equal(body.status, 'held'); assertSafe(body);
    assert.ok(!JSON.stringify(body).includes('private raw'));
    await f.post(); await f.get(`?id=${body.voice.designedVoiceId}`);
    assert.equal(f.calls.fetch.length, 1);
  }
});

test('uncertain terminal storage write leaves intent and prevents duplicate provider requests', async () => {
  const f = fixture(); f.failures.upload = 'terminal';
  assert.equal((await f.post()).status, 503);
  f.failures.upload = null;
  assert.equal((await f.post()).status, 202);
  const result = await f.get(`?generationId=${generationId}&sampleVersion=A`);
  assert.equal(result.status, 202);
  assert.equal(f.calls.fetch.length, 1);
});

test('asynchronous result is recovered by GET of the persisted task only', async () => {
  const f = fixture();
  f.state.provider = async () => Response.json({ code: 200, data: { taskId: 'provider_persona_task' } });
  const start = await (await f.post()).json(); assert.equal(start.status, 'submitting');
  await f.post(); assert.equal(f.calls.fetch.length, 1);
  f.state.provider = async () => Response.json({ code: 200, data: { taskId: 'provider_persona_task', state: 'success', resultJson: JSON.stringify({ persona_id: 'private_persona_id' }) } });
  const result = await f.get(`?generationId=${generationId}&sampleVersion=A`);
  const body = await result.json(); assert.equal(body.status, 'ready'); assertSafe(body);
  assert.equal(f.calls.fetch.length, 2);
  assert.equal(f.calls.fetch[1].url, 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=provider_persona_task');
  assert.equal(f.calls.fetch[1].init.method, undefined);
  await f.get(`?id=${start.voice.designedVoiceId}`);
  assert.equal(f.calls.fetch.length, 2);
});

test('transient GET failure preserves known task for later GET recovery', async () => {
  const f = fixture(); f.state.provider = async () => Response.json({ code: 200, data: { taskId: 'provider_persona_task' } });
  const body = await (await f.post()).json();
  f.state.provider = async () => { throw new Error('temporary'); };
  assert.equal((await f.get(`?id=${body.voice.designedVoiceId}`)).status, 503);
  const stored = await repository.readDesignedVoice(f.admin, userId, body.voice.designedVoiceId);
  assert.equal(stored.status, 'submitting'); assert.equal(stored.providerTaskId, 'provider_persona_task');
  f.state.provider = async () => Response.json({ code: 200, data: { taskId: 'provider_persona_task', state: 'success', personaId: 'private_persona_id' } });
  assert.equal((await (await f.get(`?id=${body.voice.designedVoiceId}`)).json()).status, 'ready');
  assert.equal(f.calls.fetch.filter(call => call.init.method === 'POST').length, 1);
});

test('failed or unrecognized successful async result is held without new creation', async () => {
  for (const result of [{ state: 'fail' }, { state: 'success', resultJson: '{}' }]) {
    const f = fixture(); f.state.provider = async () => Response.json({ code: 200, data: { taskId: 'provider_persona_task' } });
    const body = await (await f.post()).json();
    f.state.provider = async () => Response.json({ code: 200, data: result });
    assert.equal((await (await f.get(`?id=${body.voice.designedVoiceId}`)).json()).status, 'held');
    await f.post(); assert.equal(f.calls.fetch.filter(call => call.init.method === 'POST').length, 1);
  }
});

test('list and cross-account GET never expose provider IDs or other owners', async () => {
  const f = fixture(); const saved = await (await f.post()).json();
  const list = await (await f.get()).json(); assert.equal(list.voices.length, 1); assertSafe(list);
  f.state.userId = otherUserId;
  assert.equal((await f.get(`?id=${saved.voice.designedVoiceId}`)).status, 404);
  assert.equal((await f.get(`?generationId=${generationId}&sampleVersion=A`)).status, 404);
  assert.deepEqual(await (await f.get()).json(), { voices: [] });
  assert.equal(f.calls.fetch.length, 1);
});

test('stale intent with no recoverable task becomes held without provider dispatch', async (t) => {
  const f = fixture(); f.failures.upload = 'lost-response';
  await f.post(); f.failures.upload = null;
  const future = Date.now() + 120_000;
  t.mock.method(Date, 'now', () => future);
  const body = await (await f.get(`?generationId=${generationId}&sampleVersion=A`)).json();
  assert.equal(body.status, 'held');
  assert.equal(body.voice.errorCode, 'submission_unconfirmed');
  assert.equal((await (await f.post()).json()).status, 'held');
  assert.equal(f.calls.fetch.length, 0);
});

test('GET rejects a provider task mismatch without corrupting the saved task', async () => {
  const f = fixture(); f.state.provider = async () => Response.json({ code: 200, data: { taskId: 'provider_persona_task' } });
  const body = await (await f.post()).json();
  f.state.provider = async () => Response.json({ code: 200, data: { taskId: 'another_persona_task', persona_id: 'private_persona_id' } });
  assert.equal((await f.get(`?id=${body.voice.designedVoiceId}`)).status, 503);
  const row = await repository.readDesignedVoice(f.admin, userId, body.voice.designedVoiceId);
  assert.equal(row.status, 'submitting');
  assert.equal(row.providerTaskId, 'provider_persona_task');
  assert.equal(row.providerPersonaId, null);
});

test('oversized provider body is bounded and held without returning provider content', async () => {
  const f = fixture(); f.state.provider = async () => new Response('x'.repeat(65 * 1024));
  const body = await (await f.post()).json();
  assert.equal(body.status, 'held');
  assert.equal(body.voice.errorCode, 'submission_unconfirmed');
  assert.ok(JSON.stringify(body).length < 2000);
  await f.post(); assert.equal(f.calls.fetch.length, 1);
});
