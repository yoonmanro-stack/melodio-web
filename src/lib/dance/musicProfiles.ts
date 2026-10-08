import { DANCE_PRESET } from './preset';

export type DanceVocalPreference = 'recommended' | 'on' | 'off';
export type DanceMusicSpec = {
  version: 2; id: string; label: string; bpm: number; instrumental: boolean; language: 'ko' | 'none';
  style: string; exclude: string; lyrics: string; vocalGender?: 'male' | 'female'; rhythmPurpose: string;
};

/** Music choices describe a groove a viewer can dance to; vocal choice is independent. */
export const DANCE_MUSIC_PROFILES = [
  { id: 'hook-pop', label: '훅 댄스 · 팝', bpm: 116, recommendedVocal: true,
    description: '또렷한 박자와 쉽게 기억하는 짧은 훅', rhythmPurpose: '반복 훅 동작과 좌우 스텝',
    groove: 'Dance pop, buoyant four-on-the-floor kick, crisp backbeat claps, elastic bass, bright synth stabs. Clear two-bar call-and-response hook for a repeatable full-body dance.',
    hooks: ['한 걸음 더 가까이\n같은 순간을 느껴 봐\n너와 나의 작은 움직임\n오늘 밤을 밝히잖아', '이 순간을 놓지 마\n가벼운 마음을 열어 봐\n너의 웃음 따라 움직여\n우리 하루가 빛나잖아'] },
  { id: 'afro-groove', label: '그루브 · 아프로', bpm: 106, recommendedVocal: true,
    description: '당김음과 퍼커션에 맞춘 편안한 바운스', rhythmPurpose: '골반·어깨 그루브와 체중 이동',
    groove: 'Afro pop dance groove, interlocking shakers and hand percussion, syncopated warm bass, spacious kick, light guitar replies. A relaxed pocket with clear accents for weight shifts and hip-and-shoulder movement.',
    hooks: ['바람 따라 한 걸음\n마음 따라 또 한 걸음\n우리 함께 걷는 길에\n따뜻한 웃음이 번져', '서두르지 않아도 돼\n같은 바람을 느껴 봐\n너와 나의 걸음마다\n새로운 하루가 열려'] },
  { id: 'house-footwork', label: '풋워크 · 하우스', bpm: 128, recommendedVocal: false,
    description: '선명한 킥과 하이햇으로 발동작을 살리는 리듬', rhythmPurpose: '발 교차·스텝 터치·방향 전환',
    groove: 'Dancefloor house, steady four-on-the-floor kick, offbeat open hats, crisp claps, rolling bass and short piano chords. Audible beat subdivisions support readable alternating footwork and direction changes.',
    hooks: ['불빛 아래 길을 열어\n가벼운 발로 나아가\n우리가 만나는 이 순간\n새로운 밤이 시작돼', '한 걸음에 마음을 담아\n두 걸음에 웃음을 담아\n우리가 만드는 이 길\n끝없이 이어지잖아'] },
  { id: 'hiphop-bounce', label: '바운스 · 힙합', bpm: 100, recommendedVocal: true,
    description: '묵직한 드럼과 짧은 구절로 바운스를 만드는 훅', rhythmPurpose: '무릎 바운스·몸통 악센트·스텝',
    groove: 'Original hip-hop dance, punchy kick and dry snare, swung hats, warm sub bass, sparse melodic replies. A confident accessible bounce with distinct body-accent pockets and a compact memorable chorus.',
    hooks: ['내 길 위에 서 있어\n조금 달라도 괜찮아\n우리만의 걸음으로\n새로운 문을 열어 봐', '오늘의 나를 믿어 봐\n어제의 걱정 내려놔\n우리 함께 움직이면\n작은 꿈도 자라나'] },
  { id: 'latin-step', label: '라틴 · 스텝', bpm: 110, recommendedVocal: true,
    description: '라틴 퍼커션과 당김음으로 만드는 경쾌한 스텝', rhythmPurpose: '좌우 스텝·골반 리듬·작은 회전',
    groove: 'Latin pop dance, crisp dembow-inspired kick and rim pattern, lively congas, syncopated bass and bright rhythmic guitar. Clear recurring accents invite side steps, hip movement and small grounded turns.',
    hooks: ['햇살 같은 너의 웃음\n내 마음에 번져 와\n우리 함께 걷는 오늘\n아름다운 길이 되어', '손을 잡고 나아가\n밝은 하루를 만나 봐\n너와 내가 웃는 순간\n온 세상이 따뜻해져'] },
  { id: 'brazil-funk', label: '브라질 펑크 · 리듬', bpm: 130, recommendedVocal: true,
    description: '타격감 있는 퍼커션과 짧은 응답 훅', rhythmPurpose: '빠른 발 스텝·무릎 바운스·리듬 응답',
    groove: 'Brazilian funk dance groove, punchy tamborzão-inspired percussion, tight low-end pulses, short bright synth responses and clean syncopated accents. Energetic grounded knee bounce and quick readable steps, without abrasive distortion.',
    hooks: ['지금 여기 모여 봐\n우리 마음을 열어 봐\n작은 움직임이 만나\n오늘 하루를 깨워 봐', '함께라서 즐거워\n너의 웃음이 반가워\n한 걸음씩 이어 가면\n새로운 길이 나타나'] },
] as const;

