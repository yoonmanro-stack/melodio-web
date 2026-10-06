const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const batch = require('./moe-singing-reference-20261006.cjs');
const { sha, hashFile, read, save } = require('./official-global-v1.cjs');
const provider = require('../worker/suno-provider');
const CONFIG = { apiKey: 'offline-fixture', apiBaseUrl: 'https://api.kie.ai' };
const inspect = () => 30.04;
const response = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

function fixture(t, ready = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moe-reference-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (relative, value) => {
    const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  };
  put(batch.PROTECTED[0], 'legacy Moe source fixture');
  put(batch.PROTECTED[1], [{ id: 'existing-voice', officialVoiceId: 'existing-voice', audioUrl: '/assets/voices/existing.mp3' }]);
  put(batch.PROTECTED[2], { 'existing-voice': 'existing_persona' });
  put(batch.PROTECTED[3], []); put(batch.PROTECTED[4], {});
  put('public/assets/voices/existing.mp3', 'existing sample');
  const m = batch.makeManifest(root), p = batch.locations(root, path.join(root, 'private-audition'));
  fs.mkdirSync(p.dir, { recursive: true });
  if (ready) {
    fs.mkdirSync(path.dirname(p.original), { recursive: true }); fs.mkdirSync(path.dirname(p.sample), { recursive: true });
    fs.writeFileSync(p.original, 'unique original first A'); fs.writeFileSync(p.sample, 'unique first A sample');
    Object.assign(m.jobs[0], { state: 'complete', taskId: 'test_moe_task', submittedAt: '2026-10-06T00:00:00Z',
      requestSha256: sha(JSON.stringify(provider.buildKieSunoRequest(batch.optionsFor()))), creditsConsumed: 12,
      clips: [{ id: 'test_moe_clip_A', url: 'https://cdn1.suno.ai/moe-first-A.mp3', duration: 45 },
        { id: 'test_moe_clip_B', url: 'https://cdn1.suno.ai/moe-second-B.mp3', duration: 45 }],
      sample: { version: 'A', clipId: 'test_moe_clip_A', seconds: 30.04, sha256: hashFile(p.sample),
        originalSha256: hashFile(p.original), qualityReview: 'unreviewed' },
      personaState: 'ready', personaId: 'test_moe_persona', personaModel: 'style_persona',
      personaSourceVersion: 'A', personaTaskId: 'test_moe_task', personaAudioId: 'test_moe_clip_A' });
  }
  const persist = value => save(p.manifest, value); persist(m);
  return { root, m, p, put, persist };
}
function withoutPersona(f) {
  for (const key of Object.keys(f.m.jobs[0])) if (key.startsWith('persona') && key !== 'personaDescription') delete f.m.jobs[0][key];
}

test('real manifest and registry staging remain outside both project and public asset directories', () => {
  const p = batch.locations();
  assert.equal(p.dir, '/private/tmp/melodio-approved-voice-moe-20261006');
  assert.ok(!p.dir.startsWith(p.root + path.sep));
  assert.ok(p.manifest.startsWith(p.dir + path.sep));
  assert.ok(p.publication.startsWith(p.dir + path.sep));
});

