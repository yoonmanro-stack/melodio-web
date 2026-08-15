'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import {
  ArrowLeft, BadgeCheck, Copy, Download, ImageIcon, LoaderCircle,
  PackageCheck, Save, Sparkles,
} from 'lucide-react'
import {
  createPublishPackage, generateEpisodeCover, getPublishPackage,
  selectEpisodeCover, updatePublishPackage,
} from '@/lib/channel-system/publish-package-client'
import type { PublishPackageContext } from '@/lib/channel-system/publish-package-service'

interface Props { channelId: string; episodeId: string }

export function EpisodePublishPackage({ channelId, episodeId }: Props) {
  const [context, setContext] = useState<PublishPackageContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generatingCover, setGeneratingCover] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const controller = new AbortController()
    getPublishPackage(channelId, episodeId, controller.signal).then(setContext).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'Publish Package를 불러오지 못했습니다.')
    })
    return () => controller.abort()
  }, [channelId, episodeId])

  if (error && !context) return <State title="Publish Package를 열 수 없습니다" detail={error} />
  if (!context) return <State title="Publish Package를 불러오는 중" detail="Assembly와 Channel DNA를 확인하고 있습니다." loading />

  const pack = context.publishPackage
  const assembly = context.assembly.assembly
  const run = (operation: () => Promise<PublishPackageContext>) => {
    setError(null)
    startTransition(async () => {
      try { setContext(await operation()) } catch (reason) { setError(reason instanceof Error ? reason.message : '요청에 실패했습니다.') }
    })
  }

  if (!pack) return <div className="mx-auto min-h-full w-full max-w-5xl px-4 pb-24 pt-5"><Link href={`/channel-builder/${channelId}/episodes/${episodeId}/assembly`} className="mb-5 inline-flex items-center gap-2 text-xs text-zinc-500"><ArrowLeft className="h-3.5 w-3.5" /> Episode Assembly</Link><section className="rounded-3xl border border-violet-400/20 bg-violet-400/[0.05] p-8"><PackageCheck className="h-8 w-8 text-violet-300" /><h1 className="mt-5 text-2xl font-semibold text-white">Episode Publish Package 생성</h1><p className="mt-3 text-sm leading-6 text-zinc-400">완성 MP3, 실측 Tracklist, 업로드 제목·설명·태그와 Channel DNA 기반 스틸 커버 프롬프트를 하나의 패키지로 묶습니다. 일반 Episode에는 영상 작업을 추가하지 않습니다.</p><button type="button" disabled={pending || assembly?.status !== 'completed'} onClick={() => run(() => createPublishPackage(channelId, episodeId))} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-300 px-5 py-3 text-sm font-semibold text-violet-950 disabled:opacity-40"><PackageCheck className="h-4 w-4" />{pending ? '패키지 생성 중…' : 'Publish Package 생성'}</button></section></div>

  return <PublishEditor
    key={pack.id + pack.selectedCoverAssetId}
    context={context}
    error={error}
    pending={pending}
    generatingCover={generatingCover}
    copied={copied}
    onSave={(draft) => run(() => updatePublishPackage(channelId, episodeId, draft))}
    onGenerateCover={async () => {
      setGeneratingCover(true); setError(null)
      try { await generateEpisodeCover(channelId, episodeId); setContext(await getPublishPackage(channelId, episodeId)) }
      catch (reason) { setError(reason instanceof Error ? reason.message : '커버 생성에 실패했습니다.') }
      finally { setGeneratingCover(false) }
    }}
    onSelectCover={(coverId) => run(() => selectEpisodeCover(channelId, episodeId, coverId))}
    onCopy={async () => { await navigator.clipboard.writeText(pack.description); setCopied(true); window.setTimeout(() => setCopied(false), 1500) }}
    onDownload={() => downloadManifest(context)}
    backHref={`/channel-builder/${channelId}/episodes/${episodeId}/assembly`}
  />
}

