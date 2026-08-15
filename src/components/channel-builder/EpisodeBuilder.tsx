'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Fingerprint,
  Gauge,
  Headphones,
  LoaderCircle,
  Music2,
  RefreshCw,
  Save,
  Sparkles,
  Waves,
} from 'lucide-react'
import type { EnergyCurve, TrackRole, VocalTolerance } from '@/types/channel-system'
import { ChannelBuilderApiError } from '@/lib/channel-system/channel-builder-client'
import {
  getEpisodeBuilderContext,
  saveEpisodeBlueprint,
} from '@/lib/channel-system/episode-blueprint-client'
import type { EpisodeBlueprintInput, EpisodeTrackDraft } from '@/lib/channel-system/episode-blueprint-input'
import type { EpisodeBuilderContext, SavedEpisodeBlueprint } from '@/lib/channel-system/episode-blueprint-service'

interface EpisodeBuilderProps { channelId: string }

const CURVES: Array<{ value: EnergyCurve; label: string; detail: string }> = [
  { value: 'flat', label: 'Steady', detail: '집중과 공간용, 변화 최소화' },
  { value: 'rise', label: 'Gentle Rise', detail: '서서히 활력을 높이는 흐름' },
  { value: 'fall', label: 'Soft Landing', detail: '긴장을 천천히 낮추는 흐름' },
  { value: 'arc', label: 'Emotional Arc', detail: '중반에 고조되고 편안히 회수' },
  { value: 'multi_arc', label: 'Cinematic Waves', detail: '여러 장면을 오가는 서사형' },
]

const TITLE_SEEDS = [
  '문을 여는 작은 빛', '유리창에 번진 온도', '천천히 익숙해지는 거리', '말없이 이어지는 장면',
  '오래 머문 잔향', '구름 사이의 푸른 틈', '조용히 움직이는 마음', '낮은 파도와 호흡',
  '잠시 멈춘 시계', '빛이 가장 깊어진 순간', '낯익은 골목의 표정', '바람이 바꾼 방향',
  '멀리서 돌아온 기억', '부드럽게 열린 밤', '다시 가까워지는 풍경', '희미한 별의 대답',
  '남겨 둔 한 모금', '끝나지 않은 산책', '집으로 향하는 불빛', '마지막 장면의 여운',
  '새벽 앞의 고요', '천천히 닫히는 하루', '다음 계절의 편지', '아직 따뜻한 자리',
  '창문 너머의 낮은 노래', '구름이 쉬어 간 자리', '작은 파문이 된 기억', '한 걸음 느린 오후',
  '골목 끝에 놓인 달빛', '우리만 알던 시간', '바람 뒤에 남은 향기', '조용한 마음의 지도',
  '어제보다 가까운 새벽', '비가 그친 뒤의 색', '책갈피 속의 풍경', '낮게 흐르는 별자리',
  '따뜻한 그림자의 끝', '마음이 쉬어 가는 곳', '천천히 밝아오는 창', '다시 시작될 계절',
]

const ROLE_LABELS: Record<TrackRole, string> = {
  opening: 'Opening', immersion: 'Immersion', steady: 'Steady', rise: 'Rise',
  peak: 'Peak', release: 'Release', reprise: 'Reprise', closing: 'Closing',
}

const INPUT = 'w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/10'

function vocalPercent(policy: VocalTolerance): number {
  return { none: 0, minimal: 10, allowed: 30, preferred: 50 }[policy]
}

function roleAt(index: number, count: number): TrackRole {
  if (index === 0) return 'opening'
  if (index === count - 1) return 'closing'
  const progress = index / Math.max(count - 1, 1)
  if (progress < 0.2) return 'immersion'
  if (progress < 0.42) return 'steady'
  if (progress < 0.58) return 'rise'
  if (progress < 0.7) return 'peak'
  if (progress < 0.88) return 'release'
  return 'reprise'
}

function energyAt(curve: EnergyCurve, progress: number, target: number): number {
  let offset = 0
  if (curve === 'rise') offset = (progress - 0.5) * 34
  if (curve === 'fall') offset = (0.5 - progress) * 34
  if (curve === 'arc') offset = Math.sin(progress * Math.PI) * 24 - 8
  if (curve === 'multi_arc') offset = Math.sin(progress * Math.PI * 4) * 14
  return Math.round(Math.min(100, Math.max(0, target + offset)))
}

