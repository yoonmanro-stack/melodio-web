'use client'

import type { ArtistDraft } from './artist-form'
import { FIELD_CLASS } from './artist-form'

export function ArtistProfileFields({ form, onChange }: { form: ArtistDraft; onChange: (patch: Partial<ArtistDraft>) => void }) {
  return <div className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm text-zinc-300">가수 이름 <span className="text-purple-300">*</span>
        <input className={FIELD_CLASS} value={form.name} maxLength={80} placeholder="이 가수를 부를 이름" onChange={event => onChange({ name: event.target.value })} />
      </label>
      <label className="block text-sm text-zinc-300">한 줄 소개
        <input className={FIELD_CLASS} value={form.tagline} maxLength={160} placeholder="예: 낮고 거친 음색으로 밤의 감정을 전하는 소울 보컬" onChange={event => onChange({ tagline: event.target.value })} />
      </label>
    </div>
    <label className="block text-sm text-zinc-300">소개
      <textarea className={FIELD_CLASS} value={form.description} rows={3} maxLength={1200} placeholder="어떤 음악을 누구에게 들려주고 싶은가요?" onChange={event => onChange({ description: event.target.value })} />
    </label>
    <label className="block text-sm text-zinc-300">대표 장르
      <input className={FIELD_CLASS} value={form.genresText} maxLength={500} placeholder="팝, R&B, 어쿠스틱 발라드" onChange={event => onChange({ genresText: event.target.value })} />
      <span className="mt-1.5 block text-xs text-zinc-500">쉼표로 구분해 최대 8개를 입력하세요.</span>
    </label>
    <label className="block text-sm text-zinc-300">성격과 매력의 방향 <span className="text-purple-300">*</span>
      <textarea className={FIELD_CLASS} value={form.personality} rows={2} maxLength={2000} placeholder="한두 문장으로 시작하세요. 예: 담담한 성격과 거친 저음, 무대에서 솔직하게 드러나는 감정" onChange={event => onChange({ personality: event.target.value })} />
    </label>
    <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs leading-relaxed text-zinc-400">여기서는 가수의 기본 방향을 정하고 보컬과 얼굴을 준비합니다. 자세한 배경 이야기와 말투는 아티스트 페르소나에서 이어서 다듬으세요.</p>
  </div>
}
