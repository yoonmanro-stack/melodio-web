'use client'

/**
 * Melodio — 프롬프트 히스토리 커스텀 훅
 * 저장, 조회, 즐겨찾기 토글, 삭제
 */

import { useState, useCallback } from 'react'
import type { PromptPayload, TagSelections } from '@/types'
import type { Database } from '@/types/database'

type HistoryRow = Database['public']['Tables']['prompt_history']['Row']

export function useHistory() {
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/history')
      if (res.ok) {
        const { history } = await res.json()
        setHistory(history ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const saveHistory = useCallback(async (
    payload: PromptPayload,
    selections: TagSelections,
    options?: { presetId?: string; title?: string }
  ) => {
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, selections, ...options }),
    })
    if (res.ok) {
      const { saved } = await res.json()
      setHistory((prev) => [saved, ...prev].slice(0, 50))
      return saved as HistoryRow
    }
    return null
  }, [])

  const toggleFavorite = useCallback(async (id: string, current: boolean) => {
    const res = await fetch(`/api/history/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite: !current }),
    })
    if (res.ok) {
      setHistory((prev) =>
        prev.map((h) => (h.id === id ? { ...h, is_favorite: !current } : h))
      )
    }
  }, [])

  const deleteHistory = useCallback(async (id: string) => {
    const res = await fetch(`/api/history/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setHistory((prev) => prev.filter((h) => h.id !== id))
    }
  }, [])

  return { history, loading, fetchHistory, saveHistory, toggleFavorite, deleteHistory }
}
