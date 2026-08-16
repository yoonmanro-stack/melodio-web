import Link from 'next/link'
import { Boxes, ClipboardCheck, FlaskConical, Layers3, ShieldCheck } from 'lucide-react'
import { requireMugSoundAccess } from '@/lib/mugsound/access'

const internalNavigation = [
  { href: '/internal/mugsound', label: 'Overview', icon: Boxes },
  { href: '/internal/mugsound/blueprints', label: 'Episode Blueprint', icon: Layers3 },
  { href: '/internal/mugsound/batches', label: '생성 Batch', icon: FlaskConical },
  { href: '/internal/mugsound/review', label: '후보 검수', icon: ClipboardCheck },
  { href: '/internal/mugsound/approvals', label: '공급 승인', icon: ShieldCheck },
]

export default async function MugSoundInternalLayout({ children }: { children: React.ReactNode }) {
  const access = await requireMugSoundAccess()

  return (
    <section className="mx-auto min-h-full max-w-7xl px-3 pb-12 pt-4 sm:px-6">
      <header className="rounded-3xl border border-amber-300/15 bg-[linear-gradient(135deg,rgba(39,31,22,.96),rgba(14,14,20,.98))] p-5 shadow-2xl shadow-black/20 sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300/75">Internal Production</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">MugSound Supply Studio</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Episode의 감정 서사를 유지하면서 Conductor가 재편성할 수 있는 승인곡 패키지를 제작합니다.</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-xs text-zinc-400">
            <p className="text-zinc-500">Signed in</p>
            <p className="mt-1 text-zinc-200">{access.email || 'Internal operator'}</p>
            <p className="mt-1 uppercase tracking-wider text-amber-300/70">{access.roles.join(' · ')}</p>
          </div>
        </div>
        <nav className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {internalNavigation.map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3.5 py-2.5 text-xs text-zinc-300 transition hover:border-amber-300/25 hover:bg-amber-300/[0.06] hover:text-amber-100">
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mt-6">{children}</div>
    </section>
  )
}
