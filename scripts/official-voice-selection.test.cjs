const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const catalog=require('../src/data/officialVocalCatalog.json'),provider=require('../worker/suno-provider');
const studioMod={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync('src/lib/voice/studio-selection.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(studioMod,studioMod.exports);
const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/voice/official-voice-selection.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(name=>name === '@/lib/voice/studio-selection' ? studioMod.exports : catalog,mod,mod.exports);
const resolve=mod.exports.resolveOfficialVoice;
const body=(id='melodio-selected-d')=>({activeVoice:{officialVoiceId:id,stylePrompt:'tampered',personaId:'untrusted'},vocalGender:'female',sourceMenu:'japan',lyricsPrompt:'[Verse]\nNew lyrics',sunoVersion:'V6'});
test('D/C/K keep separate canonical catalog identities without celebrity names',()=>{const seen=new Set();for(const l of ['d','c','k']){const v=resolve(body('melodio-selected-'+l));assert.equal(v.reviewStatus,'selected');assert.notEqual(v.stylePrompt,'tampered');seen.add(v.id);}assert.equal(seen.size,3);assert.equal(catalog.length,27);assert.ok(!/Bonnie|Tyler|문주란|보니|타일러/i.test(JSON.stringify(catalog)));});
test('invalid identities and incompatible composition fail closed',()=>{for(const change of [{vocalGender:'male'},{sourceMenu:'viral'},{lyricsPrompt:''},{sunoVersion:'V6_MINI'},{sunoVersion:'V6_WILD'},{customVoiceId:'other'}])assert.throws(()=>resolve({...body(),...change}));assert.throws(()=>resolve(body('unknown')));});
test('instrumental/random/duet never resolve official persona',()=>{for(const vocalGender of ['mixed','random','duet'])assert.equal(resolve({...body(),vocalGender}),null);assert.equal(resolve({...body(),isInstrumental:true}),null);});
test('legacy style requests remain unbound',()=>assert.equal(resolve({activeVoice:{id:'voice-anna-kim'}}),null));
test('style persona stays distinct from custom voice persona in request',()=>{const options={style:'female vocals, soul',lyrics:'Hello',personaId:'persona_test_123',model:'V6'};assert.equal(provider.buildKieSunoRequest({...options,personaModel:'style_persona'}).input.persona_model,'style_persona');assert.equal(provider.buildKieSunoRequest(options).input.persona_model,'voice_persona');assert.throws(()=>provider.buildKieSunoRequest({...options,lyrics:''}));assert.throws(()=>provider.buildKieSunoRequest({...options,personaModel:'untrusted'}));assert.equal(provider.buildKieSunoRequest({...options,instrumental:true}).input.persona_id,undefined);});
test('provider identities are absent from public catalog and source audio exists',()=>{for(const v of catalog){assert.equal(v.personaId,undefined);assert.equal(v.personaModel,undefined);assert.ok(fs.existsSync('public'+v.audioUrl));}});

test('all three studio source menus resolve official selections',()=>{for(const sourceMenu of ['style-library','preset-studio','japan'])assert.equal(resolve({...body(),sourceMenu}).id,'melodio-selected-d');});

test('declared language is checked against canonical sample language, not browser metadata',()=>{
 for(const sourceMenu of ['style-library','preset-studio']){
  assert.equal(resolve({...body(),sourceMenu,lyricsLanguage:'ko'}).id,'melodio-selected-d');
  assert.equal(resolve({...body(),sourceMenu,lyricsLanguage:'ko-en'}).id,'melodio-selected-d');
  assert.throws(()=>resolve({...body(),sourceMenu,lyricsLanguage:'en',activeVoice:{officialVoiceId:'melodio-selected-d',language:'en'}}), /가사 언어/);
 }
 assert.equal(resolve(body()).id,'melodio-selected-d');
});
