export type StudioGender = 'female' | 'male' | 'duet' | 'mixed'

type Selection = { gender: string; stylePrompt: string; customVoiceId?: string }

/** Fail closed when a saved solo voice does not match the current composition. */
export function studioVoiceFields<T extends Selection>(gender: StudioGender, voice: T | null) {
  const selected = (gender === 'female' || gender === 'male') && voice?.gender === gender ? voice : null
  return { vocalGender: gender, activeVoice: selected, voicePrompt: selected?.stylePrompt, vdCode: undefined }
}

export function suppressIneligibleVoice(body: Record<string, any>) {
  if (body.isInstrumental || ['mixed', 'random', 'duet'].includes(body.vocalGender)) {
    delete body.activeVoice
    delete body.voicePrompt
    delete body.vdCode
    delete body.customVoiceId
  }
}
