/* eslint-disable @typescript-eslint/no-require-imports -- Shared CommonJS candidate used by browser and worker tooling. */
'use strict';

// Candidate planning only. No provider calls, file access or production routing.
const { compileDirection } = require('./direction');
const INTRO_VERSION = 'healing-rain-intro-v1-candidate';
const INTRO_RECIPE_ID = 'cloud-bed-to-train';
const INTRO_SOURCE_SECONDS = 15;
const TRANSITION_SECONDS = 2.5;
const OUTPUT_SECONDS = Object.freeze([30, 180]);
const INTRO_CATALOG = Object.freeze([
  { sceneId: 'train', recipeId: INTRO_RECIPE_ID, status: 'candidate', concept: 'A resting woman on a cloud bed becomes the matching sleeper-train view.' },
  { sceneId: 'tent', recipeId: null, status: 'idea-only', concept: 'Soft cloud shelter resolves into a dry tent beside night rain.' },
  { sceneId: 'hanok', recipeId: null, status: 'idea-only', concept: 'Dim floating paper light leads into sheltered hanok eaves.' },
  { sceneId: 'cabin', recipeId: null, status: 'idea-only', concept: 'A warm resting nook resolves into the rainy forest cabin.' },
  { sceneId: 'night-nature', recipeId: null, status: 'idea-only', concept: 'Night mist reveals mossy canyon walls and a quiet stream.' },
  { sceneId: 'quiet-park', recipeId: null, status: 'idea-only', concept: 'A dim glow reveals the sheltered view of a quiet park.' },
  { sceneId: 'mountain-temple', recipeId: null, status: 'idea-only', concept: 'Soft mist reveals the fixed temple eaves and courtyard.' },
  { sceneId: 'pond', recipeId: null, status: 'idea-only', concept: 'Dark reflections resolve into small rings on a forest pond.' },
  { sceneId: 'lake', recipeId: null, status: 'idea-only', concept: 'Faint night mist reveals the matching still lake horizon.' },
  { sceneId: 'highland-village', recipeId: null, status: 'idea-only', concept: 'A distant warm glow resolves into a rainy highland village.' },
].map(item => Object.freeze(item)));

const clone = value => JSON.parse(JSON.stringify(value));
function fail(message) {
  const error = new Error(message);
  error.code = 'HEALING_RAIN_INTRO_INVALID';
  throw error;
}

function outputPlan(totalSeconds, fps) {
  const mainStartSeconds = INTRO_SOURCE_SECONDS - TRANSITION_SECONDS;
  const mainPlaybackSeconds = totalSeconds - mainStartSeconds;
  return {
    totalSeconds, totalFrames: totalSeconds * fps,
    intro: { sourceSeconds: INTRO_SOURCE_SECONDS, startSeconds: 0, endSeconds: INTRO_SOURCE_SECONDS, occurrences: 1, loop: false },
    transition: { startSeconds: mainStartSeconds, endSeconds: INTRO_SOURCE_SECONDS, seconds: TRANSITION_SECONDS, startFrame: mainStartSeconds * fps, frames: TRANSITION_SECONDS * fps },
    main: {
      startSeconds: mainStartSeconds, endSeconds: totalSeconds, sourceStartSeconds: 0,
      playbackSeconds: mainPlaybackSeconds, playbackFrames: mainPlaybackSeconds * fps,
      cycleSeconds: 10, repeatCount: Math.ceil(mainPlaybackSeconds / 10),
      trimAfterLoopAssembly: true, reversePlayback: false,
    },
    durationEquation: { introSeconds: INTRO_SOURCE_SECONDS, mainSeconds: mainPlaybackSeconds, overlapSeconds: TRANSITION_SECONDS, totalSeconds },
  };
}

/**
 * input is the original main recipe input, optionally extended with:
 * introRecipeId, referenceEyeState ('asleep' or 'awake'), outputSeconds ([30, 180]).
 * Reference-image attachment and media review remain required downstream steps.
 */