test('Moe retains the existing authored identity and requests Japanese female singing with eight authored lines', () => {
  const source = ts.transpileModule(fs.readFileSync('src/data/vocalStyles.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = {};
  new Function('require', 'exports', source)(name => {
    assert.ok(['./officialVocalCatalog.json', './legacyVocalSamples.json'].includes(name));
    return { default: require('../src/data/' + name.slice(2)) };
  }, loaded);
  const existing = loaded.INITIAL_SYSTEM_VOICES.find(row => row.id === batch.ID);
  assert.equal(existing.name, 'Moe'); assert.equal(existing.stylePrompt, batch.profile().stylePrompt);
  const request = provider.buildKieSunoRequest(batch.optionsFor());
  assert.equal(request.model, 'ai-music-api/generate'); assert.equal(request.input.model, 'V6');
  assert.equal(request.input.vocal_gender, 'f'); assert.equal(request.input.instrumental, false);
  assert.equal(request.input.duration, 45); assert.equal(request.input.persona_id, undefined);
  const lines = request.input.prompt.split('\n').filter(line => line && !line.startsWith('['));
  assert.equal(lines.length, 8); assert.ok(lines.every(line => /[\u3040-\u30ff]/.test(line)));
  assert.match(request.input.style, /Japanese J-Pop solo singing/);
  assert.doesNotMatch(request.input.prompt, /BPM|vocals|piano|Moe|TTS/i);
});

test('scope, original prompt and persona description changes are rejected before paid requests', t => {
  const f = fixture(t);
  for (const mutate of [m => m.requestCap++, m => m.selectedVersion = 'B',
    m => m.jobs[0].options.vocalGender = 'm', m => m.jobs[0].options.lyrics += '\n[soft piano]',
    m => m.jobs[0].personaDescription = 'different voice', m => m.jobs[0].personaName = 'Different']) {
    const changed = structuredClone(f.m); mutate(changed);
    assert.throws(() => batch.validateManifest(changed), /MOE_SCOPE_CHANGED/);
  }
});

test('only missing Kie fields fall back; production values win and invalid configured hosts fail closed', () => {
  const production = { KIE_API_KEY: 'authoritative-fixture', KIE_API_URL: 'https://api.kie.ai', SUPABASE_SERVICE_ROLE_KEY: 'production-db-fixture' };
  const local = { KIE_API_KEY: 'local-music-fixture', KIE_API_URL: 'https://api.kie.ai', SUPABASE_SERVICE_ROLE_KEY: 'local-db-fixture' };
  assert.deepEqual(batch.selectConfig(production, local), { apiKey: 'authoritative-fixture', apiBaseUrl: 'https://api.kie.ai' });
  assert.deepEqual(batch.selectConfig({ SUPABASE_SERVICE_ROLE_KEY: production.SUPABASE_SERVICE_ROLE_KEY }, local),
    { apiKey: 'local-music-fixture', apiBaseUrl: 'https://api.kie.ai' });
  assert.equal(production.SUPABASE_SERVICE_ROLE_KEY, 'production-db-fixture');
  assert.throws(() => batch.selectConfig({ ...production, KIE_API_URL: 'https://unapproved.invalid' }, local));
  assert.throws(() => batch.selectConfig({}, {}));
});

test('invalid credentials do not reserve generation or persona attempts', async t => {
  const f = fixture(t); const before = hashFile(f.p.manifest); let calls = 0;
  const fetchImpl = async () => { calls++; assert.fail('invalid configuration must not reach the network'); };
  await assert.rejects(batch.submit(f.m, { apiKey: '' }, { persist: f.persist, fetchImpl }));
  assert.equal(f.m.jobs[0].state, 'planned'); assert.equal(f.m.jobs[0].submittedAt, undefined);
  assert.equal(hashFile(f.p.manifest), before);
  const ready = fixture(t, true); withoutPersona(ready); ready.persist(ready.m);
  const personaBefore = hashFile(ready.p.manifest);
  await assert.rejects(batch.persona(ready.m, ready.p, { apiKey: '' }, { persist: ready.persist, fetchImpl, inspect }));
  assert.equal(ready.m.jobs[0].personaState, undefined); assert.equal(hashFile(ready.p.manifest), personaBefore);
  assert.equal(calls, 0);
});

test('successful submission is persisted before dispatch and only one generation request can run', async t => {
  const f = fixture(t); let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++; assert.equal(url, 'https://api.kie.ai/api/v1/jobs/createTask'); assert.equal(options.method, 'POST');
    const saved = read(f.p.manifest).jobs[0]; assert.equal(saved.state, 'submitting'); assert.ok(saved.requestSha256);
    return response({ code: 200, data: { taskId: 'test_accepted_task' } });
  };
  await batch.submit(f.m, CONFIG, { persist: f.persist, fetchImpl });
  assert.equal(read(f.p.manifest).jobs[0].taskId, 'test_accepted_task');
  await assert.rejects(batch.submit(f.m, CONFIG, { persist: f.persist, fetchImpl }), /REQUEST_ALREADY_RESERVED/);
  assert.equal(calls, 1);
});

test('lost generation response survives reload without automatically resubmitting', async t => {
  const f = fixture(t); let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('offline simulated lost response'); };
  await assert.rejects(batch.submit(f.m, CONFIG, { persist: f.persist, fetchImpl }), /SUBMISSION_HELD_NO_AUTOMATIC_RETRY/);
  const reloaded = read(f.p.manifest); assert.equal(reloaded.jobs[0].state, 'submission-uncertain');
  await assert.rejects(batch.submit(reloaded, CONFIG, { persist: f.persist, fetchImpl }), /REQUEST_ALREADY_RESERVED/);
  await batch.status(reloaded, CONFIG, { persist: f.persist, fetchImpl }); assert.equal(calls, 1);
});

