const profiles = require('./japan-preset-profiles.json');
const SELECTED_CUE = 'Preserve the chosen vocal timbre, register and phrasing. Keep lead phrases intact from the first line; background textures and instrumental effects stay off the lead';
const DEFAULT_END = 'Keep sung phrases intact from the first line; background textures and instrumental effects stay off the lead';

/** The two already-reviewed policies remain authoritative for their own presets. */
function protectJapanLeadVocal(options, style, exclude, fitStyle) {
  if (!options || options.sourceMenu !== 'japan' || options.instrumental !== false
      || options.naturalFullSong !== true || !Object.hasOwn(profiles, options.presetId || '')
      || ['lofi-study', 'kawaii-future'].includes(options.presetId)) return { style, exclude };
  const selected = options.vocalProfileSpecified === true
    || (typeof options.personaId === 'string' && Boolean(options.personaId.trim()));
  const defaultCue = `Default lead: ${profiles[options.presetId].defaultVocal}. ${DEFAULT_END}`;
  const cue = selected ? SELECTED_CUE : defaultCue;
  let body = style;
  for (const ownCue of [SELECTED_CUE, defaultCue]) {
    let start = body.indexOf(ownCue);
    while (start !== -1) {
      let end = start + ownCue.length;
      if (body.slice(end, end + 2) === ', ') end += 2;
      else if (body.slice(Math.max(0, start - 2), start) === ', ') start -= 2;
      body = body.slice(0, start) + body.slice(end);
      start = body.indexOf(ownCue);
    }
  }
  const budget = 1000 - cue.length - 2;
  const fitted = fitStyle(body, budget);
  if (typeof fitted !== 'string' || fitted.length > budget) throw new RangeError('Japan vocal style budget exceeded.');
  return { style: fitted ? `${cue}, ${fitted}` : cue, exclude };
}

module.exports = { protectJapanLeadVocal };
