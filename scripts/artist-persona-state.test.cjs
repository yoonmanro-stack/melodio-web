const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = process.cwd();
const loaded = new Map();
function readTs(relative) {
  const file = path.join(root, relative);
  if (loaded.has(file)) return loaded.get(file).exports;
  const mod = new Module(file);
  loaded.set(file, mod);
  mod.filename = file;
  mod.require = value => value === './artist-form' ? readTs('src/components/artists/artist-form.ts') : require(value);
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
  return mod.exports;
}
const { personaIdentity, personaSaveInput, orderedPersonaArtists, reconcilePersonaMutation } = readTs('src/components/artists/artist-persona-state.ts');
const artist = { schemaVersion:1, id:'memory-artist', userId:'memory-owner', name:'기억', tagline:'따뜻한 팝', description:'설명', genres:['Pop'], personality:'차분함', backstory:'이야기', speakingStyle:'담담함', visualDirection:'검은 머리의 정면 사진', voice:{kind:'official', referenceId:'memory-voice', name:'목소리', gender:'female', language:'ko'}, portrait:{assetId:'memory-portrait', mimeType:'image/jpeg', fileName:'portrait.jpg'}, checks:{voiceAuditioned:true, portraitReviewed:true, identityReviewed:true}, status:'ready', revision:8, createdAt:'2026-10-05T00:00:00Z', updatedAt:'2026-10-05T00:00:00Z'};
const identity = {...personaIdentity(artist), personality:'솔직함', genresText:'Pop, R&B'};
const input = personaSaveInput(artist, identity);
const receipt = {kind:'save', artistId:artist.id, expectedRevision:8, input};
const saved = {...artist, ...input, voice:artist.voice, revision:9};
test('persona save changes identity while preserving reviewed vocal and visual references', () => {
  assert.equal(input.status, 'draft');
  assert.deepEqual(input.voice, {kind:'official', referenceId:'memory-voice'});
  assert.deepEqual(input.portrait, artist.portrait);
  assert.equal(input.visualDirection, artist.visualDirection);
  assert.deepEqual(input.checks, {voiceAuditioned:true, portraitReviewed:true, identityReviewed:false});
  assert.deepEqual(input.genres, ['Pop','R&B']);
  assert.equal(artist.status, 'ready');
  assert.equal(artist.personality, '차분함');
});
test('saved artist selection prioritizes ready profiles without mutating the server list', () => {
  const draft = {...artist,id:'draft',status:'draft',updatedAt:'2026-10-06T00:00:00Z'};
  const archive = {...artist,id:'archive',status:'archived'};
  const list = [archive,draft,artist];
  assert.deepEqual(orderedPersonaArtists(list).map(row=>row.id), ['memory-artist','draft','archive']);
  assert.deepEqual(list.map(row=>row.id), ['archive','draft','memory-artist']);
});
test('lost save reply is acknowledged only when identity and preserved binding/check state match', () => {
  assert.equal(reconcilePersonaMutation(receipt, saved), 'applied');
  assert.equal(reconcilePersonaMutation(receipt, artist), 'not-applied');
  for(const changed of [
    {...saved, voice:{...artist.voice,referenceId:'different'}},
    {...saved, portrait:{...artist.portrait,assetId:'different'}},
    {...saved, visualDirection:'다른 방향'},
    {...saved, status:'ready'},
    {...saved, checks:{...saved.checks,identityReviewed:true}},
    {...saved, id:'different'},
    {...saved, personality:'다른 성격'},
  ]) assert.equal(reconcilePersonaMutation(receipt, changed), 'changed');
});
test('archive acknowledgement requires the target artist and a newer archived revision', () => {
  const archiveReceipt = {kind:'archive',artistId:artist.id,expectedRevision:8};
  assert.equal(reconcilePersonaMutation(archiveReceipt,{...artist,status:'archived',revision:9}), 'applied');
  assert.equal(reconcilePersonaMutation(archiveReceipt,artist), 'not-applied');
  assert.equal(reconcilePersonaMutation(archiveReceipt,{...artist,id:'other',status:'archived',revision:9}), 'changed');
});