test('read-only status uses the shared parser and requires two real distinct clip IDs', async t => {
  const f = fixture(t); Object.assign(f.m.jobs[0], { state: 'processing', taskId: 'test_status_task' });
  const tracks = [{ id: 'test_status_clip_A', audio_url: 'https://cdn1.suno.ai/a.mp3', duration: 45 },
    { id: 'test_status_clip_B', audio_url: 'https://cdn1.suno.ai/b.mp3', duration: 46 }];
  const fetchImpl = async (url, options) => {
    assert.match(url, /recordInfo\?taskId=test_status_task$/); assert.equal(options.method, undefined);
    return response({ code: 200, data: { state: 'success', creditsConsumed: 12, resultJson: JSON.stringify({ tracks }) } });
  };
  await batch.status(f.m, CONFIG, { persist: f.persist, fetchImpl });
  assert.equal(f.m.jobs[0].state, 'complete'); assert.equal(batch.firstA(f.m).id, 'test_status_clip_A');
  f.m.jobs[0].state = 'processing'; delete tracks[0].id;
  await batch.status(f.m, CONFIG, { persist: f.persist, fetchImpl });
  assert.equal(f.m.jobs[0].state, 'processing'); assert.equal(f.m.jobs[0].statusError, 'read-or-response');
});

test('short first A stays held even when B is long enough; collection never substitutes B', async t => {
  const f = fixture(t, true); delete f.m.jobs[0].sample;
  await batch.collect(f.m, f.p, { persist: f.persist, fetchImpl: async () => assert.fail('must reuse the existing A original'),
    encode: clip => { assert.equal(clip.id, 'test_moe_clip_A'); throw new Error('ORIGINAL_TOO_SHORT'); } });
  assert.equal(f.m.jobs[0].sampleError, 'ORIGINAL_TOO_SHORT'); assert.equal(f.m.jobs[0].sample, undefined);
  let calls = 0;
  await assert.rejects(batch.persona(f.m, f.p, CONFIG, { persist: f.persist, inspect, fetchImpl: async () => { calls++; } }), /FIRST_A_SAMPLE_REQUIRED/);
  assert.equal(calls, 0);
});

