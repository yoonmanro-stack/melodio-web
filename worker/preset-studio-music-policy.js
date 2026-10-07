const profiles = require('./preset-studio-profiles.json');
const musicCores = [...new Set(Object.values(profiles).flatMap(p => [p.recipe, p.selectedVoiceRecipe]))]
  .filter(Boolean).sort((a, b) => b.length - a.length);

/** Reviewed instrumental recipes are neutral to singer gender. Do not scrub their instrument/genre names. */
function preserveReviewedMusicWhileScrubbing(style, gender, scrub) {
  const parts = [];
  let masked = style;
  const protect = text => { const token = `MELODIOMUSICPART${parts.length}TOKEN`; parts.push(text); return token; };
  for (const core of musicCores) if (masked.includes(core)) masked = masked.split(core).join(protect(core));
  // Names also remain meaningful if a user edits the rest of a catalog recipe.
  masked = masked.replace(/\b(?:Game\s+Boy|Girl\s+Crush|(?:alto|tenor|soprano)\s+sax(?:ophone)?)\b/gi, protect);
  let result = scrub(masked, gender);
  parts.forEach((text, i) => { result = result.split(`MELODIOMUSICPART${i}TOKEN`).join(text); });
  return result;
}
module.exports = { preserveReviewedMusicWhileScrubbing };
