'use strict';

const QUALITY_VERSION = 'healing-rain-quality-v2';
const MODEL_KEYS = ['image', 'video', 'audio'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const close = (a, b, tolerance = 0.002) => finite(a) && Math.abs(a - b) <= tolerance;
const modelMatch = (a, b) => MODEL_KEYS.every(key => typeof a?.[key] === 'string' && a[key] === b?.[key]);

/** Deterministic review sampling; metadata only, no provider/network access. */
function sampleJob(jobId, every = 10) {
  if (typeof jobId !== 'string' || !jobId || !Number.isInteger(every) || every < 1) return true;
  let hash = 2166136261;
  for (let i = 0; i < jobId.length; i++) hash = Math.imul(hash ^ jobId.charCodeAt(i), 16777619) >>> 0;
  return hash % every === 0;
}

/** Approvals must be trusted operator records, never data submitted by the browser. */
function evaluatePreviewQuality({ direction, report, jobId, models, approvals = [], sampleEvery = 10 } = {}) {
  const checks = [];
  const add = (id, status, message) => checks.push({ id, status, message });
  const test = (id, known, passed, message) => add(id, !known ? 'not_measured' : passed ? 'passed' : 'failed', message);
  const profiles = [...new Set(Array.isArray(direction?.profiles) ? direction.profiles.filter(x => typeof x === 'string' && x.length < 100) : [])].sort();
  const directionVersion = typeof direction?.version === 'string' ? direction.version : 'unknown';
  const loop = direction?.loop;
  test('render_completed', typeof report?.status === 'string', report?.status === 'complete', '미리보기 편집 완료 상태');
  test('loop_duration', finite(report?.effectiveVideoCycleSeconds) && finite(loop?.cycleSeconds), close(report?.effectiveVideoCycleSeconds, loop?.cycleSeconds), '설계한 영상 반복 길이');
  test('loop_frames', finite(report?.videoSeamMetrics?.decodedFrames) && finite(loop?.fps) && finite(loop?.cycleSeconds), report?.videoSeamMetrics?.decodedFrames === loop?.fps * loop?.cycleSeconds, '반복 영상의 실제 프레임 수');
  const outputs = Array.isArray(report?.outputs) ? report.outputs : [];
  for (const seconds of [30, 180]) {
    const output = outputs.find(x => x?.seconds === seconds);
    const prefix = `preview_${seconds}`;
    test(`${prefix}_duration`, finite(output?.media?.duration), close(output?.media?.duration, seconds), `${seconds}초 영상의 실제 길이`);
    test(`${prefix}_cycle`, typeof output?.videoEndpointClosesCycle === 'boolean', output?.videoEndpointClosesCycle === true, `${seconds}초 영상 끝의 반복 주기 일치`);
    test(`${prefix}_silence`, finite(output?.aacMetrics?.silent100msWindows) && finite(output?.aacMetrics?.decodedSeconds), output?.aacMetrics?.silent100msWindows === 0 && close(output?.aacMetrics?.decodedSeconds, seconds, 0.024), `${seconds}초 빗소리의 무음 구간`);
    test(`${prefix}_peak`, finite(output?.aacLoudness?.truePeakDb), output?.aacLoudness?.truePeakDb <= -1, `${seconds}초 음원 피크의 여유`);
    test(`${prefix}_size`, finite(output?.bytes), output?.bytes > 0 && output?.bytes < 45 * 1024 ** 2, `${seconds}초 미리보기 저장 용량`);
    const packets = output?.packetMetrics;
    const packetKnown = packets && ['0', '1'].every(key => finite(packets[key]?.packets) && packets[key].packets > 0 && finite(packets[key]?.nonMonotonicDts) && finite(packets[key]?.maxTimestampGapSeconds));
    test(`${prefix}_continuity`, Boolean(packetKnown), packetKnown && ['0', '1'].every(key => packets[key].nonMonotonicDts === 0 && packets[key].maxTimestampGapSeconds <= 0.0001), `${seconds}초 영상·음원 타임스탬프 연결`);
  }
  const seam = report?.videoSeamMetrics?.wrapToInteriorP95Ratio;
  add('seam_difference', !finite(seam) ? 'not_measured' : seam > 2 ? 'warning' : 'passed', '반복 경계의 프레임 차이 선별 검사');
  const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
  if (warnings.length) add('renderer_warning', 'warning', `편집 검사 경고 ${warnings.length}건`);
  // These are deliberately not reported as measured by grayscale seam checks.
  add('scene_realism', 'not_measured', '속도감·실내외 밝기·인물 안정성은 대표 검수 기록과 표본으로 확인');
  const technicalChecks = checks.filter(x => x.id !== 'scene_realism');
  const technicalStatus = technicalChecks.some(x => x.status === 'failed') ? 'failed' : technicalChecks.some(x => x.status !== 'passed') ? 'warning' : 'passed';
  const records = Array.isArray(approvals) ? approvals.slice(0, 500) : [];
  const unreviewed = profiles.filter(profile => !records.some(a => a?.profile === profile && a.directionVersion === directionVersion && a.verdict === 'approved' && typeof a.reviewedAt === 'string' && Number.isFinite(Date.parse(a.reviewedAt)) && typeof a.evidenceId === 'string' && a.evidenceId.length > 0 && modelMatch(a.models, models)));
  const reasons = [];
  if (technicalStatus !== 'passed') reasons.push('technical_check');
  if (!profiles.length || directionVersion === 'unknown') reasons.push('missing_direction');
  if (unreviewed.length) reasons.push('unreviewed_profile_or_model');
  const sample = sampleJob(jobId, sampleEvery);
  const reviewDecision = reasons.length ? 'required' : sample ? 'sample' : 'not_required';
  if (reviewDecision === 'sample') reasons.push('routine_sample');
  return { version: QUALITY_VERSION, directionVersion, technicalStatus, reviewDecision, reasons, profiles, unreviewedProfiles: unreviewed, checks };
}

module.exports = { QUALITY_VERSION, evaluatePreviewQuality, sampleJob };
