const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePreviewQuality, sampleJob } = require('../shared/healing-rain/quality');
const direction = { version: 'test-v2', profiles: ['sheltered-sleep', 'moving-background'], loop: { cycleSeconds: 10, fps: 24 } };
const models = { image: 'image-model', video: 'video-model', audio: 'audio-model' };
const report = () => ({ status: 'complete', effectiveVideoCycleSeconds: 10, videoSeamMetrics: { decodedFrames: 240, wrapToInteriorP95Ratio: 0.75 }, warnings: [], outputs: [30, 180].map(seconds => ({ seconds, media: { duration: seconds }, videoEndpointClosesCycle: true, aacMetrics: { silent100msWindows: 0, decodedSeconds: seconds }, aacLoudness: { truePeakDb: -12 }, bytes: 10e6, packetMetrics: { 0: { packets: seconds*24, nonMonotonicDts: 0, maxTimestampGapSeconds: 0 }, 1: { packets: seconds*47, nonMonotonicDts: 0, maxTimestampGapSeconds: 0.000001 } } })) });
const approvals = direction.profiles.map(profile => ({ profile, directionVersion: direction.version, models, verdict: 'approved', reviewedAt: '2026-10-13T00:00:00Z', evidenceId: 'reviewed-representative-job' }));
const regularJob = Array.from({length:20},(_,i)=>`job-${i}`).find(id=>!sampleJob(id));
const input = extra => ({direction,models,jobId:regularJob,report:report(),...extra});
test('complete technical results still require first profile/model review',()=>{ const q=evaluatePreviewQuality(input()); assert.equal(q.technicalStatus,'passed');assert.equal(q.reviewDecision,'required');assert.equal(q.unreviewedProfiles.length,2);assert.equal(q.checks.find(c=>c.id==='scene_realism').status,'not_measured'); });
test('approved profiles and passing metrics still require listening to each new audio source', () => {
  assert.equal(sampleJob(regularJob), false);
  const q = evaluatePreviewQuality(input({ approvals }));
  assert.equal(q.technicalStatus, 'passed');
  assert.equal(q.reviewDecision, 'required');
  assert.deepEqual(q.unreviewedProfiles, []);
  assert.deepEqual(q.reasons, ['audio_content_review_required']);
  const content = q.checks.find(c => c.id === 'audio_content');
  assert.equal(content.status, 'not_measured');
  assert.match(content.message, /목소리.*웅얼거림.*음악/);
  assert.match(content.message, /직접 들어/);
});
test('routine sampling cannot downgrade mandatory audio content review', () => {
  const q = evaluatePreviewQuality(input({ approvals, sampleEvery: 1 }));
  assert.equal(q.reviewDecision, 'required');
  assert.deepEqual(q.reasons, ['audio_content_review_required']);
  assert.equal(sampleJob(regularJob), sampleJob(regularJob));
});
test('untrusted report assertions cannot pass the unmeasured audio content check', () => {
  const r = { ...report(), audioContent: { status: 'passed', noHumanNoise: true, reviewed: true } };
  const q = evaluatePreviewQuality(input({ approvals, report: r }));
  assert.equal(q.technicalStatus, 'passed');
  assert.equal(q.reviewDecision, 'required');
  assert.equal(q.checks.find(c => c.id === 'audio_content').status, 'not_measured');
  assert.ok(q.reasons.includes('audio_content_review_required'));
});
test('missing input leaves audio purity unmeasured and review required', () => {
  const q = evaluatePreviewQuality();
  assert.equal(q.technicalStatus, 'warning');
  assert.equal(q.reviewDecision, 'required');
  assert.equal(q.checks.find(c => c.id === 'audio_content').status, 'not_measured');
  assert.ok(q.reasons.includes('audio_content_review_required'));
});
test('rule/model changes or missing evidence invalidate approval coverage', () => {
  for (const extra of [
    { models: { ...models, video: 'new-model' } },
    { direction: { ...direction, version: 'new-v3' } },
    { approvals: approvals.map(a => ({ ...a, evidenceId: '' })) },
  ]) {
    const q = evaluatePreviewQuality(input({ approvals, ...extra }));
    assert.equal(q.reviewDecision, 'required');
    assert.ok(q.reasons.includes('unreviewed_profile_or_model'));
    assert.deepEqual(q.unreviewedProfiles, [...direction.profiles].sort());
  }
});
test('silence, wrong frame count, timing gaps and clipping are measured failures',()=>{for(const mutate of [r=>r.outputs[0].aacMetrics.silent100msWindows=1,r=>r.videoSeamMetrics.decodedFrames=241,r=>r.outputs[1].packetMetrics[1].maxTimestampGapSeconds=.05,r=>r.outputs[0].aacLoudness.truePeakDb=0]){const r=report();mutate(r);const q=evaluatePreviewQuality(input({approvals,report:r}));assert.equal(q.technicalStatus,'failed');assert.equal(q.reviewDecision,'required');}});
test('incomplete metrics and unknown motion evidence never silently pass',()=>{const q=evaluatePreviewQuality(input({approvals,report:{status:'complete'}}));assert.equal(q.technicalStatus,'warning');assert.equal(q.reviewDecision,'required');assert.ok(q.checks.some(c=>c.status==='not_measured'));});
test('seam outlier requests review rather than claiming motion realism failed',()=>{const r=report();r.videoSeamMetrics.wrapToInteriorP95Ratio=3;const q=evaluatePreviewQuality(input({approvals,report:r}));assert.equal(q.technicalStatus,'warning');assert.equal(q.reviewDecision,'required');});
