export const RAIN_AUDIO_POLICY_VERSION: 'healing-rain-fresh-audio-v1';
export type RainAudioPolicy = Readonly<{
  version: typeof RAIN_AUDIO_POLICY_VERSION;
  source: 'generate-per-production';
  secondsPerTake: 30;
  reuseAcrossProductions: false;
  reuseByPrompt: false;
  fallbackToExistingAudio: false;
  sameProductionEditing: true;
  sameProductionResume: true;
  loopingWithinProduction: true;
}>;
export const RAIN_AUDIO_POLICY: RainAudioPolicy;
