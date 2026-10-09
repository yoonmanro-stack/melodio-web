const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const baseline = process.env.CATEGORY_BRIEF_BASELINE_ROOT || root;
const authored = new Set(['src/lib/vle/categoryBriefPlanner.ts', 'src/lib/vle/categoryQualityDirection.ts', 'src/lib/vle/categoryCreativePlan.ts']);
const cache = new Map();
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
  new Function('require', 'module', 'exports', 'process', 'fetch', compiled)(localRequire, mod, mod.exports,
    { env: { OPENAI_API_KEY: 'offline-contract-fixture' } }, denied);
  return mod.exports;
}
const api = load('src/lib/vle/categoryBriefPlanner.ts');
const { createCategoryBrief: create, CategoryBriefPlannerError, CATEGORY_BRIEF_MODEL: MODEL } = api;
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
  }, lyricsStructure: structuredClone(structure) };
}
function envelope(value = draft(), overrides = {}) {
  return { model: MODEL, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value), refusal: null } }],
    usage: { prompt_tokens: 1000, completion_tokens: 700 }, ...overrides };
}
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
  assert.deepEqual(supplied.music, { genreEn: 'acoustic jazz', vocalEn: 'warm female voice', moodEn: 'dry playful tension', targetBpm: 120, isInstrumental: false });
  assert.match(body.messages[0].content, /새 기획|NEW complete Korean/);
  assert.match(body.messages[0].content, /Existing|existing completed song/);
  assert.match(result.stylePrompt, /acoustic jazz/); assert.match(result.stylePrompt, /warm female voice/); assert.match(result.stylePrompt, /dry playful tension/);
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
  assert.match(result.stylePrompt, /acoustic jazz/); assert.match(result.stylePrompt, /instrumental only/);
  assert.doesNotMatch(result.stylePrompt, /instant vocal|vocal-centric|Korean diction|female voice/);
  assert.equal(JSON.parse(c.calls[0].body.messages[1].content).music.isInstrumental, true);
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
  for (const mutate of mutations) {
    const value = draft(); mutate(value); const c = fixture(() => Response.json(envelope(value)));
    await assert.rejects(create(input, options(c)), { code: 'CATEGORY_BRIEF_LYRICS' }); assert.equal(c.calls.length, 1);
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
  const c = fixture(() => Response.json(envelope(value)));
  await assert.rejects(create(input, options(c)), { code: 'CATEGORY_BRIEF_LYRICS' });
  assert.equal(c.calls.length, 1);
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
  try { await assert.rejects(interrupted, { code: 'CATEGORY_BRIEF_TRANSPORT', status: 504 }); }
  finally { clearTimeout(keepAlive); }
  assert.equal(calls, 1);
});
