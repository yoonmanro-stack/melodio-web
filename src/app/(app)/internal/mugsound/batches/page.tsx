import { MUGSOUND_DIRECTION_APPROVAL_BLUEPRINTS } from '@/data/mugsound-direction-approval-blueprints'

export default function MugSoundBatchesPage() {
  return <section className="rounded-3xl border border-white/8 bg-[#111116] p-6"><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">Step 02</p><h2 className="mt-2 text-xl font-semibold text-white">생성 Batch</h2><p className="mt-2 text-sm text-zinc-500">방향 승인용 Blueprint {MUGSOUND_DIRECTION_APPROVAL_BLUEPRINTS.length}개 · Suno v5.5 A/B 후보 12개를 생성합니다.</p><div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4 text-sm text-amber-100/80">현재 상태: 제출 전 · 초기 DNA 승인 Batch</div></section>
}
