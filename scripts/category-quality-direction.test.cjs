const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/vle/categoryQualityDirection.ts');
const source = fs.readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const denied = () => { throw Error('SERVER_OR_PROVIDER_ACCESS_FORBIDDEN'); };
const sandbox = { module: { exports: {} }, require: denied, fetch: denied };
sandbox.exports = sandbox.module.exports;
Object.defineProperty(sandbox, 'process', { get: denied });
vm.runInNewContext(compiled, sandbox, { filename, timeout: 1000 });
const api = sandbox.module.exports;
const { getCategoryQualityDirection: get, buildCategoryQualityInstructions: build } = api;
const visibleStoryCategories = ['drama', 'pet', 'relationship', 'human', 'trend', 'challenge', 'brand', 'history', 'parenting', 'food_diet', 'horror_mystery'];

test('guidance covers the eleven visible story categories, keeping Dance and hidden AI future separate', () => {
  assert.deepEqual(Array.from(api.VIRAL_QUALITY_CATEGORY_IDS), visibleStoryCategories);
  assert.deepEqual(Object.keys(api.VIRAL_CATEGORY_QUALITY_DIRECTIONS), visibleStoryCategories);
  assert.equal(get('challenge').labelKo, '도파민 응원');
  assert.equal(get('horror_mystery').labelKo, '이불킥·흑역사');
  assert.equal(get('dance_challenge'), null);
  assert.equal(get('ai_future'), null);
});

test('malformed or inherited categories cannot fall back into another production direction', () => {
  for (const value of [undefined, null, '', 'unknown', 'constructor', '__proto__', 'toString', {}, [], 7]) {
    assert.equal(get(value), null);
    assert.equal(build(value), '');
  }
});

test('each category supplies distinct filmable mechanisms, its own motion/music and concrete quick checks', () => {
  const hookIds = [], motions = new Set(), music = new Set();
  for (const category of visibleStoryCategories) {
    const direction = get(category);
    assert.equal(direction.categoryId, category);
    assert.equal(direction.hookFamilies.length, 3);
    assert.equal(new Set(direction.hookFamilies.map(family => family.mechanismEn)).size, 3);
    for (const family of direction.hookFamilies) {
      assert.match(family.id, /^[a-z_]+$/);
      assert.match(family.labelKo, /[가-힣]/);
      assert.ok(family.mechanismEn.length >= 70);
      hookIds.push(family.id);
    }
    assert.equal(direction.quickChecksKo.length, 3);
    direction.quickChecksKo.forEach(check => assert.match(check, /[가-힣].*(?:는가|인가)$/));
    motions.add(direction.motionRuleEn); music.add(direction.musicRuleEn);
  }
  assert.equal(new Set(hookIds).size, 33);
  assert.equal(motions.size, 11); assert.equal(music.size, 11);
});

test('instructions keep explicit story and audio first, and distinguish planning from measured quality', () => {
  for (const category of visibleStoryCategories) {
    const prompt = build(category, 'offline-episode');
    assert.ok(prompt.length < 5000, `${category}: ${prompt.length}`);
    assert.match(prompt, /Preserve explicit choices/);
    assert.match(prompt, /person count/);
    assert.match(prompt, /0–2 seconds/);
    assert.match(prompt, /existing completed song/);
    assert.match(prompt, /do not rewrite its story or audio/);
    assert.match(prompt, /Planned times require later measurement/);
    assert.match(prompt, /Do not claim verified humor/);
    assert.match(prompt, /never copy a finished example/);
  }
});

test('casting appeal is role-aware and never erases pets, no-human stories, historical figures or children', () => {
  assert.match(get('human').castingRuleEn, /charming adult woman/);
  assert.match(get('relationship').castingRuleEn, /both identities/);
  assert.match(get('pet').castingRuleEn, /no-human and off-screen-owner/);
  assert.match(get('brand').castingRuleEn, /remain product-only/);
  assert.match(get('history').castingRuleEn, /not a replacement for the historical figure/);
  assert.match(get('parenting').castingRuleEn, /never changes a child/);
  assert.match(get('challenge').castingRuleEn, /without forcing.*one gender/);
});

test('seeded variation rotates all three suggestions while retaining every mechanism and bounded input', () => {
  const order = prompt => prompt.split('\n').filter(line => line.startsWith('- '));
  const variants = Array.from({ length: 24 }, (_, seed) => build('human', seed));
  assert.equal(new Set(variants.map(prompt => order(prompt)[0])).size, 3);
  const expected = [...order(variants[0])].sort();
  variants.forEach(prompt => assert.deepEqual([...order(prompt)].sort(), expected));
  assert.equal(build('human', 10), build('human', 10));
  const prefix = 'x'.repeat(200);
  assert.equal(build('human', prefix + 'large-untrusted-tail'), build('human', prefix));
  assert.equal(build('human', Infinity), build('human'));
});

test('the shared module has no browser, provider, secret or Node runtime dependency', () => {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2022, true);
  assert.equal(ast.statements.some(statement => ts.isImportDeclaration(statement)), false);
  assert.doesNotMatch(source, /\b(?:process|fetch|require|window|document)\s*[.(]|node:|server-only|client-only/);
  assert.equal(typeof build('drama'), 'string');
});
