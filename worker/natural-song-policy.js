/** Ordinary studio songs keep their complete provider output at its natural length. */
const { fitSunoStylePrompt } = require('./suno-provider');
const { resolveNaturalSongPreference } = require('./natural-song-preferences');
const NATURAL_SONG_MIN_SECONDS = 120;
const NATURAL_SONG_PREFERRED_MIN_SECONDS = 160;
const NATURAL_SONG_PREFERRED_MAX_SECONDS = 240;
const NATURAL_SONG_COMPACT_ARRANGEMENT = 'Follow the supplied complete song structure, allow the final musical phrase to resolve naturally, no abrupt cutoff';
const DEDICATED_DURATION_MENUS = new Set(['viral', 'viral-cf', 'short-form', 'voice-discovery-design', 'voice-discovery-sample', 'voice-preview', 'voice-sample', 'mugsound-supply']);
const NATURAL_INSTRUMENTAL_STRUCTURE = `[Complete Instrumental]
[Instrumental Intro]
[Main Theme]
[Instrumental Development]
[Main Theme Variation]
[Instrumental Bridge]
[Final Main Theme]
[Outro and Natural Ending]`;

function isNaturalFullSong(metadata) {
  const meta = metadata || {};
  const menu = String(meta.sourceMenu || '').trim().toLowerCase();
  if (DEDICATED_DURATION_MENUS.has(menu) || meta.isViral === true || meta.isViralTrack === true
      || meta.requestedDurationSource === 'short-form-request'
      || meta.petEpisode?.version === 'pet-v3' || meta.petEpisode?.version === 'pet-v4'
      || meta.storyPlan?.version === 'story-v4') return false;
  // Preset lengths describe a recipe, not a user request to cut an ordinary song.
  // This check intentionally precedes any legacy durationSeconds <= 60 heuristic.
  return true;
}

/** Preserve lyric lines and tempo while removing inherited clock directions. */
function removeClockDurationInstructions(prompt) {
  return String(prompt || '')
    .replace(/\[\s*(?:target\s+duration|duration|fade\s*out\s*(?:at|by))\s*:?\s*\d+(?::\d{2}|\s*(?:seconds?|secs?|minutes?|mins?|s\b|m\b))[^\]\n]*\]/gi, '')
    .replace(/\b(?:target\s+duration|total\s+duration|duration|song\s+length)\s*:?\s*\d+(?::\d{2}|\s*(?:seconds?|secs?|minutes?|mins?))(?:\s*\(\d+:\d{2}\))?/gi, '')
    .replace(/\b(?:fade\s*out|finish|end|stop|cut\s*off)\s+(?:at|by|after)\s+\d+(?::\d{2}|\s*(?:seconds?|secs?|minutes?|mins?))/gi, '')
    .replace(/(?:목표\s*(?:길이|시간)|곡\s*길이|페이드\s*아웃)\s*:?\s*\d+(?:\s*분\s*\d*\s*초?|\s*초|:\d{2})/g, '')
    .replace(/[,;]\s*[,;]+/g, ',')
    .replace(/[ \t]+/g, ' ')
    .replace(/^[\s,;]+|[\s,;]+$/g, '');
}

function positiveSeconds(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Musical structure guidance only: no clock direction or duration parameter. */
function compactNaturalSongStyle(prompt) {
  const style = removeClockDurationInstructions(prompt);
  if (style.includes(NATURAL_SONG_COMPACT_ARRANGEMENT)) return fitSunoStylePrompt(style);
  return fitSunoStylePrompt([NATURAL_SONG_COMPACT_ARRANGEMENT, style].filter(Boolean).join(', '));
}

function candidateAudit(scanned, index, preference) {
  // Only decoded PCM duration proves the length of the archived audio. Provider
  // metadata can describe a longer planned clip even when the file ends early.
  const durationSeconds = positiveSeconds(scanned?.quality?.durationSeconds);
  const reasons = [];
  if (durationSeconds === null) reasons.push('duration_unavailable');
  else if (durationSeconds < NATURAL_SONG_MIN_SECONDS) reasons.push('duration_too_short');
  const grade = String(scanned?.quality?.grade || 'F').toUpperCase();
  const inPreferredRange = durationSeconds !== null
    && durationSeconds >= preference.minimum
    && durationSeconds <= preference.maximum;
  return { index, durationSeconds, grade, durationQualified: reasons.length === 0,
    qualityUsable: grade === 'A' || grade === 'B', inPreferredRange, reasons };
}

function qualityNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.POSITIVE_INFINITY;
}

