import type { ArtistInput, ArtistProfile, ArtistVoiceKind } from '@/lib/artists/types'
import type { VoiceItem } from '@/contexts/VoiceContext'

export type ArtistDraft = Omit<ArtistInput, 'genres'> & { genresText: string }
export type ArtistVoiceChoice = { key: string; kind: ArtistVoiceKind; referenceId: string; voice: VoiceItem }

export const FIELD_CLASS = 'mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-purple-400 disabled:opacity-60'

export function newArtistDraft(): ArtistDraft {
  return { name: '', tagline: '', description: '', genresText: '', personality: '', backstory: '', speakingStyle: '', visualDirection: '', voice: null, portrait: null,
    checks: { voiceAuditioned: false, portraitReviewed: false, identityReviewed: false }, status: 'draft' }
}

export function artistToDraft(artist: ArtistProfile): ArtistDraft {
  return { name: artist.name, tagline: artist.tagline, description: artist.description, genresText: artist.genres.join(', '), personality: artist.personality, backstory: artist.backstory,
    speakingStyle: artist.speakingStyle, visualDirection: artist.visualDirection, voice: artist.voice ? { kind: artist.voice.kind, referenceId: artist.voice.referenceId } : null,
    portrait: artist.portrait, checks: artist.checks, status: artist.status }
}

export function artistInput(form: ArtistDraft): ArtistInput {
  const { genresText, ...fields } = form
  return { ...fields, name: fields.name.trim(), genres: genresText.split(/[,，]/).map(value => value.trim()).filter(Boolean) }
}

/** Display only durable solo voice references, never a legacy prompt recipe. */
export function artistVoiceChoice(voice: VoiceItem): ArtistVoiceChoice | null {
  if (voice.gender !== 'female' && voice.gender !== 'male') return null
  if (voice.previewStatus === 'pending' || voice.reuseStatus === 'pending') return null
  const kind = voice.customVoiceId ? 'custom' : voice.designedVoiceId ? 'designed' : voice.discoveryVoiceId ? 'discovery' : voice.officialVoiceId ? 'official' : null
  const referenceId = voice.customVoiceId || voice.designedVoiceId || voice.discoveryVoiceId || voice.officialVoiceId
  if (!kind || !referenceId) return null
  if (kind === 'discovery' && (voice.reuseStatus !== 'ready' || voice.previewStatus !== 'ready')) return null
  return { key: `${kind}:${referenceId}`, kind, referenceId, voice }
}

export const VOICE_KIND_LABELS: Record<ArtistVoiceKind, string> = { official: '멜로디오 보컬', discovery: '탐색 보컬', designed: '내가 설계한 보컬', custom: '등록 목소리' }

export function readyRequirements(form: ArtistDraft): string[] {
  const missing: string[] = []
  if (!form.name.trim()) missing.push('가수 이름')
  if (!form.personality.trim()) missing.push('성격과 매력')
  if (!form.voice) missing.push('보컬 선택')
  if (!form.portrait) missing.push('참조 사진')
  if (!form.visualDirection.trim()) missing.push('외형과 비주얼 방향')
  if (!form.checks.voiceAuditioned) missing.push('보컬 확인')
  if (!form.checks.portraitReviewed) missing.push('참조 사진 확인')
  if (!form.checks.identityReviewed) missing.push('정체성 확인')
  return missing
}

export async function artistResponse<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) throw new Error('로그인한 뒤 아티스트를 불러오고 저장할 수 있습니다.')
    if (response.status === 409 && value?.code === 'artist_conflict') throw new Error('다른 화면에서 저장된 내용이 변경되었습니다. 저장된 내용을 다시 불러온 뒤 편집해 주세요.')
    const message = value && typeof value.error === 'string' ? value.error : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    throw new Error(message)
  }
  if (!value || typeof value !== 'object') throw new Error('저장소 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  return value as T
}
