const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'artifacts/discovery-vocals-v2-20261005');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function publicationFixture() {
  const files = new Map();
  const jobs = Array.from({ length: 240 }, (_, index) => {
    const gender = index < 120 ? 'female' : 'male';
    const number = index % 120 + 1;
    const id = `discovery-v2-${gender === 'female' ? 'f' : 'm'}-${String(number).padStart(3, '0')}`;
    const language = ['en', 'ko', 'ja', 'fr'][Math.floor((number - 1) / 30)];
    const profile = { id, gender, provisionalName: `Fixture ${index}`, shortDescription: `음색 ${index}`,
      family: 'smoky_grain', stylePrompt: `Original acoustic fixture design ${index}`, verificationStatus: 'design_only',
      audibleAnchors: ['stable low register', 'dry sustained grain'], signatureBehavior: '곧은 유지음 뒤의 짧은 유성 끝음' };
    const taskId = `source-task-${index}`, audioId = `source-audio-${index}-A`;
    const sample = Buffer.from(`first A sample bytes ${id}`), original = Buffer.from(`first A original bytes ${id}`);
    files.set(path.join(DIR, 'samples', `${id}-A.mp3`), sample);
    files.set(path.join(DIR, 'original', `${id}-A.mp3`), original);
    return { id, profile, gender, language, taskId, state: 'complete', creditsConsumed: index ? 12 : null,
      clips: [{ id: audioId, url: 'https://cdn1.suno.ai/first.mp3' }, { id: `source-audio-${index}-B`, url: 'https://cdn1.suno.ai/second.mp3' }],
      options: { model: 'V6', durationSeconds: 45, instrumental: false, vocalGender: gender === 'female' ? 'f' : 'm',
        style: `${profile.stylePrompt} ${language} controlled solo singing`, lyrics: `${language} fixture lyrics` },
      sample: { version: 'A', clipId: audioId, seconds: 30.04, sha256: digest(sample), originalSha256: digest(original) },
      personaId: `new_persona_${String(index).padStart(3, '0')}`, personaModel: 'style_persona', personaState: 'ready',
      personaSourceVersion: 'A', personaAudioId: audioId, personaTaskId: taskId };
  });
  const m = { requestCap: 240, selectedVersion: 'A', authorization: 'user-20261005-first-output-all240',
    createdAt: '2026-10-05T12:00:00+09:00', jobs };
  const baseline = Array.from({ length: 32 }, (_, index) => ({ id: `discovery-v1-fixture-${index}`,
    discoveryVoiceId: `discovery-v1-fixture-${index}`, name: `Baseline ${index}`, audioUrl: `/existing/${index}.mp3`,
    language: ['en', 'ko', 'ja', 'fr'][index % 4], gender: index % 2 ? 'male' : 'female',
    previewStatus: 'ready', baselineDetail: { preserved: true, index } }));
  const originalCatalog = [...baseline, { id: jobs[0].id, name: 'Previous v2 publication', audioUrl: '/old/v2.mp3' }];
  const registry = Object.fromEntries(baseline.map((row, index) => [row.id, `baseline_persona_${index}`]));
  registry[jobs[0].id] = 'previous_v2_persona';
  const paths = { manifest: path.join(DIR, 'rollout-240.json'),
    originalCatalog: path.join(ROOT, 'src/data/discoveryVoices.json'), originalRegistry: path.join(ROOT, 'src/lib/voice/discovery-voice-personas.json'),
    catalog: path.join(DIR, 'publication/discoveryVoices.json'), registry: path.join(DIR, 'publication/discovery-voice-personas.json'),
    receipt: path.join(DIR, 'publication/receipt.json') };
  files.set(paths.originalCatalog, JSON.stringify(originalCatalog));
  files.set(paths.originalRegistry, JSON.stringify(registry));
  files.set(paths.manifest, JSON.stringify(m));
  return { m, files, baseline, originalCatalog, registry, paths };
}

