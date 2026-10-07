const profiles = require('./preset-studio-profiles.json');
const SOURCES = new Set(['preset-studio', 'audio-forge', 'audio-forge-pro', 'audio']);
const ALIASES = { grime: 'uk_grime', grunge: 'grunge_seattle', 'joseon-hip-hop': 'joseon-hiphop' };
const SELECTED_CUE = 'Preserve the chosen lead timbre and phrasing; keep complete lead phrases clear from the first line';

/** Musical guitar articulation only. Authored lyric words and generic artist references are separate. */
function normalizePresetStudioGuitarArticulation(style) {
  return style
    .replace(/\b(?:off[-\s]?beat\s+)?((?:electric\s+|acoustic\s+|rhythm\s+|muted\s+)?guitars?)\s+skank\b/gi,
      (_match, instrument) => `offbeat ${instrument} upstrokes`)
    .replace(/\b(?:off[-\s]?beat\s+)?skank\s+((?:electric\s+|acoustic\s+|rhythm\s+|muted\s+)?guitars?)\b/gi,
      (_match, instrument) => `offbeat ${instrument} upstrokes`);
}

/** Catalog defaults are gender-neutral. Explicit user voices always take precedence. */
function protectPresetStudioLeadVocal(options, style, exclude, fitStyle) {
  const id = ALIASES[options?.presetId] || options?.presetId;
  if (!SOURCES.has(options?.sourceMenu) || options?.naturalFullSong !== true
      || !Object.hasOwn(profiles, id || '')) return { style, exclude };
  const selected = options.vocalProfileSpecified === true || Boolean(options.personaId);
  const ownedRecipes = [profiles[id].sourceRecipe, profiles[id].recipe, profiles[id].selectedVoiceRecipe];
  // Evaluate original ownership first: normalization cannot make a custom recipe catalog-owned.
  const owned = ownedRecipes.some(recipe => typeof recipe === 'string' && recipe && style.includes(recipe));
  const normalizedStyle = normalizePresetStudioGuitarArticulation(style);
  if (options.instrumental !== false || !owned) {
    return { style: normalizedStyle === style ? style : fitStyle(normalizedStyle), exclude };
  }
  // Brazilian performance's verified eight-part recipe already describes its lead and mix.
  if (id === 'brazilian-funk-kpop-performance' && !selected) return { style: normalizedStyle, exclude };
  const defaultCue = `Default lead: ${profiles[id].defaultVocal}; clear complete lead phrases from the first line`;
  const cue = selected ? SELECTED_CUE : defaultCue;
  let body = normalizedStyle;
  for (const ownCue of [SELECTED_CUE, defaultCue]) {
    body = body.split(ownCue + ', ').join('').split(ownCue).join('');
  }
  // These duplicate headers add no genre information; reserve room for the actual voice and arrangement.
  body = body.replace(/\[Hyper-Realistic 24-bit 96kHz, studio master production\]\s*/g, '')
    .replace(/\[High-fidelity studio mastering, professional grade audio\]\s*/g, '').trim();
  const budget = 1000 - cue.length - 2;
  const fitted = fitStyle(body, budget);
  if (typeof fitted !== 'string' || fitted.length > budget) throw new RangeError('Preset vocal style budget exceeded.');
  return { style: fitted ? `${cue}, ${fitted}` : cue, exclude };
}

module.exports = { protectPresetStudioLeadVocal, normalizePresetStudioGuitarArticulation };
