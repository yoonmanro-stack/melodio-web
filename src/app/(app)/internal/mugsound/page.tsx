import Link from 'next/link'
import { ArrowRight, AudioLines, CircleGauge, ClipboardCheck, FlaskConical, GitBranch, Layers3, ShieldCheck } from 'lucide-react'
import { MUGSOUND_CAFE_EPISODE_BLUEPRINTS } from '@/data/mugsound-cafe-blueprints'
import { MUGSOUND_DIRECTION_APPROVAL_BLUEPRINTS } from '@/data/mugsound-direction-approval-blueprints'

const episodeNames = new Map(MUGSOUND_CAFE_EPISODE_BLUEPRINTS.map((episode) => [episode.episodeId, episode.title]))
const requiredEpisodes = MUGSOUND_CAFE_EPISODE_BLUEPRINTS.filter((episode) => episode.priority === 'required')

export default function MugSoundSupplyOverviewPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="P0 Episodes" value="3" detail="90 · 90 · 120분 권장" icon={AudioLines} />
        <Metric label="Direction Batch" value="6" detail="Blueprint · A/B 12 candidates" icon={CircleGauge} />
        <Metric label="Approved Target" value="42–50" detail="Phase pool masters" icon={ShieldCheck} />
        <Metric label="Handoff" value="Sep 08" detail="Pilot Sep 15" icon={GitBranch} />
      </div>

      <section className="rounded-3xl border border-white/8 bg-[#111116] p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/70">MVP Workflow</p>
        <h2 className="mt-2 text-xl font-semibold text-white">공급 패키지 제작 4단계</h2>
        <p className="mt-2 text-sm text-zinc-500">고정 앨범을 만들지 않습니다. Phase별 승인 풀과 연결 정보를 확정하는 데 집중합니다.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <WorkflowStep number="01" title="Episode Blueprint" detail="Episode·Phase·에너지 목표" href="/internal/mugsound/blueprints" icon={Layers3} />
          <WorkflowStep number="02" title="생성 Batch" detail="Suno A/B와 attempt 이력" href="/internal/mugsound/batches" icon={FlaskConical} />
          <WorkflowStep number="03" title="후보 검수" detail="감정·연결성 중심 선별" href="/internal/mugsound/review" icon={ClipboardCheck} />
          <WorkflowStep number="04" title="공급 승인" detail="메타데이터와 승인 상태 확정" href="/internal/mugsound/approvals" icon={ShieldCheck} />
        </div>
      </section>

      <section className="rounded-3xl border border-white/8 bg-[#111116] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">Direction Approval Gate</p>
            <h2 className="mt-2 text-xl font-semibold text-white">오늘은 대표 Blueprint 6개만 생성</h2>
            <p className="mt-2 text-sm text-zinc-500">Episode별 Settle·Engage 방향을 먼저 승인한 뒤 대량 생성으로 전환합니다.</p>
          </div>
          <span className="w-fit rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-3 py-1.5 text-xs text-amber-200">Not submitted</span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {MUGSOUND_DIRECTION_APPROVAL_BLUEPRINTS.map((blueprint) => (
            <article key={blueprint.blueprintId} className="rounded-2xl border border-white/7 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-zinc-500">{episodeNames.get(blueprint.episodeId)}</p>
                  <h3 className="mt-1 text-sm font-medium text-zinc-100">{blueprint.workingTitle}</h3>
                </div>
                <span className="rounded-lg bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">{blueprint.phase}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                <span className="rounded-lg bg-white/[0.04] px-2 py-1">Energy {blueprint.targetEnergy}</span>
                <span className="rounded-lg bg-white/[0.04] px-2 py-1">Warmth {blueprint.targetWarmth}</span>
                <span className="rounded-lg bg-white/[0.04] px-2 py-1">{blueprint.targetBpm} BPM</span>
                <span className="rounded-lg bg-white/[0.04] px-2 py-1">{blueprint.targetDurationSeconds / 60} min</span>
              </div>
              {blueprint.bridgeDirection ? <p className="mt-3 flex items-center gap-2 text-[11px] text-amber-300/70"><ArrowRight className="h-3 w-3" />Bridge candidate · {blueprint.bridgeDirection}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {requiredEpisodes.map((episode) => (
          <article key={episode.episodeId} className="rounded-3xl border border-white/8 bg-[#111116] p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">{episode.episodeId}</p>
            <h2 className="mt-2 text-lg font-semibold text-white">{episode.title}</h2>
            <p className="mt-2 text-sm text-zinc-500">{episode.currentState} <ArrowRight className="mx-1 inline h-3 w-3" /> {episode.targetState}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-white/[0.035] p-3"><p className="text-zinc-600">권장 운용</p><p className="mt-1 text-zinc-200">{episode.recommendedDurationMinutes}분</p></div>
              <div className="rounded-xl bg-white/[0.035] p-3"><p className="text-zinc-600">승인 목표</p><p className="mt-1 text-zinc-200">{episode.approvedTrackTarget.min}–{episode.approvedTrackTarget.max}곡</p></div>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof AudioLines }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#111116] p-4">
      <div className="flex items-center justify-between"><p className="text-xs text-zinc-500">{label}</p><Icon className="h-4 w-4 text-amber-300/60" /></div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] text-zinc-600">{detail}</p>
    </div>
  )
}

function WorkflowStep({ number, title, detail, href, icon: Icon }: { number: string; title: string; detail: string; href: string; icon: typeof AudioLines }) {
  return (
    <Link href={href} className="group rounded-2xl border border-white/7 bg-black/20 p-4 transition hover:border-amber-300/25 hover:bg-amber-300/[0.04]">
      <div className="flex items-center justify-between"><span className="font-mono text-xs text-zinc-600">{number}</span><Icon className="h-4 w-4 text-zinc-500 transition group-hover:text-amber-300" /></div>
      <h3 className="mt-5 text-sm font-medium text-zinc-100">{title}</h3>
      <p className="mt-1 text-xs text-zinc-600">{detail}</p>
    </Link>
  )
}
