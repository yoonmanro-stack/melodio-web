const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const baseline = process.env.CATEGORY_BRIEF_BASELINE_ROOT || root;
const authored = new Set(['src/lib/vle/categoryBriefPlanner.ts', 'src/lib/vle/categoryQualityDirection.ts', 'src/lib/vle/categoryCreativePlan.ts', 'src/lib/vle/categoryObservableAction.ts', 'src/lib/vle/conceptContextDirection.ts']);
const cache = new Map();
const failureLogs = [];
const fixtureConsole = { warn: (...args) => failureLogs.push(args), info() {}, log() {}, error() {} };
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const filename = path.join(authored.has(relative) ? root : baseline, relative);
  const mod = { exports: {} }; cache.set(relative, mod);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = name => {
    if (name === '@/lib/lyrics/compile-sections') return load('src/lib/lyrics/compile-sections.ts');
    if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
    if (name.startsWith('.')) {
      const next = path.relative(baseline, path.resolve(path.dirname(path.join(baseline, relative)), name));
      if (authored.has(`${next}.ts`) || fs.existsSync(path.join(baseline, `${next}.ts`))) return load(`${next}.ts`);
      return require(path.join(baseline, next));
    }
    return require(name);
  };
  const denied = () => { throw Error('REAL_PROVIDER_ACCESS_FORBIDDEN'); };
  new Function('require', 'module', 'exports', 'process', 'fetch', 'console', compiled)(localRequire, mod, mod.exports,
    { env: { OPENAI_API_KEY: 'offline-contract-fixture' } }, denied, fixtureConsole);
  return mod.exports;
}
const api = load('src/lib/vle/categoryBriefPlanner.ts');
const { createCategoryBrief: create, CategoryBriefPlannerError, CATEGORY_BRIEF_MODEL: MODEL } = api;
const { validateCategoryCreativePlan, validateFreshCategoryCreativePlan } = load('src/lib/vle/categoryCreativePlan.ts');
const categories = ['drama', 'relationship', 'human', 'trend', 'challenge', 'brand', 'history', 'parenting', 'food_diet', 'horror_mystery'];
const structure = {
  memoryAnchor: '나만 출근', twist: '월급은 휴가 중이고 커피마저 먼저 퇴근한다.',
  hook: ['나만 출근', '나만 출근', '월급은 휴가', '나만 또 출근'],
  verse: ['알람은 먼저 도망가', '지하철 문이 날 삼켜', '커피도 벌써 퇴근해'],
  finalPunch: '월급만 출근', tagOutro: '너도 오늘 출근해?',
};
function draft(category = 'human') {
  return { categoryId: category, title: '나만 출근 커피도 퇴근', creativePlan: {
    opening2s: { startSeconds: 0, endSeconds: 2, action: '성인 여성이 가방을 메고 사무실 문을 연다.' },
    watchReason: '오늘도 커피 한 잔으로 먼저 온 일을 버틸 수 있을까.',
    development: ['여성이 커피잔을 들어 마시려다 빈 잔을 내려놓는다.', '동료가 자기 잔을 집어 들고 먼저 문을 열어 나간다.'],
    payoff: '여성이 빈 잔을 들어 보며 자기 가방만 의자에 다시 놓는다.',
    roles: [{ id: 'R1', role: '먼저 출근한 성인 여성 직장인', appearance: '짧은 검은 머리와 흰 셔츠를 입은 성인 여성', count: 1, visibility: 'on_screen' },
      { id: 'R2', role: '잠시 들른 성인 동료', appearance: '갈색 재킷을 입은 성인 남성', count: 1, visibility: 'on_screen' }],
    sceneContext: { place: '동료가 잠시 들르는 실제 사무실', ongoingActivity: '먼저 출근한 여성이 일을 시작하려고 커피잔을 든다.', immediateTrigger: '커피를 마시려는 순간 빈 잔이 손에 잡힌다.', settingEvidence: '업무를 준비하는 직원과 동료의 출입으로 공용 업무 공간임이 보인다.' },
    wardrobes: [{ roleId: 'R1', clothing: '활동하기 편한 흰 셔츠와 깔끔한 슬랙스', footwear: '출근 복장과 맞는 단정한 낮은 구두' }, { roleId: 'R2', clothing: '사무실에 맞는 갈색 재킷과 긴 바지', footwear: '재킷에 맞는 단정한 업무용 신발' }],
    music: { genreEn: 'dry office funk', vocalEn: 'one expressive adult Korean female voice', moodEn: 'wry everyday tension', styleEn: 'muted bass and clipped piano answer the empty-cup reveal', rationale: '빈 잔을 확인하는 짧은 정지와 속마음을 또렷하게 들려준다.', targetBpm: 118, isInstrumental: false },
  }, lyricsStructure: structuredClone(structure) };
}
function envelope(value = draft(), overrides = {}) {
  return { model: MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value), refusal: null } }],
    usage: { prompt_tokens: 1000, completion_tokens: 700 }, ...overrides };
}
const correctionEnvelope = (value, overrides = {}) => envelope({ title: value.title, lyricsStructure: value.lyricsStructure }, overrides);

