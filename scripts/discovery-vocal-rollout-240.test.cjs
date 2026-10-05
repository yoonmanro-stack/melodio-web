const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { canSubmit, canRegister, firstClip, validateManifest, CAP } = require('./discovery-vocal-rollout-240.cjs');

function manifestFixture() {
  const languages = ['en', 'ko', 'ja', 'fr'];
  const jobs = Array.from({ length: CAP }, (_, index) => {
    const gender = index < 120 ? 'female' : 'male';
    const number = index % 120 + 1;
    const id = `discovery-v2-${gender === 'female' ? 'f' : 'm'}-${String(number).padStart(3, '0')}`;
    const profile = { id, gender, provisionalName: `Fixture ${index}`, stylePrompt: `Original acoustic fixture design ${index}`,
      verificationStatus: 'design_only', audibleAnchors: ['stable register', 'dry grain'], signatureBehavior: 'straight voiced sustain' };
    return { id, profile, gender, language: languages[Math.floor((number - 1) / 30)], state: 'planned', options: {
      model: 'V6', durationSeconds: 45, instrumental: false, vocalGender: gender === 'female' ? 'f' : 'm',
      style: profile.stylePrompt, lyrics: 'A complete fixture lyric', exclude: 'doubled lead',
    } };
  });
  return { requestCap: CAP, selectedVersion: 'A', authorization: 'user-20261005-first-output-all240', jobs };
}

function completedA() {
  return { state: 'complete', taskId: 'charged-task', clips: [{ id: 'first-output', url: 'https://cdn1.suno.ai/a.mp3' },
    { id: 'second-output', url: 'https://cdn1.suno.ai/b.mp3' }], sample: { version: 'A', clipId: 'first-output' } };
}

test('the reference is always the first output and an unavailable A never falls back to B', () => {
  const job = completedA();
  assert.equal(firstClip(job), job.clips[0]);
  for (const first of [undefined, { id: 'first-output' }, { url: 'https://cdn1.suno.ai/a.mp3' }]) {
    assert.throws(() => firstClip({ ...job, clips: [first, job.clips[1]] }), /FIRST_A_NOT_READY/);
  }
  assert.throws(() => firstClip({ ...job, state: 'processing' }), /FIRST_A_NOT_READY/);
});

test('registration accepts only an A sample belonging to the first output', () => {
  const job = completedA();
  assert.equal(canRegister(job), true);
  assert.equal(canRegister({ ...job, sample: { version: 'B', clipId: job.clips[1].id } }), false);
  assert.equal(canRegister({ ...job, sample: { version: 'A', clipId: job.clips[1].id } }), false);
  assert.equal(canRegister({ ...job, sample: undefined }), false);
  assert.equal(canRegister({ ...job, state: 'processing' }), false);
});

test('uncertain, submitting, held and completed registrations are never automatically resent', () => {
  const job = completedA();
  for (const personaState of ['uncertain', 'submitting', 'held', 'ready']) {
    assert.equal(canRegister({ ...job, personaState }), false, personaState);
  }
});

test('charged generation jobs remain ineligible regardless of their saved generation state', () => {
  for (const state of ['planned', 'throttled', 'submitting', 'submission-uncertain', 'processing', 'complete', 'failed']) {
    assert.equal(canSubmit({ state, taskId: 'already-charged-task' }), false, state);
  }
  assert.equal(canSubmit({ state: 'planned' }), true);
  assert.equal(canSubmit({ state: 'throttled' }), true);
  for (const state of ['submitting', 'submission-uncertain', 'processing', 'complete', 'failed']) {
    assert.equal(canSubmit({ state }), false, state);
  }
});

