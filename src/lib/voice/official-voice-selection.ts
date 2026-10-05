import catalog from '@/data/officialVocalCatalog.json'
import { matchesStudioLanguage } from '@/lib/voice/studio-selection'

type Body = Record<string, any>
/** Resolve only public catalog data here; provider identity is server-only. */
export function resolveOfficialVoice(body: Body) {
  const id = body.activeVoice?.officialVoiceId ?? body.officialVoiceId
    ?? (catalog.some(v => v.id === body.activeVoice?.id) ? body.activeVoice.id : undefined)
  if (id == null) return null
  if (body.isInstrumental || ['mixed', 'random', 'duet'].includes(body.vocalGender)) return null
  if (typeof id !== 'string') throw new Error('보컬 선택값이 올바르지 않습니다.')
  const voice = catalog.find(v => v.id === id)
  if (!voice) throw new Error('선택한 멜로디오 보컬을 찾을 수 없습니다. 다시 선택해 주세요.')
  if (body.customVoiceId || body.activeVoice?.customVoiceId) throw new Error('멜로디오 보컬과 등록 목소리를 동시에 지정할 수 없습니다.')
  if (body.vocalGender !== voice.gender) throw new Error('선택한 보컬과 보컬 성별이 다릅니다. 다시 선택해 주세요.')
  if (body.lyricsLanguage != null && (typeof body.lyricsLanguage !== 'string'
    || !matchesStudioLanguage(voice.language, body.lyricsLanguage))) {
    throw new Error('선택한 보컬과 가사 언어가 다릅니다. 목소리를 다시 선택해 주세요.')
  }
  if (!['style-library', 'preset-studio', 'audio-forge', 'audio', 'japan'].includes(body.sourceMenu)) throw new Error('이 보컬은 뮤직·프리셋·일본 BGM 스튜디오에서 사용해 주세요.')
  const model = String(body.sunoVersion || 'V6').toUpperCase().replace(/[ .-]+/g, '_')
  if (['V6_MINI', 'V6_WILD'].includes(model)) throw new Error('샘플 기반 보컬은 Suno V6에서 사용해 주세요.')
  if (typeof body.lyricsPrompt !== 'string' || !body.lyricsPrompt.trim()) throw new Error('선택한 보컬을 사용하려면 가사를 먼저 준비해 주세요.')
  return voice
}
