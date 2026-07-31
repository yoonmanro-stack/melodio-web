'use client'

import { useState } from 'react'
import type { PromptPayload } from '@/types'
import type { CompositorResult } from '@/lib/prompt-compositor'
import { Lock, Sparkles, Sliders, CheckCircle2 } from 'lucide-react'

interface PromptOutputProps {
  payload: PromptPayload | null
  stylePrompt: string
  onStylePromptChange: (val: string) => void
  excludePrompt: string
  onExcludePromptChange: (val: string) => void
  isPublic: boolean
  onPublicToggle: (val: boolean) => void
  compositorResult: CompositorResult
  onGenerate: () => void
  isGenerating: boolean
  isPlaylistMode?: boolean
  trackCount?: number
  lyricsBuilderNode?: React.ReactNode
  dynamicElements?: any
  ambienceVolume?: number
  onAmbienceVolumeChange?: (val: number) => void
  isPro?: boolean
  onOpenProPaywall?: () => void
  presetId?: string
  customPresets?: any[]
  onCustomPresetsChange?: (val: any[]) => void
  isAsmrEnabled?: boolean
  onAsmrToggle?: (val: boolean) => void
  ambientFoley?: string
  sourceMenu?: string
}

/** 프롬프트 출력 패널 — Style / Exclude / Lyrics + AI 최적화 + 공개 토글 */
export default function PromptOutput({
  payload,
  stylePrompt,
  onStylePromptChange,
  excludePrompt,
  onExcludePromptChange,
  isPublic,
  onPublicToggle,
  compositorResult,
  onGenerate,
  isGenerating,
  isPlaylistMode,
  trackCount,
  lyricsBuilderNode,
  dynamicElements,
  ambienceVolume = 20,
  onAmbienceVolumeChange,
  isPro = false,
  onOpenProPaywall,
  presetId = '',
  customPresets = [],
  onCustomPresetsChange,
  isAsmrEnabled = false,
  onAsmrToggle,
  ambientFoley = '',
  sourceMenu,
}: PromptOutputProps) {
  const [copiedStyle, setCopiedStyle] = useState(false)
  const [copiedLyrics, setCopiedLyrics] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const getMenuDisplayName = (menu?: string) => {
    if (menu === 'japan') return '일본 BGM 포지'
    if (menu === 'viral' || menu === 'viral-cf') return '바이럴 & 트렌드 존'
    if (menu === 'style-library') return '스타일 라이브러리'
    return '오디오 포지'
  }
  const menuName = getMenuDisplayName(sourceMenu)

  const copyToClipboard = async (text: string, which: 'style' | 'lyrics') => {
    await navigator.clipboard.writeText(text)
    if (which === 'style') {
      setCopiedStyle(true)
      setTimeout(() => setCopiedStyle(false), 2000)
    } else {
      setCopiedLyrics(true)
      setTimeout(() => setCopiedLyrics(false), 2000)
    }
  }

  // AI 프롬프트 최적화 호출
  const handleOptimize = async () => {
    // ─── 유료 요금제 권한 검증 (Free 요금제 차단) ───
    if (!isPro) {
      onOpenProPaywall?.()
      return
    }

    if (!stylePrompt.trim() || isOptimizing) return

    // ─── 1. 커스텀 프리셋 클라이언트단 캐시 확인 ───
    if (presetId && presetId.startsWith('custom-') && customPresets.length > 0) {
      const matched = customPresets.find(p => p.id === presetId)
      if (matched?.metadata?.cached_optimized_prompt) {
        console.log('[PromptOptimize] Loading from client-side custom preset cache')
        onStylePromptChange(matched.metadata.cached_optimized_prompt)
        return
      }
    }

    setIsOptimizing(true)
    try {
      // 이미 최적화된 마스터링 태그가 포함되어 있다면 제거한 깨끗한 본문만 전송
      const cleanPrompt = stylePrompt
        .replace(/\[High-fidelity studio mastering, professional grade audio\]/gi, '')
        .trim()
        .replace(/^,/, '')
        .replace(/,$/, '')
        .trim()

      if (!cleanPrompt) {
        alert('최적화할 음악 스타일 태그나 설명을 먼저 입력해주세요.')
        setIsOptimizing(false)
        return
      }

      const res = await fetch('/api/prompt-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: cleanPrompt, language: 'ko', presetId }),
      })
      const data = await res.json()
      if (res.ok && data.optimized && !data.error) {
        onStylePromptChange(data.optimized)

        // ─── 2. 커스텀 프리셋인 경우 생성된 결과를 클라이언트단에 캐시 저장 ───
        if (presetId && presetId.startsWith('custom-') && customPresets.length > 0 && onCustomPresetsChange) {
          const updated = customPresets.map(p => p.id === presetId ? {
            ...p,
            metadata: {
              ...(p.metadata || {}),
              cached_optimized_prompt: data.optimized
            }
          } : p)
          onCustomPresetsChange(updated)
          localStorage.setItem('melodio_custom_presets', JSON.stringify(updated))
        }

        if (data.model) {
          console.log(`[PromptOptimize] Used model: ${data.model}, length: ${data.optimized.length}`)
        }
      } else {
        alert(`프롬프트 최적화 실패: ${data.error || 'AI 응답 처리에 실패했습니다.'}`)
      }
    } catch (error) {
      console.error('[PromptOptimize] Error:', error)
      alert('프롬프트 최적화 중 네트워크 오류가 발생했습니다.')
    } finally {
      setIsOptimizing(false)
    }
  }

  // 글자 수 상태별 색상
  const charCount = stylePrompt.length
  const maxChars = 1000
  const charCountColor =
    charCount > maxChars
      ? 'text-red-400 font-bold'
      : charCount > 950
      ? 'text-yellow-400'
      : 'text-zinc-500'

  // Exclude 글자 수
  const excludeCharCount = excludePrompt.length
  const excludeMaxChars = 200


  return (
    <div className="sticky top-6 flex flex-col gap-4">
      {/* Style 프롬프트 (직접 입력/붙여넣기 가능) */}
      <div id="style-prompt-section" className="section-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Style Prompt
          </span>
          <div className="flex items-center gap-3">
            {/* 글자 수 카운터 */}
            <span className={`text-[10px] font-mono ${charCountColor}`}>
              {charCount}/{maxChars}
            </span>
            {stylePrompt && (
              <button
                onClick={() => copyToClipboard(stylePrompt, 'style')}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {copiedStyle ? '✅ 복사됨' : '📋 복사'}
              </button>
            )}
          </div>
        </div>
        <textarea
          value={stylePrompt}
          onChange={(e) => onStylePromptChange(e.target.value)}
          placeholder="태그를 선택하거나 여기에 스타일 프롬프트를 직접 입력/붙여넣기 하세요 (예: dark synthwave, retrofuturistic, neon noir)"
          rows={5}
          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-melodio-accent resize-none font-mono leading-relaxed"
        />
        {/* AI 프롬프트 최적화 버튼 — 이미 완성된 스튜디오 프롬프트일 경우 중복 호출 방지 */}
        {(() => {
          const isAlreadyOptimized = stylePrompt.includes('[High-fidelity studio mastering') || stylePrompt.length >= 350
          if (isAlreadyOptimized) {
            return (
              <div className="mt-2 w-full py-2 px-3 rounded-lg text-xs font-medium border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 flex items-center justify-center gap-2 select-none">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>스튜디오 마스터링 프롬프트 적용 완료 (중복 API 비용 없음)</span>
              </div>
            )
          }
          return (
            <button
              onClick={handleOptimize}
              disabled={isOptimizing || !stylePrompt.trim()}
              className="mt-2 w-full py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-500/40 bg-gradient-to-r from-purple-500/15 to-pink-500/15 text-purple-300 hover:from-purple-500/25 hover:to-pink-500/25 hover:border-purple-400/60 hover:text-purple-200"
            >
              {isOptimizing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin" />
                  AI가 프롬프트를 최적화하는 중...
                </>
              ) : (
                <>
                  {!isPro ? (
                    <Lock className="w-3 h-3 text-zinc-400 shrink-0" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                  )}
                  <span>AI 프로듀서 브리프 생성 (Studio-Grade)</span>
                </>
              )}
            </button>
          )
        })()}
        {/* 스마트 컷 알림 */}
        {compositorResult.truncatedCount > 0 && (
          <p className="text-[10px] text-yellow-400/80 mt-2">
            ⚠️ 글자 수 최적화: {compositorResult.truncatedCount}개 태그가 자동 제거되었습니다
          </p>
        )}
      </div>

      {/* 🌿 ASMR Ambient Foley Toggle Card */}
      {ambientFoley && onAsmrToggle && (
        <div className="section-card bg-gradient-to-r from-emerald-950/20 to-zinc-900/60 border border-emerald-500/20 shadow-md transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                🌿 ASMR Ambient Foley 효과
              </span>
              <p className="text-[10px] text-zinc-500 leading-normal">
                공간감을 극대화하는 감쇄형 자연환경음을 트랙 배경에 믹스합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAsmrToggle(!isAsmrEnabled)}
              className={`w-9 h-5 flex items-center rounded-full p-1 cursor-pointer transition-all duration-300 outline-none ${
                isAsmrEnabled ? 'bg-emerald-500 justify-end' : 'bg-zinc-800 justify-start'
              }`}
            >
              <span className="bg-white w-3 h-3 rounded-full shadow-md transition-all" />
            </button>
          </div>
          {isAsmrEnabled && (
            <div className="mt-2.5 pt-2 border-t border-emerald-500/10">
              <p className="text-[10px] text-zinc-400 font-mono italic leading-relaxed break-all">
                "{ambientFoley.replace('layered faintly in the background as a subtle foley texture, featuring ', '')}" 질감이 감쇄 믹스됩니다.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 📝 가사 & 마케팅 빌더 */}
      {lyricsBuilderNode}

      {/* 🌧️ Ambient Environment Mixer (ASMR Layer) */}
      {dynamicElements?.audio_system?.ambience_layer && (
        <div className="section-card bg-gradient-to-r from-cyan-950/20 to-zinc-900/60 border border-cyan-500/20 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              🌧️ 환경음 믹스: {dynamicElements.audio_system.ambience_layer.ambience_label}
            </span>
            <span className="text-[11px] font-mono text-cyan-300 font-bold bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
              {ambienceVolume}%
            </span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-normal mb-3">
            음악 감성에 어울리는 백그라운드 환경음(ASMR) 볼륨을 제어하여 현장감을 더합니다.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={ambienceVolume}
              onChange={(e) => onAmbienceVolumeChange?.(Number(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
          <div className="relative w-full h-5 text-[10.5px] text-zinc-500 font-mono mt-1.5">
            <span className="absolute left-0 text-left">음소거 (0%)</span>
            <span className="absolute left-[20%] -translate-x-1/2 text-center text-emerald-400 font-bold font-sans">추천 (20%)</span>
            <span className="absolute left-[40%] -translate-x-1/2 text-center">중간 (40%)</span>
            <span className="absolute right-0 text-right">강함 (100%)</span>
          </div>
        </div>
      )}

      {/* Exclude 프롬프트 (제외 태그) */}
      <div className="section-card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-red-400/80 uppercase tracking-wider flex items-center gap-1.5">
            🚫 Exclude (제외 태그)
          </span>
          <span className={`text-[10px] font-mono ${excludeCharCount > excludeMaxChars ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
            {excludeCharCount}/{excludeMaxChars}
          </span>
        </div>
        <textarea
          value={excludePrompt}
          onChange={(e) => onExcludePromptChange(e.target.value)}
          placeholder="제외할 요소 입력 (예: no autotune, no heavy compression, no electronic synths)"
          rows={2}
          className="w-full bg-red-950/15 border border-red-500/20 rounded-lg p-3 text-xs text-zinc-300 placeholder-red-400/40 focus:outline-none focus:border-red-400/60 resize-none font-mono leading-relaxed"
        />
        {/* 빠른 Exclude 태그 */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {['no autotune', 'no compression', 'no synths', 'no reverb', 'no drums', 'no choir'].map((tag) => (
            <button
              key={tag}
              onClick={() => {
                const current = excludePrompt.trim()
                if (current.toLowerCase().includes(tag)) return
                onExcludePromptChange(current ? `${current}, ${tag}` : tag)
              }}
              className={`px-2 py-0.5 rounded text-[10px] border transition-all ${
                excludePrompt.toLowerCase().includes(tag)
                  ? 'border-red-400/50 bg-red-500/20 text-red-300'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Lyrics 프롬프트 */}
      {payload?.lyricsPrompt && (
        <div className="section-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Lyrics Prompt
            </span>
            <button
              onClick={() => copyToClipboard(payload.lyricsPrompt, 'lyrics')}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {copiedLyrics ? '✅ 복사됨' : '📋 복사'}
            </button>
          </div>
          <pre className="text-xs text-zinc-300 leading-relaxed font-mono bg-black/20 rounded-lg p-3 whitespace-pre-wrap">
            {payload.lyricsPrompt}
          </pre>
        </div>
      )}

      {/* 공개/비공개 토글 + 약관 */}
      <div className="section-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-400">🌐 {menuName} 공개</span>
            <button
              onClick={() => setShowTerms(!showTerms)}
              className="text-[10px] text-rose-400/70 hover:text-rose-400 underline transition-colors"
            >
              약관 보기
            </button>
          </div>
          <button
            onClick={() => onPublicToggle(!isPublic)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              isPublic ? 'bg-rose-500/80' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isPublic ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        <p className="text-[10px] text-zinc-500 mt-1">
          {isPublic
            ? `✅ 생성된 곡이 ${menuName}에 공개됩니다`
            : '🔒 비공개 — 내 히스토리에서만 확인할 수 있습니다'}
        </p>
        {/* 약관 내용 */}
        {showTerms && (
          <div className="mt-3 p-3.5 rounded-lg bg-zinc-900/40 border border-zinc-800/50 text-[11px] text-zinc-500 leading-relaxed space-y-1.5">
            <p className="font-semibold text-zinc-400 flex items-center gap-1.5 border-b border-zinc-800/30 pb-1.5">📋 {menuName} 공개 약관</p>
            <p className="pl-0.5">1. 🔒 <strong>원작자 식별 ID 절대 비공개</strong>: 곡의 소유권 및 권리를 증명하는 원작자의 고유 식별 ID는 {menuName} 공개 시 <strong>외부나 타인에게 절대 노출 및 공개되지 않으며</strong>, 오직 시스템 내부적으로 암호화되어 안전하게 비공개 처리됩니다.</p>
            <p className="pl-0.5">2. 🛡️ <strong>저작권 및 상업적 권리 유지</strong>: {menuName}에 공개하더라도 귀하의 음원에 대한 소유권, 독점 저작권 및 상업적 권리에는 **전혀 어떠한 영향도 주지 않으며** 원작자로서의 권리가 철저하게 보호됩니다.</p>
            <p className="pl-0.5">3. 🌐 <strong>프롬프트 공유 및 감상</strong>: 공개된 곡은 다른 사용자가 스타일 조합(태그)을 참고하거나 곡을 감상하는 비상업적 용도로만 노출됩니다.</p>
            <p className="pl-0.5">4. 🔄 <strong>언제든 상태 변경 가능</strong>: 귀하는 해당 곡의 원작자로서 언제든지 원클릭으로 비공개 상태로 즉각 전환할 수 있습니다.</p>
            <p className="pl-0.5">5. ⚠️ <strong>상업적 무단 배포 금지</strong>: Melodio는 귀하의 동의 없이 공개된 음원을 상업적 2차 배포하거나 타인에게 재판매하지 않습니다.</p>
          </div>
        )}
      </div>

      {/* 엔진 선택 + Instrumental 표시 */}
      {payload && (
        <div className="flex gap-2 text-xs mt-2 px-1">
          <span className={`px-2 py-1 rounded-md border ${
            payload.engine === 'lyria3'
              ? 'border-green-500/40 bg-green-500/10 text-green-400'
              : payload.engine === 'suno_v5'
              ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400'
              : 'border-melodio-border text-melodio-muted'
          }`}>
            {payload.engine === 'lyria3' ? '🟢 Lyria 3' : payload.engine === 'suno_v5' ? `🟡 Suno ${payload.sunoVersion || 'V5.5'}` : '🔄 Auto'}
          </span>
          {payload.isInstrumental && (
            <span className="px-2 py-1 rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-400">
              🎹 Instrumental
            </span>
          )}
        </div>
      )}

      {/* 생성 버튼 */}
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-melodio-glow mt-2"
      >
        {isGenerating ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {isPlaylistMode ? `${trackCount || 10}곡 전체 음악 생성 중...` : '전체 음악 생성 중...'}
          </>
        ) : (
          <>{isPlaylistMode ? `💿 ${trackCount || 10}곡 전체 음악 생성` : '🎵 전체 음악 생성'}</>
        )}
      </button>
    </div>
  )
}