test('scope remains exactly 240 designs with 120 per gender and 30 in every gender-language cell', () => {
  const valid = manifestFixture();
  validateManifest(valid);
  const cells = valid.jobs.reduce((counts, job) => {
    const key = `${job.gender}:${job.language}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  assert.equal(Object.keys(cells).length, 8);
  assert.ok(Object.values(cells).every(count => count === 30));
  for (const patch of [{ requestCap: 241 }, { selectedVersion: 'B' }, { authorization: 'other-scope' },
    { jobs: valid.jobs.slice(0, 239) }, { jobs: [...valid.jobs, valid.jobs[0]] }]) {
    assert.throws(() => validateManifest({ ...valid, ...patch }), /ROLLOUT_SCOPE/);
  }
  const unbalanced = manifestFixture();
  unbalanced.jobs[0].language = 'ko';
  assert.throws(() => validateManifest(unbalanced), /ROLLOUT_BALANCE/);
  const wrongGender = manifestFixture();
  wrongGender.jobs[0].gender = 'male';
  assert.throws(() => validateManifest(wrongGender), /ROLLOUT_REQUEST/);
});

test('new generation options cannot switch models, add persona reuse or exceed the style limit', () => {
  for (const patch of [{ model: 'V6_WILD' }, { durationSeconds: 46 }, { instrumental: true },
    { vocalGender: 'm' }, { personaId: 'existing_persona' }, { personaModel: 'style_persona' }, { style: 'x'.repeat(1000) }]) {
    const fixture = manifestFixture();
    Object.assign(fixture.jobs[0].options, patch);
    assert.throws(() => validateManifest(fixture), /ROLLOUT_REQUEST/);
  }
});

test('the actual planner imports 12 charged tasks and A receipts without resubmission or real I/O', async () => {
  const fixture = manifestFixture();
  const imported = [...fixture.jobs.slice(0, 6), ...fixture.jobs.slice(120, 126)].map((job, index) => ({ ...job,
    state: index % 2 ? 'complete' : 'processing', taskId: `charged-initial-${index}`, creditsConsumed: 12,
    clips: [{ id: `initial-${index}-first`, url: 'https://cdn1.suno.ai/a.mp3' }, { id: `initial-${index}-second`, url: 'https://cdn1.suno.ai/b.mp3' }],
    samples: [{ version: 'B', clipId: `initial-${index}-second` }, { version: 'A', clipId: `initial-${index}-first` }],
  }));
  const scriptPath = path.join(__dirname, 'discovery-vocal-rollout-240.cjs');
  const root = path.resolve(__dirname, '..');
  const artifactDir = path.join(root, 'artifacts/discovery-vocals-v2-20261005');
  const rolloutPath = path.join(artifactDir, 'rollout-240.json');
  const files = new Map([
    [path.join(artifactDir, 'manifest.json'), JSON.stringify({ jobs: imported })],
    ...['female', 'male'].map(gender => [path.join(root, `docs/research/voice-discovery-v2/${gender}-profiles.json`),
      JSON.stringify(fixture.jobs.filter(job => job.gender === gender).map(job => job.profile))]),
    [path.join(root, 'src/data/discoveryVoices.json'), JSON.stringify(['female', 'male'].flatMap(gender =>
      ['en', 'ko', 'ja', 'fr'].map(language => ({ gender, language, lyricsPrompt: `${language} fixture lyrics` }))))],
  ]);
  let networkCalls = 0;
  const moduleFixture = { exports: {} };
  const processFixture = { argv: ['node', scriptPath, 'plan'], exitCode: 0 };
  const errors = [];
  const virtualFs = {
    mkdirSync() {}, rmdirSync() {},
    existsSync(file) { return files.has(file); },
    readFileSync(file) { if (!files.has(file)) throw new Error('Unexpected virtual read'); return files.get(file); },
    writeFileSync(file, value) { files.set(file, String(value)); },
    renameSync(from, to) { if (!files.has(from)) throw new Error('Missing virtual temporary file'); files.set(to, files.get(from)); files.delete(from); },
  };
  const requireFixture = name => {
    if (name === 'node:fs') return virtualFs;
    if (name === '@next/env') return { loadEnvConfig() {} };
    if (name === '../worker/suno-provider') return new Proxy({}, { get() { networkCalls++; throw new Error('Planner must not invoke provider'); } });
    return require(name);
  };
  requireFixture.main = moduleFixture;
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), { __dirname, module: moduleFixture,
    require: requireFixture, process: processFixture, console: { log() {}, error(message) { errors.push(message); } },
    fetch() { networkCalls++; throw new Error('Planner must not invoke fetch'); }, setTimeout });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
  assert.equal(processFixture.exitCode, 0);
  assert.equal(networkCalls, 0);
  const planned = JSON.parse(files.get(rolloutPath));
  validateManifest(planned);
  assert.equal(planned.importedRequests, 12);
  assert.equal(planned.jobs.filter(canSubmit).length, 228);
  assert.equal(planned.jobs.filter(job => job.taskId).length, 12);
  for (const original of imported) {
    const job = planned.jobs.find(candidate => candidate.id === original.id);
    assert.equal(job.taskId, original.taskId);
    assert.equal(job.state, original.state);
    assert.equal(job.creditsConsumed, 12);
    assert.equal(job.language, 'ko');
    assert.equal(job.sample.version, 'A');
    assert.equal(job.sample.clipId, original.clips[0].id);
    assert.equal(canSubmit(job), false);
  }
});
