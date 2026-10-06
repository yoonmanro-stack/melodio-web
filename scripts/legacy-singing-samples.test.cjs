const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const metadata = require('../src/data/legacyVocalSamples.json');
const official = require('../src/data/officialVocalCatalog.json');
const exportsVoices = {};
new Function('require','exports',ts.transpileModule(fs.readFileSync('src/data/vocalStyles.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name => {
  assert.ok(['./officialVocalCatalog.json','./legacyVocalSamples.json'].includes(name));
  return {default:name.includes('official')?official:metadata};
},exportsVoices);
const voices = exportsVoices.INITIAL_SYSTEM_VOICES;
const exportsStudio = {};
new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/voice/studio-selection.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exportsStudio);
test('every default studio voice now has a real non-TTS singing asset and a language',()=>{
  assert.equal(voices.length,99);assert.equal(new Set(voices.map(v=>v.id)).size,99);
  for(const voice of voices){
    assert.ok(voice.language,voice.id);assert.ok(voice.audioUrl,voice.id);
    assert.ok(fs.statSync('public'+voice.audioUrl).size>10000,voice.id);
    assert.doesNotMatch(voice.audioUrl,/\/vd[^/]*\.mp3$/i);
  }
  assert.deepEqual(voices.slice(0,official.length),official);
});
test('new singing previews follow all four studio language filters and opposite gender cannot leak',()=>{
  assert.equal(Object.keys(metadata).length,7);
  for(const id of Object.keys(metadata)){
    const voice=voices.find(v=>v.id===id);const expected=voice.language==='Korean'?'ko':'en';
    for(const language of ['ko','en','ja','fr'])for(const gender of ['female','male','duet','mixed']){
      assert.equal(exportsStudio.matchesStudioVoice(gender,voice,language),language===expected&&gender===voice.gender);
    }
    assert.equal(voice.sampleDurationSeconds,30);assert.equal(voice.previewStartSeconds,0);assert.equal(voice.previewStatus,'ready');
    assert.equal(voice.officialVoiceId,undefined);assert.equal(voice.customVoiceId,undefined);
  }
});
