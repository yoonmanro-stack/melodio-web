/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/vle/categoryCreativePlan.ts');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleFixture = { exports: {} };
const actionModule = { exports: {} };
const actionCode = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/vle/categoryObservableAction.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('module', 'exports', actionCode)(actionModule, actionModule.exports);
new Function('require', 'module', 'exports', code)(name => { assert.equal(name, './categoryObservableAction'); return actionModule.exports; }, moduleFixture, moduleFixture.exports);
const { validateCategoryCreativePlan: validate, readCategoryBriefExtras: extras, serializeCategoryCreativePlan: serialize, serializeCategoryBriefExtras, CategoryCreativePlanError } = moduleFixture.exports;
function plan() { return { opening2s: { startSeconds: 0, endSeconds: 2, action: '성인 여성이 가방을 메고 사무실 문을 연다.' }, watchReason: '빈 커피잔으로 오늘의 일을 버틸 수 있을까?',
  development: ['여성이 빈 커피잔을 들어 마시려다 내려놓는다.', '동료가 자기 잔을 집어 들고 먼저 문을 열어 나간다.'], payoff: '여성이 자기 가방만 의자에 다시 놓고 빈 잔을 들어 보인다.',
  roles: [{ id: 'R1', role: '먼저 출근한 여성 직장인', appearance: '짧은 검은 머리와 흰 셔츠를 입은 성인 여성', count: 1, visibility: 'on_screen' },
    { id: 'R2', role: '잠시 들른 동료', appearance: '갈색 재킷을 입은 성인 남성', count: 1, visibility: 'off_screen' }] }; }
const legacy = () => ({ sourceTopic: '출근한 사람과 빈 커피잔', categoryId: 'human', title: '나만 출근', hook: '나만 출근', lyrics: '[Chorus]\n나만 출근', stylePrompt: 'original pop' });
function rejects(value) { assert.throws(() => validate(value), error => { assert.ok(error instanceof CategoryCreativePlanError); assert.equal(error.code, 'CATEGORY_CREATIVE_PLAN'); assert.equal(error.status, 400); assert.ok(error.message.length < 100); assert.doesNotMatch(error.message, /secret|data:|private\.test|raw payload/); return true; }); }
test('client module returns a fresh canonical plan and deterministic serialization', () => {
  const input = plan(); input.opening2s.action = ` ${input.opening2s.action} `;
  const result = validate(input); assert.deepEqual(result, plan()); assert.notEqual(result, input); assert.notEqual(result.roles, input.roles);
  assert.equal(serialize(input), JSON.stringify(plan())); assert.deepEqual(validate(JSON.parse(serialize(input))), result);
  input.roles[0].appearance = '다른 사람'; assert.equal(result.roles[0].appearance, plan().roles[0].appearance);
  const nullPrototype = Object.assign(Object.create(null), plan()); assert.deepEqual(validate(nullPrototype), plan());
});
test('legacy snapshots retain no new defaults, while optional false and each audio mode are preserved', () => {
  assert.deepEqual(extras(legacy()), {}); assert.equal(serializeCategoryBriefExtras(legacy()), '{}');
  for (const [isInstrumental, lyricsPurpose] of [[false, 'sung'], [true, 'story-guide']]) {
    const input = { ...legacy(), creativePlan: plan(), isInstrumental, lyricsPurpose };
    assert.deepEqual(extras(input), { creativePlan: plan(), isInstrumental, lyricsPurpose });
    assert.deepEqual(JSON.parse(serializeCategoryBriefExtras(input)), extras(input));
    assert.equal(input.lyrics, legacy().lyrics, 'instrumental story guide remains in the saved snapshot');
  }
  assert.deepEqual(extras({ ...legacy(), isInstrumental: false }), { isInstrumental: false });
  assert.deepEqual(extras({ ...legacy(), lyricsPurpose: 'story-guide' }), { lyricsPurpose: 'story-guide' });
  assert.deepEqual(extras({ ...legacy(), otherLegacyMetadata: { allowed: true } }), {});
});
test('provided optional fields reject malformed values and inconsistent audio modes', () => {
  for (const update of [{ isInstrumental: undefined }, { isInstrumental: null }, { isInstrumental: 'true' }, { lyricsPurpose: undefined }, { lyricsPurpose: null }, { lyricsPurpose: '' }, { lyricsPurpose: 'instrumental' },
    { isInstrumental: true, lyricsPurpose: 'sung' }, { isInstrumental: false, lyricsPurpose: 'story-guide' }, { creativePlan: undefined }, { creativePlan: null }]) assert.throws(() => extras({ ...legacy(), ...update }), CategoryCreativePlanError);
  for (const value of [null, undefined, [], 'raw payload', new Date(), Object.create({ inherited: true })]) assert.throws(() => extras(value), CategoryCreativePlanError);
});
test('roles enforce IDs, integer counts, six total characters and an onscreen role', () => {
  const six = plan(); six.roles[0].count = 5; assert.equal(validate(six).roles[0].count, 5);
  for (const mutate of [p => p.roles[0].count = 6, p => p.roles[0].count = 0, p => p.roles[0].count = 1.5, p => p.roles[0].count = '1', p => p.roles[0].count = 7,
    p => p.roles[1].id = 'R1', p => p.roles[0].id = 'r1', p => p.roles[0].id = 'R4', p => p.roles[0].visibility = 'hidden', p => p.roles.forEach(role => role.visibility = 'off_screen'), p => p.roles = []]) { const value = plan(); mutate(value); rejects(value); }
});
test('exact action timeline and distinct physical development are required', () => {
  for (const mutate of [p => p.opening2s.startSeconds = 1, p => p.opening2s.endSeconds = 3, p => p.opening2s.endSeconds = '2', p => p.development = [], p => p.development.push('여성이 가방을 집어 든다.'),
    p => p.development[0] = p.opening2s.action, p => p.payoff = p.development[0], p => p.opening2s.action = '아름다운 배경의 분위기', p => p.payoff = '모두의 새로운 행복']) { const value = plan(); mutate(value); rejects(value); }
});
test('all narrative fields enforce bounded Korean single-line text and reject media/URLs/control bytes', () => {
  for (const raw of ['', ' ', 'English only', '가'.repeat(181), '가방을 집어 data:secret', '가방을 집어 base64 secret', '가방을 집어 https://private.test/', '가방을 집어 javascript:secret', '가방을 집어\nsecret', '가방을 집어\tsecret', '가방을 집어\u007fsecret', '가방을 집어\u0085secret', '가방을 집어\u202esecret', '<가방을 집어>']) { const value = plan(); value.opening2s.action = raw; rejects(value); }
  const maximum = plan(); maximum.opening2s.action = '가방을 집어'.padEnd(180, '가'); assert.equal(validate(maximum).opening2s.action.length, 180);
  for (const mutate of [p => p.watchReason = '가'.repeat(181), p => p.development[0] = '가'.repeat(241), p => p.payoff = '가'.repeat(241), p => p.roles[0].role = '가'.repeat(81), p => p.roles[0].appearance = '가'.repeat(201)]) { const value = plan(); mutate(value); rejects(value); }
});
test('extra keys, symbols, hidden fields, accessors and custom prototypes never enter canonical data', () => {
  for (const mutate of [p => p.extra = 'secret', p => p.opening2s.extra = 'secret', p => p.roles[0].extra = 'secret', p => p[Symbol('secret')] = true,
    p => Object.defineProperty(p, 'hidden', { value: 'secret' }), p => Object.setPrototypeOf(p.roles[0], { inherited: true }),
    p => Object.defineProperty(p, '__proto__', { value: {}, enumerable: true }), p => p.roles[0].constructor = 'secret']) { const value = plan(); mutate(value); rejects(value); }
  let invoked = 0; const accessor = plan(); Object.defineProperty(accessor.opening2s, 'action', { get() { invoked++; throw Error('raw payload'); }, enumerable: true }); rejects(accessor); assert.equal(invoked, 0);
  const snapshot = legacy(); Object.defineProperty(snapshot, 'creativePlan', { get() { invoked++; return plan(); }, enumerable: true }); assert.throws(() => extras(snapshot), CategoryCreativePlanError); assert.equal(invoked, 0);
  const unusual = new Proxy(plan(), { ownKeys() { throw Error('secret raw payload'); } }); rejects(unusual);
});
test('arrays must be dense ordinary data arrays without extra metadata or inherited values', () => {
  for (const mutate of [p => delete p.development[0], p => p.development.extra = 'secret', p => p.roles[Symbol('secret')] = true, p => Object.setPrototypeOf(p.roles, {}),
    p => Object.defineProperty(p.development, '0', { get() { throw Error('raw payload'); }, enumerable: true }), p => Object.defineProperty(p.roles, '0', { value: p.roles[0], enumerable: false })]) { const value = plan(); mutate(value); rejects(value); }
});

