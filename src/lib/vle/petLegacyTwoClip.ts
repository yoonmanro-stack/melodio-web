import type { PetEpisode, PetShot } from './petEpisode';
import { buildPetPerformanceDirection } from './petPerformanceDirection';

const LEGACY_SECONDS = [4, 5, 5, 6, 6, 4] as const;
const VIDEO_PROMPT_LIMIT = 4096;
const timingNumber = (seconds: number) => Math.round(seconds * 1000) / 1000;

export class PetLegacyCompilationError extends Error {
  readonly status = 422;

  constructor(
    public readonly code: 'PET_LEGACY_EPISODE' | 'PET_LEGACY_TIMELINE' | 'PET_LEGACY_PROMPT_LENGTH',
    message: string,
    public readonly actualLength?: number,
  ) {
    super(message);
    this.name = 'PetLegacyCompilationError';
  }
}

interface Segment {
  shot: PetShot;
  start: number;
  end: number;
  sourceOffset: number;
}

const SOURCE_CONTRACT_LOCK_PREFIX = 'SOURCE CONTRACT LOCK: ';

interface LockedSourceContract {
  version: 'pet-source-contract-v1';
  cast: {
    pet: string;
    humans: Array<{ id: string; role: string; adult: boolean }>;
    requiredVisibleAdults: number;
    humanPolicy: string;
  };
  relationship: string;
  coreAction: string;
  reversal: string;
  payoff: string;
}

export interface LegacyPetStoryContract {
  sourceTopic: string;
  story: string;
  relationship: string;
  coreAction: string;
  reversal: string;
  payoff: string;
  selectedStoryBeats: { setup: string; escalation: string; reversal: string; punchline: string };
  sourceContract?: LockedSourceContract;
  sourceContractLock?: string;
}

function safeText(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.trim().length > 0) && !/data:|base64/i.test(value);
}

function sameStoryFact(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return normalize(left) === normalize(right);
}

function explicitLockedFact(value: string | undefined): string | undefined {
  return value && !/^Not separately stated\b/i.test(value) ? value : undefined;
}

function physicalEndingFact(value: string): string {
  // The frozen source may describe the ending as a caption or inner thought.
  // Its physical interpretation is already authored in the timed S5/S6 actions.
  // Do not turn the literal words back into a generated sign or subtitle.
  return /자막|가사|속마음|\b(?:captions?|lyrics?|subtitles?|dialogue|inner[ -](?:voice|thoughts?))\b/iu.test(value)
    ? 'Use the physical change and reaction authored in the timed S5–S6 actions below; the words are added in editing.'
    : value;
}

/** Character prose sometimes contains later beat directions as well as identity.
 * Keep the original wording of applicable clauses, but do not make a later
 * event into a lock for an earlier provider request.
 */
function scopedCharacterText(value: string, beatIds: Set<string>, firstClip: boolean): string {
  const clauses = value.split(/(?<=[.!?])\s+|;\s*|\n+|,\s*(?=(?:S[1-6]\b|[^,.;]*\bS[1-6]\b))|\s+(?=until\b)|\s+(?:and|but)\s+(?=[^.;]*\b(?:later|finally|payoff|reversal|ends|ending|S5|S6)\b)/iu);
  const applicable = clauses.filter(clause => {
    const references = [...clause.matchAll(/\bS([1-6])(?:\s*[–-]\s*S?([1-6]))?\b/giu)]
      .flatMap(match => match[2]
        ? Array.from({ length: Number(match[2]) - Number(match[1]) + 1 }, (_, index) => `S${Number(match[1]) + index}`)
        : [`S${match[1]}`]);
    if (references.length && references.some(id => !beatIds.has(id))) return false;
    if (firstClip && (/\b(?:later|final|finally|payoff|reversal|ends|ending)\b|\b(?:at|in) the end\b/iu.test(clause)
        || /\bafter\b[^.;]*\b(?:lands?|falls?|wakes?|waking|drops?|pushes?)\b/iu.test(clause))) return false;
    if (!firstClip && !references.length && /\b(?:begins?|opening)\b/iu.test(clause)) return false;
    return true;
  });
  return applicable.length === clauses.length ? value : applicable.join('; ').trim();
}

