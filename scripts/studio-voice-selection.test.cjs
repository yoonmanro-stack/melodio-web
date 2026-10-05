const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module','exports',ts.transpileModule(fs.readFileSync('src/lib/voice/studio-selection.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const {studioVoiceFields, suppressIneligibleVoice} = mod.exports;
const voice = {gender:'female',stylePrompt:'clear soprano',customVoiceId:'registered'};
test('matching solo preserves registered identity',()=> assert.equal(studioVoiceFields('female',voice).activeVoice,voice));
test('random, duet and opposite gender never inherit saved voice',()=> {
 for (const gender of ['mixed','duet','male']) {
  const result = studioVoiceFields(gender,voice);
  assert.equal(result.activeVoice,null);
  assert.equal(result.voicePrompt,undefined);
  assert.equal(result.vdCode,undefined);
 }
});
test('server removes all identity paths even on crafted incompatible requests',()=> {
 for (const mode of ['mixed','random','duet','instrumental']) {
  const body = {vocalGender:mode,isInstrumental:mode==='instrumental',activeVoice:voice,customVoiceId:'registered',voicePrompt:'stale',vdCode:'VD-1004',stylePrompt:'jazz'};
  suppressIneligibleVoice(body);
  for(const key of ['activeVoice','customVoiceId','voicePrompt','vdCode']) assert.equal(key in body,false);
  assert.equal(body.stylePrompt,'jazz');
 }
});
test('automatic clears selection, returning to female can reuse retained voice',()=> {
 assert.equal(studioVoiceFields('female',null).activeVoice,null);
 studioVoiceFields('duet',voice);
 assert.equal(studioVoiceFields('female',voice).activeVoice,voice);
});

const { matchesStudioVoice, matchesStudioLanguage, studioLanguageLabel } = mod.exports;
test('all four languages and both genders filter independently',()=>{
 for(const language of ['ko','en','ja','fr']) for(const gender of ['female','male']) {
  const selected={gender,language,stylePrompt:'original timbre'};
  for(const requested of ['ko','en','ja','fr']) for(const requestedGender of ['female','male','duet','mixed']){
   const fields=studioVoiceFields(requestedGender,selected,requested);
   const matches=language===requested && gender===requestedGender;
   assert.equal(fields.activeVoice,matches?selected:null);
   assert.equal(fields.voicePrompt,matches?'original timbre':undefined);
   assert.equal(fields.vdCode,undefined);
   assert.equal(fields.lyricsLanguage,requested);
  }
 }
});
test('legacy language names normalize and bilingual choices keep their sample language',()=>{
 for(const [name,code] of [['Korean','ko'],['English','en'],['Japanese','ja'],['French','fr']]){
  assert.ok(matchesStudioLanguage(name,code));
  assert.ok(matchesStudioVoice('female',{gender:'female',language:name},code));
 }
 assert.ok(matchesStudioLanguage('ko','ko-en'));
 assert.ok(matchesStudioLanguage('English','ja-en'));
 assert.ok(!matchesStudioLanguage('fr','ja-en'));
 assert.equal(studioLanguageLabel('ko-en'),'한국어 + 영어');
 assert.equal(studioLanguageLabel('French'),'프랑스어');
 assert.equal(studioLanguageLabel(), '언어 미지정');
});
test('unknown language is not silently assigned Korean or another requested language',()=>{
 assert.equal(matchesStudioLanguage(undefined,'en'),false);
 assert.equal(matchesStudioLanguage('unknown','ko'),false);
 assert.equal(matchesStudioLanguage('ko','es'),false);
 assert.equal(matchesStudioLanguage(undefined),true);
});
test('changing language suppresses old voice while preserving saved identity for returning',()=>{
 const saved={...voice,language:'Korean'};
 assert.equal(studioVoiceFields('female',saved,'en').activeVoice,null);
 assert.equal(studioVoiceFields('female',saved,'ko').activeVoice,saved);
 assert.deepEqual(saved,{...voice,language:'Korean'});
});
