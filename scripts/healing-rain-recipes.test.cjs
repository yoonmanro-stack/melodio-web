const assert=require('node:assert/strict');
const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');
const direction=require('../shared/healing-rain/direction');
const {buildGenerationSpec}=require('../worker/healing-rain-plan');
const humanOrAnimalSounds=/\b(?:voices?|speech|whispers?|whispering|chants?|chanting|crowds?|murmurs?|murmuring|birds?|birdsong|frogs?|footsteps?|vocals?|singing|chatter|roars?|roaring|growls?|growling|howls?|howling|barking)\b/i;
const surfaces={train:/train window/i,tent:/tent fabric/i,hanok:/clay roof tiles/i,cabin:/cabin glass/i,'night-nature':/leaves, wet stone and stream/i,'quiet-park':/leaves and stone/i,'mountain-temple':/clay roof tiles/i,pond:/still pond/i,lake:/lake/i,'highland-village':/metal roofs/i};
const compiled=ts.transpileModule(fs.readFileSync('src/lib/healing-rain/recipes.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},require(name){assert.equal(name,'../../../shared/healing-rain/direction');return direction;}};
vm.runInNewContext(compiled,context);const {defaults,parseRecipe,compileRecipe,recipes}=context.exports;
for(const scene of recipes)for(const intensity of ['gentle','moderate','heavy','downpour']){
 const input=parseRecipe({...defaults,sceneId:scene.id,intensity,thunder:'distant'});const p=compileRecipe(input,'test','2026-10-12T00:00:00Z');const canonical=direction.compileDirection(p.direction,input);
 assert.equal(p.generation.totalSeconds,36000);assert.equal(p.generation.freshAssets,true);assert.equal(p.schemaVersion,1);assert.equal(p.recipeVersion,1);
 assert.ok(p.layers.some(l=>l.includes('먼 천둥')));assert.ok(p.prompts.audio.length<=500);assert.ok(p.prompts.audio.includes('No thunder'));assert.doesNotMatch(p.prompts.audio,humanOrAnimalSounds);
 assert.match(p.prompts.audio,surfaces[scene.id]);assert.match(p.prompts.audio,/\bOnly\b.*\brain\b.*\bwater\b/);assert.match(p.prompts.audio,/No music/);
 if(scene.id==='mountain-temple')assert.doesNotMatch(p.prompts.audio,/temple/i);
 if(intensity==='downpour'){assert.match(p.prompts.audio,/dense/i);assert.match(p.prompts.audio,/impacts/i);assert.doesNotMatch(p.prompts.audio,/rushing texture/i);}
 assert.equal(p.prompts.image,canonical.image);assert.equal(p.prompts.video,canonical.video);assert.equal(p.generation.videoSeconds,10);assert.equal(p.generation.sourceVideoSeconds,11);assert.equal(p.generation.videoCrossfadeSeconds,1);
 assert.ok(Buffer.byteLength(JSON.stringify(p),'utf8')<24000);
}
// Check complete provider prompts, including the real worker's bounded variations.
for(const intensity of ['gentle','moderate','heavy','downpour']){
 const p=compileRecipe({...defaults,intensity},'test','2026-10-13T00:00:00Z');
 const spec=buildGenerationSpec(p,'33333333-3333-4333-8333-333333333333');
 assert.equal(spec.audio.length,6);assert.equal(new Set(spec.audio).size,6);
 for(const audio of spec.audio){
  assert.ok(audio.length<=450,`${intensity} provider audio length ${audio.length}`);
  assert.ok(audio.startsWith(`${p.prompts.audio} `));assert.ok(audio.length>p.prompts.audio.length);
  assert.doesNotMatch(audio,humanOrAnimalSounds);assert.match(audio,/low rail rumble/i);assert.match(audio,surfaces.train);assert.ok(audio.includes('No thunder'));
 }
}
for(const bad of [{intensity:'__proto__'},{sceneId:'unknown'},{takes:10000},{hours:0},{variation:-1},{variation:1.2},{notes:'x'.repeat(601)},{title:''}])assert.throws(()=>parseRecipe({...defaults,...bad}));
assert.notEqual(compileRecipe(defaults,'a','now').prompts.image,compileRecipe({...defaults,variation:1},'b','now').prompts.image);
assert.notEqual(compileRecipe(defaults,'a','now').prompts.video,compileRecipe({...defaults,intensity:'gentle'},'b','now').prompts.video);
const train=compileRecipe(defaults,'train','now');assert.equal(train.direction.fixed.people,'one-sleeping-adult-woman');assert.ok(train.direction.motion.some(x=>x.type==='blanket-breathing'));assert.ok(train.direction.motion.some(x=>x.type==='background-translation'));assert.equal(defaults.intensity,'downpour');
for(const sceneId of ['pond','lake','quiet-park','night-nature','mountain-temple','highland-village']){const p=compileRecipe({...defaults,sceneId},sceneId,'now');assert.equal(p.direction.fixed.people,'none');assert.equal(p.direction.motion.some(x=>x.type==='blanket-breathing'),false);}
for(const scene of recipes){const p=compileRecipe({...defaults,sceneId:scene.id,title:'한'.repeat(100),notes:'소품 질감 '.repeat(80)},'00000000-0000-4000-8000-000000000000','2026-10-13T00:00:00.000Z');assert.ok(Buffer.byteLength(JSON.stringify(p),'utf8')<24000,scene.id);}
console.log('PASS: 40 scene/intensity plans preserve direction and rain surfaces without human/animal sound descriptors; all 24 train provider prompts fit 450 characters; duration and database budgets pass.');
