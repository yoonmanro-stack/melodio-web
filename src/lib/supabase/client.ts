/**
 * Melodio — Supabase 브라우저 클라이언트
 * Client Components ('use client') 에서 사용
 */

import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfsfxzhunkrjyibsdswb.supabase.co",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_key_for_build"
    )
  }
  return client
}
