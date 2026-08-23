'use client'

import { useState } from 'react'
import { X, Mic, Sparkles, Sliders, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
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
  onConverted,
}: VoiceConversionModalProps) {
  const [selectedModel, setSelectedModel] = useState('qr_yoon')
  const [pitchShift, setPitchShift] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!isOpen || !track) return null

  const handleStartConversion = async () => {
    setIsProcessing(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const res = await fetch('/api/voice/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId: track.id,
          voiceModelId: selectedModel,
          pitchShift,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || '음성 변환 요청 실패')
      }

      setSuccessMsg('✨ 맥미니 M4 Pro AI 워커에서 1:1 실제 음성 변환 및 마스터 리믹스가 시작되었습니다! (약 20~30초 소요)')
      
      // 3초 후 모달 닫기
      setTimeout(() => {
        if (onConverted) {
          onConverted({
            ...track,
            // @ts-ignore
            voice_conversion_status: 'pending',
          })
        }
        onClose()
      }, 2500)
    } catch (err: any) {
      setErrorMsg(err.message || '음성 변환 중 오류가 발생했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-zinc-950 border border-white/10 shadow-2xl p-6 text-white space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 border border-indigo-500/30 text-indigo-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                1:1 내 실제 목소리로 보컬 변환 (RVC AI)
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold border border-indigo-500/30">
                  M4 Pro Server
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                대상 곡: {track.title || '선택된 곡'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 설명 안내 카드 */}
        <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-1.5 text-xs text-indigo-200">
          <div className="font-bold flex items-center gap-1.5 text-indigo-300">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>100% 실제 내 음성으로 완곡 보컬 교체</span>
          </div>
          <p className="text-zinc-300 leading-relaxed text-[11px]">
            Demucs로 추출된 보컬 트랙에 대표님의 실제 음성 딥러닝 모델을 1:1로 덧씌운 후, 반주(드럼/베이스/악기)와 스튜디오 마스터링으로 재합성합니다.
          </p>
        </div>

        {/* 보이스 모델 선택 */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <span>적용할 보이스 모델</span>
          </label>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setSelectedModel('qr_yoon')}
              className={`p-3.5 rounded-2xl border text-left text-xs transition-all cursor-pointer flex items-center justify-between ${
                selectedModel === 'qr_yoon'
                  ? 'bg-indigo-600/20 border-indigo-500 text-white font-bold shadow-lg shadow-indigo-500/10'
                  : 'bg-black/30 border-white/5 text-zinc-400 hover:border-white/20'
              }`}
            >
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>🎙️ QR.Yoon (대표님 100% 실제 육성)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-normal">
                    전용 모델
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 font-normal">
                  남성 테너/바리톤 흉성 공명 및 고유 발음 지문 1:1 복제
                </div>
              </div>
              {selectedModel === 'qr_yoon' && (
                <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
              )}
            </button>
          </div>
        </div>

        {/* 피치 조절 슬라이더 */}
        <div className="space-y-2 p-3.5 rounded-2xl bg-black/40 border border-white/5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-zinc-400" />
              피치 미세 조절 (Key Shift)
            </span>
            <span className="font-mono text-indigo-400 font-bold">
              {pitchShift === 0 ? '0 (원키 유지)' : pitchShift > 0 ? `+${pitchShift} 반음 (올림)` : `${pitchShift} 반음 (내림)`}
            </span>
          </div>
          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            value={pitchShift}
            onChange={(e) => setPitchShift(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
            <span>-12 (1옥타브 낮춤)</span>
            <span>0 (남성-남성 기본값)</span>
            <span>+12 (1옥타브 높임)</span>
          </div>
        </div>

        {/* 상태 메시지 */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 하단 버튼 */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleStartConversion}
            disabled={isProcessing}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-500 hover:to-fuchsia-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-2 shadow-lg shadow-indigo-500/25 cursor-pointer transition-all"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>변환 큐 전송 중...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>1:1 내 목소리로 변환 시작</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
