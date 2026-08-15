import type {
  AttentionMode,
  ChannelDna,
  DiscoveryConcept,
  EnergyCurve,
  ListenerIntentProfile,
  ListenerPrimaryPurpose,
  VocalTolerance,
} from '../../types'
import type { LegacyPresetChannelDraft } from './legacy-adapters'

export class ChannelBuilderInputError extends Error {
  readonly field?: string

  constructor(message: string, field?: string) {
    super(message)
    this.name = 'ChannelBuilderInputError'
    this.field = field
  }
}

type RecordValue = Record<string, unknown>

const PURPOSES = new Set<ListenerPrimaryPurpose>([
  'recovery', 'focus', 'space_atmosphere', 'movement', 'memory_emotion', 'story_immersion',
])
const CONCEPTS = new Set<DiscoveryConcept>(['healing', 'focus', 'retro', 'cafe', 'drive', 'story'])
const ATTENTION_MODES = new Set<AttentionMode>([
  'background', 'semi_background', 'listening', 'immersive',
])
const VOCAL_TOLERANCES = new Set<VocalTolerance>(['none', 'minimal', 'allowed', 'preferred'])
const ENERGY_CURVES = new Set<EnergyCurve>(['flat', 'rise', 'fall', 'arc', 'multi_arc'])
const LOCK_MODES = new Set(['locked', 'bounded', 'free'] as const)
const EMOJI_POLICIES = new Set(['none', 'limited', 'allowed'] as const)
const PROMPT_SOURCES = new Set([
  'studio_grade_prompt', 'custom_prompt', 'selections', 'suno_tags', 'description', 'name',
] as const)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function record(value: unknown, field: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChannelBuilderInputError('객체 형식이어야 합니다.', field)
  }
  return value as RecordValue
}

function string(value: unknown, field: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ChannelBuilderInputError('값이 필요합니다.', field)
  }
  const result = value.trim()
  if (result.length > max) throw new ChannelBuilderInputError(`${max}자 이하여야 합니다.`, field)
  return result
}

function optionalString(value: unknown, field: string, max = 500): string {
  if (value === undefined || value === null || value === '') return ''
  return string(value, field, max)
}

function strings(value: unknown, field: string, maxItems = 30): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ChannelBuilderInputError(`${maxItems}개 이하의 배열이어야 합니다.`, field)
  }
  return value.map((item, index) => string(item, `${field}.${index}`, 200))
}

function numberInRange(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ChannelBuilderInputError(`${min}~${max} 범위의 숫자여야 합니다.`, field)
  }
  return value
}

function enumValue<T extends string>(value: unknown, field: string, values: Set<T>): T {
  if (typeof value !== 'string' || !values.has(value as T)) {
    throw new ChannelBuilderInputError('지원하지 않는 값입니다.', field)
  }
  return value as T
}

function enumArray<T extends string>(value: unknown, field: string, values: Set<T>): T[] {
  if (!Array.isArray(value)) throw new ChannelBuilderInputError('배열이어야 합니다.', field)
  return value.map((item, index) => enumValue(item, `${field}.${index}`, values))
}

export function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ChannelBuilderInputError('올바른 UUID가 필요합니다.', field)
  }
  return value
}

export function parseChannelDna(value: unknown): ChannelDna {
  const root = record(value, 'dna')
  const identity = record(root.identity, 'dna.identity')
  const music = record(root.music, 'dna.music')
  const visual = record(root.visual, 'dna.visual')
  const editorial = record(root.editorial, 'dna.editorial')
  const bpmRange = music.bpmRange
  if (!Array.isArray(bpmRange) || bpmRange.length !== 2) {
    throw new ChannelBuilderInputError('최소·최대 BPM 두 값이 필요합니다.', 'dna.music.bpmRange')
  }
  const minBpm = numberInRange(bpmRange[0], 'dna.music.bpmRange.0', 20, 300)
  const maxBpm = numberInRange(bpmRange[1], 'dna.music.bpmRange.1', 20, 300)
  if (minBpm > maxBpm) {
    throw new ChannelBuilderInputError('최소 BPM은 최대 BPM보다 클 수 없습니다.', 'dna.music.bpmRange')
  }

  const locks = record(root.fieldLocks, 'dna.fieldLocks')
  const fieldLocks = Object.fromEntries(
    Object.entries(locks).map(([path, mode]) => [
      string(path, 'dna.fieldLocks.path', 200),
      enumValue(mode, `dna.fieldLocks.${path}`, LOCK_MODES),
    ]),
  )

  return {
    identity: {
      channelName: string(identity.channelName, 'dna.identity.channelName', 120),
      promise: string(identity.promise, 'dna.identity.promise', 500),
      audience: strings(identity.audience, 'dna.identity.audience'),
      signature: string(identity.signature, 'dna.identity.signature', 500),
    },
    music: {
      primaryGenre: string(music.primaryGenre, 'dna.music.primaryGenre', 120),
      allowedGenres: strings(music.allowedGenres, 'dna.music.allowedGenres'),
      forbiddenGenres: strings(music.forbiddenGenres, 'dna.music.forbiddenGenres'),
      bpmRange: [minBpm, maxBpm],
      preferredKeys: strings(music.preferredKeys, 'dna.music.preferredKeys'),
      signatureInstruments: strings(music.signatureInstruments, 'dna.music.signatureInstruments'),
      optionalInstruments: strings(music.optionalInstruments, 'dna.music.optionalInstruments'),
      forbiddenInstruments: strings(music.forbiddenInstruments, 'dna.music.forbiddenInstruments'),
      vocalPolicy: enumValue(music.vocalPolicy, 'dna.music.vocalPolicy', VOCAL_TOLERANCES),
      vocalGenders: strings(music.vocalGenders, 'dna.music.vocalGenders'),
      lyricLanguages: strings(music.lyricLanguages, 'dna.music.lyricLanguages'),
      era: optionalString(music.era, 'dna.music.era', 120),
      productionTextures: strings(music.productionTextures, 'dna.music.productionTextures'),
      forbiddenProductionTraits: strings(
        music.forbiddenProductionTraits, 'dna.music.forbiddenProductionTraits',
      ),
      baseStylePrompt: string(music.baseStylePrompt, 'dna.music.baseStylePrompt', 1000),
      compactTagPrompt: string(music.compactTagPrompt, 'dna.music.compactTagPrompt', 200),
    },
    visual: {
      world: string(visual.world, 'dna.visual.world', 500),
      recurringSubjects: strings(visual.recurringSubjects, 'dna.visual.recurringSubjects'),
      locations: strings(visual.locations, 'dna.visual.locations'),
      palette: strings(visual.palette, 'dna.visual.palette'),
      lighting: strings(visual.lighting, 'dna.visual.lighting'),
      cameraLanguage: strings(visual.cameraLanguage, 'dna.visual.cameraLanguage'),
      eras: strings(visual.eras, 'dna.visual.eras'),
      allowedWeather: strings(visual.allowedWeather, 'dna.visual.allowedWeather'),
      forbiddenElements: strings(visual.forbiddenElements, 'dna.visual.forbiddenElements'),
    },
    editorial: {
      titleVoice: string(editorial.titleVoice, 'dna.editorial.titleVoice', 500),
      descriptionVoice: string(editorial.descriptionVoice, 'dna.editorial.descriptionVoice', 500),
      languages: strings(editorial.languages, 'dna.editorial.languages'),
      emojiPolicy: enumValue(editorial.emojiPolicy, 'dna.editorial.emojiPolicy', EMOJI_POLICIES),
      signaturePhrases: strings(editorial.signaturePhrases, 'dna.editorial.signaturePhrases'),
      forbiddenClaims: strings(editorial.forbiddenClaims, 'dna.editorial.forbiddenClaims'),
    },
    fieldLocks,
  }
}