function loadPublisher(fixture, runMain = false, argv = []) {
  const moduleFixture = { exports: {} }, processFixture = { exitCode: 0, argv: ['node', 'publish-discovery-vocal-rollout-240.cjs', ...argv] };
  const logs = [], errors = [];
  let networkCalls = 0;
  const virtualFs = {
    mkdirSync() {},
    readFileSync(file) { if (!fixture.files.has(file)) throw new Error('Missing virtual artifact'); return fixture.files.get(file); },
    writeFileSync(file, data) { fixture.files.set(file, String(data)); },
    renameSync(from, to) { if (!fixture.files.has(from)) throw new Error('Missing virtual temporary file'); fixture.files.set(to, fixture.files.get(from)); fixture.files.delete(from); },
  };
  const requireFixture = name => name === 'node:fs' ? virtualFs : require(name);
  requireFixture.main = runMain ? moduleFixture : {};
  fixture.files.set(fixture.paths.manifest, JSON.stringify(fixture.m));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'publish-discovery-vocal-rollout-240.cjs'), 'utf8'), {
    __dirname, module: moduleFixture, require: requireFixture, process: processFixture,
    console: { log(message) { logs.push(message); }, error(message) { errors.push(message); } },
    fetch() { networkCalls++; throw new Error('Publication must remain offline'); },
  });
  return { exports: moduleFixture.exports, process: processFixture, logs, errors, networkCalls };
}

test('validated rows bind each first A to its source task, audio ID and sample/original hashes', () => {
  const fixture = publicationFixture(), publisher = loadPublisher(fixture);
  const rows = publisher.exports.validatedRows(fixture.m);
  assert.equal(rows.length, 240);
  assert.equal(new Set(rows.map(row => row.id)).size, 240);
  assert.equal(new Set(rows.map(row => row.audioUrl)).size, 240);
  for (const [index, row] of rows.entries()) {
    const source = fixture.m.jobs[index];
    assert.equal(row.id, source.id);
    assert.equal(row.sampleVersion, 'A');
    assert.equal(row.audioUrl, `/assets/voices/discovery-v2-20261005/${source.id}-A.mp3`);
    assert.equal(row.sampleDurationSeconds, 30);
    assert.equal(row.reuseStatus, 'ready');
    assert.equal(row.qualityReview, 'unreviewed');
    assert.equal(row.stylePrompt, source.profile.stylePrompt);
  }
  assert.equal(publisher.networkCalls, 0);
});

test('B samples, wrong source bindings and incomplete registration receipts cannot publish', () => {
  const patches = [
    job => { job.sample.version = 'B'; },
    job => { job.sample.clipId = job.clips[1].id; },
    job => { job.personaSourceVersion = 'B'; },
    job => { job.personaAudioId = job.clips[1].id; },
    job => { job.personaTaskId = 'different-source-task'; },
    job => { job.personaState = 'uncertain'; },
    job => { job.personaModel = 'voice_persona'; },
    job => { job.personaId = 'bad id'; },
    job => { job.options.style = 'Unrelated acoustic design'; },
  ];
  for (const mutate of patches) {
    const fixture = publicationFixture(), publisher = loadPublisher(fixture);
    mutate(fixture.m.jobs[0]);
    assert.throws(() => publisher.exports.validatedRows(fixture.m), /FIRST_A_REFERENCE_NOT_READY/);
  }
  const missingA = publicationFixture(), publisher = loadPublisher(missingA);
  missingA.m.jobs[0].clips[0] = undefined;
  assert.throws(() => publisher.exports.validatedRows(missingA.m), /FIRST_A_NOT_READY/);
});

test('source task provenance is mandatory even when both task receipt fields are absent', () => {
  const fixture = publicationFixture(), publisher = loadPublisher(fixture);
  delete fixture.m.jobs[0].taskId;
  delete fixture.m.jobs[0].personaTaskId;
  assert.throws(() => publisher.exports.validatedRows(fixture.m), /FIRST_A_REFERENCE_NOT_READY/);
});

