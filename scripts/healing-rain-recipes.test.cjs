const assert=require('node:assert/strict');
const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');
const compiled=ts.transpileModule(fs.readFileSync('src/lib/healing-rain/recipes.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{}};vm.runInNewContext(compiled,context);const {defaults,parseRecipe,compileRecipe,recipes}=context.exports;
for(const scene of recipes){for(const intensity of ['gentle','moderate','heavy','downpour']){
 const input=parseRecipe({...defaults,sceneId:scene.id,intensity,thunder:'distant'});const p=compileRecipe(input,'test','2026-10-12T00:00:00Z');
 assert.equal(p.generation.totalSeconds,36000);assert.equal(p.generation.freshAssets,true);assert.ok(p.layers.some(l=>l.includes('먼 천둥')));assert.ok(p.prompts.audio.length<500);assert.ok(p.prompts.audio.includes('No thunder'));assert.ok(p.prompts.image.includes(scene.visual));
}}
for(const bad of [{intensity:'__proto__'},{sceneId:'unknown'},{takes:10000},{hours:0},{variation:-1},{variation:1.2},{notes:'x'.repeat(601)},{title:''}])assert.throws(()=>parseRecipe({...defaults,...bad}));
assert.notEqual(compileRecipe(defaults,'a','now').prompts.image,compileRecipe({...defaults,variation:1},'b','now').prompts.image);
assert.notEqual(compileRecipe(defaults,'a','now').prompts.video,compileRecipe({...defaults,intensity:'gentle'},'b','now').prompts.video);
console.log('PASS: scene/intensity prompt consistency, thunder separation, input bounds and variation.');
const nature=compileRecipe({...defaults,sceneId:'night-nature',palette:'midnight'},'nature','now');
assert.equal(nature.sceneDirection.timeOfDay,'night');
assert.ok(nature.prompts.image.includes('Very low-key exposure'));
assert.ok(!nature.prompts.image.includes('bedding'));
assert.ok(!nature.prompts.image.includes('Set dressing: a folded'));
assert.ok(nature.prompts.video.includes('constant dark exposure'));
console.log('PASS: secluded night nature keeps outdoor details and stable low light.');

const train=compileRecipe(defaults,'train','now');
assert.ok(train.prompts.image.includes('overhead lights switched off'));
assert.ok(train.prompts.image.includes('faint distant rural lights'));
assert.equal(defaults.intensity,'downpour');
