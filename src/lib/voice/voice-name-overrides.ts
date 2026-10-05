export const VOICE_NAME_OVERRIDES_KEY = 'melodio_voice_name_overrides'

export function normalizeVoiceName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(name) ? name : null
}

export function readVoiceNameOverrides(value: unknown): Record<string, string> {
  const names: Record<string, string> = Object.create(null)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return names
  for (const [id, valueName] of Object.entries(value)) {
    const name = normalizeVoiceName(valueName)
    if (/^[A-Za-z0-9_-]{1,160}$/.test(id) && name) names[id] = name
  }
  return names
}

export function applyVoiceNameOverride<T extends { name: string; nameOverride?: string }>(voice: T, value: unknown = voice.nameOverride): T {
  const name = normalizeVoiceName(value)
  return name ? { ...voice, name, nameOverride: name } : voice
}

export function collectVoiceNameOverrides(voices: { id: string; nameOverride?: string }[]): Record<string, string> {
  return readVoiceNameOverrides(Object.fromEntries(voices.map(voice => [voice.id, voice.nameOverride])))
}
