'use client'

import { useState, useEffect } from 'react'
import type { Preset } from '@/types'
import { presets } from '@/data/presets'
import { useLanguage } from '@/contexts/LanguageContext'
import { Trash2, Pencil, ChevronLeft, ChevronRight, Search, Heart, Calendar, Headphones, Maximize2, X } from 'lucide-react'

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

const DEFAULT_THUMBNAILS: Record<string, string> = {
  'developer-debugging': 'https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=600&auto=format&fit=crop',
  'iced-oolong-tea': 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?q=80&w=600&auto=format&fit=crop',
  'tokyo-midnight-1984': 'https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?q=80&w=600&auto=format&fit=crop',
  'matcha-kyoto-jazz': 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=600&auto=format&fit=crop',
  'french-vintage-chanson': 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=600&auto=format&fit=crop',
  'deep-sleep-drift': 'https://images.unsplash.com/photo-1511289081367-46c54b5fbc30?q=80&w=600&auto=format&fit=crop',
  'dead-mall-nostalgia': 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=600&auto=format&fit=crop',
  'joseon-hip-hop': 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop'
}

const getPresetThumbnail = (p: Preset) => {
  if (!p) return 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=600&auto=format&fit=crop'
  if (p.metadata?.thumbnail_url) return p.metadata.thumbnail_url
  if (p.metadata?.cardImage) return p.metadata.cardImage
  if ((p as any).thumbnailUrl) return (p as any).thumbnailUrl
  if ((p as any).thumbnail_url) return (p as any).thumbnail_url
  if (p.metadata && (p.metadata as any).thumbnailUrl) return (p.metadata as any).thumbnailUrl
  const id = p.id || ''
  return DEFAULT_THUMBNAILS[id] || 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=600&auto=format&fit=crop'
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
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 16 // 4x4 격자 노출 한도

  // 검색 및 필터 상태
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'healing' | 'focus' | 'retro' | 'custom'>('all')

  const [likedPresets, setLikedPresets] = useState<string[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('melodio_liked_presets')
    if (saved) {
      try {
        setLikedPresets(JSON.parse(saved))
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  const toggleLikePreset = (id: string) => {
    setLikedPresets(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      localStorage.setItem('melodio_liked_presets', JSON.stringify(next))
      return next
    })
  }

  // 6대 채널 컨셉 카테고리 맵핑 헬퍼
  const getPresetCategory = (p: Preset): string => {
    if ((p as any).category) return (p as any).category;
    if (p.metadata?.category) return p.metadata.category;
    const id = p.id || '';
    if (id === 'developer-debugging') return 'focus';
    if (id === 'iced-oolong-tea') return 'healing';
    if (id === 'tokyo-midnight-1984') return 'drive';
    if (id === 'matcha-kyoto-jazz') return 'cafe';
    if (id === 'french-vintage-chanson') return 'cafe';
    if (id === 'deep-sleep-drift') return 'healing';
    if (id === 'dead-mall-nostalgia') return 'retro';
    if (id === 'joseon-hip-hop') return 'cinematic';
    return 'healing';
  }

  // 장르 뱃지 맵핑 헬퍼
  const getPresetGenre = (p: Preset): string => {
    if (p.metadata?.inferred_genre) return p.metadata.inferred_genre;
    const id = p.id || '';
    if (id === 'developer-debugging') return 'Cyberpunk Synthwave';
    if (id === 'iced-oolong-tea') return 'Mellow Lo-Fi Beat';
    if (id === 'tokyo-midnight-1984') return 'City Pop';
    if (id === 'matcha-kyoto-jazz') return 'Kyoto Jazz Piano';
    if (id === 'french-vintage-chanson') return 'French Chanson';
    if (id === 'deep-sleep-drift') return 'Sleep Ambient';
    if (id === 'dead-mall-nostalgia') return 'Liquid DnB & Garage';
    if (id === 'joseon-hip-hop') return 'Joseon Hip Hop Boom Bap';
    
    // 커스텀 프리셋 지능형 폴백 매핑
    const text = `${p.customPrompt || ''} ${p.desc || ''}`.toLowerCase();
    if (text.includes('joseon') || text.includes('gugak') || text.includes('조선')) return 'Joseon Hip Hop Boom Bap';
    if (text.includes('synthwave') || text.includes('retro') || text.includes('80s')) return 'Synthwave';
    if (text.includes('lofi') || text.includes('lo-fi') || text.includes('chill')) return 'Mellow Lo-Fi';
    if (text.includes('jazz')) return 'Jazz Lofi';
    if (text.includes('ambient') || text.includes('meditation')) return 'Sleep Ambient';
    if (text.includes('ballad') || text.includes('acoustic')) return 'Acoustic';
    if (text.includes('pop')) return 'Pop';
    if (text.includes('folk')) return 'Folk';
    return 'Lofi BGM';
  }

  // Helper: stable simulated usage statistics mapping
  const getPresetUsage = (p: Preset) => {
    if (!p) return { recent: 0, cumulative: 0 }
    const id = p.id || ''
    const recent = typeof p.metadata?.recent_usage_count === 'number'
      ? p.metadata.recent_usage_count
      : (Math.abs((id.charCodeAt(0) || 0) * 7) % 50);
      
    const cumulative = typeof p.metadata?.usage_count === 'number'
      ? p.metadata.usage_count
      : recent + (Math.abs((id.charCodeAt(1) || 0) * 11) % 150);
      
    return { recent, cumulative };
  };

  const safeDbPresets = (dbPresets || []).filter(p => p && p.id);
  
  // Translate presets dynamically based on selected language
  const translatedPresets = presets.map(p => {
    const name = (p as any)[`name_${language}`] || (p as any).name_en || (p as any).name_ko || p.name;
    const desc = (p as any)[`desc_${language}`] || (p as any).desc_en || (p as any).desc_ko || p.desc;
    return { ...p, name, desc };
  });

  const translatedSafeDbPresets = safeDbPresets.map(p => {
    const meta = p.metadata || {};
    const name = meta[`name_${language}`] || (p as any)[`name_${language}`] || meta.name_en || p.name;
    const desc = meta[`desc_${language}`] || (p as any)[`desc_${language}`] || meta.desc_en || p.desc;
    return { ...p, name, desc };
  });

  const translatedCustomPresets = (customPresets || []).map(p => {
    const meta = p.metadata || {};
    const name = meta[`name_${language}`] || (p as any)[`name_${language}`] || meta.name_en || p.name;
    const desc = meta[`desc_${language}`] || (p as any)[`desc_${language}`] || meta.desc_en || p.desc;
    return { ...p, name, desc };
  });

  const dbAndDefault = [...translatedSafeDbPresets, ...translatedPresets.filter(p => p && p.id && !new Set(translatedSafeDbPresets.map(x => x.id)).has(p.id))];

  // Determine New, Best, and Crown keys
  const activeNewKeys = new Set(
    dbAndDefault
      .filter(p => p && p.id && p.isDb && p.updated_at && (Date.now() - new Date(p.updated_at).getTime() < 24 * 60 * 60 * 1000))
      .map(p => p.id)
  );

  const bestPresets = dbAndDefault
    .filter(p => p && p.id && !activeNewKeys.has(p.id))
    .map(p => ({ p, usage: getPresetUsage(p).recent }))
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 8);

  const activeBestKeys = new Set(bestPresets.map(x => x.p.id));

  const crownPresets = dbAndDefault
    .filter(p => p && p.id)
    .map(p => ({ p, usage: getPresetUsage(p).cumulative }))
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 8);

  const activeCrownKeys = new Set(crownPresets.map(x => x.p.id));

  // 통합 필터링 로직
  const filteredItems = [
    ...translatedCustomPresets.map(p => ({ ...p, isCustom: true })),
    ...dbAndDefault.map(p => ({ ...p, isCustom: false }))
  ].filter(p => {
    // 1. 검색어 필터
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const matchSearch = 
        (p.name || '').toLowerCase().includes(query) ||
        (p.desc || '').toLowerCase().includes(query) ||
        (p.customPrompt || '').toLowerCase().includes(query) ||
        getPresetGenre(p).toLowerCase().includes(query);
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

  // 만약 검색/필터 변경으로 인해 현재 페이지 번호가 최대 페이지수를 초과하면 1페이지로 자동 조절
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  // 현재 페이지에 노출될 아이템 슬라이싱
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedItems = allItems.slice(startIndex, startIndex + itemsPerPage)

  return (
    <div className="section-card font-sans">
      {/* 상단 헤더: 타이틀, 세그먼트 필터, 검색 입력란 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h3 className="font-semibold text-melodio-text text-sm md:text-base">채널 컨셉 프리셋</h3>
            <p className="text-xs text-melodio-muted">
              원클릭으로 전체 설정 적용 (가로 2열 x 세로 8행 — {currentPage}/{totalPages} 페이지)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 타입 필터 탭 */}
          <div className="flex bg-black/40 border border-white/15 p-0.5 rounded-lg text-[10px] font-medium flex-wrap gap-y-1">
            {[
              { value: 'all', label: '전체 BGM' },
              { value: 'healing', label: '👼 마음의 위로 & 힐링' },
              { value: 'focus', label: '✏️ 몰입 & 생산성' },
              { value: 'retro', label: '📻 아날로그 & 향수' },
              { value: 'cafe', label: '☕ 카페 & 오프라인 공간' },
              { value: 'drive', label: '🚗 드라이브 & 감성 여행' },
              { value: 'cinematic', label: '🎬 서사 & 시네마틱 스토리' },
              { value: 'custom', label: '✨ 나만의 컨셉' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setFilterType(tab.value as any)
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
          {paginatedItems.map((item, idx) => {
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
            const isNew = preset.isDb && preset.updated_at && (Date.now() - new Date(preset.updated_at).getTime() < 24 * 60 * 60 * 1000);
            const showNewBadge = isNew || (activeNewKeys.has(preset.id));
            const showBestBadge = activeBestKeys.has(preset.id);
            const showCrownBadge = activeCrownKeys.has(preset.id);
            const thumbnailUrl = getPresetThumbnail(preset)
            const { recent, cumulative } = getPresetUsage(preset)
            const isLiked = likedPresets.includes(preset.id)

            // Date format formatting
            const dateStr = preset.updated_at 
              ? new Date(preset.updated_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\s/g, '')
              : '2026.07.12'

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
                  <img 
                    src={thumbnailUrl} 
                    alt=""
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=600&auto=format&fit=crop'
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 filter brightness-[0.85]"
                    loading="lazy"
                  />
                  
                  {/* On Hover Info Overlay */}
                  <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-250 flex flex-col justify-between items-start p-4 z-10">
                    {/* Top: Metadata items (Left-aligned, larger & brighter) */}
                    <div className="flex flex-col gap-1.5 w-full items-start text-left">
                      {isCustom ? (
                        <>
                          <div className="text-xs text-white font-mono flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                            <span>생성일: {dateStr}</span>
                          </div>
                          <div className="text-xs text-white font-mono flex items-center gap-2">
                            <Headphones className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                            <span>이용횟수: {cumulative}회</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-white font-mono flex items-center gap-2">
                          <Headphones className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                          <span>이용횟수: {cumulative}회</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Bottom: Enlarged Maximize Button (180% size) - For All Presets */}
                    <div className="w-full flex justify-end mt-auto">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditPreset?.(preset)
                        }}
                        className="w-12 h-12 rounded-full bg-black/50 hover:bg-black/85 text-white/90 hover:text-white border border-white/20 flex items-center justify-center transition-all shadow-md active:scale-95"
                        title="자세히 보기 / 수정"
                      >
                        <Maximize2 className="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Bottom Content Area */}
                <div className="pt-3 px-3.5 pb-4.5 flex-1 flex flex-col justify-between min-w-0">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex items-center">
                      <span className="text-[9px] font-extrabold text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 origin-left">
                        {getPresetGenre(preset)}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-1">
                      <h4 
                        onClick={() => onEditPreset?.(preset)}
                        className="text-[12.5px] font-bold text-zinc-200 hover:text-fuchsia-400 truncate leading-tight cursor-pointer flex-1"
                        title={preset.name}
                      >
                        {preset.name}
                      </h4>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-normal line-clamp-2 mt-1 font-sans">
                      {preset.desc}
                    </p>
                  </div>

                  {/* 3. Bottom Utility Row */}
                  <div className="flex items-center justify-between mt-2 pt-2.5 border-t border-white/5">
                    {/* Concept tag */}
                    <div className="flex items-center gap-1 scale-90 origin-left">
                      {isCustom ? (
                        <span className="text-[8.5px] px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-zinc-300 font-mono tracking-wider uppercase font-bold shadow-sm">
                          Custom Set
                        </span>
                      ) : (
                        <span className="text-[8.5px] px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-900 text-zinc-500 font-mono tracking-wider uppercase font-semibold">
                          Signature
                        </span>
                      )}
                      {showNewBadge && (
                        <span className="text-[8px] text-emerald-500 font-mono uppercase font-semibold">
                          New
                        </span>
                      )}
                      {showBestBadge && (
                        <span className="text-[8px] text-amber-500 font-mono uppercase font-semibold">
                          Best
                        </span>
                      )}
                      {showCrownBadge && (
                        <span className="text-[8px] text-yellow-500 font-mono uppercase font-semibold">
                          Crown
                        </span>
                      )}
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
                          toggleLikePreset(preset.id)
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
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
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
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
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
