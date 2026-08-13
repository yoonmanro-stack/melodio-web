/**
 * Melodio — Suno AI V5 클라이언트
 * 현재: Mock 모드 (실제 API 키 없이 파이프라인 E2E 동작 증명)
 * 실제 연동: SUNO_API_KEY 환경변수 필요
 */

import type { SunoGenerateRequest, GeneratedTrack } from '@/types'

const IS_MOCK = !process.env.SUNO_API_KEY

/** 더미 트랙 데이터 생성기 */
function makeMockTrack(req: SunoGenerateRequest): GeneratedTrack {
  return {
    id: `suno-mock-${Date.now()}`,
    title: req.title ?? `Suno Track — ${req.prompt.slice(0, 30)}`,
    audioUrl: 'https://file.302.ai/gpt/imgs/20260721/77a0f845cfc0ee3c394ccddba0d58638.mp3',
    duration: 180,
    engine: 'suno_v5',
    stylePrompt: req.prompt,
    coverArtUrl: 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png',
    createdAt: new Date().toISOString(),
  }
}

/**
 * Suno V5 음악 생성
 * - 풀트랙 (44.1kHz, 최대 4분+)
 * - 보컬 지원
 */
export async function generateWithSuno(req: SunoGenerateRequest): Promise<GeneratedTrack> {
  if (IS_MOCK) {
    await new Promise((r) => setTimeout(r, 2000))
    return makeMockTrack(req)
  }

  const apiKey = process.env.SUNO_API_KEY
  const apiBaseUrl = process.env.SUNO_API_URL || 'https://api.302.ai'

  console.log(`[SunoEngine] Calling 302.ai Suno Submit API (model: ${req.model || 'chirp-v5-5'})`)

  // 1. 302.ai 작업 제출 (Submit)
  const submitRes = await fetch(`${apiBaseUrl}/suno/submit/music`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: req.lyrics ?? '',
      tags: req.prompt ?? req.tags ?? '',
      title: req.title ?? 'Untitled',
      mv: req.model || 'chirp-v5-5',
      make_instrumental: req.instrumental ?? false,
    }),
  })

  if (!submitRes.ok) {
    const errorText = await submitRes.text()
    console.error('[SunoEngine] Submit failed:', errorText)
    throw new Error(`Suno API 제출 실패: ${submitRes.status} ${errorText}`)
  }

  const submitData = await submitRes.json()
  if (submitData.code !== 200 && submitData.code !== 'success' && submitData.message !== 'success') {
    throw new Error(`Suno API 제출 에러: ${submitData.message || JSON.stringify(submitData)}`)
  }

  const taskId = typeof submitData.data === 'string' ? submitData.data : (submitData.data?.task_id || submitData.data?.id)
  if (!taskId) {
    throw new Error(`Suno API 제출 에러: 작업 ID를 찾을 수 없습니다. (${JSON.stringify(submitData)})`)
  }
  console.log(`[SunoEngine] Task submitted successfully. Task ID: ${taskId}`)

  // 2. 작업 상태 조회 (Polling)
  const fetchUrl = `${apiBaseUrl}/suno/fetch/${taskId}`
  let status = 'processing'
  let attempts = 0
  const maxAttempts = 60 // 최대 5분 (5초 * 60)
  let clips: any[] = []

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    attempts++

    console.log(`[SunoEngine] Polling status... Attempt ${attempts}/${maxAttempts}`)

    try {
      const fetchRes = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      if (!fetchRes.ok) {
        console.warn(`[SunoEngine] Fetch failed: ${fetchRes.status}`)
        continue
      }

      const fetchData = await fetchRes.json()
      
      let rawClips = null
      if (fetchData.data) {
        if (Array.isArray(fetchData.data)) {
          rawClips = fetchData.data
        } else if (fetchData.data.data && Array.isArray(fetchData.data.data)) {
          rawClips = fetchData.data.data
        }
      }

      if (rawClips && Array.isArray(rawClips)) {
        clips = rawClips
        
        const allComplete = clips.every(
          (clip: any) => clip.status === 'complete' || clip.status === 'SUCCESS'
        )
        const anyFailed = clips.some(
          (clip: any) => clip.status === 'failed' || clip.status === 'FAILED' || clip.status === 'error'
        )

        if (anyFailed) {
          throw new Error('Suno 음원 생성 중 오류가 발생했습니다.')
        }

        if (allComplete && clips.length > 0) {
          status = 'complete'
          break
        }
      }
    } catch (pollError) {
      console.error('[SunoEngine] Polling error:', pollError)
      // Polling 에러가 발생해도 중단하지 않고 계속 시도
    }
  }

  if (status !== 'complete') {
    throw new Error('Suno 음원 생성 대기 시간이 초과되었습니다 (5분).')
  }

  // 3. 첫 번째 곡 정보를 반환
  const clip = clips[0]
  if (!clip || !clip.audio_url) {
    throw new Error('완성된 Suno 음원 URL을 찾을 수 없습니다.')
  }

  console.log(`[SunoEngine] Generation succeeded! Audio URL: ${clip.audio_url}`)

  return {
    id: clip.id || taskId,
    title: clip.title || req.title || 'Untitled',
    audioUrl: clip.audio_url,
    duration: clip.metadata?.duration || 180,
    engine: 'suno_v5',
    stylePrompt: req.prompt,
    coverArtUrl: clip.image_url || undefined,
    createdAt: new Date().toISOString(),
  }
}
