'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Fingerprint,
  Headphones,
  LockKeyhole,
  LoaderCircle,
  Music2,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type { Preset } from '@/types'
import { adaptPresetToChannelDraft } from '@/lib/channel-system/legacy-adapters'
import {
  ChannelBuilderApiError,
  saveChannelDraft,
  type SavedChannelDraftResponse,
} from '@/lib/channel-system/channel-builder-client'
import type { LegacyPresetChannelDraft } from '@/lib/channel-system/legacy-adapters'

interface ChannelBuilderProps {
  presets: Preset[]
}

type PresetSource = 'all' | 'default' | 'library' | 'japan' | 'custom'
type ChannelPreset = Preset & { channelSource: Exclude<PresetSource, 'all'> }
interface PresetPlaybookRow {
  key_name: string
  title: string
  content: string | null
  category: string
  metadata: Record<string, unknown> | null
  updated_at: string
}

const STEPS = [
  { label: 'Concept Seed', description: '채널의 시작점', icon: Sparkles },
  { label: 'Listener Intent', description: '방문 목적 정의', icon: Headphones },
  { label: 'Channel DNA', description: '변하지 않을 규칙', icon: Fingerprint },
  { label: 'Review & Lock', description: '검토하고 저장', icon: ShieldCheck },
] as const

const PURPOSE_OPTIONS = [
  { value: 'recovery', label: '마음의 위로와 회복', detail: '긴장을 낮추고 편안한 상태로 전환' },
  { value: 'focus', label: '몰입과 생산성', detail: '방해 없이 공부와 업무를 지속' },
  { value: 'space_atmosphere', label: '공간의 분위기', detail: '카페·매장에 자연스러운 체류감 형성' },
  { value: 'movement', label: '이동과 감성 여행', detail: '운전과 이동의 리듬을 안정적으로 유지' },
  { value: 'memory_emotion', label: '추억과 감정', detail: '시대와 장면에 대한 정서적 회상' },
  { value: 'story_immersion', label: '서사와 세계관 몰입', detail: '한 편의 이야기처럼 끝까지 감상' },
] as const

const ATTENTION_OPTIONS = [
  { value: 'background', label: '완전한 배경음악' },
  { value: 'semi_background', label: '은은한 존재감' },
  { value: 'listening', label: '적극적 감상' },
  { value: 'immersive', label: '깊은 몰입' },
] as const

