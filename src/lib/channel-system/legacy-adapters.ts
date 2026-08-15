import type {
  ChannelDna,
  DiscoveryConcept,
  EnergyCurve,
  ListenerIntentProfile,
  ListenerPrimaryPurpose,
  Preset,
  TrackBlueprint,
  TrackRole,
  VocalTolerance,
} from '../../types'
import type { PlaylistTrack } from '../../types/playlist'

type ListenerIntentDraft = Omit<
  ListenerIntentProfile,
  'id' | 'channelId' | 'createdAt' | 'updatedAt'
>

export interface ChannelBlueprintDraft {
  channelName: string
  conceptPresetId: string
  promise: string
  discoveryConcepts: DiscoveryConcept[]
}
export interface LegacyPresetChannelDraft {
  channel: ChannelBlueprintDraft
  dna: ChannelDna
  listenerIntent: ListenerIntentDraft
  /** 변환에 사용한 레거시 필드의 추적 정보. */
  source: {
    presetId: string
    stylePromptSource:
      | 'studio_grade_prompt'
      | 'custom_prompt'
      | 'selections'
      | 'suno_tags'
      | 'description'
      | 'name'
  }
}

export type TrackBlueprintDraft = Omit<
  TrackBlueprint,
  'id' | 'actualDurationSeconds' | 'status' | 'createdAt' | 'updatedAt'
>

export interface PresetAdapterOptions {
  channelName?: string
  promise?: string
  discoveryConcept?: DiscoveryConcept
  listenerIntentName?: string
  lyricLanguages?: string[]
  visualWorld?: string
  primaryGenre?: string
}

export interface PlaylistTrackAdapterOptions {
  episodeId: string
  totalTracks: number
  targetDurationSeconds?: number
  energy?: number
  bpm?: number
  musicalKey?: string
  leadInstrument?: string
  supportInstruments?: string[]
  role?: TrackRole
  isInstrumental?: boolean
  vocalGender?: string
  lyricLanguage?: string
  lyricTheme?: string
  narrativeBeat?: string
  arrangementVariation?: string
  stylePrompt?: string
  excludePrompt?: string
}

const DISCOVERY_CONCEPTS = new Set<DiscoveryConcept>([
  'healing',
  'focus',
  'retro',
  'cafe',
  'drive',
  'story',
])

const CATEGORY_ALIASES: Record<string, DiscoveryConcept> = {
  cinematic: 'story',
  curation: 'cafe',
  productivity: 'focus',
  sleep: 'healing',
  travel: 'drive',
  nostalgia: 'retro',
}

const PURPOSE_BY_CONCEPT: Record<DiscoveryConcept, ListenerPrimaryPurpose> = {
  healing: 'recovery',
  focus: 'focus',
  retro: 'memory_emotion',
  cafe: 'space_atmosphere',
  drive: 'movement',
  story: 'story_immersion',
}

const INTENT_DEFAULTS: Record<
  DiscoveryConcept,
  {
    activity: string
    environment: string
    currentState: string
    desiredState: string
    desiredBehavior: string
    attentionMode: ListenerIntentDraft['attentionMode']
    vocalTolerance: VocalTolerance
    interruptionTolerance: number
    targetEnergy: number
    targetEnergyCurve: EnergyCurve
    bpmRange: [number, number]
  }
