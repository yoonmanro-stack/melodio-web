'use client'

import Image from 'next/image'
import { useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import type { ArtistDraft } from './artist-form'
import { FIELD_CLASS } from './artist-form'

export function ArtistPortraitStep({ form, onChange, onUpload, uploading, uploadError }: {
  form: ArtistDraft
  onChange: (patch: Partial<ArtistDraft>, kind?: 'identity' | 'portrait' | 'checks') => void
  onUpload: (file: File) => Promise<void>
  uploading: boolean
  uploadError?: string
}) {
  const [loadedAssetId, setLoadedAssetId] = useState('')
  const [errorAssetId, setErrorAssetId] = useState('')
  const imageFailed = !!form.portrait && errorAssetId === form.portrait.assetId
  const canReview = !!form.portrait && (loadedAssetId === form.portrait.assetId || form.checks.portraitReviewed)
  return <div className="space-y-5">
    <p className="text-sm leading-relaxed text-zinc-400">정면 얼굴이 선명한 실사 이미지를 등록하세요. 1024px 이상의 정사각형 이미지를 권장합니다. 이 가수로 곡을 생성하면 확정한 기준 이미지가 곡 커버로 사용됩니다.</p>
    <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/25">
        {form.portrait ? <><Image key={form.portrait.assetId} src={`/api/artists/portrait?assetId=${encodeURIComponent(form.portrait.assetId)}`} alt={`${form.name || '가수'}의 업로드한 참조 사진`} fill unoptimized sizes="220px" className="object-contain" onLoad={() => { setLoadedAssetId(form.portrait!.assetId); setErrorAssetId('') }} onError={() => setErrorAssetId(form.portrait!.assetId)} />{loadedAssetId !== form.portrait.assetId && !imageFailed && <Loader2 size={22} className="animate-spin text-zinc-500" />}</> : <div className="px-6 text-center text-zinc-500"><ImagePlus size={32} className="mx-auto mb-3 text-zinc-600" /><p className="text-sm">참조 사진을 업로드하세요</p></div>}
      </div>
      <div className="flex flex-col justify-center">
        <h3 className="font-semibold">가수의 참조 사진</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">촬영 사진 또는 직접 준비한 사실적인 인물 이미지를 사용하세요. 등록한 기준 사진은 계정에 비공개로 저장됩니다. 곡 제작 시 커버 사본이 공개 이미지로 저장됩니다.</p>
        <label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-3 text-sm font-medium text-purple-200 hover:bg-purple-500/15">
          {uploading ? <Loader2 size={17} className="animate-spin" /> : <ImagePlus size={17} />}{uploading ? '사진을 업로드하는 중…' : form.portrait ? '참조 사진 바꾸기' : '참조 사진 업로드'}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} aria-describedby={uploadError ? 'artist-portrait-upload-error' : undefined} className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void onUpload(file) }} />
        </label>
        {uploadError && <p id="artist-portrait-upload-error" role="alert" className="mt-2 text-sm leading-relaxed text-rose-300">{uploadError}</p>}
        <p className="mt-2 text-xs text-zinc-500">JPEG · PNG · WebP, 최대 10MB</p>
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">업로드 후 정사각형으로 중앙 크롭됩니다. 표시된 사진에서 얼굴이 잘리지 않았는지 확인한 뒤 승인하세요.</p>
        {form.portrait && <><p className="mt-3 break-words text-xs text-zinc-400">업로드한 사진 · {form.portrait.fileName}</p><button type="button" onClick={() => onChange({ portrait: null }, 'portrait')} className="mt-2 self-start text-xs text-zinc-500 hover:text-rose-300">프로필에서 사진 연결 해제</button></>}
        {imageFailed && <p role="alert" className="mt-3 text-xs text-rose-300">참조 사진을 불러오지 못했습니다. 저장된 내용을 다시 불러오거나 사진을 다시 업로드해 주세요.</p>}
      </div>
    </div>
    <label className="block text-sm text-zinc-300">외형과 비주얼 방향 <span className="text-purple-300">*</span>
      <textarea className={FIELD_CLASS} value={form.visualDirection} rows={4} maxLength={2000} placeholder="예: 짧은 검은 머리, 자연스러운 메이크업, 크림색 셔츠. 따뜻한 자연광과 담백한 인물 사진 분위기." onChange={event => onChange({ visualDirection: event.target.value }, 'identity')} />
    </label>
    <label className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm leading-relaxed ${form.checks.portraitReviewed ? 'border-purple-400/30 bg-purple-500/10 text-purple-200' : 'border-white/10 text-zinc-400'}`}>
      <input type="checkbox" className="mt-1 accent-purple-500" disabled={!canReview} checked={form.checks.portraitReviewed} onChange={event => onChange({ checks: { ...form.checks, portraitReviewed: event.target.checked } }, 'checks')} />
      <span>표시된 정사각형 사진에서 얼굴이 잘리지 않았고 비주얼 방향도 확인했습니다. 이 이미지의 사용 권한을 갖고 있습니다.</span>
    </label>
    <p className="text-xs leading-relaxed text-zinc-500">이 사진은 가수의 비주얼 참조로 저장됩니다. 이미지나 영상의 생성은 별도 제작 단계에서 진행합니다.</p>
  </div>
}
