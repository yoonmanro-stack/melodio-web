/** Melodio — Kie Suno V6 client. */
import type { SunoGenerateRequest, GeneratedTrack } from '@/types'
import { submitKieSunoJob, fetchSunoTask, kieTaskReference, SunoProviderError, SUNO_TIMEOUT_MS } from '../../../worker/suno-provider'

export async function generateWithSuno(req: SunoGenerateRequest): Promise<GeneratedTrack> {
  const { taskId } = await submitKieSunoJob({
    style: req.prompt || req.tags || '',
    lyrics: req.lyrics,
    title: req.title,
    model: req.model,
    instrumental: req.instrumental,
    exclude: req.exclude,
    durationSeconds: req.durationSeconds,
  })
  const deadline = Date.now() + SUNO_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5000))
    let result
    try {
      result = await fetchSunoTask(kieTaskReference(taskId))
    } catch (error) {
      if (error instanceof SunoProviderError && (error.code === 429 || error.code >= 500)) continue
      throw error
    }
    if (result.state === 'failed') throw new Error('Suno V6 음원 생성에 실패했습니다.')
    if (result.state !== 'complete') continue
    const clip = result.clips[0]
    if (!clip?.audio_url) throw new Error('완성된 Suno 음원 URL을 찾을 수 없습니다.')
    return {
      id: clip.id,
      title: clip.title || req.title || 'Untitled',
      audioUrl: clip.audio_url,
      duration: clip.duration || 0,
      engine: 'suno_v5',
      stylePrompt: req.prompt,
      coverArtUrl: clip.image_url,
      createdAt: new Date().toISOString(),
    }
  }
  throw new Error('Suno V6 생성 대기 시간이 초과되었습니다 (15분).')
}
