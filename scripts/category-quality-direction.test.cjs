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
const commonFilename = path.resolve(__dirname, '../src/lib/vle/conceptContextDirection.ts');
const commonCode = ts.transpileModule(fs.readFileSync(commonFilename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const commonMod = { exports: {} }; new Function('module', 'exports', commonCode)(commonMod, commonMod.exports);
const denied = () => { throw Error('SERVER_OR_PROVIDER_ACCESS_FORBIDDEN'); };
const sandbox = { module: { exports: {} }, require: name => { assert.equal(name, './conceptContextDirection'); return commonMod.exports; }, fetch: denied };
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
    assert.match(prompt, /Preserve their complete source text/);
    assert.match(prompt, /exact counts/);
    assert.match(prompt, /first two seconds/);
    assert.match(prompt, /existing completed song/);
    assert.match(prompt, /do not rewrite its story or audio/);
    assert.match(prompt, /Planned times require later measurement/);
    assert.match(prompt, /Do not claim verified humor/);
    assert.match(prompt, /not a fixed plot/);
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

test('active guidance uses category purpose and coherent inference without fixed hook family catalogs', () => {
  for (const category of visibleStoryCategories) {
    const prompt = build(category, 10);
    assert.match(prompt, /AUDIENCE PURPOSE/); assert.match(prompt, /purposeful activity/); assert.match(prompt, /clothing and footwear together/);
    assert.doesNotMatch(prompt, /These hook families|STORY:|CAST:|MOTION:|MUSIC:/);
    get(category).hookFamilies.forEach(family => assert.ok(!prompt.includes(family.mechanismEn)));
    assert.equal(prompt, build(category, 20), 'a seed must not prescribe one of three canned plots');
  }
});

test('the shared module has no browser, provider, secret or Node runtime dependency', () => {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.ES2022, true);
  assert.deepEqual(ast.statements.filter(statement => ts.isImportDeclaration(statement)).map(statement => statement.moduleSpecifier.text), ['./conceptContextDirection']);
  assert.doesNotMatch(source, /\b(?:process|fetch|require|window|document)\s*[.(]|node:|server-only|client-only/);
  assert.equal(typeof build('drama'), 'string');
});

test('the common client-safe purpose map covers all twelve visible categories with distinct rewards and separate hidden compatibility', () => {
  const api = commonMod.exports;
  assert.deepEqual(api.VIRAL_VISIBLE_CATEGORY_IDS, [...visibleStoryCategories, 'dance']);
  const purposes = api.VIRAL_VISIBLE_CATEGORY_IDS.map(id => api.getConceptContextPurpose(id));
  assert.equal(new Set(purposes.map(purpose => purpose.purposeEn)).size, 12);
  assert.ok(!api.VIRAL_VISIBLE_CATEGORY_IDS.includes('ai_future'));
  assert.equal(api.getConceptContextPurpose('ai_future').categoryId, 'ai_future');
  assert.equal(api.getConceptContextPurpose('unknown'), null);
});