function historyDraft() {
  const value = draft('history');
  value.title = '나랏말싸미 창구 앞에서';
  value.creativePlan.opening2s.action = '세종이 현대 창구 앞에서 서류를 펼친다.';
  value.creativePlan.watchReason = '왕의 말보다 서류가 먼저인 창구에서 세종은 접수를 마칠 수 있을까.';
  value.creativePlan.development = ['직원이 접수 서류를 세종에게 건넨다.', '세종이 붓을 내려놓고 현대식 펜을 집어 든다.'];
  value.creativePlan.payoff = '세종이 도장을 찍고 접수 서류를 직원에게 건넨다.';
  value.creativePlan.roles[0] = { id: 'R1', role: '현대 창구를 찾은 세종', appearance: '조선 시대 왕의 복식을 입은 성인 남성 세종', count: 1, visibility: 'on_screen' };
  value.creativePlan.roles[1].role = '창구에서 서류를 확인하는 현대 직원';
  value.creativePlan.sceneContext = { place: '직원이 민원 서류를 접수하는 현대 창구', ongoingActivity: '세종이 접수를 위해 서류를 준비하고 있다.', immediateTrigger: '직원이 서류의 비어 있는 서명란을 가리킨다.', settingEvidence: '직원과 방문자가 창구를 사이에 두고 서류를 주고받는 공용 업무 공간이다.' };
  value.creativePlan.wardrobes[0] = { roleId: 'R1', clothing: '세종의 시대와 신분에 맞는 왕의 복식', footwear: '왕의 복식과 맞는 전통 신발' };
  value.creativePlan.wardrobes[1] = { roleId: 'R2', clothing: '창구 직원의 근무용 셔츠와 긴 바지', footwear: '근무 복장과 맞는 단정한 신발' };
  value.lyricsStructure = { memoryAnchor: '나랏말싸미', twist: '세종도 현대 창구에서는 도장을 찍어야 한다.',
    hook: ['나랏말싸미', '나랏말싸미', '말보다 서류', '도장만 찍어'],
    verse: ['백성 대신 창구 줄', '붓 대신 펜을 잡아', '서류가 먼저 말해'], finalPunch: '도장이 임금', tagOutro: '도장 찍고 가시오' };
  return value;
}

test('fresh and persisted history plans accept the same observable Korean action inflections', () => {
  const actions = ['세종이 정중히 절한다.', '세종이 큰절을 한다.', '세종이 공손하게 인사한다.', '장수가 거수경례를 한다.',
    '장수가 목례한다.', '세종이 양팔을 흔든다.', '장수가 상체를 숙인다.', '장수가 허리를 굽힌다.',
    '장수가 책상을 두드린다.', '장수가 두 손을 펼친다.', '세종이 두 손을 모은다.', '장수가 고개를 끄덕인다.',
    '세종이 글씨를 쓴다.', '세종이 종이에 한글을 적는다.', '신사임당이 붓으로 그림을 그린다.',
    '세종이 종이에 메모한다.', '세종이 서류에 서명한다.', '세종이 서신을 쓴다.',
    '이순신이 마당에서 뛰거나 달린다.', '이순신이 마당에서 뛴다.', '왕이 어깨를 움직이며 춤춘다.', '왕이 마당에서 춤을 춘다.'];
  for (const action of actions) for (const position of ['opening', 'development', 'payoff']) {
    const value = historyDraft();
    if (position === 'opening') value.creativePlan.opening2s.action = action;
    else if (position === 'development') value.creativePlan.development[0] = action;
    else value.creativePlan.payoff = action;
    const fresh = api.validateCategoryBriefDraft(value, 'history');
    assert.deepEqual(validateCategoryCreativePlan(value.creativePlan), fresh.creativePlan, `${position}: ${action}`);
    assert.deepEqual(validateFreshCategoryCreativePlan(value.creativePlan), fresh.creativePlan, `${position}: ${action}`);
  }
});

test('both history validators reject purely abstract wishes, feelings and thoughts', () => {
  for (const action of ['세종이 행복한 사람이 된다.', '장수가 승리를 원한다.', '세종이 평화를 바란다.', '장수가 옛일을 생각한다.',
    '장수가 좌절한다.', '장수가 마음을 쓴다.', '신사임당이 마음을 그린다.', '세종이 꿈을 그린다.', '장수가 마음에 메모한다.']) {
    const value = historyDraft(); value.creativePlan.opening2s.action = action;
    assert.throws(() => api.validateCategoryBriefDraft(value, 'history'), { code: 'CATEGORY_BRIEF_ACTION' });
    assert.throws(() => validateCategoryCreativePlan(value.creativePlan), { code: 'CATEGORY_CREATIVE_PLAN' });
  }
});
function fixture(responseFactory = () => Response.json(envelope())) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer offline-contract-fixture');
    return responseFactory();
  } };
}
const input = { category: 'human', topic: '출근한 직장인과 먼저 퇴근하는 커피의 작은 농담' };
const options = c => ({ fetchImpl: c.fetchImpl, apiKey: 'offline-contract-fixture' });

