'use strict';

// Opt-in candidate: saved directions and generated media remain immutable.
const { compileDirection } = require('./direction');
const { buildMotionCandidate } = require('./motion-strategy');
const LIGHT_ROLE_VERSION = 'healing-rain-light-roles-v1-candidate';

function buildReflectionCandidate(direction, input) {
  const compiled = compileDirection(direction, input);
  const motion = buildMotionCandidate(direction, input);
  const glass = direction.profiles.includes('glass-rain');
  const train = direction.sceneId === 'train';
  const roles = {
    version: LIGHT_ROLE_VERSION, applicable: glass,
    interiorPractical: { referenceFrame: 'interior', brightness: 'steady-shielded', keepFaceAndBeddingReadable: true },
    glassReflection: { applicable: glass, source: 'interiorPractical', referenceFrame: 'interior', brightness: 'barely-visible', appearance: 'soft-transparent-low-contrast', count: 'geometry-dependent', duplicateBrightOrbs: false },
    exteriorLights: { presence: train ? 'few-faint-distant' : 'not-added', referenceFrame: 'exterior', motion: train ? 'same-travel-and-depth-parallax-as-landscape' : 'stationary-world' },
  };
  // Keep the requested distant lights, but identify their world reference frame.
  const imageRule = glass ? 'Light roles: retain a softly shielded warm interior lamp and readable face and bedding. Glass stays transparent; any reflection of that lamp is barely visible, diffuse and low contrast, without a bright core or duplicated amber orbs. Reflection position follows the lamp and viewing angle. Exterior lights, if specified, are faint distant landscape features, never decorative spots attached to the pane.' : '';
  const videoRule = glass ? 'Light roles: glass reflections are barely visible, soft, transparent and interior-anchored; no bright cores or duplicate amber orbs. Exterior lights follow the landscape and its depth parallax. Keep this balance steady; no reflection brightening or new light points.' : '';
  // The dimmed source must be reviewed before animation: do not tell the model to
  // preserve known bright source spots while simultaneously asking to remove them.
  let video = motion.video.input.prompt;
  if (glass) {
    video = video.replace('Only tiny local wet reflections vary; light sources stay steady. ', '');
    video = video.replace('Preserve the source photograph’s lighting. ', 'Preserve the corrected source lighting balance. ');
    video += ' ' + videoRule;
  }
  if (video.length > 1500) throw Object.assign(new Error('Reflection candidate exceeds provider prompt limit.'), { code: 'REFLECTION_PROMPT_TOO_LONG' });
  return {
    version: LIGHT_ROLE_VERSION, status: 'candidate', sourceDirectionVersion: direction.version,
    sourceInput: { ...direction.sourceInput }, motionStrategyVersion: motion.strategy.version,
    lightingRoles: roles,
    prompts: { image: [compiled.image, imageRule].filter(Boolean).join(' '), video },
    sourceImageReview: { required: glass, beforeVideoSubmission: glass, reject: glass ? ['prominent fixed amber spots on glass', 'bright or opaque lamp duplicates', 'ambiguous interior reflection versus exterior emitter'] : [] },
    review: { status: 'review-required', automaticApproval: false, checks: glass ? ['reflection source and angle are plausible', 'reflection is barely visible with no bright core', 'interior remains warm and readable', 'outdoor lights use landscape motion; reflection uses interior motion', 'accepted travel speed and direction are retained'] : [] },
    productionDefaultChanged: false,
  };
}

module.exports = { LIGHT_ROLE_VERSION, buildReflectionCandidate };
