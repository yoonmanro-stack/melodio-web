import { buildDirection, compileDirection, type HealingRainDirection } from '../../../shared/healing-rain/direction';

export const intensities = { gentle: '잔잔한 비', moderate: '보통 비', heavy: '굵은 비', downpour: '폭우' } as const;
export const thunders = { none: '천둥 없음', distant: '먼 천둥', close: '가까운 천둥' } as const;
export const cameras = { wide: '공간을 넓게', window: '창밖을 가까이', bedside: '잠자리 곁에서' } as const;
export const palettes = { amber: '앰버 조명 · 짙은 나무', linen: '아이보리 침구 · 은은한 조명', midnight: '남색 공간 · 작은 수면등' } as const;
export type SceneId = 'train' | 'tent' | 'hanok' | 'cabin' | 'night-nature' | 'quiet-park' | 'mountain-temple' | 'pond' | 'lake' | 'highland-village';
export type RecipeInput = { sceneId: SceneId; intensity: keyof typeof intensities; thunder: keyof typeof thunders; camera: keyof typeof cameras; palette: keyof typeof palettes; variation: number; title: string; hours: number; takes: number; notes: string };
export const nightNatureDirection = { timeOfDay: 'night', exposure: 'low-key', mood: ['secluded', 'quiet', 'still', 'reassuring'], people: 'none', setting: 'mossy canyon and forest water', lighting: 'faint diffuse ambient light; restrained wet highlights', exclusions: ['urban bustle', 'traffic', 'crowds', 'neon', 'bright sky', 'lightning flashes'], referenceUse: 'Mood and natural forms only; original composition, not a location recording' } as const;
export const recipes: { id: SceneId; name: string; subtitle: string; surface: string; layers: string[]; sound: string }[] = [
 { id:'train',name:'비 내리는 침대 열차',subtitle:'따뜻한 취침등, 깊은 밤을 달리는 객실',surface:'유리창 · 객실 내부',layers:['창문 빗방울','둔하게 들리는 외부 비','낮은 주행음'],sound:'Rain on train window heard inside a closed sleeper carriage, muffled outdoor rainfall, soft low rail rumble.' },
 { id:'tent',name:'숲속 텐트의 밤',subtitle:'천막 위의 빗방울, 포근한 침낭',surface:'텐트 천막 · 낙엽',layers:['천막 타격음','나뭇잎 위의 비','입구의 낙수'],sound:'Rain pattering on tent fabric from inside, leaf splashes outside, occasional vestibule drips. Soft dry sheltered acoustics.' },
 { id:'hanok',name:'한옥 처마 아래',subtitle:'따뜻한 방에서 바라보는 젖은 마당',surface:'기와 · 처마 · 흙마당',layers:['기와 위의 비','처마 낙수','마당 물웅덩이'],sound:'Rain on clay roof tiles, irregular eave drips, soft puddle splashes in a courtyard heard from a sheltered wooden room.' },
 { id:'cabin',name:'숲속 오두막',subtitle:'빗물 흐르는 창과 작은 수면등',surface:'유리창 · 나무 지붕',layers:['유리창 빗소리','지붕 위의 비','멀리서 들리는 숲'],sound:'Rain on cabin glass and muted roof impacts, soft forest rain beyond a closed bedroom window, warm indoor acoustics.' },
 { id:'night-nature',name:'깊은 밤의 외딴 자연',subtitle:'이끼 낀 협곡, 어둠 속에 은은한 빗결',surface:'이끼 바위 · 나뭇잎 · 계곡 수면',layers:['나뭇잎과 바위 위의 비','수면의 작은 빗방울','낮게 깔리는 먼 계곡 물소리'],sound:'Rain on leaves, wet stone and stream surface in a secluded canyon. Low distant flowing water beneath the rain, gentle natural depth. No traffic, footsteps or crowds.' },
 { id:'quiet-park',name:'깊은 밤의 한적한 공원',subtitle:'빈 산책로에 조용히 번지는 빗물',surface:'나뭇잎 · 젖은 돌길 · 물웅덩이',layers:['나뭇잎 위의 비','돌길의 작은 물튀김','물웅덩이 잔물결'],sound:'Rain on broad leaves and stone paving in an empty wooded park, gentle puddle splashes. Open-air acoustics. No traffic, voices, footsteps or birds.' },
 { id:'mountain-temple',name:'비 내리는 고요한 산사',subtitle:'깊은 산, 처마 끝에서 떨어지는 밤비',surface:'기와 · 목재 처마 · 돌마당',layers:['기와 위의 비','처마의 불규칙한 낙수','돌마당의 빗방울'],sound:'Rain on clay roof tiles heard under wooden temple eaves, irregular falling drips and soft stone courtyard splashes, distant forest rain. No bells, chanting, voices or footsteps.' },

 { id:'pond',name:'숲속 작은 연못',subtitle:'가까운 빗방울이 그리는 작은 동심원',surface:'연못 수면 · 갈대 · 이끼 돌',layers:['수면에 떨어지는 빗방울','갈대와 잎 위의 비','물가의 작은 물튀김'],sound:'Close delicate rain impacts on a small still pond, soft reed and leaf patter, tiny shore splashes. No stream, waterfall, frogs, birds, traffic or voices.' },
 { id:'lake',name:'고요한 호숫가의 밤',subtitle:'넓은 밤의 수면, 먼 숲의 실루엣',surface:'호수 수면 · 물가 돌 · 갈대',layers:['넓은 수면에 내리는 비','아주 작은 물가 잔물결','가까운 갈대 빗소리'],sound:'Broad soft rainfall across a quiet lake, faint gentle shore lapping and nearby reed patter. Spacious open-air depth. No ocean surf, large waves, boats, birds or voices.' },

 { id:'highland-village',name:'사파 고산 마을의 폭우',subtitle:'산비탈 작은 집의 불빛, 안개 속 밤비',surface:'경사 지붕 · 목조 처마 · 돌길',layers:['지붕을 두드리는 폭우','처마의 거센 낙수','돌길과 물웅덩이의 물튀김'],sound:'Heavy rain on pitched metal roofs in a quiet highland village, dense irregular eave runoff and wet stone path splashes heard from a sheltered porch. Muted roof resonance. No voices, traffic or music.' },

];
export const defaults: RecipeInput = { sceneId:'train',intensity:'downpour',thunder:'none',camera:'bedside',palette:'midnight',variation:0,title:'비 내리는 침대 열차',hours:10,takes:6,notes:'' };
export type RainPlan = {
 id: string;
 createdAt: string;
 schemaVersion: 1;
 recipeVersion: 1;
 input: RecipeInput;
 // Absent on saved v1 plans; reading a plan never upgrades its direction.
 direction?: HealingRainDirection;
 sceneDirection?: Omit<typeof nightNatureDirection, 'setting' | 'lighting'> & { setting: string; lighting: string };
 prompts: { image: string; video: string; audio: string };
 layers: string[];
 checks: string[];
 generation: {
  freshAssets: true;
  audioSeconds: 30;
  videoSeconds: 10;
  sourceVideoSeconds?: 11;
  videoCrossfadeSeconds?: 1;
  audioTakes: number;
  totalSeconds: number;
  status: 'draft';
 };
};
function member<T extends Record<string, string>>(value: unknown, options: T): value is keyof T & string { return typeof value === 'string' && Object.hasOwn(options,value); }
export function parseRecipe(value: unknown): RecipeInput {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('장면 설정을 확인해 주세요.');
 const v=value as Record<string,unknown>;
 if (!recipes.some(r=>r.id===v.sceneId) || !member(v.intensity,intensities) || !member(v.thunder,thunders) || !member(v.camera,cameras) || !member(v.palette,palettes)) throw new Error('선택할 수 없는 레시피 설정입니다.');
 if (typeof v.title!=='string' || !v.title.trim() || v.title.length>100 || typeof v.notes!=='string' || v.notes.length>600) throw new Error('제목은 100자, 연출 메모는 600자까지 입력해 주세요.');
 if (![1,3,10].includes(v.hours as number) || ![3,6,12].includes(v.takes as number) || !Number.isInteger(v.variation) || (v.variation as number)<0 || (v.variation as number)>999999) throw new Error('길이와 버전 설정을 확인해 주세요.');
 return {sceneId:v.sceneId as SceneId,intensity:v.intensity,thunder:v.thunder,camera:v.camera,palette:v.palette,title:v.title.trim(),notes:v.notes.trim(),hours:v.hours as number,takes:v.takes as number,variation:v.variation as number};
}
export function compileRecipe(input: RecipeInput, id: string, createdAt: string): RainPlan {
 const scene=recipes.find(r=>r.id===input.sceneId)!;
 const direction=buildDirection(input);
 const compiled=compileDirection(direction,input);
 const rain={gentle:'Sparse gentle rain, distinct soft droplets.',moderate:'Moderate steady rain, clear rounded droplets and a soft continuous rain bed.',heavy:'Heavy sustained rain with frequent impacts and rich splashes.',downpour:'Dense powerful downpour with full rushing texture and energetic splashes.'}[input.intensity];
 const outdoor=['night-nature','quiet-park','mountain-temple','pond','lake','highland-village'].includes(input.sceneId);
 const nature=['night-nature','pond','lake'].includes(input.sceneId);
 // Keep the approved audio wording: the worker appends its six bounded variations.
 const audio=`${rain} ${scene.sound} Natural irregular droplets, believable depth. Continuous 30-second loop, no fade or silence. No voices, music or tonal artifacts. No thunder; thunder is a separate layer.`;
 return {
  id,createdAt,schemaVersion:1,recipeVersion:1,input,direction,
  ...(outdoor?{sceneDirection:{...nightNatureDirection,setting:scene.surface,lighting:nature?nightNatureDirection.lighting:'very dim shielded warm practical light, stable exposure'}}:{}),
  prompts:{image:compiled.image,video:compiled.video,audio},
  layers:[...scene.layers,...(input.thunder==='none'?[]:[thunders[input.thunder]+' · 별도 생성/배치'])],
  checks:compiled.checks,
  generation:{freshAssets:true,audioSeconds:30,videoSeconds:compiled.render.targetVideoCycleSeconds,sourceVideoSeconds:compiled.render.sourceVideoSeconds,videoCrossfadeSeconds:compiled.render.videoCrossfadeSeconds,audioTakes:input.takes,totalSeconds:input.hours*3600,status:'draft'},
 };
}