test('sample duration must be finite numeric evidence inside the verified 30-second window', () => {
  for (const seconds of [undefined, null, NaN, Infinity, '30.04', 29.9, 30.2]) {
    const fixture = publicationFixture(), publisher = loadPublisher(fixture);
    fixture.m.jobs[0].sample.seconds = seconds;
    assert.throws(() => publisher.exports.validatedRows(fixture.m), /FIRST_A_REFERENCE_NOT_READY/, String(seconds));
  }
});

test('changed first A sample or original bytes are rejected by their recorded hashes', () => {
  for (const directory of ['samples', 'original']) {
    const fixture = publicationFixture(), publisher = loadPublisher(fixture);
    const id = fixture.m.jobs[0].id;
    fixture.files.set(path.join(DIR, directory, `${id}-A.mp3`), Buffer.from('modified artifact bytes'));
    assert.throws(() => publisher.exports.validatedRows(fixture.m), /AUDIO_PROVENANCE/);
  }
});

test('different design rows cannot publish the same registered reference or sample binding twice', () => {
  const duplicatePersona = publicationFixture(), publisher = loadPublisher(duplicatePersona);
  duplicatePersona.m.jobs[1].personaId = duplicatePersona.m.jobs[0].personaId;
  assert.throws(() => publisher.exports.validatedRows(duplicatePersona.m), /DUPLICATE_BINDING/);
  const duplicateSample = publicationFixture(), samplePublisher = loadPublisher(duplicateSample);
  duplicateSample.m.jobs[1].sample.sha256 = duplicateSample.m.jobs[0].sample.sha256;
  assert.throws(() => samplePublisher.exports.validatedRows(duplicateSample.m), /DUPLICATE_BINDING/);
});

test('the actual publication preserves all 32 baseline rows and bindings in one unique 272-row bundle', () => {
  const fixture = publicationFixture();
  const catalogBefore = fixture.files.get(fixture.paths.originalCatalog), registryBefore = fixture.files.get(fixture.paths.originalRegistry);
  const publisher = loadPublisher(fixture, true);
  assert.deepEqual(publisher.errors, []);
  assert.equal(publisher.process.exitCode, 0);
  assert.equal(publisher.networkCalls, 0);
  const catalog = JSON.parse(fixture.files.get(fixture.paths.catalog));
  const registry = JSON.parse(fixture.files.get(fixture.paths.registry));
  const receipt = JSON.parse(fixture.files.get(fixture.paths.receipt));
  assert.equal(catalog.length, 272);
  assert.equal(new Set(catalog.map(row => row.id)).size, 272);
  assert.deepEqual(catalog.slice(0, 32), fixture.baseline);
  assert.equal(catalog.filter(row => row.id === fixture.m.jobs[0].id).length, 1);
  for (const baseline of fixture.baseline) assert.equal(registry[baseline.id], fixture.registry[baseline.id]);
  for (const job of fixture.m.jobs) assert.equal(registry[job.id], job.personaId);
  assert.equal(new Set(catalog.map(row => registry[row.id])).size, 272);
  assert.equal(receipt.catalogTotal, 272);
  assert.equal(receipt.readyNewReferences, 240);
  assert.equal(receipt.selectedVersion, 'A');
  assert.equal(receipt.qualityReview, 'unreviewed');
  assert.equal(receipt.sameSingerGuarantee, false);
  assert.equal(receipt.actualKnownGenerationCredits, 239 * 12);
  assert.equal(receipt.unknownCostRequests, 1);
  assert.equal(receipt.catalogSha256, digest(fixture.files.get(fixture.paths.catalog)));
  assert.equal(receipt.registrySha256, digest(fixture.files.get(fixture.paths.registry)));
  assert.equal(fixture.files.get(fixture.paths.originalCatalog), catalogBefore);
  assert.equal(fixture.files.get(fixture.paths.originalRegistry), registryBefore);
});

