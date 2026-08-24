'use client'

import { AlertCircle, Mic, Sliders, X } from 'lucide-react'

export interface TrackItem {
  id: string
  title?: string
  audio_url?: string
  stem_vocals_url?: string
  is_stem_extracted?: boolean
  voice_conversion_status?: string
}

interface VoiceConversionModalProps {
  isOpen: boolean
  onClose: () => void
  track: TrackItem | null
  onConverted?: (updatedTrack: TrackItem) => void
}

export function VoiceConversionModal({
  isOpen,
  onClose,
  track,
}: VoiceConversionModalProps) {
  if (!isOpen || !track) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-conversion-title"
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-zinc-950 border border-white/10 shadow-2xl p-6 text-white space-y-6"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-zinc-500">
              <Mic className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="voice-conversion-title" className="text-base font-bold text-white">
                  내 목소리 보컬 변환
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-[10px] font-semibold border border-amber-500/20">
                  준비 중
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                대상 곡: {track.title || '선택된 곡'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="내 목소리 보컬 변환 안내 닫기"
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-3 text-xs">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="font-bold text-amber-200">목소리 등록·1:1 변환 기능을 준비하고 있습니다.</p>
            <p className="text-zinc-400 leading-relaxed text-[11px]">
              현재 제공되는 보이스 선택은 특정 사람의 목소리를 복제하는 기능이 아니라, 음색 특성을 생성 프롬프트에 반영하는 보컬 음색 스타일 기능입니다.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400">실제 보이스 모델</label>
          <button
            type="button"
            disabled
            className="w-full p-3.5 rounded-2xl border border-white/5 bg-black/20 text-left cursor-not-allowed opacity-60"
          >
            <span className="block text-sm font-bold text-zinc-400">연결 가능한 모델 없음</span>
            <span className="block mt-1 text-[11px] text-zinc-600">목소리 등록 기능 공개 후 사용할 수 있습니다.</span>
          </button>
        </div>

        <div className="space-y-2 p-3.5 rounded-2xl bg-black/30 border border-white/5 opacity-60">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-500 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              피치 미세 조절
            </span>
            <span className="font-mono text-zinc-600">준비 중</span>
          </div>
          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            defaultValue="0"
            disabled
            aria-label="피치 미세 조절 준비 중"
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-not-allowed accent-zinc-600"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            닫기
          </button>
          <button
            type="button"
            disabled
            title="실제 목소리 변환 기능은 준비 중입니다."
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-zinc-500 cursor-not-allowed"
          >
            목소리 변환 · 준비 중
          </button>
        </div>
      </div>
    </div>
  )
}