function readLockedSourceContract(episode: PetEpisode): { contract: LockedSourceContract; line: string } | undefined {
  const lines = episode.shots.flatMap(shot => [shot.keyframePrompt, shot.videoPrompt])
    .filter((prompt): prompt is string => typeof prompt === 'string')
    .flatMap(prompt => prompt.split(/\r?\n/).map(line => line.trim()))
    .filter(line => line.startsWith(SOURCE_CONTRACT_LOCK_PREFIX));
  const unique = [...new Set(lines)];
  if (unique.length !== 1 || !safeText(unique[0])) return undefined;
  try {
    const value = JSON.parse(unique[0].slice(SOURCE_CONTRACT_LOCK_PREFIX.length)) as LockedSourceContract;
    if (value?.version !== 'pet-source-contract-v1' || !value.cast || !safeText(value.cast.pet)
        || !Array.isArray(value.cast.humans) || value.cast.humans.some(human => !safeText(human?.id) || !safeText(human?.role) || typeof human?.adult !== 'boolean')
        || !Number.isInteger(value.cast.requiredVisibleAdults) || value.cast.requiredVisibleAdults < 0
        || !safeText(value.cast.humanPolicy) || !safeText(value.relationship) || !safeText(value.coreAction)
        || !safeText(value.reversal) || !safeText(value.payoff)) return undefined;
    return { contract: value, line: unique[0] };
  } catch {
    return undefined;
  }
}

/** Read the frozen v3 story facts without requiring a new persisted episode schema. */
export function getLegacyPetStoryContract(episode: PetEpisode): LegacyPetStoryContract {
  const locked = readLockedSourceContract(episode);
  const candidates = Array.isArray(episode.candidates) ? episode.candidates : [];
  const selectedIndex = episode.editorialReview?.selectedCandidateIndex;
  const selected = Number.isInteger(selectedIndex) && candidates[selectedIndex as number]
    ? candidates[selectedIndex as number]
    : candidates.find(candidate => candidate.prop === episode.fingerprint?.prop
      && candidate.conflict === episode.fingerprint?.conflict && candidate.twist === episode.fingerprint?.twist);
  const sourceTopic = safeText(episode.sourceTopic, true) ? episode.sourceTopic : '';
  const story = safeText(episode.story, true) ? episode.story : '';
  const relationship = locked?.contract.relationship
    || `Pet: ${episode.character?.appearance || 'the authored pet'}. Human relationship and cast: ${episode.character?.owner || 'follow the authored beats'}. POV: ${episode.pov || 'the authored point of view'}.`;
  const coreAction = locked?.contract.coreAction || episode.fingerprint?.action || selected?.premise || story
    || episode.shots.slice(0, 4).map(shot => shot.action).filter(Boolean).join(' ');
  const lockedReversal = explicitLockedFact(locked?.contract.reversal);
  const lockedPayoff = explicitLockedFact(locked?.contract.payoff);
  const reversal = lockedReversal || selected?.storyBeats?.reversal || episode.shots[4]?.action
    || episode.fingerprint?.twist || story;
  const payoff = lockedPayoff && !sameStoryFact(lockedPayoff, coreAction) && !sameStoryFact(lockedPayoff, reversal)
    ? lockedPayoff
    : episode.fingerprint?.payoff || selected?.storyBeats?.punchline
    || episode.shots[5]?.action || story;
  const selectedStoryBeats = selected?.storyBeats && Object.values(selected.storyBeats).every(value => safeText(value))
    ? selected.storyBeats
    : {
      setup: episode.shots[0]?.beat || episode.shots[0]?.action || coreAction,
      escalation: episode.shots[2]?.beat || episode.shots[2]?.action || coreAction,
      reversal,
      punchline: payoff,
    };
  return {
    sourceTopic,
    story,
    relationship,
    coreAction,
    reversal,
    payoff,
    selectedStoryBeats,
    ...(locked ? { sourceContract: locked.contract, sourceContractLock: locked.line } : {}),
  };
}

