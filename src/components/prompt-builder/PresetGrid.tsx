'use client'

import { useState, useSyncExternalStore } from 'react'
import type { Preset } from '@/types'
import { presets } from '@/data/presets'
import { useLanguage } from '@/contexts/LanguageContext'
import { canonicalPresetId, getPresetCategory, getPresetGenreLabel, mergePublicPresetCatalog } from '@/lib/preset-catalog'
import { localizePresetForDisplay } from '@/lib/preset-localization'
import { getPresetThumbnail, getPresetUsageCount } from '@/lib/preset-thumbnail'
import { PresetSampleButton, PresetSamplePlayer, usePresetSamples } from '@/components/presets/PresetSamples'
import { Trash2, Pencil, ChevronLeft, ChevronRight, Search, Heart, Headphones, Maximize2, X } from 'lucide-react'

interface PresetGridProps {
  onApply: (preset: Preset) => void
  isPro: boolean
  onOpenCreatePreset: () => void
  onOpenProPaywall: () => void
  customPresets: Preset[]
  dbPresets?: Preset[]
  onDeletePreset: (id: string) => void
  onEditPreset?: (preset: Preset) => void
  selectedPresetId?: string
}

type PresetFilter = 'all' | 'custom' | ReturnType<typeof getPresetCategory>

const FILTER_TABS: { value: PresetFilter; label: string }[] = [
  { value: 'all', label: '전체 프리셋' },
  { value: 'healing', label: '👼 마음의 위로 & 힐링' },
  { value: 'focus', label: '✏️ 몰입 & 생산성' },
  { value: 'retro', label: '📻 아날로그 & 향수' },
  { value: 'cafe', label: '☕ 카페 & 오프라인 공간' },
  { value: 'drive', label: '🚗 드라이브 & 감성 여행' },
  { value: 'cinematic', label: '🎬 서사 & 시네마틱 스토리' },
  { value: 'custom', label: '✨ 나만의 컨셉' },
]

const LIKED_PRESETS_STORAGE_KEY = 'melodio_liked_presets'
const LIKED_PRESETS_CHANGED_EVENT = 'melodio_liked_presets_changed'

function readLikedPresetsSnapshot(): string {
  try {
    return localStorage.getItem(LIKED_PRESETS_STORAGE_KEY) ?? '[]'
  } catch {
    return '[]'
  }
}

function parseLikedPresets(snapshot: string): string[] {
  try {
    const parsed: unknown = JSON.parse(snapshot)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function subscribeToLikedPresets(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(LIKED_PRESETS_CHANGED_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(LIKED_PRESETS_CHANGED_EVENT, onChange)
  }
}

const emptyLikedPresetsSnapshot = () => '[]'

function PresetArtwork({ preset, source }: { preset: Preset; source: string | null }) {
  const [failed, setFailed] = useState(false)
  if (source && !failed) {
    return (
      <img
        src={source}
        alt={preset.name}
        onError={() => setFailed(true)}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.025] group-hover:saturate-[1.03]"
        loading="lazy"
      />
    )
  }
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-slate-800 via-zinc-900 to-indigo-950 px-6 text-center" role="img" aria-label={`${preset.name} — 이미지 없음`}>
      <div className="absolute h-48 w-48 rounded-full border border-white/5" aria-hidden="true" />
      <div className="absolute h-32 w-32 rounded-full border border-white/5" aria-hidden="true" />
      <span className="relative text-4xl" aria-hidden="true">{preset.emoji || '🎵'}</span>
      <span className="relative max-w-full text-xs font-medium text-zinc-300 line-clamp-2">{preset.name}</span>
    </div>
  )
}

