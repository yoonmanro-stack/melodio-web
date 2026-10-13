'use strict';

// Apply to every new production. A recipe can be reused, its completed audio cannot.
// Resuming or editing the SAME production preserves already paid original takes.
const RAIN_AUDIO_POLICY_VERSION = 'healing-rain-fresh-audio-v1';
const RAIN_AUDIO_POLICY = Object.freeze({
  version: RAIN_AUDIO_POLICY_VERSION,
  source: 'generate-per-production',
  secondsPerTake: 30,
  reuseAcrossProductions: false,
  reuseByPrompt: false,
  fallbackToExistingAudio: false,
  sameProductionEditing: true,
  sameProductionResume: true,
  loopingWithinProduction: true,
});

module.exports = { RAIN_AUDIO_POLICY_VERSION, RAIN_AUDIO_POLICY };