test('an invalid final job prevents any partial publication bundle from being written', () => {
  const fixture = publicationFixture();
  fixture.m.jobs.at(-1).personaAudioId = 'wrong-final-source';
  const publisher = loadPublisher(fixture, true);
  assert.deepEqual(publisher.errors, ['FIRST_A_REFERENCE_NOT_READY']);
  assert.equal(publisher.process.exitCode, 1);
  for (const file of [fixture.paths.catalog, fixture.paths.registry, fixture.paths.receipt]) assert.equal(fixture.files.has(file), false);
  assert.equal(publisher.networkCalls, 0);
});

function pendingFixture() {
  const fixture = publicationFixture();
  for (const job of fixture.m.jobs) {
    for (const key of ['personaState', 'personaId', 'personaModel', 'personaSourceVersion', 'personaAudioId', 'personaTaskId']) delete job[key];
  }
  delete fixture.registry[fixture.m.jobs[0].id];
  fixture.files.set(fixture.paths.originalRegistry, JSON.stringify(fixture.registry));
  return fixture;
}

test('pending A previews require explicit preview mode and never claim ready references', () => {
  const fixture = pendingFixture(), publisher = loadPublisher(fixture);
  assert.throws(() => publisher.exports.validatedRows(fixture.m), /FIRST_A_REFERENCE_NOT_READY/);
  const rows = publisher.exports.validatedRows(fixture.m, { allowPending: true });
  assert.equal(rows.length, 240);
  for (const row of rows) {
    assert.equal(row.reuseStatus, 'pending');
    assert.equal(row.sampleVersion, 'A');
    assert.equal(row.previewStatus, 'ready');
    assert.equal(Object.hasOwn(row, 'personaId'), false);
  }
  assert.equal(publisher.networkCalls, 0);
});

test('preview mode cannot turn uncertain, submitting, held or malformed ready registrations into pending rows', () => {
  for (const personaState of ['uncertain', 'submitting', 'held', 'ready']) {
    const fixture = pendingFixture(), publisher = loadPublisher(fixture);
    fixture.m.jobs[0].personaState = personaState;
    assert.throws(() => publisher.exports.validatedRows(fixture.m, { allowPending: true }), /FIRST_A_REFERENCE_NOT_READY/, personaState);
  }
  const orphanId = pendingFixture(), publisher = loadPublisher(orphanId);
  orphanId.m.jobs[0].personaId = 'unreceipted_persona';
  assert.throws(() => publisher.exports.validatedRows(orphanId.m, { allowPending: true }), /FIRST_A_REFERENCE_NOT_READY/);
});

test('preview mode preserves first A, source-task and audio-hash gates before registration', () => {
  const patches = [
    [fixture => { fixture.m.jobs[0].sample.version = 'B'; }, /FIRST_A_REFERENCE_NOT_READY/],
    [fixture => { fixture.m.jobs[0].sample.clipId = fixture.m.jobs[0].clips[1].id; }, /FIRST_A_REFERENCE_NOT_READY/],
    [fixture => { delete fixture.m.jobs[0].taskId; }, /FIRST_A_REFERENCE_NOT_READY/],
    [fixture => { fixture.m.jobs[0].sample.seconds = undefined; }, /FIRST_A_REFERENCE_NOT_READY/],
    [fixture => { fixture.files.set(path.join(DIR, 'samples', `${fixture.m.jobs[0].id}-A.mp3`), Buffer.from('changed preview sample')); }, /AUDIO_PROVENANCE/],
    [fixture => { fixture.files.set(path.join(DIR, 'original', `${fixture.m.jobs[0].id}-A.mp3`), Buffer.from('changed preview original')); }, /AUDIO_PROVENANCE/],
  ];
  for (const [mutate, expected] of patches) {
    const fixture = pendingFixture(), publisher = loadPublisher(fixture);
    mutate(fixture);
    assert.throws(() => publisher.exports.validatedRows(fixture.m, { allowPending: true }), expected);
  }
});

