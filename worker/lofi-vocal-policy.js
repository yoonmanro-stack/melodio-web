const STYLE_LIMIT = 1000;
const EXCLUDE_LIMIT = 1000;
const SEPARATOR = ', ';
const LEAD_CUE = 'Preserve the chosen vocal timbre and natural full-range presence from the first sung phrase; lo-fi tape warmth and hiss belong only to instruments and background ambience.';
const LEAD_EXCLUSIONS = [
  'telephone-filtered lead vocal',
  'cup-filtered lead vocal',
  'electrical static on lead vocal',
];

function clauseKey(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function appendLeadExclusions(exclude) {
  if (exclude != null && typeof exclude !== 'string') return exclude;
  const original = exclude ?? '';
  const existing = new Set(original.split(',').map(clauseKey));
  const missing = LEAD_EXCLUSIONS.filter(clause => !existing.has(clauseKey(clause)));
  if (!missing.length) return exclude;
  const addition = `${original.trim() ? SEPARATOR : ''}${missing.join(SEPARATOR)}`;
  // Never sacrifice or normalize the author's tags to make room for our policy.
  return original.length + addition.length <= EXCLUDE_LIMIT ? original + addition : exclude;
}

function removeOwnCue(style) {
  let body = style;
  let index = body.indexOf(LEAD_CUE);
  while (index !== -1) {
    let end = index + LEAD_CUE.length;
    if (body.slice(end, end + SEPARATOR.length) === SEPARATOR) end += SEPARATOR.length;
    else if (body.slice(Math.max(0, index - SEPARATOR.length), index) === SEPARATOR) index -= SEPARATOR.length;
    body = body.slice(0, index) + body.slice(end);
    index = body.indexOf(LEAD_CUE);
  }
  return body;
}

/** Protect one ordinary Japan vocal preset; every other request is byte-for-byte unchanged. */
function protectLofiLeadVocal(options, style, exclude, fitStyle) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || options.sourceMenu !== 'japan' || options.presetId !== 'lofi-study'
    || options.instrumental !== false || options.naturalFullSong !== true
    || typeof style !== 'string' || !style.trim()) return { style, exclude };
  if (typeof fitStyle !== 'function') throw new TypeError('Lo-fi vocal protection needs the existing style fitter.');
  const bodyBudget = STYLE_LIMIT - LEAD_CUE.length - SEPARATOR.length;
  const body = fitStyle(removeOwnCue(style), bodyBudget);
  if (typeof body !== 'string') throw new TypeError('Style fitter must return a string.');
  if (body.length > bodyBudget) throw new RangeError('Style fitter exceeded the reserved Lo-fi vocal budget.');
  return {
    style: body ? `${LEAD_CUE}${SEPARATOR}${body}` : LEAD_CUE,
    exclude: appendLeadExclusions(exclude),
  };
}

module.exports = { protectLofiLeadVocal };