> = {
  healing: {
    activity: '휴식과 감정 회복',
    environment: '개인 공간',
    currentState: '지치고 긴장된 상태',
    desiredState: '마음이 놓이고 편안한 상태',
    desiredBehavior: '방해받지 않고 충분히 쉬기',
    attentionMode: 'background',
    vocalTolerance: 'minimal',
    interruptionTolerance: 10,
    targetEnergy: 20,
    targetEnergyCurve: 'fall',
    bpmRange: [45, 85],
  },
  focus: {
    activity: '공부와 업무',
    environment: '작업 공간',
    currentState: '산만하거나 시작하기 어려운 상태',
    desiredState: '차분하게 몰입한 상태',
    desiredBehavior: '작업을 중단하지 않고 지속하기',
    attentionMode: 'background',
    vocalTolerance: 'none',
    interruptionTolerance: 15,
    targetEnergy: 45,
    targetEnergyCurve: 'flat',
    bpmRange: [70, 110],
  },
  retro: {
    activity: '추억과 분위기 감상',
    environment: '개인 또는 아날로그 콘셉트 공간',
    currentState: '일상적인 상태',
    desiredState: '익숙하고 따뜻한 기억에 잠긴 상태',
    desiredBehavior: '음악과 시대의 분위기를 함께 감상하기',
    attentionMode: 'listening',
    vocalTolerance: 'allowed',
    interruptionTolerance: 55,
    targetEnergy: 50,
    targetEnergyCurve: 'arc',
    bpmRange: [70, 125],
  },
  cafe: {
    activity: '대화와 공간 체류',
    environment: '카페 또는 오프라인 공간',
    currentState: '공간에 처음 들어온 상태',
    desiredState: '편안하고 자연스럽게 머무는 상태',
    desiredBehavior: '대화를 유지하며 오래 체류하기',
    attentionMode: 'semi_background',
    vocalTolerance: 'minimal',
    interruptionTolerance: 20,
    targetEnergy: 40,
    targetEnergyCurve: 'flat',
    bpmRange: [60, 110],
  },
  drive: {
    activity: '운전과 이동',
    environment: '자동차 또는 이동 공간',
    currentState: '이동을 시작하는 상태',
    desiredState: '자유롭고 감성적으로 깨어 있는 상태',
    desiredBehavior: '안정적인 에너지로 이동을 이어가기',
    attentionMode: 'semi_background',
    vocalTolerance: 'allowed',
    interruptionTolerance: 45,
    targetEnergy: 60,
    targetEnergyCurve: 'arc',
    bpmRange: [80, 130],
  },
  story: {
    activity: '세계관과 이야기 감상',
    environment: '개인 감상 공간',
    currentState: '이야기에 진입하기 전 상태',
    desiredState: '서사와 감정선에 몰입한 상태',
    desiredBehavior: '에피소드의 흐름을 끝까지 감상하기',
    attentionMode: 'immersive',
    vocalTolerance: 'preferred',
    interruptionTolerance: 80,
    targetEnergy: 70,
    targetEnergyCurve: 'multi_arc',
    bpmRange: [55, 150],
  },
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean)
  }
  const single = asString(value)
  return single ? [single] : []
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function firstSelection(preset: Preset, key: string): string {
  return asString(preset.selections?.[key]?.[0])
}

function allSelections(preset: Preset, key: string): string[] {
  return asStringArray(preset.selections?.[key])
}

function normalizeDiscoveryConcept(value: unknown, fallbackText: string): DiscoveryConcept {
  const normalized = asString(value).toLowerCase()
  if (DISCOVERY_CONCEPTS.has(normalized as DiscoveryConcept)) {
    return normalized as DiscoveryConcept
  }
  if (CATEGORY_ALIASES[normalized]) return CATEGORY_ALIASES[normalized]

  const text = fallbackText.toLowerCase()
  if (/cinematic|orchestra|fantasy|story|ost|서사|시네마틱/.test(text)) return 'story'
  if (/drive|highway|road trip|travel|드라이브|여행/.test(text)) return 'drive'
  if (/cafe|coffee|restaurant|lounge|jazz bar|카페|레스토랑/.test(text)) return 'cafe'
  if (/retro|vintage|nostalgia|80s|90s|vinyl|향수|레트로/.test(text)) return 'retro'
  if (/focus|study|work|coding|productivity|몰입|공부|업무/.test(text)) return 'focus'
  return 'healing'
}

function resolveStylePrompt(preset: Preset): {
  prompt: string
  source: LegacyPresetChannelDraft['source']['stylePromptSource']
} {
  const metadata = asRecord(preset.metadata)
  const studioPrompt = asString(metadata.studio_grade_prompt)
  if (studioPrompt) return { prompt: studioPrompt, source: 'studio_grade_prompt' }

  const customPrompt = asString(preset.customPrompt)
  if (customPrompt) return { prompt: customPrompt, source: 'custom_prompt' }

  const selectionPrompt = Object.values(preset.selections || {})
    .flatMap(asStringArray)
    .join(', ')
  if (selectionPrompt) return { prompt: selectionPrompt, source: 'selections' }

  const sunoTags = asString(metadata.suno_tags)
  if (sunoTags) return { prompt: sunoTags, source: 'suno_tags' }

  const description = asString(preset.desc)
  if (description) return { prompt: description, source: 'description' }

  return { prompt: asString(preset.name), source: 'name' }
}

