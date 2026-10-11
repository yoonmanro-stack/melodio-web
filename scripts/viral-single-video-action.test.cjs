/* Offline orchestration fixtures execute the actual page handlers. No provider/media access. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const page = ts.createSourceFile('page.tsx', fs.readFileSync(path.join(root, 'src/app/(app)/viral/page.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) { let found; function visit(node) { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); } visit(page); assert.ok(found); return found; }
function declaration(name) { return find(node => ts.isVariableDeclaration(node) && node.name.getText(page) === name); }
function compile(code) { return ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText; }
const helperModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/vle/single-video-action.ts'), 'utf8')), { module: helperModule, exports: helperModule.exports, setTimeout, Error });
const helper = helperModule.exports;
const owner = 'c4d4d1a3-a867-44a4-bfed-ead74f80501b', trackId = '8b0187f3-6b80-477c-abf3-f4d456ba350f';
const brief = { sourceTopic: '퇴근하려는 직장인이 가방을 들지만 다시 앉는다.', categoryId: 'human', title: '가방만 퇴근', hook: '가방만 퇴근', lyrics: '[Chorus]\n가방만 퇴근', stylePrompt: 'original playful soul, clear Korean voice',
  creativePlan: { music: { genreEn: 'Original Korean soul funk' }, roles: [{ id: 'R1', role: '직장인', appearance: '성인 여성', count: 1, visibility: 'on_screen' }], sceneContext: { place: '사무실', ongoingActivity: '퇴근 준비', immediateTrigger: '새 서류 도착', settingEvidence: '책상과 서류' } } };
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function readBrief(value) { return value?.viralBrief || value?.metadata?.viralBrief || (value?.license_hash ? JSON.parse(value.license_hash).viralBrief : null); }
const extras = value => value.creativePlan ? { creativePlan: value.creativePlan } : {};
function handler(context, name) { vm.runInContext(compile(`module.exports = (${declaration(name).initializer.getText(page)});`), context); return context.module.exports; }
function effect(context, deps) {
  const call = find(node => ts.isCallExpression(node) && node.expression.getText(page) === 'useEffect' && node.arguments[1]?.getText(page) === deps);
  vm.runInContext(compile(`module.exports = (${call.arguments[0].getText(page)});`), context); return context.module.exports;
}
function harness(options = {}) {
  const calls = [], starts = [], polls = [], writes = [], alerts = [], scrolls = [];
  const savedBrief = { ...brief, categoryId: options.category || brief.categoryId, ...(options.brief || {}) };
  const savedTrack = { id: trackId, user_id: owner, status: 'completed', audio_url: 'https://example.invalid/audio.mp3', title: savedBrief.title, viralBrief: savedBrief, style: savedBrief.stylePrompt, ...(options.track || {}) };
  const episode = options.pet ? { id: 'pet-episode-A', title: '같은 댕냥이 이야기', sourceTopic: savedBrief.sourceTopic, lyrics: savedBrief.lyrics, stylePrompt: savedBrief.stylePrompt } : null;
  if (episode) savedTrack.petEpisode=episode;
  const scope = { ownerId: owner, category: savedBrief.categoryId, revision: 1, inputKey: 'frozen-current-draft' };
  const state = {
    module: { exports: {} }, exports: {}, require, React, Error, ...require('lucide-react'), URL, crypto: require('node:crypto').webcrypto,
    console: { warn() {}, error() {}, log() {} }, useCallback: callback => callback,
    ...helper, waitForSingleVideoReady: (read, current) => helper.waitForSingleVideoReady(read, current, tick),
    SingleVideoActionGate: helper.SingleVideoActionGate,
    genCategory: savedBrief.categoryId, petUserId: owner, planningAccountReady: true, planningAccountRef: { current: { userId: owner } },
    petCategoryRef: { current: savedBrief.categoryId }, petAccountRef: { current: owner }, petPlanningRequest: { current: 1 },
    singleVideoScopeRef: { current: scope }, singleVideoGateRef: { current: new helper.SingleVideoActionGate() },
    audioGenerationRef: { current: null }, pendingAudioRef: { current: null }, legacyVideoPendingRef: { current: null },
    selectedGrokTrack: options.existing ? savedTrack : null, generatedResult: options.existing ? savedTrack : null,
    selectedGrokTrackId: options.existing ? trackId : '', explicitGrokSelectionRef: { current: options.explicit ? trackId : null }, currentPlayingTrack: null, petCurrentEpisode: episode,
    completedOwnedPetAudio: !!options.pet && !!options.existing, petMatchingTrackId: options.pet && options.existing ? trackId : null, producerBrief: options.blank ? null : savedBrief,
    petEpisode: episode, petPlanLocked: false, planIsCurrent: !options.blank,
    customTopic: options.blank ? '' : savedBrief.sourceTopic, customLyrics: options.blank ? '' : savedBrief.lyrics,
    optimizedPrompt: options.blank ? '' : savedBrief.stylePrompt, selectedGenre: '', selectedMood: '', selectedVocal: '',
    duration: '30s', durationSeconds: 30, brandName: '', effectiveIsPublic: false,
    isOptimizing: false, isGenerating: false, isGeneratingGrokVideo: false, studioBusy: false,
    grokVideoResult: options.completedVideo || null, grokVideoPrompt: 'OLD UNRELATED PROMPT', grokAllowDance: false, grokCutCadence: 1.5,
    grokPromptRequest: { current: 0 }, storyTrackId: options.blank || options.existing ? trackId : null,
    storyRecovery: options.staleRecovery ? { trackId } : null, storyVideoJob: null,
    storyScopeRef: { current: '' }, storyCompletedResultRef: { current: '' }, storyClientRef: { current: null }, storyReadyRef: { current: null },
    petVideoStateRef: { current: options.pet && options.existing ? { scope: `${owner}:${episode.id}:${trackId}`, state: { busy:false, loading:options.ready===false, canStart:true, job:null, error:'' } } : null }, petRequestSettledRef: { current: null }, step4CardRef: { current: { scrollIntoView: value => scrolls.push(value) } },
    previewVideoRef: { current: null },
    VIRAL_GENRE_PROMPT_MAP: {}, CATEGORY_TITLES: { human: '현대인', ai_future: 'AI 미래' }, CATEGORY_THUMBNAIL_MAP: {}, DANCE_CATEGORY_ID: 'dance_challenge',
    VIRAL_STORY_VIDEO_CATEGORIES: new Set(['human','history','drama']), isViralStoryTrackId: value => typeof value === 'string' && value.length === 36,
    readViralBrief: readBrief, readCategoryBriefExtras: extras, readPetEpisode: value => value?.petEpisode || null,
    readSavedViralVideo: value => { const m = value?.license_hash ? JSON.parse(value.license_hash) : {}; return value?.video_url || m.video_url || null; },
    validatePetEpisode: () => [], isPetInstrumental: value => value?.audioMode === 'instrumental', buildViralVideoCoverPrompt: () => 'cover',
    localStorage: { getItem() { return '[]'; }, setItem() {} }, window: { localStorage: { getItem() { return null; }, setItem() {} } },
    setInterval(callback) { polls.push(callback); return polls.length; }, clearInterval() {}, setTimeout() {},
    alert: message => alerts.push(message),
    async fetch(url, init) {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : null, method: init?.method || 'GET' });
      if (options.reply) { const response = await options.reply(url, init, savedTrack); if (response) return response; }
      if (url === '/api/generate') { const body=JSON.parse(init.body); if(body.metadata.viralBrief) savedTrack.viralBrief=body.metadata.viralBrief; if(body.metadata.petEpisode) savedTrack.petEpisode=body.metadata.petEpisode; return { ok: true, json: async () => ({ success: true, track: { id: trackId } }) }; }
      if (url.startsWith('/api/generations?id=')) return { ok: true, json: async () => ({ generation: savedTrack }) };
      if (url === '/api/viral-cf/grok-video/prompt') return { ok: true, json: async () => ({ prompt: 'NEW TRACK PROMPT', allowDance: false, cutCadenceSeconds: 1.5 }) };
      if (url === '/api/viral-cf/grok-video') return { text: async () => JSON.stringify({ success: false, error: 'held legacy fixture' }) };
      throw new Error('UNEXPECTED_NETWORK');
    },
  };
  const context = vm.createContext(state);
  const storyClient = { async start(input) { starts.push(input); if (options.start) await options.start(input, state); } };
  function mountStory(id) {
    state.storyTrackId = id;
    state.storyClientRef.current = storyClient;
    state.storyReadyRef.current = { scope: `${owner}:${id}`, client: storyClient, ready: options.ready !== false, state: { job: options.savedJob || null, busy: options.ready === false, uncertain: options.uncertain || false, error: null } };
  }
  if (options.existing || options.blank) mountStory(trackId);
  for (const name of ['setIsGenerating','setIsGeneratingGrokVideo','setGenProgress','setGrokVideoProgress','setIsPlaying','setPetTrackId','setPetEpisode','setPetLinkedTrack','setPetOwnedTracksRefreshVersion','setAvailableTracks','setGrokVideoClips','setActiveClipIndex','setGrokVideoDuration','setIsTuningPrompt','setGrokAllowDance','setGrokCutCadence','setPetStartRequest','setProducerBrief','setCustomTopic','setCustomLyrics','setOptimizedPrompt']) {
    state[name] = value => { writes.push([name,value]); const key = name.charAt(3).toLowerCase() + name.slice(4); state[key] = typeof value === 'function' ? value(state[key]) : value; };
  }
  state.setSingleVideoPhase = value => { writes.push(['phase',value]); state.singleVideoPhase=value; };
  state.setSingleVideoError = value => { writes.push(['error',value]); state.error=value; };
  state.setGrokVideoError = value => { state.videoError=value; };
  state.setPetPlanError = value => { state.planError=value; };
  state.setGrokVideoResult = value => { state.grokVideoResult=value; writes.push(['video',value]); };
  state.setGrokVideoPrompt = value => { state.grokVideoPrompt=value; writes.push(['prompt',value]); };
  state.setGeneratedResult = value => {
    state.generatedResult=typeof value === 'function' ? value(state.generatedResult) : value;
    state.selectedGrokTrack=state.generatedResult;
    if(options.pet && state.generatedResult) state.petVideoStateRef.current={scope:`${owner}:${episode.id}:${state.generatedResult.id}`,state:{busy:false,loading:options.ready===false,canStart:true,job:null,error:''}};
    if (state.generatedResult && !state.storyReadyRef.current) mountStory(String(state.generatedResult.id));
  };
  state.setSelectedGrokTrackId = value => { state.selectedGrokTrackId=value; };
  state.fetchDynamicGrokPrompt = handler(context, 'fetchDynamicGrokPrompt');
  state.handleGenerate = handler(context, 'handleGenerate');
  state.handleGenerateGrokVideo = handler(context, 'handleGenerateGrokVideo');
  const run = handler(context, 'handleCreateVideo');
  const settlePet = handler(context, 'handlePetRequestSettled');
  return { state, calls, starts, polls, writes, alerts, scrolls, run, settlePet, savedTrack, context, mountStory,
    async completeAudio() { for (let i=0; i<10 && polls.length===0; i++) await tick(); assert.ok(polls.length); await polls[0](); await tick(); },
    invalidate(kind) { if (kind==='owner') state.planningAccountRef.current={ userId:'other-owner' }; else if (kind==='category') state.petCategoryRef.current='history'; else state.petPlanningRequest.current++; },
  };
}
const audioPosts = host => host.calls.filter(call => call.url === '/api/generate');
const videoPosts = host => host.calls.filter(call => call.url === '/api/viral-cf/grok-video');

test('two rapid primary clicks submit one audio request and wait for actual completion before one video start', async () => {
  const host = harness(); const first=host.run(), second=host.run(); await tick();
  assert.equal(audioPosts(host).length,1); assert.equal(host.starts.length,0);
  await host.completeAudio(); await Promise.all([first,second]);
  assert.equal(audioPosts(host).length,1); assert.equal(host.starts.length,1);
  assert.equal(host.starts[0].trackId,trackId); assert.equal(host.starts[0].prompt,'NEW TRACK PROMPT');
});

test('matching owned audio is verified and reused without another audio request', async () => {
  const host=harness({ existing:true }); await host.run();
  assert.equal(audioPosts(host).length,0); assert.equal(host.starts.length,1);
  assert.equal(host.calls[0].method,'GET'); assert.equal(host.starts[0].audioUrl,host.savedTrack.audio_url);
});

for (const key of ['lyrics','stylePrompt','sourceTopic','categoryId']) test(`mismatched ${key} stored in audio blocks the entire chain without creating replacement audio`, async () => {
  const host=harness({ existing:true, explicit:true }); host.savedTrack.viralBrief={...host.savedTrack.viralBrief,[key]:'different'};
  await host.run(); assert.equal(audioPosts(host).length,0); assert.equal(host.starts.length,0); assert.ok(host.state.error);
});

test('edited lyrics with implicit older audio create fresh authorized audio rather than silently reusing it', async () => {
  const host=harness({existing:true}); host.state.customLyrics='[Chorus]\n새로 다듬은 퇴근 가사';
  const running=host.run(); await host.completeAudio(); await running;
  assert.equal(audioPosts(host).length,1); assert.equal(host.starts.length,1);
  assert.equal(audioPosts(host)[0].body.metadata.viralBrief.lyrics,host.state.customLyrics);
});

test('foreign owned-audio response cannot start a video', async () => {
  const host=harness({existing:true,track:{user_id:'other-owner'}}); await host.run(); assert.equal(host.starts.length,0); assert.equal(audioPosts(host).length,0);
});

for (const kind of ['owner','category','revision']) test(`changing ${kind} while actual audio is pending cancels video continuation`, async () => {
  const host=harness(); const running=host.run(); await tick(); host.invalidate(kind); await host.completeAudio(); await running;
  assert.equal(host.starts.length,0); assert.equal(audioPosts(host).length,1);
});

for (const kind of ['owner','category','revision']) test(`changing ${kind} during prompt preparation prevents video start`, async () => {
  const pending=deferred(); const host=harness({existing:true,reply:async url => url.endsWith('/prompt') ? pending.promise : null });
  const running=host.run(); await tick(); host.invalidate(kind);
  pending.resolve({ok:true,json:async()=>({prompt:'Late prompt'})}); await running; assert.equal(host.starts.length,0);
});

test('a restored client must become idle before exactly one start is dispatched', async () => {
  const host=harness({existing:true,ready:false}); const running=host.run(); await tick(); assert.equal(host.starts.length,0);
  host.state.storyReadyRef.current.ready=true; host.state.storyReadyRef.current.state.busy=false;
  await running; assert.equal(host.starts.length,1);
});

test('a failed prompt stays held and never reuses text from the previous track', async () => {
  const host=harness({existing:true,reply:async url=>url.endsWith('/prompt')?{ok:false}:null}); await host.run();
  assert.equal(host.starts.length,0); assert.match(host.state.error,/영상 기획/); assert.equal(audioPosts(host).length,0);
});

test('lost audio submission response holds its identity and a second click never submits again', async () => {
  const host=harness({reply:async url=>{if(url==='/api/generate') throw Error('lost response');return null;}});
  await host.run(); await host.run(); assert.equal(audioPosts(host).length,1); assert.equal(host.starts.length,0); assert.match(host.state.error,/접수 결과/);
});

test('known audio wait budget expiration resumes polling on the same ID without another audio POST', async () => {
  let completed=false;
  const host=harness({reply:async(url,init,track)=>url.startsWith('/api/generations?id=')?{ok:true,json:async()=>({generation:completed?track:{id:trackId,status:'generating'}})}:null});
  const first=host.run(); await tick(); for(let i=0;i<108;i++) await host.polls[0](); await first;
  assert.equal(host.state.pendingAudioRef.current.trackId,trackId); assert.equal(audioPosts(host).length,1); assert.equal(host.starts.length,0);
  completed=true; const second=host.run(); await tick(); await host.polls[1](); await second;
  assert.equal(audioPosts(host).length,1); assert.equal(host.starts.length,1);
});

test('fresh lyrics suppress an older active recovery and start their own audio chain', async () => {
  const host=harness({staleRecovery:true});
  vm.runInContext(compile(`module.exports = ${declaration('storyTrackId').initializer.getText(page)};`), Object.assign(host.context,{durableStoryMode:true}));
  assert.equal(host.context.module.exports,null);
  host.state.storyTrackId=trackId; // Defense also exists at the action boundary.
  const running=host.run(); await host.completeAudio(); await running; assert.equal(audioPosts(host).length,1); assert.equal(host.starts.length,1);
});

test('blank recovery resumes its saved identity without audio or prompt creation', async () => {
  const host=harness({blank:true,savedJob:{id:'saved-job',status:'clip2'}}); await host.run();
  assert.deepEqual(host.starts,[undefined]); assert.equal(host.calls.length,0);
});

test('same-ID library object refresh leaves an authorized prompt request valid', async () => {
  const pending=deferred(); const host=harness({existing:true,reply:async url=>url.endsWith('/prompt')?pending.promise:null});
  const clearing=find(node=>ts.isCallExpression(node)&&node.expression.getText(page)==='useEffect'&&node.arguments[1]?.getText(page)==='[selectedGrokTrack?.id, genCategory]');
  assert.ok(clearing); effect(host.context,'[selectedGrokTrack?.id, genCategory]')();
  const running=host.run(); await tick(); const requestId=host.state.grokPromptRequest.current;
  host.state.selectedGrokTrack={...host.savedTrack}; // React sees unchanged primitive dependencies, so does not run the clear effect.
  assert.equal(host.state.grokPromptRequest.current,requestId);
  pending.resolve({ok:true,json:async()=>({prompt:'Same track exact prompt',allowDance:false,cutCadenceSeconds:1.5})}); await running;
  assert.equal(host.starts.length,1); assert.equal(host.starts[0].prompt,'Same track exact prompt');
});

test('a stale supplied scope is rejected before any resolveAudio or paid call', async () => {
  let calls=0; await helper.runSingleVideoAction({gate:new helper.SingleVideoActionGate(),scope:{ownerId:'A',category:'human',revision:1,inputKey:'x'},readScope:()=>({ownerId:'A',category:'human',revision:2,inputKey:'x'}),onPhase(){},resolveAudio:async()=>{calls++;},prepareVideo:async()=>{},startVideo:async()=>{},onError(){}}); assert.equal(calls,0);
});

test('prompt request uses the authored genre rather than a 482-character full style and preserves the creative plan', async () => {
  const longStyle='original musical arrangement '.repeat(20); assert.ok(longStyle.length>300);
  const host=harness({existing:true,brief:{stylePrompt:longStyle}}); await host.run();
  const request=host.calls.find(call=>call.url.endsWith('/prompt'));
  assert.equal(request.body.genre,brief.creativePlan.music.genreEn); assert.ok(request.body.genre.length<=300);
  assert.deepEqual(request.body.creativePlan,brief.creativePlan); assert.equal(host.starts.length,1);
});

test('completed current legacy video is displayed with no request', async () => {
  const host=harness({category:'ai_future',existing:true,completedVideo:'https://example.invalid/completed.mp4'}); await host.run();
  assert.equal(host.calls.length,0); assert.equal(host.scrolls.length,1);
});

test('persisted legacy video is verified and displayed without prompt or video POST', async () => {
  const host=harness({category:'ai_future',existing:true,track:{license_hash:JSON.stringify({video_url:'https://example.invalid/persisted.mp4'})}}); await host.run();
  assert.equal(videoPosts(host).length,0); assert.equal(host.calls.filter(call=>call.url.endsWith('/prompt')).length,0); assert.equal(host.state.grokVideoResult,'https://example.invalid/persisted.mp4');
});

test('lost legacy response and second click never issue a second paid video request', async () => {
  const host=harness({category:'ai_future',existing:true,reply:async url=>{if(url==='/api/viral-cf/grok-video') throw Error('lost result'); return null;}});
  await host.run(); await host.run(); assert.equal(videoPosts(host).length,1); assert.match(host.state.error,/새 유료 요청/);
});

test('owner cancellation during legacy response blocks covers, persistence and result writes', async () => {
  const pending=deferred(); const host=harness({category:'ai_future',existing:true,reply:async url=>url==='/api/viral-cf/grok-video'?pending.promise:null});
  const running=host.run(); await tick(); host.invalidate('owner');
  pending.resolve({text:async()=>JSON.stringify({success:true,videoUrl:'https://example.invalid/late.mp4'})}); await running;
  assert.equal(host.state.grokVideoResult,null); assert.equal(host.calls.filter(call=>call.url==='/api/autopilot/generate-image'||call.method==='PATCH').length,0);
});

test('parent pet action hands one exact request to the existing child and stays locked until settlement', async () => {
  const host=harness({category:'pet',pet:true,existing:true});
  const first=host.run(), second=host.run(); await tick();
  const request=host.state.petStartRequest;
  assert.ok(request); assert.equal(request.ownerId,owner); assert.equal(request.episodeId,host.state.petCurrentEpisode.id); assert.equal(request.trackId,trackId);
  assert.equal(audioPosts(host).length,0); assert.equal(host.state.singleVideoGateRef.current.busy,true);
  host.settlePet('other-request'); assert.equal(host.state.singleVideoGateRef.current.busy,true);
  host.settlePet(request.id); await Promise.all([first,second]); assert.equal(host.state.singleVideoGateRef.current.busy,false);
  assert.equal(host.state.petStartRequest,null);
});

test('new pet audio reaches the child only after actual completion and scoped restore readiness', async () => {
  const host=harness({category:'pet',pet:true,ready:false}); const running=host.run();
  await host.completeAudio(); assert.equal(host.state.petStartRequest,undefined);
  host.state.petVideoStateRef.current.state.loading=false; await tick();
  assert.equal(audioPosts(host).length,1); assert.ok(host.state.petStartRequest); assert.equal(host.state.petStartRequest.trackId,trackId);
  host.settlePet(host.state.petStartRequest.id); await running;
  assert.equal(host.calls.filter(call=>call.url.endsWith('/prompt')).length,0);
});

test('instrumental Pet uses the single action to generate empty-lyrics audio and continue once', async () => {
  const host = harness({ category: 'pet', pet: true, ready: false, brief: { lyrics: '' } });
  host.state.petEpisode.audioMode = 'instrumental'; host.state.selectedVocal = 'Talk-Sung';
  const running = host.run(); await host.completeAudio();
  assert.equal(host.state.petStartRequest, undefined);
  host.state.petVideoStateRef.current.state.loading = false; await tick();
  assert.equal(audioPosts(host).length, 1); assert.equal(audioPosts(host)[0].body.isInstrumental, true);
  assert.equal(audioPosts(host)[0].body.lyricsPrompt, ''); assert.ok(host.state.petStartRequest);
  host.settlePet(host.state.petStartRequest.id); await running;
  assert.equal(host.state.singleVideoGateRef.current.busy, false);
});

test('parent pet continuation is canceled when its owner changes during child restore', async () => {
  const host=harness({category:'pet',pet:true,existing:true,ready:false}); const running=host.run(); await tick();
  host.invalidate('owner'); host.state.petVideoStateRef.current.state.loading=false; await running;
  assert.equal(host.state.petStartRequest,undefined); assert.equal(audioPosts(host).length,0);
});

test('page has one primary lyrics action, four progress steps, and collapsed optional settings', () => {
  const primary=find(node=>ts.isJsxOpeningElement(node)&&node.tagName.getText(page)==='button'&&node.attributes.properties.some(prop=>prop.name?.text==='onClick'&&prop.initializer?.getText(page)==='{handleCreateVideo}'));
  assert.ok(primary); const source=page.getFullText();
  assert.equal(source.includes('Step 5'),false); assert.equal(source.includes('autoGrokVideo'),false); assert.equal(source.includes('onClick={handleGenerate}'),false); assert.equal(source.includes('onClick={() => handleGenerateGrokVideo()}'),false);
  const steps=declaration('steps').initializer.elements; assert.equal(steps.length,4);
  const details=find(node=>ts.isJsxElement(node)&&node.openingElement.tagName.getText(page)==='details'&&node.getText(page).includes('handleLoadViralTrack'));
  assert.ok(details); assert.equal(details.openingElement.attributes.properties.some(prop=>prop.name?.text==='open'),false);
});
