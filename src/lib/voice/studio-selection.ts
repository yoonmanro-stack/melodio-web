export type StudioGender = 'female' | 'male' | 'duet' | 'mixed'

type Selection = { gender: string; language?: string; stylePrompt: string; customVoiceId?: string }

const LANGUAGE_CODES: Record<string, string> = {
  korean: 'ko', 한국어: 'ko', 한글: 'ko', english: 'en', 영어: 'en',
  japanese: 'ja', 일본어: 'ja', french: 'fr', 프랑스어: 'fr',
}
const LANGUAGE_LABELS: Record<string, string> = {
  ko: '한국어', en: '영어', ja: '일본어', fr: '프랑스어', zh: '중국어',
  es: '스페인어', pt: '포르투갈어', de: '독일어', it: '이탈리아어',
  hi: '힌디어', ru: '러시아어', ar: '아랍어',
}

function languageCodes(language?: string): string[] {
  const value = language?.trim().toLowerCase() || ''
  if (!value) return []
  return value.split(/[+/,\s-]+/).map(code => LANGUAGE_CODES[code] || code)
}

export function studioLanguageLabel(language?: string): string {
  const codes = languageCodes(language)
  return codes.length ? codes.map(code => LANGUAGE_LABELS[code] || code).join(' + ') : '언어 미지정'
}

/** Match the language of the available sample/design, not a multilingual identity guarantee. */
export function matchesStudioLanguage(voiceLanguage: string | undefined, language?: string): boolean {
  if (!language) return true // Older non-studio callers retain their existing behavior.
  const requested = languageCodes(language)
  return languageCodes(voiceLanguage).some(code => requested.includes(code))
}

export function matchesStudioVoice(gender: string, voice: { gender: string; language?: string } | null | undefined, language?: string): boolean {
  return (gender === 'female' || gender === 'male') && voice?.gender === gender
    && matchesStudioLanguage(voice.language, language)
}

/** Fail closed when a saved solo voice does not match the current composition. */
export function studioVoiceFields<T extends Selection>(gender: StudioGender, voice: T | null, language?: string) {
  const selected = matchesStudioVoice(gender, voice, language) ? voice : null
  return { vocalGender: gender, activeVoice: selected, voicePrompt: selected?.stylePrompt, vdCode: undefined,
    ...(language ? { lyricsLanguage: language } : {}) }
}

export function suppressIneligibleVoice(body: Record<string, any>) {
  if (body.isInstrumental || ['mixed', 'random', 'duet'].includes(body.vocalGender)) {
    delete body.activeVoice
    delete body.voicePrompt
    delete body.vdCode
    delete body.customVoiceId
    delete body.officialVoiceId
    delete body.discoveryVoiceId
    delete body.designedVoiceId
  }
}
