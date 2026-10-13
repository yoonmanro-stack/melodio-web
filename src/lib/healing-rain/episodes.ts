import { INTRO_FAMILIES, INTRO_FAMILY_VERSION, getIntroFamily, type IntroFamilyId } from '../../../shared/healing-rain/intro-families';
import { compileRecipe, defaults, parseRecipe, type RecipeInput, type RainPlan, type SceneId } from './recipes';
import { RainProjectError } from './projects';

export const EPISODE_VERSION = 'healing-rain-episode-v1' as const;
export const COMPARISON_VERSION = 'healing-rain-episode-comparison-v1' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/;
const SURFACES = {
 glass: 'rain on glass', fabric: 'rain on tent fabric', clay: 'rain on clay roof tiles', wood: 'rain on a wooden roof',
 leaves: 'rain on broad leaves', stone: 'rain on wet stone', water: 'rain impacts on still water', metal: 'muted rain on a metal roof',
} as const;
type Surface = keyof typeof SURFACES;
const SCENE_SURFACES: Record<SceneId, Surface[]> = {
 train: ['glass'], tent: ['fabric','leaves'], hanok: ['clay','stone'], cabin: ['glass','wood'],
 'night-nature': ['leaves','stone','water'], 'quiet-park': ['leaves','stone'], 'mountain-temple': ['clay','stone'],
 pond: ['water','leaves','stone'], lake: ['water','leaves','stone'], 'highland-village': ['metal','stone'],
};
const SCENE_SOUND: Record<SceneId, string> = {
 train: 'Muffled outdoor rain; low rail rumble.', tent: 'Leaf splashes beyond dry tent shelter.',
 hanok: 'Irregular eave drips and courtyard splashes.', cabin: 'Muted roof impacts and distant forest rain.',
 'night-nature': 'Leaf and stone impacts; low distant stream.', 'quiet-park': 'Leaf patter and puddles in an empty park.',
 'mountain-temple': 'Irregular eave drips; stone courtyard splashes.',
 pond: 'Still pond impacts and reeds; no flowing water.', lake: 'Broad lake rain; faint shore lapping, no surf.',
 'highland-village': 'Muted roof resonance; eave runoff and stone splashes.',
};
const INTENT = {
 'sheltered-rest': 'Convey shelter and quiet reassurance through soft warmth and calm stable composition.',
 'cooling-relief': 'Convey refreshing cool relief through spacious soft air and clear water textures without threatening weather.',
 'spacious-calm': 'Convey expansive calm through gentle depth, uncluttered space and restrained contrast.',
} as const;
const MOTIF = {
 light: 'Match one softly glowing region between compositions; reduce exposure gradually without a flash.',
 water: 'Align a calm water texture with the rainy main; dissolve slowly without a sudden storm transformation.',
 foliage: 'Echo leaf or petal contours in the destination foliage; preserve a gentle dissolve rather than moving foliage across the person.',
 shelter: 'Echo the restful enclosure in the destination shelter or sheltered viewpoint; retain the feeling of protection as the person fades.',
} as const;
const SCENE_PERSPECTIVES: Record<SceneId, Array<'inside'|'sheltered'|'open'>> = {
 train: ['inside'], tent: ['inside'], hanok: ['sheltered'], cabin: ['inside'],
 'night-nature': ['open'], 'quiet-park': ['open'], 'mountain-temple': ['sheltered'], pond: ['open'], lake: ['open'], 'highland-village': ['sheltered'],
};
export type EpisodeInput = {
 title: string;
 brief: { intent: 'sheltered-rest'|'cooling-relief'|'spacious-calm'; premise: string; distinctiveExperience: string };
 intro: { familyId: IntroFamilyId; variantId: string };
 main: RecipeInput;
 visual: { focus: 'shelter'|'rain-detail'|'landscape'; depth: 'intimate'|'layered'|'panoramic'; anchor: string };
 audio: { surface: Surface; perspective: 'inside'|'sheltered'|'open'; depth: 'close'|'layered'|'distant'; dynamics: 'steady'|'slow-swells'; detail: string };
 connection: { motif: 'light'|'water'|'foliage'|'shelter'; rationale: string; transitionSeconds: 9 };
};
export type EpisodePlan = {
 version: typeof EPISODE_VERSION; id: string; createdAt: string; input: EpisodeInput;
 catalogVersion: typeof INTRO_FAMILY_VERSION; basePlan: RainPlan;
 prompts: { introImage: string; introVideo: string; mainImage: string; mainVideo: string; rainAudio: string };
 editorial: {
  premise: string; distinctiveExperience: string; intentInstruction: string;
  transitionInstruction: string; transitionRationale: string;
  thunder: { requested: 'none'|'distant'|'close'; separateLayer: true; generationStatus: 'not_connected' };
  provenanceRequired: string[];
 };
 production: {
  sourceIntroSeconds: 15; introOccurrences: 1; newProductionRequiresFreshAssets: true; currentProductionRevisionAllowed: true;
  transition: { startSeconds: 6; endSeconds: 15; seconds: 9; curve: 'smoothstep'; fullCloudOcclusionRequired: false; generatedMorph: false };
  mainLoopSeconds: 10; reversePlayback: false; previewSeconds: [30,180]; targetLongFormSeconds: number;
  audio: { secondsPerTake: 30; plannedTakes: number; continuousThroughTransition: true; restartAtTransition: false; loopExpansionMustBeDisclosedInProductionRecord: true };
 };
 review: { status: 'required'; mediaValidation: 'not_performed'; comparisonScope: 'structured-plans-only'; questions: string[]; compatibilityWarning: string|null };
 execution: { providerCallsAllowed: false; longFormEnabled: false; policyApproval: false; generationAdapter: 'not_connected' };
};
export type EpisodeComparison = {
 version: typeof COMPARISON_VERSION; decision: 'needs_revision'|'review_required'; policyApproval: false;
 mediaSimilarityMeasured: false; scope: 'structured-plans-only'; historyCount: number; historyTruncated: boolean;
 invalidHistoryCount: number; reasonCodes: string[];
 matches: Array<{ episodeId: string; sameMainDesign: boolean; sameIntroDesign: boolean; matchedDimensions: string[]; differingDimensions: string[]; materialMatchRatio: number }>;
};
function fail(message: string): never { throw new RainProjectError('episode_invalid', message, 400); }
function record(value: unknown, keys: readonly string[]): Record<string,unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) fail('회차 기획 항목을 확인해 주세요.');
 const result = value as Record<string,unknown>;
 if (Object.keys(result).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(result,key))) fail('지원하지 않거나 빠진 기획 항목이 있습니다.');
 return result;
}
function text(value: unknown, min: number, max: number): string {
 if (typeof value !== 'string') fail('기획 설명을 입력해 주세요.');
 const result=value.normalize('NFC').trim();
 if (result.length<min || result.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result) || /data:[^\s]*;base64|\bblob:|;base64,/i.test(result)) fail(`기획 설명은 ${min}~${max}자 텍스트로 입력해 주세요.`);
 return result;
}
function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
 if (typeof value !== 'string' || !allowed.includes(value as T)) fail('선택할 수 없는 기획 설정입니다.');
 return value as T;
}
export function parseEpisodeId(value: unknown): string {
 if (typeof value !== 'string' || !UUID.test(value)) fail('회차 ID를 확인해 주세요.');
 return value.toLowerCase();
}
function requestId(value: unknown): string {
 if (typeof value !== 'string' || !REQUEST_ID.test(value)) fail('저장 요청 ID를 확인해 주세요.');
 return value;
}
export function parseEpisodeInput(value: unknown): EpisodeInput {
 const v=record(value,['title','brief','intro','main','visual','audio','connection']);
 const b=record(v.brief,['intent','premise','distinctiveExperience']);
 const i=record(v.intro,['familyId','variantId']);
 const c=record(v.visual,['focus','depth','anchor']);
 const a=record(v.audio,['surface','perspective','depth','dynamics','detail']);
 const x=record(v.connection,['motif','rationale','transitionSeconds']);
 record(v.main,['sceneId','intensity','thunder','camera','palette','variation','title','hours','takes','notes']);
 let main: RecipeInput;
 try { main=parseRecipe(v.main); main.title=text(main.title,1,100); main.notes=text(main.notes,0,600); } catch { fail('본편 레시피를 확인해 주세요.'); }
 const familyId=choice(i.familyId,INTRO_FAMILIES.map(f=>f.id));
 const family=getIntroFamily(familyId);
 const surface=choice(a.surface,SCENE_SURFACES[main.sceneId]);
 const perspective=choice(a.perspective,SCENE_PERSPECTIVES[main.sceneId]);
 if(x.transitionSeconds!==9) fail('현재 검증된 전환 길이는 9초입니다.');
 // Planning supports future thunder layers, but the base rain prompt never embeds thunder.
 return {
  title:text(v.title,1,100),brief:{intent:choice(b.intent,['sheltered-rest','cooling-relief','spacious-calm']),premise:text(b.premise,12,360),distinctiveExperience:text(b.distinctiveExperience,12,360)},
  intro:{familyId,variantId:choice(i.variantId,family.variants.map(q=>q.id))},main,
  visual:{focus:choice(c.focus,['shelter','rain-detail','landscape']),depth:choice(c.depth,['intimate','layered','panoramic']),anchor:text(c.anchor,12,200)},
  audio:{surface,perspective,depth:choice(a.depth,['close','layered','distant']),dynamics:choice(a.dynamics,['steady','slow-swells']),detail:text(a.detail,12,200)},
  connection:{motif:choice(x.motif,['light','water','foliage','shelter']),rationale:text(x.rationale,12,200),transitionSeconds:9},
 };
}
export function parseSaveEpisode(value: unknown): {clientRequestId:string;input:EpisodeInput} {
 const v=record(value,['clientRequestId','input']);return {clientRequestId:requestId(v.clientRequestId),input:parseEpisodeInput(v.input)};
}
export function parseEpisodeReview(value: unknown): {clientRequestId:string;verdict:'approve_plan'|'needs_revision';reason:string} {
 const v=record(value,['clientRequestId','verdict','reason']);return {clientRequestId:requestId(v.clientRequestId),verdict:choice(v.verdict,['approve_plan','needs_revision']),reason:text(v.reason,12,1200).replace(/\s+/g,' ')};
}
export function compileEpisodePlan(value: EpisodeInput, id: string, createdAt: string): EpisodePlan {
 const input=parseEpisodeInput(value);id=parseEpisodeId(id);
 if (typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) fail('기획 생성 시간을 확인해 주세요.');
 let basePlan: RainPlan;
 try { basePlan=compileRecipe(input.main,id,createdAt); } catch { fail('본편 연출 규칙과 설정이 일치하지 않습니다.'); }
 const family=getIntroFamily(input.intro.familyId), variant=family.variants.find(v=>v.id===input.intro.variantId)!;
 const focus={shelter:'Keep the sheltered resting space readable.', 'rain-detail':'Emphasize visible rainfall and local rain impacts.',landscape:'Show the still landscape with restrained depth.'}[input.visual.focus];
 const depth={intimate:'Intimate fixed composition.',layered:'Stable foreground, middle and distant layers.',panoramic:'Wide restful view with stable landmarks.'}[input.visual.depth];
 const rain={gentle:'Soft light rain.',moderate:'Moderate rain.',heavy:'Heavy rain.',downpour:'Dense torrential rain.'}[input.main.intensity];
 const dynamics=input.audio.dynamics==='steady'?'Steady level.':'Slow subtle swells; no peaks.';
 const compatibilityWarning=family.compatibleScenes.includes(input.main.sceneId)?null:'권장 연결 밖의 조합입니다. 공간·빛·소리의 연결 의도를 확인해 주세요.';
 return {
  version:EPISODE_VERSION,id,createdAt,input,catalogVersion:INTRO_FAMILY_VERSION,basePlan,
  editorial:{premise:input.brief.premise,distinctiveExperience:input.brief.distinctiveExperience,intentInstruction:INTENT[input.brief.intent],
   transitionInstruction:MOTIF[input.connection.motif],transitionRationale:input.connection.rationale,
   thunder:{requested:input.main.thunder,separateLayer:true,generationStatus:'not_connected'},
   provenanceRequired:['source prompts and model versions','provider job IDs and original asset hashes','edit decisions and source-to-output mapping','audio take arrangement and repeated segments','human media review and final render hash']},
  prompts:{
   introImage:['Original photorealistic 16:9 fantasy resting scene.',family.worldPrompt,family.comfortPrompt,variant.compositionPrompt,variant.atmospherePrompt,INTENT[input.brief.intent],'One adult woman already asleep, eyes closed, fully covered and comfortable. Soft luminous warmth, no harsh light. No text or logos.',`Exclude: ${family.exclusions.join(', ')}.`].join(' '),
   introVideo:[family.motionPrompt,'Locked camera; preserve the same sleeping adult identity, pose and bedding. Only tiny breathing and barely moving surroundings. No engulfing clouds, no accelerating motion, no generated scene morph. Keep the source calm to its last frame. Silent source; editorial smoothstep dissolve 6–15s, with intentional fading-subject overlap.'].join(' '),
   mainImage:[basePlan.prompts.image,focus,depth,`Original scene detail: ${input.visual.anchor}`].join(' '),
   mainVideo:[basePlan.prompts.video,focus,'Preserve the approved source geometry; do not introduce transition motion into the repeating main.'].join(' '),
   rainAudio:[rain,SCENE_SOUND[input.main.sceneId],`${SURFACES[input.audio.surface]}; ${input.audio.perspective}, ${input.audio.depth}.`,dynamics,input.audio.detail,'Continuous 30s stereo; no silence, fades, music, voices, bells or thunder.'].join(' '),
  },
  production:{sourceIntroSeconds:15,introOccurrences:1,newProductionRequiresFreshAssets:true,currentProductionRevisionAllowed:true,
   transition:{startSeconds:6,endSeconds:15,seconds:9,curve:'smoothstep',fullCloudOcclusionRequired:false,generatedMorph:false},
   mainLoopSeconds:10,reversePlayback:false,previewSeconds:[30,180],targetLongFormSeconds:input.main.hours*3600,
   audio:{secondsPerTake:30,plannedTakes:input.main.takes,continuousThroughTransition:true,restartAtTransition:false,loopExpansionMustBeDisclosedInProductionRecord:true}},
  review:{status:'required',mediaValidation:'not_performed',comparisonScope:'structured-plans-only',compatibilityWarning,
   questions:['이번 편의 풍경과 소리가 기존 작품과 실제로 다르게 느껴지는가?','색·제목·인물만 바꾼 반복 기획에 머물지 않았는가?','인트로와 본편의 빛·공간·소리 연결이 편안한가?','장시간 반복에 사용할 본편과 소리의 다양성이 충분한가?','새 원본과 편집 기록을 보존했으며 실제 촬영으로 오인시키지 않는가?']},
  execution:{providerCallsAllowed:false,longFormEnabled:false,policyApproval:false,generationAdapter:'not_connected'},
 };
}
function dimensions(input:EpisodeInput): Record<string,string> {
 // Cosmetic seed, title, palette, free-form claims and intro changes cannot hide an unchanged main design.
 return {scene:input.main.sceneId,rain:input.main.intensity,thunder:input.main.thunder,camera:input.main.camera,
  visualFocus:input.visual.focus,spatialDepth:input.visual.depth,surface:input.audio.surface,
  acousticPerspective:input.audio.perspective,acousticDepth:input.audio.depth,dynamics:input.audio.dynamics};
}
export function compareEpisodePlans(candidate:EpisodePlan, history:EpisodePlan[], historyTruncated:boolean):EpisodeComparison {
 if(candidate?.version!==EPISODE_VERSION) fail('지원하지 않는 회차 기획 버전입니다.');
 parseEpisodeId(candidate.id);
 const input=parseEpisodeInput(candidate.input),current=dimensions(input),matches:EpisodeComparison['matches']=[];
 if(!Array.isArray(history)) throw new RainProjectError('history_unavailable','기존 회차를 확인하지 못했습니다.',503);
 let invalidHistoryCount=0,historyCount=0;
 for(const item of history.slice(0,100)) {
  if(item?.id===candidate.id) continue;
  let other:EpisodeInput;
  try { if(item?.version!==EPISODE_VERSION) throw Error('version');parseEpisodeId(item.id);other=parseEpisodeInput(item.input); }
  catch { invalidHistoryCount++;continue; }
  historyCount++;
  const previous=dimensions(other),matchedDimensions=Object.keys(current).filter(key=>current[key]===previous[key]);
  const differingDimensions=Object.keys(current).filter(key=>current[key]!==previous[key]);
  const sameMainDesign=differingDimensions.length===0;
  const sameIntroDesign=input.intro.familyId===other.intro.familyId&&input.intro.variantId===other.intro.variantId;
  const materialMatchRatio=matchedDimensions.length/Object.keys(current).length;
  if(sameMainDesign||materialMatchRatio>=0.8)matches.push({episodeId:item.id,sameMainDesign,sameIntroDesign,matchedDimensions,differingDimensions,materialMatchRatio});
 }
 matches.sort((a,b)=>Number(b.sameMainDesign)-Number(a.sameMainDesign)||b.materialMatchRatio-a.materialMatchRatio||a.episodeId.localeCompare(b.episodeId));
 const repeated=matches.some(m=>m.sameMainDesign),reasonCodes=['human_editorial_review_required'];
 if(repeated)reasonCodes.push('same_main_design');else if(matches.length)reasonCodes.push('similar_main_design');
 if(!historyCount)reasonCodes.push('no_comparable_history');
 const truncated=historyTruncated||history.length>100;
 if(truncated)reasonCodes.push('history_window_limited');
 if(invalidHistoryCount)reasonCodes.push('history_not_fully_comparable');
 return {version:COMPARISON_VERSION,decision:repeated?'needs_revision':'review_required',policyApproval:false,mediaSimilarityMeasured:false,scope:'structured-plans-only',historyCount,historyTruncated:truncated,invalidHistoryCount,reasonCodes,matches:matches.slice(0,10)};
}
export function getEpisodeCatalog() {
 return {version:EPISODE_VERSION,introFamilyVersion:INTRO_FAMILY_VERSION,families:INTRO_FAMILIES.map(f=>getIntroFamily(f.id)),
  surfaces:{...SURFACES},sceneSurfaces:Object.fromEntries(Object.entries(SCENE_SURFACES).map(([key,values])=>[key,[...values]])),scenePerspectives:Object.fromEntries(Object.entries(SCENE_PERSPECTIVES).map(([key,values])=>[key,[...values]])),
  generationEnabled:false,reviewMeaning:'기획 검토용이며 유튜브 정책 통과나 실제 미디어 품질을 보증하지 않습니다.'};
}
export function exampleEpisodeInput():EpisodeInput {
 return parseEpisodeInput({title:'구름에서 쉬어가는 폭우 속 야간 열차',
  brief:{intent:'sheltered-rest',premise:'포근한 구름 침대에서 비가 내리는 야간 열차의 안전한 객실로 이어지는 휴식',distinctiveExperience:'빗속을 달리는 창밖과 따뜻한 객실의 거리감, 유리와 먼 주행음의 공간을 표현'},
  intro:{familyId:'cloud-bed',variantId:INTRO_FAMILIES[0].variants[0].id},main:{...defaults},
  visual:{focus:'shelter',depth:'layered',anchor:'창가 침대와 작은 취침등 뒤로 먼 숲의 실루엣이 이어진다'},
  audio:{surface:'glass',perspective:'inside',depth:'layered',dynamics:'steady',detail:'가까운 유리의 빗방울과 둔하게 들리는 외부 폭우를 층으로 나눈다'},
  connection:{motif:'shelter',rationale:'구름 침대의 따뜻한 빛이 객실 취침등으로 이어져 보호받는 느낌을 유지',transitionSeconds:9}});
}