/** Derive production timing only. Recorded lyrics and the six editorial beats stay untouched. */
export function compileLegacyPetClips(episode: PetEpisode, timing?: { actionStartSeconds: readonly number[] }): PetShot[] {
  if (!episode || episode.version !== 'pet-v3' || !Array.isArray(episode.shots) || episode.shots.length !== 6) {
    throw new PetLegacyCompilationError('PET_LEGACY_EPISODE', '기존 pet-v3의 여섯 장면 콘티가 필요합니다.');
  }
  const character = episode.character;
  if (!character || !safeText(character.appearance) || !safeText(character.owner, true) || !safeText(character.setting)
      || !Array.isArray(character.continuity) || character.continuity.some(line => !safeText(line))) {
    throw new PetLegacyCompilationError('PET_LEGACY_EPISODE', '기존 캐릭터·주인·공간·연속성 설명을 확인해 주세요.');
  }
  let expectedStart = 0;
  episode.shots.forEach((shot, index) => {
    if (!shot || shot.id !== `S${index + 1}` || shot.startSeconds !== expectedStart || shot.durationSeconds !== LEGACY_SECONDS[index]) {
      throw new PetLegacyCompilationError('PET_LEGACY_TIMELINE', '기존 장면 시간 0·4·9·14·20·26초를 그대로 유지해야 합니다.');
    }
    if (!safeText(shot.action) || !safeText(shot.camera) || !safeText(shot.caption) || !safeText(shot.keyframePrompt)) {
      throw new PetLegacyCompilationError('PET_LEGACY_EPISODE', `${shot.id}의 기존 행동·카메라·자막·기준 이미지 지시가 필요합니다.`);
    }
    expectedStart += shot.durationSeconds;
  });

  const starts = timing?.actionStartSeconds;
  if (starts && (starts.length !== 6 || starts[0] !== 0 || starts.some((start, index) => !Number.isFinite(start)
    || start < 0 || start > 27 || (index > 0 && start - starts[index - 1] < 3))
    || starts[3] < 13.25 || starts[3] > 14.25 || starts[4] < 15)) {
    throw new PetLegacyCompilationError('PET_LEGACY_TIMELINE', '측정 비트에 맞춘 행동 간격과 15초 연결 지점을 확인해 주세요.');
  }
  // Production timing is separate from the recorded lyrics and frozen episode.
  const timedShots = starts ? episode.shots.map((shot, index) => ({ ...shot,
    startSeconds: starts[index], durationSeconds: timingNumber((starts[index + 1] ?? 30) - starts[index]),
  })) : episode.shots;

  const story = getLegacyPetStoryContract(episode);

  return [0, 15].map((clipStart, index) => {
    const segments: Segment[] = timedShots.flatMap(shot => {
      const start = Math.max(clipStart, shot.startSeconds);
      const end = Math.min(clipStart + 15, shot.startSeconds + shot.durationSeconds);
      return end > start ? [{ shot, start: timingNumber(start - clipStart), end: timingNumber(end - clipStart), sourceOffset: timingNumber(start - shot.startSeconds) }] : [];
    });
    const beatIds = new Set(segments.map(({ shot }) => shot.id));
    const characterLocks = [
      ['PET', character.appearance],
      ['OWNER', character.owner],
      ['SETTING', character.setting],
      ...character.continuity.map(line => ['CONTINUITY', line]),
    ].flatMap(([label, value]) => {
      const scoped = scopedCharacterText(value, beatIds, index === 0);
      return scoped ? [`${label}: ${scoped}`] : [];
    });
    const castLocks = story.sourceContract ? [
      `CAST: pet=${story.sourceContract.cast.pet}; humans=${story.sourceContract.cast.humans.map(human => `${human.id}:${human.role}`).join(', ') || 'planner-selected if needed'}`,
    ] : [];
    // Global v3 story/relationship prose has no beat scope and may already
    // describe the ending. The timed local beats are the motion authority.
    const storyLocks = [
      ...castLocks,
      index === 0
        ? 'RELATIONSHIP: Show the locked cast relationship only through the timed beats below.'
        : `RELATIONSHIP: ${story.relationship}`,
      'CORE ACTION: Perform only the action portion assigned to each timed beat below.',
      // The frozen source may call an early action its "reversal". Keep these
      // facts as context, never as new C2 execution cues that restart C1.
      ...(index === 0 ? [] : [`FULL-STORY CONTEXT ONLY (not action cues; never replay completed C1 movement): REVERSAL: ${physicalEndingFact(story.reversal)}; PAYOFF: ${physicalEndingFact(story.payoff)}`]),
    ];
    const direction = [
      ...storyLocks,
      ...characterLocks,
      '15s vertical 9:16 photoreal. Preserve timed actions/cast and essential prop identity, count and holder. Keep moved and untouched objects distinct; no morphing or duplication unless authored. Show transfers with giver release. Let body movement, reactions and camera behavior feel natural. No added events, actors, core props or text.',
      'CAST CONTINUITY: Same identity for every required person. Sleeping, covered or background figures are valid; faces are not mandatory. Hands, crops, POV and off-screen presence are allowed elsewhere; never replace a required person with anonymous limbs throughout the film.',
      'IDENTITY: Stable gender, age, face, hair and clothes; changing expressions never recast a person.',
      buildPetPerformanceDirection(story.sourceContract?.cast.humanPolicy !== 'source_pet_only' && Boolean(character.owner.trim())),
      ...(starts ? ['AUDIO TIMING INTENT: Selected action starts follow detected audio energy events; others keep editorial timing. Approximate motion timing, normal playback speed. Keep the 15s seam continuous; hold the final reaction without rushing.'] : []),
      index === 0
        ? `C1: Begin at S1 and follow the timed actions through ${starts ? 'the opening portion' : 'the first second'} of S4. Do not perform S5 or S6 in this clip.`
        : 'C2: Bridge-frame visible prop holder/position takes priority over original beat starts. Finish only unfinished S4 changes; never undo a completed transfer. Then perform S5–S6 only in their listed timed intervals.',
      ...segments.map(({ shot, start, end, sourceOffset }) => [
        `[${start}-${end}s] ${shot.id}; source ${sourceOffset}-${timingNumber(sourceOffset + end - start)}/${shot.durationSeconds}s.`,
        sourceOffset > 0
          ? 'CONTINUATION: perform only the remaining part from the bridge frame.'
          : end - start < shot.durationSeconds
            ? `PARTIAL: perform ${starts ? 'only the listed opening portion' : 'the first second'} here; leave the remainder for C2.`
            : '',
        sourceOffset > 0 || end - start < shot.durationSeconds
          ? `${sourceOffset > 0 ? 'BACKGROUND BEAT (original start is not execution state)' : 'SOURCE ACTION CONTEXT'} (${shot.durationSeconds}s total): ${shot.action}\nACTION: ${sourceOffset > 0 ? `Continue only source seconds ${sourceOffset}-${timingNumber(sourceOffset + end - start)} from the bridge frame; advance remaining causal change, skipping completed transfers` : `Begin only source seconds 0-${timingNumber(end - start)}; leave the action in progress for C2`}. Do not complete or replay the source action outside this slice.`
          : `ACTION: ${shot.action}`,
        `CAMERA: ${shot.camera}`,
      ].filter(Boolean).join('\n')),
    ].join('\n');
    if (direction.length > VIDEO_PROMPT_LIMIT) {
      throw new PetLegacyCompilationError(
        'PET_LEGACY_PROMPT_LENGTH',
        `C${index + 1} 영상 지시가 4,096자 한도를 넘었습니다 (${direction.length}자). 기존 행동을 자르거나 유료 생성을 시작하지 않았습니다. 콘티의 반복 설명을 검토해 주세요.`,
        direction.length,
      );
    }
    return {
      id: `C${index + 1}`,
      startSeconds: clipStart,
      durationSeconds: 15,
      beat: segments.map(({ shot }) => shot.id).join(' → '),
      caption: segments[0].shot.caption,
      action: segments.map(({ shot }) => shot.action).join('\n'),
      camera: segments.map(({ shot }) => shot.camera).join('\n'),
      keyframePrompt: index === 0
        ? episode.shots[0].keyframePrompt
        : 'Use the frame extracted from C1 at the 15-second seam. Do not generate a new image or reset S4.',
      videoPrompt: direction,
    };
  });
}