test('one strict request preserves topic and all music overrides and returns the existing brief shape', async () => {
  const c = fixture();
  const result = await create({ ...input, genreEn: 'acoustic jazz', vocalEn: 'warm female voice', moodEn: 'dry playful tension', seed: 77 }, options(c));
  assert.equal(c.calls.length, 1);
  const { body, init } = c.calls[0];
  assert.equal(body.model, MODEL); assert.equal(body.store, false); assert.equal(body.reasoning_effort, 'high');
  assert.equal(body.max_completion_tokens, 16384); assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true); assert.equal(init.redirect, 'error');
  assert.ok(init.signal instanceof AbortSignal);
  const supplied = JSON.parse(body.messages[1].content);
  assert.equal(supplied.sourceTopic, input.topic);
  assert.deepEqual(supplied.musicOverrides, { genreEn: 'acoustic jazz', vocalEn: 'warm female voice', moodEn: 'dry playful tension', isInstrumental: false });
  assert.match(body.messages[0].content, /새 기획|NEW complete Korean/);
  assert.match(body.messages[0].content, /Existing|existing completed song/);
  assert.doesNotMatch(result.stylePrompt, /dry office funk/); assert.match(result.stylePrompt, /acoustic jazz/); assert.match(result.stylePrompt, /warm female voice/); assert.match(result.stylePrompt, /dry playful tension/);
  assert.equal(result.sourceTopic, input.topic); assert.equal(result.categoryId, 'human');
  assert.equal(result.specVersion, 'category-brief-v1'); assert.equal(result.source, 'fresh-ai-planner');
  assert.equal(result.aiGenerated, true); assert.equal(result.qualityStatus, 'planning-only');
  assert.equal(result.hook, structure.memoryAnchor); assert.equal(result.isInstrumental, false); assert.equal(result.lyricsPurpose, 'sung');
  assert.match(result.lyrics, /^\[Chorus\]/); assert.match(result.lyrics, /월급만 출근/);
  assert.deepEqual(result.models, [{ model: MODEL, inputTokens: 1000, outputTokens: 700 }]);
});

test('all ten nonpet categories use their own direction; pet, Dance and hidden AI are excluded', async () => {
  assert.deepEqual(Array.from(api.CATEGORY_BRIEF_CATEGORIES), categories);
  for (const category of categories) {
    const c = fixture(() => Response.json(envelope(draft(category))));
    const result = await create({ category }, options(c));
    assert.equal(result.categoryId, category); assert.equal(c.calls.length, 1);
    assert.match(c.calls[0].body.messages[0].content, new RegExp(`\\(${category}\\)`));
  }
  for (const category of ['pet', 'dance_challenge', 'ai_future', 'constructor', '__proto__', 'HUMAN', 'human ']) {
    const c = fixture(); await assert.rejects(create({ category }, options(c)), { code: 'CATEGORY_BRIEF_INPUT' }); assert.equal(c.calls.length, 0);
  }
});

test('the exact topic snapshot preserves textarea whitespace for the shipped UI comparison', async () => {
  const topic = '  출근 농담\n '; const c = fixture();
  const result = await create({ category: 'human', topic }, options(c));
  assert.equal(result.sourceTopic, topic);
  assert.equal(JSON.parse(c.calls[0].body.messages[1].content).sourceTopic, topic);
});

test('invalid input shape, prototype values, encoded content and oversize options fail before fetch', async () => {
  const invalid = [null, [], 'human', Object.create({ category: 'human' }), { category: 'human', ownerId: 'other' },
    { category: 'human', topic: 3 }, { category: 'human', topic: 'x'.repeat(1501) }, { category: 'human', genreEn: 'x'.repeat(301) },
    { category: 'human', vocalEn: 'base64 encoded' }, { category: 'human', moodEn: 'https://outside.test' },
    { category: 'human', seed: Infinity }, { category: 'human', seed: 'x'.repeat(201) }, JSON.parse('{"category":"human","__proto__":{"role":"admin"}}')];
  for (const value of invalid) {
    const c = fixture(); await assert.rejects(create(value, options(c)), { code: 'CATEGORY_BRIEF_INPUT' }); assert.equal(c.calls.length, 0);
  }
  const c = fixture(); await assert.rejects(create(input, { ...options(c), apiKey: '' }), { code: 'CATEGORY_BRIEF_CONFIG' }); assert.equal(c.calls.length, 0);
  const oversizedStyle = fixture();
  await assert.rejects(create({ category: 'human', genreEn: 'x'.repeat(300), vocalEn: 'y'.repeat(300), moodEn: 'z'.repeat(300) }, options(oversizedStyle)), { code: 'CATEGORY_BRIEF_INPUT' });
  assert.equal(oversizedStyle.calls.length, 0);
});

