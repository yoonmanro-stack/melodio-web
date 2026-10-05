const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateProfiles, validateSubmission, eligible, mediaUrl, CAP } = require('./discovery-vocal-audition-v2.cjs');
const { ensureAuditionOutputs } = require('./discovery-vocal-audition-v2.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeKieSunoStatus } = require('../worker/suno-provider');
const exclusion = 'speech, spoken introduction, choir, duet, backing vocals, doubled lead, long intro, long instrumental break, heavy reverb, autotune effects, screaming, sound effects, loud instruments';
function fixture() {
  const jobs = Array.from({ length: CAP }, (_, i) => ({ id: `profile-${i}`, state: 'planned', options: {
    model: 'V6', instrumental: false, durationSeconds: 45, vocalGender: 'f', style: 'original dry solo grainy singing', exclude: exclusion,
  } }));
  return { requestCap: CAP, jobs };
}
test('uncertain or accepted submissions are never eligible for another paid request', () => {
  for (const state of ['submitting', 'submission-uncertain', 'processing', 'complete', 'failed']) {
    const m = fixture(); m.jobs[0].state = state;
    assert.equal(eligible(m.jobs[0]), false);
    assert.throws(() => validateSubmission(m, m.jobs[0]));
  }
  assert.equal(eligible({ state: 'throttled' }), true);
});
test('paid request cap cannot be enlarged or bypassed by replacing job identity', () => {
  const m = fixture(); validateSubmission(m, m.jobs[0]);
  assert.throws(() => validateSubmission({ ...m, requestCap: 13 }, m.jobs[0]));
  assert.throws(() => validateSubmission(m, { ...m.jobs[0] }));
  assert.throws(() => validateSubmission({ ...m, jobs: [...m.jobs, m.jobs[0]] }, m.jobs[0]));
});
test('the audition path refuses reference registration, unexpected models, long requests and truncated prompts', () => {
  for (const patch of [{ personaId: 'other_persona' }, { personaModel: 'voice_persona' }, { model: 'V6_WILD' },
    { durationSeconds: 195 }, { instrumental: true }, { style: 'a'.repeat(1000) }, { exclude: '' }]) {
    const m = fixture(); Object.assign(m.jobs[0].options, patch);
    assert.throws(() => validateSubmission(m, m.jobs[0]));
  }
});
test('only known HTTPS music download hosts are accepted', () => {
  assert.equal(mediaUrl('https://tempfile.aiquickdraw.com/example.mp3').hostname, 'tempfile.aiquickdraw.com');
  for (const value of ['http://tempfile.aiquickdraw.com/a.mp3', 'https://127.0.0.1/a.mp3', 'https://tempfile.aiquickdraw.com.evil.test/a.mp3',
    'https://user:password@tempfile.aiquickdraw.com/a.mp3', 'data:audio/mpeg;base64,AAAA']) assert.throws(() => mediaUrl(value));
});
test('profile records remain design-only and cannot fabricate a validated catalog', () => {
  const designs = Array.from({ length: 240 }, (_, i) => ({ id: `discovery-v2-${i < 120 ? 'f' : 'm'}-${String(i % 120 + 1).padStart(3, '0')}`,
    gender: i < 120 ? 'female' : 'male', verificationStatus: 'design_only', stylePrompt: `Original acoustic design ${i}`,
    audibleAnchors: ['low register', 'dry grain'], signatureBehavior: 'slow grainy voiced ending' }));
  validateProfiles(designs);
  assert.throws(() => validateProfiles(designs.slice(0, 239)));
  assert.throws(() => validateProfiles(designs.map((p, i) => i ? p : { ...p, verificationStatus: 'verified' })));
  assert.throws(() => validateProfiles(designs.map((p, i) => i ? p : { ...p, audibleAnchors: ['same', 'same'] })));
  assert.throws(() => validateProfiles(designs.map((p, i) => i ? p : { ...p, stylePrompt: designs[1].stylePrompt })));
});

function audioFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melodio-vocal-collection-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = { original: path.join(dir, 'original.mp3'), sample: path.join(dir, 'sample.mp3'), hook: path.join(dir, 'hook.mp3') };
  const writeAudio = (file, seconds, marker) => fs.writeFileSync(file, JSON.stringify({ seconds, marker }));
  const calls = [];
  const io = {
    probeFile: file => JSON.parse(fs.readFileSync(file, 'utf8')).seconds,
    encode(args) {
      const output = args.at(-1), input = args[args.indexOf('-i') + 1];
      const seconds = Number(args[args.indexOf('-t') + 1]) + 0.04;
      calls.push({ input, output, seconds });
      writeAudio(output, seconds, `encoded-from-${path.basename(input)}`);
    },
  };
  writeAudio(files.original, 45, 'same-original');
  return { files, writeAudio, calls, io };
}
const auditionClip = { id: 'clip-a', url: 'https://cdn1.suno.ai/a.mp3' };

