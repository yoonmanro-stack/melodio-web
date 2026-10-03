/** Pet pilot contract. Other viral categories keep their existing pipeline. */
export const PET_EPISODE_VERSION = 'pet-v4' as const;
/** Official Grok image-to-video prompt limit; never truncate to fit. */
export const PET_VIDEO_PROMPT_MAX_LENGTH = 4096;
export const LEGACY_PET_SHOT_SECONDS = [4, 5, 5, 6, 6, 4] as const;
/** Editorial beats; provider generation uses two 15-second clips. */
export const PET_SHOT_SECONDS = [3, 5, 7, 5, 6, 4] as const;

export interface PetModelUsage {
  requestedModel: string;
  actualModel: string;
  inputTokens: number;
  outputTokens: number;
  purpose: 'planning' | 'compilation';
}

export interface PetStoryFingerprint {
  prop: string;
  conflict: string;
  twist: string;
  action?: string;
  payoff?: string;
}

export interface PetCandidateReview {
  relatability: number;
  visualClarity: number;
  causalPayoff: number;
  novelty: number;
  comicPayoff?: number;
  payoffMode?: 'comic_reinterpretation' | 'warm_only' | 'caption_explanation';
  reason: string;
  risk: string;
}

export interface PetShot {
  id: string;
  startSeconds: number;
  durationSeconds: number;
  beat: string;
  caption: string;
  action: string;
  camera: string;
  keyframePrompt: string;
  videoPrompt: string;
  state?: PetBeatState;
}

export interface PetActor {
  id: string;
  kind: 'pet' | 'human';
  visibility: 'on_screen' | 'off_screen';
  description: string;
}

export interface PetInventoryItem { id: string; description: string; count: number }
export interface PetSceneState {
  actors: Array<{ actorId: string; position: string }>;
  props: Array<{ propId: string; count: number; position: string; configuration?: string; visibility?: 'visible' | 'occluded' | 'off_screen' }>;
}
export interface PetBeatState {
  actorId: string;
  actionType: 'move' | 'contact' | 'perform' | 'react' | 'reveal';
  affectedPropIds: string[];
  before: PetSceneState;
  after: PetSceneState;
}

/** PetShot-compatible so render jobs can share the legacy request/asset contract. */
export interface PetProductionClip extends PetShot {
  id: 'C1' | 'C2';
  beatIds: string[];
}

export interface PetProduction {
  mode: 'two-clips';
  compilation?: { method: 'deterministic-local'; version: 'pet-compiler-v1' };
  clips: PetProductionClip[];
  inventory: PetInventoryItem[];
  actors: PetActor[];
  actorId: string;
  actor: string;
  coreAction: string;
  payoff: string;
  payoffCauseBeatIds: string[];
  format: string;
  sourceConstraints: Array<{ quote: string; kind: 'situation' | 'actor' | 'action' | 'outcome'; beatIds: string[] }>;
  audioPlan: { targetBpm: number; turnSeconds: 15; vocalsEndBySeconds: 27; cadenceSeconds: 3; alignmentStatus: 'planned' };
}


export interface PetEpisode {
  version: 'pet-v3' | typeof PET_EPISODE_VERSION;
  production?: PetProduction;
  /** Server-compiled delivery plan for existing v3 audio; editorial timing is unchanged. */
  legacyProduction?: { mode: 'two-clips'; version: 'legacy-adapter-v1'; clips: PetShot[] };
  id: string;
  title: string;
  sourceTopic: string;
  story: string;
  pov: 'owner_inner_voice' | 'pet_inner_voice';
  fingerprint: PetStoryFingerprint;
  candidates: Array<PetStoryFingerprint & { title: string; premise: string; relatableMoment?: string; behavioralContradiction?: string; storyBeats?: { setup: string; escalation: string; reversal: string; punchline: string }; ownerWantedToSay?: string; review?: PetCandidateReview }>;
  editorialReview?: { provenance: 'ai_hypothesis'; scoreMeaning: 'model_estimate'; selectedCandidateIndex: number; selectedReason: string; evidenceNote: string };
  character: { species: 'cat' | 'dog'; appearance: string; owner: string; setting: string; continuity: string[] };
  lyrics: string;
  stylePrompt: string;
  shots: PetShot[];
  models: PetModelUsage[];
  createdAt: string;
}

