import { requireMugSoundAccess } from '@/lib/mugsound/access'
import { MUGSOUND_DIRECTION_APPROVAL_BLUEPRINTS } from '@/data/mugsound-direction-approval-blueprints'
import { DirectionCandidateReview } from '@/components/mugsound/DirectionCandidateReview'

export default async function MugSoundCandidateReviewPage() {
  await requireMugSoundAccess(['qa', 'approver'])
  return <section className="rounded-3xl border border-white/8 bg-[#111116] p-6"><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/70">Step 03</p><h2 className="mt-2 text-xl font-semibold text-white">후보 검수</h2><p className="mt-2 text-sm text-zinc-500">곡의 화려함보다 Episode 감정 적합성, Phase 역할, 5~8초 크로스페이드 연결 가능성을 평가합니다.</p><DirectionCandidateReview blueprints={MUGSOUND_DIRECTION_APPROVAL_BLUEPRINTS} /></section>
}
