import type { ChannelDna, ChannelEpisode, TrackBlueprint } from '../../types'

export type GenerationPromptTier = 'compact' | 'studio'

export interface CompiledTrackPrompt {
  stylePrompt: string
  excludePrompt: string
  promptTier: GenerationPromptTier
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function joinWithinLimit(parts: string[], limit: number): string {
  let result = ''
  for (const raw of parts) {
    const part = clean(raw)
    if (!part) continue
    const next = result ? `${result} ${part}` : part
    if (next.length <= limit) {
      result = next
      continue
    }
    const remaining = limit - result.length - (result ? 1 : 0)
    if (remaining > 20) result = `${result}${result ? ' ' : ''}${part.slice(0, remaining).trim()}`
    break
  }
  return result.slice(0, limit).trim()
}

export function compileTrackPrompt(
  dna: ChannelDna,
  episode: ChannelEpisode,
  track: TrackBlueprint,
  tier: GenerationPromptTier,
): CompiledTrackPrompt {
  const music = dna.music
  const excludePrompt = joinWithinLimit([
    music.forbiddenGenres.join(', '),
    music.forbiddenInstruments.join(', '),
    music.forbiddenProductionTraits.join(', '),
  ], 200)

  if (tier === 'compact') {
    return {
      promptTier: tier,
      stylePrompt: joinWithinLimit([
        music.compactTagPrompt,
        `${track.bpm} BPM`,
        track.musicalKey,
        track.leadInstrument,
        track.isInstrumental ? 'instrumental' : `${track.vocalGender || 'expressive'} vocal`,
      ], 200),
      excludePrompt,
    }
  }

  const vocal = track.isInstrumental
    ? 'Keep the piece fully instrumental, with no sung words or vocal ad-libs.'
    : `Feature ${track.vocalGender || 'an expressive'} lead vocal in ${track.lyricLanguage || 'the selected lyric language'}, with clear diction and the vocal comfortably above the arrangement.`
  const narrative = track.lyricTheme || track.narrativeBeat || episode.emotionalArc

  return {
    promptTier: tier,
    stylePrompt: joinWithinLimit([
      `Create a studio-grade ${music.primaryGenre} track for the scene "${episode.situation}" in ${episode.location} during ${episode.daypart}.`,
      `The track is titled "${track.songTitle}" and serves as the ${track.role} chapter of the playlist, carrying energy ${track.energy}/100 at ${track.bpm} BPM${track.musicalKey ? ` in ${track.musicalKey}` : ''}.`,
      `Lead with ${track.leadInstrument || music.signatureInstruments[0] || 'the channel signature instrumentation'}${track.supportInstruments.length ? `, supported by ${track.supportInstruments.join(', ')}` : ''}.`,
      track.arrangementVariation ? `Give this song a distinct arrangement identity: ${track.arrangementVariation}.` : '',
      narrative ? `Shape the emotional narrative around ${narrative}.` : '',
      music.productionTextures.length ? `Use ${music.productionTextures.join(', ')} as the production texture.` : '',
      vocal,
      clean(music.baseStylePrompt).slice(0, 360),
      'Maintain the Channel DNA while ensuring this composition has a melody, intro gesture, and transition pattern distinct from every other track in the episode.',
    ], 1000),
    excludePrompt,
  }
}
