/* Offline API contract checks: actual route/compiler, fake auth and provider responses. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const CATEGORY_IDS = ['drama', 'relationship', 'human', 'trend', 'challenge', 'brand', 'history', 'parenting', 'food_diet', 'horror_mystery'];
const PLAN = {
  opening2s: { startSeconds: 0, endSeconds: 2, action: '왕이 복사기 옆에서 종이 한 장을 들고 기다린다.' },
  watchReason: '왕의 명령이 사무실 절차를 통과할 수 있을까?',
  development: ['왕이 종이를 복사기 위에 놓는다.', '직원이 복사기의 시작 버튼을 가리킨다.'],
  payoff: '왕이 직접 시작 버튼을 누르자 종이가 나오고 직원과 웃는다.',
  roles: [{ id: 'R1', role: '현대 사무실에 온 왕', appearance: '검은 머리와 수염이 있는 성인 남성', count: 1, visibility: 'on_screen' },
    { id: 'R2', role: '복사기 사용을 돕는 직원', appearance: '짧은 갈색 머리의 성인 여성', count: 1, visibility: 'on_screen' }],
  sceneContext: { place: '업무 중인 현대 사무실', ongoingActivity: '문서를 복사하려고 순서를 기다린다.', immediateTrigger: '복사기에서 종이가 나오지 않는다.', settingEvidence: '공유 복사기 옆으로 책상과 서류함이 이어진다.' },
  wardrobes: [{ roleId: 'R1', clothing: '붉은 왕의 예복', footwear: '검은 전통 신발' }, { roleId: 'R2', clothing: '회색 셔츠와 검은 바지', footwear: '검은 실내화' }],
  music: { genreEn: 'Original Korean soul funk', vocalEn: 'clear Korean vocal', moodEn: 'playful', styleEn: 'dry bass and light handclaps',
    rationale: '왕의 권위와 사무실 절차의 작은 차이를 경쾌하게 표현한다.', targetBpm: 104, isInstrumental: false },
};
function authoredPrompt(length = 1200) {
  const text = 'A king in a red period robe and black traditional shoes waits beside a shared copier in a working modern office. One adult office worker in a grey shirt, black trousers and black indoor shoes points to the start button. The king sets his single sheet down, follows the worker\'s practical instruction, presses the button and smiles when the copy emerges. Keep their established identities, wardrobe, paper count, office desks and filing shelves unchanged. Show the clear physical cause and shared resolved reaction without speech, text, music or new people. ';
  return text.repeat(Math.ceil(length / text.length)).slice(0, length);
}
function fixture(options = {}) {
  const calls = [], compilerCalls = [], logs = [], cache = new Map();
  const overrides = {
    'next/server': { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'Content-Type': 'application/json' } }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: 'offline-owner' } }, error: null }) } }) },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === '@/lib/video/viralStoryPipeline') {
        const actual = load('src/lib/video/viralStoryPipeline.ts');
        return { ...actual, compileViralStoryPrompts(input) {
          compilerCalls.push(input);
          if (options.rejectCompile) throw Error('Offline compiler rejection');
          return actual.compileViralStoryPrompts(input);
        } };
      }
      return name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`)
        : name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    };
    const fakeFetch = async (url, request) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions', 'Only the single planning call is permitted');
      calls.push({ url, body: JSON.parse(request.body) });
      if (options.networkError) throw Error('Offline provider unavailable');
      const content = options.content ?? JSON.stringify({ prompt: authoredPrompt() });
      return new Response(JSON.stringify({ choices: [{ finish_reason: options.finishReason || 'stop', message: { content, ...(options.refusal ? { refusal: 'Offline refusal' } : {}) } }] }), { status: options.providerStatus || 200 });
    };
    new Function('require', 'module', 'exports', 'process', 'fetch', 'console', js)(localRequire, mod, mod.exports,
      { env: { OPENAI_API_KEY: options.noKey ? '' : 'offline-key' } }, fakeFetch, { warn(_label, code) { logs.push(code); }, error(_label, code) { logs.push(code); } });
    return mod.exports;
  }
  const route = load('src/app/api/viral-cf/grok-video/prompt/route.ts');
  const pipeline = load('src/lib/video/viralStoryPipeline.ts');
  function request(body = {}, headers = {}) {
    const req = new Request('https://melodio.example.test/api/viral-cf/grok-video/prompt', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://melodio.example.test', ...headers },
      body: JSON.stringify({ title: '왕의 복사기 첫 출근', lyrics: '종이 한 장 놓고 버튼을 누른다', topic: '왕이 현대 사무실에서 복사기를 사용한다.', category: 'history', genre: 'Original Korean soul funk', ...body }),
    });
    req.nextUrl = new URL(req.url); return req;
  }
  return { route, calls, compilerCalls, logs, request, pipeline };
}

test('one structured Sol call retains the complete approved History contract and returns an unchanged usable prompt', async () => {
  const prompt = authoredPrompt(1800), c = fixture({ content: JSON.stringify({ prompt }) });
  const response = await c.route.POST(c.request({ creativePlan: PLAN })), result = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(result, { prompt });
  assert.equal(c.calls.length, 1);
  const call = c.calls[0].body;
  assert.equal(call.model, 'gpt-5.6-sol'); assert.equal(call.reasoning_effort, 'low'); assert.equal(call.max_completion_tokens, 4096);
  assert.equal(call.response_format.type, 'json_schema'); assert.equal(call.response_format.json_schema.strict, true);
  const schema = call.response_format.json_schema.schema;
  assert.deepEqual(schema.required, ['prompt']); assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), ['prompt']); assert.equal(schema.properties.prompt.pattern, '^[ -~]{900,1800}$');
  assert.ok(call.messages[0].content.includes(JSON.stringify(PLAN)), 'Every approved production field must reach the model intact');
  assert.ok(call.messages[0].content.includes('Every wardrobe entry remains bound to its roleId'));
  assert.ok(call.messages[0].content.includes('900-1800 printable ASCII characters'));
  assert.ok(call.messages[1].content.includes('[User Topic]: 왕이 현대 사무실에서 복사기를 사용한다.'));
  assert.deepEqual(c.compilerCalls, [{ prompt, category: 'history', allowDance: false, cutCadenceSeconds: 1.5 }]);
});

test('both prompt boundaries compile within provider bytes for all ten categories and both movement choices', async () => {
  for (const category of CATEGORY_IDS) for (const length of [900, 1800]) {
    const prompt = authoredPrompt(length), c = fixture({ content: JSON.stringify({ prompt }) });
    const response = await c.route.POST(c.request({ category }));
    assert.equal(response.status, 200, `${category} at ${length} characters`);
    assert.deepEqual(await response.json(), { prompt }); assert.equal(c.calls.length, 1); assert.equal(c.compilerCalls.length, 1);
    for (const allowDance of [false, true]) for (const cutCadenceSeconds of [0.5, 1.5, 8, 1.23456789]) {
      const compiled = c.pipeline.compileViralStoryPrompts({ prompt, category, allowDance, cutCadenceSeconds });
      assert.ok(compiled.every(value => Buffer.byteLength(value, 'utf8') <= 4096), `${category} final provider inputs must fit`);
    }
  }
});

test('invalid structured outputs fail closed without truncation, fallback or another provider call', async () => {
  const valid = authoredPrompt();
  const invalid = [
    'Plain prose rather than JSON', '{broken', JSON.stringify(valid), JSON.stringify([{ prompt: valid }]),
    JSON.stringify({ prompt: valid, commentary: 'extra field' }), JSON.stringify({ wrong: valid }), JSON.stringify({ prompt: 123 }),
    JSON.stringify({ prompt: authoredPrompt(899) }), JSON.stringify({ prompt: authoredPrompt(1801) }), JSON.stringify({ prompt: authoredPrompt(2400) }),
    JSON.stringify({ prompt: valid.slice(0, -1) + '왕' }), JSON.stringify({ prompt: valid + '\n' }), JSON.stringify({ prompt: ' '.repeat(900) }),
  ];
  for (const content of invalid) {
    const c = fixture({ content }), response = await c.route.POST(c.request());
    assert.equal(response.status, 500); assert.equal((await response.json()).prompt, undefined);
    assert.equal(c.calls.length, 1); assert.equal(c.compilerCalls.length, 0);
  }
});

test('compiler, refusal, incomplete and provider failures never expose a usable prompt or retry', async () => {
  for (const options of [{ rejectCompile: true }, { refusal: true }, { finishReason: 'length' }, { providerStatus: 503 }, { networkError: true }]) {
    const c = fixture(options), response = await c.route.POST(c.request());
    assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: '비디오 프롬프트 생성 실패' });
    assert.equal(c.calls.length, 1); assert.equal(c.compilerCalls.length, options.rejectCompile ? 1 : 0);
  }
});

test('invalid input, unauthorized and missing-key requests do not make a provider call', async () => {
  for (const [options, body, expected] of [[{ unauthorized: true }, {}, 401], [{ noKey: true }, {}, 500], [{}, { genre: 'x'.repeat(301) }, 400]]) {
    const c = fixture(options); assert.equal((await c.route.POST(c.request(body))).status, expected); assert.equal(c.calls.length, 0);
  }
});

test('legacy ai_future and dance retain their plain-text response contract', async () => {
  for (const category of ['ai_future', 'dance']) {
    const content = 'One unchanged legacy scene prompt.', c = fixture({ content });
    const response = await c.route.POST(c.request({ category }));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { prompt: content });
    assert.equal(c.calls.length, 1); assert.equal(c.calls[0].body.response_format, undefined); assert.equal(c.compilerCalls.length, 0);
  }
});

test('pet spec generation keeps its existing scene-beat response envelope and compiler path', async () => {
  const c = fixture({ content: JSON.stringify({ beats: ['A cat turns toward its owner.', 'The owner lowers the phone.', 'The cat approaches again.'], coreObject: 'One phone held by the owner' }) });
  const response = await c.route.POST(c.request({ category: 'pet' })), result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.specVersion, 'v2'); assert.equal(result.sceneBeats.length, 3);
  assert.equal(result.allowDance, false); assert.equal(result.cutCadenceSeconds, 1.5);
  assert.equal(c.calls.length, 1); assert.deepEqual(c.calls[0].body.response_format, { type: 'json_object' }); assert.equal(c.compilerCalls.length, 0);
});