const BASE_STYLE = 'Compose a complete original dance song with an immediate memorable hook, complete verses and choruses, a contrasting dance break, a final hook reprise and a natural musical ending. Keep the groove strong and stable, repeat a short distinctive motif with small rhythmic variations, and provide several coherent sections suitable for selecting a 30-second dance challenge. Original melody, harmony and lyrics; no artist imitation.';
const BASE_EXCLUDE = 'existing songs, recognizable borrowed melodies, samples, covers, artist imitation, celebrity voices, long ambient intro, unstable tempo, harsh distortion, abrupt ending';
const INSTRUMENTAL_SECTIONS = '[Instrumental]\n[Main Theme]\n[Theme Variation]\n[Dance Break]\n[Final Theme]\n[Outro]';
const VERSE = '조금 낯선 하루에도\n내 마음은 열려 있어\n너의 작은 웃음 하나\n새로운 용기가 되어';
const SECOND_VERSE = '바쁜 길을 지나오면\n잠시 쉬어 가도 좋아\n서로 다른 우리 마음\n같은 순간을 만나네';

function seedNumber(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

export function resolveDanceMusicSpec(profileId?: unknown, vocalPreference?: unknown, seed = ''): DanceMusicSpec {
  const id = profileId === undefined ? DANCE_MUSIC_PROFILES[0].id : profileId;
  const profile = DANCE_MUSIC_PROFILES.find(item => item.id === id);
  if (!profile) throw new Error('목록에서 댄스 음악을 선택해 주세요.');
  const preference = vocalPreference === undefined ? 'recommended' : vocalPreference;
  if (!['recommended', 'on', 'off'].includes(String(preference)) || typeof preference !== 'string') throw new Error('보컬은 추천·포함·없음 중에서 선택해 주세요.');
  const instrumental = preference === 'off' || (preference === 'recommended' && !profile.recommendedVocal);
  const variant = seedNumber(String(seed));
  const vocalGender = variant % 2 === 0 ? 'female' as const : 'male' as const;
  const chorus = profile.hooks[Math.floor(variant / 2) % profile.hooks.length];
  return {
    version: 2, id: profile.id, label: profile.label, bpm: profile.bpm, instrumental, language: instrumental ? 'none' : 'ko',
    rhythmPurpose: profile.rhythmPurpose,
    style: `${BASE_STYLE} ${profile.groove} ${profile.bpm} BPM. ${instrumental ? 'Instrumental only, no voices.' : `Korean lyrics, one natural ${vocalGender} lead vocal, sing the complete meaningful chorus clearly with short melodic phrases and instrumental space for movement.`}`,
    exclude: `${BASE_EXCLUDE}${instrumental ? ', vocals, speech' : ', spoken production instructions, wordless-only vocal hook'}`,
    lyrics: instrumental ? INSTRUMENTAL_SECTIONS : `[Chorus]\n${chorus}\n\n[Verse]\n${VERSE}\n\n[Verse 2]\n${SECOND_VERSE}\n\n[Chorus]\n${chorus}\n\n[Bridge]\n가벼운 마음으로\n우리의 내일을 만나\n\n[Chorus]\n${chorus}\n\n[Outro]\n이 순간을 기억해\n우리 함께 만든 하루`,
    ...(instrumental ? {} : { vocalGender }),
  };
}

/** Read a stored recipe as a snapshot; never reinterpret an old song as a new choice. */
export function getDanceMusicSpec(metadata: unknown): DanceMusicSpec | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  const value = meta.danceMusic;
  if (value !== undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const spec = value as Record<string, unknown>;
    if (spec.version !== 2 || typeof spec.id !== 'string' || !spec.id.trim() || spec.id.length > 80 || typeof spec.label !== 'string' || !spec.label.trim() || spec.label.length > 100
      || typeof spec.bpm !== 'number' || !Number.isFinite(spec.bpm) || spec.bpm < 60 || spec.bpm > 200
      || typeof spec.instrumental !== 'boolean' || (spec.language !== 'ko' && spec.language !== 'none')
      || typeof spec.style !== 'string' || !spec.style.trim() || spec.style.length > 1000
      || typeof spec.exclude !== 'string' || spec.exclude.length > 1000 || typeof spec.lyrics !== 'string' || spec.lyrics.length > 5000
      || typeof spec.rhythmPurpose !== 'string' || !spec.rhythmPurpose.trim() || spec.rhythmPurpose.length > 200
      || (spec.vocalGender !== undefined && spec.vocalGender !== 'male' && spec.vocalGender !== 'female')
      || (spec.instrumental && (spec.language !== 'none' || spec.vocalGender !== undefined))
      || (!spec.instrumental && (spec.language !== 'ko' || !spec.lyrics.trim()))) return null;
    return { version: 2, id: spec.id, label: spec.label, bpm: spec.bpm, instrumental: spec.instrumental, language: spec.language as DanceMusicSpec['language'],
      style: spec.style, exclude: spec.exclude, lyrics: spec.lyrics, rhythmPurpose: spec.rhythmPurpose,
      ...(spec.vocalGender ? { vocalGender: spec.vocalGender as 'male' | 'female' } : {}) };
  }
  const preset = meta.dancePreset as Record<string, unknown> | undefined;
  if (meta.workflow !== 'dance-music-first-v1' || meta.presetId !== 'dance_challenge'
    || (preset?.id !== DANCE_PRESET.id && meta.stylePrompt !== DANCE_PRESET.style
      && !(meta.isInstrumental === true && meta.danceVariant && meta.danceAudioSelection))) return null;
  return { version: 2, id: DANCE_PRESET.id, label: DANCE_PRESET.label, bpm: DANCE_PRESET.bpm, instrumental: true, language: 'none',
    style: DANCE_PRESET.style, exclude: DANCE_PRESET.exclude, lyrics: DANCE_PRESET.arrangement, rhythmPurpose: '기존 138 BPM 연주곡 훅 동작' };
}