test('the actual preview CLI preserves the baseline and writes zero fake registry references', () => {
  const fixture = pendingFixture();
  const catalogBefore = fixture.files.get(fixture.paths.originalCatalog), registryBefore = fixture.files.get(fixture.paths.originalRegistry);
  const publisher = loadPublisher(fixture, true, ['--previews']);
  assert.deepEqual(publisher.errors, []);
  assert.equal(publisher.process.exitCode, 0);
  assert.equal(publisher.networkCalls, 0);
  const catalog = JSON.parse(fixture.files.get(fixture.paths.catalog));
  const registry = JSON.parse(fixture.files.get(fixture.paths.registry));
  const receipt = JSON.parse(fixture.files.get(fixture.paths.receipt));
  assert.equal(catalog.length, 272);
  assert.equal(new Set(catalog.map(row => row.id)).size, 272);
  assert.deepEqual(catalog.slice(0, 32), fixture.baseline);
  assert.ok(catalog.slice(32).every(row => row.reuseStatus === 'pending' && row.sampleVersion === 'A'));
  assert.deepEqual(registry, fixture.registry);
  for (const job of fixture.m.jobs) assert.equal(Object.hasOwn(registry, job.id), false);
  assert.equal(receipt.readyNewReferences, 0);
  assert.equal(receipt.catalogTotal, 272);
  assert.equal(receipt.catalogSha256, digest(fixture.files.get(fixture.paths.catalog)));
  assert.equal(receipt.registrySha256, digest(fixture.files.get(fixture.paths.registry)));
  assert.equal(JSON.parse(publisher.logs[0]).references, 0);
  assert.equal(fixture.files.get(fixture.paths.originalCatalog), catalogBefore);
  assert.equal(fixture.files.get(fixture.paths.originalRegistry), registryBefore);
});

test('a preview bundle registers only genuinely ready rows when ready and pending sources are mixed', () => {
  const fixture = pendingFixture();
  fixture.m.jobs[0] = publicationFixture().m.jobs[0];
  const publisher = loadPublisher(fixture, true, ['--previews']);
  assert.deepEqual(publisher.errors, []);
  const catalog = JSON.parse(fixture.files.get(fixture.paths.catalog));
  const registry = JSON.parse(fixture.files.get(fixture.paths.registry));
  const receipt = JSON.parse(fixture.files.get(fixture.paths.receipt));
  assert.equal(catalog.slice(32).filter(row => row.reuseStatus === 'ready').length, 1);
  assert.equal(catalog.slice(32).filter(row => row.reuseStatus === 'pending').length, 239);
  assert.equal(registry[fixture.m.jobs[0].id], fixture.m.jobs[0].personaId);
  for (const job of fixture.m.jobs.slice(1)) assert.equal(Object.hasOwn(registry, job.id), false);
  assert.equal(Object.keys(registry).length, 33);
  assert.equal(receipt.readyNewReferences, 1);
});

test('a pre-existing registry binding for a pending preview stops publication instead of retaining a false reference', () => {
  const fixture = pendingFixture();
  fixture.registry[fixture.m.jobs[0].id] = 'stale_or_unreceipted_persona';
  fixture.files.set(fixture.paths.originalRegistry, JSON.stringify(fixture.registry));
  const publisher = loadPublisher(fixture, true, ['--previews']);
  assert.deepEqual(publisher.errors, ['PENDING_REFERENCE_EXISTS']);
  assert.equal(publisher.process.exitCode, 1);
  for (const file of [fixture.paths.catalog, fixture.paths.registry, fixture.paths.receipt]) assert.equal(fixture.files.has(file), false);
  assert.equal(publisher.networkCalls, 0);
});