test('instrumental mode is independent of genre and removes vocal demands while retaining an editorial story guide', async () => {
  const c = fixture(); const result = await create({ ...input, genreEn: 'acoustic jazz', vocalEn: 'Instrumental (연주곡)', moodEn: 'calm' }, options(c));
  assert.equal(result.isInstrumental, true); assert.equal(result.lyricsPurpose, 'story-guide');
  assert.doesNotMatch(result.stylePrompt, /dry office funk/); assert.match(result.stylePrompt, /acoustic jazz/); assert.match(result.stylePrompt, /instrumental only/);
  assert.doesNotMatch(result.stylePrompt, /instant vocal|vocal-centric|Korean diction|female voice/);
  assert.equal(JSON.parse(c.calls[0].body.messages[1].content).musicOverrides.isInstrumental, true);
  const voice = fixture(); const vocalResult = await create({ ...input, genreEn: 'instrumental jazz arrangement', vocalEn: 'female voice' }, options(voice));
  assert.equal(vocalResult.isInstrumental, false); assert.match(vocalResult.stylePrompt, /female voice/);
  const backing = fixture(); const backingResult = await create({ ...input, vocalEn: 'warm female vocals over instrumental backing' }, options(backing));
  assert.equal(backingResult.isInstrumental, false); assert.match(backingResult.stylePrompt, /warm female vocals/);
  const sentinel = fixture(); const sentinelResult = await create({ ...input, vocalEn: 'Instrumental, No Vocals' }, options(sentinel));
  assert.equal(sentinelResult.isInstrumental, true);
});

test('an explicit genre avoidance does not remove independently selected voice and mood', async () => {
  const c = fixture(); const result = await create({ ...input, genreEn: 'acoustic jazz, avoid: trap', vocalEn: 'warm female voice', moodEn: 'dry playful tension' }, options(c));
  assert.match(result.stylePrompt, /acoustic jazz, avoid: trap/);
  assert.match(result.stylePrompt, /warm female voice/); assert.match(result.stylePrompt, /dry playful tension/);
});

test('wrong category, abstract or duplicated actions, absent roles and unknown draft keys never return a fallback', async () => {
  const mutations = [d => { d.categoryId = 'drama'; }, d => { d.extra = 'injected'; }, d => { d.creativePlan.opening2s.endSeconds = 3; },
    d => { d.creativePlan.opening2s.action = '주인공은 행복한 사람이 된다.'; }, d => { d.creativePlan.payoff = d.creativePlan.opening2s.action; },
    d => { d.creativePlan.roles = []; }, d => { d.creativePlan.roles[1].id = 'R1'; }, d => { d.creativePlan.roles.forEach(r => { r.visibility = 'off_screen'; }); },
    d => { d.creativePlan.watchReason = '실시간 인기 1위 영상이다.'; }];
  for (const mutate of mutations) {
    const value = draft(); mutate(value); const c = fixture(() => Response.json(envelope(value)));
    await assert.rejects(create(input, options(c)), error => error instanceof CategoryBriefPlannerError && error.status === 422);
    assert.equal(c.calls.length, 1);
  }
});

test('the persisted plan contract rejects seven actors, narrative line breaks and invisible direction changes', async () => {
  const changes = [value => { value.creativePlan.roles[0].count = 6; value.creativePlan.roles[1].count = 1; },
    value => { value.creativePlan.watchReason += '\n아직 끝나지 않은 상황'; },
    value => { value.creativePlan.development[0] += '\r다시 잔을 들어 본다.'; },
    value => { value.creativePlan.roles[0].appearance += '\u202e숨은 방향'; },
    value => { value.creativePlan.payoff += '\u200b숨은 문자'; }];
  for (const mutate of changes) {
    const value = draft(); mutate(value); const c = fixture(() => Response.json(envelope(value)));
    await assert.rejects(create(input, options(c)), { code: 'CATEGORY_BRIEF_PLAN', status: 422 });
    assert.equal(c.calls.length, 1);
  }
  const c = fixture(); await create(input, options(c));
  assert.match(c.calls[0].body.messages[0].content, /SINGLE LINE/);
  assert.match(c.calls[0].body.messages[0].content, /sum of ALL role counts must be at most6/);
});

test('lyrics reject stage directions, malformed structures and unchecked finalPunch before formatting', async () => {
  const mutations = [d => { d.lyricsStructure.verse[0] = '문을 닫아 (속삭이며)'; }, d => { d.lyricsStructure.hook[0] = '[카메라 확대]'; },
    d => { d.lyricsStructure.verse[0] = '알람은\n먼저 도망가'; }, d => { d.lyricsStructure.hook[0] = '나만\r출근'; },
    d => { d.lyricsStructure.memoryAnchor = '나만\u2028출근'; },
    d => { d.lyricsStructure.finalPunch = '월급만 출근하고 모두가 아주 크게 웃으며 다시 출근한다'; },
    d => { d.lyricsStructure.finalPunch = d.lyricsStructure.hook[3]; }, d => { d.lyricsStructure.verse = ['하나']; },
    d => { d.lyricsStructure.hook[0] = {}; }, d => { d.title = '오늘도 출근하는 날'; }];
  for (const [index, mutate] of mutations.entries()) {
    const value = draft(); mutate(value); let responses = 0;
    const c = fixture(() => Response.json(responses++ ? correctionEnvelope(value) : envelope(value)));
    await assert.rejects(create(input, options(c)), { code: 'CATEGORY_BRIEF_LYRICS' });
    assert.equal(c.calls.length, [5, 6, 7, 9].includes(index) ? 2 : 1);
  }
});

