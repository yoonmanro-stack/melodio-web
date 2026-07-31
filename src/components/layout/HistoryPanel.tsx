'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Database } from '@/types/database'
import { useAuth } from '@/hooks/useAuth'
import { useHistory } from '@/hooks/useHistory'
import { X } from 'lucide-react'

type HistoryRow = Database['public']['Tables']['prompt_history']['Row']

interface HistoryPanelProps {
  isOpen: boolean
  onClose: () => void
  onLoad: (row: HistoryRow) => void
}

/** 프롬프트 히스토리 사이드 패널 */
export default function HistoryPanel({ isOpen, onClose, onLoad }: HistoryPanelProps) {
  const { user } = useAuth()
  const { history, loading, fetchHistory, toggleFavorite, deleteHistory } = useHistory()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (isOpen && user) fetchHistory()
  }, [isOpen, user, fetchHistory])

  if (!mounted) return null

  return createPortal(
    <>
      {/* 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
          onClick={onClose}
        />
      )}

      {/* 패널 */}
      <div
        className={`fixed right-0 top-0 h-full w-80 z-[10000] bg-melodio-surface border-l border-melodio-border
                    flex flex-col shadow-2xl transition-transform duration-300 transform
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-melodio-border">
          <h2 className="font-semibold text-melodio-text">히스토리</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-melodio-muted hover:text-melodio-text hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 내용 */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {!user ? (
            <div className="text-center py-12 text-melodio-muted text-sm">
              <div className="text-3xl mb-2">🔒</div>
              Google 로그인 후<br />히스토리가 저장됩니다
            </div>
          ) : loading ? (
            <div className="text-center py-12 text-melodio-muted text-sm">
              <div className="w-5 h-5 border-2 border-melodio-accent/30 border-t-melodio-accent
                              rounded-full animate-spin mx-auto mb-2" />
              불러오는 중...
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-melodio-muted text-sm">
              <div className="text-3xl mb-2">📭</div>
              저장된 히스토리가 없습니다
            </div>
          ) : (
            history.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-melodio-border bg-melodio-card p-3 group"
              >
                {/* 프롬프트 미리보기 */}
                <p className="text-xs text-melodio-text line-clamp-2 mb-2">
                  {row.style_prompt}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-melodio-muted">
                    {new Date(row.created_at).toLocaleDateString('ko-KR')}
                  </span>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* 즐겨찾기 */}
                    <button
                      onClick={() => toggleFavorite(row.id, row.is_favorite)}
                      className="text-xs hover:scale-110 transition-transform"
                    >
                      {row.is_favorite ? '⭐' : '☆'}
                    </button>
                    {/* 불러오기 */}
                    <button
                      onClick={() => { onLoad(row); onClose() }}
                      className="text-xs px-2 py-0.5 rounded bg-melodio-accent/20 text-melodio-accent-light
                                 hover:bg-melodio-accent/30 transition-colors"
                    >
                      불러오기
                    </button>
                    {/* 삭제 */}
                    <button
                      onClick={() => deleteHistory(row.id)}
                      className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
