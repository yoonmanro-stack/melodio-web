'use strict';

// Saved v1 plans must retain the precise prompts used by the original worker.
const legacy = require('./healing-rain-plan-v1');
const { compileDirection, DIRECTION_VERSION } = require('../shared/healing-rain/direction.js');

function invalid(message, code = 'generation_plan_invalid') {
  return Object.assign(new Error(message), { code });
}

function buildGenerationSpec(plan, jobId) {
  if (!plan || !Object.hasOwn(plan, 'direction')) return legacy.buildGenerationSpec(plan, jobId);
  if (plan.direction?.version !== DIRECTION_VERSION) throw invalid('Unsupported saved direction version.', 'direction_version_unsupported');
  if (plan.schemaVersion !== 1 || plan.recipeVersion !== 1) throw invalid('Unsupported saved plan version.');
  if (plan.input?.sceneId !== 'train' || plan.input.thunder !== 'none' || plan.input.takes !== 6) {
    throw invalid('This preview supports the sleeper train, no thunder, and six rain takes.');
  }
  const compiled = compileDirection(plan.direction, plan.input);
  if (plan.prompts?.image !== compiled.image || plan.prompts?.video !== compiled.video) {
    throw invalid('Saved prompts differ from their canonical direction.', 'direction_prompt_mismatch');
  }
  const render = compiled.render;
  if (plan.generation?.videoSeconds !== render.targetVideoCycleSeconds || plan.generation.sourceVideoSeconds !== render.sourceVideoSeconds || plan.generation.videoCrossfadeSeconds !== render.videoCrossfadeSeconds || plan.generation.audioSeconds !== 30 || plan.generation.audioTakes !== plan.input.takes
    || render.sourceVideoSeconds !== render.targetVideoCycleSeconds + render.videoCrossfadeSeconds) {
    throw invalid('Saved generation duration differs from its direction.', 'direction_duration_mismatch');
  }
  // Audio variation is unchanged; v2 image/video instructions come only from the
  // shared compiler, with no job-id variation or separate worker direction.
  const audio = legacy.buildGenerationSpec(plan, jobId).audio;
  return {
    version: DIRECTION_VERSION,
    image: { model: 'nano-banana-pro', input: { prompt: compiled.image, image_input: [], aspect_ratio: '16:9', resolution: '2K', output_format: 'png' } },
    video: { model: 'kling-3.0/video', input: { prompt: compiled.video, sound: false, duration: String(render.sourceVideoSeconds), aspect_ratio: '16:9', mode: 'std', multi_shots: false } },
    audio, render,
    checks: compiled.checks,
    summary: compiled.summary,
    review: { status: 'pending', ruleVersion: DIRECTION_VERSION, effectiveVideoLoopSeconds: render.targetVideoCycleSeconds,
      sourceVideoSeconds: render.sourceVideoSeconds, audioTakes: audio.length, audioSecondsEach: 30, noReversePlayback: true },
  };
}

module.exports = { buildGenerationSpec, LOOP_VERSION: legacy.LOOP_VERSION, DIRECTION_VERSION };