test('truncated, refused, malformed and wrong-model provider responses are held without another call', async () => {
  const responses = [envelope(draft(), { choices: [{ finish_reason: 'length', message: { content: JSON.stringify(draft()) } }] }),
    envelope(draft(), { choices: [{ finish_reason: 'stop', message: { refusal: 'private-provider-marker', content: '{}' } }] }),
    envelope(draft(), { model: 'other-model' }), envelope(draft(), { usage: undefined }),
    envelope(draft(), { choices: [{ finish_reason: 'stop', message: { content: '{broken-json' } }] })];
  for (const value of responses) {
    const c = fixture(() => Response.json(value));
    await assert.rejects(create(input, options(c)), error => !error.message.includes('private-provider-marker'));
    assert.equal(c.calls.length, 1);
  }
});

test('actual reprise syllables are checked after replacing the hook ending, closing the shipped punch-count gap', async () => {
  const value = draft();
  value.lyricsStructure = { memoryAnchor: '나만 출근', twist: '가방만 먼저 출근하고 월급을 기다린다.',
    hook: ['나만 출근', '나만 출근', '월급은 휴가', '가방만 출근해'],
    verse: ['문을 다시 열어', '가방을 또 메고', '커피잔을 들어'], finalPunch: '월급 출근', tagOutro: '너도 출근해라' };
  const shared = load('src/lib/vle/viralSongSpec.ts').validateStructure(value.lyricsStructure);
  assert.equal(shared.ok, true); assert.equal(shared.sungSyllables, 62);
  let responses = 0;
  const c = fixture(() => Response.json(responses++ ? correctionEnvelope(value) : envelope(value)));
  await assert.rejects(create(input, options(c)), { code: 'CATEGORY_BRIEF_LYRICS' });
  assert.equal(c.calls.length, 2);
});

test('a valid rendered reprise is accepted when the shared nominal hook count is one syllable too high', async () => {
  const value = draft();
  value.lyricsStructure.hook = ['나만 출근해', '나만 출근해', '월급은 휴가야', '나만 또 출근해'];
  value.lyricsStructure.tagOutro = '오늘도 출근';
  const helpers = load('src/lib/vle/viralSongSpec.ts');
  assert.equal(helpers.validateStructure(value.lyricsStructure).sungSyllables, 73);
  assert.equal(helpers.countSyllables(helpers.formatLyricsToSuno(value.lyricsStructure).replace(/\[[^\]]*\]/g, '')), 72);
  const c = fixture(() => Response.json(envelope(value)));
  const result = await create(input, options(c));
  assert.equal(result.lyricsStructure.finalPunch, '월급만 출근'); assert.equal(c.calls.length, 1);
});

test('provider errors and transport ambiguity expose safe codes and never raw bodies, URLs or credentials', async () => {
  const c = fixture(() => new Response('private-provider-marker offline-secret https://private.test', { status: 429 }));
  await assert.rejects(create(input, options(c)), error => error.code === 'CATEGORY_BRIEF_PROVIDER' && !/private-provider|secret|https/.test(error.message));
  assert.equal(c.calls.length, 1);
  let calls = 0;
  await assert.rejects(create(input, { apiKey: 'offline-contract-fixture', fetchImpl: async () => { calls++; throw Error('offline-secret private-provider-marker'); } }),
    error => error.code === 'CATEGORY_BRIEF_TRANSPORT' && !/offline-secret|private-provider/.test(error.message));
  assert.equal(calls, 1);
});

test('failure diagnostics contain only safe code, category and elapsed time and successful calls stay quiet', async () => {
  const before = failureLogs.length;
  const success = fixture(); await create(input, options(success));
  assert.equal(failureLogs.length, before);
  const failed = fixture(() => new Response('PRIVATE_PROVIDER_MARKER', { status: 429 }));
  await assert.rejects(create({ category: 'history', topic: 'PRIVATE_TOPIC_MARKER' }, options(failed)), { code: 'CATEGORY_BRIEF_PROVIDER' });
  assert.equal(failed.calls.length, 1); assert.equal(failureLogs.length, before + 1);
  const [label, details] = failureLogs[before];
  assert.equal(label, '[category-brief:failed]');
  assert.deepEqual(Object.keys(details).sort(), ['category', 'code', 'elapsedMs']);
  assert.equal(details.code, 'CATEGORY_BRIEF_PROVIDER'); assert.equal(details.category, 'history');
  assert.ok(Number.isInteger(details.elapsedMs) && details.elapsedMs >= 0);
  assert.doesNotMatch(JSON.stringify(failureLogs[before]), /PRIVATE_|offline-contract-fixture|https?:\/\//);
});

test('one request can use a 240-second deadline within the 300-second route budget, with no unbounded override', async () => {
  assert.equal(api.CATEGORY_BRIEF_TIMEOUT_MS, 240_000);
  assert.ok(api.CATEGORY_BRIEF_TIMEOUT_MS < 300_000);
  for (const timeoutMs of [90_001, 240_000]) {
    const c = fixture(); await create(input, { ...options(c), timeoutMs }); assert.equal(c.calls.length, 1);
  }
  for (const timeoutMs of [99, 240_001, Infinity, NaN, 100.5]) {
    const c = fixture(); await assert.rejects(create(input, { ...options(c), timeoutMs }), { code: 'CATEGORY_BRIEF_CONFIG' });
    assert.equal(c.calls.length, 0);
  }
});

test('both declared and streamed provider bytes are bounded before parsing or returning content', async () => {
  const declared = fixture(() => new Response('bounded', { headers: { 'content-length': String(api.CATEGORY_BRIEF_RESPONSE_BYTES + 1) } }));
  await assert.rejects(create(input, options(declared)), { code: 'CATEGORY_BRIEF_RESPONSE' }); assert.equal(declared.calls.length, 1);
  let cancelled = false;
  const streamed = fixture(() => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(48 * 1024)); }, cancel() { cancelled = true; },
  })));
  await assert.rejects(create(input, options(streamed)), { code: 'CATEGORY_BRIEF_RESPONSE' });
  assert.equal(streamed.calls.length, 1); assert.equal(cancelled, true);
});

