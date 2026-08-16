import { requireMugSoundAccess } from '@/lib/mugsound/access'

export default async function MugSoundApprovalsPage() {
  await requireMugSoundAccess(['approver'])
  return <section className="rounded-3xl border border-white/8 bg-[#111116] p-6"><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/70">Step 04</p><h2 className="mt-2 text-xl font-semibold text-white">공급 승인</h2><p className="mt-2 text-sm text-zinc-500">선별곡의 제목, Episode, Phase, 에너지, 온기, Bridge 적합성, QA 및 공급 상태를 확정합니다.</p><p className="mt-5 rounded-2xl bg-white/[0.035] p-4 text-sm text-zinc-500">실제 MugSound API 발행은 다음 단계입니다. MVP에서는 승인곡 패키지와 manifest 준비 상태까지만 관리합니다.</p></section>
}