type ListenerDraft = Omit<ListenerIntentProfile, 'id' | 'channelId' | 'createdAt' | 'updatedAt'>

function parseListenerDraft(value: unknown, prefix = 'listenerIntent'): ListenerDraft {
  const input = record(value, prefix)
  return {
    name: string(input.name, `${prefix}.name`, 120),
    primaryPurpose: enumValue(input.primaryPurpose, `${prefix}.primaryPurpose`, PURPOSES),
    secondaryPurposes: strings(input.secondaryPurposes, `${prefix}.secondaryPurposes`),
    discoveryConcepts: enumArray(input.discoveryConcepts, `${prefix}.discoveryConcepts`, CONCEPTS),
    listenerPersona: string(input.listenerPersona, `${prefix}.listenerPersona`, 500),
    activity: string(input.activity, `${prefix}.activity`, 300),
    environment: string(input.environment, `${prefix}.environment`, 300),
    dayparts: strings(input.dayparts, `${prefix}.dayparts`),
    currentState: string(input.currentState, `${prefix}.currentState`, 300),
    desiredState: string(input.desiredState, `${prefix}.desiredState`, 300),
    desiredBehavior: string(input.desiredBehavior, `${prefix}.desiredBehavior`, 300),
    sessionMinutes: numberInRange(input.sessionMinutes, `${prefix}.sessionMinutes`, 1, 1440),
    attentionMode: enumValue(input.attentionMode, `${prefix}.attentionMode`, ATTENTION_MODES),
    vocalTolerance: enumValue(input.vocalTolerance, `${prefix}.vocalTolerance`, VOCAL_TOLERANCES),
    interruptionTolerance: numberInRange(
      input.interruptionTolerance, `${prefix}.interruptionTolerance`, 0, 100,
    ),
    targetEnergy: numberInRange(input.targetEnergy, `${prefix}.targetEnergy`, 0, 100),
    targetEnergyCurve: enumValue(input.targetEnergyCurve, `${prefix}.targetEnergyCurve`, ENERGY_CURVES),
  }
}

export function parseChannelDraft(value: unknown): LegacyPresetChannelDraft {
  const root = record(value, 'body')
  const channel = record(root.channel, 'channel')
  const source = record(root.source, 'source')
  return {
    channel: {
      channelName: string(channel.channelName, 'channel.channelName', 120),
      conceptPresetId: optionalString(channel.conceptPresetId, 'channel.conceptPresetId', 120),
      promise: string(channel.promise, 'channel.promise', 500),
      discoveryConcepts: enumArray(channel.discoveryConcepts, 'channel.discoveryConcepts', CONCEPTS),
    },
    dna: parseChannelDna(root.dna),
    listenerIntent: parseListenerDraft(root.listenerIntent),
    source: {
      presetId: string(source.presetId, 'source.presetId', 120),
      stylePromptSource: enumValue(
        source.stylePromptSource, 'source.stylePromptSource', PROMPT_SOURCES,
      ),
    },
  }
}

export function parseDnaVersionInput(value: unknown): { dna: ChannelDna; changeSummary: string } {
  const root = record(value, 'body')
  return {
    dna: parseChannelDna(root.dna),
    changeSummary: string(root.changeSummary, 'changeSummary', 500),
  }
}

export function parseListenerIntentUpdate(
  value: unknown,
  channelId: string,
  profileId: string,
): ListenerIntentProfile {
  const draft = parseListenerDraft(value, 'listenerIntent')
  return {
    ...draft,
    id: profileId,
    channelId,
    createdAt: '',
    updatedAt: '',
  }
}