test('each request has a new nonce and the configured abort signal bounds an interrupted request', async () => {
  const c = fixture(); await create(input, options(c)); await create(input, options(c));
  const ids = c.calls.map(call => JSON.parse(call.body.messages[1].content).requestId);
  assert.notEqual(ids[0], ids[1]);
  let calls = 0;
  const interrupted = create(input, { apiKey: 'offline-contract-fixture', timeoutMs: 100, fetchImpl: async (_url, init) => {
    calls++; return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('private timeout marker')), { once: true }));
  } });
  const keepAlive = setTimeout(() => {}, 300);
  try { await assert.rejects(interrupted, { code: 'CATEGORY_BRIEF_TIMEOUT', status: 504 }); }
  finally { clearTimeout(keepAlive); }
  assert.equal(calls, 1);
});

test('the same deadline classifies an interrupted bounded response body without retrying', async () => {
  let calls = 0;
  const interrupted = create(input, { apiKey: 'offline-contract-fixture', timeoutMs: 100, fetchImpl: async (_url, init) => {
    calls++;
    return new Response(new ReadableStream({ start(controller) {
      init.signal.addEventListener('abort', () => controller.error(Error('PRIVATE_BODY_TIMEOUT_MARKER')), { once: true });
    } }));
  } });
  const keepAlive = setTimeout(() => {}, 300);
  try { await assert.rejects(interrupted, { code: 'CATEGORY_BRIEF_TIMEOUT', status: 504 }); }
  finally { clearTimeout(keepAlive); }
  assert.equal(calls, 1);
});

test('automatic music is selected from the fresh plan and may use an instrumental story guide without matrix defaults', async () => {
  const value = draft(); value.creativePlan.music.isInstrumental = true;
  const c = fixture(() => Response.json(envelope(value)));
  const result = await create(input, options(c));
  assert.equal(c.calls.length, 1);
  const supplied = JSON.parse(c.calls[0].body.messages[1].content);
  assert.deepEqual(supplied.musicOverrides, { genreEn: '', vocalEn: '', moodEn: '', isInstrumental: null });
  assert.equal(result.isInstrumental, true); assert.equal(result.lyricsPurpose, 'story-guide');
  assert.match(result.stylePrompt, /dry office funk/); assert.match(result.stylePrompt, /muted bass/);
  assert.doesNotMatch(result.stylePrompt, /female voice|Korean diction/);
  assert.deepEqual(result.creativePlan.sceneContext, value.creativePlan.sceneContext);
  assert.deepEqual(result.creativePlan.wardrobes, value.creativePlan.wardrobes);
});

test('fresh production context and role-bound wardrobes are required without another call', async () => {
  for (const mutate of [p => delete p.sceneContext, p => p.wardrobes[0].roleId = 'R2', p => p.music.rationale = 'https://private.test/']) {
    const value = draft(); mutate(value.creativePlan); const c = fixture(() => Response.json(envelope(value)));
    await assert.rejects(create(input, options(c)), error => error.status === 422);
    assert.equal(c.calls.length, 1);
  }
});