function buildTracks(
  context: EpisodeBuilderContext,
  count: number,
  duration: number,
  curve: EnergyCurve,
  vocals: number,
): EpisodeTrackDraft[] {
  const music = context.dnaVersion.dna.music
  const baseDuration = Math.floor(duration / count)
  const vocalCount = Math.round(count * vocals / 100)
  const vocalSlots = new Set<number>()
  for (let index = 0; index < vocalCount; index += 1) {
    vocalSlots.add(Math.min(count - 1, Math.floor(((index + 1) * count) / (vocalCount + 1))))
  }

  return Array.from({ length: count }, (_, index) => {
    const progress = index / Math.max(count - 1, 1)
    const energy = energyAt(curve, progress, context.listenerIntent.targetEnergy)
    const [minBpm, maxBpm] = music.bpmRange
    const bpm = Math.round(minBpm + ((maxBpm - minBpm) * energy) / 100)
    const instrumental = !vocalSlots.has(index)
    return {
      trackNumber: index + 1,
      songTitle: TITLE_SEEDS[index % TITLE_SEEDS.length],
      role: roleAt(index, count),
      energy,
      bpm,
      musicalKey: music.preferredKeys[index % Math.max(music.preferredKeys.length, 1)] || '',
      leadInstrument: music.signatureInstruments[index % Math.max(music.signatureInstruments.length, 1)] || music.primaryGenre,
      supportInstruments: [],
      isInstrumental: instrumental,
      vocalGender: instrumental ? undefined : music.vocalGenders[0],
      lyricLanguage: instrumental ? undefined : music.lyricLanguages[0],
      lyricTheme: instrumental ? undefined : '이번 에피소드의 상황과 감정선을 고유한 장면으로 표현',
      narrativeBeat: `${ROLE_LABELS[roleAt(index, count)]} 구간`,
      arrangementVariation: `${index + 1}번 트랙만의 리듬·리드 악기 변주`,
      targetDurationSeconds: index === count - 1
        ? duration - (baseDuration * (count - 1))
        : baseDuration,
      stylePrompt: music.baseStylePrompt,
      excludePrompt: music.forbiddenProductionTraits.join(', ') || undefined,
    }
  })
}

function initialInput(context: EpisodeBuilderContext): EpisodeBlueprintInput {
  const duration = 7200
  const count = 20
  const curve = context.listenerIntent.targetEnergyCurve
  const vocals = vocalPercent(context.dnaVersion.dna.music.vocalPolicy)
  const situation = context.listenerIntent.activity
  return {
    dnaVersionId: context.dnaVersion.id,
    listenerIntentProfileId: context.listenerIntent.id,
    energyCurve: curve,
    episode: {
      episodeTitle: `${context.channel.name} — ${situation}`,
      situation,
      location: context.listenerIntent.environment,
      daypart: context.listenerIntent.dayparts[0] || '늦은 오후',
      season: '',
      weather: '',
      emotionalArc: `${context.listenerIntent.currentState}에서 ${context.listenerIntent.desiredState}로 자연스럽게 이동`,
      listenerIntentOverrides: { targetEnergyCurve: curve },
      accentPresets: [],
      targetDurationSeconds: duration,
      plannedTrackCount: count,
      vocalTrackPercent: vocals,
    },
    tracks: buildTracks(context, count, duration, curve, vocals),
  }
}

