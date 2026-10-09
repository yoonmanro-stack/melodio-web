/** Serializable cast contracts shared by the studio, ideation and video planner. */
export const DANCE_ANIMAL_SPECIES = ['cat', 'dog', 'penguin', 'otter', 'bear', 'rabbit', 'fox'] as const;
export type DanceAnimalSpecies = typeof DANCE_ANIMAL_SPECIES[number];
export type DanceCastKind = 'human' | 'robot' | 'animal' | 'human_animal';
export type DanceEnsemble = 'solo' | 'duo' | 'trio' | 'crowd';
export type DanceMovementAnatomy = 'human_biped' | 'robot_joints' | 'quadruped' | 'penguin_biped' | 'rabbit_hop' | 'otter_quadruped';
export type DanceCastMember = {
  id: string; kind: Exclude<DanceCastKind, 'human_animal'>; species: 'human' | 'robot' | DanceAnimalSpecies;
  role: 'lead' | 'partner' | 'ensemble'; position: string; identity: string; movementAnatomy: DanceMovementAnatomy;
};
export type DanceCastContract = { version: 1; kind: DanceCastKind; ensemble: DanceEnsemble; count: number; formation: string; members: DanceCastMember[] };
export const DANCE_SPECIES_ANATOMY: Record<DanceCastMember['species'], DanceMovementAnatomy> = {
  human: 'human_biped', robot: 'robot_joints', cat: 'quadruped', dog: 'quadruped', fox: 'quadruped', bear: 'quadruped',
  penguin: 'penguin_biped', rabbit: 'rabbit_hop', otter: 'otter_quadruped',
};
export const DANCE_ANATOMY_GUIDANCE: Record<DanceMovementAnatomy, string> = {
  human_biped: 'two feet, knees, hips, torso and arms', robot_joints: 'fixed articulated joints, two feet and torso',
  quadruped: 'four paws, planted weight shifts, shoulders and natural tail; no human hands or upright human legs',
  penguin_biped: 'two short feet, waddling weight shifts and flippers; no human hands, knees or arms',
  rabbit_hop: 'hind-paw hops, short forepaws and ear accents; no human hands or arms',
  otter_quadruped: 'four short paws, low body sways and natural tail; no human hands or upright human legs',
};

function castError(): never { throw Object.assign(new Error('출연자 구성과 종별 동작을 확인해 주세요.'), { code: 'CREATIVE_CAST' }); }
function text(value: unknown, limit: number): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\u0000-\u001f]/.test(value); }
export function validateDanceCastContract(raw: unknown): DanceCastContract {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return castError();
  const cast = raw as DanceCastContract;
  if (cast.version !== 1 || !['human', 'robot', 'animal', 'human_animal'].includes(cast.kind) || !['solo', 'duo', 'trio', 'crowd'].includes(cast.ensemble) || !Number.isInteger(cast.count) || cast.count < 1 || cast.count > 6 || !text(cast.formation, 100) || !Array.isArray(cast.members) || cast.members.length !== cast.count) return castError();
  const expected = { solo: 1, duo: 2, trio: 3, crowd: 0 }[cast.ensemble];
  if ((expected && cast.count !== expected) || (cast.ensemble === 'crowd' && cast.count < 4)) return castError();
  const ids = new Set<string>(), positions = new Set<string>();
  for (const member of cast.members) {
    if (!member || !text(member.id, 40) || !/^performer_[1-6]$/.test(member.id) || !text(member.position, 40) || !text(member.identity, 140) || !['lead', 'partner', 'ensemble'].includes(member.role) || ids.has(member.id) || positions.has(member.position)) return castError();
    ids.add(member.id); positions.add(member.position);
    if (!Object.hasOwn(DANCE_SPECIES_ANATOMY, member.species) || DANCE_SPECIES_ANATOMY[member.species] !== member.movementAnatomy || member.kind !== (member.species === 'human' ? 'human' : member.species === 'robot' ? 'robot' : 'animal')) return castError();
    if (cast.kind !== 'human_animal' && member.kind !== cast.kind) return castError();
  }
  if (cast.members[0].role !== 'lead' || cast.members.filter(member => member.role === 'lead').length !== 1) return castError();
  if (cast.kind === 'human_animal' && (!cast.members.some(member => member.kind === 'human') || !cast.members.some(member => member.kind === 'animal') || cast.members.some(member => member.kind === 'robot'))) return castError();
  return { ...cast, members: cast.members.map(member => ({ ...member })) };
}

/** Compact text for providers. Structured members remain the authoritative identities. */
export function buildDanceCastPrompt(raw: DanceCastContract): string {
  const cast = validateDanceCastContract(raw);
  const roster = cast.members.map(member => `${member.id}=${member.identity}@${member.position}`).join('; ');
  const anatomy = [...new Set(cast.members.map(member => member.movementAnatomy))].map(id => `${id}: ${DANCE_ANATOMY_GUIDANCE[id]}`).join('; ');
  return `CAST CONTRACT: exactly ${cast.count} ${cast.kind} performers; ${cast.ensemble}; ${cast.formation}. ${roster}. Stable IDs, species, appearance and slots; no added, merged or missing bodies. Anatomy: ${anatomy}.`;
}