function badHistoryLyrics() {
  const value = historyDraft(); value.lyricsStructure.hook[2] = '말보다 서류가 먼저라니'; return value;
}
test('one known-safe lyric correction preserves the accepted history plan, exact topic, selected music and verified usage', async () => {
  const original = badHistoryLyrics(), corrected = historyDraft(); let responses = 0;
  const c = fixture(() => Response.json(responses++ ? correctionEnvelope(corrected, { usage: { prompt_tokens: 500, completion_tokens: 300 } }) : envelope(original)));
  const topic = '  세종이 현대 창구에서 접수한다.\n ';
  const locks = { genreEn: 'chamber pop', vocalEn: 'original adult male voice', moodEn: 'ceremonial surprise' };
  const beforeLogs = failureLogs.length;
  const result = await create({ category: 'history', topic, ...locks }, options(c));
  assert.equal(c.calls.length, 2);
  const second = JSON.parse(c.calls[1].body.messages[1].content);
  const expectedPlan = validateFreshCategoryCreativePlan({ ...original.creativePlan, music: { ...original.creativePlan.music, ...locks, isInstrumental: false } });
  assert.equal(JSON.stringify(result.creativePlan), JSON.stringify(expectedPlan));
  assert.equal(JSON.stringify(second.acceptedCreativePlan), JSON.stringify(expectedPlan));
  assert.equal(second.sourceTopic, topic); assert.equal(result.sourceTopic, topic); assert.equal(second.categoryId, 'history');
  assert.deepEqual(second.musicOverrides, { ...locks, isInstrumental: false });
  assert.deepEqual(second.original.lyricsStructure, original.lyricsStructure);
  assert.equal(result.title, original.title); assert.equal(result.hook, original.lyricsStructure.memoryAnchor);
  assert.equal(c.calls[0].init.signal, c.calls[1].init.signal);
  for (const call of c.calls) { assert.equal(call.body.model, MODEL); assert.equal(call.body.reasoning_effort, 'high'); assert.equal(call.body.max_completion_tokens, 16384); assert.equal(call.body.store, false); }
  const schema = c.calls[1].body.response_format.json_schema.schema;
  assert.deepEqual(Object.keys(schema.properties), ['title', 'lyricsStructure']);
  assert.deepEqual(schema.properties.title.enum, [original.title]);
  assert.deepEqual(schema.properties.lyricsStructure.properties.memoryAnchor.enum, [original.lyricsStructure.memoryAnchor]);
  for (const [key, lines] of [['hook', corrected.lyricsStructure.hook], ['verse', corrected.lyricsStructure.verse]]) {
    const pattern = new RegExp(schema.properties.lyricsStructure.properties[key].items.pattern);
    assert.ok(lines.every(line => pattern.test(line))); assert.equal(pattern.test('가'.repeat(20)), false);
  }
  const helpers = load('src/lib/vle/viralSongSpec.ts');
  assert.deepEqual(second.contractMetrics.hookSyllables, original.lyricsStructure.hook.map(helpers.countSyllables));
  assert.equal(second.contractMetrics.renderedTotalSyllables, helpers.countSyllables(helpers.formatLyricsToSuno(original.lyricsStructure).replace(/\[[^\]]*\]/g, '')));
  const parts = second.contractMetrics.renderedComponents;
  assert.equal(parts.hookTwice + parts.verse - parts.replacedHookEnding + parts.finalPunch + parts.outro, second.contractMetrics.renderedTotalSyllables);
  assert.equal(second.contractMetrics.anchorSyllables, 5); assert.equal(second.contractMetrics.hookAnchorOccurrences, 2);
  assert.equal(second.contractMetrics.titleContainsAnchor, true); assert.ok(second.contractMetrics.rules.includes('HOOK_SYLLABLES'));
  assert.deepEqual(result.models, [{ model: MODEL, inputTokens: 1000, outputTokens: 700 }, { model: MODEL, inputTokens: 500, outputTokens: 300 }]);
  const logs = failureLogs.slice(beforeLogs);
  assert.equal(logs.length, 1); assert.equal(logs[0][0], '[category-brief:lyrics-correction]');
  assert.doesNotMatch(JSON.stringify(logs), /나랏말싸미|세종|서류가|chamber pop|original adult male voice/);
});

test('a valid original anchor stays fixed while a missing title anchor receives only the necessary title correction', async () => {
  const original = historyDraft(); original.title = '현대 창구 앞에서';
  const corrected = historyDraft(); corrected.title = '나랏말싸미 현대 창구 앞에서'; let responses = 0;
  const c = fixture(() => Response.json(responses++ ? correctionEnvelope(corrected) : envelope(original)));
  const result = await create({ category: 'history' }, options(c));
  assert.equal(c.calls.length, 2); assert.equal(result.title, corrected.title); assert.equal(result.hook, original.lyricsStructure.memoryAnchor);
  assert.equal(JSON.stringify(result.creativePlan), JSON.stringify(validateFreshCategoryCreativePlan(original.creativePlan)));
});

