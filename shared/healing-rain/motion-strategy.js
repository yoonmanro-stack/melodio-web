'use strict';

// Candidate adapter only: no provider calls or changes to the approved v2 compiler.
const { compileDirection } = require('./direction');
const MOTION_STRATEGY_VERSION = 'healing-rain-motion-v3-candidate';
const VIDEO_INPUT_KEYS = ['prompt', 'sound', 'duration', 'aspect_ratio', 'mode', 'multi_shots'];
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);

function candidateError(message) {
  const error = new Error(message);
  error.code = 'HEALING_RAIN_MOTION_CANDIDATE_INVALID';
  throw error;
}

function buildMotionCandidate(direction, input) {
  // Includes validateDirection and exact saved-input provenance validation.
  const compiled = compileDirection(direction, input);
  const isTrain = direction.sceneId === 'train';
  const motion = direction.motion.filter(item => item.type !== 'background-translation');
  const prompt = [
    isTrain
      ? 'The train is already traveling and keeps a brisk constant speed for the full 11 seconds. Outside the side window, near foliage sweeps RIGHT TO LEFT across the window in about 1–2s; distant landscape moves the same way more slowly, with clear depth parallax. Travel continues without slowing, stopping or reversing.'
      : 'Animate the following natural motion continuously throughout this 11-second shot:',
    ...motion.map(item => item.instruction),
    isTrain
      ? 'Camera is attached to the carriage: window frame, bed and furniture keep their positions in the image while the exterior passes by.'
      : 'Camera remains locked to the source photograph; preserve its composition and structural geometry.',
    direction.fixed.subject ? '' : 'Keep the scene unoccupied; do not add people or breathing.',
    'Preserve the source photograph’s lighting. ' + direction.lighting.instruction,
    'No cuts, zoom, morphing, lightning, text or logos.',
  ].filter(Boolean).join(' ');
  if (prompt.length > 1500) candidateError('Candidate video prompt exceeds 1500 characters.');
  return {
    video: {
      model: 'kling-3.0/video',
      conditioning: 'start-frame-only',
      strategyVersion: MOTION_STRATEGY_VERSION,
      input: { prompt, sound: false, duration: '11', aspect_ratio: '16:9', mode: 'std', multi_shots: false },
    },
    strategy: {
      version: MOTION_STRATEGY_VERSION,
      status: 'candidate',
      sceneId: direction.sceneId,
      sourceDirectionVersion: direction.version,
      sourceInput: { ...direction.sourceInput },
      sourceMotionIds: direction.motion.map(item => item.id),
      dominantMotion: isTrain ? 'continuous-exterior-translation' : 'scene-natural-motion',
      conditioning: 'start-frame-only',
      generatedEndpointMatch: false,
      breathingPhaseMatch: false,
      loopAssembly: 'postproduction-crossfade',
    },
    render: { ...compiled.render },
    qa: {
      status: 'review-required',
      naturalness: 'review-required',
      automaticChecksGuaranteeNaturalness: false,
      representativePassCoversOtherScenes: false,
      checks: [
        { id: 'continuous-motion', status: 'review-required', criteria: isTrain ? 'Verify uninterrupted right-to-left exterior travel, near foliage crossing in about 1–2s and slower distant scenery; speed is a descriptive target.' : 'Review the scene-specific rain, water and other motion for continuity and naturalness.' },
        { id: 'camera-geometry', status: 'review-required', criteria: isTrain ? 'Carriage and camera remain stable while the exterior moves.' : 'Camera, architecture and landscape anchors remain stable.' },
        { id: 'lighting', status: 'review-required', criteria: 'Compare to the source photograph; verify steady exposure, practical lights and deep-night exterior.' },
        ...(direction.fixed.subject ? [{ id: 'blanket-breathing', status: 'review-required', criteria: 'Tiny blanket rise and fall around a 5-second cycle; stable face, head and hands.' }] : []),
        { id: 'postproduction-loop', status: 'review-required', criteria: 'Review the 1-second crossfade of the 11-second source into a 10-second cycle for ghosting and discontinuities.' },
        { id: 'naturalness', status: 'review-required', criteria: 'Human visual review is required; passing specifications or technical checks is not approval.' },
      ],
    },
  };
}

function materializeVideoInput(video, imageUrl) {
  if (!record(video) || video.strategyVersion !== MOTION_STRATEGY_VERSION || video.conditioning !== 'start-frame-only' || video.model !== 'kling-3.0/video' || !record(video.input)) {
    candidateError('Only an explicit v3 candidate with start-frame-only conditioning can be materialized.');
  }
  const input = video.input;
  if (Object.keys(input).length !== VIDEO_INPUT_KEYS.length || VIDEO_INPUT_KEYS.some(key => !Object.prototype.hasOwnProperty.call(input, key)) || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 1500 || input.sound !== false || input.duration !== '11' || input.aspect_ratio !== '16:9' || input.mode !== 'std' || input.multi_shots !== false) {
    candidateError('Candidate provider input must match the supported video contract and contain no image endpoints.');
  }
  if (typeof imageUrl !== 'string' || imageUrl !== imageUrl.trim()) candidateError('Provide exactly one HTTP(S) source image URL.');
  let url;
  try { url = new URL(imageUrl); } catch { candidateError('Provide exactly one HTTP(S) source image URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || /\s/.test(imageUrl)) candidateError('Provide exactly one HTTP(S) source image URL.');
  return { ...input, image_urls: [imageUrl] };
}

module.exports = { MOTION_STRATEGY_VERSION, buildMotionCandidate, materializeVideoInput };
