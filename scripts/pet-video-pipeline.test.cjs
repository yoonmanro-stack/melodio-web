const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', compiled)(localRequire, mod, mod.exports);
  return mod.exports;
}
const { createPetVideoService, PetPipelineError, assertPetAudioDuration } = load('src/lib/video/petPipeline.ts');
const { PET_OBSOLETE_C2_VIDEO_POLICY_VERSION, PET_QUALITY_POLICY_VERSION } = load('src/lib/video/petQualityPolicy.ts');
const { assertPetMediaUrl, readPetBoundedBody } = load('src/lib/video/petMedia.ts');
const { createPetXaiProvider } = load('src/lib/video/petProvider.ts');
const { buildPetAss, escapePetCaption, preflightPetRenderer } = load('src/lib/video/petRenderer.ts');
const USER = 'a0000000-0000-4000-8000-000000000001';
const TRACK = 'a0000000-0000-4000-8000-000000000002';
const durations = [4,5,5,6,6,4];
function episode() {
  let start = 0;
  return { version:'pet-v3',id:'episode-1',title:'훈련시킨 줄 알았다',sourceTopic:'강아지와 공',story:'앉은 개가 집사를 움직이게 한다.',pov:'owner_inner_voice',fingerprint:{prop:'공',conflict:'훈련',twist:'사람이 움직임'},candidates:[],character:{species:'dog',appearance:'작은 베이지색 개',owner:'회색 옷',setting:'러그',continuity:[]},lyrics:'누가 누굴 훈련한 거야',stylePrompt:'acoustic comedy',models:[],createdAt:new Date(0).toISOString(),shots:durations.map((durationSeconds,i)=>{const shot={id:`S${i+1}`,startSeconds:start,durationSeconds,beat:'관계 반전',caption:`장면 ${i+1}의 편집 자막`,action:'한 번 고개를 기울임',camera:'fixed',keyframePrompt:`EXACT image ${i+1}`,videoPrompt:`EXACT single natural action ${i+1}`};start+=durationSeconds;return shot;})};
}
function episodeV4() {
  let start = 0;
  const actorPositions=['현관 옆','복도 입구','복도 중간','거실 입구','소파 앞','소파 옆'];
  const propPositions=['현관 바닥','강아지 입','복도 중간','거실 입구','사람 앞','사람 손'];
  const beats = [3,5,7,5,6,4].map((durationSeconds,i)=>{const before={actors:[{actorId:'A1',position:actorPositions[Math.max(0,i-1)]},{actorId:'A2',position:'소파'}],props:[{propId:'P1',count:1,position:propPositions[Math.max(0,i-1)]}]};const after={actors:[{actorId:'A1',position:actorPositions[i]},{actorId:'A2',position:'소파'}],props:[{propId:'P1',count:1,position:propPositions[i]}]};const shot={id:`S${i+1}`,startSeconds:start,durationSeconds,beat:`beat ${i+1}`,caption:`편집 자막 ${i+1}`,action:`강아지가 슬리퍼를 옮기는 행동 ${i+1}`,camera:['wide','close-up','tracking'][i%3],keyframePrompt:`beat image ${i+1}`,videoPrompt:`beat motion ${i+1}`,state:{actorId:'A1',actionType:i===5?'reveal':'move',affectedPropIds:['P1'],before,after}};start+=durationSeconds;return shot;});
  const sourceTopic='강아지가 슬리퍼를 사람에게 배달하고 사람이 웃으며 받는다';
  return { ...episode(), version:'pet-v4', id:'episode-v4', sourceTopic, shots:beats, production:{mode:'two-clips',actors:[{id:'A1',kind:'pet',visibility:'on_screen',description:'작은 베이지색 강아지'},{id:'A2',kind:'human',visibility:'on_screen',description:'회색 옷을 입은 한 사람'}],actorId:'A1',actor:'강아지와 사람이 모두 실제 화면에 등장',coreAction:'강아지가 슬리퍼를 사람에게 배달한다',payoff:'사람이 슬리퍼를 받고 웃는다',payoffCauseBeatIds:['S2','S3','S4'],inventory:[{id:'P1',description:'같은 갈색 슬리퍼 한 짝',count:1}],format:'9:16 photorealistic continuous film',sourceConstraints:[{quote:sourceTopic,kind:'situation',beatIds:['S1','S2','S3','S4','S5','S6']}],audioPlan:{targetBpm:120,turnSeconds:15,vocalsEndBySeconds:27,cadenceSeconds:3,alignmentStatus:'planned'},clips:[
    {id:'C1',startSeconds:0,durationSeconds:15,beat:'도입과 행동',caption:'도입부터 행동까지',action:'사람과 강아지가 함께 슬리퍼를 옮긴다',camera:'9:16',keyframePrompt:'EXACT master human and dog frame',videoPrompt:'EXACT first 15 second human and dog action',beatIds:['S1','S2','S3']},
    {id:'C2',startSeconds:15,durationSeconds:15,beat:'이어지는 결말',caption:'행동부터 결말까지',action:'같은 사람과 강아지가 행동을 마무리한다',camera:'9:16',keyframePrompt:'bridge frame supplied by engine',videoPrompt:'EXACT second 15 second continuous action and payoff',beatIds:['S4','S5','S6']},
  ]}};
}
function setup(overrides={}) {
  const rows = new Map(); let time = 100_000; const calls = [];
  const store = {
    get: async(user,id)=>{const row=rows.get(id);return row?.user_id===user?structuredClone(row):null;},
    findEpisode:async(user,id)=>{const row=[...rows.values()].find(r=>r.user_id===user&&r.episode.id===id);return row?structuredClone(row):null;},
    insert:async row=>{rows.set(row.id,structuredClone(row));return structuredClone(row);},
    compareAndSwap:async(row,rev)=>{if(rows.get(row.id)?.revision!==rev)return null;rows.set(row.id,structuredClone(row));return structuredClone(row);},
    ownedAudio:async(_user,_track,submitted)=>({sourceUrl:'https://cdn.suno.ai/owned.mp3',episode:structuredClone(submitted)}),
  };
  const deps = {
    store,now:()=>time,
    snapshotAudio:async()=>{calls.push(['audio']);return{url:'https://storage.test/audio',durationSeconds:26};},
    generateImage:async(prompt,master)=>{calls.push(['image',prompt,master]);return{url:`https://imgen.x.ai/${calls.length}.jpg`};},
    startVideo:async(prompt,duration,keyframe)=>{calls.push(['video',prompt,duration,keyframe]);return{requestId:`request-${calls.length}`};},
    pollVideo:async id=>{calls.push(['poll',id]);return{status:'done',url:`https://vidgen.x.ai/${id}.mp4`};},
    copyAsset:async(_job,index,kind)=>{calls.push(['copy',index,kind]);return`https://storage.test/${index}-${kind}`;},
    extractBridgeFrame:async(_job,index)=>{calls.push(['bridge',index]);return{url:`https://storage.test/bridge-${index}`};},
    reviewAsset:async(job,index,kind)=>{calls.push(['review',index,kind,job.episode.production?.actor]);return{status:'passed',issues:[],checkedFrames:kind==='video'?3:1,policyVersion:PET_QUALITY_POLICY_VERSION};},
    render:async job=>{calls.push(['render',job.state.shots.length]);return{url:'https://storage.test/final.mp4',durationSeconds:30};},
    ...overrides,
  };
  const service=createPetVideoService(deps);
  return {service,rows,calls,store,deps,tick:()=>{time+=20_000;},setTime:t=>{time=t;}};
}
test('content confirmation only writes an owned completed render and never calls media dependencies', async () => {
  const ctx = setup(), created = await ctx.service.create(USER, episode(), TRACK);
  assert.equal(ctx.rows.get(created.id).state.contentPolicyVersion, 'pet-content-review-v1');
  await assert.rejects(ctx.service.confirm(USER, created.id, 'https://storage.test/final.mp4'), e => e.code === 'CONTENT_NOT_READY');
  const row = ctx.rows.get(created.id); row.status = 'completed'; row.state.videoUrl = 'https://storage.test/final.mp4';
  const before = JSON.stringify(row.episode), revision = row.revision;
  await assert.rejects(ctx.service.confirm('another-owner', created.id, row.state.videoUrl), e => e.code === 'NOT_FOUND');
  await assert.rejects(ctx.service.confirm(USER, created.id, 'https://storage.test/stale.mp4'), e => e.code === 'CONTENT_CHANGED');
  const confirmed = await ctx.service.confirm(USER, created.id, row.state.videoUrl);
  assert.equal(confirmed.contentReview.status, 'owner_confirmed'); assert.equal(ctx.rows.get(created.id).revision, revision + 1);
  assert.equal(JSON.stringify(ctx.rows.get(created.id).episode), before); assert.deepEqual(ctx.calls, []);
  await ctx.service.confirm(USER, created.id, row.state.videoUrl);
  assert.equal(ctx.rows.get(created.id).revision, revision + 1);
});
test('content confirmation guards CAS conflicts and active render leases without provider calls', async () => {
  const ctx = setup(), created = await ctx.service.create(USER, episode(), TRACK);
  const row = ctx.rows.get(created.id); row.status = 'completed'; row.state.videoUrl = 'https://storage.test/final.mp4';
  row.state.lease = { token: 'fixture', until: 999999, operation: 'render' };
  await assert.rejects(ctx.service.confirm(USER, created.id, row.state.videoUrl), e => e.code === 'CONTENT_NOT_READY');
  delete row.state.lease;
  ctx.store.compareAndSwap = async () => null;
  await assert.rejects(ctx.service.confirm(USER, created.id, row.state.videoUrl), e => e.code === 'CONFLICT');
  assert.equal(ctx.rows.get(created.id).state.contentApproval, undefined); assert.deepEqual(ctx.calls, []);
});
/** A durable job created before the two-clip adapter existed, never new-create. */
async function seedLegacyJob(ctx, original=episode()) {
  const id=require('node:crypto').randomUUID();const timestamp=new Date(100_000).toISOString();
  const saved=structuredClone(original);delete saved.legacyProduction;
  ctx.rows.set(id,{id,user_id:USER,episode:saved,status:'draft',revision:0,created_at:timestamp,updated_at:timestamp,
    state:{audio:{trackId:TRACK,sourceUrl:'https://cdn.suno.ai/owned.mp3'},shots:saved.shots.map(s=>({id:s.id,imageStatus:'empty',videoStatus:'empty'})),productionMode:'legacy-six-clips',message:'Previously saved six-clip job'}});
  return ctx.service.get(USER,id);
}
function originalEpisode(saved) { const original=structuredClone(saved);delete original.legacyProduction;return original; }
async function until(ctx,id,status,max=80) {
  let view=await ctx.service.get(USER,id);
  for(let i=0;i<max&&view.status!==status;i++){ctx.tick();view=await ctx.service.advance(USER,id);}
  assert.equal(view.status,status);return view;
}
function persistedMedia(shots) {
  return shots.map(shot=>({id:shot.id,imageStatus:shot.imageStatus,videoStatus:shot.videoStatus,
    imageSourceUrl:shot.imageSourceUrl,keyframeUrl:shot.keyframeUrl,videoSourceUrl:shot.videoSourceUrl,
    videoUrl:shot.videoUrl,requestId:shot.requestId,nextPollAt:shot.nextPollAt}));
}
async function seedObsoleteOpeningRejection(ctx, review={status:'review',issues:['Old actor check rejected the sleeping human.']}) {
  const created=await ctx.service.create(USER,episode(),TRACK);const row=ctx.rows.get(created.id);
  row.status='held';row.state.audio.stableUrl='https://storage.test/audio';row.state.audio.durationSeconds=26;
  Object.assign(row.state.shots[0],{imageStatus:'ready',imageSourceUrl:'https://imgen.x.ai/preserved.jpg',keyframeUrl:'https://storage.test/preserved.jpg',quality:{image:structuredClone(review)},error:review.issues.join(' ')});
  Object.assign(row.state,{failedOperation:'image_review',failedShotIndex:0,failureCode:'QUALITY_REVIEW',message:'C1 held by obsolete image review'});
  return ctx.service.get(USER,created.id);
}
async function seedObsoleteC2VideoRejection(ctx, review={status:'review',issues:['Opera props and pet performance were incorrectly required.'],policyVersion:PET_OBSOLETE_C2_VIDEO_POLICY_VERSION}) {
  const created=await ctx.service.create(USER,episode(),TRACK);const row=ctx.rows.get(created.id);
  row.status='held';row.state.audio.stableUrl='https://storage.test/audio';row.state.audio.durationSeconds=26;
  row.state.shots.forEach((shot,index)=>Object.assign(shot,{imageStatus:'ready',keyframeUrl:`https://storage.test/saved-${index}.jpg`,
    videoStatus:'ready',videoSourceUrl:`https://vidgen.x.ai/saved-${index}.mp4`,videoUrl:`https://storage.test/saved-${index}.mp4`,requestId:`saved-request-${index}`,
    quality:{...(index===0?{image:{status:'passed',issues:[],policyVersion:PET_OBSOLETE_C2_VIDEO_POLICY_VERSION}}:{}),
      video:index===0?{status:'passed',issues:[],policyVersion:PET_OBSOLETE_C2_VIDEO_POLICY_VERSION}:structuredClone(review)}}));
  row.state.shots[1].error=review.issues.join(' ');
  Object.assign(row.state,{failedOperation:'video_review',failedShotIndex:1,failureCode:'QUALITY_REVIEW',message:'C2 held by obsolete video interpretation'});
  return ctx.service.get(USER,created.id);
}
function routeFixture({service,userId=USER,preflight=async()=>({binary:'/private/fixture/ffmpeg'})}) {
  const routePath=path.resolve(__dirname,'../src/app/api/viral-cf/pet-video/route.ts');
  const compiled=ts.transpileModule(fs.readFileSync(routePath,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  let rendererCalls=0;
  const replacements={
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200,headers:new Headers(options?.headers)})}},
    '@supabase/supabase-js':{createClient:()=>({})},
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:userId?{id:userId}:null},error:null})}})},
    '@/lib/video/petPipeline':load('src/lib/video/petPipeline.ts'),
    '@/lib/video/petServer':{createPetVideoServerService:()=>service},
    '@/lib/video/petMedia':{readPetBoundedBody},
    '@/lib/video/petRenderer':{preflightPetRenderer:async()=>{rendererCalls++;return preflight();}},
  };
  const mod={exports:{}};
  new Function('require','module','exports','process',compiled)(name=>{if(name in replacements)return replacements[name];throw new Error('Unexpected route dependency');},mod,mod.exports,{env:{NEXT_PUBLIC_SUPABASE_URL:'https://storage.test',SUPABASE_SERVICE_ROLE_KEY:'offline-fixture'}});
  return {
    get:query=>mod.exports.GET({nextUrl:new URL('https://melodio.test/api/viral-cf/pet-video'+query)}),
    post:body=>{const req=new Request('https://melodio.test/api/viral-cf/pet-video',{method:'POST',headers:{'content-type':'application/json',origin:'https://melodio.test'},body:JSON.stringify(body)});req.nextUrl=new URL(req.url);return mod.exports.POST(req);},
    rendererCalls:()=>rendererCalls,
  };
}
test('six approved exact images and six exact I2V prompts produce one 30s final',async()=>{
  const ctx=setup(); const e=episode(); const job=await seedLegacyJob(ctx,e);
  e.shots[0].videoPrompt='later edit must not change persisted episode';
  await assert.rejects(ctx.service.approve(USER,job.id),/여섯 장/);
  const review=await until(ctx,job.id,'review');
  assert.equal(ctx.calls.filter(c=>c[0]==='video').length,0);
  assert.equal(review.estimatedCostUsd,1.642);
  const imageCalls=ctx.calls.filter(c=>c[0]==='image');
  assert.equal(imageCalls.length,6);assert.equal(imageCalls[0][2],undefined);
  assert.ok(imageCalls.slice(1).every(c=>c[2]==='https://storage.test/0-image'));
  await ctx.service.approve(USER,job.id);await ctx.service.approve(USER,job.id);
  assert.deepEqual(ctx.rows.get(job.id).state.approvedMotionPrompts,episode().shots.map(s=>s.videoPrompt));
  const final=await until(ctx,job.id,'completed');
  assert.equal(final.durationSeconds,30);
  assert.equal(final.message,'30초 영상과 음원 합성이 완료되었습니다.');
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='video').map(c=>[c[1],c[2]]),episode().shots.map(s=>[s.videoPrompt,s.durationSeconds]));
  assert.equal(ctx.calls.filter(c=>c[0]==='render').length,1);
  assert.equal(ctx.calls.filter(c=>c[0]==='image').length,6);
});
test('new v3 creates without spend and completes one image plus two 15-second clips without a manual pause',async()=>{
  const ctx=setup({extractBridgeFrame:async(job,index)=>{
    assert.equal(index,0);assert.equal(job.state.shots[0].videoStatus,'ready');
    assert.equal(job.state.shots[0].videoUrl,'https://storage.test/0-video');
    assert.equal(job.state.shots[1].videoStatus,'empty');
    ctx.calls.push(['bridge',index]);return{url:'https://storage.test/first-clip-last-frame'};
  }});
  const e=episode();const before=structuredClone(e);const created=await ctx.service.create(USER,e,TRACK);
  assert.equal(created.productionMode,'two-clips');assert.equal(created.shots.length,2);assert.equal(created.status,'draft');
  assert.deepEqual(ctx.calls,[]);assert.deepEqual(e,before);
  const stored=ctx.rows.get(created.id).episode;const clips=structuredClone(stored.legacyProduction.clips);
  assert.deepEqual(originalEpisode(stored),before);assert.equal(stored.version,'pet-v3');
  assert.equal(load('src/lib/vle/petEpisode.ts').isPetTwoClipEpisode(stored),false);
  assert.equal(load('src/lib/vle/petEpisode.ts').hasPetTwoClipProduction(stored),true);
  assert.deepEqual(clips.map(c=>[c.id,c.startSeconds,c.durationSeconds]),[['C1',0,15],['C2',15,15]]);
  assert.ok(clips.every(c=>c.videoPrompt.length<=4096));
  const statuses=[];let view=created;
  for(let i=0;i<80&&view.status!=='completed';i++){ctx.tick();view=await ctx.service.advance(USER,created.id);statuses.push(view.status);}
  assert.equal(view.status,'completed');assert.equal(view.durationSeconds,30);assert.ok(!statuses.includes('review'));
  assert.equal(ctx.rows.get(created.id).state.approvedAt,undefined);
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='image').map(c=>c.slice(1)),[[clips[0].keyframePrompt,undefined]]);
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='video').map(c=>c.slice(1)),[
    [clips[0].videoPrompt,15,'https://storage.test/0-image'],
    [clips[1].videoPrompt,15,'https://storage.test/first-clip-last-frame'],
  ]);
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='bridge'),[['bridge',0]]);
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='render'),[['render',2]]);
  assert.deepEqual(originalEpisode(ctx.rows.get(created.id).episode),before,'Original lyrics, story and six caption timings stay frozen.');
});
test('new v3 duplicate create returns the same draft or completed job from the original episode without spend',async()=>{
  const ctx=setup();const original=episode();const first=await ctx.service.create(USER,original,TRACK);
  const draftSnapshot=structuredClone(ctx.rows.get(first.id));
  assert.equal((await ctx.service.create(USER,structuredClone(original),TRACK)).id,first.id);
  assert.deepEqual(ctx.rows.get(first.id),draftSnapshot);assert.deepEqual(ctx.calls,[]);
  await until(ctx,first.id,'completed');const finished=structuredClone(ctx.rows.get(first.id));const calls=structuredClone(ctx.calls);
  const repeated=await ctx.service.create(USER,structuredClone(original),TRACK);
  assert.equal(repeated.id,first.id);assert.equal(repeated.status,'completed');assert.equal(ctx.rows.size,1);
  assert.deepEqual(ctx.rows.get(first.id),finished);assert.deepEqual(ctx.calls,calls);
});
test('advancing a historical completed captioned job preserves its URL, message, revision and media without any work or write',async()=>{
  const ctx=setup();const saved=await seedLegacyJob(ctx);const row=ctx.rows.get(saved.id);
  row.status='completed';row.revision=42;row.state.durationSeconds=30;
  row.state.videoUrl='https://storage.test/final-caption-v2-0123456789abcdef.mp4';
  row.state.message='30초 영상과 편집 자막 합성이 완료되었습니다.';
  row.state.audio.stableUrl='https://storage.test/historical-audio';
  row.state.shots.forEach((shot,index)=>Object.assign(shot,{imageStatus:'ready',videoStatus:'ready',
    keyframeUrl:`https://storage.test/historical-${index}.jpg`,videoUrl:`https://storage.test/historical-${index}.mp4`,requestId:`historical-${index}`}));
  const before=structuredClone(row);let writes=0;
  ctx.store.compareAndSwap=async()=>{writes++;throw new Error('Completed jobs must never be rewritten');};
  for(let index=0;index<3;index++){
    ctx.tick();const view=await ctx.service.advance(USER,saved.id);
    assert.equal(view.status,'completed');assert.equal(view.videoUrl,before.state.videoUrl);
    assert.equal(view.message,before.state.message);assert.equal(view.durationSeconds,30);
  }
  assert.deepEqual(ctx.rows.get(saved.id),before);assert.equal(writes,0);assert.deepEqual(ctx.calls,[]);
});
test('client legacyProduction cannot replace server-compiled clips or an existing durable adapter',async()=>{
  const ctx=setup();const e=episode();e.legacyProduction={mode:'two-clips',version:'client-forged',clips:[{id:'C1',durationSeconds:99,videoPrompt:'CLIENT_OVERRIDE',keyframePrompt:'CLIENT_IMAGE'}]};
  const input=structuredClone(e);const first=await ctx.service.create(USER,e,TRACK);const saved=structuredClone(ctx.rows.get(first.id));
  assert.deepEqual(e,input);assert.equal(saved.episode.legacyProduction.version,'legacy-adapter-v1');
  assert.doesNotMatch(JSON.stringify(saved.episode.legacyProduction),/CLIENT_OVERRIDE|CLIENT_IMAGE|client-forged/);
  assert.deepEqual(saved.episode.legacyProduction.clips.map(c=>c.durationSeconds),[15,15]);
  e.legacyProduction.clips[0].videoPrompt='SECOND_OVERRIDE';
  assert.equal((await ctx.service.create(USER,e,TRACK)).id,first.id);
  assert.deepEqual(ctx.rows.get(first.id),saved);assert.deepEqual(ctx.calls,[]);
});
test('new v3 oversized compiled motion fails before paid operations or job persistence',async()=>{
  const ctx=setup();const e=episode();
  for(const shot of e.shots){shot.action='A specific continuous action. '.repeat(135);shot.videoPrompt='Preserve the causal movement. '.repeat(135);}
  assert.ok(e.shots.every(shot=>shot.videoPrompt.length<=5000));
  await assert.rejects(ctx.service.create(USER,e,TRACK),error=>error.code==='CLIP_PLAN'&&error.status===422);
  assert.equal(ctx.rows.size,0);assert.deepEqual(ctx.calls,[]);
});
test('v4 automatically creates one master image and two reviewed 15-second clips joined by a bridge frame',async()=>{
  const ctx=setup({snapshotAudio:async()=>({url:'https://storage.test/audio',durationSeconds:28,rhythm:{beatSeconds:[0,3,8,15,20,26],onsetSeconds:[],bpm:120,confidence:.8,method:'energy-autocorrelation',ending:{status:'clean',reasons:[],terminalRms:0}}})});
  const e=episodeV4();const created=await ctx.service.create(USER,e,TRACK);
  assert.equal(created.productionMode,'two-clips');assert.equal(created.estimatedCostUsd,1.524);assert.equal(created.shots.length,2);
  const final=await until(ctx,created.id,'completed');assert.equal(final.durationSeconds,30);
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='image').map(c=>c.slice(1)),[[e.production.clips[0].keyframePrompt,undefined]]);
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='video').map(c=>c.slice(1)),[
    [e.production.clips[0].videoPrompt,15,'https://storage.test/0-image'],
    [e.production.clips[1].videoPrompt,15,'https://storage.test/bridge-0'],
  ]);
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='bridge'),[['bridge',0]]);
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='review').map(c=>c.slice(1,3)),[[0,'image'],[0,'video'],[1,'video']]);
  assert.ok(ctx.calls.filter(c=>c[0]==='review').every(c=>c[3]===e.production.actor));
  assert.deepEqual(ctx.calls.filter(c=>['image','copy','review','video','poll','bridge','render'].includes(c[0])).map(c=>c[0]),[
    'image','copy','review','video','poll','copy','review','bridge','video','poll','copy','review','render',
  ]);
  assert.equal(ctx.calls.filter(c=>c[0]==='render').length,1);
  assert.deepEqual(ctx.rows.get(created.id).state.audio.rhythm.beatSeconds,[0,3,8,15,20,26]);
  assert.equal(final.audioQuality.endingStatus,'clean');
});
test('v4 first clip failure never submits the second clip or extracts a bridge',async()=>{
  const ctx=setup({pollVideo:async id=>{ctx.calls.push(['poll',id]);return{status:'failed'};}});
  const job=await ctx.service.create(USER,episodeV4(),TRACK);const held=await until(ctx,job.id,'held');
  assert.equal(held.shots[0].status,'video_held');assert.equal(ctx.calls.filter(c=>c[0]==='video').length,1);
  assert.equal(ctx.calls.filter(c=>c[0]==='bridge').length,0);assert.equal(ctx.calls.filter(c=>c[0]==='render').length,0);
});
test('v4 quality review inspects persisted assets and holds human-actor mismatches without regeneration',async()=>{
  const ctx=setup({reviewAsset:async(job,index,kind)=>{ctx.calls.push(['review',index,kind,job.episode.production.actor]);return{status:'review',issues:['사람 배우가 프레임에 없습니다.'],policyVersion:PET_QUALITY_POLICY_VERSION};}});
  const job=await ctx.service.create(USER,episodeV4(),TRACK);const held=await until(ctx,job.id,'held');
  assert.match(held.message,/사람 배우/);assert.equal(held.canResume,false);
  assert.equal(ctx.calls.filter(c=>c[0]==='image').length,1);assert.equal(ctx.calls.filter(c=>c[0]==='video').length,0);
  assert.equal(ctx.rows.get(job.id).state.shots[0].quality.image.status,'review');
  for(let i=0;i<3;i++)await ctx.service.advance(USER,job.id);
  assert.equal(ctx.calls.filter(c=>c[0]==='image').length,1);
});
test('one obsolete opening-image retirement archives evidence and preserves all media under concurrent resume',async()=>{
  const { openingImageAnalysis }=load('src/lib/video/petQuality.ts');
  const oldReview={status:'review',issues:['Sleeping human was incorrectly required to perform the cat action.'],evidence:{observedActor:'cat',humanState:'sleeping'}};
  const ctx=setup({reviewAsset:async(job,index,kind)=>{assert.equal(kind,'image');return openingImageAnalysis(job,index);}});
  const held=await seedObsoleteOpeningRejection(ctx,oldReview);assert.equal(held.canResume,true);
  const before=structuredClone(ctx.rows.get(held.id));const savedImage=before.state.shots[0].keyframeUrl;
  const attempts=await Promise.allSettled([ctx.service.resume(USER,held.id),ctx.service.resume(USER,held.id)]);
  assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(attempts.find(result=>result.status==='rejected').reason.code,'CONFLICT');
  const resumed=ctx.rows.get(held.id);assert.equal(resumed.revision,before.revision+1);assert.deepEqual(ctx.calls,[]);
  assert.deepEqual(resumed.episode,before.episode);assert.deepEqual(resumed.state.audio,before.state.audio);
  assert.deepEqual(persistedMedia(resumed.state.shots),persistedMedia(before.state.shots));
  assert.deepEqual(resumed.state.shots[0].imageQualityRecheck.previousReview,oldReview);
  assert.equal(resumed.state.shots[0].imageQualityRecheck.policyVersion,PET_QUALITY_POLICY_VERSION);
  await ctx.service.advance(USER,held.id);assert.equal(ctx.rows.get(held.id).state.shots[0].quality.image.status,'advisory');assert.deepEqual(ctx.calls,[]);
  await Promise.allSettled([ctx.service.advance(USER,held.id),ctx.service.advance(USER,held.id)]);
  await ctx.service.advance(USER,held.id);const videos=ctx.calls.filter(call=>call[0]==='video');
  assert.equal(videos.length,1);assert.equal(videos[0][3],savedImage);assert.equal(ctx.calls.filter(call=>call[0]==='image').length,0);
});
test('unknown current-policy historical opening rejection remains untouched while a new legacy gate response is unavailable',async()=>{
  const current=setup();const job=await seedObsoleteOpeningRejection(current,{status:'review',issues:['Current opening actor mismatch.'],policyVersion:PET_QUALITY_POLICY_VERSION});
  const snapshot=structuredClone(current.rows.get(job.id));assert.equal(job.canResume,false);
  await assert.rejects(current.service.resume(USER,job.id),error=>error.code==='RECOVERY_NOT_SAFE');assert.deepEqual(current.rows.get(job.id),snapshot);assert.deepEqual(current.calls,[]);
  const retry=setup({reviewAsset:async()=>({status:'review',issues:['Legacy detail rejection.'],policyVersion:PET_QUALITY_POLICY_VERSION})});
  const obsolete=await seedObsoleteOpeningRejection(retry);await retry.service.resume(USER,obsolete.id);const continued=await retry.service.advance(USER,obsolete.id);
  assert.equal(continued.status,'generating');assert.equal(continued.canResume,false);
  const after=structuredClone(retry.rows.get(obsolete.id));assert.equal(after.state.shots[0].quality.image.analysisStatus,'unavailable');
  assert.equal(after.state.shots[0].imageQualityRecheck.previousReview.policyVersion,undefined);
});
test('an outdated content gate response cannot stop newly generated v3 videos',async()=>{
  let reviews=0;const ctx=setup({reviewAsset:async()=>{reviews++;return{status:'review',issues:['Incidental pen missing.'],policyVersion:'pet-asset-review-v1'};}});
  const created=await ctx.service.create(USER,episode(),TRACK);await until(ctx,created.id,'completed');
  assert.equal(reviews,3);assert.equal(ctx.rows.get(created.id).state.failureCode,undefined);
  assert.ok(ctx.rows.get(created.id).state.shots.every(shot=>shot.quality.video.analysisStatus==='unavailable'));
  assert.equal(ctx.calls.filter(call=>call[0]==='video').length,2);
});
test('one obsolete v2 C2 recheck preserves all media and request IDs, then reviews the same asset and renders without generation',async()=>{
  const ctx=setup({reviewAsset:async(job,index,kind)=>{
    ctx.calls.push(['review',index,kind,job.state.shots[index].videoUrl]);
    assert.equal(index,1);assert.equal(kind,'video');assert.equal(job.state.shots[index].requestId,'saved-request-1');
    return{status:'passed',issues:[],policyVersion:PET_QUALITY_POLICY_VERSION};
  }});
  const held=await seedObsoleteC2VideoRejection(ctx);assert.equal(held.canResume,true);
  const before=structuredClone(ctx.rows.get(held.id)),oldReview=before.state.shots[1].quality.video;
  const attempts=await Promise.allSettled([ctx.service.resume(USER,held.id),ctx.service.resume(USER,held.id)]);
  assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(attempts.find(result=>result.status==='rejected').reason.code,'CONFLICT');
  const resumed=ctx.rows.get(held.id);
  assert.deepEqual(ctx.calls,[],'Resume queues review without making any provider call.');
  assert.deepEqual(resumed.episode,before.episode);assert.deepEqual(resumed.state.audio,before.state.audio);
  assert.deepEqual(persistedMedia(resumed.state.shots),persistedMedia(before.state.shots));
  assert.deepEqual(resumed.state.shots[0].quality,before.state.shots[0].quality);
  assert.deepEqual(resumed.state.shots[1].videoQualityRecheck.previousReview,oldReview);
  assert.equal(resumed.state.shots[1].videoQualityRecheck.policyVersion,PET_QUALITY_POLICY_VERSION);
  assert.equal(resumed.state.shots[1].quality.video,undefined);
  await ctx.service.advance(USER,held.id);
  assert.deepEqual(ctx.calls.map(call=>call[0]),['review']);
  assert.equal(ctx.rows.get(held.id).state.shots[1].quality.video.status,'passed');
  assert.equal((await ctx.service.advance(USER,held.id)).status,'completed');
  assert.deepEqual(ctx.calls.map(call=>call[0]),['review','render']);
  assert.deepEqual(persistedMedia(ctx.rows.get(held.id).state.shots),persistedMedia(before.state.shots));
});
test('an outdated C2 gate response is consumed once and the saved videos still render',async()=>{
  const ctx=setup({reviewAsset:async(job,index,kind)=>{ctx.calls.push(['review',index,kind]);return{status:'review',issues:['Legacy owner pose concern.'],policyVersion:PET_QUALITY_POLICY_VERSION};}});
  const held=await seedObsoleteC2VideoRejection(ctx);await ctx.service.resume(USER,held.id);
  const continued=await ctx.service.advance(USER,held.id);assert.notEqual(continued.status,'held');
  assert.equal(ctx.rows.get(held.id).state.shots[1].quality.video.analysisStatus,'unavailable');
  assert.equal((await ctx.service.advance(USER,held.id)).status,'completed');
  assert.deepEqual(ctx.calls.map(call=>call[0]),['review','render']);
});
test('C2 recheck refuses current or unknown policies, incomplete media, actor rejection and provider submission ambiguity',async()=>{
  const mutations=[
    row=>{row.state.shots[1].quality.video.policyVersion=PET_QUALITY_POLICY_VERSION;},
    row=>{row.state.shots[1].quality.video.policyVersion='unknown-policy';},
    row=>{delete row.state.shots[1].quality.video.policyVersion;},
    row=>{row.state.shots[1].videoStatus='pending';},
    row=>{delete row.state.shots[1].requestId;},
    row=>{delete row.state.shots[1].videoUrl;},
    row=>{delete row.state.shots[1].videoSourceUrl;},
    row=>{delete row.state.audio.stableUrl;},
    row=>{row.state.shots[0].quality.video.status='review';},
    row=>{row.state.shots[0].quality.image.status='review';},
    row=>{row.state.failureCode='UNKNOWN_SUBMISSION';},
    row=>{row.state.failureCode='PROVIDER_VIDEO';},
    row=>{row.state.lease={token:'ambiguous-submit',until:1,operation:'video_submit',shotIndex:1};},
    row=>{row.state.failedShotIndex=0;},
    row=>{row.state.shots[1].videoQualityRecheck={policyVersion:PET_QUALITY_POLICY_VERSION,requestedAt:'already-requested',previousReview:row.state.shots[1].quality.video};},
  ];
  for(const mutate of mutations){
    const ctx=setup();const job=await seedObsoleteC2VideoRejection(ctx);mutate(ctx.rows.get(job.id));
    const before=structuredClone(ctx.rows.get(job.id));assert.equal((await ctx.service.get(USER,job.id)).canResume,false);
    await assert.rejects(ctx.service.resume(USER,job.id),error=>error.code==='RECOVERY_NOT_SAFE');
    assert.deepEqual(ctx.rows.get(job.id),before);assert.deepEqual(ctx.calls,[]);
  }
});
test('obsolete opening rejection cannot reopen approval after video markers, ambiguity, or a defined unknown policy stamp',async()=>{
  const mutations=[
    row=>{row.state.shots[0].requestId='already-submitted';},
    row=>{row.state.shots[0].videoStatus='submitting';},
    row=>{row.state.shots[1].requestId='second-request';},
    row=>{row.state.failureCode='UNKNOWN_SUBMISSION';},
    row=>{row.state.lease={token:'uncertain-review',until:1,operation:'image_review',shotIndex:0};},
    row=>{row.state.shots[0].videoSourceUrl='https://vidgen.x.ai/existing.mp4';},
    row=>{row.state.shots[0].quality.image.policyVersion='pet-asset-review-v1';},
    row=>{row.state.shots[0].quality.image.policyVersion='unknown-future-policy';},
  ];
  for(const mutate of mutations){
    const ctx=setup();const created=await seedObsoleteOpeningRejection(ctx);mutate(ctx.rows.get(created.id));
    const before=structuredClone(ctx.rows.get(created.id));assert.equal((await ctx.service.get(USER,created.id)).canResume,false);
    await assert.rejects(ctx.service.resume(USER,created.id),error=>error.code==='RECOVERY_NOT_SAFE');
    assert.deepEqual(ctx.rows.get(created.id),before);assert.deepEqual(ctx.calls,[]);
  }
});
test('v4 transient quality-review failure resumes against the saved asset without another paid request',async()=>{
  let reviews=0;const ctx=setup({reviewAsset:async(job,index,kind)=>{ctx.calls.push(['review',index,kind]);if(++reviews===1)throw new Error('temporary review outage');return{status:'passed',issues:[]};}});
  const job=await ctx.service.create(USER,episodeV4(),TRACK);const held=await until(ctx,job.id,'held');assert.equal(held.canResume,true);
  const paidBefore=ctx.calls.filter(c=>['image','video'].includes(c[0])).length;
  await ctx.service.resume(USER,job.id);await ctx.service.advance(USER,job.id);
  assert.equal(ctx.calls.filter(c=>['image','video'].includes(c[0])).length,paidBefore);
  assert.equal(ctx.rows.get(job.id).state.shots[0].quality.image.status,'passed');
});
test('v4 missing quality dependency holds closed, and transient bridge extraction reuses clip one',async()=>{
  const missing=setup({reviewAsset:undefined});const job=await missing.service.create(USER,episodeV4(),TRACK);const held=await until(missing,job.id,'held');
  assert.equal(missing.rows.get(job.id).state.failureCode,'REVIEW_CONFIG');assert.equal(held.canResume,false);
  assert.equal(missing.calls.filter(c=>c[0]==='video').length,0);
  let bridges=0;const ctx=setup({extractBridgeFrame:async(_job,index)=>{ctx.calls.push(['bridge',index]);if(++bridges===1)throw new Error('local ffmpeg busy');return{url:'https://storage.test/bridge-retry'};}});
  const created=await ctx.service.create(USER,episodeV4(),TRACK);const bridgeHeld=await until(ctx,created.id,'held');
  assert.equal(ctx.rows.get(created.id).state.failedOperation,'bridge');assert.equal(bridgeHeld.canResume,true);
  const paidBefore=ctx.calls.filter(c=>['image','video'].includes(c[0])).length;
  await ctx.service.resume(USER,created.id);await ctx.service.advance(USER,created.id);
  assert.equal(ctx.calls.filter(c=>['image','video'].includes(c[0])).length,paidBefore);
  assert.equal(ctx.rows.get(created.id).state.shots[1].keyframeUrl,'https://storage.test/bridge-retry');
});
test('v4 never treats malformed or media-filled quality output as a pass',async()=>{
  for(const review of [null,{status:'passed'}, {status:'unknown',issues:[]}, {status:'passed',issues:['data:image/png;base64,forbidden']}]){
    const ctx=setup({reviewAsset:async()=>review});const job=await ctx.service.create(USER,episodeV4(),TRACK);const held=await until(ctx,job.id,'held');
    assert.equal(ctx.rows.get(job.id).state.failureCode,'QUALITY_RESPONSE');assert.equal(ctx.calls.filter(c=>c[0]==='video').length,0);
    assert.equal(held.shots[0].quality,undefined);
  }
});
test('v4 creation is idempotent while legacy jobs retain six-clip manual review',async()=>{
  const v4=setup();const e=episodeV4();const first=await v4.service.create(USER,e,TRACK);const second=await v4.service.create(USER,structuredClone(e),TRACK);
  assert.equal(first.id,second.id);assert.equal(v4.rows.size,1);assert.deepEqual(v4.calls,[]);
  const legacy=setup();const old=await seedLegacyJob(legacy);assert.equal(old.productionMode,'legacy-six-clips');assert.equal(old.shots.length,6);
  const saved=structuredClone(legacy.rows.get(old.id));
  assert.equal((await legacy.service.create(USER,episode(),TRACK)).id,old.id);
  assert.deepEqual(legacy.rows.get(old.id),saved);assert.deepEqual(legacy.calls,[]);
  const review=await until(legacy,old.id,'review');assert.equal(review.status,'review');assert.equal(legacy.calls.filter(c=>c[0]==='video').length,0);
});
test('v4 accepts only bounded 30-second encoding tolerance while legacy duration limits stay unchanged',async()=>{
  const accepted=setup({snapshotAudio:async()=>({url:'https://storage.test/audio',durationSeconds:30.1})});const job=await accepted.service.create(USER,episodeV4(),TRACK);
  const next=await accepted.service.advance(USER,job.id);assert.notEqual(next.status,'held');
  const rejected=setup({snapshotAudio:async()=>({url:'https://storage.test/audio',durationSeconds:30.151})});const rejectedJob=await rejected.service.create(USER,episodeV4(),TRACK);
  assert.equal((await rejected.service.advance(USER,rejectedJob.id)).status,'held');
  assert.throws(()=>assertPetAudioDuration(30.01));assert.doesNotThrow(()=>assertPetAudioDuration(30));
});
test('v4 review-level audio ending holds before paid media while uncertain analysis remains visible',async()=>{
  const rhythm=status=>({beatSeconds:status==='uncertain'?[]:[0,3,6],onsetSeconds:[],confidence:status==='uncertain'?0:.8,method:status==='uncertain'?'editorial-fallback':'energy-autocorrelation',ending:{status,reasons:['tail remains active'],terminalRms:.2}});
  const review=setup({snapshotAudio:async()=>({url:'https://storage.test/audio',durationSeconds:28,rhythm:rhythm('review')})});const job=await review.service.create(USER,episodeV4(),TRACK);
  const held=await review.service.advance(USER,job.id);assert.equal(held.status,'held');assert.match(held.message,/음원 끝에서 소리가 이어진 채 종료될 가능성/);
  assert.equal(held.canResume,false);assert.equal(review.rows.get(job.id).state.audio.stableUrl,'https://storage.test/audio');assert.equal(held.audioQuality.endingStatus,'review');
  assert.equal(review.calls.filter(c=>['image','video'].includes(c[0])).length,0);await assert.rejects(review.service.resume(USER,job.id),error=>error.code==='RECOVERY_NOT_SAFE');
  const uncertain=setup({snapshotAudio:async()=>({url:'https://storage.test/audio',durationSeconds:28,rhythm:rhythm('uncertain')})});const pending=await uncertain.service.create(USER,episodeV4(),TRACK);
  const next=await uncertain.service.advance(USER,pending.id);assert.notEqual(next.status,'held');assert.equal(next.audioQuality.endingStatus,'uncertain');assert.match(next.message,/확인이 필요/);
});
test('reviewed motion prompts are frozen separately and all six provider submissions use the approved copy',async()=>{
  const ctx=setup();const job=await seedLegacyJob(ctx);const review=await until(ctx,job.id,'review');
  assert.deepEqual(review.shots.map(s=>s.motionPrompt),episode().shots.map(s=>s.videoPrompt));
  const before=structuredClone(ctx.rows.get(job.id));
  const reviewed=durations.map((_,i)=>`  Approved restrained movement ${i+1}. Preserve this exact whitespace.  `);
  const approvedCopy=[...reviewed];
  const approved=await ctx.service.approve(USER,job.id,reviewed);
  const savedAfterApproval=structuredClone(ctx.rows.get(job.id));
  assert.deepEqual(approved.shots.map(s=>s.motionPrompt),approvedCopy);
  assert.deepEqual(savedAfterApproval.state.approvedMotionPrompts,approvedCopy);
  assert.deepEqual(savedAfterApproval.episode,before.episode);
  assert.deepEqual(savedAfterApproval.state.audio,before.state.audio);
  assert.deepEqual(savedAfterApproval.state.shots,before.state.shots);
  reviewed[0]='caller edits after approval';approved.shots[1].motionPrompt='caller edits returned view';
  assert.equal(ctx.calls.filter(c=>c[0]==='video').length,0,'Approval saves a decision and does not submit a video.');
  await until(ctx,job.id,'completed');
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='video').map(c=>c[1]),approvedCopy);
  assert.deepEqual(ctx.rows.get(job.id).episode,before.episode);
  assert.deepEqual((await ctx.service.get(USER,job.id)).shots.map(s=>s.motionPrompt),approvedCopy);
});
test('invalid motion arrays leave the review and all paid submission state unchanged',async()=>{
  const ctx=setup();const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');
  const before=structuredClone(ctx.rows.get(job.id));const callsBefore=structuredClone(ctx.calls);
  const valid=durations.map((_,i)=>`reviewed ${i+1}`);
  const invalid=[null,{},'one prompt',[],valid.slice(0,5),[...valid,'extra'],new Array(6),
    ['',...valid.slice(1)],[' \n\t ',...valid.slice(1)],[null,...valid.slice(1)],[7,...valid.slice(1)],
    ['x'.repeat(5001),...valid.slice(1)],['d'+'ata: forbidden media',...valid.slice(1)],['BASE64 media',...valid.slice(1)],
    Array.from({length:6},()=>String.fromCharCode(1).repeat(5000))];
  for(const motionPrompts of invalid){
    await assert.rejects(ctx.service.approve(USER,job.id,motionPrompts),error=>error instanceof PetPipelineError&&error.code==='MOTION_PROMPTS'&&error.status===400);
    assert.deepEqual(ctx.rows.get(job.id),before);
    assert.deepEqual(ctx.calls,callsBefore);
  }
  assert.equal((await ctx.service.advance(USER,job.id)).status,'review');
  assert.equal(ctx.calls.filter(c=>c[0]==='video').length,0);
});
test('reapproval cannot replace frozen prompts, increment state, or submit a video',async()=>{
  const ctx=setup();const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');
  const original=durations.map((_,i)=>`first approved ${i+1}`);
  await ctx.service.approve(USER,job.id,original);
  const before=structuredClone(ctx.rows.get(job.id));const callsBefore=structuredClone(ctx.calls);
  const reloaded=createPetVideoService(ctx.deps);
  const again=await reloaded.approve(USER,job.id,durations.map((_,i)=>`replacement ${i+1}`));
  await reloaded.approve(USER,job.id);
  assert.deepEqual(again.shots.map(s=>s.motionPrompt),original);
  assert.deepEqual(ctx.rows.get(job.id),before);assert.deepEqual(ctx.calls,callsBefore);
  await reloaded.advance(USER,job.id);
  assert.equal(ctx.calls.filter(c=>c[0]==='video')[0][1],original[0]);
});
test('already-approved legacy jobs retain original prompt fallback without rewriting state on reapproval',async()=>{
  const ctx=setup();const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');
  const legacy=ctx.rows.get(job.id);legacy.state.approvedAt=new Date(0).toISOString();legacy.status='generating';
  assert.equal(legacy.state.approvedMotionPrompts,undefined);
  const before=structuredClone(legacy);
  const view=await ctx.service.approve(USER,job.id,durations.map(()=> 'new unapproved replacement'));
  assert.deepEqual(ctx.rows.get(job.id),before);
  assert.deepEqual(view.shots.map(s=>s.motionPrompt),episode().shots.map(s=>s.videoPrompt));
  await until(ctx,job.id,'completed');
  assert.deepEqual(ctx.calls.filter(c=>c[0]==='video').map(c=>c[1]),episode().shots.map(s=>s.videoPrompt));
  assert.equal(ctx.rows.get(job.id).state.approvedMotionPrompts,undefined);
});
test('simultaneous approvals freeze one winner before any video submission',async()=>{
  const ctx=setup();const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');
  const revision=ctx.rows.get(job.id).revision;
  const first=durations.map((_,i)=>`first ${i}`),second=durations.map((_,i)=>`second ${i}`);
  const attempts=await Promise.allSettled([ctx.service.approve(USER,job.id,first),ctx.service.approve(USER,job.id,second)]);
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(attempts.find(r=>r.status==='rejected').reason.code,'CONFLICT');
  const saved=ctx.rows.get(job.id);assert.equal(saved.revision,revision+1);
  assert.ok(JSON.stringify(saved.state.approvedMotionPrompts)===JSON.stringify(first)||JSON.stringify(saved.state.approvedMotionPrompts)===JSON.stringify(second));
  assert.equal(ctx.calls.filter(c=>c[0]==='video').length,0);
});
test('motion review cannot approve missing images or trigger paid work from a draft',async()=>{
  const ctx=setup();const job=await seedLegacyJob(ctx);const before=structuredClone(ctx.rows.get(job.id));
  await assert.rejects(ctx.service.approve(USER,job.id,durations.map(()=> 'reviewed motion')),error=>error.code==='NOT_READY');
  assert.deepEqual(ctx.rows.get(job.id),before);assert.deepEqual(ctx.calls,[]);
});
test('approval route forwards reviewed motion and enforces the existing total request body limit',async()=>{
  const ctx=setup();const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');
  const before=structuredClone(ctx.rows.get(job.id));const motionPrompts=durations.map((_,i)=>`route reviewed ${i+1}`);
  const {post,rendererCalls}=routeFixture({service:ctx.service});
  const oversized=await post({action:'approve',jobId:job.id,motionPrompts,padding:'x'.repeat(120000)});
  assert.equal(oversized.status,400);assert.deepEqual(ctx.rows.get(job.id),before);
  const malformed=await post({action:'approve',jobId:job.id,motionPrompts:motionPrompts.slice(0,5)});
  assert.equal(malformed.status,400);assert.equal(malformed.body.code,'MOTION_PROMPTS');assert.deepEqual(ctx.rows.get(job.id),before);
  const approved=await post({action:'approve',jobId:job.id,motionPrompts});
  assert.equal(approved.status,200);assert.deepEqual(approved.body.job.shots.map(s=>s.motionPrompt),motionPrompts);
  assert.deepEqual(ctx.rows.get(job.id).state.approvedMotionPrompts,motionPrompts);assert.equal(ctx.calls.filter(c=>c[0]==='video').length,0);
  assert.equal(rendererCalls(),0);
});
test('renderer GET requires authentication before executing the preflight',async()=>{
  const api=routeFixture({userId:null,service:{get:async()=>{throw new Error('Unexpected job lookup');}}});
  const result=await api.get('?check=renderer');
  assert.equal(result.status,401);assert.equal(result.body.code,'UNAUTHORIZED');
  assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(api.rendererCalls(),0);
});
test('authenticated renderer GET returns readiness only without job lookup or server paths',async()=>{
  const api=routeFixture({service:{get:async()=>{throw new Error('Unexpected job lookup');}}});
  const result=await api.get('?check=renderer');
  assert.equal(result.status,200);assert.deepEqual(result.body,{success:true,rendererReady:true});
  assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(api.rendererCalls(),1);
  assert.doesNotMatch(JSON.stringify(result.body),/private|fixture|ffmpeg|font/);
});
test('renderer GET failures keep safe messages and no-store without leaking process details',async()=>{
  for(const error of [new PetPipelineError('영상 합성 도구 설정이 필요합니다.','FFMPEG_CONFIG',503),new Error('private-fixture-binary-path-and-key')]){
    const api=routeFixture({service:{},preflight:async()=>{throw error;}});
    const result=await api.get('?check=renderer');
    assert.equal(result.status,error instanceof PetPipelineError?503:500);
    assert.equal(result.body.success,false);assert.equal(result.body.rendererReady,undefined);
    assert.equal(result.body.code,error instanceof PetPipelineError?'FFMPEG_CONFIG':'INTERNAL_ERROR');
    assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(api.rendererCalls(),1);
    assert.doesNotMatch(JSON.stringify(result.body),/private-fixture|binary-path|and-key/);
  }
});
test('ordinary job GET still returns the owned job without renderer preflight',async()=>{
  const ctx=setup();const job=await ctx.service.create(USER,episode(),TRACK);const before=structuredClone(ctx.rows.get(job.id));
  const api=routeFixture({service:ctx.service});const result=await api.get('?jobId='+job.id);
  assert.equal(result.status,200);assert.equal(result.body.job.id,job.id);assert.equal(result.body.rendererReady,undefined);
  assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(api.rendererCalls(),0);
  assert.deepEqual(ctx.rows.get(job.id),before);assert.deepEqual(ctx.calls,[]);
});
test('create renderer failure stops before service creation or paid work',async()=>{
  const ctx=setup();let creates=0;
  const api=routeFixture({service:{create:async(...args)=>{creates++;return ctx.service.create(...args);}},preflight:async()=>{throw new PetPipelineError('영상 합성 도구 설정이 필요합니다.','FFMPEG_CONFIG',503);}});
  const result=await api.post({action:'create',trackId:TRACK,episode:episode()});
  assert.equal(result.status,503);assert.equal(result.body.code,'FFMPEG_CONFIG');
  assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(api.rendererCalls(),1);
  assert.equal(creates,0);assert.equal(ctx.rows.size,0);assert.deepEqual(ctx.calls,[]);
});
test('create checks renderer readiness before preserving the existing draft creation behavior',async()=>{
  const ctx=setup();const events=[];const e=episode();
  const api=routeFixture({service:{create:async(...args)=>{events.push('create');return ctx.service.create(...args);}},preflight:async()=>{events.push('renderer');return{binary:'fixture-private-binary'};}});
  const result=await api.post({action:'create',trackId:TRACK,episode:e});
  assert.equal(result.status,200);assert.equal(result.body.job.status,'draft');
  assert.deepEqual(events,['renderer','create']);assert.equal(ctx.rows.size,1);
  assert.deepEqual(originalEpisode(ctx.rows.get(result.body.job.id).episode),e);assert.equal(result.body.job.productionMode,'two-clips');assert.deepEqual(ctx.calls,[]);
  assert.equal(result.body.rendererReady,undefined);assert.doesNotMatch(JSON.stringify(result.body),/fixture-private-binary/);
});
test('idempotent create checks renderer while returning an existing completed job without new work',async()=>{
  const ctx=setup();const e=episode();const job=await ctx.service.create(USER,e,TRACK);const row=ctx.rows.get(job.id);
  row.status='completed';row.state.approvedAt=new Date(0).toISOString();row.state.audio.stableUrl='https://storage.test/audio';row.state.videoUrl='https://storage.test/final.mp4';row.state.durationSeconds=30;
  row.state.shots.forEach((s,i)=>{s.imageStatus='ready';s.videoStatus='ready';s.keyframeUrl=`https://storage.test/${i}-image`;s.videoUrl=`https://storage.test/${i}-video`;});
  const before=structuredClone(row);const api=routeFixture({service:ctx.service});
  const result=await api.post({action:'create',trackId:TRACK,episode:e});
  assert.equal(result.status,200);assert.equal(result.body.job.id,job.id);assert.equal(result.body.job.status,'completed');
  assert.equal(api.rendererCalls(),1);assert.deepEqual(ctx.rows.get(job.id),before);assert.equal(ctx.rows.size,1);assert.deepEqual(ctx.calls,[]);
});
test('create rejects an invalid track ID before renderer preflight and service creation',async()=>{
  let creates=0;const api=routeFixture({service:{create:async()=>{creates++;}}});
  const result=await api.post({action:'create',trackId:'invalid-track-id',episode:episode()});
  assert.equal(result.status,400);assert.equal(api.rendererCalls(),0);assert.equal(creates,0);
});
test('idempotent creation preserves episode snapshot despite JSON object property order',async()=>{
  const ctx=setup();const e=episode();const first=await ctx.service.create(USER,e,TRACK);
  const reversed=Object.fromEntries(Object.entries(e).reverse());
  const second=await ctx.service.create(USER,reversed,TRACK);assert.equal(first.id,second.id);
  await assert.rejects(ctx.service.create(USER,{...e,title:'changed'},TRACK),/이미 시작한/);
  assert.equal(ctx.rows.size,1);
});
test('double-click advances cannot issue duplicate paid image POST',async()=>{
  const ctx=setup();const job=await ctx.service.create(USER,episode(),TRACK);await ctx.service.advance(USER,job.id);
  await Promise.allSettled([ctx.service.advance(USER,job.id),ctx.service.advance(USER,job.id)]);
  assert.equal(ctx.calls.filter(c=>c[0]==='image').length,1);
});
test('lost video submission response becomes held without any automatic paid retry',async()=>{
  let submissions=0;
  const ctx=setup({startVideo:async()=>{submissions++;throw new Error('sensitive provider body');}});
  const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');await ctx.service.approve(USER,job.id);
  const result=await ctx.service.advance(USER,job.id);assert.equal(result.status,'held');assert.doesNotMatch(result.message,/sensitive/);
  for(let i=0;i<3;i++)await ctx.service.advance(USER,job.id);
  assert.equal(submissions,1);
});
test('server termination after paid submit marker expires into held, never resubmits',async()=>{
  const ctx=setup();const job=await ctx.service.create(USER,episode(),TRACK);
  const row=ctx.rows.get(job.id);row.state.audio.stableUrl='https://storage.test/audio';row.state.shots[0].imageStatus='submitting';row.state.lease={token:'old',until:1,operation:'image_submit',shotIndex:0};row.status='keyframes';
  const result=await ctx.service.advance(USER,job.id);assert.equal(result.status,'held');assert.equal(ctx.calls.length,0);
});
test('expired v4 quality submission marker holds without silently repeating a billed review',async()=>{
  const ctx=setup();const job=await ctx.service.create(USER,episodeV4(),TRACK);const row=ctx.rows.get(job.id);
  row.state.audio.stableUrl='https://storage.test/audio';row.state.shots[0].imageStatus='ready';row.state.shots[0].keyframeUrl='https://storage.test/master.jpg';
  row.state.lease={token:'old-review',until:1,operation:'image_review',shotIndex:0};row.status='generating';
  const result=await ctx.service.advance(USER,job.id);assert.equal(result.status,'held');assert.equal(result.canResume,false);
  assert.equal(ctx.calls.filter(c=>c[0]==='review').length,0);assert.equal(row.state.shots[0].imageStatus,'ready');
});
test('reload resumes persisted request ID; transient poll does not submit another video',async()=>{
  let polls=0;const ctx=setup({pollVideo:async id=>{ctx.calls.push(['poll',id]);if(++polls===1)throw new Error('timeout');return{status:'done',url:'https://vidgen.x.ai/ok.mp4'};}});
  const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');await ctx.service.approve(USER,job.id);
  await ctx.service.advance(USER,job.id);const persisted=ctx.rows.get(job.id).state.shots[0].requestId;
  const reloaded=createPetVideoService(ctx.deps);
  ctx.tick();await reloaded.advance(USER,job.id);ctx.tick();await reloaded.advance(USER,job.id);
  assert.equal(ctx.calls.filter(c=>c[0]==='video').length,1);assert.deepEqual(ctx.calls.filter(c=>c[0]==='poll').map(c=>c[1]),[persisted,persisted]);
});
test('failed/expired provider shot holds the job and preserves previous completed shots',async()=>{
  for(const status of ['failed','expired']){
    const ctx=setup({pollVideo:async()=>({status})});const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');await ctx.service.approve(USER,job.id);
    const view=await until(ctx,job.id,'held');assert.equal(view.shots[0].status,'video_held');assert.ok(view.shots.every(s=>s.keyframeUrl));assert.equal(ctx.calls.filter(c=>c[0]==='render').length,0);
  }
});
test('only owner can load/advance/approve a job',async()=>{
  const ctx=setup();const job=await ctx.service.create(USER,episode(),TRACK);
  for(const method of ['get','advance','approve'])await assert.rejects(ctx.service[method]('other-user',job.id),error=>error.status===404);
});
test('audio outside 20–30 seconds stops before the first paid image',async()=>{
  for(const durationSeconds of [0,19.99,30.01,45,NaN]){
    const ctx=setup({snapshotAudio:async()=>({url:'https://storage.test/audio',durationSeconds})});const job=await seedLegacyJob(ctx);const view=await ctx.service.advance(USER,job.id);
    assert.equal(view.status,'held');assert.match(view.message,/20~30초/);assert.equal(ctx.calls.length,0);
  }
  assert.doesNotThrow(()=>assertPetAudioDuration(20));assert.doesNotThrow(()=>assertPetAudioDuration(30));
});
test('malformed episode is rejected without provider calls',async()=>{
  const ctx=setup();for(const value of [null,{}, {...episode(),shots:[null,null,null,null,null,null]}])await assert.rejects(ctx.service.create(USER,value,TRACK),PetPipelineError);
  assert.equal(ctx.calls.length,0);
});
test('same episode id and lyrics cannot replace stored source or visual prompts',async()=>{
  const canonical=episode();const submitted=structuredClone(canonical);
  submitted.sourceTopic='다른 상황';submitted.shots[0].videoPrompt='different paid-provider prompt';
  const ctx=setup();ctx.store.ownedAudio=async()=>({sourceUrl:'https://cdn.suno.ai/owned.mp3',episode:canonical});
  await assert.rejects(ctx.service.create(USER,submitted,TRACK),error=>error.code==='AUDIO_EPISODE_MISMATCH'&&error.status===409);
  assert.equal(ctx.rows.size,0);assert.equal(ctx.calls.length,0);
});
test('assembly cannot mark a duration mismatch completed',async()=>{
  const ctx=setup({render:async()=>({url:'https://storage.test/partial.mp4',durationSeconds:24})});const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');await ctx.service.approve(USER,job.id);
  const held=await until(ctx,job.id,'held');assert.equal(held.videoUrl,undefined);assert.match(held.message,/30초/);
});
test('media URL trust is exact; data URLs, arbitrary hosts, credentials and nonstandard ports are rejected',()=>{
  const origin='https://owned.supabase.co';
  for(const url of ['http://vidgen.x.ai/a','https://127.0.0.1/a','https://evil.example/a','https://vidgen.x.ai.evil.com/a','https://u:p@vidgen.x.ai/a','https://vidgen.x.ai:444/a','https://other.supabase.co/storage/v1/object/public/melodio-assets/a','https://owned.supabase.co/rest/v1/a'])assert.throws(()=>assertPetMediaUrl(url,'video',origin));
  assert.doesNotThrow(()=>assertPetMediaUrl('https://owned.supabase.co/storage/v1/object/public/melodio-assets/a','video',origin));
  assert.doesNotThrow(()=>assertPetMediaUrl('https://vidgen.x.ai/a','video',origin));
});
test('stream body limit aborts oversized provider response without exposing it',async()=>{
  await assert.rejects(readPetBoundedBody(new Response('x'.repeat(100)),20),error=>error.code==='MEDIA_SIZE');
  assert.equal((await readPetBoundedBody(new Response('ok'),20)).toString(),'ok');
});
test('provider payloads use exact prompts, Lite video and unchanged image models, single reference and bounded request ID',async()=>{
  const priorKey=process.env.XAI_API_KEY;const priorBase=process.env.XAI_API_BASE;
  process.env.XAI_API_KEY='stub';process.env.XAI_API_BASE='https://api.x.ai/v1';
  try {
    const calls=[];const provider=createPetXaiProvider(async(url,options)=>{calls.push([url,options]);return Response.json(url.includes('/images/')?{data:[{url:'https://imgen.x.ai/still.jpg'}]}:options.method==='POST'?{request_id:'saved-id'}:{status:'done',video:{url:'https://vidgen.x.ai/clip.mp4'}});});
    await provider.generateImage('exact image');await provider.generateImage('exact edit','https://imgen.x.ai/master.jpg');await provider.startVideo('exact approved motion',4,'https://imgen.x.ai/still.jpg');await provider.pollVideo('saved-id');
    assert.ok(calls[0][0].endsWith('/images/generations'));assert.ok(calls[1][0].endsWith('/images/edits'));
    assert.deepEqual(JSON.parse(calls[1][1].body).image,{url:'https://imgen.x.ai/master.jpg',type:'image_url'});
    assert.deepEqual(JSON.parse(calls[2][1].body),{model:'grok-imagine-video-1.5-lite',prompt:'exact approved motion',duration:4,aspect_ratio:'9:16',resolution:'480p',image:{url:'https://imgen.x.ai/still.jpg'},generate_audio:false});
    assert.ok(calls[3][0].endsWith('/videos/saved-id'));
  } finally {if(priorKey===undefined)delete process.env.XAI_API_KEY;else process.env.XAI_API_KEY=priorKey;if(priorBase===undefined)delete process.env.XAI_API_BASE;else process.env.XAI_API_BASE=priorBase;}
});
test('ASS captions have six editorial beats, safe Korean text and no karaoke tags',()=>{
  const e=episode();e.shots[0].caption='{\\an7}안녕\\N집사';const ass=buildPetAss(e);
  assert.equal((ass.match(/^Dialogue:/gm)||[]).length,6);assert.match(ass,/0:00:26.00,0:00:30.00/);assert.doesNotMatch(ass,/\\an7|\\k\d/);assert.match(ass,/Noto Sans KR/);assert.doesNotMatch(escapePetCaption('{a}\\b'),/[{}]/);
});
test('local captionless renderer preflight succeeds without a font prerequisite',async()=>{const result=await preflightPetRenderer();assert.ok(result.binary);assert.equal(result.font,undefined);});
test('explicit recovery copies the saved keyframe without another image submission',async()=>{
  let copies=0;const ctx=setup({copyAsset:async(_job,index,kind)=>{if(++copies===1)throw new PetPipelineError('storage unavailable','ASSET_STORAGE',503);return`https://storage.test/${index}-${kind}`;}});
  const job=await seedLegacyJob(ctx);const held=await until(ctx,job.id,'held');assert.equal(held.canResume,true);
  const source=ctx.rows.get(job.id).state.shots[0].imageSourceUrl;
  await ctx.service.advance(USER,job.id);assert.equal(copies,1,'Held work requires explicit recovery.');
  await ctx.service.resume(USER,job.id);await ctx.service.advance(USER,job.id);
  assert.equal(copies,2);assert.equal(ctx.calls.filter(c=>c[0]==='image').length,1);
  assert.equal(ctx.rows.get(job.id).state.shots[0].imageSourceUrl,source);assert.equal(ctx.rows.get(job.id).state.shots[0].imageStatus,'ready');
});
test('explicit recovery copies a saved completed clip without a new paid video',async()=>{
  let failed=false;const ctx=setup({copyAsset:async(_job,index,kind)=>{if(kind==='video'&&!failed){failed=true;throw new Error('temporary network failure');}return`https://storage.test/${index}-${kind}`;}});
  const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');await ctx.service.approve(USER,job.id);
  const held=await until(ctx,job.id,'held');assert.equal(held.canResume,true);const saved=structuredClone(ctx.rows.get(job.id));
  await ctx.service.resume(USER,job.id);await ctx.service.advance(USER,job.id);
  assert.equal(ctx.calls.filter(c=>c[0]==='video').length,1);assert.equal(ctx.rows.get(job.id).state.shots[0].requestId,saved.state.shots[0].requestId);
  assert.equal(ctx.rows.get(job.id).state.shots[0].videoStatus,'ready');
});
test('render recovery reuses all six clips and approved audio without new provider requests',async()=>{
  let renders=0;const ctx=setup({render:async job=>{assert.equal(job.state.shots.filter(s=>s.videoUrl).length,6);if(++renders===1)throw new PetPipelineError('encode transient failure','RENDER_FAILED');return{url:'https://storage.test/final.mp4',durationSeconds:30};}});
  const job=await seedLegacyJob(ctx);await until(ctx,job.id,'review');await ctx.service.approve(USER,job.id);
  const held=await until(ctx,job.id,'held');assert.equal(held.canResume,true);const paidCalls=ctx.calls.filter(c=>['image','video'].includes(c[0])).length;
  await ctx.service.resume(USER,job.id);const completed=await ctx.service.advance(USER,job.id);
  assert.equal(completed.status,'completed');assert.equal(renders,2);assert.equal(ctx.calls.filter(c=>['image','video'].includes(c[0])).length,paidCalls);
});
test('audio fetch recovery reuses the owned snapshot source before any paid generation',async()=>{
  let attempts=0;const ctx=setup({snapshotAudio:async job=>{assert.equal(job.state.audio.sourceUrl,'https://cdn.suno.ai/owned.mp3');if(++attempts===1)throw new PetPipelineError('fetch delayed','MEDIA_FETCH');return{url:'https://storage.test/audio',durationSeconds:25};}});
  const job=await seedLegacyJob(ctx);const held=await ctx.service.advance(USER,job.id);assert.equal(held.canResume,true);
  await ctx.service.resume(USER,job.id);await ctx.service.advance(USER,job.id);assert.equal(attempts,2);assert.equal(ctx.calls.length,0);
});
test('paid ambiguity, provider expiry, invalid audio, and missing saved input cannot be resumed',async()=>{
  const configs=[
    {snapshotAudio:async()=>({url:'https://storage.test/audio',durationSeconds:31})},
    {generateImage:async()=>{throw new Error('submission response lost');}},
    {pollVideo:async()=>({status:'expired'})},
  ];
  for(const config of configs){
    const ctx=setup(config);const job=await seedLegacyJob(ctx);
    if(config.pollVideo){await until(ctx,job.id,'review');await ctx.service.approve(USER,job.id);}
    const held=await until(ctx,job.id,'held');assert.equal(held.canResume,false);await assert.rejects(ctx.service.resume(USER,job.id),error=>error.code==='RECOVERY_NOT_SAFE');
  }
  const ctx=setup({copyAsset:async()=>{throw new Error('network');}});const job=await seedLegacyJob(ctx);await until(ctx,job.id,'held');
  delete ctx.rows.get(job.id).state.shots[0].imageSourceUrl;
  assert.equal((await ctx.service.get(USER,job.id)).canResume,false);await assert.rejects(ctx.service.resume(USER,job.id),error=>error.code==='RECOVERY_NOT_SAFE');
});
test('NAT64 DNS supports public translated destinations and rejects private translated addresses',()=>{
  const {privatePetAddress}=load('src/lib/video/petMedia.ts');
  for(const ip of ['64:ff9b::6812:260a','64:ff9b::ac40:95f6','104.18.38.10','2606:4700::6812:260a'])assert.equal(privatePetAddress(ip),false,ip);
  for(const ip of ['64:ff9b::a00:1','64:ff9b::7f00:1','64:ff9b::c0a8:101','64:ff9b::a9fe:a9fe','64:ff9b::ac10:1','::1','fd00::1','169.254.169.254','127.0.0.1'])assert.equal(privatePetAddress(ip),true,ip);
});

