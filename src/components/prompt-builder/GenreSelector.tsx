'use client'

import { useState } from 'react'
import type { SubGenre } from '@/types'
import { genreCategory } from '@/data/genres'

/** Tag level → 텍스트 컬러 매핑 */
const LEVEL_COLORS: Record<1 | 2 | 3, string> = {
  1: 'text-fuchsia-300',
  2: 'text-zinc-200',
  3: 'text-zinc-400',
}

interface GenreSelectorProps {
  selected: string[]
  onToggle: (value: string) => void
}

/** 2단계 장르 선택기 (Primary → Sub-genre) — 텍스트 전용 + 3단계 컬러 */
export default function GenreSelector({ selected, onToggle }: GenreSelectorProps) {
  const [activePrimary, setActivePrimary] = useState<string>(genreCategory.subGenres[0].id)

  const currentSubGenre: SubGenre =
    genreCategory.subGenres.find((sg) => sg.id === activePrimary) ?? genreCategory.subGenres[0]

  return (
    <div className="section-card animate-fade-in">
      {/* 카테고리 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{genreCategory.icon}</span>
        <div>
          <h3 className="font-semibold text-melodio-text">{genreCategory.title}</h3>
          <p className="text-xs text-melodio-muted">{genreCategory.desc}</p>
        </div>
        {selected.length > 0 && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-melodio-accent/20 text-melodio-accent-light">
            {selected.length}개 선택
          </span>
        )}
      </div>

      {/* Primary 장르 탭 */}
      <div className="flex flex-wrap gap-1.5 mb-4 p-1 rounded-xl bg-zinc-950/50">
        {genreCategory.subGenres.map((sg) => (
          <button
            key={sg.id}
            onClick={() => setActivePrimary(sg.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activePrimary === sg.id
                ? 'bg-melodio-accent text-white shadow-melodio-glow'
                : 'text-melodio-muted hover:text-melodio-text hover:bg-white/5'
            }`}
          >
            {sg.label}
          </button>
        ))}
      </div>

      {/* 컬러 가이드 레전드 */}
      <div className="flex items-center gap-3 mb-3 text-[10px]">
        <span className={LEVEL_COLORS[1]}>■ 핵심 가이드</span>
        <span className={LEVEL_COLORS[2]}>■ 사운드 구성</span>
        <span className={LEVEL_COLORS[3]}>■ 디테일 톤</span>
      </div>

      {/* Sub-genre 태그 — 텍스트 전용 */}
      <div className="flex flex-wrap gap-2">
        {currentSubGenre.tags.map((tag) => {
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
    </div>
  )
}
