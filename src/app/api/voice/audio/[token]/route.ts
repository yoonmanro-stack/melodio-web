import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { assertCustomVoiceAudioPath } from '@/lib/voice/custom-voice-integrity'
import { parseCustomVoiceAudioLink } from '@/lib/voice/custom-voice-audio-link'
import { readCustomVoice } from '@/lib/voice/custom-voice-repository'

export const dynamic = 'force-dynamic'

const BUCKET = 'melodio-private'

async function redirectToPrivateAudio(token: string) {
  try {
    const decoded = parseCustomVoiceAudioLink(token)
    if (!decoded) {
      console.error('[voice/audio] invalid_link')
      return new Response(null, { status: 404 })
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return new Response(null, { status: 503 })
    const admin = createSupabaseClient<Database>(url, key, { auth: { persistSession: false } })
    const row = await readCustomVoice(admin, decoded.userId, decoded.registrationId)
    if (!row) {
      console.error('[voice/audio] record_missing')
      return new Response(null, { status: 404 })
    }
    const fields = row.physical_layers as Record<string, Json> | null
    const registration = fields?.registration as Record<string, Json> | null
    const path = registration?.[decoded.kind === 'source' ? 'sourceObjectPath' : 'verificationObjectPath']
    if (typeof path !== 'string') {
      console.error('[voice/audio] path_missing')
      return new Response(null, { status: 404 })
    }
    const safePath = assertCustomVoiceAudioPath(row, path, decoded.kind)
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(safePath, 5 * 60)
    if (error || !data?.signedUrl) {
      console.error('[voice/audio] signing_failed')
      return new Response(null, { status: 503 })
    }
    const response = NextResponse.redirect(data.signedUrl, 307)
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch {
    console.error('[voice/audio] unexpected_error')
    return new Response(null, { status: 404 })
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  return redirectToPrivateAudio((await params).token)
}

export async function HEAD(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  return redirectToPrivateAudio((await params).token)
}
