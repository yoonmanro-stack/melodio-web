import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import officialCatalog from '@/data/officialVocalCatalog.json'
import discoveryCatalog from '@/data/discoveryVoices.json'
import { officialVoicePersona } from '@/lib/voice/official-voice-registry'
import { discoveryVoicePersona } from '@/lib/voice/discovery-voice-registry'
import { readDesignedVoice } from '@/lib/voice/designed-voice-repository'
import { readCustomVoice } from '@/lib/voice/custom-voice-repository'
import { registeredVoicePersona } from '@/lib/voice/custom-voice-integrity'
import type { ArtistLanguage, ArtistVoiceReference } from './types'

type StorageClient = Pick<SupabaseClient, 'storage'>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LANGUAGES = new Set(['ko', 'en', 'ja', 'fr'])

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function identity(kind: ArtistVoiceReference['kind'], referenceId: string, value: Record<string, unknown>): ArtistVoiceReference {
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80
    || !['female', 'male'].includes(String(value.gender)) || !LANGUAGES.has(String(value.language))) {
    throw new Error('artist_voice_not_ready')
  }
  return { kind, referenceId, name: value.name, gender: value.gender as 'female' | 'male', language: value.language as ArtistLanguage }
}

/** Resolve a durable identity independently of browser favorites and display fields. */
export async function resolveArtistVoice(admin: StorageClient, userId: string, reference: unknown): Promise<ArtistVoiceReference> {
  const value = object(reference)
  if (!UUID.test(userId) || typeof value.referenceId !== 'string' || !value.referenceId
    || value.referenceId.length > 160 || !['official', 'discovery', 'designed', 'custom'].includes(String(value.kind))) {
    throw new Error('invalid_request')
  }
  const kind = value.kind as ArtistVoiceReference['kind']
  const id = value.referenceId
  try {
    if (kind === 'official') {
      const voice = officialCatalog.find(row => row.id === id || row.officialVoiceId === id)
      if (!voice) throw new Error('artist_voice_not_found')
      if (!/^\/assets\/voices\/official(?:-[A-Za-z0-9-]+)?\/[A-Za-z0-9_-]+\.(?:mp3|wav|m4a|webm|ogg)$/.test(voice.audioUrl || '')) {
        throw new Error('artist_voice_not_ready')
      }
      officialVoicePersona(voice.id)
      return identity(kind, voice.id, voice)
    }
    if (kind === 'discovery') {
      const voice = discoveryCatalog.find(row => row.id === id || row.discoveryVoiceId === id)
      if (!voice) throw new Error('artist_voice_not_found')
      if (voice.previewStatus !== 'ready' || voice.reuseStatus !== 'ready'
        || !/^\/assets\/voices\/discovery(?:-[A-Za-z0-9-]+)?\/[A-Za-z0-9_-]+\.(?:mp3|wav|m4a|webm|ogg)$/.test(voice.audioUrl || '')) {
        throw new Error('artist_voice_not_ready')
      }
      discoveryVoicePersona(voice.id)
      return identity(kind, voice.id, voice)
    }
    if (!UUID.test(id)) throw new Error('invalid_request')
    if (kind === 'designed') {
      const voice = await readDesignedVoice(admin, userId.toLowerCase(), id.toLowerCase())
      if (!voice) throw new Error('artist_voice_not_found')
      if (voice.status !== 'ready' || !voice.providerPersonaId) throw new Error('artist_voice_not_ready')
      return identity(kind, voice.id, voice)
    }
    const voice = await readCustomVoice(admin, userId.toLowerCase(), id.toLowerCase())
    if (!voice) throw new Error('artist_voice_not_found')
    registeredVoicePersona(voice, userId.toLowerCase())
    const layers = object(voice.physical_layers)
    const registration = object(layers.registration)
    return identity(kind, voice.id, { name: voice.name, gender: layers.gender, language: registration.language })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (['official_voice_not_ready', 'discovery_voice_not_ready', 'voice_not_ready', 'invalid_voice_registration', 'invalid_designed_voice'].includes(code)) {
      throw new Error('artist_voice_not_ready')
    }
    if (['voice_storage_unavailable', 'designed_voice_storage_unavailable', 'designed_voice_list_limit'].includes(code)) {
      throw new Error('artist_storage_unavailable')
    }
    throw error
  }
}
