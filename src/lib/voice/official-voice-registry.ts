import 'server-only'
import registry from './official-voice-personas.json'

export function officialVoicePersona(id: string): string {
  const persona = (registry as Record<string, string>)[id]
  if (!persona || !/^[A-Za-z0-9_-]{6,160}$/.test(persona)) throw new Error('official_voice_not_ready')
  return persona
}
