import type { ChannelDna, ChannelEpisode, DiscoveryConcept } from '../../types'

export interface PublishPackageDraft {
  uploadTitle: string
  description: string
  tags: string[]
  hashtags: string[]
  coverPrompt: string
}

const CONCEPT_TAGS: Record<DiscoveryConcept, string[]> = {
  healing: ['힐링음악', '마음의위로'],
  focus: ['집중음악', '작업용BGM'],
  retro: ['레트로음악', '아날로그감성'],
  cafe: ['카페음악', '매장음악'],
  drive: ['드라이브음악', '감성여행'],
  story: ['시네마틱음악', '스토리플레이리스트'],
}

function clean(value: string) { return value.replace(/\s+/g, ' ').trim() }
function unique(values: string[]) { return [...new Set(values.map(clean).filter(Boolean))] }

function durationLabel(seconds: number) {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${minutes}분`
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`
}

export function compilePublishPackage(
  dna: ChannelDna,
  episode: ChannelEpisode,
  options: {
    channelName: string
    channelPromise: string
    actualDurationSeconds: number
    tracklistText: string
    discoveryConcepts: DiscoveryConcept[]
  },
): PublishPackageDraft {
  const duration = durationLabel(options.actualDurationSeconds)
  const uploadTitle = clean(`${episode.episodeTitle} | ${duration} ${dna.music.primaryGenre} Playlist`).slice(0, 100)
  const signature = dna.editorial.signaturePhrases[0]
  const intro = clean([
    signature,
    `${episode.location}의 ${episode.daypart}, ${episode.situation}을 위해 만든 ${duration} 플레이리스트입니다.`,
    options.channelPromise,
  ].filter(Boolean).join(' '))
  const description = [
    intro,
    `이 Episode는 “${episode.emotionalArc}”의 흐름으로 구성했으며 실제 음원 길이를 기준으로 타임스탬프를 계산했습니다.`,
    '🎧 Tracklist',
    options.tracklistText,
    `© ${options.channelName} · AI-assisted music production by Melodio`,
  ].join('\n\n')
  const tags = unique([
    options.channelName,
    dna.music.primaryGenre,
    ...dna.music.allowedGenres.slice(0, 5),
    episode.situation,
    episode.location,
    episode.daypart,
    ...options.discoveryConcepts.flatMap((concept) => CONCEPT_TAGS[concept]),
    'playlist', 'bgm', 'Melodio',
  ]).slice(0, 20)
  const hashtags = unique([
    ...options.discoveryConcepts.flatMap((concept) => CONCEPT_TAGS[concept]),
    dna.music.primaryGenre.replace(/\s+/g, ''),
    '플레이리스트', 'BGM',
  ]).map((tag) => `#${tag.replace(/[^\p{L}\p{N}_]/gu, '')}`).filter((tag) => tag.length > 1).slice(0, 8)
  const visual = dna.visual
  const coverPrompt = clean([
    `Square 1:1 premium album cover for the music episode "${episode.episodeTitle}".`,
    `Visual world: ${visual.world}.`,
    `Scene: ${episode.location}, ${episode.daypart}, ${episode.season || 'timeless season'}, ${episode.weather || 'calm weather'}.`,
    visual.recurringSubjects.length ? `Recurring subjects: ${visual.recurringSubjects.join(', ')}.` : '',
    `Palette: ${visual.palette.join(', ')}. Lighting: ${visual.lighting.join(', ')}.`,
    visual.cameraLanguage.length ? `Camera language: ${visual.cameraLanguage.join(', ')}.` : '',
    `Express the emotional arc: ${episode.emotionalArc}.`,
    `Preserve the channel's recognizable visual DNA while giving this episode one distinct focal scene.`,
    visual.forbiddenElements.length ? `Exclude: ${visual.forbiddenElements.join(', ')}.` : '',
    'High-fidelity editorial artwork, clean composition, no text, no typography, no logo, no watermark, no letters, no border.',
  ].filter(Boolean).join(' ')).slice(0, 2000)
  return { uploadTitle, description, tags, hashtags, coverPrompt }
}