test('classic Grok rejects an oversized motion prompt locally before a provider call',async()=>{
  const previous=process.env.XAI_API_KEY;process.env.XAI_API_KEY='offline-key';
  try {
    let calls=0;const provider=createPetXaiProvider(async()=>{calls++;return Response.json({request_id:'boundary-id'});});
    await assert.rejects(provider.startVideo('x'.repeat(4097),15,'https://imgen.x.ai/still.jpg'),e=>e.code==='PROVIDER_PROMPT_LENGTH');
    assert.equal(calls,0);
    await provider.startVideo('x'.repeat(4096),15,'https://imgen.x.ai/still.jpg');assert.equal(calls,1);
  } finally {if(previous===undefined)delete process.env.XAI_API_KEY;else process.env.XAI_API_KEY=previous;}
});

test('provider prompt-limit diagnostic does not expose reflected provider content',async()=>{
  const previous=process.env.XAI_API_KEY;process.env.XAI_API_KEY='offline-key';
  try {
    const provider=createPetXaiProvider(async()=>Response.json({error:'Prompt length must be at most 4096. secret-fixture-string https://private.example/input'},{status:400}));
    await assert.rejects(provider.startVideo('small prompt',15,'https://imgen.x.ai/still.jpg'),e=>e.code==='PROVIDER_PROMPT_LENGTH'&&!/secret-fixture|private.example/.test(e.message));
  } finally {if(previous===undefined)delete process.env.XAI_API_KEY;else process.env.XAI_API_KEY=previous;}
});

