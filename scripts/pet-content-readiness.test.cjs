/** Offline content/publication contracts; no environment, database or provider access. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name) {
  const filename = path.resolve(__dirname, '../src/lib/video', name + '.ts');
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, URL, require(name) {
    if (name === './petContentReadiness') return load('petContentReadiness');
    throw new Error('Runtime services are forbidden');
  } });
  return mod.exports;
}
const { summarizePetContentReadiness: summarize, hasPetOwnerContentApproval: approved, PET_CONTENT_REVIEW_POLICY: policy } = load('petContentReadiness');
const project = load('publicViralVideos').buildPublicViralVideoRows;
const url = 'https://example.invalid/completed.mp4', now = '2026-10-11T10:00:00.000Z';
const good = () => ({ analysisStatus: 'complete', scope: 'sampled_frames', issues: [] });
const shot = (id, video = good()) => ({ id, quality: { video } });
const generation = (overrides = {}) => ({ id: 'track', user_id: 'owner', title: '완성 영상', status: 'completed', is_public: true, created_at: now,
  license_hash: JSON.stringify({ sourceMenu: 'viral', presetId: 'pet', isPublic: true, video_url: url }), ...overrides });
const job = (overrides = {}) => ({ user_id: 'owner', status: 'completed', track_id: 'track', video_url: url, updated_at: now, content_policy_version: policy, ...overrides });
test('clean sampled analyses still require owner preview, old pass is not full evidence', () => {
  const review = summarize({ videoUrl: url, shots: [shot('C1'), shot('C2')] });
  assert.equal(review.status, 'preview_required'); assert.equal(review.analyzedClips, 2); assert.equal(review.totalClips, 2);
  assert.equal(summarize({ videoUrl: url, shots: [shot('C1', { status: 'passed', issues: [] })] }).status, 'not_evaluated');
});
test('visible concerns and unavailable analysis survive without changing source', () => {
  const input = { shots: [shot('C1', { ...good(), issues: ['동물이 바뀌어 보입니다.'] }), shot('C2', { analysisStatus: 'unavailable' })] };
  const before = JSON.stringify(input), result = summarize(input);
  assert.equal(result.status, 'needs_attention'); assert.equal(result.analyzedClips, 1); assert.equal(result.concerns.length, 2);
  assert.equal(JSON.stringify(input), before);
});
test('owner acknowledgement binds the exact render, does not hide concerns or certify AI quality', () => {
  const input = { videoUrl: url, shots: [shot('C1', { ...good(), issues: ['확인할 부분'] })], approval: { videoUrl: url, approvedAt: now } };
  assert.equal(summarize(input).status, 'owner_confirmed'); assert.equal(summarize(input).concerns.length, 1);
  assert.equal(summarize({ ...input, videoUrl: 'https://example.invalid/new.mp4' }).status, 'needs_attention');
  assert.equal(summarize({ ...input, approval: { videoUrl: url, approvedAt: 'invalid' } }).status, 'needs_attention');
});
test('concerns stay bounded', () => {
  const review = summarize({ shots: [shot('C1', { ...good(), issues: [...Array.from({ length: 20 }, (_, i) => `문제 ${i}`), '긴'.repeat(501)] })] });
  assert.equal(review.concerns.length, 6); assert.ok(review.concerns.every(s => s.length < 510));
});
test('planning cautions remain visible through completion and owner review', () => {
  const input = { videoUrl: url, shots: [shot('C1'), shot('C2')], planningWarnings: ['원문과 장면의 행동 연결을 확인해 주세요.'], approval: { videoUrl: url, approvedAt: now } };
  assert.equal(summarize({ ...input, approval: undefined }).status, 'needs_attention');
  const result = summarize(input);
  assert.equal(result.status, 'owner_confirmed');
  assert.equal(result.concerns[0], '기획 · 원문과 장면의 행동 연결을 확인해 주세요.');
});
test('rendered concerns from both clips take priority over planning cautions', () => {
  const result = summarize({ shots: [shot('C1', { ...good(), issues: ['첫 행동', '첫 반전', '첫 인과'] }), shot('C2', { ...good(), issues: ['후반 행동', '후반 반전', '중복 소품'] })], planningWarnings: ['의미 검사', '기획 확인', '흐름 확인'] });
  assert.equal(result.concerns.length, 6);
  assert.equal(result.concerns[1], 'C2 · 후반 행동');
  assert.ok(result.concerns.includes('C2 · 중복 소품'));
});
test('new policy fails closed and archived jobs preserve their publication', () => {
  assert.equal(approved({}), true); assert.equal(approved({ contentPolicyVersion: policy, videoUrl: url }), false);
  assert.equal(approved({ contentPolicyVersion: policy, videoUrl: url, approvalUrl: url, approvedAt: now }), true);
  assert.equal(approved({ contentPolicyVersion: 'unknown', videoUrl: url, approvalUrl: url, approvedAt: now }), false);
});
test('cached generation URL cannot bypass owner preview, and private stays private', () => {
  assert.equal(project([generation()], [job()]).length, 0);
  const confirmed = job({ approval_url: url, approval_at: now });
  assert.equal(project([generation()], [confirmed]).length, 1);
  assert.equal(project([generation({ is_public: false })], [confirmed]).length, 0);
});
test('newest owner job controls preview regardless of ordering, foreign acknowledgement is ignored', () => {
  const old = job({ updated_at: '2026-10-10T10:00:00.000Z', approval_url: url, approval_at: now });
  for (const jobs of [[old, job()], [job(), old]]) assert.equal(project([generation()], jobs).length, 0);
  assert.equal(project([generation()], [job(), job({ user_id: 'foreign', approval_url: url, approval_at: now })]).length, 0);
});
test('legacy pet and dance public playback remain compatible', () => {
  assert.equal(project([generation()], [job({ content_policy_version: undefined })]).length, 1);
  const dance = generation({ license_hash: JSON.stringify({ sourceMenu: 'viral', presetId: 'challenge', isPublic: true, video_url: url }) });
  assert.equal(project([dance], []).length, 1);
});
test('malformed new policy completion cannot fall back to a cached metadata URL', () => {
  for (const invalid of [{ video_url: null }, { updated_at: 'invalid' }, { video_url: 'http://example.invalid/unsafe.mp4' }]) {
    assert.equal(project([generation()], [job(invalid)]).length, 0);
  }
});
