import catalog from '@/data/discoveryVoices.json'
import officialCatalog from '@/data/officialVocalCatalog.json'

type Body = Record<string, any>
const menus = new Set(['style-library', 'preset-studio', 'audio-forge', 'audio', 'japan', 'voice-discovery-sample'])

function selectedId(body: Body, field: string) {
  const direct = body[field]
  const nested = body.activeVoice?.[field]
  if (direct != null && nested != null && direct !== nested) throw new Error('보컬 선택값이 서로 다릅니다. 다시 선택해 주세요.')
  const id = nested ?? direct
  if (id != null && (typeof id !== 'string' || !id.trim())) throw new Error('보컬 선택값이 올바르지 않습니다.')
  return id
}

/** A request may bind exactly one catalog persona or one owned voice. */
export function assertExclusiveVoiceSelection(body: Body) {
  const official = selectedId(body, 'officialVoiceId')
    ?? (officialCatalog.some(voice => voice.id === body.activeVoice?.id) ? body.activeVoice.id : undefined)
  const discovery = selectedId(body, 'discoveryVoiceId')
    ?? (catalog.some(voice => voice.id === body.activeVoice?.id) ? body.activeVoice.id : undefined)
  const custom = selectedId(body, 'customVoiceId')
  const designed = selectedId(body, 'designedVoiceId')
  if ([official, discovery, custom, designed].filter(id => id != null).length > 1) {
    throw new Error('멜로디오 보컬, 탐색 보컬, 저장한 디자인, 등록 목소리 중 하나만 선택해 주세요.')
  }
}

/** Public identity only. Browser prompts and provider IDs never establish a binding. */
export function resolveDiscoveryVoice(body: Body) {
  if (body.isInstrumental || ['mixed', 'random', 'duet'].includes(body.vocalGender)) return null
  assertExclusiveVoiceSelection(body)
  const id = selectedId(body, 'discoveryVoiceId')
    ?? (catalog.some(voice => voice.id === body.activeVoice?.id) ? body.activeVoice.id : undefined)
  if (id == null) return null
  const voice = catalog.find(item => item.id === id)
  if (!voice) throw new Error('선택한 탐색 보컬을 찾을 수 없습니다. 다시 선택해 주세요.')
  if (body.vocalGender !== voice.gender) throw new Error('선택한 탐색 보컬과 보컬 성별이 다릅니다. 다시 선택해 주세요.')
  if (!menus.has(body.sourceMenu)) throw new Error('탐색 보컬은 뮤직·프리셋·일본 BGM 스튜디오에서 사용해 주세요.')
  const model = String(body.sunoVersion || 'V6').toUpperCase().replace(/[ .-]+/g, '_')
  if (model !== 'V6') throw new Error('탐색 보컬은 Suno V6에서 사용해 주세요.')
  if (typeof body.lyricsPrompt !== 'string' || !body.lyricsPrompt.trim()) throw new Error('탐색 보컬을 사용하려면 가사를 먼저 준비해 주세요.')
  // A ready flag cannot turn a legacy speech sample or an official audition into Discovery audio.
  if (voice.previewStatus !== 'ready' || !/^\/assets\/voices\/discovery(?:-[A-Za-z0-9-]+)?\/[A-Za-z0-9_-]+\.(?:mp3|wav|m4a|webm|ogg)$/.test(voice.audioUrl || '')) {
    throw new Error('discovery_voice_not_ready')
  }
  return voice
}
