'use client'

import { FIELD_CLASS } from './artist-form'
import type { PersonaIdentity } from './artist-persona-state'

export function PersonaIdentityFields({ identity, onChange }: { identity: PersonaIdentity; onChange: (patch: Partial<PersonaIdentity>) => void }) {
  return <div className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm text-zinc-300">가수 이름 <span className="text-purple-300">*</span><input className={FIELD_CLASS} value={identity.name} maxLength={80} placeholder="가수를 부를 이름" onChange={event => onChange({ name: event.target.value })} /></label>
      <label className="block text-sm text-zinc-300">한 줄 소개<input className={FIELD_CLASS} value={identity.tagline} maxLength={160} placeholder="이 가수의 매력을 한 문장으로" onChange={event => onChange({ tagline: event.target.value })} /></label>
    </div>
    <label className="block text-sm text-zinc-300">가수 소개<textarea className={FIELD_CLASS} value={identity.description} rows={3} maxLength={1200} placeholder="어떤 음악을 누구에게 들려주고 싶은가요?" onChange={event => onChange({ description: event.target.value })} /></label>
    <label className="block text-sm text-zinc-300">대표 장르<input className={FIELD_CLASS} value={identity.genresText} maxLength={500} placeholder="팝, R&B, 어쿠스틱 발라드" onChange={event => onChange({ genresText: event.target.value })} /><span className="mt-1.5 block text-xs text-zinc-500">쉼표로 구분해 최대 8개를 입력하세요.</span></label>
    <label className="block text-sm text-zinc-300">성격과 매력<textarea className={FIELD_CLASS} value={identity.personality} rows={4} maxLength={2000} placeholder="이 가수의 성격, 감정과 음악을 대하는 태도를 직접 적어주세요." onChange={event => onChange({ personality: event.target.value })} /></label>
    <label className="block text-sm text-zinc-300">배경 이야기와 세계관<textarea className={FIELD_CLASS} value={identity.backstory} rows={5} maxLength={2000} placeholder="음악을 시작한 계기, 살아가는 세계와 노래에 담고 싶은 이야기를 적어주세요." onChange={event => onChange({ backstory: event.target.value })} /></label>
    <label className="block text-sm text-zinc-300">말투와 표현 방식<textarea className={FIELD_CLASS} value={identity.speakingStyle} rows={3} maxLength={800} placeholder="팬에게 말을 건네는 방식과 가사에서 드러나는 표현을 적어주세요." onChange={event => onChange({ speakingStyle: event.target.value })} /></label>
  </div>
}
