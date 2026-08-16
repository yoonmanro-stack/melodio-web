import { MUGSOUND_CAFE_EPISODE_BLUEPRINTS } from '@/data/mugsound-cafe-blueprints'
import { MUGSOUND_REQUIRED_EPISODE_PRODUCTION } from '@/data/mugsound-production-plan'

export default function MugSoundBlueprintsPage() {
  const required = MUGSOUND_CAFE_EPISODE_BLUEPRINTS.filter((episode) => episode.priority === 'required')
  return (
    <section className="space-y-4">
      <header><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">Step 01</p><h2 className="mt-2 text-xl font-semibold text-white">Episode Blueprint</h2><p className="mt-2 text-sm text-zinc-500">제목보다 Episode, Phase, 에너지 목표를 먼저 확정합니다.</p></header>
      <div className="grid gap-4 xl:grid-cols-3">
        {required.map((episode) => {
          const production = MUGSOUND_REQUIRED_EPISODE_PRODUCTION.find((item) => item.episodeId === episode.episodeId)
          return <article key={episode.episodeId} className="rounded-3xl border border-white/8 bg-[#111116] p-5"><p className="text-xs text-zinc-600">{episode.episodeId}</p><h3 className="mt-2 text-lg font-semibold text-white">{episode.title}</h3><p className="mt-2 text-sm text-zinc-500">{episode.emotionalArc.join(' → ')}</p><div className="mt-5 space-y-2">{production?.phaseQuotas.map((quota) => <div key={quota.phase} className="flex items-center justify-between rounded-xl bg-white/[0.035] px-3 py-2 text-xs"><span className="capitalize text-zinc-300">{quota.phase}</span><span className="text-zinc-600">{quota.targetUniqueMasters}곡 · E {quota.targetEnergyRange[0]}–{quota.targetEnergyRange[1]}</span></div>)}</div></article>
        })}
      </div>
    </section>
  )
}