function extractBpmRange(text: string, fallback: [number, number]): [number, number] {
  const values = [...text.matchAll(/\b(\d{2,3})\s*(?:-|–|to)?\s*(\d{2,3})?\s*bpm\b/gi)]
    .flatMap((match) => [match[1], match[2]])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .filter((value) => value >= 20 && value <= 300)

  if (values.length === 0) return fallback
  return [Math.min(...values), Math.max(...values)]
}

function extractPreferredKeys(text: string): string[] {
  return unique(
    [...text.matchAll(/(?:key\s+of\s+)?\b([A-G](?:#|b)?\s+(?:major|minor))\b/gi)].map(
      (match) => match[1],
    ),
  )
}

function inferVocalTolerance(text: string, fallback: VocalTolerance): VocalTolerance {
  if (/\b(no vocals?|instrumental only|purely instrumental)\b/i.test(text)) return 'none'
  if (/\binstrumental\b/i.test(text) && !/\bvocals?\b/i.test(text)) return 'none'
  if (/vocal chops?|background vocals?|wordless vocals?/i.test(text)) return 'minimal'
  if (/\b(vocals?|singer|rapper|duet|rap)\b/i.test(text)) return 'allowed'
  return fallback
}

function inferVocalGenders(text: string): string[] {
  const genders: string[] = []
  if (/female|woman|girl|여성/i.test(text)) genders.push('female')
  if (/male|man|boy|남성/i.test(text)) genders.push('male')
  if (/duet|mixed vocal|혼성/i.test(text)) genders.push('duet')
  return unique(genders)
}

function compactPrompt(prompt: string): string {
  if (prompt.length <= 200) return prompt
  const candidates = prompt.split(',').map((part) => part.trim()).filter(Boolean)
  let result = ''
  for (const candidate of candidates) {
    const next = result ? `${result}, ${candidate}` : candidate
    if (next.length > 200) break
    result = next
  }
  return result || prompt.slice(0, 200).trim()
}

/** 기존 Preset 하나를 Channel Builder에서 저장하기 전 초안으로 변환한다. */
export function adaptPresetToChannelDraft(
  preset: Preset,
  options: PresetAdapterOptions = {},
): LegacyPresetChannelDraft {
  const metadata = asRecord(preset.metadata)
  const resolvedPrompt = resolveStylePrompt(preset)
  const searchableText = [
    preset.name,
    preset.desc,
    resolvedPrompt.prompt,
    asString(preset.category),
    asString(metadata.category),
  ].join(' ')
  const concept = options.discoveryConcept ?? normalizeDiscoveryConcept(
    preset.category || metadata.category,
    searchableText,
  )
  const defaults = INTENT_DEFAULTS[concept]
  const primaryGenre = options.primaryGenre
    || firstSelection(preset, 'genre')
    || asString(metadata.primary_genre)
    || asString(metadata.genre)
    || resolvedPrompt.prompt.split(',')[0]?.trim()
    || preset.name
  const bpmRange = extractBpmRange(
    `${firstSelection(preset, 'tempo')} ${resolvedPrompt.prompt}`,
    defaults.bpmRange,
  )
  const vocalPolicy = inferVocalTolerance(resolvedPrompt.prompt, defaults.vocalTolerance)
  const signatureInstruments = unique([
    ...asStringArray(metadata.signature_instruments),
    ...allSelections(preset, 'instruments'),
  ])
  const productionTextures = unique([
    ...asStringArray(metadata.production_textures),
    ...allSelections(preset, 'production'),
  ])
  const era = firstSelection(preset, 'era') || asString(metadata.era)
  const channelName = options.channelName || preset.name
  const promise = options.promise || preset.desc || `${preset.name} 콘셉트의 플레이리스트 채널`
  const visualWorld = options.visualWorld
    || asString(asRecord(metadata.dynamic_elements).visual_world)
    || preset.desc
    || preset.name
  const lyricLanguages = unique([
    ...(options.lyricLanguages || []),
    ...asStringArray(metadata.lyric_languages),
  ])

  return {
    channel: {
      channelName,
      conceptPresetId: preset.id,
      promise,
      discoveryConcepts: [concept],
    },
    dna: {
      identity: {
        channelName,
        promise,
        audience: asStringArray(metadata.audience),
        signature: asString(metadata.signature) || preset.desc || preset.name,
      },
      music: {
        primaryGenre,
        allowedGenres: unique([
          primaryGenre,
          ...allSelections(preset, 'genre').slice(1),
          ...asStringArray(metadata.allowed_genres),
        ]),
        forbiddenGenres: asStringArray(metadata.forbidden_genres),
        bpmRange,
        preferredKeys: unique([
          ...allSelections(preset, 'key'),
          ...extractPreferredKeys(resolvedPrompt.prompt),
        ]),
        signatureInstruments,
        optionalInstruments: asStringArray(metadata.optional_instruments),
        forbiddenInstruments: asStringArray(metadata.forbidden_instruments),
        vocalPolicy,
        vocalGenders: inferVocalGenders(resolvedPrompt.prompt),
        lyricLanguages,
        era,
        productionTextures,
        forbiddenProductionTraits: asStringArray(metadata.forbidden_production_traits),
        baseStylePrompt: resolvedPrompt.prompt,
        compactTagPrompt: compactPrompt(resolvedPrompt.prompt),
      },
      visual: {
        world: visualWorld,
        recurringSubjects: asStringArray(metadata.recurring_subjects),
        locations: asStringArray(metadata.locations),
        palette: asStringArray(metadata.palette),
        lighting: asStringArray(metadata.lighting),
        cameraLanguage: asStringArray(metadata.camera_language),
        eras: unique([era, ...asStringArray(metadata.visual_eras)]),
        allowedWeather: asStringArray(metadata.allowed_weather),
        forbiddenElements: asStringArray(metadata.forbidden_visual_elements),
      },
      editorial: {
        titleVoice: asString(metadata.title_voice) || '상황과 감정을 앞에 두는 간결한 제목',
        descriptionVoice: asString(metadata.description_voice) || '따뜻하고 구체적인 큐레이터 문체',
        languages: unique([
          ...lyricLanguages,
          ...asStringArray(metadata.editorial_languages),
        ]),
        emojiPolicy: metadata.emoji_policy === 'none' || metadata.emoji_policy === 'limited'
          ? metadata.emoji_policy
          : 'allowed',
        signaturePhrases: asStringArray(metadata.signature_phrases),
        forbiddenClaims: unique([
          'guaranteed medical or therapeutic outcome',
          ...asStringArray(metadata.forbidden_claims),
        ]),
      },
      fieldLocks: {
        'identity.channelName': 'locked',
        'identity.promise': 'locked',
        'music.primaryGenre': 'locked',
        'music.bpmRange': 'bounded',
        'music.preferredKeys': 'bounded',
        'music.optionalInstruments': 'free',
        'music.vocalPolicy': 'locked',
        'music.lyricLanguages': 'locked',
        'visual.world': 'locked',
        'visual.palette': 'bounded',
        'visual.allowedWeather': 'free',
        'editorial.languages': 'locked',
      },
    },
    listenerIntent: {
      name: options.listenerIntentName || `${preset.name} 기본 청취 목적`,
      primaryPurpose: PURPOSE_BY_CONCEPT[concept],
      secondaryPurposes: [],
      discoveryConcepts: [concept],
      listenerPersona: asString(metadata.listener_persona) || '이 콘셉트의 분위기와 기능을 원하는 청취자',
      activity: asString(metadata.activity) || defaults.activity,
      environment: asString(metadata.environment) || defaults.environment,
      dayparts: asStringArray(metadata.dayparts),
      currentState: asString(metadata.current_state) || defaults.currentState,
      desiredState: asString(metadata.desired_state) || defaults.desiredState,
      desiredBehavior: asString(metadata.desired_behavior) || defaults.desiredBehavior,
      sessionMinutes: 120,
      attentionMode: defaults.attentionMode,
      vocalTolerance: vocalPolicy,
      interruptionTolerance: defaults.interruptionTolerance,
      targetEnergy: defaults.targetEnergy,
      targetEnergyCurve: defaults.targetEnergyCurve,
    },
    source: {
      presetId: preset.id,
      stylePromptSource: resolvedPrompt.source,
    },
  }
}

function inferTrackRole(trackNumber: number, totalTracks: number): TrackRole {
  if (trackNumber <= 1) return 'opening'
  if (trackNumber >= totalTracks) return 'closing'

  const progress = (trackNumber - 1) / Math.max(totalTracks - 1, 1)
  if (progress < 0.2) return 'immersion'
  if (progress < 0.4) return 'steady'
  if (progress < 0.58) return 'rise'
  if (progress < 0.7) return 'peak'
  if (progress < 0.88) return 'release'
  return 'steady'
}

function inferEnergy(role: TrackRole): number {
  const energyByRole: Record<TrackRole, number> = {
    opening: 45,
    immersion: 55,
    steady: 50,
    rise: 65,
    peak: 80,
    release: 40,
    reprise: 35,
    closing: 25,
  }
  return energyByRole[role]
}

function sectionDescription(track: PlaylistTrack): string {
  return track.sections.find((section) => section.type === 'chorus' && section.description)?.description
    || track.sections.find((section) => section.type === 'verse' && section.description)?.description
    || track.sections.find((section) => section.description)?.description
    || ''
}

/** 기존 PlaylistTrack을 생성 전 Track Blueprint 초안으로 변환한다. */
export function adaptPlaylistTrackToBlueprint(
  track: PlaylistTrack,
  options: PlaylistTrackAdapterOptions,
): TrackBlueprintDraft {
  const trackNumber = track.trackNumber > 0 ? track.trackNumber : 1
  const role = options.role || inferTrackRole(trackNumber, options.totalTracks)
  const hasLyrics = track.sections.some((section) => section.content.trim().length > 0)

  return {
    episodeId: options.episodeId,
    trackNumber,
    songTitle: track.title.trim() || `Track ${trackNumber}`,
    role,
    energy: options.energy ?? inferEnergy(role),
    bpm: options.bpm ?? 90,
    musicalKey: options.musicalKey || '',
    leadInstrument: options.leadInstrument || '',
    supportInstruments: options.supportInstruments || [],
    isInstrumental: options.isInstrumental ?? !hasLyrics,
    vocalGender: options.vocalGender,
    lyricLanguage: options.lyricLanguage,
    lyricTheme: options.lyricTheme,
    narrativeBeat: options.narrativeBeat,
    arrangementVariation: options.arrangementVariation || sectionDescription(track),
    targetDurationSeconds: options.targetDurationSeconds ?? 180,
    stylePrompt: options.stylePrompt,
    excludePrompt: options.excludePrompt,
  }
}

/** 플레이리스트 전체를 원래 순서대로 Track Blueprint 초안으로 변환한다. */
export function adaptPlaylistTracksToBlueprints(
  tracks: PlaylistTrack[],
  options: Omit<PlaylistTrackAdapterOptions, 'totalTracks'>,
): TrackBlueprintDraft[] {
  return tracks.map((track) => adaptPlaylistTrackToBlueprint(track, {
    ...options,
    totalTracks: tracks.length,
  }))
}

/** 새 Blueprint를 기존 LyricsBuilder가 사용하는 PlaylistTrack 형태로 되돌린다. */
export function adaptBlueprintToPlaylistTrack(
  blueprint: Pick<TrackBlueprint, 'trackNumber' | 'songTitle'>,
  legacy?: Partial<Pick<PlaylistTrack, 'youtubeTags' | 'snsHashtags' | 'sections'>>,
): PlaylistTrack {
  return {
    trackNumber: blueprint.trackNumber,
    title: blueprint.songTitle,
    youtubeTags: legacy?.youtubeTags || '',
    snsHashtags: legacy?.snsHashtags || '',
    sections: legacy?.sections || [],
  }
}
