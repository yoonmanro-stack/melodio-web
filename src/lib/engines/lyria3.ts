/**
 * Melodio — Google Lyria 3 (Vertex AI) 클라이언트
 * 현재: Mock 모드 (실제 API 키 없이 파이프라인 E2E 동작 증명)
 * 실제 연동: GOOGLE_CLOUD_PROJECT, VERTEX_AI_LOCATION 환경변수 필요
 */

import type { LyriaGenerateRequest, GeneratedTrack } from '@/types'

const IS_MOCK = !process.env.GOOGLE_CLOUD_PROJECT

/** 더미 트랙 데이터 생성기 */
function makeMockTrack(prompt: string): GeneratedTrack {
  return {
    id: `lyria-mock-${Date.now()}`,
    title: `Lyria Track — ${prompt.slice(0, 30)}...`,
    audioUrl: 'https://file.302.ai/gpt/imgs/20260721/cfd533909f68a8ddbf28204ad7782803.mp3',
    duration: 30,
    engine: 'lyria3',
    stylePrompt: prompt,
    coverArtUrl: 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png',
    createdAt: new Date().toISOString(),
  }
}

/**
 * Lyria 3 음악 생성
 * - 퀵 프리뷰 / BGM 전용 (48kHz, 최대 30초)
 * - 보컬 없음 (Instrumental 전용)
 */
export async function generateWithLyria3(req: LyriaGenerateRequest): Promise<GeneratedTrack> {
  if (IS_MOCK) {
    // Mock 딜레이 시뮬레이션
    await new Promise((r) => setTimeout(r, 1500))
    return makeMockTrack(req.prompt)
  }

  // TODO: 실제 Vertex AI API 연동
  // const { VertexAI } = await import('@google-cloud/vertexai')
  // const vertexAI = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT })
  // ...

  throw new Error('Lyria 3 실제 API 연동 미구현 — Mock 모드를 사용하세요')
}
