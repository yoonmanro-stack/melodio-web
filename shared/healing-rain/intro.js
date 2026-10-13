/* eslint-disable @typescript-eslint/no-require-imports -- Shared CommonJS candidate used by browser and worker tooling. */
'use strict';

// Candidate planning only. No provider calls, file access or production routing.
const { compileDirection } = require('./direction');
const INTRO_VERSION = 'healing-rain-intro-v1-candidate';
const INTRO_RECIPE_ID = 'cloud-bed-to-train';
const TEMPLE_INTRO_RECIPE_ID = 'cloud-temple-to-rain';
const CLOUD_REST_TEMPLE_INTRO_RECIPE_ID = 'cloud-rest-to-temple';
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
  { sceneId: 'mountain-temple', recipeId: TEMPLE_INTRO_RECIPE_ID, status: 'candidate', concept: 'A temple among dark clouds dissolves into the matching rainy mountain temple.' },
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
 * introRecipeId, referenceEyeState (train: 'asleep' or 'awake'; cloud rest: 'asleep'), outputSeconds ([30, 180]).
 * Reference-image attachment and media review remain required downstream steps.
 */
function buildIntroSpec(mainDirection, input) {
  // This checks both the stored main specification and exact original-input provenance.
  const compiled = compileDirection(mainDirection, input);
  if (mainDirection.sceneId === 'mountain-temple' && input.introRecipeId === CLOUD_REST_TEMPLE_INTRO_RECIPE_ID) return buildCloudRestTempleIntroSpec(mainDirection, input, compiled);
  if (mainDirection.sceneId === 'mountain-temple') return buildTempleIntroSpec(mainDirection, input, compiled);
  if (mainDirection.sceneId !== 'train') fail('Only the train and mountain-temple intros have candidate implementations; other catalog entries are ideas.');
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

function buildTempleIntroSpec(mainDirection, input, compiled) {
  const recipeId = input.introRecipeId === undefined ? TEMPLE_INTRO_RECIPE_ID : input.introRecipeId;
  if (recipeId !== TEMPLE_INTRO_RECIPE_ID) fail('Unsupported intro recipe for mountain-temple.');
  if (input.referenceEyeState !== undefined) fail('The people-free mountain-temple intro has no reference eye state.');
  const outputSeconds = input.outputSeconds === undefined ? [...OUTPUT_SECONDS] : input.outputSeconds;
  if (!Array.isArray(outputSeconds) || !outputSeconds.length || outputSeconds.length > OUTPUT_SECONDS.length || new Set(outputSeconds).size !== outputSeconds.length || outputSeconds.some(seconds => !OUTPUT_SECONDS.includes(seconds))) {
    fail('Outputs must be distinct supported total durations: 30 and/or 180 seconds, including the intro.');
  }
  const anchors = [
    'same camera angle, crop, perspective and apparent lens',
    'same curved tiled eaves and roof silhouette',
    'same wooden pillars, spacing and temple hall geometry',
    'same stone stairway, step edges and courtyard boundaries',
    'same single lantern position and soft amber light direction',
    'same deep-night exposure and restrained wet-stone highlights',
  ];
  const imagePrompt = [
    'Photorealistic cinematic 16:9 fantasy mountain-temple source image, using the supplied rainy main-body source image as the mandatory visual reference.',
    'Preserve its exact camera angle, crop, perspective, curved tiled eaves, wooden pillars, temple hall, stone stairway, courtyard and single lantern. Keep every roof, pillar and step edge in the same screen position and scale.',
    'Transform only the distant forested slopes and sky into soft layered clouds around the same secluded Korean Buddhist temple. The solid temple, courtyard and stairs stay securely grounded and motionless among clouds.',
    'Deep dark night, muted clouds, one steady dim lantern with soft amber light, fixed low exposure and restrained wet-stone highlights. No daylight, twilight, bright moon or luminous cloud glow.',
    'No people, animals, new buildings, extra lanterns, changed architecture, camera flythrough, dramatic magical beams, text or logos. Do not invent a missing reference anchor; the actual source image is the geometry authority.',
  ].join(' ');
  const videoPrompt = [
    'One continuous 15-second shot animated from the cloud-temple reference image. Locked camera. Keep the eaves, roof silhouette, wooden pillars, stone stairway, courtyard and single lantern fixed in position, shape and scale.',
    'Only extremely slow local cloud drift beyond the architecture. Keep all anchors unobscured; no moving mist over pillars or stair edges. The temple never floats, sways or changes shape. Deep dark night with steady soft amber lantern light, fixed exposure and restrained highlights.',
    'Seconds 0-2: establish the matched cloud-temple composition. Seconds 2-12.5: quiet local cloud drift only. Seconds 12.5-15: maintain the same fixed anchors for a later 2.5-second dissolve into the matching rainy night temple.',
    'The dissolve is added in editing: do not generate a location change, morph, cut or transition in this source. No people, animals, zoom, pan, flythrough, flashes, text or logos. Silent video; continuous rain audio is added separately from time zero.',
  ].join(' ');
  if (imagePrompt.length >= 1500 || videoPrompt.length >= 1500) fail('Intro prompts must be shorter than 1500 characters.');
  return {
    version: INTRO_VERSION, recipeId, status: 'candidate', productionEligible: false,
    provenance: { mainDirectionVersion: mainDirection.version, mainSceneId: mainDirection.sceneId, mainInput: clone(mainDirection.sourceInput) },
    introRecipe: {
      id: recipeId, version: INTRO_VERSION, sourceSeconds: INTRO_SOURCE_SECONDS, occurrences: 1,
      loop: false, reversePlayback: false, people: 'none', imagePrompt, videoPrompt,
      referenceContract: {
        role: 'main-body-source-image', required: true, generationBlockedWithoutReference: true,
        sameReferenceAsMain: true, preserve: [...anchors], sourceImageIsGeometryAuthority: true,
        requiredVisibleAnchors: ['eaves', 'wooden pillars', 'stone stairway', 'single lantern'],
        generationBlockedWithoutVisibleAnchors: true, addingMissingAnchorsAllowed: false,
      },
      shots: [
        { startSeconds: 0, endSeconds: 2, action: 'Establish the matched empty cloud-temple composition with fixed architecture.' },
        { startSeconds: 2, endSeconds: 12.5, action: 'Only slow local cloud drift beyond unobscured eaves, pillars and stairs.' },
        { startSeconds: 12.5, endSeconds: 15, action: 'Keep fixed anchors; editor dissolves to the rainy temple over these final 2.5 seconds.' },
      ],
    },
    transitionContract: {
      version: 'healing-rain-intro-transition-v1', method: 'postproduction-dissolve',
      startSeconds: 12.5, endSeconds: 15, durationSeconds: TRANSITION_SECONDS,
      mainSourceStartSeconds: 0, generatedMorph: false, fixedAnchors: [...anchors],
      mainMotion: 'Main rain, irregular downward eave runoff and small courtyard splashes continue forward throughout the dissolve and all later cycles. Architecture and lantern remain fixed.',
      acceptance: 'Review aligned eaves, pillar edges, stone steps and lantern at the transition. Reject doubled or drifting architecture, missing anchors, occluding clouds or exposure jumps; prompt compliance is not proof of a visual match.',
    },
    mainRecipe: {
      sceneId: mainDirection.sceneId, sourceDirectionVersion: mainDirection.version,
      direction: clone(mainDirection), imagePrompt: compiled.image, videoPrompt: compiled.video,
      loop: clone(mainDirection.loop), render: clone(compiled.render), introIncludedInLoop: false,
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
      checks: ['The actual rainy main source visibly contains all required architecture anchors.', 'Camera, eaves, pillars, stone steps and lantern match the actual reference.', 'No people or animals appear; clouds stay beyond unobscured architecture.', 'Dark night and soft amber light remain steady; no exposure jump.', 'No doubled or drifting architecture across the dissolve.', 'Intro appears exactly once; final durations include it.', 'Main rain and eave runoff continue forward across every loop seam.', 'Rain audio starts at zero and remains continuous through the transition.'].map(criteria => ({ status: 'unreviewed', criteria })),
    },
  };
}

function buildCloudRestTempleIntroSpec(mainDirection, input, compiled) {
  if (input.referenceEyeState !== undefined && input.referenceEyeState !== 'asleep') fail('The cloud-rest-to-temple intro requires an already sleeping adult reference.');
  // Reuse only the unchanged main, audio and timeline planning. This variant has its own subject and reference contracts.
  const templeInput = { ...input, introRecipeId: TEMPLE_INTRO_RECIPE_ID };
  delete templeInput.referenceEyeState;
  const spec = buildTempleIntroSpec(mainDirection, templeInput, compiled);
  const restAnchors = [
    'same adult woman identity, closed eyes and relaxed expression from the newly generated current-production starter image',
    'same reclining head, hands, blanket, pillow and bed placement until cloud cover hides them',
    'same locked camera and soft warm light direction within the cloud-rest shot',
  ];
  const paletteAnchors = ['soft warm light direction', 'muted slate-grey palette and restrained exposure at the cloud-cover endpoint only'];
  const imagePrompt = [
    'Create a fresh original photorealistic cinematic 16:9 cloud-rest starter image for this production. Do not reuse or reference previous production assets. This new image becomes the identity and composition authority for its animation.',
    'One beautiful adult woman already sleeps with closed eyes under cream linen on a secure softly rounded bed among warm pearl and blue-grey clouds. Softly luminous late evening, gentle diffused warm light, slightly brighter than a typical night-bed scene, low contrast and a peaceful comfortable feeling. Keep her face gently readable; avoid gloomy shadows, overbright white or daylight pastels.',
    'The newly created rainy temple image informs only the eventual cloud-cover endpoint palette and warm light direction. Do not copy its camera geometry, architecture or framing, or force the resting intro to match its dark exposure.',
    'No waking, sitting up, other people, exposed body, storm, smoke, lightning, harsh glow, text or logos.',
  ].join(' ');
  const videoPrompt = [
    'One continuous 15-second shot from this production\'s newly created starter image; no prior assets. Locked camera. Preserve the adult woman, closed eyes, face, reclining pose, hands, rounded bed, cream linen and pillow. She sleeps throughout; only tiny blanket breathing.',
    'Seconds 0-7: peaceful warm pearl and blue-grey clouds, gently luminous late evening, soft warm light and low contrast. Comfortable, slightly brighter than a night bed, never gloomy or glaring daylight.',
    'Seconds 7-11: actual opaque pearl clouds pass between the lens and woman, slowly covering the frame. Her face never fades, dissolves or morphs. No camera push or zoom. By second 11, clouds fully hide her face, hands, body, bed and bedding.',
    'Seconds 11-15: full opaque cloud cover settles gradually from warm pearl to muted slate-grey at the new rainy temple night level, matching the supplied cloud-only end frame if provided. No person, silhouette, skin, bed or bedding returns; no gaps. Gentle dimming only, no abrupt darkness, smoke, scary storm or architecture.',
    'The editor adds the temple through a 12.5-15 second dissolve only after full occlusion is verified. Do not generate a temple, person-to-building morph, reveal, cut or dissolve. No waking, extra people, fast motion, pan, zoom, flythrough, lightning, flashes, text or logos. Silent video; fresh continuous rain audio is added from time zero.',
  ].join(' ');
  const endImagePrompt = [
    'Create a fresh original 16:9 terminal frame for this production; no previous assets. Opaque soft clouds fill the entire frame with muted slate-grey, a trace of warm pearl light, low contrast and gentle night exposure suited to the newly created rainy temple.',
    'This is the peaceful endpoint of a gradual dimming from warm luminous pearl clouds, never threatening darkness or storm clouds. All face, skin, hands, human silhouettes, bed, pillow and bedding are fully hidden. No openings, translucent outlines, architecture, temple, smoke, lightning, text or logos. This frame is cloud cover only; the temple is added later in editing.',
  ].join(' ');
  if ([imagePrompt, videoPrompt, endImagePrompt].some(prompt => prompt.length >= 1500)) fail('Intro prompts must be shorter than 1500 characters.');
  spec.recipeId = CLOUD_REST_TEMPLE_INTRO_RECIPE_ID;
  spec.assetFreshnessContract = {
    scope: 'current-production-only', freshOriginalCreationRequired: true, priorAssetsAllowed: false,
    requiredFreshAssets: ['intro-start-image', 'temple-main-image', 'rain-audio'],
    optionalEndImageIfUsedMustBeFresh: true, previousOrExcludedGenerationsAllowed: false,
  };
  spec.introRecipe = {
    id: CLOUD_REST_TEMPLE_INTRO_RECIPE_ID, version: INTRO_VERSION, sourceSeconds: INTRO_SOURCE_SECONDS, occurrences: 1,
    loop: false, reversePlayback: false, people: 'one-sleeping-adult-woman', referenceEyeState: 'asleep',
    imagePrompt, videoPrompt, endImagePrompt,
    subjectContract: { people: 'one-sleeping-adult-woman', minimumAgeYears: 18, closedEyesThroughout: true, fullyClothedOrCovered: true, additionalPeopleAllowed: false, mainSubjectContractInherited: false },
    referenceContract: {
      role: 'fresh-cloud-rest-source-image', required: true, generationBlockedWithoutReference: true,
      sameReferenceAsMain: false, reuseApprovedReference: false, reuseApprovedSource: false,
      freshOriginalCreationRequired: true, currentProductionOnly: true, priorAssetReferencesAllowed: false,
      imageCreationRequiresPriorReference: false,
      sourceImageIsGeometryAuthority: true, preserve: [...restAnchors],
      eyeStateRule: 'Use an already sleeping adult reference; never wake the subject or introduce an eye-closing action.',
    },
    mainReferenceContract: {
      role: 'main-body-source-image', required: true, generationBlockedWithoutReference: true,
      sourceImageIsGeometryAuthority: false, preserve: [...paletteAnchors],
      freshOriginalCreationRequired: true, currentProductionOnly: true, priorAssetsAllowed: false,
      matchingArchitectureRequired: false, matchingCameraGeometryRequired: false,
      exposureMatchScope: 'cloud-cover-endpoint-only', introExposureMustMatchMain: false,
      purpose: 'Use the new main only for endpoint palette and warm light direction; let the fully hidden cloud cover dim gradually to its night level.',
    },
    endReferenceContract: {
      role: 'opaque-cloud-cover-terminal-image', required: false, generationRequired: false,
      currentProductionOnly: true, priorAssetsAllowed: false, ifProvidedMustBeFresh: true,
      ifProvidedMustFullyOccludeSubject: true, templeOrArchitectureAllowed: false,
      purpose: 'Optional cloud-cover endpoint guidance; a temple endpoint cannot establish full cloud occlusion.',
    },
    shots: [
      { startSeconds: 0, endSeconds: 7, action: 'Hold the adult woman asleep among softly luminous warm pearl clouds, with closed eyes and tiny blanket breathing.' },
      { startSeconds: 7, endSeconds: 11, action: 'Opaque pearl foreground clouds slowly approach the locked lens; fully hide the woman and all bedding by second 11.' },
      { startSeconds: 11, endSeconds: 12.5, action: 'Verify full cloud occlusion, then gently dim warm pearl clouds toward muted slate-grey; no storm or smoke.' },
      { startSeconds: 12.5, endSeconds: 15, action: 'Maintain verified cloud cover and gradual settling to the night level while the editor dissolves to the quiet new rainy temple.' },
    ],
  };
  spec.transitionContract = {
    version: 'healing-rain-intro-transition-v1', method: 'postproduction-dissolve',
    startSeconds: 12.5, endSeconds: 15, durationSeconds: TRANSITION_SECONDS,
    mainSourceStartSeconds: 0, generatedMorph: false, fixedAnchors: [...paletteAnchors],
    geometryMatchRequired: false, subjectMatchRequired: false,
    luminanceRamp: { startSeconds: 11, endSeconds: 15, from: 'softly-luminous-warm-pearl', to: 'muted-slate-grey-temple-night-level', curve: 'gentle-continuous', abruptDarkeningAllowed: false, stormOrSmokeAllowed: false },
    cloudOcclusionGate: {
      required: true, status: 'unreviewed', startSeconds: 11, endSeconds: 15,
      reviewRequiredBeforeComposite: true, allPeopleFullyHidden: true, bedAndBeddingFullyHidden: true,
      noReappearance: true, promptComplianceIsProof: false,
      acceptance: 'Review the entire source interval 11-15 seconds. Every frame must hide all people, faces, skin, silhouettes, bed and bedding behind opaque cloud cover. Reject openings, translucent outlines or reappearance; do not composite an unreviewed or failed source.',
    },
    mainMotion: 'Main rain, irregular downward eave runoff and small courtyard splashes continue forward throughout the dissolve and all later cycles. Architecture and lantern remain fixed; the main stays people-free.',
    acceptance: 'Start the dissolve only after verified full cloud occlusion. Reject a visible or ghosted person over the temple, a person-to-building morph, abrupt exposure change or lightning. Shared architecture and camera geometry are not required.',
  };
  spec.mainRecipe.subjectContract = { people: 'none', introSubjectAllowedInMain: false, generationFromIntroReferenceAllowed: false };
  spec.qa.checks = [
    'The starter image, temple main image and rain audio are fresh originals for this production; no prior or excluded asset is reused.',
    'The new starter is the identity authority and contains one already sleeping adult woman among softly luminous warm pearl clouds.',
    'Eyes remain closed; face, pose and bedding stay stable before clouds cover them.',
    'Warm low-contrast light feels peaceful and slightly brighter than a night bed, without gloomy shadows or glaring daylight.',
    'Opaque pearl clouds approach the locked lens slowly during seconds 7-11 without a zoom, storm, smoke or lightning.',
    'The complete source interval 11-15 seconds has verified opaque cloud cover with no visible person, silhouette, bed or bedding in any frame.',
    'The cloud-occlusion gate passes before compositing; the dissolve begins at 12.5 seconds only after the person is hidden.',
    'After full occlusion, clouds dim gently during seconds 11-15 toward the new temple night level; no abrupt darkness or face-to-building morph.',
    'The main reference guides endpoint palette and light direction only; the resting intro does not inherit the dark main exposure.',
    'The rainy temple main remains people-free and its canonical direction is unchanged.',
    'Intro appears exactly once; final durations include it.',
    'Main rain and eave runoff continue forward across every loop seam.',
    'Rain audio starts at zero and remains continuous through the transition.',
  ].map(criteria => ({ status: 'unreviewed', criteria }));
  return spec;
}

module.exports = { INTRO_VERSION, INTRO_RECIPE_ID, TEMPLE_INTRO_RECIPE_ID, CLOUD_REST_TEMPLE_INTRO_RECIPE_ID, INTRO_CATALOG, OUTPUT_SECONDS, buildIntroSpec };
