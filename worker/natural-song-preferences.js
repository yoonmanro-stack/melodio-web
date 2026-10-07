const PERFORMANCE_PRESET_ID = 'brazilian-funk-kpop-performance';
const PERFORMANCE_MENUS = new Set(['preset-studio', 'audio-forge', 'audio-forge-pro']);

/** Known preset preferences only; client-provided numeric ranges never set policy. */
function resolveNaturalSongPreference(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const dedicated = meta.isViral === true || meta.isViralTrack === true
    || meta.requestedDurationSource === 'short-form-request'
    || ['pet-v3', 'pet-v4'].includes(meta.petEpisode?.version)
    || meta.storyPlan?.version === 'story-v4';
  if (!dedicated && PERFORMANCE_MENUS.has(meta.sourceMenu)
      && meta.presetId === PERFORMANCE_PRESET_ID && meta.isInstrumental === false) {
    return { minimum: 160, maximum: 260, target: 200 };
  }
  return { minimum: 160, maximum: 240 };
}

module.exports = { resolveNaturalSongPreference };
