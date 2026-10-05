import type { ArtistGenerationSnapshot, ArtistProfile, ArtistVoiceReference } from './types'

type GenerationBody = Record<string, unknown>
type ArtistGenerationDependencies = {
  readArtist: (userId: string, id: string) => Promise<ArtistProfile | null>
  resolveVoice: (userId: string, voice: Pick<ArtistVoiceReference, 'kind' | 'referenceId'>) => Promise<ArtistVoiceReference>
}

const ARTIST_MENUS = new Set(['style-library', 'preset-studio', 'audio-forge', 'audio', 'japan'])
const VOICE_FIELDS = ['activeVoice', 'voicePrompt', 'vdCode', 'officialVoiceId', 'discoveryVoiceId', 'designedVoiceId', 'customVoiceId', 'personaId', 'providerPersonaId', 'voiceId'] as const
const REFERENCE_FIELDS = { official: 'officialVoiceId', discovery: 'discoveryVoiceId', designed: 'designedVoiceId', custom: 'customVoiceId' } as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ArtistGenerationError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) {
    super(message)
    this.name = 'ArtistGenerationError'
  }
}

export function hasArtistSelection(body: GenerationBody): boolean {
  return body.artistId != null || body.artistRevision != null
}

/** Resolve an owned, reviewed identity before any metadata or music provider call. */
export async function resolveArtistGeneration(body: GenerationBody, userId: string | null, dependencies: ArtistGenerationDependencies): Promise<ArtistGenerationSnapshot | null> {
  if (!hasArtistSelection(body)) return null
  if (!userId) throw new ArtistGenerationError('artist_auth_required', '아티스트로 작곡하려면 로그인이 필요합니다.', 401)
  if (typeof body.artistId !== 'string' || !UUID.test(body.artistId) || typeof body.artistRevision !== 'number' || !Number.isSafeInteger(body.artistRevision) || body.artistRevision < 0) {
    throw new ArtistGenerationError('artist_selection_invalid', '아티스트 선택 정보가 올바르지 않습니다. 다시 선택해 주세요.')
  }
  if (typeof body.sourceMenu !== 'string' || !ARTIST_MENUS.has(body.sourceMenu) || body.queueItemId || body.voiceDesign != null) {
    throw new ArtistGenerationError('artist_menu_incompatible', '아티스트는 뮤직·프리셋·일본 BGM 스튜디오에서 선택해 주세요.')
  }
  if (body.engine === 'lyria3' || String(body.sunoVersion || '').toUpperCase().replace(/[ .-]+/g, '_') !== 'V6') {
    throw new ArtistGenerationError('artist_model_incompatible', '선택한 아티스트는 Suno V6에서 작곡할 수 있습니다.')
  }
  const selections = body.selections as { vocal?: unknown } | null | undefined
  const vocalSelections = Array.isArray(selections?.vocal) ? selections.vocal : []
  const hasMultipleVoices = vocalSelections.some((value: unknown) => typeof value === 'string' && /duet|duo|mixed|random|듀엣|랜덤|혼성/i.test(value))
    || /\b(?:duet|duo|mixed vocals?|male and female)\b/i.test(String(body.stylePrompt || ''))
  if (body.isInstrumental || typeof body.vocalGender !== 'string' || !['female', 'male'].includes(body.vocalGender) || hasMultipleVoices) {
    throw new ArtistGenerationError('artist_vocal_mode_incompatible', '선택한 아티스트는 솔로 보컬곡에 적용됩니다. 연주곡·듀엣·랜덤 보컬을 사용하려면 아티스트 선택을 해제해 주세요.')
  }
  const artist = await dependencies.readArtist(userId, body.artistId)
  if (!artist || artist.userId !== userId || artist.id !== body.artistId) {
    throw new ArtistGenerationError('artist_not_found', '선택한 아티스트를 찾을 수 없습니다. 내 아티스트를 다시 선택해 주세요.', 404)
  }
  if (artist.revision !== body.artistRevision) {
    throw new ArtistGenerationError('artist_revision_stale', '아티스트 정보가 변경되었습니다. 최신 아티스트를 다시 선택해 주세요.', 409)
  }
  if (artist.status !== 'ready' || !artist.voice || !artist.portrait || !artist.checks.voiceAuditioned || !artist.checks.portraitReviewed || !artist.checks.identityReviewed) {
    throw new ArtistGenerationError('artist_not_ready', '작곡 준비가 완료된 아티스트를 선택해 주세요.', 409)
  }
  let voice: ArtistVoiceReference
  try { voice = await dependencies.resolveVoice(userId, artist.voice) }
  catch {
    throw new ArtistGenerationError('artist_voice_unavailable', '아티스트의 목소리가 현재 준비되지 않았습니다. 아티스트 작업실에서 연결을 확인해 주세요.', 409)
  }
  if (voice.kind !== artist.voice.kind || voice.referenceId !== artist.voice.referenceId || voice.gender !== artist.voice.gender || voice.language !== artist.voice.language) {
    throw new ArtistGenerationError('artist_voice_changed', '아티스트의 목소리 정보가 변경되었습니다. 아티스트 작업실에서 확인 후 다시 선택해 주세요.', 409)
  }
  if (body.vocalGender !== voice.gender) {
    throw new ArtistGenerationError('artist_gender_mismatch', '아티스트와 선택한 보컬 성별이 다릅니다. 아티스트의 솔로 보컬 설정을 사용해 주세요.')
  }
  if (body.lyricsLanguage !== voice.language || (body.sourceMenu === 'japan' && !['en', 'ja'].includes(voice.language))) {
    throw new ArtistGenerationError('artist_language_mismatch', '아티스트의 가창 언어와 가사 언어가 다릅니다. 가사 언어를 맞추거나 다른 아티스트를 선택해 주세요.')
  }

  // A global voice or a browser-supplied provider identity cannot replace the artist.
  for (const field of VOICE_FIELDS) delete body[field]
  const referenceField = REFERENCE_FIELDS[voice.kind]
  body[referenceField] = voice.referenceId
  body.activeVoice = { id: voice.referenceId, [referenceField]: voice.referenceId, gender: voice.gender, language: voice.language }
  const snapshot: ArtistGenerationSnapshot = {
    id: artist.id, name: artist.name, revision: artist.revision, voice: { ...voice }, portrait: { ...artist.portrait },
    tagline: artist.tagline, personality: artist.personality, visualDirection: artist.visualDirection,
  }
  return snapshot
}
