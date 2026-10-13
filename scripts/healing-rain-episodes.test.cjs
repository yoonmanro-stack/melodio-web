// Offline tests execute the real route, validation, compiler and persistence
// modules. PostgreSQL concurrency, grants and RLS belong to the SQL fixture.
/* eslint-disable @typescript-eslint/no-require-imports -- This offline CommonJS harness transpiles the real TypeScript route modules. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(file, dependencies = {}, globals = {}) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports, Error, Date, JSON, TextDecoder, Request, Response, URL, crypto,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; },
    ...globals,
  }, { filename: file });
  return loadedModule.exports;
}

// Only the pure local model graph may be loaded without explicit stubs.
const pureModules = new Map();
function loadPure(file) {
  const absolute = path.resolve(file);
  if (pureModules.has(absolute)) return pureModules.get(absolute);
  const source = fs.readFileSync(absolute, 'utf8');
  const imports = [...source.matchAll(/(?:from\s+|require\()['"]([^'"]+)['"]/g)].map(match => match[1]);
  const dependencies = {};
  for (const name of imports) {
    if (name.startsWith('node:')) { dependencies[name] = require(name); continue; }
    const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name);
    assert.ok(base.startsWith(path.resolve('src/lib/healing-rain') + path.sep) || base.startsWith(path.resolve('shared/healing-rain') + path.sep), `Unexpected model dependency: ${name}`);
    const resolved = [base, `${base}.ts`, `${base}.js`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    assert.ok(resolved, `Missing model dependency: ${name}`);
    dependencies[name] = resolved.endsWith('.ts') ? loadPure(resolved) : require(resolved);
  }
  const result = load(absolute, dependencies);
  pureModules.set(absolute, result);
  return result;
}

const episodes = loadPure('src/lib/healing-rain/episodes.ts');
const recipe = loadPure('src/lib/healing-rain/recipes.ts');
const worker = require('../worker/healing-rain-plan.js');
const plain = value => JSON.parse(JSON.stringify(value));
const input = () => plain(episodes.exampleEpisodeInput());
const id = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';
const timestamp = '2026-10-13T00:00:00.000Z';
const plan = (value=input(), identity=id) => episodes.compileEpisodePlan(value, identity, timestamp);

test('all 30 intro variants compile with every main scene while keeping existing source direction intact', () => {
  const catalog = episodes.getEpisodeCatalog(), introPrompts = new Set();
  let combinations = 0;
  for (const family of catalog.families) for (const variant of family.variants) {
    for (const scene of recipe.recipes) {
      const value=input(); value.intro={familyId:family.id,variantId:variant.id};value.main.sceneId=scene.id;
      value.audio.surface=catalog.sceneSurfaces[scene.id][0]; value.audio.perspective=catalog.scenePerspectives[scene.id][0];
      const p=plan(value), canonical=recipe.compileRecipe(value.main,id,timestamp);
      assert.deepEqual(plain(p.basePlan),plain(canonical));
      assert.equal(p.review.compatibilityWarning===null,family.compatibleScenes.includes(scene.id));
      assert.equal(p.production.transition.startSeconds,6);assert.equal(p.production.transition.endSeconds,15);
      assert.equal(p.production.transition.fullCloudOcclusionRequired,false);
      assert.deepEqual(plain(p.production.previewSeconds),[30,180]);
      assert.equal(p.execution.providerCallsAllowed,false);assert.equal(p.execution.longFormEnabled,false);
      assert.equal(p.review.mediaValidation,'not_performed');assert.equal(p.execution.policyApproval,false);
      assert.ok(p.prompts.introImage.includes('adult'));assert.ok(p.prompts.introVideo.includes('no generated scene morph'));
      assert.ok(p.prompts.rainAudio.length<=500);assert.ok(p.prompts.mainImage.length<2600);assert.ok(p.prompts.mainVideo.length<1500);
      assert.ok(Buffer.byteLength(JSON.stringify(p))<48000);assert.throws(()=>worker.buildGenerationSpec(p,'offline-job'));
      if(scene.id==='train')introPrompts.add(p.prompts.introImage);
      combinations++;
    }
  }
  assert.equal(combinations,300); assert.equal(introPrompts.size,30);
});

test('lighting, motion and design selections change the relevant instructions without silently authorizing generation', () => {
  const a=plan();const value=input();
  value.brief.intent='spacious-calm';value.connection.motif='water';value.visual.anchor='젖은 유리 가장자리와 멀리 떨어진 숲의 윤곽을 넓게 보여 준다';
  value.audio.detail='큰 물방울 타격보다 넓게 퍼지는 외부 빗소리에 중심을 둔다';value.audio.dynamics='slow-swells';
  value.main.thunder='distant'; const b=plan(value);
  assert.notEqual(a.prompts.introImage,b.prompts.introImage);assert.notEqual(a.editorial.transitionInstruction,b.editorial.transitionInstruction);
  assert.ok(b.prompts.mainImage.includes(value.visual.anchor));assert.ok(b.prompts.rainAudio.includes(value.audio.detail));
  assert.ok(b.prompts.rainAudio.includes('low rail rumble'));assert.ok(b.prompts.rainAudio.includes('Slow subtle swells'));
  assert.equal(b.editorial.thunder.requested,'distant');assert.equal(b.editorial.thunder.separateLayer,true);
  assert.match(b.prompts.rainAudio,/no silence, fades, music, voices, bells or thunder/);
  assert.ok(a.prompts.introImage.includes('bright, peaceful and welcoming'));assert.equal(a.production.reversePlayback,false);
  assert.equal(b.execution.generationAdapter,'not_connected');assert.equal(b.execution.policyApproval,false);
});

test('strict envelopes reject forged flags, unknown nested fields, raw media and inconsistent acoustic settings', () => {
  const invalid = [
    v=>{v.execution={providerCallsAllowed:true}}, v=>{v.userId=id}, v=>{v.main.extra=true},
    v=>{v.connection.transitionSeconds=6}, v=>{v.intro.familyId='unknown'},v=>{v.intro.variantId='unknown'},
    v=>{v.audio.surface='metal'},v=>{v.audio.perspective='open'},v=>{v.brief.premise='tiny'},
    v=>{v.main.notes='data:image/png;base64,fake'},v=>{v.visual.anchor='blob:invalid-placeholder'},
    v=>{v.audio.detail='x'.repeat(201)},v=>{v.main.variation=0.1},v=>{delete v.brief},
  ];
  for(const mutate of invalid){const v=input();mutate(v);assert.throws(()=>episodes.parseEpisodeInput(v),error=>error.status===400)}
  assert.throws(()=>episodes.parseSaveEpisode({clientRequestId:'valid-request',input:input(),comparison:{policyApproval:true}}));
  assert.throws(()=>episodes.parseEpisodeReview({clientRequestId:'review-request',verdict:'policy_approved',reason:'Test reason with enough detail.'}));
  assert.throws(()=>plan(input(),'wrong-id'));
  assert.throws(()=>episodes.compileEpisodePlan(input(),id,'2026-10-13T00:00:00.000Z plus text'));
  assert.throws(()=>episodes.compileEpisodePlan(input(),id,'2026-10-13T00:00:00+09:00'));
});

test('maximum supported inputs fit database and prompt budgets across all scenes', () => {
  const catalog=episodes.getEpisodeCatalog();
  for (const scene of recipe.recipes) {
    const v=input();v.title='한'.repeat(100);v.main.sceneId=scene.id;v.main.title='한'.repeat(100);v.main.notes='소품 질감 '.repeat(100).slice(0,600);
    v.brief.premise='한'.repeat(360);v.brief.distinctiveExperience='한'.repeat(360);v.visual.anchor='한'.repeat(200);
    v.audio.surface=catalog.sceneSurfaces[scene.id][0];v.audio.perspective=catalog.scenePerspectives[scene.id][0];v.audio.detail='한'.repeat(200);v.audio.dynamics='slow-swells';v.connection.rationale='한'.repeat(200);
    const p=plan(v);assert.ok(Buffer.byteLength(JSON.stringify(p))<48000,scene.id);assert.ok(p.prompts.rainAudio.length<=500,scene.id);
    assert.ok(p.prompts.mainImage.length<2600,`${scene.id} image ${p.prompts.mainImage.length}`);assert.ok(p.prompts.mainVideo.length<1500,`${scene.id} video ${p.prompts.mainVideo.length}`);
  }
});

test('title, seed, palette, rationale and intro replacement cannot disguise the same main design', () => {
  const previous=plan(input(),otherId), v=input(), alternative=episodes.getEpisodeCatalog().families[1];
  v.title='새로운 제목으로 시작하는 하루';v.main.title='다른 제목';v.main.palette='linen';v.main.variation=98765;
  v.brief.distinctiveExperience='정말 특별한 새로운 콘텐츠라는 설명만 바꾸는 테스트';v.visual.anchor='배경에 다른 소품과 커튼의 무늬만 조금 바꾸는 테스트';
  v.intro={familyId:alternative.id,variantId:alternative.variants[0].id};
  const result=episodes.compareEpisodePlans(plan(v),[previous],false);
  assert.equal(result.decision,'needs_revision');assert.equal(result.matches[0].sameMainDesign,true);assert.equal(result.matches[0].sameIntroDesign,false);
  assert.equal(result.mediaSimilarityMeasured,false);assert.equal(result.policyApproval,false);
});

test('materially different main design still requires human review; numerical similarity is never a policy approval', () => {
  const v=input();v.main.sceneId='lake';v.main.intensity='moderate';v.main.camera='wide';v.visual.focus='landscape';v.visual.depth='panoramic';
  v.audio={...v.audio,surface:'water',perspective:'open',depth:'distant',dynamics:'slow-swells'};
  const result=episodes.compareEpisodePlans(plan(v),[plan(input(),otherId)],false);
  assert.equal(result.decision,'review_required');assert.equal(result.matches.length,0);assert.equal(result.policyApproval,false);
  assert.ok(result.reasonCodes.includes('human_editorial_review_required'));
});

test('comparison validates trusted history, caps the window and ignores claimed signatures', () => {
  const previous=plain(plan(input(),otherId));previous.signature='forged-distinct';
  const bad={...previous,id:'invalid-id'},old={...previous,version:'future-unsupported'};
  const result=episodes.compareEpisodePlans(plan(),[previous,bad,old],true);
  assert.equal(result.historyCount,1);assert.equal(result.invalidHistoryCount,2);assert.equal(result.historyTruncated,true);
  assert.equal(result.decision,'needs_revision');assert.ok(result.reasonCodes.includes('history_not_fully_comparable'));
  const many=episodes.compareEpisodePlans(plan(),Array(101).fill(previous),false);
  assert.equal(many.historyCount,100);assert.equal(many.historyTruncated,true);assert.ok(many.matches.length<=10);
  assert.ok(Buffer.byteLength(JSON.stringify(many))<16000);
  const empty=episodes.compareEpisodePlans(plan(),[],false);assert.equal(empty.decision,'review_required');
  assert.ok(empty.reasonCodes.includes('no_comparable_history'));assert.throws(()=>episodes.compareEpisodePlans({...plan(),version:'fake'},[],false));
});

test('catalog and parsed input snapshots cannot be mutated through caller-owned references', () => {
  const first=episodes.getEpisodeCatalog();first.sceneSurfaces.train.push('metal');first.families[0].variants[0].name='mutated';first.surfaces.glass='changed';
  const next=episodes.getEpisodeCatalog();assert.deepEqual(plain(next.sceneSurfaces.train),['glass']);assert.notEqual(next.families[0].variants[0].name,'mutated');assert.notEqual(next.surfaces.glass,'changed');
  const v=input(),p=plan(v);v.audio.detail='changed';assert.notEqual(p.input.audio.detail,'changed');
});

test('documented example remains a valid save request', () => {
 const value=JSON.parse(fs.readFileSync('docs/healing-rain/episode-input.example.json','utf8'));
 const parsed=episodes.parseSaveEpisode(value);assert.equal(parsed.input.intro.familyId,'cloud-bed');assert.equal(plan(parsed.input).version,episodes.EPISODE_VERSION);
});