export function EpisodeBuilder({ channelId }: EpisodeBuilderProps) {
  const [context, setContext] = useState<EpisodeBuilderContext | null>(null)
  const [input, setInput] = useState<EpisodeBlueprintInput | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedEpisodeBlueprint | null>(null)
  const [isSaving, startSaving] = useTransition()

  useEffect(() => {
    const controller = new AbortController()
    getEpisodeBuilderContext(channelId, controller.signal)
      .then((result) => {
        setContext(result)
        setInput(initialInput(result))
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadError(error instanceof Error ? error.message : 'Channel DNA를 불러오지 못했습니다.')
      })
    return () => controller.abort()
  }, [channelId])

  if (loadError) {
    return <StatePanel title="Episode Builder를 열 수 없습니다" detail={loadError} />
  }
  if (!context || !input) {
    return <StatePanel title="Channel DNA를 불러오는 중" detail="최신 DNA 버전과 Listener Intent를 연결하고 있습니다." loading />
  }

  const rebuildTracks = (changes: Partial<Pick<EpisodeBlueprintInput, 'energyCurve'>> & { count?: number; duration?: number; vocals?: number }) => {
    setInput((current) => {
      if (!current) return current
      const curve = changes.energyCurve ?? current.energyCurve
      const count = changes.count ?? current.episode.plannedTrackCount
      const duration = changes.duration ?? current.episode.targetDurationSeconds
      const vocals = changes.vocals ?? current.episode.vocalTrackPercent
      return {
        ...current,
        energyCurve: curve,
        episode: {
          ...current.episode,
          plannedTrackCount: count,
          targetDurationSeconds: duration,
          vocalTrackPercent: vocals,
          listenerIntentOverrides: { targetEnergyCurve: curve },
        },
        tracks: buildTracks(context, count, duration, curve, vocals),
      }
    })
    setSaved(null)
  }

  const updateEpisode = <K extends keyof EpisodeBlueprintInput['episode']>(
    key: K,
    value: EpisodeBlueprintInput['episode'][K],
  ) => setInput((current) => current ? {
    ...current,
    episode: { ...current.episode, [key]: value },
  } : current)

  const updateTrack = (index: number, changes: Partial<EpisodeTrackDraft>) => {
    setInput((current) => current ? {
      ...current,
      tracks: current.tracks.map((track, trackIndex) => (
        trackIndex === index ? { ...track, ...changes } : track
      )),
    } : current)
    setSaved(null)
  }

  const save = () => {
    setSaveError(null)
    startSaving(async () => {
      try {
        setSaved(await saveEpisodeBlueprint(channelId, input))
      } catch (error) {
        if (error instanceof ChannelBuilderApiError) {
          const field = error.details.field ? ` (${error.details.field})` : ''
          setSaveError(`${error.message}${field}`)
        } else {
          setSaveError('Episode 저장 중 연결 오류가 발생했습니다.')
        }
      }
    })
  }

  const durationMinutes = Math.round(input.episode.targetDurationSeconds / 60)

  return (
    <div className="mx-auto min-h-full w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div className="max-w-3xl">
          <Link href="/channel-builder" className="mb-4 inline-flex items-center gap-2 text-xs text-zinc-500 transition hover:text-zinc-200"><ArrowLeft className="h-3.5 w-3.5" /> Channel Builder</Link>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300"><Waves className="h-4 w-4" /> Episode Blueprint</div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">첫 번째 2시간의 흐름을 설계하세요</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">Channel DNA는 그대로 유지한 채, 이번 업로드만의 상황과 감정 곡선, 곡별 역할을 설계합니다.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge icon={Fingerprint} label={`DNA v${context.dnaVersion.version}`} />
          <Badge icon={Clock3} label={`${durationMinutes}분`} />
          <Badge icon={Music2} label={`${input.tracks.length} Tracks`} />
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] p-5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">Locked Channel DNA</span>
            <h2 className="mt-3 text-lg font-semibold text-white">{context.channel.name}</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-400">{context.channel.promise}</p>
            <dl className="mt-5 space-y-3 border-t border-white/8 pt-4 text-xs">
              <Info label="Genre" value={context.dnaVersion.dna.music.primaryGenre} />
              <Info label="BPM Range" value={`${context.dnaVersion.dna.music.bpmRange[0]}–${context.dnaVersion.dna.music.bpmRange[1]}`} />
              <Info label="Vocal" value={context.dnaVersion.dna.music.vocalPolicy} />
              <Info label="Intent" value={context.listenerIntent.primaryPurpose} />
            </dl>
          </section>
          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200"><Headphones className="h-4 w-4 text-cyan-300" /> 청취 결과</div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">{context.listenerIntent.currentState}</p>
            <div className="my-2 h-5 border-l border-dashed border-cyan-400/30" />
            <p className="text-xs leading-5 text-cyan-200/80">{context.listenerIntent.desiredState}</p>
          </section>
        </aside>

        <main className="space-y-5">
          <section className="rounded-3xl border border-white/10 bg-[#111118]/85 p-5 backdrop-blur-xl sm:p-7">
            <SectionTitle number="01" title="Episode Scene" detail="이번 업로드만의 구체적인 장면을 정의합니다." />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="업로드 제목" wide><input className={INPUT} value={input.episode.episodeTitle} onChange={(event) => updateEpisode('episodeTitle', event.target.value)} /></Field>
              <Field label="상황"><input className={INPUT} value={input.episode.situation} onChange={(event) => updateEpisode('situation', event.target.value)} /></Field>
              <Field label="장소"><input className={INPUT} value={input.episode.location} onChange={(event) => updateEpisode('location', event.target.value)} /></Field>
              <Field label="시간대"><input className={INPUT} value={input.episode.daypart} onChange={(event) => updateEpisode('daypart', event.target.value)} /></Field>
              <Field label="계절"><input className={INPUT} placeholder="예: 초가을" value={input.episode.season || ''} onChange={(event) => updateEpisode('season', event.target.value)} /></Field>
              <Field label="날씨"><input className={INPUT} placeholder="예: 잔잔한 비" value={input.episode.weather || ''} onChange={(event) => updateEpisode('weather', event.target.value)} /></Field>
              <Field label="감정 이동" wide><textarea className={`${INPUT} min-h-24 resize-y`} value={input.episode.emotionalArc} onChange={(event) => updateEpisode('emotionalArc', event.target.value)} /></Field>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#111118]/85 p-5 backdrop-blur-xl sm:p-7">
            <SectionTitle number="02" title="Energy & Format" detail="2시간 전체에서 청취자의 에너지가 움직이는 방식입니다." />
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {CURVES.map((curve) => (
                <button key={curve.value} type="button" onClick={() => rebuildTracks({ energyCurve: curve.value })} className={`rounded-xl border p-3 text-left transition ${input.energyCurve === curve.value ? 'border-cyan-400/50 bg-cyan-400/10' : 'border-white/8 bg-black/10 hover:border-white/20'}`}>
                  <span className={`text-xs font-semibold ${input.energyCurve === curve.value ? 'text-cyan-200' : 'text-zinc-300'}`}>{curve.label}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-zinc-500">{curve.detail}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 flex h-28 items-end gap-1 rounded-2xl border border-white/8 bg-black/20 p-4" aria-label="에너지 곡선 미리보기">
              {input.tracks.map((track) => <div key={track.trackNumber} className="min-w-0 flex-1 rounded-t-sm bg-gradient-to-t from-violet-600 to-cyan-300 transition-all" style={{ height: `${Math.max(8, track.energy)}%` }} title={`${track.trackNumber}: ${track.energy}`} />)}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Field label="최종 승인 목표"><select className={INPUT} value={input.episode.plannedTrackCount} onChange={(event) => rebuildTracks({ count: Number(event.target.value) })}><option value={2}>2곡</option><option value={10}>10곡</option><option value={20}>20곡</option><option value={30}>30곡</option><option value={40}>40곡</option></select></Field>
              <Field label="전체 길이"><select className={INPUT} value={input.episode.targetDurationSeconds} onChange={(event) => rebuildTracks({ duration: Number(event.target.value) })}><option value={5400}>90분</option><option value={7200}>120분</option><option value={10800}>180분</option></select></Field>
              <Field label="보컬 비율"><select className={INPUT} value={input.episode.vocalTrackPercent} onChange={(event) => rebuildTracks({ vocals: Number(event.target.value) })}><option value={0}>Instrumental only</option><option value={10}>10%</option><option value={30}>30%</option><option value={50}>50%</option></select></Field>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#111118]/85 p-5 backdrop-blur-xl sm:p-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <SectionTitle number="03" title="Track Blueprint" detail="각 곡은 같은 DNA 안에서 서로 다른 역할과 제목을 가집니다." />
              <button type="button" onClick={() => rebuildTracks({})} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-white"><RefreshCw className="h-3.5 w-3.5" /> 편성 초기화</button>
            </div>
            <div className="mt-6 space-y-2">
              {input.tracks.map((track, index) => (
                <article key={track.trackNumber} className="[content-visibility:auto] [contain-intrinsic-size:76px] grid gap-3 rounded-xl border border-white/8 bg-black/10 p-3 transition focus-within:border-white/20 lg:grid-cols-[44px_minmax(180px,1fr)_110px_80px_90px_minmax(130px,0.65fr)] lg:items-center">
                  <span className="text-center font-mono text-xs text-zinc-600">{String(track.trackNumber).padStart(2, '0')}</span>
                  <input aria-label={`${track.trackNumber}번 곡 제목`} className={`${INPUT} py-2.5`} value={track.songTitle} onChange={(event) => updateTrack(index, { songTitle: event.target.value })} />
                  <select aria-label={`${track.trackNumber}번 곡 역할`} className={`${INPUT} py-2.5`} value={track.role} onChange={(event) => updateTrack(index, { role: event.target.value as TrackRole })}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  <label className="text-[10px] text-zinc-500">ENERGY<input type="number" min={0} max={100} className={`${INPUT} mt-1 py-2`} value={track.energy} onChange={(event) => updateTrack(index, { energy: Number(event.target.value) })} /></label>
                  <label className="text-[10px] text-zinc-500">BPM<input type="number" min={20} max={300} className={`${INPUT} mt-1 py-2`} value={track.bpm} onChange={(event) => updateTrack(index, { bpm: Number(event.target.value) })} /></label>
                  <input aria-label={`${track.trackNumber}번 리드 악기`} className={`${INPUT} py-2.5`} value={track.leadInstrument} onChange={(event) => updateTrack(index, { leadInstrument: event.target.value })} />
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-emerald-400/15 bg-gradient-to-r from-emerald-500/[0.07] to-cyan-500/[0.04] p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-emerald-300" /> Episode Plan Ready</div>
                <p className="mt-2 text-xs leading-5 text-zinc-400">저장 시 Episode는 Planned, 각 트랙은 Draft 상태가 됩니다. 아직 유료 음악 생성 비용은 발생하지 않습니다.</p>
                {saveError ? <p role="alert" className="mt-3 text-xs text-red-300">{saveError}</p> : null}
                {saved ? <div className="mt-3"><p className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {saved.trackBlueprintIds.length}개 Track Blueprint 저장 완료 · {saved.episodeId}</p><Link href={`/channel-builder/${channelId}/episodes/${saved.episodeId}/review`} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-200">{saved.trackBlueprintIds.length}곡 Review 시작 <ArrowLeft className="h-3.5 w-3.5 rotate-180" /></Link></div> : null}
              </div>
              <button type="button" disabled={isSaving || Boolean(saved)} onClick={save} className="inline-flex min-w-48 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200 disabled:cursor-default disabled:opacity-60"><Save className="h-4 w-4" /> {isSaving ? '계획 저장 중…' : saved ? 'Episode 저장 완료' : 'Episode Blueprint 저장'}</button>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

function StatePanel({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) {
  return <div className="mx-auto mt-20 max-w-lg rounded-2xl border border-white/10 bg-[#111118] p-8 text-center">{loading ? <LoaderCircle className="mx-auto mb-4 h-6 w-6 animate-spin text-violet-300" /> : null}<h1 className="text-lg font-semibold text-white">{title}</h1><p className="mt-2 text-sm leading-6 text-zinc-500">{detail}</p><Link href="/channel-builder" className="mt-5 inline-flex items-center gap-2 text-sm text-violet-300"><ArrowLeft className="h-4 w-4" /> Channel Builder로 돌아가기</Link></div>
}

function Badge({ icon: Icon, label }: { icon: typeof Gauge; label: string }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-zinc-300"><Icon className="h-3.5 w-3.5 text-cyan-300" />{label}</span>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-zinc-600">{label}</dt><dd className="text-right text-zinc-300">{value}</dd></div>
}

function SectionTitle({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div><span className="text-[10px] font-semibold tracking-[0.2em] text-violet-300">{number}</span><h2 className="mt-1 text-lg font-semibold text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p></div>
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? 'md:col-span-2' : ''}><span className="mb-2 block text-xs font-medium text-zinc-400">{label}</span>{children}</label>
}
