import { MAX_VOICE_SAMPLE_SECONDS, MAX_VOICE_SOURCE_BYTES, MIN_VOICE_SAMPLE_SECONDS } from './voiceSample'

export type VoiceDownloadFormat = { extension: string; mime: string; label: string }
type DownloadOptions = { signal?: AbortSignal; onStage?: (stage: 'loading' | 'trimming') => void }
type AudioStream = { codec_name?: string; sample_rate?: string; channels?: number; duration?: string }
type AudioProbe = { streams?: AudioStream[]; format?: { format_name?: string; duration?: string; size?: string } }

class VoiceDownloadError extends Error {}

const ASSET_PATH = '/vendor/voice-audio/ffmpeg-0.12.15-core-0.12.10/'
const MAX_OUTPUT_BYTES = 80 * 1024 * 1024
const TIMEOUT_MS = 120_000
const FORMATS: Record<string, VoiceDownloadFormat> = {
  wav: { extension: 'wav', mime: 'audio/wav', label: 'WAV' },
  mp3: { extension: 'mp3', mime: 'audio/mpeg', label: 'MP3' },
  m4a: { extension: 'm4a', mime: 'audio/mp4', label: 'M4A' },
  aac: { extension: 'aac', mime: 'audio/aac', label: 'AAC' },
  ogg: { extension: 'ogg', mime: 'audio/ogg', label: 'OGG' },
  flac: { extension: 'flac', mime: 'audio/flac', label: 'FLAC' },
  webm: { extension: 'webm', mime: 'audio/webm', label: 'WebM' },
}
const MIME_FORMATS: Record<string, string> = {
  'audio/wav': 'wav', 'audio/wave': 'wav', 'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/aac': 'aac', 'audio/x-aac': 'aac', 'audio/ogg': 'ogg', 'application/ogg': 'ogg',
  'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/webm': 'webm',
}
const CONTAINERS: Record<string, string[]> = {
  wav: ['wav'], mp3: ['mp3'], m4a: ['mov', 'mp4', 'm4a'], aac: ['aac'],
  ogg: ['ogg'], flac: ['flac'], webm: ['webm'],
}
const PCM_CODECS = new Set([
  'pcm_u8', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_f64le',
  'pcm_alaw', 'pcm_mulaw',
])

export function getVoiceDownloadFormat(file: { name: string; type: string }): VoiceDownloadFormat | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const format = FORMATS[extension] ?? FORMATS[MIME_FORMATS[file.type.split(';')[0].trim().toLowerCase()]]
  return format ? { ...format } : null
}

function encodingOptions(format: VoiceDownloadFormat, probe: AudioProbe): string[] {
  const stream = probe.streams?.[0]
  const codec = stream?.codec_name
  const containers = probe.format?.format_name?.split(',') ?? []
  if (!codec || !CONTAINERS[format.extension].some((name) => containers.includes(name)) ||
      !stream?.channels || stream.channels > 2) {
    throw new VoiceDownloadError('이 원본의 음성 형식은 유지해서 저장할 수 없습니다. 다른 파일을 선택해 주세요.')
  }
  switch (format.extension) {
    case 'wav': if (PCM_CODECS.has(codec)) return ['-c:a', codec]; break
    case 'mp3': if (codec === 'mp3') return ['-c:a', 'libmp3lame', '-q:a', '2']; break
    case 'm4a':
      if (codec === 'alac') return ['-c:a', 'alac']
      if (codec === 'aac') return ['-c:a', 'aac', '-b:a', '192k']
      break
    case 'aac': if (codec === 'aac') return ['-c:a', 'aac', '-b:a', '192k']; break
    case 'ogg':
    case 'webm':
      if (codec === 'opus') return ['-c:a', 'libopus', '-b:a', '160k']
      if (codec === 'vorbis') return ['-c:a', 'libvorbis', '-q:a', '5']
      break
    case 'flac': if (codec === 'flac') return ['-c:a', 'flac']; break
  }
  throw new VoiceDownloadError('이 원본의 코덱은 유지해서 저장할 수 없습니다. 다른 파일을 선택해 주세요.')
}

function outputName(file: File, format: VoiceDownloadFormat, start: number, end: number) {
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
    .replace(/[. ]+$/g, '').slice(0, 120) || 'vocal'
  const time = (seconds: number) => Number(seconds.toFixed(3)).toString()
  return `${base}-selected-${time(start)}-${time(end)}.${format.extension}`
}