const PRESET_SOURCE_LABELS: Array<{ value: PresetSource; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'default', label: '기본' },
  { value: 'library', label: '프리셋 라이브러리' },
  { value: 'japan', label: '일본 BGM' },
  { value: 'custom', label: '내 프리셋' },
]
const PRESETS_PER_PAGE = 18
const PRESET_ASSET_BASE = 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3 text-sm font-medium text-zinc-200">
        {label}
        {hint ? <span className="text-xs font-normal text-zinc-500">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

const INPUT_CLASS = 'w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/10'
const SELECT_CLASS = `${INPUT_CLASS} [color-scheme:dark] [&>option]:bg-zinc-950 [&>option]:text-zinc-100`

function splitTags(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
}

function getPresetImage(preset: ChannelPreset): string | null {
  if (typeof preset.cardImage === 'string' && preset.cardImage) return preset.cardImage
  const metadata = preset.metadata && typeof preset.metadata === 'object' ? preset.metadata : {}
  if (typeof metadata.thumbnail_url === 'string' && metadata.thumbnail_url) return metadata.thumbnail_url
  if (Array.isArray(metadata.thumbnail_urls) && typeof metadata.thumbnail_urls[0] === 'string') return metadata.thumbnail_urls[0]
  if (preset.channelSource === 'default') return `${PRESET_ASSET_BASE}/${preset.id}.png`
  return null
}

export function ChannelBuilder({ presets }: ChannelBuilderProps) {
  const [step, setStep] = useState(0)
  const [selectedPresetId, setSelectedPresetId] = useState(presets[0]?.id ?? '')
  const [draft, setDraft] = useState<LegacyPresetChannelDraft | null>(() =>
    presets[0] ? adaptPresetToChannelDraft(presets[0]) : null,
  )
  const [saved, setSaved] = useState<SavedChannelDraftResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [availablePresets, setAvailablePresets] = useState<ChannelPreset[]>(() =>
    presets.map((preset) => ({ ...preset, channelSource: 'default' })),
  )
  const [presetQuery, setPresetQuery] = useState('')
  const [presetSource, setPresetSource] = useState<PresetSource>('all')
  const [presetPage, setPresetPage] = useState(1)
  const [isLoadingPresets, setIsLoadingPresets] = useState(true)
  const [presetLoadError, setPresetLoadError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true

    async function loadAvailablePresets() {
      const customPresets: ChannelPreset[] = []
      const japanPresetsPromise = import('@/components/japan-landing-client').then(({ jpPresets }) =>
        jpPresets.map((preset): ChannelPreset => ({
          ...preset,
          selections: {},
          customPrompt: preset.tags,
          channelSource: 'japan',
        })),
      )

      for (const storageKey of ['melodio_custom_presets', 'melodio_japan_custom_presets']) {
        try {
          const stored = localStorage.getItem(storageKey)
          const parsed: unknown = stored ? JSON.parse(stored) : []
          if (!Array.isArray(parsed)) continue
          for (const item of parsed) {
            if (!item || typeof item !== 'object') continue
            const preset = item as Preset
            if (!preset.id || !preset.name) continue
            customPresets.push({ ...preset, channelSource: 'custom' })
          }
        } catch {
          // A malformed local preset must not block the shared library.
        }
      }

      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data, error: loadError } = await supabase
          .from('curation_playbooks')
          .select('key_name,title,content,category,metadata,updated_at')
          .in('category', ['genre', 'curation', 'japan'])
          .order('updated_at', { ascending: false })

        if (loadError) throw loadError

        const dbPresets: ChannelPreset[] = ((data ?? []) as PresetPlaybookRow[]).flatMap((row) => {
          const metadata = row.metadata && typeof row.metadata === 'object'
            ? row.metadata as Record<string, unknown>
            : {}
          const label = `${row.key_name ?? ''} ${row.title ?? ''}`
          if (metadata.is_test === true || /(^|[\s_-])(test|demo|sample|테스트|샘플)([\s_-]|$)/i.test(label)) return []

          const content = row.content ?? ''
          const concept = content.match(/## 💡 핵심 컨셉\s*([\s\S]*?)(?=\n##|$)/)?.[1]?.trim()
          const fallbackDescription = content
            .split('\n')
            .find((line) => line.trim() && !line.startsWith('#') && !line.startsWith('---'))
            ?.trim()
          const isJapan = row.category === 'japan'

          return [{
            id: row.key_name,
            name: row.title,
            desc: String(metadata.description ?? metadata.desc ?? concept ?? fallbackDescription ?? row.title),
            emoji: String(metadata.emoji ?? (isJapan ? '🇯🇵' : '🎵')),
            gradient: String(metadata.gradient ?? 'linear-gradient(135deg, #4338ca, #7c3aed)'),
            selections: {},
            customPrompt: String(metadata.studio_grade_prompt ?? metadata.suno_tags ?? metadata.tags ?? metadata.moods ?? 'lofi, relaxing, chill'),
            lyricsTemplate: content,
            isDb: true,
            updated_at: row.updated_at,
            metadata,
            channelSource: isJapan ? 'japan' : 'library',
          }]
        })
        const japanPresets = await japanPresetsPromise

        const merged = new Map<string, ChannelPreset>()
        presets.forEach((preset) => merged.set(preset.id, { ...preset, channelSource: 'default' }))
        japanPresets.forEach((preset) => merged.set(preset.id, preset))
        dbPresets.forEach((preset) => merged.set(preset.id, preset))
        customPresets.forEach((preset) => merged.set(preset.id, preset))

        if (active) {
          setAvailablePresets([...merged.values()])
          setPresetLoadError(null)
        }
      } catch {
        if (active) {
          const merged = new Map<string, ChannelPreset>()
          presets.forEach((preset) => merged.set(preset.id, { ...preset, channelSource: 'default' }))
          const japanPresets = await japanPresetsPromise.catch(() => [])
          japanPresets.forEach((preset) => merged.set(preset.id, preset))
          customPresets.forEach((preset) => merged.set(preset.id, preset))
          setAvailablePresets([...merged.values()])
          setPresetLoadError('프리셋 라이브러리를 불러오지 못해 기본·내 프리셋만 표시합니다.')
        }
      } finally {
        if (active) setIsLoadingPresets(false)
      }
    }

    loadAvailablePresets()
    return () => { active = false }
  }, [presets])

  const presetCounts = useMemo(() => {
    const counts: Record<PresetSource, number> = { all: availablePresets.length, default: 0, library: 0, japan: 0, custom: 0 }
    availablePresets.forEach((preset) => { counts[preset.channelSource] += 1 })
    return counts
  }, [availablePresets])

  const visiblePresets = useMemo(() => {
    const query = presetQuery.trim().toLocaleLowerCase('ko-KR')
    return availablePresets.filter((preset) => {
      if (presetSource !== 'all' && preset.channelSource !== presetSource) return false
      if (!query) return true
      return [preset.name, preset.desc, preset.customPrompt]
        .some((value) => String(value ?? '').toLocaleLowerCase('ko-KR').includes(query))
    })
  }, [availablePresets, presetQuery, presetSource])

  const totalPresetPages = Math.max(1, Math.ceil(visiblePresets.length / PRESETS_PER_PAGE))
  const pagedPresets = useMemo(() => {
    const safePage = Math.min(presetPage, totalPresetPages)
    const start = (safePage - 1) * PRESETS_PER_PAGE
    return visiblePresets.slice(start, start + PRESETS_PER_PAGE)
  }, [presetPage, totalPresetPages, visiblePresets])
  const presetPageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(presetPage - 2, totalPresetPages - 4))
    const end = Math.min(totalPresetPages, start + 4)
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  }, [presetPage, totalPresetPages])

  if (!draft) {
    return <div className="p-10 text-center text-zinc-400">사용 가능한 프리셋이 없습니다.</div>
  }

  const choosePreset = (preset: Preset) => {
    setSelectedPresetId(preset.id)
    setDraft(adaptPresetToChannelDraft(preset))
    setSaved(null)
    setError(null)
  }

  const updateChannel = (field: 'channelName' | 'promise', value: string) => {
    setDraft((current) => current ? {
      ...current,
      channel: { ...current.channel, [field]: value },
      dna: {
        ...current.dna,
        identity: { ...current.dna.identity, [field]: value },
      },
    } : current)
  }

  const save = () => {
    setError(null)
    startTransition(async () => {
      try {
        setSaved(await saveChannelDraft(draft))
      } catch (caught) {
        if (caught instanceof ChannelBuilderApiError) {
          const field = caught.details.field ? ` (${caught.details.field})` : ''
          setError(`${caught.message}${field}`)
        } else {
          setError('저장 중 연결 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
        }
      }
    })
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-7xl px-3 pb-20 pt-4 sm:px-6 lg:px-8">
      <header className="mb-8 max-w-3xl">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
          <Fingerprint className="h-4 w-4" />
          Melodio Channel System
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          채널의 감성 DNA를 설계하세요
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
          프리셋에서 시작해 청취 목적과 변하지 않을 제작 원칙을 정하세요.
          채널의 정체성은 일관되게 유지하면서, 에피소드마다 새롭고 다양한 음악을 만들 수 있습니다.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {STEPS.map((item, index) => {
          const Icon = item.icon
          const active = index === step
          const complete = index < step || Boolean(saved)
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setStep(index)}
              className={`rounded-2xl border p-3 text-left transition sm:p-4 ${
                active
                  ? 'border-violet-400/50 bg-violet-500/10 shadow-[0_0_30px_rgba(124,58,237,0.12)]'
                  : 'border-white/8 bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${active ? 'bg-violet-500 text-white' : complete ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-zinc-500'}`}>
                  {complete && !active ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span>
                  <span className="block text-xs text-zinc-500">0{index + 1}</span>
                  <span className={`block text-sm font-medium ${active ? 'text-white' : 'text-zinc-300'}`}>{item.label}</span>
                </span>
              </div>
              <span className="mt-2 hidden text-xs text-zinc-500 sm:block">{item.description}</span>
            </button>
          )
        })}
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#111118]/85 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="border-b border-white/8 px-5 py-4 sm:px-7">
          <p className="text-xs font-medium text-violet-300">STEP {step + 1} OF {STEPS.length}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{STEPS[step].label}</h2>
          <p className="mt-1 text-sm text-zinc-500">{STEPS[step].description}</p>
        </div>

        <div className="p-5 sm:p-7">
          {step === 0 ? (
            <div>
              <div className="mb-5 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-4 text-sm leading-6 text-cyan-100/80">
                프리셋의 음악 스타일과 분위기를 Channel DNA 초안으로 변환합니다. 이후 단계에서
                채널 목적과 고정 범위를 직접 다듬을 수 있습니다.
              </div>
              <div className="mb-5 space-y-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="search"
                    value={presetQuery}
                    onChange={(event) => { setPresetQuery(event.target.value); setPresetPage(1) }}
                    placeholder="프리셋 이름·분위기·스타일 검색"
                    className={`${INPUT_CLASS} pl-11`}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_SOURCE_LABELS.map((source) => (
                    <button
                      key={source.value}
                      type="button"
                      onClick={() => { setPresetSource(source.value); setPresetPage(1) }}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${presetSource === source.value ? 'border-violet-400/50 bg-violet-500/15 text-violet-100' : 'border-white/10 bg-white/[0.025] text-zinc-400 hover:border-white/20 hover:text-zinc-200'}`}
                    >
                      {source.label} <span className="ml-1 text-[10px] opacity-60">{presetCounts[source.value]}</span>
                    </button>
                  ))}
                  {isLoadingPresets ? <span className="inline-flex items-center gap-1.5 px-2 text-xs text-zinc-500"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> 라이브러리 불러오는 중</span> : null}
                </div>
                {presetLoadError ? <p className="text-xs text-amber-300/80">{presetLoadError}</p> : null}
                {!isLoadingPresets ? <p className="text-xs text-zinc-500">총 {availablePresets.length}개 중 {visiblePresets.length}개 · {Math.min(presetPage, totalPresetPages)}/{totalPresetPages} 페이지</p> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pagedPresets.map((preset) => {
                  const selected = selectedPresetId === preset.id
                  const presetImage = getPresetImage(preset)
                  const fallbackGradient = preset.gradient.startsWith('linear-gradient') ? preset.gradient : 'linear-gradient(135deg, #27272a, #18181b)'
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => choosePreset(preset)}
                      className={`group relative min-h-44 [content-visibility:auto] [contain-intrinsic-size:176px] overflow-hidden rounded-2xl border p-5 text-left transition ${selected ? 'border-white/40 ring-2 ring-violet-500/40' : 'border-white/8 hover:-translate-y-0.5 hover:border-white/20'}`}
                      style={{
                        backgroundImage: presetImage ? `url(${JSON.stringify(presetImage)}), ${fallbackGradient}` : fallbackGradient,
                        backgroundPosition: 'center',
                        backgroundSize: 'cover',
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/5" />
                      <div className="relative flex h-full flex-col justify-between">
                        <div className="flex items-start justify-end gap-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-black/35 px-2 py-1 text-[10px] text-white/65">{PRESET_SOURCE_LABELS.find((source) => source.value === preset.channelSource)?.label}</span>
                            {selected ? <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-zinc-950"><Check className="h-4 w-4" /></span> : null}
                          </div>
                        </div>
                        <div className="mt-8">
                          <h3 className="font-semibold text-white">{preset.name}</h3>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/65">{preset.desc}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              {!isLoadingPresets && visiblePresets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center text-sm text-zinc-500">검색 조건에 맞는 프리셋이 없습니다.</div>
              ) : null}
              {!isLoadingPresets && visiblePresets.length > 0 ? (
                <nav className="mt-6 flex flex-wrap items-center justify-center gap-2" aria-label="프리셋 페이지 이동">
                  <button
                    type="button"
                    disabled={presetPage <= 1}
                    onClick={() => setPresetPage((page) => Math.max(1, page - 1))}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> 이전
                  </button>
                  {presetPageNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      aria-current={pageNumber === presetPage ? 'page' : undefined}
                      onClick={() => setPresetPage(pageNumber)}
                      className={`grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-xs transition ${pageNumber === presetPage ? 'border-violet-400/60 bg-violet-500/20 text-white' : 'border-white/10 text-zinc-400 hover:border-white/20 hover:bg-white/5 hover:text-white'}`}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={presetPage >= totalPresetPages}
                    onClick={() => setPresetPage((page) => Math.min(totalPresetPages, page + 1))}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/10 px-3 text-xs text-zinc-300 transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    다음 <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </nav>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-7 xl:grid-cols-[1.15fr_0.85fr]">
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-200">청취자가 이 채널을 방문하는 가장 큰 이유</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PURPOSE_OPTIONS.map((option) => {
                    const selected = draft.listenerIntent.primaryPurpose === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDraft((current) => current ? {
                          ...current,
                          listenerIntent: { ...current.listenerIntent, primaryPurpose: option.value },
                        } : current)}
                        className={`rounded-xl border p-4 text-left transition ${selected ? 'border-violet-400/50 bg-violet-500/10' : 'border-white/8 bg-black/10 hover:border-white/20'}`}
                      >
                        <span className={`text-sm font-medium ${selected ? 'text-violet-200' : 'text-zinc-200'}`}>{option.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-zinc-500">{option.detail}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-5">
                <Field label="대표 청취자" hint="누가 듣나요?">
                  <textarea className={`${INPUT_CLASS} min-h-24 resize-none`} value={draft.listenerIntent.listenerPersona} onChange={(event) => setDraft((current) => current ? { ...current, listenerIntent: { ...current.listenerIntent, listenerPersona: event.target.value } } : current)} />
                </Field>
                <Field label="주요 활동">
                  <input className={INPUT_CLASS} value={draft.listenerIntent.activity} onChange={(event) => setDraft((current) => current ? { ...current, listenerIntent: { ...current.listenerIntent, activity: event.target.value } } : current)} />
                </Field>
                <Field label="청취 환경">
                  <input className={INPUT_CLASS} value={draft.listenerIntent.environment} onChange={(event) => setDraft((current) => current ? { ...current, listenerIntent: { ...current.listenerIntent, environment: event.target.value } } : current)} />
                </Field>
                <Field label="음악 주의도">
                  <select className={SELECT_CLASS} value={draft.listenerIntent.attentionMode} onChange={(event) => setDraft((current) => current ? { ...current, listenerIntent: { ...current.listenerIntent, attentionMode: event.target.value as typeof current.listenerIntent.attentionMode } } : current)}>
                    {ATTENTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="세션 길이" hint="분">
                    <input type="number" min={1} max={1440} className={INPUT_CLASS} value={draft.listenerIntent.sessionMinutes} onChange={(event) => setDraft((current) => current ? { ...current, listenerIntent: { ...current.listenerIntent, sessionMinutes: Number(event.target.value) } } : current)} />
                  </Field>
                  <Field label="목표 에너지" hint="0–100">
                    <input type="number" min={0} max={100} className={INPUT_CLASS} value={draft.listenerIntent.targetEnergy} onChange={(event) => setDraft((current) => current ? { ...current, listenerIntent: { ...current.listenerIntent, targetEnergy: Number(event.target.value) } } : current)} />
                  </Field>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-7 xl:grid-cols-2">
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-200"><LockKeyhole className="h-4 w-4 text-violet-300" /> Identity DNA</div>
                <Field label="채널 이름" hint="Locked">
                  <input className={INPUT_CLASS} value={draft.channel.channelName} onChange={(event) => updateChannel('channelName', event.target.value)} />
                </Field>
                <Field label="채널의 약속" hint="Locked">
                  <textarea className={`${INPUT_CLASS} min-h-28 resize-none`} value={draft.channel.promise} onChange={(event) => updateChannel('promise', event.target.value)} />
                </Field>
                <Field label="비주얼 세계관" hint="Locked">
                  <textarea className={`${INPUT_CLASS} min-h-28 resize-none`} value={draft.dna.visual.world} onChange={(event) => setDraft((current) => current ? { ...current, dna: { ...current.dna, visual: { ...current.dna.visual, world: event.target.value } } } : current)} />
                </Field>
              </div>
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-200"><Music2 className="h-4 w-4 text-cyan-300" /> Music DNA</div>
                <Field label="핵심 장르" hint="Locked">
                  <input className={INPUT_CLASS} value={draft.dna.music.primaryGenre} onChange={(event) => setDraft((current) => current ? { ...current, dna: { ...current.dna, music: { ...current.dna.music, primaryGenre: event.target.value } } } : current)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="최소 BPM" hint="Bounded">
                    <input type="number" min={20} max={300} className={INPUT_CLASS} value={draft.dna.music.bpmRange[0]} onChange={(event) => setDraft((current) => current ? { ...current, dna: { ...current.dna, music: { ...current.dna.music, bpmRange: [Number(event.target.value), current.dna.music.bpmRange[1]] } } } : current)} />
                  </Field>
                  <Field label="최대 BPM" hint="Bounded">
                    <input type="number" min={20} max={300} className={INPUT_CLASS} value={draft.dna.music.bpmRange[1]} onChange={(event) => setDraft((current) => current ? { ...current, dna: { ...current.dna, music: { ...current.dna.music, bpmRange: [current.dna.music.bpmRange[0], Number(event.target.value)] } } } : current)} />
                  </Field>
                </div>
                <Field label="시그니처 악기" hint="쉼표로 구분">
                  <input className={INPUT_CLASS} value={draft.dna.music.signatureInstruments.join(', ')} onChange={(event) => setDraft((current) => current ? { ...current, dna: { ...current.dna, music: { ...current.dna.music, signatureInstruments: splitTags(event.target.value) } } } : current)} />
                </Field>
                <Field label="Studio-Grade 기본 프롬프트" hint={`${draft.dna.music.baseStylePrompt.length}/1,000`}>
                  <textarea maxLength={1000} className={`${INPUT_CLASS} min-h-36 resize-y font-mono text-xs leading-5`} value={draft.dna.music.baseStylePrompt} onChange={(event) => setDraft((current) => current ? { ...current, dna: { ...current.dna, music: { ...current.dna.music, baseStylePrompt: event.target.value } } } : current)} />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-7 xl:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <ReviewRow label="Channel Promise" value={draft.channel.promise} status="locked" />
                <ReviewRow label="Listener Intent" value={`${PURPOSE_OPTIONS.find((item) => item.value === draft.listenerIntent.primaryPurpose)?.label} · ${draft.listenerIntent.activity}`} status="locked" />
                <ReviewRow label="Music Identity" value={`${draft.dna.music.primaryGenre} · ${draft.dna.music.bpmRange[0]}–${draft.dna.music.bpmRange[1]} BPM · ${draft.dna.music.vocalPolicy}`} status="bounded" />
                <ReviewRow label="Visual World" value={draft.dna.visual.world} status="locked" />
                <ReviewRow label="Episode Freedom" value="날씨, 시간대, 상황, 편곡 변주는 매 에피소드에서 새롭게 조합됩니다." status="free" />
              </div>
              <aside className="rounded-2xl border border-violet-400/20 bg-gradient-to-b from-violet-500/10 to-transparent p-5">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500 text-white shadow-lg shadow-violet-500/20"><Fingerprint className="h-5 w-5" /></div>
                <h3 className="mt-5 text-lg font-semibold text-white">{draft.channel.channelName}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">DNA v1이 불변 버전으로 저장됩니다. 이후 수정은 기존 버전을 덮어쓰지 않고 새 버전을 만듭니다.</p>
                <div className="mt-5 space-y-2 border-t border-white/8 pt-4 text-xs text-zinc-500">
                  <div className="flex justify-between"><span>기본 세션</span><span className="text-zinc-300">{draft.listenerIntent.sessionMinutes}분</span></div>
                  <div className="flex justify-between"><span>Discovery</span><span className="text-zinc-300">{draft.channel.discoveryConcepts.join(', ')}</span></div>
                  <div className="flex justify-between"><span>Source</span><span className="text-zinc-300">{draft.source.presetId}</span></div>
                </div>
                {saved ? (
                  <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
                    <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" /> Channel DNA 저장 완료</div>
                    <p className="mt-2 break-all text-xs text-emerald-200/65">Channel {saved.channelId}</p>
                    <Link href={`/channel-builder/${saved.channelId}/episodes/new`} className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-emerald-300 px-3 py-2.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-200">
                      첫 Episode 설계 <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : (
                  <button type="button" disabled={isPending} onClick={save} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
                    <Save className="h-4 w-4" />{isPending ? 'DNA 저장 중…' : 'Channel DNA 저장'}
                  </button>
                )}
                {error ? <p role="alert" className="mt-3 rounded-lg bg-red-500/10 p-3 text-xs leading-5 text-red-300">{error}</p> : null}
              </aside>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between border-t border-white/8 bg-black/10 px-5 py-4 sm:px-7">
          <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:invisible"><ArrowLeft className="h-4 w-4" /> 이전</button>
          <span className="hidden text-xs text-zinc-600 sm:block">설정은 저장 전까지 언제든 다시 확인할 수 있습니다.</span>
          {step < STEPS.length - 1 ? <button type="button" onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200">다음 단계 <ArrowRight className="h-4 w-4" /></button> : <span className="w-24" />}
        </footer>
      </section>
    </div>
  )
}

function ReviewRow({ label, value, status }: { label: string; value: string; status: 'locked' | 'bounded' | 'free' }) {
  const style = status === 'locked' ? 'bg-violet-500/10 text-violet-300' : status === 'bounded' ? 'bg-cyan-500/10 text-cyan-300' : 'bg-emerald-500/10 text-emerald-300'
  return (
    <div className="rounded-2xl border border-white/8 bg-black/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-200">{label}</h3>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${style}`}>{status}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{value}</p>
    </div>
  )
}
