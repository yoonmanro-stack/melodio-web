'use client'

import { useState } from 'react'
import type { Category } from '@/types'

/** Tag level → 텍스트 컬러 매핑 */
const LEVEL_COLORS: Record<1 | 2 | 3, string> = {
  1: 'text-fuchsia-300',      // 핵심 가이드 — 밝은 퓨셔
  2: 'text-zinc-200',         // 사운드 구성 — 화이트/라이트 그레이
  3: 'text-zinc-400',         // 디테일 톤 — 조금 밝아진 그레이 (피드백 반영)
}

interface CategorySectionProps {
  category: Category
  selected: string[]
  onToggle: (value: string) => void
  /** true면 단일 선택 강제 (tempo, key 등) */
  singleSelect?: boolean
}

/** 일반 카테고리 섹션 — 텍스트 전용 + 3단계 컬러 시스템 */
export default function CategorySection({ category, selected, onToggle, singleSelect }: CategorySectionProps) {
  const [customInput, setCustomInput] = useState('')

  const handleAddCustom = () => {
    const trimmed = customInput.trim()
    if (trimmed && !selected.includes(trimmed)) {
      onToggle(trimmed)
      setCustomInput('')
    }
  }

  return (
    <div className="section-card animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{category.icon}</span>
        <div>
          <h3 className="font-semibold text-melodio-text">{category.title}</h3>
          <p className="text-xs text-melodio-muted">{category.desc}</p>
        </div>
        {singleSelect && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/30 text-cyan-400">
            단일 선택
          </span>
        )}
        {selected.length > 0 && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-melodio-accent/20 text-melodio-accent-light">
            {selected.length}개 선택
          </span>
        )}
      </div>

      {/* 컬러 가이드 레전드 */}
      <div className="flex items-center gap-3 mb-3 text-[10px]">
        <span className={LEVEL_COLORS[1]}>■ 핵심 가이드</span>
        <span className={LEVEL_COLORS[2]}>■ 사운드 구성</span>
        <span className={LEVEL_COLORS[3]}>■ 디테일 톤</span>
      </div>

      {/* 태그 목록 — 텍스트 전용 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {category.tags.map((tag) => {
          const isSelected = selected.includes(tag.value)
          const levelColor = isSelected ? 'text-white' : LEVEL_COLORS[tag.level]

          return (
            <button
              key={tag.value}
              onClick={() => onToggle(tag.value)}
              className={`tag-chip ${isSelected ? 'active' : ''} ${levelColor}`}
            >
              {tag.label}
            </button>
          )
        })}
      </div>

      {/* 커스텀 입력 */}
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
          placeholder={category.placeholder}
          className="flex-1 px-3 py-2 rounded-lg text-sm bg-black/30 border border-zinc-700/80
                     text-melodio-text placeholder:text-melodio-muted/70
                     focus:outline-none focus:border-melodio-accent transition-colors"
        />
        <button
          onClick={handleAddCustom}
          className="px-3 py-2 rounded-lg text-sm bg-melodio-accent/20 text-melodio-accent-light
                     border border-melodio-accent/30 hover:bg-melodio-accent/30 transition-colors"
        >
          + 추가
        </button>
      </div>
    </div>
  )
}