function buildIntroSpec(mainDirection, input) {
  // This checks both the stored main specification and exact original-input provenance.
  const compiled = compileDirection(mainDirection, input);
  if (mainDirection.sceneId !== 'train') fail('Only the train intro has a candidate implementation; other catalog entries are ideas.');
  const recipeId = input.introRecipeId === undefined ? INTRO_RECIPE_ID : input.introRecipeId;
  if (recipeId !== INTRO_RECIPE_ID) fail('Unsupported intro recipe.');
  const referenceEyeState = input.referenceEyeState === undefined ? 'asleep' : input.referenceEyeState;
  if (!['asleep', 'awake'].includes(referenceEyeState)) fail('Reference eye state must be asleep or awake.');
  const outputSeconds = input.outputSeconds === undefined ? [...OUTPUT_SECONDS] : input.outputSeconds;
  if (!Array.isArray(outputSeconds) || !outputSeconds.length || outputSeconds.length > OUTPUT_SECONDS.length || new Set(outputSeconds).size !== outputSeconds.length || outputSeconds.some(seconds => !OUTPUT_SECONDS.includes(seconds))) {
    fail('Outputs must be distinct supported total durations: 30 and/or 180 seconds, including the intro.');
  }

  const anchors = [
    'same camera angle, crop, perspective and apparent lens',
    'same adult woman identity, face profile, head and hand locations',
    'same reclining body pose, blanket silhouette, pillow and bed edges',
    'same bed location on the left and background opening on the right',
    'same low warm light direction, exposure and readable skin and bedding',
  ];
  const eyeImage = referenceEyeState === 'asleep'
    ? 'She is already asleep with closed eyes; preserve the reference pose and expression.'
    : 'She is already reclining comfortably, with softly open eyes; preserve her resting head and body pose.';
  const eyeVideo = referenceEyeState === 'asleep'
    ? 'Her eyes remain closed throughout; do not wake her or add an eye-opening action.'
    : 'From the already reclining pose, her eyelids gently close once during seconds 2-5; then remain closed. No head or body repositioning.';
  const imagePrompt = [
    'Photorealistic cinematic 16:9 fantasy cloud-bed source image, using the supplied main-body source image as the mandatory visual reference.',
    'Preserve the same adult woman, camera angle, crop, perspective, body pose, bed placement, pillow, bedding and warm light direction from that reference.',
    'Keep the bed and resting woman anchored on the left. Replace only the surrounding room and right-side background with soft layered clouds against a deep dark night sky.',
    'The familiar bed rests securely among clouds, not at a precipice. No upright sitting or standing.',
    eyeImage,
    'Low shielded warm light keeps her face and bedding readable. Quiet muted clouds, restrained highlights, no bright moon or blue twilight.',
    'No face redesign, altered anatomy, extra people, camera flythrough, text, logos or dramatic magical beams.',
  ].join(' ');
  const videoPrompt = [
    'One continuous 15-second shot animated from the cloud-bed reference image. Locked camera; keep the same adult woman, face, head, hands, reclining pose, bed, pillow and blanket silhouette fixed.',
    eyeVideo,
    'Only tiny blanket breathing around a 5-second cycle and extremely slow local cloud drift. Preserve the bed on the left, dark clouds and night background on the right, and low steady warm light. No global floating or swaying.',
    'Seconds 0-2: already resting in the established composition. Seconds 2-5: settle softly with no body movement. Seconds 5-12.5: calm breathing. Seconds 12.5-15: maintain stable anchors for a later 2.5-second dissolve into the matching rainy sleeper-train shot.',
    'The dissolve is added in editing: do not generate the train, a morph, a cut or a transition in this source. No face deformation, turning over, zoom, pan, flythrough, flashing, text or logos. Silent video; continuous rain audio is added separately from time zero.',
  ].join(' ');
  if (imagePrompt.length >= 1500 || videoPrompt.length >= 1500) fail('Intro prompts must be shorter than 1500 characters.');

  return {
    version: INTRO_VERSION, recipeId, status: 'candidate', productionEligible: false,
    provenance: { mainDirectionVersion: mainDirection.version, mainSceneId: mainDirection.sceneId, mainInput: clone(mainDirection.sourceInput) },
    introRecipe: {
      id: recipeId, version: INTRO_VERSION, sourceSeconds: INTRO_SOURCE_SECONDS, occurrences: 1,
      loop: false, reversePlayback: false, referenceEyeState, imagePrompt, videoPrompt,
      referenceContract: {
        role: 'main-body-source-image', required: true, generationBlockedWithoutReference: true,
        sameReferenceAsMain: true, preserve: [...anchors],
        eyeStateRule: 'Use asleep unless the actual reference clearly shows open eyes. Never force a sleeping reference to wake.',
      },
      shots: [
        { startSeconds: 0, endSeconds: 2, action: 'Already reclining; establish the matched cloud-bed composition.' },
        { startSeconds: 2, endSeconds: 5, action: referenceEyeState === 'asleep' ? 'Keep closed eyes and natural tiny breathing.' : 'Close eyelids gently once, without repositioning head or body.' },
        { startSeconds: 5, endSeconds: 12.5, action: 'Rest with tiny blanket breathing and slow local cloud drift.' },
        { startSeconds: 12.5, endSeconds: 15, action: 'Keep fixed anchors; editor dissolves to the main shot over these final 2.5 seconds.' },
      ],
    },
    transitionContract: {
      version: 'healing-rain-intro-transition-v1', method: 'postproduction-dissolve',
      startSeconds: 12.5, endSeconds: 15, durationSeconds: TRANSITION_SECONDS,
      mainSourceStartSeconds: 0, generatedMorph: false, fixedAnchors: [...anchors],
      mainMotion: 'Main exterior continues RIGHT TO LEFT at the existing train recipe speed throughout the dissolve and all later cycles.',
      acceptance: 'Review aligned face, pillow, blanket and bed edges at the transition. Reject double faces, visible pose shifts or ghosted anchors; prompt compliance is not proof of a visual match.',
    },
    mainRecipe: {
      sceneId: mainDirection.sceneId, sourceDirectionVersion: mainDirection.version,
      direction: clone(mainDirection), imagePrompt: compiled.image, videoPrompt: compiled.video,
      loop: clone(mainDirection.loop), render: clone(compiled.render),
      introIncludedInLoop: false,
    },
    audio: {
      source: 'same-continuous-rain-bed-as-main', startSeconds: 0, continuousThroughTransition: true,
      restartAtTransition: false, introGeneratedAudio: false, silentGapSeconds: 0,
      fadeIn: { startSeconds: 0, endSeconds: 1.5, curve: 'gentle' },
      levelRamp: { startSeconds: 0, endSeconds: 15, startGainDb: -6, endGainDb: 0, curve: 'smooth' },
      silenceAfterOnsetAllowed: false, abruptLevelStepAllowed: false,
      checks: ['Rain starts at timeline zero with a gentle onset; no delayed track or silent gap.', 'No restart, level jump, clipping or loud effect at the visual transition.'],
    },
    outputs: outputSeconds.map(seconds => outputPlan(seconds, mainDirection.loop.fps)),
    qa: {
      status: 'unreviewed', mediaReviewRequired: true, productionReady: false,
      automaticChecksGuaranteeNaturalness: false, representativePassCoversOtherScenes: false,
      checks: ['Reference identity, pose and framing match.', 'Breathing is subtle; eyelids follow the actual reference state.', 'Cloud drift and low warm lighting remain calm and stable.', 'No face morph or doubled anchors across the dissolve.', 'Intro appears exactly once; final durations include it.', 'Main rain and train motion continue forward across every loop seam.', 'Rain audio starts at zero and remains continuous through the transition.'].map(criteria => ({ status: 'unreviewed', criteria })),
    },
  };
}

module.exports = { INTRO_VERSION, INTRO_RECIPE_ID, INTRO_CATALOG, OUTPUT_SECONDS, buildIntroSpec };
