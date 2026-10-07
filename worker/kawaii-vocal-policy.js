const SELECTED_CUE = 'Preserve the chosen lead-vocal timbre and melodic expression with natural unshifted pitch and formants. Put pitched or chopped textures on synth accents only, never on the main sung lead.';
const DEFAULT_CUE = 'Use a natural adult lead with lively forward resonance, solid midrange body and distinctive dry texture; articulate the requested lyrics clearly. Keep main singing unshifted and unchopped; pitched or chopped candy textures belong to synth accents only.';
const EXCLUSIONS = ['chipmunk lead vocal', 'artificially shifted lead-vocal formants', 'chopped main sung vocal'];
const SEPARATOR = ', ';
const key = value => value.trim().replace(/\s+/g, ' ').toLowerCase();

function protectKawaiiLeadVocal(options, style, exclude, fitStyle) {
  if (!options || options.sourceMenu !== 'japan' || options.presetId !== 'kawaii-future'
      || options.instrumental !== false || options.naturalFullSong !== true
      || typeof style !== 'string' || !style.trim()) return { style, exclude };
  const selected = options.vocalProfileSpecified === true
    || (typeof options.personaId === 'string' && Boolean(options.personaId.trim()));
  const cue = selected ? SELECTED_CUE : DEFAULT_CUE;
  let body = style;
  for (const ownCue of [SELECTED_CUE, DEFAULT_CUE]) {
    let start = body.indexOf(ownCue);
    while (start !== -1) {
      let end = start + ownCue.length;
      if (body.slice(end, end + 2) === SEPARATOR) end += 2;
      else if (body.slice(Math.max(0, start - 2), start) === SEPARATOR) start -= 2;
      body = body.slice(0, start) + body.slice(end);
      start = body.indexOf(ownCue);
    }
  }
  const budget = 1000 - cue.length - SEPARATOR.length;
  const fitted = fitStyle(body, budget);
  if (typeof fitted !== 'string' || fitted.length > budget) throw new RangeError('Kawaii vocal style budget exceeded.');
  let guardedExclude = exclude;
  if (exclude == null || typeof exclude === 'string') {
    const original = exclude ?? '';
    const seen = new Set(original.split(',').map(key));
    const missing = EXCLUSIONS.filter(value => !seen.has(key(value)));
    const addition = missing.length ? `${original.trim() ? SEPARATOR : ''}${missing.join(SEPARATOR)}` : '';
    if (addition && original.length + addition.length <= 1000) guardedExclude = original + addition;
  }
  return { style: fitted ? `${cue}${SEPARATOR}${fitted}` : cue, exclude: guardedExclude };
}

module.exports = { protectKawaiiLeadVocal };