test('registration binds the first A clip and source task, while public publication contains no provider ID', async t => {
  const f = fixture(t, true); withoutPersona(f); let calls = 0;
  await batch.persona(f.m, f.p, CONFIG, { persist: f.persist, inspect, fetchImpl: async (_url, options) => {
    calls++; const body = JSON.parse(options.body), saved = read(f.p.manifest).jobs[0];
    assert.equal(saved.personaState, 'submitting'); assert.equal(body.model, 'ai-music-api/generate-persona');
    assert.equal(body.input.task_id, 'test_moe_task'); assert.equal(body.input.audio_id, 'test_moe_clip_A');
    assert.equal(body.input.vocal_start, 0); assert.equal(body.input.vocal_end, 30); assert.equal(body.input.name, 'Moe');
    return response({ code: 200, data: { personaId: 'test_new_moe_persona' } });
  } });
  assert.equal(calls, 1);
  const result = batch.buildPublication(f.m, f.p, { inspect });
  assert.equal(result.row.id, batch.ID); assert.equal(result.row.officialVoiceId, batch.ID);
  assert.equal(result.row.audioUrl, batch.PUBLIC_AUDIO); assert.equal(result.row.reviewStatus, 'trial');
  assert.equal(result.row.sampleDurationSeconds, 30); assert.equal(result.receipt.qualityReview, 'unreviewed');
  assert.equal(result.registryAddition[batch.ID], 'test_new_moe_persona');
  assert.doesNotMatch(JSON.stringify(result.row), /test_moe_task|test_moe_clip|test_new_moe_persona|cdn1|apiKey/);
});

test('unknown persona result remains reserved and does not retry registration', async t => {
  const f = fixture(t, true); withoutPersona(f); let calls = 0;
  const fetchImpl = async () => { calls++; return response({ code: 200, data: { taskId: 'unresolved_task_id' } }); };
  await assert.rejects(batch.persona(f.m, f.p, CONFIG, { persist: f.persist, fetchImpl, inspect }), /ROLLOUT_PERSONA_HELD/);
  const reloaded = read(f.p.manifest); assert.equal(reloaded.jobs[0].personaState, 'uncertain');
  await assert.rejects(batch.persona(reloaded, f.p, CONFIG, { persist: f.persist, fetchImpl, inspect }), /REGISTRATION_ALREADY_RESERVED/);
  assert.throws(() => batch.buildPublication(reloaded, f.p, { inspect }), /REFERENCE_NOT_READY/);
  assert.equal(calls, 1);
});

test('B selection, mismatched registration lineage and modified source audio fail closed', t => {
  const f = fixture(t, true);
  for (const mutate of [m => m.jobs[0].sample.version = 'B', m => m.jobs[0].sample.clipId = 'test_moe_clip_B',
    m => m.jobs[0].personaAudioId = 'test_moe_clip_B', m => m.jobs[0].personaTaskId = 'unrelated_task',
    m => m.jobs[0].personaModel = 'voice_persona']) {
    const changed = structuredClone(f.m); mutate(changed);
    assert.throws(() => batch.buildPublication(changed, f.p, { inspect }), /FIRST_A_SAMPLE_REQUIRED|REFERENCE_NOT_READY/);
  }
  fs.appendFileSync(f.p.original, 'tampered');
  assert.throws(() => batch.buildPublication(f.m, f.p, { inspect }), /AUDIO_PROVENANCE/);
});

test('staging preserves all product sources; duplicate samples or changed catalog cannot publish', t => {
  const f = fixture(t, true), before = Object.fromEntries(batch.PROTECTED.map(file => [file, hashFile(path.join(f.root, file))]));
  batch.stage(f.m, f.p, { inspect });
  for (const file of batch.PROTECTED) assert.equal(hashFile(path.join(f.root, file)), before[file]);
  assert.equal(read(path.join(f.p.publication, 'official-row.json')).id, batch.ID);
  assert.equal(hashFile(path.join(f.p.publication, `${batch.ID}-A.mp3`)), f.m.jobs[0].sample.sha256);
  f.put('public/assets/voices/existing.mp3', fs.readFileSync(f.p.sample, 'utf8'));
  assert.throws(() => batch.buildPublication(f.m, f.p, { inspect }), /REFERENCE_ALREADY_USED/);
  f.put(batch.PROTECTED[1], []);
  assert.throws(() => batch.buildPublication(f.m, f.p, { inspect }), /BASELINE_CHANGED/);
});
