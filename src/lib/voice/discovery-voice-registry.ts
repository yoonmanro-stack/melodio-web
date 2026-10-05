import 'server-only'
import registry from './discovery-voice-personas.json'

export function discoveryVoicePersona(id: string): string {
  const persona = (registry as Record<string, string>)[id]
  if (!Object.hasOwn(registry, id) || typeof persona !== 'string' || !/^[A-Za-z0-9_-]{6,160}$/.test(persona)) {
    throw new Error('discovery_voice_not_ready')
  }
  return persona
}