export interface PetVideoJobView {
  id: string;
  episodeId: string;
  status: 'draft' | 'keyframes' | 'review' | 'generating' | 'assembling' | 'completed' | 'failed' | 'held';
  progress: number;
  message: string;
  productionMode?: 'legacy-six-clips' | 'two-clips';
  shots: Array<{ id: string; status: string; keyframeUrl?: string; videoUrl?: string; requestId?: string; error?: string; motionPrompt?: string; quality?: { image?: unknown; video?: unknown } }>;
  audioQuality?: { bpm?: number; confidence?: number; method?: string; endingStatus?: string; endingReasons?: string[] };
  videoUrl?: string;
  durationSeconds?: number;
  estimatedCostUsd: number;
  canResume?: boolean;
}

export function validatePetEpisode(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['콘티가 없습니다.'];
  const e = value as PetEpisode;
  const issues: string[] = [];
  if (e.version !== PET_EPISODE_VERSION && e.version !== 'pet-v3') issues.push('댕냥이 콘티 버전을 확인해 주세요.');
  if (!e.id || !e.title || !e.story || !e.lyrics || !e.stylePrompt) issues.push('제목·스토리·가사·음악 스타일이 필요합니다.');
  if (!['cat', 'dog'].includes(e.character?.species) || !e.character?.appearance || !e.character?.setting) issues.push('고정 캐릭터와 공간이 필요합니다.');
  if (!e.fingerprint?.prop || !e.fingerprint?.conflict || !e.fingerprint?.twist) issues.push('소품·갈등·반전 구분이 필요합니다.');
  if (!Array.isArray(e.shots) || e.shots.length !== 6) return [...issues, '정확히 6개 장면이 필요합니다.'];
  const durations = e.version === 'pet-v3' ? LEGACY_PET_SHOT_SECONDS : PET_SHOT_SECONDS;
  let start = 0;
  e.shots.forEach((s, i) => {
    if (!s || typeof s !== 'object') { issues.push(`장면 ${i + 1} 형식이 잘못되었습니다.`); start += durations[i]; return; }
    if (s.id !== `S${i + 1}` || s.startSeconds !== start || s.durationSeconds !== durations[i]) issues.push(`장면 ${i + 1}의 타임라인이 다릅니다.`);
    if (!s.caption?.trim() || s.caption.length > 56 || !s.action?.trim() || !s.keyframePrompt?.trim() || !s.videoPrompt?.trim()) issues.push(`장면 ${i + 1}의 자막·행동·프롬프트를 확인해 주세요.`);
    if ((s.keyframePrompt?.length || 0) > 5000 || (s.videoPrompt?.length || 0) > 5000) issues.push(`장면 ${i + 1} 프롬프트가 너무 깁니다.`);
    start += durations[i];
  });
  if (e.version === PET_EPISODE_VERSION) issues.push(...validatePetProduction(e));
  return issues;
}

export function isPetTwoClipEpisode(episode: PetEpisode): episode is PetEpisode & { version: 'pet-v4'; production: PetProduction } {
  return episode.version === 'pet-v4' && episode.production?.mode === 'two-clips';
}

export function hasPetTwoClipProduction(episode: PetEpisode): boolean {
  return isPetTwoClipEpisode(episode) || (episode.version === 'pet-v3' && episode.legacyProduction?.mode === 'two-clips');
}

export function getPetProductionShots(episode: PetEpisode): readonly PetShot[] {
  if (episode.version === 'pet-v3' && episode.legacyProduction) return episode.legacyProduction.clips;
  if (episode.version === 'pet-v4') return episode.production?.clips || [];
  return episode.shots;
}

const textWithin = (value: unknown, max = 1000): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/data:|base64/i.test(value);
const idsEqual = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
/** Conservative wording equivalence, not a spatial or visual inference model.
 * Keep direction, landmarks, pose and in/on/off-screen relationships intact.
 * Unrecognized descriptions remain different and require inspection of the draft.
 */