test('pet pilot treats story-core concerns as advice and finishes without still-image vision requests',async()=>{
  const { openingImageAnalysis, parsePetQualityAssessment }=load('src/lib/video/petQuality.ts');
  let videoAnalyses=0;
  const assessment={checks:Object.fromEntries(['hook','story_core','reversal','identity','clarity'].map(key=>[key,{verdict:'uncertain',evidence:'핵심 행동에 대한 반응을 더 명확히 보여 주세요.'}]))};
  const ctx=setup({reviewAsset:async(job,index,kind)=>kind==='image'?openingImageAnalysis(job,index):(++videoAnalyses,{...parsePetQualityAssessment(assessment),policyVersion:PET_QUALITY_POLICY_VERSION})});
  const job=await ctx.service.create(USER,episode(),TRACK);await until(ctx,job.id,'completed');
  const saved=ctx.rows.get(job.id);assert.equal(videoAnalyses,2);
  assert.equal(saved.state.shots[0].quality.image.analysisStatus,'not_applicable');
  assert.equal(saved.state.shots[0].quality.image.scope,'not_evaluated');
  assert.equal(saved.state.shots[0].quality.image.frameCount,0);
  assert.equal(saved.state.shots[0].quality.image.model,undefined);
  assert.ok(saved.state.shots.every(shot=>shot.quality.video.status==='advisory'&&shot.quality.video.issues.length===5&&!shot.error));
  assert.equal(saved.state.failureCode,undefined);assert.equal(ctx.calls.filter(c=>c[0]==='image').length,1);
  assert.equal(ctx.calls.filter(c=>c[0]==='video').length,2);
});
test('pet pilot consumes optional model outages and malformed output once without marking a pass',async()=>{
  for(const result of ['throw',null,{status:'advisory',issues:['data:image/png;base64,forbidden']}]){
    let analyses=0;const ctx=setup({reviewAsset:async()=>{analyses++;if(result==='throw')throw new PetPipelineError('analysis connection lost','QUALITY_NETWORK',503);return result;}});
    const job=await ctx.service.create(USER,episode(),TRACK);await until(ctx,job.id,'completed');
    assert.equal(analyses,3);const row=ctx.rows.get(job.id);
    for(const review of [row.state.shots[0].quality.image,...row.state.shots.map(shot=>shot.quality.video)]){
      assert.equal(review.status,'advisory');assert.equal(review.analysisStatus,'unavailable');assert.equal(review.scope,'not_evaluated');
      assert.equal(review.model,undefined);assert.equal(review.usage,undefined);assert.equal(review.checkedAt,undefined);
    }
    const before=structuredClone(row);await ctx.service.advance(USER,job.id);assert.equal(analyses,3);assert.deepEqual(ctx.rows.get(job.id),before);
  }
});
test('missing optional analysis dependency does not block the classic pet pilot',async()=>{
  const ctx=setup({reviewAsset:undefined});const job=await ctx.service.create(USER,episode(),TRACK);await until(ctx,job.id,'completed');
  assert.equal(ctx.rows.get(job.id).state.shots[0].quality.image.analysisStatus,'unavailable');
  assert.equal(ctx.calls.filter(c=>c[0]==='video').length,2);
});
test('known v3 opening holds reuse the same saved image, audio and story after explicit retirement',async()=>{
  const { openingImageAnalysis }=load('src/lib/video/petQuality.ts');
  for(const policyVersion of ['pet-asset-review-v2-opening-actor','pet-asset-review-v3-physical-beats']){
    const ctx=setup({reviewAsset:async(job,index,kind)=>kind==='image'?openingImageAnalysis(job,index):({status:'advisory',decision:'advisory',analysisStatus:'complete',policyVersion:PET_QUALITY_POLICY_VERSION,issues:[]})});
    const review={status:'review',policyVersion,issues:['Old incidental notebook detail.']};const job=await seedObsoleteOpeningRejection(ctx,review);
    assert.equal(job.canResume,true);const saved=structuredClone(ctx.rows.get(job.id));
    await ctx.service.advance(USER,job.id);assert.deepEqual(ctx.rows.get(job.id),saved);assert.deepEqual(ctx.calls,[]);
    await ctx.service.resume(USER,job.id);const resumed=ctx.rows.get(job.id);
    assert.deepEqual(resumed.episode,saved.episode);assert.deepEqual(resumed.state.audio,saved.state.audio);
    assert.deepEqual(persistedMedia(resumed.state.shots),persistedMedia(saved.state.shots));
    assert.deepEqual(resumed.state.shots[0].imageQualityRecheck.previousReview,review);assert.deepEqual(ctx.calls,[]);
    await ctx.service.advance(USER,job.id);assert.equal(ctx.calls.length,0);
    assert.equal(ctx.rows.get(job.id).state.shots[0].quality.image.analysisStatus,'not_applicable');
    await ctx.service.advance(USER,job.id);assert.equal(ctx.calls.filter(c=>c[0]==='video').length,1);
    assert.equal(ctx.calls.filter(c=>c[0]==='image').length,0);
    assert.equal(ctx.calls[0][3],saved.state.shots[0].keyframeUrl);
  }
});
test('expired pet pilot analysis leases are consumed without a second billed analysis',async()=>{
  for(const operation of ['image_review','video_review']){
    const ctx=setup();const job=await ctx.service.create(USER,episode(),TRACK);const row=ctx.rows.get(job.id);
    Object.assign(row.state.audio,{stableUrl:'https://storage.test/audio',durationSeconds:26});
    Object.assign(row.state.shots[0],{imageStatus:'ready',keyframeUrl:'https://storage.test/master.jpg'});
    if(operation==='video_review')Object.assign(row.state.shots[0],{videoStatus:'ready',videoUrl:'https://storage.test/saved.mp4',videoSourceUrl:'https://vidgen.x.ai/saved.mp4',requestId:'saved-request',quality:{image:{status:'passed',issues:[]}}});
    row.state.lease={token:'lost-analysis',until:1,operation,shotIndex:0};row.status='generating';const media=persistedMedia(row.state.shots);
    const view=await ctx.service.advance(USER,job.id);assert.equal(view.status,'generating');assert.equal(ctx.calls.length,0);
    const next=ctx.rows.get(job.id);assert.deepEqual(persistedMedia(next.state.shots),media);assert.equal(next.state.lease,undefined);
    assert.equal(next.state.shots[0].quality[operation==='image_review'?'image':'video'].analysisStatus,'unavailable');
    await ctx.service.advance(USER,job.id);assert.equal(ctx.calls.filter(c=>c[0]==='review').length,0);
    if(operation==='video_review')assert.equal(ctx.calls.filter(c=>c[0]==='video').length,0);
  }
});
test('technical media failures during optional analysis still stop production',async()=>{
  for(const code of ['SHOT_DURATION','MEDIA_PROBE','MEDIA_URL','MEDIA_HOST','MEDIA_SIZE','MISSING_SHOT','DISK_SPACE','FFMPEG_CONFIG']){
    const ctx=setup({reviewAsset:async()=>{throw new PetPipelineError('Invalid actual media',code);}});const job=await ctx.service.create(USER,episode(),TRACK);
    await until(ctx,job.id,'held');const saved=ctx.rows.get(job.id);assert.equal(saved.state.failureCode,code);
    assert.equal(saved.state.shots[0].quality,undefined);assert.equal(ctx.calls.filter(c=>c[0]==='video').length,0);
  }
});

