'use strict';

const LOOP_VERSION = 'sleeper-train-forward-v1';

function buildGenerationSpec(plan, jobId) {
  if (plan?.input?.sceneId !== 'train' || plan.input.thunder !== 'none' || plan.input.takes !== 6) {
    throw new Error('This preview supports the sleeper train, no thunder, and six rain takes.');
  }
  const image = `${plan.prompts.image} Photograph a new original compartment. Composition for a looping film: the sheltered bed and cabin occupy the left third; the large side window fills most of the right two thirds. Keep the window frame and all furniture rigid and clearly defined. One sleeping adult is mostly hidden by the blanket, with the face small and turned away. Rain beyond the glass must remain visible in the dark. Outside: anonymous dark forest textures with sparse diffuse distant amber lights, no identifiable landmark, stations, poles, signs, tunnels, or approaching headlights. No bright sky. No hanging rigid water strands. No steam. Soft documentary realism, no illustration. Unique scene variation ${jobId.slice(0, 8)}.`;
  const rainMotion = { gentle: 'Soft sparse rainfall', moderate: 'Moderate steady rainfall', heavy: 'Heavy sustained rain', downpour: 'Heavy downpour' }[plan.input.intensity] || 'Heavy downpour';
  const video = 'An 11-second photorealistic sleeper-train shot after bedtime. Locked tripod camera inside the moving carriage. Preserve the source composition: bed and dim amber nightlight on the left, large rainy side window on the right. The sleeping adult, blanket, furniture and window frame remain still and unchanged. Outside, anonymous dark forest passes continuously RIGHT TO LEFT at a steady speed, including the first and last moments. Nearby foliage moves faster than the few faint distant lights. Heavy downpour is visible beyond the glass; irregular droplets merge and flow diagonally down the glass. Maintain the same rain density and very dark exposure throughout. Tiny local wet reflections may vary naturally. Keep continuous forward motion through the ending; the end image guides composition only. No reversed movement, slowing, stop, camera movement, scene cuts, new landmarks, stations, tunnels, passing headlights, lightning, rigid icicle-like water strands, changing face, body movement, exposure pumping, text, or logos. The last and first frames should match in fixed architecture and illumination for a seamless forward loop.'.replace('Heavy downpour', rainMotion);
  const variations = [
    'Near glass: dense irregular fine impacts, broad rain behind.',
    'Mid-distance: full rushing rainfall, softer glass detail.',
    'Near glass: slightly heavier scattered drops amid steady rain.',
    'Wide ambience: smooth downpour wash, natural uneven patter.',
    'Window edges: diffuse splashes, very soft low carriage rumble.',
    'Balanced ambience: broad rain and tiny irregular glass taps.',
  ];
  const audio = variations.map(direction => {
    const text = `${plan.prompts.audio} ${direction}`;
    if (text.length > 450) throw new Error('Rain prompt exceeds the provider-safe limit.');
    return text;
  });
  return {
    version: LOOP_VERSION,
    image: { model: 'nano-banana-pro', input: { prompt: image, image_input: [], aspect_ratio: '16:9', resolution: '2K', output_format: 'png' } },
    video: { model: 'kling-3.0/video', input: { prompt: video, sound: false, duration: '11', aspect_ratio: '16:9', mode: 'std', multi_shots: false } },
    audio, render: { seconds: 180, previewSeconds: 30, targetVideoCycleSeconds: 10, videoCrossfadeSeconds: 1, audioCrossfadeSeconds: 2, fps: 24, maxWidth: 1920 },
    review: { status: 'pending', effectiveVideoLoopSeconds: 10, sourceVideoSeconds: 11, audioTakes: 6, audioSecondsEach: 30, noReversePlayback: true },
  };
}

module.exports = { buildGenerationSpec, LOOP_VERSION };
