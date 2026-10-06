type DurationRequest = {
  isViral?: unknown
  isViralTrack?: unknown
  sourceMenu?: unknown
  metadata?: unknown
}

function validSeconds(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  const clock = text.match(/^(\d+):([0-5]\d)$/)
  const seconds = clock ? Number(clock[1]) * 60 + Number(clock[2]) : Number(text)
  return Number.isFinite(seconds) && seconds >= 10 && seconds <= 360 ? seconds : null
}

/** Musical descriptions such as "short hook" must never select a video format. */
export function resolveMusicDuration(request: DurationRequest) {
  const metadata = request.metadata && typeof request.metadata === 'object'
    ? request.metadata as { durationSeconds?: unknown; duration?: unknown } : null
  const explicit = validSeconds(metadata?.durationSeconds) ?? validSeconds(metadata?.duration)
  const shortRequest = request.isViral === true || request.isViralTrack === true
    || request.sourceMenu === 'viral' || request.sourceMenu === 'viral-cf' || request.sourceMenu === 'short-form'
  // Ordinary studio presets may contain old sample-length metadata. It must not
  // turn a complete song into a clip or impose a clock on its natural ending.
  const voiceSample = ['voice-discovery-design', 'voice-discovery-sample', 'voice-preview', 'voice-sample'].includes(String(request.sourceMenu || ''))
  const timedRequest = shortRequest || voiceSample || request.sourceMenu === 'mugsound-supply'
  const seconds = timedRequest ? explicit ?? (shortRequest ? 28 : voiceSample ? 45 : 195) : undefined
  return {
    seconds,
    naturalFullSong: !timedRequest,
    preferredSeconds: !timedRequest ? { minimum: 160, maximum: 240 } : undefined,
    mode: shortRequest || (seconds !== undefined && seconds <= 60) ? 'short-form' as const : 'full-song' as const,
    source: !timedRequest ? 'studio-natural' as const : explicit !== null ? 'explicit-duration' as const
      : shortRequest ? 'short-form-request' as const : 'timed-request' as const,
  }
}

/** Arrangement cues stay independent of the instruments chosen in the recipe. */
export function buildInstrumentalArrangement(seconds?: number): string {
  if (seconds === undefined) return `[Compact Complete Instrumental]\n[Brief Instrumental Intro]\n[Main Theme]\n[Theme Variation]\n[Brief Contrasting Passage]\n[Main Theme Return]\n[Natural Resolution and Outro]`
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return `[Target Duration: ${clock}, Complete Instrumental]\n[Instrumental Intro]\n[Main Theme]\n[Instrumental Development]\n[Main Theme Variation]\n[Instrumental Bridge]\n[Final Main Theme]\n[Outro and Natural Ending]`
}

/** Remove clock-based production directions, while preserving tempo, lyrics and era markers. */
export function removeClockDurationInstructions(prompt: string): string {
  return prompt
    .replace(/\[\s*(?:target\s+duration|duration|fade\s*out\s*(?:at|by))\s*:?\s*\d+(?::\d{2}|\s*(?:seconds?|secs?|minutes?|mins?|s\b|m\b))[^\]\n]*\]/gi, '')
    .replace(/\b(?:target\s+duration|total\s+duration|duration|song\s+length)\s*:?\s*\d+(?::\d{2}|\s*(?:seconds?|secs?|minutes?|mins?))(?:\s*\(\d+:\d{2}\))?/gi, '')
    .replace(/\b(?:fade\s*out|finish|end|stop|cut\s*off)\s+(?:at|by|after)\s+\d+(?::\d{2}|\s*(?:seconds?|secs?|minutes?|mins?))/gi, '')
    .replace(/(?:목표\s*(?:길이|시간)|곡\s*길이|페이드\s*아웃)\s*:?\s*\d+(?:\s*분\s*\d*\s*초?|\s*초|:\d{2})/g, '')
    .replace(/[,;]\s*[,;]+/g, ',')
    .replace(/[ \t]+/g, ' ')
    .replace(/^[\s,;]+|[\s,;]+$/g, '')
}