// Model selection is reserved with the job, before any media work or paid POST.
test('new Pet jobs reserve Lite and resumed two-clip jobs retain every saved or legacy model', async () => {
  for (const savedModel of [undefined, 'grok-imagine-video', 'grok-imagine-video-1.5', 'grok-imagine-video-1.5-lite']) {
    const submissions = [];
    const ctx = setup({ startVideo: async (_prompt, duration, keyframe, model) => {
      const saved = [...ctx.rows.values()][0];
      assert.equal(saved.state.lease.operation, 'video_submit');
      assert.equal(saved.state.shots[submissions.length].videoStatus, 'submitting');
      submissions.push({ duration, keyframe, model }); return { requestId: `reserved-${submissions.length}` };
    } });
    const created = await ctx.service.create(USER, episode(), TRACK);
    assert.equal(ctx.rows.get(created.id).state.videoModel, 'grok-imagine-video-1.5-lite');
    assert.deepEqual(ctx.calls, []);
    // Emulate a saved job from a previous model default without changing its episode.
    const row = ctx.rows.get(created.id);
    if (savedModel === undefined) delete row.state.videoModel; else row.state.videoModel = savedModel;
    const frozenEpisode = JSON.stringify(row.episode);
    await ctx.service.create(USER, episode(), TRACK);
    assert.equal(ctx.rows.get(created.id).state.videoModel, savedModel);
    // A new service instance must continue C1 and C2 with the durable choice.
    ctx.service = createPetVideoService(ctx.deps);
    await until(ctx, created.id, 'completed');
    assert.deepEqual(submissions.map(call => call.model), [savedModel ?? 'grok-imagine-video', savedModel ?? 'grok-imagine-video']);
    assert.deepEqual(submissions.map(call => call.duration), [15, 15]);
    assert.equal(ctx.rows.get(created.id).state.videoModel, savedModel);
    assert.equal(JSON.stringify(ctx.rows.get(created.id).episode), frozenEpisode);
  }
});
test('a malformed saved Pet model cannot submit either video clip', async () => {
  let submissions = 0;
  const ctx = setup({ startVideo: async () => { submissions++; return { requestId: 'forbidden' }; } });
  const created = await ctx.service.create(USER, episode(), TRACK);
  ctx.rows.get(created.id).state.videoModel = 'unrecognized-video-model';
  const held = await until(ctx, created.id, 'held');
  assert.equal(submissions, 0); assert.equal(ctx.rows.get(created.id).state.failureCode, 'PROVIDER_CONFIG');
  assert.equal(held.canResume, false);
});