function PublishEditor({ context, error, pending, generatingCover, copied, onSave, onGenerateCover, onSelectCover, onCopy, onDownload, backHref }: {
  context: PublishPackageContext; error: string | null; pending: boolean; generatingCover: boolean; copied: boolean
  onSave: (draft: { uploadTitle: string; description: string; tags: string[]; hashtags: string[]; coverPrompt: string }) => void
  onGenerateCover: () => void; onSelectCover: (id: string) => void; onCopy: () => void; onDownload: () => void; backHref: string
}) {
  const pack = context.publishPackage!
  const [title, setTitle] = useState(pack.uploadTitle)
  const [description, setDescription] = useState(pack.description)
  const [tags, setTags] = useState(pack.tags.join(', '))
  const [hashtags, setHashtags] = useState(pack.hashtags.join(' '))
  const [coverPrompt, setCoverPrompt] = useState(pack.coverPrompt)
  const selected = context.covers.find((cover) => cover.id === pack.selectedCoverAssetId)
  const input = 'w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-200 outline-none focus:border-violet-400/50'
  return <div className="mx-auto min-h-full w-full max-w-[1450px] px-3 pb-24 pt-4 sm:px-6"><header className="mb-7"><Link href={backHref} className="mb-4 inline-flex items-center gap-2 text-xs text-zinc-500"><ArrowLeft className="h-3.5 w-3.5" /> Episode Assembly</Link><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300"><PackageCheck className="h-4 w-4" /> Publish Package</div><h1 className="text-3xl font-semibold text-white">업로드 패키지와 스틸 커버</h1><p className="mt-2 text-sm text-zinc-400">일반 Episode용 오디오·메타데이터·정사각형 커버 패키지입니다. 영상은 생성하지 않습니다.</p></div><span className={`w-fit rounded-full border px-4 py-2 text-xs font-semibold uppercase ${pack.status === 'ready' ? 'border-emerald-400/30 text-emerald-300' : 'border-amber-400/30 text-amber-300'}`}>{pack.status}</span></div></header>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]"><main className="space-y-5"><section className="rounded-3xl border border-white/10 bg-[#111118] p-5 sm:p-7"><label className="text-xs text-zinc-500">Upload title · {title.length}/100</label><input className={`${input} mt-2`} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /><div className="mt-5 flex items-center justify-between"><label className="text-xs text-zinc-500">YouTube description</label><button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 text-xs text-violet-300"><Copy className="h-3.5 w-3.5" />{copied ? '복사됨' : '복사'}</button></div><textarea className={`${input} mt-2 min-h-80 resize-y font-mono text-xs leading-6`} value={description} onChange={(event) => setDescription(event.target.value)} /><label className="mt-5 block text-xs text-zinc-500">Search tags</label><textarea className={`${input} mt-2 min-h-20`} value={tags} onChange={(event) => setTags(event.target.value)} /><label className="mt-5 block text-xs text-zinc-500">Hashtags</label><input className={`${input} mt-2`} value={hashtags} onChange={(event) => setHashtags(event.target.value)} /><button type="button" disabled={pending || !title.trim() || !description.trim()} onClick={() => onSave({ uploadTitle: title, description, tags: tags.split(',').map((value) => value.trim()).filter(Boolean), hashtags: hashtags.split(/\s+/).filter(Boolean), coverPrompt })} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-40"><Save className="h-4 w-4" />{pending ? '저장 중…' : '패키지 문안 저장'}</button></section>
      <section className="rounded-3xl border border-white/10 bg-[#111118] p-5 sm:p-7"><div className="flex items-center gap-2 text-sm font-semibold text-white"><ImageIcon className="h-4 w-4 text-cyan-300" /> Channel DNA Cover Prompt</div><textarea className={`${input} mt-4 min-h-44 resize-y text-xs leading-6`} value={coverPrompt} onChange={(event) => setCoverPrompt(event.target.value)} /><p className="mt-3 text-xs text-zinc-600">1:1 · 1024px PNG · 글자·로고·워터마크 금지</p><button type="button" disabled={generatingCover} onClick={onGenerateCover} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-cyan-950 disabled:opacity-50"><Sparkles className="h-4 w-4" />{generatingCover ? '유료 커버 생성 중…' : '스틸 커버 1개 생성'}</button><p className="mt-2 text-[11px] text-amber-300">이 버튼부터 이미지 생성 비용이 발생합니다.</p></section></main>
      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start"><section className="overflow-hidden rounded-3xl border border-white/10 bg-[#111118]"><div className="aspect-square bg-zinc-950 bg-cover bg-center" style={selected?.imageUrl ? { backgroundImage: `url("${selected.imageUrl.replace(/"/g, '%22')}")` } : undefined}>{!selected ? <div className="grid h-full place-items-center text-center text-sm text-zinc-600"><div><ImageIcon className="mx-auto mb-3 h-8 w-8" />선택된 스틸 커버 없음</div></div> : null}</div>{selected ? <div className="flex items-center gap-2 p-4 text-xs text-emerald-300"><BadgeCheck className="h-4 w-4" />Publish Cover 선택 완료</div> : null}</section>
        {context.covers.length > 0 ? <section className="grid grid-cols-2 gap-2">{context.covers.map((cover) => <button type="button" key={cover.id} disabled={!cover.imageUrl || pending} onClick={() => onSelectCover(cover.id)} className={`overflow-hidden rounded-xl border text-left ${pack.selectedCoverAssetId === cover.id ? 'border-emerald-400/50' : 'border-white/10'}`}><div className="aspect-square bg-zinc-950 bg-cover bg-center" style={cover.imageUrl ? { backgroundImage: `url("${cover.imageUrl.replace(/"/g, '%22')}")` } : undefined} /><span className="block p-2 text-[10px] text-zinc-500">{cover.status}{pack.selectedCoverAssetId === cover.id ? ' · selected' : ''}</span></button>)}</section> : null}
        <section className="rounded-2xl border border-white/10 bg-[#111118] p-5"><p className="text-xs text-zinc-500">Package files</p><a href={pack.audioUrl} download className="mt-4 flex items-center gap-2 text-sm text-cyan-300"><Download className="h-4 w-4" />Episode MP3</a>{selected?.imageUrl ? <a href={selected.imageUrl} download className="mt-3 flex items-center gap-2 text-sm text-cyan-300"><Download className="h-4 w-4" />Cover PNG</a> : null}<button type="button" onClick={onDownload} className="mt-3 flex items-center gap-2 text-sm text-violet-300"><Download className="h-4 w-4" />Metadata JSON</button></section>{error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">{error}</p> : null}</aside></div></div>
}

function downloadManifest(context: PublishPackageContext) {
  const pack = context.publishPackage
  if (!pack) return
  const cover = context.covers.find((item) => item.id === pack.selectedCoverAssetId)
  const blob = new Blob([JSON.stringify({ ...pack, coverUrl: cover?.imageUrl || null, video: null }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'melodio-publish-package.json'; anchor.click()
  URL.revokeObjectURL(url)
}

function State({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) { return <div className="mx-auto mt-20 max-w-lg rounded-2xl border border-white/10 bg-[#111118] p-8 text-center">{loading ? <LoaderCircle className="mx-auto mb-4 h-6 w-6 animate-spin text-violet-300" /> : null}<h1 className="text-lg font-semibold text-white">{title}</h1><p className="mt-2 text-sm text-zinc-500">{detail}</p></div> }
