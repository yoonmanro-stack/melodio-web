import { buildConceptContextInstructions } from '../vle/conceptContextDirection';
import { readPetBoundedBody } from '../video/petMedia';
import { DANCE_MUSIC_PROFILES, getDanceMusicSpec, type DanceMusicSpec, type DanceVocalPreference } from './musicProfiles';

export type DanceConceptMusicInput = { requestId: string; coreContext: string; musicProfileId?: string; vocalPreference: DanceVocalPreference };
export type DanceConceptMusicPlan = { title: string; genre: string; music: DanceMusicSpec };
export class DanceConceptMusicPlanError extends Error {
  constructor(message: string, public code = 'MUSIC_PLAN_INVALID') { super(message); }
}
export function validateDanceConceptMusicPlan(value: unknown, input: DanceConceptMusicInput): DanceConceptMusicPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DanceConceptMusicPlanError('음악 설계 결과를 확인하지 못했습니다.');
  const plan = value as Record<string, unknown>;
  if (Object.keys(plan).some(key => !['title', 'genre', 'bpm', 'instrumental', 'language', 'style', 'exclude', 'lyrics', 'rhythmPurpose', 'vocalGender'].includes(key))
    || typeof plan.title !== 'string' || !plan.title.trim() || plan.title.length > 150 || /[\u0000-\u001f]|data:|base64/i.test(plan.title)
    || typeof plan.genre !== 'string' || !plan.genre.trim() || plan.genre.length > 100) throw new DanceConceptMusicPlanError('음악 제목과 장르 설계를 확인하지 못했습니다.');
  const profile = input.musicProfileId ? DANCE_MUSIC_PROFILES.find(item => item.id === input.musicProfileId) : undefined;
  if ((input.musicProfileId && !profile) || (profile && (plan.bpm !== profile.bpm || plan.genre !== profile.label))
    || (input.vocalPreference === 'on' && plan.instrumental !== false) || (input.vocalPreference === 'off' && plan.instrumental !== true)
    || (plan.instrumental ? plan.vocalGender !== 'none' : !['male', 'female'].includes(plan.vocalGender as string))) {
    throw new DanceConceptMusicPlanError('음악 설계가 명시한 음악·보컬 선택과 다릅니다.');
  }
  const music = getDanceMusicSpec({ danceMusic: { version: 2, id: profile?.id || `context-${input.requestId}`, label: plan.genre,
    bpm: plan.bpm, instrumental: plan.instrumental, language: plan.language, style: plan.style, exclude: plan.exclude,
    lyrics: plan.lyrics, rhythmPurpose: plan.rhythmPurpose, ...(plan.vocalGender === 'none' ? {} : { vocalGender: plan.vocalGender }) } });
  if (!music || /data:|base64/i.test(`${music.style}\n${music.lyrics}`)) throw new DanceConceptMusicPlanError('완성된 음악 스타일과 가사 설계를 확인하지 못했습니다.');
  return { title: plan.title.trim(), genre: plan.genre.trim(), music };
}
/** One planning request, with no repair, profile/lyrics fallback, or automatic retry. */
export async function createDanceConceptMusicPlan(input: DanceConceptMusicInput, fetchImpl: typeof fetch = fetch): Promise<DanceConceptMusicPlan> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new DanceConceptMusicPlanError('음악 설계 설정을 확인해 주세요.', 'MUSIC_PLAN_CONFIG');
  const profile = input.musicProfileId ? DANCE_MUSIC_PROFILES.find(item => item.id === input.musicProfileId) : undefined;
  const schema = { type: 'object', additionalProperties: false, required: ['title', 'genre', 'bpm', 'instrumental', 'language', 'style', 'exclude', 'lyrics', 'rhythmPurpose', 'vocalGender'], properties: {
    title: { type: 'string' }, genre: { type: 'string', ...(profile ? { enum: [profile.label] } : {}) },
    bpm: { type: 'number', ...(profile ? { enum: [profile.bpm] } : {}) },
    instrumental: { type: 'boolean', ...(input.vocalPreference === 'recommended' ? {} : { enum: [input.vocalPreference === 'off'] }) },
    language: { type: 'string', enum: ['ko', 'none'] }, style: { type: 'string' }, exclude: { type: 'string' }, lyrics: { type: 'string' },
    rhythmPurpose: { type: 'string' }, vocalGender: { type: 'string', enum: ['male', 'female', 'none'] },
  } };
  const system = `${buildConceptContextInstructions('dance')}\nDesign NEW original music from the user's core concept and context, before any audio exists. Infer genre, mood, instrumentation, groove, BPM, instrumental/vocal mode and voice together so the music serves this event and its viewing reward. Do not reuse stock lyrics, a preset song, fixed plot or universal dance genre. An explicit profile locks its genre, BPM and groove; vocal on/off locks only voice inclusion. Recommended means infer voice or instrumental mode from context. Write an original complete song with a memorable immediate hook, coherent verses/choruses or instrumental variations, a contrasting section, and a natural ending; the user will later select 30 seconds. No artist imitation, borrowed melody or celebrity voice. Vocal lyrics are original meaningful Korean lyrics, not production instructions. Instrumental mode has language none and vocalGender none. Return title <=150 characters, genre <=100, BPM 60-200, style <=1000, exclude <=1000, lyrics <=5000, rhythmPurpose <=200. The style is the complete music-generation recipe. Output only the schema.`;
  let response: Response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(150_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.6-sol', reasoning_effort: 'low', max_completion_tokens: 6144,
        response_format: { type: 'json_schema', json_schema: { name: 'dance_concept_music_v1', strict: true, schema } },
        messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ coreContext: input.coreContext,
          vocalPreference: input.vocalPreference, ...(profile ? { explicitMusicProfile: { id: profile.id, label: profile.label, bpm: profile.bpm, groove: profile.groove, rhythmPurpose: profile.rhythmPurpose } } : {}) }) }] }) });
  } catch { throw new DanceConceptMusicPlanError('음악 설계 제출 결과가 불확실합니다. 자동으로 다시 설계하지 않습니다.', 'MUSIC_PLAN_UNKNOWN'); }
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new DanceConceptMusicPlanError('음악 설계 응답을 확인하지 못했습니다.', 'MUSIC_PLAN_UNKNOWN'); }
  try {
    const result = JSON.parse((await readPetBoundedBody(response, 96 * 1024)).toString('utf8'));
    const choice = result.choices?.[0];
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') throw new Error('incomplete');
    return validateDanceConceptMusicPlan(JSON.parse(choice.message.content), input);
  } catch (error) {
    if (error instanceof DanceConceptMusicPlanError) throw error;
    throw new DanceConceptMusicPlanError('음악 설계 결과를 확인하지 못했습니다. 원래 요청을 보존했습니다.');
  }
}