function contextualPlan() {
  return { ...plan(), sceneContext: { place: '직원과 동료가 일하는 사무실', ongoingActivity: '여성이 일을 시작하려고 커피잔을 든다.', immediateTrigger: '커피를 마시려는 순간 빈 잔을 발견한다.', settingEvidence: '직원 업무와 동료 출입으로 공용 업무 공간이 드러난다.' },
    wardrobes: [{ roleId: 'R1', clothing: '출근에 맞는 단정한 셔츠와 바지', footwear: '셔츠와 어울리는 낮은 구두' }, { roleId: 'R2', clothing: '동료의 사무실 재킷과 바지', footwear: '업무 복장과 맞는 신발' }],
    music: { genreEn: 'deadpan funk', vocalEn: 'natural adult Korean voice', moodEn: 'wry anticipation', styleEn: 'clipped bass and piano reveal accent', rationale: '짧은 정지와 속마음의 반응을 또렷하게 드러낸다.', targetBpm: 118, isInstrumental: false } };
}
test('new context and wardrobes persist canonically while old plans remain unchanged', () => {
  const value = contextualPlan(), result = validate(value);
  assert.deepEqual(validate(JSON.parse(serialize(value))), result);
  assert.deepEqual(result.sceneContext, value.sceneContext); assert.notEqual(result.wardrobes, value.wardrobes);
  assert.deepEqual(moduleFixture.exports.validateFreshCategoryCreativePlan(value), result);
  assert.throws(() => moduleFixture.exports.validateFreshCategoryCreativePlan(plan()), CategoryCreativePlanError);
  for (const mutate of [p => delete p.music, p => p.wardrobes.reverse(), p => p.sceneContext.settingEvidence = 'private https://private.test/', p => p.music.targetBpm = 171]) { const input = contextualPlan(); mutate(input); rejects(input); }
  assert.throws(() => extras({ ...legacy(), creativePlan: value, isInstrumental: true }), CategoryCreativePlanError);
});
