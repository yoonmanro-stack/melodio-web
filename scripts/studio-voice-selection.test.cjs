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