test('URL-only provider clips and inaccurate duration metadata use the measured source window', t => {
  const normalized = normalizeKieSunoStatus({ data: { state: 'success', resultJson: JSON.stringify({ resultUrls: [auditionClip.url] }) } }, 'task');
  assert.equal(normalized.state, 'complete');
  assert.equal(normalized.clips[0].duration, undefined);
  for (const duration of [normalized.clips[0].duration, 15]) {
    const f = audioFixture(t);
    const result = ensureAuditionOutputs({ ...auditionClip, duration }, f.files, f.io);
    assert.equal(result.seconds, 30.04);
    assert.equal(result.hookSeconds, 8.04);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.equal(f.calls.length, 2);
  }
});

test('an actually short source is held even when provider metadata claims a long clip', t => {
  const f = audioFixture(t);
  f.writeAudio(f.files.original, 29.9, 'short-original');
  const before = fs.readFileSync(f.files.original);
  assert.throws(() => ensureAuditionOutputs({ ...auditionClip, duration: 45 }, f.files, f.io), /ORIGINAL_TOO_SHORT/);
  assert.equal(f.calls.length, 0);
  assert.equal(fs.existsSync(f.files.sample), false);
  assert.equal(fs.existsSync(f.files.hook), false);
  assert.deepEqual(fs.readFileSync(f.files.original), before);
});

test('a valid orphan sample is preserved and its missing hook is derived from that sample', t => {
  const f = audioFixture(t);
  f.writeAudio(f.files.sample, 30.04, 'existing-normalized-sample');
  const before = fs.readFileSync(f.files.sample);
  const result = ensureAuditionOutputs(auditionClip, f.files, f.io);
  assert.equal(result.seconds, 30.04);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].input, f.files.sample);
  assert.deepEqual(fs.readFileSync(f.files.sample), before);
  assert.equal(fs.existsSync(f.calls[0].output), false);
});

test('a valid orphan hook is preserved and its missing sample is derived from the original', t => {
  const f = audioFixture(t);
  f.writeAudio(f.files.hook, 8.04, 'existing-hook');
  const before = fs.readFileSync(f.files.hook);
  const result = ensureAuditionOutputs(auditionClip, f.files, f.io);
  assert.equal(result.hookSeconds, 8.04);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].input, f.files.original);
  assert.deepEqual(fs.readFileSync(f.files.hook), before);
});

test('two valid unreceipted outputs can produce a receipt without re-encoding either file', t => {
  const f = audioFixture(t);
  f.writeAudio(f.files.sample, 30.04, 'existing-sample');
  f.writeAudio(f.files.hook, 8.04, 'existing-hook');
  const sampleBefore = fs.readFileSync(f.files.sample), hookBefore = fs.readFileSync(f.files.hook);
  const result = ensureAuditionOutputs(auditionClip, f.files, f.io);
  assert.equal(f.calls.length, 0);
  assert.equal(result.seconds, 30.04);
  assert.equal(result.hookSeconds, 8.04);
  assert.deepEqual(fs.readFileSync(f.files.sample), sampleBefore);
  assert.deepEqual(fs.readFileSync(f.files.hook), hookBefore);
});

test('invalid existing outputs are held untouched before any missing output is generated', t => {
  for (const [key, seconds] of [['sample', 28], ['hook', 6]]) {
    const f = audioFixture(t);
    f.writeAudio(f.files[key], seconds, 'invalid-existing-output');
    const before = fs.readFileSync(f.files[key]);
    assert.throws(() => ensureAuditionOutputs(auditionClip, f.files, f.io), /SAMPLE_DURATION/);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(fs.readFileSync(f.files[key]), before);
  }
});

test('a failed hook encode leaves its partial staging file and safely resumes without replacing the sample', t => {
  const f = audioFixture(t);
  const originalBefore = fs.readFileSync(f.files.original);
  let attempt = 0, failedStage;
  const interruptedIO = { ...f.io, encode(args) {
    if (++attempt === 2) {
      failedStage = args.at(-1);
      f.writeAudio(failedStage, 2, 'partial-failed-stage');
      throw new Error('SIMULATED_ENCODER_FAILURE');
    }
    f.io.encode(args);
  } };
  assert.throws(() => ensureAuditionOutputs(auditionClip, f.files, interruptedIO), /SIMULATED_ENCODER_FAILURE/);
  const sampleBefore = fs.readFileSync(f.files.sample), failedBefore = fs.readFileSync(failedStage);
  assert.equal(fs.existsSync(f.files.hook), false);
  const result = ensureAuditionOutputs(auditionClip, f.files, f.io);
  assert.equal(result.hookSeconds, 8.04);
  assert.deepEqual(fs.readFileSync(f.files.sample), sampleBefore);
  assert.deepEqual(fs.readFileSync(f.files.original), originalBefore);
  assert.deepEqual(fs.readFileSync(failedStage), failedBefore);
});

test('publishing a staged output refuses to replace a final artifact created during encoding', t => {
  const f = audioFixture(t);
  const io = { ...f.io, encode(args) {
    f.io.encode(args);
    f.writeAudio(f.files.sample, 30.04, 'concurrent-final-artifact');
  } };
  assert.throws(() => ensureAuditionOutputs(auditionClip, f.files, io), error => error.code === 'EEXIST');
  assert.equal(JSON.parse(fs.readFileSync(f.files.sample, 'utf8')).marker, 'concurrent-final-artifact');
  assert.equal(fs.existsSync(f.calls[0].output), true);
  assert.equal(fs.existsSync(f.files.hook), false);
});
