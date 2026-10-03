import { audioBufferToWav, sliceAudioBuffer } from '@/lib/audioWavUtils'

export const MAX_VOICE_SOURCE_BYTES = 40 * 1024 * 1024
export const MIN_VOICE_SAMPLE_SECONDS = 6
export const MAX_VOICE_SAMPLE_SECONDS = 120

/** Keep only the chosen solo-vocal passage; the original stem never leaves the browser. */
export async function trimVoiceSampleToWav(file: File, startSeconds: number, endSeconds: number) {
  if (file.size <= 0 || file.size > MAX_VOICE_SOURCE_BYTES) {
    throw new Error('40MB 이하 음성 파일을 사용해 주세요.')
  }
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 ||
      endSeconds - startSeconds < MIN_VOICE_SAMPLE_SECONDS - 0.01 ||
      endSeconds - startSeconds > MAX_VOICE_SAMPLE_SECONDS + 0.01) {
    throw new Error('코러스가 없는 6~120초 구간을 선택해 주세요.')
  }

  const context = new AudioContext()
  try {
    let decoded: AudioBuffer
    try {
      decoded = await context.decodeAudioData(await file.arrayBuffer())
    } catch {
      throw new Error('이 음성 형식은 브라우저에서 편집할 수 없습니다. MP3 또는 WAV 파일을 사용해 주세요.')
    }
    if (decoded.numberOfChannels < 1 || decoded.numberOfChannels > 2 ||
        !Number.isFinite(decoded.duration) || endSeconds > decoded.duration + 0.01) {
      throw new Error('음성 구간을 확인할 수 없습니다. 시작과 끝 지점을 다시 선택해 주세요.')
    }
    const selected = sliceAudioBuffer(context, decoded, startSeconds, Math.min(endSeconds, decoded.duration))
    const durationSeconds = selected.length / selected.sampleRate
    if (durationSeconds < MIN_VOICE_SAMPLE_SECONDS - 0.02 || durationSeconds > MAX_VOICE_SAMPLE_SECONDS + 0.02) {
      throw new Error('코러스가 없는 6~120초 구간을 선택해 주세요.')
    }
    let output = selected
    if (selected.sampleRate > 48_000) {
      const offline = new OfflineAudioContext(selected.numberOfChannels, Math.ceil(durationSeconds * 48_000), 48_000)
      const source = offline.createBufferSource()
      source.buffer = selected
      source.connect(offline.destination)
      source.start()
      output = await offline.startRendering()
    }
    const wav = audioBufferToWav(output)
    if (wav.size > MAX_VOICE_SOURCE_BYTES) {
      throw new Error('선택 구간이 40MB를 넘습니다. 구간을 짧게 선택해 주세요.')
    }
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'vocal'
    return {
      file: new File([wav], `${baseName}-selected.wav`, { type: 'audio/wav' }),
      durationSeconds,
    }
  } finally {
    await context.close()
  }
}
