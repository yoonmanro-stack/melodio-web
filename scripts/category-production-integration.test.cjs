const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const stage = process.env.CATEGORY_PRODUCTION_STAGE_ROOT || path.resolve(__dirname, '..');
const categories = ['drama', 'relationship', 'human', 'trend', 'challenge', 'brand', 'history', 'parenting', 'food_diet', 'horror_mystery'];
const UUID = 'c4d4d1a3-a867-44a4-bfed-ead74f80501b';
function compile(relative) {
  return ts.transpileModule(fs.readFileSync(path.join(stage, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}
function evaluate(relative, overrides, env, fetchImpl) {
  const mod = { exports: {} };
  const silent = { info() {}, warn() {}, error() {}, log() {} };
  const localRequire = name => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === 'ffmpeg-static') return '/offline/unused-ffmpeg';
    if (name.startsWith('node:')) return require(name);
    if (['child_process', 'fs', 'path', 'os', 'util', 'crypto'].includes(name)) return require(name);
    throw Error(`UNSTUBBED_IMPORT:${name}`);
  };
  new Function('require', 'module', 'exports', 'process', 'fetch', 'console', compile(relative))(
    localRequire, mod, mod.exports, { env }, fetchImpl, silent,
  );
  return mod.exports;
}
const noNetwork = () => { throw Error('REAL_PROVIDER_ACCESS_FORBIDDEN'); };
const common = evaluate('src/lib/vle/conceptContextDirection.ts', {}, {}, noNetwork);
const quality = evaluate('src/lib/vle/categoryQualityDirection.ts', { './conceptContextDirection': common }, {}, noNetwork);
const action = evaluate('src/lib/vle/categoryObservableAction.ts', {}, {}, noNetwork);
const creative = evaluate('src/lib/vle/categoryCreativePlan.ts', { './categoryObservableAction': action }, {}, noNetwork);
function extractFunction(relative, name, dependencies = {}) {
  const file = ts.createSourceFile(relative, fs.readFileSync(path.join(stage, relative), 'utf8'), ts.ScriptTarget.ES2022, true);
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `actual ${relative}:${name} exists`);
  const code = ts.transpileModule(declaration.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${code}\nreturn ${name};`)(...Object.values(dependencies));
}
function snapshotInitializer() {
  const relative = 'src/app/(app)/viral/page.tsx';
  const file = ts.createSourceFile(relative, fs.readFileSync(path.join(stage, relative), 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'viralBriefSnapshot') initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(initializer);
  const code = ts.transpileModule(`const snapshot = ${initializer.getText(file)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('genCategory', 'producerBrief', 'customLyrics', 'optimizedPrompt', 'readCategoryBriefExtras', `${code}\nreturn snapshot;`);
}
function actualGenerationRejects() {
  const relative = 'src/app/api/generate/route.ts';
  const file = ts.createSourceFile(relative, fs.readFileSync(path.join(stage, relative), 'utf8'), ts.ScriptTarget.ES2022, true);
  let expression;
  function visit(node) {
    if (ts.isIfStatement(node)) {
      const source = node.expression.getText(file);
      if (/^viralBrief\s*&&/.test(source) && source.includes('viralBrief.lyrics') && source.includes('payload.lyricsPrompt')) expression = source;
    }
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(expression, 'actual generation brief predicate exists');
  const code = ts.transpileModule(`const rejected = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('viralBrief', 'payload', 'rawBody', `${code}\nreturn Boolean(rejected);`);
}
function approvedPlan() {
  return {
    opening2s: { startSeconds: 0, endSeconds: 2, action: '성인 여성이 푸른 가방을 들어 의자에 놓는다.' },
    watchReason: '새 부탁이 와도 주인공은 제시간에 나갈 수 있을까.',
    development: ['여성이 외투를 입고 사무실 문을 열어 본다.'],
    payoff: '동료가 서류를 건네자 여성이 가방을 내려놓고 다시 앉는다.',
    roles: [{ id: 'R1', role: '퇴근하려는 성인 여성 직장인', appearance: '짧은 검은 머리와 흰 셔츠를 입은 성인 여성', count: 1, visibility: 'on_screen' },
      { id: 'R2', role: '서류를 건네는 성인 동료', appearance: '짙은 남색 재킷을 입은 성인 남성', count: 1, visibility: 'off_screen' }],
  };
}
function approvedBrief(instrumental = false) {
  return { sourceTopic: '  원래 상황\n ', categoryId: 'human', title: '가방만 퇴근', hook: '가방만 퇴근',
    lyrics: '[Chorus]\n가방만 퇴근\n\n[Verse]\n서류를 또 받아\n\n[Chorus]\n가방도 출근',
    stylePrompt: instrumental ? 'original jazz, instrumental only, no vocals' : 'original jazz, clear Korean voice',
    creativePlan: approvedPlan(), isInstrumental: instrumental, lyricsPurpose: instrumental ? 'story-guide' : 'sung' };
}
async function boundedBody(response, limit) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw Error('BODY_LIMIT');
  if (!response.body) throw Error('NO_BODY');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const result = await reader.read(); if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw Error('BODY_LIMIT'); }
      chunks.push(Buffer.from(result.value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
class BriefError extends Error {
  constructor(message, code = 'CATEGORY_BRIEF_OUTPUT', status = 422) { super(message); this.code = code; this.status = status; }
}
class PetError extends Error {}
class ExportError extends Error {
  constructor(message, code = 'AUDIO_REQUIRED', status = 400) { super(message); this.code = code; this.status = status; }
}
function request(route, body, options = {}) {
  const url = `https://melodio.test/api/viral-cf/${route}`;
  const req = new Request(url, { method: 'POST', headers: {
    origin: 'https://melodio.test', 'content-type': 'application/json', ...options.headers,
  }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return Object.assign(req, { nextUrl: new URL(url) });
}
function fixture(route, options = {}) {
  const calls = { auth: 0, fresh: [], pet: [], provider: [] };
  const env = { OPENAI_API_KEY: 'offline-only-fixture', XAI_API_KEY: 'offline-only-fixture', XAI_API_BASE: 'https://api.x.ai/v1', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co' };
  const chain = { select() { return this; }, eq() { return this; }, order() { return this; }, async limit() { return { data: [], error: null }; } };
  const auth = { auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: UUID } }, error: options.authError || null }) }, from: () => chain };
  const common = {
    'next/server': { NextResponse: { json: (value, init = {}) => Response.json(value, init) } },
    '@/lib/supabase/server': { createClient: async () => { calls.auth++; return auth; } },
    '@/lib/video/petMedia': { readPetBoundedBody: boundedBody, assertPetMediaUrl: url => {
      if (typeof url !== 'string' || !url.startsWith('https://fixture.supabase.co/')) throw new ExportError('URL denied', 'MEDIA_HOST');
    } },
    '@/lib/vle/categoryQualityDirection': quality,
    '@/lib/vle/categoryCreativePlan': creative,
    '@/lib/vle/categoryBriefPlanner': {
      CATEGORY_BRIEF_CATEGORIES: categories, CategoryBriefPlannerError: BriefError,
      createCategoryBrief: async input => {
        calls.fresh.push(input); if (options.briefError) throw options.briefError;
        return { title: '새 출근 농담', hook: '나만 출근', lyrics: '[Chorus]\n나만 출근', stylePrompt: 'original funk',
          sourceTopic: input.topic || '', categoryId: input.category, source: 'fresh-ai-planner', specVersion: 'category-brief-v1' };
      },
    },
    '@/lib/vle/petPlanner': {
      PetPlannerError: PetError, PET_LYRIC_TOTAL_MIN: 42, PET_LYRIC_TOTAL_MAX: 78,
      petRecentFingerprints: () => [], petLyricsSyllables: () => 52,
      createPetEpisode: async input => { calls.pet.push(input); return { title: '반려동물의 새 일상', shots: [{ caption: '같은 이야기' }], lyrics: '자연스러운 새 가사', stylePrompt: 'playful original funk', sourceTopic: input.topic || '', models: [], version: 'pet-v3' }; },
    },
    '@/lib/vle/vleEngine': { loadVLEMasterPrompt: noNetwork },
    '@/lib/vle/viralCategoryMatrix': {
      getCategoryMatrix: category => ({ id: category, name: quality.getCategoryQualityDirection(category)?.labelKo || category,
        videoDirective: { supporting: 'authored cast', coreObject: 'authored prop', action: 'authored movement', cameraLighting: 'clear scene' } }),
      pickProtagonist: () => 'an original adult appropriate to the story', pickMemeToken: () => '새 농담',
      buildAudioStylePrompt: () => 'original music', getAudioSummaryKo: () => '새 음악',
    },
    '@/lib/vle/viralCategorySpec': { getCategorySpec: () => null },
    '@/lib/vle/trendFeed': { buildTrendDirective: () => '' },
    '@/lib/vle/viralSongSpec': {},
    '@/lib/video/fitVideoToAudio': {},
    '@/lib/video/legacyShortExport': { LEGACY_NO_TEXT_RULE: 'no generated text', LEGACY_SHORT_SECONDS: 30, LegacyShortExportError: ExportError },
  };
  const fetchImpl = async (url, init) => {
    calls.provider.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    if (options.providerResponse) return options.providerResponse();
    throw Error('OFFLINE_PROVIDER_MARKER');
  };
  return { api: evaluate(`src/app/api/viral-cf/${route}/route.ts`, common, env, fetchImpl), calls };
}
const fresh = { category: 'human', topic: '  퇴근하려는 직장인\n ', genreEn: 'acoustic jazz', vocalEn: 'warm female voice', moodEn: 'dry playful', seed: 5 };

test('fresh producer planning forwards exact topic and independent music overrides once, preserving the pet branch', async () => {
  const c = fixture('producer-brief');
  const response = await c.api.POST(request('producer-brief', fresh));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(c.calls.fresh, [fresh]); assert.equal(c.calls.pet.length, 0); assert.equal(c.calls.provider.length, 0);
  const result = await response.json(); assert.equal(result.brief.sourceTopic, fresh.topic); assert.equal(result.brief.source, 'fresh-ai-planner');
  const pet = fixture('producer-brief');
  const petInput = { category: 'pet', topic: '휴대폰을 들면 고양이가 고개를 돌린다.', genreEn: 'swing', vocalEn: 'natural adult', moodEn: 'playful', species: 'cat', pov: 'pet_inner_voice' };
  const petResponse = await pet.api.POST(request('producer-brief', petInput));
  assert.equal(petResponse.status, 200); assert.equal(pet.calls.fresh.length, 0); assert.equal(pet.calls.pet.length, 1);
  assert.equal(pet.calls.pet[0].topic, petInput.topic); assert.equal(pet.calls.pet[0].species, 'cat');
  assert.equal((await petResponse.json()).brief.specVersion, 'pet-v3'); assert.equal(pet.calls.provider.length, 0);
});

test('all paid gateways deny missing or failed authentication before any planner or provider work', async () => {
  const bodies = { 'producer-brief': fresh, 'grok-video/prompt': { category: 'human', topic: '새 일상' }, 'grok-video': { category: 'human', prompt: 'original scene', audioUrl: 'https://fixture.supabase.co/audio.mp3' } };
  for (const [route, body] of Object.entries(bodies)) for (const auth of [{ signedOut: true }, { authError: Error('expired offline auth') }]) {
    const c = fixture(route, auth); const response = await c.api.POST(request(route, body));
    assert.equal(response.status, 401, route); assert.equal(c.calls.fresh.length, 0); assert.equal(c.calls.pet.length, 0); assert.equal(c.calls.provider.length, 0);
  }
});

test('all paid gateways reject foreign origins, non-JSON, malformed shape and oversized actual UTF-8 bodies', async () => {
  for (const route of ['producer-brief', 'grok-video/prompt', 'grok-video']) {
    const valid = route === 'producer-brief' ? fresh : { category: 'human', topic: '새 일상', prompt: 'original scene', audioUrl: 'https://fixture.supabase.co/audio.mp3' };
    for (const [body, headers, status] of [
      [valid, { origin: 'https://outside.test' }, 403], [valid, { 'content-type': 'text/plain' }, 415],
      ['null', {}, 400], ['[]', {}, 400], ['{broken', {}, 400], [JSON.stringify({ category: 'human', topic: '가'.repeat(6000) }), {}, 400],
    ]) {
      const c = fixture(route); const response = await c.api.POST(request(route, body, { headers }));
      assert.equal(response.status, status, `${route} ${JSON.stringify(headers)}`);
      assert.equal(c.calls.fresh.length, 0); assert.equal(c.calls.pet.length, 0); assert.equal(c.calls.provider.length, 0);
    }
  }
});

test('unknown or inherited category values never reach templates, generic camera fallback or paid calls', async () => {
  for (const route of ['producer-brief', 'grok-video/prompt', 'grok-video']) for (const category of ['constructor', '__proto__', 'unknown']) {
    const c = fixture(route); const response = await c.api.POST(request(route, { category, topic: '새 일상', prompt: 'original scene', audioUrl: 'https://fixture.supabase.co/audio.mp3' }));
    assert.equal(response.status, 400, `${route}:${category}`); assert.equal(c.calls.fresh.length, 0); assert.equal(c.calls.pet.length, 0); assert.equal(c.calls.provider.length, 0);
  }
  const c = fixture('grok-video/prompt');
  const response = await c.api.POST(request('grok-video/prompt', '{"category":"human","topic":"새 일상","__proto__":"unexpected"}'));
  assert.equal(response.status, 400); assert.equal(c.calls.provider.length, 0);
});

test('fresh branch exposes typed safe failures and sanitizes unknown errors without fallback planning', async () => {
  for (const [error, expected] of [[new BriefError('기획을 확인해 주세요.', 'CATEGORY_BRIEF_OUTPUT', 422), 422], [Error('OFFLINE_PRIVATE_MARKER'), 500]]) {
    const c = fixture('producer-brief', { briefError: error });
    const response = await c.api.POST(request('producer-brief', fresh));
    assert.equal(response.status, expected); assert.doesNotMatch(JSON.stringify(await response.json()), /OFFLINE_PRIVATE_MARKER/);
    assert.equal(c.calls.fresh.length, 1); assert.equal(c.calls.pet.length, 0); assert.equal(c.calls.provider.length, 0);
  }
});

test('visual prompt compilation uses the completed song and category rules, with one mocked bounded provider call', async () => {
  const content = 'One original adult woman in a stable contemporary room performs the authored movement with a clear causal reveal and a resolved reaction. '.repeat(8);
  const c = fixture('grok-video/prompt', { providerResponse: () => Response.json({ choices: [{ finish_reason: 'stop', message: { content, refusal: null } }] }) });
  const response = await c.api.POST(request('grok-video/prompt', { category: 'horror_mystery', title: '잠들기 전의 민망함', topic: '잠들려다 옛 실수가 떠올라 이불을 덮는다.', lyrics: '옛 인사만 떠올라', genre: 'quiet piano' }));
  assert.equal(response.status, 200); assert.equal(c.calls.provider.length, 1);
  const body = c.calls.provider[0].body; assert.match(body.messages[0].content, /recognizable embarrassment/);
  assert.match(body.messages[0].content, /Frame the cause and response/);
  assert.match(body.messages[1].content, /옛 인사만 떠올라/); assert.match(body.messages[1].content, /잠들려다 옛 실수/);
  assert.equal((await response.json()).prompt, content.trim());
});

test('generic video uses category camera rules and hides mocked provider bodies from the client', async () => {
  const c = fixture('grok-video', { providerResponse: () => new Response('OFFLINE_PRIVATE_PROVIDER_BODY', { status: 429 }) });
  const response = await c.api.POST(request('grok-video', { category: 'human', prompt: 'One original worker places a bag beside her desk and visibly reacts to the same new task.', audioUrl: 'https://fixture.supabase.co/audio.mp3', generate30SecFull: true }));
  assert.equal(response.status, 500); assert.doesNotMatch(JSON.stringify(await response.json()), /OFFLINE_PRIVATE_PROVIDER_BODY/);
  assert.equal(c.calls.provider.length, 2, 'existing legacy parallel clips remain explicit; every transport is mocked');
  for (const call of c.calls.provider) {
    assert.match(call.body.prompt, /stable medium|Stable medium/);
    assert.doesNotMatch(call.body.prompt, /0\.5x ultra-wide fisheye|RAPID WHIP-PAN AND CRASH-ZOOM|NEW CAMERA ANGLE EVERY/);
  }
});

test('actual generation snapshot parser preserves canonical plan, exact topic and music mode for persistence', () => {
  const parse = extractFunction('src/app/api/generate/route.ts', 'readViralBriefSnapshot', { readCategoryBriefExtras: creative.readCategoryBriefExtras });
  for (const instrumental of [false, true]) {
    const original = approvedBrief(instrumental), before = structuredClone(original), saved = parse(original);
    assert.ok(saved); assert.deepEqual(original, before);
    assert.deepEqual(saved.creativePlan, original.creativePlan);
    assert.notEqual(saved.creativePlan, original.creativePlan, 'persist a canonical copy');
    assert.equal(saved.sourceTopic, original.sourceTopic); assert.equal(saved.isInstrumental, instrumental);
    assert.equal(saved.lyricsPurpose, instrumental ? 'story-guide' : 'sung');
    const persisted = JSON.parse(JSON.stringify({ viralBrief: saved })).viralBrief;
    assert.deepEqual(persisted.creativePlan.roles, original.creativePlan.roles);
  }
  const legacy = approvedBrief(); delete legacy.creativePlan; delete legacy.isInstrumental; delete legacy.lyricsPurpose;
  assert.deepEqual(parse(legacy), legacy, 'legacy saved snapshots remain compatible');
});

test('actual snapshot parser rejects malformed extras before they can become generation metadata', () => {
  const parse = extractFunction('src/app/api/generate/route.ts', 'readViralBriefSnapshot', { readCategoryBriefExtras: creative.readCategoryBriefExtras });
  const changes = [brief => { brief.isInstrumental = 'true'; }, brief => { brief.isInstrumental = true; },
    brief => { brief.lyricsPurpose = 'provider-instructions'; }, brief => { brief.creativePlan.roles[0].count = 7; },
    brief => { brief.creativePlan.roles[0].count = 6; brief.creativePlan.roles[1].count = 1; },
    brief => { brief.creativePlan.roles[1].id = 'R1'; }, brief => { brief.creativePlan.opening2s.endSeconds = 3; },
    brief => { brief.creativePlan.watchReason = 'base64 encoded payload'; }, brief => { brief.creativePlan.roles = []; },
    brief => { brief.creativePlan.extra = 'unreviewed'; }];
  for (const mutate of changes) { const brief = approvedBrief(); mutate(brief); assert.equal(parse(brief), null); }
});

test('actual generation predicate separates instrumental guide from provider lyrics and checks vocal changed reprise exactly', () => {
  const rejects = actualGenerationRejects();
  const raw = { sourceMenu: 'viral', presetId: 'human' };
  const instrumental = approvedBrief(true), vocal = approvedBrief(false);
  assert.equal(rejects(instrumental, { isInstrumental: true, lyricsPrompt: '', stylePrompt: instrumental.stylePrompt }, raw), false);
  assert.equal(rejects(instrumental, { isInstrumental: true, lyricsPrompt: instrumental.lyrics, stylePrompt: instrumental.stylePrompt }, raw), true);
  assert.equal(rejects(vocal, { isInstrumental: false, lyricsPrompt: vocal.lyrics, stylePrompt: vocal.stylePrompt }, raw), false);
  assert.equal(rejects(vocal, { isInstrumental: false, lyricsPrompt: vocal.lyrics.replace('가방도 출근', '가방만 퇴근'), stylePrompt: vocal.stylePrompt }, raw), true);
  assert.equal(rejects(vocal, { isInstrumental: true, lyricsPrompt: '', stylePrompt: vocal.stylePrompt }, raw), true);
  assert.equal(rejects(vocal, { isInstrumental: false, lyricsPrompt: vocal.lyrics, stylePrompt: vocal.stylePrompt }, { sourceMenu: 'viral', presetId: 'relationship' }), true);
});

test('actual UI snapshot construction and saved-track reader retain reviewed extras for both music modes', () => {
  const build = snapshotInitializer();
  const read = extractFunction('src/app/(app)/viral/page.tsx', 'readViralBrief', { readCategoryBriefExtras: creative.readCategoryBriefExtras });
  for (const instrumental of [false, true]) {
    const brief = approvedBrief(instrumental);
    const built = build('human', brief, brief.lyrics, brief.stylePrompt, creative.readCategoryBriefExtras);
    assert.equal(built.isInstrumental, instrumental); assert.deepEqual(built.creativePlan, brief.creativePlan);
    const reread = read({ license_hash: JSON.stringify({ viralBrief: built }) });
    assert.equal(reread.lyricsPurpose, instrumental ? 'story-guide' : 'sung'); assert.deepEqual(reread.creativePlan.roles, brief.creativePlan.roles);
  }
});

test('visual compiler receives exact approved cast and does not contradict it with random mandatory styling', async () => {
  const content = 'One original adult woman keeps her short black hair and white shirt while moving the established blue bag. '.repeat(10);
  const plan = approvedPlan();
  const c = fixture('grok-video/prompt', { providerResponse: () => Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] }) });
  const response = await c.api.POST(request('grok-video/prompt', { category: 'human', title: '가방만 퇴근', topic: '퇴근하려는 직장인의 새 일상', lyrics: '가방만 먼저 퇴근', creativePlan: plan }));
  assert.equal(response.status, 200); assert.equal(c.calls.provider.length, 1);
  const system = c.calls.provider[0].body.messages[0].content;
  assert.match(system, /APPROVED COMPLETE PRODUCTION CONTRACT/);
  assert.ok(system.includes(plan.roles[0].appearance)); assert.ok(system.includes(plan.roles[1].appearance));
  assert.match(system, /off_screen roles must not be added/);
  assert.doesNotMatch(system, /THIS RENDER'S MANDATORY VARIATION/);
  const malformed = fixture('grok-video/prompt');
  const badPlan = approvedPlan(); badPlan.roles[1].id = 'R1';
  const denied = await malformed.api.POST(request('grok-video/prompt', { category: 'human', topic: '새 일상', creativePlan: badPlan }));
  assert.equal(denied.status, 400); assert.equal(malformed.calls.provider.length, 0);
});