export function canonicalPetPosition(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/-/g, ' ')
    .replace(/\b(?:a|an|the|same|still)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/\bon top of\b/g, 'on')
    .replace(/\binside(?: of)?\b/g, 'in')
    .replace(/\bnext to\b/g, 'beside')
    .replace(/\b(?:on|at|to) (left|right) (?:side )?of\b/g, '$1 of')
    .replace(/\b(left|right) side of\b/g, '$1 of')
    .replace(/\b(?:at|in) (?:middle|center) of\b/g, 'center of')
    .replace(/\s+/g, ' ').trim();
}
const stateKey = (state: PetSceneState) => JSON.stringify({
  actors: [...state.actors].sort((a, b) => a.actorId.localeCompare(b.actorId)).map(a => ({ ...a, position: canonicalPetPosition(a.position) })),
  props: [...state.props].sort((a, b) => a.propId.localeCompare(b.propId)).map(p => ({ ...p, position: canonicalPetPosition(p.position), ...(p.configuration !== undefined ? { configuration: canonicalPetPosition(p.configuration) } : {}) })),
});

/** Structural causal checks, not a claim that a generated film is funny or physically correct. */
export function validatePetProduction(episode: PetEpisode): string[] {
  const p = episode.production;
  if (!p || p.mode !== 'two-clips') return ['pet-v4에는 15초 클립 2개 제작 명세가 필요합니다.'];
  const issues: string[] = [];
  const object = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if ([p.actors, p.inventory, p.clips, p.sourceConstraints, episode.shots].some(items => !Array.isArray(items) || items.some(item => !object(item)))) return ['제작 명세의 주체·소품·클립·원문 연결·장면 형식이 잘못되었습니다.'];
  if (!textWithin(p.actor, 500) || !textWithin(p.coreAction, 700) || !textWithin(p.payoff, 700) || !textWithin(p.format, 80)) issues.push('주체·핵심 행동·인과적 결말·형식이 필요합니다.');
  const actors = Array.isArray(p.actors) ? p.actors : [];
  const inventory = Array.isArray(p.inventory) ? p.inventory : [];
  const actorIds = actors.map(a => a.id);
  const propIds = inventory.map(i => i.id);
  if (!actors.length || actors.length > 3 || new Set(actorIds).size !== actors.length || actors.some(a => !/^A[1-3]$/.test(a.id) || !['pet', 'human'].includes(a.kind) || !['on_screen', 'off_screen'].includes(a.visibility) || !textWithin(a.description, 500))
      || actors.filter(a => a.kind === 'pet' && a.visibility === 'on_screen').length !== 1 || !actorIds.includes(p.actorId)) issues.push('등장 주체 ID와 화면 노출 범위를 확인하세요.');
  if (inventory.length > 4 || new Set(propIds).size !== inventory.length || inventory.some(i => !/^P[1-4]$/.test(i.id) || !textWithin(i.description, 400) || !Number.isInteger(i.count) || i.count < 1 || i.count > 4)) issues.push('소품 ID·설명·정확한 개수 목록이 필요합니다.');
  if (!Array.isArray(p.payoffCauseBeatIds) || !p.payoffCauseBeatIds.length || p.payoffCauseBeatIds.some(id => !['S1', 'S2', 'S3', 'S4', 'S5'].includes(id))) issues.push('결말은 앞선 행동 장면을 원인으로 지정해야 합니다.');
  const constraints = Array.isArray(p.sourceConstraints) ? p.sourceConstraints : [];
  if (typeof episode.sourceTopic !== 'string') return ['입력 원문은 문자열이어야 합니다.'];
  if (episode.sourceTopic.trim() && (!constraints.length || !constraints.some(c => c.kind === 'situation' && c.quote === episode.sourceTopic.trim()))) issues.push('입력 원문 전체의 상황을 보존한 연결 명세가 필요합니다.');
  if (constraints.some(c => !textWithin(c.quote, 1500) || !episode.sourceTopic.includes(c.quote) || !['situation', 'actor', 'action', 'outcome'].includes(c.kind) || !Array.isArray(c.beatIds) || !c.beatIds.length || c.beatIds.some(id => !/^S[1-6]$/.test(id)))) issues.push('원문 제약은 실제 인용과 해당 장면으로 연결해야 합니다.');
  const audio = p.audioPlan;
  if (!audio || audio.alignmentStatus !== 'planned' || audio.turnSeconds !== 15 || audio.vocalsEndBySeconds !== 27 || audio.cadenceSeconds !== 3 || !Number.isInteger(audio.targetBpm) || audio.targetBpm < 70 || audio.targetBpm > 170) issues.push('음악 템포 목표·전환·27초 이전 보컬 종료와 종지 계획이 필요합니다.');
  let previous: PetSceneState | undefined;
  let primaryActs = false;
  for (const shot of episode.shots || []) {
    const state = shot.state;
    if (!state || !actorIds.includes(state.actorId) || !['move', 'contact', 'perform', 'react', 'reveal'].includes(state.actionType) || !Array.isArray(state.affectedPropIds) || state.affectedPropIds.some(id => !propIds.includes(id))) { issues.push(`${shot.id}의 행동 주체와 소품 참조가 잘못되었습니다.`); continue; }
    if (state.actorId === p.actorId && state.actionType !== 'react') primaryActs = true;
    let validStates = true;
    for (const snapshot of [state.before, state.after]) {
      if (!snapshot || !Array.isArray(snapshot.actors) || !Array.isArray(snapshot.props) || snapshot.actors.some(a => !object(a)) || snapshot.props.some(i => !object(i)) || !idsEqual(snapshot.actors.map(a => a.actorId), actorIds) || !idsEqual(snapshot.props.map(i => i.propId), propIds)
          || snapshot.actors.some(a => !textWithin(a.position, 300)) || snapshot.props.some(i => i.count !== inventory.find(prop => prop.id === i.propId)?.count || !textWithin(i.position, 300) || (i.configuration !== undefined && !textWithin(i.configuration, 160)) || (i.visibility !== undefined && !['visible', 'occluded', 'off_screen'].includes(i.visibility)))) { issues.push(`${shot.id}의 시작·종료 상태에서 주체 또는 소품 개수가 바뀌었습니다.`); validStates = false; }
    }
    if (!validStates) continue;
    if (previous && stateKey(previous) !== stateKey(state.before)) issues.push(`${shot.id}가 앞 장면의 종료 상태를 이어받지 않습니다.`);
    for (const prop of state.after.props) {
      const before = state.before.props.find(item => item.propId === prop.propId);
      if (before && canonicalPetPosition(before.position) !== canonicalPetPosition(prop.position) && !state.affectedPropIds.includes(prop.propId)) issues.push(`${shot.id}에서 행동 대상이 아닌 소품이 이동했습니다 (${prop.propId}).`);
      if (before && (before.configuration !== undefined || prop.configuration !== undefined)
          && (!before.configuration || !prop.configuration || canonicalPetPosition(before.configuration) !== canonicalPetPosition(prop.configuration))
          && !state.affectedPropIds.includes(prop.propId)) issues.push(`${shot.id}에서 행동 대상이 아닌 소품의 설정이 변경되었습니다 (${prop.propId}).`);
    }
    previous = state.after;
  }
  if (!primaryActs) issues.push('선택한 주체가 핵심 행동을 직접 수행해야 합니다.');
  if (episode.shots?.[0]?.state?.actionType === 'react' || episode.shots?.[0]?.state?.actionType === 'reveal') issues.push('첫 장면은 소개나 반응 대신 즉시 행동으로 시작해야 합니다.');
  if (new Set((episode.shots || []).map(s => typeof s.camera === 'string' ? s.camera.trim().toLowerCase() : '')).size < 3) issues.push('최소 세 가지 구도로 행동·관계·결말을 구분해야 합니다.');
  const clips = Array.isArray(p.clips) ? p.clips : [];
  if (clips.length !== 2 || clips.some((clip, i) => clip.id !== `C${i + 1}` || clip.startSeconds !== i * 15 || clip.durationSeconds !== 15 || !Array.isArray(clip.beatIds) || clip.beatIds.join(',') !== (i === 0 ? 'S1,S2,S3' : 'S4,S5,S6') || !textWithin(clip.keyframePrompt, 16000) || !textWithin(clip.videoPrompt, PET_VIDEO_PROMPT_MAX_LENGTH))) issues.push('제작 요청은 순서가 고정된 15초 클립 C1·C2이며 영상 프롬프트는 4096자 이하여야 합니다.');
  return [...new Set(issues)];
}