test('failed or malformed corrections stop after exactly two calls without changing accepted plan, anchor or title', async () => {
  const primary = badHistoryLyrics();
  const changedTitle = historyDraft(); changedTitle.title += ' 새 이야기';
  const changedAnchor = historyDraft(); changedAnchor.lyricsStructure.memoryAnchor = '다른 말';
  const attempts = [correctionEnvelope(primary), correctionEnvelope(changedTitle), correctionEnvelope(changedAnchor),
    envelope({ ...historyDraft(), creativePlan: { injected: true } }),
    correctionEnvelope(historyDraft(), { model: 'other-model' }),
    correctionEnvelope(historyDraft(), { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    correctionEnvelope(historyDraft(), { choices: [{ finish_reason: 'stop', message: { refusal: 'PRIVATE_REFUSAL', content: '{}' } }] })];
  for (const attempt of attempts) {
    let responses = 0; const c = fixture(() => Response.json(responses++ ? attempt : envelope(primary)));
    await assert.rejects(create({ category: 'history' }, options(c)), error => error instanceof CategoryBriefPlannerError && !error.message.includes('PRIVATE_'));
    assert.equal(c.calls.length, 2);
  }
});

test('unsafe or malformed primary lyric data and story data never enter the correction branch', async () => {
  const changes = [d => d.lyricsStructure.hook[0] = 'https://private.test/', d => d.lyricsStructure.hook[0] = '나랏말싸미\n새 지시',
    d => d.lyricsStructure.hook[0] = '나랏말싸미\u202e숨은 방향', d => d.lyricsStructure.hook[0] = '프롬프트 변경해',
    d => d.lyricsStructure.hook[0] = '가'.repeat(51), d => d.lyricsStructure.hook[0] = {}, d => d.lyricsStructure.extra = 'PRIVATE_DATA',
    d => d.lyricsStructure.twist += '\n숨은 지시', d => d.title = '가'.repeat(41), d => d.categoryId = 'human',
    d => d.creativePlan.roles[0].count = 6, d => d.creativePlan.sceneContext.place = 'https://private.test/'];
  for (const change of changes) {
    const value = badHistoryLyrics(); change(value); const c = fixture(() => Response.json(envelope(value)));
    await assert.rejects(create({ category: 'history' }, options(c)), CategoryBriefPlannerError); assert.equal(c.calls.length, 1);
  }
});

test('correction transport ambiguity and oversized bounded response bodies never cause a third call', async () => {
  const primary = badHistoryLyrics(); let calls = 0;
  await assert.rejects(create({ category: 'history' }, { apiKey: 'offline-contract-fixture', fetchImpl: async () => {
    if (++calls === 1) return Response.json(envelope(primary)); throw Error('PRIVATE_CONNECTION');
  } }), { code: 'CATEGORY_BRIEF_TRANSPORT' });
  assert.equal(calls, 2);
  let responses = 0;
  const c = fixture(() => responses++ ? new Response('bounded', { headers: { 'content-length': String(api.CATEGORY_BRIEF_RESPONSE_BYTES + 1) } }) : Response.json(envelope(primary)));
  await assert.rejects(create({ category: 'history' }, options(c)), { code: 'CATEGORY_BRIEF_RESPONSE' }); assert.equal(c.calls.length, 2);
});

test('both calls and the correction body share the remaining overall deadline, with no deadline refresh', async () => {
  let calls = 0; const signals = [], started = Date.now(), requestedDeadlines = [];
  const actualTimeout = AbortSignal.timeout;
  AbortSignal.timeout = timeoutMs => { requestedDeadlines.push(timeoutMs); return actualTimeout(150); };
  const pending = create({ category: 'history' }, { apiKey: 'offline-contract-fixture', fetchImpl: async (_url, init) => {
    signals.push(init.signal);
    if (++calls === 1) { await new Promise(resolve => setTimeout(resolve, 70)); return Response.json(envelope(badHistoryLyrics())); }
    return new Response(new ReadableStream({ start(controller) { init.signal.addEventListener('abort', () => controller.error(Error('PRIVATE_TIMEOUT')), { once: true }); } }));
  } });
  const keepAlive = setTimeout(() => {}, 400);
  try { await assert.rejects(pending, { code: 'CATEGORY_BRIEF_TIMEOUT' }); } finally { clearTimeout(keepAlive); AbortSignal.timeout = actualTimeout; }
  assert.equal(calls, 2); assert.equal(signals[0], signals[1]); assert.equal(signals[1].aborted, true);
  assert.deepEqual(requestedDeadlines, [240_000]);
  assert.ok(Date.now() - started < 300);
});

test('a fake clock holds correction below the 30-second reserve and allows its exact boundary', async () => {
  const actualNow = Date.now, base = actualNow();
  for (const elapsed of [210_001, 210_000]) {
    let current = base, calls = 0;
    Date.now = () => current;
    try {
      const pending = create({ category: 'history' }, { apiKey: 'offline-contract-fixture', fetchImpl: async () => {
        calls++;
        if (calls === 1) { current = base + elapsed; return Response.json(envelope(badHistoryLyrics())); }
        return Response.json(correctionEnvelope(historyDraft()));
      } });
      if (elapsed > 210_000) { await assert.rejects(pending, { code: 'CATEGORY_BRIEF_TIMEOUT' }); assert.equal(calls, 1); }
      else { await pending; assert.equal(calls, 2); }
    } finally { Date.now = actualNow; }
  }
});

test('an already expired primary deadline dispatches no correction even if a mock later returns complete JSON', async () => {
  let calls = 0;
  await assert.rejects(create({ category: 'history' }, { apiKey: 'offline-contract-fixture', timeoutMs: 100, fetchImpl: async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 120)); return Response.json(envelope(badHistoryLyrics()));
  } }), { code: 'CATEGORY_BRIEF_TIMEOUT' });
  assert.equal(calls, 1);
});