/** 프리셋 원클릭 적용 그리드 (4x4, 페이지당 최대 16개 페이징 + 검색 필터 기능 탑재) */
export default function PresetGrid({ 
  onApply, 
  isPro, 
  onOpenCreatePreset, 
  onOpenProPaywall,
  customPresets,
  dbPresets = [],
  onDeletePreset,
  onEditPreset,
  selectedPresetId
}: PresetGridProps) {
  const { language } = useLanguage()
  const [requestedPage, setCurrentPage] = useState(1)
  const [referenceTime] = useState(() => Date.now())
  const itemsPerPage = 16 // 4x4 격자 노출 한도

  // 검색 및 필터 상태
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<PresetFilter>('all')

  const likedPresetsSnapshot = useSyncExternalStore(subscribeToLikedPresets, readLikedPresetsSnapshot, emptyLikedPresetsSnapshot)
  const likedPresets = parseLikedPresets(likedPresetsSnapshot)

  const toggleLikePreset = (id: string, isCustom: boolean) => {
    const previous = parseLikedPresets(readLikedPresetsSnapshot())
    const matches = (savedId: string) => isCustom ? savedId === id : canonicalPresetId(savedId) === id
    const next = previous.some(matches) ? previous.filter(savedId => !matches(savedId)) : [...previous, id]
    localStorage.setItem(LIKED_PRESETS_STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(LIKED_PRESETS_CHANGED_EVENT))
  }

  const safeDbPresets = (dbPresets || []).filter(p => p && p.id);
  // Keep source records for apply/edit; localization belongs only to presentation.
  const dbAndDefault = mergePublicPresetCatalog(safeDbPresets, presets)

  // 통합 필터링 로직
  const filteredItems = [
    ...(customPresets || []).map(p => ({ ...p, isCustom: true })),
    ...dbAndDefault.map(p => ({ ...p, isCustom: false }))
  ].filter(p => {
    // 1. 검색어 필터
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const display = localizePresetForDisplay(p, language, { isCustom: p.isCustom })
      const matchSearch = 
        (display.name || '').toLowerCase().includes(query) ||
        (display.desc || '').toLowerCase().includes(query) ||
        (p.customPrompt || '').toLowerCase().includes(query) ||
        getPresetGenreLabel(p).toLowerCase().includes(query);
      if (!matchSearch) return false;
    }

    // 2. 탭 필터
    if (filterType === 'custom') {
      return p.isCustom;
    }

    if (filterType !== 'all') {
      return !p.isCustom && getPresetCategory(p) === filterType;
    }

    return true; // 'all'
  });

  const showCreateCard = !searchQuery && filterType === 'custom'

  const allItems = [
    ...(showCreateCard ? [{ type: 'create' as const }] : []),
    ...filteredItems.map(p => ({ 
      type: (p.isCustom ? 'custom' : 'default') as 'custom' | 'default', 
      data: p 
    }))
  ]

  const totalItems = allItems.length
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1
  const currentPage = requestedPage > totalPages ? 1 : requestedPage

  // 현재 페이지에 노출될 아이템 슬라이싱
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedItems = allItems.slice(startIndex, startIndex + itemsPerPage)
  const samplePlayer = usePresetSamples('preset-studio', paginatedItems.flatMap(item => item.type === 'create' ? [] : [item.data!]))

  return (
    <div className={`section-card font-sans ${samplePlayer.current ? 'mb-20' : ''}`}>
      <PresetSamplePlayer controller={samplePlayer} />
      {/* 상단 헤더: 타이틀, 세그먼트 필터, 검색 입력란 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h3 className="font-semibold text-melodio-text text-sm md:text-base">채널 컨셉 프리셋</h3>
            <p className="text-xs text-melodio-muted">
              원클릭으로 전체 설정 적용 (가로 2열 x 세로 8행 — {currentPage}/{totalPages} 페이지)
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">썸네일에서 이 프리셋으로 만든 최신 공개곡을 들어보세요.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 타입 필터 탭 */}
          <div className="flex bg-black/40 border border-white/15 p-0.5 rounded-lg text-[10px] font-medium flex-wrap gap-y-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setFilterType(tab.value)
                  setCurrentPage(1)
                }}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterType === tab.value
                    ? 'bg-zinc-800 text-white font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 검색 입력창 */}
          <div className="relative flex-1 md:flex-initial md:w-48">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="컨셉, 제목, 태그 검색..."
              className="w-full pl-7 pr-7 py-1.5 bg-black/40 border border-white/15 rounded-lg text-[11px] text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500/50 transition-colors"
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setCurrentPage(1)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-0.5 rounded hover:bg-white/5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* 가로 2열 x 세로 8행 격자형 카드 레이아웃 */}
      {paginatedItems.length === 0 ? (
        <div className="text-center py-10 text-zinc-500 text-xs">
          검색 조건에 맞는 프리셋이 존재하지 않습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3.5">
          {paginatedItems.map((item) => {
            if (item.type === 'create') {
              return (
                <button
                  key="create-btn"
                  onClick={isPro ? onOpenCreatePreset : onOpenProPaywall}
                  className="relative flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-zinc-800 hover:border-fuchsia-500/30 hover:bg-zinc-900/10 transition-all group w-full h-[260px] shrink-0"
                >
                  {/* Circle Placeholder with Plus */}
                  <div className="w-12 h-12 rounded-full border border-dashed border-zinc-800 group-hover:border-fuchsia-500/40 flex items-center justify-center bg-zinc-950/20 shrink-0 transition-colors mb-3">
                    <span className="text-xl text-zinc-500 group-hover:text-fuchsia-400 group-hover:scale-110 transition-all font-light leading-none">+</span>
                  </div>
                  
                  {/* Label */}
                  <div className="text-center">
                    <div className="text-[12.5px] font-bold text-zinc-400 group-hover:text-zinc-200 leading-tight transition-colors font-sans">
                      나만의 프리셋 만들기
                    </div>
                    <div className="text-[9.5px] text-zinc-600 mt-1 leading-tight transition-colors font-sans">
                      현재 믹스 설정을 새 프리셋으로 저장
                    </div>
                  </div>
                  
                  {/* PRO 크라운 미니 배지 */}
                  <div className="absolute top-2 right-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[7px] px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-0.5 shadow-sm">
                    👑 PRO
                  </div>
                </button>
              )
            }

            const isCustom = item.type === 'custom'
            const preset = item.data!
            const displayPreset = localizePresetForDisplay(preset, language, { isCustom })
            const updatedTime = Date.parse(preset.updated_at ?? '')
            const updateAge = referenceTime - updatedTime
            const recentlyUpdated = Number.isFinite(updatedTime) && updateAge >= 0 && updateAge < 24 * 60 * 60 * 1000
            const thumbnailUrl = getPresetThumbnail(preset, isCustom)
            const usageCount = getPresetUsageCount(preset)
            const genreLabel = getPresetGenreLabel(preset)
            const isLiked = likedPresets.some(id => isCustom ? id === preset.id : canonicalPresetId(id) === preset.id)
            const isSelected = preset.id === selectedPresetId
            return (
              <div
                key={preset.id}
                className={`relative overflow-hidden rounded-xl border transition-all duration-300 group flex flex-col justify-between h-[260px] w-full shrink-0 ${
                  isSelected 
                    ? 'border-fuchsia-500 bg-fuchsia-500/5 shadow-[0_0_15px_rgba(192,38,211,0.25)]' 
                    : 'border-zinc-800 bg-zinc-950/20 hover:border-zinc-700/60'
                }`}
              >
                {/* 1. Top YouTube-style Thumbnail Image with Hover Overlay */}
                <div 
                  onClick={() => onApply(preset)}
                  className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-900 shrink-0 cursor-pointer border-b border-white/5"
                >
                  <PresetArtwork key={`${preset.id}:${thumbnailUrl ?? ''}`} preset={displayPreset} source={thumbnailUrl} />
                  
                  {/* On Hover Info Overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-250 flex flex-col justify-between items-start p-4 z-10">
                    {/* Top: Metadata items (Left-aligned, larger & brighter) */}
                    {usageCount !== null ? (
                      <div className="flex flex-col gap-1.5 items-start rounded-xl bg-white/50 px-2.5 py-2 text-left text-zinc-900 shadow-lg backdrop-blur-sm">
                        {usageCount !== null ? (
                          <div className="text-xs font-mono flex items-center gap-2">
                            <Headphones className="w-3.5 h-3.5 text-fuchsia-600 shrink-0" />
                            <span>이용횟수: {usageCount}회</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    
                    {/* Bottom: Enlarged Maximize Button (180% size) - For All Presets */}
                    <div className="w-full flex justify-end mt-auto">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditPreset?.(preset)
                        }}
                        className="w-10 h-10 rounded-full bg-white/50 hover:bg-white/60 text-zinc-800 hover:text-fuchsia-600 flex items-center justify-center transition-all shadow-lg backdrop-blur-sm active:scale-95"
                        title="자세히 보기 / 수정"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <PresetSampleButton preset={preset} controller={samplePlayer} />
                </div>

                {/* 2. Bottom Content Area */}
                <div className="pt-3 px-3.5 pb-4.5 flex-1 flex flex-col justify-between min-w-0">
                  <div className="min-w-0">
                    {genreLabel ? (
                      <div className="mb-1.5 flex items-center">
                        <span className="text-[9px] font-extrabold text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 origin-left">
                          {genreLabel}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-1">
                      <h4 
                        onClick={() => onEditPreset?.(preset)}
                        className="text-[12.5px] font-bold text-zinc-200 hover:text-fuchsia-400 truncate leading-tight cursor-pointer flex-1"
                        title={displayPreset.name}
                      >
                        {displayPreset.name}
                      </h4>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-normal line-clamp-2 mt-1 font-sans">
                      {displayPreset.desc}
                    </p>
                  </div>

                  {/* 3. Bottom Utility Row */}
                  <div className="flex items-center justify-between mt-2 pt-2.5 border-t border-white/5">
                    {/* Concept tag */}
                    <div className="flex items-center gap-1 scale-90 origin-left">
                      {isCustom ? (
                        <span className="text-[8.5px] px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-zinc-300 font-mono tracking-wider uppercase font-bold shadow-sm">
                          나만의 프리셋
                        </span>
                      ) : (
                        <span className="text-[8.5px] px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-900 text-zinc-500 font-mono tracking-wider uppercase font-semibold">
                          공용 프리셋
                        </span>
                      )}
                      {recentlyUpdated ? (
                        <span className="text-[8px] text-emerald-500 font-mono font-semibold" title="지난 24시간 안에 수정된 프리셋">
                          최근 수정
                        </span>
                      ) : null}
                    </div>

                    {/* Likes & Custom Action Buttons */}
                    <div className="flex items-center gap-2">
                      {isCustom && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onEditPreset?.(preset)
                            }}
                            className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5"
                            title="수정"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeletePreset(preset.id)
                            }}
                            className="text-zinc-500 hover:text-red-400 transition-colors p-0.5"
                            title="삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLikePreset(preset.id, isCustom)
                        }}
                        className={`transition-colors p-0.5 ${isLiked ? 'text-red-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                        title={isLiked ? "좋아요 취소" : "좋아요"}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 페이지네이션 조작 패널 (배경/테두리 통일, 글자색만 톤 조절) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-white/5">
          <button
            onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
            className="p-1 rounded bg-zinc-900/40 border border-zinc-800 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 transition-all flex items-center justify-center"
            title="이전 페이지"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          
          {Array.from({ length: totalPages }).map((_, idx) => {
            const pageNum = idx + 1
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`w-6 h-6 rounded text-xs font-bold font-mono flex items-center justify-center transition-all bg-zinc-900/40 border border-zinc-800 ${
                  currentPage === pageNum
                    ? 'text-white border-zinc-700/80 font-extrabold shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/10'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          
          <button
            onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="p-1 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400 transition-all flex items-center justify-center"
            title="다음 페이지"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