function freshProductionPlan() {
  return { ...approvedPlan(), sceneContext: { place: '직원이 손님을 맞는 실제 카페', ongoingActivity: '여성이 주문을 마치고 자리에 가려 한다.', immediateTrigger: '동료가 같은 자리로 가려는 모습을 본다.', settingEvidence: '주문을 받는 직원과 손님 동선으로 공용 영업 공간이 보인다.' },
    wardrobes: [{ roleId: 'R1', clothing: '카페 외출에 맞는 단정한 재킷과 바지', footwear: '재킷과 어울리는 편한 낮은 구두' }, { roleId: 'R2', clothing: '외출용 남색 재킷과 바지', footwear: '남색 재킷과 맞는 단정한 신발' }],
    music: { genreEn: 'playful funk', vocalEn: 'natural Korean adult voice', moodEn: 'wry anticipation', styleEn: 'clipped bass with a brief piano answer', rationale: '같은 자리로 향하는 몸의 반응을 리듬으로 드러낸다.', targetBpm: 116, isInstrumental: false } };
}

test('visual compilation receives the entire saved context and role-bound clothing and footwear', async () => {
  const plan = freshProductionPlan(), content = 'Preserve the selected commercial cafe setting and the exact original actors, clothing and shoes while showing the same authored action and outcome. '.repeat(8);
  const c = fixture('grok-video/prompt', { providerResponse: () => Response.json({ choices: [{ finish_reason: 'stop', message: { content, refusal: null } }] }) });
  const response = await c.api.POST(request('grok-video/prompt', { category: 'human', title: '같은 자리', topic: '카페에서 벌어진 같은 상황', lyrics: '같은 자리로 향해', creativePlan: plan }));
  assert.equal(response.status, 200); assert.equal(c.calls.provider.length, 1);
  const system = c.calls.provider[0].body.messages[0].content;
  assert.ok(system.includes(JSON.stringify(plan))); assert.match(system, /Do not re-invent the setting/);
  assert.match(system, /Every wardrobe entry remains bound to its roleId/); assert.match(system, /Music is already selected and remains unchanged/);
});
