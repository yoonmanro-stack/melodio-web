'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/autopilot')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[60vh] text-zinc-400 text-sm font-sans animate-pulse">
      Auto-Pilot 통합 대시보드로 이동하고 있습니다...
    </div>
  )
}