/** Re-encode only the selected passage locally, keeping its container and audio codec. */
export async function trimVoiceSampleOriginal(
  file: File, startSeconds: number, endSeconds: number, options: DownloadOptions = {},
): Promise<File> {
  if (file.size <= 0 || file.size > MAX_VOICE_SOURCE_BYTES) throw new VoiceDownloadError('40MB 이하 음성 파일을 사용해 주세요.')
  const duration = endSeconds - startSeconds
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 ||
      duration < MIN_VOICE_SAMPLE_SECONDS - 0.001 || duration > MAX_VOICE_SAMPLE_SECONDS + 0.001) {
    throw new VoiceDownloadError('6~120초 구간을 선택해 주세요.')
  }
  const format = getVoiceDownloadFormat(file)
  if (!format) throw new VoiceDownloadError('이 파일 형식은 원본 형식으로 저장할 수 없습니다.')
  if (options.signal?.aborted) throw new DOMException('저장이 취소되었습니다.', 'AbortError')

  let ffmpeg: InstanceType<typeof import('@ffmpeg/ffmpeg').FFmpeg> | undefined
  let stopped: Error | undefined
  let rejectStopped: (error: Error) => void = () => undefined
  const interrupted = new Promise<never>((_, reject) => { rejectStopped = reject })
  const stop = (error: Error) => {
    if (stopped) return
    stopped = error
    ffmpeg?.terminate()
    rejectStopped(error)
  }
  const abort = () => stop(new DOMException('저장이 취소되었습니다.', 'AbortError'))
  const timer = setTimeout(() => stop(new VoiceDownloadError('저장 시간이 초과되었습니다. 구간을 줄여 다시 시도해 주세요.')), TIMEOUT_MS)
  options.signal?.addEventListener('abort', abort, { once: true })
  const checkActive = () => { if (stopped) throw stopped }

  const run = async () => {
    options.onStage?.('loading')
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    checkActive()
    const engine = new FFmpeg()
    ffmpeg = engine
    const asset = (name: string) => new URL(`${ASSET_PATH}${name}`, window.location.origin).href
    await engine.load({ classWorkerURL: asset('worker.js'), coreURL: asset('ffmpeg-core.js'), wasmURL: asset('ffmpeg-core.wasm') })
    checkActive()
    const bytes = new Uint8Array(await file.arrayBuffer())
    checkActive()
    const input = `source.${format.extension}`
    const output = `selected.${format.extension}`
    await engine.writeFile(input, bytes)
    checkActive()
    const probe = async (name: string): Promise<AudioProbe> => {
      const metadataPath = `${name}.probe.json`
      const result = await engine.ffprobe([
        '-v', 'error', '-select_streams', 'a:0', '-show_entries',
        'stream=codec_name,sample_rate,channels,duration:format=format_name,duration,size',
        '-of', 'json', name, '-o', metadataPath,
      ])
      checkActive()
      // Core 0.12.10 leaves ffprobe's return code at -1 even on success. Require
      // complete metadata in a fresh file so that a failed probe cannot reuse old data.
      if (result !== 0 && result !== -1) throw new VoiceDownloadError('음성 정보를 읽을 수 없습니다. 다른 파일을 선택해 주세요.')
      const metadata = await engine.readFile(metadataPath, 'utf8')
      checkActive()
      if (typeof metadata !== 'string' || metadata.length > 16_384) throw new VoiceDownloadError('음성 정보를 확인할 수 없습니다.')
      const parsed = JSON.parse(metadata) as AudioProbe
      if (!parsed?.streams?.[0]?.codec_name || !parsed.format?.format_name || !(Number(parsed.format.size) > 0)) {
        throw new VoiceDownloadError('음성 정보를 읽을 수 없습니다. 다른 파일을 선택해 주세요.')
      }
      return parsed
    }
    const source = await probe(input)
    const encoding = encodingOptions(format, source)
    const sourceDuration = Number(source.format?.duration ?? source.streams?.[0]?.duration)
    if (Number.isFinite(sourceDuration) && endSeconds > sourceDuration + 0.1) {
      throw new VoiceDownloadError('선택 구간이 원본 길이를 넘습니다. 끝 지점을 다시 선택해 주세요.')
    }
    options.onStage?.('trimming')
    const result = await engine.exec([
      '-hide_banner', '-loglevel', 'error', '-ss', String(startSeconds), '-i', input,
      '-t', String(duration), '-map', '0:a:0', '-vn', '-map_metadata', '-1',
      ...encoding, '-fs', String(MAX_OUTPUT_BYTES), output,
    ])
    checkActive()
    if (result !== 0) throw new VoiceDownloadError('선택 구간을 저장하지 못했습니다. 다른 구간으로 다시 시도해 주세요.')
    const saved = await probe(output)
    const savedSize = Number(saved.format?.size)
    const savedDuration = Number(saved.format?.duration ?? saved.streams?.[0]?.duration)
    if (!Number.isFinite(savedSize) || savedSize <= 0 || savedSize >= MAX_OUTPUT_BYTES) {
      throw new VoiceDownloadError('저장 파일이 너무 큽니다. 더 짧은 구간을 선택해 주세요.')
    }
    // Compressed containers can include a small encoder-delay/padding interval.
    const padding = Math.max(0.1, 2048 / Number(source.streams?.[0]?.sample_rate ?? 48_000))
    if (!Number.isFinite(savedDuration) || Math.abs(savedDuration - duration) > padding) {
      throw new VoiceDownloadError('선택 구간 전체를 저장하지 못했습니다. 끝 지점을 다시 선택해 주세요.')
    }
    const data = await engine.readFile(output)
    checkActive()
    if (typeof data === 'string' || data.byteLength <= 0 || data.byteLength >= MAX_OUTPUT_BYTES) {
      throw new VoiceDownloadError('저장 파일을 확인할 수 없습니다. 더 짧은 구간을 선택해 주세요.')
    }
    return new File([new Uint8Array(data).buffer], outputName(file, format, startSeconds, endSeconds), { type: format.mime })
  }

  try {
    return await Promise.race([run(), interrupted])
  } catch (error) {
    if (error instanceof VoiceDownloadError || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new VoiceDownloadError('선택 구간을 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    ffmpeg?.terminate()
  }
}