/** Soft range preference among usable originals; no clipping, cap, or resubmission. */
function evaluateNaturalSongCandidates(metadata, scannedClips) {
  if (!isNaturalFullSong(metadata)) return { applies: false, status: 'dedicated', candidates: scannedClips };
  const source = Array.isArray(scannedClips) ? scannedClips : [];
  const preference = resolveNaturalSongPreference(metadata);
  const audits = source.map((candidate, index) => candidateAudit(candidate, index, preference));
  const gradePriority = { A: 3, B: 2, F: 1 };
  const qualified = audits.filter(candidate => candidate.durationQualified).sort((left, right) => {
    // A clean extended original is preferable to a failed-quality short original.
    const qualityUsableGap = Number(right.qualityUsable) - Number(left.qualityUsable);
    if (qualityUsableGap !== 0) return qualityUsableGap;
    const preferredGap = Number(right.inPreferredRange) - Number(left.inPreferredRange);
    if (preferredGap !== 0) return preferredGap;
    const gradeGap = (gradePriority[right.grade] || 0) - (gradePriority[left.grade] || 0);
    if (gradeGap !== 0) return gradeGap;
    const clippingGap = qualityNumber(source[left.index]?.quality?.clippingPerMinute)
      - qualityNumber(source[right.index]?.quality?.clippingPerMinute);
    if (clippingGap !== 0 && !Number.isNaN(clippingGap)) return clippingGap;
    const dissonanceGap = qualityNumber(source[left.index]?.quality?.dissonanceScore)
      - qualityNumber(source[right.index]?.quality?.dissonanceScore);
    if (dissonanceGap !== 0 && !Number.isNaN(dissonanceGap)) return dissonanceGap;
    // The trusted performance preset's approximate length never overrides quality.
    if (preference.target !== undefined) {
      const targetGap = Math.abs(left.durationSeconds - preference.target)
        - Math.abs(right.durationSeconds - preference.target);
      if (targetGap !== 0) return targetGap;
    }
    return left.index - right.index;
  });
  const status = qualified.length ? 'selected' : 'failed';
  return {
    applies: true,
    status,
    candidates: qualified.map(candidate => source[candidate.index]),
    audit: {
      schemaVersion: 2,
      policy: 'natural-full-song',
      status,
      acceptedSeconds: { minimum: NATURAL_SONG_MIN_SECONDS, maximum: null },
      preferredSeconds: preference,
      selectionOrder: preference.target === undefined
        ? 'usable_quality_then_preferred_range_then_quality'
        : 'usable_quality_then_preferred_range_then_quality_then_target_distance',
      candidateOrder: qualified.map(candidate => candidate.index),
      automaticDurationRegeneration: false,
      trimOriginals: false,
      ...(qualified[0] ? { selectedCandidateIndex: qualified[0].index,
        selectedInPreferredRange: qualified[0].inPreferredRange }
        : { failureReason: 'no_duration_qualified_original_candidate' }),
      candidates: audits,
    },
  };
}

/** Each persisted track describes its own complete audio, including the alternate. */
function naturalSongCandidateMetadata(decision, candidate, evaluatedAt) {
  if (!decision?.applies || decision.status !== 'selected') return {};
  const rank = decision.candidates.indexOf(candidate);
  if (rank < 0) throw new Error('natural_song_candidate_not_selected');
  const candidateIndex = decision.audit.candidateOrder[rank];
  const audit = decision.audit.candidates.find(item => item.index === candidateIndex);
  const formatSeconds = seconds => `${Math.floor(seconds / 60)}분${seconds % 60 ? ` ${seconds % 60}초` : ''}`;
  const preferredRange = `${formatSeconds(decision.audit.preferredSeconds.minimum)}~${formatSeconds(decision.audit.preferredSeconds.maximum)}`;
  return {
    naturalSongPolicy: { ...decision.audit, selectedCandidateIndex: candidateIndex,
      selectedInPreferredRange: audit.inPreferredRange, selectionRole: rank === 0 ? 'primary' : 'alternate',
      ...(evaluatedAt ? { evaluatedAt } : {}) },
    durationOutcome: audit.inPreferredRange
      ? 'natural_full_song_preferred_original_selected' : 'natural_full_song_outside_preferred_original_selected',
    durationWarning: audit.inPreferredRange ? null
      : `선호 길이(${preferredRange})를 벗어난 원본 ${Math.round(audit.durationSeconds)}초 — 곡 전체를 보존했습니다.`,
  };
}

module.exports = { NATURAL_SONG_MIN_SECONDS, NATURAL_SONG_PREFERRED_MIN_SECONDS,
  NATURAL_SONG_PREFERRED_MAX_SECONDS, NATURAL_SONG_COMPACT_ARRANGEMENT, NATURAL_INSTRUMENTAL_STRUCTURE,
  isNaturalFullSong, removeClockDurationInstructions, compactNaturalSongStyle,
  evaluateNaturalSongCandidates, naturalSongCandidateMetadata };
