import type { PetEpisode } from '../vle/petEpisode';
import type { AudioRhythmAnalysis } from './audioRhythm';

export interface PetAudioAlignment {
  version: 'pet-audio-action-alignment-v1';
  status: 'planned' | 'measured' | 'fallback';
  appliedToMotionPrompts: boolean;
  audioDurationSeconds?: number;
  confidence?: number;
  reason?: string;
  fixedClipSeamSeconds: 15;
  endingHoldSeconds: 2;
  actionStarts: Array<{
    shotId: string;
    plannedSeconds: number;
    seconds: number;
    source: 'planned' | 'measured-onset' | 'ending-safe-fallback';
  }>;
}

const MIN_SCENE_SECONDS = 3;
const MAX_ONSET_SHIFT_SECONDS = 0.65;
const MIN_CONFIDENCE = 0.42;
const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** A production intention, never proof that generated movement landed on a beat. */
export function plannedPetAudioAlignment(episode: PetEpisode): PetAudioAlignment {
  return {
    version: 'pet-audio-action-alignment-v1', status: 'planned', appliedToMotionPrompts: false,
    fixedClipSeamSeconds: 15, endingHoldSeconds: 2,
    actionStarts: episode.shots.map(shot => ({ shotId: shot.id, plannedSeconds: shot.startSeconds, seconds: shot.startSeconds, source: 'planned' })),
  };
}

export function fallbackPetAudioAlignment(episode: PetEpisode, durationSeconds: number, reason: string, confidence?: number): PetAudioAlignment {
  return { ...plannedPetAudioAlignment(episode), status: 'fallback', audioDurationSeconds: durationSeconds, confidence, reason };
}

/** Use observed periodic energy events only. No inferred grid, word timing or playback retiming. */
export function measurePetAudioAlignment(episode: PetEpisode, durationSeconds: number, rhythm?: AudioRhythmAnalysis): PetAudioAlignment {
  if (!rhythm || rhythm.method !== 'energy-autocorrelation' || !Number.isFinite(rhythm.confidence)
    || rhythm.confidence < MIN_CONFIDENCE || !Number.isFinite(rhythm.bpm) || rhythm.bpm! < 60 || rhythm.bpm! > 200
    || rhythm.ending.status === 'review') {
    return fallbackPetAudioAlignment(episode, durationSeconds, rhythm?.fallbackReason || 'rhythm-not-reliable', rhythm?.confidence);
  }
  // beatSeconds must be a subset of actually detected onsets. Filter malformed,
  // duplicate and terminal events without extrapolating from the reported BPM.
  const onsets = new Set(rhythm.onsetSeconds.filter(value => Number.isFinite(value)).map(round));
  const events = [...new Set(rhythm.beatSeconds.filter(value => Number.isFinite(value) && value > 0
    && value <= durationSeconds - 2 && onsets.has(round(value))).map(round))].sort((a, b) => a - b);
  if (events.length < 4) return fallbackPetAudioAlignment(episode, durationSeconds, 'insufficient-observed-beats', rhythm.confidence);
  const alignment = { ...plannedPetAudioAlignment(episode), audioDurationSeconds: durationSeconds, confidence: rhythm.confidence };
  // Moving a final reaction by at most three seconds leaves its cause readable.
  // A shorter recording cannot justify rushing the source story to its ending.
  const endingTarget = durationSeconds >= 25 ? Math.min(26, durationSeconds - 2) : 26;
  const targets = alignment.actionStarts.map((action, index) => index === 5 ? endingTarget : action.plannedSeconds);
  for (let index = 1; index < alignment.actionStarts.length; index++) {
    const action = alignment.actionStarts[index];
    const target = targets[index];
    const lower = Math.max(target - MAX_ONSET_SHIFT_SECONDS, alignment.actionStarts[index - 1].seconds + MIN_SCENE_SECONDS);
    const upper = Math.min(target + MAX_ONSET_SHIFT_SECONDS,
      index === 5 ? Math.min(27, durationSeconds - 2) : targets[index + 1] - MIN_SCENE_SECONDS,
      // S4 still straddles the fixed seam with enough lead-in to begin visibly.
      index === 3 ? 14.25 : 30);
    const nearest = events.filter(value => value >= lower && value <= upper)
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
    if (nearest !== undefined) {
      action.seconds = nearest; action.source = 'measured-onset';
    } else if (index === 5 && endingTarget !== action.plannedSeconds && endingTarget >= lower && endingTarget <= upper) {
      action.seconds = round(endingTarget); action.source = 'ending-safe-fallback';
    }
  }
  if (alignment.actionStarts.filter(action => action.source === 'measured-onset').length < 2) {
    return fallbackPetAudioAlignment(episode, durationSeconds, 'no-safe-action-onset-match', rhythm.confidence);
  }
  return { ...alignment, status: 'measured', appliedToMotionPrompts: true,
    reason: durationSeconds < 25 ? 'partial-alignment-source-ending-preserved' : 'observed-energy-events-not-verified-motion-sync' };
}
